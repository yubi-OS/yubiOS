// jev-spectral-centroid.js — centroid-adjacency walk mode (centroid-walk-v1),
// Lane E JS port for the spectral-standard-v1 build round (2026-10-06).
//
// Implements the PREREGISTRATION-centroid-walk-2026-10-06.md construction:
//   1. Components of the ink mask (4-connected, row-major seed ordering).
//   2. Per-component centroid = arithmetic mean of the DISTINCT BOUNDARY
//      pixels (4-neighbors test), rounded to 9 decimals.
//   3. Bowyer-Watson Delaunay triangulation of the centroid set
//      (parameter-free — no radius, no k), with pinned determinism rules.
//   4. Unweighted hop-count walk on the Delaunay graph, delegating EXACTLY to
//      the canonical module's randomWalks() + walkDimensions() (per-walker
//      mulberry32((seed+i)>>>0) streams, pinned ladder base*K, BFS MSD).
//   5. Guard: disconnected Delaunay graph -> walk the largest component only
//      and report n_components (preregistration guard, CF-4 honest verdict).
//
// DELEGATION CONTRACT (binding): this module NEVER reimplements walk
// machinery. randomWalks and walkDimensions are imported from
// './jev-spectral-math.js' (the canonical patched module, copied verbatim
// into this lane dir) and consumed as-is. walkCentroidMode only builds the
// graph and passes { walkers, seed, k, startRule } straight through.
//
// PARITY CONTRACT (pinned so the Python source of record reproduces exactly;
// divergence risks are flagged inline and in the lane report):
//   P1. Dedupe (bowyerWatsonDelaunay): two points are duplicates iff
//       |dx| <= 1e-9 AND |dy| <= 1e-9 (Chebyshev). First occurrence in input
//       order is kept; later duplicates dropped. Duplicate count returned.
//   P2. Insertion order = input order AFTER dedupe (no sorting). Python must
//       insert in the same order — different insertion orders can yield
//       different (both valid) triangulations for degenerate sets.
//   P3. Super-triangle: m = max(1, max(|x|, |y|)) over deduped points;
//       vertices (-10m, -10m), (10m, -10m), (0, 10m). Every input point lies
//       strictly inside (checked analytically for the [-m, m] box).
//   P4. Circumcircle: exact formula below (op order pinned):
//         d  = 2*(ax*(by-cy) + bx*(cy-ay) + cx*(ay-by))
//         ux = ((ax^2+ay^2)*(by-cy) + (bx^2+by^2)*(cy-ay) + (cx^2+cy^2)*(ay-by)) / d
//         uy = ((ax^2+ay^2)*(cx-bx) + (bx^2+by^2)*(ax-cx) + (cx^2+cy^2)*(bx-ax)) / d
//         r2 = (ax-ux)^2 + (ay-uy)^2
//       |d| < 1e-300 -> degenerate triangle, circumcircle = null (never bad).
//   P5. Containment (relative tolerance, pinned): a point p is INSIDE the
//       circumcircle iff  d2 <= r2 * (1 + 1e-9)^2  where d2 = (px-ux)^2 +
//       (py-uy)^2. The 1e-9 relative band is treated as ON-CIRCLE
//       (cocircular) and counts as inside — this flips cocircular diagonals
//       deterministically by insertion order. Strictly outside is
//       d2 > r2*(1+1e-9)^2.
//   P6. Cavity re-triangulation: boundary edges of the bad set (edges in
//       exactly ONE bad triangle) are collected with their unique third
//       vertex, sorted lexicographically by canonical key [min,max] (THE
//       lexicographic cocircular tie-break), oriented so the third vertex
//       lies to the LEFT of the directed edge (cross(b-a, c-a) > 0; if
//       cross == 0 the canonical orientation is kept — degenerate tie-break),
//       and each becomes triangle [p, a, b]. Fan triangles whose own area is
//       exactly zero (cross(b-a, p-a) === 0 bit-exact) are skipped.
//   P7. Final triangles: drop any containing a super-vertex; drop zero-area
//       triangles (bit-exact cross === 0). If none remain (all-collinear
//       set) throw Error('bowyerWatsonDelaunay: degenerate point set
//       (collinear points)'). Triangles output sorted (each ascending,
//       list lexicographic); edges deduped canonical [min,max] sorted
//       lexicographically.
//   P8. Components (tracedGridToComponents): 4-connected (N, S, W, E
//       neighbor order pinned as [dy=-1, dy=+1, dx=-1, dx=+1]); scan
//       row-major; each component's pixels recorded in BFS discovery order
//       from its row-major seed; components ordered by row-major seed
//       (automatic from the scan). Python MUST BFS with the same neighbor
//       order — centroid means accumulate over the pixel list in order, so
//       a different order can shift the last ulp.
//   P9. Boundary pixel: a component pixel with at least one 4-neighbor out
//       of bounds or value 0 (two 4-adjacent ink pixels are always in the
//       same component, so "not in component" == background). Centroid =
//       sum(x)/count, sum(y)/count accumulated over the component's pixel
//       list in order, then round9(v) = Math.round(v * 1e9) / 1e9.
//       DIVERGENCE RISK (flagged): Math.round ties at .5 go toward +inf;
//       Python must use math.floor(v*1e9 + 0.5)/1e9 (not round(), which is
//       banker's). Exact .5 ties CAN occur (e.g. mean = 1/4 of odd-sum
//       coords scaled to 1e-9 grid), so this is not theoretical.
//   P10. Distances: everywhere computed as dx*dx + dy*dy (then Math.sqrt
//       where a true distance is needed — IEEE-754 sqrt is exactly
//       reproducible across JS/Python; the SUM order dx*dx + dy*dy is
//       pinned). No hypot (differing libm algorithms).
//   P11. Median nearest-neighbor spacing (radiusGraphDiagnostic): NN
//       distances sorted ascending; odd count -> middle; even count ->
//       arithmetic mean of the two middle values. r = 1.5 * median.
//   P12. Start rules / ladder / streams: inherited from the canonical
//       module unchanged ('first' default for mask-built graphs, 'spread'
//       for explicit gold point graphs — pass via opts).
//
// Known divergence risks (also in lane report):
//   - P9 rounding tie direction (Math.round vs Python round()).
//   - Near-degenerate cocircular sets where float noise makes a
//     geometrically-collinear cross nonzero (fixtures use exactly
//     representable coordinates; general real-valued inputs could diverge
//     in the last ulp of the containment test — the 1e-9 relative band is
//     wide enough to absorb single-ulp differences in practice).
//   - The 'no cavity' defensive throw: an inserted point strictly outside
//     every current circumcircle (cannot happen for points strictly inside
//     the super-triangle with correct arithmetic; a Python port that hits
//     it has an arithmetic-order bug, not a data problem).

