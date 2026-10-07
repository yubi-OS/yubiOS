# Preregistration — POST /api/jev/route end-to-end routing falsification corpus

Written 2026-10-06 (Lane D, parallel build). Written BEFORE any corpus measurement.
Instrument: `POST /api/jev/route` on https://steady-orbit.systems-a.workers.dev
(router-v1, policy **v12**, live-fetched). What is falsified: the full route path —
band selection AND gate outcome per gold family (refs/falsification-harness-coverage-2026-10-06.md, Tier-2 item 2).

## 1. Pinned parameters

- Render generator: `tools/edge-standard/falsification/gen_v2.py` (source of record,
  selftest 30/30 PASS re-run locally 2026-10-06 before generation). Canvas 512x512,
  raw 8-bit gray, row-major. Per-render sha256 pinned in `corpus/renders.json`.
- Warp variants: arrangement arm (source of record
  `tools/lens-standard/arrangement_warp.py`): disk centers warped through
  `lens_standard._forward_point`, radii kept, pristine re-render, off-canvas drops counted.
  Pinned constants: `ASTIG_KAPPA=0.5`, `TREFOIL_ZOOM_K=460` (beta(t)=K|t|/(1-K|t|)).
- Transport: `artifact.image.{gray_b64,width,height}` (base64 of raw gray bytes);
  lens declared via `artifact.any.lens_family`.
- Live band table (fetched 2026-10-06 pre-run, policy v12) — REAL edges used below:
  - `corrected-hierarchy` (pair, lane-correct, calibrated): fires when D ordered AND
    lens detect_score >= 1 AND n_components >= 300; sequential correction
    astig->spherical->trefoil, depth cap 1, convergence gate disposes of the final route.
  - `hierarchy-confirmed` (pair): D>=1.45 AND d_w>=2.40 AND n>=300 -> lane-draft.
  - `hierarchy-spectral` (pair): D ordered, d_w>=2.40, n>=300 -> lane-draft.
  - `hierarchy-image`: fractal_band.D in [1.45, 2] -> lane-draft.
  - `ordered-image`: D in [1, 1.45) -> lane-classify.
  - `sparse-image`: D in [0, 1) -> lane-classify.
  - `multimodal-probe`: needs_approval (never auto-dispatched).
  - `default_on_no_band`: blocked.
- Fail-closed shape probes (pre-run, logged): empty body / artifact null / string /
  array / 1x1 / non-binary / all-zero / extra-keys all -> 422
  `{code:"UNKNOWN_ARTIFACT"}`; `{artifact:{data,w,h}}` -> 422 "no recognizable
  artifact (image/text/any)". Object envelope required; image slot needs
  gray_b64/bitmap_b64 + integer width/height.

## 2. Predicted per-family outcomes (pinned before measurement)

| # | family (render sha in corpus/renders.json) | expected D (anchors.json) | declared lens_family | expected band (final) | expected gate outcome |
|---|---|---|---|---|---|
| R1 | gasket-v2-L384 (clean) | 1.5589 +/- 0.010 | gasket-v2-L384 | hierarchy-image | allowed (corrected-hierarchy must NOT fire: detect_score 0/0/0) |
| R2 | tri | 1.2636 +/- 0.010 | none | ordered-image | allowed |
| R3-R7 | shuffle-s42/s1337/s2026/s7/s99 | 1.0355/1.0305/1.0302/1.0404/1.0456 +/- 0.010 | none | ordered-image | allowed |
| R8 | pumpkin_ring | 0.9772 +/- 0.010 | none | sparse-image | allowed |
| R9 | pumpkin_field (grayscale) | 1.0384 +/- 0.010 | none | ordered-image | allowed |
| R10 | gasket-astig-0.20 (Set B) | measured (pre-correction D expected below 1.45; corrected D ~1.559) | gasket-v2-L384 | corrected-hierarchy fires -> re-select hierarchy-image | allowed |
| R11 | gasket-trefoil-1e-4 | measured (dD ~ -0.117 -> ~1.442) | gasket-v2-L384 | corrected-hierarchy fires -> re-select (hierarchy-image if corrected D >= 1.45) | allowed |
| R12 | gasket-trefoil-3e-4 (out-of-envelope) | measured | gasket-v2-L384 | corrected-hierarchy fires -> skipped_warp (est outside pinned envelope) | **blocked, reasons include `reroute_not_converged`** |

Tolerance windows (pinned): D within +/-0.010 of the anchors.json value (the gen_v2
regression tolerance is 0.002 locally; the live route re-standardizes, so the corpus
gate is widened to 0.010 — a-priori, pre-run). Band id: EXACT match. Gate outcome:
EXACT match. n_components: EXACT match to anchors comps (19/19/366/6/6).
d_w: report-only for non-gasket classes (no pinned prior); for R1 the prior live run
cr_b15752003ba1a4ef (same render: D 1.558937, n 366, coverage 0.040489 identical)
pins d_w = 2.2555 +/- 0.08.

Gate = R1-R9 all PASS (band + D + comps + allowed) AND R10/R11 converge to allowed
AND R12 lands blocked with reroute_not_converged. Any single miss = corpus FAIL,
logged honestly; no post-hoc window movement.

## 3. Convergence-gate negative case (designated, refs Tier-2 item 2)

R12 is the slice's realization of the designated negative case: a deliberately
mis-corrected artifact (trefoil estimate outside the pinned envelope -> warp skipped
-> re-select never converges) MUST land `reroute_not_converged`/blocked, matching the
observed live run cr_b11bbeee22ed5425 (trefoil est -3.26e-4, skipped_warp, blocked).
The full build should also add: a mis-corrected astig case (correction applied but
re-select still fails the band clauses) and an out-of-envelope spherical case.

## 4. Known risks pre-declared

- The lens_family registered name was NOT verifiable from the repo; a pre-run
  plumbing probe (single route call on R10's render, declared family) confirms lens
  features are computed; if the name is wrong the probe shows lens=null and the
  spelling is corrected and logged in amendments BEFORE the corpus run.
- trefoil 1e-4 sits inside the envelope by design; if the estimator reads it as
  out-of-envelope, that is a corpus FINDING (R11 fails as registered), not a gate edit.
- R12 trefoil est sign is expected to oppose the injected sign (estimator convention);
  the gate keys on |est| > envelope, not sign.
