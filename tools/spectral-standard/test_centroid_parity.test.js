// test_centroid_parity.test.js — Lane E parity suite for centroid-walk-v1
// (centroid-adjacency walk mode, preregistration 2026-10-06).
//
// Consumes fixtures_centroid_lane_e.json (Lane E's own fixture pack, built by
// gen_fixtures_centroid.mjs because Lane D's pack was not present at lane
// start; see the lane report). Every expected block was produced by THIS
// module pre-test, so the pack pins determinism and structure; absolute
// assertions (hand-pinned edge lists, gold bands) are stated independently.
// Cross-parity against Lane D's fixtures_centroid.json runs when that file
// exists (test at the bottom; skip-with-message otherwise — see
// verify_lane_d.mjs).
//
// Run: node --test test_centroid_parity.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mulberry32, randomWalks, walkDimensions, graphFromEdges } from './jev-spectral-math.js';
import {
  bowyerWatsonDelaunay,
  tracedGridToComponents,
  componentsToCentroids,
  centroidDelaunayGraph,
  walkCentroidMode,
  radiusGraphDiagnostic,
  graphComponents,
  largestConnectedComponent,
  round9,
} from './jev-spectral-centroid.js';
import { runLaneDVerification, LANE_D_PATH } from './verify_lane_d.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const pack = JSON.parse(readFileSync(join(HERE, 'fixtures_centroid_lane_e.json'), 'utf8'));
assert.equal(pack.pipeline, 'spectral-standard-v1');
assert.equal(pack.mode, 'centroid-walk-v1');

const TOL = 1e-9;
const fx = Object.fromEntries(pack.fixtures.map((f) => [f.id, f]));

function adjOf(edges, n) {
  return graphFromEdges(edges).n === n
    ? graphFromEdges(edges).adj
    : (() => {
        // graphFromEdges derives n from max id; trust the explicit n when larger
        const g = graphFromEdges(edges);
        const adj = Array.from({ length: n }, () => []);
        for (let i = 0; i < g.adj.length; i++) adj[i] = g.adj[i];
        return adj;
      })();
}

function sortedEdgesOk(edges, n) {
  for (const [a, b] of edges) {
    assert.ok(Number.isInteger(a) && Number.isInteger(b), 'integer endpoints');
    assert.ok(a >= 0 && a < n && b >= 0 && b < n, 'endpoints in range');
    assert.ok(a < b, 'canonical orientation');
  }
  for (let i = 1; i < edges.length; i++) {
    assert.ok(
      edges[i - 1][0] < edges[i][0] ||
        (edges[i - 1][0] === edges[i][0] && edges[i - 1][1] < edges[i][1]),
      `edges sorted+deduped at ${i}`,
    );
  }
}

// ---------- 1. Delaunay structure ----------

test('quincunx_5: absolute Delaunay edge list (hand-pinned, not fixture echo)', () => {
  const pts = [[0, 0], [2, 0], [0, 2], [2, 2], [1, 1]];
  const d = bowyerWatsonDelaunay(pts);
  // Square corners + center: perimeter (4) + four spokes (4) = 8 edges, 4 triangles.
  assert.deepEqual(d.edges, [
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
  ]);
  assert.equal(d.triangles.length, 4);
  assert.equal(d.n, 5);
  assert.equal(d.dedupeRemoved, 0);
  // every triangle contains the center (4) — no long diagonal crosses it
  for (const t of d.triangles) assert.ok(t.includes(4), 'center in every triangle');
});

test('points fixtures: Delaunay edge-list parity — recompute matches fixture exactly', () => {
  for (const f of pack.fixtures.filter((x) => x.kind === 'points')) {
    const d = bowyerWatsonDelaunay(f.points);
    assert.equal(d.n, f.expected.n, f.id + ' n');
    assert.equal(d.dedupeRemoved, f.expected.dedupeRemoved, f.id + ' dedupeRemoved');
    assert.deepEqual(d.edges, f.expected.edges, f.id + ' edges');
    assert.deepEqual(d.triangles, f.expected.triangles, f.id + ' triangles');
    sortedEdgesOk(d.edges, d.n);
    // structural sanity: edges symmetric, every triangle edge present
    const eset = new Set(f.expected.edges.map((e) => e.join(',')));
    for (const t of d.triangles) {
      for (let e = 0; e < 3; e++) {
        const u = t[e], v = t[(e + 1) % 3];
        assert.ok(eset.has(Math.min(u, v) + ',' + Math.max(u, v)), f.id + ' triangle edge in edge list');
      }
    }
  }
});

