// layout-audit.mjs: the gate that judges render.mjs's .render/<screen>.layout.json (CONTRACT.md
// §Invocation contract, §Exit codes). Each case runs the real CLI on a throwaway lock in os.tmpdir().
//   node --test "fixtures/layout/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'layout-audit.mjs');

const finding = (rule, level) => ({ rule, level, element: 'button "Save"', message: `${rule}: button "Save" is 20px high but needs 36px`, evidence: { height: 20 } });
const dump = (over = {}) => ({ screenId: 'home', findings: [], deferred: [], manual: ['optical centring is not judged here'], checked: { controls: 3, paddedContainers: 2, textLeaves: 9, panes: 0, lists: 0, iconGroups: 0 }, ...over });

function run(layoutDump, { screen = 'home', extra = [] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'layout-audit-'));
  const lockPath = path.join(dir, 'design-lock.json');
  writeFileSync(lockPath, JSON.stringify({ name: 'fixture', screens: [{ id: 'home', mode: 'B2', url: 'home.html' }] }));
  if (layoutDump) {
    mkdirSync(path.join(dir, '.render'));
    writeFileSync(path.join(dir, '.render', 'home.layout.json'), JSON.stringify(layoutDump));
  }
  const r = spawnSync(process.execPath, [CLI, '--lock', lockPath, '--screen', screen, ...extra], { encoding: 'utf8' });
  const reportPath = path.join(dir, '.report', 'home.layout.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, report };
}

test('a clean dump passes: exit 0, status pass, report written with what was checked', () => {
  const r = run(dump());
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.report.status, 'pass');
  assert.equal(r.report.checked.controls, 3);
  assert.match(r.stdout, /PASS/);
});

test('an ERROR finding fails the gate: exit 1 and the finding line on stdout', () => {
  const r = run(dump({ findings: [finding('control-box-fit', 'ERROR')] }));
  assert.equal(r.status, 1);
  assert.equal(r.report.status, 'fail');
  assert.match(r.stdout, /control-box-fit: button "Save" is 20px high/);
});

test('WARN findings alone pass with the warnings listed, and --strict turns them into exit 1', () => {
  const warn = dump({ findings: [finding('text-inset', 'WARN')] });
  const r = run(warn);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.report.status, 'pass');
  assert.match(r.stdout, /WARN.*text-inset/);
  const strict = run(warn, { extra: ['--strict'] });
  assert.equal(strict.status, 1);
  assert.equal(strict.report.status, 'fail');
});

test('a deferred item makes the run inconclusive: exit 6, never a pass, the reason named', () => {
  const r = run(dump({ deferred: ['button "Loading": control geometry is animating'] }));
  assert.equal(r.status, 6, r.stderr);
  assert.equal(r.report.status, 'inconclusive');
  assert.match(r.stdout, /INCONCLUSIVE/);
  assert.match(r.stdout, /control geometry is animating/);
});

test('a dump that checked nothing is inconclusive too (a page with no controls or containers is not a pass)', () => {
  const r = run(dump({ checked: { controls: 0, paddedContainers: 0, textLeaves: 0, panes: 0, lists: 0, iconGroups: 0 } }));
  assert.equal(r.status, 6, r.stderr);
  assert.equal(r.report.status, 'inconclusive');
});

test('an ERROR beats inconclusive: a real finding is exit 1 even with a deferred item', () => {
  const r = run(dump({ findings: [finding('control-box-fit', 'ERROR')], deferred: ['x: animating'] }));
  assert.equal(r.status, 1);
  assert.equal(r.report.status, 'fail');
  assert.ok(r.report.deferred.length === 1);
});

test('the report carries the manual notes verbatim', () => {
  const r = run(dump());
  assert.deepEqual(r.report.manual, ['optical centring is not judged here']);
});

test('no dump: exit 2 pointing at render.mjs', () => {
  const r = run(null);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /render\.mjs/);
});

test('an unknown screen id is a usage error (exit 2)', () => {
  const r = run(dump(), { screen: 'nope' });
  assert.equal(r.status, 2);
});

test('--help answers', () => {
  const r = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--lock/);
});
