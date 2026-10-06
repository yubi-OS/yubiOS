# PREREGISTRATION: corrected-hierarchy router band (lens-standard-v1, Lane I)

Date: 2026-10-06. Written BEFORE any band calibration exists (the falsification-corpus rule). Extends PREREGISTRATION-lens-2026-10-06.md (Lane G) and the V4 pair-band regime (ROUTER-V4-2026-10-06.md, policy v10). Companion deliverables: `jev-lens.js` (route module) and `WIRING-corrected-hierarchy.md` (orchestrator wiring).

## Problem (why this band must exist)

Policy v10 routes an image by its MEASURED features: hierarchy-confirmed / hierarchy-spectral (pair bands, target lane-draft) vs ordered-image / sparse-image (D in [0, 1.45), target lane-classify). A real hierarchy artifact whose D has been depressed by an aberration reads ORDERED and mis-routes to the 8b lane. Lane F's powered lens (46/46 selftest; Lane G harness 75/75) can detect and invert such aberrations exactly when the forward map is injective on the ink lattice. The corrected-hierarchy band is the router leg of that instrument: when a measured-ordered artifact carries a lens estimate above the detection threshold, route it to a DETERMINISTIC correction step, then re-route the corrected artifact exactly once.

## Band definition (pre-registered, all-clauses pair band)

Policy v11 adds ONE pair band, declared FIRST in `routing.bands` (pair bands take declared priority over single-feature bands in `selectBand`):

```json
{
  "id": "corrected-hierarchy",
  "modality": "image",
  "feature": "pair",
  "min": 0, "max": 100,
  "all": [
    { "feature": "fractal_band.D",   "min": 1.0, "max": 1.45 },
    { "feature": "lens.detect_score", "min": 1.0, "max": 1e9 },
    { "feature": "spectral.n_components", "min": 300, "max": 100000 }
  ],
  "target": "lane-correct",
  "calibration": "provisional",
  "description": "corrected-hierarchy (v11): measured-ordered D [1.0,1.45) AND lens detect_score >= 1 AND n_components >= 300 -> deterministic lens correction, then ONE terminal re-route. Provisional until the calibration protocol below passes."
}
```

Trigger = CONJUNCTION of three measured features, all pre-declared:

1. **D in the ordered band**: edge-standard D in [1.00, 1.45). The band exists to rescue artifacts that would mis-route ordered; an artifact already reading hierarchy (D >= 1.45) is not rescued.
2. **lens.detect_score >= 1**: the multi-mode lens estimator (all three modes estimated against the pinned reference frame; AO-style calibration against the known reference, the documented Lane F scope note) reads at least one mode at or above its pre-registered detection threshold. `detect_score = max_m |c_hat(m)| / T(m)`.
3. **n_components >= 300**: the v10 N-floor, carried unchanged (LM-3: the estimator on real photos reads garbage; the floor keeps small-N renders out of the band exactly as v10 kept them out of the spectral pair bands).

## Pre-registered detection thresholds (derivation, a priori)

T(m) = max(10 x noise(m), r_min(m) / 20), where:

