// jev-edge-standard.js — edge-standard-v1 pipeline (SPEC-EDGE-STANDARD-2026-10-05).
// JS worker port of the Python source of record (Lane A, edge_standard.py).
//
// Pure, deterministic ES module. No node imports, no env access, no randomness —
// Cloudflare-Workers-compatible. Exports:
//   thresholdForCoverage(gray, w, h, target = 0.06)
//   traceContours(mask, w, h, minComponent = 12)
//   standardize(grayBytes, w, h)
//   measure(grid, minBox = 4, maxBox = 64, nScales = 8)
//
// Pipeline (pinned, stage order = spec step order; any change is a major bump):
//   1. resize: if w>512 or h>512, box-average downsample to fit 512 keeping aspect
//      (scale = 512/max(w,h); out dims floor(w*scale), floor(h*scale); each output
//      pixel = the IEEE-double MEAN of its source box — NO rounding; the
//      `mean >= t` threshold comparison is exact).
//   2. threshold selection: sweep t over 0..255; coverage(t) = frac(gray >= t);
//      pick t minimizing |coverage - 0.06|, ties -> smaller t.
//   3. ink mask: gray >= chosen_threshold.
//   4. contour trace: 4-connectivity labeling in row-major scan order; per component,
//      Moore-neighborhood OUTER boundary trace (see NOTES.md for the exact convention);
//      paint boundary pixels (1 px) on a blank grid; drop components with fewer than
//      minComponent traced boundary pixels.
//   5. measure: thin wrapper over boxCountingDim from jev-taste-math.js.

import { boxCountingDim } from './jev-taste-math.js';

export const EDGE_STANDARD_PIPELINE = 'edge-standard-v1';
export const TARGET_COVERAGE = 0.06;
export const MIN_COMPONENT = 12;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Accept a 2D array (grid[y][x]) or a flat w*h array; return a flat array. */
function toFlat(mask, w, h) {
  if (Array.isArray(mask) && Array.isArray(mask[0])) {
    if (mask.length !== h) {
      throw new Error('traceContours: mask row count ' + mask.length + ' != h ' + h);
    }
    const flat = new Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = mask[y];
      if (row.length !== w) {
        throw new Error('traceContours: mask row ' + y + ' length ' + row.length + ' != w ' + w);
      }
      for (let x = 0; x < w; x++) flat[y * w + x] = row[x];
    }
    return flat;
  }
  if (mask.length !== w * h) {
    throw new Error('traceContours: flat mask length ' + mask.length + ' != w*h ' + w * h);
  }
  return mask;
}

// Moore-neighborhood ring in CLOCKWISE screen order (y grows downward), starting
// at WEST: W, NW, N, NE, E, SE, S, SW. Index arithmetic wraps modulo 8, so
// scanning "clockwise starting from X" is: idx = (dirIndexOf(X) + k) % 8, k=1..8.
const DIRS = [
  [-1, 0],  // 0 W
  [-1, -1], // 1 NW
  [0, -1],  // 2 N
  [1, -1],  // 3 NE
  [1, 0],   // 4 E
  [1, 1],   // 5 SE
  [0, 1],   // 6 S
  [-1, 1],  // 7 SW
];

function dirIndexOf(dx, dy) {
  for (let i = 0; i < 8; i++) if (DIRS[i][0] === dx && DIRS[i][1] === dy) return i;
  return -1;
}

// ---------------------------------------------------------------------------
// stage 2 — threshold selection (ink normalization)
// ---------------------------------------------------------------------------

/**
 * Sweep candidate thresholds t over the 256 gray levels; for each, coverage(t) =
 * fraction of pixels with gray >= t; pick the t minimizing |coverage - target|,
 * ties -> smaller t. `gray` is a flat array (or Uint8Array) of w*h byte values.
 * Returns { chosen_threshold, achieved_coverage }.
 */
