// usage: node scripts/render_range.mjs <outDir> <startFrame> <endFrame> [scale] [inputPropsJson]
// Renders frames start..end as JPEG stills, one per frame, with per-frame timing.
// inputPropsJson e.g. '{"post":{"ink":true,"lens":false,"pre":false,"bloom":true,"grade":true,"grain":false}}'
// A failed frame is logged and skipped (FAILED <frame> <reason>) instead of killing the worker.
import fs from "node:fs";
if (process.env.REMOTION_TMP) { fs.mkdirSync(process.env.REMOTION_TMP, { recursive: true }); process.env.TEMP = process.env.TMP = process.env.REMOTION_TMP; }
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const [outDir, startS, endS, scaleS = "1", propsS = "{}"] = process.argv.slice(2);
const start = Number(startS), end = Number(endS), scale = Number(scaleS);
const inputProps = JSON.parse(propsS);
fs.mkdirSync(outDir, { recursive: true });
const browserExecutable = process.env.CHROME_PATH || `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell`;
const chromiumOptions = { gl: "swiftshader" };
const tBundle0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.resolve(process.env.CHICKEN_ENTRY || "src/index.ts"), publicDir: path.resolve("public") });
console.log(`bundled in ${((Date.now() - tBundle0) / 1000).toFixed(1)}s`);
const composition = await selectComposition({ serveUrl, id: "ChickenShort", browserExecutable, chromiumOptions, inputProps });
const onBrowserLog = (l) => { if (l.type === "error") console.log(`[browser-error]`, l.text.slice(0, 300)); };
let ok = 0, fail = 0; const times = [];
for (let f = start; f <= end; f++) {
  const t0 = Date.now();
  try {
    await renderStill({ composition, serveUrl, frame: f, output: path.join(outDir, `f${f}.jpg`), imageFormat: "jpeg", jpegQuality: 90, scale, browserExecutable, chromiumOptions, inputProps, timeoutInMilliseconds: 300000, onBrowserLog });
    const dt = (Date.now() - t0) / 1000; times.push(dt); ok++;
    console.log(`still ${f} ${dt.toFixed(1)}s`);
  } catch (e) { fail++; console.log(`FAILED ${f} ${String(e && e.message ? e.message : e).slice(0, 200)}`); }
}
const avg = times.length ? (times.reduce((a, b) => a + b, 0) / times.length) : 0;
console.log(`SUMMARY frames=${start}-${end} ok=${ok} fail=${fail} avgPerFrame=${avg.toFixed(1)}s`);
