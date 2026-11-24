# runtime/figma — scripts for Figma's plugin sandbox

The Figma MCP's `use_figma` tool runs plain JavaScript inside Figma's plugin sandbox: top-level
`await`, a `return` value, and nothing else comes back. The three files here are written for it.
The model pastes a file's text into `use_figma` unchanged, edits at most the one constant on its
first lines, and pastes what comes back into `capture.json` beside the other MCP results before
`scripts/capture-figma.mjs` runs. Rules shared by all three: `CONTRACT.md` §Plugin-sandbox scripts.
Where they sit in the capture flow: `references/spec-capture.md` §Plugin-API inventory.

Why they exist: the MCP's summary tool (`get_variable_defs`) returns composite strings that drop
the letter-spacing unit, flatten modes into names, and say nothing about a variable's declared
scopes. The Plugin API carries all three. `inventory.js` reads them and writes the capture-side
shape with the units inline, so the bare value that forces `letterSpacingUnit` never arises.

## Read-only, held by a test

A script reads the document and never writes it. `fixtures/capture/plugin-scripts.test.mjs`
scans every file here for the Plugin API's writing members and for an assignment to a property of
a document object, fails on any, and proves the scan fires on planted writes. The one state a
script may change is the viewer's current page (`setCurrentPageAsync`, at most once per call):
the Plugin API loads a page's content only when it is current. Document objects are bound only to
the short names the guard knows (`figma node n root page p s v c e m l target tc inst comp child
style variable collection`); a script's own output lives in `out`.

## Pinned by a mock, not by a live file

The same test runs each script under a mock of the Plugin API shaped from
`@figma/plugin-typings` **1.143.0** (`LetterSpacing {value, unit}`, `LineHeight` with `AUTO`,
`Variable.valuesByMode` with aliases and composed colours, `VariableCollection.modes`,
`TextStyle.fontName`, `SolidPaint.opacity`, `DropShadowEffect`, `findAllWithCriteria`,
`componentPropertyDefinitions`) and feeds `inventory.js`'s output to the real
`capture-figma.mjs`. No live Figma file is in the suite. A live run that disagrees with the mock is
a finding against the mock first: fix the mock to the typings, then the script. Figma's MCP and
its `use_figma` tool are outside this repository and change on their own clock.

## inventory.js — styles and variables, with units, modes and scopes

- **Input:** `NUMBER_MODE` (default `''`): the mode name a multi-mode collection contributes for
  FLOAT and STRING variables. A responsive collection holds one spacing scale per breakpoint and
  the lock holds one, so numbers are written once; `''` takes each collection's default mode.
  COLOR variables are written once per mode regardless (`<Mode name>/<variable name>`), which is
  the theme-namespaced shape `capture-figma.mjs` already maps to `tokens.colors.light` and `.dark`.
- **Output:** `variableDefs` (name → value: hex with an 8-digit form when the opacity is under 1,
  a number, a string, a `Font(...)` composite per text style with `lineHeight` and
  `letterSpacing` units inline, a colour per single-solid paint style, an `Effect(...)` chain per
  drop-shadow effect style), `variableScopes` (the same keys → the variable's `scopes`),
  `styles` (per text style: family, style, size, the units, text case, whether remote),
  `collections` (modes and the default), `libraries` (subscribed library variable collections, by
  name and key), `counts`, `notes`.
- **Aliases** are followed across collections (the mode matched by name there, else that
  collection's default), eight hops at most, and counted. A composed colour (a colour alias plus
  an opacity) becomes one hex.
- **Not written, said in `notes[]`:** a BOOLEAN, EASING or TIMING variable; a paint style that is
  a gradient, an image or more than one layer; a text style whose line height is `AUTO` (the
  value is the font's own and must be measured before the role can enter the lock); any effect
  layer that is not a drop shadow; a name that collides with one already written. Library
  variables are never read here: capture them from the library file's own key.
- **Paste:** the whole file. Then `capture.json` takes `variableDefs` and `variableScopes` as they
  are, and the rest goes to the capture notes.

## components.js — one page's component sets and solo components

- **Input:** `PAGE_ID` (default `''` = the current page). One page per call, because a
  `use_figma` call may switch pages once; fan pages out across calls.
- **Output:** `page`, `sets[]` (id, name, key, remote, variant count, the property definitions
  with their variant options), `solos[]` (components outside a set, with width and height),
  `truncated` past 300 entries per list, `notes`.
- **Use:** the seeds of `components/INDEX.md` (name → nodeId) and, where Code Connect is empty,
  of the Phase-A bootstrap (`references/mode-a.md`). Values are not read here; a component's
  anatomy still comes from `get_design_context` on its instance.

## binding-census.js — how much of a sheet's masters is bound

Adapted from the post-write audit in claude2figma (Sen Lin, MIT; `NOTICE`): the same per-property
test (a text style id, a fill or stroke style or a bound paint colour, an effect style, a bound
padding, gap and corner radius), turned from a pass/fail on the agent's own nodes into a census of
the design system's masters.

- **Input:** `NODE_IDS` (default `[]` = every component and component set on the current page,
  descendants included; 4,000 nodes at most, then `truncated`).
- **Output:** `totals` per property class (`text fill stroke effect padding gap radius`, each
  `{bound, raw}`), `rawColours` (hex → how many raw solid fills and strokes paint it),
  `rawNumbers` (`padding:16`, `gap:8`, `radius:12` → counts), `worst[]` (the forty nodes with
  the most raw properties, named), `nodes`, `notes`.
- **What the numbers mean for the capture:** a raw ratio is how much of the system its variable
  sheet does not say. Raw paddings and radii on the masters are the "spacing and radius are
  often not variables" case measured instead of assumed, and the `rawNumbers` keys are the scale
  to harvest into `tokens.spacing` and `tokens.radii`. A `rawColours` hex that is close to a
  variable's value but not equal is a swatch-versus-implementation candidate: record it as a
  `decisions[]` entry, never average it (`references/spec-capture.md` §Swatch vs implementation).
  The census says nothing about correctness, only about binding.
