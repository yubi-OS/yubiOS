// verify_lane_d.mjs — Lane E cross-parity verifier against Lane D's fixture
// pack (fixtures_centroid.json in /var/workspace/session/subagent/lane-d/).
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
// mismatch or zero comparisons). Exported: runLaneDVerification(), LANE_D_PATH.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { graphFromEdges, randomWalks, walkDimensions } from './jev-spectral-math.js';
import {
  bowyerWatsonDelaunay,
  tracedGridToComponents,
  componentsToCentroids,
  centroidDelaunayGraph,
} from './jev-spectral-centroid.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LANE_D_PATH = '/var/workspace/session/subagent/lane-d/fixtures_centroid.json';

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
  const report = { present: existsSync(LANE_D_PATH), comparisons: 0, mismatches: [], compared: [] };
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
  return report;
}

// Standalone run.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const report = runLaneDVerification();
  if (!report.present) {
    console.log(`Lane D pack not present at ${LANE_D_PATH} — nothing to verify yet.`);
    process.exit(0);
  }
  console.log(`Lane D pack found: ${report.comparisons} comparisons, ${report.mismatches.length} mismatches`);
  for (const line of report.compared) console.log('  OK   ' + line);
  for (const line of report.mismatches) console.log('  FAIL ' + line);
  process.exit(report.mismatches.length === 0 && report.comparisons > 0 ? 0 : 1);
}
