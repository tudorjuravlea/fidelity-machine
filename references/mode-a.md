# Mode A — compose from the verified library

Route a node here when the lock's `componentMap` has an entry for its Figma node id.
Fidelity is inherited from the component's own verification — not re-derived per screen.
Shared rules, gates, exit codes: `../CONTRACT.md`. Schema: `../design-lock.schema.json`.

## Router rule — probe first, per node

- For EVERY selected Figma node, probe `componentMap[figmaNodeId]` before generating
  anything. If Code Connect was ever configured, also probe `get_code_connect_map`.
- Hit → Mode A (this file). Miss → Mode B (`./mode-b.md`). A screen is usually mixed —
  route per node, never per screen. A recurring B1 region is a promotion signal (below).

## Compose rules

- Import exactly what the map says: `importPath` + `componentName`. Never re-implement,
  fork, or paste the component's internals into the screen.
- Map Figma properties through `propMapping`; pick variant values only from
  `variantProps`. A Figma variant with no mapped value is a capture gap — extend the map
  through the Phase A loop; do not improvise a prop or a lookalike.
- NEVER restyle a bound component. No className overrides on it, no wrapper CSS reaching
  in, no style props that change its look. A wrong look = a wrong variant/prop choice or
  wrong surrounding layout — never new CSS on the component. If the component truly
  cannot produce the reference look, the LIBRARY is wrong: fix the component via its own
  B1 loop at component scale, re-verify, bump its map entry.
- Layout AROUND bound components (page scaffolding, grids, gaps) is normal token work:
  lock spacing scale only, CSS vars only, raw hex outside `:root` fails lint (exit 1).
- Model-facing contracts still apply (`../CONTRACT.md` §Model-facing rules): mapped
  elements carry `data-fig-id`, text slots stay typed + flexible, the page sets
  `data-render-ready` when settled.

## Staleness — sourceSha

- Every map entry records `sourceSha` — the git SHA / content hash of the component
  source at verification time — and `verifiedDiffPct`, the globalPct it passed with.
- Before composing, hash the current component source. Drift vs `sourceSha` → the
  verification is STALE: do not trust `verifiedDiffPct`.
- Stale entry recovery: fetch a FRESH reference (`get_screenshot` of the component's
  node — provenance rules in `./spec-capture.md`), re-run the component-scale pixel
  gate. Pass → update `sourceSha` + `verifiedDiffPct` in the lock. Fail → the component
  re-enters the B1 loop before any screen may compose it.

## Gates (light confirmation, not re-derivation)

- Geometry: `geometryTolerancePx` ≤ 1 for Mode-A screens — composition should be
  near-exact because the parts already are.
- Pixel: `passThreshold` ≤ 0.002 (0.2%) — the `caps.maxPassThreshold.A` ceiling. Run it
  against a FRESH reference, not the screenshot from bootstrap time.
- Order is fixed by the three-gate stack in `../CONTRACT.md`: content gate → taste
  self-critique → geometry + pixels. Diff evidence and tuning: `./pixel-diff-tuning.md`.
- A screen that passes 0.2% but still reads wrong is a taste problem
  (`./taste-and-composition.md`) — never a reason to touch thresholds; the lint refuses
  caps violations (exit 1).

## Phase A — self-bootstrapping the library

The DS lives only in Figma; no code counterpart exists at start. The map is BUILT, not
found — the skill's first deliverable is the verified React+Tailwind library:

1. Capture the component sheet (`./spec-capture.md`): `get_variable_defs` once for
   tokens; per component frame `get_metadata` (geometry) + `get_screenshot` (its own
   reference render).
2. Build each component — every variant and state the Figma defines — through the
   Mode-B1 loop (`./mode-b.md`) at component scale: generate from tokens + tear-down
   sheet → geometry gate → pixel diff against that component's OWN Figma render, strict
   component-scale threshold, ≤4 rounds, best-so-far kept.
3. On pass, register it in the lock's `componentMap`:
   `{figmaNodeId → importPath, componentName, propMapping, variantProps, sourceSha,
   verifiedDiffPct}` — the same shape Code Connect would have filled, pointing at our
   own library.
4. From then on screens COMPOSE from the verified library — self-bootstrapped Mode A.
   Fidelity is inherited; the pixel gate on screens is confirmation only.
5. Optional later: publish real Code Connect mappings pointing at this library
   (`get_code_connect_suggestions` bootstraps it) so the Figma file itself advertises
   the code truth for future sessions and tools.

## Promotion rule — the library grows

A region rebuilt via B1 on two or more screens is a signal, not a coincidence: promote
it. Verify it once at component scale (step 2 above), register it in `componentMap`,
then re-route those nodes to Mode A. Direction of travel: per-screen B1 work shrinks,
the verified library approaches full coverage, and every promotion converts a repeated
0.5%-gate cost into an inherited 0.2%-gate guarantee.
