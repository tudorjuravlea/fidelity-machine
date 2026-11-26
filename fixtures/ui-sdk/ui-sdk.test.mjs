// ui-sdk.mjs: the vendored behaviour runtime (runtime/ui-sdk/, CONTRACT.md §Invocation contract).
// verify holds the vendored files to their recorded hashes, link puts the runtime inside a capture,
// update rebuilds the folder from the two published packages, outdated compares versions.
// Nothing here touches the network: update reads a folder of unpacked packages (--from) and
// outdated is told the registry's answer (--latest).
//   node --test "fixtures/ui-sdk/*.test.mjs"

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(ENGINE, 'scripts', 'ui-sdk.mjs');
const RUNTIME = path.join(ENGINE, 'runtime', 'ui-sdk');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const tmp = () => mkdtempSync(path.join(tmpdir(), 'ui-sdk-'));
const manifest = (dir = RUNTIME) => JSON.parse(readFileSync(path.join(dir, 'VENDORED.json'), 'utf8'));

// A component-library fixture in React: the design system's own markup and classes (settings.css
// beside this file), the behaviour from @ui-sdk/react. Kept here as text, written into a throwaway
// skill by the test: the engine ships no .tsx, and its release check holds it to that.
const REACT_FIXTURE = String.raw`import { createRoot } from 'react-dom/client';
import { Radio, RadioGroup, RadioIndicator } from '@ui-sdk/react/radio';
import { Switch, SwitchThumb } from '@ui-sdk/react/switch';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs';
import './settings.css';

function Settings() {
  return (
    <main>
      <Tabs defaultValue="overview">
        <TabsList className="segments" aria-label="Account sections">
          <TabsTab value="overview">Overview</TabsTab>
          <TabsTab value="activity">Activity</TabsTab>
          <TabsTab value="limits">Limits</TabsTab>
        </TabsList>
        <TabsPanel className="panel" value="overview">Balance and recent totals.</TabsPanel>
        <TabsPanel className="panel" value="activity">Every movement this month.</TabsPanel>
        <TabsPanel className="panel" value="limits">Daily and monthly limits.</TabsPanel>
      </Tabs>
      <label className="row">
        Notifications
        <Switch className="toggle"><SwitchThumb className="knob" /></Switch>
      </label>
      <p className="row" id="format-label">Statement format</p>
      <RadioGroup className="choices" defaultValue="pdf" aria-labelledby="format-label">
        <label><Radio className="dot" value="pdf"><RadioIndicator /></Radio> PDF</label>
        <label><Radio className="dot" value="csv"><RadioIndicator /></Radio> CSV</label>
      </RadioGroup>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Settings />);
`;

// Two unpacked packages, as `npm pack` + tar leave them: <dir>/web/package and <dir>/core/package.
function fakePackages(version = '9.9.9') {
  const dir = tmp();
  const web = path.join(dir, 'web', 'package');
  const core = path.join(dir, 'core', 'package');
  mkdirSync(path.join(web, 'browser', 'web', 'chunks'), { recursive: true });
  mkdirSync(path.join(web, 'docs', 'components'), { recursive: true });
  mkdirSync(path.join(core, 'dist', 'testing'), { recursive: true });
  writeFileSync(path.join(web, 'package.json'), JSON.stringify({ name: '@ui-sdk/web', version, license: 'Apache-2.0' }));
  writeFileSync(path.join(core, 'package.json'), JSON.stringify({ name: '@ui-sdk/core', version, license: 'Apache-2.0' }));
  writeFileSync(path.join(web, 'LICENSE'), 'Apache License, Version 2.0 (fixture text)\n');
  writeFileSync(path.join(web, 'browser', 'web.js'), 'import("./web/tabs.js");\n');
  writeFileSync(path.join(web, 'browser', 'web.css'), '/* the default look, which is not vendored */\n');
  writeFileSync(path.join(web, 'browser', 'web', 'tabs.js'), 'import "./chunks/a.js";\n');
  writeFileSync(path.join(web, 'browser', 'web', 'chunks', 'a.js'), 'export const a = 1;\n');
  writeFileSync(path.join(web, 'docs', 'components', 'tabs.md'),
    '# Tabs\n\nIntro.\n\n## Composition\n\n```text\nui-tabs\n└── ui-tabs-list\n```\n\nGive the list a name.\n\n## Usage\n\nImport the parts:\n\n```html\n<ui-tabs></ui-tabs>\n```\n\n## Controlled\n\nNot copied.\n');
  writeFileSync(path.join(core, 'dist', 'testing', 'check.js'), 'export async function checkPattern(root, pattern) { return `${pattern}:${root}`; }\n');
  writeFileSync(path.join(core, 'dist', 'testing.js'), 'export { checkPattern } from "./testing/check.js";\n');
  return dir;
}

