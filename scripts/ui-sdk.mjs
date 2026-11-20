#!/usr/bin/env node
// ui-sdk.mjs — the vendored behaviour runtime in runtime/ui-sdk/ (UI SDK, Apache-2.0,
// https://github.com/vercel-labs/ui; credited in NOTICE, licence text beside the files).
//
// The engine proves how a screen looks. This runtime is what makes a screen WORK: headless custom
// elements (`<ui-tabs>`, `<ui-dialog>`, `<ui-menu>` ...) that wrap the design system's own markup
// and give it keyboard handling, focus and ARIA while every class, token and pixel stays ours
// (references/behavior-kit.md). Its testing kit is the checker operability-audit.mjs drives.
// It is a copy, pinned to one version, because a page that loads it from the network cannot be
// rendered offline and changes when someone else's server does.
//
//   link     --lock L             put the runtime inside a capture as <lockDir>/ui-sdk (a symlink),
//                                 so a screen loads it as "ui-sdk/web.js" from its own tree
//   verify   [--runtime <dir>] [--package <package.json>]
//                                 every vendored file still has the hash VENDORED.json recorded,
//                                 and the React build pinned in package.json is the same version
//   outdated [--latest <v>]       compare the vendored version with the registry's latest
//   update   [--version <v>] [--from <dir>] [--runtime <dir>]
//                                 rebuild the folder whole from the two published packages
//   --help
//
// Only `update` and `outdated` reach the network (through npm), and only without their seam:
// `--from <dir>` is a folder holding the two packages unpacked as <dir>/web/package and
// <dir>/core/package, `--latest <v>` is the registry's answer given by hand.
//
// What `update` keeps: browser/web.js and browser/web/** (the loader and one file per component),
// the testing kit bundled into one script (testing.js, global __uiSdkTesting), LICENSE, and
// COMPOSITION.md (each component's markup, cut from the package's own docs). It leaves out
// web.css: that is their default look, and the look comes from the lock.
//
// A component library written in React takes the same behaviour from @ui-sdk/react, which is an
// exact-version dependency in package.json, not a copy: build-component-fixture.mjs bundles it
// into the fixture page, so nothing is loaded at render time. `verify` fails when that pin and
// the vendored version differ, and `update` says how to move the pin.
//
// Exit codes (CONTRACT §Exit codes): 0 ok · 1 verify found a changed, missing or unrecorded file,
//   or outdated found a newer version · 2 setup/usage (bad flags, npm or tar missing, the registry
//   unreachable, a folder that is not two unpacked packages, something in the way of the link).

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME = path.join(ENGINE, 'runtime', 'ui-sdk');
const LINK_NAME = 'ui-sdk';
const MANIFEST = 'VENDORED.json';
const PACKAGES = { web: '@ui-sdk/web', core: '@ui-sdk/core' };
// Bundled into React fixtures from node_modules; held to the vendored version by `verify`.
const PINNED = ['@ui-sdk/react', '@ui-sdk/core'];
const KIT_GLOBAL = '__uiSdkTesting';

const USAGE = `usage: node ui-sdk.mjs link --lock <path/to/design-lock.json>
       node ui-sdk.mjs verify [--runtime <dir>] [--package <package.json>]
       node ui-sdk.mjs outdated [--latest <version>]
       node ui-sdk.mjs update [--version <v>] [--from <dir of unpacked packages>] [--runtime <dir>]
exit codes: 0 ok · 1 verify or outdated found a difference · 2 setup/usage error`;

function die(msg) {
  console.error(`ui-sdk.mjs: ${msg} (exit 2 = setup/usage error)`);
  console.error(USAGE);
  process.exit(2);
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!['--lock', '--runtime', '--latest', '--version', '--from', '--package'].includes(a)) die(`unknown argument "${a}"`);
    if (rest[i + 1] === undefined) die(`${a} needs a value`);
    flags[a.slice(2)] = rest[++i];
  }
  return { verb, flags };
}

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

function filesUnder(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full, base));
    else out.push(posix(path.relative(base, full)));
  }
  return out.sort();
}

function readManifest(runtime) {
  const file = path.join(runtime, MANIFEST);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    die(`cannot read ${file}: ${err.message}`);
  }
}

// ------------------------------------------------------------------ verify

