// Presses become time here. A deck's picture is drawn from a deck time; this module derives that time from the
// presses a presenter made and the wall-clock second they were made at — nothing else. Because of that, a talk
// given live, a take replayed from its press log and the automatic film are three readings of one function.
//
// The clock keeps a short history of LEGS. A leg is one straight run of deck time against wall time: it starts at
// wall second w0 at deck second `from` and reaches `to` after `dur` wall seconds, unless the next press cut it short
// at `stop`. A press only ever appends a leg; reading the clock interpolates the newest leg and, for the idle time,
// walks back over the legs that ended at a pose.
//
//   stops   [{ t, scene, hold? }] — the poses, in ascending deck seconds
//   kinds   'next' · 'back' · 'goto' (+ pose index) · 'blank'
//
// Guarantees (clock.test.mjs): a press never jumps over a pose; next during a beat completes it quickly; back
// returns to the pose behind, quickly; neither end can be passed; idle time belongs to a scene, stands still during
// a beat and restarts in a new scene; a press log replays to the same times however it is read.

// The kit default for the `exit` role, in seconds: the most a hurried finish or a step back may take. A deck hands
// its resolved `exit` duration in as { fast }, so the lock sets this pace too.
export const FAST = 0.3;
const SLACK = 1e-6;   // deck seconds closer than this are the same instant

export function createClock(stops, start = 0, { fast = FAST, blank = false } = {}) {
  const poseTime = i => stops[i].t;
  const fresh = (w, i) => ({ w0: w, dur: 0, from: poseTime(i), to: poseTime(i), target: i, visit: true, stop: Infinity });
  let legs = [fresh(0, start)];
  let dark = !!blank, newest = -Infinity;

  const head = () => legs[legs.length - 1];
  const arrival = leg => leg.w0 + leg.dur;
  const inMotion = (leg, w) => leg.dur > 0 && w < arrival(leg);
  const deckTime = w => {
    const leg = head();
    return inMotion(leg, w) ? leg.from + ((leg.to - leg.from) * (w - leg.w0)) / leg.dur : leg.to;
  };
  function append(w, leg) {
    head().stop = w;
    if (leg.visit) legs = [];   // a jump opens a new visit: nothing before it can count towards idle time
    legs.push(leg);
  }
  const travel = (w, target, seconds) => append(w, { w0: w, dur: Math.max(0, seconds), from: deckTime(w), to: poseTime(target), target, visit: false, stop: Infinity });

  // Where each kind of press sends the clock. `here` is the deck time at the press, `leg` the newest leg.
  const respond = {
    next(w, here, leg) {
      if (inMotion(leg, w) && leg.to > leg.from) return travel(w, leg.target, Math.min(arrival(leg) - w, fast));
      const ahead = stops.findIndex(p => p.t > here + SLACK);
      if (ahead !== -1) travel(w, ahead, poseTime(ahead) - here);
    },
    back(w, here, leg) {
      const moving = inMotion(leg, w), retreating = moving && leg.to < leg.from;
      // retreating: one pose further back; mid-beat: the pose the beat left (at or before `here`, which is that pose's
      // own time when back lands on the beat's first instant); at rest: the pose strictly before this one
      const behind = retreating ? leg.target - 1
        : moving ? stops.findLastIndex(p => p.t <= here + SLACK)
        : stops.findLastIndex(p => p.t < here - SLACK);
      if (behind >= 0) travel(w, behind, Math.min(here - poseTime(behind), fast));
    },
    goto(w, here, leg, i) {
      const index = Math.min(stops.length - 1, Math.max(0, Math.trunc(Number(i)) || 0));
      append(w, fresh(w, index));
    },
    blank() { dark = !dark; },
  };

  function press(kind, w, i) {
    if (!Number.isFinite(w)) return;   // a press with no usable time is dropped, never applied "instantly"
    newest = Math.max(newest, w);   // presses arrive in wall order; a stale timestamp is treated as "now"
    const handler = respond[kind];
    if (handler) handler(newest, deckTime(newest), head(), i);
  }

  // Seconds at rest in the scene of the latest pose reached, summed over this visit. Walking back from the newest
  // leg: a leg that reached its pose contributes the time it then sat there; the walk stops at a pose in another
  // scene or at the leg that opened the visit. During a beat the newest leg has not arrived, so the sum is frozen.
  function restAt(w) {
    let scene = null, seconds = 0;
    for (let k = legs.length - 1; k >= 0; k--) {
      const leg = legs[k], reached = arrival(leg), left = Math.min(leg.stop, w);
      if (reached <= leg.stop && reached <= w) {
        const there = stops[leg.target].scene;
        if (scene === null) scene = there;
        else if (there !== scene) break;
        seconds += Math.max(0, left - reached);
      }
      if (leg.visit) break;
    }
    return { scene, s: seconds };
  }

  function read(w) {
    const leg = head(), moving = inMotion(leg, w), rest = restAt(w);
    return {
      t: deckTime(w), moving, target: leg.target, dir: moving ? Math.sign(leg.to - leg.from) : 0,
      rest, blank: dark, idle: id => (id === rest.scene ? rest.s : 0),
    };
  }
  return { press, read };
}

// A press log as a function of wall time. Reading forward applies only the presses not yet applied; reading an
// earlier time rebuilds the clock from the log, so a film frame never depends on the frame read before it.
// opts: { fast, blank } — `blank` is the screen state when the log began (a take records it).
export const PRESS_KINDS = Object.freeze(['next', 'back', 'goto', 'blank']);

export function run(stops, events = [], start = 0, opts = {}) {
  // a log that cannot be replayed exactly is refused whole, naming the first bad press
  events.forEach((e, n) => {
    if (!Number.isFinite(e?.w) || !PRESS_KINDS.includes(e?.k)) throw new Error(`press ${n} of the log is not { w: <seconds>, k: ${PRESS_KINDS.join(' | ')} }: ${JSON.stringify(e)}`);
  });
  const replay = { clock: null, applied: 0, at: -Infinity };
  const rebuild = () => Object.assign(replay, { clock: createClock(stops, start, opts), applied: 0, at: -Infinity });
  rebuild();
  return w => {
    if (w < replay.at) rebuild();
    replay.at = w;
    for (; replay.applied < events.length && events[replay.applied].w <= w; replay.applied++) {
      const e = events[replay.applied];
      replay.clock.press(e.k, e.w, e.i);
    }
    return replay.clock.read(w);
  };
}

// The automatic film as a press log: sit on each pose for its hold, press next, let the beat play out.
export function auto(stops, start = 0, hold = 2) {
  const sit = i => stops[i].hold ?? hold;
  const events = [];
  let wall = sit(start);
  for (let pose = start + 1; pose < stops.length; pose++) {
    events.push({ w: wall, k: 'next' });
    wall += stops[pose].t - stops[pose - 1].t + sit(pose);
  }
  return { start, events, duration: Math.round(wall * 1e6) / 1e6 };   // rounded: no float dust in a reported length
}

// A single pose, held for s seconds: what a still, a check and a lock screen draw.
export function rest(stops, i, s = 0) {
  const scene = stops[i].scene;
  return { t: stops[i].t, moving: false, target: i, dir: 0, rest: { scene, s }, blank: false, idle: id => (id === scene ? s : 0) };
}
