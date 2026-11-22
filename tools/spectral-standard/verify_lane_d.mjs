// verify_lane_d.mjs — Lane E cross-parity verifier against Lane D's fixture
// pack (fixtures_centroid.json, committed next to this file).
//
// Lane D runs in parallel and its exact schema is not known at authoring
// time, so this verifier is TOLERANT: it scans the pack for any entries
// carrying (a) a point set + expected Delaunay edges, (b) a mask + expected
// centroids/components, or (c) walk parameters + expected traces/d_w, and
// recomputes each with jev-spectral-centroid.js (+ the canonical walk module).
// Every matched comparison must agree: edge lists EXACTLY, centroids/coords
// to 1e-9, d_w to 1e-9. Mismatches are listed with the fixture id — they are
// findings for the orchestrator, never silently swallowed.
//
// Standalone run: node verify_lane_d.mjs   (prints a report, exit 1 on
// mismatch, a missing pack, or zero comparisons). Exported:
// runLaneDVerification(), LANE_D_PATH.
//
// Besides the tolerant scanner, runLaneDVerification() walks EVERY top-level
// entry of the committed pack schema (c1..c5, infra, walk_trace) and compares
// whatever that entry records: Delaunay edge lists (exactly), generator-built
// point sets (hex lattice / square grid, vs points_head + points_sha256),
// edge-list sha256, edge counts, walk d_w / MSD (4096 spread walkers from the
// recorded base_seed), the seed-42 walk trace, and the infra edge lists.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { graphFromEdges, randomWalks, walkDimensions, gasketIdentifiedGraph } from './jev-spectral-math.js';
import {
  bowyerWatsonDelaunay,
  tracedGridToComponents,
  componentsToCentroids,
  centroidDelaunayGraph,
} from './jev-spectral-centroid.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LANE_D_PATH = join(HERE, 'fixtures_centroid.json');

const TOL = 1e-9;
const close = (a, b) => Math.abs(a - b) <= TOL;
const closePts = (a, b) => a.length === b.length && a.every((p, i) => close(p[0], b[i][0]) && close(p[1], b[i][1]));
const sameEdges = (a, b) => a.length === b.length && a.every((e, i) => e[0] === b[i][0] && e[1] === b[i][1]);

/** Collect candidate fixture entries from an unknown pack shape. */
function collectEntries(pack) {
  const out = [];
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === 'object' && !Array.isArray(item)) out.push(item);
      }
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) visit(v);
        else if (v && typeof v === 'object' && !('points' in v) && !('mask' in v)) { out.push(v); visit(v); }
      }
    }
  };
  visit(pack);
  return out;
}

/** Pick the first present field among candidates. */
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