function verify(runtime, packageFile) {
  const manifest = readManifest(runtime);
  const present = filesUnder(runtime).filter((f) => f !== MANIFEST);
  const problems = [];
  for (const [file, hash] of Object.entries(manifest.files)) {
    if (!present.includes(file)) problems.push(`missing     ${file}`);
    else if (sha256(path.join(runtime, file)) !== hash) problems.push(`changed     ${file}`);
  }
  for (const file of present) if (!(file in manifest.files)) problems.push(`unrecorded  ${file}`);
  let pins = {};
  try { pins = JSON.parse(fs.readFileSync(packageFile, 'utf8')).dependencies ?? {}; } catch (err) { die(`cannot read ${packageFile}: ${err.message}`); }
  for (const name of PINNED) {
    if (pins[name] !== manifest.version) problems.push(`pin         ${name} is ${pins[name] ? `"${pins[name]}"` : 'not declared'} in ${path.basename(packageFile)}, the vendored runtime is ${manifest.version}: npm install --save-exact ${PINNED.map((n) => `${n}@${manifest.version}`).join(' ')}`);
  }
  if (problems.length) {
    console.log(`ui-sdk verify: FAIL — UI SDK ${manifest.version} in ${runtime} is not what was vendored:`);
    for (const p of problems) console.log(`  ${p}`);
    console.log('The folder is a copy, never edited by hand: restore it from git, or rebuild it with `node scripts/ui-sdk.mjs update`.');
    process.exit(1);
  }
  console.log(`ui-sdk verify: PASS — UI SDK ${manifest.version}, ${present.length} files match ${MANIFEST}, ${PINNED.join(' and ')} pinned at the same version`);
}

// ------------------------------------------------------------------ link

function link(lockArg) {
  if (!lockArg) die('link needs --lock <path/to/design-lock.json>');
  const lockPath = path.resolve(lockArg);
  if (!fs.existsSync(lockPath)) die(`no lock at ${lockPath}`);
  const target = path.join(path.dirname(lockPath), LINK_NAME);
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (existing) {
    if (existing.isSymbolicLink() && fs.realpathSync(target) === fs.realpathSync(RUNTIME)) {
      console.log(`ui-sdk link: ${target} already points at the runtime`);
      return;
    }
    die(`${target} exists and is not a link to ${RUNTIME}; move it away first, nothing was changed`);
  }
  fs.symlinkSync(RUNTIME, target, 'dir');
  console.log(`ui-sdk link: ${target} -> ${RUNTIME}`);
  console.log(`Load it from a screen with <script type="module" src="${LINK_NAME}/web.js"></script> (references/behavior-kit.md).`);
}

// ------------------------------------------------------------------ outdated

function npm(args) {
  const r = spawnSync('npm', args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.error || r.status !== 0) die(`\`npm ${args.join(' ')}\` failed: ${(r.error?.message ?? r.stderr ?? '').trim().split('\n').pop()}`);
  return r.stdout.trim();
}

function outdated(latestArg) {
  const { version } = readManifest(RUNTIME);
  const latest = latestArg ?? npm(['view', PACKAGES.web, 'dist-tags.latest']);
  if (latest === version) {
    console.log(`ui-sdk outdated: up to date — UI SDK ${version} is the registry's latest`);
    return;
  }
  console.log(`ui-sdk outdated: vendored UI SDK ${version}, the registry's latest is ${latest}`);
  console.log(`Read its changelog, then: node scripts/ui-sdk.mjs update --version ${latest} && node --test "fixtures/ui-sdk/*.test.mjs" "fixtures/operable/*.test.mjs"`);
  process.exit(1);
}

// ------------------------------------------------------------------ update

function fetchPackages(version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-sdk-pack-'));
  const integrity = {};
  for (const [key, name] of Object.entries(PACKAGES)) {
    const tarball = npm(['pack', `${name}@${version}`, '--ignore-scripts', '--pack-destination', dir]).split('\n').pop().trim();
    const file = path.join(dir, tarball);
    integrity[name] = `sha512-${createHash('sha512').update(fs.readFileSync(file)).digest('base64')}`;
    fs.mkdirSync(path.join(dir, key));
    const tar = spawnSync('tar', ['-xzf', file, '-C', path.join(dir, key)], { encoding: 'utf8' });
    if (tar.error || tar.status !== 0) die(`could not unpack ${file}: ${(tar.error?.message ?? tar.stderr).trim()}`);
  }
  return { dir, integrity };
}

