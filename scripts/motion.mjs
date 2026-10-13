#!/usr/bin/env node
// motion.mjs — time-driven pieces: films (time runs) and clicker decks (presses run time).
//
// Contract: ../CONTRACT.md — §Exit codes, §Invocation contract; the kit it drives is runtime/motion/README.md.
// A piece is <lockDir>/motion/<id>/ (index.html + piece.js). It reaches the kit by relative URL — through the
// <lockDir>/kit symlink `new` creates, or straight into the engine's runtime/motion/ — and everything inside the
// lock's directory or the engine root counts as its own tree. Every picture comes from window.__motion in tool mode
// (?tool): the page draws the frame asked for and the browser photographs it, so a frame is the same frame however
// it is reached.
//
//   new    --lock L --kind film|deck --id <id> [--title "T"] [--format <screen preset>] [--fps 30]
//   check  --lock L --id <id> [--json] [--budget-ms 400] [--every <s>]
//   stills --lock L --id <id> [--at 2.2,14.5] [--every 0.5 --from a --to b] [--only 3,7] [--idle 8] [--force]
//   export --lock L --id <id> [--from s --to s] [--audio f] [--take latest|<stamp>] [--crf 16] [--out f] [--force] [--pack]
//   serve  --lock L [--port 5340] [--open]
//   --self-test [--manifest fixtures/motion/manifest.json] [--json]      --help
//
// Exit codes (CONTRACT §Exit codes): 0 pass · 1 gate finding · 2 setup/usage (bad flags, unknown piece, unreadable
// lock, ffmpeg absent for export, pinned-build mismatch, lint crashed, a self-test piece BLOCKED) · 4 FONT_PARITY ·
// 5 render failure (browser cannot launch, page never ready, the encoder died).
// Artifacts land in <lockDir>/.motion/<id>/ (stills/, sheets/, handout.pdf, <id>.mp4, takes/, portable/).
// Test seam: MOTION_LINT=<script> makes the lint gate spawn that script instead of adherence-lint.mjs (to prove the
// crash path); the gate line then names it. Normal use never sets it.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';
import { PIXELMATCH_THRESHOLD } from './pixelmatch-threshold.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const ENGINE = path.dirname(path.dirname(SCRIPT));
const KIT = path.join(ENGINE, 'runtime', 'motion');
const EXIT = { PASS: 0, FINDING: 1, SETUP: 2, FONT_PARITY: 4, RENDER: 5 };
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// The same determinism constants as render.mjs (CONTRACT §Determinism invariants), which owns them.
const FROZEN_EPOCH_MS = Date.UTC(2026, 0, 15, 10, 0, 0);
const RNG_SEED = 42;
const READY_TIMEOUT_MS = 15000;
const CHROMIUM_CHANNEL = 'chromium';
// Without file access Chromium refuses the kit's ES module imports from a file:// document. The two raster flags:
// rasterise on the CPU and in whole tiles, so an edge is painted the same whatever was painted before it (render.mjs keeps its
// raster path until its stored references are re-measured).
const LAUNCH_ARGS = ['--allow-file-access-from-files', '--disable-gpu-rasterization', '--disable-partial-raster'];
const LINT_TIMEOUT_MS = 180000;
// After the last screenshot the offline gate waits two painted frames, then until nothing is in flight and nothing
// new was asked for during IDLE_MS (capped at SETTLE_CAP_MS) — late timers and transitionend handlers count.
const IDLE_MS = 250;
const SETTLE_CAP_MS = 5000;
// What neither half of the offline gate can see, said on its line and in --help rather than hidden.
const OFFLINE_LIMIT = 'a URL assembled at runtime and requested behind a timer longer than the settle window is not seen; self-time warns of every timer';

class ExitError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new ExitError(code, message); };
const setup = (message) => fail(EXIT.SETUP, `exit 2 (setup/usage error): ${message}`);

// Page-sourced text (error messages, element text, URLs) reaches the report; it must never break a line. JS `\s`
// covers U+2028/U+2029; NEL and the other control characters are replaced too.
const oneLine = (s, n = 160) => {
  const t = String(s ?? '').replace(/[\s\u0085\p{Cc}]+/gu, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
// NDJSON a line-splitter cannot break: JSON.stringify leaves U+2028, U+2029 and NEL raw.
const ndjson = (o) => JSON.stringify(o).replace(/[\u2028\u2029\u0085]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

// ---------------------------------------------------------------------------------------------------------- usage

function usage() {
  return [
    'Usage: node scripts/motion.mjs <command> [flags]',
    '',
    '  new    --lock L --kind film|deck --id <id> [--title "T"] [--format <screen preset id>] [--fps 30]',
    '         copies <lockDir>/templates/motion/<kind>/ (a skill\'s own filled template) or else the engine skeleton',
    '         (runtime/motion/templates/<kind>/) to <lockDir>/motion/<id>/, links <lockDir>/kit → the engine kit,',
    '         fills __TITLE__ __W__ __H__ __FPS__ from formats.json, and the --piece-* ROLE MAP slots the lock makes',
    '         unambiguous. --format defaults to social-portrait (film) or slide (deck).',
    '  check  --lock L --id <id> [--json] [--budget-ms 400] [--every <s>]',
    '         gates, in order: loads · offline · fonts (exit 4) · pictures · tokens · lint · self-time · determinism ·',
    '         layout · deck: presses, clicker · frame-time. One line each: pass|FAIL|WARN|SKIP  <name>: <detail>,',
    '         then RESULT: PASS|FAIL — e error(s), w warning(s), s skipped (exit n). --json: NDJSON {"type":"gate"}',
    '         per gate, the lint child\'s {"type":"finding"} lines, one {"type":"summary"} last. --every adds a dense',
    '         film determinism probe every <s> seconds; --budget-ms is the frame-time budget (film 400, deck 34).',
    '  stills --lock L --id <id> [--at 2.2,14.5] [--every 0.5 --from a --to b] [--only 3,7] [--idle 8] [--force]',
    '         film: every scene -move and -rest (or --at moments, or an --every strip); deck: every pose NN.jpg',
    '         (--only some, held --idle seconds) + handout.pdf; contact sheets in sheets/sheet-N.jpg. Refuses on a',
    '         fonts failure (exit 4) unless --force.',
    '  export --lock L --id <id> [--from s --to s] [--audio f] [--take latest|<stamp>] [--crf 16] [--out f] [--force] [--pack]',
    '         an H.264 MP4 through ffmpeg (FFMPEG env, else PATH; absent → exit 2). Refuses when loads, fonts or',
    '         pictures fail unless --force. Deck: the automatic film, or a recorded take (voice muxed).',
    '         --pack (deck, no ffmpeg needed): .motion/<id>/portable/ — the piece, the kit, the stills, a server,',
    '         start.sh/start.cmd.',
    '  serve  --lock L [--port 5340] [--open]',
    '         serves the lock directory read-only on the loopback address (/kit through the symlink, or the engine',
    '         kit); accepts POST /__take/<deck>/<stamp>/take.json|voice.webm into .motion/<deck>/takes/<stamp>/.',
    '  --self-test [--manifest <path>] [--json]',
    '         runs `check --json` on every piece of fixtures/motion/manifest.json:',
    '           { "lock": "design-lock.json",',
    '             "pieces": [ { "id": "<id>", "kind": "film"|"deck",',
    '                           "expect": "pass" | { "gate": "<name>", "result": "FAIL"|"WARN"|"SKIP", "exit"?: <n> },',
    '                           "tolerate"?: ["<gate>", …] } ] }',
    '         `lock` is relative to the manifest and must stay inside its directory. "pass": RESULT PASS, exit 0.',
    '         A negative: its gate has that result, the exit is `exit` (default FAIL → 1, fonts FAIL → 4, else 0),',
    '         and no other gate FAILs unless tolerated. A run that exits 2/5 or prints no summary is BLOCKED.',
    '         Exit 0 all hold · 1 any piece failed · 2 setup or any BLOCKED (2 wins over 1).',
    '  --help',
    '',
    'Offline: requests are watched until the page settles (two frames, animations finished, 250 ms quiet, capped',
    'at 5 s) and the piece\'s own source is scanned for scheme://host URLs. Known limit: a URL assembled at runtime',
    'and requested behind a longer timer is not seen; the self-time gate warns of every timer in the piece.',
    'Test seam: MOTION_LINT=<script> runs that script as the lint gate (it proves the "lint crashed" path); the',
    'gate line names it. Exit codes: 0 pass · 1 gate finding · 2 setup/usage · 4 FONT_PARITY · 5 render failure.',
  ].join('\n');
}

// ----------------------------------------------------------------------------------------------------------- args

const FLAGS = {
  new: { lock: 1, kind: 1, id: 1, title: 1, format: 1, fps: 1 },
  check: { lock: 1, id: 1, json: 0, 'budget-ms': 1, every: 1 },
  stills: { lock: 1, id: 1, at: 1, every: 1, from: 1, to: 1, only: 1, idle: 1, force: 0 },
  export: { lock: 1, id: 1, from: 1, to: 1, audio: 1, take: 1, crf: 1, pack: 0, out: 1, force: 0 },
  serve: { lock: 1, port: 1, open: 0 },
  '--self-test': { manifest: 1, json: 0 },
};

function parseArgs(argv) {
  if (argv.length === 0) { console.error(usage()); process.exit(EXIT.SETUP); }
  if (argv.includes('--help') || argv.includes('-h')) { console.log(usage()); process.exit(EXIT.PASS); }
  const cmd = argv[0];
  const spec = FLAGS[cmd];
  if (!spec) setup(`unknown command "${cmd}".\n${usage()}`);
  const args = { cmd };
  for (let i = 1; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m || !(m[1] in spec)) setup(`unknown argument "${argv[i]}" for ${cmd}. See --help.`);
    if (spec[m[1]]) {
      const v = m[2] ?? argv[++i];
      if (v === undefined || (m[2] === undefined && v.startsWith('--'))) setup(`--${m[1]} needs a value.`);
      args[m[1]] = v;
    } else args[m[1]] = true;
  }
  return args;
}

function num(args, name, { def, min = -Infinity, max = Infinity, integer = false } = {}) {
  if (args[name] === undefined) return def;
  const v = Number(args[name]);
  if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    setup(`--${name} "${args[name]}" is not ${integer ? 'an integer' : 'a number'}${min > -Infinity ? ` ≥ ${min}` : ''}${max < Infinity ? ` and ≤ ${max}` : ''}.`);
  }
  return v;
}
const list = (raw, name) => String(raw).split(',').map((s) => {
  const v = Number(s.trim());
  if (!s.trim() || !Number.isFinite(v)) setup(`--${name} "${raw}" is not a comma-separated list of numbers.`);
  return v;
});

// ------------------------------------------------------------------------------------------------- lock and piece

function loadLock(lockArg) {
  if (!lockArg) setup('missing required --lock <path/to/design-lock.json>.');
  const lockPath = path.resolve(lockArg);
  let raw;
  try { raw = fs.readFileSync(lockPath, 'utf8'); } catch (e) { setup(`cannot read lock file ${lockPath}: ${e.message}`); }
  let lock;
  try { lock = JSON.parse(raw); } catch (e) { setup(`lock file ${lockPath} is not valid JSON: ${e.message}`); }
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) setup(`lock file ${lockPath} is not a JSON object.`);
  const allowHosts = lock.render?.allowHosts ?? [];
  if (!Array.isArray(allowHosts) || allowHosts.some((h) => typeof h !== 'string' || !/^[^:/@\s]+$/.test(h))) {
    setup(`lock render.allowHosts in ${lockPath} must be an array of hostnames only (as render.mjs requires).`);
  }
  return { lock, lockPath, lockDir: path.dirname(lockPath), allowHosts: allowHosts.map((h) => h.toLowerCase()) };
}

const piecesIn = (lockDir) => {
  const dir = path.join(lockDir, 'motion');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'index.html'))) : [];
};

// No kit symlink is required here (fixtures reach the engine's kit by a plain relative path): the piece's own kit
// URLs either resolve, and the loads gate passes, or they do not.
function resolvePiece(L, id) {
  if (!id) setup('missing required --id <piece id>.');
  if (!ID_RE.test(id)) setup(`--id "${id}" is not a piece id (lower-case letters, digits, hyphens).`);
  const dir = path.join(L.lockDir, 'motion', id);
  const index = path.join(dir, 'index.html');
  if (!fs.existsSync(index)) setup(`unknown piece "${id}": no ${index}. Pieces here: ${piecesIn(L.lockDir).join(', ') || '(none)'}; start one with \`motion.mjs new\`.`);
  return { id, dir, index, kind: kindOf(dir) };
}

