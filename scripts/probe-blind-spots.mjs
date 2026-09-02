#!/usr/bin/env node
// probe-blind-spots.mjs, measure a capture's blind spots instead of writing them down.
//
// Every gate has a blind spot shaped like its metric. On the first production capture the
// blind spots were found by hand: a font-family swap on a five-letter component title
// changed 515 to 720 rendered pixels and scored 0.0000% on the pixel gate; the same swap on
// a full screen scored 2.08%, four times the ceiling; a +20-per-channel colour error on
// 376px passed both gates. Those experiments then got written into a hand-maintained
// markdown file, which goes stale the day a gate changes. This script IS the experiment: it
// injects a fixed set of faults into a fresh copy of a screen, one at a time, runs the real
// pipeline against each, and reports which gate (if any) caught it.
//
// NOTHING IN THE CALLER'S TREE IS TOUCHED. Every fault gets its own fresh copy of the lock's
// directory built under os.tmpdir(), just the lock file, the probed screen's html, and
// whatever it references relatively (assets/, fonts/, the reference PNG), following the
// same copy-to-tmpdir discipline contract-guard.mjs's --self-test uses for fixtures/golden.
// render.mjs and diff.mjs run against that temp copy only; their .render/ and .report/
// writes land in the temp dir, never in the real lock's directory. The ONE sanctioned write
// outside the temp dir is the report this script itself produces, next to the REAL lock
// (the same place diff.mjs writes its reports), or under --out <dir> when given.
//
// Usage:
//   node scripts/probe-blind-spots.mjs --lock <path/to/design-lock.json> --screen <id>
//     [--faults <comma,list>] [--json] [--out <dir>]
//
// Faults (each applied ALONE to a fresh copy, as a <style> block appended just before
// </head> or </html>):
//   font-family      * { font-family: system-ui, sans-serif !important; }
//   letter-spacing   * { letter-spacing: 0.3px !important; }
//   font-weight      * { font-weight: 600 !important; }
//   colour-shift-20  the first tokens.colors.light[...] whose CSS variable is found in the
//                     screen's html or assets/tokens.css, overridden in :root, shifted 20
//                     PER CHANNEL AWAY FROM THE NEAREST CLAMP: channel v becomes v-20 when
//                     v+20 would exceed 255, else v+20, so the true delta on every channel
//                     is always exactly 20, never quietly shortened by clamping into 255 (a
//                     near-white token shifted "+20" that clamps to 255 is really an 8-level
//                     shift wearing a 20-level label; that was a probe defect, not a finding)
//   colour-shift-40  same rule, magnitude 40
// Both colour-shift rows record the before/after hex and the pixelmatch YIQ delta of that
// exact shift against pixelmatch's own cutoff (35215 * PIXELMATCH_THRESHOLD^2, the same
// formula diff.mjs's `pixelmatch` dependency uses internally), so the reader can see, by
// construction, whether the injected shift was ever visible to the pixel gate's colour
// metric before even looking at globalPct.
// `baseline` (no fault) always runs first, so the table shows what the unmodified copy
// scores. `--faults` restricts which of the five run; baseline is not one of the five and
// cannot be excluded.
//
// If the lock enforces font parity (fonts[].fontChecks), render.mjs may exit 4 on the
// font-family fault. That is recorded as `render exit 4` and treated as CAUGHT (by the font-
// parity gate, before the fault ever reaches the pixel gate), a legitimate table entry, not
// weakened to force a pixel-gate measurement.
//
// census: if scripts/colour-census.mjs exists at run time it is spawned the same way as
// diff.mjs (--lock <temp-lock> --screen <id>). The sibling package's contract is exact, not
// guessed: it writes .report/<screenId>.census.json next to the lock it ran against, and
// exits 0 clean / 1 reported findings / 2 setup error. This script reads exactly that file
// and that exit code, no filename guessing. If the script ran but that file is absent, the
// column reads `census: no report` and the fault is treated as not caught (an integration
// that silently produced nothing is a broken integration, not evidence either way). If the
// script is absent (as it is in this worktree), the column reads `not installed` and
// contributes nothing to the verdict.
//
// Output: a table, one row per fault (baseline first), then a summary line naming every
// fault caught by nothing.
// Writes: <lockDir-or---out>/.report/<id>.blind-spots.json, rows + pixelmatchThreshold + date.
//
// Exit codes: 0 run completed (blind spots are information, not a failure) ·
//             2 setup/usage error · 5 baseline render failed (nothing else can be measured).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PIXELMATCH_THRESHOLD } from './pixelmatch-threshold.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RENDER_SCRIPT = path.join(SCRIPT_DIR, 'render.mjs');
const DIFF_SCRIPT = path.join(SCRIPT_DIR, 'diff.mjs');
const CENSUS_SCRIPT = path.join(SCRIPT_DIR, 'colour-census.mjs');
const CHILD_TIMEOUT_MS = 120_000;

