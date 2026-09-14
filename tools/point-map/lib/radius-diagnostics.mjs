// radius-diagnostics.mjs — descriptive radius-persistence diagnostics.
//
// Pure, side-effect-free, read-only. It never mutates the maps it is given and
// never touches the pointmap core: the canonical radius, the frozen frame, the
// hashes, the chord geometry and the ladder ranking all stay exactly where they
// are. This module only *describes* what the frozen coordinates already say at
// a fixed, pre-declared grid of radii.
//
// Scope discipline: everything here is retrospective, exact Float64 geometry on
// one frozen frame. Nothing here is a forecast, a calibrated certainty, a null
// model, a ranking score, or an admission of scientific validity. The
// `validated` and `certified` flags are structurally pinned to false.

export const VERSION = "radius/1";
export const CANONICAL_RADIUS = 0.095;
export const RADII = Object.freeze([0.075, 0.085, 0.095, 0.105, 0.115]);
export const DOMAIN = Object.freeze([0, 2]);

const MAX_WITNESSES = 8;
const MIN_N = 2;
const MAX_N = 400;
const DIM = 3;

const PROFILE_SCOPE =
  "Retrospective: computed from one frozen full-precision Float64 frame; not an exact-arithmetic or floating-point proof: " +
  "nearest-neighbour clearances, isolation counts and clipped areas on a fixed, " +
  "pre-declared radius grid in chord units. Descriptive geometry only — not a " +
  "forecast, not a quality claim, and not an admission of scientific validity.";

const TRANSITION_SCOPE =
  "Retrospective post-edit reconstruction on one frozen frame: it explains where " +
  "the isolated count went as the radius sweeps the 0..2 chord-unit domain. It is " +
  "not a pre-edit forecast, not calibrated certainty, not a null-model comparison, " +
  "and not an admission of scientific validity. The canonical radius is unchanged; " +
  "this sweep is displayed, never operative.";

// ---------------------------------------------------------------- geometry

// Bit-for-bit the pointmap core's chord:
//   const chord = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const chord = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------------------------------------------------------------- validation

function fail(Kind, msg) {
  throw new Kind(msg);
}

function validateMap(map, label) {
  if (map === null || typeof map !== "object" || Array.isArray(map)) {
    fail(TypeError, `${label}: expected a map object, got ${map === null ? "null" : typeof map}`);
  }
  if (typeof map.frame_id !== "string" || map.frame_id.length === 0) {
    fail(TypeError, `${label}: missing frame_id`);
  }
  if (typeof map.instrument_id !== "string" || map.instrument_id.length === 0) {
    fail(TypeError, `${label}: missing instrument_id`);
  }

  const names = map.names;
  const pts = map.pts_full;
  if (!Array.isArray(names)) fail(TypeError, `${label}: names must be an array`);
  if (!Array.isArray(pts)) fail(TypeError, `${label}: missing pts_full (rounded pts are not exact enough for r=${CANONICAL_RADIUS} adjacency)`);
  if (names.length !== pts.length) {
    fail(RangeError, `${label}: names (${names.length}) and pts_full (${pts.length}) disagree in length`);
  }

  const n = names.length;
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) {
    fail(RangeError, `${label}: n=${n} is outside the supported range ${MIN_N}..${MAX_N}`);
  }
  if (map.n !== undefined && map.n !== n) {
    fail(RangeError, `${label}: declared n=${map.n} disagrees with the arrays (${n})`);
  }

  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const nm = names[i];
    if (typeof nm !== "string" || nm.length === 0) {
      fail(TypeError, `${label}: names[${i}] is not a non-empty string`);
    }
    if (seen.has(nm)) fail(RangeError, `${label}: duplicate name ${JSON.stringify(nm)}`);
    seen.add(nm);

    const p = pts[i];
    if (!Array.isArray(p) || p.length !== DIM) {
      fail(TypeError, `${label}: pts_full[${i}] must be a ${DIM}-element array`);
    }
    for (let k = 0; k < DIM; k++) {
      if (typeof p[k] !== "number" || !Number.isFinite(p[k])) {
        fail(TypeError, `${label}: pts_full[${i}][${k}] is not a finite number`);
      }
    }
  }
  return { names, pts, n };
}

function validateBound(value, key) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(TypeError, `${key} must be a finite number`);
  }
  if (value < 0) fail(RangeError, `${key} must be >= 0`);
  return value;
}

function readOpts(opts) {
  if (opts === undefined || opts === null) return { eps: null, err: null };
  if (typeof opts !== "object" || Array.isArray(opts)) {
    fail(TypeError, "opts must be an object");
  }
  return {
    eps: validateBound(opts.coordinate_epsilon, "coordinate_epsilon"),
    err: validateBound(opts.distance_error_bound, "distance_error_bound"),
  };
}

// ---------------------------------------------------------------- profile

