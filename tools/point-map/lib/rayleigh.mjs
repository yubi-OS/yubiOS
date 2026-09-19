// lib/rayleigh.mjs — Rayleigh-quotient diagnostics (rayleigh/1).
//
// Two places where Rayleigh's variational principle already lives inside the
// instrument, made explicit and auditable:
//
// (A) The isolation graph. Points on S^2 are adjacent when chord < 0.095. Its
//     combinatorial Laplacian L = D - A has x^T L x = sum over edges (x_i-x_j)^2.
//     Exact integer facts: the kernel contains every connected-component
//     indicator, so nullity(L) = #components, and every isolated vertex is a
//     component of its own. For any vertex subset S the CENTERED indicator
//     x = n*1_S - |S|*1 has the exact rational Rayleigh quotient
//         R(x) = n * cut(S) / (|S| * (n - |S|)),
//     which is an upper bound on the Fiedler value lambda_2 of a connected
//     graph (Rayleigh–Ritz). The Fiedler value itself is a float estimate.
// (B) The frozen PCA frame. Ky Fan's maximum principle: for any k orthonormal
//     vectors X, tr(X^T C X) <= lambda_1 + ... + lambda_k. The frozen axes are
//     the top-2 eigenvectors of the BASELINE covariance; on a later corpus the
//     same axes give a Ritz value that can only be <= the current top-2 sum.
//     The gap is an exact, sign-certain measure of how much the frozen frame
//     under-explains the corpus it is now being asked to place.
//
// Nothing here enters ranking, frames, bits or the null used for V2. The graph
// null reuses the fixed-attempt checkerboard chain on the bit matrix so the
// Fiedler/component statistics get the same margin-preserving reference the
// papers use, with exclusion-only wording. `admitted:false` is hard-coded.

import { ApiError } from "./http.mjs";
import { AXIS_TRIAL_MAX_N } from "./limits.mjs";

export const VERSION = "rayleigh/1";
export const ISO_RADIUS = 0.095;
export const MAX_N = AXIS_TRIAL_MAX_N;
const REJECTED = ["weights", "rank", "admit", "admitted", "radius", "radii", "score", "threshold", "d", "T", "seed", "frame", "steps"];

export const SCOPE = "Rayleigh-quotient diagnostics on the frozen frame: exact integer component/isolate counts and exact rational Rayleigh–Ritz upper bounds on the isolation graph, a float Fiedler estimate for the largest component compared to K fixed-margin null draws (exclusion-only), and Ky Fan's frozen-frame gap when embeddings are available. None of these is a ranking term, a quality score or a keep/revert rule; `admitted` is computed per frame from explicit criteria (non-degenerate null, seed-reproducible verdicts, exact witness bound, Ky Fan bound, N >= 100) and only licenses reporting the statistics as instrument readings.";

function chord(a, b) { let s = 0; for (let k = 0; k < 3; k++) s += (a[k] - b[k]) ** 2; return Math.sqrt(s); }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; }
function frac(num, den) { if (den === 0) return null; const g = gcd(num, den); return { num: num / g, den: den / g, value: num / den }; }

/** Unweighted isolation graph as adjacency lists + edge list (i<j). */
export function isolationGraph(pts, radius = ISO_RADIUS) {
  const n = pts.length; const adj = Array.from({ length: n }, () => []); const edges = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (chord(pts[i], pts[j]) < radius) { adj[i].push(j); adj[j].push(i); edges.push([i, j]); }
  return { n, adj, edges, degrees: adj.map((a) => a.length) };
}

/** Connected components by BFS. Exact. */
export function components(adj) {
  const n = adj.length, comp = new Int32Array(n).fill(-1); const sizes = [];
  for (let s = 0; s < n; s++) { if (comp[s] >= 0) continue; const id = sizes.length; let q = [s]; comp[s] = id; let size = 0; while (q.length) { const v = q.pop(); size++; for (const w of adj[v]) if (comp[w] < 0) { comp[w] = id; q.push(w); } } sizes.push(size); }
  return { count: sizes.length, sizes, comp: Array.from(comp), isolates: sizes.filter((s) => s === 1).length };
}

/** Exact quadratic form x^T L x = sum_edges (x_i - x_j)^2 for integer/rational x. */
export function laplacianQuadratic(edges, x) { let s = 0; for (const [i, j] of edges) { const d = x[i] - x[j]; s += d * d; } return s; }

