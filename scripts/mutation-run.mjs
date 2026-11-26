#!/usr/bin/env node
// mutation-run.mjs — break the code on purpose and require the tests to notice.
//
// A test that has never failed has not been tested. This runner takes a LIST of planted breaks
// (one string replacement each), applies them one at a time to a COPY of the tree, runs the
// suite named in the list, and reports which breaks the suite caught. The working tree is never
// touched. Lists live beside the tests they prove: fixtures/<area>/<suite>.mutations.mjs.
//
// Usage:
//   node scripts/mutation-run.mjs <list.mutations.mjs> [--only <name>] [--root <dir>]
//   --only   run one break by its name
//   --root   the tree the list's paths are relative to (default: the engine root). A TEST SEAM:
//            it lets this runner's own behaviour be proved on a toy tree.
//
// A list is an ES module whose default export is:
//   { target:    'scripts/x.mjs',                 the one file the breaks are planted in
//     copy:      ['scripts', 'fixtures/x'],       what the suite needs, copied into the work dir
//     test:      ['node', '--test', 'fixtures/x/x.test.mjs'],   run with the work dir as cwd
//     mutations: [{ name, find, replace, count? }] }
//   `find` must occur exactly once in the target (or exactly `count` times, all replaced). That is
//   the setup assertion: a break whose text has drifted out of the file is reported NOT APPLIED
//   and fails the run, instead of "surviving" or "being caught" by accident.
//
// Exit codes (CONTRACT.md):
//   0 = every planted break made the suite fail
//   1 = at least one break SURVIVED: the suite passed with the code broken (a missing test, or
//       code that does nothing)
//   2 = could not look: bad usage, unreadable list, an empty list, a break that does not apply,
//       a break that leaves the target unparseable (it proves nothing), or a suite that is already
//       red on the untouched copy
//
// The copy gets a `node_modules` of links to the packages the root can see (its own and any a
// workspace hoisted to a parent folder), so a suite that imports the pinned browser runs there as
// it does here. Nothing is installed and nothing leaves the machine.