// The kind, read from what piece.js imports (no browser needed: pack, the server and early flag checks use it).
function kindOf(dir) {
  let src = '';
  try { src = fs.readFileSync(path.join(dir, 'piece.js'), 'utf8'); } catch { return null; }
  return /\/deck\.js['"]/.test(src) ? 'deck' : /\/film\.js['"]/.test(src) ? 'film' : null;
}

const outDir = (L, id, ...sub) => {
  const d = path.join(L.lockDir, '.motion', id, ...sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

// ------------------------------------------------------------------------------------- source scanning (static)

// Comments blanked, strings kept, newlines kept (line numbers stay right). A small scanner rather than a regex: a
// `//` inside a string or after a backslash is not a comment.
function blankJsComments(src, { css = false } = {}) {
  let out = '', i = 0, quote = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
    } else if (c === '/' && d === '*') {
      const close = src.indexOf('*/', i + 2), stop = close === -1 ? src.length : close + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (!css && c === '/' && d === '/') {
      const stop = src.indexOf('\n', i) === -1 ? src.length : src.indexOf('\n', i);
      out += ' '.repeat(stop - i);
      i = stop;
    } else {
      if (c === '"' || c === "'" || (!css && c === '`')) quote = c;
      if (c === '\\') { out += c + (d ?? ''); i += 2; continue; }
      out += c;
      i++;
    }
  }
  return out;
}
function codeOf(file, text) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.css') return blankJsComments(text, { css: true });
  if (ext !== '.html' && ext !== '.htm' && ext !== '.svg') return blankJsComments(text);
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return text.replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, body, z) => a + blankJsComments(body) + z)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, body, z) => a + blankJsComments(body, { css: true }) + z);
}
// The piece's own source files (never the kit): stat() follows a symlinked file, a symlinked directory is not walked.
function pieceSources(dir, exts) {
  const found = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const f = path.join(d, name);
      let st, lst;
      try { st = fs.statSync(f); lst = fs.lstatSync(f); } catch { continue; }
      if (st.isDirectory() && !lst.isSymbolicLink()) walk(f);
      else if (st.isFile() && exts.test(name)) found.push(f);
    }
  };
  walk(dir);
  return found;
}
// Namespace URIs name a vocabulary; a browser never fetches them.
const NAMESPACES = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.w3.org/1999/xhtml', 'http://www.w3.org/1998/Math/MathML', 'http://www.w3.org/XML/1998/namespace']);
function scanAbsoluteUrls(dir, allowHosts) {
  const files = pieceSources(dir, /\.(html?|m?js|css|svg)$/i), hits = [];
  for (const f of files) {
    const code = codeOf(f, fs.readFileSync(f, 'utf8'));
    code.split('\n').forEach((line, k) => {
      // any network scheme followed by a host — a dotted name, a dotless one, an IPv4 address or a [bracketed] IPv6 one
      for (const m of line.matchAll(/(?:\b(?:https?|wss?):)?\/\/(?:\[[0-9a-f:.]+\]|[a-z0-9_-][a-z0-9_.-]*)(?::\d+)?(?:[/?#][^\s"'`)<>]*)?/gi)) {
        if (!/^(?:https?|wss?):/i.test(m[0]) && !/(?:url\(|=|['"`])\s*$/.test(line.slice(0, m.index))) continue;   // a bare `//host` only where a URL goes
        let host;
        try { host = new URL(m[0].startsWith('//') ? `https:${m[0]}` : m[0]).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { continue; }
        if (NAMESPACES.has(m[0].replace(/\/$/, '')) || allowHosts.includes(host)) continue;
        hits.push({ file: path.relative(dir, f), line: k + 1, url: oneLine(m[0], 100), host });
      }
    });
  }
  return { files: files.length, hits };
}

// ------------------------------------------------------------------------------------------- browser + network

// Pinned build (CONTRACT invariant 1), as render.mjs checks it: a different build rasterizes differently.
function checkChromiumBuild(lock) {
  let exe;
  try { exe = chromium.executablePath({ channel: CHROMIUM_CHANNEL }); } catch (e) {
    fail(EXIT.RENDER, `exit 5 (render failure/environment): cannot resolve the Playwright Chromium executable: ${e.message}. Run scripts/setup-check.mjs.`);
  }
  const actual = exe.split(path.sep).find((s) => /^chromium\S*-\d+$/.test(s)) ?? exe;
  const expected = lock.meta?.chromiumBuild;
  if (expected && !actual.includes(expected)) {
    setup(`CHROMIUM BUILD MISMATCH — lock meta.chromiumBuild="${expected}" but the resolved build is "${actual}" (executable: ${exe}). Run scripts/setup-check.mjs, then install the pinned build or re-pin the lock.`);
  }
  return actual;
}

// Owner: render.mjs (determinismInit). Copied, not imported, because render.mjs is a CLI with no exports; keep the
// two bodies identical (freeze the clock, seed Math.random with mulberry32, make requestIdleCallback a macrotask).
function determinismInit({ epochMs, seed }) {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(epochMs);
      else super(...args);
    }
    static now() { return epochMs; }
  }
  window.Date = FrozenDate;
  let s = seed >>> 0;
  Math.random = function mulberry32() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.requestIdleCallback = (cb) =>
    window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
  window.cancelIdleCallback = (id) => window.clearTimeout(id);
}

// A piece must travel, so a request stays in the tree only when it is data:/blob:/about:, or a file:// path inside the lock's directory
// (lexically, so through the kit symlink) or inside the engine root (where the kit lives). Anything else leaves it, and is allowed
// only for a host in lock.render.allowHosts. Never throws (it runs in route handlers and request listeners).
function classify(rawUrl, lockDir, allowHosts) {
  let u;
  try { u = new URL(rawUrl); } catch { return { url: oneLine(rawUrl, 200), host: null, inTree: false, allowed: false }; }
  if (u.username || u.password) { u.username = ''; u.password = ''; }
  const url = oneLine(u.href, 300), p = u.protocol;
  if (p === 'data:' || p === 'blob:' || p === 'about:') return { url: `${p}…`, host: null, inTree: true, allowed: true };
  if (p === 'file:') {
    let file = null;
    try { file = path.resolve(fileURLToPath(u)); } catch { /* not provably in the tree */ }
    const under = (root) => file !== null && file.startsWith(path.resolve(root) + path.sep);
    const inTree = under(lockDir) || under(ENGINE);
    return { url, host: null, inTree, allowed: inTree };
  }
  const host = ['http:', 'https:', 'ws:', 'wss:'].includes(p) ? u.hostname.toLowerCase() : null;
  return { url, host, inTree: false, allowed: host !== null && allowHosts.includes(host) };
}

// Records every request that leaves the tree (blocking it unless allowed), and keeps the context's in-flight set and
// last-activity time so the offline gate can wait for a page to go quiet before it decides.
function netRecorder(L) {
  const records = new Map(), flying = new Set();
  let phase = 'load', lastActivity = performance.now();
  const note = (raw, type, how) => {
    const d = classify(raw, L.lockDir, L.allowHosts);
    if (d.inTree) return d;
    if (!records.has(d.url)) records.set(d.url, { url: d.url, host: d.host, resourceType: type, allowed: d.allowed, blocked: false, phase, seen: [] });
    const r = records.get(d.url);
    if (!r.seen.includes(how)) r.seen.push(how);
    return d;
  };
  const done = (q) => { flying.delete(q); lastActivity = performance.now(); };
  return {
    records,
    setPhase: (p) => { phase = p; },
    async attach(context) {
      await context.route('**/*', (route) => {
        let d = { inTree: false, allowed: false };
        try { const q = route.request(); d = note(q.url(), q.resourceType(), 'route'); } catch { /* fail closed */ }
        if (d.inTree || d.allowed) return route.continue().catch(() => {});
        const r = records.get(d.url);
        if (r) r.blocked = true;
        return route.abort('blockedbyclient').catch(() => {});
      });
      context.on('request', (q) => { flying.add(q); lastActivity = performance.now(); try { note(q.url(), q.resourceType(), 'request'); } catch { /* never throw */ } });
      context.on('requestfinished', done);
      context.on('requestfailed', done);
      // WebSockets never reach route() or the request events, and a context has no 'websocket' event: they are
      // refused through routeWebSocket (an allowed host is connected through) and also observed on every page —
      // the listener is attached as each page opens, so the probe, the main and the clicker pages are all covered.
      await context.routeWebSocket(/.*/, (ws) => {
        let d = { inTree: false, allowed: false };
        try { d = note(ws.url(), 'websocket', 'route'); } catch { /* fail closed */ }
        if (d.inTree || d.allowed) return ws.connectToServer();
        const r = records.get(d.url);
        if (r) r.blocked = true;
        return ws.close({ code: 1008, reason: 'refused: outside the lock tree' }).catch?.(() => {});
      });
      context.on('page', (page) => page.on('websocket', (ws) => { lastActivity = performance.now(); try { note(ws.url(), 'websocket', 'websocket'); } catch { /* never throw */ } }));
    },
    // two painted frames on every page; then until no animation or transition is still running (a transitionend or
    // animationend handler may be what asks for a URL); then quiet: nothing in flight, nothing new for IDLE_MS. The
    // whole wait is capped at SETTLE_CAP_MS.
    async settle(context) {
      const t0 = performance.now(), left = () => performance.now() - t0 < SETTLE_CAP_MS;
      const pause = () => new Promise((ok) => setTimeout(ok, 20));
      for (const page of context.pages()) {
        await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))).catch(() => {});
      }
      const running = async () => {
        let n = 0;
        for (const page of context.pages()) n += await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length).catch(() => 0);
        return n;
      };
      let animating = await running();
      while (animating > 0 && left()) { await pause(); animating = await running(); }
      lastActivity = Math.max(lastActivity, performance.now());
      while (left() && (flying.size > 0 || performance.now() - lastActivity < IDLE_MS)) await pause();
      return { waitedMs: Math.round(performance.now() - t0), pending: flying.size, animating };
    },
    violations: () => [...records.values()].filter((r) => !r.allowed),
  };
}

async function launch(L) {
  const build = checkChromiumBuild(L.lock);
  try {
    return { browser: await chromium.launch({ headless: true, channel: CHROMIUM_CHANNEL, args: LAUNCH_ARGS }), build };
  } catch (e) {
    fail(EXIT.RENDER, `exit 5 (render failure/environment): could not launch pinned Chromium (channel "${CHROMIUM_CHANNEL}"): ${e.message}. Run scripts/setup-check.mjs.`);
  }
}

async function newContext(browser, net, W, H) {
  const context = await browser.newContext({
    // A film is a video: what is exported must be what a viewer sees when it plays, so the page is NOT told the
    // viewer prefers reduced motion — a piece's prefers-reduced-motion override (a shorter token, say) would
    // otherwise be what gets encoded while everyone watching gets the normal value. (render.mjs keeps 'reduce' for
    // static screens, where a page should show its still form.)
    viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference', timezoneId: 'UTC',
  });
  await context.addInitScript(determinismInit, { epochMs: FROZEN_EPOCH_MS, seed: RNG_SEED });
  await net.attach(context);
  return context;
}

// Load a page and wait for the kit's contract: data-render-ready (tool mode) or data-motion-live (live mode), or
// data-motion-error when the piece threw. Two more ways a piece shows it will never be ready end the wait at once:
// an uncaught error (deck() throwing before mount() can mark it), and a script that did not load (a kit URL that
// does not resolve). Nothing at all within 15 s → exit 5, never a guess.
async function load(page, url, { live = false } = {}) {
  const errors = [], missing = [];
  let stop;
  const stopped = new Promise((ok) => { stop = ok; });
  page.on('pageerror', (e) => { errors.push(oneLine(e?.message ?? e, 300)); stop(); });
  page.on('requestfailed', (q) => {
    if (q.resourceType() === 'script') { missing.push(`${oneLine(q.url(), 200)} (${q.failure()?.errorText ?? 'failed'})`); stop(); }
  });
  const signal = live
    ? () => document.documentElement.hasAttribute('data-motion-live') || document.documentElement.hasAttribute('data-motion-error')
    : () => document.documentElement.hasAttribute('data-render-ready') || document.documentElement.hasAttribute('data-motion-error');
  try { await page.goto(url, { waitUntil: 'load' }); } catch (e) { fail(EXIT.RENDER, `exit 5 (render failure): failed to load ${url}: ${oneLine(e.message, 300)}`); }
  const ready = page.waitForFunction(signal, null, { timeout: READY_TIMEOUT_MS });
  ready.catch(() => {});
  try { await Promise.race([ready, stopped]); } catch {
    fail(EXIT.RENDER, `exit 5 (render timeout): ${live ? 'data-motion-live' : '[data-render-ready]'} did not appear within ${READY_TIMEOUT_MS}ms at ${url}.\n` +
      'Contract: in tool mode — the URL must carry ?tool; a page without it is for a person and never signals readiness — ' +
      'the kit sets data-render-ready on <html> once fonts, pictures, setup and the requested frame are done (or ' +
      'data-motion-error when the piece throws). A piece that never imports or never calls the kit (an empty piece.js) never signals.');
  }
  // an error or a failed script that the kit survives must not be read as "never ready": give it a moment to signal
  if (!(await page.evaluate(signal))) await page.waitForFunction(signal, null, { timeout: 2000 }).catch(() => {});
  if (!(await page.evaluate(signal))) {
    const why = missing.length ? `a script did not load: ${missing.join('; ')}` : `uncaught before readiness: ${[...new Set(errors)].join(' | ')}`;
    return { motionError: why, errors };
  }
  const raw = await page.evaluate(() => document.documentElement.getAttribute('data-motion-error'));
  const motionError = raw === null ? null : oneLine(raw, 300) || 'data-motion-error set without a message';
  if (motionError === null) {
    await page.addStyleTag({ content: '::-webkit-scrollbar { display: none !important; } * { scrollbar-width: none !important; caret-color: transparent !important; }' });
  }
  return { motionError, errors };
}

// One browser, one context sized to the piece: a probe load reads W×H from __motion.meta, then the real context
// (viewport = the piece's frame) loads it again. The probe's requests count for the offline gate too.
async function openPiece(L, piece) {
  const { browser, build } = await launch(L);
  const net = netRecorder(L);
  const url = `${pathToFileURL(piece.index).href}?tool`;
  try {
    const probeCtx = await newContext(browser, net, 1280, 800);
    const probe = await probeCtx.newPage();
    const first = await load(probe, url);
    if (first.motionError !== null) return { browser, build, net, url, loaded: first, meta: null, page: probe, context: probeCtx };
    const { W, H } = await probe.evaluate(() => window.__motion.meta);
    await probeCtx.close();
    const context = await newContext(browser, net, W, H);
    const page = await context.newPage();
    const loaded = await load(page, url);
    const meta = loaded.motionError === null ? await page.evaluate(() => ({ kind: window.__motion.kind, ...window.__motion.meta })) : null;
    return { browser, build, net, url, loaded, meta, page, context };
  } catch (e) {
    await browser.close().catch(() => {});
    throw e;
  }
}

// The kit's at/frame/pose resolve once the frame has painted (two animation frames later); evaluate awaits that promise.
const drawFrame = (page, n) => page.evaluate((x) => window.__motion.frame(x), n);
const drawAt = (page, t) => page.evaluate((x) => window.__motion.at(x), t);
const drawPose = (page, i, idle = 0) => page.evaluate(([x, s]) => window.__motion.pose(x, s), [i, idle]);
// Never animations: 'disabled' — that would finish a stray CSS transition and hide exactly what determinism probes.
const png = (page) => page.screenshot({ type: 'png', caret: 'hide' });
const jpeg = (page, quality) => page.screenshot({ type: 'jpeg', quality, caret: 'hide' });
// A Playwright evaluate error, as the page's own message
const pageMessage = (e) => oneLine(String(e?.message ?? e).split('\n')[0].replace(/^[\w.]+: (?:Error: )?/, ''), 200);

// Fonts come from the lock: every fonts[].fontChecks[] by document.fonts.check() AND render.mjs's metric probe — check()
// is trivially true for a family with no @font-face, so an absent family must be caught by measuring it.
async function fontGate(page, lock) {
  const specs = (Array.isArray(lock.fonts) ? lock.fonts : []).flatMap((f) => (f.fontChecks ?? []).map((spec) => ({ family: f.family, spec })));
  if (!specs.length) return { result: 'SKIP', detail: 'the lock declares no fonts[].fontChecks — nothing to assert (a fallback would go unseen)', data: {} };
  await page.evaluate(async () => { await document.fonts.ready; });
  const checks = await page.evaluate((all) => all.map(({ family, spec }) => {
    try { return { family, spec, pass: document.fonts.check(spec) }; } catch (e) { return { family, spec, pass: false, error: String(e?.message ?? e) }; }
  }), specs);
  const bad = checks.filter((c) => c.error);
  if (bad.length) setup(`unparseable fonts[].fontChecks[] spec(s) — document.fonts.check() rejected: ${bad.map((c) => `'${c.spec}' (${oneLine(c.error)})`).join('; ')}. Specs are CSS font shorthand like '700 26px "Brand Sans"'.`);
  const probes = await page.evaluate((families) => families.map((family) => {
    const ctx = document.createElement('canvas').getContext('2d');
    const width = (stack) => { ctx.font = `48px ${stack}`; return ctx.measureText('mmmwwwlliWQ178@#').width; };
    if ([...document.fonts].some((f) => f.family.replace(/^["']|["']$/g, '') === family && f.status === 'loaded')) return { family, present: true, via: 'FontFace loaded' };
    const same = width(`"${family}", monospace`) === width('monospace') && width(`"${family}", serif`) === width('serif');
    return { family, present: !same, via: 'metric probe' };
  }), [...new Set(specs.map((s) => s.family))]);
  const failed = [...checks.filter((c) => !c.pass).map((c) => `check('${c.spec}') is false`),
    ...probes.filter((p) => !p.present).map((p) => `"${p.family}" measures like the generic fallbacks (not installed, not web-loaded)`)];
  if (failed.length) return { result: 'FAIL', detail: `${failed.join('; ')} — every frame would be a fallback; bundle the woff2 with @font-face (font-display: block)`, data: { checks, probes } };
  return { result: 'pass', detail: `${checks.length} fontChecks hold (check() + metric probe: ${probes.map((p) => `${p.family} ${p.via}`).join(', ')})`, data: { checks, probes } };
}

const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };
const secs = (t) => `${Number(t).toFixed(2)} s`;

// For diagnosis only (the verdict is byte equality on the pinned build's software raster): how far apart two screenshots are — pixelmatch at the
// engine's shared threshold, plus every pixel that differs at all, the largest channel step and where.
function pixelsApart(a, b) {
  try {
    const x = pngjs.PNG.sync.read(a), y = pngjs.PNG.sync.read(b);
    if (x.width !== y.width || x.height !== y.height) return { text: 'different sizes' };
    const over = pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: PIXELMATCH_THRESHOLD });
    let any = 0, max = 0, box = [Infinity, Infinity, -1, -1];
    for (let i = 0; i < x.data.length; i += 4) {
      const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]), Math.abs(x.data[i + 3] - y.data[i + 3]));
      if (!d) continue;
      const p = i / 4, px = p % x.width, py = (p - px) / x.width;
      any++; max = Math.max(max, d); box = [Math.min(box[0], px), Math.min(box[1], py), Math.max(box[2], px), Math.max(box[3], py)];
    }
    return { over, any, max, box, text: `${over} px over pixelmatch ${PIXELMATCH_THRESHOLD}; ${any} px differ at all, by up to ${max}/255, in [${box.join(', ')}]` };
  } catch (e) { return { text: `undecodable (${e.message})` }; }
}

