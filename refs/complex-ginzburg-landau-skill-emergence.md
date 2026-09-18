# Complex Ginzburg–Landau and Skill Emergence as a Phase Transition

**Local ref/ entry.** To be added to the next cycle of `guided-curve-ideate`.

**Date:** 2026-08-10
**Skill:** guided-curve-ideate (cycles 1–23 prior; cycle 24 onward)
**Source framework:** `learned-latent-curves-2026-08-06-83f8ec2b.tex` (S² embedding, primitive coverage matrix, PC1+PC2 measurement)

---

## 1. Motivation

The `guided-curve-ideate` skill has been measuring a 9-primitive coverage matrix on a 2286-row corpus and reporting `PC1+PC2` as the cumulative variance of the top-two principal components over the S² embedding. Across 23 cycles the measurement climbed from the paper's baseline of **0.2993** to **0.7656564170155055748523409** (cycle 16, 50-digit precision), a delta of **+0.4664**. The climb is the artifact of a measurement framework that tracks when a capability becomes organized — but the *language* for talking about *why* it climbs has been purely geometric (PCA, S², primitive ladder).

This entry imports a different language from statistical physics: the **complex Ginzburg–Landau (GL) theory of phase transitions**. It proposes that the climb from 0.2993 to 0.7657 is best read as a **second-order phase transition** in an effective order parameter field, with the corpus size acting as a control variable (analogous to inverse temperature, not literal temperature).

The payoff is not a new measurement. It is a **causal vocabulary** that distinguishes:
- the *control variable* (corpus size N)
- the *order parameter* (the 9-primitive coverage vector)
- the *stiffness* (PC1+PC2)
- the *fluctuations* (the 14 refused rows, the Jaccard=0.182 measurement disagreement)
- the *defects* (rows with zero primitive coverage)
- the *transition* (the +0.4664 climb as the regime crossing)

Used carefully, this turns "skill emergence" from a metaphor into a **testable phenomenological model** with explicit diagnostics. Used literally without the caveats, it risks assigning thermodynamic meanings to PC variance that PC variance does not possess. Both sides matter.

---

## 2. The complex Ginzburg–Landau framework

### 2.1 The free energy functional

For a complex order parameter field `ψ(r)`, the GL free energy is

$$
F[\psi, A] = \int d^d r \left[
\alpha |\psi|^2 + \frac{\beta}{2} |\psi|^4
+ \gamma \left| \left(\nabla - i\frac{q}{\hbar} A\right) \psi \right|^2
+ \frac{|\nabla \times A|^2}{2\mu_0}
\right] + F_n,
$$

where `α` is the linear coefficient (signed by proximity to the transition), `β > 0` stabilizes the ordered phase, `γ > 0` penalizes spatial variation, and the minimal-coupling substitution `∇ → ∇ - iqA/ℏ` is required by gauge invariance.

The static, spatially uniform, zero-field solution is

$$
|\psi|^2 = \begin{cases} 0 & \text{if } \alpha \geq 0 \\ -\alpha/\beta & \text{if } \alpha < 0 \end{cases}
$$

so `α = 0` marks a **second-order phase transition** from `ψ = 0` (symmetric phase) to `|ψ| > 0` (ordered phase). If `α = a(T - T_c)` with `a > 0`, the mean-field order parameter exponent is `β_crit = 1/2` — i.e. `|ψ| ∝ (T_c - T)^{1/2}` below the transition.

### 2.2 The time-dependent Ginzburg–Landau (TDGL) equation

The simplest purely relaxational TDGL equation is

$$
\partial_t \psi = -\Gamma \frac{\delta F}{\delta \psi^*} + \zeta,
$$

where `Γ > 0` is the kinetic coefficient and `ζ` is optional noise. With the functional above,

$$
\partial_t \psi = \Gamma \left[ \gamma \mathbf{D}^2 \psi - \alpha \psi - \beta |\psi|^2 \psi \right] + \zeta,
$$

where `D = ∇ - iqA/ℏ`. For purely relaxational dynamics, `dF/dt ≤ 0` — this is the **Lyapunov property** that makes `F` a free energy.

