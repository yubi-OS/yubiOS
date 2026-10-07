// jev-spectral-math.js — pure, deterministic ES-module spectral math for
// spectral-standard-v1 + hierarchy-oracle-v1 (SPEC 2026-10-06, Lane B JS worker port).
// No imports, no env access, Workers-compatible (plain ES module), no npm deps.
//
// Semantics mirror the Python source of record (spectral_standard.py, Lane A).
// Parity contract (every rule here is pinned so Python can reproduce exactly):
//  - mulberry32: identical uint32 op order (see comment block on mulberry32).
//  - Walks (P1, 2026-10-06): Lane A canonical PER-WALKER streams. Walker i's
//    PRNG is mulberry32((base_seed + i) >>> 0) — no shared sequential stream.
//    Start rules (opts.startRule, mirroring Python run_walks start_rule):
//      'first'  (default) — walker i starts at node i % n (the SPEC's
//                 first-N-row-major rule; used for mask graphs).
//      'spread'           — walker i starts at node floor((i * n) / walkers)
//                 (used for explicitly-built gold graphs, whose node order is
//                 recursion order and would park all walkers in one corner).
//    Each step consumes EXACTLY one rng() draw: j = floor(rng() * deg(u));
//    move to adj[u][j]. Adjacency lists sorted ascending, deduped, no
//    self-loops. An isolated node (deg 0) consumes NO rng draw and the walker
//    stays. Checkpoint positions recorded after exactly t steps for each t in
//    the ladder. Walker 0's stream is mulberry32(base_seed), so the seed-42
//    single-walker replay is unchanged by P1 (regression-checked in tests).
//  - r(t) is the BFS GRAPH distance from the walker's start node (both mask and
//    explicit-graph mode; no Euclidean embedding — pinned decision, recorded in
//    the fixtures pack `pinning.decisions`).
//  - Fits: least squares y = a + b*x with sums accumulated in loop order
//    i = 0..n-1 as Sx, Sy, Sxx, Sxy, Syy (same as jev-taste-math.js regress);
//    slope = cov/vx, r2 = (cov/sqrt(vx*vy))^2. Python must accumulate in the
//    same order for float agreement (JS/CPython libm log/exp may differ by
//    <=1 ulp; the 1e-9 parity tolerance absorbs that).
//  - Series counting: the input series is used IN THE ORDER GIVEN (NOT re-sorted).
//    N(omega <= x_r) = r where x_r = values[r-1]. This is what makes the
//    permutation null (gold #6) meaningful: re-sorting would make permutation a
//    no-op and the null vacuous. Eigenvalue series arrive ascending, so real
//    input is sorted anyway.
//  - All pinned parameters live in the fixtures pack `pinning` block; changing
//    any of them is a major version bump (SPEC instrument contract).

/** Taste scale lattice — the same 8-point log ladder as the box-counting window. */
export const WALK_BASE_LADDER = [4, 6, 9, 13, 20, 29, 43, 64];
/** Default step-scale factor K: ladder = WALK_BASE_LADDER.map(s => s * K). */
export const LADDER_K_DEFAULT = 4;

/**
 * mulberry32 PRNG. Returns a function producing floats in [0,1).
 *
 * EXACT op order (Python mirror must apply & 0xFFFFFFFF at every marked step):
 *   1. a  = (a + 0x6d2b79f5) mod 2^32
 *        JS: `(a + 0x6d2b79f5) | 0` — the |0 coerces the float sum via ToInt32,
 *        i.e. two's-complement wrap == mod 2^32 on the bit pattern.
 *   2. t1 = ((a ^ (a >>> 15)) * (1 | a)) mod 2^32
 *        JS: Math.imul is a true 32-bit wraparound multiply. `a >>> 15` is the
 *        UNSIGNED right shift of a's 32-bit pattern (== Python `a >> 15` on an
 *        already-masked unsigned a); XOR and OR are pattern ops, sign-agnostic.
 *   3. t2 = ((t1 + ((t1 ^ (t1 >>> 7)) * (61 | t1) mod 2^32)) mod 2^32) ^ t1
 *        JS `+` here is float addition of two int32 values; the following `^`
 *        coerces the sum via ToInt32 (mod 2^32) BEFORE the XOR, so Python must
 *        mask the sum first: ((t1 + m) & 0xFFFFFFFF) ^ t1. Addition is
 *        commutative, so `(t + m) ^ t` == Python `t ^ ((t + m) & 0xFFFFFFFF)`.
 *   4. out = (unsigned pattern of (t2 ^ (t2 >>> 14))) / 2**32
 *        JS `>>> 0` reinterprets the int32 as unsigned; division is IEEE-754
 *        double on both sides -> bit-identical floats.
 */
