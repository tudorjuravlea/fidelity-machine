# Print collateral

Badges, lanyards, roll-ups, backdrops, lectern panels, spec sheets: anything that leaves the screen
and meets a cutter, a grommet or a stuck-on label. The pixel gates in this engine judge a render
against a reference; a physical object adds constraints no reference image carries. This reference
is the process for those objects, distilled from a full-day event-collateral job (badge, lanyard,
one-page print specification) that went through more than twenty client rounds. It is
brand-neutral on purpose; the client's brand belongs in the lock, never here.

Read first: `scope-contract.md` (what runs and what is claimed), `surface-classes.md` (a print
surface is a class of its own), `slides-and-decks.md` (page anatomy carries over). The scaffold's
`tools/README.md` holds the tool contracts named below (`export-print`, `print-boxes`,
`print-check`). Companions for the pieces this file only names: `large-format-textile.md`
(banners, photo walls, stage backdrops), `multi-page-print.md` (brochures and booklets),
`print-guides.md` (the one-page guide every piece ships with), `event-screens.md` (the same
system on the room's screens, with an editable deck), `measurement-discipline.md` (numbers from
renders, not from memory).

## 1. Intake is a checklist, not a conversation

Before any design, get answers to these, in writing, and put them in the lock or the brief:

- Trim size and orientation. Bleed (3 mm unless the printer says otherwise). Page = trim + 2·bleed.
- Both faces, or one. Which content is mandatory on which face.
- **What is physically applied later.** A stuck-on name label, a hole, a lanyard grommet, a clip,
  a badge-holder window. For each: exact size, position freedom ("anywhere"), and whether the
  zone must stay blank or only carry a guide.
- Exact copy, the accent phrase if any, the language(s).
- Output: PDF/X level if the printer states one, otherwise CMYK-only PDF 1.6 with embedded fonts,
  crop marks outside the trim.

The one intake answer that shapes everything: **the worn object shows what covers the zone, not
what is printed under it.** A 102 × 54 mm white label stuck on at reception means every front
must look intentional with a white block there. Design for the block. Never put anything essential
under an applied element.

## 2. Mine the guideline before designing

Open the brand guideline and extract, with page numbers:

1. The colour table with CMYK, RGB, HEX and Pantone. Solids in the PDF use the guideline's CMYK
   recipes verbatim; the lock records them once.
2. The misuse page: what the logo must never sit on (photographs, coloured or busy grounds in
   CMYK form), never cropped, never re-proportioned, clear space. This decides which logo
   version each face gets (white on dark or photographic, mono on light).
3. The sanctioned decorative uses. Guidelines often already permit what a client asks for
   informally: the symbol oversized at listed opacities, in any colour, as a pattern, cropped by
   the page. Quote the page back to the client. It turns "is this allowed?" into a settled fact
   and it is a defence later.
4. The corporate typeface, even if the current campaign uses another face. Clients switch to
   the corporate face mid-job; have it installed and measured before they ask.

## 3. Constraints as code, in millimetres

Encode every physical constraint in the renderer, in trim millimetres from the top-left, so it
survives every later change request mechanically:

- `TRIM`, `BLEED`, page = trim + 2·bleed; helpers `X(mm)`, `Y(mm)` from the top.
- Hardware safe zones. If holes or grommets may sit at the corners, not only a centre slot: no
  legible ink within a top band (16 mm worked) and nothing inside a square at each top corner
  (22 × 22 mm worked). Background imagery may run through; only ink that must stay legible is
  kept out.
- The applied-element zone as an exact rectangle with a discreet dotted guide (0.5 pt, dash
  1.2/2.2 mm, 40 to 60 % opacity of a brand colour). Print the guide, never die-cut.
- Bottom margin of at least 4 mm for anything that must survive a cut; 5 mm for the last line of
  type on a face.
- Edge rules: a stripe or rule "on the bottom" **bleeds off the trim**. An inset hairline reads
  as floating and gets rejected. Thinness is negotiable, attachment is not. Under 0.5 mm on the
  trim, state once that cutting tolerance (±0.5 mm) may remove it on some units, then proceed.

## 4. Three directions, one family each

Present two or three directions, each as a small family: front variants plus a matching back,
rendered from the real print files onto one contact sheet. Clients choose fast when the choice is
visual and the backs already match. Expect the chosen direction to absorb elements from the
others later ("the stripe from that one", "the sans title from the other"); keep every direction
as a build switch, never as a copied file, so "do the same for this one" is a five-line change and
"they changed their mind" is an exact rollback.

## 5. Two render routes, one gate set

