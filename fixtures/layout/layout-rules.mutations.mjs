// Planted breaks for the layout audit's text-clipped and control-overlap rules.
//   node scripts/mutation-run.mjs fixtures/layout/layout-rules.mutations.mjs
// The suite named below must fail for every one. A break that no longer applies fails the run.
export default {
  "target": "scripts/layout-audit-core.mjs",
  "copy": [
    "scripts",
    "fixtures/layout",
    "fixtures/golden"
  ],
  "test": [
    "node",
    "--test",
    "fixtures/layout/layout-audit.test.mjs"
  ],
  "mutations": [
    {
      "name": "text-clipped: inline boxes judged",
      "find": "text.length > 2 && cs.display !== 'inline' && !el.matches",
      "replace": "text.length > 2 && !el.matches"
    },
    {
      "name": "text-clipped: ellipsis not honoured",
      "find": "if (clipsX && cs.textOverflow !== 'ellipsis' && overX > 2) {",
      "replace": "if (clipsX && overX > 2) {"
    },
    {
      "name": "text-clipped: line clamp not honoured",
      "find": "} else if (clipsY && !clamped && overY > px(cs.fontSize) * 0.5) {",
      "replace": "} else if (clipsY && overY > px(cs.fontSize) * 0.5) {"
    },
    {
      "name": "text-clipped: vertical cut never reported",
      "find": "overY > px(cs.fontSize) * 0.5) {",
      "replace": "overY > 99999) {"
    },
    {
      "name": "text-clipped: horizontal cut never reported",
      "find": "cs.textOverflow !== 'ellipsis' && overX > 2) {",
      "replace": "cs.textOverflow !== 'ellipsis' && overX > 99999) {"
    },
    {
      "name": "text-clipped: a scroller counted as clipping",
      "find": "const clipsX = ['hidden', 'clip'].includes(cs.overflowX)",
      "replace": "const clipsX = ['hidden', 'clip', 'auto'].includes(cs.overflowX)"
    },
    {
      "name": "text-clipped: words of descendants counted as its own",
      "find": "        for (const n of own) {\n          const range = document.createRange();\n          range.selectNodeContents(n);\n          for (const b of range.getClientRects()) {\n            if (b.width < 0.5) continue;\n            overX",
      "replace": "        for (const n of textLeaves(el)) {\n          const range = document.createRange();\n          range.selectNodeContents(n);\n          for (const b of range.getClientRects()) {\n            if (b.width < 0.5) continue;\n            overX"
    },
    {
      "name": "text-clipped: short text floor raised",
      "find": "(clipsX || clipsY) && text.length > 2",
      "replace": "(clipsX || clipsY) && text.length > 200"
    },
    {
      "name": "text-clipped: level raised to ERROR",
      "find": "add('text-clipped', 'WARN', el, `cuts",
      "replace": "add('text-clipped', 'ERROR', el, `cuts"
    },
    {
      "name": "text-clipped: a moving box judged anyway",
      "find": "if (moving(el)) defer(el, 'a clipping text box is animating');\n      else {",
      "replace": "if (false) defer(el, 'a clipping text box is animating');\n      else {"
    },
    {
      "name": "text-clipped: axis mislabelled",
      "find": "{ axis: 'y', hidden: round(overY)",
      "replace": "{ axis: 'x', hidden: round(overY)"
    },
    {
      "name": "control-overlap: threshold raised",
      "find": "if (share <= 0.25) continue;",
      "replace": "if (share <= 0.9) continue;"
    },
    {
      "name": "control-overlap: threshold dropped to any touch",
      "find": "if (share <= 0.25) continue;",
      "replace": "if (share <= 0) continue;"
    },
    {
      "name": "control-overlap: layers ignored",
      "find": "|| b.el.contains(a.el) || a.layer !== b.layer) continue;",
      "replace": "|| b.el.contains(a.el)) continue;"
    },
    {
      "name": "control-overlap: nesting judged",
      "find": "if (a.el.contains(b.el) || b.el.contains(a.el) || a.layer !== b.layer) continue;",
      "replace": "if (a.layer !== b.layer) continue;"
    },
    {
      "name": "control-overlap: a control placed inside another judged",
      "find": "if ((b.positioned && within(b.box, a.box)) || (a.positioned && within(a.box, b.box))) continue;",
      "replace": ""
    },
    {
      "name": "control-overlap: hidden overflow not applied",
      "find": "if (ac.overflowY !== 'visible') { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }",
      "replace": ""
    },
    {
      "name": "control-overlap: bounding box instead of line rects",
      "find": "    for (const b of el.getClientRects()) {\n      let left = b.left, right = b.right, top = b.top, bottom = b.bottom;",
      "replace": "    for (const b of [el.getBoundingClientRect()]) {\n      let left = b.left, right = b.right, top = b.top, bottom = b.bottom;"
    },
    {
      "name": "control-overlap: share measured against the larger control",
      "find": "const [small, big] = area(a.rects) <= area(b.rects) ? [a, b] : [b, a];",
      "replace": "const [small, big] = area(a.rects) > area(b.rects) ? [a, b] : [b, a];"
    },
    {
      "name": "control-overlap: never counted as checked",
      "find": "    checked.interactive = pressable.length;",
      "replace": ""
    },
    {
      "name": "control-overlap: level raised to ERROR",
      "find": "add('control-overlap', 'WARN', small.el",
      "replace": "add('control-overlap', 'ERROR', small.el"
    }
  ]
};
