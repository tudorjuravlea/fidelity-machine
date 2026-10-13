// Entrances written in the markup — ONE registry for films and decks. An element says how it arrives
// (data-fx="rise"), when (data-at; in a deck also data-step, the press it belongs to) and, rarely, how it leaves
// (data-out in a film, data-until in a deck). Every type is a pure function of the seconds since it began: called
// with the same time it writes the same values, whatever was drawn before, which is what lets the tools draw any
// frame in any order. No DOM is touched at import time (Node imports this file for the unit tests).
import { clamp, lerp, ramp, expo, inout, spring, soft } from './time.js';

// ---- durations: one token moves the whole vocabulary ----------------------------------------------------------
// Each type lasts the `enter` role duration times its factor, so changing the lock's token re-times every entrance
// coherently. For `words` and `punch` the factor is per word; the gap between words is choreography (data-gap).
// `count` is the one type whose length is choreography: how long a number takes depends on how far it counts, so
// its data-dur is never a literal finding.
export const FACTORS = Object.freeze({
  fade: 0.8, rise: 1.2, pop: 0.9, words: 1.1, punch: 1.0, slam: 1.0,
  throw: 1.4, drop: 1.2, count: 1.8, draw: 1.4, drawy: 0.8, block: 1.8,
});
// The share of a type's duration over which its opacity arrives: effects run shorter than the spatial move they
// accompany, or the fade reads as lag. 0 = visible from its first instant (slam arrives already opaque).
export const FADE_SHARE = Object.freeze({
  fade: 1, rise: 0.4, pop: 0.27, words: 0.33, punch: 0.16, slam: 0,
  throw: 0.15, drop: 0.1, count: 0.15,
});
// The spatial curve each type has when the lock gives no entrance curve. Spring and soft overshoot, which is legal
// for position and scale and never for opacity — so they are only ever used here, and only while `ease.enter` fell
// back to the kit default. When the lock names an entrance curve, every spatial move uses it: the lock's curve wins.
const NATIVE = { rise: expo, pop: spring, words: expo, punch: spring, slam: expo, throw: soft, drop: spring, draw: expo, drawy: expo, block: inout };
export const TYPES = Object.freeze(Object.keys(FACTORS));

// The resolved motion (time.js resolveMotion) reduced to what the entrances need: seconds and curve functions.
export function rigOf(motion) {
  const r = motion.resolved;
  return {
    enter: r.enter.fn, exit: r.exit.fn, cut: r.cut.fn,
    curve: { enter: r['ease.enter'].fn, exit: r['ease.exit'].fn, move: r['ease.move'].fn },
    lockCurve: r['ease.enter'].source === 'token',
  };
}
export const spatialCurve = (type, rig) => (rig.lockCurve ? rig.curve.enter : NATIVE[type] ?? rig.curve.enter);

// Default seconds between words: words spread over at most ~0.9 s; punch lands one word per beat-ish.
export const gapOf = (type, words, given) => (given !== undefined ? given : type === 'punch' ? 0.16 : Math.min(0.07, 0.9 / Math.max(1, words)));

// Pure timing of one entrance. spec = { type, dur?, words?, gap? }; custom = the piece's own types.
// → { len, per?, gap?, literal } — len is the seconds until it is fully at rest.
export function timing(spec, rig, custom = {}) {
  const { type } = spec;
  const factor = custom[type]?.factor ?? FACTORS[type] ?? 1;
  const given = spec.dur !== undefined;
  const base = given ? spec.dur : rig.enter * factor;
  const literal = given && type !== 'count';
  if (type === 'words' || type === 'punch') {
    const n = Math.max(1, spec.words ?? 1), gap = gapOf(type, n, spec.gap);
    return { len: base + gap * (n - 1), per: base, gap, literal };
  }
  return { len: base, literal };
}

// A group's own data-dur, as the literal it is: one record for the whole group, none for a count (whose length is
// choreography), none when the group gives no duration. group = { each, dur?, text, scene }.
export function groupLiteral({ each, dur, text, scene = null }) {
  if (dur === undefined || each === 'count') return null;
  return { scene, fx: each, attr: 'data-dur', value: dur, text };
}

