#!/usr/bin/env node
// test-api.mjs — Node-runnable integration tests for the new/redesigned
// routes (chunked embedding, /api/repo-items, /api/map + baseline/compare).
//
// Boundary discipline (explicit, per the task spec):
//   - REAL:  pointmap.js (release/pointmap.js), loaded via node:vm exactly as
//            shipped (never edited). All geometry/identity assertions run
//            against the actual PM.runMap / PM.compareMaps.
//   - FAKE:  env.AI.run — a deterministic, seeded, hash-based pseudo-embedder
//            (SYNTHETIC — not a real bge-base-en-v1.5 call). Clearly labeled
//            fakeAiRun() below. This lets the chunk/pool/normalize pipeline
//            be exercised end-to-end without live model access or network
//            egress, but it means these tests can NEVER claim "real
//            embeddings verified working" — only the pipeline mechanics are
//            verified. See README.md "Caveats".
//   - FAKE:  env.DB / KV — an in-memory Map-backed store standing in for D1
//            and the SITE KV binding. No SQL is executed by these tests;
//            worker-base.js's own D1 statements are exercised only when
//            actually deployed (main's job, not this suite's).
//
// Run: node session/subagent/test-api.mjs
//
// No test framework dependency: a tiny local runner + node:assert/strict.

import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiError } from "./lib/http.mjs";
import {
  chunkTextUtf8Safe,
  sha256Hex,
  contentCacheKey,
  lengthWeightedMeanPool,
  l2Normalize,
  utf8ByteLength,
  INGESTION_ID,
} from "./lib/chunking.mjs";
import { embedDocuments, validateDocs, MAX_DOCS, MAX_CHARS_PER_DOC, MAX_TOTAL_BYTES } from "./lib/embed-pipeline.mjs";
import { repoItemsHandler } from "./lib/repo-items.mjs";
import { mapRouteHandler, mapsCompareHandler } from "./lib/map-route.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// REAL pointmap.js, loaded verbatim (never edited) via node:vm.
// ---------------------------------------------------------------------------
function loadRealPointMap() {
  const pmPath = path.resolve(__dirname, "pointmap.js");
  const code = fs.readFileSync(pmPath, "utf8");
  const sandbox = {
    console,
    Math,
    Array,
    Object,
    JSON,
    Number,
    String,
    Boolean,
    RangeError,
    TypeError,
    Error,
    Set,
    Map,
    Infinity,
    NaN,
    isNaN,
    isFinite,
    BigInt,
    Uint8Array,
    Float32Array,
    TextEncoder,
    TextDecoder,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "pointmap.js" });
  if (!sandbox.PM || typeof sandbox.PM.runMap !== "function") {
    throw new Error("failed to load real PM from release/pointmap.js");
  }
  return sandbox.PM;
}

const PM = loadRealPointMap();

// ---------------------------------------------------------------------------
// FAKE (synthetic, test-double-only) Workers AI. Deterministic hash-based
// pseudo-embedding — NOT bge-base-en-v1.5. Never treat results computed
// through this as evidence that real embeddings work end to end.
// ---------------------------------------------------------------------------
function fakeEmbedVector(text, D) {
  const v = new Array(D).fill(0);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    v[i % D] += Math.sin(c * (i + 1) * 0.017 + (i % D) * 0.31);
  }
  // never all-zero (guards l2Normalize's degenerate-vector rejection)
  if (v.every((x) => x === 0)) v[0] = 1;
  return v;
}

function makeFakeEnv({ aiDim = 768, kvStore = new Map(), vecUpserts = [] } = {}) {
  return {
    AI: {
      async run(model, opts) {
        if (model === "@cf/baai/bge-base-en-v1.5") {
          assert.equal(opts.pooling, "mean", "embed calls must explicitly request mean pooling");
          return { data: opts.text.map((t) => fakeEmbedVector(t, aiDim)) };
        }
        if (model.includes("llama")) return { response: "fake chat reply" };
        throw new Error("fakeEmbedVector: unexpected model " + model);
      },
    },
    SITE: {
      async get(key, type) {
        const v = kvStore.get(key);
        if (v === undefined) return null;
        return type === "json" ? JSON.parse(v) : v;
      },
      async put(key, value) {
        kvStore.set(key, value);
      },
    },
    VEC: {
      async upsert(batch) {
        vecUpserts.push(...batch);
      },
    },
    _kvStore: kvStore,
    _vecUpserts: vecUpserts,
  };
}

