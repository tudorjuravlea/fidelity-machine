# Device mockups: screens, mockups and prototypes on a phone, a tablet or a notebook

Rules for presenting a screen on a device inside a film or a clicker deck: the pose, the height,
the ground, the entrances, a prototype playing on the glass, and the zoom to where the action is.
Extends `motion-media.md` (the piece as a function of time) and `motion-craft.md` (the lock owns
durations and curves). Brand-neutral: the slabs are generic forms drawn from today's proportions,
with no maker's name or trade dress, and every colour, tilt and ceiling comes from the lock's
`tokens.devices` block through the piece's role map.

The module is `runtime/motion/devices.css` (the slabs, the pose and height rules, the ground, the
zoom's rest) and `runtime/motion/devices.js` (the entrances that land on the tilt, the zoom pose
and its bound, the camera stops); the analyser is `scripts/activity.mjs`; the worked example is
`fixtures/motion/motion/golden-devices`, gated by `motion.mjs check` like every piece, with
`devices-zoom-outside-margin` as the negative that proves the bound is a gate.

## 1. The rules

### The pose

| Situation | Class | Rest pose |
|---|---|---|
| one device, the left half of the frame, content on its right | `.device--left` | `rotateY(+tilt)` under `perspective(1800px)`: the right edge goes back, the face turns toward the content |
| one device, the right half | `.device--right` | `rotateY(-tilt)` |
| one device, centred, nothing beside it | `.device--centre` | flat |
| two, three, four or more devices | a `.device-row` around them | flat, every one |
| a tilt asked for inside a row, or a solo device the brief wants the other way | `.device--tilt-r`, `.device--tilt-l`, `.device--flat` on that device | the request wins over both rules |

The tilt is the lock's `tokens.devices.tiltDeg` (10 by default). Positive `rotateY` sends the
right edge back, so the face points right: that is "tilted to the right". The same rule in edges,
as the owner states it (2026-10-27), is the form a reader can check on a still: **a device on the
left of the frame lowers its right edge** (the far edge, the one toward the rest of the frame,
reads shorter than its left edge, never taller); **a device on the right lowers its left edge**.
It was checked on a render, not by reasoning: in the golden's first scene the phone's left edge
measures 952 px tall and its right edge 912 px, and an ink column at 70 % of its width is 918 px
tall against 939 px at 30 % (section 8). A ten-degree tilt cannot be told by eye, and
`getBoundingClientRect()` cannot tell it either (it returns the axis-aligned box): sample two
columns. The direction is guarded by a test, not a sentence: `runtime/motion/devices.test.mjs`,
"the rest pose faces the content", reads the signs out of `devices.css` and projects the slab
under `perspective(1800px) rotateY(±tilt)` with the browser's own matrix, so a flipped rule fails
the suite.

The rest tilt is the `.device__body`'s own `transform`. The kit's entrances (`rise`, `fade`, `pop`)
write `translate`, `scale` and `opacity` on `.device`, outside the body, so they can never flatten
it; the three device entrances (section 4) write the body's transform and end on the tilt exactly.
An entrance whose last frame were `transform: none` would flatten the device, which is the trap
this construction removes.

### The height

A device is placed by its top and takes the band from there down to the frame's bottom margin as
its height, unless the width it may use bounds it first:

    height = min(band, maxWidth / aspect)        band = --dv-bottom (or H - --dv-foot) - --dv-top

The piece sets `--dv-top` and `--dv-foot` (or `--dv-bottom`) on the scene, and `--dv-max-w` when the
device shares its width with copy, never a height. In a row every device inherits the row's band.
A notebook is the same rule at its 1.748 aspect, so it is width-driven: the band's height times
1.748, capped by the width available. It is never cropped by the margins (the layout gate measures
it at rest) and never overlaps another element (the same gate warns).

A tilted slab's near edge grows under the perspective: for a phone 952 px tall at 10 degrees the
near edge projects about 2.4 % taller than the layout box. The body is therefore inset by that
growth, `aspect × height × |sin tilt| / 2 / 1800px` each side, so the projected slab stays inside
the layout box and the layout box is what the audit measures. On the golden's phone that inset is
10.4 px top and bottom, 5 px each side.

### The ground

A device shown alone prefers a coloured half: `.device-ground` (the left half) or
`.device-ground--right` (mirrored), an `<svg viewBox="0 0 1 1" preserveAspectRatio="none">` whose
`<path>` takes the lock's freeform as its `d` and `tokens.devices.ground.panel` as its fill
(`.device-ground--alt` takes `ground.alt`). The engine ships the plain half (`M0 0H1V1H0Z`) as the
default; a brand's own shape (a chamfer, a notch) is `tokens.devices.ground.path`, SVG path data
in a 0..1 box, and the right half is the same path mirrored. Two or more devices stand on the plain
ground. The half is decoration (no entrance), so the audit does not measure it, and it may run to
the frame's edge.

