---
name: {{SYSTEM_NAME}}
description: Pixel-precise generation locked to the {{SYSTEM_TITLE}} design system, with a machine-verified ship gate (render → pixel-diff + token/microcopy lint via the shared fidelity engine). Use ONLY when the user explicitly asks to build/reproduce screens in {{SYSTEM_TITLE}}, run its fidelity pipeline, or bootstrap its component library. NEVER trigger automatically on generic design or UI tasks. Invoke explicitly.
---

# {{SYSTEM_TITLE}} — Design-System Fidelity

You are in **fidelity mode** for one design system: **{{SYSTEM_TITLE}}**. The design system is a
hard constraint, not a suggestion; variance is a defect. All machinery is shared:

- **ENGINE** = `~/.claude/fidelity-machine/` — scripts, references, schema, runtime deps.
  **Read `ENGINE/CONTRACT.md` before anything else** (exit codes, invariants, gate ordering).
- **LOCK** = `~/.claude/skills/{{SYSTEM_NAME}}/captures/{{CAPTURE_NAME}}/design-lock.json` — this
  system's frozen SSOT: tokens, typography, fonts, radii/spacing, elevation, componentMap,
  signatures/donts, microcopy layer, screens. Fonts live beside it in `fonts/`.

Every script call: `node ENGINE/scripts/<name>.mjs --lock LOCK [--screen <id>]`.

## 0. Blocking gate — no lock, no generation

Lock missing/incomplete → STOP; run the capture flow (`ENGINE/references/spec-capture.md`),
reload, resume as a blocker. Never generate from memory of the design system. Never silently
overwrite a lock (`capture-figma.mjs --merge`). Setup unverified → `ENGINE/scripts/setup-check.mjs`.

## 1. Route every node — Mode A / B1 / B2

Per region: in the lock's `componentMap` → **Mode A**, compose the real component, never restyle
it. Figma geometry+variables exist → **Mode B1**, generate from lock tokens + captured anatomy. Image
only → **Mode B2**, pixel gate + mandatory human worst-region review. Details:
`ENGINE/references/mode-a.md`, `ENGINE/references/mode-b.md`. Recurring B1 regions get promoted
into the library.

Anatomy library first: before composing any Mode-B region, check `captures/{{CAPTURE_NAME}}/components/INDEX.md` for the component's captured spec and build from its exact values; screenshot tear-downs are a fallback only for spec-less components, and every such gap gets named in the report as a capture task. 

Imagery library first: illustrations/icons are never invented. If the capture has an imagery
library (`captures/{{CAPTURE_NAME}}/illustrations/INDEX.md` + `MANIFEST.json`), follow the lock's
`imagery.policy` tiers: (1) captured assets, composed via their documented variant axes;
(2) PoC-only derived compositions of captured components within the guidelines' vocabulary;
(3) abstract data-viz motifs as decoration on secondary surfaces only — never as screen
heroes/covers. Embedded SVGs keep their `data-fig-id`/`data-fig-name`/`data-fig-key` provenance
attributes so output remains traceable/pushable back to the design tool. 

## 2. `<spec_adherence>` — declare before code

Before generating any screen, emit the block: (1) TOKENS with exact values + source rung;
(2) COMPONENTS (Mode A binding or Mode B plan); (3) MEASUREMENTS px/rem vs reference;
(4) TEXT SLOTS (element × context × tone); (5) BANNED-DEVIATION SWEEP against the lock's
`signatures[]`/`donts[]`. An unfillable line = capture gap → back to §0, never improvise.

## 3. Generation rules

