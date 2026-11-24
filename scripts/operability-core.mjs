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
//   target-size             WARN   a target under 24x24 px (44 on a phone-runnable page) with another
//                                  target inside the circle of that diameter around it
//   reduced-motion-loss     ERROR  visible with no motion preference, gone under prefers-reduced-motion
//   motion-not-reduced      WARN   a moving animation or transition that carries on under that preference
//   text-contrast           WARN   text under 4.5:1 (3:1 when large) against what is painted behind it,
//                                  at rest, and on hover and focus for a control
//   dead-state              ERROR  a control that declares a two-state attribute and keeps it when clicked
//   invisible-state         ERROR  a click moved the state and fewer than 24 px of the page changed
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
const DEFAULT_MAX_CLICKS = 40;
const CLICK_SETTLE_MS = 300;
const DEFAULT_MAX_STATES = 80;
// WCAG 1.4.3: 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold).
const CONTRAST_TEXT = 4.5;
const CONTRAST_LARGE = 3;
// A CSS animation or transition shorter than this is a flicker, not motion (WCAG 2.3.3 reads on
// motion a person can follow).
const MOTION_MIN_MS = 100;
const MOTION_SETTLE_MS = 2000;
// WCAG 2.5.8 (AA): 24x24 CSS px. A page that declares itself phone-runnable is operated by a
// finger and is held to 44 (references/surface-classes.md: the floor follows the input, never the width).
const TARGET_FLOOR = 24;
const TARGET_FLOOR_TOUCH = 44;

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
const MANUAL_NOT_CLICKED = 'no control was clicked: whether a toggle changes its state, and whether the change shows, was not judged';
const MANUAL_CLICKED = 'clicks were driven only on two-state toggles (aria-pressed, aria-expanded on a button, aria-checked on a custom switch or checkbox, an unselected tab); what any other button does was not tried';
const MANUAL_NO_CONTRAST = 'the contrast of text was not judged (the pass was left out)';
const MANUAL_CONTRAST = 'contrast was judged for text only, on one frame, inside the page as rendered: the focus indicator, icons, control borders, placeholder text, text in an SVG and text filled with a gradient are not judged';
const MANUAL_NO_MOTION = 'the reduced-motion preference was not tried (the pass was left out)';
const MANUAL_MOTION = 'reduced motion was read from CSS animations and declared transitions on the live page: motion driven by script, a transition written as `all`, and a script that reads the preference only once at load are not judged';
const MANUAL_NO_TARGETS = 'the size of targets was not judged (the pass was left out)';
const MANUAL = [
  'where focus lands when something opens, and where it returns when it closes, is not judged',
  'what a screen reader announces is not judged, only that each control has a name',
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

  // The contrast pass: each text against what is painted behind it. A state is reported only when
  // it is where the text goes pale: text that already fails at rest is said once, at rest.
  const contrast = facts.contrast?.texts ?? [];
  const atRest = new Map(contrast.filter((t) => t.state === 'rest').map((t) => [t.key, t]));
  let textsJudged = 0, statesJudged = 0;
  for (const t of contrast) {
    if (t.state === 'rest') textsJudged++; else statesJudged++;
    if (t.ratio >= t.needed) continue;
    const rest = atRest.get(t.key);
    if (t.state !== 'rest' && rest && rest.ratio < rest.needed) continue;
    add('text-contrast', 'WARN', t.desc,
      `reads at ${t.ratio.toFixed(2)}:1 against what is painted behind it${t.state === 'rest' ? '' : ` on ${t.state}`} (${t.needed}:1 needed for ${t.size}px${t.bold ? ' bold' : ''} text, WCAG 1.4.3). Darken or lighten the text, or the surface under it, in the lock's tokens`,
      { state: t.state, ratio: Math.round(t.ratio * 100) / 100, needed: t.needed, size: t.size, bold: t.bold, text: t.fg, behind: t.behind });
  }

  // The target-size pass: one finding per size, since a toolbar repeats one size many times.
  const sizes = new Map();
  for (const t of facts.targets?.small ?? []) {
    const key = `${t.width}x${t.height}`;
    const g = sizes.get(key) ?? { ...t, count: 0 };
    g.count++;
    sizes.set(key, g);
  }
  for (const t of sizes.values()) {
    const floor = facts.targets.floor;
    add('target-size', 'WARN', t.desc,
      `is ${t.width}x${t.height} px, under the ${floor}x${floor} floor${floor === TARGET_FLOOR_TOUCH ? ' for a page that declares itself phone-runnable' : ''}, with ${t.near} inside the ${floor} px circle around it, as ${t.count} control(s) of that size are (WCAG 2.5.8). Grow the control or its padding, or give it room`,
      { width: t.width, height: t.height, floor, count: t.count, near: t.near });
  }

  // The reduced-motion pass.
  for (const lost of facts.motion?.lost ?? []) {
    add('reduced-motion-loss', 'ERROR', lost.desc,
      `is on the page for a reader with no motion preference and gone for one who asked for less motion (${lost.lost} element(s) with it): an entrance animation was the only thing making it visible, and the reduced-motion rule switched the animation off without setting the end state. Under prefers-reduced-motion, give it its final opacity and position`,
      { lost: lost.lost });
  }
  // One finding per motion, not per element: a utility class puts the same transition on every
  // control of a page (MEASURED: 85 elements on five real pages shared two transitions).
  const motions = new Map();
  for (const m of facts.motion?.moving ?? []) {
    const key = `${m.kind} ${m.name ?? ''} ${m.ms} ${m.props}`;
    const g = motions.get(key) ?? { ...m, count: 0 };
    g.count++;
    motions.set(key, g);
  }
  for (const m of motions.values()) {
    add('motion-not-reduced', 'WARN', m.desc,
      `still ${m.kind === 'animation' ? `runs the animation "${m.name}" (${m.ms} ms, moving ${m.props})` : `declares a ${m.ms} ms transition on ${m.props}`} for a reader who asked for less motion, as ${m.count} element(s) do (WCAG 2.3.3). Under prefers-reduced-motion, stop it or replace it with a fade`,
      { kind: m.kind, ms: m.ms, props: m.props, count: m.count });
  }

  // The click pass: a control that declares a state must change it when pressed, and the change
  // must show. Whether it shows is read from two photographs, so a page that repaints by itself
  // (a clock, a spinner) cannot be judged on that point and says so.
  for (const run of facts.clicks?.results ?? []) {
    if (run.after === run.before) {
      add('dead-state', 'ERROR', run.desc,
        `declares ${run.attr}="${run.before}" and a click leaves it there: it says it has a state and pressing it changes nothing a program can read. Change ${run.attr} when it is pressed; a picture of a control takes data-operable-ignore`,
        { attr: run.attr, before: run.before });
    } else if (run.ambient >= MIN_FOCUS_PIXELS) {
      deferred.push(`${run.desc}: the page was changing by itself (${run.ambient} px between two photographs with nothing pressed), so whether its new state shows could not be judged`);
    } else if (run.changed < MIN_FOCUS_PIXELS) {
      add('invisible-state', 'ERROR', run.desc,
        `went from ${run.attr}="${run.before}" to "${run.after}" on a click and only ${run.changed} px of the page changed (${MIN_FOCUS_PIXELS} needed): assistive technology is told of a change nobody can see. Style the new state on the control, or on what it opens`,
        { attr: run.attr, before: run.before, after: run.after, changed: run.changed, needed: MIN_FOCUS_PIXELS });
    }
  }
  deferred.push(...(facts.clicks?.skipped ?? []));

  return {
    findings,
    deferred,
    manual: [
      facts.patterns ? MANUAL_KEYS_DRIVEN : MANUAL_KEYS_NOT_DRIVEN, facts.clicks ? MANUAL_CLICKED : MANUAL_NOT_CLICKED,
      facts.contrast ? MANUAL_CONTRAST : MANUAL_NO_CONTRAST,
      facts.motion ? MANUAL_MOTION : MANUAL_NO_MOTION,
      ...(facts.targets ? [] : [MANUAL_NO_TARGETS]),
      ...(facts.contrast?.offscreen ? [`${facts.contrast.offscreen} text(s) are painted outside the frame that was rendered and were not judged for contrast`] : []),
      ...MANUAL,
    ],
    checked: {
      controls: facts.controls.length, groups: groups.length, references: facts.referenceCount, tabStops: facts.walk.stops, focusJudged,
      patterns: facts.patterns?.results.length ?? 0,
      clicks: facts.clicks?.results.length ?? 0,
      texts: textsJudged, textStates: statesJudged,
      motionElements: facts.motion?.elements ?? 0,
      targets: facts.targets?.judged ?? 0,
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

// page.evaluate: every element that owns visible text, with the colour its glyphs are painted in
// and where its lines lie. `within` narrows the read to one control (for its hover and focus
// states). The colour is the text fill, in any CSS syntax, turned into sRGB numbers by painting it
// on a one-pixel canvas (a computed colour comes back in the syntax it was written in, so
// `oklch(0.82 0.02 250)` cannot be read as three numbers); its alpha is multiplied by every
// opacity on the way up, since a faded group fades its words. Lines are clipped by any ancestor
// that hides overflow and by the viewport: what is not painted is not judged. Self-contained.
function collectTexts({ within }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    const plain = /^rgba?\(([^)]+)\)$/.exec(css);
    if (plain) { const c = plain[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [c[0], c[1], c[2], c[3] ?? 1]; }
    const alpha = /\/\s*([\d.]+)(%?)\s*\)$/.exec(css);
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = css.replace(/\s*\/\s*[\d.]+%?\s*\)$/, ')');
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], alpha ? Number(alpha[1]) / (alpha[2] ? 100 : 1) : 1];
  };
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const scope = within === null ? document.body : document.querySelector(`[data-operable-n="${within}"]`);
  const texts = [];
  let offscreen = 0, unread = 0;
  if (!scope) return { texts, offscreen, unread };
  const all = [...document.body.querySelectorAll('*')];
  for (const el of [scope, ...scope.querySelectorAll('*')]) {
    if (el.closest('svg, script, style, noscript, template, option, [data-operable-ignore]')) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own.length || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const cs = getComputedStyle(el);
    const fill = rgba(cs.webkitTextFillColor || cs.color);
    if (fill[3] === 0 || cs.backgroundClip === 'text') { unread++; continue; }
    let left = -Infinity, top = -Infinity, right = Infinity, bottom = Infinity, opacity = 1;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const ac = getComputedStyle(a);
      opacity *= Number(ac.opacity);
      if (ac.display === 'inline') continue;   // overflow does not apply to an inline box
      const ar = a.getBoundingClientRect();
      if (ac.overflowX !== 'visible') { left = Math.max(left, ar.left); right = Math.min(right, ar.right); }
      if (ac.overflowY !== 'visible') { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }
    }
    // Two ways for a line not to be judged, kept apart: cut away by a box that hides overflow
    // (text for a screen reader, a collapsed panel: nothing is painted, nothing to say), or
    // painted outside the frame that was rendered (counted, and said).
    const rects = [];
    let shown = 0;
    for (const n of own) {
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const b of range.getClientRects()) {
        const l = Math.max(b.left, left), t = Math.max(b.top, top), r = Math.min(b.right, right), bt = Math.min(b.bottom, bottom);
        if (r - l < 2 || bt - t < 2) continue;
        shown++;
        const x0 = Math.ceil(Math.max(l, 0)), y0 = Math.ceil(Math.max(t, 0)), x1 = Math.floor(Math.min(r, innerWidth)), y1 = Math.floor(Math.min(bt, innerHeight));
        if (x1 - x0 >= 2 && y1 - y0 >= 2) rects.push([x0, y0, x1, y1]);
      }
    }
    if (!rects.length) { if (shown) offscreen++; continue; }
    const control = el.closest('[data-operable-n]');
    texts.push({
      key: all.indexOf(el), desc: describe(el), n: control ? Number(control.getAttribute('data-operable-n')) : null,
      disabled: !!el.closest(':disabled, [aria-disabled="true"]'),
      fg: [fill[0], fill[1], fill[2], Math.round(fill[3] * opacity * 1000) / 1000],
      size: Math.round(parseFloat(cs.fontSize) * 100) / 100, bold: Number(cs.fontWeight) >= 700, rects,
    });
  }
  return { texts, offscreen, unread };
}

