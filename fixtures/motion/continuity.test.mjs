// continuity-core: the frame-to-frame analysis behind `motion.mjs check`'s continuity gate
// (CONTRACT.md §Invocation contract). Synthetic box recordings, so each rule is proved alone.
//   node --test "fixtures/motion/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseContinuity } from '../../scripts/continuity-core.mjs';

const FPS = 30;
// items: [id, name, parentId, x, y, w, h, alpha]
const item = (id, x, y, w = 100, h = 40, alpha = 1, pid = -1, name = `el${id}`) => [id, name, pid, x, y, w, h, alpha];
const frames = (n, at, scene = 'one') => Array.from({ length: n }, (_, f) => ({ t: f / FPS, scene: typeof scene === 'function' ? scene(f) : scene, items: at(f) }));

test('a glide is not a jump: an element moving 6px a frame on a curve passes', () => {
  const r = analyseContinuity(frames(40, (f) => [item(1, 100 + f * 6, 100)]), { fps: FPS, stride: 1 });
  assert.deepEqual(r.jumps, []);
});

test('a one-frame snap is a jump: 40px in one frame while still before and after, named with the frame time', () => {
  const r = analyseContinuity(frames(40, (f) => [item(1, f >= 20 ? 140 : 100, 100)]), { fps: FPS, stride: 1 });
  assert.equal(r.jumps.length, 1);
  assert.match(r.jumps[0].message, /el1/);
  assert.match(r.jumps[0].message, /\+40/);
  assert.match(r.jumps[0].message, /0\.67 s/);
  assert.equal(r.jumps[0].axis, 'x');
});

test('a snap inside a glide is still a jump: 2px a frame, then 30px in one frame', () => {
  const r = analyseContinuity(frames(40, (f) => [item(1, 100 + f * 2 + (f >= 20 ? 30 : 0), 100)]), { fps: FPS, stride: 1 });
  assert.equal(r.jumps.length, 1);
});

test('a child dragged by its parent is folded into the parent: one jump line, not two', () => {
  const r = analyseContinuity(frames(40, (f) => { const dx = f >= 20 ? 40 : 0; return [item(1, 100 + dx, 100, 300, 200), item(2, 120 + dx, 120, 50, 20, 1, 1)]; }), { fps: FPS, stride: 1 });
  assert.equal(r.jumps.length, 1);
  assert.match(r.jumps[0].message, /el1/);
});

test('a step across a scene change is a cut, not a jump', () => {
  const r = analyseContinuity(frames(40, (f) => [item(1, f >= 20 ? 140 : 100, 100)], (f) => (f >= 20 ? 'two' : 'one')), { fps: FPS, stride: 1 });
  assert.deepEqual(r.jumps, []);
});

test('an element that fades in over several frames has an entrance', () => {
  const r = analyseContinuity(frames(40, (f) => (f < 10 ? [] : [item(1, 100, 100, 100, 40, Math.min(1, (f - 9) / 8))])), { fps: FPS, stride: 1 });
  assert.deepEqual(r.noEntrance, []);
});

test('an element that appears at full opacity and full size in one frame has no entrance (a warning)', () => {
  const r = analyseContinuity(frames(40, (f) => (f < 10 ? [] : [item(1, 100, 100)])), { fps: FPS, stride: 1 });
  assert.equal(r.noEntrance.length, 1);
  assert.match(r.noEntrance[0].message, /el1/);
  assert.match(r.noEntrance[0].message, /0\.33 s/);
});

test('an element that grows in from nothing has an entrance even at full opacity', () => {
  const r = analyseContinuity(frames(40, (f) => (f < 10 ? [] : [item(1, 100, 100, Math.min(100, (f - 9) * 15), 40)])), { fps: FPS, stride: 1 });
  assert.deepEqual(r.noEntrance, []);
});

test('an element that vanishes from full opacity in one frame has no exit; one that fades out does', () => {
  const pop = analyseContinuity(frames(40, (f) => (f < 20 ? [item(1, 100, 100)] : [])), { fps: FPS, stride: 1 });
  assert.equal(pop.noExit.length, 1);
  const fade = analyseContinuity(frames(40, (f) => (f < 20 ? [item(1, 100, 100, 100, 40, Math.max(0.05, 1 - Math.max(0, f - 12) / 8))] : [])), { fps: FPS, stride: 1 });
  assert.deepEqual(fade.noExit, []);
});

test('appearing or vanishing on the frame the scene changes is the cut, not a pop', () => {
  const r = analyseContinuity(frames(40, (f) => (f < 20 ? [item(1, 100, 100)] : [item(2, 100, 100)]), (f) => (f >= 20 ? 'two' : 'one')), { fps: FPS, stride: 1 });
  assert.deepEqual(r.noEntrance, []);
  assert.deepEqual(r.noExit, []);
});

