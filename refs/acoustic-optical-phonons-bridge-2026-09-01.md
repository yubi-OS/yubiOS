# Acoustic/optical phonons → curved-corpus program — bridge, 2026-09-01

**Companion to:** [`refs/twenty-two-links-synthesis-and-photophysics-bridge-2026-08-25.md`](twenty-two-links-synthesis-and-photophysics-bridge-2026-08-25.md)
(the photophysics bridge this extends), [`tools/phonon-dispersion/`](../tools/phonon-dispersion/)
(the instrument), and `CurvedCorpus.lean` §14 (the kernel-checked identities).

**Scope:** three `general / smart` subagents in parallel — (1) source-verified
canonical phonon equations, (2) prior art for phonons on spheres, graphs, and
non-crystalline structures, (3) comparative mapping onto the program's
machinery. Ingested alongside the papers/ corpus (`is-this-x`,
`learned-latent-curves`, `curved-corpus-unified` v1/v2), the papers README,
and the 2026-08-25 photophysics mapping.

**Discipline:** exclusion-only verdicts (`identity / not-excluded /
not-tested / excluded / void`); no import admitted without a demonstrated
non-degenerate null; parameter parsimony is the binding gate
(matched-parameter ablation δ = +0.7373 / +0.5197, "sphere wins at fewer
parameters"). `T_×`, `π_T`, `τ_int` are designed-chain (compass) properties,
never corpus claims.

---

## 0. Verified canonical forms (do not re-derive)

**1D monatomic chain** — `ω(q) = 2√(C/m)|sin(qa/2)|`; acoustic limit
`ω ≈ a√(C/m)·|q| = v_s|q|`; `v_g = 0` at the zone boundary.
Sources: Wikipedia Phonon; UCL/Binghamton solid-state notes.

**1D diatomic chain** (masses m₁, m₂, spring C, cell period a):

```
ω²±(q) = C(1/m₁ + 1/m₂) ± C·√( (1/m₁ + 1/m₂)² − 4 sin²(qa/2)/(m₁m₂) )
ω²₋(0) = 0 (acoustic, gapless)      ω²₊(0) = 2C(1/m₁ + 1/m₂) (optical)
zone boundary:  ω²₊ = 2C/m_light,  ω²₋ = 2C/m_heavy
gap Δω = √(2C/m_light) − √(2C/m_heavy);  closes iff m₁ = m₂
```

The zone-boundary collapse runs through `(x+y)² − 4xy = (x−y)²` — Lean §14
`diatomic_disc`, `gap_closes_iff`. Sources: Wikipedia Phonon (Misra); Tong
*Solid State Physics* §4; TU Graz; TU Delft.

**Goldstone statement** — acoustic phonons are the Nambu–Goldstone modes of
spontaneously broken translational symmetry; `ω(q→0) = 0` is protected by the
acoustic sum rule (the force-constant matrix annihilates uniform translation).
Counting for broken spacetime symmetries is NOT one-to-one with broken
generators. Sources: Wikipedia Goldstone boson; arXiv:2502.04221; PSS-B
10.1002/pssb.201900443.

**Occupation / heat capacity** — Bose–Einstein `n(ω,T) = 1/(e^{ħω/kT} − 1)`
(μ = 0); Debye `g(ω) ∝ ω²`, `C_V = (12π⁴/5)Nk(T/T_D)³` at low T (acoustic
branch, linear dispersion); Einstein single-frequency `C_V` with exponential
freeze-out (optical branch, flat dispersion). Sources: Wikipedia BE
statistics / Debye model / Einstein solid.

**LO–TO / Lyddane–Sachs–Teller** — `ω_LO²/ω_TO² = ε(0)/ε(∞)`; splitting driven
by the macroscopic depolarizing field of the longitudinal polar mode; LO = zero
of ε(ω), TO = pole. Sources: Wikipedia LST; LST 1941, PhysRev 59.673.

**Klemens channel** — zone-center optical phonon decays by cubic anharmonicity
into two counter-propagating acoustic phonons, `ħω_opt = 2ħω_ac`, `q + (−q) = 0`;
forbidden when `ω_opt > 2ω_ac,max`. Source: Klemens, *Phys. Rev.* 148, 845 (1966).

**Lamb modes** — free elastic sphere: torsional T(n,ℓ) and spheroidal S(n,ℓ),
frequencies `ω = ζ(n,ℓ)·v/R`; the ℓ(ℓ+1) Laplace–Beltrami eigenvalue enters
the secular determinant explicitly (`T₁₃ ∝ ℓ(ℓ+1)`); Duval selection rules —
only SPH ℓ=0 (breathing) and ℓ=2 (quadrupolar) are Raman active, a low-ℓ
visibility filter. Sources: Lamb 1882; Duval PRB 46, 5795 (1992);
Saviot–Murray cond-mat/0506353.

**Dynamical matrix = mass-weighted Laplacian** — for scalar (one-DOF-per-site)
harmonic networks, `M ü = −L u` with `L = D − A` the weighted graph Laplacian;
the vibrational spectrum IS its spectrum. Vector displacements need a block
("bundle") Laplacian — the literal identity is scalar-case only. Sources:
CASTEP docs; SciPost 15.2.069; arXiv:2511.03580.

**Hamming graph H(d,2) = Q_d** — the {0,1}^d corpus's native harmonic home:
Laplacian eigenvalues `2j` at Hamming weight j, multiplicity `C(d,j)`,
eigenvectors the characters `(−1)^{r·a}`, Krawtchouk polynomials playing
Legendre's role (Gelfand pair over (Z/2Z)^d as S² is over SO(3)). Heat kernel
decays `e^{−2jt}` — **linear in level**, vs S²'s quadratic `e^{−ℓ(ℓ+1)t}`.
Sources: Stanford CS359G lec. 6; Hamming-scheme P-matrix references.

**Gaunt / triple-Y selection rules** — `∫Y_{ℓ₁m₁}Y_{ℓ₂m₂}Y_{ℓ₃m₃}dΩ ≠ 0`
requires the triangle rule `|ℓ₁−ℓ₂| ≤ ℓ₃ ≤ ℓ₁+ℓ₂`, even parity
`ℓ₁+ℓ₂+ℓ₃`, and `m₁+m₂+m₃ = 0` — the rotational analogue of phonon momentum
conservation `q₁+q₂+q₃ = 0`. Sources: MathWorld Gaunt coefficient; SymPy
`wigner.py`.

---

## 1. Ranked verdicts

| # | Import | Verdict | New params | Where it landed |
|---|---|---|---|---|
| 1 | **Klemens decay → Gaunt/triangle-rule inter-ℓ coupling.** Cubic anharmonicity on S² couples degrees only through Gaunt coefficients; the triangle+parity rules are DERIVED sparsity, so the 2026-08-25 generic `k_ISC · 1[ℓ′>ℓ]` matrix (O(L²) free entries) is **excluded in favour of** the Gaunt-structured coupling with ONE amplitude κ | **not-tested** (structure verified; fit not run) | +1 (κ) vs O(L²) | Counts kernel-checked at L=3: 64 triads → 23 allowed, **41 forbidden (64%)** — NOT vacuous at the program's truncation, parity does the heavier culling (Lean §14; tool selftest cross-checks vs exact Wigner 3j and Simpson triple-Legendre) |
| 2 | **Fermi–Dirac, not Bose–Einstein.** The 9 primitives are two-state sites: at linear Φ(k)=εk, `π_T(k) = Binomial(9,p)`, `p = 1/(1+e^{ε/T})` — the FD occupancy, exactly | **identity** (linear-Φ sub-case) | 0 | Tool selftest verifies to machine precision. The residual between measured Φ(k) and the linear reference = parameter-free "interaction beyond the ideal two-state gas" readout — **not-tested**, needs its own curveball null before admission |
| 3 | π_T ↔ Bose–Einstein `1/(e^{ħω/kT}−1)` | **excluded** as identity (bounded k, no multiple occupancy, explicit C(9,k) degeneracy); homology only | — | documented here |
| 4 | **ℓ=0 conservation ↔ acoustic sum rule** (Markov mass conservation; force-constant matrix annihilates uniform translation) | **identity** | 0 | Lean §14 `acoustic_sum_rule`; tool checks the Hamming twin exactly |
| 5 | ℓ=0 ↔ Goldstone mode / acoustic branch | **excluded** — no SSB, no order parameter, no gapless continuum on compact S²; the spectrum is one conserved mode + gapped modes | — | documented here |
| 6 | **Pennes ω as a phonon gap / mass term.** Formally gaps every mode by ω; but every currently-admitted statistic is a ratio, invariant under `E → e^{−ωt}E` | analogy **not-excluded**; parameter **void — unidentifiable** in the current statistic set. Supersedes the 2026-08-25 "highest-value extension" ranking of ω: powering it requires first admitting an unnormalized total-mass observable (which then needs its own null) | +1, unidentifiable | documented here; ten-minute invariance audit is the gate |
| 7 | **Diatomic band gap via two populations.** Two sublattices = two labels per site (partial exchangeability, mild D3 weakening); the inter-population coupling is what opens the gap. BUT the natural split (795 all-ones rows vs rest) is **margin-determined**: curveball preserves it exactly, deflection ≡ 0, dBc = −∞ | saturated-row version **excluded by construction**; pattern-defined split on k<9 rows **not-tested** | +1 (size ratio) | documented here; margin-only-classifier baseline required first |
| 8 | Two-branch (acoustic/optical) reading of {2ℓ(ℓ+1)} | **excluded** as measured — the delayed/prompt 0.9774/0.2059 split is a cut on ONE branch; a second branch needs a second population per site (§7) | — | documented here |
| 9 | λ(ℓ) ↔ ω²(q); wave dynamics `d²E/dt² = −Λ²E` | **void** on the historical corpus (absorbing, monotone — oscillation is provably impossible); **not-excluded** on the compass as underdamped Langevin/HMC (τ_int = 5.486 is the number to beat) | +1 (friction) | documented here; designed-chain wall applies |
| 10 | Debye vs Einstein heat-capacity split ↔ low-ℓ/high-ℓ | **homology only** — same freeze-out arithmetic, no new measurable | 0 | documented here |
| 11 | LO–TO / LST ↔ χ(T) or lens \|φ′\|² | **void** — no vector field, no polar mode, no ε(ω); χ(T) is thermodynamic (`Var_π(k)/T`), not a frequency response; \|φ′\|² is a Jacobian, not a response kernel | — | documented here |
| 12 | Thermal conductivity κ = (1/3)ΣC v_g²τ, group velocity | **void** — ℓ indexes a global basis, nothing propagates, the generator is diagonal; the honest transport object is the compass ladder diffusivity `D_k ≈ Var_π(k)/(2τ_int)` (compass-only) | — | documented here |
| 13 | **Second sound / phonon hydrodynamics** | **not-excluded** as named prior art: if E_ℓ(t) is ever measured non-monotone, wave-like transport in a scattering-dominated regime is the canonical physics, not measurement error. Pairs with the Klemens-coupled (non-normal) generator, which is exactly what permits transient growth | 0 (a naming, not a fit) | documented here |
| 14 | **Hamming H(d,2) as the corpus's native spectrum** | **identity** — the {0,1}^9 corpus's exact harmonic decomposition is Krawtchouk/levels-j with Laplacian 2j; S² is the continuum idealization. The linear-vs-quadratic level penalty (2j vs 2ℓ(ℓ+1)) is THE quantitative distinction between the two homes | 0 | Lean §14 `heat_exp_dominates_hamming`; tool checks H(4,2) exactly |
| 15 | Lamb/Duval low-ℓ Raman visibility filter (only ℓ=0, 2 observable) | **homology** with the program's low-ℓ spectral-mass gates; flags ℓ=1 as the structurally near-degenerate degree (near-rigid translation) | 0 | documented here |

**Highest-value single import: #1.** The only one that *cuts* parameters while
adding structure — a derived sparsity pattern replacing a fitted matrix. It
retro-corrects the photophysics bridge: the `k_ISC` proposal survives, but its
coupling matrix is no longer free.

**Best free win: #2** — fixes the occupation-statistics analogy (FD, not BE)
at zero cost and hands back a parameter-free residual readout of the Φ ladder.

---

## 2. What phonons retro-correct in the 2026-08-25 photophysics bridge

1. **k_ISC (item 6 there): superseded in form.** Inter-ℓ transfer stays a live
   1-parameter extension, but the coupling must be Gaunt-structured (triangle +
   parity + m-sum), not `1[ℓ′>ℓ]`. Same falsifiable prediction (transient
   growth under defocus, testable against curveball); strictly fewer degrees of
   freedom. Klemens is also the better-named physics: high-ℓ ("optical-like")
   structure decaying into low-ℓ pairs, energy- and momentum-conserving.
2. **Pennes ω (item 3 there): demoted.** Still the unique mechanism that breaks
   ℓ=0 conservation, but as a parameter it is unidentifiable while the admitted
   statistic set is ratio-only. The phonon reading names it correctly — a mass
   term / substrate-pinning gap — and names its gate: admit an unnormalized
   observable first.
3. **TTA exclusion (item 11 there): reinforced.** The quadratic
   density–density term phonons would call four-phonon/TTA-like remains
   excluded by D3 exchangeability; the Gaunt-coupled generator is linear in E
   and does NOT breach it (coupling modes ≠ coupling items).

---

## 3. Standing warnings

1. **Parameter gate.** κ, friction, size-ratio must each clear the
   matched-parameter ablation; `hyperspherical-harmonic-curve` "When the
   Ablation Fails" applies unchanged. Phonon physics is parameter-rich; that is
   the structural mismatch, and why #1 (structure-not-parameters) ranks first.
2. **Curveball null per statistic — margin trap.** Any statistic that is a
   function of the fixed margins has deflection exactly 0 (dBc → −∞). The 795
   all-ones rows are margin-determined. Check margin-dependence BEFORE
   computing, not after.
3. **Designed-chain wall.** Everything touching π_T, T_×, τ_int, C(T), χ(T)
   is a compass property. The historical corpus is the T→0 absorbing limit;
   no phonon vocabulary may re-assert what the is-this-x §7 retraction forbids.
4. **Truncation ceiling.** L=3 gives four degrees. The Gaunt structure is
   checked to be non-vacuous there (41/64 forbidden), but any
   dispersion-*shape* claim from four eigenvalues is over-reading.
5. **Normalization-invariance trap.** Ratio statistics annihilate uniform mass
   terms (Pennes ω is the live example). Pair any global-rescaling extension
   with an unnormalized observable or void it.
6. **Exclusion-only language.** Nothing above is "compatible with".

---

## 4. Where the equations landed

- **Equations:** unified paper v2 addendum "the phonon reading"
  (`papers/curved-corpus-unified-2026-08-22-v2.tex`), papers README section.
- **Tools:** [`tools/phonon-dispersion/`](../tools/phonon-dispersion/) —
  diatomic two-branch dispersion, Klemens threshold, exact Hamming Laplacian
  spectra, Gaunt counts (three independent routes), FD/Binomial identity;
  `--selftest` wired into the `verify-tools` CI job.
- **Lean CI:** `CurvedCorpus.lean` §14 — `acoustic_sum_rule`,
  `diatomic_disc`, `gap_closes_iff`, `gap_open_of_ne`, `klemens_condition`,
  kernel-checked Gaunt counts at L=3 (34/23/41), `heat_exp_dominates_hamming`.

## 5. Open follow-ups

1. Fit the Gaunt-coupled defocus (`∂E/∂t = −ΛE + κ(E⋆E)` truncated at L=3)
   on the 2286×9 corpus; run κ against its own curveball null; check the
   transient-growth (non-monotone E_ℓ) prediction — if seen, item 13's second
   sound is the named frame.
2. Fit Φ(k) = εk and admit (or exclude) the FD-residual statistic behind a
   curveball null.
3. The ten-minute Pennes-ω identifiability audit: enumerate admitted
   statistics, mark each ratio/non-ratio.
4. Pattern-defined two-population split on k<9 rows (vMF M₄ assignment) with
   margin-only-classifier baseline, then the gap statistic vs curveball.
5. Reconcile compass sweep-step units with defocus time units (carried over
   from the photophysics bridge — still the cheap prerequisite to every
   FCS-flavoured claim).

---

## 6. Results (2026-09-01, executed on CI)

All five follow-ups executed by [`papers/scripts/phonon_followups.py`](../papers/scripts/phonon_followups.py)
(workflow `phonon-followups.yml`, run [33562751184](https://github.com/yubi-OS/yubiOS/actions/runs/33562751184),
green; full numbers in [`papers/data/phonons/followups-2026-09-01.json`](../papers/data/phonons/followups-2026-09-01.json)).
Four of five land as disciplined negatives; the discipline is the result.

1. **Pennes-omega audit: VOID confirmed.** Every admitted spectrum statistic
   (Parseval shares, low-l mass, high-degree mass, gapD J) is exactly invariant
   under `E -> e^{-omega t}E`. The only omega-sensitive observables are
   atomicity A_l (whose admission already FAILED 2026-08-22, z=+1.59) and
   unnormalized total energy (not admitted). Item 6 of the ranked table closes:
   omega stays void until an unnormalized observable is admitted behind its
   own null.
2. **FD-residual: corpus-side EXCLUDED BY CONSTRUCTION, verified** -- 5
   curveball draws reproduce the k-histogram exactly (margin-determined,
   deflection == 0). Compass-side (designed-chain descriptive): linear-Phi fit
   eps = -0.1013; TV(pi_T measured vs FD/Binomial) = 0.0525 at T = 0.05,
   peaking near T_x. The FD/Binomial identity itself verified to 1e-10 inside
   the run.
3. **Unit reconciliation: done, and the FCS gate FAILS.** Collapsed shell-kernel
   at T = 0.05: detailed balance exact, spectral gap 0.1456/step,
   tau_rel = 0.763 sweeps. Under the ell*-matching convention (ell* = 2) the
   gate ratio tau_T/tau_D = tau_int/tau_rel = 7.19 >> 1. The two-channel FCS
   factorization moves from not-tested to **NOT-IDENTIFIABLE at T = 0.05**:
   the dark-state coordinate relaxes 7x SLOWER than the chain's own spectral
   relaxation, the opposite of what the triplet factorization needs. Every
   FCS-flavoured claim in the photophysics bridge inherits this.
4. **Gaunt-coupled defocus: recorded NEGATIVE at L = 3.** Exact Gaunt tensor
   (GL(24) x uniform(48) quadrature; orthonormality 6e-15; forbidden triads
   9e-16 -- the triangle+parity sparsity holds to machine precision). Matched
   kappa-selection over {0.5, 1, 2} against 40 curveball draws (20N trades):
   S_real = 0.000, z = -0.42, far below the +15.6 dBc floor. The coupling's
   transient growth is mechanically real (max E_tot 14.6% above the diagonal
   flow -- the non-normal prediction the diagonal model forbids) but it is
   NOT corpus-specific. The parsimony-side exclusion of the generic k_ISC
   matrix in favour of Gaunt structure stands; the data-side extension does
   not earn an ablation at this truncation and budget.
5. **Two-population split: stays NOT-TESTED -- the margin trap fired.** The
   margin-only-classifier baseline predicts the spherical 2-means assignment
   from k alone at 98.7% accuracy: the S^2 embedding's cluster structure IS
   margin information (PC1 tracks coverage), so the statistic never had a
   clean null (z = -4.87, moot). A margin-clean assignment rule (residual
   pattern after projecting out k) is the prerequisite, exactly as warning 2
   predicted.

Net: the phonon bridge's two identities (sum rule, FD/Binomial) survive
execution; the three extensions (omega, kappa, two-population) are now
recorded negatives or blocked-by-construction rather than open proposals.
No new parameter enters the program.

### 6.1 Stage 5b (2026-09-01, same day): the margin-clean rule -- two-population EXCLUDED, with a significant anti-signal

Run [33563556110](https://github.com/yubi-OS/yubiOS/actions/runs/33563556110): projecting
centered-k out of the z-scored columns before the PCA/stereographic embed drops the
margin-only-classifier accuracy from 98.7% to 72.1% -- the assignment is margin-clean.
On the clean statistic the real corpus sits at G = 0.4904 vs null 0.5344 +/- 0.0055:
**z = -7.97** (|z| corresponds to +18.0 dBc, above the +15.6 dBc floor in magnitude,
negative in sign). The real corpus is significantly LESS two-population-clustered than
its own fixed-margin medium.

Verdicts:
- Two-sublattice (diatomic gap) extension: **EXCLUDED** -- there is no pattern-defined
  two-population structure beyond fixed margins to hang a second branch on.
- The anti-signal itself: **not-excluded as a new one-population homogeneity readout** --
  the corpus's k<9 pattern structure is more homogeneous than margins predict, which
  independently corroborates the bridge's "one scalar field, one branch, no optical
  mode" verdict (items 5/8 of the ranked table) with a deflection rather than an
  absence. If this readout is ever wanted as an admitted statistic it needs
  pre-registration and its own matched-parameter accounting; it is recorded here as
  a finding of the exclusion test, not admitted.

This closes the last open verdict of the phonon bridge: all three proposed extensions
(omega, kappa, two-population) are now excluded/void on the recorded evidence, both
identities stand, and the exclusion machinery itself produced one new corroborating
deflection.

## 2026-09-18 drift check (wayfinder round 8, cycle 96)

the phonon bridge record: its recorded negatives (Pennes VOID, FCS FAIL, Gaunt negative) are preserved intact this round; note additive.
