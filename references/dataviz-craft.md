# Data visualization and dashboard craft

Rules for generating charts (bar, line, scatter, radar, gantt) and dashboard UIs as
lock-verified artifacts. Same contract as every screen: tokens from the lock, gates in
fixed order, honest data or no chart.

Adapted from `diagram-design` by Cathryn Lavery (MIT, github.com/cathrynlavery/diagram-design),
re-expressed for lock-driven generation and extended with dashboard composition rules.
Data-honesty, emphasis, and metric rules additionally informed by the data-visualization
literature (Few, Knaflic, Cairo, Wilke, Schwabish, Zelazny).

## Chart selection

Choose by the question the reader is asking, never by the shape of the data.

| The question | Use |
|---|---|
| Which is bigger, across categories | Bar (horizontal when labels are long or 8+ categories) |
| Where is it heading | Line |
| Change between exactly two points | Slope, not grouped bars |
| Did the gap change (levels vs change) | Grouped bars → dumbbell (gap is the focus) → variance bars (only change matters) |
| How is it spread | Histogram (shape) or box plot (compare groups), never a bar of means |
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
- Self-critique adds: honesty rules held? focal-series rule held? budget respected? axis
  labels one word where the form allows? every number sourced?
