# AXIOMS — the non-negotiables

The principles below govern every change to the {{SYSTEM_TITLE}} skill. They are the part of
the system that survives any deletion. A change that violates one is wrong even if every test
passes.

1. **Fidelity over generation.** Every produced pixel traces to a captured token, a verified
   component, or an explicitly named gap. No invention, no freeform, no "surprise me."
2. **The lock is the SSOT.** `captures/{{CAPTURE_NAME}}/design-lock.json` is the only brand
   truth. Derived files (`assets/tokens.css`, `tailwind.tokens.cjs`, `tokens.dtcg.json`) are
   provenance-hashed; hand-editing them is an error. Change the lock and re-derive.
3. **No lock → stop.** Never sketch from memory. A missing capture is an escalation.
4. **Contracts before code.** Every check and boundary has a written contract and a test that
   FAILED before the implementation existed. Reporting a check as proof requires having
   watched it go red for the right reason.
5. **Single owner per state.** One writer, one persistence location, no duplicate truths.
   Prose authority for captured facts is `captures/{{CAPTURE_NAME}}/BRAND-FACTS.md`; when
   prose and lock disagree, the prose wins and the lock is stale.
6. **Honest reporting.** `notConverged`, `allNetNew`, `error`, and "not run" are valid ship
   states; a loosened threshold or fabricated metric never is. Wrapper exit codes are not
   evidence; chain position and recorded outputs are.
7. **Scratch homes for automation.** Agents and tests write to scratch directories and the
   capture's `.render/`/`.report/`; only explicit human intent deletes captured sources,
   references, or the lock.
8. **Reuse, never derive, brand values.** When a needed value has no source, fail with
   guidance — do not synthesize (fonts, colors, offsets, copy). Derived-by-necessity values
   carry a `-derived` suffix and are never presented as the system's spec.
9. **Escalation is success.** A precise gap report beats a plausible guess, always.
10. **{{SYSTEM_TITLE}}-specific law.** Record here, once decided: which source is canonical
    for statics and which for motion/hover/responsive; that each medium exports through its
    own pipeline (a web page is not a slide is not a social card is not a print page; print
    geometry starts from millimetres, never pixels); and that facts — dates, names, numbers,
    claims — come from the brief or BRAND-FACTS.md, never invented: a typed slot is the
    honest default.
