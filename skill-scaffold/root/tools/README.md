# tools/ — skill-side pipelines, contract-first

Tools are per-skill code, not engine verbs: engine scripts are never copied into the skill,
and a tool only BORROWS the engine's runtime deps read-only (`createRequire` against
`ENGINE/node_modules` — playwright and friends — never a local install, never a write). Every
tool ships with a header contract (inputs, outputs, refusals, exit codes) and a `--self-test`
that proves at least one refusal case for the right reason. Exit codes follow
`ENGINE/CONTRACT.md`: 0 ok · 2 setup/usage · 5 render failure.

These contracts are the rebuild prompts (REGENERATE.md scores `tools/` by them). Build each
tool only when its phase arrives: the deck pipeline first, print last.

## deck-build — slide templates → ordered PNGs

- In: `--slides <name,name,…>` (ordered, repeats allowed; each matches a
  `captures/{{CAPTURE_NAME}}/templates/slides/*.html` basename) · `--out <dir>` (required).
- Out: `<out>/NN-<name>.png` in list order (NN 1-based, zero-padded), each exactly the
  `formats.json` `slide` size, rendered with the engine's pinned Chromium using the same
  determinism knobs as `ENGINE/scripts/render.mjs`: frozen clock, seeded RNG, reduced motion,
  dpr 1, wait for `[data-render-ready]` before screenshotting.
- Refuses: an unknown slide name (exit 2, stderr lists every available template); missing
  `--out` (2); a template whose `[data-render-ready]` never appears (5).

## deck-pdf — PNG deck directory → one deck.pdf

- In: `<pngdir>` positional · `--out <file.pdf>` (default `<pngdir>/deck.pdf`).
- Out: one PDF page per PNG in filename-sorted order, each page exactly the slide size in CSS
  px. This is a SCREEN artifact, not the print pipeline: `page.pdf()` converts px→pt at
  96 CSS px per inch ÷ 72 pt per inch, so a 1920×1080 px page becomes 1440×810 pt — that
  conversion is correct and expected, not a bug.
- Refuses: `<pngdir>` missing, not a directory, or holding zero PNGs (2, named error).

## deck-pptx — PNG deck directory → .pptx (python, `uvx --with python-pptx`)

- In: `<pngdir> <out.pptx>` positional.
- Out: a 16:9 deck, one slide per PNG in filename-sorted order, each placed full-bleed on a
  blank layout.
- Honesty rule: slides are images, not editable text — ALWAYS printed to stdout on success,
  so a recipient who expects to edit copy in PowerPoint is told.

## export-print — mm-first print PDF

- In: `--template <path.html>` · `--format <id>` (a `formats.json` print id) · `--out <dir>` ·
  `[--formats <file>]` · `[--no-marks]` (skip crop marks even when `bleedMm > 0`) ·
  `[--tac-limit <pct>]` (default 300).
- Geometry (decided once, never re-derived per run): `mediaMm = trimMm + 2·bleedMm`;
  MediaBox = mediaMm → pt (mm·72/25.4); TrimBox = MediaBox inset by bleedMm on all sides;
  the HTML canvas renders at px = mm/25.4·dpi (rounding residual recorded in the report) and
  is PLACED on the page at its physical mm size via Chromium's PDF `scale` option (= 96/dpi)
  — pixels never decide the page size, only the raster density of what's on it.
- Ink coverage (TAC) REPORTS, never blocks: a floor, not a certified preflight.

## print-boxes — pypdf post-processor (`uvx --with pypdf`)

- Sets `/TrimBox` and `/BleedBox` on every page and CORRECTS `/MediaBox` to the exact
  requested mm size.
- Why MediaBox is rewritten (measured, not assumed): Chromium's printToPDF snaps requested
  page sizes to an internal grid whatever unit family asks for them (mm strings, in strings,
  bare px, and `preferCSSPageSize` all produce the identical snapped box), overshooting by up
  to ~0.3 mm. The residual is always an OVERSHOOT, so rewriting to the exact math only crops
  a sub-0.2 mm sliver off the page's outer edge — inside the bleed margin, never the
  trim/artwork area.

## print-check — gates for a finished print PDF

- In: `--pdf <file>` (required) · `--expect-mm <W>x<H>` (page size incl. bleed, required) ·
  `[--qr <url>]` (the exact URL every QR on any page must decode to) · `[--fonts <name,…>]`
  (allowed embedded font family names; anything else is a finding) · `[--dpi <n>]` (render
  density for the QR read, default 160, refuses below 120: small codes fail to decode at low
  density whatever the layout, so a low-dpi failure would indict the decoder, not the artwork).