export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Least squares y = a + b x. Sum order pinned (see header). Returns {slope, intercept, r2}. */
export function regress(xs, ys) {
  if (xs.length !== ys.length) throw new Error('regress: length mismatch');
  const n = xs.length;
  if (n === 0) throw new Error('regress: empty input');
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i];
    sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i];
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx === 0 || vy === 0) {
    const intercept = sy / n;
    return { slope: 0, intercept, r2: 0, degenerate: true }; // zero-variance series
  }
  const slope = cov / vx;
  const intercept = sy / n - slope * (sx / n);
  const r = cov / Math.sqrt(vx * vy);
  return { slope, intercept, r2: r * r, degenerate: false };
}

/** 8-point log-spaced integer lattice in [lo, hi]: round, clamp, dedupe ascending. */
function logLatticeRanks(lo, hi, nPoints) {
  if (nPoints < 2) return [lo];
  const raw = [];
  for (let i = 0; i < nPoints; i++) {
    let r = lo * Math.pow(hi / lo, i / (nPoints - 1));
    r = Math.round(r);
    if (r < lo) r = lo;
    if (r > hi) r = hi;
    raw.push(r);
  }
  raw.sort((a, b) => a - b);
  const out = [];
  for (const r of raw) if (out.length === 0 || out[out.length - 1] !== r) out.push(r);
  return out;
}

/**
 * Build a graph on the ink of a binary mask, 8-connected. mask = number[][] of
 * 0/1 rows (1 = ink). Ink cells are numbered CONSECUTIVELY in row-major scan
 * order (pinned: dense ids, not y*W+x grid ids). Empty mask throws
 * Error('empty edge map'). Returns { n, adj, coords, ids, width, height } where
 * coords[i] = [x, y] and ids[y][x] = node index or -1.
 */
export function maskToGraph(mask) {
  if (!Array.isArray(mask) || mask.length === 0) throw new Error('empty edge map');
  const H = mask.length;
  const W = mask[0].length;
  const ids = [];
  const coords = [];
  const indexOf = new Map(); // y * W + x -> node id
  for (let y = 0; y < H; y++) {
    const row = mask[y];
    if (!Array.isArray(row) || row.length !== W) throw new Error('maskToGraph: ragged mask');
    const idRow = new Array(W).fill(-1);
    for (let x = 0; x < W; x++) {
      const v = row[x];
      if (v === 1) {
        const id = coords.length;
        idRow[x] = id;
        indexOf.set(y * W + x, id);
        coords.push([x, y]);
      } else if (v !== 0) {
        throw new Error('maskToGraph: mask values must be 0 or 1');
      }
    }
    ids.push(idRow);
  }
  if (coords.length === 0) throw new Error('empty edge map');
  const n = coords.length;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const [x, y] = coords[i];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (mask[ny][nx] !== 1) continue;
        const j = indexOf.get(ny * W + nx);
        if (j !== i) adj[i].push(j);
      }
    }
    adj[i].sort((a, b) => a - b);
  }
  return { n, adj, coords, ids, width: W, height: H };
}

/**
 * Build { n, adj } from an explicit edge list [[a, b], ...]. Node ids are
 * non-negative integers; n = max id + 1. Self-loops dropped, duplicate edges
 * deduped, neighbor lists sorted ascending. Empty edge list throws
 * Error('empty graph').
 */
