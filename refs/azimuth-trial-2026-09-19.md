# Azimuth channel: what actually killed it, and the one path with prior evidence

Date: 2026-09-19. Family: instrument trial record. Corpus: the real 301×24 fixture (`tools/point-map/data/real-cloud-reduced24-2026-09-06.json`), d=9, threshold median, seed 20260906. Scripts: `azimuth-trial-rayleigh.cjs`, `azimuth-trial-dedup.cjs`, `azimuth-trial-continuous.cjs`. Nothing persisted; no frame, bit, radius, ranking or ledger semantics touched.

> **Errata, 2026-09-26** (append-only; the body below is unchanged except where marked ✱).
> 1. **No multiplicity correction.** Every verdict here is an uncorrected one-sided plus-one tail across six modes. The m=1 "exclusion" in §2 would not survive a family correction, which strengthens its rejection. The shipped endpoint uses Holm; its verdicts and these are not the same rule.
> 2. **§3's dedup comparison is size-mismatched.** Observed Z was computed on 167 distinct rows; null draws dedup to 212–241 rows, with zero draws at 167. The module detects this (`size_matched:false`) and refuses to conclude from it. "The signal is entirely carried by duplicate rows" remains the right reading of m=1, but on the *structural* ground the module states — PCA centering makes Σrⱼe^{iφⱼ} ≡ 0, so unweighted Z₁ measures radius–angle coupling — not on this table.
> 3. **§4's continuous non-exclusions are low-power, not a null result.** The raw tails (0.20–0.92) are far from any threshold, but the per-column-shuffle null is wide because its refits land on near-degenerate eigenplanes. "No angular structure at the identity chart" should read "no detectable angular structure against a low-power null."
> 4. **✱ m=12 was mischaracterised.** On the *binary* placement (the one sectors are read from), Z₁₂ is the most extreme non-m=1 mode (obs 5.632 vs null median 1.328, tail 0.0976/0.1463) — not the weakest. It is only the least extreme on the *continuous* placement. Not excluded either way, but it is the binary mode to watch, and the likeliest source is the lattice of angles a 9-bit hypercube projects to, i.e. atomicity again.
> 5. **✱ Circular variance should not have been recommended.** Circular variance is 1 − R̄₁, the same structurally confounded m=1 quantity. The endpoint correctly lists it as permanently not admitted.
> 6. **Eigengap by variant.** Binary placement rel_gap_12 = 0.0686, at its fixed-margin null median (0.0692, plus-one lower tail 0.4975) — ordinary, not degenerate. Continuous (z-scored) rel_gap_12 = 0.0205 and rel_gap_23 = 0.0042, below the shuffle-null median 0.0631 (not below its minimum 0.0036). The continuous refit plane is itself nearly unstable, not just the rotation within it.

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

Fixed-margin (checkerboard-switch) null, margins verified preserved, K=40, two independent seeds, uncorrected one-sided tails:

| m | obs Z | null med | null max | tail (a) | tail (b) | verdict |
|---|---|---|---|---|---|---|
| **1** | **0.711** | 0.094 | 0.581 | **0.0244** | **0.0244** | **excluded, both seeds (uncorrected)** |
| 2 | 1.720 | 0.446 | 3.750 | 0.0732 | 0.0732 | not-excluded |
| 3 | 0.410 | 0.517 | 4.698 | 0.5854 | 0.6585 | not-excluded |
| 4 | 1.711 | 1.062 | 5.665 | 0.3415 | 0.3659 | not-excluded |
| 6 | 2.252 | 0.953 | 9.419 | 0.3171 | 0.2683 | not-excluded |
| 12 | 5.632 | 1.328 | 8.766 | 0.0976 | 0.1463 | not-excluded |

m=1 exceeded all 40 draws under both seeds — tail pinned at the 1/41 resolution floor. Two side notes: **m=3 is the least extreme mode in the table**, consistent with the papers' burial of the three-fold narrative; and ✱ **m=12 is the most extreme mode after m=1, yet not excluded** — see errata 4.

## 3. Result 2 — the m=1 exclusion is atomicity, not angle

301 documents occupy **167 distinct 9-bit patterns** (44.5% collision). Azimuth is a function of the pattern alone, so the angular distribution is a set of heavy point masses with large multiplicities — exactly the mechanism curved-corpus §5.3 names: *"only 176 distinct rows of 512 possible, so the point cloud is a set of heavy point masses."*

Re-running m=1 at K=200, with and without deduplication (✱ size-mismatched; see errata 2):

| variant | obs Z | null med | null max | tail (a) | tail (b) |
|---|---|---|---|---|---|
| all 301 rows | 0.711 | 0.119 | 0.746 | 0.0100 | 0.0199 |
| deduplicated (167 distinct) | 0.061 | 0.077 | 0.682 | 0.5572 | 0.6219 |

