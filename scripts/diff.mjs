#!/usr/bin/env node
/**
 * diff.mjs — the pixel ship gate.
 *
 * Compares the deterministic render (.render/<id>.png, produced by render.mjs) against the
 * screen's referenceImage and decides ship / no-ship:
 *
 *   PASS  ⇔  globalPct ≤ screen.passThreshold  AND  worstTile ≤ screen.tileCeiling
 *
 * Invocation (CONTRACT.md):
 *   node scripts/diff.mjs --lock <path/to/design-lock.json> [--screen <id>] [--make-reference]
 *
 * Reads   <lockDir>/<screen.referenceImage>          reference PNG (Figma-rendered — see provenance)
 *         <lockDir>/.render/<id>.png                 render.mjs output
 *         <lockDir>/.report/<id>.geometry.json       optional — classifies diffs (layout vs color/type)
 * Writes  <lockDir>/.report/<id>.diff.png
 *         <lockDir>/.report/<id>.report.json
 *         <lockDir>/.report/<id>.tiles/<n>-{ref,render,diff}.png   top-5 worst-tile evidence triplets
 *
 * Exit codes (uniform across all skill scripts, CONTRACT.md):
 *   0  pass
 *   1  fidelity failure — real finding; feed the triplet crops back to the model
 *   2  setup/usage error — bad args, unparseable lock, missing reference or render
 *   3  DIMENSION_MISMATCH — render dims ≠ reference dims; config error, never silently resample
 *
 * Diff invariants owned here (CONTRACT.md §Diff invariants):
 *   - pixelmatch { threshold: 0.1, includeAA: false } — NEVER raise threshold to absorb AA;
 *     that also hides real color drift. AA is handled structurally by includeAA: false.
 *   - maskedRegions zero the SAME rects in BOTH buffers before matching (clamped to bounds).
 *   - globalPct = diffPixels / (W*H − maskedPx) — masked pixels leave the denominator too.
 *   - 64×64 tile grid over the diff buffer; worstTile = max per-tile diff density over that
 *     tile's unmasked pixels; fully-masked tiles are skipped.
 *   - Evidence: top-5 worst tiles emitted as ref/render/diff crop triplets + one
 *     classification line each, joined with the geometry report when it exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TILE = 64;

// Frozen per CONTRACT.md — do not tune these to make a screen pass.
const PIXELMATCH_OPTS = {
  threshold: 0.1,
  includeAA: false,
  alpha: 0.2,
  diffColor: [255, 0, 0],
};

const PROVENANCE_WARNING = [
  '!! REFERENCE PROVENANCE WARNING (--make-reference) !!',
  '   This copied OUR OWN Chromium render into the reference slot. Per the lock schema,',
  '   references must come from Figma\'s renderer (get_screenshot at original_* dims) or a',
  '   real branded capture — NEVER from our own Chromium render of generated output: a',
  '   self-made reference hides shared failures (e.g. both sides fell back to the same wrong',
  '   font and the diff reads 0 — the "both-fell-back hole").',
  '   The ONLY legitimate use is the calibration control screen / golden-fixture flow.',
].join('\n');

// ---------------------------------------------------------------------------- helpers

function fail(code, ...lines) {
  const label = { 2: 'exit 2 — setup/usage error', 3: 'exit 3 — DIMENSION_MISMATCH (config error)' }[code] ?? `exit ${code}`;
  console.error(`diff: [${label}]`);
  for (const l of lines) console.error(`  ${l}`);
  process.exit(code);
}

function usage() {
  return `usage: node ${path.join(SCRIPT_DIR, 'diff.mjs')} --lock <path/to/design-lock.json> [--screen <id>] [--make-reference]`;
}

function parseArgs(argv) {
  const args = { makeReference: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lock') args.lock = argv[++i];
    else if (a === '--screen') args.screen = argv[++i];
    else if (a === '--make-reference') args.makeReference = true;
    else fail(2, `unknown argument '${a}'`, usage());
  }
  if (!args.lock) fail(2, '--lock is required', usage());
  return args;
}

function loadLock(lockPath) {
  let raw;
  try {
    raw = fs.readFileSync(lockPath, 'utf8');
  } catch (e) {
    fail(2, `cannot read lock file '${lockPath}': ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(2, `lock file is not valid JSON: ${e.message}`, `fix ${lockPath} (or re-run the capture flow)`);
  }
}

function pickScreen(lock, wantedId, lockPath) {
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  if (screens.length === 0) fail(2, `lock has no screens[]: ${lockPath}`);
  if (wantedId === undefined) {
    if (screens.length === 1) return screens[0];
    fail(2, `--screen <id> is required (lock has ${screens.length} screens: ${screens.map((s) => s.id).join(', ')})`);
  }
  const screen = screens.find((s) => s.id === wantedId);
  if (!screen) fail(2, `screen '${wantedId}' not found in lock (available: ${screens.map((s) => s.id).join(', ')})`);
  return screen;
}

function readPng(p, what) {
  try {
    return PNG.sync.read(fs.readFileSync(p));
  } catch (e) {
    fail(2, `cannot read/parse ${what} PNG '${p}': ${e.message}`);
  }
}

function pct(x) {
  return `${x.toFixed(6)} (${(x * 100).toFixed(4)}%)`;
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function isRect(r) {
  return r && typeof r === 'object'
    && Number.isFinite(r.x) && Number.isFinite(r.y)
    && Number.isFinite(r.width) && Number.isFinite(r.height);
}

function scaleRect(r, k) {
  return { x: r.x * k, y: r.y * k, width: r.width * k, height: r.height * k };
}

/**
 * Tolerant reader for geometry.mjs output (.report/<id>.geometry.json).
 * diff.mjs only needs, per mapped element: an id, a pass/fail verdict, and any rect
 * to test tile intersection against — so accept the common field spellings rather
 * than binding to one exact shape. Rects are CSS px (lock space) → scaled by dpr
 * into PNG pixel space. Missing/unreadable file degrades to "no geometry data".
 */
