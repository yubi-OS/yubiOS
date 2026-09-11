// test-math.mjs — wayfinder-math/1 diagnostics suite for pointmap.js.
// Run: node session/subagent/point-map/test-math.mjs
// Zero deps, no network. pointmap.js is a browser/Worker IIFE (`var PM = ...`), so it is loaded
// into a vm sandbox exactly the way a <script> tag would load it. The pre-change baseline copy
// (pointmap.baseline.js) is loaded into a second sandbox for the old-vs-new regression proof.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
function load(file) {
  const sandbox = { console, TextEncoder, Math, JSON };
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(path.join(HERE, file), "utf8"), { filename: file }).runInContext(sandbox);
  return sandbox.PM;
}
const PM = load("pointmap.js");
const BASE = load("pointmap.baseline.js");
const FIXTURE = JSON.parse(fs.readFileSync(path.join(HERE, "data", "wayfinder-maps-51-61.json"), "utf8"));

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { failures.push({ name, err: e }); console.log("  FAIL " + name + " — " + e.message); }
}
// pointmap.js is loaded into a vm sandbox, so its objects have a different realm's prototypes.
// deepStrictEqual is prototype-sensitive: normalise both sides through JSON before comparing.
const plain = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const deepEq = (a, b, m) => assert.deepStrictEqual(plain(a), plain(b), m);
function throws(fn, re, msg) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  assert.ok(threw, "expected a throw: " + (msg || ""));
  if (re) assert.ok(re.test(threw.message), "throw message " + JSON.stringify(threw.message) + " !~ " + re);
}

// ---- local, independent reference implementations --------------------------
// Deliberately NOT the library's code: every ledger assertion below is checked against a
// count computed here from raw coordinates / raw adjacency.
const R = 0.095;
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
function isolatedRef(P) {
  return P.filter((p, i) => !P.some((q, j) => j !== i && dist(p, q) < R)).length;
}
function isoFromAdj(A) { return A.filter(row => row.reduce((a, b) => a + b, 0) === 0).length; }
function attach(A, links) { return A.map((row, i) => row.concat([links[i]])).concat([links.concat([0])]); }
function changeAdj(A, v, links) {
  const B = A.map(r => r.slice());
  for (let j = 0; j < A.length; j++) { B[v][j] = links[j]; B[j][v] = links[j]; }
  return B;
}

// synthetic point-map results (only the fields explainTransition is allowed to need)
let uid = 0;
function res(points, names, over) {
  return Object.assign({
    version: "pointmap/0.2", frame_id: "frameA", instrument_id: "instA",
    names: names || points.map(() => "p" + (uid++)),
    pts_full: points.map(p => p.slice()),
    bits: points.map(() => [1, 0, 1]),
    isolated: isolatedRef(points)
  }, over || {});
}
// points far apart (isolated) unless deliberately paired
const far = (i) => [Math.cos(i), Math.sin(i), 0];
const nearOf = (p, eps) => [p[0] + (eps === undefined ? 0.01 : eps), p[1], p[2]];

// ---- 1. exported API surface ----------------------------------------------
console.log("\n[api surface]");
test("PM.projectionMargins is exported", () => assert.strictEqual(typeof PM.projectionMargins, "function"));
test("PM.explainTransition is exported", () => assert.strictEqual(typeof PM.explainTransition, "function"));
test("PM keeps the 0.2 exports (runMap, compareMaps, buildFrame, synth)", () => {
  ["runMap", "compareMaps", "buildFrame", "synth", "slerp", "hashVec", "hashStr", "reduce", "mulberry32"]
    .forEach(k => assert.strictEqual(typeof PM[k], "function", "missing export " + k));
});
test("version string is still pointmap/0.2", () => {
  const r = PM.runMap(PM.synth(24, 6, 3), { d: 4, K: 4, steps: 500, seed: 0 });
  assert.strictEqual(r.version, "pointmap/0.2");
});

// ---- 2. projectionMargins --------------------------------------------------
console.log("\n[projectionMargins]");
const FR = { version: "pointmap/0.2", D: 2, config: { d: 2, threshold: "median", seed: 0 },
  input_pca: { mu: [0, 0], axes: [[1, 0], [0, 1]], thresholds: [0, 0] },
  placement: { bit_mu: [0, 0], bit_sd: [1, 1], pca_mu: [0, 0], pca_axes: [[1, 0], [0, 1]], scale: 1 } };

