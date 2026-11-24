// Planted breaks for the operability audit's target-size pass.
//   node scripts/mutation-run.mjs fixtures/operable/targets.mutations.mjs
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
    "fixtures/operable/targets.test.mjs"
  ],
  "mutations": [
    {
      "name": "targets: never measured",
      "find": "      if (targets) {\n        const floor",
      "replace": "      if (false) {\n        const floor"
    },
    {
      "name": "targets: measured even when turned off",
      "find": "      if (targets) {\n        const floor",
      "replace": "      if (true) {\n        const floor"
    },
    {
      "name": "targets: phone-runnable pages held to 24",
      "find": "? TARGET_FLOOR_TOUCH : TARGET_FLOOR;\n        const controls",
      "replace": "? TARGET_FLOOR : TARGET_FLOOR;\n        const controls"
    },
    {
      "name": "targets: every page held to 44",
      "find": "? TARGET_FLOOR_TOUCH : TARGET_FLOOR;\n        const controls",
      "replace": "? TARGET_FLOOR_TOUCH : TARGET_FLOOR_TOUCH;\n        const controls"
    },
    {
      "name": "targets: click-only elements counted as targets",
      "find": "    if (!isControl.has(el.getAttribute('data-operable-n'))) continue;\n",
      "replace": ""
    },
    {
      "name": "targets: one-pixel inputs counted",
      "find": "if (!(r.width > 2 && r.height > 2) || !el.checkVisibility",
      "replace": "if (!(r.width > 0 && r.height > 0) || !el.checkVisibility"
    },
    {
      "name": "targets: browser-drawn controls judged",
      "find": "    if (el.matches('input, select') && getComputedStyle(el).appearance !== 'none') continue;\n",
      "replace": ""
    },
    {
      "name": "targets: author-drawn inputs exempt too",
      "find": "if (el.matches('input, select') && getComputedStyle(el).appearance !== 'none') continue;",
      "replace": "if (el.matches('input, select')) continue;"
    },
    {
      "name": "targets: disabled controls judged",
      "find": "    if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || getComputedStyle(el).pointerEvents === 'none') continue;\n    let left = r.left",
      "replace": "    let left = r.left"
    },
    {
      "name": "targets: the label not counted as part of the target",
      "find": "      if (lr.width > 0 && lr.height > 0) { left = Math.min(left, lr.left); top = Math.min(top, lr.top); right = Math.max(right, lr.right); bottom = Math.max(bottom, lr.bottom); }",
      "replace": ""
    },
    {
      "name": "targets: the inline exception dropped",
      "find": "    if (!small(t) || t.inline) continue;",
      "replace": "    if (!small(t)) continue;"
    },
    {
      "name": "targets: the inline exception given to any inline element",
      "find": "    const inline = getComputedStyle(el).display === 'inline'\n      && [...(el.parentElement?.childNodes ?? [])].some((n) => n.nodeType === 3 && n.textContent.trim());",
      "replace": "    const inline = getComputedStyle(el).display.startsWith('inline');"
    },
    {
      "name": "targets: the spacing exception dropped",
      "find": "    if (near) out.push(",
      "replace": "    out.push(near === null ? { desc: describe(t.el), width: Math.round(t.width), height: Math.round(t.height), near: 'nothing' } : "
    },
    {
      "name": "targets: a full-size neighbour ignored",
      "find": "        if (Math.hypot(dx, dy) < radius) { near = o; break; }",
      "replace": ""
    },
    {
      "name": "targets: a small neighbour ignored",
      "find": "        if (Math.hypot((o.left + o.right) / 2 - cx, (o.top + o.bottom) / 2 - cy) < floor) { near = o; break; }",
      "replace": ""
    },
    {
      "name": "targets: only height tested",
      "find": "const small = (t) => t.width < floor - 0.5 || t.height < floor - 0.5;",
      "replace": "const small = (t) => t.height < floor - 0.5;"
    },
    {
      "name": "targets: findings not grouped by size",
      "find": "    const key = `${t.width}x${t.height}`;\n    const g = sizes.get(key)",
      "replace": "    const key = `${t.desc}`;\n    const g = sizes.get(key)"
    },
    {
      "name": "targets: level raised to ERROR",
      "find": "add('target-size', 'WARN', t.desc",
      "replace": "add('target-size', 'ERROR', t.desc"
    },
    {
      "name": "targets: not counted",
      "find": "      targets: facts.targets?.judged ?? 0,",
      "replace": "      targets: 0,"
    },
    {
      "name": "targets: manual line never says the pass was off",
      "find": "...(facts.targets ? [] : [MANUAL_NO_TARGETS]),",
      "replace": ""
    }
  ]
};
