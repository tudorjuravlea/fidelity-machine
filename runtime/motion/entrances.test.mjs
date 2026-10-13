// node --test runtime/motion/ — the pure half of the entrance registry: durations, literals, stagger, press ends.
// The DOM half (collect, run, audit) is exercised in a real browser by `motion.mjs check` and its fixtures.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FACTORS, FADE_SHARE, TYPES, timing, gapOf, groupStarts, stepEnds, rigOf, spatialCurve, unionBox, inkBox, groupLiteral, textReach, layerHosts } from './entrances.js';
import { resolveMotion, expo, spring, soft, easing } from './time.js';

const near = (got, want, tol = 1e-9) => assert.ok(Math.abs(got - want) <= tol, `${got} is not ${want}`);
const defaults = rigOf(resolveMotion({}));
const tokens = { '--motion-standard': '320ms', '--motion-short': '200ms', '--motion-ease-decelerate': 'cubic-bezier(0.2,0,0,1)' };
const locked = rigOf(resolveMotion({ enter: 'standard', exit: 'short', ease: { enter: 'decelerate' } }, p => tokens[p] ?? ''));

test('the vocabulary is the twelve types of the grammar', () => {
  assert.deepEqual([...TYPES].sort(), ['block', 'count', 'draw', 'drawy', 'drop', 'fade', 'pop', 'punch', 'rise', 'slam', 'throw', 'words']);
  for (const type of Object.keys(FADE_SHARE)) assert.ok(FADE_SHARE[type] >= 0 && FADE_SHARE[type] <= 1, type);
});

test('every type lasts the enter role times its factor, so one token re-times them all', () => {
  for (const type of TYPES) {
    if (type === 'words' || type === 'punch') continue;
    near(timing({ type }, defaults).len, 0.5 * FACTORS[type]);
    near(timing({ type }, locked).len, 0.32 * FACTORS[type]);
  }
  near(timing({ type: 'pop' }, defaults).len, 0.45);
  near(timing({ type: 'slam' }, defaults).len, 0.5);
  near(timing({ type: 'throw' }, defaults).len, 0.7);
});

test('word types: factor per word plus the gap between words (the gap is choreography)', () => {
  const w = timing({ type: 'words', words: 6 }, defaults);
  near(w.per, 0.55); near(w.gap, 0.07); near(w.len, 0.55 + 0.07 * 5);
  const long = timing({ type: 'words', words: 30 }, defaults);
  near(long.gap, 0.9 / 30);                               // long lines spread over at most ~0.9 s
  const p = timing({ type: 'punch', words: 3, gap: 0.2 }, locked);
  near(p.per, 0.32); near(p.gap, 0.2); near(p.len, 0.32 + 0.4);
  near(gapOf('punch', 5), 0.16);
  assert.equal(p.literal, false);
});

test('data-dur overrides the role and is recorded as a literal — except on count', () => {
  const rise = timing({ type: 'rise', dur: 0.8 }, locked);
  near(rise.len, 0.8);
  assert.equal(rise.literal, true);
  const count = timing({ type: 'count', dur: 1.9 }, locked);
  near(count.len, 1.9);
  assert.equal(count.literal, false);
  assert.equal(timing({ type: 'rise' }, locked).literal, false);
  assert.equal(timing({ type: 'words', words: 4, dur: 0.4 }, locked).literal, true);
});

test('a piece’s own type is timed by its factor (1 when it gives none)', () => {
  const custom = { sweep: { factor: 2, apply: () => ({}) }, nudge: { apply: () => ({}) } };
  near(timing({ type: 'sweep' }, locked, custom).len, 0.64);
  near(timing({ type: 'nudge' }, locked, custom).len, 0.32);
});

test('a group staggers its children from the group’s own start', () => {
  assert.deepEqual(groupStarts(0.5, 0.2, 3).map(x => +x.toFixed(9)), [0.5, 0.7, 0.9]);
  assert.deepEqual(groupStarts(1, 0.08, 0), []);
});

test('each press lasts until its entrances settle and anything leaving at it is gone', () => {
  const ends = stepEnds([
    { step: 0, delay: 0.1, len: 0.6, until: null },
    { step: 0, delay: 0.5, len: 0.9, until: 2 },   // leaves at press 3
    { step: 1, delay: 0, len: 0.4, until: null },
    { step: 3, delay: 0.2, len: 0.3, until: null },
  ], 0.3);
  ends.forEach((x, k) => near(x, [1.4, 0.4, 0.3, 0.5][k]));
  assert.equal(ends.length, 4);
  // a press nothing enters at, with nothing leaving, needs no time: the deck refuses it by name
  near(stepEnds([{ step: 2, delay: 0, len: 0.5, until: null }], 0.3)[1], 0);
});