export function graphFromEdges(edges) {
  if (!Array.isArray(edges) || edges.length === 0) throw new Error('empty graph');
  let n = 0;
  const seen = new Set();
  for (const e of edges) {
    if (!Array.isArray(e) || e.length !== 2) throw new Error('graphFromEdges: edge must be [a, b]');
    const a = e[0];
    const b = e[1];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      throw new Error('graphFromEdges: node ids must be non-negative integers');
    }
    if (a === b) continue; // self-loop dropped
    if (a + 1 > n) n = a + 1;
    if (b + 1 > n) n = b + 1;
    seen.add(a < b ? a + ',' + b : b + ',' + a);
  }
  if (n === 0) throw new Error('empty graph');
  const adjSets = Array.from({ length: n }, () => new Set());
  for (const key of seen) {
    const parts = key.split(',');
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    adjSets[a].add(b);
    adjSets[b].add(a);
  }
  const adj = adjSets.map((s) => Array.from(s).sort((x, y) => x - y));
  return { n, adj };
}

/**
 * Deterministic seeded random walks on a graph. graph = {adj} (or a bare
 * adjacency array). opts: { walkers = 64, seed (required finite number),
 * k = 4, steps = optional explicit ladder override,
 * startRule = 'first' (default) | 'spread' }.
 * Ladder = WALK_BASE_LADDER.map(s => s * k) unless steps is given.
 *
 * Stream convention (P1, 2026-10-06 — Lane A canonical, Python source of
 * record): walker i owns its OWN stream mulberry32((base_seed + i) >>> 0).
 * Walker 0's stream is mulberry32(base_seed), so single-walker replays are
 * unchanged by P1. Start rules mirror Python run_walks:
 *   'first'  — walker i starts at node i % n (SPEC first-N-row-major rule).
 *   'spread' — walker i starts at node floor((i * n) / walkers) (gold-graph
 *              rule; recursion-ordered builders cluster nodes spatially).
 *
 * Returns { walkers, seed, k, ladder, n, traces, walker0_trace, msd, p_return }:
 *   traces[w] = { start, checkpoints: [node after ladder[0] steps, ...] }
 *   walker0_trace = full position sequence of walker 0 incl. start (len maxT+1)
 *   msd[i]  = mean over walkers of BFSdist(start_w, pos_w(t_i))^2
 *   p_return[i] = fraction of walkers at their own start node at t_i
 */
