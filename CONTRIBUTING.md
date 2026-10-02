# Contributing to fidelity-machine

Thanks for considering it. Three rules keep this project coherent — they are not optional:

## 1. The contract comes first

`CONTRACT.md` is the single source of truth for exit codes, invocation shapes, gate ordering,
and invariants. To change behavior: change CONTRACT.md **first**, then conform the code.
`scripts/contract-guard.mjs` enforces this mechanically — a PR whose code disagrees with the
contract fails the guard.

## 2. Every check must be provably able to fail

A green check that has never been red proves nothing. New gates and lint sections ship with a
fault-injection demonstration (see `contract-guard.mjs --self-test` and the test notes in PR
descriptions): show the check firing on a deliberately broken input before claiming it protects
anything.

For `adherence-lint.mjs` this is mechanical: every registered section has a negative fixture
under `fixtures/lint/<section>/` — a minimal lock plus source with exactly one planted fault —
and a row in `fixtures/lint/manifest.json` naming the section and the level it must fire at.
`node scripts/lint-negatives.mjs` runs them all and fails the build when a section has neither
a fixture nor a reasoned `uncovered` entry, when a fixture names a section or level the registry
cannot produce, or when a fixture trips a section outside its own. Adding a section means adding
its fixture in the same change; `adherence-lint.mjs --self-test` separately proves the registry
and its call sites agree.

## 3. The engine stays brand-neutral

No client names, no brand tokens, no user-specific paths, no licensed fonts in this repository —
brand content lives in per-system skills outside the engine. `scripts/release-check.mjs` enforces
this; run it before every PR. Demos use synthetic systems only (e.g. `acme-banking`, the golden
fixture).

## Practical workflow

```bash
npm install
npx playwright install chromium
node scripts/setup-check.mjs            # deps green?
node scripts/contract-guard.mjs --self-test   # contract + schema + golden pipeline
node scripts/release-check.mjs          # brand-neutrality + tree hygiene
```

All three must pass before and after your change. PRs that alter `design-lock.schema.json`
must keep the golden fixture and existing locks validating (the schema evolves additively;
see CONTRACT.md §Change classes).

## Reporting bugs / security

Bugs: open an issue with the failing command and its full output — the scripts' findings format
is designed to be pasteable. Security: see `SECURITY.md` (no secrets or client material in
issues, ever).
