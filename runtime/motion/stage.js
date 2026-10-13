// mount(deck) puts a deck on screen, in one of two modes.
//   Tool mode (?tool): one picture — a pose (?pose=<i>[&idle=<s>]) or a frame of the automatic film (?frame=<n>) —
//   drawn once fonts, pictures and two painted frames are in; then data-render-ready, and window.__motion answers.
//   Live mode: a person presents. Keys and the presenter window produce presses; the clock turns them into deck time;
//   a small effect loop paints and reports. Live mode marks the page with data-motion-live and never claims readiness.
import { auto, createClock, rest, run } from './clock.js';
import { keyOf as actionFor } from './keys.js';
import { settlePictures, twoFrames, clearStaleReadiness } from './entrances.js';

export async function mount(deckOrPromise) {
  clearStaleReadiness();
  try {
    return await start(await deckOrPromise);   // deck() is async: it awaits fonts and runs the piece's setup
  } catch (err) {
    document.documentElement.setAttribute('data-motion-error', String(err?.message ?? err));
    throw err;
  }
}

async function start(deck) {
  const { W, H, fps, stops } = deck;
  const query = new URLSearchParams(location.search);
  const toolMode = query.has('tool');
  const stage = document.querySelector('#stage');
  if (!stage) throw new Error('the page needs a <div id="stage"> holding the scenes');
  if (!toolMode) fitStageToWindow(stage, W, H);   // deck() already sized it and pinned it at 0,0 unscaled

  const blankPlate = Object.assign(document.createElement('div'), { id: 'motion-blank' });
  document.body.append(blankPlate);
  const show = (state, how) => {
    blankPlate.style.display = state.blank ? 'block' : 'none';
    return deck.render(state, how);
  };
  // the tools' draw: hooks finished, two frames painted
  const settle = async state => { await show(state, { exact: true }); await twoFrames(); return state; };

  const automatic = auto(stops, deck.start, deck.hold);
  const poseNumber = value => {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0 && n < stops.length) return n;
    throw new Error(`there is no pose ${value}: poses run 0 to ${stops.length - 1}`);
  };
  const picturesMissing = [];
  const reel = { read: null };   // the loaded film: a press log turned into a function of wall seconds

  const api = {
    kind: 'deck',
    meta: {
      id: deck.id, title: deck.title, W, H, fps, start: deck.start, margin: deck.margin,
      duration: automatic.duration, frames: Math.round(automatic.duration * fps),
      stops: stops.map(({ t, scene, step, label, notes, hold }) => ({ t, scene, step, label, notes, hold })),
      picturesMissing, motion: deck.motion,
    },
    pose: async (i, idle = 0) => {
      const n = poseNumber(i);
      await settle(rest(stops, n, Number(idle) || 0));
      return stops[n].scene;
    },
    // A film is a press log: a recorded take (its presses, its first pose, the screen state it began in), or the
    // automatic one that holds every pose for its hold.
    film: take => {
      const log = take ?? automatic;
      reel.read = run(stops, log.events, log.start ?? deck.start, { fast: deck.fast, blank: !!log.blank });
      return { duration: log.duration, frames: Math.round(log.duration * fps) };
    },
    frame: async n => {
      if (!reel.read) api.film();
      return settle(reel.read(Number(n) / fps));
    },
    audit: () => deck.audit(),
  };
  window.__motion = api;

  if (!toolMode) {
    present(deck, api, show);
    return api;
  }
  const draw = () => (query.has('frame') ? api.frame(query.get('frame')) : api.pose(query.get('pose') ?? deck.start, query.get('idle') ?? 0));
  await draw();                                    // lays out what draw hooks built, so it starts loading
  picturesMissing.push(...await settlePictures());
  await draw();                                    // the picture again, with everything in
  document.documentElement.setAttribute('data-render-ready', '');
  return api;
}

function fitStageToWindow(stage, W, H) {
  const apply = () => {
    const k = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  };
  apply();
  window.addEventListener('resize', apply);
}

// ---- live playback ---------------------------------------------------------------------------------------------------
// What one turn of the live loop must do, given the clock reading it saw last turn and the reading now. Pure, so the
// rules are testable without a page:
//   'paint'   the picture changed (time moved, the screen was blanked or unblanked), or the scene is one that keeps
//             moving while it is held
//   'arrive'  a beat that was playing has just ended on a pose
//   'measure' this paint is a frame inside a beat (it feeds stats())
export function liveEffects(before, now, keepsMoving = () => false) {
  const effects = new Set();
  const differs = !before || ['t', 'blank'].some(key => before[key] !== now[key]);
  const breathing = !now.moving && keepsMoving(now.rest.scene);
  if (differs || breathing) effects.add('paint');
  const sameBeat = Boolean(now.moving && before?.moving) && now.target === before.target;
  if (sameBeat && effects.has('paint')) effects.add('measure');
  if (!now.moving && before?.moving) effects.add('arrive');
  return effects;
}