import { graphFromEdges, randomWalks, walkDimensions } from './jev-spectral-math.js';

const DEDUPE_TOL = 1e-9; // Chebyshev dedupe tolerance (P1)
const CIRC_TOL = 1e-9; // relative circumcircle tolerance (P5)

/** round to 9 decimals; ties toward +inf (see P9 divergence risk). */
export function round9(v) {
  return Math.round(v * 1e9) / 1e9;
}

/**
 * Bowyer-Watson Delaunay triangulation of 2D points.
 * points: array of [x, y] finite pairs. Returns
 * { n, points (deduped, input order), dedupeRemoved, triangles, edges }.
 * Throws on: empty / malformed input, < 3 distinct points, all-collinear
 * set, or the defensive no-cavity case (see header P5/P7).
 */
export function bowyerWatsonDelaunay(points) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('bowyerWatsonDelaunay: empty point set');
  }
  const pts = [];
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2) {
      throw new Error('bowyerWatsonDelaunay: points must be [x, y] pairs');
    }
    const x = p[0];
    const y = p[1];
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
      throw new Error('bowyerWatsonDelaunay: point coordinates must be finite numbers');
    }
    let dup = false;
    for (const q of pts) {
      if (Math.abs(q[0] - x) <= DEDUPE_TOL && Math.abs(q[1] - y) <= DEDUPE_TOL) {
        dup = true;
        break;
      }
    }
    if (!dup) pts.push([x, y]);
  }
  const n = pts.length;
  if (n < 3) {
    throw new Error('bowyerWatsonDelaunay: need at least 3 distinct points');
  }

  // Super-triangle (P3).
  let m = 1;
  for (const [x, y] of pts) m = Math.max(m, Math.abs(x), Math.abs(y));
  const sup = [
    [-10 * m, -10 * m],
    [10 * m, -10 * m],
    [0, 10 * m],
  ];
  const all = pts.concat(sup);
  const S0 = n, S1 = n + 1, S2 = n + 2;

  const circumcircle = (a, b, c) => {
    const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-300) return null;
    const a2 = ax * ax + ay * ay;
    const b2 = bx * bx + by * by;
    const c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    const r2 = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy);
    return [ux, uy, r2];
  };
  const cross3 = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

  let triangles = [[S0, S1, S2]];
  const insideBand = 1 + CIRC_TOL; // (1 + 1e-9); squared band applied to r2

  for (let i = 0; i < n; i++) {
    const p = pts[i];
    // Bad triangles: circumcircle contains p within the relative band (P5).
    const bad = [];
    for (const t of triangles) {
      const cc = circumcircle(all[t[0]], all[t[1]], all[t[2]]);
      if (cc === null) continue;
      const dx = p[0] - cc[0];
      const dy = p[1] - cc[1];
      const d2 = dx * dx + dy * dy;
      if (d2 <= cc[2] * insideBand * insideBand) bad.push(t);
    }
    if (bad.length === 0) {
      throw new Error('bowyerWatsonDelaunay: no cavity (point outside all circumcircles)');
    }
    // Boundary edges + unique third vertex (P6).
    const edgeCount = new Map(); // 'a,b' canonical -> count
    const thirdOf = new Map(); // 'a,b' canonical -> [triangle, thirdVertex]
    for (const t of bad) {
      for (let e = 0; e < 3; e++) {
        const u = t[e];
        const v = t[(e + 1) % 3];
        const key = u < v ? u + ',' + v : v + ',' + u;
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        if (!thirdOf.has(key)) {
          for (const w of t) {
            if (w !== u && w !== v) {
              thirdOf.set(key, [t, w]);
              break;
            }
          }
        }
      }
    }
    const boundaryKeys = Array.from(edgeCount.keys())
      .filter((k) => edgeCount.get(k) === 1)
      .sort((x, y) => {
        const [x0, x1] = x.split(',').map(Number);
        const [y0, y1] = y.split(',').map(Number);
        return x0 - y0 || x1 - y1;
      });
    if (boundaryKeys.length === 0) {
      throw new Error('bowyerWatsonDelaunay: empty cavity boundary (degenerate bad set)');
    }
    const kept = [];
    const badSet = new Set(bad);
    for (const t of triangles) if (!badSet.has(t)) kept.push(t);
    for (const key of boundaryKeys) {
      const [a, b] = key.split(',').map(Number);
      const third = thirdOf.get(key)[1];
      // Orient so the third vertex lies to the LEFT of a->b (P6).
      const cr = (all[b][0] - all[a][0]) * (all[third][1] - all[a][1]) -
        (all[b][1] - all[a][1]) * (all[third][0] - all[a][0]);
      let ua = a, ub = b;
      if (cr < 0) {
        ua = b;
        ub = a;
      } // cr === 0: keep canonical order (lexicographic tie-break)
      // Skip exactly-degenerate fan triangles (P6).
      const cp = (all[ub][0] - all[ua][0]) * (p[1] - all[ua][1]) -
        (all[ub][1] - all[ua][1]) * (p[0] - all[ua][0]);
      if (cp === 0) continue;
      kept.push([i, ua, ub]);
    }
    triangles = kept;
  }

  // Final filter (P7): drop super-vertex triangles and zero-area triangles.
  const isSuper = (v) => v >= n;
  const finalTriangles = [];
  for (const t of triangles) {
    if (isSuper(t[0]) || isSuper(t[1]) || isSuper(t[2])) continue;
    const a = all[t[0]];
    const b = all[t[1]];
    const c = all[t[2]];
    if (cross3(a, b, c) === 0) continue;
    finalTriangles.push([Math.min(t[0], t[1], t[2]), 0, 0]); // placeholder
    finalTriangles[finalTriangles.length - 1] = [t[0], t[1], t[2]].sort((x, y) => x - y);
  }
  if (finalTriangles.length === 0) {
    throw new Error('bowyerWatsonDelaunay: degenerate point set (collinear points)');
  }
  finalTriangles.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);

  const edgeSet = new Set();
  for (const t of finalTriangles) {
    for (let e = 0; e < 3; e++) {
      const u = t[e];
      const v = t[(e + 1) % 3];
      edgeSet.add(u < v ? u + ',' + v : v + ',' + u);
    }
  }
  const edges = Array.from(edgeSet).map((k) => k.split(',').map(Number));
  edges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

  return {
    n,
    points: pts,
    dedupeRemoved: points.length - n,
    triangles: finalTriangles,
    edges,
  };
}