/** Exact rational Rayleigh–Ritz witness for a vertex subset S (as index array) on the graph. */
export function cutWitness(graph, S) {
  const n = graph.n; const inS = new Uint8Array(n); for (const i of S) inS[i] = 1; const k = S.length;
  let cut = 0; for (const [i, j] of graph.edges) if (inS[i] !== inS[j]) cut++;
  if (k === 0 || k === n) return { size: k, cut, quotient: null, note: "trivial subset: the centered indicator is the zero vector" };
  // x = n*1_S - k*1 : x^T L x = n^2 * cut ; x^T x = n*k*(n-k)  => R = n*cut / (k*(n-k))
  return { size: k, cut, quotient: frac(n * cut, k * (n - k)), identity: "x = n·1_S − |S|·1 ⇒ xᵀLx = n²·cut(S), xᵀx = n·|S|·(n−|S|), R(x) = n·cut(S)/(|S|(n−|S|)) ≥ λ₂ on a connected graph (Rayleigh–Ritz)" };
}

/** Fiedler value (lambda_2) of one connected component via power iteration on M = 2*dmax*I - L restricted to 1^perp. Float estimate. */
export function fiedler(graph, vertices, iters = 400) {
  const m = vertices.length; if (m < 2) return { lambda2: null, vector: null, note: "component of size < 2 has no Fiedler value" };
  const idx = new Map(vertices.map((v, i) => [v, i])); const deg = vertices.map((v) => graph.adj[v].filter((w) => idx.has(w)).length); const dmax = Math.max(...deg); const shift = 2 * dmax + 1;
  const rng = mulberry32(20260918); let x = vertices.map(() => rng() - 0.5); const proj = (v) => { const mean = v.reduce((a, b) => a + b, 0) / m; return v.map((t) => t - mean); }; const norm = (v) => Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  x = proj(x); let nx = norm(x); x = x.map((t) => t / nx);
  const apply = (v) => vertices.map((u, i) => { let s = (shift - deg[i]) * v[i]; for (const w of graph.adj[u]) { const j = idx.get(w); if (j !== undefined) s += v[j]; } return s; }); // (shift*I - L) v
  let mu = 0;
  for (let t = 0; t < iters; t++) { let y = proj(apply(x)); const ny = norm(y); if (!ny) break; mu = ny; x = y.map((v) => v / ny); }
  // Rayleigh quotient of the converged vector under L gives lambda_2 estimate directly
  let num = 0; for (const [a, b] of graph.edges) { const i = idx.get(a), j = idx.get(b); if (i !== undefined && j !== undefined) num += (x[i] - x[j]) ** 2; }
  const lambda2 = num / x.reduce((a, b) => a + b * b, 0);
  const pos = vertices.filter((_, i) => x[i] >= 0); const neg = vertices.filter((_, i) => x[i] < 0);
  return { lambda2, power_estimate: shift - mu, vector_sign_split: { positive: pos.length, negative: neg.length }, cut_positive_side: pos, iters, note: "float power-iteration estimate; the exact rational cutWitness of the sign partition upper-bounds lambda_2 by Rayleigh–Ritz" };
}

/** Full graph reading for one map (pts_full + names). */
export function graphRayleigh(map, opts = {}) {
  const pts = map.pts_full, names = map.names; if (!Array.isArray(pts) || !Array.isArray(names) || pts.length !== names.length) throw new ApiError(409, "map lacks pts_full/names");
  if (pts.length > MAX_N) throw new ApiError(422, `rayleigh diagnostics are limited to N <= ${MAX_N} (map has ${pts.length})`);
  const g = isolationGraph(pts, opts.radius ?? ISO_RADIUS); const c = components(g.adj);
  const largestId = c.sizes.indexOf(Math.max(...c.sizes)); const largest = c.comp.map((id, i) => id === largestId ? i : -1).filter((i) => i >= 0);
  const f = fiedler(g, largest);
  const witness = f.cut_positive_side ? cutWitness({ n: largest.length, edges: g.edges.filter(([i, j]) => c.comp[i] === largestId && c.comp[j] === largestId).map(([i, j]) => [largest.indexOf(i), largest.indexOf(j)]) }, f.cut_positive_side.map((v) => largest.indexOf(v))) : null;
  const bound_ok = witness && witness.quotient ? f.lambda2 <= witness.quotient.value + 1e-9 : null;
  return {
    n: g.n, edges: g.edges.length, radius: opts.radius ?? ISO_RADIUS,
    exact: { components: c.count, isolates: c.isolates, nullity_identity: "nullity(L) = #components (kernel = span of component indicators); every isolated vertex is one component", component_sizes_sorted: c.sizes.slice().sort((a, b) => b - a).slice(0, 12), quadratic_form_of_constant: laplacianQuadratic(g.edges, new Array(g.n).fill(1)) },
    largest_component: { size: largest.length, fiedler_lambda2: f.lambda2 === null ? null : +f.lambda2.toFixed(6), power_iterations: f.iters, sign_split: f.vector_sign_split, rayleigh_ritz_witness: witness ? { subset_size: witness.size, cut_edges: witness.cut, quotient: witness.quotient, identity: witness.identity } : null, bound_holds: bound_ok, bound_note: "λ₂(largest) ≤ R(centered indicator of the Fiedler sign cut) is an exact consequence of Rayleigh–Ritz; a violation would mean the float estimate is wrong, not that the theorem is" },
    isolate_names: names.filter((_, i) => g.degrees[i] === 0).slice(0, 64),
  };
}

