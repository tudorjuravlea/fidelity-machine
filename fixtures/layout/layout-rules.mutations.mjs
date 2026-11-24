// Planted breaks for the layout audit's text-clipped, control-overlap and colour-unbound rules.
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
    },
    {
      "name": "colour-unbound: solid red read as transparent",
      "find": "/^rgba\\((?:[^,]+,){3}\\s*0\\)$/.test(c)",
      "replace": "/,\\s*0\\)$/.test(c)"
    },
    {
      "name": "colour-unbound: colours inside a composite token not forced",
      "find": "        if (swapped !== v) forced.set(prop, swapped);",
      "replace": ""
    },
    {
      "name": "colour-unbound: channel triples not forced",
      "find": "      else if (/^[\\d.]+%?(?:\\s*[, ]\\s*[\\d.]+%?){2}$/.test(v)) forced.set(prop, v.includes(',') ? '1, 2, 3' : '1 2 3');",
      "replace": ""
    },
    {
      "name": "colour-unbound: themed scopes not read",
      "find": "for (const host of [document.documentElement, ...document.querySelectorAll('[data-theme]')]) {",
      "replace": "for (const host of [document.documentElement]) {"
    },
    {
      "name": "colour-unbound: transitions left running",
      "find": "transition: none !important; }`;",
      "replace": "}`;"
    },
    {
      "name": "colour-unbound: forced without !important",
      "find": "`${prop}: ${v} !important;`",
      "replace": "`${prop}: ${v};`"
    },
    {
      "name": "colour-unbound: white and black reported",
      "find": "if (value === 'rgb(255, 255, 255)' || value === 'rgb(0, 0, 0)') { anchors++; continue; }",
      "replace": ""
    },
    {
      "name": "colour-unbound: judged with no tokens on the page",
      "find": "  if (forced.size === 0) {\n    manual.push('This page declares no colour token",
      "replace": "  if (false) {\n    manual.push('This page declares no colour token"
    },
    {
      "name": "colour-unbound: the page left restyled",
      "find": "    const after = painted.map(paintsOf);\n    style.remove();",
      "replace": "    const after = painted.map(paintsOf);"
    },
    {
      "name": "colour-unbound: count not kept",
      "find": "        g.count++;\n        loose.set(key, g);",
      "replace": "        loose.set(key, g);"
    },
    {
      "name": "colour-unbound: SVG fills not read",
      "find": "          if (cs.fill !== 'none' && !clear(cs.fill)) out.push(['fill', cs.fill]);",
      "replace": ""
    },
    {
      "name": "colour-unbound: borders not read",
      "find": "      for (const c of sides) out.push(['border', c]);",
      "replace": ""
    },
    {
      "name": "colour-unbound: shadows not read",
      "find": "      if (cs.boxShadow !== 'none') out.push(['shadow', cs.boxShadow]);",
      "replace": ""
    },
    {
      "name": "colour-unbound: backgrounds not read",
      "find": "      if (!clear(cs.backgroundColor)) out.push(['background', cs.backgroundColor]);",
      "replace": ""
    },
    {
      "name": "colour-unbound: paints not counted",
      "find": "        checked.paints++;\n",
      "replace": ""
    },
    {
      "name": "colour-unbound: level raised to ERROR",
      "find": "add('colour-unbound', 'WARN', g.first",
      "replace": "add('colour-unbound', 'ERROR', g.first"
    },
    {
      "name": "colour-unbound: a moved colour reported as unbound",
      "find": "        if (!now.has(`${kind} ${value}`)) continue;",
      "replace": "        if (now.has(`${kind} ${value}`)) continue;"
    }
  ]
};