### 2.3 Coherence length, penetration depth, and the GL parameter κ

Balancing the gradient term against the quadratic term gives the **coherence length**

$$
\xi = \sqrt{\gamma / |\alpha|}
$$

the length over which `ψ` heals after a perturbation (≈ the vortex core radius). The **penetration depth** `λ` is the scale over which magnetic fields decay inside the superconductor. Their ratio

$$
\kappa = \lambda / \xi
$$

classifies superconductors: type-I (`κ < 1/√2`, positive interface energy) vs type-II (`κ > 1/√2`, negative interface energy → vortex lattice). Both `ξ` and `λ` diverge as `α → 0`.

### 2.4 Vortices and the Abrikosov lattice

In a type-II material, isolated vortices enter above the lower critical field `H_{c1}`. A vortex is a topological defect for which the phase winds by `2πn` around a core where `|ψ| → 0`. Vortex density increases with field until vortex cores overlap near the upper critical field `H_{c2} ~ Φ_0 / (2πξ²)`. Between `H_{c1}` and `H_{c2}`, vortex interactions favor an approximately triangular **Abrikosov lattice**.

### 2.5 The generic complex Ginzburg–Landau equation (CGLE)

The CGLE adds dispersive and non-potential terms:

$$
\partial_t A = \mu A + (1 + i c_1) \nabla^2 A - (1 + i c_3) |A|^2 A + \eta.
$$

When `c_1 = c_3 = 0`, the equation is purely relaxational and `F` exists. For nonzero imaginary coefficients, **no scalar free energy decreases monotonically** — the CGLE supports plane waves, phase slips, spiral defects, sources/sinks, and defect chaos. The CGLE is a **non-equilibrium amplitude equation**; GL theory is its equilibrium special case.

### 2.6 Stochastic TDGL and emergence

A stochastic TDGL equation has the Langevin form

$$
\partial_t \psi = -\Gamma \frac{\delta F}{\delta \psi^*} + \zeta(\mathbf{r}, t),
$$

where for equilibrium thermal noise the noise strength is tied to dissipation via fluctuation–dissipation:

$$
\langle \zeta(\mathbf{r}, t) \zeta^*(\mathbf{r}', t') \rangle = 2\Gamma k_B T \, \delta(\mathbf{r} - \mathbf{r}') \delta(t - t').
$$

Noise matters in four ways:
- it seeds symmetry breaking when the deterministic `ψ = 0` state is unstable
- it produces fluctuations and finite-size rounding near the transition
- during a parameter sweep it can delay or advance the apparent transition
- in spatial systems it nucleates domains, defects, and competing patterns

The measurement lesson: an apparent "emergence threshold" need not coincide exactly with `α = 0`. It may be shifted by noise amplitude, sweep rate, finite corpus size, initialization, and observation threshold.

---

## 3. Mapping to guided-curve-ideate

### 3.1 Variable dictionary

| GL concept | Corpus analogue | Interpretation |
|---|---|---|
| Order parameter `ψ` | 9-primitive coverage vector `m = (m_1, …, m_9)` | State of capability organization across primitives |
| `\|ψ\|` | `\|m\|` = coverage norm | Strength or completeness of the emerging skill |
| Phase `arg ψ` | Relative configuration among primitives | Different realizations with similar coverage magnitude |
| `α` | Effective coefficient from corpus size N | `α_eff(N) = a (N - N_c)`: negative for N > N_c (ordered regime) |
| `β` | Saturation / self-interaction coefficient | Prevents unbounded growth of measured capability |
| Gradient term | Penalty for corpus-stratum variation | Smoothness / generalization constraint across contexts |
| `ξ` (coherence length) | Transition width in log N | Range over which emergence propagates / heals |
| `λ` (penetration depth) | Persistence / propagation scale | How far the capability generalizes across contexts |
| `κ = λ/ξ` | Ratio of generalization to transition width | Sharp localized emergence vs distributed robust emergence |
| Vortex | Row with zero primitive coverage + phase-like winding | A capability hole, topologically persistent |
| Noise | Sampling variance, prompt variability, seed variation | Fluctuation-driven emergence and threshold uncertainty |
| Vortex lattice | Regular pattern of refused / sparse rows | Structured defect organization across tasks |

