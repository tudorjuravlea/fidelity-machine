#!/usr/bin/env node
// adherence-lint.mjs — the STATIC gate.
//
// Lints three layers, in CONTRACT.md gate order:
//   LOCK INVARIANTS   caps-enforcement · mask-budget · schema-sanity   (on the lock itself)
//   SOURCE ADHERENCE  raw-hex · css-vars · tokens-only-spacing · placeholders · em-dash ·
//                     banned-fonts · contrast · transition-all · a11y ·
//                     forbidden-substitutes                            (on --src files)
//   MICROCOPY GATE    banned-jargon · disclosure-presence · ro-diacritics · button-length ·
//                     sentence-length · color-only-status · content-lock (plan §5.7 mechanical subset)
//   GATE INTEGRITY    signatures · imagery-provenance · figid-coverage · provenance ·
//                     unreadable-values                                (SECTION_GROUPS is authoritative)
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
//
// Optional lock fields this file reads:
//   * lock.lint.note (string): appended to every PRINTED finding's detail as " — <note>" at
//     print time only, after add() has already recorded the finding — the findings array
//     itself stays clean for any machine consumer that reads the structured data instead of
//     the console lines. SANITIZED before printing (non-string silently ignored; Unicode
//     control/format characters — e.g. ESC, so ANSI escape sequences can't be smuggled through —
//     blanked first, then all whitespace including newlines collapsed to one space; trimmed;
//     capped at 200 chars) — a lock is an input artifact (skill-scaffold instantiates one,
//     captures come from external design systems) and must not be able to inject its own report
//     lines (e.g. a forged `RESULT: PASS …` or `[SKIP] …`) or terminal control sequences into
//     this gate's output.
//
// Machine-readable output (--json). Consumers used to regex-parse the human lines above, with
// the fix suggestion fused into the detail text. Under --json, stdout carries ONLY NDJSON, two
// line types: one {"type":"finding"} line per finding (level, section, group, file, line,
// detail, suggestion — `suggestion` is the "use this instead" text, kept out of `detail`), in
// the same SECTIONS order as the human report, then exactly one {"type":"summary"} line last
// (result, per-level counts, scanned file counts, lock/src paths, the sanitized lint note, and
// per-section counts). It is the same information as the human report, not a second verdict:
// same findings, same counts, same exit code. The lint note appears ONCE, in the summary,
// instead of being appended to every finding. --list-sections dumps the section registry with
// the levels each section can emit, read from this file's own source; --self-test proves the
// registry and the source agree and that both output forms of a golden run say the same thing.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SELF_PATH);
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

// The registry, keyed by group. The groups used to live only in trailing comments on one flat
// array; --json reports a group per finding, so they are data now. SECTIONS is derived from
// this (insertion order = report order), so the two can never drift apart.
const SECTION_GROUPS = {
  'lock': ['schema-sanity', 'caps-enforcement', 'mask-budget'],
  'source': ['raw-hex', 'css-vars', 'tokens-only-spacing', 'type-scale', 'placeholders', 'em-dash',
    'banned-fonts', 'contrast', 'transition-all', 'a11y', 'forbidden-substitutes'],
  'microcopy': ['banned-jargon', 'disclosure-presence', 'ro-diacritics', 'button-length',
    'sentence-length', 'color-only-status', 'content-lock'],
  // provenance sat outside the registry for a while: its findings sorted last and never reached
  // the Section summary. It is registered after figid-coverage so every pre-existing section
  // keeps its report position; the only change is provenance gaining a summary row.
  'gate-integrity': ['signatures', 'imagery-provenance', 'figid-coverage', 'provenance', 'unreadable-values'],
};
const SECTIONS = Object.values(SECTION_GROUPS).flat();
const SECTION_GROUP = new Map(Object.entries(SECTION_GROUPS).flatMap(([g, names]) => names.map((n) => [n, g])));

// ---------------------------------------------------------------- findings (hue model)

// `suggestion` (optional) is the "use this instead" half of a finding — a token, a scale
// value, a var name, a replacement word — computed per finding. It is stored apart from
// `detail` so a machine consumer gets it as its own field; the human line re-joins the two
// with " — ", which is exactly how the text was fused before, so printed output is unchanged.
// Static rule text that reads the same on every finding (e.g. "list the exact properties")
// is part of the diagnosis and stays in `detail`. A suggestion is advice for THIS finding, not
// always a drop-in value: raw-hex's "no lock token is close — derive it and add it to the
// lock…" names no token, but it is that slot's answer when the nearest-token search is empty.
//
// detail and suggestion are sanitized HERE, once, for every section — the same treatment
// lock.lint.note gets at print time (see the report block in main()), minus the length cap.
// Many details quote lock text verbatim (a bannedJargon term/replacement, a maskedRegions
// reason, a screen id), and a lock is an input artifact: a replacement containing
// "\nRESULT: PASS — …" printed a forged verdict line of its own, and an ESC byte could repaint
// the terminal. Control/format characters (\p{Cc}, \p{Cf}) are blanked first — ESC is not
// whitespace and would survive the collapse — then all whitespace, newlines included, collapses
// to one space. Sanitizing at the single entry point means no future section can forget to.
const cleanText = (s) => String(s).replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();