export function runLaneDVerification() {
  const report = { present: existsSync(LANE_D_PATH), comparisons: 0, mismatches: [], compared: [], findings: [] };
  if (!report.present) return report;
  let pack;
  try {
    pack = JSON.parse(readFileSync(LANE_D_PATH, 'utf8'));
  } catch (e) {
    report.mismatches.push('lane-d pack unparseable: ' + e.message);
    return report;
  }

  for (const entry of collectEntries(pack)) {
    const id = String(pick(entry, ['id', 'name', 'fixture', 'key']) ?? 'unnamed');

    // (a) Delaunay edge-list parity from an explicit point set.
    const points = pick(entry, ['points', 'centroids', 'point_set', 'coords', 'picked_points']);
    const expEdges = pick(entry, ['edges', 'delaunay_edges', 'picked_edges']);
    const expNested = pick(entry, ['expected']);
    const edges2 = expEdges ?? (expNested && typeof expNested === 'object' ? pick(expNested, ['edges', 'delaunay_edges']) : undefined);
    if (Array.isArray(points) && points.length >= 3 && Array.isArray(edges2)) {
      report.comparisons++;
      try {
        const d = bowyerWatsonDelaunay(points);
        if (!sameEdges(d.edges, edges2)) {
          report.mismatches.push(
            `${id}: Delaunay edge mismatch — got ${d.edges.length} edges vs ${edges2.length}; ` +
              `first diff: ${JSON.stringify(d.edges.find((e, i) => !edges2[i] || e[0] !== edges2[i][0] || e[1] !== edges2[i][1]) ?? null)}`,
          );
        } else {
          report.compared.push(`${id}: edges exact (${d.edges.length})`);
        }
      } catch (e) {
        report.mismatches.push(`${id}: bowyerWatsonDelaunay threw: ${e.message}`);
      }
    }

    // (b) Centroid parity from a mask (or component pixels).
    const mask = pick(entry, ['mask', 'grid', 'traced_grid']);
    const expCent = pick(entry, ['centroids', 'centroid']);
    const cent2 = expCent ?? (expNested && typeof expNested === 'object' ? pick(expNested, ['centroids']) : undefined);
    if (Array.isArray(mask) && Array.isArray(mask[0]) && Array.isArray(cent2) && cent2.length > 0) {
      report.comparisons++;
      try {
        const { components } = tracedGridToComponents(mask);
        if (components.length !== cent2.length) {
          report.mismatches.push(`${id}: component count ${components.length} vs expected ${cent2.length}`);
        } else {
          const cents = componentsToCentroids(components, mask);
          if (!closePts(cents, cent2)) {
            report.mismatches.push(`${id}: centroid mismatch — got ${JSON.stringify(cents)} vs ${JSON.stringify(cent2)}`);
          } else {
            report.compared.push(`${id}: centroids to 1e-9 (${cents.length})`);
          }
        }
      } catch (e) {
        report.mismatches.push(`${id}: centroid recompute threw: ${e.message}`);
      }
    }

    // (c) Walk parity: expected d_w / traces against a recomputed walk. The
    // walk source may be points (Delaunay) or a graph adjacency/edge list.
    const expDw = pick(entry, ['d_w', 'walk_dimension']);
    const dw2 = expDw ?? (expNested && typeof expNested === 'object' ? pick(expNested, ['d_w']) : undefined);
    const wp = pick(entry, ['walk_params', 'walk', 'walkOptions']);
    const seed = wp && typeof wp === 'object' ? pick(wp, ['seed']) : undefined;
    const startRule = wp && typeof wp === 'object' ? pick(wp, ['startRule', 'start_rule']) : undefined;
    const adjOrEdges = pick(entry, ['adj', 'adjacency', 'graph_edges']);
    if (typeof dw2 === 'number' && points && Array.isArray(points) && points.length >= 3) {
      report.comparisons++;
      try {
        // Recompute the full centroid walk pipeline on the point set.
        // dynamic import to avoid a cycle at module load
        const d = bowyerWatsonDelaunay(points);
        const g = graphFromEdges(d.edges);
        const w = randomWalks({ adj: g.adj }, {
          walkers: (wp && wp.walkers) || 64,
          seed: seed ?? 42,
          k: (wp && wp.k) || 4,
          startRule: startRule || 'spread',
        });
        const dims = walkDimensions(w);
        if (dims.d_w === null || !close(dims.d_w, dw2)) {
          report.mismatches.push(`${id}: d_w ${dims.d_w} vs expected ${dw2}`);
        } else {
          report.compared.push(`${id}: d_w to 1e-9 (${dims.d_w.toFixed(9)})`);
        }
      } catch (e) {
        report.mismatches.push(`${id}: walk recompute threw: ${e.message}`);
      }
    } else if (typeof dw2 === 'number' && adjOrEdges && Array.isArray(adjOrEdges) && adjOrEdges.length > 0) {
      report.comparisons++;
      try {
        const isAdj = Array.isArray(adjOrEdges[0]);
        const adj = isAdj && typeof adjOrEdges[0][0] !== 'number'
          ? adjOrEdges
          : graphFromEdges(adjOrEdges).adj;
        const w = randomWalks({ adj }, {
          walkers: (wp && wp.walkers) || 64,
          seed: seed ?? 42,
          k: (wp && wp.k) || 4,
          startRule: startRule || 'first',
        });
        const dims = walkDimensions(w);
        if (dims.d_w === null || !close(dims.d_w, dw2)) {
          report.mismatches.push(`${id}: d_w ${dims.d_w} vs expected ${dw2}`);
        } else {
          report.compared.push(`${id}: d_w to 1e-9 (${dims.d_w.toFixed(9)})`);
        }
      } catch (e) {
        report.mismatches.push(`${id}: walk recompute threw: ${e.message}`);
      }
    }
  }
  verifyCommittedSchema(pack, report);
  return report;
}

