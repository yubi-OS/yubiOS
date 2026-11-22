# rsi-descent

**Deliverable D2** -- the single-action atom (papers/learned-latent-curves-2026-08-06.tex, Lemma 1) shipped as a runnable primitive. Reads a binary coverage matrix and descends it by geodesic-only primitive flips toward the ideal pole on S^2 until a **local fixpoint** (no single flip improves the geodesic distance by more than epsilon). That fixpoint is generally **not** full coverage: on the real 2286x9 corpus the unconstrained 15-cycle descent stops at coverage **0.852** (see "What the real corpus does"). The run aborts loudly if the lift geometry, the pole alignment or a per-step audit fails.

## What this is

For each item (row) in a d-dimensional binary coverage matrix:
- Z-score the N x d matrix with an all-ones row appended, PCA top-2 (canonical eigenvector sign), stereographic lift to S^2.
- Compute geodesic gap d(f) = ||p - p*|| to the ideal pole p* (lift of the appended all-ones row), with p and p* **always read in the same PCA frame**. After a trial flip the matrix is re-fitted and the new point is measured against that re-fitted frame's own pole (never against a pole from another basis).
- Argmin over single missing-primitive flips: pick the one minimizing post-flip distance.
- Apply the flip if Delta = d_pre - d_post > epsilon; otherwise skip.
- Repeat per cycle until cycle-Delta falls below epsilon (fixpoint).

## What is checked at runtime (and what is not)

`papers/data/lean/CurvedCorpus.lean` proves `atom_delta_nonneg` (every atomic Delta >= 0), `corpus_sum_nonneg` and `cumulative_monotone`. Those statements are true **by construction**: the search starts from `best_d = d_pre`, so `delta = d_pre - min(d_pre, ...) >= 0` holds for any lift, even a random one. The script still asserts `delta >= -1e-12` (it catches an inverted comparison), but that assertion is **not** evidence that the geometry is right. Three checks that can fail carry that weight:

- **G1 lift geometry** -- `stereographic_lift` must return unit vectors (`| |p|^2 - 1 | <= 1e-9`) satisfying the exact inverse-stereographic identity `x1/(1-x3) = u`, `x2/(1-x3) = v` on every PCA score of the input and on fixed probe points. A random or mis-scaled lift aborts with `RuntimeError`.
- **G2 pole alignment** -- on a frozen (canonical-sign) PCA frame, at least 80% of the incomplete rows must have a 0->1 flip that strictly shortens the geodesic distance to the all-ones pole (`strict_improvements_count >= 0.80 * n_incomplete_rows`); the counts are reported under `gates.pole_alignment` (real corpus: 1294/1491 = 0.868). Violation aborts with `RuntimeError`.
- **G3 per-step audit** -- every accepted flip is re-measured with an independent route (covariance eigendecomposition plus a closed-form lift instead of SVD plus `stereographic_lift`); pre and post distances must agree to 1e-6 and the post distance must be strictly smaller. Mismatch aborts.

`--selftest` exercises all three, including negative controls (a garbage lift and a unit-norm-but-wrong lift must be rejected, an unreachable pole-alignment threshold must abort).

CI note: `.github/workflows/lean-check.yml` (outside this directory) still asserts only `cumulative_delta >= 0` and `0 < final_coverage <= 1`; both hold for any lift. The output now carries `gates.*`, `n_rows_incomplete_at_fixpoint` and `reached_full_coverage`, which that step should assert instead.

## Usage

```sh
python3 tools/rsi-descent/rsi_descent.py --input mydata.csv
python3 tools/rsi-descent/rsi_descent.py --input papers/is-this-x-2026-08-12-Final.zip --json
python3 tools/rsi-descent/rsi_descent.py --selftest
```

| flag | default | meaning |
| --- | --- | --- |
| `--input FILE` | (required) | CSV (rows of 0/1), JSON (2D array OR the repo's per_row_coverage_v3.json shape with `rows[*].covered`), or the in-repo evidence-bundle zip |
| `--epsilon` | `0.001` | Fixpoint threshold: cycle-Delta below this stops the loop |
| `--max-cycles` | `50` | Hard upper bound on cycles |
| `--seed` | `20260822` | Per-cycle item order |
| `--selftest` | | Run G1/G2 (positive and negative controls) and a 60x9 seeded descent with every accepted flip audited (G3) |
| `--json` | | Emit the report as JSON |

## What fixpoint means

Per the papers' own discipline, the atom is **designed dynamics**, not an equilibrium claim: there is no equilibrium ensemble in the historical log (zero backward transitions over 1,178 measurements). Fixpoint here = no single flip moves the corpus further toward the ideal pole by more than `epsilon`. It is the end of a bounded exchangeable coverage potential's descent, not a thermodynamic equilibrium.

## What the real corpus does (`papers/is-this-x-2026-08-12-Final.zip`, 2286 x 9, default seed)

- **Not full coverage.** The unconstrained descent reaches its fixpoint after **15 cycles** at final coverage **0.852** (cumulative Delta 1469.4; 409 rows still incomplete). This is a **local geodesic fixpoint**: for those rows no single-bit flip shortens the distance to the pole on the refit frame. A sample of 300 incomplete rows had **37/300** with no improving single flip; on a frozen frame 1294/1491 incomplete rows have one. `--max-cycles 1` stops at coverage 0.6552 (cumulative Delta 260.9).
- **Two different ladders; do not conflate them.** (a) The *theoretical isotropic shell ladder* in `papers/learned-latent-curves-2026-08-06.tex` (Delta by missing-count k = 1..9: 0.0904, 0.1003, 0.1098, 0.1175, 0.1206, 0.1158, 0.0989, 0.0678, 0.0242) is unimodal with its peak at **k = 5** and assumes Delta depends on k alone. (b) The *empirical PCA-weighted ladder* this tool measures (max accepted Delta per post-flip k, 1 cycle) runs **0.06 to 0.96** and peaks at **k = 6** (k = 1..9: 0.061, 0.133, 0.235, 0.401, 0.702, 0.958, 0.897, 0.683, 0.586). On the real corpus Delta is **not** a function of k alone: it varies with which row and which primitive are involved (within-k spread 0.03-0.15 for missing-count 1..8). The tool does not reproduce the paper's ladder and the paper's `k = 5` peak is not a property of this descent.

## Caveats

- Single-seed runs by default; re-run with `--seed` varied to see the per-k Delta ladder's robustness (the paper reports the ladder is identical across all three corpora, single-seed point estimates).
- The 9-bit basis is the paper's primitive basis for software-skill coverage. Other binary matrices with d != 9 are supported, but the isotropic-ladder peak at k = 5 is d = 9-specific. Inputs where fewer than 80% of incomplete rows have a pole-approaching flip on the frozen frame abort at G2.
- The pipeline (z-score -> PCA -> stereographic lift) follows the paper's protocol. The ideal pole is the lift of the all-ones vector projected through the same PCA basis as the point it is compared with (the earlier version mixed bases between p_i and p*); this matches the paper's `p* = sigma(u*, v*)` definition.