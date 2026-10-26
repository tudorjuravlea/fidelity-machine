// Screens on devices: the running order of the film. index.html holds the markup and the look; this file holds how
// long each scene lasts, which of the lock's motion tokens the moves use, the device entrances (the kit's deviceFx),
// the prototype clip on the screens (the kit's clip: numbered frames addressed by index, so every frame is a function
// of t) and the zoom to the action, driven from the scene's draw hook.
import { film, fit, beats, clamp } from '../../../../runtime/motion/film.js';
import { clip } from '../../../../runtime/motion/clip.js';
import { deviceFx, armZoom } from '../../../../runtime/motion/devices.js';

// The roles in index.html's map are custom properties, which keep their text ("calc(...)"). Registering one as a
// <length> makes the browser resolve it to pixels, which is what the audit margin needs.
for (const name of ['--piece-edge', '--piece-size-title']) {
  CSS.registerProperty({ name, syntax: '<length>', inherits: true, initialValue: '0px' });
}
const lengthOf = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
const edge = lengthOf('--piece-edge');
if (!(edge > 0)) {
  const why = '--piece-edge must be a length, e.g. var(--space-8)';
  document.documentElement.setAttribute('data-motion-error', why);
  throw new Error(why);
}

// The recording: 80 JPEG frames at 10 fps under assets/prototype-clip/ (fixtures/motion/make-prototype-clip.mjs
// writes them). Frame n is a function of the seconds into the clip; the stills on the other screens are its frame 0.
const CLIP = { fps: 10, frames: 80, width: 390, height: 844 };
const rec = clip({ url: n => `../../assets/prototype-clip/${String(n).padStart(4, '0')}.jpg`, frames: CLIP.frames, flipY: false });
const CLIP_AT = 0.6;   // seconds into the proto scene when the clip starts (choreography)
const frameAt = seconds => clamp(Math.floor(seconds * CLIP.fps), 0, CLIP.frames - 1);
// Draw one frame of the recording on a screen. In tool mode (exact) the frame itself is awaited; live, the closest
// decoded frame at or before it is drawn and the window after it warmed.
function paintFrame(canvas, n, exact) {
  const ctx = canvas.getContext('2d');
  const draw = bmp => { if (bmp) ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height); };
  if (exact) return rec.exact(n).then(draw);
  draw(rec.at(n));
  return undefined;
}

// TEMPO, which is yours: a beat grid, then every scene in whole beats. 96 to the minute makes a beat 0.625 s.
const beat = beats(96);
let zoom = null;
const stills = Array.from(document.querySelectorAll('canvas[data-still]'));
const screen = document.getElementById('proto-screen');

await film({
  title: 'Screens on devices',
  width: 1920, height: 1080, fps: 30,
  margin: edge,                                // the rest-pose audit keeps every box this far inside the frame
  // MOTION ROLES, which are the lock's: each value is the NAME of an entry under tokens.motion.
  motion: { enter: 'standard', exit: 'fast', cut: 'emphasized', ease: { enter: 'decelerate', exit: 'accelerate', move: 'standard' } },
  fx: deviceFx,                                // turn, slide, lid: each lands on the device's rest tilt
  scenes: [
    { id: 'solo', dur: beat(7) },
    { id: 'row', dur: beat(7), cut: 'wipe' },
    // the clip runs from CLIP_AT for 8 s; the rest pose is taken mid-dwell on the first tap, so the audit measures the
    // device ZOOMED, inside the margins and its band
    { id: 'proto', dur: beat(16), cut: 'wipe', rest: CLIP_AT + 1.5, draw(lt, { exact }) {
      zoom.at(lt - CLIP_AT);
      return paintFrame(screen, frameAt(lt - CLIP_AT), exact);
    } },
  ],
  // Runs once, with every scene on screen: the zoom reads the device's rest from its layout offsets here (never from
  // a client rect, which on the first frame is mid-entrance), and the other screens take the clip's first frame.
  async setup({ W }) {
    // a head's title is sized to its measure by measuring it, so a fallback face cannot push the head into the band
    for (const el of document.querySelectorAll('[data-fit]')) fit(el, (W - 2 * edge) * Number(el.dataset.fit), { max: lengthOf('--piece-size-title') });
    zoom = armZoom(document.getElementById('proto'), { duration: CLIP.frames / CLIP.fps, margin: edge });
    const first = await rec.exact(0);
    for (const c of stills) c.getContext('2d').drawImage(first, 0, 0, c.width, c.height);
  },
});
