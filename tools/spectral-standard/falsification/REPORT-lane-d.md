# Lane D report — centroid-walk-v1 (Python source of record extension)

Date: 2026-10-06. Lane: centroid-walk build round, Lane D.
Deliverables (this directory, no repo pushes, no API calls):

- `centroid_walk.py` — pure stdlib, deterministic, no env access. sha256
  `ec7e8db9332529a9e800eacb98826be651d93562ca775e6f0426fcb63e7f2265`.
- `fixtures_centroid.json` — Lane E parity fixtures. sha256
  `8a252ae664133d7f80a71d7cdf2af08114a27c8c892fd8f48b154bce97cf584a`.
- `probe1.py` … `probe5.py` — the disclosed diagnostic sequence behind the
  amendments below (feasibility probes, not part of the instrument).

Selftest: `python3 centroid_walk.py --selftest` → **46 checks, 0 failures,
exit 0** (~2.5 min; the two 16k-node gold Delaunay runs dominate). Fixture
emitter: `--fixtures <path>`.

## Reuse discipline (kept)

`centroid_walk.py` imports `spectral_standard` by path and calls **verbatim**:
`mulberry32` PRNG, `run_walks` (streams, step rule, start rules), `_regress`,
`_walk_measurements` (Euclidean MSD + return-probability fitting),
`_graph_digest`/run_id convention, `graph_from_edges` semantics, and the
gasket builder for C2/C5. Nothing walking was reimplemented. The only new
measurement code is the BFS hop-distance fit (kept as a diagnostic) and the
Delaunay/component layers.

## C1–C5 measured values (pre-registered bands, all hard gates PASS)

| Gold | Configuration | Value | Band | Verdict |
|---|---|---|---|---|
| C1 | hex-74 triangular lattice (N=16651, spacing 48), Euclidean MSD, 'spread', W=4096, derived seed 3206731218 | **d_w = 2.04458, r² = 0.9998** | [1.90, 2.10] | **PASS** |
| C2 | merged-gasket vertex set, **level 6 picked** (366 pts), Delaunay, same config | **d_w = 2.70487, r² = 0.9931** | ≥ d_w(lattice) + 0.15 → ≥ 2.19458 | **GATE PASS** |
| C3 | 19-pt jitter lattice, seeds 42/2026/99 (mulberry32, ±15 px, min sep 40, sequential rejection) | d_w = 448.49 / 149.20 / 234.90 (r² 0.16 / 0.85 / 0.26) | reported only | recorded (saturated — see below) |
| C4 | 128×128 square grid (N=16384, spacing 48), same config, derived seed 2042749639 | **d_w = 2.07897, r² = 0.9997** | [1.90, 2.10] | **PASS** |
| C5 | ink mode via `ss.measure_walk_graph`, merged gasket **builder L7 (V=1095)** | **d_w = 2.37781, r² = 0.9822** | [2.22193, 2.42193] | **PASS** |

Reported diagnostics: 19-pt lattice d_w meaningless (r² 0.11, saturated — the
documented AM-6 finding reproduced); 8×8 grid d_w 14.23 (r² 0.59, saturated);
C2 levels 4/5: d_w 17.06 (r² 0.65) / 4.52 (r² 0.92); C2 builder-L6 ink
diagnostic 3.08025 (r² 0.9668, AM-2's documented pre-asymptotic finding);
hop-metric fits: C1 2.15422, C4 2.21737 (diagnostic only, see AM-D1);
64-walker canonical draws: C1 2.16069, C4 2.25095 (diagnostic, see AM-D2).

## C2 level pick and why

Levels 4/5/6 checked per the brief. Rule (stated a-priori, in
`pick_c2_level`): candidates ≥ 100 points → {5, 6}; prefer the smallest with
walk plateau ≥ 512 (a-priori roll-off, AM-2 logic) — **none qualifies**
(plateaus 41.2 / 115.0; the Delaunay shortcut edges shrink the graph, CF-2's
predicted geometry); then the smallest passing the pre-registered relative
gate at r² ≥ 0.98 — L6 passes (2.70487, r² 0.9931), L5 fails on r² (0.9159).
**Picked level 6 (366 points).** Gate verdict GATE PASS, recorded in both the
selftest and fixtures. Note the roll-off caveat is carried in the rule string.

## Deviations (all logged amendments, a-priori reasoning in the module header)

1. **AM-D1 (metric)** — pre-registration says "BFS hop distance for MSD on
   graphs", but its own C1 closed form ("planar-lattice walk dimension is
   exactly 2") is exact only in the **Euclidean** metric: the hop metric's
   free-lattice asymptote is d_w ≈ 1.89 (probe3 measured hop-MSD slope ≈ 1.06
   on the pure triangular lattice), which would place even an infinite
   lattice OUTSIDE the pre-registered [1.90, 2.10] band. Euclidean-over-the-
   embedding is also exactly `spectral_standard._walk_measurements` (the
   canonical machinery the task says to reuse verbatim), and the harness
   adapter's hop rule applies only when `coords is None` (centroid mode always
   has coords). Primary = Euclidean; hop fit retained and reported
   (`d_w_hop`, computed on a 64-walker sub-run with the same base seed, since
   per-walker BFS is O(W·N) and 4096 BFS runs on a 16k-node graph is
   infeasible).
