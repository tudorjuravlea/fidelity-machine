// operability-core.mjs — the rendered operability audit: can every control on the page be found by
// name and reached and seen from the keyboard. No ground truth, no lock tokens, no design system:
// it reads what the browser built (the accessibility tree, the focus order, the painted pixels).
//
// adherence-lint's `a11y` section reads the SOURCE and can only say "this file has no
// :focus-visible rule" or "this tag has no aria-label". This audit reads the RENDERED page, so it
// sees what the source cannot show: the name the browser actually computed, a reference to an id
// that is not in the document, a div that answers a click and cannot take focus, and whether
// anything is painted when a control is focused.
//
// Three halves, in one module so the rules and their thresholds sit together:
//   probeClickListeners()  runs in the page BEFORE its scripts (addInitScript): remembers which
//                          elements were given a click listener.
//   collectControls()      runs in the page AFTER it settled: one fact sheet per control, plus every
//                          id reference that points nowhere. Self-contained (it is serialised).
//   auditPage(page)        drives a Playwright page: collects, reads names from Chromium's
//                          accessibility tree, walks the Tab order and photographs each stop with
//                          and without focus, then judges.
//   judgeOperability()     pure: facts in, findings out. Unit tested without a browser.
//
// Rules and levels (ERROR fails the audit, WARN is listed):
//   unnamed-control         ERROR  an exposed control whose computed accessible name is empty
//   unnamed-group           ERROR  a radiogroup, tablist, listbox, tree, grid or dialog role the
//                                  browser exposes with no name (the name its accessibility tree
//                                  holds, whatever a library believes it wired)
//   broken-reference        ERROR  aria-labelledby / label[for] / aria-controls / aria-owns /
//                                  aria-activedescendant / aria-errormessage names an id that is not
//                                  in the document (aria-controls on a collapsed trigger is allowed)
//                           WARN   the same for aria-describedby and aria-details
//   missing-state           ERROR  an explicit role whose pattern cannot work without a state it
//                                  does not carry (switch/checkbox/radio: aria-checked,
//                                  combobox: aria-expanded, slider: aria-valuenow)
//   orphan-role             ERROR  tab outside a tablist, option outside a listbox, menu item
//                                  outside a menu or menubar, tree item outside a tree
//   click-without-keyboard  ERROR  it answers a click (a listener, or a control role) and neither
//                                  it, nor anything inside it, nor its composite can take focus
//   focus-not-visible       ERROR  a Tab stop on a control where fewer than MIN_FOCUS_PIXELS
//                                  pixels of the viewport change between focused and not focused
// Opt-out: `data-operable-ignore` on an element skips it and everything under it.
//
// What it cannot see, stated in every report's manual[] rather than left to read as "operable":
// what the arrow keys do inside a tab list or a menu, where focus goes when something opens or
// closes, what a screen reader announces, colour contrast, and any state but the one rendered.
// Listeners attached by delegation (one listener on a root for many children) are not attributed
// to the children; the audit under-reports there, it does not guess.

import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

// A focus indicator has to be seen: this many viewport pixels (CSS px at dpr 1) must change. A
// 1 px outline round a 16 px icon button already changes 64; a ring nobody can find changes 0.
const MIN_FOCUS_PIXELS = 24;
// Per-channel difference under which a pixel counts as unchanged (a ring a shade off its surface).
const FOCUS_TOLERANCE = 16;
const DEFAULT_MAX_STOPS = 80;
// The borrowed checker: UI SDK's testing kit, vendored as one script (scripts/ui-sdk.mjs, NOTICE).
const PATTERN_KIT = new URL('../runtime/ui-sdk/testing.js', import.meta.url);
const PATTERN_KIT_GLOBAL = '__uiSdkTesting';
const DEFAULT_MAX_WIDGETS = 40;
const PATTERN_TIMEOUT_MS = 15000;

// Roles a person operates. An element carrying one is a control whatever its tag.
const CONTROL_ROLES = ['button', 'link', 'checkbox', 'switch', 'radio', 'tab', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'treeitem', 'slider', 'spinbutton', 'combobox', 'textbox', 'searchbox'];

// Roles that gather controls under one name. Unnamed, a screen reader says "radio group" and nothing else.
const GROUP_ROLES = ['radiogroup', 'tablist', 'listbox', 'tree', 'treegrid', 'grid', 'dialog', 'alertdialog'];

