// lib/chunking.mjs
// Pure, deterministic, Unicode-safe helpers for the chunked-ingestion embedding
// protocol ("chunked/v1"). No I/O, no globals besides the standard Web
// Crypto / TextEncoder APIs (both available in Cloudflare Workers and modern
// Node). Kept dependency-free so it can be unit- and integration-tested with
// plain `node test-api.mjs`.

export const CHUNK_MAX_BYTES = 400; // conservative bound under the 512-token model limit
export const INGESTION_ID = "chunked/v1"; // versioned id for this ingestion pipeline
export const RAW_INGESTION_ID = "raw/v1"; // used when the caller supplies vectors directly

const encoder = new TextEncoder();

export function utf8ByteLength(str) {
  return encoder.encode(str).length;
}

/**
 * Split `text` into a deterministic, Unicode-safe sequence of chunks, each
 * encoding to at most `maxBytes` UTF-8 bytes. Splits happen only on code
 * point boundaries (never inside a surrogate pair / multi-byte sequence), so
 * re-joining the chunks always reproduces `text` exactly (covered_bytes ==
 * utf8ByteLength(text)).
 *
 * Throws rather than silently dropping content: an individual code point
 * whose own UTF-8 encoding exceeds maxBytes cannot happen for valid Unicode
 * (max 4 bytes) as long as maxBytes >= 4, which every caller here enforces.
 */
export function chunkTextUtf8Safe(text, maxBytes = CHUNK_MAX_BYTES) {
  if (typeof text !== "string") throw new TypeError("chunkTextUtf8Safe: text must be a string");
  if (!Number.isInteger(maxBytes) || maxBytes < 4) throw new RangeError("chunkTextUtf8Safe: maxBytes must be an integer >= 4");
  if (text.length === 0) throw new RangeError("chunkTextUtf8Safe: text must not be empty");

  const codePoints = Array.from(text); // iterates by code point, not UTF-16 code unit
  const chunks = [];
  let current = "";
  let currentBytes = 0;

  for (const cp of codePoints) {
    const cpBytes = utf8ByteLength(cp);
    if (cpBytes > maxBytes) {
      // Cannot happen for well-formed Unicode with maxBytes >= 4, but guard
      // explicitly rather than silently truncating a code point.
      throw new RangeError("chunkTextUtf8Safe: a single code point exceeds maxBytes=" + maxBytes);
    }
    if (currentBytes + cpBytes > maxBytes) {
      chunks.push(current);
      current = cp;
      currentBytes = cpBytes;
    } else {
      current += cp;
      currentBytes += cpBytes;
    }
  }
  if (current.length > 0) chunks.push(current);

  const coveredBytes = chunks.reduce((s, c) => s + utf8ByteLength(c), 0);
  return { chunks, coveredBytes };
}

/** SHA-256 of a string, returned as lowercase hex. Uses Web Crypto (crypto.subtle),
 *  available in both Cloudflare Workers and Node >= 18 without imports. */
export async function sha256Hex(text) {
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/** Content-hash cache key: keyed on the ingestion protocol id AND the full,
 *  untruncated text, per the "no silent fallbacks" requirement — changing
 *  either invalidates the cache entry. */
export async function contentCacheKey(ingestionId, fullText) {
  const h = await sha256Hex(ingestionId + "\u0000" + fullText);
  return { sha256: h, key: `embed-cache:${ingestionId}:${h}` };
}

/**
 * Length-weighted mean of a set of equal-dimension vectors, weighted by
 * `weights` (typically each chunk's UTF-8 byte length), followed by L2
 * normalization. Rejects mismatched shapes rather than silently
 * slicing/filtering.
 */
export function lengthWeightedMeanPool(vectors, weights) {
  if (!Array.isArray(vectors) || vectors.length === 0) throw new RangeError("lengthWeightedMeanPool: vectors must be a non-empty array");
  if (!Array.isArray(weights) || weights.length !== vectors.length) throw new RangeError("lengthWeightedMeanPool: weights length must match vectors length");
  const D = vectors[0].length;
  if (!Number.isInteger(D) || D < 1) throw new RangeError("lengthWeightedMeanPool: vectors must have a positive fixed dimension");
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (!(totalWeight > 0)) throw new RangeError("lengthWeightedMeanPool: total weight must be > 0");

  const out = new Array(D).fill(0);
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (!Array.isArray(v) || v.length !== D) throw new RangeError(`lengthWeightedMeanPool: vector ${i} has mismatched dimension`);
    const w = weights[i];
    for (let j = 0; j < D; j++) {
      const x = v[j];
      if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError(`lengthWeightedMeanPool: vector ${i}[${j}] is not a finite number`);
      out[j] += (x * w) / totalWeight;
    }
  }
  return out;
}

/** L2-normalize a vector in place-safe fashion (returns a new array).
 *  Throws on a degenerate (zero-norm) vector instead of silently returning
 *  it unnormalized or as a NaN vector. */
export function l2Normalize(vec) {
  if (!Array.isArray(vec) || vec.length === 0) throw new RangeError("l2Normalize: vec must be a non-empty array");
  let sumSq = 0;
  for (const x of vec) {
    if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError("l2Normalize: vector contains a non-finite value");
    sumSq += x * x;
  }
  const norm = Math.sqrt(sumSq);
  if (!(norm > 1e-12)) throw new RangeError("l2Normalize: vector has (near) zero norm; cannot normalize");
  return vec.map((x) => x / norm);
}
