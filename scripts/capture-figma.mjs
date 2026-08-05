#!/usr/bin/env node
/**
 * capture-figma.mjs — Phase-A capture transformer (CONTRACT.md §3.7).
 *
 * The Figma MCP is model-side (not callable from node). The MODEL calls
 * get_variable_defs / get_metadata / get_screenshot and writes the results into a
 * capture bundle (capture.json). This script is the DETERMINISTIC half of Phase A:
 *
 *   capture.json ──▶ design-lock.json  +  <lockdir>/assets/tokens.css
 *                                      +  <lockdir>/assets/tailwind.tokens.cjs
 *
 * Same input → same output. No fetching, no wall-clock except a defaulted
 * meta.capturedAt when the bundle omits it. Derived assets are re-emitted on every
 * run (hand-editing them is banned by CONTRACT.md — the lock is the only source).
 *
 * TOKEN-NAME MAPPING HEURISTICS (duplicated in --help; keep the two in sync):
 *   Variable names split on "/". The FIRST segment picks the family (case-insensitive):
 *     color|colors|colour|colours   → tokens.colors    Any segment equal to "light"/"dark"
 *                                                      picks the scheme (default light) and is
 *                                                      dropped; remaining segments kebab-join
 *                                                      into the semantic slot:
 *                                                      "Color/Text/Primary" → light["text-primary"].
 *                                                      Value must look like a color (#hex or
 *                                                      rgb()/hsl()/oklch()/lab()/color()); a bare
 *                                                      6/8-digit hex gets "#" prepended + warning.
 *     spacing|space|gap             → tokens.spacing   Numeric px values ("16px" or 16) collected
 *                                                      into the sorted deduplicated scale.
 *     radius|radii|corner|corners   → tokens.radii     slot = remaining segments kebab-joined,
 *                                                      value = px number.
 *     typography|type|font|fonts|text → tokens.typography
 *                                                      Path = FAMILY / ROLE / ... / PROPERTY.
 *                                                      Properties: family; size|font-size (px);
 *                                                      weight|font-weight (number or named:
 *                                                      regular=400, medium=500, semibold=600,
 *                                                      bold=700 …); line-height|leading (unitless;
 *                                                      "150%" → 1.5; px rejected+warned);
 *                                                      letter-spacing|tracking (em; "-1%" → -0.01;
 *                                                      px rejected+warned). Roles missing any of
 *                                                      family/sizePx/weight/lineHeight are DROPPED
 *                                                      with a warning (schema requires all four).
 *                                                      Roles outside the 7-name scale (display,
 *                                                      heading, subheading, body, body-sm, caption,
 *                                                      label) warn but are still emitted.
 *     elevation|shadow|shadows      → tokens.elevation slot → verbatim box-shadow string.
 *   Fallback: an unprefixed name whose VALUE looks like a color routes to colors (full path as
 *   slot). Everything else is reported as unmapped and skipped — nothing silently disappears.
 *
 * Exit codes (CONTRACT.md): 0 = ok · 2 = setup/usage error.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const DEFAULT_CHROMIUM_BUILD = 'chromium-1228'; // the build cached+verified on this machine; override via capture.chromiumBuild
const CONTRACT_DEFAULT_CAPS = {
  maxPassThreshold: { A: 0.002, B1: 0.005, B2: 0.005 },
  maxTileCeiling: 0.4,
  maxMaskedAreaPct: 0.15,
};
const SEVEN_ROLE_SCALE = new Set(['display', 'heading', 'subheading', 'body', 'body-sm', 'caption', 'label']);
const COLOR_HEX_RE = /^#[0-9a-f]{3,8}$/i;
const COLOR_FN_RE = /^(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(/i;
const BARE_HEX_RE = /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

const FAMILY_OF = new Map(Object.entries({
  color: 'color', colors: 'color', colour: 'color', colours: 'color',
  spacing: 'spacing', space: 'spacing', gap: 'spacing',
  radius: 'radius', radii: 'radius', corner: 'radius', corners: 'radius',
  typography: 'typography', type: 'typography', font: 'typography', fonts: 'typography', text: 'typography',
  elevation: 'elevation', shadow: 'elevation', shadows: 'elevation',
}));

const WEIGHT_NAMES = new Map(Object.entries({
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300,
  normal: 400, regular: 400, book: 400, medium: 500, semibold: 600, demibold: 600,
  bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
}));

const HELP = `capture-figma.mjs — Phase-A capture transformer

The Figma MCP is model-side: the MODEL calls get_variable_defs / get_metadata /
get_screenshot and writes a capture bundle. This script deterministically transforms
that bundle into the frozen SSOT + derived token assets:

  capture.json --> design-lock.json  +  <lockdir>/assets/tokens.css
                                     +  <lockdir>/assets/tailwind.tokens.cjs

Usage:
  node scripts/capture-figma.mjs --input <capture.json> --out <design-lock.json> [--merge]

Flags:
  --input <path>  Capture bundle written by the model after the Figma MCP calls. Required.
  --out <path>    Lock to emit. Refuses to overwrite an existing lock without --merge (exit 2).
  --lock <path>   Alias of --out (invocation uniformity with the other scripts).
  --merge         Deep-merge derived fields into the existing lock at --out. NEVER overwrites
                  the existing screens[] or caps: existing screens pass through byte-identical
                  (captured screens are appended only when their id is new) and caps are kept
                  untouched. meta/tokens/fonts update from the capture; componentMap, content,
                  signatures and donts are preserved.
  --derive        Re-emit derived token assets + provenance receipt from an EXISTING lock at
                  --lock/--out (no capture bundle; mutually exclusive with --input/--merge).
                  Besides the token artifacts, every EXISTING file referenced by fonts[].files
                  and screens[].referenceImage is sha256-fingerprinted into
                  meta.provenance.artifacts (lock-relative paths; missing files skipped
                  silently) so the adherence-lint provenance gate covers them too.
  --help          This text.

Expected capture.json shape (only "variableDefs" is required):
{
  "name": "acme-banking",                  // -> meta.name          (default "captured-system")
  "figmaProject": "https://figma.com/...", // -> meta.figmaProject  (optional)
  "figmaFiles": [{ "fileKey": "K", "nodeIds": ["1:2"], "role": "tokens" }],
  "capturedAt": "2026-07-21",              // -> meta.capturedAt    (default: today)
  "chromiumBuild": "chromium-1228",        // -> meta.chromiumBuild (default "${DEFAULT_CHROMIUM_BUILD}", noted)
  "variableDefs": {                        // Figma get_variable_defs, flat name -> value
    "color/light/background": "#F7F6F3",
    "color/dark/background": "#171613",
    "spacing/md": "16",
    "radius/control": "8",
    "typography/heading/family": "Helvetica Neue",
    "typography/heading/size": "26px",
    "typography/heading/weight": "bold",
    "typography/heading/line-height": "1.2",
    "elevation/raised": "0 0 0 1px rgba(0,0,0,0.06)"
  },
  "metadata": [                            // Figma get_metadata: ground-truth node rects
    { "figmaNodeId": "1:100", "name": "Header",
      "rect": { "x": 24, "y": 32, "width": 672, "height": 64 } }
    // flat { "id": "1:100", "x": .., "y": .., "width": .., "height": .. } also accepted
  ],
  "screens": [ /* lock-shaped screen objects (see design-lock.schema.json). Each needs at
                  least an "id". figIds[] entries missing "rect" are enriched from
                  metadata[] by figma node id ("1-100" and "1:100" are equivalent). */ ],
  "fonts":   [ /* lock-shaped fonts passthrough — bundle files[] + fontChecks[] before
                  rendering: render.mjs hard-fails (exit 4) without font parity. */ ]
}