// WAI-ARIA 1.2: states a role's pattern cannot work without.
const REQUIRED_STATE = {
  checkbox: 'aria-checked', switch: 'aria-checked', radio: 'aria-checked',
  menuitemcheckbox: 'aria-checked', menuitemradio: 'aria-checked',
  combobox: 'aria-expanded', slider: 'aria-valuenow',
};
// A native element that already exposes the state the role asks for.
const NATIVE_CARRIES = { checkbox: ['checkbox', 'radio'], switch: ['checkbox'], radio: ['radio'], slider: ['slider'], combobox: ['combobox'] };

// WAI-ARIA 1.2 required context: the role only means something inside one of these.
const REQUIRED_CONTEXT = {
  tab: { roles: ['tablist'], words: 'a tablist' },
  option: { roles: ['listbox'], words: 'a listbox' },
  menuitem: { roles: ['menu', 'menubar'], words: 'a menu or menubar' },
  menuitemcheckbox: { roles: ['menu', 'menubar'], words: 'a menu or menubar' },
  menuitemradio: { roles: ['menu', 'menubar'], words: 'a menu or menubar' },
  treeitem: { roles: ['tree'], words: 'a tree' },
};

const REFERENCE_WARN = ['aria-describedby', 'aria-details'];

const MANUAL_KEYS_NOT_DRIVEN = 'what the arrow keys, Home, End and typing do inside a tab list, menu, listbox or grid is not driven here';
const MANUAL_KEYS_DRIVEN = 'keys were driven only inside the widgets the borrowed checker knows (tabs, radio group, toolbar, tree, listbox, combobox, slider, switch, checkbox, a menubar, an open menu, an open dialog), in the state each was rendered in; a disclosure, an accordion and a grid are not driven';
const MANUAL = [
  'where focus lands when something opens, and where it returns when it closes, is not judged',
  'what a screen reader announces is not judged, only that each control has a name',
  'colour contrast, of text and of the focus indicator itself, is not judged here',
  'only the rendered state is audited: a menu, dialog or panel that is closed was not opened',
  'click listeners attached by delegation on a container are not attributed to its children',
  'a text caret is not counted as a focus indicator: it is hidden so that two runs photograph the same page',
  'content inside a shadow root or an iframe is not audited',
];

