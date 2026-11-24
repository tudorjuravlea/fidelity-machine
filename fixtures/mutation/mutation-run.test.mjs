// mutation-run.mjs: break the code on purpose, on a copy, and require the tests to notice.
//   node --test "fixtures/mutation/*.test.mjs"
// Each case builds a toy tree in os.tmpdir() (one module, one test file, one list of planted
// breaks) and runs the real CLI against it with --root. The toy test covers `add` and not `sub`,
// so a break of `sub` is a survivor by construction.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', '..', 'scripts', 'mutation-run.mjs');

const LIB = 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n';
const TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../lib/calc.mjs';\ntest('add', () => assert.equal(add(2, 3), 5));\n";

function run(mutations, { lib = LIB, testSrc = TEST, extra = [] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'mutation-run-'));
  try {
    mkdirSync(path.join(root, 'lib'));
    mkdirSync(path.join(root, 't'));
    writeFileSync(path.join(root, 'lib', 'calc.mjs'), lib);
    writeFileSync(path.join(root, 't', 'calc.test.mjs'), testSrc);
    const list = { target: 'lib/calc.mjs', copy: ['lib', 't'], test: ['node', '--test', 't/calc.test.mjs'], mutations };
    writeFileSync(path.join(root, 'calc.mutations.mjs'), `export default ${JSON.stringify(list)};\n`);
    const r = spawnSync(process.execPath, [CLI, path.join(root, 'calc.mutations.mjs'), '--root', root, ...extra], { encoding: 'utf8' });
    return { status: r.status, out: r.stdout + r.stderr, lib: readFileSync(path.join(root, 'lib', 'calc.mjs'), 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const breakAdd = { name: 'add subtracts', find: 'a + b', replace: 'a - b' };
const breakSub = { name: 'sub adds', find: 'a - b;\n', replace: 'a + b;\n' };

test('every planted break caught: exit 0, each named, and the count stated', () => {
  const r = run([breakAdd, { name: 'add ignores b', find: '=> a + b', replace: '=> a' }]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /caught\s+add subtracts/);
  assert.match(r.out, /caught\s+add ignores b/);
  assert.match(r.out, /RESULT: PASS — 2 of 2 planted breaks caught/);
});

test('a break the tests do not notice is a survivor: exit 1, named', () => {
  const r = run([breakAdd, breakSub]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /SURVIVED\s+sub adds/);
  assert.match(r.out, /RESULT: FAIL — 1 of 2 planted breaks caught; 1 survived/);
});

test('a break whose text is no longer in the file is a setup error, never a pass: exit 2', () => {
  const r = run([breakAdd, { name: 'stale', find: 'a * b', replace: 'a / b' }]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /NOT APPLIED\s+stale.*occurs 0 times/);
});

test('a find text that occurs more than once is refused unless the list states the count', () => {
  const twice = { name: 'both arrows', find: '(a, b) =>', replace: '(b, a) =>' };
  const refused = run([twice]);
  assert.equal(refused.status, 2, refused.out);
  assert.match(refused.out, /NOT APPLIED\s+both arrows.*occurs 2 times/);
  const stated = run([{ ...twice, count: 2 }]);
  assert.equal(stated.status, 1, stated.out); // add is commutative and sub is untested: a survivor
  assert.match(stated.out, /SURVIVED\s+both arrows/);
});

test('a break that leaves the file unparseable proves nothing: exit 2', () => {
  const r = run([{ name: 'syntax', find: '=> a + b;', replace: '=> a + ;' }]);
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /INVALID\s+syntax/);
});

test('a suite that is already red on the untouched copy cannot judge any break: exit 2', () => {
  const r = run([breakAdd], { testSrc: TEST.replace('5));', '6));') });
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /fails before any break/);
});

test('an empty list is nothing to look at: exit 2', () => {
  const r = run([]);
  assert.equal(r.status, 2, r.out);
});

test('the working tree is never touched', () => {
  const r = run([breakAdd, breakSub]);
  assert.equal(r.lib, LIB);
});

test('--only runs one break by name; an unknown name is a usage error', () => {
  const one = run([breakAdd, breakSub], { extra: ['--only', 'add subtracts'] });
  assert.equal(one.status, 0, one.out);
  assert.match(one.out, /1 of 1 planted breaks caught/);
  const none = run([breakAdd], { extra: ['--only', 'nope'] });
  assert.equal(none.status, 2, none.out);
});
