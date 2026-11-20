#!/usr/bin/env node
// operability-audit.mjs — rendered operability audit: can every control on a screen be found by
// name, reached from the keyboard and seen when it has focus. It needs no ground truth and reads
// nothing from the lock but where the screen is and how big, so it holds for any design system.
//
// adherence-lint's `a11y` section reads the source; this renders the screen in the pinned Chromium
// and reads what the browser built. Then it drives the keys: every tab list, radio group, toolbar,
// tree, listbox, combobox, slider, switch, checkbox, menubar, open menu and open dialog on the page
// is handed to the borrowed pattern checker (UI SDK's testing kit, vendored in runtime/ui-sdk/),
// which presses the pattern's keys and reports where focus and state did not follow. The rules,
// their levels and their limits are documented in scripts/operability-core.mjs.
//
// verify.mjs runs it as a gate for every screen the lock declares `"operable": true`. Run on its
// own it audits whatever screen it is given: a poster or a slide has no controls and comes back
// INCONCLUSIVE, which is the answer.
//
// Usage: node operability-audit.mjs --lock <path/to/design-lock.json> [--screen <id>] [--strict]
//                                   [--no-patterns] [--max-stops <n>] [--ready-timeout <ms>]
//   --screen omitted → every screen in the lock.
//   --strict         → WARN findings fail the audit too (default: only ERROR fails).
//   --no-patterns    → leave the key-driving pass out, for a screen that is still markup (a picture
//                      of a switch): only the rules that read the page as it stands run.
//   --max-stops      → how many Tab stops to walk and photograph (default 80).
//   --ready-timeout  → how long to wait for [data-render-ready] (default 15000 ms, as render.mjs).
//   Renders at the screen's captureWidth × captureHeight and colorScheme, always at dpr 1.
//   Writes .report/<screen>.operable.json (next to the lock).
// Exit codes (CONTRACT.md): 0 pass · 1 operability finding (an ERROR, or a WARN under --strict)
//   · 2 setup/usage error (bad args, unparseable lock, screen missing a field)
//   · 5 render failure (Chromium did not launch, the page did not load or never became ready)
//   · 6 INCONCLUSIVE — nothing to operate on the page, or the Tab walk was cut at its limit. Not a
//     pass, not a finding. A real finding beats this code; 2 and 5 beat both.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { DEFAULT_MAX_STOPS, auditPage, probeClickListeners } from './operability-core.mjs';

const USAGE = `usage: node operability-audit.mjs --lock <path/to/design-lock.json> [--screen <id>] [--strict] [--no-patterns] [--max-stops <n>] [--ready-timeout <ms>]
exit codes: 0 pass · 1 operability finding · 2 setup/usage error · 5 render failure · 6 inconclusive (nothing judged)`;

// The build render.mjs pins (channel "chromium" = Playwright's full Chromium, not the headless shell).
const CHROMIUM_CHANNEL = 'chromium';

function die(code, msg) {
  console.error(`operability-audit.mjs: ${msg}`);
  if (code === 2) console.error(USAGE);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { lock: null, screen: null, strict: false, patterns: true, maxStops: DEFAULT_MAX_STOPS, readyTimeout: 15000, help: false };
  const count = (flag, raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) die(2, `${flag} needs a whole number of 1 or more, got "${raw}"`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--lock') args.lock = argv[++i];
    else if (a === '--screen') args.screen = argv[++i];
    else if (a === '--strict') args.strict = true;
    else if (a === '--no-patterns') args.patterns = false;
    else if (a === '--max-stops') args.maxStops = count(a, argv[++i]);
    else if (a === '--ready-timeout') args.readyTimeout = count(a, argv[++i]);
    else die(2, `unknown argument "${a}"`);
  }
  return args;
}

