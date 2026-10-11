// lib/http.mjs
import { handleJevRequest, runJevScheduled } from "./jev-main.js";
import { runSchedulerTick } from "./jev-scheduler.js";
import { decisionModel } from "./jev-decide.js";
import { handleJevRelaySelftest, handleJevMapSelftest } from "./jev-selftest-live.js";
// Lane R2 patch: operator bearer auth for destructive DELETE routes.
// Same authorized() pattern as jev-corpus-routes.js: Secrets Store runtime
// .get(), fail-closed, constant-time comparison (routes-jev.js parity).
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function requireOperatorAuth(req, env) {
  if (!env.JEV_API_KEY) return { notConfigured: true };
  const expected = await env.JEV_API_KEY.get();
  if (!expected) return { notConfigured: true };
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(token, expected)) return { unauthorized: true };
  return { ok: true };
}
var ApiError = class extends Error {
  constructor(status, message, extra) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.extra = extra || void 0;
  }
};
function jsonResponse(data, status = 200, extra) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra }
  });
}
function errorResponse(err) {
  if (err instanceof ApiError) {
    return jsonResponse({ error: { status: err.status, message: err.message, ...err.extra || {} } }, err.status);
  }
  return jsonResponse({ error: { status: 500, message: "internal error" } }, 500);
}
async function readJsonLimited(req, maxBytes = 8 * 1024 * 1024) {
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
        }
        throw new ApiError(413, `request body exceeds ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "failed to read request body: " + (e?.message || String(e)));
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(buf);
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ApiError(400, "invalid JSON body: " + (e?.message || String(e)));
  }
}

// lib/limits.mjs
var MAX_ITEMS = 4e3;
var MAX_DOCS = MAX_ITEMS;
var MAX_CHARS_PER_DOC = 2e5;
var MAX_TOTAL_BYTES = 4e7;
var MAX_CHUNKS_PER_REQUEST = 12e4;
var MAX_UNCACHED_CHUNKS = 12e3;
var MAX_UNCACHED_DOCS = 1e3;
var EMBED_WARMUP_HINT = "warm the content-hash embedding cache first: POST /api/embed {texts} in batches of at most 400 documents, then repeat the original request; cached documents cost no model work";
var JSON_BODY_LIMIT = 64 * 1024 * 1024;
var D1_MAP_JSON_LIMIT = 19e5;
var KV_MAP_JSON_LIMIT = 24 * 1024 * 1024;
var AXIS_TRIAL_MAX_N = 1200;
var RADIUS_MAX_N = MAX_ITEMS;
var LIMITS_VERSION = "limits/2";

// lib/radius-diagnostics.mjs
var VERSION = "radius";
var CANONICAL_RADIUS = 0.095;
var RADII = Object.freeze([0.075, 0.085, 0.095, 0.105, 0.115]);
var DOMAIN = Object.freeze([0, 2]);
var MAX_WITNESSES = 8;
var MIN_N = 2;
var MAX_N = RADIUS_MAX_N;
var DIM = 3;
var PROFILE_SCOPE = "Retrospective: computed from one frozen full-precision Float64 frame; not an exact-arithmetic or floating-point proof: nearest-neighbour clearances, isolation counts and clipped areas on a fixed, pre-declared radius grid in chord units. Descriptive geometry only \u2014 not a forecast, not a quality claim, and not an admission of scientific validity.";
var TRANSITION_SCOPE = "Retrospective post-edit reconstruction on one frozen frame: it explains where the isolated count went as the radius sweeps the 0..2 chord-unit domain. It is not a pre-edit forecast, not calibrated certainty, not a null-model comparison, and not an admission of scientific validity. The canonical radius is unchanged; this sweep is displayed, never operative.";
var chord = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function fail(Kind, msg) {
  throw new Kind(msg);
}
function validateMap(map, label) {
  if (map === null || typeof map !== "object" || Array.isArray(map)) {
    fail(TypeError, `${label}: expected a map object, got ${map === null ? "null" : typeof map}`);
  }
  if (typeof map.frame_id !== "string" || map.frame_id.length === 0) {
    fail(TypeError, `${label}: missing frame_id`);
  }
  if (typeof map.instrument_id !== "string" || map.instrument_id.length === 0) {
    fail(TypeError, `${label}: missing instrument_id`);
  }
  const names = map.names;
  const pts = map.pts_full;
  if (!Array.isArray(names)) fail(TypeError, `${label}: names must be an array`);
  if (!Array.isArray(pts)) fail(TypeError, `${label}: missing pts_full (rounded pts are not exact enough for r=${CANONICAL_RADIUS} adjacency)`);
  if (names.length !== pts.length) {
    fail(RangeError, `${label}: names (${names.length}) and pts_full (${pts.length}) disagree in length`);
  }
  const n = names.length;
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) {
    fail(RangeError, `${label}: n=${n} is outside the supported range ${MIN_N}..${MAX_N}`);
  }
  if (map.n !== void 0 && map.n !== n) {
    fail(RangeError, `${label}: declared n=${map.n} disagrees with the arrays (${n})`);
  }
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < n; i++) {
    const nm = names[i];
    if (typeof nm !== "string" || nm.length === 0) {
      fail(TypeError, `${label}: names[${i}] is not a non-empty string`);
    }
    if (seen.has(nm)) fail(RangeError, `${label}: duplicate name ${JSON.stringify(nm)}`);
    seen.add(nm);
    const p = pts[i];
    if (!Array.isArray(p) || p.length !== DIM) {
      fail(TypeError, `${label}: pts_full[${i}] must be a ${DIM}-element array`);
    }
    for (let k = 0; k < DIM; k++) {
      if (typeof p[k] !== "number" || !Number.isFinite(p[k])) {
        fail(TypeError, `${label}: pts_full[${i}][${k}] is not a finite number`);
      }
    }
  }
  return { names, pts, n };
}
function validateBound(value, key) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(TypeError, `${key} must be a finite number`);
  }
  if (value < 0) fail(RangeError, `${key} must be >= 0`);
  return value;
}
function readOpts(opts) {
  if (opts === void 0 || opts === null) return { eps: null, err: null };
  if (typeof opts !== "object" || Array.isArray(opts)) {
    fail(TypeError, "opts must be an object");
  }
  return {
    eps: validateBound(opts.coordinate_epsilon, "coordinate_epsilon"),
    err: validateBound(opts.distance_error_bound, "distance_error_bound")
  };
}
function nearestTable(names, pts, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    let bestName = null;
    let ties = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const d = chord(pts[i], pts[j]);
      if (!Number.isFinite(d)) fail(RangeError, "chord distance overflow");
      if (d < best) {
        best = d;
        bestName = names[j];
        ties = 1;
      } else if (d === best) {
        ties++;
        if (names[j] < bestName) bestName = names[j];
      }
    }
    rows.push({ name: names[i], nearest_name: bestName, nearest_ties: ties, clearance: best });
  }
  return rows;
}
function isolatedAt(clearances, r) {
  let c = 0;
  for (let i = 0; i < clearances.length; i++) if (r <= clearances[i]) c++;
  return c;
}
function clippedArea(clearances, R) {
  let a = 0;
  for (let i = 0; i < clearances.length; i++) a += Math.min(R, clearances[i]);
  return a;
}
function robustnessFor(clearance, eps, err) {
  if (eps === null) return { status: "needs-coordinate-bound" };
  if (err === null) return { status: "needs-error-bound" };
  const budget = 2 * eps + err;
  if (!Number.isFinite(budget)) fail(RangeError, "coordinate robustness budget overflow");
  let status;
  if (clearance - budget >= CANONICAL_RADIUS) status = "stable-isolated";
  else if (clearance + budget < CANONICAL_RADIUS) status = "stable-connected";
  else status = "undetermined";
  return { status, budget, coordinate_epsilon: eps, distance_error_bound: err };
}
function radiusProfile(map, opts = {}) {
  const { eps, err } = readOpts(opts);
  const { names, pts, n } = validateMap(map, "map");
  const rows = nearestTable(names, pts, n);
  rows.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const clearances = rows.map((r) => r.clearance);
  if (map.isolated !== void 0 && map.isolated !== isolatedAt(clearances, CANONICAL_RADIUS)) fail(RangeError, "canonical isolation mismatch");
  const per_item = rows.map((r) => ({
    name: r.name,
    nearest_name: r.nearest_name,
    nearest_ties: r.nearest_ties,
    clearance: r.clearance,
    isolated_at_canonical: r.clearance >= CANONICAL_RADIUS,
    robustness: robustnessFor(r.clearance, eps, err)
  }));
  const samples = RADII.map((radius) => {
    const isolated = isolatedAt(clearances, radius);
    const area = clippedArea(clearances, radius);
    return {
      radius,
      isolated,
      isolated_fraction: isolated / n,
      area,
      mean_area: area / n
    };
  });
  return {
    version: VERSION,
    frame_id: map.frame_id,
    instrument_id: map.instrument_id,
    n,
    canonical_radius: CANONICAL_RADIUS,
    domain: [DOMAIN[0], DOMAIN[1]],
    radii: [...RADII],
    canonical_isolated: isolatedAt(clearances, CANONICAL_RADIUS),
    per_item,
    samples,
    bounds: {
      coordinate_epsilon: eps,
      distance_error_bound: err,
      validated: false,
      certified: false
    },
    scope: PROFILE_SCOPE
  };
}
function buildCells(clearBefore, clearAfter) {
  const events = /* @__PURE__ */ new Set([DOMAIN[0], DOMAIN[1]]);
  for (const d of clearBefore) if (d > DOMAIN[0] && d < DOMAIN[1]) events.add(d);
  for (const d of clearAfter) if (d > DOMAIN[0] && d < DOMAIN[1]) events.add(d);
  const sorted = [...events].sort((a, b) => a - b);
  const cells = [];
  cells.push({
    lower: DOMAIN[0],
    upper: DOMAIN[0],
    lower_closed: true,
    at: DOMAIN[0]
  });
  for (let k = 1; k < sorted.length; k++) {
    cells.push({
      lower: sorted[k - 1],
      upper: sorted[k],
      lower_closed: false,
      at: sorted[k]
      // right endpoint — the bug fix
    });
  }
  for (const c of cells) {
    c.before = isolatedAt(clearBefore, c.at);
    c.after = isolatedAt(clearAfter, c.at);
    c.delta = c.after - c.before;
  }
  return cells;
}
var sign = (x) => x > 0 ? 1 : x < 0 ? -1 : 0;
function cellIndexContaining(cells, r) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.lower_closed && r === c.lower && r === c.upper) return i;
    if (r > c.lower && r <= c.upper) return i;
  }
  fail(RangeError, `radius ${r} is outside the domain ${DOMAIN[0]}..${DOMAIN[1]}`);
}
function witnessesAt(value, beforeRows, afterRows) {
  const hits = [];
  for (const r of beforeRows) {
    if (r.clearance === value) {
      hits.push({ side: "before", name: r.name, nearest_name: r.nearest_name, clearance: r.clearance });
    }
  }
  for (const r of afterRows) {
    if (r.clearance === value) {
      hits.push({ side: "after", name: r.name, nearest_name: r.nearest_name, clearance: r.clearance });
    }
  }
  hits.sort((a, b) => a.side < b.side ? -1 : a.side > b.side ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const shown = hits.slice(0, MAX_WITNESSES);
  return {
    domain_boundary: value === DOMAIN[0] || value === DOMAIN[1],
    witnesses: shown,
    total: hits.length,
    shown: shown.length
  };
}
function mergeInterval(cells, index, project, beforeRows, afterRows) {
  const value = project(cells[index].delta);
  let left = index;
  let right = index;
  while (left > 0 && project(cells[left - 1].delta) === value) left--;
  while (right + 1 < cells.length && project(cells[right + 1].delta) === value) right++;
  const lower = cells[left].lower;
  const upper = cells[right].upper;
  return {
    lower,
    upper,
    lower_closed: cells[left].lower_closed,
    upper_closed: true,
    lower_boundary: witnessesAt(lower, beforeRows, afterRows),
    upper_boundary: witnessesAt(upper, beforeRows, afterRows)
  };
}
function radiusTransition(before, after, opts = {}) {
  if (before === null || typeof before !== "object") fail(TypeError, "before: expected a map object");
  if (after === null || typeof after !== "object") fail(TypeError, "after: expected a map object");
  if (before.frame_id !== after.frame_id) {
    fail(RangeError, `frame_id mismatch (${before.frame_id} vs ${after.frame_id}): the two maps are not on the same frozen frame`);
  }
  if (before.instrument_id !== after.instrument_id) {
    fail(RangeError, `instrument_id mismatch (${before.instrument_id} vs ${after.instrument_id}): settings differ between the two runs`);
  }
  const { eps, err } = readOpts(opts);
  const beforeProfile = radiusProfile(before, { coordinate_epsilon: eps, distance_error_bound: err });
  const afterProfile = radiusProfile(after, { coordinate_epsilon: eps, distance_error_bound: err });
  const clearBefore = beforeProfile.per_item.map((r) => r.clearance);
  const clearAfter = afterProfile.per_item.map((r) => r.clearance);
  const cells = buildCells(clearBefore, clearAfter);
  const idx = cellIndexContaining(cells, CANONICAL_RADIUS);
  const samples = RADII.map((radius, k) => ({
    radius,
    before: beforeProfile.samples[k].isolated,
    after: afterProfile.samples[k].isolated,
    delta: afterProfile.samples[k].isolated - beforeProfile.samples[k].isolated
  }));
  return {
    version: VERSION,
    frame_id: before.frame_id,
    instrument_id: before.instrument_id,
    canonical_radius: CANONICAL_RADIUS,
    domain: [DOMAIN[0], DOMAIN[1]],
    radii: [...RADII],
    before: beforeProfile,
    after: afterProfile,
    samples,
    retrospective: true,
    canonical_delta: cells[idx].delta,
    exact_delta_interval: mergeInterval(cells, idx, (d) => d, beforeProfile.per_item, afterProfile.per_item),
    same_sign_interval: mergeInterval(cells, idx, sign, beforeProfile.per_item, afterProfile.per_item),
    scope: TRANSITION_SCOPE
  };
}

// lib/radius-api.mjs
function radiusOptions(body) {
  for (const key of ["radius", "canonical_radius", "isolation_radius", "radii", "radius_grid"]) {
    if (body[key] !== void 0) throw new ApiError(422, "The canonical radius is fixed at 0.095; the radius grid is diagnostic-only and fixed.");
  }
  const opts = {};
  for (const [key, positive] of [["coordinate_epsilon", false], ["distance_error_bound", true]]) {
    if (body[key] == null) continue;
    const v = body[key];
    if (typeof v !== "number" || !Number.isFinite(v) || (positive ? v <= 0 : v < 0)) throw new ApiError(422, `${key} must be finite and ${positive ? "> 0" : ">= 0"}`);
    opts[key] = v;
  }
  if (opts.coordinate_epsilon !== void 0 && opts.distance_error_bound !== void 0 && !Number.isFinite(2 * opts.coordinate_epsilon + opts.distance_error_bound)) throw new ApiError(422, "Coordinate robustness budget overflows");
  return opts;
}
function attachRadius(map, baseline, opts) {
  try {
    if (baseline) {
      const comparison = radiusTransition(baseline, map, opts);
      map.radius_profile = comparison.after;
      return comparison;
    }
    map.radius_profile = radiusProfile(map, opts);
    return null;
  } catch (e) {
    throw new ApiError(409, `radius diagnostic correspondence failed: ${e.message}`);
  }
}
function radiusForRead(map) {
  if (map.radius_profile || !map.frame_id || !map.names || !map.pts_full) return map;
  try {
    return { ...map, radius_profile: radiusProfile(map) };
  } catch (e) {
    return { ...map, radius_profile_unavailable: { reason: e.message, diagnostic_only: true } };
  }
}

// lib/map-storage.mjs
var FIELDS = ["axis", "signed_margin", "distance_to_threshold", "perturbation_bound", "bit", "status"];
function encodeMap(map, opts = {}) {
  const limit = opts.limit ?? 19e5;
  let stored = map;
  const md = map.math_diagnostics;
  if (md && Array.isArray(md.per_input)) {
    stored = { ...map, math_diagnostics: {
      ...md,
      storage_encoding: "margin-tuples/1",
      per_input: md.per_input.map((r) => [r.index, r.name, r.margins.map((m) => FIELDS.map((k) => m[k]))])
    } };
  }
  const json2 = JSON.stringify(stored);
  const bytes = new TextEncoder().encode(json2).length;
  if (bytes > limit) throw new ApiError(413, `map (${bytes} bytes) exceeds the ${limit}-byte storage limit; use persist:false`);
  return json2;
}
function decodeMap(json2) {
  const map = typeof json2 === "string" ? JSON.parse(json2) : json2;
  const md = map.math_diagnostics;
  if (md?.storage_encoding === "margin-tuples/1") {
    const { storage_encoding, ...rest } = md;
    map.math_diagnostics = { ...rest, per_input: md.per_input.map((r) => ({
      index: r[0],
      name: r[1],
      margins: r[2].map((t) => Object.fromEntries(FIELDS.map((k, i) => [k, t[i]])))
    })) };
  }
  return map;
}

// lib/map-store.mjs
function prim(v) {
  if (v === null || v === void 0) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}
function metricsOf(map, source) {
  const classes = map.classes && typeof map.classes === "object" ? map.classes.count : map.classes;
  const certs = Array.isArray(map.certificates) ? map.certificates : null;
  return [
    (/* @__PURE__ */ new Date()).toISOString(),
    prim(map.rule_hash ?? map.frame_id),
    prim(map.seed),
    prim(map.n ?? (map.names ? map.names.length : null)),
    prim(map.D),
    prim(map.d),
    prim(map.V2 ?? map.v2),
    prim(map.null && map.null.z),
    prim(map.null && map.null.verdict != null ? map.null.verdict : map.verdict),
    prim(classes),
    prim(map.identity_failures ?? (certs ? certs.filter((c) => c.class === "identity" && !c.ok).length : null)),
    prim(map.measurement_red ?? (certs ? certs.filter((c) => c.class === "measurement" && !c.ok).length : null)),
    prim(source)
  ].map((v) => typeof v === "object" && v !== null ? null : v);
}
async function saveStoredMap(db, env, map, source) {
  const json2 = encodeMap(map, { limit: KV_MAP_JSON_LIMIT });
  const bytes = new TextEncoder().encode(json2).length;
  const m = metricsOf(map, source);
  const insert = async (mapJson) => {
    const ins = await db.prepare(`INSERT INTO maps (created_at, rule_hash, seed, n, dim, d, v2, z_null, verdict, classes, identity_failures, measurement_red, source, map_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...m, mapJson).run();
    return ins?.meta?.last_row_id ?? (await db.prepare(`SELECT MAX(id) AS mid FROM maps`).first())?.mid;
  };
  if (bytes <= D1_MAP_JSON_LIMIT) return insert(json2);
  if (!env || !env.SITE) throw new ApiError(413, `map is ${bytes} bytes, above the D1 inline limit, and no KV overflow store is available; use persist:false`);
  const id2 = await insert(JSON.stringify({ __kv_pending: true, bytes }));
  const key = `map-json:${id2}`;
  try {
    await env.SITE.put(key, json2);
    await db.prepare(`UPDATE maps SET map_json = ? WHERE id = ?`).bind(JSON.stringify({ __kv: key, bytes, storage: "kv-overflow/1" }), Number(id2)).run();
  } catch (e) {
    throw new ApiError(503, `map row ${id2} was created but its overflow body could not be stored: ${e?.message || e}`);
  }
  return id2;
}
async function loadStoredMapJson(db, env, id2) {
  const row = await db.prepare(`SELECT map_json FROM maps WHERE id = ?`).bind(Number(id2)).first();
  if (!row) return null;
  let parsed;
  try {
    parsed = JSON.parse(row.map_json);
  } catch {
    throw new ApiError(500, `stored map ${id2} is not valid JSON`);
  }
  if (parsed && parsed.__kv_pending) throw new ApiError(409, `stored map ${id2} has no body yet (overflow write incomplete)`);
  if (parsed && parsed.__kv) {
    if (!env || !env.SITE) throw new ApiError(503, `stored map ${id2} lives in KV overflow but no KV binding is available`);
    const body = await env.SITE.get(parsed.__kv, "text");
    if (!body) throw new ApiError(503, `stored map ${id2} overflow body ${parsed.__kv} is missing from KV`);
    return decodeMap(body);
  }
  return decodeMap(parsed);
}

// lib/tar-corpus.mjs
var GH = "https://api.github.com";
var CODELOAD = "https://codeload.github.com";
var TEXT_EXT = /\.(md|txt|rst|ts|tsx|js|jsx|py|rs|go|c|h|cpp|hpp|java|rb|sh|bash|fish|yml|yaml|toml|json|lean|tex|rego|conf|cfg|ini|sql|proto|dockerfile|containerfile|hcl|tf)$/i;
var SPECIAL = /(^|\/)(readme|license|makefile|dockerfile|containerfile)(\.|$)/i;
var SKIP_DIRS = /(^|\/)(node_modules|vendor|dist|build|\.git|figs?|images?|assets|fonts)\//i;
var MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
var MAX_TOTAL_TEXT_CHARS = 64 * 1024 * 1024;
var MAX_ENTRIES = 4e4;
var PER_FILE_CAP_CHARS = 2e5;
var MAX_FILE_SIZE_BYTES = 2e5;
function defaultHeaders(token) {
  const h = {
    "User-Agent": "sos-agent",
    Accept: "application/vnd.github+json"
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function decodeTarString(buf, offset, length) {
  let end = offset;
  const max = offset + length;
  while (end < max && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(offset, end));
}
function parseTarHeader(h) {
  if (h.every((b) => b === 0)) return null;
  const expected = parseInt(decodeTarString(h, 148, 8).trim(), 8);
  const actual = h.reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 32 : b), 0);
  if (!Number.isFinite(expected) || expected !== actual) throw new Error("Corrupt TAR header checksum");
  const rawSizeStr = decodeTarString(h, 124, 12).trim();
  const size = parseInt(rawSizeStr, 8);
  if (!/^[0-7]+$/.test(rawSizeStr) || !Number.isSafeInteger(size) || size < 0) throw new Error("Invalid TAR size");
  const typeFlag = String.fromCharCode(h[156]);
  const name = decodeTarString(h, 0, 100);
  const prefix = decodeTarString(h, 345, 155);
  const path = (prefix ? prefix + "/" : "") + name.replace(/\/$/, "");
  return { path, size, typeFlag };
}
function parsePax(bytes) {
  const records = {};
  let offset = 0;
  const dec = new TextDecoder();
  while (offset < bytes.length) {
    let sp = offset;
    while (sp < bytes.length && bytes[sp] !== 32) sp++;
    const size = Number(dec.decode(bytes.subarray(offset, sp)));
    if (!Number.isSafeInteger(size) || size <= sp - offset + 1 || offset + size > bytes.length) throw new Error("Invalid PAX record");
    const line = dec.decode(bytes.subarray(sp + 1, offset + size)).replace(/\n$/, "");
    const eq = line.indexOf("=");
    if (eq > 0) records[line.slice(0, eq)] = line.slice(eq + 1);
    offset += size;
  }
  return records;
}
async function parseTarStream(stream, maxFiles = Infinity) {
  const reader = stream.getReader();
  const textDec = new TextDecoder();
  let buf = new Uint8Array(1 << 16);
  let len = 0;
  let totalDecompressed = 0;
  let totalEntries = 0;
  let accumulatedTextChars = 0;
  const ensure = (extra) => {
    if (len + extra <= buf.length) return;
    let cap = buf.length;
    while (cap < len + extra) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(buf.subarray(0, len));
    buf = nb;
  };
  const shift = (n) => {
    buf.copyWithin(0, n, len);
    len -= n;
  };
  const files = [];
  let pendingGnuPath = null;
  let pendingPaxPath = null;
  let currentFile = null;
  try {
    while (true) {
      if (currentFile) {
        if (currentFile.skip) {
          const toSkip = Math.min(len, currentFile.rem);
          shift(toSkip);
          currentFile.rem -= toSkip;
          if (currentFile.rem === 0) {
            currentFile = null;
            continue;
          }
        } else {
          const take = Math.min(len, currentFile.rem);
          if (take > 0) {
            currentFile.chunks.push(buf.slice(0, take));
            currentFile.rem -= take;
            shift(take);
          }
          if (currentFile.rem === 0) {
            const totalBytes = currentFile.chunks.reduce((acc, c) => acc + c.length, 0);
            const rawBytes = new Uint8Array(totalBytes);
            let off = 0;
            for (const ch of currentFile.chunks) {
              rawBytes.set(ch, off);
              off += ch.length;
            }
            const fileBytes = rawBytes.subarray(0, currentFile.size);
            if (currentFile.isPax) {
              const pax = parsePax(fileBytes);
              if (pax.path) pendingPaxPath = pax.path.replace(/\/$/, "");
            } else if (currentFile.isGnu) {
              const full = textDec.decode(fileBytes).replace(/\0.*$/, "").replace(/\/$/, "");
              pendingGnuPath = full;
            } else {
              const fullDecoded = textDec.decode(fileBytes);
              const text = fullDecoded.slice(0, PER_FILE_CAP_CHARS);
              const truncated = fullDecoded.length > PER_FILE_CAP_CHARS;
              accumulatedTextChars += text.length;
              files.push({
                path: currentFile.path,
                text,
                sizeBytes: currentFile.size,
                truncated
              });
              if (accumulatedTextChars >= MAX_TOTAL_TEXT_CHARS) throw new Error("TAR text budget exceeded");
            }
            currentFile = null;
            continue;
          }
        }
        const r3 = await reader.read();
        if (r3.done) {
          if (currentFile || len) throw new Error("Truncated TAR archive");
          break;
        }
        totalDecompressed += r3.value.length;
        if (totalDecompressed > MAX_DECOMPRESSED_BYTES) throw new Error("TAR decompressed budget exceeded");
        ensure(r3.value.length);
        buf.set(r3.value, len);
        len += r3.value.length;
        continue;
      }
      if (len >= 512) {
        const headerBlock = buf.subarray(0, 512);
        const header = parseTarHeader(headerBlock);
        if (!header) break;
        shift(512);
        totalEntries++;
        if (totalEntries > MAX_ENTRIES) throw new Error("TAR entry budget exceeded");
        const { size, typeFlag } = header;
        const entryPath = pendingGnuPath || pendingPaxPath || header.path;
        pendingGnuPath = null;
        pendingPaxPath = null;
        const paddedSize = Math.ceil(size / 512) * 512;
        const isGnu = typeFlag === "L";
        const isPax = typeFlag === "x" || typeFlag === "X";
        const isRegular = typeFlag === "0" || typeFlag === "\0";
        if ((isGnu || isPax) && size > MAX_FILE_SIZE_BYTES) throw new Error("Oversize TAR extended header");
        if (isGnu) {
          currentFile = { isGnu: true, size, rem: paddedSize, chunks: [] };
          continue;
        }
        if (isPax) {
          currentFile = { isPax: true, size, rem: paddedSize, chunks: [] };
          continue;
        }
        const isDir = typeFlag === "5" || entryPath.endsWith("/");
        const isTextCandidate = isRegular && !isDir && !SKIP_DIRS.test(entryPath) && !entryPath.includes("/.git/") && (TEXT_EXT.test(entryPath) || SPECIAL.test(entryPath));
        if (isTextCandidate) {
          if (size > MAX_FILE_SIZE_BYTES) {
            files.push({
              path: entryPath,
              text: "",
              sizeBytes: size,
              truncated: true
            });
            if (paddedSize > 0) {
              currentFile = { skip: true, rem: paddedSize };
            }
          } else if (size > 0) {
            currentFile = { path: entryPath, size, rem: paddedSize, chunks: [] };
          } else {
            files.push({ path: entryPath, text: "", sizeBytes: 0, truncated: false });
          }
        } else {
          if (paddedSize > 0) {
            currentFile = { skip: true, rem: paddedSize };
          }
        }
        continue;
      }
      const r = await reader.read();
      if (r.done) {
        if (currentFile || len) throw new Error("Truncated TAR archive");
        break;
      }
      totalDecompressed += r.value.length;
      if (totalDecompressed > MAX_DECOMPRESSED_BYTES) throw new Error("TAR decompressed budget exceeded");
      ensure(r.value.length);
      buf.set(r.value, len);
      len += r.value.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
    }
  }
  files.sort((a, b) => {
    const da = a.path.split("/").length;
    const db = b.path.split("/").length;
    const ra = SPECIAL.test(a.path) ? 0 : 1;
    const rb = SPECIAL.test(b.path) ? 0 : 1;
    return ra - rb || da - db || (a.path < b.path ? -1 : 1);
  });
  const sliced = Number.isFinite(maxFiles) ? files.slice(0, maxFiles) : files;
  return {
    files: sliced,
    truncated: files.length > sliced.length
  };
}
async function fetchCorpus(owner, repo, maxFiles = Infinity, token, refOverride) {
  let meta = { description: null, stars: null, language: null };
  let ref = null;
  const is40Hex = typeof refOverride === "string" && /^[0-9a-fA-F]{40}$/.test(refOverride);
  try {
    const metaRes = await fetch(`${GH}/repos/${owner}/${repo}`, {
      headers: defaultHeaders(token)
    });
    if (metaRes.ok) {
      const m = await metaRes.json();
      meta = { description: m.description, stars: m.stargazers_count, language: m.language };
      ref = m.default_branch || "main";
    }
  } catch {
  }
  const requestedRef = refOverride || ref || "main";
  const tarUrl = `${CODELOAD}/${owner}/${repo}/tar.gz/${encodeURIComponent(requestedRef)}`;
  let res = await fetch(tarUrl, {
    headers: defaultHeaders(token),
    redirect: "follow"
  });
  if (!res.ok && !refOverride && requestedRef !== "main") {
    const fallbackUrl = `${CODELOAD}/${owner}/${repo}/tar.gz/main`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: defaultHeaders(token),
      redirect: "follow"
    });
    if (fallbackRes.ok) {
      res = fallbackRes;
      ref = "main";
    }
  }
  if (!res.ok || !res.body) {
    throw new Error(`repo tarball failed: HTTP ${res.status} for ${owner}/${repo}@${requestedRef}`);
  }
  const effectiveRef = refOverride ? is40Hex ? refOverride : refOverride : ref || "main";
  const decompressedStream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const parsed = await parseTarStream(decompressedStream, maxFiles);
  return {
    ref: effectiveRef,
    meta,
    files: parsed.files,
    truncated: parsed.truncated
  };
}

