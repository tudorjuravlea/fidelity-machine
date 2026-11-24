// runtime/figma/*.js: the plugin-sandbox scripts (CONTRACT.md §Plugin-sandbox scripts).
//   node --test "fixtures/capture/*.test.mjs"
// Three things are pinned here. (1) The read-only guard: every script is scanned for the members
// that write a document, and the scan is proved able to fail on planted writes. (2) Each script
// runs under a mock of the Plugin API shaped from @figma/plugin-typings 1.143.0 (the version the
// README names) and its output is asserted. (3) inventory.js's fragment is fed to the real
// capture-figma.mjs and the lock it derives is asserted, units included. No live Figma file is
// involved: a live run that disagrees with the mock is a finding against the mock first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'runtime', 'figma');
const CLI = path.join(ROOT, 'scripts', 'capture-figma.mjs');
const SCRIPTS = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = (file, figma) => new AsyncFunction('figma', readFileSync(path.join(DIR, file), 'utf8'))(figma);

// --- (1) the read-only guard -----------------------------------------------------------------------
// Writes in the Plugin API are methods (create*, set*Async, …) or property setters on document
// objects. The scripts bind document objects only to the names below and their own output to
// `out`, so an assignment to a property of one of those names is a write.
const DOC_NAMES = 'figma|node|n|root|page|p|s|v|c|e|m|l|target|tc|inst|comp|child|style|variable|collection';
const WRITE_CALLS = /\.(create[A-Z]\w*|appendChild|insertChild|remove|resize|rescale|set\w*Async|setBoundVariable\w*|setValueForMode|setProperties|import\w*ByKeyAsync|loadFontAsync|clone|setPluginData|setSharedPluginData|setRelaunchData|setExplicitVariableModeForCollection|removeOverrideForMode|setVariableCodeSyntax|removeVariableCodeSyntax|addMode|renameMode|removeMode|outlineStroke|flatten|rotate|setRangeTextStyleIdAsync|setRangeFillStyleIdAsync)\s*\(/g;
const WRITE_SETS = new RegExp(`\\b(?:${DOC_NAMES})\\.[A-Za-z_$][\\w$]*(?:\\[[^\\]]*\\])?\\s*=(?!=)`, 'g');
const ALLOWED_CALLS = new Set(['setCurrentPageAsync']); // the viewer's page, not the document

function writesFound(src) {
  const hits = [];
  for (const m of src.matchAll(WRITE_CALLS)) if (!ALLOWED_CALLS.has(m[1])) hits.push(m[0]);
  for (const m of src.matchAll(WRITE_SETS)) hits.push(m[0]);
  return hits;
}

test('every runtime/figma script is free of document writes', () => {
  assert.deepEqual(SCRIPTS, ['binding-census.js', 'components.js', 'inventory.js']);
  for (const f of SCRIPTS) {
    const hits = writesFound(readFileSync(path.join(DIR, f), 'utf8'));
    assert.deepEqual(hits, [], `${f} writes: ${hits.join(' · ')}`);
  }
});

test('the guard fails on planted writes (a call, a setter, an import, a page setter)', () => {
  const clean = readFileSync(path.join(DIR, 'components.js'), 'utf8');
  assert.deepEqual(writesFound(clean), []);
  for (const plant of [
    'const f = figma.createFrame();',
    'node.fills = [];',
    "await figma.variables.importVariableByKeyAsync('k');",
    'figma.currentPage = page;',
    'page.appendChild(f);',
    "s.name = 'x';",
    "await node.setFillStyleIdAsync('S:1');",
  ]) {
    assert.ok(writesFound(clean + '\n' + plant).length > 0, `not caught: ${plant}`);
  }
});

test('the guard ignores the one allowed state change and the scripts\' own output objects', () => {
  assert.deepEqual(writesFound('await figma.setCurrentPageAsync(p);\nout.page = { id: 1 };\nout.counts[k] = 1;\nconst x = n.name === "a";'), []);
});

// --- (2) a mock of the Plugin API, shaped from the typings -------------------------------------------
const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });
const rgb = (r, g, b) => ({ r: r / 255, g: g / 255, b: b / 255 });
function mockFigma() {
  const collections = [
    { id: 'VC:theme', name: 'Theme', modes: [{ modeId: 'm-light', name: 'Light' }, { modeId: 'm-dark', name: 'Dark' }], defaultModeId: 'm-light', variableIds: ['V:bg', 'V:accent', 'V:flag'], remote: false, hiddenFromPublishing: false },
    { id: 'VC:prim', name: 'Primitives', modes: [{ modeId: 'm-p', name: 'Value' }], defaultModeId: 'm-p', variableIds: ['V:n100', 'V:n900', 'V:size', 'V:family'], remote: false, hiddenFromPublishing: false },
    { id: 'VC:bp', name: 'Breakpoints', modes: [{ modeId: 'm-desk', name: 'Desktop' }, { modeId: 'm-mob', name: 'Mobile' }], defaultModeId: 'm-desk', variableIds: ['V:space'], remote: false, hiddenFromPublishing: false },
  ];
  const variables = [
    { id: 'V:bg', name: 'Surface/Background', variableCollectionId: 'VC:theme', resolvedType: 'COLOR', scopes: ['FRAME_FILL', 'SHAPE_FILL'], hiddenFromPublishing: false, valuesByMode: { 'm-light': alias('V:n100'), 'm-dark': alias('V:n900') } },
    { id: 'V:accent', name: 'Surface/Accent', variableCollectionId: 'VC:theme', resolvedType: 'COLOR', scopes: ['ALL_FILLS'], hiddenFromPublishing: false, valuesByMode: { 'm-light': rgb(15, 81, 50), 'm-dark': { color: alias('V:n100'), opacity: 0.5 } } },
    { id: 'V:flag', name: 'Flag/Beta', variableCollectionId: 'VC:theme', resolvedType: 'BOOLEAN', scopes: ['ALL_SCOPES'], hiddenFromPublishing: true, valuesByMode: { 'm-light': true, 'm-dark': false } },
    { id: 'V:n100', name: 'Neutral/100', variableCollectionId: 'VC:prim', resolvedType: 'COLOR', scopes: ['ALL_SCOPES'], hiddenFromPublishing: false, valuesByMode: { 'm-p': rgb(247, 246, 243) } },
    { id: 'V:n900', name: 'Neutral/900', variableCollectionId: 'VC:prim', resolvedType: 'COLOR', scopes: ['ALL_SCOPES'], hiddenFromPublishing: false, valuesByMode: { 'm-p': rgb(23, 22, 19) } },
    { id: 'V:size', name: 'Size/Control', variableCollectionId: 'VC:prim', resolvedType: 'FLOAT', scopes: ['CORNER_RADIUS'], hiddenFromPublishing: false, valuesByMode: { 'm-p': 8 } },
    { id: 'V:family', name: 'Font/Family', variableCollectionId: 'VC:prim', resolvedType: 'STRING', scopes: ['FONT_FAMILY'], hiddenFromPublishing: false, valuesByMode: { 'm-p': 'Inter' } },
    { id: 'V:space', name: 'Space/md', variableCollectionId: 'VC:bp', resolvedType: 'FLOAT', scopes: ['GAP'], hiddenFromPublishing: false, valuesByMode: { 'm-desk': 16, 'm-mob': 12 } },
  ];
  const textStyles = [
    { id: 'S:h3', name: 'Headline 3', type: 'TEXT', remote: false, fontName: { family: 'Inter', style: 'Bold' }, fontSize: 24, lineHeight: { unit: 'PIXELS', value: 28 }, letterSpacing: { unit: 'PERCENT', value: -0.5 }, textCase: 'ORIGINAL' },
    { id: 'S:body', name: 'Body', type: 'TEXT', remote: false, fontName: { family: 'Inter', style: 'Regular' }, fontSize: 16, lineHeight: { unit: 'PERCENT', value: 150 }, letterSpacing: { unit: 'PIXELS', value: 0 }, textCase: 'ORIGINAL' },
    { id: 'S:cap', name: 'Caption', type: 'TEXT', remote: false, fontName: { family: 'Inter', style: 'Medium Italic' }, fontSize: 12, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0.25 }, textCase: 'UPPER' },
  ];
  const paintStyles = [
    { id: 'P:brand', name: 'Brand/Primary', type: 'PAINT', remote: false, paints: [{ type: 'SOLID', color: rgb(15, 81, 50), opacity: 1 }] },
    { id: 'P:hero', name: 'Hero/Gradient', type: 'PAINT', remote: false, paints: [{ type: 'GRADIENT_LINEAR', gradientStops: [] }] },
  ];
  const effectStyles = [
    { id: 'E:raised', name: 'Elevation/Raised', type: 'EFFECT', remote: false, effects: [
      { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.06 }, offset: { x: 0, y: 1 }, radius: 2, spread: 0, visible: true, blendMode: 'NORMAL' },
      { type: 'INNER_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.1 }, offset: { x: 0, y: 0 }, radius: 1, visible: true, blendMode: 'NORMAL' },
    ] },
  ];
  // a page with one component set, one solo component, and the nodes the census judges
  const text = { id: '1:10', type: 'TEXT', name: 'Label', textStyleId: '', fills: [{ type: 'SOLID', color: rgb(30, 30, 30), opacity: 1 }], boundVariables: {} };
  const boundText = { id: '1:11', type: 'TEXT', name: 'Title', textStyleId: 'S:h3', fillStyleId: 'P:brand', fills: [{ type: 'SOLID', color: rgb(15, 81, 50) }], boundVariables: {} };
  const box = { id: '1:12', type: 'FRAME', name: 'Box', layoutMode: 'VERTICAL', paddingTop: 12, paddingBottom: 12, paddingLeft: 16, paddingRight: 16, itemSpacing: 8, cornerRadius: 8,
    fills: [{ type: 'SOLID', color: rgb(247, 246, 243), boundVariables: { color: alias('V:n100') } }], strokes: [{ type: 'SOLID', color: rgb(179, 179, 179), opacity: 1 }], effects: [{ type: 'DROP_SHADOW', visible: true }],
    effectStyleId: '', strokeStyleId: '', fillStyleId: '', boundVariables: { paddingTop: alias('V:space'), paddingBottom: alias('V:space'), itemSpacing: alias('V:space') },
    children: [text, boundText], findAll: () => [text, boundText] };
  const v1 = { id: '1:2', type: 'COMPONENT', name: 'State=Default', key: 'k-default', remote: false, width: 120, height: 40, children: [box], findAll: () => [box, text, boundText] };
  const v2 = { id: '1:3', type: 'COMPONENT', name: 'State=Hover', key: 'k-hover', remote: false, width: 120, height: 40, children: [], findAll: () => [] };
  const set = { id: '1:1', type: 'COMPONENT_SET', name: 'Button', key: 'k-button', remote: false, children: [v1, v2], componentPropertyDefinitions: { State: { type: 'VARIANT', variantOptions: ['Default', 'Hover'] } }, findAll: () => [v1, v2, box, text, boundText] };
  v1.parent = set; v2.parent = set;
  const solo = { id: '1:4', type: 'COMPONENT', name: 'Avatar', key: 'k-avatar', remote: false, width: 40, height: 40, parent: null, children: [], findAll: () => [], fills: [{ type: 'SOLID', color: rgb(200, 200, 200) }], fillStyleId: '', cornerRadius: 20, boundVariables: {} };
  const all = [set, v1, v2, box, text, boundText, solo];
  const page = { id: '0:1', type: 'PAGE', name: 'Components', children: [set, solo],
    findAllWithCriteria: ({ types }) => all.filter((n) => types.includes(n.type)) };
  const other = { id: '0:2', type: 'PAGE', name: 'Screens', children: [], findAllWithCriteria: () => [] };
  const byId = new Map(all.concat([page, other]).map((n) => [n.id, n]));
  const figma = {
    currentPage: page,
    root: { children: [page, other] },
    skipInvisibleInstanceChildren: false,
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getLocalVariablesAsync: async () => variables,
      getVariableByIdAsync: async (id) => variables.find((v) => v.id === id) ?? null,
    },
    teamLibrary: { getAvailableLibraryVariableCollectionsAsync: async () => [{ name: 'Tokens', key: 'lib-k1', libraryName: 'Acme DS' }] },
    getLocalTextStylesAsync: async () => textStyles,
    getLocalPaintStylesAsync: async () => paintStyles,
    getLocalEffectStylesAsync: async () => effectStyles,
    getNodeByIdAsync: async (id) => byId.get(id) ?? null,
    setCurrentPageAsync: async (p) => { figma.currentPage = p; figma.switches = (figma.switches ?? 0) + 1; },
  };
  return figma;
}

