# Motion media: films and presenter-paced decks

Rules for building a short film or a clicker-paced deck as a lock-verified artifact: a piece whose
whole picture is a function of one number, time. Extends `motion-craft.md` (motion inside a
screen) and `slides-and-decks.md` (decks as still screens); brand-neutral, every concrete value
comes from the lock.

## 1. What this is

A time-driven piece is one web page that draws itself from `t`, a count of seconds. The kit
converts a frame number or a press into `t`, finds the scene containing it, and animates whatever
the markup marks. Nothing on the page runs by its own clock.

The engine's pixel gate already asks this of every screen: a frozen clock and no animation in
flight when the picture is taken. A time-driven piece is therefore a family of screens, one per
instant, each drawable alone and in any order; that is what lets it be photographed, checked and
exported to the same file every time.

Two kinds:

- **Film.** Time advances on its own; 20 to 60 seconds. It will autoplay muted in a feed, so every
  piece of information must be on screen as text.
- **Deck.** A press plays the next beat of a second or three; the picture then rests, finished, for
  as long as the speaker talks. Back steps to the previous rest. A venue clicker has two buttons,
  so two must be enough to reach the end.

## 2. Tempo is free, tokens are not

The lock decides every colour, family, size, space, radius, **duration and curve**. The piece
decides **when**.

- Durations come from `tokens.motion.durationsMs` by name and curves from `tokens.motion.easings`
  by name. The kit reads them off `:root` as `--motion-<name>` (a time) and `--motion-ease-<name>`
  (a CSS easing). A piece maps roles to names, never to numbers:
  `motion: { enter: 'standard', exit: 'quick', cut: 'standard', ease: { enter, exit, move } }`.
- Timing is choreography and stays with the piece: `data-at`, scene lengths, the beat grid, which
  cut joins which scenes. No lock can know how long a scene deserves.
- The kit records any unresolved role and any literal `data-dur`; `check` reports them: an ERROR
  when the lock declares `tokens.motion`, a stated SKIP when it does not, as `raw-motion` does,
  because a lock without motion tokens is a capture gap. The kit's defaults keep the piece
  playable, and the report says whose numbers ran.
- A `count` entrance may carry its own `data-dur`, since a number's time depends on its size. Any
  other duration the lock lacks goes into the lock first.

## 3. The method

1. **Brief.** Start from what the user supplied and ask only for the gaps: purpose and channel (they
   fix the frame; read the size from `formats.json`), the single thing to remember or do, the facts
   (from the brief or `BRAND-FACTS.md`, never invented), whose lock, whether faces appear and
   whether those people agreed. For a deck add the audience, the running time and the language.
2. **Storyboard or beat sheet, as a table, before any code.** One row per scene (film) or per press
   (deck): seconds or press, what is on screen, how it arrives, what is said. Get a yes while
   changing it is free. Pacing, with reasons. A feed viewer
   judges within a couple of seconds, so the strongest image goes first and a logo does not.
   Reading costs about 0.3 s a word on top of a line's arrival time. The call to action and its date
   need two quiet seconds after the last arrival to be read at all. A talk counts in presses
   instead: one press per 15 to 40 seconds of speech, each carrying a single idea, a figure
   alone in its own press, and the last press reserved for the line you want remembered.
3. **The look is the lock.** Read the ROLE MAP and the `motion` roles; colour, type and spacing
   arrive through `assets/tokens.css`. A design system describes what a still looks like and leaves
   open how things travel in time, how large they grow and where a camera goes; that gap is the
   piece's room for invention, provided any single frame could pass as a legal still. Skeletons
   carry TODO markers instead of copy; the `placeholders` lint fails until real text replaces them.
4. **Finish one scene completely first.** Show its still; people judge an idea by its finish.
5. **Build.** `node scripts/motion.mjs new --lock L --kind film|deck --id <id>` writes
   `<lockDir>/motion/<id>/` from a skeleton and links the shared `kit`. Scenes are markup,
   entrances are attributes (§5), the look is CSS over lock variables, the order is in `piece.js`.
6. **Look.** `motion.mjs stills` makes contact sheets of every rest, the mid-entrances and strips
   through a move. Per pose: finished? legible at phone size or from the back row? different from
   its predecessor? anything crowding an edge? Pacing is invisible in stills, so say that outright
   and ask a person to watch the export.
7. **Gates, then export.** `motion.mjs check` (§7) must pass before `motion.mjs export` writes the
   MP4 (a deck also gets a handout and a portable folder).
8. **Hand over.** Give the file location, length and size, and a summary of each stretch. Then state
   what stayed unverified: frames were inspected, never playback; audio was not heard; names and
   dates need a second read against the source; any face present; any brand rule bent knowingly.

## 4. Rules for a piece that can be rendered and is worth watching