const KNOWN_FAULTS = ['font-family', 'letter-spacing', 'font-weight', 'colour-shift-20', 'colour-shift-40'];
const FAULT_CSS = {
  'font-family': '* { font-family: system-ui, sans-serif !important; }',
  'letter-spacing': '* { letter-spacing: 0.3px !important; }',
  'font-weight': '* { font-weight: 600 !important; }',
};

// ---------------------------------------------------------------------------- usage / exit

function usage() {
  return [
    'Usage: node scripts/probe-blind-spots.mjs --lock <path/to/design-lock.json> --screen <id>',
    '         [--faults <comma,list>] [--json] [--out <dir>]',
    '',
    '  --lock     path to design-lock.json',
    '  --screen   screen id to probe (must have a referenceImage + thresholds, i.e. not netNew)',
    '  --faults   comma-separated subset of: ' + KNOWN_FAULTS.join(', '),
    '             (default: all five). baseline always runs first regardless.',
    '  --json     print the report JSON to stdout instead of the human table',
    '  --out      directory to write <id>.blind-spots.json into (default: <lockDir>/.report)',
    '',
    'Nothing in the lock\'s real directory is written to except the report above (or --out).',
    'Every fault runs against a fresh temp copy of the lock + screen html + assets/fonts/reference.',
    '',
    'Exit: 0 run completed (blind spots are information) · 2 setup/usage · 5 baseline render failed',
  ].join('\n');
}

function fail2(...lines) {
  console.error('probe-blind-spots: exit 2 (setup/usage error)');
  for (const l of lines) console.error(`  ${l}`);
  console.error('');
  console.error(usage());
  process.exit(2);
}

// ---------------------------------------------------------------------------- args

function parseArgs(argv) {
  const args = { lock: null, screen: null, faults: null, json: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
    else if (a === '--lock') args.lock = argv[++i];
    else if (a === '--screen') args.screen = argv[++i];
    else if (a === '--faults') args.faults = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--out') args.out = argv[++i];
    else fail2(`unknown argument '${a}'`);
  }
  if (!args.lock) fail2('--lock is required');
  if (!args.screen) fail2('--screen is required');
  if (args.faults !== null) {
    const names = args.faults.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) fail2('--faults given but empty');
    for (const n of names) {
      if (!KNOWN_FAULTS.includes(n)) {
        fail2(`--faults names unknown fault '${n}'`, `known faults: ${KNOWN_FAULTS.join(', ')}`);
      }
    }
    args.faults = names;
  }
  return args;
}

// ---------------------------------------------------------------------------- lock / screen

function loadLock(lockPath) {
  let raw;
  try { raw = fs.readFileSync(lockPath, 'utf8'); }
  catch (e) { fail2(`cannot read lock '${lockPath}': ${e.message}`); }
  try { return JSON.parse(raw); }
  catch (e) { fail2(`lock '${lockPath}' is not valid JSON: ${e.message}`); }
}

function findScreen(lock, id) {
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  const screen = screens.find((s) => s && s.id === id);
  if (!screen) {
    fail2(`screen '${id}' not found in the lock`, `available: ${screens.map((s) => s?.id).filter(Boolean).join(', ') || '(none)'}`);
  }
  return screen;
}

