// Devices on a film or a deck: the entrances that land on a device's rest tilt, and the zoom to the action of a
// prototype playing on its screen (devices.css draws the slab; references/device-mockups.md states the rules).
// Everything here is a pure function of the time it is given: no clock, no timer, no state between calls, so any
// frame can be drawn alone and come out the same. No DOM is touched at import time (Node imports this for the tests).
//
// From a piece's piece.js, with the kit at ../../kit/:
//   import { film } from '../../kit/film.js';
//   import { deviceFx, armZoom } from '../../kit/devices.js';
//   let zoom;
//   await film({ …, fx: deviceFx,
//     setup() { zoom = armZoom(document.querySelector('#proto'), { duration: 8, margin: edge }); },
//     scenes: [{ id: 'proto', dur: 9.5, draw(lt) { zoom.at(lt - 0.5); } }] });
//
// THE ZOOM, ON REQUEST ONLY. Given segments [{ t0, t1, u, v, z }] (seconds into the clip, 0..1 of the screen, the
// scale asked for), the device grows around each segment as the clip reaches it: a scale about the device's centre
// plus the one translation that keeps the action point exactly where it rested, so the pose at scale 1 is the
// identity and nothing moves at rest; then it dwells, pulls back a little between distant segments, and returns to
// scale 1 at the end. A lead-in and a tail keep the clip from opening or closing on a close-up. The device never
// travels with a tap: only the zoom moves. THE BOUND: the scaled device stays whole inside the margins and its own
// band, so the fit scale is the ceiling, a request past it is cut to it, and the translation is clamped the same
// way. The rest is measured from layout offsets, never from a client rect: a rect read on a film's first frame is
// mid-entrance, and every zoom would then be computed from a rest that does not exist.
import { clamp, ramp, inout } from './time.js';

export const LEAD_IN = 0.08, TAIL = 0.12;   // fractions of the clip no segment may enter
export const PULLBACK_GAP = 0.08;            // a gap longer than this fraction of the clip earns a pull-back beat
export const PULLBACK_Z = 1.08;              // how far the pull-back comes out, relative to rest
export const FIT_SHARE = 0.99;               // the fit scale keeps 1 % of the room for a tilted device's near edge
export const TURN_DEG = 24;                  // a turn entrance starts this much further round than the rest tilt
export const LID_DEG = 80;                   // a notebook's lid starts tipped back this far
export const SLIDE_WIDTHS = 1.2;             // a slide entrance starts this many device widths to its own side
const EPS = 1e-4;

// ---- the zoom, pure -----------------------------------------------------------------------------------------------
// The scale ceiling for a rest box inside a room: the device must stay whole, less the share kept for the near edge.
export const fitOf = (rest, room) => FIT_SHARE * Math.min((room.x1 - room.x0) / rest.w, (room.y1 - room.y0) / rest.h);

// The pose that pushes a device toward a point on its screen, inside the room.
//   rest   { x, y, w, h }  the device's resting box (layout offsets, piece px)
//   screen { x, y, w, h }  the screen's resting box
//   point  { u, v }        where on the screen the action is, 0..1 each way
//   room   { x0, y0, x1, y1 }  what the scaled device must stay inside
//   zoom   the scale asked for (1 = rest)
// → { s, dx, dy }: the scale about the device's centre, then the translation, in piece px.
export function zoomPose(rest, screen, point, room, zoom) {
  const s = Math.floor(clamp(zoom, 1, Math.max(1, fitOf(rest, room))) * 1000) / 1000;   // floored, never rounded up past the fit
  const cx = rest.x + rest.w / 2, cy = rest.y + rest.h / 2;
  const px = screen.x + point.u * screen.w, py = screen.y + point.v * screen.h;
  // scaled about the centre, the action would sit at cx + (px - cx) * s: put it back where it rested, so the device
  // grows AROUND the action and the action itself stays put
  let dx = (px - cx) * (1 - s), dy = (py - cy) * (1 - s);
  const hw = (rest.w * s) / 2, hh = (rest.h * s) / 2;
  dx = clamp(dx, room.x0 + hw - cx, room.x1 - hw - cx);
  dy = clamp(dy, room.y0 + hh - cy, room.y1 - hh - cy);
  const r2 = v => Math.round(v * 100) / 100 + 0;   // + 0 turns a -0 into 0, so rest writes "0px", never "-0px"
  return { s, dx: r2(dx), dy: r2(dy) };
}

