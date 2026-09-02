# Color science — what the capture and the gates should know about color

The engine treats color as a measurement: the lock stores exact values, adherence-lint
compares resolved colors against them, the census counts populations, the pixel gate
diffs them. This file is the science that keeps those measurements honest — which spaces
to compute in, when a written value cannot exist on the target screen, what contrast
numbers actually predict, and how to extract a palette from reference imagery without
inventing one.

Re-expressed from findings by their named originators, as curated in skill.color-expert
by David Aerne (meodai, CC-BY-4.0 for the curation, github.com/meodai/skill.color-expert).
The claims belong to the researchers and practitioners named inline.

## Which space, for which job

- **OKLCH** for anything perceptual: ramps, interpolation, judging whether two tokens are
  distinguishable. **OKLab** for distances and mixing (Björn Ottosson's space; mixing in
  gamma sRGB puts the midpoint of black and white at a visibly light grey).
- **Hex/sRGB** stays the storage and comparison format — locks paste exact hex, and the
  lint compares exact hex. Perceptual spaces are for *deriving and judging*, never a
  reason to fuzz an equality check.
- **HSL for nothing.** Its lightness is an arithmetic channel average: every fully
  saturated hue reports L=50% while measured lightness runs from ~30 (blue) to ~100
  (yellow) — David Briggs's proof that an HSL lightness slider cannot tell yellow from
  blue.

## Uniform is an approximation

OKLCH is a first draft of perception, not the measurement. Dense discrimination data
(Jan Koenderink, Andrea van Doorn, Doris Braun, Karl Gegenfurtner) says where it bends:

- **Grain is fine near black and coarse near white** — near-black tokens need more
  numeric separation than near-white ones to read as different. A dark-mode surface
  stack whose steps mirror the light stack's deltas will read flatter than intended.
- **The cool half of color space is coarser than the warm half** — equal numeric steps
  between blues read smaller than the same steps between reds and yellows.
- **Equal hue angles are not equal perceptual steps**, in any space, OKLCH included.
- At the scale of qualitative difference, a display gamut holds on the order of **a
  thousand distinct regions** — the honest ceiling for a token vocabulary, and context
  for the census: two values the census separates are not necessarily two colors a
  person separates.
- Large differences read as less than the sum of their small steps (Roxana Bujack and
  colleagues), so a distance formula calibrated on small steps overstates big ones.
- An equal-lightness-step ramp is not guaranteed to look even; a ramp spaced at equal
  **APCA contrast** steps often reads more evenly, because that formula carries the
  power law of perceived change. Working rule: build in OKLCH, then judge the ramp on
  the surface it will actually sit on.

Two context effects worth knowing when judging tokens on real surfaces: **crispening**
(the steps of a ramp that straddle the background's own lightness look larger than the
rest, so no scale looks even on every background) and the **Helmholtz-Kohlrausch
effect** (at equal measured lightness a saturated color looks lighter than the grey).
Judge a token in its component on its surface, never in the picker.

## Gamut: the number you wrote may not exist