// --------------------------------------------------------------------------------------------------------- check

const GATE_ORDER = ['loads', 'offline', 'fonts', 'pictures', 'tokens', 'lint', 'self-time', 'determinism', 'layout', 'presses', 'clicker', 'frame-time'];
const MEASURING = new Set(['fonts', 'pictures', 'tokens', 'determinism', 'layout', 'presses', 'clicker', 'frame-time']);

async function cmdCheck(args) {
  const L = loadLock(args.lock);
  const piece = resolvePiece(L, args.id);
  const every = num(args, 'every', { def: null, min: 0.01 });
  if (every !== null && piece.kind === 'deck') setup('--every is a film flag (a deck\'s determinism probe is every pose).');
  const json = Boolean(args.json);
  const started = Date.now();
  const gates = new Map();
  let lintFindings = [], exitOverride = null, halted = null;
  const gate = (name, result, detail, data = {}) => { if (!gates.has(name)) gates.set(name, { type: 'gate', name, result, detail, data }); };
  // A measuring gate whose page call throws FAILs with the page's message; every measuring gate after it is SKIP
  // (the piece cannot be measured past a throw), and the run still lists every gate and its RESULT (exit 1).
  const measure = async (name, body) => {
    if (halted) return gate(name, 'SKIP', `not measured: ${halted}`);
    try { await body(); } catch (e) {
      if (e instanceof ExitError) throw e;
      halted = `the piece threw during ${name}`;
      gate(name, 'FAIL', `the page threw: ${pageMessage(e)} — a draw hook or entrance cannot draw this instant`);
    }
  };

  const S = await openPiece(L, piece);
  const meta = S.meta;
  const kind = meta?.kind ?? piece.kind ?? 'film';
  const order = GATE_ORDER.filter((n) => kind === 'deck' || (n !== 'presses' && n !== 'clicker'));
  try {
    const { motionError, errors } = S.loaded;
    gate('loads', motionError === null && !errors.length ? 'pass' : 'FAIL',
      motionError !== null ? `the piece did not load: ${motionError}` : errors.length ? `page errors: ${[...new Set(errors)].join(' | ')}` : `${kind} ready in tool mode (${meta.W}×${meta.H} at ${meta.fps} fps, ${meta.frames} frames, ${secs(meta.duration)})`,
      { motionError, errors });
    if (motionError !== null) halted = 'the piece did not load';
    else {
      const font = await fontGate(S.page, L.lock);
      gate('fonts', font.result, font.detail, font.data);
      if (font.result === 'FAIL') { exitOverride = EXIT.FONT_PARITY; halted = 'the fonts gate failed, so every frame would be a fallback'; }
    }
    if (!halted) {
      gate('pictures', meta.picturesMissing.length ? 'FAIL' : 'pass',
        meta.picturesMissing.length ? `${meta.picturesMissing.length} picture(s) did not decode: ${meta.picturesMissing.map((u) => oneLine(u, 120)).join(', ')}` : 'every <img> decoded', { missing: meta.picturesMissing });
      await measure('tokens', tokensGate);
    }
    if (exitOverride !== EXIT.FONT_PARITY) {
      lintGate();
      if (exitOverride === EXIT.SETUP) halted = 'the lint gate crashed';
      else selfTimeGate();
    }
    let shots = null;
    S.net.setPhase('determinism');
    await measure('determinism', async () => { shots = await determinismGate(); });
    S.net.setPhase('layout');
    await measure('layout', layoutGate);
    if (kind === 'deck') {
      await measure('presses', async () => pressesGate(shots));
      S.net.setPhase('clicker');
      let stats = {};
      await measure('clicker', async () => { stats = await clickerGate(); });
      S.net.setPhase('frame-time');
      await measure('frame-time', async () => deckFrameTime(stats));
    } else {
      S.net.setPhase('frame-time');
      await measure('frame-time', filmFrameTime);
    }
    S.net.setPhase('after the last screenshot');
    await offlineGate();
    for (const n of order) if (!gates.has(n)) gate(n, 'SKIP', `not measured: ${halted ?? 'not reached'}`);
    return finish();
  } finally {
    await S.browser.close().catch(() => {});
  }

  // ---- gate bodies (closures over S, meta, gate) ----

  // A piece must travel: decided after the page has gone quiet, and backed by a static read of the piece's own source.
  async function offlineGate() {
    const quiet = await S.net.settle(S.context);
    const scan = scanAbsoluteUrls(piece.dir, L.allowHosts);
    const seen = S.net.violations(), allowed = [...S.net.records.values()].filter((r) => r.allowed);
    const how = (r) => `${r.url} (${r.host ?? 'file'}, ${r.resourceType}, ${r.blocked ? 'blocked' : 'refused after the fact'}, during ${r.phase})`;
    const observed = seen.length ? `observed ${seen.length} request(s) leaving the lock's tree: ${seen.map(how).join('; ')}`
      : `observed nothing leaving the lock's tree${allowed.length ? ` (${allowed.length} to render.allowHosts: ${[...new Set(allowed.map((r) => r.host))].join(', ')})` : ''}`;
    const settled = `settled ${quiet.waitedMs} ms after the last screenshot (two frames, every animation and transition finished, then ${IDLE_MS} ms with nothing in flight${quiet.animating ? `; ${quiet.animating} animation(s) still running at the ${SETTLE_CAP_MS} ms cap` : ''}${quiet.pending ? `; ${quiet.pending} request(s) still pending at the cap` : ''})`;
    const scanned = scan.hits.length ? `scanned ${scan.files} source file(s) of the piece: ${scan.hits.length} absolute URL(s) to a host not in render.allowHosts — ${scan.hits.map((h) => `${h.file}:${h.line} ${h.url}`).join('; ')}`
      : `scanned ${scan.files} source file(s) of the piece: no absolute URL to a host outside render.allowHosts`;
    const bad = seen.length || scan.hits.length;
    gate('offline', bad ? 'FAIL' : 'pass', `${observed}; ${settled}; ${scanned}${bad ? ' — bundle the file under the lock (a piece must travel), or add the host to lock.render.allowHosts' : ''} (limit: ${OFFLINE_LIMIT})`,
      { requests: [...S.net.records.values()].map(({ seen: _, ...r }) => r), settle: quiet, scan, limit: OFFLINE_LIMIT });
  }

  async function tokensGate() {
    const declared = L.lock.tokens?.motion ?? {};
    const durations = Object.entries(declared.durationsMs ?? {}), easings = Object.entries(declared.easings ?? {});
    const enforced = durations.length + easings.length > 0;
    const m = meta.motion;
    const ms = (s) => `${+(Number(s) * 1000).toPrecision(12)}ms`;
    const want = (role) => (role.startsWith('ease.') ? (easings.map(([k]) => k).join(', ') || 'none declared') : (durations.map(([k, v]) => `${k} ${v}ms`).join(', ') || 'none declared'));
    // `source: 'token'` only means "read from a custom property" — a piece can declare --motion-standard itself
    // in its own :root. Each role read from a property is held against the LOCK's value of the same name.
    // an easing compared as written, but with every number in its plain form (`.2` and `0.20` are `0.2`)
    const flat = (v) => String(v).replace(/\s+/g, '').toLowerCase().replace(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g, (n) => String(Number(n)));
    const forged = Object.entries(m.resolved).filter(([, r]) => r.source === 'token').flatMap(([role, r]) => {
      const isEase = role.startsWith('ease.');
      const lockValue = isEase ? declared.easings?.[r.name] : declared.durationsMs?.[r.name];
      const shown = isEase ? oneLine(r.value, 80) : ms(r.value);
      if (lockValue === undefined) return [`role ${role} → "${oneLine(r.name, 40)}": ${r.prop} is set on the page (${shown}) but the lock has no tokens.motion.${isEase ? 'easings' : 'durationsMs'}.${oneLine(r.name, 40)} — declare it in the lock, not in the piece`];
      const same = isEase ? flat(lockValue) === flat(r.value) : Math.abs(Number(r.value) * 1000 - lockValue) < 1e-6;
      return same ? [] : [`role ${role} → "${r.name}": the page resolves ${r.prop} to ${shown} but the lock says ${isEase ? lockValue : `${lockValue}ms`} — something overrides the lock's variable (a piece's own :root, a stale tokens.css)`];
    });
    const problems = [
      ...forged,
      ...m.unresolved.map((role) => `role ${role} → ${m.resolved[role]?.name ? `"${oneLine(m.resolved[role].name, 40)}" (${m.resolved[role].prop} is not set or unreadable)` : 'no token named'}; kit default ${m.resolved[role]?.value} in use — name one of: ${want(role)}`),
      ...m.literals.map((l) => {
        const v = Number(l.value) * 1000;
        const near = durations.length ? durations.reduce((a, b) => (Math.abs(b[1] - v) < Math.abs(a[1] - v) ? b : a)) : null;
        return `literal ${oneLine(l.attr, 20)}="${oneLine(l.value, 20)}" on ${oneLine(l.fx, 20)} "${oneLine(l.text, 60)}" (scene ${oneLine(l.scene, 40)}) — drop it so the enter role times it${near ? `, or the nearest token is --motion-${near[0]} (${near[1]}ms)` : ''}`;
      }),
    ];
    const colours = await S.page.evaluate((k) => {
      const cs = getComputedStyle(document.documentElement), set = (v) => cs.getPropertyValue(v).trim() !== '';
      const out = [];
      const wipe = k === 'deck' ? !!document.getElementById('motion-wipe') : window.__motion.meta.scenes.some((s) => s.cut === 'wipe');
      if (wipe && !set('--motion-wipe-color')) out.push('--motion-wipe-color is unset: the wipe plate is transparent');
      if (k === 'deck' && !set('--motion-blank-color')) out.push('--motion-blank-color is unset: the blank screen and the letterbox are transparent');
      if (document.querySelector('[data-fx="block"]') && !set('--motion-block-color') && !set('--motion-wipe-color')) out.push('--motion-block-color (or --motion-wipe-color) is unset: the block plate is transparent');
      return out;
    }, kind);
    const colourNote = colours.length ? ` · colours: ${colours.join('; ')} (map it to a colour role in the ROLE MAP)` : '';
    const data = { enforced, resolved: m.resolved, unresolved: m.unresolved, literals: m.literals, mismatched: forged, colours };
    if (problems.length && enforced) gate('tokens', 'FAIL', `${problems.join(' · ')}${colourNote}`, data);
    // a lock without tokens.motion has nothing to hold the piece to: never "pass", always SKIP with what was found
    else if (!enforced) gate('tokens', 'SKIP', `not enforced — the lock declares no tokens.motion${problems.length ? `; listed: ${problems.join(' · ')}` : ''}${colourNote}`, data);
    else gate('tokens', colours.length ? 'WARN' : 'pass', `${Object.keys(m.resolved).length} motion roles resolved from lock tokens, no literal durations${colourNote}`, data);
  }

  function lintGate() {
    // MOTION_LINT is the test seam (see the header): another lint script, so the crash path can be proved
    // without touching the real one. When set, the gate says so on its line.
    const seam = process.env.MOTION_LINT ? path.resolve(process.env.MOTION_LINT) : null;
    const lint = seam ?? path.join(ENGINE, 'scripts', 'adherence-lint.mjs');
    const via = seam ? ` [lint: ${seam} — MOTION_LINT test seam, not the engine's gate]` : '';
    // runChild semantics (verify.mjs): a timeout or a signal is a crash, never a verdict
    const res = spawnSync(process.execPath, [lint, '--lock', L.lockPath, '--src', piece.dir, '--json'], { encoding: 'utf8', timeout: LINT_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 });
    const crashed = (why) => { exitOverride = EXIT.SETUP; gate('lint', 'FAIL', `lint crashed: ${why} — no verdict (never read as clean)${via}`, { stderr: oneLine(res.stderr, 400) }); };
    if (res.error) return crashed(res.error.code === 'ETIMEDOUT' ? `timed out after ${LINT_TIMEOUT_MS / 1000} s` : res.error.message);
    if (res.status === null) return crashed(`killed by ${res.signal}`);
    if (res.status === 2) return crashed(`adherence-lint exited 2: ${oneLine(res.stderr, 300)}`);
    let rows;
    try { rows = res.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return crashed('its --json output is not NDJSON'); }
    const summary = rows.at(-1);
    const findings = rows.filter((r) => r.type === 'finding');
    if (summary?.type !== 'summary' || rows.slice(0, -1).some((r) => r.type !== 'finding')) return crashed('its output is not finding lines ending in one summary line');
    // the verdict is read from the finding lines and must agree with the summary AND the exit code (all three)
    const count = (lvl) => findings.filter((f) => f.level === lvl).length;
    const disagree = ['errors:ERROR', 'warns:WARN', 'skips:SKIP'].filter((p) => { const [k, lvl] = p.split(':'); return summary[k] !== count(lvl); });
    if (disagree.length || (count('ERROR') > 0) !== (res.status === 1) || ![0, 1].includes(res.status)) {
      return crashed(`its summary (${summary.errors} error(s), ${summary.warns} warning(s), ${summary.skips} skipped, exit ${res.status}) disagrees with its finding lines (${count('ERROR')}, ${count('WARN')}, ${count('SKIP')})`);
    }
    // A film is not a product flow; disclosure presence across "all scanned html" is a screens property
    const dropped = findings.filter((f) => f.section === 'disclosure-presence' && f.file === '(all scanned html)');
    lintFindings = findings.filter((f) => !dropped.includes(f));
    const errs = lintFindings.filter((f) => f.level === 'ERROR'), warns = lintFindings.filter((f) => f.level === 'WARN');
    const show = (f) => `${oneLine(f.section, 40)} ${oneLine(f.file, 120)}${f.line ? `:${f.line}` : ''} ${oneLine(f.detail, 120)}${f.suggestion ? ` → ${oneLine(f.suggestion, 80)}` : ''}`;
    gate('lint', errs.length ? 'FAIL' : 'pass',
      errs.length ? `${errs.length} error(s): ${errs.slice(0, 6).map(show).join(' · ')}${errs.length > 6 ? ` · and ${errs.length - 6} more (--json lists every finding)` : ''}${via}`
        : `adherence-lint clean on ${summary.files} file(s)${warns.length ? `, ${warns.length} warning(s): ${[...new Set(warns.map((f) => oneLine(f.section, 40)))].join(', ')}` : ''}${via}`,
      { errors: errs.length, warns: warns.length, dropped: dropped.length });
    if (dropped.length) gate('disclosure-presence', 'SKIP', `disclosure presence not evaluated for a motion piece (flows belong to screens; the content-lock still applies) — ${dropped.length} finding(s) set aside`, { dropped: dropped.length });
  }

  // Frozen under the harness, free when played live — so a tool render reproduces while the talk may not.
  function selfTimeGate() {
    const RE = /\b(Date\.now|new\s+Date|Math\.random|setTimeout|setInterval|requestAnimationFrame|performance\.now)\b/g;
    const hits = [];
    for (const f of pieceSources(piece.dir, /\.(m?js|html?)$/i)) {
      codeOf(f, fs.readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(RE)) hits.push(`${path.relative(piece.dir, f)}:${i + 1} ${m[1]}`);
      });
    }
    gate('self-time', hits.length ? 'WARN' : 'pass',
      hits.length ? `the piece reads the clock or a timer: ${hits.join(', ')} — the harness freezes these, so tool renders reproduce, but live playback may differ; draw from t (or the clock's idle seconds) instead`
        : 'no clock, timer or random read in the piece\'s own source', { hits });
  }

  // Every sample drawn three ways — in order, backwards, and each right after the last frame — and the
  // PNG bytes compared. Returns the in-order shots (the presses gate reads them).
  async function determinismGate() {
    const film = kind === 'film';
    const samples = film
      ? [...new Set([...meta.scenes.flatMap((s) => [s.start + 0.4, (s.start + s.end) / 2, s.rest]),
        ...(every ? Array.from({ length: Math.ceil(meta.duration / every) }, (_, k) => k * every) : [])]
        .map((t) => Math.min(meta.frames - 1, Math.max(0, Math.round(t * meta.fps)))))].sort((a, b) => a - b)
      : meta.stops.map((_, i) => i);
    const draw = film ? (n) => drawFrame(S.page, n) : (i) => drawPose(S.page, i);
    const name = film ? (n) => secs(n / meta.fps) : (i) => `pose ${i}`;
    const end = film ? meta.frames - 1 : meta.stops.length - 1;
    const take = async (p) => { await draw(p); return png(S.page); };
    const reference = [];
    for (const p of samples) reference.push(await take(p));
    const unstable = [];
    const compare = async (k, after) => {
      const again = await take(samples[k]);
      if (!again.equals(reference[k]) && !unstable.some((u) => u.k === k)) unstable.push({ k, after, apart: pixelsApart(reference[k], again) });
    };
    for (let k = samples.length - 1; k >= 0; k--) await compare(k, 'drawn backwards');
    for (let k = 0; k < samples.length; k++) { await draw(end); await compare(k, 'drawn right after the last frame'); }
    const what = film ? `${samples.length} frames (start+0.4 s, midpoint and rest of every scene${every ? `, every ${every} s` : ''})` : `${samples.length} poses`;
    gate('determinism', unstable.length ? 'FAIL' : 'pass',
      unstable.length ? `${unstable.length} of ${samples.length} sample(s) unstable, the worst first: ${[...unstable].sort((x, y) => (y.apart.over ?? 0) - (x.apart.over ?? 0) || x.k - y.k).slice(0, 6).map((u) => `${name(samples[u.k])} came out different when ${u.after} (${u.apart.text})`).join('; ')}${unstable.length > 6 ? `; and ${unstable.length - 6} more (--json lists them)` : ''} — the picture at that instant depends on what was drawn before it: look for a CSS transition or animation, a timer, a playing video, or state a draw hook keeps between calls`
        : `${what} byte-identical in three orders (forward, reverse, after a jump to the end)`,
      { samples, unstable: unstable.map((u) => ({ sample: samples[u.k], after: u.after, ...u.apart })) });
    return reference;
  }

  async function layoutGate() {
    const problems = [];
    const rests = kind === 'film' ? meta.scenes.map((s) => [() => drawAt(S.page, s.rest), `${s.id} rest ${secs(s.rest)}`]) : meta.stops.map((s, i) => [() => drawPose(S.page, i), `pose ${i}`]);
    for (const [draw, where] of rests) {
      await draw();
      for (const p of await S.page.evaluate(() => window.__motion.audit())) problems.push({ ...p, where: oneLine(where, 60), what: oneLine(p.what, 120) });
    }
    const out = problems.filter((p) => p.kind === 'outside'), over = problems.filter((p) => p.kind === 'overlap');
    gate('layout', out.length ? 'FAIL' : over.length ? 'WARN' : 'pass',
      [out.length && `outside the ${meta.margin}px margin: ${out.map((p) => `${p.where}: ${p.what} at [${p.box.join(', ')}]`).join('; ')}`,
        over.length && `overlaps: ${over.map((p) => `${p.where}: ${p.what} by ${p.by.join('×')}px (meant? data-over)`).join('; ')}`].filter(Boolean).join(' · ')
        || `${rests.length} rest pose(s) audited: everything inside the ${meta.margin}px margin, no overlap`, { problems });
  }

  function pressesGate(shots) {
    if (!shots) return gate('presses', 'SKIP', 'not measured: no pose shots (the determinism gate did not run)');
    const same = [];
    for (let i = 1; i < shots.length; i++) if (shots[i].equals(shots[i - 1])) same.push(`${i - 1}→${i}`);
    gate('presses', same.length ? 'WARN' : 'pass',
      same.length ? `press(es) that change nothing on screen: pose ${same.join(', ')} (byte-identical) — give the press something to show, or merge it` : `${shots.length - 1} presses, each changes the picture`, { same });
  }

  // The clicker, live (no ?tool), driven by the keys a presenter's clicker sends. Each promise a speaker relies on is
  // checked in turn; a broken one is named with what happened instead.
  async function clickerGate() {
    const page = await S.context.newPage();   // left open: the offline settle watches it too
    const first = await load(page, pathToFileURL(piece.index).href, { live: true });
    if (first.motionError !== null) { gate('clicker', 'FAIL', `live mode did not start: ${first.motionError}`); return {}; }
    const N = meta.stops.length, problems = [];
    const where = () => page.evaluate(() => window.__motion.state());
    const rested = async () => { await page.waitForFunction(() => !window.__motion.state().moving, null, { timeout: 60000, polling: 20 }); return (await where()).target; };
    // a press is acted on when the page says so: the clock is moving, or its target changed (a press that changes
    // nothing — next at the last pose — is let go after a short wait, then the outcome is read as it stands)
    const press = async (key) => {
      const before = (await where()).target;
      await page.keyboard.press(key);
      await page.waitForFunction((b) => { const s = window.__motion.state(); return s.moving || s.target !== b; }, before, { timeout: 1500, polling: 10 }).catch(() => {});
    };
    const addressShows = (n) => page.waitForFunction((x) => location.hash === `#${x}`, n, { timeout: 3000 }).then(() => true, () => false);

    // 1. next, pressed once per rest, visits every pose in order and stops at the last
    const from = (await where()).target, landings = [];
    for (let k = from + 1; k < N; k++) { await press('PageDown'); landings.push(await rested()); }
    const wrong = landings.findIndex((pose, k) => pose !== from + 1 + k);
    if (wrong >= 0) problems.push(`next pressed ${wrong + 1} time(s) from pose ${from} rested on pose ${landings[wrong]}, not ${from + 1 + wrong}`);
    await press('PageDown');
    const beyond = await rested();
    if (beyond !== N - 1) problems.push(`next at the last pose went on to pose ${beyond}; it must stay on ${N - 1}`);
    const stats = await page.evaluate(() => window.__motion.stats());
    // 2. the address names the pose, and a reload comes back to it
    if (!(await addressShows(N - 1))) problems.push(`at pose ${N - 1} the address reads "${oneLine(await page.evaluate(() => location.hash), 20) || '(no hash)'}"`);
    if (N >= 2) {
      await press('PageUp');
      const k = await rested();
      if (!(await addressShows(k))) problems.push(`stepping back to pose ${k} left the address without #${k}`);
      else {
        await page.reload();
        await page.waitForFunction(() => document.documentElement.hasAttribute('data-motion-live') || document.documentElement.hasAttribute('data-motion-error'), null, { timeout: READY_TIMEOUT_MS });
        const back = (await where()).target;
        if (back !== k) problems.push(`reloading at #${k} reopened pose ${back}`);
      }
    }
    // 3. a burst of presses from the first pose finishes beats, it never skips a rest
    await press('Home');
    await rested();
    for (let i = 0; i < 4; i++) await page.keyboard.press('PageDown');
    await page.waitForFunction(() => { const s = window.__motion.state(); return s.moving || s.target !== 0; }, null, { timeout: 1500, polling: 10 }).catch(() => {});
    const burst = await rested();
    if (burst !== Math.min(1, N - 1)) problems.push(`four quick presses from pose 0 rested on pose ${burst}; each press only hurries the beat under way, so they must rest on pose 1`);
    // 4. back pressed while a beat plays returns to the pose that beat left
    if (burst < N - 1) {
      await press('PageDown');
      // "during" means the picture has left the pose: at the beat's very first instant the clock still sits on it
      await page.waitForFunction((t0) => { const s = window.__motion.state(); return !s.moving || s.t > t0 + 1e-3; }, meta.stops[burst].t, { timeout: 1500, polling: 10 }).catch(() => {});
      const mid = await where();
      await page.keyboard.press('PageUp');
      await page.waitForFunction((b) => window.__motion.state().target !== b || !window.__motion.state().moving, mid.target, { timeout: 1500, polling: 10 }).catch(() => {});
      const returned = await rested();
      if (returned !== burst) problems.push(`back pressed mid-beat rested on pose ${returned}; it must return to pose ${burst}, where the beat began${mid.moving ? '' : ' (the beat had already ended)'}`);
    }
    if (first.errors.length) problems.push(`the live page threw: ${[...new Set(first.errors)].join(' | ')}`);   // the listener keeps collecting
    gate('clicker', problems.length ? 'FAIL' : 'pass', problems.length ? problems.join('; ') : `live: next walks ${N - 1} presses in order, a burst skips none, back returns, the hash follows and a reload returns to it`, { landings, problems });
    return stats;
  }

  function deckFrameTime(stats) {
    const budget = num(args, 'budget-ms', { def: 34, min: 1 });
    const all = Object.values(stats).flatMap((v) => v.gaps ?? []);
    if (!all.length) return gate('frame-time', 'SKIP', 'no beat timings recorded in the live run (advisory gate)');
    const slow = Object.entries(stats).map(([i, v]) => ({ i, p95: pct(v.gaps, 0.95), n: v.gaps.length })).filter((b) => b.n >= 5 && b.p95 > budget);
    gate('frame-time', slow.length ? 'WARN' : 'pass',
      `on this machine a live frame takes ${pct(all, 0.5).toFixed(0)} ms (median), p95 ${pct(all, 0.95).toFixed(0)} ms${slow.length ? `; beats over ${budget} ms: ${slow.map((b) => `to pose ${b.i} p95 ${b.p95.toFixed(0)} ms`).join(', ')}` : ''} (advisory: it measures this machine, not the piece)`,
      { medianMs: pct(all, 0.5), p95Ms: pct(all, 0.95), budgetMs: budget });
  }

  async function filmFrameTime() {
    const budget = num(args, 'budget-ms', { def: 400, min: 1 });
    const step = Math.max(1, Math.floor(meta.frames / 60)), times = [];
    for (let n = 0; n < meta.frames && times.length < 60; n += step) {
      const t0 = performance.now();
      await drawFrame(S.page, n);
      await png(S.page);
      times.push(performance.now() - t0);
    }
    const med = pct(times, 0.5), p95 = pct(times, 0.95);
    gate('frame-time', p95 > budget ? 'WARN' : 'pass',
      `a frame draws and shoots in ${med.toFixed(0)} ms (median), p95 ${p95.toFixed(0)} ms over ${times.length} frames — about ${Math.round((meta.frames * med) / 1000)} s to export ${secs(meta.duration)}${p95 > budget ? ` (over the ${budget} ms budget)` : ''} (advisory)`,
      { medianMs: med, p95Ms: p95, budgetMs: budget, sampled: times.length });
  }

  function finish() {
    const ordered = order.flatMap((n) => [gates.get(n), n === 'lint' ? gates.get('disclosure-presence') : null]).filter(Boolean);
    const count = (r) => ordered.filter((g) => g.result === r).length;
    const errors = count('FAIL'), warns = count('WARN'), skips = count('SKIP');
    const result = errors ? 'FAIL' : 'PASS';
    const code = exitOverride ?? (errors ? EXIT.FINDING : EXIT.PASS);
    const m = meta ?? {};
    if (json) {
      for (const g of ordered) {
        console.log(ndjson(g));
        if (g.name === 'lint') for (const f of lintFindings) console.log(ndjson(f));
      }
      console.log(ndjson({ type: 'summary', kind, id: piece.id, result, errors, warns, skips, exit: code,
        gates: Object.fromEntries(ordered.map((g) => [g.name, g.result])), frames: m.frames ?? null, duration: m.duration ?? null,
        W: m.W ?? null, H: m.H ?? null, fps: m.fps ?? null }));
    } else {
      console.log(`motion check — ${kind} "${piece.id}" (${path.relative(process.cwd(), piece.dir) || '.'})`);
      // every detail can carry page text; one more pass makes sure no line of the report can be forged
      for (const g of ordered) console.log(`${g.result.padEnd(4)}  ${g.name}: ${oneLine(g.detail, 4000)}`);
      console.log(`\n${meta ? `${kind} "${piece.id}": ${meta.W}×${meta.H} at ${meta.fps} fps, ${meta.frames} frames, ${secs(meta.duration)}; ` : ''}checked in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      console.log(`RESULT: ${result} — ${errors} error(s), ${warns} warning(s), ${skips} skipped (exit ${code})`);
    }
    return code;
  }
}

// ----------------------------------------------------------------------------------------------- shared refusals

// Export and stills draw what the browser shows; a piece that did not load, in a fallback font or with a picture
// missing would be photographed as a lie. Returns the blocking reasons (empty = fine).
async function blockers(S, lock) {
  if (S.loaded.motionError !== null) return [{ code: EXIT.FINDING, why: `the piece did not load: ${S.loaded.motionError}` }];
  const out = [];
  if (S.loaded.errors.length) out.push({ code: EXIT.FINDING, why: `page errors: ${[...new Set(S.loaded.errors)].join(' | ')}` });
  const font = await fontGate(S.page, lock);
  if (font.result === 'FAIL') out.push({ code: EXIT.FONT_PARITY, why: `fonts: ${font.detail}` });
  if (S.meta.picturesMissing.length) out.push({ code: EXIT.FINDING, why: `pictures missing: ${S.meta.picturesMissing.map((u) => oneLine(u, 120)).join(', ')}` });
  return out;
}

// -------------------------------------------------------------------------------------------------------- stills

const two = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A contact sheet: the stills as data: URLs on one page, photographed as one JPEG (85).
async function contactSheets(browser, items, dir, { cols, W, H }) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cw = cols >= 6 ? 320 : 480, ch = Math.round((cw * H) / W), lab = 30, per = cols * 3, files = [];
  const page = await browser.newPage();
  try {
    for (let n = 0; n * per < items.length; n++) {
      const part = items.slice(n * per, n * per + per);
      await page.setViewportSize({ width: cw * cols, height: Math.ceil(part.length / cols) * (ch + lab) });
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${cw}px);font:600 16px/${lab}px system-ui,sans-serif;color:#fff}figure{margin:0}img{display:block;width:${cw}px;height:${ch}px}figcaption{height:${lab}px;padding:0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>` +
        part.map((i) => `<figure><img src="data:image/jpeg;base64,${fs.readFileSync(i.file).toString('base64')}"><figcaption>${esc(i.label)}</figcaption></figure>`).join(''));
      await page.waitForFunction(() => [...document.images].every((i) => i.complete));
      const file = path.join(dir, `sheet-${n + 1}.jpg`);
      fs.writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 85 }));
      files.push(file);
    }
  } finally { await page.close(); }
  return files;
}