/** Ky Fan frozen-frame gap: X (N x D) embeddings, frame.input_pca {mu, axes}. */
export function kyFanFrameGap(X, frame, opts = {}) {
  const n = X.length; if (n < 3) return { available: false, reason: "need >= 3 rows" };
  const D = X[0].length; const mu = new Float64Array(D); for (const r of X) for (let k = 0; k < D; k++) mu[k] += r[k] / n;
  const Xc = X.map((r) => r.map((v, k) => v - mu[k])); const denom = n - 1;
  const Cv = (v) => { const out = new Float64Array(D); for (const r of Xc) { let s = 0; for (let k = 0; k < D; k++) s += r[k] * v[k]; for (let k = 0; k < D; k++) out[k] += s * r[k]; } for (let k = 0; k < D; k++) out[k] /= denom; return out; };
  let trace = 0; for (const r of Xc) for (let k = 0; k < D; k++) trace += r[k] * r[k]; trace /= denom;
  const dot = (a, b) => { let s = 0; for (let k = 0; k < D; k++) s += a[k] * b[k]; return s; };
  const norm = (a) => Math.sqrt(dot(a, a));
  const rng = mulberry32(opts.seed ?? 20260918); const iters = opts.iters ?? 300; const top = [];
  for (let e = 0; e < 2; e++) {
    let v = Float64Array.from({ length: D }, () => rng() - 0.5); for (const u of top) { const c = dot(v, u.vec); for (let k = 0; k < D; k++) v[k] -= c * u.vec[k]; } let nv = norm(v); for (let k = 0; k < D; k++) v[k] /= nv; let lam = 0;
    for (let t = 0; t < iters; t++) { let w = Cv(v); for (const u of top) { const c = dot(w, u.vec); for (let k = 0; k < D; k++) w[k] -= c * u.vec[k]; } const nw = norm(w); if (!nw) break; lam = nw; for (let k = 0; k < D; k++) v[k] = w[k] / nw; }
    top.push({ vec: v, lambda: dot(v, Cv(v)) });
  }
  const axes = frame && frame.input_pca && Array.isArray(frame.input_pca.axes) ? frame.input_pca.axes.slice(0, 2) : null;
  if (!axes || axes.length < 2 || axes[0].length !== D) return { available: false, reason: "frame has no 2 input axes of matching dimension", trace };
  // orthonormalize the two frozen axes (they are, up to rounding) then Ritz value
  const a0 = Float64Array.from(axes[0]); let n0 = norm(a0); for (let k = 0; k < D; k++) a0[k] /= n0;
  const a1 = Float64Array.from(axes[1]); const c01 = dot(a1, a0); for (let k = 0; k < D; k++) a1[k] -= c01 * a0[k]; let n1 = norm(a1); for (let k = 0; k < D; k++) a1[k] /= n1;
  const ritz = dot(a0, Cv(a0)) + dot(a1, Cv(a1)); const kyfan = top[0].lambda + top[1].lambda; const gap = kyfan - ritz;
  return {
    available: true, k: 2, trace: +trace.toFixed(6), ritz_value_frozen_axes: +ritz.toFixed(6), top2_eigen_sum_estimate: +kyfan.toFixed(6), gap: +gap.toFixed(6),
    gap_share_of_trace: +(gap / trace).toFixed(6), ritz_share: +(ritz / trace).toFixed(6), top2_share: +(kyfan / trace).toFixed(6),
    ky_fan_bound_holds: gap >= -1e-6, power_iterations: iters,
    reading: "Ky Fan: tr(XᵀCX) ≤ λ₁+λ₂ for any orthonormal 2-frame X, so gap ≥ 0 exactly; on the baseline corpus the frozen axes ARE the top-2 eigenvectors (gap ≈ 0); on a later corpus the gap is how much variance the frozen frame no longer captures. It is a frame-adequacy reading, not a quality score, and it does not authorize refitting.",
  };
}

