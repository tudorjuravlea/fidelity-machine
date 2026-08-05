# Spec capture — producing design-lock.json

The lock is the SSOT: every script and every generation pass reads `design-lock.json`
(schema: `../design-lock.schema.json`) and nothing else. This file is the flow that
produces it. Shared rules, exit codes, path resolution: `../CONTRACT.md`.

## Blocking gate — no lock, no generation

No `design-lock.json` covering the requested screens → STOP. Do not generate "meanwhile",
do not sketch "a first pass from memory". Run this capture flow, write the lock, reload
it, then resume the original request as a blocker — capture first, resume after, same
session, fresh lock in context.

Never silently overwrite an existing lock. Adding screens/tokens to a project that already
has one requires `--merge`; without it `capture-figma.mjs` refuses (exit 2, setup/usage).
Hand-editing derived outputs (`../assets/tokens.css`, `../assets/tailwind.tokens.cjs`) is
banned everywhere: edit the lock, re-derive.

## Route

- Figma MCP reachable → full capture (below). Screens enter as mode A/B1.
- Reference images only → fallback B2 (bottom). No geometry gate; human review mandatory.

## Figma auth prerequisite

- The Figma MCP needs an authenticated session. On auth errors: have Tudor run `/mcp`,
  complete the Figma OAuth there, then retry. A non-interactive session cannot self-auth.
- Demand node-specific design links: `figma.com/design/<fileKey>/<name>?node-id=<n>-<n>`.
  Each link yields `fileKey` + node id — the only inputs the MCP tools consume.
- A project URL is insufficient: it names a container of files, identifies zero nodes, and
  no MCP tool accepts it. Record it as `meta.figmaProject` (provenance only). Every source
  actually captured goes in `meta.figmaFiles[] {fileKey, nodeIds, role}`.
- Collect links per role: variables/tokens frame → `role:"tokens"`; component sheet
  frames → `"components"`; each target screen frame → `"screens"`.

## Tool calls per capture role

| Role | Call | Lock destination |
|---|---|---|
| tokens | `get_variable_defs` on the tokens/library node | `tokens.colors/spacing/radii/typography/elevation/motion` — exact values into semantic slots |
| geometry | `get_metadata` on each component/screen frame | frame original width/height → `captureWidth/captureHeight`; per-child rects → `screens[].figIds[].rect` (modes A/B1) |
| references | `get_screenshot` per frame at its original dims | PNG saved beside the lock (`reference/<screenId>.png`) → `screens[].referenceImage` |
| component map | `get_code_connect_map` probe on component nodes | `componentMap` entries if Code Connect exists; usually empty → Phase A bootstrap (`./mode-a.md`) |

Hard rules while capturing:

- Provenance: `referenceImage` comes from Figma's renderer (`get_screenshot`) or a real
  branded capture — NEVER from our own Chromium render of our own generated output. That
  is the both-fell-back hole: render and reference share the same wrong font/layout and
  diff to zero. Sole exception: the calibration control screen `verify.mjs --calibrate`
  uses to measure `meta.noiseFloorPct`.
- Dimensions: the reference PNG must measure exactly `captureWidth·dpr × captureHeight·dpr`
  — render.mjs shoots at that size (`../CONTRACT.md`, determinism invariant 2). Take the
  frame's original size from `get_metadata`; export unscaled. A mismatch later is exit 3
  DIMENSION_MISMATCH, a lock config error to fix here — nothing ever resamples.
- Values are pasted, never paraphrased: hex stays hex, px stays px. Semantic color slot
  names only (`background`, `surface1`, `accent`, …) — components never see primitives.
- Fonts: bundle woff2 files beside the lock and fill `fonts[] {family, files, weights,
  fontChecks}`. `fontChecks` are literal `document.fonts.check()` strings (e.g.
  `700 26px "Helvetica Neue"`) render.mjs asserts before shooting — false → exit 4
  FONT_PARITY, never a screenshot of a fallback. If the brand font cannot be bundled,
  name the fallback in the lock and tell Tudor fidelity is capped by it.
- Per screen also record: `mode`, `colorScheme`, `stateContract` (the exact state the
  frame shows — logged-in? populated? — prevents state-mismatch false diffs),
  `maskedRegions[]` only for genuinely dynamic content (every rect carries a `reason`;
  total area ≤ `caps.maxMaskedAreaPct`), `locales`, and `passThreshold`/`tileCeiling` at
  or below `caps` — the lint refuses looser values (exit 1).

## Field notes — verified against a real enterprise system (a production banking mobile DS, 2026-07-21)

Learned by actually capturing a production enterprise banking mobile system; these override any tidier
assumption above:

- **`get_variable_defs` fails on canvas/page nodes** with a misleading `"You currently have
  nothing selected"` error. Call it on a **component instance or frame** node instead — the
  per-node scope also keeps the sweep relevant. A wide frame (e.g. a Component Index) returns
  the union of everything its instances consume — the efficient way to sweep a system's tokens.
- **`get_metadata` on a canvas can exceed 150KB** — it lands in a tool-results file, not
  context. Mine it with a script (grep node names/ids), never read it linearly. Component
  *instances* on index/docs pages are fine inspection targets; masters live elsewhere.
- **Real variable names are theme-namespaced**: `{Light|Dark}/{Surface|Tint|Solid|Utility|Elevation|Hairline}/Role`
  plus `Theme/Typography/{Family|Size|Weight}/…` — not flat `color/light/background` names.
  capture-figma maps these (theme segment → scheme; rest → kebab slot) and derives **canonical
  aliases** (`background←surface-background`, `text1←tint-primary`, `accent←surface-accent`, …)
  so the 16-token canonical names and the contrast check keep working.
