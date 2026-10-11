// jev-corpus-routes.js — Jev Corpus HTTP surface (Lane 4, SPEC-CORPUS §3.4).
//
// Routes under /api/jev/corpus, dispatched from routes-jev.js via ONE delegate
// line placed before the first legacy catch-all. Bearer auth is re-checked
// here EXACTLY like handleJevEvolution2 does (defense in depth: the dispatcher
// already ran the same gate; this module never trusts that). The auth, CORS,
// readJson and timingSafeEqual helpers are byte-identical copies of the
// deployed jev-evolution2-routes.js helpers (duplicated by design, never
// imported across the bundle boundary).
//
// THE deps.corpus CONTRACT (the integrator injects it; this module honors
// ONLY this shape and nothing else):
//
// deps.corpus = {
//   math: {
//     v2Corr(matrix) -> number                       // top-2 eigenvalue share
//     curveball(matrix, rand) -> matrix              // Strona trade null; rand = seeded PRNG fn
//     nullStats(v2obs, v2Nulls) -> {z, mean, sd, verdict}
//     shFit(rows2, L) -> {shares, E_l, amplitude, vertices}
//     dbc(shares, refShares) -> number               // dBc vs null vacuum
//   },
//   atom: {
//     atomDescent(matrix, opts) -> {flips, cycles, finalDelta, converged}
//     pca2(rows) -> {rows2, explained}               // feeds shFit rows2 + drift curves
//   },
//   lens: {
//     lensCandidates(matrix, labels, opts) -> [{id, cell, kind, hypothesis, method, params, expected_delta, score}]
//     tautologyClassify(sentence) -> {verdict, refuter}
//     driftPoints(curveA, curveB) -> {warp, per_region, z}
//     selfTestAll() -> {pass, checks: [{module, name, ok, expected, got}]}
//   },
// }
//
// selfTestAll() is the aggregate of the three lane modules' selfTests (see
// EDITS.md edit (b) for the exact integrator wiring).
//
// Storage: jev_corpus_runs in the same D1 (env.DB), created by
// ensureCorpusSchema with the guarded ALTER pattern used by the deployed
// modules (a "duplicate column" error from ALTER is treated as success).
//
// ES module, Web APIs only, no npm. No em dashes.

// ---------------------------------------------------------------------------
// VISCO INSTRUMENTS (SPEC-VISCO §3, Lane C): the four pure math functions live
// in jev-visco-math.js (Lane B's fixture-parity port of tools/visco-instruments
// verify_visco.py). This module is the routes glue ONLY: it validates input,
// audits matrices through the SAME computeAudit path as /audit (never a
// self-HTTP call), reads the outcomes ledger through the same D1 driver the
// corpus store uses, and never implements math here.
// ---------------------------------------------------------------------------
import { persistenceStats, hysteresisRollup, pronyFit, snapbackDetect } from "./jev-visco-math.js";
// POLICY CHANGELOG + STAMP (WLF policy-shift study): the changelog baseline
// seed lives in the data layer (dbx.js); the stamp mapping lives in the
// corpus deps glue (jev-corpus-deps.js) so corpusSelfTestAll can unit-check
// it. Neither import adds a fetch or a KV read: the stamp value comes from
// the SAME deps.loadPolicy accessor the gate uses.
import { ensurePolicyChangelogBaseline } from "./dbx.js";
import { policyVersionStampOf } from "./jev-corpus-deps.js";
import { scoreDoc, selfTest as scorerSelfTest, SCORER_VERSION } from "./jev-corpus-scorer.js";
import { createTasteRoutes } from "./jev-taste.js";
import { askJev } from "./jev-decide.js";
import * as tasteMath from "./jev-taste-math.js";
import { tasteFixtures } from "./fixtures/taste-fixtures.mjs";
import { standardize as edgeStandardize, measure as edgeMeasure } from "./jev-edge-standard.js";
import { handleSpectralRequest, handleOracleRequest } from "./jev-spectral.js";
import { handleLensRequest } from "./jev-lens.js";
import * as lensMathNS from "./jev-lens-math.js";
import { lensFixtures } from "./fixtures/lens-fixtures.mjs";
// JEV-TIMESERIES (SPEC-TIMESERIES 2026-10-08 §1): safe WAE telemetry writer.
import { tsWrite } from "./jev-timeseries.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const CORPUS_SCHEMA_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS jev_corpus_runs (
  id TEXT PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL,
  input_hash TEXT NOT NULL, result_json TEXT, notes TEXT,
  policy_version INTEGER
)`,
]);

// Guarded ALTERs: for a table that predates a column addition these turn a
// hard failure into an idempotent no-op. "duplicate column" is success.
const CORPUS_GUARDED_COLUMNS = Object.freeze([
  ["input_hash", "TEXT"],
  ["result_json", "TEXT"],
  ["notes", "TEXT"],
  // POLICY VERSION STAMP (WLF policy-shift study): added after first boot on
  // existing deployments, so it rides the SAME guarded-ALTER discipline as
  // the columns above ("duplicate column" from ALTER is success). No
  // backfill: pre-stamp rows keep NULL (the honest pre-stamp era).
  ["policy_version", "INTEGER"],
]);

const RUNS_TABLE = "jev_corpus_runs";
const RUN_COLS = ["id", "created_at", "kind", "input_hash", "result_json", "notes", "policy_version"];
const RESULT_CAP = 64 * 1024;
const BODY_MAX = 256 * 1024;

let _corpusSchemaDb = null;

export async function ensureCorpusSchema(db) {
  if (!db) throw new Error("ensureCorpusSchema: db binding is required");
  if (_corpusSchemaDb === db) return true;
  const drv = d1CorpusDriver(db);
  for (const ddl of CORPUS_SCHEMA_DDL) await drv.run(ddl, []);
  for (const [col, type] of CORPUS_GUARDED_COLUMNS) {
    try {
      await drv.run(`ALTER TABLE ${RUNS_TABLE} ADD COLUMN ${col} ${type}`, []);
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (!/duplicate column/i.test(msg)) throw e; // real failure: propagate
    }
  }
  _corpusSchemaDb = db;
  return true;
}

// ---------------------------------------------------------------------------
// d1CorpusDriver(db) — minimal run/get/all adapter over a Cloudflare D1
// binding (same shape as d1SqlDriver in the deployed evolution2 module).
// ---------------------------------------------------------------------------
export function d1CorpusDriver(db) {
  async function run(sql, params = []) {
    const res = await db.prepare(sql).bind(...params).run();
    return { meta: (res && res.meta) || { changes: 0 } };
  }
  async function get(sql, params = []) {
    return (await db.prepare(sql).bind(...params).first()) || null;
  }
  async function all(sql, params = []) {
    const res = await db.prepare(sql).bind(...params).all();
    return (res && res.results) || [];
  }
  return { kind: "d1-corpus-sql", run, get, all };
}

function corpusStore(drv) {
  const selectCols = RUN_COLS.join(", ");
  return {
    async insertRun(row) {
      const sql = `INSERT INTO ${RUNS_TABLE} (${selectCols}) VALUES (${RUN_COLS.map(() => "?").join(", ")})`;
      await drv.run(sql, RUN_COLS.map((c) => (row[c] === undefined ? null : row[c])));
      return row;
    },
    async findRun(kind, inputHash) {
      return drv.get(
        `SELECT ${selectCols} FROM ${RUNS_TABLE} WHERE kind = ? AND input_hash = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
        [kind, inputHash]
      );
    },
    async listRuns(limit) {
      return drv.all(
        `SELECT ${selectCols} FROM ${RUNS_TABLE} ORDER BY created_at DESC, id DESC LIMIT ?`,
        [limit]
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers (byte-identical copies of the deployed evolution2 helpers where
// marked; small local helpers are new and self-contained).
// ---------------------------------------------------------------------------
const JEV_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...JEV_CORS } });
}
function err(code, message, status = 400) {
  return json({ error: { code, message } }, status);
}

async function readJson(req) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > BODY_MAX) return { error: "BODY_TOO_LARGE" };
  const text = await req.text();
  if (text.length > BODY_MAX) return { error: "BODY_TOO_LARGE" };
  if (!text) return { error: "INVALID_BODY" };
  let body;
  try { body = JSON.parse(text); } catch { return { error: "INVALID_JSON" }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "INVALID_BODY" };
  return { body };
}

// Constant-time comparison: length fold + char-wise XOR (routes-jev.js parity).
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Same authorized() pattern as routes-jev.js / jev-evolution.js, including the
// notConfigured path and the Secrets Store runtime .get() call.
async function authorized(req, env) {
  if (!env.JEV_API_KEY) return { notConfigured: true };
  const expected = await env.JEV_API_KEY.get();
  if (!expected) return { notConfigured: true };
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(token, expected)) return { unauthorized: true };
  return { ok: true };
}

function nowIso() {
  return new Date().toISOString();
}
function newId(prefix) {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return prefix + hex;
}
// ---------------------------------------------------------------------------
// POLICY VERSION STAMP (WLF policy-shift study). currentPolicyVersion(deps,
// env) reads the CURRENT policy version through the SAME accessor the gate
// uses (deps.loadPolicy -> jev-gate.loadPolicy -> KV jev-policy.json); no new
// KV read is invented. The {doc}|{error} -> stamp mapping is
// policyVersionStampOf (jev-corpus-deps.js, unit-checked by stampSelfTest).
// Returns a positive integer, or null when the policy is unreadable (the run
// row is then recorded with a NULL policy_version: honestly unstamped).
// ---------------------------------------------------------------------------
async function currentPolicyVersion(deps, env) {
  if (!deps || typeof deps.loadPolicy !== "function") return null;
  try {
    return policyVersionStampOf(await deps.loadPolicy(env));
  } catch {
    return null;
  }
}

