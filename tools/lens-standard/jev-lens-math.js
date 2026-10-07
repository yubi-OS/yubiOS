// jev-lens-math.js — pure, deterministic ES-module lens math for
// lens-standard-v1 (hierarchy-oracle program, Lane H JS port of Lane F's
// Python source of record lens_standard.py).
//
// No npm deps, no env access, Workers-compatible (plain ES module). Measuring
// is NEVER reimplemented here (same rule as the Python source of record): D
// comes from the edge-standard-v1 JS port (jev-edge-standard.js, imported as
// the sibling measuring module — the Python side imports edge_standard.py by
// path; both sides therefore share ONE measuring implementation per language,
// each already parity-tested against the other).
//
// PARITY CONTRACT (every rule pinned so Python reproduces exactly):
//  - Moment sums: float64 accumulation in the EXACT loop order of
//    _moment_sums / _trefoil_moment_sums (row-major scan; n, sx, sy, sxx,
//    syy, r2, sr2, r4, sr4, sr6 — and z, zc, zc2, zc4 for the third-moment
//    sums). JS numbers are IEEE-754 doubles like CPython floats; integer
//    overflow is impossible for these magnitudes (counts < 2^24, sums of
//    half-integer squares < 2^53), so plain float64 matches Python.
//    Python's arbitrary-precision int `n` counter maps to a JS number —
//    ink counts are ~2e4, far below 2^53.
//  - nint re-rasterization: floor(v + 0.5) — Math.floor(v + 0.5). JS
//    Math.floor and Python math.floor are both IEEE floor (exact); the sum
//    v + 0.5 is one IEEE double op on both sides. NO Math.round: the Python
//    source pins floor(v+0.5) (JS Math.round half-up), and Math.round on
//    .5-boundary negatives differs from floor(v+0.5) — never use it here.
//  - hypot: Math.hypot(dx, dy) is used exactly where Python uses
//    math.hypot (spherical forward/inverse). VERIFIED bit-identical to
//    Python math.hypot over the entire half-integer lattice
//    {-255.5, -254.5, ..., 255.5}^2 (262144 points, sha256-compared:
//    8852f8edea89da81e42e23b082408dffc942aaad88a4a66064210c3cf469808a on
//    both sides). Do NOT replace it with sqrt(x*x+y*y): that is a
//    different, 1-ulp-off function on ~35% of the lattice.
//  - pow: Python's `x ** 3` / `x ** 2` on floats call C pow() — they are
//    NOT repeated multiplication (verified: py x**3 != x*x*x, py x**2 !=
//    x*x, sha-compared over the (1+b) domain). The port therefore uses
//    Math.pow(x, 3) and Math.pow(x, 2), which matched Python bit-for-bit on
//    4016/4016 (cube) and 4014/4016 (square) domain samples — the square's
//    ~1-in-2000 1-ulp V8/libm residual is the one acknowledged divergence
//    risk; it feeds only the trefoil derivative term and is absorbed by the
//    1e-9 estimate tolerance and the pixel-rounding gap.
//  - Complex arithmetic: Python complex mul is (ac-bd, ad+bc) in plain
//    double ops; scalar*complex is (s*re, s*im). The port mirrors each
//    expression's evaluation order (left-associative) exactly.
//  - Gold renders: gen_gasket / gen_tri / render_disks ported verbatim so
//    the tests are self-sufficient. Python `//` is floor division —
//    mirrored as Math.floor((p + q) / 2) (identical for negatives too).
//    Python round() is HALF-TO-EVEN — mirrored by roundHalfToEven() below
//    (Math.round is half-up; they differ exactly on ties, which the gasket
//    height never hits, but the port does not rely on that).
//  - Negative-operand floor-division hazard (Python floor-div vs JS): this
//    module has no `/` on possibly-negative integer operands except via
//    Math.floor as above; all warp/estimator arithmetic is pure float64.
//  - Error semantics: Python raises ValueError; the port throws Error with
//    the same message text. No-ink: measureD throws before the estimator
//    can divide by zero (Python: measure_D's ValueError fires first).
//  - All pinned parameters live in the fixture pack `meta.pinned` block;
//    changing any is a major version bump.
//
// Exports: SIZE, CENTER, R_MAX, ASTIG_KAPPA, MAX_ASTIG, MAX_SPHERICAL,
// MAX_TREFOIL, TREFOIL_ZOOM_K, TREFOIL_INVERSE_STEPS, EST_NEWTON_STEPS,
// EST_CORRECTOR_STEPS, SPHERICAL_INVERSE_STEPS, EST_TOL, D_BAND,
// ABERRATIONS, canonicalMask, maskSha256, goldRender, renderDisks,
// genGasket, genTri, nint, checkCoef, trefoilBeta, warpMask, momentSums,
// trefoilMomentSums, estAstig, estSpherical, estTrefoil, algebraicEstimate,
// estimateCoefficient, measureD, correctLoop.

