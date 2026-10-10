// embed-fonts — embed TrueType faces into a .pptx so it renders without the fonts installed.
// Contract: see README.md "embed-fonts".  node tools/embed-fonts.mjs <in.pptx> <out.pptx> <fonts.json>
// fonts.json: [{ "typeface": "Family Name", "regular": "path.ttf", "bold": "path.ttf", "italic": "…", "boldItalic": "…" }, …]
// Each face becomes an uncompressed Embedded OpenType file (ttf2eot) at ppt/fonts/fontN.fntdata, related to the
// presentation part (relationship type …/font), with a <p:embeddedFontLst> inserted after <p:notesSz> and
// embedTrueTypeFonts="1" on the root. Only embed faces whose licence permits it. Needs `ttf2eot` in the skill's node_modules,
// and `unzip` / `zip` on PATH. Exit 2 usage or already-embedded, 1 on a missing font file.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const [, , IN, OUT, FONTS] = process.argv;
if (process.argv.includes("--self-test")) { // refusal: missing arguments
  const r = (await import("node:child_process")).spawnSync(process.execPath, [process.argv[1]], { encoding: "utf8" });
  const ok = r.status === 2; console.log(`embed-fonts self-test: ${ok ? "ok" : "FAIL"} (exit ${r.status})`); process.exit(ok ? 0 : 1);
}
if (!IN || !OUT || !FONTS || !fs.existsSync(IN) || !fs.existsSync(FONTS)) { console.error("usage: embed-fonts.mjs <in.pptx> <out.pptx> <fonts.json>"); process.exit(2); }
const ttf2eot = require("ttf2eot");
const fonts = JSON.parse(fs.readFileSync(FONTS, "utf8"));
const work = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "pptx-fonts-"));
execFileSync("unzip", ["-q", IN, "-d", work]);
fs.mkdirSync(path.join(work, "ppt/fonts"), { recursive: true });
let n = 0; const rels = [], list = [];
for (const f of fonts) {
  const faces = [];
  for (const kind of ["regular", "bold", "italic", "boldItalic"]) {
    if (!f[kind]) continue; if (!fs.existsSync(f[kind])) { console.error(`font file missing: ${f[kind]}`); process.exit(1); }
    n++; const id = `rIdFont${n}`, name = `font${n}.fntdata`;
    const eot = ttf2eot(new Uint8Array(fs.readFileSync(f[kind])));
    fs.writeFileSync(path.join(work, "ppt/fonts", name), Buffer.from(eot.buffer, eot.byteOffset, eot.byteLength));
    rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/${name}"/>`);
    faces.push(`<p:${kind} r:id="${id}"/>`);
  }
  list.push(`<p:embeddedFont><p:font typeface="${f.typeface}" pitchFamily="${f.pitchFamily ?? 34}" charset="0"/>${faces.join("")}</p:embeddedFont>`);
}
const ctPath = path.join(work, "[Content_Types].xml"); let ct = fs.readFileSync(ctPath, "utf8");
if (!ct.includes('Extension="fntdata"')) ct = ct.replace("</Types>", '<Default Extension="fntdata" ContentType="application/x-fontdata"/></Types>');
fs.writeFileSync(ctPath, ct);
const relPath = path.join(work, "ppt/_rels/presentation.xml.rels"); fs.writeFileSync(relPath, fs.readFileSync(relPath, "utf8").replace("</Relationships>", rels.join("") + "</Relationships>"));
const presPath = path.join(work, "ppt/presentation.xml"); let pres = fs.readFileSync(presPath, "utf8");
if (pres.includes("<p:embeddedFontLst>")) { console.error("presentation already has embedded fonts; refusing to add a second list"); process.exit(2); }
const anchor = pres.match(/<p:notesSz[^>]*\/>/); if (!anchor) { console.error("notesSz not found in presentation.xml"); process.exit(1); }
pres = pres.replace(anchor[0], `${anchor[0]}<p:embeddedFontLst>${list.join("")}</p:embeddedFontLst>`);
pres = pres.replace(/<p:presentation\b([^>]*)>/, (m, attrs) => `<p:presentation${attrs.replace(/\s(embedTrueTypeFonts|saveSubsetFonts)="[^"]*"/g, "")} embedTrueTypeFonts="1" saveSubsetFonts="0">`);
fs.writeFileSync(presPath, pres);
if (fs.existsSync(OUT)) fs.rmSync(OUT);
execFileSync("zip", ["-q", "-X", "-r", path.resolve(OUT), "."], { cwd: work });
fs.rmSync(work, { recursive: true, force: true });
console.log(`embedded ${n} font file(s) into ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
