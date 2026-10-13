// Time arithmetic for motion pieces. Everything a film or a deck draws is computed from one number, the time,
// through the helpers in this file — never from a timer — so any frame can be drawn alone, in any order, and come
// out the same. This module touches no DOM at import time: Node imports it for the unit tests.

// ---- arithmetic ------------------------------------------------------------------------------------------------
export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (from, to, k) => from + (to - from) * k;
// progress 0..1 of something that starts at t0 and lasts d; a zero-length ramp is a step at t0
export const ramp = (t, begin, length) => (length > 0 ? clamp((t - begin) / length) : t >= begin ? 1 : 0);

// ---- curves: [0,1] → [0,1], pinned at both ends ----------------------------------------------------------------
// expo: fast start, long settle — the shape of an entrance arriving
export const expo = k => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
// inout: symmetric cubic, for moves where both ends are at rest (cuts, camera)
export const inout = k => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 4 * k * k * k : 1 - Math.pow(2 - 2 * k, 3) / 2);
// easeIn: cubic acceleration, for things that leave (attention has already moved on)
export const easeIn = k => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * k);
// spring: a damped oscillation that overshoots about 15% and settles; only ever for spatial values
export const spring = k => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.exp(-6.5 * k) * Math.cos(11 * k));
// soft: the same envelope with a slower swing, roughly half the overshoot
export const soft = k => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.exp(-6.5 * k) * Math.cos(7.5 * k));

// A seeded generator (mulberry32): the same sequence on every run, so "random" placement is still a pure
// function of the seed and a frame stays the same frame.
export function random(seed = 1) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let z = Math.imul(state ^ (state >>> 15), state | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// Seconds for n beats at a tempo, rounded to the millisecond so scene lengths sit on a music grid exactly.
export const beats = bpm => n => Math.round((n * 60000) / bpm) / 1000;

// ---- CSS easing strings → functions ----------------------------------------------------------------------------
// The lock stores curves in CSS notation (tokens.motion.easings → --motion-ease-<name>), so the kit has to evaluate
// that notation itself: a JS-driven frame cannot hand the curve to the browser's animation engine.

const KEYWORDS = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

// cubic-bezier with P0=(0,0), P3=(1,1). x(u) is monotonic when x1,x2 ∈ [0,1] (CSS rejects anything else), so
// x → u is solved by Newton's method and, where the slope is too flat to trust, by bisection.
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const xOf = u => ((ax * u + bx) * u + cx) * u;
  const yOf = u => ((ay * u + by) * u + cy) * u;
  const dxOf = u => (3 * ax * u + 2 * bx) * u + cx;
  const solve = x => {
    let u = x;
    for (let n = 0; n < 8; n++) {
      const err = xOf(u) - x;
      if (Math.abs(err) < 1e-7) return u;
      const slope = dxOf(u);
      if (Math.abs(slope) < 1e-6) break;
      u -= err / slope;
    }
    let lo = 0, hi = 1;
    u = x;
    for (let n = 0; n < 60 && hi - lo > 1e-9; n++) {
      if (xOf(u) < x) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };
  return k => (k <= 0 ? 0 : k >= 1 ? 1 : yOf(solve(k)));
}

// CSS linear(): stops "<output> [<pct> [<pct>]]". A stop without a position is spaced evenly between its known
// neighbours; a position smaller than an earlier one is raised to it (both rules from the CSS Easing spec).
function linearFn(body) {
  const points = [];
  for (const raw of body.split(',')) {
    const parts = raw.trim().split(/\s+/);
    if (!parts[0] || parts.length > 3) return null;
    const y = num(parts[0]);
    if (y === null) return null;
    const xs = parts.slice(1).map(pct);
    if (xs.some(x => x === null)) return null;
    if (!xs.length) points.push({ y, x: null });
    for (const x of xs) points.push({ y, x });
  }
  if (points.length < 2) return null;
  if (points[0].x === null) points[0].x = 0;
  if (points.at(-1).x === null) points.at(-1).x = 1;
  let floor = -Infinity;
  for (const p of points) if (p.x !== null) { p.x = Math.max(p.x, floor); floor = p.x; }
  for (let i = 1; i < points.length; i++) {
    if (points[i].x !== null) continue;
    let j = i;
    while (points[j].x === null) j++;
    const a = points[i - 1].x, b = points[j].x, span = j - i + 1;
    for (let k = i; k < j; k++) points[k].x = a + ((b - a) * (k - i + 1)) / span;
    i = j;
  }
  return k => {
    if (k <= points[0].x) return points[0].y;
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1], q = points[i];
      // at equal positions the later stop wins: a jump, as the spec draws it
      if (k < q.x || (i === points.length - 1 && k <= q.x)) return q.x === p.x ? q.y : lerp(p.y, q.y, (k - p.x) / (q.x - p.x));
    }
    return points.at(-1).y;
  };
}

