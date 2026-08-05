---
reference: microcopy-patterns
vendored-from: Tudor's ux-writing KB — kb-craft/01-patterns/*, kb-banking/05-banking-layer/high-stakes-patterns.md, kb-behavioural/* (frozen 2026-07-21)
role: Part 5 content pass — per-element patterns, banking high-stakes overlays, behavioral guardrails
---

# Microcopy Patterns

Patterns are constant; voice + regulatory constraints are the variable layered on top
(`microcopy-voice.md`). No slot ships lorem or ad-hoc text: populate from the pattern,
shape with the voice chart, score against the rubric, apply the **Banking** overlays.

> **⚠ Legal — stated once, applies to every Banking overlay below:** all banking-specific
> copy (disclosures, consent, fees, irreversibility, retention, security wording) is a
> generated **draft pending Legal/Compliance sign-off**. The pipeline surfaces such
> strings with a `⚠ Legal` flag and never auto-resolves them; legal strings are never
> machine-paraphrased. Mandatory-disclosure presence is linted from the lock's
> `content.disclosureInventory` — absence blocks the content gate regardless of visuals.

## Slot schema (how text gets populated)

Every text slot is typed:
**element type** (`button | label | placeholder | error | success | empty-state | tooltip | title | cta`)
× **context** (which screen + what the user is doing) × **tone** (emotion→tone map in
`microcopy-voice.md`). **Voice is kept separate from element type** — one chart governs all.

Per slot: pick the matching pattern below → draft what you'd say aloud, key information
front-loaded → run the 4-pass edit → emit **RO (native copy, not a translation) + EN**.
Slots map to `data-slot` in markup and must flex (no fixed widths, ≥2 lines of vertical
slack on labels/errors/empty states — `microcopy-a11y-i18n.md`).

## The 4-pass edit — in this order

1. **Purposeful** — should this text exist at all? Cut anything serving no user or
   business goal ("If I remove this, does the user fail at their task?"). Deciding this
   first avoids polishing copy that should be deleted. Rename before you explain.
2. **Concise** — remove filler ("please", "in order to", "simply"), redundancy,
   qualifiers. **Never cut a mandatory disclosure** — make it clear, not absent.
3. **Conversational** — read it aloud; replace system language with human language
   ("We couldn't save your changes", not "The operation failed"); active voice.
4. **Clear** — resolve ambiguity, front-load the signal, make the next action obvious,
   match terminology to the rest of the product.

Word count rises through Purposeful, drops in Concise, rises slightly in the last two
passes as connectors and specificity return — that arc is normal.

## Errors — `[What failed]. [Why, if known]. [What to do next].`

Never a tech code, never blame, never a dead end. Say what's *possible*, not what's
forbidden ("Password must be 8–64 characters", not "Password is invalid"). Banish the
words "error" and "failure" — describe the problem without labeling it. For
ultra-familiar cases (wrong password) one line suffices — skip the obvious half. When
the user can't fix it, say so: "This isn't something you can fix right now — try again
in a few minutes."

| Type | Formula | Example |
|---|---|---|
| Validation (inline, on blur) | `[Field] [specific requirement]` | "Email must include @" |
| System (modal/banner) | `[Action failed]. [Likely cause]. [Recovery step].` | "Payment failed. Your card was declined. Try a different payment method." |
| Blocking (full-screen) | `[What's blocked]. [Why]. [Specific action needed].` | "Subscription expired. Your account is paused. Renew to restore access." |
| Permission | `[User benefit]. [Permission needed].` | "Get notified when orders ship. Enable notifications." |

**Banking:** failed payments name a real cause + a real next step — never just
"Declined": "We couldn't send this payment. Your daily limit is reached. Try again
tomorrow or raise your limit." Financial errors are Cautious/Frustrated tone — no wit.

## Forms & inputs

- **Always a visible label** — never placeholder-as-label (vanishes on focus, fails
  screen readers). Label in the user's words ("Card number", not "PAN").
