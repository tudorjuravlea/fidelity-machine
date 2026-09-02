# Delegation: build, then attack

How to run capture, repair and verification work with cheap agents without letting a
cheap agent's optimism become the record. Generic guidance, not tied to any one package
or system.

## The pattern

Every package is built by one agent and attacked by a different one that did not build
it. The orchestrating model writes the plan and the per-package briefs, keeps the design
decisions, the floor and threshold decisions, and the commits. Nothing is committed until
its verifier has tried to break it. A builder reporting green is a claim, not a result;
the verifier's independent re-run is the result.

## What adversaries catch that builders do not

From the measured record of two delegation rounds, run with a cheaper model doing the
building and attacking, and the orchestrating model doing the planning and judging:

- A release-gate violation the builder never ran the gate for.
- A mechanism stated as fact in a builder's report that one experiment refuted.
- A wrong number in a code comment, carried over from the brief without being checked.
- A latent limitation found by deliberately constructing the adversarial input, not by
  reading the code and guessing it was fine.
- Two errors in the orchestrator's own brief, caught only because the verifier was told
  to distrust the brief as well as the builder.

The lesson that generalizes: tell verifiers to distrust the brief as well as the builder.
A brief can state a number wrong, assume a mechanism that a five-minute test would kill,
or describe a fix whose ceiling is smaller than the problem. A verifier that treats the
brief as ground truth will confirm the brief's mistakes right alongside the builder's.

## Brief template (for the builder)

```
Why: <the measured problem this package fixes, with the numbers that show it>

What to build:
1. <file> - <change>
2. <file> - <change>

Verify (MEASURED): <the falsifying test, named up front, that would prove this wrong>

Stop rule: <bounded, e.g. "two corrections then stop and apply nothing">

Report path: <path>
Report structure: WHAT CHANGED / HOW VERIFIED / MEASURED / INFERRED / OPEN
```

## Adversary brief template (for the verifier)

```
You did not build this; your job is to break it. Edit nothing; write findings only.
Distrust the brief as well as the builder: if it states a number, check it.
Package under review: <files, and the builder's report path>.
Files that may be dirty from OTHER agents at the same time: <list>, not defects here.
Attacks, all mandatory, exact commands and outputs:
  A. <re-run every number in the builder's report with your own inputs>
  B. <the boundary cases: exact threshold, empty input, malformed input>
  C. <red-proof: re-inject the known historical faults this check was built to catch;
      a check that has never been seen to fail is not known to work>
  D. <brand and prose sweep of the diff>
Report: one line per attack PASS/DEFECT, details, verdict ACCEPT / ACCEPT WITH FIXES
(exact edits, file and line) / REJECT.
```

## Rules of hygiene

- Use isolated copies (a git worktree, or an rsync'd tree) for anything that renders, so
  parallel agents never collide writing to the same `.render/` directory.
- Never fetch from a rate-limited external API inside an agent that is one of several
  running in parallel; the quota is shared and a blind retry from one agent burns the
  budget of every other agent waiting on the same endpoint.
- Compute the ceiling of a fix before funding it: one subtraction, what is the most this
  change can possibly recover, and is that enough to matter. Fund it only if the answer
  is yes.
- Read `Retry-After` before building any retry loop against an API that returned one.
- Match a file's existing serialisation convention when rewriting it (indentation,
  quoting, key order); a mechanically-correct rewrite that reformats the whole file hides
  the real diff inside a wall of noise.

## Costs, as measured

Ten cheap-model agents at roughly 80,000 to 165,000 tokens each, for one delegation
round. The verifiers were the expensive half of that spend and the useful half: every
finding worth acting on in that round came from an adversary, not a builder.
