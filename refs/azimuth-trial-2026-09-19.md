> Validated 2026-09-20: re-run against main `8e07c44d` reproduces every number below. Advisor corrections applied: the apparent m=1 exclusion at K=40 was a multiplicity artifact (7 statistics, family-wise error ~7/41; with Holm over the two-sided family no default statistic is excluded at any K); m=1 is excluded a priori on centering grounds (PCA scores are mean-centered, so the radius-weighted first moment is identically zero; unweighted Z₁ measures radial/multiplicity reweighting); the dedup null sizes never match the observed 167 (support 209..245 over 2000 draws), so the deduplicated comparison is descriptive; the continuous column-shuffle null is over-strong (destroys inter-column covariance) and cannot support a negative corpus claim.

# Azimuth channel: what actually killed it, and the one path with prior evidence

Date: 2026-09-19. Family: instrument trial record. Corpus: the real 301×24 fixture (`tools/point-map/data/real-cloud-reduced24-2026-09-06.json`), d=9, threshold median, seed 20260906. Scripts: `azimuth-trial-rayleigh.cjs`, `azimuth-trial-dedup.cjs`, `azimuth-trial-continuous.cjs`. Nothing persisted; no frame, bit, radius, ranking or ledger semantics touched.

> **Re-read 2026-09-26 (power floor: commits `abb8cfdd`, `a032aee2`).** Every `not-excluded` verdict quoted in this record was measured at K=40 (binary, Result 1) or K≤200 (the m=1 K=200 check and the continuous trial), where the smallest Holm-adjusted p the family can emit is |family|·2/(K+1): about 0.29 at K=40 and 0.0597 at K=200, both above α = 0.05. Formally those verdicts are `unresolvable-at-this-K`, not `not-excluded-after-holm`: statements about power, not about the corpus. Two consequences. (1) §4's "No angular structure at the identity chart, with atomicity fully removed" is a power statement, not a null result; that agrees with §5's own finding that the chart cause went untested here, so the record's decision stands for the right reason. (2) What survives unchanged is everything that never leaned on a not-exclusion: the m=1 structural confound (centering), the atomicity finding (a false m=1 positive carried by duplicate rows), the dedup-size mismatch (167 outside the null support), and the sector-index retirement. Default K is now 240, so trials at the default are resolvable; `placement_eigengap` now quantifies why the continuous null is wide.

## 0. A correction to the prompt-geometry analysis

That analysis called the azimuthal channel a "dead channel" and cited the papers' burial of the three-fold narrative as the reason. **That conflated two different constructions.**

The papers' azimuth is the Fibonacci lattice: `φᵢ = 2πi/φ_g`, where `i` is the PC1 rank. Azimuth there is *assigned from the index*, which is why Remark 1 says "power at cos(3φ) is a property of the index map until an ordering-permutation null says otherwise," and why the 500-shuffle null found m=3 shares *below* their nulls.

The point map's azimuth is not that object. `sectorIndex = atan2(y, x)` on `lift(proj(z(bits)))` — the two placement-PCA scores. It is a data-derived 2-D coordinate with no index in it. The papers' ordering-permutation result does not transfer, and the point map's own azimuth **had never been tested against a matched null.** So it was not established dead; it was untested. The trial below tests it.

## 1. The statistic

Bin-free and rotation-invariant, because the sector index is neither. A global rotation of the placement plane multiplies `Σⱼ exp(imφⱼ)` by `e^{imα}`, leaving the modulus unchanged; an axis sign flip conjugates it, also leaving the modulus unchanged. So

```
Rayleigh Z_m = N · |(1/N) Σⱼ exp(i m φⱼ)|²        m = 1,2,3,4,6,12
largest angular gap                                (also rotation-invariant)
```

is gauge-free, where "sector 7" is not. Reported against the empirical null with a plus-one tail and no Gaussian translation, per the existing house rule for Rayleigh Z.

Null draws are **refit**: each null bit matrix gets its own placement PCA2. Placing null draws through the frame fitted on the real data would be the in-sample `R² = 1.0000` trap — the frame would advantage the real corpus by construction.

## 2. Result 1 — an apparent m=1 exclusion, at K=40

