# PREREGISTRATION: centroid-adjacency walk mode (centroid-walk-v1)

Date: 2026-10-06. Written BEFORE any centroid-mode measurement exists (the falsification-corpus rule). Extends the spectral-standard-v1 contract on draft PR #292. Companion: `tools/spectral-standard/falsification/PREREGISTRATION-spectral-2026-10-06.md` and `amendments-spectral-2026-10-06.md` (7 amendments, all pre-first-clean-run).

## Problem (why this mode must exist)

The spectral walk on an image's INK-PIXEL graph is component-local for droplet morphologies: every traced contour is a separate 8-connected component, so a walker can never leave its own droplet. The falsification harness's FM-4 fired exactly here — gold row 7 (the 366-droplet gasket render through the oracle path) measured component-local walks, not arrangement hierarchy. For a droplet CRYSTAL, the hierarchy lives in the ARRANGEMENT of droplets, not in the ink. The oracle's image path therefore needs a graph whose nodes are droplets.

## Construction (pre-registered, parameter-free)

1. Centroids: the existing edge-standard-v1 pipeline (unchanged — threshold → components → Moore contours) yields kept components; each component's centroid = arithmetic mean of its DISTINCT boundary pixels (the traced pixel set, already computed by the pipeline — deterministic; NOT the filled interior). Ordering: components sorted by row-major seed pixel (deterministic).
2. Adjacency: **Delaunay triangulation of the centroid set** (Bowyer-Watson, stdlib, deterministic; degenerate handling pinned: duplicate centroids impossible since components are disjoint; 4+ point cocircular → lexicographic tie-break, logged). Zero free parameters — no radius, no k. Chosen a-priori over radius graphs and kNN because any radius/k is a tunable knob, and the house discipline forbids knobs that could later be retuned toward an outcome.
3. Secondary diagnostic (NOT a gate): radius graph at r = 1.5 × median nearest-neighbor spacing, reported alongside for comparison, never substituted.
4. Walk: unweighted hop-count walk on the Delaunay graph (same per-walker mulberry32 stream convention as the canonical walk mode, same step ladder ×K, same start rules, BFS hop distance for MSD on graphs).
5. Guard: if the centroid Delaunay graph is disconnected, walk the largest component only and report `n_components`; never merge across components.

## Gold bands (pre-registered)

| # | Gold | Quantity | Band |
|---|---|---|---|
| C1 | Triangular-lattice 19-droplet point set → Delaunay | d_w (walk) | [1.90, 2.10] — the Delaunay graph of a perfect triangular-lattice point set IS the triangular lattice; planar-lattice walk dimension is exactly 2 |
| C2 | Sierpinski-gasket droplet arrangement (the 366-droplet falsification render's centroid set, or the merged-gasket vertex set at any level) → Delaunay | d_w | **RELATIVE gate: d_w(gasket) ≥ d_w(lattice) + 0.15.** No closed form exists for the Delaunay-walk dimension of a Sierpinski point set — the gate is the separation from the lattice gold, not an absolute band. The absolute value is recorded, never gated. |
| C3 | Jittered lattice at matched extent (v3 design: ±15 px, same N/d/extent/density) → Delaunay | d_w | REPORTED, pre-declared as the decisive order-vs-disorder test in the spectral channel. D's blind spot (v3 Addendum 7: |Δ| 0.0027) predicts jitter ≈ lattice here; if the spectral channel SEPARATES jitter from lattice, the oracle has a dimension D lacks — a finding either way, both branches pre-declared. |
| C4 | Square-grid point set → Delaunay (explicit points, no mask) | sanity | d_w ∈ [1.90, 2.10] |
| C5 | Exact merged-gasket graph level 6, ink mode (unchanged anchored gold) | regression | d_w ∈ [2.22193, 2.42193] must still PASS after centroid code lands (no regression to the pixel-graph mode) |

r² ≥ 0.98 on every fitted exponent; 64 walkers on synthetic graphs (the anchored graph-mode walker count); K unchanged.

## Predicted failure modes (pre-declared)

- CF-1: Bowyer-Watson on near-degenerate point sets (cocircular quads on lattice arrangements) — tie-break must be deterministic and logged; non-deterministic Delaunay = HARNESS FAILURE, not a physics result.
- CF-2: Delaunay of a hierarchical point set may NOT be anomalous (long thin triangles could "shortcut" the hierarchy). If C2 fails, the honest verdict is "Delaunay connectivity does not inherit arrangement hierarchy" — recorded as a finding, NOT fixed by switching to the radius graph post-hoc (that switch would need a new pre-registered amendment with a-priori reasoning, logged before any re-measurement).
- CF-3: boundary-pixel centroid vs filled-interior centroid differ for concave components — pinned to boundary-pixel centroid for determinism; v1.1 candidate noted.
- CF-4: single-component masks degenerate to a 1-node graph — return `insufficient` honestly.

## Scope

Python: `mask_to_centroid_graph()` + Bowyer-Watson Delaunay + walk integration + selftest extensions. JS port: same functions, parity vs Python fixtures (the intfix bridge discipline). Harness: gold rows C1–C5 added, anchored after first clean run. Route impact: `/oracle` uses centroid mode for image masks; `/spectral/walk` gains `graph: "delaunay" | "ink" | "points"`.

Never retune: K, walker count, step ladder, bands, tie-breaks toward an outcome. Any post-first-run change = logged amendment with a-priori reasoning, before re-measurement.