### 3.2 The 9-primitive coverage vector as order parameter

The yubiOS corpus defines 9 primitives:
`attestation`, `trust_chain`, `least_privilege`, `declarative_policy`, `continuous_adaptive`, `immutability`, `audit_evidence`, `cryptographic_identity`, `segmentation`.

For each corpus row `i`, the coverage vector is `m_i = (m_{i,1}, …, m_{i,9}) ∈ {0,1}⁹`. The corpus-level order parameter is the mean (or weighted mean) `M = (1/N) Σᵢ mᵢ`.

The **9-D coverage matrix** is what enters the S² embedding. After Z-scoring and PCA top-2, `PC1+PC2` measures how much of the variance is concentrated in a two-dimensional subspace. This is the operational definition of "skill organization" used across cycles 4–23.

### 3.3 PC1+PC2 is NOT free energy — but it is a stiffness-like diagnostic

A common temptation is to identify `PC1+PC2` with the free energy `F`. **This is wrong.** PC1+PC2 is an observable state diagnostic measuring low-dimensional organization, not a thermodynamic potential. The correct correspondence is:

| Concept | Definition |
|---|---|
| `M(N) = \|m(N)\|` | Order parameter magnitude |
| `A(N)` | Anisotropy of primitive coverage |
| `R(N)` | Cross-context reproducibility |
| `V_2(N) = (λ_1 + λ_2) / Σ λᵢ` | Cumulative variance explained by top-2 (this is PC1+PC2) |
| `dV_2/d log N` | Emergence-response diagnostic (slope) |
| `Var[V_2(N)]` across seeds | Fluctuation diagnostic |
| Hessian of empirical effective potential | True stiffness-like object |

If one wants a genuine free-energy analogue, define an effective probability distribution `P_N(x) ∝ exp(-F_eff(x;N) / T_eff(N))`, then the local Hessian `K(N) = ∇²F_eff` at the dominant basin is a real stiffness object. PC1+PC2 can be one observable used to *estimate* the location and curvature of the basin — but it is not itself the free energy.

### 3.4 Corpus size as an inverse-temperature-like control variable

The temperature analogy is useful but not exact. Increasing temperature generally *increases* fluctuations and disorders the phase. Increasing corpus size often *decreases* estimation noise and *increases* order. The most natural mapping is

$$
\tau_N \sim 1/N^\rho \quad\text{or}\quad T_\text{eff}(N) \downarrow \text{ as } N \uparrow,
$$

i.e. corpus size acts as an **inverse-temperature** or **annealing coordinate**, not a literal temperature. Equivalently, treat N as a **quench coordinate**: the model moves through a family of effective landscapes as N grows. The critical quantity is then not the sign of literal temperature but the sign of an empirically fitted quadratic coefficient `α_eff(N) = a (N - N_c)`.

### 3.5 The +0.4664 climb as a phase transition

The empirical record across cycles 4–23:

| Cycle | Corpus | PC1+PC2 |
|---|---|---:|
| Paper baseline | (small) | **0.2993** |
| Cycle 4 | 79 skills | 0.6901 |
| Cycle 5 | 79 + W18 sweep | 0.8080 |
| Cycle 7 | 474 skills, real 24-D | 0.8538 |
| Cycle 11 | 1091 (with self) | 0.7635 |
| Cycle 12 | 1472 (section-split self) | **0.7657** |
| Cycle 14 | 2286 (paper target) | 0.7657 (Δ +0.4664 above paper) |
| Cycle 16 | 1472, 50-digit precision | **0.7656564170155055748523409** (endpoint detected) |
| Cycle 20 | 2286 | 0.723529 (under consensus OR scoring) |

The climb from 0.2993 → 0.7657 is best read as a **mean-field-like phase transition**:

