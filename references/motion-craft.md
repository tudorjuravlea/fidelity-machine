# Motion craft

Rules for motion in a lock-driven screen: reading the lock's motion tokens, choosing what
moves, degrading correctly, and reporting honestly about the one thing the pixel gate cannot
see.

The lock schema has carried `tokens.motion.durationsMs` and `tokens.motion.easings` since the
beginning, and the lint has enforced motion rules for as long. This reference is the missing
half: the engine has been grading motion without ever teaching it.

## The lock is the authority for motion too

`tokens.motion` is a first-class token family. It is not decoration and it is not optional
context:

- **Every duration comes from `tokens.motion.durationsMs`, by name.** A hard-coded `250ms` is
  the same defect class as a hard-coded hex.
- **Every curve comes from `tokens.motion.easings`, by name.** Systems typically ship two or
  three (a standard curve, a decelerate curve for entrances, sometimes an accelerate curve for
  exits). Use the named one for the named purpose.
- **A screen that needs a duration the lock does not have is a capture gap.** Derive it
  in-system and add it to the lock, or flag it. Never improvise one into the CSS.
- **A lock with no `tokens.motion` and a screen that animates is also a capture gap.** Say so
  in the report rather than inventing a house default.

## Decide whether to animate at all

In order, cheapest question first:

1. **Frequency.** How often does the user see this? Something triggered dozens of times a day
   should not animate. Motion is a cost paid on every repetition.
2. **Purpose.** Does it explain a change of state, a spatial relationship, or a consequence?
   If the only answer is "it looks nicer", stop.
3. **Curve.** Entrances decelerate. Never accelerate into an entrance, because the delay lands
   exactly where the eye is most attentive.
4. **Duration.** Use the token whose name matches the scope of the change: micro for a control,
   larger for an overlay or a screen. If nothing fits, see the capture-gap rule above.

## Spring for spatial, tween for effects

The rule that explains why a system's standard curve looks the way it does.

| Family | Properties | Model | Why |
|---|---|---|---|
| Spatial | position, size, scale, offset | Spring-like (a curve with inertia and settle) | Movement without inertia reads as robotic |
| Effects | opacity, colour, elevation, blur | Tween | These must not overshoot. Opacity springing past 1 or below 0 is a value leaving its legal range, not a style |

A design system's "standard" easing is usually a spring approximated as a bezier, which is why
it has a fast start and a long settle. Understanding that is what stops a generator from
swapping it for a superficially similar curve.

Effects also run shorter than the spatial motion they accompany. A fade that outlasts the
movement it belongs to reads as lag.

## Entrances, exits, and the stagger rule

- Exits run shorter than their paired entrance. Attention has already moved on.
- An element that disappears with no exit loses its context. Never remove the exit entirely.
- **Never stagger an exit.** Staggered arrival builds a sequence the eye follows; staggered
  departure reads as the interface falling apart, and it delays whatever comes next by the
  length of the whole cascade. Exits are coordinated.

## Reduced motion is designed, not derived

Every animation needs its reduced variant specified at the same time, and the correct degraded
state is almost never "the same thing, slower":

- Movement becomes a crossfade or an instant state change.
- Parallax, looping and gesture-amplified motion stop entirely.
- Layout must not shift when motion is off. A reduced-motion path that changes the composition
  is a second design, not a fallback.

The lint reports motion with no `prefers-reduced-motion` guard as a WARN rather than an ERROR,
because how much movement is too much is a judgment call. The WARN is advisory about the
threshold, never about whether the variant is required.

## What the gates already enforce

So this reference and the scripts agree rather than drift:

| Rule | Where it is enforced | Level |
|---|---|---|
| `transition: all`, or a blanket transition utility | `adherence-lint` transition-all | ERROR |
| `will-change` on anything outside transform, opacity, filter, clip-path | `adherence-lint` transition-all | ERROR |
| Motion with no reduced-motion guard | `adherence-lint` a11y | WARN |
| Interactive elements with no visible focus style | `adherence-lint` a11y | ERROR |
| Raw duration or curve values outside a token scope | `adherence-lint` raw-hex and css-vars family | ERROR |

Animate transform and opacity. Anything that triggers layout (width, height, top, left,
margin) is both a performance defect and, in a pixel-verified pipeline, a source of
instability.

## The pixel gate cannot see motion

State this plainly in every report that involves animation, because it is the single largest
honesty gap in the pipeline:

**Renders are static.** `render.mjs` captures one frame after the readiness signal, and the
diff compares still images. A screen can pass geometry and pixel gates perfectly and still
have motion that is wrong, ugly, or absent. Nothing in the machine has looked at it.

Two consequences that are not optional:

1. **Motion is verified by a human or it is not verified.** Report it as reviewed or as
   unreviewed; never let a green pixel result imply the animation was checked.
2. **Motion must not be running when the frame is captured.** Any entrance animation has to be
   complete, or disabled, before the page signals readiness. An animation still in flight at
   capture time makes the pixel diff nondeterministic, and the failure looks like a flaky
   threshold rather than what it is.

## Translating a native motion spec into a web prototype

A prototype of a native app is usually HTML, while the design system it reproduces is
specified for Android or Apple. The lock stores curves in web notation, so the translation is
already implicit in the capture. Making it explicit prevents two errors: inventing a web curve
that does not correspond to the real one, and presenting an approximation as the real thing.

| Web (CSS) | SwiftUI | Compose |
|---|---|---|
| `cubic-bezier(0.2, 0, 0, 1)` | `.snappy`, or a spring with response near 0.4 and damping near 0.85 | spring, medium stiffness, damping near 0.85 |
| `ease-out` | `.easeOut(duration:)` | tween with a decelerate easing |
| A bouncy spring | `.bouncy` | spring, low stiffness, medium-bouncy damping |
| A smooth spring | `.smooth` | spring, medium stiffness, no bounce |

Three rules when the target is native:

- **Say what the approximation covers.** An HTML prototype of a native spring communicates
  timing and curve only, never rendering. Put that on the artifact, not just in the report.
  This is the same rule `references/variations.md` states for showing a variation set.
- **The same duration does not feel the same on both platforms.** First-frame cost differs, so
  a value that reads as tight on one platform reads as slightly late on the other. A single
  duration token is a starting point for both, not a finished decision for either.
- **Never specify a native implementation from here.** The engine emits HTML. Handing a
  developer a spring parameter the prototype never actually ran is a claim the pipeline cannot
  support.

## Related

- `references/taste-and-composition.md` for the self-critique gate that scores craft
- `references/variations.md` for showing motion alternatives, including the reduced-motion state
- `references/scope-contract.md` for what a motion change puts in CHANGES and FROZEN
- `references/pixel-diff-tuning.md` when a screen will not converge, which in-flight motion causes
