#!/usr/bin/env node
// activity.mjs — where does a screen recording DO something? Finds the on-screen action in a prototype clip, as the
// segments a device zoom visits (runtime/motion/devices.js armZoom; references/device-mockups.md):
//
//   node scripts/activity.mjs <clip.mp4|.webm|.mov>                  → JSON [{ t0, t1, u, v, z }] on stdout
//   node scripts/activity.mjs <frames-dir> [--rate <fps>]             a folder of numbered frames (0000.jpg …); the
//                                                                     rate from its clip.json, or --rate
//   node scripts/activity.mjs <clip> --windows                        every window: energy, intensity, kept-cell
//                                                                     share, centroid and spread, for tuning
//   node scripts/activity.mjs <clip> --json                           the windows too, as NDJSON, with --windows
//
// t0/t1 are seconds into the clip, u/v the point on the screen (0..1 across and down), z the scale the zoom asks
// for. Needs ffmpeg and ffprobe on PATH (or FFMPEG / FFPROBE naming the executables). Exit 0 (segments, or none:
// an empty array and a stderr note) · 2 setup or usage (no such input, ffmpeg absent, a frames folder with no
// rate) · 5 ffmpeg failed. No lock: a recording is not a screen.
//
// HOW. ffmpeg decodes small grey frames; consecutive frames are differenced on an 8 x 16 grid aligned with the
// clip's long axis (16 rows down a portrait clip); the clip is cut into windows; a window survives above an absolute
// intensity bar AND a share of the clip's peak window energy, and is rejected as "not localised" when more than half
// its cells are hot (a scroll or a crossfade lights up the whole screen and is not action); the energy-weighted
// centroid of the hottest cells gives the point, their spread gives the scale; adjacent windows that look at the same
// place merge into one segment.
//
// THE BARS ARE SET FOR A SLIDE, NOT A FILM. The analyser this is re-derived from (the author's MockupAnimate) decodes
// 64 px wide at 4 fps in 1.5 s windows and keeps a window only above a mean abs-diff of 1.0 per cell per frame and
// 18 % of the clip's peak: right for a film, which wants the big beats and a camera that breathes between them. A
// slide's zoom wants the TAPS, which are small against a sheet sliding in: on the engine's synthetic clip a tap
// measures about 3 % of the sheet's window energy, so at 18 % of the peak it would be dropped and the zoom would only
// ever visit the sheet. So this decodes finer and keeps more: 96 px wide at 6 fps in 1 s windows, above 0.25 per cell
// per frame and 1.5 % of the peak. A control the size of a toggle still measures about 0.1 and stays below the bar:
// its stop is written by hand (the golden-devices fixture does exactly that).
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const EXIT = { PASS: 0, SETUP: 2, RENDER: 5 };

export const GRID_SHORT = 8, GRID_LONG = 16;            // cells across the short and the long axis of the clip
export const DEFAULT_FPS = 6;                           // frames decoded per second
export const DEFAULT_WIDTH = 96;                        // decoded frame width, px (the height follows the clip's aspect)
export const DEFAULT_WINDOW_SEC = 1.0;
export const DEFAULT_MIN_INTENSITY = 0.25;              // mean abs-diff per cell per frame, 0..255: a static stretch sits near 0.01
export const DEFAULT_MIN_ENERGY_FRACTION = 0.015;       // of the clip's peak window energy
export const DEFAULT_CELL_KEEP_FRACTION = 0.8;          // cells at this share of the window's hottest cell steer the centroid
export const DEFAULT_CENTROID_WEIGHT_POWER = 2;
export const DEFAULT_UNIFORM_CELL_FRACTION = 0.5;       // more hot cells than this: not localised, no segment
export const DEFAULT_ZOOM_MIN = 1.25, DEFAULT_ZOOM_MAX = 2.0;   // the scale asked for: a tight burst earns the closest zoom, diffuse motion the gentlest
export const DEFAULT_SPREAD_MIN = 0.08, DEFAULT_SPREAD_MAX = 0.4;
export const DEFAULT_MERGE_UV_DISTANCE = 0.12, DEFAULT_MERGE_ZOOM_DELTA = 0.25;
export const DEFAULT_GAP_TOLERANCE_FRACTION = 0.5;      // windows merge only across a gap under half a window: truly adjacent ones

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEFAULTS = {
  fps: DEFAULT_FPS, width: DEFAULT_WIDTH, windowSec: DEFAULT_WINDOW_SEC, minIntensity: DEFAULT_MIN_INTENSITY,
  minEnergyFraction: DEFAULT_MIN_ENERGY_FRACTION, cellKeepFraction: DEFAULT_CELL_KEEP_FRACTION,
  centroidWeightPower: DEFAULT_CENTROID_WEIGHT_POWER, uniformCellFraction: DEFAULT_UNIFORM_CELL_FRACTION,
  zoomMin: DEFAULT_ZOOM_MIN, zoomMax: DEFAULT_ZOOM_MAX, spreadMin: DEFAULT_SPREAD_MIN, spreadMax: DEFAULT_SPREAD_MAX,
  mergeUvDistance: DEFAULT_MERGE_UV_DISTANCE, mergeZoomDelta: DEFAULT_MERGE_ZOOM_DELTA, gapToleranceFraction: DEFAULT_GAP_TOLERANCE_FRACTION,
};

