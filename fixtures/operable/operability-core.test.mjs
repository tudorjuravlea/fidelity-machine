// operability-core: the judge half of the rendered operability audit (CONTRACT.md §Invocation
// contract, operability-audit.mjs). These cases hand the judge the facts a page would yield, so each
// rule is pinned on both sides without a browser: it fires on the defect and stays quiet on the
// repaired control. The page half (collection, Tab walk, focus painting) is in operability.test.mjs.
//   node --test "fixtures/operable/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeOperability, countChangedPixels, MIN_FOCUS_PIXELS } from '../../scripts/operability-core.mjs';

const control = (over = {}) => ({
  n: 0, desc: 'button "Save"', tag: 'button', role: null, native: 'button', name: 'Save', exposed: true,
  visible: true, disabled: false, focusable: true, tabbable: true, click: false, hasContent: true, aria: {},
  contextRoles: [], composite: null, tabbableInside: false, controlAbove: false, isLabel: false, ...over,
});
const facts = (over = {}) => ({
  controls: [control()], references: [], referenceCount: 0, stops: [], walk: { stops: 0, truncated: false }, ...over,
});
const rules = (r) => r.findings.map((f) => `${f.level} ${f.rule}`);

test('a named, focusable native button yields no finding and is counted as checked', () => {
  const r = judgeOperability(facts());
  assert.deepEqual(r.findings, []);
  assert.equal(r.checked.controls, 1);
  assert.deepEqual(r.deferred, []);
});

test('unnamed-control: an exposed control with an empty accessible name is an ERROR naming the element', () => {
  const r = judgeOperability(facts({ controls: [control({ desc: 'button.icon', name: '' })] }));
  assert.deepEqual(rules(r), ['ERROR unnamed-control']);
  assert.match(r.findings[0].message, /^unnamed-control: button\.icon /);
  assert.equal(r.findings[0].element, 'button.icon');
});

test('unnamed-control stays quiet on a control the accessibility tree does not expose', () => {
  const r = judgeOperability(facts({ controls: [control({ name: '', exposed: false })] }));
  assert.deepEqual(r.findings, []);
});

test('unnamed-control judges whitespace as empty', () => {
  const r = judgeOperability(facts({ controls: [control({ name: '  \n ' })] }));
  assert.deepEqual(rules(r), ['ERROR unnamed-control']);
});

test('broken-reference: a naming reference to a missing id is an ERROR, a describing one a WARN', () => {
  const r = judgeOperability(facts({
    referenceCount: 3,
    references: [
      { desc: 'input#email', attr: 'aria-labelledby', id: 'email-label', expanded: null },
      { desc: 'input#email', attr: 'aria-describedby', id: 'email-hint', expanded: null },
    ],
  }));
  assert.deepEqual(rules(r), ['ERROR broken-reference', 'WARN broken-reference']);
  assert.match(r.findings[0].message, /aria-labelledby="email-label"/);
  assert.equal(r.checked.references, 3);
});

test('broken-reference: aria-controls on a collapsed trigger may point at a popup that is not rendered', () => {
  const closed = judgeOperability(facts({ references: [{ desc: 'button "Menu"', attr: 'aria-controls', id: 'menu', expanded: 'false' }] }));
  assert.deepEqual(closed.findings, []);
  const open = judgeOperability(facts({ references: [{ desc: 'button "Menu"', attr: 'aria-controls', id: 'menu', expanded: 'true' }] }));
  assert.deepEqual(rules(open), ['ERROR broken-reference']);
});

test('missing-state: an explicit switch, checkbox or radio role without aria-checked is an ERROR', () => {
  for (const role of ['switch', 'checkbox', 'radio', 'menuitemcheckbox', 'menuitemradio']) {
    const inMenu = role.startsWith('menuitem') ? { contextRoles: ['menu'] } : {};
    const bad = judgeOperability(facts({ controls: [control({ tag: 'div', native: null, role, desc: `div[role=${role}]`, ...inMenu })] }));
    assert.deepEqual(rules(bad), ['ERROR missing-state'], role);
    assert.match(bad.findings[0].message, /aria-checked/);
    const good = judgeOperability(facts({ controls: [control({ tag: 'div', native: null, role, aria: { 'aria-checked': 'false' }, ...inMenu })] }));
    assert.deepEqual(good.findings, [], role);
  }
});

test('missing-state: combobox needs aria-expanded and slider aria-valuenow', () => {
  const combo = judgeOperability(facts({ controls: [control({ tag: 'div', native: null, role: 'combobox' })] }));
  assert.match(combo.findings[0].message, /aria-expanded/);
  const slider = judgeOperability(facts({ controls: [control({ tag: 'div', native: null, role: 'slider' })] }));
  assert.match(slider.findings[0].message, /aria-valuenow/);
});