test('Delaunay determinism: two independent runs identical on every point set', () => {
  for (const f of pack.fixtures.filter((x) => x.kind === 'points')) {
    const a = bowyerWatsonDelaunay(f.points);
    const b = bowyerWatsonDelaunay(f.points);
    assert.deepEqual(a.edges, b.edges, f.id + ' edges deterministic');
    assert.deepEqual(a.triangles, b.triangles, f.id + ' triangles deterministic');
    assert.deepEqual(a.points, b.points, f.id + ' deduped points deterministic');
  }
});

test('cocircular square: 5 edges / 2 triangles, deterministic per insertion order', () => {
  const fwd = bowyerWatsonDelaunay([[0, 0], [1, 0], [1, 1], [0, 1]]);
  const rev = bowyerWatsonDelaunay([[0, 1], [1, 1], [1, 0], [0, 0]]);
  for (const d of [fwd, rev]) {
    assert.equal(d.edges.length, 5, 'square Delaunay has 5 edges (4 hull + 1 diagonal)');
    assert.equal(d.triangles.length, 2);
    sortedEdgesOk(d.edges, 4);
  }
  // Per-order determinism (the pinned rule: cocircular diagonal is decided by
  // insertion order via the 1e-9 relative on-circle band — deterministic,
  // order-sensitive by construction). Both orders must produce a valid unit
  // square triangulation: 4 hull edges + exactly one diagonal.
  const fwd2 = bowyerWatsonDelaunay([[0, 0], [1, 0], [1, 1], [0, 1]]);
  const rev2 = bowyerWatsonDelaunay([[0, 1], [1, 1], [1, 0], [0, 0]]);
  assert.deepEqual(fwd.edges, fwd2.edges);
  assert.deepEqual(rev.edges, rev2.edges);
  const hasDiag = (d, a, b) => d.edges.some((e) => e[0] === Math.min(a, b) && e[1] === Math.max(a, b));
  assert.equal(hasDiag(fwd, 0, 2) !== hasDiag(fwd, 1, 3), true, 'exactly one diagonal');
  assert.equal(hasDiag(rev, 0, 2) !== hasDiag(rev, 1, 3), true, 'exactly one diagonal');
});

test('cocircular 3x3 grid: determinism + structural validity under heavy cocircularity', () => {
  const d = bowyerWatsonDelaunay(fx.cocircular_grid_3x3.points);
  assert.deepEqual(d.edges, fx.cocircular_grid_3x3.expected.edges, 'matches fixture');
  const d2 = bowyerWatsonDelaunay(fx.cocircular_grid_3x3.points);
  assert.deepEqual(d.edges, d2.edges, 'run-twice identical');
  sortedEdgesOk(d.edges, 9);
  // adjacency symmetric + corner degrees
  const adj = adjOf(d.edges, d.n);
  for (let i = 0; i < 9; i++) {
    for (const j of adj[i]) assert.ok(adj[j].includes(i), `symmetry ${i}-${j}`);
  }
  // hull corners of the 3x3 grid are points (0,0),(2,0),(0,2),(2,2) = ids 0,2,6,8.
  // Degree is 2 or 3 depending on which cocircular diagonals the pinned
  // insertion-order rule chose — assert the honest bound, not a fixed value.
  for (const c of [0, 2, 6, 8]) {
    assert.ok(adj[c].length >= 2 && adj[c].length <= 3, `corner ${c} degree in [2,3]`);
  }
});

// ---------- 2. Components and centroids ----------

