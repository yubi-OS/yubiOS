#!/usr/bin/env node
// test-preview.mjs — Node-runnable tests for POST /api/map/preview
// (lib/preview-route.mjs) and the additive math_ledger field on
// lib/map-route.mjs.
//
// Boundary discipline (explicit):
//   - REAL:  pointmap.js, loaded verbatim via node:vm exactly as shipped.
//            Every geometry/anchor assertion runs against the actual
//            PM.runMap / PM.compareMaps.
//   - FAKE:  env.AI.run — deterministic hash-based pseudo-embedder
//            (SYNTHETIC, not bge-base-en-v1.5). These tests can never claim
//            "real embeddings verified"; only pipeline + geometry mechanics.
//   - FAKE:  env.SITE (KV) and the map store — in-memory Maps. No D1 SQL is
//            executed here; worker-base.js's own statements are exercised
//            only when deployed.
//   - REAL: PM.explainTransition and PM.projectionMargins; no substitute mathematics.
//
// Run: node session/subagent/test-preview.mjs

import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiError } from "./lib/http.mjs";
import { sha256Hex } from "./lib/chunking.mjs";
import { embedDocuments } from "./lib/embed-pipeline.mjs";
import { mapRouteHandler } from "./lib/map-route.mjs";
import { mapPreviewHandler } from "./lib/preview-route.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --------------------------------------------------------------------------
// REAL pointmap.js, loaded verbatim.
// --------------------------------------------------------------------------
function loadRealPointMap() {
  const code = fs.readFileSync(path.resolve(__dirname, "pointmap.js"), "utf8");
  const sandbox = {
    console, Math, Array, Object, JSON, Number, String, Boolean, RangeError, TypeError, Error,
    Set, Map, Infinity, NaN, isNaN, isFinite, BigInt, Uint8Array, Float32Array, Float64Array,
    TextEncoder, TextDecoder,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "pointmap.js" });
  if (!sandbox.PM || typeof sandbox.PM.runMap !== "function") throw new Error("failed to load real PM from pointmap.js");
  return sandbox.PM;
}
const PM = loadRealPointMap();

// --------------------------------------------------------------------------
// UNIT DOUBLES for the UNLANDED PM.explainTransition / PM.projectionMargins.
// Simple, independent, and deliberately not clever: they exist to prove the
// route's wiring, never to stand in for the real math.
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// FAKE (synthetic) Workers AI + KV. `aiCalls` lets a test assert that a
// rejection happened BEFORE any model work.
// --------------------------------------------------------------------------
function fakeEmbedVector(text, D) {
  const v = new Array(D).fill(0);
  for (let i = 0; i < text.length; i++) v[i % D] += Math.sin(text.charCodeAt(i) * (i + 1) * 0.017 + (i % D) * 0.31);
  if (v.every((x) => x === 0)) v[0] = 1;
  return v;
}
function makeFakeEnv({ aiDim = 768, kvStore = new Map() } = {}) {
  const counters = { aiCalls: 0, kvPuts: 0, vecUpserts: 0 };
  return {
    AI: {
      async run(model, opts) {
        counters.aiCalls++;
        assert.equal(opts.pooling, "mean");
        return { data: opts.text.map((t) => fakeEmbedVector(t, aiDim)) };
      },
    },
    SITE: {
      async get(key, type) { const v = kvStore.get(key); return v === undefined ? null : (type === "json" ? JSON.parse(v) : v); },
      async put(key, value) { counters.kvPuts++; kvStore.set(key, value); },
    },
    VEC: { async upsert() { counters.vecUpserts++; throw new Error("preview must never reach Vectorize"); } },
    _counters: counters,
    _kvStore: kvStore,
  };
}
function makeInMemoryMapStore() {
  const rows = new Map();
  const counters = { saves: 0 };
  let nextId = 1;
  return {
    rows, counters,
    async loadStoredMap(id) { const r = rows.get(Number(id)); return r ? r.map : null; },
    async saveMap(map) { counters.saves++; const id = nextId++; rows.set(id, { map }); return id; },
  };
}