test('inventory.js: colours once per mode, numbers once, units inline, aliases followed, the unexpressible noted', async () => {
  const out = await run('inventory.js', mockFigma());
  const d = out.variableDefs;
  assert.equal(d['Light/Surface/Background'], '#F7F6F3', 'light alias → the primitive');
  assert.equal(d['Dark/Surface/Background'], '#171613', 'dark alias → the other primitive');
  assert.equal(d['Light/Surface/Accent'], '#0F5132');
  assert.equal(d['Dark/Surface/Accent'], '#F7F6F380', 'composed colour: alias + opacity → 8-digit hex');
  assert.equal(d['Neutral/100'], '#F7F6F3', 'a single-mode collection carries no mode prefix');
  assert.equal(d['Size/Control'], 8);
  assert.equal(d['Space/md'], 16, 'a multi-mode number is written once, for the default mode');
  assert.equal(d['Desktop/Space/md'], undefined);
  assert.equal(d['Font/Family'], 'Inter');
  assert.equal(d['Flag/Beta'], undefined, 'a boolean carries no token');
  assert.deepEqual(out.variableScopes['Size/Control'], ['CORNER_RADIUS']);
  assert.deepEqual(out.variableScopes['Light/Surface/Background'], ['FRAME_FILL', 'SHAPE_FILL']);
  assert.equal(d['Headline 3'], 'Font(family: "Inter", style: "Bold", size: 24px, weight: 700, lineHeight: 28px, letterSpacing: -0.5%)');
  assert.equal(d['Body'], 'Font(family: "Inter", style: "Regular", size: 16px, weight: 400, lineHeight: 1.5, letterSpacing: 0)');
  assert.equal(d['Caption'], 'Font(family: "Inter", style: "Medium Italic", size: 12px, weight: 500, lineHeight: auto, letterSpacing: 0.25px)');
  assert.equal(d['Brand/Primary'], '#0F5132');
  assert.equal(d['Hero/Gradient'], undefined);
  assert.equal(d['Elevation/Raised'], 'Effect(type: DROP_SHADOW, color: #0000000F, offset: (0, 1), radius: 2, spread: 0)');
  assert.ok(out.notes.some((n) => n.includes('"Caption"') && n.includes('AUTO')), 'AUTO line height is a note');
  assert.ok(out.notes.some((n) => n.includes('"Hero/Gradient"')), 'a gradient paint style is a note');
  assert.ok(out.notes.some((n) => n.includes('"Elevation/Raised"') && n.includes('INNER_SHADOW')), 'a non-shadow layer is a note');
  assert.ok(out.notes.some((n) => n.includes('NOT in variableDefs')), 'library collections are named, not read');
  assert.deepEqual(out.libraries, [{ name: 'Tokens', key: 'lib-k1', libraryName: 'Acme DS' }]);
  assert.equal(out.counts.colors, 6, "bg and accent in two modes, two primitives"); assert.equal(out.counts.numbers, 2); assert.equal(out.counts.strings, 1);
  assert.equal(out.counts.aliases, 3); assert.equal(out.counts.hiddenFromPublishing, 1);
  assert.equal(out.counts.textStyles, 3); assert.equal(out.counts.paintStylesSkipped, 1);
  assert.deepEqual(out.collections.map((c) => c.defaultMode), ['Light', 'Value', 'Desktop']);
});