test('tracedGridToComponents: 4-connectivity splits diagonal touches; row-major ordering', () => {
  const { components } = tracedGridToComponents(fx.mask_diagonal.mask);
  assert.equal(components.length, 4, 'diagonal pixels are separate components (4-conn)');
  const seeds = components.map((c) => c.seed.join(','));
  // seeds are [x, y] pairs; row-major scan order over the mask gives
  // (0,0), (1,1), (x=3,y=1), (x=1,y=3)
  assert.deepEqual(seeds, ['0,0', '1,1', '3,1', '1,3'], 'components in row-major seed order');
  for (const c of components) assert.equal(c.pixels.length, 1);
});

test('tracedGridToComponents: pinned BFS discovery order (N, S, W, E) from row-major seed', () => {
  const { components } = tracedGridToComponents(fx.mask_three_blobs.mask);
  const blob = components[0]; // 5x5 blob at x,y in 1..5, seed (1, 1)
  assert.deepEqual(blob.seed, [1, 1]);
  assert.deepEqual(blob.pixels[0], [1, 1]);
  // A row-major seed is always the component's top-left pixel, so its N and
  // W neighbors are background by construction; the observable pinned order
  // is S before E (N and W are tried first and skipped as background).
  assert.deepEqual(blob.pixels[1], [1, 2], 'first queued neighbor is S');
  assert.deepEqual(blob.pixels[2], [2, 1], 'next queued neighbor is E (N, W background)');
  assert.deepEqual(blob.pixels[3], [1, 3], 'S-chain continues before the E branch');
  assert.deepEqual(blob.pixels[4], [2, 2], 'E of the S-chain node before the E-chain S');
  assert.equal(blob.pixels.length, 25, 'full 5x5 blob');
});

test('componentsToCentroids: boundary-only mean (ring centroid exact) + round9', () => {
  const ring = fx.mask_ring;
  assert.equal(ring.expected.n_components, 1);
  // 11x11 ring, thickness 1: 40 boundary pixels, mean exactly (5, 5).
  assert.deepEqual(ring.expected.centroids[0], [5, 5], 'ring centroid = center exactly');
  const { components } = tracedGridToComponents(ring.mask);
  const cents = componentsToCentroids(components, ring.mask);
  assert.deepEqual(cents[0], [5, 5], 'recompute exact');
  // boundary-only mean: a filled 5x5 blob has 16 boundary pixels (not 25);
  // for a filled rectangle the boundary mean coincides with the all-pixel
  // mean (both = center), so the DISCRIMINATING case is the ring above —
  // here we pin the boundary-pixel COUNT and the exact centroid.
  const blob = fx.mask_three_blobs.expected.components[0];
  const mask = fx.mask_three_blobs.mask;
  const bc = componentsToCentroids([blob], mask)[0];
  assert.deepEqual(bc, [3, 3], '5x5 blob boundary centroid = center exactly');
  // boundary pixel count: recompute directly (interior 3x3 excluded)
  let boundaryCount = 0;
  for (const [x, y] of blob.pixels) {
    if (
      y === 0 || mask[y - 1][x] !== 1 ||
      y === mask.length - 1 || mask[y + 1][x] !== 1 ||
      x === 0 || mask[y][x - 1] !== 1 ||
      x === mask[0].length - 1 || mask[y][x + 1] !== 1
    ) boundaryCount++;
  }
  assert.equal(boundaryCount, 16, '5x5 blob has 16 boundary pixels');
  // round9 semantics: ties toward +inf, 9-decimal grid
  assert.equal(round9(1 / 3), Math.round(1e9 / 3) / 1e9);
  assert.equal(round9(2.0000000005), 2.000000001);
  assert.equal(round9(5), 5);
});

