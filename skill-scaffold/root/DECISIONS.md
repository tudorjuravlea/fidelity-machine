# DECISIONS — design decisions ledger

These are approved design judgement, not preferences: the lint rules, signature checks and
gates exist to make them machine-checkable, and an output that fails a gate is the system
working. Changing a rule here is a conversation, not a pull request.

Rows mirror the machine-readable `decisions[]` (DEC-*) ledger inside
`captures/{{CAPTURE_NAME}}/design-lock.json`; the lock entry is what tooling reads, this
table is what humans read. **By** records who decided: the owner, or an agent whose proposal
the owner accepted. Deprecate rows, never delete them.

Decisions worth a row from day one: what the skill repo root is; whether the capture is
faithful or a re-skin; the source-of-truth split (statics vs motion); what the pixel gate
targets (sections vs full pages); the deliverable order across media; and every content rule
lint will enforce.

## YYYY-MM-DD — project inception

| # | Decision | Why | By |
|---|---|---|---|
| 1 |  |  |  |
