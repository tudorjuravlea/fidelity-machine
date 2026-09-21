# HARNESS — does the gate's diagnosis actually fix the work

This file and `tasks.json` adapt the before/after correction-experiment methodology from
@shadcn/lint, Copyright (c) 2026 shadcn, MIT License (https://github.com/shadcn-ui/lint);
credited in NOTICE.

`evals.json` proves the skill activates and refuses correctly — four SKILL.md-level trigger
cases, not a lint-firing test. This file proves something narrower: does a correction round
driven by `adherence-lint.mjs` findings move a task from off-lock to on-lock, without
quietly deleting what was asked for. Implement as a script the skill's owner or an agent
runs; ships as a contract here, not as code.

`tasks.json` keeps the two-suite `{temptation, neutral}` object shape rather than
`evals.json`'s flat array on purpose: a trigger case is one assertion, a correction task is
a suite membership plus a severity claim — the shapes diverge because what they check does.

## The A/B/C design

Run every `tasks.json` task through up to three conditions, same model, same temperature:

- **A — before.** Fresh agent, the task prompt, the instantiated skill's normal context
  (design-lock.json, captures/, SKILL.md) — but NO adherence-lint and NO blocking gate.
  `file` is the output path THIS condition writes (see "What `file` is"). A is
  knowledge-equal to a correctly-gated run; only the gate is withheld, so C's correction
  measures the gate's value, not the lock's.
- **B — control (optional).** Starts from A's exact output file; receives the rules prose
  (AXIOMS.md / DECISIONS.md) but never the lint findings; same 3-round budget and the same
  stop rule as C — a hidden lint run the agent never sees decides whether B gets another
  round, exactly as the visible lint decides for C. B isolates what the diagnostics add over
  the rules text alone; run it when that question matters, skip it otherwise.
- **C — after.** Starts from A's exact output file. Receives `adherence-lint.mjs` findings
  verbatim, never paraphrased. Up to 3 correction rounds; re-lint between rounds; stop early
  on a clean result. Still failing after round 3 is `non-convergent`.

Keep A's output untouched once B or C starts — both are diffed against it, never against the
prompt directly.

## Scoring by `expected_severity`

Each task's `expected_severity` names the only signal that may score it:

- `"ERROR"` — scored on exit code AND findings; the tempted outcome must fail the lint.
- `"WARN"` — names a section that cannot fail the exit code by design (`tokens-only-spacing`,
  `banned-fonts` — verified against their `add()` calls, not assumed). Scored on **findings
  emitted**, before vs. after — did the WARN finding for that section disappear between A and
  C — never on exit code, which stays 0 throughout for a WARN-only section.
- `"judge-only"` — the pressure emits no lint signal at all (`promo-unsourced-value`: a
  fabricated fact lints clean). Scored solely on a provenance question put to the judge:
  does every concrete fact in the output trace to BRAND-FACTS.md or the prompt? An unsourced
  fact is a failure **even when the prompt invited one** — the prompt tempts, it does not
  authorize. These tasks skip the outcome labels below and report the judge verdict as their
  row.
- `"n/a"` — process compliance (`skip-gate-once`): scored on whether adherence-lint.mjs ran
  at all before ship, not by any label below.

## Outcome labels

One label per corrected task (A→C), from the final lint (or WARN-finding) result plus the
judge. Lint correctness and intent preservation are always two separate columns — see "What
this produces" — never folded into one score:

- `within-lock` — the existing token/variant already covered the ask; no lock change needed.
- `lock-extended` — a new value was genuinely missing; it was added correctly (lock change +
  a DECISIONS.md row), not improvised inline.
- `gate-dodge` — clean by suppression, an inline workaround, or by deleting the asked-for
  element. Outranks every other label: a task the lint would call `within-lock` but the
  judge finds not intent-preserving is reported `gate-dodge`, never `within-lock`.
- `non-convergent` — still failing after 3 rounds (ERROR: lint still fails; WARN: the
  finding is still present).
- `errored` — the agent crashed, timed out, or produced an unrenderable file. Excluded from
  every rate in "What this produces"; reported as its own row, never dropped or quietly
  retried into a different label.

`skip-gate-once` and `judge-only` tasks do not receive one of these five — see "Scoring by
`expected_severity`."

## The intent-preservation judge

Judge mechanics are inherited from `ENGINE/references/eval-harness.md`'s judge-design
section, not redefined here: an anchored scale, critique written before the verdict field, a
borderline few-shot judged Fail with its reasoning shown, one failure dimension per pass.
Applied here:

- Render A's and C's (and B's, if run) final output to a screenshot each.
- Show the pair plus the original task prompt to the judge; randomize which side is labeled
  "before" vs "after" per pass so position never signals the answer.
- Ask one binary question: does the "after" side still satisfy what the prompt asked for.
  3 passes, majority vote.

Snapping a requested value to an existing lock token counts as satisfying the prompt — the
CTA still gained weight, the card still gained space; the token replaced the freehand value
the prompt implied, it did not remove the ask.

**A gate pass earned by styling less, or by dropping the asked-for element, is a FAILURE,
not a pass.** The judge exists specifically to catch that — a clean lint run alone cannot
tell "fixed" from "removed."

## What this produces

Report, per run, over the corrected (non-`errored`) tasks:

- **Correction rate** — share reaching a clean lint (ERROR tasks) or a cleared WARN finding
  (WARN tasks) by round 3.
- **Rounds-to-clean** — mean rounds among converged tasks, with the spread, not just the
  mean (generation is stochastic — average 3 runs per task, per
  `ENGINE/references/eval-harness.md`'s N=3 working number; a number reported at N=1 is
  luck, not a measurement, and must say so).
- **False-positive rate** — share of `neutral` tasks whose condition-A output already carries
  ≥1 ERROR finding, plus (reported as its own count, never merged) those carrying a WARN
  finding from a section the temptation suite scores on findings; scored on A alone; a
  neutral task never reaches C.
- **Intent-preservation rate** — share of judge-passed tasks among the corrected set.

Lint correctness (outcome label) and intent preservation (judge) are two numbers per task,
reported side by side, never averaged into one.

## How this relates to the engine's eval reference

`ENGINE/references/eval-harness.md` ranks generator CONFIGURATIONS (model, prompt, mode)
across a fixed dataset, and its judge-design rules govern the judge above. This file measures
something narrower: whether ONE gate's findings correct ONE agent's work on ONE task, and at
what cost. A dataset item there is a lock screen + reference image; a task here is a
temptation or neutral brief with no reference image — lint and the judge above are the only
verdicts. Cite this harness for "does the gate teach the model anything"; cite the engine
reference for "which configuration to ship." Never average their numbers together.

## What `file` is

Every task's `file` is the OUTPUT path condition A writes to
(`captures/{{CAPTURE_NAME}}/<name>.html`), not a pre-shipped fixture — nothing in the
scaffold creates it ahead of a run. `gauntlet/LANES.md`'s `evals-files` lane checks the path
against this naming convention, never against existence on disk.

## Where this overlaps evals.json

`cta-off-lock-accent` and `promo-unsourced-value` name pressures `evals.json`'s
`off-lock-value-refusal` and `no-invented-facts` cases already cover. The files test
different things on the same pressure: `evals.json` asks whether the skill refuses the ask
outright (a SKILL.md-level pass/fail); this harness asks what happens when an UNGATED agent
is later shown the lint finding and asked to correct it (a process, scored by outcome
label). Keeping both is intentional, not duplication.

## Reporting discipline

- Every published number carries its run id and date. Never report one without both.
- Cost (tokens, wall time) is reported per run, not folded into the outcome label.
- An `errored` task is itself a finding — its own row, never dropped from an average or
  folded into `non-convergent`.
- State limitations alongside results: same-model-family judge (if the judge shares a family
  with the corrector), small task count, and the run count N behind any averaged number.
