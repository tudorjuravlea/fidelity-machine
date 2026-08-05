# Taste & composition — craft inside the system's vocabulary

Vendored FROZEN 2026-07-21 (distilled from Tudor's design KB; no live links — edits happen
here or nowhere). Scope: the judgment layer of the three-gate ship stack. Governs freehand and
net-new regions in Modes B1/B2 and composition-level choices in Mode A — the regions where the
pixel diff has nothing to diff against. Where a reference image exists, the pixel gate is the
authority; taste never argues with the diff. Operating stance: **keep craft, drop novelty** —
every rule here raises execution quality; none licenses being different.

## 1. Order of precedence — the master guardrail

Resolve every decision in this fixed order; higher always beats lower:

1. **System hard constraints** — tokens, mapped components, measured geometry from
   `design-lock.json`. Machine-checked, non-negotiable. Taste never overrides a token, a
   bound component, or a measured rect.
2. **The system's own `signatures[]` and `donts[]`** (§4).
3. **Universal composition heuristics** (§2) — applied only inside the vocabulary 1–2 allow.
4. **Never invent off-system.** If a heuristic wants a value/font/component/effect the system
   lacks: derive it in-system (nearest spacing step, existing token, existing variant, radius
   arithmetic from system radii) or flag the conflict to the user. Both are fine; silent
   invention is the only failure.

## 2. Composition heuristics — concrete numbers

### Hierarchy & focus
- Exactly **one focal point** per screen; the primary content must be identifiable in <2s.
  Squint test: blur the render — primary, secondary, and groupings must still read.
- **Title/body size ratio ≥2.5×**; push toward 3× when the screen feels flat. Compose with
  the system's type roles: pick roles ≥2.5× apart; if the system's scale cannot produce the
  ratio, build the gap with weight + whitespace and note the constraint (rule 1 wins).
- 3–4 hierarchy levels max, built from size + weight + space — never color alone. Pair
  Bold-vs-Regular, not Medium-vs-Regular. Combine ≥2 dimensions on the focal point (larger
  AND bolder AND more surrounding space).
- One primary CTA per screen; secondary actions visually subordinate. At most one
  "second-read" motif (a detail rewarding a closer look), used once.

### Spacing & rhythm
- The lock's `spacing[]` scale is the law (normally a 4pt-family scale — 4/8/12/16/24/32…).
  Every gap and padding is a scale member; off-scale px is drift (lint-checked). Snap to the
  nearest step, never a custom value.
- **Tight binds, generous separates**: intra-cluster (label + value reading as one unit)
  4–8px; related siblings 8–12px; card gutters ~24px; distinct sections 48–96px — each
  snapped to the system's scale. Related close, unrelated far; never uniform padding.
- Vary spacing within a section for rhythm — compress within groups, breathe between them.
  Generous section padding beats decorative dividers.

### Optical craft
- **Concentric radius**: nested rounded surfaces obey `outer = inner + padding`, derived from
  the system's radii tokens (a calc from system values is in-system; a freehand radius is
  not). The formula holds while the layers read as one nested unit (padding ≲24px); past
  that, treat them as separate surfaces and give each its own token radius.
- **Optical alignment**: on icon+text controls, icon-side padding = text-side padding − 2px;
  shift play-triangles toward the point; pull flush-left display text ~−0.05em. Nudge only
  when it visibly looks wrong — optical beats mathematical, with cause.
- Big/stat numbers sit on the text baseline, never vertically floated. Column tops align
  across a row; CTAs pin to card bottoms so buttons align across unequal cards. All
  mono/uppercase labels share one letter-spacing + casing rule. No orphaned break leaving a
  1–2 word line.
- **`font-variant-numeric: tabular-nums` on every dynamic or comparable number** — balances,
  amounts, counters, table columns.
- **`text-wrap: balance` on headings; `text-wrap: pretty` on body and multi-line notes.**
- Shadows/elevation only from the system's `elevation` tokens — one strategy, one implied
  light source, never mixed. Press feedback: scale 0.97–0.98 on `:active` (100–160ms) when
  the system animates at all.
- Loading: skeletons sized to the real content's shape, never a generic centered spinner.

### Restraint
- **One accent element per screen.** If you need a second, cut one. The accent appears on
  exactly the elements the system designates — never as decoration.
- **≤3–4 colors on screen, ≤2 type families** — tighter when the lock's palette/typography is
  tighter (the lock always wins). Variety comes from weight and size, not new hues.
- One detail at 120%, everything else at 80% — a single point of density/polish focus.
- Cards are lazy: prefer structure (dividers, whitespace, hierarchy) over boxing; never nest
  cards; one framing move per section. Delete test: if removing an element doesn't make the
  screen worse, remove it.

### Motion — inside the system's motion tokens
- **Frequency gate first**: seen 100+/day (keyboard-triggered, command palette) → never
  animate; tens/day (hover, list nav) → minimal or none; occasional (modal, drawer, toast) →
  standard; rare/first-run → delight allowed. Never animate keyboard-initiated actions.
- Purpose gate: every animation answers why (feedback, state change, spatial continuity,
  preventing a jarring pop). "Looks cool" on a frequent path fails.
- Duration bands: press feedback 100–160ms; tooltip 125–200ms; dropdown 150–250ms;
  **product-UI ceiling ≤300ms**; modal/drawer/overlay 200–500ms; exits at 60–70% of enter.
- Easing: enter ease-out (never ease-in into view); on-screen morph ease-in-out; linear only
  for marquee/progress. When the lock defines `motion.durationsMs`/`easings`, those values
  replace these bands — rule 1.
