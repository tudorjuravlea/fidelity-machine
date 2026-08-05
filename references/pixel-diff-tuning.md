# Pixel-diff tuning — operator's guide to the pixel gate

How to run, read, and tune the pixel gate (`diff.mjs`, orchestrated by `verify.mjs`) without
turning it decorative. Numbers restate CONTRACT.md; where they disagree, CONTRACT.md wins.
Run: `node scripts/diff.mjs --lock <lock> --screen <id>` · `node scripts/verify.mjs --lock <lock> [--screen <id>] [--calibrate]`.

## Why exact equality is impossible — and what replaces it

Two rasterizers draw every screen: Figma's renderer produced the reference, Chromium produced
the render. They shape and hint text differently, place glyphs at different subpixel offsets,
and blend anti-aliased edges with different coverage math. Identical designs therefore differ
by a small fraction of pixels, concentrated on glyph and curve edges. Chasing zero is chasing
rasterizer physics. The gate replaces equality with three bounds — all load-bearing:

1. **Perceptual per-pixel threshold** — `pixelmatch(ref, img, diff, W, H, { threshold: 0.1, includeAA: false })`.
   The 0.1 is a YIQ color distance: perceptually near-identical pixels do not count as diff.
2. **Global ceiling** — `globalPct = diffPixels / (W*H − maskedPx)` must be ≤ the screen's
   `passThreshold`. Bounds total drift across the frame.
3. **Per-tile ceiling** — 64×64-px tiles over the diff buffer; `worstTile` = max per-tile diff
   density over that tile's unmasked pixels, must be ≤ `tileCeiling`. Load-bearing: a 0.003
   global diff can be one 100%-wrong button. The average hides it; the tile does not.

PASS ⇔ both ceilings hold → exit 0. Any miss → exit 1 with evidence (see triplets below).

## Never raise the color threshold

`threshold: 0.1` and `includeAA: false` are frozen. Raising the color threshold to "absorb AA"
also absorbs real drift — a slightly wrong gray, a shifted brand hue — in exactly the band you
widened. AA needs no absorbing: `includeAA: false` detects antialiased edge pixels structurally
(by neighborhood) and excludes them. There is nothing left for a bigger threshold to fix and
plenty for it to hide. Color drift too small for pixels to show is the adherence-lint's job:
its computed-style spot-audit compares resolved colors against the lock's exact hex. Tune only
`passThreshold` / `tileCeiling`, in the lock, inside the caps below.

## Dimension matching — exit 3 is a config error

1 rendered px must equal 1 reference px. `render.mjs` sets viewport `captureWidth×captureHeight`
at `deviceScaleFactor = dpr` so the output PNG's dimensions equal the reference PNG's exactly.
On mismatch `diff.mjs` exits 3 (DIMENSION_MISMATCH) before comparing anything. This is a lock
configuration error — wrong `captureWidth`/`captureHeight`/`dpr`, a stray `clip`, or a reference
exported @2x against `dpr: 1`. Fix the lock or re-export the reference at original dims.
**Never resample either image**: interpolation manufactures and destroys pixel differences and
silently changes what every threshold means.

## Font parity — exit 4, and the both-fell-back hole

Bundle the woff2 files next to the lock (`fonts[].files` resolve relative to it) and declare
`@font-face` with `font-display: block` — `swap` can screenshot the fallback frame. Before
shooting, `render.mjs` awaits `document.fonts.ready` then asserts every `fonts[].fontChecks[]`
string via `document.fonts.check()`; any false → exit 4, **no screenshot of a fallback, ever**.
Why refuse instead of letting the diff catch it: the both-fell-back hole. If a reference were
produced by our own renderer while the font was missing, and the render falls back the same
way, both images show the same wrong font → diff ≈ 0 → the gate passes two wrong images.
Hence the provenance rule: screen references come from **Figma's renderer** (`get_screenshot`
at original dims) or a real branded capture — never from our own Chromium render of generated
output. Sole exception: the calibration control screen. Write `fontChecks` to cover every
family+weight+size actually used (`'700 26px "Brand Sans"'`); a check on an unused weight
proves nothing.

## Noise-floor calibration

Calibrate before trusting any threshold: `node scripts/verify.mjs --lock <lock> --calibrate`
diffs the control screen — content known-identical to its reference — and writes the residual
to `meta.noiseFloorPct`. That residual is the irreducible rasterizer disagreement; a control
whose reference comes from Figma's renderer measures the real Figma-vs-Chromium floor.
Set every `passThreshold` ABOVE the floor and never at 0: a threshold at or below the floor
can never pass, and the loop will burn all four rounds against physics.
The floor is pinned to `meta.chromiumBuild`. A different Chromium build shifts AA and glyph
placement, so **a build change invalidates the calibration** — `render.mjs` warns loudly on
mismatch; re-run `--calibrate` and re-check every threshold still clears the new floor.

## Threshold caps — loosening past them is banned

The lock carries hard ceilings and the lint enforces them on the lock itself:
`caps.maxPassThreshold = { A: 0.002, B1: 0.005, B2: 0.005 }`, `caps.maxTileCeiling = 0.4`,
`caps.maxMaskedAreaPct = 0.15` — all fractions (0–1), not percentages. Tightening is allowed;
a screen threshold looser than its cap fails lint (exit 1) — the lock is rejected outright.
Why: the natural failure mode of any diff loop is negotiating with the gate instead of fixing
the screen. Caps make "bump the threshold" a dead end, and because thresholds live in the
versioned lock, any loosening within the caps is still visible in review. A stubborn screen
gets fixed, not waved through.