export function randomWalks(graph, opts = {}) {
  const adj = graph && graph.adj ? graph.adj : graph;
  if (!Array.isArray(adj) || adj.length === 0) throw new Error('empty graph');
  const n = adj.length;
  const walkers = opts.walkers === undefined ? 64 : opts.walkers;
  if (!Number.isInteger(walkers) || walkers <= 0) {
    throw new Error('randomWalks: walkers must be a positive integer');
  }
  if (typeof opts.seed !== 'number' || !isFinite(opts.seed)) {
    throw new Error('randomWalks: seed must be a finite number');
  }
  const k = opts.k === undefined ? LADDER_K_DEFAULT : opts.k;
  const ladder = opts.steps ? opts.steps.slice() : WALK_BASE_LADDER.map((s) => s * k);
  if (ladder.length < 2) throw new Error('randomWalks: ladder needs at least 2 rungs');
  for (let i = 0; i < ladder.length; i++) {
    if (!Number.isInteger(ladder[i]) || ladder[i] <= 0) {
      throw new Error('randomWalks: ladder rungs must be positive integers');
    }
    if (i > 0 && ladder[i] <= ladder[i - 1]) {
      throw new Error('randomWalks: ladder must be strictly ascending');
    }
  }
  const maxT = ladder[ladder.length - 1];

  // BFS distance-from-start maps, cached per distinct start node.
  const distCache = new Map();
  const bfsFrom = (s) => {
    let d = distCache.get(s);
    if (d) return d;
    d = new Int32Array(n).fill(-1);
    d[s] = 0;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi];
      for (const v of adj[u]) {
        if (d[v] === -1) {
          d[v] = d[u] + 1;
          queue.push(v);
        }
      }
    }
    distCache.set(s, d);
    return d;
  };

  // Per-walker streams (P1, Lane A canonical): walker i owns
  // mulberry32((base_seed + i) >>> 0). Start rules mirror run_walks.
  const startRule = opts.startRule === undefined ? 'first' : opts.startRule;
  if (startRule !== 'first' && startRule !== 'spread') {
    throw new Error("randomWalks: startRule must be 'first' or 'spread'");
  }
  const baseSeed = opts.seed | 0;
  const startOf = (i) =>
    startRule === 'first' ? i % n : Math.floor((i * n) / walkers);

  const traces = new Array(walkers);
  let walker0Trace = null;
  for (let w = 0; w < walkers; w++) {
    const rng = mulberry32((baseSeed + w) >>> 0);
    const start = startOf(w);
    let u = start;
    const cps = new Array(ladder.length);
    const full = w === 0 ? [start] : null;
    let ci = 0;
    for (let t = 1; t <= maxT; t++) {
      const nbrs = adj[u];
      const deg = nbrs.length;
      if (deg > 0) {
        u = nbrs[Math.floor(rng() * deg)]; // exactly one rng draw per step
      } // deg === 0: stay, no rng consumed (pinned rule)
      if (full) full.push(u);
      if (ci < ladder.length && ladder[ci] === t) {
        cps[ci] = u;
        ci++;
      }
    }
    traces[w] = { start, checkpoints: cps };
    if (full) walker0Trace = full;
  }

  // MSD metric (P3, 2026-10-06): Euclidean distance on graph.coords when the
  // graph carries coordinates (mirrors Python _walk_measurements, which
  // REQUIRES graph["eu"]); BFS hop distance otherwise (the pre-P3 pack
  // convention). Output carries msd_metric so callers can tell which was used.
  const coords = graph && Array.isArray(graph.coords) ? graph.coords : null;
  const msdMetric = coords ? 'euclidean' : 'hop';
  const msd = ladder.map((_t, i) => {
    let s = 0;
    for (let w = 0; w < walkers; w++) {
      let d;
      if (coords) {
        const c0 = coords[traces[w].start];
        const c1 = coords[traces[w].checkpoints[i]];
        const dx = c1[0] - c0[0];
        const dy = c1[1] - c0[1];
        s += dx * dx + dy * dy; // Python parity: acc += dx*dx + dy*dy, no sqrt
      } else {
        const d = bfsFrom(traces[w].start)[traces[w].checkpoints[i]];
        s += d * d;
      }
    }
    return s / walkers;
  });
  const p_return = ladder.map((_t, i) => {
    let c = 0;
    for (let w = 0; w < walkers; w++) {
      if (traces[w].checkpoints[i] === traces[w].start) c++;
    }
    return c / walkers;
  });

  return {
    walkers,
    seed: opts.seed,
    k,
    ladder,
    n,
    traces,
    walker0_trace: walker0Trace,
    msd,
    msd_metric: msdMetric,
    p_return,
  };
}

/**
 * Fit walk-mode dimensions from randomWalks output.
 *   MSD fit:    log(msd)     ~ log(t) -> slope = alpha_msd = 2/d_w
 *   Return fit: log(p_return) ~ log(t) -> slope = -d_s/2
 * Points with msd <= 0 or p_return <= 0 are excluded (log undefined; pinned).
 * Fewer than 3 valid points, or alpha_msd <= 0, -> value null + low_confidence.
 * r2 < 0.98 -> low_confidence flag (same gate as taste).
 */