function loadGeometry(reportDir, screen, dpr) {
  const p = path.join(reportDir, `${screen.id}.geometry.json`);
  if (!fs.existsSync(p)) return { available: false, note: 'no geometry report (mode B2, or geometry.mjs not run)' };
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { available: false, note: `geometry report unreadable: ${p}` };
  }
  const list = Array.isArray(doc) ? doc
    : Array.isArray(doc?.elements) ? doc.elements
    : Array.isArray(doc?.results) ? doc.results
    : Array.isArray(doc?.checks) ? doc.checks
    : Array.isArray(doc?.figIds) ? doc.figIds
    : null;
  if (!list) return { available: false, note: `geometry report has no element list: ${p}` };

  const lockRectById = new Map();
  for (const f of screen.figIds ?? []) {
    if (isRect(f.rect)) {
      lockRectById.set(f.figmaNodeId, f.rect);
      lockRectById.set(f.domId, f.rect);
    }
  }

  const entries = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const id = e.figmaNodeId ?? e.domId ?? e.id ?? '?';
    let passed;
    if (typeof e.pass === 'boolean') passed = e.pass;
    else if (typeof e.passed === 'boolean') passed = e.passed;
    else if (typeof e.ok === 'boolean') passed = e.ok;
    else if (typeof e.withinTolerance === 'boolean') passed = e.withinTolerance;
    else if (typeof e.status === 'string') passed = /^(pass|passed|ok)$/i.test(e.status);
    const rects = [];
    for (const k of ['rect', 'expected', 'expectedRect', 'figmaRect', 'lockRect', 'actual', 'actualRect', 'domRect', 'renderRect', 'box']) {
      if (isRect(e[k])) rects.push(e[k]);
    }
    if (rects.length === 0 && lockRectById.has(id)) rects.push(lockRectById.get(id));
    if (rects.length === 0) continue;
    entries.push({ id, passed, rects: rects.map((r) => scaleRect(r, dpr)) });
  }
  if (entries.length === 0) return { available: false, note: `geometry report has no usable rects: ${p}` };
  return { available: true, entries };
}

function classifyTile(bbox, geo) {
  if (!geo.available) return `${geo.note} — judge from the ref/render/diff crops`;
  const hits = geo.entries.filter((e) => e.rects.some((r) => rectsIntersect(bbox, r)));
  if (hits.length === 0) return 'no mapped figId intersects this tile — unmapped/freehand region; judge from the crops';
  const failed = hits.filter((h) => h.passed === false);
  if (failed.length > 0) return `geometry failed here (${failed.map((f) => f.id).join(', ')}) → layout error`;
  if (hits.every((h) => h.passed === true)) return 'box matches → likely color/type/weight, not layout';
  return 'geometry inconclusive for this tile — judge from the crops';
}

function cropPng(src, bbox) {
  const out = new PNG({ width: bbox.width, height: bbox.height });
  PNG.bitblt(src, out, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0);
  return out;
}

// ---------------------------------------------------------------------------- main

const args = parseArgs(process.argv);
const lockPath = path.resolve(args.lock); // the CLI arg itself is invoker-relative; everything below is lock-relative
const lock = loadLock(lockPath);
const lockDir = path.dirname(lockPath);
const screen = pickScreen(lock, args.screen, lockPath);

if (typeof screen.referenceImage !== 'string' || !screen.referenceImage) {
  fail(2, `screen '${screen.id}' has no referenceImage in the lock`);
}
if (!(typeof screen.passThreshold === 'number' && screen.passThreshold > 0) || !(typeof screen.tileCeiling === 'number' && screen.tileCeiling > 0)) {
  fail(2, `screen '${screen.id}' needs numeric passThreshold and tileCeiling > 0 in the lock`);
}