test('mask fixtures: component + centroid + Delaunay edge parity (exact where recorded)', () => {
  for (const f of pack.fixtures.filter((x) => x.kind === 'mask')) {
    const { components } = tracedGridToComponents(f.mask);
    const cents = componentsToCentroids(components, f.mask);
    assert.equal(components.length, f.expected.n_components, f.id + ' n_components');
    assert.deepEqual(
      components.map((c) => ({ id: c.id, seed: c.seed, pixels: c.pixels })),
      f.expected.components,
      f.id + ' components',
    );
    assert.deepEqual(cents, f.expected.centroids, f.id + ' centroids');
    if (f.expected.edges) {
      const g = centroidDelaunayGraph(f.mask);
      assert.equal(g.status, 'ok', f.id + ' status ok');
      assert.deepEqual(g.edges, f.expected.edges, f.id + ' Delaunay edges');
      assert.deepEqual(g.triangles, f.expected.triangles, f.id + ' triangles');
      assert.equal(g.n, f.expected.n, f.id + ' n');
      sortedEdgesOk(g.edges, g.n);
    }
  }
});

// ---------- 3. Walk mode: delegation + trace parity ----------

test('seed-42 walk trace parity: walker0 trace + checkpoint matrix exact on every walk fixture', () => {
  for (const f of pack.fixtures.filter((x) => x.kind === 'walk-centroid')) {
    let adj;
    if (f.source.kind === 'points') {
      const pf = fx[f.source.points_id];
      adj = adjOf(pf.expected.edges, pf.expected.n);
    } else {
      const g = centroidDelaunayGraph(fx[f.source.mask_id].mask);
      adj = g.adj;
    }
    const w = randomWalks({ adj }, {
      walkers: f.walk_params.walkers,
      seed: f.walk_params.seed,
      k: f.walk_params.k,
      startRule: f.walk_params.startRule,
    });
    assert.deepEqual(w.ladder, f.walk_params.ladder, f.id + ' ladder');
    assert.deepEqual(w.walker0_trace, f.expected.walker0_trace, f.id + ' walker0 trace');
    const matrix = w.traces.map((t) => [t.start, ...t.checkpoints]);
    assert.deepEqual(matrix, f.expected.checkpoint_matrix, f.id + ' checkpoint matrix');
  }
});

test('delegation: walkCentroidMode output identical to direct canonical randomWalks + walkDimensions', () => {
  for (const id of ['mask_three_blobs', 'c1_tri_lattice_hex60']) {
    const wf = fx[id + '_walk'];
    let result;
    if (wf.source.kind === 'points') {
      // walkCentroidMode consumes masks; for point golds the identical path is
      // centroidDelaunayGraph-free, so delegate through randomWalks directly
      // and verify walkDimensions consumption — the module has no other walk
      // implementation (delegation contract).
      const pf = fx[wf.source.points_id];
      const adj = adjOf(pf.expected.edges, pf.expected.n);
      const w = randomWalks({ adj }, {
        walkers: wf.walk_params.walkers,
        seed: wf.walk_params.seed,
        k: wf.walk_params.k,
        startRule: wf.walk_params.startRule,
      });
      result = { walk: w, dims: walkDimensions(w) };
    } else {
      result = walkCentroidMode(fx[wf.source.mask_id].mask, {
        walkers: wf.walk_params.walkers,
        seed: wf.walk_params.seed,
        k: wf.walk_params.k,
        startRule: wf.walk_params.startRule,
      });
    }
    assert.deepEqual(result.walk.walker0_trace, wf.expected.walker0_trace, id + ' trace');
    assert.deepEqual(result.walk.msd, wf.expected.msd, id + ' msd');
    assert.deepEqual(result.walk.p_return, wf.expected.p_return, id + ' p_return');
    assert.ok(Math.abs(result.dims.d_w - wf.expected.d_w) <= TOL, id + ' d_w');
  }
});

test('per-walker stream convention holds on the centroid Delaunay graph (manual replay)', () => {
  const wf = fx.c1_tri_lattice_hex60_walk;
  const pf = fx[wf.source.points_id];
  const adj = adjOf(pf.expected.edges, pf.expected.n);
  const w = randomWalks({ adj }, { walkers: 64, seed: 42, k: 4, startRule: 'spread' });
  const ladder = w.ladder;
  for (const i of [1, 7, 63]) {
    const rng = mulberry32((42 + i) >>> 0);
    let u = Math.floor((i * adj.length) / 64); // spread start rule
    let ci = 0;
    for (let t = 1; t <= ladder[ladder.length - 1]; t++) {
      const nbrs = adj[u];
      if (nbrs.length > 0) u = nbrs[Math.floor(rng() * nbrs.length)];
      if (ci < ladder.length && ladder[ci] === t) {
        assert.equal(u, w.traces[i].checkpoints[ci], `walker ${i} checkpoint ${ci}`);
        ci++;
      }
    }
    assert.equal(ci, ladder.length);
  }
});

