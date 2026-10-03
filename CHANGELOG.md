# Changelog

All notable changes to fidelity-machine are documented here. Versioning follows semver;
lock-impacting changes are classified per CONTRACT.md §Change classes.

## Unreleased

### Added

- **`adherence-lint.mjs --json`, `--list-sections`, `--self-test`, and a `suggestion` field**
  (class: patch — the human report is unchanged byte for byte except the `provenance` row noted
  under Changed; exit codes unchanged). `--json` emits NDJSON: one finding per line (`level`,
  `section`, `group`, `file`, `line`, `detail`, `suggestion`) and one summary line with
  per-section counts, the sanitized `lint.note` once, and the PASS/FAIL result; it carries the
  same information as the human report, so `eval-correction.mjs` and any future wrapper can
  stop regex-parsing prose. The "use this instead" text (nearest token, nearest scale value,
  did-you-mean variable, jargon replacement) is its own field at the six sites that had fused it
  into the message. `--list-sections [--json]` prints the registry — name, group (lock / source /
  microcopy / gate-integrity), and the levels each section can emit, read from the script's own
  call sites, never a hand-kept list; a level or section passed as a variable is listed as
  dynamic with its function. `--self-test` checks the registry against itself: every registered
  section has a call site, every call site names a registered section and a correctly spelled
  level, the golden fixture passes under `--json`, and JSON and human output report the same
  findings. CONTRACT.md §Invocation contract. Re-expresses the shared-findings-stream and
  rule-registry ideas of display-dev/visualize (MIT, see NOTICE), with the self-test they lacked.

