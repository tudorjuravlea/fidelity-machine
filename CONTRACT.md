# Shared contract — fidelity-machine

Every script, reference, and per-system SKILL.md obeys this file. It exists so
independently-written parts cannot drift. If a change is needed, change it HERE first, then
conform the parts.

## Topology: one shared ENGINE, thin per-system SKILLS

The machinery is design-system-agnostic and lives ONCE in the engine. Each design system gets
its own thin skill (slash command + lock + fonts + captures) scaffolded from the engine's
template. Fix a script → every system benefits; add a system → scaffold + capture, no code.

```
~/.claude/fidelity-machine/           # THE ENGINE — shared, not a skill, never registers
├── CONTRACT.md                      # this file
├── design-lock.schema.json          # JSON Schema for every design-lock.json (the SSOT shape)
├── skill-template.md                # per-system SKILL.md template ({{SYSTEM_NAME}} etc.)
├── RELEASING.md · SECURITY.md       # release discipline (human half of release-check) + security policy
├── package.json + node_modules/     # runtime deps: pixelmatch, pngjs, playwright (browsers cached globally)
├── fixtures/golden/                 # engine self-test fixture + fault-injection target
├── scripts/
│   ├── new-system.mjs               # scaffold ~/.claude/skills/<name>/ from the template
│   ├── setup-check.mjs              # readiness gate — verify deps; NEVER installs
│   ├── capture-figma.mjs            # Figma MCP output → design-lock.json + derived token artifacts (§Provenance)
│   ├── render.mjs                   # deterministic screenshot + geometry dump
│   ├── geometry.mjs                 # DOM boxes vs lock figIds rects
│   ├── pixelmatch-threshold.mjs     # single source for PIXELMATCH_THRESHOLD; diff.mjs and any skill-side colour-drift instrument that must agree with it import this instead of duplicating the literal
│   ├── diff.mjs                     # pixelmatch gate: global + per-tile + triplet crops
│   ├── colour-census.mjs            # colour-drift gate: catches uniform shifts below diff.mjs's YIQ cutoff
│   ├── adherence-lint.mjs           # static gate: tokens, fonts, microcopy, jargon, disclosures, caps
│   ├── verify.mjs                   # orchestrator: per-screen lint→render→geometry→diff→census, loop control
│   ├── contract-guard.mjs           # meta-gate: enforces THIS document's invariants mechanically
│   └── release-check.mjs            # publish readiness: brand-leakage sweep, fresh-install sim, budgets
└── references/                      # vendored frozen guidance (loaded on demand)
    ├── spec-capture.md              # how to capture a DS (Figma MCP flow, node links, tear-down)
    ├── mode-a.md · mode-b.md        # compose-from-library / generate-from-tokens rules
    ├── pixel-diff-tuning.md         # thresholds, masking, noise floor, failure modes
    ├── taste-and-composition.md     # craft heuristics within the system's vocabulary
    ├── delegation.md                # build-then-attack: running capture/repair/verify with cheap agents
    └── microcopy-*.md               # copy patterns, voice/jargon/localisation, a11y+i18n

~/.claude/skills/<system-name>/      # ONE PER DESIGN SYSTEM — e.g. acme-banking
├── SKILL.md                         # instantiated from skill-template.md; binds ENGINE + LOCK
└── captures/<capture-name>/         # the system's world
    ├── design-lock.json             # the frozen SSOT for THIS system
    ├── capture.json                 # raw Figma capture bundle (re-derivable input)
    ├── components/                  # ANATOMY LIBRARY — one spec .md per Figma component
    │   └── INDEX.md                 # name → nodeId → spec file, grouped by category
    ├── fonts/*.woff2                # bundled brand fonts (licensed — keep local)
    ├── reference/*.png              # reference images (from the system's renderer)
    ├── assets/tokens.css + tailwind.tokens.cjs + tokens.dtcg.json   # DERIVED from lock — hand-editing banned (§Provenance)
    ├── <screen>.html                # generated screens
    └── .render/ · .report/         # pipeline artifacts (regenerable)
```

**Anatomy-library rule (Mode B):** before composing ANY region, check `components/INDEX.md` for a
matching captured spec and build from its exact values. Screenshot tear-downs are a fallback ONLY
for components with no spec — and each such gap is a capture task to name in the report, not a
license to guess. Specs record Figma-verbatim values (paddings, radii, type roles, variable slots)
and are one-way captures: to change one, re-capture from Figma, never hand-tune.