import { standardize, measure } from './jev-edge-standard.js';

export const LENS_PIPELINE = 'lens-standard-v1';
export const SIZE = 512;
export const CENTER = (SIZE - 1) / 2; // pinned warp/moment center (255.5, 255.5)

// --- gold renders (reused from the edge-standard falsification corpus) -----
export const GASKET_L = 384;
export const GASKET_R = 3;
export const GASKET_DEPTHS = 6;
const TRI_ROWS = [3, 4, 5, 4, 3];
const TRI_A = Math.floor((SIZE * 52) / 512);
const TRI_DY = Math.floor((SIZE * 45) / 512);
const TRI_R = Math.floor((SIZE * 16) / 512);

// --- mode envelopes ---------------------------------------------------------
export const R_MAX = Math.floor(SIZE / 2); // 256
const R2 = R_MAX * R_MAX;
export const ASTIG_KAPPA = 0.5;
export const MAX_ASTIG = 0.5;
export const MAX_SPHERICAL = 0.3;
export const MAX_TREFOIL = 2.0e-4;
export const TREFOIL_ZOOM_K = 460.0;
export const TREFOIL_INVERSE_STEPS = 12;

export const ABERRATIONS = [
  ['astig', 0.10], ['astig', 0.20],
  ['spherical', 0.06], ['spherical', 0.12],
  ['trefoil', 0.0001], ['trefoil', 0.00015],
];

export const EST_TOL = { astig: 5e-3, spherical: 5e-3, trefoil: 5e-3 };
export const D_BAND = 0.05;
export const EST_NEWTON_STEPS = 6;
export const EST_CORRECTOR_STEPS = 2;
export const SPHERICAL_INVERSE_STEPS = 12;

// ---------------------------------------------------------------------------
// sha256 (pure JS; the mask serialization is pure ASCII so utf-8 == bytes)
// ---------------------------------------------------------------------------

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Bytes(bytes) {
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + hh) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 8; i++) out += H[i].toString(16).padStart(8, '0');
  return out;
}

/** Byte-exact canonical serialization: newline-joined '1'/'0' rows. */
export function canonicalMask(rows) {
  const parts = [];
  for (const row of rows) {
    let s = '';
    for (const v of row) s += v ? '1' : '0';
    parts.push(s);
  }
  return parts.join('\n');
}

/** sha256 of the utf-8 bytes of canonicalMask (ASCII-only -> direct bytes). */
export function maskSha256(rows) {
  const s = canonicalMask(rows);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return sha256Bytes(bytes);
}

// ---------------------------------------------------------------------------
// gold renders (verbatim port; see header note on // and round())
// ---------------------------------------------------------------------------

/** Python round() — half-to-even (Math.round is half-up; do not use it). */
function roundHalfToEven(v) {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1; // tie -> even
}

/**
 * Hard-pixel integer disk rasterization (inclusive <= r^2 test). Mirrors the
 * falsification-corpus generator exactly: integer pixel space only, no
 * anti-aliasing. Returns rows of 0/255.
 */
export function renderDisks(size, disks, gray = 255) {
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(new Array(size).fill(0));
  for (const [cx, cy, r] of disks) {
    const r2 = r * r;
    for (let y = Math.max(0, cy - r); y < Math.min(size, cy + r + 1); y++) {
      const dy = y - cy;
      const row = rows[y];
      for (let x = Math.max(0, cx - r); x < Math.min(size, cx + r + 1); x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) row[x] = gray;
      }
    }
  }
  return rows;
}

