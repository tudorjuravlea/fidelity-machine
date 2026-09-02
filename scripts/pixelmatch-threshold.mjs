// pixelmatch-threshold.mjs — the single source of truth for the pixelmatch colour threshold.
// diff.mjs imports this directly. Any skill-side instrument that must agree with diff.mjs
// about what counts as "below the cutoff" (a colour census, for instance) imports it too,
// so the two can never drift out of sync the way a duplicated literal or a stale comment can.
export const PIXELMATCH_THRESHOLD = 0.1;
