// lib/axis-redundancy.mjs
// POST /api/map/axis-redundancy — a TRIAL of one candidate statistic against
// the fixed-margin null, executed per the membership condition.
//
// Methodology transplant (axis-trial/1): TabNet (Arik & Pfister, AAAI 2021,
// arXiv:1908.07442) selects, per decision step, the sparse subset of features
// that carries information, and its self-supervised pretraining predicts
// masked features from the unmasked ones. The wayfinder analogue asks, for
// each of the d frozen binary axes: how well is bit j predicted from the other
// d-1 bits of the same document by a leave-one-out nearest-neighbour vote?
// An axis that is predictable from the others is redundant on this corpus;
// one that is not carries independent information.
//
// The is-this-x membership condition: "no coordinate is admitted without a
// demonstrated non-degenerate null, a construction under which the statistic
// provably could have taken a different value." So this module never reports
// the statistic alone. It runs the SAME statistic on K draws of the existing
// fixed-attempt checkerboard chain (PM._internal.nullDraw), which preserves
// every row and column margin. Because the column margin of axis j is fixed
// under the null, the majority-vote baseline is identical for observed and
// null draws; whatever the observed hit count adds beyond the null is
// dependence between axes beyond margins — exactly the quantity the papers'
// ΔV2 targets, read per axis.
//
// Boundaries (asserted by test-axis-consistency.mjs):
//   - Pure function of the stored bits. No embedding, no D1 write, no
//     Vectorize. The map row is read only.
//   - Descriptive z, plus-one empirical two-sided tail with its resolution,
//     exclusion-only wording. No Gaussian significance. `admitted:false` is
//     hard-coded: admission is a paper-level decision recorded in refs/, not
//     an API flag that flips on one corpus.
//   - The statistic never enters rung ranking, sector geometry or any
//     recommendation. Requests carrying `weights`, `importance`, `rank` or
//     `admit` are rejected.

import { ApiError } from "./http.mjs";
import { AXIS_TRIAL_MAX_N } from "./limits.mjs";

export const VERSION = "axis-trial/1";
export const STATISTIC = "loo-nn-vote/1";
export const NULL_SEED_XOR = 0x5bd1e995;
export const MIN_K = 2;
export const MAX_K = 40;
const REJECTED_KEYS = ["weights", "importance", "rank", "admit", "admitted", "threshold", "d", "T", "seed", "frame", "steps"];

export const SCOPE = "Trial of one candidate per-axis statistic (leave-one-out nearest-neighbour predictability of bit j from the other d-1 bits) against the fixed-margin checkerboard null. Exclusion-only reading: an axis whose observed hit count reaches the empirical tail resolution is 'excluded-from-fixed-margin-null' on this corpus and frame; anything else is 'not-excluded'. Descriptive z only; K draws cannot resolve tails below 1/(K+1). This is a diagnostic trial record, not an admitted map coordinate, not an axis weight, not a ranking term and not a statement about what any axis means.";

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function validateBits(bits) {
  if (!Array.isArray(bits) || bits.length < 3) throw new ApiError(409, "map has no usable bits matrix (need >= 3 rows)");
  const d = bits[0] && bits[0].length;
  if (!Number.isInteger(d) || d < 2) throw new ApiError(409, "bits rows must have d >= 2 columns");
  for (const r of bits) { if (!Array.isArray(r) || r.length !== d || r.some((x) => x !== 0 && x !== 1)) throw new ApiError(409, "bits must be a rectangular 0/1 matrix"); }
  return d;
}

/**
 * Leave-one-out nearest-neighbour vote, per axis.
 * For row i and axis j: distance to row k is the Hamming distance on the other
 * d-1 axes; the nearest set (all rows at the minimum distance) votes with its
 * bit j. hit = 1 if the vote majority equals bit_i[j], 0.5 on an exact tie,
 * 0 otherwise. Returns { hits[d], ties[d] } as exact rationals (hits are
 * multiples of 0.5).
 */
export function looNearestNeighbourHits(B) {
  const N = B.length, d = B[0].length;
  // full pairwise Hamming distances once: O(N^2 d)
  const H = Array.from({ length: N }, () => new Int32Array(N));
  for (let i = 0; i < N; i++) for (let k = i + 1; k < N; k++) { let s = 0; const a = B[i], b = B[k]; for (let j = 0; j < d; j++) if (a[j] !== b[j]) s++; H[i][k] = s; H[k][i] = s; }
  const hits = new Array(d).fill(0), ties = new Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < N; i++) {
      let best = Infinity, ones = 0, cnt = 0;
      for (let k = 0; k < N; k++) {
        if (k === i) continue;
        const dist = H[i][k] - (B[i][j] !== B[k][j] ? 1 : 0); // exclude axis j
        if (dist < best) { best = dist; ones = B[k][j]; cnt = 1; }
        else if (dist === best) { ones += B[k][j]; cnt++; }
      }
      const zeros = cnt - ones;
      if (ones === zeros) { hits[j] += 0.5; ties[j]++; }
      else if ((ones > zeros ? 1 : 0) === B[i][j]) hits[j] += 1;
    }
  }
  return { hits, ties };
}

