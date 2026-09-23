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