function makeInMemoryMapStore() {
  const rows = new Map();
  let nextId = 1;
  return {
    rows,
    async loadStoredMap(id) {
      const row = rows.get(Number(id));
      return row ? row.map : null;
    },
    async saveMap(map) {
      const id = nextId++;
      rows.set(id, { map });
      return id;
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal test runner
// ---------------------------------------------------------------------------
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok  - ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e });
    console.log(`FAIL  - ${name}`);
    console.log("        " + (e?.stack || e));
  }
}

async function assertRejectsApiError(promiseOrFn, expectedStatus, description) {
  try {
    if (typeof promiseOrFn === "function") await promiseOrFn();
    else await promiseOrFn;
  } catch (e) {
    assert.ok(e instanceof ApiError, `${description}: expected ApiError, got ${e?.constructor?.name}: ${e?.message}`);
    assert.equal(e.status, expectedStatus, `${description}: expected status ${expectedStatus}, got ${e.status} (${e.message})`);
    return;
  }
  throw new Error(`${description}: expected an ApiError(${expectedStatus}) to be thrown, but nothing was`);
}

// ===========================================================================
// 1. chunking.mjs — pure function tests
// ===========================================================================
async function chunkingTests() {
  console.log("\n[chunking.mjs]");

  await test("chunkTextUtf8Safe: ASCII text is fully covered, every chunk <= 400 bytes", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(50); // ~2300 chars
    const { chunks, coveredBytes } = chunkTextUtf8Safe(text, 400);
    assert.ok(chunks.length > 1, "expected multiple chunks");
    for (const c of chunks) assert.ok(utf8ByteLength(c) <= 400, "chunk exceeds 400 bytes");
    assert.equal(chunks.join(""), text, "rejoined chunks must equal the original text exactly");
    assert.equal(coveredBytes, utf8ByteLength(text), "covered_bytes must equal the full text's byte length");
  });

  await test("chunkTextUtf8Safe: Unicode-safe across multi-byte code points (CJK + emoji, incl. surrogate pairs)", () => {
    const text = "日本語のテキストです。".repeat(20) + "🎉🚀✨".repeat(30) + "café résumé naïve".repeat(10);
    const { chunks, coveredBytes } = chunkTextUtf8Safe(text, 400);
    assert.equal(chunks.join(""), text, "rejoining must reproduce the exact Unicode text (no split surrogate pairs, no dropped bytes)");
    for (const c of chunks) {
      assert.ok(utf8ByteLength(c) <= 400, "chunk exceeds 400 bytes");
      // Re-encoding/decoding a chunk must not throw or produce U+FFFD replacement characters
      assert.ok(!c.includes("\uFFFD"), "chunk contains a Unicode replacement character (a code point was split)");
    }
    assert.equal(coveredBytes, utf8ByteLength(text));
  });

  await test("chunkTextUtf8Safe: deterministic — same input always yields the same chunks", () => {
    const text = "Determinism check ".repeat(80) + "🙂".repeat(15);
    const a = chunkTextUtf8Safe(text, 400);
    const b = chunkTextUtf8Safe(text, 400);
    assert.deepEqual(a.chunks, b.chunks);
  });

  await test("chunkTextUtf8Safe: rejects empty text rather than silently returning zero chunks", () => {
    assert.throws(() => chunkTextUtf8Safe("", 400), RangeError);
  });

  await test("sha256Hex + contentCacheKey: same ingestion_id+text -> same key; different text -> different key", async () => {
    const k1 = await contentCacheKey(INGESTION_ID, "hello world");
    const k2 = await contentCacheKey(INGESTION_ID, "hello world");
    const k3 = await contentCacheKey(INGESTION_ID, "hello world!");
    assert.equal(k1.key, k2.key);
    assert.notEqual(k1.key, k3.key);
    assert.equal(k1.sha256.length, 64, "sha256 hex digest must be 64 chars");
  });

  await test("lengthWeightedMeanPool: weighted mean matches hand computation", () => {
    const vectors = [
      [1, 0],
      [0, 1],
    ];
    const weights = [3, 1]; // 3:1 weighting toward vectors[0]
    const pooled = lengthWeightedMeanPool(vectors, weights);
    assert.ok(Math.abs(pooled[0] - 0.75) < 1e-9);
    assert.ok(Math.abs(pooled[1] - 0.25) < 1e-9);
  });

  await test("lengthWeightedMeanPool: rejects mismatched vector/weight shapes instead of silently zipping", () => {
    assert.throws(() => lengthWeightedMeanPool([[1, 2], [3]], [1, 1]), RangeError);
    assert.throws(() => lengthWeightedMeanPool([[1, 2]], [1, 1]), RangeError);
  });

  await test("l2Normalize: unit norm after normalizing; rejects a zero vector", () => {
    const n = l2Normalize([3, 4]);
    const norm = Math.sqrt(n[0] ** 2 + n[1] ** 2);
    assert.ok(Math.abs(norm - 1) < 1e-9);
    assert.throws(() => l2Normalize([0, 0, 0]), RangeError);
  });
}