- **Composite values are real**: text styles arrive as `Font(family: …, size: Ref, weight: 500,
  lineHeight: 44, letterSpacing: -0.5)` and shadows as `Effect(type: DROP_SHADOW, …); Effect(…)`
  chains, with slash-path **references to other variables** — capture-figma resolves refs
  (≤4 hops), converts px lineHeight→ratio and px letterSpacing→em, and emits CSS box-shadows.
  Empty-string values (unset gradient utilities) are skipped.
- **Illustration/ramp variables** (`light-theme/yellow/base/tone 03`) are reference data, not
  semantic tokens — filtered out, summarized in one warning.
- **Figma export artifacts to NEVER reproduce**: micro skews (`skew-x-[0.17deg]` on labels),
  Figma asset URLs (expire in ~7 days — download to `reference/` beside the lock immediately),
  and `data-node-id` attributes (ours is `data-fig-id` per CONTRACT).
- **Spacing/radius often are NOT variables** — real systems frequently hardcode them in
  component specs (e.g. `px-24 py-12 rounded-12` on Button). Harvest them from
  `get_design_context` per component into `tokens.spacing`/`radii` — an empty `tokens.spacing`
  after a variables-only sweep is expected, not an error.
- **Code Connect is usually empty** (`{}`) — plan for Phase-A self-bootstrap (`./mode-a.md`),
  and treat any future non-empty map as an upgrade.

## Field notes — source lifecycle at re-capture

### Source disappearance

A re-capture that cannot find a previously captured source (deleted Figma node, moved file,
retired variable, dead export) does NOT blank or replace the value. Keep the last verified
value with its verification date, mark it unavailable at source, lower its confidence where
appropriate — and never substitute a lookalike (a similar font, a near-enough hex) to fill
the hole. Newer is not automatically more authoritative either: a current exploration or
campaign file can legitimately lose to an older approved master. Keep both source entries
and record which won and why as a `decisions[]` DEC-* entry (`../CONTRACT.md` §Decisions
ledger), not as prose.

### Swatch vs implementation divergence

A labeled swatch and the value actually implemented in components can legitimately differ —
a named brand-color chip on a guidelines page vs the gradient or shifted hex the shipping
buttons really use. Do not "correct" either side to match the other. Preserve BOTH: the
swatch as the anchor (what the brand names), the implemented value as the production token
(what screens render), and note the discrepancy on the token so a downstream consumer knows
the split is deliberate, not drift. Compare visible labels against implemented values as a
capture step, and record material discrepancies instead of resolving them silently.

## capture.json → capture-figma.mjs

You (the model) make the MCP calls; the script does the writing. Aggregate the raw
results into `capture.json` beside the intended lock, mirroring the lock's sections
(same keys as `../design-lock.schema.json`: `meta.figmaFiles`, `tokens`, `fonts`,
`screens[]` with reference paths + figIds/rects, `componentMap` seeds) with MCP values
pasted verbatim. Then:

    node scripts/capture-figma.mjs --lock <project>/design-lock.json [--merge]

Run it with `--help` first for the exact flag set. Contract-pinned behavior: validates
against the schema, stamps `meta.capturedAt` + `meta.chromiumBuild`, writes the lock,
one-way derives `assets/tokens.css` + `assets/tailwind.tokens.cjs`; refuses to touch an
existing lock without `--merge`; exit 0 written, exit 2 bad/unparseable input. After it
writes: re-read the lock and resume the original task from it — not from your notes.

## Fallback B2 — reference images only

When Figma MCP access is impossible (no auth path, exported mocks, live-product shots):

1. Get exports at a known scale (1× or 2×). Set `captureWidth/captureHeight/dpr` from the
   PNG itself; record `stateContract` per shot. No geometry ground truth exists → screens
   are `mode:"B2"`: no `figIds[].rect`, no geometry gate; pixel gate + mandatory human
   worst-region review instead (`./mode-b.md`).
2. Tear down before locking. For each component visible in the references, write a
   tear-down sheet:

       Source:     screen-home.png, primary CTA
       Observed:   background #0F5132; 15px/600; padding 10px 16px; radius 8px; shadow none
       Hover:      not observable in statics — mark unknown, do not invent
       Conclusion: generated component uses these exact values as baseline

   Components the system needs but the references don't show get a Derived Design:
   `Source: "Not found"` → concrete spec → `Justified by:` naming observed principles +
   consistency with observed components. Reason from the system; never guess.
3. Threshold: hold 30+ concrete values (hex, px sizes, weights, spacing steps, radii,
   shadow strings, letter-spacing) before writing the lock. Under 30 → keep measuring
   crops; a thin lock produces confident drift, not fidelity.
4. Declare the rung (ladder below). Every captured value states its source rung; rung-6
   values are flagged to Tudor as fallback, never presented as brand truth.

## Context priority ladder — declare which rung, per value

| Rung | Source | Use |
|---|---|---|
| 1 | Design system / Figma variables (MCP capture) | as-is — this whole document |
| 2 | Codebase | lift EXACT values from token/theme files + 2–3 real components; never redraw from memory |
| 3 | Live product | screenshot the URL at a known viewport |
| 4 | Brand assets / marketing | extract palette, type, mood |
| 5 | Competitor reference | demand URL or screenshot — never fuzzy training-data impressions |
| 6 | Known-systems fallback | declared to Tudor as a starting point, never final |

Each rung beats everything below it. The rung travels with the value into the
`<spec_adherence>` pre-flight (`./mode-b.md`) so every number in generated code traces
to its source.