function stats(values) {
  const n = values.length; const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, min: Math.min(...values), max: Math.max(...values) };
}

/**
 * axisRedundancyTrial(bits, { K, seed, attempts, nullDraw })
 *   nullDraw(B, attempts, rng, cert) must be PM._internal.nullDraw (injected).
 */
export function axisRedundancyTrial(bits, opts) {
  const d = validateBits(bits); const N = bits.length;
  const { K, seed, nullDraw } = opts;
  if (typeof nullDraw !== "function") throw new ApiError(500, "nullDraw not available from the loaded core");
  const attempts = opts.attempts ?? 5 * N * d;
  const observed = looNearestNeighbourHits(bits);
  const colOnes = Array.from({ length: d }, (_, j) => bits.reduce((a, r) => a + r[j], 0));
  const marginBaseline = colOnes.map((c) => Math.max(c, N - c));
  const cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
  const rng = mulberry32(seed);
  const draws = [];
  for (let k = 0; k < K; k++) draws.push(looNearestNeighbourHits(nullDraw(bits, attempts, rng, cert)).hits);
  if (!cert.rowOk || !cert.colOk) throw new ApiError(500, "null draw violated a row or column margin; no result is returned");
  const p_resolution = 1 / (K + 1);
  const axes = [];
  let totalObs = 0; const totalNull = new Array(K).fill(0);
  for (let j = 0; j < d; j++) {
    const nullHits = draws.map((h) => h[j]); const s = stats(nullHits);
    const obs = observed.hits[j]; totalObs += obs; nullHits.forEach((v, k) => { totalNull[k] += v; });
    const dev = Math.abs(obs - s.mean);
    const exceed = nullHits.filter((v) => Math.abs(v - s.mean) >= dev).length;
    const p = (1 + exceed) / (K + 1);
    const degenerate = s.sd === 0;
    axes.push({
      axis: j,
      column_ones: colOnes[j],
      margin_baseline_hits: marginBaseline[j],
      observed_hits: obs,
      observed_ties: observed.ties[j],
      observed_minus_margin_baseline: obs - marginBaseline[j],
      null: { K, mean: +s.mean.toFixed(4), sd: +s.sd.toFixed(4), min: s.min, max: s.max, degenerate },
      z_descriptive: degenerate ? null : +((obs - s.mean) / s.sd).toFixed(2),
      p_two_sided: +p.toFixed(4),
      p_resolution: +p_resolution.toFixed(4),
      verdict: degenerate ? "null-degenerate: no trial possible on this corpus" : (p <= p_resolution + 1e-12 ? "excluded-from-fixed-margin-null" : "not-excluded"),
      direction: degenerate ? null : (obs > s.mean ? "more-predictable-than-null" : obs < s.mean ? "less-predictable-than-null" : "equal-to-null-mean"),
    });
  }
  const ts = stats(totalNull); const tdev = Math.abs(totalObs - ts.mean);
  const texceed = totalNull.filter((v) => Math.abs(v - ts.mean) >= tdev).length;
  const nExcluded = axes.filter((a) => a.verdict === "excluded-from-fixed-margin-null").length;
  return {
    version: VERSION, statistic: STATISTIC, N, d, K, attempts_per_draw: attempts, null_seed: seed,
    null_kind: "fixed-attempt symmetric checkerboard-switch chain with self-loops; every row and column margin preserved (same chain as map.null); not a full Curveball trade sequence",
    margins_preserved: { rows: cert.rowOk, columns: cert.colOk, attempted_total: cert.attempted, accepted_total: cert.accepted },
    axes,
    total: { observed_hits: totalObs, null: { mean: +ts.mean.toFixed(4), sd: +ts.sd.toFixed(4), min: ts.min, max: ts.max, degenerate: ts.sd === 0 }, z_descriptive: ts.sd === 0 ? null : +((totalObs - ts.mean) / ts.sd).toFixed(2), p_two_sided: +((1 + texceed) / (K + 1)).toFixed(4), p_resolution: +p_resolution.toFixed(4) },
    counts: { axes: d, excluded_from_null: nExcluded, not_excluded: axes.filter((a) => a.verdict === "not-excluded").length, null_degenerate: axes.filter((a) => a.null.degenerate).length },
    reading: "Under the fixed-margin null the majority baseline of each axis is identical to the observed one, so observed_minus_null measures predictability from inter-axis dependence beyond margins. 'excluded-from-fixed-margin-null' means the observed hit count sat at the empirical tail resolution of K draws; it does not name what the axis means and does not enter ranking.",
    scope: SCOPE,
  };
}