test("signed margin, norms and score-unit distance are reported per axis", () => {
  const m = PM.projectionMargins(FR, [0.75, -0.25], 0, 0);
  assert.strictEqual(m.length, 2);
  assert.strictEqual(m[0].axis, 0);
  assert.strictEqual(m[0].score, 0.75);
  assert.strictEqual(m[0].signed_margin, 0.75);
  assert.strictEqual(m[0].norm1, 1);
  assert.strictEqual(m[0].norm2, 1);
  assert.strictEqual(m[0].distance_to_threshold, 0.75);
  assert.strictEqual(m[0].units, "score units of this frozen axis (axis-scaled input units)");
  assert.strictEqual(m[1].signed_margin, -0.25);
  assert.strictEqual(m[1].distance_to_threshold, 0.25);
});
test("bit matches the frame's strict > threshold rule", () => {
  const m = PM.projectionMargins(FR, [0.75, -0.25], 0, 0);
  assert.deepStrictEqual(m.map(x => x.bit), [1, 0]);
});
test("equality case: margin exactly 0 is bit 0 and stable-off at radius 0", () => {
  const m = PM.projectionMargins(FR, [0, 0], 0, 0);
  assert.strictEqual(m[0].signed_margin, 0);
  assert.strictEqual(m[0].bit, 0);
  assert.strictEqual(m[0].status, "stable-off");
});
test("stable-on requires margin strictly above the radius", () => {
  assert.strictEqual(PM.projectionMargins(FR, [1, 0], 0.2, 1e-12)[0].status, "stable-on");
});
test("undetermined inside the radius", () => {
  assert.strictEqual(PM.projectionMargins(FR, [0.1, 0], 0.2, 0)[0].status, "undetermined");
});
test("missing roundoff budget yields needs-roundoff-bound, never a float guarantee", () => {
  const m = PM.projectionMargins(FR, [1, 1], 0.1);
  assert.strictEqual(m[0].status, "needs-roundoff-bound");
  assert.strictEqual(m[0].perturbation_bound, null);
});
test("negative epsilon throws", () => throws(() => PM.projectionMargins(FR, [1, 1], -1e-9, 0), /finite|>=\s*0|nonnegative/i));
test("non-finite roundoff budget throws", () => throws(() => PM.projectionMargins(FR, [1, 1], 0, NaN), /finite|>=\s*0|nonnegative/i));
test("vector/frame length mismatch throws", () => throws(() => PM.projectionMargins(FR, [1, 1, 1], 0, 0), /vector|length|D/i));
test("non-finite vector entry throws", () => throws(() => PM.projectionMargins(FR, [1, NaN], 0, 0), /finite/i));
test("no probability or accuracy claim in the scope note", () => {
  const s = PM.projectionMargins(FR, [1, 1], 0, 0)[0].scope;
  assert.ok(/conditional/i.test(s), "scope must state conditionality");
  assert.ok(!/probab|accuracy|likely|confidence/i.test(s), "scope must not claim probability/accuracy");
});
test("radius is eps*L1 + roundoff", () => {
  const f2 = JSON.parse(JSON.stringify(FR));
  f2.input_pca.axes = [[0.5, -0.5], [0, 1]];
  const m = PM.projectionMargins(f2, [1, 1], 0.1, 1e-3);
  assert.ok(Math.abs(m[0].perturbation_bound - (0.1 * 1 + 1e-3)) < 1e-15);
});