/** Python `_mid`: floor division == Math.floor((p + q) / 2) (exact on ints). */
function mid(p, q) {
  return [Math.floor((p[0] + q[0]) / 2), Math.floor((p[1] + q[1]) / 2)];
}

/** Merged-gasket droplet arrangement (gen_gasket_v2 verbatim, 6 depths). */
export function genGasket(size, L = GASKET_L, r = GASKET_R, depths = GASKET_DEPTHS) {
  const h = roundHalfToEven(L * Math.sqrt(3) / 2);
  const a = [Math.floor(size / 2), Math.floor(size / 2) - Math.floor((2 * h) / 3)];
  const b = [Math.floor(size / 2) - Math.floor(L / 2), Math.floor(size / 2) + Math.floor(h / 3)];
  const c = [Math.floor(size / 2) + Math.floor(L / 2), Math.floor(size / 2) + Math.floor(h / 3)];
  const pts = new Map();

  function rec(p, q, rd, depth) {
    for (const v of [p, q, rd]) {
      const key = v[0] + ',' + v[1];
      if (!pts.has(key) || depth < pts.get(key)) pts.set(key, depth);
    }
    if (depth >= depths) return;
    const pq = mid(p, q);
    const qr = mid(q, rd);
    const rp = mid(rd, p);
    rec(p, pq, rp, depth + 1);
    rec(pq, q, qr, depth + 1);
    rec(rp, qr, rd, depth + 1);
  }

  rec(a, b, c, 1);
  const out = [];
  for (const [key] of pts) {
    const [x, y] = key.split(',').map(Number);
    out.push([x, y, r]);
  }
  return out;
}

/** Triangular-lattice patch: rows of [3, 4, 5, 4, 3] droplets (verbatim). */
export function genTri(size) {
  const disks = [];
  for (let i = 0; i < TRI_ROWS.length; i++) {
    const n = TRI_ROWS[i];
    const y = Math.floor(size / 2) + (i - 2) * TRI_DY;
    const x0 = Math.floor(size / 2) - (n - 1) * Math.floor(TRI_A / 2);
    for (let j = 0; j < n; j++) disks.push([x0 + j * TRI_A, y, TRI_R]);
  }
  return disks;
}

export function goldRender(name) {
  if (name === 'gasket') return renderDisks(SIZE, genGasket(SIZE));
  if (name === 'tri') return renderDisks(SIZE, genTri(SIZE));
  throw new Error("gold_render: unknown render " + JSON.stringify(name));
}

// ---------------------------------------------------------------------------
// coordinate warps
// ---------------------------------------------------------------------------

/** Pinned rounding rule: floor(v + 0.5) (JS Math.round half-up). */
export function nint(v) {
  return Math.floor(v + 0.5);
}

/** Coefficient envelope guard (Python ValueError messages mirrored). */
export function checkCoef(mode, c) {
  if (mode === 'astig') {
    if (!(-MAX_ASTIG <= c && c <= MAX_ASTIG)) {
      throw new Error('astig coefficient ' + String(c) + ' outside pinned envelope');
    }
  } else if (mode === 'spherical') {
    if (!(-MAX_SPHERICAL <= c && c <= MAX_SPHERICAL)) {
      throw new Error('spherical coefficient ' + String(c) + ' outside pinned envelope');
    }
  } else if (mode === 'trefoil') {
    if (!(-MAX_TREFOIL <= c && c <= MAX_TREFOIL)) {
      throw new Error('trefoil coefficient ' + String(c) + ' outside pinned envelope');
    }
  } else {
    throw new Error('warp: unknown mode ' + JSON.stringify(mode));
  }
}

/** Pinned expansive zoom floor: beta(t) = K|t| / (1 - K|t|), beta(0) = 0. */
export function trefoilBeta(t) {
  const at = Math.abs(t);
  if (at === 0.0) return 0.0;
  return (TREFOIL_ZOOM_K * at) / (1.0 - TREFOIL_ZOOM_K * at);
}