// ---- pure: grids → windows → segments -------------------------------------------------------------------------------
/** The grid for a clip's orientation: the long axis gets the 16 cells. */
export function gridDimsFor(width, height) { return height > width ? { rows: GRID_LONG, cols: GRID_SHORT } : { rows: GRID_SHORT, cols: GRID_LONG }; }

// One window's statistics over its frame-pair grids: how much moved (energy; intensity = per cell per frame), where
// (the centroid of the cells at or above cellKeepFraction of the hottest, weighted by energy^power), how spread, and
// the share of cells that were hot (what tells a tap from a scroll).
function windowStats(grids, o) {
  const rows = grids[0].length, cols = grids[0][0].length, cells = rows * cols;
  const totals = Array.from({ length: rows }, () => new Array(cols).fill(0));
  let energy = 0, peak = 0;
  for (const g of grids) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const e = g[r][c]; if (e > 0) { totals[r][c] += e; energy += e; } }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) peak = Math.max(peak, totals[r][c]);
  if (energy <= 0 || peak <= 0) return { energy: 0, intensity: 0, u: 0.5, v: 0.5, spread: 0, keptFraction: 0 };
  const floor = peak * o.cellKeepFraction, kept = [];
  let weight = 0, su = 0, sv = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (totals[r][c] < floor) continue;
    const w = totals[r][c] ** o.centroidWeightPower, u = (c + 0.5) / cols, v = (r + 0.5) / rows;
    kept.push({ w, u, v }); weight += w; su += w * u; sv += w * v;
  }
  const u = su / weight, v = sv / weight;
  let vu = 0, vv = 0;
  for (const k of kept) { vu += k.w * (k.u - u) ** 2; vv += k.w * (k.v - v) ** 2; }
  return { energy, intensity: energy / (grids.length * cells), u, v, spread: Math.sqrt(vu / weight + vv / weight), keptFraction: kept.length / cells };
}

// a tight burst earns the closest zoom (spread at or under spreadMin → zoomMax), diffuse motion the gentlest
export function zoomFromSpread(spread, o = DEFAULTS) {
  const p = clamp((spread - o.spreadMin) / (o.spreadMax - o.spreadMin), 0, 1);
  return o.zoomMax - p * (o.zoomMax - o.zoomMin);
}

/** Every window of the clip with its statistics (--windows): [{ t0, t1, energy, intensity, u, v, spread, keptFraction }]. */
export function windowsOf(diffGrids, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const per = Math.max(1, Math.round(o.windowSec * o.fps)), out = [];
  for (let s = 0; s < diffGrids.length; s += per) out.push({ t0: s / o.fps, t1: Math.min(diffGrids.length, s + per) / o.fps, ...windowStats(diffGrids.slice(s, s + per), o) });
  return out;
}

/** Diff grids (one per consecutive frame pair, at opts.fps) → [{ t0, t1, u, v, z }] in seconds and screen fractions. */
export function segmentActivity(diffGrids, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!diffGrids.length) return [];
  const windows = windowsOf(diffGrids, o);
  const maxEnergy = Math.max(...windows.map(w => w.energy));
  if (maxEnergy <= 0) return [];
  const active = windows.filter(w => w.energy >= maxEnergy * o.minEnergyFraction && w.intensity >= o.minIntensity && w.keptFraction <= o.uniformCellFraction);
  const per = Math.max(1, Math.round(o.windowSec * o.fps)), gapTol = (per / o.fps) * o.gapToleranceFraction;
  const merged = [];
  for (const w of active) {
    const z = zoomFromSpread(w.spread, o), last = merged[merged.length - 1];
    if (last && w.t0 - last.t1 <= gapTol && Math.hypot(last.u - w.u, last.v - w.v) <= o.mergeUvDistance && Math.abs(z - last.z) <= o.mergeZoomDelta) {
      const e = last.energy + w.energy;
      last.u = (last.u * last.energy + w.u * w.energy) / e; last.v = (last.v * last.energy + w.v * w.energy) / e;
      last.z = (last.z * last.energy + z * w.energy) / e; last.energy = e; last.t1 = w.t1;
    } else merged.push({ t0: w.t0, t1: w.t1, u: w.u, v: w.v, z, energy: w.energy });
  }
  const r3 = x => Math.round(x * 1000) / 1000;
  return merged.map(({ t0, t1, u, v, z }) => ({ t0: r3(t0), t1: r3(t1), u: r3(u), v: r3(v), z: r3(z) }));
}