// lib/chunking.mjs
var CHUNK_MAX_BYTES = 400;
var INGESTION_ID = "chunked/v1";
var encoder = new TextEncoder();
function utf8ByteLength(str) {
  return encoder.encode(str).length;
}
function chunkTextUtf8Safe(text, maxBytes = CHUNK_MAX_BYTES) {
  if (typeof text !== "string") throw new TypeError("chunkTextUtf8Safe: text must be a string");
  if (!Number.isInteger(maxBytes) || maxBytes < 4) throw new RangeError("chunkTextUtf8Safe: maxBytes must be an integer >= 4");
  if (text.length === 0) throw new RangeError("chunkTextUtf8Safe: text must not be empty");
  const codePoints = Array.from(text);
  const chunks = [];
  let current = "";
  let currentBytes = 0;
  for (const cp of codePoints) {
    const cpBytes = utf8ByteLength(cp);
    if (cpBytes > maxBytes) {
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
async function sha256Hex(text) {
  const data = encoder.encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}
async function contentCacheKey(ingestionId, fullText) {
  const h = await sha256Hex(ingestionId + "\0" + fullText);
  return { sha256: h, key: `embed-cache:${ingestionId}:${h}` };
}
function lengthWeightedMeanPool(vectors, weights) {
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
      out[j] += x * w / totalWeight;
    }
  }
  return out;
}
function l2Normalize(vec) {
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

// lib/embed-pipeline.mjs
var AI_BATCH_SIZE = 100;
var MODEL = "@cf/baai/bge-base-en-v1.5";
var VECTORIZE_SEARCH_CAVEAT = "each stored Vectorize vector is a length-weighted mean over ALL of that document's chunks (chunked/v1); /api/vector/search therefore matches against a whole-document representation, not per-chunk content \u2014 chunk-level search is not currently supported by this index.";
function validateDocs(rawDocs) {
  if (!Array.isArray(rawDocs) || rawDocs.length === 0) {
    throw new ApiError(422, "need texts: non-empty string[]");
  }
  if (rawDocs.length > MAX_DOCS) {
    throw new ApiError(413, `too many texts: ${rawDocs.length} > max ${MAX_DOCS}`);
  }
  const perDoc = [];
  let totalBytes = 0;
  let totalChunks = 0;
  rawDocs.forEach((doc, i) => {
    if (typeof doc !== "string") throw new ApiError(422, `texts[${i}] must be a string`);
    if (doc.trim().length === 0) throw new ApiError(422, `texts[${i}] is empty`);
    if (doc.length > MAX_CHARS_PER_DOC) {
      throw new ApiError(422, `texts[${i}] exceeds max ${MAX_CHARS_PER_DOC} chars (got ${doc.length})`);
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
async function embedDocuments(env, rawDocs) {
  if (!env || !env.AI) throw new ApiError(502, "AI binding not available");
  const perDoc = validateDocs(rawDocs);
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
    for (let i = 0; i < perDoc.length; i += 100) {
      const slice = perDoc.slice(i, i + 100);
      let bulk = null;
      try {
        const r = await env.SITE.get(slice.map((d) => d.cacheKey), "json");
        if (r && typeof r.get === "function") bulk = r;
      } catch (e) {
        bulk = null;
      }
      for (let k = 0; k < slice.length; k++) {
        const d = slice[k];
        let raw = null;
        try {
          raw = bulk ? bulk.get(d.cacheKey) ?? null : await env.SITE.get(d.cacheKey, "json");
        } catch (e) {
          console.error("embed cache read failed:", d.cacheKey, e?.message || e);
          raw = null;
        }
        if (raw && Array.isArray(raw.vector) && raw.vector.length === 768) {
          cached[i + k] = raw;
          cacheHits++;
        }
      }
    }
  }
  let uncachedChunks = 0, uncachedDocs = 0;
  perDoc.forEach((d, i) => {
    if (!cached[i]) {
      uncachedDocs++;
      uncachedChunks += d.chunks.length;
    }
  });
  if (uncachedChunks > MAX_UNCACHED_CHUNKS || uncachedDocs > MAX_UNCACHED_DOCS) {
    throw new ApiError(413, `this request would embed ${uncachedDocs} uncached documents / ${uncachedChunks} chunks, above the per-request budget (${MAX_UNCACHED_DOCS} docs / ${MAX_UNCACHED_CHUNKS} chunks); ${EMBED_WARMUP_HINT}`, { uncached_docs: uncachedDocs, uncached_chunks: uncachedChunks, cached_docs: cacheHits, max_uncached_docs: MAX_UNCACHED_DOCS, max_uncached_chunks: MAX_UNCACHED_CHUNKS });
  }
  const queue = [];
  perDoc.forEach((d, docIndex) => {
    if (cached[docIndex]) return;
    d.chunks.forEach((chunkText, chunkIndex) => {
      queue.push({ docIndex, chunkIndex, text: chunkText, weight: utf8ByteLength(chunkText) });
    });
  });
  const chunkVectorsByDoc = /* @__PURE__ */ new Map();
  for (let i = 0; i < queue.length; i += AI_BATCH_SIZE) {
    const batch = queue.slice(i, i + AI_BATCH_SIZE);
    const vectors2 = await embedBatch(env, batch.map((b) => b.text));
    batch.forEach((b, k) => {
      if (!chunkVectorsByDoc.has(b.docIndex)) chunkVectorsByDoc.set(b.docIndex, []);
      chunkVectorsByDoc.get(b.docIndex).push({ chunkIndex: b.chunkIndex, vector: vectors2[k], weight: b.weight });
    });
  }
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
      coverage: 1
    };
  });
  await Promise.all(cacheWrites);
  return {
    model: MODEL,
    ingestion_id: INGESTION_ID,
    vectors,
    metadata: {
      preprocessing_id: INGESTION_ID,
      model: MODEL,
      pooling: "mean",
      chunk_max_utf8_bytes: 400,
      aggregation: "byte-weighted-mean+l2",
      docs: docsMeta,
      cache_hits: cacheHits
    }
  };
}
async function rememberChunkedEmbeddings(env, hashStrFn, docs, vectors, source) {
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
            created: (/* @__PURE__ */ new Date()).toISOString(),
            ingestion_id: INGESTION_ID
          }
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

// lib/repo-items.mjs
function parseOwnerRepo(input, parseRepoUrl2) {
  const repoIn = String(input || "").trim();
  if (!repoIn) return null;
  const url = repoIn.includes("github.com") ? repoIn : `https://github.com/${repoIn.replace(/\.git$/, "")}`;
  return parseRepoUrl2(url);
}
function normalizeSubdir(subdir) {
  return String(subdir || "").replace(/^\/+|\/+$/g, "");
}
function detectTarRoot(files) {
  if (!files.length) return "";
  const candidate = files[0].path.split("/")[0] + "/";
  const allShare = files.every((f) => f.path.startsWith(candidate));
  return allShare ? candidate : "";
}
async function repoItemsHandler(body, deps) {
  const { parseRepoUrl: parseRepoUrl2, fetchCorpus: fetchCorpus2, githubToken } = deps;
  const parsed = parseOwnerRepo(body?.repo, parseRepoUrl2);
  if (!parsed) throw new ApiError(400, "need a GitHub repo URL or owner/repo");
  const subdir = normalizeSubdir(body?.subdir);
  const ref = body?.ref ? String(body.ref).trim() : void 0;
  let corpus;
  try {
    corpus = await fetchCorpus2(parsed.owner, parsed.repo, Infinity, githubToken, ref);
  } catch (e) {
    throw new ApiError(502, `corpus fetch failed: ${e?.message || e}`, { resolved_ref: null });
  }
  const files = Array.isArray(corpus?.files) ? corpus.files : [];
  const tarRoot = detectTarRoot(files);
  const norm = (p) => tarRoot && p.startsWith(tarRoot) ? p.slice(tarRoot.length) : p;
  let filtered = files;
  if (subdir) {
    filtered = files.filter((f) => {
      const rp = norm(f.path);
      return rp === subdir || rp.startsWith(subdir + "/");
    });
  }
  if (filtered.length > MAX_ITEMS) {
    throw new ApiError(413, `${filtered.length} items exceed max ${MAX_ITEMS} after filtering; narrow subdir`, {
      n_before_cap: filtered.length,
      max: MAX_ITEMS
    });
  }
  const sorted = filtered.map((f) => ({ f, label: norm(String(f.path)) })).sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
  const items = sorted.map(({ f, label }) => ({
    text: String(f.text ?? ""),
    label,
    truncated: !!f.truncated
  }));
  return {
    repo: `${parsed.owner}/${parsed.repo}`,
    subdir: subdir || null,
    requested_ref: ref || null,
    resolved_ref: corpus?.ref ?? null,
    n: items.length,
    tree_truncated: !!corpus?.truncated,
    items
  };
}

// lib/placement.mjs
var ISO_RADIUS = 0.095;
var SECTORS = 12;
function chord2(a, b) {
  let s = 0;
  for (let k = 0; k < 3; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
}
function sectorOf(p) {
  const phi = Math.atan2(p[1], p[0]);
  let idx = Math.floor((phi + Math.PI) / (2 * Math.PI) * SECTORS);
  if (idx >= SECTORS) idx = SECTORS - 1;
  if (idx < 0) idx = 0;
  return idx + 1;
}
function isolatedNames(map) {
  const P = map.pts_full, N = map.names;
  return N.filter((_, i) => !P.some((q, j) => j !== i && chord2(P[i], q) < ISO_RADIUS));
}
function validateRung(rung, d) {
  if (rung === void 0 || rung === null) return null;
  if (typeof rung !== "object" || Array.isArray(rung)) throw new RangeError("rung must be an object (the ladder rung you are executing)");
  const out = {};
  const pat = rung.pattern ?? rung.target_pattern;
  if (pat !== void 0) {
    if (!Array.isArray(pat) || pat.length !== d || pat.some((b) => b !== 0 && b !== 1)) throw new RangeError(`rung.pattern must be ${d} bits of 0/1`);
    out.pattern = pat.slice();
  }
  if (rung.sector !== void 0) {
    if (!Number.isInteger(rung.sector) || rung.sector < 1 || rung.sector > SECTORS) throw new RangeError("rung.sector must be 1..12");
    out.sector = rung.sector;
  }
  if (rung.joins !== void 0) {
    if (!Array.isArray(rung.joins) || rung.joins.some((n) => typeof n !== "string")) throw new RangeError("rung.joins must be string[]");
    out.joins = rung.joins.slice();
  }
  if (rung.flip_bit !== void 0) {
    if (!Number.isInteger(rung.flip_bit) || rung.flip_bit < 0 || rung.flip_bit >= d) throw new RangeError("rung.flip_bit out of range");
    out.flip_bit = rung.flip_bit;
  }
  if (rung.rung_key !== void 0) out.rung_key = String(rung.rung_key).slice(0, 200);
  if (rung.delta && Number.isFinite(rung.delta.isolated_delta)) out.predicted_isolated_delta = rung.delta.isolated_delta;
  return out;
}
function placement(baseline, after, targetName, action, rung) {
  const j = after.names.indexOf(targetName);
  if (j < 0) return { available: false, reason: "target not present in the after map" };
  const d = after.bits[j].length;
  const p = after.pts_full[j];
  const degree = after.pts_full.reduce((a, q, k) => a + (k !== j && chord2(p, q) < ISO_RADIUS ? 1 : 0), 0);
  const neighbours = after.names.filter((_, k) => k !== j && chord2(p, after.pts_full[k]) < ISO_RADIUS);
  const isoBefore = new Set(isolatedNames(baseline)), isoAfter = new Set(isolatedNames(after));
  const deisolated = [...isoBefore].filter((n) => !isoAfter.has(n) && n !== targetName);
  const newlyIsolated = [...isoAfter].filter((n) => !isoBefore.has(n) && n !== targetName);
  const out = {
    version: "placement",
    target: targetName,
    action,
    achieved_bits: after.bits[j].slice(),
    achieved_sector: sectorOf(p),
    degree,
    neighbours: neighbours.slice(0, 12),
    neighbours_total: neighbours.length,
    target_isolated: degree === 0,
    deisolated_items: deisolated,
    newly_isolated_items: newlyIsolated,
    scope: "achieved geometry on the frozen frame; a match with the rung is an instrumentation outcome, not a quality statement; neither landing nor missing authorizes keeping or reverting"
  };
  if (action === "change") {
    const i = baseline.names.indexOf(targetName);
    if (i >= 0) {
      out.previous_bits = baseline.bits[i].slice();
      out.bits_flipped = out.previous_bits.map((b, k) => b !== out.achieved_bits[k] ? k : -1).filter((k) => k >= 0);
      out.previous_sector = sectorOf(baseline.pts_full[i]);
    }
  }
  if (rung) {
    const r = {};
    if (rung.pattern) {
      const ham = rung.pattern.reduce((a, b, k) => a + (b !== out.achieved_bits[k] ? 1 : 0), 0);
      r.pattern = rung.pattern;
      r.hamming_to_pattern = ham;
      r.landed = ham === 0 ? "on-pattern" : ham <= 2 ? "near-pattern" : "missed-pattern";
    }
    if (rung.sector !== void 0) {
      r.target_sector = rung.sector;
      r.sector_match = rung.sector === out.achieved_sector;
    }
    if (rung.joins) {
      r.joins_intended = rung.joins;
      r.joins_realised = rung.joins.filter((n) => deisolated.includes(n) || neighbours.includes(n));
      r.joins_missed = rung.joins.filter((n) => !(deisolated.includes(n) || neighbours.includes(n)));
    }
    if (rung.flip_bit !== void 0 && out.previous_bits) {
      r.flip_bit = rung.flip_bit;
      r.flip_realised = out.previous_bits[rung.flip_bit] === 0 && out.achieved_bits[rung.flip_bit] === 1;
    }
    if (rung.predicted_isolated_delta !== void 0) {
      const actual = isoAfter.size - isoBefore.size;
      r.predicted_isolated_delta = rung.predicted_isolated_delta;
      r.actual_isolated_delta = actual;
      r.sign_exact = Math.sign(actual) === Math.sign(rung.predicted_isolated_delta);
    }
    if (rung.rung_key) r.rung_key = rung.rung_key;
    r.verdict = r.landed === "on-pattern" && (r.joins_missed === void 0 || r.joins_missed.length === 0) ? "realised" : r.landed === "missed-pattern" || r.joins_missed && r.joins_missed.length && !(r.joins_realised && r.joins_realised.length) ? "missed" : "partial";
    r.verdict_note = "realised/partial/missed describe whether the authored text produced the geometry the rung asked for. A missed rung should not be re-proposed as a fresh ADD in the same sector; revise the document toward joins_missed or record the rung as content-resistant.";
    out.rung = r;
  }
  return out;
}

// lib/rayleigh.mjs
var VERSION2 = "rayleigh";
var ISO_RADIUS2 = 0.095;
var MAX_N2 = AXIS_TRIAL_MAX_N;
var REJECTED = ["weights", "rank", "admit", "admitted", "radius", "radii", "score", "threshold", "d", "T", "seed", "frame", "steps"];
var SCOPE = "Rayleigh-quotient diagnostics on the frozen frame: exact integer component/isolate counts and exact rational Rayleigh\u2013Ritz upper bounds on the isolation graph, a float Fiedler estimate for the largest component compared to K fixed-margin null draws (exclusion-only), and Ky Fan's frozen-frame gap when embeddings are available. None of these is a ranking term, a quality score or a keep/revert rule; `admitted` is computed per frame from explicit criteria (non-degenerate null, seed-reproducible verdicts, exact witness bound, Ky Fan bound, N >= 100) and only licenses reporting the statistics as instrument readings.";
function chord3(a, b) {
  let s = 0;
  for (let k = 0; k < 3; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
}
function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
function frac(num, den) {
  if (den === 0) return null;
  const g = gcd(num, den);
  return { num: num / g, den: den / g, value: num / den };
}
function isolationGraph(pts, radius = ISO_RADIUS2) {
  const n = pts.length;
  const adj = Array.from({ length: n }, () => []);
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (chord3(pts[i], pts[j]) < radius) {
    adj[i].push(j);
    adj[j].push(i);
    edges.push([i, j]);
  }
  return { n, adj, edges, degrees: adj.map((a) => a.length) };
}
function components(adj) {
  const n = adj.length, comp = new Int32Array(n).fill(-1);
  const sizes = [];
  for (let s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    const id2 = sizes.length;
    let q = [s];
    comp[s] = id2;
    let size = 0;
    while (q.length) {
      const v = q.pop();
      size++;
      for (const w of adj[v]) if (comp[w] < 0) {
        comp[w] = id2;
        q.push(w);
      }
    }
    sizes.push(size);
  }
  return { count: sizes.length, sizes, comp: Array.from(comp), isolates: sizes.filter((s) => s === 1).length };
}
function laplacianQuadratic(edges, x) {
  let s = 0;
  for (const [i, j] of edges) {
    const d = x[i] - x[j];
    s += d * d;
  }
  return s;
}
function cutWitness(graph, S) {
  const n = graph.n;
  const inS = new Uint8Array(n);
  for (const i of S) inS[i] = 1;
  const k = S.length;
  let cut = 0;
  for (const [i, j] of graph.edges) if (inS[i] !== inS[j]) cut++;
  if (k === 0 || k === n) return { size: k, cut, quotient: null, note: "trivial subset: the centered indicator is the zero vector" };
  return { size: k, cut, quotient: frac(n * cut, k * (n - k)), identity: "x = n\xB71_S \u2212 |S|\xB71 \u21D2 x\u1D40Lx = n\xB2\xB7cut(S), x\u1D40x = n\xB7|S|\xB7(n\u2212|S|), R(x) = n\xB7cut(S)/(|S|(n\u2212|S|)) \u2265 \u03BB\u2082 on a connected graph (Rayleigh\u2013Ritz)" };
}
function fiedler(graph, vertices, iters = 400) {
  const m = vertices.length;
  if (m < 2) return { lambda2: null, vector: null, note: "component of size < 2 has no Fiedler value" };
  const idx = new Map(vertices.map((v, i) => [v, i]));
  const deg = vertices.map((v) => graph.adj[v].filter((w) => idx.has(w)).length);
  const dmax = Math.max(...deg);
  const shift = 2 * dmax + 1;
  const rng = mulberry32(20260918);
  let x = vertices.map(() => rng() - 0.5);
  const proj = (v) => {
    const mean = v.reduce((a, b) => a + b, 0) / m;
    return v.map((t) => t - mean);
  };
  const norm = (v) => Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  x = proj(x);
  let nx = norm(x);
  x = x.map((t) => t / nx);
  const apply = (v) => vertices.map((u, i) => {
    let s = (shift - deg[i]) * v[i];
    for (const w of graph.adj[u]) {
      const j = idx.get(w);
      if (j !== void 0) s += v[j];
    }
    return s;
  });
  let mu = 0;
  for (let t = 0; t < iters; t++) {
    let y = proj(apply(x));
    const ny = norm(y);
    if (!ny) break;
    mu = ny;
    x = y.map((v) => v / ny);
  }
  let num = 0;
  for (const [a, b] of graph.edges) {
    const i = idx.get(a), j = idx.get(b);
    if (i !== void 0 && j !== void 0) num += (x[i] - x[j]) ** 2;
  }
  const lambda2 = num / x.reduce((a, b) => a + b * b, 0);
  const pos = vertices.filter((_, i) => x[i] >= 0);
  const neg = vertices.filter((_, i) => x[i] < 0);
  return { lambda2, power_estimate: shift - mu, vector_sign_split: { positive: pos.length, negative: neg.length }, cut_positive_side: pos, iters, note: "float power-iteration estimate; the exact rational cutWitness of the sign partition upper-bounds lambda_2 by Rayleigh\u2013Ritz" };
}
function graphRayleigh(map, opts = {}) {
  const pts = map.pts_full, names = map.names;
  if (!Array.isArray(pts) || !Array.isArray(names) || pts.length !== names.length) throw new ApiError(409, "map lacks pts_full/names");
  if (pts.length > MAX_N2) throw new ApiError(422, `rayleigh diagnostics are limited to N <= ${MAX_N2} (map has ${pts.length})`);
  const g = isolationGraph(pts, opts.radius ?? ISO_RADIUS2);
  const c = components(g.adj);
  const largestId = c.sizes.indexOf(Math.max(...c.sizes));
  const largest = c.comp.map((id2, i) => id2 === largestId ? i : -1).filter((i) => i >= 0);
  const f = fiedler(g, largest);
  const witness = f.cut_positive_side ? cutWitness({ n: largest.length, edges: g.edges.filter(([i, j]) => c.comp[i] === largestId && c.comp[j] === largestId).map(([i, j]) => [largest.indexOf(i), largest.indexOf(j)]) }, f.cut_positive_side.map((v) => largest.indexOf(v))) : null;
  const bound_ok = witness && witness.quotient ? f.lambda2 <= witness.quotient.value + 1e-9 : null;
  return {
    n: g.n,
    edges: g.edges.length,
    radius: opts.radius ?? ISO_RADIUS2,
    exact: { components: c.count, isolates: c.isolates, nullity_identity: "nullity(L) = #components (kernel = span of component indicators); every isolated vertex is one component", component_sizes_sorted: c.sizes.slice().sort((a, b) => b - a).slice(0, 12), quadratic_form_of_constant: laplacianQuadratic(g.edges, new Array(g.n).fill(1)) },
    largest_component: { size: largest.length, fiedler_lambda2: f.lambda2 === null ? null : +f.lambda2.toFixed(6), power_iterations: f.iters, sign_split: f.vector_sign_split, rayleigh_ritz_witness: witness ? { subset_size: witness.size, cut_edges: witness.cut, quotient: witness.quotient, identity: witness.identity } : null, bound_holds: bound_ok, bound_note: "\u03BB\u2082(largest) \u2264 R(centered indicator of the Fiedler sign cut) is an exact consequence of Rayleigh\u2013Ritz; a violation would mean the float estimate is wrong, not that the theorem is" },
    isolate_names: names.filter((_, i) => g.degrees[i] === 0).slice(0, 64),
    component_of: c.comp
    // per-item isolation-graph component id, index-aligned with map.names/keys/pts (for preview-only UI overlays)
  };
}
function kyFanFrameGap(X, frame, opts = {}) {
  const n = X.length;
  if (n < 3) return { available: false, reason: "need >= 3 rows" };
  const D = X[0].length;
  const mu = new Float64Array(D);
  for (const r of X) for (let k = 0; k < D; k++) mu[k] += r[k] / n;
  const Xc = X.map((r) => r.map((v, k) => v - mu[k]));
  const denom = n - 1;
  const Cv = (v) => {
    const out = new Float64Array(D);
    for (const r of Xc) {
      let s = 0;
      for (let k = 0; k < D; k++) s += r[k] * v[k];
      for (let k = 0; k < D; k++) out[k] += s * r[k];
    }
    for (let k = 0; k < D; k++) out[k] /= denom;
    return out;
  };
  let trace = 0;
  for (const r of Xc) for (let k = 0; k < D; k++) trace += r[k] * r[k];
  trace /= denom;
  const dot = (a, b) => {
    let s = 0;
    for (let k = 0; k < D; k++) s += a[k] * b[k];
    return s;
  };
  const norm = (a) => Math.sqrt(dot(a, a));
  const rng = mulberry32(opts.seed ?? 20260918);
  const iters = opts.iters ?? 300;
  const top = [];
  for (let e = 0; e < 2; e++) {
    let v = Float64Array.from({ length: D }, () => rng() - 0.5);
    for (const u of top) {
      const c = dot(v, u.vec);
      for (let k = 0; k < D; k++) v[k] -= c * u.vec[k];
    }
    let nv = norm(v);
    for (let k = 0; k < D; k++) v[k] /= nv;
    let lam = 0;
    for (let t = 0; t < iters; t++) {
      let w = Cv(v);
      for (const u of top) {
        const c = dot(w, u.vec);
        for (let k = 0; k < D; k++) w[k] -= c * u.vec[k];
      }
      const nw = norm(w);
      if (!nw) break;
      lam = nw;
      for (let k = 0; k < D; k++) v[k] = w[k] / nw;
    }
    top.push({ vec: v, lambda: dot(v, Cv(v)) });
  }
  const axes = frame && frame.input_pca && Array.isArray(frame.input_pca.axes) ? frame.input_pca.axes.slice(0, 2) : null;
  if (!axes || axes.length < 2 || axes[0].length !== D) return { available: false, reason: "frame has no 2 input axes of matching dimension", trace };
  const a0 = Float64Array.from(axes[0]);
  let n0 = norm(a0);
  for (let k = 0; k < D; k++) a0[k] /= n0;
  const a1 = Float64Array.from(axes[1]);
  const c01 = dot(a1, a0);
  for (let k = 0; k < D; k++) a1[k] -= c01 * a0[k];
  let n1 = norm(a1);
  for (let k = 0; k < D; k++) a1[k] /= n1;
  const ritz = dot(a0, Cv(a0)) + dot(a1, Cv(a1));
  const kyfan = top[0].lambda + top[1].lambda;
  const gap = kyfan - ritz;
  return {
    available: true,
    k: 2,
    trace: +trace.toFixed(6),
    ritz_value_frozen_axes: +ritz.toFixed(6),
    top2_eigen_sum_estimate: +kyfan.toFixed(6),
    gap: +gap.toFixed(6),
    gap_share_of_trace: +(gap / trace).toFixed(6),
    ritz_share: +(ritz / trace).toFixed(6),
    top2_share: +(kyfan / trace).toFixed(6),
    ky_fan_bound_holds: gap >= -1e-6,
    power_iterations: iters,
    reading: "Ky Fan: tr(X\u1D40CX) \u2264 \u03BB\u2081+\u03BB\u2082 for any orthonormal 2-frame X, so gap \u2265 0 exactly; on the baseline corpus the frozen axes ARE the top-2 eigenvectors (gap \u2248 0); on a later corpus the gap is how much variance the frozen frame no longer captures. It is a frame-adequacy reading, not a quality score, and it does not authorize refitting."
  };
}
function graphNull(map, nullDraw, toS2, K, seed) {
  const bits = map.bits;
  const N = bits.length, d = bits[0].length;
  const attempts = 5 * N * d;
  const rng = mulberry32(seed);
  const cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
  const draws = [];
  for (let k = 0; k < K; k++) {
    const B = nullDraw(bits, attempts, rng, cert);
    const pts = B.map(toS2);
    const g = isolationGraph(pts);
    const c = components(g.adj);
    const largestId = c.sizes.indexOf(Math.max(...c.sizes));
    const largest = c.comp.map((id2, i) => id2 === largestId ? i : -1).filter((i) => i >= 0);
    const f = fiedler(g, largest, 200);
    draws.push({ components: c.count, isolates: c.isolates, largest: largest.length, lambda2: f.lambda2, edges: g.edges.length });
  }
  if (!cert.rowOk || !cert.colOk) throw new ApiError(500, "null draw violated a margin; no result returned");
  const stat = (key) => {
    const v = draws.map((x) => x[key]).filter((x) => x !== null && Number.isFinite(x));
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)) : 0;
    return { n: v.length, mean: +mean.toFixed(4), sd: +sd.toFixed(4), min: Math.min(...v), max: Math.max(...v) };
  };
  const tail2 = (key, obs) => {
    const v = draws.map((x) => x[key]).filter((x) => x !== null && Number.isFinite(x));
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const dev = Math.abs(obs - mean);
    const exceed = v.filter((x) => Math.abs(x - mean) >= dev).length;
    return { p_two_sided: +((1 + exceed) / (K + 1)).toFixed(4), p_resolution: +(1 / (K + 1)).toFixed(4), z_descriptive: stat(key).sd ? +((obs - mean) / stat(key).sd).toFixed(2) : null, verdict: stat(key).sd === 0 ? "null-degenerate" : (1 + exceed) / (K + 1) <= 1 / (K + 1) + 1e-12 ? "excluded-from-fixed-margin-null" : "not-excluded" };
  };
  return { K, attempts_per_draw: attempts, margins_preserved: { rows: cert.rowOk, columns: cert.colOk, attempted_total: cert.attempted, accepted_total: cert.accepted }, null_kind: "fixed-attempt symmetric checkerboard-switch chain on the bit matrix; margins preserved; not a full Curveball sequence", components: stat("components"), isolates: stat("isolates"), largest_component: stat("largest"), lambda2_largest: stat("lambda2"), edges: stat("edges"), tail: tail2 };
}
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.map_id) || body.map_id < 1) throw new ApiError(422, "map_id must be a positive integer");
  for (const k of REJECTED) if (body[k] !== void 0) throw new ApiError(422, `${k} is not accepted: rayleigh diagnostics are read-only on the frozen frame and never feed ranking, radius or admission`, { rejected_keys: REJECTED });
  let K = null;
  if (body.K !== void 0) {
    if (!Number.isInteger(body.K) || body.K < 2 || body.K > 40) throw new ApiError(422, "K must be an integer in 2..40");
    K = body.K;
  }
  let seed = null;
  if (body.null_seed !== void 0) {
    if (!Number.isInteger(body.null_seed)) throw new ApiError(422, "null_seed must be an integer");
    seed = body.null_seed;
  }
  return { map_id: body.map_id, K, seed };
}
async function rayleighHandler(body, ctx) {
  const v = validate(body);
  const map = await ctx.loadStoredMap(v.map_id);
  if (!map) throw new ApiError(404, "map not found");
  if (!map.frame || !Array.isArray(map.bits) || !Array.isArray(map.pts_full)) throw new ApiError(409, "legacy map has no frozen frame/bits/points; create a new baseline");
  const graph = graphRayleigh(map);
  const K = v.K ?? Math.min(40, Number.isInteger(map.K) ? map.K : map.null && map.null.K || 40);
  const seed = v.seed ?? (Number.isInteger(map.seed) ? map.seed : 0) ^ 625341585 | 0;
  const PM2 = ctx.PM;
  const nullDraw = PM2._internal.nullDraw;
  const ops = PM2._internal.frameOps(map.frame);
  const nul = graphNull(map, nullDraw, ops.toS2, K, seed);
  const obs = { components: graph.exact.components, isolates: graph.exact.isolates, largest: graph.largest_component.size, lambda2: graph.largest_component.fiedler_lambda2, edges: graph.edges };
  const keys = ["components", "isolates", "largest", "lambda2", "edges"];
  const tails = Object.fromEntries(keys.map((k) => [k, obs[k] === null ? null : nul.tail(k, obs[k])]));
  const { tail: tail2, ...nullOut } = nul;
  const seed2 = seed ^ 2135587861 | 0;
  const nul2 = graphNull(map, nullDraw, ops.toS2, K, seed2);
  const tails2 = Object.fromEntries(keys.map((k) => [k, obs[k] === null ? null : nul2.tail(k, obs[k])]));
  const frameGap = map.rayleigh_frame ?? null;
  const per = {};
  for (const k of keys) {
    const t1 = tails[k], t2 = tails2[k];
    const nondeg = !!(t1 && t2 && t1.verdict !== "null-degenerate" && t2.verdict !== "null-degenerate");
    const reproducible = !!(t1 && t2 && t1.verdict === t2.verdict);
    per[k] = { observed: obs[k], null_nondegenerate: nondeg, verdict_seed_a: t1 ? t1.verdict : null, verdict_seed_b: t2 ? t2.verdict : null, verdict_reproducible: reproducible, z_seed_a: t1 ? t1.z_descriptive : null, z_seed_b: t2 ? t2.z_descriptive : null };
  }
  const criteria = {
    null_nondegenerate_all: keys.every((k) => per[k].null_nondegenerate),
    verdicts_reproducible_all: keys.every((k) => per[k].verdict_reproducible),
    witness_bound_holds: graph.largest_component.bound_holds === true || graph.largest_component.bound_holds === null,
    ky_fan_bound_holds: frameGap && frameGap.available ? frameGap.ky_fan_bound_holds === true : null,
    n_at_least_100: graph.n >= 100,
    lean_identities: "papers/data/lean/RayleighBounds.lean (kernel-checked in lean-check.yml): PSD, kernel of constants and isolates, indicator = cut, witness numerator/denominator"
  };
  const admitted = criteria.null_nondegenerate_all && criteria.verdicts_reproducible_all && criteria.witness_bound_holds && criteria.ky_fan_bound_holds !== false && criteria.n_at_least_100;
  const admission = {
    admitted,
    scope: "reporting on this frame_id/instrument_id only: the five graph statistics may be quoted as instrument readings with their null tails; admission is NOT a ranking term, NOT a radius change, NOT a keep/revert rule, and does not transfer to another frame without its own trial",
    criteria,
    per_statistic: per,
    seeds: { a: seed, b: seed2 },
    K,
    why_not: admitted ? null : Object.entries({ null_nondegenerate_all: "a null is degenerate", verdicts_reproducible_all: "a verdict flipped between independent null seeds", witness_bound_holds: "the float Fiedler estimate violated the exact Rayleigh-Ritz witness", ky_fan_bound_holds: "the frozen-frame Ky Fan gap came out negative", n_at_least_100: "N < 100: a K-draw tail has no resolution at this size" }).filter(([k]) => criteria[k] === false).map(([, v2]) => v2)
  };
  return {
    trial: true,
    persisted: false,
    version: VERSION2,
    map_id: v.map_id,
    frame_id: map.frame_id ?? null,
    instrument_id: map.instrument_id ?? null,
    graph,
    observed: obs,
    null: { ...nullOut, seed, tails, seed_b: seed2, tails_seed_b: tails2 },
    frame_gap: frameGap ?? { available: false, reason: "stored map carries no rayleigh_frame block (computed only when embeddings are available at map time)" },
    admitted,
    admission,
    admission_note: admitted ? "admission criteria met on this frame (see admission.criteria); the statistics may be reported as readings; nothing else changes" : "admission criteria not met on this frame (see admission.why_not); diagnostic record only",
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false },
    task_verdict: "not-applicable",
    scope: SCOPE
  };
}

// lib/map-route.mjs
function id(v, n) {
  if (!Number.isSafeInteger(v) || v < 1) throw new ApiError(422, `${n} must be a positive integer`);
  return v;
}
function aligned(v, n, key, unique = false) {
  if (v === void 0) return;
  if (!Array.isArray(v) || v.length !== n || v.some((s) => typeof s !== "string" || !s.length)) throw new ApiError(422, `${key} must contain one nonempty string per item`);
  if (unique && new Set(v).size !== n) throw new ApiError(422, "names must be unique stable paths");
}
function options(body) {
  const o = {};
  for (const [k, lo, hi, integer] of [["d", 2, 24, true], ["K", 2, 40, true], ["T", Number.MIN_VALUE, 1e6, false], ["seed", -2147483648, 4294967295, true], ["ideal", 1, 5, true], ["steps", 100, 2e5, true], ["perturbation_linf", 0, Number.MAX_VALUE, false], ["roundoff_budget", Number.MIN_VALUE, Number.MAX_VALUE, false]]) {
    if (body[k] == null) continue;
    const v = body[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi || integer && !Number.isInteger(v)) throw new ApiError(422, `${k} must be ${integer ? "an integer" : "finite"} in ${lo}..${hi}`);
    o[k] = v;
  }
  if (body.threshold != null) {
    if (!["median", "zero"].includes(body.threshold)) throw new ApiError(422, "threshold must be median or zero");
    o.threshold = body.threshold;
  }
  return o;
}
async function mapRouteHandler(body, ctx) {
  const { env, PM: PM2, embedDocuments: embedDocuments2, loadStoredMap, saveMap } = ctx;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  const radiusOpts = radiusOptions(body);
  const texts = body.texts !== void 0;
  if (texts === (body.vectors !== void 0)) throw new ApiError(422, "provide exactly one of texts or vectors");
  const MAP_SOURCE_LABELS = ["synthetic", "vectors", "texts"];
  if (body.source !== void 0 && !MAP_SOURCE_LABELS.includes(body.source)) throw new ApiError(422, `source must be one of: ${MAP_SOURCE_LABELS.join(", ")}`);
  if (body.source === "texts" && !texts) throw new ApiError(422, 'source "texts" needs a texts input');
  if ((body.source === "synthetic" || body.source === "vectors") && texts) throw new ApiError(422, `source "${body.source}" needs a vectors input`);
  const input = texts ? body.texts : body.vectors;
  if (!Array.isArray(input) || input.length < 10 || input.length > MAX_ITEMS) throw new ApiError(422, `need 10..${MAX_ITEMS} items`);
  aligned(body.names, input.length, "names", true);
  aligned(body.labels, input.length, "labels");
  if (body.persist !== void 0 && typeof body.persist !== "boolean") throw new ApiError(422, "persist must be boolean");
  if (body.frame !== void 0) throw new ApiError(422, "use baseline_id; arbitrary frames are not accepted by the API");
  let transition = null;
  if (body.transition !== void 0) {
    const t = body.transition;
    if (!t || typeof t !== "object" || Array.isArray(t)) throw new ApiError(422, "transition must be an object {max_changed_names?, max_added?, max_removed?}");
    transition = {};
    for (const k of ["max_changed_names", "max_added", "max_removed"]) {
      if (t[k] === void 0) continue;
      if (!Number.isInteger(t[k]) || t[k] < 0) throw new ApiError(422, `transition.${k} must be a non-negative integer`);
      transition[k] = t[k];
    }
    if (body.baseline_id == null) throw new ApiError(422, "transition requires baseline_id");
  }
  if (texts && input.some((t) => typeof t !== "string" || !t.trim())) throw new ApiError(422, "texts must be nonempty strings");
  if (!texts) {
    const D = input[0]?.length;
    if (!Number.isInteger(D) || D < 2 || D > 768 || input.some((r) => !Array.isArray(r) || r.length !== D || r.some((x) => typeof x !== "number" || !Number.isFinite(x)))) throw new ApiError(422, "vectors must be finite rectangular rows, D=2..768");
  }
  if (body.predicted_delta != null && (typeof body.predicted_delta !== "number" || !Number.isFinite(body.predicted_delta))) throw new ApiError(422, "predicted_delta must be a finite number");
  if (body.preprocessing_id != null && (typeof body.preprocessing_id !== "string" || !body.preprocessing_id.length)) throw new ApiError(422, "preprocessing_id must be nonempty");
  const opts = options(body);
  let baseline = null;
  if (body.baseline_id != null) {
    id(body.baseline_id, "baseline_id");
    if (!body.names) throw new ApiError(422, "names are required for baseline comparison");
    baseline = await loadStoredMap(body.baseline_id);
    if (!baseline) throw new ApiError(404, "baseline not found");
    if (!baseline.frame) throw new ApiError(409, "legacy baseline has no frozen frame; create a new baseline");
    for (const key of ["d", "threshold", "seed", "K", "T", "steps"]) {
      const old = baseline[key] ?? baseline.frame.config[key];
      if (opts[key] !== void 0 && opts[key] !== old) throw new ApiError(409, `${key} conflicts with baseline`);
      if (old !== void 0) opts[key] = old;
    }
    const preprocess = texts ? "chunked/v1" : body.preprocessing_id ?? "raw/v1";
    if (preprocess !== baseline.preprocessing_id) throw new ApiError(409, "preprocessing_id conflicts with baseline");
    if (!texts && input[0].length !== baseline.D) throw new ApiError(409, "input D conflicts with baseline");
    opts.frame = baseline.frame;
  }
  opts.K ??= 40;
  opts.names = body.names ?? body.labels ?? input.map((_, i) => `item_${i}`);
  aligned(opts.names, input.length, "names", true);
  if (body.labels) opts.labels = body.labels;
  let X = input, embedding = null;
  if (texts) {
    embedding = await embedDocuments2(env, input);
    X = embedding.vectors;
    opts.preprocessing_id = embedding.ingestion_id;
  } else opts.preprocessing_id = body.preprocessing_id ?? "raw/v1";
  let map;
  try {
    map = PM2.runMap(X, opts);
  } catch (e) {
    throw new ApiError(422, `map identity/validation failed: ${e.message}`);
  }
  const source = texts ? `texts:${embedding.model}` : body.source === "synthetic" ? "synthetic" : "vectors";
  map.source = source;
  if (embedding) map.embedding_metadata = embedding.metadata;
  let comparison = null;
  if (baseline) {
    try {
      comparison = PM2.compareMaps(baseline, map, { predicted_delta: body.predicted_delta });
    } catch (e) {
      if (!String(e.message).startsWith("name sets differ")) throw new ApiError(409, `comparison validation failed: ${e.message}`);
      comparison = { comparable: false, task_verdict: "not-tested", reason: e.message };
    }
  }
  if (baseline && transition) {
    const bn = new Set(baseline.names || []), an = new Set(map.names || []);
    const added = [...an].filter((n) => !bn.has(n)), removed = [...bn].filter((n) => !an.has(n));
    let changed = [];
    if (comparison && Array.isArray(comparison.changed_content_names)) changed = comparison.changed_content_names;
    else if (comparison && Array.isArray(comparison.changed_names)) changed = comparison.changed_names;
    else if (baseline.embedding_metadata && baseline.embedding_metadata.docs && embedding && embedding.metadata && embedding.metadata.docs) {
      const bh = new Map((baseline.names || []).map((n, i) => [n, baseline.embedding_metadata.docs[i] && baseline.embedding_metadata.docs[i].sha256]));
      changed = map.names.filter((n, i) => bh.has(n) && embedding.metadata.docs[i] && bh.get(n) !== embedding.metadata.docs[i].sha256);
    }
    const over = [];
    if (transition.max_changed_names !== void 0 && changed.length > transition.max_changed_names) over.push({ limit: "max_changed_names", declared: transition.max_changed_names, actual: changed.length, names: changed.slice(0, 10) });
    if (transition.max_added !== void 0 && added.length > transition.max_added) over.push({ limit: "max_added", declared: transition.max_added, actual: added.length, names: added.slice(0, 10) });
    if (transition.max_removed !== void 0 && removed.length > transition.max_removed) over.push({ limit: "max_removed", declared: transition.max_removed, actual: removed.length, names: removed.slice(0, 10) });
    if (over.length) throw new ApiError(409, "the submitted corpus differs from the baseline by more than the declared transition; the map was computed but NOT persisted (driver state is stale or the corpus was rebuilt from the wrong tree)", { transition_violations: over, persisted: false });
  }
  let math_ledger = null;
  const explain = ctx.explainTransition || (typeof PM2.explainTransition === "function" ? PM2.explainTransition.bind(PM2) : null);
  if (baseline && explain) {
    try {
      math_ledger = !ctx.explainTransition && comparison?.math_ledger ? comparison.math_ledger : explain(baseline, map, { predicted_delta: body.predicted_delta });
    } catch (e) {
      throw new ApiError(409, `transition validation failed: ${e.message}`);
    }
  }
  try {
    map.rayleigh_frame = { ...kyFanFrameGap(X, map.frame || opts.frame, { iters: 200 }), version: "rayleigh", frame_source: baseline ? "inherited baseline frame" : "fresh frame (fitted on this corpus)" };
  } catch (e) {
    map.rayleigh_frame = { available: false, reason: e.message };
  }
  const radius_comparison = attachRadius(map, baseline, radiusOpts);
  let placement_block = null;
  if (baseline && Array.isArray(baseline.names) && Array.isArray(baseline.pts_full) && Array.isArray(baseline.bits)) {
    const added = map.names.filter((n) => !baseline.names.includes(n));
    const removed = baseline.names.filter((n) => !map.names.includes(n));
    if (added.length === 1 && removed.length === 0) {
      try {
        placement_block = placement(baseline, map, added[0], "add", null);
      } catch (e) {
        placement_block = { available: false, reason: e.message };
      }
    } else if (added.length === 0 && removed.length === 0 && comparison && Array.isArray(comparison.changed_names) && comparison.changed_names.length === 1) {
      try {
        placement_block = placement(baseline, map, comparison.changed_names[0], "change", null);
      } catch (e) {
        placement_block = { available: false, reason: e.message };
      }
    }
  }
  const persist = body.persist !== false;
  const resultId = persist ? await saveMap(map, source) : null;
  return { id: resultId, map, comparison, math_ledger, radius_comparison, placement: placement_block, persisted: persist };
}
async function mapsCompareHandler(body, ctx) {
  const before = await ctx.loadStoredMap(id(body?.before_id, "before_id"));
  const after = await ctx.loadStoredMap(id(body?.after_id, "after_id"));
  if (!before || !after) throw new ApiError(404, "map not found");
  if (!before.frame || !after.frame) throw new ApiError(409, "legacy map has no frozen frame; create a new baseline");
  try {
    const comparison = ctx.PM.compareMaps(before, after);
    const radius_comparison = attachRadius(after, before, radiusOptions(body));
    return { ...comparison, radius_comparison };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(409, e.message);
  }
}