2. **AM-C1 / AM-C4 (gold point-set size)** — the pre-registered 19-point
   lattice (diameter 4 hops) and 8×8 grid (diameter 14) cannot resolve d_w
   under the pinned K=4 ladder [16..256]: saturation by the bottom rung
   (already documented as falsification AM-6 for the identical tri contact
   graph). Re-pinned by the corpus's OWN pre-registered finite-size window
   requirement (harness AM-3b: "t_hi/N ≤ 1/64", under which the 128×128 row-5
   patch measured IN BAND): N ≥ 64·256 = 16384. Selected in code:
   C1 = smallest hex patch with N ≥ 16384 → radius 74, N=16651 (r=73 gives
   16207); C4 = 128×128 (N=16384, the same patch row5 anchored). **Bands
   [1.90, 2.10] unchanged.** The 19-pt/8×8 sets remain as reported
   diagnostics; C3 (19 pts) stays REPORTED-only per the pre-registration.
3. **AM-D2 (walker count for the synthetic d_w golds)** — the pre-registered
   "64 walkers (the anchored graph-mode walker count)" is a seed roulette on
   diffusive MSD fits: per-walker d² is exponential-scale (std/mean ≈ 1), so
   the 64-walker mean carries a correlated per-rung error with measured
   seed-to-seed spread σ_α ≈ 0.095 (disclosed probes: hex74/g128 64-walker
   draws spanned d_w 1.85–2.34 across seeds). A-priori precision criterion
   (AM-3 precedent): σ_α ≤ ¼ of the band's α half-width (0.05/4 = 0.0125)
   → W ≥ 64·(0.095/0.0125)² ≈ 3700 → **W = 4096 pinned for C1–C4 gold runs**;
   module default stays 64 (image path); 64-walker canonical draws reported
   as diagnostics. Estimator stability at W=4096 is selftest-checked
   (|Δd_w| < 0.02 across seeds 1/2).
4. **AM-C5 (numbering disambiguation)** — "merged-gasket graph level 6" is
   the canonical falsification-harness numbering of AM-2: canonical level 6
   = V=1095 = `sierpinski_gasket_graph(7)`. Builder L6 (V=366) measures
   3.08 @ r² 0.967 (the documented AM-2 pre-asymptotic finding) and cannot
   satisfy the anchored band. Anchored graph and band unchanged.
5. **C3 PRNG** — the v3 design (`gen_v3_jitter`) uses `random.Random`; the
   task contract pins spectral_standard's mulberry32. Structure mirrored
   exactly (sequential per-point ±15, min sep 40, 200 attempts, base-point
   fallback); PRNG swapped per contract.
6. **Collinear degeneracy** — Bowyer-Watson cannot triangulate fully
   collinear sets; the exact Delaunay degeneracy (sorted-order path, where
   consecutive sorted points are provably Delaunay neighbors even across
   gaps) is the documented fallback, logged in `degenerate_events`.
7. **Start rules** — NO deviation: synthetic explicit-graph golds use the
   canonical 'spread' (AM-2 rule), image path defaults to 'first' (mask
   rule), per the canonical split. The spread-start boundary-layer bias seen
   in probe3 is a finite-size effect that the AM-3b size eliminates
   (probe4/probe5: at N≈16k, spread @4096 walkers reads 2.034/2.031).

## Delaunay implementation notes (CF-1)

Adjacency-based Bowyer-Watson (Lawson walk from the last-created triangle,
cavity flood over in-circumcircle closure, boundary retriangulation with
neighbor rewiring), replacing the O(N²) scan (which would be ~7 min per gold;
the fast path runs the 16651-point gold in well under a minute). Determinism:
9-decimal dedup (logged), 1e-9-relative circumcircle tolerance
(eps = 1e-9 × determinant permanent), ties → inside (keeps the cavity
star-shaped), and a heap-worklist legalization pass that flips every
cocircular quad to the lexicographically smallest diagonal (9-decimal
coordinate edge key) — every tie and flip counted in `degenerate_events`.
Cross-validated against a naive reference implementation on small sets
(identical edge lists). Note: the triangular lattice has NO cocircular
legality ties (rhombi are not cyclic) — ties=0 on hex sets is correct; the
square grid does fire them (ties=9 on 4×4). The disconnected-guard (largest
component walk + n_components) is implemented and tested on a hand-built
disconnected graph; real 2D Delaunay graphs are always connected (the
triangulation covers the convex hull), so the guard is defensive.

## Fixtures (Lane E contract)

`fixtures_centroid.json` (~3.1 MB): meta (metric/amendment documentation),
C1 (hex74: generator spec + points_head + points sha256 + full 49506-edge
list + sha256 + walk values), C4 (grid128, same shape), C2 (levels 4/5/6
stats + picked level 6 full points+edges + gate), C3 (3 jittered point sets),
C5 (anchored values), small diagnostics (hex19, 8×8, tiny square, collinear
fallback), and the seed-42 C1 walk trace (base_seed=42, 4096 starts, walker 0
positions t=0..40). Edge-list sha256 pins: c1
`42d457734dab7339…`, c4 `bbf75be3d4db9ed4…` — Lane E must reproduce these
byte-exactly (JS mulberry32 + Delaunay + walk parity).
