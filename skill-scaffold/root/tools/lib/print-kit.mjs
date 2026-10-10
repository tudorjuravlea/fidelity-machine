// print-kit — Route B helpers for millimetre-first print PDFs (pdf-lib + Ghostscript).
// Contract: see ../README.md "print-kit". Brand-free; the skill passes its own colours and fonts.
// Borrows pdf-lib from the SKILL's own node_modules (`npm i pdf-lib @pdf-lib/fontkit` in the skill),
// never from the engine. Ghostscript (`gs`) must be on PATH for cmykPass / previews / gates.
import fs from "node:fs";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PDFDocument, PDFName, PDFArray, decodePDFRawStream, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath } = require("pdf-lib");

export const MM = 72 / 25.4;

/** A page = trim + 2·bleed (or + 2·safety, printed and seen). Returns mm→pt helpers from the TOP-LEFT of the TRIM. */
export function printPage(doc, { trimMm, bleedMm = 0 }) {
  const [tw, th] = trimMm, pw = tw + 2 * bleedMm, ph = th + 2 * bleedMm;
  const page = doc.addPage([pw * MM, ph * MM]);
  const X = (x) => (bleedMm + x) * MM, Y = (y) => (ph - bleedMm - y) * MM;
  const rect = (x, y, w, h, color, extra = {}) => page.drawRectangle({ x: X(x), y: Y(y + h), width: w * MM, height: h * MM, color, ...extra });
  return { page, X, Y, rect, tw, th, pw, ph, bleedMm };
}

/** Crop marks outside the trim (3 mm long, 0.5 mm off the corner). */
export function cropMarks(p, { len = 3, gap = 0.5, thickness = 0.25 } = {}) {
  const { page, X, Y, tw, th } = p; const c = page; const K = { r: 0, g: 0, b: 0 };
  const line = (x1, y1, x2, y2) => c.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: require("pdf-lib").cmyk(0, 0, 0, 1) });
  for (const [tx, sx] of [[X(0), -1], [X(tw), 1]]) for (const [ty, sy] of [[Y(0), 1], [Y(th), -1]]) {
    line(tx, ty + sy * gap * MM, tx, ty + sy * (gap + len) * MM); line(tx + sx * gap * MM, ty, tx + sx * (gap + len) * MM, ty);
  }
  void K;
}

/** Clip everything drawn until popClip() to a polygon given in trim mm (e.g. a trapezoid grown by the bleed). */
export function clipPolygon(p, pointsMm) {
  const [x0, y0] = pointsMm[0];
  p.page.pushOperators(pushGraphicsState(), moveTo(p.X(x0), p.Y(y0)), ...pointsMm.slice(1).map(([x, y]) => lineTo(p.X(x), p.Y(y))), closePath(), clip(), endPath());
}
export function popClip(p) { p.page.pushOperators(popGraphicsState()); }

/** Grow a convex polygon outward by `d` mm (for a fill that must reach the bleed): offsets each vertex along the bisector. */
export function growPolygon(pointsMm, d) {
  const n = pointsMm.length, out = [];
  if (n < 3) throw new Error(`growPolygon needs at least 3 points, got ${n}`);
  for (let i = 0; i < n; i++) {
    const [px, py] = pointsMm[(i + n - 1) % n], [cx, cy] = pointsMm[i], [nx, ny] = pointsMm[(i + 1) % n];
    const a = Math.atan2(cy - py, cx - px), b = Math.atan2(ny - cy, nx - cx);
    const na = [Math.sin(a), -Math.cos(a)], nb = [Math.sin(b), -Math.cos(b)]; // outward normals for a clockwise polygon
    const bx = na[0] + nb[0], by = na[1] + nb[1], bl = Math.hypot(bx, by) || 1, cosHalf = (na[0] * bx + na[1] * by) / bl;
    out.push([cx + (bx / bl) * d / cosHalf, cy + (by / bl) * d / cosHalf]);
  }
  return out;
}

/** A 1-D RGBA gradient PNG (horizontal by default) to stretch as a veil over imagery. fn(t) → alpha 0..1. */
export function profilePng([r, g, b], fn, { steps = 512, vertical = false } = {}) {
  const w = vertical ? 1 : steps, h = vertical ? steps : 1, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let i = 0; i < steps; i++) { const a = Math.round(255 * Math.max(0, Math.min(1, fn(i / (steps - 1))))); const o = vertical ? i * (w * 4 + 1) + 1 : 1 + i * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; }
  return encodePng(w, h, raw);
}
const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let x = n; for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1; t[n] = x; } return t; })();
const crc32 = (buf) => { let x = -1; for (const v of buf) x = CRC_T[(x ^ v) & 255] ^ (x >>> 8); return ~x; };
export function encodePng(w, h, rawWithFilterBytes) {
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch("IHDR", ih), ch("IDAT", zlib.deflateSync(rawWithFilterBytes)), ch("IEND", Buffer.alloc(0))]);
}

