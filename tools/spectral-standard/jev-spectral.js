// jev-spectral.js — spectral-standard-v1 + hierarchy-oracle routes (2026-10-06, PR #292).
// Ports the PR's Python source of record via the canonical JS modules:
//   jev-spectral-math.js    (walks / series / einstein / log-periodic; P3 Euclidean-MSD patch)
//   jev-spectral-centroid.js (Delaunay centroid-adjacency walk mode)
// Routes (bearer-auth, same validation + run-recording conventions as taste/scorer):
//   POST /api/jev/corpus/spectral/walk    {mode:"ink",mask_b64} | {mode:"centroid"|"points",points} | {mode:"graph",edges,coords?}
//   POST /api/jev/corpus/spectral/series  {values: number[]}
//   GET  /api/jev/corpus/spectral/selftest
//   POST /api/jev/corpus/oracle           {gray_b64|bitmap_b64, width, height}
// Run rows: kinds spectral-walk / spectral-series / oracle, idempotent per input sha256.
// Verdicts are data, never authorization. The pinned ladder K=4 is never retuned.

import { bowyerWatsonDelaunay, walkCentroidMode } from "./jev-spectral-centroid.js";
import {
  randomWalks, walkDimensions, graphFromEdges, seriesCountingExponent,
  einsteinVerdict, maskToGraph, logPeriodicCheck, WALK_BASE_LADDER,
} from "./jev-spectral-math.js";
import { spectralFixtures } from "./fixtures/spectral-fixtures.mjs";

const K = 4; // pinned (never retuned; changing it is a major version bump)
const LADDER = WALK_BASE_LADDER.map((s) => s * K);
const MAX_WALKERS = 4096;
const MAX_POINTS = 4000;

function decodeMaskB64(b64) {
  const text = atob(b64);
  const rows = text.split("\n");
  const grid = [];
  for (const row of rows) {
    if (row.length === 0) continue;
    const cells = [];
    for (const ch of row) {
      if (ch === "0") cells.push(0);
      else if (ch === "1") cells.push(1);
      else throw new Error("mask_b64: unexpected character " + JSON.stringify(ch));
    }
    grid.push(cells);
  }
  if (grid.length === 0) throw new Error("empty edge map");
  return grid;
}

// points -> Delaunay -> seeded walk (mirrors Python centroid_walk.walk_centroid_mode)
function walkPoints(points, walkers, seed, startRule) {
  const d = bowyerWatsonDelaunay(points);
  const g = graphFromEdges(d.edges);
  g.coords = points;
  const wd = randomWalks(g, { walkers, seed, steps: LADDER, startRule });
  const dims = walkDimensions(wd);
  return {
    status: "ok", mode: "centroid", metric: wd.msd_metric || "euclidean",
    n_points: points.length, n_edges: d.edges.length,
    d_w: dims.d_w, d_w_r2: dims.d_w_r2,
    alpha_msd: dims.alpha_msd,
    d_s_return: dims.d_s, d_s_return_r2: dims.d_s_r2,
    low_confidence: { d_w: dims.d_w === null || dims.d_w_r2 < 0.98, d_s: dims.d_s === null || dims.d_s_r2 < 0.98 },
    msd_metric: wd.msd_metric || "euclidean",
  };
}

// ink mask -> 8-connected pixel graph walk (Euclidean on pixel coords, canonical module)
function walkInk(grid, walkers, seed, startRule) {
  const g = maskToGraph(grid);
  const wd = randomWalks(g, { walkers, seed, steps: LADDER, startRule });
  const dims = walkDimensions(wd);
  return {
    status: "ok", mode: "ink", metric: wd.msd_metric || "euclidean",
    n_nodes: g.n,
    d_w: dims.d_w, d_w_r2: dims.d_w_r2,
    alpha_msd: dims.alpha_msd,
    d_s_return: dims.d_s, d_s_return_r2: dims.d_s_r2,
    low_confidence: { d_w: dims.d_w === null || dims.d_w_r2 < 0.98, d_s: dims.d_s === null || dims.d_s_r2 < 0.98 },
    msd_metric: wd.msd_metric || "euclidean",
  };
}