**Route A: HTML through Chromium** (`export-print`, then `print-boxes`). Use when the artwork
is authored as HTML/CSS, needs CSS effects (gradients, blend modes, filters), or comes from a
template family already gated by the pixel pipeline. The page is placed at physical mm size;
colour is RGB until a Ghostscript CMYK pass; `print-boxes` sets TrimBox/BleedBox and corrects
Chromium's snapped MediaBox.

**Route B: native PDF objects** (pdf-lib or equivalent). Use when exact CMYK solids, vector
logos, generated QR codes, embedded subset fonts and per-element opacity matter more than CSS
effects. Everything is drawn in points from millimetres; fills use the guideline's CMYK recipes
directly; raster imagery is embedded pre-cropped and pre-scaled (about 350 dpi at print size, so
the file stays light); a Ghostscript `pdfwrite` pass with `-sColorConversionStrategy=CMYK
-dProcessColorModel=/DeviceCMYK` converts the rasters and normalises the file. Gradients do not
exist natively: generate a one-pixel-wide RGBA gradient PNG and stretch it as a scrim; a radial
alpha PNG makes a soft shadow under a logo that would otherwise sit on busy imagery.

Techniques that paid for themselves on Route B:

- **Vector logos from the brand's .ai/.pdf.** Render the artboard once with
  `gs -sDEVICE=pngalpha` to prove the background is unpainted and to measure the logo's bounding
  box, then embed that page with the bounding box in points. Crisp at any size, brand CMYK
  preserved. If the artboard is painted (a navy background rectangle), fall back to the
  transparent PNG at 300 dpi source resolution.
- **A white version of a symbol from a mono artboard:** render with alpha, rewrite RGB to
  white keeping alpha, re-encode. Two lines of Node and a PNG codec.
- **Cache-safe crops:** crop the key visual per composition with an exact offset/size, then
  downsample; record the offsets in the build so a crop is reproducible.
- **Office-bundled fonts** (Century Gothic, Verdana and friends) live under
  `/Applications/Microsoft*/Contents/Resources/DFonts/` on macOS; locate them by globbing, never
  by hard-coding the app name.

## 6. The gates (before every delivery, every version)

`print-check` runs these on the final PDF; until it exists as code they are run by hand and their
results are printed in the delivery note.

| Gate | How | Pass |
|---|---|---|
| Page size | read MediaBox in mm | equals trim + 2·bleed on every page |
| Separations | `gs -sDEVICE=inkcov` per page | all four channels non-zero where ink exists; no `DeviceRGB` in the file |
| Fonts | `gs -dPDFINFO` font table | only the intended subset-embedded faces, nothing else |
| QR | decode with jsQR on a render at 160 dpi or more | returns the exact target URL |
| Visual | one read of each face at 160 dpi | zones respected, nothing under the applied element, edge rules held |

Two facts about the QR gate: a small code fails to decode on renders at 100 dpi or below with
any layout, so a low-resolution failure indicts the decoder, not the artwork (control-test the
previous layout at the same dpi before changing anything); and a logo inside the code is
legitimate only at error correction H, on a white plate of about 26 % of the code width (about
7 % of the area), proven by decoding at three resolutions.

## 7. Iterate by measurement, never by eye

- **Type fits by measurement.** Loop the size down until the widest line fits the safe width
  (`widthOfTextAtSize`); derive a column's point size from the column width
  (`size = W / widthOfTextAtSize(text, 1)`). Report the resulting size in the delivery note.
- **Place against imagery by measuring the render.** A thirty-line PNG decoder finds a glow's
  bounding box; put the logo's centre on its centre line. Bound the scan to the region you mean
  (a label line or a second bright feature will otherwise join the box).