const dpr = screen.dpr ?? 1;
const refPath = path.resolve(lockDir, screen.referenceImage);
const renderPath = path.join(lockDir, '.render', `${screen.id}.png`);
const reportDir = path.join(lockDir, '.report');
const tilesDir = path.join(reportDir, `${screen.id}.tiles`);

// ---- --make-reference: calibration-control / golden-fixture flow ONLY -------
if (args.makeReference) {
  if (!fs.existsSync(renderPath)) {
    fail(2, `.render/${screen.id}.png not found: ${renderPath}`,
      `run render first: node ${path.join(SCRIPT_DIR, 'render.mjs')} --lock ${lockPath} --screen ${screen.id}`);
  }
  const existed = fs.existsSync(refPath);
  fs.mkdirSync(path.dirname(refPath), { recursive: true });
  fs.copyFileSync(renderPath, refPath);
  console.log(PROVENANCE_WARNING);
  console.log(`diff: ${existed ? 'overwrote' : 'wrote'} reference for screen '${screen.id}': ${refPath}`);
  console.log(`      source: ${renderPath}`);
  process.exit(0);
}

// ---- 1. load reference + render ---------------------------------------------
if (!fs.existsSync(refPath)) {
  fail(2, `reference image not found: ${refPath}`,
    `(screen '${screen.id}' → referenceImage '${screen.referenceImage}', resolved relative to the lock's directory)`,
    'Provenance: the reference must come from Figma\'s renderer (get_screenshot at original_* dims)',
    'or a real branded capture — never from our own render of generated output. Only the',
    'calibration control screen may self-seed it via --make-reference.');
}
if (!fs.existsSync(renderPath)) {
  fail(2, `render not found: ${renderPath}`,
    `run render first: node ${path.join(SCRIPT_DIR, 'render.mjs')} --lock ${lockPath} --screen ${screen.id}`);
}
const ref = readPng(refPath, 'reference');
const img = readPng(renderPath, 'render');

// ---- 2. dimension assert — exact, never resample ----------------------------
if (ref.width !== img.width || ref.height !== img.height) {
  fail(3, `reference: ${ref.width}x${ref.height}  (${refPath})`,
    `render:    ${img.width}x${img.height}  (${renderPath})`,
    `lock expects captureWidth x captureHeight x dpr = ${screen.captureWidth}x${screen.captureHeight} @ ${dpr} → ${screen.captureWidth * dpr}x${screen.captureHeight * dpr} px`,
    'never silently resample — fix captureWidth/Height/dpr or re-export the reference');
}
const W = ref.width;
const H = ref.height;

// ---- 3. zero maskedRegions in BOTH buffers ----------------------------------
// Lock rects are CSS px (same space as figIds/clip); the PNG is device px → scale by dpr.
// A Uint8 bitmap dedups overlapping masks so maskedPx counts each pixel once.
const maskBitmap = new Uint8Array(W * H);
let maskedPx = 0;
for (const m of screen.maskedRegions ?? []) {
  if (!isRect(m.rect)) continue;
  const x0 = Math.max(0, Math.floor(m.rect.x * dpr));
  const y0 = Math.max(0, Math.floor(m.rect.y * dpr));
  const x1 = Math.min(W, Math.ceil((m.rect.x + m.rect.width) * dpr));
  const y1 = Math.min(H, Math.ceil((m.rect.y + m.rect.height) * dpr));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      if (!maskBitmap[i]) {
        maskBitmap[i] = 1;
        maskedPx++;
      }
      const o = i * 4;
      ref.data[o] = ref.data[o + 1] = ref.data[o + 2] = ref.data[o + 3] = 0;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = img.data[o + 3] = 0;
    }
  }
}
const maskedPct = maskedPx / (W * H);

// ---- 4. pixelmatch -----------------------------------------------------------
const diffPng = new PNG({ width: W, height: H });
const diffPixels = pixelmatch(ref.data, img.data, diffPng.data, W, H, PIXELMATCH_OPTS);
const denom = W * H - maskedPx;
const globalPct = denom > 0 ? diffPixels / denom : 0;

