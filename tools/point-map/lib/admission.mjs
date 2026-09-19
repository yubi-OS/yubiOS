// lib/admission.mjs — unified admission trials (admission/1).
//
// One call runs the membership condition for every non-admitted diagnostic
// the instrument carries, with the same recipe rayleigh/1 introduced:
//   null non-degenerate + verdicts reproducible under an independent second
//   null seed + exact-identity bounds hold + N >= 100  =>  admitted for
//   REPORTING on this frame. Nothing else changes: no ranking term, no radius,
//   no keep/revert rule, no transfer to another frame.
//
// Diagnostics covered:
//   rayleigh    isolation-graph statistics (delegates to lib/rayleigh.mjs)
//   axis_trial  per-axis LOO-NN predictability (lib/axis-redundancy.mjs), two seeds
//   spectra     S^2 Parseval degree shares E_0..E_3 + even/odd blocks of the point
//               cloud (the spectra card's numbers) against the fixed-margin null
//   radius      I(r) on the fixed diagnostic grid [0.075..0.115] against the null
//
// What stays permanently not admitted, by construction, and is said so in the
// response: any physical (Raman/IR, dipole, polarizability, lifetime) reading of
// the spectra card; the heat eigenvalues l(l+1) (constants, not statistics); the
// caller-supplied radius robustness bounds (`validated:false, certified:false`
// are about unverified caller assumptions, not about the I(r) counts).

import { ApiError } from "./http.mjs";
import { axisRedundancyTrial } from "./axis-redundancy.mjs";
import { rayleighHandler } from "./rayleigh.mjs";
import { RADII, CANONICAL_RADIUS } from "./radius-diagnostics.mjs";
import { AXIS_TRIAL_MAX_N } from "./limits.mjs";

export const VERSION = "admission/1";
const REJECTED = ["weights", "rank", "admit", "admitted", "radius", "radii", "score", "threshold", "d", "T", "seed", "frame", "steps"];
export const SCOPE = "Unified membership trials: each diagnostic's statistics are tested against K fixed-margin null draws under two independent seeds; a diagnostic is admitted for REPORTING on this frame only when every null is non-degenerate, every exclusion verdict reproduces across the two seeds, its exact identities hold, and N >= 100. Admission never feeds ranking, never moves the radius, never authorizes keeping or reverting, and does not transfer to another frame.";

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function chord(a, b) { let s = 0; for (let k = 0; k < 3; k++) s += (a[k] - b[k]) ** 2; return Math.sqrt(s); }

// real spherical harmonics up to degree 3 (identical constants to pointmap.js `sh`)
function sh([x, y, z]) { return [0.28209479, 0.48860251 * y, 0.48860251 * z, 0.48860251 * x, 1.09254843 * x * y, 1.09254843 * y * z, 0.31539157 * (3 * z * z - 1), 1.09254843 * x * z, 0.54627422 * (x * x - y * y), 0.59004359 * y * (3 * x * x - y * y), 2.89061144 * x * y * z, 0.45704580 * y * (5 * z * z - 1), 0.37317633 * z * (5 * z * z - 3), 0.45704580 * x * (5 * z * z - 1), 1.44530572 * z * (x * x - y * y), 0.59004359 * x * (x * x - 3 * y * y)]; }
export function parsevalShares(pts) { const m = Array(16).fill(0); for (const p of pts) { const b = sh(p); for (let i = 0; i < 16; i++) m[i] += b[i] / pts.length; } const E = [m[0] ** 2, 0, 0, 0]; for (let i = 1; i < 4; i++) E[1] += m[i] ** 2; for (let i = 4; i < 9; i++) E[2] += m[i] ** 2; for (let i = 9; i < 16; i++) E[3] += m[i] ** 2; const tot = E.reduce((a, b) => a + b, 0) || 1; return E.map((e) => e / tot); }
export function spectraStats(pts) { const E = parsevalShares(pts); return { E0: E[0], E1: E[1], E2: E[2], E3: E[3], even: E[0] + E[2], odd: E[1] + E[3] }; }
export function radiusCounts(pts) { const n = pts.length; const clear = pts.map((p, i) => { let b = Infinity; for (let j = 0; j < n; j++) if (j !== i) { const d = chord(p, pts[j]); if (d < b) b = d; } return b; }); const out = {}; for (const r of RADII) out["I_" + r.toFixed(3)] = clear.filter((c) => r <= c).length; return out; }

