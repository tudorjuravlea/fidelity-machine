#!/usr/bin/env node
// new-system.mjs — scaffold a per-design-system fidelity skill bound to the shared engine.
//
//   node ~/.claude/fidelity-machine/scripts/new-system.mjs --name acme-banking \
//        [--title "Acme Banking"] [--capture acme-banking]
//
// Creates ~/.claude/skills/<name>/ with a SKILL.md instantiated from the engine's
// skill-template.md ({{SYSTEM_NAME}} / {{SYSTEM_TITLE}} / {{CAPTURE_NAME}} filled in) and an
// empty captures/<capture>/ awaiting the capture flow (references/spec-capture.md).
// Refuses to overwrite an existing skill (exit 2). Exit codes per CONTRACT.md: 0 ok · 2 setup.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function fail(msg) {
  console.error(`new-system: ${msg} (exit 2 — setup/usage error)`);
  process.exit(2);
}

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(0);
  }
  if (!a.startsWith('--')) fail(`unexpected argument "${a}" — flags only; see --help`);
  args[a.slice(2)] = argv[++i];
}

const name = args.name;
if (!name) fail('--name is required (kebab-case, becomes the folder + /slash-command)');
if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(`--name "${name}" must be kebab-case (lowercase letters, digits, hyphens)`);
const title = args.title ?? name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const capture = args.capture ?? name;
if (!/^[a-z][a-z0-9-]*$/.test(capture)) fail(`--capture "${capture}" must be kebab-case`);

const skillDir = path.join(homedir(), '.claude', 'skills', name);
if (existsSync(skillDir)) fail(`skill already exists at ${skillDir} — refusing to overwrite; pick another --name or remove it first`);

const templatePath = path.join(ENGINE, 'skill-template.md');
if (!existsSync(templatePath)) fail(`engine template missing at ${templatePath}`);
const skillMd = readFileSync(templatePath, 'utf8')
  .replaceAll('{{SYSTEM_NAME}}', name)
  .replaceAll('{{SYSTEM_TITLE}}', title)
  .replaceAll('{{CAPTURE_NAME}}', capture);
if (/\{\{[A-Z_]+\}\}/.test(skillMd)) fail('template still contains unfilled {{PLACEHOLDER}}s — template and scaffolder are out of sync');

const captureDir = path.join(skillDir, 'captures', capture);
mkdirSync(path.join(captureDir, 'fonts'), { recursive: true });
mkdirSync(path.join(captureDir, 'reference'), { recursive: true });
writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
writeFileSync(path.join(captureDir, 'README.md'),
  `# ${title} — capture pending\n\n` +
  `No design-lock.json yet. Run the capture flow (${ENGINE}/references/spec-capture.md):\n` +
  `1. Authorize the Figma MCP; get node-specific design links (tokens page, component sheet, screens).\n` +
  `2. Model calls get_variable_defs / get_metadata / get_screenshot → writes capture.json here.\n` +
  `3. node ${ENGINE}/scripts/capture-figma.mjs --input capture.json --out design-lock.json\n` +
  `4. Add fonts (woff2 into fonts/, wired into the lock's fonts[]), signatures/donts, content layer.\n` +
  `5. node ${ENGINE}/scripts/adherence-lint.mjs --lock design-lock.json\n\n` +
  `The skill's blocking gate refuses generation until this lock exists and lints clean.\n`);

console.log(`scaffolded: ${skillDir}`);
console.log(`  SKILL.md            — /${name} slash command (registers on next session/skill reload)`);
console.log(`  captures/${capture}/ — awaiting capture (see its README.md)`);
console.log(`engine: ${ENGINE} (shared — do not copy scripts into the skill)`);