export function thresholdForCoverage(gray, w, h, target = TARGET_COVERAGE) {
  const n = w * h;
  if (gray.length !== n) {
    throw new Error('thresholdForCoverage: gray length ' + gray.length + ' != w*h ' + n);
  }
  // SEAM FIX (advisor): the Python source of record sorts the values and uses
  // bisect_left, which also supports the FRACTIONAL box-average means produced
  // by the resize stage (a 256-bin histogram cannot key 12.5 and would yield
  // NaN counts). Mirrored exactly: numeric sort, bisect_left per t,
  // cov = (n - idx) / n; strict < while ascending keeps the smallest t on ties.
  const vals = Array.from(gray);
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    if (v < 0 || v > 255) throw new Error('thresholdForCoverage: gray value out of range: ' + v);
  }
  vals.sort((a, b) => a - b);
  const bisectLeft = (t) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vals[mid] < t) lo = mid + 1; else hi = mid;
    }
    return lo;
  };
  let bestT = 0;
  let bestDev = Infinity;
  let bestCov = 0;
  for (let t = 0; t <= 255; t++) {
    const cov = (n - bisectLeft(t)) / n;
    const dev = Math.abs(cov - target);
    if (dev < bestDev) { // strict < keeps the smallest t on ties
      bestDev = dev;
      bestT = t;
      bestCov = cov;
    }
  }
  return { chosen_threshold: bestT, achieved_coverage: bestCov };
}

// ---------------------------------------------------------------------------
// stage 4 — contour trace
// ---------------------------------------------------------------------------

/**
 * 4-connectivity component labeling in row-major scan order, then per component a
 * Moore-neighborhood OUTER boundary trace; boundary pixels (1 px) are painted on a
 * blank grid; components with fewer than minComponent traced pixels are dropped.
 * `mask` is a 2D array (grid[y][x]) or a flat w*h array of 0/1.
 * Returns { grid, n_components_traced, traced_pixels }.
 *
 * Tracing convention (pinned to Lane A's edge_standard.py; full details in
 * Lane A NOTES.md §"Contour tracing conventions"):
 *   - start s = first ink pixel of the component in row-major order;
 *   - backtrack of s = its WEST neighbor (background by construction: no component
 *     pixel exists in an earlier row or to the left of s in its row);
 *   - at each current pixel c, scan the 8 neighbors CLOCKWISE beginning at the
 *     neighbor immediately clockwise-after the BACKTRACK b (the pixel we arrived
 *     from); step to the first component pixel found; the old current pixel c
 *     becomes the new backtrack;
 *   - stop (Jacob-style) when the start pixel is re-entered with an entry
 *     direction that was already recorded, or after 4*w*h steps (cap).
 * Off-grid neighbors are background. Only pixels of the component being traced
 * count as ink (labels are compared), so diagonal-touching neighbors from other
 * components cannot hijack a trace.
 */