/**
 * Continuous forward warp of a centered coordinate. Returns [dx', dy'].
 * Expression order mirrors _forward_point exactly (left-associative).
 */
function forwardPoint(mode, c, dx, dy) {
  if (mode === 'astig') return [(1.0 + c) * dx, (1.0 + ASTIG_KAPPA * c) * dy];
  if (mode === 'spherical') {
    const r = Math.hypot(dx, dy);
    const g = 1.0 + (c * (r * r)) / R2;
    return [g * dx, g * dy];
  }
  if (mode === 'trefoil') {
    const sx = dx + c * (dy * dy - dx * dx);
    const sy = dy + 2.0 * c * dx * dy;
    const z = 1.0 + trefoilBeta(c);
    return [z * sx, z * sy];
  }
  throw new Error('warp: unknown mode ' + JSON.stringify(mode));
}

/**
 * Continuous inverse warp of a centered coordinate (the powered lens).
 * astig: analytic. spherical: fixed-count Newton (monotone for |s| < 1/3).
 * trefoil: un-zoom analytically, then a fixed-count 2x2 Newton.
 */
function inversePoint(mode, c, dx, dy) {
  if (mode === 'astig') return [dx / (1.0 + c), dy / (1.0 + ASTIG_KAPPA * c)];
  if (mode === 'spherical') {
    const r = Math.hypot(dx, dy);
    if (r === 0.0) return [0.0, 0.0];
    let u = r;
    for (let i = 0; i < SPHERICAL_INVERSE_STEPS; i++) {
      const fp = 1.0 + ((3.0 * c * u * u) / R2);
      if (fp === 0.0) break; // guarded; unreachable for |s| < 1/3
      u = u - (u + ((c * u * u * u) / R2) - r) / fp;
    }
    const k = u / r;
    return [dx * k, dy * k];
  }
  if (mode === 'trefoil') {
    const z = 1.0 + trefoilBeta(c);
    const qx = dx / z;
    const qy = dy / z;
    let a = qx;
    let b = qy;
    for (let i = 0; i < TREFOIL_INVERSE_STEPS; i++) {
      const f1 = a - c * (a * a - b * b) - qx;
      const f2 = b + 2.0 * c * a * b - qy;
      const j11 = 1.0 - 2.0 * c * a;
      const j12 = 2.0 * c * b;
      const j21 = 2.0 * c * b;
      const j22 = 1.0 + 2.0 * c * a;
      const det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-9) {
        throw new Error('trefoil inverse: Jacobian collapsed ' +
          '(|t| outside the pinned envelope?)');
      }
      a -= ((f1 * j22 - f2 * j12) / det);
      b -= ((f2 * j11 - f1 * j21) / det);
    }
    return [a, b];
  }
  throw new Error('warp: unknown mode ' + JSON.stringify(mode));
}

/**
 * Forward-map every ink pixel through the warp and re-rasterize.
 * Rounding rule (pinned): nint = floor(v + 0.5); out-of-canvas destinations
 * dropped; sources visited row-major so collisions are deterministic.
 * Returns a NEW mask (rows of 0/255).
 */
export function warpMask(rows, mode, coef, inverse = false) {
  checkCoef(mode, coef);
  const h = rows.length;
  const w = rows[0].length;
  const cx = (w - 1) / 2.0;
  const cy = (h - 1) / 2.0;
  const pt = inverse ? inversePoint : forwardPoint;
  const out = [];
  for (let y = 0; y < h; y++) out.push(new Array(w).fill(0));
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const v = row[x];
      if (v) {
        const dx = x - cx;
        const dy = y - cy;
        const [ux, uy] = pt(mode, coef, dx, dy);
        const px = nint(cx + ux);
        const py = nint(cy + uy);
        if (px >= 0 && px < w && py >= 0 && py < h) out[py][px] = v;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// estimators
// ---------------------------------------------------------------------------

/**
 * One pass over the ink: the raw/central moment sums the astig and spherical
 * estimators need (pinned center CX = CY = (w-1)/2). Accumulation order is
 * the parity contract (see header).
 */
export function momentSums(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const cx = (w - 1) / 2.0;
  const cy = (h - 1) / 2.0;
  let n = 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0;
  let sr2 = 0, sr4 = 0, sr6 = 0;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      if (row[x]) {
        const dx = x - cx;
        const dy = y - cy;
        n += 1;
        sx += dx;
        sy += dy;
        sxx += dx * dx;
        syy += dy * dy;
        const r2 = dx * dx + dy * dy;
        sr2 += r2;
        const r4 = r2 * r2;
        sr4 += r4;
        sr6 += r4 * r2;
      }
    }
  }
  return { n, sx, sy, sxx, syy, sr2, sr4, sr6 };
}

