# Scope contract

How to size a request before running the pipeline on it, and how to state what the work will
do in a form the gates can check afterwards.

Adapted from the scope-and-thesis stages of `cast` in genjutsu by Adrien Thevon (MIT,
github.com/AThevon/genjutsu), re-expressed for lock-driven generation. Their thesis describes
how something should feel. This one is a contract, because a system with machine gates can
verify a contract and cannot verify a feeling.

## The two failures this prevents

**Overkill.** The pipeline is written for producing a screen. Run all of it for a one-property
change and the cost is out of proportion to the work, so it gets skipped informally, and
skipping informally is how a gate quietly stops running.

**Scope creep.** A request to change one value comes back as a restyled region. Every gate
still passes, because the output is lock-clean and pixel-close. Nothing in the pipeline
compares the result against **what was asked for**, so the creep is invisible to the machine
and only the reviewer catches it. That is the gap this closes.

## 1. Size the request

| Tier | The request | Touches |
|---|---|---|
| **Touch** | One property on one named element | No new structure |
| **Region** | One component or section | Structure inside one region |
| **Screen** | A whole screen | The full page |
| **Set** | Several screens, or a variation set | Multiple screens plus consistency between them |

Size it from the request, not from what would be interesting to build. If the request is
ambiguous between two tiers, state which one you picked and why before starting. A tier is
not a difficulty estimate; it is a statement about blast radius.

## 2. Write the scope contract

One sentence, then three lists. The sentence says what the work is. The lists make it
checkable.

```
INTENT   One sentence, plain, no aesthetic adjectives.
CHANGES  The elements that will change, by selector or data-fig-id.
USES     The lock values this will use, by token name.
FROZEN   What must not change. Always includes: every string in the screen's
         disclosure inventory, every lockedString, and every element not in CHANGES.
```

Rules that make it worth writing:

- **No adjectives in INTENT.** "Make the balance card calmer" is not checkable. "Reduce the
  balance card to one accent element" is.
- **USES names tokens, never values.** A hex in the contract is already a violation of the
  thing the contract exists to protect.
- **FROZEN is the useful half.** It is what turns the contract from a plan into a test. If
  FROZEN is empty, the contract is not saying anything.

At Touch tier this is four short lines. At Set tier it is per screen plus one line on what
must stay consistent across them.

## 3. Pick the gate set, but never below the floor

Scope changes how much verification runs. It never changes whether the compliance floor runs.

| Gate | Touch | Region | Screen | Set |
|---|---|---|---|---|
| Content and compliance lint | **Always** | **Always** | **Always** | **Always** |
| Disclosure inventory intact | **Always** | **Always** | **Always** | **Always** |
| Taste self-critique | Skip | Region only | Full | Full, plus cross-screen consistency |
| Geometry | Skip unless geometry moved | If layout changed | Yes | Yes |
| Pixel diff | Skip unless a reference exists and pixels moved | Yes | Yes | Yes, per screen with a reference |

**The floor is not negotiable and does not scale.** Lint and disclosures run at every tier,
including Touch, because those are the failures that are cheap to introduce and expensive to
ship. Everything above the floor is proportionate to blast radius.

Two consequences worth stating plainly:

- A Touch-tier change that turns out to move pixels is no longer Touch tier. Re-size it and
  run the gates for the tier it actually became. Discovering this is a normal outcome, not a
  mistake.
- Skipping a gate is a reportable event, never a silent one. See §5.

## 4. Check the result against the contract

This is the step that does not exist upstream, and it is the reason to write the contract at
all. After the gates pass, compare the diff to the contract:

- **Anything changed that is not in CHANGES** and is not structurally required by something in
  CHANGES is scope creep. Report it. Do not keep it because it looks better.
- **Anything in FROZEN that moved** is a failure regardless of how the gates scored. A screen
  can be lint-clean, pixel-perfect and still have dropped a disclosure that the inventory did
  not happen to list.
- **Anything in USES that was not actually used**, or any value used that is not in USES,
  means the contract was wrong. Fix the contract and re-read the work against it, rather than
  quietly widening the contract to fit what got built.

A gate suite answers "is this output legal?". The contract answers "is this the output that
was asked for?". Both can pass and both can fail independently, which is exactly why the
second one has to be written down before the work rather than reconstructed after it.

## 5. Report the tier and the skips

Every delivery states: the tier, the contract, which gates ran, and **which gates did not run
and why**. A screen reported without that line reads as fully verified when it may have been
verified proportionately, and that is the misunderstanding this whole file exists to prevent.

"Touch tier: lint and disclosures ran and passed; geometry and pixel skipped, no geometry
moved" is a complete report. "Passed" is not.

## Related

- `references/variations.md` for sets, which are Set tier by definition
- `references/mode-a.md` and `references/mode-b.md` for routing each node once the tier is set
- `references/taste-and-composition.md` for the self-critique the tier table schedules
