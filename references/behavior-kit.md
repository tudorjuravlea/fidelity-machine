# Behaviour kit: making a screen work without changing how it looks

The lock decides how a component looks. This file is about what it does: which keys it answers,
where focus goes, what a screen reader is told. Those are easy to get subtly wrong by hand, and a
screen that only looks like tabs is a picture of tabs.

The engine vendors a behaviour runtime for this: UI SDK (Vercel, Apache-2.0,
github.com/vercel-labs/ui), pinned to one version in `ENGINE/runtime/ui-sdk/`, credited in NOTICE.
It is headless: its elements carry no look of their own. They wrap the design system's own markup
and write the role, the ARIA, the tab stops and the state onto it. Every class, token and pixel
stays the lock's. The same project's checker is what `operability-audit.mjs` drives to prove it.

## The split

| Comes from | What |
|---|---|
| The lock and the component library | Markup, classes, tokens, sizes, every pixel |
| The runtime | Roles, ARIA, tab stops, arrow keys, focus on open and on close, dismissal, state attributes |
| `operability-audit.mjs` | Proof that the result has names, references, reach, a visible focus, and keys that work |

Wrapping a component must not move a pixel. The engine's own test wraps the golden screen's button
and compares the two screenshots byte for byte. If the pixel gate moves after a wrap, the wrap
changed the look: fix the CSS, never the threshold.

## Set-up

1. `node ENGINE/scripts/ui-sdk.mjs link --lock <lock>` puts the runtime inside the capture as
   `<lockDir>/ui-sdk`, so it loads from the lock's own tree and renders under an offline lock.
2. In the screen's head: `<script type="module" src="ui-sdk/web.js"></script>`. Nothing else. It
   defines an element the first time its tag appears.
3. Never load it from the network, and never load its `web.css`: that is its default look, it is
   not vendored, and the look comes from the lock.

## Wrapping our markup

- Find the component in `ENGINE/runtime/ui-sdk/COMPOSITION.md`: the tree of parts and one example,
  cut from the docs of the vendored version. Use that file, not memory: tags change between betas.
- Where a part wraps a native element (a button, an input), write **our** element inside it, with
  our classes: `<ui-tabs-tab value="a"><button class="segment">Overview</button></ui-tabs-tab>`.
- Do not write `role`, `aria-*`, `tabindex` or ids on a wrapped part. The runtime writes them, and
  a second writer drifts. Names are the exception: `aria-label` and `aria-labelledby` are yours.
- **Do not hand-roll what the kit ships.** A `div` with `role="tablist"`, `"menu"`, `"dialog"`,
  `"listbox"`, `"switch"`, `"slider"`, `"radiogroup"` or `"tree"` in a screen that has the kit is
  almost always a defect waiting for the audit to find it.
- Custom elements are inline by default. A part that should lay out as a block or a flex row takes
  the component's own class, as any element would.

## Styling state

The runtime tells the CSS what state a part is in. Style from that, never from a class a script
toggles and never from an inline style.

- Presence attributes: `data-open`, `data-closed`, `data-checked`, `data-unchecked`,
  `data-indeterminate`, `data-selected`, `data-highlighted`, `data-pressed`, `data-disabled`,
  `data-readonly`, `data-invalid`, `data-pending`. Valued ones only for layout: `data-side`,
  `data-align`, `data-orientation`.
- A closed part is `hidden`. A rule that gives a part a `display` beats the browser's own
  `[hidden]` rule, so pair it: `.panel { display: block } .panel[hidden] { display: none }`.
- Enter and exit: `data-starting-style` on the first frame, `data-ending-style` while leaving. The
  part stays in the page until its exit finishes. Durations and curves come from `tokens.motion`.
- Keyboard highlight in a list or a menu: `[data-modality="keyboard"] [data-highlighted]`, since
  focus there may be virtual and never match `:focus-visible`.
- Measurements arrive as CSS variables on the part (`--anchor-width`, `--available-height`,
  `--transform-origin`, and one set per component). Read them; do not measure in script.
- Popups open in the browser's top layer, in place: no portal, and `::backdrop` is the backdrop.
  Do not nest a popup inside a clickable card or a link: its clicks bubble through it.