### The device stays whole

No cut-away or sliced device (the frame masked out between a top cap and a bottom cap, so that a
part of the screen floats between two hairlines), by the owner's instruction of 2026-10-27: a
walkthrough's device is whole and flat, and a close-up on one control is the static zoom
(`armZoom` with one fixed segment, section 6), which keeps the device whole. The engine never
carried such a layout (`runtime/motion/` has no `cut-top`, `sliced` or `mask-image`, checked the
same day); a port of a walkthrough layout from elsewhere must not bring one in.

## 2. The lock block

```json
"tokens": {
  "devices": {
    "finish": { "body": "text1", "rim": "border", "glass": "text1" },
    "tiltDeg": 10,
    "ground": { "panel": "accent-subtle", "alt": "surface1", "path": "M0 0H1V1H0Z" },
    "zoomMax": 1.4,
    "kinds": ["phone", "tablet", "notebook"]
  }
}
```

`finish` and `ground` name colour slots of `tokens.colors`, never values. `capture-figma --derive`
emits them into `assets/tokens.css` as `--device-body`, `--device-rim`, `--device-glass`,
`--device-ground`, `--device-ground-alt` (each `var(--<slot>)`, so a dark block re-colours them),
`--device-ground-path` (`path('…')`), `--device-tilt` (`10deg`) and `--device-zoom-max` (`1.4`); a
name that is no slot is warned and left out, and the css-vars lint then names the missing variable
in the piece. The piece maps them in its role map:

```css
--piece-device-body: var(--device-body);   --piece-device-rim: var(--device-rim);
--piece-device-glass: var(--device-glass); --piece-device-screen: var(--surface1);
--piece-device-ground: var(--device-ground); --piece-device-ground-alt: var(--device-ground-alt);
--piece-device-ground-path: var(--device-ground-path);
--piece-device-tilt: var(--device-tilt);   --piece-device-zoom-max: var(--device-zoom-max);
--piece-device-gap: calc(var(--space-8) * 2);   /* between the devices of a row: a lock step */
```

`devices.css` names no colour of its own (like `film.css`): the rim's glints and the shadows are
`color-mix()` blends of the rim and the body with transparent; hairlines and shadows are fractions
of the frame height; the slab's parts are fractions of its own width.

## 3. The markup grammar

```html
<!-- a phone alone on the left, turning in -->
<div class="device device--left" data-fx="turn" data-at="0.2">
  <div class="device__body"><div class="device__shell"><div class="device__screen">
    <canvas class="device__media" width="390" height="844"></canvas>     <!-- or <img class="device__media"> -->
  </div><i class="device__island"></i></div></div>
</div>

<!-- a row of three, flat, rising one after the other; every child inherits the row's band -->
<div class="device-row" data-each="rise" data-at="0.7" data-stagger="0.35" data-d="80">
  <div class="device">…</div>
  <div class="device device--tablet">…</div>
  <div class="device">…</div>
</div>

<!-- a notebook: the lid is the shell on a hinge, the deck below; the lid opens as its entrance -->
<div class="device device--notebook device--centre" data-fx="lid" data-at="0.3">
  <div class="device__body"><div class="device__hinge"><div class="device__shell"><div class="device__screen">…</div><i class="device__island"></i></div></div><div class="device__deck"></div></div>
</div>
```

- **Kinds.** `.device` alone is a phone (a 1752 by 3668 slab, the screen inset 3.48 % of the width
  all round, corners 18.1 % / 8.6 %, five keys, a lensed island). `.device--tablet` is a 0.73 slab
  with an even 4.6 % bezel and a camera dot in the top bezel; `.device--land` turns it landscape.
  `.device--notebook` is a lid on a tapered deck with 9.3 % overhangs. `.device--plain` hides the
  island when the picture already shows the device's own top edge; `.device--matte` removes the
  glass reflection for a picture whose colour must stay exact. The lock's `kinds` says which a
  system allows.
- **The band.** `[data-scene] { --dv-top: …; --dv-foot: …; }` once per scene; `--dv-max-w` when the
  device shares its width with copy; a head above a row or a zooming device keeps a fixed height
  (`--piece-head-h`) and the band starts under it. A piece never names the kit's `--H` itself.
- **The screen.** Whatever is inside `.device__screen` is clipped to the glass; a picture or a clip
  covers it edge to edge (`object-fit: cover`), so crop a recording to the screen's aspect first (a
  9:19.5 recording for a phone). A status bar, if wanted, is part of the picture.