function helpersOf(deps) {
  const h = (deps && deps.helpers) || {};
  return {
    now: typeof h.now === "function" ? h.now : nowIso,
    newId: typeof h.newId === "function" ? h.newId : newId,
    sha256Hex: typeof h.sha256Hex === "function" ? h.sha256Hex : null,
  };
}

async function sha256hex(deps, str) {
  const h = helpersOf(deps);
  if (h.sha256Hex) return await h.sha256Hex(str); // sync or async both fine
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeParse(jsonStr) {
  try { return JSON.parse(jsonStr); } catch { return null; }
}

// Canonical JSON: sorted object keys, arrays in order. Deterministic input
// identity for sha256 hashing.
function canonicalJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}

// Audit pipeline version. Part of the audit input hash so the findRun cache
// (keyed on kind + input_hash only) never serves a row computed by older code.
const AUDIT_PIPELINE = "audit-v3-matrix-seed";

// Deterministic PRNG seeded from a hex hash (mulberry32). The audit's null
// sampling is seeded from the input hash so the SAME input always yields the
// SAME result: audit is idempotent per input sha256.
export function prngFromHex(hex) {
  let a = parseInt(hex.slice(0, 8), 16) >>> 0;
  if (!a) a = 0x9e3779b9;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
// T12: the null-draw seed comes from the MATRIX ONLY. Labels are cosmetic and the null
// count is a separate input, so neither reshuffles the draws. Nulls are drawn from one
// sequential stream: the first N draws of an N-null run are the same draws a shorter
// run uses, so a 200-null and a 400-null audit of one matrix share their first 200 nulls.
// Every audit result echoes `seed` and `seed_source`.
export async function auditSeedOf(deps, matrix) {
  const hex = await sha256hex(deps, canonicalJson({ kind: "audit-null-seed", matrix }));
  let seed = parseInt(hex.slice(0, 8), 16) >>> 0;
  if (!seed) seed = 0x9e3779b9;
  return { hex, seed, seed_source: "matrix_sha256_prefix32" };
}

function corpusError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Accepts number[][] or {rows, cols, data} (row-major flat data). Returns the
// normalized rectangular numeric rows or throws INVALID_MATRIX.
function normalizeMatrix(input) {
  let rows;
  if (Array.isArray(input)) {
    rows = input;
  } else if (input && typeof input === "object"
    && Number.isInteger(input.rows) && input.rows > 0
    && Number.isInteger(input.cols) && input.cols > 0
    && Array.isArray(input.data)) {
    if (input.data.length !== input.rows * input.cols) {
      throw corpusError("INVALID_MATRIX", `matrix data length ${input.data.length} does not match rows*cols ${input.rows * input.cols}`);
    }
    rows = [];
    for (let r = 0; r < input.rows; r++) {
      rows.push(input.data.slice(r * input.cols, (r + 1) * input.cols));
    }
  } else {
    throw corpusError("INVALID_MATRIX", "matrix must be a number[][] or {rows, cols, data}");
  }
  if (!rows.length) throw corpusError("INVALID_MATRIX", "matrix must have at least one row");
  const cols = rows[0].length;
  if (!cols) throw corpusError("INVALID_MATRIX", "matrix rows must be non-empty");
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length !== cols) {
      throw corpusError("INVALID_MATRIX", `matrix row ${i} is not the same width as row 0`);
    }
    for (let j = 0; j < row.length; j++) {
      if (typeof row[j] !== "number" || !Number.isFinite(row[j])) {
        throw corpusError("INVALID_MATRIX", `matrix[${i}][${j}] is not a finite number`);
      }
    }
  }
  return rows;
}

// Optional labels: when present, one non-empty string per row.
function optionalLabels(labels, n) {
  if (labels === undefined || labels === null) return null;
  if (!Array.isArray(labels) || labels.length !== n) {
    throw corpusError("INVALID_LABELS", "labels must be an array with one entry per matrix row");
  }
  for (let i = 0; i < labels.length; i++) {
    if (typeof labels[i] !== "string" || !labels[i].trim()) {
      throw corpusError("INVALID_LABELS", `labels[${i}] must be a non-empty string`);
    }
  }
  return labels;
}

// Required labels (placements forwards them to /api/map which needs one name
// per item; the map endpoint also requires uniqueness for names, so enforce
// uniqueness here and fail before the round trip).
function requiredLabels(labels, n) {
  const ls = optionalLabels(labels, n);
  if (!ls) throw corpusError("INVALID_LABELS", "labels is required (one non-empty string per matrix row)");
  if (new Set(ls).size !== ls.length) throw corpusError("INVALID_LABELS", "labels must be unique (they become map names)");
  return ls;
}

// nulls: default 200, positive integer, cap 1000 (SPEC §3.4 audit row).
function clampNulls(nulls) {
  if (nulls === undefined || nulls === null) return 200;
  if (!Number.isInteger(nulls) || nulls < 1) throw corpusError("INVALID_NULLS", "nulls must be a positive integer");
  return Math.min(nulls, 1000);
}

function clampTop(top) {
  if (top === undefined || top === null) return 10;
  if (!Number.isInteger(top) || top < 1) throw corpusError("INVALID_TOP", "top must be a positive integer");
  return Math.min(top, 50);
}

function requireCorpus(deps) {
  const c = deps && deps.corpus;
  if (!c || !c.math || !c.atom || !c.lens) {
    throw corpusError("CORPUS_NOT_CONFIGURED", "deps.corpus is not wired (see the contract in jev-corpus-routes.js header)");
  }
  return c;
}

// ---------------------------------------------------------------------------
// The audit computation (shared by /audit and /placements)
// ---------------------------------------------------------------------------
function cappedResultJson(result) {
  const s = JSON.stringify(result);
  if (s.length <= RESULT_CAP) return s;
  const capped = { capped: true, cap_bytes: RESULT_CAP, bytes: s.length, keys: Object.keys(result) };
  return JSON.stringify(capped).slice(0, RESULT_CAP);
}

export function computeAudit(c, matrix, nulls, rand, meta) {
  const v2 = c.math.v2Corr(matrix);
  const v2Nulls = [];
  const nullShareSets = [];
  for (let i = 0; i < nulls; i++) {
    const nm = c.math.curveball(matrix, rand);
    v2Nulls.push(c.math.v2Corr(nm));
    const nf = c.math.shFit(c.atom.pca2(nm).rows2, 3);
    if (nf && Array.isArray(nf.shares)) nullShareSets.push(nf.shares);
  }
  const ns = c.math.nullStats(v2, v2Nulls);
  const fit = c.math.shFit(c.atom.pca2(matrix).rows2, 3);
  // Reference shares: the elementwise mean over the null corpus (the "null
  // vacuum"). Deterministic because the PRNG is seeded from the input hash.
  let refShares = null;
  if (nullShareSets.length) {
    const w = Math.min(nullShareSets[0].length, fit.shares.length);
    refShares = [];
    for (let k = 0; k < w; k++) {
      refShares.push(nullShareSets.reduce((s, arr) => s + (arr[k] || 0), 0) / nullShareSets.length);
    }
  }
  const dbc = c.math.dbc(fit.shares, refShares);
  // level_dbc: the verify_claims.py claim-8 corpus level, 20*log10(|z|) - the
  // paper-convention decibel level of the corpus's deflection from the null in
  // the v2 statistic. POSITIVE and larger = more distinguishable from the null
  // (the program goal). This is the quantity the round sign gate must read; the
  // `dbc` field above is a DIFFERENT statistic (L2 share-spectrum distance to
  // the null-vacuum mean, negative when close) and is uncorrelated with z at
  // cycle scale (refs6 evidence, 2026-10-03: 4/5 consecutive pairs opposite).
  const levelDbc = Number.isFinite(ns.z) && ns.z !== 0 ? 20 * Math.log10(Math.abs(ns.z)) : null;
  // Monte Carlo standard error of z from the finite null ensemble (sd and mean estimates).
  const zSe = Number.isFinite(ns.z) && nulls > 1 ? Math.sqrt(1 / nulls + (ns.z * ns.z) / (2 * (nulls - 1))) : null;
  return { v2, z: ns.z, z_se: zSe, mean: ns.mean, sd: ns.sd, verdict: ns.verdict, dbc, level_dbc: levelDbc, shares: fit.shares, E_l: fit.E_l, nulls, seed: meta && meta.seed !== undefined ? meta.seed : null, seed_source: meta && meta.seed_source ? meta.seed_source : null, nulls_source: meta && meta.nulls_source ? meta.nulls_source : null };
}