test('verify: the vendored runtime matches its recorded hashes', () => {
  const r = run('verify');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`UI SDK ${manifest().version.replaceAll('.', '\\.')}`));
});

test('the vendored runtime carries its licence, its version, the loader, the checker and no default look', () => {
  const m = manifest();
  assert.equal(m.license, 'Apache-2.0');
  assert.match(m.version, /^\d+\.\d+\.\d+/);
  assert.match(readFileSync(path.join(RUNTIME, 'LICENSE'), 'utf8'), /Apache License/);
  for (const f of ['web.js', 'web/tabs.js', 'web/core.js', 'testing.js', 'COMPOSITION.md']) assert.ok(m.files[f], `${f} is recorded`);
  assert.ok(!existsSync(path.join(RUNTIME, 'web.css')), 'web.css is their look; ours comes from the lock');
  assert.match(readFileSync(path.join(RUNTIME, 'COMPOSITION.md'), 'utf8'), /ui-tabs-list/);
});

test('verify fails on a changed file, a missing file and a file nobody recorded, naming each', () => {
  const dir = tmp();
  cpSync(RUNTIME, dir, { recursive: true });
  writeFileSync(path.join(dir, 'web.js'), readFileSync(path.join(dir, 'web.js'), 'utf8') + '\n// edited by hand\n');
  rmSync(path.join(dir, 'web', 'tabs.js'));
  writeFileSync(path.join(dir, 'web', 'extra.js'), 'export {};\n');
  const r = run('verify', '--runtime', dir);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /changed\s+web\.js/);
  assert.match(r.stdout, /missing\s+web\/tabs\.js/);
  assert.match(r.stdout, /unrecorded\s+web\/extra\.js/);
});

test('link: puts the runtime inside a capture as <lockDir>/ui-sdk, twice without complaint', () => {
  const dir = tmp();
  const lock = path.join(dir, 'design-lock.json');
  writeFileSync(lock, JSON.stringify({ name: 'fixture', screens: [] }));
  const first = run('link', '--lock', lock);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const link = path.join(dir, 'ui-sdk');
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(realpathSync(link), realpathSync(RUNTIME));
  assert.ok(existsSync(path.join(link, 'web.js')));
  assert.equal(run('link', '--lock', lock).status, 0, 'a second link is a no-op');
  assert.ok(readlinkSync(link));
  rmSync(dir, { recursive: true, force: true });
});

test('a capture that links the runtime renders under an offline lock and passes the operability audit', () => {
  const dir = tmp();
  const lock = path.join(dir, 'design-lock.json');
  writeFileSync(lock, JSON.stringify({
    name: 'fixture', render: { network: 'offline' },
    screens: [{ id: 'settings', mode: 'B2', url: 'settings.html', captureWidth: 720, captureHeight: 640, dpr: 1, colorScheme: 'light' }],
  }));
  const page = readFileSync(path.join(ENGINE, 'fixtures', 'operable', 'behavior-kit.html'), 'utf8');
  assert.match(page, /src="\.\.\/\.\.\/runtime\/ui-sdk\/web\.js"/);
  writeFileSync(path.join(dir, 'settings.html'), page.replace('../../runtime/ui-sdk/web.js', 'ui-sdk/web.js'));
  assert.equal(run('link', '--lock', lock).status, 0);

  const script = (name, ...args) => spawnSync(process.execPath, [path.join(ENGINE, 'scripts', name), '--lock', lock, ...args], { encoding: 'utf8' });
  const render = script('render.mjs', '--screen', 'settings');
  assert.equal(render.status, 0, render.stdout + render.stderr);
  const geometry = JSON.parse(readFileSync(path.join(dir, '.render', 'settings.geometry.json'), 'utf8'));
  assert.equal(geometry.externalRequestCount, 0, 'every file the runtime loads is inside the lock\'s own tree');

  const audit = script('operability-audit.mjs');
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  const report = JSON.parse(readFileSync(path.join(dir, '.report', 'settings.operable.json'), 'utf8'));
  assert.ok(report.checked.patterns >= 3);
  rmSync(dir, { recursive: true, force: true });
});

