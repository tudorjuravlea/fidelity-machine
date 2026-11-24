// Planted breaks for the operability audit's contrast pass (text-contrast).
//   node scripts/mutation-run.mjs fixtures/operable/contrast.mutations.mjs
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
    "fixtures/operable/contrast.test.mjs"
  ],
  "mutations": [
    {
      "name": "contrast: transitions left running",
      "find": "  for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.finish();\n});\n\nasync function measureContrast",
      "replace": "});\n\nasync function measureContrast"
    },
    {
      "name": "contrast: never judged",
      "find": "      if (contrast) facts.contrast = await measureContrast(page, maxStates);",
      "replace": ""
    },
    {
      "name": "contrast: judged even when turned off",
      "find": "      if (contrast) facts.contrast = await measureContrast(page, maxStates);",
      "replace": "      facts.contrast = await measureContrast(page, maxStates);"
    },
    {
      "name": "contrast: text left in the plate",
      "find": "const HIDE = '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }';",
      "replace": "const HIDE = '*, *::before, *::after { text-shadow: none !important; }';"
    },
    {
      "name": "contrast: the plate style left on the page",
      "find": "      await style.evaluate((el) => el.remove()).catch(() => {});\n      await finishTransitions(page).catch(() => {});",
      "replace": "      await finishTransitions(page).catch(() => {});"
    },
    {
      "name": "contrast: alpha ignored",
      "find": "        const a = fg[3];\n",
      "replace": "        const a = 1;\n"
    },
    {
      "name": "contrast: group opacity ignored",
      "find": "      opacity *= Number(ac.opacity);\n",
      "replace": ""
    },
    {
      "name": "contrast: the average pixel decides instead of the palest tenth",
      "find": "const pick = ratios[Math.floor(ratios.length * 0.1)];",
      "replace": "const pick = ratios[Math.floor(ratios.length * 0.5)];"
    },
    {
      "name": "contrast: large text held to 4.5",
      "find": "needed: t.size >= 24 || (t.size >= 18.66 && t.bold) ? CONTRAST_LARGE : CONTRAST_TEXT });",
      "replace": "needed: CONTRAST_TEXT });"
    },
    {
      "name": "contrast: bold large text held to 4.5",
      "find": "t.size >= 24 || (t.size >= 18.66 && t.bold)",
      "replace": "t.size >= 24"
    },
    {
      "name": "contrast: everything treated as large",
      "find": "needed: t.size >= 24 || (t.size >= 18.66 && t.bold) ? CONTRAST_LARGE : CONTRAST_TEXT });",
      "replace": "needed: CONTRAST_LARGE });"
    },
    {
      "name": "contrast: disabled controls judged",
      "find": "      if (t.disabled) continue;\n      const m = paintedContrast",
      "replace": "      const m = paintedContrast"
    },
    {
      "name": "contrast: opted-out subtree judged",
      "find": "if (el.closest('svg, script, style, noscript, template, option, [data-operable-ignore]')) continue;",
      "replace": "if (el.closest('svg, script, style, noscript, template, option')) continue;"
    },
    {
      "name": "contrast: hidden overflow not applied",
      "find": "      if (ac.overflowX !== 'visible') { left = Math.max(left, ar.left); right = Math.min(right, ar.right); }\n      if (ac.overflowY !== 'visible') { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }\n    }\n    // Two ways",
      "replace": "    }\n    // Two ways"
    },
    {
      "name": "contrast: hover never judged",
      "find": "    judge(await page.evaluate(collectTexts, { within: n }), await plate(), 'hover');",
      "replace": ""
    },
    {
      "name": "contrast: focus never judged",
      "find": "    judge(await page.evaluate(collectTexts, { within: n }), await plate(), 'focus');",
      "replace": ""
    },
    {
      "name": "contrast: the pointer left on the last control",
      "find": "    await page.mouse.move(at[0], at[1]);\n    await finishTransitions(page);\n    judge(await page.evaluate(collectTexts, { within: n }), await plate(), 'hover');\n    await page.mouse.move(0, 0);",
      "replace": "    await page.mouse.move(at[0], at[1]);\n    await finishTransitions(page);\n    judge(await page.evaluate(collectTexts, { within: n }), await plate(), 'hover');"
    },
    {
      "name": "contrast: focus left on the last control",
      "find": "    await page.evaluate(() => document.activeElement?.blur?.());\n    await finishTransitions(page);\n  }",
      "replace": "    await finishTransitions(page);\n  }"
    },
    {
      "name": "contrast: a state reported although the text already fails at rest",
      "find": "    if (t.state !== 'rest' && rest && rest.ratio < rest.needed) continue;",
      "replace": ""
    },
    {
      "name": "contrast: passing text reported",
      "find": "    if (t.ratio >= t.needed) continue;",
      "replace": ""
    },
    {
      "name": "contrast: level raised to ERROR",
      "find": "add('text-contrast', 'WARN', t.desc",
      "replace": "add('text-contrast', 'ERROR', t.desc"
    },
    {
      "name": "contrast: modern colour syntax read as numbers",
      "find": "    const plain = /^rgba?\\(([^)]+)\\)$/.exec(css);",
      "replace": "    const plain = /^[a-z]+\\(([^)]+)\\)$/.exec(css);"
    },
    {
      "name": "contrast: manual line never says the pass was off",
      "find": "facts.contrast ? MANUAL_CONTRAST : MANUAL_NO_CONTRAST,",
      "replace": "MANUAL_CONTRAST,"
    },
    {
      "name": "contrast: texts not counted",
      "find": "    if (t.state === 'rest') textsJudged++; else statesJudged++;",
      "replace": ""
    }
  ]
};
