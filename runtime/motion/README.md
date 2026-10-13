# runtime/motion — the motion kit

The browser runtime for time-driven pieces: **films** (time runs) and **clicker decks** (presses run time). The
whole picture is a pure function of one number, so any frame can be drawn alone, in any order, and come out the
same. It lives once, here; a skill reaches it through the `kit` symlink `motion.mjs new` creates
(`<lockDir>/kit → <engine>/runtime/motion`), and a piece loads `../../kit/film.css` or `deck.css`, then
`../../assets/tokens.css`, its own `<style>`, and `<script type="module" src="piece.js">`.

| File | What it is |
|---|---|
| `time.js` | clamp/lerp/ramp, curves (`expo inout easeIn spring soft`), seeded `random`, `beats(bpm)`, the CSS easing evaluator `easing()`, `duration()`, `readMotionTokens()` |
| `entrances.js` | the one entrance registry (both kinds), `fit`, `splitWords`, the rest-pose `layoutAudit` |
| `film.js` · `film.css` | `film(def)` and the film frame |
| `deck.js` · `stage.js` · `deck.css` | `deck(def)` builds the poses; `mount(deck)` runs them (tool or live) |
| `clock.js` | presses → time (`createClock run auto rest`) |
| `clip.js` · `keys.js` · `presenter.html` | a recording as numbered frames · the clicker key map · the presenter window |
| `*.test.mjs` | `node --test "runtime/motion/*.test.mjs"` (Node 24 refuses a bare directory argument) |

## Tool-mode contract (what every tool may rely on)

1. **Open** `index.html?tool&t=<s>` or `?tool&frame=<n>` (film), `?tool&pose=<i>[&idle=<s>]` or `?tool&frame=<n>`
   (deck; frames of the automatic film). No HUD, keys or loop are installed.
2. **Readiness.** The kit awaits `document.fonts.ready`, runs `setup`, draws the frame, waits for fonts again and
   decodes every `<img>` (what setup and the hooks built only starts loading once laid out), draws the frame once
   more, then sets `data-render-ready` on `<html>` — the only readiness signal. A piece that throws sets
   `data-motion-error="<message>"` and never becomes ready. **Without `?tool`** the page is for a person: it sets
   `data-motion-live` and never `data-render-ready`, so a screen url that forgot `?tool` times out (exit 5) instead
   of capturing the HUD; a tool driving live mode (the clicker gate) waits for `data-motion-live`.
   A `data-render-ready` already present in the markup is removed at boot in tool mode, so only the kit's counts.
3. **`window.__motion`** — film `{ kind: 'film', meta, at(t), frame(n), audit() }`; deck `{ kind: 'deck', meta,
   pose(i, idle), film(take), frame(n), audit() }` (live adds `state() stats() act(k)`). **`at`, `frame` and `pose`
   return promises**: they resolve after the draw hooks (called with `exact: true`) have settled and two animation
   frames have painted (the first paint after a large change can rasterise differently). Every tool awaits them before a screenshot.
4. **`meta`** carries `picturesMissing` (failed images by URL; an `<img>` with no source is named, never `""`) and
   `motion` `{ resolved, unresolved, literals }`. Deck pose labels read `"<label> (k of n)"` for a scene with
   several presses and `"<label>"` for one; pose 0 is `"Before the first press"`. A take (`film(take)`) carries
   `start` and `blank`, the screen state when it began.
5. **Scenes are shown by attribute.** The scene on screen carries `data-on`; kit CSS hides every
   `[data-scene]` / `.sc` without it (`display: none !important`). The kit never writes a scene's `display`, so the
   piece's own rule (`display: flex` for centring) lays the shown scene out.
   **Setup sees every scene:** a deck's `#stage` is sized W×H before setup (at 0,0 in tool mode); `fit()` measures a
   row's text extent plus its padding, so a block heading fits without `.ln`; film and deck both take `setup({ W, H, fps, scenes })`; while it runs all listed scenes carry `data-on`, so `fit()` and
   other measurements see real boxes; the first draw then leaves only the scene on screen switched on. `deck()` is
   therefore async: `await mount(deck({…}))` (mount also accepts the promise).
6. **Loose layers.** Entrance and `data-keep` elements outside every scene (an overlay bar) get
   `will-change: transform` from the kit at collect time, so their text is rasterised on its own layer and does
   not pick up antialiasing from what a push or wipe moved under it earlier.
7. **How tools launch.** Chromium needs `--allow-file-access-from-files` to load the kit's ES modules over
   `file://` (or serve the lock directory). For frames that are byte-identical in any drawing order, `motion.mjs`
   launches with BOTH `--disable-gpu-rasterization` and `--disable-partial-raster`: GPU rasterisation leaves rotated
   edges a level apart depending on drawing order, and partial raster (re-using old tile content) leaves a few
   pixels apart even in software. The pixel gate's render.mjs is unchanged. `motion.mjs` also launches with
   `reducedMotion: 'no-preference'`: a film is a video, so reduced motion is the viewer's player's business — under
   'reduce', a lock's `prefers-reduced-motion` token override would be what the export renders while viewers play
   the normal value. A rest pose is at rest either way.
