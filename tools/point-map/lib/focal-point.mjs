// lib/focal-point.mjs -- the dimensional focal point of a stored point map.
// Deployed as part of the point-map bundle (worker-base.js -> build.mjs -> index.js).
//
// Source of record: papers/dimensional-focal-point-2026-11-10.tex (paper 4 of
// the curved-corpus series), Sections 4-7, and the Lean module
// papers/data/lean/FocalBounds.lean (19 theorems).
//
// Route (wired in worker-base.js next to the other /api/map/* trials):
//   POST /api/jev/map/focal {"map_id": n, "tau"?: (0,1], "K"?: 2..40,
//        "null_seed"?: int, "trades_per_row"?: 1..200, "eps"?: number[]}
//   -> per-axis distinguishability ladder of the frozen instrument, the
//      focal dimension n* (keep axes that add >= tau bits), a fixed-margin
//      curveball null with two seeds, certified class counts under an l_inf
//      input perturbation, and the stereographic lens-power scan.
//
// Unlike the axis/rayleigh/azimuth/admission trials (O(N^2 d K), N <= 4000),
// every block here is linear in N or works on distinct patterns only, so it
// runs on full-size maps (the 3,232-item map #598 included).
//
// Lean invariants enforced at runtime (FocalBounds.lean). The trial throws
// "INVARIANT VIOLATED" instead of clamping:
//   prefix_count_mono      N_d <= N_{d+1}
//   prefix_count_double    N_{d+1} <= 2 N_d
//   prefix_count_pow       N_d <= 2^d
//   prefix_count_le_length N_d <= n
//   focalDim_le_length     n* <= d
//   focalDim_prefix_meets  every gain in the selected prefix is >= tau
//   focalDim_stop_fails    the first gain after the prefix (if any) is < tau
//   focalDim_maximal       no longer prefix meets tau
// They are checked on the observed ladder and on every null ladder.
//
// Web APIs only, no npm. Pure core (focalPointTrial) plus a thin handler.
// Nothing is persisted: no D1 row, no KV write, no Vectorize, no repository.

export const FOCAL_VERSION = "focal-point/2";
export const DIMSTRUCT_VERSION = "dimension-structure/1";
export const LEAN_MODULE = "papers/data/lean/FocalBounds.lean";

const DEFAULT_TAU = 0.5;            // half a bit (paper, Definition 2)
const DEFAULT_K = 20;               // null draws per seed (paper: 20 curveball draws)
const MAX_K = 40;                   // same ceiling as the other map trials
const DEFAULT_TRADES_PER_ROW = 100; // paper: 100 n trades per curveball draw
const MAX_TRADES_PER_ROW = 200;
const MAX_TOTAL_TRADES = 4e7;       // 2 seeds * K * trades_per_row * n, CPU budget
const MAX_D = 30;                   // rows are packed into 32-bit masks
const ISO_RADIUS = 0.095;           // canonical chord (pointmap.js ISO_RADIUS)
const DEFAULT_EPS = [0, 0.001, 0.0016, 0.0026, 0.0042, 0.0067, 0.0108, 0.0137, 0.0221, 0.0353, 0.0568, 0.0914, 0.1471, 0.2365];
const MAX_EPS = 32;
const MAX_CERT_SIGNATURES = 4000;   // pairwise certificate matrix is O(U^2 d)
const MAX_LENS_POINTS = 6000;       // greedy packing per lens power is O(U * N)
const LENS_GRID = Array.from({ length: 49 }, (_, i) => Math.pow(2, -2 + i / 6)); // 0.25 .. 16, as in the paper
const SEED_XOR_A = 0x2f6b1d3c;
const SEED_XOR_B = 0x7f4a7c15;

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function popcount(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
}

const log2 = (x) => Math.log(x) / Math.LN2;
const round = (x, k = 6) => (x === null || x === undefined || !Number.isFinite(x) ? x : Number(x.toFixed(k)));
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

class TrialError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function invariant(ok, theorem, detail) {
  if (!ok) throw new Error(`INVARIANT VIOLATED (FocalBounds.lean ${theorem}): ${detail}`);
}

// ---------------------------------------------------------------------------
// input validation
// ---------------------------------------------------------------------------

