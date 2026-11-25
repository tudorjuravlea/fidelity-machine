// The guidance must not teach what the lint forbids.
//   node --test "fixtures/docs/*.test.mjs"
// A reference is what a model reads before it writes a screen; the lint is what judges the screen
// after. When the first shows `transition: all` as the way to do it and the second fails it, the
// loop pays for the contradiction on every screen. So every piece of code the guidance shows goes
// through the real lint (no pattern is copied here: a new lint section joins by being named in
// DOCTRINE), and a finding is allowed only where the guidance is showing what NOT to do.
//
// What is read: fenced css/html/js/jsx/tsx blocks, inline spans that are CSS declarations
// (`prop: value; …`), and inline spans that are an HTML tag, in every teaching document: the
// references, the skill template and scaffold, the guide, the FAQ and the README.
// What counts as "showing what not to do": the line itself, the three lines above a fence, or the
// heading the code sits under says so (never, not, avoid, banned, fails, wrong, instead of, ERROR…).
// Only an ERROR is a contradiction: a WARN is work the lint lets through.
//
// What this cannot see: advice given in words ("animate everything at once"), a bare value outside
// a declaration (`ease-in`, `#F5F5F5`), and a contradiction with a rule that depends on the lock
// (an off-scale spacing value, an unknown token name): those sections judge an example against
// the fixture's tokens, not against doctrine, and are left out by name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LINT = path.join(ROOT, 'scripts', 'adherence-lint.mjs');
const LOCK = path.join(ROOT, 'fixtures', 'motion', 'design-lock.json'); // it has motion tokens, so raw-motion is live

// The sections that forbid a construct in ANY design system. The rest judge against one lock.
const DOCTRINE = ['raw-hex', 'transition-all', 'raw-motion', 'banned-fonts', 'placeholders', 'radius-arithmetic', 'scheme-mixing', 'a11y', 'export-artifacts'];

// Findings about a whole file, which a fragment cannot satisfy: an example is a few lines of one,
// and the inline spans of a document are strangers put in one file. Each is the lint's own wording;
// one the lint no longer says fails the test.
const WHOLE_FILE = ['no :focus-visible rule', 'heading jumps h'];

const walk = (dir) => readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.md') ? [`${dir}/${e.name}`] : []));
const TEACHING = [...walk('references'), ...walk('skill-scaffold'), 'skill-template.md', 'GUIDE.md', 'FAQ.md', 'README.md'];

