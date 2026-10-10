# Lane D record — falsification corpora first slices (router end-to-end + scorer extractor gold set)

Date: 2026-10-06 (session). Lane D of the parallel build launched on
refs/falsification-harness-coverage-2026-10-06.md (merged via PR #294).
Nothing was pushed to any repo; all artifacts live in `session/subagent/lane-d-corpora/`.

## What was built

1. **Gold renders, source of record** — repo tarball (main) fetched; `gen_v2.py`
   re-run locally: **selftest 30/30 PASS** against `anchors.json` before any
   rendering. 11 renders at 512x512 (PGMs in `renders/`, sha256s pinned):
   gasket-v2-L384, tri, shuffle x5 pinned seeds, pumpkin_ring, pumpkin_field,
   plus three warped gaskets via the pinned arrangement-arm forward map
   (`ASTIG_KAPPA=0.5`, `TREFOIL_ZOOM_K=460`): astig-0.20, trefoil-1e-4,
   trefoil-3e-4. Transport: `artifact.image.{gray_b64,width,height}`;
   lens via `artifact.any.lens_family="gasket"` (amendment 1).
2. **Preregistrations written BEFORE measurement** —
   `router-preregistration.md` (family -> expected band -> expected gate, real
   policy-v12 band edges fetched live; D +/-0.010, band EXACT, gate EXACT,
   comps EXACT, gasket d_w 2.2555+/-0.08 pinned from prior live run
   cr_b15752003ba1a4ef) and `scorer-preregistration.md` (12-doc slice design,
   recall floor 0.75, distractor specificity, full-build sizing ~64 docs).
   `amendments-log.md` opened empty; 3 pre-run entries logged (family spelling,
   R10 expected-gate amendment, scorer schema probe authorization).
3. **Router corpus EXECUTED** — all 12 rows through live
   `POST /api/jev/route` (policy v12). Results in
   `router-corpus-results.json`; run ids recorded per row
   (cr_3d7e7963c81f0118 ... cr_2db2613357ceeeb0).
4. **Scorer gold slice EXECUTED** — 12 synthetic docs + 1 neutral schema probe
   through live `POST /api/jev/corpus/scorer/score` (scorer-v2.2). Results in
   `scorer-slice-results.json`. Cost ~$0.0026 total (under the $0.01 cap).

## Results vs preregistered gates

### Router corpus: 11/12 rows match; verdict FAIL-on-R11 (finding F1)

- R1 gasket-v2-L384: D 1.558937 (= anchor 1.5589), n 366, d_w 2.255452 (pinned
  window), detect 0/0/0, band **hierarchy-image**, allowed. PASS.
- R2 tri: D 1.263595, **ordered-image**, allowed. PASS.
- R3-R7 shuffle x5: D 1.0302-1.0456 (all within tolerance of anchors),
  **ordered-image**, allowed, n_traced 19 confirmed via runs rows. PASS.
- R8 pumpkin_ring: D 0.977190, **sparse-image**, allowed. PASS.
- R9 pumpkin_field: D 1.038390, **ordered-image**, allowed. PASS.
- R10 gasket-astig-0.20 (as amended): corrected-hierarchy fired, astig est
  0.2139 corrected, **spherical cross-mode reading -0.3978 out-of-envelope
  (1/3 bound)** -> skipped_warp -> **blocked reroute_not_converged**. PASS per
  amendment 2; the cross-mode contamination is itself a finding.
- R11 gasket-trefoil-1e-4: **MISMATCH.** Predicted corrected-hierarchy ->
  re-select -> allowed. Observed: corrected-hierarchy did NOT fire despite
  detect_score 9999; final band **hierarchy-confirmed** (D 1.5108, d_w 2.588,
  n 366), allowed, reroute null. Recorded as finding F1, not absorbed.
- R12 gasket-trefoil-3e-4 (convergence-gate negative case): corrected-hierarchy
  fired; spherical 0.318 AND trefoil 2.43e-4 both skipped out-of-envelope ->
  **blocked reroute_not_converged** (matches observed live negative run
  cr_b11bbeee22ed5425). PASS.

### Scorer slice: recall gates FAIL (the valuable result), specificity PASS

- Inputs family (I1-I4): extractor found **1-2 of 3-5 canonical planted items**
  (floors 3/3/4/2) — recall gate FAIL 0/4; decision p ~0.01-0.04 (would never
  flip true). This quantifies the refs4 extraction-recall lesson on maximally
  canonical phrasing: it is not a heading-only-doc artifact.
- Composition family (C1-C4): C1 PASS (2/2), C2 FAIL (2/3), C3 PASS (4/4),
  C4 FAIL (3/5). Item-level recall 11/14 = 0.786.
- Distractor-vocabulary (D1-D4): **specificity PASS 4/4** — inputs axis 0
  everywhere; composition <=1 with p < 0.55 on all distractors. The extractor
  does not over-credit; it under-recalls.
- Collateral (report-only): assumption_set credited on 4/8 planted docs with
  p > 0.55 flips (finding F3, cross-axis bleed).

## Amendments logged

See `amendments-log.md`: 3 pre-run entries (lens_family spelling "gasket";
R10 expected-gate amendment with a-priori justification; scorer schema probe)
+ 3 post-run FINDINGS (F1/F2/F3 below). No gate was moved post-hoc.

## Findings (for the full build)

- **F1 — /bands hides the operative pair-band clauses.** `selectBand` matches
  pair bands on the policy's `all` clause arrays, which the /bands surface drops.
  R11's miss (detect 9999 but no corrected-hierarchy) shows the operative
  clause set is not derivable from descriptions — plausibly an
  astig-above-threshold entry condition (R10/R12 astig |est| >= 0.019 fired;
  R11 -0.0022 did not). Full build: read routing.bands[].all from the policy
  doc (KV/git mirror) and re-derive corrected-hierarchy triggers; decide
  whether "detection signal 9999 not gating band selection" is a router bug.
- **F2 — spectral walk silently absent on 4/12 gold rows** (tri, shuffle-s42,
  pumpkin_ring, pumpkin_field): d_w/n null in the live response. The contract
  says a failed walk never fails the measurement, but pair-band gating is then
  untestable on those rows. Full build: assert spectral presence per run;
  investigate the walk's worker CPU cap.
- **F3 — scorer cross-axis bleed on assumption_set** (see above).
- **F4 — transport finding:** sandbox egress to workers.dev is blocked (401
  without proxy injection); large gold renders must move via the ubuntu shell
  bridge (100 KB base64 chunks — 380 KB chunks hit Linux's 128 KB MAX_ARG_STRLEN)
  and POST through the run_script worker path. Render transfer checksums verified.

## Honest limitations

- This is a SLICE (12 router rows, 12 scorer docs), not the full corpus; the
  full-build design (mis-corrected astig case, out-of-envelope spherical case,
  ~64-doc scorer corpus, paraphrase-preserved variants, heading-only docs) is
  sized in the preregistrations, not executed.
- R11's preregistered prediction was derived from band-description text; the
  miss is recorded as a corpus FAIL per the pinned gate, with the under-determined
  preregistration input documented — but the operative clause values remain
  unverified (the policy doc was not read).
- tri's n_traced (19) was verified locally (selftest anchor) but not re-confirmed
  in the live run rows (beyond the recent-50 runs page window); the other 5
  non-gasket rows' comps were live-confirmed via /route/runs.
- The scorer's evidence-counting unit is opaque (module not in the tarball);
  planted-count ground truth is the preregistered proxy. Recall failures at
  canonical explicitness make the direction of the finding robust even if the
  exact unit differs.
- Axis-index mapping (task-order) was confirmed only for inputs (1) and
  composition (8) via planted docs; the remaining 10 mappings are assumed.

## What the full build needs

1. The policy doc's `routing.bands[].all` clauses (F1) — without them,
   corrected-hierarchy triggers cannot be pre-registered exactly.
2. Spectral-presence assertion + walk CPU-cap investigation (F2).
3. Router: mis-corrected-astig and out-of-envelope-spherical negative cases;
   determinism check (same input_hash -> same verdict).
4. Scorer: the ~64-doc corpus with paraphrase pairs and heading-only docs
   (the v2.3 extractor-recall pass regression set); extract the actual
   counting unit from the deployed module to pin ground truth semantics.
5. Commit anchors.json-style machine-readable records once the corpus passes.

## Artifacts

- `router-preregistration.md`, `scorer-preregistration.md`, `amendments-log.md`
- `router-corpus-results.json`, `scorer-slice-results.json`
- `renders/*.pgm` (11 source-of-record renders), `route_requests.jsonl`
- `yubiOS-main/` (extracted repo sources used: gen_v2.py, edge_standard.py,
  jev-router.js, lens_standard.py, anchors.json, falsification SKILL.md, refs doc)


## Scorer full corpus EXECUTED (2026-10-08, PR #306)

- 62 docs + 3 determinism re-scores through live POST /api/jev/corpus/scorer/score
  (scorer-v2.2, deployed etag c910118b). Cost ~$0.013 (65 calls, consumed=0).
- RECALL 33/56 planted rows at the 0.75 floor. Per-axis: calibration 6/6, recursion
  3/3, adjacent 4/4, mode 4/4 PASS; audience 0/4 (1 evidence line on 2/4/6-item
  sections), inputs 1/6, knowledge_sources 1/4, outputs 3/6, composition 2/3 FAIL.
  Heading-only reproves cleanly in one direction: H-outputs (6 lines), H-assumption_set
  (4), H-calibration (4) all pass while full-section F-inputs-4 found only 2 of 4.
- COLLATERAL 65 non-planted flips (pre-registered F3 gate FAIL): cross-axis vocabulary
  flips decisions - worst: F-composition-4 flipped inputs 0.9276 / outputs 0.9052 /
  adjacent 0.7026; F-recursion-2 flipped mode 0.8946 on 8 evidence lines of "next
  round" prose.
- DISTRACTORS 5/12: D7 failure_modes-vocabulary generated 5 evidence lines and flipped
  0.8485; D6 adjacent flip 0.9059 on ec 2; D3/D5/D8 flips on 1-3 lines; D1/D11 exceed
  the ec<=1 bound without flipping.
- PARAPHRASE 7/8 (P-outputs unstable: base tier-4 p 0.2049 no-flip vs paraphrase
  p 0.7736 flip - recall variance carrying through, not decision noise).
- DETERMINISM PASS 3/3 (row + probs + evidence_counts byte-identical on re-score).
- Threshold observation: decision bits match p >= 0.5 (F-inputs-4 axis7 p 0.5197 ->
  bit 1) - the served threshold is the scorer default 0.5, not the clef-frame policy
  0.55; scorer-route wiring observation for the next fix round.
- VERDICT: the extractor fails both directions on canonical gold. The v2.3
  extractor-recall pass now has a full known-answer regression set AND a precision
  target list (the collateral/distractor flip inventory is in scorer-full-results.json).
