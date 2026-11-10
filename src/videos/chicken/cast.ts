// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so villagers in the same group share canvases.
// Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Chickens are
// smaller billboards drawn in the same 600 x 1000 design space (toon.ts drawHen / drawRooster / drawChick).
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, farmer, drawHen, drawRooster, drawChick, fxNest, fxPot, fxBasket, fxNote, fxBurst, fxBlob, fxShadow, fxContact,
  Outfit, Expr, FrontOpts, SideOpts,
} from "./toon";
import {
  FPS, D0, SHOTS, G1_AT, G2_AT, G3_AT, NEST2, NEST3, POT_AT, BASKET_AT, GIFT_F, COOK_F, HATCH_F, LAY_F, GROW_F,
  flockAt, eggsAt, V3, smooth, clamp01,
} from "./story";
import { LIGHTS } from "./lights";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
/** head-shape seed: 7 shapes, so villagers standing together still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** one chicken drawing in the 600 x 1000 design space, scaled to bird size (hen ~0.55 m, rooster ~0.65 m, chick ~0.25 m).
 *  The bird card is a yaw billboard like a person; `mirror` faces it the other way. `peck` is quantised so the
 *  canvas cache stays small. */
const BIRD_SCALE = { hen: 0.26, rooster: 0.3, chick: 0.13 } as const;
type BirdKind = keyof typeof BIRD_SCALE;
const bird = (cam: CamInfo, kind: BirdKind, i: number, x: number, y: number, z: number, t: number, mirror = false): Place => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 0.3, z));
  const [w, h, k] = tier(d);
  const light = light2D(cam, mirror);
  // peck cycle: head dips about once a second, out of phase per bird; quantised to 0 / 0.5 / 1
  const ph = (t * 0.9 + hh(i, 21)) % 1;
  const peck = kind === "chick" ? 0 : ph < 0.18 ? q(Math.sin((ph / 0.18) * Math.PI), 2) : 0;
  const key = `B|${kind}|${i % 5}|${q(light)}|${peck}`;
  const draw = kind === "hen" ? (p: Pen) => drawHen(p, i + 1, light, peck)
    : kind === "rooster" ? (p: Pen) => drawRooster(p, i + 1, light, peck)
    : (p: Pen) => drawChick(p, i + 1, light);
  return { key, x, y, z, scale: BIRD_SCALE[kind], mirror, draw, size: [w, h, k], roll: peck > 0 ? 0.06 * peck : 0 };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- the three groups ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };
type Group = 1 | 2 | 3;
const GROUP_AT: Record<Group, V3> = { 1: G1_AT, 2: G2_AT, 3: G3_AT };
/** five villagers per group, standing in a loose arc around their yard centre (offsets seeded, stable per person) */
const SPOTS: Record<Group, [number, number][]> = {
  1: [[-1.8, 0.4], [-0.9, -0.9], [0.1, 0.6], [1.1, -0.7], [2.0, 0.5]],
  2: [[-2.0, 0.5], [-1.0, -0.8], [0.0, 0.7], [1.0, -0.6], [2.1, 0.4]],
  3: [[-2.1, 0.5], [-1.1, -0.9], [-0.1, 0.6], [1.0, -0.7], [2.0, 0.6]],
};
const GROUP_I0: Record<Group, number> = { 1: 10, 2: 30, 3: 50 };

