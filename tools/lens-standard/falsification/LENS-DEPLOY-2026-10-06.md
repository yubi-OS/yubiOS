# LENS-STANDARD-V1 DEPLOY RECORD (2026-10-06, "tackle the open items parallel-build-lines")

Three parallel lanes (H/I/J, per parallel-build-lanes) + orchestrator integration. Worker bundle grew to 50 parts (new jev-lens.js route module, jev-lens-math.js JS port, fixtures/lens-fixtures.mjs compact parity pack). Deploy etags: 091bed34 (first) -> f814930f (surface fix) -> **f42b53e9 (final)**. Schedules + 14 bindings preserved throughout.

## Lane H — JS port (general/smart)
jev-lens-math.js: pure ESM port of lens_standard.py, **bit-exact parity** — sha_aberrated/sha_corrected exact on all 12 fixtures (3 modes x 2 magnitudes x {gasket, tri}); est coefficients and all three D readings match to 0.0. 28/28 node tests. Float-semantics lessons (each sha-verified empirically): Python math.hypot != sqrt(x^2+y^2) (93k one-ulp mismatches; Math.hypot matched bit-for-bit over all 262,144 lattice points); Python x**3 calls C pow() (Math.pow required); nint = floor(v+0.5) never Math.round; Python round() is half-to-even; floor-div -> Math.floor((p+q)/2); evaluation order mirrored left-associatively.

## Lane I — route module + corrected-hierarchy preregistration (general/balanced)
jev-lens.js: POST /api/jev/corpus/lens/correct (multi-mode estimate -> pinned sequential inverse order astig->spherical->trefoil -> re-measure D; run row kind lens-correct), GET /lens/selftest. Fail-loud surface resolution (503 LENS_NOT_CONFIGURED, no local substitution). Pre-registered corrected-hierarchy band: detection threshold T(m) = max(10 x noise(m), r_min/20) from Lane F's 46/46 selftest residual maxima (astig 7.6e-3, spherical 3.0e-3, trefoil 5e-6); band = D in [1.0,1.45) AND lens.detect_score >= 1 AND n_components >= 300 (v10 floor) -> lane-correct, provisional until calibration; Set A (registry matrix: estimator + no-false-positive gates) vs Set B (ordered-band-reaching magnitudes: astig 0.20, spherical 0.24, trefoil 2.0e-4). Wiring doc: 6 steps incl. the deterministic lane-correct dispatch branch (no model call; one terminal re-route, depth cap 1) and deploy order code-then-policy.

## Lane J — real supersolid imagery through the oracle (general/balanced)
Norcia 2021 Fig 2b re-extracted from arXiv 2102.05555 (600 dpi, star-masked, determinism bitwise-verified), 8 panels through the LOCAL oracle stack (parity-proven): D 1.00 -> 1.21 across the linear->zig-zag transition (trend matches the prior record); **Einstein-honest HELD 11/11** (8 panels + 3 golds all `insufficient`, zero false "consistent"); ordered-smooth/Sierpinski-band HELD (D nowhere near 1.585). **d_w ~ 2.0 prediction REFUTED at this graph size**: panels read d_w 3.4-6.1 because the graphs are starved (7-37 droplets, 274-464 walk nodes vs the pinned 256-step ladder — MSD saturation; the same code reads 2.18, r2 0.9995, on the 2928-node gold gasket) — instrument-limited, not physics, recorded as a finding. New CF-class bug found: the shipped _hop_measurements crashes (math domain error) on a zero-variance return series (tri gold). Manifests saved for live-route verification.

## Orchestrator integration fixes (each live-verified)
1. Lane I's resolveLensSurface candidate lists extended with Lane H's actual exports (estimateCoefficient) — surface now resolves: warp=warpMask, estimate=estimateCoefficient (style ref-relative), correct=correctLoop.
2. Fixture-hash format mismatch: Lane I's maskSha is djb2 while fixtures carry sha256 — fixture comparisons switched to lensMath.maskSha256 (warp parity then PASSED live: sha_ab match).
3. Compact fixture part: masks regenerated in-worker via goldRender + warp (350KB per mask saved; same parity guarantees).
4. LIVE selftest state (etag f42b53e9): 6/7 implemented checks PASS — surface, thresholds, fixtures-present, warp idempotence, fixture warp parity, fixture estimate parity (c_hat 9.998e-2 vs 0.1 live). **Two open selftest defects (diagnostic-only; the math is proven by the passing parity checks + the 75/75 Python-side falsification):** (a) the recovery/byte-parity check throws "empty edge map" inside the shared try — needs per-check isolation; (b) two placeholder slots (lens_check_slot_8/9) report FAIL because the slot-fill loop treats unfilled as fail.

## Open items (next round)
1. Lens selftest: per-check isolation + slot semantics (diagnostic-only).
2. Corrected-hierarchy band wiring per WIRING-corrected-hierarchy.md (router lens feature, deterministic lane-correct dispatch branch, policy v11 provisional -> Set A/Set B calibration -> calibrated).
3. Live-route /oracle verification of Lane J's panels (manifests ready; local stack is parity-proven at delta 0.0).
4. _hop_measurements zero-variance crash fix (CF-class).
