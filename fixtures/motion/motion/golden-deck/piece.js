// What this fixture proves: the running order of the deck. index.html holds the scenes and the look; this file holds the order,
// how each scene hands over to the next, what the speaker sees beside the stage, and the lock's motion tokens.
import { deck, mount } from '../../../../runtime/motion/deck.js';

// The edge in index.html's map is a custom property, which keeps its text ("calc(...)"). Registering it as a
// <length> makes the browser resolve it to pixels, which the rest-pose audit needs as its margin. A role that is
// not a length (a bare 32, say) registers as the 0px fallback and would quietly switch that check off, so it
// stops the piece, and says why on the page for the tools that wait for it.
CSS.registerProperty({ name: '--piece-edge', syntax: '<length>', inherits: true, initialValue: '0px' });
const edge = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--piece-edge'));
if (!(edge > 0)) {
  const why = '--piece-edge must be a length, e.g. var(--space-8)';
  document.documentElement.setAttribute('data-motion-error', why);
  throw new Error(why);
}

const piece = deck({
  // The id is the name of this folder; the presenter window and any recorded take are filed under it.
  id: new URL('.', import.meta.url).pathname.split('/').filter(Boolean).pop(),
  title: 'What this fixture proves',
  W: 1920, H: 1080, fps: 30,   // `motion.mjs new` writes these from a formats.json screen preset and motion.fps
  margin: edge,                       // the rest-pose audit keeps every box this far inside the stage
  hold: 2.5,                          // TEMPO, which is yours: seconds each pose stays up when the deck plays itself
  // MOTION ROLES, which are the lock's: each value is the NAME of an entry under tokens.motion. The kit reads
  // --motion-<name> (how long) and --motion-ease-<name> (what curve) out of assets/tokens.css. If the lock declares no motion tokens, leave them: the kit's
  // defaults run and `motion.mjs check` says so in its `tokens` line instead of passing quietly.
  motion: { enter: 'standard', exit: 'fast', cut: 'emphasized', ease: { enter: 'decelerate', exit: 'accelerate', move: 'standard' } },
  // TEMPO, which is yours: the order, how each scene leaves ('cut', 'fade' or 'wipe'), and what is said. `notes`
  // holds one line for each press in the scene (the first press plays the scene's opening beat); `curtain` is the
  // note for the screen before anything has been pressed.
  scenes: [
    { id: 'title', label: 'Opening', curtain: 'The blank screen while people take their seats.', exit: 'fade', notes: ['Say who the deck is for and what it shows.'] },
    { id: 'number', label: 'Figure', exit: 'wipe', notes: ['Let the figure count up before you say it.', 'Give the source out loud.'] },
    { id: 'close', label: 'Ending', notes: ['Say the sentence once, then wait.', 'Point at the negatives and stop.'] },
  ],
  // draw({ state, scene, lt, t, total, idle, exact, sceneOf }) { ... } goes here for anything the markup cannot
  // do (a canvas, a chart that redraws); the kit calls it for every frame it shows.
});

await mount(piece);