// lib/preview-route.mjs
var INHERITED_ONLY = ["frame", "d", "K", "T", "seed", "steps", "threshold", "ideal", "preprocessing_id", "vectors", "persist", "labels"];
var NEW_TEXT_BASELINE = "create a new text baseline with POST /api/map {texts, names}";
function nonEmptyString(v, what) {
  if (typeof v !== "string" || v.length === 0) throw new ApiError(422, `${what} must be a nonempty string`);
  return v;
}
function diagnosticOptions(body) {
  const out = {};
  for (const [key, min] of [["predicted_delta", null], ["perturbation_linf", 0], ["roundoff_budget", Number.MIN_VALUE]]) {
    if (body[key] == null) continue;
    const v = body[key];
    if (typeof v !== "number" || !Number.isFinite(v) || min !== null && v < min) {
      throw new ApiError(422, `${key} must be a finite number${min !== null ? " >= 0" : ""}`);
    }
    out[key] = v;
  }
  return { ...out, ...radiusOptions(body) };
}
function validateRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.baseline_id) || body.baseline_id < 1) throw new ApiError(422, "baseline_id must be a positive integer");
  const { texts, names } = body;
  if (!Array.isArray(texts) || texts.length < 10 || texts.length > MAX_ITEMS) {
    throw new ApiError(422, `texts must be the FULL resulting corpus as 10..${MAX_ITEMS} items (not just the changed document)`);
  }
  texts.forEach((t, i) => {
    if (typeof t !== "string" || !t.trim()) throw new ApiError(422, `texts[${i}] must be a nonempty string`);
  });
  if (!Array.isArray(names) || names.length !== texts.length) throw new ApiError(422, "names must contain one literal path per text");
  names.forEach((n, i) => nonEmptyString(n, `names[${i}]`));
  if (new Set(names).size !== names.length) throw new ApiError(422, "names must be unique stable paths");
  const target = body.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new ApiError(422, "target must be an object");
  if (target.action !== "add" && target.action !== "change") throw new ApiError(422, "target.action must be 'add' or 'change'");
  nonEmptyString(target.name, "target.name");
  const diagnostics = diagnosticOptions(body);
  let rung = null;
  if (body.rung !== void 0) {
    try {
      rung = validateRung(body.rung, Array.isArray(body.rung.pattern ?? body.rung.target_pattern) ? (body.rung.pattern ?? body.rung.target_pattern).length : NaN);
    } catch (e) {
      throw new ApiError(422, `rung: ${e.message}`);
    }
  }
  for (const key of INHERITED_ONLY) {
    if (body[key] !== void 0) {
      throw new ApiError(409, `preview inherits the baseline's frozen frame and settings; remove ${key} from the request`, { inherited_only: INHERITED_ONLY });
    }
  }
  return { texts, names, target, diagnostics, rung };
}
function requireTextBaseline(baseline) {
  if (!baseline) throw new ApiError(404, "baseline not found");
  if (!baseline.frame || baseline.version !== "pointmap/0.2") {
    throw new ApiError(409, `baseline predates the v0.2 frozen-frame instrument; ${NEW_TEXT_BASELINE}`);
  }
  const docs = baseline.embedding_metadata && baseline.embedding_metadata.docs;
  const names = baseline.names;
  if (baseline.preprocessing_id !== "chunked/v1" || !Array.isArray(names) || !Array.isArray(docs) || docs.length !== names.length || docs.some((d) => !d || typeof d.sha256 !== "string" || d.sha256.length === 0)) {
    throw new ApiError(409, `baseline has no chunked/v1 per-document SHA256 metadata (vector-sourced or legacy baseline); ${NEW_TEXT_BASELINE}`);
  }
  if (!Array.isArray(baseline.pts_full) || !Array.isArray(baseline.bits) || baseline.pts_full.length !== names.length || baseline.bits.length !== names.length || baseline.pts_full.some((p) => !Array.isArray(p)) || baseline.bits.some((b) => !Array.isArray(b))) {
    throw new ApiError(409, `baseline is missing full-precision points/bits needed for exact anchor verification; ${NEW_TEXT_BASELINE}`);
  }
  const index = /* @__PURE__ */ new Map();
  names.forEach((n, i) => index.set(n, { index: i, sha256: docs[i].sha256 }));
  if (index.size !== names.length) throw new ApiError(409, `baseline names are not unique; ${NEW_TEXT_BASELINE}`);
  return index;
}
function resolveTargetDiff(beforeByName, afterByName, target) {
  const added = [...afterByName.keys()].filter((n) => !beforeByName.has(n));
  const missing = [...beforeByName.keys()].filter((n) => !afterByName.has(n));
  if (missing.length) {
    throw new ApiError(409, "preview never deletes: every baseline name must still be present in the resulting corpus", { missing_names: missing.slice(0, 10), missing_count: missing.length });
  }
  const changed = [...beforeByName].filter(([n, b]) => afterByName.get(n).sha256 !== b.sha256).map(([n]) => n);
  if (target.action === "add") {
    if (added.length !== 1 || added[0] !== target.name) {
      throw new ApiError(409, "ADD must introduce exactly one new name, equal to target.name", { added_names: added.slice(0, 10), added_count: added.length, target_name: target.name });
    }
    if (changed.length) {
      throw new ApiError(409, "ADD must not modify any existing document's source", { changed_names: changed.slice(0, 10), changed_count: changed.length });
    }
    return { noop: false, before_sha256: null, after_sha256: afterByName.get(target.name).sha256, changed };
  }
  if (added.length) {
    throw new ApiError(409, "CHANGE must keep exactly the same name set", { added_names: added.slice(0, 10), added_count: added.length });
  }
  if (!beforeByName.has(target.name)) {
    throw new ApiError(409, "target.name is not present in the baseline", { target_name: target.name });
  }
  if (changed.length > 1 || changed.length === 1 && changed[0] !== target.name) {
    throw new ApiError(409, "CHANGE must alter exactly one name, and it must be target.name", { changed_names: changed.slice(0, 10), changed_count: changed.length, target_name: target.name });
  }
  return {
    noop: changed.length === 0,
    before_sha256: beforeByName.get(target.name).sha256,
    after_sha256: afterByName.get(target.name).sha256,
    changed
  };
}
async function mapPreviewHandler(body, ctx) {
  const { env, PM: PM2, embedDocuments: embedDocuments2, loadStoredMap } = ctx;
  const { texts, names, target, diagnostics, rung } = validateRequest(body);
  validateDocs(texts);
  const baseline = await loadStoredMap(body.baseline_id);
  const beforeByName = requireTextBaseline(baseline);
  const afterHashes = await Promise.all(texts.map((t) => sha256Hex(t)));
  const afterByName = /* @__PURE__ */ new Map();
  names.forEach((n, i) => afterByName.set(n, { index: i, sha256: afterHashes[i] }));
  const diff = resolveTargetDiff(beforeByName, afterByName, target);
  const unchanged_source_count = beforeByName.size - diff.changed.length;
  const saveMap = async () => {
    throw new ApiError(500, "preview must never persist a map");
  };
  const result = await mapRouteHandler(
    { texts, names, baseline_id: body.baseline_id, persist: false, ...diagnostics },
    { env, PM: PM2, embedDocuments: embedDocuments2, loadStoredMap, saveMap, explainTransition: ctx.explainTransition }
  );
  const map = result.map;
  const afterIndex = /* @__PURE__ */ new Map();
  (map.names || []).forEach((n, j) => afterIndex.set(n, j));
  const drift = [];
  const representation_drift_names = [];
  let unchanged_anchor_count = 0;
  for (const [name, before] of beforeByName) {
    if (target.action === "change" && name === target.name && !diff.noop) continue;
    const j = afterIndex.get(name);
    const bp = baseline.pts_full[before.index], ap = map.pts_full[j];
    const bb = baseline.bits[before.index], ab = map.bits[j];
    const points_equal = Array.isArray(ap) && ap.length === bp.length && bp.every((x, k) => x === ap[k]);
    const bits_equal = Array.isArray(ab) && ab.length === bb.length && bb.every((x, k) => x === ab[k]);
    if (!points_equal || !bits_equal) {
      drift.push({ name, points_equal, bits_equal });
      continue;
    }
    unchanged_anchor_count++;
    const bh = baseline.keys && baseline.keys[before.index] && baseline.keys[before.index].hash;
    const ah = map.keys && map.keys[j] && map.keys[j].hash;
    if (bh && ah && bh !== ah) representation_drift_names.push(name);
  }
  if (drift.length) {
    throw new ApiError(409, "untouched anchors moved on the frozen frame; this preview is not comparable to the baseline", { drift: drift.slice(0, 10), drift_count: drift.length });
  }
  if (representation_drift_names.length) {
    console.log(JSON.stringify({
      event: "preview_representation_drift",
      baseline_id: body.baseline_id,
      count: representation_drift_names.length,
      names: representation_drift_names.slice(0, 10),
      note: "identical full points, bits and source SHA256 with a different cached vector fingerprint: representation drift only \u2014 graph stability is not invalidated"
    }));
  }
  if (!map.math_diagnostics || !result.math_ledger || result.math_ledger.kind === "not-applicable") throw new ApiError(409, "preview lacks an applicable math ledger");
  const { per_input, ...sharedDiagnostics } = map.math_diagnostics;
  const map_diagnostics = {
    available: true,
    ...sharedDiagnostics,
    target_input: map.math_diagnostics.per_input.find((r) => r.name === target.name),
    excluded_from_instrument_identity: true,
    note: "Conditional diagnostic budgets are excluded from the frozen instrument hash."
  };
  let placementBlock = null;
  try {
    let r = rung;
    if (r && r.pattern && r.pattern.length !== map.bits[0].length) throw new RangeError(`rung.pattern has ${r.pattern.length} bits, map has ${map.bits[0].length}`);
    placementBlock = placement(baseline, map, target.name, target.action, r);
  } catch (e) {
    throw new ApiError(422, `placement: ${e.message}`);
  }
  return {
    preview: true,
    persisted: false,
    baseline_id: body.baseline_id,
    map,
    placement: placementBlock,
    comparison: result.comparison,
    comparison_note: target.action === "add" ? "name-set comparison is unsupported for ADD by the existing PM.compareMaps (same-name-set only); comparison.comparable is false and the per-anchor evidence is unchanged_anchor_count" : "per-name comparison on the inherited frozen frame",
    math_ledger: result.math_ledger || { available: false, reason: "PM.explainTransition is not implemented in the loaded core" },
    map_diagnostics,
    radius_comparison: result.radius_comparison,
    target: {
      action: target.action,
      name: target.name,
      before_sha256: diff.before_sha256,
      after_sha256: diff.after_sha256,
      noop: diff.noop,
      noop_note: diff.noop ? "the supplied target text is byte-identical to the baseline source: this CHANGE is a no-op and nothing moved" : null
    },
    unchanged_source_count,
    unchanged_anchor_count,
    representation_drift_names,
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: true },
    side_effects_note: "the content-hash embedding cache (env.SITE) may gain per-document vector entries via the existing embedDocuments path; no raw text, no credentials and no raw vectors are stored anywhere else, and no D1/Vectorize/repository write occurs",
    task_verdict: "not-tested",
    task_verdict_note: "geometry only: whether the candidate edit improves the underlying task is not tested here and must be checked by a task-specific independent verifier"
  };
}

// lib/control-route.mjs
var VERSION3 = "calibration";
var GENERATOR = "cutpaste-splice";
var SPLICE_FRACTION = 0.25;
var DEFAULT_N = 4;
var MIN_N2 = 2;
var MAX_N3 = 6;
var DEFAULT_SEED = 20260917;
var FIXED_RECIPE_KEYS = ["splice_fraction", "fraction", "generator", "recipe", "window", "hosts", "donors", "host", "donor", "segment"];
var INHERITED_ONLY2 = ["frame", "d", "K", "T", "seed", "steps", "threshold", "ideal", "preprocessing_id", "vectors", "persist", "labels", "target", "predicted_delta"];
var SCOPE2 = "Positive control (CutPaste-style splice, fixed generator): measures how the frozen instrument responds to a content change of known size. It calibrates detection sensitivity of the existing isolation/displacement statistics on this frame only. It is not a quality score, not a task-success rate, not an admitted map coordinate and not a ranking term; it never authorizes keeping, reverting or deleting a document. Compare controls only on the same frame_id/instrument_id and report n with every count.";
function mulberry322(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function safeCut(str, i) {
  if (i <= 0) return 0;
  if (i >= str.length) return str.length;
  const c = str.charCodeAt(i);
  return c >= 56320 && c <= 57343 ? i - 1 : i;
}
function planSplice(hostText, donorText, rng) {
  const len = Math.max(1, Math.round(SPLICE_FRACTION * hostText.length));
  let start = safeCut(hostText, Math.round((hostText.length - len) / 2));
  let end = safeCut(hostText, start + len);
  if (end <= start) end = Math.min(hostText.length, start + 1);
  const donorLen = Math.min(end - start, donorText.length);
  const dmax = donorText.length - donorLen;
  let dstart = safeCut(donorText, Math.floor(rng() * (dmax + 1)));
  let dend = safeCut(donorText, dstart + donorLen);
  if (dend <= dstart) dend = Math.min(donorText.length, dstart + 1);
  const segment = donorText.slice(dstart, dend);
  const synthetic = hostText.slice(0, start) + segment + hostText.slice(end);
  return { start, end, donor_start: dstart, donor_end: dend, removed_units: end - start, inserted_units: dend - dstart, synthetic };
}
function planControls(N, n, seed) {
  const rng = mulberry322(seed);
  const plans = [];
  for (let i = 0; i < n; i++) {
    const host = Math.floor(rng() * N);
    let donor = Math.floor(rng() * (N - 1));
    if (donor >= host) donor++;
    plans.push({ i, host, donor, rng });
  }
  return plans;
}
function validateRequest2(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.baseline_id) || body.baseline_id < 1) throw new ApiError(422, "baseline_id must be a positive integer");
  const { texts, names } = body;
  if (!Array.isArray(texts) || texts.length < 10 || texts.length > MAX_ITEMS) throw new ApiError(422, `texts must be the FULL baseline corpus as 10..${MAX_ITEMS} items`);
  texts.forEach((t, i) => {
    if (typeof t !== "string" || !t.trim()) throw new ApiError(422, `texts[${i}] must be a nonempty string`);
  });
  if (!Array.isArray(names) || names.length !== texts.length) throw new ApiError(422, "names must contain one literal path per text");
  names.forEach((n2, i) => {
    if (typeof n2 !== "string" || !n2.length) throw new ApiError(422, `names[${i}] must be a nonempty string`);
  });
  if (new Set(names).size !== names.length) throw new ApiError(422, "names must be unique stable paths");
  for (const key of FIXED_RECIPE_KEYS) {
    if (body[key] !== void 0) throw new ApiError(422, `the control recipe is fixed (${GENERATOR}, splice_fraction ${SPLICE_FRACTION}); remove ${key}. Do not tune a control to the result it produces.`, { fixed_recipe_keys: FIXED_RECIPE_KEYS });
  }
  for (const key of INHERITED_ONLY2) {
    if (body[key] !== void 0) throw new ApiError(409, `control inherits the baseline's frozen frame and settings; remove ${key} from the request`, { inherited_only: INHERITED_ONLY2 });
  }
  let n = DEFAULT_N;
  if (body.n_controls !== void 0) {
    if (!Number.isInteger(body.n_controls) || body.n_controls < MIN_N2 || body.n_controls > MAX_N3) throw new ApiError(422, `n_controls must be an integer in ${MIN_N2}..${MAX_N3}`);
    n = body.n_controls;
  }
  let seed = DEFAULT_SEED;
  if (body.control_seed !== void 0) {
    if (!Number.isInteger(body.control_seed) || body.control_seed < -2147483648 || body.control_seed > 4294967295) throw new ApiError(422, "control_seed must be an integer in -2147483648..4294967295");
    seed = body.control_seed;
  }
  return { texts, names, n, seed };
}
function ledgerDelta(l) {
  if (!l) return null;
  const m = l.measurement && Number.isFinite(l.measurement.actual_delta) ? l.measurement.actual_delta : null;
  if (m !== null) return m;
  return l.ledger && Number.isFinite(l.ledger.actual_delta) ? l.ledger.actual_delta : Number.isFinite(l.actual_delta) ? l.actual_delta : null;
}
function quantiles(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!v.length) return { n: 0, min: null, median: null, max: null };
  const mid = v.length >> 1;
  const median = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return { n: v.length, min: v[0], median, max: v[v.length - 1] };
}
function signCounts(values) {
  const out = { negative: 0, zero: 0, positive: 0, n: 0 };
  for (const x of values) {
    if (!Number.isFinite(x)) continue;
    out.n++;
    if (x < 0) out.negative++;
    else if (x > 0) out.positive++;
    else out.zero++;
  }
  return out;
}
async function mapControlHandler(body, ctx) {
  const { env, PM: PM2, embedDocuments: embedDocuments2 } = ctx;
  const loadCache = /* @__PURE__ */ new Map();
  const loadStoredMap = async (id2) => {
    const k = Number(id2);
    if (!loadCache.has(k)) loadCache.set(k, await ctx.loadStoredMap(k));
    return loadCache.get(k);
  };
  const preview = ctx.previewHandler || mapPreviewHandler;
  const { texts, names, n, seed } = validateRequest2(body);
  validateDocs(texts);
  const baseline = await loadStoredMap(body.baseline_id);
  const beforeByName = requireTextBaseline(baseline);
  const hashes = await Promise.all(texts.map((t) => sha256Hex(t)));
  const missing = [...beforeByName.keys()].filter((nm) => !names.includes(nm));
  const added = names.filter((nm) => !beforeByName.has(nm));
  const changed = names.filter((nm, i) => beforeByName.has(nm) && beforeByName.get(nm).sha256 !== hashes[i]);
  if (missing.length || added.length || changed.length) {
    throw new ApiError(409, "control runs on the EXACT baseline corpus: every baseline name must be present with an identical SHA256 and no extra names", {
      missing_count: missing.length,
      missing_names: missing.slice(0, 10),
      added_count: added.length,
      added_names: added.slice(0, 10),
      changed_count: changed.length,
      changed_names: changed.slice(0, 10)
    });
  }
  const plans = planControls(texts.length, n, seed);
  const controls = [];
  let degenerate = 0;
  for (const plan of plans) {
    const hostName = names[plan.host], donorName = names[plan.donor];
    const splice = planSplice(texts[plan.host], texts[plan.donor], plan.rng);
    if (splice.synthetic === texts[plan.host] || !splice.synthetic.trim()) {
      degenerate++;
      controls.push({ i: plan.i, host: hostName, donor: donorName, degenerate: true, reason: "splice produced byte-identical or empty text; not measured", splice: { ...splice, synthetic: void 0 } });
      continue;
    }
    const synthTexts = texts.slice();
    synthTexts[plan.host] = splice.synthetic;
    const r = await preview(
      { baseline_id: body.baseline_id, texts: synthTexts, names, target: { action: "change", name: hostName } },
      { env, PM: PM2, embedDocuments: embedDocuments2, loadStoredMap }
    );
    const per = r.comparison && Array.isArray(r.comparison.per_name) ? r.comparison.per_name.find((x) => x.name === hostName) : null;
    const ledger = r.math_ledger || null;
    controls.push({
      i: plan.i,
      host: hostName,
      donor: donorName,
      degenerate: false,
      splice: { start: splice.start, end: splice.end, removed_units: splice.removed_units, inserted_units: splice.inserted_units, donor_start: splice.donor_start, donor_end: splice.donor_end },
      before_sha256: r.target && r.target.before_sha256,
      synthetic_sha256: r.target && r.target.after_sha256,
      isolated_delta: r.comparison && Number.isFinite(r.comparison.isolated_delta) ? r.comparison.isolated_delta : null,
      ledger_actual_delta: ledgerDelta(ledger),
      bits_changed: per ? per.bits_changed : null,
      displacement_geodesic: per ? per.displacement_geodesic : null,
      displacement_chord: per ? per.displacement_chord : null,
      quantization_silent: per ? !!per.quantization_silent : null,
      occupied_sectors_delta: r.comparison && Number.isFinite(r.comparison.occupied_sectors_delta) ? r.comparison.occupied_sectors_delta : null,
      unchanged_anchor_count: r.unchanged_anchor_count,
      frame_id: r.map && r.map.frame_id,
      instrument_id: r.map && r.map.instrument_id
    });
  }
  const measured = controls.filter((c) => !c.degenerate);
  const iso = measured.map((c) => c.isolated_delta);
  const summary2 = {
    n_requested: n,
    n_measured: measured.length,
    n_degenerate: degenerate,
    isolated_delta: { ...signCounts(iso), ...quantiles(iso) },
    abs_isolated_delta: quantiles(iso.map((x) => Math.abs(x))),
    displacement_geodesic: quantiles(measured.map((c) => c.displacement_geodesic)),
    bits_changed: quantiles(measured.map((c) => c.bits_changed)),
    bits_moved_count: measured.filter((c) => c.bits_changed > 0).length,
    quantization_silent_count: measured.filter((c) => c.quantization_silent).length,
    occupied_sectors_delta: signCounts(measured.map((c) => c.occupied_sectors_delta)),
    anchor_note: "every measured control verified all other anchors byte-equal on the frozen frame (preview 409s otherwise)"
  };
  const bnull = baseline.null || {};
  return {
    control: true,
    persisted: false,
    version: VERSION3,
    baseline_id: body.baseline_id,
    frame_id: baseline.frame_id,
    instrument_id: baseline.instrument_id,
    recipe: {
      generator: GENERATOR,
      splice_fraction: SPLICE_FRACTION,
      window: "centered contiguous code-unit window of round(0.25 * host length), replaced by a same-length contiguous donor segment (whole donor if shorter); surrogate pairs never split",
      control_seed: seed,
      n_controls: n,
      fixed: true,
      fixed_note: "recipe parameters are not caller-selectable, so a control cannot be tuned to the result it produces"
    },
    baseline_reference: {
      n: baseline.n ?? (baseline.names ? baseline.names.length : null),
      isolated: baseline.isolated ?? null,
      occupied_sectors: baseline.occupied_sectors ?? null,
      null: { K: bnull.K ?? null, E0: bnull.E0 ?? null, SD0: bnull.SD0 ?? null, p_resolution: bnull.p_resolution ?? null, kind: bnull.kind ?? null },
      null_note: "the stored checkerboard null randomizes bit margins, not content; it is the false-alarm reference. This control is the known-signal reference. Neither is a task-quality measurement."
    },
    no_change_reference: { isolated_delta: 0, displacement_geodesic: 0, bits_changed: 0, note: "identity: a byte-identical CHANGE moves nothing on the frozen frame (preview reports noop); not re-embedded here" },
    controls,
    summary: summary2,
    scope: SCOPE2,
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: true },
    side_effects_note: "each control is measured by the existing preview path; only the content-hash embedding cache may gain entries for the synthetic documents",
    task_verdict: "not-applicable",
    task_verdict_note: "synthetic splices are known-different by construction; they say nothing about whether any real edit improves the underlying task"
  };
}

// lib/outcomes-route.mjs
var VERSION4 = "outcomes";
var VERDICTS = Object.freeze(["pending", "kept", "reverted", "declined", "abstained", "neutral"]);
var MAX_VERIFIER = 200;
var MAX_NOTES = 2e3;
var MAX_ROWS = 500;
var SCOPE3 = "Append-only pre-registration ledger: a geometric prediction (predicted_delta) frozen before the task check, the recomputed observed geometric delta on the same frozen frame, and the INDEPENDENT verifier's verdict. Counts are retrospective outcomes on the corpora that were actually tried; they are not a calibrated success rate, not a benchmark and not evidence that geometry predicts task quality. Report n with every count; never convert these counts into a rate or a significance claim.";
function posInt(v, what) {
  if (!Number.isSafeInteger(v) || v < 1) throw new ApiError(422, `${what} must be a positive integer`);
  return v;
}
function sign2(x) {
  if (x === null || x === void 0 || !Number.isFinite(x)) return "none";
  return x < 0 ? "negative" : x > 0 ? "positive" : "zero";
}
function validateOutcomeBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  const baseline_id = posInt(body.baseline_id, "baseline_id");
  const t = body.target;
  if (!t || typeof t !== "object" || Array.isArray(t)) throw new ApiError(422, "target must be an object");
  if (t.action !== "add" && t.action !== "change") throw new ApiError(422, "target.action must be 'add' or 'change'");
  if (typeof t.name !== "string" || !t.name.length) throw new ApiError(422, "target.name must be a nonempty string");
  let predicted_delta = null;
  if (body.predicted_delta !== void 0 && body.predicted_delta !== null) {
    if (typeof body.predicted_delta !== "number" || !Number.isFinite(body.predicted_delta)) throw new ApiError(422, "predicted_delta must be a finite number or null");
    predicted_delta = body.predicted_delta;
  }
  let after_id = null;
  if (body.after_id !== void 0 && body.after_id !== null) after_id = posInt(body.after_id, "after_id");
  let observed_delta = null;
  if (body.observed_delta !== void 0 && body.observed_delta !== null) {
    if (typeof body.observed_delta !== "number" || !Number.isFinite(body.observed_delta)) throw new ApiError(422, "observed_delta must be a finite number or null");
    observed_delta = body.observed_delta;
  }
  if (after_id !== null && observed_delta !== null) throw new ApiError(422, "supply after_id (server recomputes the observed delta) OR observed_delta (caller-supplied), not both");
  const tc = body.task_check;
  if (!tc || typeof tc !== "object" || Array.isArray(tc)) throw new ApiError(422, "task_check must be an object {verdict, verifier, notes?}");
  if (!VERDICTS.includes(tc.verdict)) throw new ApiError(422, `task_check.verdict must be one of ${VERDICTS.join(", ")}`);
  if (typeof tc.verifier !== "string" || !tc.verifier.trim() || tc.verifier.length > MAX_VERIFIER) throw new ApiError(422, `task_check.verifier must name the independent verifier (1..${MAX_VERIFIER} chars)`);
  if (tc.notes !== void 0 && (typeof tc.notes !== "string" || tc.notes.length > MAX_NOTES)) throw new ApiError(422, `task_check.notes must be a string of at most ${MAX_NOTES} chars`);
  if (tc.verdict !== "pending" && tc.verifier.trim().toLowerCase() === "geometry") throw new ApiError(422, "the verifier must be independent of the geometry; 'geometry' is not an admissible verifier");
  let supersedes = null;
  if (body.supersedes !== void 0 && body.supersedes !== null) supersedes = posInt(body.supersedes, "supersedes");
  for (const key of ["score", "quality", "success_rate", "rate", "confidence", "z"]) {
    if (body[key] !== void 0) throw new ApiError(422, `${key} is not accepted: the ledger stores predictions, observed deltas and independent verdicts only`);
  }
  return { baseline_id, target: { action: t.action, name: t.name }, predicted_delta, after_id, observed_delta, task_check: { verdict: tc.verdict, verifier: tc.verifier.trim(), notes: tc.notes ?? null }, supersedes };
}
async function outcomesPostHandler(body, ctx) {
  const v = validateOutcomeBody(body);
  const baseline = await ctx.loadStoredMap(v.baseline_id);
  if (!baseline) throw new ApiError(404, "baseline not found");
  if (!baseline.frame) throw new ApiError(409, "legacy baseline has no frozen frame; create a new baseline");
  if (v.target.action === "change" && Array.isArray(baseline.names) && !baseline.names.includes(v.target.name)) {
    throw new ApiError(409, "CHANGE target.name is not present in the baseline", { target_name: v.target.name });
  }
  if (v.target.action === "add" && Array.isArray(baseline.names) && baseline.names.includes(v.target.name)) {
    throw new ApiError(409, "ADD target.name already exists in the baseline", { target_name: v.target.name });
  }
  let observed = { delta: null, source: "none", frame_id: baseline.frame_id ?? null, after_frame_id: null, ledger_kind: null };
  if (v.after_id !== null) {
    const after = await ctx.loadStoredMap(v.after_id);
    if (!after) throw new ApiError(404, "after map not found");
    if (!after.frame) throw new ApiError(409, "after map has no frozen frame");
    let ledger;
    try {
      ledger = ctx.PM.explainTransition(baseline, after);
    } catch (e) {
      throw new ApiError(409, `observed delta could not be recomputed on one frozen frame: ${e.message}`);
    }
    const actual = ledger && ledger.measurement && Number.isFinite(ledger.measurement.actual_delta) ? ledger.measurement.actual_delta : ledger && ledger.ledger && Number.isFinite(ledger.ledger.actual_delta) ? ledger.ledger.actual_delta : null;
    if (actual === null) throw new ApiError(409, "transition ledger did not yield a recomputed actual_delta");
    const moved = ledger.moved_name ?? ledger.added_name ?? null;
    if (moved && moved !== v.target.name) throw new ApiError(409, "the stored transition moves a different name than target.name", { ledger_name: moved, target_name: v.target.name });
    observed = { delta: actual, source: "server:explainTransition", frame_id: baseline.frame_id ?? null, after_frame_id: after.frame_id ?? null, ledger_kind: ledger.kind ?? ledger.class ?? null };
  } else if (v.observed_delta !== null) {
    observed = { delta: v.observed_delta, source: "caller", frame_id: baseline.frame_id ?? null, after_frame_id: null, ledger_kind: null };
  }
  if (v.supersedes !== null) {
    const prev = await ctx.getOutcome(v.supersedes);
    if (!prev) throw new ApiError(404, "supersedes row not found");
    if (prev.baseline_id !== v.baseline_id || prev.target.name !== v.target.name || prev.target.action !== v.target.action) {
      throw new ApiError(409, "a superseding row must share baseline_id and target with the row it supersedes");
    }
  }
  const now = (ctx.now ? ctx.now() : /* @__PURE__ */ new Date()).toISOString();
  const preregistered = v.task_check.verdict === "pending" || v.supersedes !== null;
  const entry = {
    version: VERSION4,
    created_at: now,
    baseline_id: v.baseline_id,
    after_id: v.after_id,
    target: v.target,
    predicted_delta: v.predicted_delta,
    predicted_sign: sign2(v.predicted_delta),
    observed_delta: observed.delta,
    observed_sign: sign2(observed.delta),
    observed_source: observed.source,
    frame_id: observed.frame_id,
    after_frame_id: observed.after_frame_id,
    ledger_kind: observed.ledger_kind,
    sign_exact: v.predicted_delta !== null && observed.delta !== null ? sign2(v.predicted_delta) === sign2(observed.delta) : null,
    task_check: v.task_check,
    supersedes: v.supersedes,
    preregistered,
    preregistered_note: preregistered ? "prediction registered before (or independently of) the verdict row" : "prediction and verdict arrived in one row; the ledger cannot show the prediction was frozen before the check"
  };
  const id2 = await ctx.insertOutcome(entry);
  return { id: id2, entry: { id: id2, ...entry }, persisted: true, append_only: true, scope: SCOPE3 };
}
function contingency(rows) {
  const superseded = new Set(rows.filter((r) => r.supersedes).map((r) => r.supersedes));
  const effective = rows.filter((r) => r.task_check && r.task_check.verdict !== "pending" && !superseded.has(r.id));
  const byVerdict = {};
  for (const vv of VERDICTS) if (vv !== "pending") byVerdict[vv] = 0;
  const signs = ["negative", "zero", "positive", "none"];
  const predVsObs = {};
  for (const p of signs) {
    predVsObs[p] = {};
    for (const o of signs) predVsObs[p][o] = 0;
  }
  const verdictBySignExact = { exact: {}, not_exact: {}, untested: {} };
  for (const k of Object.keys(verdictBySignExact)) for (const vv of VERDICTS) if (vv !== "pending") verdictBySignExact[k][vv] = 0;
  let exact = 0, comparable = 0, server_observed = 0, caller_observed = 0, preregistered = 0;
  for (const r of effective) {
    byVerdict[r.task_check.verdict] = (byVerdict[r.task_check.verdict] || 0) + 1;
    predVsObs[r.predicted_sign][r.observed_sign]++;
    if (r.sign_exact === true) {
      exact++;
      comparable++;
      verdictBySignExact.exact[r.task_check.verdict]++;
    } else if (r.sign_exact === false) {
      comparable++;
      verdictBySignExact.not_exact[r.task_check.verdict]++;
    } else verdictBySignExact.untested[r.task_check.verdict]++;
    if (r.observed_source === "server:explainTransition") server_observed++;
    else if (r.observed_source === "caller") caller_observed++;
    if (r.preregistered) preregistered++;
  }
  return {
    n_rows: rows.length,
    n_pending: rows.filter((r) => r.task_check && r.task_check.verdict === "pending").length,
    n_superseded: superseded.size,
    n_effective: effective.length,
    n_preregistered: preregistered,
    n_sign_comparable: comparable,
    sign_exact_count: exact,
    observed_source_counts: { server: server_observed, caller: caller_observed, none: effective.length - server_observed - caller_observed },
    by_verdict: byVerdict,
    predicted_sign_by_observed_sign: predVsObs,
    verdict_by_sign_exact: verdictBySignExact,
    note: "counts only, with n; a sign-exact geometric prediction is an instrumentation outcome, not a task-quality outcome, and a kept verdict does not imply the geometry predicted it"
  };
}
async function outcomesGetHandler(query, ctx) {
  let baseline_id = null, frame_id = null;
  if (query && query.baseline_id !== void 0 && query.baseline_id !== null && query.baseline_id !== "") {
    const n = Number(query.baseline_id);
    baseline_id = posInt(n, "baseline_id");
  }
  if (query && typeof query.frame_id === "string" && query.frame_id.length) {
    if (!/^[0-9a-f]{8,32}$/i.test(query.frame_id)) throw new ApiError(422, "frame_id must be a hex fingerprint");
    frame_id = query.frame_id.toLowerCase();
  }
  let rows = await ctx.listOutcomes(baseline_id);
  if (frame_id !== null) rows = rows.filter((r) => typeof r.frame_id === "string" && r.frame_id.toLowerCase() === frame_id);
  if (!Array.isArray(rows)) throw new ApiError(503, "outcome storage unavailable");
  return { version: VERSION4, baseline_id, frame_id, rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS, contingency: contingency(rows), append_only: true, scope: SCOPE3 };
}