export function validateFocalBody(body) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : null;
  if (!b) throw new TrialError(400, "body must be a JSON object");
  const map_id = Number(b.map_id);
  if (!Number.isInteger(map_id) || map_id <= 0) throw new TrialError(400, "map_id must be a positive integer");
  const tau = b.tau === undefined ? DEFAULT_TAU : Number(b.tau);
  if (!(tau > 0 && tau <= 1)) throw new TrialError(400, "tau must be in (0, 1] bits");
  const K = b.K === undefined ? DEFAULT_K : Number(b.K);
  if (!Number.isInteger(K) || K < 2 || K > MAX_K) throw new TrialError(400, `K must be an integer in 2..${MAX_K}`);
  const tpr = b.trades_per_row === undefined ? DEFAULT_TRADES_PER_ROW : Number(b.trades_per_row);
  if (!Number.isInteger(tpr) || tpr < 1 || tpr > MAX_TRADES_PER_ROW) throw new TrialError(400, `trades_per_row must be an integer in 1..${MAX_TRADES_PER_ROW}`);
  const null_seed = b.null_seed === undefined ? null : Number(b.null_seed);
  if (null_seed !== null && !Number.isInteger(null_seed)) throw new TrialError(400, "null_seed must be an integer");
  let eps = DEFAULT_EPS;
  if (b.eps !== undefined) {
    if (!Array.isArray(b.eps) || b.eps.length < 1 || b.eps.length > MAX_EPS || !b.eps.every((e) => Number.isFinite(e) && e >= 0)) {
      throw new TrialError(400, `eps must be an array of 1..${MAX_EPS} non-negative numbers`);
    }
    eps = b.eps.slice().sort((x, y) => x - y);
  }
  return { map_id, tau, K, trades_per_row: tpr, null_seed, eps };
}

// ---------------------------------------------------------------------------
// the distinguishability ladder (paper Section 4; FocalBounds prefix_count_*)
// ---------------------------------------------------------------------------

// rows: Int32Array of masks, axis j at bit j. Returns N_d for d = 1..D and,
// optionally, the class sizes of each top-d prefix partition.
export function prefixLadder(rows, D, withSizes = false) {
  const counts = new Array(D);
  const sizes = withSizes ? new Array(D) : null;
  for (let d = 1; d <= D; d++) {
    const m = d >= 31 ? -1 : (1 << d) - 1;
    const h = new Map();
    for (let i = 0; i < rows.length; i++) {
      const k = rows[i] & m;
      h.set(k, (h.get(k) || 0) + 1);
    }
    counts[d - 1] = h.size;
    if (withSizes) sizes[d - 1] = Array.from(h.values());
  }
  return { counts, sizes };
}

export function renyiBits(sizes, n) {
  let h1 = 0, s2 = 0;
  for (const c of sizes) {
    const p = c / n;
    h1 -= p * log2(p);
    s2 += p * p;
  }
  return { D0: log2(sizes.length), D1: h1, D2: -log2(s2) };
}

export function ladderGains(counts) {
  const g = new Array(counts.length);
  let prev = 1;
  for (let i = 0; i < counts.length; i++) {
    g[i] = log2(counts[i] / prev);
    prev = counts[i];
  }
  return g;
}

// Definition 2: the largest prefix of axes each of which adds >= tau bits.
export function focalDim(gains, tau) {
  let n = 0;
  while (n < gains.length && gains[n] >= tau) n++;
  return n;
}

// tau-interval on which focalDim returns the same n* (paper: stable band).
export function stableBand(gains, nStar) {
  const lo = nStar < gains.length ? gains[nStar] : 0;                    // tau must exceed the first failing gain
  const hi = nStar > 0 ? Math.min(...gains.slice(0, nStar)) : Infinity;  // and not exceed the weakest kept gain
  return { lower_exclusive: lo, upper_inclusive: hi };
}

export function assertFocalBounds(counts, n, gains, tau, nStar, label) {
  const D = counts.length;
  for (let d = 0; d < D; d++) {
    invariant(counts[d] <= Math.pow(2, d + 1), "prefix_count_pow", `${label}: N_${d + 1}=${counts[d]} > 2^${d + 1}`);
    invariant(counts[d] <= n, "prefix_count_le_length", `${label}: N_${d + 1}=${counts[d]} > n=${n}`);
    if (d + 1 < D) {
      invariant(counts[d] <= counts[d + 1], "prefix_count_mono", `${label}: N_${d + 1}=${counts[d]} > N_${d + 2}=${counts[d + 1]}`);
      invariant(counts[d + 1] <= 2 * counts[d], "prefix_count_double", `${label}: N_${d + 2}=${counts[d + 1]} > 2 N_${d + 1}=${2 * counts[d]}`);
    }
  }
  invariant(nStar >= 0 && nStar <= D, "focalDim_le_length", `${label}: n*=${nStar} outside 0..${D}`);
  for (let i = 0; i < nStar; i++) invariant(gains[i] >= tau, "focalDim_prefix_meets", `${label}: gain[${i + 1}]=${gains[i]} < tau=${tau}`);
  if (nStar < D) invariant(gains[nStar] < tau, "focalDim_stop_fails", `${label}: gain[${nStar + 1}]=${gains[nStar]} >= tau=${tau}`);
  for (let m = nStar + 1; m <= D; m++) {
    invariant(!gains.slice(0, m).every((g) => g >= tau), "focalDim_maximal", `${label}: prefix of length ${m} also meets tau`);
  }
}