// Which elements outside the scenes get their own compositor layer: for every element the kit moves, its nearest
// ancestor that the kit does not move (stopping before the page root), and every kept element the kit does not move.
// Pure over a parent function, so the rule is testable without a page.
export function layerHosts(movers, keeps, parentOf, isRoot) {
  const hosts = new Set();
  for (const mover of movers) {
    let up = parentOf(mover);
    while (!isRoot(up) && movers.has(up)) up = parentOf(up);
    if (!isRoot(up)) hosts.add(up);
  }
  for (const kept of keeps) if (!movers.has(kept)) hosts.add(kept);
  return hosts;
}

// A group (data-each): child i starts stagger·i after the group's own data-at.
export const groupStarts = (at, stagger, n) => Array.from({ length: n }, (_, i) => at + i * stagger);
export const STAGGER = 0.08;

// Deck: how long each press of a scene needs — its entrances settled, and anything leaving at that press gone.
// entries: [{ step, delay, len, until }] (step/until 0-based press indexes, until null when it stays).
export function stepEnds(entries, exitSeconds) {
  const out = [];
  for (const e of entries) {
    if (e.len !== null) out[e.step] = Math.max(out[e.step] ?? 0, e.delay + e.len);
    if (e.until !== null && e.until !== undefined) out[e.until] = Math.max(out[e.until] ?? 0, exitSeconds);
  }
  return Array.from(out, x => x ?? 0);
}

// ---- small DOM helpers a piece also uses -----------------------------------------------------------------------
// Give every run of non-space characters inside el its own <span class="w">, leaving the spaces as text nodes, and
// return those spans. Safe to call again: an element already split is returned as it is.
export function splitWords(el) {
  const spans = el.getElementsByClassName('w');   // live: fills in as the text nodes are replaced
  if (spans.length) return Array.from(spans);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const text of texts) {
    const pieces = text.data.match(/\s+|\S+/g) ?? [];
    text.replaceWith(...pieces.map(piece => (/\S/.test(piece) ? Object.assign(document.createElement('span'), { className: 'w', textContent: piece }) : piece)));
  }
  return Array.from(spans);
}

// The largest whole font size (px, within min..max) at which the widest of el's lines measures no more than
// `target` — a headline set to fill its measure. Lines are the `line` matches inside el, or el itself; they must
// not wrap (.ln). Width grows almost linearly with size, so one measurement predicts the answer and a few one-pixel
// steps confirm it. It lays text out, so it belongs in setup, never in a per-frame hook.
export function fit(el, target, { min = 16, max = 420, line = null } = {}) {
  const rows = line ? Array.from(el.querySelectorAll(line)) : [el];
  // A row's width is its text's extent plus its own padding and border — or its box, if that is narrower. A block
  // heading's box is as wide as its container whatever its size; its text is not.
  const span = document.createRange();
  const rowWidth = row => {
    span.selectNodeContents(row);
    const cs = getComputedStyle(row), sides = ['Left', 'Right'].reduce((sum, s) => sum + parseFloat(cs[`padding${s}`]) + parseFloat(cs[`border${s}Width`]), 0);
    return Math.min(row.getBoundingClientRect().width, span.getBoundingClientRect().width + sides);
  };
  const widthAt = size => {
    el.style.fontSize = `${size}px`;
    return rows.reduce((widest, row) => Math.max(widest, rowWidth(row)), 0);
  };
  const probe = 100, measured = widthAt(probe);
  let size = Math.min(max, Math.max(min, measured > 0 ? Math.floor((probe * target) / measured) : max));
  while (size > min && widthAt(size) > target) size -= 1;
  while (size < max && widthAt(size + 1) <= target) size += 1;
  widthAt(size);
  return size;
}

