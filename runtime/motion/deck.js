// A deck is a run of scenes a presenter advances with a clicker. Inside a scene each press plays one beat — the
// entrances bound to that press — and the picture then holds still for as long as the speaker needs. Each held
// picture is a pose. deck() works out where every pose falls on one deck timeline; the clock (clock.js) turns
// presses into a time on it; render(state) draws that time. Live, recorded and automatic playback all go through
// the same render, so they cannot disagree.
//
// From a piece's piece.js, with deck and mount imported from ../../kit/deck.js (deck() returns a promise; mount
// awaits it):
//   await mount(deck({ id, title, W, H, fps, hold, motion, scenes: [{ id, label, notes, exit, out, hold, steps, curtain }], draw, prepare, live, fx }));
//
// Scenes: <section data-scene="ID"> inside <div id="stage"> (the older <section class="sc" id="sc-ID"> also works).
//   steps     seconds each press must at least last, when code-drawn motion needs more than the entrances
//   exit      'cut' | 'fade' | 'wipe' — sized by the `cut` role; `out` (seconds) overrides it and is a literal
//   hold      seconds a pose stays up in the automatic film (one number, or one per press) — the piece's tempo
//   curtain   the presenter's note for pose 0, before any press; curtainHold is its hold (default 1 s)
//   margin    px the rest-pose audit keeps clear of the stage edge (default 0: the edge itself)
//   draw({ state, scene, lt, t, total, idle, exact, sceneOf })  anything markup cannot express; may return a
//             promise when `exact` (stills, films and poses wait for it) but must never make live playback wait
//   setup({ W, H, fps, scenes })  once, after fonts and pictures, every scene visible: size type with fit(), measure
//   prepare(i)  runs on arriving at pose i, to warm up what the next beat needs
//   live      true, or a Set of scene ids that keep moving while held (redrawn every frame at rest)
import { clamp, ramp, readMotionTokens } from './time.js';
import { entrances, layoutAudit, clearStaleReadiness } from './entrances.js';

export { mount } from './stage.js';
export * from './time.js';
export { fit, splitWords } from './entrances.js';

// Exit lengths as multiples of the `cut` role (default 0.34 s); the outgoing part belongs to the scene that leaves.
// A wipe's plate then clears off the incoming scene in WIPE_LEAVE × cut.
export const EXIT_FACTOR = Object.freeze({ cut: 0, fade: 0.6, wipe: 0.7 });
export const WIPE_LEAVE = 1.1;

export async function deck(def) {
  clearStaleReadiness();
  try {
    return await build(def);
  } catch (err) {
    // deck() runs before mount(): flag the failure here too, or the tools would wait for a readiness that never comes
    document.documentElement.setAttribute('data-motion-error', String(err?.message ?? err));
    throw err;
  }
}

