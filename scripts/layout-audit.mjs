#!/usr/bin/env node
// layout-audit.mjs — self-consistency layout gate (structure before pixels, without a ground truth).
//
// geometry.mjs holds the rendered boxes against the lock's Figma rects and skips a screen that has
// none (mode B2). This gate needs no reference: render.mjs runs layout-audit-core.mjs INSIDE the
// rendered page and dumps what it measured to .render/<screen>.layout.json; this script reads that
// dump, judges it and writes .report/<screen>.layout.json. The rules and thresholds are documented
// in scripts/layout-audit-core.mjs.
//
// Usage: node layout-audit.mjs --lock <path/to/design-lock.json> [--screen <id>] [--strict]
//   --screen omitted → every screen in the lock.
//   --strict         → WARN findings fail the gate too (default: only ERROR fails).
//   Reads  .render/<screen>.layout.json (next to the lock; produced by render.mjs).
//   Writes .report/<screen>.layout.json (next to the lock).
// Exit codes (CONTRACT.md): 0 pass · 1 layout finding (an ERROR, or a WARN under --strict)
//   · 2 setup/usage error (bad args, unparseable lock, render output missing)
//   · 6 INCONCLUSIVE — the audit could not judge: an element's geometry was still animating when
//     the page was measured, or the page offered nothing to measure. Not a pass, not a finding:
//     settle the page (or declare what to audit) and render again. A real finding beats this code.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const USAGE = `usage: node layout-audit.mjs --lock <path/to/design-lock.json> [--screen <id>] [--strict]
exit codes: 0 pass · 1 layout finding · 2 setup/usage error · 6 inconclusive (nothing judged)`;

function die(code, msg) {
  console.error(`layout-audit.mjs: ${msg}`);
  if (code === 2) console.error(USAGE);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { lock: null, screen: null, strict: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--lock') args.lock = argv[++i];
    else if (a === '--screen') args.screen = argv[++i];
    else if (a === '--strict') args.strict = true;
    else die(2, `unknown argument "${a}"`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }
  if (!args.lock) die(2, '--lock <path> is required');

  const lockPath = path.resolve(args.lock);
  let lock;
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch (err) {
    die(2, `cannot read/parse lock ${lockPath}: ${err.message} (exit 2 = setup error)`);
  }
  const lockDir = path.dirname(lockPath);
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  if (screens.length === 0) die(2, `lock ${lockPath} has no screens[] (exit 2 = setup error)`);

  let targets = screens;
  if (args.screen) {
    targets = screens.filter((s) => s.id === args.screen);
    if (targets.length === 0) {
      die(2, `screen "${args.screen}" not in lock (available: ${screens.map((s) => s.id).join(', ')}) (exit 2 = usage error)`);
    }
  }

  const reportDir = path.join(lockDir, '.report');
  await mkdir(reportDir, { recursive: true });

  let hadSetupError = false, hadFailure = false, hadInconclusive = false;

  for (const screen of targets) {
    const tag = `layout ${screen.id}:`;
    const renderPath = path.join(lockDir, '.render', `${screen.id}.layout.json`);
    if (!existsSync(renderPath)) {
      console.error(
        `${tag} ${renderPath} not found — run render first:\n` +
          `  node scripts/render.mjs --lock ${lockPath} --screen ${screen.id}\n` +
          `(exit 2 = setup error: the layout gate needs render.mjs output)`
      );
      hadSetupError = true;
      continue;
    }
    let dump;
    try {
      dump = JSON.parse(await readFile(renderPath, 'utf8'));
    } catch (err) {
      console.error(`${tag} cannot parse ${renderPath}: ${err.message} — re-run render.mjs (exit 2 = setup error)`);
      hadSetupError = true;
      continue;
    }
    if (!Array.isArray(dump.findings) || !Array.isArray(dump.deferred) || !dump.checked) {
      console.error(`${tag} ${renderPath} is not a layout dump (findings[], deferred[], checked{} expected) — re-run render.mjs (exit 2 = setup error)`);
      hadSetupError = true;
      continue;
    }

    const errors = dump.findings.filter((f) => f.level === 'ERROR');
    const warns = dump.findings.filter((f) => f.level !== 'ERROR');
    const checkedCount = Object.values(dump.checked).reduce((n, v) => n + (Number(v) || 0), 0);
    const failing = errors.length > 0 || (args.strict && warns.length > 0);
    const inconclusive = !failing && (dump.deferred.length > 0 || checkedCount === 0);
    const status = failing ? 'fail' : inconclusive ? 'inconclusive' : 'pass';
    if (failing) hadFailure = true;
    if (inconclusive) hadInconclusive = true;

    const reasons = [];
    if (dump.deferred.length) reasons.push(`${dump.deferred.length} element(s) were animating when measured: ${dump.deferred.join('; ')}`);
    if (checkedCount === 0) reasons.push('nothing to measure: no control, padded container, text, declared pane, list or icon group was found');

    const report = {
      screen: screen.id,
      mode: screen.mode ?? null,
      gate: 'layout',
      strict: args.strict,
      status,
      summary: { errors: errors.length, warns: warns.length, deferred: dump.deferred.length, checked: checkedCount },
      checked: dump.checked,
      findings: dump.findings,
      deferred: dump.deferred,
      manual: Array.isArray(dump.manual) ? dump.manual : [],
      inconclusiveReasons: reasons,
    };
    const reportPath = path.join(reportDir, `${screen.id}.layout.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');

    const head = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'INCONCLUSIVE';
    console.log(`${tag} ${head} — ${errors.length} error(s), ${warns.length} warning(s), ${dump.deferred.length} deferred, ${checkedCount} checked (controls ${dump.checked.controls ?? 0}, containers ${dump.checked.paddedContainers ?? 0}, text ${dump.checked.textLeaves ?? 0})`);
    for (const f of errors) console.log(`${tag}   ERROR ${f.message}`);
    for (const f of warns) console.log(`${tag}   WARN  ${f.message}`);
    for (const r of reasons) console.log(`${tag}   inconclusive: ${r}`);
    for (const m of report.manual) console.log(`${tag}   manual: ${m}`);
    console.log(`${tag} report: ${reportPath}`);
  }

  process.exit(hadSetupError ? 2 : hadFailure ? 1 : hadInconclusive ? 6 : 0);
}

main().catch((err) => die(2, `unexpected error: ${err?.stack || err} (exit 2 = setup error)`));