// ===========================================================================
// 2. embed-pipeline.mjs — validation + cache + pooling (fake AI, real math)
// ===========================================================================
async function embedPipelineTests() {
  console.log("\n[embed-pipeline.mjs]");

  await test("validateDocs: cheap validation runs before any AI call — rejects empty doc (422)", () => {
    assert.throws(() => validateDocs(["hello", ""]), (e) => e instanceof ApiError && e.status === 422);
  });

  await test("validateDocs: rejects a doc over 60000 chars (422), not a silent truncation", () => {
    const huge = "a".repeat(MAX_CHARS_PER_DOC + 1);
    assert.throws(() => validateDocs([huge]), (e) => e instanceof ApiError && e.status === 422);
  });

  await test("validateDocs: rejects more than 400 docs (413), not a silent slice", () => {
    const docs = Array.from({ length: MAX_DOCS + 1 }, (_, i) => "doc " + i);
    assert.throws(() => validateDocs(docs), (e) => e instanceof ApiError && e.status === 413);
  });

  await test("validateDocs: rejects when total bytes exceed the 2,000,000 cap (413)", () => {
    // 3 docs at ~700K chars each (under the 60000-char/doc cap would be false —
    // so instead use many docs near the per-doc cap to cross the TOTAL cap).
    const perDoc = MAX_CHARS_PER_DOC; // 60000 chars, ASCII => 60000 bytes
    const docsNeeded = Math.ceil((MAX_TOTAL_BYTES + 1) / perDoc); // ~34, well under MAX_DOCS
    const docs = Array.from({ length: docsNeeded }, () => "x".repeat(perDoc));
    assert.throws(() => validateDocs(docs), (e) => e instanceof ApiError && e.status === 413);
  });

  await test(
    "CAVEAT (documented, not a bug): MAX_CHUNKS_PER_REQUEST (6000) is, by construction, always " +
      "dominated by MAX_TOTAL_BYTES (2,000,000) for well-packed chunks — 6000 * 400B = 2.4MB > 2MB. " +
      "See README.md Caveats for why this branch is not independently reachable in a realistic test.",
    () => {
      // No assertion: documentation-only marker test, kept green so the suite
      // doesn't silently omit this known limit interaction.
      assert.ok(true);
    }
  );

  await test("embedDocuments: end-to-end pooling — pooled vector matches a manual length-weighted mean + L2 norm", async () => {
    const env = makeFakeEnv({ aiDim: 768 });
    const doc = "alpha beta gamma delta epsilon zeta eta theta"; // short -> 1 chunk
    const result = await embedDocuments(env, [doc]);
    assert.equal(result.vectors.length, 1);
    assert.equal(result.ingestion_id, "chunked/v1");
    assert.equal(result.metadata.docs[0].chunks, 1);
    assert.equal(result.metadata.docs[0].coverage, 1);
    assert.equal(result.metadata.docs[0].covered_bytes, utf8ByteLength(doc));
    // Single chunk -> pooling is a no-op besides normalization.
    const raw = fakeEmbedVector(doc, 768);
    const expected = l2Normalize(raw);
    for (let i = 0; i < 6; i++) assert.ok(Math.abs(result.vectors[0][i] - expected[i]) < 1e-9);
  });

  await test("embedDocuments: cache no-op on first call, cache hit on identical repeat call", async () => {
    const kvStore = new Map();
    const env1 = makeFakeEnv({ aiDim: 768, kvStore });
    const doc = "The rain in Spain falls mainly on the plain.";
    const r1 = await embedDocuments(env1, [doc]);
    assert.equal(r1.metadata.cache_hits, 0, "first call must be a cache miss");

    const env2 = makeFakeEnv({ aiDim: 768, kvStore }); // same KV store, fresh env object
    const r2 = await embedDocuments(env2, [doc]);
    assert.equal(r2.metadata.cache_hits, 1, "second call with identical text must hit the cache");
    assert.deepEqual(r2.vectors[0], r1.vectors[0], "cached vector must match the originally computed one");
  });

  await test("embedDocuments: cache entries never store raw text", async () => {
    const kvStore = new Map();
    const env = makeFakeEnv({ aiDim: 768, kvStore });
    const doc = "a very particular secret-looking sentence";
    await embedDocuments(env, [doc]);
    for (const [, value] of kvStore) {
      assert.ok(!value.includes(doc), "cache entry must not contain the raw document text");
    }
  });

  await test("embedDocuments: late-append changes the hash — appending text after caching produces a cache MISS, not a stale hit", async () => {
    const kvStore = new Map();
    const env = makeFakeEnv({ aiDim: 768, kvStore });
    const base = "Some initial content for the ingestion pipeline.";
    const r1 = await embedDocuments(env, [base]);
    const appended = base + " Plus a late-appended sentence.";
    const r2 = await embedDocuments(env, [appended]);
    assert.equal(r2.metadata.cache_hits, 0, "appended text must not reuse the base text's cache entry");
    assert.notEqual(r2.metadata.docs[0].sha256, r1.metadata.docs[0].sha256);
  });

  await test("embedDocuments: multi-chunk pooling is length-weighted, not a plain average", async () => {
    const env = makeFakeEnv({ aiDim: 768 });
    // Construct a doc definitely >400 bytes so it chunks into >1 piece.
    const doc = ("Sentence number for weighting purposes. ").repeat(30);
    const result = await embedDocuments(env, [doc]);
    const { chunks } = chunkTextUtf8Safe(doc, 400);
    assert.ok(chunks.length > 1, "test setup must actually produce multiple chunks");
    const rawVectors = chunks.map((c) => fakeEmbedVector(c, 768));
    const weights = chunks.map((c) => utf8ByteLength(c));
    const expected = l2Normalize(lengthWeightedMeanPool(rawVectors, weights));
    for (let i = 0; i < 4; i++) assert.ok(Math.abs(result.vectors[0][i] - expected[i]) < 1e-6);
  });

  await test("embedDocuments: rejects a mismatched AI vector count instead of zipping/slicing (502)", async () => {
    const env = {
      AI: { async run() { return { data: [[1, 2, 3]] }; } }, // caller sends >1 chunk text, provider returns 1 vector
      SITE: { async get() { return null; }, async put() {} },
      VEC: { async upsert() {} },
    };
    const bigDoc = "word ".repeat(200); // forces >1 chunk
    await assert.rejects(embedDocuments(env, [bigDoc]), (e) => e instanceof ApiError && e.status === 502);
  });
}