- **`eval-correction.mjs` judges only what changed, says what it did not verify, and never scores
  a crashed gate as clean** (class: minor — new optional task field `capture`; results.json rows
  and summary gain fields; no outcome label changes meaning). The first real run exposed three
  ways the runner could flatter itself. (1) A task whose pressure never fired — condition A was
  already clean, so no correction happened — was still judged, A against itself, and counted
  toward the intent-preservation rate; the judge now runs only when pressure fired, when the
  task's `capture` state (`static` | `hover` | `motion`, default static) is one a static render
  can show — hover/motion rows report the judge as Not verified while the mechanical deletion
  check still runs — and when C's result differs from A's in file content after whitespace
  trimming or in rendered pixels (a correction that lands in `tokens.css` leaves the file
  unchanged and the render changed; it is judged). Skipped and unscored judges keep separate
  counters. (2) Every corrected row carries a coverage table — Reviewed / Not verified / Not
  applicable per area (static lint, A/C renders, intent judge, provenance judge, capture state)
  — and the summary prints the not-verified count beside the rate it would have inflated.
  (3) A lint result without a verdict is not a clean verdict: the `RESULT` line must be present,
  must match the exit code, and its counts must equal the finding lines actually parsed;
  anything else is a crash that errors the task, and a crash on the preflight baseline stops
  the run before the first model call (previously a lint that died on load read as "no
  findings" — every task clean, exit 0). Also new: a rewrite ratio per row and in aggregate
  (share of lines not preserved between A's and C's output, via a line LCS, whitespace-
  insensitive) with a 0.40 reading line adapted from display-dev/visualize's iteration-verb
  guard — reported as a diagnostic, never folded into a rate or a label, until three runs
  agree on its meaning. HARNESS.md (the normative contract) states each rule first; LANES.md's
  `evals-files` lane validates `capture`.

- **`render.mjs` records every request that leaves the lock's tree, and refuses them when the
  lock says offline** (class: minor — new optional lock field `render`; geometry JSON gains
  `network`, `externalRequests`, `externalRequestCount`; an untouched screen renders byte-
  identically, same stdout, same PNG). Pixel-diff determinism assumes every byte the page
  paints came from the lock's own tree; a stylesheet or font fetched off-tree can change
  between runs and the diff blames the generator. Every request is classified — the main
  document (found structurally through the navigation request and its redirects, never by
  string equality with the lock url), `data:`/`blob:`/`about:`, and `file://` paths inside the
  lock's directory are internal; everything else is external — and the external ones are
  recorded with host, resource type, failed/blocked flags, credentials stripped. When there are
  any, one stderr line names up to five hosts and the two fixes (bundle it, or allow the host);
  `verify.mjs` forwards that line on a passing run. `render.network: "offline"` (with bare
  hostnames in `allowHosts`) aborts any external request to a host not allowed and exits 5 — a
  packaging fact about the screen, not a styling fault — naming the URLs; the check runs after
  readiness and again after the screenshot, which is captured to a buffer and written only when
  clean, so a refused run leaves no new output; it also covers what the route hook never sees
  (WebSockets, which cannot be aborted; credentialed URLs, which Chromium drops first). Nothing
  in a listener can throw: an unparseable URL is external with a null host. Known limits are in
  the header comment (symlink inside the lock pointing outside counts as inside; a different-
  case path counts as outside; the refusal message can be lost when the page navigates away
  after readiness — the exit code is still 5). CONTRACT.md §Determinism invariants 8.

- **`scripts/lint-negatives.mjs` and `fixtures/lint/` — every lint section proven able to fail**
  (class: minor, new script + fixtures + one CI step). The gate had 26 sections and one
  expected-pass fixture; nothing proved each section still fires on the fault it exists for.
  Each section now has a minimal negative fixture — a clean base lock plus source with exactly
  one planted fault — and a manifest row naming the section and level it must fire at. The
  runner asserts the declared finding, rejects any finding outside the fixture's own section,
  checks every section and level the manifest names against the registry (a fixture claiming a
  level its section cannot emit tests nothing), and fails when a registered section has neither
  a fixture nor a reasoned `uncovered` entry — uncovered entries print every run, never silently.
  The fixture manifest shape re-expresses display-dev/visualize's (MIT); the coverage gate is
  the part they lacked. Exit 0 all pass · 1 any failure · 2 setup/usage.

- **`adherence-lint.mjs` — five sections the references had promised and the gate did not have**
  (class: minor — new sections, new findings; golden gains one SKIP line and five summary rows, no
  ERROR). A constraint audit found three references stating the lint enforced things it did not.
  Now it does, and the sentences say exactly what fires. `raw-motion` (ERROR when the lock declares
  `tokens.motion`, otherwise one SKIP saying so): a literal duration or easing in a transition or
  animation declaration outside token scope — or in a custom property declared outside token scope,
  the same dodge raw-hex closes for colour — with the nearest lock duration or the matching easing as
  the suggestion, including the property name and syntax to write. `tabular-nums` (WARN): a table whose
  body cells are predominantly numeric with no rule reaching those cells that sets
  `font-variant-numeric: tabular-nums` or `"tnum"` on (`"tnum" 0`/`off` do not count; `@media print`
  rules do not reach). `text-wrap` (WARN): headings of three words or more with no rule reaching them
  that sets `text-wrap: balance|pretty`. `radius-arithmetic` (WARN; SKIP per value it cannot read): a
  radius literal — shorthand, physical and logical longhands, inline style — that is neither on the
  lock's radii scale nor a container radius minus a spacing step (the concentric rule made
  checkable), with the derivation as the suggestion. `scheme-mixing` (ERROR; SKIP per linked
  stylesheet it cannot read): for a screen with `colorScheme`, a `data-theme`/`color-scheme`
  attribute on a tag, a `color-scheme:` declaration or `<meta name="color-scheme">` that disagrees
  with the screen's scheme, more than one `data-theme` value in the file, or — when the lock has
  more than one mode — a raw value from the other mode's palette, read across the screen and its
  linked stylesheets. Each ships with its negative fixture (31/31); the 26 existing fixture bases
  gained motion and radii tokens so every fixture still fires only its own section. The
  enforcement sentences in `references/motion-craft.md`, `references/taste-and-composition.md` and
  `references/slides-and-decks.md` were narrowed to what the code does — including the admission
  that "title/body ratio" and "one-accent" have no section (type-scale checks sizes, not the ratio;
  one-accent is enforceable only as a lock signature grep). Known limit, stated in the headers:
  selector matching is by last compound; a rule whose selector list includes `:root` hides inside
  token scope from raw-hex, raw-motion and radius-arithmetic alike.

