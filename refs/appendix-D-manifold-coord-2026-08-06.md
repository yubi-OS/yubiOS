# Appendix D — Manifold-Coordinate Benchmark (Rigorous Re-Test)

PR #193's complement to PR #192 v4's primary synthetic-manifold benchmark
(Appendix C.3, 50 seeds, off-span targets at PR #192's basis capacity). PR #193
uses a smaller flat K=2 basis (rank 9 effective) and a Fix A partial-in-span
target design that gives the flat arm a realistic fitting advantage on the
in-span component.

## Fix A targets (verified by lstsq at N = 4000)

The Fix A design splits the in-span and out-of-span contributions to
discriminate the topology signal from the capacity signal:

- **T² target:** sin(θ)·cos(φ) + 0.5·sin(2θ)·cos(2φ). The mode-1 component
  sin(θ)·cos(φ) IS in PR #193's flat K=2 span (lstsq R² = 1.0000 on this
  component alone). The mode-2 component sin(2θ)·cos(2φ) is OUT of flat K=2
  span (lstsq R² = 0.0019 on this component alone — K=2 has no
  sin(2θ)·cos(2φ) basis function). On the COMBINED target (1:0.5 mode
  weighting): flat lstsq R² = 0.8001, sphere lstsq R² = 0.5775 — flat wins
  T² at lstsq because the in-span component is dominant and the sphere
  arm's stereographic lift cannot wrap at θ = 2π.

- **S² target:** real Y₃³ = sin³(colatitude)·cos(3φ), where colatitude
  θ_c = arccos(z) and azimuth φ = atan2(y, x). This IS the Y₃³ basis
  function (in SH L=3 span, lstsq R² = 1.0000 exactly). It is NOT in flat
  periodic Fourier K=2 span on (lon, lat): cos(3φ) requires mode 3 which
  K=2 does not have, and sin³(lat) is not in the K=2 tensor-product
  Fourier span. On the COMBINED target: sphere lstsq R² = 1.0000, flat
  lstsq R² = 0.0022 — sphere wins S² at lstsq.

The partial-in-span design discriminates: where one arm has a basis-fit
advantage (the mode-1 component on T² for flat; the Y₃³ basis function for
sphere on S²), the topology matters where BOTH arms must extrapolate (the
mode-2 component is out-of-span for both arms on T²). No noise on either
target (clean basis-fit + topology-only comparison).

## Results (10-seed mean ± std on holdout R²)

| Manifold | Hyperspherical S² (L=3, 16 SH, rank 16) | Flat Fourier (16 raw, rank 9 effective) |
| --- | --- | --- |
| T² (torus, genus 1) — negative control | +0.4572 ± 0.1425 | +0.7790 ± 0.0586 |
| S² (sphere) — positive control | +1.0000 ± 0.0000 | −0.1101 ± 0.0633 |

**Table D.1.** Manifold-coordinate benchmark (v3 Fix A) — 10-seed holdout
R² on N = 200 synthetic points per manifold, 80/20 split, per-arm λ tuning
via train-only 5-fold inner cross-validation over {10⁻⁴, 10⁻³, 10⁻²,
10⁻¹, 10⁰}, no leakage. Sphere arm fits 16 real spherical harmonics (rank
16); flat arm fits 16 raw periodic Fourier functions on the true manifold
coordinates (rank 9 effective, 7 zero columns). Targets: T² is
sin(θ)·cos(φ) + 0.5·sin(2θ)·cos(2φ) (Fix A partial-in-span); S² is real
Y₃³ = sin³(θ_c)·cos(3φ) (out-of-flat-span, in-SH-span).

Paired statistics (per-seed Δ = sphere − flat):

- **T²:** Δ = −0.3218 ± 0.1104, t = −8.747, one-sided p (flat wins) =
  5.4 × 10⁻⁶. Win counts: flat 10/10, sphere 0/10. **Prediction confirmed.**
  The flat arm's mode-1 fitting advantage on sin(θ)·cos(φ) carries the
  day; flat's measured R² = 0.779 sits near the lstsq floor of 0.800
  (a 2.6% gap from the floor; the residual is the cross-validation
  variance on the mode-2 component, not a topology failure).