- **The ground.** `<svg class="device-ground" viewBox="0 0 1 1" preserveAspectRatio="none"><path></path></svg>`
  before the device; `.device-ground--right` for a right device.

## 4. Entrances

| `data-fx` | Motion | Timed by |
|---|---|---|
| `rise` (kit) | up into place, `data-d="80"` for the 80 px a device rises | the `enter` role × 1.2 |
| `slide` | in from the device's own side: the left for a device turned right, the right for one turned left, `data-side` for a flat one; 1.2 device widths | the `enter` role × 1.0 |
| `turn` | starts 24 degrees further round than the rest tilt, signed with it (a flat device turns in from the right), and settles on it | the `enter` role × 1.3 |
| `lid` | a notebook: the lid tips back 80 degrees and opens on its hinge while the device fades in | the `enter` role × 1.4 |

`slide`, `turn` and `lid` are `deviceFx`, passed as the piece's `fx` to `film()` or `deck()`; their
durations are the lock's `enter` role times a factor and their curve is the lock's entrance curve,
like a built-in (no literal duration anywhere; `data-dur` would be a tokens finding). A row takes
`data-each="rise"` with a stagger. A zooming device takes `fade` (or `data-keep`), never a spatial
entrance: the zoom writes `translate` and `scale` on `.device` itself.

## 5. A prototype on the screen

The recording is the kit's clip (`runtime/motion/clip.js`): numbered frames addressed by index, so
frame n is a function of the seconds into the clip and the determinism gate holds. No `<video>`,
no autoplay. The piece draws the frame onto a `<canvas class="device__media">` from the scene's
`draw(lt, { exact })` hook: in tool mode the frame itself is awaited (`rec.exact(n)`); live, the
closest decoded frame at or before it is drawn. A folder of JPEG frames with a `clip.json`
(`fps`, `frames`, `width`, `height`) is the delivery form; `fixtures/motion/make-prototype-clip.mjs`
writes the golden's synthetic one.

## 6. The zoom to the action, on request only

Given segments `[{ t0, t1, u, v, z }]` (seconds into the clip, the point on the screen as 0..1
across and down, the scale asked for), the device grows around each segment as the clip reaches
it, dwells across it, pulls back to 1.08 between segments more than 8 % of the clip apart, and
returns to scale 1 at the end; a lead-in of 8 % and a tail of 12 % are stops no segment may enter;
the camera eases inout between stops. The pose is a scale about the device's centre plus the one
translation that keeps the action point exactly where it rested,

    dx = (px - cx) * (1 - s)      dy = (py - cy) * (1 - s)

so the pose at scale 1 is the identity and nothing moves at rest. **The device never travels with
a tap: only the zoom moves.**

**The bound.** The scaled device must stay whole inside the margins and its own band (the room the
height rule gave it, never a title above or a footer below):

    fit = 0.99 * min(roomW / restW, roomH / restH)

is the ceiling; a request past it is cut to it (floored to the thousandth, never rounded up), and
the translation is clamped so the scaled box stays inside. A device that fills its band has a fit
of 0.99 and cannot zoom, so **a zooming device rests at the band divided by `zoomMax`** (1.4),
centred in the band (`devices.css`, `.device[data-zoom]`), and grows to the band's edges and no
further. The rest is measured from layout offsets (`offsetLeft`, `offsetTop`, `offsetWidth`,
`offsetHeight`, summed up to the scene), never from `getBoundingClientRect`: a client rect read on
the film's first frame is mid-entrance (80 px low for a rise), and every zoom would then be
computed from a rest that does not exist.

```js
import { deviceFx, armZoom } from '../../kit/devices.js';
let zoom;
await film({ …, fx: deviceFx,
  setup() { zoom = armZoom(document.getElementById('proto'), { duration: 8, margin: edge }); },   // segments from data-zoom
  scenes: [{ id: 'proto', dur: 10, rest: 2.1, draw(lt, { exact }) { zoom.at(lt - 0.6); return paintFrame(lt - 0.6, exact); } }],
});
```

`armZoom` reads the segments from the element's `data-zoom` JSON (or `segments`), takes the room
from the frame margins and the device's band (its rest height times `--piece-device-zoom-max`,
centred on its rest; or `bounds: { x0, y0, x1, y1 }` for a device beside copy), and returns
`{ rest, screen, bounds, stops, fit, at }`. `at(seconds)` is called from the draw hook with the
seconds into the clip, so the zoom is a function of film time: never a frame callback, never a
clock. Set the scene's `rest` on a dwell, so the layout gate audits the device zoomed.

