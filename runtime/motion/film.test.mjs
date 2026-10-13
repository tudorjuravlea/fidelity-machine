// node --test "runtime/motion/*.test.mjs" — what a film puts on screen at t, computed without a page.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { framing, CUT_FACTOR } from './film.js';
import { inout } from './time.js';

// three 3-second scenes: "b" arrives by a fade, "c" by a push upwards; 0.4 s half-windows
const lay = cuts => {
  let at = 0;
  return cuts.map((cut, i) => { const s = { start: at, end: at + 3, dur: 3, half: i ? 0.4 : 0, cut }; at += 3; return s; });
};
const opts = { W: 1000, H: 800, curve: k => k };   // a linear curve keeps the expected numbers readable
const near = (got, want) => assert.ok(Math.abs(got - want) < 1e-6, `expected ${want}, got ${got}`);

test('outside every cut window exactly one scene is on screen, untouched', () => {
  const view = framing(lay([{ type: 'cut' }, { type: 'fade' }, { type: 'push', dir: 'up' }]), 1.5, opts);
  assert.equal(view.main, 0);
  assert.deepEqual(view.shots, [{ index: 0, lt: 1.5, opacity: null, shift: null }]);
  assert.equal(view.plate, null);
});

test('a fade shows both scenes across its window, their opacities summing to one', () => {
  const scenes = lay([{ type: 'cut' }, { type: 'fade' }, { type: 'cut' }]);
  for (const t of [2.6, 2.8, 3, 3.2, 3.39]) {
    const view = framing(scenes, t, opts);
    assert.deepEqual(view.shots.map(s => s.index), [0, 1], `t=${t}`);
    near(view.shots[0].opacity + view.shots[1].opacity, 1);
    near(view.shots[1].opacity, (t - 2.6) / 0.8);
  }
  assert.equal(framing(scenes, 2.59, opts).shots.length, 1);
  assert.equal(framing(scenes, 3.4, opts).shots.length, 1);
});

test('a push moves the outgoing scene away and brings the incoming one in from the opposite side', () => {
  const scenes = lay([{ type: 'cut' }, { type: 'cut' }, { type: 'push', dir: 'up' }]);
  const mid = framing(scenes, 6, opts);   // the boundary: half way
  assert.equal(mid.main, 2);
  assert.deepEqual(mid.shots.map(s => s.index), [1, 2]);
  const shifts = (view, want) => view.shots.forEach((s, i) => { near(s.shift[0], want[i][0]); near(s.shift[1], want[i][1]); });
  shifts(mid, [[0, -400], [0, 400]]);
  shifts(framing(lay([{ type: 'cut' }, { type: 'push', dir: 'left' }, { type: 'cut' }]), 2.8, opts), [[-250, 0], [750, 0]]);
});

test('a wipe plate crosses the frame centred on the boundary and is gone outside its window', () => {
  const scenes = lay([{ type: 'cut' }, { type: 'wipe' }, { type: 'cut' }]);
  near(framing(scenes, 3, opts).plate.x, 0);
  near(framing(scenes, 2.601, opts).plate.x, (0.001 / 0.8 * 2 - 1) * 1.8 * 1000);
  near(framing(scenes, 3.2, opts).plate.x, 0.9 * 1000);
  assert.equal(framing(scenes, 2.59, opts).plate, null);
  assert.equal(framing(scenes, 3.41, opts).plate, null);
  assert.deepEqual(framing(scenes, 3.1, opts).shots.map(s => s.index), [1]);   // a wipe never blends two scenes
});

test('the curve given (ease.move) shapes every cut', () => {
  const scenes = lay([{ type: 'cut' }, { type: 'fade' }, { type: 'cut' }]);
  const shaped = framing(scenes, 2.8, { ...opts, curve: inout });
  near(shaped.shots[1].opacity, inout(0.25));
  assert.deepEqual(Object.keys(CUT_FACTOR), ['cut', 'fade', 'wipe', 'push']);
});

test('t past the end belongs to the last scene', () => {
  const view = framing(lay([{ type: 'cut' }, { type: 'cut' }]), 99, opts);
  assert.equal(view.main, 1);
});