- **Know the source image's geometry limits.** A feature cannot sit lower in the frame than the
  crop allows without being cut at the trim. Compute the limit, present the trade ("lower means
  cutting its edge; the alternative is a shorter insert zone"), and let the client decide.
- **Vocabulary.** "Header" means the headline. "Same height" usually means level with, not as
  tall as. Ask once, in one sentence, when a reading changes the layout materially.

## 8. Delivery is a rebuildable set

- Versioned files under the house naming convention (`YYYY-MM-DD_Client_Piece_Description_vNN.ext`),
  one PDF per piece (front + back as two pages), PNG previews, and a print-notes file: pages, trim,
  bleed, zones, QR target, stock suggestion, every deviation from the guideline flagged with the
  reason.
- The source with the one-liner to regenerate (`npm i && node build.mjs <variant> <font>`), the
  cut assets, and the brief. Rejected versions are deleted from the delivery folder the moment
  they are rejected, so nobody prints the wrong one.
- At the end of the job, a **one-page print specification generated from the print files
  themselves** (previews, dimensions, bleed, zones, CMYK swatches with recipes, file list, printer
  instructions) in the client's own branding. It cannot drift from the files it describes.
- The first delivery of a new piece carries print notes; the last delivery of the day carries the
  spec sheet.

## 9. Textile and other substrates

- Lanyards: a seamless repeat tile (one unit: symbol, gap, wordmark, gap) plus fixed-length
  strips (900 mm) with 2 mm bleed and crop marks, in the common widths (15, 20, 25 mm). Symbol at
  about 58 % of the strip width, caps at about 40 %, letter-spacing +8 %. Printers flip the
  pattern on one half so both sides of the neck read upright; sublimation on white webbing
  prints only the ground, white is the unprinted fabric.
- Dye-sublimation softens hairlines and warms dark blues slightly: no thin rules, no tiny type,
  logos at pattern size.
- Backdrops (pop-up frames): only the printer's dieline is authoritative for size; curved frames
  need a curved-cut file; the bottom ~1.2 m and the head-height band are covered in every photo,
  so logos go high and to the sides. For roll-ups, the cassette hides the bottom 10 to 15 cm.
  Frame banners, photo walls and stage backdrops in detail: `large-format-textile.md`.

## 10. Questions to ask before the next pieces

Quantities; date, venue, room and reuse; who prints and their templates (this answer unlocks half
the rest); copy and language; which visual world; partner logos as vectors; QR target; approval
owner and file deadline; floor plan and photos; photographer or livestream framing. Per piece:
size and system for roll-ups; frame model, dieline, single/double-sided, what stands in front for
backdrops; whose lectern, mounting method, visible area in use for lectern panels; purpose,
photographer vs selfies, lighting and floor for a photo corner.

## 11. Shapes beyond rectangles: dielines

A tapered lectern front, a shaped sign, anything a cutter follows: the artwork page is the
shape's **bounding box plus bleed**; the fill is clipped to the shape **grown by the bleed**
(path operators and a clip in the PDF, computed from the measured corners); the cut path ships as
a **separate PDF** on the same page size, a 0.5 pt magenta line and nothing else, so the printer
can drop it on a cutter layer. The client's photo with their tape-measure letters (A, B, C …)
goes on the guide beside the artwork with the measures restated; ask them to re-measure the real
object before cutting. Vinyl wraps 10 mm round the panel edges (the bleed); a rigid board is cut
to the dieline and fixed with tape or hook-and-loop so the object can be returned unmarked.

## 12. Apparel and objects: print areas measured on the object

A tote bag, a cap, a mug: the file is the print area, not the object. Rules that survived four
rounds of correction:

- Get the object's model number and its data sheet; the printable area and the cost tiers (edge
  to edge costs double on a stock bag) decide the format before any design.
- One file per applied piece, page = the piece, no bleed; the printer places it by a rule they
  can measure on the object ("the outer circle ends on the base of the left handle strap", "the
  wordmark sits on the bottom seam, seam to seam"). Solve the size numerically from that rule
  and verify it on the render against the mock-up photo.
- A client's two references disagree (a mock-up photo and a crop file): say so in one sentence
  and ask which governs; registering the crop numerically (intersection over union against the
  full mark) settles it.
- Visual equality between elements ("the contour as thick as the letters") is one measured
  ratio (stems as a share of wordmark width, arcs as a share of symbol height) and every size is
  derived from it; see `measurement-discipline.md`.
- One version unless the client asks for alternatives; when they do, present them as a numbered
  sheet with the physical consequence of each (margins under the handle bases, cost tier), then
  delete the rejected ones from the folder once decided.

## 13. Many pieces, one system

- The headline, once the client locks wording and casing, is identical on every piece; grep all
  sources for the old wording after the change and rebuild every zip.
- Brand strips and rules follow per-piece rules (on the seen edge of a banner, bleeding off the
  trim of a badge, absent from a stage backdrop when the client says so) and the guide records
  which rule applies.
- Partner and member logos: vector where a vector exists (public emblems from an institutional
  wiki, official SVGs; check an SVG for an embedded raster before trusting it), the official PNG
  where none exists, said so in the guide; when the client wants their real colours, a white band
  is the honest ground, reversed versions are a courtesy.
- Shared assets that several builds read (a white logo PNG) vanish from working folders during
  long jobs; regenerate them from the vector source with a script rather than copying a file
  around, and give them a specific name.
- Deliver per piece (PDF, trim PNG, preview, guide, zip) and once more as a combined handover
  when asked. Rebuild zips; never patch them.
