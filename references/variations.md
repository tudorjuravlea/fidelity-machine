# Variations

Rules for producing a set of alternative solutions to the same problem inside a locked design
system: how many, which axes, what makes a variation real, and which gates each one still has
to pass.

Adapted from `claude-design-system-prompt` by Trystan-SA (MIT,
github.com/Trystan-SA/claude-design-system-prompt), re-expressed for lock-driven generation.
The craft rules are system-agnostic; every concrete value comes from the active design lock.

## When variations are allowed to start

After the baseline passes. `references/mode-b.md` states the order: reproduce first, with zero
design opinions, and branch only once the gates are green. A variation set generated before a
verified baseline has no control, so nothing it shows can be attributed to the change.

For a net-new screen with no reference, the baseline is the first composition that clears the
lint and the self-critique. That becomes variation zero.

## How many

Three by default. Five is the ceiling.

A set nobody can hold in their head is not a decision aid, it is a deferral of the decision.
If three well-separated options do not contain the answer, the brief is wrong, not the count,
and the fix is another pass at `references/spec-capture.md` or the direction, not a fourth
option.

## Pick the axes before generating

Name the axis each variation moves along, and write it down before writing any markup.
Undeclared variation produces three drafts that differ everywhere and prove nothing, because
no single attribute can be credited with the difference.

| Axis | What actually changes | Signal it produces |
|---|---|---|
| Density | Spacing steps, row height, how much fits above the fold | How much this audience wants to see at once |
| Hierarchy | Which element is dominant, and what gets demoted to reach it | What the screen is for |
| Layout | Structural arrangement: stacked, split, grid, sidebar | How the content wants to be grouped |
| Disclosure | What is visible versus behind a tap, accordion, or second step | Tolerance for depth against tolerance for length |
| Tone | Copy register and imagery weight, within the lock's voice chart | How formal the surface should read |

Move one axis per variation where possible. Two is acceptable when they genuinely interact
(density and layout often do). Three axes at once is a redesign, not a variation.

## What counts as a variation

A variation that only recolors is not a variation. Neither is one that only swaps a font
weight or nudges a radius. Those are token substitutions, and inside a locked system they are
either legal (in which case they change nothing anyone will decide on) or illegal (in which
case the lint rejects them).

The test: state what each option optimizes for in one sentence, without naming a visual
property. If the sentence comes out as "it is the blue one," it is not a variation. If it
comes out as "it puts the balance first and pushes transactions below the fold," it is.

Build the set from restrained to bold, in that order. A reviewer reading basic to bold
perceives a range and can point inside it. The same three options shuffled read as three
unrelated drafts.

## Every variation is still a lock screen

This is the constraint the source material has no equivalent of, and it is the whole reason a
variation set is safe to show a client.

- Every variation is generated from lock tokens. Variations are not an exemption from the
  system, they are an exploration of what the system already permits. A variation that needs
  an off-lock value is a capture gap: fix the lock, or drop the variation.
- Every variation runs `adherence-lint.mjs` and clears it. Content and compliance findings are
  not deferred to the winner.
- Every variation carries the full `content.disclosureInventory`. Dropping a mandatory
  disclosure to make an option look cleaner is banned outright, and it is the most likely way
  a variation set goes wrong: the tightest layout usually wins the room, and it wins by
  hiding legally required copy. If a disclosure does not fit an option, that option is
  disproven, not the disclosure.
- Every variation gets its own taste self-critique against the same `signatures[]` and
  `donts[]`. An option that reads as a different system is not a bolder option, it is a
  failed one.

**Which gates apply.** A variation reproducing a reference runs the full pipeline including
the pixel diff. A net-new variation has no reference, so the pixel gate does not apply to it;
the lint, the self-critique, and geometry where Figma geometry exists still do. Say which
gates ran when reporting the set. An option presented as verified when only the lint ran is
the same overclaim the pipeline exists to prevent.

## Presenting the set

One file, options in order, restrained first. The generated comparison bundle is a
`*.preview.html`; those bundles are excluded from the source lint walk because each screen is
already linted from its own source, so never treat a clean bundle as evidence that the screens
inside it passed.

Annotate every option with: the axis it moves, what it optimizes for, what it costs, and which
gates it cleared. Then recommend one, and give the reason as a fit argument against the brief
rather than a preference. "Recommend B: the audience opens this screen to check one number,
and B is the only option where that number is the dominant element" is a recommendation.
"Recommend B, it feels cleaner" is not.

Record what the reviewer picked and why. The next screen in the same system inherits that
decision instead of re-litigating it.
