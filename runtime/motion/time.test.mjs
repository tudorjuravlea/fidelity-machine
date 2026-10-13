// node --test runtime/motion/ — the time helpers, without a browser.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { easing, duration, resolveMotion, random, beats, expo, inout, easeIn, spring, soft, clamp, ramp, DEFAULTS } from './time.js';

const near = (got, want, tol = 1e-3) => assert.ok(Math.abs(got - want) <= tol, `${got} is not within ${tol} of ${want}`);

test('cubic-bezier is solved for x, not sampled in t', () => {
  const ease = easing('cubic-bezier(0.25,0.1,0.25,1)');
  near(ease(0.5), 0.8024);
  near(ease(0), 0, 0); near(ease(1), 1, 0);
  // y = x when the control points sit on the diagonal: any error here is the x→t solve
  const diagonal = easing('cubic-bezier(0.3, 0.3, 0.7, 0.7)');
  for (const x of [0.1, 0.33, 0.5, 0.77, 0.95]) near(diagonal(x), x, 1e-4);
  // a steep decelerate curve (the kind a lock ships) stays monotonic and pinned
  const decel = easing('cubic-bezier(0.2, 0, 0, 1)');
  let last = 0;
  for (let k = 0; k <= 100; k++) { const y = decel(k / 100); assert.ok(y >= last - 1e-9, `not monotonic at ${k}`); last = y; }
  near(decel(1), 1, 0);
});

test('keywords are the CSS curves', () => {
  near(easing('linear')(0.37), 0.37, 1e-9);
  near(easing('ease')(0.5), easing('cubic-bezier(0.25, 0.1, 0.25, 1)')(0.5), 1e-9);
  near(easing('ease-in')(0.5), 0.3153);
  near(easing('ease-out')(0.5), 0.6847);
  near(easing('ease-in-out')(0.5), 0.5);
  near(easing('  EASE-IN-OUT ')(0.25), 0.1291);
});

test('linear() with stops: positions, defaults and even spacing', () => {
  const f = easing('linear(0, 0.5 25%, 1)');
  near(f(0), 0, 1e-9); near(f(0.25), 0.5, 1e-9); near(f(0.125), 0.25, 1e-9); near(f(0.625), 0.75, 1e-9); near(f(1), 1, 1e-9);
  const even = easing('linear(0, 0.25, 1)');            // the middle stop sits at 50%
  near(even(0.5), 0.25, 1e-9); near(even(0.75), 0.625, 1e-9);
  const floored = easing('linear(0, 0.5 60%, 0.8 40%, 1)');   // a position below an earlier one is raised to it: a jump at 60%
  near(floored(0.3), 0.25, 1e-9); near(floored(0.6), 0.8, 1e-9); near(floored(0.8), 0.9, 1e-9);
  const held = easing('linear(0, 0.4 20% 60%, 1)');     // two positions: a flat stretch
  near(held(0.4), 0.4, 1e-9); near(held(0.8), 0.7, 1e-9);
});

test('steps() jumps where CSS jumps', () => {
  const end = easing('steps(4)');
  near(end(0), 0, 0); near(end(0.24), 0, 0); near(end(0.25), 0.25, 1e-9); near(end(0.3), 0.25, 1e-9); near(end(0.99), 0.75, 1e-9); near(end(1), 1, 0);
  const start = easing('steps(4, start)');
  near(start(0.1), 0.25, 1e-9); near(start(0.3), 0.5, 1e-9);
  near(easing('steps(2, jump-none)')(0.6), 1, 1e-9);
  near(easing('steps(3, jump-both)')(0.1), 0.25, 1e-9);
});

test('anything else is null, never a silent default', () => {
  for (const bad of ['', 'garbage', 'cubic-bezier(1.2, 0, 0, 1)', 'cubic-bezier(0,0,1)', 'cubic-bezier(a,b,c,d)',
    'steps(0)', 'steps(2.5)', 'steps(4.0)', 'steps(1, jump-none)', 'steps(3, sideways)', 'linear(0)', 'linear(0, x, 1)', 'spring(1)', 'var(--x)', null, 42]) {
    assert.equal(easing(bad), null, `easing(${JSON.stringify(bad)})`);
  }
});

