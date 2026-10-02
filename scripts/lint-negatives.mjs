#!/usr/bin/env node
// lint-negatives.mjs — proves every adherence-lint section still fires on the fault it exists for.
//
// The static gate has one expected-PASS fixture (fixtures/golden). That proves the gate does not
// cry wolf; it proves nothing about whether each section can still go red. A refactor that
// silently disabled one check would ship green. This runner holds the other half: a manifest of
// per-section NEGATIVE fixtures (fixtures/lint/<section>/, each a clean base with exactly one
// planted fault), run through `adherence-lint.mjs --json`, each asserted to fire.
//
// Usage:
//   node scripts/lint-negatives.mjs [--manifest <path>] [--only <id>] [--json] [--lint <path>]
//   --manifest defaults to fixtures/lint/manifest.json. Fixture `lock`/`src` paths in the
//   manifest are relative to the manifest's own directory and must stay inside it (an absolute
//   path or a `../` escape is a setup error naming the entry), so a copied fixture tree runs
//   as-is and a fixture can never quietly borrow a lock from elsewhere (fixtures/golden, say).
//   --only runs one fixture by id; registry integrity and the coverage gate still run (they are
//   properties of the manifest, not of the fixtures that ran).
//   --json prints NDJSON only: one {"type":"fixture"} line per fixture run, one {"type":"uncovered"}
//   line per uncovered entry, one {"type":"problem"} line per registry/coverage failure, then one
//   {"type":"summary"} line last.
//   --lint is a TEST SEAM: the lint script to run (default scripts/adherence-lint.mjs). It exists
//   so this runner's own behaviour can be proved against a modified or broken lint copy without
//   touching the real one. Normal use never passes it.
//
// Read-only: spawns adherence-lint.mjs (which writes nothing) and reads the manifest. Nothing
// is written anywhere.
//
// Exit codes (CONTRACT.md):
//   0 = every fixture passed, the registry agrees, every registered section is accounted for
//   1 = any fixture failed, a manifest section/level the registry does not have, or a
//       registered section with neither a fixture nor an `uncovered` entry
//   2 = setup/usage error (bad args, manifest unreadable or malformed, a lock/src escaping the
//       manifest directory, adherence-lint.mjs missing or its --list-sections unreadable,
//       --only id unknown) — and any fixture BLOCKED: lint exited 2, died on a signal, or
//       printed no parseable NDJSON ending in a summary line. A broken gate is not a section
//       that stopped firing; reporting it as a fixture FAIL (exit 1) would send someone to fix
//       a fixture when the thing to fix is the lint. 2 wins over 1 when both occur.
//
// Manifest shape (fixtures/lint/manifest.json):
//   { "fixtures": [ { id, section, level, lock, src, minCount?, tolerate?, expectExit?, planted? } ],
//     "uncovered": [ { section, reason } ] }
//
// Per fixture, all must hold:
//   1. >= minCount (default 1) findings with the declared section AND level, on a file under
//      `src`. Lint labels its own inputs with pseudo-paths ("(src)", "(lock)", the lock's
//      basename, `screen "<id>"`) and rewrites every scanned file relative to --src, so the only
//      finding that is NOT about this fixture is one carrying an absolute path outside `src`
//      (e.g. an engine-level assets/tokens.css): those do not count.
//   2. no finding whose section is outside {section} ∪ tolerate — the owned-family rule. Why a
//      family and not "exactly these findings": asserting the full finding list makes every
//      wording change in lint break a fixture, so the suite rots into being regenerated rather
//      than read. Asserting nothing about other sections lets a fixture that fires everything
//      pass while testing nothing. The family is the precise middle: the planted section must
//      fire, and anything else that fires must be named up front as expected collateral.
//      A finding at another LEVEL of the declared section is inside the family. Tolerated
//      findings that DID fire are counted on the PASS line ("2 tolerated (css-vars)"), so a
//      fixture that leans on its tolerate list never reads the same as a clean one.
//   3. lint's exit code equals expectExit (default: 1 for an ERROR fixture, 0 for WARN/SKIP).
// Over the whole manifest:
//   4. registry integrity: every section named anywhere (fixture section, tolerate, uncovered)
//      is in `adherence-lint.mjs --list-sections --json`, and every declared level is one that
//      section can emit per that registry. A fixture naming a section or level the gate does not
//      have would otherwise be the classic silent pass: it asserts something no run can produce.
//      A section whose registry levels include a dynamic(...) entry (its level is chosen at run
//      time, e.g. from a table) accepts any ERROR/WARN/SKIP and says so on its PASS line.
//   5. coverage gate: every registered section appears as a fixture or in `uncovered`. Missing
//      → FAIL naming the section. `uncovered` entries print as `UNCOVERED <section> — <reason>`
//      on every run — a known gap is visible, never silent — and do not fail the run.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = dirname(SCRIPT_DIR);
const DEFAULT_LINT = join(SCRIPT_DIR, 'adherence-lint.mjs');
const DEFAULT_MANIFEST = join(SKILL_ROOT, 'fixtures', 'lint', 'manifest.json');
const LEVELS = ['ERROR', 'WARN', 'SKIP'];