function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.map_id) || body.map_id < 1) throw new ApiError(422, "map_id must be a positive integer");
  for (const k of REJECTED_KEYS) if (body[k] !== undefined) throw new ApiError(422, `${k} is not accepted: the trial statistic is fixed and never feeds weights, ranking or admission`, { rejected_keys: REJECTED_KEYS });
  let K = null;
  if (body.K !== undefined) { if (!Number.isInteger(body.K) || body.K < MIN_K || body.K > MAX_K) throw new ApiError(422, `K must be an integer in ${MIN_K}..${MAX_K}`); K = body.K; }
  let null_seed = null;
  if (body.null_seed !== undefined) { if (!Number.isInteger(body.null_seed) || body.null_seed < -2147483648 || body.null_seed > 4294967295) throw new ApiError(422, "null_seed must be an integer in -2147483648..4294967295"); null_seed = body.null_seed; }
  return { map_id: body.map_id, K, null_seed };
}

/** ctx: { loadStoredMap, PM } */
export async function axisRedundancyHandler(body, ctx) {
  const v = validateRequest(body);
  const map = await ctx.loadStoredMap(v.map_id);
  if (!map) throw new ApiError(404, "map not found");
  if (!map.frame || !Array.isArray(map.bits)) throw new ApiError(409, "legacy map has no frozen frame/bits; create a new baseline");
  if (map.bits.length > AXIS_TRIAL_MAX_N) throw new ApiError(422, `axis trial is O(N^2 d K) and is limited to N <= ${AXIS_TRIAL_MAX_N} (map has ${map.bits.length} rows)`, { max_n: AXIS_TRIAL_MAX_N });
  const nullDraw = ctx.nullDraw || (ctx.PM && ctx.PM._internal && ctx.PM._internal.nullDraw);
  const mapK = Number.isInteger(map.K) ? map.K : (map.null && Number.isInteger(map.null.K) ? map.null.K : 40);
  const K = v.K ?? Math.min(MAX_K, mapK);
  const baseSeed = Number.isInteger(map.seed) ? map.seed : (map.frame && map.frame.config && Number.isInteger(map.frame.config.seed) ? map.frame.config.seed : 0);
  const seed = v.null_seed ?? ((baseSeed ^ NULL_SEED_XOR) | 0);
  const trial = axisRedundancyTrial(map.bits, { K, seed, nullDraw });
  // admission (2026-09-19): computed with the shared recipe — second independent null seed, non-degenerate nulls,
  // reproducible verdicts, margins certified, N >= 100. Admitted = the per-axis hit counts may be REPORTED on this frame.
  const seedB = (seed ^ 0x7f4a7c15) | 0; const trialB = axisRedundancyTrial(map.bits, { K, seed: seedB, nullDraw });
  const perAxis = trial.axes.map((a, j) => ({ axis: j, verdict_seed_a: a.verdict, verdict_seed_b: trialB.axes[j].verdict, null_nondegenerate: !a.null.degenerate && !trialB.axes[j].null.degenerate, verdict_reproducible: a.verdict === trialB.axes[j].verdict }));
  const criteria = { null_nondegenerate_all: perAxis.every((x) => x.null_nondegenerate), verdicts_reproducible_all: perAxis.every((x) => x.verdict_reproducible), margins_preserved: trial.margins_preserved.rows && trial.margins_preserved.columns && trialB.margins_preserved.rows && trialB.margins_preserved.columns, n_at_least_100: map.bits.length >= 100 };
  const admitted = Object.values(criteria).every(Boolean);
  trial.admitted = admitted;
  trial.admission = { admitted, scope: "reporting on this frame only; never an axis weight, importance or ranking term", criteria, seeds: { a: seed, b: seedB }, per_axis: perAxis, why_not: admitted ? null : Object.entries(criteria).filter(([, x]) => !x).map(([k]) => k) };
  trial.admission_note = admitted ? "admission criteria met on this frame (see admission.criteria)" : "admission criteria not met on this frame (see admission.why_not); diagnostic record only";
  return {
    trial: true, persisted: false, map_id: v.map_id, frame_id: map.frame_id ?? null, instrument_id: map.instrument_id ?? null,
    seed_note: v.null_seed === null ? "null_seed derived as (map.seed XOR 0x5bd1e995) so the trial chain is distinct from the map's own V2 null chain yet reproducible" : "caller-supplied null_seed",
    ...trial,
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false },
    task_verdict: "not-applicable",
  };
}