- Runs, per page: MediaBox in mm vs `--expect-mm`; Ghostscript `inkcov` (every channel that
  carries ink must be non-zero, and the file must contain no `DeviceRGB` colour space); the
  Ghostscript font table vs `--fonts`; a PNG render at `--dpi` decoded with jsQR when `--qr` is
  given. Prints one line per gate per page and a final verdict.
- Refuses: missing `--pdf`/`--expect-mm` (exit 2); Ghostscript absent (2); any gate failing
  (exit 1, every failing page and gate named); `--dpi` under 120 (2).
- `--self-test` builds three throwaway PDFs in `os.tmpdir()` (wrong page size; an RGB fill; a
  QR pointing at the wrong URL) and proves each refusal fires for its own reason.
- Route-agnostic: the PDF may come from `export-print` + `print-boxes` (HTML through Chromium)
  or from native PDF objects; see `ENGINE/references/print-collateral.md` §5 and §6.

## {{SYSTEM_NAME}}-lint — brand-specific static lint

- A COMPANION to `ENGINE/scripts/adherence-lint.mjs`, never a replacement: raw-hex, css-vars,
  banned-jargon, tokens-only-spacing and contrast are covered there and are deliberately NOT
  duplicated. This tool checks only the rules the engine cannot know — the DEC-numbered brand
  laws (ground routing, type-weight law, story safe zones, lockup vocabulary).
- Scope: shipped templates only; basenames starting with `_` are internal test harnesses and
  are skipped. Pixel-gated screens are governed by the pixel gate + adherence-lint instead;
  net-new surfaces (slides/social/print) carry this lint + taste + render + human review.
- Every detector cites the DECISIONS.md row it enforces; a rule without a DEC number is a
  preference and does not belong here.

## Shipped helpers for print, large format and event screens

Unlike the contracts above, these arrive in the skill as CODE (brand-free, scaffolded from the
engine) because they encode measured lessons rather than brand rules. They borrow nothing from the
engine at runtime: install their dependencies in the skill (`npm i pdf-lib @pdf-lib/fontkit
pptxgenjs ttf2eot`); Ghostscript and, for the Swift tool, Xcode's command-line tools must be on
the machine. Each has `--self-test` proving one refusal. Guidance: `ENGINE/references/print-collateral.md`,
`large-format-textile.md`, `multi-page-print.md`, `print-guides.md`, `event-screens.md`,
`measurement-discipline.md`.

### lib/print-kit.mjs — Route B primitives

`printPage` (trim + bleed/safety, mm helpers from the trim's top-left), `cropMarks`, `clipPolygon`
+ `growPolygon` (shaped panels: fill clipped to the shape grown by the bleed), `profilePng`
(one-pixel gradient PNG for veils), `whiteArtboardPage` (recolour a single-colour vector
artboard to white; refuses when the page has more than one colour operator), `cmykPass`
(Ghostscript pdfwrite to DeviceCMYK, no downsampling), `preview`, `gates` (page sizes in mm,
font names, ink per page, DeviceRGB presence), `dpiAtSize`.

### measure-render.mjs — numbers from a render

`bbox` of pixels matching a colour (reports when the box touches the window's own edge, the
signature of a clipped feature), `runs` (histogram of run widths; the mode is a stroke's core
width), `sample` (median colour of a window — the ground to use under a photograph). Refuses a
missing file or command (2).

### guide-sheet.mjs — the one-page print guide from a JSON spec

Header band, the real print PDF embedded at a stated scale with the trim dashed, dimension
lines, people/lectern silhouettes, four numbered sections, files, footer, optional stripe; warns
when the text overflows the page. Refuses a spec whose artwork PDF is missing (2).

### cutout.swift + prep-cutouts.mjs — portraits without a background, locally

`cutout` (Vision foreground mask, macOS 14+; `swiftc -O -o tools/cutout tools/cutout.swift`)
writes an RGBA PNG; `prep-cutouts` erodes the matte, removes blue or green spill at the edge
(with a distance-gated strong pass for one image's hair region), and builds a quarter-size
blurred shadow per figure. Refuses missing directories (2).

### embed-fonts.mjs — fonts inside the .pptx

Converts each TTF to Embedded OpenType, stores it under `ppt/fonts/`, adds the content type, the
relationships and `<p:embeddedFontLst>` after `<p:notesSz>`. Refuses usage errors and a deck
that already carries an embedded list (2); a missing font file is exit 1. Embed only faces whose
licence allows it, and ship the free ones beside the deck for programs that ignore embedding.

### pptx-from-plates.cjs — the editable deck

Backgrounds and portraits as images, every line of type as a text box placed by its first
baseline (0.8 × exact line spacing below the box top), frames as shapes, notes per slide. Refuses
a missing plate (2). Gate the result with the package validator, a text dump, and a LibreOffice
render compared with the PDF deck.

