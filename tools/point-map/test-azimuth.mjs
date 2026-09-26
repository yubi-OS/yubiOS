#!/usr/bin/env node
// test-azimuth.mjs — azimuth/1: rotation/reflection-invariant Rayleigh Z_m,
// refit-per-null, atomicity audit, multiplicity correction, continuous-vector verification.
// REAL: pointmap.js + real 301x24 fixture. FAKE: in-memory map store only.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { ApiError } from "./lib/http.mjs";
import { anglesRefit, rayleighZ, largestGap, azimuthStats, dedupRows, holmAdjust, binaryAzimuthTrial, continuousAzimuthTrial, azimuthHandler, DEFAULT_MODES, VERSION } from "./lib/azimuth.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
function loadPM() {
  const code = fs.readFileSync(path.join(here, "pointmap.js"), "utf8");
  const sandbox = { console, Math, Array, Object, JSON, Number, String, Boolean, RangeError, TypeError, Error, Set, Map, Infinity, NaN, isNaN, isFinite, BigInt, Uint8Array, Float32Array, Float64Array, TextEncoder, TextDecoder };
  vm.createContext(sandbox); vm.runInContext(code, sandbox, { filename: "pointmap.js" }); return sandbox.PM;
}
const PM = loadPM();
let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log(`  ok  - ${name}`); } catch (e) { fail++; console.log(`FAIL  - ${name}\n        ${e?.stack || e}`); } }
async function expectApi(fn, status) { try { await fn(); } catch (e) { assert.ok(e instanceof ApiError, String(e)); assert.equal(e.status, status, e.message); return e; } throw new Error(`expected ApiError(${status})`); }

const fixture = JSON.parse(fs.readFileSync(path.join(here, "data/real-cloud-reduced24-2026-09-06.json"), "utf8"));
const X = fixture.scores, N = X.length, d = 9;
const names = Array.from({ length: N }, (_, i) => `fixture/${String(i).padStart(3, "0")}.json`);
const map = PM.runMap(X, { d, threshold: "median", seed: 20260906, K: 40, T: 0.05, names, labels: names, preprocessing_id: "raw/v1" });
const store = { async loadStoredMap(id) { return id === 1 ? map : null; } };

await test("Rayleigh Z_m is invariant under global rotation, reflection, and axis swap", () => {
  const phis = [-2.7, -1.1, -0.2, 0.4, 1.8, 2.9];
  for (const m of [1, 2, 3, 4, 6, 12]) {
    const z = rayleighZ(phis, m);
    assert.ok(Math.abs(z - rayleighZ(phis.map((p) => p + 0.731), m)) < 1e-12);
    assert.ok(Math.abs(z - rayleighZ(phis.map((p) => -p), m)) < 1e-12);
    assert.ok(Math.abs(z - rayleighZ(phis.map((p) => Math.PI / 2 - p), m)) < 1e-12);
  }
  assert.ok(Math.abs(largestGap(phis) - largestGap(phis.map((p) => p + 0.731))) < 1e-12);
});

await test("Holm adjustment is monotone, >= raw p, and protects the family", () => {
  const r = holmAdjust([{ key: "a", p_two_sided: 0.005 }, { key: "b", p_two_sided: 0.02 }, { key: "c", p_two_sided: 0.7 }]);
  assert.deepEqual(r.map((x) => +x.p_holm.toFixed(3)), [0.015, 0.04, 0.7]);
  for (const x of r) assert.ok(x.p_holm >= x.p_two_sided && x.p_holm <= 1);
  assert.deepEqual(r.map((x) => x.excluded_after_holm), [true, true, false]);
});

await test("real fixture: binary trial reproduces atomicity and rejects the apparent m=1 channel", () => {
  const r = binaryAzimuthTrial(map, PM, { K: 40, seedA: 0x5eeda, modes: DEFAULT_MODES });
  assert.equal(r.N, 301); assert.equal(r.d, 9);
  assert.equal(r.atomicity.distinct_patterns, 167); assert.equal(r.atomicity.collision_count, 134);
  assert.ok(Math.abs(r.atomicity.m1_audit.observed - 0.7109) < 0.002);
  assert.equal(r.atomicity.m1_audit.admitted, false);
  assert.equal(r.atomicity.deduplicated.N, 167);
  assert.equal(r.atomicity.deduplicated.size_matched, false);
  assert.equal(r.atomicity.deduplicated.exact_size_matches.a, 0);
  assert.equal(r.atomicity.deduplicated.exact_size_matches.b, 0);
  assert.ok(r.atomicity.deduplicated.null_distinct_sizes_seed_a.min > 167);
  assert.equal(r.admitted, false);
  assert.ok(r.admission.blocking_reasons.some((x) => /atomic|de-atomized/i.test(x)));
  // Once m=1 is removed and Holm corrects the 6-stat family, no default statistic is excluded.
  for (const seed of [r.seed_a, r.seed_b]) for (const v of Object.values(seed)) assert.equal(v.excluded_after_holm, false);
});

