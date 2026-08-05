# FAQ

## Do I need to be a developer?

You need to be comfortable running commands in a terminal, and that is all the code you touch. The AI agent writes the artifacts; the machine judges them. If you can run `npm install` by following the README, you can run this. Designers and PMs are the intended operators, with a developer nearby being helpful but not required.

## Do I need Figma?

No. Figma (through its MCP server) is the best capture source because it gives the machine exact variables and geometry. But the capture flow also works from reference images: screenshots of your real product, exported brand boards, existing style guides. Image-only capture gives you a slightly weaker gate (no geometry ground truth), and the machine is honest about that in its reports.

## Do I need Claude?

The skill template that teaches an agent your design system is built for [Claude Code](https://claude.com/claude-code). The verification scripts themselves are plain command-line tools with no AI inside; any agent harness that can read a markdown skill and run commands can drive them. If you use a different agent, treat the skill file as a very precise prompt.

## Is my brand data safe if the machine is public?

Yes, by construction. The machine (this repository) is brand-agnostic and contains zero brand content; a release gate proves that on every run by scanning for banned terms, credential patterns, and private paths. Your lock, fonts, captures, and references live in a separate private folder that never enters this repository. You can star, fork, and contribute to the public machine while your bank's design system stays behind your firewall.

## What about licensed brand fonts?

They stay in your private skill folder and are loaded locally at render time. They are never committed to the machine. And if a font fails to load, the renderer refuses to take the screenshot rather than silently measuring a fallback font. A loud failure beats a quiet lie.

## Why did my screen fail at 0.6% when the threshold is 0.5%?

Because 0.6% is more than 0.5%. That sounds flippant, but it is the product's core promise: thresholds are law, and the machine will not round in anyone's favor. A failing screen gets diagnosed (the report shows the worst region, cropped, against the reference), not waved through. If every screen on a machine fails by a small constant margin, run the calibration step; your computer's rendering floor may not be measured yet.

## Can it check social posts, slides, and posters, or only app screens?

Anything with a fixed canvas that a browser can render: app screens, web pages at chosen breakpoints, social formats like 1080x1350, slides at 1920x1080, digital posters and badges at print-pixel dimensions. Register each format as a screen with its own width and height in the lock. True print production (CMYK, bleed, dielines) is out of scope; export verified artwork as PNG or PDF and let your print shop manage color.

## Does it handle dark mode? Multiple brands?

Dark mode: yes. The lock holds separate light and dark color namespaces, each screen declares its color scheme, and mixing namespaces within one screen is a lint error. Multiple brands: one skill folder per brand, all sharing the same machine. Fixing a script once benefits every brand.

## Does it generate images with AI models?

No. It neither calls image models nor contains one. It verifies HTML/CSS artifacts that an agent produced. If your workflow includes AI-generated imagery, the machine can verify the artifact that embeds it (dimensions, placement, palette context, provenance attributes), but the image generation itself happens in your tools.

## What is the "golden fixture"?

A tiny synthetic design system (`fixtures/golden/`) that ships with the machine, used for two things: the self-test (`contract-guard --self-test` runs the whole pipeline on it and must pass, which proves your installation) and the guided tour in [GUIDE.md](GUIDE.md), where you break it on purpose to watch a gate catch you. It belongs to no real brand.

## Does it run on Windows?

Partially, and we only claim what CI proves. The static gates (contract enforcement, schema validation, release hygiene) pass on Windows in an experimental CI lane. The render and pixel pipeline is not tested there, so macOS and Linux remain the supported platforms for full verification. When the pixel path earns a green Windows lane, this answer will change.

## How is this different from a design-token repository?

Tokens describe your system; they cannot check the output. You can have a perfect token pipeline and still ship a screen that ignores it. This machine renders the produced artifact and measures it against the frozen system: geometry, pixels, typography, color, and copy. Description and enforcement are different products; this is the second one. The longer comparison is in the [README](README.md#how-this-is-different).

## The agent says a screen is fine. The machine says it is not. Who wins?

The machine. That is the entire point. Agents are confident; measurements are correct. The findings go back to the agent with the file, line, and rule, and the loop continues until the machine is satisfied or reports honestly that it cannot converge.