/** expression per group per shot. Reactions land 0-3 f before their word (LEAD). */
const exprGroup = (id: number, t: number, f: number, g: Group, i: number): { expr: Expr; look: number; wave?: number } => {
  switch (id) {
    case 2: return { expr: i % 2 ? "shock" : "nervous", look: 0 }; // wealth taken: "Gone."
    case 3:
      if (f < 417 - 2) return { expr: "pained", look: 0 }; // hungry, slumped
      return { expr: i % 3 === 0 ? "laugh" : "grin", look: 0 }; // the gift: "he gives each person one chicken"
    case 4: return { expr: i % 2 ? "laugh" : "grin", look: 0 }; // best dinner in three days
    case 5: return { expr: i % 3 === 0 ? "smile" : "smile_closed", look: 0 }; // keeping chickens alive
    case 6: return g === 3 ? { expr: "grin", look: 1 } : { expr: "smile", look: -1 }; // the deal
    case 7: return { expr: "grin", look: 0 };
    case 8: return { expr: "laugh", look: 0 }; // chicks hatch
    case 9: return { expr: "grin", look: 0 }; // flock grows
    case 10: return i === 2 ? { expr: "stern", look: 0, wave: q(Math.sin(t * 9), 30) } : { expr: "nervous", look: 0 }; // complain
    case 11: return { expr: i % 2 ? "relief" : "smile", look: 0 }; // comfortable
    case 12: return g === 1 ? { expr: "neutral", look: 0 } : { expr: "grin", look: 0 }; // hired, working
    case 13: return g === 1 ? { expr: "pained", look: 0 } : g === 2 ? { expr: "smile", look: 0 } : { expr: "grin", look: 0 };
    default: return { expr: "neutral", look: 0 };
  }
};

/** one group of villagers standing in their yard (front view toward the camera, or side view while walking). */
const group = (id: number, t: number, f: number, cam: CamInfo, out: Stage, g: Group, opts: { walkTo?: [number, number]; sit?: boolean; shiftX?: number } = {}) => {
  const [cx, , cz] = GROUP_AT[g];
  const s = SHOTS[id - 1];
  SPOTS[g].forEach(([dx, dz], k) => {
    const i = GROUP_I0[g] + k;
    let x = cx + dx + (opts.shiftX ?? 0), z = cz + dz;
    let mode: "stand" | "march" | "sit" = opts.sit ? "sit" : "stand";
    let phase = 0;
    if (opts.walkTo) {
      // Group 3 walks from its yard toward Group 2 during shot 6 (f 1011-1130), then stands at the meeting point
      const u = smooth((f - 1009) / 120);
      x = cx + dx + (opts.walkTo[0] - cx) * u;
      z = cz + dz + (opts.walkTo[1] - cz) * u;
      mode = u < 1 ? "march" : "stand";
      phase = q(((f / 30) * 0.9 + i * 0.13) % 1, 120);
    }
    const { expr, look, wave } = exprGroup(id, t, f, g, k);
    const view = mode === "march" ? viewOf(cam, x, z, opts.walkTo![0] - cx, opts.walkTo![1] - cz) : { side: false, mirror: false, fs: 0 };
    const blink = lidAt(t, i);
    const fo: FrontOpts = { mode, expr, look, blink, wave, phase };
    const so: SideOpts = { mode: "march", phase, expr, blink, stomp: 0.8, stride: view.side ? view.fs : 0.8 };
    out.places.push(person(cam, { i, o: farmer(g, k), okey: `farm${g}${k % 2}` }, x, D0, z, view, fo, so));
    blob(out, x, D0, z);
  });
};

/** the flock of one group at frame f: birds scattered around the yard centre, wandering a little with time. */
const flock = (f: number, t: number, cam: CamInfo, out: Stage, g: Group, centre?: V3) => {
  const fl = flockAt(g, f);
  if (fl.hens + fl.roosters + fl.chicks === 0) return;
  const [cx, , cz] = centre ?? GROUP_AT[g];
  let n = 0;
  const spots: { kind: BirdKind; dx: number; dz: number }[] = [];
  // hens first (one of them near the nest), then roosters, then chicks clustered by the nest
  for (let k = 0; k < fl.hens; k++) spots.push({ kind: "hen", dx: (hh(k, 1) - 0.5) * 3.4, dz: (hh(k, 2) - 0.5) * 2.6 });
  for (let k = 0; k < fl.roosters; k++) spots.push({ kind: "rooster", dx: (hh(40 + k, 1) - 0.5) * 3.0, dz: (hh(40 + k, 2) - 0.5) * 2.4 });
  for (let k = 0; k < fl.chicks; k++) spots.push({ kind: "chick", dx: (hh(80 + k, 1) - 0.5) * 1.6, dz: (hh(80 + k, 2) - 0.5) * 1.2 });
  for (const sp of spots) {
    // slow wander: a bird drifts ~0.5 m side to side over ~6 s
    const wx = 0.5 * Math.sin(t * 0.9 + n * 1.7), wz = 0.35 * Math.cos(t * 0.7 + n * 2.3);
    const x = cx + sp.dx + wx, z = cz + sp.dz + wz;
    const mirror = Math.sin(t * 0.5 + n * 2.9) > 0;
    out.places.push(bird(cam, sp.kind, 100 + g * 20 + n, x, D0, z, t, mirror));
    blob(out, x, D0, z, sp.kind === "chick" ? 0.3 : 0.55, 0.9);
    n++;
  }
};

