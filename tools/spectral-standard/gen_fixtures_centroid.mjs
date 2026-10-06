// gen_fixtures_centroid.mjs — Lane E fixture generator for centroid-walk-v1
// (centroid-adjacency walk mode, preregistration 2026-10-06). Builds
// fixtures_centroid_lane_e.json from jev-spectral-centroid.js. The Python
// source of record must reproduce every expected block per the parity
// contract in the module header (P1..P12). Cross-parity against Lane D's
// fixture pack is a separate script (verify_lane_d.mjs).
//
// Run: node gen_fixtures_centroid.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  mulberry32,
  randomWalks,
  walkDimensions,
  WALK_BASE_LADDER,
} from './jev-spectral-math.js';
import {
  bowyerWatsonDelaunay,
  tracedGridToComponents,
  componentsToCentroids,
  centroidDelaunayGraph,
  walkCentroidMode,
  radiusGraphDiagnostic,
} from './jev-spectral-centroid.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------- point-set builders ----------

/** 19-point triangular-lattice hex (rows 3,4,5,4,3), spacing 1. */
function triLattice19() {
  const rows = [3, 4, 5, 4, 3];
  const pts = [];
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r];
    for (let i = 0; i < c; i++) {
      pts.push([i - (c - 1) / 2, (r * Math.sqrt(3)) / 2]);
    }
  }
  return pts;
}

/** w*h integer square grid, spacing 1, origin at (0,0), row-major. */
function squareGrid(w, h) {
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pts.push([x, y]);
  return pts;
}

/** Jittered triangular lattice: ±0.15 spacing jitter, mulberry32(7), matched N. */
function jitteredLattice() {
  const base = triLattice19();
  const rng = mulberry32(7);
  return base.map(([x, y]) => [x + (rng() * 2 - 1) * 0.15, y + (rng() * 2 - 1) * 0.15]);
}

/** Two far-apart clusters (Delaunay of valid point sets is connected — honest check). */
function twoClusters() {
  const pts = [];
  for (const [cx, cy, n, spread] of [[0, 0, 4, 1], [1000, 1000, 6, 2]]) {
    const ring = [[0, 0], [spread, 0], [0, spread], [spread, spread], [spread / 2, -spread / 2], [-spread / 2, spread / 2]];
    for (let i = 0; i < n; i++) pts.push([cx + ring[i][0], cy + ring[i][1]]);
  }
  return pts;
}

/**
 * Triangular-lattice hex of radius R (rows -R..R in axial coords):
 * N = 3R(R+1)+1 points, spacing 1, corner at (-R, 0).
 */
function triHex(R) {
  const pts = [];
  for (let dq = -R; dq <= R; dq++) {
    for (let dr = Math.max(-R, -dq - R); dr <= Math.min(R, -dq + R); dr++) {
      pts.push([dq + dr / 2, (dr * Math.sqrt(3)) / 2]);
    }
  }
  return pts;
}

/**
 * Deterministic center-outward ordering: sort by squared distance from the
 * centroid (accumulated in point order), ties broken lexicographically by
 * (y, x). Pinned C1/C4 construction choice — see pinning.ordering_rationale.
 */
function centerOut(pts) {
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  return pts.slice().sort((a, b) => {
    const da = (a[0] - cx) * (a[0] - cx) + (a[1] - cy) * (a[1] - cy);
    const db = (b[0] - cx) * (b[0] - cx) + (b[1] - cy) * (b[1] - cy);
    if (da !== db) return da - db;
    return a[1] - b[1] || a[0] - b[0];
  });
}

/**
 * Merged-gasket vertex set (C2 gold): the exact vertex coordinates of Lane A
 * sierpinski_gasket_graph / canonical gasketIdentifiedGraph — triangular-
 * lattice integer coords (a, b) discovered in the canonical builder's
 * recursion order (lower-left, lower-right, top), mapped to xy as
 * [a + b/2, b*sqrt(3)/2]. JS level L == Python level L+1.
 */
function gasketVertexSet(level) {
  const pyLevel = level + 1;
  const map = new Map();
  const order = [];
  const node = (a, b) => {
    const k = a + ',' + b;
    if (!map.has(k)) {
      map.set(k, order.length);
      order.push([a, b]);
    }
  };
  const rec = (lv, oa, ob, side) => {
    if (lv === 1) {
      node(oa, ob);
      node(oa + side, ob);
      node(oa, ob + side);
      return;
    }
    const half = side / 2;
    rec(lv - 1, oa, ob, half);
    rec(lv - 1, oa + half, ob, half);
    rec(lv - 1, oa, ob + half, half);
  };
  rec(pyLevel, 0, 0, 2 ** pyLevel);
  return order.map(([a, b]) => [a + b / 2, (b * Math.sqrt(3)) / 2]);
}

