// operability-core on real pages: the collection, the names Chromium computes, the Tab walk and the
// focus photographs (CONTRACT.md §Invocation contract, operability-audit.mjs). One bad/good page
// per rule: the rule fires on bad, the whole catalogue stays quiet on good, and it stays quiet on
// the golden screen.
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
  // The flag lets a file:// page import an ES module, which the behaviour-kit page does (render.mjs launches the same way).
  b.browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  b.context = await b.browser.newContext({ viewport: { width: 720, height: 640 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await b.context.addInitScript(probeClickListeners);
});
after(async () => { await b.browser?.close(); });

// The per-rule pages are still markup (a switch that does not switch): they pin the rules that read
// the page as it stands, so the key-driving pattern pass is off unless a test turns it on.
async function audit(file, { prepare, patterns = false, ...opts } = {}) {
  opts.patterns = patterns;
  const page = await b.context.newPage();
  try {
    await page.goto(pathToFileURL(path.isAbsolute(file) ? file : path.join(HERE, file)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (prepare) await page.evaluate(prepare);
    return await auditPage(page, opts);
  } finally {
    await page.close();
  }
}
const of = (r, rule) => r.findings.filter((f) => f.rule === rule);
const lines = (r) => r.findings.map((f) => `${f.level} ${f.message}`);

const RULES = ['unnamed-control', 'unnamed-group', 'broken-reference', 'missing-state', 'orphan-role', 'click-without-keyboard', 'focus-not-visible'];

for (const rule of RULES) {
  test(`${rule}: fires on the bad page and names the element`, async () => {
    const r = await audit(`${rule}.bad.html`);
    const hits = of(r, rule);
    assert.ok(hits.length >= 1, `expected ${rule}, got ${JSON.stringify(lines(r))}`);
    assert.ok(hits[0].element, 'a finding names its element');
    assert.ok(hits[0].message.startsWith(`${rule}: ${hits[0].element} `));
  });

  test(`${rule}: the good page is quiet for every rule`, async () => {
    const r = await audit(`${rule}.good.html`);
    assert.deepEqual(lines(r), []);
    assert.ok(r.checked.controls >= 1, 'the good page was actually measured');
  });
}

test('unnamed-control: the icon button and the unlabelled field are both caught, by the name Chromium computed', async () => {
  const r = await audit('unnamed-control.bad.html');
  assert.deepEqual(of(r, 'unnamed-control').map((f) => f.element), ['button.icon', 'input[type=text]']);
});

test('broken-reference: four dangling ids, the describing one a WARN, a partly valid aria-labelledby still caught', async () => {
  const hits = of(await audit('broken-reference.bad.html'), 'broken-reference');
  assert.deepEqual(hits.map((f) => `${f.level} ${f.evidence.attr}=${f.evidence.id}`).sort(), [
    'ERROR aria-controls=gone', 'ERROR aria-labelledby=missing-label', 'ERROR for=nowhere', 'WARN aria-describedby=no-hint',
  ]);
});

test('click-without-keyboard: an inline handler, a listener added by script and a bare role are all caught', async () => {
  const hits = of(await audit('click-without-keyboard.bad.html'), 'click-without-keyboard');
  assert.ok(hits.some((f) => /Open account/.test(f.element)), 'inline onclick');
  assert.ok(hits.some((f) => /Transfer money/.test(f.element)), 'the addEventListener case needs the init-script probe');
  assert.ok(hits.some((f) => /Pay now/.test(f.element)), 'a control role that cannot take focus');
  assert.ok(hits.some((f) => /Free plan/.test(f.element)), 'an option whose listbox offers no tab stop');
  assert.ok(hits.some((f) => /^div\.card "Row in a scroller"/.test(f.element)), 'a focusable scroller above it is not a control that activates it');
  assert.equal(hits.length, 5, JSON.stringify(hits.map((f) => f.message)));
});

test('focus-not-visible: every control with the outline removed is caught, a text field included (its caret is not counted)', async () => {
  const hits = of(await audit('focus-not-visible.bad.html'), 'focus-not-visible');
  assert.deepEqual(hits.map((f) => f.element), ['button "Save"', 'a "Details"', 'input[type=text]'], 'a stop is named as its control is');
  for (const f of hits) assert.ok(f.evidence.changed < f.evidence.needed);
});

test('focus-not-visible: a ring painted on a sibling of a visually hidden input counts as visible', async () => {
  const r = await audit('focus-not-visible.good.html');
  assert.equal(r.checked.focusJudged, 3);
});

test('data-operable-ignore skips a subtree, and the same page without it fires', async () => {
  const ignored = await audit('ignore-opt-out.html');
  assert.deepEqual(lines(ignored), []);
  assert.equal(ignored.checked.controls, 1);
  const judged = await audit('ignore-opt-out.html', { prepare: () => document.getElementById('legacy').removeAttribute('data-operable-ignore') });
  assert.ok(of(judged, 'click-without-keyboard').length === 1 && of(judged, 'unnamed-control').length === 1, JSON.stringify(lines(judged)));
});

test('a page with no controls has nothing checked', async () => {
  const r = await audit('no-controls.html');
  assert.equal(r.checked.controls + r.checked.references, 0);
  assert.deepEqual(r.findings, []);
});

test('a Tab walk longer than the limit is cut and deferred', async () => {
  const r = await audit('orphan-role.good.html', { maxStops: 1 });
  assert.equal(r.checked.tabStops, 1);
  assert.equal(r.deferred.length, 1);
});

test('the Tab walk covers every stop even when the page already put focus somewhere', async () => {
  const fresh = await audit('orphan-role.good.html');
  const focused = await audit('orphan-role.good.html', { prepare: () => document.getElementById('owned').focus() });
  assert.equal(fresh.checked.tabStops, 3);
  assert.equal(focused.checked.tabStops, 3, 'a walk that starts mid-document must come round to the stops before it');
  assert.equal(focused.checked.focusJudged, fresh.checked.focusJudged);
});

test('the audit leaves the page as it found it: no marker attribute and no stylesheet of its own stay behind', async () => {
  const page = await b.context.newPage();
  await page.goto(pathToFileURL(path.join(HERE, 'unnamed-group.good.html')).href, { waitUntil: 'load' });
  const before = await page.evaluate(() => document.querySelectorAll('style').length);
  await auditPage(page);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-operable-n], [data-operable-g]').length), 0);
  assert.equal(await page.evaluate(() => document.querySelectorAll('style').length), before);
  await page.close();
});

test('aria-owns that forms a cycle does not hang the audit', { timeout: 20000 }, async () => {
  const r = await audit('owns-cycle.html');
  assert.deepEqual(lines(r), []);
  assert.equal(r.checked.controls, 1);
});

test('the golden screen has no finding, with the pattern pass on', async () => {
  const r = await audit(path.join(HERE, '..', 'golden', 'screen-home.html'), { patterns: true });
  assert.deepEqual(lines(r), []);
});

test('pattern pass: hand-made tabs with three tab stops and no arrow keys fail the borrowed checker', async () => {
  const r = await audit('pattern-tabs.bad.html', { patterns: true });
  const hits = of(r, 'pattern-tabs');
  assert.ok(hits.length >= 2, JSON.stringify(lines(r)));
  assert.ok(hits.some((f) => /has 3 tab stops/.test(f.message)));
  assert.ok(hits.some((f) => /ArrowRight should move focus/.test(f.message)));
  assert.equal(r.checked.patterns, 1);
  assert.deepEqual(r.findings.filter((f) => !f.rule.startsWith('pattern-')), [], 'the rules that read the page as it stands see nothing wrong with it');
});

test('pattern pass: hand-made tabs that rove, wrap and answer Home and End pass it, on markup that is nobody\'s library', async () => {
  const r = await audit('pattern-tabs.good.html', { patterns: true });
  assert.deepEqual(lines(r), []);
  assert.equal(r.checked.patterns, 1);
});

test('pattern pass: a role that only looks like a widget is caught (a switch that Space does not switch)', async () => {
  const r = await audit('missing-state.good.html', { patterns: true });
  assert.ok(of(r, 'pattern-switch').some((f) => /Space should change aria-checked/.test(f.message)), JSON.stringify(lines(r)));
  assert.ok(of(r, 'pattern-slider').length >= 1);
  assert.equal(r.checked.patterns, 2, 'the native checkbox with role=switch is the browser\'s own and is not driven');
});

test('pattern pass: off, nothing is driven and the report says so', async () => {
  const r = await audit('pattern-tabs.bad.html');
  assert.deepEqual(lines(r), []);
  assert.equal(r.checked.patterns, 0);
  assert.ok(r.manual.some((m) => /not driven here/.test(m)));
});

test('pattern pass: data-operable-ignore keeps a widget out of it, and the widget limit defers the rest', async () => {
  const ignored = await audit('pattern-tabs.bad.html', { patterns: true, prepare: () => document.querySelector('[role=tablist]').setAttribute('data-operable-ignore', '') });
  assert.equal(ignored.checked.patterns, 0);
  assert.deepEqual(of(ignored, 'pattern-tabs'), []);
  const limited = await audit('missing-state.good.html', { patterns: true, maxWidgets: 1 });
  assert.equal(limited.checked.patterns, 1);
  assert.ok(limited.deferred.some((d) => /1 more widget/.test(d)), JSON.stringify(limited.deferred));
});

test('pattern pass: a listbox that belongs to a combobox is driven through the combobox, not a second time on its own', async () => {
  const r = await audit('pattern-owned-listbox.html', { patterns: true });
  assert.equal(r.checked.patterns, 1);
  assert.deepEqual(of(r, 'pattern-listbox'), []);
});

test('an unnamed tab list is reported once: by the pattern checker when it runs, by unnamed-group when it does not', async () => {
  const unname = () => document.querySelector('[role=tablist]').removeAttribute('aria-label');
  const driven = await audit('pattern-tabs.good.html', { patterns: true, prepare: unname });
  assert.deepEqual(driven.findings.map((f) => f.rule), ['pattern-tabs'], JSON.stringify(lines(driven)));
  assert.match(driven.findings[0].message, /has no accessible name/);
  const still = await audit('pattern-tabs.good.html', { prepare: unname });
  assert.deepEqual(still.findings.map((f) => f.rule), ['unnamed-group']);
});

test('known gap of the vendored version: a radio group inside ui-field is left without a name, and the audit catches it', async () => {
  // The upstream docs show this markup. In the web build the field's label does not reach the
  // group, and the upstream checker does not notice: it computes names its own way, while this
  // rule reads the browser's accessibility tree. When this test fails after `ui-sdk.mjs update`,
  // the gap is closed: delete it and the paragraph in references/behavior-kit.md.
  const r = await audit('known-gap-field-radio-group.html', { patterns: true, prepare: async () => {
    await Promise.all(['ui-field', 'ui-radio-group', 'ui-radio'].map((tag) => customElements.whenDefined(tag)));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  } });
  const hits = of(r, 'unnamed-group');
  // The message carries what the audit saw, not only what it found: this assertion failed once on a
  // Linux runner with no finding at all, and `[]` could not say whether the group was there to judge.
  assert.equal(hits.length, 1, JSON.stringify({ findings: lines(r), checked: r.checked, deferred: r.deferred, manual: r.manual }));
  assert.match(hits[0].element, /^ui-radio-group/);
  assert.deepEqual(of(r, 'pattern-radio-group'), [], 'the upstream checker passes the same group');
});

test('behaviour kit: the vendored runtime around our own markup passes every rule, the pattern pass included', async () => {
  const r = await audit('behavior-kit.html', { patterns: true, prepare: async () => {
    await Promise.all(['ui-tabs', 'ui-switch', 'ui-radio-group'].map((tag) => customElements.whenDefined(tag)));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  } });
  assert.deepEqual(lines(r), []);
  assert.ok(r.checked.patterns >= 3, `tabs, switch and radio group are driven, got ${r.checked.patterns}`);
  assert.ok(r.checked.controls >= 6);
});
