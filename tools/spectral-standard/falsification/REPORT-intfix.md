# INTEGRATION-FIX LANE REPORT — P1 + P2 for spectral-standard-v1 (2026-10-06)

Scope: apply the advisor's two Lane B follow-up patches in a scratch copy,
re-verify, report. **No repo was pushed and no API was called.** Lane
originals untouched; all patched artifacts live in
`session/subagent/intfix/`. No pinned parameter, band, or gold value changed
(walkers stay 64, seed 42, ladder [16,24,36,52,80,116,172,256], bands and
closed-form golds byte-identical).

## P1 — walk-stream rework (`jev-spectral-math.js`)

- `randomWalks` now gives each walker its OWN stream: walker i uses
  `mulberry32((base_seed + i) >>> 0)` — Lane A's canonical pinned scheme
  (`run_walks`: `mulberry32((base_seed + i) & _MASK32)`). The single shared
  sequential stream is gone.
- Added `opts.startRule` mirroring Python `start_rule`: `'first'` (default,
  start `i % n`, the mask/SPEC rule) and `'spread'` (start
  `floor((i * n) / walkers)`, the gold-graph rule); unknown rules throw.
  Step rule unchanged: one `rng()` draw per move, `floor(r*deg)`, deg-0
  consumes no draw, sorted adjacency.
- Header parity-contract comment + JSDoc rewritten to the new convention.
- **Regression held**: walker 0's stream IS `mulberry32(seed)`, so the seed-42
  single-walker replay is bit-identical before/after — verified two ways:
  (a) walker0 trace unchanged vs the pre-P1 fixture byte-for-byte, and (b)
  the advisor's merged-gasket L7 replay (1095 vtx, 257 positions) reproduced
  node-identical against Lane A's `run_walks` trace.
- Multi-walker traces: patched JS reproduces Lane A `run_walks` BIT-EXACTLY
  (all 64 walkers x 8 checkpoints + walker0 full trajectory) on all four
  fixture graphs.

## P1 — fixture regeneration (`spectral_fixtures.json`)

- All four walk fixtures regenerated (`gasket_pre_l3/l4/l5_walk_seed42`,
  `lattice_8x8_walk_seed42`): checkpoint_matrix, walker0_trace, msd,
  p_return, fitted dims, flags. `walk_params` unchanged (64 / 42 / k=4).
- **How regenerated**: node/python bridge in this folder —
  `lane_b_graphs.json` (Node exports the fixture graphs exactly as Lane B's
  builders produce them) → `lane_a_walks.py` (imports `spectral_standard.py`
  BY PATH, runs canonical `run_walks(base_seed=42, 64 walkers,
  start_rule='first')`, exports full trajectories) → `bridge_check.mjs`
  (Node diffs patched-JS traces against Lane A's, bit-exact, exits non-zero
  on any mismatch) → `node gen_fixtures.mjs` regenerates the pack with the
  patched module. Since bridge equality was proven first, regenerating from
  the patched JS IS regenerating from Lane A's actual outputs.
- Aggregate convention note: the fixture pack pins BFS GRAPH distance as the
  displacement metric (recorded in `pinning.decisions`, unchanged — a pinned
  Lane B decision, not touched per the no-gold-change rule). Lane A's native
  `_walk_measurements` uses Euclidean distance; both were computed in
  `cross_check.py` and reported (see Cross-check deltas).
- `pinning.decisions` walker-stream text and `generated_by` updated to the
  new convention + regeneration provenance. No numeric pinning field changed.

## P2 — `gasketIdentifiedGraph` fix (`jev-spectral-math.js`)

- The old implementation computed union-find merges but never applied them:
  it relabeled the UNMERGED 3m node ids and returned the raw edge list — the
  disjoint union of 3^L triangles (V=81, E=81, every vertex degree 2 at L3,
  disconnected).
- Rewritten to mirror Lane A's `sierpinski_gasket_graph` verbatim: vertices
  keyed by integer triangular-lattice coords (a,b), one SHARED node per
  junction, node ids in recursion first-appearance order (lower-left copy,
  then lower-right, then top). Level mapping matches Lane A EXACTLY with a
  one-level offset (documented in the docstring): JS `gasketIdentifiedGraph(L)`
  == Python `sierpinski_gasket_graph(L+1)`; V = (3^(L+1)+3)/2 → 3, 6, 15,
  42, 123; E = 3^(L+1). So L3 = **42 vertices / 81 edges** (previously
  labeled 81 vtx). Level range now 0..8 (Python 1..9 mirrored); edges
  deduped + canonically oriented like `_finish_graph`.
- Verified IDENTICAL to Lane A's builder: sorted edge list, adjacency (hence
  exact node ordering + neighbor order), degree sequence — bit-for-bit.
  Jacobi eigenvalues on the fixed graph vs Lane A `laplacian_eigenvalues`
  on `sierpinski_gasket_graph(4)`: max |delta| = 3.4e-14 (tol 1e-9 PASS);
  trace = 162 = 2E.