// CSS steps(n, <jump>): how many jumps, and whether the first happens at 0, the last at 1, both or neither.
function stepsFn(n, jump = 'jump-end') {
  const pos = { start: 'jump-start', end: 'jump-end' }[jump] ?? jump;
  if (!['jump-start', 'jump-end', 'jump-none', 'jump-both'].includes(pos)) return null;
  if (!Number.isInteger(n) || n < 1 || (pos === 'jump-none' && n < 2)) return null;
  const jumps = pos === 'jump-both' ? n + 1 : pos === 'jump-none' ? n - 1 : n;
  const lead = pos === 'jump-start' || pos === 'jump-both' ? 1 : 0;
  return k => {
    if (k <= 0) return lead / jumps;
    if (k >= 1) return 1;
    return clamp((Math.floor(k * n) + lead) / jumps);
  };
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const num = s => (NUMBER.test(s) ? Number(s) : null);
const pct = s => (s.endsWith('%') && NUMBER.test(s.slice(0, -1)) ? Number(s.slice(0, -1)) / 100 : null);

// easing('cubic-bezier(0.2,0,0,1)') → k => …, or null when the string is not a CSS easing this kit can evaluate.
export function easing(css) {
  if (typeof css !== 'string') return null;
  const s = css.trim().toLowerCase();
  if (s === 'linear') return k => clamp(k);
  if (KEYWORDS[s]) return bezier(...KEYWORDS[s]);
  if (s === 'step-start') return stepsFn(1, 'jump-start');
  if (s === 'step-end') return stepsFn(1, 'jump-end');
  const m = /^([a-z-]+)\((.*)\)$/.exec(s);
  if (!m) return null;
  const [, fn, body] = m;
  if (fn === 'cubic-bezier') {
    const v = body.split(',').map(x => num(x.trim()));
    if (v.length !== 4 || v.some(x => x === null)) return null;
    if (v[0] < 0 || v[0] > 1 || v[2] < 0 || v[2] > 1) return null;
    return bezier(...v);
  }
  if (fn === 'linear') return linearFn(body);
  if (fn === 'steps') {
    const [count, jump, extra] = body.split(',').map(x => x.trim());
    if (extra !== undefined || !/^\d+$/.test(count ?? '')) return null;   // CSS wants an <integer>: '4.0' is not one
    return stepsFn(Number(count), jump);
  }
  return null;
}

// '150ms' | '0.15s' | '150' (a bare number is milliseconds, as tokens.motion.durationsMs stores it) → seconds.
export function duration(css) {
  if (typeof css !== 'string') return null;
  const s = css.trim().toLowerCase();
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(ms|s)?$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  if (!(v >= 0)) return null;
  return m[2] === 's' ? v : v / 1000;
}

// ---- motion roles → lock tokens --------------------------------------------------------------------------------
// A piece names ROLES (enter, exit, cut; ease.enter, ease.exit, ease.move) and maps each to a lock token NAME.
// The look of motion — how long, which curve — then comes from the lock; WHEN things happen stays the piece's.
//
// KIT DEFAULTS. Used ONLY for a role the lock does not resolve (no mapping, no such variable, or a value the kit
// cannot read); each such role is listed in `unresolved`, and `motion.mjs check` reports it (an error when the lock
// declares tokens.motion, a skip when it does not).
//   enter 0.5 s · exit 0.3 s · cut 0.34 s · ease.enter expo (decelerate) · ease.exit easeIn · ease.move inout
export const DEFAULTS = Object.freeze({
  enter: 0.5,
  exit: 0.3,
  cut: 0.34,
  'ease.enter': 'expo',
  'ease.exit': 'easeIn',
  'ease.move': 'inout',
});
const DEFAULT_CURVES = { expo, easeIn, inout };
export const DURATION_ROLES = ['enter', 'exit', 'cut'];
export const EASE_ROLES = ['ease.enter', 'ease.exit', 'ease.move'];

// Pure: `read(propertyName)` returns the computed string ('' when unset). Each resolved entry is
// { name, prop, raw, value, source } — raw is the string the property held ('' when absent, null when the role was
// not mapped), value in seconds for durations or the CSS string for curves — plus a non-enumerable `fn` (seconds or
// curve function) so it never leaks into JSON handed to the tools. source 'token' means only "read from a custom
// property": a piece can define --motion-* itself, so `motion.mjs check` compares each value with the lock's
// tokens.motion by name; the kit does not try to tell the two apart.
export function resolveMotion(roles = {}, read = () => '') {
  const resolved = {}, unresolved = [];
  const settle = (role, name, prop, parse) => {
    const raw = name ? String(read(prop) ?? '').trim() : '';
    const parsed = raw ? parse(raw) : null;
    const fromToken = parsed !== null;
    const value = fromToken ? (typeof parsed === 'number' ? parsed : raw) : DEFAULTS[role];
    const entry = { name: name ?? null, prop: prop ?? null, raw: name ? raw : null, value, source: fromToken ? 'token' : 'default' };
    const fn = fromToken ? parsed : typeof DEFAULTS[role] === 'number' ? DEFAULTS[role] : DEFAULT_CURVES[DEFAULTS[role]];
    Object.defineProperty(entry, 'fn', { value: fn, enumerable: false });
    if (!fromToken) unresolved.push(role);
    resolved[role] = entry;
  };
  for (const role of DURATION_ROLES) {
    const name = typeof roles[role] === 'string' && roles[role] ? roles[role] : null;
    settle(role, name, name && `--motion-${name}`, duration);
  }
  for (const role of EASE_ROLES) {
    const key = role.slice(5), given = roles.ease?.[key];
    const name = typeof given === 'string' && given ? given : null;
    settle(role, name, name && `--motion-ease-${name}`, easing);
  }
  return { resolved, unresolved };
}

// In the page: read the role tokens from :root's computed style (custom properties are computed with their var()
// references substituted, so a lock alias resolves here too).
export function readMotionTokens(roles, el = document.documentElement) {
  const style = getComputedStyle(el);
  return resolveMotion(roles, prop => style.getPropertyValue(prop));
}
