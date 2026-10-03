# fixtures/lint — negative fixtures for adherence-lint

`fixtures/golden` proves the static gate stays quiet on known-good work. This folder proves the
opposite: every section of `scripts/adherence-lint.mjs` still goes red on the fault it exists
for. `scripts/lint-negatives.mjs` runs them all (CI runs it after `release-check.mjs`).

## What a fixture is

One folder per section, `fixtures/lint/<section>/`:

- `design-lock.json`: a complete lock. It carries every optional field a section reads
  (imagery, figIds, lockedStrings, signatures, banned jargon, a disclosure inventory, a
  provenance receipt, radii and motion tokens), so no section skips and none fires on its own.
- `screen.html`: the screen the lock points at. It opens with
  `<!-- lint-negative: <section> — <what was planted> -->`.
- `tokens.dtcg.json`: a stand-in derived artifact whose hash the provenance receipt records.

All 31 folders share one clean base, which lints to `No findings.`. Its copy is short on
purpose: real sentence punctuation, the longest sentence 10 words, the button 2 words. A
change to how a copy rule counts must not tip the base over a limit. Two folders add to the
base what their section needs in order to run at all, not a fault: `scheme-mixing` carries a
second colour mode (in the lock and as a `[data-theme="dark"]` token block), and
`transition-all` reads its duration from a token-scope custom property so `raw-motion` stays
quiet.

## The one-fault rule

Each fixture is the clean base plus exactly ONE planted fault, for its own section. The
manifest (`manifest.json`) states the section, the level it must fire at, and the fault in
`planted`. The runner fails a fixture when its section does not fire at that level, when lint's
exit code is wrong, or when any OTHER section fires. A second section firing is only allowed if
the fixture names it in `tolerate`, and the PASS line then counts it. Today no fixture needs
`tolerate`; keep it that way when you can.

Coverage is per section, not per rule. A section with several rules (a11y has nine finding call
sites) is proven able to fire by one of them.

## Adding a fixture

1. Copy an existing folder whose fault lives in the same file you will tamper with
   (`raw-hex` for screen faults, `caps-enforcement` for lock faults).
2. Revert its fault so the folder is the clean base again, then plant yours. Update the
   lint-negative comment. The comment is not visible text, but `placeholders`, `button-length`,
   `color-only-status`, `transition-all`, `imagery-provenance`, `figid-coverage` and
   `signatures` read the raw file, so do not write their trigger text in it.
3. Add the entry to `manifest.json`, with `lock` and `src` relative to this folder (the runner
   refuses paths that leave it).
4. Run `node scripts/lint-negatives.mjs --only <id>`, then the full suite.

A section with no fixture must be listed in `uncovered` with a specific reason. The runner
prints those lines on every run and fails on any registered section that is in neither list.

## When a fixture's tokens change

The receipt in `meta.provenance` holds `lockTokensHash`, the sha256 of `JSON.stringify(lock.tokens)`
(the same expression `checkProvenance` re-derives). Change `tokens` and the hash no longer
matches, so `provenance` fires as an unexpected finding. Recompute it in place:

```sh
node -e 'const fs=require("fs"),c=require("crypto"),p=process.argv[1],l=JSON.parse(fs.readFileSync(p,"utf8"));l.meta.provenance.lockTokensHash="sha256:"+c.createHash("sha256").update(JSON.stringify(l.tokens)).digest("hex");fs.writeFileSync(p,JSON.stringify(l,null,2)+"\n")' fixtures/lint/<section>/design-lock.json
```

If you edit `tokens.dtcg.json` itself, record its new hash the same way: `"sha256:"` plus the
hex digest of the file's bytes, in `meta.provenance.artifacts["tokens.dtcg.json"]`. That edit
is only the planted fault in the `provenance` fixture; everywhere else the file stays as it is.

## Source of truth

The files in this folder are the fixtures. They were first written by a one-off generator that
is not shipped, and they are not regenerated: edit the committed files directly, then re-run
the suite.