// ---------------------------------------------------------------------------
// Run-row recording
// ---------------------------------------------------------------------------
// POLICY VERSION STAMP (WLF policy-shift study): every new run row carries
// the CURRENT policy version (or null when the policy is unreadable). No
// backfill of old rows: they stay NULL, the pre-stamp era.
async function recordRun(store, hp, kind, inputHash, result, notes, policyVersion) {
  const row = {
    id: hp.newId("cr_"),
    created_at: hp.now(),
    kind,
    input_hash: inputHash,
    result_json: cappedResultJson(result),
    notes: notes ? JSON.stringify(notes) : null,
    policy_version: policyVersion ?? null,
  };
  await store.insertRun(row);
  // JEV-TIMESERIES (SPEC-TIMESERIES 2026-10-08 §1): WAE telemetry mirror of
  // every run row (D1 stays the append-only system of record). tsWrite never
  // throws and is fire-and-forget; env is resolved from the module-level env
  // registered by jev-main buildDeps (recordRun has no env in scope).
  tsWrite(null, "corpus_run", {
    blobs: [row.id, kind, String(policyVersion)],
    doubles: [(result && (result.level_dbc ?? result.dbc)) || 0, 0],
  });
  return row;
}

// ---------------------------------------------------------------------------
// Outcomes ledger reads (SPEC-VISCO C2/C4). The ledger is the LIVE `outcomes`
// table owned by the deployed /api/outcomes route (index.js): columns are
// (id INTEGER PK, created_at TEXT, baseline_id INTEGER, after_id INTEGER,
// target_action TEXT, target_name TEXT, predicted_delta REAL, observed_delta
// REAL, observed_source TEXT, verdict TEXT, verifier TEXT, supersedes INTEGER,
// entry_json TEXT). We only READ it, never write it. The accessor uses the
// same d1CorpusDriver pattern as corpusStore (no new SQL dialect); entry_json
// is the recorded event of record and wins over the denormalized columns
// when both are present.
//
// LIVE SCHEMA FACT: there is no realized_delta column. The visco contract's
// realized_delta maps onto the ledger's observed_delta.
// ---------------------------------------------------------------------------
const OUTCOMES_TABLE = "outcomes";
const OUTCOMES_LEDGER_CAP = 1000;

function pickFiniteNumber() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

// Ledger row -> contract row {id, cycle, predicted_delta, realized_delta,
// supersedes} or null when the row carries no numeric delta pair (skipped,
// never invented).
function ledgerRowToContract(r) {
  let entry = null;
  if (r.entry_json) {
    try { entry = JSON.parse(r.entry_json); } catch { entry = null; }
  }
  const predicted = pickFiniteNumber(entry && entry.predicted_delta, r.predicted_delta);
  const realized = pickFiniteNumber(entry && entry.observed_delta, r.observed_delta);
  if (predicted === null || realized === null) return null;
  const sup = entry && entry.supersedes !== undefined && entry.supersedes !== null
    ? entry.supersedes
    : r.supersedes;
  return {
    id: r.id,
    cycle: r.id,
    predicted_delta: predicted,
    realized_delta: realized,
    supersedes: sup === undefined || sup === null ? null : sup,
  };
}

// baselineId == null reads the whole ledger (capped) so automations can roll
// up everything without per-baseline enumeration.
async function ledgerRowsForBaseline(drv, baselineId) {
  const cols = "id, predicted_delta, observed_delta, supersedes, entry_json";
  const sql = baselineId == null
    ? `SELECT ${cols} FROM ${OUTCOMES_TABLE} ORDER BY id ASC LIMIT ${OUTCOMES_LEDGER_CAP}`
    : `SELECT ${cols} FROM ${OUTCOMES_TABLE} WHERE baseline_id = ? ORDER BY id ASC LIMIT ${OUTCOMES_LEDGER_CAP}`;
  return drv.all(sql, baselineId == null ? [] : [Number(baselineId)]);
}

// Lens-run accessor for the cell-mobility series (2026-10-03). Reads the
// recorded lens runs (kind = 'lens') oldest-first; each run's result_json
// carries its candidates with real-vs-control expected deltas. Read-only.
async function mobilityLensRows(drv, limit) {
  const cols = "id, created_at, input_hash, result_json, policy_version";
  return drv.all(`SELECT ${cols} FROM ${RUNS_TABLE} WHERE kind = 'lens' ORDER BY created_at ASC LIMIT ?`, [limit]);
}


// ---------------------------------------------------------------------------
// Ledger chain consolidation (F4 fix, 2026-10-03): the live outcomes ledger
// splits the delta pair across a supersedes chain — the pre-registration row
// carries predicted_delta, the realized row carries observed_delta plus
// supersedes. ledgerRowToContract requires BOTH on one row, so every chain
// mapped to null and the hysteresis rollup read no_data forever. Consolidate
// each closed chain into ONE contract row: predicted from the oldest row that
// carries one, realized from the newest row that carries one. Rows that
// already carry both pass through as singleton loops (legacy/fixture shape).
// Pending chains (no realized anywhere) are skipped, never invented. The pure
// hysteresisRollup is untouched (fixture-anchored, 102.86 anchor).
// ---------------------------------------------------------------------------
export function consolidateLedgerChains(rawRows) {
  const nodes = new Map();
  const order = [];
  for (const r of rawRows) {
    let entry = null;
    if (r.entry_json) {
      try { entry = JSON.parse(r.entry_json); } catch { entry = null; }
    }
    const sup = entry && entry.supersedes !== undefined && entry.supersedes !== null
      ? entry.supersedes
      : (r.supersedes !== undefined && r.supersedes !== null ? r.supersedes : null);
    nodes.set(r.id, {
      predicted: pickFiniteNumber(entry && entry.predicted_delta, r.predicted_delta),
      realized: pickFiniteNumber(entry && entry.observed_delta, r.observed_delta),
      supersedes: sup,
    });
    order.push(r.id);
  }
  const superseded = new Set();
  for (const id of order) {
    const sup = nodes.get(id).supersedes;
    if (sup !== null && sup !== undefined && nodes.has(sup)) superseded.add(sup);
  }
  const rows = [];
  for (const id of order) {
    if (superseded.has(id)) continue; // folds into its tail's loop
    const chain = []; // tail -> head
    const seen = new Set();
    let cur = id;
    for (;;) {
      if (seen.has(cur)) break; // supersedes cycle guard
      seen.add(cur);
      chain.push(cur);
      const sup = nodes.get(cur).supersedes;
      if (sup === null || sup === undefined || !nodes.has(sup) || seen.has(sup)) break;
      cur = sup;
    }
    let predicted = null;
    for (let i = chain.length - 1; i >= 0 && predicted === null; i--) predicted = nodes.get(chain[i]).predicted;
    let realized = null;
    for (let i = 0; i < chain.length && realized === null; i++) realized = nodes.get(chain[i]).realized;
    if (predicted === null || realized === null) continue; // pending or malformed chain
    rows.push({
      id,
      cycle: id,
      predicted_delta: predicted,
      realized_delta: realized,
      supersedes: null,
      chain_ids: chain.slice().reverse(), // oldest -> active, response-only
    });
  }
  return { rows, ledger_rows: rawRows.length };
}

