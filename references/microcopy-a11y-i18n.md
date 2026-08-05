---
reference: microcopy-a11y-i18n
vendored-from: Tudor's ux-writing KB — kb-craft/03-accessibility/{accessible-writing,internationalization}.md (frozen 2026-07-21)
role: Part 5 constraints layer — accessible writing + i18n rules that shape the layout, not just the words
---

# Microcopy Accessibility & Internationalization

These rules constrain both the strings and the layout that receives them. They are why
generated text slots must flex (`CONTRACT.md` slot rules) and why verify runs the
longest locale.

> **⚠ Legal — stated once:** WCAG 2.2 AA via the **EU European Accessibility Act (EAA)
> is a legal requirement for financial services in the EU** — treat every rule below as
> mandatory, not aspirational. Legal and disclosure strings need **certified
> translation** and are never machine-paraphrased; they ship as drafts flagged
> `⚠ Legal` pending Legal/Compliance sign-off.

## Accessible writing

### Screen-reader optimization
- **Labels stand alone** — interactive elements are read out of context: "Submit
  application", not "Submit". Plan screen-reader text for icon-only buttons, including
  in dynamic lists where the button's context changes with content.
- **Descriptive link text** — link the full meaningful phrase ("Read our privacy
  policy"), never "Click here" / "Learn more" floating alone; screen-reader users
  navigate link-to-link.
- **Errors read with their field** — structure so label + message announce sensibly
  together: "Error: Email must include @".
- Add ARIA labels only when the visible context alone isn't enough.

### Cognitive accessibility
- **Sentence length 8–14 words** (8 → ~100% comprehension, 14 → ~90%); this tightens the
  general ≤20-word lint ceiling for a11y-critical strings.
- Break complex information into scannable chunks; clear headings, logical hierarchy,
  predictable patterns.

### Multi-modal
- **Never rely on color alone.** Pair every status color with an icon *and* a text
  label: "Error: Email required" + icon — the lint blocks color-only status.
- Provide text alternatives for icons and images.
- Contrast ≥ **4.5:1** for body text (WCAG AA).

### Plain language
- Target **7th–8th grade** reading level for a general audience (10th for
  professional). Expert audiences handle complex *ideas*, not complex *language*.
- Define technical terms on first use; avoid idioms, metaphors, and cultural references
  (they also break in translation).

| Element | Poor | Good |
|---|---|---|
| Button | "Submit" | "Submit application" |
| Link | "Click here for more information" | "Read our privacy policy" |
| Error | Red text: "Invalid" | "Error: Email must include @" (with icon) |
| Form label | Placeholder-only field | Visible label + optional placeholder |

Standards: **WCAG 2.2 AA + EU EAA.** Test with VoiceOver (Mac/iOS), NVDA (Windows,
free), JAWS (Windows, commercial).

## Internationalization

### Text expansion — plan for the longest
| Language family | Typical expansion vs. English |
|---|---|
| German, Finnish, Russian | **+30–40%** (short strings expand much more) |
| French, Spanish, Italian | +15–30% |

Romanian runs longer than English — RO is the longest locale in an RO+EN lock, so
verify renders it. **Design slots to flex; never hard-fit text to a fixed width based
on the English string** — no fixed widths on text containers, ≥2 lines of vertical
slack on labels/errors/empty states, `overflow-x-hidden` on `main`. If the longest
locale still overflows at the pixel gate, the fix is layout slack or a Concise-pass
rewrite — never cutting a mandatory disclosure.

### Writing rules that translate well
- **Never concatenate strings** — "You have " + n + " messages" breaks grammar, gender,
  and plural rules in other languages. Use complete, **parameterized strings with
  proper pluralization**; keep variables labeled so translators know what `{0}` is.
- Full grammatical sentences — fragments and clever ellipses don't survive re-ordering.
- Avoid idioms, metaphors, humor, and cultural references. If an idiom is genuinely the
  clearest option in the dev language, ship it with a plain literal alternate in a code
  comment for localization teams.
- **Formats are locale-specific** — date, time, number, and currency come from the
  lock's `content.formats`, never hard-coded (RO specifics: comma decimals `1.234,56`,
  `DD.MM.YYYY`, 24-hour `18:00`, lei/RON split — see `microcopy-voice.md`).

### RTL
Plan Arabic/Hebrew mirroring early — a left-biased layout is costly to flip later.
Directional words ("next", "back", "left") and directional icons may need to mirror.

### Pseudolocalization
Before real translations exist, test with a pseudo-locale: extended look-alike
characters plus length padding ("Account" → "[Àççôûñt␣␣␣]"). Surfaces expansion
overflow, truncation, hard-coded strings, and special-character handling early —
cheap insurance before the pixel gate does it the expensive way.

### Process
- Involve in-market users or cultural consultants, not just translators — translation
  handles words; localization handles meaning.
- Audit icons/illustrations for cultural neutrality before going international.
- For a Brussels/Romania bank, plan at least **FR / NL / DE / EN / RO**. Legal and
  disclosure strings in every locale require certified translation (`⚠ Legal`).
