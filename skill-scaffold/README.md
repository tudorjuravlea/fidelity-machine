# skill-scaffold — the project tree around a SKILL.md

`skill-template.md` gives a new system its SKILL.md. This directory gives it everything else a
proven skill build carries: the durable docs that let the project be rebuilt or audited, the
capture-side ledgers the SKILL.md module index points at, the media-format layer (decks,
social, print), and the contracts for the skill-side tools. `scripts/new-system.mjs`
instantiates the whole tree, filling `{{SYSTEM_NAME}}`, `{{SYSTEM_TITLE}}` and
`{{CAPTURE_NAME}}` in every file (this README documents the scaffold and is not copied).

Layout:

- `root/` → copied to `~/.claude/skills/<name>/`, beside the instantiated SKILL.md
- `capture/` → copied to `~/.claude/skills/<name>/captures/<capture>/`

## The build order that proved out

Each phase adds exactly one new mechanism, and each later medium translates surfaces the
earlier one already verified:

1. **Capture statics** (`references/spec-capture.md`): tokens page, component sheet, screens →
   `capture.json` → `design-lock.json`. Record the source-of-truth split in DECISIONS.md
   (what is canonical for statics vs for motion/hover/responsive).
2. **Anatomy library**: one spec per component, measured from named instances
   (`components/INDEX.md`), routed by intent (`components/SELECTION.md`).
3. **References armed by a human** (`reference/APPROVALS.md`), then the pixel-gated screens:
   gate the reusable SECTIONS once, compose pages from them.
4. **Media formats, staged** (`formats.json` + `templates/`): decks → social → print. These
   are net-new surfaces with no capture reference, so they ship on lint + taste + render +
   human review — never a fabricated diff number. Print is millimetre-first and exports only
   through the print pipeline (`tools/README.md`).
5. **Standing quality board**: `gauntlet/LANES.md` implemented as a read-only gauntlet script;
   `evals/evals.json` grows a case per decided rule.

Throughout: every rule earns a DECISIONS.md row, every incident a LESSONS.md entry, and every
unit an honest REGENERATE.md readiness score. The lock itself is never scaffolded — it is
captured, and its absence is the skill's blocking gate.
