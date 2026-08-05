# The guided tour: break it on purpose, watch it get caught

This guide takes 15 minutes. You will run the full pipeline on the small practice system that ships with the machine, break a brand rule on purpose, watch the gate catch it, fix it, and watch it pass. After that, you will trust the machine for the same reason you trust a smoke detector you have tested: you have seen it go off.

Do the [installation](README.md#installation) first. Steps 1 to 4 are enough for this guide. You do not need Figma or a real design system yet.

## 1. Meet the practice system

The repository ships a tiny complete design system in `fixtures/golden/`: a design lock, one screen, and a reference screenshot. Make a playground copy so the original stays clean:

```bash
cp -R fixtures/golden /tmp/playground
```

Look inside `/tmp/playground/design-lock.json`. This file is the mold. It holds the colors for the theme, the complete spacing scale, the type roles, the radii, and the screen registration with its pass thresholds. Everything downstream obeys this file and nothing else.

Now look at `/tmp/playground/screen-home.html`. This is a generated artifact: a small banking home screen. Notice that the style section defines tokens in `:root` and every rule below it uses `var(--...)` references. No raw values. That discipline is not a style preference. It is what makes the machine able to check the screen.

## 2. Run the pipeline and see green

```bash
node scripts/verify.mjs --lock /tmp/playground/design-lock.json --screen home
```

You get one line that matters:

```
PASS  home [B2]  lint=ok render=ok geometry=ok diff=ok  globalPct=0.0000% (pass <= 0.5000%)
```

Read it left to right: the content lint passed, the screen rendered deterministically, the layout geometry matched, and the pixel diff against the reference measured 0.0000% against an allowed 0.5000%. That is what "on-brand" looks like as a measurement instead of an opinion.

## 3. Break it on purpose

Open `/tmp/playground/screen-home.html` and find this line (around line 42):

```css
background: var(--accent); color: #fff; border: 0;
```

Replace the token with a hardcoded green, the kind an AI agent reaches for when it stops thinking about your brand and starts thinking about frameworks:

```css
background: #16A34A; color: #fff; border: 0;
```

To a human eye at thumbnail size, the button still looks green. Close enough to survive most reviews. Now run the machine:

```bash
node scripts/verify.mjs --lock /tmp/playground/design-lock.json --screen home
```

```
FAIL  home [B2]  lint=FAIL(1) render=-- geometry=-- diff=--
```

Two things to notice. First, it failed. Second, look at the dashes: the render, geometry, and pixel gates did not even run. The content gate blocks first, by design. A screen with an off-system value never gets to be judged on its looks.

## 4. Read the finding

Ask the lint for the details:

```bash
node scripts/adherence-lint.mjs --lock /tmp/playground/design-lock.json --src /tmp/playground
```

```
[ERROR] raw-hex — screen-home.html:42 — raw hex #16A34A (1x) outside :root/[data-theme]
        — all colors must come from tokens.css vars
```

This is the whole product in one line. Not "something feels off." The exact file, the exact line, the exact value, and the exact rule it broke. This is what you hand back to the AI agent, and it is specific enough that the agent fixes it on the first try.

## 5. Fix it and see green again

Put the token back:

```css
background: var(--accent); color: #fff; border: 0;
```

Run the verification again:

```bash
node scripts/verify.mjs --lock /tmp/playground/design-lock.json --screen home
```

```
PASS  home [B2]  lint=ok render=ok geometry=ok diff=ok  globalPct=0.0000% (pass <= 0.5000%)
```

That round trip, red with a named cause, then green with a measurement, is the entire working loop. In real use, the AI agent generates, the machine judges, the findings go back to the agent, and the loop repeats until green or until the machine says honestly that it cannot converge.

## 6. What you just learned

- The lock is the single source of truth. The screen never argues with it.
- The gates run in a fixed order and the content gate blocks before the visual gates run.
- A failure names its file, line, value, and rule. Feedback is depersonalized: the machine flagged it, not a colleague.
- "On-brand" became a number with a threshold, and the threshold is law.

## 7. Now do it with your own system

The practice system was captured for you. Your real system needs a capture pass:

1. Scaffold your brand skill: README, step 5.
2. Capture your design system with your AI agent: README, step 6. The agent reads your Figma file (or reference images) and writes your lock. It refuses to work from memory of your brand, and that refusal protects you.
3. Calibrate your computer once: README, step 7.
4. Generate your first screen through the agent and verify it: README, step 8.

One warning from experience: the capture is the foundation of everything. Give the agent real sources. A lock built from guesses will happily verify screens against those guesses, and the machine will be precisely, consistently wrong. Fidelity in, fidelity out.
