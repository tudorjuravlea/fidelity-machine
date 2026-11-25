// What the documents say about the tree, held to the tree.
//   node --test "fixtures/docs/*.test.mjs"
// A document is read more often than the code it describes, and nothing fails when it goes stale:
// a command that no longer parses, a file that moved, "three rules" beside a list of four. Every
// root document except the changelog (history names things that are gone, rightly) is enrolled
// by listing the root, so a new one is held from its first commit.
//
// What is held:
//   commands   every `x.mjs --flag` names a script that exists and a flag its source knows
//   paths      every engine path in backticks exists
//   counts     every "<number> <rules|rounds|scripts|…>" is bound to a measure below and equals it;
//              a count nobody bound fails, and so does a binding that no sentence uses any more
//   the tree   CONTRACT.md's tree diagram and the real one name the same folders, scripts and
//              references
//   and four sentences of the README: its steps, its Node floor, its exit codes, its gate order
//
// What this cannot see: whether a sentence is TRUE in any way that is not a name, a flag, a path,
// a count or an order. "The lint catches it in milliseconds" is not measured here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => existsSync(path.join(ROOT, rel));
const isDir = (rel) => exists(rel) && statSync(path.join(ROOT, rel)).isDirectory();
const list = (rel) => readdirSync(path.join(ROOT, rel)).filter((n) => !n.startsWith('.') && !/ \d+(\.\w+)?$/.test(n)).sort();

const DOCS = list('.').filter((n) => n.endsWith('.md') && n !== 'CHANGELOG.md');
const TOP_DIRS = list('.').filter((n) => isDir(n) && n !== 'node_modules');
const SCRIPTS = list('scripts').filter((n) => n.endsWith('.mjs'));
const where = (doc, text, index) => `${doc}:${text.slice(0, index).split('\n').length}`;

test('the documents are enrolled by listing the root, and the floor holds', () => {
  assert.ok(DOCS.length >= 7, `only ${DOCS.length} documents found: ${DOCS.join(', ')}`);
  for (const must of ['README.md', 'CONTRACT.md', 'CONTRIBUTING.md', 'GUIDE.md']) assert.ok(DOCS.includes(must), `${must} is not enrolled`);
});

// ---------------------------------------------------------------- commands

// A script whose parser takes any --flag (`args[a.slice(2)] = …`) cannot be disproved by a search.
const GENERIC_PARSER = /\.slice\(2\)\s*\]?\s*\]\s*=|\[\s*[a-z]+\.slice\(2\)\s*\]\s*=/;
// Flags that belong to the program in front of the script, not to the script.
const NOT_THE_SCRIPTS = new Set(['--test', '--import', '--check', '--package-lock-only']);