async function cmdStills(args) {
  const L = loadLock(args.lock);
  const piece = resolvePiece(L, args.id);
  if (piece.kind === 'film' && (args.only !== undefined || args.idle !== undefined)) setup('--only and --idle are deck flags (a film has no poses).');
  if (piece.kind === 'deck' && (args.at !== undefined || args.every !== undefined)) setup('--at / --every are film flags (a deck is photographed by pose: --only, --idle).');
  const S = await openPiece(L, piece);
  try {
    const block = await blockers(S, L.lock);
    if (S.loaded.motionError !== null) fail(EXIT.FINDING, `stills: ${block[0].why}`);
    // A fallback font is refused here as in export (a still in the wrong face is a lie); other blockers are named and the stills still taken
    const fonts = block.find((b) => b.code === EXIT.FONT_PARITY);
    if (fonts && !args.force) fail(EXIT.FONT_PARITY, `stills refused: ${fonts.why}. Fix it (motion.mjs check names it), or pass --force.`);
    for (const b of block) console.error(`stills note: ${b.code === EXIT.FONT_PARITY ? 'ignoring (--force) ' : ''}${b.why} — these stills are not what the piece should look like`);
    const meta = S.meta, dir = outDir(L, piece.id, 'stills'), items = [];
    const keep = async (name, label) => { const file = path.join(dir, `${name}.jpg`); fs.writeFileSync(file, await jpeg(S.page, 92)); items.push({ file, label }); };
    if (meta.kind === 'film') {
      if (args.at !== undefined) {
        for (const t of list(args.at, 'at')) { await drawAt(S.page, t); await keep(`t-${t}`, `${secs(t)}`); }
      } else if (args.every !== undefined) {
        // a strip: the instants from..to (exclusive) every `step` seconds, each named by its place in the strip
        const step = num(args, 'every', { min: 0.01 }), from = num(args, 'from', { def: 0, min: 0 }), to = Math.min(meta.duration, num(args, 'to', { def: meta.duration, min: 0 }));
        const instants = Array.from({ length: Math.max(0, Math.ceil((to - from) / step - 1e-9)) }, (_, k) => +(from + k * step).toFixed(3));
        for (const [k, t] of instants.entries()) { await drawAt(S.page, t); await keep(`strip-${String(k).padStart(3, '0')}`, `${secs(t)} (strip ${k + 1}/${instants.length})`); }
      } else {
        for (const s of meta.scenes) {
          const move = s.start + Math.min(0.45, s.rest - s.start);
          await drawAt(S.page, move); await keep(`${s.id}-move`, `${secs(move)} · ${oneLine(s.id, 40)} moving`);
          await drawAt(S.page, s.rest); await keep(`${s.id}-rest`, `${secs(s.rest)} · ${oneLine(s.id, 40)} at rest`);
        }
      }
    } else {
      const idle = num(args, 'idle', { def: 0, min: 0 });
      const only = args.only !== undefined ? list(args.only, 'only') : null;
      if (only) for (const i of only) if (!meta.stops[i]) setup(`--only ${i}: no such pose (0…${meta.stops.length - 1}).`);
      const poses = meta.stops.map((s, i) => ({ ...s, i })).filter((s) => !only || only.includes(s.i));
      for (const s of poses) { await drawPose(S.page, s.i, idle); await keep(two(s.i), `${s.i} · ${oneLine(s.label, 60)}`); }
      // the handout: three poses a page with what is said over each
      const page = await S.browser.newPage();
      await page.setContent(`<!doctype html><meta charset="utf-8"><title>${esc(meta.title)}</title><style>@page{size:A4;margin:14mm}body{margin:0;font:10.5pt/1.4 system-ui,sans-serif;color:#111}h1{font-size:15pt;margin:0 0 6mm}article{display:grid;grid-template-columns:100mm 1fr;gap:7mm;break-inside:avoid;margin-bottom:7mm}article:nth-of-type(3n){break-after:page}img{width:100mm;border:.3mm solid #999;display:block}b{display:block;font-size:9pt;color:#555;margin-bottom:1.5mm}p{margin:0;white-space:pre-wrap}</style><h1>${esc(meta.title)}</h1>` +
        poses.map((s, k) => `<article><img src="data:image/jpeg;base64,${fs.readFileSync(items[k].file).toString('base64')}"><div><b>${s.i} · ${esc(s.label)}</b><p>${esc(s.notes)}</p></div></article>`).join(''));
      await page.waitForFunction(() => [...document.images].every((i) => i.complete));
      const pdf = path.join(outDir(L, piece.id), 'handout.pdf');
      fs.writeFileSync(pdf, await page.pdf({ format: 'A4', printBackground: true }));
      await page.close();
      console.log(`handout → ${pdf} (${poses.length} poses, three a page)`);
    }
    const cols = meta.kind === 'deck' ? 4 : meta.H > meta.W ? 6 : 4;
    const sheets = await contactSheets(S.browser, items, path.join(outDir(L, piece.id), 'sheets'), { cols, W: meta.W, H: meta.H });
    console.log(`${items.length} stills → ${dir}\n${sheets.length} contact sheet(s) → ${path.dirname(sheets[0] ?? path.join(dir, 'x'))}/sheet-N.jpg`);
    return EXIT.PASS;
  } finally {
    await S.browser.close().catch(() => {});
  }
}

