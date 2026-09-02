# Data visualization and dashboard craft

Rules for generating charts (bar, line, scatter, radar, gantt) and dashboard UIs as
lock-verified artifacts. Same contract as every screen: tokens from the lock, gates in
fixed order, honest data or no chart.

Adapted from `diagram-design` by Cathryn Lavery (MIT, github.com/cathrynlavery/diagram-design),
re-expressed for lock-driven generation and extended with dashboard composition rules.
Data-honesty, emphasis, and metric rules additionally informed by the data-visualization
literature (Few, Knaflic, Cairo, Wilke, Schwabish, Zelazny). The analytical genres and the
per-type error table adapt diagram-design's chart-type references (same MIT source). Data
color scale rules re-express findings by Smith and van der Walt (viridis), Wijffelaars et
al., Green (cubehelix), Ström-Awn, and McNutt, as curated in skill.color-expert by David
Aerne (meodai, CC-BY-4.0 curation).

## Chart selection

Choose by the question the reader is asking, never by the shape of the data.

| The question | Use |
|---|---|
| Which is bigger, across categories | Bar (horizontal when labels are long or 8+ categories) |
| Where is it heading | Line |
| Change between exactly two points | Slope, not grouped bars |
| Rank movement across 3-6 ordered snapshots | Bump chart (it trades magnitude away by design) |
| Did the gap change (levels vs change) | Grouped bars → dumbbell (gap is the focus) → variance bars (only change matters) |
| How is it spread | Histogram (shape) or box plot (compare groups), never a bar of means |
| Distribution shapes compared across groups | Ridgeline (3-12 rows, one shared value axis) |
| The whole crowd and its outliers | Beeswarm (20-300 items; fewer has no crowd, more gets binned) |
| Composition, few parts with one dominant | Pie or donut at 5 slices or fewer; otherwise treemap or stacked bar |
| Do these move together | Scatter; bubble adds a third variable |
| Where geographically | Choropleth, always normalized by population or area |
| Where did the volume go | Sankey |
| 3-5 entities on 3-5 normalized criteria | Radar |
| Tasks and phases on a calendar | Gantt |
| Two-axis positioning or four named scenarios | Quadrant (see slides-and-decks.md) |
| A single number that matters | Stat tile, not a chart |
| Exact values needed for a decision | Table, not a chart |

If a 3-column table communicates the same thing, use the table.

## Honesty rules (these outrank aesthetics)

- Y-axis starts at zero whenever magnitude is the message. A truncated axis is a
  misrepresentation, not a style choice; if you must truncate, annotate the break explicitly.
- Polylines, not smoothed splines, for sampled data. Smoothing invents data between samples.
- Discontinuous data shows a visible gap; never bridge missing values silently.
- Radar axes must be normalized to one shared 0-N scale before plotting, and the grid starts
  at zero. Starting inner rings above zero to amplify differences is a zero-baseline trick.
- Every printable number on a chart must come from the source data or a verified derivation.
  No invented statistics, ever.
- Captions state what the data is and its period. Illustrative examples say so.
- **Never a dual axis.** Two metrics on two scales get small multiples or a common index;
  a dual axis lets the designer pick the story.
- Proportional ink: shaded area is proportional to value. Bars must start at zero; dots
  may float on a truncated axis because they carry no area.
- Small multiples share identical axes and scale across panels; only the focal data
  changes; each panel headlines its own takeaway.
- Show uncertainty when it would change the decision; prefer rates over counts unless
  the count is the story.
- **Crowding is data.** Two marks that nearly collide have values that nearly coincide;
  moving one to open space converts a legibility problem into a false statement, and it is
  invisible afterwards. Honest repairs: fewer items, a smaller mark, or print both values
  and say the pair is too close to resolve.
- Round once, then draw from the rounded number: the label, the declared value, and the
  geometry are three statements of one number, not three chances to disagree. Reconcile
  rounding where the invariant lives (a sankey balances at the node, not the flow).
- Check drift as relative error, never percentage points: absolute error hides the mistake
  in the smallest element, which is the one nobody checks.