test('the first frame is the opening, never a pop', () => {
  const r = analyseContinuity(frames(10, () => [item(1, 100, 100)]), { fps: FPS, stride: 1 });
  assert.deepEqual(r.noEntrance, []);
});

test('coverage: fewer than four samples is inconclusive, and the stride is reported', () => {
  const r = analyseContinuity(frames(3, () => [item(1, 100, 100)]), { fps: FPS, stride: 1 });
  assert.equal(r.coverage.status, 'inconclusive');
  const ok = analyseContinuity(frames(40, () => [item(1, 100, 100)]), { fps: FPS, stride: 3 });
  assert.equal(ok.coverage.status, 'complete');
  assert.equal(ok.coverage.stride, 3);
  assert.equal(ok.coverage.samples, 40);
});

test('with a stride, the frame time still names the sampled instant', () => {
  const r = analyseContinuity(Array.from({ length: 30 }, (_, k) => ({ t: (k * 3) / FPS, scene: 'one', items: [item(1, k >= 15 ? 140 : 100, 100)] })), { fps: FPS, stride: 3 });
  assert.equal(r.jumps.length, 1);
  assert.match(r.jumps[0].message, /1\.50 s/);
});

test('an element that was off the frame a sample earlier arrived by travel, not by a pop; and it never counts for jumps', () => {
  const off = (id, x) => [id, `el${id}`, -1, x, 100, 100, 40, 1, 1];
  const r = analyseContinuity(frames(40, (f) => (f < 10 ? [off(1, -400)] : [item(1, Math.max(100, 400 - (f - 10) * 60), 100)])), { fps: FPS, stride: 1 });
  assert.deepEqual(r.noEntrance, []);
  assert.deepEqual(r.jumps, []);
});

test('a step inside a cut window (cutHalf either side of a scene start) is the cut, not a jump or a pop', () => {
  const cuts = [{ start: 20 / FPS, half: 4 / FPS }];
  const r = analyseContinuity(frames(40, (f) => (f === 18 ? [] : [item(1, f >= 17 ? 140 : 100, 100)])), { fps: FPS, stride: 1, cuts });
  assert.deepEqual(r.jumps, []);
  assert.deepEqual(r.noEntrance, []);
  assert.deepEqual(r.noExit, []);
});

test('an element that arrives moving (a throw) or shrinking onto its line (a punch) has an entrance', () => {
  const thrown = analyseContinuity(frames(40, (f) => (f < 10 ? [] : [item(1, Math.max(100, 400 - (f - 10) * 60), 100)])), { fps: FPS, stride: 1 });
  assert.deepEqual(thrown.noEntrance, []);
  const punched = analyseContinuity(frames(40, (f) => (f < 10 ? [] : [item(1, 100, 100, Math.max(100, 170 - (f - 10) * 10), 40)])), { fps: FPS, stride: 1 });
  assert.deepEqual(punched.noEntrance, []);
});

test('an element that appears under a painted plate covering its whole box is revealed, not popped', () => {
  // items: [id, name, pid, x, y, w, h, alpha, off, paints]
  const plate = (f) => [9, 'i.blk', 5, 90, 102, f >= 10 && f < 20 ? 130 : 0.5, 36, 1, 0, 1];   // a hairline short of the line box above and below, as a block plate is
  const text = (f) => (f < 10 ? [] : [[1, 'span.blkt', 5, 100, 100, 100, 40, 1, 0, 1]]);
  const r = analyseContinuity(frames(40, (f) => [plate(f), ...text(f)]), { fps: FPS, stride: 1 });
  assert.deepEqual(r.noEntrance, []);
  // caught part-way: the plate already slid 20px off the text but still covers most of it and keeps moving
  const sliding = (f) => [9, 'i.blk', 5, 90 + Math.max(0, f - 9) * 20, 102, Math.max(0.5, 130 - Math.max(0, f - 9) * 20), 36, 1, 0, 1];
  const mid = analyseContinuity(frames(40, (f) => [sliding(f), ...text(f)]), { fps: FPS, stride: 1 });
  assert.deepEqual(mid.noEntrance, []);
  // a plate that sits still beside the text is not a reveal: the text popped
  const still = (f) => [9, 'i.blk', 5, 90, 102, 60, 36, 1, 0, 1];
  const popped = analyseContinuity(frames(40, (f) => [still(f), ...text(f)]), { fps: FPS, stride: 1 });
  assert.equal(popped.noEntrance.length, 1);
});