- **`release-check.mjs` lane 1 gains two prose-leak pattern classes** (class: patch; Markdown
  files only — in code the same shapes are legitimate identifiers and string data). One catches
  prose that cites an agent's private memory or feedback notes as authority — a public reader
  cannot open the cited note, so the claim is unverifiable. The other catches the doubled or
  clashing article a find-and-replace of a name leaves behind, across whitespace and emphasis
  markers, with the capitalisation cases that are labels (an A/B/C design) kept silent. Each
  class prints its own Fix line; output for the existing classes is unchanged. Known limit: a
  scar split across a line wrap is not caught. Both shapes were found in a sibling tool's public
  docs during the review that motivated this release.

- **`references/spec-capture.md` — evidence tiers** (class: patch, docs only). The context
  ladder said WHERE a value came from (rung 1–6); a new subsection says HOW it was obtained:
  Measured / Derived / Inferred, with the rules never promote a tier, a screenshot-only capture
  is a reconstruction (name what stays relative), and disagreeing sources stay visible as a
  provisional `decisions[]` row rather than averaged. The tier travels with the rung into the
  pre-flight (`references/mode-b.md`) and into `decisions[].rationale`.

### Fixed

- **`adherence-lint.mjs` — three defects the negative-fixture suite and the review surfaced** (class:
  patch; golden output byte-identical; the em-dash fixture's reported line changes because it was
  wrong). (1) `em-dash` and `banned-jargon` reported the line of the first RAW occurrence in the
  file — an HTML comment, the `<head>`, an attribute — while their counts came from visible text;
  the non-visible stripper gained a line-preserving twin, so the line is now the first visible one
  and multi-word jargon is matched across line breaks (fuzzed against an independent oracle: zero
  mismatches, visible text unchanged). (2) The `assets/` exclusion in `imagery-provenance` and
  `signatures` tested a field the file records never had, so it never applied — an undeclared svg
  under `assets/` was flagged as screen source and a signature living only in `assets/tokens.css`
  satisfied a check meant for generated screens, including on the layout `eval-correction.mjs`
  lints; it now excludes exactly the lock's own derived folder, and a file any `screens[].url`
  resolves to is never excluded whatever its folder (two candidate rules — any parent named
  `assets`, or `--src`-relative — both failed open and were rejected with proofs). A verdict can
  change: a signature that only matched under `assets/` now fails. (3) A stylesheet of a few
  thousand lines took seconds to minutes: `banned-fonts`' rule regex rescanned every brace-free
  suffix when the sheet ended in a comment (quadratic); the lookbehind pin `stripTokenScopes`
  already carried fixes it — 8k comment lines ~38 s → 0.13 s, 20k from past the eval timeout to
  0.2 s, identical output over 300k fuzzed stylesheets. The `<head` pattern in both scanners also
  matched `<header` (quadratic without `</head>`, 16k headers 8.2 s → 0.1 s) and hid header text
  browsers show. Also: the human report is no longer truncated when piped to a slow reader
  (`process.exit()` right after the last write dropped everything past 64 KiB, RESULT line
  included; lint runs now set `exitCode` and return).

### Changed

- **`adherence-lint.mjs` registers `provenance`** (class: patch; human output gains one Section
  summary row). The section had fired at five call sites since the provenance work landed but
  was never added to `SECTIONS`, so its findings sorted last and never appeared in the summary
  — the golden fixture carries one such WARN. Found by `--self-test` on its first run. Now in
  the gate-integrity group after `figid-coverage`, so no other section's position changes.
- **`adherence-lint.mjs` sanitizes every lock-sourced string it echoes** (class: patch; no change
  on well-formed locks). `lint.note` had been sanitized since the previous release; a jargon
  replacement, a mask reason or a screen id could still inject a forged `RESULT: PASS` or
  `[SKIP]` line into the human report. `detail` and `suggestion` now get the same treatment
  (control and format characters blanked, whitespace collapsed); the `file` label has control
  characters and line terminators blanked without collapsing spaces, so real relative paths
  survive byte for byte. `--json` additionally escapes the U+2028/U+2029/U+0085 separators.