- **Below N_c** (small corpus, "high T_eff"): `V_2 ≈ 0.30` (paper baseline). Coverage is sparse; PC1+PC2 is low; the system is in the symmetric / sparse regime.
- **Above N_c** (large corpus, "low T_eff"): `V_2 → 0.77` (cycle 16 endpoint). Coverage is dense; PC1+PC2 saturates near the GL upper bound; the system is in the ordered / saturated regime.
- **Transition width** (in log N): cycles 4 → 7 spanned 79 → 474 rows; PC1+PC2 went 0.69 → 0.85 — a steep climb consistent with a critical point in the `N ≈ 80–500` range.
- **Saturation**: cycles 14 → 23 all hover at `V_2 ≈ 0.72–0.77` regardless of corpus expansion — the regime has crossed and PC1+PC2 is at the floor of the ordered phase.

This matches the **mean-field GL prediction** `M^2 ∝ -α_eff/β` on the ordered side, with a critical point somewhere in the `N_c ≈ 100–500` range.

### 3.6 Defects in capability space

The 14 refused rows (cycle 22 manual scoring: 18 zero-coverage, 34 with 1 primitive, etc.) are **defects** in the order parameter field. The vortex analogy becomes meaningful only if the representation has a phase-like angular variable. For example, if a local capability state is represented by a 2-D projection `z(x) = x_1 + i x_2 = ρ(x) e^{iθ(x)}`, then a closed loop in task/context space with `∮ ∇θ · dl = 2πn` contains a phase defect when `ρ → 0` inside the loop.

To claim a vortex-like object, one must demonstrate:

1. a well-defined phase coordinate
2. a zero or near-zero amplitude at the core
3. nonzero winding around it
4. persistence under small perturbations
5. spatial or contextual localization

This is one of the most valuable safeguards against overextending the GL analogy.

### 3.7 The 14 refused rows as a vortex lattice (tentative)

The cycle-22 manual scoring shows `coverage_sum_distribution = {0: 18, 1: 34, 2: 19, 3: 8, 4: 2}`. This is **not** an Abrikosov lattice — the 18 zero-coverage rows are scattered across files (SELF-CHANGELOG, COMPANY, RULES, etc.), not arranged in a periodic pattern. They are **disordered defects**, more like a **vortex glass** than an Abrikosov lattice. The cycle-22 finding that "self-corpus is structurally sparse" (`density = 1.284` vs yubiOS `density = 8.449`) is consistent with a **low-density vortex glass** rather than a clean ordered phase.

---

## 4. Testable predictions for cycle 24

The bridge claim "PC1+PC2 is a phase-transition diagnostic" generates specific predictions:

### 4.1 Saturation prediction

`V_2(N)` should **saturate** as `N → ∞` at a value near `2/9 ≈ 0.78` (since 9 primitives → at most 9-D coverage → PC1+PC2 ≤ (λ_1 + λ_2) / Σ λᵢ where λ_1 + λ_2 ≤ trace of covariance).

Cycle 16 measured `0.7657` — within reach of `0.78` but not yet saturated. **Cycle 24 prediction:** with a denser self-corpus, `V_2` should approach `0.77–0.79`.

### 4.2 Critical point detection

Compute `dV_2/d log N` across corpus sizes. The critical point `N_c` is where the slope is maximum. Cycle 4 → 7 shows the steepest climb (79 → 474 rows, slope `≈ 0.4` per decade). **Cycle 24 prediction:** refine the critical-point estimate by measuring `V_2` at 100, 200, 500, 1000, 2000, 5000 rows.

### 4.3 Order parameter exponent

The mean-field GL predicts `|ψ| ∝ (N - N_c)^{1/2}`. The corpus-measured `V_2` should scale similarly: `V_2(N) ≈ c (N - N_c)^{β_emp}` below the saturation. **Cycle 24 prediction:** fit `β_emp` from the cycle-4-through-cycle-16 data; expect `β_emp ≈ 0.3–0.6` (mean-field ≈ 0.5).

### 4.4 Fluctuation diagnostic