export function traceContours(mask, w, h, minComponent = MIN_COMPONENT) {
  const flat = toFlat(mask, w, h);
  const n = w * h;
  const labels = new Int32Array(n); // 0 = unlabeled; labels are 1-based
  const starts = []; // first row-major pixel index per label
  let nLabels = 0;
  const queue = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    if (flat[i] !== 0 && flat[i] !== 1) {
      throw new Error('traceContours: mask values must be 0/1, saw ' + flat[i]);
    }
    if (flat[i] === 1 && labels[i] === 0) {
      nLabels++;
      labels[i] = nLabels;
      starts.push(i);
      let head = 0;
      queue[0] = i;
      let tail = 1;
      while (head < tail) {
        const cur = queue[head++];
        const x = cur % w;
        const y = (cur - x) / w;
        if (x > 0 && flat[cur - 1] === 1 && labels[cur - 1] === 0) {
          labels[cur - 1] = nLabels; queue[tail++] = cur - 1;
        }
        if (x < w - 1 && flat[cur + 1] === 1 && labels[cur + 1] === 0) {
          labels[cur + 1] = nLabels; queue[tail++] = cur + 1;
        }
        if (y > 0 && flat[cur - w] === 1 && labels[cur - w] === 0) {
          labels[cur - w] = nLabels; queue[tail++] = cur - w;
        }
        if (y < h - 1 && flat[cur + w] === 1 && labels[cur + w] === 0) {
          labels[cur + w] = nLabels; queue[tail++] = cur + w;
        }
      }
    }
  }

  const grid = [];
  for (let y = 0; y < h; y++) grid.push(new Array(w).fill(0));

  let nTraced = 0;
  let tracedPixels = 0;
  const cap = 4 * n; // 4 * w * h

  for (let li = 1; li <= nLabels; li++) {
    const start = starts[li - 1];
    const sx = start % w;
    const sy = (start - sx) / w;
    const inComp = (x, y) =>
      x >= 0 && x < w && y >= 0 && y < h && labels[y * w + x] === li;

    // --- trace: EXACT port of Lane A's _trace_boundary (SEAM FIX, advisor) ---
    // Backtrack convention (classic Moore, Lane A canonical): the backtrack b
    // is the pixel we arrived FROM (initially WEST of the start — always
    // background for a raster-first pixel). At each current pixel c, scan the
    // 8 Moore neighbors CLOCKWISE starting at the neighbor immediately
    // clockwise-AFTER b (k = 1..8 from dirIndexOf(b - c)) and step to the
    // first same-component ink neighbor; then the old current pixel becomes
    // the new backtrack. The Lane-B draft instead re-derived b as "the last
    // background neighbor examined before the hit" and stopped on
    // (start, WEST) recurrence — a different walk that can paint a different
    // pixel set on concave corners, so it is replaced wholesale here.
    // Stop (Jacob-style, per Lane A): record the entry direction each time
    // the trace steps INTO the start pixel; stop when a repeated entry
    // direction occurs, or at the 4*w*h step cap. An isolated single-pixel
    // component traces to itself.
    const path = [[sx, sy]];
    let cx = sx, cy = sy; // current pixel
    let bx = sx - 1, by = sy; // backtrack point
    const entered = new Set(); // entry-direction indices into start
    const cap = 4 * n;
    let steps = 0;
    while (steps < cap) {
      const bIdx = dirIndexOf(bx - cx, by - cy);
      if (bIdx === -1) break; // defensive: backtrack not adjacent (cannot happen)
      let found = -1;
      for (let k = 1; k <= 8; k++) {
        const idx = (bIdx + k) % 8;
        const nx = cx + DIRS[idx][0];
        const ny = cy + DIRS[idx][1];
        if (inComp(nx, ny)) { found = idx; break; }
      }
      if (found === -1) break; // isolated single-pixel component
      const px = cx, py = cy; // previous current pixel -> new backtrack
      cx += DIRS[found][0];
      cy += DIRS[found][1];
      bx = px;
      by = py;
      steps++;
      if (cx === sx && cy === sy) {
        const edir = dirIndexOf(cx - px, cy - py);
        if (entered.has(edir)) break; // start re-entered with a repeated direction
        entered.add(edir);
      }
      path.push([cx, cy]);
    }

    const painted = new Set();
    for (const [x, y] of path) painted.add(y * w + x);
    for (const k of painted) {
      const x = k % w;
      const y = (k - x) / w;
      grid[y][x] = 1;
    }
    if (painted.size >= minComponent) {
      nTraced++;
      tracedPixels += painted.size;
    } else {
      // erase this component's boundary from the grid (components are
      // 4-connected and disjoint, so no kept component's pixels are touched)
      for (const k of painted) {
        const x = k % w;
        const y = (k - x) / w;
        grid[y][x] = 0;
      }
    }
  }

  return { grid, n_components_traced: nTraced, traced_pixels: tracedPixels };
}

// ---------------------------------------------------------------------------
// stages 1-4 — the standardization pipeline
// ---------------------------------------------------------------------------