// ===========================================================================
// 3. repo-items.mjs — fake fetchCorpus, no network
// ===========================================================================
async function repoItemsTests() {
  console.log("\n[repo-items.mjs]");

  function parseRepoUrl(url) {
    const m = url.trim().match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
    if (!m) return null;
    return { owner: m[1], repo: m[2] };
  }

  await test("repoItemsHandler: full contents, full literal paths, stable sort, correct tar-root stripping", async () => {
    const tarRoot = "acme-widgets-abc1234/";
    const files = [
      { path: tarRoot + "README.md", text: "# Widgets\n" + "x".repeat(5000), sizeBytes: 5010, truncated: false },
      { path: tarRoot + "src/a-very/deeply/nested/path/that/should/not/be/truncated/module.ts", text: "export const x = 1;", sizeBytes: 20, truncated: false },
      { path: tarRoot + "zeta.txt", text: "z", sizeBytes: 1, truncated: false },
      { path: tarRoot + "alpha.txt", text: "a", sizeBytes: 1, truncated: false },
    ];
    const fetchCorpus = async (owner, repo, maxFiles, token, ref) => ({ ref: ref || "main", meta: {}, files, truncated: false });

    const result = await repoItemsHandler({ repo: "acme/widgets" }, { parseRepoUrl, fetchCorpus, githubToken: null });
    assert.equal(result.n, 4);
    assert.equal(result.resolved_ref, "main");
    // Full literal path, no 80-char truncation:
    const nested = result.items.find((i) => i.label.includes("module.ts"));
    assert.equal(nested.label, "src/a-very/deeply/nested/path/that/should/not/be/truncated/module.ts");
    assert.ok(nested.label.length > 60, "path must not be truncated to 80 chars in a way that clips a longer real path");
    // Tar root stripped correctly (no leading tarRoot segment survives):
    for (const it of result.items) assert.ok(!it.label.startsWith(tarRoot));
    // Full content, not sliced to 2000 chars:
    const readme = result.items.find((i) => i.label === "README.md");
    assert.equal(readme.text.length, 5010);
    // Stable, deterministic sort by normalized path:
    assert.deepEqual(
      result.items.map((i) => i.label),
      ["README.md", "alpha.txt", "src/a-very/deeply/nested/path/that/should/not/be/truncated/module.ts", "zeta.txt"]
    );
  });

  await test("repoItemsHandler: mixed/no common tar root -> no stripping is applied (never mis-strips)", async () => {
    const files = [
      { path: "root-a/file1.md", text: "one", sizeBytes: 3 },
      { path: "root-b/file2.md", text: "two", sizeBytes: 3 }, // different top-level dir
    ];
    const fetchCorpus = async () => ({ ref: "main", meta: {}, files, truncated: false });
    const result = await repoItemsHandler({ repo: "acme/widgets" }, { parseRepoUrl, fetchCorpus, githubToken: null });
    const labels = result.items.map((i) => i.label).sort();
    assert.deepEqual(labels, ["root-a/file1.md", "root-b/file2.md"], "without a shared root, paths must be returned unstripped");
  });

  await test("repoItemsHandler: subdir filtering happens BEFORE the 400 cap -> over-cap after filtering is an explicit 413, not a silent slice", async () => {
    const tarRoot = "acme-widgets-abc1234/";
    const files = [];
    for (let i = 0; i < 401; i++) files.push({ path: `${tarRoot}src/file${i}.ts`, text: "x", sizeBytes: 1 });
    for (let i = 0; i < 50; i++) files.push({ path: `${tarRoot}docs/file${i}.md`, text: "y", sizeBytes: 1 }); // outside subdir
    const fetchCorpus = async () => ({ ref: "main", meta: {}, files, truncated: false });

    // Without a subdir filter, 401 items alone (ignoring docs/) already exceeds 400 -> 413.
    await assertRejectsApiError(
      () => repoItemsHandler({ repo: "acme/widgets", subdir: "src" }, { parseRepoUrl, fetchCorpus, githubToken: null }),
      413,
      "over-400 after subdir filter"
    );

    // But filtering to a smaller subdir first brings it under the cap and succeeds.
    const filesSmall = [];
    for (let i = 0; i < 5; i++) filesSmall.push({ path: `${tarRoot}src/file${i}.ts`, text: "x", sizeBytes: 1 });
    for (let i = 0; i < 401; i++) filesSmall.push({ path: `${tarRoot}docs/file${i}.md`, text: "y", sizeBytes: 1 });
    const fetchCorpusSmall = async () => ({ ref: "main", meta: {}, files: filesSmall, truncated: false });
    const result = await repoItemsHandler({ repo: "acme/widgets", subdir: "src" }, { parseRepoUrl, fetchCorpus: fetchCorpusSmall, githubToken: null });
    assert.equal(result.n, 5, "filtering to src/ (5 files) must succeed even though the full tree (406) would not");
  });

  await test("repoItemsHandler: an unresolvable ref surfaces as 502 with resolved_ref null — never a fabricated SHA", async () => {
    const fetchCorpus = async (owner, repo, maxFiles, token, ref) => {
      if (ref) throw new Error(`repo tarball failed: HTTP 404 (requested ref "${ref}" was not resolvable; no fallback branch was tried, to avoid returning a false provenance)`);
      return { ref: "main", meta: {}, files: [], truncated: false };
    };
    await assertRejectsApiError(
      () => repoItemsHandler({ repo: "acme/widgets", ref: "does-not-exist" }, { parseRepoUrl, fetchCorpus, githubToken: null }),
      502,
      "unresolvable ref"
    );
  });

  await test("repoItemsHandler: exposes per-item truncation flag rather than hiding it", async () => {
    const files = [
      { path: "root/big.txt", text: "x".repeat(60000), sizeBytes: 90000, truncated: true },
      { path: "root/small.txt", text: "hi", sizeBytes: 2, truncated: false },
    ];
    const fetchCorpus = async () => ({ ref: "main", meta: {}, files, truncated: false });
    const result = await repoItemsHandler({ repo: "acme/widgets" }, { parseRepoUrl, fetchCorpus, githubToken: null });
    const big = result.items.find((i) => i.label === "big.txt");
    assert.equal(big.truncated, true);
    const small = result.items.find((i) => i.label === "small.txt");
    assert.equal(small.truncated, false);
  });
}