// The contrast of one text against a plate (the page photographed with every glyph transparent):
// its colour is laid over each sampled pixel under its lines by its own alpha, and the ratio kept
// is the tenth percentile, so the palest stretch of a gradient decides and one stray pixel does not.
function paintedContrast(fg, plate, rects) {
  const lum = (r, g, b) => {
    const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratios = [];
  let behind = null;
  for (const [x0, y0, x1, y1] of rects) {
    const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 600)));
    for (let y = y0; y < Math.min(y1, plate.height); y += step) {
      for (let x = x0; x < Math.min(x1, plate.width); x += step) {
        const i = (y * plate.width + x) * 4;
        const [r, g, b] = [plate.data[i], plate.data[i + 1], plate.data[i + 2]];
        const a = fg[3];
        const text = lum(fg[0] * a + r * (1 - a), fg[1] * a + g * (1 - a), fg[2] * a + b * (1 - a));
        const back = lum(r, g, b);
        ratios.push([(Math.max(text, back) + 0.05) / (Math.min(text, back) + 0.05), r, g, b]);
      }
    }
  }
  if (!ratios.length) return null;
  ratios.sort((p, q) => p[0] - q[0]);
  const pick = ratios[Math.floor(ratios.length * 0.1)];
  behind = `rgb(${pick[1]}, ${pick[2]}, ${pick[3]})`;
  return { ratio: pick[0], behind };
}