// Every command the document shows: a backtick span or a fenced line holding a concrete `x.mjs`.
function commands(doc) {
  const text = read(doc);
  const out = [];
  let fenced = false;
  text.split('\n').forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    const pieces = fenced ? [line.replace(/\s#.*$/, '')] : [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    for (const piece of pieces) {
      const names = [...piece.matchAll(/[\w<>*{}./-]*\.mjs\b/g)].filter((m) => !/[<>*{}]/.test(m[0]));
      names.forEach((m, k) => {
        const end = names[k + 1]?.index ?? piece.length;
        const tail = piece.slice(m.index + m[0].length, end);
        const prefix = piece.slice(0, m.index);
        out.push({ at: `${doc}:${i + 1}`, token: m[0], flags: tail.match(/(?<![\w-])--[a-z][a-z0-9-]*/g) ?? [], nodeFlags: /node\s+(--\S+\s+)+["']?$/.test(prefix) });
      });
    }
  });
  return out;
}
function locate(given) {
  // `~/.claude/fidelity-machine/scripts/x.mjs` and `ENGINE/scripts/x.mjs` are this tree, installed.
  const parts = given.split('/');
  const from = parts.findIndex((seg) => TOP_DIRS.includes(seg));
  const token = from > 0 ? parts.slice(from).join('/') : given;
  if (token.includes('/')) return exists(token) ? token : null;
  if (SCRIPTS.includes(token)) return `scripts/${token}`;
  const hit = (dir) => {
    for (const n of list(dir)) {
      const rel = `${dir}/${n}`;
      if (n === 'node_modules') continue;
      if (isDir(rel)) { const found = hit(rel); if (found) return found; } else if (n === token) return rel;
    }
    return null;
  };
  for (const dir of TOP_DIRS) { const found = hit(dir); if (found) return found; }
  return null;
}

test('every command a document shows names a script that exists and flags its source knows', () => {
  const wrong = [];
  let seen = 0;
  for (const doc of DOCS) {
    for (const c of commands(doc)) {
      seen += 1;
      const file = locate(c.token);
      if (!file) { wrong.push(`${c.at} names ${c.token}, which is not in the tree`); continue; }
      const src = read(file);
      if (GENERIC_PARSER.test(src)) continue;
      for (const flag of c.flags) {
        if (NOT_THE_SCRIPTS.has(flag) && !src.includes(`'${flag}'`)) continue;
        if (!src.includes(flag)) wrong.push(`${c.at} shows ${c.token} ${flag}, and ${file} never mentions ${flag}`);
      }
    }
  }
  assert.ok(seen >= 60, `only ${seen} commands were read: the reader has gone blind`);
  assert.deepEqual(wrong, []);
});

// ---------------------------------------------------------------- paths

// Paths a document names that are not in a fresh tree, each with its reason.
// An excuse no document uses any more fails the test.
const NOT_IN_THE_TREE = new Map([]);

test('every engine path in backticks exists', () => {
  const wrong = [];
  const used = new Set();
  let seen = 0;
  const rootFiles = new Set(list('.').filter((n) => !isDir(n)));
  for (const doc of DOCS) {
    const text = read(doc);
    for (const m of text.matchAll(/`([^`\s]+)`/g)) {
      let token = m[1].replace(/[,.;:]+$/, '').replace(/:\d+(-\d+)?$/, '').replace(/#[\w-]+$/, '');
      if (/[<>*{}…|]/.test(token)) continue;
      // The template describes a skill's tree; only what it marks as the engine's is ours to hold.
      const marked = /^(?:\$?ENGINE|~\/\.claude\/fidelity-machine)\//.test(token);
      if (doc === 'skill-template.md' && !marked) continue;
      token = token.replace(/^(?:\$?ENGINE|~\/\.claude\/fidelity-machine)\//, '');
      const head = token.split('/')[0];
      const enginePath = (token.includes('/') && TOP_DIRS.includes(head)) || (!token.includes('/') && /^[A-Z][A-Z-]+(\.md)?$/.test(token) && /\.md$|^(LICENSE|NOTICE)$/.test(token));
      if (!enginePath && !rootFiles.has(token)) continue;
      seen += 1;
      const excused = [...NOT_IN_THE_TREE.keys()].find((k) => token === k || token.startsWith(`${k}/`));
      if (excused) { used.add(excused); continue; }
      if (!exists(token)) wrong.push(`${where(doc, text, m.index)} names \`${token}\`, which is not in the tree`);
    }
  }
  assert.deepEqual(wrong, []);
  assert.ok(seen >= 40, `only ${seen} paths were read: the reader has gone blind`);
  for (const k of NOT_IN_THE_TREE.keys()) assert.ok(used.has(k), `the excuse for ${k} is used by no document: delete it`);
});

// ---------------------------------------------------------------- counts

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const NOUNS = 'scripts?|rules?|gates?|checks?|references?|sections?|fixtures?|tests?|suites?|exit codes?|rounds?|commands?|tools?|presets?|templates?|lanes?|verbs?|documents?';
const COUNT = new RegExp(`(?<![\\w.:/#-]|exit |· )(\\d+|${WORDS.slice(2).join('|')})[ -](?:[a-z-]+ )?(${NOUNS})\\b(?!\\.mjs)`, 'gi');
const stated = (s) => (/^\d+$/.test(s) ? Number(s) : WORDS.indexOf(s.toLowerCase()));

