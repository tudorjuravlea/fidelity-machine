// node --test runtime/motion/ — the pure half of the devices module: the zoom pose and its bound, the camera stops,
// the camera between them, and the entrances' timing and landing. The DOM half (armZoom, restBox, the slab) is
// exercised in a real browser by `motion.mjs check` on fixtures/motion's golden-devices and its negative.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { zoomPose, fitOf, stopsOf, cameraAt, deviceFx, LEAD_IN, TAIL, PULLBACK_Z, TURN_DEG, LID_DEG, FIT_SHARE } from './devices.js';
import { timing, rigOf, FACTORS } from './entrances.js';
import { resolveMotion, inout } from './time.js';

const near = (got, want, tol = 1e-6) => assert.ok(Math.abs(got - want) <= tol, `${got} is not ${want}`);
// a device resting 316 px tall and 151 px wide, centred in a 442 px band under a title, in a 1280 px wide frame
const rest = { x: 564.5, y: 269, w: 151, h: 316 };
const screen = { x: 570, y: 280, w: 140, h: 294 };
const room = { x0: 43, y0: 206, x1: 1237, y1: 648 };

test('at scale 1 the pose is the identity: nothing moves at rest', () => {
  assert.deepEqual(zoomPose(rest, screen, { u: 0.76, v: 0.79 }, room, 1), { s: 1, dx: 0, dy: 0 });
  assert.deepEqual(zoomPose(rest, screen, { u: 0.2, v: 0.1 }, room, 0.5), { s: 1, dx: 0, dy: 0 });   // never below rest
});

test('the scale keeps the action point exactly where it rested', () => {
  const point = { u: 0.3, v: 0.8 }, { s, dx, dy } = zoomPose(rest, screen, point, room, 1.25);
  near(s, 1.25);
  const cx = rest.x + rest.w / 2, cy = rest.y + rest.h / 2;
  const px = screen.x + point.u * screen.w, py = screen.y + point.v * screen.h;
  near(cx + (px - cx) * s + dx, px, 0.01);
  near(cy + (py - cy) * s + dy, py, 0.01);
});

test('the fit scale is the ceiling: a request past it is cut to it, floored to the thousandth', () => {
  const fit = fitOf(rest, room);
  near(fit, FIT_SHARE * Math.min((room.x1 - room.x0) / rest.w, (room.y1 - room.y0) / rest.h));
  const { s } = zoomPose(rest, screen, { u: 0.5, v: 0.5 }, room, 2);
  assert.ok(s <= fit && s > fit - 0.001, `${s} is not the fit ${fit} floored`);
  assert.equal(s, Math.floor(fit * 1000) / 1000);
});

test('the scaled box stays inside the room: the translation is clamped at the band and the margins', () => {
  for (const point of [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 0.05, v: 0.95 }]) {
    const { s, dx, dy } = zoomPose(rest, screen, point, room, 2);
    const cx = rest.x + rest.w / 2, cy = rest.y + rest.h / 2, hw = (rest.w * s) / 2, hh = (rest.h * s) / 2;
    assert.ok(cx + dx - hw >= room.x0 - 0.01 && cx + dx + hw <= room.x1 + 0.01, `x ${cx + dx - hw}..${cx + dx + hw}`);
    assert.ok(cy + dy - hh >= room.y0 - 0.01 && cy + dy + hh <= room.y1 + 0.01, `y ${cy + dy - hh}..${cy + dy + hh}`);
  }
});

test('a device that fills its band has a fit of FIT_SHARE and cannot zoom', () => {
  const full = { x: 100, y: room.y0, w: 211, h: room.y1 - room.y0 };
  assert.equal(zoomPose(full, full, { u: 0.5, v: 0.5 }, room, 1.4).s, 1);
});

test('with the bound removed the request is taken whole (what the negative fixture plants)', () => {
  const open = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };
  assert.equal(zoomPose(rest, screen, { u: 0.5, v: 0.5 }, open, 2).s, 2);
});

test('stops: rest first and last, each segment a dwell inside the lead-in and the tail', () => {
  const stops = stopsOf([{ t0: 1, t1: 3, u: 0.76, v: 0.79, z: 2 }], 10);
  assert.deepEqual(stops[0], { t: 0, u: 0.5, v: 0.5, z: 1 });
  assert.deepEqual(stops.at(-1), { t: 1, u: 0.5, v: 0.5, z: 1 });
  near(stops[1].t, 0.1); near(stops[2].t, 0.3);
  assert.equal(stops[1].z, 2);
  // a segment at the very start or end is held off the edges
  const edge = stopsOf([{ t0: 0, t1: 0.2, u: 0.5, v: 0.5, z: 1.5 }, { t0: 9.9, t1: 10, u: 0.5, v: 0.5, z: 1.5 }], 10);
  near(edge[1].t, LEAD_IN); near(edge.at(-3).t, 1 - TAIL); near(edge.at(-2).t, 1 - TAIL + 1e-4);   // the pair at the tail collides: the second is nudged by EPS
  for (let i = 1; i < edge.length; i++) assert.ok(edge[i].t > edge[i - 1].t, 'stops are strictly increasing');
});