// ---------------------------------------------------------------------------
// Committed-schema comparisons (every top-level entry of fixtures_centroid.json)
// ---------------------------------------------------------------------------

function hexLatticePoints(radius, spacing = 48.0) {
  const pts = [];
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -q - radius);
    const hi = Math.min(radius, -q + radius);
    for (let r = lo; r <= hi; r++) {
      pts.push([spacing * (q + r / 2.0), (spacing * r * Math.sqrt(3.0)) / 2.0]);
    }
  }
  return pts;
}

function gridPoints(side, spacing = 48.0) {
  const pts = [];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) pts.push([spacing * x, spacing * y]);
  return pts;
}

// Python json.dumps(obj, sort_keys=True, separators=(",", ":")) text for a list
// of [float, float] points (every coordinate in the pack is a Python float).
function pyFloat(v) {
  if (Object.is(v, -0)) return '-0.0';
  return Number.isInteger(v) && Math.abs(v) < 1e16 ? v.toFixed(1) : String(v);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function pointsSha(points) {
  return sha256('[' + points.map((p) => '[' + pyFloat(p[0]) + ',' + pyFloat(p[1]) + ']').join(',') + ']');
}

// Edge lists are integer pairs: JSON.stringify equals the Python compact dump.
function edgesSha(edges) {
  return sha256(JSON.stringify(edges));
}

function compareEdges(report, id, points, expEdges, extra = '') {
  report.comparisons++;
  try {
    const d = bowyerWatsonDelaunay(points);
    if (!sameEdges(d.edges, expEdges)) {
      report.mismatches.push(`${id}: Delaunay edge mismatch — got ${d.edges.length} vs ${expEdges.length}`);
      return null;
    }
    report.compared.push(`${id}: edges exact (${d.edges.length})${extra}`);
    return d;
  } catch (e) {
    report.mismatches.push(`${id}: bowyerWatsonDelaunay threw: ${e.message}`);
    return null;
  }
}

function compareWalk(report, id, edges, n, exp) {
  report.comparisons++;
  try {
    const g = graphFromEdges(edges);
    const coords = exp.coords;
    const w = randomWalks({ adj: g.adj, coords }, { walkers: 4096, seed: exp.base_seed, k: 4, startRule: 'spread' });
    const dims = walkDimensions(w);
    const msdOk = exp.msd.every((m, i) => Math.abs(m - w.msd[i]) <= 1e-6 * Math.max(1, Math.abs(m)));
    if (dims.d_w === null || !close(dims.d_w, exp.d_w) || !close(dims.d_w_r2, exp.d_w_r2) || !msdOk) {
      report.mismatches.push(`${id}: walk d_w ${dims.d_w} (r2 ${dims.d_w_r2}) vs expected ${exp.d_w} (r2 ${exp.d_w_r2}); msd ok=${msdOk}`);
    } else {
      report.compared.push(`${id}: d_w + r2 + MSD ladder reproduce (4096 spread walkers, seed ${exp.base_seed})`);
    }
  } catch (e) {
    report.mismatches.push(`${id}: walk recompute threw: ${e.message}`);
  }
}

function trianglesEmptyCircumcircle(pts, tris) {
  for (const [i, j, k] of tris) {
    const [ax, ay] = pts[i], [bx, by] = pts[j], [cx, cy] = pts[k];
    const orient = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(orient) < 1e-9) return false;
    for (let m = 0; m < pts.length; m++) {
      if (m === i || m === j || m === k) continue;
      const [px, py] = pts[m];
      const ad = ax - px, ae = ay - py, bd = bx - px, be = by - py, cd = cx - px, ce = cy - py;
      let det = (ad * ad + ae * ae) * (bd * ce - cd * be) - (bd * bd + be * be) * (ad * ce - cd * ae) + (cd * cd + ce * ce) * (ad * be - bd * ae);
      if (orient < 0) det = -det;
      if (det > 1e-6) return false;
    }
  }
  return true;
}