// ---- the types ---------------------------------------------------------------------------------------------------
// apply(entry, s, rig) gets the seconds since the entrance began (negative before it) and returns the style the
// ELEMENT must have — always the same keys for a type, so every property it touches is set on every call. Parts it
// builds inside the element (word spans, the block, the mask) are written in full on every call too.
// Entrances write translate / scale / rotate / opacity only (slam alone adds a skew through `transform`); never a
// layout property, so an entrance cannot move its neighbours.
const opt = (e, name, fallback) => (e.opts[name] !== undefined ? e.opts[name] : fallback);
const sideOf = e => (e.opts.side === 'right' ? 1 : e.opts.side === 'left' ? -1 : e.i % 2 ? 1 : -1);
const fadeIn = (e, s, rig) => rig.curve.enter(ramp(s, 0, e.len * FADE_SHARE[e.type]));

const BUILTIN = {
  fade: { apply: (e, s, rig) => ({ opacity: rig.curve.enter(ramp(s, 0, e.len)) }) },

  // up into place while fading in; or, when the element holds a .mask > .mv, the line rises from behind its own
  // lower edge (the mask hides it, so it never fades)
  rise: {
    prep(e) { e.mv = e.el.querySelector(':scope > .mask > .mv, :scope > .mv'); },
    apply(e, s, rig) {
      const k = spatialCurve('rise', rig)(ramp(s, 0, e.len));
      if (e.mv) { e.mv.style.translate = `0 ${(1 - k) * 112}%`; return { opacity: 1, translate: '0 0' }; }
      return { opacity: fadeIn(e, s, rig), translate: `0 ${(1 - k) * opt(e, 'd', 36)}px` };
    },
  },

  pop: { apply: (e, s, rig) => ({ opacity: fadeIn(e, s, rig), scale: lerp(0.5, 1, spatialCurve('pop', rig)(ramp(s, 0, e.len))) }) },

  // a line arriving from the side with a lean that straightens (data-side left|right; default alternates)
  slam: {
    apply(e, s, rig) {
      const side = sideOf(e), left = 1 - spatialCurve('slam', rig)(ramp(s, 0, e.len));
      return { opacity: s > 0 ? 1 : 0, translate: `${side * left * opt(e, 'd', 1250)}px 0px`, transform: `skewX(${-16 * side * left}deg)` };
    },
  },

  // a plate thrown in from the side, turning as it lands and settling at data-r degrees
  throw: {
    apply(e, s, rig) {
      const side = sideOf(e), left = 1 - spatialCurve('throw', rig)(ramp(s, 0, e.len));
      return { opacity: fadeIn(e, s, rig), translate: `${side * left * opt(e, 'd', 450)}px ${left * 30}px`, rotate: `${opt(e, 'r', 0) + side * left * 7}deg` };
    },
  },

  // a plate dropping into a corner, with more swing
  drop: {
    apply(e, s, rig) {
      const left = 1 - spatialCurve('drop', rig)(ramp(s, 0, e.len));
      return { opacity: fadeIn(e, s, rig), translate: `${left * opt(e, 'd', 520)}px ${left * -60}px`, rotate: `${opt(e, 'r', 0) + left * 16}deg` };
    },
  },

  // the line arrives one word at a time, every word lifting a little as it appears
  words: {
    prep(e) { e.words = splitWords(e.el); },
    apply(e, s, rig) {
      const curve = spatialCurve('words', rig);
      e.words.forEach((w, n) => {
        const q = s - n * e.gap;
        w.style.opacity = rig.curve.enter(ramp(q, 0, e.per * FADE_SHARE.words));
        w.style.translate = `0 ${(1 - curve(ramp(q, 0, e.per))) * 0.38}em`;
      });
      return {};
    },
  },

  // one word at a time again, but each lands oversized and shrinks onto the line
  punch: {
    prep(e) { e.words = splitWords(e.el); },
    apply(e, s, rig) {
      const curve = spatialCurve('punch', rig);
      e.words.forEach((w, n) => {
        const q = s - n * e.gap;
        w.style.opacity = rig.curve.enter(ramp(q, 0, e.per * FADE_SHARE.punch));
        w.style.scale = lerp(1.7, 1, curve(ramp(q, 0, e.per)));
      });
      return {};
    },
  },

  // a number counting from data-from (0) to data-to; data-fix decimals, data-pad integer digits, data-suffix
  count: {
    apply(e, s, rig) {
      const v = lerp(opt(e, 'from', 0), opt(e, 'to', 0), rig.curve.enter(ramp(s, 0, e.len)));
      const [whole, frac] = Math.abs(v).toFixed(opt(e, 'fix', 0)).split('.');
      const sign = v < 0 && Number(whole + (frac ?? '')) !== 0 ? '-' : '';
      e.el.textContent = sign + whole.padStart(opt(e, 'pad', 0), '0') + (frac !== undefined ? `.${frac}` : '') + (e.opts.suffix ?? '');
      return { opacity: fadeIn(e, s, rig) };
    },
  },

  // a rule or bar growing from its left edge (draw) or its top edge (drawy)
  draw: { apply: (e, s, rig) => ({ scale: `${spatialCurve('draw', rig)(ramp(s, 0, e.len))} 1`, transformOrigin: '0 50%' }) },
  drawy: { apply: (e, s, rig) => ({ scale: `1 ${spatialCurve('drawy', rig)(ramp(s, 0, e.len))}`, transformOrigin: '50% 0' }) },

  // a block covers where the line will be, the line appears under it, the block leaves the other way. The block's
  // colour is --motion-block-color (falling back to --motion-wipe-color): the piece's, never the kit's.
  block: {
    prep(e) {
      // built once: a second collect over the same markup finds the parts already there
      let wrap = e.el.querySelector(':scope > .blkw');
      if (!wrap) {
        wrap = document.createElement('span');
        wrap.className = 'blkw';
        const text = Object.assign(document.createElement('span'), { className: 'blkt' });
        text.append(...e.el.childNodes);
        wrap.append(text, Object.assign(document.createElement('i'), { className: 'blk' }));
        e.el.append(wrap);
      }
      e.text = wrap.querySelector(':scope > .blkt');
      e.plate = wrap.querySelector(':scope > .blk');
    },
    apply(e, s, rig) {
      const curve = spatialCurve('block', rig), half = e.len * 0.44;
      const cover = curve(ramp(s, 0, half)), uncover = curve(ramp(s, half, e.len - half));
      e.text.style.opacity = s >= half ? 1 : 0;
      e.plate.style.transformOrigin = uncover > 0 ? '100% 50%' : '0 50%';
      e.plate.style.scale = `${uncover > 0 ? 1 - uncover : cover} 1`;
      return {};
    },
  },
};

