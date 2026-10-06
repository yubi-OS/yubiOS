# Feature-space hierarchy oracle [IDEATION ONE-PAGER]

Date: 2026-10-06. Method: 3 parallel research lanes (general/fast) + ideate-solo over 6 variations, every decision weighted by /api/decide (clef, policy v6). Companion solo log: `session/hierarchy-oracle-solo-2026-10-06.md`. Probe artifacts: `session/ingest-2026-10-06/probe/`.

## Problem statement

What else can the validated hierarchy/fill detector (edge-standard-v1) become on the road to a **feature-space hierarchy oracle** — an instrument that reads inherited hierarchical ordering in ANY feature space, not just images? Her frame: "the usual approach is a better and better random distribution but the ordering here is inherited."

## Grounding (what the lanes found)

1. **The exact bridge is the Einstein relation.** d_s = 2·d_f/d_w. Our D IS d_f for gasket shapes (1.585 measured vs ln3/ln2). The Sierpinski gasket carries exact closed forms for all three: d_f = ln3/ln2 ≈ 1.585, d_w = ln5/ln2 ≈ 2.322, d_s = 2·ln3/ln5 ≈ 1.365. Fukushima-Shima solved the gasket Laplacian exactly (log-periodically modulated spectrum). Random walks on fractals are anomalous (⟨r²⟩ ∝ τ^(2/d_w)); periodic structures diffuse normally. This is 40-year-old physics (Alexander-Orbach 1982, Rammal-Toulouse 1983) never packaged as a reusable measurement instrument over arbitrary 1D signals.
2. **The 6-fold answer is measured.** Live taste matrix: the 6-fold Y₃³ ring reads fractal_band OFF (p 0.029, D 0.913), symmetry_present ON (1.0), symmetry_variation OFF — ordered-smooth class, distinct from the gasket (fractal_band ON, p 0.925). Her diagonal-diffusion question resolves structurally: 6-fold symmetry IS "diagonal-in-irreps" (hexagonal Laplacian eigenvalue multiplicities divisible by 6, spectrally compressible), but the transport-efficiency reading is refutable (symmetry degeneracies slow mixing). The 6-fold is spectrally compressible; the gasket is hierarchically ordered; the instrument separates them by measured D.
3. **The powered lens has a rigorous grounding.** A lens IS a fractional Fourier transform (Ozaktas-Mendlovic 1993): quadratic-phase + rescaling, a one-parameter diffeomorphism family (order 0 = identity, 1 = Fourier). Adaptive optics is the canonical measure→correct loop with known failure modes (unmeasured modes, non-common-path error, servo lag). No prior art found for a self-correcting fractal-dimension instrument.
4. **Calibration finding (probed locally, this session).** mirrorSymmetryScore is pixel-exact: centering a gasket/ring render on integer (256,256) instead of the mirror axis (255.5) collapses symmetry reads 1.0 → ~0.31 on r=3 contour renders. Centering discipline is load-bearing for any symmetry-band claim.
5. **Real experiments that measured spectral hierarchy**: silica aerogels (fracton DOS via inelastic neutron, d_s ≈ 1.8 — sample-sensitive), fractal drums verifying Weyl-Berry-Lapidus N(ω) ∝ ω^(D_boundary/2) — "can you hear the fractal dimension of a drum" is real literature.

## The winner (clef choice: V1_plus_V6, p 0.686; next best V1 alone 0.202)

**The two-axis hierarchy oracle with inherited-ordering certification:**

- **spectral-standard-v1** (the new instrument): plug any ordered series — a spectrum, PSD, or the Laplacian eigenvalues of a graph built on the artifact's ink mask — fit the counting exponent N(ω) ∝ ω^α over a pinned window (the 1D analogue of the 4..64 px pin), permutation-null gated.
- **The oracle verdict** = (D_geo from edge-standard, d_s from spectral-standard) + the Einstein-relation consistency gate: |d_s − 2·D/d_w| ≤ band, with the log-periodic wiggle as secondary signature. Two independent measurements of the same inherited ordering, cross-checked by a physics identity.
- **Inherited, not sampled**: the gold family is the Sierpinski gasket with exact closed forms for all three exponents (D, d_w, d_s) — calibration comes from known-answer structure, not from random-feature sampling. Any new feature extractor is certified by passing the consistency check on the gold family.

## MVP scope (parallel-build-lanes)

1. Python source of record `spectral_standard.py` (stdlib): mask→graph builder, random-walk d_w + return-probability d_s estimators over pinned windows, counting-exponent fit, Einstein consistency verdict, gasket graph builder, selftest.
2. Exact-eigen gold: Fukushima-Shima gasket eigenvalues (decimation recursion verified against a brute-force Jacobi eigen-solve on level-2/3 graphs), 1D chain (α=1) / 2D lattice (α=2) analytic bands, permutation nulls that MUST collapse α.
3. JS worker port + routes under `/api/jev/corpus/spectral/*` following the taste-engine pattern (fixture parity, run rows kind `spectral`).
4. Falsification harness LAST: pre-registered bands, gate windows checked against the pinned lattice BEFORE running (the falsification-corpus skill's own rules), live-route parity.

## Not doing (and why)

- Powered-lens actuation (V3, p 0.007 as MVP): the measure→correct loop is the follow-on once the two-axis oracle measures; it builds on it, not ahead of it.
- Router pair-bands (V4): consume the oracle after it exists.
- Intake product surface (V5): plumbing, not measurement.
- Any new model deployment; any D-window or coverage retune (major version bumps only).

## Open questions for the build

- Exact gasket level for the gold eigen-solve (level 5 = 243 vertices, Jacobi-feasible; level 6 = 729 borderline in stdlib).
- d_w measurement window pinning (walk steps 1..64? log-spaced like the box scales) — pre-register in the harness before measuring.
- Log-periodic wiggle: secondary gate (oscillation presence), never a fit parameter.
