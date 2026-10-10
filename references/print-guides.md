# Print guides: the one page that travels with every file

Every print piece leaves with a one-page guide generated from the print file itself, so the guide
cannot drift from the artwork. Printers read it instead of the e-mail; clients approve from it.
This reference is the anatomy that worked for badges, apparel, banners, walls, brochures,
shaped panels and backdrops. Brand-neutral; the client's header band and stripe come from the
lock. Scaffold tool: `tools/guide-sheet.mjs` (a JSON spec in, an A4 PDF out).

## 1. Page

A4, portrait for tall pieces (banner, tote, brochure strip), landscape for wide ones (wall,
backdrop, lectern with its photo). Header band in the brand ground with the white logo, the
piece name and a one-line summary (client, piece, size, material, issue date). Footer line
with "page 1 of 1" and whom to ask. The brand stripe on the foot edge if the system has one.

## 2. The artwork, at a stated scale

- The real print PDF embedded as a page (vector stays vector), at a scale that fits the sheet
  with room for text: 1:10 for a lectern panel, 1:20 to 1:28 for a wall or backdrop. State the
  scale under it.
- The trim as a dashed rectangle inside the page when there is bleed or a safety margin; the
  dieline when the shape is not rectangular; dimension lines with arrowheads for the trim width
  and height, labelled in millimetres.
- **What stands in front**, drawn to scale in grey: a lectern (550 × 1 250) and a 1.75 m
  speaker on a backdrop; two 1.75 m people on a photo wall; the handle bases and seams on a tote.
  One caption names the zone nothing informational may enter.
- For an object with a photograph from the client (the measured lectern, the bag), place the
  photo beside the artwork with its measures restated in the caption.
- For a booklet, the pages as a strip plus the imposition diagram.

## 3. Numbered sections, four of them

1. **Format and bleed / safety.** Trim, page, bleed or safety and which, marks or none, what to
   check on the real frame or object, the viewing rule for walls (what the lower band hides).
2. **Artwork.** Where everything sits in millimetres from the trim, the type faces and sizes,
   the raster's dpi at size with the comfort threshold, what is vector and what is embedded, the
   ground colour rule.
3. **Material and colour.** Substrate and finish (dye-sub polyester, matte vinyl or board,
   cotton with a white print, paper weight and lamination), the CMYK recipes of every solid as
   swatches with values, the warning the substrate deserves (dye-sub warms blues, ask for a
   proof), and for apparel the application method.
4. **Files.** Exact file names, pages, size, colour space, PDF version, approximate size, what
   the previews are for, and which of two variants to print ("print ONE of the two").

## 4. Writing rules

- Numbers in the guide come from the build's constants or from measurements on the render; the
  guide script reads the same `L` object as the build, or mirrors it with a comment saying so.
  A guide that says "from 300" when the artwork moved to 270 is the usual failure; rebuild the
  guide with every artwork change.
- One guide per piece; when a piece has two variants under decision, the guide shows the
  current favourite and names the other as the alternative in the Files section.
- Open points go in a short "Before printing" or "To confirm" list: an upscaled photo, a logo
  that exists only as a bitmap, a translated name to confirm, a date to verify.
- Keep the guide under one page; shrink bullets before shrinking the artwork.

## 5. Delivery set

`YYYY-MM-DD_Client-Piece_<what>_vNN.pdf` for the print file, `…_Print-Guide_vNN.pdf`, a trim
PNG and a small preview, zipped per piece; a combined zip when the client asks for "everything
for the printer". Rebuild the zip after every change; never patch a zip.
