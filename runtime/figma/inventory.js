// inventory.js — the file's styles and variables, with their units, modes and scopes, as a capture.json fragment.
// Paste this whole file into the Figma MCP's use_figma. Read-only (CONTRACT.md §Plugin-sandbox scripts).
// Contract: runtime/figma/README.md. Output: { variableDefs, variableScopes, styles, collections, libraries, counts, notes }.
//
// Input, one constant:
//   NUMBER_MODE: the mode name whose values a multi-mode collection contributes for FLOAT and STRING
//   variables (a responsive collection has one spacing scale per breakpoint; the lock holds one).
//   '' takes each collection's default mode. COLOR variables are written once per mode regardless.
const NUMBER_MODE = '';

const out = { variableDefs: {}, variableScopes: {}, styles: { text: [], paint: [], effect: [] }, collections: [], libraries: [], counts: {}, notes: [] };
const note = (s) => out.notes.push(s);
const tally = (k) => { out.counts[k] = (out.counts[k] || 0) + 1; };

// --- helpers (plain data only; nothing here touches a document object) --------------------------
const h2 = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0').toUpperCase();
const hex = (rgb, alpha) => {
  const a = alpha === undefined || alpha === null ? (typeof rgb.a === 'number' ? rgb.a : 1) : alpha;
  return `#${h2(rgb.r)}${h2(rgb.g)}${h2(rgb.b)}${a < 1 ? h2(a) : ''}`;
};
const num = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000));
const WEIGHTS = [['thin', 100], ['hairline', 100], ['extralight', 200], ['ultralight', 200], ['light', 300], ['regular', 400], ['normal', 400], ['book', 400], ['medium', 500], ['semibold', 600], ['demibold', 600], ['bold', 700], ['extrabold', 800], ['ultrabold', 800], ['black', 900], ['heavy', 900]];
const weightOf = (fontName) => {
  const w = fontName && fontName.variationSettings && fontName.variationSettings.wght;
  if (typeof w === 'number') return String(Math.round(w));
  const key = String(fontName && fontName.style || '').toLowerCase().replace(/[\s_-]/g, '').replace(/italic|oblique/g, '');
  const hit = WEIGHTS.filter(([k]) => key.includes(k)).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? String(hit[1]) : (fontName && fontName.style ? String(fontName.style) : 'regular');
};
const put = (name, value, scopes) => {
  if (name in out.variableDefs) { note(`name collision: "${name}" already written — later value kept out`); tally('collisions'); return; }
  out.variableDefs[name] = value;
  if (scopes) out.variableScopes[name] = scopes.slice();
};

// --- 1. variables, per collection and mode ------------------------------------------------------
const variables = await figma.variables.getLocalVariablesAsync();
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const varById = new Map(variables.map((v) => [v.id, v]));
const collById = new Map(collections.map((c) => [c.id, c]));
for (const c of collections) out.collections.push({ name: c.name, modes: c.modes.map((m) => m.name), defaultMode: (c.modes.find((m) => m.modeId === c.defaultModeId) || {}).name, variables: c.variableIds.length });

// Follow an alias to a concrete value. The target may live in another collection: match the mode by
// NAME there, else take that collection's default mode. Depth-capped; a loop is reported, not followed.
const resolve = (value, modeId, modeName, depth) => {
  if (depth > 8) return { error: 'alias chain deeper than 8' };
  if (value && value.type === 'VARIABLE_ALIAS') {
    const target = varById.get(value.id);
    if (!target) return { error: `alias to a variable not in this file (${value.id})` };
    const tc = collById.get(target.variableCollectionId);
    let mid = modeId;
    if (!tc || !(mid in target.valuesByMode)) {
      const byName = tc && tc.modes.find((m) => m.name === modeName);
      mid = byName ? byName.modeId : (tc ? tc.defaultModeId : Object.keys(target.valuesByMode)[0]);
    }
    const r = resolve(target.valuesByMode[mid], mid, modeName, depth + 1);
    if (!r.error && !r.aliasOf) r.aliasOf = target.name;
    return r;
  }
  if (value && typeof value === 'object' && 'color' in value) { // VariableComposedColor
    const col = resolve(value.color, modeId, modeName, depth + 1);
    if (col.error) return col;
    const op = typeof value.opacity === 'number' ? { value: value.opacity } : resolve(value.opacity, modeId, modeName, depth + 1);
    if (op.error) return op;
    return { value: { r: col.value.r, g: col.value.g, b: col.value.b, a: typeof op.value === 'number' ? op.value : 1 }, aliasOf: col.aliasOf };
  }
  return { value };
};