/**
 * Third-complex-moment sums over the ink (pinned center), the exact
 * coefficients of the shear's cubic identity:
 *   chi3 = sum z^3, s4 = sum |z|^4, szcz4 = sum z conj(z)^4, scz6 = sum conj(z)^6
 * Complex values are [re, im] pairs; multiplication order mirrors Python.
 */
export function trefoilMomentSums(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const cx = (w - 1) / 2.0;
  const cy = (h - 1) / 2.0;
  let chi3x = 0, chi3y = 0;
  let s4 = 0;
  let szcz4x = 0, szcz4y = 0;
  let scz6x = 0, scz6y = 0;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      if (row[x]) {
        const dx = x - cx;
        const dy = y - cy;
        const r2 = dx * dx + dy * dy;
        // z = dx + i dy ; zc = dx - i dy
        // zc2 = zc*zc ; zc4 = zc2*zc2
        const zc2x = dx * dx - (-dy) * (-dy);
        const zc2y = dx * (-dy) + (-dy) * dx;
        const zc4x = zc2x * zc2x - zc2y * zc2y;
        const zc4y = zc2x * zc2y + zc2y * zc2x;
        // chi3 += (z*z)*z
        const zzx = dx * dx - dy * dy;
        const zzy = dx * dy + dy * dx;
        chi3x += zzx * dx - zzy * dy;
        chi3y += zzx * dy + zzy * dx;
        s4 += r2 * r2;
        // szcz4 += z * zc4
        szcz4x += dx * zc4x - dy * zc4y;
        szcz4y += dx * zc4y + dy * zc4x;
        // scz6 += zc4 * zc2
        scz6x += zc4x * zc2x - zc4y * zc2y;
        scz6y += zc4x * zc2y + zc4y * zc2x;
      }
    }
  }
  return {
    chi3: [chi3x, chi3y], s4,
    szcz4: [szcz4x, szcz4y], scz6: [scz6x, scz6y],
  };
}

/** Astig: exact affine-transform algebra on central second moments. */
export function estAstig(mr, mo) {
  const n0 = mr.n, n1 = mo.n;
  if (n0 === 0 || n1 === 0) throw new Error('astig estimator: no ink');
  const mu20_0 = mr.sxx - (mr.sx * mr.sx) / n0;
  const mu02_0 = mr.syy - (mr.sy * mr.sy) / n0;
  const mu20_1 = mo.sxx - (mo.sx * mo.sx) / n1;
  const mu02_1 = mo.syy - (mo.sy * mo.sy) / n1;
  if (mu02_0 <= 0.0 || mu02_1 <= 0.0) {
    throw new Error('astig estimator: degenerate mu02 (ink on a line?)');
  }
  const big = (mu20_1 / mu02_1) / (mu20_0 / mu02_0);
  if (big <= 0.0) throw new Error('astig estimator: non-positive moment ratio');
  const den = 2.0 - big / 2.0;
  if (Math.abs(den) < 1e-9) {
    throw new Error('astig estimator: degenerate solve (R ~ 4)');
  }
  return ((big - 2.0) + Math.sqrt(big)) / den;
}

