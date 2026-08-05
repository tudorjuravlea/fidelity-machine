#!/usr/bin/env node
// geometry.mjs — structure-before-pixels gate (plan §3.5).
//
// Compares the rendered DOM boxes dumped by render.mjs (.render/<screen>.geometry.json)
// against the lock's ground-truth rects (screens[].figIds[].rect, from Figma get_metadata).
// Runs BEFORE diff.mjs: a box out of tolerance is a layout error — fix structure first,
// don't bother pixel-diffing. Entries without a lock rect (mode B2) have no geometry
// ground truth by design: recorded as 'no-ground-truth' and skipped, never failed.
// Missing DOM elements (found: false) are always failures, ground truth or not.
//
// Usage: node geometry.mjs --lock <path/to/design-lock.json> [--screen <id>]
//   --screen omitted → every screen in the lock.
//   Reads  .render/<screen>.geometry.json (next to the lock; produced by render.mjs).
//   Writes .report/<screen>.geometry.json (next to the lock).
// Exit codes (CONTRACT.md): 0 pass · 1 geometry failure (out-of-tolerance or missing element)
//                           · 2 setup/usage error (bad args, unparseable lock, render output missing)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const USAGE = `usage: node geometry.mjs --lock <path/to/design-lock.json> [--screen <id>]
exit codes: 0 pass · 1 geometry failure · 2 setup/usage error`;

const HINT_OUT_OF_TOLERANCE =
  'box out of tolerance → layout error; fix position/size before pixel-diffing';

function die(code, msg) {
  console.error(`geometry.mjs: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { lock: null, screen: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lock') {
      args.lock = argv[++i];
      if (args.lock === undefined) die(2, `--lock needs a value (exit 2 = usage error)\n${USAGE}`);
    } else if (a === '--screen') {
      args.screen = argv[++i];
      if (args.screen === undefined) die(2, `--screen needs a value (exit 2 = usage error)\n${USAGE}`);
    } else {
      die(2, `unknown argument '${a}' (exit 2 = usage error)\n${USAGE}`);
    }
  }
  if (!args.lock) die(2, `--lock is required (exit 2 = usage error)\n${USAGE}`);
  return args;
}

const round2 = (n) => Math.round(n * 100) / 100;

function validRect(r) {
  return (
    r != null &&
    ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))
  );
}

