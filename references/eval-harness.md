# Eval harness — ranking configurations, not artifacts

The gates answer one question: does THIS artifact match THIS reference. This file answers
the other one: is configuration A of a generator better than configuration B — model vs
model, prompt vs prompt, mode vs mode — measured across a dataset. Artifact QA cannot
answer it; a single good output proves nothing about a distribution.

Adapted from the evaluation and QA discipline of screenshot-to-code by Abi Raja (MIT,
github.com/abi/screenshot-to-code). LLM-judge rules adapted from the verbalized-sampling
judge set by George Nurijanian (MIT, github.com/gnurio/nurijanian-skills).

## Where the machine gates fit

pixel-diff scores *one artifact against its reference*; the harness ranks *configurations
across a dataset*. Compose them, never blur them:

- Where a dataset item has an exact reference (a lock screen with a reference PNG), the
  gate IS the metric. Run render → geometry → diff per item and score by the margin under
  `passThreshold` — a continuous number — not by bare pass/fail, which throws away the
  ranking information the eval exists to produce.
- Where references are inexact (a style target, no lock), use the human scale below.
- A machine-scored item and a human-scored item never average into one number.

## The harness (minimum viable, proven shape)

- **A fixed input dataset.** ~16 references with a deliberate mix (UI fragments, full
  screens, dashboards, well-known surfaces). Small enough to human-rate in one sitting,
  fixed so every run is comparable. Never eval on inputs chosen after seeing outputs.
- **One primary metric, named honestly.** For reproduction work it is *replication
  accuracy* — how close does the generated result look to the reference. Code quality,
  speed and cost are secondary and tracked separately; blending them into one score hides
  what changed.
- **Human rating on an anchored 0–4 scale.** 4 = near-exact replica, 0 = nothing like the
  reference. Coarse anchored scales rate fast and agree well enough; precision theatre
  (0–100) slows raters without adding signal.
- **Average N runs per configuration** (3 is the working number). Generation is
  stochastic; a single run per config measures luck. Report the average, keep the spread.
- **A side-by-side rating UI**: reference and output rendered next to each other, rate,
  next. Exportable (print-to-PDF suffices) so results can be shared and re-audited.
- Scale-up path when pairwise volume grows: Elo-style pairwise comparison instead of
  absolute scores — easier judgments, same ranking. Absolute-scale-first is the proven
  order; build Elo only when volume forces it.

## Running sessions without fooling yourself

- **Trust request logs, not the UI.** Log every model request with its tool calls,
  results and final output, and grep those — scraping a product UI to find out what the
  generator did is slower and lies more. Build the report writer before the eval, not
  after the first confusing run.
- **One scenario at a time — for attribution, not rate limits.** Concurrent runs
  interleave their logs; untangling them costs more than the parallelism saved. Clear
  reports between scenarios so each run's evidence is unambiguous.
- **Deterministic, distinctive fixtures.** Eval inputs with an unmistakable mark and a
  clearly-structured layout let you see at a glance whether the right asset or region was
  used. A generic fixture makes every output look plausibly right.
- **Prove asset fidelity by content hash**, not by looking: hash-named assets must appear
  by filename in the generated markup (`./spec-capture.md`, authentic assets).
- **Detect "done" by an affordance returning** (an input re-enabling, a control
  reappearing), never by scanning page text — status strings are not reliably in
  `innerText` and change between versions.

## Dataset design, from measured findings (2024–2026 models)

- **A restrictive framework imposes its own style** regardless of the reference — a
  constrained component vocabulary sets a fidelity ceiling before generation starts. Hold
  the stack constant when comparing models, or the eval measures the framework.
- **Laziness has a grep-able signature**: repeated items collapsed into a
  "repeat for each item" comment. Gate for it mechanically; prompting against it is not a
  control.
- **Universal weak spots exist across model families** — side-by-side flex layouts and
  exact background/text colors were wrong across every family tested. Over-represent known
  weak spots in the dataset: they are where configurations actually separate.
- **"Smarter" does not mean better at this.** A larger model has scored below its
  mid-tier sibling on replication. Rank configurations by the eval, never by tier label.

