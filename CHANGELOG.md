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