test('inventory.js: NUMBER_MODE picks the mode a multi-mode collection contributes for numbers', async () => {
  const src = readFileSync(path.join(DIR, 'inventory.js'), 'utf8').replace("const NUMBER_MODE = '';", "const NUMBER_MODE = 'Mobile';");
  const out = await new AsyncFunction('figma', src)(mockFigma());
  assert.equal(out.variableDefs['Space/md'], 12);
  assert.equal(out.variableDefs['Size/Control'], 8, 'a collection without that mode falls back to its default');
  assert.ok(out.notes.some((n) => n.includes('no mode named "Mobile"')));
});

test('inventory.js → capture-figma.mjs: the lock carries the units, the modes, the scope route and the aliases', async () => {
  const out = await run('inventory.js', mockFigma());
  const dir = mkdtempSync(path.join(tmpdir(), 'capture-inventory-'));
  try {
    const input = path.join(dir, 'capture.json');
    const lockPath = path.join(dir, 'design-lock.json');
    writeFileSync(input, JSON.stringify({ name: 'acme-banking', variableDefs: out.variableDefs, variableScopes: out.variableScopes }));
    const r = spawnSync(process.execPath, [CLI, '--input', input, '--out', lockPath], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.ok(existsSync(lockPath));
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const t = lock.tokens;
    assert.equal(t.colors.light['surface-background'], '#F7F6F3');
    assert.equal(t.colors.dark['surface-background'], '#171613');
    assert.equal(t.colors.light.background, '#F7F6F3', 'canonical alias derived from the namespaced slot');
    assert.equal(t.colors.dark['surface-accent'], '#F7F6F380');
    assert.equal(t.radii['size-control'], 8, 'routed by CORNER_RADIUS scope');
    assert.equal(t.typography['headline-3'].letterSpacingEm, -0.005, 'the percent unit travelled inline');
    assert.equal(t.typography['headline-3'].lineHeight, 1.167, 'px line height → ratio');
    assert.equal(t.typography.body.lineHeight, 1.5);
    assert.equal(t.typography.caption, undefined, 'an AUTO line height cannot enter the lock');
    assert.match(r.stdout, /"Caption": Font\(\.\.\.\) composite missing/);
    assert.equal(t.elevation.raised, '0px 1px 2px 0px #0000000F');
    assert.doesNotMatch(r.stderr, /letterSpacingUnit/, 'no bare letter-spacing ever reaches the refusal');
    assert.match(r.stdout, /scopes:\s+1 routed by declared scope · 0 name\/scope disagreement/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('components.js: one page, sets with their variant properties, solos, no page switch when PAGE_ID is empty', async () => {
  const figma = mockFigma();
  const out = await run('components.js', figma);
  assert.deepEqual(out.page, { id: '0:1', name: 'Components' });
  assert.equal(out.sets.length, 1);
  assert.equal(out.sets[0].name, 'Button'); assert.equal(out.sets[0].variants, 2);
  assert.deepEqual(out.sets[0].properties, [{ name: 'State', type: 'VARIANT', options: ['Default', 'Hover'] }]);
  assert.deepEqual(out.solos.map((s) => s.name), ['Avatar'], 'variants inside a set are not solos');
  assert.equal(out.truncated, false);
  assert.equal(figma.switches, undefined);
});

test('components.js: PAGE_ID switches the page exactly once and refuses a non-page', async () => {
  const src = readFileSync(path.join(DIR, 'components.js'), 'utf8');
  const figma = mockFigma();
  const out = await new AsyncFunction('figma', src.replace("const PAGE_ID = '';", "const PAGE_ID = '0:2';"))(figma);
  assert.deepEqual(out.page, { id: '0:2', name: 'Screens' });
  assert.equal(figma.switches, 1);
  assert.deepEqual(out.sets, []);
  const bad = await new AsyncFunction('figma', src.replace("const PAGE_ID = '';", "const PAGE_ID = '1:1';"))(mockFigma());
  assert.equal(bad.page, null);
  assert.match(bad.notes[0], /not a page/);
});

test('binding-census.js: bound and raw per property class, raw colours and numbers collected, worst nodes named', async () => {
  const out = await run('binding-census.js', mockFigma());
  assert.equal(out.scope.masters, 2);
  assert.equal(out.nodes, 7);
  assert.deepEqual(out.totals.text, { bound: 1, raw: 1 });
  assert.deepEqual(out.totals.fill, { bound: 2, raw: 2 }, 'Box (variable) and Title (style) bound; Label and Avatar raw');
  assert.deepEqual(out.totals.stroke, { bound: 0, raw: 1 });
  assert.deepEqual(out.totals.effect, { bound: 0, raw: 1 });
  assert.deepEqual(out.totals.padding, { bound: 2, raw: 2 }, 'top/bottom bound, left/right raw');
  assert.deepEqual(out.totals.gap, { bound: 1, raw: 0 });
  assert.deepEqual(out.totals.radius, { bound: 0, raw: 2 });
  assert.deepEqual(out.rawColours, { '#1E1E1E': 1, '#B3B3B3': 1, '#C8C8C8': 1 });
  assert.deepEqual(out.rawNumbers, { 'padding:16': 2, 'radius:8': 1, 'radius:20': 1 });
  assert.equal(out.worst[0].name, 'Box');
  assert.deepEqual(out.worst[0].raw, ['stroke', 'effect', 'paddingLeft', 'paddingRight', 'cornerRadius']);
  assert.match(out.notes[0], /7 node\(s\) judged: 6 bound, 9 raw/);
});

test('binding-census.js: NODE_IDS narrows the walk and names a missing id', async () => {
  const src = readFileSync(path.join(DIR, 'binding-census.js'), 'utf8').replace('const NODE_IDS = [];', "const NODE_IDS = ['1:4', '9:9'];");
  const out = await new AsyncFunction('figma', src)(mockFigma());
  assert.equal(out.nodes, 1);
  assert.deepEqual(out.totals.radius, { bound: 0, raw: 1 });
  assert.ok(out.notes.some((n) => n.includes('"9:9"')));
});