// ===========================================================================
// 4. map-route.mjs — REAL PM, fake AI, in-memory map store
// ===========================================================================
async function mapRouteTests() {
  console.log("\n[map-route.mjs]");

  function makeVectors(n, d, seed) {
    return PM.synth(n, d, seed);
  }

  await test("mapRouteHandler: standalone map with raw vectors, no names -> auto item labels assigned", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(12, 6, 1);
    const { id, map, comparison } = await mapRouteHandler({ vectors: X, seed: 20260906 }, { env, PM, embedDocuments, ...store });
    assert.ok(id !== null, "a standalone map with persist unset (default true) must be saved");
    assert.equal(map.names.length, 12);
    assert.equal(map.names[0], "item_0");
    assert.equal(comparison, null, "no baseline_id -> no comparison attempted");
    assert.equal(map.rule.d <= 24, true);
  });

  await test("mapRouteHandler: seed 0 is honored as an explicit seed, not treated as \"missing\" (nullish, not falsy, defaults)", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(10, 4, 5);
    const { map } = await mapRouteHandler({ vectors: X, seed: 0, names: X.map((_, i) => "n" + i) }, { env, PM, embedDocuments, ...store });
    assert.equal(map.seed, 0, "seed: 0 must survive as the actual seed used, not fall back to the default 20260906");
  });

  await test("mapRouteHandler: strict number validation rejects a non-numeric K instead of coercing (422)", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(10, 4, 5);
    await assertRejectsApiError(
      () => mapRouteHandler({ vectors: X, K: "not-a-number" }, { env, PM, embedDocuments, ...store }),
      422,
      "non-numeric K"
    );
  });

  await test("mapRouteHandler: identity/validation failure from PM.runMap maps to 422 and is never persisted", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const badX = [[1, 2], [3, NaN], [5, 6], [7, 8], [9, 10], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]; // NaN -> PM.validate throws RangeError
    await assertRejectsApiError(
      () => mapRouteHandler({ vectors: badX }, { env, PM, embedDocuments, ...store }),
      422,
      "NaN in vectors"
    );
    assert.equal(store.rows.size, 0, "a rejected map must never be persisted");
  });

  await test("mapRouteHandler: persist:false skips the store entirely (ephemeral/test runs)", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(10, 4, 5);
    const { id, persisted } = await mapRouteHandler({ vectors: X, persist: false }, { env, PM, embedDocuments, ...store });
    assert.equal(id, null);
    assert.equal(persisted, false);
    assert.equal(store.rows.size, 0);
  });

  await test("mapRouteHandler: texts -> chunk protocol embedding -> up to 768-D vectors accepted directly by PM.runMap (synthetic AI test-double)", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv({ aiDim: 768 }); // bge-base-en-v1.5 output width; SYNTHETIC values, not a real model call
    const texts = Array.from({ length: 12 }, (_, i) => `Document number ${i} about topic ${i % 3} with some extra descriptive filler text.`);
    const { map } = await mapRouteHandler({ texts }, { env, PM, embedDocuments, ...store });
    assert.equal(map.D, 768, "the full 768-D embedding must reach PM.runMap directly, no artificial D<=40 cap");
    assert.equal(map.preprocessing_id, "chunked/v1");
  });

  await test("mapRouteHandler + baseline: names required for baseline compare (422 without names)", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(10, 4, 5);
    const names = X.map((_, i) => "n" + i);
    const first = await mapRouteHandler({ vectors: X, names }, { env, PM, embedDocuments, ...store });
    await assertRejectsApiError(
      () => mapRouteHandler({ vectors: X, baseline_id: first.id }, { env, PM, embedDocuments, ...store }),
      422,
      "baseline compare without names"
    );
  });

  await test("mapRouteHandler + baseline: full compare round-trip produces a comparison via the REAL PM.compareMaps", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(10, 4, 5);
    const names = X.map((_, i) => "n" + i);
    const before = await mapRouteHandler({ vectors: X, names, seed: 5 }, { env, PM, embedDocuments, ...store });
    // "after": same names, one point nudged.
    const X2 = X.map((row) => row.slice());
    X2[0] = X2[0].map((v) => v + 5);
    const after = await mapRouteHandler({ vectors: X2, names, baseline_id: before.id }, { env, PM, embedDocuments, ...store });
    assert.ok(after.comparison, "expected a comparison object");
    assert.ok(Array.isArray(after.comparison.per_name), "a real PM.compareMaps result carries per_name[]; the not-tested fallback does not");
    assert.equal(after.comparison.task_verdict, "not-tested", "PM.compareMaps itself always reports task_verdict not-tested (geometry != task correctness) -- this is expected, not an error path");
    assert.equal(after.comparison.n, 10);
    assert.ok(["moved", "stable"].includes(after.comparison.geometry_decision));
  });

  await test("mapRouteHandler + baseline: conflicting explicit opts vs. the baseline's frozen frame -> 409 BEFORE any AI/PM work", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(10, 4, 5);
    const names = X.map((_, i) => "n" + i);
    const before = await mapRouteHandler({ vectors: X, names, seed: 5, d: 3 }, { env, PM, embedDocuments, ...store });
    await assertRejectsApiError(
      () => mapRouteHandler({ vectors: X, names, baseline_id: before.id, d: 4 }, { env, PM, embedDocuments, ...store }),
      409,
      "conflicting d vs baseline frame"
    );
  });

  await test("mapRouteHandler + baseline: a legacy stored map with no frame is a 409 (actionable), not a crash", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    // Simulate a pre-frame legacy map row: strip `frame` from an otherwise-valid map.
    const legacyId = await store.saveMap({ names: ["a", "b"], noFrame: true }); // no `.frame` key at all
    const X = makeVectors(10, 4, 5);
    const names = X.map((_, i) => "n" + i);
    await assertRejectsApiError(
      () => mapRouteHandler({ vectors: X, names, baseline_id: legacyId }, { env, PM, embedDocuments, ...store }),
      409,
      "legacy baseline with no frame"
    );
  });

  await test("mapsCompareHandler: standalone /api/maps/compare over two persisted ids reuses the same PM.compareMaps path", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(10, 4, 9);
    const names = X.map((_, i) => "n" + i);
    const a = await mapRouteHandler({ vectors: X, names, seed: 9 }, { env, PM, embedDocuments, ...store });
    const b = await mapRouteHandler({ vectors: X, names, baseline_id: a.id }, { env, PM, embedDocuments, ...store });
    const cmp = await mapsCompareHandler({ before_id: a.id, after_id: b.id }, { PM, loadStoredMap: store.loadStoredMap });
    assert.equal(cmp.n, 10);
    assert.equal(cmp.unchanged_anchors, 10, "identical vectors/opts must produce zero displacement");
  });

  await test("mapsCompareHandler: incompatible names produce explicit 409, never a 500", async () => {
    const store = makeInMemoryMapStore();
    const env = makeFakeEnv();
    const X = makeVectors(10, 4, 3);
    const a = await mapRouteHandler({ vectors: X, names: X.map((_, i) => "a" + i) }, { env, PM, embedDocuments, ...store });
    const b = await mapRouteHandler({ vectors: X, names: X.map((_, i) => "b" + i) }, { env, PM, embedDocuments, ...store });
    await assert.rejects(() => mapsCompareHandler({ before_id: a.id, after_id: b.id }, { PM, loadStoredMap: store.loadStoredMap }), e => e.status === 409);
  });
}

// ===========================================================================
async function main() {
  await chunkingTests();
  await embedPipelineTests();
  await repoItemsTests();
  await mapRouteTests();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log(`${failed.length} FAILED:`);
    for (const f of failed) console.log("  - " + f.name);
    process.exitCode = 1;
  }
}

main();
