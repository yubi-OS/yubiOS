# Lensing the Question Space + Spherical Diffusion (SLERP extension)
**2026-08-13.** Consolidates [lensing-question-space-brainstorm-2026-08-13.md](lensing-question-space-brainstorm-2026-08-13.md) and extends it: geodesic (SLERP-style) interpolation on the hypersphere as the generator of a diffusion process, tying the whole chain together. Source works: `is-this-x-2026-08-12-Final` and `learned-latent-curves-2026-08-06`.

---

## PART I — Lensing findings (consolidated)

### F1. The Möbius chart is already a lens (exact, not metaphor)
φθ ∈ PSL(2,ℂ) with index profile n(z) = |φθ′(z)| is Leonhardt's optical conformal mapping (Science 312:1777, 2006; lens designs: Schmiele et al., PRA 81:033837, 2010). Every run to date freezes φθ at identity: the framework has been carrying an **unpowered lens**. Refining φθ = lens design in the literal optical sense.

### F2. The atom is a ray tracer (exact)
The geodesic-only criterion is discrete Fermat's principle; the Φ(k) ladder is the eikonal S on coverage shells; Δ ≥ 0 = rays never move backward in optical path length. Snell's law is the corner condition of the same variational problem at an index discontinuity (Kalaba & Ueno 1974; Tyc 1997).

### F3. The null is the vacuum; the residual is the deflection (rigorous backing)
Null standardization = measuring deflection against the unlensed background, as in gravitational lensing. Lyu & Mukherjee (arXiv:2407.14942) prove fixed-margin random matrices converge to a tilted-iid ensemble with a variance profile (MP at constant margins), giving the curveball "medium" an analytic spectrum. The paper's 98%-marginal result is that medium; ΔV₂ = +0.0144 at z = +12.3 is the deflection angle. Standardization is a statistical equivalence principle: locally, coordinates always exist in which the medium is flat; what survives (ΔV₂z, directional Hodge statements, Parseval shares vs null) is curvature. **Update 2026-08-22:** the canonicity of this null is now partly machine-checked (Lean §§8–9) and executably verified (CLAIM 6) — see the status section at the end. **Update 2026-08-24:** uniqueness is now proved outright (Lean §10, `stationary_unique_uniform`): uniform is THE stationary law on an irreducible fibre.

### F4. The exact-1.0000 gate passes are caustics
Rank-2 degeneracy = the ray map degenerating = over-focus that destroys information (all 14 machine-precision 1.0000 rows, pure noise included). Prop. 2's red flag is a caustic detector; classification is Thom/Arnold catastrophe theory; the transport analog is Brenier-map singularities.

### F5. Achromatic coordinates exist and are already in the paper
Parseval shares E_ℓm (same 16 entries at any N, d; scale-free along a fold) are dimension-invariant: the achromatic lens. Design rule twin to the membership condition: prefer achromatic coordinates for anything compared across the D-ladder.

### F6. The chain, formalized
- **Question space Q** = the is-this-x triple (Φ, M, V); corpora are rays, families are sources.
- **Null space N₀** = matched-null ensemble = vacuum metric (origin of the map).
- **Intent space I** = the sufficient-statistic quotient; by Čencov's theorem its unique invariant geometry is Fisher–Rao. Constructive version: NPE-style embedding networks from lensing cosmology (learned summary statistics between raw observation and physical parameters) are the direct prior art.
- **Latent space 0 → N dims** = Zhang's effective dimension D_λ = tr((T+λI)⁻¹T): a continuous dial from 0 (λ→∞) to numerical rank (λ→0). The discrete basis ladder becomes a dispersion relation; dimension plays wavelength. JL (k = O(ε⁻² log n)) floors how many dimensions a corpus needs.

### F7. Gap map from Part I
- **A** — which refractive index: √det(Fisher), 1/SD₀[statistic], or |φθ′|; test which predicts the measured power surface on the standard-candle grid (data already in `results/signal_recovery.json`).
- **B** — Snell invariant at basis interfaces: test n_D sin θ_D conservation across the ladder with n_D from the per-D nulls; pure re-analysis of `ladder_VD.json`.
- **C** — intent space must pass the membership condition: define I as the minimal embedding preserving all family verdicts; its null is the same embedding trained on curveball draws.
- **D** — power the lens: optimize φθ to concentrate a target family while the null image stays diffuse (null-standardized objective, never raw fit); anti-caustic constraint = design rank + condition number.
- **E** — caustic classification: perturb each degenerate basis by one column; fold vs structural collapse.
- **F** — Wasserstein channel (speculative): Benamou–Brenier geodesics between corpus and null row-distributions; admit only behind its own null.