const FORBIDS = /\b(never|not|no|don['’]?t|do not|cannot|avoid|ban(?:ned|s)?|forbid(?:s|den)?|fails?|failing|wrong|bad|broken|instead of|rather than|refus(?:e|es|ed)|reject(?:s|ed)?|anti-pattern|tell|tells|ERROR|caught|catches|flag(?:s|ged)?|break(?:s|ing)?|hardcoded)\b|✗|❌/i;
const DECL = /^[a-z-]+\s*:\s*[^{}<>]+$/;
const EXT = { css: 'css', scss: 'css', html: 'html', js: 'js', javascript: 'js', jsx: 'jsx', tsx: 'tsx' };

// Every example a document shows, as lint input: [{ file, body, at: [{ line, context }] }].
function examples(doc) {
  const lines = readFileSync(path.join(ROOT, doc), 'utf8').split('\n');
  const slug = doc.replace(/[/.]/g, '_');
  const css = [], html = [], files = [];
  let fence = null, heading = '';
  lines.forEach((text, i) => {
    const mark = text.match(/^\s*```(\w*)/);
    if (mark) {
      if (!fence) { fence = { lang: mark[1].toLowerCase(), line: i + 1, body: [], context: `${heading} ${lines.slice(Math.max(0, i - 3), i).join(' ')}` }; return; }
      if (EXT[fence.lang]) {
        const f = fence;
        files.push({ file: `${slug}_L${f.line}.${EXT[f.lang]}`, body: `${f.body.join('\n')}\n`, at: f.body.map((b, k) => ({ line: f.line + 1 + k, context: `${f.context} ${b}` })) });
      }
      fence = null;
      return;
    }
    if (fence) { fence.body.push(text); return; }
    if (/^#+\s/.test(text)) heading = text;
    for (const m of text.matchAll(/`([^`]+)`/g)) {
      const parts = m[1].split(';').map((s) => s.trim()).filter(Boolean);
      if (parts.length && parts.every((p) => DECL.test(p))) css.push({ src: `.l${i + 1} { ${parts.join('; ')}; }`, line: i + 1, context: `${heading} ${text}` });
      else if (/^<[a-z][^>]*>/i.test(m[1])) html.push({ src: m[1], line: i + 1, context: `${heading} ${text}` });
    }
  });
  if (css.length) files.push({ file: `${slug}_inline.css`, body: `${css.map((c) => c.src).join('\n')}\n`, at: css });
  if (html.length) files.push({ file: `${slug}_inline.html`, body: `${html.map((h) => h.src).join('\n')}\n`, at: html });
  return files.map((f) => ({ ...f, doc }));
}

function contradictions() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'doctrine-'));
  try {
    const src = path.join(tmp, 'examples');
    mkdirSync(src);
    const all = TEACHING.flatMap(examples);
    for (const f of all) writeFileSync(path.join(src, f.file), f.body);
    const r = spawnSync(process.execPath, [LINT, '--lock', LOCK, '--src', src, '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.ok(r.status === 0 || r.status === 1, `the lint could not look (exit ${r.status}): ${r.stderr.slice(0, 300)}`);
    const found = [];
    const skipped = [];
    for (const row of r.stdout.split('\n').filter(Boolean)) {
      const j = JSON.parse(row);
      if (j.type !== 'finding' || !DOCTRINE.includes(j.section)) continue;
      if (j.level === 'SKIP') { skipped.push(j.section); continue; }
      // A WARN is allowed work: the lint exits 0 on it.
      if (j.level !== 'ERROR' || WHOLE_FILE.some((w) => String(j.detail).includes(w))) continue;
      const f = all.find((x) => x.file === path.basename(String(j.file)));
      if (!f) continue; // a finding on the lock itself, not on an example
      const at = f.at[(j.line ?? 1) - 1] ?? f.at[0];
      found.push({ doc: f.doc, line: at.line, section: j.section, level: j.level, detail: String(j.detail ?? '').slice(0, 120), shownAsWrong: FORBIDS.test(at.context) });
    }
    return { examples: all.reduce((n, f) => n + f.at.length, 0), found, skipped };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const result = contradictions();

test('the teaching documents are enrolled by walking the tree, and the reader finds their examples', () => {
  assert.ok(TEACHING.length >= 35, `only ${TEACHING.length} documents`);
  for (const doc of TEACHING) assert.ok(statSync(path.join(ROOT, doc)).isFile());
  assert.ok(result.examples >= 60, `only ${result.examples} example lines were read: the reader has gone blind`);
});

test('every doctrine section is a section the lint has, and none of them skipped on this lock', () => {
  const src = readFileSync(LINT, 'utf8');
  for (const s of DOCTRINE) assert.ok(src.includes(`'${s}'`), `adherence-lint.mjs has no section '${s}'`);
  for (const w of WHOLE_FILE) assert.ok(src.includes(w), `the lint no longer says "${w}": delete it from WHOLE_FILE`);
  assert.deepEqual(result.skipped, [], 'a skipped section judges nothing');
});

// Two examples the guidance shows as wrong on purpose. If the lint stops firing on either, the
// examples no longer reach it, and the test below would pass on anything.
const CANARIES = [
  { doc: 'GUIDE.md', section: 'raw-hex', what: 'the hardcoded green the guide has the reader plant' },
  { doc: 'references/motion-craft.md', section: 'transition-all', what: 'the `transition: all` row of its never-ship table' },
];

test('the lint fires on the examples the guidance shows as wrong on purpose (the reader is not blind)', () => {
  for (const c of CANARIES) {
    assert.ok(result.found.some((f) => f.doc === c.doc && f.section === c.section && f.shownAsWrong), `${c.doc}: ${c.what} no longer trips ${c.section}`);
  }
});

test('no document teaches what the lint forbids', () => {
  const taught = result.found.filter((f) => !f.shownAsWrong).map((f) => `${f.doc}:${f.line} shows code the lint fails (${f.level} ${f.section}: ${f.detail}) and does not say it is wrong`);
  assert.deepEqual(taught, []);
});
