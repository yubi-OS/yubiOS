// jev-taste-math.js — pure, deterministic ES-module taste math for SPEC-TASTE.
// No imports, no env access, Workers-compatible (plain ES module).
//
// Semantics mirror the Python source of record (extractor.py):
//  - box counting: 8 log-spaced scales from minBox..maxBox (round + dedupe + clamp),
//    box index floor(coord / s) anchored at grid origin, least-squares regression of
//    log(N) vs log(1/s); D = slope (positive convention), r2 = coefficient of determination.
//  - symmetry: mismatch = on-pixels whose mirror partner is off (each pair counted once);
//    score = 1 - mismatch / max(on, 1); axes tried in order vertical, horizontal, diag1
//    (transpose), diag2 (anti-transpose, square grids only); ties broken by that order.
//  - hysteresis: p >= high -> 1/'on'; p <= low -> 0/'off'; else carried from pre_row
//    ('carried'); else 'ambiguous' with fallback row = (p >= 0.5 ? 1 : 0).
//  - tasteQuestions: measured numbers are embedded into fixed instruction templates
//    (fmt() below: integers verbatim, non-integers rounded to 4 decimals, trailing
//    zeros trimmed). Axes with missing features are skipped.

/**
 * Decode a base64-encoded bitmap. The b64 payload is UTF-8 ASCII art: each pixel is
 * the character '0' or '1', rows separated by '\n'. Returns grid: number[][] of 0/1
 * rows (1 = ink).
 */
export function decodeBitmap(b64) {
  if (typeof b64 !== 'string') throw new Error('decodeBitmap: b64 must be a string');
  const text = b64ToAscii(b64);
  const rows = text.split('\n');
  const grid = [];
  for (const row of rows) {
    if (row.length === 0) continue; // tolerate trailing newline
    const cells = [];
    for (const ch of row) {
      if (ch === '0') cells.push(0);
      else if (ch === '1') cells.push(1);
      else throw new Error('decodeBitmap: unexpected character ' + JSON.stringify(ch));
    }
    grid.push(cells);
  }
  if (grid.length === 0) throw new Error('empty edge map');
  return grid;
}

/** Encode a grid back to the documented bitmap format (test/round-trip helper; pure). */
export function encodeBitmap(grid) {
  return asciiToB64(grid.map((row) => row.join('')).join('\n'));
}

function b64ToAscii(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let bits = 0;
  let nbits = 0;
  for (const ch of b64) {
    if (ch === '=' || ch === '\n' || ch === '\r') continue;
    const v = chars.indexOf(ch);
    if (v < 0) throw new Error('decodeBitmap: invalid base64 character');
    bits = (bits << 6) | v;
    nbits += 6;
    while (nbits >= 8) {
      nbits -= 8;
      out += String.fromCharCode((bits >> nbits) & 0xff);
    }
  }
  return out;
}

function asciiToB64(text) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  while (i < text.length) {
    const b0 = text.charCodeAt(i++);
    const b1 = i < text.length ? text.charCodeAt(i++) : NaN;
    const b2 = i < text.length ? text.charCodeAt(i++) : NaN;
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
    out += isNaN(b1) ? '=' : chars[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
    out += isNaN(b2) ? '=' : chars[b2 & 63];
  }
  return out;
}

/** Collect occupied-box counts for box sizes [s1..s2] over the whole grid. */
function countBoxes(grid, s) {
  const occupied = new Set();
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    const by = Math.floor(y / s);
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 1) occupied.add(by * 100000 + Math.floor(x / s));
    }
  }
  return occupied.size;
}

function inkCount(grid) {
  let n = 0;
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) if (row[x] === 1) n++;
  }
  return n;
}

/** 8 log-spaced box sizes from minBox..maxBox, rounded, deduped ascending, clamped. */
function logScales(minBox, maxBox, nScales) {
  const raw = [];
  for (let i = 0; i < nScales; i++) {
    let s = Math.round(minBox * Math.pow(maxBox / minBox, i / (nScales - 1)));
    if (s < minBox) s = minBox;
    if (s > maxBox) s = maxBox;
    raw.push(s);
  }
  raw.sort((a, b) => a - b);
  const out = [];
  for (const s of raw) if (out.length === 0 || out[out.length - 1] !== s) out.push(s);
  return out;
}

/** Least squares y = a + b x; returns {slope, r2} (r2 = correlation^2). */
function regress(xs, ys) {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i];
    sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i];
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx === 0 || vy === 0) return { slope: 0, r2: 0 }; // degenerate (constant series)
  const slope = cov / vx;
  const r = cov / Math.sqrt(vx * vy);
  return { slope, r2: r * r };
}