- **`adherence-lint.mjs` schema-sanity validates the optional `render` lock policy** (class:
  patch): object with only `network` ("observe" | "offline") and `allowHosts` (bare hostnames —
  no scheme, port, userinfo or whitespace, which render.mjs would refuse and which would
  silently never match a request). A misspelled policy is caught by the cheap gate that runs
  first, before a render is spent on it.

- **`references/print-collateral.md`** (class: patch, docs only, no lock impact). The process
  for objects that leave the screen (badges, lanyards, roll-ups, backdrops, lectern panels,
  print specification sheets): intake as a checklist with the applied-element rule (design for
  what covers a zone, not what is printed under it), guideline mining with page citations,
  physical constraints encoded in trim millimetres (hardware safe zones, insert zones, edge
  rules), two render routes (HTML through Chromium via `export-print`/`print-boxes`, or native
  CMYK PDF objects with a Ghostscript pass) under one gate set (page size, ink separations,
  font table, QR decode at 160 dpi or more, visual), measurement-driven iteration (type fitted
  by width, placement measured from the render, source-geometry limits stated as trades), the
  rebuildable delivery set ending in a spec sheet generated from the print files, textile
  notes, and the intake questions for the next pieces. Routed from `skill-template.md`.
  `skill-scaffold/root/tools/README.md` gains the matching `print-check` tool contract
  (page size, `inkcov` separations, font table, QR decode; `--self-test` with three planted
  faults), route-agnostic next to `export-print` and `print-boxes`.

- **`scripts/probe-blind-spots.mjs`** (class: minor, new script, no lock impact). Measures a
  screen's blind spots instead of writing them down: injects a fixed set of faults
  (font-family swap, letter-spacing, font-weight, +20/+40-per-channel colour shift of the
  first matching `tokens.colors.light` variable) one at a time into a fresh `os.tmpdir()`
  copy of the screen, runs `render.mjs` + `diff.mjs` (and `colour-census.mjs` when present)
  against each, and reports which gate caught it, or that nothing did. Nothing in the
  caller's tree is written except `.report/<id>.blind-spots.json` next to the lock (or
  `--out <dir>`). CONTRACT.md §Blind-spot probe; `references/pixel-diff-tuning.md` §Measuring
  a screen's blind spots.
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
- **`references/eval-harness.md`.** How to rank generator configurations (model vs model,
  prompt vs prompt, mode vs mode) across a fixed dataset, and how that composes with the
  gates: pixel-diff scores one artifact against its reference, the harness ranks
  configurations, and where a dataset item has an exact reference the gate's diff margin is
  the metric. Anchored 0-4 human scale where references are inexact, three runs per
  configuration, prompt-report logging, distinctive fixtures, done-detection by affordance,
  and judge-design rules for model-as-evaluator (one failure dimension per judge, critique
  before verdict, a borderline few-shot judged Fail). Adapted from screenshot-to-code's
  evaluation and QA discipline (MIT, Abi Raja) and the verbalized-sampling judge set (MIT,
  George Nurijanian); both credited in NOTICE. Class: patch, no script or contract changes.
- **`references/color-science.md`.** The science that keeps the engine's color measurements
  honest: which space for which job (OKLCH to derive and judge, exact hex to store and
  compare, HSL for nothing); where perceptual uniformity bends (near-black grain needs wider
  token separation; a display gamut holds on the order of a thousand distinct regions, which
  contextualizes the census); gamut existence checks at capture (a written OKLCH value can
  silently refold in the browser); the APCA contrast ladder with the engine stance "design
  to APCA, verify to WCAG" (conformance stays on the numbers the law cites); color-vision
  deficiency simulation with the size-dependent distinctness rule; and a palette-extraction
  pipeline for B2 and rung 3-5 captures (cluster in OKLab, overshoot then merge,
  representative pixel over centroid, phantom guards). Findings re-expressed and attributed
  to their named originators, as curated in skill.color-expert (CC-BY-4.0 curation, David
  Aerne); credited in NOTICE. Class: patch, no script or contract changes.