// Photographs the plate, reads every text at rest, then each enabled control's text again with the
// pointer over it and with focus on it. The page is put back: pointer away, nothing focused.
// Ends every CSS transition where it is heading. A stylesheet cannot be trusted to do it: a rule
// that sets a duration with !important inside a cascade layer wins over any rule added later, and
// a colour is then read part-way through (MEASURED: a real button's text came back at 4 % alpha,
// on its way back from the transparent plate). Animations are left alone: an endless one has no end.
const finishTransitions = (page) => page.evaluate(() => {
  for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.finish();
});

async function measureContrast(page, maxStates) {
  const HIDE = '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }';
  const plate = async () => {
    const style = await page.addStyleTag({ content: HIDE });
    try {
      await finishTransitions(page);
      const png = PNG.sync.read(await page.screenshot({ type: 'png' }));
      return { data: png.data, width: png.width, height: png.height };
    } finally {
      await style.evaluate((el) => el.remove()).catch(() => {});
      await finishTransitions(page).catch(() => {});
    }
  };
  const out = [];
  const judge = (read, photo, state) => {
    for (const t of read.texts) {
      if (t.disabled) continue;
      const m = paintedContrast(t.fg, photo, t.rects);
      if (!m) continue;
      out.push({ key: t.key, desc: t.desc, state, ratio: m.ratio, behind: m.behind, fg: `rgba(${t.fg.join(', ')})`, size: t.size, bold: t.bold,
        needed: t.size >= 24 || (t.size >= 18.66 && t.bold) ? CONTRAST_LARGE : CONTRAST_TEXT });
    }
  };
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  await page.mouse.move(0, 0);
  const rest = await page.evaluate(collectTexts, { within: null });
  judge(rest, await plate(), 'rest');
  const controls = [...new Set(rest.texts.filter((t) => t.n !== null && !t.disabled).map((t) => t.n))];
  for (const n of controls.slice(0, maxStates)) {
    const at = await page.evaluate((n) => {
      const r = document.querySelector(`[data-operable-n="${n}"]`)?.getBoundingClientRect();
      return r ? [r.left + r.width / 2, r.top + r.height / 2] : null;
    }, n);
    if (!at) continue;
    await page.mouse.move(at[0], at[1]);
    await finishTransitions(page);
    judge(await page.evaluate(collectTexts, { within: n }), await plate(), 'hover');
    await page.mouse.move(0, 0);
    await page.evaluate((n) => document.querySelector(`[data-operable-n="${n}"]`)?.focus({ preventScroll: true }), n);
    await finishTransitions(page);
    judge(await page.evaluate(collectTexts, { within: n }), await plate(), 'focus');
    await page.evaluate(() => document.activeElement?.blur?.());
    await finishTransitions(page);
  }
  return { texts: out, offscreen: rest.offscreen, unread: rest.unread, statesSkipped: Math.max(0, controls.length - maxStates) };
}

