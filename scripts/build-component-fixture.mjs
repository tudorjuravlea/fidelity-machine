#!/usr/bin/env node
// build-component-fixture.mjs — bundle a React component fixture into a self-contained
// HTML page next to the lock, renderable by render.mjs (CONTRACT.md invariants).
//
//   node build-component-fixture.mjs --lock <design-lock.json> --name <fixture-name>
//     [--lib <library-dir>]   default: <skillRoot>/library  (lockDir/../../library)
//     [--width <cssPx>]       fixture root width  (default: fixture decides)
//     [--height <cssPx>]      fixture root height (default: auto)
//
// Input : <lib>/fixtures/<name>.fixture.tsx   (default-exports a React element OR
//         renders itself into #root — see template below)
// Output: <lockDir>/components-fixtures/<name>.html   (tokens.css + @font-face inlined,
//         js bundled inline, sets data-render-ready after fonts.ready + 2 RAFs)
//
// Exit codes per CONTRACT.md: 0 ok · 2 setup/usage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };

const lockPath = opt('lock');
const name = opt('name');
if (!lockPath || !name) { console.error('usage: --lock <design-lock.json> --name <fixture>'); process.exit(2); }
const lockDir = path.dirname(path.resolve(lockPath));
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const libDir = path.resolve(opt('lib', path.join(lockDir, '..', '..', 'library')));
const entry = path.join(libDir, 'fixtures', `${name}.fixture.tsx`);
if (!fs.existsSync(entry)) { console.error(`no fixture: ${entry}`); process.exit(2); }

let esbuild;
try { esbuild = await import(path.join(ENGINE, 'node_modules', 'esbuild', 'lib', 'main.js')); }
catch { console.error('esbuild missing — run: npm i esbuild react react-dom (in the engine)'); process.exit(2); }

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  outdir: 'dist-virtual', // never written (write:false); required for css imports
  format: 'iife',
  jsx: 'automatic',
  minify: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(ENGINE, 'node_modules')],
  absWorkingDir: libDir,
});
const js = result.outputFiles.filter((f) => f.path.endsWith('.js')).map((f) => f.text).join('\n');
const bundledCss = result.outputFiles.filter((f) => f.path.endsWith('.css')).map((f) => f.text).join('\n');

const tokensCss = fs.readFileSync(path.join(lockDir, 'assets', 'tokens.css'), 'utf8');
const fontFaces = (lock.fonts ?? []).flatMap((f) =>
  (f.files ?? []).map((rel, i) => {
    const weight = (f.weights ?? [])[i] ?? 400;
    return `@font-face{font-family:"${f.family}";src:url("../${rel}") format("woff2");font-weight:${weight};font-style:normal;font-display:block;}`;
  })).join('\n');

const width = opt('width');
const height = opt('height');
const rootSize = `${width ? `width:${width}px;` : ''}${height ? `height:${height}px;` : ''}`;

const theme = opt('theme', 'light');
const html = `<!doctype html>
<html lang="en"${theme !== 'light' ? ` data-theme="${theme}"` : ''}>
<head>
<meta charset="utf-8">
<style>
${fontFaces}
${tokensCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
#root{${rootSize}overflow:hidden}
${bundledCss}
</style>
</head>
<body>
<div id="root"></div>
<script>
${js}
</script>
<script>
(async () => {
  // Force-load every declared weight — render.mjs asserts all fontChecks (CONTRACT §7).
  await Promise.all(${JSON.stringify((lock.fonts ?? []).flatMap((f) => f.fontChecks ?? []))}.map((c) => document.fonts.load(c)));
  await document.fonts.ready;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.documentElement.setAttribute('data-render-ready', '1');
})();
</script>
</body>
</html>
`;

const outDir = path.join(lockDir, 'components-fixtures');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${name}.html`);
fs.writeFileSync(out, html);
console.log(`built ${path.relative(process.cwd(), out)} (${(js.length / 1024).toFixed(0)}kB js inlined)`);