// lib/axis-redundancy.mjs
var VERSION5 = "axis-trial";
var STATISTIC = "loo-nn-vote";
var NULL_SEED_XOR = 1540483477;
var MIN_K = 2;
var MAX_K = 40;
var REJECTED_KEYS = ["weights", "importance", "rank", "admit", "admitted", "threshold", "d", "T", "seed", "frame", "steps"];
var SCOPE4 = "Trial of one candidate per-axis statistic (leave-one-out nearest-neighbour predictability of bit j from the other d-1 bits) against the fixed-margin checkerboard null. Exclusion-only reading: an axis whose observed hit count reaches the empirical tail resolution is 'excluded-from-fixed-margin-null' on this corpus and frame; anything else is 'not-excluded'. Descriptive z only; K draws cannot resolve tails below 1/(K+1). This is a diagnostic trial record, not an admitted map coordinate, not an axis weight, not a ranking term and not a statement about what any axis means.";
function mulberry323(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function validateBits(bits) {
  if (!Array.isArray(bits) || bits.length < 3) throw new ApiError(409, "map has no usable bits matrix (need >= 3 rows)");
  const d = bits[0] && bits[0].length;
  if (!Number.isInteger(d) || d < 2) throw new ApiError(409, "bits rows must have d >= 2 columns");
  for (const r of bits) {
    if (!Array.isArray(r) || r.length !== d || r.some((x) => x !== 0 && x !== 1)) throw new ApiError(409, "bits must be a rectangular 0/1 matrix");
  }
  return d;
}
function looNearestNeighbourHits(B) {
  const N = B.length, d = B[0].length;
  const H = Array.from({ length: N }, () => new Int32Array(N));
  for (let i = 0; i < N; i++) for (let k = i + 1; k < N; k++) {
    let s = 0;
    const a = B[i], b = B[k];
    for (let j = 0; j < d; j++) if (a[j] !== b[j]) s++;
    H[i][k] = s;
    H[k][i] = s;
  }
  const hits = new Array(d).fill(0), ties = new Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < N; i++) {
      let best = Infinity, ones = 0, cnt = 0;
      for (let k = 0; k < N; k++) {
        if (k === i) continue;
        const dist = H[i][k] - (B[i][j] !== B[k][j] ? 1 : 0);
        if (dist < best) {
          best = dist;
          ones = B[k][j];
          cnt = 1;
        } else if (dist === best) {
          ones += B[k][j];
          cnt++;
        }
      }
      const zeros = cnt - ones;
      if (ones === zeros) {
        hits[j] += 0.5;
        ties[j]++;
      } else if ((ones > zeros ? 1 : 0) === B[i][j]) hits[j] += 1;
    }
  }
  return { hits, ties };
}
function stats(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, min: Math.min(...values), max: Math.max(...values) };
}
function axisRedundancyTrial(bits, opts) {
  const d = validateBits(bits);
  const N = bits.length;
  const { K, seed, nullDraw } = opts;
  if (typeof nullDraw !== "function") throw new ApiError(500, "nullDraw not available from the loaded core");
  const attempts = opts.attempts ?? 5 * N * d;
  const observed = looNearestNeighbourHits(bits);
  const colOnes = Array.from({ length: d }, (_, j) => bits.reduce((a, r) => a + r[j], 0));
  const marginBaseline = colOnes.map((c) => Math.max(c, N - c));
  const cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
  const rng = mulberry323(seed);
  const draws = [];
  for (let k = 0; k < K; k++) draws.push(looNearestNeighbourHits(nullDraw(bits, attempts, rng, cert)).hits);
  if (!cert.rowOk || !cert.colOk) throw new ApiError(500, "null draw violated a row or column margin; no result is returned");
  const p_resolution = 1 / (K + 1);
  const axes = [];
  let totalObs = 0;
  const totalNull = new Array(K).fill(0);
  for (let j = 0; j < d; j++) {
    const nullHits = draws.map((h) => h[j]);
    const s = stats(nullHits);
    const obs = observed.hits[j];
    totalObs += obs;
    nullHits.forEach((v, k) => {
      totalNull[k] += v;
    });
    const dev = Math.abs(obs - s.mean);
    const exceed = nullHits.filter((v) => Math.abs(v - s.mean) >= dev).length;
    const p = (1 + exceed) / (K + 1);
    const degenerate = s.sd === 0;
    axes.push({
      axis: j,
      column_ones: colOnes[j],
      margin_baseline_hits: marginBaseline[j],
      observed_hits: obs,
      observed_ties: observed.ties[j],
      observed_minus_margin_baseline: obs - marginBaseline[j],
      null: { K, mean: +s.mean.toFixed(4), sd: +s.sd.toFixed(4), min: s.min, max: s.max, degenerate },
      z_descriptive: degenerate ? null : +((obs - s.mean) / s.sd).toFixed(2),
      p_two_sided: +p.toFixed(4),
      p_resolution: +p_resolution.toFixed(4),
      verdict: degenerate ? "null-degenerate: no trial possible on this corpus" : p <= p_resolution + 1e-12 ? "excluded-from-fixed-margin-null" : "not-excluded",
      direction: degenerate ? null : obs > s.mean ? "more-predictable-than-null" : obs < s.mean ? "less-predictable-than-null" : "equal-to-null-mean"
    });
  }
  const ts = stats(totalNull);
  const tdev = Math.abs(totalObs - ts.mean);
  const texceed = totalNull.filter((v) => Math.abs(v - ts.mean) >= tdev).length;
  const nExcluded = axes.filter((a) => a.verdict === "excluded-from-fixed-margin-null").length;
  return {
    version: VERSION5,
    statistic: STATISTIC,
    N,
    d,
    K,
    attempts_per_draw: attempts,
    null_seed: seed,
    null_kind: "fixed-attempt symmetric checkerboard-switch chain with self-loops; every row and column margin preserved (same chain as map.null); not a full Curveball trade sequence",
    margins_preserved: { rows: cert.rowOk, columns: cert.colOk, attempted_total: cert.attempted, accepted_total: cert.accepted },
    axes,
    total: { observed_hits: totalObs, null: { mean: +ts.mean.toFixed(4), sd: +ts.sd.toFixed(4), min: ts.min, max: ts.max, degenerate: ts.sd === 0 }, z_descriptive: ts.sd === 0 ? null : +((totalObs - ts.mean) / ts.sd).toFixed(2), p_two_sided: +((1 + texceed) / (K + 1)).toFixed(4), p_resolution: +p_resolution.toFixed(4) },
    counts: { axes: d, excluded_from_null: nExcluded, not_excluded: axes.filter((a) => a.verdict === "not-excluded").length, null_degenerate: axes.filter((a) => a.null.degenerate).length },
    reading: "Under the fixed-margin null the majority baseline of each axis is identical to the observed one, so observed_minus_null measures predictability from inter-axis dependence beyond margins. 'excluded-from-fixed-margin-null' means the observed hit count sat at the empirical tail resolution of K draws; it does not name what the axis means and does not enter ranking.",
    scope: SCOPE4
  };
}
function validateRequest3(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.map_id) || body.map_id < 1) throw new ApiError(422, "map_id must be a positive integer");
  for (const k of REJECTED_KEYS) if (body[k] !== void 0) throw new ApiError(422, `${k} is not accepted: the trial statistic is fixed and never feeds weights, ranking or admission`, { rejected_keys: REJECTED_KEYS });
  let K = null;
  if (body.K !== void 0) {
    if (!Number.isInteger(body.K) || body.K < MIN_K || body.K > MAX_K) throw new ApiError(422, `K must be an integer in ${MIN_K}..${MAX_K}`);
    K = body.K;
  }
  let null_seed = null;
  if (body.null_seed !== void 0) {
    if (!Number.isInteger(body.null_seed) || body.null_seed < -2147483648 || body.null_seed > 4294967295) throw new ApiError(422, "null_seed must be an integer in -2147483648..4294967295");
    null_seed = body.null_seed;
  }
  return { map_id: body.map_id, K, null_seed };
}
async function axisRedundancyHandler(body, ctx) {
  const v = validateRequest3(body);
  const map = await ctx.loadStoredMap(v.map_id);
  if (!map) throw new ApiError(404, "map not found");
  if (!map.frame || !Array.isArray(map.bits)) throw new ApiError(409, "legacy map has no frozen frame/bits; create a new baseline");
  if (map.bits.length > AXIS_TRIAL_MAX_N) throw new ApiError(422, `axis trial is O(N^2 d K) and is limited to N <= ${AXIS_TRIAL_MAX_N} (map has ${map.bits.length} rows)`, { max_n: AXIS_TRIAL_MAX_N });
  const nullDraw = ctx.nullDraw || ctx.PM && ctx.PM._internal && ctx.PM._internal.nullDraw;
  const mapK = Number.isInteger(map.K) ? map.K : map.null && Number.isInteger(map.null.K) ? map.null.K : 40;
  const K = v.K ?? Math.min(MAX_K, mapK);
  const baseSeed = Number.isInteger(map.seed) ? map.seed : map.frame && map.frame.config && Number.isInteger(map.frame.config.seed) ? map.frame.config.seed : 0;
  const seed = v.null_seed ?? baseSeed ^ NULL_SEED_XOR | 0;
  const trial = axisRedundancyTrial(map.bits, { K, seed, nullDraw });
  const seedB = seed ^ 2135587861 | 0;
  const trialB = axisRedundancyTrial(map.bits, { K, seed: seedB, nullDraw });
  const perAxis = trial.axes.map((a, j) => ({ axis: j, verdict_seed_a: a.verdict, verdict_seed_b: trialB.axes[j].verdict, null_nondegenerate: !a.null.degenerate && !trialB.axes[j].null.degenerate, verdict_reproducible: a.verdict === trialB.axes[j].verdict }));
  const criteria = { null_nondegenerate_all: perAxis.every((x) => x.null_nondegenerate), verdicts_reproducible_all: perAxis.every((x) => x.verdict_reproducible), margins_preserved: trial.margins_preserved.rows && trial.margins_preserved.columns && trialB.margins_preserved.rows && trialB.margins_preserved.columns, n_at_least_100: map.bits.length >= 100 };
  const admitted = Object.values(criteria).every(Boolean);
  trial.admitted = admitted;
  trial.admission = { admitted, scope: "reporting on this frame only; never an axis weight, importance or ranking term", criteria, seeds: { a: seed, b: seedB }, per_axis: perAxis, why_not: admitted ? null : Object.entries(criteria).filter(([, x]) => !x).map(([k]) => k) };
  trial.admission_note = admitted ? "admission criteria met on this frame (see admission.criteria)" : "admission criteria not met on this frame (see admission.why_not); diagnostic record only";
  return {
    trial: true,
    persisted: false,
    map_id: v.map_id,
    frame_id: map.frame_id ?? null,
    instrument_id: map.instrument_id ?? null,
    seed_note: v.null_seed === null ? "null_seed derived as (map.seed XOR 0x5bd1e995) so the trial chain is distinct from the map's own V2 null chain yet reproducible" : "caller-supplied null_seed",
    ...trial,
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false },
    task_verdict: "not-applicable"
  };
}

// lib/consistency-route.mjs
var VERSION6 = "consistency";
var MIN_VARIANTS = 1;
var MAX_VARIANTS = 3;
var MAX_LABEL = 40;
var INHERITED_ONLY3 = ["frame", "d", "K", "T", "seed", "steps", "threshold", "ideal", "preprocessing_id", "vectors", "persist", "labels"];
var REJECTED_KEYS2 = ["augment", "augmentation", "generate_variants", "strength", "gate", "threshold_confidence"];
var SCOPE5 = "Stability diagnostic of one candidate edit under caller-supplied text variants on the same frozen frame. Agreement of the isolated-delta sign across variants means the geometric reading is not sensitive to those particular phrasings; disagreement means it is. Neither outcome authorizes keeping, reverting or deleting; the independent task check still governs. No variant is generated by the API and no consensus delta is computed.";
function ledgerDelta2(l) {
  if (!l) return null;
  if (l.measurement && Number.isFinite(l.measurement.actual_delta)) return l.measurement.actual_delta;
  if (l.ledger && Number.isFinite(l.ledger.actual_delta)) return l.ledger.actual_delta;
  return Number.isFinite(l.actual_delta) ? l.actual_delta : null;
}
var sign3 = (x) => x === null || !Number.isFinite(x) ? "none" : x < 0 ? "negative" : x > 0 ? "positive" : "zero";
function validateRequest4(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.baseline_id) || body.baseline_id < 1) throw new ApiError(422, "baseline_id must be a positive integer");
  const { texts, names, target } = body;
  if (!Array.isArray(texts) || texts.length < 10 || texts.length > MAX_ITEMS) throw new ApiError(422, `texts must be the FULL resulting corpus (with the primary candidate) as 10..${MAX_ITEMS} items`);
  texts.forEach((t, i) => {
    if (typeof t !== "string" || !t.trim()) throw new ApiError(422, `texts[${i}] must be a nonempty string`);
  });
  if (!Array.isArray(names) || names.length !== texts.length) throw new ApiError(422, "names must contain one literal path per text");
  names.forEach((n, i) => {
    if (typeof n !== "string" || !n.length) throw new ApiError(422, `names[${i}] must be a nonempty string`);
  });
  if (new Set(names).size !== names.length) throw new ApiError(422, "names must be unique stable paths");
  if (!target || typeof target !== "object" || Array.isArray(target)) throw new ApiError(422, "target must be an object");
  if (target.action !== "add" && target.action !== "change") throw new ApiError(422, "target.action must be 'add' or 'change'");
  if (typeof target.name !== "string" || !target.name.length) throw new ApiError(422, "target.name must be a nonempty string");
  const ti = names.indexOf(target.name);
  if (ti < 0) throw new ApiError(422, "target.name must be present in names (the primary candidate text is texts[names.indexOf(target.name)])");
  const variants = body.variants;
  if (!Array.isArray(variants) || variants.length < MIN_VARIANTS || variants.length > MAX_VARIANTS) throw new ApiError(422, `variants must contain ${MIN_VARIANTS}..${MAX_VARIANTS} entries {label, text}`);
  const labels = /* @__PURE__ */ new Set(["primary"]);
  variants.forEach((v, i) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new ApiError(422, `variants[${i}] must be an object {label, text}`);
    if (typeof v.label !== "string" || !v.label.trim() || v.label.length > MAX_LABEL) throw new ApiError(422, `variants[${i}].label must be a nonempty string of at most ${MAX_LABEL} chars`);
    if (labels.has(v.label)) throw new ApiError(422, `variants[${i}].label duplicates another label ('primary' is reserved)`);
    labels.add(v.label);
    if (typeof v.text !== "string" || !v.text.trim()) throw new ApiError(422, `variants[${i}].text must be a nonempty string`);
  });
  for (const k of REJECTED_KEYS2) if (body[k] !== void 0) throw new ApiError(422, `${k} is not accepted: the API never generates variants and never gates on agreement`, { rejected_keys: REJECTED_KEYS2 });
  for (const k of INHERITED_ONLY3) if (body[k] !== void 0) throw new ApiError(409, `consistency inherits the baseline's frozen frame and settings; remove ${k} from the request`, { inherited_only: INHERITED_ONLY3 });
  let predicted_delta = null;
  if (body.predicted_delta != null) {
    if (typeof body.predicted_delta !== "number" || !Number.isFinite(body.predicted_delta)) throw new ApiError(422, "predicted_delta must be a finite number");
    predicted_delta = body.predicted_delta;
  }
  return { texts, names, target: { action: target.action, name: target.name }, targetIndex: ti, variants: variants.map((v) => ({ label: v.label, text: v.text })), predicted_delta };
}
function measurementOf(label, r, targetName, textSha) {
  const per = r.comparison && Array.isArray(r.comparison.per_name) ? r.comparison.per_name.find((x) => x.name === targetName) : null;
  const iso = r.comparison && Number.isFinite(r.comparison.isolated_delta) ? r.comparison.isolated_delta : ledgerDelta2(r.math_ledger);
  return {
    label,
    sha256: textSha,
    noop: !!(r.target && r.target.noop),
    isolated_delta: iso,
    isolated_sign: sign3(iso),
    ledger_actual_delta: ledgerDelta2(r.math_ledger),
    bits_changed: per ? per.bits_changed : r.comparison ? r.comparison.bits_changed_total ?? null : null,
    displacement_geodesic: per ? per.displacement_geodesic : null,
    quantization_silent: per ? !!per.quantization_silent : null,
    occupied_sectors_delta: r.comparison && Number.isFinite(r.comparison.occupied_sectors_delta) ? r.comparison.occupied_sectors_delta : null,
    unchanged_anchor_count: r.unchanged_anchor_count,
    frame_id: r.map && r.map.frame_id,
    instrument_id: r.map && r.map.instrument_id,
    comparison_comparable: r.comparison ? r.comparison.comparable !== false : false
  };
}
async function mapConsistencyHandler(body, ctx) {
  const { env, PM: PM2, embedDocuments: embedDocuments2, loadStoredMap } = ctx;
  const preview = ctx.previewHandler || mapPreviewHandler;
  const v = validateRequest4(body);
  const pctx = { env, PM: PM2, embedDocuments: embedDocuments2, loadStoredMap };
  const measurements = [];
  const primarySha = await sha256Hex(v.texts[v.targetIndex]);
  const primary = await preview({ baseline_id: body.baseline_id, texts: v.texts, names: v.names, target: v.target, predicted_delta: v.predicted_delta ?? void 0 }, pctx);
  measurements.push(measurementOf("primary", primary, v.target.name, primarySha));
  for (const variant of v.variants) {
    const texts = v.texts.slice();
    texts[v.targetIndex] = variant.text;
    const sha = await sha256Hex(variant.text);
    const r = await preview({ baseline_id: body.baseline_id, texts, names: v.names, target: v.target, predicted_delta: v.predicted_delta ?? void 0 }, pctx);
    measurements.push(measurementOf(variant.label, r, v.target.name, sha));
  }
  const signs = measurements.map((m) => m.isolated_sign);
  const signSet = [...new Set(signs)];
  const deltas = measurements.map((m) => m.isolated_delta).filter((x) => Number.isFinite(x));
  const distinctTexts = new Set(measurements.map((m) => m.sha256)).size;
  const predSign = sign3(v.predicted_delta);
  const consistency = {
    n_measurements: measurements.length,
    n_distinct_texts: distinctTexts,
    signs,
    sign_set: signSet,
    all_same_sign: signSet.length === 1 && signSet[0] !== "none",
    all_comparable: measurements.every((m) => m.comparison_comparable),
    delta_min: deltas.length ? Math.min(...deltas) : null,
    delta_max: deltas.length ? Math.max(...deltas) : null,
    delta_spread: deltas.length ? Math.max(...deltas) - Math.min(...deltas) : null,
    bits_moved_count: measurements.filter((m) => m.bits_changed > 0).length,
    quantization_silent_count: measurements.filter((m) => m.quantization_silent).length,
    noop_count: measurements.filter((m) => m.noop).length,
    predicted_sign: predSign,
    sign_exact_count: predSign === "none" ? null : measurements.filter((m) => m.isolated_sign === predSign).length,
    reading: signSet.length === 1 && signSet[0] !== "none" ? "the isolated-delta sign is stable across the supplied variants on this frame; this is a stability statement about the reading, not a quality statement about the edit" : "the isolated-delta sign differs across the supplied variants; the geometric reading of this edit is perturbation-sensitive and should be treated as undetermined for planning purposes (it is not evidence against the edit)",
    note: distinctTexts < measurements.length ? "some variants are byte-identical to each other or to the primary; identical texts necessarily agree and add no evidence" : null
  };
  return {
    consistency_check: true,
    persisted: false,
    version: VERSION6,
    baseline_id: body.baseline_id,
    target: v.target,
    measurements,
    consistency,
    comparison_note: v.target.action === "add" ? "ADD comparisons are name-set incomparable in PM.compareMaps; isolated_delta comes from the exact ledger and per-name displacement is unavailable" : "per-name comparison on the inherited frozen frame",
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: true },
    side_effects_note: "each measurement runs through the existing preview path; only the content-hash embedding cache may gain entries",
    scope: SCOPE5,
    task_verdict: "not-tested",
    task_verdict_note: "agreement across variants is not a substitute for the independent task check; it only tells you whether that check would be spent on a stable geometric reading"
  };
}

// lib/azimuth.mjs
var VERSION7 = "azimuth";
var DEFAULT_MODES = Object.freeze([2, 3, 4, 6, 12]);
var MAX_K2 = 400;
var MAX_N4 = AXIS_TRIAL_MAX_N;
var PCA_SEED_XOR = 521288629;
var pcaSeed = (base) => base ^ PCA_SEED_XOR;
function eigengap(rows, PM2, seed) {
  const d = rows[0].length, k = Math.min(3, d);
  const v = PM2._internal.pcaTop(zscoreColumns(rows), k, PM2.mulberry32(seed)).values;
  const f = (x) => +x.toFixed(6);
  return {
    lambda1: f(v[0]),
    lambda2: f(v[1]),
    ...v[2] !== void 0 ? { lambda3: f(v[2]) } : {},
    rel_gap_12: f((v[0] - v[1]) / v[0]),
    ...v[2] !== void 0 ? { rel_gap_23: f((v[1] - v[2]) / v[1]) } : {},
    note: "diagnostic only: small rel_gap_12 means the top-2 eigenplane is nearly degenerate and the sector index reads off an unstable basis; it licenses nothing"
  };
}
var SECOND_SEED_XOR = 2135587861;
var SCOPE6 = "Rotation/reflection-invariant azimuth diagnostics. Binary trials use a fixed-margin checkerboard null and report an atomicity control; continuous trials use a per-column-shuffle null. Every null draw refits PCA2. Holm-corrected, two-sided plus-one tails are reported with n and resolution. The azimuth channel remains admitted:false: binary placement lacks a size-matched de-atomized fixed-margin null, while the continuous column-shuffle null destroys all inter-column dependence and cannot support a negative corpus claim. Sector numbers remain opaque display labels only.";
function mulberry324(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function finiteMatrix(X, label) {
  if (!Array.isArray(X) || X.length < 3 || X.length > MAX_N4) throw new ApiError(422, `${label} must contain 3..${MAX_N4} rows`);
  const D = X[0] && X[0].length;
  if (!Number.isInteger(D) || D < 2 || D > 768 || X.some((r) => !Array.isArray(r) || r.length !== D || r.some((x) => typeof x !== "number" || !Number.isFinite(x)))) throw new ApiError(422, `${label} must be finite rectangular rows, D=2..768`);
  return D;
}
function binaryMatrix(B) {
  const d = finiteMatrix(B, "bits");
  if (B.some((r) => r.some((x) => x !== 0 && x !== 1))) throw new ApiError(409, "stored bits must contain only 0/1");
  return d;
}
function zscoreColumns(rows) {
  const n = rows.length, D = rows[0].length;
  const mu = new Array(D).fill(0), sd = new Array(D).fill(0);
  for (const r of rows) for (let j = 0; j < D; j++) mu[j] += r[j] / n;
  for (const r of rows) for (let j = 0; j < D; j++) sd[j] += (r[j] - mu[j]) ** 2 / Math.max(1, n - 1);
  const scales = sd.map((v) => Math.sqrt(v) || 1);
  return rows.map((r) => r.map((x, j) => (x - mu[j]) / scales[j]));
}
function anglesRefit(rows, seed, PM2) {
  const Z = zscoreColumns(rows);
  const p2 = PM2._internal.pcaTop(Z, 2, PM2.mulberry32(seed));
  return p2.scores.map((r) => Math.atan2(r[1] || 0, r[0] || 0));
}
function rayleighZ(phis, m) {
  let c = 0, s = 0;
  for (const p of phis) {
    c += Math.cos(m * p);
    s += Math.sin(m * p);
  }
  return (c * c + s * s) / phis.length;
}
function largestGap(phis) {
  const a = phis.slice().sort((x, y) => x - y);
  let g = 0;
  for (let i = 1; i < a.length; i++) g = Math.max(g, a[i] - a[i - 1]);
  return Math.max(g, 2 * Math.PI - (a[a.length - 1] - a[0]));
}
function azimuthStats(phis, modes = DEFAULT_MODES) {
  const out = Object.fromEntries(modes.map((m) => [`Z${m}`, rayleighZ(phis, m)]));
  out.largest_gap = largestGap(phis);
  return out;
}
function dedupRows(rows) {
  const seen = /* @__PURE__ */ new Set(), out = [];
  for (const r of rows) {
    const k = r.join(",");
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}
function summary(a) {
  const s = a.slice().sort((x, y) => x - y), n = s.length;
  const mean = s.reduce((x, y) => x + y, 0) / n;
  const sd = n > 1 ? Math.sqrt(s.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, min: s[0], median: s[Math.floor(n / 2)], max: s[n - 1] };
}
function rawTail(a, obs) {
  const up = (1 + a.filter((x) => x >= obs).length) / (a.length + 1);
  const down = (1 + a.filter((x) => x <= obs).length) / (a.length + 1);
  return { tail_up: up, tail_down: down, p_two_sided: Math.min(1, 2 * Math.min(up, down)), resolution: 1 / (a.length + 1) };
}
function holmAdjust(entries, alpha = 0.05) {
  const sorted = entries.map((e, i) => ({ ...e, i })).sort((a, b) => a.p_two_sided - b.p_two_sided);
  let prev = 0;
  for (let r = 0; r < sorted.length; r++) {
    const adj = Math.min(1, Math.max(prev, (sorted.length - r) * sorted[r].p_two_sided));
    sorted[r].p_holm = adj;
    sorted[r].excluded_after_holm = adj <= alpha;
    prev = adj;
  }
  return sorted.sort((a, b) => a.i - b.i).map(({ i, ...e }) => e);
}
function powerFloor(familySize, K, alpha = 0.05) {
  const min_attainable_p_holm = Math.min(1, familySize * 2 / (K + 1));
  return {
    family_size: familySize,
    K,
    alpha,
    min_attainable_p_holm,
    resolvable: min_attainable_p_holm <= alpha,
    K_required_for_resolution: Math.ceil(familySize * 2 / alpha) - 1
  };
}
function evaluate(obs, draws, alpha = 0.05) {
  const keys = Object.keys(obs);
  const floor = powerFloor(keys.length, draws.length, alpha);
  const raw = keys.map((key) => {
    const vals = draws.map((d) => d[key]);
    const s = summary(vals);
    const t = rawTail(vals, obs[key]);
    return { key, observed: obs[key], null: { n: s.n, mean: +s.mean.toFixed(6), sd: +s.sd.toFixed(6), min: s.min, median: s.median, max: s.max, degenerate: s.sd === 0 }, ...t };
  });
  return Object.fromEntries(holmAdjust(raw, alpha).map((r) => [r.key, {
    ...r,
    power_floor: floor,
    verdict: r.null.degenerate ? "null-degenerate" : r.excluded_after_holm ? "excluded-after-holm" : floor.resolvable ? "not-excluded-after-holm" : "unresolvable-at-this-K"
  }]));
}
function runNull(bits, PM2, K, seed, modes, prep = (x) => x) {
  const N = bits.length, d = bits[0].length, rnd = PM2.mulberry32(seed), cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 }, draws = [], sizes = [];
  for (let k = 0; k < K; k++) {
    const M = prep(PM2._internal.nullDraw(bits, 5 * N * d, rnd, cert));
    sizes.push(M.length);
    draws.push(azimuthStats(anglesRefit(M, pcaSeed(seed ^ k + 1), PM2), modes));
  }
  if (!cert.rowOk || !cert.colOk) throw new ApiError(500, "fixed-margin null violated a row or column margin");
  return { draws, sizes, cert };
}
function verdictsReproduce(a, b) {
  return Object.keys(a).every((k) => a[k].verdict === b[k].verdict);
}
function nondegenerate(a, b) {
  return Object.keys(a).every((k) => !a[k].null.degenerate && !b[k].null.degenerate);
}
function binaryAzimuthTrial(map, PM2, { K, seedA, modes = DEFAULT_MODES, alpha = 0.05 }) {
  binaryMatrix(map.bits);
  const seedB = seedA ^ SECOND_SEED_XOR | 0;
  const obsPhi = anglesRefit(map.bits, pcaSeed(map.seed ?? 0), PM2), obs = azimuthStats(obsPhi, modes);
  const A = runNull(map.bits, PM2, K, seedA, modes), B = runNull(map.bits, PM2, K, seedB, modes);
  const evA = evaluate(obs, A.draws, alpha), evB = evaluate(obs, B.draws, alpha);
  const distinct = dedupRows(map.bits), obsDPhi = anglesRefit(distinct, pcaSeed(map.seed ?? 0), PM2), obsD = azimuthStats(obsDPhi, modes);
  const DA = runNull(map.bits, PM2, K, seedA ^ 4919, modes, dedupRows), DB = runNull(map.bits, PM2, K, seedB ^ 4919, modes, dedupRows);
  const deA = evaluate(obsD, DA.draws, alpha), deB = evaluate(obsD, DB.draws, alpha);
  const observedDistinct = distinct.length, exactA = DA.sizes.filter((n) => n === observedDistinct).length, exactB = DB.sizes.filter((n) => n === observedDistinct).length;
  const m1Obs = rayleighZ(obsPhi, 1);
  const m1Draws = (seed) => {
    const N = map.bits.length, d = map.bits[0].length, rnd = PM2.mulberry32(seed), cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 }, out = [];
    for (let k = 0; k < K; k++) {
      const M = PM2._internal.nullDraw(map.bits, 5 * N * d, rnd, cert);
      out.push(rayleighZ(anglesRefit(M, pcaSeed(seed ^ k + 1), PM2), 1));
    }
    return out;
  };
  const m1aa = rawTail(m1Draws(seedA ^ 20817), m1Obs), m1bb = rawTail(m1Draws(seedB ^ 20817), m1Obs);
  const collisionRate = 1 - observedDistinct / map.bits.length;
  const dedupSupportA = summary(DA.sizes), dedupSupportB = summary(DB.sizes);
  const sizeMatched = exactA > 0 && exactB > 0;
  const evidence = {
    null_nondegenerate_all: nondegenerate(evA, evB),
    holm_verdicts_reproducible_all: verdictsReproduce(evA, evB),
    margins_preserved: A.cert.rowOk && A.cert.colOk && B.cert.rowOk && B.cert.colOk,
    deatomized_null_size_matched: sizeMatched,
    n_at_least_100: map.bits.length >= 100
  };
  const blocking_reasons = [
    "binary azimuth is a function of duplicated bit patterns; the unweighted first mode is a radius/multiplicity reweighting of a centered plane",
    sizeMatched ? "the de-atomized comparison is descriptive only; no independent matched null has admitted a corpus-level angular coordinate" : "the observed deduplicated size is outside the fixed-margin null support in both seeds; no size-matched de-atomized null exists"
  ];
  return {
    variant: "binary",
    N: map.bits.length,
    d: map.bits[0].length,
    modes,
    K,
    seeds: { a: seedA, b: seedB },
    multiplicity: { method: "Holm", family: [...modes.map((m) => `Z${m}`), "largest_gap"], alpha },
    observed: obs,
    seed_a: evA,
    seed_b: evB,
    placement_eigengap: eigengap(map.bits, PM2, pcaSeed(map.seed ?? 0)),
    atomicity: {
      distinct_patterns: observedDistinct,
      possible_patterns: 2 ** Math.min(map.bits[0].length, 30),
      collision_count: map.bits.length - observedDistinct,
      collision_fraction: collisionRate,
      m1_audit: { observed: m1Obs, seed_a: m1aa, seed_b: m1bb, admitted: false, reason: "PCA scores are mean-centered, so the radius-weighted first moment is identically zero; unweighted Z1 measures radial/multiplicity reweighting and is structurally confounded" },
      deduplicated: { N: observedDistinct, observed: obsD, seed_a: deA, seed_b: deB, null_distinct_sizes_seed_a: dedupSupportA, null_distinct_sizes_seed_b: dedupSupportB, exact_size_matches: { a: exactA, b: exactB }, size_matched: sizeMatched, admitted: false, reason: sizeMatched ? "descriptive de-atomized control only; no coordinate is admitted by this block" : "no size-matched fixed-margin dedup null exists in these draws; the observed atomicity lies outside null support" }
    },
    evidence,
    admitted: false,
    admission: { admitted: false, blocking_reasons, evidence },
    admission_note: "binary azimuth channel remains not admitted; report the diagnostic and atomicity controls, never a corpus-level angular claim"
  };
}
function shuffleColumns(X, rnd) {
  const M = X.map((r) => r.slice()), N = M.length, D = M[0].length;
  for (let j = 0; j < D; j++) for (let i = N - 1; i > 0; i--) {
    const t = Math.floor(rnd() * (i + 1));
    [M[i][j], M[t][j]] = [M[t][j], M[i][j]];
  }
  return M;
}
function continuousAzimuthTrial(X, PM2, { K, seedA, modes = DEFAULT_MODES, alpha = 0.05, vectorHashesMatchMap }) {
  finiteMatrix(X, "vectors");
  const seedB = seedA ^ SECOND_SEED_XOR | 0, obs = azimuthStats(anglesRefit(X, pcaSeed(0), PM2), modes);
  const draw = (seed) => {
    const rnd = mulberry324(seed), out = [];
    for (let k = 0; k < K; k++) out.push(azimuthStats(anglesRefit(shuffleColumns(X, rnd), pcaSeed(seed ^ k + 1), PM2), modes));
    return out;
  };
  const A = evaluate(obs, draw(seedA), alpha), B = evaluate(obs, draw(seedB), alpha);
  return {
    variant: "continuous",
    N: X.length,
    D: X[0].length,
    modes,
    K,
    seeds: { a: seedA, b: seedB },
    multiplicity: { method: "Holm", family: [...modes.map((m) => `Z${m}`), "largest_gap"], alpha },
    observed: obs,
    seed_a: A,
    seed_b: B,
    placement_eigengap: eigengap(X, PM2, pcaSeed(0)),
    criteria: {
      null_nondegenerate_all: nondegenerate(A, B),
      holm_verdicts_reproducible_all: verdictsReproduce(A, B),
      // computed, never flipped (lesson 29): the handler passes its actual vector-fingerprint check;
      // a direct call without that verification reports false, not a hardcoded true.
      vector_hashes_match_map: vectorHashesMatchMap === true,
      n_at_least_100: X.length >= 100,
      null_adequate_for_negative_claim: false
    },
    admitted: false,
    admission_note: "continuous azimuth channel not admitted: the per-column shuffle null destroys all inter-column covariance and is intentionally over-strong; not-exclusion under it is uninformative. A chart-selection null with a predeclared optimizer/stopping rule is required."
  };
}
function validate2(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.map_id) || body.map_id < 1) throw new ApiError(422, "map_id must be a positive integer");
  const variant = body.variant ?? "binary";
  if (!["binary", "continuous"].includes(variant)) throw new ApiError(422, "variant must be binary or continuous");
  const K = body.K ?? 240;
  if (!Number.isInteger(K) || K < 2 || K > MAX_K2) throw new ApiError(422, `K must be an integer in 2..${MAX_K2}`);
  const seed = body.null_seed ?? 24301;
  if (!Number.isInteger(seed)) throw new ApiError(422, "null_seed must be an integer");
  const modes = body.modes ?? DEFAULT_MODES.slice();
  if (!Array.isArray(modes) || !modes.length || modes.some((m) => !DEFAULT_MODES.includes(m)) || new Set(modes).size !== modes.length) throw new ApiError(422, `modes must be unique members of ${DEFAULT_MODES.join(",")}; m=1 is structurally confounded and rejected`);
  if (body.refit !== void 0 && body.refit !== true) throw new ApiError(422, "refit must be true: every null draw gets its own PCA2");
  if (body.multiplicity !== void 0 && body.multiplicity !== "holm") throw new ApiError(422, "multiplicity must be holm");
  return { map_id: body.map_id, variant, K, seed, modes, vectors: body.vectors };
}
async function azimuthHandler(body, ctx) {
  const v = validate2(body);
  const map = await ctx.loadStoredMap(v.map_id);
  if (!map) throw new ApiError(404, "map not found");
  if (!map.frame || !Array.isArray(map.bits) || !Array.isArray(map.keys)) throw new ApiError(409, "legacy map has no frozen frame/bits/keys; create a new baseline");
  if (map.bits.length > MAX_N4) throw new ApiError(422, `azimuth trials are limited to N <= ${MAX_N4}`);
  let result;
  if (v.variant === "binary") result = binaryAzimuthTrial(map, ctx.PM, { K: v.K, seedA: v.seed, modes: v.modes });
  else {
    const D = finiteMatrix(v.vectors, "vectors");
    if (v.vectors.length !== map.names.length) throw new ApiError(409, `vectors length ${v.vectors.length} != map N ${map.names.length}`);
    const bad = v.vectors.map((r, i) => ctx.PM.hashVec(r) !== map.keys[i].hash ? map.names[i] : null).filter(Boolean);
    if (bad.length) throw new ApiError(409, "vectors do not match the stored map row order/fingerprints", { mismatch_count: bad.length, mismatch_names: bad.slice(0, 10) });
    result = continuousAzimuthTrial(v.vectors, ctx.PM, { K: v.K, seedA: v.seed, modes: v.modes, vectorHashesMatchMap: bad.length === 0 });
  }
  return {
    trial: true,
    persisted: false,
    version: VERSION7,
    map_id: v.map_id,
    frame_id: map.frame_id ?? null,
    instrument_id: map.instrument_id ?? null,
    ...result,
    permanently_not_admitted: ["m=1 / circular variance (centered-plane radius/multiplicity reweighting)", "sector-number corpus claims (origin and width are arbitrary; sectors stay opaque display labels)", "negative corpus claims from the continuous column-shuffle null", "powered-lens claims without a selection null optimizing every null draw"],
    powered_lens: { status: "deferred", reason: "honest lensing requires continuous placement, a selection null that optimizes a lens for every null draw, a predeclared stopping rule and an anti-caustic condition-number cap; none belongs in this read-only endpoint" },
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false },
    task_verdict: "not-applicable",
    scope: SCOPE6
  };
}

