> Research-phase record. Implementation and deployment evidence follows in [the implementation report](radius-diagnostics-implementation-2026-09-13.md).

# Landau, vortex glass and the next wayfinder mathematics

## Recommendation

**Add radius-persistence and radius-stability diagnostics to candidate preview.** Keep the canonical isolation radius at 0.095 and preserve the existing instrument. Correct the old GL reference's overbroad energy claim, but do not revive the corpus's falsified phase-transition model or introduce an artificial physical phase field.

Four general/smart streams checked primary physics, PR 232's live results, transferable equations, and Lean/runtime feasibility. Their conclusions were independently checked. Two proposed ideas were corrected during synthesis: isolation persists *below* a point's nearest-neighbour distance, not above it; and a degree-preserving graph null is degenerate for the number of isolates at its conditioning radius.

This turn was read-only externally. Prototypes and a Lean draft are local. No repository changes, CI dispatch or Cloudflare deployment occurred.

## 1. PR 232: successful instrumentation, with a newly visible scale issue

[PR 232](https://github.com/yubi-OS/yubiOS/pull/232) is merged at `e4be4854764f3217eaab08c01f15e62d5509e3ec`, the inspected main HEAD. Live core source matches the repository. The latest inspected `lean-check` run was green on the earlier code commit `d568b232aeda2d43d6d217f6dc14cfba9847caec`; PR 232 changes refs documents, so that earlier run is not mislabeled as a run on PR 232's merge.

All eleven stored maps 66–76 were retrieved, and each isolation count was independently recomputed from full-precision coordinates. Final map **76** has **176 items, 64 isolates, V2=0.31855**. All maps use frame `a045c8d3f4ff939b`, and all shared points have exactly zero coordinate movement throughout this trail.

The runtime trail has eight ADDs and two source-text CHANGEs. One CHANGE has a recorded generic-rung prediction and one is described as a verification edit without a prediction. The PR diff contains eight added files and one modified existing file; it does not include the chromium-overlay document changed in the runtime trail. The record does not explain that difference, so no claim is made that every runtime source mutation shipped.

Generic rung predictions were exactly correct on **5/8 ADDs**. Across the nine recorded predictions, that is **5/9**; the unpredicted verification edit is not assigned an invented prediction. Exact post-preview ledgers and independently graded task quality remain separate endpoints. A correctly predicted +1 isolate is an instrumentation success, not automatically a quality improvement.

The isolate census has 66 class entries but 62 unique documents, with four cross-class duplicates. Its unique-name set matches the 62 map-74 isolates exactly. Its “one class per doc” wording needs correction, not the underlying isolate count.

### Fixed, predeclared radius sweep

The local diagnostic used radii 0.075, 0.085, 0.095, 0.105 and 0.115. No best-scoring radius was selected afterwards.

| Cycle | Added item | ΔI(.075) | ΔI(.085) | ΔI(.095) | ΔI(.105) | ΔI(.115) |
|---|---|---:|---:|---:|---:|---:|
| 4 | systemd-v262-refresh | -1 | -1 | -1 | 0 | 0 |
| 6 | adjacent-problems-mirror-provenance | +1 | +1 | -1 | -1 | -1 |
| 9 | round3-isolate-census | +1 | +1 | +1 | -1 | -1 |
| 10 | round3-results | +1 | +1 | +1 | -1 | 0 |

Cycles **6, 9 and 10 reverse sign** across this grid. Cycle 4 becomes neutral. This is sensitivity to an instrument parameter, not evidence for physical glassiness or a thermodynamic transition.

At radius 0.095 the total count rises from 61/168 to 64/176; the isolated fraction changes only slightly. At radius 0.105 both endpoints have 46 isolates. The radius profile and corpus size therefore belong beside the single count.

## 2. What the attached physics actually says

The vortex-glass citation is **Brito, Aranson and Chaté, PRL 90, 068301 (2003)**, [arXiv cond-mat/0208238](https://arxiv.org/abs/cond-mat/0208238), submitted in 2002. A 2026 header in a rendered version is not its publication date.

It studies the normalized complex Ginzburg–Landau equation

$$
\partial_t A=A+(1+ib)\Delta A-(1+ic)|A|^2A.
$$

Its “glass” is a slowly rearranging multi-spiral state in deterministic, homogeneous, noiseless oscillatory media. It is distinct from a superconducting vortex glass pinned by quenched disorder. The paper reports possible aging-like behaviour and leaves precise asymptotic characterization open. Its reduced vortex position/phase equations are explicitly non-variational; it supplies no universal decreasing energy for those reduced dynamics.

The linked graphene story traces to *Observation of a superfluid-to-insulator transition of bilayer excitons*, [Nature 650, 86–92 (2026)](https://doi.org/10.1038/s41586-025-09986-w). Transport evidence motivates a supersolid interpretation, but it does not directly establish simultaneous coherent superflow and density ordering. It supplies no measured complex order parameter for our documents.

The useful connection is a discipline of checking apparent freezing across observation scales and separating dissipative from reactive dynamics. Our map currently has neither autonomous fluid evolution nor independently measured phase/amplitude. Adaptive document edits and parameter sweeps cannot be presented as a physical aging experiment.

## 3. A real correction to the old GL note

`refs/complex-ginzburg-landau-skill-emergence.md` §2.5 and caveat 4 say that nonzero imaginary coefficients preclude a monotonically decreasing scalar free energy. That statement is too broad.

For the normalized deterministic equation with **b=c=β**, define

$$
B=e^{i\beta t}A,\qquad G(B)=B-|B|^2B+\Delta B.
$$

Then

$$
\partial_tB=(1+i\beta)G(B).
$$

For periodic or appropriate no-flux boundary conditions, take

$$
F[B]=\int\left(|\nabla B|^2-|B|^2+\tfrac12|B|^4\right)\,dx.
$$

The functional derivative is -G, so

$$
\frac{dF}{dt}=-2\operatorname{Re}\int G^*(1+i\beta)G\,dx
=-2\int|G|^2\,dx\le0.
$$

Thus β=0 is pure gradient flow; equal nonzero coefficients retain a Lyapunov functional with a reactive component. Global phase rotation leaves F unchanged. Decreasing F alone does not prove convergence of the original field to a time-independent state. Noise/forcing and general unequal coefficients require separate analysis.

Independent finite-periodic-system checks at β=0,0.7,1.5,-2 gave maximum relative identity error **5.10×10^-16**. A direct unequal-coefficient counterexample at b=2,c=-1 has positive directional derivative **1.730246×10^-5**, confirmed by a symmetric energy difference (**1.730247×10^-5**). It uses 16 sites, a cosine perturbation of amplitude 0.01 and real/imaginary amplitude ratio 0.05. The rise is a property of the vector field at that state, not an explicit-Euler instability.

This operator identity is corroborated by [Aranson and Kramer, RMP 74, 99 (2002)](https://arxiv.org/abs/cond-mat/0106115). It transports no evidence of GL dynamics to the corpus.

The old ref also contains `2/9 ≈ 0.78`. In fact **2/9≈0.2222**; for a nonzero positive-semidefinite 9-D covariance it is the isotropic lower bound on the top-two variance share, not a universal upper saturation value. The later *Is This X?* paper already distinguishes the floor from ensemble-specific values. A dated correction should make that precedence explicit.

## 4. The directly usable equations

Let

$$
c_i=\min_{j\ne i}\|p_i-p_j\|_2
$$

be a point's nearest-neighbour clearance on the frozen sphere. Since the implemented graph uses the strict edge test d<r,

$$
I(r)=\sum_i\mathbf1[r\le c_i].
$$

Consequences:

- I(r) is non-increasing as r increases.
- An item is isolated on **[0,c_i]**. A tie at r=c_i remains isolated.
- The profile is a step function, so exact breakpoints are available without radius-grid optimization.
- Its clipped integral is

$$
S_R=\int_0^R I(r)\,dr=\sum_i\min(R,c_i).
$$

S_R has distance units. It is not I(r), free energy or a confidence score. Report both S_R and S_R/N if N differs between corpora. Squared-distance variants require a squared-radius variable throughout; units cannot be mixed.

### Exact stability intervals for actual edits

From the union of before/after clearance breakpoints, ΔI(r) is constant on intervals of the form (left,right]. The local implementation recovered the following maximal intervals containing r=0.095:

| Cycle | ΔI(.095) | Same-delta/same-sign interval, chord units |
|---|---:|---|
| 4 | -1 | (0, 0.1017510391] |
| 6 | -1 | (0.0945581803, 0.2536978734] |
| 9 | +1 | [0, 0.0959283949] |
| 10 | +1 | [0, 0.1041970168] |

Cycle 6's negative reading sits only **0.00044182** above its lower boundary; cycle 9's positive reading sits only **0.00092839** below its upper boundary. Those are exact frozen-coordinate parameter clearances, not statistical uncertainty intervals and not pre-edit forecasts.

A preview can display this information before the user applies the candidate to the repository, because the candidate has already been embedded. It should preserve the canonical r=0.095 count and show the sensitivity beside it.

### Bounded-coordinate robustness

If point displacements satisfy ||Δp_i||≤ε_i, then

$$
|d'_{ij}-d_{ij}|\le\epsilon_i+\epsilon_j.
$$

An edge is stable when d_ij+ε_i+ε_j<r. A nonedge is stable when d_ij−ε_i−ε_j≥r. The strict/equality distinction matters. With a common bound ε, c_i≥r+2ε guarantees continued isolation. These are conditional metric bounds; real floating-point error allowances and the displacement bound itself must be justified separately.

Tests: 20,000 bounded pair perturbations and 10,201 integer rectangle identities passed, including threshold equality. The radius intervals reproduce all ten stored transitions and are invariant under row reordering.

## 5. Null-model checks: one tempting control is invalid

The current bit-matrix null can be reused as an **exploratory conditional fixed-frame null**: preserve row/column margins, transform null bits using the observed frozen frame, and compute the same radius profile. We ran K=40 draws at the existing 5Nd attempted switches and at 20Nd for maps 66,74,76. Every sampled matrix preserved its margins.

For final map 76 at r=.095, real I=64; null means were 71.10 and 70.125, with sample SDs 7.58 and 9.54. These are descriptive finite samples, not a demonstrated convergence result.

The mean clipped-clearance statistic is also budget-sensitive: the final real value is approximately 0.04750. Its observed outer empirical band was [0.05304,0.06903] at 5Nd and [0.04678,0.07294] at 20Nd. It lies outside one and inside the other. K=40 and this difference are insufficient grounds to admit a new ranking statistic. Bands are pointwise, conditional on the fitted frame, and not adjusted for searching across radii.

A **degree-preserving graph null cannot calibrate I(r0)**: I(r0) is exactly the number of degree-zero vertices, which that null fixes. A local swap exercise kept all 62 map-74 isolates unchanged at every checkpoint; SD=0 is required by definition, regardless of mixing. The earlier Hodge analysis's degree-null was informative for cycle structure; that does not make it informative for every graph statistic.

For a clearance curve, a proposed null must define how distances or the metric filtration are randomized. Rewiring an unweighted graph does not, by itself, define new geometric distances. No significance or automatic ranking claim follows from the exploratory probes here.

## 6. What remains excluded or deferred

- The existing P2/P4/P5 phase-transition predictions remain falsified under their recorded protocols. The old Hodge/vortex interpretation and dimensionally invalid quantized-flow claim remain retired. Correcting the b=c mathematics does not reopen those empirical claims.
- A phase assignment is still missing. On the same four fixed points, admissible arbitrary phase labels produce winding +1,0 or -1. A mathematical chart angle can be defined, but it is not evidence of a physical order parameter or vortex core.
- Graph Allen–Cahn/GL is legitimate **designed** dynamics once a field, graph and energy are specified. It would need an application, numerical stability constraints, a simpler diffusion baseline and a predeclared task test. Adding a double-well merely to make the visualization look glassy is unwarranted.
- Joint multi-bit displacement feasibility is a possible separate extension; single-axis margins already ship. No duplicate margin feature is proposed here.

## 7. Implementation path

1. Append dated corrections to the old GL ref and explicitly link its empirical claims to the later falsification record. Complete the round-three final result and clarify overlapping census labels, without inventing why one runtime CHANGE is absent from the PR diff.
2. Add a diagnostic-only radius profile to preview: per-item clearances, canonical I(.095), fixed-grid counts, exact same-sign/delta interval and changed-neighbour witnesses. Keep the current frame/hash/ranking and canonical radius unchanged.
3. Compile the proposed core-Lean radius-antitonicity and perturbation-bound obligations on 4.33.0; extend the existing scope/printed-axiom gate. The supplied `RadiusBounds.lean` is **uncompiled** in this research turn. Existing fixed-radius ADD/CHANGE theorems do not already prove the new cross-radius facts.
4. Add deterministic equality/reordering/rigid-rotation tests, the real maps 66–76 fixture, integer area checks and explicit null-degeneracy tests. Float-to-integer/metric correspondence stays a separate obligation.
5. Evaluate usefulness on a fresh, independently graded edit trial. Preserve neutral/fragile outcomes, abstentions and error costs. Do not relabel retrospective agreement as better forecasting.

No production change is authorized or executed by this report alone.

## Sources and artifacts

- [PR 232](https://github.com/yubi-OS/yubiOS/pull/232), [round-three results](https://github.com/yubi-OS/yubiOS/blob/e4be4854764f3217eaab08c01f15e62d5509e3ec/refs/wayfinder-round3-results-2026-09-13.md), [isolate census](https://github.com/yubi-OS/yubiOS/blob/e4be4854764f3217eaab08c01f15e62d5509e3ec/refs/wayfinder-round3-isolate-census-2026-09-13.md), [existing GL note](https://github.com/yubi-OS/yubiOS/blob/e4be4854764f3217eaab08c01f15e62d5509e3ec/refs/complex-ginzburg-landau-skill-emergence.md), [later paper](https://github.com/yubi-OS/yubiOS/blob/e4be4854764f3217eaab08c01f15e62d5509e3ec/papers/is-this-x-2026-08-12-Final.tex).
- Brito, Aranson & Chaté: [preprint](https://arxiv.org/abs/cond-mat/0208238), [PRL DOI](https://doi.org/10.1103/PhysRevLett.90.068301). Aranson & Kramer: [review](https://arxiv.org/abs/cond-mat/0106115). Graphene: [Nature DOI](https://doi.org/10.1038/s41586-025-09986-w).
- Live maps [66](https://steady-orbit.systems-a.workers.dev/api/maps/66) through [76](https://steady-orbit.systems-a.workers.dev/api/maps/76), retrieved September 13 Pacific / September 14 UTC.
- Local reproducibility: `landau_identity_checks.py`, `landau-identity-results.json`, `isolation_radius_probe.py/json`, `radius_intervals.py`, `radius-interval-results.json`, `radius_null_probe.mjs`, `radius-null-results.json`, `maps/`, `RadiusBounds.lean`, and `manifest.json` in this report's folder.
