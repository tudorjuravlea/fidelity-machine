// node --test "runtime/motion/*.test.mjs" — the clock's guarantees, checked in Node with no page.
import { test } from 'node:test';
import { strict } from 'node:assert';
const { equal, ok, deepEqual } = strict;
import { createClock, run, auto, rest, FAST } from './clock.js';

// Poses: the curtain and one beat in scene "a", one pose in "b", one in "c".
const poses = [{ t: 0, scene: 'a' }, { t: 2, scene: 'a' }, { t: 5, scene: 'b' }, { t: 6, scene: 'c' }];
const close = (got, want) => ok(Math.abs(got - want) < 1e-9, `expected ${want}, got ${got}`);

test('a beat runs at one deck second per wall second, then holds its pose indefinitely', () => {
  const clock = createClock(poses);
  clock.press('next', 10);
  const mid = clock.read(11);
  close(mid.t, 1);
  equal(mid.moving, true);
  equal(mid.dir, 1);
  close(clock.read(12).t, 2);
  const after = clock.read(12.5);
  equal(after.moving, false);
  equal(after.target, 1);
  close(clock.read(30).t, 2);
});

test('rapid repeated presses stop at the first pose ahead', () => {
  const clock = createClock(poses);
  [1, 1.02, 1.04, 1.06, 1.08].forEach(w => clock.press('next', w));
  const settled = clock.read(5);
  close(settled.t, 2);
  equal(settled.target, 1);
});

test('pressing on during a beat lands it within FAST — or sooner when less of it remains', () => {
  const clock = createClock(poses);
  clock.press('next', 0);
  clock.press('next', 0.5);
  equal(clock.read(0.5 + FAST - 0.01).moving, true);
  close(clock.read(0.5 + FAST).t, 2);
  equal(clock.read(0.5 + FAST + 0.001).moving, false);
  const late = createClock(poses);
  late.press('next', 0);
  late.press('next', 1.9);
  close(late.read(2).t, 2);
});

test('a deck that passes its exit role duration sets the hurry and the retreat pace', () => {
  const clock = createClock(poses, 0, { fast: 0.12 });
  clock.press('next', 0);
  clock.press('next', 0.5);
  close(clock.read(0.62).t, 2);
  clock.press('back', 1);
  close(clock.read(1.12).t, 0);
});

test('back retreats to the previous pose; pressed again while retreating, it goes one pose further', () => {
  const clock = createClock(poses);
  clock.press('next', 0);
  clock.press('back', 1);
  equal(clock.read(1).dir, -1);
  close(clock.read(1 + FAST).t, 0);
  clock.press('next', 5);
  clock.press('next', 10);
  close(clock.read(20).t, 5);
  clock.press('back', 20);
  close(clock.read(20 + FAST).t, 2);
  equal(clock.read(20 + FAST).target, 1);
  clock.press('next', 30);
  clock.press('back', 40);
  clock.press('back', 40.1);
  close(clock.read(41).t, 0);
});

test('the first and last poses are walls', () => {
  const atEnd = createClock(poses, 3);
  atEnd.press('next', 1);
  close(atEnd.read(2).t, 6);
  equal(atEnd.read(2).moving, false);
  const atStart = createClock(poses);
  atStart.press('back', 1);
  close(atStart.read(2).t, 0);
  equal(atStart.read(2).moving, false);
  const jumps = createClock(poses);
  jumps.press('goto', 1, 99);
  equal(jumps.read(1).target, 3);
  jumps.press('goto', 2, -4);
  equal(jumps.read(2).target, 0);
});

test('idle time is counted per scene: it grows at rest, pauses through a beat, and starts over elsewhere', () => {
  const clock = createClock(poses);
  close(clock.read(3).idle('a'), 3);
  clock.press('next', 3);                 // a two-second beat inside scene a, wall 3 → 5
  close(clock.read(4).idle('a'), 3);
  close(clock.read(6).idle('a'), 4);
  clock.press('next', 6);                 // the beat into scene b, wall 6 → 9
  close(clock.read(8).idle('a'), 4);
  close(clock.read(8).idle('b'), 0);
  close(clock.read(10).idle('b'), 1);
  close(clock.read(10).idle('a'), 0);
  equal(clock.read(10).rest.scene, 'b');
  clock.press('goto', 11, 0);             // a jump is a new visit, even back into a scene already seen
  close(clock.read(12).idle('a'), 1);
  clock.press('goto', 14, 1);             // …and even to another pose of the scene it is already in
  close(clock.read(14.5).idle('a'), 0.5);
});

test('the blank key flips the screen and leaves time alone; a log can begin blank', () => {
  const clock = createClock(poses);
  clock.press('blank', 1);
  equal(clock.read(2).blank, true);
  close(clock.read(2).t, 0);
  clock.press('blank', 3);
  equal(clock.read(4).blank, false);
  // a take started while the screen was blank: its log replays with the same screen state
  const replay = run(poses, [{ w: 2, k: 'blank' }], 0, { blank: true });
  equal(replay(1).blank, true);
  equal(replay(3).blank, false);
});

test('a take and the automatic film are both press logs on the same clock', () => {
  const take = run(poses, [{ w: 1, k: 'next' }, { w: 4, k: 'next' }, { w: 4.2, k: 'blank' }]);
  close(take(2).t, 1);
  close(take(5).t, 3);
  equal(take(5).blank, true);
  const film = auto(poses, 0, 1);
  close(film.duration, 3 * 1 + 1 + 6);
  equal(film.events.length, 3);
  const play = run(poses, film.events);
  close(play(film.duration).t, 6);
  // every pose is on screen, still, during its hold
  poses.forEach((pose, i) => {
    const landed = i === 0 ? 0 : film.events[i - 1].w + (pose.t - poses[i - 1].t);
    close(play(landed + 0.5).t, pose.t);
  });
});

test('reading a log in any order gives the same times', () => {
  const film = auto(poses, 0, 1.5);
  const walls = Array.from({ length: 40 }, (_, k) => (k * film.duration) / 39);
  const inOrder = run(poses, film.events), reversed = run(poses, film.events);
  const forward = walls.map(w => inOrder(w).t);
  const backward = walls.slice().reverse().map(w => reversed(w).t).reverse();
  deepEqual(backward, forward);
  deepEqual(walls.map(w => run(poses, film.events)(w).t), forward);
});

test('rest(i, s) describes one pose standing still', () => {
  const held = rest(poses, 2, 4);
  deepEqual({ t: held.t, moving: held.moving, target: held.target, scene: held.rest.scene, s: held.rest.s }, { t: 5, moving: false, target: 2, scene: 'b', s: 4 });
  close(held.idle('b'), 4);
  close(held.idle('a'), 0);
});

test('a press without a usable time is dropped, and a log with a bad press is refused', () => {
  const clock = createClock(poses);
  clock.press('next', Number.NaN);
  clock.press('next', undefined);
  equal(clock.read(1).moving, false);
  close(clock.read(1).t, 0);
  ok(Number.isFinite(clock.read(1).t));
  let refused = null;
  try { run(poses, [{ w: 1, k: 'next' }, { k: 'next' }]); } catch (err) { refused = err.message; }
  ok(refused && refused.includes('press 1'), `expected the log to be refused, got ${refused}`);
  let unknown = null;
  try { run(poses, [{ w: 1, k: 'jump' }]); } catch (err) { unknown = err.message; }
  ok(unknown && unknown.includes('press 0'));
});