- **noise(m)** is Lane F's worst-case measured estimation residual from the 46/46 selftest (REPORT-lane-f.md, all 12 gold cases): astigmatism 7.6e-4, spherical 5.0e-5, trefoil 4.2e-7. (Lane G's harness re-measured the full matrix at 75/75 with |D_corr - D_ref| = 0.0000 across all 3 modes x 2 magnitudes x 3 golds; the residual maxima stand.) These magnitudes ARE the instrument's noise floor: an estimate smaller than 10x this floor is indistinguishable from re-rasterization rounding noise.
- **r_min(m)** is the smallest pinned registry magnitude the instrument is certified on: astigmatism 0.10, spherical 0.06, trefoil 1.0e-4 (Lane F's ABERRATIONS registry; the trefoil valid scale is ~1e-4, not the global ladder).

| mode | noise(m) | 10 x noise | r_min(m) | r_min/20 | **T(m)** | margin to r_min |
|---|---|---|---|---|---|---|
| astigmatism | 7.6e-4 | 7.6e-3 | 0.10 | 5.0e-3 | **7.6e-3** | ~13x |
| spherical | 5.0e-5 | 5.0e-4 | 0.06 | 3.0e-3 | **3.0e-3** | 20x |
| trefoil | 4.2e-7 | 4.2e-6 | 1.0e-4 | 5.0e-6 | **5.0e-6** | 20x |

Both ends hold a priori for every mode: T >= 10x the selftest noise (a threshold-crossing estimate is at least ten noise-sigmas above what rounding alone can produce) and T < r_min (the smallest certified signal still triggers, with >= 13x margin). The B4 idempotence gate (Lane F measured |c0| = 0.0 exactly on un-aberrated golds) confirms the noise floor is rounding-driven, so the 10x factor is conservative. These constants live in `jev-lens.js` as `DETECT_THRESHOLDS` and are NEVER retuned.

## Two-stage route design (depth cap 1, terminal re-route)

- Stage 1: the band selects target `lane-correct`. `route.dispatch` targets gain `"lane-correct"`; the correct step is DETERMINISTIC (pure math, no model call, cost 0) - it is NOT in `model_routes` and MUST NOT ever be added there.
- Stage 2: after the deterministic correction, the corrected artifact is re-measured through the SAME measureImage pipeline and re-banded EXACTLY ONCE. The re-route carries `reroute_depth: 1`; if the re-route again selects `lane-correct`, it is recorded as `blocked: reroute_depth_exceeded` and TERMINATES. The re-route result is TERMINAL in every case: it is recorded as evidence (a child run row + an event on the parent task) and performs NO further dispatch of any kind - not lane-draft, not lane-classify, not lane-correct. Downstream consumption reads the recorded re-route; nothing routes automatically off it in v11.

Loop safety argument: the only path back into lane-correct is a corrected artifact whose D still reads ordered AND whose detect_score still crosses 1. With the cap, that is recorded and stopped; it can never loop.

## dispatchRouteAction branch (deterministic, never a model)

In `jev-execute.js dispatchRouteAction`, the branch order stays: (a) automation targets, (b) **NEW deterministic lane-correct branch**, (c) lane-* model targets via `model_routes`, (d) target_unresolvable. The new branch sits BEFORE (c) so a misdeclared `model_routes.lane-correct` can never hijack it, and it requires:

- `action.tool === "route.dispatch"` AND `target === "lane-correct"` AND `target` in the policy's declared targets (fail-closed `target_not_declared` otherwise, exactly as today).
- The action body carries the routed artifact inline: `artifact_image: { gray_b64 | bitmap_b64, width, height }` (the router embeds it when the selected band's target is lane-correct; body cap stays under the existing 8 MB class). No fetch, no credential, no model.
- The branch: resolve the Lane H surface via jev-lens.js's adapter -> standardize -> estimate all three modes -> apply inverse warps in the pinned order for detected modes -> re-measure -> record run row kind `lens-correct` (child, `notes.parent_run_id = artifact_ref`) -> re-band once (depth 1) -> record the terminal re-route as a child run row kind `router` with `notes.stage = "reroute"` + an append-only event on the parent task (`kind: "dispatch"`, `data.target: "lane-correct"`, `data.reroute: {...}`).
- Verification per SPEC section 4: `verified: true` iff the correction run row exists AND the re-route row's decision is one of the terminal recordable outcomes (allowed/blocked/needs_approval as a RECORDED decision). A thrown correction = `unknown` outcome (never `failed`, never retried), matching the automation-branch convention.
- Cost: `route.dispatch` cost_per_call_usd is 0 in v10 and stays 0 in v11; the branch consumes no LLM neurons.

## Calibration protocol (pre-registered, before any calibration run)

Golds: the pinned 366-droplet gasket falsification render (gen_v2 gasket-v2-L384, D_ref = 1.5589, n = 366; the same gold Lane F/G certified on). Each gold is routed through the LIVE router (v11 policy promoted, band still provisional; the live /route endpoint is the instrument under test).

A priori landing table (derived NOW, from Lane F's already-measured |dD_ab| table - this is the pre-registration's reason to exist): on the gasket, the pinned registry magnitudes shift D by astig {0.10: -0.0940, 0.20: -0.2757}, spherical {0.06: -0.0244, 0.12: -0.0594}, trefoil {1.0e-4: -0.0502, 1.5e-4: -0.0924}. The ordered band needs D < 1.45, i.e. |dD_ab| >= 0.1089. ONLY astig 0.20 (D -> 1.2832) reaches it from the registry matrix. Therefore the calibration set is:

- **Set A (registry matrix, all 6 mode x magnitude pairs)** - gates the estimator/endpoint, NOT the band trigger: each aberrated gold is POSTed to /api/jev/corpus/lens/correct and must (i) estimate its true mode above T(m) and no other mode above T(m) (single-mode purity), (ii) recover |D_corr - D_ref| <= B1 0.05. Aberrated golds whose D stays >= 1.45 must NOT trigger the corrected-hierarchy band (they route hierarchy directly; a trigger there is a FALSE POSITIVE against clause 1).
- **Set B (ordered-band-reaching golds, the trigger calibration)** - per mode, the smallest ENVELOPE-RESPECTING aberration that drives the gasket's D into [1.0, 1.45): astig 0.20 (registry magnitude, measured directly), spherical 0.24 (2x top registry; envelope |s| < 1/3 holds, expansive = injective; predicted D ~ 1.440 by linear extrapolation of the measured 0.495/unit slope), trefoil 2.0e-4 (the PINNED MAX_TREFOIL envelope guard value itself, not a new number; predicted D ~ 1.436). Requirements, per the brief: the un-aberrated gold does NOT trigger the band (no false positives); EVERY Set-B aberrated gold triggers it; after inline correction the re-route lands **hierarchy-confirmed** (D >= 1.45 AND d_w >= 2.4 AND n_components >= 300; the gasket's d_w = 2.7049 at 366 pts is the pinned C2 gate) with |D_after - D_ref| within the B1 0.05 band. If a Set-B prediction is off (extrapolated spherical/trefoil magnitudes), the honest verdict is recorded - a prediction failure is a FINDING, never fixed by moving a threshold post hoc.
- **Set C (negative controls)**: tri-lattice 19-droplet (n-floor blocks: n_components = 19 < 300), shuffle-s42 gold, and an un-aberrated gasket - none may trigger the band.

After a full clean pass, the band's calibration flips `provisional -> calibrated` by policy promote (the audited flow), and the anchors (trigger/no-trigger outcomes, re-route decisions, D_after values) pin ONCE. Until then the band never auto-dispatches (router refuses provisional bands; SPEC-ROUTER section 2).

## Predicted failure modes (pre-declared)

- **LM-1: correction changes component counts -> the re-route measures a different artifact.** The inverse warp can merge/split traced components (Lane F measured 366 -> 326 for a compression-class trefoil before the zoom-floor amendment). If the corrected artifact's n_components drops below 300, the re-route cannot land hierarchy-confirmed. Pre-declared handling: the re-route row records `n_components_after` honestly; the calibration Set-B requirement (re-route lands hierarchy-confirmed) is exactly the test that the expansive certified envelope preserves the droplet count. A failure here is a finding about the envelope, not a knob.
- **LM-2: multi-mode sequential correction order dependence.** The inverse maps do not commute; sequential application in the pinned order (astigmatism, spherical, trefoil) is a first-order composition with the same O(t0 c) neglected-term class Lane F documented (<= 2e-4). v1 corrects ONE pass in the pinned order and re-measures; no iterate-to-fixpoint. Any order change = new pre-registered amendment.
- **LM-3: the estimator on REAL photos reads garbage.** The reference-relative estimator is calibrated against the pinned gasket reference frame; arbitrary real photographs will read arbitrary coefficients. The band therefore carries the v10-style n_components >= 300 floor AND the D-in-ordered-band clause, so garbage estimates on real photos can only trigger inside a narrow measured morphology window, and the provisional->calibrated flip requires the synthetic golds to pass first. A real-photo false positive remains possible and is a known, declared residual risk of v1.

## Never-retune rule

K, walker counts, step ladders, the pinned mode registry order, the sequential correction order, T(m), the B1 0.05 recovery band, the n_components floor, and the band clause boundaries are FIXED at pre-registration. Any post-first-calibration change = a logged amendment with a-priori reasoning, written before any re-measurement. Verdicts are data, never authorization; the band proposes the route, the policy engine disposes.
