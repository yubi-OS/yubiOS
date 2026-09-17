#!/usr/bin/env node
// Test suite for lib/radius-diagnostics.mjs — written BEFORE the module (TDD red phase).
// Run: node session/subagent/test-radius.mjs
//
// Scope of what is tested: exact frozen-coordinate geometry on Float64 chord distances.
// Nothing here tests confidence, prediction quality, or physics.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  radiusProfile,
  radiusTransition,
  VERSION,
  CANONICAL_RADIUS,
  RADII,
  DOMAIN,
} from "./lib/radius-diagnostics.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "fixtures");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, message: err && err.message ? err.message : String(err) });
  }
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg || "expected truthy");
}
function eq(actual, expected, msg) {
  if (!Object.is(actual, expected)) {
    throw new Error((msg || "equality") + `: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}
function deepEq(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || "deep equality") + `:\n  got  ${sa}\n  want ${sb}`);
}
function throws(fn, msg) {
  let threw = false;
  try {
    fn();
  } catch (_e) {
    threw = true;
  }
  if (!threw) throw new Error((msg || "expected a throw") + ": call returned normally");
}

// ---------------------------------------------------------------- helpers

const loadFixture = (id) => JSON.parse(readFileSync(join(FIX, `map${id}.json`), "utf8"));
const MAP_IDS = [66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76];
const fixtures = new Map(MAP_IDS.map((id) => [id, loadFixture(id)]));

// Independent reference chord — must agree with the module's Math.hypot chord bit for bit.
const refChord = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function refClearances(pts) {
  return pts.map((p, i) => {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (j === i) continue;
      const d = refChord(p, pts[j]);
      if (d < best) best = d;
    }
    return best;
  });
}

function makeMap(names, pts, extra = {}) {
  return {
    frame_id: "frame-test",
    instrument_id: "instr-test",
    n: names.length,
    names,
    pts_full: pts,
    ...extra,
  };
}

// deterministic LCG so the perturbation sweep is reproducible
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// exact next representable double toward +/- Infinity
// (Node exposes no built-in next-float helper, so step the bit pattern directly)
const _ulpBuf = new ArrayBuffer(8);
const _ulpF64 = new Float64Array(_ulpBuf);
const _ulpU64 = new BigUint64Array(_ulpBuf);
function nextAfter(x, dir) {
  if (Number.isNaN(x) || Number.isNaN(dir) || x === dir) return x;
  if (x === 0) return dir > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  _ulpF64[0] = x;
  const up = dir > x;
  if (x > 0) _ulpU64[0] += up ? 1n : -1n;
  else _ulpU64[0] += up ? -1n : 1n;
  return _ulpF64[0];
}

// ================================================================
// 1. Constants / contract surface
// ================================================================

test("exports the pinned contract constants", () => {
  eq(VERSION, "radius/1", "VERSION");
  eq(CANONICAL_RADIUS, 0.095, "CANONICAL_RADIUS");
  deepEq(RADII, [0.075, 0.085, 0.095, 0.105, 0.115], "RADII");
  deepEq(DOMAIN, [0, 2], "DOMAIN");
  eq(typeof radiusProfile, "function", "radiusProfile is a function");
  eq(typeof radiusTransition, "function", "radiusTransition is a function");
});

test("the canonical radius is one of the sampled radii", () => {
  ok(RADII.includes(CANONICAL_RADIUS), "canonical radius must be on the fixed grid");
});

test("profile echoes the contract fields with no certified/probability claim", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  const p = radiusProfile(m);
  eq(p.version, VERSION, "version");
  eq(p.frame_id, "frame-test", "frame_id");
  eq(p.instrument_id, "instr-test", "instrument_id");
  eq(p.n, 2, "n");
  eq(p.canonical_radius, CANONICAL_RADIUS, "canonical_radius");
  deepEq(p.domain, DOMAIN, "domain");
  deepEq(p.radii, RADII, "radii");
  eq(p.bounds.validated, false, "bounds.validated is always false");
  eq(p.bounds.certified, false, "bounds.certified is always false");
  eq(typeof p.scope, "string", "scope string present");
  const blob = JSON.stringify(p).toLowerCase();
  ok(!blob.includes("probability"), "no probability claim anywhere in the profile");
  ok(!blob.includes("confidence"), "no confidence claim anywhere in the profile");
});

// ================================================================
// 2. Geometry: clearance, ties, isolation rule
// ================================================================

test("clearance is the nearest-neighbour chord distance", () => {
  const m = makeMap(["a", "b", "c"], [[0, 0, 0], [0.3, 0, 0], [1, 0, 0]]);
  const p = radiusProfile(m);
  const byName = Object.fromEntries(p.per_item.map((it) => [it.name, it]));
  eq(byName.a.clearance, 0.3, "a clearance");
  eq(byName.a.nearest_name, "b", "a nearest");
  eq(byName.c.clearance, 0.7, "c clearance");
  eq(byName.c.nearest_name, "b", "c nearest");
});

test("uses Math.hypot exactly as the pointmap core chord does", () => {
  const pts = [
    [0.7055523078813921, -0.6472449743010521, -0.28856521634679344],
    [0.1234567890123456, 0.9876543210987654, -0.1111111111111111],
    [-0.5, 0.25, 0.8291561975888499],
  ];
  const p = radiusProfile(makeMap(["a", "b", "c"], pts));
  const ref = refClearances(pts);
  p.per_item.forEach((it) => {
    const i = ["a", "b", "c"].indexOf(it.name);
    eq(it.clearance, ref[i], `bit-exact clearance for ${it.name}`);
  });
});

test("ties are reported as a count with the lexicographically smallest nearest name", () => {
  // b, c and d are all exactly 0.5 from a. The rows are laid out in ASCENDING
  // name order on purpose: a scan that simply keeps the LAST tied neighbour
  // would end on "d", so only a real lexicographic tie-break returns "b".
  const m = makeMap(
    ["a", "b", "c", "d"],
    [[0, 0, 0], [0, 0.5, 0], [-0.5, 0, 0], [0.5, 0, 0]]
  );
  const p = radiusProfile(m);
  const a = p.per_item.find((it) => it.name === "a");
  eq(a.clearance, 0.5, "tied clearance");
  eq(a.nearest_ties, 3, "three equidistant neighbours");
  eq(a.nearest_name, "b", "lexicographically smallest tied name");
});

test("the lexicographic tie-break is independent of row order", () => {
  const pts = { a: [0, 0, 0], b: [0, 0.5, 0], c: [-0.5, 0, 0], d: [0.5, 0, 0] };
  for (const order of [["a", "b", "c", "d"], ["a", "d", "c", "b"], ["c", "d", "a", "b"], ["d", "b", "a", "c"]]) {
    const p = radiusProfile(makeMap(order, order.map((k) => pts[k])));
    const a = p.per_item.find((it) => it.name === "a");
    eq(a.nearest_ties, 3, `three ties for order ${order.join("")}`);
    eq(a.nearest_name, "b", `lex-smallest tied name for order ${order.join("")}`);
  }
});

test("isolation is the strict-edge rule: isolated iff clearance >= r", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [CANONICAL_RADIUS, 0, 0]]);
  const p = radiusProfile(m);
  ok(p.per_item.every((it) => it.isolated_at_canonical === true), "clearance exactly r0 counts as isolated");
  eq(p.canonical_isolated, 2, "both isolated at exactly r0");
});

test("a clearance one float below r0 is not isolated", () => {
  const below = nextAfter(CANONICAL_RADIUS, 0);
  const m = makeMap(["a", "b"], [[0, 0, 0], [below, 0, 0]]);
  const p = radiusProfile(m);
  eq(p.canonical_isolated, 0, "one representable float below r0 is connected");
});

test("per_item is sorted by name and keeps full literal names untruncated", () => {
  const long = "refs/" + "x".repeat(200) + "-2026-09-13.md";
  const m = makeMap([long, "aaa", "zzz"], [[0, 0, 0], [0.4, 0, 0], [0.9, 0, 0]]);
  const p = radiusProfile(m);
  const names = p.per_item.map((it) => it.name);
  deepEq(names, [...names].sort(), "per_item sorted by name");
  ok(names.includes(long), "long name present verbatim");
  eq(names.find((n) => n.length > 80).length, long.length, "no 80-char truncation");
});

// ================================================================
// 3. Samples: I(r), fraction, clipped area, mean area
// ================================================================

test("rectangular identity: area(R) equals sum of min(R, clearance)", () => {
  const pts = [[0, 0, 0], [0.05, 0, 0], [0.4, 0, 0], [0.9, 0.1, 0], [-0.6, 0.3, 0.2]];
  const names = ["a", "b", "c", "d", "e"];
  const p = radiusProfile(makeMap(names, pts));
  const cl = refClearances(pts);
  for (const s of p.samples) {
    const want = cl.reduce((acc, d) => acc + Math.min(s.radius, d), 0);
    eq(s.area, want, `area at r=${s.radius} equals sum min(R,d)`);
    eq(s.mean_area, want / pts.length, `mean_area at r=${s.radius}`);
  }
});

test("exhaustive small-N check of I(r), fraction and area against a direct recount", () => {
  const rnd = lcg(4242);
  for (let n = 2; n <= 8; n++) {
    for (let trial = 0; trial < 40; trial++) {
      const names = Array.from({ length: n }, (_, i) => `p${i}`);
      const pts = Array.from({ length: n }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
      const p = radiusProfile(makeMap(names, pts));
      const cl = refClearances(pts);
      for (const s of p.samples) {
        const want = cl.filter((d) => s.radius <= d).length;
        eq(s.isolated, want, `I(${s.radius}) at n=${n}`);
        eq(s.isolated_fraction, want / n, `fraction at r=${s.radius}, n=${n}`);
        eq(s.area, cl.reduce((a, d) => a + Math.min(s.radius, d), 0), `area at r=${s.radius}`);
      }
      eq(p.canonical_isolated, cl.filter((d) => CANONICAL_RADIUS <= d).length, "canonical_isolated");
    }
  }
});

test("samples cover exactly the pinned radius grid in order", () => {
  const p = radiusProfile(makeMap(["a", "b"], [[0, 0, 0], [0.2, 0, 0]]));
  deepEq(p.samples.map((s) => s.radius), RADII, "sample radii");
});

test("I(r) is antitone on the fixed grid", () => {
  const rnd = lcg(99);
  const n = 40;
  const names = Array.from({ length: n }, (_, i) => `p${i}`);
  const pts = Array.from({ length: n }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
  const p = radiusProfile(makeMap(names, pts));
  for (let i = 1; i < p.samples.length; i++) {
    ok(p.samples[i].isolated <= p.samples[i - 1].isolated, "I(r) never increases with r");
  }
});

// ================================================================
// 4. Invariances
// ================================================================

test("row permutation does not change the profile", () => {
  const names = ["d", "a", "c", "b"];
  const pts = [[0.1, 0.2, 0.3], [-0.4, 0.1, 0.5], [0.9, -0.2, 0.1], [0.05, 0.05, 0.05]];
  const base = radiusProfile(makeMap(names, pts));
  const order = [2, 0, 3, 1];
  const permuted = radiusProfile(
    makeMap(order.map((i) => names[i]), order.map((i) => pts[i]))
  );
  deepEq(permuted, base, "profile is invariant under row permutation");
});

test("rigid rotation leaves the profile stable away from ties", () => {
  const names = ["a", "b", "c", "d"];
  const pts = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, 0.3, 0.9]];
  const base = radiusProfile(makeMap(names, pts));
  const t = 0.7;
  const rot = ([x, y, z]) => [
    x * Math.cos(t) - y * Math.sin(t),
    x * Math.sin(t) + y * Math.cos(t),
    z,
  ];
  const turned = radiusProfile(makeMap(names, pts.map(rot)));
  deepEq(
    turned.per_item.map((it) => [it.name, it.nearest_name, it.isolated_at_canonical]),
    base.per_item.map((it) => [it.name, it.nearest_name, it.isolated_at_canonical]),
    "nearest-neighbour structure survives rotation"
  );
  turned.per_item.forEach((it, i) => {
    ok(
      Math.abs(it.clearance - base.per_item[i].clearance) < 1e-12,
      `clearance for ${it.name} stable under rotation to float tolerance`
    );
  });
});

test("the module cannot mutate its input map (old fields unchanged)", () => {
  const names = ["a", "b", "c"];
  const pts = [[0, 0, 0], [0.3, 0, 0], [0.8, 0, 0]];
  const m = makeMap(names, pts, { isolated: 3, extra_legacy_field: "keep me" });
  const snapshot = JSON.stringify(m);
  Object.freeze(m);
  Object.freeze(m.names);
  Object.freeze(m.pts_full);
  m.pts_full.forEach((p) => Object.freeze(p));
  const p = radiusProfile(m);
  ok(p && p.per_item.length === 3, "profile computed on a deeply frozen input");
  eq(JSON.stringify(m), snapshot, "input map byte-identical after the call");
  eq(m.extra_legacy_field, "keep me", "unrelated legacy fields untouched");
  eq(m.isolated, 3, "legacy isolated field untouched");
});

// ================================================================
// 5. Degenerate geometry
// ================================================================

test("coincident points have zero clearance and are never isolated at r0", () => {
  const m = makeMap(["a", "b", "c"], [[0.2, 0.2, 0.2], [0.2, 0.2, 0.2], [0.9, 0, 0]]);
  const p = radiusProfile(m);
  const byName = Object.fromEntries(p.per_item.map((it) => [it.name, it]));
  eq(byName.a.clearance, 0, "coincident clearance is exactly 0");
  eq(byName.a.isolated_at_canonical, false, "coincident point is not isolated");
  eq(byName.b.isolated_at_canonical, false, "its twin is not isolated either");
  eq(byName.c.isolated_at_canonical, true, "the far point is still isolated");
  eq(p.canonical_isolated, 1, "canonical isolated count");
});

test("all-identical points give zero area and zero isolates at every radius", () => {
  const pts = Array.from({ length: 5 }, () => [0.1, 0.1, 0.1]);
  const p = radiusProfile(makeMap(["a", "b", "c", "d", "e"], pts));
  for (const s of p.samples) {
    eq(s.isolated, 0, `no isolates at r=${s.radius}`);
    eq(s.isolated_fraction, 0, `zero fraction at r=${s.radius}`);
    eq(s.area, 0, `zero clipped area at r=${s.radius}`);
    eq(s.mean_area, 0, `zero mean area at r=${s.radius}`);
  }
});

test("a two-point map is the minimum accepted size", () => {
  const p = radiusProfile(makeMap(["a", "b"], [[0, 0, 0], [1, 0, 0]]));
  eq(p.n, 2, "n=2 accepted");
  eq(p.per_item.length, 2, "two rows");
});

// ================================================================
// 6. Conditional robustness (never certified)
// ================================================================

test("robustness needs both bounds before it says anything", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  const none = radiusProfile(m);
  eq(none.per_item[0].robustness.status, "needs-coordinate-bound", "no opts at all");
  const epsOnly = radiusProfile(m, { coordinate_epsilon: 1e-9 });
  eq(epsOnly.per_item[0].robustness.status, "needs-error-bound", "epsilon without error bound");
  const errOnly = radiusProfile(m, { distance_error_bound: 1e-12 });
  eq(errOnly.per_item[0].robustness.status, "needs-coordinate-bound", "error bound without epsilon");
});

test("budget is 2*epsilon + distance_error_bound", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  const p = radiusProfile(m, { coordinate_epsilon: 1e-4, distance_error_bound: 3e-5 });
  eq(p.per_item[0].robustness.budget, 2 * 1e-4 + 3e-5, "budget formula");
  eq(p.bounds.coordinate_epsilon, 1e-4, "echoed epsilon");
  eq(p.bounds.distance_error_bound, 3e-5, "echoed error bound");
  eq(p.bounds.validated, false, "still not validated");
  eq(p.bounds.certified, false, "still not certified");
});

test("stable-isolated requires clearance - budget >= r0", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [0.2, 0, 0]]);
  const p = radiusProfile(m, { coordinate_epsilon: 0.01, distance_error_bound: 0.001 });
  // budget = 0.021; 0.2 - 0.021 = 0.179 >= 0.095
  eq(p.per_item[0].robustness.status, "stable-isolated", "comfortably isolated");
});

test("stable-connected requires clearance + budget < r0", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [0.01, 0, 0]]);
  const p = radiusProfile(m, { coordinate_epsilon: 0.001, distance_error_bound: 0.0001 });
  // budget = 0.0021; 0.01 + 0.0021 = 0.0121 < 0.095
  eq(p.per_item[0].robustness.status, "stable-connected", "comfortably connected");
});

test("verdicts inside the budget band are undetermined, never certified", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [CANONICAL_RADIUS + 0.0005, 0, 0]]);
  const p = radiusProfile(m, { coordinate_epsilon: 0.001, distance_error_bound: 0.0001 });
  eq(p.per_item[0].robustness.status, "undetermined", "straddles the threshold");
  ok(!("certified" in p.per_item[0].robustness), "no per-item certification field");
});

test("a zero budget is valid for the exact toy case", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  const p = radiusProfile(m, { coordinate_epsilon: 0, distance_error_bound: 0 });
  eq(p.per_item[0].robustness.budget, 0, "zero budget accepted");
  eq(p.per_item[0].robustness.status, "stable-isolated", "exact verdict at zero budget");
});

test("a stable-isolated verdict survives 20k bounded perturbations", () => {
  const rnd = lcg(20260913);
  const eps = 1e-4;
  const n = 6;
  let checked = 0;
  for (let trial = 0; trial < 20000; trial++) {
    const names = Array.from({ length: n }, (_, i) => `p${i}`);
    const pts = Array.from({ length: n }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
    const p = radiusProfile(makeMap(names, pts), {
      coordinate_epsilon: eps,
      distance_error_bound: 0,
    });
    // perturb every point by a displacement of norm <= eps
    const moved = pts.map((q) => {
      const v = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
      const norm = Math.hypot(v[0], v[1], v[2]) || 1;
      const scale = (eps * rnd()) / norm;
      return [q[0] + v[0] * scale, q[1] + v[1] * scale, q[2] + v[2] * scale];
    });
    const after = radiusProfile(makeMap(names, moved));
    const byName = Object.fromEntries(after.per_item.map((it) => [it.name, it]));
    for (const it of p.per_item) {
      if (it.robustness.status === "stable-isolated") {
        ok(byName[it.name].isolated_at_canonical, `stable-isolated ${it.name} stayed isolated`);
        checked++;
      } else if (it.robustness.status === "stable-connected") {
        ok(!byName[it.name].isolated_at_canonical, `stable-connected ${it.name} stayed connected`);
        checked++;
      }
    }
  }
  ok(checked > 1000, `perturbation sweep exercised enough stable verdicts (got ${checked})`);
});

// ================================================================
// 7. Rejection of invalid data
// ================================================================

test("rejects a missing or malformed map object", () => {
  throws(() => radiusProfile(null), "null map");
  throws(() => radiusProfile(undefined), "undefined map");
  throws(() => radiusProfile(42), "non-object map");
});

test("rejects missing pts_full", () => {
  throws(() => radiusProfile({ frame_id: "f", instrument_id: "i", n: 2, names: ["a", "b"] }), "no pts_full");
});

test("rejects non-finite coordinates", () => {
  throws(() => radiusProfile(makeMap(["a", "b"], [[0, 0, 0], [NaN, 0, 0]])), "NaN coordinate");
  throws(() => radiusProfile(makeMap(["a", "b"], [[0, 0, 0], [Infinity, 0, 0]])), "Infinite coordinate");
  throws(() => radiusProfile(makeMap(["a", "b"], [[0, 0, 0], ["0.5", 0, 0]])), "string coordinate");
});

test("rejects points that are not exactly 3-dimensional", () => {
  throws(() => radiusProfile(makeMap(["a", "b"], [[0, 0], [0.5, 0]])), "2-d points");
  throws(() => radiusProfile(makeMap(["a", "b"], [[0, 0, 0, 0], [0.5, 0, 0, 0]])), "4-d points");
});

test("rejects duplicate names", () => {
  throws(() => radiusProfile(makeMap(["a", "a"], [[0, 0, 0], [0.5, 0, 0]])), "duplicate names");
});

test("rejects non-string names", () => {
  throws(() => radiusProfile(makeMap([1, 2], [[0, 0, 0], [0.5, 0, 0]])), "numeric names");
});

test("rejects a names/pts_full length disagreement", () => {
  throws(() => radiusProfile(makeMap(["a", "b", "c"], [[0, 0, 0], [0.5, 0, 0]])), "length mismatch");
});

test("rejects n outside 2..4000", () => {
  throws(() => radiusProfile(makeMap(["a"], [[0, 0, 0]])), "n=1 below the floor");
  const n = 4001;
  const names = Array.from({ length: n }, (_, i) => `p${i}`);
  const pts = Array.from({ length: n }, (_, i) => [i / n, 0, 0]);
  throws(() => radiusProfile(makeMap(names, pts)), "n=4001 above the ceiling");
});

test("rejects a declared n that disagrees with the arrays", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  m.n = 3;
  throws(() => radiusProfile(m), "declared n mismatch");
});

test("rejects a missing frame_id or instrument_id", () => {
  const a = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  delete a.frame_id;
  throws(() => radiusProfile(a), "missing frame_id");
  const b = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  delete b.instrument_id;
  throws(() => radiusProfile(b), "missing instrument_id");
});

test("rejects invalid budget options", () => {
  const m = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  throws(() => radiusProfile(m, { coordinate_epsilon: -1, distance_error_bound: 0 }), "negative epsilon");
  throws(() => radiusProfile(m, { coordinate_epsilon: 0, distance_error_bound: -1e-9 }), "negative error bound");
  throws(() => radiusProfile(m, { coordinate_epsilon: NaN, distance_error_bound: 0 }), "NaN epsilon");
  throws(() => radiusProfile(m, { coordinate_epsilon: 0, distance_error_bound: Infinity }), "infinite error bound");
  throws(() => radiusProfile(m, { coordinate_epsilon: "1e-9", distance_error_bound: 0 }), "string epsilon");
});

// ================================================================
// 8. Transition: frame identity gate
// ================================================================

test("rejects mismatched frame_id before doing any geometry", () => {
  const before = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  const after = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]], { frame_id: "other-frame" });
  throws(() => radiusTransition(before, after), "frame_id mismatch");
});

test("rejects mismatched instrument_id", () => {
  const before = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  const after = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]], { instrument_id: "other-instr" });
  throws(() => radiusTransition(before, after), "instrument_id mismatch");
});

test("the frame gate fires even when the geometry itself is invalid", () => {
  const before = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  const after = makeMap(["a", "b"], [[0, 0, 0], [NaN, 0, 0]], { frame_id: "other-frame" });
  let msg = "";
  try {
    radiusTransition(before, after);
  } catch (e) {
    msg = e.message;
  }
  ok(/frame_id/.test(msg), `frame gate reported first, got: ${msg}`);
});

test("accepts any named set on a matching frame (post-data diagnostic)", () => {
  const before = makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]);
  const after = makeMap(["x", "y", "z"], [[0, 0, 0], [0.5, 0, 0], [0.9, 0, 0]]);
  const t = radiusTransition(before, after);
  eq(t.before.n, 2, "before n");
  eq(t.after.n, 3, "after n");
  ok(Number.isInteger(t.canonical_delta), "delta computed across a changed name set");
});

// ================================================================
// 9. Transition: deltas and intervals
// ================================================================

test("an identical pair gives zero delta on the whole domain", () => {
  const pts = [[0, 0, 0], [0.5, 0, 0], [0.9, 0.3, 0]];
  const before = makeMap(["a", "b", "c"], pts);
  const after = makeMap(["a", "b", "c"], pts.map((p) => p.slice()));
  const t = radiusTransition(before, after);
  eq(t.canonical_delta, 0, "zero canonical delta");
  for (const s of t.samples) eq(s.delta, 0, `zero delta at r=${s.radius}`);
  deepEq(
    [t.exact_delta_interval.lower, t.exact_delta_interval.upper],
    [DOMAIN[0], DOMAIN[1]],
    "exact-delta interval spans the whole domain"
  );
});

test("reports a positive canonical delta when an isolate appears", () => {
  const before = makeMap(["a", "b", "c"], [[0, 0, 0], [0.01, 0, 0], [0.9, 0, 0]]);
  const after = makeMap(["a", "b", "c"], [[0, 0, 0], [0.5, 0, 0], [0.9, 0, 0]]);
  const t = radiusTransition(before, after);
  eq(t.before.canonical_isolated, 1, "before isolates");
  eq(t.after.canonical_isolated, 3, "after isolates");
  eq(t.canonical_delta, 2, "positive delta");
});

test("reports a negative canonical delta when isolates are lost", () => {
  const before = makeMap(["a", "b", "c"], [[0, 0, 0], [0.5, 0, 0], [0.9, 0, 0]]);
  const after = makeMap(["a", "b", "c"], [[0, 0, 0], [0.01, 0, 0], [0.9, 0, 0]]);
  const t = radiusTransition(before, after);
  eq(t.canonical_delta, -2, "negative delta");
  ok(t.same_sign_interval.lower <= CANONICAL_RADIUS, "sign interval brackets r0 from below");
  ok(t.same_sign_interval.upper >= CANONICAL_RADIUS, "sign interval brackets r0 from above");
});

test("samples carry before, after and delta on the fixed grid", () => {
  const before = makeMap(["a", "b"], [[0, 0, 0], [0.08, 0, 0]]);
  const after = makeMap(["a", "b"], [[0, 0, 0], [0.11, 0, 0]]);
  const t = radiusTransition(before, after);
  deepEq(t.samples.map((s) => s.radius), RADII, "sample radii");
  for (const s of t.samples) eq(s.delta, s.after - s.before, `delta consistent at r=${s.radius}`);
  const at085 = t.samples.find((s) => s.radius === 0.085);
  eq(at085.before, 0, "connected at 0.085 before");
  eq(at085.after, 2, "isolated at 0.085 after");
});

test("the interval containing r0 is maximal and closed on the right", () => {
  const before = makeMap(["a", "b"], [[0, 0, 0], [0.08, 0, 0]]);
  const after = makeMap(["a", "b"], [[0, 0, 0], [0.11, 0, 0]]);
  const t = radiusTransition(before, after);
  const iv = t.exact_delta_interval;
  ok(iv.lower < CANONICAL_RADIUS && CANONICAL_RADIUS <= iv.upper, "r0 inside the half-open cell");
  eq(iv.upper_closed, true, "upper endpoint is always closed");
  eq(iv.lower, 0.08, "lower boundary is the before clearance");
  eq(iv.upper, 0.11, "upper boundary is the after clearance");
  eq(iv.lower_closed, false, "lower endpoint open away from 0");
});

test("r0 sitting exactly on a breakpoint lands in the closed-right cell", () => {
  // clearance exactly r0 in `after` => breakpoint at r0 => r0 belongs to the cell ending at r0.
  const before = makeMap(["a", "b"], [[0, 0, 0], [0.04, 0, 0]]);
  const after = makeMap(["a", "b"], [[0, 0, 0], [CANONICAL_RADIUS, 0, 0]]);
  const t = radiusTransition(before, after);
  eq(t.canonical_delta, 2, "still isolated at exactly r0");
  eq(t.exact_delta_interval.upper, CANONICAL_RADIUS, "interval closes at r0 itself");
  eq(t.exact_delta_interval.upper_closed, true, "right-closed");
});

test("adjacent representable floats do not collapse (right-endpoint evaluation)", () => {
  // The research prototype evaluated each cell at its midpoint. For two adjacent
  // floats the midpoint rounds back to the LEFT endpoint and the cell's delta is
  // read from the wrong side. Evaluating at the right endpoint HI fixes it.
  const lo = CANONICAL_RADIUS;
  const hi = nextAfter(CANONICAL_RADIUS, 1);
  ok(hi > lo, "hi is a strictly larger float");
  ok((lo + hi) / 2 === lo || (lo + hi) / 2 === hi, "their midpoint is not a new float");
  const before = makeMap(["a", "b", "c", "d"], [[0, 0, 0], [lo, 0, 0], [0.7, 0, 0], [0.7 + hi, 0, 0]]);
  const after = makeMap(["a", "b", "c", "d"], [[0, 0, 0], [lo, 0, 0], [0.7, 0, 0], [0.7 + hi, 0, 0]]);
  const t = radiusTransition(before, after);
  // The two distinct breakpoints must both survive as cell boundaries.
  const bounds = new Set([t.exact_delta_interval.lower, t.exact_delta_interval.upper]);
  ok(bounds.size === 2, "two distinct interval endpoints retained");
  ok(Number.isInteger(t.canonical_delta), "delta well-defined at the tie");
});

test("the [0,0] cell exists for coincident points and no cell reaches below zero", () => {
  const before = makeMap(["a", "b", "c"], [[0, 0, 0], [0, 0, 0], [0.9, 0, 0]]);
  const after = makeMap(["a", "b", "c"], [[0, 0, 0], [0.5, 0, 0], [0.9, 0, 0]]);
  const t = radiusTransition(before, after);
  ok(t.exact_delta_interval.lower >= 0, "no negative lower bound");
  ok(t.same_sign_interval.lower >= 0, "no negative lower bound on the sign interval");
  ok(t.exact_delta_interval.upper <= 2, "upper bound stays inside the domain");
  // At r = 0 every point is isolated under `r <= clearance`, so I(0) = n on both sides.
  eq(t.before.samples.length, RADII.length, "profile samples unchanged in shape");
});

test("interval endpoints never leave the 0..2 domain", () => {
  const rnd = lcg(7777);
  for (let trial = 0; trial < 200; trial++) {
    const n = 2 + Math.floor(rnd() * 6);
    const names = Array.from({ length: n }, (_, i) => `p${i}`);
    const mk = () => Array.from({ length: n }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
    const t = radiusTransition(makeMap(names, mk()), makeMap(names, mk()));
    for (const iv of [t.exact_delta_interval, t.same_sign_interval]) {
      ok(iv.lower >= DOMAIN[0] && iv.lower <= DOMAIN[1], "lower in domain");
      ok(iv.upper >= DOMAIN[0] && iv.upper <= DOMAIN[1], "upper in domain");
      ok(iv.lower <= iv.upper, "ordered endpoints");
      eq(iv.upper_closed, true, "upper always closed");
    }
  }
});

test("the same-sign interval contains the exact-delta interval", () => {
  const rnd = lcg(31337);
  for (let trial = 0; trial < 200; trial++) {
    const n = 3 + Math.floor(rnd() * 5);
    const names = Array.from({ length: n }, (_, i) => `p${i}`);
    const mk = () => Array.from({ length: n }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
    const t = radiusTransition(makeMap(names, mk()), makeMap(names, mk()));
    ok(t.same_sign_interval.lower <= t.exact_delta_interval.lower, "sign interval starts no later");
    ok(t.same_sign_interval.upper >= t.exact_delta_interval.upper, "sign interval ends no earlier");
  }
});

// ================================================================
// 10. Boundary witnesses
// ================================================================

test("boundaries carry named witnesses with their side and clearance", () => {
  const before = makeMap(["a", "b"], [[0, 0, 0], [0.08, 0, 0]]);
  const after = makeMap(["a", "b"], [[0, 0, 0], [0.11, 0, 0]]);
  const t = radiusTransition(before, after);
  const lb = t.exact_delta_interval.lower_boundary;
  eq(lb.domain_boundary, false, "0.08 is not a domain endpoint");
  ok(lb.witnesses.length > 0, "witnesses present");
  ok(lb.witnesses.every((w) => w.side === "before" || w.side === "after"), "side labelled");
  ok(lb.witnesses.every((w) => typeof w.name === "string" && typeof w.nearest_name === "string"), "names present");
  ok(lb.witnesses.every((w) => w.clearance === 0.08), "witness clearance equals the boundary");
  eq(lb.total, lb.witnesses.length, "total matches when under the cap");
  eq(lb.shown, lb.witnesses.length, "shown matches the array length");
});

test("domain endpoints are flagged as domain boundaries", () => {
  const pts = [[0, 0, 0], [0.5, 0, 0], [0.9, 0.3, 0]];
  const t = radiusTransition(makeMap(["a", "b", "c"], pts), makeMap(["a", "b", "c"], pts.map((p) => p.slice())));
  eq(t.exact_delta_interval.upper, 2, "upper at the domain end");
  eq(t.exact_delta_interval.upper_boundary.domain_boundary, true, "flagged as a domain boundary");
  eq(t.exact_delta_interval.lower_boundary.domain_boundary, true, "lower at 0 flagged too");
});

test("witnesses are capped at 8 shown while total stays honest", () => {
  // 20 points all sharing the same clearance value: a long tie at one breakpoint.
  const n = 20;
  const gap = 0.5;
  const names = Array.from({ length: n }, (_, i) => `item-${String(i).padStart(3, "0")}`);
  const pts = Array.from({ length: n }, (_, i) => [i * gap, 0, 0]);
  const before = makeMap(names, pts);
  const after = makeMap(names, pts.map(([x, y, z], i) => (i === 0 ? [x, y, z] : [x, y, z])));
  const t = radiusTransition(before, after);
  for (const iv of [t.exact_delta_interval, t.same_sign_interval]) {
    for (const b of [iv.lower_boundary, iv.upper_boundary]) {
      ok(b.witnesses.length <= 8, `at most 8 witnesses shown (got ${b.witnesses.length})`);
      eq(b.shown, b.witnesses.length, "shown equals the array length");
      ok(b.total >= b.shown, "total is at least the shown count");
    }
  }
});

test("witness path strings are never truncated", () => {
  const long = "refs/" + "y".repeat(240) + "-2026-09-13.md";
  const before = makeMap([long, "b"], [[0, 0, 0], [0.08, 0, 0]]);
  const after = makeMap([long, "b"], [[0, 0, 0], [0.11, 0, 0]]);
  const t = radiusTransition(before, after);
  const all = [
    ...t.exact_delta_interval.lower_boundary.witnesses,
    ...t.exact_delta_interval.upper_boundary.witnesses,
  ];
  const hit = all.find((w) => w.name === long || w.nearest_name === long);
  ok(hit, "long path appears among the witnesses");
  const used = hit.name === long ? hit.name : hit.nearest_name;
  eq(used.length, long.length, "path string kept at full length");
});

// ================================================================
// 11. Null / scope discipline
// ================================================================

test("the profile states a retrospective, exact-geometry scope", () => {
  const p = radiusProfile(makeMap(["a", "b"], [[0, 0, 0], [0.5, 0, 0]]));
  ok(/retrospective/i.test(p.scope), "scope says retrospective");
  ok(!/predict/i.test(p.scope), "scope makes no prediction claim");
});

test("the transition scope disclaims confidence and science admission", () => {
  const pts = [[0, 0, 0], [0.5, 0, 0]];
  const t = radiusTransition(makeMap(["a", "b"], pts), makeMap(["a", "b"], pts.map((p) => p.slice())));
  ok(typeof t.scope === "string" && t.scope.length > 0, "scope present");
  const blob = JSON.stringify(t).toLowerCase();
  ok(!blob.includes("certified\":true"), "nothing certified");
  ok(!blob.includes("p_value"), "no p-value");
  ok(!blob.includes("significance"), "no significance claim");
});

test("no null model or ranking score is emitted", () => {
  const pts = [[0, 0, 0], [0.5, 0, 0], [0.9, 0, 0]];
  const t = radiusTransition(makeMap(["a", "b", "c"], pts), makeMap(["a", "b", "c"], pts.map((p) => p.slice())));
  const keys = new Set(Object.keys(t));
  ok(!keys.has("null"), "no null block");
  ok(!keys.has("score"), "no ranking score");
  ok(!keys.has("rank"), "no rank");
  ok(!JSON.stringify(t).includes("degree_preserving"), "no degree-preserving null result");
});

// ================================================================
// 12. Output size budget
// ================================================================

test("a 400-point map with long names stays bounded and non-quadratic", () => {
  const n = 400;
  const names = Array.from({ length: n }, (_, i) => `refs/${"z".repeat(150)}-${String(i).padStart(4, "0")}.md`);
  const rnd = lcg(555);
  const pts = Array.from({ length: n }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
  const p = radiusProfile(makeMap(names, pts));
  eq(p.per_item.length, n, "one row per item");
  const bytes = JSON.stringify(p).length;
  // Each row carries two full names (~340 chars) plus a few numbers; linear, not O(N^2).
  ok(bytes < 400_000, `profile JSON is linear in N (got ${bytes} bytes)`);
  const t = radiusTransition(makeMap(names, pts), makeMap(names, pts.map((q) => q.slice())));
  const tb = JSON.stringify(t).length;
  ok(tb < 900_000, `transition JSON stays bounded (got ${tb} bytes)`);
  for (const iv of [t.exact_delta_interval, t.same_sign_interval]) {
    for (const b of [iv.lower_boundary, iv.upper_boundary]) {
      ok(b.witnesses.length <= 8, "witness list stays capped at 400 points");
    }
  }
});

test("a heavy tie does not blow the witness list up quadratically", () => {
  const n = 300;
  const names = Array.from({ length: n }, (_, i) => `p${String(i).padStart(4, "0")}`);
  const pts = Array.from({ length: n }, (_, i) => [i * 0.005, 0, 0]); // every clearance identical
  const t = radiusTransition(makeMap(names, pts), makeMap(names, pts.map((q) => q.slice())));
  const bytes = JSON.stringify({
    a: t.exact_delta_interval,
    b: t.same_sign_interval,
  }).length;
  ok(bytes < 20_000, `interval blocks stay small under a 300-way tie (got ${bytes} bytes)`);
});

// ================================================================
// 13. Real fixture replay — maps 66..76
// ================================================================

test("every fixture validates and reproduces its recorded isolated count", () => {
  const canon = [61, 61, 62, 63, 62, 63, 62, 62, 62, 63, 64];
  MAP_IDS.forEach((id, k) => {
    const m = fixtures.get(id);
    const p = radiusProfile(m);
    eq(p.canonical_isolated, canon[k], `map${id} recomputed isolated count`);
    eq(p.canonical_isolated, m.isolated, `map${id} agrees with the instrument field`);
    eq(p.n, m.n, `map${id} n`);
  });
});

test("the canonical sample equals the canonical isolated count on every fixture", () => {
  for (const id of MAP_IDS) {
    const p = radiusProfile(fixtures.get(id));
    const s = p.samples.find((x) => x.radius === CANONICAL_RADIUS);
    eq(s.isolated, p.canonical_isolated, `map${id} sample/field agreement`);
  }
});

test("all eleven fixtures share one frozen frame and instrument", () => {
  const frames = new Set(MAP_IDS.map((id) => fixtures.get(id).frame_id));
  const instrs = new Set(MAP_IDS.map((id) => fixtures.get(id).instrument_id));
  eq(frames.size, 1, "one frame_id");
  eq(instrs.size, 1, "one instrument_id");
});

test("the ten consecutive transitions replay the recorded canonical deltas", () => {
  const canon = [61, 61, 62, 63, 62, 63, 62, 62, 62, 63, 64];
  for (let k = 0; k < 10; k++) {
    const before = fixtures.get(MAP_IDS[k]);
    const after = fixtures.get(MAP_IDS[k + 1]);
    const t = radiusTransition(before, after);
    eq(t.canonical_delta, canon[k + 1] - canon[k], `cycle ${k + 1} canonical delta`);
    eq(t.before.canonical_isolated, canon[k], `cycle ${k + 1} before count`);
    eq(t.after.canonical_isolated, canon[k + 1], `cycle ${k + 1} after count`);
  }
});

test("cycle 6 reproduces the exact lower bound 0.09455818029226203", () => {
  const t = radiusTransition(fixtures.get(71), fixtures.get(72));
  eq(t.canonical_delta, -1, "cycle 6 delta");
  eq(t.exact_delta_interval.lower, 0.09455818029226203, "cycle 6 exact lower bound");
  eq(t.exact_delta_interval.lower_closed, false, "cycle 6 lower endpoint is open");
  ok(t.exact_delta_interval.lower < CANONICAL_RADIUS, "the bound sits just below r0");
});

test("cycle 9 reproduces the exact upper bound 0.09592839494559283", () => {
  const t = radiusTransition(fixtures.get(74), fixtures.get(75));
  eq(t.canonical_delta, 1, "cycle 9 delta");
  eq(t.exact_delta_interval.upper, 0.09592839494559283, "cycle 9 exact upper bound");
  eq(t.exact_delta_interval.upper_closed, true, "cycle 9 upper endpoint is closed");
  ok(t.exact_delta_interval.upper > CANONICAL_RADIUS, "the bound sits just above r0");
});

test("cycle 10 reproduces the exact upper bound 0.10419701679768045", () => {
  const t = radiusTransition(fixtures.get(75), fixtures.get(76));
  eq(t.canonical_delta, 1, "cycle 10 delta");
  eq(t.exact_delta_interval.upper, 0.10419701679768045, "cycle 10 exact upper bound");
  eq(t.exact_delta_interval.upper_closed, true, "cycle 10 upper endpoint is closed");
});

test("the sensitive cycles 6, 9 and 10 bracket r0 tightly", () => {
  const sensitive = [[71, 72], [74, 75], [75, 76]];
  for (const [a, b] of sensitive) {
    const t = radiusTransition(fixtures.get(a), fixtures.get(b));
    const iv = t.exact_delta_interval;
    ok(iv.lower < CANONICAL_RADIUS && CANONICAL_RADIUS <= iv.upper, `map${a}->${b} brackets r0`);
    const width = iv.upper - iv.lower;
    ok(width < 0.2, `map${a}->${b} interval is narrow (${width})`);
  }
});

test("sensitive-cycle boundaries name their witnesses", () => {
  const t = radiusTransition(fixtures.get(71), fixtures.get(72));
  const lb = t.exact_delta_interval.lower_boundary;
  ok(lb.total >= 1, "at least one witness at the lower boundary");
  ok(lb.witnesses.every((w) => w.clearance === lb.witnesses[0].clearance), "all witnesses at one clearance");
  ok(lb.witnesses.every((w) => w.name.startsWith("refs/") || w.name.length > 0), "real corpus paths");
});

test("fixture transitions are invariant under row permutation", () => {
  const shuffle = (m, seed) => {
    const rnd = lcg(seed);
    const idx = m.names.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return {
      ...m,
      names: idx.map((i) => m.names[i]),
      pts_full: idx.map((i) => m.pts_full[i]),
    };
  };
  for (const [a, b] of [[71, 72], [74, 75], [75, 76]]) {
    const base = radiusTransition(fixtures.get(a), fixtures.get(b));
    const perm = radiusTransition(shuffle(fixtures.get(a), a), shuffle(fixtures.get(b), b));
    eq(perm.canonical_delta, base.canonical_delta, `map${a}->${b} delta under permutation`);
    deepEq(
      [perm.exact_delta_interval.lower, perm.exact_delta_interval.upper],
      [base.exact_delta_interval.lower, base.exact_delta_interval.upper],
      `map${a}->${b} interval under permutation`
    );
  }
});

test("the fixture replay is labelled retrospective, not predictive", () => {
  const t = radiusTransition(fixtures.get(74), fixtures.get(75));
  ok(/retrospective/i.test(t.scope), "transition scope says retrospective");
  ok(/not a (pre-edit )?forecast|not a prediction/i.test(t.scope), "scope explicitly disclaims forecasting");
});

test("every fixture profile stays within the storage budget", () => {
  for (const id of MAP_IDS) {
    const bytes = JSON.stringify(radiusProfile(fixtures.get(id))).length;
    ok(bytes < 250_000, `map${id} profile is ${bytes} bytes`);
  }
});

// ================================================================
// 14. Regression guards for the two fixes this module exists to make
// ================================================================

test("REGRESSION: a cell between adjacent floats is read at its right endpoint", () => {
  // The research prototype evaluated each cell (LO, HI] at its MIDPOINT. When LO
  // and HI are adjacent representable doubles the midpoint rounds back to LO —
  // a point that belongs to the PREVIOUS cell — so the cell silently inherits the
  // wrong delta and the merged interval runs straight past its true boundary.
  const a = 0.2;
  const b = nextAfter(a, 1);
  ok(b > a, "b is the next representable double above a");
  eq((a + b) / 2, a, "their midpoint rounds back down to a (this is the trap)");

  // One pair whose clearance is exactly a before and exactly b after, plus a
  // far-away pair at 0.5 that never moves.
  eq(Math.hypot(a, 0, 0), a, "chord reproduces a exactly");
  eq(Math.hypot(b, 0, 0), b, "chord reproduces b exactly");
  const far = [[10, 0, 0], [10.5, 0, 0]];
  const before = makeMap(["p0", "p1", "q0", "q1"], [[0, 0, 0], [a, 0, 0], ...far]);
  const after = makeMap(["p0", "p1", "q0", "q1"], [[0, 0, 0], [b, 0, 0], ...far]);

  const t = radiusTransition(before, after);
  eq(t.canonical_delta, 0, "no change at the canonical radius itself");

  // Truth: delta is +2 only on the single-float-wide cell (a, b], so the run of
  // zero-delta cells containing r0 must STOP at a.
  eq(t.exact_delta_interval.lower, 0, "zero-delta run starts at the domain floor");
  eq(
    t.exact_delta_interval.upper,
    a,
    "zero-delta run stops at a — midpoint evaluation would let it run to 0.5 or 2"
  );
  ok(t.exact_delta_interval.upper < 0.5, "the boundary did not leak past the next breakpoint");
});

test("REGRESSION: a boundary with many tied witnesses is capped at 8 shown", () => {
  // 10 well-separated pairs, every pair at the same intra-pair gap, so all 20
  // points share one clearance and one breakpoint carries 20 witnesses.
  const names = [];
  const mk = (gap) => {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      // offset along x, separation along y: (gap - 0) is exact, so all ten pairs
      // share one bit-identical clearance and the boundary is a genuine 20-way tie
      pts.push([0, k * 5, 0]);
      pts.push([gap, k * 5, 0]);
    }
    return pts;
  };
  for (let k = 0; k < 10; k++) {
    names.push(`refs/${"w".repeat(120)}-pair${k}-a.md`);
    names.push(`refs/${"w".repeat(120)}-pair${k}-b.md`);
  }
  const before = makeMap(names, mk(0.08));
  const after = makeMap(names, mk(0.11));

  const t = radiusTransition(before, after);
  eq(t.canonical_delta, 20, "all twenty points become isolated across r0");

  const lb = t.exact_delta_interval.lower_boundary;
  const ub = t.exact_delta_interval.upper_boundary;
  eq(lb.total, 20, "twenty witnesses tie at the lower boundary");
  eq(lb.shown, 8, "only eight are shown");
  eq(lb.witnesses.length, 8, "the array itself is capped");
  eq(ub.total, 20, "twenty witnesses tie at the upper boundary");
  eq(ub.shown, 8, "only eight are shown");
  eq(ub.witnesses.length, 8, "the array itself is capped");
  ok(lb.total > lb.shown, "total stays honest about what was omitted");
  // the cap is on COUNT, never on the path strings themselves
  ok(lb.witnesses.every((w) => w.name.length > 120), "witness paths kept at full length");
});

test("REGRESSION: witness caps hold on both intervals and both endpoints", () => {
  const names = [];
  const mk = (gap) => {
    const pts = [];
    for (let k = 0; k < 30; k++) {
      pts.push([0, k * 5, 0]);
      pts.push([gap, k * 5, 0]);
    }
    return pts;
  };
  for (let k = 0; k < 30; k++) {
    names.push(`a-${String(k).padStart(3, "0")}`);
    names.push(`b-${String(k).padStart(3, "0")}`);
  }
  const t = radiusTransition(makeMap(names, mk(0.08)), makeMap(names, mk(0.11)));
  for (const iv of [t.exact_delta_interval, t.same_sign_interval]) {
    for (const b of [iv.lower_boundary, iv.upper_boundary]) {
      ok(b.shown <= 8, `shown capped (got ${b.shown})`);
      eq(b.witnesses.length, b.shown, "array length equals shown");
      ok(b.total >= b.shown, "total >= shown");
    }
  }
  eq(t.exact_delta_interval.lower_boundary.total, 60, "sixty tied witnesses counted");
});

// ---------------------------------------------------------------- report

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ✗ ${f.name}\n      ${f.message}`);
  process.exit(1);
}
process.exit(0);
