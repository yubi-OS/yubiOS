# Rayleigh's equation in the wayfinder: what fits, where it goes, what is proved (rayleigh/1)

**Date:** 2026-09-18. **Question (Jenny):** can Rayleigh's equation be used in the Lean CI and the Cloudflare API endpoints, and where does it belong in the flow? **Answer:** yes, in two exact forms the instrument already implicitly uses, plus one physical form that does not fit. Shipped as `rayleigh/1` (API + Lean + CI); details below.

## 1. Which "Rayleigh's equation"

| Form | Statement | Fit to the instrument |
|---|---|---|
| **Rayleigh quotient / Rayleigh–Ritz / Courant–Fischer / Ky Fan** | R(x)=xᵀAx/xᵀx; λ_max = max R; tr(XᵀCX) ≤ λ₁+…+λ_k for orthonormal X (Ky Fan) | **Direct.** V2 is the trace-normalized top-2 eigen-share of the bit covariance, i.e. a Ky Fan maximum; the frozen PCA frame reuses baseline eigenvectors on later corpora, so its Ritz value on the new covariance is ≤ the new top-2 sum. The gap is exact, sign-certain, and measures frame adequacy. |
| **Rayleigh quotient of the graph Laplacian** (Fiedler value, algebraic connectivity, Cheeger) | xᵀLx = Σ_edges (x_i−x_j)²; nullity(L) = #components; λ₂ = min_{x⊥1} R(x) | **Direct.** The isolation graph (chord < 0.095 on S²) is what the instrument counts isolates on. Isolates are components of size 1; λ₂ of the largest component is a connectivity reading; the centered indicator of any cut gives an exact rational upper bound on λ₂. |
| **Rayleigh's inviscid stability equation** (u−c)(φ″−k²φ)−u″φ=0, inflection-point theorem | eigenvalue problem for a parallel shear flow | **Does not fit.** Needs a velocity profile, a wavenumber and real analysis; the corpus has no flow field. Same verdict as the recorded Navier–Stokes/GL negatives: no physical field enters ranking. |
| **Rayleigh–Plesset, Rayleigh damping** | bubble dynamics ODE; C = αM+βK | **Does not fit** (ODE/physical constants). |

The deep-research pass (Demmel, Spielman, Boyd–Lall, Fiedler 1973, Cheeger notes, DePavia–Steinerberger, Taştan–Muma–Zoubir, fixed-margin swap literature) confirms the split: finite quadratic-form identities, cut identities and rational quotients are elementary algebra provable in core Lean; the spectral theorem, nullity = #components, Ky Fan and Cheeger need finite-dimensional spectral theory (or Mathlib); the fluid/bubble equations need analysis. Prior art on embedding graphs uses λ₂ = 0 as the exact disconnection certificate and Fiedler sign cuts for bottlenecks, and warns that a small positive λ₂ is a bottleneck, not an isolated point — which is exactly how the instrument reports it.

## 2. Where it goes in the flow

```
baseline map  ──►  positive control  ──►  axis trial  ──►  RAYLEIGH READING (new)  ──►  cycles (preview + placement)
                                                              │
                                                              ├─ graph: components / isolates (exact), λ₂(largest) + rational Rayleigh–Ritz witness, null tails
                                                              └─ frame: Ky Fan gap of the frozen axes on THIS corpus (0 on the baseline; grows with drift)
```

- **Per baseline (and per chained after-map):** `POST /api/map/rayleigh {map_id, K?, null_seed?}` files the reading next to the control and axis trial. `map.rayleigh_frame` is attached to every `/api/map` response automatically (the Ky Fan gap needs the embeddings, which are only present at map time).
- **What it answers that nothing else did:** (a) is the "isolated" count the whole story, or is the rest of the graph one connected blob vs. several islands (components); (b) how tightly connected is the giant component (λ₂), against a margin-preserving null; (c) how much variance does the frozen frame no longer see on a corpus that has grown (Ky Fan gap) — the honest signal for "this chain has drifted far enough that a new baseline is warranted", which until now was a judgment call.
- **What it never does:** enter rung ranking, change the radius, admit a coordinate, or authorize keep/revert. `admitted:false` is hard-coded; tails are exclusion-only at K draws.

## 3. What shipped

**API (`tools/point-map/lib/rayleigh.mjs`, route `POST /api/map/rayleigh`, field `map.rayleigh_frame`).**
- `exact`: components (BFS), isolates, sorted component sizes, `quad(const)=0` check, nullity identity stated.
- `largest_component`: Fiedler λ₂ by power iteration on (2d_max+1)I−L restricted to 1ᵀ, its sign split, the **exact rational Rayleigh–Ritz witness** R = n·cut/(|S|(n−|S|)) of the sign cut, and `bound_holds` (λ₂ ≤ witness) as a runtime check on the float.
- `null`: K fixed-margin checkerboard draws on the bit matrix (same chain as V2's null), margins certified, mean/sd/min/max and plus-one two-sided tails for components, isolates, largest-component size, λ₂, edges; exclusion-only verdicts at resolution 1/(K+1).
- `frame_gap` (`map.rayleigh_frame`): trace, Ritz value of the two frozen axes, top-2 eigen-sum estimate, gap and gap share, `ky_fan_bound_holds`, `frame_source` fresh/inherited.
- Rejected inputs: `weights, rank, admit, radius, radii, score, threshold, d, T, seed, frame, steps`.

**Lean (`papers/data/lean/RayleighBounds.lean`, core Lean 4.33.0, no Mathlib, no sorry; `rayleigh-scope.json`).** `quad_nonneg` (PSD), `quad_const` (constants in the kernel), `quad_shift`, `quad_scale`, `ind_sq_diff`, `quad_indicator` (xᵀLx of a 0/1 indicator = cut size), `cut_singleton_untouched` + `quad_no_incident` (isolated vertex ⇒ kernel), `witness_numerator` (x = n·1_S − k·1 ⇒ xᵀLx = n²·cut), `witness_denominator` (k(n−k)²+(n−k)k² = n·k·(n−k)), and a `decide`d 8-path instance. Scope manifest lists the non-claims: nullity = #components, the float Fiedler value, Ky Fan itself, semantics, and the fluid equations are **not** proved.

**CI (`lean-check.yml`).** New `check` steps compile RayleighBounds, assert no sorry, validate the scope manifest and the printed-axiom set; `verify-tools` now also runs `test-limits`, `test-control-outcomes`, `test-axis-consistency`, `test-placement`, `test-rayleigh` (the five suites added since 2026-09-17 had not been in CI).

## 4. Honesty boundary

- λ₂ is a float estimate; the exact objects are the integer component/isolate counts and the rational witness. A `bound_holds:false` would indict the float, not Rayleigh–Ritz.
- The Ky Fan gap is a frame-adequacy reading. A large gap says the frozen axes explain less of the current corpus; it does not say the corpus improved or worsened, and it does not refit anything.
- The null for the graph statistics randomizes bit margins, not content; the same caveats as V2's null apply (K=40 resolves nothing below 1/41; finite mixing not established).
- No Rayleigh stability, Rayleigh–Plesset or damping term is used; recorded physics negatives (GL, Navier–Stokes, Landau radius) stand.