Token-name mapping heuristics (variableDefs name -> lock tokens):
  Names split on "/"; the FIRST segment picks the family (case-insensitive).
    color|colors|colour(s)      -> tokens.colors     a "light"/"dark" segment picks the scheme
                                                     (default light) and is dropped; remaining
                                                     segments kebab-join into the semantic slot:
                                                     "Color/Text/Primary" -> light["text-primary"].
                                                     Value must look like a color (#hex, rgb()/
                                                     hsl()/oklch()/lab()/color()); bare 6/8-digit
                                                     hex gets "#" prepended with a warning.
    spacing|space|gap           -> tokens.spacing    numeric px values collected into the sorted,
                                                     deduplicated scale ("16px" and 16 both fine).
    radius|radii|corner(s)      -> tokens.radii      slot = remaining segments kebab-joined,
                                                     value = px number.
    typography|type|font(s)|text -> tokens.typography  path = FAMILY/ROLE/.../PROPERTY.
                                                     family; size|font-size (px); weight|
                                                     font-weight (number or named: regular=400,
                                                     medium=500, semibold=600, bold=700, ...);
                                                     line-height|leading (unitless, "150%" -> 1.5,
                                                     px rejected); letter-spacing|tracking (em,
                                                     "-1%" -> -0.01, px rejected). Roles missing
                                                     any of family/size/weight/line-height are
                                                     dropped with a warning; roles outside the
                                                     7-name scale (display heading subheading
                                                     body body-sm caption label) warn but emit.
    elevation|shadow(s)         -> tokens.elevation  slot -> verbatim box-shadow string.
  Fallback: any other name whose VALUE looks like a color routes to colors (full path as slot);
  everything else is reported as unmapped and skipped — nothing is silently dropped.

