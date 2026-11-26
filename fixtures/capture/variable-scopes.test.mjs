// capture-figma: variableScopes — routing a numeric value by its declared Plugin API scope, and the
// name/scope disagreement warning (CONTRACT.md §Invocation contract).
//   node --test "fixtures/capture/*.test.mjs"
// Each case runs the real CLI on a throwaway capture bundle in os.tmpdir().

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'capture-figma.mjs');

function capture(variableDefs, extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'capture-scopes-'));
  const input = path.join(dir, 'capture.json');
  const out = path.join(dir, 'design-lock.json');
  writeFileSync(input, JSON.stringify({ name: 'acme-banking', variableDefs, ...extra }));
  const r = spawnSync(process.execPath, [CLI, '--input', input, '--out', out], { encoding: 'utf8' });
  const lock = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, lock };
}

const base = { 'color/light/background': '#F7F6F3' };

test('a CORNER_RADIUS-scoped number with no family in its name is routed to radii, slot = whole name', () => {
  const r = capture({ ...base, 'Size/Control': 8 }, { variableScopes: { 'Size/Control': ['CORNER_RADIUS'] } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.radii['size-control'], 8);
  assert.match(r.stdout, /routed to radii\.size-control by its CORNER_RADIUS scope/);
  assert.match(r.stdout, /scopes:\s+1 routed by declared scope/);
});

test('a GAP-scoped number with no family in its name joins the spacing scale', () => {
  const r = capture({ ...base, 'Grid/Gutter': '24px', 'Grid/Column': 4 }, { variableScopes: { 'Grid/Gutter': ['GAP'], 'Grid/Column': ['WIDTH_HEIGHT'] } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lock.tokens.spacing, [24]);
  assert.match(r.stdout, /unmapped variableDefs entries: 1/, 'WIDTH_HEIGHT has no lock family and stays unmapped');
});

test('the same number with no scopes stays unmapped (the scope did the routing, not the name)', () => {
  const r = capture({ ...base, 'Size/Control': 8 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.radii, undefined);
  assert.match(r.stdout, /unmapped variableDefs entries: 1/);
  assert.doesNotMatch(r.stdout, /scopes:/);
});

test('a name family that disagrees with the declared scopes is warned, routed by name, and never fails', () => {
  const r = capture({ ...base, 'Radius/Pill': 999 }, { variableScopes: { 'Radius/Pill': ['GAP'] } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.radii.pill, 999, 'the name wins the routing');
  assert.match(r.stdout, /"Radius\/Pill": the name routes it to radius but its declared scopes \(GAP\) say spacing/);
  assert.match(r.stdout, /1 name\/scope disagreement/);
});

test('ALL_SCOPES and a scope the lock has no family for say nothing', () => {
  const r = capture({ ...base, 'Radius/Pill': 999, 'spacing/md': 16 }, { variableScopes: { 'Radius/Pill': ['ALL_SCOPES'], 'spacing/md': ['WIDTH_HEIGHT'] } });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /disagreement/);
  assert.equal(r.lock.tokens.radii.pill, 999);
});

test('a colour whose scopes are all text-content is a disagreement; a fill scope is not', () => {
  const ok = capture({ 'color/light/background': '#F7F6F3' }, { variableScopes: { 'color/light/background': ['FRAME_FILL', 'SHAPE_FILL'] } });
  assert.equal(ok.status, 0, ok.stderr);
  assert.doesNotMatch(ok.stdout, /disagreement/);
  const bad = capture({ 'color/light/background': '#F7F6F3' }, { variableScopes: { 'color/light/background': ['FONT_SIZE'] } });
  assert.equal(bad.status, 0, bad.stderr);
  assert.match(bad.stdout, /say typography/);
});

test('a malformed variableScopes is a usage error and no lock is written', () => {
  for (const bad of ['nope', ['CORNER_RADIUS'], { 'Size/Control': 'CORNER_RADIUS' }, { 'Size/Control': [1] }]) {
    const r = capture({ ...base, 'Size/Control': 8 }, { variableScopes: bad });
    assert.equal(r.status, 2, JSON.stringify(bad));
    assert.equal(r.lock, null);
    assert.match(r.stderr, /"variableScopes" must be an object/);
  }
});