async function build(def) {
  const { id, title = id, W = 1920, H = 1080, fps = 30, hold = 2, start = 0, margin = 0, draw, prepare, live, fx } = def;
  if ('fonts' in def) throw new Error('deck() takes no `fonts` option: the lock lists the fonts (fonts[].fontChecks) and `motion.mjs check` verifies them');
  if (!def.scenes?.length) throw new Error('deck() needs at least one scene');
  const motion = readMotionTokens(def.motion ?? {});
  const reg = entrances({ motion, fx });
  const { rig } = reg;
  // The timeline is kept in whole frames, so every pose is exactly a frame of the film. Rounding is always up:
  // a beat may end a fraction of a frame late, never early.
  const frames = seconds => Math.ceil(seconds * fps - 1e-6);
  const leaveFrames = frames(rig.cut * WIPE_LEAVE);

  const scenes = def.scenes.map(spec => {
    const el = document.querySelector(`[data-scene="${CSS.escape(spec.id)}"]`) ?? document.getElementById(`sc-${spec.id}`);
    if (!el) throw new Error(`scene "${spec.id}" is listed, but the page has neither data-scene="${spec.id}" nor id="sc-${spec.id}"`);
    const exit = spec.exit ?? 'cut';
    if (!Object.hasOwn(EXIT_FACTOR, exit)) throw new Error(`scene "${spec.id}": exit must be one of ${Object.keys(EXIT_FACTOR).join(' | ')}`);
    return { spec, id: spec.id, el, exit };
  });
  // setup, as in a film: after fonts and pictures, with every scene shown so measurements (fit()) see real
  // boxes, and before the entrances are collected and the poses laid out from the markup it may have changed
  // The stage gets its size now, not at mount: setup measures inside it, and a stage of no size would make every
  // scene 0 px wide. Unscaled during setup in both modes; in tool mode it also sits at 0,0 for good — the viewport
  // is the stage.
  const stageEl = document.querySelector('#stage');
  if (stageEl) {
    Object.assign(stageEl.style, { width: `${W}px`, height: `${H}px`, transform: 'none' });
    if (new URLSearchParams(location.search).has('tool')) Object.assign(stageEl.style, { left: '0px', top: '0px' });
  }
  await document.fonts.ready;
  await Promise.all(Array.from(document.images, img => img.decode().catch(() => {})));   // failures are reported by mount()
  for (const sc of scenes) sc.el.setAttribute('data-on', '');
  try {
    if (def.setup) await def.setup({ W, H, fps, scenes: scenes.map(({ id, el }) => ({ id, el })) });
  } finally {
    for (const sc of scenes) sc.el.removeAttribute('data-on');
  }
  for (const sc of scenes) sc.entries = reg.collect(sc.el, { kind: 'deck', scene: sc.id });
  // An entrance outside every scene would never be drawn by a deck: refuse it rather than ship it inert.
  for (const el of document.querySelectorAll('[data-fx], [data-each], [data-dur]')) {
    if (!el.closest('[data-scene], .sc')) throw new Error(`deck: ${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}" carries an entrance attribute outside every scene, where nothing draws it`);
  }

  // 1 — how many frames each press of each scene needs
  scenes.forEach((sc, order) => {
    const n = order;   // the scene's place in the running order
    const need = reg.ends(sc.entries), least = sc.spec.steps ?? [];
    if (n > 0 && scenes[n - 1].exit === 'wipe') need[0] = Math.max(need[0] ?? 0, leaveFrames / fps);   // rest only once the plate is off
    const count = Math.max(need.length, least.length);
    if (count === 0) throw new Error(`scene "${sc.id}" has nothing to press for: give it entrances (data-fx) or steps: [seconds]`);
    sc.presses = Array.from({ length: count }, (_, k) => frames(Math.max(need[k] ?? 0, least[k] ?? 0)));
    const empty = sc.presses.findIndex(f => f <= 0);
    if (empty !== -1) throw new Error(`scene "${sc.id}", press ${empty + 1}: no entrance and no steps time — the press would change nothing`);
    const finale = n === scenes.length - 1;
    if (sc.spec.out !== undefined && !finale) reg.literals.push({ scene: sc.id, fx: `exit:${sc.exit}`, attr: 'out', value: sc.spec.out, text: `scenes[${n}].out` });
    sc.exitFrames = finale ? 0 : frames(sc.spec.out ?? rig.cut * EXIT_FACTOR[sc.exit]);
  });

  // 2 — lay the scenes end to end; bind each scene's entrances to the frame its presses start on
  let clockFrame = 0;
  for (const sc of scenes) {
    sc.first = clockFrame;
    sc.pressStarts = sc.presses.map((_, k) => sc.presses.slice(0, k).reduce((sum, f) => sum + f, 0));
    sc.restFrame = sc.pressStarts.at(-1) + sc.presses.at(-1);   // local frame of the scene's final pose
    clockFrame += sc.restFrame + sc.exitFrames;
    sc.end = clockFrame;
    reg.bind(sc.entries, sc.pressStarts.map(f => f / fps), sc.id);
  }
  const total = clockFrame / fps;

  // 3 — the poses: the curtain, then the end of every press
  const curtain = { t: 0, scene: scenes[0].id, step: -1, label: 'Before the first press', notes: def.scenes[0].curtain ?? '', hold: def.scenes[0].curtainHold ?? 1 };
  const stops = [curtain, ...scenes.flatMap(sc => sc.presses.map((len, k) => ({
    t: (sc.first + sc.pressStarts[k] + len) / fps, scene: sc.id, step: k,
    label: sc.presses.length > 1 ? `${sc.spec.label ?? sc.id} (${k + 1} of ${sc.presses.length})` : sc.spec.label ?? sc.id,
    notes: sc.spec.notes?.[k] ?? '', hold: (Array.isArray(sc.spec.hold) ? sc.spec.hold[k] : sc.spec.hold) ?? hold,
  })))];

  // The wipe plate: for each scene entered by a wipe, the plate grows across the outgoing scene up to the boundary
  // (anchored on the left edge), then shrinks away towards the right edge over the incoming scene.
  const crossings = scenes.flatMap((sc, n) => (n > 0 && scenes[n - 1].exit === 'wipe' ? [{ boundary: sc.first / fps, cover: scenes[n - 1].exitFrames / fps }] : []));
  const leave = leaveFrames / fps;
  const plate = crossings.length ? Object.assign(document.createElement('div'), { id: 'motion-wipe' }) : null;
  if (plate) (document.getElementById('stage') ?? document.body).append(plate);
  function plateAt(t) {
    for (const { boundary, cover } of crossings) {
      if (t >= boundary - cover && t <= boundary) return { k: rig.curve.move(ramp(t, boundary - cover, cover)), anchor: '0 50%' };
      if (t > boundary && t < boundary + leave) return { k: 1 - rig.curve.move(ramp(t, boundary, leave)), anchor: '100% 50%' };
    }
    return { k: 0, anchor: '0 50%' };
  }

  // the scene drawn at deck time t: a scene keeps its final instant, so the pose before a cut is still its own
  const sceneAt = t => scenes.find(sc => t <= sc.end / fps + 1e-9) ?? scenes.at(-1);
  const specOf = new Map(scenes.map(sc => [sc.id, sc.spec]));
  let showing = null;

  function render(state, { exact = false } = {}) {
    const t = clamp(state.t, 0, total), sc = sceneAt(t), lt = t - sc.first / fps;
    for (const other of scenes) other.el.toggleAttribute('data-on', other === sc);   // by attribute, never an inline display: the piece's display rule stays in charge
    reg.run(sc.entries, lt);
    const fading = sc.exit === 'fade' ? rig.curve.move(ramp(lt, sc.restFrame / fps, sc.exitFrames / fps)) : 0;
    sc.el.style.opacity = String(1 - fading);
    if (plate) {
      const { k, anchor } = plateAt(t);
      plate.style.transformOrigin = anchor;
      plate.style.scale = `${k} 1`;
    }
    showing = sc;   // kept for audit() only; nothing above is skipped because of it
    return draw?.({ state, scene: sc.id, lt, t, total, idle: state.idle, exact: !!exact, sceneOf: key => specOf.get(key) });
  }

  // the rest-pose audit of the scene on screen, in stage pixels
  function audit() {
    const box = document.getElementById('stage')?.getBoundingClientRect();
    const origin = box ? { x: box.left, y: box.top, k: box.width / W || 1 } : { x: 0, y: 0, k: 1 };
    return layoutAudit(showing ? [{ scene: showing.id, el: showing.el }] : [], { W, H, margin, origin });
  }

  return {
    id, title, W, H, fps, hold, start, margin, live, prepare, stops, total, render, audit,
    motion: { resolved: motion.resolved, unresolved: motion.unresolved, literals: reg.literals },
    fast: rig.exit,   // the clock hurries and steps back in the `exit` role duration
    scenes: scenes.map(sc => ({ id: sc.id, from: sc.first / fps, len: (sc.end - sc.first) / fps, exit: sc.exit })),
  };
}
