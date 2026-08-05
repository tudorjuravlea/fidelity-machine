// render.mjs — deterministic screenshot + geometry dump
//
// Contract: ../CONTRACT.md — §Invocation contract, §Determinism invariants (1–7), §Exit codes.
//   node render.mjs --lock <path/to/design-lock.json> --screen <id>
//   → writes .render/<id>.png + .render/<id>.geometry.json next to the lock.
//
// Exit codes: 0 pass · 2 setup/usage · 4 FONT_PARITY · 5 render failure/timeout.
// (3 DIMENSION_MISMATCH is diff.mjs's gate — render guarantees output dims via
//  viewport = captureWidth×captureHeight and scale = dpr===1 ? 'css' : 'device'.)

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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
  let warning = null;
  if (expected && !buildDirActual.includes(expected)) {
    warning =
      `!!! CHROMIUM BUILD MISMATCH !!! lock meta.chromiumBuild="${expected}" but the actual ` +
      `launched build dir is "${buildDirActual}" (executable: ${executablePath}). Renders are NOT ` +
      'guaranteed pixel-comparable to references captured under the pinned build, and ' +
      'meta.noiseFloorPct calibration is invalid for this binary. Install the pinned build ' +
      '(npx playwright install chromium) or re-pin the lock and re-run verify.mjs --calibrate.';
    console.error(warning); // loud on stderr, AND recorded in the geometry json below
  }
  return { executablePath, buildDirActual, expected: expected ?? null, warning };
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

    try {
      await page.goto(url, { waitUntil: 'load' });
    } catch (err) {
      fail(EXIT.RENDER, `exit 5 (render failure): failed to load ${url}: ${err.message}`);
    }

    // Invariant 6: readiness is an explicit page-side contract, never networkidle.
    try {
      await page.waitForSelector('[data-render-ready]', { state: 'attached', timeout: READY_TIMEOUT_MS });
    } catch {
      fail(EXIT.RENDER,
        `exit 5 (render timeout): [data-render-ready] did not appear within ${READY_TIMEOUT_MS}ms at ${url}.\n` +
        'Contract: the generated page MUST set the data-render-ready attribute on <html> (or any element) ' +
        'once fonts, data, and layout are fully settled, e.g.\n' +
        "  document.fonts.ready.then(() => requestAnimationFrame(() => document.documentElement.setAttribute('data-render-ready', '')));\n" +
        'render.mjs never falls back to networkidle.');
    }

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

    await mkdir(renderDir, { recursive: true });

    // Invariant 2: scale 'css' at dpr 1, 'device' at dpr 2 → PNG dims === reference dims.
    const shot = {
      path: pngPath,
      fullPage: false,
      animations: 'disabled',
      caret: 'hide',
      scale: screen.dpr === 1 ? 'css' : 'device',
    };
    if (screen.clip) {
      const { x, y, width, height } = screen.clip;
      shot.clip = { x, y, width, height };
    }
    await page.screenshot(shot);

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

    const geometry = {
      screenId: screen.id,
      mode: screen.mode ?? null,
      url,
      frozenClock: FROZEN_CLOCK_ISO,
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
    };
    await writeFile(geometryPath, `${JSON.stringify(geometry, null, 2)}\n`);

    const foundCount = figResults.filter((r) => r.found).length;
    console.log(`render ok: ${screen.id} → ${pngPath} (${screen.captureWidth}x${screen.captureHeight} css px @ dpr ${screen.dpr}) + ${path.basename(geometryPath)} (${foundCount}/${figResults.length} figIds found, ${fontCheckResults.length} font checks passed)`);
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
