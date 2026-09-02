# Changelog

All notable changes to fidelity-machine are documented here. Versioning follows semver;
lock-impacting changes are classified per CONTRACT.md §Change classes.

## Unreleased

### Added

- **`diff.mjs` findings now carry a coordinate.** Change class: patch (the report gains
  fields; PASS/FAIL verdict, thresholds and existing fields are unchanged). The report gains a
  report-level `extent {bbox, centroid, diffPixels, density}` over every unmasked diff pixel in
  the whole buffer (`null` on a passing screen), and each `worstRegions[]` entry gains the same
  shape as `inner`, scoped to that tile, both in absolute device-pixel coordinates. Printed as
  one `extent …` line after `globalPct`/`worstTile`, and appended to each `#n tile` line.
  Density read against its bbox size tells scattered rasterizer noise (low density, large box)
  apart from a substituted element (high density, small box) without opening an image first;
  see `references/pixel-diff-tuning.md` §Reading the evidence.

- **contract-guard: a `permanently-red` section (`--lock` only).** A gate lies three ways:
  it compares nothing and says pass, its metric has a blind spot where the defects live, or
  it is red on every run with no ratchet, so a new regression looks identical to the old
  known failure and nobody looks again. This catches the third. It reads
  `.report/<id>.history.json` next to the lock and WARNs per screen whose last 5 recorded
  runs all fail the pixel gate (`globalPct > passThreshold` or `worstTile > tileCeiling`)
  with no `notConverged` + `ratchet` declared. `verify.mjs`'s `updateHistory` emits the same
  notice (`RED STREAK: ...`) inline on every run while the streak holds, so the loop
  notices without waiting for the next `--lock` audit. Missing or malformed history is not a
  finding: the feature is passive. CONTRACT.md §Diff invariants gained one paragraph naming
  the three failure modes and this guard. No lock schema change and no change to the
  `.history.json` entry format; class patch per CONTRACT.md §Change classes.
- **`scripts/colour-census.mjs`, a colour-drift gate, promoted from a skill-side instrument
  into the engine (minor: additive gate; a lock is unaffected, but a screen that was passing
  under diff.mjs alone may now fail if it carries the uniform colour shift this gate exists
  to catch).** `pixelmatch` (`diff.mjs`) scores colour distance in YIQ and ignores anything
  under `35215 * PIXELMATCH_THRESHOLD^2` (352.15 at threshold 0.1), a uniform per-channel
  shift of up to ~26 levels is scored as IDENTICAL, on any number of pixels, which is exactly
  the shape of a design-system version bump. The census histograms flat colours on both sides
  of a render/reference pair, pairs deficits against surpluses by volume, confirms each pair
  by a co-located pixel walk, and classifies confirmed pairs as `reported` (a real
  substitution: `deficitFraction >= 0.25` or `density >= 0.25`, both re-measurable defaults)
  or `rasterisation` (filed, not silenced). Wired into `verify.mjs` as the gate run after
  `diff.mjs` for every screen that reaches it; a reported finding fails the screen with a
  blocker naming the count and the report path. Proven on 27 production screens before this
  move; the engine port keeps the same classifier and location output, with `--lock` now
  required (no default path) and every brand-specific comment rewritten generic.
- **`diff.mjs` prints the ceiling of a fix before anyone spends money on it.** (class: patch , 
  no generated output changes; existing report fields and verdicts are unchanged.) The report
  and stdout, after the verdict lines, now carry `gapPx` (how many pixels past `passThreshold`
  the screen sits, or under it on a pass) and `recoverable` (what the five tiles holding the most diff pixels
  hold toward that gap, as a fraction of it, and, only while failing, the minimum count of ALL
  differing tiles that would need to be fixed completely to close it). Lets a fix idea be priced
  against the gap before it is worked, instead of after: see `references/pixel-diff-tuning.md`
  §Reading the evidence, Step 0, and CONTRACT.md §Diff invariants.

