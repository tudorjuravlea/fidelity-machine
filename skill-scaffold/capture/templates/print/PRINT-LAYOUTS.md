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
