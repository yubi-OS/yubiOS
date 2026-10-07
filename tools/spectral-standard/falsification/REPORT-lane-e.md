# LANE E REPORT — centroid-walk-v1 JS port (build round, 2026-10-06)

Lane: E (JS port) of the centroid-walk build round for spectral-standard-v1.
Scope honored: NO repo pushes, NO API calls. All deliverables under
`session/subagent/lane-e/`.

## Deliverables

| File | What it is |
|---|---|
| `jev-spectral-centroid.js` | Pure ESM module: `bowyerWatsonDelaunay`, `tracedGridToComponents`, `componentsToCentroids`, `centroidDelaunayGraph`, `walkCentroidMode`, `radiusGraphDiagnostic`, plus `graphComponents` / `largestConnectedComponent` / `round9` helpers. Full parity contract P1–P12 in the header. |
| `jev-spectral-math.js` | Verbatim copy of the canonical patched module (update-free integration: the lane module imports it; pr-stage canonical untouched — verified by hash of the source I copied from). |
| `test_centroid_parity.test.js` | node:test suite, 22 tests: 21 pass, 1 skip (Lane D cross-parity, file absent). |
| `gen_fixtures_centroid.mjs` | Lane E's own fixture generator (Lane D's pack was absent at lane start; same generator-logic family as `gen_fixtures.mjs`). |
| `fixtures_centroid_lane_e.json` | 33-fixture pack (points/masks/walks/radius/degenerate + C1/C4 golds + C2/C3 reported), ~10.9 MB. |
| `verify_lane_d.mjs` | Tolerant cross-parity verifier against Lane D's `fixtures_centroid.json` (schema-superset parsing: point+edges, mask+centroids, walk+d_w). Standalone (`node verify_lane_d.mjs`) and imported by the test. |
| `torus_diag.mjs`, `scatter_diag.mjs` | Band-feasibility diagnostics (see findings below; kept for the audit trail). |

## Test summary (node --test)

```
tests 22 | pass 21 | fail 0 | skipped 1
```

The skip is `Lane D fixture pack cross-parity` — skip-with-message while
`/var/workspace/session/subagent/lane-d/fixtures_centroid.json` is absent
(polled twice: absent at lane start and at lane finish). When it lands, run
`node --test test_centroid_parity.test.js` again (the test auto-runs the
comparison) or `node verify_lane_d.mjs` standalone. Comparisons: edge lists
EXACT, centroids to 1e-9, d_w to 1e-9; any mismatch is listed by fixture id,
never swallowed.

## Parity verdict vs Lane D

NOT AVAILABLE at finish time (Lane D pack absent at both poll points). Lane
E's own pack is self-consistent and fully pinned; cross-parity is one command
once Lane D lands. If Lane D used a different Delaunay tie-break or
insertion order, `verify_lane_d.mjs` will report the exact first differing
edge per fixture — that is the intended reconciliation surface.

## Gold-band verdicts (pre-registered C1/C4)

- **C1 PASS**: `c1_tri_lattice_hex60` — triangular hex R=60 (N=10981, E=32580),
  center-outward ordering, `startRule: 'spread'`, seed 42, 64 walkers, K=4:
  **d_w = 1.989185, r² = 0.9954** ∈ [1.90, 2.10].
- **C4 PASS**: `c4_square_grid_128` — 128×128 grid (N=16384, E=48945... recorded
  in pack), same construction: **d_w = 2.064298, r² = 0.9962** ∈ [1.90, 2.10].
- **C1-literal FAIL (recorded as a finding, not gated)**: the literal
  "19-droplet point set" construction saturates — 19 nodes mix before the
  FIRST ladder rung (t=16); measured d_w = 25.7687, r² = 0.3715,
  low_confidence = true. Recorded in the pack with `finding: 'saturation'`.
