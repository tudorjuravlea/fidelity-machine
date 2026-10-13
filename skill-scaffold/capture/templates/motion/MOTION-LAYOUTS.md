# Motion layouts — {{SYSTEM_TITLE}} films and clicker decks

Motion pieces are NET-NEW surfaces: no capture reference exists for a film, so they ship on the
motion gates (`scripts/motion.mjs check`), the adherence lint, the taste review and a human look at
the contact sheets (`scripts/motion.mjs stills`), never a fabricated diff number. The exception is a
rest pose that is also a lock screen: a screen `url` may carry a query
(`motion/<id>/index.html?tool&t=12.5`), the kit draws that frame and sets `[data-render-ready]`, and
the pixel gate, geometry and census then run on it like any other screen. Determinism (the same
frame in three orders) proves the in-between frames reproduce; the pixel gate sees the rests; a
person reviews what moves between them. Every layout translates a captured, verified section;
nothing here invents off-system vocabulary.

Start a piece with `node scripts/motion.mjs new --lock <lock> --kind film|deck --id <id>`: it copies
a skeleton to `<lock dir>/motion/<id>/` and links the runtime kit (`<lock dir>/kit`).

**Where the skeletons live.** The skeletons are engine scaffolding, in
`ENGINE/runtime/motion/templates/film/` and `…/deck/` (each `index.html` + `piece.js`). They carry
`REPLACE` markers and `TODO` copy on purpose, so they fail the adherence lint until filled, and
they therefore cannot sit in a skill, whose `templates/` holds FILLED, lint-clean layouts (the
slides and social ones work that way). `new` looks first in `<lock dir>/templates/motion/<kind>/`
(`film` or `deck`): a skill MAY add its own filled, lint-clean `index.html` + `piece.js` there, with
its role map already set and its copy real, and `new` prefers it. Otherwise `new` uses the engine
skeleton. A skill's own template keeps the four placeholders below so `new` can fill them.