- **`skill-scaffold/` — the project tree around a SKILL.md, scaffolded by `new-system.mjs`.**
  (Class: minor — new files plus a new-system behavior extension; no lock impact, no gate
  changes.) Generalized, brand-scrubbed, from two shipped skill builds that proved the
  process out. `new-system.mjs` now instantiates, beside SKILL.md, everything else those
  builds carried: the durable docs (AXIOMS, DECISIONS ledger, LESSONS, REGENERATE with the
  Deletion Test, a per-skill CHANGELOG); an `evals/evals.json` starter whose four cases
  derive mechanically from the template's own rules (incl. the should-not-trigger negative);
  capture-side ledgers (BRAND-FACTS, MOTION, GATE-BLIND-SPOTS, components INDEX + SELECTION
  with the "never pick" section, reference APPROVALS); a generic `formats.json` (screen
  formats px-first, print formats millimetre-first, story safe zones); slide/social/print
  layout skeletons; a distribution-playbook skeleton (occasion → asset → channel routing,
  caption and cadence sections to fill in); `gauntlet/LANES.md` (the eight-lane standing
  board as lane contracts);
  and `tools/README.md` — contract-first specs for the deck pipeline (build/pdf/pptx with the
  images-not-text honesty rule), the mm-first print pipeline (incl. the measured Chromium
  page-size snapping correction and the px→pt 96/72 conversion), and the brand-lint
  companion. `skill-template.md` gains the facts blocking gate, SELECTION-first component
  routing, a "system specifics" section stub, and the module index table.
