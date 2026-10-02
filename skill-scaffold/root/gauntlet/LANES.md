# Gauntlet — the standing board for this skill build

Implement as `gauntlet/gauntlet.mjs`: one READ-ONLY report over the repo as it stands — eight
lanes, each with a verdict (PASS / FAIL / BLOCKED / SKIP) and an evidence line. It never
renders, never writes to the lock, never touches templates, screens, tools or docs. Where a
lane must prove it can DETECT a problem (not just pass), the proof copies real files into a
TEMP directory and tampers with the copy — planted-fault verification never runs against the
real tree.

| Lane | PASS means |
|---|---|
| `contract` | ENGINE resolves; `setup-check.mjs` exits 0; the resolved chromium build matches the lock's `meta.chromiumBuild`. |
| `lock` | `adherence-lint.mjs --lock design-lock.json` exits 0 (this already covers provenance: the tokens hash and every `meta.provenance.artifacts` file hash verify against disk). |
| `screens-registered` | every lock `screens[].url` resolves to a file; every `referenceImage` exists; every `notConverged` screen carries both `ratchet` and `diagnosis`. |
| `brand-lint` | the skill-side brand lint (`tools/README.md`, last section) exits 0 over every shipped template. |
| `templates-render` | every shipped template declares `[data-render-ready]` and renders for every format it claims. |
| `tools` | every tool's `--self-test` proves its refusal case — exit 2 for the right reason. |
| `evals-files` | every fixture named in `evals/evals.json` `files[]` exists; every `evals/tasks.json` task's `file` follows the `captures/{{CAPTURE_NAME}}/<name>.html` output-path convention (a run target, not a pre-shipped fixture — checked for shape, never for existence pre-capture); a task's `capture`, when present, is one of `static`, `hover`, `motion`, only on temptation tasks; every task whose `expected_severity` is `"ERROR"` or `"WARN"` names a section present in `adherence-lint.mjs`'s `SECTIONS` whose `add()` calls include a case at that level — a task whose claimed severity the section cannot produce tests nothing. Tasks with `expected_severity` `"judge-only"` or `"n/a"`, and `neutral` tasks (pressure `none`), are exempt from the section checks. |
| `docs` | DECISIONS.md rows and the lock's `decisions[]` agree; SKILL.md's module index points at files that exist. |

Conventions: exit 0 = every lane PASS or SKIP · exit 1 = at least one FAIL or BLOCKED.
`--lane <id>` runs one lane. A lane that cannot run reports BLOCKED with its reason, never a
silent SKIP.