// -------------------------------------------------------------------------------------------------------- export

function findFfmpeg() {
  if (process.env.FFMPEG !== undefined) {
    if (fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
    setup(`FFMPEG is set to "${process.env.FFMPEG}", which does not exist. Point FFMPEG at the ffmpeg executable, or unset it to use PATH. Stills and checks work without ffmpeg.`);
  }
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  for (const d of (process.env.PATH ?? '').split(path.delimiter)) if (d && fs.existsSync(path.join(d, exe))) return path.join(d, exe);
  setup('ffmpeg not found: put it on PATH or set FFMPEG to its executable. Stills and checks work without it.');
}

// The encoder: frames come from an async generator and are streamed into ffmpeg's stdin through a pipeline (which
// owns back-pressure and a broken pipe). However it ends — the encoder exiting early, failing to start, or a frame
// that could not be drawn — the outcome is one value, never an unhandled rejection.
async function encode(ffmpeg, argv, frames) {
  const proc = spawn(ffmpeg, argv, { stdio: ['pipe', 'ignore', 'pipe'] });
  let tail = '';
  proc.stderr.on('data', (d) => { tail = `${tail}${d}`.slice(-1500); });
  const ended = once(proc, 'close').then(([code, signal]) => ({ code, signal }), (e) => ({ code: null, error: e }));
  proc.on('error', () => {});   // reported through `ended`
  let feed = null;
  try { await pipeline(Readable.from(frames), proc.stdin); } catch (e) { feed = e; if (proc.exitCode === null) proc.kill(); }
  const end = await ended;
  return { feed, end, tail: oneLine(tail, 400) };
}

const FFMPEG_VIDEO = (fps, crf, out) => ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-vf', 'format=yuv420p', '-c:v', 'libx264',
  '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  // libx264 writes the colour description into the stream only through its own parameters
  '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709',
  '-r', String(fps), '-an', '-movflags', '+faststart', out];