- Disclose the missing, never impute it: a series without an endpoint is dropped and named,
  not interpolated; a part too small to draw joins a named "other" with the omission count
  in the source line.
- A connector between two points is a gap, not a trajectory: never read an intermediate
  value off a slope, never annotate a crossing with a date, never narrate a dumbbell
  connector as movement.
- A tight domain is sometimes honest and always disclosed: bars never (they encode a ratio
  to zero); a slopegraph tolerates a tight window when both axes move together (every slope
  is unchanged); a dumbbell never (narrowing the domain inflates every gap against the
  frame, and the gap is the claim). State the bounds either way, and keep log scales out of
  any figure whose angle or area is the reading.

## The one lie each type invites

Each chart type has exactly one way of lying that the type itself invites, and that error
renders beautifully every time. The truncated bar axis is the famous one; these are the
others. The self-critique checks this table for whichever type is on the canvas.

| Type | The error | Why it survives review |
|---|---|---|
| Slopegraph | The two axes differ in scale, unit or origin | Shifting one origin tilts every slope equally, so series still rank correctly while every rate is wrong |
| Ridgeline | Per-ridge normalization, or any second amplitude | A rare flat distribution given its own scale wears the same shape as a tight one |
| Bump chart | A rank duplicated or skipped between snapshots | A duplicate is an impossible tie; a skip is an empty row the reader fills with a series that is not there |
| Beeswarm | A dot nudged along the value axis to open space | The packing axis carries no meaning, so a value-axis nudge is invisible |
| Bubble | Radius proportional to value instead of area | It squares the claim silently: a 6x value reads as 36x the ink |
| Dumbbell | A domain taken from the observed min and max | Narrowing the domain draws every gap wider against the frame, and the gap is the entire claim |
| Sankey | Flows that do not sum to their node | The type's whole premise is that thickness encodes quantity, quietly not balancing |
| Treemap | A cell dropped, floored, or clipped to visibility | The type claims to show a whole; an omitted part makes the picture a lie |
| Radar | The zero baseline moved inward | The polygons still look like a fair comparison of shapes |

## Series color discipline

- **The focal series gets the accent. Non-focal series get series tokens, never the brand
  accent and never free-form hexes.** One focal maximum per chart.
- Series tokens come from the lock. If the system's lock defines a chart palette, use it in
  order without skipping. If it defines none, that is a capture gap: derive 3-5 desaturated,
  editorial-tone colors that sit clearly below the accent in saturation, add them to the lock
  first, then generate. Reference-neutral example set: sage `#7c8f6f`, dusty-blue `#5e7a9b`,
  mustard `#b8915a`, rust-brown `#9c6b50`, slate `#6e6479`.
- Series fills at 0.18 opacity on light, 0.22 on dark; strokes at full value.
- Series tokens are for multi-series charts only. Never backfill them into diagrams, cards,
  or UI chrome as extra accent colors.
- Dark mode: flip ink-derived rgba values at the same opacities; bump the accent slightly
  brighter so it reads on dark paper. Both palettes live in the lock, per color scheme.
- **Meaning is never carried by color alone** (roughly 1 in 12 men has a color-vision
  difference): pair color with position, shape, a label, or a direct annotation. Red vs
  green is never the sole distinction; state deltas in text as well as color.
- Prefer direct labels on series ends over a legend when 3 or fewer series; keep the
  legend strip for denser charts. A legend forces the reader to commute; a direct label
  does not.
- In a single analytical figure where every series is labeled where it sits, prefer one
  accent plus an opacity ramp of ink over one hue per series — hue earns its place only
  when it is the only way to follow a series through crossings. Carry focus with stroke
  weight rather than tone (weight survives grayscale and color-vision deficiency), and
  never let the ramp be the only way to tell two series apart.
- **Name a ramp's direction by contrast, never by lightness.** An opacity ramp over ink
  composites darker on light paper and lighter on dark at identical opacities, so a legend
  reading "darker is larger" ships false in one theme while rendering perfectly in both —
  only opening the second theme catches it. "Stronger contrast is larger" is true in every
  theme. The same trap applies to any prose describing a tone.