// ---- 5. 64px tile scan over the diff buffer ---------------------------------
// A diff pixel is exactly diffColor [255,0,0,255]: unchanged pixels are grayscale
// (r===g===b) via the alpha option, AA-flagged pixels are yellow — neither collides.
const tiles = [];
for (let ty = 0; ty < H; ty += TILE) {
  for (let tx = 0; tx < W; tx += TILE) {
    const tw = Math.min(TILE, W - tx);
    const th = Math.min(TILE, H - ty);
    let red = 0;
    let unmasked = 0;
    for (let y = ty; y < ty + th; y++) {
      let i = y * W + tx;
      for (let x = tx; x < tx + tw; x++, i++) {
        if (maskBitmap[i]) continue;
        unmasked++;
        const o = i * 4;
        if (diffPng.data[o] === 255 && diffPng.data[o + 1] === 0 && diffPng.data[o + 2] === 0 && diffPng.data[o + 3] === 255) red++;
      }
    }
    if (unmasked === 0) continue; // fully masked tile — skipped entirely
    tiles.push({ bbox: { x: tx, y: ty, width: tw, height: th }, density: red / unmasked, red, unmasked });
  }
}
const worstTile = tiles.reduce((m, t) => Math.max(m, t.density), 0);
const worst5 = [...tiles].sort((a, b) => b.density - a.density).slice(0, 5).filter((t) => t.density > 0);

// ---- 6. evidence triplets + classification ----------------------------------
const geo = loadGeometry(reportDir, screen, dpr);
fs.mkdirSync(reportDir, { recursive: true });
fs.rmSync(tilesDir, { recursive: true, force: true }); // clear stale evidence from a previous round
const worstRegions = [];
for (let n = 0; n < worst5.length; n++) {
  const t = worst5[n];
  const classification = classifyTile(t.bbox, geo);
  if (worstRegions.length === 0) fs.mkdirSync(tilesDir, { recursive: true });
  const rank = n + 1;
  const crops = {
    ref: path.join('.report', `${screen.id}.tiles`, `${rank}-ref.png`),
    render: path.join('.report', `${screen.id}.tiles`, `${rank}-render.png`),
    diff: path.join('.report', `${screen.id}.tiles`, `${rank}-diff.png`),
  };
  // Crops come from the post-mask buffers — i.e. exactly what was compared.
  fs.writeFileSync(path.join(lockDir, crops.ref), PNG.sync.write(cropPng(ref, t.bbox)));
  fs.writeFileSync(path.join(lockDir, crops.render), PNG.sync.write(cropPng(img, t.bbox)));
  fs.writeFileSync(path.join(lockDir, crops.diff), PNG.sync.write(cropPng(diffPng, t.bbox)));
  worstRegions.push({ bbox: t.bbox, density: t.density, diffPixels: t.red, unmaskedPixels: t.unmasked, classification, crops });
}

// ---- 7. report + verdict -----------------------------------------------------
const pass = globalPct <= screen.passThreshold && worstTile <= screen.tileCeiling;
const report = {
  screen: screen.id,
  pass,
  globalPct,
  worstTile,
  maskedPct,
  diffPixels,
  maskedPx,
  thresholds: { passThreshold: screen.passThreshold, tileCeiling: screen.tileCeiling },
  dims: { width: W, height: H },
  dpr,
  worstRegions,
};
fs.writeFileSync(path.join(reportDir, `${screen.id}.diff.png`), PNG.sync.write(diffPng));
fs.writeFileSync(path.join(reportDir, `${screen.id}.report.json`), `${JSON.stringify(report, null, 2)}\n`);

const globalOk = globalPct <= screen.passThreshold;
const tileOk = worstTile <= screen.tileCeiling;
console.log(`diff: screen '${screen.id}' — ${pass ? 'PASS [exit 0]' : 'FAIL [exit 1 — fidelity failure: fix toward the reference, using the crops below]'}`);
console.log(`  globalPct ${pct(globalPct)}  vs passThreshold ${screen.passThreshold}  → ${globalOk ? 'ok' : 'FAIL'}`);
console.log(`  worstTile ${pct(worstTile)}  vs tileCeiling ${screen.tileCeiling}  → ${tileOk ? 'ok' : 'FAIL'}`);
console.log(`  maskedPct ${pct(maskedPct)}  (${maskedPx} px, ${(screen.maskedRegions ?? []).length} region(s))`);
const maskCap = lock.caps?.maxMaskedAreaPct;
if (typeof maskCap === 'number' && maskedPct > maskCap) {
  console.log(`  WARNING: maskedPct exceeds caps.maxMaskedAreaPct (${maskCap}) — adherence-lint will fail this lock`);
}
if (worstRegions.length === 0) {
  console.log('  no differing regions');
} else {
  for (let n = 0; n < worstRegions.length; n++) {
    const r = worstRegions[n];
    console.log(`  #${n + 1} tile @ (${r.bbox.x},${r.bbox.y}) ${r.bbox.width}x${r.bbox.height} — density ${r.density.toFixed(6)} — ${r.classification}`);
    console.log(`     crops: ${r.crops.ref} | ${r.crops.render} | ${r.crops.diff}`);
  }
}
console.log(`  report → ${path.join(reportDir, `${screen.id}.report.json`)}`);
process.exit(pass ? 0 : 1);
