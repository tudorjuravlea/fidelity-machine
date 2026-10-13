// A film is a page whose picture depends on one number only: t, seconds since the start. The page itself never
// moves — no CSS transition or animation, no timer — so the tools can ask for any instant, in any order, and get
// the same picture every time: that is what lets a film be checked frame by frame and encoded reproducibly.
//
// From a piece's piece.js, with film imported from ../../kit/film.js:
//   await film({ title, width, height, fps, margin, motion, scenes: [{ id, dur, cut, draw, rest }], setup, frame, fx });
//
// One <section data-scene="id"> per scene; entrances are data-fx attributes (README.md, entrances.js).
// Tool mode (?tool) draws ?t=<s> or ?frame=<n> (default 0) and then sets data-render-ready on <html>; without
// ?tool the page plays for a person and never claims readiness. window.__motion is the tools' only interface.
import { clamp, ramp, readMotionTokens } from './time.js';
import { entrances, layoutAudit, settlePictures, twoFrames, clearStaleReadiness } from './entrances.js';

export * from './time.js';
export { fit, splitWords } from './entrances.js';

const pair = (x, y) => [x, y].map(v => `${v}px`).join(' ');

// For a draw hook: opacity, offset, scale and turn of one element. It writes the individual translate / scale /
// rotate properties, so a `transform` the element already has (a skew, a centring) survives.
export function put(el, { o, x = 0, y = 0, s = 1, r = 0 } = {}) {
  if (o !== undefined) el.style.opacity = String(o);
  el.style.translate = pair(x, y);
  el.style.scale = String(s);
  el.style.rotate = `${r}deg`;
}

// Cut lengths as multiples of the `cut` role (default 0.34 s). The window straddles the scene boundary: a wipe's
// plate is at full cover on the boundary itself; a push or a fade shows both scenes across the window.
export const CUT_FACTOR = Object.freeze({ cut: 0, fade: 1.2, wipe: 2.0, push: 2.6 });
const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
// How far the wipe plate travels each side of the frame, in frame widths. The plate is 1.6 widths wide and tilted
// 7°, so it is wholly off the frame only after moving about 1.4 widths (a little more on a tall frame); 1.8 leaves
// room for whatever shape or rounding a piece gives #motion-wipe.
const PLATE_TRAVEL = 1.8;
const HOLD_AFTER_SETTLE = 0.3;   // seconds a scene stays complete before its rest pose is taken

// What is on screen at t, as data — no DOM. scenes: [{ start, end, dur, half, cut: { type, dir } }] in order.
// → { main, shots: [{ index, lt, opacity, shift }], plate } where opacity is null unless a fade is blending, shift
// is null unless a push is travelling, and plate is { x } while a wipe's plate is in the frame.
export function framing(scenes, t, { W, H, curve }) {
  const last = scenes.length - 1;
  let main = scenes.findIndex(s => t < s.end);
  if (main === -1) main = last;
  const blends = s => s.cut.type === 'fade' || s.cut.type === 'push';
  const span = s => [s.start - s.half, s.start + s.half];
  // the boundary being crossed, if t is inside a blending cut's window (the incoming scene names the cut)
  const incoming = [main, main + 1].find(i => i > 0 && i <= last && blends(scenes[i]) && t >= span(scenes[i])[0] && t < span(scenes[i])[1]);
  const shots = [];
  if (incoming === undefined) shots.push({ index: main, lt: t - scenes[main].start, opacity: null, shift: null });
  else {
    const into = scenes[incoming], p = curve(ramp(t, into.start - into.half, 2 * into.half));
    const [dx, dy] = DIRECTIONS[into.cut.dir ?? 'up'];
    for (const [index, share] of [[incoming - 1, 1 - p], [incoming, p]]) {
      const going = index < incoming;
      shots.push({
        index, lt: t - scenes[index].start,
        opacity: into.cut.type === 'fade' ? share : null,
        shift: into.cut.type === 'push' ? (going ? [dx * p * W, dy * p * H] : [-dx * (1 - p) * W, -dy * (1 - p) * H]) : null,
      });
    }
  }
  const wiping = scenes.find(s => s.cut.type === 'wipe' && s.half > 0 && Math.abs(t - s.start) < s.half);
  const plate = wiping ? { x: (curve(ramp(t, wiping.start - wiping.half, 2 * wiping.half)) * 2 - 1) * PLATE_TRAVEL * W } : null;
  return { main, shots, plate };
}

export async function film(def) {
  clearStaleReadiness();
  try {
    return await assemble(def);
  } catch (err) {
    // the tools wait for data-render-ready; this attribute tells them why it will never be set
    document.documentElement.setAttribute('data-motion-error', String(err?.message ?? err));
    throw err;
  }
}

