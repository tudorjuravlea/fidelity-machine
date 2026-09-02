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

## Figma REST fallback, when the MCP seat quota is gone

When the Figma MCP is unreachable for lack of a seat rather than for lack of auth,
maintainers fall back to the Figma REST API with a personal access token. On the first
`429`, read the response headers before doing anything else: `Retry-After` gives the wait
in seconds and `x-figma-rate-limit-type` names which limit tripped. MEASURED 2026-09-02: a
plan-tier cap returned `429` with `retry-after: 331775` (about 3.8 days) and
`x-figma-rate-limit-type: low`, while `/v1/me` kept returning 200 the whole time. A 200 on
`/v1/me` proves only that the token is valid, not that the file endpoints are open; six
blind retries against a file endpoint over 100 minutes taught nothing that the first
`Retry-After` header did not already say. If the reported window is longer than the
session, stop: record the reopen time in the capture notes and stage the scripts to resume
capture then, rather than spending the session polling a cap that has not lifted.

Handle the token the same way regardless of which path triggered the fallback: read it only
inside a request header, for example `-H "X-Figma-Token: $(cat <token-file>)"`, with any
response body written to a file via `-o`, never echoed to the terminal or piped through a
pager. No token value, no file key, and no brand name belongs in a log, a report, or this
file.

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

Authentic assets (B2 only; adapted from screenshot-to-code, MIT,
github.com/abi/screenshot-to-code):

- Imagery that exists in the reference — logo, hero photo, illustration, product shot — is
  EXTRACTED, not redrawn: crop it at native resolution into `reference/assets/`, named by
  content hash (`asset_<sha256[:24]>.png`), and reuse it verbatim. Generating a lookalike
  of a real mark is invention wearing a fidelity costume; the tear-down sheet's
  measure-don't-guess rule applies to pixels, not just values.
- Inspect every crop against its reference region before it enters a screen — wrong-region
  extraction is silent and survives the pixel gate (the wrong asset diffs clean against
  itself).
- Un-extractable imagery (occluded, or the asset IS the background) gets a Derived Design
  entry like any unobserved component: `Source: "Not found — occluded"` → what was
  generated in its place → `Justified by:`.
- The hash makes verbatim use checkable: the asset's hash filename must appear in the
  generated markup. Absent → something re-encoded or redrew it on the way through. Never
  embed the whole reference (or a large slice of it) as an image standing in for coded
  layout — that is the screenshot-as-background cheat by another name.

**Exception, under transforms (MEASURED 2026-09-02).** Verbatim reuse holds only when the
asset is composited at identity scale on integer device-pixel boundaries. Measured once, on
one icon: inside a container under `transform: scale(0.9615)` it was replaced with the
reference's own pixels, and the diff in that region fell from 114px to 66px, not to 0. The
mechanism is INFERRED from that one case: the compositor resamples a bitmap under a
non-identity transform, and the same is expected under fractional positioning or a container
whose layout scale differs from 1, but those were not measured. The honest options in
that case: reproduce the transform's effect by exporting the asset at its final device size
and placing it at identity, or accept the residual and record it in the report. Do not treat
a non-zero diff on a correctly-extracted asset as a wrong-region extraction; check the
container's computed transform and scale first.

## Live-product reference capture (rung 3)

Adapted from the stitched full-page capture method in Skills by Meng To (MIT,
github.com/MengTo/Skills). A browser's one-shot fullPage screenshot silently lies on
exactly the pages worth capturing — lazy-loaded, scroll-animated, reveal-heavy pages
return a tall image that is mostly blank while a scroll-through looks perfect. These
shots feed B2 as reference images, so verify the capture before anything downstream
trusts it.

- **Stitch, never one-shot**: open the real page URL, scroll to the bottom once so lazy
  media and reveal sections mount, return to the top, step down in viewport-sized
  overlapping steps, capture each settled viewport, stitch vertically. Cut section crops
  from the stitched image only, never from a native fullPage screenshot.
- **Settle on a signal, not a stopwatch**: `readyState === "complete"`, then watch the
  DOM node count until it stops changing (an SPA fetches after load), then wait until
  every `img` reports `complete`. A fixed delay races an image decode whose duration
  depends on the network, which is why it fails inconsistently.
- **The window may not be the scroller.** On many SPAs the scrollable region is an
  `overflow-y: auto` container inside a fixed-height shell; scrolling the window captures
  one frame repeated down a tall image, which looks like a capture and is not. Find the
  element that actually overflows before capturing.
- **Capture from a clean, isolated browser profile** — cookies decide what the page IS
  before the screenshot decides what it looks like (a logged-in profile pointed at a
  product domain returns the dashboard, not the marketing site). Two successful-looking
  failures to detect by name: a bot check (mostly empty page, one centered button) and a
  login wall (a form containing a password input). Record which surface was actually
  captured.
- **Very tall pages shard**: past roughly 16,000px single captures start failing; slice
  into ~8,000px segments and join them.
- **Check the output, not the exit code**: crop the top and the bottom 1,500px of the
  finished image and look at both. It costs seconds and catches the two failures a
  successful run reports as success — a blank lower half, and a page that never scrolled.
- **Section crops are contiguous or they are wrong**: exact boundaries in page order, no
  skipped pixel rows, overlap only where sticky elements force it. A crop taken at a
  different scroll state reintroduces exactly the inconsistency the stitch removed.
- **Actuate before capturing an interaction state** (hover the card, scroll into the
  pinned section, let the canvas reach a representative moment), and verify the files,
  not just the call: every referenced image exists, is non-empty, and measures the
  expected dimensions. A zero-byte asset and a successful capture look identical in a
  task log.

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
