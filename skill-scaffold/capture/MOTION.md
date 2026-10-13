# {{SYSTEM_TITLE}} — Motion, hover & responsive behavior

Captured from the live references named in `BRAND-FACTS.md` §Sources — static captures cannot
express motion, so these values come from the running product, and each one cites where it was
read (a compiled interactions config beats eyeballing; name the file or selector). When two
references disagree, record BOTH — a primary and its recorded alternates — and never pick one
silently; the choice is a DECISIONS.md row.

Durations and easings enter the lock as `tokens.motion` entries by NAME; templates and screens
consume the token, never the literal. The pixel gate cannot see motion: every report says what
motion was reviewed and how.

Films and clicker decks (`templates/motion/MOTION-LAYOUTS.md`) read these entries at run time: the kit takes
`--motion-<name>` (a duration) and `--motion-ease-<name>` (a CSS easing) from `assets/tokens.css`, and a
piece names ROLES (`enter exit cut`, `ease.enter ease.exit ease.move`) that point at those names. An
entry recorded only here and never carried into `tokens.motion` is invisible to the kit, so a motion
entry is finished when it is in the lock and `tokens.css` has been re-derived.

## Entries

Per entry: element/interaction · duration · easing · source · notes (what triggers it, and
what must NOT happen).
