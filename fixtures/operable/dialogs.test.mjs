// operability-core's dialog pass on real pages (CONTRACT.md §Invocation contract, operability-audit.mjs).
// A page cannot say how to open itself, but a trigger can: aria-haspopup="dialog", or
// aria-controls / popovertarget pointing at a dialog. Each such trigger is clicked; focus must be
// inside what opened, Tab and Shift+Tab must stay inside a modal one, Escape must close it and
// focus must come back to the trigger (rule dialog-focus, one finding per fault).
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
    const result = await auditPage(page, { patterns: false, contrast: false, motion: false, targets: false, dialogs: true, ...opts });
    return then ? { result, left: await page.evaluate(then) } : result;
  } finally {
    await page.close();
  }
}
const hits = (r) => r.findings.filter((f) => f.rule === 'dialog-focus');
const faults = (r) => hits(r).map((f) => `${f.element.match(/#[\w-]+/)?.[0]} ${f.evidence.fault}`).sort();

test('dialog-focus: each way a dialog can fail a keyboard is named at its trigger, one fault each', async () => {
  const r = await audit('dialog-focus.bad.html');
  assert.deepEqual(faults(r), [
    '#open-dead did-not-open',
    '#open-leak tab-left',
    '#open-leakback tab-left',
    '#open-noescape escape-ignored',
    '#open-nofocus focus-stayed-outside',
    '#open-noreturn focus-not-returned',
  ], JSON.stringify(hits(r).map((f) => f.message)));
  assert.ok(hits(r).every((f) => f.level === 'ERROR'));
  assert.equal(r.checked.dialogs, 6);
  assert.equal(hits(r).find((f) => f.element.includes('#open-leakback')).message.includes('Shift+Tab'), true);
});

test('dialog-focus: a correct custom modal, the native one and a non-modal panel are quiet; an opted-out trigger is not pressed', async () => {
  const r = await audit('dialog-focus.good.html');
  assert.deepEqual(hits(r).map((f) => f.message), []);
  assert.equal(r.checked.dialogs, 3);
});

test('the dialog pass leaves every dialog closed and focus where it found it', async () => {
  const { left } = await audit('dialog-focus.good.html', {}, () => ({
    open: [...document.querySelectorAll('[role="dialog"]:not([hidden]), dialog[open]')].length,
    focus: document.activeElement === document.body,
  }));
  assert.deepEqual(left, { open: 0, focus: true });
});

test('the dialog pass follows the key pass unless asked for: off, the result says dialogs were not opened', async () => {
  const r = await audit('dialog-focus.bad.html', { dialogs: undefined });
  assert.deepEqual(hits(r), []);
  assert.equal(r.checked.dialogs, 0);
  assert.ok(r.manual.some((m) => /no dialog was opened/.test(m)), JSON.stringify(r.manual));
});
