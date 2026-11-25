// Without a browser a script must say it could not look. It must never pass, never report a
// finding, and never die with a stack trace and exit 1 (CONTRACT.md §Exit codes: 1 is a fidelity
// finding; a missing dependency is 2, an environment that cannot render is 5).
//   node --test "fixtures/harness/*.test.mjs"
// Two states are staged with a module-resolve hook passed through NODE_OPTIONS, so the children
// a script spawns inherit it: the package imports and cannot launch (no-browser/), and the package
// is not installed (no-package/). Every script in scripts/ that loads the browser package is
// enrolled by reading its source, so a new one is covered the day it lands.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, '..', '..');
const SCRIPTS = path.join(ENGINE, 'scripts');
const HOOK = { 'cannot launch': path.join(HERE, 'no-browser', 'register.mjs'), 'not installed': path.join(HERE, 'no-package', 'register.mjs') };

// How to make each script reach for the browser. `golden` is a throwaway copy of the golden capture.
const INVOKE = {
  'render.mjs': (golden) => ['--lock', path.join(golden, 'design-lock.json'), '--screen', 'home'],
  'operability-audit.mjs': (golden) => ['--lock', path.join(golden, 'design-lock.json'), '--screen', 'home'],
  'motion.mjs': () => ['check', '--lock', path.join(ENGINE, 'fixtures', 'motion', 'design-lock.json'), '--id', 'continuity-jump'],
};
// Loads the browser package only on a path this test cannot reach, each with the reason.
const NOT_DRIVEN = {
  'eval-correction.mjs': 'opens a browser only to screenshot a model\'s output, after a model call this suite does not make',
};

const loadsBrowser = readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs')
  && /(?:from\s+|import\(\s*)['"]playwright['"]/.test(readFileSync(path.join(SCRIPTS, f), 'utf8'))).sort();

function run(script, state, args) {
  const env = { ...process.env, NODE_OPTIONS: `--import ${pathToFileURL(HOOK[state]).href}` };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: 'utf8', env, timeout: 120000 });
  return { status: r.status, signal: r.signal, out: r.stdout + r.stderr };
}
function withGolden(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'no-browser-'));
  try { cpSync(path.join(ENGINE, 'fixtures', 'golden'), dir, { recursive: true }); return fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test('every script that loads the browser package is either driven here or excused with a reason', () => {
  assert.ok(loadsBrowser.length >= 3, `found only ${loadsBrowser.join(', ') || 'none'}: the pattern that finds them is wrong`);
  const unknown = loadsBrowser.filter((f) => !(f in INVOKE) && !(f in NOT_DRIVEN));
  assert.deepEqual(unknown, [], `add an invocation (INVOKE) or a reason (NOT_DRIVEN) for: ${unknown.join(', ')}`);
  for (const f of [...Object.keys(INVOKE), ...Object.keys(NOT_DRIVEN)]) assert.ok(loadsBrowser.includes(f), `${f} is listed here and no longer loads the browser package`);
});

test('the stand-ins do what they say: the package imports and cannot launch, or does not resolve', () => {
  const probe = 'const { chromium } = await import("playwright"); try { await chromium.launch(); console.log("LAUNCHED"); } catch (e) { console.log("NO LAUNCH"); }';
  const env = (state) => ({ ...process.env, NODE_OPTIONS: `--import ${pathToFileURL(HOOK[state]).href}` });
  const a = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', env: env('cannot launch'), cwd: ENGINE });
  assert.match(a.stdout, /NO LAUNCH/, a.stderr);
  const b = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', env: env('not installed'), cwd: ENGINE });
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /ERR_MODULE_NOT_FOUND|Cannot find package/);
});

for (const script of Object.keys(INVOKE)) {
  for (const state of Object.keys(HOOK)) {
    test(`${script}, browser ${state}: exits 2 or 5 and says where to look, with no verdict and no stack trace`, () => {
      const r = withGolden((golden) => run(script, state, INVOKE[script](golden)));
      assert.equal(r.signal, null, r.out);
      assert.ok(r.status === 2 || r.status === 5, `exit ${r.status}: ${r.out.slice(-400)}`);
      assert.match(r.out, /setup-check/, 'the message names the script that prints the fix');
      assert.doesNotMatch(r.out, /^\s+at .+\(.+:\d+:\d+\)$/m, `a stack trace is not a message: ${r.out.slice(-400)}`);
      assert.doesNotMatch(r.out, /\bPASS\b/);
    });
  }
  test(`${script}, browser not installed: a missing dependency is exit 2`, () => {
    const r = withGolden((golden) => run(script, 'not installed', INVOKE[script](golden)));
    assert.equal(r.status, 2, r.out.slice(-400));
  });
}

test('verify with a browser that cannot launch: not green, and the verdict it stores is not a pass', () => {
  withGolden((golden) => {
    const lock = path.join(golden, 'design-lock.json');
    const r = run('verify.mjs', 'cannot launch', ['--lock', lock]);
    assert.ok(r.status === 2 || r.status === 5, `exit ${r.status}: ${r.out.slice(-400)}`);
    const check = spawnSync(process.execPath, [path.join(SCRIPTS, 'verify.mjs'), '--lock', lock, '--check'], { encoding: 'utf8' });
    assert.notEqual(check.status, 0, check.stdout);
    assert.doesNotMatch(check.stdout, /^FRESH/m);
  });
});