// ---- the registry ----------------------------------------------------------------------------------------------
const ATTRS = ['d', 'r', 'side', 'gap', 'to', 'from', 'pad', 'fix', 'suffix'];
const NUMERIC = new Set(['d', 'r', 'gap', 'to', 'from', 'pad', 'fix']);
const short = el => (el.textContent || el.getAttribute?.('alt') || el.tagName || '').trim().replace(/\s+/g, ' ').slice(0, 40);

function number(el, name, fallback) {
  const raw = el.dataset[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`data-${name}="${raw}" is not a number (${el.tagName.toLowerCase()} "${short(el)}")`);
  return v;
}

// entrances({ motion, fx }) → the registry. `motion` is resolveMotion's result; `fx` the piece's own types:
//   { name: { factor?, prep?(entry), apply(entry, s, rig) → style } } — apply must set the same keys every call and
//   leave the element exactly at rest once s ≥ entry.len.
export function entrances({ motion, fx = {} }) {
  const rig = rigOf(motion);
  // A piece may add entrance types, never replace a built-in one: a replaced `count` (or any type) would carry the
  // built-in name while timing itself differently, out of reach of the literal record.
  const clash = Object.keys(fx).filter(name => Object.hasOwn(BUILTIN, name));
  if (clash.length) throw new Error(`fx cannot redefine built-in entrance type${clash.length > 1 ? 's' : ''} ${clash.join(', ')}: give the piece's type its own name`);
  const types = { ...BUILTIN, ...fx };
  const literals = [];

  function make(el, type, { scene, kind, group = null, i = 0, at, step, until, out }) {
    if (!types[type]) throw new Error(`data-fx="${type}" is not an entrance (${Object.keys(types).join(', ')})`);
    const durHost = el.dataset.dur !== undefined ? el : group;   // a group's data-dur times every child
    const dur = durHost ? number(durHost, 'dur', undefined) : undefined;
    const opts = {};
    for (const name of ATTRS) {
      const host = el.dataset[name] !== undefined ? el : group && group.dataset[name] !== undefined ? group : null;
      if (host) opts[name] = NUMERIC.has(name) ? number(host, name, undefined) : host.dataset[name];
    }
    const e = { el, type, kind, scene, i, at, step, until, out, opts, delay: at };
    types[type].prep?.(e);
    const t = timing({ type, dur, words: e.words?.length, gap: opts.gap }, rig, fx);
    Object.assign(e, t);
    if (t.literal && durHost === el) literals.push({ scene, fx: type, attr: 'data-dur', value: dur, text: short(el) });
    return e;
  }

  // collect(scope, { kind, scene, loose }) → entries. Film: `at` is seconds into the scene (or into the film for
  // things outside every scene, loose: true). Deck: `step` is the 0-based press, `at` the delay after it.
  function collect(scope, { kind = 'film', scene = null, loose = false } = {}) {
    const mine = el => (loose ? !el.closest('[data-scene], .sc') : true);
    const timingOf = host => kind === 'deck'
      ? { at: number(host, 'at', 0), step: number(host, 'step', 1) - 1, until: host.dataset.until !== undefined ? number(host, 'until', 0) - 1 : null, out: null }
      : { at: number(host, 'at', 0), step: 0, until: null, out: host.dataset.out !== undefined ? number(host, 'out', 0) : null };
    const list = [];
    const grouped = new Set();
    for (const group of scope.querySelectorAll('[data-each]')) {
      if (!mine(group)) continue;
      const base = timingOf(group);
      const stagger = number(group, 'stagger', STAGGER);
      const kids = [...group.children].filter(k => k.dataset.fx === undefined);
      // a group's own data-dur is ONE literal, recorded on the group whatever its children carry
      const own = groupLiteral({ each: group.dataset.each, dur: number(group, 'dur', undefined), text: short(group), scene });
      if (own) literals.push(own);
      groupStarts(base.at, stagger, kids.length).forEach((at, i) => {
        grouped.add(kids[i]);
        list.push(make(kids[i], group.dataset.each, { scene, kind, group, i, ...base, at, until: null, out: null }));
      });
      // the group itself carries the leaving (one exit for the whole set: exits are never staggered)
      if (base.until !== null || base.out !== null) list.push({ el: group, type: null, kind, scene, ...base, len: null, delay: base.at, opts: {} });
    }
    for (const el of scope.querySelectorAll('[data-fx]')) {
      if (!mine(el)) continue;
      list.push(make(el, el.dataset.fx, { scene, kind, ...timingOf(el) }));
    }
    const leaving = kind === 'deck' ? '[data-until]' : '[data-out]';
    for (const el of scope.querySelectorAll(leaving)) {
      if (!mine(el) || el.dataset.fx !== undefined || el.dataset.each !== undefined || grouped.has(el)) continue;
      const base = timingOf(el);
      list.push({ el, type: null, kind, scene, ...base, len: null, delay: base.at, opts: {} });
    }
    // Things drawn over the scenes (outside every scene) get a compositor layer of their own. Without one, Chromium
    // re-rasterises their text against whatever a push or a wipe moved under them in earlier frames, and the same
    // instant comes out with different antialiasing depending on the drawing order. The layer goes on the CONTAINER
    // of the loose entrances (and on a data-keep element the kit never moves) — never on an element the kit itself
    // translates or fades: a promoted mover keeps the raster it had mid-move, which is the same fault from the other
    // side. Set here, once, in JS: deterministic, and no stylesheet rule a lint would have to allow.
    if (loose) {
      const movers = new Set(list.map(e => e.el));
      const keeps = [...scope.querySelectorAll('[data-keep]')].filter(mine);
      const top = el => el === document.body || el === document.documentElement || !el;
      for (const el of layerHosts(movers, keeps, el => el.parentElement, top)) el.style.willChange = 'transform';
    }
    return list;
  }

  // Deck: fix every entry's start and leaving time once the presses of its scene are known (starts[k] = local
  // second press k begins).
  function bind(list, starts, sceneId) {
    for (const e of list) {
      if (starts[e.step] === undefined) throw new Error(`scene "${sceneId}": data-step="${e.step + 1}" is past the scene's last press`);
      e.at = starts[e.step] + e.delay;
      e.out = e.until === null ? null : starts[e.until] ?? null;
    }
  }

  // Draw a list at local time t: every entrance, then every leaving (an opacity fade on the exit role and curve).
  function run(list, t) {
    for (const e of list) {
      const style = e.type ? types[e.type].apply(e, t - e.at, rig) : {};
      if (e.out !== null && e.out !== undefined) {
        const gone = rig.curve.exit(ramp(t, e.out, rig.exit));
        style.opacity = (style.opacity ?? 1) * (1 - gone);
        style.visibility = gone >= 1 ? 'hidden' : 'visible';
      }
      for (const key in style) e.el.style[key] = String(style[key]);
    }
  }

  const lenOf = e => e.len ?? 0;
  const settled = list => list.reduce((m, e) => Math.max(m, e.len === null ? 0 : e.at + e.len), 0);
  const ends = list => stepEnds(list, rig.exit);
  return { rig, literals, collect, bind, run, lenOf, settled, ends };
}