// lib/admission.mjs
var VERSION8 = "admission";
var REJECTED2 = ["weights", "rank", "admit", "admitted", "radius", "radii", "score", "threshold", "d", "T", "seed", "frame", "steps"];
var SCOPE7 = "Unified membership trials: each diagnostic's statistics are tested against K fixed-margin null draws under two independent seeds; a diagnostic is admitted for REPORTING on this frame only when every null is non-degenerate, every exclusion verdict reproduces across the two seeds, its exact identities hold, and N >= 100. Admission never feeds ranking, never moves the radius, never authorizes keeping or reverting, and does not transfer to another frame.";
function mulberry325(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function chord4(a, b) {
  let s = 0;
  for (let k = 0; k < 3; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
}
function sh([x, y, z]) {
  return [0.28209479, 0.48860251 * y, 0.48860251 * z, 0.48860251 * x, 1.09254843 * x * y, 1.09254843 * y * z, 0.31539157 * (3 * z * z - 1), 1.09254843 * x * z, 0.54627422 * (x * x - y * y), 0.59004359 * y * (3 * x * x - y * y), 2.89061144 * x * y * z, 0.4570458 * y * (5 * z * z - 1), 0.37317633 * z * (5 * z * z - 3), 0.4570458 * x * (5 * z * z - 1), 1.44530572 * z * (x * x - y * y), 0.59004359 * x * (x * x - 3 * y * y)];
}
function parsevalShares(pts) {
  const m = Array(16).fill(0);
  for (const p of pts) {
    const b = sh(p);
    for (let i = 0; i < 16; i++) m[i] += b[i] / pts.length;
  }
  const E = [m[0] ** 2, 0, 0, 0];
  for (let i = 1; i < 4; i++) E[1] += m[i] ** 2;
  for (let i = 4; i < 9; i++) E[2] += m[i] ** 2;
  for (let i = 9; i < 16; i++) E[3] += m[i] ** 2;
  const tot = E.reduce((a, b) => a + b, 0) || 1;
  return E.map((e) => e / tot);
}
function spectraStats(pts) {
  const E = parsevalShares(pts);
  return { E0: E[0], E1: E[1], E2: E[2], E3: E[3], even: E[0] + E[2], odd: E[1] + E[3] };
}
function radiusCounts(pts) {
  const n = pts.length;
  const clear = pts.map((p, i) => {
    let b = Infinity;
    for (let j = 0; j < n; j++) if (j !== i) {
      const d = chord4(p, pts[j]);
      if (d < b) b = d;
    }
    return b;
  });
  const out = {};
  for (const r of RADII) out["I_" + r.toFixed(3)] = clear.filter((c) => r <= c).length;
  return out;
}
function stats2(v) {
  const n = v.length;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, min: Math.min(...v), max: Math.max(...v) };
}
function tail(values, obs, K) {
  const s = stats2(values);
  const dev = Math.abs(obs - s.mean);
  const exceed = values.filter((x) => Math.abs(x - s.mean) >= dev).length;
  const p = (1 + exceed) / (K + 1);
  return { observed: obs, null_mean: +s.mean.toFixed(6), null_sd: +s.sd.toFixed(6), null_min: s.min, null_max: s.max, z_descriptive: s.sd ? +((obs - s.mean) / s.sd).toFixed(2) : null, p_two_sided: +p.toFixed(4), p_resolution: +(1 / (K + 1)).toFixed(4), verdict: s.sd === 0 ? "null-degenerate" : p <= 1 / (K + 1) + 1e-12 ? "excluded-from-fixed-margin-null" : "not-excluded" };
}
function nullClouds(map, PM2, K, seed) {
  const nullDraw = PM2._internal.nullDraw;
  const ops = PM2._internal.frameOps(map.frame);
  const bits = map.bits;
  const attempts = 5 * bits.length * bits[0].length;
  const rng = mulberry325(seed);
  const cert = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
  const clouds = [];
  for (let k = 0; k < K; k++) clouds.push(nullDraw(bits, attempts, rng, cert).map(ops.toS2));
  if (!cert.rowOk || !cert.colOk) throw new ApiError(500, "null draw violated a margin");
  return { clouds, cert };
}
function trialOnStats(name, obsStats, statFn, map, PM2, K, seedA, seedB, extraCriteria) {
  const A = nullClouds(map, PM2, K, seedA), Bn = nullClouds(map, PM2, K, seedB);
  const keys = Object.keys(obsStats);
  const per = {};
  for (const k of keys) {
    const ta = tail(A.clouds.map((c) => statFn(c)[k]), obsStats[k], K), tb = tail(Bn.clouds.map((c) => statFn(c)[k]), obsStats[k], K);
    per[k] = { observed: obsStats[k], seed_a: ta, seed_b: tb, null_nondegenerate: ta.verdict !== "null-degenerate" && tb.verdict !== "null-degenerate", verdict_reproducible: ta.verdict === tb.verdict };
  }
  const criteria = { null_nondegenerate_all: keys.every((k) => per[k].null_nondegenerate), verdicts_reproducible_all: keys.every((k) => per[k].verdict_reproducible), n_at_least_100: map.names.length >= 100, ...extraCriteria };
  const admitted = Object.values(criteria).every((v) => v === true || v === null || typeof v === "string");
  const why = Object.entries(criteria).filter(([, v]) => v === false).map(([k]) => k);
  return { diagnostic: name, K, seeds: { a: seedA, b: seedB }, margins_preserved: { rows: A.cert.rowOk && Bn.cert.rowOk, columns: A.cert.colOk && Bn.cert.colOk }, per_statistic: per, criteria, admitted, why_not: admitted ? null : why };
}
function validate3(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(422, "request must be an object");
  if (!Number.isSafeInteger(body.map_id) || body.map_id < 1) throw new ApiError(422, "map_id must be a positive integer");
  for (const k of REJECTED2) if (body[k] !== void 0) throw new ApiError(422, `${k} is not accepted: admission trials are read-only on the frozen frame`, { rejected_keys: REJECTED2 });
  let K = null;
  if (body.K !== void 0) {
    if (!Number.isInteger(body.K) || body.K < 2 || body.K > 40) throw new ApiError(422, "K must be an integer in 2..40");
    K = body.K;
  }
  let seed = null;
  if (body.null_seed !== void 0) {
    if (!Number.isInteger(body.null_seed)) throw new ApiError(422, "null_seed must be an integer");
    seed = body.null_seed;
  }
  return { map_id: body.map_id, K, seed };
}
async function admissionHandler(body, ctx) {
  const v = validate3(body);
  const map = await ctx.loadStoredMap(v.map_id);
  if (!map) throw new ApiError(404, "map not found");
  if (!map.frame || !Array.isArray(map.bits) || !Array.isArray(map.pts_full)) throw new ApiError(409, "legacy map has no frozen frame/bits/points; create a new baseline");
  if (map.names.length > AXIS_TRIAL_MAX_N) throw new ApiError(422, `admission trials are limited to N <= ${AXIS_TRIAL_MAX_N}`);
  const PM2 = ctx.PM;
  const K = v.K ?? Math.min(40, Number.isInteger(map.K) ? map.K : map.null && map.null.K || 40);
  const seedA = v.seed ?? (Number.isInteger(map.seed) ? map.seed : 0) ^ 1013904242 | 0;
  const seedB = seedA ^ 2135587861 | 0;
  const ry = await rayleighHandler({ map_id: v.map_id, K, null_seed: v.seed ?? void 0 }, ctx);
  const rayleigh = { diagnostic: "rayleigh", version: ry.version, admitted: ry.admitted, criteria: ry.admission.criteria, why_not: ry.admission.why_not, observed: ry.observed, seeds: ry.admission.seeds };
  const ta = axisRedundancyTrial(map.bits, { K, seed: seedA, nullDraw: PM2._internal.nullDraw }), tb = axisRedundancyTrial(map.bits, { K, seed: seedB, nullDraw: PM2._internal.nullDraw });
  const axes = ta.axes.map((a, j) => ({ axis: j, observed_hits: a.observed_hits, margin_baseline_hits: a.margin_baseline_hits, verdict_seed_a: a.verdict, verdict_seed_b: tb.axes[j].verdict, z_seed_a: a.z_descriptive, z_seed_b: tb.axes[j].z_descriptive, null_nondegenerate: !a.null.degenerate && !tb.axes[j].null.degenerate, verdict_reproducible: a.verdict === tb.axes[j].verdict }));
  const axisCriteria = { null_nondegenerate_all: axes.every((a) => a.null_nondegenerate), verdicts_reproducible_all: axes.every((a) => a.verdict_reproducible), margins_preserved: ta.margins_preserved.rows && ta.margins_preserved.columns && tb.margins_preserved.rows && tb.margins_preserved.columns, n_at_least_100: map.names.length >= 100 };
  const axisAdmitted = Object.values(axisCriteria).every(Boolean);
  const axis_trial = { diagnostic: "axis_trial", version: ta.version, statistic: ta.statistic, K, seeds: { a: seedA, b: seedB }, axes, counts: { excluded_seed_a: ta.counts.excluded_from_null, excluded_seed_b: tb.counts.excluded_from_null }, criteria: axisCriteria, admitted: axisAdmitted, why_not: axisAdmitted ? null : Object.entries(axisCriteria).filter(([, x]) => !x).map(([k]) => k), scope: "per-axis LOO-NN predictability admitted for reporting on this frame only; it never becomes an axis weight, importance or ranking term" };
  const obsSpec = spectraStats(map.pts_full);
  const spectra = trialOnStats("spectra", obsSpec, spectraStats, map, PM2, K, seedA, seedB, { shares_sum_to_one: Math.abs(obsSpec.E0 + obsSpec.E1 + obsSpec.E2 + obsSpec.E3 - 1) < 1e-9 });
  spectra.version = "spectra-trial";
  spectra.physical_claims = { admitted: false, permanent: true, reason: "no dipole, polarizability, response kernel, frequency, lifetime or temperature is measured; Raman/IR selection rules need those observables. Admission here covers the S^2 Parseval shares as geometric statistics only" };
  spectra.heat_eigenvalues = { admitted: false, permanent: true, reason: "l(l+1) are constants of the sphere Laplacian, not statistics of the corpus" };
  spectra.scope = "degree shares E_0..E_3 and even/odd blocks of the point cloud, tested against the fixed-margin null; admitted for reporting only";
  const obsRad = radiusCounts(map.pts_full);
  const radius = trialOnStats("radius_profile", obsRad, radiusCounts, map, PM2, K, seedA, seedB, { canonical_radius_unchanged: CANONICAL_RADIUS === 0.095, canonical_count_matches_map: obsRad["I_0.095"] === map.isolated || map.isolated === void 0 });
  radius.version = "radius-trial";
  radius.grid = RADII.slice();
  radius.canonical_radius = CANONICAL_RADIUS;
  radius.bounds_note = "the profile's robustness `bounds` (`validated:false, certified:false`) describe caller-supplied perturbation assumptions and stay false by construction; they are not part of this trial. The grid is fixed and never reselected.";
  radius.scope = "I(r) counts on the fixed grid admitted for reporting only; the operative radius stays 0.095";
  const azimuth = binaryAzimuthTrial(map, PM2, { K, seedA, modes: DEFAULT_MODES });
  azimuth.diagnostic = "azimuth";
  azimuth.version = "azimuth";
  azimuth.scope = "rotation/reflection-invariant Rayleigh Z_m (m=2,3,4,6,12) plus largest gap; Holm-corrected, two-sided tails. The channel remains not admitted because its binary placement is atomic and lacks a size-matched de-atomized null.";
  const blocks = { rayleigh, axis_trial, spectra, radius_profile: radius, azimuth };
  const summary2 = Object.fromEntries(Object.entries(blocks).map(([k, b]) => [k, b.admitted]));
  return {
    trial: true,
    persisted: false,
    version: VERSION8,
    map_id: v.map_id,
    frame_id: map.frame_id ?? null,
    instrument_id: map.instrument_id ?? null,
    N: map.names.length,
    K,
    summary: summary2,
    ...blocks,
    permanently_not_admitted: ["physical (Raman/IR, dipole, polarizability, lifetime, temperature) readings of the spectra card", "heat eigenvalues l(l+1)", "caller-supplied radius robustness bounds (validated/certified stay false)", "m=1 / circular variance on a centered PCA plane (radius/multiplicity reweighting)", "azimuthal corpus claims without a size-matched de-atomized null or chart-selection null", "sector-number corpus claims (origin and width are arbitrary)", "any use of an admitted statistic as a ranking term, radius, or keep/revert rule"],
    side_effects: { map_storage: false, repository: false, vectorize: false, embedding_cache: false },
    task_verdict: "not-applicable",
    scope: SCOPE7
  };
}

// worker-assembled.mjs
function parseRepoUrl(url) {
  const m = url.trim().match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}
var STOP = new Set(`
about above after again against also among another around because been before being below between both
could does doing done down during each else every from further have having here into just like made make
many more most much must never only other over same should since some such than that their them then there
these they this those through under until upon using very were what when where which while will with within
would your yours
function return import export const class self this none true false null string number value values type
name names default license licensed copyright apache version https http github com org www file files path
line lines list dict object args kwargs param params arguments error errors exception result results test tests
data item items index count total size length text print main init module package public private static void
async await then catch else elif break continue pass raise yield lambda while case switch struct enum impl
uint int32 int64 float bool char byte bytes span code source project readme install usage example examples
corporation reserved rights warranty warranties permission permitted notice disclaimer contributors author authors
spdx identifier bsd-2-clause bsd-3-clause include endif ifndef ifdef define undef typedef extern sizeof boolean
information supported without express implied conditions limitations governing specific language holders
`.split(/\s+/).filter(Boolean));
function tokenize(text) {
  const out = /* @__PURE__ */ new Set();
  const raw = text.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [];
  for (const tok of raw) {
    const parts = tok.split(/[_-]+/).filter((p) => p.length >= 4);
    const cands = parts.length > 1 ? [tok, ...parts] : [tok];
    for (const c of cands) {
      if (STOP.has(c) || /^\d+$/.test(c) || c.length > 32) continue;
      out.add(c);
    }
  }
  return out;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}
function deriveBasis(files, k = 10) {
  const n = files.length;
  const docTokens = files.map((f) => tokenize(f.text));
  const docsOf = /* @__PURE__ */ new Map();
  docTokens.forEach((toks, i) => {
    for (const t of toks) {
      let s = docsOf.get(t);
      if (!s) {
        s = /* @__PURE__ */ new Set();
        docsOf.set(t, s);
      }
      s.add(i);
    }
  });
  const lo = Math.max(3, Math.ceil(0.05 * n)), hi = Math.floor(0.6 * n);
  const candidates = [...docsOf.entries()].filter(([, s]) => s.size >= lo && s.size <= hi).map(([t, s]) => ({ t, s, w: s.size / n * (1 - s.size / n) * (1 + Math.min(t.length, 12) / 24) })).sort((a, b) => b.w - a.w || a.t.localeCompare(b.t));
  const primitives = [];
  const members = [];
  const used = /* @__PURE__ */ new Set();
  for (const c of candidates) {
    if (primitives.length >= k) break;
    if (used.has(c.t)) continue;
    const terms = [c.t];
    used.add(c.t);
    const union = new Set(c.s);
    for (const o of candidates) {
      if (terms.length >= 6) break;
      if (used.has(o.t)) continue;
      if (jaccard(c.s, o.s) >= 0.6) {
        terms.push(o.t);
        used.add(o.t);
        for (const d of o.s) union.add(d);
      }
    }
    if (members.some((m) => jaccard(m, union) >= 0.8)) continue;
    primitives.push({ name: terms.slice(0, 2).join("+"), terms, df: +(union.size / n).toFixed(3) });
    members.push(union);
  }
  const vectors = files.map((_, i) => members.map((m) => m.has(i) ? 1 : 0));
  return { primitives, vectors, vocab_size: docsOf.size, kept_terms: candidates.length };
}
function vectorsFromBasis(files, primitives) {
  return files.map((f) => {
    const toks = tokenize(f.text);
    return primitives.map((p) => p.terms.some((t) => toks.has(t)) ? 1 : 0);
  });
}
function dropPrimitives(raw, exclude) {
  const keepIdx = raw.primitives.map((p, i) => p.terms.some((t) => exclude.has(t)) ? -1 : i).filter((i) => i >= 0);
  return { ...raw, primitives: keepIdx.map((i) => raw.primitives[i]), vectors: raw.vectors.map((r) => keepIdx.map((i) => r[i])) };
}
var AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
function fallback(raw, k, note) {
  const keep = raw.primitives.slice(0, k).map((p, i) => ({ ...p, concept: p.name, reason: "raw cluster (no LLM pass)", source_index: i }));
  return {
    mode: "learned_latent_raw",
    primitives: keep,
    vectors: raw.vectors.map((row) => keep.map((p) => row[p.source_index])),
    pruned: [],
    note
  };
}
function parseDecisions(text) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const norm = (d) => {
    if (Array.isArray(d)) return { index: Number(d[0]), keep: d[1] === true || d[1] === "true", concept: typeof d[2] === "string" ? d[2] : void 0, reason: typeof d[3] === "string" ? d[3] : void 0 };
    if (d && typeof d === "object") return { index: Number(d.index), keep: d.keep === true || d.keep === "true", concept: d.concept, reason: d.reason };
    return null;
  };
  try {
    const parsed = JSON.parse(clean);
    const arr = Array.isArray(parsed) ? parsed : parsed?.decisions;
    if (Array.isArray(arr)) {
      const out2 = arr.map(norm).filter((d) => !!d && Number.isFinite(d.index));
      if (out2.length) return out2;
    }
  } catch {
  }
  const out = [];
  const objRe = /\{[^{}]*"index"\s*:\s*(\d+)[^{}]*"keep"\s*:\s*(true|false)[^{}]*\}/g;
  for (const m of clean.matchAll(objRe)) {
    try {
      const d = norm(JSON.parse(m[0]));
      if (d) out.push(d);
    } catch {
      const c = /"concept"\s*:\s*"([^"]*)"/.exec(m[0]);
      out.push({ index: Number(m[1]), keep: m[2] === "true", concept: c?.[1] });
    }
  }
  const arrRe = /\[\s*(\d+)\s*,\s*(true|false)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\]/g;
  for (const m of clean.matchAll(arrRe)) out.push({ index: Number(m[1]), keep: m[2] === "true", concept: m[3], reason: m[4] });
  return out.length ? out : null;
}
async function aiText(ai, instructions, input, maxTokens = 2048) {
  const res = await ai.run(AI_MODEL, {
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: input }
    ],
    max_tokens: maxTokens
  });
  let t = res;
  if (typeof t === "string") return t;
  if (t && typeof t.response !== "undefined") t = t.response;
  if (t && typeof t.choices !== "undefined") t = t.choices?.[0]?.message?.content;
  return typeof t === "string" ? t : t == null ? "" : JSON.stringify(t);
}
async function refineBasis(ai, raw, files, repo, k = 10) {
  if (raw.primitives.length <= 3) return fallback(raw, k, "too few candidates to refine");
  const candidates = raw.primitives.map((p, i) => {
    const paths = files.map((f, j) => ({ f, j })).filter(({ j }) => raw.vectors[j][i] === 1).slice(0, 4).map(({ f }) => f.path);
    return { index: i, terms: p.terms, df: p.df, sample_paths: paths };
  });
  const instructions = `You curate a latent primitive basis for a code corpus. You receive candidate term clusters mined from the repository ${repo.owner}/${repo.repo}` + (repo.description ? ` ("${repo.description}")` : "") + (repo.language ? `, primary language ${repo.language}` : "") + `. For each candidate decide keep=true if it names a real concept of THIS project (architecture, domain object, mechanism, workflow, guarantee) and keep=false if it is boilerplate: language syntax or stdlib (e.g. __future__, annotations, typing, python, import), license or copyright text, build/packaging noise, generic English, test scaffolding, or a duplicate of a stronger cluster. Give every kept candidate a short snake_case concept label (2-3 words) and a one-line reason under 12 words. Keep at most ${k}. Respond with ONLY this JSON shape, every decision an OBJECT with these four keys, one per candidate: {"decisions":[{"index":0,"keep":true,"concept":"snake_case","reason":"short"}]}. No arrays-of-values, no prose, no code fences.`;
  let decisions = null;
  let lastText = "";
  for (let attempt = 0; attempt < 2 && !decisions; attempt++) {
    let text = "";
    try {
      text = await aiText(ai, attempt === 0 ? instructions : instructions + " Your previous answer was not valid JSON objects. Output strictly the JSON object described, nothing else.", JSON.stringify({ candidates }));
    } catch (e) {
      console.error("basis refine llm failed", e?.message);
      return fallback(raw, k, `llm unavailable (${e && e.message || "unknown"}), used raw clusters`);
    }
    lastText = text;
    decisions = parseDecisions(text);
    if (!decisions) console.error("basis refine parse failed (attempt " + (attempt + 1) + ")", text.slice(0, 200));
  }
  if (!decisions) return fallback(raw, k, `llm output unparseable after retry, used raw clusters (${lastText.slice(0, 60)})`);
  const byIndex = new Map(decisions.map((d) => [d.index, d]));
  const kept = [];
  const pruned = [];
  raw.primitives.forEach((p, i) => {
    const d = byIndex.get(i);
    if (d?.keep && kept.length < k) {
      const concept = (d.concept || p.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || p.name;
      kept.push({ ...p, concept, reason: d.reason || "", source_index: i });
    } else {
      pruned.push({ name: p.name, terms: p.terms, reason: d?.reason || (d ? "pruned" : "no decision returned") });
    }
  });
  if (kept.length < 3) return fallback(raw, k, `llm kept only ${kept.length}; used raw clusters`);
  return {
    mode: "learned_latent+llm_refined",
    primitives: kept,
    vectors: raw.vectors.map((row) => kept.map((p) => row[p.source_index])),
    pruned
  };
}
function mulberry326(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function strSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function jacobiEig(A) {
  const n = A.length;
  const a = A.map((r) => r.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_2, j) => i === j ? 1 : 0));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const values = a.map((r, i) => r[i]);
  const idx = values.map((_, i) => i).sort((x, y) => values[y] - values[x]);
  return {
    values: idx.map((i) => values[i]),
    vectors: idx.map((i) => v.map((row) => row[i]))
  };
}
function solveLinear(A, b) {
  const n = A.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r[n]);
}
function pca2(X) {
  const n = X.length, d = X[0].length;
  const mu = Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mu[j] += row[j] / n;
  const C = Array.from({ length: d }, () => Array(d).fill(0));
  for (const row of X) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++)
    C[i][j] += (row[i] - mu[i]) * (row[j] - mu[j]) / Math.max(1, n - 1);
  const { values, vectors } = jacobiEig(C);
  const total = values.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const pc12 = (Math.max(0, values[0]) + Math.max(0, values[1])) / total;
  const project = (row) => {
    const cent = row.map((x, j) => x - mu[j]);
    return [
      cent.reduce((s, x, j) => s + x * vectors[0][j], 0),
      cent.reduce((s, x, j) => s + x * vectors[1][j], 0)
    ];
  };
  const proj = X.map(project);
  return { proj, pc12, eigenvalues: values, mu, project };
}
function liftPoint(u0, v0, s) {
  const u = u0 * s, v = v0 * s;
  const den = 1 + u * u + v * v;
  return [2 * u / den, 2 * v / den, (u * u + v * v - 1) / den];
}
function liftScale(uv) {
  let maxR = 1e-9;
  for (const [u, v] of uv) maxR = Math.max(maxR, Math.hypot(u, v));
  return 0.9 / maxR;
}
function liftToSphere(uv) {
  const s = liftScale(uv);
  return uv.map(([u, v]) => liftPoint(u, v, s));
}
function shBasis([x, y, z]) {
  return [
    0.28209479,
    0.48860251 * y,
    0.48860251 * z,
    0.48860251 * x,
    1.09254843 * x * y,
    1.09254843 * y * z,
    0.31539157 * (3 * z * z - 1),
    1.09254843 * x * z,
    0.54627422 * (x * x - y * y),
    0.59004359 * y * (3 * x * x - y * y),
    2.89061144 * x * y * z,
    0.4570458 * y * (5 * z * z - 1),
    0.37317633 * z * (5 * z * z - 3),
    0.4570458 * x * (5 * z * z - 1),
    1.44530572 * z * (x * x - y * y),
    0.59004359 * x * (x * x - 3 * y * y)
  ];
}
function ridgeFit(A, y, lambda = 1e-3) {
  const k = A[0].length;
  const AtA = Array.from({ length: k }, () => Array(k).fill(0));
  const Aty = Array(k).fill(0);
  for (let i = 0; i < A.length; i++) {
    for (let a = 0; a < k; a++) {
      Aty[a] += A[i][a] * y[i];
      for (let b = 0; b < k; b++) AtA[a][b] += A[i][a] * A[i][b];
    }
  }
  for (let a = 0; a < k; a++) AtA[a][a] += lambda;
  return solveLinear(AtA, Aty);
}
function r2(y, yhat) {
  const mu = y.reduce((s, v) => s + v, 0) / y.length;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < y.length; i++) {
    ssRes += (y[i] - yhat[i]) ** 2;
    ssTot += (y[i] - mu) ** 2;
  }
  return ssTot < 1e-12 ? 0 : 1 - ssRes / ssTot;
}
function flatBasis([u, v]) {
  return [
    1,
    u,
    v,
    u * u,
    u * v,
    v * v,
    u ** 3,
    u * u * v,
    u * v * v,
    v ** 3,
    u ** 4,
    u ** 3 * v,
    u * u * v * v,
    u * v ** 3,
    v ** 4,
    Math.sin(Math.PI * u) * Math.sin(Math.PI * v)
  ];
}
function holdoutR2(basisRows, y, rand) {
  const n = y.length;
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const nTest = Math.max(2, Math.floor(n * 0.2));
  const test = idx.slice(0, nTest), train = idx.slice(nTest);
  if (train.length < 17) {
    const beta2 = ridgeFit(basisRows, y, 0.01);
    return r2(y, basisRows.map((r) => r.reduce((s, b, j) => s + b * beta2[j], 0)));
  }
  const beta = ridgeFit(train.map((i) => basisRows[i]), train.map((i) => y[i]));
  const yhat = test.map((i) => basisRows[i].reduce((s, b, j) => s + b * beta[j], 0));
  return r2(test.map((i) => y[i]), yhat);
}
function isolatedCount(pts, r = 0.095) {
  let count = 0;
  for (let i = 0; i < pts.length; i++) {
    let near = false;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
      if (d <= r) {
        near = true;
        break;
      }
    }
    if (!near) count++;
  }
  return count;
}
function occupiedCells(pts) {
  const cells = /* @__PURE__ */ new Set();
  for (const [x, y, z] of pts) {
    const zi = Math.min(7, Math.floor((z + 1) / 2 * 8));
    const phi = Math.atan2(y, x);
    const pi_ = Math.min(7, Math.floor((phi + Math.PI) / (2 * Math.PI) * 8));
    cells.add(zi * 8 + pi_);
  }
  return cells.size;
}
var NSS_AXES = [
  "Audience",
  "Inputs",
  "Outputs",
  "Mode",
  "Assumption set",
  "Adjacent problems",
  "Failure modes",
  "Lifecycle",
  "Composition",
  "Knowledge sources",
  "Calibration",
  "Recursion"
];
function geodesic(a, b) {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(d);
}
function fibonacciGrid(n = 400) {
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = ga * i;
    out.push([r * Math.cos(phi), r * Math.sin(phi), z]);
  }
  return out;
}
function surfaceAt(beta, p) {
  return shBasis(p).reduce((s, b, j) => s + b * beta[j], 0);
}
function poleOf(beta, grid) {
  let best = grid[0], bv = -Infinity;
  for (const g of grid) {
    const v = surfaceAt(beta, g);
    if (v > bv) {
      bv = v;
      best = g;
    }
  }
  return { xyz: best, value: bv };
}
function cellOf([x, y, z]) {
  const zi = Math.min(7, Math.floor((z + 1) / 2 * 8));
  const phi = Math.atan2(y, x);
  const pi_ = Math.min(7, Math.floor((phi + Math.PI) / (2 * Math.PI) * 8));
  return { zi, pi: pi_, id: zi * 8 + pi_ };
}
function cellCenter(zi, pi_) {
  const z = -1 + (zi + 0.5) / 4;
  const phi = -Math.PI + (pi_ + 0.5) / 8 * 2 * Math.PI;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(phi), r * Math.sin(phi), z];
}
function nssAxisOf([x, y]) {
  const phi = Math.atan2(y, x);
  return NSS_AXES[Math.min(11, Math.floor((phi + Math.PI) / (2 * Math.PI) * 12))];
}
function sphereFit(X) {
  const { proj, pc12, project } = pca2(X);
  const scale = liftScale(proj);
  const pts = proj.map(([u, v]) => liftPoint(u, v, scale));
  const y = X.map((row) => row.reduce((s, v) => s + v, 0) / row.length);
  const beta = ridgeFit(pts.map(shBasis), y, 0.01);
  return { proj, pts, beta, pc12, scale, project };
}
function pipelineR2(X, seed) {
  const { proj } = pca2(X);
  const pts = liftToSphere(proj);
  const y = X.map((row) => row.reduce((s, v) => s + v, 0) / row.length);
  return holdoutR2(pts.map(shBasis), y, mulberry326(seed));
}
function runFit(items, corpusName, basisNames, fillSize = 5) {
  const X = items.map((it) => it.coverage);
  const n = items.length;
  const seed = strSeed(corpusName);
  const { proj, pc12, eigenvalues } = pca2(X);
  const pts = liftToSphere(proj);
  const y = items.map((it) => it.phi / basisNames.length);
  const sphereRows = pts.map(shBasis);
  const flatRows = proj.map(flatBasis);
  const sphereR2 = holdoutR2(sphereRows, y, mulberry326(seed));
  const flatR2 = holdoutR2(flatRows, y, mulberry326(seed));
  const ablationDelta = sphereR2 - flatR2;
  const K = 200;
  const rand = mulberry326(seed ^ 2654435769);
  const nullR2 = [];
  for (let k = 0; k < K; k++) {
    const Xp = X.map((row) => row.slice());
    for (let j = 0; j < X[0].length; j++) {
      for (let i = n - 1; i > 0; i--) {
        const m = Math.floor(rand() * (i + 1));
        const t = Xp[i][j];
        Xp[i][j] = Xp[m][j];
        Xp[m][j] = t;
      }
    }
    nullR2.push(pipelineR2(Xp, seed + k + 1));
  }
  const nullMean = nullR2.reduce((s, v) => s + v, 0) / K;
  const nullStd = Math.sqrt(nullR2.reduce((s, v) => s + (v - nullMean) ** 2, 0) / (K - 1)) || 1e-9;
  const zNull = (sphereR2 - nullMean) / nullStd;
  const verdict = zNull >= 3 ? `NULL EXCLUDED (z=${zNull.toFixed(2)} >= 3): curvature signal exceeds the column-permutation null` : zNull <= -3 ? `NULL EXCLUDED, INVERTED (z=${zNull.toFixed(2)} <= -3): corpus is significantly LESS structured than its permutation null` : `NOT EXCLUDED (|z|=${Math.abs(zNull).toFixed(2)} < 3): compatible with the column-permutation null`;
  const phiHist = {};
  for (const it of items) phiHist[it.phi] = (phiHist[it.phi] ?? 0) + 1;
  let entropy = 0;
  for (const c of Object.values(phiHist)) {
    const p = c / n;
    entropy -= p * Math.log2(p);
  }
  const coverageMean = y.reduce((s, v) => s + v, 0) / n;
  const primFreq = basisNames.map((_, j) => X.reduce((s, row) => s + row[j], 0) / n);
  const gaps = basisNames.map((p, j) => ({ primitive: p, frequency: +primFreq[j].toFixed(3) })).sort((a, b) => a.frequency - b.frequency);
  const targets = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.phi - b.it.phi).slice(0, 5).map(({ it }) => {
    const missing = basisNames.map((p, j) => ({ p, j, f: primFreq[j] })).filter(({ j }) => it.coverage[j] === 0).sort((a, b) => a.f - b.f);
    const target = missing[0];
    return {
      path: it.path,
      phi: it.phi,
      single_action: target ? `add ${target.p} coverage (corpus frequency ${(target.f * 100).toFixed(0)}%)` : "fully covered"
    };
  });
  const d = basisNames.length;
  const base = sphereFit(X);
  const grid = fibonacciGrid(400);
  const basePole = poleOf(base.beta, grid);
  const baseOccupied = occupiedCells(base.pts);
  const baseIsolated = isolatedCount(base.pts);
  const baseR2 = holdoutR2(base.pts.map(shBasis), y, mulberry326(seed));
  const occ = /* @__PURE__ */ new Map();
  for (const p of base.pts) {
    const c = cellOf(p).id;
    occ.set(c, (occ.get(c) ?? 0) + 1);
  }
  const seen = new Set(X.map((row) => row.join("")));
  const holes = [];
  for (let zi = 0; zi < 8; zi++) for (let pi_ = 0; pi_ < 8; pi_++) {
    const id2 = zi * 8 + pi_;
    if ((occ.get(id2) ?? 0) > 0) continue;
    let ring = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dp = -1; dp <= 1; dp++) {
      if (!dz && !dp) continue;
      const z2 = zi + dz;
      if (z2 < 0 || z2 > 7) continue;
      const p2 = (pi_ + dp + 8) % 8;
      if ((occ.get(z2 * 8 + p2) ?? 0) > 0) ring++;
    }
    if (ring === 0) continue;
    const center = cellCenter(zi, pi_);
    holes.push({ zi, pi: pi_, id: id2, ring, center, fitted: surfaceAt(base.beta, center) });
  }
  holes.sort((a, b) => b.ring - a.ring || b.fitted - a.fitted);
  const patterns = [];
  if (d <= 12) {
    for (let m = 1; m < 1 << d; m++) {
      const vec = Array.from({ length: d }, (_, j) => m >> j & 1);
      if (seen.has(vec.join(""))) continue;
      const [u, v] = base.project(vec);
      patterns.push({ vec, pt: liftPoint(u, v, base.scale) });
    }
  }
  const lenses = holes.slice(0, 5).map((h, rank) => {
    let bestPat = patterns[0], bd = Infinity;
    for (const p of patterns) {
      const dd = geodesic(p.pt, h.center);
      if (dd < bd) {
        bd = dd;
        bestPat = p;
      }
    }
    const covers = bestPat ? basisNames.filter((_, j) => bestPat.vec[j] === 1) : [];
    const omits = bestPat ? basisNames.filter((_, j) => bestPat.vec[j] === 0) : [];
    const k = Math.max(1, Math.round(fillSize));
    let measured = { fill_size: k, pole_shift_geodesic: 0, r2_delta: 0, occupied_delta: 0, isolated_delta: 0 };
    if (bestPat) {
      const X2 = [...X, ...Array.from({ length: k }, () => bestPat.vec.slice())];
      const y2 = X2.map((row) => row.reduce((s, v) => s + v, 0) / d);
      const f2 = sphereFit(X2);
      const pole2 = poleOf(f2.beta, grid);
      measured = {
        fill_size: k,
        pole_shift_geodesic: +geodesic(basePole.xyz, pole2.xyz).toFixed(4),
        r2_delta: +(holdoutR2(f2.pts.map(shBasis), y2, mulberry326(seed)) - baseR2).toFixed(4),
        occupied_delta: occupiedCells(f2.pts) - baseOccupied,
        isolated_delta: isolatedCount(f2.pts) - baseIsolated
      };
    }
    const axis = nssAxisOf(h.center);
    const score = +(h.ring / 8 * (1 - Math.min(1, bd / Math.PI))).toFixed(3);
    return {
      lens: `L${rank + 1}-NSS-${axis.replace(/\s+/g, "_")}`,
      nss_axis: axis,
      gap_cell: { z_band: h.zi, phi_sector: h.pi, ring_occupied: h.ring, center: h.center.map((v) => +v.toFixed(4)) },
      hypothesis: `A file that addresses the NSS "${axis}" axis for this corpus, covering {${covers.join(", ")}}${omits.length ? ` and omitting {${omits.join(", ")}}` : ""}, fills the empty cell at z-band ${h.zi}/\u03C6-sector ${h.pi} (ringed by ${h.ring} occupied cells) and moves the pole and curve rather than piling onto the existing pole.`,
      method: `Author or extend one file along the "${axis}" axis (per negative-skill-space) so its coverage pattern is exactly the target pattern; re-run FIT; compare pole geodesic shift, holdout R\xB2, occupied and isolated counts against this baseline.`,
      parameters: { target_pattern: bestPat?.vec ?? [], covers, omits, nearest_pattern_geodesic: +bd.toFixed(4) },
      measured_on_synthetic_insert: measured,
      verdict: "UNTESTED",
      score
    };
  });
  const pole = { xyz: basePole.xyz.map((v) => +v.toFixed(4)), value: +basePole.value.toFixed(4), nss_axis: nssAxisOf(basePole.xyz) };
  return {
    n_items: n,
    basis: basisNames,
    pc12: +pc12.toFixed(4),
    eigenvalues: eigenvalues.map((v) => +v.toFixed(5)),
    sphere_holdout_r2: +sphereR2.toFixed(4),
    flat_holdout_r2: +flatR2.toFixed(4),
    ablation_delta: +ablationDelta.toFixed(4),
    null: {
      kind: "column_permutation",
      K,
      mean_r2: +nullMean.toFixed(4),
      std_r2: +nullStd.toFixed(4),
      z: +zNull.toFixed(3),
      verdict
    },
    sparse: {
      isolated_count: isolatedCount(pts),
      occupied_cells: occupiedCells(pts),
      total_cells: 64,
      chordal_r: 0.095
    },
    compass: {
      phi_histogram: phiHist,
      shannon_entropy_bits: +entropy.toFixed(4),
      coverage_mean: +coverageMean.toFixed(4)
    },
    primitive_frequencies: Object.fromEntries(basisNames.map((p, j) => [p, +primFreq[j].toFixed(3)])),
    gaps,
    single_action_targets: targets,
    pole,
    holes_on_curve: holes.length,
    lens_ideations: lenses,
    points: items.map((it, i) => ({
      path: it.path,
      phi: it.phi,
      uv: [+proj[i][0].toFixed(4), +proj[i][1].toFixed(4)],
      xyz: pts[i].map((v) => +v.toFixed(4))
    }))
  };
}
var PM = (function() {
  "use strict";
  var VERSION9 = "pointmap/0.2";
  var DEFAULTS = {
    seed: 20260906,
    T: 0.05,
    K: 100,
    d: 9,
    steps: 6e4,
    threshold: "median",
    preprocessing_id: "raw/v1"
  };
  var ISO_RADIUS3 = 0.095;
  var DIAGNOSTICS_VERSION = "wayfinder-math";
  var SECTORS2 = 12;
  var FLUX_TOL = 1e-9;
  function mulberry327(a) {
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function fnv1a64(bytes) {
    let h = 0xcbf29ce484222325n;
    for (const x of bytes) {
      h ^= BigInt(x);
      h = h * 0x100000001b3n & 0xffffffffffffffffn;
    }
    return h.toString(16).padStart(16, "0");
  }
  const hashVec = (v) => fnv1a64(new Uint8Array(new Float32Array(v).buffer));
  const hashStr = (s) => fnv1a64(new TextEncoder().encode(s));
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") {
      const ks = Object.keys(value).sort();
      return "{" + ks.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("canonical: non-finite number");
    return JSON.stringify(value === void 0 ? null : value);
  }
  const hashObj = (o) => hashStr(canonical(o));
  function jacobiEig2(A) {
    const n = A.length;
    const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_2, j) => i === j ? 1 : 0));
    const M = A.map((r) => r.slice());
    for (let sweep = 0; sweep < 80; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] ** 2;
      if (off < 1e-14) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(M[p][q]) < 1e-15) continue;
        const th = (M[q][q] - M[p][p]) / (2 * M[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const a = M[k][p], b = M[k][q];
          M[k][p] = c * a - s * b;
          M[k][q] = s * a + c * b;
        }
        for (let k = 0; k < n; k++) {
          const a = M[p][k], b = M[q][k];
          M[p][k] = c * a - s * b;
          M[q][k] = s * a + c * b;
        }
        for (let k = 0; k < n; k++) {
          const a = V[k][p], b = V[k][q];
          V[k][p] = c * a - s * b;
          V[k][q] = s * a + c * b;
        }
      }
    }
    const idx = M.map((_, i) => i).sort((a, b) => M[b][b] - M[a][a]);
    return { values: idx.map((i) => M[i][i]), vectors: idx.map((i) => V.map((r) => r[i])) };
  }
  function center(X) {
    const n = X.length, D = X[0].length, mu = new Float64Array(D);
    for (const r of X) for (let j = 0; j < D; j++) mu[j] += r[j] / n;
    return { Xc: X.map((r) => r.map((x, j) => x - mu[j])), mu: Array.from(mu) };
  }
  function pcaTop(X, k, r) {
    const { Xc, mu } = center(X);
    const n = Xc.length, D = Xc[0].length;
    k = Math.max(1, Math.min(k, D, n - 1));
    let axes = [], values = [];
    if (D <= 40) {
      const C = Array.from({ length: D }, () => Array(D).fill(0));
      for (const row of Xc) for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) C[i][j] += row[i] * row[j] / Math.max(1, n - 1);
      const e = jacobiEig2(C);
      axes = e.vectors.slice(0, k);
      values = e.values;
    } else {
      const rr = r || mulberry327(1);
      const tot = Xc.reduce((s, row) => s + row.reduce((a, x) => a + x * x, 0), 0) / Math.max(1, n - 1);
      for (let a = 0; a < k; a++) {
        let v = Array.from({ length: D }, () => gauss(rr));
        for (let it = 0; it < 40; it++) {
          const w = new Float64Array(D);
          for (const row of Xc) {
            let dot = 0;
            for (let j = 0; j < D; j++) dot += row[j] * v[j];
            for (let j = 0; j < D; j++) w[j] += row[j] * dot;
          }
          for (const u of axes) {
            let d2 = 0;
            for (let j = 0; j < D; j++) d2 += w[j] * u[j];
            for (let j = 0; j < D; j++) w[j] -= d2 * u[j];
          }
          let nrm = 0;
          for (let j = 0; j < D; j++) nrm += w[j] * w[j];
          nrm = Math.sqrt(nrm) || 1;
          v = Array.from(w, (x) => x / nrm);
        }
        let lam = 0;
        for (const row of Xc) {
          let dot = 0;
          for (let j = 0; j < D; j++) dot += row[j] * v[j];
          lam += dot * dot;
        }
        values.push(lam / Math.max(1, n - 1));
        axes.push(v);
      }
      values.push(Math.max(0, tot - values.reduce((a, b) => a + b, 0)));
    }
    axes = axes.map((a) => {
      let m = 0;
      for (let j = 1; j < a.length; j++) if (Math.abs(a[j]) > Math.abs(a[m])) m = j;
      return a[m] < 0 ? a.map((x) => -x) : a;
    });
    const proj = (row) => axes.map((a) => a.reduce((s, aj, j) => s + aj * (row[j] - mu[j]), 0));
    return { scores: X.map(proj), proj, values, axes, mu };
  }
  const clamp1 = (x) => Math.max(-1, Math.min(1, x));
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const chord5 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const geo = (a, b) => Math.acos(clamp1(dot3(a, b)));
  function unit(p) {
    const n = Math.hypot(p[0], p[1], p[2]);
    return n > 0 ? [p[0] / n, p[1] / n, p[2] / n] : [0, 0, 1];
  }
  function lift(u0, v0, s) {
    const u = u0 * s, v = v0 * s, den = 1 + u * u + v * v;
    return [2 * u / den, 2 * v / den, (u * u + v * v - 1) / den];
  }
  function slerp(p0, q0, t) {
    const p = unit(p0), q = unit(q0);
    const c = clamp1(dot3(p, q));
    if (c > 1 - 1e-12) return p.slice();
    if (c < -1 + 1e-12) {
      const ref = Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const o = unit([p[1] * ref[2] - p[2] * ref[1], p[2] * ref[0] - p[0] * ref[2], p[0] * ref[1] - p[1] * ref[0]]);
      const O2 = Math.PI, ca = Math.cos(t * O2), sa = Math.sin(t * O2);
      return unit([ca * p[0] + sa * o[0], ca * p[1] + sa * o[1], ca * p[2] + sa * o[2]]);
    }
    const O = Math.acos(c), sO = Math.sin(O);
    const a = Math.sin((1 - t) * O) / sO, b = Math.sin(t * O) / sO;
    return unit([a * p[0] + b * q[0], a * p[1] + b * q[1], a * p[2] + b * q[2]]);
  }
  const sectorIndex = ([x, y]) => Math.min(SECTORS2 - 1, Math.floor((Math.atan2(y, x) + Math.PI) / (2 * Math.PI) * SECTORS2));
  function sectorCountsOf(pts) {
    const sc = Array(SECTORS2).fill(0);
    for (const p of pts) sc[sectorIndex(p)]++;
    return sc;
  }
  function isolatedCount2(pts, rr) {
    rr = rr === void 0 ? ISO_RADIUS3 : rr;
    return pts.filter((p, i) => !pts.some((q, j) => j !== i && chord5(p, q) < rr)).length;
  }
  function reqInt(v, lo, hi, label) {
    if (!Number.isInteger(v) || v < lo || v > hi) throw new RangeError(label + " must be an integer in " + lo + ".." + hi + " (got " + String(v) + ")");
    return v;
  }
  function validateStrings(arr, label, N) {
    if (arr === void 0 || arr === null) return void 0;
    if (!Array.isArray(arr)) throw new TypeError(label + " must be an array of strings");
    if (arr.length !== N) throw new RangeError(label + " length " + arr.length + " does not match N=" + N + " (no silent filtering)");
    arr.forEach((s, i) => {
      if (typeof s !== "string" || s.length === 0) throw new TypeError(label + "[" + i + "] must be a non-empty string");
    });
    return arr.slice();
  }
  function validate4(X, opts) {
    if (!Array.isArray(X) || !Array.isArray(X[0])) throw new TypeError("X must be a rectangular array of numeric rows");
    const N = X.length;
    if (N < 10 || N > 4e3) throw new RangeError("N must be in 10..4000 (got " + N + ")");
    const D = X[0].length;
    if (!Number.isInteger(D) || D < 2 || D > 768) throw new RangeError("D must be an integer in 2..768 (got " + D + ")");
    for (let i = 0; i < N; i++) {
      const row = X[i];
      if (!Array.isArray(row) || row.length !== D) throw new RangeError("X is ragged: row " + i + " has length " + (Array.isArray(row) ? row.length : "n/a") + ", expected " + D);
      for (let j = 0; j < D; j++) {
        const v = row[j];
        if (typeof v !== "number" || !Number.isFinite(v)) throw new RangeError("X[" + i + "][" + j + "] must be a finite number (got " + String(v) + ")");
      }
    }
    const rank = Math.min(D, N - 1);
    const dReq = opts.d === void 0 ? DEFAULTS.d : opts.d;
    reqInt(dReq, 2, 24, "d");
    const d = Math.min(dReq, rank);
    if (d < 2) throw new RangeError("d collapsed below 2: the rank of this cloud is " + rank);
    const K = opts.K === void 0 ? DEFAULTS.K : opts.K;
    reqInt(K, 2, 200, "K");
    const steps = opts.steps === void 0 ? DEFAULTS.steps : opts.steps;
    reqInt(steps, 100, 1e6, "steps");
    const seed = opts.seed === void 0 ? DEFAULTS.seed : opts.seed;
    if (!Number.isInteger(seed)) throw new TypeError("seed must be an integer (got " + String(seed) + ")");
    const T = opts.T === void 0 ? DEFAULTS.T : opts.T;
    if (typeof T !== "number" || !Number.isFinite(T) || T <= 0) throw new RangeError("T must be a finite number > 0 (got " + String(T) + ")");
    const threshold = opts.threshold === void 0 ? DEFAULTS.threshold : opts.threshold;
    if (threshold !== "median" && threshold !== "zero") throw new RangeError('threshold must be "median" or "zero" (got ' + String(threshold) + ")");
    const preprocessing_id = opts.preprocessing_id === void 0 ? DEFAULTS.preprocessing_id : opts.preprocessing_id;
    if (typeof preprocessing_id !== "string" || !preprocessing_id.length) throw new TypeError("preprocessing_id must be a non-empty string");
    const names = validateStrings(opts.names, "names", N);
    const labels = validateStrings(opts.labels, "labels", N);
    return { N, D, d, K, T, seed, steps, threshold, preprocessing_id, names, labels };
  }
  function zstats(B) {
    const n = B.length, d = B[0].length;
    const mu = Array(d).fill(0), sd = Array(d).fill(0);
    for (const r of B) for (let j = 0; j < d; j++) mu[j] += r[j] / n;
    for (const r of B) for (let j = 0; j < d; j++) sd[j] += (r[j] - mu[j]) ** 2 / n;
    return { mu, sd: sd.map(Math.sqrt) };
  }
  function buildFrame(X, cfg) {
    const p = pcaTop(X, cfg.d, mulberry327(cfg.seed));
    const d = p.axes.length;
    const thresholds = Array.from({ length: d }, (_, j) => {
      if (cfg.threshold === "zero") return 0;
      const col = p.scores.map((row) => row[j]).slice().sort((a, b) => a - b);
      return col[Math.floor(col.length / 2)];
    });
    const bits = p.scores.map((row) => row.map((x, j) => x > thresholds[j] ? 1 : 0));
    const zs = zstats(bits);
    const Z = bits.map((r) => r.map((x, j) => (x - zs.mu[j]) / (zs.sd[j] || 1)));
    const p2 = pcaTop(Z, 2, mulberry327(cfg.seed ^ 1542469173));
    let maxR = 1e-9;
    for (const row of p2.scores) maxR = Math.max(maxR, Math.hypot(row[0] || 0, row[1] || 0));
    const axes2 = p2.axes.length === 2 ? p2.axes : [p2.axes[0], Array.from({ length: d }, (_, j) => j === 1 ? 1 : 0)];
    return {
      version: VERSION9,
      config: { d, threshold: cfg.threshold, seed: cfg.seed },
      D: X[0].length,
      input_pca: { mu: p.mu.slice(), axes: p.axes.map((a) => a.slice()), thresholds },
      placement: { bit_mu: zs.mu.slice(), bit_sd: zs.sd.slice(), pca_mu: p2.mu.slice(), pca_axes: axes2.map((a) => a.slice()), scale: 0.9 / maxR }
    };
  }
  function assertFrameCompatible(frame, cfg, what) {
    const bad = (m) => {
      throw new RangeError((what || "frame drift") + ": " + m);
    };
    if (!frame || typeof frame !== "object") bad("frame is not an object");
    if (frame.version !== VERSION9) bad("version " + frame.version + " != " + VERSION9);
    if (frame.D !== cfg.D) bad("input D " + cfg.D + " != frame D " + frame.D);
    if (!frame.config) bad("frame.config missing");
    if (frame.config.threshold !== cfg.threshold) bad("threshold " + cfg.threshold + " != frame threshold " + frame.config.threshold);
    const fp = frame.input_pca, pl = frame.placement;
    if (!fp || !pl) bad("frame is missing input_pca/placement");
    if (!Array.isArray(fp.mu) || !Array.isArray(fp.axes) || !Array.isArray(fp.thresholds)) bad("frame.input_pca must carry arrays mu, axes, thresholds");
    if (!Array.isArray(pl.bit_mu) || !Array.isArray(pl.bit_sd) || !Array.isArray(pl.pca_mu) || !Array.isArray(pl.pca_axes)) bad("frame.placement must carry arrays bit_mu, bit_sd, pca_mu, pca_axes");
    if (!Number.isInteger(frame.config.d) || frame.config.d < 2) bad("frame.config.d must be an integer >= 2 (got " + String(frame.config.d) + ")");
    if (fp.axes.length !== frame.config.d || fp.thresholds.length !== frame.config.d) bad("frame.config.d " + frame.config.d + " disagrees with the stored axes/thresholds");
    if (pl.bit_mu.length !== frame.config.d || pl.bit_sd.length !== frame.config.d || pl.pca_mu.length !== frame.config.d) bad("frame.config.d " + frame.config.d + " disagrees with the stored placement");
    if (fp.mu.length !== cfg.D) bad("frame input mean has length " + fp.mu.length + ", input D is " + cfg.D);
    if (pl.pca_axes.length !== 2) bad("placement needs exactly 2 PCA axes");
    if (!Number.isFinite(pl.scale) || pl.scale <= 0) bad("placement scale is not a positive finite number");
    if (frame.config.seed !== cfg.seed) bad("seed " + cfg.seed + " != frame seed " + frame.config.seed + " (a frame records the seed it was fitted with)");
    const finiteVec = (v, label, len) => {
      if (!Array.isArray(v) || v.length !== len) bad(label + " must be an array of " + len + " numbers (got " + (Array.isArray(v) ? v.length : typeof v) + ")");
      for (let i = 0; i < v.length; i++) {
        const x = v[i];
        if (typeof x !== "number" || !Number.isFinite(x)) bad(label + "[" + i + "] is not a finite number (got " + String(x) + ")");
      }
    };
    finiteVec(fp.mu, "frame.input_pca.mu", cfg.D);
    finiteVec(fp.thresholds, "frame.input_pca.thresholds", frame.config.d);
    fp.axes.forEach((a, j) => finiteVec(a, "frame.input_pca.axes[" + j + "]", cfg.D));
    finiteVec(pl.bit_mu, "frame.placement.bit_mu", frame.config.d);
    finiteVec(pl.bit_sd, "frame.placement.bit_sd", frame.config.d);
    finiteVec(pl.pca_mu, "frame.placement.pca_mu", frame.config.d);
    pl.pca_axes.forEach((a, j) => finiteVec(a, "frame.placement.pca_axes[" + j + "]", frame.config.d));
    return frame;
  }
  function frameOps(frame) {
    const fp = frame.input_pca, pl = frame.placement, d = frame.config.d;
    const bitsOf = (row) => fp.axes.map((a, j) => {
      let s = 0;
      for (let k = 0; k < a.length; k++) s += a[k] * (row[k] - fp.mu[k]);
      return s > fp.thresholds[j] ? 1 : 0;
    });
    const z = (b) => b.map((x, j) => (x - pl.bit_mu[j]) / (pl.bit_sd[j] || 1));
    const proj = (zz) => pl.pca_axes.map((a) => {
      let s = 0;
      for (let j = 0; j < zz.length; j++) s += a[j] * (zz[j] - pl.pca_mu[j]);
      return s;
    });
    const toS2 = (b) => {
      const uv = proj(z(b));
      return lift(uv[0], uv[1], pl.scale);
    };
    return { d, bitsOf, z, proj, toS2, pole: toS2(Array(d).fill(1)) };
  }
  function V2(B) {
    const zs = zstats(B);
    const d = B[0].length, n = B.length;
    const Z = B.map((r) => r.map((x, j) => (x - zs.mu[j]) / (zs.sd[j] || 1)));
    const C = Array.from({ length: d }, () => Array(d).fill(0));
    for (const r of Z) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] += r[i] * r[j] / Math.max(1, n - 1);
    const ev = jacobiEig2(C).values.map((x) => Math.max(0, x));
    const trace = ev.reduce((a, b) => a + b, 0);
    if (!(trace > 1e-12)) return 0;
    return Math.min(1, ((ev[0] || 0) + (ev[1] || 0)) / trace);
  }
  function nullDraw(B, attempts, r, cert) {
    const M = B.map((x) => x.slice());
    const n = M.length, d = M[0].length;
    const rs = M.map((x) => x.reduce((a, b) => a + b, 0));
    const cs = Array.from({ length: d }, (_, j) => M.reduce((a, x) => a + x[j], 0));
    let accepted = 0;
    for (let t = 0; t < attempts; t++) {
      const i = Math.floor(r() * n), j = Math.floor(r() * n), a = Math.floor(r() * d), b = Math.floor(r() * d);
      if (i === j || a === b) continue;
      if (M[i][a] === 1 && M[i][b] === 0 && M[j][a] === 0 && M[j][b] === 1) {
        M[i][a] = 0;
        M[i][b] = 1;
        M[j][a] = 1;
        M[j][b] = 0;
        accepted++;
      }
    }
    const rs2 = M.map((x) => x.reduce((a, b) => a + b, 0));
    const cs2 = Array.from({ length: d }, (_, j) => M.reduce((a, x) => a + x[j], 0));
    if (cert) {
      cert.rowOk = cert.rowOk && rs.every((v, i) => v === rs2[i]);
      cert.colOk = cert.colOk && cs.every((v, j) => v === cs2[j]);
      cert.attempted += attempts;
      cert.accepted += accepted;
    }
    return M;
  }
  const logC = (n, k) => {
    let s = 0;
    for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
    return s;
  };
  function stationary(F, d, T) {
    const lw = Array.from({ length: d + 1 }, (_, k) => -F(k) / T);
    const finite = lw.filter(Number.isFinite);
    const m = finite.length ? Math.max.apply(null, finite) : 0;
    const w = lw.map((x) => Math.exp(x - m));
    const S = w.reduce((a, b) => a + b, 0) || 1;
    return w.map((x) => x / S);
  }
  function assertFluxIdentity(residuals, tol) {
    const worst = residuals.reduce((b, r) => Math.abs(r.residual) > Math.abs(b.residual) ? r : b, { k: -1, residual: 0 });
    if (Math.abs(worst.residual) > tol) {
      throw new Error("detailed-balance identity failed at rung " + worst.k + ": |pi(k)a_up - pi(k+1)a_down| = " + Math.abs(worst.residual).toExponential(3) + " > " + tol);
    }
    return { ok: true, max_abs_residual: Math.abs(worst.residual), worst_rung: worst.k };
  }
  function compass(Phi, d, T, steps, r) {
    const F = (k2) => Phi[k2] - T * logC(d, k2);
    const pi = stationary(F, d, T);
    const aUp = (k2) => 0.5 * Math.min(1, Math.exp(-(F(k2 + 1) - F(k2)) / T));
    const aDn = (k2) => 0.5 * Math.min(1, Math.exp(-(F(k2 - 1) - F(k2)) / T));
    const residuals = Array.from({ length: d }, (_, k2) => ({ k: k2, residual: pi[k2] * aUp(k2) - pi[k2 + 1] * aDn(k2 + 1) }));
    const identity = assertFluxIdentity(residuals, FLUX_TOL);
    let k = Math.floor(d / 2);
    const occ = Array(d + 1).fill(0), up = Array(d).fill(0), dn = Array(d).fill(0);
    let acc = 0, maxdk = 0;
    for (let s = 0; s < steps; s++) {
      const dir = r() < 0.5 ? 1 : -1;
      const k2 = k + dir;
      if (k2 < 0 || k2 > d) {
        occ[k]++;
        continue;
      }
      const alpha = Math.min(1, Math.exp(-(F(k2) - F(k)) / T));
      if (r() < alpha) {
        if (dir > 0) up[k]++;
        else dn[k2]++;
        maxdk = Math.max(maxdk, Math.abs(k2 - k));
        k = k2;
        acc++;
      }
      occ[k]++;
    }
    const fz = up.map((u, i) => ({ k: i, up: u, down: dn[i], z: (u - dn[i]) / (Math.sqrt(u + dn[i]) || 1) }));
    return {
      T,
      steps,
      pi,
      kmean_analytic: pi.reduce((s, p, i) => s + p * i, 0),
      kmean_empirical: occ.reduce((s, c, i) => s + c / steps * i, 0),
      acceptance: acc / steps,
      maxdk,
      flux_identity_analytic: { ok: identity.ok, max_abs_residual: identity.max_abs_residual, worst_rung: identity.worst_rung, tol: FLUX_TOL, note: "pi(k)*a_up(k) = pi(k+1)*a_down(k+1) evaluated on the law; a failure throws before any result is returned" },
      empirical_flux: { per_rung: fz, maxAbsZ: Math.max.apply(null, fz.map((f) => Math.abs(f.z))), note: "finite-run measurement of net flux; descriptive only, and not the identity" }
    };
  }
  function crossover(Phi, d) {
    const arg = (T) => {
      let b = 0, bv = -1e9;
      for (let k = 0; k <= d; k++) {
        const v = -(Phi[k] - T * logC(d, k)) / T;
        if (v > bv) {
          bv = v;
          b = k;
        }
      }
      return b;
    };
    let lo = 1e-4, hi = 5;
    if (arg(lo) !== d) return null;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (arg(m) === d) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  }
  function sh2([x, y, z]) {
    return [0.28209479, 0.48860251 * y, 0.48860251 * z, 0.48860251 * x, 1.09254843 * x * y, 1.09254843 * y * z, 0.31539157 * (3 * z * z - 1), 1.09254843 * x * z, 0.54627422 * (x * x - y * y), 0.59004359 * y * (3 * x * x - y * y), 2.89061144 * x * y * z, 0.4570458 * y * (5 * z * z - 1), 0.37317633 * z * (5 * z * z - 3), 0.4570458 * x * (5 * z * z - 1), 1.44530572 * z * (x * x - y * y), 0.59004359 * x * (x * x - 3 * y * y)];
  }
  function parsevalShares2(pts) {
    const m = Array(16).fill(0);
    for (const p of pts) {
      const b = sh2(p);
      for (let i = 0; i < 16; i++) m[i] += b[i] / pts.length;
    }
    const E = [m[0] ** 2, 0, 0, 0];
    for (let i = 1; i < 4; i++) E[1] += m[i] ** 2;
    for (let i = 4; i < 9; i++) E[2] += m[i] ** 2;
    for (let i = 9; i < 16; i++) E[3] += m[i] ** 2;
    const tot = E.reduce((a, b) => a + b, 0) || 1;
    return E.map((e) => e / tot);
  }
  const heatExp = (l) => l * (l + 1);
  function synth(N, D, seed) {
    const r = mulberry327(seed);
    const centers = [0, 1, 2].map(() => Array.from({ length: D }, () => gauss(r) * 2));
    return Array.from({ length: N }, (_, i) => centers[i % 3].map((m, j) => m + gauss(r) * (j < 6 ? 0.6 : 1.4)));
  }
  var NSS_LENS_AXES = ["Audience", "Inputs", "Outputs", "Mode", "Assumption set", "Adjacent problems", "Failure modes", "Lifecycle", "Composition", "Knowledge sources", "Calibration", "Recursion"];
  function buildLadder(ctx) {
    const { bits, ops, pts, gaps, d, atoms, keys, frame_id, seed, threshold, cfg } = ctx;
    const baseSectors = sectorCountsOf(pts);
    const baseOcc = baseSectors.filter((c) => c > 0).length;
    const baseIso = isolatedCount2(pts);
    const measure = (B2) => {
      const pts2 = B2.map(ops.toS2);
      const sc = sectorCountsOf(pts2);
      return {
        pole_shift_geodesic: 0,
        // frozen frame: the pole belongs to the frame, not to the edit
        occupied_sectors_delta: sc.filter((c) => c > 0).length - baseOcc,
        isolated_delta: isolatedCount2(pts2) - baseIso,
        frozen_frame: true
      };
    };
    const nameOf = (i) => {
      const k = keys[i];
      return k && k.name ? k.name : k && k.label ? k.label : "item #" + i;
    };
    const baseIsoIdx = pts.map((p, i) => pts.some((q, j) => j !== i && chord5(p, q) < ISO_RADIUS3) ? -1 : i).filter((i) => i >= 0);
    const joinsOf = (B2) => {
      const pts2 = B2.map(ops.toS2);
      return baseIsoIdx.filter((i) => pts2.some((q, j) => j !== i && chord5(pts2[i], q) < ISO_RADIUS3)).map(nameOf);
    };
    const newRowIsolated = (B2) => {
      const pts2 = B2.map(ops.toS2);
      const n = pts2.length - 1;
      return !pts2.some((q, j) => j !== n && chord5(pts2[n], q) < ISO_RADIUS3);
    };
    const bitName = (j) => "bit " + j + " (frozen PCA axis " + j + " " + (threshold === "zero" ? "> 0" : "> frozen median") + ")";
    const ham = (a, b) => a.reduce((acc, v, j) => acc + (v !== b[j] ? 1 : 0), 0);
    const exemplars = (target, pred, n) => bits.map((r, k) => ({ k, h: ham(r, target) })).filter((o) => pred(o.k)).sort((a, b) => a.h - b.h).slice(0, n || 3).map((o) => nameOf(o.k));
    const exemplarsH = (target, pred, n) => bits.map((r, k) => ({ k, h: ham(r, target) })).filter((o) => pred(o.k)).sort((a, b) => a.h - b.h).slice(0, n || 3).map((o) => nameOf(o.k) + " (h=" + o.h + ")");
    const clearanceOf = (i) => Math.min.apply(null, pts.map((q, j) => j === i ? Infinity : chord5(pts[i], q)));
    const idxOf = (nm) => keys.findIndex((k, i) => nameOf(i) === nm);
    const joinBudget = (nm) => {
      const i = idxOf(nm);
      if (i < 0) return nm;
      const c = clearanceOf(i);
      return nm + " (nearest neighbour " + c.toFixed(3) + " away; the new embedding must land within " + ISO_RADIUS3 + " of it)";
    };
    const poleGap = (b) => chord5(ops.toS2(b), ops.pole);
    const TAIL = "Inspect the actual content of those files; do not take any destructive action. Keep only on the independent verifier's frozen check \u2014 a matching sign does not mean the edit was good. Contract: /AGENT.md";
    const adverse = (m) => m.isolated_delta > 0 ? " ADVERSE on this frame: " : " ";
    const cands = [];
    const patterns = [];
    if (d <= 12) {
      for (let m = 0; m < 1 << d; m++) patterns.push(Array.from({ length: d }, (_, j) => m >> j & 1));
    } else {
      const rp = mulberry327(seed + 99);
      for (let m = 0; m < 2e3; m++) patterns.push(Array.from({ length: d }, () => rp() < 0.5 ? 1 : 0));
    }
    const patPts = patterns.map(ops.toS2);
    const meanZ = pts.reduce((a, p) => a + p[2], 0) / pts.length;
    const thin = baseSectors.map((c, sIdx) => ({ sIdx, c })).sort((a, b) => a.c - b.c).slice(0, 4);
    for (const { sIdx, c } of thin) {
      const phi = -Math.PI + (sIdx + 0.5) / SECTORS2 * 2 * Math.PI;
      const rr = Math.sqrt(Math.max(0, 1 - meanZ * meanZ));
      const target = [rr * Math.cos(phi), rr * Math.sin(phi), meanZ];
      let bi = 0, bd = Infinity;
      patPts.forEach((q, i) => {
        const dd = geo(q, target);
        if (dd < bd) {
          bd = dd;
          bi = i;
        }
      });
      const pat = patterns[bi];
      const B2 = bits.concat([pat.slice()]);
      const m = measure(B2);
      const on = pat.map((v, j) => v ? j : -1).filter((j) => j >= 0);
      const off = pat.map((v, j) => v ? -1 : j).filter((j) => j >= 0);
      const joins = joinsOf(B2);
      const ex = exemplars(pat, () => true);
      cands.push({
        action: "add",
        rows_added: 1,
        sector: sIdx + 1,
        sector_count: c,
        semantic_status: "unvalidated",
        pattern: pat,
        frame_id,
        delta: m,
        score: -m.isolated_delta,
        rung_key: "add:s" + (sIdx + 1) + ":" + pat.join(""),
        joins,
        creates_isolate: newRowIsolated(B2),
        joins_note: joins.length ? "the predicted isolated delta comes from these currently-isolated items gaining the synthetic row as a neighbour; a real document only realises it if its OWN embedding lands within chord 0.095 of them \u2014 write toward their content, then verify with /api/map/preview placement" : "no isolate is joined by this pattern; the predicted delta is the new row's own isolation status",
        exemplars: ex,
        hypothesis: "bit-space hypothesis: one item carrying " + (on.length ? on.map(bitName).join(", ") : "none of the bits") + (off.length ? " and not " + off.map(bitName).join(", ") : "") + " lands in geometric sector " + (sIdx + 1) + " (" + (c === 0 ? "empty" : c + " item" + (c === 1 ? "" : "s")) + ") under the frozen frame",
        method: "insert one synthetic row with that pattern, re-place on the FROZEN frame (no refit), remeasure occupancy and isolation",
        prompt: "[add \xB7 geometric sector " + (sIdx + 1) + "] New document" + (joins.length ? " joining " + joins.map(joinBudget).join(", ") + "." : " landing in a thin sector (joins nothing; the predicted delta is its own isolation).") + " Model on: " + (exemplarsH(pat, () => true).join(", ") || "(none)") + " \u2014 Hamming distance in the " + d + "-bit frozen frame. Pole gap of the target pattern " + poleGap(pat).toFixed(3) + ".\nPredicted isolated" + adverse(m) + (m.isolated_delta >= 0 ? "+" : "") + m.isolated_delta + (m.occupied_sectors_delta !== 0 ? ", occupied sectors " + (m.occupied_sectors_delta > 0 ? "+" : "") + m.occupied_sectors_delta : "") + (joins.length ? "; realised only if the real embedding lands within chord " + ISO_RADIUS3 + " of that item. " : ". ") + "Pass this rung as `rung` to POST /api/map/preview and read `placement` first. " + TAIL
      });
    }
    for (const a of atoms.filter((x) => x.flip >= 0).sort((x, y) => y.delta - x.delta).slice(0, 3)) {
      const B2 = bits.map((r) => r.slice());
      B2[a.i][a.flip] = 1;
      const m = measure(B2);
      const ex = exemplars(bits[a.i], (k) => k !== a.i && bits[k][a.flip] === 1);
      const joins = joinsOf(B2).filter((n) => n !== nameOf(a.i));
      cands.push({
        action: "change",
        item: a.i,
        name: nameOf(a.i),
        flip_bit: a.flip,
        atom_delta: +a.delta.toFixed(5),
        sector: sectorIndex(pts[a.i]) + 1,
        semantic_status: "unvalidated",
        frame_id,
        rung_key: "change:" + nameOf(a.i) + ":bit" + a.flip,
        target_pattern: B2[a.i].slice(),
        joins,
        delta: m,
        score: -m.isolated_delta,
        exemplars: ex,
        hypothesis: "bit-space hypothesis: turning on " + bitName(a.flip) + " for " + nameOf(a.i) + " is its single-action atom (delta=" + a.delta.toFixed(3) + " toward the frozen pole)",
        method: "flip one bit, re-place on the FROZEN frame (no refit), remeasure occupancy and isolation",
        prompt: "[change \xB7 geometric sector " + (sectorIndex(pts[a.i]) + 1) + "] " + nameOf(a.i) + " \u2014 acquire what these share: " + (exemplarsH(bits[a.i], (k) => k !== a.i && bits[k][a.flip] === 1).join(", ") || "(no exemplar with that bit on)") + " (nearest items on this frame carrying " + bitName(a.flip) + ").\nPole gap " + gaps[a.i].toFixed(3) + " \u2192 " + (gaps[a.i] - a.delta).toFixed(3) + " (\u0394 " + a.delta.toFixed(3) + ", the only reading with a monotonicity theorem). Predicted isolated" + adverse(m) + (m.isolated_delta >= 0 ? "+" : "") + m.isolated_delta + " (non-monotone: de-isolating one point can isolate another). Clearance " + clearanceOf(a.i).toFixed(3) + ". " + TAIL
      });
    }
    const moved = cands.filter((c) => c.delta.isolated_delta !== 0 || c.delta.occupied_sectors_delta !== 0);
    const seen = /* @__PURE__ */ new Set();
    const rungs = moved.sort((a, b) => a.delta.isolated_delta - b.delta.isolated_delta || b.delta.occupied_sectors_delta - a.delta.occupied_sectors_delta).filter((c) => {
      const k = c.action + ":" + (c.item !== void 0 ? "i" + c.item + ":" + c.flip_bit : "s" + c.sector);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 5).map((c, r) => Object.assign({ rung: "L" + (r + 1) }, c, {
      caveat: "measured on this cloud on the frozen frame; a re-embed lands near, not on, the synthetic pattern"
    }));
    const nn = pts.map((p, i) => Math.min.apply(null, pts.map((q, j) => j === i ? Infinity : chord5(p, q))));
    const isoI = nn.indexOf(Math.max.apply(null, nn));
    const farI = gaps.indexOf(Math.max.apply(null, gaps));
    const outliers = [];
    const pushOutlier = (i, reason) => {
      if (i >= 0 && !outliers.some((o) => o.item === i)) outliers.push({ item: i, name: nameOf(i), sector: sectorIndex(pts[i]) + 1, reason, semantic_status: "unvalidated" });
    };
    pushOutlier(isoI, "largest nearest-neighbour chord (" + nn[isoI].toFixed(3) + ")");
    pushOutlier(farI, "largest chord to the frozen all-ones pole (" + gaps[farI].toFixed(3) + ")");
    return {
      decision: rungs.length ? "ranked" : "no-operation",
      reason: rungs.length ? "candidates with a measurable move on the frozen frame" : "no measurable move was produced by any candidate on the frozen frame (no fixed point is claimed)",
      ranking_rule: "lexicographic: isolated_delta ascending, then occupied_sectors_delta descending; pole shift is excluded (frozen frame) and is not a ranking term",
      score_note: "score = -isolated_delta: a display-only figure, positive when the candidate removes isolated points and negative when it creates them; it is not a quality claim",
      sector_counts: baseSectors,
      sectors_are: "anonymous geometric azimuthal bins numbered 1..12; no validated semantics attached",
      base: { occupied_sectors: baseOcc, isolated: baseIso },
      rungs,
      nss_lens_dictionary: {
        axes: NSS_LENS_AXES.slice(),
        semantic_status: "unvalidated",
        note: "canonical 12-axis list retained as an uncalibrated reading lens only; it is NOT a mapping onto the geometric sectors, and no sector has been validated against any axis"
      },
      review_only_audit: {
        note: "review only \u2014 no action is instructed, ranked, or scored here; a human decides whether these items deserve a look",
        outliers
      },
      config_echo: { d: cfg.d, threshold: cfg.threshold, seed: cfg.seed }
    };
  }
  function runMap(X, opts) {
    opts = opts || {};
    const cfg = validate4(X, opts);
    const { N, D, K, T, seed, steps, threshold, preprocessing_id } = cfg;
    const perturbation_linf = reqBudget(opts.perturbation_linf, "perturbation_linf");
    const roundoff_budget = reqBudget(opts.roundoff_budget, "roundoff_budget");
    const frame = opts.frame ? assertFrameCompatible(opts.frame, cfg) : assertFrameCompatible(buildFrame(X, cfg), cfg, "frame construction produced a non-finite instrument (check input magnitudes)");
    if (opts.frame && opts.d !== void 0 && frame.config.d !== Math.min(opts.d, Math.min(D, N - 1))) {
      throw new RangeError("frame drift: requested d " + opts.d + " != frame d " + frame.config.d);
    }
    const d = frame.config.d;
    const ops = frameOps(frame);
    const frame_id = hashObj(frame);
    const instrument_id = hashObj({ version: VERSION9, d, threshold, seed, K, T, steps, D, preprocessing_id });
    const certs = [];
    const cert = (cls, theorem, ok, detail) => {
      certs.push({ class: cls, theorem, ok: !!ok, detail });
      if (cls === "identity" && !ok) throw new Error("identity certificate failed \u2014 no result is returned: " + theorem + " :: " + detail);
      return !!ok;
    };
    const keys = X.map((v, i) => ({ ordinal: i, hash: hashVec(v), label: cfg.labels ? cfg.labels[i] : void 0, name: cfg.names ? cfg.names[i] : void 0 }));
    const bits = X.map(ops.bitsOf);
    const pts = bits.map(ops.toS2);
    const pole = ops.pole;
    const gaps = pts.map((q) => chord5(q, pole));
    const run_fingerprint = hashObj({ frame_id, instrument_id, rows: keys.map((k) => k.hash), names: cfg.names || null });
    const clsMap = /* @__PURE__ */ new Map();
    bits.forEach((b) => {
      const k = b.join("");
      clsMap.set(k, (clsMap.get(k) || 0) + 1);
    });
    const largest = Math.max.apply(null, Array.from(clsMap.values()));
    cert("identity", "keyed-row injectivity (D6)", new Set(keys.map((k) => k.ordinal)).size === N, "ordinal is the injective key; content hashes " + new Set(keys.map((k) => k.hash)).size + "/" + N + " distinct");
    const ks = bits.map((b) => b.reduce((a, x) => a + x, 0));
    const Phi = Array.from({ length: d + 1 }, (_, k) => {
      const g = gaps.filter((_2, i) => ks[i] === k);
      return g.length ? g.reduce((a, b) => a + b, 0) / g.length : NaN;
    });
    const filled = [];
    for (let k = 0; k <= d; k++) if (Number.isNaN(Phi[k])) {
      filled.push(k);
      let lo = k - 1, hi = k + 1;
      while (lo >= 0 && Number.isNaN(Phi[lo])) lo--;
      while (hi <= d && Number.isNaN(Phi[hi])) hi++;
      Phi[k] = lo < 0 ? hi > d ? 0 : Phi[hi] : hi > d ? Phi[lo] : Phi[lo] + (Phi[hi] - Phi[lo]) * (k - lo) / (hi - lo);
    }
    const drops = Phi.slice(0, d).map((p, k) => p - Phi[k + 1]);
    const sumDrops = drops.reduce((a, b) => a + b, 0);
    cert("identity", "phi_ladder_telescope (Lean \xA75)", Math.abs(sumDrops - (Phi[0] - Phi[d])) < 1e-9, "sum(drops)=" + sumDrops.toFixed(6) + " vs Phi(0)-Phi(d)=" + (Phi[0] - Phi[d]).toFixed(6) + (filled.length ? "; empty shells " + filled.join(",") + " linearly interpolated (stated)" : ""));
    const v2 = V2(bits);
    const GATE = 0.4, RANK_MAX = 5;
    const identity_applicable = Number.isFinite(v2) && v2 > 0;
    const rhat = identity_applicable ? 2 / v2 : Infinity;
    const gate_pass = identity_applicable ? v2 >= GATE : null;
    const rank_pass = identity_applicable ? rhat <= RANK_MAX : null;
    const at_boundary = identity_applicable && Math.abs(5 * v2 - 2) <= 1e-12;
    const identity_holds = identity_applicable ? gate_pass === rank_pass || at_boundary : null;
    const gate_rank = {
      v2,
      rhat,
      threshold: RANK_MAX,
      gate_threshold: GATE,
      gate_pass,
      rank_pass,
      ok: rank_pass,
      identity_applicable,
      identity_holds,
      at_boundary,
      note: "identity_holds certifies the Lean \xA74 equivalence (V2 >= 0.40) <-> (2/V2 <= 5), which is satisfied even when both sides are false; gate_pass / rank_pass are the measurement on this coordinate and are not evidence about the corpus"
    };
    cert(
      "identity",
      "gate_rank_identity (Lean \xA74)",
      identity_applicable ? identity_holds : true,
      identity_applicable ? "equivalence (V2 >= " + GATE + ") <-> (rhat = 2/V2 <= " + RANK_MAX + "): left=" + gate_pass + ", right=" + rank_pass + " at V2=" + v2.toFixed(6) + ", rhat=" + rhat.toFixed(6) + (at_boundary ? " (at the 5*V2=2 boundary)" : "") + "; an identity, true whether the gate passes or fails" : "not applicable: V2=" + v2 + " is a degenerate zero-variance coordinate, so Lean \xA74's p, q > 0 hypotheses are unmet; no gate claim is made"
    );
    cert(
      "measurement",
      "V2 rank gate (V2 >= " + GATE + ", equivalently rhat <= " + RANK_MAX + ")",
      identity_applicable && rank_pass,
      identity_applicable ? "V2=" + v2.toFixed(4) + " (trace-normalised share) => rhat=2/V2=" + rhat.toFixed(2) + (rank_pass ? " <= 5 (gate passed)" : " > 5 (gate not passed)") : "not-tested (degenerate zero-variance coordinate: V2=" + v2 + ")"
    );
    const atoms = bits.map((b, i) => {
      const dpre = gaps[i];
      let best = { bits: b, dist: dpre, flip: -1 };
      for (let j = 0; j < d; j++) if (b[j] === 0) {
        const nb = b.slice();
        nb[j] = 1;
        const dist = chord5(ops.toS2(nb), pole);
        if (dist < best.dist) best = { bits: nb, dist, flip: j };
      }
      return { i, flip: best.flip, delta: dpre - best.dist, dk: best.flip < 0 ? 0 : 1, to: best.flip < 0 ? pts[i] : ops.toS2(best.bits) };
    });
    const minDelta = Math.min.apply(null, atoms.map((a) => a.delta));
    let run = 0, mono = true;
    for (const dl of atoms.map((a) => a.delta).sort((a, b) => b - a)) {
      if (run + dl < run - 1e-12) mono = false;
      run += dl;
    }
    cert("identity", "atom_delta_nonneg (Lean \xA71)", minDelta >= -1e-12, atoms.filter((a) => a.flip >= 0).length + "/" + N + " items have a strictly improving flip; min delta=" + minDelta.toExponential(2));
    cert("identity", "quantization max|dk|=1 (compass)", atoms.every((a) => a.dk <= 1), "max dk=" + Math.max.apply(null, atoms.map((a) => a.dk)));
    cert("identity", "corpus_sum_nonneg + cumulative_monotone (Lean \xA72\u20133)", mono && run >= 0, "sum(delta)=" + run.toFixed(4) + ", prefix sums monotone=" + mono);
    const attempts = 5 * N * d;
    const c8 = { rowOk: true, colOk: true, attempted: 0, accepted: 0 };
    const rn = mulberry327(seed ^ 2654435769);
    const nulls = [];
    for (let k = 0; k < K; k++) nulls.push(V2(nullDraw(bits, attempts, rn, c8)));
    const E0 = nulls.reduce((a, b) => a + b, 0) / K;
    const SD0 = Math.sqrt(nulls.reduce((a, b) => a + (b - E0) ** 2, 0) / (K - 1));
    const admissible = Number.isFinite(SD0) && SD0 >= 1e-3;
    const zV2 = admissible ? (v2 - E0) / SD0 : null;
    const obs = Math.abs(v2 - E0);
    const atLeastAsExtreme = nulls.filter((x) => Math.abs(x - E0) >= obs - 1e-15).length;
    const p_two_sided = (1 + atLeastAsExtreme) / (K + 1);
    const p_resolution = 1 / (K + 1);
    const verdict = !admissible ? "not-tested (degenerate null)" : p_two_sided <= p_resolution + 1e-15 ? "excluded at the resolution of this null" : "not-excluded";
    cert("identity", "swap_preserves_rowSum (Lean \xA78)", c8.rowOk, c8.accepted + " accepted of " + c8.attempted + " attempted proposals over " + K + " draws");
    cert("identity", "swap_preserves_colSum (Lean \xA78)", c8.colOk, c8.accepted + " accepted of " + c8.attempted + " attempted proposals over " + K + " draws");
    cert("measurement", "membership: SD0[V2] >= 1e-3", admissible, "SD0=" + SD0.toExponential(3));
    cert(
      "measurement",
      "delta-V2 vs fixed-margin null (exclusion-only, empirical p)",
      admissible && p_two_sided <= p_resolution + 1e-15,
      admissible ? "delta-V2=" + (v2 - E0).toFixed(4) + ", p=" + p_two_sided.toFixed(4) + " (resolution " + p_resolution.toFixed(4) + " at K=" + K + ") -> " + verdict : "void (inadmissible coordinate)"
    );
    const C = compass(Phi, d, T, steps, mulberry327(seed + 7));
    const Tx = crossover(Phi, d);
    cert("identity", "mh_detailed_balance analytic (Lean \xA77)", C.flux_identity_analytic.ok, "max |pi(k)a_up - pi(k+1)a_down| = " + C.flux_identity_analytic.max_abs_residual.toExponential(2));
    cert("identity", "quantization on accepted moves", C.maxdk <= 1, "max|dk|=" + C.maxdk);
    const worst = atoms.reduce((b, a) => a.delta > b.delta ? a : b, atoms[0]);
    const ts = [0, 0.1, 0.25, 0.5, 0.75, 1];
    const bridgeRungs = ts.map((t) => slerp(pts[worst.i], pole, t));
    let monoG = true;
    for (let i = 1; i < bridgeRungs.length; i++) if (geo(bridgeRungs[i], pole) > geo(bridgeRungs[i - 1], pole) + 1e-9) monoG = false;
    cert("identity", "slerp bridge: geodesic to target non-increasing", monoG, "item " + worst.i + " -> pole, " + bridgeRungs.length + " rungs");
    const E = parsevalShares2(pts);
    const spectra = {
      admitted: false,
      status: "diagnostic only \u2014 NOT admitted as homology, and not admitted as evidence about the corpus",
      S2_parseval: E.map((x) => +x.toFixed(4)),
      S2_even: +(E[0] + E[2]).toFixed(4),
      S2_odd: +(E[1] + E[3]).toFixed(4),
      rank0_2_block: +(E[0] + E[2]).toFixed(4),
      rank1_block: +E[1].toFixed(4),
      heat_eigenvalues_per_degree: [0, 1, 2, 3].map((l) => ({ degree: l, eigenvalue: heatExp(l) })),
      decay: [0.05, 0.2, 1].map((t) => ({ t, E: E.map((e, l) => +(e * Math.exp(-2 * heatExp(l) * t)).toExponential(2)) })),
      disclaimers: [
        "no dipole response is computed, and no polarizability response is computed or implied",
        "this is not an IR measurement and not a Raman measurement; no physical spectroscopic signal is claimed",
        "no fitted lifetime and no binding energy is estimated or reported",
        "this block adds no quality score and must not be read as one",
        "the S2 band shares are a shape statistic of the point cloud on this frozen frame, nothing more"
      ]
    };
    cert("identity", "heat_exponent_monotone (Lean \xA76)", [0, 1, 2, 3].every((l, i, a) => i === 0 || heatExp(a[i - 1]) < heatExp(l)), "l(l+1) = " + [0, 1, 2, 3].map(heatExp).join(","));
    cert("identity", "heat_exp_dominates_hamming (Lean \xA714)", [1, 2, 3].every((l) => l < heatExp(l)), "sphere penalty strictly harsher than H(d,2) for l>=1");
    const ladder_candidates = buildLadder({ bits, ops, pts, gaps, d, atoms, keys, frame_id, seed, threshold, cfg });
    const shells = Array.from({ length: d + 1 }, (_, k) => ks.filter((x) => x === k).length);
    const sector_counts = ladder_candidates.sector_counts;
    const identity_failed = certs.filter((c) => c.class === "identity" && !c.ok);
    if (identity_failed.length) throw new Error("identity certificate(s) failed \u2014 no result is returned: " + identity_failed.map((c) => c.theorem).join(", "));
    return {
      version: VERSION9,
      // ---- instrument identity ----
      frame,
      frame_id,
      instrument_id,
      run_fingerprint,
      preprocessing_id,
      rule_hash: frame_id,
      // backwards-compatible alias of frame_id
      rule: {
        rule: threshold === "zero" ? "Rabs" : "R0",
        d,
        threshold,
        note: threshold === "zero" ? "frozen top-d PCA axes; bit_j = [score_j > 0] (sign rule; column margins float)" : "frozen top-d PCA axes; bit_j = [score_j > exact median_j of the fitting cloud]. Strict scores above the fitted median give floor(N/2) ones without ties; ties can lower that count, so fixed margins are not guaranteed. Frozen thresholds do not impose margins on later corpora."
      },
      seed,
      n: N,
      D,
      d,
      T,
      K,
      steps,
      keys,
      names: cfg.names || null,
      labels: cfg.labels || null,
      bits,
      // returned for comparison
      classes: { count: clsMap.size, largest, unresolvable_pairs: Array.from(clsMap.values()).reduce((s, c) => s + c * (c - 1) / 2, 0) },
      k: ks,
      pts: pts.map((p) => p.map((x) => +x.toFixed(5))),
      pts_full: pts,
      pole: pole.map((x) => +x.toFixed(5)),
      gaps: gaps.map((x) => +x.toFixed(5)),
      pc12: null,
      // undefined on a frozen frame; see gate_rank / v2
      v2: +v2.toFixed(5),
      gate_rank,
      sector_counts,
      occupied_sectors: sector_counts.filter((c) => c > 0).length,
      isolated: isolatedCount2(pts),
      ladder: { Phi: Phi.map((x) => +x.toFixed(4)), drops: drops.map((x) => +x.toFixed(4)), interpolated_shells: filled },
      shells,
      atoms: atoms.map((a) => ({ i: a.i, flip: a.flip, delta: +a.delta.toFixed(5), to: a.to.map((x) => +x.toFixed(5)) })),
      null: {
        kind: "label-swap chain: a fixed number of ATTEMPTED symmetric checkerboard switch proposals (self-loops included) \u2014 not a full Curveball trade sequence",
        K,
        attempts_per_draw: attempts,
        accepted_total: c8.accepted,
        attempted_total: c8.attempted,
        E0: +E0.toFixed(5),
        SD0: +SD0.toFixed(6),
        admissible,
        z: zV2 === null ? null : +zV2.toFixed(2),
        z_note: "z is descriptive only \u2014 the null is empirical and finite, so this is not a Gaussian significance statement",
        p_two_sided,
        p_resolution,
        p_note: "two-sided plus-one empirical tail: p = (1 + #{|V2* - E0| >= |V2 - E0|}) / (K + 1); the smallest attainable p at K=" + K + " is " + p_resolution.toFixed(4),
        verdict,
        stationary_law: "uniform on the fibre under a symmetric, fixed-attempt proposal set (Lean \xA710); irreducibility not checked at this N\xB7d"
      },
      compass: Object.assign({}, C, {
        pi: C.pi.map((x) => +x.toFixed(6)),
        kmean_analytic: +C.kmean_analytic.toFixed(4),
        kmean_empirical: +C.kmean_empirical.toFixed(4),
        acceptance: +C.acceptance.toFixed(3),
        Tx: Tx === null ? null : +Tx.toFixed(6),
        wall: "property of a designed chain on a measured ladder, not of the cloud"
      }),
      bridge: { i: worst.i, ts, rungs: bridgeRungs.map((p) => p.map((x) => +x.toFixed(5))) },
      ladder_candidates,
      nss: {
        // backwards-compatible shell over the new ladder
        deprecated: "sectors are anonymous geometry; the NSS axis list is an uncalibrated lens dictionary",
        semantic_status: "unvalidated",
        sector_counts,
        lens_dictionary: ladder_candidates.nss_lens_dictionary,
        ladder: ladder_candidates.rungs,
        decision: ladder_candidates.decision
      },
      spectra,
      certificates: certs,
      math_diagnostics: {
        diagnostics_version: DIAGNOSTICS_VERSION,
        perturbation_linf,
        roundoff_budget,
        radius: ISO_RADIUS3,
        units: MARGIN_UNITS,
        axes: frame.input_pca.axes.map((axis, j) => ({ axis: j, threshold: frame.input_pca.thresholds[j], norm1: axis.reduce((a, x) => a + Math.abs(x), 0), norm2: Math.hypot(...axis) })),
        encoding: "per-input signed margins; thresholds/norms are shared in axes; no values are truncated",
        per_input: X.map((row, i) => ({
          index: i,
          name: cfg.names ? cfg.names[i] : null,
          margins: projectionMargins(
            frame,
            row,
            perturbation_linf === null ? 0 : perturbation_linf,
            roundoff_budget === null ? void 0 : roundoff_budget
          ).map((m) => ({
            axis: m.axis,
            signed_margin: m.signed_margin,
            distance_to_threshold: m.distance_to_threshold,
            perturbation_bound: m.perturbation_bound,
            bit: m.bit,
            status: m.status
          }))
        })),
        scope: MARGIN_SCOPE + " Diagnostic only: no new score, ranking or claim is derived from these margins."
      },
      summary: {
        identity_failures: certs.filter((c) => c.class === "identity" && !c.ok).length,
        measurement_red: certs.filter((c) => c.class === "measurement" && !c.ok).length
      }
    };
  }
  function reqBudget(v, label) {
    if (v === void 0 || v === null) return null;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new RangeError(label + " must be a finite number >= 0 (got " + String(v) + ")");
    return v;
  }
  var MARGIN_UNITS = "score units of this frozen axis (axis-scaled input units)";
  var MARGIN_SCOPE = "Conditional on the supplied L-infinity input perturbation and floating-point roundoff bounds; a half-space stability statement about this frozen axis only. No claim about text edits.";
  function projectionMargins(frame, vector, epsilonInf, roundoffBudget) {
    if (!frame || typeof frame !== "object" || !frame.input_pca) throw new TypeError("projectionMargins(frame, vector, ...) needs a frame with input_pca");
    const fp = frame.input_pca;
    if (!Array.isArray(fp.mu) || !fp.mu.length || fp.mu.some((x) => !Number.isFinite(x)) || !Array.isArray(fp.axes) || !Array.isArray(fp.thresholds) || fp.axes.length !== fp.thresholds.length || fp.thresholds.some((x) => !Number.isFinite(x)) || fp.axes.some((a) => !Array.isArray(a) || a.length !== fp.mu.length || a.some((x) => !Number.isFinite(x)))) throw new RangeError("invalid finite projection frame");
    if (!Array.isArray(fp.mu) || !Array.isArray(fp.axes) || !Array.isArray(fp.thresholds)) throw new TypeError("frame.input_pca must carry arrays mu, axes, thresholds");
    if (!Array.isArray(vector)) throw new TypeError("vector must be an array of finite numbers");
    if (vector.length !== fp.mu.length) throw new RangeError("vector length " + vector.length + " does not match the frame input D=" + fp.mu.length);
    for (let k = 0; k < vector.length; k++) {
      const x = vector[k];
      if (typeof x !== "number" || !Number.isFinite(x)) throw new RangeError("vector[" + k + "] must be a finite number (got " + String(x) + ")");
    }
    const eps = epsilonInf === void 0 || epsilonInf === null ? 0 : reqBudget(epsilonInf, "epsilonInf");
    const round = reqBudget(roundoffBudget, "roundoffBudget");
    return fp.axes.map((axis, j) => {
      let score = 0;
      for (let k = 0; k < axis.length; k++) score += axis[k] * (vector[k] - fp.mu[k]);
      const threshold = fp.thresholds[j];
      const signed = score - threshold;
      let norm1 = 0;
      for (let k = 0; k < axis.length; k++) norm1 += Math.abs(axis[k]);
      let norm2 = 0;
      for (let k = 0; k < axis.length; k++) norm2 += axis[k] * axis[k];
      norm2 = Math.sqrt(norm2);
      const radius = round === null ? null : eps * norm1 + round;
      if (!Number.isFinite(score) || !Number.isFinite(signed) || !Number.isFinite(norm1) || !Number.isFinite(norm2) || radius !== null && !Number.isFinite(radius)) throw new RangeError("projection bound overflow");
      const status = radius === null ? "needs-roundoff-bound" : signed > radius ? "stable-on" : signed <= -radius ? "stable-off" : "undetermined";
      return {
        axis: j,
        score,
        threshold,
        signed_margin: signed,
        norm1,
        norm2,
        distance_to_threshold: Math.abs(signed),
        distance_l2_to_hyperplane: norm2 ? Math.abs(signed) / norm2 : null,
        perturbation_bound: radius,
        bound_validation: "caller-supplied-unverified",
        certified: false,
        bit: score > threshold ? 1 : 0,
        // identical rule to frameOps().bitsOf
        status,
        units: MARGIN_UNITS,
        scope: MARGIN_SCOPE
      };
    });
  }
  function checkEdges(v, label) {
    if (!Array.isArray(v)) throw new TypeError(label + " must be an array of 0/1 edge flags");
    v.forEach((e, i) => {
      if (e !== 0 && e !== 1) throw new RangeError("invalid " + label + "[" + i + "]: edges must be 0 or 1 (got " + String(e) + ")");
    });
  }
  function checkDegrees(d) {
    if (!Array.isArray(d)) throw new TypeError("oldDegrees must be an array of non-negative integers");
    d.forEach((x, i) => {
      if (!Number.isInteger(x) || x < 0) throw new RangeError("invalid degree[" + i + "]: " + String(x));
    });
  }
  function isolationDeltaAdd(oldDegrees, newEdges) {
    checkDegrees(oldDegrees);
    checkEdges(newEdges, "newEdges");
    if (oldDegrees.length !== newEdges.length) throw new RangeError("invalid ledger: degrees/edges length mismatch");
    const newDegree = newEdges.reduce((a, b) => a + b, 0);
    let touched = 0;
    for (let i = 0; i < oldDegrees.length; i++) if (oldDegrees[i] === 0 && newEdges[i] === 1) touched++;
    return { delta: (newDegree === 0 ? 1 : 0) - touched, new_degree: newDegree, previous_isolates_touched: touched };
  }
  function isolationDeltaChange(oldDegrees, oldEdges, newEdges, vertex) {
    checkDegrees(oldDegrees);
    checkEdges(oldEdges, "oldEdges");
    checkEdges(newEdges, "newEdges");
    const n = oldDegrees.length;
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= n) throw new RangeError("invalid vertex " + String(vertex));
    if (oldEdges.length !== n || newEdges.length !== n) throw new RangeError("invalid ledger: edge row length mismatch");
    if (oldEdges[vertex] !== 0 || newEdges[vertex] !== 0) throw new RangeError("invalid ledger: self-loop on the moved vertex");
    if (oldEdges.reduce((a, b) => a + b, 0) !== oldDegrees[vertex]) throw new RangeError("invalid ledger: old degree disagrees with the old edge row");
    const newDegree = newEdges.reduce((a, b) => a + b, 0);
    let delta = (newDegree === 0 ? 1 : 0) - (oldDegrees[vertex] === 0 ? 1 : 0);
    const touched = [];
    for (let j = 0; j < n; j++) {
      if (j === vertex) continue;
      const post = oldDegrees[j] - oldEdges[j] + newEdges[j];
      if (post < 0) throw new RangeError("invalid ledger: negative post-degree at " + j);
      if (oldEdges[j] !== newEdges[j]) touched.push(j);
      delta += (post === 0 ? 1 : 0) - (oldDegrees[j] === 0 ? 1 : 0);
    }
    return { delta, new_degree: newDegree, old_degree: oldDegrees[vertex], touched_neighbours: touched };
  }
  function degreesOf(P) {
    return P.map((p, i) => P.reduce((acc, q, j) => acc + (j !== i && chord5(p, q) < ISO_RADIUS3 ? 1 : 0), 0));
  }
  function samePoint(p, q) {
    return p.length === q.length && p.every((x, i) => x === q[i]);
  }
  function pointsOf(res, which) {
    if (!res || typeof res !== "object") throw new TypeError(which + " must be a runMap result");
    if (!Array.isArray(res.pts_full)) return null;
    for (const p of res.pts_full) if (!Array.isArray(p) || p.length !== 3 || p.some((x) => typeof x !== "number" || !Number.isFinite(x))) return null;
    return res.pts_full;
  }
  function notApplicable(reason, extra) {
    return Object.assign({
      diagnostics_version: DIAGNOSTICS_VERSION,
      kind: "not-applicable",
      reason,
      added_name: null,
      moved_name: null,
      ledger: null,
      correspondence: { status: "not-applicable", note: "no ledger is claimed for this transition" },
      reduction: { eligible: false, ratio: null, reason: "no applicable ledger", scope: RATIO_SCOPE },
      retrospective: true,
      scope: TRANSITION_SCOPE2
    }, extra || {});
  }
  var TRANSITION_SCOPE2 = "Retrospective post-edit reconstruction on one frozen frame: it explains where the isolated count went, it is not a pre-edit forecast and not a prediction.";
  var RATIO_SCOPE = "A geometric ledger ratio of observed to predicted isolated-count reduction. Not calibrated confidence and not task quality.";
  function explainTransition(before, after, opts) {
    opts = opts || {};
    if (!before || !after) throw new TypeError("explainTransition(before, after) needs two runMap results");
    if (before.frame_id !== after.frame_id) throw new RangeError("frame_id mismatch (" + before.frame_id + " vs " + after.frame_id + "): the two maps are not on the same frozen frame");
    if (before.instrument_id !== after.instrument_id) throw new RangeError("instrument_id mismatch (" + before.instrument_id + " vs " + after.instrument_id + "): settings differ between the two runs");
    const bi = nameIndex(before, "before"), ai = nameIndex(after, "after");
    let predicted = null;
    if (opts.predicted_delta !== void 0 && opts.predicted_delta !== null) {
      if (typeof opts.predicted_delta !== "number" || !Number.isFinite(opts.predicted_delta)) throw new RangeError("predicted_delta must be a finite number (got " + String(opts.predicted_delta) + ")");
      predicted = opts.predicted_delta;
    }
    const reduction = (actual2) => {
      if (predicted === null) return { eligible: false, ratio: null, reason: "no predicted_delta supplied", scope: RATIO_SCOPE };
      if (predicted >= 0) return { eligible: false, ratio: null, reason: "prediction is not a strict decrease", scope: RATIO_SCOPE };
      return { eligible: true, ratio: -actual2 / -predicted, predicted_delta: predicted, scope: RATIO_SCOPE };
    };
    const PB = pointsOf(before, "before"), PA = pointsOf(after, "after");
    if (!PB || !PA) return notApplicable("missing full-precision pts_full on " + (!PB ? "before" : "after") + ": rounded pts are not exact enough for r=" + ISO_RADIUS3 + " adjacency");
    if (PB.length !== bi.size || PA.length !== ai.size) return notApplicable("names and pts_full disagree in length");
    const isoB = isolatedCount2(PB), isoA = isolatedCount2(PA);
    if (Number.isInteger(before.isolated) && before.isolated !== isoB) throw new Error("before.isolated " + before.isolated + " disagrees with the isolated count recomputed from before.pts_full (" + isoB + ")");
    if (Number.isInteger(after.isolated) && after.isolated !== isoA) throw new Error("after.isolated " + after.isolated + " disagrees with the isolated count recomputed from after.pts_full (" + isoA + ")");
    const actual = isoA - isoB;
    const measurement = {
      class: "measurement",
      isolated_before: isoB,
      isolated_after: isoA,
      actual_delta: actual,
      note: "the isolated counts are a measurement of this corpus on the frozen frame; the ledger arithmetic above is an identity, these two counts are not"
    };
    const added = [], removed = [];
    for (const n of ai.keys()) if (!bi.has(n)) added.push(n);
    for (const n of bi.keys()) if (!ai.has(n)) removed.push(n);
    const moved = [];
    for (const [n, i] of bi) if (ai.has(n) && !samePoint(PB[i], PA[ai.get(n)])) moved.push(n);
    const finish = (kind, ledger, extra) => {
      if (ledger.delta !== actual) {
        throw new Error("math ledger mismatch: " + kind + " ledger predicts an isolated-count delta of " + ledger.delta + " but the independently recomputed delta is " + actual + " \u2014 this is an arithmetic failure, not a measurement disagreement");
      }
      return Object.assign({
        diagnostics_version: DIAGNOSTICS_VERSION,
        kind,
        added_name: null,
        moved_name: null,
        ledger: Object.assign({ class: "identity", actual_delta: actual }, ledger),
        measurement,
        correspondence: {
          status: "lean-known",
          theorem: kind === "ADD" ? "WayfinderBounds.add_isolation_delta" : "WayfinderBounds.change_isolation_delta",
          note: "Exact integer/count identity kernel-checked on Lean 4.33.0. Runtime adjacency construction and floating-point bounds remain separate obligations."
        },
        reduction: reduction(actual),
        retrospective: true,
        scope: TRANSITION_SCOPE2
      }, extra || {});
    };
    if (removed.length) return notApplicable("removed name(s) (" + removed.slice(0, 5).join(", ") + "): only ADD (exactly one new name) and CHANGE (no names added or removed) carry a ledger");
    if (added.length > 1) return notApplicable("ADD requires exactly 1 new name, got " + added.length + " (" + added.slice(0, 5).join(", ") + ")");
    const degB = degreesOf(PB);
    if (added.length === 1) {
      if (moved.length) return notApplicable("ADD requires every old edge unchanged, but " + moved.length + " common point(s) moved (" + moved.slice(0, 5).join(", ") + ")");
      const q = ai.get(added[0]);
      const links = [], touchedNames2 = [];
      for (const [n, i] of bi) {
        const e = chord5(PA[ai.get(n)], PA[q]) < ISO_RADIUS3 ? 1 : 0;
        links[i] = e;
        if (e === 1 && degB[i] === 0) touchedNames2.push(n);
      }
      const L = isolationDeltaAdd(degB, links);
      return finish("ADD", {
        theorem: "isolated'(G + v) - isolated(G) = [deg(v) = 0] - #{u : deg(u) = 0 and u ~ v}",
        delta: L.delta,
        new_degree: L.new_degree,
        previous_isolates_touched: L.previous_isolates_touched,
        previous_isolates_touched_names: touchedNames2,
        radius: ISO_RADIUS3
      }, { added_name: added[0] });
    }
    if (moved.length > 1) return notApplicable("CHANGE covers 0 or 1 moved common point, got " + moved.length + " (" + moved.slice(0, 5).join(", ") + ")");
    if (moved.length === 0) {
      return finish("CHANGE", {
        theorem: "no point moved on the frozen frame: the adjacency graph, and therefore the isolated count, is unchanged",
        delta: 0,
        new_degree: null,
        touched_neighbour_names: [],
        radius: ISO_RADIUS3
      }, { moved_name: null, correspondence: { status: "lean-known", theorem: "WayfinderBounds.change_neutral", note: "Unchanged adjacency and degrees checked at runtime; the neutral exact ledger is kernel-checked." } });
    }
    const name = moved[0], v = bi.get(name);
    const oldEdges = [], newEdges = [], touchedNames = [];
    for (const [n, i] of bi) {
      oldEdges[i] = i !== v && chord5(PB[i], PB[v]) < ISO_RADIUS3 ? 1 : 0;
      newEdges[i] = i !== v && chord5(PA[ai.get(n)], PA[ai.get(name)]) < ISO_RADIUS3 ? 1 : 0;
    }
    const C = isolationDeltaChange(degB, oldEdges, newEdges, v);
    const nameByIndex = /* @__PURE__ */ new Map();
    for (const [n, i] of bi) nameByIndex.set(i, n);
    C.touched_neighbours.forEach((j) => touchedNames.push(nameByIndex.get(j)));
    return finish("CHANGE", {
      theorem: "deg'_j = deg_j - [j ~ v before] + [j ~ v after]; isolated' - isolated = sum_j ([deg'_j = 0] - [deg_j = 0])",
      delta: C.delta,
      new_degree: C.new_degree,
      old_degree: C.old_degree,
      touched_neighbour_names: touchedNames,
      radius: ISO_RADIUS3
    }, { moved_name: name });
  }
  function nameIndex(res, which) {
    if (!res || !Array.isArray(res.names)) throw new TypeError(which + " has no names[]; compareMaps is name-keyed \u2014 run the map with opts.names");
    const idx = /* @__PURE__ */ new Map();
    res.names.forEach((n, i) => {
      if (idx.has(n)) throw new RangeError("duplicate name " + JSON.stringify(n) + " in " + which + "; comparison requires unique names");
      idx.set(n, i);
    });
    return idx;
  }
  function compareMaps(before, after, diagnosticsOptions) {
    if (!before || !after) throw new TypeError("compareMaps(before, after) needs two runMap results");
    if (before.frame_id !== after.frame_id) throw new RangeError("frame_id mismatch (" + before.frame_id + " vs " + after.frame_id + "): the two maps are not on the same frozen frame");
    if (before.instrument_id !== after.instrument_id) throw new RangeError("instrument_id mismatch (" + before.instrument_id + " vs " + after.instrument_id + "): settings differ between the two runs");
    const bi = nameIndex(before, "before"), ai = nameIndex(after, "after");
    const missing = [], added = [];
    for (const n of bi.keys()) if (!ai.has(n)) missing.push(n);
    for (const n of ai.keys()) if (!bi.has(n)) added.push(n);
    if (missing.length || added.length) {
      throw new RangeError("name sets differ \u2014 comparison requires the same set of unique names (missing in after: " + (missing.slice(0, 5).join(", ") || "none") + "; added in after: " + (added.slice(0, 5).join(", ") || "none") + ")");
    }
    const perName = [];
    let bitsChanged = 0, unchanged = 0, maxGeo = 0;
    for (const [n, i] of bi) {
      const j = ai.get(n);
      const p = before.pts_full ? before.pts_full[i] : before.pts[i];
      const q = after.pts_full ? after.pts_full[j] : after.pts[j];
      const ch = chord5(p, q), g = 2 * Math.asin(Math.min(1, ch / 2));
      const bb = before.bits[i], ab = after.bits[j];
      let hb = 0;
      for (let k = 0; k < bb.length; k++) if (bb[k] !== ab[k]) hb++;
      bitsChanged += hb;
      if (hb === 0 && g === 0) unchanged++;
      maxGeo = Math.max(maxGeo, g);
      const vector_changed = before.keys[i].hash !== after.keys[j].hash;
      const bs = before.embedding_metadata?.docs?.[i]?.sha256, as = after.embedding_metadata?.docs?.[j]?.sha256;
      const content_changed = bs && as ? bs !== as : null;
      const input_changed = vector_changed || content_changed === true;
      perName.push({ name: n, displacement_geodesic: g, displacement_chord: ch, bits_changed: hb, vector_changed, content_changed, input_changed, quantization_silent: input_changed && hb === 0 && g === 0, before_index: i, after_index: j });
    }
    const changed = perName.filter((x) => x.bits_changed > 0 || x.displacement_geodesic > 0);
    return {
      frame_id: before.frame_id,
      instrument_id: before.instrument_id,
      n: perName.length,
      per_name: perName,
      changed_names: changed.map((x) => x.name),
      changed_input_names: perName.filter((x) => x.input_changed).map((x) => x.name),
      changed_content_names: perName.filter((x) => x.content_changed === true).map((x) => x.name),
      representation_drift_names: perName.filter((x) => x.content_changed === false && x.vector_changed).map((x) => x.name),
      quantization_silent_names: perName.filter((x) => x.quantization_silent).map((x) => x.name),
      unchanged_input_anchors: perName.filter((x) => !x.input_changed).length,
      unchanged_anchors: unchanged,
      bits_changed_total: bitsChanged,
      max_displacement_geodesic: maxGeo,
      mean_displacement_geodesic: perName.reduce((a, x) => a + x.displacement_geodesic, 0) / perName.length,
      isolated_delta: after.isolated - before.isolated,
      occupied_sectors_delta: after.occupied_sectors - before.occupied_sectors,
      sector_counts_delta: after.sector_counts.map((c, i) => c - before.sector_counts[i]),
      geometry_decision: changed.length ? "moved" : "stable",
      geometry_decision_note: "diagnostic only: geometry says where points went on a frozen frame, it does not say whether the change was correct or useful",
      task_verdict: "not-tested",
      task_verdict_note: "whether the underlying task improved is not tested here and must be checked by a task-specific independent verifier",
      // additive: the exact isolated-count ledger for this transition (same frame, same name set).
      math_ledger: explainTransition(before, after, diagnosticsOptions)
    };
  }
  function reduce(X, k, seed) {
    const p = pcaTop(X, k, mulberry327(seed === void 0 ? 1 : seed));
    return { scores: p.scores.map((r) => r.map((x) => +x.toFixed(6))), explained: p.values.slice(0, k).map((x) => +x.toFixed(6)) };
  }
  return {
    runMap,
    compareMaps,
    synth,
    mulberry32: mulberry327,
    slerp,
    hashVec,
    hashStr,
    reduce,
    buildFrame,
    projectionMargins,
    explainTransition,
    _internal: {
      V2,
      nullDraw,
      assertFluxIdentity,
      pcaTop,
      frameOps,
      stationary,
      sectorIndex,
      isolatedCount: isolatedCount2,
      canonical,
      hashObj,
      validate: validate4,
      isolationDeltaAdd,
      isolationDeltaChange,
      degreesOf,
      reqBudget,
      DIAGNOSTICS_VERSION
    }
  };
})();
var MODEL2 = AI_MODEL;
var METRICS = [
  ["pc12", "PC1+PC2"],
  ["holdoutR2", "Sphere holdout R2"],
  ["ablationDelta", "Ablation delta (sphere - flat)"],
  ["zNull", "Null z"],
  ["sparseIsolated", "Isolated points"],
  ["coverageMean", "Coverage mean"],
  ["entropy", "Phi entropy (bits)"]
];
var LIST_COLS = `id, repo_url, owner, repo, ref, created_at, n_items, pc12,
  holdout_r2, ablation_delta, z_null, verdict, sparse_isolated, coverage_mean, entropy, basis`;