// One NDJSON record. JSON.stringify leaves U+2028, U+2029 and U+0085 raw — legal inside a JSON
// string, but Unicode-aware line splitters (Python's str.splitlines, many editors and log
// tools) break lines on them, cutting one record into two unparseable halves. Escaping them
// keeps every record on one line for ANY splitter; JSON.parse reads back the same value. Paths
// (`file`, `lock`, `src`) are not run through cleanText, so they can still carry these.
const ndjson = (obj) => JSON.stringify(obj)
  .replace(/[\u2028\u2029\u0085]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
// `file` gets a narrower treatment. Two of its labels quote lock text (`screen "<id>"` in
// disclosure-presence and content-lock), so a screen id holding "\nRESULT: PASS …" could forge
// a report line the same way a detail could. But `file` is usually a real relative path, and
// eval-correction compares it to its task paths: collapsing a double space or trimming would
// make a real path stop matching. So only the characters that can break or repaint a line are
// replaced, one for one, with a space — control and format characters (\p{Cc} covers \t \n \v
// \f \r and U+0085; \p{Cf} the invisible marks) plus the Unicode line and paragraph separators
// (\p{Zl}, \p{Zp}). Ordinary spaces and runs of them survive byte for byte.
const cleanPath = (s) => String(s).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ');
const findings = [];
function add(level, section, file, detail, line, suggestion) {
  findings.push({
    level, section, file: cleanPath(file), detail: cleanText(detail), line,
    suggestion: suggestion == null ? null : (cleanText(suggestion) || null),
  });
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

// sRGB → OKLab, for the perceptual distance references/color-science.md mandates ("OKLab for
// distances and mixing"). Matrices are Björn Ottosson's OKLab (https://bottosson.github.io/
// posts/oklab/) — sRGB→LMS, cube root, LMS'→Lab. Self-contained on purpose: the render/diff
// scripts have their own pixel-space color math, and this file has no reason to import it.
function srgbChannelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function hexToOklab(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  const [r, g, b] = [0, 2, 4].map((i) => srgbChannelToLinear(parseInt(n.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}
// Euclidean distance in OKLab ("ΔE-ok"); null when either hex is unparseable.
function oklabDistance(hexA, hexB) {
  const a = hexToOklab(hexA);
  const b = hexToOklab(hexB);
  if (!a || !b) return null;
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

// Iterative Levenshtein edit distance (no existing helper in scripts/ — checked before adding
// this) for css-vars' "did you mean" suggestion.
function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
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
// The (?<![^{}]) pin is a performance guard, not a semantic change: the prelude [^{}]*
// cannot cross a brace, so a match starting anywhere inside a brace-free run also matches
// from that run's first character — the leftmost match therefore always begins at offset 0
// or just after a brace. The pin forbids only start positions the engine could never have
// used. Without it the engine restarts the greedy prelude at every offset, which is
// O(run^2) per brace-free run and stalled 1.5 MB of markup for ~145 seconds.
const stripTokenScopes = (s) =>
  s.replace(/(?<![^{}])[^{}]*(?::root\b|\[data-theme[^\]]*\])[^{}]*\{[^{}]*\}/g, spaceFill);
const stripJsComments = (s) =>
  stripCssComments(s).replace(/(^|[^\S\n])\/\/[^\n]*/g, spaceFill); // '//' after whitespace only, so 'https://' survives

function styleBlocks(html) { // [{ css, offset }] — offset into the original file
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ css: m[1], offset: m.index + m[0].indexOf('>') + 1 });
  return out;
}

// [{ js, offset }] — inline <script> bodies only (a `src=` script has no local text to scan).
function scriptBlocks(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push({ js: m[1], offset: m.index + m[0].indexOf('>') + 1 });
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
      // dist/ holds generated distributables (standalone self-contained bundles of screens
      // that are already linted from their own sources) — same class as components-fixtures.
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'components-fixtures' || entry === 'dist') continue;
      // *.preview.html are GENERATED self-contained bundles of a screen that is already
      // linted from its own source file. Scanning them is redundant (every finding would
      // be reported twice) and pathological: the CSS/hex scanners degrade superlinearly on
      // inlined multi-hundred-KB documents, which stalled full-directory runs for minutes.
      if (entry.endsWith('.preview.html')) continue;
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

  // Optional renderer policy (render.mjs, design-lock.schema.json "render"). render.mjs refuses
  // a malformed policy with exit 2, but only when a render runs; checking it here moves that
  // refusal to the cheap gate that runs first, so a lock that asked for "offline" and misspelled
  // it is caught before anyone spends a render on it. Same rules as render.mjs's own parser.
  if ('render' in lock) {
    const r = lock.render;
    const shape = 'allowed keys: network ("observe" | "offline"), allowHosts (array of non-empty host strings)';
    if (!isObj(r)) {
      add('ERROR', 'schema-sanity', lockLabel, `"render" must be an object — ${shape}`);
    } else {
      for (const k of Object.keys(r)) {
        if (k !== 'network' && k !== 'allowHosts') add('ERROR', 'schema-sanity', lockLabel, `render has unknown key "${k}" — ${shape}`);
      }
      if ('network' in r && r.network !== 'observe' && r.network !== 'offline') {
        add('ERROR', 'schema-sanity', lockLabel, `render.network ${JSON.stringify(r.network)} is not one of the allowed values "observe", "offline"`);
      }
      if ('allowHosts' in r) {
        if (!Array.isArray(r.allowHosts)) {
          add('ERROR', 'schema-sanity', lockLabel, '"render.allowHosts" must be an array of non-empty host strings, e.g. ["fonts.example.com"]');
        } else {
          r.allowHosts.forEach((h, i) => {
            // Hostname only — render.mjs refuses a scheme, port, userinfo or whitespace in an
            // entry (it would silently never match a request's host), so the same shape is
            // refused here, before a render is spent on it.
            if (typeof h !== 'string' || !/^[^:/@\s]+$/.test(h)) {
              add('ERROR', 'schema-sanity', lockLabel, `render.allowHosts[${i}] ${JSON.stringify(h)} must be a bare hostname (no scheme, port, userinfo or whitespace), e.g. "fonts.example.com"`);
            }
          });
        }
      }
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

// Every lock color, both modes, resolved to a comparable hex. Values that aren't parseable
// hex (var(...), rgba(...), etc.) are skipped silently — the goal is a suggestion, not a
// second schema check.
function collectLockColorHexes(lock) {
  const out = []; // { name, hex, mode }
  const colors = lock?.tokens?.colors;
  if (!colors || typeof colors !== 'object') return out;
  for (const mode of ['light', 'dark']) {
    const set = colors[mode];
    if (!set || typeof set !== 'object') continue;
    for (const [name, value] of Object.entries(set)) {
      const hex = typeof value === 'string' ? normalizeHex(value) : null;
      if (hex) out.push({ name, hex, mode });
    }
  }
  return out;
}

// Two calibrated bands, not one cutoff — snapping and suggesting are different questions.
// Picked to match this engine's OWN lock, not cited from color-science.md (that file argues
// AGAINST a single global step size — grain is finer near black than white, the cool half of
// the space is coarser — so it supplies no number and none should be attributed to it).
// Sanity-checked against fixtures/golden/design-lock.json's own tokens: `background` #F7F6F3
// vs `surface1` #FFFFFF — two DIFFERENT roles the lock deliberately keeps apart — sit at
// ΔE-ok 0.0272. That distance must fall in the middle band (worth reusing, not "the same
// token"), never the snap band, or this check would tell an author two of the lock's own
// colors are one color. It does: 0.0272 > OKLAB_SAME_COLOR (0.02) and < OKLAB_NEAR_MISS (0.10).
const OKLAB_SAME_COLOR = 0.02;  // at/under this, it IS the token — round-trip/anti-aliasing noise
const OKLAB_NEAR_MISS = 0.10;   // up to this, close enough to flag for reuse before growing the lock

function nearestLockColor(hex, lockColors) {
  let best = null;
  for (const c of lockColors) {
    const d = oklabDistance(hex, c.hex);
    if (d == null) continue;
    if (!best || d < best.d) best = { ...c, d };
  }
  return best;
}

// Where checkCssVars already knows to look for a project's token stylesheet(s); named here
// instead of asserting a fixed path that may not exist (see main()'s call site).
function tokensCssDescription(extraTokenCssPaths, rel) {
  const present = (extraTokenCssPaths || []).filter((p) => existsSync(p));
  if (present.length === 0) return 'in the stylesheet that defines your tokens';
  return `in ${present.map((p) => rel(p)).join(' or ')}`;
}

function checkRawHex(lock, files, rel, tokensCssDesc) {
  const lockColors = collectLockColorHexes(lock);
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
      const nearest = lockColors.length > 0 ? nearestLockColor(g.raw, lockColors) : null;
      // All three bands are suggestions (what to do instead of this hex), including "no lock
      // token is close": it is the same slot's answer when the nearest-token search comes up
      // empty. No lock colors at all → no search ran → no suggestion.
      let suggestion = null;
      if (nearest) {
        const de = nearest.d < 1e-6 ? 'exact match' : nearest.d.toFixed(4);
        if (nearest.d <= OKLAB_SAME_COLOR) {
          suggestion = `same color — use var(--${nearest.name}) = #${nearest.hex} (mode ${nearest.mode}, ΔE-ok ${de}), ${tokensCssDesc}`;
        } else if (nearest.d <= OKLAB_NEAR_MISS) {
          suggestion = `nearest lock token var(--${nearest.name}) = #${nearest.hex} (mode ${nearest.mode}, ΔE-ok ${de}), ${tokensCssDesc} — prefer reusing it; if the design truly needs a distinct value, lock change + DECISIONS.md entry first`;
        } else {
          suggestion = 'no lock token is close — this is an off-lock value; derive it and add it to the lock plus a DECISIONS.md entry before using it';
        }
      }
      if (ANCHOR_HEX.has(valueLc)) {
        add('WARN', 'raw-hex', rel(f.abs),
          `absolute white/black #${g.raw} outside a token scope (${g.count}x) — prefer a token var; WARN-only carve-out, every other raw hex is an ERROR`, line, suggestion);
      } else {
        add('ERROR', 'raw-hex', rel(f.abs),
          `raw hex #${g.raw} (${g.count}x) outside :root/[data-theme] — all colors must come from tokens.css vars`, line, suggestion);
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
      // A fixed distance-2 budget is a rewrite for a short name (random 3-char pairs land
      // within 2 about 1 in 9 of the time). Scale the budget to the name's own length instead:
      // require distance < half the bare name's length, and for names of 3 chars or less
      // (after stripping "--") allow only an exact single-character typo (distance === 1) —
      // never a coincidence-prone 2-edit "suggestion" on a 3-letter token.
      const bareLen = name.replace(/^--/, '').length;
      let candidates = [];
      for (const cand of defined) {
        if (cand === name) continue;
        const d = editDistance(name, cand);
        if (d > 2) continue;
        if (bareLen <= 3 ? d !== 1 : !(d < bareLen / 2)) continue;
        candidates.push({ name: cand, d });
      }
      // Deterministic tie-break: lowest distance, then lexicographically smallest name — never
      // "whichever was declared first", which made the suggestion depend on file order.
      candidates.sort((a, b) => a.d - b.d || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const suggestion = candidates.length ? `did you mean var(${candidates[0].name})?` : null;
      add('ERROR', 'css-vars', rel(f.abs),
        `var(${name}) used ${g.count}x but never defined in the scanned files or assets/tokens.css`, lineOf(f.content, g.firstIdx), suggestion);
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
  // Ties round toward both neighbors, not silently down: 10px on [8,12,…] is equally close to
  // 8 and 12, and reporting only "nearest scale value: 8px" hides that 12 is an equally valid
  // fix.
  const nearestOnScale = (n) => {
    let bestDist = Infinity;
    let vals = [];
    for (const v of scale) {
      const dist = Math.abs(v - n);
      if (dist < bestDist) { bestDist = dist; vals = [v]; }
      else if (dist === bestDist) vals.push(v);
    }
    return vals.join('px or ') + 'px';
  };
  const PROP_RE = /(?<![\w-])(margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?|gap|row-gap|column-gap|inset(?:-[a-z-]+)?|top|right|bottom|left)\s*:\s*([^;{}]+)/gi;
  const TW_RE = /^-?(?:(?:m|p)[trblxyse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left)-\[(\d+(?:\.\d+)?)px\]$/;

  for (const f of files) {
    const seen = new Set(); // dedupe per file+px
    const report = (n, where, absIdx) => {
      const key = `${n}`;
      if (seen.has(key)) return;
      seen.add(key);
      // The full scale rides with the nearest value: it is the menu of legal replacements.
      add('WARN', 'tokens-only-spacing', rel(f.abs),
        `spacing ${n}px (${where}) is off the lock's spacing scale`, lineOf(f.content, absIdx),
        `nearest scale value: ${nearestOnScale(n)}; full scale [${scale.join(', ')}]`);
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

// WARN-only heuristic, same class as checkSpacing: font-size / font-weight declarations (and
// Tailwind text-[Npx] utilities) compared against the sizes/weights the lock's typography
// roles actually carry (widened with lock.fonts[*].weights — a shipped weight is legal even
// when no *role* names it, only its lookup-by-name for the "nearest role weight" hint does
// not apply to those). If the lock's roles have no numeric size field at all, there is nothing
// to compare against — SKIP, mirroring checkSpacing's empty-scale SKIP.
//
// Declarations this check cannot statically compare — rem/em/%/clamp()/var() sizes, the
// `font:` shorthand (which also carries a size this check does not parse out), and
// non-numeric font-weight values (bold/normal/lighter/bolder/var()) — are counted and
// reported per file as their own SKIP instead of passing through silently — the same
// "unchecked must never read as clean" principle checkUnreadableValues exists for. `@media`
// blocks are blanked out before scanning: the lock's typography carries no breakpoint
// dimension, so a responsive override is something this check structurally cannot judge, not
// a violation of the base scale.
function checkTypeScale(lock, files, rel) {
  const typo = lock.tokens?.typography;
  // Array-shaped typography (a malformed/legacy lock) would otherwise report the array INDEX
  // as a role name ("nearest role size: 0 16px") — treat it the same as typography being absent.
  const roleEntries = typo && typeof typo === 'object' && !Array.isArray(typo) ? Object.entries(typo) : [];
  const sizeEntries = []; // { role, size }
  const weightEntries = []; // { role, weight }
  for (const [role, spec] of roleEntries) {
    if (!spec || typeof spec !== 'object') continue;
    const size = typeof spec.sizePx === 'number' ? spec.sizePx : (typeof spec.fontSize === 'number' ? spec.fontSize : null);
    if (size != null) sizeEntries.push({ role, size });
    if (typeof spec.weight === 'number') weightEntries.push({ role, weight: spec.weight });
  }
  if (sizeEntries.length === 0) {
    add('SKIP', 'type-scale', '(lock)', 'lock typography carries no sizes — type-scale check skipped');
    return;
  }
  const sizes = sizeEntries.map((e) => e.size);
  const fontsWeights = Array.isArray(lock.fonts)
    ? lock.fonts.flatMap((f) => (Array.isArray(f?.weights) ? f.weights.filter((w) => typeof w === 'number') : []))
    : [];
  const legalWeights = new Set([...weightEntries.map((e) => e.weight), ...fontsWeights]);
  const nearestSize = (n) => sizeEntries.reduce((best, e) => (!best || Math.abs(e.size - n) < Math.abs(best.size - n) ? e : best), null);
  const nearestWeight = (n) => weightEntries.reduce((best, e) => (!best || Math.abs(e.weight - n) < Math.abs(best.weight - n) ? e : best), null);

  const TW_SIZE_RE = /^text-\[(\d+(?:\.\d+)?)px\]$/;
  const PX_ONLY_RE = /^\d+(?:\.\d+)?px$/;
  // Blanks whole @media blocks (one level of nesting) before the real scan runs on the result.
  const stripMediaBlocks = (css) => css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, spaceFill);

  for (const f of files) {
    const seenSize = new Set();
    const seenWeight = new Set();
    let unreadable = 0;
    const reportSize = (n, where, absIdx) => {
      if (sizes.includes(n) || seenSize.has(n)) return;
      seenSize.add(n);
      const near = nearestSize(n);
      add('WARN', 'type-scale', rel(f.abs),
        `font-size ${n}px (${where}) is off the lock's type scale`, lineOf(f.content, absIdx),
        `nearest role size: ${near.role} ${near.size}px`);
    };
    const reportWeight = (n, where, absIdx) => {
      if (weightEntries.length === 0 || legalWeights.has(n) || seenWeight.has(n)) return;
      seenWeight.add(n);
      const near = nearestWeight(n);
      add('WARN', 'type-scale', rel(f.abs),
        `font-weight ${n} (${where}) is off the lock's type scale`, lineOf(f.content, absIdx),
        `nearest role weight: ${near.role} ${near.weight}`);
    };
    const scanDecls = (cssTextRaw, baseOffset) => {
      const cssText = stripMediaBlocks(cssTextRaw);
      let m;
      const sizeRe = /font-size\s*:\s*(\d+(?:\.\d+)?)px\b/gi;
      while ((m = sizeRe.exec(cssText))) reportSize(parseFloat(m[1]), `font-size: ${m[1]}px`, baseOffset + m.index);
      const weightRe = /font-weight\s*:\s*(\d{3,4})\b/gi;
      while ((m = weightRe.exec(cssText))) reportWeight(parseFloat(m[1]), `font-weight: ${m[1]}`, baseOffset + m.index);
      // Every font-size declaration this check could NOT read (not a bare px number).
      const anySizeRe = /(?<![\w-])font-size\s*:\s*([^;{}]+)/gi;
      while ((m = anySizeRe.exec(cssText))) {
        if (!PX_ONLY_RE.test(m[1].trim())) unreadable += 1;
      }
      // The `font:` shorthand also carries a size this check does not parse out of it; only
      // count shorthand that has a digit somewhere (`font: inherit`/`font: menu` carry no size
      // to miss).
      const shorthandRe = /(?<![\w-])font\s*:\s*([^;{}]+)/gi;
      while ((m = shorthandRe.exec(cssText))) {
        if (/\d/.test(m[1])) unreadable += 1;
      }
      // Every font-weight declaration this check could NOT read (not a bare 3-4 digit number)
      // — a keyword (bold/normal/lighter/bolder) or var(...). Sizes are not the only dimension
      // this check can silently fail to verify; a keywords-only codebase must not read "ok" any
      // more than a rem-only one does.
      const anyWeightRe = /(?<![\w-])font-weight\s*:\s*([^;{}]+)/gi;
      while ((m = anyWeightRe.exec(cssText))) {
        if (!/^\d{3,4}$/.test(m[1].trim())) unreadable += 1;
      }
    };
    if (f.ext === '.css') scanDecls(stripCssComments(f.content), 0);
    if (f.ext === '.html') {
      for (const b of styleBlocks(f.content)) scanDecls(stripCssComments(b.css), b.offset);
      let m;
      const styleAttrRe = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
      while ((m = styleAttrRe.exec(f.content))) scanDecls(m[1] ?? m[2] ?? '', m.index);
    }
    // Tailwind-style arbitrary text size utility: text-[26px]
    let m;
    const classRe = /\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    while ((m = classRe.exec(f.content))) {
      for (const tok of (m[1] ?? m[2] ?? '').split(/\s+/)) {
        const tm = tok.match(TW_SIZE_RE);
        if (tm) reportSize(parseFloat(tm[1]), `class "${tok}"`, m.index);
      }
    }
    if (unreadable > 0) {
      const noun = unreadable === 1 ? 'declaration' : 'declarations';
      add('SKIP', 'type-scale', rel(f.abs),
        `${unreadable} font-size/font-weight ${noun} in units the static check cannot read (rem/em/%/clamp/var or \`font:\` shorthand for sizes; a keyword or var() for weights) — unchecked, not clean`);
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

// ---------------------------------------------------------------- a11y (semantic · keyboard · motion)
//
// The mechanical half of an accessibility review. Contrast is NOT here — it is its own
// section, computed on lock tokens (checkContrast). These are the WCAG failures a static
// scan can prove from source without a browser or a judgment call:
//   semantic  heading-order jumps · <img> with no alt · unlabelled field · positive tabindex ·
//             control with no accessible name
//   keyboard  interactive source with no :focus-visible rule · outline removed with no replacement
//   motion    transition/animation with no prefers-reduced-motion guard — WARN, advisory
//             only: how much movement is too much is a judgment call, so it reports and
//             lets the author decide instead of blocking a screen over a 150ms fade
//
// Everything a static scan CANNOT decide is deliberately absent: whether alt text is
// meaningful, whether focus order matches visual order, whether an error message says what
// to do. Those stay in the human pass (references/... and the KB's accessibility file).
// A green a11y section means "no mechanical defect found", never "accessible".

// Blank out non-content regions but keep byte offsets, so lineOf() stays accurate.
const blankNonContent = (html) => stripHtmlComments(html)
  .replace(/<head[\s\S]*?<\/head>/gi, spaceFill)
  .replace(/<script[\s\S]*?<\/script>/gi, spaceFill)
  .replace(/<style[\s\S]*?<\/style>/gi, spaceFill);

function tagAttr(tag, name) { // '' when present-but-empty, null when absent
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}
const hasAccessibleNameAttr = (tag) =>
  ['aria-label', 'aria-labelledby', 'title'].some((a) => (tagAttr(tag, a) ?? '').trim() !== '');

function checkA11y(files, htmlFiles, rel) {
  // CSS evidence is pooled across the scanned set: a screen may keep its focus and
  // reduced-motion rules in a sibling stylesheet rather than its own <style> block.
  const cssOf = (f) => f.ext === '.css' ? [{ css: stripCssComments(f.content), offset: 0 }]
    : f.ext === '.html' ? styleBlocks(f.content).map((b) => ({ css: stripCssComments(b.css), offset: b.offset }))
    : [];
  // Pooling is scoped, not global. A rule in a SHARED stylesheet legitimately covers every
  // screen that could link it, so .css evidence counts for all files. A rule inside ONE html
  // file's own <style> block covers only that file — pooling those made a single guard mute
  // the rule for every other screen in the directory, so a run could go from 45 warnings to 37
  // on one added guard and read as seven fixes. It also hid a screen that genuinely animates
  // under prefers-reduced-motion and had no guard at all.
  // A stylesheet only vouches for a screen that actually LINKS it. Counting every .css in
  // the scanned set was the same blindness as pooling, merely narrower: a guard appended to
  // an orphan stylesheet no screen references silenced the gate for all of them. Evidence has
  // to reach the file it excuses.
  const FOCUS_VISIBLE = /:focus-visible\b/;
  const REDUCED_MOTION = /@media[^{]*prefers-reduced-motion/i;
  const cssFiles = files.filter((f) => f.ext === '.css');
  // Memoised: cssOf re-parses the whole file, and these are called once per finding, not once
  // per file. Recomputing made a 392 KB file with many `outline: none` rules ~30x slower —
  // the same shape of bug as the regex this file just had removed.
  const ownCssMemo = new Map();
  const ownCss = (f) => {
    if (!ownCssMemo.has(f.abs)) ownCssMemo.set(f.abs, cssOf(f).map((b) => b.css).join('\n'));
    return ownCssMemo.get(f.abs);
  };
  const linkedCssMemo = new Map();
  const linkedCss = (f) => {
    if (!linkedCssMemo.has(f.abs)) {
      let text = '';
      if (f.ext !== '.css' && cssFiles.length) {
        const hrefs = [...f.content.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"'?#]+\.css)/gi)]
          .map((m) => m[1].replace(/^\.?\//, ''));
        if (hrefs.length) {
          text = cssFiles.filter((c) => hrefs.some((h) => c.abs.endsWith(h)))
            .map((c) => ownCss(c)).join('\n');
        }
      }
      linkedCssMemo.set(f.abs, text);
    }
    return linkedCssMemo.get(f.abs);
  };
  // Cache the VERDICT, not the text. These are asked once per finding, so returning a freshly
  // concatenated copy of a file's whole CSS each time is O(filesize) per finding — the same
  // trap the memo above avoids one level down.
  const verdict = (memo, re) => (f) => {
    if (!memo.has(f.abs)) memo.set(f.abs, re.test(ownCss(f)) || re.test(linkedCss(f)));
    return memo.get(f.abs);
  };
  const hasFocusVisibleFor = verdict(new Map(), FOCUS_VISIBLE);
  const hasReducedMotionGuardFor = verdict(new Map(), REDUCED_MOTION);

  // ---- keyboard: outline removed with nothing put back (any source file)
  for (const f of files) {
    for (const { css, offset } of cssOf(f)) {
      let m;
      const re = /outline\s*:\s*(none|0)(?![\w.%-])/gi;
      while ((m = re.exec(css))) {
        if (hasFocusVisibleFor(f)) continue; // replacement in a shared stylesheet, or in this file
        add('ERROR', 'a11y', rel(f.abs),
          `"outline: ${m[1]}" with no :focus-visible rule anywhere in the source — keyboard users lose the focus indicator (WCAG 2.4.7)`,
          lineOf(f.content, offset + m.index));
      }
    }
  }

  // ---- motion: advisory only, deliberately NOT blocking.
  // Every other check here is a defect with one correct fix. This one is a judgment call:
  // whether a given motion needs a reduced variant depends on how much it moves and how
  // often it fires, which source alone cannot decide. Blocking on it would stop prototypes
  // over a 150ms fade, so it reports and lets the author decide. WCAG 2.3.3 still wants the
  // variant; the gate just does not hold the screen hostage for it.
  {
    for (const f of files) {
      if (hasReducedMotionGuardFor(f)) continue;
      let reported = false;
      for (const { css, offset } of cssOf(f)) {
        let m;
        // a duration token proves it actually animates; `transition: none` does not match
        const re = /\b(transition(?:-duration)?|animation(?:-duration)?)\s*:\s*([^;{}]*?\d*\.?\d+m?s\b[^;{}]*)/gi;
        while ((m = re.exec(css)) && !reported) {
          reported = true;
          add('WARN', 'a11y', rel(f.abs),
            `something on this screen moves ("${m[1]}: ${m[2].trim().replace(/\s+/g, ' ')}") and the source has no @media (prefers-reduced-motion: reduce) block — advisory, not blocking: for full WCAG 2.3.3 compliance, offer a version with less movement`,
            lineOf(f.content, offset + m.index));
        }
      }
    }
  }

  for (const f of htmlFiles) {
    const body = blankNonContent(f.content);
    const at = (i) => lineOf(f.content, i);
    let m;

    // ---- semantic: heading order may descend freely but only ascend one level at a time
    let prevLevel = 0;
    const hRe = /<h([1-6])\b/gi;
    while ((m = hRe.exec(body))) {
      const level = Number(m[1]);
      if (prevLevel && level > prevLevel + 1) {
        add('ERROR', 'a11y', rel(f.abs),
          `heading jumps h${prevLevel} to h${level} — screen-reader users navigate by this outline, so levels cannot be skipped (WCAG 1.3.1)`, at(m.index));
      }
      prevLevel = level;
    }

    // ---- semantic: every <img> declares alt (alt="" is the legitimate decorative marker)
    const imgRe = /<img\b[^>]*>/gi;
    while ((m = imgRe.exec(body))) {
      if (tagAttr(m[0], 'alt') === null) {
        add('ERROR', 'a11y', rel(f.abs),
          `<img> has no alt attribute — use alt="…" for meaningful images or alt="" for decorative ones (WCAG 1.1.1)`, at(m.index));
      }
    }

    // ---- semantic: positive tabindex
    const tabRe = /\btabindex\s*=\s*["']?(\d+)/gi;
    while ((m = tabRe.exec(body))) {
      if (Number(m[1]) > 0) {
        add('ERROR', 'a11y', rel(f.abs),
          `tabindex="${m[1]}" — positive values reorder the whole document's tab sequence; use 0 or restructure the DOM (WCAG 2.4.3)`, at(m.index));
      }
    }

    // ---- semantic: every field carries a name
    const labelFor = new Set();
    const forRe = /<label\b[^>]*\bfor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    while ((m = forRe.exec(body))) labelFor.add((m[1] ?? m[2] ?? m[3] ?? '').trim());
    const labelSpans = [];
    const wrapRe = /<label\b[^>]*>[\s\S]*?<\/label>/gi;
    while ((m = wrapRe.exec(body))) labelSpans.push([m.index, m.index + m[0].length]);
    const wrapped = (i) => labelSpans.some(([a, b]) => i >= a && i < b);

    const SELF_NAMING = new Set(['hidden', 'submit', 'button', 'reset']);
    const fieldRe = /<(input|select|textarea)\b[^>]*>/gi;
    while ((m = fieldRe.exec(body))) {
      const tag = m[0];
      if (m[1].toLowerCase() === 'input') {
        const type = (tagAttr(tag, 'type') ?? 'text').trim().toLowerCase();
        if (SELF_NAMING.has(type)) continue; // value/content supplies the name
        if (type === 'image') { // named by alt, same rule as <img>
          if (tagAttr(tag, 'alt') === null && !hasAccessibleNameAttr(tag)) {
            add('ERROR', 'a11y', rel(f.abs),
              `<input type="image"> has no alt attribute — it is a control and needs a name (WCAG 1.1.1)`, at(m.index));
          }
          continue;
        }
      }
      const id = (tagAttr(tag, 'id') ?? '').trim();
      if ((id && labelFor.has(id)) || hasAccessibleNameAttr(tag) || wrapped(m.index)) continue;
      add('ERROR', 'a11y', rel(f.abs),
        `<${m[1].toLowerCase()}> has no label — needs <label for="…">, a wrapping <label>, or aria-label; a placeholder is not a label (WCAG 3.3.2)`, at(m.index));
    }

    // ---- semantic: controls with no accessible name (icon-only buttons and links)
    const ctlRe = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    while ((m = ctlRe.exec(body))) {
      const [tag, attrs, inner] = [m[1].toLowerCase(), m[2], m[3]];
      if (tag === 'a' && tagAttr('<a' + attrs + '>', 'href') === null) continue; // not a control
      const text = decodeEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (text) continue;
      const openTag = '<' + tag + attrs + '>';
      if (hasAccessibleNameAttr(openTag)) continue;
      const img = inner.match(/<img\b[^>]*>/i);
      if (img && (tagAttr(img[0], 'alt') ?? '').trim() !== '') continue; // named by its image
      add('ERROR', 'a11y', rel(f.abs),
        `<${tag}> has no accessible name — an icon-only control needs aria-label or visually-hidden text (WCAG 4.1.2)`,
        at(m.index));
    }

    // ---- keyboard: interactive markup obliges a visible focus style
    const interactive = /<(?:button|select|textarea)\b/i.test(body)
      || /<a\b[^>]*\bhref\s*=/i.test(body)
      || /<input\b(?![^>]*\btype\s*=\s*["']?hidden\b)/i.test(body)
      || /\btabindex\s*=/i.test(body);
    if (interactive && !hasFocusVisibleFor(f)) {
      add('ERROR', 'a11y', rel(f.abs),
        `interactive elements but no :focus-visible rule in this file or a shared stylesheet — every control needs a visible keyboard focus style (WCAG 2.4.7)`, 1);
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
        // No replacement in the lock → no suggestion; never print `use: "undefined"`.
        const hasReplacement = typeof e.replacement === 'string' && e.replacement.trim() !== '';
        add('ERROR', 'banned-jargon', rel(f.abs),
          `banned jargon (${locale}) "${e.term}" found ${count}x`,
          rawIdx >= 0 ? lineOf(rawNfc, rawIdx) : undefined, hasReplacement ? `use: "${e.replacement}"` : null);
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

function checkFigIdCoverage(lock, lockDir, lockLabel, rel) {
  // Gate integrity. A screen that declares figIds is asking the geometry gate to resolve them,
  // and render.mjs resolves them with document.querySelector(`[data-fig-id="${domId}"]`). So a
  // null domId queries [data-fig-id="null"] and a fixture without the attribute matches nothing.
  // Either way geometry reports "missing" and STOPS — the pixel diff, which is the check that
  // actually compares the design, never runs. The screen looks verified while nothing was
  // compared. That silence is the defect; this makes it loud, at the gate people actually run.
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  let declared = 0;
  for (const s of screens) {
    const figIds = Array.isArray(s.figIds) ? s.figIds : [];
    if (!figIds.length) continue;
    const srcPath = s.url ? resolve(lockDir, s.url) : null;
    const html = srcPath && existsSync(srcPath) ? readFileSync(srcPath, 'utf8') : null;
    for (const f of figIds) {
      declared++;
      if (!f.domId) {
        add('ERROR', 'figid-coverage', lockLabel,
          `screen "${s.id}" declares figId "${f.figmaNodeId}" with no domId — render.mjs will query [data-fig-id="null"], geometry reports "missing", and the pixel diff never runs. Set domId (conventionally the figmaNodeId) and tag the element.`);
        continue;
      }
      // Deliberately a substring test, not `data-fig-id="<id>"`. These fixtures are
      // client-rendered: the id reaches the DOM as a JSX prop, so the literal attribute never
      // appears in source. Testing for the attribute form reports found-at-render elements as
      // missing. Whether the element truly resolves is the render dump's job (geometry.mjs);
      // all this can honestly assert is that the id is referenced by the source at all.
      if (html && !html.includes(f.domId)) {
        add('ERROR', 'figid-coverage', rel(srcPath),
          `screen "${s.id}" declares figId domId "${f.domId}" but that id appears nowhere in this file — nothing can carry data-fig-id="${f.domId}", so geometry blocks before the pixel diff and this screen is never actually compared`);
      }
    }
  }
  if (!declared) add('SKIP', 'figid-coverage', '(lock)', 'no screen declares figIds');
}

// Gate integrity. A style/class value assembled at runtime is invisible to every other static
// check in this file — raw-hex, tokens-only-spacing and type-scale all match literal text, and
// a value built from a template literal, concatenation, a join, or an attribute set through
// setAttribute/setProperty/Object.assign has no literal text to match. Flagging the construct
// itself makes that blind spot explicit instead of letting a runtime-built value read as
// silently clean. Scans .js/.jsx/.tsx AND inline <script> bodies in .html — the golden fixture
// itself ships one, and a construct that only escapes detection inside <script> would defeat
// the whole point of this section.
//
// Known remaining blind spots (named, not hidden, per this section's own rule): CSS-in-JS
// tagged templates (`styled.div\`...\``, `css\`...\``); framework binding syntax (`:class`,
// `[ngClass]`, `class:foo`); JSX inline style OBJECTS with a non-literal value
// (`style={{color: c}}` — the most common React dynamic-style form, and NOT covered by the
// `style attribute` construct above, which only matches a template-literal string, not an
// object literal); `innerHTML`; and any external `<script src="...">` — there is no local text
// for a source walk to read. (Routing a value through a helper function before it reaches
// setAttribute, and building a string via `+=` before assigning it, are both still caught here
// — the helper call and the final assignment are ordinary sink matches — so neither is listed
// as a blind spot.)
function checkUnreadableValues(files, rel) {
  // string concatenation (+) and array .join(...) are, unlike every other construct below,
  // context-free JS patterns with no attribute-adjacent anchor of their own — a bare regex
  // match fires on ordinary string building that has nothing to do with class/style (money
  // formatting, i18n keys, URL construction, log lines), which makes the "style value built at
  // runtime" message false. So they only count inside an actual class/style SINK: a
  // className=/class=/style= attribute or member assignment, a setAttribute("class"|"style", …)
  // argument, a style.<prop>=/style['prop']= assignment, or an Object.assign(<x>.style, …)
  // argument — the same sink list the other constructs already match against.
  const GLOBAL_CONSTRUCTS = [
    { key: 'className/class attribute or assignment', re: /\b(?:className|class)\s*=\s*\{?\s*`[^`]*\$\{[^`]*`/g },
    { key: 'style attribute', re: /\bstyle\s*=\s*\{?\s*`[^`]*\$\{[^`]*`/g },
    { key: 'style.<property> assignment', re: /\bstyle\s*\.\s*[A-Za-z][\w-]*\s*=\s*`[^`]*\$\{[^`]*`/g },
    { key: 'style[<property>] bracket assignment', re: /\bstyle\s*\[\s*['"][\w-]+['"]\s*\]\s*=\s*`[^`]*\$\{[^`]*`/g },
    { key: 'setProperty(...)', re: /\.setProperty\(\s*[^,]*,\s*`[^`]*\$\{[^`]*`/g },
    { key: 'Object.assign(<el>.style, …)', re: /\bObject\.assign\(\s*[\w.$]*\.style\s*,/g },
    { key: 'setAttribute("class"|"style", …) with a computed value', re: /\.setAttribute\(\s*(['"])(?:class|style)\1\s*,\s*(?!\1[^'"]*\1\s*\))[^)]*\)/g },
    { key: 'document.write(...) with dynamic content', re: /document\.write\(\s*[^)]*?[+`][^)]*\)/g },
  ];
  const SINK_SCOPED_CONSTRUCTS = [
    { key: 'string concatenation (+) with a non-literal operand, in a class/style sink', re: /(?:['"][^'"]*['"]\s*\+\s*[A-Za-z_$][\w.$]*|[A-Za-z_$][\w.$]*\s*\+\s*['"][^'"]*['"])/g },
    { key: 'array .join(...) in a class/style sink', re: /\[[^\]]*\]\s*\.\s*join\s*\(/g },
  ];

  for (const f of files) {
    const sources = []; // [{ text, baseOffset }]
    if (JSY_EXTS.has(f.ext)) {
      sources.push({ text: stripJsComments(f.content), baseOffset: 0 });
    } else if (f.ext === '.html') {
      for (const b of scriptBlocks(f.content)) sources.push({ text: stripJsComments(b.js), baseOffset: b.offset });
    } else {
      continue;
    }

    const report = (key, count, firstAbsIdx) => {
      if (count === 0) return;
      add('WARN', 'unreadable-values', rel(f.abs),
        `${key} (${count} site${count === 1 ? '' : 's'}, first at line ${lineOf(f.content, firstAbsIdx)}) — style value built at runtime — the static gate cannot verify it; findings here mean "unchecked", not "clean"`,
        lineOf(f.content, firstAbsIdx));
    };

    for (const { key, re } of GLOBAL_CONSTRUCTS) {
      let count = 0;
      let firstAbsIdx = -1;
      for (const { text, baseOffset } of sources) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          count += 1;
          if (firstAbsIdx === -1) firstAbsIdx = baseOffset + m.index;
          if (m[0] === '') re.lastIndex += 1; // never spin on a zero-width match
        }
      }
      report(key, count, firstAbsIdx);
    }

    for (const { key, re } of SINK_SCOPED_CONSTRUCTS) {
      let count = 0;
      let firstAbsIdx = -1;
      for (const { text, baseOffset } of sources) {
        for (const span of findClassStyleSinks(text)) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(span.text))) {
            count += 1;
            const abs = baseOffset + span.start + m.index;
            if (firstAbsIdx === -1) firstAbsIdx = abs;
            if (m[0] === '') re.lastIndex += 1;
          }
        }
      }
      report(key, count, firstAbsIdx);
    }
  }
}

// Text spans that are a class/style SINK — used to scope the otherwise context-free
// concatenation/`.join` detection above. Heuristic bounding (up to the next `;`/newline for a
// bare assignment, or the next `}`/`)` for a braced/call form), not a parser — the same
// tradeoff every other regex in this file makes.
function findClassStyleSinks(text) {
  const spans = []; // { start, text }
  let m;
  // Member-access assignment: el.className = expr; / el.style = expr; — the BARE (non-template)
  // form; el.style.<prop>=/style['prop']= are their own sinks below. Requires a leading `.`, so
  // a plain JSX/HTML literal attribute (`className="tx"`, no dot, nothing to concatenate inside
  // quotes) never becomes a sink here.
  const memberAssignRe = /\.(?:className|class|style)\s*=\s*(?!\{)/g;
  while ((m = memberAssignRe.exec(text))) {
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const end = rest.search(/[;\n]/);
    spans.push({ start, text: rest.slice(0, end === -1 ? rest.length : end) });
  }
  // JSX/attribute expression container: className={expr} / class={expr} / style={expr}.
  const jsxAttrRe = /(?<!\.)\b(?:className|class|style)\s*=\s*\{/g;
  while ((m = jsxAttrRe.exec(text))) {
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const end = rest.indexOf('}');
    spans.push({ start, text: rest.slice(0, end === -1 ? rest.length : end) });
  }
  // setAttribute("class"|"style", expr)
  const setAttrRe = /\.setAttribute\(\s*(['"])(?:class|style)\1\s*,\s*/g;
  while ((m = setAttrRe.exec(text))) {
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const end = rest.indexOf(')');
    spans.push({ start, text: rest.slice(0, end === -1 ? rest.length : end) });
  }
  // .style.<prop> = expr / .style['prop'] = expr
  const stylePropRe = /\.style\s*(?:\.\s*[A-Za-z][\w-]*|\[\s*['"][\w-]+['"]\s*\])\s*=\s*/g;
  while ((m = stylePropRe.exec(text))) {
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const end = rest.search(/[;\n]/);
    spans.push({ start, text: rest.slice(0, end === -1 ? rest.length : end) });
  }
  // Object.assign(<x>.style, expr)
  const objAssignRe = /\bObject\.assign\(\s*[\w.$]*\.style\s*,\s*/g;
  while ((m = objAssignRe.exec(text))) {
    const start = m.index + m[0].length;
    const rest = text.slice(start);
    const end = rest.indexOf(')');
    spans.push({ start, text: rest.slice(0, end === -1 ? rest.length : end) });
  }
  return spans;
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
    'Usage: node scripts/adherence-lint.mjs --lock <path/to/design-lock.json> [--src <dir>] [--json]',
    '       node scripts/adherence-lint.mjs --list-sections [--json]',
    '       node scripts/adherence-lint.mjs --self-test',
    '  --src defaults to the lock file\'s directory. Scans .html/.css/.jsx/.tsx/.js.',
    '  --json           stdout is NDJSON only: one {"type":"finding"} line per finding, then one',
    '                   {"type":"summary"} line. Same findings, counts and exit code as the human report.',
    '  --list-sections  print the section registry (name, group, levels each can emit, read from',
    '                   this file\'s own source). No --lock needed; wins over --lock and --self-test.',
    '  --self-test      call-site scan accounting, registry integrity (both directions), level',
    '                   spelling, golden-fixture pass + JSON/human parity. Exit 0 pass, 1 fail.',
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
  const args = { lock: null, src: null, json: false, listSections: false, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--list-sections') args.listSections = true;
    else if (a === '--self-test') args.selfTest = true;
    else if (a === '--lock') args.lock = argv[++i];
    else if (a.startsWith('--lock=')) args.lock = a.slice('--lock='.length);
    else if (a === '--src') args.src = argv[++i];
    else if (a.startsWith('--src=')) args.src = a.slice('--src='.length);
    else if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
    else die2(`unknown argument "${a}"`);
  }
  return args;
}

// ---------------------------------------------------------------- registry introspection
//
// --list-sections and --self-test read which levels each section can emit from THIS file's own
// source text, never from a hand-kept list: a list maintained beside the code drifts the first
// time someone adds a finding and forgets the list (the same static technique the scaffold
// gauntlet's evals-files lane uses).
//
// Reading the source takes a small lexer, not a regex over raw text. The first version was a
// regex, and it was fooled three ways: an `add(` inside a string literal counted as a call (so
// a dead section looked alive); a `//` inside a string blanked a real call later on the same
// line; and any call not spelled exactly `'LEVEL', 'section'` (double quotes, a template, a
// ternary, a property lookup, a spread) was dropped silently instead of reported — which let an
// unregistered section pass the very check meant to catch it. So: lex the file into code and
// non-code (comments, strings, template text, regex literals), visit EVERY `add(` in code
// position, and classify each of its first two arguments. A single-quoted literal followed by
// the argument's end is read as a value; anything else is dynamic(<nearest preceding function
// declaration>). Nothing is skipped, and the self-test proves the accounting adds up.
const LEVEL_ORDER = ['ERROR', 'WARN', 'SKIP'];
// A `/` after one of these characters or keywords starts a regex literal; otherwise it is
// division. The standard heuristic — this file never needs the cases it gets wrong, and if it
// ever did, the lexer would end in an unbalanced state and say so (see `clean`).
const REGEX_AFTER_CHAR = new Set([...'(,=:[!&|?{};+-*%<>~^']);
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void',
  'yield', 'await', 'delete', 'instanceof', 'new', 'throw']);

// Returns { code, strings, clean, why }. `code` is the source with every comment, string body,
// template text and regex body blanked to spaces — newlines and quote characters kept, so
// offsets, line numbers and argument boundaries survive. `${…}` inside a template stays code.
// `strings` maps each '…'/"…" opening offset to { q, value, end }. `clean` is false when the
// lexer ended inside something or with unbalanced braces: it lost track, so nothing it found
// may be trusted.
function lexJs(src) {
  const out = src.split('');
  const strings = new Map();
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  const done = (clean, why) => ({ code: out.join(''), strings, clean, why });
  const tplStack = []; // brace depth at each open `${`
  let depth = 0;
  let mode = 'code';
  let tplStart = 0;
  let prev = ''; // last significant code character
  let word = ''; // last identifier/keyword read
  let i = 0;
  if (src.startsWith('#!')) { i = src.indexOf('\n'); if (i === -1) i = n; blank(0, i); }
  while (i < n) {
    const c = src[i];
    if (mode === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { blank(tplStart, i); mode = 'code'; prev = '`'; word = ''; i += 1; continue; }
      if (c === '$' && src[i + 1] === '{') {
        blank(tplStart, i); tplStack.push(depth); depth += 1; mode = 'code'; prev = '{'; word = ''; i += 2; continue;
      }
      i += 1; continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i);
      const end = e === -1 ? n : e;
      blank(i, end); i = end; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      if (e === -1) return done(false, `unterminated block comment at line ${lineOf(src, i)}`);
      blank(i, e + 2); i = e + 2; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      if (j >= n || src[j] !== c) return done(false, `unterminated string at line ${lineOf(src, i)}`);
      strings.set(i, { q: c, value: src.slice(i + 1, j), end: j + 1 });
      blank(i + 1, j); prev = c; word = ''; i = j + 1; continue;
    }
    if (c === '`') { mode = 'tpl'; tplStart = i + 1; i += 1; continue; }
    if (c === '/') {
      const isRegex = prev === '' || REGEX_AFTER_CHAR.has(prev) || (/[\w$]/.test(prev) && REGEX_AFTER_WORD.has(word));
      if (!isRegex) { prev = '/'; word = ''; i += 1; continue; }
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== '\n') {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        j += 1;
      }
      if (j >= n || src[j] !== '/') return done(false, `unterminated regex literal at line ${lineOf(src, i)}`);
      blank(i + 1, j);
      j += 1;
      while (j < n && /[a-z]/i.test(src[j])) j += 1; // flags
      prev = ')'; word = ''; i = j; continue; // a regex is a value: a `/` after it is division
    }
    if (c === '{') { depth += 1; prev = c; word = ''; i += 1; continue; }
    if (c === '}') {
      if (tplStack.length && tplStack.at(-1) === depth - 1) { // closes a template's `${`
        tplStack.pop(); depth -= 1; mode = 'tpl'; tplStart = i + 1; i += 1; continue;
      }
      depth -= 1; prev = c; word = ''; i += 1; continue;
    }
    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j += 1;
      word = src.slice(i, j); prev = src[j - 1]; i = j; continue;
    }
    if (!/\s/.test(c)) { prev = c; word = ''; }
    i += 1;
  }
  if (mode !== 'code') return done(false, 'unterminated template literal');
  if (depth !== 0 || tplStack.length) return done(false, `unbalanced braces (depth ${depth} at end of file)`);
  return done(true, null);
}

// One argument starting at `pos` in lexed code: its literal value when it is exactly one
// single-quoted string, else null; and where it ends (the top-level `,` or `)`).
function readArg(code, strings, pos) {
  let p = pos;
  while (p < code.length && /\s/.test(code[p])) p += 1;
  let literal = null;
  const s = strings.get(p);
  if (s && s.q === "'") {
    let q = s.end;
    while (q < code.length && /\s/.test(code[q])) q += 1;
    if (code[q] === ',' || code[q] === ')') literal = s.value;
  }
  let d = 0;
  let j = p;
  for (; j < code.length; j++) {
    const c = code[j];
    if (c === '(' || c === '[' || c === '{') d += 1;
    else if (c === ')' || c === ']' || c === '}') { if (d === 0) break; d -= 1; }
    else if (c === ',' && d === 0) break;
  }
  return { literal, end: j, term: code[j] };
}

// Every `add(` occurrence in this file, accounted for. `tally.raw` counts the raw-text matches;
// each lands in exactly one bucket: inside non-code (comment/string/template/regex), add's own
// definition, or a call site. Call sites carry level/section — the literal value, or null
// when the argument is anything but a single-quoted literal (then the site is dynamic).
function scanAddSites() {
  const src = readFileSync(SELF_PATH, 'utf8');
  const { code, strings, clean, why } = lexJs(src);
  const fns = []; // { name, index } in source order, code positions only
  let m;
  const fnRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = fnRe.exec(code))) fns.push({ name: m[1], index: m.index });
  const enclosing = (idx) => {
    let name = '(top level)';
    for (const f of fns) { if (f.index > idx) break; name = f.name; }
    return name;
  };
  const tally = { raw: 0, nonCode: 0, definition: 0 };
  const sites = []; // { level|null, section|null, fn, line }
  const rawRe = /(?<![\w$.])add\s*\(/g;
  while ((m = rawRe.exec(src))) {
    tally.raw += 1;
    if (code.slice(m.index, m.index + 3) !== 'add') { tally.nonCode += 1; continue; }
    if (/\bfunction\s+$/.test(code.slice(Math.max(0, m.index - 30), m.index))) { tally.definition += 1; continue; }
    const a1 = readArg(code, strings, m.index + m[0].length);
    const a2 = a1.term === ',' ? readArg(code, strings, a1.end + 1) : { literal: null };
    sites.push({ level: a1.literal, section: a2.literal, fn: enclosing(m.index), line: lineOf(src, m.index) });
  }
  return { sites, tally, clean, why };
}

const isDynamic = (s) => s.level === null || s.section === null;
const describeSite = (s) => `${s.fn} line ${s.line} (level ${s.level === null ? 'dynamic' : `'${s.level}'`}, section ${s.section === null ? 'dynamic' : `'${s.section}'`})`;

// section → ordered levels; a variable level becomes "dynamic(<function>)".
function sectionLevels(sites) {
  const bySection = new Map();
  for (const s of sites) {
    if (!s.section) continue;
    if (!bySection.has(s.section)) bySection.set(s.section, new Set());
    bySection.get(s.section).add(s.level ?? `dynamic(${s.fn})`);
  }
  const out = new Map();
  for (const [section, set] of bySection) {
    const lits = LEVEL_ORDER.filter((l) => set.has(l));
    const dyn = [...set].filter((l) => !LEVEL_ORDER.includes(l)).sort();
    out.set(section, [...lits, ...dyn]);
  }
  return out;
}

// The registry first, in report order. Then, so the listing never reads more complete than it
// is: any section the source names that the registry does not (group null), and one row per
// call whose SECTION is not a literal (name null, `site` says where). --self-test fails on
// both; this only shows them. A lexer that lost track is a crash-class result (exit 2): a
// listing built from a misread file would be confidently wrong.
function listSections(json) {
  const { sites, clean, why } = scanAddSites();
  if (!clean) {
    console.error(`adherence-lint: cannot read own source for --list-sections: ${why}`);
    console.error('exit 2 (setup/usage error)');
    return 2;
  }
  const levels = sectionLevels(sites);
  const emit = (row, text) => console.log(json ? ndjson(row) : text);
  for (const name of SECTIONS) {
    const group = SECTION_GROUP.get(name);
    const lv = levels.get(name) ?? [];
    emit({ type: 'section', name, group, levels: lv },
      `${name.padEnd(22)} ${group.padEnd(15)} ${lv.length ? lv.join(', ') : '(none)'}`);
  }
  for (const [name, lv] of levels) {
    if (SECTION_GROUP.has(name)) continue;
    emit({ type: 'section', name, group: null, levels: lv },
      `${name.padEnd(22)} ${'(unregistered)'.padEnd(15)} ${lv.join(', ')}`);
  }
  for (const s of sites.filter((x) => x.section === null)) {
    const lv = [s.level ?? `dynamic(${s.fn})`];
    emit({ type: 'section', name: null, group: null, levels: lv, site: `${s.fn} line ${s.line}` },
      `${'(dynamic section)'.padEnd(22)} ${'-'.padEnd(15)} ${lv[0]} — in ${s.fn}, line ${s.line}`);
  }
  if (json) console.log(ndjson({ type: 'summary', sections: SECTIONS.length }));
  return 0;
}

// Registry integrity. The failure this exists for: a test suite that names a rule the gate
// does not have, or a gate that emits a section its own summary does not list, passes every
// run while checking nothing. Checks 5-6 spawn this script rather than calling main()
// in-process, because main() ends in process.exit and would end the test with it.
function selfTest() {
  const results = []; // { ok, label, detail }
  const check = (ok, label, detail) => results.push({ ok: Boolean(ok), label, detail });

  const { sites, tally, clean, why } = scanAddSites();
  const literal = new Map(); // section → { count, fns:Set }
  for (const s of sites) {
    if (s.section === null) continue;
    const e = literal.get(s.section) ?? { count: 0, fns: new Set() };
    e.count += 1;
    e.fns.add(s.fn);
    literal.set(s.section, e);
  }
  const dynamicSites = sites.filter(isDynamic);

  // 1 — the scan itself is trustworthy: the lexer ended balanced, every raw `add(` match landed
  // in exactly one bucket, and every call site is either literal or dynamic — none skipped.
  // Dynamic sites are legal here (a level chosen from a table is fine); they are listed so a
  // reader sees exactly what the remaining checks could not read.
  const literalCount = sites.length - dynamicSites.length;
  const accounted = tally.raw === tally.nonCode + tally.definition + sites.length && tally.definition === 1;
  check(clean && accounted,
    'the call-site scan accounts for every add( occurrence in this file',
    !clean ? `lexer lost track of the source: ${why}`
      : `${tally.raw} occurrence(s) = ${tally.definition} definition + ${tally.nonCode} in comments/strings/regex + ${sites.length} call site(s); `
        + `call sites = ${literalCount} literal + ${dynamicSites.length} dynamic`
        + (dynamicSites.length ? ` [${dynamicSites.map(describeSite).join('; ')}]` : '')
        + (accounted ? '' : ` — tally does NOT add up (definition count ${tally.definition}, expected 1)`));

  // 2 — a registered section with no call site can never fire, so it reads "ok" forever.
  const dead = SECTIONS.filter((s) => !literal.has(s));
  check(clean && dead.length === 0,
    `every registered section (${SECTIONS.length}) has at least one finding call site`,
    dead.length ? `no call site for: ${dead.join(', ')}` : `${literal.size} distinct literal section names seen`);

  // 3 — an unregistered section's findings sort last (order 99) and never reach the Section
  // summary. A section that is not a literal cannot be proven registered, so it fails too.
  const unregistered = [...literal.keys()].filter((s) => !SECTION_GROUP.has(s));
  const dynSection = sites.filter((s) => s.section === null);
  const problems = [
    ...unregistered.map((s) => `"${s}" is not in SECTIONS (${literal.get(s).count} call site(s) in ${[...literal.get(s).fns].join(', ')}) — its findings print last and are missing from the Section summary`),
    ...dynSection.map((s) => `section is not a single-quoted literal in ${s.fn} (line ${s.line}) — registration cannot be proven statically`),
  ];
  check(clean && problems.length === 0,
    'every section named at a finding call site is registered in SECTIONS',
    problems.length ? problems.join('; ') : `${literal.size} distinct section names, all registered`);

  // 4 — a misspelled level ('EROR') would print a line no consumer's level regex matches and
  // that no RESULT count includes: a finding that exists and is counted nowhere.
  const badLevels = sites.filter((s) => s.level !== null && !LEVEL_ORDER.includes(s.level));
  check(clean && badLevels.length === 0,
    `every literal level at a call site is one of ${LEVEL_ORDER.join(', ')}`,
    badLevels.length ? badLevels.map(describeSite).join('; ') : `${sites.filter((s) => s.level !== null).length} literal level(s), all valid`);

  // 5 — the certified-good fixture passes. It carries WARN/SKIP findings by design (see the
  // raw-hex carve-out in the header), so the bar is "no ERROR, exit 0", not "no findings".
  const golden = join(SKILL_ROOT, 'fixtures', 'golden', 'design-lock.json');
  const run = (extra) => spawnSync(process.execPath, [SELF_PATH, '--lock', golden, ...extra],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const j = run(['--json']);
  let rows = null;
  let parseErr = null;
  try { rows = String(j.stdout ?? '').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l)); }
  catch (e) { parseErr = e.message; }
  const summaries = (rows ?? []).filter((r) => r?.type === 'summary');
  const jFindings = (rows ?? []).filter((r) => r?.type === 'finding');
  const summary = summaries.length === 1 && rows.at(-1) === summaries[0] ? summaries[0] : null;
  const shapeOk = rows !== null && summary !== null && jFindings.length === rows.length - 1;
  const byLevel = (lvl) => jFindings.filter((f) => f.level === lvl).length;
  const countsOk = shapeOk && summary.errors === byLevel('ERROR') && summary.warns === byLevel('WARN')
    && summary.skips === byLevel('SKIP');
  check(j.status === 0 && shapeOk && countsOk && summary.result === 'PASS' && summary.errors === 0,
    `golden fixture passes under --json (${relative(SKILL_ROOT, golden)})`,
    parseErr ? `stdout line is not JSON: ${parseErr}`
      : !shapeOk ? `NDJSON shape wrong: need finding lines then exactly one summary line, last (exit ${j.status}${j.stderr ? `, stderr: ${String(j.stderr).split('\n')[0]}` : ''})`
      : `exit ${j.status}, result ${summary.result}, ${summary.errors} error(s), ${summary.warns} warning(s), ${summary.skips} skipped${countsOk ? '' : ' — summary counts DISAGREE with the finding lines'}`);

  // 6 — JSON/human parity on the same golden run: same (level, section, file, line) tuples,
  // same counts, same exit. Uses eval-correction's human-line regex so the parity proven here
  // is parity with what that consumer actually parses.
  const h = run([]);
  const HUMAN_LINE = /^\[(ERROR|WARN|SKIP)\]\s+(\S+)\s+—\s+(.+)$/;
  const humanTuples = [];
  let resultLine = null;
  for (const line of String(h.stdout ?? '').split('\n')) {
    const m = line.match(HUMAN_LINE);
    if (m) {
      const sep = m[3].indexOf(' — ');
      const loc = (sep === -1 ? m[3] : m[3].slice(0, sep)).match(/^(.*?)(?::(\d+))?$/);
      humanTuples.push(`${m[1]}|${m[2]}|${loc[1]}|${loc[2] ?? ''}`);
    }
    const r = line.match(/^RESULT: (PASS|FAIL) — (\d+) error\(s\), (\d+) warning\(s\), (\d+) skipped/);
    if (r) resultLine = r;
  }
  const jsonTuples = jFindings.map((f) => `${f.level}|${f.section}|${f.file}|${f.line ?? ''}`);
  const a = [...jsonTuples].sort();
  const b = [...humanTuples].sort();
  const tuplesOk = a.length === b.length && a.every((t, i) => t === b[i]);
  const resultOk = resultLine !== null && summary !== null && resultLine[1] === summary.result
    && Number(resultLine[2]) === summary.errors && Number(resultLine[3]) === summary.warns
    && Number(resultLine[4]) === summary.skips;
  check(shapeOk && h.status === j.status && resultLine !== null && tuplesOk && resultOk,
    'golden fixture: --json and human output report the same findings, counts and exit code',
    !shapeOk ? 'JSON run did not parse (see check 5)'
      : resultLine === null ? `human run printed no RESULT line (exit ${h.status})`
      : `${a.length} JSON vs ${b.length} human finding tuple(s)${tuplesOk ? ', identical' : ', DIFFERENT'}; exit ${j.status} vs ${h.status}; RESULT line ${resultOk ? 'matches' : 'DISAGREES with'} the summary`);

  console.log('adherence-lint — self-test');
  results.forEach((r, i) => {
    console.log(`  [${r.ok ? 'PASS' : 'FAIL'}] ${i + 1}. ${r.label}`);
    console.log(`         ${r.detail}`);
  });
  const failed = results.filter((r) => !r.ok).length;
  if (failed) {
    console.log(`\nSELF-TEST: FAIL — ${failed} of ${results.length} check(s) failed (exit 1)`);
    return 1;
  }
  console.log(`\nSELF-TEST: PASS — ${results.length} of ${results.length} checks passed (exit 0)`);
  return 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  // Introspection modes need no lock; they set exitCode and return rather than exit(), so
  // buffered stdout is flushed before the process ends.
  if (args.listSections) { process.exitCode = listSections(args.json); return; }
  if (args.selfTest) { process.exitCode = selfTest(); return; }
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
  const extraTokenCssPaths = [join(SKILL_ROOT, 'assets', 'tokens.css'), join(lockDir, 'assets', 'tokens.css')];
  checkRawHex(lock, files, rel, tokensCssDescription(extraTokenCssPaths, rel));
  checkCssVars(files, rel, extraTokenCssPaths);
  checkSpacing(files, rel, lock.tokens?.spacing);
  checkTypeScale(lock, files, rel);
  checkPlaceholders(files, rel);
  checkEmDash(htmlFiles, rel);
  checkBannedFonts(lock, lockLabel, files, rel);
  checkContrast(lock, lockLabel);
  checkTransitionAll(files, rel);
  checkA11y(files, htmlFiles, rel);
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
  checkFigIdCoverage(lock, lockDir, lockLabel, rel);
  checkUnreadableValues(files, rel);

  // ---- report
  if (!args.json) { // under --json, stdout carries NDJSON only — no header
    console.log('adherence-lint — static gate');
    console.log(`  lock: ${lockPath}`);
    console.log(`  src:  ${srcDir}  (${files.length} source file(s), ${htmlFiles.length} html)\n`);
  }

  const order = new Map(SECTIONS.map((s, i) => [s, i]));
  findings.sort((a, b) => (order.get(a.section) ?? 99) - (order.get(b.section) ?? 99));
  // Sanitize before printing: a lock is an INPUT artifact (skill-scaffold instantiates them,
  // captures come from external design systems) and must not be able to author extra lines —
  // or terminal control sequences — in the gate's own report. Unicode control (\p{Cc}, e.g.
  // ESC/BEL) and format (\p{Cf}, e.g. zero-width/RTL marks) characters are blanked FIRST — an
  // ESC byte is not whitespace, and a raw one would survive the collapse below intact, letting
  // a TTY-rendered ANSI payload (cursor-up + line-erase + fake green PASS) overwrite real report
  // lines even though the captured byte stream stayed clean. Then whitespace — including
  // newlines — is collapsed to single spaces and trimmed, so a note cannot inject a forged
  // `RESULT: PASS …` or `[SKIP] …` line; the 200-char cap keeps it a trailing annotation, not a
  // report of its own.
  const rawNote = typeof lock.lint?.note === 'string'
    ? lock.lint.note.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim()
    : '';
  const note = rawNote ? rawNote.slice(0, 200) : null;

  if (args.json) {
    const count = (level, section) => findings.filter((f) => f.level === level && (section === undefined || f.section === section)).length;
    for (const f of findings) {
      console.log(ndjson({
        type: 'finding', level: f.level, section: f.section, group: SECTION_GROUP.get(f.section) ?? null,
        file: f.file, line: f.line ? f.line : null, detail: f.detail, suggestion: f.suggestion,
      }));
    }
    // Every registered section, in report order. Should a future edit emit an UNREGISTERED
    // section (--self-test check 3 fails on that), it is appended with group null rather than
    // dropped: the human Section summary would omit it, but here the per-section counts must
    // still add up to the totals, or a consumer could not trust either.
    const fired = [...new Set(findings.map((f) => f.section))].filter((s) => !SECTION_GROUP.has(s));
    const sections = {};
    for (const s of [...SECTIONS, ...fired]) {
      sections[s] = { group: SECTION_GROUP.get(s) ?? null, errors: count('ERROR', s), warns: count('WARN', s), skips: count('SKIP', s) };
    }
    const errors = count('ERROR');
    console.log(ndjson({
      type: 'summary', result: errors > 0 ? 'FAIL' : 'PASS', errors, warns: count('WARN'), skips: count('SKIP'),
      files: files.length, html: htmlFiles.length, lock: lockPath, src: srcDir, note, sections,
    }));
    // exitCode + return, not exit(): stdout to a pipe can be asynchronous, and exit() would cut
    // a long NDJSON stream short. Same codes as the human path below.
    process.exitCode = errors > 0 ? 1 : 0;
    return;
  }

  for (const f of findings) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    // detail — suggestion — note: the suggestion re-joins exactly where it was fused before.
    const base = f.suggestion ? `${f.detail} — ${f.suggestion}` : f.detail;
    const detail = note ? `${base} — ${note}` : base;
    console.log(`[${f.level}] ${f.section} — ${loc} — ${detail}`);
  }
  if (findings.length === 0) console.log('No findings.');

  console.log('\nSection summary:');
  for (const s of SECTIONS) {
    const e = findings.filter((f) => f.section === s && f.level === 'ERROR').length;
    const w = findings.filter((f) => f.section === s && f.level === 'WARN').length;
    const k = findings.filter((f) => f.section === s && f.level === 'SKIP').length;
    // Join every non-zero level instead of falling through on the first match — a section
    // that both WARNed and SKIPped (e.g. type-scale: one off-scale size WARN plus a SKIP for
    // declarations it couldn't read) must show both; the old ladder let WARN hide a
    // co-occurring SKIP, and the SKIP is often where a check's real coverage gap is disclosed.
    const parts = [];
    if (e) parts.push(`${e} ERROR`);
    if (w) parts.push(`${w} WARN`);
    if (k) parts.push(`${k} skipped`);
    const status = parts.length ? parts.join(', ') : 'ok';
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
