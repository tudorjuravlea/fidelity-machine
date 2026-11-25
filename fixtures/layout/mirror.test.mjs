// The mirrored render: a screen whose lock lists a right-to-left locale is laid out a second time
// with dir="rtl", and what leaves the frame or is cut ONLY when mirrored is a finding
// (rtl-overflow). render.mjs runs auditMirror in the page after the layout audit and adds its
// findings to the same dump; layout-audit.mjs judges them like any other.
//   node --test "fixtures/layout/*.test.mjs"

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { auditMirror, mirrorLocale } from '../../scripts/layout-audit-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '..', '..', 'scripts');
const ctx = { browser: null, page: null };

before(async () => {
  ctx.browser = await chromium.launch();
  ctx.page = await ctx.browser.newPage({ viewport: { width: 720, height: 640 } });
});
after(async () => { await ctx.browser?.close(); });

async function mirror(file) {
  await ctx.page.goto(pathToFileURL(path.join(HERE, file)).href, { waitUntil: 'load' });
  await ctx.page.evaluate(() => document.fonts.ready);
  return ctx.page.evaluate(auditMirror, { locale: 'ar' });
}
const hits = (r) => r.findings.filter((f) => f.rule === 'rtl-overflow');

test('mirrorLocale: the first right-to-left locale in the list, by language or by script', () => {
  assert.equal(mirrorLocale(['ro', 'en']), null);
  assert.equal(mirrorLocale(['en', 'ar']), 'ar');
  assert.equal(mirrorLocale(['he-IL', 'ar']), 'he-IL');
  assert.equal(mirrorLocale(['en', 'fa_IR']), 'fa_IR');
  assert.equal(mirrorLocale(['ks-Arab-IN']), 'ks-Arab-IN', 'a script subtag decides when the language does not');
  assert.equal(mirrorLocale(['az-Latn', 'far', 'arn']), null, 'a longer language code that starts the same is another language');
  assert.equal(mirrorLocale(undefined), null);
  assert.equal(mirrorLocale([]), null);
});

