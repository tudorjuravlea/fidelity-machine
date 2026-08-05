#!/usr/bin/env node
/**
 * release-check.mjs — publish-readiness gate for fidelity-machine.
 *
 * The engine is design-system-agnostic and may be published. Brand-specific
 * content belongs ONLY in per-system skills (~/.claude/skills/<system>/), so
 * before any public release the engine tree must contain zero brand terms,
 * zero user-specific absolute paths, and zero machine-generated artifacts.
 * This script is that checklist, executable. It is read-only on the engine;
 * the only thing it writes is a throwaway temp dir for the install simulation.
 *
 * Checks (each failure prints a concrete `Fix:` line):
 *   1. brand-leakage   banned terms (literal list, optionally extended via --ban /
 *                      --ban-file) PLUS pattern-class scanning for credential shapes,
 *                      local user paths and private hosts — every text file, file:line
 *   2. clean-tree      DEFAULT-DENY: only allowlisted suffixes ship (.mjs/.md/.json/
 *                      .cjs/.css/.html + reviewed fixtures/golden/reference/*.png
 *                      verified by magic bytes + size cap); symlinks fail; plus the
 *                      named assertions (no .env*, *.log, .DS_Store, .render/ or
 *                      .report/ artifacts, no font binaries)
 *   3. completeness    every script/reference CONTRACT.md names exists; package.json
 *                      deps and script imports agree in both directions
 *   4. size-budget     engine minus node_modules under 5 MB (warn-only)
 *   5. fresh-install   copy engine (minus node_modules) to a temp dir, npm install
 *                      --omit=dev, then run setup-check.mjs there — consumer simulation
 *
 * Exit codes (CONTRACT.md): 0 = release-ready · 1 = findings (fix list printed)
 * · 2 = setup/usage error.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(SCRIPT_DIR, '..');

const SIZE_BUDGET_MB = 5;
const MAX_HIT_LINES = 200;
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.otf']);
const FONT_EXT = new Set(['.ttf', '.otf', '.woff', '.woff2']);
// Per-skill docs CONTRACT.md may name that do NOT live in the engine tree.
const PER_SKILL_DOCS = new Set(['SKILL.md', 'INDEX.md', 'README.md', 'CLAUDE.md', 'DESIGN.md', 'MEMORY.md']);
const REQUIRED_TOP_LEVEL = ['CONTRACT.md', 'design-lock.schema.json', 'skill-template.md', 'package.json'];

// Default ban-list, base64-encoded ON PURPOSE: the banned vocabulary is itself
// brand-specific, so keeping it in plain text would make this checker the last
// leak in the tree. Encoded, the script passes its own scan. Decode to inspect:
//   node -p "JSON.parse(Buffer.from('<blob>','base64').toString())"
const DEFAULT_BAN_B64 = 'WyJyYWlmZmVpc2VuIiwicmItbW9iaWxlIiwicmJybyIsInVkcyIsImFtYWxpYSIsIi9Vc2Vycy90dWRvciJd';

const HELP = `release-check.mjs — publish-readiness gate for fidelity-machine

Scans the WHOLE engine tree (node_modules excluded) and refuses release while
any brand-specific or machine-specific content remains. Read-only on the
engine; writes only a throwaway temp dir for the install simulation.

Usage:
  node scripts/release-check.mjs [--ban <term>]... [--ban-file <path>] [--skip-fresh] [--help]

Flags:
  --ban <term>       add a term to the banned-content list (repeatable). Terms of
                     1-4 alphanumeric chars match whole words only; longer terms
                     match as substrings, case-insensitive. The default list ships
                     base64-encoded so this file stays clean under its own scan.
  --ban-file <path>  newline-delimited extra ban terms merged into the same list
                     (blank lines and #-comment lines skipped). The file must live
                     OUTSIDE the engine tree — the ban vocabulary must never ship;
                     an in-tree path is refused (exit 2).
  --skip-fresh       skip the fresh-environment install simulation (slow, needs npm)
  --help             this text

Checks (each failure prints a concrete Fix line):
  1. brand-leakage  banned terms + pattern classes (credential shapes, local user
                    paths, private hosts) in every text file, as file:line
  2. clean-tree     default-deny suffix allowlist + reviewed-PNG carve-out + symlink
                    refusal, plus .env*, *.log, .DS_Store, .render/, .report/, fonts
  3. completeness   files CONTRACT.md names exist; deps <-> imports agree
  4. size-budget    engine minus node_modules under ${SIZE_BUDGET_MB} MB (warn-only)
  5. fresh-install  temp-dir copy, npm install --omit=dev, setup-check.mjs there

Exit codes (CONTRACT.md): 0 = release-ready · 1 = findings · 2 = setup/usage error`;

// ── args ────────────────────────────────────────────────────────────────────
const extraBans = [];
let skipFresh = false;
let banFile = null;
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') { console.log(HELP); process.exit(0); }
    else if (argv[i] === '--skip-fresh') skipFresh = true;
    else if (argv[i] === '--ban') {
      if (!argv[i + 1]) { console.error('--ban needs a value\n'); console.error(HELP); process.exit(2); }
      extraBans.push(argv[++i]);
    } else if (argv[i] === '--ban-file') {
      if (!argv[i + 1]) { console.error('--ban-file needs a path\n'); console.error(HELP); process.exit(2); }
      banFile = argv[++i];
    } else { console.error(`unknown flag: ${argv[i]}\n`); console.error(HELP); process.exit(2); }
  }
}
if (!existsSync(path.join(ENGINE, 'scripts'))) {
  console.error(`engine root not found at ${ENGINE} (expected scripts/ beside this file's parent)`);
  process.exit(2);
}
if (banFile) {
  const abs = path.resolve(banFile);
  if (!existsSync(abs)) { console.error(`--ban-file not found: ${abs}`); process.exit(2); }
  if ((abs + path.sep).startsWith(ENGINE + path.sep)) {
    console.error(`--ban-file ${abs} is INSIDE the engine tree — the ban vocabulary must never ship; keep the file out-of-tree`);
    process.exit(2);
  }
  for (const line of readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const term = line.trim();
    if (term && !term.startsWith('#')) extraBans.push(term);
  }
}

// ── shared helpers ──────────────────────────────────────────────────────────
const summary = {}; // category -> { state: 'PASS'|'FAIL'|'WARN'|'SKIP', note }
let findings = 0;
const p = (m) => console.log(m);
const pass = (m) => p(`  PASS  ${m}`);
const warn = (m, fix) => { p(`  WARN  ${m}`); if (fix) p(`        Fix: ${fix}`); };
const fail = (m, fix) => { findings++; p(`  FAIL  ${m}`); if (fix) p(`        Fix: ${fix}`); };
const section = (t) => p(`\n── ${t} ${'─'.repeat(Math.max(2, 66 - t.length))}`);

/** Every file under the engine, node_modules excluded, as engine-relative paths. */
function walk(dir = ENGINE, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(full, out); }
    else if (e.isFile()) out.push(path.relative(ENGINE, full));
  }
  return out.sort();
}
const FILES = walk();