async function cmdExport(args) {
  const L = loadLock(args.lock);
  const piece = resolvePiece(L, args.id);
  if (args.pack) return pack(L, piece);
  const ffmpeg = findFfmpeg();
  const crf = num(args, 'crf', { def: 16, min: 0, max: 51, integer: true });
  const audio = args.audio ? path.resolve(args.audio) : null;
  if (audio && !fs.existsSync(audio)) setup(`--audio: no file at ${audio}.`);
  if (args.take !== undefined && piece.kind !== 'deck') setup('--take is for decks (a recorded clicker take).');
  const take = args.take === undefined ? null : readTake(L, piece, args.take);
  const S = await openPiece(L, piece);
  try {
    const block = await blockers(S, L.lock);
    if (block.length && !args.force) {
      fail(block.some((b) => b.code === EXIT.FONT_PARITY) ? EXIT.FONT_PARITY : EXIT.FINDING, `export refused: ${block.map((b) => b.why).join('; ')}. Fix it (motion.mjs check names it), or pass --force.`);
    }
    for (const b of block) console.error(`export --force: ignoring ${b.why}`);
    const meta = S.meta, fps = meta.fps;
    let length = { frames: meta.frames, duration: meta.duration };
    if (meta.kind === 'deck') {
      if (take) takeDrift(take, meta.stops);
      length = await S.page.evaluate((t) => window.__motion.film(t), take?.body ?? null);
    }
    const first = Math.round(num(args, 'from', { def: 0, min: 0 }) * fps);
    const last = Math.min(length.frames, Math.round(num(args, 'to', { def: length.duration, min: 0 }) * fps));
    if (!(last > first)) setup(`nothing to export between --from and --to (frames ${first}…${last} of ${length.frames}).`);
    const partial = first > 0 || last < length.frames;
    const out = path.resolve(args.out ?? path.join(outDir(L, piece.id), `${piece.id}${take ? `.take-${take.stamp}` : ''}${partial ? `.f${first}-${last}` : ''}.mp4`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const voice = take?.voice && !partial ? take.voice : null;
    const sound = audio ?? voice;
    // with a sound to lay under it, the picture is encoded beside the output, under a name no extension can collide with
    const video = sound ? path.join(path.dirname(out), `${path.basename(out, path.extname(out))}.video-only.mp4`) : out;
    const total = last - first, t0 = Date.now();
    let drawn = 0, drawFault = null;
    async function* frames() {
      for (let n = first; n < last; n++) {
        try { await drawFrame(S.page, n); } catch (e) { drawFault = `frame ${n} (${secs(n / fps)}) could not be drawn: ${pageMessage(e)}`; throw e; }
        yield await png(S.page);
        drawn++;
        if (drawn % 30 === 0 || drawn === total) {
          const each = (Date.now() - t0) / drawn;
          process.stderr.write(`export: frame ${drawn} of ${total} (${Math.round((100 * drawn) / total)}%), ${Math.round(each)} ms a frame, ~${Math.round(((total - drawn) * each) / 1000)} s to go\n`);
        }
      }
    }
    const run = await encode(ffmpeg, FFMPEG_VIDEO(fps, crf, video), frames());
    if (drawFault) fail(EXIT.FINDING, `export stopped: ${drawFault} — run \`motion.mjs check\`, which names the gate`);
    if (run.feed || run.end.code !== 0) {
      const how = run.end.error ? `could not start (${run.end.error.message})` : run.end.signal ? `was killed by ${run.end.signal}` : `exited ${run.end.code}`;
      fail(EXIT.RENDER, `exit 5 (render failure): the encoder ${ffmpeg} ${how} after ${drawn} of ${total} frame(s)${run.tail ? `: ${run.tail}` : ''}${run.feed && !run.end.code ? ` (${oneLine(run.feed.message, 120)})` : ''}`);
    }
    if (sound) {
      const mux = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', video, '-i', sound, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { encoding: 'utf8' });
      if (mux.error || mux.status !== 0) fail(EXIT.RENDER, `exit 5 (render failure): laying ${sound} under the picture failed: ${oneLine(mux.stderr || mux.error?.message, 300)}`);
    }
    console.log(`wrote ${out}\n  ${total} frame(s), ${(total / fps).toFixed(2)} s of a ${length.duration.toFixed(2)} s ${meta.kind}${take ? ` (take ${take.stamp})` : ''}, ${meta.W}×${meta.H} at ${fps} fps, encoded in ${((Date.now() - t0) / 1000).toFixed(1)} s; ${sound ? `sound: ${sound} (picture alone: ${video})` : 'no sound'}`);
    return EXIT.PASS;
  } finally {
    await S.browser.close().catch(() => {});
  }
}

// A recorded take: `latest` is the newest stamp folder; its voice file, when named and present, is muxed.
function readTake(L, piece, which) {
  const root = path.join(L.lockDir, '.motion', piece.id, 'takes');
  const stamps = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^\d{8}-\d{6}$/.test(d)).sort() : [];
  const stamp = which === 'latest' ? stamps.at(-1) : String(which);
  if (!stamp || !stamps.includes(stamp)) setup(`no take "${which}" under ${root} (record one live with R, served by \`motion.mjs serve\`). Takes here: ${stamps.join(', ') || '(none)'}.`);
  let body;
  try { body = JSON.parse(fs.readFileSync(path.join(root, stamp, 'take.json'), 'utf8')); } catch (e) { setup(`take ${stamp}: take.json is missing or not valid JSON: ${e.message}`); }
  const voiceFile = typeof body.voice === 'string' && /^[\w.-]+$/.test(body.voice) ? path.join(root, stamp, body.voice) : null;
  return { stamp, body, voice: voiceFile && fs.existsSync(voiceFile) ? voiceFile : null };
}
// A take stores the times of the poses it was recorded against; if the deck has moved since, say so (it still plays).
function takeDrift(take, stops) {
  const then = Array.isArray(take.body.stops) ? take.body.stops : [];
  const moved = then.length !== stops.length || then.some((t, i) => Math.abs(t - stops[i].t) > 1e-6);
  if (moved) console.error(`export note: take ${take.stamp} was recorded against ${then.length} pose time(s) and the deck now has ${stops.length} that do not all match; its presses replay as recorded and may rest on different poses.`);
}

// A deck to carry: the lock tree a deck needs (the piece, the kit without vendor/, the lock's assets/, the stills
// the presenter window shows) plus a server. The server is THIS script's serveMotion, copied at pack time from
// its own source (Function.prototype.toString), so the portable copy cannot drift from the engine's.
function pack(L, piece) {
  if (piece.kind !== 'deck') setup('--pack is for decks (a film travels as its MP4: `motion.mjs export`).');
  const dir = path.join(outDir(L, piece.id), 'portable');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(piece.dir, path.join(dir, 'motion', piece.id), { recursive: true });
  fs.cpSync(KIT, path.join(dir, 'kit'), { recursive: true, filter: (s) => !['vendor', 'templates'].includes(path.relative(KIT, s).split(path.sep)[0]) && !s.endsWith('.test.mjs') });
  if (fs.existsSync(path.join(L.lockDir, 'assets'))) fs.cpSync(path.join(L.lockDir, 'assets'), path.join(dir, 'assets'), { recursive: true });
  const stills = path.join(L.lockDir, '.motion', piece.id, 'stills');
  const haveStills = fs.existsSync(stills);
  if (haveStills) fs.cpSync(stills, path.join(dir, '.motion', piece.id, 'stills'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'serve.mjs'), [
    '// Serves this folder for the deck in it: node serve.mjs [--port 5340] [--open]. Needs Node 20+ and a Chromium browser.',
    '// serveMotion below is a verbatim copy of the function in the engine\'s scripts/motion.mjs, made when this folder was packed.',
    "import fs from 'node:fs';", "import path from 'node:path';", "import http from 'node:http';", "import { spawn } from 'node:child_process';",
    "import { fileURLToPath } from 'node:url';", '',
    serveMotion.toString(), '', openUrl.toString(), '',
    "const root = path.dirname(fileURLToPath(import.meta.url)), argv = process.argv.slice(2);",
    "const port = argv.includes('--port') ? Number(argv[argv.indexOf('--port') + 1]) : 5340;",
    "const { server, url } = await serveMotion({ root, kit: path.join(root, 'kit'), port });",
    `const deck = \`\${url}motion/${piece.id}/\`;`,
    "console.log(`Serving ${root}\\n${deck}   (clicker: next, back, blank · F full screen · W presenter window · R record a take)\\nCtrl-C stops.`);",
    "if (argv.includes('--open')) openUrl(deck);",
    "process.on('SIGINT', () => { server.closeAllConnections?.(); server.close(() => process.exit(0)); });", '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'start.sh'), '#!/bin/sh\ncd "$(dirname "$0")" && node serve.mjs --open\n', { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'start.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nnode serve.mjs --open\r\n');
  fs.writeFileSync(path.join(dir, 'README.txt'), `${piece.id}\n\nA clicker deck that runs offline. Needs Node 20 or later and a Chromium-based browser.\nStart: ./start.sh (macOS, Linux) or start.cmd (Windows); it serves this folder on this machine only (the loopback address) and opens the deck.\n\nClicker: next, back, blank. On the laptop: F full screen, W presenter window, R record a take, Home and End.\nRecorded takes land in .motion/${piece.id}/takes/. Packed by motion.mjs (scripts/motion.mjs in the engine); serve.mjs carries a copy of its server.\n`);
  console.log(`packed → ${dir}\n  motion/${piece.id}/  kit/ (no vendor/, templates/, tests)  assets/  ${haveStills ? `.motion/${piece.id}/stills/` : '(no stills: run `motion.mjs stills` first so the presenter window shows the next pose, then pack again)'}\n  serve.mjs  start.sh  start.cmd  README.txt`);
  return EXIT.PASS;
}

// --------------------------------------------------------------------------------------------------------- serve

// Self-contained on purpose (only fs, path, http from its module): pack copies its source into a portable folder.
// Serves `root` read-only on the loopback address, with /kit/* from `kit`. Requests are answered by a short chain:
// the request must name this server as its host; a POST may only file a take for a deck; anything else is a GET for
// a file whose real path stays inside its base. Range requests (media) and no-store throughout. The one host spelled
// out below is the IPv4 loopback, so nothing beyond this machine can reach the server or file a take.
function serveMotion({ root, kit, port = 5340, host = '127.0.0.1' }) {
  const kinds = {
    'text/html; charset=utf-8': ['.html', '.htm'], 'text/plain; charset=utf-8': ['.txt'], 'text/css': ['.css'],
    'text/javascript': ['.js', '.mjs'], 'application/json': ['.json'], 'application/pdf': ['.pdf'], 'application/wasm': ['.wasm'],
    'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'], 'image/avif': ['.avif'], 'image/gif': ['.gif'], 'image/svg+xml': ['.svg'],
    'font/woff2': ['.woff2'], 'font/woff': ['.woff'], 'font/ttf': ['.ttf'], 'font/otf': ['.otf'],
    'video/mp4': ['.mp4'], 'video/webm': ['.webm'], 'audio/mpeg': ['.mp3'], 'audio/wav': ['.wav'], 'audio/mp4': ['.m4a'],
  };
  const typeOf = (file) => Object.keys(kinds).find((t) => kinds[t].includes(path.extname(file).toLowerCase())) ?? 'application/octet-stream';
  const TAKE_FILES = { 'take.json': 2e6, 'voice.webm': 300e6 };
  const html = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const base = fs.realpathSync(root);
  const kitBase = kit && fs.existsSync(kit) ? fs.realpathSync(kit) : null;
  const decks = () => {
    const dir = path.join(base, 'motion');
    return !fs.existsSync(dir) ? [] : fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'index.html'))).map((id) => {
      let src = '';
      try { src = fs.readFileSync(path.join(dir, id, 'piece.js'), 'utf8'); } catch { /* kind unknown */ }
      return { id, kind: /\/deck\.js['"]/.test(src) ? 'deck' : 'film' };
    });
  };
  let self = null;   // "<host>:<port>" once listening — the only Host this server answers
  const reply = (res, status, headers = {}, body = '') => { res.writeHead(status, { 'cache-control': 'no-store', ...headers }); res.end(body); };

  // a path inside `b`, by its real location (a symlink inside the lock that leads out is refused)
  const inside = (b, rel) => {
    const lexical = path.resolve(b, `.${rel}`);
    if (lexical !== b && !lexical.startsWith(b + path.sep)) return { refused: true };
    if (!fs.existsSync(lexical)) return { missing: true };
    const real = fs.realpathSync(lexical);
    return real === b || real.startsWith(b + path.sep) ? { file: real } : { refused: true };
  };
  // bytes=a-b | bytes=a- | bytes=-n  →  [start, end] inclusive, null when absent, 'bad' when it cannot be served
  const rangeOf = (header, size) => {
    const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
    if (!m || (!m[1] && !m[2])) return null;
    const [start, end] = m[1] ? [Number(m[1]), m[2] ? Math.min(Number(m[2]), size - 1) : size - 1] : [Math.max(0, size - Number(m[2])), size - 1];
    return start <= end && start < size ? [start, end] : 'bad';
  };

  async function fileTake(req, res, parts) {
    const [deck, stamp, name] = parts;
    const known = decks().find((d) => d.id === deck && d.kind === 'deck');
    if (parts.length !== 3 || !known || !/^\d{8}-\d{6}$/.test(stamp) || !(name in TAKE_FILES)) return reply(res, 404);
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== `http://${self}`) return reply(res, 403, {}, 'cross-origin take refused');
    // the body is read to its end either way (so the client gets an answer, not a reset), kept only while under the cap
    const body = await new Promise((done) => {
      const kept = [];
      let bytes = 0;
      req.on('data', (chunk) => { bytes += chunk.length; if (bytes <= TAKE_FILES[name]) kept.push(chunk); });
      req.on('end', () => done(bytes > TAKE_FILES[name] ? null : { data: Buffer.concat(kept), bytes }));
      req.on('error', () => done(null));
    });
    if (!body) return reply(res, 413, { connection: 'close' });
    const { data, bytes } = body;
    const dir = path.join(base, '.motion', deck, 'takes', stamp);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), data);
    return reply(res, 201, { 'content-type': 'application/json' }, JSON.stringify({ saved: `.motion/${deck}/takes/${stamp}/${name}`, bytes }));
  }

  function index(res) {
    const rows = decks().map(({ id, kind }) => `<li><a href="/motion/${html(id)}/${kind === 'film' ? '?play' : ''}">${html(id)}</a> <small>${kind}${kind === 'deck' ? ` · <a href="/kit/presenter.html?deck=${html(id)}">presenter window</a>` : ''}</small></li>`);
    return reply(res, 200, { 'content-type': typeOf('.html') }, `<!doctype html><meta charset="utf-8"><title>Motion pieces</title><style>body{font:18px/1.5 system-ui,sans-serif;margin:48px}li{margin:8px 0}small{opacity:.6}</style><h1>Motion pieces</h1><ul>${rows.join('') || '<li>None yet: motion.mjs new</li>'}</ul><p>Film: ?play, space pauses, arrows step a second. Deck: clicker next/back/blank · F full screen · W presenter window · R record a take.</p>`);
  }

  function sendFile(req, res, pathname, search) {
    const viaKit = pathname === '/kit' || pathname.startsWith('/kit/');
    if (viaKit && !kitBase) return reply(res, 404);
    let found = viaKit ? inside(kitBase, pathname.slice(4)) : inside(base, pathname);
    if (found.refused) return reply(res, 403);
    if (found.missing) return reply(res, 404);
    if (fs.statSync(found.file).isDirectory()) {
      // a piece's relative URLs (../../kit/…) need the folder form of its address
      if (!pathname.endsWith('/')) return reply(res, 308, { location: `${pathname}/${search}` });
      found = viaKit ? inside(kitBase, `${pathname.slice(4)}index.html`) : inside(base, `${pathname}index.html`);
      if (!found.file) return reply(res, found.refused ? 403 : 404);
    }
    const size = fs.statSync(found.file).size;
    const head = { 'content-type': typeOf(found.file), 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' };
    const range = rangeOf(req.headers.range, size);
    if (range === 'bad') return reply(res, 416, { 'content-range': `bytes */${size}` });
    const [start, end] = range ?? [0, size - 1];
    res.writeHead(range ? 206 : 200, { 'cache-control': 'no-store', ...head, 'content-length': size ? end - start + 1 : 0, ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) });
    if (req.method === 'HEAD' || size === 0) return res.end();
    return fs.createReadStream(found.file, { start, end }).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== self) return reply(res, 421, {}, 'unknown host');
      const url = new URL(req.url, `http://${self}`);
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return reply(res, 400); }
      if (pathname.includes('\0')) return reply(res, 400);
      if (req.method === 'POST') return pathname.startsWith('/__take/') ? fileTake(req, res, pathname.slice(8).split('/')) : reply(res, 404);
      if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, { allow: 'GET, HEAD, POST' });
      if (pathname === '/') return index(res);
      if (pathname === '/favicon.ico') return reply(res, 404);
      return sendFile(req, res, pathname, url.search);
    } catch (e) {
      if (res.headersSent) res.destroy();
      else reply(res, 500, { 'content-type': 'text/plain' }, String(e?.message ?? e));
    }
  });
  return new Promise((ok, no) => {
    const listen = (at, retry) => {
      server.once('error', (e) => (retry && e.code === 'EADDRINUSE' ? listen(0, false) : no(e)));
      server.listen(at, host, () => { self = `${host}:${server.address().port}`; ok({ server, url: `http://${self}/` }); });
    };
    listen(port, port !== 0);
  });
}