- **S²:** Δ = +1.1101 ± 0.0633, t = +52.628, one-sided p (sphere wins) =
  8.1 × 10⁻¹³. Win counts: sphere 10/10, flat 0/10. **Prediction confirmed.**
  The sphere arm fits the in-span Y₃³ target to the numerical floor
  (R² ≈ 1.0000); the flat arm cannot represent cos(3φ) at K=2, so its
  best fit is worse than the corpus-mean prediction (negative R²).

The grouped bar chart with error bars is `papers/charts/chart-manifold-coord-2026-08-06-v3.png` (no in-repo figure carries the number D.1).

## Interpretation

Both predictions of the inductive-bias claim hold under the Fix A
partial-in-span design on PR #193's smaller flat basis. The honest read is
that the claim *survives the more rigorous test at both controls, at PR
#193's smaller basis capacity*. On T², the negative control works
because the in-span mode-1 component is dominant (lstsq floor 0.80) and
the sphere arm's stereo lift cannot wrap at θ = 2π. On S², the positive
control works because the real Y₃³ target is in the SH L=3 span (lstsq
floor 1.0) and out of the flat K=2 span on (lon, lat) (lstsq floor 0.002).

**Capacity-confound context.** PR #193's flat basis has rank 9 effective
(7 zero columns from sin(0·θ)=0, sin(0·φ)=0, and the four zero-
multiplications in the tensor product). The sphere arm has rank 16 SH.
Without the Fix A partial-in-span design — for example, when PR #192 v4's
off-span targets are run against PR #193's flat basis — the sphere arm
wins T² by capacity alone (16 SH > 9 flat effective). Fix A gives flat a
real fitting advantage on the T² mode-1 component — and even with that
advantage, flat's R² ≈ 0.78 reflects genuine partial-fit on the 1:0.5 mode
weighting (the lstsq floor on the combined target is 0.80, not 1.0). The
benchmark discriminates: the in-span mode-1 component is exactly fit
(lstsq 1.0), the out-of-span mode-2 component is not (lstsq 0.002), and
the measured R² = 0.78 is the in-span-fit share of the target's
R²-weighted signal.

**Limitations specific to manifold-coord parameterization.** (1) The T²
target has a 0.5-weight mode-2 component that is genuinely out of span
for both arms — the lstsq floor on the combined target is 0.80, not 1.0.
A pure mode-1 target would let flat reach 1.0 and would not test
extrapolation; a pure mode-2 target would let neither arm reach a
meaningful level. The 1:0.5 mode weighting is a deliberate balance. (2)
The S² target is a single SH basis function (Y₃³); higher-degree or
non-smooth S² targets would be a more discriminating positive control.
PR #192 v4's primary benchmark adds σ = 0.01 Gaussian noise to the S²
target; PR #193's benchmark omits noise (clean basis-fit + topology-only
comparison). (3) Both targets are noiseless here; adding noise would test
generalization rather than exact interpolation, but the lstsq
verification is cleaner without noise. (4) The benchmark uses PR #193's
smaller flat basis (rank 9 effective); PR #192 v4's primary benchmark
uses a flat basis with the same K=2 (rank 9 effective at K=2) but at PR
#192 v4's basis protocol. The two PRs converge on the same conclusion —
the inductive-bias claim holds when the target is chosen out-of-span for
both bases.

**Open-item status update** (Section 7.2). PR #192 v4's protocol
(Appendix C.3, 50 seeds, off-span targets at PR #192's basis capacity,
σ = 0.01 noise on the S² target) is the primary test of the
inductive-bias claim; this appendix is the second test at PR #193's
smaller basis capacity under the Fix A partial-in-span design (no
noise). Both controls work in both PRs; the remaining open items are a
higher-degree S² positive control and a second-corpus re-run of the
ablation itself.

Source: `papers/data/manifold-coord-benchmark-2026-08-06/manifold-coord-benchmark-results.json` (the only benchmark-results JSON in that directory; its `version` field reads `v2 - designed after advisor critique of PR #192`, 10 seeds — matching Table D.1's 10-seed run). The v3-named chart is `papers/charts/chart-manifold-coord-2026-08-06-v3.png`; a `manifold-coord-benchmark-results-v3.json` does not exist on main as of 2026-09-09.