const contributingRules = () => (read('CONTRIBUTING.md').match(/^## \d+\. /gm) ?? []).length;
// The loop cap has one home: CONTRACT.md's "Loop control" section.
const loopCap = () => {
  const text = read('CONTRACT.md');
  const section = text.slice(text.search(/^##+ .*Loop control/m));
  const m = section.match(/(\d+) rounds/);
  assert.ok(m, 'CONTRACT.md "Loop control" no longer states a number of rounds');
  return Number(m[1]);
};

const shipGates = () => {
  const text = read('CONTRACT.md');
  const section = text.slice(text.search(/^## Three-gate ship ordering/m));
  return (section.slice(0, section.indexOf('\n## ', 4)).match(/^\d+\. \*\*/gm) ?? []).length;
};

// Every count a document states about the tree, and what it is measured against.
const BOUND = [
  { doc: 'README.md', phrase: /three rules/i, measure: contributingRules, against: 'the numbered rules in CONTRIBUTING.md' },
  { doc: 'CONTRIBUTING.md', phrase: /three rules/i, measure: contributingRules, against: 'its own numbered rules' },
  { doc: 'README.md', phrase: /four rounds/i, measure: loopCap, against: 'CONTRACT.md "Loop control"' },
  { doc: 'skill-template.md', phrase: /4 rounds/i, measure: loopCap, against: 'CONTRACT.md "Loop control"' },
  { doc: 'CONTRACT.md', phrase: /4 rounds/i, measure: loopCap, against: 'its own "Loop control"' },
  { doc: 'CONTRACT.md', phrase: /three-gate/i, measure: shipGates, against: 'the numbered gates under its "Three-gate ship ordering"' },
];

test('every count a document states about the tree is bound to a measure and equals it', () => {
  const wrong = [];
  const used = new Set();
  for (const doc of DOCS) {
    const text = read(doc);
    for (const m of text.matchAll(COUNT)) {
      const binding = BOUND.find((b) => b.doc === doc && b.phrase.test(m[0]));
      if (!binding) { wrong.push(`${where(doc, text, m.index)} states "${m[0]}" and nothing measures it: bind it in BOUND or say it without a number`); continue; }
      used.add(binding);
      const real = binding.measure();
      if (stated(m[1]) !== real) wrong.push(`${where(doc, text, m.index)} states "${m[0]}"; ${binding.against} says ${real}`);
    }
  }
  assert.deepEqual(wrong, []);
  for (const b of BOUND) assert.ok(used.has(b), `the binding for ${b.doc} ${b.phrase} matches no sentence any more: delete it`);
});

// ---------------------------------------------------------------- CONTRACT.md's tree diagram

function contractTree() {
  const text = read('CONTRACT.md');
  const start = text.indexOf('```\n~/');
  assert.ok(start !== -1, 'CONTRACT.md has no tree diagram');
  // The engine's block only: the per-skill tree under it describes folders that are not here.
  return text.slice(start, text.indexOf('\n\n', start));
}

test('CONTRACT.md\'s tree diagram and the real tree name the same folders', () => {
  const tree = contractTree();
  const listed = new Set([...tree.matchAll(/^[├└]── ([\w.-]+(?:\/[\w.-]+)?)\//gm)].map((m) => m[1]));
  // Two levels for the folders that hold one thing per subfolder; one level for the rest.
  const real = new Set();
  for (const dir of TOP_DIRS) {
    if (dir === 'fixtures' || dir === 'runtime') for (const sub of list(dir)) { if (isDir(`${dir}/${sub}`)) real.add(`${dir}/${sub}`); }
    else real.add(dir);
  }
  assert.deepEqual([...listed].filter((d) => !real.has(d)), [], 'the diagram names folders that are not in the tree');
  assert.deepEqual([...real].filter((d) => !listed.has(d)), [], 'the tree has folders the diagram does not name');
});

test('CONTRACT.md\'s tree diagram names every reference, and no reference that is gone', () => {
  const tree = contractTree();
  const block = tree.slice(tree.indexOf('── references/'));
  const real = new Set(list('references').filter((n) => n.endsWith('.md')));
  const listed = new Set();
  for (const name of block.match(/[a-z0-9][a-z0-9*-]*\.md\b/g) ?? []) {
    if (!name.includes('*')) { listed.add(name); continue; }
    const glob = new RegExp(`^${name.replace(/\./g, '\\.').replace(/\*/g, '[a-z0-9-]+')}$`);
    const hits = [...real].filter((n) => glob.test(n));
    assert.ok(hits.length > 0, `the diagram's ${name} matches no reference`);
    for (const h of hits) listed.add(h);
  }
  assert.deepEqual([...listed].filter((n) => !real.has(n)), [], 'the diagram names references that are not in references/');
  assert.deepEqual([...real].filter((n) => !listed.has(n)), [], 'references/ has files the diagram does not name');
});

// ---------------------------------------------------------------- four sentences of the README

test('the README\'s installation steps run 1 to N with no gap, and every "Steps A to B" elsewhere falls inside', () => {
  const steps = [...read('README.md').matchAll(/^### Step (\d+):/gm)].map((m) => Number(m[1]));
  assert.ok(steps.length >= 4, 'the README no longer has numbered steps');
  assert.deepEqual(steps, steps.map((_, i) => i + 1));
  for (const doc of DOCS) {
    for (const m of read(doc).matchAll(/Steps (\d+) (?:to|through|-) (\d+)/g)) {
      assert.ok(Number(m[1]) >= 1 && Number(m[2]) <= steps.length, `${doc} points at "${m[0]}"; the README has steps 1 to ${steps.length}`);
    }
  }
});

test('the Node version the README asks for is the one setup-check enforces, and the public build runs at least it', () => {
  const asked = read('README.md').match(/Node\.js version (\d+) or later/);
  const enforced = read('scripts/setup-check.mjs').match(/nodeMajor >= (\d+)/);
  assert.ok(asked && enforced, 'the README or setup-check no longer states a Node floor');
  assert.equal(Number(asked[1]), Number(enforced[1]));
  const built = [...read('.github/workflows/ci.yml').matchAll(/node-version: (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(built.length > 0 && built.every((v) => v >= Number(enforced[1])), `the build runs Node ${built.join(', ')}`);
  const engines = JSON.parse(read('package.json')).engines?.node;
  if (engines) assert.match(engines, new RegExp(`>=\\s*${enforced[1]}\\b`));
});

test('every exit code the README explains is in CONTRACT.md\'s table', () => {
  const sentence = read('README.md').split('\n').find((l) => /use the same exit codes/.test(l));
  assert.ok(sentence, 'the README no longer explains the exit codes');
  const named = [...sentence.matchAll(/`(\d+)` =/g)].map((m) => Number(m[1]));
  assert.ok(named.length >= 3);
  const text = read('CONTRACT.md');
  const section = text.slice(text.search(/^## Exit codes/m));
  const table = new Set([...section.slice(0, section.indexOf('\n## ', 4)).matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => Number(m[1])));
  for (const code of named) assert.ok(table.has(code), `the README explains exit code ${code}; CONTRACT.md's table has ${[...table].join(', ')}`);
  assert.match(sentence, /CONTRACT\.md/, 'the sentence names three codes of several: it must point at the full table');
});

test('the gate order the README states is the order verify.mjs runs them in', () => {
  const sentence = read('README.md').split('\n').find((l) => /the pipeline runs, in fixed order/.test(l));
  assert.ok(sentence, 'the README no longer states the gate order');
  const said = [['adherence-lint.mjs', /compliance lint/], ['geometry.mjs', /geometry gate/], ['layout-audit.mjs', /layout self-consistency gate/], ['diff.mjs', /pixel diff against/], ['colour-census.mjs', /colour census/]]
    .map(([script, words]) => ({ script, at: sentence.search(words) }));
  for (const s of said) assert.ok(s.at !== -1, `the README's order sentence no longer names the gate that is ${s.script}`);
  const readme = [...said].sort((a, b) => a.at - b.at).map((s) => s.script);
  const src = read('scripts/verify.mjs');
  const run = said.map((s) => ({ script: s.script, at: src.indexOf(`'${s.script}'`) }));
  for (const r of run) assert.ok(r.at !== -1, `verify.mjs no longer names ${r.script}`);
  assert.deepEqual(readme, run.sort((a, b) => a.at - b.at).map((r) => r.script));
});
