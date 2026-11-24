// layout-audit-core: the in-page self-consistency audit render.mjs runs and layout-audit.mjs judges
// (CONTRACT.md §Invocation contract). One bad/good page per rule: the rule fires on bad, stays
// quiet on good, and the whole catalogue stays quiet on the golden screen.
//   node --test "fixtures/layout/*.test.mjs"
// Needs the pinned Chromium (npx playwright install chromium), like render.mjs itself.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { auditLayout } from '../../scripts/layout-audit-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const page_ = { browser: null, page: null };

before(async () => {
  page_.browser = await chromium.launch();
  page_.page = await page_.browser.newPage({ viewport: { width: 720, height: 640 } });
});
after(async () => { await page_.browser?.close(); });

async function audit(file, opts = {}) {
  await page_.page.goto(pathToFileURL(path.join(HERE, file)).href, { waitUntil: 'load' });
  await page_.page.evaluate(() => document.fonts.ready);
  return page_.page.evaluate(auditLayout, opts);
}
const rulesOf = (r) => r.findings.map((f) => f.rule);

const RULES = ['control-box-fit', 'control-edge-inset', 'container-bottom-inset', 'text-inset', 'small-text',
  'unit-wrapped', 'fat-row', 'empty-pane', 'mixed-icons', 'emoji-icon', 'text-clipped', 'control-overlap', 'colour-unbound'];

for (const rule of RULES) {
  test(`${rule}: fires on the bad page, named with the element and a measured number`, async () => {
    const r = await audit(`${rule}.bad.html`);
    const hits = r.findings.filter((f) => f.rule === rule);
    assert.ok(hits.length >= 1, `expected ${rule}, got ${JSON.stringify(rulesOf(r))}`);
    assert.match(hits[0].message, /\d/, 'a finding carries a measured number');
    assert.ok(hits[0].element, 'a finding names its element');
    assert.ok(['ERROR', 'WARN'].includes(hits[0].level));
  });
  test(`${rule}: quiet on the good page`, async () => {
    const r = await audit(`${rule}.good.html`);
    assert.deepEqual(r.findings.filter((f) => f.rule === rule), [], JSON.stringify(r.findings));
  });
}

test('levels: box fit and bottom inset are ERROR, the rest WARN', async () => {
  const fit = await audit('control-box-fit.bad.html');
  assert.equal(fit.findings.find((f) => f.rule === 'control-box-fit').level, 'ERROR');
  const inset = await audit('container-bottom-inset.bad.html');
  assert.equal(inset.findings.find((f) => f.rule === 'container-bottom-inset').level, 'ERROR');
  const small = await audit('small-text.bad.html');
  assert.equal(small.findings.find((f) => f.rule === 'small-text').level, 'WARN');
});

test('text-clipped: both directions are found, each with the pixels cut and the element that cuts', async () => {
  const r = await audit('text-clipped.bad.html');
  const hits = r.findings.filter((f) => f.rule === 'text-clipped');
  assert.equal(hits.length, 2, JSON.stringify(hits));
  const x = hits.find((f) => f.element.includes('#cut-x'));
  const y = hits.find((f) => f.element.includes('#cut-y'));
  assert.ok(x && x.evidence.axis === 'x' && x.evidence.hidden > 20, JSON.stringify(x));
  assert.ok(y && y.evidence.axis === 'y' && y.evidence.hidden >= 20, JSON.stringify(y));
  assert.ok(r.checked.textLeaves >= 2);
});

test('text-clipped: a box whose words are moving is deferred, not judged', async () => {
  const r = await audit('text-clipped.animating.html');
  assert.deepEqual(r.findings.filter((f) => f.rule === 'text-clipped'), []);
  assert.ok(r.deferred.some((d) => d.includes('clipping text box')), JSON.stringify(r.deferred));
});

