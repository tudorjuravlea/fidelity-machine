#!/usr/bin/env node
/**
 * verify.mjs — orchestrator.
 *
 * Encodes CONTRACT.md §Three-gate ship ordering and §Loop control.
 * Per screen, in order:
 *   1. Content/compliance gate — adherence-lint.mjs runs FIRST; a lint ERROR blocks the
 *      screen regardless of visuals (compliance > clarity > motivation).
 *   2. Taste self-critique — model gate, not scriptable; its place is noted in the report.
 *   3. render.mjs → geometry.mjs (structure before pixels; exits 0 on all-no-ground-truth
 *      B2 screens) → diff.mjs (pixel gate).
 * A failed gate short-circuits the later gates for that screen — the ordering is the
 * priority, not just a sequence.
 *
 * Children are spawned as CLIs (their CLIs are the contract); their exit codes are mapped
 * to the CONTRACT meanings in the report. Nothing is imported from sibling scripts.
 *
 * Outputs (next to the lock):
 *   .report/verify-report.json          — aggregate report
 *   .report/<screenId>.history.json     — loop-control memory, appended per measured run
 *
 * Loop control (CONTRACT §Loop control): <=4 rounds per screen; keep best-so-far; a fix
 * that worsens globalPct prints a REGRESSION notice; two consecutive rounds improving
 * < 10% relative prints a STOP notice. The model drives the actual fix rounds — this
 * script only provides the memory and the notices.
 *
 * --calibrate: render the control screen twice (second render invoked with env
 * RENDER_SUFFIX=.calib), diff the two renders inline (masks applied), and write the
 * measured meta.noiseFloorPct into the lock IN PLACE — the one sanctioned lock write.
 *
 * Invocation:
 *   node verify.mjs --lock <design-lock.json> [--screen <id>] [--calibrate] [--src <dir>]
 *
 * Exit codes (CONTRACT §Exit codes):
 *   0 pass · 1 fidelity/lint failure · 2 setup/usage error · 3 DIMENSION_MISMATCH ·
 *   4 FONT_PARITY · 5 render failure/timeout. Codes 2/3/4/5 from children are
 *   propagated; the report and stderr name the child.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const CHILD_TIMEOUT_MS = 180_000;
const MAX_ROUNDS = 4;
const MIN_RELATIVE_IMPROVEMENT = 0.10;

const GATE_SCRIPTS = {
  lint: 'adherence-lint.mjs',
  render: 'render.mjs',
  geometry: 'geometry.mjs',
  diff: 'diff.mjs',
};

const EXIT_MEANING = {
  0: 'pass',
  1: 'fidelity/lint failure — real finding, feed evidence back to the model',
  2: 'setup/usage error (missing dep, bad args, unparseable lock)',
  3: 'DIMENSION_MISMATCH — render dims != reference dims (config error, NOT a fix target; never silently resample)',
  4: 'FONT_PARITY — a required document.fonts.check() failed; refused to screenshot a fallback',
  5: 'render failure/timeout (environment)',
};

const TASTE_GATE_NOTE =
  'model gate — not scriptable. The taste self-critique (SKILL.md re-weighted 5-dimension review) '
  + 'runs between the content/compliance gate and the geometry/pixel gates; bottom band => redo.';

function meaning(code) {
  return EXIT_MEANING[code] ?? `unknown exit code ${code}`;
}

function die(code, msg) {
  process.stderr.write(`verify: ${msg}\n  [exit ${code} — ${meaning(code)}]\n`);
  process.exit(code);
}

function pctFmt(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? `${(v * 100).toFixed(4)}%` : 'n/a';
}

function tail(text, lines = 14) {
  const t = (text ?? '').trim();
  return t ? t.split('\n').slice(-lines).join('\n') : '';
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** Extract a number from a raw report value that may be a number or an object. */
function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object') {
    for (const k of ['pct', 'density', 'diffPct', 'value', 'ratio']) {
      if (typeof v[k] === 'number' && Number.isFinite(v[k])) return v[k];
    }
  }
  return null;
}

// ---------------------------------------------------------------- arg parsing

