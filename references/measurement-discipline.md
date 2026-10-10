# Measurement discipline: numbers from renders, not from memory

The engine's gates measure what they can see. In print and large format much of what matters
(a feature inside a photograph, the stroke of a logo, where a glyph's cap top really falls) is
not in any lock, so the skill measures it from a render and keeps the number next to the
decision. These are the habits that removed whole rounds of client correction. Scaffold tool:
`tools/measure-render.mjs`. Brand-neutral.

## 1. Measure the thing you are placing against

- **A feature in an image** (a highlighted region, a glow, the lit outline of a map): render,
  then take the bounding box of pixels matching a colour predicate inside a bounded window.
  Record its centre as fractions of the image (`fx`, `fy`) and reuse the fractions across pieces;
  a pixel coordinate remembered from one crop misplaces the feature in the next.
- **A client's sketch or mock-up**: register it numerically. Fit circles to arcs by maximising
  the radial histogram peaks around a candidate centre; fit a crop to a reference crop by
  intersection over union; scale the result by the ratio of the real size to the sketch size.
- **A stroke**: scan a row perpendicular to the stroke and take the run length of matching
  pixels; scanning along a diagonal inflates it. Express it as a ratio of a known dimension
  (stems as a percentage of the wordmark width, arcs as a percentage of the symbol height) so
  every later size derives from one shared number.
- **A line weight to match** ("as thick as the map borders"): histogram the run widths across
  many rows and read the mode of the bright core, not the mean of the glow.

## 2. Type is placed by measured metrics

- Cap height: the nominal ratio in the font's tables is not where the rendered cap top lands in
  a given library. Render a capital, measure its top above the baseline, and use that ratio
  (0.782 em for one display serif where the table said 0.708; the difference was 15 mm on a
  backdrop). Keep the measured ratio in the build with the word MEASURED.
- Equal margins ("the logo at the same distance from the top, the left and the headline") are
  computed from the logo's bottom and the headline's measured cap top, then verified on the
  render by bounding boxes of the white and of the gold pixels.
- Widths come from the font's own advance widths (`widthOfTextAtSize`), never from a character
  count; sizes come from loops that fit a measure.

## 3. Measuring windows have edges

A bounding-box scan returns the window's own edge when the feature extends beyond it, and it
returns it every time, which looks like a stable measurement. Two identical readings after a
change are the signature. Start the window from the previous element's measured bottom, not from
a guessed coordinate, and sanity-check that the reading moves when the layout moves.

## 4. Verify that what is defined is drawn

After any block rewrite of a build script, grep that every asset created is also drawn
(`grep -c "drawImage(veilFoot"`). Two rounds of "deepen the fade" changed nothing because the
draw call had been lost in an earlier edit while the constant survived. When a tweak shows no
change, suspect the missing call before pushing the parameter.

## 5. Small habits that keep the numbers honest

- Print the measured quantities in the build log (dpi at size, headline point size, block extent,
  feature position in millimetres) and copy them into the guide from there.
- Keep one `L` object of layout constants per build and let variants override fields by flag.
- Count pages after surgery; check the file size after an asset swap (a 4 000 px PNG embedded as
  is doubles a deck).
- Crops with command-line tools take rows before columns in some tools (`-c height width
  --cropOffset y x`); confirm the first crop by eye before trusting a batch.
- zsh indexes arrays from 1 and does not word-split variables; name output files explicitly.
- Never append a `//` comment to a line you have not read: the loop on that line disappears
  silently. Use a block comment or a new line.
- A heredoc inside a failed `&&` chain never runs; write scripts with the editor tool when the
  chain has fallible steps before it.
