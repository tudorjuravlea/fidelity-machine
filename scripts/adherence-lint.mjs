#!/usr/bin/env node
// adherence-lint.mjs — the STATIC gate.
//
// Lints three layers, in CONTRACT.md gate order:
//   LOCK INVARIANTS   caps-enforcement · mask-budget · schema-sanity   (on the lock itself)
//   SOURCE ADHERENCE  raw-hex · css-vars · tokens-only-spacing · placeholders · em-dash ·
//                     banned-fonts · contrast · transition-all ·
//                     forbidden-substitutes                            (on --src files)
//   MICROCOPY GATE    banned-jargon · disclosure-presence · ro-diacritics · button-length ·
//                     sentence-length · color-only-status · content-lock ·
//                     signatures                                       (plan §5.7 mechanical subset)
//
// Forked from hue's validate.mjs (findings model, section runner style, contrast/luminance
// helpers, placeholder + em-dash logic), adapted to the design-lock.json SSOT.
//
// Usage:
//   node scripts/adherence-lint.mjs --lock <path/to/design-lock.json> [--src <dir>]
//   --src defaults to the lock's directory. Scanned extensions: .html .css .jsx .tsx .js
//
// Exit codes (CONTRACT.md, uniform across all scripts):
//   0 = pass (no ERROR findings; WARN/SKIP allowed)
//   1 = fidelity/lint failure — at least one ERROR; feed the findings back to the model
//   2 = setup/usage error (bad args, missing files, unparseable lock)
//
// Documented judgment calls (also flagged in the build report — do not remove silently):
//   * raw-hex: absolute white/black (#fff/#ffffff/#000/#000000) outside token scopes is a
//     WARN, not an ERROR. The golden fixture itself uses `color: #fff` for text-on-accent
//     because the lock defines no on-accent token; a strict ERROR would fail the skill's own
//     certified-good fixture. EVERY other raw hex outside :root/[data-theme] is an ERROR.
//   * em-dash: "visible text" excludes <head> (title/meta are browser chrome, not page copy)
//     in addition to <style>/<script>. Entities (&mdash; &#8212; &#x2014;) are decoded first.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = dirname(SCRIPT_DIR);

const SRC_EXTS = new Set(['.html', '.css', '.jsx', '.tsx', '.js']);
const JSY_EXTS = new Set(['.jsx', '.tsx', '.js']);
const ANCHOR_HEX = new Set(['fff', 'ffffff', '000', '000000']); // WARN-only carve-out (see header)
const BANNED_DISPLAY_FONTS = [ // hue's AI-default display list, verbatim
  'space grotesk', 'playfair display', 'fraunces', 'instrument serif',
  'dm serif display', 'dm serif text', 'dm serif', 'inter',
];
const FONT_WARN_TEXT = 'AI-default font as display face — justified only if the actual brand uses it';
const WILL_CHANGE_ALLOWED = new Set(['auto', 'transform', 'opacity', 'filter', 'clip-path',
  '-webkit-transform', '-webkit-filter']);
const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'area', 'base', 'col',
  'embed', 'source', 'track', 'wbr']);

const SECTIONS = [
  'schema-sanity', 'caps-enforcement', 'mask-budget',                                   // lock
  'raw-hex', 'css-vars', 'tokens-only-spacing', 'placeholders', 'em-dash',              // source
  'banned-fonts', 'contrast', 'transition-all', 'forbidden-substitutes',
  'banned-jargon', 'disclosure-presence', 'ro-diacritics', 'button-length',             // microcopy
  'sentence-length', 'color-only-status', 'content-lock', 'signatures', 'imagery-provenance',
];

// ---------------------------------------------------------------- findings (hue model)

const findings = [];
function add(level, section, file, detail, line) {
  findings.push({ level, section, file, detail, line });
}

// ---------------------------------------------------------------- generic helpers

const spaceFill = (s) => s.replace(/[^\n]/g, ' '); // blank text but keep line structure
const lineOf = (content, idx) => content.slice(0, Math.max(0, idx)).split('\n').length;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "#F00"/"f00" → "ff0000" (3→6, 4→8 with alpha); lowercase; invalid length/chars → null.
function normalizeHex(v) {
  const s = String(v ?? '').trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]{3,8}$/.test(s) || s.length === 5 || s.length === 7) return null;
  if (s.length === 3 || s.length === 4) return s.split('').map((c) => c + c).join('');
  return s;
}

function snippet(content, index, span = 40) { // hue's evidence snippet
  const raw = content.slice(Math.max(0, index - span / 2), index + span);
  return '"…' + raw.replace(/\s+/g, ' ').trim() + '…"';
}

function decodeEntities(s) {
  return s
    .replace(/&mdash;/gi, '—')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/gi, '&');
}

// Visible page text: strip <head> (title/meta are not page copy), <style>, <script>,
// comments, then all tags; decode entities; collapse whitespace.
function visibleHtmlText(html) {
  const s = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<title[\s\S]*?<\/title>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).replace(/\s+/g, ' ').trim().normalize('NFC');
}

const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, spaceFill);
const stripHtmlComments = (s) => s.replace(/<!--[\s\S]*?-->/g, spaceFill);
// Blank out :root / [data-theme] rule blocks — the only scopes where raw values are legal.
// Flat blocks only (token scopes carry declarations, not nested rules); a :root inside
// @media still matches because the prelude cannot cross the @media's opening brace.
const stripTokenScopes = (s) =>
  s.replace(/[^{}]*(?::root\b|\[data-theme[^\]]*\])[^{}]*\{[^{}]*\}/g, spaceFill);
const stripJsComments = (s) =>
  stripCssComments(s).replace(/(^|[^\S\n])\/\/[^\n]*/g, spaceFill); // '//' after whitespace only, so 'https://' survives

function styleBlocks(html) { // [{ css, offset }] — offset into the original file
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ css: m[1], offset: m.index + m[0].indexOf('>') + 1 });
  return out;
}

// ---------------------------------------------------------------- source walking