/** Recolour a single-colour vector artboard (Illustrator-saved PDF page with ONE `/CS0 cs … scn` fill) to white, returning the page for embedPage.
 *  Throws when the page has more than one colour operator: then it is not a mono artboard and this trick does not apply. */
export async function whiteArtboardPage(aiPdfBytes, pageIndex) {
  const ai = await PDFDocument.load(aiPdfBytes, { ignoreEncryption: true }); const page = ai.getPage(pageIndex);
  const cont = page.node.Contents(); const refs = cont ? (cont instanceof PDFArray ? cont.asArray() : [cont]) : [];
  const t = refs.map((r) => Buffer.from(decodePDFRawStream(ai.context.lookup(r)).decode()).toString("latin1")).join("\n");
  const re = /\/CS0 cs [\d.]+ [\d.]+ [\d.]+ [\d.]+\s+scn/g; const n = (t.match(re) ?? []).length;
  if (n !== 1) throw new Error(`expected one colour operator on the artboard, found ${n}`);
  page.node.set(PDFName.of("Contents"), ai.context.register(ai.context.flateStream(t.replace(re, "0 0 0 0 k"))));
  return page;
}

/** Ghostscript CMYK pass: converts every raster and solid to DeviceCMYK, keeps embedded subset fonts. Images are NOT downsampled here (do it before embedding). */
export function cmykPass(srcPdf, outPdf) {
  execFileSync("gs", ["-q", "-o", outPdf, "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6", "-sColorConversionStrategy=CMYK", "-dProcessColorModel=/DeviceCMYK", "-dEmbedAllFonts=true", "-dSubsetFonts=true", "-dAutoFilterColorImages=false", "-dColorImageFilter=/DCTEncode", "-dDownsampleColorImages=false", srcPdf]);
}
/** PNG preview(s) of a PDF at `dpi`; pattern may contain %d for multi-page files. */
export function preview(pdf, outPattern, dpi = 20) {
  execFileSync("gs", ["-q", "-o", outPattern, "-sDEVICE=png16m", `-r${dpi}`, "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", pdf]);
}

/** The gates of print-collateral §6 as data: page sizes in mm, font names, per-page ink coverage, RGB presence. */
export function gates(pdf) {
  const info = execFileSync("gs", ["-q", "-dNODISPLAY", "-dNOSAFER", "-dPDFINFO", pdf], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) + "";
  const pages = [...info.matchAll(/MediaBox: \[([\d.\- ]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number)).map(([x0, y0, x1, y1]) => [((x1 - x0) / MM).toFixed(1), ((y1 - y0) / MM).toFixed(1)]);
  const fonts = [...new Set([...info.matchAll(/FontName\s*:?\s*\/?([\w+\-]+)/gi)].map((m) => m[1]))];
  const ink = execFileSync("gs", ["-q", "-o", "-", "-sDEVICE=inkcov", pdf], { encoding: "utf8" }).trim().split("\n").map((l) => l.trim().split(/\s+/).slice(0, 4).map(Number));
  const rgb = /DeviceRGB/.test(fs.readFileSync(pdf, "latin1"));
  return { pagesMm: pages, fonts, inkPerPage: ink, hasDeviceRGB: rgb };
}

/** dpi of a raster at its printed size. */
export const dpiAtSize = (pixels, mm) => pixels / (mm / 25.4);

if (process.argv[1] && process.argv[1].endsWith("print-kit.mjs") && process.argv.includes("--self-test")) {
  // refusal case: growPolygon needs ≥ 3 points; whiteArtboardPage needs one colour operator (proved on a blank doc)
  let refused = 0;
  try { growPolygon([[0, 0]], 1).length; } catch { refused++; }
  const blank = await PDFDocument.create(); blank.addPage([10, 10]);
  try { await whiteArtboardPage(await blank.save(), 0); } catch (e) { if (/colour operator/.test(e.message)) refused++; }
  const g = growPolygon([[0, 0], [10, 0], [10, 10], [0, 10]], 1);
  const ok = Math.abs(g[0][0] + 1) < 1e-6 && Math.abs(g[2][0] - 11) < 1e-6;
  console.log(`print-kit self-test: grow ${ok ? "ok" : "FAIL"}, refusals ${refused}/2`);
  process.exit(ok && refused >= 1 ? 0 : 1);
}