- **Only time moves things.** Keep out CSS `transition` and `animation`, timers, a private frame
  loop, `Date`, unseeded random and autoplaying video. Each runs on a clock the exporter does not
  control, so live playback and export disagree. `random(seed)` supplies repeatable randomness.
- **No state between frames.** Derive every value from `t` (and `idle`); a per-frame counter makes
  frame 90 depend on whether frame 89 was drawn.
- **Everything travels with the piece:** fonts, data and images sit in the lock directory or the
  kit, never a CDN, because the venue's network cannot be planned for.
- **Fit type to its measure with `fit`, after fonts load;** earlier sizing measures the fallback face.
- **Every movement must carry information,** such as a quantity changing or the subject changing;
  anything else is ornament, which tires the viewer and dilutes the real signals. If a reviewer
  finds the result excessive, shrink travel, angle and overshoot together, starting at one half.
- **Leave stillness after a big moment,** so the next move does not trample it.
- **Fill the frame.** Content sitting low, as on a poster, leaves a moving frame bare at the top;
  centre it between the bottom of any header row and a point slightly above mid-frame.
- **Source every fact,** spell names as their owners do and ship no placeholder text; a viewer
  cannot tell a draft from a claim.
- **Faces need consent.** A portrait being easy to find says nothing about the sitter agreeing to
  appear in a promotion.
- **Rests are finished pictures.** A speaker may stay on one for minutes. Markup guarantees this
  by construction; give code-drawn steps enough seconds.
- **Each press introduces a single element that matches what the speaker is saying,** because a
  second arrival pulls the eye away from the voice.
- **Legible from the back.** At 1920x1080 slide body text is 34 px or more and nothing that matters
  is under 24 px, because the audience sits further away than you do.
- **Finish on the takeaway;** next does nothing on the final pose, so a stray press cannot lose it.
- **Idle motion stays slow and bounded,** so a held pose lives without competing with the voice.

## 5. The grammar

| Attribute | Means |
|---|---|
| `data-fx="<type>"` | Entrance: `fade rise pop words punch slam throw drop count draw drawy block` |
| `data-at="<s>"` | Start, in seconds after its scene begins (film) or after its press (deck) |
| `data-step="<n>"` `data-until="<n>"` | Deck: the press that brings the element in (default 1) / the press at which it is removed |
| `data-out="<s>"` | Film: removed at that scene-local second |
| `data-dur="<s>"` | Replaces the role duration for this element; counted as a literal (§2) |
| `data-each="<type>"` plus `data-at`, `data-stagger="<s>"` | Group entrance, children in turn. Arrivals stagger; departures never do |
| `data-side data-d data-r data-gap` | Type options: side, distance in px, resting turn in degrees, gap between words. `count` reads `data-to data-from data-pad data-fix data-suffix` |
| `data-during="a b"` | Film, outside any scene: visible only in the named scenes |
| `data-over` `data-bleed` `data-keep` | Overlap with neighbours is intended / may cross the frame edge / audit at rest despite having no entrance |

- **Film scenes** are `<section data-scene="id">`, listed as `{ id, dur, cut, draw, rest }`; `rest`
  is the local second when everything has arrived and nothing has left, sampled by stills and layout.
- **Deck scenes** are `<section class="sc" id="sc-ID" data-scene="ID">`, listed as
  `{ id, label, notes, exit, out, hold, steps, curtain }`: `label` names the pose in the presenter
  window and handout; `notes` is one line of speech per press; `exit` and `out` are how the scene
  leaves and for how many seconds; `hold` is how long the automatic export rests on a pose;
  `steps` lengthens a press whose content code draws; `curtain` annotates pose 0.
- **Cuts and exits.** A film scene's `cut` is how it arrives: `cut`, `fade`, `wipe`, or `push` (the
  camera slides on to the next stretch of one long page; `dir` is up, down, left or right). A deck
  scene's `exit` is `cut`, `fade` or `wipe`. Give each kind one meaning: push within a list, wipe
  at a change of topic (a background change hides well under one). Colour the plate from a lock token.
- **Drawing in code.** Per scene `draw(lt, …)`, for the whole film `frame(t, …)`, for a deck
  `draw({ state, scene, lt, t, total, idle, exact, sceneOf })`, where `scene` is the scene id
  string, `idle('id')` returns the seconds that scene has been held (a scene using it is listed in
  `live`, or a held pose is never redrawn), `exact` is true for stills and export, and `prepare(i)`
  runs on arrival at pose i to load what comes next. Every value is computed from `lt` and `idle`.
  `fit(el, width, opts)` runs in `setup`. `beats(bpm)` returns a function: `beats(80)(6)` is the
  seconds in six beats, so scenes can be lengths of whole beats. Layouts that use chance are
  generated once, in `setup`, from `random(seed)`.