// ---------------------------------------------------------------------------
// fixed-margin null: curveball on the bit matrix (Carstens 2015)
// ---------------------------------------------------------------------------

export function curveball(rows, D, trades, rand) {
  const out = Int32Array.from(rows);
  const n = out.length;
  const pos = new Int32Array(D);
  for (let t = 0; t < trades; t++) {
    const i = Math.floor(rand() * n), k = Math.floor(rand() * n);
    if (i === k) continue;
    const A = out[i], B = out[k];
    const a = A & ~B, b = B & ~A;
    if (a === 0 && b === 0) continue;
    const both = A & B, pool = a | b;
    let m = 0;
    for (let j = 0; j < D; j++) if (pool & (1 << j)) pos[m++] = j;
    for (let j = m - 1; j > 0; j--) { // Fisher-Yates on the pooled positions
      const r = Math.floor(rand() * (j + 1));
      const tmp = pos[j]; pos[j] = pos[r]; pos[r] = tmp;
    }
    const na = popcount(a);
    let Ai = both, Bk = both;
    for (let j = 0; j < m; j++) {
      if (j < na) Ai |= 1 << pos[j];
      else Bk |= 1 << pos[j];
    }
    out[i] = Ai; out[k] = Bk;
  }
  return out;
}

function nullBlock(rows, D, n, tau, K, trades, seed, obsClasses) {
  const rand = mulberry32(seed);
  const ladders = [], nStars = [];
  for (let k = 0; k < K; k++) {
    const nulRows = curveball(rows, D, trades, rand);
    const { counts } = prefixLadder(nulRows, D);
    const g = ladderGains(counts);
    const ns = focalDim(g, tau);
    assertFocalBounds(counts, n, g, tau, ns, `null draw ${k} (seed ${seed})`);
    ladders.push(counts);
    nStars.push(ns);
  }
  const col = (d) => ladders.map((L) => L[d]);
  const last = col(D - 1);
  const s = sd(last);
  return {
    seed,
    ladder_mean: Array.from({ length: D }, (_, d) => round(mean(col(d)), 3)),
    ladder_sd: Array.from({ length: D }, (_, d) => round(sd(col(d)), 3)),
    gain_mean: Array.from({ length: D }, (_, d) => round(mean(ladders.map((L) => log2(L[d] / (d ? L[d - 1] : 1)))), 4)),
    n_star_values: Array.from(new Set(nStars)).sort((x, y) => x - y),
    classes_z: s > 0 ? round((obsClasses - mean(last)) / s, 2) : null,
    degenerate: s === 0 && new Set(nStars).size === 1,
  };
}

// ---------------------------------------------------------------------------
// certified distinguishability (paper Section 5; WayfinderBounds.stable_on/off)
// ---------------------------------------------------------------------------

// Items i, j are certifiably distinct at eps on axis a if their bits differ
// there and both margins are certified: |m| > eps * ||axis_a||_1. Returns the
// size of a greedy maximal pairwise-certifiably-distinct family (a lower
// bound) over the first `dUse` axes. Deterministic order: most-certified
// signatures first, ties broken by the lexicographic signature.
export function certifiedCount(bits, margins, norm1, eps, dUse) {
  const seen = new Set();
  for (let i = 0; i < bits.length; i++) {
    let key = "";
    for (let a = 0; a < dUse; a++) key += bits[i][a] ? "1" : "0";
    key += "|";
    for (let a = 0; a < dUse; a++) key += Math.abs(margins[i][a]) > eps * norm1[a] ? "1" : "0";
    seen.add(key);
  }
  const sigs = Array.from(seen).sort();
  if (sigs.length > MAX_CERT_SIGNATURES) return null;
  const B = sigs.map((s) => s.slice(0, dUse));
  const S = sigs.map((s) => s.slice(dUse + 1));
  const nStable = S.map((s) => s.split("").filter((c) => c === "1").length);
  const order = sigs.map((_, i) => i).sort((x, y) => (nStable[y] - nStable[x]) || (x - y));
  const chosen = [];
  for (const i of order) {
    let ok = true;
    for (const j of chosen) {
      let distinct = false;
      for (let a = 0; a < dUse; a++) {
        if (B[i][a] !== B[j][a] && S[i][a] === "1" && S[j][a] === "1") { distinct = true; break; }
      }
      if (!distinct) { ok = false; break; }
    }
    if (ok) chosen.push(i);
  }
  return chosen.length;
}