Scaffold a new system: `node ~/.claude/fidelity-machine/scripts/new-system.mjs --name <kebab> [--title "…"]`,
then run the capture flow (references/spec-capture.md) into its `captures/` dir.

**Fixtures (component pixel-verification):** `build-component-fixture.mjs` bundles a React
fixture (`<skill>/library/fixtures/<name>.fixture.tsx`) into `<lockDir>/components-fixtures/<name>.html`
— a GENERATED demo harness that may reproduce reference chrome verbatim (dark canvas hex, Figma
placeholder colors). It is a pipeline artifact, excluded from source lint like `.render/`. The
shipped artifact is the component source in `<skill>/library/src/` — tokens-only, fully linted.
Component verification screens are lock `screens[]` entries (`component-<name>`) diffed against
`reference/components/<name>.png` at the Mode-A threshold; on pass the component registers in
`componentMap` with `sourceSha` + `verifiedDiffPct`.

Per-project artifacts live next to the project's `design-lock.json`, not in the engine:
- `.render/<screenId>.png` + `.render/<screenId>.geometry.json` — render.mjs output
- `.report/<screenId>.diff.png`, `.report/<screenId>.report.json`, `.report/<screenId>.tiles/` (triplet crops) — diff.mjs output
- `.report/verify-report.json` — verify.mjs aggregate

## Exit codes (uniform across ALL scripts)

| Code | Meaning | Actionable by |
|---|---|---|
| 0 | pass | — |
| 1 | fidelity/lint failure — real finding, feed evidence back to the model | model fix round |
| 2 | setup/usage error (missing dep, bad args, unparseable lock) | human/setup |
| 3 | DIMENSION_MISMATCH — render dims ≠ reference dims. Config error, NOT a fix target. Never silently resample. | lock config |
| 4 | FONT_PARITY — a required `document.fonts.check()` failed. Refuse to screenshot a fallback. | fonts/bundling |
| 5 | render failure/timeout | environment |

`verify.mjs` exits non-zero if ANY hard gate fails; its report says which.

## Invocation contract

All scripts: `node scripts/<name>.mjs --lock <path/to/design-lock.json> [--screen <id>] [flags]`.
- `render.mjs --lock L --screen S` → writes `.render/S.png` + `.render/S.geometry.json`
- `geometry.mjs --lock L --screen S` → reads `.render/S.geometry.json`, writes `.report/S.geometry.json`
- `diff.mjs --lock L --screen S` → reads reference + `.render/S.png`, writes diff png + report + triplets
- `colour-census.mjs --lock L [--screen S]` → reads reference + `.render/S.png`, writes `.report/S.census.json`; `--lock` is required, there is no default path
- `adherence-lint.mjs --lock L [--src <dir>]` → lints generated source + lock invariants (caps, masks)
- `verify.mjs --lock L [--screen S] [--calibrate]` → full pipeline; `--calibrate` measures the noise floor on the control screen and writes `meta.noiseFloorPct`
- `setup-check.mjs` (no lock needed) → readiness report; prints the exact `npm i` command if missing
- `release-check.mjs [--ban <term>] [--ban-file <path>] [--skip-fresh]` (no lock needed) → publish-readiness sweep; `--ban` (repeatable) and `--ban-file` (one extra banned term per line) extend the brand-leakage list with names the built-in sweep cannot know

Path resolution: a screen `url` that is not `http(s)://` or `file://` is a path resolved **relative
to the lock file's directory** (render.mjs converts it to `file://`). `referenceImage` and font
`files[]` paths resolve relative to the lock the same way. Output dirs `.render/` and `.report/`
are created next to the lock.

## Determinism invariants (render.mjs owns these; others assume them)