Derived outputs (hand-editing banned — re-run this script instead):
  assets/tokens.css           :root { --<colorSlot>, --space-<px/4> (or --space-<px>px when not
                              on the 4pt grid), --radius-<slot>, --font-<role>-{family,size,
                              weight,line-height,letter-spacing}, --shadow-<slot> } plus a
                              [data-theme="dark"] block overriding the color slots.
  assets/tailwind.tokens.cjs  module.exports = { colors, spacing, borderRadius, fontFamily },
                              every value referencing the CSS vars above.
  Both are written into "assets/" NEXT TO the emitted lock (per-project artifacts live next to
  the project's design-lock.json — CONTRACT.md). With --out at the skill root this is exactly
  the skill's assets/tokens.css.

Fresh-lock defaults: componentMap {}, fonts [] (warned — render.mjs needs fontChecks), caps =
contract defaults { maxPassThreshold A 0.002 / B1 0.005 / B2 0.005, maxTileCeiling 0.4,
maxMaskedAreaPct 0.15 }.

Exit codes (CONTRACT.md): 0 = ok · 2 = setup/usage error (bad flags, unreadable/invalid
capture.json, existing lock without --merge, --merge with no existing lock).
`;

function fail(msg) {
  console.error(`capture-figma: ${msg} (exit 2 — setup/usage error)`);
  process.exit(2);
}

// --- small helpers ------------------------------------------------------

function kebab(s) {
  return String(s).toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parsePx(v) {
  const n = parseFloat(String(v).replace(/px\s*$/i, '').trim());
  return Number.isFinite(n) ? n : null;
}

function looksLikeColor(v) {
  return COLOR_HEX_RE.test(v) || COLOR_FN_RE.test(v);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Objects merge recursively; arrays and scalars from `patch` replace. screens/caps are handled OUTSIDE this. */
function deepMerge(base, patch) {
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) out[k] = k in out ? deepMerge(out[k], v) : v;
    return out;
  }
  return patch === undefined ? base : patch;
}

function normNodeId(id) {
  return String(id).replace(/-/g, ':'); // schema allows "1:100" and "1-100"; compare canonically
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// --- composite Figma value parsers --------------------------------------
// Real get_variable_defs output (verified against a production enterprise system) emits composite
// strings for text styles and effects:
//   "Button": Font(family: "Theme/Typography/Family/Family", style: ..., size: Theme/Typography/Size/Base, weight: 500, lineHeight: 16, letterSpacing: 0)
//   "Light/Elevation/2": Effect(type: DROP_SHADOW, color: Light/Utility/Shadow/Secondary, offset: (0, 1), radius: 1, spread: 0); Effect(...)
// Field values may be quoted strings, numbers, `(x, y)` tuples, or slash-path REFERENCES to
// other variables in the same capture — resolved here (up to 4 hops).

function splitTopLevel(s, sep) {
  const parts = []; let depth = 0; let quote = null; let cur = '';
  for (const ch of s) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function parseCompositeFields(inner) {
  const fields = {};
  for (const part of splitTopLevel(inner, ',')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const key = part.slice(0, i).trim().toLowerCase().replace(/[\s_-]/g, '');
    fields[key] = part.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return fields;
}

function resolveRef(value, variableDefs, warn, name, depth = 0) {
  const v = String(value ?? '').trim();
  if (depth > 4) { warn(`"${name}": reference chain deeper than 4 hops at "${v}" — using verbatim`); return v; }
  if (v.includes('/') && v in variableDefs) {
    return resolveRef(variableDefs[v], variableDefs, warn, name, depth + 1);
  }
  return v;
}

/** `Font(...)` composite -> a typography spec {family, sizePx, weight, lineHeight, letterSpacingEm} or null. */
function parseFontComposite(name, value, variableDefs, warn) {
  const m = /^Font\((.*)\)$/s.exec(value.trim());
  if (!m) return null;
  const f = parseCompositeFields(m[1]);
  const family = resolveRef(f.family, variableDefs, warn, name).replace(/^["']|["']$/g, '');
  const sizePx = parsePx(resolveRef(f.size, variableDefs, warn, name));
  const weightRaw = resolveRef(f.weight, variableDefs, warn, name);
  const weight = /^\d+$/.test(weightRaw) ? parseInt(weightRaw, 10) : (WEIGHT_NAMES.get(String(weightRaw).toLowerCase().replace(/[\s_-]/g, '')) ?? null);
  const lhRaw = parseFloat(resolveRef(f.lineheight, variableDefs, warn, name));
  if (!family || sizePx === null || weight === null || !Number.isFinite(lhRaw)) {
    warn(`"${name}": Font(...) composite missing/unresolvable family, size, weight or lineHeight — skipped`);
    return null;
  }
  // Figma lineHeight: values > 4 are px (convert to unitless ratio); <= 4 are already ratios.
  const lineHeight = lhRaw > 4 ? Math.round((lhRaw / sizePx) * 1000) / 1000 : lhRaw;
  const spec = { family, sizePx, weight, lineHeight };
  const lsRaw = parseFloat(resolveRef(f.letterspacing, variableDefs, warn, name));
  // Figma letterSpacing here is px; convert to em against the size.
  if (Number.isFinite(lsRaw) && lsRaw !== 0) spec.letterSpacingEm = Math.round((lsRaw / sizePx) * 10000) / 10000;
  return spec;
}

/** `Effect(...); Effect(...)` chain -> a CSS box-shadow string, or null if not an effect chain. */
function parseEffectComposite(name, value, variableDefs, warn) {
  const layers = splitTopLevel(value.trim(), ';').filter((l) => l.startsWith('Effect('));
  if (layers.length === 0) return null;
  const shadows = [];
  for (const layer of layers) {
    const m = /^Effect\((.*)\)$/s.exec(layer);
    if (!m) { warn(`"${name}": malformed Effect layer "${layer.slice(0, 40)}…" — layer skipped`); continue; }
    const f = parseCompositeFields(m[1]);
    if ((f.type ?? '').toUpperCase() !== 'DROP_SHADOW') {
      warn(`"${name}": Effect type "${f.type}" unsupported (only DROP_SHADOW) — layer skipped`);
      continue;
    }
    let color = resolveRef(f.color, variableDefs, warn, name);
    if (BARE_HEX_RE.test(color)) color = `#${color}`;
    if (!looksLikeColor(color)) { warn(`"${name}": Effect color "${f.color}" did not resolve to a color — layer skipped`); continue; }
    const off = /\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)?/.exec(f.offset ?? '');
    const radius = parsePx(f.radius ?? '0') ?? 0;
    const spread = parsePx(f.spread ?? '0') ?? 0;
    if (!off) { warn(`"${name}": Effect offset "${f.offset}" unparseable — layer skipped`); continue; }
    shadows.push(`${off[1]}px ${off[2]}px ${radius}px ${spread}px ${color}`);
  }
  return shadows.length > 0 ? shadows.join(', ') : null;
}

/** Derive fonts[] (schema shape) from the emitted typography roles — files[] left for the user to fill. */
function deriveFonts(typography, warn) {
  const families = new Map();
  for (const spec of Object.values(typography)) {
    const f = families.get(spec.family) ?? { weights: new Set(), checks: new Set() };
    f.weights.add(spec.weight);
    f.checks.add(`${spec.weight} ${spec.sizePx}px "${spec.family}"`);
    families.set(spec.family, f);
  }
  const fonts = [...families.entries()].map(([family, f]) => ({
    family,
    files: [],
    weights: [...f.weights].sort((a, b) => a - b),
    fontChecks: [...f.checks].slice(0, 4),
  }));
  if (fonts.length > 0) {
    warn(`fonts[] derived from typography (${fonts.map((f) => `"${f.family}"`).join(', ')}) — files[] is EMPTY: ` +
      'bundle the woff2 paths before rendering, or ensure the family is installed (render.mjs metric-probes absent families and exits 4)');
  }
  return fonts;
}

/** Legacy illustration/ramp variables (e.g. "light-theme/yellow/base/tone 03") — reference data, not semantic tokens. */
function isReferenceRamp(name) {
  return /^[a-z][\w ]*theme\b/.test(name) || /\btone \d/i.test(name) || /^flag overlay\b/i.test(name);
}

// --- token derivation ---------------------------------------------------

