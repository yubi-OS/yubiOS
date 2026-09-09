// test-pointmap.js — node regression suite for pointmap.js (frozen-frame edition).
// Run: node session/subagent/point-map/test-pointmap.js
// pointmap.js is a dependency-free browser/Worker IIFE (`var PM = ...`) with no module
// exports, so the suite loads it into a vm sandbox exactly the way a <script> tag would.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const SRC = path.join(__dirname, "pointmap.js");
const sandbox = { console, TextEncoder, Math, JSON };
vm.createContext(sandbox);
new vm.Script(fs.readFileSync(SRC, "utf8"), { filename: "pointmap.js" }).runInContext(sandbox);
const PM = sandbox.PM;

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { failures.push({ name, err: e }); console.log("  FAIL " + name + " — " + e.message); }
}
function throws(fn, re, msg) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  assert.ok(threw, "expected a throw: " + (msg || ""));
  if (re) assert.ok(re.test(threw.message), "throw message " + JSON.stringify(threw.message) + " !~ " + re);
}

// ---- fixtures -------------------------------------------------------------
const N = 24, D = 6;
const BASE_OPTS = { d: 4, K: 12, T: 0.05, steps: 4000, seed: 0 };
function cloud(seed) { return PM.synth(N, D, seed === undefined ? 11 : seed); }
function names(n) { return Array.from({ length: n === undefined ? N : n }, (_, i) => "item-" + i + ".md"); }
function opts(extra) { return Object.assign({}, BASE_OPTS, { names: names() }, extra || {}); }
const X = cloud();

// ---- 1. input validation --------------------------------------------------
console.log("\n[validation]");
test("rejects ragged rows", () => {
  const bad = X.map(r => r.slice()); bad[3] = bad[3].slice(0, D - 1);
  throws(() => PM.runMap(bad, opts()), /ragged|length|rectangular/i);
});
test("rejects non-finite cells (NaN / Infinity)", () => {
  const bad = X.map(r => r.slice()); bad[2][1] = NaN;
  throws(() => PM.runMap(bad, opts()), /finite/i);
  const bad2 = X.map(r => r.slice()); bad2[2][1] = Infinity;
  throws(() => PM.runMap(bad2, opts()), /finite/i);
});
test("rejects N below 10 and above 400", () => {
  throws(() => PM.runMap(cloud().slice(0, 9), opts({ names: names(9) })), /10\.\.400|N must/i);
  const big = PM.synth(401, D, 3);
  throws(() => PM.runMap(big, opts({ names: names(401) })), /10\.\.400|N must/i);
});
test("rejects D below 2 and above 768", () => {
  throws(() => PM.runMap(X.map(r => [r[0]]), opts()), /D must|2\.\.768/i);
});
test("rejects K=1 and non-integer / out-of-range K", () => {
  throws(() => PM.runMap(X, opts({ K: 1 })), /K/);
  throws(() => PM.runMap(X, opts({ K: 2.5 })), /K/);
  throws(() => PM.runMap(X, opts({ K: 201 })), /K/);
});
test("rejects T=0 and non-finite T", () => {
  throws(() => PM.runMap(X, opts({ T: 0 })), /T/);
  throws(() => PM.runMap(X, opts({ T: -1 })), /T/);
  throws(() => PM.runMap(X, opts({ T: NaN })), /T/);
});
test("rejects d outside 2..24, caps d to rank dimensions", () => {
  throws(() => PM.runMap(X, opts({ d: 1 })), /d/);
  throws(() => PM.runMap(X, opts({ d: 25 })), /d/);
  const r = PM.runMap(X, opts({ d: 24 }));
  assert.ok(r.d <= Math.min(D, N - 1), "d capped to rank: got " + r.d);
});
test("rejects misaligned / invalid names and labels without silent filtering", () => {
  throws(() => PM.runMap(X, opts({ names: names(N - 1) })), /names/i);
  const bad = names(); bad[4] = 7;
  throws(() => PM.runMap(X, opts({ names: bad })), /names/i);
  const empty = names(); empty[4] = "";
  throws(() => PM.runMap(X, opts({ names: empty })), /names/i);
  throws(() => PM.runMap(X, opts({ labels: names(3) })), /labels/i);
});
test("seed 0 is respected (not replaced by the default)", () => {
  const a = PM.runMap(X, opts({ seed: 0 }));
  const b = PM.runMap(X, opts({ seed: 20260906 }));
  assert.strictEqual(a.seed, 0, "seed 0 must survive");
  assert.notStrictEqual(a.instrument_id, b.instrument_id, "seed is part of the instrument id");
});

