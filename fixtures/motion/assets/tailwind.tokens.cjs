/* tailwind.tokens.cjs — DERIVED from ../design-lock.json ("motion-fixture", captured 2026-10-13)
 * by scripts/capture-figma.mjs. HAND-EDITING BANNED (CONTRACT.md): edit the lock
 * (or re-capture), then re-derive. Spread into tailwind.config theme.extend. */
"use strict";
module.exports = {
  "colors": {
    "background": "var(--background)",
    "surface1": "var(--surface1)",
    "border": "var(--border)",
    "text1": "var(--text1)",
    "text2": "var(--text2)",
    "accent": "var(--accent)",
    "accent-subtle": "var(--accent-subtle)",
    "error": "var(--error)"
  },
  "spacing": {
    "2": "var(--space-2)",
    "3": "var(--space-3)",
    "4": "var(--space-4)",
    "6": "var(--space-6)",
    "8": "var(--space-8)"
  },
  "borderRadius": {
    "control": "var(--radius-control)",
    "container": "var(--radius-container)"
  },
  "fontFamily": {
    "heading": [
      "var(--font-heading-family)"
    ],
    "body": [
      "var(--font-body-family)"
    ],
    "label": [
      "var(--font-label-family)"
    ]
  },
  "transitionDuration": {
    "fast": "var(--motion-fast)",
    "standard": "var(--motion-standard)",
    "emphasized": "var(--motion-emphasized)"
  },
  "transitionTimingFunction": {
    "standard": "var(--motion-ease-standard)",
    "decelerate": "var(--motion-ease-decelerate)",
    "accelerate": "var(--motion-ease-accelerate)"
  }
};