/** Null reading for the graph statistics using the fixed-attempt checkerboard chain on the bit matrix (same chain as map.null). */
export function graphNull(map, nullDraw, toS2, K, seed) {
  const bits = map.bits; const N = bits.length, d = bits[0].length; const attempts = 5 * N * d; const rng = mulberry32(seed); const cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
  const draws = [];
  for (let k = 0; k < K; k++) { const B = nullDraw(bits, attempts, rng, cert); const pts = B.map(toS2); const g = isolationGraph(pts); const c = components(g.adj); const largestId = c.sizes.indexOf(Math.max(...c.sizes)); const largest = c.comp.map((id, i) => id === largestId ? i : -1).filter((i) => i >= 0); const f = fiedler(g, largest, 200); draws.push({ components: c.count, isolates: c.isolates, largest: largest.length, lambda2: f.lambda2, edges: g.edges.length }); }
  if (!cert.rowOk || !cert.colOk) throw new ApiError(500, "null draw violated a margin; no result returned");
  const stat = (key) => { const v = draws.map((x) => x[key]).filter((x) => x !== null && Number.isFinite(x)); const mean = v.reduce((a, b) => a + b, 0) / v.length; const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0; return { n: v.length, mean: +mean.toFixed(4), sd: +sd.toFixed(4), min: Math.min(...v), max: Math.max(...v) }; };
  const tail = (key, obs) => { const v = draws.map((x) => x[key]).filter((x) => x !== null && Number.isFinite(x)); const mean = v.reduce((a, b) => a + b, 0) / v.length; const dev = Math.abs(obs - mean); const exceed = v.filter((x) => Math.abs(x - mean) >= dev).length; return { p_two_sided: +((1 + exceed) / (K + 1)).toFixed(4), p_resolution: +(1 / (K + 1)).toFixed(4), z_descriptive: stat(key).sd ? +((obs - mean) / stat(key).sd).toFixed(2) : null, verdict: stat(key).sd === 0 ? "null-degenerate" : ((1 + exceed) / (K + 1) <= 1 / (K + 1) + 1e-12 ? "excluded-from-fixed-margin-null" : "not-excluded") }; };
  return { K, attempts_per_draw: attempts, margins_preserved: { rows: cert.rowOk, columns: cert.colOk, attempted_total: cert.attempted, accepted_total: cert.accepted }, null_kind: "fixed-attempt symmetric checkerboard-switch chain on the bit matrix; margins preserved; not a full Curveball sequence", components: stat("components"), isolates: stat("isolates"), largest_component: stat("largest"), lambda2_largest: stat("lambda2"), edges: stat("edges"), tail };
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.map_id) || body.map_id < 1) throw new ApiError(422, "map_id must be a positive integer");
  for (const k of REJECTED) if (body[k] !== undefined) throw new ApiError(422, `${k} is not accepted: rayleigh diagnostics are read-only on the frozen frame and never feed ranking, radius or admission`, { rejected_keys: REJECTED });
  let K = null; if (body.K !== undefined) { if (!Number.isInteger(body.K) || body.K < 2 || body.K > 40) throw new ApiError(422, "K must be an integer in 2..40"); K = body.K; }
  let seed = null; if (body.null_seed !== undefined) { if (!Number.isInteger(body.null_seed)) throw new ApiError(422, "null_seed must be an integer"); seed = body.null_seed; }
  return { map_id: body.map_id, K, seed };
}

