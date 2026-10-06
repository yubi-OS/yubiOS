---
name: taste-engine
description: "Run and extend the nature-based taste engine on the steady-orbit worker: POST /api/jev/corpus/taste/score (8 nature-law axes, deterministic extraction + ONE batched clef call, hysteresis verdicts), /taste/matrix, /taste/selftest, and the edge-standard-v1 standardized edge-map pipeline (POST /taste/edge-standard) that makes image-derived fractal-dimension measurements comparable across sources. Also covers the validation discipline the instrument requires: jitter tests, threshold-calibration sweeps, gold-set cross-validation, and the rayleigh-pattern admission protocol. Use when scoring an artifact's taste vector, standardizing an edge map before measuring D, adding a taste axis, calibrating or admitting an axis, or debugging the taste routes. Triggers on 'taste engine', 'taste score', 'fractal band', 'edge-standard', 'edge map pipeline', 'taste axis', 'calibrate the axis', 'admit the axis', 'gold set'."
---

# Taste Engine

## What it is

The nature-based taste instrument on the steady-orbit worker (deployed 2026-10-05, taste-v1): deterministic feature extraction per axis, then ONE batched clef call whose noul questions each carry a MEASURED number, then 0.45/0.55 hysteresis verdicts. Same instrument family as the corpus scorer v2.2: evidence-first beats free prose. Conceptual doc: `refs/natural-taste-engine-2026-10-05.md` on yubi-OS/yubiOS (4 addenda). Grounding corpus: `yubi-OS/knowledge/edge-map-standardization/` (draft PR #83).

Doctrine: the instrument never awards itself a quality score. It returns a vector + probabilities + measured features, never a composite beauty number. Every axis starts `admitted: false`; admission is a refs-recorded decision after trials on more than one artifact class (the rayleigh pattern).

## Route contracts (bearer-auth, base https://steady-orbit.systems-a.workers.dev)

### POST /api/jev/corpus/taste/score

`{image?: {width, height, bitmap_b64}, features?: {axis: {..numbers}}, axes?: [names], hysteresis?: {low, high, pre_row}, order_seed?: number}`

- Exactly one of image/features (422 otherwise). Unknown axis names 422. Image path: extractor computes fractal_band {D, r2} (box window 4..64), symmetry_present, scale_coherence; stamp `source: "extractor"`. Features path: caller values, stamp `source: "caller"`.
- Response: `{axes: [{axis, feature, source, p, verdict, choice?, probabilities?, confidence?, low_confidence?}], probs, rows, order_used, hysteresis_applied, consumed, run_id, scorer_version: "taste-v1"}`.
- Verdicts: no hysteresis -> `on` at p >= 0.55, `off` at p <= 0.45, else `ambiguous`; with hysteresis -> flip only at the edges, else carry `pre_row[axis]` (verdict `carried`). Extraction r2 < 0.98 -> axis marked `low_confidence` and EXCLUDED from the clef call.
- `family` is the choice axis: needs `features.family_description` (string); returns `p: null, verdict: "no_answer"` plus the echoed `choice`, per-option `probabilities`, and `confidence` from clef.
- `order_seed` permutes question order deterministically (position-bias control across passes).

### POST /api/jev/corpus/taste/matrix

`{items: [{name, ...score fields}] 1..20, spacing_ms?}` — paced batch, one `taste-matrix` run row. Fail-closed: any invalid item 422s the whole batch.

### GET /api/jev/corpus/taste/selftest

13 checks: math interface, line/blob fixtures, hysteresis table, question shapes, permutation determinism, and 6-fixture parity against the Python source of record (max |dD| 4.4e-16). 200 all-pass / 500 failing.

### POST /api/jev/corpus/taste/edge-standard

`{gray_b64, width, height}` (raw 8-bit gray, row-major) or `{bitmap_b64, width, height}` passthrough -> `{pipeline: "edge-standard-v1", meta: {chosen_threshold, achieved_coverage, n_components_traced, traced_pixels, w, h, under_inked}, features: {fractal_band: {D, r2}, symmetry_present: {score, axis}}, grid_b64, run_id}`. Run rows kind `edge-standard`.

## Edge-standard-v1 (the adjacent pipeline)

Raw gray in -> ink-normalization threshold (argmin |coverage - 0.06|, ties smaller t) -> 4-connected components -> Moore outer-boundary tracing (canonical backtrack-relative, 1-px contours, components < 12 px dropped) -> pinned box-counting window 4..64, 8 scales, log N vs log(1/s) regression + r2 gate. Python source of record `edge_standard.py` (stdlib, 34/34) + JS worker port (`jev-edge-standard.js`, imports boxCountingDim from jev-taste-math.js) + `edge_fixtures.json` (4 fixtures incl. the normalization property: same shape at different gray levels -> identical traced grid + identical D). ANY change to TARGET_COVERAGE (0.06), MIN_COMPONENT (12), or the scale window is a major version bump. The threshold targets coverage only, decided before any D is computed — never tune toward a D outcome.

## Validation discipline (do this before trusting any axis)

1. **Jitter test**: same instruction N re-calls (measured: sd = 0.0000 across 24 clef re-calls — clef is deterministic on fixed numeric instructions). If jitter appears, hysteresis becomes load-bearing; if not, it is cheap insurance.
2. **Calibration sweep**: sweep the axis's numeric feature across its full range (21 points), one clef call each, and check the response curve against the stated semantics. Measured: symmetry_present steps sharply at exactly 0.6; symmetry_variation honors the full 0.3-0.95 window and rejects sterile-perfect 1.0; complexity_economy steps at exactly 0.5. The "opinion-shaped" axes behave like calibrated numeric-band classifiers.
3. **Gold-set cross-validation**: run a published human-rated set through the pipeline and compare against the published D values (done: Viengkham & Spehar 2018's 123 paintings — our contour-class D 1.029-1.487 vs their band means 1.154/1.418/1.711; systematically compressed, as the contour-vs-cluster regime difference predicts).
4. **Admission protocol**: `admitted` stays false until a multi-class trial with human preference data evidences it, recorded in refs/ (the rayleigh pattern: per-frame criteria, never a flipped flag). The band location must be TESTED on our scale, not assumed (contour-class peaks may sit below 1.3).

## Deploy lessons (each one cost a fix cycle)

- **clef `choice` questions take a `criteria` object** (option -> description), NOT a `choices` array — clef 5012 "Extra inputs are not permitted".
- **Always render measured numbers with decimals in clef instructions.** A bare integer "1" in the symmetry band question produced p 0.015 on a perfectly symmetric line; fmt() now renders integers as "1.000".
- **A module that calls askJev must import it** — node --check is syntax-only; the selftest passed while the live route 500'd because extraction is pure. Same bug as the 2026-10-03 scorer deploy.
- **Fixture parts ship path-qualified** (`fixtures/taste-fixtures.mjs` with filename matching) or CF 10021 rejects the whole upload.
- **The selftest passing does not mean the routes work** — live-verify every route after deploy (stale-deploy propagation is ~20s).
- **POST /api/jev/tasks caller actions require `method` + `url`** even for the resend.send tool (copy `jev-lead.js resendSendAction()`), and extra body keys like `reply_to` ride fine (the validator only rejects recipient/message shapes and placeholders).

## Examples

**Score a design by measured features** — POST /taste/score `{features: {fractal_band: {D: 1.41, r2: 0.999}, symmetry_present: {score: 0.9}, branch_exponent: {gamma: 2.5}}, order_seed: 7}` -> per-axis verdicts with probabilities; D 1.41 -> on, D 1.18 -> off (validated on the live route).

**Standardize an image before measuring** — `ffmpeg -i img.jpg -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:black,format=gray" -frames:v 1 -f rawvideo -pix_fmt gray img.gray`, base64 it, POST /taste/edge-standard `{gray_b64, width: 512, height: 512}` -> D at pinned ~6% ink coverage, comparable across sources.

**Cross-validate against a published human-rated set** — download the rated images, run every one through /taste/edge-standard, compare your D distribution against the published band means, and report the regime differences honestly (see the Viengkham & Spehar 123-painting run in refs addendum 4).

**Add a new axis** — extend the axis dictionary (extractor + clef question template with the measured number embedded), add fixture parity, run the jitter test + calibration sweep, then record the admission decision in refs/ — never flip `admitted` from a single response.

## Falsification corpus (2026-10-06)

edge-standard-v1 was tested as a supersolid droplet-morphology measure via a falsification corpus, and the corpus is CI-guarded: `tools/edge-standard/falsification/gen_v2.py --selftest` asserts the measured anchors — gasket-v2 L=384 local slope 1.5968 over {13,20,29,43,64} vs Sierpinski theory 1.585, tri 1.2636, shuffle ~1.035, and the pumpkin pair (ring 0.9772 / field 1.0384) — run it after any pipeline change.

Deploy-lesson-class findings, stated as rules:

1. Binary renders above ~12% ink are silently thresholded to an EMPTY set by the argmin rule — assert non-empty masks on every run.
2. Gate windows must be checked against the pinned scale lattice [4,6,9,13,20,29,43,64] BEFORE running: the pre-registered "16-64" window was ill-posed on that lattice (no two-octave span); it was amended to {13,20,29,43,64} pre-v2 with a-priori justification, logged, and never moved post-hoc.
3. Render bias is r/L-dependent (measured −0.099 at L=256, +0.012 at L=384) — calibrate by L-convergence (same generator at two L); analytic bias models got the sign wrong.
4. Keep element size uniform and ≪ the finest hierarchy spacing; size-grading elements by hierarchy depth puts each level's contour→point transition inside the pinned window (the v1 gate failure: D 0.9478).
5. Order-vs-disorder is extent-confounded in naive designs (tri 1.2636 vs shuffle ~1.035 — predicted near-degenerate); matched-extent controls are required.

Real-data record: Norcia 2021 Fig 2b's 8 in-situ panels across the 1D→2D transition read D 0.98→1.37 (single-trial noise, extent-confounded); the Trypogeorgos Zenodo data is 1D profiles only (no threshold signature in D; strips 1.24–1.50); the r² low_confidence gate fired at half-res on real data exactly as designed; live-route parity max Δ 4.9e-5. Canonical record: `refs/sierpinski-supersolid-connection-2026-10-06.md`.

v3 matched-extent control (2026-10-06): jittered lattice 1.2609 vs lattice 1.2636 — the tri/shuffle gap was array extent; D is a hierarchy/fill detector, not an order parameter (Addendum 7).

## Guidelines

1. Every noul instruction carries a measured number; no free-prose classification.
2. r2 < 0.98 -> no verdict from that axis; `low_confidence` and excluded from the clef call.
3. Hysteresis (0.45/0.55) always available; carried rows are never silently re-flipped.
4. Run rows are audit trail: taste / taste-matrix / edge-standard kinds land in `jev_corpus_runs`, idempotent per input sha256.
5. A failing selftest (500) blocks trust in results; run GET /taste/selftest after any deploy.
6. Under-inked images (coverage saturation) get flagged and are excluded from band reads.
7. The composite beauty number does not exist and must not be invented; the vector is the product.
8. Changes to pinned parameters are major version bumps; prior measurements keep their version stamp.

Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.