/** Grey frames (one Buffer each, width x height) → one diff grid per consecutive pair. */
export function diffGrids(frames, width, height, { rows, cols }) {
  const grids = [];
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i], b = frames[i + 1];
    const sums = Array.from({ length: rows }, () => new Array(cols).fill(0)), counts = Array.from({ length: rows }, () => new Array(cols).fill(0));
    for (let y = 0; y < height; y++) {
      const r = Math.min(rows - 1, Math.floor((y / height) * rows));
      for (let x = 0; x < width; x++) { const c = Math.min(cols - 1, Math.floor((x / width) * cols)), k = y * width + x; sums[r][c] += Math.abs(b[k] - a[k]); counts[r][c]++; }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) sums[r][c] = counts[r][c] ? sums[r][c] / counts[r][c] : 0;
    grids.push(sums);
  }
  return grids;
}

// ---- ffmpeg-backed extraction ------------------------------------------------------------------------------------------
const exe = (name, env) => process.env[env] || name;
const absent = err => err && (err.code === 'ENOENT' || /ENOENT/.test(err.message ?? ''));
class SetupError extends Error { code = EXIT.SETUP; }
class RenderError extends Error { code = EXIT.RENDER; }

// A video file, or a folder of numbered frames: { inputArgs (for ffmpeg), probeFile, rate }. The frames' rate comes
// from clip.json in the folder, or --rate; the pattern is read off the first frame's name (0000.jpg → %04d.jpg).
export function describeInput(input, rate) {
  if (!fs.existsSync(input)) throw new SetupError(`no such file or folder: ${input}`);
  if (!fs.statSync(input).isDirectory()) return { inputArgs: ['-i', input], probeFile: input, rate: null, frames: null };
  const names = fs.readdirSync(input).filter(n => /^\D*\d+\.(jpe?g|png|webp)$/i.test(n)).sort();
  if (!names.length) throw new SetupError(`${input} holds no numbered frames (0000.jpg, 0001.jpg …)`);
  const m = /^(\D*)(\d+)(\.\w+)$/.exec(names[0]);
  let fps = rate;
  const sidecar = path.join(input, 'clip.json');
  if (fps === undefined && fs.existsSync(sidecar)) {
    try { fps = JSON.parse(fs.readFileSync(sidecar, 'utf8')).fps; } catch (err) { throw new SetupError(`${sidecar} is not JSON: ${err.message}`); }
  }
  if (!(fps > 0)) throw new SetupError(`a folder of frames needs its rate: --rate <fps>, or clip.json with "fps" next to the frames`);
  return {
    inputArgs: ['-framerate', String(fps), '-start_number', m[2], '-i', path.join(input, `${m[1]}%0${m[2].length}d${m[3]}`)],
    probeFile: path.join(input, names[0]), rate: fps, frames: names.length,
  };
}

async function probe(file) {
  try {
    const { stdout } = await execFileAsync(exe('ffprobe', 'FFPROBE'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]);
    const s = JSON.parse(stdout).streams?.[0];
    if (!s?.width || !s?.height) throw new RenderError(`ffprobe found no video stream in ${file}`);
    return { width: s.width, height: s.height };
  } catch (err) {
    if (absent(err)) throw new SetupError('ffprobe is not on PATH (or FFPROBE does not name it) — install ffmpeg; the analyser needs both');
    if (err instanceof RenderError) throw err;
    throw new RenderError(`ffprobe failed on ${file}: ${err.stderr?.trim() || err.message}`);
  }
}

