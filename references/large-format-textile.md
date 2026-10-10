# Large-format textile: banners, photo walls, stage backdrops

Pieces measured in metres and seen from metres away: roll-up and frame banners, a photo-call
wall, a stage backdrop behind a lectern. They are printed by dye-sublimation on display polyester
and finished for an aluminium frame (keder, silicone edge or hem). This reference extends
`print-collateral.md` (read it first: intake, constraints as code, Route B, the gates) with what
changes when the canvas is a wall. Brand-neutral on purpose; the brand lives in the lock.

## 1. Geometry: safety, not bleed

- Frame systems quote a trim size and either a bleed (10 mm is common for a hemmed textile) or a
  **safety margin** the printer asks to see in the file (50 mm on a 5 m wall). Page = trim +
  2 × that value, no crop marks: the fabric is cut and hemmed, never trimmed to marks. Record
  which of the two the printer said; a bleed is cut away, a safety margin is printed and seen.
- Keep anything informational 150 mm inside the trim on a wall; a frame's own edge, the hem and
  the keder channel eat 20 to 40 mm, and the edges of a wall are the first thing a photographer
  crops.
- **People stand in front of walls.** Model them in the file: a frame on the floor puts its
  bottom 1.2 m behind heads and shoulders, the band 1.5 to 1.9 m is faces, a lectern (550 wide,
  1 250 tall is a common mobile model) sits in the centre of a stage backdrop. Logo and headline
  live above 1.6 m, or in the side thirds; the lower third carries only imagery that may be hidden.
  Draw the silhouettes on the print guide (`print-guides.md`) so the client sees the rule.
- A floor-standing frame is also seen from the side: nothing that must read as a straight line
  within 100 mm of the vertical edges, where fabric tension bows it.

## 2. Resolution is a viewing-distance budget

Pixels per inch at print size, not file size, decides sharpness, and the budget is generous:

| Piece | Typical viewing distance | Comfortable | Flag below |
|---|---|---|---|
| Roll-up / frame banner 1 × 2.5 m | 1 to 2 m | ≥ 100 dpi | 60 dpi |
| Photo wall 3.5 × 2.5 m | 2 to 4 m | ≥ 50 dpi | 35 dpi |
| Stage backdrop 5 × 2.3 m | 3 m and more, and cameras | ≥ 50 dpi | 30 dpi |

Compute `dpi = sourcePixels / (printedWidthMm / 25.4)` for the crop actually used and print it in
the build log and the guide. A 12 000-pixel key visual is 57 dpi across a 5 m wall; a 1 500-pixel
web asset is 29 dpi across a banner and must be flagged with the number, with a request for a
larger render. Vector type and logos are exempt; only rasters are budgeted.

Embed the raster **downsampled to the budget and as JPEG** (quality 90 to 92). A 66 MB PNG
becomes a 2 MB PDF with no visible loss at distance, and Ghostscript's CMYK pass finishes in
seconds instead of minutes. Pass `-dDownsampleColorImages=false` to the CMYK pass so the
downsampling stays yours and is recorded.

## 3. Ground under a photograph: the image's own colour

When a solid ground continues a photographic sky or sea (a navy ground meeting a dark-blue map),
sample the image where the two meet (median of a band of pixels) and set the ground to that
colour **in the same colour family the image is in** (an RGB value when the image is RGB), so the
same conversion applies to both in the CMYK pass. A brand solid in CMYK next to a converted RGB
photograph shows a visible step even when the swatches look alike on screen.

## 4. Veils: one gradient PNG, never abutting bands

Over a photograph, a fade to the ground colour is a one-pixel-wide RGBA gradient PNG stretched
across the region (horizontal for a text column, vertical for a foot wash), with the profile as
a function of position: solid for the text column, easing out with a power curve (1.4 to 1.6 is
smooth), clear where the imagery must stay readable. Rules that came from rejected rounds:

- Abutting vector bands with a small overlap double their opacity at every seam and print as
  stripes. On an image, use the PNG; on a flat vector ground, use bands without overlap.
- Judge a veil's strength on the brightest feature it dims (the lit outline, the highlight), not
  on the ground; a navy veil over a navy sea looks like nothing until the gold line dims.
- When an image starts or ends inside a translucent region, blend its edge too, or the edge
  prints as a faint line.
- A translucent band behind a headline is specified as a percentage (80 % reads as "the map
  shows through"); say the number in the guide.
- Corner weighting: the band can be full behind the logo span and thin to 30 % at the far
  corners, so a wall shows its imagery where nothing has to be read.

## 5. Composition that survives the room

- One line of headline reads from across a room; two or three short lines read from a photo.
  Size headlines by a target cap height in millimetres (a 95 mm cap height carries 3.5 m), then
  derive the point size (`size = capMm / (capRatio × 25.4 / 72)`), measured, see
  `measurement-discipline.md`.
- A photo wall without an event date is reusable; propose it. A banner carries the date only
  when the client insists.
- When the source image is the same across pieces, anchor the same feature (the highlighted
  region, the glow) at a consistent relative position across banner, wall and backdrop, and
  measure its position on each render; a remembered pixel coordinate from another crop is the
  most common source of a misplaced feature.
- A "fake medium weight" when the face ships only Regular and Bold: fill and outline the Regular
  with a stroke of about 0.3 % of the cap height in the same colour (PDF text render mode fill
  and stroke). Keep it for headlines only.

## 6. Build hygiene for five-minute renders

- A 7 MB JPEG through the CMYK pass takes minutes; run variant builds in the background and
  wait on a done marker, never in a foreground command with a short timeout.
- Each variant writes its own temp file (`out/src-<variant>.pdf`); two variants sharing one temp
  name and running in parallel delete each other's output.
- Keep one build per background image and per composition as flags, not copied scripts; keep
  dated copies of each round's PDF so a rollback is a file copy.
- Deliver per piece: the print PDF, a trim-size PNG proof, a small preview, the guide, zipped
  under the house name. Rejected variants leave the folder the moment the client decides.

## 7. Material notes to pass on

Dye-sublimation warms dark blues and softens hairlines: no rules under 2 mm, no type under
40 mm cap height on a wall, request a colour proof for any large flat dark. A matte or blockout
textile avoids flash reflections on a photo wall and stage lights on a backdrop. The brand stripe
belongs on the edge that is seen (the top of a frame banner, never under a lectern).