1. Pinned Chromium: launch the build recorded in `meta.chromiumBuild`; mismatch → exit 2 (setup error), naming both the expected and resolved build and pointing at `setup-check.mjs` — a different build invalidates the noise-floor calibration and every stored reference, so continuing would produce a meaningless diff. Absent `meta.chromiumBuild` is not checked here (nothing to disagree with).
2. Viewport = `captureWidth × captureHeight` at `deviceScaleFactor = dpr`; screenshot `scale: dpr === 1 ? 'css' : 'device'` so output PNG dims === reference PNG dims exactly.
3. Freeze clock + RNG via `addInitScript`; park mouse at bottom-right corner; `caret: 'hide'`.
4. `reducedMotion: 'reduce'`, screenshot `animations: 'disabled'`, and `await document.getAnimations().map(a => a.finish())`.
5. Hide scrollbars (`::-webkit-scrollbar{display:none}`, `scrollbar-width:none`).
6. Wait for `[data-render-ready]` selector (generated pages MUST set it) — never `networkidle`.
7. `await document.fonts.ready`, then assert every `fonts[].fontChecks[]` — fail exit 4 if any is false.

## Diff invariants (diff.mjs owns these)

- `pixelmatch(ref, img, diff, W, H, { threshold: PIXELMATCH_THRESHOLD (0.1), includeAA: false })`, threshold imported from `pixelmatch-threshold.mjs`. NEVER raise `threshold` to absorb AA — that hides real color drift; AA is handled structurally by `includeAA: false`.
- Masks zero the SAME rects in BOTH buffers before matching. Every mask has a `reason`. Lint enforces `Σ mask area ≤ caps.maxMaskedAreaPct` of the frame.
- A screen declared `notConverged` may carry `ratchet {diffPixels, tolerancePx?, recordedAt, note}`: the recorded best the pixel gate must not regress from. The `passThreshold` remains the target and is still reported as unmet; the ratchet only decides whether the check is red. It exists because a check that is red on every run cannot signal a regression. Re-baseline by hand, with the note saying why, never by script.
- A gate lies three ways: it compares nothing and reports pass (no reference, no thresholds, nothing measured); its metric has a blind spot where the defects actually live (a real comparison that cannot see the class of drift in question); or it is red on every run with no ratchet, so a new regression looks identical to the old known failure and nobody looks again. `contract-guard.mjs --lock`'s `permanently-red` section catches the third: WARN per screen whose last `RED_STREAK_N` (5) recorded runs in `.report/<id>.history.json` all fail the pixel gate with no ratchet declared; `verify.mjs` emits the same notice inline on every run while the streak holds, since history is never pruned.
- A `figIds[]` entry with no `rect` is recorded `no-ground-truth` and skipped by geometry. That is legitimate only when the Figma frame and the DOM box genuinely measure different things, and such an entry MUST carry a `reason` saying so. A rect-less entry without a reason is an anchor someone forgot to fill in, and a gate that silently skips every anchor reports `pass` having compared nothing.
- `referenceSource` (optional, on the screen) records where `referenceImage` itself was exported from: `{ fileKey, nodeId, exportedAt?, note? }`. The lock already pins the CAPTURE to a design-system version; this pins the PNG. Without it, a stale reference and a real drift are indistinguishable — both show up as "the reference disagrees with the tokens" — and the standing rule ("find out which is stale before changing either") has nowhere to start. When the reference and the tokens disagree, `referenceSource` is where you start: resolve `fileKey`/`nodeId` in Figma and compare its current state against what the tokens say. `contract-guard.mjs --lock` WARNs (never errors) on every screen that has a `referenceImage` but no `referenceSource` — most locks predate the field, so this is a visibility gap to close over time, not a blocking gate.
- `globalPct = diffPixels / (W*H − maskedPx)`.
- Tiles: 64×64 grid over the diff buffer; `worstTile` = max per-tile diff density over that tile's unmasked pixels.
- PASS ⇔ `globalPct ≤ screen.passThreshold && worstTile ≤ screen.tileCeiling`.
- Evidence: top-5 worst tiles emitted as triplet crops (`ref/`, `render/`, `diff/` per bbox) + one text line each, classified by geometry result when available ("box matches → color/weight, not layout"). The report also carries a report-level `extent {bbox, centroid, diffPixels, density}` over every unmasked diff pixel in the whole buffer (`null` when there are none), and each `worstRegions[]` entry carries the same shape as `inner`, scoped to that tile, both in absolute device-pixel coordinates.
- `colour-census.mjs` catches what `diff.mjs` structurally cannot: `pixelmatch` scores colour distance in YIQ and ignores any difference under `35215 * PIXELMATCH_THRESHOLD^2` (352.15 at threshold 0.1), a uniform per-channel shift of up to ~26 levels is scored as IDENTICAL, on any number of pixels, which is exactly the shape of a design-system version bump. It histograms flat colours on both sides of the SAME masked/unmasked split as `diff.mjs` (masked rects excluded from both, never counted), pairs deficits (colours the reference paints that the render doesn't) against surpluses (colours the render paints that the reference doesn't) by volume, then confirms each pair by a co-located pixel walk so a coincidental histogram match cannot pass for a substitution. A confirmed pair is classified `reported` when `deficitFraction >= --min-deficit` (default 0.25, the reference colour is substantially gone) OR `density >= --min-density` (default 0.25, the wrong pixels are packed densely), otherwise it is filed as `rasterisation` and does not affect the exit code. The size floor `--min` (default 1000 px) is a DEFAULT a new design system re-measures, not a brand fact: on the first production capture, every screen was clean at 1000 px; at 500 px two rasterisation artefacts (a shadow hairline, a gridline the two rasterisers antialias across different rows) were reported as drift; at 250 px antialiasing shades of text started to look like substitutions. Below the floor is the gate pair's blind spot: a wrong colour on under the floor's pixel count, and also under the pixel gate's cutoff, passes both gates silently.

