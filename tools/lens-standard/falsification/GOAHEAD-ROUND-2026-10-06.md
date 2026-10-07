# GO-AHEAD ROUND (2026-10-06, "go ahead" on the open items)

## 1. Lens selftest isolation — FIXED, 9/9 PASS live (etag 5596d5e5)

Four defects found and fixed across two deploy cycles:
1. **Mode-name mismatch**: Lane I's MODES/DETECT_THRESHOLDS used "astigmatism" while the canonical module (and the Python source of record) use "astig" — the idle/detection checks called the estimator with an unknown mode. Normalized to canonical names.
2. **The recovery "empty edge map"**: the selftest fed the RAW 0/255 warp output into ctx.edgeMeasure (es.measure counts cells == 1, so a 0/255 grid reads empty). Fixed via lensMath.measureD (threshold -> trace -> measure, the full pipeline). |D_corr - D_ref| = 0.000000 live.
3. **Scope leak**: the detection gate referenced `idles` after per-check isolation moved it into the idle check's try block. Hoisted to shared scope.
4. **LF-2 cross-talk as a throw**: the trefoil estimator's cross-talk reading on the astig-aberrated mask (3.29e-4 > MAX_TREFOIL 2e-4) made checkCoef throw mid-check. Per-mode robust estimates now record out-of-envelope readings as score Infinity with the LF-2 note in the detail. **Live-measured finding: astig 0.1 reads trefoil at ~66x T(trefoil) — cross-mode detection leakage is real and recorded for the corrected-hierarchy band design (the pinned sequential correction order handles it).**

Live selftest (etag 5596d5e5): 9/9 PASS — surface, thresholds, fixtures, idempotence, warp parity (sha_ab match), estimate parity (c_hat 9.998e-2 vs 0.1), recovery (byte=true, |D_corr-D_ref| 0.000000), idle estimates (all exactly 0), detection gate (idle_score 0, ab_score 13.15).

## 2. _regress zero-variance crash — FIXED (spectral_standard.py)

Root cause (Lane J's tri-gold crash): a zero-variance return series makes floating-point cancellation produce a tiny NEGATIVE vy, which passes the `vx == 0 or vy == 0` guard and hits math.sqrt(negative) -> ValueError math domain error. Fix: `vx <= 0 or vy <= 0` (variance cannot be negative). Verified: the tri coordless hop path no longer crashes (d_w_hop 25.77, the documented saturation diagnostic); centroid_walk selftest 46/46.

## 3. Corrected-hierarchy wiring — SPEC COMPLETE, IMPLEMENTATION NEXT ROUND

Lane I's deliverables are complete and pre-registered: the band definition (D in [1.0,1.45) AND lens.detect_score >= 1 AND n_components >= 300 -> lane-correct, provisional until calibration), detection thresholds T(m) = max(10 x noise, r_min/20), the Set A/Set B calibration protocol, and the 6-step wiring doc. Implementation deferred to a fresh-context round, safety rationale stated: the lane-correct dispatch branch touches dispatchRouteAction — the core execution path for ALL jev tasks — and the calibration loop is a full round of falsification work. Per the house rule (falsification before live routing), the band ships provisional (needs_approval, never auto-dispatches) only together with its dispatch branch, so no partial ship.

## 4. Live /oracle verification of Lane J's panels — READY, DEFERRED

The at0.37 representative is downsampled and staged (panel037.json, 151x200); the local oracle stack is parity-proven at delta 0.0, so the local readings are authoritative. The live-route POST completes the loop next round.