// ---- 2. frame: freeze, reuse, drift ---------------------------------------
console.log("\n[frame]");
test("deterministic: two identical runs agree bit-for-bit", () => {
  const a = PM.runMap(X, opts()), b = PM.runMap(X, opts());
  assert.strictEqual(a.frame_id, b.frame_id);
  assert.strictEqual(a.instrument_id, b.instrument_id);
  assert.strictEqual(a.run_fingerprint, b.run_fingerprint);
  assert.deepStrictEqual(a.pts, b.pts);
  assert.deepStrictEqual(a.bits, b.bits);
});
test("frame is explicit and full precision (input PCA + placement)", () => {
  const r = PM.runMap(X, opts());
  const f = r.frame;
  assert.ok(f && f.input_pca && f.placement, "frame has input_pca + placement");
  assert.strictEqual(f.input_pca.mu.length, D);
  assert.strictEqual(f.input_pca.axes.length, r.d);
  assert.strictEqual(f.input_pca.thresholds.length, r.d);
  assert.strictEqual(f.placement.bit_mu.length, r.d);
  assert.strictEqual(f.placement.bit_sd.length, r.d);
  assert.strictEqual(f.placement.pca_mu.length, r.d);
  assert.strictEqual(f.placement.pca_axes.length, 2);
  assert.ok(Number.isFinite(f.placement.scale) && f.placement.scale > 0);
  assert.strictEqual(f.D, D);
  assert.strictEqual(f.config.d, r.d);
  const rounded = f.input_pca.axes[0].every(x => Math.abs(x - +x.toFixed(5)) < 1e-15);
  assert.ok(!rounded, "frame axes must not be rounded to 5dp");
  assert.strictEqual(r.rule_hash, r.frame_id, "rule_hash is the frame_id alias");
});
test("no-op re-run on the prior frame is a fixed point", () => {
  const a = PM.runMap(X, opts());
  const b = PM.runMap(X, opts({ frame: a.frame }));
  assert.strictEqual(b.frame_id, a.frame_id);
  assert.deepStrictEqual(b.bits, a.bits);
  assert.deepStrictEqual(b.pts, a.pts);
  assert.deepStrictEqual(b.pole, a.pole);
});
test("frame survives a JSON round-trip", () => {
  const a = PM.runMap(X, opts());
  const frame = JSON.parse(JSON.stringify(a.frame));
  const b = PM.runMap(X, opts({ frame }));
  assert.strictEqual(b.frame_id, a.frame_id);
  assert.deepStrictEqual(b.pts, a.pts);
});
test("frame drift is rejected (D, d, threshold, version)", () => {
  const a = PM.runMap(X, opts());
  const wideX = PM.synth(N, D + 1, 5);
  throws(() => PM.runMap(wideX, opts({ frame: a.frame })), /drift|D/i);
  const f2 = JSON.parse(JSON.stringify(a.frame)); f2.config.d = a.d + 1;
  throws(() => PM.runMap(X, opts({ frame: f2 })), /drift|d/i);
  const f3 = JSON.parse(JSON.stringify(a.frame)); f3.config.threshold = "zero";
  throws(() => PM.runMap(X, opts({ frame: f3, threshold: "median" })), /drift|threshold/i);
  const f4 = JSON.parse(JSON.stringify(a.frame)); f4.version = "pointmap/0.0-other";
  throws(() => PM.runMap(X, opts({ frame: f4 })), /drift|version/i);
});
test("instrument_id covers preprocessing_id (default raw/v1)", () => {
  const a = PM.runMap(X, opts());
  const b = PM.runMap(X, opts({ preprocessing_id: "pca768/v2" }));
  assert.strictEqual(a.preprocessing_id, "raw/v1");
  assert.notStrictEqual(a.instrument_id, b.instrument_id);
  assert.strictEqual(a.frame_id, b.frame_id, "numeric frame is unchanged by the preprocessing label");
});
test("long names are preserved verbatim", () => {
  const long = "x".repeat(300) + "-tail.md";
  const nm = names(); nm[0] = long;
  const r = PM.runMap(X, opts({ names: nm }));
  assert.strictEqual(r.keys[0].name, long);
  assert.strictEqual(r.names[0], long);
});

