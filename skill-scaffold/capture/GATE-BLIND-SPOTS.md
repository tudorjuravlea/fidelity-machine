# What the gates cannot see, measured

Every check has a blind spot shaped like its metric. This file states the largest defect each
gate on this capture will NOT catch, with the experiment that measured it — a stronger claim
than a pass rate, and the first thing to update when a gate changes.

Measure, don't estimate: `node ENGINE/scripts/probe-blind-spots.mjs --lock design-lock.json`
injects fixed faults one at a time into a temp copy and reports which gate caught each, or
that nothing did. Run it against every gated screen once references are armed, then keep this
table honest.

| Gate | Largest defect it will not catch | Experiment |
|---|---|---|
|  |  |  |