- No bounce/overshoot/elastic unless the system's declared personality allows it. Functional
  data displays (banking charts, balances) default to **no animation**. Max 1–2 animated
  elements per view. `prefers-reduced-motion` honored (the render contract enforces it too).

### Accessibility floor + states
- WCAG AA: body text ≥4.5:1 against the ACTUAL rendered background it sits on, not the token
  in isolation. Visible focus on every interactive element.
- Hit areas **≥44×44px touch, ≥40×40px dense desktop**; a smaller visual control extends its
  hit area (inset pseudo-element); two hit areas never overlap.
- **Every state designed**: default, hover, focus, active, disabled, loading, empty, error.
  A component missing states is incomplete, not minimal.

### Copy floor (superseded by the microcopy references)
- CTA names the outcome; realistic demo data (never "User Name" / "$X,XXX"); no lorem; no em
  dashes in UI copy. Everything further — voice, patterns, banking rules — lives in the
  `microcopy-*.md` references, which are authoritative for copy.

## 3. The self-critique gate — re-weighted, scored, before pixels

Gate 2 of the three-gate ship stack: run after the content/compliance gate and **before** any
geometry/pixel script. Silent and internal — never ship a first draft; redo before rendering.

Score four dimensions 0–10 (bands: 0–4 Broken · 5–6 Functional · 7–8 Strong · 9–10
Exceptional):

| Dimension | Test | Bottom-band symptom |
|---|---|---|
| System fidelity | Reads as THIS system: every `signatures[]` rule held, every `donts[]` clean, every value token-traceable | A user fluent in the system would pause; ONE broken signature caps this dimension at Broken |
| Hierarchy | Squint test passes; first/second/third read designed; one focal point; title/body ≥2.5× or noted | Everything equal weight; no entry point |
| Craft | Numbers on baselines; tops aligned; spacing scale-true; same-class gaps identical; label rules consistent; tabular-nums present | Floating stats, uneven gutters, mixed casing, off-scale gaps |
| Functionality | Delete test passes; all states present; hit areas legal; primary CTA in the most visible slot; realistic content | Decorative elements, missing states, dead ends |

**Brand-transplant test** (named check inside System fidelity): mentally swap this system's
distinctive marks — accent surface, logo, signature type — for a competitor's. Does anything
else still identify the brand? If not, the composition is generic despite token correctness:
every value traces to the lock, yet nothing but the paint says whose screen this is. A
composition that survives the transplant scores System fidelity at Functional at best —
fix it by leaning on the system's `signatures[]` (its radius discipline, accent budget,
type gestures), never by inventing distinctiveness off-system.

**Originality is dropped and inverted** — the KB's fifth dimension does not apply here. An
unexpected layout/typographic/motion move is a defect to flag unless a signature demands it.
Novelty is drift wearing a costume; consistency wins every tie.

Mechanics:
- Every score cites evidence: 30–80 words naming concrete elements, classes, and values
  ("`.balance` uses default numerals, signature requires tabular-nums" — never "feels off").
  Unevidenced scores are void.
- Score the worst sustained band; dimensions are independent — never average away a failure.
  If every score lands 8+, re-review: you are not looking hard enough.
- **Any dimension in 0–4 → redo the composition now**, before invoking scripts. Two redo
  passes are normal. Needing a fourth means the approach is wrong — change the layout
  approach or variant set; don't grind the same one.

## 4. Per-system signatures and don'ts — the "reads as a different system" test

`signatures[]` are the non-optional treatments: break one and the output stops reading as
this system (e.g. "balances always tabular-nums", "one accent action per screen, never a
second hue", "zero card shadows", "no bold, no italic, accent ≤5%"). `donts[]` are explicit
bans.

- Before ship, walk **each** signature and each don't one by one — a checklist pass, not a
  vibe. Signatures carrying a `grep` field are also enforced mechanically by
  `adherence-lint.mjs`; verify the non-greppable ones by eye here.
- When the DS documentation doesn't state them: infer from the reference tear-down —
  recurring treatments (radius discipline, shadow strategy, accent budget, label casing) and
  deliberate absences (what you'd expect but the system omits — absence is a decision, not a
  gap to fill). Write them as DRAFT `signatures[]`/`donts[]` entries and **confirm with the
  user before treating them as locked**. An inferred signature is never a license to invent.

## 5. Guardrails — taste never breaks fidelity

- Taste never justifies an off-token value, a non-system font, an unmapped component, or an
  effect the system lacks. §1 rule 4 applies without exception.
- **Mode A is composition-only**: arrangement, order, spacing between components,
  variant/prop choice. Never restyle a bound component — if it looks wrong, the fix is a
  different variant, a different prop, or a layout change; never new CSS on the component.
- **Variance heuristics stay OFF.** No "make it distinctive", no high-variance baselines, no
  anti-convergence. Two runs over the same lock should produce near-identical output — here,
  convergence is correctness.
- When a heuristic and the system genuinely conflict, **the system wins and you note it** in
  the ship report (e.g. the system mandates identical card grids → the "cards are lazy"
  heuristic yields; the type scale caps title/body below 2.5× → compose with weight + space
  and say so).
- The lint owns the checkable subset (spacing-on-scale, title/body ratio, one-accent,
  tabular-nums, text-wrap, concentric-radius arithmetic, em-dash, signature greps). Passing
  this file's judgment never skips the lint; passing the lint never skips this judgment.