/** Spherical: exact quadratic in s on raw radial moments. */
export function estSpherical(mr, mo) {
  if (mr.n === 0 || mo.n === 0) throw new Error('spherical estimator: no ink');
  const a = mr.sr6 / (R2 * R2);
  const b = (2.0 * mr.sr4) / R2;
  const c = mr.sr2 - mo.sr2;
  let disc = b * b - 4.0 * a * c;
  if (disc < 0.0) disc = 0.0; // rasterization can push it microscopically negative
  const sq = Math.sqrt(disc);
  const r_lo = (-b - sq) / (2.0 * a);
  const r_hi = (-b + sq) / (2.0 * a);
  // smaller |s| wins; exact tie keeps the '-' branch (documented rule)
  return Math.abs(r_lo) <= Math.abs(r_hi) ? r_lo : r_hi;
}

/**
 * Trefoil: fixed-6-step Newton on g(t) = |f(t)|^2 with
 *   f(t) = (1+beta)^3 P(t) - chi3_obs,
 *   P(t) = chi3 + c1 t + c2 t^2 + c3 t^3,
 *   c1 = -3 sum |z|^4, c2 = 3 sum z conj(z)^4, c3 = -sum conj(z)^6,
 *   g'(t) = 2 Re(f'(t) conj(f(t))).
 * |f|^2 (not a single real/imag channel) because the channel content is
 * render-dependent. At t = 0 with an un-aberrated mask f(0) = 0 exactly, so
 * every step is a no-op -> est = 0.0 exactly (idempotence).
 */
export function estTrefoil(mr, mo) {
  const chix = mr.chi3[0], chiy = mr.chi3[1];
  const c1 = -3.0 * mr.s4;                       // real
  const c2x = 3.0 * mr.szcz4[0], c2y = 3.0 * mr.szcz4[1];
  const c3x = -mr.scz6[0], c3y = -mr.scz6[1];
  const chiObsX = mo.chi3[0], chiObsY = mo.chi3[1];
  const k = TREFOIL_ZOOM_K;
  let t = 0.0;
  for (let i = 0; i < EST_NEWTON_STEPS; i++) {
    const at = Math.abs(t);
    const b = at === 0.0 ? 0.0 : (k * at) / (1.0 - k * at);
    const oneB3 = Math.pow(1.0 + b, 3);
    // p = chi + t * (c1 + t * (c2 + t * c3))          (complex)
    const tC3x = t * c3x, tC3y = t * c3y;
    const c2pC3x = c2x + tC3x, c2pC3y = c2y + tC3y;
    const tInnerx = t * c2pC3x, tInnery = t * c2pC3y;
    const c1pX = c1 + tInnerx, c1pY = tInnery;
    const tOuterx = t * c1pX, tOutery = t * c1pY;
    const px = chix + tOuterx, py = chiy + tOutery;
    // dp = c1 + t * (2.0 * c2 + 3.0 * t * c3)          (complex)
    //   left-assoc: 3.0 * t * c3 == ((3.0*t) * c3) — scalar*complex
    const dpx = c1 + t * (2.0 * c2x + (3.0 * t) * c3x);
    const dpy = t * (2.0 * c2y + (3.0 * t) * c3y);
    // dbeta/dt = K*sign(t)/(1-K|t|)^2, sign(0) := +1 (documented rule)
    const den2 = Math.pow(1.0 - k * at, 2);
    const db = t >= 0.0 ? k / den2 : -(k / den2);
    // f = one_b3 * p - chi_obs                          (complex)
    const fx = oneB3 * px - chiObsX;
    const fy = oneB3 * py - chiObsY;
    if (fx === 0 && fy === 0) break; // exact root (idempotence path)
    // df = 3.0 * (1+b)**2 * db * p + one_b3 * dp
    const s = 3.0 * Math.pow(1.0 + b, 2) * db;
    const dfx = s * px + oneB3 * dpx;
    const dfy = s * py + oneB3 * dpy;
    // g = (conj(f) * f).real ; dg = 2.0 * (df * conj(f)).real
    const g = fx * fx + fy * fy;
    const dg = 2.0 * (dfx * fx + dfy * fy);
    if (Math.abs(dg) < 1e-30) break;
    t = t - g / dg;
  }
  return t;
}