- **`adherence-lint.mjs` findings now carry agent-first diagnostics, two new checks widen
  static coverage, and the new `lock.lint.note` field is sanitized against report injection.**
  Change class: minor (new lock-optional fields, two new SECTIONS entries; no existing check's
  level changes and no existing PASS/FAIL verdict changes). Diagnostic style adapted from
  @shadcn/lint (MIT, github.com/shadcn-ui/lint; credited in NOTICE).
  - `raw-hex`: every off-token hex now resolves the nearest `tokens.colors.light`/`.dark` token
    in OKLab space (self-contained sRGB→OKLab conversion, Björn Ottosson's matrices) and
    appends one of three bands, calibrated against this lock's own inter-token spacing: at or
    under ΔE-ok 0.02, "same color — use var(--x)"; up to 0.10, "nearest lock token var(--x)
    (ΔE-ok …) — prefer reusing it; if the design truly needs a distinct value, lock change +
    DECISIONS.md entry first"; past 0.10, a flag that the value is genuinely off-lock. Names
    the real token stylesheet path that was scanned (or an honest fallback when none exists),
    not an asserted `assets/tokens.css`.
  - `css-vars`: an undefined `var(--x)` now suggests the nearest defined var name
    (`did you mean var(--y)?`) with a budget scaled to the name's own length, and a
    deterministic (lexicographic) tie-break independent of file declaration order. A
    single-edit typo (e.g. `--rad` → `--red`) can still suggest even on a 3-character name —
    only a 2-edit suggestion is suppressed there, where random short pairs collide too often
    to be a reliable signal.
  - `tokens-only-spacing`: the WARN now leads with the nearest on-scale value(s) before the
    full scale; an exact tie names both neighboring values instead of rounding down silently.
  - New optional `lock.lint.note` (string, ≤200 chars): appended to every *printed* finding's
    detail at report time; the underlying findings array is untouched. Sanitized before
    printing — Unicode control/format characters (e.g. ANSI escape bytes) blanked first, then
    all whitespace including newlines collapsed to single spaces, then trimmed, then capped —
    so a lock (an input artifact) cannot inject extra report lines (e.g. a forged
    `RESULT: PASS …`) or terminal control sequences into the gate's report.
  - New section `type-scale` (source group): flags `font-size`/`font-weight` (CSS, `<style>`,
    `style="…"`, Tailwind `text-[Npx]`) off the sizes/weights declared in
    `tokens.typography.<role>`, unioned with `lock.fonts[*].weights` for weight legality; WARN,
    heuristic, same class as `tokens-only-spacing`. Skips `@media` blocks (no breakpoint
    dimension in the lock to judge them against). SKIPs the whole check when the lock's
    typography carries no numeric size, and separately reports, per file, how many
    `font-size`/`font-weight`/`font:`-shorthand declarations it could not statically read
    (rem/em/%/clamp/var for sizes; a keyword like `bold` or `var()` for weights) — unchecked
    is reported as unchecked, never as clean.
  - New section `unreadable-values` (gate integrity group): WARNs, once per file+construct
    (naming the site count and first line), when a `.js`/`.jsx`/`.tsx` file — or an inline
    `<script>` inside a `.html` file — builds a `className`/`class`/`style` value at runtime:
    template-literal interpolation, `setAttribute`, `Object.assign(<x>.style, …)`, or
    bracket-form `style[...]` assignment unconditionally; string concatenation and array
    `.join` only when the expression sits inside one of those same class/style sinks — never
    on ordinary string building elsewhere in the file. Names its own remaining blind spots in
    its header comment (CSS-in-JS tagged templates, framework binding syntax, JSX inline style
    objects with a non-literal value, `innerHTML`, external `<script src>`) rather than letting
    an untested class read as "clean".
- **`skill-scaffold/root/evals/tasks.json` + `HARNESS.md`** (class: minor, new scaffold
  files, no lock impact). The skill-scaffold's evals grow from 4 static trigger-cases
  (`evals.json`, unchanged) to also carry a before/after correction-experiment methodology,
  adapted from @shadcn/lint (MIT, github.com/shadcn-ui/lint; credited in NOTICE).
  `tasks.json` ships two task suites — `temptation` (6 generic off-lock asks, each verified
  against `adherence-lint.mjs`'s actual `add()` calls and tagged `expected_severity`: two are
  `raw-hex`/`transition-all` ERROR pressure, two are `tokens-only-spacing`/`banned-fonts`
  WARN-only pressure scored on findings rather than exit code, one is `judge-only` — a
  fabricated-fact temptation no lint section can see, scored solely on the judge's
  provenance question — and one is a gate-bypass request scored separately) and `neutral`
  (4 plain assembly briefs as a false-positive baseline). `HARNESS.md` is the
  correction-experiment contract: an A/B/C design (A = ungated agent with the skill's normal
  lock/context, C = A's output corrected against verbatim lint findings, optional B control
  isolating what the diagnostics add over the rules prose alone), five outcome labels
  (`within-lock`/`lock-extended`/`gate-dodge`/`non-convergent`/`errored`, with `gate-dodge`
  outranking the others), and an intent-preservation judge whose mechanics are inherited from
  `references/eval-harness.md` (anchored scale, binary vote, position-randomized) — a gate
  pass earned by styling less or dropping the asked-for element is a FAILURE, not a pass.
  Names primary metrics (correction rate, rounds-to-clean at N=3, false-positive rate,
  intent-preservation rate) and cross-references `references/eval-harness.md` (configuration
  ranking) without blurring into it. `gauntlet/LANES.md`'s `evals-files` lane now also checks
  `tasks.json`'s `file` path convention and asserts every ERROR/WARN `expected_severity`
  names a section whose `add()` calls can produce that level (`judge-only`/`n/a`/neutral
  tasks exempt). `skill-scaffold/README.md`'s phase-5 line now names both new files.
- **`scripts/eval-correction.mjs`** (class: minor, new script, no lock impact). The
  correction-experiment runner: implements `skill-scaffold/root/evals/HARNESS.md` as code — does
  a correction round driven by `adherence-lint.mjs`'s findings move a task from off-lock to
  on-lock, without quietly deleting what was asked for. Runs every `tasks.json` task through
  condition A (fresh agent, the sandboxed lock AND `--src-context` tree — MINUS `evals/` and
  `gauntlet/`, the experiment's own answer key, which condition A never sees — no gate) and
  condition C (A's exact output + verbatim lint findings scoped to the task's own output file,
  path-normalized so `out//x.html` and `out/x.html` compare equal, with NO baseline masking on
  that file — a task whose output file already exists before condition A runs is `errored`, never
  scored — up to `--rounds` rounds, early-stop on a clean scored signal). With `--control`,
  condition B (rules prose, no diagnostics, the same hidden-lint stop rule, also screenshotted and
  judged). Scores each task by its `expected_severity` exactly as HARNESS.md specifies (ERROR: an
  ERROR finding on the task's own file; WARN: the named section's finding on that file;
  `judge-only`: a provenance question put to a judge model, an unscored judge makes the task
  itself errored; `n/a`: whether the gate ran at all; `neutral`: condition A only, the same
  file-scoped false-positive rate). Labels each corrected task within-lock / lock-extended /
  gate-dodge / non-convergent / errored — gate-dodge (a judge verdict of intent-lost, or a
  mechanically detected deletion) outranks a lint-clean result; a judge that returns no parseable
  verdict, OR never ran at all because both renders were empty, is flagged (one shared
  `judgeUnscored`/`unjudgeable` accounting) and excluded from the intent-preservation rate rather
  than silently read as a pass. **The correction rate itself is gated on `pressureFired`** — a
  task whose expected pressure never produced a finding in condition A is reported as its own
  excluded count, `Pressure never fired : N/M`, never folded into a flattering rate. The
  intent-preservation judge screenshots condition A's and C's output (Playwright, self-contained
  HTML; a body that renders no visible content — head/title text does not count — is `errored`
  before ever reaching the judge), randomizes which screenshot is labeled BEFORE/AFTER per pass,
  and majority-votes across `--judge-passes` with a critique-written-before-verdict response
  schema (references/eval-harness.md's judge-design rules; some prompt phrasing follows the
  before/after methodology HARNESS.md itself credits to @shadcn/lint, MIT, see NOTICE).
  `--mock <script>` replaces every `claude` CLI call (agent or judge) with a caller-supplied
  script that receives the exact same argv a real call would. Every `task.file` is validated at
  load time (an absolute path, or one that escapes its sandbox after `path.posix.normalize`, is a
  setup error naming the task id) and re-asserted at every point it is resolved against a
  sandbox — the claim that nothing is written outside `os.tmpdir()` and the results dir is now
  enforced, not merely assumed. A real run does one minimal auth/CLI preflight before the task
  loop starts, so an expired session aborts once with the CLI's own message instead of every task
  producing an identical, uninformative `errored` row. Every `spawnSync` carries
  `killSignal: 'SIGKILL'` so a misbehaving child cannot wedge the runner past its configured
  timeout. `<out>/run-<ISO>/results.json` (default `<lockDir>/.eval-correction`) carries cost,
  token and wall-time totals per task and per run; a mock run's `results.json` carries
  `"mode":"mock"` and the printed summary visibly shouts MOCK.

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
- `references/dataviz-craft.md` deepened from the design-KB mining wave: bump chart,
  ridgeline and beeswarm join the selection table; a per-type table of the one lie each
  chart type invites, checked by the self-critique; six new honesty rules (crowding is
  data, round once then draw from the rounded number, drift checked as relative error,
  disclose the missing and never impute it, a connector is a gap and not a trajectory,
  tight domains disclosed with the bar/slopegraph/dumbbell distinction); per-genre anatomy
  specs; theme-safe ramp language ("stronger contrast is larger", never "darker is
  larger": the legend sentence that ships false in one theme); contrast computed on
  composited colors with the border trick for small marks; a data-color-scales section
  (sequential, diverging and categorical scales with the flat-derivative test and
  generate-score-then-lint); and a bind-the-number-to-the-mark verification hook.
- `references/spec-capture.md` gains a live-product reference capture flow for rung 3
  sources: stitched full-page capture over one-shot fullPage, settle on signals rather
  than stopwatches, container-scroller detection, isolated browser profiles with
  bot-check and login-wall detection by name, sharding past ~16,000px, checking the
  output rather than the exit code, contiguous section crops, and actuate-before-capture.
  Adapted from Skills by Meng To (MIT); credited in NOTICE.
- `skill-template.md`: the per-artifact routing block now routes color work beyond pasted
  lock values to `color-science.md`, and generator-configuration comparisons to
  `eval-harness.md`.

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
