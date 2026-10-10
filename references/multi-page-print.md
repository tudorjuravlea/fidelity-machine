# Multi-page print: brochures, booklets, folded leaflets

A presentation brochure, a programme, a folded leaflet: several pages that must read as one
system and be imposed on sheets. Extends `print-collateral.md` (Route B, the gates) and
`slides-and-decks.md` (page anatomy). Brand-neutral on purpose.

## 1. Choose the format from the word count, then defend it

Count the words of the client's text before proposing pages. A square 210 × 210 page at 9 to
10.5 pt body holds about 320 words with one figure, 220 with a hero image. Rules of thumb:

| Words supplied | Honest format |
|---|---|
| ≤ 450 | two-sided flyer or 4-page folded sheet |
| 450 to 1 000 | 4 pages with cuts, or 8 pages saddle-stitched |
| 1 000 to 2 000 | 8 to 12 pages |

Write a one-page layout proposal (pages, what goes where, what must be cut for each option,
which formats the printer cannot fold on their stock) and let the client cut. Expect the cover to
go when pages are scarce: the headline moves onto page 1 and the back page becomes content.

Imposition for a 4-page piece: one sheet twice the page width, outside = page 4 | page 1,
inside = page 2 | page 3, folded once. Draw it in the guide.

## 2. One grid, two inks, one hero per page

The pages that were accepted shared four traits; the ones rejected as "you can do much better"
lacked them:

- **One hero per page** (a figure, a chart, a photograph), then a grid of equal cells. Boxes,
  tiles and cards read as a web page; hairline rules on a shared four-column grid read as print.
- **Two inks of type on a dark page**: full white for everything that is read, a muted tone only
  for chart furniture (axis numbers, source line). Muted body text at 55 % white under 7 pt fails
  every time; the client says "barely readable" twice before it is fixed. Judge legibility on a
  200 dpi render, never on a 60 dpi contact sheet.
- **A shared title size** across pages, computed once from the longest title at the measure
  (`TITLE_PT = largest size whose longest title fits one line`), instead of wrapping one title.
- **Rhythm computed from the remaining space**: rows distributed by
  `rowY(i) = top + gap × (i + 1) + rowH × i` with `gap` derived from the page, never hand-placed.

## 3. Text that fits by measurement

- Body auto-fit: the largest size at or under the design size whose paragraphs fit between two
  bounds (`lines(text, size, measure)` counted with the font's own widths, loop in 0.1 pt steps).
- Two balanced columns: compute each item's height, split where the halves are closest, and share
  the shorter column's spare height equally between its items so both columns end on one
  baseline. When the client fixes the split ("items 1 to 5 left"), keep the equalising step.
- A caption asked to "fit on two lines" is sized by a loop that stops at exactly two lines.
- A photo hero with a text column: wash the column with a horizontal gradient PNG (solid to the
  column's right edge, out over 90 to 160 mm) so the type sits on near-solid ground and the
  image's feature stays clear beside it. Measure the feature's position on the render and say in
  numbers what a "zoom out" would move.

## 4. Figures and charts on paper

- A row of figures along a hero's foot: numerals in the display serif, labels in the sans, cells
  sized by measured width with equal gutters; the odd figure is simply the fifth cell, not a box.
- An area-and-line chart in native PDF: an ExtGState with constant alpha for the fill (PDF
  libraries' per-path opacity options are unreliable), the line on top, two direct labels (first
  and last point), a labelled reference line when the chart is indexed to a base (the 100 line
  must be visible when the footnote cites it), source in parentheses after the caption.
- Partner and member logo grids: draw them as type when the client's file is a raster in another
  language; keep acronym, four-colour bar and description in a fixed-size cell grid with auto-fit.
  Confirm every translated organisation name with the client in the delivery note.

## 5. Client rounds on a brochure

- Annotated-PDF feedback: extract the annotations (`/Annots` → `Contents`, `Rect`, strike-outs,
  highlights) and map each rectangle to the page position before touching the layout; a strike-out
  over the city name in an address line means that word, not the sentence.
- An e-mail that contradicts an image in the same e-mail (a name spelled two ways) goes back as a
  question, with both versions quoted; do not pick silently.
- Headline wording is locked across every piece once the client says so; grep every source for
  the old wording after the change.
- Each round ships as a new version number on the same house name, with the print guide and a
  contact sheet rebuilt from the new PDF, never by hand.

## 6. Gates specific to booklets

Page count (after any block replacement in the build), identical page size on every page, the
same subset fonts on every page, ink coverage on full-dark pages reported (97 % on all channels
is expected for a navy page, not a fault), crop marks outside the trim, and a final read of every
page at 150 dpi for orphans, widows and a title that drifted between pages.