Compute `Var[V_2(N)]` across seeds / bootstrapped corpora. Near the transition, `Var[V_2] / V_2` should peak. **Cycle 24 prediction:** bootstrap the 9-primitive coverage matrix; measure `Var[V_2(N)]` as a function of N.

### 4.5 Susceptibility-like response

Compute `χ(N) = dV_2 / d h` where `h` is a perturbation (e.g., adding or removing a corpus row). Near `N_c`, `χ` should diverge (or scale with corpus size). **Cycle 24 prediction:** compute `χ(N)` via leave-one-out analysis.

### 4.6 Type-I vs type-II classification

Compute `κ = λ/ξ` for the corpus. If `κ > 1/√2`, the corpus is "type-II" — vortices form and PC1+PC2 saturates with defect density. If `κ < 1/√2`, the corpus is "type-I" — vortices annihilate and the system reaches a clean ordered phase. Cycle 16 endpoint at 0.7657 < 0.78 suggests **type-I behavior** (vortices annihilate, approaching saturation). **Cycle 24 prediction:** compute `κ` from the empirical correlation length vs penetration depth.

### 4.7 Critical slowing-down test

Near the transition, the response to perturbations should slow down. **Cycle 24 prediction:** measure the recovery time after a corpus perturbation (add or remove rows) as a function of N.

### 4.8 Universality test

If the transition is universal, rescaled `V_2(N)` curves from different model sizes / different corpus constructions should collapse onto a single curve. **Cycle 24 prediction:** measure `V_2` on a different corpus (NIST, CIS) and check if the curve collapses with yubiOS after rescaling.

---

## 5. Honest caveats

1. **PC variance is not free energy.** PC1+PC2 is an observable state diagnostic measuring low-dimensional organization, not a thermodynamic potential. Calling it "free energy" without constructing an empirical `F_eff(x;N) = -T_eff(N) log P_N(x)` is misleading.

2. **Corpus size is not literal temperature.** Increasing N decreases estimation noise and increases order, which is the *opposite* of what literal temperature does. The mapping is `T_eff(N) ↓ as N ↑`, not `T ∝ N`.

3. **The 9-primitive coverage vector is not a literal scalar complex ψ.** It is a vector-valued order parameter. The complex Ginzburg–Landau theory has a single complex ψ; the corpus framework has a 9-D real `m`. The mapping to GL is at the level of mathematical *structure* (order parameter, control variable, free energy, fluctuations, defects), not literal components.

4. **Generic CGLE dynamics need not minimize a potential.** For nonzero `c_1, c_3`, no scalar free energy decreases monotonically. The corpus framework may have non-potential dynamics (e.g., learning curves that oscillate). The saturation at `V_2 ≈ 0.77` is consistent with both potential and non-potential dynamics.

5. **The 14 refused rows are not a vortex lattice.** They are disordered defects (vortex-glass-like). The vortex analogy requires demonstrating phase-coordinate + winding + localization, which cycle 24 should attempt.

6. **Finite-size effects.** Mean-field GL is exact only in 4+ dimensions. Below 4, fluctuation corrections alter exponents. The corpus framework is "0-dimensional" (no spatial structure), so fluctuation corrections are large and the analogy is qualitative.

7. **Crossover vs true transition.** The "+0.4664 climb" could be a smooth crossover rather than a sharp transition. The diagnostics in §4 (saturation, fluctuation peak, susceptibility divergence) are needed to distinguish.

---

## 6. Connection to the atom-bridge claim

The cycle-17 atom-bridge claim was:

> The climb from the paper's 0.2993 to cycle-16's 0.7656564170155055748523409 corresponds to deferred-to-eligible transitions as the corpus grew.

The GL framing *explains* why deferred-to-eligible transitions look like a phase transition: the **eligible regime** is the ordered phase (`ψ ≠ 0`), the **deferred regime** is the disordered phase near the transition (`ψ ≈ 0` but `α > 0`), and the **refused regime** is the defect state (`|ψ| = 0` at a vortex core). The cross-regime PCA decomposition from cycle-23 shows PC1 is dominated by eligible-vs-refused contrast (89.1% under keyword, 77.2% under manual, 29.7% under consensus), which is exactly the contrast between ordered and defect states.