function checkPreconditions(screen, lockDir) {
  if (screen.netNew === true) {
    fail2(`screen '${screen.id}' is netNew, it has no referenceImage/passThreshold/tileCeiling to probe blind spots against`);
  }
  if (typeof screen.referenceImage !== 'string' || !screen.referenceImage) {
    fail2(`screen '${screen.id}' has no referenceImage, nothing for the pixel gate to compare against`);
  }
  if (!(typeof screen.passThreshold === 'number') || !(typeof screen.tileCeiling === 'number')) {
    fail2(`screen '${screen.id}' has no numeric passThreshold/tileCeiling, the pixel gate cannot render a verdict`);
  }
  if (typeof screen.url !== 'string' || !screen.url) {
    fail2(`screen '${screen.id}' has no url`);
  }
  // Same test render.mjs's own resolveScreenUrl uses to decide "already a URL" vs "lock-
  // relative path", http(s) and file:// are both out of scope: this probe copies real
  // filesystem paths into a temp dir, and only a lock-relative path names one.
  if (/^(https?|file):\/\//i.test(screen.url)) {
    fail2(`screen '${screen.id}' url '${screen.url}' is not a local html file relative to the lock dir`,
      'the probe only supports a lock-relative local file (skipping http(s)/file:// screens)');
  }
  const htmlAbs = path.resolve(lockDir, screen.url);
  if (!fs.existsSync(htmlAbs)) {
    fail2(`screen '${screen.id}' url resolves to ${htmlAbs}, which does not exist`);
  }
  return htmlAbs;
}

// ---------------------------------------------------------------------------- colour token

function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// Shift each channel AWAY from the nearest clamp (0/255), so the true per-channel delta is
// always exactly `delta` and never quietly shortened by clamping, a channel already near
// 255 shifted "+20" the naive way clamps to 255, which can be an 8-level shift wearing a
// 20-level label. delta is 20 or 40 here, always << 128, so v+delta>255 and v-delta<0 can
// never both hold for the same channel, no further clamping is needed.
function shiftAwayFromClamp(hex, delta) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const shift = (v) => (v + delta > 255 ? v - delta : v + delta);
  return rgbToHex({ r: shift(rgb.r), g: shift(rgb.g), b: shift(rgb.b) });
}

// pixelmatch's own YIQ colour-distance metric (node_modules/pixelmatch/index.js
// colorDelta()), reproduced here read-only so a colour-shift fault can report, by
// construction, whether it was ever visible to the pixel gate's colour metric, both
// pixels are treated as fully opaque (alpha 255), the case that applies to every rendered
// screenshot this engine diffs.
function yiqDelta(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return null;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
  const i = dr * 0.59597799 - dg * 0.27417610 - db * 0.32180189;
  const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

// The same cutoff pixelmatch computes internally (35215 is its documented maximum possible
// YIQ delta): a per-pixel delta at or below this is NOT a diff pixel, regardless of
// globalPct/tileCeiling, the pixel gate cannot see it.
const YIQ_CUTOFF = 35215 * PIXELMATCH_THRESHOLD * PIXELMATCH_THRESHOLD;

/**
 * The FIRST key of tokens.colors.light (insertion order) whose CSS variable name (--<key>,
 * the convention every screen and assets/tokens.css follow) is textually present in the
 * screen's html or in assets/tokens.css. Returns null when none match.
 */
function findColourToken(lock, htmlContent, tokensCssContent, searchedFiles) {
  const light = lock?.tokens?.colors?.light;
  if (!light || typeof light !== 'object') {
    return { token: null, reason: 'lock has no tokens.colors.light', searchedFiles };
  }
  for (const [key, value] of Object.entries(light)) {
    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) continue;
    const varName = `--${key}`;
    if (htmlContent.includes(varName) || (tokensCssContent && tokensCssContent.includes(varName))) {
      return { token: { key, value, varName }, reason: null, searchedFiles };
    }
  }
  return {
    token: null,
    reason: `no tokens.colors.light key's CSS variable (--<key>) appears in ${searchedFiles.join(' or ')}`,
    searchedFiles,
  };
}

// ---------------------------------------------------------------------------- temp copy

/**
 * Builds a MINIMAL fresh copy of what a fault needs to run the real pipeline: the lock file,
 * the probed screen's html, and whatever it references relatively (assets/, fonts/, the
 * reference PNG), same discipline as contract-guard.mjs's --self-test copy of
 * fixtures/golden, narrowed to one screen's dependencies instead of the whole directory.
 * Returns the temp lock path and temp html path.
 */