function openUrl(target) {
  const [cmd, argv] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', target]] : process.platform === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
  spawn(cmd, argv, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

async function cmdServe(args) {
  const L = loadLock(args.lock);
  const port = num(args, 'port', { def: 5340, min: 0, max: 65535, integer: true });
  // the lock's kit link when there is one, else the engine's kit itself (a fixture has no link)
  const kit = fs.existsSync(path.join(L.lockDir, 'kit')) ? path.join(L.lockDir, 'kit') : KIT;
  const { server, url } = await serveMotion({ root: L.lockDir, kit, port });
  if (server.address().port !== port && port !== 0) console.log(`port ${port} is busy; using ${server.address().port}`);
  const ids = piecesIn(L.lockDir);
  console.log(`serving ${L.lockDir} (read-only; takes → .motion/<deck>/takes/; /kit → ${kit}) at ${url}`);
  for (const id of ids) {
    const kind = kindOf(path.join(L.lockDir, 'motion', id));
    console.log(`  ${url}motion/${id}/${kind === 'film' ? '?play' : ''}${kind === 'deck' ? `   presenter: ${url}kit/presenter.html?deck=${id}` : ''}`);
  }
  console.log('Ctrl-C stops.');
  if (args.open) openUrl(ids.length === 1 ? `${url}motion/${ids[0]}/${kindOf(path.join(L.lockDir, 'motion', ids[0])) === 'film' ? '?play' : ''}` : url);
  await new Promise((resolve) => {
    const stop = () => { server.closeAllConnections?.(); server.close(() => resolve()); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return EXIT.PASS;
}

// ----------------------------------------------------------------------------------------------------------- new

// Roles are --piece-*, so a role can never be the lock variable it maps to (`--accent: var(--accent)` is a cycle).
const ROLE_FILL = [
  { slot: '--REPLACE-ground-slot', from: 'colour', words: ['background', 'ground', 'surface', 'canvas'] },
  { slot: '--REPLACE-ink-slot', from: 'colour', words: ['foreground', 'text', 'ink', 'on-background'] },
  { slot: '--REPLACE-accent-slot', from: 'colour', words: ['primary', 'accent', 'brand'] },
  { slot: '--REPLACE-display-family', from: 'type', words: ['display', 'heading', 'title', 'h1'] },
];

// Exactly one lock name for a role, or none: an exact name wins; else a name holding the word as one of its parts
// ("surface1", "text-primary"). Two candidates on the same tier is ambiguous and the slot stays REPLACE, so the
// css-vars lint keeps failing until the author decides. "on-…" slots are inks, never a ground or an accent.
function pickName(names, { words, slot }) {
  const parts = (n) => n.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().split(/[-_\s]+|(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/);
  const eligible = names.filter((n) => slot === '--REPLACE-ink-slot' || !/^on[-_A-Z]/.test(n));
  const exact = eligible.filter((n) => words.includes(n.toLowerCase()));
  if (exact.length) return exact.length === 1 ? { name: exact[0] } : { ambiguous: exact };
  const loose = eligible.filter((n) => words.some((w) => (w.includes('-') ? n.toLowerCase().includes(w) : parts(n).includes(w))));
  return loose.length === 1 ? { name: loose[0] } : loose.length ? { ambiguous: loose } : { none: true };
}

function cmdNew(args) {
  const L = loadLock(args.lock);
  const kind = args.kind;
  if (kind !== 'film' && kind !== 'deck') setup('--kind must be film or deck.');
  const id = args.id;
  if (!id || !ID_RE.test(id)) setup(`--id "${id ?? ''}" is not a piece id: lower-case letters, digits and hyphens, starting with a letter or digit.`);
  const dir = path.join(L.lockDir, 'motion', id);
  if (fs.existsSync(dir)) setup(`${dir} already exists — pick another id, or edit that piece.`);
  const own = path.join(L.lockDir, 'templates', 'motion', kind), engineTpl = path.join(KIT, 'templates', kind);
  const template = fs.existsSync(own) ? own : fs.existsSync(engineTpl) ? engineTpl : null;
  if (!template) setup(`no ${kind} template: neither ${own} nor ${engineTpl} exists.`);

  // formats: the skill's own formats.json, else the engine scaffold's (same preset ids, the scaffold's sizes)
  const format = args.format ?? (kind === 'film' ? 'social-portrait' : 'slide');
  const notes = [];
  const readFormats = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const lockFormats = readFormats(path.join(L.lockDir, 'formats.json'));
  const scaffoldFormats = readFormats(path.join(ENGINE, 'skill-scaffold', 'capture', 'formats.json'));
  let preset = lockFormats?.screen?.[format];
  if (!preset) {
    preset = scaffoldFormats?.screen?.[format];
    if (!preset) setup(`no screen preset "${format}" in ${lockFormats ? path.join(L.lockDir, 'formats.json') : 'the lock directory (no formats.json)'} or the engine scaffold's formats.json. Known: ${Object.keys({ ...scaffoldFormats?.screen, ...lockFormats?.screen }).join(', ')}.`);
    notes.push(`frame from the engine scaffold's formats.json ("${format}" ${preset.w}×${preset.h}): ${lockFormats ? 'the lock\'s formats.json has no such preset' : 'the lock directory has no formats.json'}`);
  }
  const fps = num(args, 'fps', { def: lockFormats?.motion?.fps ?? scaffoldFormats?.motion?.fps ?? 30, min: 1, integer: true });
  if (!Number.isInteger(preset.w) || !Number.isInteger(preset.h)) setup(`screen preset "${format}" has no integer w/h.`);

  // the kit link: one runtime, in the engine, reached through a symlink — never a copy
  const link = path.join(L.lockDir, 'kit');
  let st = null;
  try { st = fs.lstatSync(link); } catch { /* absent */ }
  if (st && !st.isSymbolicLink()) setup(`${link} exists and is not a symlink — refusing to replace it. Move it away; the kit must be a link to ${KIT}.`);
  if (st) {
    let real = null;
    try { real = fs.realpathSync(link); } catch { /* dangling */ }
    if (real !== fs.realpathSync(KIT)) setup(`${link} points to ${fs.readlinkSync(link)}${real ? '' : ' (dangling)'}, not this engine's kit ${KIT}. Remove the link and run new again.`);
  } else fs.symlinkSync(KIT, link, 'dir');

  fs.cpSync(template, dir, { recursive: true });
  const title = args.title ?? id;
  const filled = [], open = [];
  for (const f of ['index.html', 'piece.js']) {
    const file = path.join(dir, f);
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, 'utf8');
    if (f === 'index.html') {
      text = text.replaceAll('__TITLE__', esc(title));
      const colours = Object.keys(L.lock.tokens?.colors?.light ?? {}), roles = Object.keys(L.lock.tokens?.typography ?? {});
      for (const r of ROLE_FILL) {
        if (!text.includes(`var(${r.slot})`)) continue;
        const pick = pickName(r.from === 'colour' ? colours : roles, r);
        if (!pick.name) { r.why = pick.ambiguous ? `ambiguous — ${pick.ambiguous.join(', ')}` : `no ${r.from === 'colour' ? 'colour slot' : 'typography role'} named like ${r.words.join('|')}`; continue; }
        const variable = r.from === 'colour' ? `--${pick.name}` : `--font-${pick.name}-family`;
        text = text.replaceAll(`var(${r.slot})`, `var(${variable})`);
        filled.push(`${r.slot} → var(${variable}) (${r.from === 'colour' ? 'colour slot' : 'typography role'} "${pick.name}")`);
      }
      // what is left, read from the file as written: live declarations only (a commented-out line is not a slot)
      for (const m of codeOf('x.html', text).matchAll(/(--piece-[\w-]+)\s*:[^;]*var\((--REPLACE-[\w-]+)\)/g)) {
        const why = ROLE_FILL.find((r) => r.slot === m[2])?.why;
        open.push(`${m[1]} (${m[2]})${why ? `: ${why}` : ''}`);
      }
    } else {
      const jsString = title.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n\u2028\u2029]+/g, ' ');
      text = text.replaceAll("'__TITLE__'", `'${jsString}'`).replaceAll('__TITLE__', title.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\*\//g, '* /'));
      if (/motion:\s*\{[^}]*'REPLACE'/.test(codeOf('x.js', text))) {
        const m = L.lock.tokens?.motion ?? {};
        open.push(`motion roles in piece.js (enter exit cut, ease.enter ease.exit ease.move) — ${Object.keys(m.durationsMs ?? {}).length + Object.keys(m.easings ?? {}).length ? `the lock declares durations ${Object.keys(m.durationsMs ?? {}).join(', ') || 'none'} and easings ${Object.keys(m.easings ?? {}).join(', ') || 'none'}` : 'the lock declares no tokens.motion (the tokens check will SKIP)'}`);
      }
    }
    text = text.replaceAll('__W__', String(preset.w)).replaceAll('__H__', String(preset.h)).replaceAll('__FPS__', String(fps));
    fs.writeFileSync(file, text);
  }
  const rel = (p) => { const r = path.relative(process.cwd(), p); return !r ? '.' : r.startsWith('..') ? p : r; };
  console.log(`made ${kind} "${id}" → ${rel(dir)} (from ${template === own ? 'the skill\'s own template' : 'the engine skeleton'} ${rel(template)})`);
  console.log(`  frame ${preset.w}×${preset.h} ("${format}") at ${fps} fps; kit ${rel(link)} → ${KIT}`);
  for (const n of notes) console.log(`  note: ${n}`);
  console.log(`  ROLE MAP filled: ${filled.length ? filled.join('; ') : 'nothing (no unambiguous lock name)'}`);
  if (open.length) console.log(`  left to the author (REPLACE until decided; the css-vars lint fails until then):\n    ${open.join('\n    ')}`);
  console.log(`next:\n  node ${rel(SCRIPT)} check  --lock ${rel(L.lockPath)} --id ${id}\n  node ${rel(SCRIPT)} stills --lock ${rel(L.lockPath)} --id ${id}\n  node ${rel(SCRIPT)} serve  --lock ${rel(L.lockPath)}   (then open /motion/${id}/${kind === 'film' ? '?play' : ''})`);
  return EXIT.PASS;
}

// ----------------------------------------------------------------------------------------------------- self-test

function selfTest(args) {
  const manifestPath = path.resolve(args.manifest ?? path.join(ENGINE, 'fixtures', 'motion', 'manifest.json'));
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) { setup(`cannot read the self-test manifest ${manifestPath}: ${e.message}`); }
  const baseDir = path.dirname(manifestPath);
  if (typeof manifest?.lock !== 'string' || !Array.isArray(manifest.pieces) || !manifest.pieces.length) setup(`${manifestPath}: expected { "lock": "<path>", "pieces": [ … ] }.`);
  const lock = path.resolve(baseDir, manifest.lock);
  if (path.isAbsolute(manifest.lock) || !lock.startsWith(baseDir + path.sep)) setup(`${manifestPath}: lock "${manifest.lock}" must be a relative path inside the manifest's directory.`);
  const rows = [];
  for (const p of manifest.pieces) {
    if (!p || !ID_RE.test(p.id ?? '') || !['film', 'deck'].includes(p.kind)) setup(`${manifestPath}: piece ${JSON.stringify(p)} needs an "id" and a "kind" of film|deck.`);
    const e = p.expect;
    if (e !== 'pass' && !(e && typeof e.gate === 'string' && ['FAIL', 'WARN', 'SKIP'].includes(e.result))) setup(`${manifestPath}: piece "${p.id}" expect must be "pass" or { "gate", "result": FAIL|WARN|SKIP, "exit"? }.`);
    const res = spawnSync(process.execPath, [SCRIPT, 'check', '--lock', lock, '--id', p.id, '--json'], { encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
    const code = res.error ? (res.error.code === 'ETIMEDOUT' ? EXIT.RENDER : EXIT.SETUP) : res.status ?? EXIT.RENDER;
    let lines = [];
    try { lines = (res.stdout ?? '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { lines = []; }
    const summary = lines.at(-1)?.type === 'summary' ? lines.at(-1) : null;
    const row = { type: 'piece', id: p.id, kind: p.kind, expect: e, exit: code, result: null, reasons: [] };
    if (code === EXIT.SETUP || code === EXIT.RENDER || !summary) {
      row.result = 'BLOCKED';
      row.reasons.push(`check exited ${code}${summary ? '' : ' with no summary line'}: ${oneLine(res.stderr || (res.error?.message ?? ''), 240)}`);
    } else {
      if (summary.kind !== p.kind) row.reasons.push(`kind is ${summary.kind}, the manifest says ${p.kind}`);
      const gates = summary.gates;
      if (e === 'pass') {
        if (summary.result !== 'PASS' || code !== EXIT.PASS) row.reasons.push(`expected PASS, got ${summary.result} exit ${code} (${Object.entries(gates).filter(([, r]) => r === 'FAIL').map(([g]) => g).join(', ')})`);
      } else {
        const wantExit = e.exit ?? (e.result === 'FAIL' ? (e.gate === 'fonts' ? EXIT.FONT_PARITY : EXIT.FINDING) : EXIT.PASS);
        if (gates[e.gate] !== e.result) row.reasons.push(`${e.gate} was ${gates[e.gate] ?? 'absent'}, expected ${e.result}`);
        const others = Object.entries(gates).filter(([g, r]) => g !== e.gate && r === 'FAIL' && !(p.tolerate ?? []).includes(g)).map(([g]) => g);
        if (others.length) row.reasons.push(`also FAILED: ${others.join(', ')} (not tolerated)`);
        if (code !== wantExit) row.reasons.push(`exit ${code}, expected ${wantExit}`);
      }
      row.result = row.reasons.length ? 'FAIL' : 'PASS';
      row.gates = gates;
    }
    rows.push(row);
  }
  const blocked = rows.filter((r) => r.result === 'BLOCKED').length, failed = rows.filter((r) => r.result === 'FAIL').length;
  const verdict = blocked ? 'BLOCKED' : failed ? 'FAIL' : 'PASS';
  const code = blocked ? EXIT.SETUP : failed ? EXIT.FINDING : EXIT.PASS;
  if (args.json) {
    for (const r of rows) console.log(ndjson(r));
    console.log(ndjson({ type: 'summary', result: verdict, pieces: rows.length, failed, blocked, exit: code, manifest: manifestPath }));
  } else {
    console.log(`motion self-test — ${manifestPath} (${rows.length} piece(s))`);
    for (const r of rows) {
      const want = r.expect === 'pass' ? 'pass' : `${r.expect.gate} ${r.expect.result}`;
      console.log(r.result === 'PASS' ? `PASS ${r.id} (${r.kind}, expected ${want}, exit ${r.exit})` : `${r.result} ${r.id} — ${r.reasons.join(' · ')}`);
    }
    console.log(`\nRESULT: ${verdict} — ${rows.length} piece(s), ${failed} failed, ${blocked} blocked (exit ${code})`);
  }
  return code;
}

// ---------------------------------------------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  switch (args.cmd) {
    case 'new': return cmdNew(args);
    case 'check': return cmdCheck(args);
    case 'stills': return cmdStills(args);
    case 'export': return cmdExport(args);
    case 'serve': return cmdServe(args);
    default: return selfTest(args);
  }
}

main().then(
  (code) => { process.exitCode = code; },
  (err) => {
    if (err instanceof ExitError) { console.error(err.message); process.exitCode = err.code; return; }
    console.error(`exit 5 (render failure): unexpected error: ${err?.stack ?? err}`);
    process.exitCode = EXIT.RENDER;
  },
);