// The camera stops of a clip, as fractions of its length: rest, each segment's dwell (clamped into the lead-in and
// the tail), a pull-back in every long gap, rest again. Stops that would collide are separated by EPS.
export function stopsOf(segments, duration) {
  const d = duration > 0 ? duration : 1;
  const inner = t => clamp(t, LEAD_IN, 1 - TAIL);
  const sorted = [...segments].sort((a, b) => a.t0 - b.t0);
  const stops = [{ t: 0, u: 0.5, v: 0.5, z: 1 }];
  sorted.forEach((seg, i) => {
    stops.push({ t: inner(seg.t0 / d), u: seg.u, v: seg.v, z: seg.z });
    stops.push({ t: inner(seg.t1 / d), u: seg.u, v: seg.v, z: seg.z });
    const next = sorted[i + 1];
    if (next && next.t0 - seg.t1 > d * PULLBACK_GAP) stops.push({ t: inner((seg.t1 + next.t0) / 2 / d), u: 0.5, v: 0.5, z: PULLBACK_Z });
  });
  stops.push({ t: 1, u: 0.5, v: 0.5, z: 1 });
  stops.sort((a, b) => a.t - b.t);
  for (let i = 1; i < stops.length - 1; i++) if (stops[i].t <= stops[i - 1].t) stops[i].t = stops[i - 1].t + EPS;
  return stops;
}