/** ctx: { loadStoredMap, PM } */
export async function rayleighHandler(body, ctx) {
  const v = validate(body); const map = await ctx.loadStoredMap(v.map_id); if (!map) throw new ApiError(404, "map not found");
  if (!map.frame || !Array.isArray(map.bits) || !Array.isArray(map.pts_full)) throw new ApiError(409, "legacy map has no frozen frame/bits/points; create a new baseline");
  const graph = graphRayleigh(map);
  const K = v.K ?? Math.min(40, Number.isInteger(map.K) ? map.K : (map.null && map.null.K) || 40);
  const seed = v.seed ?? (((Number.isInteger(map.seed) ? map.seed : 0) ^ 0x2545F491) | 0);
  const PM = ctx.PM; const nullDraw = PM._internal.nullDraw; const ops = PM._internal.frameOps(map.frame);
  const nul = graphNull(map, nullDraw, ops.toS2, K, seed);
  const obs = { components: graph.exact.components, isolates: graph.exact.isolates, largest: graph.largest_component.size, lambda2: graph.largest_component.fiedler_lambda2, edges: graph.edges };
  const keys = ["components", "isolates", "largest", "lambda2", "edges"];
  const tails = Object.fromEntries(keys.map((k) => [k, obs[k] === null ? null : nul.tail(k, obs[k])]));
  const { tail, ...nullOut } = nul;
  // Admission trial (membership condition, is-this-x §admission): the statistic is admitted for REPORTING on this
  // frame only when (a) its null is non-degenerate, (b) the exclusion verdict reproduces under an independent
  // null seed, (c) the exact Rayleigh–Ritz witness bound holds for the float estimate, (d) the Ky Fan bound holds
  // when a frame gap is present, and (e) N is large enough that a K-draw tail has resolution (N >= 100).
  const seed2 = (seed ^ 0x7f4a7c15) | 0; const nul2 = graphNull(map, nullDraw, ops.toS2, K, seed2);
  const tails2 = Object.fromEntries(keys.map((k) => [k, obs[k] === null ? null : nul2.tail(k, obs[k])]));
  const frameGap = map.rayleigh_frame ?? null;
  const per = {};
  for (const k of keys) {
    const t1 = tails[k], t2 = tails2[k];
    const nondeg = !!(t1 && t2 && t1.verdict !== "null-degenerate" && t2.verdict !== "null-degenerate");
    const reproducible = !!(t1 && t2 && t1.verdict === t2.verdict);
    per[k] = { observed: obs[k], null_nondegenerate: nondeg, verdict_seed_a: t1 ? t1.verdict : null, verdict_seed_b: t2 ? t2.verdict : null, verdict_reproducible: reproducible, z_seed_a: t1 ? t1.z_descriptive : null, z_seed_b: t2 ? t2.z_descriptive : null };
  }
  const criteria = {
    null_nondegenerate_all: keys.every((k) => per[k].null_nondegenerate),
    verdicts_reproducible_all: keys.every((k) => per[k].verdict_reproducible),
    witness_bound_holds: graph.largest_component.bound_holds === true || graph.largest_component.bound_holds === null,
    ky_fan_bound_holds: frameGap && frameGap.available ? frameGap.ky_fan_bound_holds === true : null,
    n_at_least_100: graph.n >= 100,
    lean_identities: "papers/data/lean/RayleighBounds.lean (kernel-checked in lean-check.yml): PSD, kernel of constants and isolates, indicator = cut, witness numerator/denominator",
  };
  const admitted = criteria.null_nondegenerate_all && criteria.verdicts_reproducible_all && criteria.witness_bound_holds && (criteria.ky_fan_bound_holds !== false) && criteria.n_at_least_100;
  const admission = {
    admitted, scope: "reporting on this frame_id/instrument_id only: the five graph statistics may be quoted as instrument readings with their null tails; admission is NOT a ranking term, NOT a radius change, NOT a keep/revert rule, and does not transfer to another frame without its own trial",
    criteria, per_statistic: per, seeds: { a: seed, b: seed2 }, K,
    why_not: admitted ? null : Object.entries({ null_nondegenerate_all: "a null is degenerate", verdicts_reproducible_all: "a verdict flipped between independent null seeds", witness_bound_holds: "the float Fiedler estimate violated the exact Rayleigh-Ritz witness", ky_fan_bound_holds: "the frozen-frame Ky Fan gap came out negative", n_at_least_100: "N < 100: a K-draw tail has no resolution at this size" }).filter(([k]) => criteria[k] === false).map(([, v]) => v),
  };
  return {
    trial: true, persisted: false, version: VERSION, map_id: v.map_id, frame_id: map.frame_id ?? null, instrument_id: map.instrument_id ?? null,
    graph, observed: obs, null: { ...nullOut, seed, tails, seed_b: seed2, tails_seed_b: tails2 }, frame_gap: frameGap ?? { available: false, reason: "stored map carries no rayleigh_frame block (computed only when embeddings are available at map time)" },
    admitted, admission, admission_note: admitted ? "admission criteria met on this frame (see admission.criteria); the statistics may be reported as readings; nothing else changes" : "admission criteria not met on this frame (see admission.why_not); diagnostic record only",
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false }, task_verdict: "not-applicable", scope: SCOPE,
  };
}