Tokens only (raw hex outside `:root` fails lint; missing value → derive in-system, add to the
lock first). Instrument structure: `data-fig-id`, `data-render-ready` after fonts settle,
`overflow-x: hidden` on `main`. Typed flexible text slots (`data-slot=…`), no fixed text widths,
≥2 lines slack. Support/disclosure text under CTAs wraps naturally full-width: never `text-wrap: balance`/`pretty` on single-sentence footnotes (a shortened first line reads as broken). Taste composes within the vocabulary (`ENGINE/references/taste-and-composition.md`)
— precedence: system constraints > signatures/donts > craft heuristics; novelty stays OFF. All
interactive states designed from lock tokens; honor the screen's `stateContract`. Never reproduce
Figma export artifacts (micro-skews, `data-node-id`, expiring asset URLs, empty-string variables).
Surface craft, loaded per artifact type: diagrams → `ENGINE/references/diagram-craft.md`;
charts and dashboards → `ENGINE/references/dataviz-craft.md`; slide decks and editorial
figure pages → `ENGINE/references/slides-and-decks.md`; multi-screen structure and
navigation → `ENGINE/references/ia-and-navigation.md`; alternative solutions to the same
problem → `ENGINE/references/variations.md` (after the baseline passes, never before).

## 4. Microcopy pass (after layout, before gates)

No lorem, ever. Populate every slot via `ENGINE/references/microcopy-patterns.md` +
`microcopy-voice.md`: pattern per element type → 4-pass edit (Purposeful→Concise→Conversational→
Clear) → all `content.locales`, first locale native. High-stakes = Cautious tone,
irreversibility before the action, confirmations restate amount+recipient+timing. Disclosures in
`content.disclosureInventory` are mandatory copy, flagged `⚠ Legal`, never paraphrased/cut/hidden.
Max 1–2 ethical nudges; dark patterns banned outright.

## 5. Ship gates — fixed order (`ENGINE/scripts/verify.mjs --lock LOCK --screen <id>`)

1. **Content/compliance lint** — jargon, disclosures, caps/masks, raw hex, placeholders. An
   ERROR blocks regardless of looks; `⚠ Legal` goes to the user.
2. **Taste self-critique** (yours): Philosophy-alignment / Hierarchy / Craft / Functionality,
   0–10 with cited evidence; Originality is not scored; any ≤4 → redo. Check every signature.
   Run the **brand-transplant test**: swap this system's distinctive marks (accent surface,
   logo, signature type) for a competitor's — does anything else still identify the brand?
   If not, the composition is generic despite token correctness; fix by leaning on the
   lock's `signatures[]`, never by inventing off-system.
3. **Geometry + pixel gates**: structure first, then diff. PASS ⇔ `globalPct ≤ passThreshold`
   AND `worstTile ≤ tileCeiling`. Fix toward the reference, never the delta. Net-new screens
   without a reference: gates 1–2 + render + visual review carry it — say so plainly.

Loop ≤4 rounds, best-so-far, revert regressions, STOP honestly on no progress. Threshold caps
are law — a stubborn screen gets diagnosed (`ENGINE/references/pixel-diff-tuning.md`), never a
looser gate.

## 6. Reporting

Per screen: mode per region; `<spec_adherence>` summary; microcopy table (all locales,
`⚠ Legal` flags); taste scores with evidence; verify numbers (globalPct, worstTile, rounds);
and anything unverified, stated plainly. A screen that didn't converge ships as "not converged"
or not at all.

Every shipped screen also reports a production status: **`production-ready`** (every input
verified), **`concept-ready`** naming the remaining clearances (draft disclosure, unlicensed
font, unconfirmed inferred signature), or **`blocked`** naming the missing input. "Converged"
pixel numbers and unverified inputs are orthogonal — a 0.1% diff over a draft disclosure is
`concept-ready`, not done. Name both.

## 7. Evals convention

This skill SHOULD ship `evals/evals.json`: an array of cases `{id, prompt,
expected_behavior, files}` exercising the skill's contract — and at least one
`should-not-trigger` negative: the frontmatter's "NEVER trigger automatically" rule stated
as a testable case (a generic design prompt that must NOT activate fidelity mode). Grading
may be human, but every fixture named in `files` must exist — an eval whose fixture is
missing tests nothing.

## Hard rules

The lock is the only authority. Never restyle a Mode-A component, invent an off-lock value, or
exceed a threshold cap. References come from the system's renderer or a real capture — never
your own render (except calibration). Masks need reasons and budgets. Disclosures are never
cut. Report failures faithfully.