// ---------------------------------------------------------------------------
// lens power on the PCA sphere (paper Section 6)
// ---------------------------------------------------------------------------

// pointmap.js lift: (u, v) -> (2u, 2v, u^2 + v^2 - 1) / (1 + u^2 + v^2), with
// (u, v) = s * (PCA-2 coordinates). The inverse w = (x, y) / (1 - z) recovers
// s * (u, v) exactly, so every power s' = k * s_RMS is reachable from pts_full.
function liftPlane(w) {
  const q = w[0] * w[0] + w[1] * w[1];
  return [2 * w[0] / (1 + q), 2 * w[1] / (1 + q), (q - 1) / (1 + q)];
}
const chord = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

// Greedy maximal packing at chord eps over distinct points (rounded at 1e-10),
// in lexicographic order -- the paper's cover_count.
export function greedyPacking(points, eps) {
  const uniq = new Map();
  for (const p of points) {
    const k = p.map((x) => Math.round(x * 1e10) / 1e10);
    uniq.set(k.join(","), k);
  }
  const P = Array.from(uniq.values()).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]));
  const alive = new Uint8Array(P.length).fill(1);
  let cnt = 0;
  for (let i = 0; i < P.length; i++) {
    if (!alive[i]) continue;
    cnt++;
    for (let j = i; j < P.length; j++) if (alive[j] && chord(P[i], P[j]) < eps - 1e-12) alive[j] = 0;
  }
  return { count: cnt, distinct: P.length };
}

export function lensScan(pts) {
  const W = pts.map((p) => [p[0] / (1 - p[2]), p[1] / (1 - p[2])]);
  const r2 = W.map((w) => w[0] * w[0] + w[1] * w[1]);
  const rms = Math.sqrt(mean(r2)); // = s_served / s_RMS, because w = s_served * (u, v)
  if (!(rms > 0)) return null;
  const at = (k) => greedyPacking(W.map((w) => liftPlane([k * w[0] / rms, k * w[1] / rms])), ISO_RADIUS).count;
  const served = greedyPacking(pts, ISO_RADIUS);
  const scan = LENS_GRID.map((k) => ({ k: round(k, 4), N: at(k) }));
  const best = scan.reduce((b, x) => (x.N > b.N ? x : b), scan[0]);
  const rmsN = at(1);
  return {
    chord: ISO_RADIUS,
    distinct_positions: served.distinct,
    served_power_over_rms: round(rms, 4),
    N_served: served.count,
    N_rms: rmsN,
    N_best: best.N,
    best_power_over_rms: best.k,
    rms_fraction_of_best: round(rmsN / best.N, 4),
    served_fraction_of_best: round(served.count / best.N, 4),
    grid: { from: LENS_GRID[0], to: LENS_GRID[LENS_GRID.length - 1], steps: LENS_GRID.length, spacing: "geometric, ratio 2^(1/6)" },
    scan,
    recommendation: rmsN >= served.count ? "rms-rescale" : "served",
  };
}


// ---------------------------------------------------------------------------
// dimension x structure (paper 4, Section "Dimension and structure";
// FocalBounds.structure_sign_identity, FocalBounds.gate_structure_independent)
//
// Two readouts of the same prefix code, reported side by side and never merged:
//   DIMENSION -- the fixed Lean section 4 gate, unchanged: V2 = top-2 share of the
//     j x j bit-correlation spectrum, rhat = 2/V2, gate V2 >= 0.40 <-> rhat <= 5
//     (CurvedCorpus.gate_rank_identity). It says how many effective dimensions the
//     code spans at prefix j, i.e. where the map can be focused.
//   STRUCTURE -- the same statistic against a fixed-margin null AT THE SAME j:
//     rhat0 = 2/E0[V2*], delta_rhat = rhat0 - rhat (>= 0 iff V2 >= E0,
//     structure_sign_identity), z and an empirical two-sided tail. It says whether
//     the corpus is more concentrated than its margins alone imply.
// The two are logically independent (gate_structure_independent): a small prefix
// passes the gate by construction (rhat <= j), and a structured corpus can fail it.
// ---------------------------------------------------------------------------

export const GATE_V2 = 0.4;
export const RANK_MAX = 5;

