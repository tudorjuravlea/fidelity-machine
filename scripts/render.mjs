// render.mjs — deterministic screenshot + geometry dump
//
// Contract: ../CONTRACT.md — §Invocation contract, §Determinism invariants (1–7), §Exit codes.
//   node render.mjs --lock <path/to/design-lock.json> --screen <id>
//   → writes .render/<id>.png + .render/<id>.geometry.json next to the lock.
//
// Exit codes: 0 pass · 2 setup/usage · 4 FONT_PARITY · 5 render failure/timeout
//   (incl. an off-tree request refused under lock.render.network = "offline").
// (3 DIMENSION_MISMATCH is diff.mjs's gate — render guarantees output dims via
//  viewport = captureWidth×captureHeight and scale = dpr===1 ? 'css' : 'device'.)
//
// Off-tree requests (lock.render.network): every request that does not come from the lock's own
// tree is recorded in the geometry JSON (externalRequests) and named in a stderr `render note:`;
// "offline" additionally refuses them (exit 5). Known limits, stated rather than hidden:
//   - WebSockets are not interceptable by Playwright's route, so they cannot be aborted. They are
//     recorded from page 'websocket' events (resourceType "websocket", blocked: false), and in
//     offline mode one to a host not in allowHosts fails the run after the fact, with the same
//     exit-5 message — refused, though its bytes may already have arrived. The same after-the-
//     fact refusal covers any other external record the route never saw (e.g. a URL carrying
//     user:pass@, which Chromium refuses before interception).
//   - "Inside the lock's directory" is a lexical path-prefix test, not a realpath walk: a symlink
//     inside the lock dir that points outside counts as inside, and a path spelling the lock dir
//     in different letter case (same directory on a case-insensitive disk) counts as outside.
//   - Requests issued after the final offline check (after the screenshot and the geometry
//     reads) cannot affect the captured frame and are not observed.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Determinism constants (CONTRACT §Determinism invariant 3).
const FROZEN_EPOCH_MS = Date.UTC(2026, 0, 15, 10, 0, 0); // 2026-01-15T10:00:00Z
const FROZEN_CLOCK_ISO = new Date(FROZEN_EPOCH_MS).toISOString();
const RNG_SEED = 42; // mulberry32 seed
const READY_TIMEOUT_MS = 15000;
// 'chromium' channel = Playwright-bundled FULL Chromium (the ms-playwright/chromium-<build>/
// binary, new headless mode). Without it, headless launches may use the separate
// chromium_headless_shell-<build> binary, which would not be the build pinned in
// meta.chromiumBuild (invariant 1) and rasterizes independently of it.
const CHROMIUM_CHANNEL = 'chromium';

const EXIT = { PASS: 0, SETUP: 2, FONT_PARITY: 4, RENDER: 5 };

class ExitError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, message) => { throw new ExitError(code, message); };

// ---------------------------------------------------------------- args + lock

function parseArgs(argv) {
  const args = { lock: null, screen: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lock') args.lock = argv[++i];
    else if (a === '--screen') args.screen = argv[++i];
    else {
      fail(EXIT.SETUP, `exit 2 (setup/usage error): unknown argument "${a}".\n` +
        'Usage: node render.mjs --lock <path/to/design-lock.json> --screen <id>');
    }
  }
  if (!args.lock) fail(EXIT.SETUP, 'exit 2 (setup/usage error): missing required --lock <path/to/design-lock.json>.');
  if (!args.screen) fail(EXIT.SETUP, 'exit 2 (setup/usage error): missing required --screen <id> (render.mjs renders exactly one screen per run).');
  return args;
}

