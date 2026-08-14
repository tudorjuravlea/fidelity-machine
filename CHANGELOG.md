# Changelog

All notable changes to fidelity-machine are documented here. Versioning follows semver;
lock-impacting changes are classified per CONTRACT.md §Change classes.

## Unreleased

Public launch preparation.

### Added
- README with the full story: why fidelity beats generation speed, pain points, how this
  differs from generators, linters, token pipelines and screenshot testing, ASD-STE100
  install steps with per-step verification, and an animated demo of the gate catching a
  raw-hex defect (docs/demo.gif).
- GUIDE.md: a 15 minute guided tour on the golden fixture with one deliberate failure,
  shown red, then fixed and shown green.
- FAQ.md: twelve questions, including platform support and "the machine outranks the agent".
- CI (.github/workflows/ci.yml): static gates on Ubuntu and macOS, the pixel self-test on
  macOS as the reference platform, and an experimental non-blocking Windows lane.
- setup-check now prints the project wordmark banner as its first line.
- release-check: reviewed-GIF carve-out for docs/*.gif (magic-byte checked, 10 MB cap),
  .yml added to the ship allowlist, .git excluded from tree walks.
- Surface-craft references for three new artifact classes, adapted from diagram-design by
  Cathryn Lavery (MIT, credited in NOTICE): references/diagram-craft.md (connector rules,
  complexity budgets, semantic node treatments), references/dataviz-craft.md (chart specs,
  series color discipline, data honesty rules, dashboard composition), and
  references/slides-and-decks.md (deck grammar, editorial page anatomy, 2x2 variants,
  dark-slide derivation). skill-template.md now routes generators to them per artifact type.
- adherence-lint: an `a11y` section covering the mechanical half of an accessibility
  review. Seven ERROR checks, each a defect with one correct fix: heading-order jumps,
  `<img>` with no alt, unlabelled fields, positive tabindex, controls with no accessible
  name, interactive source with no `:focus-visible` rule, and `outline: none` with no
  replacement. One WARN check, advisory by design: transition or animation with no
  `prefers-reduced-motion` guard. That one is a judgment call rather than a defect (how
  much movement is too much depends on how far it moves and how often it fires, which
  source alone cannot decide), so it reports and lets the author decide instead of
  blocking a screen over a 150ms fade. Contrast was already covered by its own section and
  is not duplicated here. What a static scan cannot decide (whether alt text is meaningful,
  whether focus order matches visual order) is deliberately absent: a green a11y section
  means "no mechanical defect found", never "accessible".
  **Breaking for existing consumers**: screens that ship interactive controls with no
  focus style now fail the gate. Motion without a reduced variant only warns.
- contract-guard: a `fault-injection` section that mutates a temp copy of the golden
  fixture one defect at a time and requires each a11y check to go red, plus a control
  asserting the pristine fixture stays clean. Runs on every invocation, no browser needed.
  A check that cannot fail is not a check, and nothing else in the suite would notice a
  section accidentally reduced to a no-op.
- fixtures/golden/screen-home.html gained a `:focus-visible` rule. The fixture shipped a
  button with no keyboard focus style, which the new check correctly rejected. Inserted
  after the `.btn` block so `screen-home.html:42` still points at the line GUIDE.md and the
  demo GIF cite, and the rule does not render unfocused, so the golden reference PNG is
  unchanged (proven by the pixel self-test).
- references/surface-classes.md: the engine generates for phones, desktop apps and websites
  from the same lock and previously had no notion of which, so mobile-shaped defaults reached
  pointer surfaces by omission. The class is now **derived from `screens[].captureWidth`, never
  guessed** (touch under 600, hybrid to 1023, pointer 1024 and up), and the table names what
  inverts: hover becomes the primary affordance, the target floor drops from 44px to 24px,
  navigation becomes persistent, density rises, and keyboard becomes a primary input. Adapted
  from genjutsu (MIT, credited in NOTICE); routed from skill-template.md section 1.
- taste-and-composition: the hit-area rule said `≥44×44px touch, ≥40×40px dense desktop`. The
  desktop figure was a number picked once for mobile-era work: WCAG 2.5.8 sets the pointer
  floor at 24×24 and real dense desktop systems run 24 to 32px icon buttons, so a faithfully
  captured system would have sat permanently in violation of the engine's own rule, which is
  how a guideline gets ignored. Now keyed by surface class and anchored to the WCAG level
  rather than to a chosen number, with the captured system explicitly outranking the default.
- ia-and-navigation: the hover-only navigation ban was justified only as "unusable on touch".
  On a pointer surface the failure is that it is unreachable by keyboard. Both are now stated.
- references/motion-craft.md: the engine has carried `tokens.motion.durationsMs` and
  `tokens.motion.easings` in the lock schema since the beginning, and the lint has enforced
  motion rules for as long, with no reference explaining either. This closes that: durations
  and curves are read from the lock by name (a hard-coded 250ms is the same defect class as a
  hard-coded hex), spring-for-spatial and tween-for-effects explains why a system's standard
  curve looks as it does, exits are never staggered, and the reduced variant is designed rather
  than derived. Two rules the pipeline needed and nobody had written: **the pixel gate cannot
  see motion**, so a green diff never implies the animation was reviewed, and **motion must not
  be in flight at capture**, or the diff is nondeterministic and the failure masquerades as a
  flaky threshold. Includes the native-to-web translation layer, since a prototype of a native
  app is HTML while the system it reproduces is specified for Android or Apple.
- references/modern-css.md: scroll-driven animations, view transitions, `@starting-style`,
  anchor positioning and container queries, with the layered fallback ladder (start visible,
  then enhance) that prevents the blank-page failure where content begins at opacity 0 and the
  animation never runs. Two traps specific to this pipeline: the pinned render browser confirms
  a feature works in that build and nowhere else, so support decisions are never made by
  observing a green diff; and only the container-query branch that applies at the capture
  viewport is ever pixel-verified. Deliberately ships no browser-support table, because a stale
  one gets believed.
- references/scope-contract.md: size a request before running the pipeline on it, and state
  what the work will do in a form the gates can check afterwards. Four tiers (Touch, Region,
  Screen, Set) select a proportionate gate set, but the compliance floor (content lint plus
  the disclosure inventory) runs at every tier and never scales down. The contract itself is
  INTENT with no adjectives, CHANGES, USES by token name, and FROZEN, which makes it
  falsifiable: after the gates pass, the diff is checked against the contract, so a change
  outside CHANGES is reported as scope creep and anything in FROZEN that moved is a failure
  regardless of what the gates scored. Closes a real hole, since a gate suite answers "is this
  output legal" and nothing previously answered "is this the output that was asked for".
  Adapted from the scope-and-thesis stages of genjutsu's cast (MIT, credited in NOTICE);
  routed from skill-template.md section 1, and its reporting rule folded into section 6.
- references/variations.md gained a "Showing the set" section: ask once how the reviewer
  wants to see options and keep that mode for the session, show only values that are in the
  lock or the annotation (anything else becomes a second unvalidated spec), treat the
  comparison bundle as throwaway, and show a variation's reduced-motion state beside it.
  Adapted from genjutsu by Adrien Thevon (MIT, credited in NOTICE).
- references/variations.md: how to produce a set of alternative solutions to the same
  problem inside a locked system. Declared axes instead of undeclared restyling, the
  substantive-change test, restrained-to-bold ordering, and the rule that every variation
  is still a lock screen: lint-clean, full disclosure inventory, own self-critique, and an
  explicit statement of which gates ran (a net-new variation has no reference, so the pixel
  gate does not apply to it). Adapted from claude-design-system-prompt by Trystan-SA (MIT,
  credited in NOTICE); routed from skill-template.md.
- dataviz-craft.md and slides-and-decks.md strengthened with rules from the
  data-visualization literature (Few, Knaflic, Cairo, Wilke, Schwabish, Zelazny):
  question-driven chart selection with slope, distribution, composition, dumbbell and
  Sankey rows; dual-axis ban; proportional ink; small-multiples contract; color-alone
  ban with CVD guidance; comparison-point and actionability rules for dashboard widgets;
  verifier-vs-decider audience mode; title magnitude discipline; the deck-level ask
  slide; and the out-of-context test in the deck gate.
- references/ia-and-navigation.md: information architecture and navigation rules for
  multi-screen surfaces, adapted from ia-practitioner by Sidhanth Povil (MIT, credited in
  NOTICE): seeking modes, classification-scheme selection, structural budgets, navigation
  kit and principles, label rules tied to the lock's content vocabulary, and gate hooks.

### Changed
- Golden fixture is English-native: en locale, USD formats, English voice chart, jargon
  list and disclosure inventory; pixel reference recaptured. Fixture line numbers are
  preserved so GUIDE references stay exact.
- CI runs on Node 22.

### Fixed
- Windows portability in release-check: walked paths are posix-normalized and every
  constant compared against them uses forward slashes, including the scanner's own
  pattern-class carve-out (the script previously self-flagged its regex definitions
  on Windows).

## 0.9.0 — 2026-08-09

First public-preparation release (previously developed privately as "fidelity-engine").

- Core pipeline: `capture-figma` (Figma capture → design-lock.json + derived token artifacts),
  `render` (deterministic screenshots), `geometry`, `diff` (pixel gate with per-tile ceilings and
  masks-with-budgets), `adherence-lint` (tokens, fonts, microcopy, disclosures, content-lock,
  forbidden-substitutes), `verify` (orchestrator with loop control), `new-system` (per-system
  skill scaffolding), `build-component-fixture`.
- Meta-gates: `contract-guard` (mechanical CONTRACT.md enforcement, ajv schema validation of any
  lock via `--lock`, golden-fixture self-test) and `release-check` (brand-leakage sweep with
  pattern classes, default-deny clean tree, fresh-install simulation).
- Lock features: provenance hash-chain over derived artifacts, fonts and reference images;
  `decisions[]` ledger; `netNew` referenceless screens with `lockedStrings` content lock;
  `forbidden` substitute bans; DTCG token emission.
- Docs: CONTRACT.md (the shared contract), RELEASING.md, SECURITY.md, vendored references
  (capture flow, mode routing, pixel-diff tuning, taste, microcopy).

Renamed from the working title `fidelity-engine-runtime` to `fidelity-machine`.