// page.evaluate, while the controls still carry their markers: every control a pointer can press,
// measured as a target: a native control or one with a control role (`controls`, by marker). An
// element that merely answers a click, a backdrop or a label, is not one. A target is the control
// together with its label (pressing the label presses it). Under the floor in either dimension it is still fine when it sits in a line of
// text (display inline, with words beside it), or when a circle of the floor's diameter centred
// on it touches no other target: a full-size neighbour's box, or a small neighbour's own circle.
// Returns only the ones with no excuse, each with what lies inside its circle. Self-contained.
function measureTargets({ floor, controls }) {
  const isControl = new Set(controls.map(String));
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const targets = [];
  for (const el of document.querySelectorAll('[data-operable-n]')) {
    if (!isControl.has(el.getAttribute('data-operable-n'))) continue;
    const r = el.getBoundingClientRect();
    // Two pixels or less cannot be pressed: it is a hidden input carrying a custom widget's value.
    if (!(r.width > 2 && r.height > 2) || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    // A form control the browser draws is the browser's size (the criterion's user-agent exception).
    if (el.matches('input, select') && getComputedStyle(el).appearance !== 'none') continue;
    if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || getComputedStyle(el).pointerEvents === 'none') continue;
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    for (const label of [...(el.labels ?? []), el.closest('label')].filter(Boolean)) {
      const lr = label.getBoundingClientRect();
      if (lr.width > 0 && lr.height > 0) { left = Math.min(left, lr.left); top = Math.min(top, lr.top); right = Math.max(right, lr.right); bottom = Math.max(bottom, lr.bottom); }
    }
    const inline = getComputedStyle(el).display === 'inline'
      && [...(el.parentElement?.childNodes ?? [])].some((n) => n.nodeType === 3 && n.textContent.trim());
    targets.push({ el, left, top, right, bottom, width: right - left, height: bottom - top, inline });
  }
  const small = (t) => t.width < floor - 0.5 || t.height < floor - 0.5;
  const radius = floor / 2;
  const out = [];
  for (const t of targets) {
    if (!small(t) || t.inline) continue;
    const cx = (t.left + t.right) / 2, cy = (t.top + t.bottom) / 2;
    let near = null;
    for (const o of targets) {
      if (o === t || o.el.contains(t.el) || t.el.contains(o.el)) continue;
      if (small(o)) {
        if (Math.hypot((o.left + o.right) / 2 - cx, (o.top + o.bottom) / 2 - cy) < floor) { near = o; break; }
      } else {
        const dx = Math.max(o.left - cx, 0, cx - o.right), dy = Math.max(o.top - cy, 0, cy - o.bottom);
        if (Math.hypot(dx, dy) < radius) { near = o; break; }
      }
    }
    if (near) out.push({ desc: describe(t.el), width: Math.round(t.width), height: Math.round(t.height), near: describe(near.el) });
  }
  return { floor, judged: targets.length, small: out };
}

