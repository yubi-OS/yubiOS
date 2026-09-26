// lib/azimuth.mjs — rotation-invariant azimuth trials (azimuth).
//
// The point-map azimuth is atan2(PC2, PC1) on a PCA fit of either:
//   - binary primitive rows (`variant: "binary"`), with a fixed-margin checkerboard null; or
//   - caller-supplied continuous input vectors (`variant: "continuous"`), with an independent
//     per-column permutation null.
// Every null draw refits PCA2. Reusing the observed placement frame would give the real corpus an
// in-sample advantage and would test the frame, not angular structure.
//
// Statistics are bin-free and invariant under the PCA gauge (global O(2) rotation/reflection):
//   Z_m = N * |mean(exp(i*m*phi))|^2, m in 2,3,4,6,12; and largest circular gap.
// m=1 is returned only as `m1_atomicity_audit`: PCA scores are centered, so the radius-weighted
// first moment is identically zero; unweighted Z_1 measures radial/multiplicity reweighting.
// It is never admitted and cannot be requested as a mode.
//
// Family-wise inference uses two-sided plus-one empirical tails followed by Holm correction over
// the requested modes plus largest_gap. Counts only; no Gaussian translation.

import { ApiError } from "./http.mjs";
import { AXIS_TRIAL_MAX_N } from "./limits.mjs";

export const VERSION = "azimuth";
export const DEFAULT_MODES = Object.freeze([2, 3, 4, 6, 12]);
export const MAX_K = 400;   // family of 6 needs K >= 239 for any exclusion to be arithmetically reachable
export const MAX_N = AXIS_TRIAL_MAX_N;
const PCA_SEED_XOR = 0x1f123bb5;
// Single derivation for every PCA-fit seed in this module: a PCA refit is always
// seeded with base ^ PCA_SEED_XOR, so observed, null and m1 draws use the same
// derivation even when pcaTop consumes RNG (the D > 40 power-iteration path).
const pcaSeed = (base) => base ^ PCA_SEED_XOR;

// Placement eigengap diagnostic (review Finding 5): rel_gap_12 = (lambda1-lambda2)/lambda1 measures
// how nearly degenerate the top-2 eigenplane is — when it is small the rotation WITHIN the plane is
// nearly arbitrary and basis-dependent readouts (the sector index) are unstable. rel_gap_23 is the
// Davis-Kahan subspace-stability gap. Diagnostic only: it licenses nothing and admits nothing.
function eigengap(rows, PM, seed) {
  const d = rows[0].length, k = Math.min(3, d);
  const v = PM._internal.pcaTop(rows, k, PM.mulberry32(seed)).values;
  const f = (x) => +x.toFixed(6);
  return { lambda1: f(v[0]), lambda2: f(v[1]), ...(v[2] !== undefined ? { lambda3: f(v[2]) } : {}),
    rel_gap_12: f((v[0] - v[1]) / v[0]), ...(v[2] !== undefined ? { rel_gap_23: f((v[1] - v[2]) / v[1]) } : {}),
    note: "diagnostic only: small rel_gap_12 means the top-2 eigenplane is nearly degenerate and the sector index reads off an unstable basis; it licenses nothing" };
}
const SECOND_SEED_XOR = 0x7f4a7c15;
const REJECTED = ["rank", "weights", "score", "radius", "radii", "threshold", "d", "T", "frame", "admit", "admitted"];

export const SCOPE = "Rotation/reflection-invariant azimuth diagnostics. Binary trials use a fixed-margin checkerboard null and report an atomicity control; continuous trials use a per-column-shuffle null. Every null draw refits PCA2. Holm-corrected, two-sided plus-one tails are reported with n and resolution. The azimuth channel remains admitted:false: binary placement lacks a size-matched de-atomized fixed-margin null, while the continuous column-shuffle null destroys all inter-column dependence and cannot support a negative corpus claim. Sector numbers remain opaque display labels only.";

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function finiteMatrix(X, label) {
  if (!Array.isArray(X) || X.length < 3 || X.length > MAX_N) throw new ApiError(422, `${label} must contain 3..${MAX_N} rows`);
  const D = X[0] && X[0].length;
  if (!Number.isInteger(D) || D < 2 || D > 768 || X.some((r) => !Array.isArray(r) || r.length !== D || r.some((x) => typeof x !== "number" || !Number.isFinite(x)))) throw new ApiError(422, `${label} must be finite rectangular rows, D=2..768`);
  return D;
}
function binaryMatrix(B) { const d = finiteMatrix(B, "bits"); if (B.some((r) => r.some((x) => x !== 0 && x !== 1))) throw new ApiError(409, "stored bits must contain only 0/1"); return d; }