- Every state the lock's component spec draws needs a rule: a state with no rule is a state that
  looks like the default. Hover, focus-visible, pressed, selected, disabled, invalid, open.

## A component library written in React

The same parts exist for React, and the engine pins that build at the same version
(`@ui-sdk/react` in the engine's `package.json`, exact, held to the vendored version by
`ui-sdk.mjs verify`). `build-component-fixture.mjs` bundles it into the fixture page, so nothing
is loaded when the page renders.

- Import each component from its own entry: `import { Tabs, TabsList, TabsTab, TabsPanel } from
  '@ui-sdk/react/tabs'`. The part names are the web tags in Pascal case; `COMPOSITION.md` shows
  the same tree.
- The parts render their own elements and take `className`. Change a part's element with its
  `render` prop, never by wrapping it in another element.
- Put the behaviour **inside** the library component, once. Mode A forbids restyling a bound
  component from a screen, and the same holds for behaviour: a screen composes the component, it
  does not wrap it again.
- Style from the same state attributes as above. A part that the runtime hides carries `hidden`.
- After adding behaviour to a component, re-run its component-scale pixel gate and record the new
  `sourceSha`: the source changed, so its verification is stale until it passes again.

## Names

Every control needs an accessible name, and a group needs one too. Visible text first, then
`aria-labelledby` pointing at visible text, then `aria-label`. In a row of repeated controls give
each a name of its own ("Actions for the March invoice"), not the same word eight times.

Known gap in the vendored version (0.1.0-beta.10): a radio group inside `ui-field` is not named by
the field's label in the web components build, although the upstream docs show that markup, and
the upstream checker does not notice. Name the group itself with `aria-labelledby`. The audit's
`unnamed-group` rule catches it, and a test in `fixtures/operable/` fails on the day an update
closes the gap: delete this paragraph then.

## Readiness

The elements upgrade just after load. Signal readiness after they have:

```js
const tags = [...new Set([...document.querySelectorAll('*')].map((el) => el.localName).filter((n) => n.startsWith('ui-')))];
await Promise.all([document.fonts.ready, ...tags.map((tag) => customElements.whenDefined(tag))]);
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.setAttribute('data-render-ready', '')));
```

A screen that shows a state (a dialog open, a menu open, a tab other than the first) is its own
lock screen: render it in that state with the component's `default-*` attribute, and audit it
there. The audit drives only what is rendered.

## Proving it

Declare the screen `"operable": true` in the lock and `verify.mjs` runs the audit as a gate; or
run it alone: `node ENGINE/scripts/operability-audit.mjs --lock <lock> --screen <id>`. It reads the
rendered page, then hands every tab list, radio group, toolbar, tree, listbox, combobox, slider, switch,
checkbox, menubar, open menu and open dialog to the checker, which presses the pattern's keys and
reports where focus and state did not follow. The checker reads only roles, ARIA, tabindex and
focus, so it judges hand-written markup the same way. A picture of a widget fails it, by design;
It then clicks every two-state toggle (a pressed button, a disclosure, a custom switch, an
unselected tab): the state must change, and the page must look different once it has. A toggle
that flips `aria-checked` and nothing else is announced to a screen reader and invisible to
everyone else. `--no-patterns` leaves the keys and the clicks out, for a screen that is meant to be
a picture, and the report says it was used.

## What the kit does not cover here

- **Bespoke components.** The runtime exports its building blocks from `ui-sdk/web/core.js` for a
  component it does not ship. That is real engineering, not markup: decide focus on open, whether
  selection follows focus, who owns Escape and where focus goes when a part leaves, in writing,
  before any code. Prefer a shipped component.
- **Agents operating the page.** Upstream has tools for that. Not vendored.

## It is a beta, and a copy

- The folder is a pinned copy and is never edited by hand: `node ENGINE/scripts/ui-sdk.mjs verify`
  fails on a changed, missing or added file.
- `node ENGINE/scripts/ui-sdk.mjs outdated` compares it with the published latest. To move:
  read the upstream changelog, `ui-sdk.mjs update --version <v>`, run the engine's tests, then
  re-audit every prototype that links it. Tags and attributes can change between betas.
- A defect in the runtime is reported upstream and worked round in the screen. It is not patched
  in the copy.
