# fixtures/motion — a motion lock, three goldens, and a negative for every gate of `motion.mjs check`

`fixtures/golden` proves the pixel gate on a screen; `fixtures/lint` proves every lint section can go
red. This folder does the same for `scripts/motion.mjs check`, the verb that gates films and clicker
decks: three clean pieces that must pass, and one piece per gate with exactly ONE planted fault that must
fail on that gate (the devices module adds a second layout negative, for its zoom bound).

## Run it

```sh
node scripts/motion.mjs --self-test                                            # the manifest below, 19 pieces
node scripts/motion.mjs --self-test --manifest fixtures/motion/fonts/manifest.json   # the fonts negative
node scripts/motion.mjs check --lock fixtures/motion/design-lock.json --id golden-film   # one piece
```

The self-test runs `check --json` on each piece and compares the gate verdicts with `manifest.json`: a
golden must end in `RESULT: PASS`; a negative must show its gate at the stated result, exit with the
stated code, and fail no other gate unless the manifest `tolerate`s it. It needs Chromium (the pinned
build), not ffmpeg. A full run takes a minute or two.

## What is here

- `design-lock.json`: a small lock derived from the golden fixture (same `meta.chromiumBuild`, same
  colours, spacing, radii and type roles), plus `tokens.motion` with `durationsMs { fast 150, standard 300,
  emphasized 500 }` and `easings { standard, decelerate, accelerate }`, and `tokens.devices` (the finish
  `text1 / border / text1`, the ground `accent-subtle / surface1` with the engine's plain half, tilt 10,
  zoomMax 1.4, all three kinds). `fonts` is empty on purpose, so the goldens do not depend on which font
  a machine has (the fonts gate prints SKIP for them), and `screens` is empty because a film is not a
  screen. There is no `render.allowHosts`.
- `assets/`: `tokens.css`, `tailwind.tokens.cjs` and `tokens.dtcg.json`, written by
  `node scripts/capture-figma.mjs --derive --lock fixtures/motion/design-lock.json`. Never edit them by hand.
  Also `prototype-clip/`: the 80 JPEG frames (10 fps, 390 × 844) and `clip.json` of the synthetic prototype
  the devices golden plays, written by `node fixtures/motion/make-prototype-clip.mjs` in the lock's own
  colours (placeholder rows, one accent bar, three bursts of localised action: a tap, a sheet, a toggle);
  regenerate it there, never edit a frame.
- `formats.json`: copied from the scaffold; `motion.mjs new` reads the frame sizes and fps from it.
- `motion/<id>/`: one piece per folder (`index.html` + `piece.js`). `golden-film` and `golden-deck` started from what
  `motion.mjs new` produces for this lock (the engine skeleton, its ROLE MAP filled from the lock's slots, its
  motion roles set to `standard / fast / emphasized` and `decelerate / accelerate / standard`) and were then
  rewritten: scenes restructured, slots removed, copy that is true of this fixture. There is no
  `templates/motion/` here on purpose: `new` falls back to the engine skeletons, and the scaffold ships only
  `MOTION-LAYOUTS.md`. `golden-devices` is the third golden, written for `runtime/motion/devices.css`
  (`references/device-mockups.md`). Every other folder is one of those three with one fault.
- `fonts/`: a second, nested lock directory for the fonts negative (see the table).
- `manifest.json`: the self-test's input. Each piece also carries a `planted` line, as in `fixtures/lint`.

The pieces load the kit by the relative path `../../../../runtime/motion/` (five levels from `fonts/`).
`motion.mjs new` would link `kit` inside the lock directory for a skill; the engine tree carries no
symlink (release-check refuses them), and `check` does not need one.

## The fixtures

