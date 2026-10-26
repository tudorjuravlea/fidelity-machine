#!/usr/bin/env node
// Writes the synthetic prototype clip the golden-devices fixture plays: a phone screen (390 x 844) with placeholder
// rows and one accent bar, in the fixture lock's own colours, and three bursts of localised action for the zoom to
// visit. Numbered JPEG frames under assets/prototype-clip/ (the kit's clip.js addresses a recording by frame index)
// plus clip.json with the rate and the count. No product, no brand: nothing a client made enters the engine.
//
//   node fixtures/motion/make-prototype-clip.mjs
//
// The bursts, so the analyser (scripts/activity.mjs) has something to find and something it should miss:
//   1.5-2.6 s  a tap: a button bottom-right presses and a ring spreads from it  (small, localised)
//   3.8-5.2 s  a sheet rises from the bottom edge                                (large, still localised)
//   6.5-7.3 s  a toggle top-left flips                                           (tiny: below the analyser's bar, its stop is written by hand)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'assets', 'prototype-clip');
const FPS = 10, SECONDS = 8, W = 390, H = 844;
const lock = JSON.parse(fs.readFileSync(path.join(HERE, 'design-lock.json'), 'utf8'));
const c = lock.tokens.colors.light;
const ease = p => 1 - (1 - p) * (1 - p);
const ramp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

const frame = t => {
  const tap = t >= 1.5 && t < 2.6 ? (t - 1.5) / 1.1 : -1;
  const sheet = t >= 3.8 ? ramp(t, 3.8, 5.2) : 0;
  const tog = t >= 6.5 ? ramp(t, 6.5, 7.3) : 0;
  return `<!doctype html><html><head><style>
  body{margin:0;width:${W}px;height:${H}px;background:${c.surface1};overflow:hidden;position:relative}
  .bar{position:absolute;left:40px;top:110px;width:140px;height:12px;border-radius:6px;background:${c.accent}}
  .row{position:absolute;left:40px;height:14px;border-radius:7px;background:${c.border}}
  .block{position:absolute;left:40px;top:150px;width:310px;height:180px;border-radius:12px;background:${c['accent-subtle']}}
  .btn{position:absolute;left:230px;top:640px;width:120px;height:48px;border-radius:10px;background:${c.accent};transform:scale(${tap >= 0 ? 1 - 0.08 * Math.sin(Math.PI * Math.min(1, tap * 2)) : 1})}
  .ring{position:absolute;left:280px;top:654px;width:20px;height:20px;border-radius:50%;border:3px solid ${c.text1};opacity:${tap >= 0 ? 1 - tap : 0};transform:scale(${tap >= 0 ? 1 + 3 * ease(tap) : 1})}
  .sheet{position:absolute;left:0;right:0;height:360px;top:${H - 360 * ease(sheet)}px;background:${c.text1};border-radius:24px 24px 0 0;opacity:${sheet > 0 ? 1 : 0}}
  .sheet i{position:absolute;left:40px;height:14px;border-radius:7px;background:${c.text2}}
  .tog{position:absolute;left:40px;top:40px;width:56px;height:32px;border-radius:16px;background:${tog > 0.5 ? c.accent : c.border}}
  .tog b{position:absolute;top:4px;left:${4 + 24 * ease(tog)}px;width:24px;height:24px;border-radius:50%;background:${c.surface1}}
  </style></head><body>
  <div class="tog"><b></b></div>
  <div class="bar"></div><div class="block"></div>
  <div class="row" style="top:350px;width:260px"></div><div class="row" style="top:380px;width:310px"></div><div class="row" style="top:410px;width:180px"></div>
  <div class="row" style="top:470px;width:310px"></div><div class="row" style="top:500px;width:230px"></div>
  <div class="btn"></div><div class="ring"></div>
  <div class="sheet"><i style="top:40px;width:200px"></i><i style="top:80px;width:280px"></i><i style="top:120px;width:160px"></i></div>
  </body></html>`;
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const n = FPS * SECONDS;
let bytes = 0;
for (let i = 0; i < n; i++) {
  await page.setContent(frame(i / FPS));
  const file = path.join(OUT, `${String(i).padStart(4, '0')}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  bytes += fs.statSync(file).size;
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'clip.json'), JSON.stringify({ fps: FPS, frames: n, width: W, height: H, note: 'synthetic prototype clip, written by fixtures/motion/make-prototype-clip.mjs' }, null, 2) + '\n');
console.log(`${n} frames at ${FPS} fps, ${W}x${H}, ${(bytes / 1024).toFixed(0)} KB → ${OUT}`);