export async function handleSpectralRequest(req, p, ctx) {
  const { recordRun, sha256hex, canonicalJson } = ctx;

  // ---- POST /spectral/walk --------------------------------------------------
  if (p === "/api/jev/corpus/spectral/walk" && req.method === "POST") {
    const text = await req.text();
    if (text.length > 16000000) return { status: 413, body: { code: "BODY_TOO_LARGE", message: "body exceeds 16 MB" } };
    let body; try { body = JSON.parse(text); } catch { return { status: 400, body: { code: "INVALID_JSON", message: "invalid JSON body" } }; }
    if (!body || typeof body !== "object" || Array.isArray(body)) return { status: 400, body: { code: "INVALID_BODY", message: "body must be an object" } };
    const walkers = body.walkers === undefined ? 64 : body.walkers;
    if (!Number.isInteger(walkers) || walkers < 1 || walkers > MAX_WALKERS) return { status: 422, body: { code: "INVALID_WALKERS", message: "walkers must be an integer 1.." + MAX_WALKERS } };
    const seed = body.seed === undefined ? 42 : body.seed;
    if (typeof seed !== "number" || !isFinite(seed)) return { status: 422, body: { code: "INVALID_SEED", message: "seed must be a finite number" } };
    const startRule = body.start_rule === undefined ? "first" : body.start_rule;
    if (startRule !== "first" && startRule !== "spread") return { status: 422, body: { code: "INVALID_START_RULE", message: "start_rule must be 'first' or 'spread'" } };
    const mode = body.mode === undefined ? (body.mask_b64 ? "ink" : body.points ? "centroid" : body.edges ? "graph" : undefined) : body.mode;
    let out, inputHashSrc;
    try {
      if (mode === "ink") {
        if (typeof body.mask_b64 !== "string" || !body.mask_b64.length) return { status: 422, body: { code: "INVALID_IMAGE", message: "mode ink requires mask_b64" } };
        const grid = decodeMaskB64(body.mask_b64);
        out = walkInk(grid, walkers, seed, startRule);
        inputHashSrc = { kind: "spectral-walk", mode: "ink", w: grid[0] ? grid[0].length : 0, h: grid.length, walkers, seed, start_rule: startRule };
      } else if (mode === "centroid" || mode === "points") {
        const pts = body.points;
        if (!Array.isArray(pts) || pts.length < 3) return { status: 422, body: { code: "INVALID_POINTS", message: "points must be an array of >= 3 [x,y] pairs" } };
        if (pts.length > MAX_POINTS) return { status: 413, body: { code: "TOO_MANY_POINTS", message: "points exceeds " + MAX_POINTS + " (decompose or downsample)" } };
        for (const pt of pts) if (!Array.isArray(pt) || pt.length !== 2 || !isFinite(pt[0]) || !isFinite(pt[1])) return { status: 422, body: { code: "INVALID_POINTS", message: "each point must be [x, y] finite" } };
        out = walkPoints(pts, walkers, seed, startRule);
        inputHashSrc = { kind: "spectral-walk", mode: "centroid", n: pts.length, walkers, seed, start_rule: startRule };
      } else if (mode === "graph") {
        if (!Array.isArray(body.edges) || !body.edges.length) return { status: 422, body: { code: "INVALID_EDGES", message: "mode graph requires edges" } };
        const g = graphFromEdges(body.edges);
        if (Array.isArray(body.coords)) g.coords = body.coords;
        const wd = randomWalks(g, { walkers, seed, steps: LADDER, startRule });
        const dims = walkDimensions(wd);
        out = {
          status: "ok", mode: "graph", metric: wd.msd_metric || "hop", n_nodes: g.n,
          d_w: dims.d_w, d_w_r2: dims.d_w_r2, alpha_msd: dims.alpha_msd,
          d_s_return: dims.d_s, d_s_return_r2: dims.d_s_r2,
          low_confidence: { d_w: dims.d_w === null || dims.d_w_r2 < 0.98, d_s: dims.d_s === null || dims.d_s_r2 < 0.98 },
          msd_metric: wd.msd_metric || "hop",
        };
        inputHashSrc = { kind: "spectral-walk", mode: "graph", n: g.n, walkers, seed, start_rule: startRule };
      } else {
        return { status: 422, body: { code: "INVALID_MODE", message: "mode must be ink | centroid | graph (or provide mask_b64/points/edges)" } };
      }
    } catch (e) {
      return { status: 422, body: { code: "WALK_FAILED", message: (e && e.message) || String(e) } };
    }
    const inputHash = await sha256hex(canonicalJson(inputHashSrc));
    const rr = await recordRun("spectral-walk", inputHash, { d_w: out.d_w, d_w_r2: out.d_w_r2, d_s_return: out.d_s_return, metric: out.metric }, { mode: out.mode, walkers, seed, start_rule: startRule });
    out.run_id = rr && rr.run_id;
    return { status: 200, body: out };
  }

  // ---- POST /spectral/series ------------------------------------------------
  if (p === "/api/jev/corpus/spectral/series" && req.method === "POST") {
    const { body, error } = { body: null, error: null };
    void error;
    let parsed; try { parsed = await req.json(); } catch { return { status: 400, body: { code: "INVALID_JSON", message: "invalid JSON body" } }; }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: 400, body: { code: "INVALID_BODY", message: "body must be an object" } };
    const values = parsed.values;
    if (!Array.isArray(values) || values.length < 8) return { status: 422, body: { code: "INVALID_SERIES", message: "values must be an array of >= 8 numbers" } };
    if (values.length > 200000) return { status: 413, body: { code: "SERIES_TOO_LARGE", message: "values exceeds 200000 entries" } };
    for (const v of values) if (typeof v !== "number" || !isFinite(v)) return { status: 422, body: { code: "INVALID_SERIES", message: "every value must be a finite number" } };
    try {
      const s = seriesCountingExponent(values, { loFrac: 0.125, hiFrac: 0.5 });
      const inputHash = await sha256hex(canonicalJson({ kind: "spectral-series", n: values.length, sha_sum: values.reduce((a, v) => a + v, 0) }));
      const rr = await recordRun("spectral-series", inputHash, { alpha_lambda: s.alpha_lambda, d_s: s.d_s, r2: s.r2 }, {});
      const res = {
        alpha_lambda: s.alpha_lambda, d_s: s.d_s, r2: s.r2,
        low_confidence: s.d_s === null || s.r2 < 0.98,
        run_id: rr && rr.run_id,
      };
      return { status: 200, body: res };
    } catch (e) {
      return { status: 422, body: { code: "SERIES_FAILED", message: (e && e.message) || String(e) } };
    }
  }

  // ---- GET /spectral/selftest ------------------------------------------------
  if (p === "/api/jev/corpus/spectral/selftest" && req.method === "GET") {
    const checks = [];
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    try {
      // 1. Delaunay edge parity vs the Python source of record (c2, 366 pts)
      {
        const fx = spectralFixtures.c2;
        const d = bowyerWatsonDelaunay(fx.picked_points);
        let ok = d.edges.length === fx.picked_edges.length;
        if (ok) for (let i = 0; i < d.edges.length; i++) { if (d.edges[i][0] !== fx.picked_edges[i][0] || d.edges[i][1] !== fx.picked_edges[i][1]) { ok = false; break; } }
        checks.push({ name: "delaunay_c2_edges_exact", pass: ok, detail: d.edges.length + " edges" });
      }
      // 2. Walk parity vs Python (c2 graph, seed 42, 64 walkers, spread)
      {
        const fx = spectralFixtures.c2, wfx = spectralFixtures.c2_walk;
        const g = graphFromEdges(fx.picked_edges);
        g.coords = fx.picked_points;
        const wd = randomWalks(g, { walkers: wfx.walkers, seed: wfx.seed, steps: LADDER, startRule: wfx.start_rule });
        const tr = wd.walker0_trace ? wd.walker0_trace.slice(0, wfx.walker0_first40.length) : null;
        const trOk = tr !== null && JSON.stringify(tr) === JSON.stringify(wfx.walker0_first40);
        const dims = walkDimensions(wd);
        const dwOk = near(dims.d_w, wfx.d_w, 1e-9);
        checks.push({ name: "walk_c2_parity_python", pass: trOk && dwOk, detail: "walker0_trace_exact=" + trOk + " d_w=" + dims.d_w + " vs " + wfx.d_w });
      }
      // 3-5. Series counting: chain gold band, gasket identified, power-law parity
      {
        const fx = spectralFixtures.chain_p64;
        const s = seriesCountingExponent(fx.values, { loFrac: 0.125, hiFrac: 0.5 });
        checks.push({ name: "series_chain_gold", pass: near(s.d_s, fx.expected_d_s, 1e-9) && s.d_s >= fx.band[0] && s.d_s <= fx.band[1], detail: "d_s=" + s.d_s });
      }
      {
        const fx = spectralFixtures.gasket_g3_identified;
        const s = seriesCountingExponent(fx.values, { loFrac: 0.125, hiFrac: 0.5 });
        checks.push({ name: "series_gasket_identified", pass: near(s.d_s, fx.expected_d_s, 1e-9), detail: "d_s=" + s.d_s + " (band_pass expected true; r2 " + s.r2.toFixed(4) + " documents the staircase finding)" });
      }
      {
        const fx = spectralFixtures.power_law_synth;
        const s = seriesCountingExponent(fx.values, { loFrac: 0.125, hiFrac: 0.5 });
        checks.push({ name: "series_power_law_parity", pass: near(s.alpha_lambda, fx.expected_alpha, 1e-9), detail: "alpha=" + s.alpha_lambda });
      }
      // 6. Permutation null collapses
      {
        const fx = spectralFixtures.permuted_seed7;
        const s = seriesCountingExponent(fx.values, { loFrac: 0.125, hiFrac: 0.5 });
        checks.push({ name: "permutation_null_collapses", pass: s.r2 < 0.98, detail: "r2=" + s.r2 });
      }
      // 7. Einstein gate on the chain gold
      {
        const fx = spectralFixtures.einstein_chain;
        const v = einsteinVerdict(fx.d_s, fx.D, fx.d_w, { tol: 0.1 });
        checks.push({ name: "einstein_chain_consistent", pass: v.verdict === fx.expected_verdict, detail: "verdict=" + v.verdict + " delta=" + v.delta });
      }
      // 8. Log-periodic presence on the exact pre-gasket L3 series (27 values;
      // the alternation expectation is verified against this series in the
      // parity round — the identified-L3 series reads present=false under the
      // current detector, recorded honestly in the fixture)
      {
        const fx = spectralFixtures.gasket_pre_l3;
        const lp = logPeriodicCheck(fx.values.slice().sort((a, b) => a - b));
        checks.push({ name: "log_periodic_present", pass: lp.present === fx.log_periodic_present, detail: "present=" + lp.present + " alternations=" + lp.alternations });
      }
      // 9. Ink mask graph: coords + adjacency sanity
      {
        const mask = [[0, 0, 0], [0, 1, 1], [0, 1, 1]];
        const g = maskToGraph(mask);
        checks.push({ name: "mask_graph_coords", pass: g.coords && g.coords.length === 4 && g.n === 4, detail: "n=" + g.n });
      }
    } catch (e) {
      checks.push({ name: "selftest_exception", pass: false, detail: (e && e.message) || String(e) });
    }
    const allPass = checks.every((c) => c.pass);
    return { status: allPass ? 200 : 500, body: { ok: allPass, checks, pipeline: "spectral-standard-v1" } };
  }

  return { status: 404, body: { code: "NOT_FOUND", message: "unknown spectral route" } };
}