/** a nest card (flat on the ground) with the eggs due at this frame */
const nest = (out: Stage, at: V3, group: 2 | 3, f: number) => {
  const eggs = eggsAt(group, f);
  if (eggs === 0) return;
  out.fx.push({ key: `nest${group}|${eggs}`, cw: 600, ch: 400, draw: (p) => fxNest(p, eggs), x: at[0], y: 0.03, z: at[2], w: 1.3, h: 0.87, flat: true });
};

/** everything with a face in shot `id` at time t (t in seconds, f in frames) */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  const f = Math.round(t * FPS);
  LNAME = s.light;
  findSun(cam, SUN);
  // ---- hook (shot 1): one white hen centre frame, villagers of all three groups behind it ----
  if (id === 1) {
    out.places.push(bird(cam, "hen", 1, 0, D0, -1.2, t, false));
    blob(out, 0, D0, -1.2, 0.55, 1);
    for (const g of [1, 2, 3] as Group[]) group(id, t, f, cam, out, g);
    return out;
  }
  // ---- wealth taken (shot 2): all three groups stare at their empty yards; no chickens anywhere ----
  if (id === 2) {
    for (const g of [1, 2, 3] as Group[]) group(id, t, f, cam, out, g);
    return out;
  }
  // ---- poor + hungry, then the gift (shot 3): chickens appear one frame before "chicken" (f 483) ----
  if (id === 3) {
    group(id, t, f, cam, out, 1);
    for (const g of [2, 3] as Group[]) group(id, t, f, cam, out, g);
    if (f >= 481) { // the gifted chickens land IN FRONT of each group, so the camera sees them
      flock(f, t, cam, out, 1, [-16, 0, -3.5]); flock(f, t, cam, out, 2, [0, 0, -1.5]); flock(f, t, cam, out, 3, [16, 0, -3.5]); }
    return out;
  }
  // ---- Group 1 cooks (shot 4, golden): red group around the pot; the hen is gone after f 559 ----
  if (id === 4) {
    group(id, t, f, cam, out, 1);
    if (f < COOK_F) flock(f, t, cam, out, 1);
    out.fx.push({ key: "pot", cw: 500, ch: 500, draw: (p) => fxPot(p), x: POT_AT[0], y: 0.5, z: POT_AT[2], w: 1.0, h: 1.0 });
    return out;
  }
  // ---- Group 2 keeps chickens (shot 5): green group + hen + rooster + nest with eggs ----
  if (id === 5) {
    group(id, t, f, cam, out, 2);
    flock(f, t, cam, out, 2);
    nest(out, NEST2, 2, f);
    return out;
  }
  // ---- Group 3 walks over (shot 6): gold group walks to green's yard; both flocks visible at the meeting ----
  if (id === 6) {
    group(id, t, f, cam, out, 2);
    group(id, t, f, cam, out, 3, { walkTo: [6.5, -4] });
    flock(f, t, cam, out, 2);
    flock(f, t, cam, out, 3);
    nest(out, NEST2, 2, f);
    return out;
  }
  // ---- eggs vs chickens (shot 7): green yard with eggs, then gold yard with the pooled flock ----
  if (id === 7) {
    group(id, t, f, cam, out, 2);
    group(id, t, f, cam, out, 3);
    flock(f, t, cam, out, 2);
    flock(f, t, cam, out, 3);
    nest(out, NEST2, 2, f);
    nest(out, NEST3, 3, f);
    return out;
  }
  // ---- chicks hatch (shot 8): nest CU with chicks popping out; hens watch ----
  if (id === 8) {
    group(id, t, f, cam, out, 2);
    group(id, t, f, cam, out, 3);
    flock(f, t, cam, out, 2);
    flock(f, t, cam, out, 3);
    nest(out, NEST2, 2, f);
    nest(out, NEST3, 3, f);
    // hatching chicks cluster tight around Group 2's nest, growing in over f 1332-1362
    const u = clamp01((f - HATCH_F) / 30);
    for (let k = 0; k < Math.round(4 * u); k++) {
      const x = NEST2[0] + (hh(k, 5) - 0.5) * 1.1, z = NEST2[2] + (hh(k, 6) - 0.5) * 0.9;
      out.places.push(bird(cam, "chick", 200 + k, x, D0, z, t, k % 2 === 0));
      blob(out, x, D0, z, 0.3, 0.9);
    }
    return out;
  }
  // ---- flock grows (shot 9): gold yard fills with chickens ----
  if (id === 9) {
    group(id, t, f, cam, out, 3);
    flock(f, t, cam, out, 3);
    nest(out, NEST3, 3, f);
    return out;
  }
  // ---- Group 1 complains (shot 10): red group, empty yard, one villager waving his arms ----
  if (id === 10) {
    group(id, t, f, cam, out, 1, { sit: f < 1650 - 2 });
    return out;
  }
  // ---- Group 2 comfortable (shot 11, golden): green group relaxed, egg basket beside them ----
  if (id === 11) {
    group(id, t, f, cam, out, 2);
    flock(f, t, cam, out, 2);
    nest(out, NEST2, 2, f);
    out.fx.push({ key: "basket", cw: 500, ch: 500, draw: (p) => fxBasket(p, 5), x: BASKET_AT[0], y: 0.5, z: BASKET_AT[2], w: 1.0, h: 1.0 });
    return out;
  }
  // ---- Group 3 hires Group 1 (shot 12): big gold flock; one red villager works among them ----
  if (id === 12) {
    group(id, t, f, cam, out, 3);
    flock(f, t, cam, out, 3);
    // the hired red villager (i 12) works in the gold yard from f 1966, carrying eggs in spirit: stands, neutral
    const i = 12;
    out.places.push(person(cam, { i, o: farmer(1, 0), okey: "farm10" }, 13.2, D0, -3.4, { side: false, mirror: false },
      { mode: "stand", expr: "neutral", blink: lidAt(t, i) }, {}));
    blob(out, 13.2, D0, -3.4);
    nest(out, NEST3, 3, f);
    return out;
  }
  // ---- final split (shot 13): all three yards at once — poor / middle / rich ----
  // presentational compact tableau: the groups step in (red -16 -> -6, gold 16 -> +6) so the three
  // colour blocks + the empty yard / eggs / big flock all read in one portrait frame
  group(id, t, f, cam, out, 1, { shiftX: 10 });
  group(id, t, f, cam, out, 2);
  group(id, t, f, cam, out, 3, { shiftX: -10 });
  flock(f, t, cam, out, 2, [0, 0, -1.5]);
  flock(f, t, cam, out, 3, [6, 0, -3.5]);
  nest(out, [1.5, 0, -1.5], 2, f);
  nest(out, [6.5, 0, -1.5], 3, f);
  out.fx.push({ key: "basket", cw: 500, ch: 500, draw: (p) => fxBasket(p, 5), x: 1.5, y: 0.5, z: -3, w: 1.0, h: 1.0 });
  return out;
};

export { FPS };