function stats(v) { const n = v.length; const mean = v.reduce((a, b) => a + b, 0) / n; const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0; return { n, mean, sd, min: Math.min(...v), max: Math.max(...v) }; }
function tail(values, obs, K) { const s = stats(values); const dev = Math.abs(obs - s.mean); const exceed = values.filter((x) => Math.abs(x - s.mean) >= dev).length; const p = (1 + exceed) / (K + 1); return { observed: obs, null_mean: +s.mean.toFixed(6), null_sd: +s.sd.toFixed(6), null_min: s.min, null_max: s.max, z_descriptive: s.sd ? +((obs - s.mean) / s.sd).toFixed(2) : null, p_two_sided: +p.toFixed(4), p_resolution: +(1 / (K + 1)).toFixed(4), verdict: s.sd === 0 ? "null-degenerate" : (p <= 1 / (K + 1) + 1e-12 ? "excluded-from-fixed-margin-null" : "not-excluded") }; }

/** draw K null point clouds from the bit matrix on the frozen frame (same chain as map.null) */
function nullClouds(map, PM, K, seed) { const nullDraw = PM._internal.nullDraw; const ops = PM._internal.frameOps(map.frame); const bits = map.bits; const attempts = 5 * bits.length * bits[0].length; const rng = mulberry32(seed); const cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 }; const clouds = []; for (let k = 0; k < K; k++) clouds.push(nullDraw(bits, attempts, rng, cert).map(ops.toS2)); if (!cert.rowOk || !cert.colOk) throw new ApiError(500, "null draw violated a margin"); return { clouds, cert }; }

function trialOnStats(name, obsStats, statFn, map, PM, K, seedA, seedB, extraCriteria) {
  const A = nullClouds(map, PM, K, seedA), Bn = nullClouds(map, PM, K, seedB);
  const keys = Object.keys(obsStats); const per = {};
  for (const k of keys) {
    const ta = tail(A.clouds.map((c) => statFn(c)[k]), obsStats[k], K), tb = tail(Bn.clouds.map((c) => statFn(c)[k]), obsStats[k], K);
    per[k] = { observed: obsStats[k], seed_a: ta, seed_b: tb, null_nondegenerate: ta.verdict !== "null-degenerate" && tb.verdict !== "null-degenerate", verdict_reproducible: ta.verdict === tb.verdict };
  }
  const criteria = { null_nondegenerate_all: keys.every((k) => per[k].null_nondegenerate), verdicts_reproducible_all: keys.every((k) => per[k].verdict_reproducible), n_at_least_100: map.names.length >= 100, ...extraCriteria };
  const admitted = Object.values(criteria).every((v) => v === true || v === null || typeof v === "string");
  const why = Object.entries(criteria).filter(([, v]) => v === false).map(([k]) => k);
  return { diagnostic: name, K, seeds: { a: seedA, b: seedB }, margins_preserved: { rows: A.cert.rowOk && Bn.cert.rowOk, columns: A.cert.colOk && Bn.cert.colOk }, per_statistic: per, criteria, admitted, why_not: admitted ? null : why };
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.map_id) || body.map_id < 1) throw new ApiError(422, "map_id must be a positive integer");
  for (const k of REJECTED) if (body[k] !== undefined) throw new ApiError(422, `${k} is not accepted: admission trials are read-only on the frozen frame`, { rejected_keys: REJECTED });
  let K = null; if (body.K !== undefined) { if (!Number.isInteger(body.K) || body.K < 2 || body.K > 40) throw new ApiError(422, "K must be an integer in 2..40"); K = body.K; }
  let seed = null; if (body.null_seed !== undefined) { if (!Number.isInteger(body.null_seed)) throw new ApiError(422, "null_seed must be an integer"); seed = body.null_seed; }
  return { map_id: body.map_id, K, seed };
}