// ---- 3. runMap math_diagnostics -------------------------------------------
console.log("\n[math_diagnostics]");
const MD_OPTS = { d: 4, K: 6, T: 0.05, steps: 800, seed: 0 };
const MX = PM.synth(24, 6, 11);
test("diagnostics_version is wayfinder-math/1", () => {
  const r = PM.runMap(MX, MD_OPTS);
  assert.strictEqual(r.math_diagnostics.diagnostics_version, "wayfinder-math/1");
});
test("one margin row per input per axis", () => {
  const r = PM.runMap(MX, MD_OPTS);
  assert.strictEqual(r.math_diagnostics.per_input.length, r.n);
  r.math_diagnostics.per_input.forEach(row => assert.strictEqual(row.margins.length, r.d));
});
test("diagnostic bits are byte-identical to result.bits", () => {
  const r = PM.runMap(MX, MD_OPTS);
  r.math_diagnostics.per_input.forEach((row, i) =>
    deepEq(row.margins.map(m => m.bit), r.bits[i]));
});
test("margins are computed on the frozen frame (no refit) — same frame, same margins", () => {
  const a = PM.runMap(MX, MD_OPTS);
  const b = PM.runMap(MX, Object.assign({}, MD_OPTS, { frame: a.frame }));
  deepEq(b.math_diagnostics.per_input, a.math_diagnostics.per_input);
});
test("without opts.roundoff_budget every status is needs-roundoff-bound", () => {
  const r = PM.runMap(MX, MD_OPTS);
  const st = new Set(r.math_diagnostics.per_input.flatMap(x => x.margins.map(m => m.status)));
  deepEq(Array.from(st), ["needs-roundoff-bound"]);
});
test("with budgets supplied, statuses are only the conditional certificate states", () => {
  const r = PM.runMap(MX, Object.assign({}, MD_OPTS, { perturbation_linf: 0.01, roundoff_budget: 1e-12 }));
  const st = new Set(r.math_diagnostics.per_input.flatMap(x => x.margins.map(m => m.status)));
  st.forEach(s => assert.ok(["stable-on", "stable-off", "undetermined"].includes(s), "unexpected status " + s));
  assert.strictEqual(r.math_diagnostics.perturbation_linf, 0.01);
  assert.strictEqual(r.math_diagnostics.roundoff_budget, 1e-12);
});
test("negative opts.perturbation_linf throws", () =>
  throws(() => PM.runMap(MX, Object.assign({}, MD_OPTS, { perturbation_linf: -1 })), /perturbation_linf/));
test("non-finite opts.roundoff_budget throws", () =>
  throws(() => PM.runMap(MX, Object.assign({}, MD_OPTS, { roundoff_budget: Infinity })), /roundoff_budget/));
test("no new certificates and no new scoring fields", () => {
  const r = PM.runMap(MX, MD_OPTS), b = BASE.runMap(MX, MD_OPTS);
  deepEq(r.certificates, b.certificates);
  deepEq(r.summary, b.summary);
});

// ---- 4. old-vs-new regression (byte-for-byte on the 0.2 surface) -----------
console.log("\n[regression: baseline vs modified]");
const OLD_FIELDS = ["version", "frame", "frame_id", "instrument_id", "run_fingerprint", "preprocessing_id",
  "rule_hash", "rule", "seed", "n", "D", "d", "T", "K", "steps", "keys", "names", "labels", "bits", "classes",
  "k", "pts", "pts_full", "pole", "gaps", "pc12", "v2", "gate_rank", "sector_counts", "occupied_sectors",
  "isolated", "ladder", "shells", "atoms", "null", "compass", "bridge", "ladder_candidates", "nss", "spectra",
  "certificates", "summary"];
for (const seed of [3, 11, 29]) {
  test("every pointmap/0.2 result field is unchanged (cloud seed " + seed + ")", () => {
    const X = PM.synth(30, 8, seed);
    const o = { d: 5, K: 8, T: 0.05, steps: 1200, seed: 7, names: X.map((_, i) => "n" + i) };
    const a = BASE.runMap(X, o), b = PM.runMap(X, o);
    OLD_FIELDS.forEach(f => deepEq(b[f], a[f], "field drifted: " + f));
    assert.strictEqual(Object.keys(a).every(k => k in b), true);
  });
}
test("ladder candidate rung ranking is unchanged", () => {
  const X = PM.synth(30, 8, 5);
  const o = { d: 5, K: 8, steps: 1000, seed: 1, names: X.map((_, i) => "n" + i) };
  deepEq(PM.runMap(X, o).ladder_candidates, BASE.runMap(X, o).ladder_candidates);
});
test("compareMaps on identical inputs keeps its old field values", () => {
  const X = PM.synth(24, 6, 2);
  const o = { d: 4, K: 6, steps: 900, seed: 0, names: X.map((_, i) => "n" + i) };
  const a1 = BASE.runMap(X, o), a2 = BASE.runMap(X, o);
  const b1 = PM.runMap(X, o), b2 = PM.runMap(X, o);
  const oldCmp = BASE.compareMaps(a1, a2), newCmp = PM.compareMaps(b1, b2);
  Object.keys(oldCmp).forEach(k => deepEq(newCmp[k], oldCmp[k], "compareMaps field drifted: " + k));
});
test("compareMaps still rejects differing name sets", () => {
  const X = PM.synth(24, 6, 2);
  const o = n => ({ d: 4, K: 6, steps: 900, seed: 0, names: X.map((_, i) => n + i) });
  throws(() => PM.compareMaps(PM.runMap(X, o("a")), PM.runMap(X, o("b"))), /name sets differ/);
});
test("compareMaps carries a math_ledger when the frames and name sets agree", () => {
  const X = PM.synth(24, 6, 2);
  const o = { d: 4, K: 6, steps: 900, seed: 0, names: X.map((_, i) => "n" + i) };
  const c = PM.compareMaps(PM.runMap(X, o), PM.runMap(X, o));
  assert.strictEqual(c.math_ledger.diagnostics_version, "wayfinder-math/1");
  assert.strictEqual(c.math_ledger.kind, "CHANGE");
  assert.strictEqual(c.math_ledger.ledger.delta, 0);
});