/**
 * 4-connected components of a binary mask (0/1 rows). Scans row-major; BFS
 * from each row-major seed with the pinned neighbor order N, S, W, E.
 * Returns { components, width, height } where components[i] =
 * { id, seed: [x, y], pixels: [[x, y], ...] in discovery order } and
 * components are ordered by row-major seed. Throws Error('empty mask') on an
 * empty/all-zero mask; validates shape and values like maskToGraph.
 */
export function tracedGridToComponents(mask) {
  if (!Array.isArray(mask) || mask.length === 0) throw new Error('empty mask');
  const H = mask.length;
  const W = mask[0].length;
  if (W === 0) throw new Error('empty mask');
  for (const row of mask) {
    if (!Array.isArray(row) || row.length !== W) throw new Error('tracedGridToComponents: ragged mask');
    for (const v of row) {
      if (v !== 0 && v !== 1) throw new Error('tracedGridToComponents: mask values must be 0 or 1');
    }
  }
  const visited = mask.map((row) => new Array(W).fill(false));
  const components = [];
  // Pinned neighbor order (P8): N (dy=-1), S (dy=+1), W (dx=-1), E (dx=+1).
  const NB = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y][x] !== 1 || visited[y][x]) continue;
      const id = components.length;
      const comp = { id, seed: [x, y], pixels: [] };
      visited[y][x] = true;
      const queue = [[x, y]];
      for (let qi = 0; qi < queue.length; qi++) {
        const [cx, cy] = queue[qi];
        comp.pixels.push([cx, cy]);
        for (const [dx, dy] of NB) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (mask[ny][nx] !== 1 || visited[ny][nx]) continue;
          visited[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
      components.push(comp);
    }
  }
  if (components.length === 0) throw new Error('empty mask');
  return { components, width: W, height: H };
}