// page.evaluate: which elements are visible, and which are in motion, under the preference the
// page is emulating right now. An element is keyed by its place in the document, which the two
// reads share. "In motion": a running CSS animation whose keyframes move geometry (a fade is the
// sanctioned replacement and is not motion), or a declared transition on a geometry property;
// `all` is left out, since it cannot be told apart from a colour change. Whatever sits in
// something busy (aria-busy, a status, a progress bar) is working, not decorating. Self-contained.
function snapshotMotion({ minMs }) {
  // `offset` alone is a keyframe's own position in time, not a property; offset-path and its kin are motion.
  const GEOMETRY = /^(?:transform|translate|rotate|scale|top|left|right|bottom|inset|width|height|margin|offset[A-Z-])/;
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const ms = (list) => Math.max(0, ...String(list).split(',').map((t) => (t.trim().endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000) || 0));
  const all = [...document.body.querySelectorAll('*')].filter((el) => !el.closest('script, style, noscript, template, [data-operable-ignore]'));
  const visible = [];
  const moving = [];
  all.forEach((el, key) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }))) return;
    visible.push(key);
    if (el.closest('[aria-busy="true"], [role="status"], [role="progressbar"], [role="alert"]')) return;
    for (const a of el.getAnimations()) {
      if (!(a instanceof CSSAnimation) || a.playState !== 'running') continue;
      const duration = Number(a.effect?.getComputedTiming().duration) || 0;
      let props = [];
      try { props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k)))].filter((prop) => GEOMETRY.test(prop)); } catch { props = []; }
      if (duration >= minMs && props.length) { moving.push({ key, desc: describe(el), kind: 'animation', name: a.animationName, ms: Math.round(duration), props: props.join(', ') }); return; }
    }
    const cs = getComputedStyle(el);
    const props = cs.transitionProperty.split(',').map((t) => t.trim()).filter((prop) => GEOMETRY.test(prop));
    if (props.length && ms(cs.transitionDuration) >= minMs) moving.push({ key, desc: describe(el), kind: 'transition', ms: Math.round(ms(cs.transitionDuration)), props: props.join(', ') });
  });
  const parents = Object.fromEntries(all.map((el, key) => [key, all.indexOf(el.parentElement)]));
  return { visible, moving, parents, descs: Object.fromEntries(visible.map((key) => [key, describe(all[key])])) };
}