function walkSourceFiles(dir) {
  const out = [];
  const visit = (d) => {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      // skips .render/.report too; components-fixtures/ is GENERATED demo scaffolding
      // (build-component-fixture.mjs output) that reproduces reference chrome — the shipped
      // artifact is the library component source, which IS linted (CONTRACT §Fixtures).
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'components-fixtures') continue;
      const p = join(d, entry);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) visit(p);
      else if (SRC_EXTS.has(extname(entry)) && !entry.endsWith('.min.js')) {
        out.push({ abs: p, ext: extname(entry), content: readFileSync(p, 'utf8') });
      }
    }
  };
  visit(dir);
  return out;
}

// ================================================================ LOCK INVARIANTS

function checkSchemaSanity(lock, lockLabel) {
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const miss = (k) => add('ERROR', 'schema-sanity', lockLabel, `missing required key "${k}"`);

  for (const k of ['meta', 'tokens', 'fonts', 'screens', 'caps']) if (!(k in lock)) miss(k);

  if (isObj(lock.meta)) {
    for (const k of ['name', 'capturedAt', 'chromiumBuild']) if (!(k in lock.meta)) miss(`meta.${k}`);
  } else if ('meta' in lock) add('ERROR', 'schema-sanity', lockLabel, '"meta" must be an object');

  if (isObj(lock.tokens)) {
    if (!isObj(lock.tokens.colors)) miss('tokens.colors');
    else if (!isObj(lock.tokens.colors.light)) miss('tokens.colors.light');
  } else if ('tokens' in lock) add('ERROR', 'schema-sanity', lockLabel, '"tokens" must be an object');

  if ('fonts' in lock) {
    if (!Array.isArray(lock.fonts)) add('ERROR', 'schema-sanity', lockLabel, '"fonts" must be an array');
    else lock.fonts.forEach((f, i) => {
      for (const k of ['family', 'files', 'fontChecks']) if (!isObj(f) || !(k in f)) miss(`fonts[${i}].${k}`);
    });
  }

  if ('screens' in lock) {
    if (!Array.isArray(lock.screens)) {
      add('ERROR', 'schema-sanity', lockLabel, '"screens" must be an array');
    } else if (lock.screens.length === 0) {
      // Legal for a fresh capture (capture-figma emits screens: []) — but nothing can render yet.
      add('WARN', 'schema-sanity', lockLabel,
        '"screens" is empty — fine for a fresh capture; add screens[] before render/diff/verify can run');
    } else {
      const REQ = ['id', 'mode', 'captureWidth', 'captureHeight', 'dpr', 'colorScheme', 'url'];
      // Reference + thresholds are required UNLESS the screen is marked netNew (CONTRACT.md
      // §Content lock): net-new screens have no external reference by definition — the pixel
      // gates don't apply; content-lock/disclosures/source lint carry them.
      const REQ_REFERENCED = ['referenceImage', 'passThreshold', 'tileCeiling'];
      lock.screens.forEach((s, i) => {
        if (!isObj(s)) { add('ERROR', 'schema-sanity', lockLabel, `screens[${i}] must be an object`); return; }
        for (const k of REQ) if (!(k in s)) miss(`screens[${i}].${k}`);
        if (s.netNew !== true) for (const k of REQ_REFERENCED) if (!(k in s)) miss(`screens[${i}].${k}`);
        if ('mode' in s && !['A', 'B1', 'B2'].includes(s.mode))
          add('ERROR', 'schema-sanity', lockLabel, `screens[${i}].mode "${s.mode}" is not one of A|B1|B2`);
        if ('dpr' in s && ![1, 2].includes(s.dpr))
          add('ERROR', 'schema-sanity', lockLabel, `screens[${i}].dpr ${s.dpr} must be 1 or 2`);
        if ('colorScheme' in s && !['light', 'dark'].includes(s.colorScheme))
          add('ERROR', 'schema-sanity', lockLabel, `screens[${i}].colorScheme "${s.colorScheme}" must be light|dark`);
      });
    }
  }

  if ('caps' in lock) {
    if (!isObj(lock.caps)) add('ERROR', 'schema-sanity', lockLabel, '"caps" must be an object');
    else {
      for (const k of ['maxPassThreshold', 'maxTileCeiling', 'maxMaskedAreaPct']) if (!(k in lock.caps)) miss(`caps.${k}`);
      if (isObj(lock.caps.maxPassThreshold)) {
        for (const k of ['A', 'B1', 'B2']) if (!(k in lock.caps.maxPassThreshold)) miss(`caps.maxPassThreshold.${k}`);
      }
    }
  }
}

function checkCapsEnforcement(lock, lockLabel) {
  const caps = lock.caps;
  if (!caps || typeof caps !== 'object') {
    add('SKIP', 'caps-enforcement', lockLabel, 'caps missing/malformed — enforcement skipped (schema-sanity reports it)');
    return;
  }
  for (const s of Array.isArray(lock.screens) ? lock.screens : []) {
    if (!s || typeof s !== 'object') continue;
    const cap = caps.maxPassThreshold?.[s.mode];
    if (typeof cap === 'number' && typeof s.passThreshold === 'number' && s.passThreshold > cap) {
      add('ERROR', 'caps-enforcement', lockLabel,
        `screen "${s.id}" passThreshold ${s.passThreshold} exceeds caps.maxPassThreshold.${s.mode} = ${cap} — a stubborn screen is fixed, not waved through`);
    }
    if (typeof caps.maxTileCeiling === 'number' && typeof s.tileCeiling === 'number' && s.tileCeiling > caps.maxTileCeiling) {
      add('ERROR', 'caps-enforcement', lockLabel,
        `screen "${s.id}" tileCeiling ${s.tileCeiling} exceeds caps.maxTileCeiling = ${caps.maxTileCeiling} — a stubborn screen is fixed, not waved through`);
    }
  }
}