// --------------------------------------------------------------------------
// Minimal runner
// --------------------------------------------------------------------------
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok  - ${name}`); }
  catch (e) { results.push({ name, ok: false, error: e }); console.log(`FAIL  - ${name}`); console.log("        " + (e?.stack || e)); }
}
async function expectApiError(fn, status, description) {
  try { await fn(); }
  catch (e) {
    assert.ok(e instanceof ApiError, `${description}: expected ApiError, got ${e?.constructor?.name}: ${e?.message}`);
    assert.equal(e.status, status, `${description}: expected ${status}, got ${e.status} (${e.message})`);
    return e;
  }
  throw new Error(`${description}: expected ApiError(${status}), nothing thrown`);
}

// --------------------------------------------------------------------------
// Fixture corpus + baseline
// --------------------------------------------------------------------------
const BASE_NAMES = ["docs/a.md", "docs/b.md", "docs/c.md", "src/d.mjs", "src/e.mjs", "src/f.mjs",
  "refs/g.md", "refs/h.md", "notes/i.md", "notes/j.md", "notes/k.md", "notes/l.md"];
function baseText(i) {
  return `Document ${i}: the frozen-frame instrument measures candidate corpora. ` +
    `Section ${i} discusses attestation, trust chain and declarative policy in sentence number ${i}. `.repeat(3);
}
const BASE_TEXTS = BASE_NAMES.map((_, i) => baseText(i));

async function makeBaseline() {
  const env = makeFakeEnv();
  const store = makeInMemoryMapStore();
  const res = await mapRouteHandler({ texts: BASE_TEXTS, names: BASE_NAMES }, { env, PM, embedDocuments, ...store });
  assert.equal(store.counters.saves, 1, "baseline must have been persisted by /api/map");
  return { env, store, baseline_id: res.id, baseline: res.map };
}
function previewCtx({ env, store }, extra = {}) {
  return { env, PM, embedDocuments, loadStoredMap: store.loadStoredMap, ...extra };
}
const clone = (o) => JSON.parse(JSON.stringify(o));

// ===========================================================================
async function preflightTests() {
  console.log("\n[preview: preflight validation — must reject BEFORE any AI/KV work]");
  const fx = await makeBaseline();
  const aiBefore = fx.env._counters.aiCalls;
  const ok = { baseline_id: fx.baseline_id, texts: BASE_TEXTS, names: BASE_NAMES, target: { action: "change", name: BASE_NAMES[0] } };
  const call = (over) => mapPreviewHandler({ ...ok, ...over }, previewCtx(fx));

  await test("rejects a non-object body with 422", () => expectApiError(() => mapPreviewHandler("nope", previewCtx(fx)), 422, "string body"));
  await test("rejects a non-positive-integer baseline_id with 422", async () => {
    await expectApiError(() => call({ baseline_id: 0 }), 422, "zero");
    await expectApiError(() => call({ baseline_id: 1.5 }), 422, "float");
    await expectApiError(() => call({ baseline_id: "1" }), 422, "string");
  });
  await test("rejects a partial corpus (fewer than 10 texts) with 422", () => expectApiError(() => call({ texts: BASE_TEXTS.slice(0, 3), names: BASE_NAMES.slice(0, 3) }), 422, "short corpus"));
  await test("rejects names/texts length mismatch with 422", () => expectApiError(() => call({ names: BASE_NAMES.slice(0, 11) }), 422, "length mismatch"));
  await test("rejects duplicate names with 422", () => expectApiError(() => call({ names: [...BASE_NAMES.slice(0, 11), BASE_NAMES[0]] }), 422, "duplicate names"));
  await test("rejects an empty text with 422", () => expectApiError(() => call({ texts: [" ", ...BASE_TEXTS.slice(1)] }), 422, "blank text"));
  await test("rejects a missing/invalid target with 422", async () => {
    await expectApiError(() => call({ target: undefined }), 422, "no target");
    await expectApiError(() => call({ target: { action: "delete", name: "x" } }), 422, "bad action");
    await expectApiError(() => call({ target: { action: "change", name: "" } }), 422, "empty name");
  });
  await test("rejects non-finite / negative diagnostic options with 422", async () => {
    await expectApiError(() => call({ predicted_delta: "0.1" }), 422, "string predicted_delta");
    await expectApiError(() => call({ predicted_delta: Infinity }), 422, "infinite predicted_delta");
    await expectApiError(() => call({ perturbation_linf: -1e-9 }), 422, "negative perturbation");
    await expectApiError(() => call({ roundoff_budget: -1 }), 422, "negative roundoff");
  });
  await test("rejects a caller-supplied frame or instrument setting with 409 (documented reject policy, never silent ignore)", async () => {
    for (const key of ["frame", "d", "K", "T", "seed", "steps", "threshold", "ideal", "preprocessing_id", "vectors", "persist", "labels"]) {
      const e = await expectApiError(() => call({ [key]: key === "frame" ? { config: {} } : 7 }), 409, `override ${key}`);
      assert.ok(e.message.includes(key), `409 message must name the offending key ${key}`);
    }
  });
  await test("rejects a stale source hash on a NON-target document with 409 and names it", async () => {
    const texts = [...BASE_TEXTS]; texts[5] = texts[5] + " silently edited elsewhere";
    const e = await expectApiError(() => call({ texts, target: { action: "change", name: BASE_NAMES[0] } }), 409, "stale non-target source");
    assert.deepEqual([...e.extra.changed_names], [BASE_NAMES[5]], "only the silently-edited non-target document differs");
  });
  await test("rejects a deletion with 409 and lists the missing names", async () => {
    const e = await expectApiError(() => call({ texts: BASE_TEXTS.slice(0, 11).concat([baseText(99)]), names: BASE_NAMES.slice(0, 11).concat(["new/x.md"]), target: { action: "add", name: "new/x.md" } }), 409, "deletion");
    assert.deepEqual([...e.extra.missing_names], [BASE_NAMES[11]]);
  });
  await test("rejects an ADD whose new name is not target.name with 409", () =>
    expectApiError(() => call({ texts: [...BASE_TEXTS, baseText(99)], names: [...BASE_NAMES, "new/x.md"], target: { action: "add", name: "new/y.md" } }), 409, "add name mismatch"));
  await test("rejects an ADD that also edits an existing document with 409", () => {
    const texts = [...BASE_TEXTS, baseText(99)]; texts[2] += " also edited";
    return expectApiError(() => call({ texts, names: [...BASE_NAMES, "new/x.md"], target: { action: "add", name: "new/x.md" } }), 409, "add + edit");
  });
  await test("rejects a CHANGE that alters multiple documents with 409", () => {
    const texts = [...BASE_TEXTS]; texts[0] += " edit one"; texts[3] += " edit two";
    return expectApiError(() => call({ texts, target: { action: "change", name: BASE_NAMES[0] } }), 409, "multi-change");
  });
  await test("rejects a CHANGE whose target is not in the baseline with 409", () =>
    expectApiError(() => call({ target: { action: "change", name: "not/here.md" } }), 409, "unknown target"));
  await test("rejects an ADD that also introduces a second new name with 409", () =>
    expectApiError(() => call({ texts: [...BASE_TEXTS, baseText(98), baseText(99)], names: [...BASE_NAMES, "new/x.md", "new/y.md"], target: { action: "add", name: "new/x.md" } }), 409, "two adds"));

  await test("no AI call and no KV write happened during ANY of the preflight rejections", () => {
    assert.equal(fx.env._counters.aiCalls, aiBefore, "preflight must not spend model work");
    assert.equal(fx.env._counters.vecUpserts, 0, "preflight must not touch Vectorize");
  });
}

async function baselineShapeTests() {
  console.log("\n[preview: baseline admissibility]");
  const fx = await makeBaseline();
  const body = { baseline_id: fx.baseline_id, texts: BASE_TEXTS, names: BASE_NAMES, target: { action: "change", name: BASE_NAMES[0] } };

  await test("missing baseline row gives 404", () => expectApiError(() => mapPreviewHandler({ ...body, baseline_id: 999 }, previewCtx(fx)), 404, "missing"));

  const withBaseline = (mutate) => {
    const map = clone(fx.baseline); mutate(map);
    return previewCtx(fx, { loadStoredMap: async () => map });
  };
  await test("legacy baseline without a frozen frame gives 409 asking for a new text baseline", async () => {
    const e = await expectApiError(() => mapPreviewHandler(body, withBaseline((m) => { delete m.frame; })), 409, "no frame");
    assert.match(e.message, /new text baseline/);
  });
  await test("pre-0.2 baseline version gives 409", () => expectApiError(() => mapPreviewHandler(body, withBaseline((m) => { m.version = "pointmap/0.1"; })), 409, "old version"));
  await test("vector-sourced (raw/v1) baseline gives 409 asking for a new text baseline", async () => {
    const e = await expectApiError(() => mapPreviewHandler(body, withBaseline((m) => { m.preprocessing_id = "raw/v1"; delete m.embedding_metadata; })), 409, "vector baseline");
    assert.match(e.message, /new text baseline/);
  });
  await test("baseline missing per-document SHA256 metadata gives 409", () =>
    expectApiError(() => mapPreviewHandler(body, withBaseline((m) => { delete m.embedding_metadata.docs; })), 409, "no docs metadata"));
  await test("baseline missing full-precision pts_full gives 409", async () => {
    const e = await expectApiError(() => mapPreviewHandler(body, withBaseline((m) => { delete m.pts_full; })), 409, "no pts_full");
    assert.match(e.message, /full-precision/);
  });
  await test("baseline missing bits gives 409", () => expectApiError(() => mapPreviewHandler(body, withBaseline((m) => { delete m.bits; })), 409, "no bits"));
}

async function happyPathTests() {
  console.log("\n[preview: ADD / CHANGE / no-op on the inherited frozen frame]");

  await test("ADD: one new name, every baseline anchor byte-identical, nothing persisted", async () => {
    const fx = await makeBaseline();
    const names = [...BASE_NAMES, "refs/new-doc.md"];
    const texts = [...BASE_TEXTS, "A brand new candidate document about frozen-frame previews. ".repeat(6)];
    const savesBefore = fx.store.counters.saves;
    const out = await mapPreviewHandler({ baseline_id: fx.baseline_id, texts, names, target: { action: "add", name: "refs/new-doc.md" } }, previewCtx(fx));

    assert.equal(out.preview, true);
    assert.equal(out.persisted, false);
    assert.equal(out.baseline_id, fx.baseline_id);
    assert.equal(out.map.n, 13, "the ephemeral map must contain the resulting corpus");
    assert.equal(out.map.frame_id, fx.baseline.frame_id, "ADD must reuse the baseline's frozen frame");
    assert.equal(out.map.instrument_id, fx.baseline.instrument_id, "instrument identity must be inherited");
    assert.equal(out.unchanged_source_count, 12);
    assert.equal(out.unchanged_anchor_count, 12, "all 12 baseline anchors must be verified unmoved");
    assert.equal(out.target.action, "add");
    assert.equal(out.target.before_sha256, null);
    assert.equal(out.target.after_sha256, await sha256Hex(texts[12]));
    assert.equal(out.target.noop, false);
    assert.deepEqual(out.side_effects, { map_storage: false, repository: false, vectorize: false, embedding_cache: true });
    assert.equal(out.task_verdict, "not-tested");
    assert.equal(fx.store.counters.saves, savesBefore, "preview must not persist a map row");
    assert.equal(fx.env._counters.vecUpserts, 0, "preview must not write Vectorize");

    // exact per-anchor equality, checked here and not only inside the handler
    const idx = new Map(out.map.names.map((n, j) => [n, j]));
    BASE_NAMES.forEach((n, i) => {
      assert.deepEqual([...out.map.pts_full[idx.get(n)]], [...fx.baseline.pts_full[i]], `points moved for ${n}`);
      assert.deepEqual([...out.map.bits[idx.get(n)]], [...fx.baseline.bits[i]], `bits changed for ${n}`);
    });
  });

  await test("ADD: name-set comparison is unsupported by PM.compareMaps and is reported, not faked", async () => {
    const fx = await makeBaseline();
    const out = await mapPreviewHandler({
      baseline_id: fx.baseline_id,
      texts: [...BASE_TEXTS, "new candidate text ".repeat(20)],
      names: [...BASE_NAMES, "refs/new-doc.md"],
      target: { action: "add", name: "refs/new-doc.md" },
    }, previewCtx(fx));
    assert.equal(out.comparison.comparable, false);
    assert.equal(out.comparison.task_verdict, "not-tested");
    assert.match(out.comparison.reason, /name sets differ/);
    assert.match(out.comparison_note, /unsupported for ADD/);
  });

  await test("CHANGE: exactly the target moves; the other 11 anchors stay byte-identical", async () => {
    const fx = await makeBaseline();
    const texts = [...BASE_TEXTS];
    texts[4] = "Rewritten source for src/e.mjs with entirely different content. ".repeat(8);
    const out = await mapPreviewHandler({ baseline_id: fx.baseline_id, texts, names: BASE_NAMES, target: { action: "change", name: "src/e.mjs" } }, previewCtx(fx));

    assert.equal(out.target.noop, false);
    assert.notEqual(out.target.before_sha256, out.target.after_sha256);
    assert.equal(out.target.before_sha256, fx.baseline.embedding_metadata.docs[4].sha256);
    assert.equal(out.target.after_sha256, await sha256Hex(texts[4]));
    assert.equal(out.unchanged_source_count, 11);
    assert.equal(out.unchanged_anchor_count, 11);
    assert.equal(out.map.frame_id, fx.baseline.frame_id);
    assert.deepEqual([...out.comparison.changed_content_names], ["src/e.mjs"]);
    const idx = new Map(out.map.names.map((n, j) => [n, j]));
    BASE_NAMES.filter((n) => n !== "src/e.mjs").forEach((n) => {
      const i = BASE_NAMES.indexOf(n);
      assert.deepEqual([...out.map.pts_full[idx.get(n)]], [...fx.baseline.pts_full[i]]);
      assert.deepEqual([...out.map.bits[idx.get(n)]], [...fx.baseline.bits[i]]);
    });
  });

  await test("CHANGE: a byte-identical target is allowed and explicitly stated as a no-op", async () => {
    const fx = await makeBaseline();
    const out = await mapPreviewHandler({ baseline_id: fx.baseline_id, texts: BASE_TEXTS, names: BASE_NAMES, target: { action: "change", name: "docs/a.md" } }, previewCtx(fx));
    assert.equal(out.target.noop, true);
    assert.match(out.target.noop_note, /no-op/);
    assert.equal(out.unchanged_source_count, 12);
    assert.equal(out.unchanged_anchor_count, 12);
    assert.equal(out.comparison.geometry_decision, "stable");
  });

  await test("multi-document baselines: a CHANGE of the last item is accepted and localized", async () => {
    const fx = await makeBaseline();
    const texts = [...BASE_TEXTS];
    texts[11] = "Completely different notes/l.md body text for the change case. ".repeat(9);
    const out = await mapPreviewHandler({ baseline_id: fx.baseline_id, texts, names: BASE_NAMES, target: { action: "change", name: "notes/l.md" } }, previewCtx(fx));
    assert.deepEqual([...out.comparison.changed_content_names], ["notes/l.md"]);
    assert.equal(out.unchanged_anchor_count, 11);
  });

  await test("a traversal-looking literal name is a harmless label: accepted, and no file is created", async () => {
    const fx = await makeBaseline();
    const weird = "../../etc/passwd";
    const before = new Set(fs.readdirSync(__dirname));
    const out = await mapPreviewHandler({
      baseline_id: fx.baseline_id,
      texts: [...BASE_TEXTS, "candidate content for a traversal-looking literal name ".repeat(10)],
      names: [...BASE_NAMES, weird],
      target: { action: "add", name: weird },
    }, previewCtx(fx));
    assert.ok(out.map.names.includes(weird), "the literal name must be preserved verbatim as a map key");
    assert.equal(out.unchanged_anchor_count, 12);
    assert.deepEqual([...new Set(fs.readdirSync(__dirname))].sort(), [...before].sort(), "preview must not write to the filesystem");
    assert.equal(fs.existsSync(path.resolve(__dirname, weird)), false);
  });
}

async function ledgerAndDiagnosticsTests() {
  await test("real preview ledger and target margins execute",async()=>{
    const fx=await makeBaseline();
    const out=await mapPreviewHandler({baseline_id:fx.baseline_id,texts:BASE_TEXTS,names:BASE_NAMES,target:{action:"change",name:BASE_NAMES[0]}},previewCtx(fx));
    assert.equal(out.math_ledger.kind,"CHANGE");assert.equal(out.math_ledger.ledger.delta,0);
    assert.equal(out.math_ledger.correspondence.status,"lean-known");
    assert.equal(out.map_diagnostics.available,true);
    assert.ok(out.map_diagnostics.target_input.margins.every(x=>x.status==="needs-roundoff-bound"));
  });
  await test("actual changed text produces real signed margins and exact ledger",async()=>{
    const fx=await makeBaseline();const texts=[...BASE_TEXTS];texts[1]="New candidate with calibration, inputs and preservation constraints. ".repeat(8);
    const out=await mapPreviewHandler({baseline_id:fx.baseline_id,texts,names:BASE_NAMES,target:{action:"change",name:BASE_NAMES[1]},predicted_delta:-2,perturbation_linf:1e-6,roundoff_budget:1e-12},previewCtx(fx));
    assert.equal(out.math_ledger.ledger.delta,out.map.isolated-fx.baseline.isolated);
    assert.equal(out.math_ledger.reduction.ratio,(-out.math_ledger.ledger.delta)/2);
    assert.equal(out.map_diagnostics.roundoff_budget,1e-12);assert.equal(out.map_diagnostics.perturbation_linf,1e-6);
    assert.equal(out.map_diagnostics.target_input.name,BASE_NAMES[1]);
    assert.ok(out.map_diagnostics.target_input.margins.every(x=>Number.isFinite(x.signed_margin)&&x.perturbation_bound!==null));
  });
  await test("diagnostic budgets preserve all instrument identifiers",async()=>{
    const fx=await makeBaseline(),body={baseline_id:fx.baseline_id,texts:BASE_TEXTS,names:BASE_NAMES,target:{action:"change",name:BASE_NAMES[0]}};
    const a=await mapPreviewHandler(body,previewCtx(fx)),b=await mapPreviewHandler({...body,roundoff_budget:1e-9,perturbation_linf:0.5,predicted_delta:-3},previewCtx(fx));
    assert.equal(a.map.frame_id,b.map.frame_id);assert.equal(a.map.instrument_id,b.map.instrument_id);assert.equal(a.map.run_fingerprint,b.map.run_fingerprint);
  });
  await test("broken ledger halts preview instead of claiming success",async()=>{
    const fx=await makeBaseline();await expectApiError(()=>mapPreviewHandler({baseline_id:fx.baseline_id,texts:BASE_TEXTS,names:BASE_NAMES,target:{action:"change",name:BASE_NAMES[0]}},previewCtx(fx,{explainTransition:()=>{throw new Error("forced ledger mismatch")}})),409,"halt bad ledger");
  });
}

async function driftAndCacheTests() {
  console.log("\n[preview: anchor drift vs representation drift, embedding cache]");

  await test("anchor drift on an untouched name is rejected with 409 and detail", async () => {
    const fx = await makeBaseline();
    const tampered = clone(fx.baseline);
    tampered.pts_full[7] = tampered.pts_full[7].map((x) => x + 0.25); // pretend the baseline recorded a different position
    const e = await expectApiError(
      () => mapPreviewHandler({ baseline_id: fx.baseline_id, texts: BASE_TEXTS, names: BASE_NAMES, target: { action: "change", name: "docs/a.md" } }, previewCtx(fx, { loadStoredMap: async () => tampered })),
      409, "anchor drift"
    );
    assert.match(e.message, /untouched anchors moved/);
    assert.equal(e.extra.drift_count, 1);
    assert.equal(e.extra.drift[0].name, BASE_NAMES[7]);
    assert.equal(e.extra.drift[0].points_equal, false);
  });

  await test("bit drift alone on an untouched name is also rejected with 409", async () => {
    const fx = await makeBaseline();
    const tampered = clone(fx.baseline);
    tampered.bits[3] = tampered.bits[3].map((b, i) => (i === 0 ? 1 - b : b));
    const e = await expectApiError(
      () => mapPreviewHandler({ baseline_id: fx.baseline_id, texts: BASE_TEXTS, names: BASE_NAMES, target: { action: "change", name: "docs/a.md" } }, previewCtx(fx, { loadStoredMap: async () => tampered })),
      409, "bit drift"
    );
    assert.equal(e.extra.drift[0].bits_equal, false);
  });

  await test("cached-vector fingerprint drift with identical points, bits and source hash is logged as representation drift, not a failure", async () => {
    const fx = await makeBaseline();
    const tampered = clone(fx.baseline);
    tampered.keys[6].hash = "deadbeefdeadbeef"; // same content, same geometry, different recorded fingerprint
    const out = await mapPreviewHandler(
      { baseline_id: fx.baseline_id, texts: BASE_TEXTS, names: BASE_NAMES, target: { action: "change", name: "docs/a.md" } },
      previewCtx(fx, { loadStoredMap: async () => tampered })
    );
    assert.deepEqual([...out.representation_drift_names], [BASE_NAMES[6]]);
    assert.equal(out.unchanged_anchor_count, 12, "representation drift must not disqualify the anchor");
    assert.equal(out.target.noop, true);
  });

  await test("the embedding cache is preserved and reused: a repeated preview is a full cache hit and costs no AI calls", async () => {
    const fx = await makeBaseline();
    const body = { baseline_id: fx.baseline_id, texts: BASE_TEXTS, names: BASE_NAMES, target: { action: "change", name: "docs/a.md" } };
    const first = await mapPreviewHandler(body, previewCtx(fx));
    const aiAfterFirst = fx.env._counters.aiCalls;
    const second = await mapPreviewHandler(body, previewCtx(fx));
    assert.equal(second.map.embedding_metadata.cache_hits, 12, "the second preview must hit the content-hash cache for every document");
    assert.equal(fx.env._counters.aiCalls, aiAfterFirst, "a fully-cached preview must not call the model again");
    assert.deepEqual(JSON.parse(JSON.stringify(second.map.pts_full)), JSON.parse(JSON.stringify(first.map.pts_full)), "cache reuse must be bit-for-bit identical");
  });
}

async function mapRouteLedgerTests() {
  console.log("\n[/api/map: additive math_ledger, no lifecycle change]");

  await test("mapRouteHandler still returns id/map/comparison/persisted and adds math_ledger only when a baseline and helper exist", async () => {
    const fx = await makeBaseline();
    const plain = await mapRouteHandler({ texts: BASE_TEXTS, names: BASE_NAMES }, { env: fx.env, PM, embedDocuments, ...fx.store });
    assert.equal(plain.persisted, true);
    assert.equal(plain.math_ledger, null, "no baseline -> no ledger");

    const withBaseline = await mapRouteHandler(
      { texts: BASE_TEXTS, names: BASE_NAMES, baseline_id: fx.baseline_id, persist: false, predicted_delta: 1.5 },
      { env: fx.env, PM, embedDocuments, ...fx.store, explainTransition: PM.explainTransition.bind(PM) }
    );
    assert.equal(withBaseline.persisted, false);
    assert.equal(withBaseline.id, null);
    assert.equal(withBaseline.math_ledger.reduction.eligible, false);
    assert.equal(withBaseline.math_ledger.ledger.delta, 0);
  });

  await test("mapRouteHandler rejects a non-finite predicted_delta with 422", async () => {
    const fx = await makeBaseline();
    await expectApiError(() => mapRouteHandler({ texts: BASE_TEXTS, names: BASE_NAMES, predicted_delta: NaN }, { env: fx.env, PM, embedDocuments, ...fx.store }), 422, "NaN predicted_delta");
  });

  await test("preview passes a throwing saveMap: a future edit that tries to persist fails loudly", async () => {
    const fx = await makeBaseline();
    const src = fs.readFileSync(path.resolve(__dirname, "lib/preview-route.mjs"), "utf8");
    assert.match(src, /preview must never persist a map/, "the throwing saveMap spy must remain in place");
    const out = await mapPreviewHandler({ baseline_id: fx.baseline_id, texts: BASE_TEXTS, names: BASE_NAMES, target: { action: "change", name: "docs/a.md" } }, previewCtx(fx));
    assert.equal(out.persisted, false);
    assert.equal(fx.store.counters.saves, 1, "only the baseline save from setup");
  });
}

// ===========================================================================
async function main() {
  await preflightTests();
  await baselineShapeTests();
  await happyPathTests();
  await ledgerAndDiagnosticsTests();
  await driftAndCacheTests();
  await mapRouteLedgerTests();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log(`${failed.length} FAILED:`);
    for (const f of failed) console.log("  - " + f.name);
    process.exitCode = 1;
  }
}

main();