function deriveTokens(variableDefs, warn) {
  const light = {}; const dark = {};
  const spacing = new Set();
  const radii = {};
  const typoRoles = {}; // role -> partial spec
  const elevation = {};
  let unmapped = 0;
  let referenceRamps = 0;

  const putColor = (schemeSegs, slotSegs, rawValue, name) => {
    let value = rawValue;
    if (!looksLikeColor(value)) {
      if (BARE_HEX_RE.test(value)) { value = `#${value}`; warn(`"${name}": bare hex "${rawValue}" — prepended "#"`); }
      else { warn(`"${name}": value "${rawValue}" does not look like a color — skipped`); return; }
    }
    const scheme = schemeSegs.includes('dark') ? 'dark' : 'light';
    const slot = kebab(slotSegs.join('-'));
    if (!slot) { warn(`"${name}": no slot name left after scheme/family segments — skipped`); return; }
    const target = scheme === 'dark' ? dark : light;
    if (slot in target && target[slot] !== value) warn(`"${name}": ${scheme}.${slot} redefined (was ${target[slot]}, now ${value}) — last one wins`);
    target[slot] = value;
  };

  for (const [rawName, rawValue] of Object.entries(variableDefs)) {
    const name = String(rawName).trim();
    const value = typeof rawValue === 'number' ? String(rawValue) : String(rawValue ?? '').trim();
    if (!name || !value) { warn(`"${rawName}": empty name or value — skipped`); unmapped++; continue; }

    const segs = name.split('/').map((s) => s.trim()).filter(Boolean);
    const family = FAMILY_OF.get(segs[0]?.toLowerCase());
    const rest = segs.slice(1);

    if (family === 'color') {
      const schemeSegs = rest.filter((s) => /^(light|dark)$/i.test(s)).map((s) => s.toLowerCase());
      const slotSegs = rest.filter((s) => !/^(light|dark)$/i.test(s));
      putColor(schemeSegs, slotSegs, value, name);
    } else if (family === 'spacing') {
      const n = parsePx(value);
      if (n === null) { warn(`"${name}": non-numeric spacing value "${value}" — skipped`); unmapped++; }
      else spacing.add(n);
    } else if (family === 'radius') {
      const slot = kebab(rest.join('-'));
      const n = parsePx(value);
      if (!slot || n === null) { warn(`"${name}": needs a slot and a numeric px value — skipped`); unmapped++; }
      else radii[slot] = n;
    } else if (family === 'typography') {
      if (rest.length < 2) {
        // e.g. "text/primary: #111" — no ROLE/PROPERTY pair; a color-looking value falls back to colors
        if (looksLikeColor(value) || BARE_HEX_RE.test(value)) {
          const schemeSegs = segs.filter((s) => /^(light|dark)$/i.test(s)).map((s) => s.toLowerCase());
          const slotSegs = segs.filter((s) => !/^(light|dark)$/i.test(s));
          warn(`"${name}": typography-family prefix but color value — routed to colors`);
          putColor(schemeSegs, slotSegs, value, name);
        } else { warn(`"${name}": typography name needs FAMILY/ROLE/PROPERTY — skipped`); unmapped++; }
        continue;
      }
      const role = kebab(rest[0]);
      const prop = rest[rest.length - 1].toLowerCase().replace(/[\s_-]/g, '');
      const spec = (typoRoles[role] ??= {});
      if (prop === 'family' || prop === 'fontfamily') {
        spec.family = value.replace(/^["']|["']$/g, '');
      } else if (prop === 'size' || prop === 'fontsize' || prop === 'sizepx') {
        const n = parsePx(value);
        if (n === null) warn(`"${name}": non-numeric size "${value}" — skipped`); else spec.sizePx = n;
      } else if (prop === 'weight' || prop === 'fontweight') {
        const named = WEIGHT_NAMES.get(value.toLowerCase().replace(/[\s_-]/g, ''));
        const n = named ?? (/^\d+$/.test(value) ? parseInt(value, 10) : null);
        if (n === null) warn(`"${name}": unrecognized weight "${value}" — skipped`); else spec.weight = n;
      } else if (prop === 'lineheight' || prop === 'leading') {
        if (/px\s*$/i.test(value)) warn(`"${name}": line-height in px not supported (schema wants unitless) — skipped`);
        else if (/%$/.test(value)) spec.lineHeight = parseFloat(value) / 100;
        else { const n = parseFloat(value); if (Number.isFinite(n)) spec.lineHeight = n; else warn(`"${name}": bad line-height "${value}" — skipped`); }
      } else if (prop === 'letterspacing' || prop === 'tracking') {
        if (/px\s*$/i.test(value)) warn(`"${name}": letter-spacing in px not supported (schema wants em; use % or em) — skipped`);
        else if (/%$/.test(value)) spec.letterSpacingEm = parseFloat(value) / 100;
        else { const n = parseFloat(String(value).replace(/em\s*$/i, '')); if (Number.isFinite(n)) spec.letterSpacingEm = n; else warn(`"${name}": bad letter-spacing "${value}" — skipped`); }
      } else {
        warn(`"${name}": unknown typography property "${rest[rest.length - 1]}" — skipped`);
        unmapped++;
      }
    } else if (family === 'elevation') {
      const slot = kebab(rest.join('-')) || 'default';
      // Real captures emit Effect(...) composites here; verbatim box-shadow strings pass through.
      elevation[slot] = value.startsWith('Effect(')
        ? (parseEffectComposite(name, value, variableDefs, warn) ?? value)
        : value;
    } else if (isReferenceRamp(name)) {
      referenceRamps++; // illustration/ramp data (e.g. "light-theme/yellow/base/tone 03") — summarized once below
    } else if (value.startsWith('Font(')) {
      // Composite text style: the variable NAME is the role (e.g. "Headline 1", "Body 2/Default", "Button").
      const spec = parseFontComposite(name, value, variableDefs, warn);
      if (spec) {
        const role = kebab(name);
        if (typoRoles[role]) warn(`"${name}": typography role "${role}" redefined by Font(...) composite — composite wins`);
        typoRoles[role] = spec;
      } else unmapped++;
    } else if (value.startsWith('Effect(')) {
      // Composite effect chain: scheme-prefixed names keep light as default, dark gets a "dark-" slot prefix.
      const shadow = parseEffectComposite(name, value, variableDefs, warn);
      if (shadow) {
        const schemeSegs = segs.filter((s) => /^(light|dark)$/i.test(s)).map((s) => s.toLowerCase());
        const slotSegs = segs.filter((s) => !/^(light|dark)$/i.test(s));
        const slot = (schemeSegs.includes('dark') ? 'dark-' : '') + (kebab(slotSegs.join('-')) || 'default');
        elevation[slot] = shadow;
      } else unmapped++;
    } else if (looksLikeColor(value)) {
      // no recognized family prefix, but the value is a color — keep the full path as the slot
      const schemeSegs = segs.filter((s) => /^(light|dark)$/i.test(s)).map((s) => s.toLowerCase());
      const slotSegs = segs.filter((s) => !/^(light|dark)$/i.test(s));
      putColor(schemeSegs, slotSegs, value, name);
    } else {
      warn(`"${name}": no family prefix matched and value is not a color — unmapped`);
      unmapped++;
    }
  }
  if (referenceRamps > 0) {
    warn(`${referenceRamps} reference-ramp variable(s) (illustration palettes like "light-theme/yellow/base/tone 03") skipped — not semantic tokens`);
  }

  // Drop typography roles missing schema-required fields; warn about off-scale role names.
  const typography = {};
  for (const [role, spec] of Object.entries(typoRoles)) {
    const missing = ['family', 'sizePx', 'weight', 'lineHeight'].filter((k) => !(k in spec));
    if (missing.length > 0) { warn(`typography role "${role}": missing ${missing.join(', ')} — role dropped (schema requires all four)`); continue; }
    if (!SEVEN_ROLE_SCALE.has(role)) warn(`typography role "${role}" is outside the 7-name scale (display|heading|subheading|body|body-sm|caption|label) — emitted anyway; the lint may flag it`);
    typography[role] = spec;
  }

  // Canonical aliasing: real systems namespace their slots (Surface/Tint/Solid/Utility — e.g.
  // e.g. "Light/Surface/Background" -> surface-background). The schema's canonical 16-token
  // names (background, text1, accent…) are what the contrast check and downstream scripts
  // target — alias them from well-known namespaced patterns, only where the canonical slot
  // isn't already present. Aliases share the same value; both names are emitted.
  const CANONICAL_ALIASES = [
    ['background', ['surface-background']],
    ['surface1', ['surface-baseline']],
    ['surface2', ['surface-foreground']],
    ['text1', ['tint-primary']],
    ['text2', ['tint-secondary']],
    ['text3', ['tint-tertiary']],
    ['accent', ['surface-accent']],
    ['border', ['utility-border-regular-primary', 'border-regular-primary']],
    ['error', ['solid-danger']],
    ['success', ['solid-success']],
    ['warning', ['solid-warning']],
    ['error-bg', ['surface-danger']],
    ['success-bg', ['surface-success']],
    ['warning-bg', ['surface-warning']],
  ];
  for (const scheme of [light, dark]) {
    const applied = [];
    for (const [canonical, sources] of CANONICAL_ALIASES) {
      if (canonical in scheme) continue;
      const src = sources.find((s) => s in scheme);
      if (src) { scheme[canonical] = scheme[src]; applied.push(`${canonical}←${src}`); }
    }
    if (applied.length > 0) {
      warn(`canonical aliases derived for ${scheme === dark ? 'dark' : 'light'}: ${applied.join(', ')}`);
    }
  }

  const tokens = { colors: { light } };
  if (Object.keys(dark).length > 0) tokens.colors.dark = dark;
  if (Object.keys(light).length === 0) warn('no light-scheme colors derived — tokens.colors.light is empty (schema-valid but almost certainly wrong)');
  if (spacing.size > 0) tokens.spacing = [...spacing].sort((a, b) => a - b);
  if (Object.keys(radii).length > 0) tokens.radii = radii;
  if (Object.keys(typography).length > 0) tokens.typography = typography;
  if (Object.keys(elevation).length > 0) tokens.elevation = elevation;
  return { tokens, unmapped };
}

// --- screens enrichment -------------------------------------------------

function rectFromMetadata(m) {
  if (!isPlainObject(m)) return null;
  const r = isPlainObject(m.rect) ? m.rect : m;
  const { x, y, width, height } = r;
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}

/** Fill missing figIds[].rect from metadata ground truth (Figma get_metadata). */
function enrichScreens(screens, metadata, warn) {
  const rects = new Map();
  for (const m of metadata) {
    const id = m?.figmaNodeId ?? m?.id ?? m?.nodeId;
    const rect = rectFromMetadata(m);
    if (id && rect) rects.set(normNodeId(id), rect);
    else warn(`metadata entry ${JSON.stringify(m).slice(0, 80)}… lacks a node id or a numeric rect — ignored`);
  }
  let filled = 0;
  for (const screen of screens) {
    for (const fig of screen.figIds ?? []) {
      if (!fig.rect && fig.figmaNodeId && rects.has(normNodeId(fig.figmaNodeId))) {
        fig.rect = rects.get(normNodeId(fig.figmaNodeId));
        filled++;
      }
    }
  }
  return filled;
}

// --- derived assets -----------------------------------------------------

function spacingVarName(px) { return px % 4 === 0 ? `--space-${px / 4}` : `--space-${px}px`; }
function spacingTwKey(px) { return px % 4 === 0 ? String(px / 4) : `${px}px`; }
function quoteFamily(f) { return /^["']/.test(f) ? f : (/[^\w-]/.test(f) ? `"${f}"` : f); }

function emitTokensCss(tokens, lockName, capturedAt, lockRef) {
  const out = [];
  out.push(`/* tokens.css — DERIVED from ${lockRef} ("${lockName}", captured ${capturedAt})`);
  out.push(' * by scripts/capture-figma.mjs. HAND-EDITING BANNED (CONTRACT.md): edit the lock');
  out.push(' * (or re-capture), then re-derive. */');
  out.push(':root {');
  const light = tokens.colors?.light ?? {};
  if (Object.keys(light).length > 0) {
    out.push('  /* colors — light (semantic slots) */');
    for (const [slot, v] of Object.entries(light)) out.push(`  --${slot}: ${v};`);
  }
  if (Array.isArray(tokens.spacing) && tokens.spacing.length > 0) {
    out.push('  /* spacing scale (suffix = px/4 on the 4pt grid, else raw px) */');
    for (const px of tokens.spacing) out.push(`  ${spacingVarName(px)}: ${px}px;`);
  }
  if (tokens.radii && Object.keys(tokens.radii).length > 0) {
    out.push('  /* radii */');
    for (const [slot, v] of Object.entries(tokens.radii)) out.push(`  --radius-${slot}: ${v}px;`);
  }
  if (tokens.typography && Object.keys(tokens.typography).length > 0) {
    out.push('  /* typography roles */');
    for (const [role, spec] of Object.entries(tokens.typography)) {
      out.push(`  --font-${role}-family: ${quoteFamily(spec.family)};`);
      out.push(`  --font-${role}-size: ${spec.sizePx}px;`);
      out.push(`  --font-${role}-weight: ${spec.weight};`);
      out.push(`  --font-${role}-line-height: ${spec.lineHeight};`);
      if (spec.letterSpacingEm !== undefined) out.push(`  --font-${role}-letter-spacing: ${spec.letterSpacingEm}em;`);
    }
  }
  if (tokens.elevation && Object.keys(tokens.elevation).length > 0) {
    out.push('  /* elevation */');
    for (const [slot, v] of Object.entries(tokens.elevation)) out.push(`  --shadow-${slot}: ${v};`);
  }
  out.push('}');
  const dark = tokens.colors?.dark ?? {};
  if (Object.keys(dark).length > 0) {
    out.push('');
    out.push('[data-theme="dark"] {');
    for (const [slot, v] of Object.entries(dark)) out.push(`  --${slot}: ${v};`);
    out.push('}');
  } else {
    out.push('');
    out.push('/* no dark-scheme colors in the lock — [data-theme="dark"] block omitted */');
  }
  return out.join('\n') + '\n';
}

function emitTailwindTokens(tokens, lockName, capturedAt, lockRef) {
  const light = tokens.colors?.light ?? {};
  const dark = tokens.colors?.dark ?? {};
  const colorSlots = [...Object.keys(light), ...Object.keys(dark).filter((k) => !(k in light))];
  const tw = {
    colors: Object.fromEntries(colorSlots.map((s) => [s, `var(--${s})`])),
    spacing: Object.fromEntries((tokens.spacing ?? []).map((px) => [spacingTwKey(px), `var(${spacingVarName(px)})`])),
    borderRadius: Object.fromEntries(Object.keys(tokens.radii ?? {}).map((k) => [k, `var(--radius-${k})`])),
    fontFamily: Object.fromEntries(Object.keys(tokens.typography ?? {}).map((r) => [r, [`var(--font-${r}-family)`]])),
  };
  return [
    `/* tailwind.tokens.cjs — DERIVED from ${lockRef} ("${lockName}", captured ${capturedAt})`,
    ' * by scripts/capture-figma.mjs. HAND-EDITING BANNED (CONTRACT.md): edit the lock',
    ' * (or re-capture), then re-derive. Spread into tailwind.config theme.extend. */',
    '"use strict";',
    `module.exports = ${JSON.stringify(tw, null, 2)};`,
    '',
  ].join('\n');
}

// tokens.dtcg.json — W3C Design Tokens Community Group JSON (the portable interchange form).
// Families that map cleanly get an explicit $type; ones DTCG has no faithful type for (raw CSS
// box-shadow strings, non-cubic-bezier easings) carry $value + $description and no invented $type.
function emitDtcg(tokens, lockName, capturedAt, lockRef) {
  const dim = (px) => ({ $type: 'dimension', $value: `${px}px` });
  const out = {
    $description: `DERIVED from ${lockRef} ("${lockName}", captured ${capturedAt}) by scripts/capture-figma.mjs. HAND-EDITING BANNED (CONTRACT.md §Provenance): edit the lock (or re-capture), then re-derive.`,
  };

  const light = tokens.colors?.light ?? {};
  const dark = tokens.colors?.dark ?? {};
  if (Object.keys(light).length || Object.keys(dark).length) {
    out.color = { $type: 'color' };
    if (Object.keys(light).length) {
      out.color.light = Object.fromEntries(Object.entries(light).map(([s, v]) => [s, { $value: v }]));
    }
    if (Object.keys(dark).length) {
      out.color.dark = Object.fromEntries(Object.entries(dark).map(([s, v]) => [s, { $value: v }]));
    }
  }

  if (Array.isArray(tokens.spacing) && tokens.spacing.length) {
    out.spacing = { $type: 'dimension' };
    for (const px of tokens.spacing) out.spacing[spacingTwKey(px)] = { $value: `${px}px` };
  }

  if (tokens.radii && Object.keys(tokens.radii).length) {
    out.radius = { $type: 'dimension' };
    for (const [role, px] of Object.entries(tokens.radii)) out.radius[role] = { $value: `${px}px` };
  }

  if (tokens.typography && Object.keys(tokens.typography).length) {
    out.typography = { $type: 'typography' };
    for (const [role, spec] of Object.entries(tokens.typography)) {
      const v = {
        fontFamily: spec.family,
        fontSize: `${spec.sizePx}px`,
        fontWeight: spec.weight,
        lineHeight: spec.lineHeight,
      };
      if (typeof spec.letterSpacingEm === 'number') v.letterSpacing = `${spec.letterSpacingEm}em`;
      out.typography[role] = { $value: v };
    }
  }

  if (tokens.elevation && Object.keys(tokens.elevation).length) {
    // DTCG's shadow type wants a structured object; our locks hold exact CSS box-shadow strings
    // (often multi-layer). Emitting them verbatim is honest; inventing a parse would not be.
    out.elevation = { $description: 'Raw CSS box-shadow strings (untyped: not losslessly expressible as DTCG shadow objects).' };
    for (const [level, css] of Object.entries(tokens.elevation)) out.elevation[level] = { $value: css };
  }

  const durations = tokens.motion?.durationsMs ?? {};
  const easings = tokens.motion?.easings ?? {};
  if (Object.keys(durations).length || Object.keys(easings).length) {
    out.motion = {};
    if (Object.keys(durations).length) {
      out.motion.duration = { $type: 'duration' };
      for (const [k, ms] of Object.entries(durations)) out.motion.duration[k] = { $value: `${ms}ms` };
    }
    if (Object.keys(easings).length) {
      out.motion.easing = {};
      for (const [k, css] of Object.entries(easings)) {
        const m = /^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(String(css).trim());
        out.motion.easing[k] = m
          ? { $type: 'cubicBezier', $value: [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] }
          : { $value: css, $description: 'CSS timing-function keyword (not a cubic-bezier quadruple).' };
      }
    }
  }

  return JSON.stringify(out, null, 2) + '\n';
}

const sha256 = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex');

// Emit all three derived artifacts from a final lock and return the provenance receipt.
// Single source of truth for both the capture path and --derive (CONTRACT.md §Provenance).
function deriveAssets(lock, outPath, assetsDir) {
  mkdirSync(assetsDir, { recursive: true });
  const lockRef = path.relative(assetsDir, outPath) || path.basename(outPath);
  const name = lock.meta.name;
  const at = lock.meta.capturedAt;
  const files = {
    'tokens.css': emitTokensCss(lock.tokens, name, at, lockRef),
    'tailwind.tokens.cjs': emitTailwindTokens(lock.tokens, name, at, lockRef),
    'tokens.dtcg.json': emitDtcg(lock.tokens, name, at, lockRef),
  };
  const lockDir = path.dirname(outPath);
  const artifacts = {};
  const written = [];
  for (const [base, content] of Object.entries(files)) {
    const abs = path.join(assetsDir, base);
    writeFileSync(abs, content);
    written.push(abs);
    artifacts[path.relative(lockDir, abs)] = sha256(content);
  }
  return {
    written,
    provenance: {
      generatedAt: new Date().toISOString(),
      lockTokensHash: sha256(JSON.stringify(lock.tokens)),
      artifacts,
    },
  };
}

// --- main ---------------------------------------------------------------

function parseArgs(argv) {
  const args = { merge: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    else if (a === '--input') args.input = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--lock') args.lockAlias = argv[++i];
    else if (a === '--merge') args.merge = true;
    else if (a === '--derive') args.derive = true;
    else fail(`unknown flag "${a}" — run with --help for usage`);
  }
  if (args.lockAlias) {
    if (args.out && path.resolve(args.out) !== path.resolve(args.lockAlias)) fail('--out and --lock (alias) point at different paths — pass one');
    args.out = args.out ?? args.lockAlias;
  }
  if (args.derive) {
    if (!args.out) fail('--derive needs --lock <design-lock.json> (the existing lock to re-derive from)');
    if (args.input) fail('--derive re-emits from an existing lock — drop --input (no capture bundle needed)');
    if (args.merge) fail('--derive and --merge are mutually exclusive');
    return args;
  }
  if (!args.input) fail('--input <capture.json> is required');
  if (!args.out) fail('--out <design-lock.json> is required (or --lock as an alias)');
  return args;
}

const args = parseArgs(process.argv.slice(2));
const outPath = path.resolve(args.out);
const assetsDir = path.join(path.dirname(outPath), 'assets');

// --derive: re-emit derived artifacts + provenance receipt from an existing lock (CONTRACT.md
// §Provenance). No capture bundle involved; the lock's tokens are the only input.
if (args.derive) {
  if (!existsSync(outPath)) fail(`no lock at ${outPath} — --derive re-emits from an EXISTING lock`);
  let dLock;
  try { dLock = JSON.parse(readFileSync(outPath, 'utf8')); }
  catch (e) { fail(`could not parse ${outPath}: ${e.message}`); }
  if (!dLock?.tokens || !dLock?.meta?.name) fail(`${outPath} has no meta.name/tokens — not a design lock`);
  const { written, provenance } = deriveAssets(dLock, outPath, assetsDir);
  // --derive also fingerprints the capture-referenced binary assets (font files, reference
  // images) into the same receipt, so the provenance gate detects tampering there too.
  // Only files that exist are hashed; absent ones are skipped silently (they may not be
  // bundled yet — render.mjs owns that failure mode, not provenance).
  const lockDir = path.dirname(outPath);
  const referenced = [];
  for (const font of Array.isArray(dLock.fonts) ? dLock.fonts : []) {
    for (const f of Array.isArray(font?.files) ? font.files : []) {
      if (typeof f === 'string' && f) referenced.push(f);
    }
  }
  for (const screen of Array.isArray(dLock.screens) ? dLock.screens : []) {
    if (typeof screen?.referenceImage === 'string' && screen.referenceImage) referenced.push(screen.referenceImage);
  }
  let hashedRefs = 0;
  for (const ref of referenced) {
    if (/^(https?|file):\/\//i.test(ref)) continue; // only lock-relative local paths are hashable
    const abs = path.resolve(lockDir, ref);
    if (!existsSync(abs)) continue;
    provenance.artifacts[path.relative(lockDir, abs)] = sha256(readFileSync(abs));
    hashedRefs++;
  }
  dLock.meta.provenance = provenance;
  writeFileSync(outPath, JSON.stringify(dLock, null, 2) + '\n');
  console.log('capture-figma --derive · re-emitted token assets + provenance receipt');
  console.log(`  lock:    ${outPath} (meta.provenance updated)`);
  for (const w of written) console.log(`  assets:  ${w}`);
  console.log(`  hashed:  ${hashedRefs} referenced asset(s) (fonts[].files, screens[].referenceImage) into meta.provenance.artifacts`);
  console.log(`  tokens hash: ${provenance.lockTokensHash}`);
  process.exit(0);
}

const inputPath = path.resolve(args.input);

const warnings = [];
const warn = (msg) => warnings.push(msg);

// read + validate the capture bundle
if (!existsSync(inputPath)) fail(`capture bundle not found: ${inputPath}`);
let capture;
try {
  capture = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (err) {
  fail(`could not parse ${inputPath}: ${err.message}`);
}
if (!isPlainObject(capture)) fail('capture.json must be a JSON object');
if (!isPlainObject(capture.variableDefs)) fail('capture.json needs "variableDefs" as an object of { name: value } (see --help)');
const captureScreens = capture.screens ?? [];
const captureMetadata = capture.metadata ?? [];
if (!Array.isArray(captureScreens)) fail('"screens" must be an array of lock-shaped screen objects');
if (!Array.isArray(captureMetadata)) fail('"metadata" must be an array');
for (const s of captureScreens) {
  if (!isPlainObject(s) || typeof s.id !== 'string' || !s.id) fail('every screens[] entry needs a string "id"');
}

// derive tokens + enrich screens (deep-copied so the input stays untouched on disk semantics)
const { tokens, unmapped } = deriveTokens(capture.variableDefs, warn);
// fonts: an explicit capture.fonts wins; otherwise derive from the typography roles
// (families + weights + representative fontChecks — files[] left for the user to fill).
const effectiveFonts = (Array.isArray(capture.fonts) && capture.fonts.length > 0)
  ? capture.fonts
  : deriveFonts(tokens.typography ?? {}, warn);
const newScreens = structuredClone(captureScreens);
const filledRects = enrichScreens(newScreens, captureMetadata, warn);

const lockExists = existsSync(outPath);
let lock;
let mergeStats = null;

if (!args.merge) {
  if (lockExists) {
    fail(`lock already exists at ${outPath} — refusing to overwrite; pass --merge to deep-merge (screens[] and caps are never overwritten)`);
  }
  if (typeof capture.chromiumBuild !== 'string') {
    warn(`capture has no "chromiumBuild" — defaulted to "${DEFAULT_CHROMIUM_BUILD}"; confirm with scripts/setup-check.mjs (build mismatch invalidates noise-floor calibration)`);
  }
  if (effectiveFonts.length === 0) {
    warn('capture has no "fonts" and none derivable from typography — emitted fonts: []; bundle woff2 files + fontChecks before rendering (render.mjs exits 4 on font parity failure)');
  }
  lock = {
    meta: {
      name: typeof capture.name === 'string' ? capture.name : 'captured-system',
      ...(typeof capture.figmaProject === 'string' ? { figmaProject: capture.figmaProject } : {}),
      ...(Array.isArray(capture.figmaFiles) ? { figmaFiles: capture.figmaFiles } : {}),
      capturedAt: typeof capture.capturedAt === 'string' ? capture.capturedAt : todayISO(),
      chromiumBuild: typeof capture.chromiumBuild === 'string' ? capture.chromiumBuild : DEFAULT_CHROMIUM_BUILD,
    },
    tokens,
    componentMap: {},
    fonts: effectiveFonts,
    screens: newScreens,
    caps: structuredClone(CONTRACT_DEFAULT_CAPS),
  };
} else {
  if (!lockExists) fail(`--merge given but no existing lock at ${outPath} — drop --merge for a fresh emission`);
  let existing;
  try {
    existing = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch (err) {
    fail(`could not parse existing lock ${outPath}: ${err.message}`);
  }
  if (!isPlainObject(existing)) fail(`existing lock ${outPath} is not a JSON object`);

  // Patch carries ONLY what the capture explicitly provides (no defaults over existing values).
  const patchMeta = {};
  if (typeof capture.name === 'string') patchMeta.name = capture.name;
  if (typeof capture.figmaProject === 'string') patchMeta.figmaProject = capture.figmaProject;
  if (Array.isArray(capture.figmaFiles)) patchMeta.figmaFiles = capture.figmaFiles;
  if (typeof capture.chromiumBuild === 'string') patchMeta.chromiumBuild = capture.chromiumBuild;
  patchMeta.capturedAt = typeof capture.capturedAt === 'string' ? capture.capturedAt : todayISO();
  const patch = { meta: patchMeta, tokens };
  if (effectiveFonts.length > 0) patch.fonts = effectiveFonts;

  lock = deepMerge(existing, patch);

  // HARD GUARANTEE: existing screens[] and caps are never overwritten.
  const existingScreens = Array.isArray(existing.screens) ? existing.screens : [];
  const existingIds = new Set(existingScreens.map((s) => s?.id));
  const appended = newScreens.filter((s) => !existingIds.has(s.id));
  for (const s of newScreens) {
    if (existingIds.has(s.id)) warn(`screen "${s.id}" already in the lock — existing entry kept untouched (--merge never overwrites screens[]); remove it from the lock first to take the captured version`);
  }
  lock.screens = [...existingScreens, ...appended];
  if ('caps' in existing) lock.caps = existing.caps;
  else { lock.caps = structuredClone(CONTRACT_DEFAULT_CAPS); warn('existing lock had no caps — added the contract defaults (this is an addition, not an overwrite)'); }
  if (!Array.isArray(lock.fonts)) lock.fonts = [];
  mergeStats = { kept: existingScreens.length, appended: appended.length };
}

// write the lock + derived assets (assets are ALWAYS regenerated from the final lock)
mkdirSync(path.dirname(outPath), { recursive: true });
mkdirSync(assetsDir, { recursive: true });
// Emit derived assets first, then stamp the receipt into the lock and write it ONCE — so the
// artifact hashes and the lock that records them are always the same generation.
const derived = deriveAssets(lock, outPath, assetsDir);
lock.meta.provenance = derived.provenance;
writeFileSync(outPath, JSON.stringify(lock, null, 2) + '\n');

// --- report -------------------------------------------------------------
const t = lock.tokens;
console.log('capture-figma · derived design-lock + token assets');
console.log(`  lock:    ${outPath} (${mergeStats ? 'merged into existing' : 'fresh'})`);
console.log(
  `  tokens:  colors ${Object.keys(t.colors?.light ?? {}).length} light / ${Object.keys(t.colors?.dark ?? {}).length} dark` +
  ` · spacing ${t.spacing?.length ?? 0} · radii ${Object.keys(t.radii ?? {}).length}` +
  ` · typography ${Object.keys(t.typography ?? {}).length} role(s) · elevation ${Object.keys(t.elevation ?? {}).length}`,
);
console.log(
  mergeStats
    ? `  screens: ${lock.screens.length} total (${mergeStats.kept} kept untouched, ${mergeStats.appended} appended) · ${filledRects} figId rect(s) filled from metadata`
    : `  screens: ${lock.screens.length} written · ${filledRects} figId rect(s) filled from metadata`,
);
derived.written.forEach((p, i) => console.log(`  ${i === 0 ? 'assets: ' : '        '} ${p}`));
console.log(`  tokens hash: ${derived.provenance.lockTokensHash}`);
if (unmapped > 0) console.log(`  unmapped variableDefs entries: ${unmapped} (see warnings)`);
if (warnings.length > 0) {
  console.log(`  warnings: ${warnings.length}`);
  for (const w of warnings) console.log(`  [warn] ${w}`);
}
process.exit(0);