/**
 * Centroids of components: arithmetic mean of the component's DISTINCT
 * BOUNDARY pixels (4-neighbor test against background/out-of-bounds; see
 * P9), accumulated over the component's pixel list in order, rounded to 9
 * decimals. Returns array of [x, y] (rounded), index-aligned with comps.
 */
export function componentsToCentroids(comps, mask) {
  if (!Array.isArray(comps)) throw new Error('componentsToCentroids: comps must be an array');
  const H = mask ? mask.length : 0;
  const W = H > 0 ? mask[0].length : 0;
  return comps.map((comp) => {
    const pixels = comp.pixels;
    if (!pixels || pixels.length === 0) {
      throw new Error('componentsToCentroids: component with no pixels');
    }
    const inComp = new Set(pixels.map(([x, y]) => y * W + x));
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const [x, y] of pixels) {
      let boundary = false;
      // Pinned neighbor order for the boundary test: N, S, W, E.
      if (y === 0 || mask[y - 1][x] !== 1 || !inComp.has((y - 1) * W + x)) boundary = true;
      else if (y === H - 1 || mask[y + 1][x] !== 1 || !inComp.has((y + 1) * W + x)) boundary = true;
      else if (x === 0 || mask[y][x - 1] !== 1 || !inComp.has(y * W + (x - 1))) boundary = true;
      else if (x === W - 1 || mask[y][x + 1] !== 1 || !inComp.has(y * W + (x + 1))) boundary = true;
      if (boundary) {
        sx += x;
        sy += y;
        count++;
      }
    }
    if (count === 0) {
      throw new Error('componentsToCentroids: component with no boundary pixels');
    }
    return [round9(sx / count), round9(sy / count)];
  });
}

/**
 * Build the centroid Delaunay graph from a binary mask:
 * components -> boundary-pixel centroids -> Bowyer-Watson Delaunay ->
 * { n, adj } adjacency via the canonical graphFromEdges (sorted, deduped,
 * no self-loops). Fewer than 3 components -> { status: 'insufficient' }
 * (preregistration CF-4: honest verdict, never a fake 1-node walk).
 * Returns { status, n_components, centroids, components?, delaunay?, n?,
 * adj?, edges?, triangles? }.
 */
export function centroidDelaunayGraph(mask) {
  const { components } = tracedGridToComponents(mask);
  const centroids = componentsToCentroids(components, mask);
  if (components.length < 3) {
    return {
      status: 'insufficient',
      n_components: components.length,
      centroids,
      components,
    };
  }
  const delaunay = bowyerWatsonDelaunay(centroids);
  const g = graphFromEdges(delaunay.edges);
  return {
    status: 'ok',
    n_components: components.length,
    centroids,
    components,
    delaunay,
    n: g.n,
    adj: g.adj,
    edges: delaunay.edges,
    triangles: delaunay.triangles,
  };
}