export function walkDimensions(walkData) {
  if (
    !walkData ||
    !Array.isArray(walkData.ladder) ||
    !Array.isArray(walkData.msd) ||
    !Array.isArray(walkData.p_return)
  ) {
    throw new Error('walkDimensions: walkData must come from randomWalks()');
  }
  const xs = walkData.ladder.map((t) => Math.log(t));
  const mPairs = [];
  const rPairs = [];
  for (let i = 0; i < xs.length; i++) {
    if (walkData.msd[i] > 0) mPairs.push([xs[i], Math.log(walkData.msd[i])]);
    if (walkData.p_return[i] > 0) rPairs.push([xs[i], Math.log(walkData.p_return[i])]);
  }
  let alpha_msd = null;
  let d_w = null;
  let d_w_r2 = 0;
  if (mPairs.length >= 3) {
    const f = regress(
      mPairs.map((p) => p[0]),
      mPairs.map((p) => p[1]),
    );
    d_w_r2 = f.r2;
    if (!f.degenerate && f.slope > 0) {
      alpha_msd = f.slope;
      d_w = 2 / f.slope;
    }
  }
  let d_s = null;
  let d_s_r2 = 0;
  if (rPairs.length >= 3) {
    const g = regress(
      rPairs.map((p) => p[0]),
      rPairs.map((p) => p[1]),
    );
    d_s_r2 = g.r2;
    if (!g.degenerate && g.slope < 0) d_s = -2 * g.slope;
  }
  return {
    alpha_msd,
    d_w,
    d_w_r2,
    d_s,
    d_s_r2,
    msd_low_confidence: alpha_msd === null || d_w_r2 < 0.98,
    return_low_confidence: d_s === null || d_s_r2 < 0.98,
    n_msd_points: mPairs.length,
    n_return_points: rPairs.length,
  };
}

/**
 * Series-mode integrated counting exponent over the pinned window.
 * values are used IN THE ORDER GIVEN (do NOT sort here — see header). The
 * counting at rank r is N = r with x = values[r-1]. Window: ranks
 * r in [ceil(N*loFrac), floor(N*hiFrac)] (defaults 0.125 / 0.5), fitted over
 * the same 8-point log lattice in rank space (round, clamp, dedupe).
 * Returns { alpha_lambda, d_s = 2*alpha_lambda, r2, low_confidence, counts,
 * n_points, window }. counts = [[rank, x], ...] — the exact counting table
 * (parity checked to 1e-12 per SPEC). Empty input throws Error('empty series');
 * a window with zero positive values throws
 * Error('seriesCountingExponent: no positive values in the counting window').
 * Fewer than 3 positive points -> nulls + low_confidence (still returns the
 * table). r2 < 0.98 -> low_confidence.
 */
export function seriesCountingExponent(values, opts = {}) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('empty series');
  const loFrac = opts.loFrac === undefined ? 0.125 : opts.loFrac;
  const hiFrac = opts.hiFrac === undefined ? 0.5 : opts.hiFrac;
  const N = values.length;
  const lo = Math.max(2, Math.ceil(N * loFrac));
  const hi = Math.max(lo, Math.floor(N * hiFrac));
  const ranks = logLatticeRanks(lo, hi, 8);
  const counts = [];
  for (const r of ranks) {
    const x = values[r - 1];
    if (typeof x !== 'number' || !isFinite(x)) {
      throw new Error('seriesCountingExponent: non-finite value at rank ' + r);
    }
    if (x > 0) counts.push([r, x]);
  }
  if (counts.length === 0) {
    throw new Error('seriesCountingExponent: no positive values in the counting window');
  }
  let alpha_lambda = null;
  let d_s = null;
  let r2 = 0;
  if (counts.length >= 3) {
    const f = regress(
      counts.map((p) => Math.log(p[1])),
      counts.map((p) => Math.log(p[0])),
    );
    if (f.degenerate) {
      // All sampled x equal (e.g. a spectrum whose window sits inside one
      // degenerate eigenvalue plateau): zero-variance fit -> null exponents.
      alpha_lambda = null;
      d_s = null;
      r2 = 0;
    } else {
      alpha_lambda = f.slope;
      d_s = 2 * f.slope;
      r2 = f.r2;
    }
  }
  const low_confidence = counts.length < 3 || r2 < 0.98;
  return {
    alpha_lambda,
    d_s,
    r2,
    low_confidence,
    counts,
    n_points: counts.length,
    window: { lo, hi },
  };
}

/**
 * Einstein relation gate: d_s ≈ 2*D/d_w (fractal dimension D from the caller,
 * stamped `source: caller` per taste doctrine). verdict 'consistent' iff
 * |d_s - 2*D/d_w| <= tol (default 0.10, SPEC-pinned); 'inconsistent' otherwise;
 * 'insufficient' when any input is missing/non-finite (nulls propagated).
 */
