#!/usr/bin/env node
// test-control-outcomes.mjs — Node-runnable tests for POST /api/map/control
// (lib/control-route.mjs) and POST/GET /api/outcomes (lib/outcomes-route.mjs).
//
// Boundary discipline (explicit):
//   - REAL:  pointmap.js loaded verbatim via node:vm; PM.runMap, compareMaps,
//            explainTransition are the shipped mathematics.
//   - REAL:  lib/preview-route.mjs — every control is measured through the
//            actual preview path, not a stand-in.
//   - FAKE:  env.AI.run — deterministic hash pseudo-embedder (SYNTHETIC, not
//            bge-base-en-v1.5). Nothing here can claim real embeddings.
//   - FAKE:  KV / map store / outcomes store — in-memory Maps. No D1 SQL.
//
// Run: node tools/point-map/test-control-outcomes.mjs

import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiError } from "./lib/http.mjs";
import { embedDocuments } from "./lib/embed-pipeline.mjs";
import { mapRouteHandler } from "./lib/map-route.mjs";
import { mapControlHandler, planSplice, planControls, SPLICE_FRACTION, GENERATOR, VERSION as CONTROL_VERSION } from "./lib/control-route.mjs";
import { outcomesPostHandler, outcomesGetHandler, contingency, VERDICTS, VERSION as OUTCOMES_VERSION } from "./lib/outcomes-route.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadRealPointMap() {
  const code = fs.readFileSync(path.resolve(__dirname, "pointmap.js"), "utf8");
  const sandbox = { console, Math, Array, Object, JSON, Number, String, Boolean, RangeError, TypeError, Error, Set, Map, Infinity, NaN, isNaN, isFinite, BigInt, Uint8Array, Float32Array, Float64Array, TextEncoder, TextDecoder };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "pointmap.js" });
  if (!sandbox.PM || typeof sandbox.PM.runMap !== "function") throw new Error("failed to load real PM");
  return sandbox.PM;
}
const PM = loadRealPointMap();

