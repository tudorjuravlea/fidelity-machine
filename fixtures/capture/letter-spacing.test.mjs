// capture-figma: Font(...) composite letter-spacing unit handling (CONTRACT.md §Invocation contract).
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

const font = (size, ls) =>
  `Font(family: "Inter", style: Bold, size: ${size}, weight: 700, lineHeight: 28, letterSpacing: ${ls})`;

function capture(variableDefs, extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'capture-ls-'));
  const input = path.join(dir, 'capture.json');
  const out = path.join(dir, 'design-lock.json');
  writeFileSync(input, JSON.stringify({ name: 'acme-banking', variableDefs, ...extra }));
  const r = spawnSync(process.execPath, [CLI, '--input', input, '--out', out], { encoding: 'utf8' });
  const lock = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stderr: r.stderr, lock };
}

test('a bare non-zero letterSpacing with no declared unit is refused, naming both readings', () => {
  const r = capture({ 'Headline 3': font(24, -0.5) });
  assert.equal(r.status, 2);
  assert.equal(r.lock, null, 'no lock may be written on refusal');
  assert.match(r.stderr, /"Headline 3"/);
  assert.match(r.stderr, /-0\.005em if percent/);
  assert.match(r.stderr, /-0\.0208em if px/);
});

test('letterSpacingUnit "percent" divides by 100', () => {
  const r = capture({ 'Headline 3': font(24, -0.5), 'Body 1': font(20, 0.25) }, { letterSpacingUnit: 'percent' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.typography['headline-3'].letterSpacingEm, -0.005);
  assert.equal(r.lock.tokens.typography['body-1'].letterSpacingEm, 0.0025);
});

test('letterSpacingUnit "px" divides by the font size', () => {
  const r = capture({ 'Headline 3': font(24, -0.5) }, { letterSpacingUnit: 'px' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.typography['headline-3'].letterSpacingEm, -0.0208);
});

test('an inline unit wins over the bundle unit', () => {
  const r = capture({ 'Headline 3': font(24, '-0.5%'), 'Caption': font(20, '1px') }, { letterSpacingUnit: 'px' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.typography['headline-3'].letterSpacingEm, -0.005);
  assert.equal(r.lock.tokens.typography.caption.letterSpacingEm, 0.05);
});

test('an inline unit needs no bundle unit', () => {
  const r = capture({ 'Headline 3': font(24, '-0.5%') });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.typography['headline-3'].letterSpacingEm, -0.005);
});

test('zero letterSpacing is not ambiguous and needs no unit', () => {
  const r = capture({ 'Button': font(16, 0) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.typography.button.letterSpacingEm, undefined);
});

test('an unknown letterSpacingUnit value is a usage error', () => {
  const r = capture({ 'Headline 3': font(24, -0.5) }, { letterSpacingUnit: 'em' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /must be "percent" or "px"/);
});
