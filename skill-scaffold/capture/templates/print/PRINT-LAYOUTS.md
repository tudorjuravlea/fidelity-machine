# Print layouts — {{SYSTEM_TITLE}}

Print templates are NET-NEW surfaces gated by lint + render + taste + the export pipeline's
measured geometry checks. Geometry is millimetre-first (`../../formats.json`, print block):
templates render at `pxAtDpi` and are exported ONLY through the print pipeline
(`tools/README.md`, export-print + print-boxes) — never the deck/screen pipeline, and never a
social PNG sent to a printer.

## Type scale (print, in points; px = pt × dpi ÷ 72)

Fill from the lock and record as a DECISIONS.md row:

- `print-display` — poster headline
- `print-title` — page title
- `print-subtitle` — section heads
- `print-body` — body copy
- `print-caption` — footers, contact lines

## Layouts

One file per format id (`a4-onepager.html`, `a5-flyer.html`, …), each declaring
`[data-render-ready]`. Full-bleed art requires `bleedMm > 0` in its format. Internal test
harnesses are `_`-prefixed (`_geometry-proof.html`) and are never shipped.

## Large-format and object skeletons (Route B, millimetres)

These formats are usually built as native PDF objects (`print-collateral.md` §5 Route B) rather
than HTML; record their layout constants as one `L` object per build and the measured values in
DECISIONS.md:

- `frame-banner` — logo top (≈ 0.25 of the height), headline block (cap height ≈ 90 mm, three
  short lines or one), imagery from the lower half fading into the ground; stripe on the top edge
  if the system has one.
- `photo-wall` — hero band in the top 0.3 (logo, one-line headline), imagery below; people hide
  the lower 1.2 m; a white band for partner logos in their own colours when they appear.
- `stage-backdrop` — lectern zone (550 × 1 250 centred) kept clear; logo and headline in one side
  third above 1.6 m; imagery on the other side with its feature fully inside the trim.
- `square-brochure` — one hero per page, four-column grid, shared title size, auto-fit body;
  imposition drawn in the guide.
- `shaped-panel` — symbol or lockup centred on the visible face; stripe on the seen edge; dieline
  as its own PDF.
- `object-print-area` — one applied piece per file, sized by a rule measurable on the object.
- `screen-4k` (in `templates/slides/`) — opening (slogan), agenda (two columns), speaker (3:4
  portrait left, type beside, imagery right); see `event-screens.md`.
