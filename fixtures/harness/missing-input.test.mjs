// A script pointed at a lock or a screen that is not there must say it could not look: exit 2 and
// the name of what is missing (CONTRACT.md §Exit codes). Not 1, which is a finding; not 0.
//   node --test "fixtures/harness/*.test.mjs"
// Every script in scripts/ that mentions a --lock flag is enrolled by reading its source: it is
// either driven here or excused with a reason, so a new one cannot land without a case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.join(HERE, '..', '..');
const SCRIPTS = path.join(ENGINE, 'scripts');
const MISSING = path.join(tmpdir(), 'no-such-capture-9f3a', 'design-lock.json');

// The arguments around the lock. `lock` is the path under test; a script not listed takes --lock alone.
const INVOKE = {
  'render.mjs': (lock) => ['--lock', lock, '--screen', 'home'],
  'probe-blind-spots.mjs': (lock) => ['--lock', lock, '--screen', 'home'],
  'motion.mjs': (lock) => ['check', '--lock', lock, '--id', 'any'],
  'ui-sdk.mjs': (lock) => ['link', '--lock', lock],
  'capture-figma.mjs': (lock) => ['--derive', '--lock', lock],
  'eval-correction.mjs': (lock) => ['--tasks', path.join(path.dirname(lock), 'tasks.json'), '--lock', lock, '--model', 'none'],
};
const EXCUSED = {
  'setup-check.mjs': 'accepts --lock so every script can be called the same way, and never reads it',
  'lint-negatives.mjs': 'names --lock only to say it takes a manifest instead; it rejects the flag',
};
// Scripts that take --screen: an unknown id is a usage error that names the id.
const SCREEN_ARGS = {
  'render.mjs': (lock) => ['--lock', lock, '--screen', 'no-such-screen'],
  'probe-blind-spots.mjs': (lock) => ['--lock', lock, '--screen', 'no-such-screen'],
};

const sourceOf = (f) => readFileSync(path.join(SCRIPTS, f), 'utf8');
const takesLock = readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs') && /['"]--lock['"]/.test(sourceOf(f))).sort();
const takesScreen = takesLock.filter((f) => /['"]--screen['"]/.test(sourceOf(f)) && !(f in EXCUSED));

// A PATH whose `claude` records that it was called: no test here may reach a model.
function quietEnv(dir) {
  writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\necho called >> "${path.join(dir, 'claude.calls')}"\nexit 1\n`);
  chmodSync(path.join(dir, 'claude'), 0o755);
  const env = { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` };
  delete env.NODE_TEST_CONTEXT;
  return env;
}
function run(script, args) {
  const dir = mkdtempSync(path.join(tmpdir(), 'missing-input-'));
  try {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: 'utf8', env: quietEnv(dir), timeout: 120000 });
    return { status: r.status, signal: r.signal, out: r.stdout + r.stderr, modelCalled: existsSync(path.join(dir, 'claude.calls')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('every script that mentions --lock is either driven here or excused with a reason', () => {
  assert.ok(takesLock.length >= 10, `found only ${takesLock.length}: the pattern that finds them is wrong`);
  for (const f of [...Object.keys(INVOKE), ...Object.keys(EXCUSED), ...Object.keys(SCREEN_ARGS)]) assert.ok(takesLock.includes(f), `${f} is listed here and no longer mentions --lock`);
  assert.ok(takesScreen.length >= 6, `found only ${takesScreen.length} that take --screen`);
});

for (const script of takesLock.filter((f) => !(f in EXCUSED))) {
  test(`${script}: a lock that is not there is exit 2, named, with no stack trace and no model call`, () => {
    const r = run(script, (INVOKE[script] ?? ((lock) => ['--lock', lock]))(MISSING));
    assert.equal(r.signal, null, r.out.slice(-300));
    assert.equal(r.status, 2, `exit ${r.status}: ${r.out.slice(-400)}`);
    assert.ok(r.out.includes(path.dirname(MISSING)), `the message does not name the missing path: ${r.out.slice(-400)}`);
    assert.doesNotMatch(r.out, /^\s+at .+\(.+:\d+:\d+\)$/m, `a stack trace is not a message: ${r.out.slice(-400)}`);
    assert.equal(r.modelCalled, false, 'a model was called before the inputs were checked');
  });
}

for (const script of takesScreen) {
  test(`${script}: a screen that is not in the lock is exit 2 and names the id`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'missing-screen-'));
    try {
      cpSync(path.join(ENGINE, 'fixtures', 'golden'), dir, { recursive: true });
      const lock = path.join(dir, 'design-lock.json');
      const r = run(script, (SCREEN_ARGS[script] ?? ((l) => ['--lock', l, '--screen', 'no-such-screen']))(lock));
      assert.equal(r.status, 2, `exit ${r.status}: ${r.out.slice(-400)}`);
      assert.match(r.out, /no-such-screen/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