async function assemble(def) {
  if ('fonts' in def) throw new Error('film() takes no `fonts` option: the lock lists the fonts (fonts[].fontChecks) and `motion.mjs check` verifies them');
  const size = { W: def.width ?? 1080, H: def.height ?? 1350 };
  const fps = def.fps ?? 30, margin = def.margin ?? 64, { W, H } = size;
  const params = new URLSearchParams(location.search), tool = params.has('tool');
  const html = document.documentElement;
  html.style.setProperty('--W', `${W}px`);
  html.style.setProperty('--H', `${H}px`);

  const motion = readMotionTokens(def.motion ?? {});
  const reg = entrances({ motion, fx: def.fx });

  // lay the scenes end to end
  let cursor = 0;
  const scenes = def.scenes.map((spec, index) => {
    if (!(spec.dur > 0)) throw new Error(`scene "${spec.id}": dur has to be a positive number of seconds`);
    const el = document.querySelector(`[data-scene="${CSS.escape(spec.id)}"]`);
    if (!el) throw new Error(`scene "${spec.id}" is listed, but the page has no element with data-scene="${spec.id}"`);
    const cut = typeof spec.cut === 'string' ? { type: spec.cut } : { type: 'cut', ...spec.cut };
    if (!Object.hasOwn(CUT_FACTOR, cut.type)) throw new Error(`scene "${spec.id}": cut must be one of ${Object.keys(CUT_FACTOR).join(' | ')}`);
    if (cut.type === 'push' && !DIRECTIONS[cut.dir ?? 'up']) throw new Error(`scene "${spec.id}": a push travels up, down, left or right`);
    const scene = { spec, id: spec.id, el, index, start: cursor, end: cursor + spec.dur, dur: spec.dur, cut };
    cursor += spec.dur;
    return scene;
  });
  // half of each cut window, never more than half of either scene it joins (the first scene has no cut)
  scenes.forEach((s, i) => { s.half = i ? Math.min(reg.rig.cut * CUT_FACTOR[s.cut.type], scenes[i - 1].dur, s.dur) / 2 : 0; });
  const duration = Math.round(cursor * 1000) / 1000, frames = Math.round(duration * fps);

  await document.fonts.ready;
  // Every scene is shown while setup runs: a hidden scene has no layout, so fit() and any other measurement
  // would see zero widths. The first draw below then leaves only the scene on screen switched on.
  for (const s of scenes) s.el.setAttribute('data-on', '');
  try {
    if (def.setup) await def.setup({ W, H, fps, margin, scenes: scenes.map(({ id, el, start, end }) => ({ id, el, start, end })) });
  } finally {
    for (const s of scenes) s.el.removeAttribute('data-on');
  }

  // collected after setup, which may size or rewrite text the word splitter then cuts up
  for (const s of scenes) s.entries = reg.collect(s.el, { kind: 'film', scene: s.id });
  const loose = reg.collect(document, { kind: 'film', loose: true });
  const partial = Array.from(document.querySelectorAll('[data-during]'), el => ({ el, scenes: new Set(el.dataset.during.trim().split(/\s+/)) }));
  const plate = Object.assign(document.createElement('div'), { id: 'motion-wipe' });
  document.body.append(plate);

  // Each scene's rest pose: complete, with nothing gone yet. Unless the scene names one, it is HOLD_AFTER_SETTLE
  // after the last entrance settles — no earlier than the end of the incoming cut, no later than one frame before
  // the outgoing cut (or a leaving that follows the settle) begins — and it is floored onto the frame grid.
  for (const scene of scenes) {
    const s = scene, settled = reg.settled(s.entries);
    const leavings = s.entries.map(e => e.out).filter(out => out !== null && out >= settled);
    const latest = Math.min(s.dur - (scenes[s.index + 1]?.half ?? 0), ...leavings) - 1 / fps;
    const local = s.spec.rest !== undefined ? clamp(s.spec.rest, 0, s.dur - 1 / fps) : Math.min(latest, Math.max(s.half, settled + HOLD_AFTER_SETTLE));
    s.rest = Math.max(s.start, Math.floor((s.start + local) * fps + 1e-6) / fps);
  }

  // Draw instant t. Returns the scene on screen and whatever promises the hooks returned (awaited in tool mode).
  function paint(t, exact) {
    t = clamp(Number(t), 0, duration - 1e-6);
    const view = framing(scenes, t, { W, H, curve: reg.rig.curve.move });
    const onScreen = new Map(view.shots.map(shot => [shot.index, shot]));
    const pending = [];
    scenes.forEach((s, i) => {
      const shot = onScreen.get(i);
      s.el.toggleAttribute('data-on', !!shot);   // shown by attribute: the piece's own display rule applies
      s.el.style.opacity = shot?.opacity == null ? '' : String(shot.opacity);
      s.el.style.translate = shot?.shift ? pair(...shot.shift) : '';
    });
    for (const shot of view.shots) {
      const s = scenes[shot.index];
      reg.run(s.entries, shot.lt);
      pending.push(s.spec.draw?.(shot.lt, { t, W, H, scene: s.id, p: clamp(shot.lt / s.dur), exact }));
    }
    reg.run(loose, t);
    const current = scenes[view.main];
    for (const item of partial) item.el.style.display = item.scenes.has(current.id) ? '' : 'none';
    plate.style.display = view.plate ? 'block' : 'none';
    plate.style.translate = view.plate ? pair(view.plate.x, 0) : '';
    pending.push(def.frame?.(t, { W, H, scene: current.id, lt: t - current.start, exact }));
    return { scene: current.id, pending };
  }
  // the tools' draw: hooks finished, two frames painted, then the scene id
  const at = async t => {
    const done = paint(t, true);
    await Promise.all(done.pending);
    await twoFrames();
    return done.scene;
  };

  const picturesMissing = [];
  const api = window.__motion = {
    kind: 'film',
    meta: {
      title: def.title ?? document.title, W, H, fps, frames, duration, margin,
      scenes: scenes.map(s => ({ id: s.id, start: s.start, end: s.end, rest: s.rest, cut: s.cut.type })),
      picturesMissing,
      motion: { resolved: motion.resolved, unresolved: motion.unresolved, literals: reg.literals },
    },
    at,
    frame: n => at(Number(n) / fps),
    audit() {
      const roots = scenes.filter(s => s.el.hasAttribute('data-on')).map(s => ({ scene: s.id, el: s.el }));
      const outsideScenes = new Set([...loose.map(e => e.el), ...document.querySelectorAll('[data-keep]')].filter(el => !el.closest('[data-scene]')));
      roots.push({ scene: null, el: document.body, only: [...outsideScenes] });
      return layoutAudit(roots, { W, H, margin });
    },
  };

  if (!tool) return watch({ paint, W, H, duration, params, api });
  const asked = params.has('frame') ? Number(params.get('frame')) / fps : Number(params.get('t') ?? 0);
  if (!Number.isFinite(asked)) throw new Error(`?t or ?frame must be a number, not "${params.get('frame') ?? params.get('t')}"`);
  // draw once so setup's text and pictures are laid out and start loading, wait for them, then draw for real
  await at(asked);
  picturesMissing.push(...await settlePictures());
  await at(asked);
  html.setAttribute('data-render-ready', '');
  return api;
}

