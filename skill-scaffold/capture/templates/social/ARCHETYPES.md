# Social archetypes — {{SYSTEM_TITLE}}

Social canvases are NET-NEW surfaces (no capture reference): lint + taste + render + human
review carry them. Formats come from `../../formats.json` (`screen` block); filenames encode
`<archetype>-<format>.html`. Respect the story format's declared safe zones.

## Type scale (social medium)

Template-local sizes; families, weights and colors stay lock tokens. Fill from the lock and
record as a DECISIONS.md row:

- `social-headline` — per-format sizes (portrait/square vs story vs banner differ)
- `social-body` — lead paragraph
- `social-eyebrow` — kicker row, with the system's marker if it has one
- `social-caption` — attribution, footer line

## Archetypes

- `announcement` — event/talk/webinar: date, time (with timezone), venue/link slot, speaker.
- `insight` — one number verbatim from a named source + a one-line label.
- `quote` — the words + attribution (name, role); client quotes need permission.

Per archetype, record here: its grid, its slots, and which formats it ships in. The
distribution playbook (`references/playbook.md` in the skill root) routes occasions to
archetypes.

## Cover archetypes — a person and a title on a portrait canvas

For the `social-3x4` format (and `social-portrait` when a person carries the post): a cover whose
job is to be chosen in a feed of thumbnails. Ten compositions, each a fixed part and a variable
part; the type, the colours and the props stay lock tokens and captured assets, the composition
is the archetype's. The person is a captured cut-out (`tools/cutout.swift`, `prep-cutouts.mjs`),
never a generated likeness: identity is verbatim by construction, which is the imagery policy's
first tier.

**The law of layers.** Name the depth order before placing anything: background, title, person,
props, in that order unless the archetype says otherwise. The title sits behind the person and is
partly occluded by the person and the props, which is what makes it read as one picture rather than
a caption on a photo. A few small props may clip the edges of the title; none may cover the face.
In the direct-gaze archetype the title splits above and below the face and never crosses the eyes
or the mouth.

**The safe margin.** Every key element (face, title, main prop) keeps the format's `safeZone`
clear: 10% of each edge on `social-3x4`. A thumbnail is cropped and overlaid by the platform; what
touches the edge is what gets lost.

| Archetype | Person | Title | Else | Pick when |
|---|---|---|---|---|
| `centred-dark` | centred, half-length, centre of the frame | huge, behind the person, partly occluded | a dark gradient ground; a few small floating props with a soft shadow | the post needs the most impact per pixel |
| `flat-cutout` | half-length, pushing one prop toward the camera (near large, perspective) | behind the prop, partly occluded | one flat colour, no gradient; a few flat icons | one object is the story |
| `product-hero` | small (about a quarter of the width), to one side, gesturing at the product | pressed against the product's top edge or into the darker area | the screenshot or product at 60–70% of the frame, legible | a UI capture or a product image exists |
| `before-after` | centred, one card in each hand | behind the person | near card large and bright, far card small and dim; cards carry the two states as text | the content is a comparison |
| `quiet-whitespace` | small (about a fifth), in a corner, facing the empty side | the only focus, in the whitespace, lighter weight, loose tracking | more than 60% of the frame empty; no props | restraint is the message |
| `collage` | mid-ground, partly covered by the foreground | between the layers, white or outlined | foreground prop large with shadow; background props blurred and scattered; every layer occludes the one behind | several captured assets exist |
| `person-aside` | 25–35% of the width, to one side, body and gaze toward the title | fills the other 60–70%, dark on light, vertical or two lines | a neutral or light ground | the title is long or carries the idea |
| `back-view` | seen from behind, no face, in motion (looking up, walking, arms open) | above the person, loose tracking | the thing the person faces is the main visual; a wide, deep ground | the post is aspirational or a beginning |
| `partial-presence` | a hand, half a face or a profile at an edge, 15–25% | over or beside the product | the product is the whole subject, sharp and legible | the person is a witness, not the subject |
| `direct-gaze` | frontal, centred, eyes on the camera, the face is the subject | split above and below the face, never over the eyes or mouth, large then slightly smaller | a saturated flat ground or a dark gradient; at most one tiny prop each side | the emotion is the message |

**Choosing one.** Read the post first. Recommend one or two archetypes with one reason each,
then show the whole table and take the choice; in the same round, offer one to three title
candidates within the format's word budget (four to eight characters in a CJK script, three to
six words in a Latin one). Ask once per dependency: the archetype and the title together, then
the assets (the cut-out, the product capture), then the visual details (expression, ground,
weight, title colour) as one numbered list where anything unanswered is the archetype's default.
Three rounds, never one question at a time.

**What is written per cover.** The expression and the pose in concrete terms (where the hands
are, what the body does); what the main prop looks like and what is on it; the layer order and
who occludes whom; the ground; the title text in quotes. Nothing abstract, nothing glowing: a
concept is shown as an everyday object, and holographic or particle effects are banned as cheap.
Each archetype has its own ground and type logic; the same palette and weight across all ten is
the tell of a template run.

The archetypes and their fixed/variable split are re-expressed from oh-my-cover-design (MIT) and
its derivative gbro-cover-design (MIT), where they are prompts for an image model; here the
person is a captured asset and the composition is built and gated like any lock screen
(`../../NOTICE`).