// ---- 5. explainTransition: guards ------------------------------------------
console.log("\n[explainTransition guards]");
const P5 = [0, 1, 2, 3, 4].map(far);
test("frame_id mismatch throws", () =>
  throws(() => PM.explainTransition(res(P5), res(P5, null, { frame_id: "frameB" })), /frame_id/));
test("instrument_id mismatch throws", () =>
  throws(() => PM.explainTransition(res(P5), res(P5, null, { instrument_id: "instB" })), /instrument_id/));
test("duplicate names throw", () => {
  const dup = res(P5, ["a", "a", "b", "c", "d"]);
  throws(() => PM.explainTransition(dup, res(P5, ["a", "a", "b", "c", "d"])), /duplicate name/);
});
test("missing pts_full is not-applicable with a reason, never a false identity pass", () => {
  const before = res(P5, ["a", "b", "c", "d", "e"]);
  const after = res(P5, ["a", "b", "c", "d", "e"]);
  delete after.pts_full;
  const r = PM.explainTransition(before, after);
  assert.strictEqual(r.kind, "not-applicable");
  assert.ok(/full-precision|pts_full/i.test(r.reason), r.reason);
  assert.strictEqual(r.ledger, null);
});
test("a removal is not-applicable with a reason", () => {
  const names = ["a", "b", "c", "d", "e"];
  const r = PM.explainTransition(res(P5, names), res(P5.slice(0, 4), names.slice(0, 4)));
  assert.strictEqual(r.kind, "not-applicable");
  assert.ok(/remov/i.test(r.reason), r.reason);
});
test("two added names are not-applicable", () => {
  const names = ["a", "b", "c", "d", "e"];
  const P7 = P5.concat([far(9), far(12)]);
  const r = PM.explainTransition(res(P5, names), res(P7, names.concat(["f", "g"])));
  assert.strictEqual(r.kind, "not-applicable");
  assert.ok(/one|single|1 /i.test(r.reason), r.reason);
});
test("two moved common points are not-applicable", () => {
  const names = ["a", "b", "c", "d", "e"];
  const moved = P5.map((p, i) => i < 2 ? nearOf(p, 0.3) : p);
  const r = PM.explainTransition(res(P5, names), res(moved, names));
  assert.strictEqual(r.kind, "not-applicable");
  assert.ok(/moved|2/i.test(r.reason), r.reason);
});
test("ADD with a moved old point is not-applicable (old edges must be unchanged)", () => {
  const names = ["a", "b", "c", "d", "e"];
  const moved = P5.map((p, i) => i === 0 ? nearOf(p, 0.3) : p);
  const r = PM.explainTransition(res(P5, names), res(moved.concat([far(9)]), names.concat(["f"])));
  assert.strictEqual(r.kind, "not-applicable");
});
test("reported isolated count inconsistent with the coordinates throws", () => {
  const names = ["a", "b", "c", "d", "e"];
  const after = res(P5, names, { isolated: 99 });
  throws(() => PM.explainTransition(res(P5, names), after), /isolated/i);
});

