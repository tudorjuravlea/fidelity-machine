// adherence-lint token-scales: four more scales a lock can declare, held the way spacing is.
//   node --test "fixtures/lint/*.test.mjs"
// tokens.opacity, tokens.blur, tokens.zIndex and tokens.breakpoints are optional. Where a lock
// declares one, a value off it is drift (WARN, the class of tokens-only-spacing); where it does
// not, the section says so in one SKIP row and judges nothing of that family. Each case runs the
// real CLI with --json on a throwaway tree and reads only this section. The base lock is the
// neutral em-dash fixture's with the families under test put in (its provenance receipt then no
// longer matches, which is another section's business).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', '..', 'scripts', 'adherence-lint.mjs');
const BASE = JSON.parse(readFileSync(path.join(HERE, 'em-dash', 'design-lock.json'), 'utf8'));
const FAMILIES = ['opacity', 'blur', 'zIndex', 'breakpoints'];
const ALL = { opacity: [0.4, 0.72], blur: [8, 24], zIndex: { sticky: 100, overlay: 1000 }, breakpoints: { md: 768, lg: 1024 } };

function scales(tokens, files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-scales-'));
  try {
    const lock = structuredClone(BASE);
    for (const f of FAMILIES) delete lock.tokens[f];
    Object.assign(lock.tokens, tokens);
    writeFileSync(path.join(dir, 'design-lock.json'), JSON.stringify(lock));
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
    const r = spawnSync(process.execPath, [CLI, '--lock', path.join(dir, 'design-lock.json'), '--json'], { encoding: 'utf8' });
    assert.notEqual(r.status, 2, `lint setup error: ${r.stderr}`);
    const found = r.stdout.trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.type === 'finding' && x.section === 'token-scales');
    return { warns: found.filter((x) => x.level === 'WARN'), skips: found.filter((x) => x.level === 'SKIP'), other: found.filter((x) => !['WARN', 'SKIP'].includes(x.level)) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const page = (css, body = '<p class="a">x</p>') => ({ 'screen.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>t</title>\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n` });
const details = (r) => r.warns.map((w) => w.detail);

// ---------------------------------------------------------------- what the lock does not declare
test('a lock that declares none of the four says so once, and judges nothing', () => {
  const r = scales({}, page('.a { opacity: 0.37; z-index: 9999; filter: blur(7px); }\n@media (min-width: 813px) { .a { margin: 0; } }'));
  assert.deepEqual(r.warns, []);
  assert.equal(r.skips.length, 1, JSON.stringify(r.skips));
  for (const f of FAMILIES) assert.match(r.skips[0].detail, new RegExp(`tokens\\.${f}\\b`));
});

test('a lock that declares one is held to it, and the row names the three it does not', () => {
  const r = scales({ zIndex: ALL.zIndex }, page('.a { opacity: 0.37; z-index: 9999; }'));
  assert.equal(r.warns.length, 1, JSON.stringify(r.warns));
  assert.match(r.warns[0].detail, /z-index 9999/);
  assert.equal(r.skips.length, 1);
  assert.doesNotMatch(r.skips[0].detail, /tokens\.zIndex\b/);
  for (const f of ['opacity', 'blur', 'breakpoints']) assert.match(r.skips[0].detail, new RegExp(`tokens\\.${f}\\b`));
});

test('a lock that declares all four has no skip row, and a clean page is quiet', () => {
  const r = scales(ALL, page('.a { opacity: 0.4; z-index: 100; filter: blur(8px); }\n@media (min-width: 768px) { .a { margin: 0; } }'));
  assert.deepEqual([...r.warns, ...r.skips, ...r.other], []);
});

test('an empty scale is not a declaration: an empty list holds nothing to', () => {
  const r = scales({ opacity: [], zIndex: {} }, page('.a { opacity: 0.37; z-index: 9999; }'));
  assert.deepEqual(r.warns, []);
  assert.match(r.skips[0].detail, /tokens\.opacity\b/);
  assert.match(r.skips[0].detail, /tokens\.zIndex\b/);
});

// ---------------------------------------------------------------- opacity
test('opacity: a value off the scale is a WARN with the line, the nearest value and the whole scale', () => {
  const r = scales(ALL, page('.z { margin: 0; }\n.a {\n  opacity: 0.5;\n}'));
  assert.equal(r.warns.length, 1, JSON.stringify(r.warns));
  assert.match(r.warns[0].detail, /opacity 0\.5 \(opacity: 0\.5\) is off the lock's opacity scale/);
  assert.equal(r.warns[0].line, 8);
  assert.match(r.warns[0].suggestion, /nearest: 0\.4/);
  assert.match(r.warns[0].suggestion, /\[0\.4, 0\.72\]/);
});

test('opacity: 0 and 1 are always allowed, a percentage is the same number, a leading dot is read', () => {
  assert.deepEqual(details(scales(ALL, page('.a { opacity: 0; } .b { opacity: 1; } .c { opacity: 100%; } .d { opacity: 40%; } .e { opacity: .72; } .f { opacity: 1.0; }'))), []);
  const r = scales(ALL, page('.a { opacity: 50%; } .b { opacity: .5; }'));
  assert.equal(r.warns.length, 1, 'one value, written two ways, reported once');
  assert.match(r.warns[0].detail, /opacity 0\.5/);
  assert.match(details(scales(ALL, page('.a { opacity: .37; }')))[0], /opacity 0\.37 \(opacity: \.37\)/, 'a number may start with its dot');
});

test('opacity: a value read from a variable or a calculation is not a literal, and other properties are not opacity', () => {
  assert.deepEqual(details(scales(ALL, page('.a { opacity: var(--dim); } .b { opacity: calc(1 - 0.37); } .c { fill-opacity: 0.37; flood-opacity: 0.37; } .d { --opacity: 0.37; }'))), []);
});

test('opacity: a style attribute and a stylesheet file are read, a comment is not', () => {
  const r = scales(ALL, { ...page('/* .a { opacity: 0.11; } */', '<p style="opacity: 0.22">x</p>'), 'extra.css': '.b { opacity: 0.33; }\n' });
  assert.deepEqual(details(r).map((d) => d.match(/opacity ([\d.]+)/)[1]).sort(), ['0.22', '0.33']);
});

// ---------------------------------------------------------------- blur
test('blur: a radius off the scale is a WARN in filter and in backdrop-filter; 0 is always allowed', () => {
  const r = scales(ALL, page('.a { filter: blur(8px); } .b { backdrop-filter: saturate(1.2) blur(12px); } .c { -webkit-backdrop-filter: blur(13px); } .d { filter: blur(0); } .e { filter: blur(0px); }'));
  assert.deepEqual(details(r).map((d) => d.match(/blur (\d+)px/)[1]).sort(), ['12', '13']);
  assert.match(r.warns[0].suggestion, /nearest: 8px/);
  assert.match(r.warns[0].suggestion, /\[8, 24\]/);
});

test('blur: a shadow\'s blur radius and a drop-shadow are not this scale, and a variable is not a literal', () => {
  assert.deepEqual(details(scales(ALL, page('.a { box-shadow: 0 2px 12px var(--shade); } .b { filter: drop-shadow(0 0 12px var(--shade)); } .c { filter: blur(var(--blur-md)); } .d { filter: blur(0.5rem); }'))), []);
});

// ---------------------------------------------------------------- z-index
test('z-index: a layer off the scale is a WARN naming the nearest role', () => {
  const r = scales(ALL, page('.a { z-index: 9999; } .b { z-index: 100; } .c { z-index: 1000; }'));
  assert.equal(r.warns.length, 1, JSON.stringify(r.warns));
  assert.match(r.warns[0].detail, /z-index 9999 \(z-index: 9999\) is off the lock's layer scale/);
  assert.match(r.warns[0].suggestion, /nearest: tokens\.zIndex\.overlay = 1000/);
  assert.match(r.warns[0].suggestion, /sticky 100, overlay 1000/);
});

test('z-index: auto, 0, 1 and -1 are always allowed (order inside one component); a negative layer is read', () => {
  assert.deepEqual(details(scales(ALL, page('.a { z-index: auto; } .b { z-index: 0; } .c { z-index: 1; } .d { z-index: -1; } .e { z-index: var(--z-overlay); } .f { z-index: inherit; } .g { z-index: calc(var(--z) + 1); }'))), []);
  const r = scales(ALL, page('.a { z-index: -9999; } .b { z-index: 2; }'));
  assert.deepEqual(details(r).map((d) => d.match(/z-index (-?\d+)/)[1]).sort(), ['-9999', '2']);
});

test('z-index: !important does not hide the value', () => {
  assert.equal(scales(ALL, page('.a { z-index: 5000 !important; }')).warns.length, 1);
});

// ---------------------------------------------------------------- breakpoints
test('breakpoints: a width query off the scale is a WARN; one pixel under a breakpoint is that breakpoint', () => {
  const quiet = scales(ALL, page('@media (min-width: 768px) { .a { margin: 0; } }\n@media (max-width: 767px) { .a { margin: 0; } }\n@media (max-width: 767.98px) { .a { margin: 0; } }\n@media (min-width: 768px) and (max-width: 1023px) { .a { margin: 0; } }'));
  assert.deepEqual(details(quiet), []);
  const r = scales(ALL, page('.z { margin: 0; }\n@media (min-width: 800px) { .a { margin: 0; } }'));
  assert.equal(r.warns.length, 1, JSON.stringify(r.warns));
  assert.match(r.warns[0].detail, /breakpoint 800px \(@media \(min-width: 800px\)\) is off the lock's breakpoints/);
  assert.equal(r.warns[0].line, 7);
  assert.match(r.warns[0].suggestion, /nearest: tokens\.breakpoints\.md = 768px/);
});

test('breakpoints: the range syntax and a container query are read', () => {
  const r = scales(ALL, page('@media (width >= 810px) { .a { margin: 0; } }\n@media (600px <= width < 1024px) { .a { margin: 0; } }\n@container card (min-width: 420px) { .a { margin: 0; } }\n@container (inline-size > 1024px) { .a { margin: 0; } }'));
  assert.deepEqual(details(r).map((d) => d.match(/breakpoint ([\d.]+)px/)[1]).sort(), ['420', '600', '810']);
});

test('breakpoints: height, resolution and em are not a width in px, and a pixel just over a breakpoint is not it', () => {
  assert.deepEqual(details(scales(ALL, page('@media (min-height: 813px) { .a { margin: 0; } }\n@media (min-resolution: 2dppx) { .a { margin: 0; } }\n@media (min-width: 48em) { .a { margin: 0; } }\n@media print { .a { margin: 0; } }\n@media (prefers-reduced-motion: reduce) { .a { margin: 0; } }'))), []);
  assert.equal(scales(ALL, page('@media (min-width: 769px) { .a { margin: 0; } }')).warns.length, 1);
});

test('breakpoints: a width in a declaration is not a query', () => {
  assert.deepEqual(details(scales(ALL, page('.a { max-width: 813px; min-width: 300px; width: 640px; }\n@media (min-width: 768px) { .a { max-width: 813px; width: 640px; } }'))), []);
});

// ---------------------------------------------------------------- the report
test('one value in one file is one finding, however often it is written', () => {
  const r = scales(ALL, page('.a { z-index: 9999; } .b { z-index: 9999; } .c { z-index: 9999; }'));
  assert.equal(r.warns.length, 1);
});

test('the section never fails the lint by itself: every finding is a WARN', () => {
  const r = scales(ALL, page('.a { opacity: 0.37; z-index: 9999; filter: blur(7px); }\n@media (min-width: 813px) { .a { margin: 0; } }'));
  assert.equal(r.warns.length, 4, JSON.stringify(r.warns));
  assert.deepEqual(r.other, []);
});

// ---------------------------------------------------------------- the schema
test('the schema takes the four families as the fixtures write them, and refuses a value of the wrong kind', async () => {
  const { default: Ajv } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(path.join(HERE, '..', '..', 'design-lock.schema.json'), 'utf8')));
  const fixture = JSON.parse(readFileSync(path.join(HERE, 'token-scales', 'design-lock.json'), 'utf8'));
  for (const f of FAMILIES) assert.ok(fixture.tokens[f], `the fixture lock declares tokens.${f}`);
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  const without = structuredClone(fixture);
  for (const f of FAMILIES) delete without.tokens[f];
  assert.equal(validate(without), true, 'every family is optional');
  for (const [family, bad] of [['opacity', [1.5]], ['opacity', { dim: 0.4 }], ['blur', [-4]], ['zIndex', { overlay: 10.5 }], ['zIndex', [100]], ['breakpoints', { md: 0 }], ['breakpoints', { md: '768px' }]]) {
    const lock = structuredClone(fixture);
    lock.tokens[family] = bad;
    assert.equal(validate(lock), false, `tokens.${family} = ${JSON.stringify(bad)} must be refused`);
  }
});