/** ctx: { loadStoredMap, PM } */
export async function admissionHandler(body, ctx) {
  const v = validate(body); const map = await ctx.loadStoredMap(v.map_id); if (!map) throw new ApiError(404, "map not found");
  if (!map.frame || !Array.isArray(map.bits) || !Array.isArray(map.pts_full)) throw new ApiError(409, "legacy map has no frozen frame/bits/points; create a new baseline");
  if (map.names.length > AXIS_TRIAL_MAX_N) throw new ApiError(422, `admission trials are limited to N <= ${AXIS_TRIAL_MAX_N}`);
  const PM = ctx.PM; const K = v.K ?? Math.min(40, Number.isInteger(map.K) ? map.K : (map.null && map.null.K) || 40);
  const seedA = v.seed ?? (((Number.isInteger(map.seed) ? map.seed : 0) ^ 0x3c6ef372) | 0); const seedB = (seedA ^ 0x7f4a7c15) | 0;
  // 1. rayleigh (delegated; it already computes its own admission with the same recipe)
  const ry = await rayleighHandler({ map_id: v.map_id, K, null_seed: v.seed ?? undefined }, ctx);
  const rayleigh = { diagnostic: "rayleigh", version: ry.version, admitted: ry.admitted, criteria: ry.admission.criteria, why_not: ry.admission.why_not, observed: ry.observed, seeds: ry.admission.seeds };
  // 2. axis trial, two seeds
  const ta = axisRedundancyTrial(map.bits, { K, seed: seedA, nullDraw: PM._internal.nullDraw }), tb = axisRedundancyTrial(map.bits, { K, seed: seedB, nullDraw: PM._internal.nullDraw });
  const axes = ta.axes.map((a, j) => ({ axis: j, observed_hits: a.observed_hits, margin_baseline_hits: a.margin_baseline_hits, verdict_seed_a: a.verdict, verdict_seed_b: tb.axes[j].verdict, z_seed_a: a.z_descriptive, z_seed_b: tb.axes[j].z_descriptive, null_nondegenerate: !a.null.degenerate && !tb.axes[j].null.degenerate, verdict_reproducible: a.verdict === tb.axes[j].verdict }));
  const axisCriteria = { null_nondegenerate_all: axes.every((a) => a.null_nondegenerate), verdicts_reproducible_all: axes.every((a) => a.verdict_reproducible), margins_preserved: ta.margins_preserved.rows && ta.margins_preserved.columns && tb.margins_preserved.rows && tb.margins_preserved.columns, n_at_least_100: map.names.length >= 100 };
  const axisAdmitted = Object.values(axisCriteria).every(Boolean);
  const axis_trial = { diagnostic: "axis_trial", version: ta.version, statistic: ta.statistic, K, seeds: { a: seedA, b: seedB }, axes, counts: { excluded_seed_a: ta.counts.excluded_from_null, excluded_seed_b: tb.counts.excluded_from_null }, criteria: axisCriteria, admitted: axisAdmitted, why_not: axisAdmitted ? null : Object.entries(axisCriteria).filter(([, x]) => !x).map(([k]) => k), scope: "per-axis LOO-NN predictability admitted for reporting on this frame only; it never becomes an axis weight, importance or ranking term" };
  // 3. spectra shares
  const obsSpec = spectraStats(map.pts_full);
  const spectra = trialOnStats("spectra", obsSpec, spectraStats, map, PM, K, seedA, seedB, { shares_sum_to_one: Math.abs(obsSpec.E0 + obsSpec.E1 + obsSpec.E2 + obsSpec.E3 - 1) < 1e-9 });
  spectra.version = "spectra-trial/1"; spectra.physical_claims = { admitted: false, permanent: true, reason: "no dipole, polarizability, response kernel, frequency, lifetime or temperature is measured; Raman/IR selection rules need those observables. Admission here covers the S^2 Parseval shares as geometric statistics only" }; spectra.heat_eigenvalues = { admitted: false, permanent: true, reason: "l(l+1) are constants of the sphere Laplacian, not statistics of the corpus" }; spectra.scope = "degree shares E_0..E_3 and even/odd blocks of the point cloud, tested against the fixed-margin null; admitted for reporting only";
  // 4. radius profile I(r) on the fixed grid
  const obsRad = radiusCounts(map.pts_full);
  const radius = trialOnStats("radius_profile", obsRad, radiusCounts, map, PM, K, seedA, seedB, { canonical_radius_unchanged: CANONICAL_RADIUS === 0.095, canonical_count_matches_map: obsRad["I_0.095"] === map.isolated || map.isolated === undefined });
  radius.version = "radius-trial/1"; radius.grid = RADII.slice(); radius.canonical_radius = CANONICAL_RADIUS; radius.bounds_note = "the profile's robustness `bounds` (`validated:false, certified:false`) describe caller-supplied perturbation assumptions and stay false by construction; they are not part of this trial. The grid is fixed and never reselected."; radius.scope = "I(r) counts on the fixed grid admitted for reporting only; the operative radius stays 0.095";
  const blocks = { rayleigh, axis_trial, spectra, radius_profile: radius };
  const summary = Object.fromEntries(Object.entries(blocks).map(([k, b]) => [k, b.admitted]));
  return { trial: true, persisted: false, version: VERSION, map_id: v.map_id, frame_id: map.frame_id ?? null, instrument_id: map.instrument_id ?? null, N: map.names.length, K, summary, ...blocks,
    permanently_not_admitted: ["physical (Raman/IR, dipole, polarizability, lifetime, temperature) readings of the spectra card", "heat eigenvalues l(l+1)", "caller-supplied radius robustness bounds (validated/certified stay false)", "any use of an admitted statistic as a ranking term, radius, or keep/revert rule"],
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false }, task_verdict: "not-applicable", scope: SCOPE };
}