Fixed-margin (checkerboard-switch) null, margins verified preserved, K=40, two independent seeds:

| m | obs Z | null med | null max | tail (a) | tail (b) | verdict |
|---|---|---|---|---|---|---|
| **1** | **0.711** | 0.094 | 0.581 | **0.0244** | **0.0244** | **excluded, both seeds** |
| 2 | 1.720 | 0.446 | 3.750 | 0.0732 | 0.0732 | not-excluded |
| 3 | 0.410 | 0.517 | 4.698 | 0.5854 | 0.6585 | not-excluded |
| 4 | 1.711 | 1.062 | 5.665 | 0.3415 | 0.3659 | not-excluded |
| 6 | 2.252 | 0.953 | 9.419 | 0.3171 | 0.2683 | not-excluded |
| 12 | 5.632 | 1.328 | 8.766 | 0.0976 | 0.1463 | not-excluded |

m=1 exceeded all 40 draws under both seeds — tail pinned at the 1/41 resolution floor. Seed-reproducible, which is lesson 30's criterion. Two side notes worth keeping: **m=3 is the least extreme mode in the table**, independently consistent with the papers' burial of the three-fold narrative; and **m=12 is not excluded**, so the instrument's own choice of twelve sectors has no angular basis in the data.

## 3. Result 2 — the m=1 exclusion is atomicity, not angle

301 documents occupy **167 distinct 9-bit patterns** (44.5% collision). Azimuth is a function of the pattern alone, so the angular distribution is a set of heavy point masses with large multiplicities — exactly the mechanism curved-corpus §5.3 names: *"only 176 distinct rows of 512 possible, so the point cloud is a set of heavy point masses."*

Re-running m=1 at K=200, with and without deduplication:

| variant | obs Z | null med | null max | tail (a) | tail (b) |
|---|---|---|---|---|---|
| all 301 rows | 0.711 | 0.119 | 0.746 | 0.0100 | 0.0199 |
| **deduplicated (167 distinct)** | **0.061** | 0.077 | 0.682 | **0.5572** | **0.6219** |

Deduplicated, the observed value falls **below the null median**. The signal is entirely carried by duplicate rows. At K=200 even the all-rows tail (0.0100 / 0.0199) is no longer at the resolution floor and straddles any threshold you would pick — a flip to report, not average.

**m=1 fails the membership condition.** It was measuring how many documents share a bit pattern.

## 4. Result 3 — removing atomicity does not revive it either

Two ways to remove the degeneracy:

**Raise d.** Collisions are a d=9 artifact:

| d | distinct of 301 | collision rate |
|---|---|---|
| 9 | 167 | 44.5% |
| 12 | 251 | 16.6% |
| 16 | 289 | 4.0% |
| 20 | 297 | 1.3% |
| 24 | 298 | 1.0% |