// Nearest neighbour of every point: clearance, the lexicographically smallest
// name achieving it, and how many neighbours tie at exactly that distance.
// Reporting the tie as a COUNT (not a list) is what keeps the output linear in
// N instead of quadratic when many points are equidistant.
function nearestTable(names, pts, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    let bestName = null;
    let ties = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = chord(pts[i], pts[j]);
      if(!Number.isFinite(d)) fail(RangeError,"chord distance overflow");
      if (d < best) {
        best = d;
        bestName = names[j];
        ties = 1;
      } else if (d === best) {
        ties++;
        if (names[j] < bestName) bestName = names[j];
      }
    }
    rows.push({ name: names[i], nearest_name: bestName, nearest_ties: ties, clearance: best });
  }
  return rows;
}

// Strict-edge rule, identical to the core's isolatedCount: an edge exists iff
// chord < r, so a point is isolated iff its clearance >= r.
function isolatedAt(clearances, r) {
  let c = 0;
  for (let i = 0; i < clearances.length; i++) if (r <= clearances[i]) c++;
  return c;
}

// Exact, no quadrature: integral_0^R I(r) dr = sum_i min(R, clearance_i).
function clippedArea(clearances, R) {
  let a = 0;
  for (let i = 0; i < clearances.length; i++) a += Math.min(R, clearances[i]);
  return a;
}

function robustnessFor(clearance, eps, err) {
  if (eps === null) return { status: "needs-coordinate-bound" };
  if (err === null) return { status: "needs-error-bound" };
  // Each endpoint may move by at most eps, so the chord moves by at most 2*eps
  // (triangle inequality); err is the caller-assumed bound on ALL remaining
  // numeric error in the distance. The budget is deliberately caller-supplied:
  // this module never invents one and never certifies the result.
  const budget = 2 * eps + err;
  if(!Number.isFinite(budget)) fail(RangeError,"coordinate robustness budget overflow");
  let status;
  if (clearance - budget >= CANONICAL_RADIUS) status = "stable-isolated";
  else if (clearance + budget < CANONICAL_RADIUS) status = "stable-connected";
  else status = "undetermined";
  return { status, budget, coordinate_epsilon: eps, distance_error_bound: err };
}

export function radiusProfile(map, opts = {}) {
  const { eps, err } = readOpts(opts);
  const { names, pts, n } = validateMap(map, "map");

  const rows = nearestTable(names, pts, n);
  rows.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const clearances = rows.map((r) => r.clearance);
  if(map.isolated !== undefined && map.isolated !== isolatedAt(clearances,CANONICAL_RADIUS)) fail(RangeError,"canonical isolation mismatch");

  const per_item = rows.map((r) => ({
    name: r.name,
    nearest_name: r.nearest_name,
    nearest_ties: r.nearest_ties,
    clearance: r.clearance,
    isolated_at_canonical: r.clearance >= CANONICAL_RADIUS,
    robustness: robustnessFor(r.clearance, eps, err),
  }));

  const samples = RADII.map((radius) => {
    const isolated = isolatedAt(clearances, radius);
    const area = clippedArea(clearances, radius);
    return {
      radius,
      isolated,
      isolated_fraction: isolated / n,
      area,
      mean_area: area / n,
    };
  });

  return {
    version: VERSION,
    frame_id: map.frame_id,
    instrument_id: map.instrument_id,
    n,
    canonical_radius: CANONICAL_RADIUS,
    domain: [DOMAIN[0], DOMAIN[1]],
    radii: [...RADII],
    canonical_isolated: isolatedAt(clearances, CANONICAL_RADIUS),
    per_item,
    samples,
    bounds: {
      coordinate_epsilon: eps,
      distance_error_bound: err,
      validated: false,
      certified: false,
    },
    scope: PROFILE_SCOPE,
  };
}

// ---------------------------------------------------------------- transition

// I(r) is a step function of r, constant on each half-open cell (LO, HI] because
// the isolation rule is `r <= clearance`. Every distinct clearance on either side
// is a breakpoint.
//
// The research prototype evaluated each cell at its MIDPOINT. That is wrong for
// adjacent representable floats: (LO + HI) / 2 can round back to LO, so the cell
// is sampled outside itself and reports the previous cell's count. Evaluating at
// the RIGHT endpoint HI is always inside the half-open cell and is exact.
function buildCells(clearBefore, clearAfter) {
  const events = new Set([DOMAIN[0], DOMAIN[1]]);
  for (const d of clearBefore) if (d > DOMAIN[0] && d < DOMAIN[1]) events.add(d);
  for (const d of clearAfter) if (d > DOMAIN[0] && d < DOMAIN[1]) events.add(d);
  // Clearances at or beyond the domain end (and any non-finite Infinity from a
  // degenerate single-point map) are filtered out above, so cells never leave 0..2.

  const sorted = [...events].sort((a, b) => a - b);
  const cells = [];

  // The degenerate [0,0] cell: coincident points have clearance exactly 0 and are
  // isolated at r = 0 under `r <= clearance`. There is no cell below 0 — a strict
  // d < 0 has no witnesses and is outside the domain entirely.
  cells.push({
    lower: DOMAIN[0],
    upper: DOMAIN[0],
    lower_closed: true,
    at: DOMAIN[0],
  });

  for (let k = 1; k < sorted.length; k++) {
    cells.push({
      lower: sorted[k - 1],
      upper: sorted[k],
      lower_closed: false,
      at: sorted[k], // right endpoint — the bug fix
    });
  }

  for (const c of cells) {
    c.before = isolatedAt(clearBefore, c.at);
    c.after = isolatedAt(clearAfter, c.at);
    c.delta = c.after - c.before;
  }
  return cells;
}

