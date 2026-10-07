# CROSS-PARITY RECORD: centroid-walk round (2026-10-06)

Verifier: main-session orchestrator, after Lane D (Python) + Lane E (JS) + the P3 metric patch.

## Delaunay edge parity (exact)

| Point set | n points | n edges | JS vs Python edges |
|---|---|---|---|
| c2 (merged-gasket vertex set, level 6) | 366 | 999 | EXACT (byte-identical, order included) |
| c4 (128×128 square grid, spacing 48) | 16384 | 48641 | EXACT |
| c1 (hex-74 triangular lattice, spacing 48) | 16651 | 49506 | EXACT |

Point-set regeneration verified independently: regenerated c1/c4 point arrays sha256-match Lane D's fixture hashes (cfb88ef5…, 48bc1174…).

## Walk parity (same seed, same graph)

Setup: c1 hex lattice graph, 4096 walkers, seed 42, start rule 'spread', pinned ladder (K=4).

- Walker-0 first-40 trace: EXACT (node-identical) — PRNG streams and step rule agree.
- **Seam found and fixed (P3)**: the JS `randomWalks` measured MSD in BFS hop distance while the Python source of record (`_walk_measurements`) uses Euclidean distance on the graph's coordinates (and requires them). For any graph with non-uniform edge lengths — which every Delaunay graph is — hop-vs-Euclidean changes d_w materially (measured: hop 2.0268 vs Euclidean 2.0314 on c1; the c1 hop fit reads 2.154 per Lane D's fixtures). **Fix applied to the canonical `jev-spectral-math.js`**: `randomWalks` now measures MSD in Euclidean distance when the graph carries `coords` (Python-parity accumulation `dx*dx + dy*dy`, no sqrt), hop distance otherwise; the output carries `msd_metric` so callers know which was used.
- Post-fix, same-seed same-graph: **d_w JS 2.0313537318442743 vs Python 2.0313537318442743 — delta exactly 0.0; msd worst relative delta 0.0 (bit-exact)**; r² 0.999795135910743 both.

## Earlier false alarms (documented so nobody re-chases them)

1. "Walk starts mismatch": the JS `randomWalks` output does not expose a `starts` key (Python does) — the cross-check script compared `undefined` to an array. Not a divergence.
2. "d_w delta 1.78e-2": seed mismatch in the comparison (JS seed 42 vs Lane D's walk_spread recorded at base_seed 3206731218, the sha-derived canonical seed). Same-seed comparison closes to 0.0.
3. Lane E's schema-tolerant Lane D verifier initially ran 0 comparisons: (a) its key list lacked Lane D's `picked_points`/`picked_edges`, and (b) its `collectEntries` never pushed dict-shaped fixture groups as entries. Both patched; the c2 edge comparison now runs in the test suite.

## Harness/anchor status for this round

Centroid golds C1–C5 live in `centroid_walk.py --selftest` (46 checks, 0 failures) rather than the main harness this round; harness-row integration is a listed follow-up (P-C1).
