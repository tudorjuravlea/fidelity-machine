// operability-core's contrast pass on real pages (CONTRACT.md §Invocation contract, operability-audit.mjs).
// Text is judged against what is PAINTED behind it: the page is photographed once with every
// glyph made transparent, and each text's own colour is set against the pixels under its lines.
// So a gradient, an image, a translucent colour and a faded group are measured, not guessed.
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

async function audit(file, opts = {}, then = null) {
  const page = await b.context.newPage();
  try {
    await page.goto(pathToFileURL(path.join(HERE, file)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const result = await auditPage(page, { patterns: false, ...opts });
    return then ? { result, left: await page.evaluate(then) } : result;
  } finally {
    await page.close();
  }
}
const hits = (r) => r.findings.filter((f) => f.rule === 'text-contrast');
const where = (r) => hits(r).map((f) => `${f.element.match(/#[\w-]+/)?.[0]} ${f.evidence.state}`).sort();

test('text-contrast: each way of ending up with pale text is found, in the state where it happens', async () => {
  const r = await audit('text-contrast.bad.html');
  assert.deepEqual(where(r), ['#alpha rest', '#faded rest', '#focus focus', '#grad rest', '#grey rest', '#hover hover', '#modern rest', '#pale rest'], JSON.stringify(hits(r).map((f) => f.message)));
  assert.ok(hits(r).every((f) => f.level === 'WARN'));
});

test('text-contrast: the ratio is the painted one', async () => {
  const r = await audit('text-contrast.bad.html');
  const of = (id) => hits(r).find((f) => f.element.includes(id)).evidence;
  assert.ok(Math.abs(of('#grey').ratio - 2.07) < 0.06, `#b4b4b8 on white is 2.07:1, got ${of('#grey').ratio}`);
  assert.equal(of('#grey').needed, 4.5);
  // White on #111 is 18.9:1 and on the gradient's middle grey about 4:1; the palest tenth under the
  // words decides, so the figure has to sit well under both.
  assert.ok(of('#grad').ratio < 2.2, `white on the light end of the gradient, got ${of('#grad').ratio}`);
  assert.match(of('#grad').behind, /^rgb\((1[6-9]\d|2\d\d), /, `the pixel judged against is a light one, got ${of('#grad').behind}`);
  assert.ok(of('#alpha').ratio > 2 && of('#alpha').ratio < 2.7, `30% black on white is about 2.3:1, got ${of('#alpha').ratio}`);
  assert.ok(of('#faded').ratio < 2.5, `#222 at 30% opacity, got ${of('#faded').ratio}`);
  assert.ok(of('#modern').ratio < 2, `pale oklch on white, got ${of('#modern').ratio}`);
  assert.match(hits(r).find((f) => f.element.includes('#hover')).message, /on hover/);
});

test('text-contrast: large text, a dark gradient, a disabled control, hidden text and an opted-out subtree are quiet', async () => {
  const r = await audit('text-contrast.good.html');
  assert.deepEqual(hits(r).map((f) => f.message), []);
  assert.ok(r.checked.texts >= 6, JSON.stringify(r.checked));
  assert.ok(r.checked.textStates >= 2, 'the enabled button was judged on hover and on focus');
});

test('the contrast pass leaves the page as it found it', async () => {
  const { left } = await audit('text-contrast.bad.html', {}, () => ({
    styles: document.querySelectorAll('style').length, focus: document.activeElement === document.body, ink: getComputedStyle(document.querySelector('#grey')).color,
  }));
  assert.deepEqual(left, { styles: 1, focus: true, ink: 'rgb(180, 180, 184)' });
});

test('contrast: false leaves the pass out, and the result says contrast was not judged', async () => {
  const r = await audit('text-contrast.bad.html', { contrast: false });
  assert.deepEqual(hits(r), []);
  assert.equal(r.checked.texts, 0);
  assert.ok(r.manual.some((m) => /contrast of text was not judged/.test(m)), JSON.stringify(r.manual));
});