await test("real fixture: binary statistic values reproduce the uploaded trial", () => {
  const phi = anglesRefit(map.bits, (map.seed ?? 0) ^ 0x1f123bb5, PM);
  const s = azimuthStats(phi, DEFAULT_MODES);
  // PCA seed/gauge may rotate or reflect the plane; Z_m and gap are gauge invariant.
  assert.ok(Math.abs(s.Z2 - 1.720) < 0.02, `Z2=${s.Z2}`);
  assert.ok(Math.abs(s.Z3 - 0.410) < 0.02, `Z3=${s.Z3}`);
  assert.ok(Math.abs(s.Z12 - 5.632) < 0.03, `Z12=${s.Z12}`);
  assert.ok(Math.abs(s.largest_gap - 0.1697) < 0.003, `gap=${s.largest_gap}`);
});

await test("real fixture: continuous trial is descriptive but permanently not admitted", () => {
  const r = continuousAzimuthTrial(X, PM, { K: 40, seedA: 0xc33, modes: DEFAULT_MODES });
  assert.equal(r.N, 301); assert.equal(r.D, 24); assert.equal(r.admitted, false);
  assert.equal(r.criteria.null_adequate_for_negative_claim, false);
  assert.match(r.admission_note, /over-strong/);
  for (const seed of [r.seed_a, r.seed_b]) for (const v of Object.values(seed)) assert.equal(v.excluded_after_holm, false);
});

await test("handler validates modes/refit/multiplicity and stored-vector fingerprints", async () => {
  const ctx = { ...store, PM };
  for (const body of [{}, { map_id: 0 }, { map_id: 1, modes: [1] }, { map_id: 1, modes: [2, 2] }, { map_id: 1, refit: false }, { map_id: 1, multiplicity: "none" }, { map_id: 1, K: 401 }]) await expectApi(() => azimuthHandler(body, ctx), 422);
  await expectApi(() => azimuthHandler({ map_id: 999 }, ctx), 404);
  const b = await azimuthHandler({ map_id: 1, K: 8, null_seed: 7 }, ctx);
  assert.equal(b.version, VERSION); assert.equal(b.variant, "binary"); assert.equal(b.admitted, false); assert.equal(b.persisted, false);
  await expectApi(() => azimuthHandler({ map_id: 1, variant: "continuous" }, ctx), 422);
  const wrong = X.map((r) => r.slice()); wrong[0][0] += 1;
  const e = await expectApi(() => azimuthHandler({ map_id: 1, variant: "continuous", vectors: wrong, K: 4 }, ctx), 409);
  assert.equal(e.extra.mismatch_count, 1);
  const c = await azimuthHandler({ map_id: 1, variant: "continuous", vectors: X, K: 4, null_seed: 3 }, ctx);
  assert.equal(c.variant, "continuous"); assert.equal(c.criteria.vector_hashes_match_map, true); assert.equal(c.admitted, false);
});

await test("m=1 remains an audit-only field and cannot enter the requested mode family", async () => {
  await expectApi(() => azimuthHandler({ map_id: 1, modes: [1, 2] }, { ...store, PM }), 422);
  const r = await azimuthHandler({ map_id: 1, K: 4 }, { ...store, PM });
  assert.ok(r.atomicity.m1_audit); assert.equal(r.atomicity.m1_audit.admitted, false);
  assert.ok(!Object.keys(r.seed_a).includes("Z1"));
});

await test("trial results carry a well-formed placement_eigengap diagnostic (review Finding 5)", async () => {
  const r = await azimuthHandler({ map_id: 1, K: 4 }, { ...store, PM });
  const eg = r.placement_eigengap;
  assert.ok(eg, "no placement_eigengap on binary trial");
  assert.equal(typeof eg.lambda1, "number"); assert.equal(typeof eg.lambda2, "number");
  assert.ok(eg.lambda1 >= eg.lambda2, "eigenvalues not sorted");
  assert.ok(eg.rel_gap_12 >= 0 && eg.rel_gap_12 <= 1, "rel_gap_12 out of range");
  assert.ok(/licenses nothing/.test(eg.note), "caveat missing");
  const rv = await azimuthHandler({ map_id: 1, vectors: X.slice(0, 50), K: 4 }, { ...store, PM });
  assert.ok(rv.placement_eigengap, "no placement_eigengap on continuous trial");
  assert.equal(typeof rv.placement_eigengap.rel_gap_12, "number");
});

console.log(`\n${pass}/${pass + fail} passed`); if (fail) process.exit(1);