export function einsteinVerdict(d_s, D, d_w, opts = {}) {
  const tol = opts.tol === undefined ? 0.1 : opts.tol;
  const ok = (v) => typeof v === 'number' && isFinite(v);
  if (!ok(d_s) || !ok(D) || !ok(d_w)) {
    return {
      d_s: ok(d_s) ? d_s : null,
      two_D_over_d_w: null,
      delta: null,
      verdict: 'insufficient',
    };
  }
  const two_D_over_d_w = (2 * D) / d_w;
  const delta = d_s - two_D_over_d_w;
  const verdict = Math.abs(delta) <= tol ? 'consistent' : 'inconsistent';
  return { d_s, two_D_over_d_w, delta, verdict };
}

/**
 * Log-periodic modulation check (residual-octave-alternation, secondary gate;
 * never a fit parameter). Input: sorted (ascending) positive values — defensive
 * sort + positivity filter applied. Method (pinned):
 *   1. Counting curve over ALL positive values: N_i = i+1 at x_i = pts[i].
 *   2. Linear fit log(N) vs log(x) over the full range; residual_i = log N_i -
 *      (a + b log x_i).
 *   3. Octave bands: k_i = floor((log x_i - log x_0) / ln2). Band mean residual
 *      per k. |mean| <= 1e-9 reads as sign 0 (pure power law: residuals at
 *      float epsilon must NOT count as alternation).
 *   4. present = (#bands >= 3) AND every consecutive band pair alternates
 *      strictly in sign (nonzero signs both sides).
 * Returns { present, bands: [{octave, count, mean_residual}], alternations,
 * pairs, method }. Empty input throws Error('empty series'); fewer than 3
 * positive values throws Error('logPeriodicCheck: need at least 3 positive values').
 */
export function logPeriodicCheck(sortedValues) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) throw new Error('empty series');
  const pts = [];
  for (const v of sortedValues) {
    if (typeof v === 'number' && isFinite(v) && v > 0) pts.push(v);
  }
  pts.sort((a, b) => a - b);
  if (pts.length < 3) throw new Error('logPeriodicCheck: need at least 3 positive values');
  const xs = pts.map((v) => Math.log(v));
  const ys = pts.map((_v, i) => Math.log(i + 1));
  const f = regress(xs, ys);
  const residuals = pts.map((_v, i) => ys[i] - (f.intercept + f.slope * xs[i]));
  const logX0 = xs[0];
  const groups = new Map(); // octave k -> [residuals]
  for (let i = 0; i < pts.length; i++) {
    const kOct = Math.floor((xs[i] - logX0) / Math.LN2);
    if (!groups.has(kOct)) groups.set(kOct, []);
    groups.get(kOct).push(residuals[i]);
  }
  const bandKeys = Array.from(groups.keys()).sort((a, b) => a - b);
  const EPS = 1e-9;
  const bands = bandKeys.map((k) => {
    const rs = groups.get(k);
    let s = 0;
    for (const r of rs) s += r;
    const mean = s / rs.length;
    return { octave: k, count: rs.length, mean_residual: mean };
  });
  const signs = bands.map((b) => (b.mean_residual > EPS ? 1 : b.mean_residual < -EPS ? -1 : 0));
  let alternations = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < signs.length; i++) {
    pairs++;
    if (signs[i] !== 0 && signs[i + 1] !== 0 && signs[i] !== signs[i + 1]) alternations++;
  }
  const present = bands.length >= 3 && pairs > 0 && alternations === pairs;
  return {
    present,
    bands,
    alternations,
    pairs,
    method: 'residual-octave-alternation',
  };
}

/**
 * Render numbers with decimals (the fmt() lesson from the taste engine: bare
 * integers confused clef on live-verified questions). Integers -> n.toFixed(3)
 * ("1.000"); non-integers -> shortest of the 4-decimal rounding. Strings pass
 * through; non-finite -> String(n).
 */
export function fmt(n) {
  if (typeof n === 'string') return n;
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  if (Number.isInteger(n)) return n.toFixed(3);
  return String(Number(n.toFixed(4)));
}

