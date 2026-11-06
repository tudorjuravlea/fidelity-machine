// adherence-lint: the phone-runnable section, one case group per rule.
//   node --test "fixtures/lint/*.test.mjs"
// Same harness as rule-defects.test.mjs (the real CLI with --json on a throwaway screen, against
// the neutral em-dash fixture lock), reading only the section under test. The harness is repeated
// here, not imported: a test file that imports another runs that file's cases a second time.
//
// PHONE is a page that declares itself phone-runnable and carries the whole baseline, so it has
// no finding in this section. Every case is PHONE with one thing changed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', '..', 'scripts', 'adherence-lint.mjs');
const BASE_LOCK = readFileSync(path.join(HERE, 'em-dash', 'design-lock.json'), 'utf8');

function lint(html) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-phone-'));
  try {
    writeFileSync(path.join(dir, 'design-lock.json'), BASE_LOCK);
    writeFileSync(path.join(dir, 'screen.html'), html);
    const r = spawnSync(process.execPath, [CLI, '--lock', path.join(dir, 'design-lock.json'), '--json'], { encoding: 'utf8' });
    assert.notEqual(r.status, 2, `lint setup error: ${r.stderr}`);
    return r.stdout.trim().split('\n').map((l) => JSON.parse(l))
      .filter((x) => x.type === 'finding' && x.section === 'phone-runnable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">';
const THEME = '<meta name="theme-color" content="#F7F6F3">';
const CSS = `
  html { -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
  input, textarea, select { font-size: 16px; }
  button, [role="button"] { touch-action: manipulation; user-select: none; -webkit-user-select: none; }
  .btn:active { transform: scale(0.97); }
`;
const BODY = '<main><h1>Your accounts</h1><input type="text" aria-label="Amount"><button class="btn">Send money</button></main>';
// Each part can be replaced; `css` and `body` can also be appended to with `+`.
const phone = ({ html = '<html lang="en" data-phone-runnable>', viewport = VIEWPORT, theme = THEME, css = CSS, body = BODY, script = '' } = {}) =>
  `<!DOCTYPE html>\n${html}\n<head>\n<title>t</title>\n${viewport}\n${theme}\n<style>${css}</style>\n</head>\n<body>\n${body}\n${script}\n</body>\n</html>\n`;

const errors = (f) => f.filter((x) => x.level === 'ERROR');
const warns = (f) => f.filter((x) => x.level === 'WARN');
// Exactly one ERROR whose detail matches, and nothing else in the section.
function oneError(f, re) {
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.equal(f[0].level, 'ERROR');
  assert.match(f[0].detail, re);
}

// ---------------------------------------------------------------- the declaration
test('a declared page with the whole baseline has no finding', () => {
  assert.deepEqual(lint(phone()), []);
});

test('an undeclared page is not judged, whatever it carries', () => {
  const bad = phone({
    html: '<html lang="en">',
    viewport: '<meta name="viewport" content="width=device-width, user-scalable=no">',
    theme: '',
    css: 'body { user-select: none; height: 100vh; } .btn:hover { opacity: .8; }',
    script: '<script>if (navigator.userAgent.includes("iPhone")) document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });</script>',
  });
  assert.deepEqual(lint(bad), []);
});

test('data-phone-runnable="false" is not a declaration', () => {
  assert.deepEqual(lint(phone({ html: '<html lang="en" data-phone-runnable="false">', css: '.btn:hover { opacity: .8; }' })), []);
});

// ---------------------------------------------------------------- zoom
test('zoom: user-scalable=no is an error', () => {
  oneError(lint(phone({ viewport: VIEWPORT.replace('">', ', user-scalable=no">') })), /user-scalable=no/);
});

test('zoom: maximum-scale=1 is an error, maximum-scale=5 is not', () => {
  oneError(lint(phone({ viewport: VIEWPORT.replace('">', ', maximum-scale=1.0">') })), /maximum-scale=1/);
  assert.deepEqual(lint(phone({ viewport: VIEWPORT.replace('">', ', maximum-scale=5">') })), []);
});

// ---------------------------------------------------------------- hover
test('hover: a :hover rule outside a hover media query is an error, with its line', () => {
  const f = lint(phone({ css: CSS + '  .btn:hover { opacity: .8; }\n' }));
  oneError(f, /1 :hover rule.*outside @media \(hover: hover\).*\.btn:hover/);
  assert.equal(f[0].line, 12);
});

test('hover: gated by (hover: hover) and (pointer: fine), or by (hover: hover) alone, it is fine', () => {
  assert.deepEqual(lint(phone({ css: CSS + '@media (hover: hover) and (pointer: fine) { .btn:hover { opacity: .8; } }' })), []);
  assert.deepEqual(lint(phone({ css: CSS + '@media (hover: hover) { .btn:hover { opacity: .8; } .a:hover { color: red; } }' })), []);
});

test('hover: a width media query is not a hover gate', () => {
  oneError(lint(phone({ css: CSS + '@media (min-width: 600px) { .btn:hover { opacity: .8; } }' })), /:hover/);
});

// ---------------------------------------------------------------- 100vh
test('100vh: a height of 100vh with no dvh/svh for the same selector is an error', () => {
  oneError(lint(phone({ css: CSS + '.app { height: 100vh; }' })), /\.app.*height: 100vh/);
  oneError(lint(phone({ css: CSS + '.app { min-height: calc(100vh - 62px); }' })), /min-height/);
});

test('100vh: as a fallback line under a dvh or svh line it is fine', () => {
  assert.deepEqual(lint(phone({ css: CSS + '.app { height: 100vh; height: 100dvh; height: var(--vvh, 100dvh); }' })), []);
  assert.deepEqual(lint(phone({ css: CSS + '.hero { min-height: 100vh; } @supports (height: 100svh) { .hero { min-height: 100svh; } }' })), []);
});

test('100vh: another property, or a dvh on another selector, does not excuse it', () => {
  oneError(lint(phone({ css: CSS + '.app { height: 100vh; max-height: 100dvh; } .other { height: 100dvh; }' })), /\.app/);
});

// ---------------------------------------------------------------- press feedback
test('press feedback: tappable controls with no :active rule and no pointerdown listener is an error', () => {
  oneError(lint(phone({ css: CSS.replace('.btn:active { transform: scale(0.97); }', '') })), /1 tappable control.*no :active rule/);
});

test('press feedback: a pointerdown listener counts, and a page with no control has nothing to press', () => {
  const noActive = CSS.replace('.btn:active { transform: scale(0.97); }', '');
  assert.deepEqual(lint(phone({ css: noActive, script: '<script>document.addEventListener("pointerdown", press);</script>' })), []);
  assert.deepEqual(lint(phone({ css: noActive, body: '<main><h1>Your accounts</h1></main>' })), []);
});

// ---------------------------------------------------------------- touchmove
test('touchmove: a listener that prevents default, inline or by passive: false, is an error', () => {
  oneError(lint(phone({ script: '<script>\ndocument.addEventListener("touchmove", (e) => { e.preventDefault(); });\n</script>' })), /1 touchmove listener/);
  oneError(lint(phone({ script: "<script>el.addEventListener('touchmove', move, { passive: false });</script>" })), /touchmove/);
});

test('touchmove: a passive listener is fine', () => {
  assert.deepEqual(lint(phone({ script: '<script>el.addEventListener("touchmove", track, { passive: true }); el.addEventListener("click", (e) => e.preventDefault());</script>' })), []);
});

// ---------------------------------------------------------------- root rules
test('user-select: none on the document root is an error, on a control it is the baseline', () => {
  oneError(lint(phone({ css: CSS + 'html, body { -webkit-user-select: none; }' })), /user-select: none on the document root/);
  assert.deepEqual(lint(phone({ css: CSS + 'body .chip { user-select: none; }' })), []);
});

test('touch-action: none on the document root is an error, on a gesture control it is fine', () => {
  oneError(lint(phone({ css: CSS + '* { touch-action: none; }' })), /touch-action: none on the document root/);
  assert.deepEqual(lint(phone({ css: CSS + '.slide { touch-action: none; }' })), []);
});

// ---------------------------------------------------------------- safe areas
test('safe area: env(safe-area-inset-*) without viewport-fit=cover is an error', () => {
  const f = lint(phone({
    viewport: '<meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content">',
    css: CSS + '.bar { padding-bottom: env(safe-area-inset-bottom, 0px); }',
  }));
  oneError(f, /env\(safe-area-inset-\*\).*viewport-fit=cover/);
});

test('safe area: with viewport-fit=cover it is fine', () => {
  assert.deepEqual(lint(phone({ css: CSS + '.bar { padding-bottom: env(safe-area-inset-bottom, 0px); }' })), []);
});

// ---------------------------------------------------------------- theme-color
test('theme-color: one tag for a page that styles both colour schemes is an error', () => {
  oneError(lint(phone({ css: CSS + '@media (prefers-color-scheme: dark) { body { background: var(--background); } }' })), /theme-color/);
});

test('theme-color: one tag per scheme is fine, and so is one tag on a single-scheme page', () => {
  const two = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F6F3">\n<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1C1B18">';
  assert.deepEqual(lint(phone({ theme: two, css: CSS + '@media (prefers-color-scheme: dark) { body { background: var(--background); } }' })), []);
  assert.deepEqual(lint(phone()), []);
});

// ---------------------------------------------------------------- user agent
test('user agent: reading navigator.userAgent is an error', () => {
  oneError(lint(phone({ script: '<script>const touch = /iPhone|Android/.test(navigator.userAgent);</script>' })), /navigator\.userAgent/);
});

// ---------------------------------------------------------------- the baseline (WARN)
test('baseline: a declared page with none of it gets warnings only, one per missing line', () => {
  const f = lint(phone({ viewport: '', theme: '', css: '.btn:active { opacity: .8; }' }));
  assert.deepEqual(errors(f), [], JSON.stringify(errors(f)));
  const texts = warns(f).map((x) => x.detail).join('\n');
  for (const re of [/viewport/, /theme-color/, /-webkit-tap-highlight-color/, /text-size-adjust/, /overscroll-behavior/,
    /touch-action: manipulation/, /user-select: none/, /16px/]) assert.match(texts, re);
  assert.equal(warns(f).length, 8, texts);
});

test('baseline: a viewport tag missing parts names the parts and suggests the whole tag', () => {
  const f = lint(phone({ viewport: '<meta name="viewport" content="width=device-width, initial-scale=1">' }));
  assert.equal(f.length, 1, JSON.stringify(f));
  assert.equal(f[0].level, 'WARN');
  assert.match(f[0].detail, /viewport-fit=cover, interactive-widget=resizes-content/);
  assert.match(f[0].suggestion, /<meta name="viewport"/);
});

test('baseline: a text input under 16px, or with no font-size at all, is a warning', () => {
  const small = lint(phone({ css: CSS.replace('font-size: 16px', 'font-size: 14px') }));
  assert.equal(small.length, 1, JSON.stringify(small));
  assert.equal(small[0].level, 'WARN');
  assert.match(small[0].detail, /1 text field.*under 16px/);
  const none = lint(phone({ css: CSS.replace('input, textarea, select { font-size: 16px; }', '') }));
  assert.equal(none.length, 1, JSON.stringify(none));
  assert.match(none[0].detail, /under 16px/);
});

test('baseline: a size the gate cannot read, and a control that takes no text, are not findings', () => {
  assert.deepEqual(lint(phone({ css: CSS.replace('font-size: 16px', 'font: inherit') })), []);
  assert.deepEqual(lint(phone({
    css: CSS.replace('input, textarea, select { font-size: 16px; }', ''),
    body: '<main><input type="radio" name="a"><input type="checkbox"><button class="btn">Send money</button></main>',
  })), []);
});