- Contrast is computed against the **composited** color: text on a translucent fill is
  checked against what the pixels actually are, and against the token actually shipped,
  not the one assumed. A small mark's fill contributes almost no color — give small marks
  a boundary that carries the contrast: a border holding 3:1 against each fill beats an
  impossible pairwise search (Ström-Awn's border trick).

## Chart anatomy specs

Proportions assume a 1000x500 plot viewBox; scale linearly for other canvases, keep the
4px grid.

- Plot margins: left 80 (y labels), bottom 60 (x labels), top 40, right 40.
- Gridlines: 4-6 horizontals at ink @ 0.08, stroke 0.8. Baseline at ink @ 0.25, stroke 1.
- Y labels right-aligned mono, small, just left of the plot; x labels centered under ticks.
- Bar charts: 4-8 bars; bar width at least 50% of the column pitch; value labels above bars
  in mono (accent color on the focal bar only); no 3-D, no shadows.
- Line charts: 4-12 points, up to 5 series; focal stroke 1.8, others 1.2; vertex dots on the
  focal series only (r=4); optional area fill 0.08 opacity, focal only.
- Scatter: up to 30 points; label only outliers and the focal cluster.
- Radar: 3-5 axes starting at top (-90 deg) clockwise; five concentric rings at 0.2 steps
  (inner four at rule @ 0.10, outer at 0.20); scale ticks on the first axis only; one-word
  axis labels; vertex dots focal-only; draw order background, rings, spokes, labels, ticks,
  non-focal series smallest-area first, focal series, focal dots, legend.
  Vertex math: angle = -PI/2 + 2*PI*i/N; x = cx + (v/S)*R*cos(angle); y = cy + (v/S)*R*sin(angle).
  Round coordinates to integers.
- Legend: horizontal bottom strip, 16x8 rect swatches matching each series' stroke+fill.
- Slopegraph: horizontal run narrower than the plot is tall, or every slope flattens toward
  horizontal; no gridlines (both endpoints print their values; the two axis rules are the
  scale); dots at both endpoints. Two series coinciding at both ends merge into one labeled
  line, or one is dropped and the omission named.
- Ridgeline: every ridge starts and ends on its own baseline (a distribution clipped
  mid-mass draws a cliff, and a cliff reads as data); peaks hiding behind peaks get more
  pitch, never a smaller amplitude on one ridge; straight segments between bins; 8-40 bins;
  height is share, not volume — say so in the caption.
- Bump chart: print a rank sigil so a rank does not read as a magnitude; a series that
  enters late or leaves early is drawn as absence, never interpolated; a ranking measure
  that changed definition between snapshots invalidates the chart — no drawing convention
  repairs it.
- Beeswarm: density reads as swarm thickness, never as tone — every non-focal dot takes one
  identical fill; the focal dot keeps the shared radius (a larger one is a second encoding
  and breaks the packing); the legend says the perpendicular spread is packing.
- Bubble: draw largest first or small bubbles get buried; scale opacity down as area goes
  up (ink-mass compensation, not a fourth variable, and say which end is which); a
  non-positive magnitude cannot be a bubble — omit the item and say so.
- Dumbbell: place the two value labels by geometry, deriving left and right from actual
  positions; state the row order and whether "by gap" means signed or absolute; the
  connector clears a visible contrast ratio in its own right — it is what says these two
  dots are one row.
- Sankey: three stage columns, and over budget split into two linked diagrams rather than
  adding a fourth; one scale constant for the whole figure, never one per column; no
  arrowheads (ribbons are area encodings, not connectors); anything thinner than a few
  pixels joins an "other" band; reorder nodes to remove crossings.
- Treemap: squarified layout (sort descending, lay each row against the shorter side of the
  remaining rectangle) so aspect ratios stay near one; beyond ~8 cells the tail groups into
  a named "other"; never rotate a label to fit; carry enough precision that displayed parts
  reconcile with the printed total, or say plainly that they do not.

## Data color scales

The scale a chart maps data onto is a measuring instrument, not decoration. The rainbow
default's bright bands read as features that are not in the data and its dark bands hide
ones that are; its replacement was motivated by clinicians diagnosing measurably worse
with the default they used daily (Smith and van der Walt, viridis). A proper ordered scale
satisfies three things at once (Trumbo, Levkowitz, Brewer): perceived ordering, perceived
distances that match data distances, and no color more salient than its neighbours. The
operational test: the scale's derivative in a perceptual space plots flat — in color AND
in grayscale, because charts still get printed.

- Sequential: color-vision safety says vary along blue-yellow, never red-green; grayscale
  safety says run monotonically dark to light. A readable scale varies hue, chroma and
  lightness together, along a helix (Green's cubehelix is the ancestor of the modern
  maps), not a line. Measure uniformity in OKLab.
- Diverging: two sequential scales joined at a shared neutral — right only when the data
  has a meaningful midpoint. Applying a sequential map to categorical data is the
  commonest misuse of a good scale.
- Categorical: generate and score. Define the loss — spread high, pairwise distances even
  (two near-identical greens imply a relationship in the data that is not there),
  separation under simulated protan/deutan/tritan, brand fidelity as distance to a
  reference palette a human already declared good — then search (Ström-Awn), then lint
  the result (McNutt): contrast tiers, the three deficiencies plus grayscale, no category
  brighter or more vivid than the others, distinctness thresholds tiered by drawn size,
  in-gamut, no pure black/white/red/green/blue.
- Governance is lock content: a small named set of scales, chosen once, with the reasons
  written down — not a new scale per chart. Uniformity is a target, not a universal good:
  a flat derivative exaggerates nothing, which also enhances nothing; when local contrast
  is added for a detection task, say where it came from.

## Dashboard composition

A dashboard is a screen in the lock like any other, with extra density discipline.

- **One question per view.** A dashboard answers "how are we doing on X"; charts that do not
  serve the question move to a second view. Same split rule as diagrams: overview + detail.
- **Hierarchy: stat tiles, then the hero chart, then supporting charts, then tables.**
  The reader's first fixation should land on the number or trend that matters most; give
  exactly one element the accent.
- Stat tiles: value in the largest numeric style with tabular figures, label in a small
  tracked uppercase mono, optional delta with its direction stated in text (not color alone).
  3-5 tiles; vary widths rather than shipping identical cards. **Never a bare number
  without a comparison point**: every measure carries its target, prior period, or norm,
  or it cannot be read as good or bad.
- Every widget passes the actionability test: what would the viewer do differently if
  this number moved? No answer means the widget comes off.
- Know the audience mode: a verifying audience gets descriptive titles, full detail and
  error bars, and nothing removed; a deciding audience gets the finding in the title,
  one highlight with the rest gray, and gridlines, minor ticks, and legends trimmed.
- Cards: surface fill, 1px hairline border from the lock, small radius, no shadows.
- All numerals in data contexts use tabular figures; align numbers right in tables.
- Empty, loading, and error states are designed for every widget; a dashboard that only
  works fully-populated fails the state contract.
- Density budget: at most 6 widgets per view; a widget over ~9 data elements gets its own
  detail view. Whitespace is the grouping mechanism, not boxes inside boxes.
- Auto-refresh or timestamp: every data view states when its data is from.

## Gate integration

- Register each chart or dashboard as a lock screen with canvas, color scheme, and state
  contract (which state the reference shows: populated, empty, loading).
- Mask volatile regions (live numbers, timestamps) with reasons, inside the mask budget.
- **Bind the number to the mark**: every drawn quantity carries a data attribute stating
  the value it encodes, and every meaningful string is bound to the thing it describes.
  Each unbound string is a place the figure can be made to lie while every geometric check
  stays green — and the element that escapes is reliably the one with no text, which is
  the smallest one. Derive any check's scale from the set itself with a method robust to
  one bad point (a single dishonest mark must not drag the line it is measured against),
  and refuse post-hoc transforms rather than resolving them: anything applied after the
  fact moves the rendered mark away from the number that was verified.
- Self-critique adds: honesty rules held? the type's one lie (table above) checked? focal-
  series rule held? budget respected? axis labels one word where the form allows? every
  number sourced? ramp direction named by contrast, not lightness? contrast computed on
  composited colors? every quantity bound to its mark?