function symEigenvalues(A) { // cyclic Jacobi, small symmetric matrices (j <= 30)
  const n = A.length, M = A.map((r) => r.slice());
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += M[p][q] * M[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(M[p][q]) < 1e-300) continue;
      const th = (M[q][q] - M[p][p]) / (2 * M[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const a = M[k][p], b = M[k][q];
        M[k][p] = c * a - s * b; M[k][q] = s * a + c * b;
      }
      for (let k = 0; k < n; k++) {
        const a = M[p][k], b = M[q][k];
        M[p][k] = c * a - s * b; M[q][k] = s * a + c * b;
      }
    }
  }
  return M.map((r, i) => r[i]).sort((x, y) => y - x);
}

// V2 of the first j bits of packed rows: top-2 eigenvalue share of the bit
// correlation matrix (constant columns contribute nothing, as in pointmap.js V2).
export function prefixV2(rows, j) {
  const n = rows.length;
  const c1 = new Float64Array(j), c11 = Array.from({ length: j }, () => new Float64Array(j));
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    for (let a = 0; a < j; a++) if (r & (1 << a)) {
      c1[a]++;
      for (let b = a; b < j; b++) if (r & (1 << b)) c11[a][b]++;
    }
  }
  const p = Array.from(c1, (x) => x / n);
  const sdv = p.map((x) => Math.sqrt(x * (1 - x)));
  const C = Array.from({ length: j }, () => new Array(j).fill(0));
  for (let a = 0; a < j; a++) for (let b = a; b < j; b++) {
    if (!(sdv[a] > 0 && sdv[b] > 0)) continue;
    const v = (c11[a][b] / n - p[a] * p[b]) / (sdv[a] * sdv[b]);
    C[a][b] = v; C[b][a] = v;
  }
  const ev = symEigenvalues(C).map((x) => Math.max(0, x));
  const tr = ev.reduce((s, x) => s + x, 0);
  if (!(tr > 1e-12)) return 0;
  return Math.min(1, ((ev[0] || 0) + (ev[1] || 0)) / tr);
}

function gateOf(v2) {
  const ok = Number.isFinite(v2) && v2 > 0;
  return { v2: round(v2, 6), rhat: ok ? round(2 / v2, 4) : null, gate_pass: ok ? 5 * v2 >= 2 : null };
}

function structureOf(v2, nulls) {
  const K = nulls.length, E0 = mean(nulls), S0 = sd(nulls);
  const admissible = Number.isFinite(S0) && S0 >= 1e-6 && E0 > 0;
  const obs = Math.abs(v2 - E0);
  const ext = nulls.filter((x) => Math.abs(x - E0) >= obs - 1e-15).length;
  const p = (1 + ext) / (K + 1), res = 1 / (K + 1);
  const excluded = admissible && p <= res + 1e-15;
  const direction = v2 > E0 ? "above-null" : v2 < E0 ? "below-null" : "at-null";
  return {
    null_v2_mean: round(E0, 6), null_v2_sd: round(S0, 6),
    rhat_null: E0 > 0 ? round(2 / E0, 4) : null,
    delta_rhat: E0 > 0 && v2 > 0 ? round(2 / E0 - 2 / v2, 4) : null,
    delta_rhat_sd: E0 > 0 ? round(2 * S0 / (E0 * E0), 4) : null,
    z: admissible ? round((v2 - E0) / S0, 2) : null,
    p_two_sided: round(p, 4), p_resolution: round(res, 4),
    structure: !admissible ? "not-tested (degenerate null)" : excluded ? direction : "within-null",
  };
}

export function readoutOf(gatePass, structure) {
  if (gatePass === null) return "not-applicable (degenerate coordinate)";
  if (structure === "above-null") return gatePass ? "low-dimensional and structured" : "structured, above the focus dimension";
  if (structure === "below-null") return gatePass ? "low-dimensional, more dispersed than the null" : "high-dimensional, more dispersed than the null";
  if (structure === "within-null") return gatePass ? "low-dimensional, structure not resolved from the null" : "high-dimensional, structure not resolved from the null";
  return "low-dimensional by the gate; structure not tested";
}