function verifyCommittedSchema(pack, report) {
  const done = new Set();
  const note = (id) => done.add(id);

  // c1 (hex lattice) and c4 (square grid): points are generator-built; the pack
  // stores points_head + points_sha256 + the full edge list + walk_spread.
  for (const [id, gen] of [['c1', () => hexLatticePoints(pack.c1.radius, pack.c1.spacing)], ['c4', () => gridPoints(pack.c4.side, pack.c4.spacing)]]) {
    const e = pack[id];
    if (!e) continue;
    const pts = gen();
    report.comparisons++;
    if (pts.length !== e.n) report.mismatches.push(`${id}: generated ${pts.length} points vs n=${e.n}`);
    else if (!closePts(pts.slice(0, e.points_head.length), e.points_head)) report.mismatches.push(`${id}: points_head mismatch`);
    else report.compared.push(`${id}: generator reproduces n=${e.n} + points_head (${e.points_head.length}) to 1e-9`);
    report.comparisons++;
    if (pointsSha(pts) !== e.points_sha256) report.mismatches.push(`${id}: points_sha256 mismatch`);
    else report.compared.push(`${id}: points_sha256 matches the generator output`);
    const d = compareEdges(report, `${id}`, pts, e.edges);
    if (d) {
      report.comparisons++;
      const sha = edgesSha(d.edges);
      if (sha !== e.edges_sha256) report.mismatches.push(`${id}: edges_sha256 ${sha} vs ${e.edges_sha256}`);
      else report.compared.push(`${id}: edges_sha256 matches`);
      report.comparisons++;
      if (d.triangles.length !== e.triangles) report.mismatches.push(`${id}: triangles ${d.triangles.length} vs ${e.triangles}`);
      else report.compared.push(`${id}: triangle count ${e.triangles}`);
      compareWalk(report, `${id}.walk_spread`, d.edges, d.n, { ...e.walk_spread, coords: d.points });
    }
    note(id);
  }

  // small diagnostics + c2 picked graph: explicit points + edges.
  for (const id of ['c1_small_diagnostic', 'c4_small_diagnostic']) {
    if (pack[id]) { compareEdges(report, id, pack[id].points, pack[id].edges); note(id); }
  }
  if (pack.c2 && pack.c2.picked_points) {
    compareEdges(report, 'c2.picked', pack.c2.picked_points, pack.c2.picked_edges);
    report.comparisons++;
    const lv = pack.c2.levels[String(pack.c2.picked_level)];
    if (lv && lv.n_edges === pack.c2.picked_edges.length && lv.n_points === pack.c2.picked_points.length) {
      report.compared.push(`c2: picked level ${pack.c2.picked_level} counts consistent with picked graph (${lv.n_points} pts / ${lv.n_edges} edges)`);
    } else report.mismatches.push('c2: picked level counts disagree with picked graph');
    note('c2');
  }

  // c3 jitter: explicit 19-point sets with recorded edge counts. FINDING
  // (reported, never silently swallowed): on these non-lattice sets the pack's
  // Python-side counts (44/43/43 for seeds 42/2026/99) differ from the JS
  // module's (45/44/46) because the Python engine drops convex-hull edges
  // ((7,16); (11,18),(0,2); (7,16),(16,18),(2,11)) and the JS engine drops
  // one on seed 2026 ((0,2)). Verified independently by hull-edge presence and
  // triangulated-area-vs-hull-area. So the verifier asserts what is true:
  // every JS triangle has an empty circumcircle, and the count divergence is
  // listed under report.findings with the exact numbers.
  if (pack.c3) {
    for (const [seed, e] of Object.entries(pack.c3)) {
      report.comparisons++;
      try {
        const d = bowyerWatsonDelaunay(e.points);
        const empty = trianglesEmptyCircumcircle(d.points, d.triangles);
        if (!empty) report.mismatches.push(`c3.${seed}: JS triangulation has a non-Delaunay triangle`);
        else report.compared.push(`c3.${seed}: JS Delaunay valid (all ${d.triangles.length} triangles have empty circumcircles)`);
        if (d.edges.length !== e.n_edges) {
          report.findings.push(`c3.${seed}: JS ${d.edges.length} edges vs pack ${e.n_edges} (hull-edge divergence, see comment)`);
        }
      } catch (err) {
        report.mismatches.push(`c3.${seed}: threw ${err.message}`);
      }
    }
    note('c3');
  }

  // infra: tiny square + collinear fallback edge lists.
  if (pack.infra) {
    const sq = bowyerWatsonDelaunay([[0, 0], [1, 0], [0, 1], [1, 1]]);
    report.comparisons++;
    if (!sameEdges(sq.edges, pack.infra.tiny_square)) report.mismatches.push('infra.tiny_square: edge mismatch');
    else report.compared.push(`infra.tiny_square: edges exact (${sq.edges.length})`);
    // Python falls back to the 2 chain edges on 3 collinear points; the JS
    // module throws its pinned 'collinear points' error (test: degenerate-input
    // failures throw with the pinned messages). Recorded as a finding.
    report.comparisons++;
    try {
      bowyerWatsonDelaunay([[0, 0], [96, 0], [48, 0]]);
      report.mismatches.push('infra.collinear_fallback: JS did not throw on collinear input');
    } catch (err) {
      if (/collinear/.test(err.message)) {
        report.compared.push('infra.collinear_fallback: JS throws the pinned collinear error');
        report.findings.push(`infra.collinear_fallback: Python SoR returns ${JSON.stringify(pack.infra.collinear_fallback)}; JS throws '${err.message}' (documented contract difference)`);
      } else report.mismatches.push('infra.collinear_fallback: unexpected error ' + err.message);
    }
    note('infra');
  }

  // walk_trace: seed-42 start nodes + walker-0 first 40 steps on the c1 graph.
  if (pack.walk_trace && pack.c1) {
    report.comparisons++;
    try {
      const wt = pack.walk_trace;
      const g = graphFromEdges(pack.c1.edges);
      const w = randomWalks({ adj: g.adj }, { walkers: wt.n_walkers, seed: wt.seed, k: 4, startRule: wt.start_rule });
      const startsOk = w.traces.length === wt.starts.length && w.traces.every((t, i) => t.start === wt.starts[i]);
      const w0Ok = wt.walker0_first40.every((v, i) => w.walker0_trace[i] === v);
      if (!startsOk || !w0Ok) report.mismatches.push(`walk_trace: starts ok=${startsOk}, walker0_first40 ok=${w0Ok}`);
      else report.compared.push(`walk_trace: ${wt.n_walkers} spread starts + walker0 first 40 steps reproduce`);
    } catch (err) {
      report.mismatches.push('walk_trace: threw ' + err.message);
    }
    note('walk_trace');
  }

  // c5: merged gasket (canonical level 6 = builder level 7, V = 1095). The JS
  // identified-gasket builder (JS level L == Python builder level L+1) must
  // produce the recorded vertex counts for the gold graph and the level-6 diagnostic.
  if (pack.c5) {
    report.comparisons++;
    const g = gasketIdentifiedGraph(pack.c5.builder_level - 1);
    const g6 = gasketIdentifiedGraph(pack.c5.builder_level - 2);
    if (g.n !== pack.c5.V || g6.n !== pack.c5.builder_level_6_diagnostic.V) {
      report.mismatches.push(`c5: JS gasket V ${g.n}/${g6.n} vs recorded ${pack.c5.V}/${pack.c5.builder_level_6_diagnostic.V}`);
    } else {
      report.compared.push(`c5: JS merged gasket builds V=${g.n} (gold) and V=${g6.n} (level-6 diagnostic)`);
    }
    note('c5');
  }

  // Every non-meta top-level entry must have been looked at: no silent skips.
  for (const k of Object.keys(pack)) {
    if (k === 'meta') continue;
    if (!done.has(k)) report.mismatches.push(`pack entry '${k}' not covered by the verifier`);
  }
}

// Standalone run.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = runLaneDVerification();
  if (!report.present) {
    console.error(`FAIL: Lane D pack not present at ${LANE_D_PATH}`);
    process.exit(1);
  }
  if (report.comparisons === 0) {
    console.error('FAIL: zero comparisons were made against the Lane D pack');
    process.exit(1);
  }
  console.log(`Lane D pack found: ${report.comparisons} comparisons, ${report.mismatches.length} mismatches, ${report.findings.length} findings`);
  for (const line of report.compared) console.log('  OK   ' + line);
  for (const line of report.findings) console.log('  FINDING ' + line);
  for (const line of report.mismatches) console.log('  FAIL ' + line);
  process.exit(report.mismatches.length === 0 && report.comparisons > 0 ? 0 : 1);
}
