# Security

Where the engine writes, which commands reach the network, and what remains on disk afterwards,
with the file behind each statement named, so a reader can verify every line before installing.

## Supported versions and reporting

- **Supported versions:** the latest release only; older releases receive no fixes.
- **Reporting:** report vulnerabilities privately through GitHub private vulnerability
  reporting on this repository, or by email to tudor@juravlea.ro, never in a public issue or
  pull request.
- **No secrets in issues:** never include tokens, credentials, client design-system material,
  or lock files from real systems in issues, pull requests, or reports. Reproduce with the
  synthetic `acme-banking` fixture instead.

## No telemetry, and the only places the network is touched

Nothing in the engine sends data anywhere: no analytics, no usage ping, no crash reporting.
The network is reached only here, each on an explicit command:

- `scripts/ui-sdk.mjs outdated` and `update` query and download the vendored behaviour runtime
  through `npm` (`scripts/ui-sdk.mjs`); `--latest` and `--from <dir>` answer without it.
- `scripts/release-check.mjs` runs `npm install --omit=dev` in a temporary copy for its
  fresh-install check; `--skip-fresh` leaves it out.
- `npm install` and `npx playwright install chromium` are run by the person installing, never
  by a script.
- `scripts/render.mjs` opens the screen in the pinned Chromium from a `file://` URL. The page's
  own requests (fonts, images, scripts it names) go where the page says; every request that
  leaves the lock's tree is recorded in the geometry report, and with lock `render.network:
  "offline"` any host not in `render.allowHosts` is refused and the run exits 5 (CONTRACT.md
  §Determinism invariant 8). `scripts/motion.mjs check` applies the same policy to a piece.
- `scripts/motion.mjs serve` opens a loopback-only server for live presentation; the stage's
  take recorder posts to that server and nowhere else (`runtime/motion/stage.js`).
- The Figma MCP is reached by the model, not by any script; `references/spec-capture.md`
  says how a personal access token is handled on the REST fallback (never echoed, never logged).

## What the engine writes, and where

- `scripts/new-system.mjs` writes a skill under `~/.claude/skills/<name>/` (the instantiated
  SKILL.md, the scaffold's durable docs, evals, gauntlet, tools and a `captures/<capture>/`
  tree) and nothing outside it. It does not run a script afterwards, write a hook, or edit any
  settings file.
- `scripts/capture-figma.mjs` writes the lock it is pointed at and the derived token files in
  `assets/` beside it, and refuses to overwrite an existing lock without `--merge`.
- `render.mjs`, `geometry.mjs`, `layout-audit.mjs`, `operability-audit.mjs`, `diff.mjs`,
  `colour-census.mjs`, `probe-blind-spots.mjs` and `verify.mjs` write under `.render/` and
  `.report/` next to the lock (CONTRACT.md §Invocation contract); `motion.mjs` writes under
  `.motion/<id>/`; `ui-sdk.mjs link` and `motion.mjs new` create one symlink each inside the
  lock's tree. `probe-blind-spots.mjs` and `contract-guard.mjs --self-test` work in a temporary
  directory and write back only their report.
- The engine installs no hooks and registers nothing with an agent harness. The per-system
  skill is a directory of files the person creates with `new-system.mjs`.

## What stays on disk and can quote your material

`.render/` holds screenshots of your screens, `.report/` holds diff images, triplet crops, the
per-screen reports and `verify-report.json`, and `.report/<id>.history.json` keeps every
recorded run. A lint finding can quote the value it flagged (a hex, a string from the lock),
sanitized so a lock cannot author a report line. Keep these directories out of version control
for a real system, and keep live keys out of the pages you render, since the browser fetches
what the page names. Brand fonts, captures and locks live in the per-system skill, never in
this repository; `release-check.mjs` sweeps the engine for brand traces before a release.

(The disclosure shape, what is read, what leaves the machine and what stays on disk, follows
SECURITY.md of ux-ui-agent-skills by Thientan Soparat, MIT; see NOTICE.)