// Per-prefix profile on the frozen code. The null at each j is a curveball draw
// on the j-bit prefix matrix (its own row and column sums preserved).
export function dimensionStructureProfile(rows, D, n, { K, tradesPerRow, seed }) {
  const prof = [];
  for (let j = 2; j <= D; j++) {
    const mask = j >= 31 ? -1 : (1 << j) - 1;
    const pr = Int32Array.from(rows, (x) => x & mask);
    const v2 = prefixV2(pr, j);
    const rand = mulberry32((seed ^ Math.imul(j, 0x9e3779b1)) | 0);
    const nulls = [];
    for (let k = 0; k < K; k++) nulls.push(prefixV2(curveball(pr, j, tradesPerRow * n, rand), j));
    const g = gateOf(v2), st = structureOf(v2, nulls);
    prof.push({ j, ...g, ...st, readout: readoutOf(g.gate_pass, st.structure) });
  }
  const passing = prof.filter((r) => r.gate_pass);
  const dGate = passing.length ? Math.max(...passing.map((r) => r.j)) : null;
  const zs = prof.filter((r) => r.z !== null);
  const best = zs.length ? zs.reduce((a, b) => (b.z > a.z ? b : a)) : null;
  const atGate = dGate ? prof.find((r) => r.j === dGate) : null;
  return {
    profile: prof,
    focus: {
      d_focus: dGate,
      d_focus_rule: "largest prefix j whose code passes the fixed gate V2 >= 0.40 (rhat <= 5): the dimension at which the map can be focused",
      structure_at_d_focus: atGate ? atGate.structure : null,
      z_at_d_focus: atGate ? atGate.z : null,
      d_max_structure: best ? best.j : null,
      z_max: best ? best.z : null,
      structured_prefixes: prof.filter((r) => r.structure === "above-null").map((r) => r.j),
    },
  };
}

// ---------------------------------------------------------------------------
// the trial
// ---------------------------------------------------------------------------

function rowsFromBits(bits, D) {
  const rows = new Int32Array(bits.length);
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i];
    if (!Array.isArray(b) || b.length !== D) throw new TrialError(409, `bits row ${i} does not have d=${D} entries`);
    let m = 0;
    for (let j = 0; j < D; j++) {
      if (b[j] !== 0 && b[j] !== 1) throw new TrialError(409, `bits row ${i} is not binary`);
      if (b[j]) m |= 1 << j;
    }
    rows[i] = m;
  }
  return rows;
}