function rowToCamel(r) {
  return {
    id: r.id,
    repoUrl: r.repo_url,
    owner: r.owner,
    repo: r.repo,
    ref: r.ref,
    createdAt: r.created_at,
    nItems: r.n_items,
    pc12: r.pc12,
    holdoutR2: r.holdout_r2,
    ablationDelta: r.ablation_delta,
    zNull: r.z_null,
    verdict: r.verdict,
    sparseIsolated: r.sparse_isolated,
    coverageMean: r.coverage_mean,
    entropy: r.entropy,
    basis: r.basis
  };
}
async function listFits(db, full = false) {
  const cols = full ? "*" : LIST_COLS;
  const { results } = await db.prepare(`SELECT ${cols} FROM fits ORDER BY id DESC`).all();
  return (results ?? []).map((r) => full ? { ...r, fitJson: void 0 } : rowToCamel(r));
}
function populationComparison(rows, current) {
  const others = rows.filter((r) => r.id !== current.id);
  const table = METRICS.map(([key, label]) => {
    const vals = others.map((r) => Number(r[key])).filter((v) => Number.isFinite(v));
    const n = vals.length;
    const mean = n ? vals.reduce((s, v) => s + v, 0) / n : null;
    const std = n > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : null;
    const cur = Number(current[key]);
    const z = mean !== null && std !== null && std > 1e-9 ? (cur - mean) / std : null;
    return {
      metric: label,
      key,
      this_repo: +cur.toFixed(4),
      population_mean: mean === null ? null : +mean.toFixed(4),
      population_std: std === null ? null : +std.toFixed(4),
      population_n: n,
      z: z === null ? null : +z.toFixed(2)
    };
  });
  return { format: "mean with std subscript, per https://github.com/google-research/envharness#-results", rows: table };
}
function json(data, status = 200, extra) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...extra } });
}
// ---------- relay endpoints (ported from the sos-agent Sauna app, 2026-09-26) ----------
// Auth lives in Worker secret bindings: ELEVENLABS_API_KEY, RESEND_API_KEY.
// Created so the site can fully deprecate the Sauna sos-agent app.
const RELAY_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const relayHits = new Map();
function relayRateLimited(req, max) {
  const ip = req.headers.get("cf-connecting-ip") || "anon";
  const now = Date.now();
  const arr = (relayHits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  relayHits.set(ip, arr);
  if (relayHits.size > 5000) relayHits.clear();
  return arr.length > max;
}
const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function validateQuestions(questions) {
  if (!questions || typeof questions !== "object" || Array.isArray(questions) || !Object.keys(questions).length)
    return "questions must be a non-empty object keyed by question name";
  for (const [key, q] of Object.entries(questions)) {
    const t = q && q.type;
    if (t !== "noul" && t !== "choice" && t !== "score") return `${key}: type must be noul, choice, or score`;
    if (!q.instructions) return `${key}: instructions is required`;
    const c = q.criteria;
    if (t === "choice" && (!c || typeof c !== "object" || Array.isArray(c) || !Object.keys(c).length))
      return `${key}: choice needs criteria as {option: description}`;
    if (t === "score" && (!Array.isArray(c) || c.length < 2 || c.length > 10))
      return `${key}: score needs criteria as a list of 2-10 levels, lowest first`;
    if (t === "noul" && c != null && (typeof c !== "object" || Array.isArray(c)))
      return `${key}: noul criteria, if given, is {"true": ..., "false": ...}`;
  }
  return null;
}

var index_default = {
  async fetch(req, env) {
    try {
      return await (async () => {
        const url = new URL(req.url);
        let p = url.pathname;
        if (p === "/AGENT.md" || p === "/agent.md") {
          const md = await env.SITE.get("AGENT.md", "text");
          return new Response(md || "AGENT.md not uploaded", { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-cache" } });
        }
        if (p === "/llms.txt") {
          const txt = await env.SITE.get("llms.txt", "text");
          return new Response(
            txt || `# SOS Agent
Assess a GitHub repo into a FIT.json and compare against the stored population.
(llms.txt has not been uploaded to KV yet; this is a fallback.)
Business endpoints (assess/narrate/fits/map/outcomes/embed/repo-items) require the operator key: send an Authorization: Bearer header with JEV_API_KEY (401 otherwise). The old /sos voice-agent page has been removed.
POST /api/jev/map/sos/assess {"url": "https://github.com/<owner>/<repo>"} -> { id, report }
POST /api/jev/map/sos/narrate {"fit_id": n} -> narrated fit report
GET  /api/jev/map/sos/fits              -> population list
GET  /api/jev/map/sos/fits/:id          -> one fit report
DELETE /api/jev/map/sos/fits/:id        -> remove a fit
POST /api/jev/map {"vectors": number[][] | "texts": string[]} -> { id, map, comparison }
POST /api/jev/map/repo-items {"repo": "owner/repo", "subdir"?: "path", "ref"?: "branch-or-sha"} -> { n, items }
POST /api/jev/map/embed {"texts": string[]} -> { model, n, D, vectors, metadata }
GET  /api/jev/map/maps         -> stored maps (metrics only)
POST /api/jev/map/maps/compare {"before_id": n, "after_id": n} -> comparison
POST /api/jev/map/preview {"baseline_id": n, "texts": [...full resulting corpus...], "names": [...], "target": {"action":"add"|"change","name":"..."}}
POST /api/jev/map/control {"baseline_id": n, "texts": [...exact baseline corpus...], "names": [...], "n_controls"?: 2..6, "control_seed"?: int} -> positive control (nothing persisted)
POST /api/jev/map/outcomes {"baseline_id": n, "target": {...}, "predicted_delta"?, "after_id"? | "observed_delta"?, "task_check": {"verdict","verifier","notes"?}, "supersedes"?} -> append-only ledger row
GET  /api/jev/map/outcomes?baseline_id=n -> ledger rows + contingency of counts
POST /api/jev/map/axis-redundancy {"map_id": n, "K"?: 2..40, "null_seed"?: int} -> per-axis LOO-NN predictability trial vs fixed-margin null (admitted:false always)
POST /api/jev/map/admission {"map_id": n, "K"?: 2..40, "null_seed"?: int} -> unified membership trials (rayleigh, axis_trial, spectra shares, radius I(r) grid); admitted per diagnostic, computed
POST /api/jev/map/rayleigh {"map_id": n, "K"?: 2..40, "null_seed"?: int} -> isolation-graph components/isolates (exact), Fiedler lambda2 of the largest component + exact Rayleigh-Ritz cut witness, fixed-margin null tails; frame Ky Fan gap echoed
POST /api/jev/map/consistency {"baseline_id": n, "texts": [...corpus with primary candidate...], "names": [...], "target": {...}, "variants": [{"label","text"}] (1..3)} -> one edit under caller variants; sign agreement, never a gate
     -> { preview:true, persisted:false, map, comparison, math_ledger, target, unchanged_source_count, unchanged_anchor_count, side_effects }
     reads the stored baseline, re-embeds the actual candidate texts on the baseline's frozen frame and writes NOTHING (no map row, no Vectorize).
GET  /api/health                -> read-only version info
GET  /map/pointmap.js           -> static pointmap.js module
`,
            { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } }
          );
        }
        if (p === "/map/app.js") {
          return json({ error: "moved: the map UI lives in the /jev/ console" }, 410);
        }
        if (p === "/map/pointmap.js") {
          const js = await env.SITE.get("pointmap.js", "text");
          return new Response(js || "// pointmap.js not uploaded", { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
        }
        if (p.startsWith("/api/")) {
          const db = env.DB;
          // ---- /api/searxng (searXNG proxy to the Northflank n8n searxng-proxy webhook; no rate limiting) ----
          if (p === "/api/searxng" && (req.method === "GET" || req.method === "OPTIONS")) {
            if (req.method === "OPTIONS") {
              return new Response(null, {
                status: 204,
                headers: {
                  "Access-Control-Allow-Origin": "*",
                  "Access-Control-Allow-Methods": "GET, OPTIONS",
                  "Access-Control-Allow-Headers": "Content-Type, Authorization",
                },
              });
            }
            const url2 = new URL(req.url);
            const endpoint = url2.searchParams.get("endpoint") || "search";
            const qs = url2.searchParams.get("qs") || "";
            // P0-2 (2026-10-08): an empty qs used to be forwarded and the n8n
            // relay answered 500 "Error in workflow". Fail fast, before any
            // upstream fetch.
            if (!qs) return new Response(JSON.stringify({ error: "need qs (urlencoded searxng querystring)" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
            const target = "https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?endpoint=" + encodeURIComponent(endpoint) + "&qs=" + encodeURIComponent(qs);
            try {
              const upstream = await fetch(target, {
                method: "GET",
                headers: { "User-Agent": "steady-orbit-searxng/1", "Accept": "application/json" },
                signal: AbortSignal.timeout(20000),
              });
              const body = await upstream.text();
              return new Response(body, {
                status: upstream.status,
                headers: {
                  "Content-Type": upstream.headers.get("content-type") || "application/json",
                  "Access-Control-Allow-Origin": "*",
                  "Cache-Control": "no-cache",
                },
              });
            } catch (e) {
              return new Response(JSON.stringify({ error: "searxng_proxy_failed", detail: String(e && e.message || e) }), {
                status: 502,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              });
            }
          }

          // ---- /api/jev/map/selftest (P1-6, SPEC-AUDIT-FIXES-2026-10-08, Lane D; operator-gated; intercepts BEFORE the map fold rewrite) ----
          if (p === "/api/jev/map/selftest" && req.method === "GET") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            return await handleJevMapSelftest(req, env, {
              map: {
                embed: (texts) => embedDocuments(env, texts),
                vectorSearch: async (query, topK) => {
                  const out = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [query] });
                  const q = (out.data ?? [])[0];
                  if (!q) throw new ApiError(502, "embedding failed");
                  const res = await env.VEC.query(q, { topK: Math.min(20, Number(topK) || 5), returnMetadata: "all" });
                  return { matches: (res.matches ?? []).map((m2) => ({ id: m2.id, score: +(m2.score ?? 0).toFixed(4), label: m2.metadata?.label, text: m2.metadata?.text })) };
                },
                storeCanary: (text, vector) => rememberChunkedEmbeddings(env, PM.hashStr, [text], [vector], "jev-map-selftest"),
                hashStr: (s) => PM.hashStr(s),
                repoItems: (body) => repoItemsHandler(body, { parseRepoUrl, fetchCorpus, githubToken: env.GITHUB_TOKEN }),
              },
            });
          }
          // ---- 2026-10-08 map fold: /api/jev/map/* rewrite onto the map engine handlers; old paths 410 ----
          let mapMoved = false;
          if (p.startsWith("/api/jev/map")) {
            p = "/api" + p.slice(8);
            if (p === "/api/map/maps" || p.startsWith("/api/map/maps/")) p = "/api/maps" + p.slice(13);
            else if (p === "/api/map/outcomes" || p.startsWith("/api/map/outcomes/")) p = "/api/outcomes" + p.slice(17);
            else if (p === "/api/map/repo-items") p = "/api/repo-items";
            else if (p === "/api/map/embed") p = "/api/embed";
            else if (p === "/api/map/vector/search") p = "/api/vector/search";
            mapMoved = true;
          }
          if (!mapMoved && (p === "/api/map" || p.startsWith("/api/map/") || p === "/api/maps" || p.startsWith("/api/maps/") || p === "/api/outcomes" || p.startsWith("/api/outcomes/") || p === "/api/embed" || p === "/api/vector/search" || p === "/api/repo-items")) {
            return json({ error: "moved: this API relocated to /api/jev/map/*" }, 410);
          }
          // ---- /api/jev (jev-orchestrator; wired by jev-main.js) ----
          if (p.startsWith("/api/jev")) {
            return handleJevRequest(req, env, url, {
              mapHandler: (mapBody) => mapRouteHandler(mapBody, { env, PM, embedDocuments, loadStoredMap: (id) => loadStoredMapJson(env.DB, env, id), saveMap: (map, source) => saveStoredMap(env.DB, env, map, source) }),
            });
          }
          // ---- /api/tts (ported relay; ElevenLabs key from env.ELEVENLABS_API_KEY) ----
          if (p === "/api/tts" && req.method === "OPTIONS") {
            return new Response(null, { headers: { ...RELAY_CORS, "Access-Control-Allow-Methods": "POST, GET, OPTIONS" } });
          }
          if (p === "/api/tts" && (req.method === "GET" || req.method === "POST")) {
            return await relayTtsHandler(req, url, env);
          }
async function relayTtsHandler(req, url, env) {
            if (relayRateLimited(req, 15)) return json({ error: "rate limited" }, 429, { "Access-Control-Allow-Origin": "*" });
            let text = "", voice = "21m00Tcm4TlvDq8ikWAM";
            if (req.method === "POST") {
              const body = await req.json().catch(() => ({}));
              text = String((body && body.text) || "").replace(/\s+/g, " ").trim().slice(0, 4000);
              voice = String((body && body.voice_id) || voice);
            } else {
              text = (url.searchParams.get("text") || "").replace(/\s+/g, " ").trim().slice(0, 900);
              voice = url.searchParams.get("voice_id") || voice;
            }
            if (!text) return json({ error: "need text" }, 422, { "Access-Control-Allow-Origin": "*" });
            const elevenKey = env.ELEVENLABS_API_KEY ? await env.ELEVENLABS_API_KEY.get() : null;
            if (!elevenKey) return json({ error: "TTS not configured (ELEVENLABS_API_KEY missing)" }, 503, { "Access-Control-Allow-Origin": "*" });
            const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", accept: "audio/mpeg", "xi-api-key": elevenKey },
              body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
            });
            if (!r.ok) return json({ error: `elevenlabs ${r.status}` }, 502, { "Access-Control-Allow-Origin": "*" });
            return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" } });
          }
          // ---- /api/stt (ported relay; ElevenLabs scribe_v1) ----
          if (p === "/api/stt" && req.method === "OPTIONS") {
            return new Response(null, { headers: { ...RELAY_CORS, "Access-Control-Allow-Methods": "POST, OPTIONS" } });
          }
          if (p === "/api/stt" && req.method === "POST") {
            return await relaySttHandler(req, env);
          }
async function relaySttHandler(req, env) {
            if (relayRateLimited(req, 15)) return json({ error: "rate limited" }, 429, { "Access-Control-Allow-Origin": "*" });
            const sttKey = env.ELEVENLABS_API_KEY ? await env.ELEVENLABS_API_KEY.get() : null;
            if (!sttKey) return json({ error: "STT not configured (ELEVENLABS_API_KEY missing)" }, 503, { "Access-Control-Allow-Origin": "*" });
            const form = await req.formData().catch(() => null);
            if (!form) return json({ error: "need multipart form" }, 422, { "Access-Control-Allow-Origin": "*" });
            const file = form.get("file");
            if (!(file instanceof File) || file.size === 0) return json({ error: "need file" }, 422, { "Access-Control-Allow-Origin": "*" });
            if (file.size > 10 * 1024 * 1024) return json({ error: "file too large (10 MB max)" }, 413, { "Access-Control-Allow-Origin": "*" });
            const upstream = new FormData();
            upstream.append("file", file, file.name || "audio.webm");
            upstream.append("model_id", "scribe_v1");
            const language = String(form.get("language_code") || "").trim();
            if (/^[a-z]{2,3}(-[a-zA-Z0-9]+)?$/.test(language)) upstream.append("language_code", language);
            const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
              method: "POST",
              headers: { accept: "application/json", "xi-api-key": sttKey },
              body: upstream,
            });
            if (!r.ok) return json({ error: `elevenlabs ${r.status}` }, 502, { "Access-Control-Allow-Origin": "*" });
            const j = await r.json().catch(() => null);
            const text = j && typeof j.text === "string" ? j.text : null;
            if (!text) return json({ error: "transcription failed" }, 502, { "Access-Control-Allow-Origin": "*" });
            return json({ text, language_code: j.language_code ?? null }, 200, { "Access-Control-Allow-Origin": "*" });
          }
          // ---- /api/relay/selftest (P1-5, SPEC-AUDIT-FIXES-2026-10-08, Lane D; operator-gated live diagnostics, <=1 call per service) ----
          if (p === "/api/relay/selftest" && req.method === "GET") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            return await handleJevRelaySelftest(req, env, {
              relay: {
                decide: (r) => relayDecideHandler(r, new URL(r.url), env),
                chat: (r) => relayChatHandler(r, env),
                tts: (r) => relayTtsHandler(r, new URL(r.url), env),
                stt: (r) => relaySttHandler(r, env),
              },
            });
          }
          // ---- /api/contact (ported relay; Resend send-only key from env.RESEND_API_KEY) ----
          if (p === "/api/contact" && req.method === "OPTIONS") {
            return new Response(null, { headers: { ...RELAY_CORS, "Access-Control-Allow-Methods": "POST, OPTIONS" } });
          }
          if (p === "/api/contact" && req.method === "POST") {
            if (relayRateLimited(req, 5)) return json({ error: "rate limited, try again in a minute" }, 429, { "Access-Control-Allow-Origin": "*" });
            const resendKey = env.RESEND_API_KEY ? await env.RESEND_API_KEY.get() : null;
            if (!resendKey) return json({ error: "contact relay not configured (RESEND_API_KEY missing)" }, 503, { "Access-Control-Allow-Origin": "*" });
            const body = await req.json().catch(() => ({}));
            const name = String((body && body.name) || "").trim().slice(0, 120);
            const company = String((body && body.company) || "").trim().slice(0, 160);
            const email = String((body && body.email) || "").trim().slice(0, 200);
            const message = String((body && body.message) || "").trim().slice(0, 4000);
            const source = String((body && body.source) || "").trim().slice(0, 120);
            if (!name || !email || !message) return json({ error: "name, email and message are required" }, 422, { "Access-Control-Allow-Origin": "*" });
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid email address" }, 422, { "Access-Control-Allow-Origin": "*" });
            const rows = [["Name", name], ["Company", company], ["Email", email], ["Message", message]];
            if (source) rows.push(["Came from", source]);
            const html = `<div style="font-family:Inter,Helvetica,Arial,sans-serif;line-height:1.5;color:#0f172a">`
              + `<h2 style="margin:0 0 12px">New inquiry from the website</h2>`
              + rows.map(([k, v]) => `<p style="margin:0 0 10px"><strong>${escHtml(k)}:</strong><br>${escHtml(v).replace(/\n/g, "<br>")}</p>`).join("")
              + `<p style="color:#64748b;font-size:12px;margin:16px 0 0">Sent ${new Date().toISOString()} (UTC) via the /contact/ form</p></div>`;
            const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
            try {
              const r = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
                body: JSON.stringify({
                  from: "Steady Orbit Systems <site@axel.steadyorbitsystems.ai>",
                  to: ["mike@steadyorbitsystems.com"],
                  reply_to: email,
                  subject: `New inquiry from ${name}${company ? " \u2014 " + company : ""}`,
                  html,
                  text,
                }),
              });
              if (!r.ok) {
                const detail = await r.json().catch(() => null);
                console.error("resend send failed", r.status, JSON.stringify(detail));
                return json({ error: `send failed (${r.status})`, detail: detail && detail.message ? detail.message : null }, 502, { "Access-Control-Allow-Origin": "*" });
              }
              const j = await r.json().catch(() => ({}));
              return json({ ok: true, id: j && j.id ? j.id : null }, 200, { "Access-Control-Allow-Origin": "*" });
            } catch (e) {
              console.error("resend call failed", e && e.message);
              return json({ error: `send failed: ${e && e.message}` }, 502, { "Access-Control-Allow-Origin": "*" });
            }
          }
          // ---- /api/decide (relay; clef decision model on the Workers AI binding env.AI) ----
          if (p === "/api/decide" && req.method === "OPTIONS") {
            return new Response(null, { headers: { ...RELAY_CORS, "Access-Control-Allow-Methods": "POST, GET, OPTIONS" } });
          }
          if (p === "/api/decide" && (req.method === "GET" || req.method === "POST")) {
            return await relayDecideHandler(req, url, env);
          }
async function relayDecideHandler(req, url, env) {
            if (relayRateLimited(req, 15)) return json({ error: "rate limited" }, 429, { "Access-Control-Allow-Origin": "*" });
            const dm = await decisionModel(env);
            if (!env.AI) return json({ error: "decide not configured (AI binding missing)" }, 503, { "Access-Control-Allow-Origin": "*" });
            let state, questions, session_id, user;
            if (req.method === "POST") {
              const body = await req.json().catch(() => null);
              if (!body || typeof body !== "object") return json({ error: "invalid JSON body" }, 422, { "Access-Control-Allow-Origin": "*" });
              state = body.state; questions = body.questions; session_id = body.session_id; user = body.user;
            } else {
              state = url.searchParams.get("state") || "";
              try { questions = JSON.parse(url.searchParams.get("questions") || ""); } catch (e) {
                return json({ error: "questions must be urlencoded JSON" }, 422, { "Access-Control-Allow-Origin": "*" });
              }
              session_id = url.searchParams.get("session_id") || undefined;
              user = url.searchParams.get("user") || undefined;
            }
            if (typeof state !== "string" && typeof state !== "object")
              return json({ error: "need state (string or object)" }, 422, { "Access-Control-Allow-Origin": "*" });
            const invalid = validateQuestions(questions);
            if (invalid) return json({ error: invalid }, 422, { "Access-Control-Allow-Origin": "*" });
            try {
              const r = await env.AI.run("@cf/cloudflare/" + dm, { model: dm, state, questions });
              return json(r, 200, { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
            } catch (e) {
              return json({ error: "clef call failed: " + (e && e.message) }, 502, { "Access-Control-Allow-Origin": "*" });
            }
          }

          if (p === "/api/health" && req.method === "GET") {
            let pointmapVersion = null;
            try {
              const synthX = PM.synth(10, 2, 1);
              const frame = PM.buildFrame(synthX, { d: 2, threshold: "median", seed: 1 });
              pointmapVersion = frame.version;
            } catch (e) {
              pointmapVersion = null;
            }
            return json({ ok: true, worker: "sos-agent/worker-base", pointmap_version: pointmapVersion, limits: { version: LIMITS_VERSION, max_items: MAX_ITEMS }, diagnostics: { math: "wayfinder-math", radius: "radius", control: VERSION3, outcomes: VERSION4, axis_trial: VERSION5, consistency: VERSION6, placement: "placement", rayleigh: VERSION2, admission: VERSION8, azimuth: VERSION7 }, now: (/* @__PURE__ */ new Date()).toISOString() });
          }
          if (p === "/api/map/sos/fits" && req.method === "GET") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            return json({ fits: await listFits(db) });
          }
          let m = p.match(/^\/api\/map\/sos\/fits\/(\d+)$/);
          if (m && req.method === "GET") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            const id2 = Number(m[1]);
            const { results } = await db.prepare(`SELECT * FROM fits WHERE id = ?`).bind(id2).all();
            const row = (results ?? [])[0];
            if (!row) return json({ error: "not found" }, 404);
            const all = await listFits(db);
            return json({
              ...rowToCamel(row),
              fit: JSON.parse(row.fit_json),
              population_comparison: populationComparison(all, row)
            });
          }
          if (m && req.method === "DELETE") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            await db.prepare(`DELETE FROM fits WHERE id = ?`).bind(Number(m[1])).run();
            return json({ ok: true });
          }
          if (p === "/api/map/sos/narrate" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            const { id: id2 } = await req.json().catch(() => ({}));
            const { results } = await db.prepare(`SELECT * FROM fits WHERE id = ?`).bind(Number(id2)).all();
            const row = (results ?? [])[0];
            if (!row) return json({ error: "not found" }, 404);
            const all = await listFits(db);
            const fit = JSON.parse(row.fit_json);
            const pop = populationComparison(all, row);
            const compact = {
              repo: `${row.owner}/${row.repo}`,
              n_items: fit.n_items,
              basis_mode: fit.basis_mode,
              basis: (fit.basis_detail ?? []).map((x) => ({ concept: x.concept, terms: x.terms, df: x.df })),
              basis_pruned: fit.basis_pruned,
              pc12: fit.pc12,
              sphere_holdout_r2: fit.sphere_holdout_r2,
              ablation_delta: fit.ablation_delta,
              null: fit.null,
              sparse: fit.sparse,
              compass: fit.compass,
              gaps: fit.gaps,
              pole: fit.pole,
              holes_on_curve: fit.holes_on_curve,
              single_action_targets: fit.single_action_targets,
              lens_ideations: fit.lens_ideations,
              population_comparison: pop.rows
            };
            const instructions = "You are SOS Agent, a corpus-curvature assessor. Write a plain-text assessment (no markdown, no headers, no bullet symbols) of the repository whose FIT data follows. Rules: exclusion-only statistical language (a null is excluded or not excluded, never confirmed); cite the actual numbers; explain that the primitive basis was learned from this corpus and LLM-curated (name the concepts and mention what was pruned as boilerplate if basis_pruned is non-empty); name the weakest primitives and the concrete single-action targets; describe the lens ideations as NSS (negative-skill-space) gap-fills that move the pole and the curve, quoting each lens's NSS axis and its measured synthetic-insert pole shift and delta R2 (never describe them as pushing toward an ideal pole); interpret the population comparison honestly (small n means weak comparisons, say so); no em dashes; direct, specific, no filler, no hedging boilerplate. 200-350 words.";
            let upstream;
            try {
              upstream = await env.AI.run(MODEL2, {
                messages: [
                  { role: "system", content: instructions },
                  { role: "user", content: JSON.stringify(compact) }
                ],
                stream: true,
                max_tokens: 1200
              });
            } catch (e) {
              console.error("llm call failed", e?.message);
              return json({ error: `llm failed: ${e?.message}` }, 502);
            }
            const encoder2 = new TextEncoder();
            const decoder = new TextDecoder();
            const stream = new ReadableStream({
              async start(controller) {
                let full = "";
                let buf = "";
                try {
                  for await (const chunk of upstream) {
                    buf += decoder.decode(chunk, { stream: true });
                    const lines = buf.split("\n");
                    buf = lines.pop() ?? "";
                    for (const line of lines) {
                      const t = line.trim();
                      if (!t.startsWith("data:")) continue;
                      const payload = t.slice(5).trim();
                      if (!payload || payload === "[DONE]") continue;
                      try {
                        const evt = JSON.parse(payload);
                        if (typeof evt.response === "string" && evt.response) {
                          full += evt.response;
                          controller.enqueue(encoder2.encode(evt.response));
                        }
                      } catch {
                      }
                    }
                  }
                  try {
                    await db.prepare(`UPDATE fits SET narrative = ? WHERE id = ?`).bind(full, Number(id2)).run();
                  } catch (err) {
                    console.error("narrative persist failed", err?.message);
                  }
                } catch (err) {
                  console.error("stream relay error", err?.message);
                  controller.enqueue(encoder2.encode("\n[stream error]"));
                }
                controller.close();
              }
            });
            return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
          }
          if (p === "/api/map/sos/assess" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            const { url: repoUrl, baseline_id, fill_size, max_files } = await req.json().catch(() => ({}));
            const parsed = parseRepoUrl(repoUrl || "");
            if (!parsed) return json({ error: "not a GitHub repo URL" }, 400);
            let corpus;
            try {
              corpus = await fetchCorpus(parsed.owner, parsed.repo, max_files && max_files > 0 ? max_files : 150, env.GITHUB_TOKEN);
            } catch (e) {
              console.error("corpus fetch failed", e?.message);
              return json({ error: `corpus fetch failed: ${e?.message}` }, 502);
            }
            if (corpus.files.length < 5)
              return json({ error: `only ${corpus.files.length} usable text files; need >= 5` }, 422);
            let basis;
            let rawInfo = { vocab_size: 0, kept_terms: 0, raw_clusters: 0 };
            if (baseline_id) {
              const { results } = await db.prepare(`SELECT * FROM fits WHERE id = ?`).bind(Number(baseline_id)).all();
              const baseRow = (results ?? [])[0];
              if (!baseRow) return json({ error: `baseline FIT ${baseline_id} not found` }, 404);
              const baseFit = JSON.parse(baseRow.fit_json);
              const prims = baseFit.basis_detail ?? [];
              if (!prims.length) return json({ error: `baseline FIT ${baseline_id} carries no basis_detail` }, 422);
              const vectors = vectorsFromBasis(corpus.files, prims);
              basis = {
                mode: `reused_basis_from_fit_${baseline_id}`,
                primitives: prims.map((prm, i) => ({ ...prm, df: +(vectors.reduce((s, r) => s + r[i], 0) / vectors.length).toFixed(3), reason: `reused from FIT #${baseline_id}`, source_index: i })),
                vectors,
                pruned: [],
                note: `basis reused from FIT #${baseline_id} (${baseRow.owner}/${baseRow.repo} @ ${baseRow.created_at}) for a comparable rerun`
              };
            } else {
              const rejected = /* @__PURE__ */ new Set();
              let best = null;
              const rounds = [];
              for (const k of [16, 40, 80]) {
                const raw = dropPrimitives(deriveBasis(corpus.files, k), rejected);
                rawInfo = { vocab_size: raw.vocab_size, kept_terms: raw.kept_terms, raw_clusters: raw.primitives.length };
                if (raw.primitives.length < 3) {
                  rounds.push(`k=${k}: ${raw.primitives.length} candidates`);
                  break;
                }
                const cand = await refineBasis(env.AI, raw, corpus.files, { ...parsed, ...corpus.meta }, 10);
                rounds.push(`k=${k}: ${raw.primitives.length} candidates -> ${cand.mode === "learned_latent_raw" ? "raw" : cand.primitives.length + " kept"}`);
                const refined = cand.mode !== "learned_latent_raw";
                if (!best || refined && (best.mode === "learned_latent_raw" || cand.primitives.length > best.primitives.length)) best = cand;
                if (refined && cand.primitives.length >= 5) break;
                for (const prm of cand.pruned) for (const t of prm.terms) rejected.add(t);
                if (!refined) for (const prm of raw.primitives) for (const t of prm.terms) rejected.add(t);
              }
              if (!best) return json({ error: `could not derive a latent basis; corpus too thin` }, 422);
              basis = best;
              basis.note = [basis.note, `widening: ${rounds.join("; ")}`].filter(Boolean).join(" | ");
            }
            const items = corpus.files.map((f, i) => {
              const cov = basis.vectors[i];
              return { path: f.path, coverage: cov, phi: cov.reduce((s, v) => s + v, 0) };
            });
            const fit = {
              ...runFit(items, `${parsed.owner}/${parsed.repo}`, basis.primitives.map((prm) => prm.concept), fill_size ?? 5),
              basis_mode: basis.mode,
              basis_note: basis.note,
              basis_detail: basis.primitives,
              basis_pruned: basis.pruned,
              vocab: { size: rawInfo.vocab_size, kept_terms: rawInfo.kept_terms, raw_clusters: rawInfo.raw_clusters },
              baseline_id: baseline_id ?? null
            };
            const ins = await db.prepare(
              `INSERT INTO fits (repo_url, owner, repo, ref, created_at, n_items, pc12, holdout_r2, ablation_delta, z_null, verdict, sparse_isolated, coverage_mean, entropy, basis, fit_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              repoUrl.trim(),
              parsed.owner,
              parsed.repo,
              corpus.ref,
              (/* @__PURE__ */ new Date()).toISOString(),
              fit.n_items,
              fit.pc12,
              fit.sphere_holdout_r2,
              fit.ablation_delta,
              fit.null.z,
              fit.null.verdict,
              fit.sparse.isolated_count,
              fit.compass.coverage_mean,
              fit.compass.shannon_entropy_bits,
              JSON.stringify(basis.primitives.map((prm) => prm.concept)),
              JSON.stringify(fit)
            ).run();
            const id2 = ins?.meta?.rowId ?? null;
            const all = await listFits(db);
            const lastIdRow = id2 ?? (await db.prepare(`SELECT MAX(id) AS mid FROM fits`).first())?.mid;
            const report = {
              kind: "FIT.json",
              version: 1,
              generated_at: (/* @__PURE__ */ new Date()).toISOString(),
              repo: { url: repoUrl.trim(), owner: parsed.owner, repo: parsed.repo, ref: corpus.ref, ...corpus.meta, max_files: max_files ?? null, tree_truncated: corpus.truncated },
              fit,
              population_comparison: populationComparison(all, { id: lastIdRow, pc12: fit.pc12, holdoutR2: fit.sphere_holdout_r2, ablationDelta: fit.ablation_delta, zNull: fit.null.z, sparseIsolated: fit.sparse.isolated_count, coverageMean: fit.compass.coverage_mean, entropy: fit.compass.shannon_entropy_bits })
            };
            return json({ id: lastIdRow, report });
          }
          if (p === "/api/repo-items" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const body = await readJsonLimited(req, JSON_BODY_LIMIT);
              const result = await repoItemsHandler(body, { parseRepoUrl, fetchCorpus, githubToken: env.GITHUB_TOKEN });
              return json(result);
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/vector/search" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            const body = await req.json().catch(() => ({}));
            const text = String(body.text || body.query || "").slice(0, 2e3);
            if (!text) return json({ error: "need text (the thing to search for)" }, 400);
            const out = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [text] });
            const q = (out.data ?? [])[0];
            if (!q) return json({ error: "embedding failed" }, 502);
            const res = await env.VEC.query(q, { topK: Math.min(20, Number(body.topK) || 5), returnMetadata: "all" });
            return json({ query: text.slice(0, 120), index: "sos-embeddings", matches: (res.matches ?? []).map((m2) => ({ id: m2.id, score: +(m2.score ?? 0).toFixed(4), label: m2.metadata?.label, text: m2.metadata?.text, source: m2.metadata?.source, created: m2.metadata?.created })) });
          }
          if (p === "/api/embed" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const body = await readJsonLimited(req, JSON_BODY_LIMIT);
              const rawDocs = Array.isArray(body.texts) ? body.texts : [];
              const embedded = await embedDocuments(env, rawDocs);
              const stored = await rememberChunkedEmbeddings(env, PM.hashStr, rawDocs, embedded.vectors, String(body.source || "/api/embed").slice(0, 120));
              return json({
                model: embedded.model,
                ingestion_id: embedded.ingestion_id,
                n: embedded.vectors.length,
                D: embedded.vectors[0]?.length ?? 0,
                vectors: embedded.vectors,
                metadata: embedded.metadata,
                stored: stored.ok ? stored.stored : null,
                stored_error: stored.ok ? null : stored.error,
                vectorize_caveat: stored.ok ? stored.caveat : null
              });
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/chat" && req.method === "POST") {
            return await relayChatHandler(req, env);
          }
async function relayChatHandler(req, env) {
            const body = await req.json().catch(() => ({}));
            const message = String(body.message || "").trim().slice(0, 1e3);
            if (!message) return json({ error: "need message" }, 422);
            const system = "You are the Steady Orbit Systems site assistant. Stable Orbit builds AI automation for small and mid-sized businesses: we design the workflow, launch it, and hand over the controls - it runs itself. A typical First Orbit build ships in 2-4 weeks. Voice replies are generated by ElevenLabs and metered by use. Services: front-desk intake, insurance lookups, recall reminders, production reports, and latent-space corpus audits (the live map on this page). Contact: the audit form or mike@steadyorbitsystems.com. Answer in 1-3 short sentences, direct and concrete, no markdown, no em dashes. If you do not know something, say so and point to the contact form.";
            let out = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "system", content: system }, { role: "user", content: message }], max_tokens: 180 });
            let reply = out && typeof out.response !== "undefined" ? out.response : out && out.choices ? out.choices?.[0]?.message?.content : "";
            if (!reply) reply = "I hit an error - try that again, or use the contact form below.";
            return json({ reply: String(reply).trim() });
          }
          if (p === "/api/map" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const body = await readJsonLimited(req, JSON_BODY_LIMIT);
              await db.prepare(`CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, rule_hash TEXT, seed INTEGER, n INTEGER, dim INTEGER, d INTEGER, v2 REAL, z_null REAL, verdict TEXT, classes INTEGER, identity_failures INTEGER, measurement_red INTEGER, source TEXT, map_json TEXT)`).run();
              const loadStoredMap = async (id3) => {
                return await loadStoredMapJson(db, env, id3);
              };
              const saveMap = async (map2, source) => saveStoredMap(db, env, map2, source);
              const { id: id2, map, comparison, math_ledger, radius_comparison, placement: placement2 } = await mapRouteHandler(body, { env, PM, embedDocuments, loadStoredMap, saveMap });
              return json({ id: id2, map, comparison, radius_comparison, placement: placement2, ...math_ledger ? { math_ledger } : {} });
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/map/preview" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const body = await readJsonLimited(req, JSON_BODY_LIMIT);
              const loadStoredMap = async (id2) => {
                try {
                  return await loadStoredMapJson(db, env, id2);
                } catch (e) {
                  console.error("preview baseline load failed:", String(e?.message || e));
                  throw new ApiError(503, "map storage unavailable; retry later");
                }
              };
              const result = await mapPreviewHandler(body, { env, PM, embedDocuments, loadStoredMap });
              return json(result);
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/map/control" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const body = await readJsonLimited(req, JSON_BODY_LIMIT);
              const loadStoredMap = async (id2) => {
                try {
                  return await loadStoredMapJson(db, env, id2);
                } catch (e) {
                  console.error("control baseline load failed:", String(e?.message || e));
                  throw new ApiError(503, "map storage unavailable; retry later");
                }
              };
              const result = await mapControlHandler(body, { env, PM, embedDocuments, loadStoredMap });
              return json(result);
            } catch (e) {
              return errorResponse(e);
            }
          }
          if ((p === "/api/map/consistency" || p === "/api/map/axis-redundancy" || p === "/api/map/rayleigh" || p === "/api/map/admission" || p === "/api/map/azimuth") && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const body = await readJsonLimited(req, JSON_BODY_LIMIT);
              const loadStoredMap = async (id2) => {
                try {
                  return await loadStoredMapJson(db, env, id2);
                } catch (e) {
                  console.error("diagnostic map load failed:", String(e?.message || e));
                  throw new ApiError(503, "map storage unavailable; retry later");
                }
              };
              const result = p === "/api/map/consistency" ? await mapConsistencyHandler(body, { env, PM, embedDocuments, loadStoredMap }) : p === "/api/map/rayleigh" ? await rayleighHandler(body, { loadStoredMap, PM }) : p === "/api/map/admission" ? await admissionHandler(body, { loadStoredMap, PM }) : p === "/api/map/azimuth" ? await azimuthHandler(body, { loadStoredMap, PM }) : await axisRedundancyHandler(body, { loadStoredMap, PM });
              return json(result);
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/outcomes" && (req.method === "POST" || req.method === "GET")) {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              await db.prepare(`CREATE TABLE IF NOT EXISTS outcomes (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, baseline_id INTEGER, after_id INTEGER, target_action TEXT, target_name TEXT, predicted_delta REAL, observed_delta REAL, observed_source TEXT, verdict TEXT, verifier TEXT, supersedes INTEGER, entry_json TEXT)`).run();
              const rowToEntry = (r) => ({ id: r.id, ...JSON.parse(r.entry_json) });
              if (req.method === "GET") {
                const listOutcomes = async (baseline_id) => {
                  const q = baseline_id == null ? db.prepare(`SELECT id, entry_json FROM outcomes ORDER BY id ASC`) : db.prepare(`SELECT id, entry_json FROM outcomes WHERE baseline_id = ? ORDER BY id ASC`).bind(Number(baseline_id));
                  const { results } = await q.all();
                  return (results || []).map(rowToEntry);
                };
                return json(await outcomesGetHandler(Object.fromEntries(url.searchParams), { listOutcomes }));
              }
              const body = await readJsonLimited(req, 1 * 1024 * 1024);
              const loadStoredMap = async (id2) => {
                return await loadStoredMapJson(db, env, id2);
              };
              const getOutcome = async (id2) => {
                const row = await db.prepare(`SELECT id, entry_json FROM outcomes WHERE id = ?`).bind(Number(id2)).first();
                return row ? rowToEntry(row) : null;
              };
              const insertOutcome = async (e) => {
                const ins = await db.prepare(`INSERT INTO outcomes (created_at, baseline_id, after_id, target_action, target_name, predicted_delta, observed_delta, observed_source, verdict, verifier, supersedes, entry_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(e.created_at, e.baseline_id, e.after_id, e.target.action, e.target.name, e.predicted_delta, e.observed_delta, e.observed_source, e.task_check.verdict, e.task_check.verifier, e.supersedes, JSON.stringify(e)).run();
                return ins?.meta?.last_row_id ?? (await db.prepare(`SELECT MAX(id) AS mid FROM outcomes`).first())?.mid;
              };
              return json(await outcomesPostHandler(body, { loadStoredMap, insertOutcome, getOutcome, PM }), 201);
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p.startsWith("/api/outcomes/") && (req.method === "DELETE" || req.method === "PUT" || req.method === "PATCH")) {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            return json({ error: { status: 405, message: "the outcomes ledger is append-only: correct a row by POSTing a new row with supersedes" } }, 405);
          }
          if (p === "/api/maps" && req.method === "GET") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            await db.prepare(`CREATE TABLE IF NOT EXISTS maps (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT, rule_hash TEXT, seed INTEGER, n INTEGER, dim INTEGER, d INTEGER, v2 REAL, z_null REAL, verdict TEXT, classes INTEGER, identity_failures INTEGER, measurement_red INTEGER, source TEXT, map_json TEXT)`).run();
            const { results } = await db.prepare(`SELECT id, created_at, rule_hash, seed, n, dim, d, v2, z_null, verdict, classes, identity_failures, measurement_red, source FROM maps ORDER BY id DESC`).all();
            return json({ maps: results ?? [] });
          }
          let mm = p.match(/^\/api\/maps\/(\d+)$/);
          if (mm && req.method === "GET") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const stored = await loadStoredMapJson(db, env, mm[1]);
              if (!stored) return json({ error: "not found" }, 404);
              return json(radiusForRead(stored));
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (mm && req.method === "DELETE") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const row = await db.prepare(`SELECT map_json FROM maps WHERE id = ?`).bind(Number(mm[1])).first();
              const ptr = row ? JSON.parse(row.map_json) : null;
              if (ptr && ptr.__kv && env.SITE) await env.SITE.delete(ptr.__kv);
            } catch (e) {
              console.error("overflow cleanup skipped:", String(e?.message || e));
            }
            await db.prepare(`DELETE FROM maps WHERE id = ?`).bind(Number(mm[1])).run();
            return json({ ok: true });
          }
          if (p === "/api/maps/compare" && req.method === "POST") {
            const auth = await requireOperatorAuth(req, env);
            if (auth.notConfigured) return json({ error: "not configured: JEV_API_KEY binding missing" }, 503);
            if (auth.unauthorized) return json({ error: "unauthorized: missing or wrong bearer token" }, 401);
            try {
              const body = await readJsonLimited(req, JSON_BODY_LIMIT);
              const loadStoredMap = async (id2) => {
                return await loadStoredMapJson(db, env, id2);
              };
              const comparison = await mapsCompareHandler(body, { PM, loadStoredMap });
              return json({ comparison });
            } catch (e) {
              return errorResponse(e);
            }
          }
          if (p === "/api/assess" && req.method === "POST") return json({ error: "gone: SOS API relocated to /api/jev/map/sos/*" }, 410);
          if (p === "/api/narrate" && req.method === "POST") return json({ error: "gone: SOS API relocated to /api/jev/map/sos/*" }, 410);
          if (p === "/api/fits" && req.method === "GET") return json({ error: "gone: SOS API relocated to /api/jev/map/sos/*" }, 410);
          if (p.match(/^\/api\/fits\/(\d+)$/) && (req.method === "GET" || req.method === "DELETE")) return json({ error: "gone: SOS API relocated to /api/jev/map/sos/*" }, 410);
          return json({ error: "no route" }, 404);
        }
        if ((p === "/map" || p === "/map/" || p === "/map/index.html") && req.method === "GET") {
          return json({ error: "moved: the map UI lives in the /jev/ console" }, 410);
        }
        if ((p === "/jev" || p === "/jev/") && req.method === "GET") {
          const html = await env.SITE.get("jev-index.html", "text");
          return new Response(html ?? "jev UI not uploaded", { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
        }
        if (p === "/" || p === "/index.html") {
          const html = await env.SITE.get("index.html", "text");
          return new Response(html ?? "site not uploaded", { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
        }
        const audio = p.match(/^\/audio\/(reply-[123]\.mp3)$/);
        if (audio && req.method === "GET") {
          const data = await env.SITE.get(`audio/${audio[1]}`, "arrayBuffer");
          if (data) return new Response(data, { headers: { "Content-Type": "audio/mpeg" } });
          return new Response("not found", { status: 404 });
        }
        return new Response("not found", { status: 404 });
      })();
    } catch (e) {
      return new Response(JSON.stringify({ error: "uncaught", message: e?.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  },
  async scheduled(controller, env, ctx) {
    // EVOLUTION V2 (Lane E): dispatch by cron expression, not one trigger.
    // '0 * * * *' -> one evolution machine cycle + enqueue + queue drain.
    // Any other cron (the restored '*/5 * * * *') keeps the existing
    // automation tick call exactly as it was.
    ctx.waitUntil(runJevScheduled(env, controller && controller.cron));
  }
};
export {
  index_default as default
};