## Masking discipline — a mask is the gate agreeing not to look

Mask only what cannot be made deterministic; prefer freezing (clock, RNG, fixture data) so the
real pixels stay in play. Every mask carries a `rect` and a required `reason` (≥8 chars) in the
lock. `diff.mjs` zeroes the SAME rects in BOTH buffers, so masked pixels contribute zero diff
and leave the denominator entirely (`W*H − maskedPx`). Budget: Σ mask area ≤ 15% of the frame
(`caps.maxMaskedAreaPct`), lint-enforced. Respect the scale of the golden fixture: one 300×44
balance rect ≈ 3% of frame. Mask abuse is the gate lying — a mask over a region you failed to
reproduce turns "matches the reference" into "matches everywhere we didn't hide", and because
tiles count only unmasked pixels it also blinds the concentrated-failure detector. Reasons
exist so a reviewer can audit every rect; a mask without a defensible reason is drift hiding.

## Dynamic-content determinism (recognize violations in the evidence)

`render.mjs` owns these; know them so you can spot a broken one in a diff:
- Clock + RNG frozen via `addInitScript` → timestamps, "acum 2 min", shuffled lists stable.
- `reducedMotion: 'reduce'`, screenshot `animations: 'disabled'`, all `document.getAnimations()`
  finished → no mid-transition frames.
- `caret: 'hide'` → no blinking cursor caught mid-blink in inputs.
- Mouse parked bottom-right → no hover state under the pointer.
- Scrollbars hidden (`::-webkit-scrollbar{display:none}`, `scrollbar-width: none`) → no gutter band.
- Readiness = the page sets `[data-render-ready]` once fonts/data/layout settle — never
  `networkidle`, which lies on quiet and on polling pages.

## Reading the evidence — fix toward the reference, not the delta

A failing screen emits `.report/<id>.diff.png`, `.report/<id>.report.json`, and
`.report/<id>.tiles/`: the top-5 worst tiles as **triplet crops** — `ref/`, `render/`, `diff/`
per bbox — each with one text line, geometry-classified when ground truth exists:
"box matches → color/weight, not layout" vs "box off → layout". Method: put ref crop and
render crop side by side; name the difference in token terms (wrong surface hex, weight 400
vs 600, radius, missing border, spacing one scale step off); change the code to the
REFERENCE's value. Never chase the diff image — nudging a box 1px per round toward fewer red
pixels converges on the delta, not the design. The classification routes the fix: box wrong →
layout (spacing scale, flex, slack); box right + pixels wrong → color/type/elevation token.
Mode B2 has no geometry ground truth: triplets arrive unclassified and the worst regions get a
mandatory human review.

## Loop budget

≤4 rounds per screen. `verify.mjs` keeps best-so-far; a round that worsens `globalPct` is
reverted. STOP when two consecutive rounds each improve by <10% relative — report the best
result plus the remaining worst tiles. Never thin-retry past the stop: further changes are
guesses, and guessing invents. If the plateau sits near `meta.noiseFloorPct`, you are at the
physics floor; if it sits well above, the worst triplet is pointing at something structural —
reread it. Pixel fixes never override the earlier gates: an RO-locale overflow is fixed with
layout slack or a Concise copy pass, **never** by cutting a mandatory disclosure.

## Troubleshooting

| Symptom | Likely cause | Exit / fix |
|---|---|---|
| Dims differ; no diff produced | Reference exported @2x vs `dpr: 1`, wrong `captureWidth/Height`, stray `clip` | 3 — fix lock or re-export reference; never resample |
| Refuses to screenshot, names a font check | woff2 missing / bad `files[]` path (relative to lock) / fontCheck family-weight mismatch | 4 — bundle the file, fix `fontChecks`, `font-display: block` |
| Timeout waiting for readiness | Page never sets `[data-render-ready]` (script error, attribute forgotten) | 5 — fix the page's ready signal; check render log |
| Script refuses to start | Missing dep, bad args, unparseable lock | 2 — run `setup-check.mjs`; it prints the exact `npm i` |
| `globalPct` passes, `worstTile` fails | One concentrated wrong region (icon, button, badge) | 1 — open that tile's triplet; fix the region toward the ref |
| Thin diff smeared over ALL text | Wrong weight/size/letter-spacing, or a fallback slipped past a too-narrow fontCheck | 1 — cover every used weight in `fontChecks`; compare a text triplet |
| One solid region ~100% diff | Wrong color token (surface/background hex) | 1 — computed-style spot-audit vs lock hex; fix the token |
| Masked region still diffing | Mask rect doesn't actually cover it | 1 — check rect against `diff.png`; fix the rect in the lock |
| Lint rejects the lock itself | Threshold past cap, or Σ masks > 15% | 1 — tighten thresholds / shrink masks; caps never move |
| Everything degrades after env change | Installed Chromium ≠ `meta.chromiumBuild` | warn — re-pin the build; re-run `--calibrate`; re-check floor |
| Plateau near `noiseFloorPct`, still failing | Threshold set at/too close to the floor | STOP — recalibrate; set threshold above floor, within caps |
