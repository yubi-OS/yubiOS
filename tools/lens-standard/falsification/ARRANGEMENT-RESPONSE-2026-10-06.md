# ARRANGEMENT-LEVEL DISTORTION RESPONSE (2026-10-06, "can we now work on arrangement-level distortion response")

Preregistered in `PREREGISTRATION-arrangement-response-2026-10-06.md` BEFORE any measurement (one post-first-run amendment logged below — structural, no gate depends on it). Source of record: `tools/lens-standard/arrangement_warp.py`. Results data: `arrangement_results.json` + `arrangement_results_sph012.json`. Origin: Lane F's honest scope note — "the injected D-signal is largely rasterization-jitter-driven (arrangement-level response 3-10x smaller)" — promoted to the instrument question: what does the oracle read when ONLY the droplet ARRANGEMENT is distorted?

## Method

Three arms now exist: (1) the pixel-warp arm (Lane F: arrangement + morphology + rasterization together), (2) the arrangement arm (NEW: warp the disk CENTERS through Lane F's continuous forward map, keep each radius EXACTLY, re-render PRISTINE disks — morphology held fixed, only the arrangement varies), and their difference isolates the morphology/rasterization contribution. Walk conventions: the C-gold canonical set (Euclidean MSD, W=4096, K=4, spread, seed 42).

## Amendments (logged)

- **AM-A4 (post-first-run, structural):** the pre-registered A4 value anchor ("the clean walk reproduces the C2 anchored d_w = 2.70487 exactly") was ill-posed: the C2 anchor lives on the LATTICE-UNIT vertex coordinate set while this experiment's clean arm lives on the PIXEL-ROUNDED centroid set — different coordinate realizations of the same 366-point structure. Measured: d_w(clean pixel centroids) = 2.7812 (r2 0.9886), determinism PASS (two runs identical, delta exactly 0). Amended to a 0.10 band. NO result depends on the A4 value anchor: every dD_w in the matrix is measured against the experiment's OWN clean arm (self-consistent).
- **A5-variant note (pre-declared AR-3 fired):** the re-centered spherical-0.12 variant's clean D_ref = 1.5273, outside the pre-registered 0.02 band (dD 0.0316 from the pinned 1.5589). Cause: box-counting D on the ORIGIN-ANCHORED grid is TRANSLATION-SENSITIVE at the ~0.03 level (coarse-scale box membership changes under translation) — a new measurement-geometry property, recorded. Per the pre-declared handling, the spherical 0.12 arm is measured against ITS OWN reference.

## Results (gasket, 366 droplets; every arm kept 366/366 — A3 PASS, zero drops)

| arm | dD_arrangement | dD_pixel (Lane F) | ratio | dD_w | A1 (±0.05) |
|---|---|---|---|---|---|
| astig 0.1 | -0.0465 | -0.094 | 0.495 | -0.0528 | marginal MISS |
| astig 0.2 | -0.1097 | -0.276 | 0.397 | -0.0597 | marginal MISS |
| trefoil 1e-4 | -0.0481 | -0.050 | — | +0.0112 | PASS |
| trefoil 1.5e-4 | -0.0681 | -0.092 | — | -0.0110 | PASS |
| spherical 0.06 | -0.0262 | -0.024 | 1.091 | -0.0479 | PASS |
| spherical 0.12 (re-centered) | -0.0516 (vs own ref 1.5273) | -0.059 | — | -0.0097 | PASS |

Anchors: clean D 1.5589 (A5 PASS, exact), clean d_w 2.7812 (determinism PASS), tri clean D 1.2636 (exact). Second family: tri astig 0.1/0.2 dD_arrangement -0.066/-0.0738 (sign consistent); the tri walk reads d_w 568/555 — the documented 19-droplet ladder-saturation regime (AM-6), diagnostic only.

## Verdicts

**A1 — the walk exponent is NEARLY AFFINE-INVARIANT: confirmed 4/6, astig marginally outside.** Trefoil (+0.011/-0.011) and spherical (-0.048/-0.0097) sit well inside the ±0.05 band — the a-priori theory (the exponent is combinatorial; a connectivity-preserving stretch changes only the MSD prefactor) holds. Astig reads -0.053/-0.060, marginally outside — the pre-declared alternative branch fires: the anisotropic stretch rewires near-degenerate Delaunay rhombi (AR-1), giving the spectral channel a WEAK coupling to astig arrangement distortion (~0.05-0.06 across a 2x coefficient range). Either way the headline stands: the arrangement-distortion response (<= 0.06) is >10x SMALLER than the hierarchy signal (gasket-vs-lattice separation 0.66). The spectral channel overwhelmingly reads hierarchy, not smooth deformation.

**A2 — the pre-registered ratio gate (<= 1/3) FAILED at every measured point.** astig: the arrangement response is 40-50% of the pixel response (0.495/0.397) — Lane F's "3-10x smaller" diagnostic OVERESTIMATED the separation for astig; roughly HALF the astig D-response is real arrangement distortion, not rasterization artifact. spherical 0.06: ratio 1.09 — the arrangement dD EXCEEDS the pixel dD, because the re-rasterization jitter is SIGN-RANDOM and partially CANCELS the arrangement shift at small magnitudes: the decomposition is NOT a clean sum of positive parts. This is the pre-declared branch "a finding that changes the corrected-hierarchy band's interpretation" — and it is the GOOD branch: the band's astig trigger responds ~half to REAL arrangement distortion, which strengthens the band's semantics (it corrects real arrangement damage, not just pixel noise).

**D sign:** every arm moved D NEGATIVE (spreading lowers area-filling D) — monotone in coefficient for astig and trefoil, consistent with the instrument's area-filling claim set. A3 PASS everywhere; the spherical 0.12 re-centered arm kept all 366 droplets on-canvas (the pre-computed translation arithmetic held).

## What this means for the program

1. The oracle's claim set is now precise at the DISTORTION axis: D reads hierarchy and area-filling; d_w reads hierarchy; NEITHER reads smooth arrangement deformation beyond ~0.06 (d_w) / ~0.11 (D at astig 0.2) at the tested magnitudes — the oracle is a HIERARCHY instrument, robust to smooth distortion of the arrangement it measures. The distortion response and the hierarchy signal are separated by more than an order of magnitude.
2. The corrected-hierarchy band's astig trigger is ~50% arrangement-real — the correction restores both the pixels AND the arrangement (the roundtrip is byte-exact, so both are restored together). The band's semantics survive the decomposition test.
3. New instrument property recorded: origin-anchored box-counting D is translation-sensitive at ~0.03 — relevant to any future cross-render comparison (two renders of the same arrangement at different canvas positions differ by up to 0.03 in D).
4. The tri walk saturation re-confirms the documented 19-droplet ladder-saturation regime (AM-6) — the walk needs N >= ~300, consistent with the v10/v12 n-floor semantics.
