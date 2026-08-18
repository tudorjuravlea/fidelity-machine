#!/usr/bin/env node
// contract-guard.mjs — mechanical CONTRACT.md enforcement (engine self-check).
//
// CONTRACT.md says independently-written parts must not drift. This script checks the
// drift that is mechanically checkable — plain regex over file reads, no AST, no deps:
//
//   script-inventory       CONTRACT.md names ↔ scripts/*.mjs, both directions
//   docs-drift             every invocation example in CONTRACT.md (`x.mjs --flag …`)
//                          references a script that exists and flags it actually knows
//   help-support           scripts CONTRACT documents with --lock also answer --help
//   exit-codes             every process.exit(<literal>) uses a code from CONTRACT's table
//   spawn-not-import       verify.mjs orchestrates siblings as spawned CLIs, never imports
//   template-placeholders  skill-template.md {{X}} ↔ new-system.mjs replaceAll set
//   fault-injection        adherence-lint's a11y checks go RED on a temp copy of the golden
//                          fixture mutated one defect at a time (a check that cannot fail
//                          is not a check); the pristine copy must stay clean
//   self-test (--self-test) run verify.mjs against a TEMP COPY of fixtures/golden, expect 0
//
// Deliberately NOT checked here: brand/system-name leakage (release-check's job),
// meta.provenance in locks (schema in flux), anything CONTRACT.md does not state.
//
// Usage: node scripts/contract-guard.mjs [--self-test] [--lock <path>]
// Exit codes per CONTRACT.md: 0 pass · 1 fidelity/lint failure (>=1 ERROR) · 2 setup/usage.
// The self-test never writes inside the engine tree — the fixture is copied to os.tmpdir().

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.dirname(SCRIPT_DIR);
const SECTIONS = [
  'script-inventory', 'docs-drift', 'help-support', 'exit-codes',
  'spawn-not-import', 'template-placeholders', 'schema-validity', 'fault-injection', 'self-test',
];

// ---------------------------------------------------------------- findings

const findings = [];
function add(level, section, loc, detail) {
  findings.push({ level, section, loc, detail });
}

// ---------------------------------------------------------------- cli

function usage() {
  return [
    'Usage: node scripts/contract-guard.mjs [--self-test] [--lock <path>]',
    '',
    '  Mechanical CONTRACT.md enforcement: script inventory, invocation-example drift,',
    '  --lock/--help support, exit-code literals vs the CONTRACT table, verify.mjs',
    '  orchestration-by-spawn, template placeholder parity.',
    '',
    '  --lock <path>  additionally ajv-validate an arbitrary per-skill lock against',
    '                 design-lock.schema.json (the golden round-trip alone does not keep',
    '                 production locks honest). ERROR on any violation.',
    '',
    '  --self-test  additionally copy fixtures/golden to a temp dir and run verify.mjs',
    '               (as a spawned CLI) against the copy, asserting exit 0. Read-only for',
    '               the engine tree; reports SKIP with a reason if the fixture or the',
    '               environment cannot run.',
    '',
    '  Exit: 0 pass · 1 fidelity/lint failure (>=1 ERROR) · 2 setup/usage error',
  ].join('\n');
}

function die2(msg) {
  console.error('exit 2 (setup/usage error)');
  console.error(`contract-guard: ${msg}`);
  console.error(usage());
  process.exit(2);
}

function parseArgs(argv) {
  const args = { selfTest: false, lock: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
    else if (a === '--self-test') args.selfTest = true;
    else if (a === '--lock') {
      if (!argv[i + 1]) die2('--lock needs a path');
      args.lock = argv[++i];
    }
    else die2(`unknown argument '${a}'`);
  }
  return args;
}

// ---------------------------------------------------------------- inputs

function readText(abs, what) {
  try { return fs.readFileSync(abs, 'utf8'); }
  catch (e) { die2(`cannot read ${what} at ${abs}: ${e.message}`); }
}

function loadScripts() {
  let names;
  try { names = fs.readdirSync(SCRIPT_DIR).filter((f) => f.endsWith('.mjs')).sort(); }
  catch (e) { die2(`cannot list ${SCRIPT_DIR}: ${e.message}`); }
  const map = new Map();
  for (const n of names) map.set(n, readText(path.join(SCRIPT_DIR, n), `scripts/${n}`));
  return map;
}

