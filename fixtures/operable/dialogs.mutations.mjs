// Planted breaks for the operability audit's dialog pass (dialog-focus).
//   node scripts/mutation-run.mjs fixtures/operable/dialogs.mutations.mjs
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
    "fixtures/operable/dialogs.test.mjs"
  ],
  "mutations": [
    {
      "name": "dialogs: never opened",
      "find": "    if (dialogs) facts.dialogs = await driveDialogs(page, maxDialogs);",
      "replace": ""
    },
    {
      "name": "dialogs: opened even when the driven passes are off",
      "find": "    if (dialogs) facts.dialogs = await driveDialogs(page, maxDialogs);",
      "replace": "    facts.dialogs = await driveDialogs(page, maxDialogs);"
    },
    {
      "name": "dialogs: a trigger that opens nothing is not a fault",
      "find": "      if (!opened.opened) { results.push({ ...t, faults: [{ fault: 'did-not-open' }] }); continue; }",
      "replace": "      if (!opened.opened) { results.push({ ...t, faults: [] }); continue; }"
    },
    {
      "name": "dialogs: focus left outside is not a fault",
      "find": "      if (!opened.inside) faults.push({ fault: 'focus-stayed-outside', dialog: opened.dialog, where: opened.where });",
      "replace": ""
    },
    {
      "name": "dialogs: Tab never walked",
      "find": "      if (opened.modal === 'declared') {",
      "replace": "      if (false) {"
    },
    {
      "name": "dialogs: a non-modal panel held to the trap",
      "find": "      if (opened.modal === 'declared') {",
      "replace": "      if (opened.modal !== 'native') {"
    },
    {
      "name": "dialogs: the native modal walked too",
      "find": "      if (opened.modal === 'declared') {",
      "replace": "      if (true) {"
    },
    {
      "name": "dialogs: Escape not pressed",
      "find": "      await page.keyboard.press('Escape');\n",
      "replace": ""
    },
    {
      "name": "dialogs: an ignored Escape is not a fault",
      "find": "        faults.push({ fault: 'escape-ignored', dialog: opened.dialog });\n",
      "replace": ""
    },
    {
      "name": "dialogs: a stuck dialog not closed for the next",
      "find": "        closed = await page.evaluate((settle) => window.__operabilityDialogs.forceClose(settle), DIALOG_SETTLE_MS);",
      "replace": ""
    },
    {
      "name": "dialogs: focus not returning is not a fault",
      "find": "        faults.push({ fault: 'focus-not-returned', dialog: opened.dialog, where: s.where });",
      "replace": ""
    },
    {
      "name": "dialogs: focus not put inside after the first fault",
      "find": "      if (!inside) (dialog.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])') ?? dialog).focus?.();",
      "replace": ""
    },
    {
      "name": "dialogs: the trigger not focused before the press",
      "find": "      el.focus({ preventScroll: true });\n      el.click();",
      "replace": "      el.click();"
    },
    {
      "name": "dialogs: any control counted as a trigger",
      "find": "      if (el.getAttribute('aria-haspopup') !== 'dialog' && !named) return null;",
      "replace": "      if (false) return null;"
    },
    {
      "name": "dialogs: aria-controls naming a dialog not counted",
      "find": "      if (el.getAttribute('aria-haspopup') !== 'dialog' && !named) return null;",
      "replace": "      if (el.getAttribute('aria-haspopup') !== 'dialog') return null;"
    },
    {
      "name": "dialogs: dialogs left open",
      "find": "      const closer = [...d.querySelectorAll('button, [role=\"button\"]')].find(",
      "replace": "      const closer = [].find("
    },
    {
      "name": "dialogs: focus left where the pass ended",
      "find": "document.activeElement?.blur?.(); },\n  };\n}",
      "replace": "},\n  };\n}"
    },
    {
      "name": "dialogs: not counted",
      "find": "      dialogs: facts.dialogs?.results.length ?? 0,",
      "replace": "      dialogs: 0,"
    },
    {
      "name": "dialogs: level lowered",
      "find": "add('dialog-focus', 'ERROR', run.desc",
      "replace": "add('dialog-focus', 'WARN', run.desc"
    },
    {
      "name": "dialogs: manual line never says the pass was off",
      "find": "facts.dialogs ? MANUAL_DIALOGS : MANUAL_NO_DIALOGS,",
      "replace": "MANUAL_DIALOGS,"
    },
    {
      "name": "dialogs: Shift+Tab never walked",
      "find": "if (await walk('Tab', Math.max(6, opened.focusables * 2 + 2))) await walk('Shift+Tab', 3);",
      "replace": "await walk('Tab', Math.max(6, opened.focusables * 2 + 2));"
    }
  ]
};
