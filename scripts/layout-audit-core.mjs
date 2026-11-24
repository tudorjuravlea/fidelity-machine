// layout-audit-core.mjs — the self-consistency layout audit, run INSIDE the rendered page.
//
// geometry.mjs needs a ground truth (the lock's Figma rects) and skips a B2 screen by design. This
// audit needs none: it asks whether the laid-out boxes agree with themselves — a button whose text
// and padding need more height than its box, a container whose last child sits inside its own
// bottom padding, words a few pixels from a card's edge, a stat whose unit wrapped, type under
// 10 px, one-line rows three times taller than their words, a declared pane left mostly empty, one
// nav mixing filled and outline glyphs, an emoji standing in for an icon.
//
// render.mjs calls `page.evaluate(auditLayout, opts)` after the capture and writes the result to
// .render/<screen>.layout.json; layout-audit.mjs reads that and judges (CONTRACT.md §Invocation
// contract). The function is serialised into the page, so it must stay self-contained: no imports,
// no closures over module state, only the DOM and what it declares inside itself.
//
// Rules and levels (ERROR blocks the screen, WARN is listed):
//   control-box-fit         ERROR  content + padding + borders need more height than the control has
//   container-bottom-inset  ERROR  the last in-flow child sits inside the container's own bottom padding
//   control-edge-inset      WARN   content against one edge with near-zero padding, a real inset on the other
//   text-inset              WARN   a text leaf under 8 px from the left/right edge of the surface that owns it
//   small-text              WARN   rendered font-size under 10 px on visible text
//   unit-wrapped            WARN   a number and its short unit broken over two lines
//   fat-row                 WARN   in a list of >=3 one-line rows, >=2 rows taller than 3.4x their type and 48 px
//   empty-pane              WARN   [data-pane]: content stops more than max(100 px, 65 %) above the pane's bottom
//   mixed-icons             WARN   one nav/list/toolbar with filled-only and stroke-only svg glyphs side by side
//   emoji-icon              WARN   a lone emoji in a <= 56 px seat beside words
//   text-clipped            WARN   a box that cuts its own words (overflow hidden/clip) with no ellipsis or clamp
//   control-overlap         WARN   two controls in one layer sharing more than 25 % of the smaller one's area
//   colour-unbound          WARN   a painted colour that did not move when every colour token on the page was changed
// Opt-outs: `data-layout-ignore` on an element skips it and everything under it. Anything whose
// geometry is animating when the audit runs is DEFERRED (reported, not judged): a deferred item
// makes the run inconclusive (exit 6), never a pass.
//
// Thresholds follow the practice of product-illustration review tooling (words keep a 12 px inset,
// 8 is the floor; rows are their words plus 12 px of padding) and are stated in every message.