function fakeEmbedVector(text, D) {
  const v = new Array(D).fill(0);
  for (let i = 0; i < text.length; i++) v[i % D] += Math.sin(text.charCodeAt(i) * (i + 1) * 0.017 + (i % D) * 0.31);
  if (v.every((x) => x === 0)) v[0] = 1;
  return v;
}
function makeFakeEnv() {
  const kvStore = new Map(); const counters = { aiCalls: 0, kvPuts: 0, vecUpserts: 0 };
  return {
    AI: { async run(model, opts) { counters.aiCalls++; return { data: opts.text.map((t) => fakeEmbedVector(t, 768)) }; } },
    SITE: { async get(k, type) { const v = kvStore.get(k); return v === undefined ? null : (type === "json" ? JSON.parse(v) : v); }, async put(k, v) { counters.kvPuts++; kvStore.set(k, v); } },
    VEC: { async upsert() { counters.vecUpserts++; throw new Error("control/outcomes must never reach Vectorize"); } },
    _counters: counters,
  };
}
function makeStore() {
  const rows = new Map(); let next = 1; const counters = { saves: 0 };
  return { rows, counters, async loadStoredMap(id) { const r = rows.get(Number(id)); return r ? r.map : null; }, async saveMap(map) { counters.saves++; const id = next++; rows.set(id, { map }); return id; } };
}
function makeOutcomeStore() {
  const rows = []; let next = 1;
  return {
    rows,
    async insertOutcome(e) { const id = next++; rows.push({ id, ...e }); return id; },
    async getOutcome(id) { return rows.find((r) => r.id === Number(id)) || null; },
    async listOutcomes(b) { return rows.filter((r) => b == null || r.baseline_id === b); },
  };
}

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok  - ${name}`); }
  catch (e) { results.push({ name, ok: false, error: e }); console.log(`FAIL  - ${name}`); console.log("        " + (e?.stack || e)); }
}
async function expectApiError(fn, status, what) {
  try { await fn(); } catch (e) { assert.ok(e instanceof ApiError, `${what}: expected ApiError, got ${e?.constructor?.name}: ${e?.message}`); assert.equal(e.status, status, `${what}: expected ${status}, got ${e.status} (${e.message})`); return e; }
  throw new Error(`${what}: expected ApiError(${status}), nothing thrown`);
}

const NAMES = ["docs/a.md", "docs/b.md", "docs/c.md", "src/d.mjs", "src/e.mjs", "src/f.mjs", "refs/g.md", "refs/h.md", "notes/i.md", "notes/j.md", "notes/k.md", "notes/l.md"];
const TEXTS = NAMES.map((_, i) => `Document ${i}: the frozen-frame instrument measures candidate corpora. ` + `Section ${i} discusses attestation, trust chain and declarative policy in sentence number ${i}. `.repeat(3 + (i % 3)));

async function makeBaseline() {
  const env = makeFakeEnv(); const store = makeStore();
  const res = await mapRouteHandler({ texts: TEXTS, names: NAMES }, { env, PM, embedDocuments, ...store });
  return { env, store, baseline_id: res.id, baseline: res.map };
}
const ctxOf = (fx) => ({ env: fx.env, PM, embedDocuments, loadStoredMap: fx.store.loadStoredMap });

// ===========================================================================
async function spliceTests() {
  console.log("\n[control: splice recipe]");
  await test("planSplice replaces a centered window of round(0.25*len) code units", () => {
    const host = "x".repeat(100), donor = "y".repeat(200);
    const s = planSplice(host, donor, () => 0.5);
    assert.equal(s.removed_units, 25); assert.equal(s.start, 38); assert.equal(s.end, 63);
    assert.equal(s.synthetic.length, 100); assert.equal(s.synthetic.slice(38, 63), "y".repeat(25));
    assert.equal(s.synthetic.slice(0, 38), "x".repeat(38)); assert.equal(s.synthetic.slice(63), "x".repeat(37));
  });
  await test("planSplice never splits a surrogate pair", () => {
    const host = "ab" + "😀".repeat(30) + "cd"; // 64 units
    const donor = "😀".repeat(50);
    const s = planSplice(host, donor, () => 0.37);
    for (const str of [s.synthetic]) { for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); if (c >= 0xD800 && c <= 0xDBFF) { const n = str.charCodeAt(i + 1); assert.ok(n >= 0xDC00 && n <= 0xDFFF, "lone high surrogate"); i++; } else assert.ok(!(c >= 0xDC00 && c <= 0xDFFF), "lone low surrogate"); } }
  });
  await test("planSplice with a short donor inserts the whole donor", () => {
    const s = planSplice("x".repeat(100), "yz", () => 0);
    assert.equal(s.inserted_units, 2); assert.equal(s.synthetic.length, 77);
  });
  await test("planControls is deterministic in seed and never picks host == donor", () => {
    const a = planControls(12, 12, 7).map((p) => [p.host, p.donor]);
    const b = planControls(12, 12, 7).map((p) => [p.host, p.donor]);
    assert.deepEqual(a, b); for (const [h, d] of a) { assert.notEqual(h, d); assert.ok(h >= 0 && h < 12 && d >= 0 && d < 12); }
    const c = planControls(12, 12, 8).map((p) => [p.host, p.donor]); assert.notDeepEqual(a, c);
  });
  await test("recipe constants are the documented fixed values", () => { assert.equal(SPLICE_FRACTION, 0.25); assert.equal(GENERATOR, "cutpaste-splice"); assert.equal(CONTROL_VERSION, "calibration"); });
}

async function controlPreflightTests() {
  console.log("\n[control: preflight — must reject BEFORE any AI/KV work]");
  const fx = await makeBaseline(); const ai0 = fx.env._counters.aiCalls;
  const ok = { baseline_id: fx.baseline_id, texts: TEXTS, names: NAMES };
  const call = (over) => mapControlHandler({ ...ok, ...over }, ctxOf(fx));
  await test("rejects bad baseline_id, short corpus, misaligned names", async () => {
    await expectApiError(() => call({ baseline_id: 0 }), 422, "zero id");
    await expectApiError(() => call({ texts: TEXTS.slice(0, 5), names: NAMES.slice(0, 5) }), 422, "short");
    await expectApiError(() => call({ names: NAMES.slice(0, 11) }), 422, "misaligned");
  });
  await test("rejects any recipe-tuning key with 422 and lists them", async () => {
    for (const k of ["splice_fraction", "fraction", "generator", "recipe", "window", "hosts", "donors"]) { const e = await expectApiError(() => call({ [k]: 0.5 }), 422, k); assert.ok(Array.isArray(e.extra.fixed_recipe_keys)); }
  });
  await test("rejects inherited-only instrument settings with 409", async () => {
    for (const k of ["d", "K", "T", "seed", "threshold", "frame", "persist", "target", "predicted_delta"]) await expectApiError(() => call({ [k]: 1 }), 409, k);
  });
  await test("rejects n_controls / control_seed out of range", async () => {
    await expectApiError(() => call({ n_controls: 1 }), 422, "n=1"); await expectApiError(() => call({ n_controls: 7 }), 422, "n=7"); await expectApiError(() => call({ n_controls: 2.5 }), 422, "float");
    await expectApiError(() => call({ control_seed: 1.5 }), 422, "seed float");
  });
  await test("rejects a corpus that is not byte-identical to the baseline with 409 (changed / added / missing)", async () => {
    const t2 = TEXTS.slice(); t2[3] = t2[3] + " extra";
    const e1 = await expectApiError(() => call({ texts: t2 }), 409, "changed"); assert.equal(e1.extra.changed_count, 1); assert.deepEqual(e1.extra.changed_names, [NAMES[3]]);
    const e2 = await expectApiError(() => call({ texts: [...TEXTS, "new doc body here"], names: [...NAMES, "new/x.md"] }), 409, "added"); assert.equal(e2.extra.added_count, 1);
    const n3 = NAMES.slice(); n3[0] = "docs/renamed.md";
    const e3 = await expectApiError(() => call({ names: n3 }), 409, "missing"); assert.equal(e3.extra.missing_count, 1); assert.equal(e3.extra.added_count, 1);
  });
  await test("unknown baseline is 404", () => expectApiError(() => call({ baseline_id: 999 }), 404, "missing baseline"));
  await test("no AI call happened during any rejection", () => assert.equal(fx.env._counters.aiCalls, ai0));
}

async function controlRunTests() {
  console.log("\n[control: measured run through the REAL preview path]");
  const fx = await makeBaseline();
  const vec0 = fx.env._counters.vecUpserts, saves0 = fx.store.counters.saves;
  const r = await mapControlHandler({ baseline_id: fx.baseline_id, texts: TEXTS, names: NAMES, n_controls: 4, control_seed: 11 }, ctxOf(fx));
  await test("response shape: control/persisted/version/recipe/summary/scope", () => {
    assert.equal(r.control, true); assert.equal(r.persisted, false); assert.equal(r.version, "calibration");
    assert.equal(r.recipe.generator, GENERATOR); assert.equal(r.recipe.splice_fraction, 0.25); assert.equal(r.recipe.control_seed, 11); assert.equal(r.recipe.n_controls, 4); assert.equal(r.recipe.fixed, true);
    assert.equal(r.frame_id, fx.baseline.frame_id); assert.equal(r.instrument_id, fx.baseline.instrument_id);
    assert.equal(r.task_verdict, "not-applicable"); assert.match(r.scope, /not a quality score/);
    assert.deepEqual(r.side_effects, { map_storage: false, repository: false, vectorize: false, embedding_cache: true });
  });
  await test("no map row and no Vectorize write occurred", () => { assert.equal(fx.store.counters.saves, saves0); assert.equal(fx.env._counters.vecUpserts, vec0); });
  await test("each measured control is a real one-name CHANGE on the frozen frame", () => {
    assert.equal(r.controls.length, 4);
    for (const c of r.controls.filter((c) => !c.degenerate)) {
      assert.ok(NAMES.includes(c.host) && NAMES.includes(c.donor) && c.host !== c.donor);
      assert.equal(c.frame_id, fx.baseline.frame_id); assert.equal(c.instrument_id, fx.baseline.instrument_id);
      assert.equal(c.unchanged_anchor_count, NAMES.length - 1);
      assert.ok(Number.isInteger(c.isolated_delta)); assert.equal(c.ledger_actual_delta, c.isolated_delta);
      assert.ok(typeof c.synthetic_sha256 === "string" && c.synthetic_sha256 !== c.before_sha256);
      assert.ok(Number.isInteger(c.bits_changed) && c.bits_changed >= 0); assert.ok(c.displacement_geodesic >= 0);
      assert.equal(c.quantization_silent, c.bits_changed === 0 && c.displacement_geodesic === 0);
    }
  });
  await test("summary is counts/min/median/max with n; no rate, no z", () => {
    const s = r.summary; assert.equal(s.n_requested, 4); assert.equal(s.n_measured + s.n_degenerate, 4);
    assert.equal(s.isolated_delta.negative + s.isolated_delta.zero + s.isolated_delta.positive, s.n_measured);
    assert.equal(s.isolated_delta.n, s.n_measured); assert.ok(!("rate" in s) && !("z" in s) && !("score" in s));
    assert.equal(s.bits_moved_count + (s.n_measured - s.bits_moved_count), s.n_measured);
    assert.equal(s.quantization_silent_count, r.controls.filter((c) => !c.degenerate && c.quantization_silent).length);
  });
  await test("baseline_reference carries the stored null (K, E0, SD0, p_resolution) untouched", () => {
    assert.equal(r.baseline_reference.null.K, fx.baseline.null.K); assert.equal(r.baseline_reference.null.E0, fx.baseline.null.E0); assert.equal(r.baseline_reference.isolated, fx.baseline.isolated); assert.equal(r.baseline_reference.n, NAMES.length);
  });
  await test("same seed reproduces the same host/donor plan and the same measured deltas", async () => {
    const r2 = await mapControlHandler({ baseline_id: fx.baseline_id, texts: TEXTS, names: NAMES, n_controls: 4, control_seed: 11 }, ctxOf(fx));
    assert.deepEqual(r2.controls.map((c) => [c.host, c.donor, c.isolated_delta, c.bits_changed, c.synthetic_sha256]), r.controls.map((c) => [c.host, c.donor, c.isolated_delta, c.bits_changed, c.synthetic_sha256]));
  });
  await test("a different seed changes the plan", async () => {
    const r3 = await mapControlHandler({ baseline_id: fx.baseline_id, texts: TEXTS, names: NAMES, n_controls: 4, control_seed: 12 }, ctxOf(fx));
    assert.notDeepEqual(r3.controls.map((c) => [c.host, c.donor]), r.controls.map((c) => [c.host, c.donor]));
  });
  await test("default n_controls is 4 and default seed is echoed", async () => {
    const r4 = await mapControlHandler({ baseline_id: fx.baseline_id, texts: TEXTS, names: NAMES }, ctxOf(fx));
    assert.equal(r4.recipe.n_controls, 4); assert.equal(r4.recipe.control_seed, 20260917); assert.equal(r4.controls.length, 4);
  });
  await test("an injected preview double is used per control (wiring), and the real one is the default", async () => {
    let calls = 0;
    const fakePreview = async (body) => { calls++; assert.equal(body.target.action, "change"); assert.equal(body.names.length, NAMES.length); return { comparison: { per_name: [{ name: body.target.name, bits_changed: 1, displacement_geodesic: 0.1, displacement_chord: 0.1, quantization_silent: false }], isolated_delta: -1, occupied_sectors_delta: 0 }, math_ledger: { measurement: { actual_delta: -1 } }, target: { before_sha256: "a", after_sha256: "b" }, unchanged_anchor_count: 11, map: { frame_id: "f", instrument_id: "i" } }; };
    const r5 = await mapControlHandler({ baseline_id: fx.baseline_id, texts: TEXTS, names: NAMES, n_controls: 3 }, { ...ctxOf(fx), previewHandler: fakePreview });
    assert.equal(calls, 3); assert.equal(r5.summary.isolated_delta.negative, 3); assert.equal(r5.summary.bits_moved_count, 3);
  });
}

// ===========================================================================
async function outcomesTests() {
  console.log("\n[outcomes: append-only pre-registration ledger]");
  const fx = await makeBaseline(); const os = makeOutcomeStore();
  const ctx = { loadStoredMap: fx.store.loadStoredMap, insertOutcome: os.insertOutcome, getOutcome: os.getOutcome, PM, now: () => new Date("2026-09-17T10:00:00Z") };
  const base = { baseline_id: fx.baseline_id, target: { action: "change", name: NAMES[2] }, predicted_delta: -1, task_check: { verdict: "pending", verifier: "human reviewer" } };
  const post = (over) => outcomesPostHandler({ ...base, ...over }, ctx);

  await test("validation: body/ids/target/verdict/verifier/notes", async () => {
    await expectApiError(() => outcomesPostHandler(null, ctx), 422, "null");
    await expectApiError(() => post({ baseline_id: -1 }), 422, "id");
    await expectApiError(() => post({ target: { action: "remove", name: "x" } }), 422, "remove action");
    await expectApiError(() => post({ target: { action: "change", name: "" } }), 422, "empty name");
    await expectApiError(() => post({ predicted_delta: "−1" }), 422, "string delta");
    await expectApiError(() => post({ task_check: { verdict: "great", verifier: "x" } }), 422, "verdict");
    await expectApiError(() => post({ task_check: { verdict: "kept", verifier: "" } }), 422, "verifier");
    await expectApiError(() => post({ task_check: { verdict: "kept", verifier: "x".repeat(201) } }), 422, "long verifier");
    await expectApiError(() => post({ task_check: { verdict: "kept", verifier: "h", notes: "n".repeat(2001) } }), 422, "long notes");
    await expectApiError(() => post({ after_id: 1, observed_delta: 0 }), 422, "both observed sources");
    for (const k of ["score", "quality", "success_rate", "rate", "confidence", "z"]) await expectApiError(() => post({ [k]: 1 }), 422, k);
  });
  await test("'geometry' is not an admissible verifier for a non-pending verdict", () => expectApiError(() => post({ task_check: { verdict: "kept", verifier: "Geometry" } }), 422, "geometry verifier"));
  await test("404 on unknown baseline; 409 when CHANGE target is not in baseline / ADD target already exists", async () => {
    await expectApiError(() => post({ baseline_id: 999 }), 404, "no baseline");
    await expectApiError(() => post({ target: { action: "change", name: "nope.md" } }), 409, "change missing");
    await expectApiError(() => post({ target: { action: "add", name: NAMES[0] } }), 409, "add exists");
  });
  await test("no row was inserted by any rejected request", () => assert.equal(os.rows.length, 0));

  let regId;
  await test("phase 1: register a pending prediction (preregistered:true, observed none)", async () => {
    const r = await post({});
    regId = r.id; assert.equal(r.persisted, true); assert.equal(r.append_only, true);
    assert.equal(r.entry.preregistered, true); assert.equal(r.entry.predicted_sign, "negative"); assert.equal(r.entry.observed_sign, "none"); assert.equal(r.entry.observed_source, "none"); assert.equal(r.entry.sign_exact, null);
    assert.equal(r.entry.frame_id, fx.baseline.frame_id); assert.equal(r.entry.created_at, "2026-09-17T10:00:00.000Z"); assert.equal(r.entry.version, OUTCOMES_VERSION);
  });
  let afterId, afterDelta;
  await test("phase 2: a real CHANGE map on the frozen frame yields a server-recomputed observed delta", async () => {
    const t2 = TEXTS.slice(); t2[2] = t2[2] + " A substantially different appended paragraph about firmware measurement and key custody. ".repeat(4);
    const after = await mapRouteHandler({ texts: t2, names: NAMES, baseline_id: fx.baseline_id }, { env: fx.env, PM, embedDocuments, ...fx.store });
    afterId = after.id; afterDelta = after.comparison.isolated_delta;
    const r = await post({ after_id: afterId, supersedes: regId, task_check: { verdict: "reverted", verifier: "human reviewer", notes: "content check failed" } });
    assert.equal(r.entry.observed_source, "server:explainTransition"); assert.equal(r.entry.observed_delta, afterDelta); assert.equal(r.entry.after_frame_id, fx.baseline.frame_id);
    assert.equal(r.entry.preregistered, true); assert.equal(r.entry.supersedes, regId);
    assert.equal(r.entry.sign_exact, Math.sign(afterDelta) === -1);
  });
  await test("supersedes must exist and share baseline+target", async () => {
    await expectApiError(() => post({ supersedes: 999, task_check: { verdict: "kept", verifier: "h" } }), 404, "no row");
    await expectApiError(() => post({ target: { action: "change", name: NAMES[5] }, supersedes: regId, task_check: { verdict: "kept", verifier: "h" } }), 409, "different target");
  });
  await test("after_id whose transition moves a different name is 409; mismatched frame is 409", async () => {
    await expectApiError(() => post({ target: { action: "change", name: NAMES[7] }, after_id: afterId, task_check: { verdict: "kept", verifier: "h" } }), 409, "other name");
    const other = await mapRouteHandler({ texts: TEXTS.map((t) => t + " z"), names: NAMES }, { env: fx.env, PM, embedDocuments, ...fx.store });
    await expectApiError(() => post({ after_id: other.id, task_check: { verdict: "kept", verifier: "h" } }), 409, "frame mismatch");
  });
  await test("caller-supplied observed_delta is stored as observed_source:caller and a one-shot row is flagged not preregistered", async () => {
    const r = await post({ target: { action: "add", name: "new/z.md" }, predicted_delta: 0, observed_delta: 1, task_check: { verdict: "kept", verifier: "grader B" } });
    assert.equal(r.entry.observed_source, "caller"); assert.equal(r.entry.preregistered, false); assert.equal(r.entry.sign_exact, false);
  });
  await test("GET returns rows, contingency counts only, baseline filter and scope", async () => {
    const g = await outcomesGetHandler({ baseline_id: String(fx.baseline_id) }, { listOutcomes: os.listOutcomes });
    assert.equal(g.version, OUTCOMES_VERSION); assert.equal(g.rows.length, 3); assert.equal(g.append_only, true); assert.match(g.scope, /not a calibrated success rate/);
    const c = g.contingency; assert.equal(c.n_rows, 3); assert.equal(c.n_pending, 1); assert.equal(c.n_superseded, 1); assert.equal(c.n_effective, 2);
    assert.equal(c.by_verdict.reverted, 1); assert.equal(c.by_verdict.kept, 1); assert.equal(c.n_sign_comparable, 2);
    assert.equal(c.sign_exact_count, (Math.sign(afterDelta) === -1 ? 1 : 0));
    assert.equal(c.observed_source_counts.server, 1); assert.equal(c.observed_source_counts.caller, 1); assert.equal(c.n_preregistered, 1);
    const flat = JSON.stringify(c); assert.ok(!/"rate"|"percent"|"success_rate"|"z":/.test(flat));
    const g2 = await outcomesGetHandler({ baseline_id: "999" }, { listOutcomes: os.listOutcomes }); assert.equal(g2.rows.length, 0); assert.equal(g2.contingency.n_effective, 0);
    await expectApiError(() => outcomesGetHandler({ baseline_id: "abc" }, { listOutcomes: os.listOutcomes }), 422, "bad filter");
  });
  await test("contingency(): superseded rows leave the effective set but stay counted in n_rows", () => {
    const rows = [
      { id: 1, baseline_id: 1, predicted_sign: "negative", observed_sign: "none", sign_exact: null, observed_source: "none", preregistered: true, task_check: { verdict: "pending" } },
      { id: 2, baseline_id: 1, supersedes: 1, predicted_sign: "negative", observed_sign: "negative", sign_exact: true, observed_source: "server:explainTransition", preregistered: true, task_check: { verdict: "kept" } },
      { id: 3, baseline_id: 1, predicted_sign: "positive", observed_sign: "zero", sign_exact: false, observed_source: "caller", preregistered: false, task_check: { verdict: "neutral" } },
      { id: 4, baseline_id: 1, predicted_sign: "none", observed_sign: "none", sign_exact: null, observed_source: "none", preregistered: false, task_check: { verdict: "abstained" } },
    ];
    const c = contingency(rows);
    assert.equal(c.n_effective, 3); assert.equal(c.sign_exact_count, 1); assert.equal(c.n_sign_comparable, 2);
    assert.equal(c.predicted_sign_by_observed_sign.negative.negative, 1); assert.equal(c.predicted_sign_by_observed_sign.positive.zero, 1); assert.equal(c.predicted_sign_by_observed_sign.none.none, 1);
    assert.equal(c.verdict_by_sign_exact.exact.kept, 1); assert.equal(c.verdict_by_sign_exact.not_exact.neutral, 1); assert.equal(c.verdict_by_sign_exact.untested.abstained, 1);
    assert.deepEqual(Object.keys(c.by_verdict).sort(), VERDICTS.filter((v) => v !== "pending").sort());
  });
}

await spliceTests();
await controlPreflightTests();
await controlRunTests();
await outcomesTests();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