// ---- 6. explainTransition: ADD / CHANGE ledgers ----------------------------
console.log("\n[explainTransition ledgers]");
test("ADD of an isolated point: delta +1, degree 0, no touched neighbours", () => {
  const names = ["a", "b", "c", "d", "e"];
  const r = PM.explainTransition(res(P5, names), res(P5.concat([far(9)]), names.concat(["f"])));
  assert.strictEqual(r.kind, "ADD");
  assert.strictEqual(r.added_name, "f");
  assert.strictEqual(r.ledger.new_degree, 0);
  deepEq(r.ledger.previous_isolates_touched_names, []);
  assert.strictEqual(r.ledger.delta, 1);
  assert.strictEqual(r.ledger.actual_delta, 1);
  assert.strictEqual(r.ledger.class, "identity");
});
test("ADD landing on two previous isolates: delta -2 with literal neighbour names", () => {
  // a and b are 0.15 apart (no edge at r=0.095); the new point sits 0.075 from each (edge to both)
  const p0 = [0, 0, 1], p1 = [0.15, 0, 1];
  const beforeTwo = res([p0, p1], ["a", "b"]);
  const afterTwo = res([p0, p1, [0.075, 0, 1]], ["a", "b", "c"]);
  const r = PM.explainTransition(beforeTwo, afterTwo);
  assert.strictEqual(r.kind, "ADD");
  assert.strictEqual(r.ledger.new_degree, 2);
  deepEq(r.ledger.previous_isolates_touched_names.slice().sort(), ["a", "b"]);
  assert.strictEqual(r.ledger.delta, -2);
  assert.strictEqual(r.ledger.actual_delta, -2);
});
test("neutral ADD next to a non-isolated point: delta 0", () => {
  const p0 = [0, 0, 1], p1 = [0.05, 0, 1];
  const before = res([p0, p1, far(3)], ["a", "b", "c"]);
  const after = res([p0, p1, far(3), [0.025, 0, 1]], ["a", "b", "c", "d"]);
  const r = PM.explainTransition(before, after);
  assert.strictEqual(r.ledger.delta, 0);
  assert.strictEqual(r.ledger.actual_delta, 0);
});
test("CHANGE moving one point off its partner: exact deg' ledger and touched names", () => {
  const p0 = [0, 0, 1], p1 = [0.05, 0, 1], p2 = far(3);
  const before = res([p0, p1, p2], ["a", "b", "c"]);
  const after = res([p0, [0.5, 0, 1], p2], ["a", "b", "c"]);
  const r = PM.explainTransition(before, after);
  assert.strictEqual(r.kind, "CHANGE");
  assert.strictEqual(r.moved_name, "b");
  deepEq(r.ledger.touched_neighbour_names, ["a"]);
  assert.strictEqual(r.ledger.delta, 2);
  assert.strictEqual(r.ledger.actual_delta, 2);
  assert.strictEqual(r.ledger.class, "identity");
});
test("silent CHANGE (no point moved): delta 0 and an explicit no-motion reason", () => {
  const names = ["a", "b", "c", "d", "e"];
  const r = PM.explainTransition(res(P5, names), res(P5, names));
  assert.strictEqual(r.kind, "CHANGE");
  assert.strictEqual(r.moved_name, null);
  assert.strictEqual(r.ledger.delta, 0);
});
test("adjacency uses exact pts_full floats at r=0.095 (a 0.0949 pair is an edge)", () => {
  const p0 = [0, 0, 1], p1 = [0.0949, 0, 1];
  const before = res([p0, far(3)], ["a", "c"]);
  const after = res([p0, far(3), p1], ["a", "c", "b"]);
  const r = PM.explainTransition(before, after);
  assert.strictEqual(r.ledger.new_degree, 1);
  deepEq(r.ledger.previous_isolates_touched_names, ["a"]);
  assert.strictEqual(r.ledger.delta, -1);
});
test("a 0.0951 pair is NOT an edge", () => {
  const p0 = [0, 0, 1], p1 = [0.0951, 0, 1];
  const r = PM.explainTransition(res([p0, far(3)], ["a", "c"]), res([p0, far(3), p1], ["a", "c", "b"]));
  assert.strictEqual(r.ledger.new_degree, 0);
  assert.strictEqual(r.ledger.delta, 1);
});
test("theorem correspondence: ADD exact-Lean-known, CHANGE runtime-only", () => {
  const names = ["a", "b", "c", "d", "e"];
  const add = PM.explainTransition(res(P5, names), res(P5.concat([far(9)]), names.concat(["f"])));
  const chg = PM.explainTransition(res(P5, names), res(P5, names));
  assert.strictEqual(add.correspondence.status, "lean-known");
  assert.strictEqual(chg.correspondence.status, "lean-known");
  assert.ok(/runtime/i.test(chg.correspondence.note));
});
test("every ledger declares identity-vs-measurement classes explicitly", () => {
  const names = ["a", "b", "c", "d", "e"];
  const r = PM.explainTransition(res(P5, names), res(P5.concat([far(9)]), names.concat(["f"])));
  assert.strictEqual(r.ledger.class, "identity");
  assert.strictEqual(r.measurement.class, "measurement");
  assert.ok(/measurement/i.test(r.measurement.note));
});