// Reads the page with no motion preference and again with "reduce", on the live page (the media
// query flips, the document stays), and hands it back with the preference it was opened with.
// Each read waits for the entrance animations that have an end to reach it.
async function measureReducedMotion(page) {
  const opened = await page.evaluate(() => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference'));
  const read = async (preference) => {
    await page.emulateMedia({ reducedMotion: preference });
    await page.evaluate((limit) => new Promise((resolve) => {
      const started = performance.now();
      const look = () => {
        const busy = document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(Number(a.effect?.getComputedTiming().endTime)));
        if (!busy || performance.now() - started >= limit) requestAnimationFrame(() => requestAnimationFrame(resolve));
        else setTimeout(look, 50);
      };
      requestAnimationFrame(look);
    }), MOTION_SETTLE_MS);
    return page.evaluate(snapshotMotion, { minMs: MOTION_MIN_MS });
  };
  try {
    const normal = await read('no-preference');
    const reduced = await read('reduce');
    const still = new Set(reduced.visible);
    const gone = normal.visible.filter((key) => !still.has(key));
    const goneSet = new Set(gone);
    // The outermost element that vanished stands for everything inside it.
    const lost = gone.filter((key) => !goneSet.has(normal.parents[key]))
      .map((key) => ({ desc: normal.descs[key], lost: gone.filter((k) => { for (let a = k; a !== -1 && a !== undefined; a = normal.parents[a]) if (a === key) return true; return false; }).length }));
    return { elements: normal.visible.length, lost, moving: reduced.moving.map(({ key, ...rest }) => rest) };
  } finally {
    await page.emulateMedia({ reducedMotion: opened }).catch(() => {});
  }
}

// Which state attribute a control must change when it is pressed, or null when a click proves
// nothing about it: aria-pressed and aria-expanded on a button, aria-checked on a custom switch or
// checkbox, aria-selected on a tab. Whether the value it holds at that moment can be pressed (a
// selected tab and "mixed" cannot) is decided when the press is due. Left alone: a native
// checkbox or radio (the browser keeps those), a real link (a click navigates), a submit or reset
// button, a combobox, a menu item, a tree item (the key pass owns those), anything disabled or
// not rendered.
function stateToPress(c) {
  if (!c.visible || c.disabled) return null;
  const two = (attr) => (c.aria[attr] !== undefined ? attr : null);
  if (c.role === 'tab') return two('aria-selected');
  if (['switch', 'checkbox', 'menuitemcheckbox'].includes(c.role)) return c.native === null || c.native === 'button' ? two('aria-checked') : null;
  const isButton = c.role === 'button' || (c.role === null && c.native === 'button' && c.tag !== 'input');
  if (!isButton) return null;
  return two('aria-pressed') ?? two('aria-expanded');
}