/** Every symlink under the engine (node_modules excluded) — walk() skips them silently,
 *  so the clean-tree gate hunts them explicitly: a symlink can smuggle out-of-tree content
 *  into a release and always requires manual review. */
function walkSymlinks(dir = ENGINE, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) out.push(path.relative(ENGINE, full));
    else if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') walkSymlinks(full, out);
  }
  return out.sort();
}

function isText(rel) {
  if (BINARY_EXT.has(path.extname(rel).toLowerCase())) return false;
  const buf = readFileSync(path.join(ENGINE, rel));
  return !buf.subarray(0, 8192).includes(0);
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const banRegex = (t) => new RegExp(/^[a-z0-9]{1,4}$/i.test(t) ? `\\b${t}\\b` : escapeRe(t), 'i');

p('release-check · publish-readiness gate (fidelity-machine)');
p(`engine root: ${ENGINE}`);

// ── 1. brand leakage ────────────────────────────────────────────────────────
section('1. Brand leakage');
{
  const terms = [...new Set([...JSON.parse(Buffer.from(DEFAULT_BAN_B64, 'base64').toString('utf8')), ...extraBans])];
  const matchers = terms.map((t) => ({ term: t, re: banRegex(t) }));
  // Pattern-class scanning (shape-based, brand-agnostic): things that leak regardless of
  // vocabulary — credential shapes, local user paths, private hosts. The regex DEFINITIONS
  // below necessarily contain their own shapes, so scripts/release-check.mjs itself is
  // excluded from the pattern-class scan (named carve-out, stated in the output line);
  // the literal ban-list scan above still covers this file in full.
  const PATTERN_CLASSES = [
    { label: 'credential-shape', re: /ghp_[A-Za-z0-9]{20,}|github_pat_|xox[baprs]-|\bsk-[A-Za-z0-9]{16,}/ },
    { label: 'local-user-path', re: /\/Users\/[^/\s]+|\/home\/[^/\s]+|C:\\Users\\/ },
    { label: 'private-host', re: /localhost|127\.0\.0\.1|\b[\w.-]+\.(?:internal|corp|local)\b/i },
  ];
  const PATTERN_CARVE_OUT = path.join('scripts', 'release-check.mjs');
  const textFiles = FILES.filter(isText);
  p(`  scanning ${textFiles.length} text files (${FILES.length - textFiles.length} binary skipped) for ${terms.length} banned terms: ${terms.join(', ')}`);
  p(`  pattern classes: ${PATTERN_CLASSES.map((c) => c.label).join(', ')} (carve-out: ${PATTERN_CARVE_OUT} — it defines these regexes and would self-flag)`);
  const hits = [];
  for (const rel of textFiles) {
    const lines = readFileSync(path.join(ENGINE, rel), 'utf8').split(/\r?\n/);
    const classesHere = rel === PATTERN_CARVE_OUT ? [] : PATTERN_CLASSES;
    lines.forEach((line, i) => {
      const matched = matchers.filter((m) => m.re.test(line)).map((m) => m.term);
      for (const c of classesHere) if (c.re.test(line)) matched.push(`class:${c.label}`);
      if (matched.length) hits.push({ rel, line: i + 1, matched, text: line.trim().slice(0, 100) });
    });
  }
  if (hits.length === 0) {
    pass('no banned terms or pattern-class hits anywhere in the engine tree');
    summary.brand = { state: 'PASS', note: '0 hits' };
  } else {
    const files = new Set(hits.map((h) => h.rel));
    fail(`${hits.length} banned-term/pattern-class hit(s) in ${files.size} file(s):`);
    hits.slice(0, MAX_HIT_LINES).forEach((h) => p(`        ${h.rel}:${h.line}  [${h.matched.join(', ')}]  ${h.text}`));
    if (hits.length > MAX_HIT_LINES) p(`        ... +${hits.length - MAX_HIT_LINES} more`);
    p('        Fix: rewrite each line brand-neutrally (e.g. "the skill" / a generic example');
    p('        system name); brand or user-specific content belongs in the per-system skill,');
    p('        never in the engine. Credential-shaped strings and private hosts must not');
    p('        appear even as examples — describe the shape instead of spelling it out.');
    p('        For package name/description, pick a neutral name and run npm install to');
    p('        regenerate the lockfile. Machine paths inside fixture artifacts disappear');
    p('        with the clean-tree fixes below.');
    summary.brand = { state: 'FAIL', note: `${hits.length} hits in ${files.size} files` };
  }
}

// ── 2. clean tree ───────────────────────────────────────────────────────────
section('2. Clean tree (default-deny allowlist + negative content assertions)');
{
  let bad = 0;
  // DEFAULT-DENY: everything that ships must be an allowlisted text suffix, an allowlisted
  // extensionless basename, or the one reviewed binary carve-out below. Anything else fails
  // BY NAME — new file types enter the release surface only by a conscious allowlist edit.
  const SHIP_SUFFIXES = new Set(['.mjs', '.md', '.json', '.cjs', '.css', '.html', '.yml']);
  const SHIP_BASENAMES = new Set(['LICENSE', 'NOTICE', '.gitignore', '.npmignore']);
  // Reviewed binary carve-outs: the golden fixture's reference screenshots, and the README
  // demo GIF(s) under docs/ — each only when the magic bytes match and the size is sane.
  const REVIEWED_PNG_DIR = path.join('fixtures', 'golden', 'reference');
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const MAX_REVIEWED_PNG_BYTES = 5 * 1024 * 1024;
  const REVIEWED_GIF_DIR = 'docs';
  const GIF_MAGICS = [Buffer.from('GIF87a'), Buffer.from('GIF89a')];
  const MAX_REVIEWED_GIF_BYTES = 10 * 1024 * 1024;

  const symlinks = walkSymlinks();
  if (symlinks.length) {
    bad += symlinks.length;
    fail(`symlink(s) in the tree require manual review: ${symlinks.join(', ')}`,
      'replace each symlink with the real file (or delete it) — a link can smuggle out-of-tree content into the release');
  } else pass('no symlinks anywhere in the tree');

  const denied = [];
  let reviewedPngs = 0;
  let reviewedGifs = 0;
  for (const rel of FILES) {
    const ext = path.extname(rel).toLowerCase();
    if (ext === '.png' && path.dirname(rel) === REVIEWED_PNG_DIR) {
      const data = readFileSync(path.join(ENGINE, rel));
      if (!data.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
        bad++;
        fail(`reviewed PNG ${rel} does not start with the PNG signature`,
          'a mislabeled binary is unreviewable — replace it with a real PNG or delete it');
      } else if (data.length > MAX_REVIEWED_PNG_BYTES) {
        bad++;
        fail(`reviewed PNG ${rel} is ${(data.length / 1048576).toFixed(2)} MB (cap ${MAX_REVIEWED_PNG_BYTES / 1048576} MB)`,
          'shrink the reference image — the golden fixture ships small');
      } else reviewedPngs++;
      continue;
    }
    if (ext === '.gif' && path.dirname(rel) === REVIEWED_GIF_DIR) {
      const data = readFileSync(path.join(ENGINE, rel));
      if (!GIF_MAGICS.some((m) => data.subarray(0, m.length).equals(m))) {
        bad++;
        fail(`reviewed GIF ${rel} does not start with a GIF signature`,
          'a mislabeled binary is unreviewable — replace it with a real GIF or delete it');
      } else if (data.length > MAX_REVIEWED_GIF_BYTES) {
        bad++;
        fail(`reviewed GIF ${rel} is ${(data.length / 1048576).toFixed(2)} MB (cap ${MAX_REVIEWED_GIF_BYTES / 1048576} MB)`,
          'shrink the demo — a README GIF over 10 MB punishes every visitor');
      } else reviewedGifs++;
      continue;
    }
    if (ext ? SHIP_SUFFIXES.has(ext) : SHIP_BASENAMES.has(path.basename(rel))) continue;
    denied.push(rel);
  }
  if (denied.length) {
    bad += denied.length;
    fail(`file type not on the ship allowlist: ${denied.join(', ')}`,
      `the engine ships scripts + docs + one small fixture (${[...SHIP_SUFFIXES].join(' ')}, ` +
      `${[...SHIP_BASENAMES].join('/')}, reviewed ${path.join(REVIEWED_PNG_DIR, '*.png')}) — delete the file, ` +
      'or extend the allowlist in release-check.mjs as a conscious review decision');
  } else pass(`every shipped file is allowlisted (default-deny; ${reviewedPngs} reviewed PNG(s) + ${reviewedGifs} reviewed GIF(s) magic-byte verified)`);

  const flag = (list, label, fix) => {
    if (list.length) { bad += list.length; fail(`${label}: ${list.join(', ')}`, fix); }
    else pass(`no ${label}`);
  };
  const base = (rel) => path.basename(rel);
  flag(FILES.filter((f) => base(f).startsWith('.env')), '.env* files',
    'delete them — secrets/config never ship with the engine');
  flag(FILES.filter((f) => f.endsWith('.log')), '*.log files',
    'delete them and add *.log to the release ignore list');
  flag(FILES.filter((f) => base(f) === '.DS_Store'), '.DS_Store files',
    `find ${ENGINE} -name .DS_Store -delete`);
  const artefactDirs = [...new Set(
    FILES.filter((f) => f.split(path.sep).some((s) => s === '.render' || s === '.report'))
      .map((f) => {
        const segs = f.split(path.sep);
        return segs.slice(0, segs.findIndex((s) => s === '.render' || s === '.report') + 1).join(path.sep);
      }),
  )];
  if (artefactDirs.length) {
    bad++;
    fail(`leftover render/report artifacts: ${artefactDirs.join(', ')}`,
      `rm -rf ${artefactDirs.map((d) => path.join(ENGINE, d)).join(' ')} — these are machine-specific outputs, regenerated by running verify.mjs on the fixture`);
  } else pass('no .render/ or .report/ artifacts');
  flag(FILES.filter((f) => FONT_EXT.has(path.extname(f).toLowerCase())), 'font binaries',
    'fonts belong in the per-system skill (its fonts/ dir), never in the engine');
  summary.tree = bad ? { state: 'FAIL', note: `${bad} finding(s)` } : { state: 'PASS', note: 'clean' };
}

// ── 3. completeness ─────────────────────────────────────────────────────────
section('3. Completeness (CONTRACT.md references, deps <-> imports)');
{
  let bad = 0;
  const before = findings;
  for (const f of REQUIRED_TOP_LEVEL) {
    if (!existsSync(path.join(ENGINE, f))) fail(`required top-level file missing: ${f}`, 'restore it — the engine does not function or document itself without it');
  }
  if (!existsSync(path.join(ENGINE, 'fixtures', 'golden'))) {
    fail('fixtures/golden/ missing', 'restore the golden self-test fixture (CONTRACT.md topology)');
  }

  const contractPath = path.join(ENGINE, 'CONTRACT.md');
  if (existsSync(contractPath)) {
    const contract = readFileSync(contractPath, 'utf8');
    const basenames = new Set(FILES.map((f) => path.basename(f)));
    const scriptSet = new Set(FILES.filter((f) => f.startsWith('scripts/')).map((f) => path.basename(f)));
    const missing = [];
    for (const m of contract.matchAll(/[A-Za-z0-9_][A-Za-z0-9_.\/-]*\.(?:mjs|md)\b/g)) {
      const name = path.basename(m[0]);
      if (name.endsWith('.mjs')) { if (!scriptSet.has(name)) missing.push(`scripts/${name}`); }
      else if (!PER_SKILL_DOCS.has(name) && !basenames.has(name)) missing.push(name);
    }
    const uniq = [...new Set(missing)];
    if (uniq.length) fail(`CONTRACT.md names files that do not exist: ${uniq.join(', ')}`, 'create the file or update CONTRACT.md — the contract must describe the tree that ships');
    else pass('every script/reference named by CONTRACT.md exists');
  }

  const pkgPath = path.join(ENGINE, 'package.json');
  if (existsSync(pkgPath)) {
    let pkg;
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); }
    catch { fail('package.json is not valid JSON', 'fix the JSON — nothing installs from a broken manifest'); }
    if (pkg) {
      const deps = Object.keys(pkg.dependencies ?? {});
      const devDeps = Object.keys(pkg.devDependencies ?? {});
      // Both maps count as "declared". devDependencies are legitimately imported by dev-only
      // gates (contract-guard's schema validation) that never run on a consumer's install —
      // they are absent from `npm install --omit=dev`, which the fresh-install check proves
      // is still green.
      const declared = deps.concat(devDeps);
      const scriptFiles = FILES.filter((f) => f.startsWith('scripts/') && f.endsWith('.mjs'));
      const corpus = scriptFiles.concat(FILES.filter((f) => f === 'skill-template.md'))
        .map((f) => ({ f, src: readFileSync(path.join(ENGINE, f), 'utf8') }));
      // deps -> referenced somewhere
      const unused = declared.filter((d) => {
        const re = new RegExp(`(?<![\\w@-])${escapeRe(d)}(?![\\w-])`);
        return !corpus.some((c) => re.test(c.src));
      });
      if (unused.length) fail(`declared packages no script references: ${unused.join(', ')}`, 'remove them from package.json (and npm install to update the lock), or wire them in');
      else pass(`all ${declared.length} declared package(s) are referenced by scripts (${deps.length} runtime, ${devDeps.length} dev)`);
      // imports -> declared
      const importRe = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
      const missingDeps = new Set();
      for (const c of corpus) {
        for (const m of c.src.matchAll(importRe)) {
          const spec = m[1];
          if (spec.startsWith('node:') || spec.startsWith('.') || spec.startsWith('/')) continue;
          const root = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
          if (!declared.includes(root)) missingDeps.add(`${root} (imported by ${path.basename(c.f)})`);
        }
      }
      if (missingDeps.size) fail(`scripts import packages package.json does not declare: ${[...missingDeps].join(', ')}`, 'add them to dependencies (or devDependencies for dev-only gates) — a fresh install cannot resolve undeclared packages');
      else pass('every bare import in scripts/ is declared in package.json');
    }
  }
  bad = findings - before;
  summary.complete = bad ? { state: 'FAIL', note: `${bad} finding(s)` } : { state: 'PASS', note: 'consistent' };
}