function present(deck, api, show) {
  const { stops } = deck;
  const openedAt = performance.now() / 1000;
  const wall = () => performance.now() / 1000 - openedAt;   // wall seconds since the deck opened
  const hashPose = () => {
    const digits = /^#(\d+)$/.exec(location.hash)?.[1];
    return digits !== undefined && Number(digits) < stops.length ? Number(digits) : null;
  };
  const opening = hashPose() ?? deck.start;   // a reload reopens on the pose the hash names
  const clock = createClock(stops, opening, { fast: deck.fast });
  const reading = () => clock.read(wall());
  const keepsMoving = scene => (deck.live instanceof Set ? deck.live.has(scene) : deck.live === true);
  const link = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`motion:${deck.id}`) : null;
  const tell = (type, body) => link?.postMessage({ type, ...body });
  const notice = toastLine();
  const timings = {};   // pose → { gaps, draws }: ms between beat frames, ms spent drawing each

  const report = () => {
    const { target, moving, blank } = reading();
    tell('state', { target, moving, blank, taking: takes.busy });
  };
  const takes = recorder({ deck, wall, notice, report, jumpTo: pose => clock.press('goto', wall(), pose), here: reading });

  // the side effects a turn can call for
  let last = null, lastTurnAt = performance.now();
  const perform = {
    paint: now => show(now),
    measure: ({ target }, began, painted) => {
      timings[target] ??= { gaps: [], draws: [] };
      timings[target].gaps.push(began - lastTurnAt);
      timings[target].draws.push(painted - began);
    },
    arrive: ({ target }) => {
      // the hash names the pose, so a reload comes back to it (replace: no history entry per pose)
      const wanted = '#' + target;
      if (location.hash !== wanted) location.replace(wanted);
      deck.prepare?.(target);
      report();
    },
  };
  function turn() {
    const began = performance.now(), now = reading();
    const effects = liveEffects(last, now, keepsMoving);
    if (effects.has('paint')) perform.paint(now);
    if (effects.has('measure')) perform.measure(now, began, performance.now());
    if (effects.has('arrive')) perform.arrive(now);
    [last, lastTurnAt] = [now, began];
    return effects;
  }
  (function frameLoop() { turn(); requestAnimationFrame(frameLoop); })();
  // A covered or hidden window gets few or no animation frames. Rather than poll, the loop is also turned when it
  // matters: when the window becomes visible again, and when the beat a press started is due to land.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) turn(); });
  const turnWhenLanded = () => {
    const { moving, target, t } = reading();
    if (moving) setTimeout(turn, Math.abs(stops[target].t - t) * 1000 + 20);   // a beat never outlasts its own length
  };

  const press = (kind, pose, at = wall()) => {
    clock.press(kind, at, pose);
    takes.log(kind, at, pose);
    const effects = turn();
    if (kind === 'goto' && !effects.has('arrive')) perform.arrive(reading());   // a jump lands at once
    turnWhenLanded();
    report();
  };

  // Full screen, and a wake lock so a long pause for talking never dims the display. The browser drops the lock
  // whenever the page is hidden, so it is taken again on return.
  const holdScreen = async () => { try { await navigator.wakeLock?.request('screen'); } catch { /* refused: the screen may dim */ } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && document.fullscreenElement) holdScreen(); });
  const goFullScreen = async () => {
    try {
      if (document.fullscreenElement === null) await document.documentElement.requestFullscreen();
    } catch { /* refused or unsupported: present windowed */ }
    holdScreen();
  };
  const openPresenter = () => {
    const url = new URL('presenter.html', import.meta.url);
    url.searchParams.set('deck', deck.id);
    window.open(url.href, `presenter-${deck.id}`, 'popup,width=1000,height=700');
  };

  // what each action does; the three plain presses go straight to the clock
  const commands = Object.fromEntries(['next', 'back', 'blank'].map(kind => [kind, () => press(kind)]));
  Object.assign(commands, {
    first: () => press('goto', 0),
    last: () => press('goto', stops.length - 1),
    show: goFullScreen,
    presenter: openPresenter,
    take: () => takes.toggle(),
  });
  window.addEventListener('keydown', e => {
    const command = commands[actionFor(e)];
    if (command) e.preventDefault();
    if (command && !e.repeat) command();   // a key held down sends repeats; one press is one press
  });
  // someone typed a pose number into the address bar (or went back in history)
  window.onhashchange = () => {
    const asked = hashPose();
    if (![null, reading().target].includes(asked)) press('goto', asked);
  };
  link?.addEventListener('message', ({ data }) => {
    if (data?.type === 'key') commands[data.k]?.();
    if (data?.type !== 'hello') return;
    tell('meta', { meta: api.meta });   // a speaker view that just opened asks for the deck's poses
    report();
  });

  api.act = kind => commands[kind]?.();
  api.state = () => {
    const { t, target, moving, blank, rest: held } = reading();
    return { t, target, moving, blank, idle: held.s };
  };
  api.stats = () => structuredClone(timings);
  turn();
  perform.arrive(reading());
  document.documentElement.setAttribute('data-motion-live', '');
}

