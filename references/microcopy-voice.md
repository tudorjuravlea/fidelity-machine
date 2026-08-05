---
reference: microcopy-voice
vendored-from: Tudor's ux-writing KB — kb-craft/02-voice-and-tone/*, kb-banking/05-banking-layer/{banking-voice-and-jargon,ro-localisation}.md, kb-orchestrator/{four-quality-standards,content-usability-checklist}.md (frozen 2026-07-21)
role: Part 5 voice layer — voice-chart mechanism, emotion→tone, quality-gate scoring, banned jargon EN+RO, RO localisation
---

# Microcopy Voice, Tone & the Quality Gate

**Voice is constant; tone flexes with the moment.** A project's voice lives in the lock
(`content.voiceChart`); this file carries the mechanism, the banking defaults, the
scoring gate, and the Romanian rules that shape every string.

> **⚠ Legal — stated once, applies to all banking/RO specifics below:** the banking
> voice concepts, both banned-jargon glossaries, the Tu/Dvs. register decision, and every
> exact regulatory term (DAE, RON usage, disclosure wording) are **drafts pending brand +
> Legal/Compliance sign-off**. The pipeline flags them `⚠ Legal` and never auto-resolves;
> legal strings are never machine-paraphrased.

## The voice-chart mechanism

A chart = **3–5 brand concepts × voice characteristics × do/don't pairs.** Adjectives
alone ("be friendly") don't constrain output — every writer and model interprets them
differently. **The do/don't pairs are what make a voice executable by a model.** Build
it: pull concepts from brand values, not invented for the UI; 2–4 adjectives per concept
describing how it *sounds in a sentence*; at least one do/don't pair per concept drawn
from real product moments; pressure-test by rewriting one string to violate each
concept — the chart must make the violation obvious on its own.

## The five banking voice concepts (default chart)

| Concept | Characteristics | Do | Don't |
|---|---|---|---|
| **Trustworthy** | Plain, precise, calm; never hype | "Your transfer will arrive by tomorrow, 6 PM." | "Lightning-fast transfers! ⚡" |
| **Clear under stress** | Direct, consequence-first | "This payment can't be cancelled once sent." | "Please review your transaction details." |
| **Regulatory-honest** | Transparent about fees, risks, terms | "This account has a €5 monthly fee." | Hiding the fee in a footnote |
| **Respectful** | Non-patronizing, non-pushy | "Choose how you'd like to pay." | "Don't worry — it's super easy!" |
| **Inclusive** | Plain language, accessible, neutral | "Money you owe" | "Outstanding liabilities" |

Clarity floor from plainlanguage.gov + CFPB: short sentences, common words, active
voice, no unexplained jargon. Never soften a real consequence — clarity beats comfort
when money or risk is involved.

## Emotion→tone map (one voice; only tone moves)

| State | When | Stance | Example |
|---|---|---|---|
| **Frustrated** | errors, failures, blockers | Empathetic, solution-first, no blame | "Payment failed. Your card was declined. Try a different payment method." |
| **Confused** | first use, complex features | Patient, break it down, add context | "Connect your bank to see spending insights. We'll guide you through it." |
| **Confident** | routine tasks, return visits | Efficient, direct, minimal | "Saved" |
| **Cautious** | high-stakes money/data/closure | Serious, transparent, consequence-first | "Delete account? You'll lose all data and this can't be undone." |
| **Successful** | completions, achievements | Positive, proportional, brief | "Profile updated." |

**Higher stakes → more serious; NEVER joke at a high-stakes moment.** Money movement,
security, and closure are almost always Cautious or Frustrated with high stakes.
Cleverness governors: suppress wit on frequently-seen screens (the 30th viewing of a
joke is friction, not delight); a witty string voiced by a screen reader in isolation
must still convey the literal state; re-read playful copy as the angriest user — if it
could read as salt in the wound, cut it.

## The four quality standards + scoring gate

| Standard | The question it answers | Fails when |
|---|---|---|
| **Purposeful** | Does this help the user or business reach a goal? | Text exists out of habit, not need |
| **Concise** | Fewest words that keep the meaning? | Padding, hedging, repeated context |
| **Conversational** | Sounds like a helpful human, not a system? | Robotic, corporate, jargon-heavy |
| **Clear** | Unambiguous, accurate, easy to understand? | Reader must guess what happens next |

Score each axis 0–10 (9–10 excellent · 7–8 good · 5–6 adequate · 3–4 needs work ·
0–2 poor). **Ship floor: nothing ships with any axis < 8 unless a flag explains why.**
Worked example — "An error occurred while processing your request. Please try again."
scores 5/10 overall; "We couldn't save your changes. Check your connection and try
again." scores 9/10. Judgment axes scored alongside: **Findable**; **Confidence-building**
(research consistently surfaces *missing* information as the real defect — supply the
validation signal, next-step preview, or reassurance that removes hesitation);
**Complete** (answer the question the user actually has); plus voice-chart conformance
and emotion→tone match.

## Conversational principles

- **Read-aloud test:** if you wouldn't say it to a person standing next to you, rewrite
  it. Titles/descriptions are the experience speaking; buttons are the person replying —
  read the pair as a dialogue; awkward or rude exchanges fail.