Deduplicated, the observed value falls below the null median. At K=200 the all-rows tail (0.0100 / 0.0199) is off the resolution floor and straddles any threshold — a flip to report, not average.

**m=1 fails the membership condition** — structurally, because centering forces the radius-weighted first moment to zero.

## 4. Result 3 — removing atomicity does not revive it either

**Raise d.** Collisions are a d=9 artifact:

| d | distinct of 301 | collision rate |
|---|---|---|
| 9 | 167 | 44.5% |
| 12 | 251 | 16.6% |
| 16 | 289 | 4.0% |
| 20 | 297 | 1.3% |
| 24 | 298 | 1.0% |

**Skip binarization.** Place on the continuous PCA scores directly: **300 distinct angles of 301**, atomicity gone. Matched null is the independent per-column shuffle. K=200, two seeds:

| m | obs Z | null med | null max | tail (a) | tail (b) | verdict |
|---|---|---|---|---|---|---|
| 1 | 0.330 | 0.131 | 1.761 | 0.2289 | 0.2438 | not-excluded, both |
| 2 | 0.821 | 0.451 | 3.206 | 0.2338 | 0.2438 | not-excluded, both |
| 3 | 1.556 | 0.663 | 7.639 | 0.2040 | 0.2537 | not-excluded, both |
| 4 | 1.571 | 0.645 | 7.581 | 0.2239 | 0.2090 | not-excluded, both |
| 6 | 0.809 | 0.731 | 6.017 | 0.4478 | 0.4328 | not-excluded, both |
| 12 | 0.120 | 0.815 | 3.714 | 0.8557 | 0.9204 | not-excluded, both |

✱ No *detectable* angular structure at the identity chart against this null, with atomicity removed. The null is wide (errata 3), so this is a low-power non-detection.

## 5. What this leaves standing

| Cause | Status |
|---|---|
| Index-assignment (the papers' burial) | **Does not apply.** Different construction. |
| Atomicity / duplicate patterns | **Real, and it manufactured a false m=1 positive.** Removing it does not produce a detectable signal. |
| **The chart** | **Untested here, and the only one with prior positive evidence.** |

Every measurement above is at the **identity Möbius chart** — the regime curved-corpus v2 §8 measures as blind: ℓ=3 share *below* its null (J = −1.51, 0.031 vs 0.074 ± 0.028). Under an optimized loxodromic chart the same corpus reaches 0.408 vs a collapsed null 0.0345 ± 0.0030, **ΔJ = +126.1**, against a selection null of median +5.1, max +25.5. *"Admission is chart-dependent — the coordinate that fails under the frozen chart is precisely what the powered lens separates."* Y₃³ ∝ sin³θ·cos(3φ) is the azimuthal member of ℓ=3.

## 6. Reignition paths, ordered

**1. Powered lens.** Fit `φ_θ ∈ PSL(2,ℂ)` (six real DOF) and measure the rotation-invariant statistics under it. The null must be a **selection null** optimizing a lens for each draw. Guards the paper found: convergence onto the anti-caustic boundary (condition 997.8 vs a 10³ cap, 155/471 guard-rejected); J(t) perfectly monotone with the guard failing at t = 1.05. The stopping rule is declared before the run.

**2. Continuous placement as a second coordinate.** Keep bits for the ladder, Hamming metric and curveball null; add `toS2_continuous` for angle only. A lens fitted to 167 point masses is fitting multiplicities. ✱ Note the continuous refit plane is nearly unstable on this fixture (rel_gap_23 = 0.0042), so a continuous chart needs an eigengap guard before any lens is fitted to it.

**3. Krawtchouk spectrum.** A {0,1}⁹ corpus decomposes exactly over H(9,2); azimuth is a lossy shadow of a Krawtchouk-mode pattern. Exact, finite, chart-free, gauge-free; the fixed-margin null runs on it directly.

**4. Retire the sector index as a statistic.** Not rotation-invariant; arbitrary origin and width. ✱ Replace corpus-level angular readouts with Rayleigh Z_m (m ≥ 2) and the angular gap spectrum — **not** circular variance (errata 5). Sector numbers stay opaque display labels.

**5. The use that needs no admission.** Angular adjacency as *retrieval* is a statement about the chart, not the corpus.

## 7. What this record does not claim

Counts and empirical tails only, with n and resolution `1/(K+1)`; no rates, no Gaussian translation; no multiplicity correction (errata 1). One corpus, one frame, one instrument. No admitted coordinate, ranking term, radius change or keep/revert rule follows, and `admitted:false` stands for every azimuthal statistic named here.