- Placeholders carry format hints only ("MM/YY", "e.g. name@example.com").
- Help text sits below the field, before the user types — prevention beats correction.
- Inline validation on blur; quiet success on high-uncertainty fields ("Username
  available"). **Never clear the user's input on error.**
- One required/optional convention per form; pair every marker with a text/aria
  equivalent — never color or `*` alone.
- The submit button names the outcome: "Create account", not "Submit".
- Reassure changeability — "You can change this anytime" (kills silent abandonment).
- Explain *why* sensitive data is needed, at the field where you ask.

**Banking (KYC / identity / payment):** mandatory fields and disclosure language cannot
be cut — reduce friction with clear labels, format hints, and inline validation instead.
Why-copy pattern: "We need your ID to verify your identity, as required by law."

## Empty states — three types, never a dead end

| Type | Formula | Example |
|---|---|---|
| First-use | [What's empty] + [benefit] + [one action] | "No projects yet / Create your first project to start organizing work. / Create project" |
| User-cleared | Reassure; confirm it's expected | "All caught up / You've handled every task." |
| No-results | [What wasn't found] + [concrete recovery] | "No results for 'vintage cameras' / Try different keywords or browse all items. / Browse all items" |

Exactly one obvious next step. No-results recovery is a concrete menu — category,
broader/narrower term, "did you mean", similar items, save the search — never a vague
"try different keywords". First-use is a pitch: what *will* be here and why it's worth it.

## Confirmations — only for destructive / irreversible actions

Formula: **question title** + **plain-consequence body** + **buttons that name the
action** — never Yes/No.

> "Delete account? / You'll lose all data and this can't be undone. / Delete account · Cancel"

**Banking:** money movement states **irreversibility before the action** ("This payment
can't be cancelled once sent"), and the confirmation **restates amount + recipient +
timing**: "Send €500 to Maria Popescu. Arrives tomorrow by 6 PM." Account closure
surfaces anything irreversible plus regulatory retention: "Close this account? Your
transaction history will be deleted after 90 days. Close account / Keep account."
Consent is **specific and unbundled** — never pre-ticked, never buried in unrelated copy.

## Success — talk to the user, not the system

State the outcome + what's next + when. Hit ≥2 of the three goals: certainty (it
worked), instruct (name the next step), connect (brief, proportional meaning). Routine
save → "Saved"; milestone → a short celebration. Don't announce success the user can
already see on screen.

| Avoid | Instead |
|---|---|
| "Payment processed" | "You're all paid up" |
| "Photo uploaded successfully" | "Your photo is live" |
| "Registration was successful" | "Welcome — you're in" |

Next-step form: "Application sent. We'll email you within 2 business days."
**Banking:** confirm outcome and what happens next, with timing: "Payment sent. Maria
will get it by tomorrow, 6 PM."

## Titles & buttons — the symmetry rule

- Two title types: **context-setting** orients ("Inbox", "Your account");
  **single-task** directs — imperative `{Verb} {noun}` ("Pay fare", "Create an account").
- **A single-task title matches the primary button's words exactly** — title "Create an
  Account" + button "Create Account"; "Save"/"Submit" there would weaken it.
- Buttons: `[Verb] [object]`, active imperative, sentence case, **≤3 words / ~20–25
  chars**, one primary action per view. Verb matches consequence: "Delete" (permanent) ≠
  "Remove" (reversible); "Save changes", never "Submit"/"OK"/"Click here".
- Labels stand alone for screen readers ("Submit application", not "Submit"); links
  describe their destination ("Read our privacy policy").
- Buttons are the user's reply — read title + button aloud as a dialogue.

## Reassurance at the point of doubt

Place the answer **at the exact field, button, or step where the anxiety fires** — never
on a separate trust page. Be specific and honest; vague reassurance ("Your privacy
matters to us") reads as boilerplate.

| Doubt | Where it fires | What to say |
|---|---|---|
| Payment security | cart→checkout button, payment form | "Secure checkout" at the moment of the leap |
| Settings feel permanent | config steps | "You can change this anytime" |
| Trial → surprise charge | trial sign-up | "No credit card required · Cancel anytime" |
| Sensitive info (DOB, phone) | the specific field | Why you need it + what you won't do with it |
| Email → spam | newsletter / sign-up | Frequency, one-click unsubscribe, "we won't share your address" |

Click triggers under a key button restate value or remove the top objection — 1–3 max.
When a number is calculated (fees, estimates), offer the breakdown — transparency wins.

**Banking (security & auth):** explain the *why* of a security step ("Confirm it's you
to approve this payment"). Copy must be **account-enumeration-safe**: "Wrong password" is
fine; "That email isn't registered" leaks account existence — use neutral phrasing.
Fraud/blocked copy: calm, a safe next step, a way to reach support.

## Behavioral guardrails — ethical persuasion only

Priority order, absolute: **compliance > clarity > confidence > motivation.** At most
**1–2 nudges per surface**, each passing the ethical test: the claim is **true**, the
user can **opt out**, and it **aligns with the user's interest** — otherwise don't.

**Banned outright** (illegal or reputationally toxic in finance): manufactured
urgency/countdowns, hidden costs, pre-ticked consent, roach-motel cancellation,
confirmshaming ("No thanks, I don't want to save money"), shrinking a fee's font or
crowding it to feel cheaper. Secondary/decline actions stay neutral.

**Friction-positive:** add a reflective pause before irreversible / high-regret actions —
"Did you mean to send your full balance?" Optimising away all friction from actions that
can harm the user is itself a dark pattern.

The disclosure test: *"if you'd be ashamed to disclose why you designed it this way,
it's a dark pattern."* When a behavioral move would touch a disclosure or legal string,
defer to Compliance (`⚠ Legal`).