// ---------- mask builders ----------

function blank(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(0));
}
function fillRect(mask, x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) mask[y][x] = 1;
}

/** Two separated 3x3 blobs -> 2 components (insufficient for the walk). */
function maskTwoBlobs() {
  const m = blank(20, 10);
  fillRect(m, 1, 1, 3, 3);
  fillRect(m, 12, 5, 3, 3);
  return m;
}

/** Three separated square blobs (5x5, 4x4, 3x3). */
function maskThreeBlobs() {
  const m = blank(24, 16);
  fillRect(m, 1, 1, 5, 5);
  fillRect(m, 12, 2, 4, 4);
  fillRect(m, 5, 10, 3, 3);
  return m;
}

/** Hollow 11x11 ring, thickness 1 (boundary pixels != all pixels). */
function maskRing() {
  const m = blank(11, 11);
  for (let i = 0; i < 11; i++) {
    m[0][i] = 1;
    m[10][i] = 1;
    m[i][0] = 1;
    m[i][10] = 1;
  }
  return m;
}

/** Diagonal-touching pixels must split into separate components (4-conn). */
function maskDiagonal() {
  const m = blank(4, 4);
  m[0][0] = 1;
  m[1][1] = 1;
  m[1][3] = 1;
  m[3][1] = 1;
  return m;
}

// ---------- pack assembly ----------

const fixtures = [];
const push = (f) => fixtures.push(f);

function pointFixture(id, points, extra = {}) {
  const d = bowyerWatsonDelaunay(points);
  push({
    id,
    kind: 'points',
    points,
    expected: {
      n: d.n,
      dedupeRemoved: d.dedupeRemoved,
      edges: d.edges,
      triangles: d.triangles,
      n_edges: d.edges.length,
      ...extra,
    },
  });
  return d;
}

const quincunx = [[0, 0], [2, 0], [0, 2], [2, 2], [1, 1]];
pointFixture('quincunx_5', quincunx);
const tri = triLattice19();
pointFixture('tri_lattice_19', tri, { gold: 'C1-literal', finding: 'saturation' });
const grid5 = squareGrid(5, 5);
pointFixture('square_grid_5x5', grid5, { gold: 'C4-small' });
const jitter = jitteredLattice();
pointFixture('jittered_lattice_19', jitter, { gold: 'C3-report' });
pointFixture('two_clusters_far', twoClusters());
pointFixture('cocircular_square_4', [[0, 0], [1, 0], [1, 1], [0, 1]], { cocircular: true });
pointFixture('cocircular_grid_3x3', squareGrid(3, 3), { cocircular: true });
pointFixture('dup_heavy', [[0, 0], [0, 0], [1, 0], [2, 0], [5e-10, 4e-10], [1, 1]]);

// Pre-registered C1/C4 gold constructions (scaled lattice patches, center-
// outward ordering, 'spread' starts — see pinning.ordering_rationale and the
// lane report for the scale/feasibility findings). Sizes fixed a-priori at
// these values; NOT retuned toward an outcome beyond the documented sweep.
const c1Pts = centerOut(triHex(60)); // N = 3*60*61+1 = 10981
pointFixture('c1_tri_lattice_hex60', c1Pts, { gold: 'C1', ordering: 'center-outward' });
const c4Pts = centerOut(squareGrid(128, 128)); // N = 16384
pointFixture('c4_square_grid_128', c4Pts, { gold: 'C4', ordering: 'center-outward' });
// C2 (relative gate, reported here): merged-gasket vertex set, JS level 4
// (123 vertices, the canonical Lane A level->vertex mapping).
const c2Pts = gasketVertexSet(4);
pointFixture('c2_gasket_vertex_l4', c2Pts, { gold: 'C2-report', ordering: 'recursion' });