function rawGrey(inputArgs, fps, width, height) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe('ffmpeg', 'FFMPEG'), ['-v', 'error', ...inputArgs, '-vf', `fps=${fps},scale=${width}:${height}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
    const chunks = []; let err = '';
    p.stdout.on('data', c => chunks.push(c)); p.stderr.on('data', c => { err += c; });
    p.on('error', e => reject(absent(e) ? new SetupError('ffmpeg is not on PATH (or FFMPEG does not name it) — install ffmpeg') : new RenderError(e.message)));
    p.on('close', code => (code ? reject(new RenderError(`ffmpeg exited ${code}\n${err.trim()}`)) : resolve(Buffer.concat(chunks))));
  });
}

/** Decode the clip and difference it: { grids, width, height, src: { width, height }, rate }. */
export async function extractDiffGrids(input, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const described = describeInput(input, opts.rate);
  const src = await probe(described.probeFile);
  const dims = gridDimsFor(src.width, src.height);
  const height = Math.max(2, Math.round((o.width * src.height / src.width) / 2) * 2);
  const buf = await rawGrey(described.inputArgs, o.fps, o.width, height);
  const size = o.width * height, n = Math.floor(buf.length / size);
  if (n < 2) throw new RenderError(`ffmpeg decoded ${n} frame(s) from ${input}: nothing to difference`);
  const frames = Array.from({ length: n }, (_, i) => buf.subarray(i * size, (i + 1) * size));
  return { grids: diffGrids(frames, o.width, height, dims), width: o.width, height, src, rate: described.rate };
}

export async function analyzeActivity(input, opts = {}) { return segmentActivity((await extractDiffGrids(input, opts)).grids, opts); }

// ---- CLI ----------------------------------------------------------------------------------------------------------------
const HELP = `activity.mjs — the on-screen action of a prototype clip, as segments for a device zoom

  node scripts/activity.mjs <clip.mp4|.webm|.mov> [--windows] [--json]
  node scripts/activity.mjs <frames-dir> [--rate <fps>] [--windows] [--json]

  <frames-dir>   a folder of numbered frames (0000.jpg …); the rate comes from its clip.json ("fps"), or --rate
  --windows      print every 1 s window: energy, intensity (per cell per frame), the share of hot cells, the
                 centroid (u v) and the spread, then the segments; --json makes it NDJSON
  --json         segments as one JSON array (the default), windows as {"type":"window"} lines before it

Output: [{ t0, t1, u, v, z }] — seconds into the clip, the point on the screen (0..1), the scale asked for.
Paste it into a device's data-zoom (runtime/motion/devices.css) or armZoom's segments (devices.js).
Exit 0 segments or none (an empty array, with a note) · 2 usage, no such input, ffmpeg absent, a frames folder
with no rate · 5 ffmpeg or ffprobe failed. Needs ffmpeg and ffprobe on PATH (or FFMPEG / FFPROBE).`;

async function main(argv) {
  const args = { windows: false, json: false, rate: undefined, input: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(HELP); return EXIT.PASS; }
    else if (a === '--windows') args.windows = true;
    else if (a === '--json') args.json = true;
    else if (a === '--rate') { args.rate = Number(argv[++i]); if (!(args.rate > 0)) { console.error('--rate needs a positive number of frames per second'); return EXIT.SETUP; } }
    else if (a.startsWith('--')) { console.error(`unknown flag ${a}\n\n${HELP}`); return EXIT.SETUP; }
    else if (args.input) { console.error(`one input only (got ${args.input} and ${a})`); return EXIT.SETUP; }
    else args.input = a;
  }
  if (!args.input) { console.error(HELP); return EXIT.SETUP; }
  const { grids } = await extractDiffGrids(args.input, { rate: args.rate });
  if (args.windows) {
    for (const w of windowsOf(grids)) {
      if (args.json) console.log(JSON.stringify({ type: 'window', ...w }));
      else console.log(`${w.t0.toFixed(1).padStart(5)}-${w.t1.toFixed(1).padEnd(4)}s  energy ${w.energy.toFixed(0).padStart(6)}  intensity ${w.intensity.toFixed(2).padStart(6)}  hot ${(w.keptFraction * 100).toFixed(0).padStart(3)}%  u ${w.u.toFixed(2)} v ${w.v.toFixed(2)}  spread ${w.spread.toFixed(2)}`);
    }
  }
  const segments = segmentActivity(grids);
  if (!segments.length) console.error('activity note: no localised action above the bars — an empty array; a stop can still be written by hand');
  console.log(JSON.stringify(segments));
  return EXIT.PASS;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => process.exit(code), err => {
    console.error(`activity: ${err.message}`);
    process.exit(err.code === EXIT.SETUP || err.code === EXIT.RENDER ? err.code : EXIT.RENDER);
  });
}