// ── 4. size budget ──────────────────────────────────────────────────────────
section('4. Size budget');
{
  const bytes = FILES.reduce((s, f) => s + statSync(path.join(ENGINE, f)).size, 0);
  const mb = bytes / 1048576;
  const msg = `${mb.toFixed(2)} MB across ${FILES.length} files (budget ${SIZE_BUDGET_MB} MB, node_modules excluded)`;
  if (mb > SIZE_BUDGET_MB) {
    warn(`engine is heavier than expected: ${msg}`, 'large payloads (fonts, captures, screenshots) belong in per-system skills; keep the engine to scripts + docs + one small fixture');
    summary.size = { state: 'WARN', note: `${mb.toFixed(2)} MB` };
  } else {
    pass(msg);
    summary.size = { state: 'PASS', note: `${mb.toFixed(2)} MB / ${FILES.length} files` };
  }
}

// ── 5. fresh-environment install (consumer simulation) ──────────────────────
section('5. Fresh-environment install (consumer simulation)');
if (skipFresh) {
  p('  SKIP  --skip-fresh given');
  summary.fresh = { state: 'SKIP', note: 'skipped by flag — re-run without --skip-fresh before publishing' };
} else {
  let npmVersion = null;
  try { npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8', timeout: 15000 }).trim(); } catch { /* npm unavailable */ }
  if (!npmVersion) {
    p('  SKIP  npm not available on PATH — cannot simulate a consumer install');
    summary.fresh = { state: 'SKIP', note: 'npm unavailable' };
  } else {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'fidelity-machine-release-'));
    try {
      cpSync(ENGINE, tmp, { recursive: true, filter: (src) => !src.split(path.sep).includes('node_modules') });
      p(`  copied engine (minus node_modules) to ${tmp}`);
      const t0 = Date.now();
      const inst = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], {
        cwd: tmp, encoding: 'utf8', timeout: 240000,
        env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }, // browsers come from the shared cache; setup-check verifies them
      });
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const errText = `${inst.stderr ?? ''}${inst.stdout ?? ''}`;
      if (inst.status !== 0) {
        if (inst.signal || /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|network|offline/i.test(errText)) {
          p(`  SKIP  npm install did not complete (${inst.signal ? `timed out after 240s` : 'network unavailable'}) — re-run online`);
          summary.fresh = { state: 'SKIP', note: 'npm install offline/timeout' };
        } else {
          fail(`npm install --omit=dev failed in a fresh copy (exit ${inst.status}):`);
          errText.trim().split('\n').slice(-8).forEach((l) => p(`        ${l}`));
          p('        Fix: a consumer cannot install the engine — resolve the npm error above (check package.json/package-lock.json consistency)');
          summary.fresh = { state: 'FAIL', note: 'npm install failed' };
        }
      } else {
        p(`  npm ${npmVersion} install --omit=dev: ok (${secs}s)`);
        const sc = spawnSync(process.execPath, ['scripts/setup-check.mjs'], { cwd: tmp, encoding: 'utf8', timeout: 90000 });
        const tail = `${sc.stdout ?? ''}${sc.stderr ?? ''}`.trim().split('\n').slice(-10);
        tail.forEach((l) => p(`        ${l}`));
        if (sc.status === 0) {
          pass('setup-check.mjs exits 0 in the fresh copy — a consumer lands green');
          summary.fresh = { state: 'PASS', note: 'install ok, setup-check exit 0' };
        } else {
          fail(`setup-check.mjs exits ${sc.status ?? `signal ${sc.signal}`} in the fresh copy`,
            'make the readiness gate green from a bare checkout — that exact sequence is a consumer\'s first contact with the engine');
          summary.fresh = { state: 'FAIL', note: `setup-check exit ${sc.status ?? sc.signal}` };
        }
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ── summary ─────────────────────────────────────────────────────────────────
section('Summary');
const rows = [
  ['brand-leakage', summary.brand], ['clean-tree', summary.tree], ['completeness', summary.complete],
  ['size-budget', summary.size], ['fresh-install', summary.fresh],
];
for (const [name, s] of rows) p(`  ${name.padEnd(14)} ${s.state.padEnd(5)} ${s.note}`);
const failedCats = rows.filter(([, s]) => s.state === 'FAIL').length;
const skippedCats = rows.filter(([, s]) => s.state === 'SKIP').length;
if (failedCats === 0) {
  p(`\nRELEASE-READY${skippedCats ? ` (${skippedCats} check(s) skipped — re-run them before publishing)` : ''}. exit 0`);
  process.exit(0);
} else {
  p(`\nNOT RELEASE-READY — ${failedCats} of ${rows.length} categories failing, ${findings} finding(s) total. Work the Fix lines above. exit 1`);
  process.exit(1);
}