/**
 * Box-counting fractal dimension. grid = number[][] of 0/1 (1 = ink).
 * Empty grid (no ink) throws Error("empty edge map").
 */
export function boxCountingDim(grid, minBox = 2, maxBox = 64, nScales = 8) {
  if (inkCount(grid) === 0) throw new Error('empty edge map');
  const scales = logScales(minBox, maxBox, nScales);
  const counts = [];
  for (const s of scales) counts.push(countBoxes(grid, s));
  const xs = scales.map((s) => Math.log(1 / s));
  const ys = counts.map((c) => Math.log(c));
  const { slope, r2 } = regress(xs, ys);
  return { D: slope, r2, scales, counts, n_scales: scales.length };
}

/**
 * Mirror-symmetry score. Axes tried in order: vertical, horizontal, diag1 (transpose),
 * diag2 (anti-transpose). Diagonal axes only apply to square grids. Ties broken by
 * trial order. Returns {score, axis}.
 */
export function mirrorSymmetryScore(grid) {
  const H = grid.length;
  const W = grid[0].length;
  const square = W === H;
  const axes = ['vertical', 'horizontal'];
  if (square) axes.push('diag1', 'diag2');

  const mirror = {
    vertical: (x, y) => [W - 1 - x, y],
    horizontal: (x, y) => [x, H - 1 - y],
    diag1: (x, y) => [y, x],
    diag2: (x, y) => [H - 1 - y, W - 1 - x],
  };

  const on = inkCount(grid);
  let bestAxis = axes[0];
  let bestScore = -Infinity;
  for (const axis of axes) {
    const m = mirror[axis];
    let mismatch = 0;
    for (let y = 0; y < H; y++) {
      const row = grid[y];
      for (let x = 0; x < W; x++) {
        if (row[x] === 1) {
          const [mx, my] = m(x, y);
          if (grid[my][mx] !== 1) mismatch++;
        }
      }
    }
    const score = 1 - mismatch / Math.max(on, 1);
    if (score > bestScore + 1e-12) {
      bestScore = score;
      bestAxis = axis;
    }
  }
  return { score: bestScore, axis: bestAxis };
}

/**
 * Scale coherence: fractal dimension over the lower half vs upper half of the
 * scale window (8 log-spaced scales from minBox..maxBox; d_low = slope over scales
 * 0..3, d_high = slope over scales 4..7). coherence = 1 - |d_low - d_high|.
 */
export function scaleCoherence(grid, minBox = 4, maxBox = 64) {
  if (inkCount(grid) === 0) throw new Error('empty edge map');
  const scales = logScales(minBox, maxBox, 8);
  const counts = scales.map((s) => countBoxes(grid, s));
  const xs = scales.map((s) => Math.log(1 / s));
  const ys = counts.map((c) => Math.log(c));
  const half = Math.floor(scales.length / 2);
  const d_low = regress(xs.slice(0, half), ys.slice(0, half)).slope;
  const d_high = regress(xs.slice(half), ys.slice(half)).slope;
  return { d_low, d_high, coherence: 1 - Math.abs(d_low - d_high) };
}

function fmt(n) {
  if (typeof n === 'string') return n; // e.g. sv_balance.fn
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  if (Number.isInteger(n)) return n.toFixed(3); // e.g. score 1 -> '1.000' (bare integers confused clef on the symmetry band question, live-verified 2026-10-05)
  return String(Number(n.toFixed(4)));
}

const FAMILY_CHOICES = ['tree', 'river_network', 'honeycomb', 'coral', 'lattice', 'random'];

const TEMPLATES = {
  fractal_band:
    'An edge map of a rendered artifact has box-counting fractal dimension D = {D}. ' +
    'Empirical aesthetics finds human preference for natural-looking statistical ' +
    'fractals peaks at D between 1.3 and 1.5. Is this measured D within that preferred band?',
  symmetry_present:
    'A structure has measured mirror-symmetry score {score} (0 = random, 1 = perfectly ' +
    'symmetric). Is the structure strongly symmetric (score at least 0.6)?',
  symmetry_variation:
    'A structure has measured mirror-symmetry score {score} (0 = random, 1 = perfectly ' +
    'symmetric). Does it show symmetry WITH controlled local variation (score between ' +
    '0.3 and 0.95, rather than sterile perfection)?',
  scale_coherence:
    'A structure has fractal dimension {d_low} measured at fine scales and {d_high} at ' +
    'coarse scales. Is the structure self-similar across scales (difference at most 0.15)?',
  branch_exponent:
    'A branching network has fitted radius exponent gamma = {gamma} in r0^gamma = sum of ' +
    "daughter radii^gamma. Biological transport networks fall in the band 2 to 3. " +
    'Is gamma within that band?',
  sv_balance:
    "A design has surface-area-to-volume ratio {ratio} for the function '{fn}'. " +
    'Is this ratio plausible for that function in living systems?',
  complexity_economy:
    'A structure compresses with slope {slope} across scales (structure concentrated in ' +
    'few rules). Does it show complexity under constraint (slope at least 0.5)?',
};

