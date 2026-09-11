> Research-phase record, followed by [the implementation report](wayfinder-math-implementation-2026-09-10.md). Deployment-status statements below describe the research phase.

# Navier–Stokes research and the next wayfinder equations

## Decision

**Add threshold-margin diagnostics and exact local isolation-change identities first.** Both operate on quantities `/map/` already computes. Keep the Navier–Stokes construction outside the production dependency chain. Its formalization methodology is useful; its fluid blow-up mechanism currently has no defined counterpart in the map.

This research used four independent general/smart streams: primary-claim verification, formalization/Lean compatibility, numerical transfer, and PR 230 statistical reconciliation. The statistical stream was restarted after a container interruption. Their recommendations were audited rather than accepted wholesale: one margin experiment overstated its value by omitting the majority-class baseline.

**What is finished:** pinned source audits, all 11 live map snapshots, exact graph replay of all 10 transitions, exhaustive graph checks, bounded-perturbation checks, tested JS helpers and a small Lean draft.

**What is not done:** kernel compilation of the new Lean draft, any new GitHub commit/CI dispatch, production deployment, or a new prospective edit benchmark. Nothing in this research establishes a higher forward-prediction score.

## 1. What PR 230 actually establishes

PR 230 is merged. Source inspected: `yubi-OS/yubiOS` main `67274066531ae5288bfc640a2030e5a20508b57e`; PR head `2bc6331c2ea36f57ecdcfdfe7f40179966cbfbbf`. [Results record](https://github.com/yubi-OS/yubiOS/blob/67274066531ae5288bfc640a2030e5a20508b57e/refs/wayfinder-loop-results-2026-09-09.md).

All live maps 51–61 were retrieved successfully. Frame `f90cf5ba805322a5` is unchanged throughout. Counts independently match the report:

| Cycle | Type | Predicted isolation delta | Observed | Exact local graph equation | Explanation |
|---|---|---:|---:|---:|---|
| 1 | CHANGE | -4 | -2 | -2 | One old point moves; incident edges account for the change |
| 2 | CHANGE | -2 | 0 | 0 | No common point or bit row moves |
| 3 | ADD | -1 | -2 | -2 | New point connects to 2 previously isolated points |
| 4 | ADD | -1 | -1 | -1 | New point connects to 1 previously isolated point |
| 5 | ADD | -1 | 0 | 0 | New point has degree 2, touching no previous isolates |
| 6 | CHANGE | -2 | 0 | 0 | No common point or bit row moves |
| 7 | ADD | -1 | 0 | 0 | New point has degree 2, touching no previous isolates |
| 8 | ADD | -1 | -1 | -1 | New point connects to 1 previously isolated point |
| 9 | ADD | +1 | 0 | 0 | New point has degree 2, touching no previous isolates |
| 10 | CHANGE | +1 | 0 | 0 | No common point or bit row moves |

The isolation series is `43,41,41,39,38,38,38,38,37,37,37`. Four sign matches and two exact magnitude matches are verified. The record contains **no statistical uncertainty intervals**, so “within margins” can currently mean exact equality, not coverage by a documented confidence interval.

Important refinement: the six zero outcomes split into **three quantization-silent CHANGE operations and three ADD operations that attach to already-connected points**. A new document can be fully represented and leave isolated count unchanged. Treating all six as the same embedding/threshold failure would lead to the wrong fix.

Round 1 reports 2 surviving edit operations out of 8 attempts, with 10 map runs including baseline/confirmation. Round 2 reports 4/10 sign matches and 10/10 locally retained edits; it explicitly leaves independent task grading untested. Survival, sign agreement, exact magnitude agreement and semantic quality are different endpoints. Multiple files per edit also make artifact counts different from operation counts.

An always-zero baseline exactly matches 6/10 outcomes on this trail, versus 2/10 exact matches for the recorded rung predictions. It cannot predict the useful negative changes, but it must appear in a fair comparison. Successive adaptive edits on one corpus are not independent trials. Illustrative iid Wilson intervals for 4/10 are roughly [0.168, 0.687], but their nominal coverage is not justified for this adaptive experiment; they do not establish a significant round-to-round improvement.

## 2. Verified status of the attached Navier–Stokes claim

The attachment points to real public artifacts. The primary [paper](https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf), *Finite Time Blowup for Navier–Stokes*, has the byline OPENAI. The [Lean repository](https://github.com/openai/NavierStokesAndEuler/tree/f9e8bc5b38b6e212696e8a30e3e91517af887bbd) was independently inspected at `f9e8bc5b38b6e212696e8a30e3e91517af887bbd`, Apache-2.0. Its toolchain is Lean `4.34.0-rc2`, with mathlib pinned through the Lake manifest.

The paper claims: for every positive viscosity, there is a smooth, compactly supported force, zero initial velocity, and a velocity/pressure pair smooth for times below 1, with bounded kinetic energy but unbounded velocity supremum approaching time 1. It claims Clay alternatives (C) and (D), concerning breakdown with permitted smooth forcing. [Fefferman's official formulation](https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf) explicitly permits forcing in those alternatives. This is not a claim of global regularity or an unforced blow-up construction.

Static inspection found four intentional challenge-placeholder declarations and one comment containing the placeholder word; they reside in `ComparatorChallenges`, outside the inspected proof-root imports. No such declarations were found in the proof sources. The submission includes comparator statements and printed-axiom requests; `formalization.yaml` labels review **self-assessed**.

We did **not** independently compile the full project, run its external checker, or adjudicate the correctness/faithfulness of its real-analysis definitions. Matching declaration lists and source-level placeholder scans are not substitutes for a kernel build or a mathematical review. The [Clay status page](https://www.claymath.org/millennium/navier-stokes-equation/) remained active at retrieval. The detailed agent-count/timing/priority discussion is irrelevant to our integration decision and receives no evidentiary weight here.

## 3. Equation A: threshold clearance with a conditional stability bound

For frozen axis $$a_j$$, mean $$\mu$$ and threshold $$\tau_j$$, expose the **signed** margin:

$$
m_j(x)=a_j^\top(x-\mu)-\tau_j,\qquad b_j(x)=\mathbf1[m_j(x)>0].
$$

For a perturbation bounded by $$\|\Delta x\|_\infty\le\epsilon$$, the triangle inequality gives

$$
|a_j^\top\Delta x|\le\epsilon\|a_j\|_1.
$$

Include a separately justified numerical error allowance $$\eta_j$$ and set $$R_j=\epsilon\|a_j\|_1+\eta_j$$. Then:

- $$m_j>R_j$$ guarantees that the bit stays on, conditional on the supplied bounds.
- $$m_j\le-R_j$$ guarantees that the bit stays off.
- Otherwise return **undetermined**, not “will flip.”

Equality is asymmetric because the implemented threshold is strictly greater than zero. A zero-to-one change requires $$a_j^\top\Delta x>-m_j$$; a one-to-zero change requires $$a_j^\top\Delta x\le-m_j$$.

The Euclidean distance to the hyperplane is $$|m_j|/\|a_j\|_2$$ when the axis is nonzero. Do not report it in standard-deviation units unless the relevant score variance has actually been computed. A fixed frame freezes the boundary, not a document's changing margin.

**Limit:** the system currently cannot derive the embedding displacement of a proposed paragraph before embedding it. These equations provide conditional bounds and post-embedding explanations. They do not create a text-to-bit predictor by themselves. Past maps store frame parameters and bits, but not the original input scores/vectors needed to reconstruct each old margin numerically; we did not fabricate those retrospective values.

Tests: 12,000 bounded perturbations, 10,186 classified conditionally stable, zero violations. This checks the implementation of a stated bound on synthetic inputs, not semantic forecasting.

### Rejected accuracy claim from our own research stream

An initial prototype labeled $$|m|<|\Delta s|$$ as a flip predictor. It ignored direction and compared primarily against “always flip.” At increment 0.2 it scored 91.35% accuracy; **always no-flip scored 91.475%** on the same trials. At increment 0.05, the scores were 97.625% versus 97.775%. The claimed 85–98% accuracy therefore does not demonstrate useful prediction.

A point already above threshold moving farther upward is a direct counterexample to that unsigned rule. Its shuffled control also did not approach the claimed always-flip baseline. That prototype is excluded from the evidence supporting deployment. The replacement helper uses signed margins, abstention and explicit error-bound requirements.

## 4. Equation B: exact ADD isolation change

Use the existing undirected radius graph:

$$
A_{ij}=\mathbf1[i\ne j\;\land\;\|p_i-p_j\|_2<r],\quad d_i=\sum_j A_{ij},\quad I=\sum_i\mathbf1[d_i=0],\quad r=0.095.
$$

Adding one point $$q$$ with incident indicators $$e_i=\mathbf1[\|p_i-q\|_2<r]$$, while all old points/edges remain fixed, gives

$$
\boxed{\Delta I=\mathbf1[\sum_i e_i=0]-\sum_i\mathbf1[d_i=0]e_i.}
$$

The first term counts whether the new point is isolated. The second counts old isolated points it connects. This explains the three neutral ADDs: each new point had degree 2 and connected zero old isolates, giving exactly zero isolation change. No missing velocity field or new physical parameter is needed.

**When directly useful:** show a proposed text's actual post-embedding location and the old isolates it would touch before committing that text. Predictions should name those intended neighbours rather than only an abstract bit pattern. If the candidate instead touches already-connected points, return a neutral geometric result while preserving its separate task check.

## 5. Equation C: exact CHANGE isolation change

For one moved vertex $$i$$ with old/new incident indicators $$a_j,a'_j$$, every other vertex has

$$
d'_j=d_j-a_j+a'_j\quad(j\ne i),\qquad d'_i=\sum_{j\ne i}a'_j.
$$

Therefore

$$
\Delta I=\mathbf1[d'_i=0]-\mathbf1[d_i=0]
+\sum_{j\ne i}\left(\mathbf1[d_j-a_j+a'_j=0]-\mathbf1[d_j=0]\right).
$$

Only the moved point and the union of its old/new neighbours can change isolation status. This is a local, inspectable witness for every resulting count change. Its precondition is that no other point's incident relationships change; mismatched frames or multiple moving points must reject the one-vertex certificate or use a correctly composed multi-vertex ledger.

**Verification:** exhaustive ADD/CHANGE checks on small simple graphs covered **38,172 cases**, all passing. The exact local formulas reproduced **all ten recorded PR 230 transitions**, including neutral ones, from actual stored coordinates. This is retrospective identity verification. **Zero new pre-edit forecasts were tested.**

## 6. Equations D/E: bookkeeping and optional diffusion

For a strict predicted decrease, record the trust-region-style ratio

$$
\rho=\frac{-\Delta I_{\mathrm{observed}}}{-\Delta I_{\mathrm{predicted}}}.
$$

Predicted reduction must be positive. Zero or positive predicted deltas are not valid descent-ratio trials. Existing eligible ratios are `0.5,0,2,1,0,0,0,1`; they measure local geometric model agreement, not calibrated confidence or task quality. Avoid estimating per-sector reliability from these tiny, selected groups.

A legitimate optional extension is symmetric graph diffusion:

$$
L=D-W,\quad \dot u=-\nu Lu,\quad
\frac{d}{dt}\frac12\|u\|_2^2=-\nu u^\top Lu
=-\frac\nu2\sum_{ij}w_{ij}(u_i-u_j)^2\le0.
$$

Symmetry and nonnegative weights are essential; constant fields are fixed and total mass is conserved. For explicit Euler, a sufficient maximum-principle bound is $$h\nu\max_i\sum_j w_{ij}\le1$$; energy nonincrease uses $$h\nu\lambda_{\max}(L)\le2$$. Merely showing that the old maximum decreases does not rule out an overshoot below the old minimum.

Diffusion requires an explicitly defined field $$u$$ and a reason to smooth it. The current spherical harmonic heat summaries already supply part of this territory. A new smoothed-density ranking would need its own matched-null admission and held-out benefit test. It remains deferred. Velocity, pressure, incompressibility, vortex stretching and singularity dynamics have no defined role in the present edit pipeline.

## 7. Concrete CI and `/map/` integration plan

1. Keep the existing core Lean 4.33.0 lane. Add `papers/data/lean/WayfinderBounds.lean` for strict-threshold and finite ADD-count obligations. The supplied draft is **not yet kernel-checked**. Add CHANGE ledger identities only when their graph-correspondence assumptions are explicit. Do not rename arithmetic lemmas after Navier–Stokes.
2. Add a scope manifest linking each formal theorem to its exact runtime predicate, allowed assumptions, floating-point checks and scientific nonclaims. Run printed-axiom checks. This follows the useful formalization/comparator discipline without importing the external PDE library.
3. Preserve existing `CurvedCorpus.lean` and all recorded-negative numerical gates. Add the small proof file and replay/exhaustive tests as extra steps; never lower thresholds or replace negative results to obtain green CI.
4. Integrate the tested diagnostic helpers into the shared map module. Emit signed score margins, exact touched-neighbour ledgers, observed/predicted reduction ratios and explicit undetermined/bound-missing states. Keep them out of quality scoring until validated.
5. Add an actual-text candidate preview: freeze baseline, re-embed the candidate without modifying the repo, calculate its true bit/edge changes, check unchanged anchors, and run the same independent factual/task verifier. Preserve content/hash/frame provenance.
6. Pre-register a held-out comparison against ordinary source inspection, always-zero geometric prediction, and the existing synthetic-rung baseline. Separate ADD/CHANGE, sign/magnitude, neutral abstentions, semantic regressions, infrastructure errors and costs. Only prospective outcome data can raise the forward-prediction score.

A separate Lean 4.34/mathlib workflow would be required to build the external Navier–Stokes project. That is an independently scoped mathematical audit, not a prerequisite for these map fixes.

## 8. Research artifacts and reproducibility

- `validate_map_math.py` + `map-math-validation.json`: exact historical graph replay, exhaustive small graphs, conditional perturbation checks. Reads snapshots under `maps/`.
- `wayfinder-equations.mjs`: 10 passing helper selftests, signed-margin/ADD/CHANGE/reduction-ledger API draft.
- `WayfinderBounds.lean`: compact proof draft; uncompiled locally because Lean is unavailable. Expected CI command: `lean papers/data/lean/WayfinderBounds.lean` on the existing pinned toolchain.
- `margin-prototype-audit.json`: corrected majority-class comparison; the initial forecast-accuracy claim is rejected.
- `source-manifest.json`, PR metadata and maps 51–61: pinned inputs and live evidence. Recheck remote refs before any implementation.

No GitHub or Cloudflare mutation was performed during this research turn. The report and prototypes are local, ready for review and a scoped implementation pass.

## Primary sources

- [PR 230](https://github.com/yubi-OS/yubiOS/pull/230) and [results at the inspected commit](https://github.com/yubi-OS/yubiOS/blob/67274066531ae5288bfc640a2030e5a20508b57e/refs/wayfinder-loop-results-2026-09-09.md).
- [Current inspected core Lean](https://github.com/yubi-OS/yubiOS/blob/67274066531ae5288bfc640a2030e5a20508b57e/papers/data/lean/CurvedCorpus.lean), [workflow](https://github.com/yubi-OS/yubiOS/blob/67274066531ae5288bfc640a2030e5a20508b57e/.github/workflows/lean-check.yml), [point-map module](https://github.com/yubi-OS/yubiOS/blob/67274066531ae5288bfc640a2030e5a20508b57e/tools/point-map/pointmap.js).
- [Live map 51](https://steady-orbit.systems-a.workers.dev/api/maps/51), [map 61](https://steady-orbit.systems-a.workers.dev/api/maps/61), plus every intervening map, retrieved September 10, 2026.
- [OpenAI paper](https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf), [pinned formal repository](https://github.com/openai/NavierStokesAndEuler/tree/f9e8bc5b38b6e212696e8a30e3e91517af887bbd), [self-assessed manifest](https://github.com/openai/NavierStokesAndEuler/blob/f9e8bc5b38b6e212696e8a30e3e91517af887bbd/formalization.yaml).
- [Clay/Fefferman official problem](https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf), [Clay status](https://www.claymath.org/millennium/navier-stokes-equation/). Direct announcement fetch was blocked; the paper and repository supplied the mathematical statements used here.