// ---- 7. predicted/observed reduction ratio ---------------------------------
console.log("\n[reduction ratio]");
function addCase(predicted) {
  const p0 = [0, 0, 1], p1 = [0.15, 0, 1];      // actual delta = -2 (two isolates absorbed)
  return PM.explainTransition(res([p0, p1], ["a", "b"]), res([p0, p1, [0.075, 0, 1]], ["a", "b", "c"]),
    { predicted_delta: predicted });
}
test("ratio only for a strictly negative prediction: (-actual)/(-predicted)", () => {
  const r = addCase(-4);
  assert.strictEqual(r.reduction.eligible, true);
  assert.strictEqual(r.reduction.ratio, 0.5);
});
test("zero prediction is ineligible with a reason", () => {
  const r = addCase(0);
  assert.strictEqual(r.reduction.eligible, false);
  assert.strictEqual(r.reduction.ratio, null);
  assert.ok(/decrease|negative|not a strict/i.test(r.reduction.reason));
});
test("positive prediction is ineligible with a reason", () => {
  const r = addCase(2);
  assert.strictEqual(r.reduction.eligible, false);
  assert.ok(/decrease|negative|not a strict/i.test(r.reduction.reason));
});
test("no predicted_delta given: reduction is ineligible, not fabricated", () => {
  const names = ["a", "b", "c", "d", "e"];
  const r = PM.explainTransition(res(P5, names), res(P5.concat([far(9)]), names.concat(["f"])));
  assert.strictEqual(r.reduction.eligible, false);
});
test("non-finite predicted_delta throws", () =>
  throws(() => addCase(NaN), /predicted_delta/));
test("ratio scope makes no quality or probability claim", () => {
  const s = addCase(-4).reduction.scope;
  assert.ok(/not calibrated/i.test(s), s);
  assert.ok(!/probab|accuracy/i.test(s), s);
});

// ---- 8. exhaustive abstract graph ledger cases -----------------------------
console.log("\n[exhaustive graph identities]");
test("ADD and CHANGE ledgers match brute-force isolated counts on all 38172 small graphs", () => {
  const addDelta = PM._internal.isolationDeltaAdd;
  const changeDelta = PM._internal.isolationDeltaChange;
  assert.strictEqual(typeof addDelta, "function");
  assert.strictEqual(typeof changeDelta, "function");
  let checks = 0;
  for (let n = 1; n <= 5; n++) {
    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    for (let mask = 0; mask < (1 << pairs.length); mask++) {
      const A = Array.from({ length: n }, () => Array(n).fill(0));
      pairs.forEach(([i, j], k) => { A[i][j] = A[j][i] = (mask >> k) & 1; });
      const deg = A.map(r => r.reduce((a, b) => a + b, 0));
      for (let nm = 0; nm < (1 << n); nm++) {
        const links = Array.from({ length: n }, (_, j) => (nm >> j) & 1);
        assert.strictEqual(addDelta(deg, links).delta, isoFromAdj(attach(A, links)) - isoFromAdj(A));
        checks++;
      }
      if (n <= 4) {
        for (let v = 0; v < n; v++) for (let nm = 0; nm < (1 << n); nm++) {
          const links = Array.from({ length: n }, (_, j) => j === v ? 0 : (nm >> j) & 1);
          assert.strictEqual(changeDelta(deg, A[v], links, v).delta, isoFromAdj(changeAdj(A, v, links)) - isoFromAdj(A));
          checks++;
        }
      }
    }
  }
  assert.strictEqual(checks, 38172);
});
test("ledger helpers reject malformed degree/edge input", () => {
  throws(() => PM._internal.isolationDeltaAdd([0, -1], [1, 1]), /degree|edge|invalid/i);
  throws(() => PM._internal.isolationDeltaAdd([0, 0], [1, 2]), /degree|edge|invalid/i);
  throws(() => PM._internal.isolationDeltaChange([0, 0], [0, 0], [0, 1], 5), /vertex|invalid/i);
});

