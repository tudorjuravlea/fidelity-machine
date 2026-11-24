// adherence-lint raw-hex: a colour keyword and a modern colour function are raw colours too.
//   node --test "fixtures/lint/*.test.mjs"
// The section already refuses a hex and an rgb()/hsl() literal outside a token scope. `navy`,
// `oklch(40% 0.1 150)` and `color(display-p3 1 0 0)` are the same thing in another notation: a
// colour that looks right on the page and is connected to no token. Each case runs the real CLI
// with --json on a throwaway source tree, against the neutral em-dash fixture lock, and reads only
// the raw-hex section.

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

// files: { 'screen.html': '...', 'a.css': '...' }. Returns the raw-hex findings only.
function rawColours(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-colour-'));
  try {
    writeFileSync(path.join(dir, 'design-lock.json'), BASE_LOCK);
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
    const r = spawnSync(process.execPath, [CLI, '--lock', path.join(dir, 'design-lock.json'), '--json'], { encoding: 'utf8' });
    assert.notEqual(r.status, 2, `lint setup error: ${r.stderr}`);
    return r.stdout.trim().split('\n').map((l) => JSON.parse(l))
      .filter((x) => x.type === 'finding' && x.section === 'raw-hex');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const page = (body, head = '') => `<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>t</title>\n${head}</head>\n<body>\n${body}\n</body>\n</html>\n`;
const html = (body, head) => rawColours({ 'screen.html': page(body, head) });
const levels = (f) => f.map((x) => x.level).sort().join(',');

// ---------------------------------------------------------------- colour keywords
test('a colour keyword in a declaration is a raw colour, named with the hex it paints', () => {
  const r = html('<p class="a">x</p>', '<style>\n.z { margin: 0; }\n.y { padding: 0; }\n.a {\n  margin: 0;\n  color: rebeccapurple;\n}\n</style>\n');
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.equal(r[0].level, 'ERROR');
  assert.match(r[0].detail, /raw colour rebeccapurple = #663399 \(1x\)/);
  assert.equal(r[0].line, 10, 'the declaration is on line 10');
});

test('white and black keywords follow the hex carve-out: a warning, not an error', () => {
  const r = html('<p class="a">x</p>', '<style>.a { color: white; background: Black; }</style>\n');
  assert.equal(levels(r), 'WARN,WARN', JSON.stringify(r));
  assert.ok(r.some((x) => /white = #ffffff/.test(x.detail)));
  assert.ok(r.some((x) => /black = #000000/.test(x.detail)), 'a keyword is case-insensitive');
});

test('every colour-bearing property is read: border, shadow, gradient stop, outline, fill', () => {
  const r = html('<p class="a">x</p>', `<style>
.a { border: 1px solid gray; box-shadow: 0 1px 2px crimson; outline: 2px dashed teal; }
.b { background: linear-gradient(to right, tomato, transparent); fill: orchid; text-decoration: underline wavy salmon; }
</style>
`);
  const named = r.map((x) => x.detail.match(/raw colour (\w+) =/)?.[1]).sort();
  assert.deepEqual(named, ['crimson', 'gray', 'orchid', 'salmon', 'teal', 'tomato'], JSON.stringify(r));
  assert.ok(r.every((x) => x.level === 'ERROR'));
});

test('the same keyword used twice in one file is one finding that counts both', () => {
  const r = html('<p class="a">x</p>', '<style>.a { color: navy; } .b { border-color: navy; }</style>\n');
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.match(r[0].detail, /navy = #000080 \(2x\)/);
});

test('a vendor-prefixed paint and any property that ends in -color are read', () => {
  const r = html('<p class="a">x</p>', '<style>.a { -webkit-box-shadow: 0 0 2px navy; -webkit-text-fill-color: teal; scrollbar-color: gold silver; -webkit-text-stroke: 1px plum; }</style>\n');
  const named = r.map((x) => x.detail.match(/raw colour (\w+) =/)?.[1]).sort();
  assert.deepEqual(named, ['gold', 'navy', 'plum', 'silver', 'teal'], JSON.stringify(r));
});

test('the longhands of a paint shorthand are read: one border side, a background image', () => {
  const r = html('<p class="a">x</p>', '<style>.a { border-top: 1px solid peru; background-image: linear-gradient(plum, plum); border-block-end: thin dotted khaki; }</style>\n');
  const named = r.map((x) => x.detail.match(/raw colour (\w+) =/)?.[1]).sort();
  assert.deepEqual(named, ['khaki', 'peru', 'plum'], JSON.stringify(r));
});

// MEASURED: without the guard that stops a declaration starting in the middle of a word, a
// 200,000-character embedded font took the declaration reader 20.6 s; with it, 1 ms.
test('a large embedded font does not slow the keyword reader down', () => {
  const font = `@font-face { font-family: X; src: url(data:font/woff2;base64,${'A'.repeat(400_000)}); }`;
  const started = Date.now();
  const r = html('<p class="a">x</p>', `<style>${font} .a { color: navy; }</style>\n`);
  assert.equal(r.length, 1, JSON.stringify(r).slice(0, 300));
  assert.ok(Date.now() - started < 10_000, `lint took ${Date.now() - started} ms`);
});

test('two notations of one colour, and two keywords for one colour, are reported as written', () => {
  const r = html('<p class="a">x</p>', '<style>.a { color: black; background: rgb(0 0 0); border-color: aqua; outline-color: cyan; }</style>\n');
  assert.equal(r.length, 4, JSON.stringify(r));
  for (const word of ['black = #000000', 'rgb(0 0 0) = #000000', 'aqua = #00ffff', 'cyan = #00ffff']) {
    assert.ok(r.some((x) => x.detail.includes(word)), `${word} missing: ${JSON.stringify(r)}`);
  }
});

test('a keyword in a style attribute, an SVG paint attribute or a quoted script value still errors', () => {
  const r = html('<p style="color: navy">x</p>\n<svg><rect fill="tomato" stroke="none" /><stop stop-color="Gold" /></svg>\n<script>el.style.color = "crimson"; const o = { backgroundColor: \'teal\' };</script>');
  const named = r.map((x) => x.detail.match(/raw colour (\w+) =/)?.[1]).sort();
  assert.deepEqual(named, ['crimson', 'gold', 'navy', 'teal', 'tomato'], JSON.stringify(r));
});

test('a custom property set to a keyword outside a token scope is a raw colour; inside one it is a token', () => {
  const r = html('<p class="a">x</p>', '<style>:root { --ink: navy; } [data-theme="dark"] { --ink: ivory; } .a { --card-fill-color: tomato !important; color: var(--ink); }</style>\n');
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.match(r[0].detail, /raw colour tomato = #ff6347 \(1x\)/);
});

test('a custom property that only contains a keyword among other words is left alone', () => {
  const r = html('<p class="a">x</p>', '<style>.a { --stack: Linen, Tan, serif; --note: gold star; --shadow-color: 0 1px red; --state: on; }</style>\n');
  assert.equal(r.length, 0, JSON.stringify(r));
});

test('words that only look like a colour are not one', () => {
  const r = html(
    '<p class="red gold tan" data-colour="navy" title="the red one"><b class="red">x</b>The red button turns green. color: navy is written here as copy.</p>\n<img alt="tomato" src="red.png">',
    `<style>
@media (prefers-color-scheme: dark) { .a { color-scheme: light dark; } }
.a { color: var(--red); background: var(--brand-red-500, var(--tan)); border-color: currentColor; fill: none; stroke: inherit; outline-color: transparent; }
.b { font-family: Linen, Tan, serif; content: "red"; background: url(red.png) no-repeat, url("gold/navy.svg"); transition: color 0.2s, background-color 0.2s; }
.c { animation-name: tan; grid-area: gold; will-change: color; color: Canvas; accent-color: auto; }
.red { margin: 0; } #navy:hover { padding: 0; } .fill:not(.red), #stroke:has(#gold) { margin: 0; }
.d { background-size: calc(100px * tan(45deg)); background-image: paint(gold-leaf); }
</style>
`);
  assert.equal(r.length, 0, JSON.stringify(r));
});

test('in script, a colour name that is an identifier is a variable, not a literal', () => {
  const r = html('<p>x</p>\n<script>const red = tokens.accent; const s = { color: red, fill: gold }; // color: "navy"\n</script>');
  assert.equal(r.length, 0, JSON.stringify(r));
});

test('a stylesheet and a JSX file are read the same way', () => {
  const r = rawColours({
    'screen.html': page('<p>x</p>'),
    'a.css': '/* color: navy */\n:root { --x: plum; }\n.a { color: peru; }\n',
    'b.jsx': 'const red = 1;\nexport const A = () => <svg style={{ color: "sienna", stroke: red }}><rect fill="khaki" /></svg>;\n',
  });
  const where = r.map((x) => `${x.file}:${x.detail.match(/raw colour (\w+) =/)?.[1]}`).sort();
  assert.deepEqual(where, ['a.css:peru', 'b.jsx:khaki', 'b.jsx:sienna'], JSON.stringify(r));
});

// ---------------------------------------------------------------- modern colour functions
test('oklch, oklab, lab, lch, hwb and color() literals are raw colours', () => {
  const r = html('<p class="a">x</p>', `<style>
.a { color: oklch(40% 0.1 150); background: oklab(0.5 0.1 -0.1 / 80%); }
.b { color: lab(50 40 -20); background: lch(50% 60 270); }
.c { color: hwb(120 10% 20%); background: color(display-p3 1 0 0); }
</style>
`);
  assert.equal(r.length, 6, JSON.stringify(r));
  assert.ok(r.every((x) => x.level === 'ERROR'));
  assert.ok(r.some((x) => x.detail.includes('raw colour oklch(40% 0.1 150)')), JSON.stringify(r));
  assert.ok(r.some((x) => x.detail.includes('raw colour color(display-p3 1 0 0)')));
  assert.equal(r.find((x) => x.detail.includes('lab(50 40 -20)')).line, 7);
});

test('the same modern colour written with different spacing is one finding', () => {
  const r = html('<p class="a">x</p>', '<style>.a { color: oklch(40% 0.1 150); background: oklch(40%   0.1\n 150); border-color: OKLCH(40% 0.1 150); }</style>\n');
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.match(r[0].detail, /\(3x\)/);
});

test('color() with a custom colour profile is a raw colour too', () => {
  const r = html('<p class="a">x</p>', '<style>.a { color: color(--brand-cmyk 0 1 0); }</style>\n');
  assert.equal(r.length, 1, JSON.stringify(r));
});

test('a modern colour function built from tokens, or inside a token scope, is not a literal', () => {
  const r = html('<p class="a">x</p>', `<style>
:root { --brand: oklch(40% 0.1 150); }
.a { color: oklch(var(--l) 0.1 150); background: color-mix(in oklch, var(--brand), var(--ink)); }
.b { color: oklch(from var(--brand) calc(l + 0.1) c h); border-color: lch(calc(50% + 1%) 60 270); }
</style>
`);
  assert.equal(r.length, 0, JSON.stringify(r));
});

// A feature query asks the browser a question; it paints nothing. Compiled utility CSS wraps every
// opacity utility in `@supports (color: color-mix(in lab, red, red))`: MEASURED on one real
// compiled stylesheet, that read as 97 uses of `red` before the condition was left out.
test('a colour inside an @supports or @media condition is a question, not a paint', () => {
  const r = html('<p class="a">x</p>', `<style>
@supports (color: color-mix(in lab, red, red)) { .a { color: var(--ink); } }
@supports (color: oklch(0% 0 0)) and (not (color: rgb(from red r g b))) { .a { color: var(--ink); } }
@media (prefers-color-scheme: dark) and (color: 8) { .a { color: var(--ink); } }
</style>
`);
  assert.equal(r.length, 0, JSON.stringify(r));
});

test('the rule inside an @supports block is still read', () => {
  const r = html('<p class="a">x</p>', '<style>@supports (color: color-mix(in lab, red, red)) { .a { color: navy; background: oklch(40% 0.1 150); } }</style>\n');
  assert.equal(r.length, 2, JSON.stringify(r));
  assert.ok(r.some((x) => x.detail.includes('raw colour navy')) && r.some((x) => x.detail.includes('raw colour oklch(40% 0.1 150)')));
});

test('a script call that shares a colour function\'s name is not a colour', () => {
  const r = html('<p>x</p>\n<script>const c = color(d3); const l = lab(a, b); note("see lab(one two three) and color(srgb)");</script>');
  assert.equal(r.length, 0, JSON.stringify(r));
});

test('a fully transparent modern colour is the transparent keyword', () => {
  const r = html('<p class="a">x</p>', '<style>.a { background: linear-gradient(oklch(0 0 0 / 0), oklab(0 0 0 / 0%)); }</style>\n');
  assert.equal(r.length, 0, JSON.stringify(r));
});

test('a modern colour function in prose is copy', () => {
  const r = html('<p>Write oklch(40% 0.1 150) in the token file, never navy in a rule.</p>');
  assert.equal(r.length, 0, JSON.stringify(r));
});