for (const v of variables) {
  const c = collById.get(v.variableCollectionId);
  if (!c) { note(`"${v.name}": its collection is not local — skipped`); tally('skipped'); continue; }
  const multi = c.modes.length > 1;
  let modes = c.modes;
  if (v.resolvedType !== 'COLOR') {
    const pick = NUMBER_MODE ? c.modes.find((m) => m.name === NUMBER_MODE) : null;
    if (NUMBER_MODE && !pick && multi) note(`"${c.name}": no mode named "${NUMBER_MODE}" — default mode used for its numbers and strings`);
    modes = [pick || c.modes.find((m) => m.modeId === c.defaultModeId) || c.modes[0]];
  }
  for (const m of modes) {
    const name = multi && v.resolvedType === 'COLOR' ? `${m.name}/${v.name}` : v.name;
    const r = resolve(v.valuesByMode[m.modeId], m.modeId, m.name, 0);
    if (r.error) { note(`"${name}": ${r.error} — skipped`); tally('skipped'); continue; }
    const val = r.value;
    if (v.resolvedType === 'COLOR' && val && typeof val === 'object' && 'r' in val) { put(name, hex(val), v.scopes); tally('colors'); }
    else if (v.resolvedType === 'FLOAT' && typeof val === 'number') { put(name, val, v.scopes); tally('numbers'); }
    else if (v.resolvedType === 'STRING' && typeof val === 'string') { put(name, val, v.scopes); tally('strings'); }
    else { note(`"${name}": ${v.resolvedType} value not written (${v.resolvedType === 'BOOLEAN' ? 'booleans carry no token' : 'no lock shape for it'})`); tally('skipped'); }
    if (r.aliasOf) tally('aliases');
  }
  if (v.hiddenFromPublishing) tally('hiddenFromPublishing');
}

// --- 2. text styles: a Font(...) composite with the units inline ----------------------------------
const textStyles = await figma.getLocalTextStylesAsync();
for (const s of textStyles) {
  const lh = s.lineHeight;
  let lineHeight;
  if (lh && lh.unit === 'PIXELS') lineHeight = `${num(lh.value)}px`;
  else if (lh && lh.unit === 'PERCENT') lineHeight = num(lh.value / 100);
  else { lineHeight = 'auto'; note(`"${s.name}": line height is AUTO (font-defined) — the role needs a measured ratio before it can enter the lock`); tally('autoLineHeight'); }
  const ls = s.letterSpacing || { unit: 'PIXELS', value: 0 };
  const letterSpacing = ls.value === 0 ? '0' : `${num(ls.value)}${ls.unit === 'PERCENT' ? '%' : 'px'}`;
  const family = String(s.fontName.family).replace(/"/g, '\\"');
  const style = String(s.fontName.style).replace(/"/g, '\\"');
  const composite = `Font(family: "${family}", style: "${style}", size: ${num(s.fontSize)}px, weight: ${weightOf(s.fontName)}, lineHeight: ${lineHeight}, letterSpacing: ${letterSpacing})`;
  put(s.name, composite);
  out.styles.text.push({ name: s.name, family: s.fontName.family, style: s.fontName.style, sizePx: s.fontSize, lineHeightUnit: lh ? lh.unit : 'AUTO', letterSpacingUnit: ls.unit, textCase: s.textCase, remote: !!s.remote });
  tally('textStyles');
}

// --- 3. paint styles: one visible SOLID paint is a colour; anything else is a note ----------------
const paintStyles = await figma.getLocalPaintStylesAsync();
for (const s of paintStyles) {
  const paints = (s.paints || []).filter((p) => p.visible !== false);
  if (paints.length === 1 && paints[0].type === 'SOLID') {
    put(s.name, hex(paints[0].color, typeof paints[0].opacity === 'number' ? paints[0].opacity : 1));
    out.styles.paint.push({ name: s.name, kind: 'SOLID', remote: !!s.remote });
    tally('paintStyles');
  } else {
    note(`"${s.name}": paint style is ${paints.length === 0 ? 'empty' : paints.length > 1 ? `${paints.length} layers` : paints[0].type} — not a single colour, not written`);
    out.styles.paint.push({ name: s.name, kind: paints.length === 1 ? paints[0].type : `${paints.length} layers`, remote: !!s.remote });
    tally('paintStylesSkipped');
  }
}

// --- 4. effect styles: drop shadows as an Effect(...) chain ---------------------------------------
const effectStyles = await figma.getLocalEffectStylesAsync();
for (const s of effectStyles) {
  const layers = (s.effects || []).filter((e) => e.visible !== false);
  const shadows = layers.filter((e) => e.type === 'DROP_SHADOW');
  const other = layers.filter((e) => e.type !== 'DROP_SHADOW');
  if (shadows.length > 0) {
    put(s.name, shadows.map((e) => `Effect(type: DROP_SHADOW, color: ${hex(e.color)}, offset: (${num(e.offset.x)}, ${num(e.offset.y)}), radius: ${num(e.radius)}, spread: ${num(e.spread || 0)})`).join('; '));
    out.styles.effect.push({ name: s.name, layers: shadows.length, remote: !!s.remote });
    tally('effectStyles');
  }
  if (other.length > 0) { note(`"${s.name}": ${other.map((e) => e.type).join(', ')} not written (only DROP_SHADOW has a lock shape)`); tally('effectLayersSkipped'); }
}

// --- 5. libraries this file subscribes to: named, not read ---------------------------------------
try {
  const libs = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  for (const l of libs) out.libraries.push({ name: l.name, key: l.key, libraryName: l.libraryName });
  if (libs.length > 0) note(`${libs.length} library variable collection(s) are subscribed and NOT in variableDefs: capture them from the library file's own key`);
} catch (e) { note(`teamLibrary not readable here (${e && e.message ? e.message : e}) — library collections unknown`); }

out.counts.variables = variables.length;
out.counts.collections = collections.length;
return out;
