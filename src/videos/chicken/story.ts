// Timeline of the chicken short: shots timed to the voice words (voice/words.json).
// "Why do the rich keep getting richer while the poor get poorer? One chicken explains it."
// 253 words, 75.984 s, TOTAL 2280 frames at 30 fps. Every visual reaction lands 0-3 frames
// before its word. Camera grammar from the bridge short: continuous slow push-ins, symmetric
// smootherstep glides 18-40 f, big reframes are cuts, no hand-held float.
export const FPS = 30;
export const TOTAL = 2280;
export const D0 = 0; // farm ground height (m)
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

// ---------------- farm layout (metres; ground y = 0, village street along x at z = -22) ----------------
// Three villager groups, each with a yard and a coop behind it. Group 1 red (left), Group 2 green (centre),
// Group 3 gold/blue (right). Houses face +z (toward the camera side); fields flank east/west and front.
export const G1_AT: V3 = [-16, 0, -6];
export const G2_AT: V3 = [0, 0, -4];
export const G3_AT: V3 = [16, 0, -6];
export const COOP1: V3 = [-19.5, 0, -12.5];
export const COOP2: V3 = [-3.5, 0, -11.5];
export const COOP3: V3 = [19.5, 0, -12.5];
export const NEST2: V3 = [2.2, 0, -1.8];
export const NEST3: V3 = [13.8, 0, -1.8];
export const POT_AT: V3 = [-16, 0, -4.2]; // Group 1 cooking pot
export const BASKET_AT: V3 = [1.8, 0, -3.2]; // Group 2 egg basket

// ---------------- flock growth (story time t in seconds; the gift lands at f 444-496) ----------------
// Group 1 cooks its only hen the same night (gone from f ~560). Group 2 keeps 1 hen + 1 rooster.
// Group 3 pools with Group 2: chicks hatch at f 1332-1362, grow into layers, then the flock multiplies.
export const GIFT_F = 444;
export const COOK_F = 559; // "cook" (f 559) — the hen is in the pot from here
export const HATCH_F = 1332; // "first chicks hatch" (f 1332-1362)
export const LAY_F = 1427; // "those chicks are laying eggs" (f 1427)
export const GROW_F = 1494; // "over time, the third group raises more and more chickens" (f 1494-1555)
export type Flock = { hens: number; roosters: number; chicks: number };
export const flockAt = (group: 1 | 2 | 3, f: number): Flock => {
  if (f < GIFT_F) return { hens: 0, roosters: 0, chicks: 0 };
  if (group === 1) return { hens: f < COOK_F ? 1 : 0, roosters: 0, chicks: 0 };
  if (group === 2) return { hens: 1, roosters: 1, chicks: f >= HATCH_F && f < LAY_F ? 2 : 0 };
  // group 3: pooled flock — 1 hen + 1 rooster, then hatchlings, then layers, then a big flock
  if (f < HATCH_F) return { hens: 1, roosters: 1, chicks: 0 };
  if (f < LAY_F) return { hens: 1, roosters: 1, chicks: 4 };
  if (f < GROW_F) return { hens: 5, roosters: 1, chicks: 0 };
  const grown = Math.min(20, 6 + Math.floor((f - GROW_F) / 40));
  return { hens: grown, roosters: 2, chicks: 0 };
};
/** eggs visible in a nest at frame f (Group 2's hen lays from the gift on; Group 3's from the hatch) */
export const eggsAt = (group: 2 | 3, f: number) => {
  if (f < GIFT_F) return 0;
  if (group === 2) return f < HATCH_F ? 3 : 2;
  return f < HATCH_F ? 0 : f < LAY_F ? 4 : 3;
};