- **Three reference-level disciplines adapted from screenshot-to-code** (MIT,
  github.com/abi/screenshot-to-code; security-checked and mined 2026-08-26, notes in the
  design-KB's `_extraction/screenshot-to-code.md`). No script or contract changes; no change
  class triggered.
  - `references/taste-and-composition.md` §3 — critique is judged on a full-page render
    whenever one is obtainable, and states which medium it scored from; gate script order
    unchanged.
  - `references/spec-capture.md` §Fallback B2 — authentic imagery in a reference is extracted
    at native resolution into `reference/assets/`, content-hash-named
    (`asset_<sha256[:24]>.png`), inspected against its region, and reused verbatim; the hash
    filename appearing in generated markup is the verbatim-use check. Un-extractable imagery
    goes through the existing Derived Design path.
  - `references/mode-b.md` §B2 discipline — each fix round views the full-page render
    alongside the worst-region triplets; region crops hide global drift.
  Evaluated and rejected from the same source (already covered stronger here): networkidle
  readiness (Invariant 6's `[data-render-ready]` contract), flat max-tool-turns (CONTRACT
  §Loop control), variant-set doctrine (`references/variations.md`).
- `references/delegation.md`: how to run capture, repair and verification work with cheap
  agents, generic across packages. States the build-then-attack pattern (a different agent
  verifies than the one that built), what two rounds of adversarial verification actually
  caught that the builders missed, a brief template for builders and one for adversaries,
  and hygiene rules for parallel agents (isolated render copies, no rate-limited API calls
  inside a parallel agent, computing a fix's ceiling before funding it). Class: patch, no
  script or contract behavior changes.

### Fixed

- **Brand leakage in `new-system.mjs`.** The usage comment used a real bank as its example
  system name. Replaced with `acme-banking`, the neutral example used elsewhere in the docs. The
  built-in leakage sweep could not know that term; it surfaced only when `release-check` was run
  with an explicit `--ban`. **Run the sweep with the specific brand names you have worked with
  recently, not just the defaults** — that is what `--ban`/`--ban-file` are for. Note also that a
  sweep is only valid for the tree it ran against: re-run it after the last edit, including edits
  to this file.
- **`release-check` went red on `.omc/` local session state.** A local dev plugin writes
  per-session JSON under `.omc/` at the repo root, and those files carry absolute machine paths,
  so the local-user-path pattern class failed the brand-leakage lane on a tree that ships none of
  it: the directory is gitignored and regenerates every session. `walk()` and `walkSymlinks()`
  now skip `.omc` alongside `node_modules` and `.git`. Same class as the `.git` exclusion: local
  tooling state is not release surface. Proven in both directions, green with `.omc/` present and
  containing machine paths, still red on a machine path planted in a scanned file.

### Changed

- `references/motion-craft.md` — reduced motion now documents the two strategies mature systems
  actually ship (a dedicated reduced variant of the animation vs swapping in a static asset),
  plus the two rules governing both: land on the final state rather than a paused mid-frame, and
  gate the re-trigger paths, not just the initial play. Notes the per-instance-flag-over-global
  pattern as the signal that reduced motion is a product feature rather than a courtesy.
- `references/microcopy-a11y-i18n.md` — the accessible name and the automation identifier are
  two different fields with different lifecycles: one written for a person and translated, one a
  stable machine key never announced. Plus announcing state changes, silencing decorative
  elements, and three named pitfalls.

Both references stay byte-identical across all three trees (engine + two studios); verified by
hash after propagation.

- `references/spec-capture.md`: two corrections from measured work on 2026-09-02. Class:
  patch, correction and clarification, no generated output changes behavior.
  - §Authentic assets gains an exception, under transforms: verbatim asset reuse holds
    only at identity scale on integer device-pixel boundaries. An icon composited under
    `transform: scale(0.9615)` still diffed at 66px after the reference's own pixels were
    substituted in (down from 114px, not to 0), because the compositor resamples a bitmap
    under a non-identity transform. States the two honest options: export the asset at
    final device size and place it at identity, or accept and record the residual.
  - New §Figma REST fallback, for when the MCP is unreachable for lack of a seat: on the
    first `429`, read `Retry-After` and `x-figma-rate-limit-type` before retrying. A
    plan-tier cap returned `retry-after: 331775` (about 3.8 days) while `/v1/me` kept
    returning 200; a 200 there does not mean the file endpoints are open. States the stop
    rule (record the reopen time, stage the scripts, do not blind-retry) and the token
    handling rule (read only inside a header, output only to a file via `-o`, never
    echoed).

## 1.0.0 — 2026-08-14

First stable release. The gate is proven by tests that are themselves tested.

### Added
1. README with the full story: why fidelity beats generation speed, pain points, how this
   differs from generators, linters, token pipelines and screenshot testing, ASD-STE100
   install steps with per-step verification, and an animated demo of the gate catching a
   raw-hex defect (docs/demo.gif).
2. GUIDE.md: a 15 minute guided tour on the golden fixture with one deliberate failure,
   shown red, then fixed and shown green.
3. FAQ.md: twelve questions, including platform support and "the machine outranks the agent".
4. CI (.github/workflows/ci.yml): static gates on Ubuntu and macOS, the pixel self-test on
   macOS as the reference platform, and an experimental non-blocking Windows lane.
5. setup-check now prints the project wordmark banner as its first line.
6. release-check: reviewed-GIF carve-out for docs/*.gif (magic-byte checked, 10 MB cap),
   .yml added to the ship allowlist, .git excluded from tree walks.
7. Surface-craft references for three new artifact classes, adapted from diagram-design by
   Cathryn Lavery (MIT, credited in NOTICE): references/diagram-craft.md (connector rules,
   complexity budgets, semantic node treatments), references/dataviz-craft.md (chart specs,
   series color discipline, data honesty rules, dashboard composition), and
   references/slides-and-decks.md (deck grammar, editorial page anatomy, 2x2 variants,
   dark-slide derivation). skill-template.md now routes generators to them per artifact type.
8. adherence-lint: an `a11y` section covering the mechanical half of an accessibility
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
9. contract-guard: a `fault-injection` section that mutates a temp copy of the golden
   fixture one defect at a time and requires each a11y check to go red, plus a control
   asserting the pristine fixture stays clean. Runs on every invocation, no browser needed.
   A check that cannot fail is not a check, and nothing else in the suite would notice a
   section accidentally reduced to a no-op.
10. fixtures/golden/screen-home.html gained a `:focus-visible` rule. The fixture shipped a
   button with no keyboard focus style, which the new check correctly rejected. Inserted
   after the `.btn` block so `screen-home.html:42` still points at the line GUIDE.md and the
   demo GIF cite, and the rule does not render unfocused, so the golden reference PNG is
   unchanged (proven by the pixel self-test).
11. references/surface-classes.md: the engine generates for phones, desktop apps and websites
   from the same lock and previously had no notion of which, so mobile-shaped defaults reached
   pointer surfaces by omission. It separates two questions that had been conflated: **what the
   user touches the screen with** decides target sizes and whether hover is load-bearing, while
   **how wide the screen is** decides layout, density and navigation pattern. Target floors
   follow the input class and never the width, because every common tablet in landscape (1180 to
   1366px) is wider than most desktop breakpoints while remaining a pure touch device, so a
   width-keyed rule would hand a finger-operated screen a 24px target and the gates would
   certify it. An undeclared class resolves upward to touch, since 44px on a pointer surface is
   merely roomy while 24px on a touch surface is unusable. Adapted from genjutsu (MIT, credited
   in NOTICE); routed from skill-template.md section 1.
12. taste-and-composition: the hit-area rule said `≥44×44px touch, ≥40×40px dense desktop`. The
   desktop figure was a number picked once for mobile-era work: WCAG 2.5.8 sets the pointer
   floor at 24×24 and real dense desktop systems run 24 to 32px icon buttons, so a faithfully
   captured system would have sat permanently in violation of the engine's own rule, which is
   how a guideline gets ignored. Now keyed by surface class and anchored to the WCAG level
   rather than to a chosen number, with the captured system explicitly outranking the default.
13. ia-and-navigation: the hover-only navigation ban was justified only as "unusable on touch".
   On a pointer surface the failure is that it is unreachable by keyboard. Both are now stated.
14. references/motion-craft.md: the engine has carried `tokens.motion.durationsMs` and
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
15. references/modern-css.md: scroll-driven animations, view transitions, `@starting-style`,
   anchor positioning and container queries, with the layered fallback ladder (start visible,
   then enhance) that prevents the blank-page failure where content begins at opacity 0 and the
   animation never runs. Two traps specific to this pipeline: the pinned render browser confirms
   a feature works in that build and nowhere else, so support decisions are never made by
   observing a green diff; and only the container-query branch that applies at the capture
   viewport is ever pixel-verified. Deliberately ships no browser-support table, because a stale
   one gets believed.
16. references/scope-contract.md: size a request before running the pipeline on it, and state
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
17. references/variations.md gained a "Showing the set" section: ask once how the reviewer
   wants to see options and keep that mode for the session, show only values that are in the
   lock or the annotation (anything else becomes a second unvalidated spec), treat the
   comparison bundle as throwaway, and show a variation's reduced-motion state beside it.
   Adapted from genjutsu by Adrien Thevon (MIT, credited in NOTICE).
18. references/variations.md: how to produce a set of alternative solutions to the same
   problem inside a locked system. Declared axes instead of undeclared restyling, the
   substantive-change test, restrained-to-bold ordering, and the rule that every variation
   is still a lock screen: lint-clean, full disclosure inventory, own self-critique, and an
   explicit statement of which gates ran (a net-new variation has no reference, so the pixel
   gate does not apply to it). Adapted from claude-design-system-prompt by Trystan-SA (MIT,
   credited in NOTICE); routed from skill-template.md.
19. dataviz-craft.md and slides-and-decks.md strengthened with rules from the
   data-visualization literature (Few, Knaflic, Cairo, Wilke, Schwabish, Zelazny):
   question-driven chart selection with slope, distribution, composition, dumbbell and
   Sankey rows; dual-axis ban; proportional ink; small-multiples contract; color-alone
   ban with CVD guidance; comparison-point and actionability rules for dashboard widgets;
   verifier-vs-decider audience mode; title magnitude discipline; the deck-level ask
   slide; and the out-of-context test in the deck gate.
20. references/ia-and-navigation.md: information architecture and navigation rules for
   multi-screen surfaces, adapted from ia-practitioner by Sidhanth Povil (MIT, credited in
   NOTICE): seeking modes, classification-scheme selection, structural budgets, navigation
   kit and principles, label rules tied to the lock's content vocabulary, and gate hooks.

### Changed
1. adherence-lint no longer walks `dist/` or `*.preview.html`. Both are generated,
   self-contained bundles of screens already linted from their own sources, so scanning them
   reported every finding twice and fed multi-hundred-KB inlined documents to scanners that
   degrade superlinearly. Measured on a real capture: a full-directory run that previously did
   not finish in five minutes now completes in **0.9 seconds**. Backported from a private
   install. Being precise, because the number invites the wrong conclusion: this stops feeding
   the scanners pathological input, it does not fix the superlinear behaviour, and a genuinely
   large source file outside those paths still takes minutes.
2. Golden fixture is English-native: en locale, USD formats, English voice chart, jargon
   list and disclosure inventory; pixel reference recaptured. Fixture line numbers are
   preserved so GUIDE references stay exact.
3. CI runs on Node 22.
4. A Chromium build mismatch is now **exit 2 (setup error) instead of a warning**, matching the
   behaviour the studio forks have shipped since July. A different build rasterizes text,
   antialiasing and compositing differently, which invalidates both the noise-floor calibration
   and every stored reference image, so continuing produced a diff that looked authoritative and
   meant nothing. That is a setup problem for a human to fix, never a fidelity finding. Absent
   `meta.chromiumBuild` is still not checked here, since there is nothing to disagree with.
   CONTRACT.md determinism invariant 1 and references/pixel-diff-tuning.md updated to match.

### Fixed
1. Windows portability in release-check: walked paths are posix-normalized and every
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
