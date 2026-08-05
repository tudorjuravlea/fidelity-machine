# Releasing fidelity-machine

`scripts/release-check.mjs` is the executable half of release discipline; this file is the
human half. Both must be green — a passing script does not excuse a skipped step here, and
none of these steps excuses a red script.

## Before tagging

1. **Clean checkout.** Release from a fresh clone or worktree, never from a working tree
   with uncommitted or untracked files — local scratch files are exactly what leaks.
2. **Gates green.** Run `node scripts/contract-guard.mjs --self-test` and
   `node scripts/release-check.mjs`; both must pass. Extend the brand-leakage sweep with
   `--ban <term>` (repeatable) or `--ban-file <path>` (one extra banned term per line) for
   client and system names the built-in sweep cannot know. Do not use `--skip-fresh` on a
   release run — the fresh-install simulation is the point.
3. **Version and changelog move together.** One commit bumps the version and writes the
   changelog entry (what changed, why, compatibility impact per CONTRACT.md §Change
   classes); the git tag matches the version exactly. Never tag first and document later.

## Before announcing

4. **Install from the final public location.** In each target harness, install the package
   from where users will actually get it (the published registry entry or public repo URL),
   not from your local checkout — a path-installed package proves nothing about the
   artifact users receive. Run `node scripts/setup-check.mjs` and one full verify pass on
   the golden fixture in that installed copy.
5. **Demo with a synthetic system only.** Walkthroughs, screenshots, and README examples
   use a made-up system (`acme-banking`), never client material — no client tokens, fonts,
   reference images, or lock files, even cropped.

## Repository settings

6. **Enable security advisories** (private vulnerability reporting) and **branch
   protection** on the default branch: PRs only, gates must pass before merge.
7. **CI.** Run contract-guard and release-check on every PR, on macOS and Linux at
   minimum (the engine renders through platform-sensitive tooling), with least-privilege
   workflow permissions: `permissions: contents: read`.
