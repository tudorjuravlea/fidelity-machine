#!/usr/bin/env node
/**
 * colour-census.mjs, find colour drift the pixel gate cannot see.
 *
 * WHY THIS EXISTS
 * pixelmatch (diff.mjs) scores colour distance in YIQ and ignores anything under
 * `35215 * PIXELMATCH_THRESHOLD^2`, which at the engine's threshold 0.1 is 352.15. For a
 * uniform grey shift that means a per-channel delta up to ~26 levels is scored as IDENTICAL,
 * on any number of pixels. On the first production capture the dashboard screen was painting
 * secondary text a few levels off the reference on roughly 12,000 pixels, and the pixel gate
 * reported no difference at all.
 *
 * A design-system version bump is EXACTLY a small uniform colour change, so this is the blind
 * spot most likely to be hit in practice, on any design system this engine captures.
 *
 * WHAT IT DOES
 * For every screen with both a reference and a render, it histograms the flat colours on each
 * side and, for each dominant reference colour, finds the nearest colour the render actually
 * paints. It reports the ones where the two differ but the difference scores BELOW the pixel
 * gate's cutoff, the silent band.
 *
 * It deliberately does NOT compare against the token file. The reference is the ground truth
 * the pixel gate already uses; asking "does the render paint what the reference paints" needs
 * no token-name mapping and catches drift from any cause; a version bump is one example.
 *
 * Contract: ../CONTRACT.md, §Invocation contract, §Diff invariants, §Exit codes.
 *
 * usage: node scripts/colour-census.mjs --lock <path/to/design-lock.json> [--screen <id>]
 *          [--min <px>=1000] [--min-delta <d>=2] [--min-deficit <f>=0.25]
 *          [--min-density <f>=0.25] [--json]
 * exit:  0 = no reported drift · 1 = reported drift found · 2 = setup/usage error
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { PIXELMATCH_THRESHOLD } from './pixelmatch-threshold.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// --- pixelmatch's own colour metric, so "invisible" here means invisible in diff.mjs too ---
const CUTOFF = 35215 * PIXELMATCH_THRESHOLD * PIXELMATCH_THRESHOLD; // 352.15
function yiqDelta(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  const y = 0.29889531 * dr + 0.58662247 * dg + 0.11448223 * db;
  const i = 0.59597799 * dr - 0.27417610 * dg - 0.32180189 * db;
  const q = 0.21147017 * dr - 0.52261711 * dg + 0.31114694 * db;
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

// ---------------------------------------------------------------------------- cli

function usage() {
  return [
    `usage: node ${path.join(SCRIPT_DIR, 'colour-census.mjs')} --lock <path/to/design-lock.json> [--screen <id>]`,
    '         [--min <px>=1000] [--min-delta <d>=2] [--min-deficit <f>=0.25] [--min-density <f>=0.25] [--json]',
    '',
    '  --lock <path>        required, path to design-lock.json',
    '  --screen <id>        only census this screen (default: every screen in the lock)',
    '  --min <px>           ignore substitutions smaller than this (default 1000)',
    '  --min-delta <d>      ignore colour pairs closer than this YIQ delta (default 2)',
    '  --min-deficit <f>    classifier: report when deficitFraction >= this (default 0.25)',
    '  --min-density <f>    classifier: report when density >= this (default 0.25)',
    '  --json               print the full per-screen result objects as JSON',
    '',
    'Writes .report/<id>.census.json next to the lock, per screen compared.',
    'Exit: 0 no reported drift · 1 reported drift found · 2 setup/usage error',
  ].join('\n');
}

function fail(code, ...lines) {
  console.error(`colour-census: [exit ${code}, ${code === 2 ? 'setup/usage error' : 'reported drift found'}]`);
  for (const l of lines) console.error(`  ${l}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
    else if (a === '--lock') args.lock = argv[++i];
    else if (a === '--screen') args.screen = argv[++i];
    else if (a === '--min') args.min = argv[++i];
    else if (a === '--min-delta') args.minDelta = argv[++i];
    else if (a === '--min-deficit') args.minDeficit = argv[++i];
    else if (a === '--min-density') args.minDensity = argv[++i];
    else if (a === '--json') args.json = true;
    else fail(2, `unknown argument '${a}'`, usage());
  }
  if (!args.lock) fail(2, '--lock is required', usage());
  return args;
}

const args = parseArgs(process.argv);
const lockPath = path.resolve(args.lock);
const only = args.screen ?? null;
const MIN = Number(args.min ?? 1000);
// 1000 is a DEFAULT re-measured per design system, never a brand fact. On the first
// production capture, at 1000 every screen was clean; at 500 two rasterisation artefacts
// (a shadow hairline, a gridline the two rasterisers antialias across different rows) were
// reported as drift; at 250 antialiasing shades of text started to look like substitutions.
// Below the floor is the gate pair's blind spot: a wrong colour on under 1,000 px that is
// also under the pixel gate's cutoff passes both. A component-scale title is about 400 px.
const MIN_DELTA = Number(args.minDelta ?? 2);
// A one-level-per-channel difference (delta ~0.5) is PNG/rasteriser rounding, not drift.
// Anything from two levels up (delta ~2.0) is a real colour decision. Floor it so the tool
// does not cry wolf.
const DEFICIT_MIN = Number(args.minDeficit ?? 0.25);
const DENSITY_MIN = Number(args.minDensity ?? 0.25);
// Volume alone cannot tell a substitution from rasterisation noise: a drop-shadow blur tail
// can clear MIN every run and still not be a defect. The real substitutions this classifier
// exists to catch were each substantial (deficitFraction well above this floor) or dense
// (density near 1.0) or both; a rasterisation artefact is neither. Report when the reference
// colour is substantially gone (deficitFraction) OR the wrong pixels are packed densely
// (density); file it as rasterisation, not silence, when neither is true.
if (!Number.isFinite(MIN) || MIN < 0) fail(2, `--min must be a non-negative number, got '${args.min}'`);
if (!Number.isFinite(MIN_DELTA) || MIN_DELTA < 0) fail(2, `--min-delta must be a non-negative number, got '${args.minDelta}'`);
if (!Number.isFinite(DEFICIT_MIN) || DEFICIT_MIN < 0) fail(2, `--min-deficit must be a non-negative number, got '${args.minDeficit}'`);
if (!Number.isFinite(DENSITY_MIN) || DENSITY_MIN < 0) fail(2, `--min-density must be a non-negative number, got '${args.minDensity}'`);

if (!fs.existsSync(lockPath)) fail(2, `no lock at ${lockPath}`);
let lock;
try {
  lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
} catch (e) {
  fail(2, `lock file is not valid JSON: ${e.message}`);
}
if (!Array.isArray(lock.screens) || lock.screens.length === 0) fail(2, `lock has no screens[]: ${lockPath}`);
if (only && !lock.screens.some((s) => s.id === only)) {
  fail(2, `screen '${only}' not found in lock (available: ${lock.screens.map((s) => s.id).join(', ')})`);
}
const lockDir = path.dirname(lockPath);
const reportDir = path.join(lockDir, '.report');

// ---------------------------------------------------------------------------- helpers

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const unpack = (k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255];

function isRect(r) {
  return r && typeof r === 'object'
    && Number.isFinite(r.x) && Number.isFinite(r.y)
    && Number.isFinite(r.width) && Number.isFinite(r.height);
}

// Same rect resolution as diff.mjs §Diff invariants: lock rects are CSS px, scaled by dpr,
// floor/ceil-clamped to the buffer. diff.mjs ZEROES these rects in both buffers before
// matching; the census reaches the same result by excluding them at every point a pixel's
// colour is read (histogram, and the co-location walk below), nothing masked ever
// contributes a count on either side, which is the same "matched on nothing" outcome.
function maskRects(screen, W, H) {
  const dpr = screen.dpr ?? 1;
  const rects = [];
  for (const m of screen.maskedRegions ?? []) {
    if (!isRect(m.rect)) continue;
    const x0 = Math.max(0, Math.floor(m.rect.x * dpr));
    const y0 = Math.max(0, Math.floor(m.rect.y * dpr));
    const x1 = Math.min(W, Math.ceil((m.rect.x + m.rect.width) * dpr));
    const y1 = Math.min(H, Math.ceil((m.rect.y + m.rect.height) * dpr));
    if (x1 > x0 && y1 > y0) rects.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return rects;
}

function histogram(img, masks) {
  const m = new Map();
  const { width: W, data } = img;
  const inMask = (x, y) => masks.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 250) continue;
    if (masks.length) {
      const p = i >> 2, x = p % W, y = (p / W) | 0;
      if (inMask(x, y)) continue;
    }
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

// ---------------------------------------------------------------------------- census

function censusScreen(screen) {
  if (screen.netNew === true) return { id: screen.id, skipped: 'netNew screen, no reference to census against' };
  if (!screen.referenceImage) return { id: screen.id, skipped: 'no referenceImage in the lock' };
  const refPath = path.join(lockDir, screen.referenceImage);
  const renPath = path.join(lockDir, '.render', `${screen.id}.png`);
  if (!fs.existsSync(refPath)) return { id: screen.id, skipped: `reference not found: ${refPath}` };
  if (!fs.existsSync(renPath)) return { id: screen.id, skipped: `render not found: ${renPath} (run render.mjs first)` };

  const ref = PNG.sync.read(fs.readFileSync(refPath));
  const ren = PNG.sync.read(fs.readFileSync(renPath));
  if (ref.width !== ren.width || ref.height !== ren.height) {
    return { id: screen.id, skipped: `dimension mismatch ${ref.width}x${ref.height} vs ${ren.width}x${ren.height}` };
  }

  const masks = maskRects(screen, ref.width, ref.height);
  const hRef = histogram(ref, masks), hRen = histogram(ren, masks);

  // Presence is the wrong question: a render can paint a few hundred antialiased pixels of
  // the right colour while painting thousands of the wrong one, and a nearest-match on
  // presence then scores delta 0 and misses the defect entirely. Ask instead where the
  // pixels WENT. A colour the reference paints far more often than the render has a
  // DEFICIT; one the render paints far more often has a SURPLUS. A deficit paired with a
  // nearby surplus is a substitution, the render painted the wrong colour in the same
  // place. Antialiasing produces small, scattered deficits, so a minimum size filters it
  // out without hiding real substitutions, which are large.
  const keys = new Set([...hRef.keys(), ...hRen.keys()]);
  const deficits = [], surpluses = [];
  for (const k of keys) {
    const d = (hRef.get(k) || 0) - (hRen.get(k) || 0);
    if (d >= MIN) deficits.push({ k, px: d });
    else if (-d >= MIN) surpluses.push({ k, px: -d, left: -d });
  }
  deficits.sort((a, b) => b.px - a.px);

  let findings = [];
  for (const def of deficits) {
    const c = unpack(def.k);
    // Prefer the surplus that best EXPLAINS the deficit, not merely the closest colour.
    // Nearest-delta matching pairs a large deficit with a small antialiasing blend and
    // hides the real substitution behind it; volume-first pairing finds the substitution
    // and leaves the AA blends as the small remainder they are. Delta only breaks ties.
    let best = null;
    for (const s of surpluses) {
      if (s.left <= 0) continue;
      const d = yiqDelta(c, unpack(s.k));
      if (d < MIN_DELTA || d >= CUTOFF) continue;
      const volume = Math.min(def.px, s.left);
      if (!best || volume > best.volume || (volume === best.volume && d < best.d)) best = { d, s, volume };
    }
    if (!best) continue;
    const paired = Math.min(def.px, best.s.left);
    if (paired < MIN) continue;
    best.s.left -= paired;
    findings.push({
      reference: hex(c), refPx: hRef.get(def.k) || 0,
      render: hex(unpack(best.s.k)), renderPx: hRen.get(best.s.k) || 0,
      refKey: def.k, renKey: best.s.k,
      pairedPx: paired,
      delta: Math.round(best.d * 10) / 10,
      perChannel: unpack(best.s.k).map((v, i) => v - c[i]).join('/'),
    });
  }

  // Histogram pairing counts totals, not positions, so it over-attributes. Confirm each
  // pair by walking the images once and counting pixels where the reference really is A
  // and the render really is B at the SAME coordinate, masked pixels excluded on both
  // sides, same as the histogram pass above. That co-located count is the only honest
  // number, and a pair that survives histogram matching but not co-location was never a
  // substitution at all. Track bounds/centroid/density in this same walk so every finding
  // carries its own location.
  if (findings.length) {
    const tally = new Map(findings.map((f) => [`${f.refKey}|${f.renKey}`, {
      count: 0, sumX: 0, sumY: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
    }]));
    for (let i = 0; i < ref.data.length; i += 4) {
      if (ref.data[i + 3] < 250 || ren.data[i + 3] < 250) continue;
      const p = i >> 2, x = p % ref.width, y = (p / ref.width) | 0;
      if (masks.length && masks.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)) continue;
      const a = (ref.data[i] << 16) | (ref.data[i + 1] << 8) | ref.data[i + 2];
      const b = (ren.data[i] << 16) | (ren.data[i + 1] << 8) | ren.data[i + 2];
      const s = tally.get(`${a}|${b}`);
      if (!s) continue;
      s.count++; s.sumX += x; s.sumY += y;
      if (x < s.minX) s.minX = x; if (x > s.maxX) s.maxX = x;
      if (y < s.minY) s.minY = y; if (y > s.maxY) s.maxY = y;
    }
    for (const f of findings) {
      const s = tally.get(`${f.refKey}|${f.renKey}`);
      f.histogramPx = f.pairedPx;
      f.pairedPx = s ? s.count : 0;
      if (s && s.count > 0) {
        const width = s.maxX - s.minX + 1, height = s.maxY - s.minY + 1;
        f.bbox = { x: s.minX, y: s.minY, width, height };
        f.centroid = { x: Math.round((s.sumX / s.count) * 10) / 10, y: Math.round((s.sumY / s.count) * 10) / 10 };
        f.density = Math.round((s.count / (width * height)) * 1000) / 1000;
      }
      delete f.refKey; delete f.renKey;
    }
  }
  findings = findings.filter((f) => f.pairedPx >= MIN).sort((a, b) => b.pairedPx - a.pairedPx);

  // Presence-and-volume survives to here, but it still can't separate a substitution from
  // rasterisation on its own, see the classifier comment at DEFICIT_MIN/DENSITY_MIN above.
  const reported = [], rasterisation = [];
  for (const f of findings) {
    f.deficitFraction = f.refPx > 0 ? Math.round((f.pairedPx / f.refPx) * 1000) / 1000 : 0;
    const dense = (f.density || 0) >= DENSITY_MIN;
    const deficit = f.deficitFraction >= DEFICIT_MIN;
    (deficit || dense ? reported : rasterisation).push(f);
  }
  return { id: screen.id, width: ref.width, height: ref.height, findings: reported, rasterisation };
}

// ---------------------------------------------------------------------------- main

const targets = only ? lock.screens.filter((s) => s.id === only) : lock.screens;
const results = targets.map(censusScreen);

fs.mkdirSync(reportDir, { recursive: true });
for (const r of results) {
  if (r.skipped) continue; // nothing measured, no report to write
  fs.writeFileSync(path.join(reportDir, `${r.id}.census.json`), `${JSON.stringify(r, null, 2)}\n`);
}

if (args.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`\ncolour census, silent drift below the pixel gate's cutoff of ${CUTOFF.toFixed(2)}`);
  console.log(`(reporting substitutions of >=${MIN} px with a colour delta >=${MIN_DELTA})`);
  console.log(`(a colour differing by less than this scores as IDENTICAL in diff.mjs, on any number of pixels)\n`);
  const printFinding = (f, dpr) => {
    console.log(`      ${String(f.pairedPx).padStart(7)} px   reference ${f.reference} -> render ${f.render}`
      + `   delta ${f.delta} of ${CUTOFF.toFixed(2)}   rgb ${f.perChannel}`
      + `   (ref paints ${f.refPx}, render paints ${f.renderPx}; histogram suggested ${f.histogramPx}; deficitFraction ${f.deficitFraction})`);
    if (f.bbox) {
      const x2 = f.bbox.x + f.bbox.width - 1, y2 = f.bbox.y + f.bbox.height - 1;
      console.log(`           at ${f.bbox.x}..${x2} ${f.bbox.y}..${y2} (${f.bbox.width}x${f.bbox.height}, density ${f.density}),`
        + ` centroid (${f.centroid.x}, ${f.centroid.y})  = css (${Math.round(f.centroid.x / dpr * 10) / 10}, ${Math.round(f.centroid.y / dpr * 10) / 10})`);
    }
  };

  let screensWith = 0, total = 0;
  for (const r of results) {
    if (r.skipped) { console.log(`  ${r.id.padEnd(28)} SKIP, ${r.skipped}`); continue; }
    const scr = lock.screens.find((s) => s.id === r.id);
    const dpr = (scr && scr.dpr) || 1;
    if (!r.findings.length) { console.log(`  ${r.id.padEnd(28)} clean`); }
    else {
      screensWith++; total += r.findings.length;
      console.log(`  ${r.id.padEnd(28)} ${r.findings.length} SILENT`);
      for (const f of r.findings) printFinding(f, dpr);
    }
    if (r.rasterisation && r.rasterisation.length) {
      console.log(`      rasterisation (not counted): ${r.rasterisation.length}`);
      for (const f of r.rasterisation) printFinding(f, dpr);
    }
  }
  const compared = results.filter((r) => !r.skipped).length;
  console.log(`\n  ${compared} screen(s) compared · ${screensWith} with silent drift · ${total} finding(s)`);
  if (!total) console.log('  No colour is being painted wrong in a way the pixel gate cannot see.');
  console.log(`  report(s) → ${reportDir}/<id>.census.json`);
}
process.exit(results.some((r) => r.findings && r.findings.length) ? 1 : 0);
