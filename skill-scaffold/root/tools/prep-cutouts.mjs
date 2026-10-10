// prep-cutouts — second pass on segmenter cut-outs: erode the matte, remove colour spill at the edge, build a soft shadow.
// Contract: see README.md "prep-cutouts".
//   node tools/prep-cutouts.mjs <inDir> <outDir> [--erode 2] [--spill blue|green|none] [--strong name.png:R:yMax ...] [--shadow 0.55]
// For every PNG in <inDir>: <outDir>/cut/<name>.png (RGBA, cleaned) and <outDir>/shadow/<name>.png (quarter size RGBA:
// dark pixels, alpha = blurred silhouette × shadow). --strong applies a distance-gated despill to the upper part of one
// image (hair against a coloured backdrop): R px from the matte edge, rows above yMax (fraction of height).
import fs from "node:fs";
import path from "node:path";
import { readPng } from "./measure-render.mjs";
import { encodePng } from "./lib/print-kit.mjs";

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const [IN, OUT] = argv;
if (argv.includes("--self-test")) { // refusal: missing directories
  const r = (await import("node:child_process")).spawnSync(process.execPath, [process.argv[1], "/nonexistent-in", "/tmp/x"], { encoding: "utf8" });
  const ok = r.status === 2; console.log(`prep-cutouts self-test: ${ok ? "ok" : "FAIL"} (exit ${r.status})`); process.exit(ok ? 0 : 1);
}
if (!IN || !OUT || !fs.existsSync(IN)) { console.error("usage: prep-cutouts.mjs <inDir> <outDir> [--erode n] [--spill blue|green|none] [--strong name:R:yMax] [--shadow 0.55]"); process.exit(2); }
const ERODE = Number(flag("--erode", 2)), SPILL = flag("--spill", "blue"), SHADOW = Number(flag("--shadow", 0.55));
const STRONG = {}; argv.forEach((a, i) => { if (a === "--strong") { const [n, R, y] = argv[i + 1].split(":"); STRONG[n] = { R: Number(R), yMax: Number(y) }; } });

function erode(a, w, h, passes) { let cur = a; for (let k = 0; k < passes; k++) { const nx = Buffer.from(cur); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; nx[i] = Math.min(cur[i], cur[i - 1], cur[i + 1], cur[i - w], cur[i + w]); } cur = nx; } return cur; }
function boxBlur(a, w, h, r) { const tmp = new Float32Array(w * h), out = new Float32Array(w * h); for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } } for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s / (2 * r + 1); s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } } return out; }
const spillCap = SPILL === "blue" ? (r, g, b) => [b, Math.max(r, g), 2] : SPILL === "green" ? (r, g, b) => [g, Math.max(r, b), 1] : null; // [value, cap, channel]

fs.mkdirSync(path.join(OUT, "cut"), { recursive: true }); fs.mkdirSync(path.join(OUT, "shadow"), { recursive: true });
for (const f of fs.readdirSync(IN).filter((n) => n.endsWith(".png"))) {
  const { w, h, px } = readPng(path.join(IN, f));
  let a = Buffer.alloc(w * h); for (let i = 0; i < w * h; i++) a[i] = px[i * 4 + 3];
  a = erode(a, w, h, ERODE);
  const out = Buffer.from(px); let spilled = 0;
  for (let i = 0; i < w * h; i++) { out[i * 4 + 3] = a[i]; if (spillCap && a[i] > 0 && a[i] < 250) { const [v, cap, ch] = spillCap(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]); if (v > cap + 6) { out[i * 4 + ch] = cap; spilled++; } } }
  if (STRONG[f] && spillCap) { const near = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) near[i] = a[i] < 128 ? 1 : 0; const d = boxBlur(near, w, h, STRONG[f].R); let n2 = 0;
    for (let y = 0; y < Math.floor(h * STRONG[f].yMax); y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (a[i] === 0 || d[i] <= 0) continue; const [v, cap, ch] = spillCap(out[i * 4], out[i * 4 + 1], out[i * 4 + 2]); if (v > cap + 4) { out[i * 4 + ch] = cap; const lum = Math.round(0.3 * out[i * 4] + 0.59 * out[i * 4 + 1] + 0.11 * out[i * 4 + 2]); for (const k of [0, 1, 2]) if (k !== ch) out[i * 4 + k] = Math.round(out[i * 4 + k] * 0.7 + lum * 0.3); n2++; } }
    spilled += n2; }
  const rows = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { rows[y * (w * 4 + 1)] = 0; out.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  fs.writeFileSync(path.join(OUT, "cut", f), encodePng(w, h, rows));
  const sw = Math.ceil(w / 4), sh = Math.ceil(h / 4), sa = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) sa[y * sw + x] = a[Math.min(h - 1, y * 4) * w + Math.min(w - 1, x * 4)];
  const r = Math.max(3, Math.round(sh * 0.025)); let bl = boxBlur(sa, sw, sh, r); bl = boxBlur(bl, sw, sh, r);
  const srows = Buffer.alloc((sw * 4 + 1) * sh); for (let y = 0; y < sh; y++) { srows[y * (sw * 4 + 1)] = 0; for (let x = 0; x < sw; x++) { const o = y * (sw * 4 + 1) + 1 + x * 4; srows[o] = 10; srows[o + 1] = 20; srows[o + 2] = 35; srows[o + 3] = Math.round(bl[y * sw + x] * SHADOW); } }
  fs.writeFileSync(path.join(OUT, "shadow", f), encodePng(sw, sh, srows));
  console.log(`${f}: ${w} × ${h}, erode ${ERODE}, despilled ${spilled} px, shadow ${sw} × ${sh} r=${r}`);
}