- **Entrances own `translate`, `scale` and `rotate`** (some `transform` too): put an element's own tilt
  on a wrapper. Extra types go through the `fx` option; each must land exactly at rest and assign
  every property it touches on every call, or state leaks into the next frame.

## 6. Recipes

- **Odometer.** A rolling count is one narrow window per digit place, each showing part of a tall
  strip of numerals. Translate each strip by an eased function of `lt`; the tens strip starts only
  as the units reach nine. Give strips `display: block` or the transform is ignored, and read the
  window height once, in `setup`.
- **Camera down a tall page.** Chain `push` cuts, or ease one tall inner element upward by `lt`.
- **Slammed lockup.** Build a title card whose lines hit the frame from alternating sides
  (`data-fx="slam"`), each sized in `setup` to span the whole measure, with the closing line on a
  plate that pops in. Lines are meant to touch, so the group takes `data-over`; keep a few pixels
  between rows, because spacing under 0.9 line-height makes descenders collide.
- **Wall of portraits.** A parent with `data-each="pop" data-stagger=…` over square images; consent first (§4).
- **Zoom through a shape.** To fly into a ring or doorway, scale it about a pivot placed on its
  opening (measured in `setup`) with a curve that speeds up, until the opening exceeds the frame;
  cut on that frame.
- **Ground that breathes.** Soft colour blobs offset by a sine of `t` in `frame(t)`; slow, little blur.
- **Recording.** Numbered frames through `clip`, not `<video>`, so any frame is addressable. Live,
  show the nearest decoded frame; in exact mode await the precise one. End on a settled frame.
- **Chart.** Draw it from `lt` on a canvas, or as SVG with attributes set each frame. A library that
  tweens by itself breaks the first rule; if unavoidable, disable its animation and feed it `lt`.

No fireworks, confetti or particle showers: ornament fails the information rule in §4.

## 7. What the gates see and what they cannot

`motion.mjs check --lock L --id <id> [--json]` runs these in order, one line each
(`pass|FAIL|WARN|SKIP  <name>: <detail>`), then `RESULT: PASS|FAIL`.

| Gate | What it establishes | Level |
|---|---|---|
| `loads` | The page loads with no console error | FAIL |
| `offline` | Nothing was requested outside the lock tree, the kit and the engine; `render.allowHosts` is honoured | FAIL |
| `fonts` | Every lock `fontChecks[]` passes `document.fonts.check()` and the metric probe (the check alone is true for a family with no `@font-face`) | exit 4 |
| `pictures` | Every `<img>` decoded | FAIL |
| `tokens` | Every role resolved by name; no literal `data-dur` | FAIL, SKIP without `tokens.motion` |
| `lint` | `adherence-lint` over the piece directory: raw hex, off-scale spacing, raw times in the CSS, `placeholders` | FAIL on ERROR |
| `self-time` | A static scan of the piece's own source for `Date`, `Math.random`, timers, `requestAnimationFrame`, `performance.now` | WARN |
| `determinism` | Sampled instants are byte-equal across three drawing orders (below) | FAIL |
| `layout` | At each rest nothing that arrived lies outside the margin (FAIL) or overlaps without `data-over` (WARN) | FAIL / WARN |
| `presses` (deck) | Every press changes the picture; two byte-identical consecutive poses warn | WARN |
| `clicker` (deck) | Live, by keyboard: next alone walks every pose, a burst skips none, back returns, a reload returns to the hash | FAIL |
| `frame-time` | Per-frame draw time on this machine against `--budget-ms`; it measures the machine, not the piece | WARN, never FAIL |

**What `determinism` samples.** A film: per scene its start plus 0.4 s, its midpoint and its rest;
`--every <s>` adds a dense probe at that spacing. A deck: every pose. It catches CSS transitions and
animations, accumulated state and a property one scene sets and another assumes. Frames between the
samples are reproducible by the first rule of §4 (a pure function of `t`), not by proof. The harness
freezes `Date` and seeds `Math.random`, so the probe cannot see them: a piece reading either exports
consistently yet plays differently live. `self-time` flags the common spellings; being a static
scan, it misses aliases and imported code.

**Exit codes** follow CONTRACT: 0 pass, 1 a gate finding, 2 setup or usage (no ffmpeg for export,
bad flags, unknown piece, unreadable lock, kit missing), 3 `DIMENSION_MISMATCH` (a rest pose run
through `verify` whose render size differs from its reference), 4 `FONT_PARITY`, 5 render failure.

**What no gate verifies.** Pacing, sound and the feel of motion are judged by a person watching the
export or are not judged. A green `check` says the piece reproduces at the sampled instants and
respects its margins, not that it is good to watch; say which of the two you did. It also does not
test disclosure presence: a film is not a product flow, so `check` skips that lint with a note. A
legal line the piece must carry is guaranteed by the content lock and the author, not by this gate.