/** Box-average downsample keeping aspect: scale = 512/max(w,h), dims floor(). */
function downsampleGray(gray, w, h) {
  const scale = 512 / Math.max(w, h);
  const ow = Math.floor(w * scale);
  const oh = Math.floor(h * scale);
  const out = new Array(ow * oh);
  for (let oy = 0; oy < oh; oy++) {
    const sy0 = Math.floor((oy * h) / oh);
    const sy1 = Math.floor(((oy + 1) * h) / oh);
    for (let ox = 0; ox < ow; ox++) {
      const sx0 = Math.floor((ox * w) / ow);
      const sx1 = Math.floor(((ox + 1) * w) / ow);
      let sum = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const rowOff = sy * w;
        for (let sx = sx0; sx < sx1; sx++) {
          sum += gray[rowOff + sx];
        }
      }
      // SEAM FIX (advisor): NO rounding of the mean — the Python source of
      // record keeps the IEEE-double mean so the `mean >= t` threshold
      // comparison is exact (integer-sum equivalence). Math.round here made
      // the JS mask diverge from Python at box boundaries. (The removed
      // Math.max(.., ..) empty-box guards were dead code: ow < w and
      // oh < h while downsampling, so every box is non-empty.)
      out[oy * ow + ox] = sum / ((sx1 - sx0) * (sy1 - sy0));
    }
  }
  return { gray: out, w: ow, h: oh };
}

/**
 * edge-standard-v1 over raw 8-bit grayscale bytes (row-major, 1 byte/pixel).
 * (a) resize if any dimension > 512 (box-average, aspect fit);
 * (b) thresholdForCoverage vs TARGET_COVERAGE;
 * (c) ink mask = gray >= chosen_threshold;
 * (d) traceContours (minComponent = 12).
 * Returns { grid, meta: { pipeline, chosen_threshold, achieved_coverage,
 * n_components_traced, traced_pixels, w, h, under_inked } } where w/h are the
 * final (post-resize) dimensions and under_inked is true when even t=1 yields
 * coverage < 0.01 (spec's coverage-floor guard; the bitmap is still emitted).
 */
export function standardize(grayBytes, w, h) {
  if (grayBytes.length !== w * h) {
    throw new Error(
      'standardize: gray length ' + grayBytes.length + ' != w*h ' + w * h
    );
  }
  let gray = Array.from(grayBytes);
  let gw = w;
  let gh = h;
  if (w > 512 || h > 512) {
    const ds = downsampleGray(gray, w, h);
    gray = ds.gray;
    gw = ds.w;
    gh = ds.h;
  }

  const { chosen_threshold, achieved_coverage } = thresholdForCoverage(
    gray, gw, gh, TARGET_COVERAGE
  );

  const mask = new Array(gw * gh);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] >= chosen_threshold ? 1 : 0;

  const traced = traceContours(mask, gw, gh, MIN_COMPONENT);

  // coverage-floor guard: coverage at t=1 (everything above pure black)
  let aboveBlack = 0;
  for (let i = 0; i < gray.length; i++) if (gray[i] >= 1) aboveBlack++;
  const underInked = aboveBlack / gray.length < 0.01;

  return {
    grid: traced.grid,
    meta: {
      pipeline: EDGE_STANDARD_PIPELINE,
      chosen_threshold,
      achieved_coverage,
      n_components_traced: traced.n_components_traced,
      traced_pixels: traced.traced_pixels,
      w: gw,
      h: gh,
      under_inked: underInked,
    },
  };
}

// ---------------------------------------------------------------------------
// stage 5 — measurement (thin wrapper)
// ---------------------------------------------------------------------------

/**
 * Box-counting fractal dimension on an edge-standard-v1 bitmap. Thin wrapper over
 * boxCountingDim (same ladder semantics as jev-taste-math.js: scales round+dedupe+clamp,
 * least squares of log N vs log(1/s), r2 gate is the caller's concern). Throws
 * Error("empty edge map") on an empty grid.
 */
export function measure(grid, minBox = 4, maxBox = 64, nScales = 8) {
  return boxCountingDim(grid, minBox, maxBox, nScales);
}
