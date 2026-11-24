// verify.mjs --check: does the last verdict still stand?
//   node --test "fixtures/verify/*.test.mjs"
// A passing report says what was true when it was written. --check re-reads nothing but hashes:
// the screen, every other file in the lock's tree it can load, the lock, the reference image and
// the gate scripts, each hashed BEFORE the run that produced the verdict. FRESH (the verdict
// stands), STALE (something changed since), FAILING (the verdict stands and it was a fail),
// INCONCLUSIVE, UNMEASURED. The gates are stubs (VERIFY_SCRIPTS_DIR), so this proves the
// bookkeeping, not the gates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'verify.mjs');
const GATES = ['adherence-lint.mjs', 'render.mjs', 'geometry.mjs', 'layout-audit.mjs', 'operability-audit.mjs', 'diff.mjs', 'colour-census.mjs'];

// A two-screen project with a shared stylesheet, an image and a reference, and stub gates.
function project(codes = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-check-'));
  const stubs = path.join(dir, 'stubs');
  const tree = path.join(dir, 'capture');
  mkdirSync(stubs);
  mkdirSync(path.join(tree, 'assets'), { recursive: true });
  mkdirSync(path.join(tree, 'reference'));
  for (const g of GATES) writeFileSync(path.join(stubs, g), `process.stdout.write('${g} stub\\n'); process.exit(${codes[g] ?? 0});\n`);
  writeFileSync(path.join(tree, 'home.html'), '<!doctype html><link rel="stylesheet" href="assets/app.css"><h1>Home</h1>\n');
  writeFileSync(path.join(tree, 'pay.html'), '<!doctype html><link rel="stylesheet" href="assets/app.css"><h1>Pay</h1>\n');
  writeFileSync(path.join(tree, 'assets', 'app.css'), 'h1 { margin: 0; }\n');
  writeFileSync(path.join(tree, 'assets', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  writeFileSync(path.join(tree, 'reference', 'home.png'), 'not really a png: home\n');
  const lock = path.join(tree, 'design-lock.json');
  writeFileSync(lock, JSON.stringify({ name: 'fixture', screens: [
    { id: 'home', mode: 'B2', url: 'home.html', referenceImage: 'reference/home.png', passThreshold: 0.5, tileCeiling: 40 },
    { id: 'pay', mode: 'B2', url: 'pay.html', passThreshold: 0.5, tileCeiling: 40 },
  ] }));
  const env = { ...process.env, VERIFY_SCRIPTS_DIR: stubs };
  const run = (...args) => {
    const r = spawnSync(process.execPath, [VERIFY, '--lock', lock, ...args], { encoding: 'utf8', env });
    return { status: r.status, out: r.stdout + r.stderr };
  };
  return { dir, tree, stubs, lock, verify: run, check: (...args) => run('--check', ...args), done: () => rmSync(dir, { recursive: true, force: true }) };
}
const line = (out, id) => out.split('\n').find((l) => new RegExp(`^\\w+ +${id}\\b`).test(l)) ?? '';

test('after a passing run every screen is FRESH and --check exits 0', () => {
  const p = project();
  try {
    assert.equal(p.verify().status, 0);
    const c = p.check();
    assert.equal(c.status, 0, c.out);
    assert.match(line(c.out, 'home'), /^FRESH +home/);
    assert.match(line(c.out, 'pay'), /^FRESH +pay/);
  } finally { p.done(); }
});

test('a screen never verified is UNMEASURED: exit 6, never a pass', () => {
  const p = project();
  try {
    const c = p.check();
    assert.equal(c.status, 6, c.out);
    assert.match(line(c.out, 'home'), /^UNMEASURED +home/);
  } finally { p.done(); }
});

test('one byte in the screen makes its verdict STALE and names the file; the other screen stays FRESH', () => {
  const p = project();
  try {
    p.verify();
    writeFileSync(path.join(p.tree, 'home.html'), readFileSync(path.join(p.tree, 'home.html'), 'utf8') + ' ');
    const c = p.check();
    assert.equal(c.status, 6, c.out);
    assert.match(line(c.out, 'home'), /^STALE +home.*changed: home\.html/);
    assert.match(line(c.out, 'pay'), /^FRESH +pay/, 'another screen\'s page is not this screen\'s evidence');
    assert.equal(p.check('--screen', 'pay').status, 0);
  } finally { p.done(); }
});

test('a shared stylesheet is every screen\'s evidence: editing it makes both STALE', () => {
  const p = project();
  try {
    p.verify();
    writeFileSync(path.join(p.tree, 'assets', 'app.css'), 'h1 { margin: 4px; }\n');
    const c = p.check();
    assert.match(line(c.out, 'home'), /^STALE +home.*changed: assets\/app\.css/);
    assert.match(line(c.out, 'pay'), /^STALE +pay.*changed: assets\/app\.css/);
  } finally { p.done(); }
});

test('a file added to the tree and a file removed from it are both named', () => {
  const p = project();
  try {
    p.verify();
    writeFileSync(path.join(p.tree, 'assets', 'extra.css'), 'p { margin: 0; }\n');
    rmSync(path.join(p.tree, 'assets', 'logo.svg'));
    const c = p.check('--screen', 'home');
    assert.equal(c.status, 6, c.out);
    assert.match(c.out, /added: assets\/extra\.css/);
    assert.match(c.out, /removed: assets\/logo\.svg/);
  } finally { p.done(); }
});

test('the lock, the reference image and the gate scripts are evidence too', () => {
  for (const [what, touch] of [
    ['the lock', (p) => writeFileSync(p.lock, readFileSync(p.lock, 'utf8') + '\n')],
    ['the reference image', (p) => writeFileSync(path.join(p.tree, 'reference', 'home.png'), 'another picture\n')],
    ['the gate scripts', (p) => writeFileSync(path.join(p.stubs, 'diff.mjs'), 'process.exit(0); // rewritten\n')],
  ]) {
    const p = project();
    try {
      p.verify();
      touch(p);
      const c = p.check('--screen', 'home');
      assert.equal(c.status, 6, `${what}: ${c.out}`);
      assert.match(line(c.out, 'home'), new RegExp(`^STALE +home.*${what}`), c.out);
    } finally { p.done(); }
  }
});

test('the reports verify writes are not evidence: a second --check still says FRESH', () => {
  const p = project();
  try {
    p.verify();
    assert.equal(p.check().status, 0);
    assert.equal(p.check().status, 0);
  } finally { p.done(); }
});

test('a failing verdict that still stands is FAILING: exit 1; once the screen is edited it is STALE, not failing', () => {
  const p = project({ 'diff.mjs': 1 });
  try {
    assert.equal(p.verify().status, 1);
    const c = p.check('--screen', 'home');
    assert.equal(c.status, 1, c.out);
    assert.match(line(c.out, 'home'), /^FAILING +home/);
    writeFileSync(path.join(p.tree, 'home.html'), '<!doctype html><h1>Fixed, perhaps</h1>\n');
    const again = p.check('--screen', 'home');
    assert.equal(again.status, 6, again.out);
    assert.match(line(again.out, 'home'), /^STALE +home/);
  } finally { p.done(); }
});

test('an inconclusive verdict that still stands is INCONCLUSIVE: exit 6', () => {
  const p = project({ 'layout-audit.mjs': 6 });
  try {
    assert.equal(p.verify().status, 6);
    const c = p.check('--screen', 'home');
    assert.equal(c.status, 6, c.out);
    assert.match(line(c.out, 'home'), /^INCONCLUSIVE +home/);
  } finally { p.done(); }
});

test('verifying one screen leaves the other screen\'s verdict standing', () => {
  const p = project();
  try {
    p.verify();
    assert.equal(p.verify('--screen', 'home').status, 0);
    const c = p.check();
    assert.equal(c.status, 0, c.out);
    assert.match(line(c.out, 'pay'), /^FRESH +pay/);
  } finally { p.done(); }
});

test('--check writes nothing and runs no gate', () => {
  const p = project();
  try {
    p.verify();
    const snapshot = () => readdirSync(path.join(p.tree, '.report')).sort().map((f) => `${f}:${statSync(path.join(p.tree, '.report', f)).mtimeMs}:${readFileSync(path.join(p.tree, '.report', f), 'utf8').length}`).join('|');
    const before = snapshot();
    const c = p.check();
    assert.doesNotMatch(c.out, /stub/);
    assert.equal(snapshot(), before);
    assert.ok(!existsSync(path.join(p.tree, '.render', 'anything')));
  } finally { p.done(); }
});

test('--check with an unknown screen is a usage error, and it cannot be combined with --calibrate', () => {
  const p = project();
  try {
    assert.equal(p.check('--screen', 'nope').status, 2);
    assert.equal(p.check('--calibrate').status, 2);
  } finally { p.done(); }
});
