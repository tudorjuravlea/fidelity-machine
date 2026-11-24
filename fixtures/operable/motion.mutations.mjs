// Planted breaks for the operability audit's reduced-motion pass (reduced-motion-loss, motion-not-reduced).
//   node scripts/mutation-run.mjs fixtures/operable/motion.mutations.mjs
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
    "fixtures/operable/motion.test.mjs"
  ],
  "mutations": [
    {
      "name": "motion: never read",
      "find": "    if (motion) facts.motion = await measureReducedMotion(page);",
      "replace": ""
    },
    {
      "name": "motion: read even when turned off",
      "find": "    if (motion) facts.motion = await measureReducedMotion(page);",
      "replace": "    facts.motion = await measureReducedMotion(page);"
    },
    {
      "name": "motion: both reads under the same preference",
      "find": "    const reduced = await read('reduce');",
      "replace": "    const reduced = await read('no-preference');"
    },
    {
      "name": "motion: the first read under reduce",
      "find": "    const normal = await read('no-preference');",
      "replace": "    const normal = await read('reduce');"
    },
    {
      "name": "motion: the preference not handed back",
      "find": "    await page.emulateMedia({ reducedMotion: opened }).catch(() => {});",
      "replace": ""
    },
    {
      "name": "motion: every lost element reported, not the outermost",
      "find": "const lost = gone.filter((key) => !goneSet.has(normal.parents[key]))",
      "replace": "const lost = gone"
    },
    {
      "name": "motion: lost count dropped",
      "find": ".length }));\n    return { elements: normal.visible.length",
      "replace": ".length * 0 }));\n    return { elements: normal.visible.length"
    },
    {
      "name": "motion: entrance animations not waited for",
      "find": "if (!busy || performance.now() - started >= limit) requestAnimationFrame(() => requestAnimationFrame(resolve));",
      "replace": "if (true) requestAnimationFrame(() => requestAnimationFrame(resolve));"
    },
    {
      "name": "motion: a fade counted as motion",
      "find": "].filter((prop) => GEOMETRY.test(prop)); } catch { props = []; }",
      "replace": "]; } catch { props = []; }"
    },
    {
      "name": "motion: `all` and colour transitions counted",
      "find": "const props = cs.transitionProperty.split(',').map((t) => t.trim()).filter((prop) => GEOMETRY.test(prop));",
      "replace": "const props = cs.transitionProperty.split(',').map((t) => t.trim());"
    },
    {
      "name": "motion: busy regions judged",
      "find": "    if (el.closest('[aria-busy=\"true\"], [role=\"status\"], [role=\"progressbar\"], [role=\"alert\"]')) return;",
      "replace": ""
    },
    {
      "name": "motion: animations not read",
      "find": "      if (duration >= minMs && props.length) { moving.push(",
      "replace": "      if (false) { moving.push("
    },
    {
      "name": "motion: transitions not read",
      "find": "    if (props.length && ms(cs.transitionDuration) >= minMs) moving.push(",
      "replace": "    if (false) moving.push("
    },
    {
      "name": "motion: loss level lowered",
      "find": "add('reduced-motion-loss', 'ERROR', lost.desc",
      "replace": "add('reduced-motion-loss', 'WARN', lost.desc"
    },
    {
      "name": "motion: not-reduced level raised",
      "find": "add('motion-not-reduced', 'WARN', m.desc",
      "replace": "add('motion-not-reduced', 'ERROR', m.desc"
    },
    {
      "name": "motion: findings not grouped",
      "find": "    const key = `${m.kind} ${m.name ?? ''} ${m.ms} ${m.props}`;\n    const g = motions.get(key)",
      "replace": "    const key = `${m.desc}`;\n    const g = motions.get(key)"
    },
    {
      "name": "motion: elements not counted",
      "find": "      motionElements: facts.motion?.elements ?? 0,",
      "replace": "      motionElements: 0,"
    },
    {
      "name": "motion: manual line never says the pass was off",
      "find": "facts.motion ? MANUAL_MOTION : MANUAL_NO_MOTION,",
      "replace": "MANUAL_MOTION,"
    },
    {
      "name": "motion: a keyframe time offset read as movement",
      "find": "|margin|offset[A-Z-])/;",
      "replace": "|margin|offset)/;"
    },
    {
      "name": "motion: opacity 0 counted as visible",
      "find": "el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))) return;\n    visible.push(key);",
      "replace": "el.checkVisibility({ visibilityProperty: true }))) return;\n    visible.push(key);"
    }
  ]
};