function buildMinimalCopy(lockPath, lockDir, screen, htmlAbs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-blind-spot-'));
  const tempLockPath = path.join(tmp, path.basename(lockPath));
  fs.copyFileSync(lockPath, tempLockPath);

  const htmlRel = path.relative(lockDir, htmlAbs);
  const tempHtmlPath = path.join(tmp, htmlRel);
  fs.mkdirSync(path.dirname(tempHtmlPath), { recursive: true });
  fs.copyFileSync(htmlAbs, tempHtmlPath);

  for (const dir of ['assets', 'fonts']) {
    const src = path.join(lockDir, dir);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(tmp, dir), { recursive: true });
  }

  if (typeof screen.referenceImage === 'string') {
    const refAbs = path.resolve(lockDir, screen.referenceImage);
    if (fs.existsSync(refAbs)) {
      const refRel = path.relative(lockDir, refAbs);
      const refDest = path.join(tmp, refRel);
      fs.mkdirSync(path.dirname(refDest), { recursive: true });
      fs.copyFileSync(refAbs, refDest);
    }
  }

  return { tmp, tempLockPath, tempHtmlPath };
}

function injectStyle(html, css) {
  const block = `<style>\n${css}\n</style>\n`;
  if (html.includes('</head>')) return html.replace('</head>', `${block}</head>`);
  if (html.includes('</html>')) return html.replace('</html>', `${block}</html>`);
  return html + block;
}

// ---------------------------------------------------------------------------- child runners

