// lib/embed-pipeline.mjs
// Shared chunked-ingestion embedding pipeline used by both /api/embed and
// /api/map (when it is given `texts` instead of `vectors`).
//
// Contract (see AGENT.md / task spec):
//  - full document content is used (no 2000-char truncation), split into
//    deterministic Unicode-safe <=400 UTF-8-byte chunks (conservative bound
//    under bge-base-en-v1.5's ~512-token limit)
//  - each doc's chunk vectors are combined via a length-weighted mean
//    (weight = chunk UTF-8 byte length) then L2-normalized
//  - model @cf/baai/bge-base-en-v1.5, explicit `pooling: "mean"`
//  - versioned ingestion id "chunked/v1"
//  - limits: max 400 docs, max 60000 chars/doc, max 2,000,000 total bytes,
//    max 6000 chunks per request -> 413 (not a silent slice)
//  - AI calls batched at <=100 chunks/request
//  - content-hash (sha256 of ingestion_id + full text) cache in env.SITE
//    (the existing "SITE" KV binding) -- cache entries never store raw text
//  - oversize/empty/mismatched-vector AI responses are rejected, never
//    sliced/zipped around
//  - Vectorize writes are best-effort and unchanged in shape (one vector per
//    doc), with an explicit caveat surfaced in the response: a per-doc
//    vector is now a pooled representation of ALL of that doc's chunks, so
//    /api/vector/search matches against the whole-document mean, not
//    per-chunk content.

import { ApiError } from "./http.mjs";
import {
  chunkTextUtf8Safe,
  contentCacheKey,
  lengthWeightedMeanPool,
  l2Normalize,
  utf8ByteLength,
  INGESTION_ID,
  CHUNK_MAX_BYTES,
  sha256Hex,
} from "./chunking.mjs";

export const MAX_DOCS = 400;
export const MAX_CHARS_PER_DOC = 200000;
export const MAX_TOTAL_BYTES = 2_000_000;
export const MAX_CHUNKS_PER_REQUEST = 6000;
export const AI_BATCH_SIZE = 100;
export const MODEL = "@cf/baai/bge-base-en-v1.5";

export const VECTORIZE_SEARCH_CAVEAT =
  "each stored Vectorize vector is a length-weighted mean over ALL of that document's chunks (chunked/v1); " +
  "/api/vector/search therefore matches against a whole-document representation, not per-chunk content — " +
  "chunk-level search is not currently supported by this index.";

/** Cheap, AI-free validation of the whole request. Runs BEFORE any network
 *  call so a client sending an oversize/malformed payload gets a fast,
 *  explicit rejection instead of paying for embedding work first. */
export function validateDocs(rawDocs) {
  if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
    throw new ApiError(422, "need docs: non-empty string[]");
  }
  if (rawDocs.length > MAX_DOCS) {
    throw new ApiError(413, `too many docs: ${rawDocs.length} > max ${MAX_DOCS}`);
  }

  const perDoc = [];
  let totalBytes = 0;
  let totalChunks = 0;

  rawDocs.forEach((doc, i) => {
    if (typeof doc !== "string") throw new ApiError(422, `docs[${i}] must be a string`);
    if (doc.trim().length === 0) throw new ApiError(422, `docs[${i}] is empty`);
    if (doc.length > MAX_CHARS_PER_DOC) {
      throw new ApiError(422, `docs[${i}] exceeds max ${MAX_CHARS_PER_DOC} chars (got ${doc.length})`);
    }
    const inputBytes = utf8ByteLength(doc);
    totalBytes += inputBytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new ApiError(413, `total request bytes exceed max ${MAX_TOTAL_BYTES}`);
    }
    const { chunks, coveredBytes } = chunkTextUtf8Safe(doc, CHUNK_MAX_BYTES);
    totalChunks += chunks.length;
    if (totalChunks > MAX_CHUNKS_PER_REQUEST) {
      throw new ApiError(413, `total chunks exceed max ${MAX_CHUNKS_PER_REQUEST}`);
    }
    perDoc.push({ doc, inputChars: doc.length, inputBytes, chunks, coveredBytes });
  });

  return perDoc;
}

/** Runs the AI model over one batch of chunk texts (<=100), with explicit
 *  mean pooling, and rejects (throws ApiError(502)) on any shape mismatch
 *  instead of silently zipping/slicing what came back. */
async function embedBatch(env, batchTexts) {
  const out = await env.AI.run(MODEL, { text: batchTexts, pooling: "mean" });
  const data = out && out.data;
  if (!Array.isArray(data) || data.length !== batchTexts.length) {
    throw new ApiError(502, `embedding provider returned ${Array.isArray(data) ? data.length : "no"} vectors for ${batchTexts.length} inputs`);
  }
  return data.map((v, i) => {
    if (!Array.isArray(v) || v.length !== 768) throw new ApiError(502, `embedding provider returned a vector with unexpected dimension at batch index ${i}`);
    for (const x of v) if (typeof x !== "number" || !Number.isFinite(x)) throw new ApiError(502, `embedding provider returned a non-finite value at batch index ${i}`);
    return v;
  });
}

/**
 * Full pipeline: validate -> hash+cache-lookup -> chunk+embed(uncached) ->
 * pool+normalize -> cache-store -> return per-doc vectors + metadata.
 *
 * `env` needs `env.AI` (Workers AI binding) and `env.SITE` (KV binding used
 * for the existing AGENT.md/llms.txt static content — reused here as the
 * content-hash cache per the spec).
 */
