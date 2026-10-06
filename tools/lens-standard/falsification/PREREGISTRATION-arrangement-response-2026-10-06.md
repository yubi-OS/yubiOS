# PREREGISTRATION: arrangement-level distortion response (2026-10-06)

Written BEFORE any arrangement-warp measurement exists (the falsification-corpus rule). Extends the lens-standard-v1 contract on draft PR #292. Origin: Lane F's honest scope note — "the injected D-signal is largely rasterization-jitter-driven (arrangement-level response 3-10x smaller)" — promoted by the operator to the next instrument question: **what does the oracle actually read when the DROPLET ARRANGEMENT itself is distorted?**

## The question, made precise

Lane F's pixel-warp arm distorts TWO things at once: (a) the droplet ARRANGEMENT (centroid positions move, spacings change) and (b) the droplet MORPHOLOGY + rasterization (each disk's pixels are warped through the re-rasterization). The measured dD mixes both. This round separates them with a third arm:

- **arrangement arm (new)**: warp the disk CENTERS through Lane F's continuous forward map (`_forward_point`, center (255.5, 255.5)), keep each radius EXACTLY, and re-render PRISTINE disks at the warped centers. The droplet morphology is held fixed (perfect circular disks, identical radii); only the arrangement varies. Any residual sub-pixel centroid-rasterization jitter is the same class the pixel arm has, so the DIFFERENCE between the arms isolates the droplet-shape/morphology distortion.
- **pixel arm (existing, Lane F)**: the validated warp_mask path — arrangement + morphology + rasterization together.

## A-priori theory (the predictions come from this, not from data)

1. **The true box-counting dimension is invariant under expansive affine maps** (bi-Lipschitz: all singular values >= 1 — Lane F's injectivity law). So the *mathematical* D of the arrangement does not move under astig/trefoil at all; the MEASURED D moves only through the pinned 4..64 window's response to changed spacings plus rasterization. Consistent with Lane F's finding that the pixel-arm dD is rasterization-dominated.
2. **The walk exponent d_w is combinatorial, not geometric.** Under a connectivity-preserving affine stretch, the hop-graph is isomorphic and the Euclidean MSD gains a constant prefactor: <r'^2(t)> = a^2<dx^2(t)> + b^2<dy^2(t)>, and both components scale with the SAME hop-exponent (isotropic hitting statistics), so the log-log slope — the exponent — is unchanged. Only a Delaunay-CONNECTIVITY change (rhombus-diagonal rewiring on the locally-regular arrangement, or crop-induced node loss) can move d_w.
3. Spherical is NONLINEAR radial: it changes the local density gradient, so connectivity changes are possible — no a-priori band; reported.

## Pre-registered gates

| # | Gate | Band | Both branches pre-declared |
|---|---|---|---|
| A1 | Affine invariance of the walk exponent: astig 0.1/0.2 and trefoil 1e-4/1.5e-4 arrangement arms, |d_w(warped) − d_w(clean)| | <= 0.05 | PASS = the exponent is affine-invariant (theory confirmed). FAIL = the Delaunay connectivity rewired under the stretch — the spectral channel READS arrangement distortion. Either outcome is a result; the band exists to make the outcome falsifiable, not to protect the theory. |
| A2 | D decomposition ratio at matching magnitudes: |dD_arrangement| <= |dD_pixel| / 3 | (Lane F's "3-10x smaller" made precise at the 3x floor) | PASS = the Lane F diagnostic quantified. FAIL = the arrangement response is larger than the diagnostic suggested — a finding that changes the corrected-hierarchy band's interpretation (the band would be responding to real arrangement distortion more than assumed). |
| A3 | Droplet-count invariance: every arrangement arm keeps n_components = 366 (the re-render is expansive + on-canvas) | asserted; a failure is a bug, not a finding | |
| A4 | Walk determinism anchor: the clean-gasket walk (W=4096, K=4, spread, seed 42, Euclidean) reproduces the C2 anchored d_w = 2.70487 | exact; a failure is a bug | |
| A5 | D determinism anchor: the clean gasket D reproduces 1.5589 | exact | |

## Matrix

- Gasket (Lane F gold, 366 droplets): astig 0.1, 0.2; trefoil 1e-4, 1.5e-4; spherical 0.06 (pinned geometry — the apex margin arithmetic: dy_apex = -221.7, r = 293.4, g(0.06) = 1.0803 -> y' = 16, on-canvas) and spherical 0.12 on a RE-CENTERED variant (apex y = 90; the pinned geometry loses the apex droplet at 0.12: g(0.12) = 1.161 -> y' = -1.9, off-canvas — pre-declared, a-priori arithmetic above). The re-centered variant's clean D_ref is measured fresh as a check (position within the canvas does not affect box-counting except edge effects; band |D_ref(recentered) - 1.5589| <= 0.02).
- Pixel-arm comparison data: Lane F's measured dD at the same magnitudes (astig 0.1 -> -0.094, 0.2 -> -0.276; spherical 0.06 -> -0.024, 0.12 -> -0.059; trefoil 1e-4 -> -0.050, 1.5e-4 -> -0.092).
- Walk conventions: the C-gold canonical set (Euclidean MSD, W=4096, K=4, spread starts, seed 42, the pinned ladder x4) — the same convention that anchored d_w(gasket) = 2.70487.

## Never retune

K, walker count, step ladder, the D window, thresholds, and magnitudes are pinned. Any post-first-run change = logged amendment with a-priori reasoning, before re-measurement.

## Predicted failure modes (pre-declared)

- AR-1: the rhombus-diagonal rewiring above — Delaunay connectivity is not affine-invariant near degenerate configurations; a local rewiring that stays lattice-like should leave d_w unchanged (the exponent is robust to local rewiring), but this is exactly what A1 tests.
- AR-2: the re-render at fractional centroids rasterizes differently than at integer centers — sub-pixel jitter of the same class as the pixel arm; both arms carry it, the difference cancels it only to first order.
- AR-3: the spherical re-centered variant's clean D_ref may differ from 1.5589 by more than the band if edge effects bite — then the spherical dD_arrangement is measured against ITS OWN reference, honestly labeled.
- AR-4: trefoil's zoom floor scales the whole arrangement — the zoom is box-counting-invariant in theory but moves every centroid; the trefoil arm conflates shear + zoom. Reported as the composite (that is what the pixel arm also applies).