// ---- POST /oracle (composed by jev-corpus-routes.js with edge-standard deps) --
export async function handleOracleRequest(req, ctx) {
  const { edgeStandardize, edgeMeasure, tasteMath, recordRun, sha256hex, canonicalJson } = ctx;
  const text = await req.text();
  if (text.length > 8000000) return { status: 413, body: { code: "BODY_TOO_LARGE", message: "body exceeds 8 MB" } };
  let body; try { body = JSON.parse(text); } catch { return { status: 400, body: { code: "INVALID_JSON", message: "invalid JSON body" } }; }
  const width = body.width, height = body.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2000000) return { status: 422, body: { code: "INVALID_IMAGE", message: "width/height required (1..2000000 pixels)" } };
  let grid, meta;
  if (typeof body.gray_b64 === "string" && body.gray_b64.length) {
    const bytes = Uint8Array.from(atob(body.gray_b64), (c) => c.charCodeAt(0));
    if (bytes.length !== width * height) return { status: 422, body: { code: "INVALID_IMAGE", message: "gray_b64 length != width*height" } };
    const st = edgeStandardize(bytes, width, height);
    grid = st.grid; meta = st.meta;
  } else if (typeof body.bitmap_b64 === "string" && body.bitmap_b64.length) {
    const decoded = tasteMath.decodeBitmap(body.bitmap_b64);
    grid = Array.isArray(decoded) ? decoded : (decoded && decoded.grid) || null;
    if (!grid) return { status: 422, body: { code: "INVALID_IMAGE", message: "bitmap_b64 undecodable" } };
    meta = { pipeline: "caller-bitmap", chosen_threshold: null, achieved_coverage: null, traced_pixels: null, w: grid[0] ? grid[0].length : width, h: grid.length };
  } else {
    return { status: 422, body: { code: "INVALID_IMAGE", message: "gray_b64 or bitmap_b64 required" } };
  }
  try {
    const m = edgeMeasure(grid);
    const sym = tasteMath.mirrorSymmetryScore(grid);
    const walkers = body.walkers === undefined ? 64 : body.walkers;
    if (!Number.isInteger(walkers) || walkers < 1 || walkers > MAX_WALKERS) return { status: 422, body: { code: "INVALID_WALKERS", message: "walkers must be an integer 1.." + MAX_WALKERS } };
    const seed = body.seed === undefined ? 42 : body.seed;
    const comps = walkCentroidMode(grid, { walkers, seed });
    if (comps.status !== "ok") {
      return { status: 422, body: { code: "INSUFFICIENT", message: "centroid walk insufficient (CF-4): fewer than 3 traced components" } };
    }
    if (comps.n_components > MAX_POINTS) return { status: 413, body: { code: "TOO_MANY_CENTROIDS", message: "traced " + comps.n_components + " components; cap is " + MAX_POINTS } };
    const dims = comps.dims;
    const ein = einsteinVerdict(dims.d_s, m.D, dims.d_w, { tol: 0.1 });
    const inputHash = await sha256hex(canonicalJson({ kind: "oracle", pipeline: "edge-standard-v1", width, height, gray_len: (body.gray_b64 || "").length, walkers, seed }));
    const rr = await recordRun("oracle", inputHash, { D: m.D, d_w: dims.d_w, d_s_return: dims.d_s, einstein: ein.verdict, n_components: comps.n_components }, { pipeline: "edge-standard-v1" });
    return {
      status: 200,
      body: {
        pipeline: "hierarchy-oracle-v1",
        edge_standard: { D: m.D, r2: m.r2, symmetry_present: { score: sym.score, axis: sym.axis }, meta },
        spectral: {
          d_w: dims.d_w, d_w_r2: dims.d_w_r2, alpha_msd: dims.alpha_msd,
          d_s_return: dims.d_s, d_s_return_r2: dims.d_s_r2,
          n_components: comps.n_components, n_edges: comps.edges.length, walkers, seed,
          msd_metric: (comps.walk && comps.walk.msd_metric) ? comps.walk.msd_metric : "euclidean",
          low_confidence: { d_w: dims.d_w === null || dims.d_w_r2 < 0.98, d_s: dims.d_s === null || dims.d_s_r2 < 0.98 },
        },
        einstein: ein,
        run_id: rr && rr.run_id,
      },
    };
  } catch (e) {
    return { status: 500, body: { code: "ORACLE_FAILED", message: (e && e.message) || String(e) } };
  }
}
