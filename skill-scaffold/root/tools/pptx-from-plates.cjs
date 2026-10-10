// pptx-from-plates — an editable PowerPoint from rendered plates + a text-box spec (ENGINE/references/event-screens.md §4).
// Contract: see README.md "pptx-from-plates".  node tools/pptx-from-plates.cjs <deck.json> [--out <file.pptx>]
// deck.json (brand-free; px are pixels of the frame, 1 in = frame.w / 13.333):
// { "frame": { "w": 3840, "h": 2160 }, "fonts": { "head": "Family", "body": "Family" }, "title": "…", "author": "…",
//   "slides": [ { "section": "Speakers", "background": "plates/bg-speaker.png", "notes": "…",
//       "images": [ { "path": "plates/logo.png", "x": 240, "y": 150, "w": 560, "h": 170, "name": "Logo" } ],
//       "shapes": [ { "rect": [304, 417, 1060, 1413], "line": { "rgb": "DDBC78", "px": 9 }, "name": "Frame" } ],
//       "texts":  [ { "text": "Line one\nLine two", "x": 1564, "baseline": 664, "sizePx": 240, "leadPx": 245, "w": 2000,
//                     "font": "head", "rgb": "FFFFFF", "bold": false, "trackEm": 0, "alpha": 100, "name": "Name" } ] } ] }
// A text box is placed by the baseline of its FIRST line: with exact line spacing PowerPoint sets that baseline ≈ 0.8 ×
// the line spacing below the box top. Fonts are referenced by family name; embed them afterwards with embed-fonts.mjs.
// Needs pptxgenjs in the skill's node_modules. Exit 2 on usage or a missing plate; prints the slide count on success.
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) { // refusal: a slide whose background plate does not exist
  const spec = path.join(process.env.TMPDIR || "/tmp", "pptx-self-test.json");
  fs.writeFileSync(spec, JSON.stringify({ frame: { w: 1920, h: 1080 }, fonts: { head: "Arial", body: "Arial" }, slides: [{ background: "/nonexistent.png", texts: [] }] }));
  const r = require("child_process").spawnSync(process.execPath, [__filename, spec], { encoding: "utf8" });
  const ok = r.status === 2 && /plate/.test(r.stderr); console.log(`pptx-from-plates self-test: ${ok ? "ok" : "FAIL"} (exit ${r.status})`); process.exit(ok ? 0 : 1);
}
const SPEC = argv[0];
if (!SPEC || !fs.existsSync(SPEC)) { console.error("usage: pptx-from-plates.cjs <deck.json> [--out file.pptx]"); process.exit(2); }
const D = JSON.parse(fs.readFileSync(SPEC, "utf8")), base = path.dirname(path.resolve(SPEC));
const OUT = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : SPEC.replace(/\.json$/, ".pptx");
const res = (p) => path.isAbsolute(p) ? p : path.join(base, p);
for (const s of D.slides) for (const p of [s.background, ...(s.images || []).map((i) => i.path)]) if (p && !fs.existsSync(res(p))) { console.error(`plate not found: ${p}`); process.exit(2); }

const pptxgen = require("pptxgenjs");
const pres = new pptxgen(); pres.layout = "LAYOUT_WIDE";
if (D.title) pres.title = D.title; if (D.author) pres.author = D.author;
pres.theme = { headFontFace: D.fonts.head, bodyFontFace: D.fonts.body };
const PXIN = D.frame.w / 13.333, IN = (px) => px / PXIN, PT = (px) => px * 72 / PXIN;
const seen = new Set();
D.slides.forEach((s, idx) => {
  if (s.section && !seen.has(s.section)) { pres.addSection({ title: s.section }); seen.add(s.section); }
  const slide = pres.addSlide(s.section ? { sectionTitle: s.section } : {});
  if (s.background) slide.background = { path: res(s.background) };
  for (const im of s.images || []) slide.addImage({ path: res(im.path), x: IN(im.x), y: IN(im.y), w: IN(im.w), h: IN(im.h), objectName: im.name });
  for (const sh of s.shapes || []) { const [x, y, w, h] = sh.rect; slide.addShape(pres.ShapeType.rect, { x: IN(x), y: IN(y), w: IN(w), h: IN(h), fill: sh.fill ? { color: sh.fill } : { type: "none" }, line: sh.line ? { color: sh.line.rgb, width: PT(sh.line.px) } : { color: sh.fill || "000000", width: 0 }, objectName: sh.name }); }
  for (const t of s.texts || []) {
    const lines = t.text.split("\n").length, lead = t.leadPx || t.sizePx * 1.2;
    slide.addText(t.text, { x: IN(t.x), y: IN(t.baseline - 0.8 * lead), w: IN(t.w), h: IN(lead * lines + t.sizePx * 0.4), fontSize: PT(t.sizePx), lineSpacing: PT(lead), margin: 0, valign: "top", isTextBox: true, fontFace: D.fonts[t.font || "body"], color: t.rgb || "FFFFFF", bold: !!t.bold, charSpacing: t.trackEm ? PT(t.sizePx * t.trackEm) : undefined, transparency: t.alpha != null ? 100 - t.alpha : undefined, objectName: t.name || `Text ${idx + 1}` });
  }
  if (s.notes) slide.addNotes(s.notes);
});
pres.writeFile({ fileName: OUT }).then(() => console.log(`wrote ${OUT} (${D.slides.length} slides) — fonts are referenced by name; run embed-fonts.mjs next`));
