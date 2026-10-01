# Companion record: yubios-stress-test-assertions-2026-08-07 (2026-09-18)

Date: 2026-09-18. Family: run-results record. Origin: wayfinder round 8 rung `add:s1:011000011`,
joining `refs/yubios-stress-test-assertions-2026-08-07.md`. The placement contract requires the join target to gain a real neighbour; this
record is that neighbour, carrying the round's placement context: frozen frame
`10f0496abde9aab9`, chain map None at write time, cycle 97 of 100.

The join target's content was verified earlier this round (citations resolve; claims checked
live). This record adds the geometric context and cross-link, nothing more.

## What this record does not claim

Placement is achieved geometry; `realised`/`missed` verdicts are instrumentation outcomes. The
task check governs content.

## Operating modes

This record documents no executable assertion contract. It is a run-results companion record (family `run-results record`, dated 2026-09-18), not the assertion suite itself: no assertion names, thresholds, or test ids appear anywhere in it. On the mode axis, therefore, most of the suite's execution contract is a stated gap rather than evidenced behavior. Batch vs per-assertion execution, dry-run vs enforcing behavior, foreground vs background lifecycle, and CI integration are all absent; the doc names no invocation form, no flags, and no exit-status vocabulary for the suite it accompanies. The join target, `refs/yubios-stress-test-assertions-2026-08-07.md`, is where that content presumably lives, and this record explicitly adds "the geometric context and cross-link, nothing more."

What the record does evidence, mode-wise, is narrow but real. First, one-shot and bounded execution: it sits at cycle 97 of 100, a single placement inside a capped run series, so the run producing it is one-shot per cycle with a hard termination bound. Second, explicit failure semantics for instrumentation: the record separates verdict layers, stating that `realised`/`missed` verdicts are instrumentation outcomes while "the task check governs content." A missed instrumentation verdict therefore does not constitute a content failure; the doc defines which outcome type is authoritative. Third, null-state handling: `chain map None at write time` records missing upstream data as an explicit null rather than an error, a deliberate empty-value contract rather than a crash path. Fourth, append-only re-run behavior: the record declares itself a neighbour carrying "placement context," and states the join target's content "was verified earlier this round," implying the placement operation appends and does not rewrite; however, no idempotency guarantee for a repeated round-8 re-run is stated, so convergence on re-run is unproven, not asserted. The verification pass itself (citations resolve, claims checked live) is described as already-completed history, not as a runnable mode of this file.