/**
 * Cyclic Jacobi eigenvalue solver for a real symmetric matrix (the "computed
 * exactly (Jacobi, float64 with residual check)" path for the gold gasket
 * spectra). A = number[][] (n x n). Returns { values (ascending), vectors
 * (columns match values), sweeps, off_norm }.
 */
export function jacobiSymmetric(A, opts = {}) {
  const n = A.length;
  if (n === 0) throw new Error('jacobiSymmetric: empty matrix');
  for (const row of A) {
    if (!Array.isArray(row) || row.length !== n) throw new Error('jacobiSymmetric: matrix must be square');
  }
  const maxSweeps = opts.maxSweeps === undefined ? 100 : opts.maxSweeps;
  const tol = opts.tol === undefined ? 1e-11 : opts.tol;
  const a = A.map((row) => row.slice());
  const V = Array.from({ length: n }, (_r, i) => {
    const row = new Array(n).fill(0);
    row[i] = 1;
    return row;
  });
  let fro = 0;
  for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) fro += a[p][q] * a[p][q];
  fro = Math.sqrt(fro);
  const thresh = tol * Math.max(1, fro);
  let sweeps = 0;
  for (; sweeps < maxSweeps; sweeps++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (Math.sqrt(off) <= thresh) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (apq === 0) continue;
        const app = a[p][p];
        const aqq = a[q][q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (aqq - app) / (2 * apq);
        const t =
          (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        const tau = s / (1 + c);
        for (let k = 0; k < n; k++) {
          if (k === p || k === q) continue;
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = akp - s * (akq + tau * akp);
          a[p][k] = a[k][p];
          a[k][q] = akq + s * (akp - tau * akq);
          a[q][k] = a[k][q];
        }
        a[p][p] = app - t * apq;
        a[q][q] = aqq + t * apq;
        a[p][q] = 0;
        a[q][p] = 0;
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = vkp - s * (vkq + tau * vkp);
          V[k][q] = vkq + s * (vkp - tau * vkq);
        }
      }
    }
  }
  let off = 0;
  for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
  const idx = Array.from({ length: n }, (_v, i) => i).sort((i, j) => a[i][i] - a[j][j]);
  const values = idx.map((i) => a[i][i]);
  const vectors = idx.map((i) => V.map((row) => row[i]));
  return { values, vectors, sweeps, off_norm: Math.sqrt(off) };
}

/**
 * Sierpinski gasket PRE-graph (corner-identifying merges NOT applied) — the
 * construction whose vertex count is exactly 3^level, matching the SPEC's
 * "level 3 (27 vtx) / level 4 (81 vtx)" counts (3^3, 3^4). It is isomorphic to
 * the Tower-of-Hanoi graph H_3^level, a standard pre-gasket approximation with
 * the same asymptotic walk/spectral dimension as the gasket.
 * Recurrence (internal build depth d): depth 0 = triangle (3 nodes, corners
 * ordered [left, right, top]); depth d = three copies of depth d-1 at offsets
 * 0, m, 2m (m = 3^d = copy size), each copy keeping the corner order
 * [left=o+0, right=o+1, top=o+2], joined by edges: A.right--B.left,
 * A.top--C.left, B.top--C.right. Whole-graph corners: [A.left, B.right, C.top].
 * PUBLIC level convention: gasketPreGraph(level) has exactly 3^level vertices
 * (level >= 1; internal depth = level - 1), matching the SPEC counts
 * "level 3 (27 vtx) / level 4 (81 vtx)".
 * Edge counts by public level: E = (3^(level+1) - 3)/2 -> level 3: 39, level 4: 120.
 * Returns { level, n, edges, adj, corners }.
 */
export function gasketPreGraph(level) {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error('gasketPreGraph: level must be a positive integer');
  }
  const build = (L, offset) => {
    if (L === 0) {
      return { corners: [offset, offset + 1, offset + 2], edges: [[offset, offset + 1], [offset + 1, offset + 2], [offset, offset + 2]] };
    }
    const m = Math.pow(3, L);
    const A = build(L - 1, offset);
    const B = build(L - 1, offset + m);
    const C = build(L - 1, offset + 2 * m);
    const join = [
      [A.corners[1], B.corners[0]], // A.right -- B.left
      [A.corners[2], C.corners[0]], // A.top   -- C.left
      [B.corners[2], C.corners[1]], // B.top   -- C.right
    ];
    return {
      corners: [A.corners[0], B.corners[1], C.corners[2]],
      edges: [...A.edges, ...B.edges, ...C.edges, ...join],
    };
  };
  const built = build(level - 1, 0);
  const n = Math.pow(3, level);
  const g = graphFromEdges(built.edges);
  return { level, n, edges: built.edges, adj: g.adj, corners: built.corners };
}

