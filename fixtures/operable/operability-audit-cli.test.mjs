// operability-audit.mjs: the command that renders a lock screen and audits it (CONTRACT.md
// §Invocation contract, §Exit codes). Each case runs the real CLI, with the pinned Chromium, on a
// throwaway lock in os.tmpdir() whose screens point at the fixture pages beside this file.
//   node --test "fixtures/operable/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', '..', 'scripts', 'operability-audit.mjs');
const fixture = (name) => pathToFileURL(path.join(HERE, name)).href;
const screen = (id, url) => ({ id, mode: 'B2', url, captureWidth: 720, captureHeight: 640, dpr: 1, colorScheme: 'light' });

function run(screens, extra = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'operability-audit-'));
  const lockPath = path.join(dir, 'design-lock.json');
  writeFileSync(lockPath, JSON.stringify({ name: 'fixture', screens }));
  const r = spawnSync(process.execPath, [CLI, '--lock', lockPath, ...extra], { encoding: 'utf8' });
  const reports = {};
  for (const s of screens) {
    const p = path.join(dir, '.report', `${s.id}.operable.json`);
    reports[s.id] = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  }
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, reports };
}

test('a clean page passes: exit 0, status pass, a report with what was checked and what was not judged', () => {
  const r = run([screen('home', fixture('unnamed-control.good.html'))]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.reports.home.status, 'pass');
  assert.equal(r.reports.home.gate, 'operable');
  assert.equal(r.reports.home.checked.controls, 2);
  assert.ok(r.reports.home.manual.length > 0);
  assert.match(r.stdout, /operable home: PASS/);
});

test('an ERROR finding fails: exit 1 and the finding line on stdout', () => {
  const r = run([screen('home', fixture('focus-not-visible.bad.html'))]);
  assert.equal(r.status, 1);
  assert.equal(r.reports.home.status, 'fail');
  assert.match(r.stdout, /ERROR focus-not-visible: button "Save"/);
});

test('WARN findings alone pass with the warnings listed, and --strict turns them into exit 1', () => {
  const page = [screen('home', fixture('warn-only.html'))];
  const r = run(page);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.reports.home.status, 'pass');
  assert.match(r.stdout, /WARN {2}broken-reference/);
  const strict = run(page, ['--strict']);
  assert.equal(strict.status, 1);
  assert.equal(strict.reports.home.status, 'fail');
});

test('a page with nothing to operate is inconclusive: exit 6, never a pass, the reason named', () => {
  const r = run([screen('home', fixture('no-controls.html'))]);
  assert.equal(r.status, 6, r.stderr);
  assert.equal(r.reports.home.status, 'inconclusive');
  assert.match(r.stdout, /INCONCLUSIVE/);
  assert.match(r.stdout, /nothing to operate/);
});

test('a Tab walk cut by --max-stops is inconclusive, and a real finding beats it', () => {
  const cut = run([screen('home', fixture('focus-not-visible.good.html'))], ['--max-stops', '1']);
  assert.equal(cut.status, 6, cut.stdout + cut.stderr);
  assert.equal(cut.reports.home.deferred.length, 1);
  const both = run([screen('home', fixture('unnamed-control.bad.html'))], ['--max-stops', '1']);
  assert.equal(both.status, 1);
  assert.equal(both.reports.home.status, 'fail');
});

test('across screens a finding beats inconclusive: one failing screen and one empty screen exit 1', () => {
  const r = run([screen('empty', fixture('no-controls.html')), screen('bad', fixture('missing-state.bad.html'))]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.equal(r.reports.empty.status, 'inconclusive');
  assert.equal(r.reports.bad.status, 'fail');
});

test('a listener added by script is seen from the command line too (the probe is installed before the page loads)', () => {
  const r = run([screen('home', fixture('click-without-keyboard.bad.html'))]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ERROR click-without-keyboard: div#js\.card "Transfer money"/);
});

test('several screens: each gets its report, one failure fails the run, --screen narrows it', () => {
  const screens = [screen('ok', fixture('unnamed-control.good.html')), screen('bad', fixture('missing-state.bad.html'))];
  const all = run(screens);
  assert.equal(all.status, 1);
  assert.equal(all.reports.ok.status, 'pass');
  assert.equal(all.reports.bad.status, 'fail');
  const one = run(screens, ['--screen', 'ok']);
  assert.equal(one.status, 0, one.stderr);
  assert.equal(one.reports.bad, null);
});

test('the pattern pass runs by default and names what the borrowed checker found; --no-patterns leaves it out', () => {
  const page = [screen('home', fixture('pattern-tabs.bad.html'))];
  const on = run(page);
  assert.equal(on.status, 1, on.stdout + on.stderr);
  assert.match(on.stdout, /ERROR pattern-tabs: div\[role=tablist\] has 3 tab stops/);
  assert.match(on.stdout, /1 widget\(s\) driven/);
  assert.equal(on.reports.home.checked.patterns, 1);
  const off = run(page, ['--no-patterns']);
  assert.equal(off.status, 0, off.stdout + off.stderr);
  assert.equal(off.reports.home.checked.patterns, 0);
  assert.equal(off.reports.home.patterns, false);
});

test('the vendored runtime around our own markup passes from the command line, loaded from the lock\'s own tree', () => {
  const r = run([screen('home', fixture('behavior-kit.html'))]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.reports.home.checked.patterns >= 3);
});

test('a relative url resolves against the lock, and its ?query reaches the page', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'operability-audit-'));
  writeFileSync(path.join(dir, 'page.html'),
    '<!DOCTYPE html><html lang="en" data-render-ready><body><button id="b"></button><script>document.getElementById("b").textContent = new URLSearchParams(location.search).get("label") || "";</script></body></html>');
  writeFileSync(path.join(dir, 'design-lock.json'), JSON.stringify({ name: 'fixture', screens: [screen('home', 'page.html?label=Save')] }));
  const r = spawnSync(process.execPath, [CLI, '--lock', path.join(dir, 'design-lock.json')], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('a page that cannot load is a render failure (exit 5), not a finding', () => {
  const r = run([screen('home', fixture('does-not-exist.html'))]);
  assert.equal(r.status, 5);
  assert.match(r.stderr, /exit 5/);
  assert.equal(r.reports.home, null);
});

test('a page that never sets data-render-ready is a render timeout (exit 5) naming the contract', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'operability-audit-'));
  writeFileSync(path.join(dir, 'page.html'), '<!DOCTYPE html><html lang="en"><body><button>Save</button></body></html>');
  writeFileSync(path.join(dir, 'design-lock.json'), JSON.stringify({ name: 'fixture', screens: [screen('home', 'page.html')] }));
  const r = spawnSync(process.execPath, [CLI, '--lock', path.join(dir, 'design-lock.json'), '--ready-timeout', '400'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 5);
  assert.match(r.stderr, /data-render-ready/);
});

