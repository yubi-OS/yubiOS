#!/usr/bin/env node
// test-dimension-structure.mjs — dimension-structure/1: the fixed V2 gate (dimension, where to focus) and the
// null at the same prefix (structure) are reported side by side. Checks parity with pointmap.js V2, the identities
// FocalBounds.structure_sign_identity / CurvedCorpus.gate_rank_identity at runtime, and both independence witnesses
// of FocalBounds.gate_structure_independent on synthetic codes.
import vm from "node:vm"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { prefixV2, dimensionStructureProfile, focalPointTrial, mulberry32, FOCAL_VERSION } from "./lib/focal-point.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sb = { console, Math, Array, Object, JSON, Number, String, Boolean, RangeError, TypeError, Error, Set, Map, Infinity, NaN, isNaN, isFinite, BigInt, Uint8Array, Float32Array, Float64Array, TextEncoder, TextDecoder };
vm.createContext(sb); vm.runInContext(fs.readFileSync(path.resolve(__dirname, "pointmap.js"), "utf8"), sb); const PM = sb.PM;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  - " + m); } else { fail++; console.log("  FAIL - " + m); } };
const pack = (bits) => Int32Array.from(bits, (b) => b.reduce((m, x, j) => m | (x ? 1 << j : 0), 0));

// 1. parity with the instrument's own V2 and the stored-map readout
const r = mulberry32(42), g = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const X = Array.from({ length: 300 }, () => { const z = [g(), g(), g()]; return Array.from({ length: 12 }, (_, j) => z[j % 3] * (1 + 0.1 * j) + 0.8 * g()); });
const map = PM.runMap(X, { d: 8, seed: 20260906, K: 20, steps: 2000 });
const rows = pack(map.bits);
ok(Math.abs(prefixV2(rows, 8) - map.gate_rank.v2) < 1e-9, `prefixV2 at j=d equals pointmap V2 (${prefixV2(rows, 8).toFixed(9)} vs ${map.gate_rank.v2.toFixed(9)})`);
const dsm = map.dimension_structure;
ok(dsm && dsm.version === "dimension-structure/1" && Math.abs(dsm.dimension.rhat - 2 / map.gate_rank.v2) < 1e-3, "stored map: rhat = 2/V2 (gate_rank_identity)");
ok((dsm.structure.delta_rhat >= 0) === (map.gate_rank.v2 >= dsm.structure.null_v2_mean), "stored map: delta_rhat >= 0 iff V2 >= E0 (structure_sign_identity)");
ok(dsm.dimension.gate_pass === map.gate_rank.gate_pass, "stored map: gate verdict is the unchanged Lean section 4 gate");

// 2. focal trial carries the profile; its j=d row matches the map
const t = focalPointTrial({ ...map, id: 1 }, { K: 10, trades_per_row: 20 });
const ds = t.dimension_structure;
ok(FOCAL_VERSION === "focal-point/2" && t.version === "focal-point/2", "focal trial version bumped to focal-point/2");
ok(ds && ds.profile.length === 7 && ds.profile[0].j === 2 && ds.at_d.j === 8, "profile covers prefixes j = 2..d");
ok(Math.abs(ds.at_d.v2 - map.gate_rank.v2) < 1e-6, "profile V2 at j=d equals stored V2");
ok(ds.profile.every((p) => p.rhat === null || Math.abs(p.rhat - 2 / p.v2) < 1e-3) && ds.profile.every((p) => p.gate_pass === (5 * p.v2 >= 2)), "every prefix: rhat = 2/V2 and gate_pass = (V2 >= 0.40)");
ok(ds.profile.every((p) => p.delta_rhat === null || (p.delta_rhat >= -1e-9) === (p.v2 >= p.null_v2_mean - 1e-12)), "every prefix: sign(delta_rhat) = sign(V2 - E0)");
const passing = ds.profile.filter((p) => p.gate_pass).map((p) => p.j);
ok(ds.focus.d_focus === (passing.length ? Math.max(...passing) : null), `d_focus = largest gate-passing prefix (${ds.focus.d_focus})`);

// 3. witness A: independent fair bits at j = 3 pass the gate (rhat <= j) with no structure
const ra = mulberry32(7);
const noise = Int32Array.from({ length: 2000 }, () => Math.floor(ra() * 8));
const A = dimensionStructureProfile(noise, 3, 2000, { K: 20, tradesPerRow: 20, seed: 11 });
const a3 = A.profile.find((p) => p.j === 3);
ok(a3.gate_pass === true && a3.structure === "within-null", `witness A: noise at j=3 passes the gate (V2=${a3.v2}) and is within the null (z=${a3.z})`);

// 4. witness B: 12 bits in two groups, each sharing a weak factor, fail the gate yet sit above the null.
//    (A single factor shared by all bits is absorbed by the null: it lives in the row sums, which the null preserves.)
const rb = mulberry32(9);
const gb = () => { let u = 0, v = 0; while (!u) u = rb(); while (!v) v = rb(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const weak = Int32Array.from({ length: 2000 }, () => { const f = [gb(), gb()]; let m = 0; for (let j = 0; j < 12; j++) if (0.6 * f[j < 6 ? 0 : 1] + gb() > 0) m |= 1 << j; return m; });
const B = dimensionStructureProfile(weak, 12, 2000, { K: 20, tradesPerRow: 20, seed: 13 });
const b12 = B.profile.find((p) => p.j === 12);
ok(b12.gate_pass === false && b12.structure === "above-null", `witness B: two weak group factors at j=12 fails the gate (V2=${b12.v2}) and is above the null (z=${b12.z})`);
ok(b12.readout === "structured, above the focus dimension" && a3.readout === "low-dimensional, structure not resolved from the null", "readouts name both quadrants");
console.log(`${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