function judgeOperability(facts) {
  const findings = [];
  const deferred = [];
  const add = (rule, level, element, message, evidence) =>
    findings.push({ rule, level, element, message: `${rule}: ${element} ${message}`, evidence });

  for (const c of facts.controls) {
    const isControl = c.native !== null || CONTROL_ROLES.includes(c.role);

    if (isControl && c.exposed && typeof c.name === 'string' && c.name.trim() === '') {
      add('unnamed-control', 'ERROR', c.desc,
        'has no accessible name: a screen reader announces only its role and an agent cannot address it (WCAG 4.1.2). Give it visible text, a <label>, aria-label or aria-labelledby',
        { role: c.role ?? c.native });
    }

    const state = REQUIRED_STATE[c.role];
    if (state && c.aria[state] === undefined && !(NATIVE_CARRIES[c.role] ?? []).includes(c.native)) {
      add('missing-state', 'ERROR', c.desc,
        `has role="${c.role}" and no ${state}: assistive technology cannot tell what state it is in. Write ${state} on it and keep it current`,
        { role: c.role, state });
    }

    const context = REQUIRED_CONTEXT[c.role];
    if (context && !c.contextRoles.some((r) => context.roles.includes(r))) {
      add('orphan-role', 'ERROR', c.desc,
        `has role="${c.role}" outside ${context.words}: the role only works inside one. Put it in an element with that role, or give it a role that stands alone`,
        { role: c.role, contextRoles: c.contextRoles });
    }

    const answersPointer = c.click || CONTROL_ROLES.includes(c.role);
    const reachable = c.focusable || c.tabbableInside || c.controlAbove || c.composite?.reachable === true;
    if (answersPointer && !reachable && c.visible && !c.disabled && !c.isLabel && c.hasContent) {
      add('click-without-keyboard', 'ERROR', c.desc,
        `${c.click ? 'answers a click' : `has role="${c.role}"`} and cannot take keyboard focus, and nothing inside it can either: a person without a pointer cannot use it (WCAG 2.1.1). Make it a <button> or a link, or give it tabindex="0", a role and a key handler`,
        { click: c.click, role: c.role });
    }
  }

  // The pattern checker requires a name too, in its own words; where it already said so about the
  // same widget, its line stands and this rule stays out of the way.
  const groups = facts.groups ?? [];
  const saidByChecker = new Set((facts.patterns?.results ?? [])
    .filter((run) => run.problems.some((problem) => problem.includes('has no accessible name')))
    .map((run) => run.g));
  for (const group of groups) {
    if (!group.exposed || typeof group.name !== 'string' || group.name.trim() !== '' || saidByChecker.has(group.g)) continue;
    add('unnamed-group', 'ERROR', group.desc,
      `has role="${group.role}" and no accessible name: a screen reader announces the role and nothing about what the group is for (WCAG 4.1.2). Point aria-labelledby at its visible heading, or give it aria-label`,
      { role: group.role });
  }

  for (const ref of facts.references) {
    if (ref.attr === 'aria-controls' && ref.expanded === 'false') continue;
    add('broken-reference', REFERENCE_WARN.includes(ref.attr) ? 'WARN' : 'ERROR', ref.desc,
      `points at an id that is not in the document: ${ref.attr}="${ref.id}". Render the element it names, or drop the reference`,
      { attr: ref.attr, id: ref.id });
  }

  let focusJudged = 0;
  for (const stop of facts.stops) {
    if (stop.n === null) continue;
    focusJudged++;
    if (stop.changed < MIN_FOCUS_PIXELS) {
      add('focus-not-visible', 'ERROR', stop.desc,
        `takes focus on Tab and only ${stop.changed} px of the page change (${MIN_FOCUS_PIXELS} needed): a keyboard user cannot see where they are (WCAG 2.4.7). Give it a :focus-visible outline or ring that differs from its surface`,
        { changed: stop.changed, needed: MIN_FOCUS_PIXELS });
    }
  }

  if (facts.walk.truncated) {
    deferred.push(`the Tab walk stopped at its limit of ${facts.walk.stops} stops: the controls after that were not focused`);
  }

  // The borrowed checker (UI SDK's checkPattern) words each problem as "<element>: <what is wrong>".
  for (const run of facts.patterns?.results ?? []) {
    for (const problem of run.problems) {
      const cut = problem.indexOf(': ');
      const element = cut === -1 ? run.desc : problem.slice(0, cut);
      add(`pattern-${run.pattern}`, 'ERROR', element, cut === -1 ? problem : problem.slice(cut + 2), { pattern: run.pattern, widget: run.desc });
    }
  }
  deferred.push(...(facts.patterns?.skipped ?? []));

  return {
    findings,
    deferred,
    manual: [facts.patterns ? MANUAL_KEYS_DRIVEN : MANUAL_KEYS_NOT_DRIVEN, ...MANUAL],
    checked: {
      controls: facts.controls.length, groups: groups.length, references: facts.referenceCount, tabStops: facts.walk.stops, focusJudged,
      patterns: facts.patterns?.results.length ?? 0,
    },
  };
}

// Two RGBA buffers of one size: how many pixels differ by more than `tolerance` on any channel.
function countChangedPixels(a, b, tolerance = FOCUS_TOLERANCE) {
  if (a.length !== b.length) throw new Error(`countChangedPixels needs two images of the same size (${a.length} and ${b.length} bytes)`);
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) > tolerance || Math.abs(a[i + 1] - b[i + 1]) > tolerance || Math.abs(a[i + 2] - b[i + 2]) > tolerance) changed++;
  }
  return changed;
}

// ------------------------------------------------------------------ in the page

// addInitScript: runs before any page script. Only `click` counts: pointerdown and touchstart are
// what gestures listen for, and a swipe is not an activation.
function probeClickListeners() {
  const clicked = new WeakSet();
  const original = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function addEventListener(type, ...rest) {
    if (type === 'click' && this instanceof Element) clicked.add(this);
    return original.call(this, type, ...rest);
  };
  window.__operabilityClicked = clicked;
}

