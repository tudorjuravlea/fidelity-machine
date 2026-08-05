#!/usr/bin/env node
/**
 * setup-check.mjs — readiness gate (CONTRACT.md §3.7).
 *
 * Verifies, WITHOUT installing anything:
 *   1. Node >= 20
 *   2. pixelmatch / pngjs / playwright resolve from THE SKILL's own node_modules
 *      (createRequire against the skill's package.json — never process.cwd())
 *   3. Playwright's Chromium executable exists on disk
 *   4. Reports the resolved Chromium build directory name (e.g. "chromium-1228") and
 *      warns if it matches none of the --expect-build values (a lock pinned to a
 *      different build invalidates noise-floor calibration — CONTRACT.md determinism #1)
 *
 * Exit codes (CONTRACT.md): 0 = ready · 2 = setup/usage error (exact remediation printed).
 * This script NEVER installs. verify.mjs refuses to run until this is green.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEPS = ['pixelmatch', 'pngjs', 'playwright'];
const REMEDY_DEPS = `cd ${SKILL_ROOT} && npm i pixelmatch pngjs playwright`;
const REMEDY_BROWSER = `cd ${SKILL_ROOT} && npx playwright install chromium`;
const BUILD_SEG_RE = /^chromium(?:_headless_shell)?-\d+$/;

const HELP = `setup-check.mjs — readiness gate (no --lock needed)

Usage:
  node scripts/setup-check.mjs [--expect-build <build-id>] [--help]

Flags:
  --expect-build <id>  Expected Playwright Chromium build directory, e.g. chromium-1228
                       (usually the lock's meta.chromiumBuild). Repeatable. If the resolved
                       build matches NONE of the given values, a warning is printed
                       (still exit 0 — a build mismatch is a determinism risk, not a
                       missing dependency).
  --lock <path>        Accepted for invocation uniformity with the other scripts; ignored.
  --help               This text.

Checks (never installs anything): node >= 20 · pixelmatch/pngjs/playwright resolvable from
the skill's own node_modules · Chromium executable present on disk · build dir reported.

Exit codes (CONTRACT.md): 0 = ready · 2 = setup/usage error (exact remediation printed).
`;

function usageFail(msg) {
  console.error(`setup-check: ${msg} (exit 2 — setup/usage error). Run with --help for usage.`);
  process.exit(2);
}

// --- args ---------------------------------------------------------------
const expectBuilds = [];
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    else if (a === '--expect-build') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) usageFail('--expect-build needs a value');
      expectBuilds.push(v);
    } else if (a === '--lock') { i++; /* tolerated for uniform invocation; unused */ }
    else usageFail(`unknown flag "${a}"`);
  }
}

// --- checks -------------------------------------------------------------
const report = [];   // human-readable lines
const problems = []; // each: { line, remedies: [] }
const warnings = [];

// 1. Node version
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor >= 20) {
  report.push(`[ok]      node v${process.versions.node} (>= 20 required)`);
} else {
  problems.push({
    line: `[MISSING] node v${process.versions.node} — this skill requires Node >= 20`,
    remedies: [`install Node >= 20 (current: v${process.versions.node})`],
  });
}

// 2. Deps resolve from the SKILL dir (never process.cwd())
const requireFromSkill = createRequire(path.join(SKILL_ROOT, 'package.json'));
const resolved = {};
for (const dep of DEPS) {
  try {
    resolved[dep] = requireFromSkill.resolve(dep);
    report.push(`[ok]      ${dep.padEnd(10)} -> ${resolved[dep]}`);
  } catch {
    problems.push({
      line: `[MISSING] ${dep} — not resolvable from ${SKILL_ROOT}/node_modules`,
      remedies: [REMEDY_DEPS],
    });
  }
}

// 3+4. Chromium executable + build directory name
let resolvedBuild = null;
if (resolved.playwright) {
  // playwright's version, read via fs (avoids exports-map issues with require('playwright/package.json'))
  try {
    const pwPkg = JSON.parse(readFileSync(path.join(path.dirname(resolved.playwright), 'package.json'), 'utf8'));
    report.push(`[ok]      playwright version ${pwPkg.version}`);
  } catch { /* version line is informational only */ }

  try {
    const { chromium } = requireFromSkill('playwright');
    const exe = chromium.executablePath();
    if (exe && existsSync(exe)) {
      resolvedBuild = exe.split(path.sep).find((seg) => BUILD_SEG_RE.test(seg)) ?? null;
      report.push(`[ok]      chromium executable -> ${exe}`);
      report.push(`          chromium build dir:   ${resolvedBuild ?? '(unrecognized layout)'}`);
      if (!resolvedBuild) {
        warnings.push('[warn]    could not identify the chromium build directory from the executable path — record meta.chromiumBuild manually');
      }
    } else {
      problems.push({
        line: `[MISSING] chromium executable not on disk (expected at: ${exe || 'unknown'})`,
        remedies: [REMEDY_BROWSER],
      });
    }
  } catch (err) {
    problems.push({
      line: `[MISSING] playwright loaded but chromium lookup failed: ${err.message}`,
      remedies: [REMEDY_BROWSER],
    });
  }
}

// --expect-build comparison (warning only — never a failure)
if (expectBuilds.length > 0 && resolvedBuild && !expectBuilds.includes(resolvedBuild)) {
  warnings.push(
    `[warn]    resolved build ${resolvedBuild} matches none of --expect-build (${expectBuilds.join(', ')}).` +
    ` Renders will NOT be comparable to references/noise-floor calibrated on the expected build` +
    ` (CONTRACT.md determinism invariant 1 — lock meta.chromiumBuild).`,
  );
}

// --- report -------------------------------------------------------------
console.log('░▒▓█  F1DΞL17Y::MΔCH1NΞ █▓▒░');
console.log('fidelity-machine · setup-check');
console.log(`  skill dir: ${SKILL_ROOT}`);
for (const line of report) console.log(`  ${line}`);
for (const p of problems) console.log(`  ${p.line}`);
for (const w of warnings) console.log(`  ${w}`);

if (problems.length > 0) {
  const remedies = [...new Set(problems.flatMap((p) => p.remedies))];
  console.log('');
  console.log('NOT READY (exit 2 — setup/usage error). Remediation — run this yourself, this script never installs:');
  for (const r of remedies) console.log(`  ${r}`);
  process.exit(2);
}

console.log('');
console.log(
  warnings.length > 0
    ? `READY (exit 0) — ${warnings.length} warning(s) above.`
    : 'READY — all checks passed (exit 0).',
);
process.exit(0);
