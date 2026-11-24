// Planted breaks for adherence-lint's raw-colour scanners (keywords and modern colour functions).
//   node scripts/mutation-run.mjs fixtures/lint/raw-colour-notations.mutations.mjs
// Each entry replaces one piece of the scanner; the suite named below must fail for every one.
// A break whose `find` text has left the file is reported NOT APPLIED and fails the run: update
// the entry (or delete it, if the code it broke is gone) rather than leave a list that proves less
// than it says.
export default {
  "target": "scripts/adherence-lint.mjs",
  "copy": [
    "scripts",
    "fixtures/lint",
    "design-lock.schema.json"
  ],
  "test": [
    "node",
    "--test",
    "fixtures/lint/raw-colour-notations.test.mjs"
  ],
  "mutations": [
    {
      "name": "value lookbehind loses \"-\"",
      "find": "(?<![\\\\w.#@$-])(?:${NAMED_ALT})",
      "replace": "(?<![\\\\w.#@$])(?:${NAMED_ALT})"
    },
    {
      "name": "value lookbehind loses \".\" and \"#\"",
      "find": "(?<![\\\\w.#@$-])(?:${NAMED_ALT})",
      "replace": "(?<![\\\\w@$-])(?:${NAMED_ALT})"
    },
    {
      "name": "value lookahead loses the function guard",
      "find": "(?![\\\\w-]|\\\\s*\\\\()",
      "replace": "(?![\\\\w-])"
    },
    {
      "name": "value lookahead loses the word guard",
      "find": "(?![\\\\w-]|\\\\s*\\\\()",
      "replace": "(?!\\\\s*\\\\()"
    },
    {
      "name": "declaration lookbehind dropped",
      "find": "const CSS_DECL = /(?<![\\w-])(",
      "replace": "const CSS_DECL = /("
    },
    {
      "name": "every property read as a paint",
      "find": "} else if (PAINT_PROP.test(d[1])) {",
      "replace": "} else {"
    },
    {
      "name": "vendor prefix not accepted",
      "find": "const PAINT_PROP = /^(?:-(?:webkit|moz|ms|o)-)?(?:",
      "replace": "const PAINT_PROP = /^(?:"
    },
    {
      "name": "-color suffix family dropped",
      "find": "(?:(?:[a-z-]+-)?color|(?:background",
      "replace": "(?:color|(?:background"
    },
    {
      "name": "shorthand longhands dropped",
      "find": "column-rule|text-stroke)(?:-[a-z-]+)?|fill",
      "replace": "column-rule|text-stroke)|fill"
    },
    {
      "name": "important not stripped from a custom property",
      "find": "const whole = d[2].replace(/!important\\s*$/i, '').trim();",
      "replace": "const whole = d[2].trim();"
    },
    {
      "name": "custom property read word by word",
      "find": "if (d[1].startsWith('--')) {",
      "replace": "if (false) {"
    },
    {
      "name": "custom property never read",
      "find": "if (NAMED_COLOURS.has(whole.toLowerCase())) hit(valueAt + d[2].indexOf(whole), whole);",
      "replace": ""
    },
    {
      "name": "script value no longer needs quotes",
      "find": "([\"'\\`])\\\\s*(${NAMED_ALT})\\\\s*\\\\1",
      "replace": "([\"'\\`]?)\\\\s*(${NAMED_ALT})\\\\s*\\\\1"
    },
    {
      "name": "strings and urls not blanked",
      "find": "for (const m of blankStringsAndUrls(d[2]).matchAll(NAMED_IN_VALUE))",
      "replace": "for (const m of d[2].matchAll(NAMED_IN_VALUE))"
    },
    {
      "name": "conditions not blanked for keywords",
      "find": "for (const d of blankAtRuleConditions(css).matchAll(CSS_DECL))",
      "replace": "for (const d of css.matchAll(CSS_DECL))"
    },
    {
      "name": "conditions not blanked for functions",
      "find": "scanModernColourHits(f.ext === '.css' || f.ext === '.html' ? blankAtRuleConditions(buf) : buf)",
      "replace": "scanModernColourHits(buf)"
    },
    {
      "name": "keyword case not folded",
      "find": "const hit = (index, word) => hits.push({ index, raw: word.toLowerCase(), hex: NAMED_COLOURS.get(word.toLowerCase()) });",
      "replace": "const hit = (index, word) => hits.push({ index, raw: word, hex: NAMED_COLOURS.get(word) });"
    },
    {
      "name": "keyword offset off by the property",
      "find": "const valueAt = offset + d.index + d[0].length - d[2].length;",
      "replace": "const valueAt = offset;"
    },
    {
      "name": "inline scripts not read",
      "find": "for (const b of scripts) inJs(stripJsComments(b.js), b.offset);",
      "replace": ""
    },
    {
      "name": "script comments not stripped",
      "find": "for (const b of scripts) inJs(stripJsComments(b.js), b.offset);",
      "replace": "for (const b of scripts) inJs(b.js, b.offset);"
    },
    {
      "name": "paint attributes not read",
      "find": "if (a.name !== 'style' && a.name !== 'class' && NAMED_COLOURS.has(a.value.trim().toLowerCase())) hit(a.index, a.value.trim());",
      "replace": ""
    },
    {
      "name": "class attribute read as a paint",
      "find": "a.name !== 'style' && a.name !== 'class' && NAMED_COLOURS",
      "replace": "a.name !== 'style' && NAMED_COLOURS"
    },
    {
      "name": "jsx and js files not read",
      "find": "inJs(stripJsComments(f.content), 0);",
      "replace": ""
    },
    {
      "name": "keywords never grouped into findings",
      "find": "for (const h of scanNamedColourHits(f)) {",
      "replace": "for (const h of []) {"
    },
    {
      "name": "keywords grouped by hex, not name",
      "find": "const key = `name:${h.raw}`;",
      "replace": "const key = `fn:${h.hex}`;"
    },
    {
      "name": "a keyword in the table is wrong",
      "find": "rebeccapurple 663399",
      "replace": "rebeccapurple 663398"
    },
    {
      "name": "white dropped from the table",
      "find": " white ffffff ",
      "replace": " "
    },
    {
      "name": "colour space not removed from channels",
      "find": "if (m[1].toLowerCase() === 'color') parts.shift();",
      "replace": ""
    },
    {
      "name": "channels not validated",
      "find": "if (parts.length !== 3 || !parts.every((p) => channel.test(p))) continue;",
      "replace": "if (parts.length !== 3) continue;"
    },
    {
      "name": "channel count not checked",
      "find": "if (parts.length !== 3 || !parts.every((p) => channel.test(p))) continue;",
      "replace": "if (!parts.every((p) => channel.test(p))) continue;"
    },
    {
      "name": "transparent modern colour counted",
      "find": "if (parseFloat(alpha) === 0) continue; // fully transparent, as in colorFunctionHex",
      "replace": ""
    },
    {
      "name": "modern function list loses lab",
      "find": "(oklch|oklab|lab|lch|hwb|color)\\(([^()]*)\\)",
      "replace": "(oklch|oklab|lch|hwb|color)\\(([^()]*)\\)"
    },
    {
      "name": "modern function list loses hwb",
      "find": "(oklch|oklab|lab|lch|hwb|color)\\(([^()]*)\\)",
      "replace": "(oklch|oklab|lab|lch|color)\\(([^()]*)\\)"
    },
    {
      "name": "modern findings downgraded to WARN",
      "find": "add('ERROR', 'raw-hex', rel(f.abs),\n        `raw colour ${g.raw} (${g.count}x)",
      "replace": "add('WARN', 'raw-hex', rel(f.abs),\n        `raw colour ${g.raw} (${g.count}x)"
    },
    {
      "name": "modern findings never reported",
      "find": "for (const g of unconverted.values()) {",
      "replace": "for (const g of []) {"
    },
    {
      "name": "modern line taken from the file start",
      "find": "`raw colour ${g.raw} (${g.count}x) outside :root/[data-theme] — all colors must come from tokens.css vars`, lineOf(buf, g.firstIdx),",
      "replace": "`raw colour ${g.raw} (${g.count}x) outside :root/[data-theme] — all colors must come from tokens.css vars`, 1,"
    },
    {
      "name": "modern whitespace not normalised",
      "find": "hits.push({ index: m.index, raw: m[0].replace(/\\s+/g, ' ') });",
      "replace": "hits.push({ index: m.index, raw: m[0] });"
    }
  ]
};
