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
  'unit-wrapped', 'fat-row', 'empty-pane', 'mixed-icons', 'emoji-icon'];

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