## Judge design, when the evaluator is a model

- **One failure dimension per judge, run independently.** A holistic judge blurs exactly
  the distinctions the eval exists to make; several binary Pass/Fail judges beat one
  1-to-10 scorer.
- **Critique before verdict, structurally.** The output schema puts the written assessment
  field before the result field, forcing reasons before the decision rather than a verdict
  with a rationalization appended.
- **Few-shots include a borderline case, judged Fail with the reasoning shown.** Clear
  pass and clear fail teach the endpoints; the borderline example is where real inputs
  live and where an uncalibrated judge drifts lenient.
- **Align on the most capable model first; optimize cost only after.** A cheap judge that
  has never been checked against a strong one is an unmeasured instrument.
- Judges evaluate one item plus its task context, never the whole output list at once —
  list-level input invites cross-contamination between verdicts.

## Cold-start runs, provenance, and an answer key for the critic

Adapted from the eval suite of ux-ui-agent-skills by Thientan Soparat (MIT,
github.com/plugin87/ux-ui-agent-skills), whose question is the one the gates above cannot
answer: give an agent nothing but the skill and a brief, and is what comes back any good?

- **A cold start is a protocol, not a mood.** Scaffold a clean project from the skill (no
  example screens, no finished demo theme), hand a fresh agent the brief pasted verbatim and
  the project path, and nothing else. Setup facts (where the project is, where to write) are
  allowed; design hints, warnings about traps and coaching on the gates are not. An agent
  that discovers the verification workflow unprompted and runs it has demonstrated the skill,
  and that counts in its favour. Explaining the brief mid-run invalidates the run: the brief
  needed editing, not the run rescuing.
- **Provenance is a column of the results table, never a footnote.** Every run records who
  built the output and whether they could see the skill's internals while doing it: a run made
  inside the session that built the skill is *contaminated* and shows only that the gates catch
  real mistakes; a *blind* run shows the skill transfers. The two claims are not the same and
  the table says which one each row supports.
- **Blind outputs are never edited.** They are evidence of what the agent did unaided, and a
  patch to them is a patch to the experiment. A defect they expose is spent on the skill (a rule, a
  gate, a fixture), and the row keeps the unedited score. In the source's own record, two blind
  runs cost the skill seven defects four familiar runs had never hit, because a familiar run
  keeps reaching for the finished demo theme instead of the template a real user gets.
- **An answer key for the critic.** The self-critique (`./taste-and-composition.md` §3) is
  itself an instrument and gets the same treatment as a gate: a few pages carrying seeded
  defects that no script can see (nothing on the page leads the eye; an empty state that
  offers no next action; a success toast above a list that is unchanged; a loading state that
  looks disabled) and a key naming each defect, its rule and alternative phrasings. The property the
  key rests on: every seeded page passes every gate in both colour schemes, re-proved by a test
  on every run, because a defect a gate can catch measures the gate rather than the critic. The
  critic never reads the key. The matched score is a floor: read the critiques before quoting
  it, and when the matcher is calibrated on the critiques it scores say so, since the next
  independent number is defects seeded by someone else.
- **Three caveats travel with a first perfect score**, in the source's words as a shape worth
  keeping: the fixtures and the key were written by the same party from the same doctrine, so
  the score says the critic applies doctrine it was handed, not that it has taste; a keyword
  matcher moved to agree with a hand count is a statement about the matcher; and a matcher
  calibrated on the runs it scores is circular unless the controls still hold (a critique that
  only quotes the page scores zero, an empty file scores zero).

## Building one from engine parts

- A dataset item = a lock screen + its reference image. The golden fixture's screens are
  the seed; grow the set with screens that hit the known weak spots.
- A configuration = the variables of the generating agent: model, skill version, mode
  (A/B1/B2), prompt.
- The per-item machine metric = the diff margin (`passThreshold` minus measured diff pct;
  negative is a fail and stays in the average as what it is).
- The eval dataset is fixture content: fixed, versioned, and never edited after outputs
  have been seen. Editing it resets every historical comparison.
