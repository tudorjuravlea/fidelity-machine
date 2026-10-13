// The keyboard as a presenter uses it. A hardware clicker can only send a handful of keys — page up/down or the
// arrows to move, a full stop for its blank button, F5 for its start button — so those come first; the letters
// are for the laptop while preparing. The key names are what clickers send (an interop fact, not a choice).
const ACTIONS = {
  next: ['PageDown', 'ArrowRight', 'ArrowDown', ' ', 'Enter'],
  back: ['PageUp', 'ArrowLeft', 'ArrowUp', 'Backspace'],
  blank: ['.', 'b', 'B'],
  show: ['F5', 'f', 'F'],   // full screen; F5 must never reload the page in the middle of a talk
  first: ['Home'],
  last: ['End'],
  presenter: ['w', 'W'],
  take: ['r', 'R'],
};
const BY_KEY = new Map(Object.entries(ACTIONS).flatMap(([action, keys]) => keys.map(key => [key, action])));

// e → 'next' | 'back' | 'blank' | 'show' | 'first' | 'last' | 'presenter' | 'take' | null.
// Any modifier means the browser's own shortcut, which the deck leaves alone.
export const keyOf = e => (e.ctrlKey || e.metaKey || e.altKey ? null : BY_KEY.get(e.key) ?? null);
