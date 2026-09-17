// lib/limits.mjs — one place for corpus-size limits (limits/2).
// The original 400-item cap came from three walls: D1's ~2 MB row for a
// stored map, per-request embedding work, and O(N^2) diagnostics. limits/2
// removes the first (KV overflow storage), bounds the second by UNCACHED
// work instead of total size (warm the content-hash cache in batches), and
// keeps the third explicit per route. Every cap is still a hard, explicit
// 413/422 — never a silent slice.
export const MAX_ITEMS = 4000;                 // map / preview / control / consistency / repo-items
export const MAX_DOCS = MAX_ITEMS;              // embed
export const MAX_CHARS_PER_DOC = 200000;
export const MAX_TOTAL_BYTES = 40_000_000;      // per request, all documents
export const MAX_CHUNKS_PER_REQUEST = 120_000;  // total chunks (cached or not)
export const MAX_UNCACHED_CHUNKS = 12_000;      // chunks that must be embedded in THIS request
export const MAX_UNCACHED_DOCS = 1000;          // cache writes in THIS request
export const EMBED_WARMUP_HINT = "warm the content-hash embedding cache first: POST /api/embed {texts} in batches of at most 400 documents, then repeat the original request; cached documents cost no model work";
export const JSON_BODY_LIMIT = 64 * 1024 * 1024;
export const D1_MAP_JSON_LIMIT = 1_900_000;     // above this the map_json goes to KV (map-json:<id>)
export const KV_MAP_JSON_LIMIT = 24 * 1024 * 1024;
export const AXIS_TRIAL_MAX_N = 1200;           // LOO-NN is O(N^2 d (K+1))
export const RADIUS_MAX_N = MAX_ITEMS;
export const LIMITS_VERSION = "limits/2";