// Presses each such control once with a DOM click (no pointer travels, so nothing is hovered and
// focus stays where it was: the two photographs differ only by what the click did), reads the
// attribute again, photographs the page, and presses a toggle a second time to put it back. A
// control that something else lies over at its centre is not pressed: a person could not press it
// either, and a run that counted it would be judging a click that cannot happen.
async function driveClicks(page, controls, maxClicks) {
  const results = [];
  const skipped = [];
  const candidates = controls.filter((c) => stateToPress(c) !== null);
  for (const c of candidates.slice(0, maxClicks)) {
    const attr = stateToPress(c);
    const ready = await page.evaluate(({ n, attr }) => {
      const el = document.querySelector(`[data-operable-n="${n}"]`);
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const over = !top || top === el || el.contains(top) ? null
        : `${top.tagName.toLowerCase()}${top.id ? `#${top.id}` : ''}${typeof top.className === 'string' && top.className.trim() ? `.${top.className.trim().split(/\s+/)[0]}` : ''}`;
      return { value: el.getAttribute(attr), over, offscreen: !top };
    }, { n: c.n, attr });
    if (ready === null) continue;
    if (ready.offscreen) { skipped.push(`${c.desc} could not be clicked: its centre is outside the page as rendered`); continue; }
    if (ready.over !== null) { skipped.push(`${c.desc} could not be clicked: ${ready.over} lies over its centre`); continue; }
    // Read now, not when the controls were collected: the key pass may have moved a state since.
    // A selected tab stays selected when pressed, and "mixed" has no single next value.
    if (attr === 'aria-selected' ? ready.value !== 'false' : !['true', 'false'].includes(ready.value)) continue;
    const still = decode(await page.screenshot({ type: 'png' }));
    const before = decode(await page.screenshot({ type: 'png' }));
    const press = ({ n, attr, was, settle }) => new Promise((resolve) => {
      const el = document.querySelector(`[data-operable-n="${n}"]`);
      el.click();
      const started = performance.now();
      const look = () => {
        const now = el.isConnected ? el.getAttribute(attr) : null;
        if (now !== was || performance.now() - started >= settle) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.finish();
            resolve(now);
          }));
        }
        else setTimeout(look, 20);
      };
      look();
    });
    const after = await page.evaluate(press, { n: c.n, attr, was: ready.value, settle: CLICK_SETTLE_MS });
    const pressed = decode(await page.screenshot({ type: 'png' }));
    results.push({ n: c.n, desc: c.desc, attr, before: ready.value, after, ambient: countChangedPixels(still, before), changed: countChangedPixels(before, pressed) });
    // A toggle goes back with a second press. A tab stays: the next tab's own press moves it.
    if (after !== ready.value && after !== null && attr !== 'aria-selected') await page.evaluate(press, { n: c.n, attr, was: after, settle: CLICK_SETTLE_MS });
  }
  if (candidates.length > maxClicks) skipped.push(`${candidates.length - maxClicks} control(s) that declare a state were not clicked: the limit is ${maxClicks}`);
  return { results, skipped };
}

// The page must already be loaded and settled, and `probeClickListeners` must have been installed
// with addInitScript before it loaded (without it, only inline onclick handlers are seen).
// `patterns: false` skips the key-driving pass (the borrowed checker), for a page that is still markup.
// `clicks` (the click pass on two-state toggles) follows `patterns` unless it is set on its own.
// `contrast: false` leaves the contrast pass out; `motion: false` the reduced-motion pass;
// `targets: false` the target-size pass.
async function auditPage(page, { maxStops = DEFAULT_MAX_STOPS, patterns = true, clicks = patterns, contrast = true, motion = true, targets = true, maxWidgets = DEFAULT_MAX_WIDGETS, maxClicks = DEFAULT_MAX_CLICKS, maxStates = DEFAULT_MAX_STATES } = {}) {
  const style = await page.addStyleTag({
    content: '*, *::before, *::after { caret-color: transparent !important; transition-duration: 0s !important; transition-delay: 0s !important; animation-play-state: paused !important; }',
  });
  const facts = await page.evaluate(collectControls, { controlRoles: CONTROL_ROLES, groupRoles: GROUP_ROLES });
  try {
    try {
      await readNames(page, facts);
      Object.assign(facts, await walkTabOrder(page, maxStops));
      for (const stop of facts.stops) if (stop.n !== null) stop.desc = facts.controls[stop.n].desc;
      // While the audit's own stylesheet still holds transitions at zero and animations still:
      // a hover colour is read at its end, and two photographs show the same frame.
      if (contrast) facts.contrast = await measureContrast(page, maxStates);
      if (targets) {
        const floor = await page.evaluate(() => document.documentElement.hasAttribute('data-phone-runnable')) ? TARGET_FLOOR_TOUCH : TARGET_FLOOR;
        const controls = facts.controls.filter((c) => c.native !== null || CONTROL_ROLES.includes(c.role)).map((c) => c.n);
        facts.targets = await page.evaluate(measureTargets, { floor, controls });
      }
    } finally {
      await style.evaluate((el) => el.remove()).catch(() => {});
    }
    // Once the audit's stylesheet is gone (it holds every animation still, and this pass is about
    // which ones run), and before anything is pressed.
    if (motion) facts.motion = await measureReducedMotion(page);
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
    // After the keys, for the same reason. Transitions are cut so the second photograph shows the
    // state the click ended in, not a frame on the way there; animations are left to run.
    if (clicks) {
      const calm = await page.addStyleTag({ content: '*, *::before, *::after { caret-color: transparent !important; transition-duration: 0s !important; transition-delay: 0s !important; }' });
      try {
        facts.clicks = await driveClicks(page, facts.controls, maxClicks);
      } finally {
        await calm.evaluate((el) => el.remove()).catch(() => {});
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