// ---------------------------------------------------------------------------
// Route handler. Dispatched from routes-jev.js BEFORE the first legacy
// catch-all; re-checks bearer auth exactly like handleJevEvolution2.
// ---------------------------------------------------------------------------
export async function handleJevCorpus(req, env, deps) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (req.method === "OPTIONS")
    return new Response(null, { headers: { ...JEV_CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });

  // Health: unauthenticated, cheap, no D1, no deps.corpus requirement.
  if (p === "/api/jev/corpus/health" && req.method === "GET") {
    const c = (deps && deps.corpus) || null;
    return json({
      ok: true,
      corpus: "ready",
      modules: { math: !!(c && c.math), atom: !!(c && c.atom), lens: !!(c && c.lens) },
    });
  }

  const auth = await authorized(req, env);
  if (auth.notConfigured) return err("NOT_CONFIGURED", "JEV_API_KEY binding missing; jev config pending", 503);
  if (auth.unauthorized) return err("UNAUTHORIZED", "missing or wrong bearer token", 401);
  if (deps.rateLimited && deps.rateLimited(req, 30)) return err("RATE_LIMITED", "rate limited", 429);

  let c;
  try {
    c = requireCorpus(deps); // 503 when the integrator has not wired the math
  } catch (e) {
    return err(e.code || "CORPUS_NOT_CONFIGURED", (e && e.message) || String(e), 503);
  }
  if (!env.DB) return err("DB_NOT_CONFIGURED", "env.DB binding missing; corpus runs unavailable", 503);
  await ensureCorpusSchema(env.DB);
  const store = corpusStore(d1CorpusDriver(env.DB));
  const hp = helpersOf(deps);
  // POLICY VERSION STAMP (WLF policy-shift study): read ONCE per request from
  // the gate's own accessor and stamped onto every run row this request writes.
  const policyVersion = await currentPolicyVersion(deps, env);

  // ---- POST /audit -----------------------------------------------------------
  if (p === "/api/jev/corpus/audit" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      // DECISION B (2026-10-02, taef8923): multipass audit mode. body.passes
      // (array of 2..8 matrices) audits EACH pass through the SAME computeAudit
      // path and reports the per-pass dBc spread -- the rate dimension of the
      // multi-pass re-grading protocol (pass spread = elastic-vs-plastic band).
      // The aggregate is response-only; each pass is recorded + idempotent as usual.
      if (Array.isArray(body.passes)) {
        if (body.passes.length < 2 || body.passes.length > 8) return err("INVALID_PASSES", "passes must be an array of 2..8 matrices", 422);
        const nulls = clampNulls(body.nulls);
        const rows0 = normalizeMatrix(body.passes[0]).length;
        const labels0 = optionalLabels(body.labels, rows0);
        const results = [];
        for (let pi = 0; pi < body.passes.length; pi++) {
          const m = normalizeMatrix(body.passes[pi]);
          if (m.length !== rows0) throw corpusError("INVALID_PASSES", "pass " + pi + " row count " + m.length + " != pass 0 row count " + rows0);
          const inputHash = await sha256hex(deps, canonicalJson({ pipeline: AUDIT_PIPELINE, kind: "audit", matrix: m, labels: labels0, nulls }));
          const existing = await store.findRun("audit", inputHash);
          if (existing) {
            const prev = safeParse(existing.result_json);
            if (prev && typeof prev === "object") { results.push({ ...prev, run_id: existing.id, cached: true }); continue; }
          }
          const sd = await auditSeedOf(deps, m);
          const r = computeAudit(c, m, nulls, prngFromHex(sd.hex), { seed: sd.seed, seed_source: sd.seed_source, nulls_source: body.nulls === undefined || body.nulls === null ? "default" : "request" });
          const row = await recordRun(store, hp, "audit", inputHash, r, { rows: m.length, cols: m[0].length, nulls }, policyVersion);
          results.push({ ...r, run_id: row.id });
        }
        const dbcs = results.map((r) => r.dbc);
        const dbcMean = dbcs.reduce((a, b) => a + b, 0) / dbcs.length;
        return json({
          multipass: true, n_passes: results.length, passes: results,
          dbc_mean: dbcMean, dbc_min: Math.min(...dbcs), dbc_max: Math.max(...dbcs),
          inter_pass_offset_dbc: Math.max(...dbcs) - Math.min(...dbcs),
        });
      }
      const matrix = normalizeMatrix(body.matrix);
      const labels = optionalLabels(body.labels, matrix.length);
      const nulls = clampNulls(body.nulls);
      const inputHash = await sha256hex(deps, canonicalJson({ pipeline: AUDIT_PIPELINE, kind: "audit", matrix, labels, nulls }));
      // Idempotent per input sha256: an identical audit returns the stored
      // result with the SAME run id and never appends a second row.
      const existing = await store.findRun("audit", inputHash);
      if (existing) {
        const prev = safeParse(existing.result_json);
        if (prev && typeof prev === "object") {
          return json({ ...prev, run_id: existing.id, cached: true });
        }
      }
      const sd = await auditSeedOf(deps, matrix);
      const result = computeAudit(c, matrix, nulls, prngFromHex(sd.hex), { seed: sd.seed, seed_source: sd.seed_source, nulls_source: body.nulls === undefined || body.nulls === null ? "default" : "request" });
      const row = await recordRun(store, hp, "audit", inputHash, result, { rows: matrix.length, cols: matrix[0].length, nulls }, policyVersion);
      return json({ ...result, run_id: row.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- POST /lens ------------------------------------------------------------
  if (p === "/api/jev/corpus/lens" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      const matrix = normalizeMatrix(body.matrix);
      const labels = optionalLabels(body.labels, matrix.length);
      const top = clampTop(body.top);
      const skip = Array.isArray(body.skip) ? body.skip : undefined;
      const inputHash = await sha256hex(deps, canonicalJson(skip ? { kind: "lens", matrix, labels, top, skip } : { kind: "lens", matrix, labels, top }));
      const candidates = c.lens.lensCandidates(matrix, labels, { top, skip });
      if (!Array.isArray(candidates)) throw corpusError("LENS_FAILED", "lensCandidates must return an array");
      const result = { candidates, count: candidates.length };
      const row = await recordRun(store, hp, "lens", inputHash, result, { rows: matrix.length, top }, policyVersion);
      return json({ ...result, run_id: row.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- POST /atom (DRY-RUN PLAN ONLY; execution is a gated directive) --------
  if (p === "/api/jev/corpus/atom" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      const matrix = normalizeMatrix(body.matrix);
      const maxFlips = body.max_flips === undefined || body.max_flips === null
        ? undefined
        : (Number.isInteger(body.max_flips) && body.max_flips > 0 ? body.max_flips : (() => { throw corpusError("INVALID_MAX_FLIPS", "max_flips must be a positive integer"); })());
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "atom", matrix, max_flips: maxFlips ?? null }));
      const d = c.atom.atomDescent(matrix, { max_flips: maxFlips });
      if (!d || !Array.isArray(d.flips)) throw corpusError("ATOM_FAILED", "atomDescent must return {flips, cycles, finalDelta, converged}");
      const result = { plan: d.flips, finalDelta: d.finalDelta, converged: !!d.converged, cycles: d.cycles };
      const row = await recordRun(store, hp, "atom", inputHash, result, { rows: matrix.length, flips: d.flips.length }, policyVersion);
      return json({ ...result, run_id: row.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- POST /classify --------------------------------------------------------
  if (p === "/api/jev/corpus/classify" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      if (typeof body.sentence !== "string" || !body.sentence.trim()) {
        return err("INVALID_SENTENCE", "sentence is required (non-empty string)", 422);
      }
      const sentence = body.sentence.trim();
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "classify", sentence }));
      const cls = c.lens.tautologyClassify(sentence);
      if (!cls || typeof cls.verdict !== "string") throw corpusError("CLASSIFY_FAILED", "tautologyClassify must return {verdict, refuter}");
      const result = { verdict: cls.verdict, refuter: cls.refuter ?? null };
      const row = await recordRun(store, hp, "classify", inputHash, result, null, policyVersion);
      return json({ ...result, run_id: row.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- POST /placements (audit, then forward vectors to OUR OWN /api/map) ----
  // The worker's /api/map contract (index.js mapRouteHandler): body must carry
  // exactly one of texts|vectors; vectors = finite rectangular rows, 10..
  // MAX_ITEMS items, D=2..768; names/labels aligned one per item. We forward
  // the RAW matrix rows as vectors (the map endpoint embeds nothing for the
  // vectors path) plus the labels; upstream errors are relayed honestly.
  if (p === "/api/jev/corpus/placements" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      const matrix = normalizeMatrix(body.matrix);
      const labels = requiredLabels(body.labels, matrix.length);
      const nulls = clampNulls(body.nulls);
      const nullsSource = body.nulls === undefined || body.nulls === null ? "default" : "request";
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "placements", matrix, labels, nulls }));
      // 1. audit. Null draws are seeded from the matrix alone (auditSeedOf), so
      // placements reports the z/dbc that POST /audit reports for the same matrix
      // and nulls, whatever labels are sent. The placements run row (kind
      // "placements", inputHash above) stays the record of this request.
      const sd = await auditSeedOf(deps, matrix);
      const audit = computeAudit(c, matrix, nulls, prngFromHex(sd.hex), { seed: sd.seed, seed_source: sd.seed_source, nulls_source: nullsSource });
      // 2. forward the raw rows as vectors to the worker's own /api/map.
      // F4 placements fix (2026-10-03): the self-fetch to `${origin}/api/map`
      // failed with error 1042 (the worker can't reliably fetch its own public
      // workers.dev URL). mapRouteHandler is now wired from index.js through
      // the deps injection chain (index.js → jev-main.js → deps.mapHandler),
      // so the placements route calls it directly — identical behavior to the
      // /api/map endpoint, no HTTP hop, no edge routing.
      if (!deps || typeof deps.mapHandler !== "function") {
        return err("MAP_FAILED", "deps.mapHandler not wired (the placements self-fetch is unreliable on workers.dev); redeploy with the mapHandler injection", 503);
      }
      let mapId;
      try {
        const mapResult = await deps.mapHandler({ vectors: matrix, labels });
        if (!mapResult || mapResult.id == null) {
          return err("MAP_FAILED", "map handler returned no map id", 502);
        }
        mapId = mapResult.id;
      } catch (mapErr) {
        const code = mapErr && mapErr.status ? mapErr.status : 502;
        const msg = (mapErr && mapErr.message) || String(mapErr);
        return err("MAP_FAILED", `map handler: ${msg}`, code);
      }
      const mapUrl = `${url.origin}/map/?id=${mapId}`;
      const result = { v2: audit.v2, z: audit.z, verdict: audit.verdict, dbc: audit.dbc, nulls, nulls_source: nullsSource, seed: audit.seed, seed_source: audit.seed_source, map_id: mapId, map_url: mapUrl };
      const row = await recordRun(store, hp, "placements", inputHash, result, { rows: matrix.length, labels: labels.length, nulls }, policyVersion);
      return json({ ...result, run_id: row.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- GET /runs -------------------------------------------------------------
  if (p === "/api/jev/corpus/runs" && req.method === "GET") {
    try {
      const rows = await store.listRuns(50);
      const runs = rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        kind: r.kind,
        input_hash: r.input_hash,
        result: safeParse(r.result_json),
        notes: safeParse(r.notes),
      }));
      return json({ runs, total: runs.length });
    } catch (e) {
      return err("CORPUS_FAILED", (e && e.message) || String(e), 500);
    }
  }

  // ---- GET /selftest ---------------------------------------------------------
  if (p === "/api/jev/corpus/selftest" && req.method === "GET") {
    try {
      const st = await c.lens.selfTestAll();
      if (!st || typeof st.pass !== "boolean" || !Array.isArray(st.checks)) {
        throw corpusError("SELFTEST_FAILED", "selfTestAll must return {pass, checks: [{module, name, ok, expected, got}]}");
      }
      // scorer-v2 selftest (structured-evidence extraction parity) rides the same gate
      const sc = scorerSelfTest();
      const allChecks = [...st.checks, ...sc.checks];
      const allPass = st.pass && sc.pass;
      const result = { pass: allPass, checks_count: allChecks.length, failed: allChecks.filter((x) => !x.ok).map((x) => `${x.module}:${x.name}`) };
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "selftest", pass: allPass, failed: result.failed }));
      await recordRun(store, hp, "selftest", inputHash, result, null, policyVersion);
      if (allPass) return json({ ok: true, checks: allChecks });
      return json({ ok: false, checks: allChecks }, 500);
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 500 : 500);
    }
  }

  // ---------------------------------------------------------------------------
  // STRUCTURED-EVIDENCE SCORER (scorer-v2, 2026-10-03). The lower-noise scorer
  // behind the round-refs3 finding: deterministic evidence extraction (pinned
  // regexes in jev-corpus-scorer.js) + ONE batched clef request per
  // doc-state (12 noul questions) via askJev. The scorer DECIDES bits; it
  // never authorizes anything and never edits anything. Python source of
  // record: session/r15/scorer_v2.py (parity-tested on arm64-path-a pre/post).
  // ---------------------------------------------------------------------------
  // ---- POST /scorer/score -----------------------------------------------------
  if (p === "/api/jev/corpus/scorer/score" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      const doc = body && body.doc;
      if (!doc || typeof doc !== "object" || typeof doc.text !== "string" || !doc.text.trim()) {
        return err("INVALID_DOC", "doc is required ({name, text} with non-empty text)", 422);
      }
      if (doc.text.length > 200000) return err("DOC_TOO_LARGE", "doc.text exceeds 200,000 code units", 413);
      if (doc.name !== undefined && typeof doc.name !== "string") return err("INVALID_DOC", "doc.name must be a string", 422);
      const h = body.hysteresis;
      if (h !== undefined && h !== null) {
        if (typeof h !== "object" || !Array.isArray(h.pre_row) || h.pre_row.length !== 12 || !h.pre_row.every((x) => x === 0 || x === 1)) {
          return err("INVALID_HYSTERESIS", "hysteresis.pre_row must be a 12-bit array", 422);
        }
      }
      let _polThresh;
      try { const pol = await deps.loadPolicy(env); if (pol && !pol.error && pol.thresholds && typeof pol.thresholds.decision_threshold === "number") _polThresh = pol.thresholds.decision_threshold; } catch (pe) { /* fall back to scorer default */ }
      const result = await scoreDoc(env, doc, { hysteresis: h || undefined, threshold: _polThresh });
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "scorer", version: SCORER_VERSION, text: doc.text }));
      try {
        await recordRun(store, hp, "scorer", inputHash,
          { row: result.row, probs: result.probs, evidence_counts: result.evidence_counts, hysteresis_applied: result.hysteresis_applied, consumed: result.clef ? result.clef.consumed : 0 },
          { doc: doc.name || "(unnamed)", version: SCORER_VERSION }, policyVersion);
      } catch (e) { /* the run row is audit trail, never the result path */ }
      return json(result);
    } catch (e) {
      const status = e.code === "DECIDE_UNAVAILABLE" ? 503 : (e.code ? 422 : 500);
      return err(e.code || "SCORER_FAILED", (e && e.message) || String(e), status);
    }
  }
  // ---- POST /scorer/matrix (batch, paced) -------------------------------------
  if (p === "/api/jev/corpus/scorer/matrix" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      if (!Array.isArray(body.docs) || body.docs.length < 1 || body.docs.length > 20) {
        return err("INVALID_DOCS", "docs must be an array of 1..20 {name, text}", 422);
      }
      for (let i = 0; i < body.docs.length; i++) {
        const d = body.docs[i];
        if (!d || typeof d !== "object" || typeof d.text !== "string" || !d.text.trim()) {
          return err("INVALID_DOCS", `docs[${i}] must be {name, text} with non-empty text`, 422);
        }
        if (d.text.length > 200000) return err("DOC_TOO_LARGE", `docs[${i}].text exceeds 200,000 code units`, 413);
      }
      const h = body.hysteresis;
      if (h !== undefined && h !== null && (typeof h !== "object" || !Array.isArray(h.pre_rows) || h.pre_rows.length !== body.docs.length || !h.pre_rows.every((r) => Array.isArray(r) && r.length === 12))) {
        return err("INVALID_HYSTERESIS", "hysteresis.pre_rows must match docs (array of 12-bit rows)", 422);
      }
      const spacing = Number.isInteger(body.spacing_ms) && body.spacing_ms >= 0 ? Math.min(body.spacing_ms, 9000) : 4500;
      const rows = [];
      let consumedTotal = 0;
      for (let i = 0; i < body.docs.length; i++) {
        let _polThreshMatrix; try { const pol = await deps.loadPolicy(env); if (pol && !pol.error && pol.thresholds && typeof pol.thresholds.decision_threshold === "number") _polThreshMatrix = pol.thresholds.decision_threshold; } catch (pe) {}
        const r = await scoreDoc(env, body.docs[i], { hysteresis: h ? { low: h.low, high: h.high, pre_row: h.pre_rows[i] } : undefined, threshold: _polThreshMatrix });
        const consumed = r.clef ? r.clef.consumed : 0;
        consumedTotal += consumed;
        rows.push({ name: r.name, row: r.row, probs: r.probs, evidence_counts: r.evidence_counts, consumed });
        if (i < body.docs.length - 1 && spacing > 0) await new Promise((res) => setTimeout(res, spacing));
      }
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "scorer-matrix", version: SCORER_VERSION, names: body.docs.map((d) => d.name || "(unnamed)") }));
      try {
        await recordRun(store, hp, "scorer-matrix", inputHash,
          { count: rows.length, consumed_total: consumedTotal }, { version: SCORER_VERSION }, policyVersion);
      } catch (e) { /* audit trail only */ }
      return json({ version: SCORER_VERSION, count: rows.length, rows, consumed_total: consumedTotal });
    } catch (e) {
      const status = e.code === "DECIDE_UNAVAILABLE" ? 503 : (e.code ? 422 : 500);
      return err(e.code || "SCORER_FAILED", (e && e.message) || String(e), status);
    }
  }

  // ---------------------------------------------------------------------------
  // TASTE (SPEC-TASTE 2026-10-05): the nature-based taste instrument. Same
  // auth, validation, error and run-recording conventions as the scorer routes
  // above. Deterministic extraction (jev-taste-math.js) -> ONE batched clef
  // call (askJev -> env.AI, policy v6) -> hysteresis verdicts. The instrument
  // never awards itself a quality score; every axis verdict is a probability
  // read over a measured number. Fixture parity source of record:
  // fixtures/taste-fixtures.mjs (Python extractor; 18/18 parity checks).
  // ---------------------------------------------------------------------------
  if (p.startsWith("/api/jev/corpus/taste")) {
    if (p === "/api/jev/corpus/taste/edge-standard" && req.method === "POST") {
      try {
        const text = await req.text();
        if (text.length > 8000000) return err("BODY_TOO_LARGE", "body exceeds 8 MB", 413);
        let body; try { body = JSON.parse(text); } catch { return err("INVALID_JSON", "invalid JSON body", 400); }
        const width = body.width, height = body.height;
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 2000000) return err("INVALID_IMAGE", "width/height required (1..2000000 pixels)", 422);
        let grid, meta;
        if (typeof body.gray_b64 === "string" && body.gray_b64.length) {
          const bytes = Uint8Array.from(atob(body.gray_b64), (c) => c.charCodeAt(0));
          if (bytes.length !== width * height) return err("INVALID_IMAGE", "gray_b64 length != width*height", 422);
          const st = edgeStandardize(bytes, width, height);
          grid = st.grid; meta = st.meta;
        } else if (typeof body.bitmap_b64 === "string" && body.bitmap_b64.length) {
          const decoded = tasteMath.decodeBitmap(body.bitmap_b64);
          grid = Array.isArray(decoded) ? decoded : (decoded && decoded.grid) || null;
          if (!grid) return err("INVALID_IMAGE", "bitmap_b64 undecodable", 422);
          meta = { pipeline: "caller-bitmap", chosen_threshold: null, achieved_coverage: null, w: grid[0] ? grid[0].length : width, h: grid.length };
        } else {
          return err("INVALID_IMAGE", "gray_b64 or bitmap_b64 required", 422);
        }
        const m = edgeMeasure(grid);
        const sym = tasteMath.mirrorSymmetryScore(grid);
        const inputHash = await sha256hex(deps, canonicalJson({ kind: "edge-standard", pipeline: "edge-standard-v1", width, height, gray_len: (body.gray_b64 || "").length }));
        let run_id = null;
        try { const row = await recordRun(store, hp, "edge-standard", inputHash, { D: m.D, r2: m.r2, coverage: meta.achieved_coverage, threshold: meta.chosen_threshold, traced_pixels: meta.traced_pixels }, { pipeline: "edge-standard-v1" }, policyVersion); run_id = row && row.id; } catch (e2) { /* audit trail only */ }
        const ascii = grid.map((r0) => r0.map((v) => (v ? "1" : "0")).join("")).join("\n");
        return json({ pipeline: "edge-standard-v1", meta, features: { fractal_band: { D: m.D, r2: m.r2 }, symmetry_present: { score: sym.score, axis: sym.axis } }, grid_b64: btoa(ascii), run_id });
      } catch (e) {
        return err(e && e.code ? e.code : "EDGE_STANDARD_FAILED", (e && e.message) || String(e), e && e.code ? 422 : 500);
      }
    }
    const tasteDeps = {
      askJev: async ({ questions }) =>
        askJev(env, "taste-v1: nature-law axis verdicts; each instruction carries a measured feature value", questions, { session_id: "taste-v1" }),
      tasteMath,
      recordRun: async (r) => {
        try {
          const row = await recordRun(store, hp, r.kind, r.input_hash, r.result, r.notes || {}, policyVersion);
          return { run_id: row && row.id };
        } catch (e) {
          return { run_id: null, run_error: String((e && e.message) || e) };
        }
      },
      policy: () => ({ thresholds: { decision_threshold: 0.55 } }),
      tasteFixtures: () => tasteFixtures,
    };
    let tr;
    try { tr = createTasteRoutes(tasteDeps); } catch (e) { return err("TASTE_NOT_CONFIGURED", (e && e.message) || String(e), 503); }
    const toTasteRes = (out) => json(out.body, out.status || 200);
    if (p === "/api/jev/corpus/taste/selftest" && req.method === "GET") {
      try { return toTasteRes(await tr.tasteSelftest()); } catch (e) { return err("TASTE_SELFTEST_FAILED", (e && e.message) || String(e), 500); }
    }
    if (p === "/api/jev/corpus/taste/score" && req.method === "POST") {
      try {
        const text = await req.text();
        if (text.length > 8000000) return err("BODY_TOO_LARGE", "body exceeds 8 MB", 413);
        let body; try { body = JSON.parse(text); } catch { return err("INVALID_JSON", "invalid JSON body", 400); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return err("INVALID_BODY", "body must be an object", 400);
        return toTasteRes(await tr.tasteScore(body));
      } catch (e) {
        return err("TASTE_SCORE_FAILED", (e && e.message) || String(e), e && e.code ? 422 : 500);
      }
    }
    if (p === "/api/jev/corpus/taste/matrix" && req.method === "POST") {
      try {
        const text = await req.text();
        if (text.length > 16000000) return err("BODY_TOO_LARGE", "body exceeds 16 MB", 413);
        let body; try { body = JSON.parse(text); } catch { return err("INVALID_JSON", "invalid JSON body", 400); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return err("INVALID_BODY", "body must be an object", 400);
        return toTasteRes(await tr.tasteMatrix(body));
      } catch (e) {
        return err("TASTE_MATRIX_FAILED", (e && e.message) || String(e), e && e.code ? 422 : 500);
      }
    }
    return err("NOT_FOUND", "unknown taste route", 404);
  }

  // ---------------------------------------------------------------------------
  // SPECTRAL-STANDARD-V1 + HIERARCHY-ORACLE (2026-10-06, PR #292). Same auth,
  // validation, error and run-recording conventions as the taste routes above.
  // Spectral sibling of edge-standard-v1: walk-mode d_w/d_s over pinned
  // ladders (ink-pixel graph or Delaunay centroid-adjacency graph) + series
  // counting exponent; /oracle composes edge-standard D + centroid walk +
  // the Einstein-relation consistency gate. Verdicts are data, never
  // authorization. Canonical modules: jev-spectral-math.js (P3 Euclidean-MSD
  // patch), jev-spectral-centroid.js; fixtures/spectral-fixtures.mjs carries
  // Python-source-of-record expectations for the selftest.
  // ---------------------------------------------------------------------------
  if (p.startsWith("/api/jev/corpus/spectral") || p === "/api/jev/corpus/oracle") {
    const spectralCtx = {
      edgeStandardize,
      edgeMeasure,
      tasteMath,
      recordRun: async (kind, inputHash, result, notes) => {
        try {
          const row = await recordRun(store, hp, kind, inputHash, result, notes || {}, policyVersion);
          return { run_id: row && row.id };
        } catch (e) { return { run_id: null, run_error: String((e && e.message) || e) }; }
      },
      sha256hex,
      canonicalJson,
    };
    try {
      if (p === "/api/jev/corpus/oracle") {
        if (req.method !== "POST") return err("METHOD_NOT_ALLOWED", "POST only", 405);
        const out = await handleOracleRequest(req, spectralCtx);
        return json(out.body, out.status || 200);
      }
      const out = await handleSpectralRequest(req, p, spectralCtx);
      return json(out.body, out.status || 200);
    } catch (e) {
      return err("SPECTRAL_FAILED", (e && e.message) || String(e), e && e.code ? 422 : 500);
    }
  }

  // ---------------------------------------------------------------------------
  // LENS-STANDARD-V1 (2026-10-06, PR #292): the powered-lens self-correcting
  // instrument. POST /lens/correct = multi-mode estimate -> pinned sequential
  // inverse order -> re-measure D; GET /lens/selftest = fixture parity vs the
  // Python source of record (compact fixtures: masks regenerated in-worker via
  // goldRender + warp). Verdicts are data, never authorization.
  // ---------------------------------------------------------------------------
  if (p.startsWith("/api/jev/corpus/lens")) {
    const lensCtx = {
      edgeStandardize,
      edgeMeasure,
      tasteMath,
      recordRun: async (kind, inputHash, result, notes) => {
        try {
          const row = await recordRun(store, hp, kind, inputHash, result, notes || {}, policyVersion);
          return { run_id: row && row.id };
        } catch (e) { return { run_id: null, run_error: String((e && e.message) || e) }; }
      },
      sha256hex,
      canonicalJson,
      lensMath: lensMathNS,
      lensFixtures,
    };
    try {
      const out = await handleLensRequest(req, p, lensCtx);
      return json(out.body, out.status || 200);
    } catch (e) {
      return err("LENS_FAILED", (e && e.message) || String(e), e && e.code ? 422 : 500);
    }
  }

  // ---------------------------------------------------------------------------
  // VISCO INSTRUMENTS (SPEC-VISCO C1-C4). Same auth, validation, error and
  // run-recording conventions as the routes above. C1/C3 audit through the
  // SAME computeAudit used by /audit (never a self-HTTP call); C2/C4-ledger
  // read the live outcomes table read-only through the accessor above.
  // ---------------------------------------------------------------------------

  // ---- POST /visco/persistence -----------------------------------------------
  if (p === "/api/jev/corpus/visco/persistence" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      const matrix = normalizeMatrix(body.matrix);
      if (body.metric !== undefined && body.metric !== null && body.metric !== "dbc") {
        throw corpusError("INVALID_METRIC", "metric must be \"dbc\" (the only level metric the audit exposes)");
      }
      if (!Array.isArray(body.flipped_cells)) {
        throw corpusError("INVALID_FLIPS", "flipped_cells is required (array of {row, axis})");
      }
      const flips = body.flipped_cells.map((f, i) => {
        if (!f || typeof f !== "object" || Array.isArray(f)) {
          throw corpusError("INVALID_FLIPS", `flipped_cells[${i}] must be an object {row, axis}`);
        }
        if (!Number.isInteger(f.row) || f.row < 0 || f.row >= matrix.length) {
          throw corpusError("INVALID_FLIPS", `flipped_cells[${i}].row is not a valid matrix row index (matrix has ${matrix.length} rows)`);
        }
        if (!Number.isInteger(f.axis) || f.axis < 0 || f.axis > 11 || f.axis >= matrix[0].length) {
          throw corpusError("INVALID_FLIPS", `flipped_cells[${i}].axis must be an integer in 0..11 (matrix has ${matrix[0].length} columns)`);
        }
        return { row: f.row, axis: f.axis };
      });
      if (!Array.isArray(body.regraded)) {
        throw corpusError("INVALID_REGRADED", "regraded is required (array of {pass, rows: [{row, bits[12]}]})");
      }
      const regradedPasses = body.regraded.map((pass, i) => {
        if (!pass || typeof pass !== "object" || Array.isArray(pass) || !Array.isArray(pass.rows)) {
          throw corpusError("INVALID_REGRADED", `regraded[${i}] must be an object {pass, rows: [{row, bits}]}`);
        }
        const bitsByRow = {};
        for (let j = 0; j < pass.rows.length; j++) {
          const rr = pass.rows[j];
          if (!rr || typeof rr !== "object" || Array.isArray(rr) || !Array.isArray(rr.bits)) {
            throw corpusError("INVALID_REGRADED", `regraded[${i}].rows[${j}] must be an object {row, bits}`);
          }
          if (rr.bits.length !== 12 || rr.bits.some((b) => b !== 0 && b !== 1)) {
            throw corpusError("INVALID_REGRADED", `regraded[${i}].rows[${j}].bits must be 12 bits, each 0 or 1`);
          }
          if (rr.row === undefined || rr.row === null) {
            throw corpusError("INVALID_REGRADED", `regraded[${i}].rows[${j}].row is required`);
          }
          bitsByRow[String(rr.row)] = rr.bits;
        }
        return { pass_id: String(pass.pass !== undefined && pass.pass !== null ? pass.pass : i), bits_by_row: bitsByRow };
      });
      const nulls = clampNulls(body.nulls);
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "visco_persistence", matrix, flips, regradedPasses, nulls }));
      const existing = await store.findRun("visco_persistence", inputHash);
      if (existing) {
        const prev = safeParse(existing.result_json);
        if (prev && typeof prev === "object") {
          return json({ ...prev, run_id: existing.id, cached: true });
        }
      }
      // Level math through the SAME internal audit path /audit uses. Persistence
      // direction is fixed (base 0 -> 1, SPEC-VISCO §2.5): a flip sets the cell
      // to 1 on the loaded matrix.
      const loaded = matrix.map((r) => r.slice());
      for (const f of flips) loaded[f.row][f.axis] = 1;
      const baseAudit = computeAudit(c, matrix, nulls, prngFromHex(inputHash + ":base"));
      const loadedAudit = computeAudit(c, loaded, nulls, prngFromHex(inputHash + ":loaded"));
      // Per-pass regraded dBc: a pass that re-graded EVERY row lets us rebuild
      // the full re-graded matrix and audit it; a partial pass has no full
      // matrix to audit, so its level falls back to the loaded audit's dbc
      // (the level that pass graded toward) and the basis is recorded honestly.
      const regradedDbcs = [];
      const regradedBasis = [];
      for (const pass of regradedPasses) {
        const coversAll = matrix.every((_, ri) => Object.prototype.hasOwnProperty.call(pass.bits_by_row, String(ri)));
        if (coversAll) {
          const rebuilt = matrix.map((_, ri) => pass.bits_by_row[String(ri)]);
          const audit = computeAudit(c, rebuilt, nulls, prngFromHex(inputHash + ":regraded:" + pass.pass_id));
          regradedDbcs.push(audit.dbc);
          regradedBasis.push("audit");
        } else {
          regradedDbcs.push(loadedAudit.dbc);
          regradedBasis.push("loaded_fallback");
        }
      }
      const stats = persistenceStats({
        applied_cells: flips.map((f) => [f.row, f.axis]),
        regraded_passes: regradedPasses,
        base_dbc: baseAudit.dbc,
        loaded_dbc: loadedAudit.dbc,
        regraded_dbcs: regradedDbcs,
      }); // OBJECT-input signature (jev-visco-math.js); positional form would crash (input.applied_cells undefined)
      const verdict = stats.applied_count === 0
        ? "no_flips_applied"
        : stats.persistence_fraction === 1
          ? "persisted"
          : stats.persistence_fraction === 0
            ? "not_persisted"
            : "partially_persisted";
      const result = {
        applied: stats.applied_count,
        persisted: stats.persisted_count,
        persistence_fraction: stats.persistence_fraction,
        per_pass_fractions: stats.per_pass_fractions,
        dbc: {
          base: baseAudit.dbc,
          loaded: loadedAudit.dbc,
          regraded_passes: stats.level.dbc_regraded_passes,
          delta_load: stats.level.delta_load,
          delta_regraded_passes: stats.level.delta_regraded_passes,
          regraded_basis: regradedBasis,
        },
        scorer_variance: stats.scorer_variance,
        flips: flips.map((f) => ({ row: f.row, axis: f.axis })),
        nulls,
        verdict,
      };
      const row = await recordRun(store, hp, "visco_persistence", inputHash, result, { rows: matrix.length, cols: matrix[0].length, flips: flips.length, passes: regradedPasses.length }, policyVersion);
      return json({ ...result, run_id: row.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- GET /visco/hysteresis?baseline_id=X -----------------------------------
  if (p === "/api/jev/corpus/visco/hysteresis" && req.method === "GET") {
    try {
      const raw = url.searchParams.get("baseline_id");
      if (raw === null || raw === "") {
        throw corpusError("INVALID_BASELINE", "baseline_id query parameter is required");
      }
      const baselineId = Number(raw);
      if (!Number.isFinite(baselineId)) {
        throw corpusError("INVALID_BASELINE", "baseline_id must be a number");
      }
      const ledger = await ledgerRowsForBaseline(d1CorpusDriver(env.DB), baselineId);
      const cons = consolidateLedgerChains(ledger);
      const rows = cons.rows;
      if (!rows.length) {
        return json({
          loops: [],
          total_sum_abs: 0,
          total_mean_per_cycle: 0,
          sum_abs: 0,
          mean_per_cycle: 0,
          n_cycles: 0,
          active_rows: 0,
          verdict: "no_data",
          note: ledger.length
            ? "ledger has rows for this baseline but no closed predicted->realized chain (pending pre-registrations or rows carrying only one delta)"
            : "ledger empty for this baseline",
          baseline_id: baselineId,
          ledger_rows: ledger.length,
          skipped_rows: ledger.length - rows.length,
        });
      }
      const rollup = hysteresisRollup(rows);
      // Enrich each loop with the full ledger chain (hysteresisRollup sees one
      // consolidated row per chain; the loop's own chain_ids is the tail id).
      const chainById = new Map(rows.map((r) => [r.id, r.chain_ids]));
      const loops = (rollup.loops || []).map((l) => ({
        ...l,
        ledger_chain_ids: chainById.get(l.chain_ids && l.chain_ids[0]) || l.chain_ids,
      }));
      const result = {
        ...rollup,
        loops,
        sum_abs: rollup.total_sum_abs,
        mean_per_cycle: rollup.total_mean_per_cycle,
        verdict: "measured",
        baseline_id: baselineId,
        ledger_rows: ledger.length,
        skipped_rows: ledger.length - rows.length,
      };
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "visco_hysteresis", baseline_id: baselineId, rows }));
      const rrow = await recordRun(store, hp, "visco_hysteresis", inputHash, result, { baseline_id: baselineId, ledger_rows: ledger.length }, policyVersion);
      return json({ ...result, run_id: rrow.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- GET /visco/prony?metric=dbc&arms=2 ------------------------------------
  if (p === "/api/jev/corpus/visco/prony" && req.method === "GET") {
    try {
      const metric = url.searchParams.get("metric") || "dbc";
      if (metric !== "dbc" && metric !== "v2" && metric !== "z") {
        throw corpusError("INVALID_METRIC", "metric must be one of dbc, v2, z");
      }
      let arms = 2;
      const armsRaw = url.searchParams.get("arms");
      if (armsRaw !== null) {
        arms = Number(armsRaw);
        if (!Number.isInteger(arms) || arms < 1 || arms > 3) {
          throw corpusError("INVALID_ARMS", "arms must be an integer in 1..3 (SPEC-VISCO §2.4 caps K at 3)");
        }
      }
      // POLICY VERSION FILTER (WLF policy-shift study): &policy_version=N
      // restricts the series to audit runs stamped with that policy version.
      // Rows with a NULL policy_version (the pre-stamp era, and any run
      // recorded while the policy was unreadable) are EXCLUDED under a filter
      // and INCLUDED when no filter is given.
      let policyVersionFilter = null;
      const pvRaw = url.searchParams.get("policy_version");
      if (pvRaw !== null && pvRaw !== "") {
        policyVersionFilter = Number(pvRaw);
        if (!Number.isInteger(policyVersionFilter) || policyVersionFilter < 1) {
          throw corpusError("INVALID_POLICY_VERSION", "policy_version must be a positive integer");
        }
      }
      // Ordered audit history from the SAME jev_corpus_runs store /runs reads
      // (kind='audit' rows; result_json.result[metric] is the level). Oldest
      // first so t ascends.
      const drv = d1CorpusDriver(env.DB);
      const runRows = await drv.all(
        `SELECT id, created_at, kind, result_json, policy_version FROM ${RUNS_TABLE} WHERE kind = 'audit' ORDER BY created_at ASC, id ASC LIMIT 1000`,
        []
      );
      const usable = [];
      for (const r of runRows) {
        if (policyVersionFilter != null && Number(r.policy_version) !== policyVersionFilter) continue;
        const res = safeParse(r.result_json);
        const v = res && typeof res === "object" ? res[metric] : null;
        if (typeof v === "number" && Number.isFinite(v)) {
          usable.push({ run_id: r.id, created_at: r.created_at, value: v });
        }
      }
      if (usable.length < 5) {
        throw corpusError(
          "INSUFFICIENT_SERIES",
          policyVersionFilter != null
            ? `prony fit needs at least 5 usable audit runs for metric ${metric} at policy_version=${policyVersionFilter}; found ${usable.length} (kind='audit' rows with policy_version=${policyVersionFilter}; NULL/unstamped rows are excluded by the filter)`
            : `prony fit needs at least 5 usable audit runs for metric ${metric}; found ${usable.length} (kind='audit' rows in ${RUNS_TABLE} with a finite ${metric})`
        );
      }
      const times = usable.map((s) => Date.parse(s.created_at));
      const timeUsable = times.every((t) => Number.isFinite(t));
      let tBasis;
      let series;
      if (timeUsable) {
        tBasis = "created_at";
        const t0 = times[0];
        series = usable.map((s, i) => ({ t: (times[i] - t0) / 1000, value: s.value }));
      } else {
        // SPEC-VISCO §2.2 fallback: no usable time column -> cycle-indexed t.
        tBasis = "row_index";
        series = usable.map((s, i) => ({ t: i, value: s.value }));
      }
      const fit = pronyFit(series, { arms }); // opts-object signature (jev-visco-math.js); a bare number arg would be IGNORED, arms silently defaulting to 2
      const result = {
        metric,
        arms_requested: arms,
        policy_version_filter: policyVersionFilter,
        t_basis: tBasis,
        n_points: usable.length,
        ke: fit.ke,
        arms: fit.arms,
        fit_quality: fit.fit_quality_r2,
        fit_quality_r2: fit.fit_quality_r2,
        sse: fit.sse,
        series: fit.fitted,
      };
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "visco_prony", metric, arms, policy_version_filter: policyVersionFilter, t_basis: tBasis, series }));
      const rrow = await recordRun(store, hp, "visco_prony", inputHash, result, { metric, arms, policy_version_filter: policyVersionFilter, n_points: usable.length }, policyVersion);
      return json({ ...result, run_id: rrow.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- GET /visco/mobility -----------------------------------------------------
  // Cell-mobility series: mine the recorded lens runs and emit the top-cell
  // real-vs-control deflection per run with per-point matrix context. The
  // lens expected_delta is computed WITHIN its own matrix (real flip vs the
  // same flip on a curveball-shuffled control), so points are comparable
  // across matrices in MEANING; segment strictly by input_hash for
  // same-matrix reads. Zero parameters: the control-normalized deflection IS
  // the measurement. The per-round series is the z(t)-over-rounds saturation
  // reading (22-links doc section 3); NO decay-law claim on the run index
  // (section 5.5 warning 5: sweep-step vs defocus time units unreconciled).
  if (p === "/api/jev/corpus/visco/mobility" && req.method === "GET") {
    try {
      const rawLimit = url.searchParams.get("limit");
      let limit = rawLimit === null ? 200 : Number(rawLimit);
      if (!Number.isFinite(limit) || limit < 1) limit = 200;
      limit = Math.min(Math.floor(limit), 1000);
      const runs = await mobilityLensRows(d1CorpusDriver(env.DB), limit);
      const series = [];
      let skipped = 0;
      for (const r of runs) {
        let res = null;
        try { res = typeof r.result_json === "string" ? JSON.parse(r.result_json) : r.result_json; } catch (pe) { res = null; }
        const cands = res && Array.isArray(res.candidates) ? res.candidates : [];
        if (!cands.length) { skipped++; continue; }
        const reals = cands.filter((c) => c && c.kind === "real" && typeof c.expected_delta === "number" && Number.isFinite(c.expected_delta));
        reals.sort((a, b) => b.expected_delta - a.expected_delta);
        const docOf = (c) => {
          const m = /on (\S+?) deflects/.exec(c.hypothesis || "");
          return m ? m[1] : null;
        };
        const top5 = reals.slice(0, 5).map((c) => ({
          axis: Array.isArray(c.cell) ? c.cell[1] : null,
          row: Array.isArray(c.cell) ? c.cell[0] : null,
          doc: docOf(c),
          expected_delta: c.expected_delta,
        }));
        series.push({
          run_id: r.id,
          created_at: r.created_at,
          policy_version: r.policy_version,
          input_hash: r.input_hash,
          n_reals: reals.length,
          top: top5[0] || null,
          top5,
        });
      }
      const frontier = series.map((s) => (s.top ? s.top.axis : null));
      const result = {
        instrument: "cell-mobility",
        n_runs: series.length,
        skipped,
        series,
        frontier,
        note:
          "expected_delta is a real-vs-CONTROL differential computed within each run's own matrix (the control arm normalizes it), so points are comparable across matrices in meaning; segment by input_hash for same-matrix reads. The per-round series is the z(t)-over-rounds saturation reading; no decay-law claim on the run index (22-links doc 5.5 warning 5).",
      };
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "visco_mobility", limit }));
      const rrow = await recordRun(store, hp, "visco_mobility", inputHash, result, { limit, n_runs: series.length }, policyVersion);
      return json({ ...result, run_id: rrow.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- POST /visco/snapback --------------------------------------------------
  if (p === "/api/jev/corpus/visco/snapback" && req.method === "POST") {
    try {
      const { body, error } = await readJson(req);
      if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
      let series;
      let source;
      let baselineId = null;
      if (body.baseline_id !== undefined && body.baseline_id !== null && body.series === undefined) {
        baselineId = Number(body.baseline_id);
        if (!Number.isFinite(baselineId)) {
          throw corpusError("INVALID_BASELINE", "baseline_id must be a number");
        }
        const ledger = await ledgerRowsForBaseline(d1CorpusDriver(env.DB), baselineId);
        source = "ledger";
        series = consolidateLedgerChains(ledger).rows.map((r) => ({
          cycle: r.cycle,
          predicted_delta: r.predicted_delta,
          realized_delta: r.realized_delta,
        }));
      } else if (Array.isArray(body.series)) {
        source = "inline";
        series = body.series.map((s, i) => {
          if (!s || typeof s !== "object" || Array.isArray(s)) {
            throw corpusError("INVALID_SERIES", `series[${i}] must be an object {cycle, predicted_delta, realized_delta}`);
          }
          if (s.cycle === undefined || s.cycle === null) {
            throw corpusError("INVALID_SERIES", `series[${i}].cycle is required`);
          }
          const pred = Number(s.predicted_delta);
          const real = Number(s.realized_delta);
          if (!Number.isFinite(pred) || !Number.isFinite(real)) {
            throw corpusError("INVALID_SERIES", `series[${i}].predicted_delta and .realized_delta must be finite numbers`);
          }
          return { cycle: s.cycle, predicted_delta: pred, realized_delta: real };
        });
      } else {
        throw corpusError("INVALID_INPUT", "snapback needs {series: [{cycle, predicted_delta, realized_delta}]} or {baseline_id}");
      }
      const det = snapbackDetect(series);
      const result = {
        ...det,
        source,
        baseline_id: baselineId,
        n_points: series.length,
      };
      if (source === "ledger" && series.length === 0) {
        result.note = "ledger empty for this baseline";
      }
      const inputHash = await sha256hex(deps, canonicalJson({ kind: "visco_snapback", source, baseline_id: baselineId, series }));
      const rrow = await recordRun(store, hp, "visco_snapback", inputHash, result, { source, n_points: series.length }, policyVersion);
      return json({ ...result, run_id: rrow.id });
    } catch (e) {
      return err(e.code || "CORPUS_FAILED", (e && e.message) || String(e), e.code ? 422 : 500);
    }
  }

  // ---- GET /visco/policy-log ---------------------------------------------------
  // POLICY CHANGELOG (WLF policy-shift study): the wipe-proof policy
  // changelog, ascending. Bearer-auth like every other corpus route (the gate
  // above). First access after the stamp-shipping deploy seeds ONE baseline
  // row (the 2026-10-01 data wipe lost the prior v1-v4 promote history; the
  // baseline row records that honestly instead of inventing entries).
  if (p === "/api/jev/corpus/visco/policy-log" && req.method === "GET") {
    try {
      const dbx = deps && deps.dbx;
      if (!dbx || typeof dbx.listPolicyChangelog !== "function" || typeof dbx.insertPolicyChangelog !== "function") {
        return err("CHANGELOG_UNAVAILABLE", "deps.dbx policy-changelog accessors are not wired", 503);
      }
      await ensurePolicyChangelogBaseline(dbx, hp, policyVersion);
      const rows = await dbx.listPolicyChangelog(200);
      const log = rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        version: Number(r.version),
        actor: r.actor ?? null,
        source: r.source,
        summary: r.summary ?? null,
        backfilled: Number(r.backfilled) || 0,
      }));
      return json({ log, current_version: policyVersion });
    } catch (e) {
      return err("CORPUS_FAILED", (e && e.message) || String(e), 500);
    }
  }

  return err("NOT_FOUND", `no corpus route for ${req.method} ${p}`, 404);
}

// ---------------------------------------------------------------------------
// recordPolicyPromotion(deps, env, {version, actor, summary}) - the changelog
// writer for the policy promote path (routes-jev.js POST
// /api/jev/learnings/:id/promote, the only promote route the audit trail
// uses). Called AFTER a SUCCESSFUL promoteLearning (the KV bump is the system
// of record); seeds the baseline while the table is empty, then appends one
// {version, actor, source: 'promote', summary} row. Throws on a missing or
// non-positive version or an unwired dbx so the caller can surface a
// changelog_error honestly instead of pretending the entry landed.
// ---------------------------------------------------------------------------
export async function recordPolicyPromotion(deps, env, entry) {
  void env;
  const e = entry || {};
  const version = Number(e.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("recordPolicyPromotion: version must be a positive integer");
  }
  const dbx = deps && deps.dbx;
  if (!dbx || typeof dbx.insertPolicyChangelog !== "function" || typeof dbx.listPolicyChangelog !== "function") {
    throw new Error("recordPolicyPromotion: deps.dbx policy-changelog accessors are not wired");
  }
  const hp = helpersOf(deps);
  await ensurePolicyChangelogBaseline(dbx, hp, version);
  return dbx.insertPolicyChangelog({
    id: hp.newId("pc_"),
    created_at: hp.now(),
    version,
    actor: typeof e.actor === "string" && e.actor.trim() ? e.actor.trim() : null,
    source: "promote",
    summary: typeof e.summary === "string" && e.summary.trim() ? e.summary.trim() : null,
    backfilled: 0,
  });
}