# Shared contract — fidelity-machine

Every script, reference, and per-system SKILL.md obeys this file. It exists so
independently-written parts cannot drift. If a change is needed, change it HERE first, then
conform the parts.

## Topology: one shared ENGINE, thin per-system SKILLS

The machinery is design-system-agnostic and lives ONCE in the engine. Each design system gets
its own thin skill (slash command + lock + fonts + captures) scaffolded from the engine's
template. Fix a script → every system benefits; add a system → scaffold + capture, no code.

```
~/.claude/fidelity-engine/           # THE ENGINE — shared, not a skill, never registers
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
│   ├── diff.mjs                     # pixelmatch gate: global + per-tile + triplet crops
│   ├── adherence-lint.mjs           # static gate: tokens, fonts, microcopy, jargon, disclosures, caps
│   ├── verify.mjs                   # orchestrator: per-screen lint→render→geometry→diff, loop control
│   ├── contract-guard.mjs           # meta-gate: enforces THIS document's invariants mechanically
│   └── release-check.mjs            # publish readiness: brand-leakage sweep, fresh-install sim, budgets
└── references/                      # vendored frozen guidance (loaded on demand)
    ├── spec-capture.md              # how to capture a DS (Figma MCP flow, node links, tear-down)
    ├── mode-a.md · mode-b.md        # compose-from-library / generate-from-tokens rules
    ├── pixel-diff-tuning.md         # thresholds, masking, noise floor, failure modes
    ├── taste-and-composition.md     # craft heuristics within the system's vocabulary
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

Scaffold a new system: `node ~/.claude/fidelity-engine/scripts/new-system.mjs --name <kebab> [--title "…"]`,
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
- `adherence-lint.mjs --lock L [--src <dir>]` → lints generated source + lock invariants (caps, masks)
- `verify.mjs --lock L [--screen S] [--calibrate]` → full pipeline; `--calibrate` measures the noise floor on the control screen and writes `meta.noiseFloorPct`
- `setup-check.mjs` (no lock needed) → readiness report; prints the exact `npm i` command if missing
- `release-check.mjs [--ban <term>] [--ban-file <path>] [--skip-fresh]` (no lock needed) → publish-readiness sweep; `--ban` (repeatable) and `--ban-file` (one extra banned term per line) extend the brand-leakage list with names the built-in sweep cannot know

Path resolution: a screen `url` that is not `http(s)://` or `file://` is a path resolved **relative
to the lock file's directory** (render.mjs converts it to `file://`). `referenceImage` and font
`files[]` paths resolve relative to the lock the same way. Output dirs `.render/` and `.report/`
are created next to the lock.

## Determinism invariants (render.mjs owns these; others assume them)

1. Pinned Chromium: launch the build recorded in `meta.chromiumBuild`; mismatch → warn loudly in the report.
2. Viewport = `captureWidth × captureHeight` at `deviceScaleFactor = dpr`; screenshot `scale: dpr === 1 ? 'css' : 'device'` so output PNG dims === reference PNG dims exactly.
3. Freeze clock + RNG via `addInitScript`; park mouse at bottom-right corner; `caret: 'hide'`.
4. `reducedMotion: 'reduce'`, screenshot `animations: 'disabled'`, and `await document.getAnimations().map(a => a.finish())`.
5. Hide scrollbars (`::-webkit-scrollbar{display:none}`, `scrollbar-width:none`).
6. Wait for `[data-render-ready]` selector (generated pages MUST set it) — never `networkidle`.
7. `await document.fonts.ready`, then assert every `fonts[].fontChecks[]` — fail exit 4 if any is false.

## Diff invariants (diff.mjs owns these)

- `pixelmatch(ref, img, diff, W, H, { threshold: 0.1, includeAA: false })`. NEVER raise `threshold` to absorb AA — that hides real color drift; AA is handled structurally by `includeAA: false`.
- Masks zero the SAME rects in BOTH buffers before matching. Every mask has a `reason`. Lint enforces `Σ mask area ≤ caps.maxMaskedAreaPct` of the frame.
- `globalPct = diffPixels / (W*H − maskedPx)`.
- Tiles: 64×64 grid over the diff buffer; `worstTile` = max per-tile diff density over that tile's unmasked pixels.
- PASS ⇔ `globalPct ≤ screen.passThreshold && worstTile ≤ screen.tileCeiling`.
- Evidence: top-5 worst tiles emitted as triplet crops (`ref/`, `render/`, `diff/` per bbox) + one text line each, classified by geometry result when available ("box matches → color/weight, not layout").

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
status}` — never only as prose in reports or skill text. Prose scatters and dies with the
session; the ledger travels with the lock and is re-read by every future pass. A superseded
ruling is marked `status: "deprecated"` with its replacement recorded as a new entry —
deprecate, don't delete: the history of a ruling is part of the ruling.

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