test('spatial moves spring only while the entrance curve is the kit default; the lock’s curve wins', () => {
  assert.equal(spatialCurve('pop', defaults), spring);
  assert.equal(spatialCurve('throw', defaults), soft);
  assert.equal(spatialCurve('rise', defaults), expo);
  const lockCurve = easing('cubic-bezier(0.2,0,0,1)');
  for (const type of ['pop', 'throw', 'drop', 'punch', 'rise', 'slam']) near(spatialCurve(type, locked)(0.3), lockCurve(0.3));
  assert.equal(defaults.lockCurve, false);
  assert.equal(locked.lockCurve, true);
  near(locked.exit, 0.2);
});

test('the audited box is the union of an element and its sized descendants; empty rects do not stretch it', () => {
  const heading = { left: 64, top: 300, right: 1016, bottom: 900 };
  const lineRunningOff = { left: 64, top: 300, right: 1790, bottom: 600 };
  const emptySpan = { left: -500, top: 0, right: -500, bottom: 40 };
  assert.deepEqual(unionBox([heading, lineRunningOff, emptySpan]), { left: 64, top: 300, right: 1790, bottom: 900 });
  assert.deepEqual(unionBox([heading]), heading);
  assert.equal(unionBox([emptySpan, { left: 0, top: 0, right: 10, bottom: 0 }]), null);
});

test('text that runs out of its own box, with no child element, still widens the audited box', () => {
  // a 300 px wide nowrap heading whose text runs on to x = 1820 in a 900 px frame
  const own = { left: 100, top: 400, right: 400, bottom: 470 }, text = { left: 100, top: 400, right: 1820, bottom: 470 };
  assert.deepEqual(inkBox(own, [], text), { left: 100, top: 400, right: 1820, bottom: 470 });
  assert.deepEqual(inkBox(own, [], null), own);
});

test('a group duration is one literal on the group; a count group and a group without one record none', () => {
  assert.deepEqual(groupLiteral({ each: 'pop', dur: 1.5, text: 'three cards', scene: 'a' }), { scene: 'a', fx: 'pop', attr: 'data-dur', value: 1.5, text: 'three cards' });
  assert.equal(groupLiteral({ each: 'count', dur: 2, text: 'n' }), null);
  assert.equal(groupLiteral({ each: 'rise', text: 'no dur' }), null);
});

test('each line of text counts as one line-height band around its centre', () => {
  // a number set with line-height 0.82 (236 px): its glyph rect pokes 46 px out of the box above and below — the band
  // around its centre is exactly the box, so nothing is added
  const box = { left: 32, top: 300, right: 1048, bottom: 536 };
  assert.deepEqual(inkBox(box, [], textReach([{ left: 32, top: 254, right: 290, bottom: 582 }], 236)), box);
  // one line spilling 29 px below a 40 px-tall box (glyphs 666–724, line-height 40): its band is 675–715, which
  // passes the box — and the 700 px frame — and is counted
  const band = textReach([{ left: 64, top: 666, right: 600, bottom: 724 }], 40);
  assert.deepEqual(band, { left: 64, top: 675, right: 600, bottom: 715 });
  assert.equal(inkBox({ left: 64, top: 655, right: 600, bottom: 695 }, [], band).bottom, 715);
  // several lines join; no text, no band
  assert.deepEqual(textReach([{ left: 0, top: 0, right: 300, bottom: 30 }, { left: 0, top: 40, right: 420, bottom: 70 }], 40), { left: 0, top: -5, right: 420, bottom: 75 });
  assert.equal(textReach([], 40), null);
});

test('a layer goes on the container of loose movers and on unmoved keeps — never on a mover', () => {
  // body > bar > [mark (rise), tag (drop)] ; body > badge (data-keep, no entrance) ; body > logo (fade, directly in body)
  const parent = { bar: 'body', mark: 'bar', tag: 'bar', badge: 'body', logo: 'body', inner: 'tag' };
  const movers = new Set(['mark', 'tag', 'logo', 'inner']);   // inner moves inside tag, which also moves
  const hosts = layerHosts(movers, ['badge', 'tag'], id => parent[id], id => id === 'body' || id === undefined);
  assert.deepEqual([...hosts].sort(), ['badge', 'bar']);
});
