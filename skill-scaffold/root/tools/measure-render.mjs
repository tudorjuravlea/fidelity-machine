// measure-render — numbers from a rendered PNG, for placing against imagery and matching strokes.
// Contract: see README.md "measure-render". Reads 8-bit RGB/RGBA PNGs (no dependency).
//   node tools/measure-render.mjs bbox  <png> --match <r,g,b,tol> [--window x0,y0,x1,y1] [--dpi <n>]
//   node tools/measure-render.mjs runs  <png> --match <r,g,b,tol> --rows y0,y1,step --cols x0,x1
//   node tools/measure-render.mjs sample <png> --window x0,y0,x1,y1          (median colour of the window)
// bbox prints the bounding box and centre in px, and in mm when --dpi is given; runs prints the histogram of run
// widths (the mode is the stroke's core width); sample prints the median RGB — the ground colour to use under a photo.
import fs from "node:fs";
import zlib from "node:zlib";

export function readPng(file) {
  const b = fs.readFileSync(file); let p = 8, w, h, ct, idat = [];
  while (p < b.length) { const len = b.readUInt32BE(p), t = b.toString("ascii", p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len); if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8) throw new Error("8-bit PNG only"); ct = d[9]; } if (t === "IDAT") idat.push(d); p += 12 + len; }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : null; if (!bpp) throw new Error("RGB or RGBA PNG only");
  const st = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(st);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (st + 1)], row = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), cur = Buffer.alloc(st);
    for (let i = 0; i < st; i++) { const a = i >= bpp ? cur[i - bpp] : 0, u = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = row[i]; if (ft === 1) v += a; else if (ft === 2) v += u; else if (ft === 3) v += (a + u) >> 1; else if (ft === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; } cur[i] = v & 255; }
    for (let x = 0; x < w; x++) { const s = x * bpp, d = (y * w + x) * 4; px[d] = cur[s]; px[d + 1] = cur[s + 1]; px[d + 2] = cur[s + 2]; px[d + 3] = bpp === 4 ? cur[s + 3] : 255; }
    prev = cur;
  }
  return { w, h, px };
}

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const nums = (s) => s.split(",").map(Number);
const matcher = (spec) => { const [r, g, b, tol = 40] = nums(spec); return (R, G, B) => Math.abs(R - r) <= tol && Math.abs(G - g) <= tol && Math.abs(B - b) <= tol; };

export function bbox(im, test, [x0, y0, x1, y1]) {
  let minx = Infinity, miny = Infinity, maxx = -1, maxy = -1, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * im.w + x) * 4; if (test(im.px[i], im.px[i + 1], im.px[i + 2])) { n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; } }
  if (!n) return null;
  const touches = minx === x0 || miny === y0 || maxx === x1 - 1 || maxy === y1 - 1; // the window's own edge, not the feature
  return { minx, miny, maxx, maxy, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, count: n, touchesWindowEdge: touches };
}
export function runWidths(im, test, [y0, y1, step], [x0, x1]) {
  const hist = {}; for (let y = y0; y < y1; y += step) { let run = 0; for (let x = x0; x <= x1; x++) { const i = (y * im.w + x) * 4; const hit = x < x1 && test(im.px[i], im.px[i + 1], im.px[i + 2]); if (hit) run++; else { if (run) hist[run] = (hist[run] || 0) + 1; run = 0; } } }
  return hist;
}
export function medianColour(im, [x0, y0, x1, y1]) {
  const ch = [[], [], []]; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * im.w + x) * 4; ch[0].push(im.px[i]); ch[1].push(im.px[i + 1]); ch[2].push(im.px[i + 2]); }
  return ch.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
}

if (process.argv[1] && process.argv[1].endsWith("measure-render.mjs")) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "--self-test") {
    // refusal: a window that clips the feature is reported as touching its own edge
    const w = 20, h = 20, raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 255; raw[o + 1] = 200; raw[o + 2] = 100; }
    const tmp = `${process.env.TMPDIR || "/tmp"}/measure-self-test.png`; const png = (await import("./lib/print-kit.mjs")).encodePng;
    // encodePng expects RGBA rows; build RGBA
    const rgba = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = y * (w * 3 + 1) + 1 + x * 3, d = y * (w * 4 + 1) + 1 + x * 4; rgba[d] = raw[s]; rgba[d + 1] = raw[s + 1]; rgba[d + 2] = raw[s + 2]; rgba[d + 3] = 255; }
    fs.writeFileSync(tmp, png(w, h, rgba)); const im = readPng(tmp); const t = matcher("255,200,100,10");
    const full = bbox(im, t, [0, 0, w, h]), clipped = bbox(im, t, [0, 0, 10, 10]);
    const ok = full && !full.touchesWindowEdge && full.minx === 5 && full.maxx === 14 && clipped && clipped.touchesWindowEdge;
    console.log(`measure-render self-test: ${ok ? "ok" : "FAIL"} (full ${JSON.stringify(full)}, clipped touches edge = ${clipped && clipped.touchesWindowEdge})`);
    process.exit(ok ? 0 : 1);
  }
  if (!cmd || !file || !fs.existsSync(file)) { console.error("usage: measure-render.mjs bbox|runs|sample <png> [--match r,g,b,tol] [--window x0,y0,x1,y1] [--rows y0,y1,step --cols x0,x1] [--dpi n]"); process.exit(2); }
  const im = readPng(file), win = arg("--window") ? nums(arg("--window")) : [0, 0, im.w, im.h];
  if (cmd === "bbox") { const r = bbox(im, matcher(arg("--match", "255,255,255,30")), win); if (!r) { console.log("no matching pixels"); process.exit(1); } const dpi = Number(arg("--dpi", 0)); const mm = (v) => dpi ? ` (${(v / dpi * 25.4).toFixed(1)} mm)` : ""; console.log(`bbox x ${r.minx}–${r.maxx}${mm(r.minx)}–${mm(r.maxx)} y ${r.miny}–${r.maxy}${mm(r.miny)}–${mm(r.maxy)} centre (${r.cx.toFixed(1)}, ${r.cy.toFixed(1)}) px, ${r.count} px${r.touchesWindowEdge ? " — TOUCHES THE WINDOW EDGE: widen the window, the feature extends beyond it" : ""}`); }
  else if (cmd === "runs") { const hist = runWidths(im, matcher(arg("--match", "255,255,255,30")), nums(arg("--rows", `0,${im.h},25`)), nums(arg("--cols", `0,${im.w}`))); const mode = Object.entries(hist).sort((a, b) => b[1] - a[1])[0]; console.log(`run widths ${JSON.stringify(hist)} · mode ${mode ? mode[0] : "none"} px`); }
  else if (cmd === "sample") { console.log(`median rgb ${medianColour(im, win).join(",")}`); }
  else { console.error(`unknown command ${cmd}`); process.exit(2); }
}
