// capture-figma: the four optional scales (tokens.opacity, blur, zIndex, breakpoints) are derived
// from the capture's variables and written into the three derived token files.
//   node --test "fixtures/capture/*.test.mjs"
// Each case runs the real CLI on a throwaway bundle (or, for --derive, a throwaway lock) in
// os.tmpdir(). A lock that declares none of the four must get the same derived files as before:
// its provenance receipt records their hashes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', '..', 'scripts', 'capture-figma.mjs');
const LINT = path.join(HERE, '..', '..', 'scripts', 'adherence-lint.mjs');
const BASE = { 'Color/Background': '#F7F6F3', 'Color/Text1': '#1C1B18', 'Spacing/2': 8 };

function read(dir) {
  const at = (f) => path.join(dir, 'assets', f);
  const lockPath = path.join(dir, 'design-lock.json');
  return {
    lock: existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null,
    css: existsSync(at('tokens.css')) ? readFileSync(at('tokens.css'), 'utf8') : '',
    tailwind: existsSync(at('tailwind.tokens.cjs')) ? createRequire(import.meta.url)(at('tailwind.tokens.cjs')) : null,
    dtcg: existsSync(at('tokens.dtcg.json')) ? JSON.parse(readFileSync(at('tokens.dtcg.json'), 'utf8')) : null,
  };
}
function capture(variableDefs, extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'capture-scales-'));
  try {
    writeFileSync(path.join(dir, 'capture.json'), JSON.stringify({ name: 'acme-banking', variableDefs: { ...BASE, ...variableDefs }, ...extra }));
    const r = spawnSync(process.execPath, [CLI, '--input', path.join(dir, 'capture.json'), '--out', path.join(dir, 'design-lock.json')], { encoding: 'utf8' });
    return { status: r.status, stderr: r.stdout + r.stderr, ...read(dir) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
// Re-derive from a lock written by hand: what a lock can hold, a capture need not have produced.
function derive(tokens, then = () => null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'derive-scales-'));
  try {
    mkdirSync(path.join(dir, 'assets'));
    const lock = capture({}).lock;
    Object.assign(lock.tokens, tokens);
    writeFileSync(path.join(dir, 'design-lock.json'), JSON.stringify(lock, null, 2));
    const r = spawnSync(process.execPath, [CLI, '--derive', '--lock', path.join(dir, 'design-lock.json')], { encoding: 'utf8' });
    return { status: r.status, stderr: r.stdout + r.stderr, ...read(dir), extra: then(dir) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- derivation from variables
test('opacity: a fraction, a percentage and a Figma 0 to 100 number become one sorted scale of fractions', () => {
  const r = capture({ 'Opacity/Disabled': 0.4, 'Opacity/Scrim': '72%', 'Opacity/Hover': 90, 'Alpha/Faint': '0.08' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lock.tokens.opacity, [0.08, 0.4, 0.72, 0.9]);
  assert.match(r.stderr, /"Opacity\/Hover".*90.*read as 90%/, 'a number over 1 is a percentage, and that reading is said');
});

test('opacity: a value that is no opacity is skipped with a warning, never guessed', () => {
  const r = capture({ 'Opacity/Odd': 250, 'Opacity/Word': 'half', 'Opacity/Neg': -0.2, 'Opacity/Ok': 0.5 });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lock.tokens.opacity, [0.5]);
  for (const name of ['Odd', 'Word', 'Neg']) assert.match(r.stderr, new RegExp(`"Opacity/${name}"[^\\n]*skipped`));
});

test('blur: px values become one sorted scale', () => {
  const r = capture({ 'Blur/Overlay': '24px', 'Blur/Glass': 8, 'Blurs/Soft': 8, 'Blur/Bad': '0.5rem' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lock.tokens.blur, [8, 24]);
  assert.match(r.stderr, /"Blur\/Bad"[^\n]*skipped/);
});

test('z-index: a role and an integer; a fraction or a missing role is skipped', () => {
  const r = capture({ 'Z-Index/Sticky': 100, 'zIndex/Overlay': '1000', 'Z/Toast': 1100, 'Z-Index/Half': 10.5, 'Z-Index': 5 });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lock.tokens.zIndex, { sticky: 100, overlay: 1000, toast: 1100 });
  assert.match(r.stderr, /"Z-Index\/Half"[^\n]*skipped/);
  assert.match(r.stderr, /"Z-Index"[^\n]*skipped/);
});

test('breakpoints: a name and a width in px; zero and a unit that is not px are skipped', () => {
  const r = capture({ 'Breakpoint/MD': 768, 'Breakpoints/LG': '1024px', 'Breakpoint/Zero': 0, 'Breakpoint/Em': '48em' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lock.tokens.breakpoints, { md: 768, lg: 1024 });
  assert.match(r.stderr, /"Breakpoint\/Zero"[^\n]*skipped/);
  assert.match(r.stderr, /"Breakpoint\/Em"[^\n]*skipped/);
});

test('a variable scoped to opacity with no family in its name joins the scale by its scope', () => {
  const r = capture({ 'Dim/Strong': 60 }, { variableScopes: { 'Dim/Strong': ['OPACITY'] } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.lock.tokens.opacity, [0.6]);
  assert.match(r.stderr, /"Dim\/Strong"[^\n]*OPACITY scope/);
});

test('a name that says one family and a scope that says opacity is routed by name and the disagreement is said', () => {
  const r = capture({ 'Radius/Odd': 8 }, { variableScopes: { 'Radius/Odd': ['OPACITY'] } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.lock.tokens.radii.odd, 8);
  assert.match(r.stderr, /"Radius\/Odd"[^\n]*opacity/);
});

test('a capture with none of the four leaves the lock and the derived files without them', () => {
  const r = capture({});
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['opacity', 'blur', 'zIndex', 'breakpoints']) assert.equal(f in r.lock.tokens, false);
  assert.doesNotMatch(r.css, /--opacity-|--blur-|--z-|--breakpoint-/);
  for (const k of ['opacity', 'blur', 'zIndex', 'screens']) assert.equal(k in r.tailwind, false);
  for (const k of ['opacity', 'blur', 'zIndex', 'breakpoint']) assert.equal(k in r.dtcg, false);
});

// ---------------------------------------------------------------- the derived files
const FULL = { 'Opacity/Disabled': 0.4, 'Opacity/Scrim': 0.725, 'Blur/Glass': 8, 'Blur/Fine': 4.5, 'Z-Index/Overlay': 1000, 'Breakpoint/MD': 768 };

test('tokens.css declares each value under a name a page can use', () => {
  const r = capture(FULL);
  assert.equal(r.status, 0, r.stderr);
  for (const line of ['--opacity-40: 0.4;', '--opacity-72-5: 0.725;', '--blur-8: 8px;', '--blur-4-5: 4.5px;', '--z-overlay: 1000;', '--breakpoint-md: 768px;']) {
    assert.ok(r.css.includes(`  ${line}`), `tokens.css lacks "${line}"\n${r.css}`);
  }
  assert.match(r.css, /a media query cannot read a custom property/i, 'the file says why --breakpoint-* is there and what it cannot do');
  assert.ok(r.css.indexOf('--breakpoint-md') < r.css.indexOf('\n}'), 'inside :root');
});

test('tailwind.tokens.cjs reads the variables, and gives screens their px, since a media query cannot read a variable', () => {
  const r = capture(FULL);
  assert.deepEqual(r.tailwind.opacity, { 40: 'var(--opacity-40)', '72-5': 'var(--opacity-72-5)' });
  assert.deepEqual(r.tailwind.blur, { 8: 'var(--blur-8)', '4-5': 'var(--blur-4-5)' });
  assert.deepEqual(r.tailwind.zIndex, { overlay: 'var(--z-overlay)' });
  assert.deepEqual(r.tailwind.screens, { md: '768px' });
});

test('tokens.dtcg.json carries the four groups with a type each', () => {
  const r = capture(FULL);
  assert.deepEqual(r.dtcg.opacity, { $type: 'number', 40: { $value: 0.4 }, '72-5': { $value: 0.725 } });
  assert.deepEqual(r.dtcg.blur, { $type: 'dimension', 8: { $value: '8px' }, '4-5': { $value: '4.5px' } });
  assert.deepEqual(r.dtcg.zIndex, { $type: 'number', overlay: { $value: 1000 } });
  assert.deepEqual(r.dtcg.breakpoint, { $type: 'dimension', md: { $value: '768px' } });
});

test('the receipt records the hashes of the files as written', () => {
  const r = capture(FULL);
  assert.equal(Object.keys(r.lock.meta.provenance.artifacts).length, 3);
  assert.match(r.lock.meta.provenance.lockTokensHash, /^sha256:[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------- --derive from a lock written by hand
test('--derive writes the four families from a lock, and the lint then finds the receipt whole', () => {
  const r = derive({ opacity: [0.4], blur: [8], zIndex: { overlay: 1000 }, breakpoints: { md: 768 } }, (dir) => {
    const lint = spawnSync(process.execPath, [LINT, '--lock', path.join(dir, 'design-lock.json'), '--json'], { encoding: 'utf8' });
    return lint.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((f) => f.type === 'finding' && ['provenance', 'token-scales'].includes(f.section));
  });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.css.includes('--z-overlay: 1000;') && r.css.includes('--opacity-40: 0.4;'));
  assert.deepEqual(r.extra, [], 'no provenance finding, and no token-scales row: all four are declared');
});

test('--derive leaves out an entry that could not be one safe declaration, and says so', () => {
  const r = derive({ zIndex: { 'over lay': 1000, 'x; } body { display: none': 5, modal: 1200 }, breakpoints: { 'm d': 768, lg: 1024 }, opacity: [0.4, 7, 'half'], blur: [8, -2] });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.css.includes('--z-modal: 1200;') && r.css.includes('--breakpoint-lg: 1024px;') && r.css.includes('--opacity-40: 0.4;') && r.css.includes('--blur-8: 8px;'));
  assert.doesNotMatch(r.css, /display: none|over lay|--breakpoint-m d|--opacity-700|--blur--2/);
  assert.deepEqual(r.tailwind.zIndex, { modal: 'var(--z-modal)' });
  assert.deepEqual(r.tailwind.screens, { lg: '1024px' });
  assert.match(r.stderr, /left out/);
});

test('a lock that declares none of the four derives the files it always did, byte for byte (the motion fixture, which ships them)', () => {
  const golden = path.join(HERE, '..', 'motion');
  const dir = mkdtempSync(path.join(tmpdir(), 'derive-golden-'));
  try {
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'design-lock.json'), readFileSync(path.join(golden, 'design-lock.json')));
    const r = spawnSync(process.execPath, [CLI, '--derive', '--lock', path.join(dir, 'design-lock.json')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    let compared = 0;
    for (const f of ['tokens.css', 'tailwind.tokens.cjs', 'tokens.dtcg.json']) {
      compared += 1;
      assert.equal(readFileSync(path.join(dir, 'assets', f), 'utf8'), readFileSync(path.join(golden, 'assets', f), 'utf8'), `${f} changed for a lock that declares no new scale`);
    }
    assert.equal(compared, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
