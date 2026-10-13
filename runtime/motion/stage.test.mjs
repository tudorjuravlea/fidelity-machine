// node --test "runtime/motion/*.test.mjs" — the live loop's decisions, without a page.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { liveEffects } from './stage.js';

const reading = (t, { moving = false, target = 0, blank = false, scene = 'a' } = {}) => ({ t, moving, target, blank, rest: { scene } });
const kinds = effects => [...effects].sort();

test('the first turn paints; an unchanged still picture is not painted again', () => {
  assert.deepEqual(kinds(liveEffects(null, reading(0))), ['paint']);
  assert.deepEqual(kinds(liveEffects(reading(2), reading(2))), []);
});

test('blanking repaints without moving time', () => {
  assert.deepEqual(kinds(liveEffects(reading(2), reading(2, { blank: true }))), ['paint']);
});

test('frames inside one beat are measured; the frame a beat lands on is an arrival', () => {
  const going = { moving: true, target: 1 };
  assert.deepEqual(kinds(liveEffects(reading(0.4, going), reading(0.5, going))), ['measure', 'paint']);
  assert.deepEqual(kinds(liveEffects(reading(1.9, going), reading(2, { target: 1 }))), ['arrive', 'paint']);
  // a press that retargets mid-beat starts a new beat: that first frame is not timed against the old one
  assert.deepEqual(kinds(liveEffects(reading(0.4, going), reading(0.5, { moving: true, target: 2 }))), ['paint']);
});

test('a scene that keeps moving while held is repainted every turn, and only that scene', () => {
  const breathes = scene => scene === 'b';
  assert.deepEqual(kinds(liveEffects(reading(5, { scene: 'b' }), reading(5, { scene: 'b' }), breathes)), ['paint']);
  assert.deepEqual(kinds(liveEffects(reading(2), reading(2), breathes)), []);
});
