# Slides and decks

Rules for generating slide decks and editorial figure pages as lock-verified artifacts.
A deck is a sequence of lock screens (1920x1080 unless the lock says otherwise); every
slide passes the same gates as an app screen.

Adapted from `diagram-design` by Cathryn Lavery (MIT, github.com/cathrynlavery/diagram-design):
its full-editorial page grammar and consultant-quadrant variant, generalized to deck surfaces
under a lock. Pair with diagram-craft.md and dataviz-craft.md for the figures themselves.

## Deck-level rules

- **One idea per slide.** The slide title states the takeaway as a sentence, not a topic
  ("Retention doubles after the first saved search", not "Retention"). If a slide needs two
  ideas, it is two slides. Match word intensity to actual magnitude: "collapses" over a
  3% dip reads as spin and costs the whole deck its credibility.
- **A deck that never states its ask ends without an outcome.** Somewhere before the
  close, one slide names the decision or action requested, with the trade-offs.
- **A deck has one visual system.** Same tokens, same type roles, same figure grammar on
  every slide. Register the deck's slides as screens sharing one lock; a per-slide style
  change is drift, and the gate should catch it.
- Density budget per slide: headline, at most one figure, at most 3 supporting elements
  (cards, stats, bullets). Six-bullet slides are documents, not slides.
- Accent discipline is per-slide: 1-2 accent elements. Across the deck, use the accent for
  the same semantic job every time (the recommendation, the focal series, the decision).
- Slide numbers, section eyebrows, and footers come from the type scale's smallest tracked
  mono role, muted.

## Page anatomy (title + figure slides)

The editorial page grammar, top to bottom:

1. **Eyebrow**: small tracked uppercase mono (section or type tag).
2. **Title**: the display face from the lock, one line if possible, sentence-case takeaway.
3. **Optional subtitle**: one line in the secondary text color.
4. **Figure**: the diagram or chart, sitting directly on the slide background by default.
   A framed variant (secondary surface + hairline border + small radius + padding) is opt-in
   for card-heavy layouts, not the default: extra chrome fights the figure.
5. **Summary cards**: 2-3 cards with varied widths (for example 1.1fr / 1fr / 0.9fr), each
   with an eyebrow, a 7px role dot, a short title, and at most 3 items. Surface fill, 1px
   hairline border, small radius, no shadows.
6. **Footer / colophon**: source, date, page number in muted mono over a hairline rule.

Typography contrast is load-bearing: display face for the title, sans for labels and body,
mono strictly for technical content (tags, axes, numbers, footers). Three families maximum,
all from the lock; if the brand is all-sans, use weight and size contrast to do the serif's
job, and never introduce an off-lock face.

## The 2x2 (quadrant) slide

Two distinct grammars; never mix them:

- **Positioning quadrant**: axes are measurements, items are labeled dots (r=4) placed by
  value, accent on the single "do first" item, up to 12 items. Position carries the meaning.
- **Scenario matrix (consultant special)**: axes are ranges with double-ended arrows, cells
  are four named scenarios with 1-3 line descriptions, numbered corner tags whose dimension
  words match the axis labels exactly, and exactly one focal cell (accent tint + accent
  stroke). No dots; the four names carry the meaning.

Shared rules: axis labels are one word at each arrow tip (no arrow glyphs in the text, no
HIGH/LOW parentheticals, never bold, never on the axis line); the axis cross passes between
cells, not through them; four filled rainbow quadrants are an instant fail; unnamed cells
("Scenario 1") ship only as templates, never as finished slides.

## Dark slides

Decks often need a dark variant for stage projection. The lock carries both color schemes;
the derivation rule when capturing: flip ink-derived rgba values to paper-derived at the
same opacities, and shift the accent slightly brighter so it holds on dark ground. Each
slide declares its scheme; mixing schemes within one slide is a lint error.

## Deck workflow

1. Outline first: one line per slide stating its single idea. The outline is the remove
   test at deck scale; cut every slide whose absence would not hurt the argument.
2. Register slides as lock screens (deck-01-title, deck-02-problem, ...) with canvas and
   color scheme.
3. Generate slide by slide through the lock; figures follow diagram-craft.md and
   dataviz-craft.md.
4. Gate per slide (lint, self-critique, render, pixel where a reference exists), then a
   deck pass: same tokens throughout, accent used for the same job, headline grammar
   consistent, footers sequential. Every data slide also passes the out-of-context test:
   understandable by someone who missed the presentation, with its source cited, units
   and rounding consistent, sort order intentional, and outliers annotated.
5. Export: render each slide screen to PNG at the deck canvas; assemble in the delivery
   tool. The verified artifact is the HTML slide; the export is a projection of it.
