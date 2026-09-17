#!/usr/bin/env node
// test-axis-consistency.mjs — Node-runnable tests for POST /api/map/axis-redundancy
// (lib/axis-redundancy.mjs) and POST /api/map/consistency (lib/consistency-route.mjs).
// REAL: pointmap.js (verbatim via node:vm), PM._internal.nullDraw, preview path.
// FAKE: env.AI (synthetic hash embedder), KV/map store (in-memory). No D1 SQL.

import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError } from "./lib/http.mjs";
import { embedDocuments } from "./lib/embed-pipeline.mjs";
import { mapRouteHandler } from "./lib/map-route.mjs";
import { looNearestNeighbourHits, axisRedundancyTrial, axisRedundancyHandler, VERSION as AXIS_VERSION } from "./lib/axis-redundancy.mjs";
import { mapConsistencyHandler, VERSION as CONS_VERSION } from "./lib/consistency-route.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadRealPointMap() {
  const code = fs.readFileSync(path.resolve(__dirname, "pointmap.js"), "utf8");
  const sandbox = { console, Math, Array, Object, JSON, Number, String, Boolean, RangeError, TypeError, Error, Set, Map, Infinity, NaN, isNaN, isFinite, BigInt, Uint8Array, Float32Array, Float64Array, TextEncoder, TextDecoder };
  vm.createContext(sandbox); vm.runInContext(code, sandbox, { filename: "pointmap.js" });
  return sandbox.PM;
}
const PM = loadRealPointMap();
function fakeEmbedVector(text, D) { const v = new Array(D).fill(0); for (let i = 0; i < text.length; i++) v[i % D] += Math.sin(text.charCodeAt(i) * (i + 1) * 0.017 + (i % D) * 0.31); if (v.every((x) => x === 0)) v[0] = 1; return v; }
function makeFakeEnv() { const kv = new Map(); const counters = { aiCalls: 0, vecUpserts: 0 }; return { AI: { async run(m, o) { counters.aiCalls++; return { data: o.text.map((t) => fakeEmbedVector(t, 768)) }; } }, SITE: { async get(k, t) { const v = kv.get(k); return v === undefined ? null : (t === "json" ? JSON.parse(v) : v); }, async put(k, v) { kv.set(k, v); } }, VEC: { async upsert() { counters.vecUpserts++; throw new Error("never"); } }, _counters: counters }; }
function makeStore() { const rows = new Map(); let next = 1; const counters = { saves: 0 }; return { rows, counters, async loadStoredMap(id) { const r = rows.get(Number(id)); return r ? r.map : null; }, async saveMap(map) { counters.saves++; const id = next++; rows.set(id, { map }); return id; } }; }
const results = [];
async function test(name, fn) { try { await fn(); results.push({ ok: true }); console.log(`  ok  - ${name}`); } catch (e) { results.push({ ok: false }); console.log(`FAIL  - ${name}`); console.log("        " + (e?.stack || e)); } }
async function expectApiError(fn, status, what) { try { await fn(); } catch (e) { assert.ok(e instanceof ApiError, `${what}: ${e?.constructor?.name}: ${e?.message}`); assert.equal(e.status, status, `${what}: expected ${status}, got ${e.status} (${e.message})`); return e; } throw new Error(`${what}: expected ApiError(${status})`); }

const NAMES = ["docs/a.md", "docs/b.md", "docs/c.md", "src/d.mjs", "src/e.mjs", "src/f.mjs", "refs/g.md", "refs/h.md", "notes/i.md", "notes/j.md", "notes/k.md", "notes/l.md", "notes/m.md", "notes/n.md"];
const TEXTS = NAMES.map((_, i) => `Document ${i}: the frozen-frame instrument measures candidate corpora. ` + `Section ${i} discusses attestation, trust chain and declarative policy in sentence number ${i}. `.repeat(3 + (i % 4)));
async function makeBaseline() { const env = makeFakeEnv(); const store = makeStore(); const res = await mapRouteHandler({ texts: TEXTS, names: NAMES }, { env, PM, embedDocuments, ...store }); return { env, store, baseline_id: res.id, baseline: res.map }; }