const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

function cellIndexContaining(cells, r) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.lower_closed && r === c.lower && r === c.upper) return i;
    if (r > c.lower && r <= c.upper) return i;
  }
  fail(RangeError, `radius ${r} is outside the domain ${DOMAIN[0]}..${DOMAIN[1]}`);
}

function witnessesAt(value, beforeRows, afterRows) {
  const hits = [];
  for (const r of beforeRows) {
    if (r.clearance === value) {
      hits.push({ side: "before", name: r.name, nearest_name: r.nearest_name, clearance: r.clearance });
    }
  }
  for (const r of afterRows) {
    if (r.clearance === value) {
      hits.push({ side: "after", name: r.name, nearest_name: r.nearest_name, clearance: r.clearance });
    }
  }
  // Deterministic order, then cap. Path strings are never truncated; only the
  // NUMBER of witnesses is bounded, which is what keeps a heavy tie from turning
  // the output quadratic.
  hits.sort((a, b) => (a.side < b.side ? -1 : a.side > b.side ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const shown = hits.slice(0, MAX_WITNESSES);
  return {
    domain_boundary: value === DOMAIN[0] || value === DOMAIN[1],
    witnesses: shown,
    total: hits.length,
    shown: shown.length,
  };
}

function mergeInterval(cells, index, project, beforeRows, afterRows) {
  const value = project(cells[index].delta);
  let left = index;
  let right = index;
  while (left > 0 && project(cells[left - 1].delta) === value) left--;
  while (right + 1 < cells.length && project(cells[right + 1].delta) === value) right++;

  const lower = cells[left].lower;
  const upper = cells[right].upper;
  return {
    lower,
    upper,
    lower_closed: cells[left].lower_closed,
    upper_closed: true,
    lower_boundary: witnessesAt(lower, beforeRows, afterRows),
    upper_boundary: witnessesAt(upper, beforeRows, afterRows),
  };
}

export function radiusTransition(before, after, opts = {}) {
  // The frame gate fires FIRST, before any geometry is read or validated: two
  // maps on different frozen frames are not comparable at all, and saying so is
  // more useful than a downstream coordinate error.
  if (before === null || typeof before !== "object") fail(TypeError, "before: expected a map object");
  if (after === null || typeof after !== "object") fail(TypeError, "after: expected a map object");
  if (before.frame_id !== after.frame_id) {
    fail(RangeError, `frame_id mismatch (${before.frame_id} vs ${after.frame_id}): the two maps are not on the same frozen frame`);
  }
  if (before.instrument_id !== after.instrument_id) {
    fail(RangeError, `instrument_id mismatch (${before.instrument_id} vs ${after.instrument_id}): settings differ between the two runs`);
  }

  const { eps, err } = readOpts(opts);

  // Any named set is acceptable: this is a post-data diagnostic, so points may be
  // added, removed or renamed between the two maps as long as the frame matches.
  const beforeProfile = radiusProfile(before, { coordinate_epsilon: eps, distance_error_bound: err });
  const afterProfile = radiusProfile(after, { coordinate_epsilon: eps, distance_error_bound: err });

  const clearBefore = beforeProfile.per_item.map((r) => r.clearance);
  const clearAfter = afterProfile.per_item.map((r) => r.clearance);

  const cells = buildCells(clearBefore, clearAfter);
  const idx = cellIndexContaining(cells, CANONICAL_RADIUS);

  const samples = RADII.map((radius, k) => ({
    radius,
    before: beforeProfile.samples[k].isolated,
    after: afterProfile.samples[k].isolated,
    delta: afterProfile.samples[k].isolated - beforeProfile.samples[k].isolated,
  }));

  return {
    version: VERSION,
    frame_id: before.frame_id,
    instrument_id: before.instrument_id,
    canonical_radius: CANONICAL_RADIUS,
    domain: [DOMAIN[0], DOMAIN[1]],
    radii: [...RADII],
    before: beforeProfile,
    after: afterProfile,
    samples,
    retrospective: true,
    canonical_delta: cells[idx].delta,
    exact_delta_interval: mergeInterval(cells, idx, (d) => d, beforeProfile.per_item, afterProfile.per_item),
    same_sign_interval: mergeInterval(cells, idx, sign, beforeProfile.per_item, afterProfile.per_item),
    scope: TRANSITION_SCOPE,
  };
}
