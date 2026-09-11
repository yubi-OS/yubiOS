// pointmap.js — proof-carrying point map for unlabeled latent space (frozen-frame edition).
// Zero deps. Runs verbatim in a browser <script> and in a Cloudflare Worker (var PM IIFE, no
// module system, no Node built-ins). Geometry matches sos-agent fit.ts (PCA2 → stereographic
// lift → S²). Spec: yubi-OS/yubiOS refs/point-to-point-latent-map-2026-09-06.md
//
// What changed vs pointmap/0.1 (0.1 result fields are still present):
//   • strict input validation (no silent coercion, no silent filtering)
//   • an explicit, serialisable FRAME (input PCA + placement) — pass it back in and every point
//     is transformed on the same frame, never refit. Drift against the frame is rejected.
//   • PM.compareMaps(before, after) — name-keyed before/after diff on one frozen frame
//   • candidate ladder: frozen placement, atomic single-row add, anonymous geometric sectors,
//     no auto-ranked removal, lexicographic (isolated, occupancy) ranking, honest no-operation
//   • V2 normalised by the eigenvalue trace (was: divided by d, which could exceed 1)
//   • null: fixed number of ATTEMPTED symmetric checkerboard proposals incl. self-loops, plus-one
//     two-sided empirical p; z reported as descriptive only. A label-swap chain, not a full
//     Curveball trade sequence.
//   • compass: analytic detailed-balance identity (throws on failure) separated from the
//     empirical flux measurement; logsumexp stationary law; gate-rank actually tested
//   • slerp: normalised endpoints, stable at coincident and antipodal
//   • spectra: diagnostic only, explicitly NOT admitted as homology, no physical-signal claims
var PM = (function () {
  "use strict";

  var VERSION = "pointmap/0.2";
  var DEFAULTS = {
    seed: 20260906, T: 0.05, K: 100, d: 9, steps: 60000,
    threshold: "median", preprocessing_id: "raw/v1"
  };
  var ISO_RADIUS = 0.095;   // chord radius that defines an "isolated" point
  var SECTORS = 12;         // anonymous geometric azimuthal sectors, numbered 1..12
  var FLUX_TOL = 1e-9;

  // ---- rng / hashing --------------------------------------------------------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function fnv1a64(bytes) { let h = 0xcbf29ce484222325n; for (const x of bytes) { h ^= BigInt(x); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; } return h.toString(16).padStart(16, "0"); }
  const hashVec = (v) => fnv1a64(new Uint8Array(new Float32Array(v).buffer));
  const hashStr = (s) => fnv1a64(new TextEncoder().encode(s));
  // stable key order, so a hash is a function of content and not of insertion order
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") {
      const ks = Object.keys(value).sort();
      return "{" + ks.map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("canonical: non-finite number");
    return JSON.stringify(value === undefined ? null : value);
  }
  const hashObj = (o) => hashStr(canonical(o));

  // ---- linear algebra: Jacobi (small d) + power iteration (large D) ---------
  function jacobiEig(A) { const n = A.length; const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0)); const M = A.map(r => r.slice());
    for (let sweep = 0; sweep < 80; sweep++) { let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] ** 2; if (off < 1e-14) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { if (Math.abs(M[p][q]) < 1e-15) continue; const th = (M[q][q] - M[p][p]) / (2 * M[p][q]); const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)); const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const a = M[k][p], b = M[k][q]; M[k][p] = c * a - s * b; M[k][q] = s * a + c * b; }
        for (let k = 0; k < n; k++) { const a = M[p][k], b = M[q][k]; M[p][k] = c * a - s * b; M[q][k] = s * a + c * b; }
        for (let k = 0; k < n; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; } } }
    const idx = M.map((_, i) => i).sort((a, b) => M[b][b] - M[a][a]); return { values: idx.map(i => M[i][i]), vectors: idx.map(i => V.map(r => r[i])) }; }
  function center(X) { const n = X.length, D = X[0].length, mu = new Float64Array(D); for (const r of X) for (let j = 0; j < D; j++) mu[j] += r[j] / n; return { Xc: X.map(r => r.map((x, j) => x - mu[j])), mu: Array.from(mu) }; }
  // top-k principal axes of X (n×D) without forming D×D when D is large (the D up to 768 path)
  function pcaTop(X, k, r) { const { Xc, mu } = center(X); const n = Xc.length, D = Xc[0].length; k = Math.max(1, Math.min(k, D, n - 1));
    let axes = [], values = [];
    if (D <= 40) { const C = Array.from({ length: D }, () => Array(D).fill(0)); for (const row of Xc) for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) C[i][j] += row[i] * row[j] / Math.max(1, n - 1); const e = jacobiEig(C); axes = e.vectors.slice(0, k); values = e.values; }
    else { const rr = r || mulberry32(1); const tot = Xc.reduce((s, row) => s + row.reduce((a, x) => a + x * x, 0), 0) / Math.max(1, n - 1);
      for (let a = 0; a < k; a++) { let v = Array.from({ length: D }, () => gauss(rr)); for (let it = 0; it < 40; it++) { const w = new Float64Array(D); for (const row of Xc) { let dot = 0; for (let j = 0; j < D; j++) dot += row[j] * v[j]; for (let j = 0; j < D; j++) w[j] += row[j] * dot; }
          for (const u of axes) { let d2 = 0; for (let j = 0; j < D; j++) d2 += w[j] * u[j]; for (let j = 0; j < D; j++) w[j] -= d2 * u[j]; }
          let nrm = 0; for (let j = 0; j < D; j++) nrm += w[j] * w[j]; nrm = Math.sqrt(nrm) || 1; v = Array.from(w, x => x / nrm); }
        let lam = 0; for (const row of Xc) { let dot = 0; for (let j = 0; j < D; j++) dot += row[j] * v[j]; lam += dot * dot; } values.push(lam / Math.max(1, n - 1)); axes.push(v); }
      values.push(Math.max(0, tot - values.reduce((a, b) => a + b, 0))); }
    // sign convention (determinism across the Jacobi / power-iteration paths): largest-|component| positive
    axes = axes.map(a => { let m = 0; for (let j = 1; j < a.length; j++) if (Math.abs(a[j]) > Math.abs(a[m])) m = j; return a[m] < 0 ? a.map(x => -x) : a; });
    const proj = row => axes.map(a => a.reduce((s, aj, j) => s + aj * (row[j] - mu[j]), 0));
    return { scores: X.map(proj), proj, values, axes, mu }; }

  // ---- geometry -------------------------------------------------------------
  const clamp1 = (x) => Math.max(-1, Math.min(1, x));
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const chord = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const geo = (a, b) => Math.acos(clamp1(dot3(a, b)));
  function unit(p) { const n = Math.hypot(p[0], p[1], p[2]); return n > 0 ? [p[0] / n, p[1] / n, p[2] / n] : [0, 0, 1]; }
  function lift(u0, v0, s) { const u = u0 * s, v = v0 * s, den = 1 + u * u + v * v; return [2 * u / den, 2 * v / den, (u * u + v * v - 1) / den]; }
  // slerp with normalised endpoints; stable at coincident (Ω→0) and antipodal (Ω→π) endpoints.
  // At antipodes the great circle is not unique — a deterministic orthogonal axis is chosen, and
  // that choice is stated here rather than hidden in a NaN.
  function slerp(p0, q0, t) {
    const p = unit(p0), q = unit(q0); const c = clamp1(dot3(p, q));
    if (c > 1 - 1e-12) return p.slice();
    if (c < -1 + 1e-12) {
      const ref = Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const o = unit([p[1] * ref[2] - p[2] * ref[1], p[2] * ref[0] - p[0] * ref[2], p[0] * ref[1] - p[1] * ref[0]]);
      const O = Math.PI, ca = Math.cos(t * O), sa = Math.sin(t * O);
      return unit([ca * p[0] + sa * o[0], ca * p[1] + sa * o[1], ca * p[2] + sa * o[2]]);
    }
    const O = Math.acos(c), sO = Math.sin(O);
    const a = Math.sin((1 - t) * O) / sO, b = Math.sin(t * O) / sO;
    return unit([a * p[0] + b * q[0], a * p[1] + b * q[1], a * p[2] + b * q[2]]);
  }
  const sectorIndex = ([x, y]) => Math.min(SECTORS - 1, Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * SECTORS));
  function sectorCountsOf(pts) { const sc = Array(SECTORS).fill(0); for (const p of pts) sc[sectorIndex(p)]++; return sc; }
  function isolatedCount(pts, rr) { rr = rr === undefined ? ISO_RADIUS : rr; return pts.filter((p, i) => !pts.some((q, j) => j !== i && chord(p, q) < rr)).length; }

  // ---- validation -----------------------------------------------------------
  function reqInt(v, lo, hi, label) {
    if (!Number.isInteger(v) || v < lo || v > hi) throw new RangeError(label + " must be an integer in " + lo + ".." + hi + " (got " + String(v) + ")");
    return v;
  }
  function validateStrings(arr, label, N) {
    if (arr === undefined || arr === null) return undefined;
    if (!Array.isArray(arr)) throw new TypeError(label + " must be an array of strings");
    if (arr.length !== N) throw new RangeError(label + " length " + arr.length + " does not match N=" + N + " (no silent filtering)");
    arr.forEach((s, i) => { if (typeof s !== "string" || s.length === 0) throw new TypeError(label + "[" + i + "] must be a non-empty string"); });
    return arr.slice();
  }
  function validate(X, opts) {
    if (!Array.isArray(X) || !Array.isArray(X[0])) throw new TypeError("X must be a rectangular array of numeric rows");
    const N = X.length;
    if (N < 10 || N > 400) throw new RangeError("N must be in 10..400 (got " + N + ")");
    const D = X[0].length;
    if (!Number.isInteger(D) || D < 2 || D > 768) throw new RangeError("D must be an integer in 2..768 (got " + D + ")");
    for (let i = 0; i < N; i++) {
      const row = X[i];
      if (!Array.isArray(row) || row.length !== D) throw new RangeError("X is ragged: row " + i + " has length " + (Array.isArray(row) ? row.length : "n/a") + ", expected " + D);
      for (let j = 0; j < D; j++) { const v = row[j]; if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError("X[" + i + "][" + j + "] must be a finite number (got " + String(v) + ")"); }
    }
    const rank = Math.min(D, N - 1);
    const dReq = opts.d === undefined ? DEFAULTS.d : opts.d;
    reqInt(dReq, 2, 24, "d");
    const d = Math.min(dReq, rank);
    if (d < 2) throw new RangeError("d collapsed below 2: the rank of this cloud is " + rank);
    const K = opts.K === undefined ? DEFAULTS.K : opts.K; reqInt(K, 2, 200, "K");
    const steps = opts.steps === undefined ? DEFAULTS.steps : opts.steps; reqInt(steps, 100, 1000000, "steps");
    const seed = opts.seed === undefined ? DEFAULTS.seed : opts.seed;   // seed 0 is a real seed
    if (!Number.isInteger(seed)) throw new TypeError("seed must be an integer (got " + String(seed) + ")");
    const T = opts.T === undefined ? DEFAULTS.T : opts.T;
    if (typeof T !== "number" || !Number.isFinite(T) || T <= 0) throw new RangeError("T must be a finite number > 0 (got " + String(T) + ")");
    const threshold = opts.threshold === undefined ? DEFAULTS.threshold : opts.threshold;
    if (threshold !== "median" && threshold !== "zero") throw new RangeError('threshold must be "median" or "zero" (got ' + String(threshold) + ")");
    const preprocessing_id = opts.preprocessing_id === undefined ? DEFAULTS.preprocessing_id : opts.preprocessing_id;
    if (typeof preprocessing_id !== "string" || !preprocessing_id.length) throw new TypeError("preprocessing_id must be a non-empty string");
    const names = validateStrings(opts.names, "names", N);
    const labels = validateStrings(opts.labels, "labels", N);
    return { N, D, d, K, T, seed, steps, threshold, preprocessing_id, names, labels };
  }

  // ---- frame: freeze the whole numeric instrument ---------------------------
  // input_pca  : the binarisation rule (mean, axes, per-axis thresholds), full precision
  // placement  : the bit→S² map (bit means/sds, PCA2 mean/axes, lift scale), full precision
  function zstats(B) { const n = B.length, d = B[0].length; const mu = Array(d).fill(0), sd = Array(d).fill(0);
    for (const r of B) for (let j = 0; j < d; j++) mu[j] += r[j] / n;
    for (const r of B) for (let j = 0; j < d; j++) sd[j] += (r[j] - mu[j]) ** 2 / n;
    return { mu, sd: sd.map(Math.sqrt) }; }

  function buildFrame(X, cfg) {
    const p = pcaTop(X, cfg.d, mulberry32(cfg.seed));
    const d = p.axes.length;
    const thresholds = Array.from({ length: d }, (_, j) => {
      if (cfg.threshold === "zero") return 0;
      const col = p.scores.map(row => row[j]).slice().sort((a, b) => a - b);
      return col[Math.floor(col.length / 2)];   // exact (upper) median of the observed scores
    });
    const bits = p.scores.map(row => row.map((x, j) => x > thresholds[j] ? 1 : 0));
    const zs = zstats(bits);
    const Z = bits.map(r => r.map((x, j) => (x - zs.mu[j]) / (zs.sd[j] || 1)));
    const p2 = pcaTop(Z, 2, mulberry32(cfg.seed ^ 0x5bf03635));
    let maxR = 1e-9;
    for (const row of p2.scores) maxR = Math.max(maxR, Math.hypot(row[0] || 0, row[1] || 0));
    const axes2 = p2.axes.length === 2 ? p2.axes : [p2.axes[0], Array.from({ length: d }, (_, j) => j === 1 ? 1 : 0)];
    return {
      version: VERSION,
      config: { d: d, threshold: cfg.threshold, seed: cfg.seed },
      D: X[0].length,
      input_pca: { mu: p.mu.slice(), axes: p.axes.map(a => a.slice()), thresholds: thresholds },
      placement: { bit_mu: zs.mu.slice(), bit_sd: zs.sd.slice(), pca_mu: p2.mu.slice(), pca_axes: axes2.map(a => a.slice()), scale: 0.9 / maxR }
    };
  }

  function assertFrameCompatible(frame, cfg, what) {
    const bad = (m) => { throw new RangeError((what || "frame drift") + ": " + m); };
    if (!frame || typeof frame !== "object") bad("frame is not an object");
    if (frame.version !== VERSION) bad("version " + frame.version + " != " + VERSION);
    if (frame.D !== cfg.D) bad("input D " + cfg.D + " != frame D " + frame.D);
    if (!frame.config) bad("frame.config missing");
    if (frame.config.threshold !== cfg.threshold) bad("threshold " + cfg.threshold + " != frame threshold " + frame.config.threshold);
    const fp = frame.input_pca, pl = frame.placement;
    if (!fp || !pl) bad("frame is missing input_pca/placement");
    if (!Array.isArray(fp.mu) || !Array.isArray(fp.axes) || !Array.isArray(fp.thresholds)) bad("frame.input_pca must carry arrays mu, axes, thresholds");
    if (!Array.isArray(pl.bit_mu) || !Array.isArray(pl.bit_sd) || !Array.isArray(pl.pca_mu) || !Array.isArray(pl.pca_axes)) bad("frame.placement must carry arrays bit_mu, bit_sd, pca_mu, pca_axes");
    if (!Number.isInteger(frame.config.d) || frame.config.d < 2) bad("frame.config.d must be an integer >= 2 (got " + String(frame.config.d) + ")");
    if (fp.axes.length !== frame.config.d || fp.thresholds.length !== frame.config.d) bad("frame.config.d " + frame.config.d + " disagrees with the stored axes/thresholds");
    if (pl.bit_mu.length !== frame.config.d || pl.bit_sd.length !== frame.config.d || pl.pca_mu.length !== frame.config.d) bad("frame.config.d " + frame.config.d + " disagrees with the stored placement");
    if (fp.mu.length !== cfg.D) bad("frame input mean has length " + fp.mu.length + ", input D is " + cfg.D);
    if (pl.pca_axes.length !== 2) bad("placement needs exactly 2 PCA axes");
    if (!Number.isFinite(pl.scale) || pl.scale <= 0) bad("placement scale is not a positive finite number");
    if (frame.config.seed !== cfg.seed) bad("seed " + cfg.seed + " != frame seed " + frame.config.seed + " (a frame records the seed it was fitted with)");
    // every stored number is used as a transform coefficient: a malformed / NaN frame is rejected
    // here rather than propagating silently into the geometry as NaN coordinates.
    const finiteVec = (v, label, len) => {
      if (!Array.isArray(v) || v.length !== len) bad(label + " must be an array of " + len + " numbers (got " + (Array.isArray(v) ? v.length : typeof v) + ")");
      for (let i = 0; i < v.length; i++) { const x = v[i]; if (typeof x !== "number" || !Number.isFinite(x)) bad(label + "[" + i + "] is not a finite number (got " + String(x) + ")"); }
    };
    finiteVec(fp.mu, "frame.input_pca.mu", cfg.D);
    finiteVec(fp.thresholds, "frame.input_pca.thresholds", frame.config.d);
    fp.axes.forEach((a, j) => finiteVec(a, "frame.input_pca.axes[" + j + "]", cfg.D));
    finiteVec(pl.bit_mu, "frame.placement.bit_mu", frame.config.d);
    finiteVec(pl.bit_sd, "frame.placement.bit_sd", frame.config.d);
    finiteVec(pl.pca_mu, "frame.placement.pca_mu", frame.config.d);
    pl.pca_axes.forEach((a, j) => finiteVec(a, "frame.placement.pca_axes[" + j + "]", frame.config.d));
    return frame;
  }

  // frozen transforms — the only route from data to geometry once a frame exists
  function frameOps(frame) {
    const fp = frame.input_pca, pl = frame.placement, d = frame.config.d;
    const bitsOf = (row) => fp.axes.map((a, j) => {
      let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * (row[k] - fp.mu[k]);
      return s > fp.thresholds[j] ? 1 : 0;
    });
    const z = (b) => b.map((x, j) => (x - pl.bit_mu[j]) / (pl.bit_sd[j] || 1));
    const proj = (zz) => pl.pca_axes.map(a => { let s = 0; for (let j = 0; j < zz.length; j++) s += a[j] * (zz[j] - pl.pca_mu[j]); return s; });
    const toS2 = (b) => { const uv = proj(z(b)); return lift(uv[0], uv[1], pl.scale); };
    return { d, bitsOf, z, proj, toS2, pole: toS2(Array(d).fill(1)) };
  }

  // ---- V2 (trace-normalised: a share in [0,1], never > 1) -------------------
  function V2(B) {
    const zs = zstats(B); const d = B[0].length, n = B.length;
    const Z = B.map(r => r.map((x, j) => (x - zs.mu[j]) / (zs.sd[j] || 1)));
    const C = Array.from({ length: d }, () => Array(d).fill(0));
    for (const r of Z) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] += r[i] * r[j] / Math.max(1, n - 1);
    const ev = jacobiEig(C).values.map(x => Math.max(0, x));
    const trace = ev.reduce((a, b) => a + b, 0);
    if (!(trace > 1e-12)) return 0;                        // degenerate coordinate: no variance to share
    return Math.min(1, ((ev[0] || 0) + (ev[1] || 0)) / trace);
  }

  // ---- null: label-swap chain with a FIXED number of attempted proposals ----
  // Every attempt draws (i, j, a, b) uniformly, self-loops (i===j or a===b) included. The
  // proposal set is symmetric and the number of ATTEMPTS is fixed, so the chain is reversible
  // and the fibre is sampled without the "stop after N successes" bias of the old loop.
  // This is a label-swap / checkerboard-switch chain — NOT a full Curveball trade sequence.
  function nullDraw(B, attempts, r, cert) {
    const M = B.map(x => x.slice()); const n = M.length, d = M[0].length;
    const rs = M.map(x => x.reduce((a, b) => a + b, 0));
    const cs = Array.from({ length: d }, (_, j) => M.reduce((a, x) => a + x[j], 0));
    let accepted = 0;
    for (let t = 0; t < attempts; t++) {
      const i = Math.floor(r() * n), j = Math.floor(r() * n), a = Math.floor(r() * d), b = Math.floor(r() * d);
      if (i === j || a === b) continue;                    // self-loop: an attempt that stays put
      if (M[i][a] === 1 && M[i][b] === 0 && M[j][a] === 0 && M[j][b] === 1) {
        M[i][a] = 0; M[i][b] = 1; M[j][a] = 1; M[j][b] = 0; accepted++;
      }
    }
    const rs2 = M.map(x => x.reduce((a, b) => a + b, 0));
    const cs2 = Array.from({ length: d }, (_, j) => M.reduce((a, x) => a + x[j], 0));
    if (cert) {
      cert.rowOk = cert.rowOk && rs.every((v, i) => v === rs2[i]);
      cert.colOk = cert.colOk && cs.every((v, j) => v === cs2[j]);
      cert.attempted += attempts; cert.accepted += accepted;
    }
    return M;
  }

  // ---- compass (Metropolis on the Φ ladder) ---------------------------------
  const logC = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; };
  function stationary(F, d, T) {                           // logsumexp — stable for tiny T
    const lw = Array.from({ length: d + 1 }, (_, k) => -F(k) / T);
    const finite = lw.filter(Number.isFinite);
    const m = finite.length ? Math.max.apply(null, finite) : 0;
    const w = lw.map(x => Math.exp(x - m));
    const S = w.reduce((a, b) => a + b, 0) || 1;
    return w.map(x => x / S);
  }
  function assertFluxIdentity(residuals, tol) {
    const worst = residuals.reduce((b, r) => Math.abs(r.residual) > Math.abs(b.residual) ? r : b, { k: -1, residual: 0 });
    if (Math.abs(worst.residual) > tol) {
      throw new Error("detailed-balance identity failed at rung " + worst.k + ": |pi(k)a_up - pi(k+1)a_down| = " + Math.abs(worst.residual).toExponential(3) + " > " + tol);
    }
    return { ok: true, max_abs_residual: Math.abs(worst.residual), worst_rung: worst.k };
  }
  function compass(Phi, d, T, steps, r) {
    const F = k => Phi[k] - T * logC(d, k);
    const pi = stationary(F, d, T);
    // analytic identity: pi(k)·P(k→k+1) == pi(k+1)·P(k+1→k), computed from the law, not the run
    const aUp = k => 0.5 * Math.min(1, Math.exp(-(F(k + 1) - F(k)) / T));
    const aDn = k => 0.5 * Math.min(1, Math.exp(-(F(k - 1) - F(k)) / T));
    const residuals = Array.from({ length: d }, (_, k) => ({ k, residual: pi[k] * aUp(k) - pi[k + 1] * aDn(k + 1) }));
    const identity = assertFluxIdentity(residuals, FLUX_TOL);
    // empirical measurement — a separate, noisy observable, never the identity check
    let k = Math.floor(d / 2); const occ = Array(d + 1).fill(0), up = Array(d).fill(0), dn = Array(d).fill(0);
    let acc = 0, maxdk = 0;
    for (let s = 0; s < steps; s++) {
      const dir = r() < 0.5 ? 1 : -1; const k2 = k + dir;
      if (k2 < 0 || k2 > d) { occ[k]++; continue; }
      const alpha = Math.min(1, Math.exp(-(F(k2) - F(k)) / T));
      if (r() < alpha) { if (dir > 0) up[k]++; else dn[k2]++; maxdk = Math.max(maxdk, Math.abs(k2 - k)); k = k2; acc++; }
      occ[k]++;
    }
    const fz = up.map((u, i) => ({ k: i, up: u, down: dn[i], z: (u - dn[i]) / (Math.sqrt(u + dn[i]) || 1) }));
    return {
      T, steps, pi,
      kmean_analytic: pi.reduce((s, p, i) => s + p * i, 0),
      kmean_empirical: occ.reduce((s, c, i) => s + (c / steps) * i, 0),
      acceptance: acc / steps, maxdk,
      flux_identity_analytic: { ok: identity.ok, max_abs_residual: identity.max_abs_residual, worst_rung: identity.worst_rung, tol: FLUX_TOL, note: "pi(k)*a_up(k) = pi(k+1)*a_down(k+1) evaluated on the law; a failure throws before any result is returned" },
      empirical_flux: { per_rung: fz, maxAbsZ: Math.max.apply(null, fz.map(f => Math.abs(f.z))), note: "finite-run measurement of net flux; descriptive only, and not the identity" }
    };
  }
  function crossover(Phi, d) { const arg = T => { let b = 0, bv = -1e9; for (let k = 0; k <= d; k++) { const v = -(Phi[k] - T * logC(d, k)) / T; if (v > bv) { bv = v; b = k; } } return b; }; let lo = 1e-4, hi = 5; if (arg(lo) !== d) return null; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (arg(m) === d) lo = m; else hi = m; } return (lo + hi) / 2; }

  // ---- S² harmonics (diagnostic only) ---------------------------------------
  function sh([x, y, z]) { return [0.28209479, 0.48860251 * y, 0.48860251 * z, 0.48860251 * x, 1.09254843 * x * y, 1.09254843 * y * z, 0.31539157 * (3 * z * z - 1), 1.09254843 * x * z, 0.54627422 * (x * x - y * y), 0.59004359 * y * (3 * x * x - y * y), 2.89061144 * x * y * z, 0.45704580 * y * (5 * z * z - 1), 0.37317633 * z * (5 * z * z - 3), 0.45704580 * x * (5 * z * z - 1), 1.44530572 * z * (x * x - y * y), 0.59004359 * x * (x * x - 3 * y * y)]; }
  function parsevalShares(pts) { const m = Array(16).fill(0); for (const p of pts) { const b = sh(p); for (let i = 0; i < 16; i++) m[i] += b[i] / pts.length; } const E = [m[0] ** 2, 0, 0, 0]; for (let i = 1; i < 4; i++) E[1] += m[i] ** 2; for (let i = 4; i < 9; i++) E[2] += m[i] ** 2; for (let i = 9; i < 16; i++) E[3] += m[i] ** 2; const tot = E.reduce((a, b) => a + b, 0) || 1; return E.map(e => e / tot); }
  const heatExp = l => l * (l + 1);

  // ---- synthetic cloud for demos --------------------------------------------
  function synth(N, D, seed) { const r = mulberry32(seed); const centers = [0, 1, 2].map(() => Array.from({ length: D }, () => gauss(r) * 2)); return Array.from({ length: N }, (_, i) => centers[i % 3].map((m, j) => m + gauss(r) * (j < 6 ? 0.6 : 1.4))); }

  // ---- candidate ladder (frozen placement) ----------------------------------
  // Sectors are ANONYMOUS GEOMETRY (1..12 azimuthal bins). They carry no validated semantics.
  // The canonical NSS axis list is kept only as an explicitly uncalibrated lens dictionary.
  var NSS_LENS_AXES = ["Audience", "Inputs", "Outputs", "Mode", "Assumption set", "Adjacent problems", "Failure modes", "Lifecycle", "Composition", "Knowledge sources", "Calibration", "Recursion"];

  function buildLadder(ctx) {
    const { bits, ops, pts, gaps, d, atoms, keys, frame_id, seed, threshold, cfg } = ctx;
    const baseSectors = sectorCountsOf(pts);
    const baseOcc = baseSectors.filter(c => c > 0).length;
    const baseIso = isolatedCount(pts);
    const measure = (B2) => {
      const pts2 = B2.map(ops.toS2);
      const sc = sectorCountsOf(pts2);
      return {
        pole_shift_geodesic: 0,      // frozen frame: the pole belongs to the frame, not to the edit
        occupied_sectors_delta: sc.filter(c => c > 0).length - baseOcc,
        isolated_delta: isolatedCount(pts2) - baseIso,
        frozen_frame: true
      };
    };
    const nameOf = (i) => { const k = keys[i]; return k && k.name ? k.name : (k && k.label ? k.label : "item #" + i); };
    const bitName = (j) => "bit " + j + " (frozen PCA axis " + j + " " + (threshold === "zero" ? "> 0" : "> frozen median") + ")";
    const ham = (a, b) => a.reduce((acc, v, j) => acc + (v !== b[j] ? 1 : 0), 0);
    const exemplars = (target, pred, n) => bits.map((r, k) => ({ k, h: ham(r, target) })).filter(o => pred(o.k)).sort((a, b) => a.h - b.h).slice(0, n || 3).map(o => nameOf(o.k));
    const guardrails = (m) =>
      "Inspect the actual content of those files before you write anything — a bit pattern is a coordinate, not a description. " +
      "Do not take any destructive action. " +
      "Afterwards re-run the map on the frozen frame (frame_id " + frame_id + ", d=" + d + ", seed=" + seed + ", threshold=" + threshold + ") and diff with PM.compareMaps. " +
      "Predicted movement on this frame: occupied sectors " + (m.occupied_sectors_delta >= 0 ? "+" : "") + m.occupied_sectors_delta +
      ", isolated points " + (m.isolated_delta >= 0 ? "+" : "") + m.isolated_delta + ". " +
      "A matching sign does not mean the edit was good — geometry here is diagnostic, so the task itself must be checked by a task-specific independent verifier.";

    const cands = [];
    // (a) add — ONE new row whose frozen coordinate lands in a thin geometric sector
    const patterns = [];
    if (d <= 12) { for (let m = 0; m < (1 << d); m++) patterns.push(Array.from({ length: d }, (_, j) => (m >> j) & 1)); }
    else { const rp = mulberry32(seed + 99); for (let m = 0; m < 2000; m++) patterns.push(Array.from({ length: d }, () => rp() < 0.5 ? 1 : 0)); }
    const patPts = patterns.map(ops.toS2);
    const meanZ = pts.reduce((a, p) => a + p[2], 0) / pts.length;
    const thin = baseSectors.map((c, sIdx) => ({ sIdx, c })).sort((a, b) => a.c - b.c).slice(0, 4);
    for (const { sIdx, c } of thin) {
      const phi = -Math.PI + ((sIdx + 0.5) / SECTORS) * 2 * Math.PI;
      const rr = Math.sqrt(Math.max(0, 1 - meanZ * meanZ));
      const target = [rr * Math.cos(phi), rr * Math.sin(phi), meanZ];
      let bi = 0, bd = Infinity;
      patPts.forEach((q, i) => { const dd = geo(q, target); if (dd < bd) { bd = dd; bi = i; } });
      const pat = patterns[bi];
      const m = measure(bits.concat([pat.slice()]));           // atomic: exactly one row
      const on = pat.map((v, j) => v ? j : -1).filter(j => j >= 0);
      const off = pat.map((v, j) => v ? -1 : j).filter(j => j >= 0);
      const ex = exemplars(pat, () => true);
      cands.push({
        action: "add", rows_added: 1, sector: sIdx + 1, sector_count: c, semantic_status: "unvalidated",
        pattern: pat, frame_id, delta: m, score: -m.isolated_delta,
        exemplars: ex,
        hypothesis: "bit-space hypothesis: one item carrying " + (on.length ? on.map(bitName).join(", ") : "none of the bits") +
          (off.length ? " and not " + off.map(bitName).join(", ") : "") + " lands in geometric sector " + (sIdx + 1) +
          " (" + (c === 0 ? "empty" : c + " item" + (c === 1 ? "" : "s")) + ") under the frozen frame",
        method: "insert one synthetic row with that pattern, re-place on the FROZEN frame (no refit), remeasure occupancy and isolation",
        prompt: "[add · geometric sector " + (sIdx + 1) + "] Write one new item for this corpus. Nearest existing items by bit pattern: " +
          (ex.join(", ") || "(none)") + ". " + guardrails(m)
      });
    }
    // (b) change — flip one bit on one item (the strongest single-action atoms)
    for (const a of atoms.filter(x => x.flip >= 0).sort((x, y) => y.delta - x.delta).slice(0, 3)) {
      const B2 = bits.map(r => r.slice()); B2[a.i][a.flip] = 1;
      const m = measure(B2);
      const ex = exemplars(bits[a.i], k => k !== a.i && bits[k][a.flip] === 1);
      cands.push({
        action: "change", item: a.i, name: nameOf(a.i), flip_bit: a.flip, atom_delta: +a.delta.toFixed(5),
        sector: sectorIndex(pts[a.i]) + 1, semantic_status: "unvalidated", frame_id,
        delta: m, score: -m.isolated_delta, exemplars: ex,
        hypothesis: "bit-space hypothesis: turning on " + bitName(a.flip) + " for " + nameOf(a.i) +
          " is its single-action atom (delta=" + a.delta.toFixed(3) + " toward the frozen pole)",
        method: "flip one bit, re-place on the FROZEN frame (no refit), remeasure occupancy and isolation",
        prompt: "[change · geometric sector " + (sectorIndex(pts[a.i]) + 1) + "] Open " + nameOf(a.i) + " and edit it so it acquires what these nearest items with " +
          bitName(a.flip) + " on have in common: " + (ex.join(", ") || "(no exemplar with that bit on)") + ". " + guardrails(m)
      });
    }
    // rank: lexicographic (most-negative isolated delta first, then largest occupancy gain).
    // The pole cannot shift on a frozen frame, so it plays no part in ranking.
    const moved = cands.filter(c => c.delta.isolated_delta !== 0 || c.delta.occupied_sectors_delta !== 0);
    const seen = new Set();
    const rungs = moved
      .sort((a, b) => (a.delta.isolated_delta - b.delta.isolated_delta) || (b.delta.occupied_sectors_delta - a.delta.occupied_sectors_delta))
      .filter(c => { const k = c.action + ":" + (c.item !== undefined ? "i" + c.item + ":" + c.flip_bit : "s" + c.sector); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 5)
      .map((c, r) => Object.assign({ rung: "L" + (r + 1) }, c, {
        caveat: "measured on this cloud on the frozen frame; a re-embed lands near, not on, the synthetic pattern"
      }));

    // review-only audit: outliers are reported, never ranked and never turned into an instruction
    const nn = pts.map((p, i) => Math.min.apply(null, pts.map((q, j) => j === i ? Infinity : chord(p, q))));
    const isoI = nn.indexOf(Math.max.apply(null, nn));
    const farI = gaps.indexOf(Math.max.apply(null, gaps));
    const outliers = [];
    const pushOutlier = (i, reason) => { if (i >= 0 && !outliers.some(o => o.item === i)) outliers.push({ item: i, name: nameOf(i), sector: sectorIndex(pts[i]) + 1, reason: reason, semantic_status: "unvalidated" }); };
    pushOutlier(isoI, "largest nearest-neighbour chord (" + nn[isoI].toFixed(3) + ")");
    pushOutlier(farI, "largest chord to the frozen all-ones pole (" + gaps[farI].toFixed(3) + ")");

    return {
      decision: rungs.length ? "ranked" : "no-operation",
      reason: rungs.length ? "candidates with a measurable move on the frozen frame" : "no measurable move was produced by any candidate on the frozen frame (no fixed point is claimed)",
      ranking_rule: "lexicographic: isolated_delta ascending, then occupied_sectors_delta descending; pole shift is excluded (frozen frame) and is not a ranking term",
      score_note: "score = -isolated_delta: a display-only figure, positive when the candidate removes isolated points and negative when it creates them; it is not a quality claim",
      sector_counts: baseSectors,
      sectors_are: "anonymous geometric azimuthal bins numbered 1..12; no validated semantics attached",
      base: { occupied_sectors: baseOcc, isolated: baseIso },
      rungs,
      nss_lens_dictionary: {
        axes: NSS_LENS_AXES.slice(),
        semantic_status: "unvalidated",
        note: "canonical 12-axis list retained as an uncalibrated reading lens only; it is NOT a mapping onto the geometric sectors, and no sector has been validated against any axis"
      },
      review_only_audit: {
        note: "review only — no action is instructed, ranked, or scored here; a human decides whether these items deserve a look",
        outliers
      },
      config_echo: { d: cfg.d, threshold: cfg.threshold, seed: cfg.seed }
    };
  }

  // ---- the map --------------------------------------------------------------
  function runMap(X, opts) {
    opts = opts || {};
    const cfg = validate(X, opts);
    const { N, D, K, T, seed, steps, threshold, preprocessing_id } = cfg;

    // a freshly built frame is validated with the same rules as a supplied one: huge-but-finite
    // inputs can overflow the covariance and produce a non-finite frame, and that must surface as a
    // stated numeric-range failure here rather than as a hashing error further down.
    const frame = opts.frame ? assertFrameCompatible(opts.frame, cfg)
      : assertFrameCompatible(buildFrame(X, cfg), cfg, "frame construction produced a non-finite instrument (check input magnitudes)");
    if (opts.frame && opts.d !== undefined && frame.config.d !== Math.min(opts.d, Math.min(D, N - 1))) {
      throw new RangeError("frame drift: requested d " + opts.d + " != frame d " + frame.config.d);
    }
    const d = frame.config.d;
    const ops = frameOps(frame);
    const frame_id = hashObj(frame);
    const instrument_id = hashObj({ version: VERSION, d, threshold, seed, K, T, steps, D, preprocessing_id });

    const certs = [];
    // identity certificates are theorems about the instrument, not measurements of the corpus: a
    // false one means the arithmetic is broken, so no result is returned. (0.2 could return a
    // result whose summary merely counted the failure in identity_failures.)
    const cert = (cls, theorem, ok, detail) => {
      certs.push({ class: cls, theorem, ok: !!ok, detail });
      if (cls === "identity" && !ok) throw new Error("identity certificate failed \u2014 no result is returned: " + theorem + " :: " + detail);
      return !!ok;
    };

    const keys = X.map((v, i) => ({ ordinal: i, hash: hashVec(v), label: cfg.labels ? cfg.labels[i] : undefined, name: cfg.names ? cfg.names[i] : undefined }));
    const bits = X.map(ops.bitsOf);
    const pts = bits.map(ops.toS2);
    const pole = ops.pole;
    const gaps = pts.map(q => chord(q, pole));

    const run_fingerprint = hashObj({ frame_id, instrument_id, rows: keys.map(k => k.hash), names: cfg.names || null });

    const clsMap = new Map(); bits.forEach(b => { const k = b.join(""); clsMap.set(k, (clsMap.get(k) || 0) + 1); });
    const largest = Math.max.apply(null, Array.from(clsMap.values()));
    cert("identity", "keyed-row injectivity (D6)", new Set(keys.map(k => k.ordinal)).size === N, "ordinal is the injective key; content hashes " + new Set(keys.map(k => k.hash)).size + "/" + N + " distinct");

    // Φ ladder
    const ks = bits.map(b => b.reduce((a, x) => a + x, 0));
    const Phi = Array.from({ length: d + 1 }, (_, k) => { const g = gaps.filter((_, i) => ks[i] === k); return g.length ? g.reduce((a, b) => a + b, 0) / g.length : NaN; });
    const filled = [];
    for (let k = 0; k <= d; k++) if (Number.isNaN(Phi[k])) { filled.push(k); let lo = k - 1, hi = k + 1; while (lo >= 0 && Number.isNaN(Phi[lo])) lo--; while (hi <= d && Number.isNaN(Phi[hi])) hi++; Phi[k] = lo < 0 ? (hi > d ? 0 : Phi[hi]) : hi > d ? Phi[lo] : Phi[lo] + (Phi[hi] - Phi[lo]) * (k - lo) / (hi - lo); }
    const drops = Phi.slice(0, d).map((p, k) => p - Phi[k + 1]);
    const sumDrops = drops.reduce((a, b) => a + b, 0);
    cert("identity", "phi_ladder_telescope (Lean §5)", Math.abs(sumDrops - (Phi[0] - Phi[d])) < 1e-9, "sum(drops)=" + sumDrops.toFixed(6) + " vs Phi(0)-Phi(d)=" + (Phi[0] - Phi[d]).toFixed(6) + (filled.length ? "; empty shells " + filled.join(",") + " linearly interpolated (stated)" : ""));

    // V2 + the Lean §4 gate/rank pair.
    // Lean C2 (gate_rank_identity) is an EQUIVALENCE: (V2 >= 2/5) <-> (rhat = 2/V2 <= 5). Both sides
    // cross-multiply to 5*V2 >= 2, so the identity holds whether the corpus passes the gate or fails
    // it — (false <-> false) is a satisfied identity. The identity certificate therefore tests the
    // EQUIVALENCE; whether the gate is passed is a MEASUREMENT and is certified separately. Lean's
    // hypotheses are p, q > 0, so a degenerate zero-variance coordinate (V2 = 0) is out of scope: it
    // is reported N/A, it does not throw, and it claims nothing about the corpus.
    const v2 = V2(bits);
    const GATE = 0.4, RANK_MAX = 5;
    const identity_applicable = Number.isFinite(v2) && v2 > 0;
    const rhat = identity_applicable ? 2 / v2 : Infinity;
    const gate_pass = identity_applicable ? v2 >= GATE : null;
    const rank_pass = identity_applicable ? rhat <= RANK_MAX : null;
    // 5*V2 == 2 is the one point where the two float evaluations can disagree by an ulp; the identity
    // is exact there by construction, so the boundary is stated rather than reported as a violation.
    const at_boundary = identity_applicable && Math.abs(5 * v2 - 2) <= 1e-12;
    const identity_holds = identity_applicable ? (gate_pass === rank_pass || at_boundary) : null;
    const gate_rank = {
      v2: v2, rhat: rhat, threshold: RANK_MAX, gate_threshold: GATE,
      gate_pass: gate_pass, rank_pass: rank_pass, ok: rank_pass,
      identity_applicable: identity_applicable, identity_holds: identity_holds, at_boundary: at_boundary,
      note: "identity_holds certifies the Lean §4 equivalence (V2 >= 0.40) <-> (2/V2 <= 5), which is satisfied even when both sides are false; gate_pass / rank_pass are the measurement on this coordinate and are not evidence about the corpus"
    };
    cert("identity", "gate_rank_identity (Lean §4)", identity_applicable ? identity_holds : true,
      identity_applicable
        ? "equivalence (V2 >= " + GATE + ") <-> (rhat = 2/V2 <= " + RANK_MAX + "): left=" + gate_pass + ", right=" + rank_pass +
          " at V2=" + v2.toFixed(6) + ", rhat=" + rhat.toFixed(6) + (at_boundary ? " (at the 5*V2=2 boundary)" : "") +
          "; an identity, true whether the gate passes or fails"
        : "not applicable: V2=" + v2 + " is a degenerate zero-variance coordinate, so Lean §4's p, q > 0 hypotheses are unmet; no gate claim is made");
    cert("measurement", "V2 rank gate (V2 >= " + GATE + ", equivalently rhat <= " + RANK_MAX + ")", identity_applicable && rank_pass,
      identity_applicable
        ? "V2=" + v2.toFixed(4) + " (trace-normalised share) => rhat=2/V2=" + rhat.toFixed(2) + (rank_pass ? " <= 5 (gate passed)" : " > 5 (gate not passed)")
        : "not-tested (degenerate zero-variance coordinate: V2=" + v2 + ")");

    // atoms on the frozen frame
    const atoms = bits.map((b, i) => {
      const dpre = gaps[i]; let best = { bits: b, dist: dpre, flip: -1 };
      for (let j = 0; j < d; j++) if (b[j] === 0) { const nb = b.slice(); nb[j] = 1; const dist = chord(ops.toS2(nb), pole); if (dist < best.dist) best = { bits: nb, dist, flip: j }; }
      return { i, flip: best.flip, delta: dpre - best.dist, dk: best.flip < 0 ? 0 : 1, to: best.flip < 0 ? pts[i] : ops.toS2(best.bits) };
    });
    const minDelta = Math.min.apply(null, atoms.map(a => a.delta));
    let run = 0, mono = true;
    for (const dl of atoms.map(a => a.delta).sort((a, b) => b - a)) { if (run + dl < run - 1e-12) mono = false; run += dl; }
    cert("identity", "atom_delta_nonneg (Lean §1)", minDelta >= -1e-12, atoms.filter(a => a.flip >= 0).length + "/" + N + " items have a strictly improving flip; min delta=" + minDelta.toExponential(2));
    cert("identity", "quantization max|dk|=1 (compass)", atoms.every(a => a.dk <= 1), "max dk=" + Math.max.apply(null, atoms.map(a => a.dk)));
    cert("identity", "corpus_sum_nonneg + cumulative_monotone (Lean §2–3)", mono && run >= 0, "sum(delta)=" + run.toFixed(4) + ", prefix sums monotone=" + mono);

    // null model
    const attempts = 5 * N * d;
    const c8 = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
    const rn = mulberry32(seed ^ 0x9e3779b9);
    const nulls = [];
    for (let k = 0; k < K; k++) nulls.push(V2(nullDraw(bits, attempts, rn, c8)));
    const E0 = nulls.reduce((a, b) => a + b, 0) / K;
    const SD0 = Math.sqrt(nulls.reduce((a, b) => a + (b - E0) ** 2, 0) / (K - 1));
    const admissible = Number.isFinite(SD0) && SD0 >= 1e-3;
    const zV2 = admissible ? (v2 - E0) / SD0 : null;
    const obs = Math.abs(v2 - E0);
    const atLeastAsExtreme = nulls.filter(x => Math.abs(x - E0) >= obs - 1e-15).length;
    const p_two_sided = (1 + atLeastAsExtreme) / (K + 1);
    const p_resolution = 1 / (K + 1);
    const verdict = !admissible ? "not-tested (degenerate null)"
      : (p_two_sided <= p_resolution + 1e-15 ? "excluded at the resolution of this null" : "not-excluded");
    cert("identity", "swap_preserves_rowSum (Lean §8)", c8.rowOk, c8.accepted + " accepted of " + c8.attempted + " attempted proposals over " + K + " draws");
    cert("identity", "swap_preserves_colSum (Lean §8)", c8.colOk, c8.accepted + " accepted of " + c8.attempted + " attempted proposals over " + K + " draws");
    cert("measurement", "membership: SD0[V2] >= 1e-3", admissible, "SD0=" + SD0.toExponential(3));
    cert("measurement", "delta-V2 vs fixed-margin null (exclusion-only, empirical p)", admissible && p_two_sided <= p_resolution + 1e-15,
      admissible ? "delta-V2=" + (v2 - E0).toFixed(4) + ", p=" + p_two_sided.toFixed(4) + " (resolution " + p_resolution.toFixed(4) + " at K=" + K + ") -> " + verdict : "void (inadmissible coordinate)");

    // compass — throws on an identity failure before any result is built
    const C = compass(Phi, d, T, steps, mulberry32(seed + 7));
    const Tx = crossover(Phi, d);
    cert("identity", "mh_detailed_balance analytic (Lean §7)", C.flux_identity_analytic.ok, "max |pi(k)a_up - pi(k+1)a_down| = " + C.flux_identity_analytic.max_abs_residual.toExponential(2));
    cert("identity", "quantization on accepted moves", C.maxdk <= 1, "max|dk|=" + C.maxdk);

    // slerp bridge
    const worst = atoms.reduce((b, a) => a.delta > b.delta ? a : b, atoms[0]);
    const ts = [0, 0.1, 0.25, 0.5, 0.75, 1];
    const bridgeRungs = ts.map(t => slerp(pts[worst.i], pole, t));
    let monoG = true;
    for (let i = 1; i < bridgeRungs.length; i++) if (geo(bridgeRungs[i], pole) > geo(bridgeRungs[i - 1], pole) + 1e-9) monoG = false;
    cert("identity", "slerp bridge: geodesic to target non-increasing", monoG, "item " + worst.i + " -> pole, " + bridgeRungs.length + " rungs");

    // spectra — diagnostic only
    const E = parsevalShares(pts);
    const spectra = {
      admitted: false,
      status: "diagnostic only — NOT admitted as homology, and not admitted as evidence about the corpus",
      S2_parseval: E.map(x => +x.toFixed(4)),
      S2_even: +(E[0] + E[2]).toFixed(4),
      S2_odd: +(E[1] + E[3]).toFixed(4),
      rank0_2_block: +(E[0] + E[2]).toFixed(4),
      rank1_block: +E[1].toFixed(4),
      heat_eigenvalues_per_degree: [0, 1, 2, 3].map(l => ({ degree: l, eigenvalue: heatExp(l) })),
      decay: [0.05, 0.2, 1].map(t => ({ t, E: E.map((e, l) => +(e * Math.exp(-2 * heatExp(l) * t)).toExponential(2)) })),
      disclaimers: [
        "no dipole response is computed, and no polarizability response is computed or implied",
        "this is not an IR measurement and not a Raman measurement; no physical spectroscopic signal is claimed",
        "no fitted lifetime and no binding energy is estimated or reported",
        "this block adds no quality score and must not be read as one",
        "the S2 band shares are a shape statistic of the point cloud on this frozen frame, nothing more"
      ]
    };
    cert("identity", "heat_exponent_monotone (Lean §6)", [0, 1, 2, 3].every((l, i, a) => i === 0 || heatExp(a[i - 1]) < heatExp(l)), "l(l+1) = " + [0, 1, 2, 3].map(heatExp).join(","));
    cert("identity", "heat_exp_dominates_hamming (Lean §14)", [1, 2, 3].every(l => l < heatExp(l)), "sphere penalty strictly harsher than H(d,2) for l>=1");

    const ladder_candidates = buildLadder({ bits, ops, pts, gaps, d, atoms, keys, frame_id, seed, threshold, cfg });
    const shells = Array.from({ length: d + 1 }, (_, k) => ks.filter(x => x === k).length);
    const sector_counts = ladder_candidates.sector_counts;
    // belt-and-braces: cert() already throws on a false identity; this only fires if a future edit
    // pushes a certificate without going through cert().
    const identity_failed = certs.filter(c => c.class === "identity" && !c.ok);
    if (identity_failed.length) throw new Error("identity certificate(s) failed \u2014 no result is returned: " + identity_failed.map(c => c.theorem).join(", "));

    return {
      version: VERSION,
      // ---- instrument identity ----
      frame, frame_id, instrument_id, run_fingerprint, preprocessing_id,
      rule_hash: frame_id,                       // backwards-compatible alias of frame_id
      rule: {
        rule: threshold === "zero" ? "Rabs" : "R0", d, threshold,
        note: threshold === "zero"
          ? "frozen top-d PCA axes; bit_j = [score_j > 0] (sign rule; column margins float)"
          : "frozen top-d PCA axes; bit_j = [score_j > exact median_j of the fitting cloud]. Strict scores above the fitted median give floor(N/2) ones without ties; ties can lower that count, so fixed margins are not guaranteed. Frozen thresholds do not impose margins on later corpora."
      },
      seed, n: N, D, d, T, K, steps,
      keys, names: cfg.names || null, labels: cfg.labels || null,
      bits,                                       // returned for comparison
      classes: { count: clsMap.size, largest, unresolvable_pairs: Array.from(clsMap.values()).reduce((s, c) => s + c * (c - 1) / 2, 0) },
      k: ks,
      pts: pts.map(p => p.map(x => +x.toFixed(5))),
      pts_full: pts,
      pole: pole.map(x => +x.toFixed(5)),
      gaps: gaps.map(x => +x.toFixed(5)),
      pc12: null,                                 // undefined on a frozen frame; see gate_rank / v2
      v2: +v2.toFixed(5), gate_rank,
      sector_counts,
      occupied_sectors: sector_counts.filter(c => c > 0).length,
      isolated: isolatedCount(pts),
      ladder: { Phi: Phi.map(x => +x.toFixed(4)), drops: drops.map(x => +x.toFixed(4)), interpolated_shells: filled },
      shells,
      atoms: atoms.map(a => ({ i: a.i, flip: a.flip, delta: +a.delta.toFixed(5), to: a.to.map(x => +x.toFixed(5)) })),
      null: {
        kind: "label-swap chain: a fixed number of ATTEMPTED symmetric checkerboard switch proposals (self-loops included) — not a full Curveball trade sequence",
        K, attempts_per_draw: attempts, accepted_total: c8.accepted, attempted_total: c8.attempted,
        E0: +E0.toFixed(5), SD0: +SD0.toFixed(6), admissible,
        z: zV2 === null ? null : +zV2.toFixed(2),
        z_note: "z is descriptive only — the null is empirical and finite, so this is not a Gaussian significance statement",
        p_two_sided, p_resolution,
        p_note: "two-sided plus-one empirical tail: p = (1 + #{|V2* - E0| >= |V2 - E0|}) / (K + 1); the smallest attainable p at K=" + K + " is " + p_resolution.toFixed(4),
        verdict,
        stationary_law: "uniform on the fibre under a symmetric, fixed-attempt proposal set (Lean §10); irreducibility not checked at this N·d"
      },
      compass: Object.assign({}, C, {
        pi: C.pi.map(x => +x.toFixed(6)),
        kmean_analytic: +C.kmean_analytic.toFixed(4),
        kmean_empirical: +C.kmean_empirical.toFixed(4),
        acceptance: +C.acceptance.toFixed(3),
        Tx: Tx === null ? null : +Tx.toFixed(6),
        wall: "property of a designed chain on a measured ladder, not of the cloud"
      }),
      bridge: { i: worst.i, ts, rungs: bridgeRungs.map(p => p.map(x => +x.toFixed(5))) },
      ladder_candidates,
      nss: {                                      // backwards-compatible shell over the new ladder
        deprecated: "sectors are anonymous geometry; the NSS axis list is an uncalibrated lens dictionary",
        semantic_status: "unvalidated",
        sector_counts,
        lens_dictionary: ladder_candidates.nss_lens_dictionary,
        ladder: ladder_candidates.rungs,
        decision: ladder_candidates.decision
      },
      spectra,
      certificates: certs,
      summary: {
        identity_failures: certs.filter(c => c.class === "identity" && !c.ok).length,
        measurement_red: certs.filter(c => c.class === "measurement" && !c.ok).length
      }
    };
  }

  // ---- before/after comparison on one frozen frame --------------------------
  function nameIndex(res, which) {
    if (!res || !Array.isArray(res.names)) throw new TypeError(which + " has no names[]; compareMaps is name-keyed — run the map with opts.names");
    const idx = new Map();
    res.names.forEach((n, i) => {
      if (idx.has(n)) throw new RangeError("duplicate name " + JSON.stringify(n) + " in " + which + "; comparison requires unique names");
      idx.set(n, i);
    });
    return idx;
  }
  function compareMaps(before, after) {
    if (!before || !after) throw new TypeError("compareMaps(before, after) needs two runMap results");
    if (before.frame_id !== after.frame_id) throw new RangeError("frame_id mismatch (" + before.frame_id + " vs " + after.frame_id + "): the two maps are not on the same frozen frame");
    if (before.instrument_id !== after.instrument_id) throw new RangeError("instrument_id mismatch (" + before.instrument_id + " vs " + after.instrument_id + "): settings differ between the two runs");
    const bi = nameIndex(before, "before"), ai = nameIndex(after, "after");
    const missing = [], added = [];
    for (const n of bi.keys()) if (!ai.has(n)) missing.push(n);
    for (const n of ai.keys()) if (!bi.has(n)) added.push(n);
    if (missing.length || added.length) {
      throw new RangeError("name sets differ — comparison requires the same set of unique names (missing in after: " +
        (missing.slice(0, 5).join(", ") || "none") + "; added in after: " + (added.slice(0, 5).join(", ") || "none") + ")");
    }
    const perName = [];
    let bitsChanged = 0, unchanged = 0, maxGeo = 0;
    for (const [n, i] of bi) {
      const j = ai.get(n);
      const p = before.pts_full ? before.pts_full[i] : before.pts[i];
      const q = after.pts_full ? after.pts_full[j] : after.pts[j];
      // chord-derived geodesic: exactly 0 for coincident points. acos(dot) would return ~1e-8
      // of float noise for identical coordinates and turn every anchor into a phantom move.
      const ch = chord(p, q), g = 2 * Math.asin(Math.min(1, ch / 2));
      const bb = before.bits[i], ab = after.bits[j];
      let hb = 0; for (let k = 0; k < bb.length; k++) if (bb[k] !== ab[k]) hb++;
      bitsChanged += hb;
      if (hb === 0 && g === 0) unchanged++;
      maxGeo = Math.max(maxGeo, g);
      const vector_changed = before.keys[i].hash !== after.keys[j].hash;
      const bs = before.embedding_metadata?.docs?.[i]?.sha256, as = after.embedding_metadata?.docs?.[j]?.sha256;
      const content_changed = bs && as ? bs !== as : null;
      const input_changed = vector_changed || content_changed === true;
      perName.push({ name: n, displacement_geodesic: g, displacement_chord: ch, bits_changed: hb, vector_changed, content_changed, input_changed, quantization_silent: input_changed && hb === 0 && g === 0, before_index: i, after_index: j });
    }
    const changed = perName.filter(x => x.bits_changed > 0 || x.displacement_geodesic > 0);
    return {
      frame_id: before.frame_id, instrument_id: before.instrument_id,
      n: perName.length,
      per_name: perName,
      changed_names: changed.map(x => x.name),
      changed_input_names: perName.filter(x => x.input_changed).map(x => x.name),
      changed_content_names: perName.filter(x => x.content_changed === true).map(x => x.name),
      representation_drift_names: perName.filter(x => x.content_changed === false && x.vector_changed).map(x => x.name),
      quantization_silent_names: perName.filter(x => x.quantization_silent).map(x => x.name),
      unchanged_input_anchors: perName.filter(x => !x.input_changed).length,
      unchanged_anchors: unchanged,
      bits_changed_total: bitsChanged,
      max_displacement_geodesic: maxGeo,
      mean_displacement_geodesic: perName.reduce((a, x) => a + x.displacement_geodesic, 0) / perName.length,
      isolated_delta: after.isolated - before.isolated,
      occupied_sectors_delta: after.occupied_sectors - before.occupied_sectors,
      sector_counts_delta: after.sector_counts.map((c, i) => c - before.sector_counts[i]),
      geometry_decision: changed.length ? "moved" : "stable",
      geometry_decision_note: "diagnostic only: geometry says where points went on a frozen frame, it does not say whether the change was correct or useful",
      task_verdict: "not-tested",
      task_verdict_note: "whether the underlying task improved is not tested here and must be checked by a task-specific independent verifier"
    };
  }

  // stated preprocessing for big-D clouds: top-k PCA scores (same sign convention)
  function reduce(X, k, seed) { const p = pcaTop(X, k, mulberry32(seed === undefined ? 1 : seed)); return { scores: p.scores.map(r => r.map(x => +x.toFixed(6))), explained: p.values.slice(0, k).map(x => +x.toFixed(6)) }; }

  return {
    runMap, compareMaps, synth, mulberry32, slerp, hashVec, hashStr, reduce, buildFrame,
    _internal: { V2, nullDraw, assertFluxIdentity, pcaTop, frameOps, stationary, sectorIndex, isolatedCount, canonical, hashObj, validate }
  };
})();