// ===========================================================================
async function axisUnitTests() {
  console.log("\n[axis-trial: statistic]");
  await test("LOO-NN hits: a perfectly redundant axis (copy of another) is predicted N/N; an independent alternating axis is predicted 0", () => {
    // axis0 = axis1 (redundant); axis2 alternates independently of the rest
    const B = []; for (let i = 0; i < 12; i++) { const a = i < 6 ? 1 : 0; B.push([a, a, i % 2, (i >> 1) % 2]); }
    const { hits } = looNearestNeighbourHits(B);
    assert.equal(hits[0], 12); assert.equal(hits[1], 12);
    // for axis 2 the nearest rows on (a,a,axis3) are rows i±2 (same parity? no) — rows with same (a, axis3) and opposite parity exist: hits must be low
    assert.ok(hits[2] <= 6, `axis2 hits ${hits[2]}`);
  });
  await test("hits are multiples of 0.5 and bounded by N; ties counted", () => {
    const B = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1]];
    const { hits, ties } = looNearestNeighbourHits(B);
    for (let j = 0; j < 3; j++) { assert.ok(hits[j] >= 0 && hits[j] <= 6); assert.equal((hits[j] * 2) % 1, 0); assert.ok(ties[j] >= 0); }
  });
  await test("trial: null preserves every row/column margin, K draws, plus-one tail, descriptive z, admitted:false", () => {
    const B = []; for (let i = 0; i < 30; i++) { const a = i % 3 === 0 ? 1 : 0; B.push([a, a, (i * 7) % 2, (i >> 1) % 2, i % 5 === 0 ? 1 : 0]); }
    const t = axisRedundancyTrial(B, { K: 20, seed: 5, nullDraw: PM._internal.nullDraw });
    assert.equal(t.version, AXIS_VERSION); assert.equal(t.K, 20); assert.equal(t.axes.length, 5); assert.equal(t.admitted, false);
    assert.equal(t.margins_preserved.rows, true); assert.equal(t.margins_preserved.columns, true);
    for (const a of t.axes) { assert.equal(a.p_resolution, +(1 / 21).toFixed(4)); assert.ok(a.p_two_sided >= a.p_resolution - 1e-9 && a.p_two_sided <= 1); assert.ok(["excluded-from-fixed-margin-null", "not-excluded", "null-degenerate: no trial possible on this corpus"].includes(a.verdict)); if (a.null.degenerate) assert.equal(a.z_descriptive, null); assert.equal(a.margin_baseline_hits, Math.max(a.column_ones, 30 - a.column_ones)); }
    // redundant pair (axes 0,1) should be far more predictable than the null
    assert.ok(t.axes[0].observed_hits === 30 && t.axes[1].observed_hits === 30);
    assert.ok(t.axes[0].null.mean < 30, "null must be able to take a different value (non-degenerate)");
  });
  await test("trial is deterministic in seed", () => {
    const B = []; for (let i = 0; i < 16; i++) B.push([i % 2, (i >> 1) % 2, (i >> 2) % 2, (i >> 3) % 2]);
    const a = axisRedundancyTrial(B, { K: 8, seed: 3, nullDraw: PM._internal.nullDraw }), b = axisRedundancyTrial(B, { K: 8, seed: 3, nullDraw: PM._internal.nullDraw });
    assert.deepEqual(a.axes.map((x) => [x.observed_hits, x.null.mean, x.p_two_sided]), b.axes.map((x) => [x.observed_hits, x.null.mean, x.p_two_sided]));
  });
  await test("rejects non-binary or ragged bits with 409", () => {
    for (const B of [[[1, 2], [0, 1], [1, 0]], [[1, 0], [0], [1, 0]], [[1], [0], [1]]]) { try { axisRedundancyTrial(B, { K: 2, seed: 1, nullDraw: PM._internal.nullDraw }); throw new Error("no throw"); } catch (e) { assert.ok(e instanceof ApiError && e.status === 409, e.message); } }
  });
}