// CONTRACT.md §Provenance: derived token artifacts are one-way emissions of the lock's tokens.
// Re-derive every hash offline; a mismatch means a derived file was hand-edited or the lock's
// tokens drifted after derivation. Absent receipt = legacy lock, single WARN (never a failure).
function checkProvenance(lock, lockDir, lockLabel) {
  const FIX = 'Fix: re-run capture-figma --derive (or re-capture)';
  const prov = lock.meta?.provenance;
  if (!prov) {
    add('WARN', 'provenance', lockLabel,
      'lock predates the provenance chain (no meta.provenance) — re-derive to enable tamper detection on assets/tokens.css, tailwind.tokens.cjs and tokens.dtcg.json');
    return;
  }
  const sha = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex');

  const nowTokens = sha(JSON.stringify(lock.tokens));
  if (prov.lockTokensHash !== nowTokens) {
    add('ERROR', 'provenance', lockLabel,
      `lock tokens changed since derivation (receipt ${String(prov.lockTokensHash).slice(0, 19)}… vs current ${nowTokens.slice(0, 19)}…) — derived artifacts are stale. ${FIX}`);
  }

  const artifacts = prov.artifacts ?? {};
  if (Object.keys(artifacts).length === 0) {
    add('ERROR', 'provenance', lockLabel, `meta.provenance.artifacts is empty — nothing to verify. ${FIX}`);
    return;
  }
  for (const [rel, expected] of Object.entries(artifacts)) {
    const abs = resolve(lockDir, rel);
    if (!existsSync(abs)) {
      add('ERROR', 'provenance', rel, `derived artifact missing (recorded in meta.provenance). ${FIX}`);
      continue;
    }
    const actual = sha(readFileSync(abs));
    if (actual !== expected) {
      add('ERROR', 'provenance', rel,
        `hash mismatch — hand-edited or stale (expected ${String(expected).slice(0, 19)}…, got ${actual.slice(0, 19)}…). Derived artifacts are one-way: edit the lock, never this file. ${FIX}`);
    }
  }
}

function checkMaskBudget(lock, lockLabel) {
  const capPct = lock.caps?.maxMaskedAreaPct;
  for (const s of Array.isArray(lock.screens) ? lock.screens : []) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.maskedRegions)) continue;
    let area = 0;
    s.maskedRegions.forEach((m, i) => {
      const r = m?.rect;
      if (r && typeof r.width === 'number' && typeof r.height === 'number') area += r.width * r.height;
      const reason = typeof m?.reason === 'string' ? m.reason : '';
      if (reason.trim().length < 8) {
        add('ERROR', 'mask-budget', lockLabel,
          `screen "${s.id}" maskedRegions[${i}].reason "${reason}" is ${reason.trim().length} chars — every mask needs a real reason (>= 8 chars)`);
      }
    });
    const frame = (s.captureWidth || 0) * (s.captureHeight || 0);
    if (frame > 0 && typeof capPct === 'number') {
      const ratio = area / frame;
      if (ratio > capPct) {
        add('ERROR', 'mask-budget', lockLabel,
          `screen "${s.id}" masked area ${(ratio * 100).toFixed(2)}% of frame exceeds caps.maxMaskedAreaPct = ${(capPct * 100).toFixed(1)}% — masks hide evidence; shrink them or fix the dynamic content`);
      }
    }
  }
}

// ================================================================ SOURCE ADHERENCE