// A one-line notice for rehearsal, bottom left, styled inline (it never appears in a picture). ms = 0 keeps it up.
function toastLine() {
  const line = document.createElement('output');
  line.hidden = true;
  line.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:910;max-width:60vw;padding:5px 11px;border-radius:5px;'
    + 'font:500 13px/1.35 system-ui,sans-serif;color:#fff;background:rgba(16,16,16,.78)';
  document.body.append(line);
  let timer = null;
  return (text, ms = 2500) => {
    if (timer) clearTimeout(timer);
    line.value = text;
    line.hidden = !text;
    timer = text && ms > 0 ? setTimeout(() => { line.hidden = true; }, ms) : null;
  };
}

// Takes. A take is one recorded run-through: its presses, timed from the take's own start, and the voice when a
// microphone is allowed. The recorder is a small state machine —
//   idle → asking (waiting for the microphone answer) → rolling → saving → idle
// — and R in any state but idle and rolling does nothing. A take starts at the pose on screen, never mid-beat, and
// keeps the screen state it began in so its replay is blank exactly when the talk was. When it ends it is POSTed to
// the kit server as /__take/<deck>/<YYYYMMDD-HHMMSS>/take.json, plus voice.webm when there is a voice.
function recorder({ deck, wall, notice, report, jumpTo, here }) {
  let phase = 'idle', take = null;
  const twoDigits = n => (n < 10 ? `0${n}` : String(n));
  const stampFor = d => `${d.getFullYear()}${twoDigits(d.getMonth() + 1)}${twoDigits(d.getDate())}-${twoDigits(d.getHours())}${twoDigits(d.getMinutes())}${twoDigits(d.getSeconds())}`;
  const round = (x, places) => Math.round(x * 10 ** places) / 10 ** places;
  const send = (file, body) => fetch(new Request(['', '__take', encodeURIComponent(deck.id), take.stamp, file].join('/'), { method: 'POST', body }));

  async function arm() {
    const { moving, target, blank } = here();
    if (moving) { notice('Let the beat land, then press R to start recording.'); return; }
    phase = 'asking';
    take = { stamp: stampFor(new Date()), pose: target, blank, presses: [], zero: null, voice: null };
    notice('Asking for the microphone… (answer the browser; recording starts once it does)', 0);
    take.voice = await openVoice();
    jumpTo(take.pose);   // the take begins at rest on that pose, its idle time at zero
    take.zero = wall();
    phase = 'rolling';
    notice(take.voice ? '● Take running: presses and voice. R ends it.' : '● Take running: presses only, no microphone. R ends it.', 0);
    report();
  }

  async function finish() {
    phase = 'saving';
    // the file motion.mjs reads back: its field names are that interface
    const { stamp: id, pose: start, blank, presses: events, voice } = take;
    const record = Object.assign({ deck: deck.id, id, fps: deck.fps, start, blank }, {
      stops: deck.stops.map(pose => pose.t), events, duration: round(wall() - take.zero, 3), voice: voice ? 'voice.webm' : null,
    });
    let saved = false;
    try {
      if (take.voice) await send('voice.webm', await take.voice.stop());
      saved = (await send('take.json', `${JSON.stringify(record, null, 2)}\n`)).ok;
    } catch {
      saved = false;
    }
    notice(saved ? `Saved take ${take.stamp}.` : 'The take was not saved: open the deck through `motion.mjs serve`.', 5000);
    take = null;
    phase = 'idle';
    report();
  }

  return {
    get busy() { return phase === 'rolling' || phase === 'asking'; },
    log(kind, w, pose) {
      if (phase !== 'rolling' || w < take.zero) return;
      take.presses.push({ w: round(w - take.zero, 4), k: kind, ...(kind === 'goto' && { i: pose }) });
    },
    toggle() {
      if (phase === 'idle') return arm();
      if (phase === 'rolling') return finish();
      return undefined;   // asking or saving: the press is ignored
    },
  };
}

// The microphone as an object with one method, stop() → the recording as a Blob; null when there is none to use.
// It records in one-second pieces, so a crash mid-talk loses at most a second of what was said.
const once = (target, type) => new Promise(resolve => target.addEventListener(type, resolve, { once: true }));
async function openVoice() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
  } catch {
    return null;   // no microphone, or permission refused: the take keeps the presses only
  }
  const capture = new MediaRecorder(stream), pieces = [];
  capture.addEventListener('dataavailable', ({ data }) => pieces.push(data));
  const started = once(capture, 'start');
  capture.start(1000);
  await started;
  return {
    async stop() {
      const stopped = once(capture, 'stop');
      capture.stop();
      await stopped;
      for (const track of stream.getAudioTracks()) track.stop();
      return new Blob(pieces.filter(piece => piece.size > 0), { type: capture.mimeType || 'audio/webm' });
    },
  };
}