**Skip binarization.** Place on the continuous PCA scores directly: **300 distinct angles of 301**, atomicity gone. Matched null is then the independent per-column shuffle (the papers' named null for the continuous branch, since curveball requires a binary matrix). K=200, two seeds:

| m | obs Z | null med | null max | tail (a) | tail (b) | verdict |
|---|---|---|---|---|---|---|
| 1 | 0.330 | 0.131 | 1.761 | 0.2289 | 0.2438 | not-excluded, both |
| 2 | 0.821 | 0.451 | 3.206 | 0.2338 | 0.2438 | not-excluded, both |
| 3 | 1.556 | 0.663 | 7.639 | 0.2040 | 0.2537 | not-excluded, both |
| 4 | 1.571 | 0.645 | 7.581 | 0.2239 | 0.2090 | not-excluded, both |
| 6 | 0.809 | 0.731 | 6.017 | 0.4478 | 0.4328 | not-excluded, both |
| 12 | 0.120 | 0.815 | 3.714 | 0.8557 | 0.9204 | not-excluded, both |

Every mode sits above the null median for m=1..4 and nowhere near the null's range — nulls reach 5–10× the observed. **No angular structure at the identity chart, with atomicity fully removed.**

## 5. What this leaves standing

Three candidate causes of death; the trial rules out two.

| Cause | Status |
|---|---|
| Index-assignment (the papers' burial) | **Does not apply.** Different construction. |
| Atomicity / duplicate patterns | **Real, and it manufactured a false m=1 positive** — but removing it does not produce a signal. |
| **The chart** | **Untested here, and the only one with prior positive evidence.** |

Every measurement above is at the **identity Möbius chart** — which is precisely the regime curved-corpus v2 §8 measures as blind. On the real corpus at the identity chart the ℓ=3 energy share sits *below* its null (J = −1.51, share 0.031 vs 0.074 ± 0.028) — the same pattern reproduced above. Under an optimized loxodromic chart the same corpus reaches 0.408 vs a collapsed null 0.0345 ± 0.0030, **ΔJ = +126.1**, against a *selection* null (optimize a lens for each of 10 curveball draws) of median +5.1, max +25.5 — roughly 4.9× the strongest control. The paper's own conclusion: *"admission is chart-dependent — the coordinate that fails under the frozen chart is precisely what the powered lens separates."*

And Y₃³ ∝ sin³θ·cos(3φ) is the azimuthal member of ℓ=3. The lens surfacing ℓ=3 structure **is** the azimuthal channel reviving, in the paper's own data.

## 6. Reignition paths, ordered

**1. Powered lens (the live one).** Fit the Möbius chart `φ_θ ∈ PSL(2,ℂ)` — six real DOF — and measure the rotation-invariant azimuthal statistics under it. Non-negotiable: the null must be a **selection null**, optimizing a lens for each null draw; otherwise you measure the optimizer's capacity, not the corpus. Two guards the paper already found: the optimizer converges onto the anti-caustic boundary (condition number 997.8 against a 10³ cap, 155/471 evaluations guard-rejected), and J(t) along the canonical flow is perfectly monotone (Spearman ρ = 1.0) with the guard failing at t = 1.05 — so the procedure is "sail toward the caustic at constant heading, stop at the rim," and the stopping rule must be declared before the run, not chosen from the result.

**2. Continuous placement as a second coordinate.** Keep bits for the ladder, the Hamming metric and the curveball null; add `toS2_continuous` for angle only. It removes atomicity for free (300/301 distinct) and it is a precondition for (1) being interpretable — a lens fitted to 167 point masses is fitting multiplicities.

**3. Krawtchouk spectrum — the "measure the real object" option.** curved-corpus v2 §10(iv): a {0,1}⁹ corpus decomposes *exactly* over the Hamming scheme H(9,2), Laplacian eigenvalue 2j at weight j, multiplicity C(9,j), Krawtchouk polynomials in Legendre's role; the sphere is "its continuum idealization." Azimuth is a lossy shadow of a Krawtchouk-mode pattern on the hypercube. That spectrum is exact, finite, chart-free, gauge-free, needs no binning, and the fixed-margin null runs on it directly. If the aim is angular structure *used well* rather than azimuth specifically, this is the defensible target.

**4. Cross-cutting, do regardless: retire the sector index as a statistic.** It is not rotation-invariant, its origin and width are arbitrary, and m=12 is the least-excluded mode in the table above. Replace every corpus-level angular readout with Rayleigh Z_m, the angular gap spectrum and circular variance. Keep sector numbers only as an opaque display label, as now.

**5. The use that needs no admission at all.** Angular adjacency as a *retrieval* structure — "these documents are neighbours on the placement plane" — is a statement about the chart, not about the corpus, so the membership condition does not bind it. That is legitimately usable in rung prompts today, and the prompt-geometry change already does the bit-space version of it via Hamming distance. The admission machinery binds claims about the corpus; it does not bind a lookup.

## 7. What this record does not claim

Counts and empirical tails only, with n and the resolution `1/(K+1)`; no rates, no Gaussian translation. K=40 cannot resolve below 1/41 and K=200 below 1/201. The m=1 flip between thresholds at K=200 is reported, not averaged. One corpus, one frame, one instrument — a different corpus is a different instrument reading, not a benchmark. No admitted coordinate, ranking term, radius change or keep/revert rule follows from any of it, and `admitted:false` stands for every azimuthal statistic named here.