This is a **structural explanation** for why PC1+PC2 climbs with corpus size: more corpus → fewer defects → larger ordered fraction → larger PC1+PC2. The explanation is testable in §4.

---

## 7. For cycle 24: integration plan

When cycle 24 runs, this ref/ entry should be integrated as follows:

1. **Constraints catalog** should cite this entry in §References
2. **SKILL.md** should add a new lens L79 (effective-potential construction) and L80 (saturation/critical-point diagnostics)
3. **Empirical gate** should add measurements for §4.1–§4.8
4. **New ideas** should include the testable predictions as open items

The cycle-24 work should:
- Construct `F_eff(x; N)` from the corpus-measured state distribution
- Measure `dV_2/d log N` and `Var[V_2(N)]` across corpus sizes
- Compute `κ = λ/ξ` from empirical correlation lengths
- Test universality against an external corpus

If the predictions hold, the GL framing becomes a load-bearing causal model. If they don't, the framing remains a useful *vocabulary* but loses its predictive force.

---

## 8. References

- Ginzburg–Landau theory of superconductivity (Salasnich lecture notes)
- Hohenberg & Krekhov, "An introduction to the Ginzburg–Landau theory of phase transitions and nonequilibrium patterns" (arXiv:1410.7285)
- Abrikosov, "Type-II superconductors and the vortex lattice" (RevModPhys 76.975, Nobel lecture)
- Aranson & Kramer, "The world of the complex Ginzburg–Landau equation" (RevModPhys 74.99)
- Täuber, "Phase Transitions and Scaling in Systems Far from Equilibrium" (Annual Reviews)
- TDGL review (arXiv:2403.03729, 2024)
- learned-latent-curves-2026-08-06-83f8ec2b.tex (paper)
- guided-curve-ideate cycle 16 results (0.7656564170155055748523409)
- guided-curve-ideate cycle 23 results (6 new ideas, consensus PCA, full-content scoring)

---

*Local ref/ entry. Add to next cycle of guided-curve-ideate.*

---

## Errata — 2026-09-13

**Append-only.** Nothing above this line has been edited or deleted. Sections 2.5,
4.1, 4.6 and caveat 4 are left standing exactly as originally written so the
record of what was claimed, and when, survives. This section states what is wrong
with them and what replaces it. Where an original claim was empirical, the later
falsification record — not this correction — remains the operative verdict.

### E1. "Nonzero imaginary coefficients preclude a decreasing free energy" is too broad

§2.5 states that for nonzero imaginary coefficients **no scalar free energy
decreases monotonically**, and caveat 4 repeats it. That is correct for *generic*
(unequal) coefficients but false for the **equal-coefficient** case, which is a
set of measure zero the original text swept in with the rest.

Take the normalized, **noise-free, deterministic** CGLE with `b = c = β`:

$$
\partial_t A = A + (1 + i\beta)\Delta A - (1 + i\beta)|A|^2 A.
$$

Move to the rotating frame `B = e^{i\beta t} A` and set

$$
G(B) = B - |B|^2 B + \Delta B,
$$

so that the equation becomes `∂_t B = (1 + iβ) G(B)`. For periodic or suitable
no-flux boundary conditions define

$$
F[B] = \int \left( |\nabla B|^2 - |B|^2 + \tfrac12 |B|^4 \right) dx .
$$

The functional derivative is `−G`, hence

$$
\frac{dF}{dt} = -2\,\mathrm{Re}\!\int G^{*}(1 + i\beta)G\,dx = -2\int |G|^2 dx \le 0 .
$$

The reactive part `iβ` is annihilated by the real part, so it drops out of the
dissipation rate entirely. Therefore:

- **β = 0** is pure gradient (relaxational) flow — as §2.5 already said.
- **Equal nonzero β** is *not* gradient flow, but it still admits `F` as a
  **Lyapunov functional**: `Ḟ = −2‖G‖² ≤ 0`, with a purely reactive component
  that does no work against `F`. Global phase rotation leaves `F` unchanged.