// Raw hex outside :root / [data-theme] token scopes. Guards skip HTML numeric
// entities (&#8212;), href/id anchors, and url(#fragment) references.
function scanHexHits(buf) {
  const hits = [];
  const re = /#([0-9a-fA-F]{3,8})(?![0-9a-zA-Z_-])/g;
  let m;
  while ((m = re.exec(buf))) {
    const before = buf.slice(Math.max(0, m.index - 10), m.index);
    if (/&$/.test(before)) continue;
    if (/(?:href|id)\s*=\s*["']?$/i.test(before)) continue;
    if (/url\(\s*["']?$/i.test(before)) continue;
    hits.push({ index: m.index, value: m[1] });
  }
  return hits;
}

function checkRawHex(files, rel) {
  for (const f of files) {
    let buf;
    if (f.ext === '.css') buf = stripTokenScopes(stripCssComments(f.content));
    else if (f.ext === '.html') buf = stripTokenScopes(stripCssComments(stripHtmlComments(f.content)));
    else buf = stripJsComments(f.content); // .js/.jsx/.tsx
    const grouped = new Map(); // value → { count, firstIdx }
    for (const h of scanHexHits(buf)) {
      const g = grouped.get(h.value.toLowerCase()) || { count: 0, firstIdx: h.index, raw: h.value };
      g.count += 1;
      grouped.set(h.value.toLowerCase(), g);
    }
    for (const [valueLc, g] of grouped) {
      const line = lineOf(buf, g.firstIdx);
      if (ANCHOR_HEX.has(valueLc)) {
        add('WARN', 'raw-hex', rel(f.abs),
          `absolute white/black #${g.raw} outside a token scope (${g.count}x) — prefer a token var; WARN-only carve-out, every other raw hex is an ERROR`, line);
      } else {
        add('ERROR', 'raw-hex', rel(f.abs),
          `raw hex #${g.raw} (${g.count}x) outside :root/[data-theme] — all colors must come from tokens.css vars`, line);
      }
    }
  }
}

function checkCssVars(files, rel, extraTokenCssPaths) {
  const defined = new Set();
  const collectDefs = (content) => {
    let m;
    const defRe = /(--[A-Za-z0-9_-]+)\s*:/g;
    while ((m = defRe.exec(content))) defined.add(m[1]);
    const propRe = /setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g;
    while ((m = propRe.exec(content))) defined.add(m[1]);
  };
  for (const f of files) collectDefs(f.content);
  for (const p of extraTokenCssPaths) {
    if (existsSync(p)) collectDefs(readFileSync(p, 'utf8'));
  }
  for (const f of files) {
    const missing = new Map(); // name → { count, firstIdx }
    let m;
    const useRe = /var\(\s*(--[A-Za-z0-9_-]+)/g;
    while ((m = useRe.exec(f.content))) {
      if (defined.has(m[1])) continue;
      const g = missing.get(m[1]) || { count: 0, firstIdx: m.index };
      g.count += 1;
      missing.set(m[1], g);
    }
    for (const [name, g] of missing) {
      add('ERROR', 'css-vars', rel(f.abs),
        `var(${name}) used ${g.count}x but never defined in the scanned files or assets/tokens.css`, lineOf(f.content, g.firstIdx));
    }
  }
}

// WARN-only heuristic: px values on spacing properties / spacing utility classes
// that are not on the lock's spacing scale. 0 is always allowed.
function checkSpacing(files, rel, scale) {
  if (!Array.isArray(scale) || scale.length === 0) {
    add('SKIP', 'tokens-only-spacing', '(lock)', 'lock has no tokens.spacing scale — spacing-scale check skipped');
    return;
  }
  const onScale = (n) => n === 0 || scale.includes(n);
  const PROP_RE = /(?<![\w-])(margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?|gap|row-gap|column-gap|inset(?:-[a-z-]+)?|top|right|bottom|left)\s*:\s*([^;{}]+)/gi;
  const TW_RE = /^-?(?:(?:m|p)[trblxyse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left)-\[(\d+(?:\.\d+)?)px\]$/;

  for (const f of files) {
    const seen = new Set(); // dedupe per file+px
    const report = (n, where, absIdx) => {
      const key = `${n}`;
      if (seen.has(key)) return;
      seen.add(key);
      add('WARN', 'tokens-only-spacing', rel(f.abs),
        `spacing ${n}px (${where}) is not on the lock's spacing scale [${scale.join(', ')}]`, lineOf(f.content, absIdx));
    };
    const scanDecls = (cssText, baseOffset) => {
      let m;
      PROP_RE.lastIndex = 0;
      const re = new RegExp(PROP_RE.source, 'gi');
      while ((m = re.exec(cssText))) {
        let pm;
        const pxRe = /(\d+(?:\.\d+)?)px\b/g;
        while ((pm = pxRe.exec(m[2]))) {
          const n = parseFloat(pm[1]);
          if (!onScale(n)) report(n, `${m[1]}: ${m[2].trim()}`, baseOffset + m.index);
        }
      }
    };
    if (f.ext === '.css') scanDecls(stripCssComments(f.content), 0);
    if (f.ext === '.html') {
      for (const b of styleBlocks(f.content)) scanDecls(stripCssComments(b.css), b.offset);
      let m;
      const styleAttrRe = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
      while ((m = styleAttrRe.exec(f.content))) scanDecls(m[1] ?? m[2] ?? '', m.index);
    }
    // Tailwind-style arbitrary spacing values in class/className attributes
    let m;
    const classRe = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    while ((m = classRe.exec(f.content))) {
      for (const tok of (m[1] ?? m[2] ?? '').split(/\s+/)) {
        const tm = tok.match(TW_RE);
        if (tm && !onScale(parseFloat(tm[1]))) report(parseFloat(tm[1]), `class "${tok}"`, m.index);
      }
    }
  }
}

function checkPlaceholders(files, rel) { // hue's patterns; {{...}} tightened so JSX style={{...}} never matches
  const patterns = [
    { re: /\{\{\s*[A-Za-z0-9_ .|-]+\s*\}\}/, label: 'unresolved {{placeholder}}' },
    { re: /\bTODO\b/, label: 'TODO marker' },
    { re: /\bFIXME\b/, label: 'FIXME marker' },
    { re: /lorem\s+ipsum/i, label: 'lorem ipsum' },
  ];
  for (const f of files) {
    for (const { re, label } of patterns) {
      const m = f.content.match(re);
      if (!m) continue;
      const count = (f.content.match(new RegExp(re.source, re.flags.includes('i') ? 'gi' : 'g')) || []).length;
      add('ERROR', 'placeholders', rel(f.abs),
        `${label} (${count}x): ${snippet(f.content, m.index)}`, lineOf(f.content, m.index));
    }
  }
}

function checkEmDash(htmlFiles, rel) {
  for (const f of htmlFiles) {
    const count = (f.vis.match(/—/g) || []).length;
    if (count === 0) continue;
    const idx = f.vis.indexOf('—');
    const rawIdx = f.content.indexOf('—');
    add('ERROR', 'em-dash', rel(f.abs),
      `${count} em-dash(es) in visible text (hard rule: never ship em-dashes): ${snippet(f.vis, idx, 60)}`,
      rawIdx >= 0 ? lineOf(f.content, rawIdx) : undefined);
  }
}

function firstFamily(value) { // hue helper
  if (!value) return null;
  const v = String(value).trim();
  if (v.startsWith('var(')) return null;
  return v.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
}

function checkBannedFonts(lock, lockLabel, files, rel) {
  // (a) the lock's display/heading typography roles
  for (const role of ['display', 'heading']) {
    const fam = lock.tokens?.typography?.[role]?.family;
    const first = firstFamily(typeof fam === 'string' ? fam : null);
    if (first && BANNED_DISPLAY_FONTS.includes(first)) {
      add('WARN', 'banned-fonts', lockLabel, `tokens.typography.${role}.family is "${fam}" — ${FONT_WARN_TEXT}`);
    }
  }
  // (b) h1 / display-styled CSS rules in source (hue's logic, one level of var() resolution)
  for (const f of files) {
    const cssTexts = f.ext === '.css' ? [f.content]
      : f.ext === '.html' ? styleBlocks(f.content).map((b) => b.css) : [];
    if (cssTexts.length === 0) continue;
    const css = stripCssComments(cssTexts.join('\n'));
    const defs = {};
    let m;
    const defRe = /(--[\w-]+)\s*:\s*([^;}]+)[;}]/g;
    while ((m = defRe.exec(css))) defs[m[1]] = m[2].trim();
    const flagged = new Set();
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    while ((m = ruleRe.exec(css))) {
      const selector = m[1].trim();
      if (selector.startsWith('@')) continue;
      if (!/(^|[^\w-])h1([^\w-]|$)/.test(selector) && !/display/i.test(selector)) continue;
      const fontM = m[2].match(/font-family\s*:\s*([^;]+)/);
      if (!fontM) continue;
      let value = fontM[1].trim();
      const varM = value.match(/^var\(\s*(--[\w-]+)/);
      if (varM && defs[varM[1]]) value = defs[varM[1]];
      const first = firstFamily(value);
      if (first && BANNED_DISPLAY_FONTS.includes(first) && !flagged.has(first)) {
        flagged.add(first);
        add('WARN', 'banned-fonts', rel(f.abs), `"${selector}" uses "${first}" as first family — ${FONT_WARN_TEXT}`);
      }
    }
  }
}

// WCAG helpers — hue's, verbatim.
function luminance(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  c = c.slice(0, 6);
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const hexOf = (val) => {
  if (typeof val !== 'string') return null;
  const m = val.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b/);
  return m ? m[0] : null;
};

function checkContrast(lock, lockLabel) {
  const modes = lock.tokens?.colors;
  if (!modes || typeof modes !== 'object') {
    add('WARN', 'contrast', lockLabel, 'tokens.colors not found — contrast check skipped');
    return;
  }
  for (const mode of ['light', 'dark']) {
    const colors = modes[mode];
    if (!colors || typeof colors !== 'object') continue; // only modes present in the lock
    const bg = hexOf(colors.background);
    if (!bg) {
      add('WARN', 'contrast', lockLabel, `${mode}.background missing or not a resolvable hex — mode skipped`);
      continue;
    }
    const pairs = [
      { key: 'text1', min: 4.5, level: 'ERROR', label: 'body-text minimum 4.5:1' },
      { key: 'text2', min: 3.0, level: 'WARN', label: 'secondary/large-text minimum 3:1' },
    ];
    for (const { key, min, level, label } of pairs) {
      const fg = hexOf(colors[key]);
      if (!fg) {
        add('WARN', 'contrast', lockLabel, `${mode}.${key} missing or not a resolvable hex — pair skipped`);
        continue;
      }
      const r = contrastRatio(fg, bg);
      if (r < min) {
        add(level, 'contrast', lockLabel, `${mode}: ${key} ${fg} on background ${bg} = ${r.toFixed(2)}:1 — below ${label}`);
      }
    }
  }
}

function checkTransitionAll(files, rel) {
  for (const f of files) {
    const cssTexts = f.ext === '.css' ? [{ css: stripCssComments(f.content), offset: 0 }]
      : f.ext === '.html' ? styleBlocks(f.content).map((b) => ({ css: stripCssComments(b.css), offset: b.offset }))
      : [];
    for (const { css, offset } of cssTexts) {
      let m;
      const tRe = /transition(?:-property)?\s*:\s*all\b/gi;
      while ((m = tRe.exec(css))) {
        add('ERROR', 'transition-all', rel(f.abs),
          `"${m[0].replace(/\s+/g, ' ')}" — never animate 'all'; list the exact properties`, lineOf(f.content, offset + m.index));
      }
      const wRe = /will-change\s*:\s*([^;{}]+)/gi;
      while ((m = wRe.exec(css))) {
        const bad = m[1].split(',').map((v) => v.trim().toLowerCase()).filter((v) => v && !WILL_CHANGE_ALLOWED.has(v));
        if (bad.length) {
          add('ERROR', 'transition-all', rel(f.abs),
            `will-change: ${m[1].trim()} — only transform/opacity/filter/clip-path are allowed (found: ${bad.join(', ')})`,
            lineOf(f.content, offset + m.index));
        }
      }
    }
    if (JSY_EXTS.has(f.ext)) { // JSX style objects: transition: 'all …', willChange: 'left'
      let m;
      const jsT = /transition\s*:\s*['"`]?\s*all\b/g;
      while ((m = jsT.exec(f.content))) {
        add('ERROR', 'transition-all', rel(f.abs),
          `transition set to 'all' in a style object — never animate 'all'`, lineOf(f.content, m.index));
      }
      const jsW = /willChange\s*:\s*(['"`])([^'"`]+)\1/g;
      while ((m = jsW.exec(f.content))) {
        const bad = m[2].split(',').map((v) => v.trim().toLowerCase()).filter((v) => v && !WILL_CHANGE_ALLOWED.has(v));
        if (bad.length) {
          add('ERROR', 'transition-all', rel(f.abs),
            `willChange: "${m[2]}" — only transform/opacity/filter/clip-path are allowed`, lineOf(f.content, m.index));
        }
      }
    }
    // Tailwind bare `transition` (property set defaults) and `transition-all`
    let m;
    const classRe = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    const flagged = new Set();
    while ((m = classRe.exec(f.content))) {
      for (const tok of (m[1] ?? m[2] ?? '').split(/\s+/)) {
        if ((tok === 'transition' || tok === 'transition-all') && !flagged.has(tok)) {
          flagged.add(tok);
          add('ERROR', 'transition-all', rel(f.abs),
            `Tailwind "${tok}" class — use scoped transition-[colors|opacity|transform] utilities, never a blanket transition`,
            lineOf(f.content, m.index));
        }
      }
    }
  }
}

// Optional top-level lock.forbidden = { fontFamilies: [], hexColors: [] } — explicit
// adjacent-brand substitutes (the near-miss font or palette a generator reaches for when
// the real one is unavailable). Absent → silent, no finding of any level.
function checkForbiddenSubstitutes(lock, files, rel) {
  const forbidden = lock.forbidden;
  if (!forbidden || typeof forbidden !== 'object' || Array.isArray(forbidden)) return;
  const families = (Array.isArray(forbidden.fontFamilies) ? forbidden.fontFamilies : [])
    .filter((v) => typeof v === 'string' && v.trim().length > 0);
  const hexIndex = new Map(); // normalized 6/8-digit hex → value as written in the lock
  for (const h of Array.isArray(forbidden.hexColors) ? forbidden.hexColors : []) {
    const n = normalizeHex(h);
    if (n) hexIndex.set(n, String(h));
  }
  if (families.length === 0 && hexIndex.size === 0) return;
  const famMatchers = families.map((name) => ({
    name,
    // whole word, case-insensitive; internal whitespace flexible ("Space  Grotesk" still hits)
    re: new RegExp(`(?<![\\w-])${escapeRe(name.trim()).replace(/\s+/g, '\\s+')}(?![\\w-])`, 'gi'),
  }));
  for (const f of files) {
    // Comments stripped first (spaceFill keeps line numbers) — commented-out code is not a substitution.
    let buf;
    if (f.ext === '.css') buf = stripCssComments(f.content);
    else if (f.ext === '.html') buf = stripCssComments(stripHtmlComments(f.content));
    else buf = stripJsComments(f.content);
    for (const { name, re } of famMatchers) {
      re.lastIndex = 0;
      let m; let count = 0; let firstIdx = -1;
      while ((m = re.exec(buf))) { count += 1; if (firstIdx === -1) firstIdx = m.index; }
      if (count > 0) {
        add('ERROR', 'forbidden-substitutes', rel(f.abs),
          `font family "${name}" (${count}x) is a plausible adjacent-brand substitute — banned by lock.forbidden`,
          lineOf(buf, firstIdx));
      }
    }
    if (hexIndex.size > 0) {
      const grouped = new Map(); // normalized → { count, firstIdx, raw }
      let m;
      const hexRe = /#([0-9a-fA-F]{3,8})(?![0-9a-zA-Z_-])/g;
      while ((m = hexRe.exec(buf))) {
        const n = normalizeHex(m[1]);
        if (!n || !hexIndex.has(n)) continue;
        const g = grouped.get(n) ?? { count: 0, firstIdx: m.index, raw: m[0] };
        g.count += 1;
        grouped.set(n, g);
      }
      for (const [n, g] of grouped) {
        add('ERROR', 'forbidden-substitutes', rel(f.abs),
          `color ${g.raw} (${g.count}x, matches lock.forbidden.hexColors "${hexIndex.get(n)}") is a plausible adjacent-brand substitute — banned by lock.forbidden`,
          lineOf(buf, g.firstIdx));
      }
    }
  }
}

// ================================================================ MICROCOPY GATE (plan §5.7 mechanical subset)

function checkBannedJargon(lock, htmlFiles, rel) {
  const jargon = lock.content?.bannedJargon;
  if (!jargon || typeof jargon !== 'object') {
    add('SKIP', 'banned-jargon', '(lock)', 'lock has no content.bannedJargon — check skipped');
    return;
  }
  for (const [locale, entries] of Object.entries(jargon)) {
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      if (!e?.term) continue;
      const needle = e.term.normalize('NFC').toLowerCase();
      for (const f of htmlFiles) {
        const hay = f.vis.toLowerCase();
        if (!hay.includes(needle)) continue;
        const count = hay.split(needle).length - 1;
        const rawNfc = f.content.normalize('NFC');
        const rawIdx = rawNfc.toLowerCase().indexOf(needle);
        add('ERROR', 'banned-jargon', rel(f.abs),
          `banned jargon (${locale}) "${e.term}" found ${count}x — use: "${e.replacement}"`,
          rawIdx >= 0 ? lineOf(rawNfc, rawIdx) : undefined);
      }
    }
  }
}

function checkDisclosures(lock, lockDir, htmlFiles, rel) {
  const inventory = lock.content?.disclosureInventory;
  if (!Array.isArray(inventory) || inventory.length === 0) {
    add('SKIP', 'disclosure-presence', '(lock)', 'lock has no content.disclosureInventory — check skipped');
    return;
  }
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  for (const entry of inventory) {
    const screen = screens.find((s) => s?.id === entry?.flow);
    if (!screen) continue; // flow names that are not screen ids are out of static scope
    // Resolve the screen's HTML: local path relative to the lock (CONTRACT path rule).
    let vis = null;
    let where = null;
    const u = String(screen.url || '');
    let p = null;
    if (/^file:\/\//i.test(u)) { try { p = fileURLToPath(u); } catch { p = null; } }
    else if (!/^https?:\/\//i.test(u)) p = resolve(lockDir, u);
    if (p && existsSync(p)) {
      vis = visibleHtmlText(readFileSync(p, 'utf8'));
      where = p;
    } else if (htmlFiles.length > 0) { // remote/unresolvable url: search every scanned page
      vis = htmlFiles.map((f) => f.vis).join('\n');
      where = null;
    }
    if (vis === null) {
      add('WARN', 'disclosure-presence', `screen "${screen.id}"`,
        `cannot resolve the screen's HTML (url "${u}") and no .html files scanned — disclosure presence UNVERIFIED`);
      continue;
    }
    for (const must of entry.mustContain || []) {
      const needle = String(must).normalize('NFC');
      if (!vis.includes(needle)) {
        const shown = needle.length > 70 ? needle.slice(0, 70) + '…' : needle;
        add('ERROR', 'disclosure-presence', where ? rel(where) : '(all scanned html)',
          `⚠ Legal: mandatory disclosure missing: "${shown}" (flow "${entry.flow}" → screen "${screen.id}")`);
      }
    }
  }
}

function checkRoDiacritics(lock, htmlFiles, rel) {
  const locales = lock.content?.locales;
  if (!Array.isArray(locales) || !locales.includes('ro')) return; // nothing to check
  // content.diacritics === false → the target system CANNOT accept RO special characters
  // (e.g. a backend constraint); the check inverts: diacritics become the defect.
  if (lock.content?.diacritics === false) {
    for (const f of htmlFiles) {
      const m = f.vis.match(/[ăâîșțĂÂÎȘȚşţŞŢ]/g);
      if (m) add('ERROR', 'ro-diacritics', rel(f.abs),
        `${m.length}x Romanian special characters found but content.diacritics=false (target backend rejects them) — write plain-ASCII Romanian (a/i/s/t)`);
    }
    return;
  }
  for (const f of htmlFiles) {
    const counts = new Map();
    let m;
    const re = /(?<![\p{L}])(si|sa|stii|tara)(?![\p{L}])/giu;
    while ((m = re.exec(f.vis))) {
      const w = m[1].toLowerCase();
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    for (const [w, n] of counts) {
      add('WARN', 'ro-diacritics', rel(f.abs),
        `possible missing RO diacritics: bare "${w}" (${n}x) — RO copy must use full comma-below diacritics (ș/ț)`);
    }
  }
}

function checkButtonLength(htmlFiles, rel) {
  for (const f of htmlFiles) {
    const seen = new Set();
    const collect = [];
    let m;
    const btnRe = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    while ((m = btnRe.exec(f.content))) collect.push({ idx: m.index, inner: m[1] });
    const ctaRe = /<([a-zA-Z][\w-]*)\b[^>]*data-slot\s*=\s*["']cta["'][^>]*>([\s\S]*?)<\/\1>/gi;
    while ((m = ctaRe.exec(f.content))) collect.push({ idx: m.index, inner: m[2] });
    for (const { idx, inner } of collect) {
      if (seen.has(idx)) continue;
      seen.add(idx);
      const text = decodeEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().normalize('NFC');
      if (!text) continue; // icon-only control — not a length problem
      const words = text.split(/\s+/).length;
      if (words > 3 || text.length > 25) {
        add('ERROR', 'button-length', rel(f.abs),
          `button/cta text "${text}" is ${words} words / ${text.length} chars — max 3 words and 25 chars ([Verb][object], imperative)`,
          lineOf(f.content, idx));
      }
    }
  }
}

function checkSentenceLength(htmlFiles, rel) {
  for (const f of htmlFiles) {
    let reported = 0;
    for (const seg of f.vis.split(/[.!?…]+/)) {
      const words = seg.trim().split(/\s+/).filter(Boolean);
      if (words.length > 20 && reported < 5) {
        reported += 1;
        add('WARN', 'sentence-length', rel(f.abs),
          `sentence with ${words.length} words (max 20): "${words.slice(0, 8).join(' ')}…"`);
      }
    }
  }
}

function checkColorOnlyStatus(htmlFiles, rel) {
  for (const f of htmlFiles) {
    let m;
    const re = /<([a-zA-Z][\w-]*)\b[^>]*class\s*=\s*["']([^"']*(?:error|success|warning)[^"']*)["'][^>]*>([\s\S]*?)<\/\1>/gi;
    while ((m = re.exec(f.content))) {
      if (VOID_TAGS.has(m[1].toLowerCase())) continue;
      const text = decodeEntities(m[3].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (text === '') {
        add('WARN', 'color-only-status', rel(f.abs),
          `<${m[1]} class="${m[2]}"> has no text content — status must not be conveyed by color alone (icon+text required)`,
          lineOf(f.content, m.index));
      }
    }
  }
}

// Optional screens[].lockedStrings — copy that restyling must carry over verbatim, in the
// given relative order. Absent → silent, no finding of any level. The screen's source
// resolves like checkDisclosures (lock-relative url per the CONTRACT path rule, --src as
// fallback); an unresolvable source is a SKIP with reason, never a failure.
function checkContentLock(lock, lockDir, srcDir, rel) {
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  const short = (s) => (s.length > 60 ? s.slice(0, 60) + '…' : s);
  for (const screen of screens) {
    if (!screen || typeof screen !== 'object') continue;
    const locked = Array.isArray(screen.lockedStrings) ? screen.lockedStrings : null;
    if (!locked || locked.length === 0) continue;
    const u = String(screen.url || '');
    let p = null;
    if (/^file:\/\//i.test(u)) { try { p = fileURLToPath(u); } catch { p = null; } }
    else if (!/^https?:\/\//i.test(u)) {
      p = resolve(lockDir, u);
      if (!existsSync(p)) { const alt = resolve(srcDir, u); p = existsSync(alt) ? alt : p; }
    }
    if (!p || !existsSync(p)) {
      add('SKIP', 'content-lock', `screen "${screen.id}"`,
        `screen source (url "${u}") not found under --src — lockedStrings unverifiable for this screen`);
      continue;
    }
    const vis = visibleHtmlText(readFileSync(p, 'utf8'));
    let cursor = 0;
    let prev = null; // last locked string located (order anchor for pair reporting)
    for (const raw of locked) {
      const needle = String(raw).replace(/\s+/g, ' ').trim().normalize('NFC');
      if (!needle) continue;
      const anywhere = vis.indexOf(needle);
      if (anywhere === -1) {
        add('ERROR', 'content-lock', rel(p),
          `screen "${screen.id}": locked content missing — restyling must not rewrite meaning: "${short(needle)}"`);
        continue; // a missing string does not advance the order cursor
      }
      const inOrder = vis.indexOf(needle, cursor);
      if (inOrder === -1) {
        add('ERROR', 'content-lock', rel(p),
          `screen "${screen.id}": locked content out of order — "${short(needle)}" must follow "${short(prev ?? '')}" in the page but appears before it`);
        cursor = anywhere + needle.length; // resync on the actual position so later pairs still compare
      } else {
        cursor = inOrder + needle.length;
      }
      prev = needle;
    }
  }
}

function checkImageryProvenance(lock, files, rel) {
  // Only enforced when the lock declares an imagery library (lock.imagery). Every inline <svg>
  // in generated screen source must declare what it is: a captured library asset
  // (data-fig-name), a chart (data-chart), or an explicitly declared derived composition
  // (data-derived-art, Tier 2/3 of imagery.policy). Undeclared artwork = invented artwork.
  if (!lock.imagery) { add('SKIP', 'imagery-provenance', '(lock)', 'lock has no imagery section'); return; }
  const screenSource = files.filter((f) =>
    (f.ext === '.html' || f.ext === '.jsx' || f.ext === '.tsx') && !/[\\/]assets[\\/]/.test(f.path));
  for (const f of screenSource) {
    let m;
    const re = /<svg\b[^>]*>/gi;
    while ((m = re.exec(f.content))) {
      const tag = m[0];
      if (/data-fig-name\s*=|data-chart\s*=|data-derived-art\s*=/.test(tag)) continue;
      add('ERROR', 'imagery-provenance', rel(f.abs),
        `inline <svg> with no imagery declaration — add data-fig-name (captured asset), data-chart (chart), or data-derived-art (declared Tier 2/3 composition per imagery.policy)`,
        lineOf(f.content, m.index));
    }
  }
}

function checkSignatures(lock, files) {
  const signatures = Array.isArray(lock.signatures) ? lock.signatures : [];
  // Signature greps target GENERATED SCREEN SOURCE (.html/.jsx/.tsx), not derived token assets —
  // a freshly-captured project has no screens yet; that's a skip, not a failure. Enforced once
  // generation produces source.
  // .css included: library components keep signature treatments (CTA surface, radii) in
  // co-located stylesheets; screens inline theirs in .html — both are signature-bearing source.
  const screenSource = files.filter((f) =>
    (f.ext === '.html' || f.ext === '.jsx' || f.ext === '.tsx' || f.ext === '.css') &&
    !/[\\/]assets[\\/]/.test(f.path));
  if (signatures.some((s) => s?.grep) && screenSource.length === 0) {
    add('SKIP', 'signatures', '(src)',
      'no generated screen source (.html/.jsx/.tsx) under --src yet — signature greps are enforced at generation time');
    return;
  }
  for (const sig of signatures) {
    if (!sig?.grep) continue; // judgment-only signatures are the model's job, not the lint's
    // Conditional signatures: `when` is a precondition regex — the grep is enforced only in
    // files that match it (chart rules apply only to screens containing charts). No matching
    // files → the signature is out of scope for this project state, not violated.
    let scope = screenSource;
    if (sig.when) {
      let whenRe = null;
      try { whenRe = new RegExp(sig.when, 'm'); } catch { whenRe = null; }
      scope = screenSource.filter((f) => (whenRe ? whenRe.test(f.content) : f.content.includes(sig.when)));
      if (scope.length === 0) continue;
    }
    let re = null;
    try { re = new RegExp(sig.grep, 'm'); } catch { re = null; }
    const hit = scope.some((f) => (re ? re.test(f.content) : f.content.includes(sig.grep)));
    if (!hit) {
      add('ERROR', 'signatures', '(src)',
        `signature treatment missing: ${sig.rule} — grep /${sig.grep}/ matched nothing in ` +
        (sig.when ? `the ${scope.length} file(s) matching when:/${sig.when}/` : 'generated screen source under --src'));
    }
  }
}

// ================================================================ CLI

function usage() {
  return [
    'Usage: node scripts/adherence-lint.mjs --lock <path/to/design-lock.json> [--src <dir>]',
    '  --src defaults to the lock file\'s directory. Scans .html/.css/.jsx/.tsx/.js.',
    '  Exit: 0 pass · 1 fidelity/lint failure (>=1 ERROR) · 2 setup/usage error',
  ].join('\n');
}

function die2(msg) {
  console.error(`adherence-lint: ${msg}`);
  console.error('exit 2 (setup/usage error)');
  console.error(usage());
  process.exit(2);
}

function parseArgs(argv) {
  const args = { lock: null, src: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lock') args.lock = argv[++i];
    else if (a.startsWith('--lock=')) args.lock = a.slice('--lock='.length);
    else if (a === '--src') args.src = argv[++i];
    else if (a.startsWith('--src=')) args.src = a.slice('--src='.length);
    else if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
    else die2(`unknown argument "${a}"`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.lock) die2('--lock is required');
  const lockPath = resolve(args.lock);
  if (!existsSync(lockPath) || !statSync(lockPath).isFile()) die2(`lock not found: ${lockPath}`);
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch (e) {
    die2(`unparseable lock ${lockPath}: ${e.message}`);
  }
  if (lock === null || typeof lock !== 'object' || Array.isArray(lock)) die2(`lock ${lockPath} is not a JSON object`);

  const lockDir = dirname(lockPath);
  const srcDir = resolve(args.src ?? lockDir);
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) die2(`--src is not a directory: ${srcDir}`);

  const lockLabel = basename(lockPath);
  const rel = (abs) => {
    const r = relative(srcDir, abs);
    return r && !r.startsWith('..') ? r : abs;
  };

  const files = walkSourceFiles(srcDir);
  const htmlFiles = files
    .filter((f) => f.ext === '.html')
    .map((f) => ({ ...f, vis: visibleHtmlText(f.content) }));
  if (files.length === 0) {
    add('WARN', 'raw-hex', '(src)', `no source files found under ${srcDir} — source-adherence and microcopy sections had nothing to scan`);
  }

  // ---- LOCK INVARIANTS
  checkSchemaSanity(lock, lockLabel);
  checkCapsEnforcement(lock, lockLabel);
  checkMaskBudget(lock, lockLabel);
  checkProvenance(lock, lockDir, lockLabel);

  // ---- SOURCE ADHERENCE
  checkRawHex(files, rel);
  checkCssVars(files, rel, [join(SKILL_ROOT, 'assets', 'tokens.css'), join(lockDir, 'assets', 'tokens.css')]);
  checkSpacing(files, rel, lock.tokens?.spacing);
  checkPlaceholders(files, rel);
  checkEmDash(htmlFiles, rel);
  checkBannedFonts(lock, lockLabel, files, rel);
  checkContrast(lock, lockLabel);
  checkTransitionAll(files, rel);
  checkForbiddenSubstitutes(lock, files, rel);

  // ---- MICROCOPY GATE
  checkBannedJargon(lock, htmlFiles, rel);
  checkDisclosures(lock, lockDir, htmlFiles, rel);
  checkRoDiacritics(lock, htmlFiles, rel);
  checkButtonLength(htmlFiles, rel);
  checkSentenceLength(htmlFiles, rel);
  checkColorOnlyStatus(htmlFiles, rel);
  checkContentLock(lock, lockDir, srcDir, rel);
  checkSignatures(lock, files);
  checkImageryProvenance(lock, files, rel);

  // ---- report
  console.log('adherence-lint — static gate');
  console.log(`  lock: ${lockPath}`);
  console.log(`  src:  ${srcDir}  (${files.length} source file(s), ${htmlFiles.length} html)\n`);

  const order = new Map(SECTIONS.map((s, i) => [s, i]));
  findings.sort((a, b) => (order.get(a.section) ?? 99) - (order.get(b.section) ?? 99));
  for (const f of findings) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    console.log(`[${f.level}] ${f.section} — ${loc} — ${f.detail}`);
  }
  if (findings.length === 0) console.log('No findings.');

  console.log('\nSection summary:');
  for (const s of SECTIONS) {
    const e = findings.filter((f) => f.section === s && f.level === 'ERROR').length;
    const w = findings.filter((f) => f.section === s && f.level === 'WARN').length;
    const k = findings.filter((f) => f.section === s && f.level === 'SKIP').length;
    const status = e ? `${e} ERROR${w ? `, ${w} WARN` : ''}` : w ? `${w} WARN` : k ? 'skipped' : 'ok';
    console.log(`  ${s.padEnd(22)} ${status}`);
  }

  const errors = findings.filter((f) => f.level === 'ERROR').length;
  const warns = findings.filter((f) => f.level === 'WARN').length;
  const skips = findings.filter((f) => f.level === 'SKIP').length;
  if (errors > 0) {
    console.log(`\nRESULT: FAIL — ${errors} error(s), ${warns} warning(s), ${skips} skipped (exit 1: fidelity/lint failure — feed the findings back to the model)`);
    process.exit(1);
  }
  console.log(`\nRESULT: PASS — 0 error(s), ${warns} warning(s), ${skips} skipped (exit 0)`);
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(`adherence-lint crashed: ${e.stack || e}`);
  console.error('exit 2 (setup/usage error)');
  process.exit(2);
}