The pixel gate reaches motion in one way: a rest pose can be a lock screen with a reference,
`url: motion/<id>/index.html?tool&t=<s>` (deck: `?tool&pose=<i>`). The tools and `render.mjs` start
the browser with file access enabled so such a page can import the kit from disk, which is what
gives that screen the whole pixel gate, geometry and census. The reference comes from the design
tool or a real capture, never your own render; a pose without one is net-new, covered by lint,
determinism and layout, and the report says so. Rests with a reference are pixel-gated, sampled
in-betweens are checked, and the remainder is reviewed by a person on contact sheets.

## 8. Presenting and takes (deck)

- Open a piece through `motion.mjs serve --lock L [--open]` (the other verbs load it themselves).
  Double-clicking `index.html` cannot work: the browser refuses to import the kit's modules from a
  plain file page. Use Chrome or Edge; F goes full screen, and a clicker's start button (F5) is
  mapped to that, never to a reload. The address records the pose (`#12`), so a refresh returns to it.
- Two buttons finish a talk. Pressing mid-beat snaps that beat to its end and holds there, so no
  pose is ever jumped over. Page keys, arrows, space and enter advance or go back; a full stop or B
  blanks; Home and End jump; W opens the presenter window; R toggles a take. Only advance and back
  are needed during the talk.
- The presenter window shows the current note, the next pose from `.motion/<id>/stills/` (run
  `stills` first), the pose number and an elapsed timer started by the first press.
- A **take** records presses and microphone in a rehearsal, saved under `.motion/<id>/takes/<stamp>/`
  via `serve`; `export --take latest` replays that performance frame by frame with the voice under it.
  Without microphone permission the presses are still recorded.
- Takes and the presenter window need the server; `export --pack` writes a folder to carry. A venue
  machine may be slower: run `check` there, or limit the busiest beat.

## 9. Failures and their fixes

| Sign | Reason and remedy |
|---|---|
| `determinism` fails at a second or a pose | The frame there depends on something other than `t`: CSS transitions or animations, a value accumulated per frame, or state that one scene sets and another relies on. Derive it from `lt` and `idle`, and let every scene set what it needs itself. The finding gives the differing pixel count; a small count points at one small element |
| `self-time` warns | The piece's own source reads the clock, chance or a timer. The export will look right and live playback will not; replace with `lt`, `idle` or `random(seed)` |
| `tokens` FAIL, or `lint` FAIL on a colour, size or time | A role names something the lock lacks (correct the name, or add the duration to the lock first), or a literal stands where the lock has a token (use the role or take the lint's suggestion) |
| A transform has no effect, an entrance clashes with the element's tilt, or type is wrong on the first frame only | The element is inline, or sets `rotate`, `scale` or `translate` itself (make it `block`, use `data-r`, add a wrapper), or its size was computed before the fonts arrived (compute it in `setup`) |
| `fonts` exits 4 | A lock face is not loaded by the page. Add the `@font-face` with its files; a weight beyond a variable font's range fails the same way |
| `layout` flags an element that looks inside, or plates that should overlap | A tilted or skewed box is wider than its text, so pull it in, or use `data-bleed`. For intended overlap use `data-over` |
| `presses` warns, `clicker` FAIL | Two poses look identical, so a press did nothing a viewer can see: fold it into its neighbour or add a visible change. `clicker` fails on a zero-length press or a `draw` that throws at some pose: add `steps` or content and inspect it with `stills --only N` |
| `offline` FAIL | A resource is fetched over the network. Ask the user, then store the file beside the piece and reference it by relative path |
| Soft picture, or emoji that differ elsewhere | The MP4 was scaled (set the real size in the piece), or emoji came from the system font (use inline SVG) |

## 10. 3D and heavy media

The engine ships no 3D library: it is megabytes for an optional feature. If space itself carries
meaning, the skill installs three.js in the skill, as print helpers install their dependencies.
Fix the renderer size at pixel ratio 1, keep the drawing buffer in tool mode so stills can read it,
and upload textures when they load. Flat scenes cost less and usually explain more; 3D comes last.
Geometry is rarely what drops frames: large `filter: blur` or `backdrop-filter` over big moving
areas, stacks of full-frame layers and a recording re-uploaded each frame are.

## Related

- `references/motion-craft.md`: durations, curves and reduced motion
- `references/slides-and-decks.md`: the deck's grammar as stills
- `references/event-screens.md`: screens shown in the room
- `references/pixel-diff-tuning.md`: a registered rest pose that will not converge
- `references/scope-contract.md`: what a motion piece puts in CHANGES and FROZEN