// page.evaluate: tags every control with data-operable-n and returns its facts. Self-contained.
function collectControls({ controlRoles, groupRoles }) {
  const REFERENCE_ATTRS = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-errormessage', 'aria-details'];
  const COMPOSITES = ['tablist', 'listbox', 'menu', 'menubar', 'radiogroup', 'tree', 'treegrid', 'grid', 'toolbar'];
  const NATIVE_FOCUSABLE = 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"])';
  const clicked = window.__operabilityClicked ?? new WeakSet();

  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const type = tag === 'input' ? `[type=${(el.getAttribute('type') || 'text').toLowerCase()}]` : '';
    const role = el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${tag}${id}${cls}${type}${role}${text ? ` "${text}"` : ''}`;
  };
  const roleOf = (el) => (el.getAttribute('role') || '').trim().split(/\s+/)[0].toLowerCase() || null;
  const nativeOf = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' || tag === 'area') return el.hasAttribute('href') ? 'link' : null;
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'hidden') return null;
      if (type === 'checkbox' || type === 'radio') return type;
      if (type === 'range') return 'slider';
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      return 'textbox';
    }
    return null;
  };
  const focusable = (el) => !el.matches(':disabled') && (el.matches(NATIVE_FOCUSABLE) || /^-?\d+$/.test((el.getAttribute('tabindex') || '').trim()));
  const tabbable = (el) => focusable(el) && el.tabIndex >= 0;
  const rendered = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true });
  };
  const ignored = (el) => !!el.closest('[data-operable-ignore]');
  // Text that names a control through aria-labelledby is a label: a click on it is handed to the control.
  const labelling = new Set();
  for (const el of document.querySelectorAll('[aria-labelledby]')) {
    for (const id of el.getAttribute('aria-labelledby').trim().split(/\s+/)) if (id) labelling.add(id);
  }

  const owners = new Map();
  for (const owner of document.querySelectorAll('[aria-owns]')) {
    for (const id of owner.getAttribute('aria-owns').trim().split(/\s+/)) if (id) owners.set(id, owner);
  }
  // Walks up through parents and aria-owns owners. `seen` ends a walk whose owners form a cycle.
  const contextRoles = (el) => {
    const roles = [];
    const seen = new Set([el]);
    for (let a = el; a; ) {
      const owner = a.id ? owners.get(a.id) : null;
      a = owner ?? a.parentElement;
      if (!a || seen.has(a)) break;
      seen.add(a);
      const role = roleOf(a);
      if (role) roles.push(role);
    }
    return roles;
  };
  // A control above it that takes focus activates it too (a span inside a button). A scroller or a
  // wrapper that merely has a tabindex does not: focus on it presses nothing.
  const controlAbove = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      if ((nativeOf(a) !== null || controlRoles.includes(roleOf(a))) && focusable(a)) return true;
    }
    return false;
  };
  const composites = new Map();
  const compositeOf = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const role = roleOf(a);
      if (role && COMPOSITES.includes(role)) {
        if (!composites.has(a)) composites.set(a, { role, reachable: tabbable(a) || [...a.querySelectorAll('*')].some(tabbable) });
        return composites.get(a);
      }
    }
    return null;
  };

  const controls = [];
  const groups = [];
  const references = [];
  let referenceCount = 0;

  for (const el of document.querySelectorAll('body *')) {
    if (ignored(el)) continue;

    for (const attr of REFERENCE_ATTRS) {
      for (const id of (el.getAttribute(attr) || '').trim().split(/\s+/)) {
        if (!id) continue;
        referenceCount++;
        if (!document.getElementById(id)) references.push({ desc: describe(el), attr, id, expanded: el.getAttribute('aria-expanded') });
      }
    }
    if (el.tagName === 'LABEL' && el.getAttribute('for')) {
      referenceCount++;
      if (!document.getElementById(el.getAttribute('for'))) references.push({ desc: describe(el), attr: 'for', id: el.getAttribute('for'), expanded: null });
    }

    const role = roleOf(el);
    if (groupRoles.includes(role) && rendered(el)) {
      el.setAttribute('data-operable-g', String(groups.length));
      groups.push({ g: groups.length, desc: describe(el), role, name: null, exposed: false });
    }
    const native = nativeOf(el);
    const click = clicked.has(el) || typeof el.onclick === 'function';
    if (native === null && !controlRoles.includes(role) && !click) continue;

    const aria = {};
    for (const a of el.attributes) if (a.name.startsWith('aria-')) aria[a.name] = a.value;
    const n = controls.length;
    el.setAttribute('data-operable-n', String(n));
    controls.push({
      n, desc: describe(el), tag: el.tagName.toLowerCase(), role, native,
      name: null, exposed: false,
      visible: rendered(el),
      disabled: el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true',
      focusable: focusable(el), tabbable: tabbable(el), click,
      hasContent: (el.textContent || '').trim() !== '' || !!el.querySelector('img, svg, canvas, video') || !!el.getAttribute('aria-label'),
      aria, contextRoles: contextRoles(el), composite: compositeOf(el),
      tabbableInside: [...el.querySelectorAll('*')].some(tabbable),
      controlAbove: controlAbove(el),
      isLabel: !!el.closest('label') || (!!el.id && labelling.has(el.id)),
    });
  }
  return { controls, groups, references, referenceCount };
}

// page.evaluate, after the kit was evaluated in the page: finds every rendered widget the borrowed
// checker has a pattern for and runs it there. The checker reads only roles, ARIA, tabindex and
// focus, so the markup can be anybody's. It presses keys and puts focus and state back where it
// can; a menu check presses Enter on an item, so menus go last. Self-contained (it is serialised).
async function checkPatterns({ kitGlobal, maxWidgets, timeoutMs }) {
  const kit = window[kitGlobal];
  // Selector → the checker's pattern name. A native input already behaves: only authored roles are driven.
  const PATTERNS = [
    ['[role="tablist"]', 'tabs'], ['[role="radiogroup"]', 'radio-group'], ['[role="toolbar"]', 'toolbar'],
    ['[role="tree"]', 'tree'], ['[role="listbox"]', 'listbox'], ['[role="combobox"]', 'combobox'],
    ['[role="slider"]', 'slider'], ['[role="switch"]', 'switch'], ['[role="checkbox"]', 'checkbox'],
    ['[role="dialog"], dialog[open]', 'dialog'], ['[role="alertdialog"]', 'alertdialog'],
    ['[role="menubar"]', 'menubar'], ['[role="menu"]', 'menu'],
  ];
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const role = el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${role}${text ? ` "${text}"` : ''}`;
  };
  const rendered = (el) => {
    const r = el.getBoundingClientRect();
    return el.isConnected && r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true });
  };
  const controlled = (el) => !!el.id && [...document.querySelectorAll('[role="combobox"][aria-controls], [role="menubar"] [aria-controls]')]
    .some((owner) => owner.getAttribute('aria-controls').split(/\s+/).includes(el.id));

  const widgets = [];
  for (const [selector, pattern] of PATTERNS) {
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest('[data-operable-ignore]') || !rendered(el)) continue;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && pattern !== 'combobox') continue;
      // A combobox's listbox and a menubar's menus are driven through their owner.
      if ((pattern === 'listbox' || pattern === 'menu') && (controlled(el) || el.closest('[role="combobox"], [role="menubar"]'))) continue;
      widgets.push({ el, pattern, desc: describe(el), g: el.hasAttribute('data-operable-g') ? Number(el.getAttribute('data-operable-g')) : null });
    }
  }

  const results = [];
  const skipped = [];
  for (const { el, pattern, desc, g } of widgets.slice(0, maxWidgets)) {
    if (!rendered(el)) {
      skipped.push(`the ${pattern} check on ${desc} did not run: the widget left the page during an earlier check`);
      continue;
    }
    let timer;
    try {
      await Promise.race([
        kit.checkPattern(el, pattern),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer after ${timeoutMs} ms`)), timeoutMs); }),
      ]);
      results.push({ g, desc, pattern, problems: [] });
    } catch (err) {
      const message = String(err?.message ?? err);
      if (message.startsWith('checkPattern found')) {
        results.push({ g, desc, pattern, problems: message.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2)) });
      } else {
        skipped.push(`the ${pattern} check on ${desc} could not run: ${message}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (widgets.length > maxWidgets) skipped.push(`${widgets.length - maxWidgets} more widget(s) were not driven: the limit is ${maxWidgets}`);
  return { results, skipped };
}

// ------------------------------------------------------------------ driving the page

// Names come from Chromium's own accessibility tree (the name a screen reader is given), matched to
// the tagged elements through the DOM tree both CDP domains share.
async function readNames(page, { controls, groups }) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Accessibility.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    // An element can be both (a listbox that answers clicks), so each marker has its own map.
    const marked = { 'data-operable-n': new Map(), 'data-operable-g': new Map() };
    const walk = (node) => {
      const attrs = node.attributes ?? [];
      for (const [marker, backendOf] of Object.entries(marked)) {
        const at = attrs.indexOf(marker);
        if (at !== -1 && at % 2 === 0) backendOf.set(node.backendNodeId, Number(attrs[at + 1]));
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(root);
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    for (const node of nodes) {
      if (node.ignored) continue;
      for (const [marker, list] of [['data-operable-n', controls], ['data-operable-g', groups]]) {
        const at = marked[marker].get(node.backendDOMNodeId);
        if (at === undefined) continue;
        list[at].exposed = true;
        list[at].name = node.name?.value ?? '';
      }
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
}

const decode = (png) => PNG.sync.read(png).data;

// Press Tab until a stop comes round again or the limit is reached. At each stop on a control,
// photograph the viewport focused, blur it, photograph again: what differs is the focus indicator.
// The walk may start anywhere (a page can have put focus somewhere already), so the end of the
// order is not the end of the walk: Tab leaves the document once, comes back at the first stop, and
// the walk ends when it meets a stop it has seen. Two presses in a row that land nowhere mean the
// page has no stop at all.
async function walkTabOrder(page, maxStops) {
  const stops = [];
  const seen = new Set();
  let truncated = false;
  let nowhere = 0;
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  for (;;) {
    if (stops.length >= maxStops) { truncated = true; break; }
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      window.__operabilityStops ??= new Map();
      if (!window.__operabilityStops.has(el)) window.__operabilityStops.set(el, window.__operabilityStops.size);
      return {
        key: window.__operabilityStops.get(el),
        n: el.hasAttribute('data-operable-n') ? Number(el.getAttribute('data-operable-n')) : null,
      };
    });
    if (at === null) {
      if (++nowhere === 2) break;
      continue;
    }
    nowhere = 0;
    if (seen.has(at.key)) break;
    seen.add(at.key);
    let changed = 0;
    if (at.n !== null) {
      const focused = decode(await page.screenshot({ type: 'png' }));
      await page.evaluate(() => document.activeElement.blur());
      const blurred = decode(await page.screenshot({ type: 'png' }));
      await page.evaluate((n) => document.querySelector(`[data-operable-n="${n}"]`)?.focus({ preventScroll: true }), at.n);
      changed = countChangedPixels(focused, blurred);
    }
    stops.push({ n: at.n, changed });
  }
  return { stops, walk: { stops: stops.length, truncated } };
}

// The page must already be loaded and settled, and `probeClickListeners` must have been installed
// with addInitScript before it loaded (without it, only inline onclick handlers are seen).
// `patterns: false` skips the key-driving pass (the borrowed checker), for a page that is still markup.
async function auditPage(page, { maxStops = DEFAULT_MAX_STOPS, patterns = true, maxWidgets = DEFAULT_MAX_WIDGETS } = {}) {
  const style = await page.addStyleTag({
    content: '*, *::before, *::after { caret-color: transparent !important; transition-duration: 0s !important; transition-delay: 0s !important; animation-play-state: paused !important; }',
  });
  const facts = await page.evaluate(collectControls, { controlRoles: CONTROL_ROLES, groupRoles: GROUP_ROLES });
  try {
    try {
      await readNames(page, facts);
      Object.assign(facts, await walkTabOrder(page, maxStops));
      for (const stop of facts.stops) if (stop.n !== null) stop.desc = facts.controls[stop.n].desc;
    } finally {
      await style.evaluate((el) => el.remove()).catch(() => {});
    }
    // Last, because it presses keys and may leave a tab, a switch or a menu in another state. The
    // audit's own stylesheet is gone by now: a paused animation would stall a widget that waits
    // for its exit to finish.
    if (patterns) {
      let kit;
      try { kit = await readFile(PATTERN_KIT, 'utf8'); } catch { kit = null; }
      if (kit === null) {
        facts.patterns = { results: [], skipped: ['the pattern checker is not vendored (runtime/ui-sdk/testing.js): run `node scripts/ui-sdk.mjs update`'] };
      } else {
        await page.evaluate(kit);
        facts.patterns = await page.evaluate(checkPatterns, { kitGlobal: PATTERN_KIT_GLOBAL, maxWidgets, timeoutMs: PATTERN_TIMEOUT_MS });
      }
    }
  } finally {
    await page.evaluate(() => {
      for (const marker of ['data-operable-n', 'data-operable-g']) {
        for (const el of document.querySelectorAll(`[${marker}]`)) el.removeAttribute(marker);
      }
      delete window.__operabilityStops;
    }).catch(() => {});
  }
  return judgeOperability(facts);
}

export { DEFAULT_MAX_STOPS, MIN_FOCUS_PIXELS, auditPage, countChangedPixels, judgeOperability, probeClickListeners };