export function anglesRefit(rows, seed, PM) {
  const n = rows.length, D = rows[0].length;
  const mu = new Array(D).fill(0), sd = new Array(D).fill(0);
  for (const r of rows) for (let j = 0; j < D; j++) mu[j] += r[j] / n;
  for (const r of rows) for (let j = 0; j < D; j++) sd[j] += (r[j] - mu[j]) ** 2 / Math.max(1, n - 1);
  const scales = sd.map((v) => Math.sqrt(v) || 1);
  const Z = rows.map((r) => r.map((x, j) => (x - mu[j]) / scales[j]));
  const p2 = PM._internal.pcaTop(Z, 2, PM.mulberry32(seed));
  return p2.scores.map((r) => Math.atan2(r[1] || 0, r[0] || 0));
}

export function rayleighZ(phis, m) {
  let c = 0, s = 0;
  for (const p of phis) { c += Math.cos(m * p); s += Math.sin(m * p); }
  return (c * c + s * s) / phis.length;
}
export function largestGap(phis) {
  const a = phis.slice().sort((x, y) => x - y); let g = 0;
  for (let i = 1; i < a.length; i++) g = Math.max(g, a[i] - a[i - 1]);
  return Math.max(g, 2 * Math.PI - (a[a.length - 1] - a[0]));
}
export function azimuthStats(phis, modes = DEFAULT_MODES) {
  const out = Object.fromEntries(modes.map((m) => [`Z${m}`, rayleighZ(phis, m)]));
  out.largest_gap = largestGap(phis);
  return out;
}
export function dedupRows(rows) { const seen = new Set(), out = []; for (const r of rows) { const k = r.join(","); if (!seen.has(k)) { seen.add(k); out.push(r); } } return out; }