/** The closed-form / fixed-iteration core estimate (no model evaluation). */
export function algebraicEstimate(mode, refRows, obsRows) {
  if (mode === 'astig') return estAstig(momentSums(refRows), momentSums(obsRows));
  if (mode === 'spherical') return estSpherical(momentSums(refRows), momentSums(obsRows));
  if (mode === 'trefoil') {
    return estTrefoil(trefoilMomentSums(refRows), trefoilMomentSums(obsRows));
  }
  throw new Error('estimate_coefficient: unknown mode ' + JSON.stringify(mode));
}

/**
 * Estimate ONE mode coefficient from the observed mask against the
 * pre-registered reference mask. Closed-form moment algebra + a pinned
 * TWO-step predictor-corrector against the deterministic forward model
 * (same rasterization rule). Never sees the true coefficient. Throws on
 * no ink.
 */
export function estimateCoefficient(mode, refRows, obsRows) {
  let t = algebraicEstimate(mode, refRows, obsRows);
  for (let i = 0; i < EST_CORRECTOR_STEPS; i++) {
    const model = warpMask(refRows, mode, t, false);
    const c = algebraicEstimate(mode, model, obsRows);
    t = t + c; // first-order composition
  }
  return t;
}

// ---------------------------------------------------------------------------
// measurement (delegates to the edge-standard-v1 port — never reimplemented)
// ---------------------------------------------------------------------------

/** Full edge-standard-v1 pipeline + box-counting D on the traced contours. */
export function measureD(rows) {
  const h = rows.length;
  const w = rows[0].length;
  let ink = 0;
  for (const row of rows) for (const v of row) if (v) ink += 1;
  if (ink === 0) throw new Error('measure_D: no ink');
  const gray = new Uint8Array(w * h);
  let i = 0;
  for (const row of rows) for (const v of row) gray[i++] = v ? 255 : 0;
  const st = standardize(gray, w, h);
  const m = measure(st.grid);
  return {
    D: m.D,
    r2: m.r2,
    threshold: st.meta.chosen_threshold,
    coverage: st.meta.achieved_coverage,
    n_components_traced: st.meta.n_components_traced,
    traced_pixels: st.meta.traced_pixels,
  };
}

// ---------------------------------------------------------------------------
// correct loop (the powered lens: measure -> inject -> estimate -> correct)
// ---------------------------------------------------------------------------

/**
 * The powered-lens loop. Returns {render, mode, coefficients_true,
 * coefficients_est, estimation_errors, d_ref, d_aberrated, d_corrected,
 * recovered, monotone, roundtrip_recovery, sha_ref, sha_aberrated,
 * sha_corrected, detail{ref, aberrated, corrected}} — the same key set as
 * Python correct_loop.
 */
export function correctLoop(refRows, mode, coef, render = '?') {
  const dRef = measureD(refRows);
  const ab = warpMask(refRows, mode, coef, false);
  const dAb = measureD(ab);
  const est = estimateCoefficient(mode, refRows, ab);
  const corr = warpMask(ab, mode, est, true);
  const dCorr = measureD(corr);

  // Diagnostic (not gated): roundtrip pixel recovery with the TRUE inverse.
  const rt = warpMask(ab, mode, coef, true);
  let recoveredPx = 0;
  let refInk = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (refRows[y][x]) {
        refInk += 1;
        if (rt[y][x]) recoveredPx += 1;
      }
    }
  }
  const roundtrip = refInk ? recoveredPx / refInk : 0.0;

  const da = Math.abs(dAb.D - dRef.D);
  const dc = Math.abs(dCorr.D - dRef.D);
  const out = {
    render,
    mode,
    coefficients_true: {},
    coefficients_est: {},
    estimation_errors: {},
  };
  out.coefficients_true[mode] = coef;
  out.coefficients_est[mode] = est;
  out.estimation_errors[mode] = est - coef;
  out.d_ref = dRef.D;
  out.d_aberrated = dAb.D;
  out.d_corrected = dCorr.D;
  out.recovered = dc <= D_BAND;
  out.monotone = da > dc;
  out.roundtrip_recovery = roundtrip;
  out.sha_ref = maskSha256(refRows);
  out.sha_aberrated = maskSha256(ab);
  out.sha_corrected = maskSha256(corr);
  out.detail = { ref: dRef, aberrated: dAb, corrected: dCorr };
  return out;
}
