# Supersolid program next steps [SOLO]

Date: 2026-10-06
Source: ideate-solo (no dialogue)
Scope class: medium
Variations generated: 6
Finalist: "Document-and-harden rollout" (skills + repo harness + CI), v3 control as the next measurement

## Problem Statement

How might we consolidate what the supersolid/Sierpinski program built in the last 24 hours (falsification corpus, real-data pass, instrument findings) so the next session inherits a hardened, documented instrument instead of session-scoped artifacts?

## Inventory (what exists vs where it lives)

- In the repo (yubi-OS/yubiOS): refs doc with 6 addenda + solo log (pushed, byte-verified); taste-engine SKILL.md (last touched 2026-10-05 — ZERO mention of the falsification corpus, the empty-mask hazard, or the L-convergence protocol); tools/edge-standard/ (the v1 pipeline + selftest).
- Session-only (at risk, per the external-copies rule): gen_supersolid.py / gen_v2.py / gen_parity256.py, falsification-results-v2.json, amendments-log-2026-10-06.md, norcia-panels.json + panel crops, trypogeorgos-profiles.json, the KV-staging live-row pattern.
- Not built: v3 matched-extent shuffle control; falsification-corpus harness in CI; any knowledge-corpus mint of the supersolid material.

## Recommended Direction

Document-and-harden rollout, three lanes + advisor (the established taste-engine rollout shape):

1. **New skill `falsification-corpus`** — the validated methodology distilled: pre-registration → generator design (scale-band pinning, ink-coverage arithmetic, MIN_COMPONENT boundary checks) → gate design (check the gate is well-posed ON THE PINNED SCALE SET before running) → advisor review gate before build → L-convergence calibration before gate evaluation → live-route parity → real-data pass protocol. Anti-patterns from the run: size-grading droplets, silent empty masks, post-hoc gate movement, predicting sign of render bias without measuring it.
2. **Repo harness `tools/edge-standard/falsification/`** — the v2 generators (cleaned, `--selftest` CLI asserting the measured anchors: gasket L=384 gate slope 1.5968, tri 1.2636, the component-count assertions), the amendments log, the results JSON; wired into lean-check verify-tools so the corpus is CI-guarded like edge_standard.py.
3. **taste-engine SKILL.md amendment** — fold in the falsification-corpus lessons + real-data findings (empty-mask threshold hazard; gate windows must be checked against the pinned scale lattice; render bias is r/L-dependent and must be calibrated by convergence, not modeled; matched-extent confound; Norcia transition trend; Trypogeorgos 1D-only structural finding).

Then the next measurement (separate turn): v3 matched-extent shuffle control, which is the gate before any "D reads order" claim.

## Key Assumptions to Validate

- [ ] The v2 results are reproducible from the cleaned harness (selftest must reproduce the anchors within fixture-parity tolerance) — Lane B proves it.
- [ ] The skill's methodology generalizes beyond this one corpus (it's written from one validated run — mark it v1, one-use-validated).
- [ ] lean-check wiring stays green at the new HEAD (dispatch + verify, the CI dispatch discipline).

## MVP Scope

Lanes A+B+C above, pushed same session, CI-verified. No new measurements.

## Not Doing (and Why)

- v3 matched-extent shuffle — a measurement, belongs in the next build turn after the docs land.
- Knowledge-corpus mint of the supersolid material — the refs doc is the record; minting now would duplicate it before the program stabilizes.
- `supersolid_order` taste axis — stays gated on a discriminating measurement on controlled real data.
- Pumpkin/Y₃³ theory proposal — parked pending the v3 control and any real hierarchical candidate.

## Open Questions

- Should the falsification-corpus skill live as its own skill or a section of taste-engine? (Built as its own skill: it generalizes to ANY pinned-scale instrument, not just taste.)
- Does the Norcia trend survive the matched-extent control? (Open — recorded as the top next measurement.)

## Generation log (for review)

| Variation | Lens | P | S | D | T | Total | Note |
|---|---|---|---|---|---|---|---|
| Document-and-harden rollout | Simplification | 4 | 5 | 3 | 5 | 17 | pain: session-only artifacts are data-loss debt; switching: none (repo already has the pattern) |
| v3 matched-extent control now | Inversion (of "document first") | 4 | 4 | 2 | 5 | 15 | strong but leaves the artifacts at risk one more session |
| Knowledge-corpus mint | Combination (mint + refs) | 2 | 3 | 4 | 3 | 12 | duplicates the refs doc; premature |
| Paper draft (Sierpinski-supersolid proposal) | Constraint removal | 2 | 2 | 5 | 2 | 11 | blocked on v3 + prior-art differentiation work |
| supersolid_order axis build | Audience shift (physicists) | 3 | 2 | 4 | 2 | 11 | gated on a discriminating measurement |
| Do nothing, measure next session | — | 1 | 5 | 1 | 5 | 12 | fails the external-copies rule; rejected |

Finalist stress-test: the rollout's un-testable bet is none — every lane ends in a verifiable artifact (selftest green, skill pushed byte-verified, CI run green). Strongest critique: three lanes of docs for one day's work is heavy — counter: the taste-engine rollout set the precedent and the artifacts ARE the program's audit trail.