test('a box that leaves the frame only when mirrored is an ERROR, named, with the pixels lost', async () => {
  const r = await mirror('rtl-overflow.bad.html');
  assert.equal(hits(r).length, 1, JSON.stringify(r.findings));
  const f = hits(r)[0];
  assert.equal(f.level, 'ERROR');
  assert.match(f.message, /button#go/);
  assert.match(f.message, /button#go[^,]* 80px/, 'the card is 640 wide with a 160 margin in a 720 frame: 80 px leave it');
  assert.match(f.message, /a#far[^,]* 120px/, 'pushed 900 px away, the link loses all of its 120 px and no more');
  assert.match(f.message, /^rtl-overflow: 3 element\(s\) lose up to 120px/, 'the worst loss leads');
  assert.equal(f.element.startsWith('a#far'), true);
  assert.equal(f.evidence.elements.length, 3, 'the link, the paragraph and the button');
  assert.deepEqual(f.evidence.elements.map((e) => e.lostBeforePx), [0, 0, 0]);
  assert.equal(f.evidence.locale, 'ar');
  assert.ok(r.checked.mirrored >= 2);
});

test('quiet: logical properties, a drawer off the frame both ways, boxes that scroll sideways, what is not shown, what is opted out', async () => {
  const r = await mirror('rtl-overflow.good.html');
  assert.deepEqual(hits(r), [], JSON.stringify(r.findings));
  assert.ok(r.checked.mirrored >= 2, 'quiet because it measured, not because it found nothing to measure');
});

test('words cut inside a box are found even when the page hides its own sideways overflow', async () => {
  const r = await mirror('rtl-overflow.clipped.html');
  assert.equal(hits(r).length, 1, JSON.stringify(r.findings));
  assert.match(hits(r)[0].message, /p#value/);
  assert.match(hits(r)[0].message, /80 ?px/);
});

test('a mirrored layout that arrives through a transition is measured where it ends', async () => {
  const r = await mirror('rtl-overflow.transition.html');
  assert.equal(hits(r).length, 1, JSON.stringify(r));
  assert.match(hits(r)[0].message, /button#go[^,]* 84px/);
});

test('an element that is moving by itself is not mirrored and is said so: its two measurements differ for another reason', async () => {
  for (let round = 0; round < 3; round++) {
    const r = await mirror('rtl-overflow.moving.html');
    assert.deepEqual(hits(r), [], JSON.stringify(r.findings));
    assert.equal(r.checked.mirrored, 1, 'the still paragraph only');
    assert.match(r.manual.join(' '), /1 element\(s\) were moving/);
  }
});

test('the page is put back as it was', async () => {
  await mirror('rtl-overflow.bad.html');
  const after_ = await ctx.page.evaluate(() => ({ dir: document.documentElement.getAttribute('dir'), left: document.getElementById('go').getBoundingClientRect().left }));
  assert.equal(after_.dir, null);
  assert.equal(after_.left, 0);
});

test('a body that states its own direction is not reached by the flip: nothing is mirrored, and that is said', async () => {
  const r = await mirror('rtl-overflow.bodydir.html');
  assert.deepEqual(r.findings, []);
  assert.equal(r.checked.mirrored, 0);
  assert.match(r.manual.join(' '), /did not reach the page/);
});

test('a page written right to left is not flipped: the layout audit already measured it mirrored', async () => {
  const r = await mirror('rtl-overflow.authored.html');
  assert.deepEqual(r.findings, []);
  assert.equal(r.checked.mirrored, 0);
  assert.match(r.manual.join(' '), /already right to left/);
});

// ---------------------------------------------------------------- through render.mjs and the gate

// The renderer waits for the page to say it is ready; the fixtures are plain pages, so the copy says it.
const stage = (file, dir) => writeFileSync(path.join(dir, 'home.html'), readFileSync(path.join(HERE, file), 'utf8').replace('<body>', '<body data-render-ready>'));

function gate(locales, file = 'rtl-overflow.bad.html') {
  const dir = mkdtempSync(path.join(tmpdir(), 'mirror-'));
  try {
    stage(file, dir);
    const screen = { id: 'home', mode: 'B2', url: 'home.html', captureWidth: 720, captureHeight: 640, dpr: 1, colorScheme: 'light' };
    if (locales) screen.locales = locales;
    const lock = path.join(dir, 'design-lock.json');
    writeFileSync(lock, JSON.stringify({ name: 'fixture', screens: [screen] }));
    const render = spawnSync(process.execPath, [path.join(SCRIPTS, 'render.mjs'), '--lock', lock, '--screen', 'home'], { encoding: 'utf8' });
    assert.equal(render.status, 0, render.stdout + render.stderr);
    const judged = spawnSync(process.execPath, [path.join(SCRIPTS, 'layout-audit.mjs'), '--lock', lock], { encoding: 'utf8' });
    return { status: judged.status, out: judged.stdout + judged.stderr, dump: JSON.parse(readFileSync(path.join(dir, '.render', 'home.layout.json'), 'utf8')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a screen whose lock lists a right-to-left locale fails the layout gate on what the flip adds', () => {
  const r = gate(['en', 'ar']);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ERROR rtl-overflow/);
  assert.ok(r.dump.checked.mirrored >= 2);
  assert.match(r.dump.manual.join(' '), /Mirroring was measured by setting dir="rtl"/, 'what the mirrored render cannot see travels with the dump');
});

test('a screen that lists none is not mirrored, and the dump says nothing was', () => {
  const r = gate(['en', 'ro']);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.dump.checked.mirrored, undefined);
  assert.doesNotMatch(r.out, /rtl-overflow/);
});

test('with no locales on the screen, the lock\'s content.locales decide', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mirror-'));
  try {
    stage('rtl-overflow.bad.html', dir);
    const lock = path.join(dir, 'design-lock.json');
    writeFileSync(lock, JSON.stringify({ name: 'fixture', content: { locales: ['en', 'he'] }, screens: [{ id: 'home', mode: 'B2', url: 'home.html', captureWidth: 720, captureHeight: 640, dpr: 1, colorScheme: 'light' }] }));
    assert.equal(spawnSync(process.execPath, [path.join(SCRIPTS, 'render.mjs'), '--lock', lock, '--screen', 'home'], { encoding: 'utf8' }).status, 0);
    const judged = spawnSync(process.execPath, [path.join(SCRIPTS, 'layout-audit.mjs'), '--lock', lock], { encoding: 'utf8' });
    assert.equal(judged.status, 1, judged.stdout);
    assert.match(judged.stdout, /rtl-overflow/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