test('a pull-back beat only between segments more than PULLBACK_GAP of the clip apart', () => {
  const far = stopsOf([{ t0: 1, t1: 2, u: 0.2, v: 0.2, z: 1.5 }, { t0: 6, t1: 7, u: 0.8, v: 0.8, z: 1.5 }], 10);
  const back = far.find(s => s.z === PULLBACK_Z);
  assert.ok(back, 'a pull-back stop exists');
  near(back.t, 0.4); assert.equal(back.u, 0.5);
  const close = stopsOf([{ t0: 1, t1: 2, u: 0.2, v: 0.2, z: 1.5 }, { t0: 2.5, t1: 3.5, u: 0.8, v: 0.8, z: 1.5 }], 10);
  assert.equal(close.some(s => s.z === PULLBACK_Z), false);
});

test('the camera sits on a stop exactly, eases inout between two, and rests after the last', () => {
  const stops = stopsOf([{ t0: 2, t1: 4, u: 0.8, v: 0.2, z: 1.8 }], 10);
  assert.deepEqual(cameraAt(stops, 0.2), { u: 0.8, v: 0.2, z: 1.8 });
  const mid = cameraAt(stops, 0.1);   // half-way from rest (t 0) to the dwell (t 0.2)
  near(mid.z, 1 + 0.8 * inout(0.5)); near(mid.u, 0.5 + 0.3 * inout(0.5));
  assert.deepEqual(cameraAt(stops, 1), { u: 0.5, v: 0.5, z: 1 });
  assert.deepEqual(cameraAt(stops, 2), stops.at(-1));
  // another curve may be given (the lock's move curve)
  near(cameraAt(stops, 0.1, k => k).z, 1.4);
});

test('the device entrances are timed by their factor times the enter role, never a literal', () => {
  const rig = rigOf(resolveMotion({ enter: 'standard' }, p => (p === '--motion-standard' ? '300ms' : '')));
  near(timing({ type: 'turn' }, rig, deviceFx).len, 0.3 * 1.3);
  near(timing({ type: 'slide' }, rig, deviceFx).len, 0.3);
  near(timing({ type: 'lid' }, rig, deviceFx).len, 0.3 * 1.4);
  for (const name of Object.keys(deviceFx)) assert.equal(Object.hasOwn(FACTORS, name), false, `${name} is not a built-in`);
});

test('turn starts TURN_DEG further round, signed with the tilt, and lands exactly on the rest tilt', () => {
  const rig = rigOf(resolveMotion({}));
  const run = ry => {
    const e = { el: { style: {} }, body: { style: {} }, ry, persp: '1800px', len: 0.65, opts: {} };
    const first = deviceFx.turn.apply(e, 0, rig), start = e.body.style.transform;
    deviceFx.turn.apply(e, 0.65, rig);
    return { first, start, end: e.body.style.transform };
  };
  assert.equal(run(10).start, `perspective(1800px) rotateY(${10 + TURN_DEG}deg)`);
  assert.equal(run(10).end, 'perspective(1800px) rotateY(10deg)');
  assert.equal(run(-10).start, `perspective(1800px) rotateY(${-10 - TURN_DEG}deg)`);
  assert.equal(run(-10).end, 'perspective(1800px) rotateY(-10deg)');
  assert.equal(run(0).start, `perspective(1800px) rotateY(${TURN_DEG}deg)`);   // a flat device turns in from the right
  assert.equal(run(0).end, 'perspective(1800px) rotateY(0deg)');
  assert.equal(run(10).first.opacity, 0);
});

test('slide comes from the device’s own side and ends at the origin; lid opens from LID_DEG to flat', () => {
  const rig = rigOf(resolveMotion({}));
  const slide = (ry, side) => {
    const e = { el: { style: {}, offsetWidth: 200 }, ry, len: 0.5, opts: side ? { side } : {} };
    return [deviceFx.slide.apply(e, 0, rig).translate, deviceFx.slide.apply(e, 0.5, rig).translate];
  };
  assert.deepEqual(slide(10), ['-240px 0px', '0px 0px']);     // turned right: alone on the left, from the left
  assert.deepEqual(slide(-10), ['240px 0px', '0px 0px']);
  assert.deepEqual(slide(0, 'right'), ['240px 0px', '0px 0px']);
  const e = { el: { style: {} }, lid: { style: {} }, len: 0.7, opts: {} };
  deviceFx.lid.apply(e, 0, rig);
  assert.equal(e.lid.style.transform, `rotateX(${LID_DEG}deg)`);
  deviceFx.lid.apply(e, 0.7, rig);
  assert.equal(e.lid.style.transform, 'rotateX(0deg)');
  assert.equal(e.lid.style.opacity, '1');
});
