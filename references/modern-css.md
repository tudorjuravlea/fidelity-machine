# Modern CSS capabilities

Platform features that replace JavaScript in generated screens: scroll-driven animations, view
transitions, `@starting-style`, anchor positioning and container queries. How to use them
without shipping a screen that is blank in a browser you did not test.

Adapted from genjutsu by Adrien Thevon (MIT, github.com/AThevon/genjutsu), re-expressed for a
pixel-verified pipeline. The craft rules are system-agnostic; every concrete value still comes
from the lock.

## The rule that outranks the rest

**No browser-support table lives in this file.** Support moves, documents do not, and a stale
table is worse than none because it gets believed. Check current support at build time and
encode the strategy here, not the status.

## Start visible, then enhance

The failure this prevents is specific and common: a scroll reveal written as "start at opacity
0, animate to 1" leaves content **permanently invisible** in any browser where the animation
never runs. The page is blank and it looks perfect on the machine that built it.

Three layers, in this order:

- **Layer 0.** Content is visible and usable with no animation and no dependency. This is not
  a fallback, it is the product.
- **Layer 1.** A universally supported enhancement, typically a plain transition.
- **Layer 2.** The modern feature, gated with `@supports`, explicitly standing down the layer-1
  mechanism where it replaces it so the two never fight.

```css
@supports (animation-timeline: scroll()) {
  .reveal {
    animation: reveal linear both;
    animation-timeline: view();
    transition: none; /* stand down layer 1 */
  }
}
```

## The five, and what each removes

| Feature | Replaces | Why it matters here |
|---|---|---|
| Scroll-driven animation (`animation-timeline`) | Scroll listeners, observer-based reveals | Runs off the main thread, so it does not jank the capture or the page |
| View Transitions | Hand-written FLIP, route transition libraries | Makes state and page changes feel native with no library |
| `@starting-style` | Class-toggling on the next frame | Lets dialogs and popovers animate in from `display: none` and the top layer, in pure CSS |
| Anchor positioning | Positioning libraries | Tethers a popover to its trigger with collision handling, no JS |
| Container queries | Component breakpoints faked from viewport widths | Components respond to their own space, so one component works in a sidebar and a hero without variants |

Also worth naming: `:has()` for parent and sibling selection, `subgrid` for aligning nested
grids to a parent's tracks, and `@property` for typed custom properties, which is what makes
gradients and transforms interpolate smoothly instead of stepping.

## Two traps specific to this pipeline

**1. The render proves nothing about your audience.** `render.mjs` runs one pinned browser
build, chosen for determinism. A feature that works in the render is confirmed to work in
*that* build and nowhere else. The pixel gate cannot tell you a fallback is needed, and it will
happily certify a screen that is blank for a third of its users. Support decisions are made by
checking support, never by observing a green diff.

**2. Nothing may still be animating at capture.** The readiness signal is what makes the diff
deterministic. A scroll-driven animation, a view transition or a `@starting-style` entrance
that is mid-flight when the frame is taken produces a different image every run, and the
failure presents as a flaky threshold rather than as a timing bug. Entrance motion must be
finished or disabled before the page signals readiness. See `references/motion-craft.md`.

**Container queries and the fixed capture viewport.** A container query is correct and worth
using, but the reference is captured at one viewport, so only the branch that applies at that
width is ever pixel-verified. The other branches are unverified. Say so rather than implying
the component was checked at every size.

## Tokens still apply

None of this is an exemption. Durations and curves come from `tokens.motion`, colours and
spacing from their token families, and a value invented inside an `@supports` block fails the
lint exactly as it would anywhere else.

## Accessibility

Scroll-driven animation and view transitions are motion and need a reduced-motion path; for
view transitions the correct degraded state is usually no transition rather than a faster one.
An element animating in from the top layer still has to take focus correctly and still needs
an escape route.

## When a library is still the right answer

The platform is not automatically better. Complex orchestrated timelines, gesture-driven and
interruptible motion (CSS has no spring), and work that must render identically across a wide
browser range are all cases where a library earns its weight. The honest default is to use the
platform for the common cases and not add a dependency for a fade.

## Related

- `references/motion-craft.md` for the motion rules these features implement
- `references/mode-b.md` for generating from tokens
- `references/pixel-diff-tuning.md` when a screen will not converge, which in-flight animation causes
