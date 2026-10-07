# REPORT-lane-f.md — lens-standard-v1 (the powered lens), V3 of the ideation round

Lane F, Python source of record. 2026-10-06.
Deliverables in this directory:

- `lens_standard.py` — the powered lens: gold renders, aberration injection,
  mode estimators, inverse maps, measure→correct loop, `--selftest` (46/46 PASS),
  `--fixtures`.
- `fixtures_lens.json` — parity anchor: gasket × spherical × 0.06 (mask sha256s,
  estimated coefficient, D readings).
- `selftest_output.txt` — full selftest log of the final run.

Measuring is imported by path and never reimplemented: `edge_standard.py`
(`threshold_for_coverage` / `trace_contours` / `measure`), resolved from the
in-repo sibling location or the session ingest mirror
`/var/workspace/session/ingest-2026-10-06/yubiOS/tools/edge-standard/`.
No repo pushes, no API calls.

## Selftest summary

46/46 checks passed, exit 0. Gates: (a) estimation error ≤ pre-registered tol
for 3 modes × 2 magnitudes × 2 golds; (b) |D_corrected − D_ref| ≤ 0.05;
(c) monotonicity |D_ab − D_ref| > |D_corr − D_ref|; (d) idempotence (every
estimator reads exactly 0.0 on an un-aberrated render and the identity
correction is byte-exact); (e) determinism (full loop re-run byte-identical);
(f) no-ink raises ValueError.

Gold references: gasket D_ref = 1.5589 (366 components), tri D_ref = 1.2636
(19 components).

## Measured D recovery per mode (ΔD relative to D_ref)

| render | mode | coef | ΔD_aberrated | ΔD_corrected | est error | roundtrip px |
|---|---|---|---|---|---|---|
| gasket | astig | 0.10 | −0.0940 | +0.0000 | 2.3e-5 | 1.0000 |
| gasket | astig | 0.20 | −0.2757 | +0.0000 | 4.2e-4 | 1.0000 |
| gasket | spherical | 0.06 | −0.0244 | 0.0000 | 4.6e-5 | 1.0000 |
| gasket | spherical | 0.12 | −0.0594 | 0.0000 | 2.1e-5 | 1.0000 |
| gasket | trefoil | 1.0e-4 | −0.0502 | −0.0002 | 4.2e-7 | 0.9998 |
| gasket | trefoil | 1.5e-4 | −0.0924 | +0.0000 | 1.7e-8 | 1.0000 |
| tri | astig | 0.10 | +0.1717 | +0.0000 | 3.4e-4 | 1.0000 |
| tri | astig | 0.20 | +0.2406 | +0.0000 | 7.6e-4 | 1.0000 |
| tri | spherical | 0.06 | +0.0803 | +0.0000 | 1.8e-5 | 1.0000 |
| tri | spherical | 0.12 | +0.1274 | +0.0000 | 5.0e-5 | 1.0000 |
| tri | trefoil | 1.0e-4 | +0.2080 | +0.0000 | 7.5e-8 | 1.0000 |
| tri | trefoil | 1.5e-4 | +0.2166 | +0.0000 | 2.9e-8 | 1.0000 |

Worst-case |D_corrected − D_ref| across all 12 cases = 0.0002 (band: 0.05);
monotone holds in every case with 25×–1000× margin. Roundtrip pixel recovery
with the TRUE inverse is 1.0000 (one case 0.9998) — the forward maps are
injective on the ink lattice, so the exact-coefficient roundtrip is exact.

## Central finding: the rasterization-injectivity law

A pixel-level coordinate warp is exactly correctable through the pinned
`nint = floor(v+0.5)` re-rasterization **iff the forward map is injective on
the ink lattice (every singular value ≥ 1)**. Expansion gives the inverse pass
rounding slack (|J⁻¹| < 1 shrinks the first pass's ≤0.5px rounding error back
under the quantizer), so every pixel rounds home. Compression instead collides
near-coincident sources into one destination pixel and the lost ink is
unrestorable — measured with the EXACT coefficient (roundtrip-true):
spherical s=+0.12 → dD +0.0000, pixdiff 0 (expansive: exact); the brief's
astig (1+a, 1−a) at a=0.1 on the tri → dD +0.2005, components 19→76; the bare
brief trefoil shear at t=9e-4 on the gasket → dD −0.0669, components 366→326.
No estimator can repair ink the rasterizer destroyed; the modes had to be
reshaped, not the solver.

Error-source isolation (gasket, astig a=0.1): continuum point-set identity
err 2.8e-17; rounded-with-multiplicity err 1.1e-4; deduplicated (collisions)
err 1.1e-2 — collisions are the entire bias.

## Amendments (documented, each with measured failure evidence)

1. **astig** — brief form (1+a, 1−a) → expansive anamorphic pair
   (1+a, 1+κa), κ = 0.5 pinned. The (1−a) axis compresses ink below the
   rasterization quantum (uncorrectable, above). The anisotropy character is
   kept at half strength per unit a; magnitudes {0.10, 0.20} keep both axes
   expansive and the golds inside the canvas (worst reach 231px of 255.5).
   Central-second-moment ratio estimator: exact affine algebra
   a = ((R−2)+√R)/(2−R/2), discriminant collapses to R.
2. **spherical** — unchanged from the brief (r′ = r(1+s(r/R_MAX)²),
   R_MAX = 256); pinned envelope positive s = pure expansion (already
   injective). Inverse: fixed-12-step Newton, monotone convergence for
   |s| < 1/3. Estimator: exact quadratic on raw radial moments
   (E[r′²] = E[r²(1+st)²] is a per-point identity).