// ---- page readiness ----------------------------------------------------------------------------------------------
// What a frame waits for before the tools may photograph it. Called after setup AND after a first draw: text that
// setup built only asks for its font once it is laid out, and an image setup pointed somewhere new only starts
// loading then. Returns the pictures that failed, by URL; an <img> with no source at all is named, never "".
export async function settlePictures() {
  await document.fonts.ready;
  const missing = [];
  await Promise.all(Array.from(document.images, img => {
    if (!img.getAttribute('src') && !img.getAttribute('srcset')) {
      missing.push(`<img${img.id ? ` id="${img.id}"` : ''}${img.alt ? ` alt="${img.alt}"` : ''}> has no source`);
      return null;
    }
    return img.decode().catch(() => { missing.push(img.currentSrc || img.src); });
  }));
  await document.fonts.ready;   // a decode can lay out text that brings in one more face
  return missing.sort();
}

// A page saved with data-render-ready already on <html> would look ready before the kit has drawn anything; in tool
// mode the kit takes it off first thing, so the only readiness a tool can see is the one the kit sets.
export function clearStaleReadiness() {
  if (new URLSearchParams(location.search).has('tool')) document.documentElement.removeAttribute('data-render-ready');
}

// Two animation frames: the first commits the styles just written, the second is painted from them. Chromium can
// rasterise the first paint after a large transform change a few pixels differently; by the second it has settled
// — so every tool-mode draw resolves only after both.
export const twoFrames = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));