// ---- 3. compareMaps -------------------------------------------------------
console.log("\n[compareMaps]");
test("no-op comparison: zero displacement, all anchors unchanged", () => {
  const a = PM.runMap(X, opts());
  const b = PM.runMap(X, opts({ frame: a.frame }));
  const c = PM.compareMaps(a, b);
  assert.strictEqual(c.bits_changed_total, 0);
  assert.strictEqual(c.unchanged_anchors, N);
  assert.strictEqual(c.max_displacement_geodesic, 0);
  assert.strictEqual(c.task_verdict, "not-tested");
});
test("single-vector edit moves exactly one anchor", () => {
  const a = PM.runMap(X, opts());
  const X2 = X.map(r => r.slice());
  // copy a row whose frozen bit pattern differs, so the edit is guaranteed to move item-5
  const donor = a.bits.findIndex(b => b.join("") !== a.bits[5].join(""));
  assert.ok(donor >= 0, "fixture needs at least two distinct bit patterns");
  X2[5] = X[donor].slice();
  const b = PM.runMap(X2, opts({ frame: a.frame }));
  const c = PM.compareMaps(a, b);
  assert.strictEqual(c.changed_names.length, 1, "exactly one name moved");
  assert.strictEqual(c.changed_names[0], "item-5.md");
  assert.strictEqual(c.unchanged_anchors, N - 1);
  assert.ok(c.bits_changed_total >= 1, "at least one bit changed");
  assert.strictEqual(c.task_verdict, "not-tested");
  assert.ok(/diagnostic/i.test(c.geometry_decision_note || ""), "geometry decision is diagnostic only");
});
test("row reordering compares to zero (name-keyed, not ordinal-keyed)", () => {
  const a = PM.runMap(X, opts());
  const perm = [...Array(N).keys()].reverse();
  const X2 = perm.map(i => X[i].slice());
  const nm = perm.map(i => "item-" + i + ".md");
  const b = PM.runMap(X2, opts({ frame: a.frame, names: nm }));
  const c = PM.compareMaps(a, b);
  assert.strictEqual(c.bits_changed_total, 0);
  assert.strictEqual(c.max_displacement_geodesic, 0);
  assert.strictEqual(c.unchanged_anchors, N);
});
test("compare rejects frame / instrument mismatch", () => {
  const a = PM.runMap(X, opts());
  const b = PM.runMap(X, opts({ d: 3 }));
  throws(() => PM.compareMaps(a, b), /frame_id|instrument_id/i);
  const c = PM.runMap(X, opts({ preprocessing_id: "other/v9" }));
  throws(() => PM.compareMaps(a, c), /instrument_id/i);
});
test("compare rejects duplicate names and a changed name set", () => {
  const dup = names(); dup[1] = dup[0];
  const a = PM.runMap(X, opts());
  const b = PM.runMap(X, opts({ frame: a.frame, names: dup }));
  throws(() => PM.compareMaps(a, b), /duplicate/i);
  const nm = names(); nm[2] = "renamed.md";
  const c = PM.runMap(X, opts({ frame: a.frame, names: nm }));
  throws(() => PM.compareMaps(a, c), /same set|missing|added/i);
});
test("compare reports isolation and occupancy deltas", () => {
  const a = PM.runMap(X, opts());
  const b = PM.runMap(X, opts({ frame: a.frame }));
  const c = PM.compareMaps(a, b);
  assert.strictEqual(c.isolated_delta, 0);
  assert.strictEqual(c.occupied_sectors_delta, 0);
});

// ---- 4. candidate ladder --------------------------------------------------
console.log("\n[ladder]");
test("ladder is frozen-frame, atomic (one added row), never instructs removal", () => {
  const r = PM.runMap(X, opts());
  const L = r.ladder_candidates;
  assert.ok(Array.isArray(L.rungs), "rungs array");
  for (const c of L.rungs) {
    assert.ok(["add", "change"].indexOf(c.action) >= 0, "no auto-ranked remove: " + c.action);
    if (c.action === "add") assert.strictEqual(c.rows_added, 1, "atomic add == 1 row");
    assert.ok(!/\b(remove|delete|drop|purge)\b/i.test(c.prompt), "no destructive instruction in prompt");
    assert.ok(/inspect the actual content/i.test(c.prompt), "prompt orders content inspection");
    assert.ok(/independent verifier/i.test(c.prompt), "prompt requires a task-specific verifier");
    assert.ok(/does not mean|not a quality/i.test(c.prompt), "prompt disclaims sign==quality");
    assert.ok(/bit-space hypothesis/i.test(c.hypothesis), "prediction framed as bit-space hypothesis");
    assert.strictEqual(c.frame_id, r.frame_id, "candidate measured on the frozen frame");
    assert.strictEqual(c.delta.pole_shift_geodesic, 0, "frozen frame ⇒ pole cannot shift");
  }
});
test("ladder ranking is lexicographic (isolated then occupancy), pole excluded", () => {
  const r = PM.runMap(X, opts());
  const rungs = r.ladder_candidates.rungs;
  for (let i = 1; i < rungs.length; i++) {
    const p = rungs[i - 1].delta, q = rungs[i].delta;
    assert.ok(p.isolated_delta < q.isolated_delta ||
      (p.isolated_delta === q.isolated_delta && p.occupied_sectors_delta >= q.occupied_sectors_delta),
      "rungs out of lexicographic order at " + i);
  }
  for (const c of rungs) assert.strictEqual(c.score, -c.delta.isolated_delta, "display score is -isolated_delta");
  assert.ok(/-isolated_delta/.test(r.ladder_candidates.score_note), "score_note states the sign");
  assert.ok(/lexicographic/i.test(r.ladder_candidates.ranking_rule));
});
test("sectors are anonymous geometry; NSS list is an uncalibrated lens dictionary", () => {
  const r = PM.runMap(X, opts());
  const L = r.ladder_candidates;
  assert.strictEqual(L.sector_counts.length, 12);
  for (const c of L.rungs) {
    assert.ok(Number.isInteger(c.sector) && c.sector >= 1 && c.sector <= 12, "sector 1..12");
    assert.strictEqual(c.semantic_status, "unvalidated");
    assert.ok(!("axis" in c) || c.axis === null, "no NSS axis assigned to a rung");
    assert.ok(/geometric sector/i.test(c.prompt), "prompt names a geometric sector");
    assert.ok(!/\b(Audience|Assumption set|Failure modes|Knowledge sources|Recursion)\b/.test(c.prompt),
      "no NSS semantics asserted in prompt");
  }
  assert.strictEqual(L.nss_lens_dictionary.semantic_status, "unvalidated");
  assert.strictEqual(L.nss_lens_dictionary.axes.length, 12);
  assert.ok(!L.nss_lens_dictionary.mapped_to_sectors, "lens dictionary is not a sector mapping");
});
test("remove is review-only audit, never a ranked instruction", () => {
  const r = PM.runMap(X, opts());
  const audit = r.ladder_candidates.review_only_audit;
  assert.ok(Array.isArray(audit.outliers), "review-only outlier list");
  assert.ok(/review only/i.test(audit.note) && /no action/i.test(audit.note));
  for (const o of audit.outliers) assert.ok(!("score" in o) && !("rung" in o), "audit entries are unranked");
});
test("no-operation is returned honestly when nothing moves", () => {
  const flat = Array.from({ length: 12 }, () => Array.from({ length: 3 }, (_, j) => j + 1));
  let r = null;
  try { r = PM.runMap(flat, { d: 2, K: 4, T: 0.05, steps: 1000, seed: 1, names: names(12) }); }
  catch (e) { r = null; }
  if (r) {
    const L = r.ladder_candidates;
    if (!L.rungs.length) {
      assert.strictEqual(L.decision, "no-operation");
      assert.ok(/no measurable move/i.test(L.reason));
    }
  }
});