function summary(a) { const s = a.slice().sort((x, y) => x - y), n = s.length; const mean = s.reduce((x, y) => x + y, 0) / n; const sd = n > 1 ? Math.sqrt(s.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : 0; return { n, mean, sd, min: s[0], median: s[Math.floor(n / 2)], max: s[n - 1] }; }
function rawTail(a, obs) {
  const up = (1 + a.filter((x) => x >= obs).length) / (a.length + 1);
  const down = (1 + a.filter((x) => x <= obs).length) / (a.length + 1);
  return { tail_up: up, tail_down: down, p_two_sided: Math.min(1, 2 * Math.min(up, down)), resolution: 1 / (a.length + 1) };
}
export function holmAdjust(entries, alpha = 0.05) {
  const sorted = entries.map((e, i) => ({ ...e, i })).sort((a, b) => a.p_two_sided - b.p_two_sided);
  let prev = 0;
  for (let r = 0; r < sorted.length; r++) { const adj = Math.min(1, Math.max(prev, (sorted.length - r) * sorted[r].p_two_sided)); sorted[r].p_holm = adj; sorted[r].excluded_after_holm = adj <= alpha; prev = adj; }
  return sorted.sort((a, b) => a.i - b.i).map(({ i, ...e }) => e);
}
// The smallest Holm-adjusted p this family can produce is |family| * 2/(K+1): a plus-one two-sided
// tail cannot go below 2/(K+1). If that floor exceeds alpha, NO exclusion is reachable at this K and
// "not-excluded" would be a statement about power, not about the corpus. Report it as such.
export function powerFloor(familySize, K, alpha = 0.05) {
  const min_attainable_p_holm = Math.min(1, familySize * 2 / (K + 1));
  return { family_size: familySize, K, alpha, min_attainable_p_holm,
    resolvable: min_attainable_p_holm <= alpha,
    K_required_for_resolution: Math.ceil(familySize * 2 / alpha) - 1 };
}
function evaluate(obs, draws, alpha = 0.05) {
  const keys = Object.keys(obs);
  const floor = powerFloor(keys.length, draws.length, alpha);
  const raw = keys.map((key) => {
    const vals = draws.map((d) => d[key]); const s = summary(vals); const t = rawTail(vals, obs[key]);
    return { key, observed: obs[key], null: { n: s.n, mean: +s.mean.toFixed(6), sd: +s.sd.toFixed(6), min: s.min, median: s.median, max: s.max, degenerate: s.sd === 0 }, ...t };
  });
  // per-row, so the floor travels with every verdict in JSON without adding a non-verdict key to
  // the map that verdictsReproduce()/nondegenerate() iterate over.
  return Object.fromEntries(holmAdjust(raw, alpha).map((r) => [r.key, { ...r, power_floor: floor,
    verdict: r.null.degenerate ? "null-degenerate"
      : r.excluded_after_holm ? "excluded-after-holm"
      : floor.resolvable ? "not-excluded-after-holm"
      : "unresolvable-at-this-K" }]));
}
function runNull(bits, PM, K, seed, modes, prep = (x) => x) {
  const N = bits.length, d = bits[0].length, rnd = PM.mulberry32(seed), cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 }, draws = [], sizes = [];
  for (let k = 0; k < K; k++) { const M = prep(PM._internal.nullDraw(bits, 5 * N * d, rnd, cert)); sizes.push(M.length); draws.push(azimuthStats(anglesRefit(M, pcaSeed(seed ^ (k + 1)), PM), modes)); }
  if (!cert.rowOk || !cert.colOk) throw new ApiError(500, "fixed-margin null violated a row or column margin");
  return { draws, sizes, cert };
}
function verdictsReproduce(a, b) { return Object.keys(a).every((k) => a[k].verdict === b[k].verdict); }
function nondegenerate(a, b) { return Object.keys(a).every((k) => !a[k].null.degenerate && !b[k].null.degenerate); }