function printUsage() {
  process.stdout.write(
`Usage: node verify.mjs --lock <design-lock.json> [--screen <id>] [--calibrate] [--src <dir>]

  --lock       path to design-lock.json (the SSOT); .render/ and .report/ are created next to it
  --screen     verify a single screen id (default: every screen in the lock)
  --calibrate  measure the render noise floor (two renders, inline masked pixelmatch) and
               write meta.noiseFloorPct into the lock in place (the one sanctioned lock write)
  --src        generated-source directory, passed through to adherence-lint.mjs

Exit codes: 0 pass · 1 fidelity/lint failure · 2 setup/usage · 3 DIMENSION_MISMATCH · 4 FONT_PARITY · 5 render failure/timeout
`);
}

function parseArgs(argv) {
  const args = { lock: null, screen: null, calibrate: false, src: null };
  const takeValue = (i, flag) => {
    const v = argv[i];
    if (v === undefined || v.startsWith('--')) die(2, `flag ${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lock') args.lock = takeValue(++i, '--lock');
    else if (a === '--screen') args.screen = takeValue(++i, '--screen');
    else if (a === '--calibrate') args.calibrate = true;
    else if (a === '--src') args.src = takeValue(++i, '--src');
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    else die(2, `unknown argument '${a}' — run with --help for usage`);
  }
  if (!args.lock) die(2, 'missing required --lock <path/to/design-lock.json> — run with --help for usage');
  return args;
}

// ---------------------------------------------------------------- lock loading

function readLock(lockPath) {
  let raw;
  try { raw = fs.readFileSync(lockPath, 'utf8'); }
  catch (e) { die(2, `cannot read lock '${lockPath}': ${e.message}`); }
  let lock;
  try { lock = JSON.parse(raw); }
  catch (e) { die(2, `lock '${lockPath}' is not valid JSON: ${e.message}`); }
  if (!Array.isArray(lock.screens) || lock.screens.length === 0) {
    die(2, `lock '${lockPath}' has no screens[] — nothing to verify`);
  }
  return { lock, raw };
}

// ---------------------------------------------------------------- child runner

function runChild(scriptFile, cliArgs, extraEnv = {}) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptFile);
  if (!fs.existsSync(scriptPath)) {
    return {
      missing: true, scriptPath, exitCode: 2, timedOut: false, spawnError: null,
      stdout: '', stderr: `${scriptFile} not found at ${scriptPath}`,
    };
  }
  const res = spawnSync(process.execPath, [scriptPath, ...cliArgs], {
    encoding: 'utf8',
    timeout: CHILD_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  });
  const timedOut = Boolean(res.error && res.error.code === 'ETIMEDOUT');
  let exitCode;
  if (timedOut) exitCode = 5;                    // render failure/timeout semantics
  else if (res.error) exitCode = 2;              // could not spawn at all
  else if (res.status === null) exitCode = 5;    // killed by signal
  else exitCode = res.status;
  return {
    missing: false, scriptPath, exitCode, timedOut,
    spawnError: res.error ? String(res.error.message ?? res.error) : null,
    stdout: res.stdout ?? '', stderr: res.stderr ?? '',
  };
}

function gateFromChild(res) {
  if (res.missing) {
    return {
      status: 'missing-script', exitCode: 2,
      meaning: `setup error — ${path.basename(res.scriptPath)} not found at ${res.scriptPath}`,
    };
  }
  const ok = res.exitCode === 0;
  const gate = {
    status: res.timedOut ? 'timeout' : (ok ? 'pass' : 'fail'),
    exitCode: res.exitCode,
    meaning: meaning(res.exitCode),
  };
  if (res.spawnError) gate.spawnError = res.spawnError;
  if (!ok) {
    const evidence = tail(res.stderr) || tail(res.stdout);
    if (evidence) gate.evidence = evidence;
  }
  return gate;
}

function skippedGate(reason) {
  return { status: 'skipped', exitCode: null, meaning: reason };
}

// ---------------------------------------------------------------- loop control

/**
 * Append this run to .report/<id>.history.json and derive the loop-control notices.
 * History entries are {round, globalPct, worstTile, timestamp:'frozen'} — the timestamp is
 * the literal string 'frozen' on purpose: artifacts stay byte-deterministic across runs.
 * Notices are only produced for screens that did NOT pass (a passing screen ends the loop).
 */
function updateHistory(reportDir, screenId, globalPct, worstTile, screenPassed) {
  const historyPath = path.join(reportDir, `${screenId}.history.json`);
  let history = readJsonSafe(historyPath);
  if (!Array.isArray(history)) history = [];
  const priorNums = history.map((e) => e?.globalPct).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const priorBest = priorNums.length ? Math.min(...priorNums) : null;

  const round = history.length + 1;
  history.push({ round, globalPct, worstTile, timestamp: 'frozen' });
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');

  const messages = [];
  if (!screenPassed) {
    if (priorBest !== null && globalPct > priorBest) {
      messages.push(`REGRESSION vs best (${pctFmt(globalPct)} vs ${pctFmt(priorBest)}) — revert the last fix`);
    }
    const nums = history.map((e) => e?.globalPct).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (nums.length >= 3) {
      const [a, b, c] = nums.slice(-3);
      const rel = (prev, curr) => (prev > 0 ? (prev - curr) / prev : 0);
      if (rel(a, b) < MIN_RELATIVE_IMPROVEMENT && rel(b, c) < MIN_RELATIVE_IMPROVEMENT) {
        messages.push('STOP: no meaningful progress in 2 rounds — stop and report to the user rather than thin-retrying');
      }
    }
    if (history.length >= MAX_ROUNDS) {
      messages.push(`STOP: fix budget exhausted (${history.length} rounds >= ${MAX_ROUNDS}) — stop and report to the user; never thin-retry into invention`);
    }
  }
  const best = priorBest === null ? globalPct : Math.min(priorBest, globalPct);
  return { round, best, messages, historyPath };
}

// ---------------------------------------------------------------- verify mode

function writeVerifyReport(reportDir, report) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'verify-report.json'), JSON.stringify(report, null, 2) + '\n');
}

function verifyScreens({ lockPath, lockDir, screens, screenFilter, srcDir }) {
  const reportDir = path.join(lockDir, '.report');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(path.join(lockDir, '.render'), { recursive: true });

  const events = [];          // ordered {code, child, screen} — first code >= 2 is propagated
  const findings = [];        // ordered {severity, text} — highest severity is the "worst finding"
  const missingScripts = new Set();

  const noteEvent = (code, child, screenId) => events.push({ code, child, screen: screenId });
  const noteFinding = (severity, text) => findings.push({ severity, text });

  // Pre-flight: setup-check.mjs (plan §3.7 — verify refuses to run until green).
  // Its absence is only noted: the four gate scripts are the hard requirement, and every
  // child fails exit 2 on missing deps by itself.
  let setupCheck;
  if (fs.existsSync(path.join(SCRIPTS_DIR, 'setup-check.mjs'))) {
    const res = runChild('setup-check.mjs', []);
    setupCheck = gateFromChild(res);
    if (res.exitCode !== 0) {
      const report = {
        tool: 'verify.mjs', mode: 'verify', timestamp: 'frozen', lock: lockPath,
        screenFilter, setupCheck, refused: 'setup-check.mjs is not green — verify refuses to run (CONTRACT: setup errors are for the human, not the fix loop)',
        screens: {}, pass: false, exitCode: 2, exitMeaning: meaning(2),
      };
      writeVerifyReport(reportDir, report);
      die(2, `setup-check.mjs not green (exit ${res.exitCode}) — run 'node ${path.join(SCRIPTS_DIR, 'setup-check.mjs')}' for the fix; verify refuses to run until green`);
    }
  } else {
    setupCheck = { status: 'absent', meaning: 'setup-check.mjs not present — pre-flight skipped; children report missing deps themselves (exit 2)' };
  }

  // Content/compliance gate is lock+src-wide (adherence-lint.mjs has no --screen in its CLI);
  // run it once and apply the result to every screen.
  let lintResult = null;
  const lintGate = () => {
    if (!lintResult) {
      const cliArgs = ['--lock', lockPath];
      if (srcDir) cliArgs.push('--src', srcDir);
      lintResult = runChild(GATE_SCRIPTS.lint, cliArgs);
    }
    return lintResult;
  };

  const screenReports = {};

  for (const screen of screens) {
    const id = screen.id;
    const gates = {};
    const blockers = [];
    let globalPct = null;
    let worstTile = null;

    // Gate 1 — content/compliance FIRST (CONTRACT §Three-gate ship ordering).
    const lres = lintGate();
    gates.lint = gateFromChild(lres);
    if (lres.missing) {
      missingScripts.add(GATE_SCRIPTS.lint);
      noteEvent(2, GATE_SCRIPTS.lint, id);
      blockers.push(`setup: ${GATE_SCRIPTS.lint} is missing — content/compliance gate could not run`);
      noteFinding(70, `[${id}] missing script ${GATE_SCRIPTS.lint} (expected in ${SCRIPTS_DIR})`);
    } else if (lres.exitCode !== 0) {
      noteEvent(lres.exitCode, GATE_SCRIPTS.lint, id);
      if (lres.exitCode === 1) {
        blockers.push('content/compliance gate: adherence-lint ERROR — blocks the screen regardless of visuals (banned jargon / missing disclosure / token drift / cap violation); fix content first');
        noteFinding(40, `[${id}] content/compliance gate failed (adherence-lint exit 1) — see gates.lint.evidence in verify-report.json`);
      } else {
        blockers.push(`adherence-lint exit ${lres.exitCode} — ${meaning(lres.exitCode)}`);
        noteFinding(65, `[${id}] adherence-lint exit ${lres.exitCode} — ${meaning(lres.exitCode)}`);
      }
    }

    // Gate 2 — taste self-critique: model-side, noted for ordering (never scripted).
    gates.taste = { status: 'model-gate', note: TASTE_GATE_NOTE };

    // A lint ERROR (or lint setup error) blocks the visual gates for this screen: the
    // three-gate ordering is a priority, and content is never rationalized by pixels.
    // A MISSING lint script does not block — orchestrate whichever scripts exist.
    const lintBlocked = !lres.missing && lres.exitCode !== 0;

    let renderOk = false;
    if (lintBlocked) {
      gates.render = skippedGate('skipped — content/compliance gate blocked this screen (three-gate ordering: content > taste > geometry/pixels)');
      gates.geometry = skippedGate('skipped — content/compliance gate blocked this screen');
      gates.diff = skippedGate('skipped — content/compliance gate blocked this screen');
    } else {
      // Gate 3a — render.
      const rres = runChild(GATE_SCRIPTS.render, ['--lock', lockPath, '--screen', id]);
      gates.render = gateFromChild(rres);
      renderOk = !rres.missing && rres.exitCode === 0;
      if (rres.missing) {
        missingScripts.add(GATE_SCRIPTS.render);
        noteEvent(2, GATE_SCRIPTS.render, id);
        blockers.push(`setup: ${GATE_SCRIPTS.render} is missing — no deterministic screenshot possible`);
        noteFinding(70, `[${id}] missing script ${GATE_SCRIPTS.render} (expected in ${SCRIPTS_DIR})`);
      } else if (!renderOk) {
        noteEvent(rres.exitCode, GATE_SCRIPTS.render, id);
        blockers.push(`render.mjs exit ${rres.exitCode} — ${meaning(rres.exitCode)}`);
        noteFinding(rres.exitCode === 4 ? 60 : rres.exitCode === 3 ? 55 : rres.exitCode === 2 ? 65 : 50,
          `[${id}] render.mjs exit ${rres.exitCode} — ${meaning(rres.exitCode)}`);
      }

      if (!renderOk) {
        gates.geometry = skippedGate('skipped — render produced no output (.render/*.png + geometry dump required)');
        gates.diff = skippedGate('skipped — render produced no output');
      } else {
        // Gate 3b — geometry (structure before pixels). Runs for B2 too: the geometry
        // script exits 0 itself when a screen has no ground-truth rects.
        const gres = runChild(GATE_SCRIPTS.geometry, ['--lock', lockPath, '--screen', id]);
        gates.geometry = gateFromChild(gres);
        const geometryMissing = gres.missing;
        const geometryOk = !geometryMissing && gres.exitCode === 0;
        if (geometryMissing) {
          missingScripts.add(GATE_SCRIPTS.geometry);
          noteEvent(2, GATE_SCRIPTS.geometry, id);
          blockers.push(`setup: ${GATE_SCRIPTS.geometry} is missing — structure gate could not run`);
          noteFinding(70, `[${id}] missing script ${GATE_SCRIPTS.geometry} (expected in ${SCRIPTS_DIR})`);
        } else if (!geometryOk) {
          noteEvent(gres.exitCode, GATE_SCRIPTS.geometry, id);
          if (gres.exitCode === 1) {
            blockers.push('geometry gate: DOM boxes out of tolerance vs the lock rects — fix layout before pixels (structure before pixels)');
            noteFinding(30, `[${id}] geometry gate failed — boxes out of tolerance; see .report/${id}.geometry.json`);
          } else {
            blockers.push(`geometry.mjs exit ${gres.exitCode} — ${meaning(gres.exitCode)}`);
            noteFinding(65, `[${id}] geometry.mjs exit ${gres.exitCode} — ${meaning(gres.exitCode)}`);
          }
        }

        // Gate 3c — diff. Runs when geometry passed, or when geometry.mjs itself is
        // missing (orchestrate whichever scripts exist). A geometry FAILURE skips the
        // diff: out-of-tolerance boxes make pixel evidence noise.
        if (geometryOk || geometryMissing) {
          const dres = runChild(GATE_SCRIPTS.diff, ['--lock', lockPath, '--screen', id]);
          gates.diff = gateFromChild(dres);
          if (dres.missing) {
            missingScripts.add(GATE_SCRIPTS.diff);
            noteEvent(2, GATE_SCRIPTS.diff, id);
            blockers.push(`setup: ${GATE_SCRIPTS.diff} is missing — pixel gate could not run`);
            noteFinding(70, `[${id}] missing script ${GATE_SCRIPTS.diff} (expected in ${SCRIPTS_DIR})`);
          } else {
            const diffReport = readJsonSafe(path.join(reportDir, `${id}.report.json`));
            if (diffReport) {
              globalPct = num(diffReport.globalPct) ?? num(diffReport.global);
              worstTile = num(diffReport.worstTile) ?? diffReport.worstTile ?? null;
              gates.diff.report = `.report/${id}.report.json`;
              gates.diff.diffPng = `.report/${id}.diff.png`;
              gates.diff.tiles = `.report/${id}.tiles/`;
            }
            if (dres.exitCode === 1) {
              noteEvent(1, GATE_SCRIPTS.diff, id);
              blockers.push(`pixel gate: globalPct ${pctFmt(globalPct)} vs pass <= ${pctFmt(screen.passThreshold)}, worstTile ${pctFmt(num(worstTile))} vs ceiling ${pctFmt(screen.tileCeiling)} — evidence in .report/${id}.tiles/ (triplet crops) + .report/${id}.diff.png`);
              noteFinding(20, `[${id}] pixel gate failed — globalPct ${pctFmt(globalPct)} (pass <= ${pctFmt(screen.passThreshold)}); fix toward the reference using the worst-tile triplets`);
            } else if (dres.exitCode !== 0) {
              noteEvent(dres.exitCode, GATE_SCRIPTS.diff, id);
              blockers.push(`diff.mjs exit ${dres.exitCode} — ${meaning(dres.exitCode)}`);
              noteFinding(dres.exitCode === 3 ? 55 : 65, `[${id}] diff.mjs exit ${dres.exitCode} — ${meaning(dres.exitCode)}`);
            }
          }
        } else {
          gates.diff = skippedGate('skipped — geometry gate failed (structure before pixels: fix boxes, then diff)');
        }
      }
    }

    const pass = ['lint', 'render', 'geometry', 'diff'].every((k) => gates[k]?.status === 'pass');

    // Loop-control bookkeeping — only rounds that produced a measurement count.
    let loop;
    if (typeof globalPct === 'number' && Number.isFinite(globalPct)) {
      const { round, best, messages, historyPath } = updateHistory(reportDir, id, globalPct, worstTile, pass);
      loop = { round, bestGlobalPct: best, messages, history: path.relative(lockDir, historyPath) };
    } else {
      loop = { note: 'no fidelity measurement this round (blocked before the diff gate) — history not appended' };
    }

    screenReports[id] = {
      mode: screen.mode ?? null,
      gates,
      pass,
      globalPct,
      worstTile,
      passThreshold: screen.passThreshold ?? null,
      tileCeiling: screen.tileCeiling ?? null,
      blockers,
      loop,
    };
  }

  const overallPass = Object.values(screenReports).every((s) => s.pass) && missingScripts.size === 0;
  const firstPropagate = events.find((e) => e.code >= 2) ?? null;
  let exitCode = 0;
  if (firstPropagate) exitCode = firstPropagate.code;
  else if (!overallPass) exitCode = 1;

  const report = {
    tool: 'verify.mjs',
    contract: 'CONTRACT.md — three-gate ship ordering (content/compliance -> taste [model gate, not scriptable] -> geometry+pixel)',
    mode: 'verify',
    timestamp: 'frozen',
    lock: lockPath,
    screenFilter,
    setupCheck,
    missingScripts: [...missingScripts],
    firstBlockingChild: firstPropagate,
    screens: screenReports,
    pass: overallPass,
    exitCode,
    exitMeaning: meaning(exitCode),
  };
  writeVerifyReport(reportDir, report);

  // ------------------------------------------------ human summary (stdout)
  const cell = (g) => {
    if (!g) return '??';
    if (g.status === 'pass') return 'ok';
    if (g.status === 'skipped') return '--';
    if (g.status === 'missing-script') return 'MISSING';
    if (g.status === 'timeout') return 'TIMEOUT';
    return `FAIL(${g.exitCode})`;
  };
  console.log(`verify — lock: ${lockPath}`);
  for (const [id, s] of Object.entries(screenReports)) {
    const g = s.gates;
    console.log(
      `${s.pass ? 'PASS' : 'FAIL'}  ${id} [${s.mode ?? '?'}]  `
      + `lint=${cell(g.lint)} render=${cell(g.render)} geometry=${cell(g.geometry)} diff=${cell(g.diff)}  `
      + `globalPct=${pctFmt(s.globalPct)} (pass <= ${pctFmt(s.passThreshold)})  worstTile=${pctFmt(num(s.worstTile))} (ceil ${pctFmt(s.tileCeiling)})`
    );
    for (const m of s.loop?.messages ?? []) console.log(`      ${m}`);
  }
  if (findings.length) {
    findings.sort((a, b) => b.severity - a.severity);
    console.log(`Worst finding: ${findings[0].text}`);
  } else {
    let closest = null;
    for (const [id, s] of Object.entries(screenReports)) {
      if (typeof s.globalPct === 'number' && typeof s.passThreshold === 'number' && s.passThreshold > 0) {
        const ratio = s.globalPct / s.passThreshold;
        if (!closest || ratio > closest.ratio) closest = { id, ratio, s };
      }
    }
    console.log(
      closest
        ? `Worst finding: none — all gates green. Closest margin: ${closest.id} at globalPct ${pctFmt(closest.s.globalPct)} of allowed ${pctFmt(closest.s.passThreshold)}`
        : 'Worst finding: none — all gates green.'
    );
  }
  console.log(`note: taste self-critique is a ${TASTE_GATE_NOTE.split('.')[0]}.`);
  console.log(`report: ${path.join(reportDir, 'verify-report.json')}`);

  if (exitCode !== 0) {
    const missNote = missingScripts.size
      ? ` missing script(s): ${[...missingScripts].join(', ')} (expected in ${SCRIPTS_DIR}).`
      : '';
    const childNote = firstPropagate
      ? ` first blocking child: ${firstPropagate.child} on screen '${firstPropagate.screen}' (exit ${firstPropagate.code}).`
      : '';
    die(exitCode, `not green.${missNote}${childNote}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- calibrate mode

function applyMasks(pngA, pngB, screen) {
  const dpr = screen.dpr ?? 1;
  const W = pngA.width;
  const H = pngA.height;
  const mask = new Uint8Array(W * H);
  for (const m of screen.maskedRegions ?? []) {
    const r = m.rect ?? m;
    const x0 = Math.max(0, Math.floor(r.x * dpr));
    const y0 = Math.max(0, Math.floor(r.y * dpr));
    const x1 = Math.min(W, Math.ceil((r.x + r.width) * dpr));
    const y1 = Math.min(H, Math.ceil((r.y + r.height) * dpr));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) mask[y * W + x] = 1;
    }
  }
  let maskedPx = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    maskedPx++;
    const o = i * 4;
    pngA.data[o] = pngA.data[o + 1] = pngA.data[o + 2] = pngA.data[o + 3] = 0;
    pngB.data[o] = pngB.data[o + 1] = pngB.data[o + 2] = pngB.data[o + 3] = 0;
  }
  return maskedPx;
}