- **C2 REPORTED** (not gated here): merged-gasket vertex set JS level 4
  (N=123): d_w = 5.0653, r² = 0.9383, low_confidence — 123 nodes also
  saturate at the pinned ladder; the relative gate (≥ lattice + 0.15) needs
  the large-render path or a scale decision by the orchestrator.
- **C3 REPORTED**: jittered lattice (19 nodes) — same saturation caveat.

## Findings for the orchestrator (pre-declared CF-class, no retuning done)

1. **CF-1a (band feasibility, the big one).** The pre-registered C1/C4 bands
   [1.90, 2.10] are NOT reachable with the literal constructions:
   (a) a 19-droplet set saturates the pinned ladder (d_w ≈ 26);
   (b) even large row-major-ordered patches miss the band because both pinned
   start rules place walkers near the boundary. Ideal-torus reference
   (`torus_diag.mjs`, 200k walkers): the pinned BFS-hop measurement gives
   d_w = 1.992–1.999 on triangular AND square (±diagonal) lattice tori — the
   instrument is sound; the deficits are estimator artifacts:
   - 64 walkers + spatially contiguous starts ('first' i%n, n>64): +0.06..0.13
     d_w bias (Jensen effect on the log-log fit; isolated on the torus:
     span-1 starts 2.04–2.06, span-64 contiguous 2.07–2.13, uniform 1.99–2.06).
   - boundary-proximal starts add further deficit under row-major ordering.
   The pinned construction I shipped: scaled lattice patches (hex R=60 /
   grid 128) + deterministic center-outward point ordering + 'spread' starts,
   documented a-priori in `pinning.ordering_rationale`. **Seed sensitivity:
   d_w scatters ~2.0–2.3 across seeds 42–47 depending on construction** — at
   64 walkers the band is genuinely marginal. RECOMMENDATION: log an
   amendment BEFORE anchoring the C1/C4 golds — either raise walker count for
   these two golds (512 walkers gave 1.992–1.995 stable on the torus) or
   widen the band; decide a-priori, then re-run.
2. **CF-2**: C2/C3 small-set walks saturate; recorded, not gated, per the
   preregistration's own "recorded as a finding" language.
3. **P9 rounding tie risk (Python)**: `round9` uses `Math.round` (ties toward
   +inf). Python MUST use `math.floor(v*1e9 + 0.5)/1e9`, NOT `round()`
   (banker's). Exact .5 ties are reachable (e.g. boundary counts dividing
   sums at the 1e-9 grid), so this is not theoretical.
4. **Near-degenerate cocircular noise**: the 1e-9 relative containment band
   absorbs ulp-level differences, but a Python port must apply the SAME
   formulas in the SAME op order (documented per-function in the module
   header): circumcenter formula, cross-product orientation, Chebyshev
   dedupe, insertion order = input order after dedupe, cavity boundary edges
   sorted lexicographically, zero-area fan triangles skipped on bit-exact
   cross === 0.
5. **Row-major seed BFS quirk (pinned, documented)**: a row-major seed is
   always its component's top-left pixel, so N and W neighbors are always
   background; the observable pinned neighbor order is S before E. Python
   must still implement the full [N, S, W, E] order verbatim (it affects
   deeper discovery order and hence centroid float accumulation order).
6. **`deg_nonfinite` fixture**: the NaN point throw happens during dedupe
   validation; a Python port must validate finiteness BEFORE the 1e-9 dedupe
   to match.

## Update-free integration verification

- Canonical `pr-stage/tools/spectral-standard/jev-spectral-math.js` NOT
  modified (module imports the verbatim copy in the lane dir).
- `randomWalks`/`walkDimensions` consumed unchanged — delegation test proves
  `walkCentroidMode` output is bit-identical to calling the canonical module
  directly on the same adjacency (traces, msd, p_return deepEqual).
- Per-walker stream convention re-verified on the centroid Delaunay graph by
  manual mulberry32((seed+i)>>>0) replay (walkers 1, 7, 63 of the C1 gold).