/**
 * Connected components of a graph adjacency array (BFS, node order pinned:
 * scan 0..n-1, neighbors in stored order). Returns array of
 * { nodes: [ids], size } ordered by smallest node id.
 */
export function graphComponents(adj) {
  const n = adj.length;
  const seen = new Array(n).fill(false);
  const comps = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    seen[s] = true;
    const nodes = [s];
    for (let qi = 0; qi < nodes.length; qi++) {
      for (const v of adj[nodes[qi]]) {
        if (!seen[v]) {
          seen[v] = true;
          nodes.push(v);
        }
      }
    }
    comps.push({ nodes, size: nodes.length });
  }
  return comps;
}

/**
 * Largest connected component of an adjacency array (walk guard, step 5 of
 * the preregistration). Tie -> the component whose smallest node id is
 * lowest. Returns { nodes (sorted ascending), size, n_components }.
 */
export function largestConnectedComponent(adj) {
  const comps = graphComponents(adj);
  let best = comps[0];
  for (const c of comps) {
    if (c.size > best.size || (c.size === best.size && c.nodes[0] < best.nodes[0])) best = c;
  }
  return { nodes: best.nodes.slice().sort((a, b) => a - b), size: best.size, n_components: comps.length };
}

/**
 * Centroid walk mode (preregistration step 4): unweighted hop-count walk on
 * the centroid Delaunay graph, DELEGATING to the canonical module's
 * randomWalks + walkDimensions unchanged. mask: 0/1 rows. opts:
 * { walkers = 64, seed (required finite number), k = 4, startRule }.
 * Disconnected Delaunay graph -> walk the largest component only (relabeled
 * subgraph) and report n_components + component_sizes; never merge.
 * Fewer than 3 components -> { status: 'insufficient', d_w: null, ... }.
 */
export function walkCentroidMode(mask, opts = {}) {
  const graph = centroidDelaunayGraph(mask);
  if (graph.status === 'insufficient') {
    return {
      status: 'insufficient',
      n_components: graph.n_components,
      centroids: graph.centroids,
      d_w: null,
      alpha_msd: null,
      walk: null,
    };
  }
  let adj = graph.adj;
  let walkedNodes = null;
  const comps = graphComponents(adj);
  if (comps.length > 1) {
    const largest = largestConnectedComponent(adj);
    const remap = new Map(largest.nodes.map((old, i) => [old, i]));
    adj = largest.nodes.map((old) => graph.adj[old].map((v) => remap.get(v)).sort((a, b) => a - b));
    walkedNodes = largest.nodes;
  }
  const walk = randomWalks({ adj }, {
    walkers: opts.walkers === undefined ? 64 : opts.walkers,
    seed: opts.seed,
    k: opts.k,
    startRule: opts.startRule,
  });
  const dims = walkDimensions(walk);
  return {
    status: 'ok',
    n_components: comps.length,
    component_sizes: comps.map((c) => c.size),
    walked_nodes: walkedNodes,
    centroids: graph.centroids,
    edges: graph.edges,
    triangles: graph.triangles,
    n: adj.length,
    adj,
    walk,
    dims,
    d_w: dims.d_w,
    alpha_msd: dims.alpha_msd,
  };
}

/**
 * Secondary diagnostic (preregistration step 3 — NEVER a gate): radius graph
 * at r = 1.5 * median nearest-neighbor spacing. points: [[x, y], ...].
 * Returns { r, median_nn, nn_distances, n_edges, edges } with edges as
 * canonical [min, max] index pairs sorted lexicographically. Distance rule
 * P10: d = Math.sqrt(dx*dx + dy*dy), edge iff d <= r.
 */
export function radiusGraphDiagnostic(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error('radiusGraphDiagnostic: need at least 2 points');
  }
  const n = points.length;
  const nn = new Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i][0] - points[j][0];
      const dy = points[i][1] - points[j][1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nn[i]) nn[i] = d;
      if (d < nn[j]) nn[j] = d;
    }
  }
  const sorted = nn.slice().sort((a, b) => a - b);
  const mid = Math.floor((n - 1) / 2);
  const median = n % 2 === 1 ? sorted[mid] : (sorted[mid] + sorted[mid + 1]) / 2;
  const r = 1.5 * median;
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i][0] - points[j][0];
      const dy = points[i][1] - points[j][1];
      if (Math.sqrt(dx * dx + dy * dy) <= r) edges.push([i, j]);
    }
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { r, median_nn: median, nn_distances: sorted, n_edges: edges.length, edges };
}
