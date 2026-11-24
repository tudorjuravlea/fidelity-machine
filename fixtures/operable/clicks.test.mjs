// operability-core's click pass on real pages (CONTRACT.md §Invocation contract, operability-audit.mjs).
// A control that declares a two-state attribute is clicked: the state must change (dead-state) and
// the page must look different afterwards (invisible-state). In its own file so the planted-break
// list beside it runs in seconds: fixtures/operable/clicks.mutations.mjs.
//   node --test "fixtures/operable/*.test.mjs"
// Needs the pinned Chromium (npx playwright install chromium), like render.mjs itself.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { auditPage, probeClickListeners } from '../../scripts/operability-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const b = { browser: null, context: null };

before(async () => {
  b.browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  b.context = await b.browser.newContext({ viewport: { width: 720, height: 640 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await b.context.addInitScript(probeClickListeners);
});
after(async () => { await b.browser?.close(); });

// The key pass stays off: these pages pin what a click does, and the two passes are separate switches.
async function audit(file, opts = {}) {
  const page = await b.context.newPage();
  try {
    await page.goto(pathToFileURL(path.join(HERE, file)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return await auditPage(page, { patterns: false, ...opts });
  } finally {
    await page.close();
  }
}
const of = (r, rule) => r.findings.filter((f) => f.rule === rule);
const lines = (r) => r.findings.map((f) => `${f.level} ${f.message}`);

const ids = (r, rule) => of(r, rule).map((f) => f.element.match(/#[\w-]+/)?.[0]).sort();

test('dead-state: every control that declares a state and keeps it on a click is named', async () => {
  const r = await audit('dead-state.bad.html', { clicks: true });
  assert.deepEqual(ids(r, 'dead-state'), ['#more', '#star', '#sw', '#t2'], JSON.stringify(lines(r)));
  assert.ok(of(r, 'dead-state').every((f) => f.level === 'ERROR'));
  assert.equal(r.checked.clicks, 4, 'the selected tab is not clicked: pressing it changes nothing by design');
  const star = of(r, 'dead-state').find((f) => f.element.includes('#star'));
  assert.deepEqual(star.evidence, { attr: 'aria-pressed', before: 'false' });
});

test('dead-state: live controls are quiet, and what is not a live two-state toggle is not clicked', async () => {
  const r = await audit('dead-state.good.html', { clicks: true });
  assert.deepEqual(lines(r), []);
  assert.equal(r.checked.clicks, 4, 'mixed, disabled, a real link, a native checkbox and an ignored picture are left alone');
});

test('past the limit the rest are not clicked, and the run says how many', async () => {
  const r = await audit('dead-state.bad.html', { clicks: true, maxClicks: 2 });
  assert.equal(r.checked.clicks, 2);
  assert.ok(r.deferred.some((d) => /3 control\(s\) that declare a state were not clicked: the limit is 2/.test(d)), JSON.stringify(r.deferred));
});

test('the click pass is off unless asked for, and the result says what was not judged', async () => {
  const r = await audit('dead-state.bad.html');
  assert.deepEqual(of(r, 'dead-state'), []);
  assert.equal(r.checked.clicks, 0);
  assert.ok(r.manual.some((m) => /no control was clicked/.test(m)), JSON.stringify(r.manual));
});

test('the click pass puts every toggle back where it found it', async () => {
  const page = await b.context.newPage();
  try {
    await page.goto(pathToFileURL(path.join(HERE, 'dead-state.good.html')).href, { waitUntil: 'load' });
    const read = () => page.evaluate(() => ['star', 'sw', 'more'].map((id) => { const el = document.getElementById(id); return el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked') ?? el.getAttribute('aria-expanded'); }).join(','));
    const before = await read();
    await auditPage(page, { patterns: false, clicks: true });
    assert.equal(await read(), before);
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-operable-n]').length), 0, 'the markers are removed');
  } finally {
    await page.close();
  }
});

test('invisible-state: a state that changes while the page looks the same is named, with the pixels counted', async () => {
  const r = await audit('invisible-state.bad.html', { clicks: true });
  assert.deepEqual(ids(r, 'invisible-state'), ['#mode', '#sync'], JSON.stringify(lines(r)));
  const mode = of(r, 'invisible-state').find((f) => f.element.includes('#mode'));
  assert.equal(mode.level, 'ERROR');
  assert.equal(mode.evidence.attr, 'aria-pressed');
  assert.ok(mode.evidence.changed < mode.evidence.needed, JSON.stringify(mode.evidence));
  assert.deepEqual(of(r, 'dead-state'), []);
});

test('invisible-state: a restyled toggle, and a button whose panel appears, are quiet', async () => {
  const r = await audit('invisible-state.good.html', { clicks: true });
  assert.deepEqual(lines(r), []);
  assert.equal(r.checked.clicks, 3);
});

test('a control something else lies over is not clicked: deferred, never counted, never a finding', async () => {
  const r = await audit('click-covered.html', { clicks: true });
  assert.deepEqual([...of(r, 'dead-state'), ...of(r, 'invisible-state')], []);
  assert.equal(r.checked.clicks, 0);
  assert.ok(r.deferred.some((d) => /#mode.*could not be clicked/.test(d)), JSON.stringify(r.deferred));
});

test('a page that repaints by itself: a dead control is still dead, and a new state that cannot be seen apart from the noise is deferred', async () => {
  const r = await audit('click-ticking.html', { clicks: true });
  assert.deepEqual(ids(r, 'dead-state'), ['#dead'], JSON.stringify(lines(r)));
  assert.deepEqual(of(r, 'invisible-state'), []);
  assert.ok(r.deferred.some((d) => /#quiet.*changing by itself/.test(d)), JSON.stringify(r.deferred));
});