test('d_w parity to 1e-9: walkDimensions over fixture aggregates reproduces fixture d_w', () => {
  for (const f of pack.fixtures.filter((x) => x.kind === 'walk-centroid')) {
    const dims = walkDimensions({
      ladder: f.walk_params.ladder,
      msd: f.expected.msd,
      p_return: f.expected.p_return,
    });
    if (f.expected.d_w === null) {
      assert.equal(dims.d_w, null, f.id);
    } else {
      assert.ok(Math.abs(dims.d_w - f.expected.d_w) <= TOL, f.id + ' d_w');
      assert.ok(Math.abs(dims.alpha_msd - f.expected.alpha_msd) <= TOL, f.id + ' alpha');
    }
    assert.ok(Math.abs(dims.d_w_r2 - f.expected.d_w_r2) <= TOL, f.id + ' r2');
    assert.equal(dims.msd_low_confidence, f.expected.msd_low_confidence, f.id + ' msd flag');
    assert.equal(dims.return_low_confidence, f.expected.return_low_confidence, f.id + ' return flag');
  }
});

// ---------- 4. Pre-registered gold bands ----------

test('C1 gold: triangular-lattice Delaunay d_w in [1.90, 2.10] with r2 >= 0.98', () => {
  const f = fx.c1_tri_lattice_hex60_walk;
  assert.equal(f.expected.gold, 'C1');
  assert.ok(f.expected.d_w >= 1.9 && f.expected.d_w <= 2.1, `d_w ${f.expected.d_w} in band`);
  assert.ok(f.expected.d_w_r2 >= 0.98, `r2 ${f.expected.d_w_r2}`);
  assert.equal(f.expected.msd_low_confidence, false);
});

test('C4 gold: square-grid Delaunay d_w in [1.90, 2.10] with r2 >= 0.98', () => {
  const f = fx.c4_square_grid_128_walk;
  assert.equal(f.expected.gold, 'C4');
  assert.ok(f.expected.d_w >= 1.9 && f.expected.d_w <= 2.1, `d_w ${f.expected.d_w} in band`);
  assert.ok(f.expected.d_w_r2 >= 0.98, `r2 ${f.expected.d_w_r2}`);
  assert.equal(f.expected.msd_low_confidence, false);
});

test('C1-literal finding: the 19-droplet set saturates the pinned ladder (recorded, not gated)', () => {
  const f = fx.tri_lattice_19_walk;
  assert.equal(f.expected.finding, 'saturation: 19-node graph mixes before the first ladder rung');
  assert.ok(f.expected.d_w > 2.1, `saturated d_w ${f.expected.d_w} far above the band`);
  assert.equal(f.expected.msd_low_confidence, true, 'low-confidence flag honest');
});

test('C3 reported: jittered lattice walk recorded (order-vs-disorder, no gate in this lane)', () => {
  const f = fx.jittered_lattice_19_walk;
  assert.equal(f.expected.gold, 'C3-report');
  assert.equal(typeof f.expected.d_w, 'number');
  assert.equal(f.expected.msd_low_confidence, true, 'saturated 19-node set -> low confidence, reported');
});

// ---------- 5. Degenerate inputs + guards ----------

test('degenerate-input failures throw with the pinned messages', () => {
  for (const f of pack.fixtures.filter((x) => x.kind === 'degenerate' && x.error_pattern)) {
    const fn =
      f.op === 'bowyerWatsonDelaunay'
        ? () => bowyerWatsonDelaunay(f.input)
        : f.op === 'tracedGridToComponents'
          ? () => tracedGridToComponents(f.input)
          : null;
    assert.ok(fn, 'known op');
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.throws(fn, new RegExp(esc(f.error_pattern)), f.id);
  }
});