/**
 * Standard Sierpinski gasket graph G_level WITH corner identification (the
 * textbook construction). Level -> vertex mapping matches the Python source
 * of record EXACTLY (spectral_standard.py sierpinski_gasket_graph, offset by
 * one: this level L == Python level L+1):
 *   |V| = (3^(L+1) + 3) / 2  ->  L=0: 3, L=1: 6, L=2: 15, L=3: 42, L=4: 123
 *   |E| = 3^(L+1)            ->  L=3: 81 edges (tr(L) = 2|E| = 162)
 * so gasketIdentifiedGraph(3) is 42 vertices / 81 edges — the same graph as
 * Python sierpinski_gasket_graph(4) and Lane C's canonical level 3 (P2,
 * 2026-10-06: the previous implementation computed the union-find merges but
 * never applied them to the edge list, returning the disjoint union of 3^L
 * triangles — 81 vtx at L3).
 *
 * Construction mirrors Python sierpinski_gasket_graph verbatim: vertices are
 * keyed by integer triangular-lattice coords (a, b) and identified by
 * SHARED COORD (one node per junction); node ids follow recursion order of
 * first appearance (lower-left copy, then lower-right, then top) — identical
 * to the Python builder's node ordering, so walk traces and BFS distances
 * are directly comparable. Returns { level, n, edges, adj, corners } with
 * corners = [(0,0), (2^(L+1), 0), (0, 2^(L+1))] ids.
 */
export function gasketIdentifiedGraph(level) {
  if (!Number.isInteger(level) || level < 0 || level > 8) {
    throw new Error('gasketIdentifiedGraph: level must be an integer in 0..8');
  }
  const pyLevel = level + 1; // Lane A sierpinski_gasket_graph argument
  const coords = new Map(); // 'a,b' -> node id
  const order = []; // ids in recursion (first-appearance) order
  const edges = [];
  const node = (a, b) => {
    const key = a + ',' + b;
    let id = coords.get(key);
    if (id === undefined) {
      id = order.length;
      coords.set(key, id);
      order.push(key);
    }
    return id;
  };
  const rec = (lv, oa, ob, side) => {
    if (lv === 1) {
      const i0 = node(oa, ob);
      const i1 = node(oa + side, ob);
      const i2 = node(oa, ob + side);
      edges.push([i0, i1], [i1, i2], [i0, i2]);
      return;
    }
    const half = side / 2;
    rec(lv - 1, oa, ob, half); // lower-left
    rec(lv - 1, oa + half, ob, half); // lower-right
    rec(lv - 1, oa, ob + half, half); // top
  };
  rec(pyLevel, 0, 0, 2 ** pyLevel);
  // Dedupe + canonical orientation (mirrors Python _finish_graph), then
  // build sorted/deduped adjacency via the shared graphFromEdges helper.
  const seen = new Set();
  const clean = [];
  for (const [u, v] of edges) {
    const key = u < v ? u + ',' + v : v + ',' + u;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(u < v ? [u, v] : [v, u]);
  }
  clean.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const side = 2 ** pyLevel;
  const g = graphFromEdges(clean);
  return {
    level,
    n: order.length,
    edges: clean,
    adj: g.adj,
    corners: [coords.get('0,0'), coords.get(side + ',0'), coords.get('0,' + side)],
  };
}

/** Graph Laplacian L = D - A of {n, adj}. */
export function laplacian(graph) {
  const adj = graph.adj;
  const n = graph.n;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const deg = adj[i].length;
    L[i][i] = deg;
    for (const j of adj[i]) L[i][j] = -1;
  }
  return L;
}