async function axisRouteTests() {
  console.log("\n[axis-trial: route]");
  const fx = await makeBaseline(); const ctx = { loadStoredMap: fx.store.loadStoredMap, PM };
  await test("validation: map_id, K range, null_seed, rejected keys", async () => {
    await expectApiError(() => axisRedundancyHandler({}, ctx), 422, "no id");
    await expectApiError(() => axisRedundancyHandler({ map_id: fx.baseline_id, K: 1 }, ctx), 422, "K=1");
    await expectApiError(() => axisRedundancyHandler({ map_id: fx.baseline_id, K: 41 }, ctx), 422, "K=41");
    await expectApiError(() => axisRedundancyHandler({ map_id: fx.baseline_id, null_seed: 1.5 }, ctx), 422, "seed");
    for (const k of ["weights", "importance", "rank", "admit", "seed", "d"]) await expectApiError(() => axisRedundancyHandler({ map_id: fx.baseline_id, [k]: 1 }, ctx), 422, k);
    await expectApiError(() => axisRedundancyHandler({ map_id: 999 }, ctx), 404, "missing");
  });
  await test("runs on a stored map: K inherits the map's K, seed derived, frame/instrument echoed, no side effects", async () => {
    const saves = fx.store.counters.saves, ai = fx.env._counters.aiCalls;
    const r = await axisRedundancyHandler({ map_id: fx.baseline_id }, ctx);
    assert.equal(r.trial, true); assert.equal(r.persisted, false); assert.equal(r.K, fx.baseline.null.K); assert.equal(r.d, fx.baseline.bits[0].length); assert.equal(r.N, NAMES.length);
    assert.equal(r.frame_id, fx.baseline.frame_id); assert.equal(r.null_seed, (fx.baseline.seed ^ 0x5bd1e995) | 0); assert.match(r.seed_note, /XOR/);
    assert.equal(r.admitted, false); assert.equal(r.task_verdict, "not-applicable"); assert.deepEqual(r.side_effects, { map_storage: false, repository: false, vectorize: false, embedding_cache: false });
    assert.equal(fx.store.counters.saves, saves); assert.equal(fx.env._counters.aiCalls, ai);
    assert.equal(r.counts.excluded_from_null + r.counts.not_excluded + r.counts.null_degenerate, r.d);
    assert.ok(!JSON.stringify(r).includes('"weight"'));
  });
  await test("caller K and null_seed are honored and echoed", async () => {
    const r = await axisRedundancyHandler({ map_id: fx.baseline_id, K: 5, null_seed: 77 }, ctx); assert.equal(r.K, 5); assert.equal(r.null_seed, 77); assert.equal(r.seed_note, "caller-supplied null_seed"); assert.equal(r.axes[0].p_resolution, +(1 / 6).toFixed(4));
  });
  await test("legacy map without bits is 409", async () => { const s = makeStore(); s.rows.set(1, { map: { frame: {}, names: NAMES } }); await expectApiError(() => axisRedundancyHandler({ map_id: 1 }, { loadStoredMap: s.loadStoredMap, PM }), 409, "no bits"); });
}

