// continuity-core.mjs — frame-to-frame continuity of a film, for `motion.mjs check`'s continuity gate.
//
// The determinism gate proves that sampled instants reproduce; the layout gate judges rest poses.
// Neither looks at what happens BETWEEN frames. Because an engine film is a pure function of t,
// the tool can draw every frame in turn, record the box of every visible element, and ask the
// recording three questions:
//   jump          an element's x, y, width or height changed by more than 2 px in one step AND by
//                 more than three times what it moved in the step before and after — a snap inside
//                 a glide or out of stillness. FAIL: no product moves like that.
//   no entrance   an element went from absent (or under 2 % opacity) to full opacity in one step
//                 and then stays put: it did not move, grow or shrink into place on the next
//                 step, and nothing painted covers its whole box (a reveal from under a plate).
//                 WARN: fade it in or grow it out of what it comes from.
//   no exit       an element went from full opacity to gone in one step. WARN.
// A step inside a cut window (the kit's `cutHalf` either side of a scene start) or across a scene
// change is the cut, never judged. The first sample is the opening, never a pop. An element that
// was off the frame a sample earlier arrived by travel (a slam, a throw, the wipe plate), not by a
// pop: off-frame boxes are recorded with a flag and count as present for entrances and exits, but
// never for jumps. An element under a `data-snap` ancestor is meant to step and is not recorded.
// A child that moves with its parent is folded into the parent's line.
//
// recordBoxes() runs INSIDE the page (serialised by page.evaluate, so it is self-contained) and
// returns the visible boxes of one drawn frame; analyseContinuity() runs in Node on the recording.