function usage() {
  return [
    'Usage: node scripts/lint-negatives.mjs [--manifest <path>] [--only <id>] [--json] [--lint <path>]',
    '  --manifest  fixture manifest (default fixtures/lint/manifest.json); lock/src paths in it',
    '              are relative to the manifest\'s directory and must stay inside it',
    '  --only      run one fixture by id (registry integrity + coverage gate still run)',
    '  --json      NDJSON only: fixture / uncovered / problem lines, then one summary line',
    '  --lint      test seam: lint script to run (default scripts/adherence-lint.mjs)',
    '  Exit: 0 all pass · 1 any fixture, registry or coverage failure ·',
    '        2 setup/usage error, or any fixture BLOCKED (lint exited 2 / crashed / no summary)',
  ].join('\n');
}

function die2(msg) {
  console.error(`lint-negatives: ${msg}`);
  console.error('exit 2 (setup/usage error)');
  console.error(usage());
  process.exit(2);
}

function parseArgs(argv) {
  const args = { manifest: DEFAULT_MANIFEST, only: null, json: false, lint: DEFAULT_LINT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--lint') { if (!argv[i + 1]) die2('--lint needs a path'); args.lint = resolve(argv[++i]); }
    else if (a.startsWith('--lint=')) args.lint = resolve(a.slice('--lint='.length));
    else if (a === '--manifest') { if (!argv[i + 1]) die2('--manifest needs a path'); args.manifest = argv[++i]; }
    else if (a.startsWith('--manifest=')) args.manifest = a.slice('--manifest='.length);
    else if (a === '--only') { if (!argv[i + 1]) die2('--only needs a fixture id'); args.only = argv[++i]; }
    else if (a.startsWith('--only=')) args.only = a.slice('--only='.length);
    else if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
    else die2(`unknown argument "${a}"`);
  }
  return args;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonEmptyStr = (v) => typeof v === 'string' && v.trim() !== '';

// Structural validation only. A manifest that is not the documented shape is a setup error
// (exit 2): running a half-understood manifest would report on fixtures it misread. Whether
// the NAMES in it are real is a different question — registry integrity, exit 1.
function loadManifest(path) {
  const baseDir = dirname(path);
  if (!existsSync(path) || !statSync(path).isFile()) die2(`manifest not found: ${path}`);
  let m;
  try { m = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { die2(`manifest ${path} is not valid JSON: ${e.message}`); }
  if (!isObj(m)) die2(`manifest ${path} is not a JSON object`);
  if (!Array.isArray(m.fixtures)) die2('manifest.fixtures must be an array');
  if ('uncovered' in m && !Array.isArray(m.uncovered)) die2('manifest.uncovered must be an array when present');
  const uncovered = m.uncovered ?? [];
  const ids = new Set();
  m.fixtures.forEach((f, i) => {
    const at = `manifest.fixtures[${i}]`;
    if (!isObj(f)) die2(`${at} must be an object`);
    for (const k of ['id', 'section', 'level', 'lock', 'src']) if (!nonEmptyStr(f[k])) die2(`${at}.${k} must be a non-empty string`);
    // Confinement: a fixture is the files beside the manifest. A lock or src reached by an
    // absolute path or a ../ climb tests some other tree under this fixture's name — e.g. a lock
    // pointed at fixtures/golden passes while the fixture's own files are never read.
    for (const k of ['lock', 'src']) {
      if (isAbsolute(f[k]) || !inside(resolve(baseDir, f[k]), baseDir)) {
        die2(`${at}.${k} "${f[k]}" (fixture "${f.id}") resolves outside the manifest directory ${baseDir} — fixture paths must be relative and stay inside it`);
      }
    }
    if (ids.has(f.id)) die2(`${at}.id "${f.id}" is a duplicate`);
    ids.add(f.id);
    if (!LEVELS.includes(f.level)) die2(`${at}.level "${f.level}" is not one of ${LEVELS.join('|')}`);
    if ('minCount' in f && !(Number.isInteger(f.minCount) && f.minCount >= 1)) die2(`${at}.minCount must be an integer >= 1`);
    if ('tolerate' in f && !(Array.isArray(f.tolerate) && f.tolerate.every(nonEmptyStr))) die2(`${at}.tolerate must be an array of section names`);
    if ('expectExit' in f && f.expectExit !== 0 && f.expectExit !== 1) die2(`${at}.expectExit must be 0 or 1`);
  });
  uncovered.forEach((u, i) => {
    const at = `manifest.uncovered[${i}]`;
    if (!isObj(u)) die2(`${at} must be an object`);
    if (!nonEmptyStr(u.section)) die2(`${at}.section must be a non-empty string`);
    // An uncovered entry exists to say WHY. A blank reason is a silent gap with extra steps.
    if (!nonEmptyStr(u.reason)) die2(`${at}.reason must say why "${u.section ?? '?'}" has no fixture`);
  });
  return { fixtures: m.fixtures, uncovered };
}

// The registry, as the gate itself reports it — never a copy kept here, which would drift.
function loadRegistry(lint) {
  if (!existsSync(lint) || !statSync(lint).isFile()) die2(`lint script not found at ${lint}`);
  const r = spawnSync(process.execPath, [lint, '--list-sections', '--json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) die2(`adherence-lint.mjs --list-sections --json exited ${r.status}: ${String(r.stderr ?? '').split('\n')[0]}`);
  const reg = new Map(); // name → { group, levels:[...] }
  try {
    for (const line of String(r.stdout).split('\n')) {
      if (line === '') continue;
      const row = JSON.parse(line);
      if (row.type === 'section' && typeof row.name === 'string') reg.set(row.name, { group: row.group, levels: row.levels ?? [] });
    }
  } catch (e) { die2(`adherence-lint.mjs --list-sections --json printed a non-JSON line: ${e.message}`); }
  if (reg.size === 0) die2('adherence-lint.mjs --list-sections --json listed no sections');
  return reg;
}

// Can `section` emit `level` per the registry? Returns { ok, via } — via names the dynamic
// entry that vouched for it, so a PASS that rests on it says so instead of reading literal.
function levelEmittable(reg, section, level) {
  const levels = reg.get(section)?.levels ?? [];
  if (levels.includes(level)) return { ok: true, via: null };
  const dyn = levels.find((l) => /^dynamic\(/.test(l));
  return dyn ? { ok: true, via: dyn } : { ok: false, via: null };
}

const inside = (child, parent) => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

// Returns { …, blocked } — `blocked` (a reason string) means the lint run itself is unusable,
// so nothing about the fixture was learned; the fixture's assertions are not evaluated.
function runFixture(fx, baseDir, lint) {
  const lock = resolve(baseDir, fx.lock);
  const src = resolve(baseDir, fx.src);
  const family = new Set([fx.section, ...(fx.tolerate ?? [])]);
  const minCount = fx.minCount ?? 1;
  const expectExit = fx.expectExit ?? (fx.level === 'ERROR' ? 1 : 0);
  const out = { id: fx.id, section: fx.section, level: fx.level, count: 0, exit: null, expectExit,
    unexpected: [], tolerated: [], reasons: [], blocked: null };

  const r = spawnSync(process.execPath, [lint, '--lock', lock, '--src', src, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  out.exit = r.status;
  const stderr1 = String(r.stderr ?? '').split('\n').find((l) => l.trim() !== '') ?? '';
  if (r.status === 2 || r.status === null) {
    out.blocked = `lint exited ${r.status === null ? `on signal ${r.signal}` : 2} (setup error)${stderr1 ? `: ${stderr1}` : ''}`;
    return out;
  }
  let rows;
  try { rows = String(r.stdout).split('\n').filter((l) => l !== '').map((l) => JSON.parse(l)); }
  catch (e) { out.blocked = `lint --json printed a non-JSON line (exit ${r.status}): ${e.message}`; return out; }
  if (rows.length === 0 || rows.at(-1)?.type !== 'summary') {
    out.blocked = `lint --json output has no trailing summary line (exit ${r.status})${stderr1 ? `: ${stderr1}` : ''}`;
    return out;
  }
  const findings = rows.filter((x) => x.type === 'finding');

  const onSrc = (f) => !isAbsolute(String(f.file)) || inside(String(f.file), src);
  out.count = findings.filter((f) => f.section === fx.section && f.level === fx.level && onSrc(f)).length;
  if (out.count < minCount) {
    out.reasons.push(`${out.count} findings for ${fx.section} at ${fx.level} (need >= ${minCount})`);
  }
  for (const f of findings) {
    const where = `${f.level} ${f.section} @ ${f.file}${f.line ? ':' + f.line : ''}`;
    if (!family.has(f.section)) out.unexpected.push(where);
    else if (f.section !== fx.section) out.tolerated.push({ section: f.section, finding: where });
  }
  if (out.unexpected.length) {
    out.reasons.push(`${out.unexpected.length} unexpected finding(s) outside {${[...family].join(', ')}}: ${out.unexpected.join('; ')}`);
  }
  if (r.status !== expectExit) out.reasons.push(`exit ${r.status}, expected ${expectExit}`);
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(args.manifest);
  const baseDir = dirname(manifestPath);
  const manifest = loadManifest(manifestPath);
  const reg = loadRegistry(args.lint);
  if (args.only !== null && !manifest.fixtures.some((f) => f.id === args.only)) {
    die2(`--only "${args.only}" matches no fixture id in ${manifestPath}`);
  }

  const lines = []; // human output, printed at the end unless --json
  const records = []; // NDJSON rows
  const problems = []; // registry + coverage failures

  // ---- 4. registry integrity (static, whole manifest)
  const dynamicNotes = new Map(); // fixture id → dynamic entry that vouched for its level
  for (const fx of manifest.fixtures) {
    if (!reg.has(fx.section)) {
      problems.push({ kind: 'registry', section: fx.section, detail: `fixture "${fx.id}" names section "${fx.section}", which adherence-lint does not register` });
    } else {
      const lv = levelEmittable(reg, fx.section, fx.level);
      if (!lv.ok) {
        problems.push({ kind: 'registry', section: fx.section, detail: `fixture "${fx.id}" expects ${fx.level}, but ${fx.section} can only emit ${reg.get(fx.section).levels.join(', ')}` });
      } else if (lv.via) dynamicNotes.set(fx.id, lv.via);
    }
    for (const t of fx.tolerate ?? []) {
      if (!reg.has(t)) problems.push({ kind: 'registry', section: t, detail: `fixture "${fx.id}" tolerates section "${t}", which adherence-lint does not register` });
    }
  }
  for (const u of manifest.uncovered) {
    if (!reg.has(u.section)) problems.push({ kind: 'registry', section: u.section, detail: `uncovered entry names section "${u.section}", which adherence-lint does not register` });
  }

  // ---- 5. coverage gate
  const fixtureSections = new Set(manifest.fixtures.map((f) => f.section));
  const uncoveredSections = new Map();
  for (const u of manifest.uncovered) {
    if (uncoveredSections.has(u.section)) problems.push({ kind: 'coverage', section: u.section, detail: `"${u.section}" is listed in uncovered twice` });
    uncoveredSections.set(u.section, u.reason);
    if (fixtureSections.has(u.section)) problems.push({ kind: 'coverage', section: u.section, detail: `"${u.section}" has a fixture AND an uncovered entry — one of them is wrong` });
  }
  const missing = [...reg.keys()].filter((s) => !fixtureSections.has(s) && !uncoveredSections.has(s));
  for (const s of missing) problems.push({ kind: 'coverage', section: s, detail: `registered section "${s}" has neither a fixture nor an uncovered entry` });

  // ---- 1-3. run the fixtures
  const toRun = args.only === null ? manifest.fixtures : manifest.fixtures.filter((f) => f.id === args.only);
  const results = toRun.map((fx) => runFixture(fx, baseDir, args.lint));
  for (const r of results) {
    const result = r.blocked ? 'BLOCKED' : r.reasons.length === 0 ? 'PASS' : 'FAIL';
    const via = dynamicNotes.get(r.id);
    const tolSections = [...new Set(r.tolerated.map((t) => t.section))];
    records.push({ type: 'fixture', id: r.id, section: r.section, level: r.level, result,
      count: r.count, exit: r.exit, expectExit: r.expectExit, unexpected: r.unexpected,
      tolerated: r.tolerated.map((t) => t.finding), reasons: r.blocked ? [r.blocked] : r.reasons, levelVia: via ?? null });
    if (result === 'PASS') {
      const tol = r.tolerated.length ? `, ${r.tolerated.length} tolerated (${tolSections.join(', ')})` : '';
      lines.push(`PASS ${r.id} (${r.level} ×${r.count}, exit ${r.exit}, 0 unexpected${tol}${via ? `, level via ${via}` : ''})`);
    } else if (result === 'BLOCKED') lines.push(`BLOCKED ${r.id} — ${r.blocked}`);
    else lines.push(`FAIL ${r.id} — ${r.reasons.join(' · ')}`);
  }

  lines.push('');
  lines.push('Registry integrity:');
  const regProblems = problems.filter((p) => p.kind === 'registry');
  if (regProblems.length === 0) {
    const named = new Set([...manifest.fixtures.flatMap((f) => [f.section, ...(f.tolerate ?? [])]), ...manifest.uncovered.map((u) => u.section)]);
    lines.push(`  ok — ${named.size} section name(s) in the manifest, all registered; every declared level is one its section can emit`);
  } else for (const p of regProblems) lines.push(`  FAIL ${p.detail}`);

  lines.push('');
  lines.push('Coverage:');
  const covered = [...reg.keys()].filter((s) => fixtureSections.has(s) || uncoveredSections.has(s)).length;
  lines.push(`  ${covered}/${reg.size} registered sections accounted for (per section, not per rule) — ${[...reg.keys()].filter((s) => fixtureSections.has(s)).length} with a fixture, ${[...reg.keys()].filter((s) => uncoveredSections.has(s)).length} uncovered`);
  for (const p of problems.filter((x) => x.kind === 'coverage')) lines.push(`  FAIL ${p.detail}`);
  for (const [section, reason] of uncoveredSections) {
    lines.push(`  UNCOVERED ${section} — ${reason}`);
    records.push({ type: 'uncovered', section, reason });
  }
  for (const p of problems) records.push({ type: 'problem', kind: p.kind, section: p.section, detail: p.detail });

  const blockedFixtures = results.filter((r) => r.blocked).length;
  const failedFixtures = results.filter((r) => !r.blocked && r.reasons.length > 0).length;
  const pass = blockedFixtures === 0 && failedFixtures === 0 && problems.length === 0;
  const verdict = blockedFixtures ? 'BLOCKED' : pass ? 'PASS' : 'FAIL';
  const summary = `${results.length} fixtures, ${uncoveredSections.size} uncovered`;
  const why = pass ? '' : ` (${[blockedFixtures ? `${blockedFixtures} fixture(s) blocked: the lint run itself failed` : null,
    failedFixtures ? `${failedFixtures} fixture(s) failed` : null,
    regProblems.length ? `${regProblems.length} registry problem(s)` : null,
    problems.length - regProblems.length ? `${problems.length - regProblems.length} coverage problem(s)` : null].filter(Boolean).join(', ')})`;

  // Relative when the manifest sits under the working directory, absolute otherwise — a
  // climb of ../../ segments names the same file less legibly than its absolute path.
  const relManifest = relative(process.cwd(), manifestPath);
  const shownManifest = relManifest && !relManifest.startsWith('..') && !isAbsolute(relManifest) ? relManifest : manifestPath;

  if (args.json) {
    for (const rec of records) console.log(JSON.stringify(rec));
    console.log(JSON.stringify({ type: 'summary', result: verdict, fixtures: results.length,
      failed: failedFixtures, blocked: blockedFixtures, uncovered: uncoveredSections.size, problems: problems.length, sections: reg.size,
      manifest: shownManifest }));
  } else {
    console.log('lint-negatives — per-section negative fixtures for adherence-lint');
    console.log(`  manifest: ${shownManifest}  (${manifest.fixtures.length} fixture(s), ${manifest.uncovered.length} uncovered)`);
    if (args.lint !== DEFAULT_LINT) console.log(`  lint:     ${args.lint}  (--lint test seam, not the engine's own gate)`);
    console.log(`  registry: ${reg.size} section(s) from adherence-lint.mjs --list-sections\n`);
    for (const l of lines) console.log(l);
    console.log(`\nRESULT: ${verdict} — ${summary}${why}`);
  }
  process.exitCode = blockedFixtures ? 2 : pass ? 0 : 1;
}

try {
  main();
} catch (e) {
  console.error(`lint-negatives crashed: ${e.stack || e}`);
  console.error('exit 2 (setup/usage error)');
  process.exit(2);
}