test('missing-state stays quiet when a native element already carries the state', () => {
  const r = judgeOperability(facts({ controls: [control({ tag: 'input', native: 'checkbox', role: 'switch' })] }));
  assert.deepEqual(r.findings, []);
});

test('orphan-role: a tab outside a tablist is an ERROR; inside one, or inside a group in a listbox, it is fine', () => {
  const tab = (over) => control({ tag: 'div', native: null, role: 'tab', aria: { 'aria-selected': 'true' }, desc: 'div[role=tab] "Overview"', ...over });
  assert.deepEqual(rules(judgeOperability(facts({ controls: [tab()] }))), ['ERROR orphan-role']);
  assert.deepEqual(judgeOperability(facts({ controls: [tab({ contextRoles: ['tablist'] })] })).findings, []);
  const option = control({ tag: 'li', native: null, role: 'option', contextRoles: ['group', 'listbox'], composite: { role: 'listbox', reachable: true } });
  assert.deepEqual(judgeOperability(facts({ controls: [option] })).findings, []);
  const item = control({ tag: 'div', native: null, role: 'menuitem', contextRoles: ['navigation'] });
  assert.match(judgeOperability(facts({ controls: [item] })).findings[0].message, /menu or menubar/);
});

const clickDiv = (over = {}) => control({
  tag: 'div', native: null, desc: 'div.card "Open account"', name: null, exposed: true, focusable: false,
  tabbable: false, click: true, ...over,
});

test('click-without-keyboard: something that answers a click but cannot take focus is an ERROR', () => {
  const r = judgeOperability(facts({ controls: [clickDiv()] }));
  assert.deepEqual(rules(r), ['ERROR click-without-keyboard']);
  assert.match(r.findings[0].message, /div\.card "Open account"/);
});

test('click-without-keyboard: an explicit button role that cannot take focus is caught without a listener', () => {
  const r = judgeOperability(facts({ controls: [clickDiv({ click: false, role: 'button', name: 'Open account' })] }));
  assert.deepEqual(rules(r), ['ERROR click-without-keyboard']);
});

test('click-without-keyboard stays quiet for every legitimate shape', () => {
  const quiet = {
    'it can take focus': { focusable: true, tabbable: true },
    'a control inside it takes focus (a clickable card around a link)': { tabbableInside: true },
    'it sits inside a control that takes focus': { controlAbove: true },
    'it is a label': { isLabel: true },
    'it shows nothing (a backdrop)': { hasContent: false },
    'it is disabled': { disabled: true },
    'it is not rendered': { visible: false },
    'its composite is reachable (roving or active descendant)': { role: 'option', contextRoles: ['listbox'], composite: { role: 'listbox', reachable: true } },
  };
  for (const [why, over] of Object.entries(quiet)) {
    assert.deepEqual(judgeOperability(facts({ controls: [clickDiv(over)] })).findings, [], why);
  }
});

test('click-without-keyboard fires for an option whose listbox offers no tab stop at all', () => {
  const r = judgeOperability(facts({ controls: [clickDiv({ role: 'option', aria: { 'aria-selected': 'false' }, contextRoles: ['listbox'], composite: { role: 'listbox', reachable: false }, name: 'Alpha' })] }));
  assert.deepEqual(rules(r), ['ERROR click-without-keyboard']);
});

test('focus-not-visible: a tab stop on a control that paints nothing when focused is an ERROR with the pixel count', () => {
  const r = judgeOperability(facts({ stops: [{ n: 0, desc: 'button "Save"', changed: 3 }], walk: { stops: 1, truncated: false } }));
  assert.deepEqual(rules(r), ['ERROR focus-not-visible']);
  assert.match(r.findings[0].message, /3 px/);
  assert.equal(r.findings[0].evidence.changed, 3);
  assert.equal(r.checked.focusJudged, 1);
});

test('focus-not-visible stays quiet at the threshold and ignores stops that are not controls', () => {
  const r = judgeOperability(facts({
    stops: [{ n: 0, desc: 'button "Save"', changed: MIN_FOCUS_PIXELS }, { n: null, desc: 'div.scroller', changed: 0 }],
    walk: { stops: 2, truncated: false },
  }));
  assert.deepEqual(r.findings, []);
  assert.equal(r.checked.focusJudged, 1);
});

test('a Tab walk cut at the limit is deferred, so a quiet run cannot read as a pass', () => {
  const r = judgeOperability(facts({ walk: { stops: 80, truncated: true } }));
  assert.equal(r.deferred.length, 1);
  assert.match(r.deferred[0], /80/);
});

test('a page with no control and no reference has nothing checked', () => {
  const r = judgeOperability(facts({ controls: [] }));
  assert.equal(r.checked.controls + r.checked.references, 0);
});