test('usage errors are exit 2: no lock, an unknown flag, an unknown screen, a screen missing a field', () => {
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
  assert.equal(run([screen('home', fixture('no-controls.html'))], ['--bogus']).status, 2);
  assert.equal(run([screen('home', fixture('no-controls.html'))], ['--screen', 'nope']).status, 2);
  const noWidth = { ...screen('home', fixture('no-controls.html')), captureWidth: undefined };
  const r = run([noWidth]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /captureWidth/);
});

test('--help answers', () => {
  const r = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--lock/);
});

// The audit as a ship gate: a lock screen opts in with `operable: true` and verify.mjs runs it.
const ENGINE = path.join(HERE, '..', '..');
function goldenCopy(edit) {
  const dir = mkdtempSync(path.join(tmpdir(), 'operable-gate-'));
  cpSync(path.join(ENGINE, 'fixtures', 'golden'), dir, { recursive: true });
  const lockPath = path.join(dir, 'design-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  edit(lock);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  return { dir, lockPath };
}

test('the lock schema takes screens[].operable as a boolean and nothing else', () => {
  const guard = (value) => {
    const { dir, lockPath } = goldenCopy((lock) => { lock.screens[0].operable = value; });
    const r = spawnSync(process.execPath, [path.join(ENGINE, 'scripts', 'contract-guard.mjs'), '--lock', lockPath], { encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
    return r;
  };
  const ok = guard(true);
  assert.equal(ok.status, 0, ok.stdout.slice(-800));
  const bad = guard('yes');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /schema-validity/);
});

test('verify runs the real audit on a screen that declares operable, and reports the gate with its report file', () => {
  // The golden lock asks for a font only macOS has, and render.mjs refuses to draw a fallback (exit
  // 4), which would skip every later gate on another platform. So the other gates are stubs here
  // (verify's test seam) and only the audit is the real script: it needs no host font.
  const { dir, lockPath } = goldenCopy((lock) => { lock.screens[0].operable = true; });
  const stubs = path.join(dir, 'stubs');
  mkdirSync(stubs);
  for (const gate of ['adherence-lint.mjs', 'render.mjs', 'geometry.mjs', 'layout-audit.mjs', 'diff.mjs', 'colour-census.mjs']) {
    writeFileSync(path.join(stubs, gate), 'process.exit(0);\n');
  }
  writeFileSync(path.join(stubs, 'operability-audit.mjs'),
    `import { spawnSync } from 'node:child_process';\nconst r = spawnSync(process.execPath, [${JSON.stringify(CLI)}, ...process.argv.slice(2)], { stdio: 'inherit' });\nprocess.exit(r.status ?? 2);\n`);
  const r = spawnSync(process.execPath, [path.join(ENGINE, 'scripts', 'verify.mjs'), '--lock', lockPath], { encoding: 'utf8', env: { ...process.env, VERIFY_SCRIPTS_DIR: stubs } });
  const report = JSON.parse(readFileSync(path.join(dir, '.report', 'verify-report.json'), 'utf8'));
  const gate = report.screens.home.gates.operable;
  const own = JSON.parse(readFileSync(path.join(dir, '.report', 'home.operable.json'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(gate.status, 'pass', r.stdout + r.stderr);
  assert.equal(gate.report, '.report/home.operable.json');
  assert.equal(own.status, 'pass');
  assert.equal(own.checked.controls, 1, 'the report is the real audit\'s, of the real golden screen');
  assert.match(r.stdout, /layout=ok operable=ok diff=ok/);
});