// ---- 5. V2 + null ---------------------------------------------------------
console.log("\n[V2 + null]");
test("V2 is a trace-normalised share in [0,1]", () => {
  const r = PM.runMap(X, opts());
  assert.ok(r.v2 >= 0 && r.v2 <= 1 + 1e-12, "V2 out of [0,1]: " + r.v2);
  const deg = PM._internal.V2([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
  assert.ok(deg >= 0 && deg <= 1 + 1e-12 && Number.isFinite(deg), "degenerate V2: " + deg);
  const two = PM._internal.V2([[1, 0], [0, 1], [1, 0], [0, 1]]);
  assert.ok(Math.abs(two - 1) < 1e-9, "d=2 must saturate at 1, got " + two);
});
test("median threshold documented as exact median with no ceil guarantee under ties", () => {
  const r = PM.runMap(X, opts());
  assert.ok(/exact median/i.test(r.rule.note));
  assert.ok(/tie/i.test(r.rule.note) && /not guaranteed|no guarantee/i.test(r.rule.note));
});
test("null draw attempts a fixed number of symmetric proposals incl. self-loops", () => {
  const B = [[1, 0, 1, 0], [0, 1, 0, 1], [1, 1, 0, 0], [0, 0, 1, 1]];
  const cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
  const M = PM._internal.nullDraw(B, 500, PM.mulberry32(3), cert);
  assert.strictEqual(cert.attempted, 500, "attempts are fixed, not accept-counted");
  const rs = B.map(r => r.reduce((a, b) => a + b, 0)), rs2 = M.map(r => r.reduce((a, b) => a + b, 0));
  assert.deepStrictEqual(rs2, rs, "row margins preserved");
  for (let j = 0; j < 4; j++) {
    const c1 = B.reduce((a, r) => a + r[j], 0), c2 = M.reduce((a, r) => a + r[j], 0);
    assert.strictEqual(c2, c1, "col margin " + j + " preserved");
  }
});
test("tiny fibre is visited uniformly by the label-swap chain", () => {
  const B = [[1, 0], [0, 1]];
  const counts = { "1001": 0, "0110": 0 };
  const r = PM.mulberry32(7);
  for (let t = 0; t < 4000; t++) {
    const cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
    const M = PM._internal.nullDraw(B, 40, r, cert);
    counts[M.map(x => x.join("")).join("")]++;
  }
  const share = counts["1001"] / 4000;
  assert.ok(Math.abs(share - 0.5) < 0.05, "fibre share " + share + " not ~uniform");
});
test("null reports plus-one two-sided p, finite SD, descriptive z, stated resolution", () => {
  const r = PM.runMap(X, opts({ K: 40 }));
  const nl = r.null;
  assert.strictEqual(nl.K, 40);
  assert.ok(nl.p_two_sided >= 1 / 41 - 1e-12 && nl.p_two_sided <= 1, "plus-one p range: " + nl.p_two_sided);
  assert.ok(Math.abs(nl.p_resolution - 1 / 41) < 1e-12, "resolution 1/(K+1)");
  assert.ok(Number.isFinite(nl.SD0));
  assert.ok(/descriptive/i.test(nl.z_note) && /not a gaussian|no gaussian/i.test(nl.z_note));
  assert.ok(/not (a )?full curveball|label[- ]swap/i.test(nl.kind), "null labelled honestly: " + nl.kind);
});

// ---- 6. compass + slerp ---------------------------------------------------
console.log("\n[compass + slerp]");
test("analytic detailed-balance identity holds and is separate from empirical flux", () => {
  const r = PM.runMap(X, opts());
  const c = r.compass;
  assert.ok(c.flux_identity_analytic.ok, "analytic identity must hold");
  assert.ok(c.flux_identity_analytic.max_abs_residual < 1e-9);
  assert.ok(c.empirical_flux && typeof c.empirical_flux.maxAbsZ === "number", "empirical flux measured separately");
  assert.ok(!("maxFluxZ" in c.flux_identity_analytic), "empirical z is not the identity check");
});
test("stationary law is logsumexp-stable at tiny T", () => {
  const r = PM.runMap(X, opts({ T: 1e-6 }));
  const pi = r.compass.pi;
  assert.ok(pi.every(Number.isFinite), "pi has non-finite entries at T=1e-6");
  assert.ok(Math.abs(pi.reduce((a, b) => a + b, 0) - 1) < 1e-9, "pi must sum to 1");
});
test("gate_rank identity certifies the EQUIVALENCE, not the gate outcome", () => {
  const r = PM.runMap(X, opts());
  const cert = r.certificates.find(c => c.class === "identity" && /gate_rank/.test(c.theorem));
  assert.ok(cert, "gate_rank identity certificate present");
  const g = r.gate_rank;
  assert.strictEqual(g.identity_applicable, true, "V2 > 0 here, so Lean §4 applies");
  assert.strictEqual(g.gate_pass, g.v2 >= 0.4);
  assert.strictEqual(g.rank_pass, g.rhat <= 5);
  assert.strictEqual(g.identity_holds, g.gate_pass === g.rank_pass || g.at_boundary);
  assert.strictEqual(cert.ok, true, "the equivalence is an identity and must certify true");
  assert.ok(/equivalence/i.test(cert.detail), "detail states the equivalence: " + cert.detail);
  const meas = r.certificates.find(c => c.class === "measurement" && /rank gate/i.test(c.theorem));
  assert.ok(meas, "the gate outcome is certified as a MEASUREMENT, separately");
  assert.strictEqual(meas.ok, g.rank_pass === true, "measurement cert carries the gate outcome");
});
test("slerp is stable for coincident and antipodal endpoints", () => {
  const p = [0, 0, 1], q = [0, 0, -1];
  const mid = PM.slerp(p, q, 0.5);
  assert.ok(mid.every(Number.isFinite), "antipodal midpoint not finite");
  assert.ok(Math.abs(Math.hypot(mid[0], mid[1], mid[2]) - 1) < 1e-9, "antipodal midpoint off the sphere");
  const end = PM.slerp(p, q, 1);
  assert.ok(Math.hypot(end[0] - q[0], end[1] - q[1], end[2] - q[2]) < 1e-6, "t=1 must reach q");
  const same = PM.slerp([0.3, 0.4, Math.sqrt(1 - 0.25)], [0.3, 0.4, Math.sqrt(1 - 0.25)], 0.5);
  assert.ok(same.every(Number.isFinite), "coincident slerp not finite");
  const unnorm = PM.slerp([0, 0, 3], [0, 3, 0], 0.5);
  assert.ok(Math.abs(Math.hypot(...unnorm) - 1) < 1e-9, "endpoints must be normalised first");
});
test("an identity failure throws before a result is returned", () => {
  assert.strictEqual(typeof PM._internal.assertFluxIdentity, "function");
  throws(() => PM._internal.assertFluxIdentity([{ k: 0, residual: 1 }], 1e-9), /identity/i);
});

// ---- 7. spectroscopy diagnostic -------------------------------------------
console.log("\n[spectra]");
test("spectra are diagnostic-only and not admitted as homology", () => {
  const r = PM.runMap(X, opts());
  const s = r.spectra;
  assert.strictEqual(s.admitted, false);
  assert.ok(/not admitted/i.test(s.status) && /homology/i.test(s.status));
  assert.ok("S2_even" in s && "S2_odd" in s, "even/odd split present");
  assert.ok("rank0_2_block" in s && "rank1_block" in s, "rank blocks present");
  assert.ok(Array.isArray(s.heat_eigenvalues_per_degree) && s.heat_eigenvalues_per_degree.length >= 4);
  for (const k of Object.keys(s)) assert.ok(!/(dipole|polariz|raman|infrared|lifetime|binding)/i.test(k),
    "no physical-observable field name: " + k);
  assert.ok(s.disclaimers.some(x => /no dipole/i.test(x) && /polarizability/i.test(x)));
  assert.ok(s.disclaimers.some(x => /(IR|Raman)/.test(x) && /\bno\b|\bnot\b/i.test(x)));
  assert.ok(s.disclaimers.some(x => /no.*quality score/i.test(x)));
  assert.ok(s.disclaimers.some(x => /(lifetime|binding energy)/i.test(x) && /\bno\b|\bnot\b/i.test(x)));
});


// ---- 8. gate/rank identity boundary (Lean §4 / CurvedCorpus.lean C2) --------
// Lean: fracGe p q 2 5 <-> fracGe 5 1 (2*q) p, i.e. (V2 >= 2/5) <-> (2/V2 <= 5), with hypotheses
// p, q > 0. Both sides cross-multiply to 5*V2 >= 2, so the identity is satisfied when BOTH sides
// are false. The rank gate itself is a measurement of the coordinate, never a theorem.
console.log("\n[gate/rank identity]");
function gaussCloud(N, D, seed) {
  const r = PM.mulberry32(seed);
  const g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return Array.from({ length: N }, () => Array.from({ length: D }, g));
}
test("identity holds with BOTH sides false (V2 < 0.4): a failed gate is not a failed identity", () => {
  const XL = gaussCloud(60, 16, 5);
  const r = PM.runMap(XL, { d: 12, K: 8, T: 0.05, steps: 2000, seed: 0, names: names(60) });
  assert.ok(r.v2 < 0.4, "fixture must sit below the gate, got V2=" + r.v2);
  assert.strictEqual(r.gate_rank.gate_pass, false);
  assert.strictEqual(r.gate_rank.rank_pass, false);
  assert.strictEqual(r.gate_rank.identity_holds, true, "false <-> false is a satisfied identity");
  const cert = r.certificates.find(c => c.class === "identity" && /gate_rank/.test(c.theorem));
  assert.strictEqual(cert.ok, true, "identity must not be reported as failed below the gate");
  assert.strictEqual(r.summary.identity_failures, 0, "a below-gate corpus must not produce an identity failure");
  const meas = r.certificates.find(c => c.class === "measurement" && /rank gate/i.test(c.theorem));
  assert.strictEqual(meas.ok, false, "the MEASUREMENT is red below the gate — that is the honest report");
  assert.ok(r.summary.measurement_red >= 1);
});
test("identity holds with BOTH sides true (V2 >= 0.4)", () => {
  const r = PM.runMap(X, opts());
  assert.ok(r.v2 >= 0.4, "fixture must sit above the gate, got V2=" + r.v2);
  assert.strictEqual(r.gate_rank.gate_pass, true);
  assert.strictEqual(r.gate_rank.rank_pass, true);
  assert.strictEqual(r.gate_rank.identity_holds, true);
  assert.strictEqual(r.gate_rank.rhat, 2 / r.gate_rank.v2);
  const meas = r.certificates.find(c => c.class === "measurement" && /rank gate/i.test(c.theorem));
  assert.strictEqual(meas.ok, true);
});
test("zero matrix: V2 = 0 is N/A — no throw, no gate claim, no evidence", () => {
  const Z = Array.from({ length: 12 }, () => Array(4).fill(0));
  let r = null;
  r = PM.runMap(Z, { d: 3, K: 4, T: 0.05, steps: 500, seed: 0, names: names(12) });   // must not throw
  assert.strictEqual(PM._internal.V2([[0, 0], [0, 0], [0, 0]]), 0, "degenerate trace => V2 = 0");
  assert.strictEqual(r.v2, 0);
  assert.strictEqual(r.gate_rank.identity_applicable, false, "Lean §4 needs p, q > 0");
  assert.strictEqual(r.gate_rank.identity_holds, null, "no identity claim when out of scope");
  assert.strictEqual(r.gate_rank.gate_pass, null);
  assert.strictEqual(r.gate_rank.rank_pass, null);
  const cert = r.certificates.find(c => c.class === "identity" && /gate_rank/.test(c.theorem));
  assert.strictEqual(cert.ok, true, "N/A must not be reported as an identity failure");
  assert.ok(/not applicable/i.test(cert.detail), "N/A is stated: " + cert.detail);
  const meas = r.certificates.find(c => c.class === "measurement" && /rank gate/i.test(c.theorem));
  assert.ok(/not-tested/i.test(meas.detail), "the gate is not-tested, not passed: " + meas.detail);
  assert.strictEqual(r.summary.identity_failures, 0);
});
test("gate_rank exposes the boundary flag rather than hiding an ulp disagreement", () => {
  const r = PM.runMap(X, opts());
  assert.ok("at_boundary" in r.gate_rank, "boundary state is reported");
  assert.strictEqual(r.gate_rank.at_boundary, Math.abs(5 * r.gate_rank.v2 - 2) <= 1e-12);
});

// ---- 9. every false identity certificate halts before a result -------------
console.log("\n[identity halting]");
function loadMutant(find, replace) {
  const src = fs.readFileSync(SRC, "utf8");
  assert.ok(src.indexOf(find) >= 0, "mutation anchor not found: " + find);
  const sb = { console, TextEncoder, Math, JSON };
  vm.createContext(sb);
  new vm.Script(src.replace(find, replace), { filename: "pointmap-mutant.js" }).runInContext(sb);
  return sb.PM;
}
test("a forced-false identity certificate throws instead of returning a red summary", () => {
  const M = loadMutant('"quantization max|dk|=1 (compass)", atoms.every(a => a.dk <= 1)',
                        '"quantization max|dk|=1 (compass)", false');
  throws(() => M.runMap(X, opts()), /identity certificate failed|no result is returned/i,
    "a false identity must halt runMap");
});
test("a forced-false telescope identity also halts", () => {
  const M = loadMutant('"phi_ladder_telescope (Lean §5)", Math.abs(sumDrops - (Phi[0] - Phi[d])) < 1e-9',
                        '"phi_ladder_telescope (Lean §5)", false');
  throws(() => M.runMap(X, opts()), /identity certificate failed|no result is returned/i);
});
test("every returned result carries zero identity failures, all identity certs ok", () => {
  for (const o of [opts(), opts({ threshold: "zero" }), opts({ d: 3 }), opts({ T: 1e-6 })]) {
    const r = PM.runMap(X, o);
    assert.strictEqual(r.summary.identity_failures, 0);
    for (const c of r.certificates) if (c.class === "identity") assert.strictEqual(c.ok, true, "identity cert returned false: " + c.theorem);
  }
});

// ---- 10. malformed / hostile frames ---------------------------------------
console.log("\n[malformed frames]");
function frameOf() { return JSON.parse(JSON.stringify(PM.runMap(X, opts()).frame)); }
test("frame with NaN / Infinity / string coefficients is rejected, never used", () => {
  const cases = [
    ["input_pca.mu NaN", f => { f.input_pca.mu[0] = NaN; }],          // NaN survives as null through JSON
    ["input_pca.axes string", f => { f.input_pca.axes[0][0] = "1"; }],
    ["thresholds Infinity", f => { f.input_pca.thresholds[0] = Infinity; }],
    ["bit_sd null", f => { f.placement.bit_sd[0] = null; }],
    ["pca_mu missing entry", f => { f.placement.pca_mu.pop(); }],
    ["pca_axes short row", f => { f.placement.pca_axes[1] = [1]; }],
    ["scale NaN", f => { f.placement.scale = NaN; }],
    ["scale zero", f => { f.placement.scale = 0; }],
    ["axes row wrong length", f => { f.input_pca.axes[0] = f.input_pca.axes[0].slice(0, 2); }],
    ["config.d non-integer", f => { f.config.d = 2.5; }],
    ["input_pca not arrays", f => { f.input_pca.axes = { 0: [1, 2, 3] }; }],
    ["placement missing", f => { delete f.placement; }],
    ["frame is a string", null]
  ];
  for (const [label, mutate] of cases) {
    const frame = mutate ? frameOf() : "not-a-frame";
    if (mutate) mutate(frame);
    throws(() => PM.runMap(X, opts({ frame })), /drift|frame/i, label);
  }
});
test("frame seed mismatch is rejected (a frame records the seed it was fitted with)", () => {
  const a = PM.runMap(X, opts({ seed: 0 }));
  throws(() => PM.runMap(X, opts({ seed: 12345, frame: a.frame })), /seed/i);
  const ok = PM.runMap(X, opts({ seed: 0, frame: a.frame }));
  assert.strictEqual(ok.frame_id, a.frame_id, "the matching seed still reuses the frame");
});
test("a non-finite frame cannot be produced silently by huge-but-finite input", () => {
  const huge = PM.synth(14, 5, 4).map(r => r.map(x => x * 1e300));
  throws(() => PM.runMap(huge, opts({ names: names(14) })), /non-finite|finite/i,
    "overflow must surface as a stated numeric failure, not as a hashing error");
});
test("small-magnitude finite input still produces a finite frame and finite geometry", () => {
  const tiny = PM.synth(14, 5, 4).map(r => r.map(x => x * 1e-300));
  const r = PM.runMap(tiny, opts({ names: names(14) }));
  assert.ok(r.pts_full.every(p => p.every(Number.isFinite)), "points must be finite");
  assert.ok(Number.isFinite(r.v2) && r.v2 >= 0 && r.v2 <= 1);
  assert.ok(r.frame.input_pca.axes.every(a => a.every(Number.isFinite)));
});

// ---- 11. low-rank clouds ---------------------------------------------------
console.log("\n[low rank]");
test("rank-1 cloud is either rejected or handled with finite geometry — never NaN", () => {
  const dir = [1, 2, 3, 4, 5];
  const X1 = Array.from({ length: 14 }, (_, i) => dir.map(x => x * (i + 1)));
  let r = null, err = null;
  try { r = PM.runMap(X1, opts({ d: 4, names: names(14) })); } catch (e) { err = e; }
  if (r) {
    assert.ok(r.pts_full.every(p => p.every(Number.isFinite)), "rank-1 geometry must stay finite");
    assert.ok(Number.isFinite(r.v2));
    assert.strictEqual(r.summary.identity_failures, 0);
  } else {
    assert.ok(/rank|d collapsed|finite/i.test(err.message), "rank failure must be stated: " + err.message);
  }
});
test("rank-2 cloud runs, caps d, and keeps identities", () => {
  const b1 = [1, 2, 3, 4, 5, 6], b2 = [0, 1, 0, -1, 2, 0];
  const X2 = Array.from({ length: 14 }, (_, i) => b1.map((x, j) => x * (i + 1) + b2[j] * ((i % 3) - 1)));
  const r = PM.runMap(X2, opts({ d: 4, names: names(14) }));
  assert.ok(r.d <= 4 && r.d >= 2);
  assert.strictEqual(r.summary.identity_failures, 0);
  assert.ok(r.pts_full.every(p => p.every(Number.isFinite)));
});
test("d below 2 after rank capping is rejected with a stated reason", () => {
  const flat2 = Array.from({ length: 12 }, (_, i) => [i, 2 * i]);
  let err = null;
  try { PM.runMap(flat2, opts({ d: 2, names: names(12) })); } catch (e) { err = e; }
  if (err) assert.ok(/d|rank|finite/i.test(err.message), err.message);
});

// ---- 12. real 301x24 fixture ----------------------------------------------
console.log("\n[real cloud 301x24]");
const FIXTURE = path.join(__dirname, "data", "real-cloud-reduced24-2026-09-06.json");
const REAL = fs.existsSync(FIXTURE) ? JSON.parse(fs.readFileSync(FIXTURE, "utf8")) : null;
if (!REAL) console.log("  skip  real fixture not present at " + FIXTURE);
if (REAL) {
  const realNames = REAL.scores.map((_, i) => "row-" + i + ".md");
  const realOpts = extra => Object.assign({ d: 9, K: 20, T: 0.05, steps: 20000, seed: 20260906, names: realNames, preprocessing_id: "pca24/v1" }, extra || {});
  test("real cloud: shape, identities, honest gate report", () => {
    assert.strictEqual(REAL.scores.length, 301);
    assert.strictEqual(REAL.scores[0].length, 24);
    const r = PM.runMap(REAL.scores, realOpts());
    assert.strictEqual(r.n, 301); assert.strictEqual(r.D, 24); assert.strictEqual(r.d, 9);
    assert.strictEqual(r.summary.identity_failures, 0, "no identity failure on the real cloud");
    assert.ok(r.v2 > 0 && r.v2 < 0.4, "this cloud sits below the gate: V2=" + r.v2);
    assert.strictEqual(r.gate_rank.identity_holds, true, "below-gate identity still holds");
    assert.strictEqual(r.gate_rank.rank_pass, false);
    assert.ok(r.pts_full.every(p => p.every(Number.isFinite)));
    assert.ok(r.gaps.every(Number.isFinite));
    assert.ok(r.compass.pi.every(Number.isFinite));
  });
  test("real cloud: frozen-frame re-run is an exact fixed point", () => {
    const a = PM.runMap(REAL.scores, realOpts());
    const b = PM.runMap(REAL.scores, realOpts({ frame: a.frame }));
    const c = PM.compareMaps(a, b);
    assert.strictEqual(c.bits_changed_total, 0);
    assert.strictEqual(c.unchanged_anchors, 301);
    assert.strictEqual(c.max_displacement_geodesic, 0);
    assert.strictEqual(c.isolated_delta, 0);
    assert.strictEqual(c.geometry_decision, "stable");
    assert.strictEqual(c.task_verdict, "not-tested");
  });
  test("real cloud: ladder scores carry the display sign convention", () => {
    const r = PM.runMap(REAL.scores, realOpts());
    const L = r.ladder_candidates;
    assert.ok(["ranked", "no-operation"].indexOf(L.decision) >= 0);
    for (const c of L.rungs) {
      assert.strictEqual(c.score, -c.delta.isolated_delta);
      assert.strictEqual(c.delta.pole_shift_geodesic, 0);
      assert.strictEqual(c.frame_id, r.frame_id);
    }
    const negative = L.rungs.filter(c => c.delta.isolated_delta > 0);
    for (const c of negative) assert.ok(c.score < 0, "a candidate that ADDS isolated points must score negative");
  });
  test("real cloud: one-row edit moves exactly one named anchor", () => {
    const a = PM.runMap(REAL.scores, realOpts());
    const donor = a.bits.findIndex(b => b.join("") !== a.bits[7].join(""));
    const X2 = REAL.scores.map(r => r.slice());
    X2[7] = REAL.scores[donor].slice();
    const b = PM.runMap(X2, realOpts({ frame: a.frame }));
    const c = PM.compareMaps(a, b);
    assert.strictEqual(c.changed_names.length, 1);
    assert.strictEqual(c.changed_names[0], "row-7.md");
    assert.strictEqual(c.unchanged_anchors, 300);
  });
}

test("changed content remains visible when quantization does not move the point", () => {
  const a=PM.runMap(PM.synth(12,4,1),{K:4,d:3,names:Array.from({length:12},(_,i)=>"doc"+i)});
  const b=JSON.parse(JSON.stringify(a));
  a.embedding_metadata={docs:a.names.map(()=>({sha256:"before"}))};
  b.embedding_metadata={docs:b.names.map((_,i)=>({sha256:i===4?"after":"before"}))};
  const c=PM.compareMaps(a,b);
  assert.strictEqual(c.changed_input_names.length,1);
  assert.strictEqual(c.changed_input_names[0],"doc4");
  assert.strictEqual(c.quantization_silent_names[0],"doc4");
  assert.strictEqual(c.changed_names.length,0);
  assert.strictEqual(c.unchanged_input_anchors,11);
});

// ---- summary --------------------------------------------------------------
console.log("\n" + pass + " passed, " + failures.length + " failed");
if (failures.length) {
  for (const f of failures) console.log("\n--- " + f.name + "\n" + (f.err.stack || f.err.message));
  process.exit(1);
}