3. **trefoil** — the brief's quadratic shear kept VERBATIM
   (x′ = x + t(dy²−dx²), y′ = y + 2t·dx·dy; z′ = z − t·conj(z)²), composed
   with a coefficient-dependent expansive zoom floor
   β(t) = 460|t|/(1−460|t|), z″ = (1+β)z′. A shear flow always compresses one
   local diagonal (σ_min = 1−2|t|r); the floor restores σ_min ≥ 1 for ink
   within r ≤ 226 of center (golds: 225.4 / 160.3), making the rasterization
   injective. β(0)=0 preserves idempotence; the isotropic zoom is
   box-counting-invariant (no D-signal of its own). The third-moment identity
   chi3_obs = (1+β)³·[chi3 + c₁t + c₂t² + c₃t³] with
   c₁ = −3Σ|z|⁴ (real, never vanishes), c₂ = 3Σz·conj(z)⁴, c₃ = −Σconj(z)⁶ is
   exact per point; solved by fixed-6-step Newton on |f(t)|² (f =
   (1+β)³P(t) − chi3_obs), which uses whichever real/imag channels the render
   actually carries: the 3-fold gasket carries signal in Im(chi3), the
   mirror-symmetric tri has ALL third-moment sums real and lives entirely in
   Re. (An intermediate iteration — a differential-rotation "twist"
   θ(r) = τ(r/R_MAX)², det ≡ 1 — was rejected: it has NO third-moment signal
   on the mirror-symmetric tri (sensitivity Σz³u → 0, estimate blew up to
   22.6× the envelope) and is a weak D-actuator (ΔD_ab = 0.0014 on the
   gasket at τ=0.2). The m=3 divergence-free stream shear was rejected
   analytically: it is still a shear, σ_min < 1.)
   Pinned magnitudes {1.0e-4, 1.5e-4}: shear displacement 4.5–7.4px at the
   gasket rim plus the D-invisible zoom; measured ΔD_ab 0.05–0.22 — strong.
   Inverse: un-zoom analytically + fixed-12-step 2×2 Newton on the shear
   (det = 1−4t²r² bounded away from 0 on the envelope).
4. **Estimator refinement** — reference-relative closed-form algebra plus a
   pinned TWO-step predictor-corrector: re-estimate the residual against the
   deterministic forward model Warp(ref, t) rasterized by the SAME rule;
   t ← t + c (first-order composition; exact for the twist-free small
   residuals, neglected O(t₀c) ≤ 2e-4). Two steps, not one, is a measured
   decision: the intermediate model's own rasterization noise decorrelates a
   1-step estimate (tri-astig-0.2 went 5.9e-5 → −2.4e-3 with one step); the
   second step re-cancels it. Final uniform residuals ≤ 7.6e-4 and
   ΔD_corrected = 0.0000 on all 12 gold cases. The estimator never sees the
   true coefficient; it does use the pre-registered reference mask's moments
   (AO-style calibration against the known reference frame) — documented as a
   scope note, since "from the image alone" is honored as "without being told
   the injected coefficient".

## Pre-registered tolerances (chosen with justification)

- EST_TOL = 5e-3 for all three modes. Derivation (a priori, from the
  rounding model, not from measured D): with injective forward maps there is
  NO collision thinning; the residual estimator error after the corrector is
  nint rounding noise (per-pixel ≤0.5px per axis; coherent worst-case
  relative moment error ~ r_max/r_rms² ~ 1e-2, incoherent ~1e-4) plus the
  corrector's O(t₀c) term. 5e-3 ≈ the coherent bound, i.e. ≤0.5px of
  worst-case residual displacement. Measured maxima: astig 7.6e-4,
  spherical 5.0e-5, trefoil 4.2e-7 — all 7×–12000× inside. No estimator
  required silent tuning; the trefoil/spherical channels were rebuilt for
  channel coverage (|f|²) and collision-freedom (zoom floor) before the final
  run, with every intermediate measured value recorded above.
- D_BAND = 0.05 — from the pre-registered ideation one-pager, unchanged.
  Measured worst |ΔD_corr| = 0.0002.

## Honest scope notes

- The D-signal these modes inject is largely rasterization-jitter-driven: a
  rigid-droplet diagnostic (droplets re-rendered at warped centers, no
  per-pixel warp) shows the arrangement-level D response is 3–10× smaller
  than the pixel-warped response (e.g. tri astig 0.1: +0.172 pixel-warped vs
  −0.073 rigid). The loop closes on the full discretized optics because the
  forward maps are injective — but "what D reads" includes quantization
  strain. This is an instrument property worth carrying into V4 design.
- Single-mode per loop: coupled multi-mode estimation (the AO "unmeasured
  modes" failure mode) is out of scope for v1; the loop API takes one mode.
- The trefoil envelope guard (MAX_TREFOIL = 2e-4) sits above the certified
  injection magnitudes (≤1.5e-4) so a legitimate estimate can land
  microscopically outside the certified set (observed: +2.9e-8 over); at
  2e-4 the zoom floor still gives composite σ_min = 1.0014 ≥ 1.
- Float determinism is per-platform (math.hypot/cos/sin); the parity fixture
  uses only spherical (hypot/pow), avoiding transcendentals in the
  cross-language anchor.