| id | kind | gate | result | planted (and where) |
|---|---|---|---|---|
| `golden-film` | film | all | pass | nothing. 1080x1350, 13.75 s, three scenes; every entrance type (`fade rise pop words punch slam throw drop count draw drawy block`), a `push` and a `wipe` cut, a `count`, a `data-each` group |
| `golden-deck` | deck | all | pass | nothing. 1920x1080, three scenes, five presses with a note each, a `block`, a `draw`, a `count`, a `fade` exit and a `wipe` exit |
| `golden-devices` | film | all | pass | nothing. 1920x1080, 18.75 s, three scenes: a phone alone on the left on the lock's half ground, turned +10 toward the copy, the full band tall, turning in (`turn`); a row of three, phone, tablet, phone, flat, rising in turn; a phone resting at its band over 1.4 that plays the synthetic clip (the kit's `clip.js` on a canvas) and zooms to its action, the rest pose taken mid-dwell so the audit measures it zoomed |
| `determinism-css-transition` | film | determinism | FAIL | `index.html`: `#mark { transition: opacity 2s linear }`; the same frame differs with the frame drawn before it. Tolerates `lint`: `raw-motion` also fires, because the lock declares motion tokens |
| `determinism-timer` | film | determinism | FAIL | `piece.js`: a `setInterval` that moves the mark's word-spacing. The `self-time` WARN it also raises is only a warning, so nothing is tolerated |
| `determinism-wall-clock` | film | determinism | FAIL | `piece.js`: the `frame` hook reads `performance.now()`, which the harness does not freeze (it freezes `Date` and seeds `Math.random`, so an unseeded `Math.random` would not show). The `self-time` WARN it also raises is only a warning, so nothing is tolerated |
| `offline-remote-stylesheet` | film | offline | FAIL | `index.html`: a stylesheet from `https://assets.example.invalid/remote.css` (a reserved name that never resolves, so the run needs no network) |
| `pictures-missing-image` | film | pictures | FAIL | `index.html`: an `<img>` whose `src` file does not exist |
| `tokens-unresolved-role` | film | tokens | FAIL | `piece.js`: `motion.ease.enter` is `'overshoot'`, an easing the lock does not declare |
| `tokens-literal-duration` | film | tokens | FAIL | `index.html`: `data-dur="0.4"` on a `rise` |
| `lint-raw-hex` | film | lint | FAIL | `index.html`: `.kicker { color: #112233 }` outside `:root` |
| `lint-placeholder-copy` | film | lint | FAIL | `index.html`: the kicker is a `data-slot` line that still opens with the `TODO` marker (the form the skeleton ships) |
| `self-time-clock-read` | film | self-time | WARN | `piece.js`: `const startedAt = Date.now()`, read and never used |
| `layout-outside-margin` | film | layout | FAIL | `index.html`: `.source` pulled left of the frame margin by a negative margin |
| `layout-overlap` | film | layout | WARN | `index.html`: `.unit` pulled up over the counted figure by a negative margin |
| `devices-zoom-outside-margin` | film | layout | FAIL | `piece.js`: `armZoom` given bounds a million pixels wide, so the zoom's fit bound is off and the requested scale of 2 grows the device past the frame margins and its band at the proto rest (its box reaches 13 px above the frame). The overlap with the head it also causes is the same fault and only a WARN, so nothing is tolerated |
| `deck-step-past-last-press` | deck | loads | FAIL | `index.html`: an element on press 3 in the opening scene, which has press 1 only, so press 2 has nothing to play and the deck refuses to load |
| `deck-identical-poses` | deck | presses | WARN | `piece.js`: `steps: [0, 1]` gives the opening scene a second press that plays no entrance, so its pose equals the one before |
| `deck-clicker-eats-next` | deck | clicker | FAIL | `piece.js`: a capture-phase `keydown` listener that swallows every next key before the deck sees it |
| `fonts/fonts-absent-family` | film | fonts | FAIL, exit 4 | `fonts/design-lock.json` declares the family `Fixture Absent Sans` with `fontChecks`, and nothing installs or bundles it |

The `index.html` of every negative opens its body with a `motion-negative:` comment that says what was
planted, so a reader of the piece sees it.