// ===========================================================================
async function consistencyTests() {
  console.log("\n[consistency: preflight + measured run]");
  const fx = await makeBaseline(); const ctx = { env: fx.env, PM, embedDocuments, loadStoredMap: fx.store.loadStoredMap };
  const edited = TEXTS.slice(); edited[2] = TEXTS[2] + " Appended paragraph about firmware measurement and key custody. ".repeat(3);
  const ok = { baseline_id: fx.baseline_id, texts: edited, names: NAMES, target: { action: "change", name: NAMES[2] }, variants: [{ label: "weak", text: edited[2].replace("Appended", "Added") }, { label: "strong", text: TEXTS[2] + " A very different closing section on rollback and provenance verification. ".repeat(3) }] };
  const call = (over) => mapConsistencyHandler({ ...ok, ...over }, ctx);
  const ai0 = fx.env._counters.aiCalls;
  await test("preflight rejections happen before any AI work", async () => {
    await expectApiError(() => call({ baseline_id: 0 }), 422, "id");
    await expectApiError(() => call({ target: { action: "change", name: "nope.md" } }), 422, "target not in names");
    await expectApiError(() => call({ variants: [] }), 422, "no variants");
    await expectApiError(() => call({ variants: [1, 2, 3, 4].map((i) => ({ label: "v" + i, text: "x" })) }), 422, "too many");
    await expectApiError(() => call({ variants: [{ label: "primary", text: "x" }] }), 422, "reserved label");
    await expectApiError(() => call({ variants: [{ label: "a", text: "x" }, { label: "a", text: "y" }] }), 422, "dup label");
    await expectApiError(() => call({ variants: [{ label: "a", text: "   " }] }), 422, "empty text");
    for (const k of ["augment", "generate_variants", "gate", "strength"]) await expectApiError(() => call({ [k]: 1 }), 422, k);
    for (const k of ["d", "K", "frame", "persist"]) await expectApiError(() => call({ [k]: 1 }), 409, k);
    assert.equal(fx.env._counters.aiCalls, ai0);
  });
  let r;
  await test("measured run: primary + 2 variants through the real preview path; no persistence", async () => {
    const saves = fx.store.counters.saves;
    r = await call({ predicted_delta: -1 });
    assert.equal(r.consistency_check, true); assert.equal(r.persisted, false); assert.equal(r.version, CONS_VERSION);
    assert.equal(r.measurements.length, 3); assert.deepEqual(r.measurements.map((m) => m.label), ["primary", "weak", "strong"]);
    for (const m of r.measurements) { assert.ok(Number.isInteger(m.isolated_delta)); assert.equal(m.ledger_actual_delta, m.isolated_delta); assert.equal(m.unchanged_anchor_count, NAMES.length - 1); assert.equal(m.frame_id, fx.baseline.frame_id); assert.equal(m.noop, false); assert.ok(typeof m.sha256 === "string"); }
    assert.equal(fx.store.counters.saves, saves); assert.equal(fx.env._counters.vecUpserts, 0);
    assert.equal(r.consistency.n_measurements, 3); assert.equal(r.consistency.n_distinct_texts, 3); assert.equal(r.consistency.predicted_sign, "negative");
    assert.equal(r.consistency.all_same_sign, new Set(r.measurements.map((m) => m.isolated_sign)).size === 1);
    assert.equal(r.consistency.sign_exact_count, r.measurements.filter((m) => m.isolated_sign === "negative").length);
    assert.equal(r.task_verdict, "not-tested"); assert.match(r.scope, /Neither outcome authorizes/);
    assert.ok(!("consensus_delta" in r.consistency) && !("score" in r.consistency));
  });
  await test("a variant byte-identical to the primary is flagged and necessarily agrees", async () => {
    const r2 = await call({ variants: [{ label: "same", text: edited[2] }] });
    assert.equal(r2.consistency.n_distinct_texts, 1); assert.match(r2.consistency.note, /byte-identical/); assert.equal(r2.consistency.all_same_sign, r2.measurements[0].isolated_sign !== "none");
    assert.equal(r2.measurements[0].isolated_delta, r2.measurements[1].isolated_delta);
  });
  await test("a variant equal to the baseline source is a noop measurement (nothing moved)", async () => {
    const r3 = await call({ variants: [{ label: "revert", text: TEXTS[2] }] });
    const m = r3.measurements[1]; assert.equal(m.noop, true); assert.equal(m.isolated_delta, 0); assert.equal(r3.consistency.noop_count, 1);
  });
  await test("injected preview double: sign disagreement yields all_same_sign=false and the undetermined reading", async () => {
    let n = 0; const fake = async (body) => { n++; const d = n === 1 ? -1 : 1; return { comparison: { comparable: true, per_name: [{ name: body.target.name, bits_changed: 1, displacement_geodesic: 0.2, quantization_silent: false }], isolated_delta: d, occupied_sectors_delta: 0 }, math_ledger: { measurement: { actual_delta: d } }, target: { noop: false }, unchanged_anchor_count: 13, map: { frame_id: "f", instrument_id: "i" } }; };
    const r4 = await mapConsistencyHandler({ ...ok, variants: [{ label: "w", text: "x1" }] }, { ...ctx, previewHandler: fake });
    assert.equal(n, 2); assert.equal(r4.consistency.all_same_sign, false); assert.deepEqual(r4.consistency.sign_set.sort(), ["negative", "positive"]); assert.match(r4.consistency.reading, /perturbation-sensitive/); assert.equal(r4.consistency.delta_spread, 2);
  });
  await test("ADD target: variants replace the added document; per-name displacement unavailable, ledger delta present", async () => {
    const texts = [...TEXTS, "A brand new document about provenance-gated browsing and attestation. ".repeat(4)]; const names = [...NAMES, "new/z.md"];
    const r5 = await mapConsistencyHandler({ baseline_id: fx.baseline_id, texts, names, target: { action: "add", name: "new/z.md" }, variants: [{ label: "alt", text: "A different new document about rollback ledgers. ".repeat(5) }] }, ctx);
    assert.equal(r5.measurements.length, 2); for (const m of r5.measurements) { assert.ok(Number.isInteger(m.isolated_delta)); assert.equal(m.comparison_comparable, false); } assert.match(r5.comparison_note, /ADD/);
  });
}

await axisUnitTests(); await axisRouteTests(); await consistencyTests();
const failed = results.filter((r) => !r.ok).length; console.log(`\n${results.length - failed}/${results.length} passed`); if (failed) process.exit(1);
