// guide-sheet — the one-page print guide generated from the print file itself (ENGINE/references/print-guides.md).
// Contract: see README.md "guide-sheet".  node tools/guide-sheet.mjs <spec.json> [--out <file.pdf>]
// The spec (brand-free; the skill fills it from its lock and its build constants):
// {
//   "title": "Stage backdrop — print guide", "summary": "Client · piece · size · material · issued YYYY-MM-DD",
//   "orientation": "landscape" | "portrait",
//   "header": { "ground": [r,g,b], "logoPng": "path or null", "ink": [r,g,b] },
//   "stripe": [[r,g,b], ...] | null,                       // foot-edge stripe colours, left to right
//   "fonts": { "bold": "path.ttf", "regular": "path.ttf" },
//   "artwork": { "pdf": "print.pdf", "page": 0, "scale": 28, "pageMm": [5100, 2400], "trimMm": [5000, 2300], "insetMm": 50,
//                "silhouettes": [{ "type": "person", "xMm": 2500, "heightMm": 1750 }, { "type": "box", "xMm": 2500, "wMm": 550, "hMm": 1250 }],
//                "caption": "what the silhouettes mean" },
//   "sections": [{ "n": "1", "title": "Format and safety", "bullets": ["…", "…"] }, …],   // four is the norm
//   "files": [{ "name": "YYYY-MM-DD_Client-Piece_vNN.pdf", "note": "1 page · 5100 × 2400 mm · CMYK · PDF 1.6" }],
//   "footer": "Print guide · page 1 of 1 · questions: reply to the sender"
// }
// Needs pdf-lib and @pdf-lib/fontkit in the skill's node_modules; Ghostscript for the CMYK pass and the preview.
import fs from "node:fs";
import { createRequire } from "node:module";
import { cmykPass, preview, MM } from "./lib/print-kit.mjs";
const require = createRequire(import.meta.url);
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const specPath = process.argv[2];
if (process.argv.includes("--self-test")) { // refusal: a spec whose artwork PDF does not exist
  const bad = `${process.env.TMPDIR || "/tmp"}/guide-self-test.json`; fs.writeFileSync(bad, JSON.stringify({ title: "t", artwork: { pdf: "/nonexistent.pdf" } }));
  const r = (await import("node:child_process")).spawnSync(process.execPath, [process.argv[1], bad], { encoding: "utf8" });
  const ok = r.status === 2 && /artwork/.test(r.stderr); console.log(`guide-sheet self-test: ${ok ? "ok" : "FAIL"} (exit ${r.status})`); process.exit(ok ? 0 : 1);
}
if (!specPath || !fs.existsSync(specPath)) { console.error("usage: guide-sheet.mjs <spec.json> [--out file.pdf]"); process.exit(2); }
const S = JSON.parse(fs.readFileSync(specPath, "utf8"));
if (!S.artwork || !fs.existsSync(S.artwork.pdf)) { console.error(`artwork PDF not found: ${S.artwork && S.artwork.pdf}`); process.exit(2); }
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : specPath.replace(/\.json$/, ".pdf");
const c = ([r, g, b]) => rgb(r / 255, g / 255, b / 255);
const land = S.orientation !== "portrait", PW = land ? 297 : 210, PH = land ? 210 : 297;
const INK = c(S.header?.ink ?? [29, 63, 91]), GREY = rgb(0.45, 0.45, 0.45), RULE = rgb(0.82, 0.82, 0.82), SILH = rgb(0.65, 0.65, 0.65), ACC = c(S.accent ?? [227, 180, 74]);

const doc = await PDFDocument.create(); doc.registerFontkit(fontkit); doc.setTitle(S.title);
const B = await doc.embedFont(fs.readFileSync(S.fonts.bold), { subset: true }), R = await doc.embedFont(fs.readFileSync(S.fonts.regular), { subset: true });
const p = doc.addPage([PW * MM, PH * MM]); const X = (x) => x * MM, Y = (y) => (PH - y) * MM;
const rect = (x, y, w, h, color) => p.drawRectangle({ x: X(x), y: Y(y + h), width: w * MM, height: h * MM, color });
const text = (s, x, y, size, font = R, color = INK) => p.drawText(s, { x: X(x), y: Y(y), size, font, color });
const line = (x1, y1, x2, y2, color = ACC, t = 0.4, dash) => p.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: t, color, dashArray: dash });
function para(s, x, y, size, maxW, font = R, color = INK, lead = 1.3) { const words = s.split(" "); let ln = "", yy = y; for (const wd of words) { const t = ln ? ln + " " + wd : wd; if (font.widthOfTextAtSize(t, size) / MM > maxW && ln) { text(ln, x, yy, size, font, color); yy += size * lead / MM; ln = wd; } else ln = t; } if (ln) text(ln, x, yy, size, font, color); return yy + size * lead / MM; }
const bullet = (s, x, y, w) => { text("•", x, y, 8, B, ACC); return para(s, x + 3.5, y, 6.6, w - 3.5); };
const h2 = (n, s, x, y, w) => { text(n, x, y, 10, B, ACC); text(s, x + 8, y, 10, B, INK); line(x, y + 2, x + w, y + 2, RULE, 0.4); };
const dim = (x1, y1, x2, y2) => { line(x1, y1, x2, y2); const v = x1 === x2; line(x1 - (v ? 1.2 : 0), y1 - (v ? 0 : 1.2), x1 + (v ? 1.2 : 0), y1 + (v ? 0 : 1.2)); line(x2 - (v ? 1.2 : 0), y2 - (v ? 0 : 1.2), x2 + (v ? 1.2 : 0), y2 + (v ? 0 : 1.2)); };