test('durations: 150ms, 0.15s and a bare 150 (milliseconds) are the same', () => {
  for (const s of ['150ms', '0.15s', '150', ' 150MS ', '.15s']) near(duration(s), 0.15, 1e-12);
  near(duration('0'), 0, 0);
  for (const bad of ['', 'fast', '150 ms', '-20ms', '1e', 'ms', null]) assert.equal(duration(bad), null, `duration(${JSON.stringify(bad)})`);
});

test('roles resolve from tokens by name; the rest fall back to the kit defaults and are listed', () => {
  const vars = { '--motion-standard': '320ms', '--motion-ease-decelerate': 'cubic-bezier(0.2,0,0,1)', '--motion-quick': 'soon' };
  const m = resolveMotion({ enter: 'standard', exit: 'quick', ease: { enter: 'decelerate', move: 'absent' } }, p => vars[p] ?? '');
  assert.deepEqual(m.resolved.enter, { name: 'standard', prop: '--motion-standard', raw: '320ms', value: 0.32, source: 'token' });
  // an unreadable token keeps the string it held, so the report can show it
  assert.equal(m.resolved.exit.raw, 'soon');
  assert.equal(m.resolved.cut.raw, null);
  near(m.resolved.enter.fn, 0.32, 1e-12);
  assert.equal(m.resolved['ease.enter'].source, 'token');
  assert.equal(m.resolved['ease.enter'].value, 'cubic-bezier(0.2,0,0,1)');
  near(m.resolved['ease.enter'].fn(0.5), easing('cubic-bezier(0.2,0,0,1)')(0.5), 1e-12);
  // a token that exists but cannot be read is unresolved, not trusted
  assert.equal(m.resolved.exit.source, 'default'); near(m.resolved.exit.fn, DEFAULTS.exit, 0);
  assert.deepEqual(m.unresolved, ['exit', 'cut', 'ease.exit', 'ease.move']);
  // the function never reaches JSON handed to the tools
  assert.ok(!JSON.stringify(m).includes('"fn"'));
  const none = resolveMotion(undefined);
  assert.deepEqual(none.unresolved, ['enter', 'exit', 'cut', 'ease.enter', 'ease.exit', 'ease.move']);
  near(none.resolved.cut.fn, 0.34, 0);
  assert.equal(none.resolved['ease.enter'].fn, expo);
});

test('curves are pinned at 0 and 1; spring overshoots, the tweens never do', () => {
  for (const f of [expo, inout, easeIn, spring, soft]) { near(f(0), 0, 0); near(f(1), 1, 0); near(f(-1), 0, 0); near(f(2), 1, 0); }
  const peak = Math.max(...Array.from({ length: 200 }, (_, k) => spring(k / 200)));
  assert.ok(peak > 1.1 && peak < 1.2, `spring peak ${peak}`);
  for (const f of [expo, inout, easeIn]) for (let k = 0; k <= 100; k++) assert.ok(f(k / 100) <= 1 && f(k / 100) >= 0);
  near(clamp(3), 1, 0); near(ramp(1, 2, 0), 0, 0); near(ramp(2, 2, 0), 1, 0); near(ramp(2.5, 2, 1), 0.5, 1e-12);
});

test('random(seed) repeats exactly; beats sit on a millisecond grid', () => {
  const a = random(7), b = random(7), c = random(8);
  const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b), sc = Array.from({ length: 5 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  near(random(1)(), 0.6270739405881613, 0);   // the published first value of this generator for seed 1
  assert.equal(beats(80)(6), 4.5);
  assert.equal(beats(120)(1), 0.5);
  assert.equal(beats(70)(1), 0.857);
});
