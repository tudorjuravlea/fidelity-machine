// adherence-lint: seven rule defects, one case group each (CHANGELOG Unreleased, "Fixed").
//   node --test "fixtures/lint/*.test.mjs"
// Each case runs the real CLI with --json on a throwaway screen in os.tmpdir(), against the neutral
// em-dash fixture lock (fixtures/lint/em-dash/design-lock.json), and reads only the section under
// test: replacing the fixture's screen makes other sections fire, and they are not this file's
// business. lint-negatives.mjs proves each section CAN fire; these cases pin what each one should
// and should not count, and where it says the fault is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, '..', '..', 'scripts', 'adherence-lint.mjs');
const BASE_LOCK = JSON.parse(readFileSync(path.join(HERE, 'em-dash', 'design-lock.json'), 'utf8'));

function lint(html, editLock = (l) => l) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-defects-'));
  try {
    writeFileSync(path.join(dir, 'design-lock.json'), JSON.stringify(editLock(structuredClone(BASE_LOCK))));
    writeFileSync(path.join(dir, 'screen.html'), html);
    const r = spawnSync(process.execPath, [CLI, '--lock', path.join(dir, 'design-lock.json'), '--json'], { encoding: 'utf8' });
    assert.notEqual(r.status, 2, `lint setup error: ${r.stderr}`);
    const rows = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
    return rows.filter((x) => x.type === 'finding');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const of = (findings, section) => findings.filter((f) => f.section === section);
const page = (body, head = '') => `<!DOCTYPE html>\n<html lang="en">\n<head>\n<title>t</title>\n${head}</head>\n<body>\n${body}\n</body>\n</html>\n`;

// ---------------------------------------------------------------- 1 banned-jargon
// A term inside a longer banned term (RO "Beneficiar" inside EN "Beneficiary") is the same word
// hit twice. The match stays a literal substring grep (an inflected "Beneficiarul" still counts).
const withRoTerm = (l) => {
  l.content.bannedJargon.ro = [{ term: 'Beneficiar', replacement: 'Persoana care primeste banii' }];
  return l;
};

test('banned-jargon: a term inside a longer banned term is one finding, not two', () => {
  const j = of(lint(page('<p>The Beneficiary gets it.</p>'), withRoTerm), 'banned-jargon');
  assert.equal(j.length, 1, JSON.stringify(j));
  assert.match(j[0].detail, /\(en\) "Beneficiary" found 1x/);
});

test('banned-jargon: an inflected form of the shorter term still counts, on its own line', () => {
  const j = of(lint(page('<p>The Beneficiary gets it.</p>\n<p>Beneficiarul primeste banii.</p>'), withRoTerm), 'banned-jargon');
  assert.equal(j.length, 2, JSON.stringify(j));
  const ro = j.find((f) => f.detail.includes('(ro)'));
  assert.match(ro.detail, /"Beneficiar" found 1x/);
  assert.equal(ro.line, 8, 'the RO hit is "Beneficiarul" on line 8, not the EN word on line 7');
});

// ---------------------------------------------------------------- 2 em-dash in text attributes
test('em-dash: alt, title and aria-label text is counted', () => {
  const e = of(lint(page('<p>Plain copy.</p>\n<img alt="Plata — azi" src="x.png">\n<p title="a — b">x</p>\n<button aria-label="Close — now">x</button>')), 'em-dash');
  assert.equal(e.length, 1, JSON.stringify(e));
  assert.match(e[0].detail, /^3 em-dash/);
  assert.equal(e[0].line, 8, 'first dash is the alt on line 8');
});

test('em-dash: an attribute in <head> or one that is not text (data-*) is not counted', () => {
  const e = of(lint(page('<p data-note="a — b">Plain copy.</p>', '<link rel="icon" title="a — b" href="x.png">\n')), 'em-dash');
  assert.equal(e.length, 0, JSON.stringify(e));
});

// ---------------------------------------------------------------- 3 banned-fonts on h2-h6
test('banned-fonts: an AI-default face on h2..h6 is reported like h1', () => {
  const b = of(lint(page('<h2>a</h2>', '<style>h2{font-family:Inter} h4 { font-family: "Space Grotesk", sans-serif }</style>\n')), 'banned-fonts');
  assert.equal(b.length, 2, JSON.stringify(b));
  assert.ok(b.some((f) => f.detail.includes('"h2" uses "inter"')));
  assert.ok(b.some((f) => f.detail.includes('"h4" uses "space grotesk"')));
});

test('banned-fonts: a heading-like class name that is not h1-h6 is not read as a heading', () => {
  const b = of(lint(page('<p class="h20">a</p>', '<style>.h20{font-family:Inter}</style>\n')), 'banned-fonts');
  assert.equal(b.length, 0, JSON.stringify(b));
});

// ---------------------------------------------------------------- 4 color-only-status glyphs
test('color-only-status: a status element holding only a glyph is reported', () => {
  const c = of(lint(page('<span class="badge error" aria-hidden="true">●</span>')), 'color-only-status');
  assert.equal(c.length, 1, JSON.stringify(c));
});

test('color-only-status: a glyph with a word beside it passes', () => {
  const c = of(lint(page('<span class="badge error">● Failed</span>\n<span class="badge success">2</span>')), 'color-only-status');
  assert.equal(c.length, 0, JSON.stringify(c));
});

// ---------------------------------------------------------------- 7 rgb()/hsl() literals
test('raw-hex: rgb() and hsl() literals outside a token scope are raw colours', () => {
  const r = of(lint(page('<p style="color:rgb(255,0,255)">x</p>\n<p style="color:hsl(120 100% 25% / 50%)">y</p>')), 'raw-hex');
  const errs = r.filter((f) => f.level === 'ERROR');
  assert.equal(errs.length, 2, JSON.stringify(r));
  assert.ok(errs.some((f) => f.detail.includes('rgb(255,0,255)') && f.detail.includes('#ff00ff') && f.line === 7));
  assert.ok(errs.some((f) => f.detail.includes('hsl(120 100% 25% / 50%)') && f.detail.includes('#00800080') && f.line === 8));
});

test('raw-hex: rgb() follows the hex carve-out and skips token scopes and var() channels', () => {
  const r = of(lint(page('<p class="a">x</p>',
    '<style>:root { --shade: rgba(0, 0, 0, 0.2); } .a { color: rgb(0 0 0); background: rgb(var(--r) 0 0); }</style>\n')), 'raw-hex');
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.equal(r[0].level, 'WARN', 'rgb(0 0 0) is #000000, the white/black WARN carve-out');
});

// ---------------------------------------------------------------- 8 bare CR line endings
test('a bare-CR document reports findings on their own line', () => {
  const html = page('<p>a</p>\r<p>b — c</p>\r<p style="color:#123456">d</p>').replace(/\n/g, '\r');
  const f = lint(html);
  assert.equal(of(f, 'em-dash')[0]?.line, 8, JSON.stringify(of(f, 'em-dash')));
  assert.equal(of(f, 'raw-hex').find((x) => x.detail.includes('#123456'))?.line, 9);
});

// ---------------------------------------------------------------- 9 <style> inside script text
test('transition-all: a <style> written inside a script string is not CSS', () => {
  const t = of(lint(page('<script>var s="<style>a{transition:all .3s}</style>";</script>\n<p>x</p>')), 'transition-all');
  assert.equal(t.length, 0, JSON.stringify(t));
});

test('transition-all: a <style> inside an HTML comment is not CSS, a real one after both still is', () => {
  const t = of(lint(page('<!-- <style>a{transition:all .3s}</style> -->\n<script>var s="<style>";</script>\n<p>x</p>',
    '<style>b { transition: all .2s }</style>\n')), 'transition-all');
  assert.equal(t.length, 1, JSON.stringify(t));
  assert.equal(t[0].line, 5);
});

test('raw-hex: a fully transparent rgba() is the transparent keyword, not a colour', () => {
  const r = of(lint(page('<p class="a">x</p>', '<style>.a { background: linear-gradient(rgba(0,0,0,0), transparent); }</style>\n')), 'raw-hex');
  assert.equal(r.length, 0, JSON.stringify(r));
});

// ---------------------------------------------------------------- 5 raw-hex reads CSS contexts only (html)
test('raw-hex: a hex or rgb() in prose, or in an attribute that is not a colour, is copy', () => {
  const r = of(lint(page('<p>The sample #abcdef is a colour. Order #12345678 ships.</p>\n<p data-swatch="#abcdef">rgb(1, 2, 3) is a value.</p>')), 'raw-hex');
  assert.equal(r.length, 0, JSON.stringify(r));
});

test('raw-hex: the same hex in a style attribute, an SVG paint attribute or inline script still errors', () => {
  const r = of(lint(page('<p style="color:#abcdef">x</p>\n<svg><rect fill="#123456" /></svg>\n<script>el.style.color = "#654321";</script>')), 'raw-hex');
  const at = (hex) => r.find((f) => f.level === 'ERROR' && f.detail.includes(hex))?.line;
  assert.equal(at('#abcdef'), 7);
  assert.equal(at('#123456'), 8);
  assert.equal(at('#654321'), 9);
});

// ---------------------------------------------------------------- 6 Figma export leftovers
test('export-artifacts: data-node-id and expiring Figma asset URLs are errors', () => {
  const x = of(lint(page('<div data-node-id="123:456">a</div>\n<img alt="a" src="https://www.figma.com/api/mcp/asset/0f3c">\n<img alt="b" src="https://s3-alpha-sig.figma.com/img/ab12">',
    '<style>.h { background: url(https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/ab12) }</style>\n')), 'export-artifacts');
  assert.equal(x.length, 4, JSON.stringify(x));
  assert.ok(x.every((f) => f.level === 'ERROR'));
  assert.equal(x.find((f) => f.detail.includes('data-node-id'))?.line, 8);
});

test('export-artifacts: the engine\'s own data-fig-* instrumentation and a Figma file link are not leftovers', () => {
  const x = of(lint(page('<main data-fig-id="shell-main" data-fig-name="Shell" data-fig-key="k1"><a href="https://www.figma.com/design/abc/File">Design</a></main>\n<p data-node-identity="x">y</p>')), 'export-artifacts');
  assert.equal(x.length, 0, JSON.stringify(x));
});

// ---------------------------------------------------------------- 3b system-ui
test('banned-fonts: system-ui as a heading face is reported', () => {
  const b = of(lint(page('<h1>a</h1>', '<style>h1 { font-family: system-ui, sans-serif }</style>\n')), 'banned-fonts');
  assert.equal(b.length, 1, JSON.stringify(b));
});

test('raw-hex: a hex in a Tailwind arbitrary value in class="" is still a colour', () => {
  const r = of(lint(page('<span class="rounded shadow-[inset_0_2px_0_#123456]">x</span>')), 'raw-hex');
  assert.equal(r.length, 1, JSON.stringify(r));
});