// header band
rect(0, 0, PW, 26, c(S.header?.ground ?? [29, 63, 91]));
if (S.header?.logoPng && fs.existsSync(S.header.logoPng)) { const im = await doc.embedPng(fs.readFileSync(S.header.logoPng)); const w = 42, h = w * im.height / im.width; p.drawImage(im, { x: X(12), y: Y(7 + h), width: w * MM, height: h * MM }); }
text(S.title, 100, 13.5, 15, B, rgb(1, 1, 1)); text(S.summary ?? "", 100, 19.5, 7, R, rgb(1, 1, 1));

// artwork at scale, trim dashed, dimensions, silhouettes
const A = S.artwork, s = 1 / A.scale, ax = 12, ay = 34, [pwMm, phMm] = A.pageMm, [twMm, thMm] = A.trimMm, inset = A.insetMm ?? (pwMm - twMm) / 2;
const art = await doc.embedPage((await PDFDocument.load(fs.readFileSync(A.pdf))).getPage(A.page ?? 0));
const aw = pwMm * s, ah = phMm * s;
p.drawPage(art, { x: X(ax), y: Y(ay + ah), width: aw * MM, height: ah * MM });
if (inset > 0) p.drawRectangle({ x: X(ax + inset * s), y: Y(ay + inset * s + thMm * s), width: twMm * s * MM, height: thMm * s * MM, borderColor: ACC, borderWidth: 0.4, borderDashArray: [1.2, 1.2] });
const floor = ay + inset * s + thMm * s;
for (const sil of A.silhouettes ?? []) {
  const cx = ax + inset * s + sil.xMm * s;
  if (sil.type === "person") { const H = sil.heightMm ?? 1750; p.drawCircle({ x: X(cx), y: Y(floor - H * s + 115 * s), size: 115 * s * MM, color: SILH }); rect(cx - 230 * s, floor - (H - 230) * s, 460 * s, (H - 230) * s, SILH); }
  else rect(cx - sil.wMm * s / 2, floor - sil.hMm * s, sil.wMm * s, sil.hMm * s, SILH);
}
if (A.caption) text(A.caption, ax, floor + 4, 5.5, R, GREY);
dim(ax + inset * s, ay + ah + 7, ax + inset * s + twMm * s, ay + ah + 7); text(`${twMm} mm trim · page ${pwMm} × ${phMm}${inset ? ` (${inset} mm ${A.insetKind ?? "bleed / safety"} all round, dashed = trim)` : ""}`, ax + 8, ay + ah + 10.5, 5.5, R, ACC);
dim(ax + aw + 4, ay + inset * s, ax + aw + 4, ay + inset * s + thMm * s); text(String(thMm), ax + aw + 5.5, ay + inset * s + thMm * s / 2 + 1, 5.5, R, ACC);
text(`1 : ${A.scale}`, ax, ay + ah + 15, 6, R, GREY);

// sections: beside the artwork when it is narrow, below it when wide
const beside = aw < PW * 0.55, cx0 = beside ? ax + aw + 14 : 12, cw = beside ? PW - cx0 - 12 : (PW - 24 - 12) / 2;
let ys = [beside ? 34 : ay + ah + 20, beside ? 34 : ay + ah + 20];
(S.sections ?? []).forEach((sec, i) => { const col = beside ? 0 : i % 2, x = beside ? cx0 : 12 + col * (cw + 12); let y = ys[col]; h2(sec.n ?? String(i + 1), sec.title, x, y, cw); y += 8; for (const b of sec.bullets ?? []) y = bullet(b, x, y, cw); ys[col] = y + 3; });
let yf = Math.max(...ys) + 2; h2(String((S.sections ?? []).length + 1), "Files", 12, yf, PW - 24); yf += 8;
for (const f of S.files ?? []) { yf = para(f.name, 12, yf, 7, PW - 24, B); if (f.note) yf = para(f.note, 12, yf, 6.6, PW - 24, R, GREY); }
text(S.footer ?? "Print guide · page 1 of 1", 12, PH - 8, 6.2, R, GREY);
if (S.stripe) S.stripe.forEach((col, i) => rect(i * (PW / S.stripe.length), PH - 3, PW / S.stripe.length + 0.05, 3, c(col)));
if (yf > PH - 12) console.warn(`guide overflows: text ends ${yf.toFixed(1)} of ${PH} mm — shorten bullets or reduce the artwork scale`);

const tmp = OUT.replace(/\.pdf$/, ".src.pdf"); fs.writeFileSync(tmp, await doc.save()); cmykPass(tmp, OUT); fs.rmSync(tmp);
preview(OUT, OUT.replace(/\.pdf$/, "-preview.png"), 100);
console.log(`wrote ${OUT} (text ends ${yf.toFixed(1)} of ${PH} mm)`);