## Threshold caps (lint-enforced on the lock itself)

Defaults (Tudor may tighten, never loosen past): `caps.maxPassThreshold = { A: 0.002, B1: 0.005, B2: 0.005 }`,
`caps.maxTileCeiling = 0.4`, `caps.maxMaskedAreaPct = 0.15`. A lock whose screen thresholds exceed
its caps FAILS lint (exit 1) — a stubborn screen is fixed, not waved through. All thresholds are
fractions (0–1), not percentages.

## Provenance (capture-figma writes it; adherence-lint verifies it)

`assets/tokens.css`, `assets/tailwind.tokens.cjs` and `assets/tokens.dtcg.json` (W3C Design
Tokens Community Group JSON) are ONE-WAY derivations of the lock's `tokens` section, emitted
next to the lock by capture-figma.mjs. Hand-editing any of them is banned: edit the lock (or
re-capture), then re-derive.

After emitting all three, capture-figma writes a receipt into the lock — its ONE sanctioned
lock write outside capture itself:
`meta.provenance = { generatedAt, lockTokensHash, artifacts: { "<lock-relative path>": "sha256:<hex>" } }`,
where `lockTokensHash` is the sha256 of the serialized `tokens` section at derive time.

When `meta.provenance` is present, adherence-lint re-derives every hash offline: an artifact
hash mismatch, a missing artifact, or a `lockTokensHash` mismatch is an ERROR (someone
hand-edited a derived file, or the lock's tokens drifted after derivation) — each finding
carries `Fix: re-run capture-figma --derive (or re-capture)`. `--derive --lock <path>`
re-emits the artifacts + receipt from an existing lock; no capture bundle needed. A lock
with no `meta.provenance` predates this chain: single WARN, never a hard failure.

At `--derive`, capture-figma ALSO hashes the existing files referenced by `fonts[].files`
and `screens[].referenceImage` into `meta.provenance.artifacts` — the same open map, no
schema change — so a swapped font binary or a replaced reference PNG is caught by the same
offline re-derivation as a hand-edited token file. A `referenceImage` whose file does not
exist yet is skipped silently: net-new screens legally have no reference.

## Three-gate ship ordering (verify.mjs encodes this; SKILL.md teaches it)

1. **Content/compliance gate** (adherence-lint microcopy checks): banned jargon, missing disclosure,
   axis-score floor → blocks regardless of visuals. `⚠ Legal` findings are surfaced, never auto-resolved.
2. **Taste self-critique** (model judgment, SKILL.md): re-weighted 5-dimension review; bottom band → redo.
3. **Geometry + pixel gates** (scripts): structure before pixels; overflow found here is fixed by
   layout slack or a Concise-pass rewrite — NEVER by cutting a mandatory disclosure.

## Content lock (gate 1 — adherence-lint section `content-lock`)

A screen may declare `lockedStrings`: an ordered array of strings that must each appear
VERBATIM in the screen's visible source text, in the given relative order. This is the
content gate for referenceless/net-new screens: pixel gates only protect screens WITH a
reference image — a net-new screen has nothing to diff against, so its mandated copy
(user-dictated headlines, exact CTA wording, required sequencing) is pinned here instead.
Enforcement sits in gate 1 of the three-gate ordering, beside the other adherence-lint
content checks: absent → no finding (the feature is optional); present and violated (a
string missing, or the relative order broken) → ERROR, blocking regardless of visuals.

**Registering a referenceless screen:** mark it `netNew: true`. That drops the
`referenceImage`/`passThreshold`/`tileCeiling` requirements (schema conditional +
adherence-lint schema-sanity agree). A netNew screen participates in adherence-lint —
content-lock, disclosures, all source-adherence checks — and in render.mjs; the pixel and
geometry gates are NOT defined for it and verify.mjs must not be pointed at it. Gates 1–2
plus visual review carry a netNew screen, and its report says so plainly. If a real
reference later exists, remove `netNew`, add the reference + thresholds, and the full
pipeline applies.

## Forbidden substitutes (adherence-lint section `forbidden-substitutes`)

The lock's optional top-level `forbidden` object (`{ fontFamilies: [...], hexColors: [...] }`)
lists values that must NEVER appear in generated source: plausible substitutes from adjacent
brands — the lookalike font a fallback stack reaches for, the near-miss hex of a neighboring
system's accent. The tokens section says what to use; `forbidden` says what a
convincing-but-wrong output would use — drift the eye forgives and a referenceless screen's
gates never see. Absent → silent; any hit → ERROR.

## Decisions ledger (`decisions[]`)

User mandates and interpretive rulings that shape generation ("balances always masked in
demo shots", "the secondary locale keeps the primary locale's number format") are recorded
in the lock's `decisions[]` as `DEC-*` entries — `{id, date, scope, decision, rationale?,
supersedes?, status}` — never only as prose in reports or skill text. Prose scatters and dies
with the session; the ledger travels with the lock and is re-read by every future pass. A
superseded ruling is marked `status: "deprecated"` with its replacement recorded as a new
entry — deprecate, don't delete: the history of a ruling is part of the ruling. When the new
entry supersedes a named predecessor, say which in `supersedes`.

`status` is one of:

| status | meaning |
|---|---|
| `approved` | in force |
| `provisional` | in force but resting on an assumption not yet confirmed — say which in the rationale |
| `deprecated` | superseded; kept for history |
| `withdrawn` | retracted by the person who made it, not superseded by a replacement |

`provisional` and `withdrawn` are not decoration. A ruling made against a gap in the capture
is provisional until the gap is filled, and saying so is what stops a later pass treating a
guess as settled. A withdrawn ruling differs from a deprecated one: nothing replaced it, and
the record has to show that so the question is understood to be open again.

## Change classes (lock evolution)

Classify every lock change by consumer impact before shipping it:

- **patch** — correction or clarification; no generated output changes behavior.
- **minor** — additive: a new token, screen, signature, decision, or alias that invalidates
  nothing existing.
- **major** — a removed or renamed semantic slot, a changed invariant, or **a changed value
  under the same token name** — that is a behavior change, not a correction: every screen
  generated against the old value silently drifts.

Renames add the new alias BEFORE removing the old name; a deprecated name states its
replacement. Source disappearance is not license to churn: when a captured source vanishes
at re-capture, keep the last verified value with its verification date, lower its
confidence, and never substitute a lookalike (references/spec-capture.md, source lifecycle).

## Loop control (verify.mjs)

≤4 rounds per screen. Keep best-so-far; a fix that worsens `globalPct` is reverted. If two consecutive
rounds improve by < 10% relative, STOP and report — never thin-retry into invention.

## Model-facing rules the scripts assume

- Generated elements mapped to Figma nodes carry `data-fig-id="<figmaNodeId>"`.
- Generated pages set `data-render-ready` on `<html>` (or any element) once fonts/data/layout are settled.
- Text slots are typed (`data-slot="button|label|error|…"`) and flex: no fixed widths on text
  containers, ≥2 lines of vertical slack on labels/errors/empty states, `overflow-x-hidden` on `main`.
- Chart regions carry `data-chart="line|bar|legend|…"` — conditional lock signatures (`when:
  "data-chart"`) key off it, so chart rules bind exactly to screens that contain charts.
- All colors/spacing/type via CSS vars from `assets/tokens.css` (derived from the lock). Raw hex
  outside `:root` fails lint. Components come from the lock's `componentMap` when the node is mapped.