export function focalPointTrial(map, opts = {}) {
  const t0 = Date.now();
  if (!map || !map.frame || !Array.isArray(map.bits) || !map.bits.length) {
    throw new TrialError(409, "legacy map has no frozen frame/bits; create a new baseline");
  }
  const n = map.bits.length;
  const D = map.bits[0].length;
  if (!(D >= 1 && D <= MAX_D)) throw new TrialError(409, `d=${D} outside 1..${MAX_D}`);
  const tau = opts.tau ?? DEFAULT_TAU;
  const K = opts.K ?? DEFAULT_K;
  const tpr = opts.trades_per_row ?? DEFAULT_TRADES_PER_ROW;
  const eps = opts.eps ?? DEFAULT_EPS;
  const trades = tpr * n;
  if (2 * K * trades > MAX_TOTAL_TRADES) {
    throw new TrialError(400, `null budget 2*K*trades_per_row*n = ${2 * K * trades} exceeds ${MAX_TOTAL_TRADES}; lower K or trades_per_row`, { max_total_trades: MAX_TOTAL_TRADES });
  }
  const baseSeed = opts.null_seed ?? (((Number.isInteger(map.seed) ? map.seed : 0) ^ SEED_XOR_A) | 0);
  const seedB = (baseSeed ^ SEED_XOR_B) | 0;

  // 1. ladder, gains, Renyi spectrum of the instrument's prefix partitions
  const rows = rowsFromBits(map.bits, D);
  const { counts, sizes } = prefixLadder(rows, D, true);
  const gains = ladderGains(counts);
  const nStar = focalDim(gains, tau);
  assertFocalBounds(counts, n, gains, tau, nStar, "observed");
  const renyi = sizes.map((s) => {
    const r = renyiBits(s, n);
    return { D0: round(r.D0, 4), D1: round(r.D1, 4), D2: round(r.D2, 4) };
  });
  const ceiling = log2(n);

  // 2. null, two seeds
  const nullA = nullBlock(rows, D, n, tau, K, trades, baseSeed, counts[D - 1]);
  const nullB = nullBlock(rows, D, n, tau, K, trades, seedB, counts[D - 1]);
  const nullStars = Array.from(new Set([...nullA.n_star_values, ...nullB.n_star_values])).sort((x, y) => x - y);
  const sepA = !nullA.n_star_values.includes(nStar), sepB = !nullB.n_star_values.includes(nStar);
  const reproducible = sepA === sepB;
  const verdict = !reproducible ? "not-reproducible-across-seeds"
    : sepA ? "focal-point-corpus-specific"
    : "focal-point-not-separable-from-null";

  // 2b. dimension x structure on the same prefix code (gate unchanged; null at each j)
  const dsK = Math.min(K, 20), dsTpr = Math.min(tpr, 25);
  const ds = dimensionStructureProfile(rows, D, n, { K: dsK, tradesPerRow: dsTpr, seed: (baseSeed ^ 0x51ed270b) | 0 });
  const atD = ds.profile[ds.profile.length - 1] || null;
  const storedNull = map.null && Number.isFinite(map.null.E0) ? map.null : null;
  const dimension_structure = {
    version: DIMSTRUCT_VERSION,
    dimension: { gate_v2: GATE_V2, rank_max: RANK_MAX, lean: "CurvedCorpus.gate_rank_identity (V2 >= 2/5 <-> 2/V2 <= 5)",
      meaning: "effective dimension of the frozen prefix code; the gate marks where the map can be focused" },
    structure: { null: `curveball on the j-bit prefix matrix, K=${dsK}, ${dsTpr}*N trades per draw, at every prefix j`,
      lean: "FocalBounds.structure_sign_identity (V2 >= E0 <-> 2/E0 >= 2/V2)",
      meaning: "excess concentration over a margin-matched null at the same j; delta_rhat is that excess in dimension units" },
    independence: "FocalBounds.gate_structure_independent: neither readout implies the other, so both are reported",
    at_d: atD,
    stored_null_at_d: storedNull ? { kind: storedNull.kind, K: storedNull.K, null_v2_mean: storedNull.E0, null_v2_sd: storedNull.SD0, z: storedNull.z, verdict: storedNull.verdict,
      rhat_null: storedNull.E0 > 0 ? round(2 / storedNull.E0, 4) : null } : null,
    focus: { ...ds.focus, n_star: nStar },
    profile: ds.profile,
  };

  // 3. certified class counts (needs per-input margins and axis l1 norms)
  let certified = { available: false, reason: "map carries no math_diagnostics.per_input margins / axes norm1" };
  const md = map.math_diagnostics;
  if (md && Array.isArray(md.per_input) && md.per_input.length === n && Array.isArray(md.axes) && md.axes.length === D) {
    const margins = md.per_input.map((r) => r.margins.map((m) => m.signed_margin));
    const norm1 = md.axes.map((a) => a.norm1);
    const full = eps.map((e) => certifiedCount(map.bits, margins, norm1, e, D));
    const focal = nStar > 0 && nStar < D ? eps.map((e) => certifiedCount(map.bits, margins, norm1, e, nStar)) : null;
    certified = full.includes(null) || (focal && focal.includes(null))
      ? { available: false, reason: `more than ${MAX_CERT_SIGNATURES} distinct certificate signatures` }
      : {
          available: true,
          definition: "greedy maximal family of items pairwise distinct on >= 1 axis whose margins are both certified, |m| > eps * ||axis||_1 (WayfinderBounds.stable_on/stable_off); a lower bound",
          eps,
          classes_all_axes: full,
          classes_top_n_star: focal,
          contributed_beyond_n_star: focal ? full.map((x, i) => x - focal[i]) : null,
        };
  }

  // 4. lens power on the stored globe
  let lens = { available: false, reason: "map carries no pts_full" };
  if (Array.isArray(map.pts_full) && map.pts_full.length === n) {
    const distinct = new Set(map.pts_full.map((p) => p.map((x) => Math.round(x * 1e10)).join(","))).size;
    lens = distinct > MAX_LENS_POINTS
      ? { available: false, reason: `more than ${MAX_LENS_POINTS} distinct positions` }
      : { available: true, ...lensScan(map.pts_full) };
  }

  const band = stableBand(gains, nStar);
  return {
    trial: true,
    persisted: false,
    version: FOCAL_VERSION,
    map_id: map.id ?? opts.map_id ?? null,
    frame_id: map.frame_id ?? null,
    instrument_id: map.instrument_id ?? null,
    N: n,
    d: D,
    tau,
    ladder: { counts, gains_bits: gains.map((g) => round(g, 4)), renyi_bits: renyi },
    focal: {
      n_star: nStar,
      stable_tau_band: { lower_exclusive: round(band.lower_exclusive, 4), upper_inclusive: round(band.upper_inclusive, 4) },
      D0_at_n_star: nStar ? round(log2(counts[nStar - 1]), 4) : 0,
      sample_ceiling_bits: round(ceiling, 4),
      ceiling_gap_bits: nStar ? round(ceiling - log2(counts[nStar - 1]), 4) : round(ceiling, 4),
      verdict,
    },
    null: {
      kind: "curveball on the bit matrix (row and column sums preserved; Carstens 2015)",
      K,
      trades_per_draw: trades,
      seeds: { a: baseSeed, b: seedB },
      n_star_values: nullStars,
      seed_a: nullA,
      seed_b: nullB,
      separable: sepA && sepB,
      reproducible,
    },
    dimension_structure,
    certified,
    lens,
    lean: {
      module: LEAN_MODULE,
      checked: ["prefix_count_mono", "prefix_count_double", "prefix_count_pow", "prefix_count_le_length",
        "focalDim_le_length", "focalDim_prefix_meets", "focalDim_stop_fails", "focalDim_maximal"],
      ladders_checked: 1 + 2 * K,
      dimension_structure: ["CurvedCorpus.gate_rank_identity", "FocalBounds.structure_sign_identity", "FocalBounds.gate_structure_independent"],
      violations: 0,
    },
    seconds: round((Date.now() - t0) / 1000, 3),
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false },
    scope: "Reporting on this frame only. The ladder is the deployed instrument's own prefix partition; n* is the largest prefix of axes each adding >= tau bits. The null controls row and column sums of the bit matrix only; z-scores are descriptive.",
  };
}