async function loadLock(lockPath) {
  let raw;
  try {
    raw = await readFile(lockPath, 'utf8');
  } catch (err) {
    fail(EXIT.SETUP, `exit 2 (setup/usage error): cannot read lock file ${lockPath}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(EXIT.SETUP, `exit 2 (setup/usage error): lock file ${lockPath} is not valid JSON: ${err.message}`);
  }
}

function resolveScreen(lock, screenId, lockPath) {
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  const screen = screens.find((s) => s && s.id === screenId);
  if (!screen) {
    const known = screens.map((s) => s?.id).filter(Boolean).join(', ') || '(none)';
    fail(EXIT.SETUP, `exit 2 (setup/usage error): screen id "${screenId}" not found in ${lockPath}. Available screen ids: ${known}`);
  }
  const missing = ['url', 'captureWidth', 'captureHeight', 'dpr', 'colorScheme']
    .filter((k) => screen[k] === undefined || screen[k] === null);
  if (missing.length) {
    fail(EXIT.SETUP, `exit 2 (setup/usage error): screen "${screenId}" is missing required field(s): ${missing.join(', ')} (see design-lock.schema.json).`);
  }
  return screen;
}

// lock.render.network — how the renderer treats requests that leave the lock's tree.
// 'observe' (the default, also when lock.render is absent) records and reports them and changes
// nothing; 'offline' refuses them. Enforcement is opt-in because blocking by default could break
// a lock whose screens legitimately load remote assets; observing cannot break anything.
const NETWORK_MODES = ['observe', 'offline'];
const RENDER_KEYS = ['network', 'allowHosts'];
const HOSTNAME_ONLY = /^[^:/@\s]+$/; // same rule as the schema's allowHosts item pattern

// Validated here, not left to design-lock.schema.json: render.mjs is run on locks nobody has
// schema-checked, and a lock that asked for 'offline' but misspelled it must not quietly render
// in 'observe' — the author would believe the screen is proven off-tree-free when it is not.
// Same reason an unknown key under render is refused rather than ignored.
function resolveNetwork(lock, lockPath) {
  if (lock.render === undefined) return { mode: 'observe', allowHosts: [] };
  const r = lock.render;
  if (r === null || typeof r !== 'object' || Array.isArray(r)) {
    fail(EXIT.SETUP, `exit 2 (setup/usage error): lock "render" in ${lockPath} must be an object like {"network": "offline", "allowHosts": []} (see design-lock.schema.json).`);
  }
  const unknown = Object.keys(r).filter((k) => !RENDER_KEYS.includes(k));
  if (unknown.length) {
    fail(EXIT.SETUP, `exit 2 (setup/usage error): lock render has unknown key(s) ${unknown.map((k) => `"${k}"`).join(', ')} in ${lockPath}; allowed keys: ${RENDER_KEYS.join(', ')} (see design-lock.schema.json).`);
  }
  // `=== undefined`, not `??`: an explicit null is a value the author wrote, and the schema
  // rejects it, so it must not quietly mean the default.
  const mode = r.network === undefined ? 'observe' : r.network;
  if (typeof mode !== 'string' || !NETWORK_MODES.includes(mode)) {
    fail(EXIT.SETUP, `exit 2 (setup/usage error): lock render.network ${JSON.stringify(r.network)} in ${lockPath} is not one of the allowed values: ${NETWORK_MODES.map((m) => `"${m}"`).join(', ')} (see design-lock.schema.json).`);
  }
  const allowHosts = r.allowHosts === undefined ? [] : r.allowHosts;
  // Hostname only. An entry like "example.com:443" or "https://example.com" would be accepted
  // and then silently never match (the match is against the URL hostname), so it is refused at
  // load time instead of failing closed with no explanation at render time.
  if (!Array.isArray(allowHosts) || allowHosts.some((h) => typeof h !== 'string' || !HOSTNAME_ONLY.test(h))) {
    fail(EXIT.SETUP, `exit 2 (setup/usage error): lock render.allowHosts in ${lockPath} must be an array of hostnames only, e.g. ["fonts.example.com"] — no scheme, port, path or credentials (no ':', '/', '@' or whitespace) (see design-lock.schema.json).`);
  }
  // Hosts compare case-insensitively (URL hostnames are already lower-cased by the parser).
  return { mode, allowHosts: allowHosts.map((h) => h.toLowerCase()) };
}

// Parse a request URL without ever throwing. Credentials are stripped before the URL is stored
// or printed (geometry JSON and stderr are artifacts people share). host is the hostname for
// network schemes and null otherwise: a file:// URL has no host an allowHosts entry could name,
// so it can only be fixed by bundling. An unparseable URL keeps its raw text, host null.
const NETWORK_SCHEMES = ['http:', 'https:', 'ws:', 'wss:'];
function describeUrl(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return { url: String(rawUrl), parsed: null, host: null }; }
  let clean = String(rawUrl);
  if (u.username || u.password) { u.username = ''; u.password = ''; clean = u.href; }
  return { url: clean, parsed: u, host: NETWORK_SCHEMES.includes(u.protocol) ? (u.hostname || null) : null };
}

// A request is 'internal' when its bytes come from the lock's own tree (or carry no fetch at
// all: data:/blob:/about:), 'external' otherwise. The pixel diff assumes every painted byte came
// from the tree the lock pins; an off-tree font or stylesheet can change between runs (late font
// swap, a CDN edit) and the diff would then blame the generator for a change it did not make.
// The lock-dir prefix check appends the separator so a sibling "/lock-dirX/" does not pass as
// inside "/lock-dir/". The main document is decided by the caller, structurally (see main()).
// Never throws: this runs inside page event listeners, where a throw escapes as an uncaught
// exception and the process exits 1 — the code for a fidelity finding, which would send a model
// to "fix" a renderer crash. fileURLToPath refuses legal-to-Chromium URLs (file://host/…, an
// encoded "/" in the path); such a URL is not provably in-tree, so it is external.
function classifyUrl(d, lockDir) {
  if (!d.parsed) return 'external';
  const p = d.parsed.protocol;
  if (p === 'data:' || p === 'blob:' || p === 'about:') return 'internal';
  if (p === 'file:') {
    try {
      return path.resolve(fileURLToPath(d.parsed)).startsWith(path.resolve(lockDir) + path.sep) ? 'internal' : 'external';
    } catch {
      return 'external';
    }
  }
  return 'external';
}

// Label for the note's host list: the hostname, else the scheme ("file://"), else a marker.
const hostLabel = (rec) => {
  if (rec.host) return rec.host;
  const d = describeUrl(rec.url);
  return d.parsed ? `${d.parsed.protocol}//` : '(unparseable URL)';
};
const stripHash = (u) => String(u).split('#')[0];

// CONTRACT §Path resolution: a url that is not http(s):// or file:// is a path
// resolved relative to the LOCK file's directory, converted to file://.
function resolveScreenUrl(rawUrl, lockDir) {
  if (/^(https?|file):\/\//i.test(rawUrl)) return rawUrl;
  return pathToFileURL(path.resolve(lockDir, rawUrl)).href;
}

// ------------------------------------------------------- chromium build pin (invariant 1)

function extractBuildDir(execPath) {
  // e.g. .../ms-playwright/chromium-1228/chrome-mac-arm64/... → "chromium-1228"
  const seg = execPath.split(path.sep).find((s) => /^chromium\S*-\d+$/.test(s));
  return seg ?? execPath;
}

function checkChromiumBuild(lock) {
  let executablePath;
  try {
    executablePath = chromium.executablePath({ channel: CHROMIUM_CHANNEL });
  } catch (err) {
    fail(EXIT.RENDER, `exit 5 (render failure/environment): cannot resolve the Playwright Chromium executable: ${err.message}. Run scripts/setup-check.mjs.`);
  }
  const buildDirActual = extractBuildDir(executablePath);
  const expected = lock.meta?.chromiumBuild;
  // A different Chromium build rasterizes text, antialiasing and compositing differently: it
  // invalidates the noise-floor calibration (meta.noiseFloorPct) AND every stored reference
  // image, so continuing would produce a meaningless diff. That is a setup problem for a human
  // to fix (install the pinned build, or re-pin and recalibrate), never a fidelity finding,
  // hence exit 2 rather than a warning. Absence of meta.chromiumBuild is a different situation
  // (nothing to disagree with), so it is left alone here; a missing required field is already
  // caught by design-lock.schema.json and adherence-lint's schema-sanity section.
  if (expected && !buildDirActual.includes(expected)) {
    fail(EXIT.SETUP,
      `exit 2 (setup/usage error): CHROMIUM BUILD MISMATCH — lock meta.chromiumBuild="${expected}" but the ` +
      `resolved build is "${buildDirActual}" (executable: ${executablePath}). Run ` +
      'scripts/setup-check.mjs, then either install the pinned build ' +
      '(npx playwright install chromium) or re-pin the lock and re-run verify.mjs --calibrate.');
  }
  return { executablePath, buildDirActual, expected: expected ?? null, warning: null };
}

// -------------------------------------------------- in-page determinism (invariant 3)

// Runs in the page BEFORE any page script (addInitScript): freeze the clock,
// seed Math.random (mulberry32), and remove requestIdleCallback scheduling jitter.
function determinismInit({ epochMs, seed }) {
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(epochMs); // new Date() → frozen instant
      else super(...args); // explicit-argument construction untouched
    }
    static now() { return epochMs; }
  }
  // parse/UTC are inherited statics from RealDate via extends.
  window.Date = FrozenDate;

  let s = seed >>> 0; // mulberry32
  Math.random = function mulberry32() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // requestIdleCallback fires at browser-idle-dependent times — make it a plain
  // deterministic macrotask with a fixed synthetic deadline.
  window.requestIdleCallback = (cb) =>
    window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
  window.cancelIdleCallback = (id) => window.clearTimeout(id);
}

// ---------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lockPath = path.resolve(args.lock);
  const lockDir = path.dirname(lockPath);
  const lock = await loadLock(lockPath);
  const screen = resolveScreen(lock, args.screen, lockPath);
  const network = resolveNetwork(lock, lockPath);
  const url = resolveScreenUrl(screen.url, lockDir);
  const chromiumInfo = checkChromiumBuild(lock);

  const renderDir = path.join(lockDir, '.render');
  const pngPath = path.join(renderDir, `${screen.id}.png`);
  const geometryPath = path.join(renderDir, `${screen.id}.geometry.json`);

  let browser = null;
  try {
    try {
      browser = await chromium.launch({ headless: true, channel: CHROMIUM_CHANNEL });
    } catch (err) {
      fail(EXIT.RENDER, `exit 5 (render failure/environment): could not launch pinned Chromium (channel "${CHROMIUM_CHANNEL}"): ${err.message}. Run scripts/setup-check.mjs.`);
    }

    // Invariant 2 (exact dims) + invariant 4 (reduced motion). timezoneId pins the
    // rendered wall-clock of the frozen epoch across machines (clock-freeze corollary).
    const context = await browser.newContext({
      viewport: { width: screen.captureWidth, height: screen.captureHeight },
      deviceScaleFactor: screen.dpr,
      colorScheme: screen.colorScheme,
      reducedMotion: 'reduce',
      timezoneId: 'UTC',
    });
    await context.addInitScript(determinismInit, { epochMs: FROZEN_EPOCH_MS, seed: RNG_SEED });
    const page = await context.newPage();

    // The main document is identified structurally — the main frame's navigation request for a
    // document — not by string equality with the lock's url: Chromium canonicalizes the navigation
    // URL ("http://h:1" → "http://h:1/", "HTTP://" → "http://"), so a string match let the page
    // itself count as external (a false note in observe; in offline, the page aborted itself).
    // Every hop of a redirect chain is such a request, so the final URL is internal too; the URLs
    // seen that way (plus the canonical lock url and page.url() after goto) are remembered so a
    // later re-request of the same document is not misread either. Only goto's own chain counts —
    // the first main-frame navigation and the redirect hops that descend from it: a page script
    // that sends its main frame elsewhere (location = "https://…", even during load) starts a new
    // navigation with no redirectedFrom(), and that request is classified by its URL.
    const mainDocUrls = new Set([stripHash(describeUrl(url).parsed?.href ?? url)]);
    const mainDocRequests = new WeakSet();
    let firstNavigationSeen = false;
    const isMainDocument = (request) => {
      try {
        if (mainDocRequests.has(request)) return true;
        if (request.isNavigationRequest() && request.resourceType() === 'document' &&
            request.frame() === page.mainFrame()) {
          const from = request.redirectedFrom();
          if ((!firstNavigationSeen && !from) || (from && mainDocRequests.has(from))) {
            firstNavigationSeen = true;
            mainDocRequests.add(request);
            mainDocUrls.add(stripHash(request.url()));
            return true;
          }
        }
      } catch {
        // frame() throws for a request with no frame (e.g. a service worker's) — not the page.
      }
      return mainDocUrls.has(stripHash(request.url()));
    };

    // External-request record, deduplicated by (credential-stripped) url in first-seen order.
    // Attached before goto so the main document's own subresources are seen. Observation is
    // always on and never changes what loads; only render.network = "offline" changes behavior.
    // noteExternal never throws (see classifyUrl): anything it cannot classify is external.
    const external = new Map(); // url → { url, resourceType, host, failed, blocked }
    const record = (d, resourceType) => {
      if (!external.has(d.url)) {
        external.set(d.url, { url: d.url, resourceType, host: d.host, failed: false, blocked: false });
      }
      return external.get(d.url);
    };
    const noteExternal = (request) => {
      let rawUrl = '';
      let resourceType = 'other';
      try { rawUrl = request.url(); resourceType = request.resourceType(); } catch { /* keep defaults */ }
      try {
        if (isMainDocument(request)) return null;
        const d = describeUrl(rawUrl);
        return classifyUrl(d, lockDir) === 'external' ? record(d, resourceType) : null;
      } catch {
        return record({ url: String(rawUrl), host: null }, resourceType);
      }
    };
    const isAllowed = (rec) => rec.host !== null && network.allowHosts.includes(rec.host);

    if (network.mode === 'offline') {
      await context.route('**/*', (route) => {
        let rec = null;
        let abort = true; // fail closed: a request that could not be classified is not in-tree
        try {
          rec = noteExternal(route.request());
          abort = rec !== null && !isAllowed(rec);
        } catch { /* abort stays true */ }
        if (abort) {
          if (rec) rec.blocked = true;
          else record({ url: '(unclassifiable request)', host: null }, 'other').blocked = true;
          return route.abort('blockedbyclient').catch(() => {});
        }
        return route.continue().catch(() => {});
      });
    }
    page.on('request', (request) => { noteExternal(request); });
    page.on('requestfailed', (request) => {
      const rec = noteExternal(request);
      if (rec) rec.failed = true;
    });
    // WebSockets never reach route or the request events; see the header comment.
    page.on('websocket', (ws) => {
      try { record(describeUrl(ws.url()), 'websocket'); } catch { /* never throw from a listener */ }
    });

    // In offline mode a run fails on ANY external record whose host is not allowed — not only the
    // ones the route aborted. Some never reach the route: a WebSocket (cannot be aborted), or a
    // URL Chromium refuses on its own before interception (e.g. one carrying user:pass@). Keying
    // on the record rather than on the abort keeps the rule "nothing off-tree and unallowed in an
    // exit-0 offline run" true whatever path the request took; those are refused after the fact.
    const violations = () => (network.mode !== 'offline' ? [] : [...external.values()]
      .filter((r) => r.blocked || !isAllowed(r)));
    const violationList = () => violations().map((r) => `  - ${r.url} (${r.resourceType}` +
      `${r.resourceType === 'websocket' ? ' — cannot be aborted, refused after the fact'
        : (r.blocked ? '' : ' — not seen by the route, refused after the fact')})`).join('\n');
    const offlineRefusal = (list) =>
      'exit 5 (render failure/environment): OFFLINE RENDER REFUSED — lock render.network = "offline" blocked ' +
      'external request(s) that would have painted bytes from outside the lock\'s tree:\n' + list +
      '\nFix one of: (a) bundle the file under the lock\'s directory and reference it by a relative path; ' +
      'or (b) if fetching it at render time is intended, add its host to lock render.allowHosts ' +
      '(exact host, e.g. ["example.com"]; a file:// path outside the lock can only be fixed by (a)).';
    // Offline refusal is exit 5, not 1: a blocked off-tree request is an environment/packaging
    // fact about the screen, not a fidelity finding — a model told "fix this" would restyle the
    // page to paper over a missing file. Same family as FONT_PARITY (exit 4), which it often
    // co-fires with (a blocked font fails document.fonts.check).
    const assertNothingBlocked = () => {
      const list = violationList();
      if (list) fail(EXIT.RENDER, offlineRefusal(list));
    };

    let mainResponse = null;
    try {
      mainResponse = await page.goto(url, { waitUntil: 'load' });
    } catch (err) {
      // If offline mode blocked something, that is the story — never a bare ERR_BLOCKED_BY_CLIENT.
      const list = violationList();
      if (list) fail(EXIT.RENDER, `${offlineRefusal(list)}\n(page.goto then failed: ${err.message})`);
      fail(EXIT.RENDER, `exit 5 (render failure): failed to load ${url}: ${err.message}`);
    }
    // The final URL of goto's own chain (after redirects) — not page.url(), which a page script
    // may already have moved elsewhere.
    try { if (mainResponse) mainDocUrls.add(stripHash(mainResponse.url())); } catch { /* best effort */ }

    // Invariant 6: readiness is an explicit page-side contract, never networkidle.
    try {
      await page.waitForSelector('[data-render-ready]', { state: 'attached', timeout: READY_TIMEOUT_MS });
    } catch {
      // A blocked stylesheet or script is the likeliest reason readiness never came, so name it
      // first; the readiness contract text below is unchanged when nothing was blocked.
      const blocked = violationList();
      fail(EXIT.RENDER,
        (blocked
          ? 'exit 5 (render timeout): lock render.network = "offline" blocked these external request(s) — the likely cause of the timeout below:\n' +
            blocked + '\nBundle them under the lock\'s directory, or add their host to lock render.allowHosts.\n'
          : '') +
        `exit 5 (render timeout): [data-render-ready] did not appear within ${READY_TIMEOUT_MS}ms at ${url}.\n` +
        'Contract: the generated page MUST set the data-render-ready attribute on <html> (or any element) ' +
        'once fonts, data, and layout are fully settled, e.g.\n' +
        "  document.fonts.ready.then(() => requestAnimationFrame(() => document.documentElement.setAttribute('data-render-ready', '')));\n" +
        'render.mjs never falls back to networkidle.');
    }

    // Offline gate, first pass: after readiness, before font parity. A font whose request was
    // blocked BEFORE this point reports as the blocked request it is (exit 5) rather than as the
    // FONT_PARITY failure it causes. A font first requested AFTER this point (e.g. used only by an
    // element the page adds after readiness) is blocked by the route but meets the font checks
    // below first, so that run exits 4, not 5 — the blocked URL is then not named. The final gate
    // after the screenshot catches every other late request.
    assertNothingBlocked();

    // Invariant 5 + caret half of invariant 3.
    await page.addStyleTag({
      content: [
        '::-webkit-scrollbar { display: none !important; }',
        '* { scrollbar-width: none !important; }',
        '*, *::before, *::after { caret-color: transparent !important; }',
      ].join('\n'),
    });

    // Invariant 7: font parity — refuse to screenshot a fallback (exit 4).
    await page.evaluate(async () => { await document.fonts.ready; });
    const fontSpecs = (Array.isArray(lock.fonts) ? lock.fonts : [])
      .flatMap((f) => (f.fontChecks ?? []).map((spec) => ({ family: f.family, spec })));
    const fontCheckResults = await page.evaluate((specs) => specs.map(({ family, spec }) => {
      try {
        return { family, spec, pass: document.fonts.check(spec) };
      } catch (err) {
        return { family, spec, pass: false, error: String(err?.message ?? err) };
      }
    }), fontSpecs);
    const malformed = fontCheckResults.filter((r) => r.error);
    if (malformed.length) {
      fail(EXIT.SETUP, 'exit 2 (setup/usage error): unparseable fonts[].fontChecks[] spec(s) in the lock — ' +
        'document.fonts.check() rejected: ' +
        malformed.map((r) => `'${r.spec}' (${r.error})`).join('; ') +
        '. Specs must be CSS font shorthand like \'700 26px "Brand Sans"\'.');
    }
    const failedChecks = fontCheckResults.filter((r) => !r.pass);
    if (failedChecks.length) {
      fail(EXIT.FONT_PARITY, 'exit 4 (FONT_PARITY): document.fonts.check() returned false for:\n' +
        failedChecks.map((r) => `  - '${r.spec}' (family "${r.family}")`).join('\n') +
        '\nRefusing to screenshot a font fallback — a fallback render can pixel-match a fallback reference ' +
        '(the both-fell-back hole). Bundle the woff2 files listed in fonts[].files, @font-face them with ' +
        'font-display: block, and only set [data-render-ready] after document.fonts.ready.');
    }

    // Invariant 7b: metric probe. document.fonts.check() is TRIVIALLY TRUE for a family with no
    // @font-face rule — Chromium has nothing to load, so an absent system font "passes" and the
    // render silently falls back (found by fault injection: an absent family passed check()).
    // Detection: an absent family makes '"<family>", monospace' resolve identically to bare
    // 'monospace'. Compare measured text width against TWO generics (monospace AND serif) so a
    // family that legitimately shares metrics with one generic isn't a false positive. Web-loaded
    // FontFace entries skip the probe — check() already proved them loaded.
    const uniqueFamilies = [...new Set(fontSpecs.map((s) => s.family))];
    const probeResults = await page.evaluate((families) => families.map((family) => {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      const probe = 'mmmwwwlliWQ178@#';
      const width = (stack) => { ctx.font = `48px ${stack}`; return ctx.measureText(probe).width; };
      const isWebLoaded = [...document.fonts].some(
        (f) => f.family.replace(/^["']|["']$/g, '') === family && f.status === 'loaded');
      if (isWebLoaded) return { family, present: true, via: 'FontFace loaded' };
      const sameAsMono = width(`"${family}", monospace`) === width('monospace');
      const sameAsSerif = width(`"${family}", serif`) === width('serif');
      return { family, present: !(sameAsMono && sameAsSerif), via: 'metric probe' };
    }), uniqueFamilies);
    const absentFamilies = probeResults.filter((r) => !r.present);
    if (absentFamilies.length) {
      fail(EXIT.FONT_PARITY, 'exit 4 (FONT_PARITY): metric probe detected absent font families:\n' +
        absentFamilies.map((r) => `  - "${r.family}" renders identically to generic fallbacks — not installed and not web-loaded`).join('\n') +
        '\ndocument.fonts.check() passed trivially (no @font-face rule to load), but the family does not ' +
        'exist on this system, so every glyph is a fallback. Bundle the woff2 in fonts[].files with ' +
        '@font-face + font-display: block, or install the font, before rendering.');
    }

    // Invariant 4 tail: no mid-flight animations; invariant 3 tail: park the mouse.
    await page.evaluate(() => {
      for (const a of document.getAnimations()) {
        try { a.finish(); } catch { a.cancel(); } // infinite animations cannot finish()
      }
    });
    await page.mouse.move(screen.captureWidth - 1, screen.captureHeight - 1);

    // Invariant 2: scale 'css' at dpr 1, 'device' at dpr 2 → PNG dims === reference dims.
    // Captured to a buffer, not straight to pngPath: the final offline gate runs after the
    // capture, and a refused run must leave no PNG of its own — nor clobber an earlier run's.
    const shot = {
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      scale: screen.dpr === 1 ? 'css' : 'device',
    };
    if (screen.clip) {
      const { x, y, width, height } = screen.clip;
      shot.clip = { x, y, width, height };
    }
    const png = await page.screenshot(shot);

    // Geometry dump — consumed by geometry.mjs (modes A/B1) and by diff.mjs for
    // classifying worst tiles ("box matches → color/weight, not layout").
    const figIds = Array.isArray(screen.figIds) ? screen.figIds : [];
    const figResults = await page.evaluate((ids) => ids.map(({ figmaNodeId, domId }) => {
      const escaped = String(domId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const el = document.querySelector(`[data-fig-id="${escaped}"]`);
      if (!el) return { figmaNodeId, domId, found: false, rect: null };
      const r = el.getBoundingClientRect();
      return { figmaNodeId, domId, found: true, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
    }), figIds);

    // The real laid-out height, so a consumer can tell a full capture from a clipped one.
    // captureHeight is an instruction, not an observation: a screen whose content runs past it
    // is silently cropped, and every gate downstream then passes on an image that is missing
    // whatever fell below the fold. One screen here declared 1600 against a real 2106 and had
    // been scoring green for weeks without its only primary action in frame.
    const documentHeight = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));

    // Offline gate, final pass: after the capture and the last page read, before anything is
    // written. A request the page started after readiness (a timer, a late element) may already
    // have been blocked by the route while the frame was taken; the frame could be the degraded
    // render offline mode exists to refuse, so it is discarded and the run exits 5. The records
    // are snapshotted in the same synchronous step as the check (no await between), so a request
    // the route blocks while the files are being written cannot reach an exit-0 geometry: an
    // exit-0 geometry never carries a blocked: true record. A request the page first issues after
    // this point can no longer affect the captured frame, and is not reported.
    assertNothingBlocked();
    const externalRecords = [...external.values()].map((r) => ({ ...r }));

    await mkdir(renderDir, { recursive: true });
    await writeFile(pngPath, png);

    const geometry = {
      screenId: screen.id,
      mode: screen.mode ?? null,
      url,
      frozenClock: FROZEN_CLOCK_ISO,
      documentHeight,
      captureClipsContent: documentHeight > screen.captureHeight,
      viewport: {
        width: screen.captureWidth,
        height: screen.captureHeight,
        dpr: screen.dpr,
        colorScheme: screen.colorScheme,
      },
      chromiumBuildExpected: chromiumInfo.expected,
      chromiumBuildActual: chromiumInfo.buildDirActual,
      chromiumExecutablePath: chromiumInfo.executablePath,
      chromiumBuildWarning: chromiumInfo.warning,
      fontCheckResults,
      figIds: figResults,
      network: { mode: network.mode, allowHosts: network.allowHosts },
      externalRequests: externalRecords,
      externalRequestCount: externalRecords.length,
    };
    await writeFile(geometryPath, `${JSON.stringify(geometry, null, 2)}\n`);

    const foundCount = figResults.filter((r) => r.found).length;
    console.log(`render ok: ${screen.id} → ${pngPath} (${screen.captureWidth}x${screen.captureHeight} css px @ dpr ${screen.dpr}) + ${path.basename(geometryPath)} (${foundCount}/${figResults.length} figIds found, ${fontCheckResults.length} font checks passed)`);
    // A note, not a failure (observe mode never changes the exit code): on stderr so stdout's
    // `render ok:` line stays the single machine-read line it has always been.
    // The host list is capped so a page with dozens of hosts still prints one readable line; the
    // geometry JSON has the full record. The tail says what the author can do in THIS mode: an
    // exit-0 offline run only has allowed hosts left, so "set offline" would be wrong advice.
    if (externalRecords.length > 0) {
      const hosts = [...new Set(externalRecords.map(hostLabel))];
      const MAX_HOSTS = 5;
      const hostText = hosts.slice(0, MAX_HOSTS).join(', ') +
        (hosts.length > MAX_HOSTS ? ` and ${hosts.length - MAX_HOSTS} more` : '');
      const tail = network.mode === 'offline'
        ? 'allowed by lock.render.allowHosts — remove the host to refuse'
        : 'bundle it under the lock, or set lock.render.network = "offline" to refuse';
      console.error(`render note: ${externalRecords.length} external request(s) — ${hostText} (a font or stylesheet fetched off-tree can change between runs; ${tail})`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main().then(
  () => process.exit(EXIT.PASS),
  (err) => {
    if (err instanceof ExitError) {
      console.error(err.message);
      process.exit(err.code);
    }
    console.error(`exit 5 (render failure): unexpected error: ${err?.stack ?? err}`);
    process.exit(EXIT.RENDER);
  },
);