- **Reduce to the essence:** "If I remove this, does the user fail at their task?" If
  no, cut it. Rename before you annotate.
- **Real content, never lorem:** writing against real strings exposes length,
  truncation, and hierarchy problems early — it is the overflow early-warning for the
  pixel gate.
- Keep the connecting words ("Your order details", "Select an item") — telegraphic copy
  reads robotic. Front-load the signal. Questions pull the user forward ("Where should
  we send the link?"). Reject autopilot strings ("Please wait", "Transaction completed
  successfully") — re-derive the real message for the specific moment.

| Before (written-formal) | After (spoken-polished) |
|---|---|
| "In the event that you forgot your password" | "If you forgot your password" |
| "Enter the phone number you would like to dial" | "What number do you want to call?" |
| "Please select the desired option" | "Choose an option" |

## Banned-jargon glossary — EN (say this, not that)

| Jargon / internal term | Plain language |
|---|---|
| Reversal | Refund *(reserve "reversal" for the technical case)* |
| Remittance | Payment you send |
| Debit / credit (as verbs to users) | Money out / money in |
| Outstanding balance | What you owe |
| Insufficient funds | You don't have enough money in this account |
| Beneficiary | The person or company you're paying |
| Authentication | Confirm it's you |
| Disbursement | Payout |
| Maturity date | The date this ends |
| Overdraft facility | Borrowing buffer / arranged overdraft |
| Decline | We couldn't approve this *(then say why + what to do)* |

Unavoidable regulatory terms (APR, IBAN) are kept — explain them inline on first use.

## Banned-jargon glossary — RO (spune asta, nu aia)

| Jargon RO (technical/internal) | Plain RO (user-facing) | EN reference |
|---|---|---|
| Stornare | Returnarea banilor / Bani returnați | Refund (vs. reversal) |
| Remitere / Remitență | Plată trimisă | Remittance |
| Debitare / Creditare (ca verbe către user) | Bani scoși din cont / Bani primiți în cont | Debit / credit |
| Sold restant / Sold debitor | Cât ai de plată | Outstanding balance |
| Fonduri insuficiente | Nu ai suficienți bani în acest cont | Insufficient funds |
| Beneficiar | Persoana sau firma către care trimiți banii | Beneficiary |
| Autentificare | Confirmă că ești tu | Authentication |
| Disbursare / Tragere | Sumă virată / Plată | Disbursement |
| Data scadenței / Scadență | Data la care se încheie | Maturity date |
| Descoperit de cont | Sumă pe care o poți folosi în plus (overdraft) | Overdraft facility |
| Tranzacție respinsă / Refuz | Nu am putut aproba plata *(+ de ce + ce să faci)* | Decline |
| Comision de administrare | Cost lunar / Cât plătești pe lună | Account/admin fee |

Unavoidable RO terms — keep + one-line gloss on first use: **DAE** (Dobânda Anuală
Efectivă, the RO equivalent of APR) always expands on first use: "DAE (costul total al
creditului pe an)"; **IBAN**, **CNP**, **PIN**, **OTP** likewise.

Both glossaries are literal grep blocklists: the lock's `content.bannedJargon` feeds
`adherence-lint.mjs`; a hit blocks the content gate with the suggested replacement.

## RO localisation rules

- **Register:** default **"tu"** in product microcopy (`Bine ai venit`, `Continuă`,
  `Verifică-ți soldul`) — warmer, shorter, matches modern RO fintech. **Legal &
  disclosure text stays neutral/impersonal** (infinitives, impersonal forms: `Pentru a
  continua, este necesar acordul privind…`). Never switch register mid-flow; one
  register per product — a later brand switch to "Dvs." is a find-and-replace on this
  layer only, patterns don't change.
- **Diacritics:** always full and correct — `ă â î ș ț`; they change meaning (`fata` vs
  `față`, `tara` vs `țară`). Use **comma-below** `ș` `ț` (U+0219 / U+021B), never the
  cedilla forms. Technical identifiers and IBAN-type strings stay as-is.
- **Numbers & currency:** decimal comma, thousands period — `1.234,56`, `2,5%`.
  **"lei"** in microcopy for warmth (`1.250,00 lei`); **"RON"** in statements, legal,
  and exact-amount transactional contexts. Symbol after the amount, with a space.
- **Dates & time:** `DD.MM.YYYY` (`17.06.2026`) compact; spell lowercase month names for
  friendlier copy (`17 iunie 2026`). **24-hour time** (`18:00`), never `6 PM` — mirror
  the EN side's meaning, not its format.
- **Gender-neutral:** use 2nd-person verb forms and imperatives (inherently neutral):
  `Bine ai venit`, `Trimite`, `Continuă`, `Pentru a confirma…`. Prefer rephrasing over
  the `(ă)` / slash crutch (`Te-ai conectat cu succes`, not `Ești conectat(ă)`); neutral
  role nouns (`persoana de contact`).
- **RO-first-native:** write RO as native copy, not a translation of the EN — then give
  the EN equivalent. The two must match in *meaning and tone*, not word-for-word. Legal
  strings go to certified translation, never machine-paraphrase (`⚠ Legal`).
