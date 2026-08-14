# Surface classes: touch and pointer

The engine generates screens for phones, desktop apps and websites from the same lock. Several
craft rules invert between them, and getting the split wrong is a usability defect the gates
cannot see.

Two different questions are involved and they have two different answers. **What the user
touches the screen with** decides target sizes and whether hover is load-bearing. **How wide
the screen is** decides layout, density and navigation pattern. Conflating them is the trap
this file exists to prevent, because tablets in landscape are wider than most desktop
breakpoints while remaining pure touch devices.

## The class is about input, not about width

The class that matters is **what the user touches the screen with**. Width is only a proxy for
it, and the proxy breaks badly:

| Device | Portrait | Landscape |
|---|---|---|
| iPad Pro 12.9 | 1024 | **1366** |
| iPad Pro 11 | 834 | **1194** |
| iPad 10.9 | 820 | **1180** |

Every common tablet in landscape sits above 1024 while remaining a pure touch device. Any rule
that reads "1024 and up means pointer" hands a finger-operated screen a 24px target, which is
a usability failure the machine would have certified.

**So classify by input, declared at capture time.** The captured system knows what it is: a
mobile banking app is touch, an internal admin console is pointer, a public website is usually
both. That is a property of the system and the screen's intent, not of the number of pixels
being rendered.

| Class | Means | Target floor |
|---|---|---|
| **Touch** | Reachable by finger at any width: phone, tablet in either orientation, touchscreen laptop, kiosk | **44x44px** |
| **Pointer** | Mouse, trackpad and keyboard only, with no touch story | **24x24px** (WCAG 2.5.8), 24 to 32px practical for icon and toolbar controls |
| **Both** | A responsive site served to phones and desktops alike | **44x44px** on every breakpoint a touch device can reach |

**When the class is not declared, resolve upward to touch.** The failure modes are asymmetric:
a 44px target on a pointer surface is merely roomy, while a 24px target on a touch surface is
unusable. Ambiguity is never a reason to choose the smaller floor.

**What `captureWidth` is actually for.** It tells you which breakpoint you are rendering, which
is what decides layout, density and navigation pattern below. It does not tell you what the
user's hand is doing. Use it for the layout inversions, never for the target floor.

Width as a last-resort inference, when nothing else is known: under 600 is certainly touch;
600 to 1366 is ambiguous because tablets occupy it in both orientations; above 1366 is probably
pointer, though a touchscreen laptop is still possible. Every band except the first resolves
upward under the rule above.

## What inverts

| | Touch | Pointer |
|---|---|---|
| Primary affordance signal | Target size and label | **Hover** |
| Target floor | 44x44px, and see the input rule above: this follows the input class, never the width | **24x24px** (WCAG 2.5.8 AA) only when the surface is genuinely pointer-only |
| Navigation | Bottom tabs; a hidden menu is acceptable | **Persistent**. A hamburger on a wide viewport hides navigation there is room for |
| Density | Generous, one decision per screen | **High**, many decisions per viewport |
| Base grid | 4 to 8px | 8px |
| Keyboard | Secondary | **Primary input, not an accessibility extra** |
| Motion budget | Standard | **Tighter**, see below |

## Hover is required on pointer surfaces

On a pointer surface, hover is how the user confirms something is interactive **before**
committing to a click. A clickable surface with no hover state reads as broken rather than as
minimal. `taste-and-composition.md` already requires hover as a designed state; on pointer
surfaces it is load-bearing rather than decorative.

Two rules that follow:

- Pair it with `:active` so the press is acknowledged, and transition it (roughly 100 to 200ms)
  so the change registers without feeling sluggish.
- **Hover is never the sole carrier of information.** Keyboard and touch users never see it.
  Anything discoverable only on hover has to be discoverable another way.

## Keyboard is a primary input here

Tab order follows visual order, which makes it a layout decision rather than a markup detail.
Set initial focus deliberately when something opens (the first field of a form, the input of a
palette) and restore it sensibly on close.

A custom control needs a role, an accessible name and key handling. `tabindex="0"` puts it in
the tab order and supplies none of those. The `a11y` lint blocks on missing focus styles and on
positive tabindex; the rest is design.

## Density is not clutter

A pointer surface is read at a desk on a large display. It can carry, and its users want, more
per viewport than a phone: persistent side navigation rather than hidden menus, real data
tables when the data warrants them, tighter rhythm. The test is whether every element earns its
space, not whether space is left over.

Applying touch density to a pointer surface produces the most recognisable failure in this
category: a screen that reads as a scaled-up phone.

## Motion on long-session surfaces

Desktop apps are looked at for hours, so an animation that delights once becomes tiring by the
hundredth repetition. On pointer surfaces prefer opacity and small translations under 200ms,
with no bounce or overshoot on routine interactions, and reserve expressive motion for one-shot
moments. This sharpens the frequency gate in `references/motion-craft.md` rather than replacing
it: pointer surfaces are where frequency is highest.

## The captured system outranks every number here

These are craft defaults for deciding what to generate when the reference does not settle it.
If the captured system ships 28px controls on a dense pointer surface, **reproduce 28px** and
note the deviation from the default in the report. Never inflate a control toward a heuristic
and call it fidelity. Precedence is unchanged: system constraints, then signatures and donts,
then craft.

## One width verified, not all of them

A screen is captured at one `captureWidth`, so the pixel gate verifies that width and no other.
Responsive behaviour, container-query branches and breakpoint changes are unverified unless
they have their own captured screen. Say which widths were verified rather than implying the
layout was checked everywhere. See `references/modern-css.md`.

## Related

- `references/taste-and-composition.md` for the state and hit-area rules this keys by class
- `references/ia-and-navigation.md` for navigation patterns per class
- `references/motion-craft.md` for the frequency gate this sharpens
- `references/modern-css.md` for container queries and the single-width caveat