// First line (1-based) whose text contains `needle`, or null.
function lineOf(lines, needle) {
  const i = lines.findIndex((l) => l.includes(needle));
  return i === -1 ? null : i + 1;
}

const loc = (file, line) => (line ? `${file}:${line}` : file);

// ---------------------------------------------------------------- CONTRACT parsing

// Exit-code table: rows `| N | meaning | … |` inside the "## Exit codes" section.
function parseExitCodeTable(contractLines) {
  const start = contractLines.findIndex((l) => /^##\s+Exit codes/.test(l));
  if (start === -1) die2('CONTRACT.md has no "## Exit codes" section — cannot enforce exit codes');
  const codes = new Set();
  for (let i = start + 1; i < contractLines.length; i++) {
    if (/^##\s/.test(contractLines[i])) break;
    const m = contractLines[i].match(/^\|\s*(\d+)\s*\|/);
    if (m) codes.add(Number(m[1]));
  }
  if (codes.size === 0) die2('CONTRACT.md "## Exit codes" table has no numeric rows — cannot enforce exit codes');
  return codes;
}

// Invocation examples: inline-backtick spans that contain a concrete `<x>.mjs`.
// Returns [{ script, flags, line }]. Spans with placeholder names (`<name>.mjs`)
// yield no script match and are skipped.
function parseInvocations(contractLines) {
  const out = [];
  contractLines.forEach((text, idx) => {
    for (const span of text.matchAll(/`([^`]+)`/g)) {
      const body = span[1];
      const scripts = body.match(/[a-z0-9][a-z0-9._-]*\.mjs/g);
      if (!scripts) continue;
      const flags = body.match(/--[a-z][a-z0-9-]*/g) ?? [];
      out.push({ script: scripts[0], flags, line: idx + 1 });
    }
  });
  return out;
}

// All *.mjs names CONTRACT.md mentions anywhere (tree diagram, prose, examples).
function parseMentionedScripts(contract) {
  return new Set(contract.match(/\b[a-z0-9][a-z0-9-]*\.mjs\b/g) ?? []);
}

// ---------------------------------------------------------------- checks

function checkInventory(contract, contractLines, scripts) {
  const mentioned = parseMentionedScripts(contract);
  for (const name of mentioned) {
    if (!scripts.has(name)) {
      add('ERROR', 'script-inventory', loc('CONTRACT.md', lineOf(contractLines, name)),
        `CONTRACT.md names ${name} but scripts/${name} does not exist — the documented invocation fails with ERR_MODULE_NOT_FOUND`);
    }
  }
  for (const name of scripts.keys()) {
    if (mentioned.has(name)) continue;
    add('ERROR', 'script-inventory', `scripts/${name}`,
      `scripts/${name} exists but CONTRACT.md never names it — undocumented machinery has no contract to conform to and drifts silently`);
  }
}

// Generic flag parsers (`args[a.slice(2)] = …`) accept any --flag; a literal-string
// search cannot disprove support there.
const GENERIC_PARSER_RE = /\.slice\(2\)\s*\]?\s*\]\s*=|\[\s*[a-z]+\.slice\(2\)\s*\]\s*=/;

function checkDocsDrift(invocations, scripts) {
  for (const inv of invocations) {
    const src = scripts.get(inv.script);
    if (src === undefined) {
      add('ERROR', 'docs-drift', loc('CONTRACT.md', inv.line),
        `invocation example references ${inv.script}, which does not exist in scripts/ — copy-pasting the documented command fails`);
      continue;
    }
    const generic = GENERIC_PARSER_RE.test(src);
    for (const flag of inv.flags) {
      if (src.includes(flag) || generic) continue;
      add('ERROR', 'docs-drift', loc('CONTRACT.md', inv.line),
        `CONTRACT.md documents ${flag} for ${inv.script} but the script never mentions that flag string — the documented command hits the unknown-argument branch (exit 2)`);
    }
  }
}

function checkHelpSupport(invocations, scripts) {
  const lockTakers = [...new Set(invocations.filter((i) => i.flags.includes('--lock')).map((i) => i.script))];
  for (const name of lockTakers) {
    const src = scripts.get(name);
    if (src === undefined) continue; // already an inventory/docs-drift ERROR
    if (!src.includes("'--help'") && !src.includes('"--help"')) {
      add('WARN', 'help-support', `scripts/${name}`,
        `takes --lock per CONTRACT.md but has no --help handling (engine convention, not CONTRACT text) — \`node scripts/${name} --help\` exits 2 as an unknown argument instead of printing usage`);
    }
  }
}

// Resolve `const EXIT = { PASS: 0, … }` style maps so process.exit(EXIT.PASS) counts as 0.
function constNumericMaps(src) {
  const maps = new Map();
  for (const m of src.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{([^}]*)\}/g)) {
    for (const e of m[2].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\d+)/g)) {
      maps.set(`${m[1]}.${e[1]}`, e[2]);
    }
  }
  return maps;
}