// The camera at progress p (0..1 of the clip): eased between the two stops around it, inout by default (the kit's
// camera curve: both ends at rest).
export function cameraAt(stops, p, curve = inout) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (p >= a.t && p <= b.t) {
      const k = b.t > a.t ? curve((p - a.t) / (b.t - a.t)) : 1;
      return { u: a.u + (b.u - a.u) * k, v: a.v + (b.v - a.v) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  return stops[stops.length - 1];
}

// ---- the zoom, in the page ----------------------------------------------------------------------------------------
// An element's resting box in piece px from its layout offsets up to `root` (the scene): no transform touches them,
// so a device measured mid-entrance or mid-zoom is still measured at rest, never mid-move.
export function restBox(el, root) {
  let x = 0, y = 0, n = el;
  while (n && n !== root) {
    x += n.offsetLeft; y += n.offsetTop;
    const o = n.offsetParent;
    if (o && o !== root) { x += o.clientLeft; y += o.clientTop; }   // offsets are from the parent's padding edge: add its border
    n = o;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

// Arm the zoom of one device. Call it from setup (every scene is laid out then) and keep the result; from the
// scene's draw hook call `at(seconds)` with the seconds into the clip. The room is the frame margins across and the
// device's band down (its rest height times the zoom ceiling, centred on its rest: what devices.css gave a
// data-zoom device), or `bounds` { x0, y0, x1, y1 } when given. Segments come from `segments` or the element's
// data-zoom JSON. Returns { rest, screen, bounds, stops, fit, at }.
export function armZoom(el, { duration, segments, margin = 0, bounds = null, curve = inout } = {}) {
  if (!(duration > 0)) throw new Error('armZoom: `duration` has to be the clip length in seconds');
  const root = el.closest('[data-scene], .sc') ?? document.body;
  const screenEl = el.querySelector('.device__screen');
  if (!screenEl) throw new Error(`armZoom: ${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} has no .device__screen inside it`);
  const rest = restBox(el, root), screen = restBox(screenEl, root);
  const html = getComputedStyle(document.documentElement);
  const W = parseFloat(html.getPropertyValue('--W')), H = parseFloat(html.getPropertyValue('--H'));
  const zoomMax = parseFloat(getComputedStyle(el).getPropertyValue('--piece-device-zoom-max')) || 1.4;
  const cy = rest.y + rest.h / 2, half = (rest.h * zoomMax) / 2;
  const room = bounds ?? { x0: margin, x1: W - margin, y0: Math.max(margin, cy - half), y1: Math.min(H - margin, cy + half) };
  let segs = segments;
  if (segs === undefined) {
    try { segs = el.dataset.zoom ? JSON.parse(el.dataset.zoom) : []; } catch (err) { throw new Error(`armZoom: data-zoom is not JSON (${err.message})`); }
  }
  if (!Array.isArray(segs)) throw new Error('armZoom: segments have to be an array of { t0, t1, u, v, z }');
  const stops = stopsOf(segs, duration);
  const fit = fitOf(rest, room);
  const at = seconds => {
    const cam = cameraAt(stops, clamp(seconds / duration), curve);
    const pose = zoomPose(rest, screen, { u: cam.u, v: cam.v }, room, cam.z);
    el.style.translate = `${pose.dx}px ${pose.dy}px`;
    el.style.scale = String(pose.s);
    el.style.zIndex = pose.s > 1 ? '5' : '';   // a zooming device rises above its neighbours while it is zoomed
    return pose;
  };
  return { rest, screen, bounds: room, stops, fit, at };
}

// ---- the entrances --------------------------------------------------------------------------------------------------
// The piece's fx (film({ fx: deviceFx })): each lands ON the rest tilt. `rise` and `fade` are the kit's built-ins and
// already do (they write translate and opacity on .device, outside the tilted body). These three need the device's
// anatomy. Each is timed by its factor times the lock's enter role and curved by the lock's entrance curve, like a
// built-in; the only numbers here are travel, which is choreography.
const pose = el => {
  const cs = getComputedStyle(el);
  return { ry: parseFloat(cs.getPropertyValue('--dv-ry')) || 0, persp: cs.getPropertyValue('--dv-persp').trim() || '1800px' };
};
const body = e => {
  const el = e.el.querySelector(':scope > .device__body');
  if (!el) throw new Error(`data-fx="${e.type}" needs a .device__body inside the device (${e.el.tagName.toLowerCase()} "${e.el.className}")`);
  return el;
};
const fadeIn = (e, s, rig, share) => rig.curve.enter(ramp(s, 0, e.len * share));

export const deviceFx = {
  // turn in: start TURN_DEG further round than the rest tilt, signed with it (a flat device turns in from the right),
  // and settle on the tilt
  turn: {
    factor: 1.3,
    prep(e) { e.body = body(e); Object.assign(e, pose(e.el)); },
    apply(e, s, rig) {
      const k = rig.curve.enter(ramp(s, 0, e.len)), sign = e.ry < 0 ? -1 : 1;
      e.body.style.transform = `perspective(${e.persp}) rotateY(${e.ry + sign * TURN_DEG * (1 - k)}deg)`;
      return { opacity: fadeIn(e, s, rig, 0.4) };
    },
  },
  // slide in from the device's own side: the left for a device turned right (alone on the left), the right for one
  // turned left; data-side="left|right" says so for a flat one (default left)
  slide: {
    factor: 1,
    prep(e) { Object.assign(e, pose(e.el)); },
    apply(e, s, rig) {
      const side = e.opts.side === 'right' ? 1 : e.opts.side === 'left' ? -1 : e.ry < 0 ? 1 : -1;
      const left = 1 - rig.curve.enter(ramp(s, 0, e.len));
      return { opacity: fadeIn(e, s, rig, 0.3), translate: `${side * left * SLIDE_WIDTHS * e.el.offsetWidth}px 0px` };
    },
  },
  // a notebook: the lid tips back LID_DEG and opens on its hinge while the device fades in
  lid: {
    factor: 1.4,
    prep(e) {
      e.lid = e.el.querySelector('.device__hinge > .device__shell');
      if (!e.lid) throw new Error(`data-fx="lid" needs a notebook: .device__hinge > .device__shell (${e.el.tagName.toLowerCase()} "${e.el.className}")`);
    },
    apply(e, s, rig) {
      const k = rig.curve.enter(ramp(s, 0, e.len));
      e.lid.style.transform = `rotateX(${LID_DEG * (1 - k)}deg)`;
      e.lid.style.opacity = String(0.35 + 0.65 * k);
      return { opacity: fadeIn(e, s, rig, 0.3) };
    },
  },
};
