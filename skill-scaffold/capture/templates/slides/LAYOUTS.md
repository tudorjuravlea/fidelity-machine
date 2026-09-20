# Slide layouts — {{SYSTEM_TITLE}} deck system

Slides are NET-NEW surfaces: no capture reference exists, so they ship on lint + taste +
render + human review — never a fabricated diff number. Every layout is a translation of a
captured, verified section; nothing here invents off-system vocabulary. Canvas size comes
from `../../formats.json` (`screen.slide`).

## Type scale (slide medium)

Template-local sizes — slides are not in the lock's web type scale — but families, weights and
colors stay lock tokens, and the web hierarchy rules carry over unchanged. Fill from the lock,
scaled for viewing distance, and record the scale as a DECISIONS.md row:

- `slide-display` — cover title
- `slide-title` — content slide titles
- `slide-stat` — stat numbers
- `slide-subtitle` — divider subtitles, quote attribution
- `slide-body` — body copy, bullets
- `slide-caption` — captions, footers
- `slide-eyebrow` — eyebrow row, with the system's marker if it has one

## The six layouts

One file per layout, `<name>.html`, each declaring `[data-render-ready]`, in the canonical
deck order: `cover`, `divider`, `content`, `stats`, `quote`, `closing`. Per layout, record
here: which verified section it translates, its grid, and its slots.