// CONTRACT §Path resolution, as render.mjs applies it: a url that is not http(s):// or file:// is
// a path relative to the lock's directory, and its ?query / #hash still reaches the page.
function resolveScreenUrl(rawUrl, lockDir) {
  if (/^(https?|file):\/\//i.test(rawUrl)) return rawUrl;
  const cut = rawUrl.search(/[?#]/);
  const pathPart = cut === -1 ? rawUrl : rawUrl.slice(0, cut);
  return pathToFileURL(path.resolve(lockDir, pathPart)).href + (cut === -1 ? '' : rawUrl.slice(cut));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); process.exit(0); }
  if (!args.lock) die(2, '--lock <path> is required');

  const lockPath = path.resolve(args.lock);
  let lock;
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch (err) {
    die(2, `cannot read/parse lock ${lockPath}: ${err.message} (exit 2 = setup error)`);
  }
  const lockDir = path.dirname(lockPath);
  const screens = Array.isArray(lock.screens) ? lock.screens : [];
  if (screens.length === 0) die(2, `lock ${lockPath} has no screens[] (exit 2 = setup error)`);

  let targets = screens;
  if (args.screen) {
    targets = screens.filter((s) => s.id === args.screen);
    if (targets.length === 0) {
      die(2, `screen "${args.screen}" not in lock (available: ${screens.map((s) => s.id).join(', ')}) (exit 2 = usage error)`);
    }
  }
  for (const screen of targets) {
    const missing = ['url', 'captureWidth', 'captureHeight', 'colorScheme'].filter((k) => screen[k] === undefined || screen[k] === null || screen[k] === '');
    if (missing.length) die(2, `screen "${screen.id}" is missing required field(s): ${missing.join(', ')} (see design-lock.schema.json) (exit 2 = setup error)`);
  }

  const reportDir = path.join(lockDir, '.report');
  await mkdir(reportDir, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: CHROMIUM_CHANNEL, args: ['--allow-file-access-from-files'] });
  } catch (err) {
    die(5, `exit 5 (render failure/environment): could not launch pinned Chromium (channel "${CHROMIUM_CHANNEL}"): ${err.message}. Run scripts/setup-check.mjs.`);
  }

  let hadRenderFailure = false, hadFailure = false, hadInconclusive = false;

  try {
    for (const screen of targets) {
      const tag = `operable ${screen.id}:`;
      const url = resolveScreenUrl(screen.url, lockDir);
      const context = await browser.newContext({
        viewport: { width: screen.captureWidth, height: screen.captureHeight },
        deviceScaleFactor: 1,
        colorScheme: screen.colorScheme,
        reducedMotion: 'reduce',
      });
      await context.addInitScript(probeClickListeners);
      const page = await context.newPage();

      let result;
      try {
        try {
          await page.goto(url, { waitUntil: 'load' });
        } catch (err) {
          console.error(`${tag} exit 5 (render failure): failed to load ${url}: ${err.message}`);
          hadRenderFailure = true;
          continue;
        }
        try {
          await page.waitForSelector('[data-render-ready]', { state: 'attached', timeout: args.readyTimeout });
        } catch {
          console.error(
            `${tag} exit 5 (render timeout): [data-render-ready] did not appear within ${args.readyTimeout}ms at ${url}.\n` +
              'Contract: the page MUST set the data-render-ready attribute once fonts, data and layout are settled (the same contract render.mjs holds it to).'
          );
          hadRenderFailure = true;
          continue;
        }
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(screen.captureWidth - 1, screen.captureHeight - 1);
        try {
          result = await auditPage(page, { maxStops: args.maxStops, patterns: args.patterns });
        } catch (err) {
          console.error(`${tag} exit 5 (render failure): the audit could not read the page: ${err.message}`);
          hadRenderFailure = true;
          continue;
        }
      } finally {
        await context.close();
      }

      const errors = result.findings.filter((f) => f.level === 'ERROR');
      const warns = result.findings.filter((f) => f.level !== 'ERROR');
      const judged = result.checked.controls + result.checked.references;
      const failing = errors.length > 0 || (args.strict && warns.length > 0);
      const inconclusive = !failing && (result.deferred.length > 0 || judged === 0);
      const status = failing ? 'fail' : inconclusive ? 'inconclusive' : 'pass';
      if (failing) hadFailure = true;
      if (inconclusive) hadInconclusive = true;

      const reasons = [...result.deferred];
      if (judged === 0) reasons.push('nothing to operate: the page has no control and no id reference to judge');

      const report = {
        screen: screen.id,
        mode: screen.mode ?? null,
        gate: 'operable',
        strict: args.strict,
        patterns: args.patterns,
        status,
        summary: { errors: errors.length, warns: warns.length, deferred: result.deferred.length, checked: judged },
        checked: result.checked,
        findings: result.findings,
        deferred: result.deferred,
        manual: result.manual,
        inconclusiveReasons: reasons,
      };
      const reportPath = path.join(reportDir, `${screen.id}.operable.json`);
      await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');

      const head = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'INCONCLUSIVE';
      console.log(`${tag} ${head} — ${errors.length} error(s), ${warns.length} warning(s), ${result.checked.controls} control(s), ${result.checked.references} reference(s), ${result.checked.tabStops} tab stop(s), ${result.checked.focusJudged} focus indicator(s) photographed, ${args.patterns ? `${result.checked.patterns} widget(s) driven` : 'no widget driven (--no-patterns)'}`);
      for (const f of errors) console.log(`${tag}   ERROR ${f.message}`);
      for (const f of warns) console.log(`${tag}   WARN  ${f.message}`);
      for (const r of reasons) console.log(`${tag}   inconclusive: ${r}`);
      for (const m of result.manual) console.log(`${tag}   manual: ${m}`);
      console.log(`${tag} report: ${reportPath}`);
    }
  } finally {
    await browser.close();
  }

  process.exit(hadRenderFailure ? 5 : hadFailure ? 1 : hadInconclusive ? 6 : 0);
}

main().catch((err) => die(2, `unexpected error: ${err?.stack || err} (exit 2 = setup error)`));