// Degenerate inputs (expected throws).
push({ id: 'deg_two_points', kind: 'degenerate', op: 'bowyerWatsonDelaunay', input: [[0, 0], [1, 0]], error_pattern: 'at least 3 distinct' });
push({ id: 'deg_collinear_4', kind: 'degenerate', op: 'bowyerWatsonDelaunay', input: [[0, 0], [5, 0], [10, 0], [20, 0]], error_pattern: 'collinear' });
push({ id: 'deg_empty_points', kind: 'degenerate', op: 'bowyerWatsonDelaunay', input: [], error_pattern: 'empty point set' });
push({ id: 'deg_bad_point', kind: 'degenerate', op: 'bowyerWatsonDelaunay', input: [[0, 0], [1, 0], [2]], error_pattern: '[x, y] pairs' });
push({ id: 'deg_nonfinite', kind: 'degenerate', op: 'bowyerWatsonDelaunay', input: [[0, 0], [1, 0], [NaN, 1]], error_pattern: 'finite numbers' });
push({ id: 'deg_empty_mask', kind: 'degenerate', op: 'tracedGridToComponents', input: blank(3, 3), error_pattern: 'empty mask' });
push({ id: 'deg_bad_mask_value', kind: 'degenerate', op: 'tracedGridToComponents', input: [[1, 2], [0, 0]], error_pattern: '0 or 1' });
push({ id: 'deg_one_component', kind: 'degenerate', op: 'walkCentroidMode', input: maskRing(), error_pattern: null, expect_status: 'insufficient' });

// Mask fixtures.
function maskFixture(id, mask, opts = {}) {
  const { components } = tracedGridToComponents(mask);
  const centroids = componentsToCentroids(components, mask);
  const expected = {
    n_components: components.length,
    components: components.map((c) => ({ id: c.id, seed: c.seed, pixels: c.pixels })),
    centroids,
  };
  if (components.length >= 3) {
    const g = centroidDelaunayGraph(mask);
    expected.edges = g.edges;
    expected.triangles = g.triangles;
    expected.n = g.n;
  }
  push({ id, kind: 'mask', mask, expected });
  if (opts.walk) {
    const w = walkCentroidMode(mask, { walkers: opts.walk.walkers, seed: opts.walk.seed, k: opts.walk.k, startRule: opts.walk.startRule });
    push({
      id: id + '_walk',
      kind: 'walk-centroid',
      source: { kind: 'mask', mask_id: id },
      walk_params: { walkers: opts.walk.walkers, seed: opts.walk.seed, k: opts.walk.k, startRule: opts.walk.startRule, ladder: w.walk.ladder },
      expected: {
        walker0_trace: w.walk.walker0_trace,
        checkpoint_matrix: w.walk.traces.map((t) => [t.start, ...t.checkpoints]),
        msd: w.walk.msd,
        p_return: w.walk.p_return,
        alpha_msd: w.dims.alpha_msd,
        d_w: w.dims.d_w,
        d_w_r2: w.dims.d_w_r2,
        d_s: w.dims.d_s,
        d_s_r2: w.dims.d_s_r2,
        msd_low_confidence: w.dims.msd_low_confidence,
        return_low_confidence: w.dims.return_low_confidence,
      },
    });
  }
}

maskFixture('mask_two_blobs', maskTwoBlobs());
maskFixture('mask_three_blobs', maskThreeBlobs(), { walk: { walkers: 64, seed: 42, k: 4, startRule: 'first' } });
maskFixture('mask_ring', maskRing());
maskFixture('mask_diagonal', maskDiagonal());

// Walk fixtures on explicit gold point graphs (startRule 'spread' — the
// canonical rule for explicitly-built gold graphs).
function pointWalkFixture(id, points, extra = {}) {
  const d = bowyerWatsonDelaunay(points);
  const w = randomWalks({ adj: graphAdj(d.edges, d.n) }, { walkers: 64, seed: 42, k: 4, startRule: 'spread' });
  const dims = walkDimensions(w);
  push({
    id: id + '_walk',
    kind: 'walk-centroid',
    source: { kind: 'points', points_id: id },
    walk_params: { walkers: 64, seed: 42, k: 4, startRule: 'spread', ladder: w.ladder },
    expected: {
      walker0_trace: w.walker0_trace,
      checkpoint_matrix: w.traces.map((t) => [t.start, ...t.checkpoints]),
      msd: w.msd,
      p_return: w.p_return,
      alpha_msd: dims.alpha_msd,
      d_w: dims.d_w,
      d_w_r2: dims.d_w_r2,
      d_s: dims.d_s,
      d_s_r2: dims.d_s_r2,
      msd_low_confidence: dims.msd_low_confidence,
      return_low_confidence: dims.return_low_confidence,
      ...extra,
    },
  });
}