test('control-overlap: one finding for the pair, with the share of the smaller control that is covered', async () => {
  const r = await audit('control-overlap.bad.html');
  const hits = r.findings.filter((f) => f.rule === 'control-overlap');
  assert.equal(hits.length, 1, JSON.stringify(hits));
  // 70 of the 80px button lie under the 120px one: 0.875 of the smaller, 0.58 of the larger.
  assert.ok(hits[0].evidence.share > 0.85 && hits[0].evidence.share < 0.9, JSON.stringify(hits[0].evidence));
  assert.ok(hits[0].element.includes('#b') && hits[0].evidence.other.includes('#a'), JSON.stringify(hits[0]));
  assert.ok(r.checked.interactive >= 2);
});

test('levels: clipped text and overlapping controls are warnings until a screen declares otherwise', async () => {
  const clip = await audit('text-clipped.bad.html');
  assert.equal(clip.findings.find((f) => f.rule === 'text-clipped').level, 'WARN');
  const over = await audit('control-overlap.bad.html');
  assert.equal(over.findings.find((f) => f.rule === 'control-overlap').level, 'WARN');
});

test('colour-unbound: every route to a raw colour is found, one finding per colour with its count', async () => {
  const r = await audit('colour-unbound.bad.html');
  const hits = r.findings.filter((f) => f.rule === 'colour-unbound');
  const seen = hits.map((f) => `${f.evidence.kind} ${f.evidence.value}`).sort();
  assert.deepEqual(seen, [
    'background oklch(0.4 0.1 150)',
    'border rgb(204, 0, 0)',
    'fill rgb(255, 99, 71)',
    'shadow rgba(0, 0, 0, 0.5) 0px 2px 6px 0px',
    'text rgb(0, 0, 128)',
    'text rgb(10, 20, 30)',
  ], JSON.stringify(hits.map((f) => f.evidence)));
  const navy = hits.find((f) => f.evidence.value === 'rgb(0, 0, 128)');
  assert.equal(navy.evidence.count, 2, 'two paragraphs share the keyword');
  assert.ok(navy.element.includes('#keyword'), 'the finding names the first element');
  assert.ok(hits.every((f) => f.level === 'WARN'));
  assert.ok(r.checked.paints >= 8, JSON.stringify(r.checked));
});

test('colour-unbound: absolute white on a token fill is a note, not a finding', async () => {
  const r = await audit('colour-unbound.good.html');
  assert.deepEqual(r.findings.filter((f) => f.rule === 'colour-unbound'), []);
  assert.ok(r.manual.some((m) => /absolute white or black/.test(m)), JSON.stringify(r.manual));
});

test('colour-unbound: a page that declares no colour token has nothing to be bound to, and says so', async () => {
  const r = await audit('control-box-fit.good.html');
  assert.deepEqual(r.findings.filter((f) => f.rule === 'colour-unbound'), []);
  assert.equal(r.checked.paints, 0);
  assert.ok(r.manual.some((m) => /declares no colour token/.test(m)), JSON.stringify(r.manual));
});

test('colour-unbound: the page is left as it was found', async () => {
  await audit('colour-unbound.bad.html');
  const left = await page_.page.evaluate(() => ({ styles: document.querySelectorAll('style').length, ink: getComputedStyle(document.body).color }));
  assert.deepEqual(left, { styles: 1, ink: 'rgb(34, 34, 34)' });
});

test('data-layout-ignore opts a subtree out', async () => {
  const r = await audit('ignore-opt-out.html');
  assert.deepEqual(r.findings, []);
});

test('a control whose geometry is animating is deferred, not judged, and the result says so', async () => {
  const r = await audit('animating.html');
  assert.ok(r.deferred.length >= 1, JSON.stringify(r));
  assert.deepEqual(r.findings.filter((f) => f.rule === 'control-box-fit'), []);
});

test('the result counts what it checked and lists what only a person can check', async () => {
  const r = await audit('control-box-fit.good.html');
  assert.ok(r.checked.controls >= 1);
  assert.ok(Array.isArray(r.manual) && r.manual.length >= 1);
});

test('the golden screen is clean (verify self-test depends on it)', async () => {
  await page_.page.goto(pathToFileURL(path.join(HERE, '..', 'golden', 'screen-home.html')).href, { waitUntil: 'load' });
  await page_.page.evaluate(() => document.fonts.ready);
  const r = await page_.page.evaluate(auditLayout, {});
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings));
  assert.deepEqual(r.deferred, []);
});