const REQUIRED_FIELDS = {
  fractal_band: ['D', 'r2'],
  symmetry_present: ['score'],
  symmetry_variation: ['score'],
  scale_coherence: ['d_low', 'd_high'],
  branch_exponent: ['gamma'],
  sv_balance: ['ratio', 'fn'],
  complexity_economy: ['slope'],
};

function render(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => fmt(values[key]));
}

/**
 * Build taste questions. features: map axis -> measured values (see REQUIRED_FIELDS),
 * plus optional features.family_description (string). axes: subset list of axis names.
 * Axes whose features are missing/undefined are skipped. Family question (type
 * 'choice') is emitted only when features.family_description is present.
 * Returns {questions: {name: {instructions, type[, choices]}}, order: [names]}.
 */
export function tasteQuestions(features, axes) {
  const questions = {};
  const order = [];
  for (const axis of axes) {
    if (axis === 'family') {
      if (typeof features.family_description === 'string' && features.family_description.length > 0) {
        questions.family = {
          instructions: 'Which natural system family does this structure most resemble?',
          type: 'choice',
          criteria: {
            tree: 'a branching structure with trunk-like parent-to-daughter radius scaling',
            river_network: 'a dendritic drainage or transport network',
            honeycomb: 'a dense hexagonal or cellular packing',
            coral: 'an accretionary, porous biological growth form',
            lattice: 'a regular geometric grid or crystal-like structure',
            random: 'no recognizable organizing rule',
          },
        };
        order.push('family');
      }
      continue;
    }
    const vals = features[axis];
    const required = REQUIRED_FIELDS[axis];
    if (!vals || !required) continue;
    const missing = required.some((f) => vals[f] === undefined || vals[f] === null);
    if (missing) continue;
    questions[axis] = { instructions: render(TEMPLATES[axis], vals), type: 'noul' };
    order.push(axis);
  }
  return { questions, order };
}

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic permutation of `names` from an integer seed (mulberry32 + Fisher-Yates). */
export function permuteOrder(names, seed) {
  const out = names.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Hysteresis binarization. probs = {axis: p}; hysteresis = {low, high, pre_row} or null.
 * pre_row maps axis -> 0|1 (an array is also accepted; membership means 1).
 * p >= high -> row 1, 'on'; p <= low -> row 0, 'off'; else if pre_row has the axis ->
 * carry its value, 'carried'; else 'ambiguous' with fallback row = (p >= 0.5 ? 1 : 0).
 * hysteresis === null disables the window entirely: every axis falls through to the
 * documented fallback (row = p >= 0.5, verdict 'ambiguous').
 */
export function applyHysteresis(probs, hysteresis) {
  const rows = {};
  const verdicts = {};
  const hasPre = (axis) => {
    if (!hysteresis || !hysteresis.pre_row) return false;
    const pr = hysteresis.pre_row;
    if (Array.isArray(pr)) return pr.indexOf(axis) !== -1;
    return Object.prototype.hasOwnProperty.call(pr, axis);
  };
  const preValue = (axis) => {
    const pr = hysteresis.pre_row;
    return Array.isArray(pr) ? 1 : pr[axis];
  };
  for (const axis of Object.keys(probs)) {
    const p = probs[axis];
    if (hysteresis && p >= hysteresis.high) {
      rows[axis] = 1;
      verdicts[axis] = 'on';
    } else if (hysteresis && p <= hysteresis.low) {
      rows[axis] = 0;
      verdicts[axis] = 'off';
    } else if (hasPre(axis)) {
      rows[axis] = preValue(axis);
      verdicts[axis] = 'carried';
    } else {
      rows[axis] = p >= 0.5 ? 1 : 0;
      verdicts[axis] = 'ambiguous';
    }
  }
  return { rows, verdicts };
}