// A component's markup, cut from its docs page: the Composition section and the first example of Usage.
function compositionOf(markdown) {
  const start = markdown.search(/^## (Composition|Usage)\s*$/m);
  if (start === -1) return null;
  const usage = markdown.indexOf('\n## Usage', start);
  const from = usage === -1 ? start : usage;
  const open = markdown.indexOf('\n```', from);
  const close = open === -1 ? -1 : markdown.indexOf('\n```', open + 4);
  if (close === -1) return null;
  return markdown.slice(start, close + 4).replace(/^## /gm, '### ').trim();
}

async function update({ version: versionArg, from, runtime }) {
  let integrity = {};
  let source = from ? path.resolve(from) : null;
  let fetched = null;
  if (!source) {
    const version = versionArg ?? npm(['view', PACKAGES.web, 'dist-tags.latest']);
    ({ dir: fetched, integrity } = fetchPackages(version));
    source = fetched;
  }
  const web = path.join(source, 'web', 'package');
  const core = path.join(source, 'core', 'package');
  const needed = [path.join(web, 'package.json'), path.join(web, 'browser', 'web.js'), path.join(web, 'LICENSE'), path.join(core, 'package.json'), path.join(core, 'dist', 'testing.js')];
  const absent = needed.filter((f) => !fs.existsSync(f));
  if (absent.length) die(`${source} is not two unpacked packages (web/package and core/package): missing ${absent.map((f) => path.relative(source, f)).join(', ')}`);

  const versions = { web: JSON.parse(fs.readFileSync(needed[0], 'utf8')).version, core: JSON.parse(fs.readFileSync(needed[3], 'utf8')).version };
  if (versions.web !== versions.core) die(`the two packages disagree: ${PACKAGES.web} ${versions.web}, ${PACKAGES.core} ${versions.core}`);
  if (versionArg && versionArg !== versions.web) die(`asked for ${versionArg}, the packages are ${versions.web}`);

  let esbuild;
  try { esbuild = await import('esbuild'); } catch { die('esbuild is missing: run scripts/setup-check.mjs'); }
  const bundle = await esbuild.build({
    entryPoints: [needed[4]], bundle: true, format: 'iife', globalName: KIT_GLOBAL, platform: 'browser', write: false, logLevel: 'silent',
    banner: { js: `// UI SDK ${versions.core} testing kit (${PACKAGES.core}/dist/testing.js), bundled into one script by scripts/ui-sdk.mjs.\n// Apache-2.0, see LICENSE in this folder. A copy: never edited by hand.` },
  });

  const sections = [];
  const docs = path.join(web, 'docs', 'components');
  for (const page of fs.existsSync(docs) ? fs.readdirSync(docs).filter((f) => f.endsWith('.md')).sort() : []) {
    const cut = compositionOf(fs.readFileSync(path.join(docs, page), 'utf8'));
    if (cut) sections.push(`## ${page.replace(/\.md$/, '')}\n\n${cut}`);
  }

  fs.rmSync(runtime, { recursive: true, force: true });
  fs.mkdirSync(runtime, { recursive: true });
  fs.copyFileSync(path.join(web, 'browser', 'web.js'), path.join(runtime, 'web.js'));
  fs.cpSync(path.join(web, 'browser', 'web'), path.join(runtime, 'web'), { recursive: true });
  fs.copyFileSync(path.join(web, 'LICENSE'), path.join(runtime, 'LICENSE'));
  fs.writeFileSync(path.join(runtime, 'testing.js'), bundle.outputFiles[0].text);
  fs.writeFileSync(path.join(runtime, 'COMPOSITION.md'),
    `# UI SDK ${versions.web}: the markup of each component\n\nCut from the docs pages shipped in ${PACKAGES.web} ${versions.web} (Apache-2.0, see LICENSE) by scripts/ui-sdk.mjs:\neach component's Composition section and the first example of its Usage. In a page with no build\nstep the \`import "@ui-sdk/web/<name>"\` line is not needed: \`ui-sdk/web.js\` defines an element the\nfirst time its tag appears. How to use them with a design system's own markup: references/behavior-kit.md.\n\n${sections.join('\n\n')}\n`);

  const files = {};
  for (const file of filesUnder(runtime)) files[file] = sha256(path.join(runtime, file));
  fs.writeFileSync(path.join(runtime, MANIFEST), JSON.stringify({
    name: 'UI SDK',
    version: versions.web,
    license: 'Apache-2.0',
    repository: 'https://github.com/vercel-labs/ui',
    packages: Object.fromEntries(Object.values(PACKAGES).map((name) => [name, { version: versions.web, integrity: integrity[name] ?? null }])),
    vendored: new Date().toISOString().slice(0, 10),
    built: {
      'web.js, web/**': `${PACKAGES.web}/browser, copied as published`,
      'testing.js': `${PACKAGES.core}/dist/testing.js bundled by esbuild into one script, global ${KIT_GLOBAL}`,
      'COMPOSITION.md': `the Composition and first Usage example of each page in ${PACKAGES.web}/docs/components`,
      'web.css': 'left out on purpose: the look comes from the lock',
    },
    update: 'node scripts/ui-sdk.mjs outdated, then node scripts/ui-sdk.mjs update --version <v>',
    files,
  }, null, 2) + '\n');
  if (fetched) fs.rmSync(fetched, { recursive: true, force: true });
  console.log(`ui-sdk update: UI SDK ${versions.web} vendored into ${runtime} — ${Object.keys(files).length} files, ${sections.length} components in COMPOSITION.md`);
  console.log(`Move the React build with it: npm install --save-exact --ignore-scripts ${PINNED.map((n) => `${n}@${versions.web}`).join(' ')}`);
}

// ------------------------------------------------------------------ main

const { verb, flags } = parseArgs(process.argv.slice(2));
if (verb === '--help' || verb === '-h') {
  console.log(USAGE);
} else if (verb === 'verify') {
  verify(path.resolve(flags.runtime ?? RUNTIME), path.resolve(flags.package ?? path.join(ENGINE, 'package.json')));
} else if (verb === 'link') {
  link(flags.lock);
} else if (verb === 'outdated') {
  outdated(flags.latest);
} else if (verb === 'update') {
  await update({ version: flags.version, from: flags.from, runtime: path.resolve(flags.runtime ?? RUNTIME) });
} else {
  die(verb ? `unknown verb "${verb}"` : 'a verb is required');
}