function checkExitCodes(scripts, documented) {
  const allowed = [...documented].sort((a, b) => a - b).join(', ');
  for (const [name, src] of scripts) {
    const maps = constNumericMaps(src);
    src.split('\n').forEach((text, idx) => {
      for (const call of text.matchAll(/process\.exit\(([^)]*)\)/g)) {
        let arg = call[1];
        for (const [token, value] of maps) arg = arg.split(token).join(` ${value} `);
        for (const lit of arg.match(/\b\d+\b/g) ?? []) {
          if (!documented.has(Number(lit))) {
            add('ERROR', 'exit-codes', loc(`scripts/${name}`, idx + 1),
              `process.exit(${call[1]}) uses code ${lit}, absent from CONTRACT.md's exit-code table (${allowed}) — callers (verify.mjs child mapping, skill loops) cannot interpret it`);
          }
        }
      }
    });
  }
}

function checkSpawnNotImport(scripts) {
  const src = scripts.get('verify.mjs');
  if (src === undefined) return; // inventory already errored
  const siblings = new Set([...scripts.keys()].filter((n) => n !== 'verify.mjs').map((n) => n.replace(/\.mjs$/, '')));
  const specs = [];
  src.split('\n').forEach((text, idx) => {
    const stat = text.match(/^\s*import\b[^'"]*['"]([^'"]+)['"]/);
    if (stat) specs.push({ spec: stat[1], line: idx + 1 });
    for (const dyn of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g)) specs.push({ spec: dyn[1], line: idx + 1 });
  });
  for (const { spec, line } of specs) {
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
    const base = path.basename(spec).replace(/\.(mjs|js)$/, '');
    if (siblings.has(base)) {
      add('ERROR', 'spawn-not-import', loc('scripts/verify.mjs', line),
        `imports sibling script '${spec}' — CONTRACT.md's orchestrator spawns children as CLIs (their CLIs are the contract); importing couples verify to internals and bypasses exit-code mapping`);
    }
  }
}