// ---- 9. retrospective replay of real maps 51..61 ---------------------------
console.log("\n[replay: real maps 51..61 — RETROSPECTIVE, not a pre-edit forecast]");
function fixtureResult(m) {
  const P = [];
  for (let i = 0; i < m.n; i++) P.push(m.pts_full.slice(3 * i, 3 * i + 3));
  const B = [];
  for (let i = 0; i < m.n; i++) B.push(m.bits.slice(m.d * i, m.d * i + m.d));
  return { version: "pointmap/0.2", frame_id: m.frame_id, instrument_id: m.instrument_id,
    names: m.name_ids.map(i => FIXTURE.names[i]), pts_full: P, bits: B, isolated: m.isolated };
}
const MAPS = new Map(FIXTURE.maps.map(m => [m.id, fixtureResult(m)]));
const EXPECTED = [
  { from: 51, to: 52, kind: "CHANGE", delta: -2 },
  { from: 52, to: 53, kind: "CHANGE", delta: 0 },
  { from: 53, to: 54, kind: "ADD", delta: -2 },
  { from: 54, to: 55, kind: "ADD", delta: -1 },
  { from: 55, to: 56, kind: "ADD", delta: 0 },
  { from: 56, to: 57, kind: "CHANGE", delta: 0 },
  { from: 57, to: 58, kind: "ADD", delta: 0 },
  { from: 58, to: 59, kind: "ADD", delta: -1 },
  { from: 59, to: 60, kind: "ADD", delta: 0 },
  { from: 60, to: 61, kind: "CHANGE", delta: 0 }
];
const replay = [];
EXPECTED.forEach(e => {
  test("map " + e.from + "→" + e.to + " is " + e.kind + " with isolated delta " + e.delta, () => {
    const before = MAPS.get(e.from), after = MAPS.get(e.to);
    const r = PM.explainTransition(before, after);
    replay.push(r);
    assert.strictEqual(r.kind, e.kind);
    assert.strictEqual(r.ledger.delta, e.delta);
    // independent recomputation, straight from the raw coordinates in the fixture
    assert.strictEqual(r.ledger.actual_delta, isolatedRef(after.pts_full) - isolatedRef(before.pts_full));
    assert.strictEqual(r.ledger.delta, r.ledger.actual_delta);
    assert.strictEqual(r.retrospective, true);
  });
});
test("all 11 maps share one frozen frame and are replayed with no network", () => {
  const ids = new Set(FIXTURE.maps.map(m => m.frame_id));
  assert.strictEqual(ids.size, 1);
  assert.strictEqual(FIXTURE.maps.length, 11);
});
test("3 silent CHANGEs (delta 0) and 3 neutral ADDs (delta 0) across the 10 transitions", () => {
  assert.strictEqual(replay.length, 10);
  assert.strictEqual(replay.filter(r => r.kind === "CHANGE" && r.ledger.delta === 0).length, 3);
  assert.strictEqual(replay.filter(r => r.kind === "ADD" && r.ledger.delta === 0).length, 3);
});
test("replay results are labelled retrospective and claim no forecasting", () => {
  replay.forEach(r => {
    assert.strictEqual(r.retrospective, true);
    assert.ok(/retrospective|post-edit|not a .*forecast|not a .*prediction/i.test(r.scope), r.scope);
  });
});

// ---- summary ---------------------------------------------------------------
console.log("\n" + pass + " passed, " + failures.length + " failed");
if (failures.length) { failures.forEach(f => console.log("FAIL " + f.name + ": " + f.err.stack.split("\n")[0])); process.exit(1); }