import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENGINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function usage() {
  return [
    'usage: node scripts/mutation-run.mjs <list.mutations.mjs> [--only <name>] [--root <dir>]',
    '',
    '  Applies each planted break of the list to a copy of the tree and runs the list\'s suite.',
    '  exit 0 = every break caught · 1 = a break survived · 2 = could not look (setup/usage)',
  ].join('\n');
}
function die2(msg) {
  console.error(`mutation-run: ${msg} (exit 2 = setup/usage error)`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { list: null, only: null, root: ENGINE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
    else if (a === '--only') args.only = argv[++i] ?? die2('--only needs a name');
    else if (a === '--root') args.root = path.resolve(argv[++i] ?? die2('--root needs a directory'));
    else if (a.startsWith('-')) die2(`unknown flag ${a}\n${usage()}`);
    else if (args.list) die2(`one list at a time (got ${args.list} and ${a})`);
    else args.list = path.resolve(a);
  }
  if (!args.list) die2(`no list given\n${usage()}`);
  return args;
}

// The copy's node_modules: one link per package, from every node_modules folder Node itself would
// search from the root, nearest first. In a workspace npm hoists packages to a parent folder, and
// the copy sits in a temp folder from which nothing of that can be reached by walking up.
function linkModules(root, dest) {
  const link = (from, to) => { if (!existsSync(to)) symlinkSync(from, to, 'dir'); };
  for (let dir = root; ; dir = path.dirname(dir)) {
    const modules = path.join(dir, 'node_modules');
    if (existsSync(modules)) {
      mkdirSync(dest, { recursive: true });
      for (const name of readdirSync(modules)) {
        if (name.startsWith('.')) continue;
        if (!name.startsWith('@')) { link(path.join(modules, name), path.join(dest, name)); continue; }
        mkdirSync(path.join(dest, name), { recursive: true });
        for (const scoped of readdirSync(path.join(modules, name))) link(path.join(modules, name, scoped), path.join(dest, name, scoped));
      }
    }
    if (path.dirname(dir) === dir) break;
  }
}

const occurrences = (text, find) => (find === '' ? 0 : text.split(find).length - 1);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.list)) die2(`list not found: ${args.list}`);
  let list;
  try { list = (await import(pathToFileURL(args.list).href)).default; } catch (err) { die2(`cannot load ${args.list}: ${err.message}`); }
  if (!list || typeof list.target !== 'string' || !Array.isArray(list.copy) || !Array.isArray(list.test) || !Array.isArray(list.mutations)) {
    die2(`${args.list} must export default { target, copy[], test[], mutations[] }`);
  }
  if (list.mutations.length === 0) die2(`${args.list} lists no planted breaks: nothing to look at`);
  for (const m of list.mutations) {
    if (!m || typeof m.name !== 'string' || typeof m.find !== 'string' || typeof m.replace !== 'string') die2(`every break needs name, find and replace (strings): ${JSON.stringify(m)?.slice(0, 120)}`);
  }
  const names = list.mutations.map((m) => m.name);
  const dupe = names.find((n, i) => names.indexOf(n) !== i);
  if (dupe) die2(`two breaks are both named "${dupe}"`);
  const chosen = args.only ? list.mutations.filter((m) => m.name === args.only) : list.mutations;
  if (chosen.length === 0) die2(`no break named "${args.only}" in ${args.list}`);

  const targetSrc = path.join(args.root, list.target);
  if (!existsSync(targetSrc)) die2(`target not found: ${targetSrc}`);

  const work = mkdtempSync(path.join(tmpdir(), 'mutation-run-'));
  let exit = 0;
  try {
    for (const rel of list.copy) {
      const from = path.join(args.root, rel);
      if (!existsSync(from)) die2(`copy path not found: ${from}`);
      mkdirSync(path.dirname(path.join(work, rel)), { recursive: true });
      cpSync(from, path.join(work, rel), { recursive: true });
    }
    const target = path.join(work, list.target);
    if (!existsSync(target)) die2(`the target ${list.target} is not inside any copied path (${list.copy.join(', ')})`);
    linkModules(args.root, path.join(work, 'node_modules'));

    const [cmd, ...rest] = list.test;
    // NODE_TEST_CONTEXT is dropped: with it a nested `node --test` reports to its parent runner and
    // exits 0 whatever happened, so every break would "survive" when this runs inside a test.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const runSuite = () => spawnSync(cmd === 'node' ? process.execPath : cmd, rest, { cwd: work, encoding: 'utf8', timeout: 600000, env });
    const pristine = readFileSync(target, 'utf8');
    const clean = runSuite();
    if (clean.status !== 0) {
      console.error((clean.stdout + clean.stderr).split('\n').filter((l) => /^(✖|not ok|#? ?fail)/i.test(l.trim())).slice(0, 8).join('\n'));
      die2(`the suite fails before any break is planted (${list.test.join(' ')}, exit ${clean.status}): it cannot judge one`);
    }

    let caught = 0;
    const survived = [], notApplied = [], invalid = [];
    for (const m of chosen) {
      const want = m.count ?? 1;
      const got = occurrences(pristine, m.find);
      if (got !== want) {
        notApplied.push(m.name);
        console.log(`NOT APPLIED ${m.name} — the find text occurs ${got} times in ${list.target}, expected ${want}`);
        continue;
      }
      writeFileSync(target, pristine.split(m.find).join(m.replace));
      if (/\.(?:mjs|cjs|js)$/.test(list.target) && spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' }).status !== 0) {
        invalid.push(m.name);
        console.log(`INVALID     ${m.name} — the break leaves ${list.target} unparseable, which proves nothing`);
        continue;
      }
      const r = runSuite();
      if (r.status === 0) { survived.push(m.name); console.log(`SURVIVED    ${m.name}`); }
      else { caught += 1; console.log(`caught      ${m.name}`); }
    }
    writeFileSync(target, pristine);

    const judged = chosen.length - notApplied.length - invalid.length;
    const setup = notApplied.length + invalid.length;
    if (setup > 0) {
      console.log(`\nRESULT: COULD NOT LOOK — ${notApplied.length} break(s) did not apply, ${invalid.length} left the file unparseable; fix the list (${caught} of ${judged} judged breaks caught)`);
      exit = 2;
    } else if (survived.length > 0) {
      console.log(`\nRESULT: FAIL — ${caught} of ${judged} planted breaks caught; ${survived.length} survived: ${survived.join(' | ')}`);
      exit = 1;
    } else {
      console.log(`\nRESULT: PASS — ${caught} of ${judged} planted breaks caught`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  process.exit(exit);
}

main().catch((err) => die2(`unexpected error: ${err?.stack || err}`));