// ---------------- shots ----------------
// Word anchors (frames): hook 5-150 | wealth taken 163-324 | poor/hungry 336-403 | gift 417-496 |
// G1 cooks 512-602, last dinner 666-694 | G2 keeps alive 708-800, hen/rooster 818-937 |
// G3 idea 954-999, pooling deal 1011-1158 | eggs vs chickens 1174-1289 | hatch 1302-1362 |
// chicks laying 1378-1462 | flock grows 1477-1555 | G1 nothing/complain 1572-1729 |
// G2 comfortable 1747-1836 | G3 too many chickens 1854-1952 | hiring 1966-2055 |
// split poor/middle/rich 2072-2272.
export type Light = "day" | "golden";
export type ShotDef = { id: number; a: number; b: number; light: Light; tau: (t: number) => number };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 150, light: "day", tau: (t) => t },       // hook: one chicken explains it
  { id: 2, a: 150, b: 330, light: "day", tau: (t) => t },     // wealth taken: coins, houses, fields gone
  { id: 3, a: 330, b: 510, light: "day", tau: (t) => t },     // poor + hungry, then each person gets one chicken
  { id: 4, a: 510, b: 700, light: "golden", tau: (t) => t },  // Group 1 cooks its chicken that same night
  { id: 5, a: 700, b: 950, light: "day", tau: (t) => t },     // Group 2 keeps chickens alive: hen's eggs, rooster
  { id: 6, a: 950, b: 1160, light: "day", tau: (t) => t },    // Group 3 walks over: let's pool hens and roosters
  { id: 7, a: 1160, b: 1300, light: "day", tau: (t) => t },   // second group wanted eggs, third wanted chickens
  { id: 8, a: 1300, b: 1470, light: "day", tau: (t) => t },   // three weeks later: first chicks hatch
  { id: 9, a: 1470, b: 1570, light: "day", tau: (t) => t },   // months later: chicks laying; flock grows
  { id: 10, a: 1570, b: 1740, light: "day", tau: (t) => t },  // Group 1 has nothing left: they complain
  { id: 11, a: 1740, b: 1855, light: "golden", tau: (t) => t }, // Group 2 has enough eggs, lives comfortably
  { id: 12, a: 1855, b: 2070, light: "day", tau: (t) => t },  // Group 3 can't look after them all: hires Group 1
  { id: 13, a: 2070, b: TOTAL, light: "day", tau: (t) => t }, // final split: poor / middle class / rich
];
/** crossfades (frames) at place/time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 2: 8, 4: 8, 5: 8, 8: 8, 11: 8, 13: 8 };
export const FLASH_AT = 150;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
/** layers to draw at frame f: base shot, plus the next shot fading in during a crossfade */
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
/** reference camera ease: symmetric smootherstep (attack = release, ~10 f each on a 23 f move) */
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
/** push-in factor since f0: the subject grows ~rate per frame; `punch` raises it (with 8 f soft edges) for the first n frames */
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
/** dolly push: camera slides toward the look point by factor k */
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
/** zoom push (camera stays put): tan(fov/2) shrinks by k */
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });

