# Mode B — generate from tokens

Route a node here when it has no `componentMap` entry (`./mode-a.md` covers hits).
B1 = Figma geometry available (`get_metadata` rects = ground truth). B2 = flat reference
image only. Shared gates, exit codes, loop control: `../CONTRACT.md`.

## The reproduction spine (non-negotiable)

These are the known killers of faithful reproduction — each rule exists because its
violation is an observed failure mode:

- Reproduce, then branch. The first output is a 100% faithful reproduction of the
  reference — zero design opinions, structure described from what you measured, no
  aesthetic adjectives in the generation brief (adjectives get rendered as a generic
  marketing page). Variation/taste work starts only after the gates pass.
- Read the real render branch. When source code exists, never infer layout from an
  import name: open the file, pass the branch that actually renders on the target
  route/viewport (`!isMobile` desktop split, feature flag, route fork). A wrong branch
  is the #1 fidelity failure. Never pass a line range you have not read.
- Keep ALL visual code. JSX/templates, className, inline styles, CSS, config, props.
  Strip only pure logic with zero visual impact (data fetching, handlers, auth checks).
  Conditional UI inside the render (`{x && <Y/>}`, ternaries) is visual detail — keep it.
- Budget or fail — never thin-retry. Sum context lines BEFORE the call. Oversized →
  excerpt the BIG files to their render sections (1000+ line shell → its `<header>` JSX;
  huge CSS → the `:root` token block + used rules) and retry the SAME faithful call.
  Files under 1000 lines go in whole; never trim visual code to fit. If the real
  reference still cannot fit: STOP and tell Tudor — a reproduction from thinned context
  is invention wearing reproduction's clothes.
- Tear-down sheets before code (format in `./spec-capture.md`): observed components get
  Source/Observed/Conclusion with exact values; absent ones get a Derived Design with
  `Justified by:` naming observed principles. Hold 30+ concrete values before writing
  code; fewer → capture more, don't guess.
- Declare the rung. Every value names its context-ladder rung (`./spec-capture.md`);
  rung-6 fallbacks are disclosed to Tudor, never passed off as brand truth.
- Identity lock, one sentence, data not adjectives: dominant surface + accent by hex,
  actual font names loaded, layout topology, surface treatment (corners/borders/
  shadows), voice read off the copy. "Editorial-leaning" is a conclusion, not data.
- Fidelity clause on every generation/iteration prompt: use ONLY the fonts, colors,
  spacing, and component styles defined in the lock — introduce nothing outside it.
  Vague prompts ("bold", "modern") otherwise invent fonts and palettes; the lock is a
  hard constraint, not a suggestion.

## `<spec_adherence>` pre-flight — declare before code

Emit per screen, BEFORE any code. Every claim a number, hex, or token name — a line you
cannot state that way means capture is incomplete: back to `./spec-capture.md`.

    <spec_adherence screen="home" mode="B1">
    tokens: background #F7F6F3 (rung 1, tokens.colors.light.background);
            accent #0F5132 (rung 1); spacing 8/12/16/24/32 only; radii control 8 / container 16
    fonts:  heading 700 26px/1.2 "Helvetica Neue" ls -0.01em (tokens.typography.heading);
            fontChecks to pass: ['700 26px "Helvetica Neue"', '400 15px "Helvetica Neue"']
    nodes:  1:100 header → no map → B1, rect {x:24,y:32,w:672,h:67} (get_metadata);
            1:200 balance card → no map → B1, rect …   [Mode-A hits list their binding instead]
    measure: card padding 24px vs reference 24px; CTA 10px 16px, radius 8px;
             balance 34px/700 tabular-nums — each element's px/rem vs the reference crop
    slots:  title|label|cta|tooltip typed; no fixed widths; ≥2-line slack on labels/errors
    banned-deviation sweep: no raw hex outside :root; no off-scale spacing; no invented
            type roles; donts honored (no gradients, no #000 text); signatures honored
            (tabular-nums amounts, single accent hue); masks ≤ caps.maxMaskedAreaPct
    </spec_adherence>

Same mechanical "declare before code" ritual as a design plan — but bound to the spec.
It is the moment drift is cheapest to catch: a wrong number here costs one line.

## Output contracts the scripts assume

From `../CONTRACT.md` §Model-facing rules — generation that skips these cannot be
verified, which means it cannot ship:

- `data-fig-id="<figmaNodeId>"` on every element listed in `screens[].figIds` —
  geometry.mjs joins DOM boxes to Figma rects on it.
- `data-render-ready` set on `<html>` (or any element) only once fonts/data/layout are
  settled — render.mjs waits for this selector, never networkidle. Golden-fixture
  pattern: `document.fonts.ready.then(() => requestAnimationFrame(() =>
  document.documentElement.setAttribute('data-render-ready','')))`.
- Typed flexible text slots: `data-slot="button|label|error|…"` on text containers; no
  fixed widths on them; ≥2 lines of vertical slack on labels/errors/empty states;
  `overflow-x-hidden` on `main`. Slots stay flexible because verify renders the LONGEST
  locale in `screens[].locales` — copy must reflow, not clip.
- All colors/spacing/type via CSS vars derived from the lock (`../assets/tokens.css`).
  Raw hex outside `:root` fails adherence-lint (exit 1).
- Slot text follows the content layer BEFORE visual verify (`./microcopy-patterns.md`,
  `./microcopy-voice.md`); three-gate order per `../CONTRACT.md`: content/compliance →
  taste → geometry+pixels. Overflow is fixed by layout slack or a Concise-pass rewrite —
  NEVER by cutting a mandatory disclosure.

## B1 vs B2

| | B1 (geometry ground truth) | B2 (image only) |
|---|---|---|
| Ground truth | `figIds[].rect` from `get_metadata` | none — measure the PNG itself |
| Geometry gate | yes, before pixels; tolerance ≤2px | none |
| Pixel gate | ≤0.005 global + tileCeiling | same caps |
| Diff classification | geometry classifies each region (box right + pixels wrong = color/type; box wrong = layout) | unclassified — read the triplet crops yourself before fixing |
| Extra duty | — | MANDATORY human worst-region review: show Tudor the top-5 ref/render/diff triplets; a green gate without his eyes does not ship |

B2 discipline: without rects the loop is blinder — measure the reference crops in pixels,
fix toward the REFERENCE, never toward the diff image. State uncertainty ("hover unknown
from statics") instead of inventing it.

## Fix loop (verify.mjs enforces it; you cooperate)

- ≤4 rounds per screen. Keep best-so-far; a fix that worsens `globalPct` is reverted.
- Two consecutive rounds improving <10% relative → STOP and report the residual with its
  triplets. Never thin-retry into invention; never loosen thresholds — caps make the
  lint refuse (exit 1). Threshold semantics and noise floor: `./pixel-diff-tuning.md`.
- Exit codes name the fix owner: 1 = your fix round; 3 = lock dims config; 4 = font
  bundling; 5 = environment. Only code 1 is a generation problem.
- A region you rebuilt via B1 on a second screen → promote it to the library
  (`./mode-a.md` §Promotion) instead of a third rebuild.