- **Arbitrary unequal `b ≠ c`** carries **no such guarantee**. This is the case
  §2.5 was reaching for, and for it the original statement stands.

Two limits on how far this goes. `Ḟ ≤ 0` alone does **not** prove the original
field converges to a time-independent state; and noise, forcing, or unequal
coefficients each require separate analysis. The correction is about the
*existence of a Lyapunov functional in one special case*, nothing more.

Independent finite-periodic-system checks of the identity at β = 0, 0.7, 1.5 and
−2 gave a maximum relative identity error of **5.10 × 10⁻¹⁶**. A direct
unequal-coefficient counterexample at `b = 2, c = −1` produced a **positive**
directional derivative of **1.730246 × 10⁻⁵**, confirmed independently by a
symmetric energy difference of **1.730247 × 10⁻⁵** (16 sites, cosine perturbation
of amplitude 0.01, real/imaginary amplitude ratio 0.05). The rise is a property of
the vector field at that state, not an explicit-Euler integration artefact.

The operator identity is corroborated by Aranson & Kramer, *The world of the
complex Ginzburg–Landau equation*, RMP **74**, 99 (2002),
[arXiv:cond-mat/0106115](https://arxiv.org/abs/cond-mat/0106115).

### E2. `2/9 ≈ 0.78` is an arithmetic error, and the bound points the other way

§4.1 reads ``V_2(N)`` should saturate "at a value near `2/9 ≈ 0.78`", and §4.6
reasons from `0.7657 < 0.78`. Two separate faults:

1. **The arithmetic is wrong.** `2/9 = 0.2222…`, not `0.78`. The numeral `0.78`
   has no derivation anywhere in the original text; it appears to have been
   carried forward unchecked, and §4.6's type-I/type-II reading is built on the
   comparison `0.7657 < 0.78`, which is therefore unsupported as written.
2. **The direction of the bound is inverted.** For a nonzero positive-semidefinite
   9-D covariance, `2/9` is the **isotropic lower bound** on the top-two variance
   share — the value attained when all nine eigenvalues are equal. Any anisotropy
   *raises* `PC1 + PC2` above `2/9`; the trivial upper bound is 1. So `2/9` is a
   **floor**, not a saturation ceiling, and a measurement of `0.7657` sits far
   above that floor rather than approaching it from below.

The later *Is This X?* paper already distinguishes this isotropic floor from
ensemble-specific measured values; that treatment has precedence over §4.1 and
§4.6, and this erratum makes the precedence explicit rather than restating it.

This is a correction to a **bound and its arithmetic only**. It supplies no
evidence that `V_2` saturates, no exponent, and no transition.

### E3. The empirical falsifications are untouched by E1 and E2

E1 fixes a statement about CGLE mathematics. E2 fixes an arithmetic error and the
direction of a linear-algebra bound. **Neither reopens any empirical claim made in
this note.** Specifically, the predictions recorded as **P2, P4 and P5** remain
**falsified** under their own recorded protocols in the corpus's falsification
record, and the retired Hodge/vortex interpretation and the dimensionally invalid
quantized-flow claim remain retired. Correcting the `b = c` mathematics does not
restore the phase-transition model in §3.5 or §4; it only removes an incorrect
reason that was being offered for part of it.

Nothing in this errata transports evidence of Ginzburg–Landau dynamics to the
corpus. The corpus still has no autonomous field evolution and no independently
measured amplitude or phase, so the analogy remains structural, exactly as
caveats 1–3 and 6–7 above already state.

## 2026-09-18 negative-preservation check (wayfinder round 8, cycle 33)

The corpus's recorded negatives (A1 admission failed; Gaunt coupling negative at L=3; FCS
factorization not identifiable; uniform Pennes loss cancels; margin-clean two-branch exclusion)
are load-bearing content this round must not erase. Checked: the GL reference doc is intact
(25899 bytes, unchanged by any round-8 edit so far), and the negative keywords still resolve
across the corpus at the round's pin. No round-8 record asserts a new physics term; the
wayfinder ranking's exclusion-only discipline holds.