export async function embedDocuments(env, rawDocs) {
  if (!env || !env.AI) throw new ApiError(502, "AI binding not available");
  const perDoc = validateDocs(rawDocs); // cheap validation before any AI work

  // Hash + cache lookup (also cheap: local hashing + KV reads).
  let cacheHits = 0;
  const cacheKeys = [];
  for (const d of perDoc) {
    const { sha256, key } = await contentCacheKey(INGESTION_ID + ":" + MODEL + ":768:mean:utf8-400:byte-weighted-l2", d.doc);
    d.sha256 = await sha256Hex(d.doc);
    d.cacheKey = key;
    cacheKeys.push(key);
  }

  const cached = new Array(perDoc.length).fill(null);
  if (env.SITE) {
    await Promise.all(
      perDoc.map(async (d, i) => {
        let raw = null;
        try {
          raw = await env.SITE.get(d.cacheKey, "json");
        } catch (e) {
          // KV read failure is not a silent success path: treat as a cache
          // miss (recompute), but do not hide the failure from logs.
          console.error("embed cache read failed:", d.cacheKey, e?.message || e);
          raw = null;
        }
        if (raw && Array.isArray(raw.vector) && raw.vector.length === 768 && raw.vector.every(x=>typeof x === "number" && Number.isFinite(x))) {
          cached[i] = raw;
          cacheHits++;
        }
      })
    );
  }

  // Build the queue of (docIndex, chunkIndex, text, weight) for every
  // uncached doc's chunks.
  const queue = [];
  perDoc.forEach((d, docIndex) => {
    if (cached[docIndex]) return;
    d.chunks.forEach((chunkText, chunkIndex) => {
      queue.push({ docIndex, chunkIndex, text: chunkText, weight: utf8ByteLength(chunkText) });
    });
  });

  // Batch embed in groups of <=100 chunks.
  const chunkVectorsByDoc = new Map(); // docIndex -> vector[] in chunk order
  for (let i = 0; i < queue.length; i += AI_BATCH_SIZE) {
    const batch = queue.slice(i, i + AI_BATCH_SIZE);
    const vectors = await embedBatch(env, batch.map((b) => b.text));
    batch.forEach((b, k) => {
      if (!chunkVectorsByDoc.has(b.docIndex)) chunkVectorsByDoc.set(b.docIndex, []);
      chunkVectorsByDoc.get(b.docIndex).push({ chunkIndex: b.chunkIndex, vector: vectors[k], weight: b.weight });
    });
  }

  // Pool + normalize each uncached doc, then write the cache entry (no raw
  // text stored in the cache).
  const vectors = new Array(perDoc.length);
  const docsMeta = new Array(perDoc.length);
  const cacheWrites = [];

  perDoc.forEach((d, docIndex) => {
    if (cached[docIndex]) {
      vectors[docIndex] = cached[docIndex].vector;
    } else {
      const entries = (chunkVectorsByDoc.get(docIndex) || []).sort((a, b) => a.chunkIndex - b.chunkIndex);
      if (entries.length !== d.chunks.length) {
        throw new ApiError(502, `internal chunk/vector count mismatch for doc ${docIndex}: ${entries.length} vectors for ${d.chunks.length} chunks`);
      }
      const pooled = lengthWeightedMeanPool(entries.map((e) => e.vector), entries.map((e) => e.weight));
      const normalized = l2Normalize(pooled);
      vectors[docIndex] = normalized;
      if (env.SITE) {
        const entry = { vector: normalized, input_chars: d.inputChars, input_bytes: d.inputBytes, chunks: d.chunks.length, covered_bytes: d.coveredBytes };
        cacheWrites.push(
          env.SITE.put(d.cacheKey, JSON.stringify(entry)).catch((e) => {
            console.error("embed cache write failed:", d.cacheKey, e?.message || e);
          })
        );
      }
    }
    docsMeta[docIndex] = {
      sha256: d.sha256,
      input_chars: d.inputChars,
      input_bytes: d.inputBytes,
      chunks: d.chunks.length,
      covered_bytes: d.coveredBytes,
      coverage: 1,
    };
  });

  await Promise.all(cacheWrites);

  return {
    model: MODEL,
    ingestion_id: INGESTION_ID,
    vectors,
    metadata: {
      preprocessing_id: INGESTION_ID,
      model: MODEL, pooling: "mean", chunk_max_utf8_bytes: 400, aggregation: "byte-weighted-mean+l2",
      docs: docsMeta,
      cache_hits: cacheHits,
    },
  };
}

/** Best-effort Vectorize upsert of the pooled per-doc vectors, preserving
 *  the existing write shape (one vector per stored id) and surfacing the
 *  chunked-search caveat rather than silently changing search semantics. */
export async function rememberChunkedEmbeddings(env, hashStrFn, docs, vectors, source) {
  if (!env.VEC) return { ok: false, error: "no vectorize binding" };
  try {
    let n = 0;
    for (let i = 0; i < vectors.length; i += 100) {
      const batch = [];
      for (let k = i; k < Math.min(i + 100, vectors.length); k++) {
        const text = String(docs[k] ?? "");
        batch.push({
          id: "e" + hashStrFn(text),
          values: vectors[k],
          metadata: {
            label: text.slice(0, 120),
            text: text.slice(0, 400),
            source: String(source || "").slice(0, 120),
            created: new Date().toISOString(),
            ingestion_id: INGESTION_ID,
          },
        });
      }
      await env.VEC.upsert(batch);
      n += batch.length;
    }
    return { ok: true, stored: n, caveat: VECTORIZE_SEARCH_CAVEAT };
  } catch (e) {
    console.error("vectorize upsert failed:", String(e));
    return { ok: false, error: String(e?.message || e) };
  }
}