// Route handler: same contract as rayleighHandler / axisRedundancyHandler.
// ctx.loadStoredMap(id) -> decoded map | null; ctx.ApiError -> the error class
// that index.js errorResponse() renders (falls back to a local class).
export async function focalHandler(body, ctx = {}) {
  const Err = ctx.ApiError || TrialError;
  let v;
  try {
    v = validateFocalBody(body);
  } catch (e) {
    throw new Err(e.status || 400, e.message, e.extra);
  }
  const map = await ctx.loadStoredMap(v.map_id);
  if (!map) throw new Err(404, "map not found");
  try {
    return focalPointTrial({ ...map, id: map.id ?? v.map_id }, v);
  } catch (e) {
    if (e instanceof TrialError) throw new Err(e.status, e.message, e.extra);
    throw e; // invariant violations and bugs surface as 500, never clamped
  }
}

// ---------------------------------------------------------------------------
// self-test (deterministic; runs without bindings)
// ---------------------------------------------------------------------------

export function selfTest() {
  const checks = [];
  const add = (id, pass, detail) => checks.push({ id, pass: !!pass, detail });
  // F1: the full cube {0,1}^3 has ladder 2,4,8 and n* = 3.
  const cube = [];
  for (let m = 0; m < 8; m++) cube.push([m & 1, (m >> 1) & 1, (m >> 2) & 1]);
  const lc = prefixLadder(rowsFromBits(cube, 3), 3).counts;
  add("F1_cube_ladder", lc.join() === "2,4,8" && focalDim(ladderGains(lc), 0.5) === 3, lc.join());
  // F2: a constant axis adds 0 bits and stops the focal prefix.
  const flat = cube.map((r) => [r[0], r[1], 0]);
  const lf = prefixLadder(rowsFromBits(flat, 3), 3).counts;
  add("F2_constant_axis", lf.join() === "2,4,4" && focalDim(ladderGains(lf), 0.5) === 2, lf.join());
  // F3: curveball preserves row and column sums.
  const rnd = mulberry32(20261110);
  const base = Int32Array.from({ length: 64 }, () => Math.floor(rnd() * 512));
  const nul = curveball(base, 9, 6400, mulberry32(7));
  const rowsOk = base.every((x, i) => popcount(x) === popcount(nul[i]));
  const colsOk = Array.from({ length: 9 }, (_, j) =>
    base.reduce((s, x) => s + ((x >> j) & 1), 0) === nul.reduce((s, x) => s + ((x >> j) & 1), 0)).every(Boolean);
  add("F3_curveball_margins", rowsOk && colsOk && !base.every((x, i) => x === nul[i]), { rowsOk, colsOk });
  // F4: negative control -- a ladder violating prefix_count_double must throw.
  let threw = false;
  try { assertFocalBounds([2, 5], 10, ladderGains([2, 5]), 0.5, 2, "mutant"); } catch (e) { threw = String(e.message).includes("prefix_count_double"); }
  add("F4_invariant_negative_control", threw, "N_2 = 5 > 2 N_1 must throw");
  // F5: the stereographic inverse round-trips the pointmap.js lift.
  const w = [0.3, -0.7], p = liftPlane(w), back = [p[0] / (1 - p[2]), p[1] / (1 - p[2])];
  add("F5_lift_roundtrip", Math.abs(back[0] - w[0]) < 1e-12 && Math.abs(back[1] - w[1]) < 1e-12, back);
  // F6: the stable band brackets tau.
  const band = stableBand([1, 1, 0.7, 0.2], 3);
  add("F6_stable_band", band.lower_exclusive === 0.2 && band.upper_inclusive === 0.7, band);
  return { ok: checks.every((c) => c.pass), passed: checks.filter((c) => c.pass).length, total: checks.length, checks };
}
