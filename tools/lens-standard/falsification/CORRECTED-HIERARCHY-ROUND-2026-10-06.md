# CORRECTED-HIERARCHY ROUND (2026-10-06, "go on next round")

The corrected-hierarchy band is **LIVE, CALIBRATED (policy v12), and verified end-to-end through the live router**: an astig-aberrated gasket gold routes measure → detect → correct → re-select → dispatch → terminal with D recovery exact. Deploy etag chain this round: 26d6c240 (router wiring) → f56ae0dc (n-floor semantic fix) → 4b159d6f (scope fix) → 9866c5d9 (const/envelope fixes) → 8f7b29f2 (convergence gate, final). Schedules + 14 bindings preserved on every deploy.

## Design (as-built — one deliberate deviation from Lane I's wiring doc)

The lane-correct step is resolved ROUTER-SIDE, not in jev-execute: after band selection, a band whose target is lane-correct triggers the deterministic correction INLINE in routeArtifact (a measurement-side preprocessing step, like ink-normalization itself), re-measures, and re-selects ONCE (depth cap 1). The gate disposes of the FINAL route — no execute surgery, no import cycles, and the artifact never rides the task body. model_routes deliberately excludes lane-correct, so the target can never be dispatched as a model call. Family gating (amendment to Lane I's fixture-reference design): lens features are computed ONLY when artifact.any.lens_family names a registered gold family on a canonical 512x512 gray — arbitrary artifacts never get lens features and can never false-positive the band.

## Policies (audited promote flow, actor jenny per her in-session directives)

- v11 (learning l_e0acdb8a49717ac7, approvals_expired 0): corrected-hierarchy band PROVISIONAL + lane-correct target.
- v12 (learning l_c80ddee42729fcfe, approvals_expired 0): band -> CALIBRATED after Set A passed.

## N-floor semantic fix (found during Set A prep, verified live)

The v10 n-floor clause intended ">= 300 DROPLETS" but spectral.n_components carried the DELAUNAY GRAPH's connected-component count (1 for any connected arrangement) — silently disabling every pair-band since v10. Fix: n_components = the TRACED droplet count (edge-standard meta.n_components_traced); graph_components kept as a diagnostic. Verified live: gasket gold reads 366, tri gold reads 19. The v10 small-N d_w-saturation findings are unaffected (the traced count is what they targeted).

## Set A — PASSED (clean golds, family declared)

gasket_clean: D 1.5589 (= local exactly), lens estimates 0/0/0, detect_score 0, n_components 366, NO corrected-hierarchy fire, hierarchy-image -> lane-draft -> allowed -> terminal. tri_clean: D 1.2636, estimates 0/0/0, n_components 19, ordered-image -> lane-classify unchanged (the n-floor blocks hierarchy-spectral at 19 < 300 — the fixed semantic working as intended).

## Set B — end-to-end under v12 (3 a-priori magnitudes)

- **astig 0.20: FULL PASS.** corrected-hierarchy fired (D 1.2832 ordered, detect_score high, n_components 366) -> correction applied astig est 0.19958 (error 4.2e-4) -> re-measured D 1.5589 (= D_ref EXACTLY) -> re-selected hierarchy-image -> lane-draft -> dispatched -> terminal (run cr_b15752003ba1a4ef). The complete measure->detect->correct->re-route->dispatch loop, live.
- **spherical 0.24: honest scope finding.** n_components 289 < 300 — the radial breathing pushes the gasket's corner droplets OFF-CANVAS (r' = r(1+s(r/256)^2) exceeds 361 at the corners for s > ~0.12), cropping 77 components (pre-declared LF-3). The band did not fire; the artifact routed ordered-image normally. Conclusion: spherical-driven D-shift into the ordered band is incompatible with the 512 canvas — spherical is out of the band's calibratable scope.
- **trefoil 1.9e-4: honest scope finding + the convergence gate.** n_components 326 >= 300 -> the band FIRED -> but the correction MIS-CORRECTED: the spherical estimator cross-read the trefoil+zoom distortion as spherical 0.2814 (LF-2) and applied a wrong-mode inverse; the trefoil estimator SIGN-ALIASED (read -3.18e-4 on a +1.9e-4 aberration — LF-4, predicted for the gasket's 3-fold symmetry) -> out-of-envelope -> the warp refused (envelope-guarded, fail-closed). The pre-amendment run routed the mis-corrected artifact (D 1.4914, hierarchy-image, dispatched — run cr_0740fac6c0ac4098). AMENDMENT shipped same round: the CONVERGENCE GATE — the corrected artifact must re-verify (detect_score < 1) before the route proceeds; verified live on a fresh trefoil variant (1.905e-4): correction applied -> re-measure detect_score 9999 -> **decision blocked, reroute_not_converged** (run cr_b11bbeee22ed5425). A failed correction now blocks for human review instead of silently routing a mis-corrected artifact — the same independent-verification discipline the task loop applies to every action.

## Band scope after calibration (honest)

The corrected-hierarchy band is calibrated for ASTIG-driven distortion (the full loop verified, D recovery exact). Spherical cannot reach the ordered band without cropping; trefoil cannot be corrected (estimator sign-aliasing beyond ~1.5e-4). Both are recorded as scope limits with the runs as evidence; the convergence gate makes any future non-converging correction fail safe.

## Live /oracle panel check (Lane J follow-up)

at0.37 Norcia panel (0.5x downsample, 151x200) through the live /oracle: D 1.2086 (r2 0.9878), d_w 4.1946 (low_confidence fired as designed at reduced resolution), Einstein inconsistent, run cr_a034b10652fc4d09. The 0.5x reading is its own measurement (downsampling merged the 15 native components into 1 traced component) — Lane J's native-res local readings (D 1.0866, n=15) remain the authoritative record. Route handles real photographic data end-to-end.