The gamut has a different shape in every hue plane — magenta peaks at mid lightness,
lime near the top, and a dark saturated yellow exists in no gamut at all. So an OKLCH
value that is fine at one lightness and hue is out of sRGB at another, and what happens
next depends on who folds it: a browser clips in linear sRGB, and Dmitrii Kriaklin's
example is the one to remember — a mid-lightness high-chroma teal comes back fifteen
degrees off in hue and ten points lighter. The correct fold (CSS Color 4 gamut mapping;
Ottosson's recommendation) reduces chroma while holding lightness and hue.

Capture consequences:

- A captured or derived color value must **exist in the gamut the artifact ships in**.
  Check at capture time; a value the browser silently refolds will diff against its own
  lock forever.
- Containment order: sRGB ⊂ Display P3 ⊂ Rec. 2020; Adobe RGB is wider than sRGB but
  NOT inside P3. A value sampled from a P3 screenshot may have no sRGB identity.
- Spec text is not shipped behavior: pair any CSS Color 4/5 feature (`color-mix()`,
  relative color syntax, gamut media queries) with support data before the lock relies
  on it.

## Contrast: APCA predicts reading, WCAG 2 remains the legal gate

WCAG 2's ratio is a symmetric luminance ratio; Andrew Somers's APCA (the algorithm
developed toward WCAG 3) differs in three ways that matter to a gate: it is
**polarity-sensitive** (light-on-dark needs more contrast than dark-on-light — dark mode
is where the old ratio fails most), **spatial-frequency aware** (thresholds are a lookup
by size and weight, not one number), and it predicts legibility, which the ratio does
not — the old formula passes grey text nobody can read.

The APCA ladder: ~15 invisibility line, 30 floor for icons and spot reading, 45 large
fluent text, 60 medium, 75 body text, 90 preferred for sustained reading. Bridge values:
~58 ≈ the old 3:1, 72 ≈ 4.5:1, 85 ≈ 7:1. Calibration fact: about twelve percent of all
hex pairs pass 4.5:1 and under a tenth of a percent reach APCA 90 — a strict body target
is a strong constraint on a palette, not a formality.

Engine stance: **design to APCA, verify to WCAG.** Conformance claims and the lint's
thresholds stay on WCAG 2 numbers because that is what the law cites
(`./microcopy-a11y-i18n.md`); APCA is the better instrument for *choosing* values that
will also clear the legal bar. And compute any ratio against the **composited** color —
text over a translucent fill is checked against what the pixels actually are, not the
token underneath (`./dataviz-craft.md`).

## Color vision: three deficiencies, a simulation, and a size rule

Protan, deutan, tritan — plus grayscale as the fourth check. The common case is
anomalous trichromacy in degrees, not a category. The axis that collapses is red against
green; **orange against blue** is the pair that survives both opponent deficiencies
(Peter Donahue, from the opponent model). Simulation is standard practice with named
models (Brettel, Viénot and Mollon 1997 for dichromacy; Machado, Oliveira and Fernandes
2009 for continuous severity) and belongs in palette generation and linting both. Andrew
McNutt's linter adds the rule nobody states: **distinctness scales with drawn size** — a
thin line needs roughly twice the color difference a wide bar needs, so a palette is
judged at the sizes it will actually be drawn. And a filter is not a person: simulators
imply one fixed experience per type while real severity varies — test with people when
it matters.

## Extracting a palette from reference imagery

For B2 captures and rung 3–5 sources (`./spec-capture.md`), where the palette must come
out of pixels. Amanda Hinton's documented pipeline, re-expressed:

- **Cluster in OKLab, never RGB** — in RGB, yellow reads further from white than blue
  does, and the clusters land wrong.
- **Overshoot then merge**: cluster to more centroids than needed, then merge by
  perceptual distance down to the count. Asking for the count directly hides minority
  colors inside majority clusters.
- **Weight the chromatic plane roughly twice as heavily as lightness** when grouping:
  two reds at different lightness feel like reds; two hues at the same lightness feel
  like different colors.
- **The representative pixel is not the centroid** — a centroid looks muddy. For a
  chromatic cluster take its most vivid member; for a near-grey cluster its most central
  one.
- Guard against phantoms: low mass plus low chroma is compression noise, not a brand
  color. Gate achromatic pixels by a chroma threshold, not by saturation (saturation
  blows up near black).
- Derive tint and shade endpoints from the lightest and darkest fifth of a hue's pixels,
  not the extremes — the extremes are anti-aliasing and JPEG edges.
- Record the full distribution beside the curated candidates: one is the fact, the other
  the proposal. Extracted values enter the lock through the tear-down sheet like every
  other measured value, with their rung declared — extraction proposes, the capture flow
  disposes.
