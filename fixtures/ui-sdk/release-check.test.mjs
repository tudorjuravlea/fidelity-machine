// release-check.mjs and the vendored runtime: the shape-based leak classes (a private host, a
// credential shape) misread minified third-party code, so a vendored file is left out of them, and
// only while it is byte for byte what VENDORED.json recorded. The literal ban list still reads it.
// Each case runs the real script inside a throwaway copy of the engine tree.
//   node --test "fixtures/ui-sdk/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', '.git', '.omc', '.render', '.report']);

function copyOfEngine() {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-check-'));
  cpSync(ENGINE, dir, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
  return dir;
}
const check = (dir, ...extra) => spawnSync(process.execPath, [path.join(dir, 'scripts', 'release-check.mjs'), '--skip-fresh', ...extra], { encoding: 'utf8' });

test('the vendored runtime, as vendored, does not trip the leak sweep, and the output says how many files it left to their hashes', () => {
  const dir = copyOfEngine();
  const r = check(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.match(r.stdout, /brand-leakage\s+PASS/, r.stdout.slice(-1500));
  assert.match(r.stdout, /runtime\/ui-sdk\/: \d+ vendored file\(s\) match VENDORED\.json/);
});

test('a vendored file that was edited is read like any other file again', () => {
  const dir = copyOfEngine();
  // Spelled in two halves so this file does not carry the shape the sweep looks for.
  appendFileSync(path.join(dir, 'runtime', 'ui-sdk', 'web', 'tabs.js'), `\n// see http://build.${'inter'}${'nal'}/tabs\n`);
  const r = check(dir);
  rmSync(dir, { recursive: true, force: true });
  assert.match(r.stdout, /brand-leakage\s+FAIL/);
  assert.match(r.stdout, /runtime\/ui-sdk\/web\/tabs\.js:\d+\s+\[class:private-host\]/);
});

test('the literal ban list still reads a vendored file that matches its hash', () => {
  const dir = copyOfEngine();
  // A term nothing in the tree contains: the unedited runtime passes with it banned, which shows
  // the ban scan ran over those files rather than skipping them (the summary counts every file).
  // Both terms are spelled in halves, so the only place the second one exists is the vendored copy.
  const r = check(dir, '--ban', `createRoving${'FocusZZZ'}`);
  const banned = check(dir, '--ban', `activation-${'direction'}`);
  rmSync(dir, { recursive: true, force: true });
  assert.match(r.stdout, /brand-leakage\s+PASS/);
  assert.match(banned.stdout, /brand-leakage\s+FAIL/);
  assert.match(banned.stdout, /runtime\/ui-sdk\//, 'a banned word inside the vendored copy is still found');
});