function checkTemplatePlaceholders(scripts) {
  const tplPath = path.join(ENGINE_ROOT, 'skill-template.md');
  let tpl;
  try { tpl = fs.readFileSync(tplPath, 'utf8'); }
  catch (e) {
    add('ERROR', 'template-placeholders', 'skill-template.md',
      `cannot read ${tplPath} (${e.message}) — CONTRACT.md names it as the per-system SKILL.md template, so new-system.mjs scaffolds fail`);
    return;
  }
  const ns = scripts.get('new-system.mjs');
  if (ns === undefined) return; // inventory already errored
  const tplLines = tpl.split('\n');
  const inTemplate = new Set([...tpl.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map((m) => m[1]));
  const substituted = new Set([...ns.matchAll(/\.replaceAll\(\s*(['"])\{\{([A-Za-z0-9_]+)\}\}\1/g)].map((m) => m[2]));
  for (const p of inTemplate) {
    if (!substituted.has(p)) {
      add('ERROR', 'template-placeholders', loc('skill-template.md', lineOf(tplLines, `{{${p}}}`)),
        `{{${p}}} has no replaceAll in new-system.mjs — every scaffolded SKILL.md keeps the literal placeholder and new-system's own unfilled-placeholder guard fails the scaffold (exit 2)`);
    }
  }
  for (const p of substituted) {
    if (!inTemplate.has(p)) {
      add('WARN', 'template-placeholders', loc('scripts/new-system.mjs', lineOf(ns.split('\n'), `{{${p}}}`)),
        `new-system.mjs substitutes {{${p}}} but skill-template.md never contains it — dead substitution; scaffolder and template have drifted`);
    }
  }
}

// ----------------------------------------------------------- schema validity

// design-lock.schema.json is the contract for every lock in the world. Two things must hold and
// neither is regex-checkable: (1) the schema itself must be a VALID JSON Schema — a malformed
// keyword silently validates everything, so a broken schema is worse than none; (2) real locks
// must round-trip through it. Positive AND negative cases, so a schema that accepts anything
// fails here rather than in someone's capture. SKIPs cleanly when ajv is absent (devDependency:
// the consumer surface never needs it).
async function checkSchemaValidity(extraLockPath) {
  const schemaPath = path.join(ENGINE_ROOT, 'design-lock.schema.json');
  let Ajv, addFormats;
  try {
    ({ default: Ajv } = await import('ajv/dist/2020.js'));
    ({ default: addFormats } = await import('ajv-formats'));
  } catch {
    add('SKIP', 'schema-validity', 'design-lock.schema.json',
      'ajv/ajv-formats not installed (devDependency) — schema is unvalidated here; run `npm install` in the engine to enable this gate');
    return;
  }

  let schema;
  try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')); }
  catch (e) {
    add('ERROR', 'schema-validity', 'design-lock.schema.json',
      `unreadable/unparseable (${e.message}) — every lock is validated against this file`);
    return;
  }

  // (1) compile === metaschema-validate the schema itself
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  let validate;
  try { validate = ajv.compile(schema); }
  catch (e) {
    add('ERROR', 'schema-validity', 'design-lock.schema.json',
      `is not a valid JSON Schema: ${e.message} — a schema that will not compile cannot gate anything`);
    return;
  }

  // (2) real locks must validate
  const goldenPath = path.join(ENGINE_ROOT, 'fixtures', 'golden', 'design-lock.json');
  if (fs.existsSync(goldenPath)) {
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    if (!validate(golden)) {
      add('ERROR', 'schema-validity', 'fixtures/golden/design-lock.json',
        `the certified-good fixture does NOT validate against the schema: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
    }
    // provenance round-trip: the block capture-figma writes must be accepted...
    const withProv = JSON.parse(JSON.stringify(golden));
    withProv.meta.provenance = {
      generatedAt: new Date().toISOString(),
      lockTokensHash: 'sha256:' + 'a'.repeat(64),
      artifacts: { 'assets/tokens.css': 'sha256:' + 'b'.repeat(64) },
    };
    if (!validate(withProv)) {
      add('ERROR', 'schema-validity', 'design-lock.schema.json',
        `meta.provenance (as capture-figma emits it) is REJECTED by the schema: ${ajv.errorsText(validate.errors, { separator: '; ' })} — capture would write locks its own schema refuses`);
    }
    // ...and a malformed one must be rejected, or the block is decorative.
    const badProv = JSON.parse(JSON.stringify(withProv));
    badProv.meta.provenance.lockTokensHash = 'not-a-hash';
    if (validate(badProv)) {
      add('ERROR', 'schema-validity', 'design-lock.schema.json',
        'meta.provenance.lockTokensHash accepts "not-a-hash" — the sha256 pattern is not enforced, so a corrupt receipt would pass schema validation');
    }
  } else {
    add('SKIP', 'schema-validity', 'fixtures/golden/design-lock.json',
      'golden fixture lock missing — schema compiled, but no real lock was round-tripped');
  }
  // --lock <path>: additionally validate an arbitrary per-skill lock. This is the entry
  // point that keeps PRODUCTION locks honest — the golden round-trip alone let a real
  // lock drift 180 violations from the schema before anyone noticed.
  if (extraLockPath) {
    const abs = path.resolve(extraLockPath);
    if (!fs.existsSync(abs)) {
      add('ERROR', 'schema-validity', extraLockPath, 'lock passed via --lock does not exist');
    } else {
      let extra;
      try { extra = JSON.parse(fs.readFileSync(abs, 'utf8')); }
      catch (e) { add('ERROR', 'schema-validity', extraLockPath, `unparseable lock: ${e.message}`); extra = null; }
      if (extra) {
        if (validate(extra)) {
          // valid — no finding, the section summary stays 'ok'
        } else {
          add('ERROR', 'schema-validity', extraLockPath,
            `lock does NOT validate against design-lock.schema.json: ${ajv.errorsText(validate.errors, { separator: '; ' }).slice(0, 600)} — conform the lock or extend the schema deliberately (CONTRACT: change it HERE first)`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- self-test

function tail(res, n = 12) {
  const text = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  return text.split('\n').slice(-n).map((l) => `      | ${l}`).join('\n');
}

function runSelfTest() {
  const goldenDir = path.join(ENGINE_ROOT, 'fixtures', 'golden');
  const lockPath = path.join(goldenDir, 'design-lock.json');
  if (!fs.existsSync(lockPath)) {
    add('SKIP', 'self-test', 'fixtures/golden', 'fixtures/golden/design-lock.json is missing — no fixture to run verify.mjs against');
    return;
  }
  let lock;
  try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); }
  catch (e) {
    add('SKIP', 'self-test', 'fixtures/golden/design-lock.json', `golden lock is not valid JSON (${e.message}) — fixture unrunnable as-is`);
    return;
  }
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  if (screens.length === 0) {
    add('SKIP', 'self-test', 'fixtures/golden/design-lock.json', 'golden lock has no screens[] — verify.mjs would exit 2 with nothing verified');
    return;
  }
  const missing = [];
  for (const s of screens) {
    for (const rel of [s.url, s.referenceImage]) {
      if (typeof rel !== 'string' || /^(https?|file):\/\//.test(rel)) continue;
      if (!fs.existsSync(path.join(goldenDir, rel))) missing.push(rel);
    }
  }
  if (missing.length > 0) {
    add('SKIP', 'self-test', 'fixtures/golden', `golden fixture is incomplete — missing lock-relative file(s): ${missing.join(', ')}`);
    return;
  }
  if (!fs.existsSync(path.join(ENGINE_ROOT, 'node_modules', 'playwright'))) {
    add('SKIP', 'self-test', 'node_modules', 'playwright is not installed in the engine — render cannot run; see scripts/setup-check.mjs');
    return;
  }

  // Never mutate the engine tree: verify writes .render/ + .report/ next to the lock,
  // so run against a copy in os.tmpdir().
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-golden-selftest-'));
  fs.cpSync(goldenDir, tmp, { recursive: true });
  const res = spawnSync(process.execPath,
    [path.join(SCRIPT_DIR, 'verify.mjs'), '--lock', path.join(tmp, 'design-lock.json')],
    { encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024 });

  if (res.error) {
    add('ERROR', 'self-test', 'scripts/verify.mjs', `could not spawn verify.mjs: ${res.error.message} — the engine cannot prove its own pipeline (artifacts kept at ${tmp})`);
    return;
  }
  if (res.signal === 'SIGTERM' || res.signal === 'SIGKILL') {
    add('ERROR', 'self-test', 'scripts/verify.mjs', `verify.mjs timed out after 180s on the golden fixture — the engine cannot prove its own pipeline (artifacts kept at ${tmp})\n${tail(res)}`);
    return;
  }
  if (res.status !== 0) {
    add('ERROR', 'self-test', 'fixtures/golden', `verify.mjs exited ${res.status} on a pristine copy of the golden fixture (expected 0) — the engine no longer passes its own known-good case (artifacts kept at ${tmp})\n${tail(res)}`);
    return;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- fault injection
//
// A check that cannot fail is not a check. The self-test above proves the golden fixture
// PASSES; this proves the a11y section still goes RED on each defect it claims to catch.
// Both directions are needed: a section accidentally reduced to a no-op keeps every green
// result green, and nothing else in the suite would notice.
//
// Each case mutates a temp copy of the fixture, runs adherence-lint, and requires an a11y
// ERROR quoting the expected evidence. The mutation itself is asserted to have applied, so
// a stale selector reports as a broken test rather than silently proving nothing.

// Anchors are STRUCTURAL, never fixture copy: the same golden screen ships with different
// microcopy per tree (the public one is English-native, others are not). Anchoring on a
// sentence silently unanchors every downstream tree, which the guard below then reports as
// "proven by nothing" rather than passing.
const A11Y_FAULTS = [
  { name: 'heading-order',
    from: '<p class="sub" data-slot="label">',
    to: '<h3>Overview</h3><p class="sub" data-slot="label">',
    expect: 'heading jumps h1 to h3' },
  { name: 'img-alt',
    from: '<button class="btn" data-slot="cta">',
    to: '<img src="chart.png"><button class="btn" data-slot="cta">',
    expect: '<img> has no alt attribute' },
  { name: 'positive-tabindex',
    from: '<button class="btn" data-slot="cta">',
    to: '<button class="btn" tabindex="3" data-slot="cta">',
    expect: 'tabindex="3"' },
  { name: 'unlabelled-field',
    from: '<button class="btn" data-slot="cta">',
    to: '<input type="text" placeholder="Amount"><button class="btn" data-slot="cta">',
    expect: '<input> has no label' },
  { name: 'nameless-control',
    from: '<button class="btn" data-slot="cta">',
    to: '<button class="btn"><svg viewBox="0 0 1 1"></svg></button><button class="btn" data-slot="cta">',
    expect: 'has no accessible name' },
  { name: 'no-focus-visible',
    from: '  :focus-visible { outline: 2px solid var(--text1); outline-offset: 2px; }\n',
    to: '',
    expect: 'no :focus-visible rule in this file or a shared stylesheet' },
  { name: 'outline-removed',
    from: '  :focus-visible { outline: 2px solid var(--text1); outline-offset: 2px; }\n',
    to: '  .btn { outline: none; }\n',
    expect: '"outline: none"' },
  // Advisory by design: this one must fire as a WARN and must NOT change the exit code.
  // Proving that is the point — a check silently promoted to ERROR would start blocking
  // every prototype that fades anything, and nothing else here would notice.
  { name: 'motion-without-reduced-guard', level: 'WARN',
    from: '    font-size: 15px; font-weight: 600; font-family: inherit;',
    to: '    font-size: 15px; font-weight: 600; font-family: inherit; transition: opacity 200ms;',
    expect: 'prefers-reduced-motion' },
];

function runFaultInjection() {
  const goldenDir = path.join(ENGINE_ROOT, 'fixtures', 'golden');
  const screenRel = 'screen-home.html';
  const screenSrc = path.join(goldenDir, screenRel);
  if (!fs.existsSync(path.join(goldenDir, 'design-lock.json')) || !fs.existsSync(screenSrc)) {
    add('SKIP', 'fault-injection', 'fixtures/golden', 'golden fixture incomplete — nothing to inject faults into');
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-fault-inject-'));
  try {
    fs.cpSync(goldenDir, tmp, { recursive: true });
    const lockArg = path.join(tmp, 'design-lock.json');
    const screen = path.join(tmp, screenRel);
    const pristine = fs.readFileSync(screen, 'utf8');
    const lint = () => spawnSync(process.execPath,
      [path.join(SCRIPT_DIR, 'adherence-lint.mjs'), '--lock', lockArg],
      { encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });

    // Timing guard. The lint on this fixture is milliseconds of work; a wall-clock second is
    // three orders of magnitude of headroom, so this fires only on an algorithmic regression,
    // never on a slow machine or a cold cache. It exists because one unanchored regex prelude
    // ([^{}]* restarting at every offset) once made a 1.5 MB file take 145 seconds while a
    // 618 KB file took 223 ms — a shape no per-section timer would have made obvious, but a
    // CPU profile named in one run. Treat a failure here as "go profile", not "raise the bound".
    const budgetMs = 1000;
    const t0 = Date.now();

    // Control: the unmutated copy must be free of a11y findings, or every red below is noise.
    const base = lint();
    if (base.status !== 0) {
      add('ERROR', 'fault-injection', 'fixtures/golden',
        `adherence-lint exits ${base.status} on the pristine fixture (expected 0) — fault injection cannot attribute a failure to its mutation\n${tail(base)}`);
      return;
    }
    const baseMs = Date.now() - t0;
    if (baseMs > budgetMs) {
      add('ERROR', 'fault-injection', 'fixtures/golden',
        `adherence-lint took ${baseMs} ms on the golden fixture (budget ${budgetMs} ms) — this fixture is a few KB, so anything near a second means an algorithmic regression. Profile it (node --cpu-prof) rather than raising the budget.`);
    }

    // Finding lines only — the run always prints an "a11y  ok" section-summary row.
    const a11yFindings = (out) => (out ?? '').split('\n').filter((l) => /^\[(?:ERROR|WARN)\]\s+a11y\b/.test(l));
    const stray = a11yFindings(base.stdout);
    if (stray.length) {
      add('ERROR', 'fault-injection', 'fixtures/golden',
        `the a11y section reports ${stray.length} finding(s) on the pristine golden fixture — false positives make the section untrustworthy\n      | ${stray[0]}`);
    }

    for (const f of A11Y_FAULTS) {
      if (!pristine.includes(f.from)) {
        add('ERROR', 'fault-injection', `fixtures/golden/${screenRel}`,
          `fault "${f.name}" no longer applies: its anchor text is absent from the fixture, so this check is currently proven by nothing. Re-anchor the mutation.`);
        continue;
      }
      fs.writeFileSync(screen, pristine.replace(f.from, f.to));
      const res = lint();
      const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
      const level = f.level ?? 'ERROR';
      const fired = out.split('\n').some((l) => l.includes(`[${level}]`) && l.includes('a11y') && l.includes(f.expect));
      if (level === 'ERROR' && res.status === 0) {
        add('ERROR', 'fault-injection', `a11y/${f.name}`,
          `injected defect "${f.name}" but adherence-lint still exits 0 — this check cannot fail, so its green result proves nothing`);
      } else if (!fired) {
        add('ERROR', 'fault-injection', `a11y/${f.name}`,
          `injected defect "${f.name}" produced no a11y ${level} quoting ${JSON.stringify(f.expect)} — this check is unproven\n${tail(res)}`);
      } else if (level === 'WARN' && res.status !== 0) {
        // An advisory check that blocks is as wrong as a blocking check that does not.
        add('ERROR', 'fault-injection', `a11y/${f.name}`,
          `"${f.name}" is advisory but adherence-lint exited ${res.status} — a WARN-level check must not change the exit code, or every screen with motion starts failing the gate\n${tail(res)}`);
      }
      fs.writeFileSync(screen, pristine);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// A11y evidence is per file, and only a MULTI-FILE fixture can prove it. The single-file
// loop above cannot express this, and that gap let a real bug live: the a11y booleans were
// pooled across the entire scanned set, so one guard in one screen muted the rule for every
// other screen in the directory. A capture went from 45 warnings to 37 on a single added
// guard and read as seven fixes, while a screen that genuinely animated with no guard at all
// quietly stopped being reported. Two properties are asserted here, and they pull in opposite
// directions on purpose: an inline guard must NOT vouch for a sibling, and a shared
// stylesheet MUST vouch for everyone (that is why the pooling existed in the first place).
const PROBE_ANIMATES = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<title>Scope probe</title><style>\n  .probe { transition: opacity 200ms; }\n</style>' +
  '</head><body><div class="probe">probe</div></body></html>\n';
const PROBE_GUARDED = PROBE_ANIMATES.replace('</style>',
  '  @media (prefers-reduced-motion: reduce) { .probe { transition: none; } }\n</style>');

function runA11yScopingInjection() {
  const goldenDir = path.join(ENGINE_ROOT, 'fixtures', 'golden');
  if (!fs.existsSync(path.join(goldenDir, 'design-lock.json'))) {
    add('SKIP', 'fault-injection', 'fixtures/golden', 'golden lock missing — a11y scoping unproven');
    return;
  }

  // Returns the motion-warning lines for a scenario, keyed by the file each names.
  const motionWarnings = (probes) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-a11y-scope-'));
    try {
      fs.cpSync(goldenDir, tmp, { recursive: true });
      for (const [name, body] of Object.entries(probes)) fs.writeFileSync(path.join(tmp, name), body);
      const res = spawnSync(process.execPath,
        [path.join(SCRIPT_DIR, 'adherence-lint.mjs'), '--lock', path.join(tmp, 'design-lock.json')],
        { encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
      return `${res.stdout ?? ''}${res.stderr ?? ''}`.split('\n')
        .filter((l) => /^\[WARN\]\s+a11y\b/.test(l) && l.includes('prefers-reduced-motion'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };

  // Scenario 1 — one guarded screen must not vouch for an unguarded sibling.
  const mixed = motionWarnings({ 'probe-guarded.html': PROBE_GUARDED, 'probe-bare.html': PROBE_ANIMATES });
  const namesBare = mixed.some((l) => l.includes('probe-bare.html'));
  const namesGuarded = mixed.some((l) => l.includes('probe-guarded.html'));
  if (!namesBare) {
    add('ERROR', 'fault-injection', 'a11y/scoping-inline',
      'an unguarded animating screen was NOT reported while a sibling screen carried a guard — a11y evidence is pooling across files again, so one guard anywhere mutes the rule everywhere'
      + (mixed.length ? `\n      | ${mixed[0]}` : '\n      | (no motion warnings at all)'));
  }
  if (namesGuarded) {
    add('ERROR', 'fault-injection', 'a11y/scoping-inline',
      `a screen carrying its own reduced-motion guard was still reported — the per-file check no longer sees a file's own <style> block\n      | ${mixed.find((l) => l.includes('probe-guarded.html'))}`);
  }

  // Scenario 2 — a SHARED stylesheet must still vouch for every screen that could link it.
  // Without this the fix for scenario 1 would over-correct into false positives on any
  // project that keeps its motion rules in a sibling .css rather than inline.
  const SHEET = '@media (prefers-reduced-motion: reduce) { .probe { transition: none; } }\n';
  const linked = PROBE_ANIMATES.replace('<style>',
    '<link rel="stylesheet" href="probe-shared.css"><style>');
  const shared = motionWarnings({ 'probe-linked.html': linked, 'probe-shared.css': SHEET });
  if (shared.length) {
    add('ERROR', 'fault-injection', 'a11y/scoping-shared',
      `a screen LINKS a stylesheet carrying the reduced-motion guard and was still reported — the check now false-positives on projects that keep motion rules in a sibling .css\n      | ${shared[0]}`);
  }

  // Scenario 3 — a stylesheet nobody links must NOT vouch for anything. Counting every .css
  // in the scanned set was the original pooling bug wearing a smaller hat: one guard in an
  // orphan stylesheet silenced the gate for ten screens that never referenced it.
  const orphan = motionWarnings({ 'probe-bare.html': PROBE_ANIMATES, 'probe-orphan.css': SHEET });
  if (!orphan.some((l) => l.includes('probe-bare.html'))) {
    add('ERROR', 'fault-injection', 'a11y/scoping-orphan',
      'a stylesheet that no screen links silenced the motion rule — unlinked CSS is being counted as evidence, so one line in an orphan file mutes the gate'
      + (orphan.length ? `\n      | ${orphan[0]}` : '\n      | (no motion warnings at all)'));
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const contractPath = path.join(ENGINE_ROOT, 'CONTRACT.md');
  const contract = readText(contractPath, 'CONTRACT.md');
  const contractLines = contract.split('\n');
  const scripts = loadScripts();
  const documentedCodes = parseExitCodeTable(contractLines);
  const invocations = parseInvocations(contractLines);

  checkInventory(contract, contractLines, scripts);
  checkDocsDrift(invocations, scripts);
  checkHelpSupport(invocations, scripts);
  checkExitCodes(scripts, documentedCodes);
  checkSpawnNotImport(scripts);
  checkTemplatePlaceholders(scripts);
  await checkSchemaValidity(args.lock);
  runFaultInjection();
  runA11yScopingInjection();
  if (args.selfTest) runSelfTest();

  // ---- report (mirrors adherence-lint.mjs conventions)
  console.log('contract-guard — mechanical CONTRACT.md enforcement (engine)');
  console.log(`  contract: ${contractPath}`);
  console.log(`  scripts:  ${SCRIPT_DIR}  (${scripts.size} script(s), ${invocations.length} documented invocation(s))\n`);

  const order = new Map(SECTIONS.map((s, i) => [s, i]));
  findings.sort((a, b) => (order.get(a.section) ?? 99) - (order.get(b.section) ?? 99));
  for (const f of findings) {
    console.log(`[${f.level}] ${f.section} — ${f.loc} — ${f.detail}`);
  }
  if (findings.length === 0) console.log('No findings.');

  console.log('\nSection summary:');
  for (const s of SECTIONS) {
    if (s === 'self-test' && !args.selfTest) {
      console.log(`  ${s.padEnd(22)} not run (--self-test)`);
      continue;
    }
    const e = findings.filter((f) => f.section === s && f.level === 'ERROR').length;
    const w = findings.filter((f) => f.section === s && f.level === 'WARN').length;
    const k = findings.filter((f) => f.section === s && f.level === 'SKIP').length;
    const status = e ? `${e} ERROR${w ? `, ${w} WARN` : ''}` : w ? `${w} WARN` : k ? 'skipped' : 'ok';
    console.log(`  ${s.padEnd(22)} ${status}`);
  }

  const errors = findings.filter((f) => f.level === 'ERROR').length;
  const warns = findings.filter((f) => f.level === 'WARN').length;
  const skips = findings.filter((f) => f.level === 'SKIP').length;
  if (errors > 0) {
    console.log(`\nRESULT: FAIL — ${errors} error(s), ${warns} warning(s), ${skips} skipped (exit 1: fidelity/lint failure — a CONTRACT.md invariant is broken; conform the part or change CONTRACT.md first)`);
    process.exit(1);
  }
  console.log(`\nRESULT: PASS — 0 error(s), ${warns} warning(s), ${skips} skipped (exit 0)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`contract-guard crashed: ${e.stack || e}`);
  console.error('exit 2 (setup/usage error)');
  process.exit(2);
});