// ---- framings (f -> camera); each pushes in from the frame its key starts ----
// shot 1 (hook): wide village 3/4 -> MS on the one white hen centre frame -> hen CU (punch on "chicken" f 122)
const S1a = (f: number) => dolly([9, 5.5, 20], [0, 1.2, -8], pushK(f, 0, 0.002), { fov: 46 });
const S1b = (f: number) => dolly([3.0, 1.5, 3.2], [0, 0.6, -1.2], pushK(f, 48, 0.0022), { fov: 40 });
const S1c = (f: number) => dolly([0.6, 0.5, 0.6], [0, 0.3, -1.2], pushK(f, 96, 0.002, 0.006, 30), { fov: 32 });
// shot 2 (wealth taken): high wide over the village, slow push; empty houses/fields
const S2a = (f: number) => zoom([12, 11, 18], [0, 1, -14], 44, pushK(f, 150, 0.0018));
// shot 3 (poor/hungry, then the gift): MS of hungry villagers -> chicken appears in front of them (punch on "chicken" f 483)
const S3a = (f: number) => dolly([-6, 1.7, 4], [-8, 1.1, -6], pushK(f, 330, 0.002), { fov: 40 });
const S3b = (f: number) => dolly([4.5, 2.2, 5.5], [0, 0.5, -3.5], pushK(f, 440, 0.002, 0.006, 30), { fov: 42 });
// shot 4 (Group 1 cooks, golden dusk): MS of the red group around the pot -> pot CU with steam
const S4a = (f: number) => dolly([-12.5, 1.8, 0.5], [-16, 1.0, -5], pushK(f, 510, 0.002), { fov: 40 });
const S4b = (f: number) => dolly([-14.6, 0.9, -1.2], [-16, 0.55, -4.2], pushK(f, 600, 0.0025), { fov: 36, roll: -0.03 });
// shot 5 (Group 2 keeps chickens): MS green group with hen + rooster -> nest CU (eggs, punch on "eggs" f 853)
const S5a = (f: number) => dolly([3.5, 1.6, 2], [0, 0.8, -4], pushK(f, 700, 0.002), { fov: 40 });
const S5b = (f: number) => dolly([3.2, 0.8, 0.6], [2.2, 0.3, -1.8], pushK(f, 800, 0.002, 0.006, 30), { fov: 34 });
// shot 6 (Group 3 walks over to Group 2): side view of the walk -> two-group meeting MS
const S6a = (f: number) => dolly([10, 1.8, 6], [8, 1.0, -5], pushK(f, 950, 0.002), { fov: 42 });
const S6b = (f: number) => dolly([6.5, 1.7, 3.5], [7, 1.0, -4], pushK(f, 1060, 0.002), { fov: 38 });
// shot 7 (eggs vs chickens): green yard with eggs -> gold yard with chickens (cut on "third group wanted chickens" f 1250)
const S7a = (f: number) => dolly([2.8, 1.3, 1.8], [1, 0.5, -3], pushK(f, 1160, 0.002), { fov: 38 });
const S7b = (f: number) => dolly([18.5, 1.5, 1.5], [16, 0.6, -5], pushK(f, 1246, 0.002), { fov: 38 });
// shot 8 (chicks hatch): nest CU, chicks popping out (punch on "hatch" f 1350)
const S8a = (f: number) => dolly([3.0, 0.9, 0.4], [2.2, 0.25, -1.8], pushK(f, 1300, 0.002, 0.005, 30), { fov: 32 });
// shot 9 (flock grows): wide of the gold yard filling with chickens -> closer on the growing flock
const S9a = (f: number) => dolly([20, 3.2, 6], [16, 0.8, -6], pushK(f, 1470, 0.002), { fov: 44 });
const S9b = (f: number) => dolly([18, 1.6, 2], [16, 0.6, -5], pushK(f, 1520, 0.002), { fov: 40 });
// shot 10 (Group 1 complains): MS of the red group, empty yard -> complaining villager CU (punch on "complain" f 1712)
const S10a = (f: number) => dolly([-12, 1.8, 0.5], [-16, 1.0, -6], pushK(f, 1570, 0.002), { fov: 40 });
const S10b = (f: number) => dolly([-14.2, 1.5, -1.5], [-16, 1.3, -5.5], pushK(f, 1680, 0.002, 0.006, 30), { fov: 36 });
// shot 11 (Group 2 comfortable, golden): MS green group relaxed with the egg basket
const S11a = (f: number) => dolly([3.8, 1.7, 2.5], [0, 1.0, -4], pushK(f, 1740, 0.0018), { fov: 40 });
// shot 12 (Group 3 hires Group 1): wide gold yard, red villager working among the flock -> MS of the handover (eggs for work)
const S12a = (f: number) => dolly([19, 2.6, 5], [14, 0.9, -5], pushK(f, 1855, 0.002), { fov: 44 });
const S12b = (f: number) => dolly([15.5, 1.5, 1.0], [13, 0.8, -4], pushK(f, 1975, 0.002), { fov: 38 });
// shot 13 (final split): high wide crane-out over all three yards — poor (empty, red) / middle (eggs, green) / rich (flock, gold)
const S13a = (f: number) => zoom([0, 10, 26], [0, 0.7, -5], 48, pushK(f, 2070, 0.0012));
const S13b = (f: number) => zoom([0, 13, 31], [0, 0.7, -5], 50, pushK(f, 2180, 0.001));

const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: S1a },
    { f: 48, dur: 30, s: S1b }, // centred on 63 ("while the poor get poorer")
    { f: 96, dur: 30, s: S1c }, // centred on 111 ("one chicken"), punch on "chicken" f 122
  ],
  2: [{ f: 150, s: S2a }],
  3: [
    { f: 330, s: S3a }, // cut on "Everyone is poor"
    { f: 440, dur: 28, s: S3b }, // centred on 454 ("he gives each person one chicken")
  ],
  4: [
    { f: 510, s: S4a }, // cut on "The first group"
    { f: 600, dur: 28, s: S4b }, // centred on 614 ("Best dinner in three days")
  ],
  5: [
    { f: 700, s: S5a }, // cut on "The second group"
    { f: 800, dur: 30, s: S5b }, // centred on 815 ("If it's a hen"), punch on "eggs" f 853
  ],
  6: [
    { f: 950, s: S6a }, // cut on "The third group"
    { f: 1060, dur: 30, s: S6b }, // centred on 1075 ("let's put our hens and roosters together")
  ],
  7: [
    { f: 1160, s: S7a }, // cut on "You see?"
    { f: 1246, cut: true, s: S7b }, // cut on "the third group wanted chickens" f 1250
  ],
  8: [{ f: 1300, s: S8a }], // cut on "Three weeks later"
  9: [
    { f: 1470, s: S9a }, // cut on "Over time"
    { f: 1520, dur: 26, s: S9b },
  ],
  10: [
    { f: 1570, s: S10a }, // cut on "Meanwhile"
    { f: 1680, dur: 28, s: S10b }, // centred on 1694 ("they complain")
  ],
  11: [{ f: 1740, s: S11a }], // cut on "The second group has enough eggs"
  12: [
    { f: 1855, s: S12a }, // cut on "But the third group now has so many chickens"
    { f: 1975, dur: 30, s: S12b }, // centred on 1990 ("offer them work paid in eggs")
  ],
  13: [
    { f: 2070, s: S13a }, // cut on "And just like that"
    { f: 2180, dur: 30, s: S13b }, // slow crane-out to the end
  ],
};