test('CF-4: fewer than 3 components -> honest insufficient, never a fake walk', () => {
  for (const id of ['mask_ring', 'mask_two_blobs']) {
    const f = fx[id];
    assert.ok(f.expected.n_components < 3, id + ' has < 3 components');
    const r = walkCentroidMode(f.mask, { seed: 42 });
    assert.equal(r.status, 'insufficient');
    assert.equal(r.d_w, null);
    assert.equal(r.walk, null);
    assert.equal(r.n_components, f.expected.n_components);
  }
  const g = centroidDelaunayGraph(fx.mask_two_blobs.mask);
  assert.equal(g.status, 'insufficient');
  assert.deepEqual(g.centroids, fx.mask_two_blobs.expected.centroids);
});

test('walk guard: largestConnectedComponent picks the largest (tie -> lowest min id); Delaunay of valid point sets stays connected', () => {
  const adj = [
    [1], [0, 2], [1], // component A: 0-1-2
    [4], [3, 5], [5, 4], [4], // component B: 3-4-5-6 (bigger)
  ];
  adj[5] = [4, 6];
  const largest = largestConnectedComponent(adj);
  assert.equal(largest.size, 4);
  assert.deepEqual(largest.nodes, [3, 4, 5, 6]);
  assert.equal(largest.n_components, 2);
  // tie-break: two components of equal size -> lowest smallest node id
  const tie = largestConnectedComponent([[1], [0], [3], [2]]);
  assert.deepEqual(tie.nodes, [0, 1]);
  // Delaunay of the two-clusters fixture must itself be connected (honest
  // check of the guard's premise): the guard fires only on degenerate graphs
  const d = bowyerWatsonDelaunay(fx.two_clusters_far.points);
  const g = graphFromEdges(d.edges);
  assert.equal(graphComponents(g.adj).length, 1, 'two-cluster Delaunay connected');
});

// ---------- 6. Radius diagnostic ----------

test('radiusGraphDiagnostic: r = 1.5 * median NN, edges only within r, fixture parity', () => {
  for (const f of pack.fixtures.filter((x) => x.kind === 'radius')) {
    const r = radiusGraphDiagnostic(f.points);
    assert.ok(Math.abs(r.r - f.expected.r) <= TOL, f.id + ' r');
    assert.ok(Math.abs(r.median_nn - f.expected.median_nn) <= TOL, f.id + ' median');
    assert.equal(r.n_edges, f.expected.n_edges, f.id + ' n_edges');
    assert.deepEqual(r.edges, f.expected.edges, f.id + ' edges');
    sortedEdgesOk(r.edges, f.points.length);
    // every recorded edge within r; spot-check an excluded pair stays excluded
    const pts = f.points;
    for (const [i, j] of r.edges) {
      const dx = pts[i][0] - pts[j][0];
      const dy = pts[i][1] - pts[j][1];
      assert.ok(Math.sqrt(dx * dx + dy * dy) <= r.r + 1e-12, `edge ${i}-${j} within r`);
    }
    let count = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0];
        const dy = pts[i][1] - pts[j][1];
        if (Math.sqrt(dx * dx + dy * dy) <= r.r) count++;
      }
    }
    assert.equal(count, r.n_edges, f.id + ' exhaustive edge count');
  }
  assert.throws(() => radiusGraphDiagnostic([[0, 0]]), /at least 2 points/);
});

// ---------- 7. Cross-parity vs Lane D ----------

test('Lane D fixture pack cross-parity (skips with a message while the file is absent)', async (t) => {
  if (!existsSync(LANE_D_PATH)) {
    t.skip(`Lane D fixture pack not present yet at ${LANE_D_PATH} — Lane E ran its own generator; re-run when Lane D lands`);
    return;
  }
  const report = runLaneDVerification();
  assert.ok(report.comparisons > 0, 'at least one comparison ran against the Lane D pack');
  assert.deepEqual(
    report.mismatches,
    [],
    'Lane D cross-parity mismatches:\n' + report.mismatches.join('\n'),
  );
});