**The fonts negative has its own manifest.** The fonts gate reads `lock.fonts`, and a manifest names one
lock. The main lock declares no fonts so the goldens pass on any machine; a lock that declared one would
fail every golden on the fonts gate unless a font binary were bundled, which the engine does not ship. The
negative therefore has a lock of its own in `fonts/` (the same tokens, one declared family, its own derived
`assets/`) and a one-row manifest; run it with `--manifest fixtures/motion/fonts/manifest.json` (CI runs both).

**Tolerances.** Only `determinism-css-transition` tolerates a gate (`lint`), because a CSS transition is
also a raw motion value and the lint is right to say so. The self-test counts only FAIL as a second fault.

**Goldens: what is tolerated.** All three goldens end `RESULT: PASS` with 0 errors and 0 warnings. Two lines
are not a plain `pass`, and both are by design:
- `fonts` prints SKIP: the lock declares no `fontChecks`, so there is nothing to assert (the SKIP is counted
  in the summary, never read as clean).
- the `lint` gate passes with one lint WARN from `schema-sanity`: the lock's `screens` is empty.

## Not covered, and why

- **frame-time** is advisory (a WARN, never a FAIL) and measures the machine, not the piece. A piece slow
  enough to cross the budget everywhere would also make the clicker gate flaky, and one that is only
  slow here would pass on a faster machine. Nothing is planted rather than a row that depends on hardware.

## Rules

- **A new motion gate means a negative here, in the same change.** CONTRIBUTING rule 2: a check that has
  never been red proves nothing. Add the piece (one fault, minimal), the `manifest.json` row with its gate
  and result, and the line in the table above.
- One fault per piece. `tolerate` only when the planted fault unavoidably trips a second gate, and say why
  in the table.
- Start from the goldens: copy `motion/golden-film` or `motion/golden-deck`, plant the fault, run
  `node scripts/motion.mjs check --lock fixtures/motion/design-lock.json --id <id>` and read the gate line
  before adding the row.
- When the lock's `tokens` change, re-derive the assets and the provenance receipt:
  `node scripts/capture-figma.mjs --derive --lock fixtures/motion/design-lock.json`
  (and the same for `fonts/design-lock.json`).

## Platform note

CI runs the static gates on Linux and macOS. The lock's typography names a family a Linux runner does not
have, and the derived `tokens.css` carries that name with no generic family after it, so Chromium falls back
to its own default, which on Linux is a serif (DejaVu Serif), not a sans. The goldens therefore render in
whatever the machine picks, and the fixtures are written so that this cannot move a gate:

- headlines are sized to the measure by measuring them (`fit`), and paragraphs wrap inside the margins;
- nothing sits on the margin itself: the film's top bar starts one gap below it, so the reach of its text
  (a face's ascent can poke past its line box) stays inside the margin whatever the face;
- determinism compares one machine's frames with each other, never a stored image.

The first Linux run failed on exactly that last point of the bar: the mark's text reached 1 px above the
margin in the serif fallback. It was reproduced on a Debian container (Chromium 1228, DejaVu and Liberation
fonts) and on macOS by pointing a copy of the lock at `Times New Roman`; the lock itself is unchanged.

To check a new fixture against a face the machine does not have, copy `fixtures/motion` to a sibling
directory (the pieces load the kit by a relative path, so the depth must match), change the family in the
copy's `design-lock.json`, run `node scripts/capture-figma.mjs --derive --lock <copy>/design-lock.json`
(never edit `assets/tokens.css` by hand: the provenance hash would fail), then
`node scripts/motion.mjs --self-test --manifest <copy>/manifest.json`. The first 17 pieces passed under Verdana,
Impact, Arial Black, Courier New, Times New Roman and Georgia on macOS, and under the real fallback,
`sans-serif` (DejaVu Sans), DejaVu Sans Mono, Liberation Mono and Liberation Serif on Linux. The `.js` files
are the pieces' own scripts, as `motion.mjs new` writes them.