8. **Not awaited:** CSS `background-image`s. Readiness waits for fonts and `<img>` elements only; a picture a piece
   needs before the first frame belongs in an `<img>` (or preloaded by `setup`).

**Attribute grammar** (one for both kinds):

| Attribute | Meaning |
|---|---|
| `data-fx` | `fade rise pop words punch slam throw drop count draw drawy block` (+ the piece's own `fx`) |
| `data-at` | film: seconds into the scene (outside scenes: into the film) · deck: delay after its press |
| `data-step` / `data-until` | deck: the press it belongs to (default 1) / gone from the moment press n begins |
| `data-out` | film: leaves at that second (an opacity fade on the `exit` role) |
| `data-dur` | overrides the role duration — recorded in `meta.motion.literals` (not on `count`, whose length is choreography) |
| `data-each` `data-stagger` | a group: every child gets the entrance, `stagger` s apart (default 0.08) |
| `data-side data-d data-r data-gap` | slam/throw side, travel px, resting turn deg, seconds between words |
| `data-to data-from data-pad data-fix data-suffix` | count |
| `data-during` · `data-over` · `data-bleed` · `data-keep` | film: show only in those scenes · exempt from the overlap test · exempt from BOTH audit tests (decoration that runs off the edge) · audit without an entrance |

`rise` on an element holding `<span class="mask"><span class="mv">…</span></span>` rises from behind its own edge.
Scenes are `<section data-scene="id">`; a deck also accepts `<section class="sc" id="sc-id">` inside `#stage`.
The layout audit measures an element's box joined with its sized descendants' boxes and the reach of its text (sideways
always, up or down past half a line), so a nowrap line running out of its own box, or a
`width: max-content` line running out of its heading is caught. A group's `data-dur` is one literal, recorded on the group. In a deck, `data-fx`, `data-each` or `data-dur`
outside every scene is an error (nothing would draw it).

**Roles → tokens.** A piece names roles, `motion: { enter, exit, cut, ease: { enter, exit, move } }`, each a lock
token NAME; the kit reads `--motion-<name>` (`150ms`, `0.15s`, or a bare number of ms) and `--motion-ease-<name>`
(`cubic-bezier()`, `linear()`, `steps(<integer>[, <jump>])`, a keyword) from `:root`. `source: 'token'` means
only "read from a custom property" — a piece could define `--motion-*` itself — so `motion.mjs check` compares each
resolved value with the lock's `tokens.motion` by name; `raw` keeps the string read, also when unparseable. Each type lasts `enter` × its factor (fade 0.8,
rise 1.2, pop 0.9, words 1.1/word, punch 1.0/word, slam 1.0, throw 1.4, drop 1.2, count 1.8, draw 1.4, drawy 0.8,
block 1.8); cuts and exits scale the `cut` role; leaving and the clicker's hurry use `exit`. Opacity tweens on
`ease.enter`, except where a type switches it in one step (slam is opaque from its first instant; block's text
appears at the half-way cover); spatial moves spring only while `ease.enter` is the kit default — a lock curve
wins. A piece's own `fx` types may not reuse a built-in name (the kit refuses it). They are timed by their `factor` × `enter`, but any seconds written inside their
`apply` are the piece's code and appear in no literal record. Defaults, used
only for an unresolved role (listed in `meta.motion.unresolved`): enter 0.5 s, exit 0.3 s, cut 0.34 s, ease.enter
expo, ease.exit easeIn, ease.move inout. **Tempo is free, tokens are not:** when things happen (`data-at`, scene
lengths, beats, holds) is the piece's choreography; how long a move takes and its curve are the lock's.

**Colours the piece sets** (the kit CSS has none): `--motion-wipe-color` (the wipe plate), `--motion-blank-color`
(the blank screen and the letterbox around a deck), `--motion-block-color` (the `block` plate; falls back to the
wipe colour). A take (R in live mode, served by `motion.mjs serve`) is POSTed as
`/__take/<deck>/<YYYYMMDD-HHMMSS>/take.json` (+ `voice.webm`) with `start` (pose), `blank` (the screen state when it
began) and its press `events`; `film(take)` replays it from both. The presenter window shows the next pose from `<lockDir>/.motion/<id>/stills/NN.jpg` (two-digit
pose index). **three.js is not bundled**: a skill that wants 3D runs `npm i three` in its own directory and imports
it from `piece.js` by relative path (or an import map in `index.html`), so it travels with the piece offline.