test('the report says what the audit does not judge', () => {
  const r = judgeOperability(facts());
  assert.ok(r.manual.some((m) => /arrow keys/i.test(m)));
  assert.ok(r.manual.some((m) => /contrast/i.test(m)));
  assert.ok(r.manual.some((m) => /caret/i.test(m)));
  assert.ok(r.manual.some((m) => /shadow/i.test(m) && /iframe/i.test(m)));
});

const group = (over = {}) => ({ g: 0, desc: 'div[role=radiogroup] "PDF CSV"', role: 'radiogroup', name: '', exposed: true, ...over });

test('unnamed-group: a radio group, tab list, listbox, tree, grid or dialog the browser exposes with no name is an ERROR', () => {
  const r = judgeOperability(facts({ groups: [group()] }));
  assert.deepEqual(rules(r), ['ERROR unnamed-group']);
  assert.match(r.findings[0].message, /^unnamed-group: div\[role=radiogroup\] "PDF CSV" has role="radiogroup" and no accessible name/);
  assert.equal(r.checked.groups, 1);
});

test('unnamed-group stays quiet for a named group and for one the accessibility tree does not expose', () => {
  assert.deepEqual(judgeOperability(facts({ groups: [group({ name: 'Statement format' })] })).findings, []);
  assert.deepEqual(judgeOperability(facts({ groups: [group({ exposed: false })] })).findings, []);
});

test('unnamed-group yields to the pattern checker when it already said the same thing about the same widget', () => {
  const r = judgeOperability(facts({
    groups: [group({ g: 3, role: 'tablist', desc: 'div[role=tablist] "One Two"' })],
    patterns: { results: [{ g: 3, desc: 'div[role=tablist] "One Two"', pattern: 'tabs', problems: ['div[role=tablist]: has no accessible name; give it aria-label or aria-labelledby (APG tabs).'] }], skipped: [] },
  }));
  assert.deepEqual(rules(r), ['ERROR pattern-tabs']);
});

const tabsRun = (over = {}) => ({ desc: 'div[role=tablist] "One Two"', pattern: 'tabs', problems: [], ...over });

test('pattern checks: each problem the borrowed checker reports is an ERROR named after its pattern and its element', () => {
  const r = judgeOperability(facts({ patterns: { results: [tabsRun({ problems: [
    'div[role=tablist]: has 2 tab stops (button#a[role=tab], button#b[role=tab]); a composite has one, and arrows move within it (APG tabs).',
    'button#a[role=tab]: End should move focus to the last tab, button#b[role=tab], but focus stayed (APG tabs).',
  ] })], skipped: [] } }));
  assert.deepEqual(rules(r), ['ERROR pattern-tabs', 'ERROR pattern-tabs']);
  assert.equal(r.findings[0].element, 'div[role=tablist]');
  assert.equal(r.findings[1].element, 'button#a[role=tab]');
  assert.match(r.findings[0].message, /^pattern-tabs: div\[role=tablist\] has 2 tab stops/);
  assert.equal(r.findings[0].evidence.widget, 'div[role=tablist] "One Two"');
  assert.equal(r.checked.patterns, 1);
});

test('pattern checks: a widget that passes yields nothing and is counted; a check that could not run is deferred', () => {
  const r = judgeOperability(facts({ patterns: { results: [tabsRun()], skipped: ['the menu check on div[role=menu] could not run: boom'] } }));
  assert.deepEqual(r.findings, []);
  assert.equal(r.checked.patterns, 1);
  assert.deepEqual(r.deferred, ['the menu check on div[role=menu] could not run: boom']);
});

test('without the pattern pass the report says keys were not driven; with it, it says which widgets were', () => {
  const off = judgeOperability(facts());
  assert.equal(off.checked.patterns, 0);
  assert.ok(off.manual.some((m) => /arrow keys.*not driven/i.test(m)));
  const on = judgeOperability(facts({ patterns: { results: [], skipped: [] } }));
  assert.ok(!on.manual.some((m) => /arrow keys.*not driven here/i.test(m)));
  assert.ok(on.manual.some((m) => /disclosure/i.test(m) && /accordion/i.test(m)));
});

test('countChangedPixels counts pixels whose colour moved past the tolerance, and only those', () => {
  const px = (...rgb) => [...rgb, 255];
  const a = Buffer.from([...px(255, 255, 255), ...px(255, 255, 255), ...px(0, 0, 0), ...px(10, 10, 10)]);
  const b = Buffer.from([...px(255, 255, 255), ...px(250, 250, 250), ...px(0, 0, 200), ...px(10, 40, 10)]);
  assert.equal(countChangedPixels(a, b, 16), 2);
  assert.equal(countChangedPixels(a, a, 16), 0);
  assert.throws(() => countChangedPixels(a, b.subarray(4), 16), /same size/);
});
