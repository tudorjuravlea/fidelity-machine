# Surface classes: touch and pointer

The engine generates screens for phones, desktop apps and websites from the same lock. Several
craft rules invert between them, and the inversion is not a judgment call: it is read from the
screen's declared capture width.

Nothing in the engine previously distinguished the two, so mobile-shaped defaults were applied
to desktop surfaces by omission.

## Derive the class, never guess it

`screens[].captureWidth` is in the lock schema. Use it.

| captureWidth | Class | Primary input |
|---|---|---|
| Up to 599 | **Touch** | Finger |
| 600 to 1023 | **Hybrid** | Either. Design for touch, allow pointer refinements |
| 1024 and up | **Pointer** | Mouse, trackpad, keyboard |

A screen with no `captureWidth` is a capture gap for anything in this file. Ask, or read it
from the reference image dimensions, but do not assume.

## What inverts

| | Touch | Pointer |
|---|---|---|
| Primary affordance signal | Target size and label | **Hover** |
| Target floor | 44x44px (WCAG 2.5.5 AAA, and both mobile platform minimums) | **24x24px** (WCAG 2.5.8 AA), practically 24 to 32px for icon and toolbar controls |
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
