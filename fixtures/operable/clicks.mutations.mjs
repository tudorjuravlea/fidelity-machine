// Planted breaks for the operability audit's click pass (dead-state, invisible-state).
//   node scripts/mutation-run.mjs fixtures/operable/clicks.mutations.mjs
// The suite named below must fail for every one. A break that no longer applies fails the run.
export default {
  "target": "scripts/operability-core.mjs",
  "copy": [
    "scripts",
    "fixtures/operable",
    "runtime/ui-sdk"
  ],
  "test": [
    "node",
    "--test",
    "fixtures/operable/clicks.test.mjs"
  ],
  "mutations": [
    {
      "name": "dead-state: an unchanged state passes",
      "find": "    if (run.after === run.before) {\n      add('dead-state'",
      "replace": "    if (false) {\n      add('dead-state'"
    },
    {
      "name": "dead-state: level lowered to WARN",
      "find": "add('dead-state', 'ERROR', run.desc",
      "replace": "add('dead-state', 'WARN', run.desc"
    },
    {
      "name": "invisible-state: never reported",
      "find": "} else if (run.changed < MIN_FOCUS_PIXELS) {\n      add('invisible-state'",
      "replace": "} else if (run.changed < 0) {\n      add('invisible-state'"
    },
    {
      "name": "invisible-state: ambient noise ignored",
      "find": "} else if (run.ambient >= MIN_FOCUS_PIXELS) {",
      "replace": "} else if (false) {"
    },
    {
      "name": "invisible-state: every changed state reported",
      "find": "} else if (run.changed < MIN_FOCUS_PIXELS) {\n      add('invisible-state'",
      "replace": "} else if (run.changed < 1e9) {\n      add('invisible-state'"
    },
    {
      "name": "clicks: skipped controls not surfaced",
      "find": "  deferred.push(...(facts.clicks?.skipped ?? []));\n",
      "replace": ""
    },
    {
      "name": "clicks: not counted",
      "find": "      clicks: facts.clicks?.results.length ?? 0,",
      "replace": "      clicks: 0,"
    },
    {
      "name": "clicks: manual line never says clicks were off",
      "find": "facts.clicks ? MANUAL_CLICKED : MANUAL_NOT_CLICKED",
      "replace": "MANUAL_CLICKED"
    },
    {
      "name": "clicks: disabled controls are pressed",
      "find": "  if (!c.visible || c.disabled) return null;\n  const two",
      "replace": "  if (!c.visible) return null;\n  const two"
    },
    {
      "name": "clicks: a real link is pressed",
      "find": "const isButton = c.role === 'button' || (c.role === null && c.native === 'button' && c.tag !== 'input');",
      "replace": "const isButton = c.role === 'button' || c.role === null;"
    },
    {
      "name": "clicks: aria-expanded not pressed",
      "find": "return two('aria-pressed') ?? two('aria-expanded');",
      "replace": "return two('aria-pressed');"
    },
    {
      "name": "clicks: a custom switch not pressed",
      "find": "if (['switch', 'checkbox', 'menuitemcheckbox'].includes(c.role)) return c.native === null || c.native === 'button' ? two('aria-checked') : null;",
      "replace": "if (['switch', 'checkbox', 'menuitemcheckbox'].includes(c.role)) return null;"
    },
    {
      "name": "clicks: a covered control is pressed anyway",
      "find": "    if (ready.over !== null) { skipped.push(`${c.desc} could not be clicked: ${ready.over} lies over its centre`); continue; }",
      "replace": ""
    },
    {
      "name": "clicks: toggles not put back",
      "find": "if (after !== ready.value && after !== null && attr !== 'aria-selected') await page.evaluate(press, { n: c.n, attr, was: after, settle: CLICK_SETTLE_MS });",
      "replace": ""
    },
    {
      "name": "clicks: the click is never made",
      "find": "      el.click();\n      const started",
      "replace": "      const started"
    },
    {
      "name": "clicks: on by default even when asked off",
      "find": "    if (clicks) {\n      const calm",
      "replace": "    if (true) {\n      const calm"
    },
    {
      "name": "clicks: the limit is not applied",
      "find": "for (const c of candidates.slice(0, maxClicks)) {",
      "replace": "for (const c of candidates) {"
    },
    {
      "name": "clicks: pixels compared against the wrong photograph",
      "find": "changed: countChangedPixels(before, pressed) });",
      "replace": "changed: countChangedPixels(pressed, pressed) });"
    },
    {
      "name": "clicks: a selected tab is pressed",
      "find": "if (attr === 'aria-selected' ? ready.value !== 'false' : !['true', 'false'].includes(ready.value)) continue;",
      "replace": "if (!['true', 'false'].includes(ready.value)) continue;"
    },
    {
      "name": "clicks: mixed is pressed",
      "find": "if (attr === 'aria-selected' ? ready.value !== 'false' : !['true', 'false'].includes(ready.value)) continue;",
      "replace": "if (attr === 'aria-selected' && ready.value !== 'false') continue;"
    }
  ]
};