// no impact kicks in this story (no collapse); kept as an empty table for the camera code
const KICKS: [number, number][] = [];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};
/** frame at which the current key's move has finished (for picking billboard views per key, not per frame) */
export const keyEnd = (id: number, f: number) => {
  let e = 0;
  for (const k of CAMS[id]) if (f >= k.f) e = k.f + (k.cut ? 0 : k.dur ?? 24);
  return Math.max(f, e);
};

// ---------------- lens: depth of field + foreground framing ----------------
/** Lens blur per shot (thin lens). cInf = blur-disc radius in px at 1080x1920 for things at infinity; 0 = all sharp.
 *  DOF on the close-ups (hen CU, nest CU, pot CU, faces), wides stay sharp. */
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 0 }, // hook wide
  { f: 48, dur: 30, cInf: 10, focus: () => [0, 0.6, -1.2] }, // MS on the hen
  { f: 96, dur: 30, cInf: 14, focus: () => [0, 0.3, -1.2] }, // hen CU
  { f: 150, cInf: 0 }, // wealth-taken wide
  { f: 330, cInf: 8, focus: () => [-8, 1.1, -6] }, // hungry villagers MS
  { f: 440, dur: 28, cInf: 12, focus: () => [0, 0.5, -3.5] }, // the gifted chicken
  { f: 510, cInf: 10, focus: () => [-16, 1.0, -5] }, // Group 1 around the pot
  { f: 600, dur: 28, cInf: 12, focus: () => [-16, 0.55, -4.2] }, // pot CU
  { f: 700, cInf: 10, focus: () => [0, 0.8, -4] }, // Group 2 with hen + rooster
  { f: 800, dur: 30, cInf: 13, focus: () => [2.2, 0.35, -1.8] }, // nest CU
  { f: 950, cInf: 0 }, // the walk, side view
  { f: 1060, dur: 30, cInf: 8, focus: () => [7, 1.0, -4] }, // the deal
  { f: 1160, cInf: 10, focus: () => [1, 0.5, -3] }, // eggs yard
  { f: 1246, cInf: 10, focus: () => [16, 0.6, -5] }, // chickens yard
  { f: 1300, cInf: 14, focus: () => [2.2, 0.3, -1.8] }, // hatching nest CU
  { f: 1470, cInf: 0 }, // flock wide
  { f: 1520, dur: 26, cInf: 8, focus: () => [16, 0.6, -5] }, // flock closer
  { f: 1570, cInf: 10, focus: () => [-16, 1.0, -6] }, // Group 1 empty yard
  { f: 1680, dur: 28, cInf: 12, focus: () => [-16, 1.3, -5.5] }, // complainer CU
  { f: 1740, cInf: 8, focus: () => [0, 1.0, -4] }, // comfortable Group 2
  { f: 1855, cInf: 0 }, // hiring wide
  { f: 1975, dur: 30, cInf: 10, focus: () => [13, 0.8, -4] }, // the handover
  { f: 2070, cInf: 0 }, // final three-tier wide
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
/** what the lens focuses on (DOF): the DOF table's focus point, else the camera look point */
export const focusAt = (id: number, f: number): V3 => {
  const d = dofAt(f);
  return d.focus ? d.focus(f) : camAt(id, f).look;
};

/** near framing objects: visible while a <= f < b; kit = a GLB name accepted by build.ts prop() */
export type Fg = { a: number; b: number; kit: string; pos: V3; s?: number; yaw?: number };
export const FOREGROUND: Fg[] = [
  // final three-tier wide (shot 13): a cart in the bottom-left corner, clear of the three yards
  { a: 2070, b: TOTAL, kit: "cart", pos: [-13, 0, 12.5], s: 0.9, yaw: 0.5 },
  // Group 2 comfortable (shot 11, golden): a bush in the bottom-right corner, below the faces
  { a: 1740, b: 1855, kit: "plant_bushDetailed", pos: [7.5, 0, 3.2], s: 1.1, yaw: 0.4 },
];
export { lin };