export function recordBoxes() {
  const ids = (window.__fmContinuityIds ||= new WeakMap());
  const counter = (window.__fmContinuityCounter ||= { n: 0 });
  const W = innerWidth, H = innerHeight;
  const label = (el) => {
    const cls = el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '';
    const id = el.id ? `#${el.id}` : '';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const idOf = (el) => {
    if (!ids.has(el)) ids.set(el, { n: counter.n++, name: label(el) });
    return ids.get(el);
  };
  const items = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(el.tagName)) continue;
    if (el.closest('[data-snap]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height < 16) continue;
    // off the frame (within one frame's reach) is recorded with a flag: it arrived or left by travel
    const off = r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H;
    if (off && (r.right <= -W || r.bottom <= -H || r.left >= 2 * W || r.top >= 2 * H)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // a wrapper that paints nothing cannot be seen to jump; only what it holds can
    const bg = cs.backgroundColor;
    const paints = (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none'
      || parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) > 0;
    const ownText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    const isMedia = ['svg', 'IMG', 'VIDEO', 'CANVAS'].includes(el.tagName);
    if (!paints && !ownText && !isMedia && el.children.length) continue;
    if (el.closest('svg') && el.tagName !== 'svg') continue;
    let alpha = 1;
    for (let p = el; p && p !== document.documentElement && alpha > 0.02; p = p.parentElement) alpha *= Number(getComputedStyle(p).opacity);
    if (alpha <= 0.02) continue;
    const { n, name } = idOf(el);
    const pid = el.parentElement && el.parentElement !== document.body ? idOf(el.parentElement).n : -1;
    items.push([n, name, pid, r.left, r.top, r.width, r.height, Math.round(alpha * 1000) / 1000, off ? 1 : 0, paints ? 1 : 0]);
  }
  return items;
}

// frames: [{ t (s), scene, items: [[id, name, parentId, x, y, w, h, alpha, off, paints]] }], sampled `stride` frames apart.
// cuts: [{ start, half }] — the kit's scene starts with each cut's half-window (meta.scenes[].cutHalf).
export function analyseContinuity(frames, { fps = 30, stride = 1, cuts = [] } = {}) {
  const at = frames.map((f) => new Map(f.items.map((i) => [i[0], i])));
  const X = 3, Y = 4, WIDTH = 5, HEIGHT = 6, A = 7, OFF = 8, PAINTS = 9;
  const secs = (t) => `${t.toFixed(2)} s`;
  const inCut = (f) => cuts.some((c) => c.half > 0 && Math.abs(frames[f].t - c.start) <= c.half + 1e-6);
  const sameScene = (a, b) => frames[a].scene === frames[b].scene && !inCut(a) && !inCut(b);
  const on = (it) => it && !it[OFF];
  const jumps = [], noEntrance = [], noExit = [];

  // jump: f-2, f-1, f, f+1 all present in one scene; the step into f is large and out of step with its neighbours
  const found = [];
  for (let f = 2; f < frames.length - 1; f++) {
    if (!sameScene(f - 2, f + 1)) continue;
    for (const [id, it] of at[f]) {
      const a = at[f - 2].get(id), b = at[f - 1].get(id), c = at[f + 1].get(id);
      if (!on(a) || !on(b) || !on(it) || !on(c)) continue;
      for (const [axis, k] of [['x', X], ['y', Y], ['width', WIDTH], ['height', HEIGHT]]) {
        const d = it[k] - b[k];
        const calm = Math.max(Math.abs(b[k] - a[k]), Math.abs(c[k] - it[k]), 0.4);
        if (Math.abs(d) > 2 && Math.abs(d) > 3 * calm) {
          const prev = found.find((j) => j.id === id && j.axis === axis);
          if (prev) { prev.count++; continue; }
          found.push({ id, parent: it[2], name: it[1], f, t: frames[f].t, axis, d, count: 1 });
        }
      }
    }
  }
  // a parent's snap carries its children: report the outermost only
  for (const j of found.sort((p, q) => p.f - q.f)) {
    if (found.some((p) => p !== j && p.id === j.parent && p.f === j.f && p.axis === j.axis && Math.abs(p.d - j.d) < 0.6)) continue;
    jumps.push({
      id: j.id, name: j.name, axis: j.axis, deltaPx: Math.round(j.d * 10) / 10, t: j.t, count: j.count,
      message: `jump: ${j.name} ${j.axis} ${j.d > 0 ? '+' : ''}${j.d.toFixed(1)}px in one frame at ${secs(j.t)}${j.count > 1 ? `, ${j.count} times` : ''} — nothing moves by a step; ease it, or mark a deliberate step with data-snap`,
    });
  }

  // entrances and exits: judged on consecutive samples inside one scene, never on the first sample
  const full = (it) => it[A] >= 0.98;
  for (let f = 1; f < frames.length; f++) {
    if (!sameScene(f - 1, f)) continue;
    for (const [id, it] of at[f]) {
      if (at[f - 1].has(id) || it[OFF] || !full(it) || it[WIDTH] * it[HEIGHT] < 64) continue;
      // in place on arrival: the next sample (if any, same scene) shows it neither moving nor changing size
      const next = f + 1 < frames.length && sameScene(f, f + 1) ? at[f + 1].get(id) : null;
      const travelling = next && [X, Y, WIDTH, HEIGHT].some((k) => Math.abs(next[k] - it[k]) > 1);
      if (travelling) continue;
      // revealed, not popped: a painted box that is not its ancestor covers it whole at this sample
      const ancestors = new Set();
      for (let p = it[2]; p >= 0 && !ancestors.has(p); p = at[f].get(p)?.[2] ?? -1) ancestors.add(p);
      // (a plate may stop a hairline short of the line box: the leading above and below the ink), or a plate
      // still over most of it and on the move at the next sample: a reveal the sample caught part-way
      const tol = Math.max(2, 0.1 * Math.min(it[WIDTH], it[HEIGHT]));
      const overlap = (o) => {
        const w = Math.min(o[X] + o[WIDTH], it[X] + it[WIDTH]) - Math.max(o[X], it[X]);
        const h = Math.min(o[Y] + o[HEIGHT], it[Y] + it[HEIGHT]) - Math.max(o[Y], it[Y]);
        return w > 0 && h > 0 ? (w * h) / (it[WIDTH] * it[HEIGHT]) : 0;
      };
      const plates = [...at[f].values()].filter((o) => o !== it && o[PAINTS] && !ancestors.has(o[0]) && o[2] !== id);
      const covered = plates.some((o) => o[X] <= it[X] + tol && o[Y] <= it[Y] + tol && o[X] + o[WIDTH] >= it[X] + it[WIDTH] - tol && o[Y] + o[HEIGHT] >= it[Y] + it[HEIGHT] - tol);
      const revealing = plates.some((o) => {
        if (overlap(o) < 0.7) return false;
        const then = next ? at[f + 1].get(o[0]) : null;
        return !then || [X, Y, WIDTH, HEIGHT].some((k) => Math.abs(then[k] - o[k]) > 1);
      });
      if (covered || revealing) continue;
      noEntrance.push({ id, name: it[1], t: frames[f].t, message: `appears with no entrance: ${it[1]} shows at full size and opacity in one frame at ${secs(frames[f].t)} — fade it in, or grow it out of what it comes from` });
    }
    for (const [id, was] of at[f - 1]) {
      if (at[f].has(id) || was[OFF] || !full(was) || was[WIDTH] * was[HEIGHT] < 64) continue;
      // it was not already on its way out (moving or changing size on the step before)
      const before = f >= 2 && sameScene(f - 2, f - 1) ? at[f - 2].get(id) : null;
      const leaving = before && [X, Y, WIDTH, HEIGHT].some((k) => Math.abs(before[k] - was[k]) > 1);
      if (leaving) continue;
      noExit.push({ id, name: was[1], t: frames[f].t, message: `vanishes with no exit: ${was[1]} goes from full opacity to gone in one frame at ${secs(frames[f].t)} — fade it out (or move it out of view) before it is removed` });
    }
  }

  const samples = frames.length;
  const reasons = [];
  if (samples < 4) reasons.push(`only ${samples} frame(s) sampled`);
  if (samples && !frames.some((f) => f.items.length)) reasons.push('no visible element was recorded');
  const coverage = { status: reasons.length ? 'inconclusive' : 'complete', samples, stride, fps, spanS: samples ? frames[samples - 1].t - frames[0].t : 0, reasons };
  return { jumps, noEntrance, noExit, coverage };
}