// One lock figIds[] entry vs the render dump → report element.
// Precedence: missing (found:false / absent from dump) beats everything;
// then no-ground-truth (no lock rect — B2 by design, skipped not failed);
// then delta comparison → pass | fail.
function checkElement(entry, renderById, tol) {
  const base = { figmaNodeId: entry.figmaNodeId, domId: entry.domId };
  const rendered = renderById.get(entry.figmaNodeId);

  if (!rendered) {
    return {
      ...base,
      status: 'missing',
      deltas: null,
      hint: `no entry for figmaNodeId "${entry.figmaNodeId}" in the render geometry dump → re-run render.mjs (dump may predate this lock); element cannot be verified`,
    };
  }
  if (rendered.found === false) {
    return {
      ...base,
      status: 'missing',
      deltas: null,
      hint: `element with data-fig-id="${entry.domId}" not found in the rendered DOM → structural error; add the element (or fix its data-fig-id) before pixel-diffing`,
    };
  }

  const renderedRect = validRect(rendered.rect) ? rendered.rect : null;

  if (!validRect(entry.rect)) {
    // B2 screens have no geometry ground truth by design — recorded, skipped, never failed.
    return {
      ...base,
      status: 'no-ground-truth',
      deltas: null,
      ...(renderedRect ? { renderedRect } : {}),
    };
  }
  if (!renderedRect) {
    // found:true but no usable rect — never let NaN deltas slide into a false pass.
    return {
      ...base,
      status: 'missing',
      deltas: null,
      hint: `render geometry entry for "${entry.figmaNodeId}" has found:true but no usable rect → malformed dump; re-run render.mjs`,
    };
  }

  const deltas = {
    dx: round2(renderedRect.x - entry.rect.x),
    dy: round2(renderedRect.y - entry.rect.y),
    dw: round2(renderedRect.width - entry.rect.width),
    dh: round2(renderedRect.height - entry.rect.height),
  };
  const outOfTolerance = Object.values(deltas).some((d) => Math.abs(d) > tol);

  if (outOfTolerance) {
    return {
      ...base,
      status: 'fail',
      deltas,
      lockRect: entry.rect,
      renderedRect,
      hint: HINT_OUT_OF_TOLERANCE,
    };
  }
  return { ...base, status: 'pass', deltas };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

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

  let hadSetupError = false;
  let hadFailure = false;

  for (const screen of targets) {
    const tag = `geometry ${screen.id}:`;
    const renderPath = path.join(lockDir, '.render', `${screen.id}.geometry.json`);

    if (!existsSync(renderPath)) {
      console.error(
        `${tag} ${renderPath} not found — run render first:\n` +
          `  node scripts/render.mjs --lock ${lockPath} --screen ${screen.id}\n` +
          `(exit 2 = setup error: geometry gate needs render.mjs output)`
      );
      hadSetupError = true;
      continue;
    }

    let renderGeo;
    try {
      renderGeo = JSON.parse(await readFile(renderPath, 'utf8'));
    } catch (err) {
      console.error(`${tag} cannot parse ${renderPath}: ${err.message} — re-run render.mjs (exit 2 = setup error)`);
      hadSetupError = true;
      continue;
    }
    if (!Array.isArray(renderGeo.figIds)) {
      console.error(`${tag} ${renderPath} has no figIds[] — malformed dump, re-run render.mjs (exit 2 = setup error)`);
      hadSetupError = true;
      continue;
    }

    const renderById = new Map(renderGeo.figIds.map((e) => [e.figmaNodeId, e]));
    const tol = typeof screen.geometryTolerancePx === 'number' ? screen.geometryTolerancePx : 2;
    const lockFigIds = Array.isArray(screen.figIds) ? screen.figIds : [];

    const elements = lockFigIds.map((entry) => checkElement(entry, renderById, tol));

    const summary = { total: elements.length, pass: 0, fail: 0, missing: 0, 'no-ground-truth': 0 };
    for (const el of elements) summary[el.status]++;
    const failures = summary.fail + summary.missing;
    const result = failures === 0 ? 'pass' : 'fail';
    if (failures > 0) hadFailure = true;

    const report = {
      screen: screen.id,
      mode: screen.mode,
      gate: 'geometry',
      tolerancePx: tol,
      result,
      summary,
      elements,
    };
    const reportPath = path.join(reportDir, `${screen.id}.geometry.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');

    if (result === 'pass') {
      console.log(
        `${tag} PASS — ${summary.pass} in-tolerance, ${summary['no-ground-truth']} no-ground-truth of ${summary.total} (tol ${tol}px)`
      );
      if (summary.total === 0) {
        console.log(`${tag} note: no figIds declared for this screen — geometry gate had nothing to check`);
      } else if (summary['no-ground-truth'] === summary.total) {
        console.log(`${tag} note: no lock rects (mode ${screen.mode ?? '?'}) — no geometry ground truth by design; structural presence checked only`);
      }
    } else {
      console.log(
        `${tag} FAIL — ${summary.fail} out-of-tolerance, ${summary.missing} missing, ${summary.pass} pass, ${summary['no-ground-truth']} no-ground-truth of ${summary.total} (tol ${tol}px)`
      );
      for (const el of elements) {
        if (el.status === 'fail') {
          const d = el.deltas;
          console.log(`${tag}   FAIL ${el.figmaNodeId} (data-fig-id="${el.domId}") dx=${d.dx} dy=${d.dy} dw=${d.dw} dh=${d.dh} — ${el.hint}`);
        } else if (el.status === 'missing') {
          console.log(`${tag}   MISSING ${el.figmaNodeId} — ${el.hint}`);
        }
      }
    }
    console.log(`${tag} report: ${reportPath}`);
  }

  process.exit(hadSetupError ? 2 : hadFailure ? 1 : 0);
}

main().catch((err) => die(2, `unexpected error: ${err?.stack || err} (exit 2 = setup error)`));
