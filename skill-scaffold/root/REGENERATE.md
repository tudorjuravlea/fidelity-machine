# REGENERATE — rebuilding this system from its surviving truth

Per unit: an honestly scored regeneration readiness, the prompt that would rebuild it from
contract + tests alone, and what would be lost. Scores are updated when a unit changes, not
retroactively polished. The standing rule: when a bug is fixed, the contract/tests gain the
truth **in the same change** — knowledge that lives only in code is shadow spec, and this
file exposes that debt.

## The Deletion Test

```
git worktree add /tmp/rebuild-trial -b rebuild-trial
rm -rf <unit>                          # inside the trial worktree
# rebuild the unit from its listed prompt + AXIOMS.md + DECISIONS.md + ENGINE/CONTRACT.md
# the unit's checks decide; opinion does not
```

## Units

Statuses: HIGH / MEDIUM — honest gap / PENDING — unit not built yet / NOT REGENERABLE — by
design. Two rows are pre-scored because they are true of every capture, not judgement calls
about this one. Score the rest as the units are built.

| Unit | Readiness | Notes |
|---|---|---|
| `SKILL.md` |  | Rebuild prompt: instantiate `ENGINE/skill-template.md`, re-apply the DEC ledger. HIGH once everything it encodes is mirrored in DECISIONS.md + the lock. |
| `evals/evals.json` |  | HIGH when every case derives mechanically from the DEC ledger + hard rules and every fixture named in `files` exists. |
| Screen HTML (`captures/{{CAPTURE_NAME}}/*.html`) |  | Rebuildable from anatomy specs + tokens + references through the verify loop; hard-won per-screen fixes belong in the lock's ratchet/diagnosis entries so the knowledge survives deletion. |
| `captures/{{CAPTURE_NAME}}/design-lock.json` + `capture.json` | NOT REGENERABLE — by design | Captured brand data cannot be re-derived from prose. Protected by backup, not regeneration; re-capture is possible while the source file and its licence exist. |
| `captures/{{CAPTURE_NAME}}/components/*.md` |  | Re-capturable from the source via the spec-capture flow; INDEX/SELECTION rebuild from the specs. |
| `captures/{{CAPTURE_NAME}}/reference/*.png` | NOT REGENERABLE from this repo | Re-exportable from the source while it exists; approval rows in APPROVALS.md must be re-earned, never copied. |
| `tools/` |  | HIGH when each tool carries a header contract and proven refusal cases; rebuild prompt = the contract in `tools/README.md` + the LESSONS entries it cites. |
| `templates/` |  | HIGH when LAYOUTS/ARCHETYPES/PRINT-LAYOUTS state the design decisions — the design docs ARE the rebuild prompts. |
| Durable docs (AXIOMS, DECISIONS, this file) |  | Small, self-describing, mirrored in the lock's DEC ledger. |
