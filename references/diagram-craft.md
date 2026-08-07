# Diagram craft

Rules for generating diagrams (architecture, flow, sequence, state, ER, org, tree, nested,
layers, timeline, swimlane, loop, venn, pyramid) as lock-verified artifacts: standalone HTML
with inline SVG, every color and font from the lock's tokens, gates run as for any screen.

Adapted from `diagram-design` by Cathryn Lavery (MIT, github.com/cathrynlavery/diagram-design),
re-expressed for lock-driven generation. Craft rules below are system-agnostic; every concrete
color or font comes from the active design lock, never from this file.

## Philosophy

The highest-quality move is usually deletion. A diagram is not done when everything is added.
It is done when nothing can be removed.

- Every node represents a distinct idea. Two nodes that always travel together are one node.
- Every connection carries information. If the relationship is obvious from layout, remove the line.
- The accent is editorial, not a flag: 1 to 2 focal elements per diagram. Accent on five nodes
  erases the signal.
- Target density 4 out of 10. Above 9 nodes it is probably two diagrams (overview + detail).
- Before drawing, ask: would the reader learn more from this than from a well-written
  paragraph or a 3-column table? If not, do not draw.

## Semantic node treatments

Map these roles to lock tokens. Fills at low opacity come from the lock's ink/text color,
never from new hexes.

| Role | Fill | Stroke |
|---|---|---|
| Focal (1-2 max) | accent tint (accent @ ~0.08) | accent |
| Standard / active | surface | ink |
| Store / state | ink @ 0.05 | secondary text color |
| External system | ink @ 0.03 | ink @ 0.30 |
| Input / user | secondary @ 0.10 | tertiary |
| Optional / async | ink @ 0.02 | ink @ 0.20, dashed 4,3 |
| Boundary / security | accent @ 0.05 | accent @ 0.50, dashed 4,4 |

## Mandatory connector rules

Non-negotiable; check every one before shipping a diagram.

1. **Orthogonal elbows only.** Never a diagonal line between nodes that do not share an x or
   y axis. Every bend is a quarter-arc, radius 8 (6 minimum in tight layouts). Straight lines
   only when endpoints share a coordinate.
2. **Label-to-connector gap 6-10px, always.** Every arrow label gets an opaque mask rect in the
   page background color, and the mask must never touch the stroke. The connector stays visible.
3. **No overlapping connectors.** No shared stroke paths, no parallel runs on top of each other.
   Crossings get a bridge (hop) arc; parallels stay 12px or more apart end to end. If connectors
   want to stack, the layout has failed: redesign or split.
4. **Fan the attach points.** N connectors on an edge of length L attach at L*k/(N+1), 12px or
   more apart (8px minimum on very small boxes). No two connectors share a point on a box.
5. **Never route behind a non-endpoint box** unless an intervening box is geometrically
   unavoidable on the only direct orthogonal path. In that one exception: dash the stroke
   (transit, not interaction), put the label at the visible end, and land the arrowhead only
   on the true destination. When in doubt, reroute.

Draw arrows before boxes so z-order puts lines behind nodes.

## Labels, legends, callouts

- Arrow labels: 14 characters or fewer, uppercase, the smallest mono size in the lock's type
  scale, centered on the segment midpoint. Never vertical writing-mode.
- Legend: a horizontal strip below the diagram after a hairline rule, never floating inside
  the diagram area. Expand the viewBox to make room. Every swatch used, nothing extra.
- Annotation callouts (editorial asides): italic text in the lock's display or serif face,
  a dashed Bezier leader (dash 4,3, distinguishes it from solid flow arrows), and a small
  landing dot. Margins only, never inside the active diagram area. Maximum 2 per diagram.
  If the diagram should label an element directly, label it; a callout is not a label.

## Complexity budget

| Limit | Value |
|---|---|
| Nodes | 9 |
| Arrows / transitions | 12 |
| Accent elements | 2 |
| Sequence lifelines | 5 |
| Swimlane lanes | 5 |
| ER entities | 8 |
| Nesting levels | 6 |
| Tree / org depth | 4 |
| Stack layers / pyramid tiers | 6 |
| Venn circles | 3 |
| Annotation callouts | 2 |

Over budget means two diagrams (overview + detail), not a denser one.

## Grid discipline

Every font size, coordinate, dimension, and gap divisible by 4. Exempt: stroke widths
(0.8 / 1 / 1.2) and opacity values. A coordinate ending in 1, 2, 3, 5, 6, 7, or 9 is a bug.

## Anti-patterns (instant fails)

| Anti-pattern | Why it fails |
|---|---|
| Dark background + neon glow | Looks technical without a single design decision |
| Mono font on human-readable names | Mono is for ports, commands, URLs, field types only |
| Identical boxes for every node | Erases hierarchy |
| Legend floating inside the diagram | Collides with nodes |
| Arrow label without a mask rect | Bleeds through the line |
| Vertical writing-mode text | Unreadable |
| Box shadows on nodes | Borders carry structure here, not shadows |
| Radius above ~10px on nodes | Toy-like; stay at 4/6/8 |
| Accent on every "important" node | Accent is 1-2 editorial focals, not a signaling system |
| Diagonal connectors | See connector rule 1 |
| Equal-width summary cards under the figure | Vary the widths; identical triplets read as template |

## Gate integration

- Adherence lint applies unchanged: no raw hex outside the token layer, fonts from the lock,
  microcopy rules on every text slot.
- Self-critique gate: run the remove test (can any node, arrow, or label go? can two nodes
  merge?), the budget table, and the connector rules as explicit checks.
- Pixel gate: diagrams are screens; register each one in the lock with its canvas size and
  verify like any other artifact.