export function binaryAzimuthTrial(map, PM, { K, seedA, modes = DEFAULT_MODES, alpha = 0.05 }) {
  binaryMatrix(map.bits); const seedB = (seedA ^ SECOND_SEED_XOR) | 0;
  const obsPhi = anglesRefit(map.bits, pcaSeed(map.seed ?? 0), PM), obs = azimuthStats(obsPhi, modes);
  const A = runNull(map.bits, PM, K, seedA, modes), B = runNull(map.bits, PM, K, seedB, modes);
  const evA = evaluate(obs, A.draws, alpha), evB = evaluate(obs, B.draws, alpha);
  const distinct = dedupRows(map.bits), obsDPhi = anglesRefit(distinct, pcaSeed(map.seed ?? 0), PM), obsD = azimuthStats(obsDPhi, modes);
  const DA = runNull(map.bits, PM, K, seedA ^ 0x1337, modes, dedupRows), DB = runNull(map.bits, PM, K, seedB ^ 0x1337, modes, dedupRows);
  const deA = evaluate(obsD, DA.draws, alpha), deB = evaluate(obsD, DB.draws, alpha);
  const observedDistinct = distinct.length, exactA = DA.sizes.filter((n) => n === observedDistinct).length, exactB = DB.sizes.filter((n) => n === observedDistinct).length;
  const m1Obs = rayleighZ(obsPhi, 1);
  // m=1 audit uses a separate small refit loop only to expose the confound; it is never part of the family.
  const m1Draws = (seed) => { const N = map.bits.length, d = map.bits[0].length, rnd = PM.mulberry32(seed), cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 }, out = []; for (let k = 0; k < K; k++) { const M = PM._internal.nullDraw(map.bits, 5 * N * d, rnd, cert); out.push(rayleighZ(anglesRefit(M, pcaSeed(seed ^ (k + 1)), PM), 1)); } return out; };
  const m1aa = rawTail(m1Draws(seedA ^ 0x5151), m1Obs), m1bb = rawTail(m1Draws(seedB ^ 0x5151), m1Obs);
  const collisionRate = 1 - observedDistinct / map.bits.length;
  const dedupSupportA = summary(DA.sizes), dedupSupportB = summary(DB.sizes);
  const sizeMatched = exactA > 0 && exactB > 0;
  const evidence = {
    null_nondegenerate_all: nondegenerate(evA, evB),
    holm_verdicts_reproducible_all: verdictsReproduce(evA, evB),
    margins_preserved: A.cert.rowOk && A.cert.colOk && B.cert.rowOk && B.cert.colOk,
    deatomized_null_size_matched: sizeMatched,
    n_at_least_100: map.bits.length >= 100,
  };
  const blocking_reasons = [
    "binary azimuth is a function of duplicated bit patterns; the unweighted first mode is a radius/multiplicity reweighting of a centered plane",
    sizeMatched
      ? "the de-atomized comparison is descriptive only; no independent matched null has admitted a corpus-level angular coordinate"
      : "the observed deduplicated size is outside the fixed-margin null support in both seeds; no size-matched de-atomized null exists",
  ];
  return {
    variant: "binary", N: map.bits.length, d: map.bits[0].length, modes, K, seeds: { a: seedA, b: seedB }, multiplicity: { method: "Holm", family: [...modes.map((m) => `Z${m}`), "largest_gap"], alpha },
    observed: obs, seed_a: evA, seed_b: evB,
    placement_eigengap: eigengap(map.bits, PM, pcaSeed(map.seed ?? 0)),
    atomicity: { distinct_patterns: observedDistinct, possible_patterns: 2 ** Math.min(map.bits[0].length, 30), collision_count: map.bits.length - observedDistinct, collision_fraction: collisionRate,
      m1_audit: { observed: m1Obs, seed_a: m1aa, seed_b: m1bb, admitted: false, reason: "PCA scores are mean-centered, so the radius-weighted first moment is identically zero; unweighted Z1 measures radial/multiplicity reweighting and is structurally confounded" },
      deduplicated: { N: observedDistinct, observed: obsD, seed_a: deA, seed_b: deB, null_distinct_sizes_seed_a: dedupSupportA, null_distinct_sizes_seed_b: dedupSupportB, exact_size_matches: { a: exactA, b: exactB }, size_matched: sizeMatched, admitted: false, reason: sizeMatched ? "descriptive de-atomized control only; no coordinate is admitted by this block" : "no size-matched fixed-margin dedup null exists in these draws; the observed atomicity lies outside null support" } },
    evidence, admitted: false,
    admission: { admitted: false, blocking_reasons, evidence },
    admission_note: "binary azimuth channel remains not admitted; report the diagnostic and atomicity controls, never a corpus-level angular claim",
  };
}