- Fixture `gasket_g3_identified_eigs` regenerated: graph {n:42, m_edges:81},
  jacobi trace_expected 162, 42 eigenvalues, d_s = 1.334812 (r² 0.9467,
  low_confidence true per the AM-5 staircase doctrine, band_pass true vs the
  unchanged band [1.295,1.435]). Gold band untouched.
- Test fix: the vacuous `assert.equal(g.n, f.graph.n)` (81==81) replaced by
  absolute assertions — V==42, E==81, connected, degree sequence
  [2,2,2, 4x39] matching Lane A's builder, corners distinct, adjacency
  sorted, fixture fields consistent. Added `P2 level ladder` test pinning
  V(L)=(3^(L+1)+3)/2 for L=0..4 and the error ranges.
- NOTE (out of my file set): Lane B's lane-b/REPORT.md still carries the
  stale "42 vtx G_3" claim for the unfixed build; the advisor's P2 list
  flags it for the PR body.

## New finding (Lane A-side, provenance-only code) — report upstream

Lane A's `sierpinski_triangle_graph` (the kept 3^level pre-gasket alternate,
NOT the gold builder) attaches its top-level join edges at MID-SIDE nodes at
levels >= 4, because it returns corners as `ib[1]` — the second *created
node* of the lower-right sub-copy, which is a corner only when that sub-copy
is a bare triangle. At L4 the joins 27-10 / 54-20 / 64-47 attach at lattice
coords (6,0), (0,6), (8,6) instead of the true corners (8,0), (0,8), (8,8)
that Lane B's `gasketPreGraph` correctly uses (L3 and below agree exactly).
No gold is affected — Lane A's walk gold uses the MERGED gasket L7, whose
coord-keyed builder is correct (verified bit-identical to my P2 port), and
the triangle graph is measured-disqualified provenance. Worth a note in the
PR body; I did not edit Lane A (originals stay untouched per lane rules).

## Test summary

`node --test test_parity_spectral.test.js`: **42/42 PASS, exit 0**
(original 38 + 4 new P1/P2 tests; zero failures, zero skips).
`bridge_check.mjs`: ALL CHECKS PASS (adjacency provenance, 4x bit-exact
trace diffs, L7 regression, walker0 regression, 6 P2 structural checks).
`cross_check.py`: walk + eigen cross-checks below.

## Cross-check deltas

Walk aggregates — Python (Lane A traces measured under the pack's PINNED
BFS-graph-distance convention, computed independently in the bridge) vs
regenerated JS fixtures:

| fixture | d_w delta | alpha delta | d_s delta | msd / p_return |
|---|---|---|---|---|
| gasket_pre_l3_walk_seed42 | 0.0 | 0.0 | 3.3e-16 | 0.0 |
| gasket_pre_l4_walk_seed42 | 1.2e-14 | 2.3e-15 | 4.0e-15 | 0.0 |
| gasket_pre_l5_walk_seed42 | 3.1e-15 | 1.0e-15 | 2.4e-15 | 0.0 |
| lattice_8x8_walk_seed42 | 2.0e-14 | 9.4e-16 | 3.3e-16 | 0.0 |

Worst delta 1.95e-14 — **PASS at the 1e-9 gate**. Walk traces themselves are
bit-exact (node ids), stronger than the 1e-9 ask.

Documented convention context (NOT a defect): Lane A's native Euclidean-metric
d_w differs from the pack's pinned BFS-graph d_w by 2.51 / 0.39 / 0.20 / 0.45
on the four fixture graphs (the pre-gasket contains zero-length corner edges,
so Euclidean msd is not the pinned metric there; the pinned decision is
recorded in `pinning.decisions` and was left untouched).

Identified-gasket eigenvalues (P2): Lane A Jacobi vs JS Jacobi on the fixed
42-vertex graph: **max |delta| = 3.4e-14, PASS at 1e-9**; sum = 162 = 2E.

## Final file paths (all under /var/workspace/session/subagent/intfix/)

Patched deliverables (land candidates post-P1+P2):
- `jev-spectral-math.js` — P1 randomWalks rework + P2 gasketIdentifiedGraph fix
- `spectral_fixtures.json` — regenerated (walk fixtures P1, identified-eigs P2)
- `gen_fixtures.mjs` — provenance text updated (stream convention + regen note)
- `test_parity_spectral.test.js` — strengthened P2 asserts + 4 new P1/P2 tests
- `package.json` — unchanged copy
- `REPORT-intfix.md` — this report

Bridge / evidence artifacts (scratch, not PR candidates):
- `spectral_standard.py` — unmodified Lane A copy, imported by path
- `lane_a_export.py` / `lane_a_export.json` — Lane A builders exported
- `lane_b_graphs.json` — fixture graphs as Lane B builds them
- `lane_a_walks.py` / `lane_a_walks.json` — canonical run_walks replay +
  independent BFS-convention measurements
- `bridge_check.mjs` — bit-exact trace + structural diff harness (exit 0)
- `cross_check.py` — formal delta report (exit 0)
- `js_identified_eigs.json` — JS Jacobi values on the fixed graph