---

## PART II — Interpolation on the hypersphere → diffusion (the SLERP extension)

### F8. SLERP is the geodesic interpolant the framework already implies
Shoemake's slerp (SIGGRAPH 1985):
slerp(p, q; t) = [sin((1−t)Ω) p + sin(tΩ) q] / sin Ω, with cos Ω = p·q.
It is the constant-speed geodesic on S^n. Three objects in the papers are secretly discrete slerps:
- the atom's flip sequence (a geodesic walk toward the ideal pole, one quantum at a time);
- the fold ladder (constant-ratio steps along a 1-parameter family);
- the drift-alignment of curves across corpora (llc §E.4).
The continuous upgrade: **slerp(p_file, p*; t)** replaces the k-quantized ladder with a continuous bloom parameter t ∈ [0,1]. The precedent for why geodesic (not linear) interpolation is the right move in high dimension is White 2016, "Sampling Generative Networks": Gaussian latents concentrate on the shell of radius √n, so lerp leaves the data manifold while slerp stays on it. Concentration of measure makes every high-dim latent space effectively a hypersphere, which is why this generalizes beyond S².

### F9. The paper's basis diagonalizes diffusion (the structural gift)
The real spherical harmonics are the eigenfunctions of the Laplace–Beltrami operator: ΔY_ℓm = −ℓ(ℓ+1)Y_ℓm. The heat kernel on S² is
K_t(x·y) = Σ_ℓ (2ℓ+1)/(4π) · e^{−ℓ(ℓ+1)t} · P_ℓ(x·y).
Consequences, all free because the framework already computes in this basis:
1. **Diffusion is diagonal in the Parseval coordinates.** Under heat flow, each per-mode energy decays deterministically: E_ℓ(t) = E_ℓ(0)·e^{−2ℓ(ℓ+1)t} (before renormalization). Diffusing a corpus is a *closed-form operation on the already-measured spectrum*: no simulation needed.
2. **A diffusion-time estimator falls out.** Fit t̂ from the measured per-degree decay of E_ℓ against a reference: one scalar that says "how defocused is this corpus." Dimension-comparable by construction (F5).
3. **The null space is the t → ∞ endpoint of diffusion.** Brownian motion on a compact manifold converges to the uniform measure. So "lensing the question space to the null space" acquires an exact dynamical meaning: **forward diffusion is the map Q → N₀**, run continuously. The is-this-x program measured the two endpoints; the heat flow supplies every intermediate frame.

### F10. Reverse diffusion is the lens run backward (established, 2022–2023)
- De Bortoli, Mathieu, Hutchinson, Thornton, Teh, Doucet, **"Riemannian Score-Based Generative Modelling"** (NeurIPS 2022): forward Brownian motion on compact manifolds (sphere as the worked case), reverse SDE guided by the learned score.
- Huang, Aghajohari, Bose, Panangaden, Courville, **"Riemannian Diffusion Models"** (NeurIPS 2022): Stratonovich SDE formulation, Riemannian ELBO = Riemannian score matching.
- **"Scaling Riemannian Diffusion Models"** (NeurIPS 2023): exact heat-kernel computations on symmetric spaces (spheres, tori, Lie groups) — S² and S^n are the *easy* case with the closed-form kernel of F9.
Reading in the lensing dictionary: the forward process defocuses (corpus → uniform null), the learned score s(x,t) = ∇log p_t(x) is the **refractive-index gradient**, and the reverse SDE is a lens that focuses the uniform measure back into the corpus distribution. This is the general (non-conformal) lens; φθ (F1) is its 6-parameter interpretable subfamily.