function graphAdj(edges, n) {
  const adj = Array.from({ length: n }, () => new Set());
  for (const [a, b] of edges) {
    adj[a].add(b);
    adj[b].add(a);
  }
  return adj.map((s) => Array.from(s).sort((x, y) => x - y));
}

pointWalkFixture('c1_tri_lattice_hex60', c1Pts, { gold: 'C1', ordering: 'center-outward' });
pointWalkFixture('c4_square_grid_128', c4Pts, { gold: 'C4', ordering: 'center-outward' });
pointWalkFixture('c2_gasket_vertex_l4', c2Pts, { gold: 'C2-report', ordering: 'recursion' });
pointWalkFixture('tri_lattice_19', tri, { finding: 'saturation: 19-node graph mixes before the first ladder rung' });
pointWalkFixture('square_grid_5x5', grid5, { finding: 'saturation: 25-node graph' });
pointWalkFixture('jittered_lattice_19', jitter, { gold: 'C3-report', finding: 'saturation: 19-node graph' });

// Radius diagnostic fixtures (secondary, never a gate) — small sets only.
for (const [id, pts] of [['tri_lattice_19', tri], ['square_grid_5x5', grid5], ['jittered_lattice_19', jitter]]) {
  const r = radiusGraphDiagnostic(pts);
  push({
    id: 'radius_' + id,
    kind: 'radius',
    points: pts,
    expected: { r: r.r, median_nn: r.median_nn, n_edges: r.n_edges, edges: r.edges },
  });
}

const pack = {
  pipeline: 'spectral-standard-v1',
  mode: 'centroid-walk-v1',
  lane: 'E (JS port)',
  generated_by: 'gen_fixtures_centroid.mjs against jev-spectral-centroid.js (canonical-module delegation)',
  generated_at: new Date().toISOString(),
  preregistration: 'PREREGISTRATION-centroid-walk-2026-10-06.md',
  pinning: {
    dedupe_tol: 1e-9,
    dedupe_metric: 'chebyshev',
    circumcircle_tol_relative: 1e-9,
    containment_rule: 'd2 <= r2*(1+1e-9)^2 (band counts as inside/on-circle)',
    cavity_edge_order: 'lexicographic canonical [min,max]',
    insertion_order: 'input order after dedupe',
    super_triangle: 'm=max(1,max|x|,|y|); (-10m,-10m),(10m,-10m),(0,10m)',
    rounding: 'round9(v) = Math.round(v*1e9)/1e9 (Python MUST use floor(v*1e9+0.5)/1e9)',
    component_neighbor_order: ['N', 'S', 'W', 'E'],
    component_scan: 'row-major, BFS from row-major seed',
    boundary_rule: '4-neighbor out-of-bounds-or-background; mean over distinct boundary pixels in pixel-list order',
    ordering_rationale: 'C1/C4 gold walks use center-outward point ordering + startRule spread: the pinned 64-walker instrument carries a +0.06..0.15 d_w bias when starts are spatially contiguous (Jensen effect, isolated on an ideal torus) and a further boundary-proximity deficit under row-major ordering; center-outward + spread gives ~uniform decorrelated starts. Sizes fixed a-priori (hex R=60, grid 128); seed sensitivity recorded in the lane report. The literal 19-droplet C1 construction saturates (19 nodes mix before the first ladder rung) and is recorded as a finding, not gated.',
    ladder_base: WALK_BASE_LADDER,
    ladder_k: 4,
    walkers: 64,
    walk_seed: 42,
    delegation: 'randomWalks + walkDimensions imported from jev-spectral-math.js unchanged',
  },
  fixtures,
};

writeFileSync(join(HERE, 'fixtures_centroid_lane_e.json'), JSON.stringify(pack, null, 2));
console.log('wrote fixtures_centroid_lane_e.json with', fixtures.length, 'fixtures');
const c1 = fixtures.find((f) => f.id === 'tri_lattice_19_walk');
const c4 = fixtures.find((f) => f.id === 'square_grid_5x5_walk');
console.log('C1 tri_lattice_19 d_w =', c1.expected.d_w, 'r2 =', c1.expected.d_w_r2);
console.log('C4 square_grid_5x5 d_w =', c4.expected.d_w, 'r2 =', c4.expected.d_w_r2);
