// verify.mjs: three outcomes per screen — pass, fail, inconclusive — and the exit-code order
// (CONTRACT.md §Exit codes: a setup code, then a finding (1), then inconclusive (6)).
// The gate scripts are stubs in a temp directory (VERIFY_SCRIPTS_DIR, verify's test seam): each
// exits with the code the case asks for, so this proves the orchestration, not the gates.
//   node --test "fixtures/layout/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'verify.mjs');
const GATES = ['adherence-lint.mjs', 'render.mjs', 'geometry.mjs', 'layout-audit.mjs', 'diff.mjs', 'colour-census.mjs'];

function run(codes, { layoutReport = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-status-'));
  const stubs = path.join(dir, 'stubs');
  mkdirSync(stubs);
  for (const g of GATES) {
    writeFileSync(path.join(stubs, g), `process.stdout.write('${g} stub\\n'); process.exit(${codes[g] ?? 0});\n`);
  }
  const lockPath = path.join(dir, 'design-lock.json');
  writeFileSync(lockPath, JSON.stringify({ name: 'fixture', screens: [{ id: 'home', mode: 'B2', url: 'home.html', passThreshold: 0.5, tileCeiling: 40 }] }));
  if (layoutReport) {
    mkdirSync(path.join(dir, '.report'), { recursive: true });
    writeFileSync(path.join(dir, '.report', 'home.layout.json'), JSON.stringify(layoutReport));
  }
  const r = spawnSync(process.execPath, [VERIFY, '--lock', lockPath], { encoding: 'utf8', env: { ...process.env, VERIFY_SCRIPTS_DIR: stubs } });
  const report = JSON.parse(readFileSync(path.join(dir, '.report', 'verify-report.json'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, report };
}

test('every gate green: status pass, exit 0, the layout gate in the row', () => {
  const r = run({});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.report.status, 'pass');
  assert.equal(r.report.screens.home.status, 'pass');
  assert.match(r.stdout, /PASS {2}home \[B2\] {2}lint=ok render=ok geometry=ok layout=ok diff=ok census=ok/);
});

test('layout gate exit 6 with everything else green: the screen is inconclusive, verify exits 6, nothing is called a failure', () => {
  const r = run({ 'layout-audit.mjs': 6 }, { layoutReport: { manual: ['optical centring is not judged here'], inconclusiveReasons: ['nothing to measure: no control was found'] } });
  assert.equal(r.status, 6, r.stderr);
  assert.equal(r.report.status, 'inconclusive');
  assert.equal(r.report.screens.home.status, 'inconclusive');
  assert.equal(r.report.screens.home.pass, false);
  assert.equal(r.report.screens.home.gates.layout.status, 'inconclusive');
  assert.deepEqual(r.report.screens.home.blockers, []);
  assert.match(r.report.screens.home.inconclusive[0], /nothing to measure/);
  assert.match(r.stdout, /INCONCLUSIVE {2}home/);
  assert.match(r.stdout, /layout=INCONCLUSIVE/);
  assert.equal(r.report.firstBlockingChild, null, 'exit 6 never propagates as a blocking child');
});

test('the manualReview list carries the taste gate and what the layout audit says it cannot see', () => {
  const r = run({}, { layoutReport: { manual: ['optical centring is not judged here'], inconclusiveReasons: [] } });
  const notes = r.report.screens.home.manualReview;
  assert.ok(notes.some((n) => /taste/i.test(n)));
  assert.ok(notes.some((n) => /optical centring/.test(n)));
});

test('a finding beats inconclusive: layout 6 and diff 1 → status fail, exit 1', () => {
  const r = run({ 'layout-audit.mjs': 6, 'diff.mjs': 1 });
  assert.equal(r.status, 1);
  assert.equal(r.report.screens.home.status, 'fail');
});

test('a layout ERROR is a finding: layout exit 1 → status fail, exit 1, the diff still runs', () => {
  const r = run({ 'layout-audit.mjs': 1 });
  assert.equal(r.status, 1);
  assert.equal(r.report.screens.home.status, 'fail');
  assert.equal(r.report.screens.home.gates.diff.status, 'pass');
  assert.match(r.report.screens.home.blockers.join(' '), /layout gate/);
});

test('a setup code beats both: render exit 5 → exit 5 propagated, layout skipped', () => {
  const r = run({ 'render.mjs': 5, 'layout-audit.mjs': 6 });
  assert.equal(r.status, 5);
  assert.equal(r.report.screens.home.gates.layout.status, 'skipped');
  assert.equal(r.report.screens.home.status, 'fail');
});