### F11. The compass atom is the zero-temperature discretization of a sphere Langevin
Riemannian Langevin on S²: dX = −∇_g Φ(X) dt + √(2T) dB_{S²}, stationary density ∝ e^{−Φ(x)/T}. This extends the curve-compass ± atom from the 10-state k-shell chain to the full sphere:
- the compass's π_T(k) ∝ C(9,k)e^{−Φ(k)/T} is the k-shell marginal of the sphere Langevin with an exchangeable potential;
- T → 0 recovers greedy geodesic descent = the atom = the historical absorbing log (matching the paper's T→0 verification exactly);
- one Euler–Maruyama step on the sphere is literally "slerp toward the pole + tangential noise": **slerp is the deterministic half of the diffusion step**. That is the precise sense in which "interpolation on the hypersphere creates diffusion."
- The natural stationary families are von Mises–Fisher, ∝ e^{κ μ·x}: the sphere's Gaussians. κ is the concentration (focus) knob, κ ~ 1/T. The two-population mixture family M₄ becomes a 2-component vMF mixture on S², which finally gives yubiOS's nearest family a *generative* spherical form.

### F12. What this buys the is-this-x map
1. **A scale-space channel.** Diffuse corpus AND its matched null with the same t; a signal is *diffusion-stable at scale t* if its null-standardized z survives. This is Gaussian scale-space (vision) transplanted to the question space, and it gives every coordinate a persistence profile z(t) instead of a single number: features that die at small t are texture, features that survive are structure. (Analogy discipline: each z(t) inherits the same over-dispersion caveat; use empirical null quantiles.)
2. **Standard-candle generator v2.** Train an RSGM on the Fibonacci-lattice corpus points: a generative sampler whose reverse trajectories synthesize corpora *between* the null and the data. Reference families become checkpoints along diffusion time rather than hand-built generators; "widen the grid" becomes "sample more of the bridge."
3. **The SLERP fold.** Replace the amplitude ladder s = 0.25...2 with geodesic rungs slerp(p₀, p*; t_k), t_k a constant-ratio grid. Same fold-slope statistic, same empirical null-ladder quantile, but the rungs are now intrinsic to the sphere (no log-odds units), so the fold becomes basis-independent and composes with F5's achromatic coordinates.
4. **Unification with transport (closes Part I Gap F properly).** The Schrödinger bridge between the null measure and the corpus measure interpolates between entropic diffusion (T > 0) and Benamou–Brenier optimal transport (T → 0). Diffusion and the Wasserstein channel are one family with T as the knob, the same T the compass already swept: T_× = 0.0411 was measured on the k-marginal; the sphere version has its own crossover to find.

### F13. New gaps (Part II), each with the cheapest test
- **G1 — closed-form defocus, verify against simulation.** Apply e^{−ℓ(ℓ+1)t} decay to the measured Parseval shares of the 2286×9 corpus and confirm against explicit Brownian simulation on the Fibonacci lattice. One script; the spectrum is already in `results/real-gwtc-results.json` shape.
- **G2 — diffusion-time null.** t̂ needs its own non-degenerate null (membership condition): compute t̂ on curveball draws; if the null's t̂ distribution is degenerate, the coordinate is inadmissible.
- **G3 — scale-space sweep.** z(t) profiles for ΔV₂z and E_{3,3} on yubiOS and GWTC at 5–10 log-spaced t. Prediction worth pre-registering: the m=3 starvation effect (below-null shares) should *invert or die* at moderate t, since diffusion scrambles the PC1-ordering mechanism that causes it.
- **G4 — sphere Langevin vs compass.** Run the S² Langevin with Φ = chordal distance to pole at the compass's T grid; verify the k-shell marginal reproduces π_T(k) and locate the sphere-native crossover. Extends the compass's 8/8 selftest to the continuum.
- **G5 — RSGM feasibility.** N = 2286 points on S² is tiny by RSGM standards; the exact S² heat kernel removes the usual approximation pain (NeurIPS 2023 result). Risk: the corpus is 176 distinct rows, so the point cloud is heavily atomic; may need kernel-smoothed targets first (vMF bandwidth = another t).
- **G6 — caustics of the reverse flow.** Where the learned score focuses mass onto lower-dimensional sets, the reverse flow develops the same rank-collapse signature as F4. The anti-caustic guard (rank + condition number) should be monitored *along diffusion time*, not just at endpoints.

---

## Order of attack (merged)
1. **G1** (closed-form defocus check): hours, pure verification, unlocks everything in Part II.
2. **B** (Snell invariant on the ladder): re-analysis only.
3. **G3** (scale-space sweep with matched nulls): first new science; the m=3 inversion prediction is falsifiable.
4. **D** (power the Möbius lens, null-constrained objective): flagship of Part I.
5. **G4** (Langevin ↔ compass continuum check): extends an already-green selftest.
6. **A, C, G2** (theory choices + admissibility nulls).
7. **G5, E, G6, F** (generative model, caustic classification, bridge unification).

## Honesty constraints (carried over, apply to Part II too)
- No coordinate enters the map without a demonstrated non-degenerate null (t̂ included).
- Empirical null quantiles, never Gaussian tails, for any statistic built from over-dispersed z.
- "Diffusion," "lens," "focus" stay in this document until the corresponding construction passes the membership condition; the compass set the precedent for how to do this cleanly (designed dynamics, wall between corpus facts and design facts).
- T is a knob of designed dynamics, not an observable of the corpus (paper's own rule; applies verbatim to diffusion time t).

## Load-bearing sources
Part I: Leonhardt Science 312:1777 (2006); Schmiele et al. PRA 81:033837 (2010); Kalaba & Ueno JOSA 64:317 (1974); Tyc JOSA A 14:2850 (1997); Rao (1945); Čencov uniqueness; Efron Ann. Stat. 3:1189 (1975); Marchenko–Pastur (1967); Lyu & Mukherjee arXiv:2407.14942; Dasgupta & Gupta JL (2003); Zhang effective dimension (NeurIPS 2002 / NC 2005); Ambrosio–Gigli–Savaré OT; lensing SBI: arXiv:2501.08524, arXiv:2309.16063.
Part II: Shoemake, SIGGRAPH 1985 (slerp); White, arXiv:1609.04468 (spherical latent interpolation); De Bortoli et al., Riemannian Score-Based Generative Modelling, NeurIPS 2022; Huang et al., Riemannian Diffusion Models, NeurIPS 2022; Scaling Riemannian Diffusion Models, NeurIPS 2023 (exact heat kernels on symmetric spaces); standard S² heat kernel via Legendre expansion; von Mises–Fisher family; Schrödinger bridge ↔ entropic OT (Léonard survey; De Bortoli et al. Diffusion Schrödinger Bridge, NeurIPS 2021).

---

## **Unified paper v2 (2026-08-22): [`curved-corpus-unified-2026-08-22-v2.tex`](curved-corpus-unified-2026-08-22-v2.tex)** — supersedes the 08-13 tex: scope note updated for the executed $A_ℓ$ admission null (recorded negative, CI-enforced), plus a new Addendum §: the lens powered end-to-end (15-seed sweep, budget, amplitude, real-corpus run ΔJ=+126.1 with ~5× selection-null margin) and the geometry of the optimized chart — loxodromic spiral zoom (translation length 1.073, rotation 17.5°) converged onto the anti-caustic boundary (cond 997.8/1000); numbers in [`data/gapD/lens-geometry-2026-08-22.json`](data/gapD/lens-geometry-2026-08-22.json). Same-day follow-on — **loxodromic navigation executed**: J(t) along the canonical flow M^t is perfectly monotone (ρ = 1.0), crossing zero at t ≈ 0.5 and reaching the recorded optimum exactly at t = 1, with the guard failing at t = 1.05 — the optimum is the boundary point of its own flow, so lens design reduces to 1-D navigation along the loxodromic bearing. The induced flow coordinate u **fails admission** (sd(u) z = +1.64 < 3), joining A₁: no scalar coordinate yet survives the fixed-margin trial ([`data/gapD/loxodromic-navigation-2026-08-22.json`](data/gapD/loxodromic-navigation-2026-08-22.json)).

Machine-checked + CI-resolved status (2026-08-22, updated 2026-08-24)

The identity/measurement boundary of the unified paper (§6) is now enforced structurally in CI: workflow [`lean-check.yml`](../.github/workflows/lean-check.yml) runs two jobs on every push touching `data/lean/**`.

**Job 1 — `check` (identities).** [`data/lean/CurvedCorpus.lean`](data/lean/CurvedCorpus.lean) compiles on pinned core Lean 4.33.0, no mathlib, no `sorry`. Contents: the atom invariant Δ≥0, linear composition, cumulative monotonicity, the gate–rank identity (strengthened 2026-08-22 to the genuine two-fraction form `fracGe p q 2 5 ↔ fracGe 5 1 (2q) p`, each direction consuming one positivity hypothesis), the Φ-ladder telescope, heat-exponent monotonicity/additivity, MH flux symmetry, **§8: curveball trades preserve every row and column sum** — the sampler's move set provably never leaves the fixed-margin fibre — and **§9: reversibility + uniform-stationarity mechanics**. Added 2026-08-24: **§10 — the F3 capstone** (`stationary_unique_uniform`: uniqueness-from-irreducibility proved in full generality via the discrete maximum principle), **§11 — the MP/Narayana moment skeleton** of the Lyu–Mukherjee anchor (Narayana rows through k=8 and the Catalan row-sum specialization as exact kernel-checked identities, via the free-Poisson functional equation), and **§12 — the decibel laws** behind the dBc level scale (cascade additivity: gains multiply, levels add; the pressure/power factor 2 as a theorem; injectivity of level readings).

**Job 2 — `verify-measurements` (the explicit non-claims; eight claims as of 2026-08-24).** The Lean file's scope block lists five things the proof does NOT establish; [`data/lean/verify_claims.py`](data/lean/verify_claims.py) resolves each as a seeded PASS/FAIL check against the shipped evidence bundle (`is-this-x-2026-08-12-Final.zip`), exiting nonzero on any FAIL. Results from run [32574882099](https://github.com/yubi-OS/yubiOS/actions/runs/32574882099) (commit `72a5cdd4`):

| # | Non-claim | Resolution | Result |
|---|---|---|---|
| 1 | null ensemble scientifically adequate | fibre mechanics proved (Lean §8); uniformity χ² on an exhaustively enumerated 310-element fixed-margin fibre | support 310/310, outside=0, z=+0.53 — PASS |
| 2 | Monte Carlo calibration converged | curveball V₂ mixing profile on the real 2286×9 matrix | flat 20N→100N (gap 0.0006 < tol 0.0019), 100N mean 0.7083 ≈ audit 0.7092 — PASS |
| 3 | spherical heat-kernel implementation error-free | independent Euler–Maruyama reimplementation vs exp(−ℓ(ℓ+1)t), ℓ=1..3, t∈{0.05,0.2} | all 6 cells within tolerance (worst: ℓ=3,t=0.2: 0.0860 vs 0.0907) — PASS |
| 4 | floating point matches the real-number model | 2,117 float64 spot-checks of the Lean identities + margin preservation over 500 trades | all hold — PASS |
| 5 | the corpus-specific effect is genuine | full re-derivation from the bundle: real V₂ = 0.7235293731 (matches published to 1e-9); fresh 40-rep curveball null | ΔV₂ = +0.0146, z = +12.8 vs paper's +0.0144, z = +12.13 — **independent replication**, PASS |
| 6 | (F3) the fixed-margin null is canonical | Lean §9: every trade is reversible + symmetric kernels make uniform stationary; CLAIM 6: trade graph on the exhaustive 310-element fibre is connected (irreducibility), and the constant-margin medium converges to its **analytic** spectrum ρ = −1/(d−1), V₂ = 0.25 at d=9 | connected 310/310; curveball V₂ → 0.25: dist 0.036 (N=513) → 0.018 (N=2052); run [32578915261](https://github.com/yubi-OS/yubiOS/actions/runs/32578915261) — PASS |
| 7 | A₁(t) admissible as a map coordinate | admission null **executed 2026-08-22** (was specified-but-unexecuted in the unified paper's scope): A₁(0.005) on n=50 curveball draws, two seeds, plus value-level vMF de-atomization sweep κ ∈ [2, 1000] ([`data/atomicity/A1-admission-null.json`](data/atomicity/A1-admission-null.json)) | real A₁ = 0.945 vs null 0.862 ± 0.053 ⇒ z = +1.59 (seed 777: +1.27) — **marginal-dominated**; best smoothed A₁ = 0.492 > halving bar 0.473 even at κ=2 ⇒ de-atomization unreachable (the 795-row all-ones atom is a point mass). Pre-registered NEGATIVE recorded; CI asserts it reproduces (runs [32598178129](https://github.com/yubi-OS/yubiOS/actions/runs/32598178129), [32598321256](https://github.com/yubi-OS/yubiOS/actions/runs/32598321256)) — PASS (negative) |
| 8 | the MP target is what the medium approaches (Lyu–Mukherjee anchor) | Lean §11 proves the exact target moments (Narayana rows, Catalan row sums, k ≤ 8); CLAIM 7 matches the curveball-sampled constant-margin ensemble's empirical spectral moments (n=512, p=128, λ=0.25) against them | m₁–m₄ relative error ≤ 0.5% — PASS (run [32720343923](https://github.com/yubi-OS/yubiOS/actions/runs/32720343923)) |
| 9 | the effect on a calibrated level scale | corpus level L = 20·log₁₀(\|ΔV₂\|/σ_null) **dBc**, 0 dBc = the vacuum's own RMS fluctuation; level laws proved (Lean §12); instrument [`tools/corpus-sonometer/`](../tools/corpus-sonometer/) (selftest in `verify-tools`) | L(20N) = +24.3 dBc, L(40N) = +17.4 dBc vs published z=+12.13 ↔ +21.7 dBc; both above the +15.6 dBc detectability floor (z>6) — PASS (CLAIM 8) |

Scope note: PASS here means the seeded check reproduces the paper's numbers under its stated protocol — it does not elevate any measurement to a theorem. The items remain measurements; they are now *executable* measurements gating the same CI as the proof. **F3 canonicity update (2026-08-22):** the null's canonicity is no longer a bare modeling judgment — it decomposes as (i) moves stay on the fibre [Lean §8, proved], (ii) trades are reversible so the kernel is symmetric [Lean §9, proved], (iii) symmetric kernel ⇒ uniform is stationary [Lean §9, proved], (iv) irreducibility [checked exhaustively on the 310-element instance] — together: uniform (maximum entropy given margins) is THE stationary law of the curveball chain. An instructive negative from building claim 6: at fixed d the fixed-margin medium does NOT converge to destroyed-dependence nulls (colperm/iid) — the exactly-k-per-row constraint carries an N-independent exchangeable correlation ρ = −1/(d−1); the medium instead converges to its own analytic spectrum, which is precisely F3's claim and consistent with the paper's 98%-marginal-fixed finding. **Update 2026-08-24:** uniqueness-from-irreducibility is now proved in full generality (Lean §10, discrete maximum principle); irreducibility itself stays an exhaustively checked instance input (CLAIM 6). Still cited, not proved: the asymptotic Lyu–Mukherjee weak-convergence theorem itself — though its exact target moments are now Lean-proved (§11) and matched empirically (CLAIM 7) — and the choice of margins as the conditioning statistic remains a scientific judgment argued in the papers.

---

## Deliverables (2026-08-22): the program as runnable tools

Six deliverables assembled from the papers + tests, each merged via PR and covered by the `verify-tools` CI job (every tool ships `--selftest`; CI runs them all on every push touching `tools/**` or `papers/data/lean/**`):

| # | PR | What | Where |
|---|---|---|---|
| D1 | [#212](https://github.com/yubi-OS/yubiOS/pull/212) | **corpus-auditor** — the is-this-x instrument as a CLI: any binary coverage matrix → V₂, curveball null, ΔV₂z, verdicts | [`tools/corpus-auditor/`](../tools/corpus-auditor/) |
| D2 | [#217](https://github.com/yubi-OS/yubiOS/pull/217) | **rsi-descent** — the single-action atom as a primitive; runtime-enforces the Lean-proved Δ≥0 invariant | [`tools/rsi-descent/`](../tools/rsi-descent/) |
| D3 | [#216](https://github.com/yubi-OS/yubiOS/pull/216) | **Gap D executed — canonical Python confirmed 2026-08-22**: 15-seed CI sweep of the canonical `.py` gives ΔJ ∈ [+0.40, +7.73] null-SD (median +3.22, mean +3.33 ± 2.01); **H1 (>2σ) clears in 11/15 seeds** — the lens effect is real but seed-fragile at the script's small optimizer budget (paper seed: +2.29; the earlier TS-port +3.82 sits in-range and its caveat is retired). Guard rejections ≤ 2/run. Sweep: [`data/gapD/seed-sweep-2026-08-22.json`](data/gapD/seed-sweep-2026-08-22.json), run [32599660158](https://github.com/yubi-OS/yubiOS/actions/runs/32599660158) | [`papers/scripts/gapD_lens_power.py`](scripts/gapD_lens_power.py), [`papers/data/gapD/`](data/gapD/) |
| D4 | [#213](https://github.com/yubi-OS/yubiOS/pull/213) | **boltzmann-collapse** — the exchangeability identity as a compute module: 2^d states → d+1 shells exactly; reproduces the compass T× = 0.0411428 to 7e-9 | [`tools/boltzmann-collapse/`](../tools/boltzmann-collapse/) |
| D5 | [#215](https://github.com/yubi-OS/yubiOS/pull/215) | **spectral-defocus** — diagonal heat-kernel decay (O(4) vs simulation) + atomicity diagnostic Aℓ(t) + vMF de-atomization. Honest negative: positional vMF jitter alone did NOT halve A₁; value-level smoothing is the open follow-up | [`tools/spectral-defocus/`](../tools/spectral-defocus/) |
| D6 | [#214](https://github.com/yubi-OS/yubiOS/pull/214) | **injective-mapping** — the honest "Excel sheet": 2286 items → unique keyed rows; measurement space has 176 classes (largest: 795 items at full coverage); injectivity ladder 176 → 252 → 318 → 2169 (slugs collide too: 117 duplicate labels!) → 2286 via row ordinal; qualia coordinates inadmissible per the membership condition | [`tools/injective-mapping/`](../tools/injective-mapping/) |
| D7 | (direct, 2026-08-24) | **corpus-sonometer** — the dBc level meter: effects as 20·log₁₀(\|Δ\|/σ_null) against the curveball vacuum's RMS fluctuation; level laws machine-checked (Lean §12), applied to the real corpus by CLAIM 8 (+24.3 dBc) | [`tools/corpus-sonometer/`](../tools/corpus-sonometer/) |

Gap D follow-ups — all executed (2026-08-22, [`data/gapD/followups-2026-08-22.json`](data/gapD/followups-2026-08-22.json), run [32601516238](https://github.com/yubi-OS/yubiOS/actions/runs/32601516238)): **(1) Budget**: at 6× evals, 3 of the 4 sub-bar seeds flip to supported — 14/15 seeds clear the bar at sufficient budget; the sweep misses were optimizer starvation. **(2) Amplitude**: H1 clears at every s ∈ {0.25…2}; failures are headroom, not seed identity (when identity_J ≈ 5 the identity chart has already captured the signal — seed 10 flips to +5.71 at s=0.25 where its identity_J drops to 1.09). **(3) Real corpus, first lens run** ([`scripts/gapD_real_corpus_lens.py`](scripts/gapD_real_corpus_lens.py)): at the identity chart the real corpus's L=3 share sits *below* its fixed-margin null (J = −1.51); the optimized lens reaches share 0.408 vs null 0.0345 ± 0.003 ⇒ ΔJ = **+126.1**. Selection-null control (optimize the lens for each of 10 null draws as target, identical selection pressure): control ΔJ median +5.1, max +25.5 — the real corpus is ~5× the strongest control, so the result is not an optimization artifact. The lens finds genuinely corpus-specific L=3 structure beyond fixed margins.


---

## The phonon reading (2026-09-01): sum rule, Klemens/Gaunt coupling, Fermi--Dirac occupancy

Acoustic/optical phonon physics placed against the program, same discipline as the 2026-08-25 photophysics bridge (exclusion-only verdicts, matched-parameter ablation as the gate). Full ranked table: [`refs/acoustic-optical-phonons-bridge-2026-09-01.md`](../refs/acoustic-optical-phonons-bridge-2026-09-01.md). Instrument: [`tools/phonon-dispersion/`](../tools/phonon-dispersion/) (`--selftest` in the `verify-tools` CI job). Identities: `CurvedCorpus.lean` §14. Equations: unified v2 tex, addendum "the phonon reading".

- **Identity (0 params):** the acoustic sum rule IS the ℓ=0 conservation law — the force-constant matrix annihilating uniform translation ↔ the defocus generator annihilating the constant function (`acoustic_sum_rule`, Lean §14). The Goldstone reading is **excluded** (no SSB, no gapless continuum on compact S²); so is any optical branch (one scalar field = one branch; the delayed/prompt split is a cut on it, not a second branch).
- **Identity (0 params):** Fermi–Dirac, not Bose–Einstein — at linear Φ(k)=εk, π_T(k) = Binomial(9, 1/(1+e^{ε/T})) exactly (machine-precision in the tool selftest; BE excluded: bounded k, no multiple occupancy). The measured-Φ residual against the linear reference is a free "interaction beyond the ideal two-state gas" readout, pending its own curveball null. Compass-only.
- **Structural win (+1 param replacing O(L²)):** the photophysics bridge's generic k_ISC inter-ℓ matrix is **excluded in favour of** Klemens-style Gaunt-structured coupling — cubic anharmonicity couples degrees only where the triangle rule |ℓ₁−ℓ₂| ≤ ℓ₃ ≤ ℓ₁+ℓ₂ + even parity hold (the S² analogue of q₁+q₂+q₃=0). Kernel-checked at L=3: 64 triads → 23 allowed, 41 forbidden (64% — not vacuous), cross-checked vs exact Wigner 3j and Simpson triple-Legendre. Energy side exact: the channel closes iff mass ratio > 3 (`klemens_condition`).
- **Native-spectrum identity (0 params):** the {0,1}^9 corpus's exact harmonic home is the Hamming graph H(9,2) — Laplacian 2j, multiplicity C(9,j), Krawtchouk ↔ Legendre; the sphere is its continuum idealization with a strictly harsher (quadratic vs linear) level penalty (`heat_exp_dominates_hamming`).
- **Kills:** LST / LO–TO **void** (no vector field, no polar mode, no ε(ω)); phonon transport **void** (diagonal generator, nothing propagates); Pennes ω **demoted to unidentifiable** — a uniform mass term that every admitted (ratio) statistic cancels; diatomic-gap statistic on the 795 saturated rows **excluded by construction** (margin-determined, curveball deflection ≡ 0, dBc → −∞).
- **Named prior art on standby:** if E_ℓ(t) is ever measured non-monotone, that is phonon hydrodynamics / second sound (the Gaunt-coupled non-normal generator is exactly what permits transient growth), not measurement error.

CI: `lean-check.yml` gains the `phonon-dispersion selftest` step; Lean §14 adds `acoustic_sum_rule`, `diatomic_disc`, `gap_closes_iff`, `gap_open_of_ne`, `klemens_condition`, the L=3 Gaunt counts (34/23/41) by `decide`, and `heat_exp_dominates_hamming` — all kernel-checked, no `sorry`.


---

## PART III — The Dimensional Focal Point of a Corpus Point Map (2026-11-10, Paper 4)

- **Paper:** `papers/dimensional-focal-point-2026-11-10.tex` (`papers/dimensional-focal-point-2026-11-10.pdf`), figures `papers/charts/dfp_fig1..3.png`, data `papers/data/dimensional-focal-point/`.
- **Lean 4 (25 theorems):** `papers/data/lean/FocalBounds.lean` + `papers/data/lean/focal-scope.json` (dedup and distinct-count ceiling `distinctCount_map_le`, prefix-count monotonicity/doubling/power/length bounds, `focalDim` soundness/maximality, and one-step refreeze idempotence `focalDim_refreeze_fixed` + contraction stabilization `recode_stabilizes`).
- **Headline findings on Map #598 (`N = 3,232`, `d = 9`):**
  1. Exact input recovery from stored per-axis signed margins reproduces `frame_id` `77360296af046f8d` and `run_fingerprint` `fba40c7b482d4e2e`.
  2. Prefix bit ladder `2, 4, 8, 16, 30, 49, 79, 95, 116` selects focal dimension `n* = 7` at `tau = 0.5` bits (stable across `(0.055, 0.722)` bits), with `focal-point-corpus-specific` separation against the two-seed curveball null.
  3. Stereographic lift scale `s` is the Möbius lens power on `S^2`; RMS rescale recovers `>= 95%` of optimal packing count `N(0.095)` across globes.
