// What this fixture proves: the running order of the film. index.html holds the markup and the look; this file holds how long
// each scene lasts, how one scene hands over to the next, which of the lock's motion tokens the moves use, and
// anything the markup cannot do alone.
import { film, fit, beats } from '../../../../../runtime/motion/film.js';

// The roles in index.html's map are custom properties, which keep their text ("calc(...)"). Registering one as a
// <length> makes the browser resolve it to pixels, which is what the audit margin and the type caps need.
for (const name of ['--piece-edge', '--piece-size-hero']) {
  CSS.registerProperty({ name, syntax: '<length>', inherits: true, initialValue: '0px' });
}
const lengthOf = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
// A role that is not a length (a bare 32, say) registers as the 0px fallback and would quietly switch the margin
// check off, so it stops the piece, and says why on the page for the tools that wait for it.
const edge = lengthOf('--piece-edge');
if (!(edge > 0)) {
  const why = '--piece-edge must be a length, e.g. var(--space-8)';
  document.documentElement.setAttribute('data-motion-error', why);
  throw new Error(why);
}

// TEMPO, which is yours: a beat grid, then every scene in whole beats. 96 to the minute makes a beat 0.625 s.
const beat = beats(96);

await film({
  title: 'What this fixture proves',
  width: 1080, height: 1350, fps: 30,   // `motion.mjs new` writes these from a formats.json screen preset and motion.fps
  margin: edge,                                // the rest-pose audit keeps every box this far inside the frame
  // MOTION ROLES, which are the lock's: each value is the NAME of an entry under tokens.motion. The kit reads
  // --motion-<name> (how long) and --motion-ease-<name> (what curve) out of assets/tokens.css. If the lock declares no motion tokens, leave them: the kit's
  // defaults run and `motion.mjs check` says so in its `tokens` line instead of passing quietly.
  motion: { enter: 'standard', exit: 'fast', cut: 'emphasized', ease: { enter: 'decelerate', exit: 'accelerate', move: 'standard' } },
  scenes: [
    { id: 'open', dur: beat(7) },
    { id: 'ask', dur: beat(6), cut: { type: 'push', dir: 'left' } },
    { id: 'end', dur: beat(9), cut: 'wipe' },     // the plate is drawn in --motion-wipe-color
  ],
  // Runs once, with every scene on screen so that text can be measured: size each marked line to its share of
  // the measure, the space between the margins.
  setup({ W }) {
    const measure = W - 2 * edge;
    for (const el of document.querySelectorAll('[data-fit]')) {
      fit(el, measure * Number(el.dataset.fit), { max: lengthOf('--piece-size-hero'), line: el.dataset.fitLine ?? null });
    }
  },
});