function shuffleColumns(X, rnd) { const M = X.map((r) => r.slice()), N = M.length, D = M[0].length; for (let j = 0; j < D; j++) for (let i = N - 1; i > 0; i--) { const t = Math.floor(rnd() * (i + 1)); [M[i][j], M[t][j]] = [M[t][j], M[i][j]]; } return M; }
export function continuousAzimuthTrial(X, PM, { K, seedA, modes = DEFAULT_MODES, alpha = 0.05, vectorHashesMatchMap }) {
  finiteMatrix(X, "vectors"); const seedB = (seedA ^ SECOND_SEED_XOR) | 0, obs = azimuthStats(anglesRefit(X, pcaSeed(0), PM), modes);
  const draw = (seed) => { const rnd = mulberry32(seed), out = []; for (let k = 0; k < K; k++) out.push(azimuthStats(anglesRefit(shuffleColumns(X, rnd), pcaSeed(seed ^ (k + 1)), PM), modes)); return out; };
  const A = evaluate(obs, draw(seedA), alpha), B = evaluate(obs, draw(seedB), alpha);
  return { variant: "continuous", N: X.length, D: X[0].length, modes, K, seeds: { a: seedA, b: seedB }, multiplicity: { method: "Holm", family: [...modes.map((m) => `Z${m}`), "largest_gap"], alpha }, observed: obs, seed_a: A, seed_b: B,
    placement_eigengap: eigengap(X, PM, pcaSeed(0)),
    criteria: { null_nondegenerate_all: nondegenerate(A, B), holm_verdicts_reproducible_all: verdictsReproduce(A, B),
      // computed, never flipped (lesson 29): the handler passes its actual vector-fingerprint check;
      // a direct call without that verification reports false, not a hardcoded true.
      vector_hashes_match_map: vectorHashesMatchMap === true, n_at_least_100: X.length >= 100, null_adequate_for_negative_claim: false }, admitted: false,
    admission_note: "continuous azimuth channel not admitted: the per-column shuffle null destroys all inter-column covariance and is intentionally over-strong; not-exclusion under it is uninformative. A chart-selection null with a predeclared optimizer/stopping rule is required." };
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.map_id) || body.map_id < 1) throw new ApiError(422, "map_id must be a positive integer");
  const variant = body.variant ?? "binary"; if (!["binary", "continuous"].includes(variant)) throw new ApiError(422, "variant must be binary or continuous");
  const K = body.K ?? 240;
  // 240 >= 239: the smallest default at which the 6-member family can resolve an exclusion (power floor)
  if (!Number.isInteger(K) || K < 2 || K > MAX_K) throw new ApiError(422, `K must be an integer in 2..${MAX_K}`);
  const seed = body.null_seed ?? 0x5eed; if (!Number.isInteger(seed)) throw new ApiError(422, "null_seed must be an integer");
  const modes = body.modes ?? DEFAULT_MODES.slice(); if (!Array.isArray(modes) || !modes.length || modes.some((m) => !DEFAULT_MODES.includes(m)) || new Set(modes).size !== modes.length) throw new ApiError(422, `modes must be unique members of ${DEFAULT_MODES.join(",")}; m=1 is structurally confounded and rejected`);
  if (body.refit !== undefined && body.refit !== true) throw new ApiError(422, "refit must be true: every null draw gets its own PCA2");
  if (body.multiplicity !== undefined && body.multiplicity !== "holm") throw new ApiError(422, "multiplicity must be holm");
  return { map_id: body.map_id, variant, K, seed, modes, vectors: body.vectors };
}

/** ctx: { loadStoredMap, PM } */
export async function azimuthHandler(body, ctx) {
  const v = validate(body); const map = await ctx.loadStoredMap(v.map_id); if (!map) throw new ApiError(404, "map not found");
  if (!map.frame || !Array.isArray(map.bits) || !Array.isArray(map.keys)) throw new ApiError(409, "legacy map has no frozen frame/bits/keys; create a new baseline");
  if (map.bits.length > MAX_N) throw new ApiError(422, `azimuth trials are limited to N <= ${MAX_N}`);
  let result;
  if (v.variant === "binary") result = binaryAzimuthTrial(map, ctx.PM, { K: v.K, seedA: v.seed, modes: v.modes });
  else {
    const D = finiteMatrix(v.vectors, "vectors"); if (v.vectors.length !== map.names.length) throw new ApiError(409, `vectors length ${v.vectors.length} != map N ${map.names.length}`);
    const bad = v.vectors.map((r, i) => ctx.PM.hashVec(r) !== map.keys[i].hash ? map.names[i] : null).filter(Boolean);
    if (bad.length) throw new ApiError(409, "vectors do not match the stored map row order/fingerprints", { mismatch_count: bad.length, mismatch_names: bad.slice(0, 10) });
    result = continuousAzimuthTrial(v.vectors, ctx.PM, { K: v.K, seedA: v.seed, modes: v.modes, vectorHashesMatchMap: bad.length === 0 });
  }
  return { trial: true, persisted: false, version: VERSION, map_id: v.map_id, frame_id: map.frame_id ?? null, instrument_id: map.instrument_id ?? null, ...result,
    permanently_not_admitted: ["m=1 / circular variance (centered-plane radius/multiplicity reweighting)", "sector-number corpus claims (origin and width are arbitrary; sectors stay opaque display labels)", "negative corpus claims from the continuous column-shuffle null", "powered-lens claims without a selection null optimizing every null draw"],
    powered_lens: { status: "deferred", reason: "honest lensing requires continuous placement, a selection null that optimizes a lens for every null draw, a predeclared stopping rule and an anti-caustic condition-number cap; none belongs in this read-only endpoint" },
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false }, task_verdict: "not-applicable", scope: SCOPE };
}