export function auditLayout(opts = {}) {
  const findings = [];
  const deferred = [];
  const manual = [];
  const checked = { controls: 0, paddedContainers: 0, textLeaves: 0, panes: 0, lists: 0, iconGroups: 0, interactive: 0, paints: 0 };
  const root = document.body;
  if (!root) return { findings, deferred, manual: ['no <body> to audit'], checked };

  const px = (v) => parseFloat(v) || 0;
  const round = (v) => Math.round(v * 100) / 100;
  const name = (el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${tag}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const add = (rule, level, el, message, evidence) => findings.push({ rule, level, element: name(el), message: `${rule}: ${name(el)} ${message}`, evidence });

  const ignored = (el) => !!el.closest('[data-layout-ignore]');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    let alpha = 1;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      alpha *= Number(cs.opacity);
      if (alpha < 0.05) return false;
    }
    return true;
  };
  const inFlow = (el, boundary) => {
    for (let a = el; a && a !== boundary; a = a.parentElement) {
      if (['absolute', 'fixed', 'sticky'].includes(getComputedStyle(a).position)) return false;
    }
    return true;
  };
  const running = document.getAnimations().filter((a) => a.playState === 'running');
  const geometryProp = /^(?:transform|translate|rotate|scale|width|height|min|max|block|inline|grid|flex|gap|row|column|padding|margin|top|left|right|bottom|font|line)/i;
  const moving = (el) => running.some((a) => {
    const target = a.effect && a.effect.target;
    if (!(target instanceof Element) || !(target === el || target.contains(el) || el.contains(target))) return false;
    try { return a.effect.getKeyframes().some((k) => Object.keys(k).some((p) => geometryProp.test(p))); } catch { return true; }
  });
  const defer = (el, why) => { const line = `${name(el)}: ${why}`; if (!deferred.includes(line)) deferred.push(line); };
  const textLeaves = (el) => {
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t; (t = walker.nextNode());) if (t.textContent.trim()) out.push(t);
    return out;
  };
  const paintsSurface = (cs) => {
    const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
    const alpha = m ? (m[1].split(/[ ,/]+/).filter(Boolean)[3] ?? '1') : '0';
    if (parseFloat(alpha) > 0.05) return true;
    if (cs.backgroundImage !== 'none') return true;
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    return px(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
  };

  const all = [...root.querySelectorAll('*')].filter((el) => !ignored(el) && !['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(el.tagName));
  const control = (el) => el.matches('button, [role="button"], input[type="button"], input[type="submit"], a[class*="btn" i], a[class*="button" i], [class*="btn" i]:not(svg, path), [data-layout-control]');

  // ---- control-box-fit / control-edge-inset -------------------------------------------------
  for (const el of all.filter(control)) {
    if (!visible(el) || el.closest('svg')) continue;
    if (moving(el)) { defer(el, 'control geometry is animating'); continue; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.writingMode !== 'horizontal-tb') { defer(el, 'non-horizontal writing mode'); continue; }
    if (cs.textBoxTrim && cs.textBoxTrim !== 'none') continue;   // trimmed to its letters on purpose
    const atoms = [];
    for (const t of textLeaves(el)) {
      if (!visible(t.parentElement) || !inFlow(t.parentElement, el)) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      const line = px(getComputedStyle(t.parentElement).lineHeight) || px(getComputedStyle(t.parentElement).fontSize) * 1.2;
      for (const b of range.getClientRects()) {
        if (b.width < 0.1 || b.height < 0.1) continue;
        const h = Math.max(b.height, line);
        const mid = (b.top + b.bottom) / 2;
        atoms.push({ left: b.left, right: b.right, top: mid - h / 2, bottom: mid + h / 2 });
      }
    }
    for (const child of el.querySelectorAll('svg, img, canvas')) {
      if (!visible(child) || !inFlow(child, el)) continue;
      const b = child.getBoundingClientRect();
      const s = getComputedStyle(child);
      const h = px(s.height) + (s.boxSizing === 'border-box' ? 0 : px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth));
      atoms.push({ left: b.left, right: b.right, top: (b.top + b.bottom - h) / 2, bottom: (b.top + b.bottom + h) / 2 });
    }
    if (!atoms.length) continue;
    checked.controls++;
    const contentHeight = Math.max(...atoms.map((a) => a.bottom)) - Math.min(...atoms.map((a) => a.top));
    const padT = px(cs.paddingTop), padB = px(cs.paddingBottom);
    const borders = px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    const needed = contentHeight + padT + padB + borders;
    if (needed > r.height + 1) {
      add('control-box-fit', 'ERROR', el, `is ${round(r.height)}px high but its content, padding and borders need ${round(needed)}px (content ${round(contentHeight)}, padding ${padT}+${padB}, borders ${borders}) — let the control take its content's height, or shrink the padding`,
        { height: round(r.height), contentHeight: round(contentHeight), paddingTop: padT, paddingBottom: padB, borders, requiredHeight: round(needed) });
    }
    const padL = px(cs.paddingLeft), padR = px(cs.paddingRight);
    const leftGap = Math.min(...atoms.map((a) => a.left)) - r.left - px(cs.borderLeftWidth);
    const rightGap = r.right - Math.max(...atoms.map((a) => a.right)) - px(cs.borderRightWidth);
    if ((padL <= 1 && padR >= 6 && leftGap <= 2 && rightGap >= 5) || (padR <= 1 && padL >= 6 && rightGap <= 2 && leftGap >= 5)) {
      add('control-edge-inset', 'WARN', el, `puts its content ${round(leftGap)}px from the left and ${round(rightGap)}px from the right (padding ${padL}px / ${padR}px) — a control pads both sides`,
        { paddingLeft: padL, paddingRight: padR, leftGap: round(leftGap), rightGap: round(rightGap) });
    }
  }

  // ---- container-bottom-inset ---------------------------------------------------------------
  for (const el of all) {
    if (control(el) || !el.children.length || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const padding = px(cs.paddingBottom);
    if (padding < 6 || cs.display === 'inline' || ['auto', 'scroll'].includes(cs.overflowY)) continue;
    const children = [...el.children].filter((c) => visible(c) && inFlow(c, el) && !['SCRIPT', 'STYLE'].includes(c.tagName));
    if (!children.length) continue;
    const last = children.reduce((a, b) => (a.getBoundingClientRect().bottom >= b.getBoundingClientRect().bottom ? a : b));
    if (moving(el) || moving(last)) { defer(el, 'bottom content geometry is animating'); continue; }
    const r = el.getBoundingClientRect();
    let edge = r.bottom - px(cs.borderBottomWidth), boundary = el;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const ac = getComputedStyle(a);
      if (['auto', 'scroll'].includes(ac.overflowY)) break;
      if (['hidden', 'clip'].includes(ac.overflowY)) {
        const lower = a.getBoundingClientRect().bottom - px(ac.borderBottomWidth);
        if (lower < edge) { edge = lower; boundary = a; }
      }
    }
    checked.paddedContainers++;
    const available = edge - last.getBoundingClientRect().bottom;
    if (available < padding - 2) {
      add('container-bottom-inset', 'ERROR', el, `leaves ${round(available)}px below its last child (${name(last)}) inside ${name(boundary)}, short of its own ${padding}px bottom padding — the content overran the box; give it room or fewer lines`,
        { paddingBottom: padding, availableBottom: round(available), boundary: name(boundary), lastChild: name(last) });
    }
  }

  // ---- text leaves: text-inset, small-text, unit-wrapped --------------------------------------
  const owner = (el) => {
    for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
      if (paintsSurface(getComputedStyle(a))) return a;
    }
    return null;
  };
  const unitRe = /^\s*[-+]?[\d.,]+\s*[A-Za-z%°€$£]{1,4}\s*$/;
  for (const el of all) {
    if (el.closest('svg') || !visible(el)) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    checked.textLeaves++;
    const size = px(cs.fontSize);
    if (size > 0 && size < 10) {
      add('small-text', 'WARN', el, `renders at ${round(size)}px — nothing under 10px reads; size it from the type scale`, { fontSize: round(size) });
    }
    const text = own.map((n) => n.textContent).join('').trim();
    // text-clipped: the box hides part of its OWN words and shows no sign of it. Measured on the
    // words themselves (the rects of the element's own text nodes against its clip edge), so a
    // wide child, a scroller, an ellipsis and a line clamp are not findings. An inline box is
    // skipped: overflow does not apply to it, so it cuts nothing.
    const clipsX = ['hidden', 'clip'].includes(cs.overflowX), clipsY = ['hidden', 'clip'].includes(cs.overflowY);
    if ((clipsX || clipsY) && text.length > 2 && cs.display !== 'inline' && !el.matches('input, textarea, select, option')) {
      if (moving(el)) defer(el, 'a clipping text box is animating');
      else {
        const edgeL = r.left + px(cs.borderLeftWidth), edgeT = r.top + px(cs.borderTopWidth);
        const edgeR = edgeL + el.clientWidth, edgeB = edgeT + el.clientHeight;
        let overX = 0, overY = 0;
        for (const n of own) {
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const b of range.getClientRects()) {
            if (b.width < 0.5) continue;
            overX = Math.max(overX, b.right - edgeR, edgeL - b.left);
            overY = Math.max(overY, b.bottom - edgeB);
          }
        }
        const clamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
        if (clipsX && cs.textOverflow !== 'ellipsis' && overX > 2) {
          add('text-clipped', 'WARN', el, `cuts ${round(overX)}px of its own words at its side edge and shows no ellipsis — let the box grow, let the line wrap, or end it with an ellipsis`, { axis: 'x', hidden: round(overX), width: round(r.width) });
        } else if (clipsY && !clamped && overY > px(cs.fontSize) * 0.5) {
          add('text-clipped', 'WARN', el, `hides ${round(overY)}px of its own words under its bottom edge and shows no sign of it — let the box grow, or clamp the lines so the last one ends in an ellipsis`, { axis: 'y', hidden: round(overY), height: round(r.height) });
        }
      }
    }
    if (unitRe.test(text) && !el.children.length) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].filter((b) => b.width > 0.5).map((b) => Math.round(b.top)));
      if (tops.size > 1) add('unit-wrapped', 'WARN', el, `breaks "${text}" over ${tops.size} lines in a ${round(r.width)}px box — a number and its unit stay on one line (nowrap, or size the number to the box)`, { lines: tops.size, width: round(r.width) });
    }
    if (!el.children.length && moving(el) === false) {
      const o = owner(el);
      if (o && !control(o) && !o.closest('[data-layout-ignore]')) {
        const or = o.getBoundingClientRect();
        if (or.width >= 160 && or.height >= 48 && inFlow(el, o)) {
          const left = r.left - or.left, right = or.right - r.right;
          const ownsEdge = (gap) => gap >= 0 && gap < 8;
          if (ownsEdge(left) && r.width < or.width - 16) add('text-inset', 'WARN', el, `sits ${round(left)}px from the left edge of ${name(o)} — words keep the surface's inset (12px; 8 is the floor)`, { left: round(left), owner: name(o) });
          else if (ownsEdge(right) && r.width < or.width - 16) add('text-inset', 'WARN', el, `sits ${round(right)}px from the right edge of ${name(o)} — words keep the surface's inset (12px; 8 is the floor)`, { right: round(right), owner: name(o) });
        }
      }
    }
  }

  // ---- control-overlap ------------------------------------------------------------------------
  // Two controls that share pixels cannot both be pressed. Judged on what is actually shown: each
  // control's per-line rects (a wrapped link is its lines, not the rectangle around them), clipped
  // by every ancestor that hides overflow (a collapsed panel shows nothing). Not judged: a control
  // inside another, a positioned control lying wholly inside another (a clear button in a field),
  // and two controls in different layers (a dialog, a menu, a fixed bar over the page).
  const interactive = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"]';
  const shownRects = (el) => {
    const out = [];
    for (const b of el.getClientRects()) {
      let left = b.left, right = b.right, top = b.top, bottom = b.bottom;
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const ac = getComputedStyle(a);
        const ar = a.getBoundingClientRect();
        if (ac.overflowX !== 'visible') { left = Math.max(left, ar.left); right = Math.min(right, ar.right); }
        if (ac.overflowY !== 'visible') { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }
      }
      if (right - left >= 1 && bottom - top >= 1) out.push({ left, right, top, bottom });
    }
    return out;
  };
  const layerOf = (el) => {
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      if (a.matches('dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [popover]')) return a;
      const ac = getComputedStyle(a);
      if (ac.position === 'fixed' || ac.position === 'sticky' || (ac.position === 'absolute' && ac.zIndex !== 'auto' && a !== el)) return a;
    }
    return root;
  };
  const area = (rects) => rects.reduce((n, b) => n + (b.right - b.left) * (b.bottom - b.top), 0);
  const within = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
  const pressable = all.filter((el) => el.matches(interactive) && !el.closest('svg') && visible(el) && !el.disabled
    && el.getAttribute('aria-disabled') !== 'true' && getComputedStyle(el).pointerEvents !== 'none')
    .map((el) => ({ el, rects: shownRects(el), box: el.getBoundingClientRect(), layer: layerOf(el), positioned: ['absolute', 'fixed'].includes(getComputedStyle(el).position) }))
    .filter((c) => c.rects.length);
  if (pressable.length > 800) manual.push(`${pressable.length} controls on one page: overlap between controls was not judged (limit 800).`);
  else if (pressable.length >= 2) {
    checked.interactive = pressable.length;
    for (let i = 0; i < pressable.length; i++) {
      for (let j = i + 1; j < pressable.length; j++) {
        const a = pressable[i], b = pressable[j];
        if (b.box.top >= a.box.bottom || a.box.top >= b.box.bottom || b.box.left >= a.box.right || a.box.left >= b.box.right) continue;
        if (a.el.contains(b.el) || b.el.contains(a.el) || a.layer !== b.layer) continue;
        if ((b.positioned && within(b.box, a.box)) || (a.positioned && within(a.box, b.box))) continue;
        let shared = 0;
        for (const x of a.rects) for (const y of b.rects) {
          const w = Math.min(x.right, y.right) - Math.max(x.left, y.left), h = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
          if (w > 0 && h > 0) shared += w * h;
        }
        const [small, big] = area(a.rects) <= area(b.rects) ? [a, b] : [b, a];
        const share = shared / area(small.rects);
        if (share <= 0.25) continue;
        if (moving(a.el) || moving(b.el)) { defer(small.el, 'an overlapping control is animating'); continue; }
        add('control-overlap', 'WARN', small.el, `has ${Math.round(share * 100)}% of its area under or over ${name(big.el)} — two controls that share pixels cannot both be pressed; move one, or give the row room`, { share: round(share), other: name(big.el) });
      }
    }
  }

  // ---- fat-row --------------------------------------------------------------------------------
  for (const el of all) {
    if (el.children.length < 3 || !visible(el) || el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    if (cs.display.includes('flex') && cs.flexDirection !== 'column') continue;
    if (cs.display.includes('grid') && cs.gridTemplateColumns.split(' ').length >= 2) continue;
    let rows = 0, fat = 0, worst = null;
    for (const k of el.children) {
      const r = k.getBoundingClientRect();
      if (r.height < 16 || r.width < 120 || !visible(k)) continue;
      const leaves = textLeaves(k).map((t) => t.parentElement).filter((p) => visible(p));
      if (!leaves.length || k.querySelector('input, textarea, select, img, canvas')) continue;
      const tops = new Set(leaves.map((p) => Math.round(p.getBoundingClientRect().top / 6)));
      if (tops.size > 1 || (k.textContent || '').trim().length < 3) continue;
      rows++;
      const fs = Math.max(...leaves.map((p) => px(getComputedStyle(p).fontSize) || 14));
      if (r.height > fs * 3.4 && r.height > 48) { fat++; if (!worst || r.height > worst.h) worst = { k, h: r.height, fs }; }
    }
    if (rows >= 3) checked.lists++;
    if (rows >= 3 && fat >= 2) {
      add('fat-row', 'WARN', worst.k, `is ${round(worst.h)}px tall for one ${round(worst.fs)}px line (${fat} of ${rows} rows in ${name(el).split(' "')[0]} are) — a one-line row is its words plus 12px of padding (8 dense); air belongs between rows, not inside them`,
        { rowHeight: round(worst.h), fontSize: round(worst.fs), fatRows: fat, rows });
    }
  }

  // ---- empty-pane (opt-in) --------------------------------------------------------------------
  for (const el of all.filter((e) => e.hasAttribute('data-pane'))) {
    if (!visible(el)) continue;
    if (moving(el)) { defer(el, 'pane geometry is animating'); continue; }
    const r = el.getBoundingClientRect();
    if (r.height < 120 || r.width < 80) continue;
    checked.panes++;
    let low = r.top;
    const bg = getComputedStyle(el).backgroundColor;
    for (const d of el.querySelectorAll('*')) {
      if (!visible(d)) continue;
      const dr = d.getBoundingClientRect();
      if (dr.width < 4 || dr.height < 4 || dr.top >= r.bottom) continue;
      const cs = getComputedStyle(d);
      const text = [...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const filled = paintsSurface(cs) && cs.backgroundColor !== bg;
      const inked = text || filled || d.tagName === 'svg' || d.tagName === 'IMG' || d.tagName === 'CANVAS';
      if (!inked) continue;
      if (filled && !text && d.children.length && dr.height >= r.height * 0.9) continue;   // the pane's own inner surface
      low = Math.max(low, Math.min(dr.bottom, r.bottom));
    }
    const gap = r.bottom - low;
    const limit = Math.max(100, r.height * 0.65);
    if (gap > limit) add('empty-pane', 'WARN', el, `has ${round(gap)}px of nothing under its last content (${Math.round((gap / r.height) * 100)}% of its ${round(r.height)}px height) — fill the pane until it runs off the crop, or crop the pane; never spread the rows`, { gap: round(gap), height: round(r.height), limit: round(limit) });
  }

  // ---- mixed-icons ----------------------------------------------------------------------------
  const glyphKind = (svg) => {
    const shapes = [...svg.querySelectorAll('path, rect, circle, ellipse, polygon, line, polyline')];
    if (!shapes.length) return null;
    let filled = 0, stroked = 0;
    for (const s of shapes) {
      const c = getComputedStyle(s);
      const hasFill = c.fill !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(c.fill);
      const hasStroke = c.stroke !== 'none' && px(c.strokeWidth) > 0;
      if (hasStroke && !hasFill) stroked++;
      else if (hasFill && !hasStroke) filled++;
    }
    if (filled && !stroked) return 'filled';
    if (stroked && !filled) return 'outline';
    return null;
  };
  for (const group of all.filter((e) => e.matches('nav, aside, ul, ol, [role="list"], [role="toolbar"], [role="tablist"], [role="menu"]'))) {
    if (!visible(group) || group.querySelector('nav, aside, ul, ol, [role="list"], [role="toolbar"]') && !group.matches('nav, aside')) continue;
    const icons = [...group.querySelectorAll('svg')].filter((s) => { const r = s.getBoundingClientRect(); return r.width >= 10 && r.width <= 32 && r.height >= 10 && r.height <= 32 && visible(s) && !s.closest('svg svg'); });
    if (icons.length < 3) continue;
    checked.iconGroups++;
    const kinds = icons.map(glyphKind).filter(Boolean);
    const f = kinds.filter((k) => k === 'filled').length, o = kinds.filter((k) => k === 'outline').length;
    if (f >= 1 && o >= 1 && f + o >= 3) {
      add('mixed-icons', 'WARN', group, `has ${f} filled and ${o} outline glyphs side by side — icons share one family and one construction, filled or outline`, { filled: f, outline: o });
    }
  }

  // ---- emoji-icon -----------------------------------------------------------------------------
  const emojiRe = /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*$/u;
  for (const el of all) {
    if (el.children.length || el.closest('svg') || !visible(el)) continue;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 4 || !emojiRe.test(t)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.width > 56 || r.height > 56) continue;
    const row = el.parentElement;
    const words = row && /\p{L}{3,}/u.test((row.textContent || '').replace(t, ''));
    if (words) add('emoji-icon', 'WARN', el, `stands where an icon belongs (a ${Math.round(r.width)}px seat beside words) — emoji are content (a reaction, a message); icons are drawn, one family`, { seat: Math.round(r.width) });
  }

  // ---- colour-unbound -------------------------------------------------------------------------
  // The rendered twin of the lint's raw-colour rule. Every colour token the page declares (a
  // custom property on the root or on a [data-theme] scope whose value is or holds a colour: a
  // shadow, a gradient, a border, a bare channel triple) is forced to one sentinel on every element; a painted
  // colour that did not move follows no token, whatever notation or route put it there: a
  // keyword, oklch(), a script, an SVG attribute, a stylesheet the lint never read. Absolute
  // white and black are a note, as in the lint. Read after everything else: it restyles the page
  // for an instant and puts it back.
  const SENTINEL = 'rgb(1, 2, 3)';
  const forced = new Map();
  for (const host of [document.documentElement, ...document.querySelectorAll('[data-theme]')]) {
    if (typeof host.computedStyleMap !== 'function') break;
    const hostStyle = getComputedStyle(host);
    for (const [prop] of host.computedStyleMap()) {
      if (!prop.startsWith('--') || forced.has(prop)) continue;
      const v = hostStyle.getPropertyValue(prop).trim();
      if (!v) continue;
      // A token that is a colour is replaced whole (a keyword included). A bare channel triple
      // ("15 81 50", read as rgb(var(--x) / a)) becomes another triple. Any other token keeps its
      // shape and has each colour literal inside it replaced: a shadow, a gradient, a border.
      if (CSS.supports('color', v)) forced.set(prop, SENTINEL);
      else if (/^[\d.]+%?(?:\s*[, ]\s*[\d.]+%?){2}$/.test(v)) forced.set(prop, v.includes(',') ? '1, 2, 3' : '1 2 3');
      else {
        const swapped = v.replace(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi, SENTINEL);
        if (swapped !== v) forced.set(prop, swapped);
      }
    }
  }
  if (forced.size === 0) {
    manual.push('This page declares no colour token (no custom property holding a colour on the root or a [data-theme] scope), so whether its colours follow tokens was not judged.');
  } else {
    // Fully transparent only: rgba() with a fourth channel of 0, or `/ 0`. rgb(204, 0, 0) also ends
    // in ", 0)" and is a solid red.
    const clear = (c) => c === 'transparent' || /^rgba\((?:[^,]+,){3}\s*0\)$/.test(c) || /\/\s*0%?\)$/.test(c);
    const paintsOf = (el) => {
      const cs = getComputedStyle(el);
      const out = [];
      if (el instanceof SVGElement && el.tagName !== 'svg') {
        if (el instanceof SVGGeometryElement || el.tagName === 'text') {
          if (cs.fill !== 'none' && !clear(cs.fill)) out.push(['fill', cs.fill]);
          if (cs.stroke !== 'none' && px(cs.strokeWidth) > 0 && !clear(cs.stroke)) out.push(['stroke', cs.stroke]);
        }
        return out;
      }
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) out.push(['text', cs.color]);
      if (!clear(cs.backgroundColor)) out.push(['background', cs.backgroundColor]);
      if (cs.backgroundImage.includes('gradient(')) out.push(['gradient', cs.backgroundImage]);
      const sides = new Set();
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (px(cs[`border${side}Width`]) > 0 && !['none', 'hidden'].includes(cs[`border${side}Style`]) && !clear(cs[`border${side}Color`])) sides.add(cs[`border${side}Color`]);
      }
      for (const c of sides) out.push(['border', c]);
      if (cs.outlineStyle !== 'none' && px(cs.outlineWidth) > 0 && !clear(cs.outlineColor)) out.push(['outline', cs.outlineColor]);
      if (cs.boxShadow !== 'none') out.push(['shadow', cs.boxShadow]);
      if (cs.textShadow !== 'none') out.push(['text-shadow', cs.textShadow]);
      return out;
    };
    const painted = [root, ...all].filter((el) => visible(el));
    const before = painted.map(paintsOf);
    const style = document.createElement('style');
    style.textContent = `*, *::before, *::after { ${[...forced].map(([prop, v]) => `${prop}: ${v} !important;`).join(' ')} transition: none !important; }`;
    document.head.appendChild(style);
    const after = painted.map(paintsOf);
    style.remove();
    const loose = new Map();
    let anchors = 0;
    painted.forEach((el, i) => {
      const now = new Set(after[i].map(([kind, value]) => `${kind} ${value}`));
      for (const [kind, value] of before[i]) {
        checked.paints++;
        if (!now.has(`${kind} ${value}`)) continue;
        if (value === 'rgb(255, 255, 255)' || value === 'rgb(0, 0, 0)') { anchors++; continue; }
        const key = `${kind} ${value}`;
        const g = loose.get(key) || { kind, value, count: 0, first: el };
        g.count++;
        loose.set(key, g);
      }
    });
    for (const g of loose.values()) {
      add('colour-unbound', 'WARN', g.first, `paints ${g.kind} ${g.value} on ${g.count} element(s) and no colour token reaches it: it did not move when all ${forced.size} tokens on the page were changed — read it from a token var`, { kind: g.kind, value: g.value, count: g.count, tokens: forced.size });
    }
    if (anchors) manual.push(`${anchors} paint(s) are absolute white or black that no token reaches; the lint carves those out too, so check each is meant (text on a filled control usually is).`);
  }

  manual.push('This audit checks box fit, authored insets, cut-off words and overlapping controls from live geometry; optical centring, contrast, interaction states and motion are not judged here.');
  const frames = all.filter((e) => e.tagName === 'IFRAME' && visible(e)).length;
  if (frames) manual.push(`${frames} visible iframe(s) were not inspected; audit their documents separately.`);
  return { findings, deferred, manual, checked, opts: { ...opts } };
}