// Watching in a browser (no ?tool): ?t=12.5 opens on that instant, ?play runs it. Space toggles play, the arrow
// keys move a second, Home goes back to the start. The overlay is styled inline — no still or gate ever sees it —
// and this mode never sets data-render-ready, so a screen url that forgot ?tool fails loudly instead of capturing it.
function watch({ paint, W, H, duration, params, api }) {
  const opensAt = Number.parseFloat(params.get('t') ?? params.get('play') ?? '0');   // ?t=5 or ?play=5 open on second 5
  const view = { t: Number.isFinite(opensAt) ? opensAt : 0, running: params.has('play'), tick: performance.now() };
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', right: '10px', bottom: '10px', zIndex: 99, padding: '3px 9px', borderRadius: '5px',
    font: '600 12px/1.5 system-ui, sans-serif', color: '#fff', background: 'rgba(0,0,0,.62)',
  });
  document.body.append(overlay);
  const show = () => {
    const { scene } = paint(view.t, false);
    overlay.textContent = `${scene} — ${view.t.toFixed(2)} s${view.running ? '' : ' (paused)'}`;
  };
  const keys = {
    ' ': () => { view.running = !view.running; },
    ArrowRight: () => { view.t = Math.min(duration, view.t + 1); },
    ArrowLeft: () => { view.t = Math.max(0, view.t - 1); },
    Home: () => { view.t = 0; },
  };
  window.addEventListener('keydown', e => {
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
    view.tick = performance.now();
    show();
  });
  // the wall clock only chooses which t to paint; the picture is still paint(t)
  const step = now => {
    if (view.running) { view.t = (view.t + (now - view.tick) / 1000) % duration; show(); }
    view.tick = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  const scaleToWindow = () => {
    const k = Math.min(innerWidth / W, innerHeight / H, 1);
    document.body.style.zoom = String(k);
    overlay.style.zoom = String(1 / k);
  };
  scaleToWindow();
  addEventListener('resize', scaleToWindow);
  show();
  document.documentElement.setAttribute('data-motion-live', '');
  return api;
}