function runChild(scriptPath, cliArgs) {
  const res = spawnSync(process.execPath, [scriptPath, ...cliArgs], {
    encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024,
  });
  const timedOut = Boolean(res.error && res.error.code === 'ETIMEDOUT');
  let exitCode;
  if (res.error && !timedOut) exitCode = null; // could not spawn at all
  else if (timedOut || res.status === null) exitCode = 5;
  else exitCode = res.status;
  return {
    exitCode, timedOut,
    spawnError: res.error ? String(res.error.message ?? res.error) : null,
    stdout: res.stdout ?? '', stderr: res.stderr ?? '',
  };
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// The sibling package's contract is exact, not guessed: colour-census.mjs writes
// .report/<screenId>.census.json next to the lock it ran against, and exits 0 clean / 1
// reported findings / 2 setup error. Read exactly that file and that exit code, no
// filename guessing. reportFound=false after a run (script present, exit code returned, no
// file) means the integration produced nothing where its own contract says it would; that
// is reported as `census: no report`, not silently treated as a pass.
function runCensus(tempLockPath, id) {
  const res = runChild(CENSUS_SCRIPT, ['--lock', tempLockPath, '--screen', id]);
  if (res.exitCode === null) return { ran: false, error: res.spawnError };
  const reportPath = path.join(path.dirname(tempLockPath), '.report', `${id}.census.json`);
  const report = readJsonSafe(reportPath);
  let findings = null;
  if (report) {
    for (const k of ['findings', 'findingsCount', 'count']) {
      const v = report[k];
      if (typeof v === 'number') { findings = v; break; }
      if (Array.isArray(v)) { findings = v.length; break; }
    }
  }
  return { ran: true, exitCode: res.exitCode, reportFound: Boolean(report), findings, stderrTail: tail(res.stderr) };
}

function tail(text, n = 6) {
  const t = (text ?? '').trim();
  return t ? t.split('\n').slice(-n).join(' | ') : '';
}

// ---------------------------------------------------------------------------- one fault

function probeOneFault({ name, cssOrNull, colourToken, lockPath, lockDir, screen, htmlAbs, censusInstalled }) {
  const { tmp, tempLockPath, tempHtmlPath } = buildMinimalCopy(lockPath, lockDir, screen, htmlAbs);
  try {
    if (cssOrNull) {
      const pristine = fs.readFileSync(tempHtmlPath, 'utf8');
      fs.writeFileSync(tempHtmlPath, injectStyle(pristine, cssOrNull));
    }

    const rres = runChild(RENDER_SCRIPT, ['--lock', tempLockPath, '--screen', screen.id]);
    const renderExit = rres.exitCode;
    if (renderExit === null || renderExit !== 0) {
      return {
        fault: name, notApplicable: false,
        renderExit, renderEvidence: renderExit === null ? rres.spawnError : tail(rres.stderr),
        pixelCell: `n/a (render exit ${renderExit ?? 'spawn-failed'})`,
        censusCell: censusInstalled ? `n/a (render exit ${renderExit ?? 'spawn-failed'})` : 'not installed',
        verdict: name === 'baseline' ? 'n/a (baseline)' : `render (exit ${renderExit ?? 'spawn-failed'})`,
        caught: name !== 'baseline',
      };
    }

    const dres = runChild(DIFF_SCRIPT, ['--lock', tempLockPath, '--screen', screen.id]);
    const diffExit = dres.exitCode;
    const diffReport = readJsonSafe(path.join(tmp, '.report', `${screen.id}.report.json`));
    let pixelCell, pixelCaught;
    if (diffExit === 0 || diffExit === 1) {
      const pct = typeof diffReport?.globalPct === 'number' ? diffReport.globalPct : null;
      pixelCell = `${pct === null ? '?' : (pct * 100).toFixed(4)}% ${diffExit === 0 ? 'PASS' : 'FAIL'}`;
      pixelCaught = diffExit === 1;
    } else {
      pixelCell = `diff exit ${diffExit ?? 'spawn-failed'}`;
      pixelCaught = false; // undetermined, not counted as caught
    }

    let censusCell = 'not installed';
    let censusCaught = false;
    if (censusInstalled) {
      const cres = runCensus(tempLockPath, screen.id);
      if (!cres.ran) {
        censusCell = `error: ${cres.error}`;
      } else if (cres.exitCode !== 0 && cres.exitCode !== 1) {
        censusCell = `census exit ${cres.exitCode}`;
      } else if (!cres.reportFound) {
        censusCell = 'census: no report';
      } else {
        censusCell = `${cres.findings === null ? '?' : cres.findings} finding(s) ${cres.exitCode === 0 ? 'PASS' : 'FAIL'}`;
        censusCaught = cres.exitCode === 1;
      }
    }

    let verdict;
    if (name === 'baseline') verdict = 'n/a (baseline)';
    else if (pixelCaught && censusCaught) verdict = 'both';
    else if (pixelCaught) verdict = 'pixel';
    else if (censusCaught) verdict = 'census';
    else verdict = 'NONE';

    return {
      fault: name, notApplicable: false,
      renderExit, pixelCell, censusCell, verdict,
      caught: name !== 'baseline' && (pixelCaught || censusCaught),
      colourToken: colourToken ?? undefined,
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lockPath = path.resolve(args.lock);
  const lockDir = path.dirname(lockPath);
  const lock = loadLock(lockPath);
  const screen = findScreen(lock, args.screen);
  const htmlAbs = checkPreconditions(screen, lockDir);

  const htmlContent = fs.readFileSync(htmlAbs, 'utf8');
  const tokensCssPath = path.join(lockDir, 'assets', 'tokens.css');
  const tokensCssExists = fs.existsSync(tokensCssPath);
  const tokensCssContent = tokensCssExists ? fs.readFileSync(tokensCssPath, 'utf8') : null;
  const searchedFiles = [path.relative(lockDir, htmlAbs)].concat(tokensCssExists ? ['assets/tokens.css'] : []);
  const { token: colourToken, reason: colourReason } = findColourToken(lock, htmlContent, tokensCssContent, searchedFiles);

  const censusInstalled = fs.existsSync(CENSUS_SCRIPT);
  const faultNames = args.faults ?? KNOWN_FAULTS;

  const rows = [];

  // Baseline first (CONTRACT: shows what the unmodified copy scores).
  rows.push(probeOneFault({
    name: 'baseline', cssOrNull: null, colourToken: null,
    lockPath, lockDir, screen, htmlAbs, censusInstalled,
  }));
  if (rows[0].renderExit !== 0) {
    console.error(`probe-blind-spots: exit 5, baseline render failed (exit ${rows[0].renderExit ?? 'spawn-failed'}) on screen '${screen.id}'`);
    if (rows[0].renderEvidence) console.error(`  ${rows[0].renderEvidence}`);
    console.error('  nothing else can be measured against a screen that will not render cleanly.');
    process.exit(5);
  }

  for (const name of faultNames) {
    if (name === 'colour-shift-20' || name === 'colour-shift-40') {
      if (!colourToken) {
        rows.push({ fault: name, notApplicable: true, reason: colourReason, verdict: 'not applicable' });
        continue;
      }
      const delta = name === 'colour-shift-20' ? 20 : 40;
      const shifted = shiftAwayFromClamp(colourToken.value, delta);
      const css = `:root { ${colourToken.varName}: ${shifted}; }`;
      const delta_yiq = yiqDelta(colourToken.value, shifted);
      rows.push(probeOneFault({
        name, cssOrNull: css,
        colourToken: {
          ...colourToken, before: colourToken.value, after: shifted, delta,
          yiqDelta: delta_yiq, yiqCutoff: YIQ_CUTOFF,
          underCutoff: delta_yiq !== null && delta_yiq <= YIQ_CUTOFF,
        },
        lockPath, lockDir, screen, htmlAbs, censusInstalled,
      }));
    } else {
      rows.push(probeOneFault({
        name, cssOrNull: FAULT_CSS[name], colourToken: null,
        lockPath, lockDir, screen, htmlAbs, censusInstalled,
      }));
    }
  }

  const blindSpots = rows.filter((r) => !r.notApplicable && r.fault !== 'baseline' && r.verdict === 'NONE').map((r) => r.fault);

  // ---- report (next to the REAL lock, or --out) -----------------------------------------
  const outDir = args.out ? path.resolve(args.out) : path.join(lockDir, '.report');
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `${screen.id}.blind-spots.json`);
  const report = {
    tool: 'probe-blind-spots.mjs',
    lock: lockPath,
    screen: screen.id,
    date: new Date().toISOString().slice(0, 10),
    pixelmatchThreshold: PIXELMATCH_THRESHOLD,
    passThreshold: screen.passThreshold,
    tileCeiling: screen.tileCeiling,
    censusInstalled,
    colourToken: colourToken ? { key: colourToken.key, value: colourToken.value, varName: colourToken.varName } : null,
    colourTokenReason: colourToken ? null : colourReason,
    rows,
    blindSpots,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  // ---- output -----------------------------------------------------------------------------
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`probe-blind-spots, lock: ${lockPath}  screen: ${screen.id}`);
    console.log(`  pixelmatchThreshold ${PIXELMATCH_THRESHOLD}  passThreshold ${screen.passThreshold}  tileCeiling ${screen.tileCeiling}`);
    console.log(`  census: ${censusInstalled ? 'installed' : 'not installed'}`);
    if (colourToken) {
      console.log(`  colour token: ${colourToken.key} (${colourToken.varName} = ${colourToken.value})`);
    } else {
      console.log(`  colour token: none found, ${colourReason}`);
    }
    console.log('');
    const w = { fault: 16, render: 12, pixel: 22, census: 20, verdict: 20 };
    const row = (a, b, c, d, e) =>
      console.log(`  ${a.padEnd(w.fault)}${b.padEnd(w.render)}${c.padEnd(w.pixel)}${d.padEnd(w.census)}${e}`);
    row('fault', 'render exit', 'pixel gate', 'census', 'caught by');
    for (const r of rows) {
      if (r.notApplicable) {
        row(r.fault, '--', 'not applicable', 'not applicable', `not applicable, ${r.reason}`);
        continue;
      }
      row(r.fault, String(r.renderExit ?? 'spawn-failed'), r.pixelCell, r.censusCell, r.verdict);
      if (r.colourToken && typeof r.colourToken.yiqDelta === 'number') {
        const ct = r.colourToken;
        console.log(`  ${''.padEnd(w.fault)}${ct.before} -> ${ct.after} (delta ${ct.delta}/channel)  yiqDelta ${ct.yiqDelta.toFixed(2)} vs cutoff ${ct.yiqCutoff.toFixed(2)} -> ${ct.underCutoff ? 'UNDER cutoff (invisible to the pixel gate by construction)' : 'over cutoff (visible to the pixel gate by construction)'}`);
      }
    }
    console.log('');
    console.log(blindSpots.length
      ? `blind spots: ${blindSpots.join(', ')}`
      : 'no blind spots among the probed faults');
    console.log(`report: ${reportPath}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(`probe-blind-spots crashed: ${e.stack || e}`);
  process.exit(2);
});