Pieces link `../../kit/film.css` or `../../kit/deck.css`, then `../../assets/tokens.css` (the kit
reads the lock's variables, `--motion-*` included, from it), then their own `<style>`, then
`piece.js` as a module; `piece.js` imports `../../kit/film.js` or `../../kit/deck.js`. These
relative paths resolve from `<lock dir>/motion/<id>/`, where the skeleton lands, so keep them.

## The two kinds

- **film**: time runs. The picture is a pure function of one number, the film's clock; scenes have a
  length in seconds (usually whole beats), entrances are placed with `data-at`, and `?play` plays it.
- **deck**: presses run time. A clicker press plays the next beat and the picture rests while the
  speaker talks; the elements of a scene belong to presses by `data-step`, and a press never skips a
  rest pose.

Both use one attribute grammar (`data-fx data-at data-step data-until data-out data-dur data-each
data-stagger data-side data-d data-r data-gap data-during data-over data-bleed data-keep`, plus
`data-to data-from data-pad data-fix data-suffix` on a `count`) and one set of entrance types:
`fade rise pop words punch slam throw drop count draw drawy block`. The kit's README is the
reference; this file records only what the system decides.

## Frame sizes and fps

A piece takes its frame from `../../formats.json` (`screen` presets) and its frame rate from
`motion.fps`. Films: `social-portrait` (feed), `story` (reels and stories, respect its `safeZone`),
`event-banner`, `slide`. Decks: `slide`, or `screen-4k` for a wall. `motion.mjs new` writes the chosen
preset's size into `piece.js`. A beat grid is per piece and lives in `piece.js`.

## The ROLE MAP

Slot names differ per system, so the `<style>` of every piece opens with a ROLE MAP: custom
properties named for the role and prefixed `--piece-`, each set to `var(--REPLACE-...)`. The author
replaces every `REPLACE` value with the lock's real variable name from `assets/tokens.css`.

**Why the prefix.** A lock slot is called `--accent`, `--background`, `--space-4`. A role named
`--accent` set to `var(--accent)` refers to itself: a cycle, which the browser resolves to an empty
value (a transparent plate, no wipe colour) while `css-vars` passes, because the name is defined.
`--piece-*` names can never equal a lock slot, so a role is always a different variable from the one
it points at. The kit's own variables (`--motion-wipe-color`, `--motion-blank-color`) keep their
names: the kit reads them.

The exact names, as the skeletons spell them (`motion.mjs new` and any fill step read this table):

| role | set to | variable family in `tokens.css` | film | deck |
|---|---|---|---|---|
| `--piece-ground --piece-ink --piece-rule --piece-accent --piece-accent-ink` | a colour slot | `--<colorSlot>` | yes | yes |
| `--piece-muted` | a colour slot (secondary text) | `--<colorSlot>` | no | yes |
| `--piece-display --piece-body` | a font family | `--font-<role>-family` | yes | yes |
| `--piece-weight-display --piece-weight-strong` | a font weight | `--font-<role>-weight` | yes | yes |
| `--piece-size-hero --piece-size-title --piece-size-lead --piece-size-body --piece-size-caption` | a lock size times a plain number | `--font-<role>-size` | yes | no |
| `--piece-size-stat --piece-size-claim --piece-size-title --piece-size-lead --piece-size-body --piece-size-caption` | a lock size times a plain number | `--font-<role>-size` | no | yes |
| `--piece-edge --piece-gap-m --piece-gap-l` | a spacing step, or a multiple of one | `--space-<n>` | yes | yes |
| `--piece-gap-s` | a spacing step | `--space-<n>` | yes | no |
| `--piece-radius` | a radius slot | `--radius-<slot>` | yes | no |
| `--motion-wipe-color` | `var(--piece-accent)` | read by the kit | yes | yes |
| `--motion-blank-color` | `var(--piece-ground)` | read by the kit | no | yes |

The `REPLACE` placeholders in the skeletons are `--REPLACE-ground-slot`, `-ink-slot`, `-rule-slot`,
`-accent-slot`, `-accent-ink-slot`, `-muted-ink-slot` (deck), `-display-family`, `-body-family`,
`-display-weight`, `-strong-weight`, `-display-size`, `-body-size`, `-edge-space`, `-small-space`
(film), `-medium-space`, `-large-space`, `-radius-slot` (film).

Everything below the map reads role names only and holds no colour, family, size, space or radius.
An unfilled `REPLACE` is an undefined variable, so adherence-lint's `css-vars` section reports it as
an ERROR with the exact name; an unfilled map cannot pass. The one arithmetic allowed is scaling a
lock size by a plain number (a film is read across a phone, a slide across a room); the multipliers
are a DECISIONS.md row. If the lock has no step that fits an edge or gap, use a multiple
(`calc(var(--space-8) * 2)`), never a literal. The hairline thickness (`2px`) and a few opacity
and letter-spacing numbers are the literals the skeletons keep; map them if the lock ever declares them.

`--piece-edge` must resolve to a length (`var(--space-8)`, or a multiple of a step), never a bare
number: the piece reads it as the audit margin and stops with a clear error when it is 0 or not a
length, rather than letting the margin check pass on 0px. `piece.js` registers it with
`CSS.registerProperty`, which live play needs (Chromium, Safari 16.4 or newer, Firefox 128 or newer);
the gates run on Chromium, so they are unaffected.

**Keep every box inside the margin.** The kit's layout check fails a rest pose whose element leaves
the `--piece-edge` margin. The skeletons therefore turn nothing (no `data-r`, no `rotate`) on an
element that sits at the edge, such as the top bar's tag; an element that is meant to run off the
frame carries `data-bleed`.

## The motion roles

`piece.js` names six roles, each a lock token NAME, never a literal:

```js
motion: { enter: 'REPLACE', exit: 'REPLACE', cut: 'REPLACE', ease: { enter: 'REPLACE', exit: 'REPLACE', move: 'REPLACE' } }
```

The kit reads `--motion-<name>` (a duration) and `--motion-ease-<name>` (a CSS easing) from
`tokens.css`, which `capture-figma` emits from the lock's `tokens.motion`. Use the names the lock
declares. A lock without `tokens.motion` leaves them as they are: the `tokens` check SKIPs (not
enforced, reported as skipped, never as clean) and the kit's documented defaults run.

## Tempo is free, tokens are not

The look of a piece, and how long each kind of thing takes (an entrance, an exit, a cut, the curve
it follows), come from the lock by token name, so a lock edit moves every piece at once and
nothing is tuned by eye per piece. When things happen is the piece's own choreography and is
free: `data-at`, `data-step`, `data-stagger`, `data-out`, scene lengths, the beat grid, the order
of scenes, which cut each scene leaves by. A literal duration on an element (`data-dur`) is a
finding, except on a `count`, whose length depends on the quantity it counts. A system that wants a
duration nothing declares adds it to the lock first, which is the rule everywhere else.

## Placeholder copy cannot ship

Every text the author must replace is wrapped in a `data-slot` element and starts with the marker
word `TODO`; the speaker notes in a deck's `piece.js` carry it too. adherence-lint's `placeholders`
section reports the marker as an ERROR (in `.html` and in `piece.js`), so the content lint fails until
every line is real copy. Replace the whole line, marker included. A counted number keeps `TODO` as
its text until it is replaced and `data-to` (and `data-suffix`) are set. Do not write the marker word
into a comment of a finished piece either: the lint reads comments.

## Placeholders `motion.mjs new` fills

Exactly four, as plain text in the two files of a skeleton (or of a skill's own template). None uses the scaffolder's double-brace form.

| spelling | where | filled with |
|---|---|---|
| `__TITLE__` | `index.html` `<title>`; `piece.js` first comment line and `title:` string | the `--title` text (HTML-escaped in `index.html`, string-escaped in `piece.js`; a comment-safe form in the comment) |
| `__W__` | `piece.js`: film `width:`, deck `W:`, bare number | the preset's width in px |
| `__H__` | `piece.js`: film `height:`, deck `H:`, bare number | the preset's height in px |
| `__FPS__` | `piece.js`: `fps:`, bare number | `motion.fps` from `formats.json`, or `--fps` |

The deck's id is the piece folder's name, read in `piece.js` from `import.meta.url`, so there is no
fifth placeholder. An unreplaced `__W__`, `__H__` or `__FPS__` is a ReferenceError at load; an
unreplaced `__TITLE__` is harmless text (a string and a comment), and neither it nor a `'REPLACE'`
motion role is seen by adherence-lint. `motion.mjs new` fills all four spellings, and the `tokens`
gate of `motion.mjs check` reports every role that did not resolve to a lock token, so those two
are caught there, not by the lint.

## Film archetypes (canonical order: open, ask, list, end)

`index.html` has four `<section data-scene="...">`, plus a `#bar` outside any scene whose elements stay
for the film (`data-during` limits one to some scenes). `piece.js` gives each scene a length in
beats and the cut that brings it in (the first scene has none).

- **open** translates the `insight` surface (social ARCHETYPES) and the `stats` layout: one figure
  verbatim from a named source, counted up, then its unit and where it comes from. Slots: `kicker`,
  `figure` (+ `data-to`), `unit`, `source`.
- **ask** translates the cover headline lockup: the question the audience already has, in three
  lines sized to their share of the measure by `setup()` in `piece.js` (`data-fit`), the last on an
  accent plate. Slots: `question` (three lines).
- **list** translates the `content` layout: a kicker and three numbered reasons, each with its proof.
  Slots: `kicker`, `number`, `reason`, `proof` (three of each).
- **end** translates the `closing` layout and the `announcement` archetype: the one thing to do, the
  deadline, the line to leave with, where to go. Slots: `ask` (two lines), `deadline`, `line`, `link`.

Outside any scene: `mark` (who speaks) and `tag` (what this film is). Keep or drop scenes freely;
keep the order of intent (a fact, a question, the offer, the ask). Cuts: `cut`, `fade`, `wipe` (a
plate crossing in `--motion-wipe-color`), `push` (with `dir`); their length is the `cut` role.

## Deck archetypes (canonical order: title, points, number, close)

`index.html` has four `<section data-scene="ID">` inside `#stage` (the kit also accepts
`<section class="sc" id="sc-ID">`); each scene is a column on the stage and each element belongs to a
press by `data-step`. `piece.js` lists the scenes with a `label`, `exit` (`cut`, `fade`, `wipe`) and
one line of `notes` per press.

- **title** translates the `cover` layout. Slots: `eyebrow`, `claim` (two lines; the first arrives as
  `words`, the second as a `block`), `speaker`. One press. `curtain` is what is on screen while
  people sit down.
- **points** translates the `content` layout: a heading, then three points, each with its own drawn
  rule, one to a press. Slots: `heading`, `number`, `point` (three each, presses 2 to 4). Four presses.
  Leaves by `fade`.
- **number** translates the `stats` layout: a counted figure, what it measures, its source. Slots:
  `figure` (+ `data-to`, `data-suffix`), `measure`, `source` (press 2). Two presses. Leaves by `wipe`.
- **close** translates the `closing` layout: the one sentence to leave with, a drawn bar, where to find
  the speaker. Slots: `close`, `contact`. One press.

Decks are for a clicker: the speaker presses, the next beat plays, the picture rests. Each press
must change the picture (the `presses` check warns when it does not).

## What to record

DECISIONS.md rows for a motion layer, one per decision that recurs:

- the ROLE MAP: the lock name behind every role, so the next piece starts from it;
- the film and deck size multipliers (`--piece-size-hero`, `--piece-size-title`, ...);
- the motion roles: which `tokens.motion` name each of `enter exit cut` and `ease.enter ease.exit
  ease.move` maps to;
- the tempo choices that recur: the beat rate, usual scene lengths, which cut closes which kind of
  scene, the usual `data-at` rhythm. These are choices, not tokens; record them so a series of films
  reads as one.
