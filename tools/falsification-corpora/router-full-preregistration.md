# Preregistration — POST /api/jev/route gate-outcome corpus (full build)

Written 2026-10-08 BEFORE any corpus measurement. Extends the 2026-10-06 Lane D
router slice (11/12 band-match, findings F1/F2) to the layer the slice did not
gate: the GATE OUTCOME per class (allowed / needs_approval / blocked+reason),
under the current policy (v15). Companion to tools/falsification-corpora/
scorer-preregistration.md (same corpus family) and the falsification-corpus skill.

## Instrument + pinned state

- POST /api/jev/route on the steady-orbit worker (etag c910118b, 56 parts).
- Policy v15 (audited flow): image bands unchanged since v14 —
  aberrated-hierarchy-escalation (D in [1.45,2] AND lens.detect_score in
  [1,10000] -> needs_approval, provisional), hierarchy-confirmed (D >= 1.45 AND
  d_w >= 2.4 AND traced n >= 300 -> lane-draft), hierarchy-spectral (D in
  [1,1.45) AND d_w >= 2.4), corrected-hierarchy (D in [1,1.45) AND
  lens.detect_score >= 1 -> lane-correct), ordered-image (D in [1,1.45)),
  sparse-image (D < 1). Band order and the v14 max-widening to 10000 are part of
  the pinned state; the corpus asserts behavior UNDER THIS POLICY SNAPSHOT.
- Response contract (read from the live bundle, not guessed): {router_version,
  measurement{modality,feature,value,features,meta,reroute}, band{id,target,
  calibration}|null, decision, gate{outcome,reasons}, task, run_id, cached?}.
- Input hash covers {kind, router_version, policy_version, modality,
  artifact{image,text,any}} — every corpus row carries a unique artifact.any.note
  so re-runs never hit the decision cache (the known dedupe path).
- Gold renders: tools/falsification-corpora/renders/ on this branch (512x512 P5
  PGM; the worker runner parses the header and base64s the raw gray).

## Rows (14) — family -> expected band -> expected gate outcome

| Row | Render | any.lens_family | Expected band | Expected gate outcome |
|---|---|---|---|---|
| R1 | gasket-v2-L384 | none | hierarchy-confirmed | allowed (lane-draft dispatch) |
| R2 | tri | none | ordered-image | allowed (lane-classify) |
| R3-R7 | shuffle-s42/s7/s99/s1337/s2026 | none | ordered-image | allowed |
| R8 | pumpkin_ring | none | sparse-image | allowed |
| R9 | pumpkin_field | none | ordered-image | allowed |
| R10 | gasket-astig-0.20 | gasket | corrected-hierarchy (pre-correction band) | blocked, reasons include reroute_not_converged |
| R11 | gasket-trefoil-1e-4 | gasket | aberrated-hierarchy-escalation | needs_approval (band_provisional) |
| R12 | gasket-trefoil-3e-4 | gasket | corrected-hierarchy | blocked, reasons include reroute_not_converged |
| R13 | gasket-v2-L384 | gasket | PINNED BY PROBE P2 (clean family-declared gold; detect_score 0 or the 9999 sentinel decides between hierarchy-confirmed/allowed and aberrated-hierarchy-escalation/needs_approval) | pinned with the band |
| R14 | gasket-v2-L384 | gasket-v2-L384 (UNregistered) | hierarchy-confirmed (band decided on D/d_w alone) | allowed, AND lens.skipped_reason present (observability guard) |

R10-R12 expectations carry over the Lane D slice's amended outcomes (live-verified
post-v14: trefoil-1e-4 -> escalation/needs_approval cr_f051178f15e21788;
trefoil-3e-4 and astig-0.20 -> blocked reroute_not_converged). R11 is the F1
regression guard: it MUST NOT silently land hierarchy-confirmed again.

## Gates (pinned before measurement)

- G1 band-match: 14/14 rows land the expected band id (R10/R12: the recorded
  pre-correction band + reroute info; R13: the probe-pinned band).
- G2 gate-outcome-match: 14/14 rows produce the expected decision/gate.outcome;
  blocked rows must carry the pinned reason string.
- G3 spectral presence (the F2 regression guard): every image row carries a
  spectral read (d_w / n) OR an explicit skipped_reason - no silent nulls.
- G4: every row records a run_id; no row may return cached:true (unique notes).
- G5: allowed rows create exactly ONE router task each (tenant "router"); record
  task ids; terminal states are OUT OF SCOPE (the model-dispatch leg is exercised,
  not asserted).

## Plumbing probes (authorized pre-run, NOT corpus data)

- P1: one R1-shaped call to capture the exact live response schema (field names
  for band/decision/gate/task); logged in amendments.
- P2: one gasket+family call to pin detect_score on the clean family-declared
  gold -> pins R13's expected band + outcome; logged in amendments.

## Out of scope (pre-registered)

Multimodal rows (hint-band calibration corpus covered them, outcome depends on
hint score), text rows (band selection calibrated in the style-router round),
terminal task states, repeat-convergence behavior beyond depth 1.

## Cost

~9 allowed rows dispatch one model task each (~$0.01 total Workers AI); the
corpus itself is free (measurement is deterministic).
