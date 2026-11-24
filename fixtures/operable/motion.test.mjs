// operability-core's reduced-motion pass on real pages (CONTRACT.md §Invocation contract, operability-audit.mjs).
// The page is read twice, as a reader with no preference sees it and as one who asked for less
// motion does: what is visible to the first and gone for the second is content lost
// (reduced-motion-loss), and what still moves for the second was not reduced (motion-not-reduced).
//   node --test "fixtures/operable/*.test.mjs"
// Needs the pinned Chromium (npx playwright install chromium), like render.mjs itself.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { auditPage, probeClickListeners } from '../../scripts/operability-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const b = { browser: null };

before(async () => { b.browser = await chromium.launch({ args: ['--allow-file-access-from-files'] }); });
after(async () => { await b.browser?.close(); });

// `reducedMotion` is what the page is opened with: operability-audit.mjs opens with 'reduce'.
async function audit(file, { reducedMotion = 'reduce', ...opts } = {}) {
  const context = await b.browser.newContext({ viewport: { width: 720, height: 640 }, deviceScaleFactor: 1, reducedMotion });
  await context.addInitScript(probeClickListeners);
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(path.join(HERE, file)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const result = await auditPage(page, { patterns: false, contrast: false, ...opts });
    const after = await page.evaluate(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference'));
    return { ...result, after };
  } finally {
    await context.close();
  }
}
const ids = (r, rule) => r.findings.filter((f) => f.rule === rule).map((f) => f.element.match(/#[\w-]+/)?.[0]).sort();
const motion = (r) => r.findings.filter((f) => f.rule === 'reduced-motion-loss' || f.rule === 'motion-not-reduced').map((f) => `${f.level} ${f.message}`);

test('reduced-motion-loss: content that only an entrance animation makes visible is named once, at the element that vanished', async () => {
  const r = await audit('reduced-motion-loss.bad.html');
  assert.deepEqual(ids(r, 'reduced-motion-loss'), ['#hero'], JSON.stringify(motion(r)));
  const f = r.findings.find((x) => x.rule === 'reduced-motion-loss');
  assert.equal(f.level, 'ERROR');
  assert.equal(f.evidence.lost, 3, 'the section, its heading and its paragraph; the finding names the outermost');
});

test('reduced-motion-loss: a reveal that ends visible when animations are off is quiet', async () => {
  const r = await audit('reduced-motion-loss.good.html');
  assert.deepEqual(motion(r), []);
  assert.ok(r.checked.motionElements >= 4, JSON.stringify(r.checked));
});

test('motion-not-reduced: a moving animation and a moving transition that ignore the preference are named', async () => {
  const r = await audit('motion-not-reduced.bad.html');
  assert.deepEqual(ids(r, 'motion-not-reduced'), ['#drifter', '#slide'], JSON.stringify(motion(r)));
  assert.ok(r.findings.filter((f) => f.rule === 'motion-not-reduced').every((f) => f.level === 'WARN'));
  const drift = r.findings.find((f) => f.element.includes('#drifter'));
  assert.equal(drift.evidence.kind, 'animation');
  const slide = r.findings.find((f) => f.element.includes('#slide'));
  assert.equal(slide.evidence.kind, 'transition');
  assert.equal(slide.evidence.count, 2, 'two buttons share one transition: one finding, counted');
  assert.equal(drift.evidence.count, 1);
});

test('motion-not-reduced: motion that stops, a colour change, `all`, a fade and a spinner inside something busy are quiet', async () => {
  const r = await audit('motion-not-reduced.good.html');
  assert.deepEqual(motion(r), []);
});

test('the page is handed back with the preference it was opened with, either way', async () => {
  assert.equal((await audit('reduced-motion-loss.good.html', { reducedMotion: 'reduce' })).after, 'reduce');
  assert.equal((await audit('reduced-motion-loss.good.html', { reducedMotion: 'no-preference' })).after, 'no-preference');
});

test('the verdict does not depend on which preference the page was opened with', async () => {
  const r = await audit('reduced-motion-loss.bad.html', { reducedMotion: 'no-preference' });
  assert.deepEqual(ids(r, 'reduced-motion-loss'), ['#hero']);
});

test('motion: false leaves the pass out, and the result says the preference was not tried', async () => {
  const r = await audit('reduced-motion-loss.bad.html', { motion: false });
  assert.deepEqual(motion(r), []);
  assert.equal(r.checked.motionElements, 0);
  assert.ok(r.manual.some((m) => /reduced-motion preference was not tried/.test(m)), JSON.stringify(r.manual));
});