test('wrapping the golden screen\'s button in the runtime changes its behaviour and not one pixel', () => {
  const render = (wrap) => {
    const dir = tmp();
    cpSync(path.join(ENGINE, 'fixtures', 'golden'), dir, { recursive: true });
    const lock = path.join(dir, 'design-lock.json');
    // The golden lock asks for a font only macOS has, and render.mjs refuses a fallback (exit 4).
    // This test compares two renders on one machine, so the font requirement is dropped from the
    // copy: both renders then use the same fallback, whatever the platform.
    writeFileSync(lock, JSON.stringify({ ...JSON.parse(readFileSync(lock, 'utf8')), fonts: [] }));
    if (wrap) {
      assert.equal(run('link', '--lock', lock).status, 0);
      const file = path.join(dir, 'screen-home.html');
      const html = readFileSync(file, 'utf8');
      // Read from the page, not written here: a tree whose golden screen carries other words has the same button.
      const button = html.match(/<button class="btn" data-slot="cta">[^<]*<\/button>/)?.[0];
      assert.ok(button && html.includes('</head>'), 'the golden screen has its call-to-action button');
      writeFileSync(file, html
        .replace('</head>', '<script type="module" src="ui-sdk/web.js"></script>\n</head>')
        .replace(button, `<ui-button>${button}</ui-button>`)
        .replace("document.fonts.ready.then(() => {", "Promise.all([document.fonts.ready, customElements.whenDefined('ui-button')]).then(() => {"));
    }
    const r = spawnSync(process.execPath, [path.join(ENGINE, 'scripts', 'render.mjs'), '--lock', lock, '--screen', 'home'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const png = readFileSync(path.join(dir, '.render', 'home.png'));
    rmSync(dir, { recursive: true, force: true });
    return png;
  };
  const plain = render(false);
  const wrapped = render(true);
  assert.ok(plain.equals(wrapped), 'the two screenshots are the same bytes');
});

test('a React component fixture takes its behaviour from the pinned React build, bundles to one page and passes the audit', () => {
  // The layout a skill has: <skill>/captures/<name>/design-lock.json and <skill>/library/fixtures/.
  const skill = tmp();
  const lockDir = path.join(skill, 'captures', 'golden');
  cpSync(path.join(ENGINE, 'fixtures', 'golden'), lockDir, { recursive: true });
  mkdirSync(path.join(lockDir, 'assets'), { recursive: true });
  // The capture's stylesheet declares a face for every font file the golden lock names (none in
  // this tree's golden; a tree whose golden carries a font has a builder that asks for it).
  const faces = (JSON.parse(readFileSync(path.join(lockDir, 'design-lock.json'), 'utf8')).fonts ?? [])
    .flatMap((f) => (f.files ?? []).map((rel) => `@font-face { font-family: "${f.family}"; src: url("../${rel}") format("woff2"); }\n`)).join('');
  writeFileSync(path.join(lockDir, 'assets', 'tokens.css'), `${faces}:root { --surface1: #ffffff; --text1: #1c1b18; --text2: #6b675e; --accent: #0f5132; }\n`);
  cpSync(path.join(ENGINE, 'fixtures', 'ui-sdk', 'react'), path.join(skill, 'library', 'fixtures'), { recursive: true });
  writeFileSync(path.join(skill, 'library', 'fixtures', 'settings.fixture.tsx'), REACT_FIXTURE);
  const lockPath = path.join(lockDir, 'design-lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.screens = [{ id: 'settings', mode: 'B2', url: 'components-fixtures/settings.html', captureWidth: 720, captureHeight: 480, dpr: 1, colorScheme: 'light' }];
  writeFileSync(lockPath, JSON.stringify(lock));

  const script = (name, ...args) => spawnSync(process.execPath, [path.join(ENGINE, 'scripts', name), '--lock', lockPath, ...args], { encoding: 'utf8' });
  const build = script('build-component-fixture.mjs', '--name', 'settings');
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const page = readFileSync(path.join(lockDir, 'components-fixtures', 'settings.html'), 'utf8');
  assert.doesNotMatch(page, /<script[^>]+src=/, 'the page is self-contained: the behaviour is bundled in, nothing is loaded');

  const audit = script('operability-audit.mjs');
  const report = JSON.parse(readFileSync(path.join(lockDir, '.report', 'settings.operable.json'), 'utf8'));
  rmSync(skill, { recursive: true, force: true });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  assert.ok(report.checked.patterns >= 3, 'tabs, switch and radio group are driven');
});

test('verify also holds the React build to the vendored version: a different pin in package.json fails it', () => {
  const pkg = JSON.parse(readFileSync(path.join(ENGINE, 'package.json'), 'utf8'));
  const version = manifest().version;
  assert.equal(pkg.dependencies['@ui-sdk/react'], version, 'pinned exactly, no range');
  assert.equal(pkg.dependencies['@ui-sdk/core'], version);
  const dir = tmp();
  const other = path.join(dir, 'package.json');
  writeFileSync(other, JSON.stringify({ dependencies: { '@ui-sdk/react': '^0.0.1', '@ui-sdk/core': version } }));
  const r = run('verify', '--package', other);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /@ui-sdk\/react/);
});

test('link refuses to replace something that is not its own link (exit 2)', () => {
  const dir = tmp();
  const lock = path.join(dir, 'design-lock.json');
  writeFileSync(lock, JSON.stringify({ name: 'fixture', screens: [] }));
  mkdirSync(path.join(dir, 'ui-sdk'));
  writeFileSync(path.join(dir, 'ui-sdk', 'mine.txt'), 'keep');
  const r = run('link', '--lock', lock);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ui-sdk/);
  assert.equal(readFileSync(path.join(dir, 'ui-sdk', 'mine.txt'), 'utf8'), 'keep');
  rmSync(dir, { recursive: true, force: true });
});

test('update --from: rebuilds a runtime folder from two unpacked packages, and verify then passes on it', () => {
  const from = fakePackages('9.9.9');
  const out = tmp();
  const r = run('update', '--from', from, '--runtime', out);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = manifest(out);
  assert.equal(m.version, '9.9.9');
  assert.deepEqual(Object.keys(m.files).sort(), ['COMPOSITION.md', 'LICENSE', 'testing.js', 'web.js', 'web/chunks/a.js', 'web/tabs.js']);
  assert.ok(!existsSync(path.join(out, 'web.css')));
  const composition = readFileSync(path.join(out, 'COMPOSITION.md'), 'utf8');
  assert.match(composition, /## tabs/);
  assert.match(composition, /ui-tabs-list/);
  assert.match(composition, /<ui-tabs><\/ui-tabs>/);
  assert.doesNotMatch(composition, /Not copied/);
  assert.match(readFileSync(path.join(out, 'testing.js'), 'utf8'), /__uiSdkTesting/);
  const pins = path.join(from, 'package.json');
  writeFileSync(pins, JSON.stringify({ dependencies: { '@ui-sdk/react': '9.9.9', '@ui-sdk/core': '9.9.9' } }));
  assert.equal(run('verify', '--runtime', out, '--package', pins).status, 0);
  assert.match(r.stdout, /npm install --save-exact --ignore-scripts @ui-sdk\/react@9\.9\.9 @ui-sdk\/core@9\.9\.9/, 'update says how to move the React pin');
  rmSync(from, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('update --from: the bundled checker is one script a page can evaluate', async () => {
  const from = fakePackages();
  const out = tmp();
  assert.equal(run('update', '--from', from, '--runtime', out).status, 0);
  const source = readFileSync(path.join(out, 'testing.js'), 'utf8');
  const kit = new Function(`${source}; return __uiSdkTesting;`)();
  assert.equal(await kit.checkPattern('el', 'tabs'), 'tabs:el');
  rmSync(from, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('update replaces a previous runtime whole: a file the new version dropped does not linger', () => {
  const from = fakePackages();
  const out = tmp();
  mkdirSync(path.join(out, 'web'), { recursive: true });
  writeFileSync(path.join(out, 'web', 'gone.js'), 'export {};\n');
  assert.equal(run('update', '--from', from, '--runtime', out).status, 0);
  assert.ok(!existsSync(path.join(out, 'web', 'gone.js')));
  rmSync(from, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('update --from a folder that is not two unpacked packages is a setup error (exit 2), and writes nothing', () => {
  const from = tmp();
  const out = tmp();
  const r = run('update', '--from', from, '--runtime', out);
  assert.equal(r.status, 2);
  assert.ok(!existsSync(path.join(out, 'VENDORED.json')));
  rmSync(from, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('update refuses two packages of different versions, and a version that is not the one asked for (exit 2)', () => {
  const from = fakePackages('9.9.9');
  const out = tmp();
  assert.equal(run('update', '--from', from, '--runtime', out, '--version', '1.0.0').status, 2);
  writeFileSync(path.join(from, 'core', 'package', 'package.json'), JSON.stringify({ name: '@ui-sdk/core', version: '9.9.8' }));
  const r = run('update', '--from', from, '--runtime', out);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /disagree/);
  assert.ok(!existsSync(path.join(out, 'VENDORED.json')));
  rmSync(from, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('outdated: exit 0 when the vendored version is the latest, exit 1 naming both when it is behind', () => {
  const v = manifest().version;
  const same = run('outdated', '--latest', v);
  assert.equal(same.status, 0, same.stdout + same.stderr);
  const behind = run('outdated', '--latest', '99.0.0');
  assert.equal(behind.status, 1);
  assert.match(behind.stdout, new RegExp(v.replaceAll('.', '\\.')));
  assert.match(behind.stdout, /99\.0\.0/);
  assert.match(behind.stdout, /ui-sdk\.mjs update/);
});

test('usage: --help answers, an unknown verb is exit 2', () => {
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /link/);
  assert.equal(run('frobnicate').status, 2);
  assert.equal(run().status, 2);
});