**The analyser.** `node scripts/activity.mjs <clip | frames-dir> [--rate <fps>] [--windows]`
prints the segments for `data-zoom`. It decodes 96 px wide at 6 fps, differences consecutive grey
frames on an 8 × 16 grid aligned with the clip's long axis, cuts the clip into 1 s windows, keeps
a window above a mean abs-diff of 0.25 per cell per frame and 1.5 % of the clip's peak window
energy, rejects a window with more than half its cells hot (a scroll, a crossfade), takes the
energy-weighted centroid of the hottest cells as the point and their spread as the scale (2.0 for
a tight burst down to 1.25 for diffuse motion, spread 0.08 to 0.4), and merges adjacent windows
within 0.12 of screen and 0.25 of scale. The bars are set for a slide, not a film: a tap measures
about 2 to 3 % of a sheet sliding in, and a slide wants the taps. A control the size of a toggle
measures about 0.1 and stays below the bar: its stop is written by hand. `--windows` prints every
window's energy, intensity, hot-cell share, centroid and spread, which is how a bar is tuned.

## 7. What was taken from each source, and what was deliberately not

Three of the author's own repositories were read and re-derived; nothing was copied.

| Source | Taken | Not taken, and why |
|---|---|---|
| Motion-Machine, `patterns/devices/phone` and `devices/laptop` | the generic slab proportions (1752:3668, the 3.48 % inset, 18.1 % / 8.6 % corners, five keys, the lensed island; the notebook's lid on a tapered deck with 9.3 % overhangs, aspect 1.748); the finish built from palette roles; the entrance as a rise of 80 px with a settling `rotateY` under `perspective(1800px)` | `patterns/3d/phone` (Three.js): a slide's device is a frame for a screen, not the scene's hero; there its entrance ends upright and flat, here it ends on the rest tilt |
| MockupAnimate, `src/showcase/looks.js` (`autoAction`) | the camera visits each segment's point and zoom, dwells across `[t0, t1]`, pulls back a little between segments more than 8 % apart, returns to the rest framing at the end, with a lead-in of 8 % and a tail of 12 %; the "never side-cropped" fit bound and `--contained` (the whole device stays in frame) | the device travel: it moves the device up and down so the action lands mid-frame; here the device never travels with a tap, only the zoom moves |
| MockupAnimate, `scripts/analyze-activity.mjs` | ffmpeg decoding small grey frames, the 8 × 16 grid on the long axis, windows kept above an absolute bar and a share of the peak, rejected when more than half the cells are hot, the energy-weighted centroid and spread, the merge of adjacent windows | its bars (64 px, 4 fps, 1.5 s windows, 1.0, 18 %): right for a film that wants the big beats; a slide wants the taps, which those bars drop |
| a private client skill (read as the worked design brief only) | the three rules as decrees: the pose, the height, the ground; the bound as a gate; the rest from layout offsets; the zoom resting at band / zoomMax | its brand tokens, its notched panel path, its colours and names: re-derived in engine terms, a brand's shape becomes the lock's `ground.path` freeform |

## 8. Verification recipe, and the numbers measured

```sh
node --test "runtime/motion/*.test.mjs"                                                   # the pure half: zoomPose, stops, camera, entrances
node scripts/motion.mjs check --lock fixtures/motion/design-lock.json --id golden-devices   # every gate, 0 errors, 0 warnings
node scripts/motion.mjs check --lock fixtures/motion/design-lock.json --id devices-zoom-outside-margin   # layout FAIL, nothing else
node scripts/motion.mjs stills --lock fixtures/motion/design-lock.json --id golden-devices  # then LOOK
node scripts/activity.mjs fixtures/motion/assets/prototype-clip --windows                 # the bars on the synthetic clip
```

Measured on 2026-10-26, the golden at 1920 × 1080, margin 64, with the pinned Chromium:

- **The analyser on the synthetic clip** (80 frames, 10 fps, 390 × 844): the tap window at 1 to 2 s
  measures intensity 0.29 and energy 225, 2.2 % of the sheet's peak window (10436 at 4 to 5 s), and
  survives; the sheet gives three adjacent windows (3 to 4 s at 4.32, 4 to 5 s at 13.59, 5 to 6 s at
  0.66), kept apart by their centroids; the toggle at 6 to 7 s measures 0.12 and is dropped, so its
  stop `{ t0: 6.5, t1: 7.3, u: 0.19, v: 0.09, z: 1.8 }` is written by hand. The same clip as an
  mp4 gives the same segments.
- **Scene 1, the solo phone:** rest box 252.6 to 707.4 across, 64 to 1016 down, the full band from
  the top margin to the bottom one; the body inset 10.4 px top and bottom and 5 px each side for
  the near edge; the left edge 952 px tall, the right edge 912 px: the right edge is the shorter
  one. On the still, the face turns toward the copy on its right and the slab sits on the half
  panel.
- **The pose, in edges** (measured 2026-10-27, the same scene at its rest, 1.733 s): the phone's
  ink column at 30 % of its width (x 390) runs from row 70 to 1008, 939 px tall; at 70 % (x 572)
  from 79 to 996, 918 px: the right edge is the lowered one. The same phone re-posed as
  `.device--right` (x 1213 to 1668) measures 922 px at 30 % and 936 px at 70 %: the left edge is
  the lowered one. The guard in the suite is the test "the rest pose faces the content:
  `.device--left` lowers its right edge, `.device--right` its left (projected under perspective)",
  which projects the inset body (931.2 by 444.8 px, 10 degrees, 1800 px) from the signs read out of
  `devices.css` to 951.6 px on the near edge and 911.6 px on the far one, and prints both heights
  when it fails.
- **Scene 2, the row:** three boxes at 298 to 1016 down (the band under a 234 px head), 343, 524
  and 343 px wide with 64 px between; flat, bottoms aligned.
- **Scene 3, the zoom:** the device rests 513 px tall (the 718 px band over 1.4), 400.6 to 913.4,
  centred in the band, at the identity (scale 1, no translation). The fit is 1.386. At the tap (1.5 s
  into the clip) it is at 1.384, translated 22 px left, its box 298 to 1007.8; at 2.6 s it is
  pulling back at 1.094; at the sheet (3.5, 4.5, 5.5 s) 1.384 with its box at 298 to 1007.8; at the
  toggle (6.9 s) 1.384 at 305.6 to 1015.4; at 7.6 s 1.231 on the way back; at 7.95 s scale 1 and
  no translation. At every sample the box stays inside 64 to 1856 across and 298 to 1016 down, and
  the head above is untouched.
- **The negative** (the same scene with the bounds a million pixels wide): at the proto rest the
  device takes the whole scale of 2 and its box is `[657, -13, 1147, 1013]`, 13 px above the frame:
  the layout gate fails on `outside`, and on nothing else.
- **Determinism:** 9 sampled frames (start + 0.4 s, midpoint and rest of each scene, the clip
  drawing on a canvas included) byte-identical in three orders.

**Not verified:** a real client recording (the clip is synthetic), a device on a photo ground or a
ground that merges with the rim (the fixture's ground is a flat panel), the notebook and the
landscape tablet on a render (the golden carries a phone, a tablet and a zooming phone; `lid` and
`slide` are proved by the unit tests, not by a still), and a deck (the entrances are the same
registry, but the golden is a film).

## 9. If a device is ever drawn as native PowerPoint shapes

The engine's deck export (`skill-scaffold/root/tools/pptx-from-plates.cjs`) places rendered plates
and draws no device, so nothing in the engine carries a tilt into PowerPoint. A port that builds
the device from native shapes re-derives the pose in that engine and proves it by measurement.
The facts already paid for, recorded so no port repeats the error a sibling skill made on
2026-10-27 (its recipe asserted "the same sign as CSS", its check render had been verified by eye,
and every device in its decks faced away from the content until the owner caught it):

- the tilt goes on the group's `p:grpSpPr` as `a:scene3d` with `a:camera prst="perspectiveFront"`
  and `a:rot lat="0" lon="…" rev="0"`, plus `a:lightRig rig="flat" dir="t"` (a three-point rig
  shades the screen; `orthographicFront` shows no tilt at ten degrees);
- angles are `ST_PositiveFixedAngle`, 0 to 21600000 in 60,000ths of a degree; a negative value is
  a repair dialog;
- **the sign is the opposite of CSS `rotateY`.** CSS `rotateY(+10deg)` sends the right edge back;
  `lon="600000"` (+10 degrees) brings it forward. A device on the left, face toward the content on
  its right (CSS `+10deg`), takes `lon="21000000"` (360 minus 10 degrees); a device on the right
  takes `lon="600000"`;
- verify by the same two column heights, at 30 % and 70 % of the device's width, in the
  application's own render, never by eye: for a device on the left the 70 % column is the shorter.

## Related

- `references/motion-media.md` for the piece as a function of time, the gates and the stills
- `references/motion-craft.md` for the lock as the authority on durations and curves
- `references/slides-and-decks.md` for the deck a device sits in
- `runtime/motion/README.md` for the tool-mode contract and the attribute grammar
