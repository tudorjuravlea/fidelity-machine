// operability-core's target-size pass on real pages (CONTRACT.md §Invocation contract, operability-audit.mjs).
// WCAG 2.5.8: a target is 24x24 CSS px, unless nothing else lies within a 24 px circle centred on
// it, or it sits in a line of text. A page that declares itself phone-runnable is held to 44.
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

async function audit(file, opts = {}) {
  const page = await b.context.newPage();
  try {
    await page.goto(pathToFileURL(path.join(HERE, file)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return await auditPage(page, { patterns: false, contrast: false, motion: false, ...opts });
  } finally {
    await page.close();
  }
}
const hits = (r) => r.findings.filter((f) => f.rule === 'target-size');

test('target-size: small targets packed together are one finding per size, counted, with the first named', async () => {
  const r = await audit('target-size.bad.html');
  const got = hits(r).map((f) => `${f.evidence.width}x${f.evidence.height} x${f.evidence.count} ${f.element.match(/#\w+/)?.[0]}`).sort();
  assert.deepEqual(got, ['14x14 x2 #m', '16x16 x3 #a', '17x17 x2 #i1', '18x32 x1 #x'], JSON.stringify(hits(r).map((f) => f.message)));
  assert.ok(hits(r).every((f) => f.level === 'WARN' && f.evidence.floor === 24));
});

test('target-size: full size, room around it, a link in a sentence, a labelled box, a disabled control and an opted-out row are quiet', async () => {
  const r = await audit('target-size.good.html');
  assert.deepEqual(hits(r).map((f) => f.message), []);
  assert.ok(r.checked.targets >= 7, JSON.stringify(r.checked));
});

test('target-size: a page that declares itself phone-runnable is held to 44, the same page without the claim to 24', async () => {
  const phone = await audit('target-size.phone.html');
  assert.equal(hits(phone).length, 1, JSON.stringify(hits(phone).map((f) => f.message)));
  assert.deepEqual([hits(phone)[0].evidence.floor, hits(phone)[0].evidence.count], [44, 2]);
  const pointer = await audit('target-size.pointer.html');
  assert.deepEqual(hits(pointer), []);
});

test('targets: false leaves the pass out, and the result says target size was not judged', async () => {
  const r = await audit('target-size.bad.html', { targets: false });
  assert.deepEqual(hits(r), []);
  assert.equal(r.checked.targets, 0);
  assert.ok(r.manual.some((m) => /size of targets was not judged/.test(m)), JSON.stringify(r.manual));
});