async function calibrate({ lockPath, lockDir, rawLock, screen }) {
  let pixelmatch, PNG;
  try {
    pixelmatch = (await import('pixelmatch')).default;
    ({ PNG } = await import('pngjs'));
  } catch (e) {
    die(2, `calibration needs pixelmatch + pngjs — run 'npm i' in ${path.dirname(SCRIPTS_DIR)} (${e.message})`);
  }

  const renderDir = path.join(lockDir, '.render');
  const reportDir = path.join(lockDir, '.report');
  fs.mkdirSync(renderDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });

  const notes = [];
  const mainPng = path.join(renderDir, `${screen.id}.png`);
  const calibPng = path.join(renderDir, `${screen.id}.calib.png`);

  // Render #1 (plain).
  const r1 = runChild(GATE_SCRIPTS.render, ['--lock', lockPath, '--screen', screen.id]);
  if (r1.missing) die(2, `${GATE_SCRIPTS.render} is missing at ${r1.scriptPath} — cannot calibrate`);
  if (r1.exitCode !== 0) {
    die(r1.exitCode >= 2 && r1.exitCode <= 5 ? r1.exitCode : 5,
      `calibration render #1 failed — render.mjs exit ${r1.exitCode} (${meaning(r1.exitCode)})\n${tail(r1.stderr)}`);
  }
  if (!fs.existsSync(mainPng)) die(2, `render #1 exited 0 but ${mainPng} does not exist — render.mjs output contract broken`);

  // Preserve render #1 before render #2: if render.mjs ignores RENDER_SUFFIX and
  // overwrites <id>.png, the .calib.png copy still holds the FIRST render, so the
  // calibration always compares two independent renders.
  fs.copyFileSync(mainPng, calibPng);
  const preMtime = fs.statSync(calibPng).mtimeMs;

  // Render #2 — same invocation, with the output-suffix env passthrough.
  const r2 = runChild(GATE_SCRIPTS.render, ['--lock', lockPath, '--screen', screen.id], { RENDER_SUFFIX: '.calib' });
  if (r2.exitCode !== 0) {
    die(r2.exitCode >= 2 && r2.exitCode <= 5 ? r2.exitCode : 5,
      `calibration render #2 failed — render.mjs exit ${r2.exitCode} (${meaning(r2.exitCode)})\n${tail(r2.stderr)}`);
  }
  const postMtime = fs.existsSync(calibPng) ? fs.statSync(calibPng).mtimeMs : -1;
  const suffixHonored = postMtime > preMtime;
  if (!suffixHonored) {
    notes.push('render.mjs did not detectably honor RENDER_SUFFIX=.calib; verify pre-copied render #1 to .calib.png before render #2, so the measurement still compares two independent renders (main png = render #2, calib png = render #1).');
  }

  // Inline same-dims masked pixelmatch (CONTRACT §Diff invariants: threshold 0.1, includeAA false).
  const a = PNG.sync.read(fs.readFileSync(mainPng));
  const b = PNG.sync.read(fs.readFileSync(calibPng));
  if (a.width !== b.width || a.height !== b.height) {
    die(3, `DIMENSION_MISMATCH between the two calibration renders (${a.width}x${a.height} vs ${b.width}x${b.height}) — the renderer is not size-deterministic; fix render config before calibrating`);
  }
  const maskedPx = applyMasks(a, b, screen);
  const denom = a.width * a.height - maskedPx;
  if (denom <= 0) die(2, `masks cover the entire frame for screen '${screen.id}' — nothing left to measure`);
  const diffPixels = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1, includeAA: false });
  const noiseFloorPct = Number((diffPixels / denom).toFixed(8));

  // The one sanctioned lock write: meta.noiseFloorPct, in place, key order preserved.
  let lockObj;
  try { lockObj = JSON.parse(rawLock); }
  catch (e) { die(2, `lock became unreadable mid-run: ${e.message}`); }
  if (!lockObj.meta || typeof lockObj.meta !== 'object') die(2, 'lock has no meta object — cannot write meta.noiseFloorPct');
  const previousNoiseFloorPct = typeof lockObj.meta.noiseFloorPct === 'number' ? lockObj.meta.noiseFloorPct : null;
  lockObj.meta.noiseFloorPct = noiseFloorPct;
  fs.writeFileSync(lockPath, JSON.stringify(lockObj, null, 2) + '\n');

  const warnings = [];
  for (const s of lockObj.screens ?? []) {
    if (typeof s.passThreshold === 'number' && noiseFloorPct >= s.passThreshold) {
      warnings.push(`noiseFloorPct ${pctFmt(noiseFloorPct)} >= passThreshold ${pctFmt(s.passThreshold)} of screen '${s.id}' — that screen can NEVER pass; fix render determinism (fonts, animation, clock) rather than loosening thresholds (caps still apply)`);
    }
  }

  const report = {
    tool: 'verify.mjs',
    mode: 'calibrate',
    timestamp: 'frozen',
    lock: lockPath,
    screen: screen.id,
    renders: {
      main: path.relative(lockDir, mainPng),
      calib: path.relative(lockDir, calibPng),
      suffixHonored,
    },
    dims: { width: a.width, height: a.height },
    maskedPx,
    diffPixels,
    noiseFloorPct,
    previousNoiseFloorPct,
    notes,
    warnings,
    pass: true,
    exitCode: 0,
    exitMeaning: meaning(0),
  };
  writeVerifyReport(reportDir, report);

  console.log(`calibrate — screen '${screen.id}' rendered twice at ${a.width}x${a.height} (maskedPx ${maskedPx})`);
  console.log(`noise floor: ${pctFmt(noiseFloorPct)} (${diffPixels} differing px / ${denom} unmasked px) — written to meta.noiseFloorPct in ${lockPath}`);
  if (previousNoiseFloorPct !== null) console.log(`previous meta.noiseFloorPct: ${pctFmt(previousNoiseFloorPct)}`);
  for (const n of notes) console.log(`note: ${n}`);
  for (const w of warnings) console.log(`WARN: ${w}`);
  console.log(`report: ${path.join(reportDir, 'verify-report.json')}`);
  process.exit(0);
}

// ---------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2));
const lockPath = path.resolve(args.lock);
const { lock, raw } = readLock(lockPath);
const lockDir = path.dirname(lockPath);

let screens = lock.screens;
if (args.screen) {
  screens = screens.filter((s) => s.id === args.screen);
  if (screens.length === 0) {
    die(2, `screen '${args.screen}' is not in the lock; available: ${lock.screens.map((s) => s.id).join(', ')}`);
  }
}

if (args.calibrate) {
  // Calibration runs on one screen: --screen if given, else the first screen in the lock
  // (the calibration control screen by convention).
  await calibrate({ lockPath, lockDir, rawLock: raw, screen: screens[0] });
} else {
  verifyScreens({ lockPath, lockDir, screens, screenFilter: args.screen ?? null, srcDir: args.src ? path.resolve(args.src) : null });
}