// ---- the rest-pose audit ---------------------------------------------------------------------------------------
// How far an element's text reaches, for the audit. Each rendered line (one client rect of a Range over the text)
// counts as the band a line occupies: its full width, and one line-height tall around the rect's vertical centre.
// The glyph rect itself is the font's ascent-to-descent, which pokes out of every line under a tight line-height —
// empty space — while a line that spills out of a fixed-height box moves its whole band out with it.
// → the joined band of all lines, or null when there is no text.
export function textReach(lineRects, lineHeight) {
  const half = lineHeight / 2;
  const bands = Array.from(lineRects, r => {
    const middle = (r.top + r.bottom) / 2;
    return { left: r.left, right: r.right, top: middle - half, bottom: middle + half };
  });
  return unionBox(bands);
}

// The area an audited element covers on screen: its own box, its descendants' boxes and the extent of its text.
export const inkBox = (own, descendants = [], text = null) => unionBox([own, ...descendants, ...(text ? [text] : [])]);

// The smallest box holding every rect that has a size ({ left, top, right, bottom }); null when none has one.
// Zero-width or zero-height rects (an empty span, a collapsed wrapper) are left out, so they cannot stretch it.
export function unionBox(rects) {
  let box = null;
  for (const r of rects) {
    if (!(r.right > r.left && r.bottom > r.top)) continue;
    box = box
      ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  return box;
}

// Run on the frame now showing. Two questions: has anything that arrived (or is marked data-keep) ended up inside
// the margin band or off the frame, and is anything lying on top of something else? First every audited element's
// box — its own joined with its sized descendants' — is measured in piece pixels; then the margin test and the
// overlap test run over those boxes separately.
//   roots   [{ scene, el, only? }] — what is on screen; `only` replaces the query below
//   origin  { x, y, k } maps client pixels to piece pixels (a scaled stage)
// data-bleed exempts an element (and its subtree) from BOTH tests — it is decoration meant to run off the edge;
// data-over exempts it from the overlap test only.
const AUDITED = ':is([data-fx], [data-keep], [data-each] > *)';
const flagged = (el, flag) => { for (let n = el; n; n = n.parentElement) if (n.dataset?.[flag] !== undefined) return true; return false; };

export function layoutAudit(roots, { W, H, margin = 0, origin = { x: 0, y: 0, k: 1 } }) {
  // seen at all: rendered, not hidden, and not so transparent (opacities multiply down the tree) that it reads as gone
  const seen = el => {
    if (!el.checkVisibility({ visibilityProperty: true })) return false;
    let alpha = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
    return alpha >= 0.05;
  };
  const label = el => `${el.dataset.fx ?? el.parentElement?.dataset.each ?? 'keep'} "${short(el)}"`;
  const toPiece = c => ({ left: (c.left - origin.x) / origin.k, top: (c.top - origin.y) / origin.k, right: (c.right - origin.x) / origin.k, bottom: (c.bottom - origin.y) / origin.k });

  const boxes = [], textRange = document.createRange();
  for (const { scene, el: root, only } of roots) {
    for (const el of only ?? root.querySelectorAll(AUDITED)) {
      if (flagged(el, 'bleed') || !seen(el)) continue;
      // Where the element really draws: its own box, every sized descendant's (a heading's `width: max-content`
      // lines can run past the heading), and its text (a nowrap line runs past its own box with no child to show it)
      const nested = [...el.querySelectorAll('*')].filter(n => !flagged(n, 'bleed')).map(n => n.getBoundingClientRect());
      textRange.selectNodeContents(el);
      const own = el.getBoundingClientRect();
      // Text counts sideways always (a nowrap line runs out of its box). Up and down it counts only past half a line:
      // a tight line-height lets the font's ascent and descent poke out of every line box, and that is empty space,
      // while a line that really spills out of a box sits a whole line beyond it.
      const cs = getComputedStyle(el), lineHeight = parseFloat(cs.lineHeight) || 1.2 * parseFloat(cs.fontSize) || 0;
      const joined = inkBox(own, nested, textReach(textRange.getClientRects(), lineHeight));
      if (!joined) continue;
      const r = toPiece(joined);
      boxes.push({ el, scene, r, stacks: !flagged(el, 'over') });
    }
  }

  const inside = r => r.left >= margin - 1 && r.top >= margin - 1 && r.right <= W - margin + 1 && r.bottom <= H - margin + 1;
  const report = boxes.filter(b => !inside(b.r))
    .map(b => ({ scene: b.scene, kind: 'outside', what: label(b.el), box: [b.r.left, b.r.top, b.r.right, b.r.bottom].map(Math.round) }));

  // overlaps by a sweep from left to right: once a box starts past another's right edge, no later box can reach it
  const stackable = boxes.filter(b => b.stacks).sort((p, q) => p.r.left - q.r.left);
  stackable.forEach((left, i) => {
    for (let j = i + 1; j < stackable.length && stackable[j].r.left < left.r.right - 3; j++) {
      const right = stackable[j];
      if (left.el.contains(right.el) || right.el.contains(left.el)) continue;   // a wrapper and its own content are not a collision
      const across = Math.min(left.r.right, right.r.right) - right.r.left, down = Math.min(left.r.bottom, right.r.bottom) - Math.max(left.r.top, right.r.top);
      if (across > 3 && down > 3) report.push({ scene: left.scene, kind: 'overlap', what: `${label(left.el)} and ${label(right.el)}`, by: [Math.round(across), Math.round(down)] });
    }
  });
  return report;
}
