# Drop-top-axes control and the resolution ceiling

Companion note to paper 4, 2026-11-10. All maps were built with the repository `pointmap.js` and scored with `jev-focal-point.js` (K = 20 null draws per seed, 100·n trades).

## 1. Drop-axes-1–2 ("all-but-the-top") control

Following Mu & Viswanath (arXiv:1702.01417), the top k principal directions are projected out of the inputs before re-mapping at d = 9 − k.

- **#598:** uses its recovered 0/1 inputs; the k = 0 row reproduces the stored map.
- **#595 and #596:** their 768-D vectors are not stored, so the test runs on the 9 frozen-frame scores recovered from the margins. Their k = 0 rows re-map those scores and give 104 and 44 classes, against the stored 108 and 45, so they are the like-for-like baselines for those maps.

| map | k dropped | d | classes | n\* | null n\* | focal verdict | V₂ | V₂ null z | isolated | N(0.095) served/RMS/best |
|---|---|---|---|---|---|---|---|---|---|---|
| #598 | 0 | 9 | 116 | 7 | 9 | corpus-specific | 0.396 | 70.36 | 2 | 75/79/80 |
| #598 | 1 | 8 | 103 | 6 | 8 | corpus-specific | 0.375 | 54 | 1 | 87/88/90 |
| #598 | 2 | 7 | 85 | 7 | 7 | not-separable-from-null | 0.411 | 37.68 | 0 | 75/76/78 |
| #598 | 3 | 6 | 58 | 6 | 6 | not-separable-from-null | 0.430 | 28.85 | 0 | 52/53/54 |
| #595 | 0 | 9 | 104 | 7 | 6,7 | not-separable-from-null | 0.297 | 0.02 | 45 | 83/87/87 |
| #595 | 1 | 8 | 89 | 6 | 6,7 | not-separable-from-null | 0.332 | 0.55 | 27 | 70/78/78 |
| #595 | 2 | 7 | 73 | 6 | 6,7 | not-separable-from-null | 0.375 | 1.06 | 13 | 50/57/57 |
| #595 | 3 | 6 | 52 | 6 | 6 | not-separable-from-null | 0.418 | 1.26 | 11 | 51/52/52 |
| #596 | 0 | 9 | 44 | 5 | 5,6 | not-separable-from-null | 0.344 | -0.22 | 23 | 35/38/39 |
| #596 | 1 | 8 | 41 | 5 | 5,6 | not-separable-from-null | 0.383 | 0.56 | 22 | 34/35/35 |
| #596 | 2 | 7 | 38 | 5 | 5,6 | not-separable-from-null | 0.417 | 0.29 | 30 | 38/38/38 |
| #596 | 3 | 6 | 31 | 5 | 5,6 | not-separable-from-null | 0.471 | 0.98 | 11 | 27/27/28 |

**Reading.**

1. **Dropping the top axes removes discriminative information on all three maps.** Classes fall monotonically: #598 116 → 103 → 85 → 58; #595 104 → 89 → 73 → 52; #596 44 → 41 → 38 → 31. The anisotropy premise, that the top components are a shared, uninformative direction, does not hold here. On #598 the top-2 variance share is 0.34, against 2/9 ≈ 0.22 for an isotropic spectrum: mild anisotropy only.
2. **The V₂ concentration finding survives.** On #598 the null z stays far above zero (70.4 → 54.0 → 37.7 → 28.9). On #595 and #596 it stays near zero, so those verdicts are unchanged.
3. **The ½-bit knee depends on axis order, which the paper should state.** After dropping axes 1–2 on #598, the two near-saturated components, formerly axes 8–9, are the last two of 7. They now add 0.765 and 0.737 bits, against 0.266 and 0.288 at full dimension, and n\* becomes d (verdict "not separable" because the null fills all 7 axes too). A median split of a low-variance component that loads 0.98 on a near-constant primitive is decided by its small residual loadings on the other primitives. Measured: on those two components the median split puts 48.9% and 49.2% of items on the 1 side, though the dominant primitive is present in 98.7% and 99.8% of items. The bit agrees with that primitive only 47.6% and 49.0% of the time (chance), and the largest residual loading is 0.186. When fewer informative axes precede it, it re-encodes their information. The full-dimension result n\* = 7 stands, but it is a property of the prefix order (variance order), not of the two axes in isolation.
4. **Removing an axis can increase what the globe resolves.** On #598 with one axis removed, N(0.095) rises to 87/88/90 (served/RMS/best), against 75/79/80, even though there are fewer classes (103 < 116). The PCA-2 globe spreads fewer bit classes more evenly.

