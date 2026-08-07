# Information architecture and navigation

Rules for structuring and navigating any generated surface with more than one screen or
section: sites, apps, dashboards, doc sets. IA decides the groups, labels, and structure;
navigation is how users reach them. Design IA first; navigation depends on a stable IA.

Adapted from `ia-practitioner` by Sidhanth Povil (MIT,
github.com/sidhanth-povil/ia-practitioner), itself distilled from practitioner texts
(Spencer; Morville and Rosenfeld; Krug; Marquis; Covert; Resmini and Rosati). Re-expressed
for lock-driven generation; labels and vocabulary come from the lock's content rules.

## The three jobs

1. Organise content into groups that make sense to users, not to the organisation.
2. Describe those groups with labels users recognise.
3. Provide paths for users to reach what they need.

Every IA decision sits at the intersection of people (tasks, terminology, mental models),
content (what exists, its structure and volume), and context (business goals, constraints).
Missing any one of the three produces a failed structure.

## Support all five seeking modes

| Mode | Behaviour | Support with |
|---|---|---|
| Known-item | Knows what they want, not where it is | Search, A-Z or index, direct labels |
| Exploratory | Browsing, learning what exists | Clear categories, related links |
| Re-finding | Getting back to something seen before | Search, recents, stable URLs |
| Does not know what they need | No starting question | Guided paths, progressive disclosure |
| AI-mediated | An assistant reads the surface on the user's behalf | Explicit facts near headings, plain-language labels, terminology consistent everywhere |

Most structures are built only for exploratory seeking. AI-mediated seeking wraps around
the others: implicit, buried, or jargon-labelled information gets omitted or misstated by
the assistant before the user ever arrives.

## Choosing the scheme

Subject/topic hierarchy is the default. Task schemes fit frequent well-defined tasks.
Time fits news and events; alphabetical is a secondary index, almost never primary;
geography works only when users know the boundaries; format is a filter, never primary
(users think topic first, then format).

Hard rules:

- **Audience-based navigation rarely works as the primary scheme.** Users cannot reliably
  self-identify, content overlaps audiences, and duplication follows. Use audience or task
  entry points over a subject hierarchy instead.
- **Conway's Law is a defect, not a default.** Navigation that mirrors the org chart
  (departments, internal team names, acquired-brand names) fails users who do not know the
  internal structure. Categorise by user need, with rationale: define what belongs in a
  category and why, then assess each item against those criteria.

## Structural budgets

- Hierarchy: 3 to 5 levels, 4 to 9 items per node. Single-child categories are a smell.
- Primary navigation: 4 to 8 items. More items means slower decisions.
- Catalogue paths: at most 3 category levels before reaching items; listing (gallery)
  pages are the hardest-working pages and deserve the most design attention.
- Most real structures are a hierarchy plus database sections (10+ items of one shape,
  filterable). Do not over-engineer past that.

## Navigation kit

Primary nav exposes the top-level structure and stays identical everywhere. Secondary nav
is contextual within a section and always shows its parent. Utility nav holds account,
search, cart. Contextual links live in body content. Supplemental rescue paths: breadcrumbs
(essential in hierarchies), A-Z index, sitemap. Footer repeats first-level nav or holds
secondary links.

Principles, all checkable on a rendered screen:

1. Users always know where they are: active states, breadcrumbs, and a page title that
   matches the navigation label that led there. A nav/H1 mismatch creates doubt.
2. No hover-only navigation; everything reachable on touch.
3. Every page offers a clear next step. A page without a primary action is a dead end.
4. Balanced pathways: too many paths cause choice paralysis, too few cause dead ends.
   Fewer, clearer items usually outperform more.
5. Weak information scent (users backtracking) is a structure bug, not a user bug.

## Labels

- Use the users' exact terminology, never internal jargon or invented terms. The lock's
  content rules (locked strings, do-say and don't-say lists) are the controlled vocabulary;
  labels draw from it and stay identical across surfaces.
- Parallel structure within a group (all nouns or all verbs, not mixed).
- No junk drawers: "Resources", "Information", "More", and quick-links modules signal a
  structural failure. Fix the structure, not the label.
- No clever labels: "Explore", "Discover", "Moments" tell users nothing.
- Test: would a first-time user predict what lives behind each top-level label?

## Search

Search is a navigation system, not a bandage for bad structure; fix the navigation first.
When search exists: index destination pages, not navigation pages. Zero results is never a
dead end: always offer revision, tips, a browse path, and a human contact.

## Anti-patterns (instant fails)

| Anti-pattern | Problem |
|---|---|
| Org-chart navigation | Users do not know which department owns what |
| Audience tabs as primary nav | Self-identification fails; content duplicates |
| More than 8 top-level items | Decision paralysis |
| Nav label differs from page heading | Users doubt their location |
| Junk-drawer categories, quick links | Structural failure made visible |
| Hover-dependent menus | Unusable on touch |
| Pages without a next step | Dead ends |
| Footer as the only navigation | Users do not scroll to find nav |

## Gate integration

- Lint-checkable: nav label equals page H1 on every generated screen; label vocabulary
  within the lock's do-say list; no banned junk-drawer labels.
- Self-critique adds: which seeking modes does this surface support? Would a first click
  from each top task land on the right top-level item (first-click choice is the strongest
  single predictor of task success)? Are budgets respected?
- Structures with renamed or moved high-traffic sections should be tree-tested before
  shipping; the generator proposes, testing validates.