## 2. Can re-framing or zooming go past the input?

**Not with the same input. This is a theorem, not a tuning problem.** Every frame, rotation, threshold, lens power and zoom level assigns an item's class as a deterministic function of its input vector. `FocalBounds.distinctCount_map_le` (Lean-proved) gives distinctCount(map f X) ≤ distinctCount(X) for every f. Map #598 has 135 distinct inputs among 3,232 items, so 135 is a hard ceiling for any re-framing of those inputs.

What re-framing can do is reach the ceiling efficiently (map #598, one frame unless stated):

| frame | classes (of 135) |
|---|---|
| deployed pipeline (`pointmap.js`): median splits on PCA axes | 116 |
| same rule, local NumPy PCA (the code path of the rows below) | 114 |
| 1,000 random rotations, median splits | 93 / 106 / 120 (min / median / max) |
| ITQ rotation (Gong et al. 2013), median thresholds | 85–118 |
| ITQ rotation, sign (mean-zero) thresholds | 113–133 (best of 10 starts: 133) |
| zoom recursion, depth 3 | 133 |
| cube-aligned frame (identity rotation, threshold 0.5) | **135** |

The rows after the first are computed with a local NumPy PCA. It applies the same rule but its axis signs differ from `pointmap.js`, which matters on tied 0/1 scores: 114 instead of 116. Compare those rows against 114. The loss from 135 to 116 (114 locally) comes from misalignment between rotated PCA axes and the cube; ITQ was designed to fix exactly this. Median thresholds are part of the problem: with ITQ rotations they do worse than sign thresholds (at most 118 against 133). A single cube-aligned frame reaches the ceiling with no recursion.

**Going past the ceiling requires new information in the input.** Measured on #598:

| added input | distinct (pattern, added feature) | ceiling |
|---|---|---|
| none | 135 | 135 |
| top-level label (knowledge, skills, docs, ...) | 409 | 3,232 |
| directory path | 2710 | 3,232 |
| full label (document identity) | 3231 | 3,232 |
| 3 random tie-breaking bits ("dithering") | 881 / 861 (two seeds) | — |

- **Dithering** produces classes, but within tied cells the two seeds' partitions agree only at chance: mean adjusted Rand index 0.0 over 65 cells with ≥ 20 items. It is fabricated resolution, and the two-seed reproducibility check rejects it.
- **Labels and paths** raise the ceiling, but they mostly identify documents rather than describe them. The full label is unique to within one item, so it lifts the ceiling trivially and adds no geometry.
- **The meaningful route is a richer content representation of the same items.** Map #595 already embeds document texts with `bge-base` (768-D). Embedding #598's 3,232 documents the same way would raise the ceiling from 135 toward n = 3,232. The focal rule, lens and zoom recursion would then operate on real content: the ladder could run to log₂ 3,232 = 11.66 bits instead of 7.08. A second route is to extend the 9-primitive coverage code upstream: each new 0/1 primitive doubles the ceiling 2^D, up to n.

**Requirements for the re-embedding.** The source documents of `harness/experience-library` are not in this workspace (353 of 3,232 labels match a local file, mostly `README` collisions). They appear to live in the corpus the console reads through `repo-items` (e.g. `yubi-OS/knowledge`). Re-embedding needs either:

- the live `/api/jev/map/embed` route, which writes its KV embedding cache and needs the operator key again because this session's kernel was reset; or
- a local `bge-base` model, which needs network access to download its weights.

## Files

- `anisotropy_results.json` — the 12 runs above
- `ceiling_results.json` — re-framing, side-information and dithering counts
- `run_aniso.mjs` — runner
