
// jev-evolution2-routes.js — Evolution v2 wiring + HTTP surface (Lane E,
// SPEC-EVOLUTION-V2 §3.7 + §4 Lane E row).
//
// This module is the integration point for the five lane modules:
//   jev-quality.js  (Lane A)  jev-atoms.js   (Lane A)
//   jev-memory.js   (Lane B)  jev-cycle.js   (Lane C)
//   jev-queue.js    (Lane D)  jev-notify.js  (Lane D)
// It binds every lane hook to the REAL worker call paths:
//   - Lane A's decide() -> askJev() from jev-decide.js (the worker's existing
//     clef call: env.AI.run on the Workers AI binding). No new client is invented.
//   - Lane D's sendEmail -> the Resend call path copied from the legacy
//     /api/contact relay in index.js (POST https://api.resend.com/emails with
//     the RESEND_API_KEY Secrets Store binding via `await env.BINDING.get()`).
//   - Lane C's insertDirective -> mirrors jev-evolution.js ingestSweep's
//     directive-insert block, INCLUDING the fail-closed riskForKind
//     assignment (unknown kind -> status 'rejected', reason 'unknown_kind').
//   - Lane C's measure() -> closes over the D1 dbx snapshot (task outcome
//     counts via jev_tasks, automation run failure counts for tasks with
//     source 'schedule', directive flow via the v1 evolution store, policy
//     version, atom cumulative, candle ledger).
//   - Lane B's recall envelope asymmetry (bare array on success,
//     { results, reason } when the index is missing) is NORMALIZED HERE, at
//     the wiring layer: the cycle receives a bare array, the HTTP route
//     returns { results, count, reason? }. Lane B's module is untouched.
//
// Every INSERT lists its columns explicitly (dbx column discipline). New
// tables: jev_evolution_atoms, jev_evolution_memory, jev_evolution_candles
// (exact SPEC §2 DDL). The queue table DDL is Lane D's QUEUE_SCHEMA_DDL.
//
// ES module, Web APIs + pure JS only, no npm. No em dashes.
// ─────────────────────────────────────────────────────────────────────────────

import { askJev } from './jev-decide.js';
import {
  d1EvolutionDriver, makeEvolutionStore, riskForKind,
  ensureEvolutionSchema, DIRECTIVE_KINDS,
} from './jev-evolution.js';
import { now as stateNow, newId as stateNewId } from './jev-state.js';
import { makeDbx, d1Driver } from './dbx.js';
import { loadPolicy as gateLoadPolicy } from './jev-gate.js';
import {
  makeQualityScorer, routeByQuality, CALIBRATION,
} from './jev-quality.js';
import {
  recordAtom, cumulative, detectionPower, ATOM_COLS, atomInsertSql,
} from './jev-atoms.js';
import { makeEvolutionMemory } from './jev-memory.js';
import { runEvolutionCycle } from './jev-cycle.js';
import {
  makeEvolutionQueue, d1QueueDriver, QUEUE_SCHEMA_DDL,
} from './jev-queue.js';
import { makeEvolutionNotify } from './jev-notify.js';
// JEV CORPUS (SPEC-CORPUS 3.4/3.6): the integrator glue. This module owns the
// scheduled-path threading of inj.corpus (jev-main wires deps.corpus for the
// routes; the glue module is the single assembly point for both).
import { buildCorpusDeps, buildCorpusInj } from './jev-corpus-deps.js';

// ---------------------------------------------------------------------------
// Schema (SPEC §2): atoms, memory, candles here; queue DDL re-exported from
// Lane D's module so the column set exists in exactly one place.
// ---------------------------------------------------------------------------
export const EVOLUTION2_SCHEMA_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS jev_evolution_atoms (
  id TEXT PRIMARY KEY, directive_id TEXT, metric TEXT NOT NULL,
  d_pre REAL NOT NULL, d_post REAL NOT NULL, delta REAL NOT NULL,
  unit TEXT, cycle_id TEXT, created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS jev_evolution_memory (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT, text TEXT NOT NULL,
  identity_key TEXT NOT NULL, rule_hash TEXT, dims INTEGER,
  vectorized INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS jev_memory_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, body TEXT NOT NULL,
  directive_id TEXT, actor TEXT, created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS jev_evolution_candles (
  id TEXT PRIMARY KEY, planted_at TEXT NOT NULL, kind TEXT NOT NULL,
  sealed_hash TEXT NOT NULL, expected TEXT NOT NULL,
  detected_at TEXT, detection_json TEXT
)`,
]);

const CANDLE_COLS = ['id', 'planted_at', 'kind', 'sealed_hash', 'expected', 'detected_at', 'detection_json'];
const ATOM_TABLE = 'jev_evolution_atoms';
const MEMORY_TABLE = 'jev_evolution_memory';
const CANDLE_TABLE = 'jev_evolution_candles';
const EVENTS_TABLE = 'jev_evolution_events';

function insertSql(table, cols) {
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
}
function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}
function clampLimit(n) {
  return Math.max(1, Math.min(Number(n) || 50, 200));
}

// ---------------------------------------------------------------------------
// d1SqlDriver(db) — minimal run/get/all adapter over a Cloudflare D1 binding
// (same shape as the driver objects in jev-evolution.js / Lane B's contract).
// Used by the memory driver, the atom driver, and the candle driver.
// ---------------------------------------------------------------------------
export function d1SqlDriver(db) {
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
  return { kind: 'd1-sql', run, get, all };
}

// ---------------------------------------------------------------------------
// Per-isolate schema cache (same pattern as jev-evolution.js
// ensureEvolutionSchema): one flag per distinct D1 binding object.
// ---------------------------------------------------------------------------
let _schemaAppliedDb = null;
export async function ensureEvolution2Schema(db) {
  if (_schemaAppliedDb === db) return true;
  const drv = d1SqlDriver(db);
  for (const ddl of EVOLUTION2_SCHEMA_DDL) await drv.run(ddl, []);
  for (const ddl of QUEUE_SCHEMA_DDL) await drv.run(ddl, []);
  await ensureEvolutionSchema(db); // v1 evolution tables (idempotent, own cache)
  _schemaAppliedDb = db;
  return true;
}

// ---------------------------------------------------------------------------
// makeDecideFromEnv(env) — binds Lane A's decide(state, questions, opts) to
// the worker's REAL clef call path: jev-decide.js askJev, which runs the clef
// model on the Workers AI binding (env.AI).
// The argument adaptation is the ONLY new code; the client is reused verbatim.
// ---------------------------------------------------------------------------
export function makeDecideFromEnv(env) {
  return function decide(state, questions, opts) {
    return askJev(env, state, questions, opts);
  };
}

// ---------------------------------------------------------------------------
// resendSendEmail(env) — binds Lane D's sendEmail({ to, from, subject, html })
// to the worker's Resend path, copied from the /api/contact relay in index.js:
// POST https://api.resend.com/emails, Bearer <RESEND_API_KEY>, key resolved
// via the Secrets Store runtime call `await env.RESEND_API_KEY.get()` (the
// binding is a Secrets Store secret, NOT a plain string: calling it without
// .get() sends the secret object to Resend and fails). Throws on failure so
// Lane D's fail-soft wrapper can record { sent: false, reason: 'send_failed' }.
// ---------------------------------------------------------------------------
export function resendSendEmail(env) {
  return async function sendEmail({ to, from, subject, html }) {
    const key = env && env.RESEND_API_KEY ? await env.RESEND_API_KEY.get() : null;
    if (!key) throw new Error('RESEND_API_KEY binding missing; email not sent');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!r.ok) {
      const detail = await r.json().catch(() => null);
      const e = new Error(`resend send failed (${r.status})${detail && detail.message ? ': ' + detail.message : ''}`);
      e.status = r.status;
      throw e;
    }
    const j = await r.json().catch(() => ({}));
    return { id: j && j.id ? j.id : null };
  };
}

// ---------------------------------------------------------------------------
// Default candle config: weekly, deterministic (Lane C's cadence-parity rule),
// sealed with a SECRET-FREE salt (SPEC §3.4: the hash carries a salt, never
// a secret; the salt is public by design so detections are reproducible).
// ---------------------------------------------------------------------------
const DEFAULT_CANDLE_SALT = 'steady-orbit-evolution-v2-candle-salt-v1';

function summarizeScored(scored) {
  if (!scored || typeof scored !== 'object') return null;
  return {
    priority: scored.priority != null ? scored.priority : null,
    forecast_approval: scored.forecast_approval != null ? scored.forecast_approval : null,
    kind_ok: scored.kind_ok != null ? scored.kind_ok : null,
    confidence: scored.confidence != null ? scored.confidence : null,
  };
}

// ---------------------------------------------------------------------------
// Low-confidence gate (QA lane E1, defect 1). The floor is the quality router's
// own calibrated flag threshold (jev-quality.js CALIBRATION.flag_confidence_below),
// so routing and execution cannot drift apart. An auto kind may run only when the
// policy allows the kind, the payload is not low_confidence, and a numeric
// confidence at or above the floor is recorded. Anything else fails closed.
// ---------------------------------------------------------------------------
const CONFIDENCE_FLOOR = CALIBRATION.flag_confidence_below;
const AUTO_KINDS = DIRECTIVE_KINDS.auto;
// 2026-10-11: approval kinds the worker executes itself once approved (no Sauna claim).
const DELEGATE_KINDS = ['external_comms', 'skill_push', 'repo_push', 'memory_edit'];
// 2026-10-12 (QA lane L1, T1): terminal 'failed' queue rows an approved directive may accumulate before
// the queue stops re-enqueueing it. A permanently invalid payload must not re-enter the queue forever.
const ORPHAN_MAX_TERMINAL_FAILURES = 3;

function confidenceOf(scored) {
  if (!scored || typeof scored !== 'object') return null;
  const c = Number(scored.confidence);
  return Number.isFinite(c) ? c : null;
}

// Returns null when auto-execution is allowed, else the first failing check.
function autoBlockReason({ kind, payload, confidence }) {
  if (!AUTO_KINDS.includes(kind)) return 'kind_not_auto';
  // 2026-10-12 (QA lane L1, T2): a low_confidence payload is held in needs_approval and never runs.
  // The 2026-10-10 relaxation dropped this check, so calibration candles stored risk 'auto' and executed
  // while their payload still said "forced needs_approval". The quality router sets the flag on every
  // confidence below CALIBRATION.flag_confidence_below (0.5), so the flag carries the floor on the cycle
  // path. The raw confidence floor stays off (uncalibrated). A missing confidence still fails closed.
  if (payload && payload.low_confidence === true) return 'low_confidence';
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return 'confidence_unrecorded';
  return null;
}

// ---------------------------------------------------------------------------
// Rule-based candidate findings (SPEC §3.4 step 4). Pure function over the
// measured snapshot. Kinds are ALWAYS whitelist kinds; risk is assigned later
// by riskForKind (the cron cycle can never self-assign auto).
//   R1: >= 3 failed runs of the same automation in 24h -> ops_fix proposal
//   R2: approval latency spike (24h mean > 2x all-time mean, both >= 1 sample)
//       -> note candidate
//   R3: a research-domain token recurring in >= 2 of the 5 newest sweep
//       summaries that appears in NO older sweep -> record_learning candidate
//       pointing at a corpus mint
// ---------------------------------------------------------------------------
function buildFindings(metrics, directives, sweeps) {
  const findings = [];
  const byName = (metrics && metrics.automation_failures_by_name_24h) || {};
  for (const name of Object.keys(byName).sort()) {
    const n = Number(byName[name]) || 0;
    if (n < 3) continue;
    findings.push({
      kind: 'ops_fix',
      title: `ops_fix: automation "${name}" failed ${n} runs in 24h`,
      description: `Automation "${name}" closed terminal:failed ${n} times in the last 24 hours. Investigate the failing stage and propose a repair.`,
      target: name,
      payload: {
        automation: name, failures_24h: n, window_hours: 24,
        metric: 'automation_failures_24h', metric_d_pre: n,
      },
      metric_d_pre: n,
    });
  }

  const decided = (directives || []).filter((d) => d.decided_at != null);
  const lat = (d) => Date.parse(d.decided_at) - Date.parse(d.created_at);
  const latencyOf = (rows) => {
    const vals = rows.map(lat).filter((v) => Number.isFinite(v) && v >= 0);
    if (!vals.length) return null;
    return vals.reduce((s, x) => s + x, 0) / vals.length;
  };
  const cutoff24 = Date.parse(metrics._nowIso) - 24 * 60 * 60 * 1000;
  const decided24 = decided.filter((d) => Date.parse(d.decided_at) >= cutoff24);
  const mean24 = latencyOf(decided24);
  const meanAll = latencyOf(decided);
  if (mean24 != null && meanAll != null && decided.length >= 4
      && mean24 > 2 * meanAll && mean24 - meanAll >= 60000) {
    findings.push({
      kind: 'note',
      title: 'approval latency spike detected',
      description: `Mean directive approval latency over the last 24h is ${Math.round(mean24 / 60000)} min versus an all-time mean of ${Math.round(meanAll / 60000)} min across ${decided.length} decided directives.`,
      target: null,
      payload: { mean_latency_24h_ms: Math.round(mean24), mean_latency_all_ms: Math.round(meanAll), decided_count: decided.length },
    });
  }

  const wordRe = /[a-z]{5,}/g;
  const recent = (sweeps || []).slice(0, 5);
  const older = (sweeps || []).slice(5);
  if (recent.length >= 2) {
    const counts = {};
    for (const s of recent) {
      const seen = new Set(String(s.summary || '').toLowerCase().match(wordRe) || []);
      for (const t of seen) counts[t] = (counts[t] || 0) + 1;
    }
    const olderSeen = new Set();
    for (const s of older) {
      for (const t of (String(s.summary || '').toLowerCase().match(wordRe) || [])) olderSeen.add(t);
    }
    const recurring = Object.keys(counts)
      .filter((t) => counts[t] >= 2 && !olderSeen.has(t))
      .sort();
    if (recurring.length) {
      const token = recurring[0];
      findings.push({
        kind: 'record_learning',
        title: `recurring research domain: ${token}`,
        description: `The term "${token}" recurs across ${counts[token]} of the ${recent.length} newest sweep summaries and appears in no older sweep. Record a learning proposing a corpus mint for this recurring research domain.`,
        target: token,
        payload: {
          suggestion: `mint a knowledge corpus for the recurring research domain "${token}"`,
          domain: token,
          evidence_sweeps: recent.filter((s) => String(s.summary || '').toLowerCase().includes(token)).map((s) => s.id),
        },
      });
    }
  }
  return findings.slice(0, 10);
}

// ---------------------------------------------------------------------------
// buildEvolution2(env, masterDeps, inj) — the full v2 stack with every lane
// hook bound. masterDeps is the routes-jev master deps object (dbx, helpers,
// loadPolicy); when absent (scheduled path) the stack builds its own from env.
// `inj` is for TESTS ONLY (the e2e suite): override any collaborator.
// ---------------------------------------------------------------------------
export function buildEvolution2(env, masterDeps, inj = {}) {
  const helpers = inj.helpers || (masterDeps && masterDeps.helpers)
    || { now: stateNow, newId: stateNewId };
  if (!helpers || typeof helpers.now !== 'function' || typeof helpers.newId !== 'function') {
    throw new TypeError('buildEvolution2 requires helpers.now() and helpers.newId(prefix)');
  }
  const dbx = inj.dbx || (masterDeps && masterDeps.dbx) || makeDbx(d1Driver(env.DB));
  const sqlDriver = inj.sqlDriver || d1SqlDriver(env.DB);
  const evoDriver = inj.evoDriver || d1EvolutionDriver(env.DB);
  const store = inj.store || makeEvolutionStore(evoDriver, { helpers, dbx });
  const queueDriver = inj.queueDriver || d1QueueDriver(env.DB);

  // Lane A: quality scorer bound to the REAL clef call path (askJev).
  const decide = inj.decide || makeDecideFromEnv(env);
  const scorer = makeQualityScorer({ decide });

  // Preflight probe (SPEC §3.4 step 1): a 1-question noul smoke probe through
  // the SAME decide path. Fails closed: any throw means the decision endpoint
  // is unhealthy, which gates proposing for the cycle (measurement continues).
  async function scorePreflight() {
    try {
      const res = await decide(
        { probe: 'evolution_v2_preflight' },
        {
          ready: {
            type: 'noul',
            instructions: 'Smoke probe: is the decision endpoint reachable and answering normally? Answer true if this question reached you.',
            criteria: { true: 'the endpoint answered the probe', false: 'the endpoint could not answer' },
          },
        },
        { session_id: 'evo-fire-preflight' }
      );
      const ok = !!(res && res.answers && res.answers.ready != null);
      return { ok, raw: { task_id: res && res.task_id != null ? res.task_id : null } };
    } catch (e) {
      return { ok: false, error: (e && (e.code || e.message)) || String(e) };
    }
  }
  const quality = {
    scoreProposal: (p, opts) => scorer.scoreProposal(p, opts),
    scoreExecution: (d, r, opts) => scorer.scoreExecution(d, r, opts),
    scoreSweepReport: (r, opts) => scorer.scoreSweepReport(r, opts),
    usage: () => scorer.usage(),
    routeByQuality,
    scorePreflight,
  };

  // Lane B: memory. The recall envelope asymmetry is normalized HERE (wiring
  // decision, documented in wiring-notes.md): Lane C receives a bare array;
  // the HTTP route surfaces { results, count, reason? }.
  const memoryRaw = makeEvolutionMemory(env, { driver: sqlDriver, now: helpers.now });
  const memory = {
    embed: (t) => memoryRaw.embed(t),
    remember: (r) => memoryRaw.remember(r),
    compareBatch: (h) => memoryRaw.compareBatch(h),
    recallRaw: (q, k) => memoryRaw.recall(q, k),
    recall: async (q, k) => {
      const r = await memoryRaw.recall(q, k);
      if (Array.isArray(r)) return r;
      if (r && Array.isArray(r.results)) return r.results;
      return [];
    },
  };

  // Lane D: notify + queue. The notify wrapper reconciles the Lane C -> Lane D
  // report-shape contract: Lane C's report.proposed is
  // { route, directive_id, candidate, scored } while Lane D's digest expects a
  // directive-like { kind, title, target }. The adapter flattens the candidate
  // into the digest WITHOUT mutating the cycle report.
  const sendEmail = inj.sendEmail || resendSendEmail(env);
  const notifyRaw = makeEvolutionNotify({ sendEmail, now: helpers.now });
  const notify = {
    digest: (report) => {
      const r = report || {};
      const p = r.proposed;
      const c = p && p.candidate ? p.candidate : null;
      const adapted = c
        ? { ...r, proposed: { ...p, kind: c.kind, title: c.title, target: c.target } }
        : r;
      return notifyRaw.digest(adapted);
    },
    approvalNeeded: (d) => notifyRaw.approvalNeeded(d),
    targets: notifyRaw.targets,
  };
  const queue = makeEvolutionQueue(queueDriver, { now: helpers.now });

  // Atom driver (Lane A contract) over the new D1 table + the v1 event stream.
  const atomDriver = {
    kind: 'ev2-atoms',
    async insertAtom(row) {
      await sqlDriver.run(atomInsertSql(ATOM_TABLE), ATOM_COLS.map((c) => row[c]));
      return row;
    },
    async listAtoms() {
      return sqlDriver.all(
        `SELECT id, directive_id, metric, d_pre, d_post, delta, unit, cycle_id, created_at FROM ${ATOM_TABLE} ORDER BY created_at ASC, id ASC`,
        []
      );
    },
    insertEvent: (e) => evoDriver.insertEvent(e),
    listEvents: (o) => evoDriver.listEvents(o),
  };

  // Candle driver over the new D1 table.
  const candleDriver = {
    kind: 'ev2-candles',
    async insertCandle(row) {
      const vals = CANDLE_COLS.map((c) => (row[c] === undefined ? null : row[c]));
      await sqlDriver.run(insertSql(CANDLE_TABLE, CANDLE_COLS), vals);
      return row;
    },
    async listCandles() {
      return sqlDriver.all(
        `SELECT id, planted_at, kind, sealed_hash, expected, detected_at, detection_json FROM ${CANDLE_TABLE} ORDER BY planted_at ASC, id ASC`,
        []
      );
    },
    async markDetected(id, detectedAt, detectionJson) {
      const cols = ['detected_at', 'detection_json'];
      const row = await sqlDriver.get(`SELECT id, detected_at FROM ${CANDLE_TABLE} WHERE id = ?`, [id]);
      if (!row) return null;
      if (row.detected_at != null) return row; // already detected; idempotent
      await sqlDriver.run(
        `UPDATE ${CANDLE_TABLE} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [detectedAt, detectionJson, id]
      );
      return sqlDriver.get(`SELECT id, detected_at, detection_json FROM ${CANDLE_TABLE} WHERE id = ?`, [id]);
    },
  };

  const stack = { env, dbx, helpers, store, memory, quality, scorer, notify, queue, atomDriver, candleDriver };
  const policyVersion = { current: null };

  // ---- Lane C hook: insertDirective (mirrors jev-evolution.js ingestSweep) --
  // Fail-closed whitelist UNTOUCHED: risk is ALWAYS engine-assigned via
  // riskForKind; an unknown kind is stored as status 'rejected' with reason
  // 'unknown_kind', never silently dropped. fire=0 marks v2 machine-cycle
  // origin (v1 sweep fires are positive integers); sweep_id='ev2' marks the
  // v2 source (cycle linkage rides in the cycle_completed event report).
  // An approval alert goes out for every gated insert (fail-soft via notify).
  stack.insertDirective = async function insertDirective(cand, scored) {
    const c = cand || {};
    const kind = typeof c.kind === 'string' ? c.kind.trim() : '';
    const riskBase = riskForKind(kind);
    const nowIso = helpers.now();
    const basePayload = c.payload && typeof c.payload === 'object' && !Array.isArray(c.payload)
      ? c.payload : {};
    // QA lane E1, defect 1: an auto kind is stored as needs_approval when the payload
    // is low_confidence or the quality confidence is below the floor (fail closed on
    // a missing confidence). The stamp rides in the payload so executeDirective can
    // re-check it at execution time.
    const confidence = confidenceOf(scored);
    const autoBlock = riskBase === 'auto'
      ? autoBlockReason({ kind, payload: basePayload, confidence })
      : null;
    const risk = autoBlock ? 'needs_approval' : riskBase;
    const payloadJson = JSON.stringify({ ...basePayload, source: 'evolution_v2_cycle', quality_confidence: confidence });
    const d = {
      id: helpers.newId('ed_'),
      sweep_id: 'ev2',
      fire: 0,
      kind,
      title: typeof c.title === 'string' ? c.title : '',
      description: typeof c.description === 'string' ? c.description : '',
      target: c.target != null ? String(c.target) : null,
      payload_json: payloadJson,
      status: 'proposed',
      risk: risk || 'unknown',
      actor: null, decided_at: null, claimed_at: null, result_at: null,
      result_json: null,
      policy_version: policyVersion.current,
      created_at: nowIso,
    };
    if (risk === null) {
      d.status = 'rejected';
      d.result_at = nowIso;
      d.result_json = JSON.stringify({ reason: 'unknown_kind' });
    }
    await store.driver.insertDirective(d);
    await store.driver.insertEvent({
      ts: nowIso, sweep_id: 'ev2', directive_id: d.id, kind: 'directive_created',
      data_json: JSON.stringify({ kind, risk: d.risk, status: d.status, source: 'evolution_v2_cycle', quality: summarizeScored(scored), ...(autoBlock ? { risk_reason: autoBlock } : {}) }),
    });
    if (d.risk === 'needs_approval') {
      try {
        await notify.approvalNeeded({
          id: d.id, kind: d.kind, title: d.title, description: d.description, target: d.target, risk: d.risk,
        });
      } catch (e) {
        await store.driver.insertEvent({
          ts: helpers.now(), sweep_id: 'ev2', directive_id: d.id, kind: 'notify_failed',
          data_json: JSON.stringify({ reason: 'approval_alert', error: (e && e.message) || String(e) }),
        });
      }
    }
    return d;
  };
  stack.insertCandle = (row) => candleDriver.insertCandle(row);

  // ---- Lane C hook: measure() (closes over the D1 dbx snapshot) -------------
  // All numbers come from D1 (worker-native, SPEC §3.4 step 2): task outcome
  // counts via dbx.summary(), automation run failure rate for tasks with
  // source 'schedule' (the scheduler's createTask source) closed
  // terminal:failed in the last 24h, directive flow via the v1 store, policy
  // version, atom cumulative, candle ledger. Full scans use the same
  // clampLimit(200) ceiling as dbx.summary()/listDirectives.
  stack.measure = async function measure() {
    const nowIso = helpers.now();
    const cutoff = new Date(Date.parse(nowIso) - 24 * 60 * 60 * 1000).toISOString();
    const summary = await dbx.summary();
    const tasks = await dbx.listTasks({ limit: 200 });
    const runs = tasks.filter((t) => t && t.source === 'schedule');
    const runs24 = runs.filter((t) => {
      const ts = Date.parse(t.created_at || '');
      return Number.isFinite(ts) && ts >= Date.parse(cutoff);
    });
    const failuresByName = {};
    let failed24 = 0;
    for (const t of runs24) {
      if (t.terminal_outcome !== 'failed') continue;
      failed24 += 1;
      const title = typeof t.title === 'string' ? t.title : '';
      const name = title.startsWith('automation:') ? title.slice('automation:'.length) : title;
      failuresByName[name] = (failuresByName[name] || 0) + 1;
    }

    const directives = await store.driver.listDirectives({ limit: 200 });
    const flow = {};
    for (const d of directives) flow[d.status] = (flow[d.status] || 0) + 1;
    const lat = (d) => Date.parse(d.decided_at) - Date.parse(d.created_at);
    const latencies = directives
      .filter((d) => d.decided_at != null)
      .map(lat)
      .filter((v) => Number.isFinite(v) && v >= 0);
    const meanApprovalLatencyMs = latencies.length
      ? Math.round(latencies.reduce((s, x) => s + x, 0) / latencies.length)
      : null;

    let policyVersionValue = null;
    try {
      const pol = await stack.loadPolicy(env);
      if (pol && !pol.error && pol.doc) policyVersionValue = pol.doc.version;
    } catch { policyVersionValue = null; }
    policyVersion.current = policyVersionValue;

    const cum = await cumulative(atomDriver);
    const candles = await candleDriver.listCandles();
    const power = detectionPower(candles.map((c) => ({ detected: c.detected_at != null })));

    const metrics = {
      tasks_by_state: summary.tasks_by_state,
      tasks_by_outcome: summary.tasks_by_outcome,
      pending_approvals: summary.pending_approvals,
      cost_usd_total: summary.cost_usd_total,
      cost_usd_24h: summary.cost_usd_24h,
      automation_runs_24h: runs24.length,
      automation_failures_24h: failed24,
      automation_failure_rate_24h: runs24.length ? failed24 / runs24.length : null,
      automation_failures_by_name_24h: failuresByName,
      directive_flow: flow,
      mean_approval_latency_ms: meanApprovalLatencyMs,
      policy_version: policyVersionValue,
      atom_cumulative: { total: cum.total, monotone: cum.monotone, count: cum.count },
      candle_ledger: { planted: candles.length, detected: power.detected, missed: power.missed, power: power.power },
      _nowIso: nowIso,
    };
    const sweeps = await store.driver.listSweeps({ limit: 200 });
    const findings = buildFindings(metrics, directives, sweeps);
    const publicMetrics = { ...metrics };
    delete publicMetrics._nowIso;
    return { metrics: publicMetrics, findings };
  };
  // EVOLUTION V3 CORPUS HOOKS (SPEC-CORPUS 3.6). inj.corpus (optional):
  //   { measure(matrixish?) -> {dbc, z, verdict, drift_vs_prev},
  //     lens(matrixish?)     -> [{id, cell, kind, hypothesis, method, params, expected_delta, score}] }
  // When absent, NOTHING below runs: behavior is byte-identical to today.
  // When present, measure() gains {dbc, z, verdict, drift_vs_prev} in
  // metrics.corpus (real numbers from inj.corpus.measure or an honest error
  // field on failure - NEVER fabricated numbers), and lens candidates are
  // appended LAST to findings so regular findings keep the propose slot
  // (same precedence rule as the candle candidate, jev-cycle.js). The
  // proposals ride the EXISTING fail-closed kinds path: kind 'note' only
  // (whitelist, auto-execute = an event note), riskForKind assigns risk,
  // insertDirective rejects unknown kinds - NO new auto kind is added here.
  if (inj.corpus && typeof inj.corpus === "object") {
    const baseMeasure = stack.measure;
    stack.measure = async function measureWithCorpus() {
      const out = await baseMeasure();
      // QA lane E1, defect 2: a missing matrix is an honest "not_configured" corpus
      // leg with its reason, never an error finding. Real failures stay "error".
      const corpusMetric = { status: "ok", reason: null };
      const notConfigured = (msg) => {
        const why = typeof inj.providerReason === "function" ? inj.providerReason() : null;
        return why ? `${msg} | ${why}` : msg;
      };
      try {
        const m = await inj.corpus.measure();
        if (m && typeof m === "object") {
          corpusMetric.dbc = m.dbc ?? null;
          corpusMetric.z = m.z ?? null;
          corpusMetric.verdict = m.verdict ?? null;
          corpusMetric.drift_vs_prev = m.drift_vs_prev ?? null;
        } else {
          corpusMetric.status = "error";
          corpusMetric.error = "corpus measure returned no object";
        }
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (CORPUS_NOT_CONFIGURED_RE.test(msg)) {
          corpusMetric.status = "not_configured";
          corpusMetric.reason = notConfigured(msg);
        } else if (/degenerate null distribution/.test(msg)) {
          corpusMetric.status = "insufficient_variance";
          corpusMetric.reason = "cycle history has no metric variance (constant rows); nothing recorded";
          corpusMetric.error = msg;
        } else {
          corpusMetric.status = "error";
          corpusMetric.error = msg;
        }
      }
      try {
        const cands = await inj.corpus.lens();
        if (Array.isArray(cands)) {
          for (const cand of cands.slice(0, 5)) {
            if (!cand || typeof cand !== "object") continue;
            out.findings.push({
              kind: "note",
              title: `corpus lens [${cand.kind ?? "candidate"}] ${cand.id ?? "unlabeled"}`,
              description: typeof cand.hypothesis === "string" ? cand.hypothesis : "corpus lens candidate",
              target: null,
              payload: {
                source: "corpus_lens",
                lens_candidate: cand,
                method: cand.method ?? null,
                params: cand.params ?? null,
                expected_delta: cand.expected_delta ?? null,
                verdict_placeholder: null,
              },
            });
          }
        }
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (CORPUS_NOT_CONFIGURED_RE.test(msg)) {
          // Same provider and cause as the measure leg: status only, no finding.
          if (corpusMetric.status === "ok") {
            corpusMetric.status = "not_configured";
            corpusMetric.reason = notConfigured(msg);
          }
        } else {
          out.findings.push({
            kind: "note",
            title: "corpus lens failed",
            description: `lens proposals unavailable this cycle: ${msg}`,
            target: null,
            payload: { source: "corpus_lens", error: true },
          });
        }
      }
      out.metrics.corpus = corpusMetric;
      return out;
    };
  }
  stack.loadPolicy = (e) => {
    if (masterDeps && typeof masterDeps.loadPolicy === 'function') return masterDeps.loadPolicy(e || env);
    return (async () => {
      const doc = await gateLoadPolicy(e || env);
      return doc && !doc.error ? { doc } : { error: (doc && doc.error) || 'policy_unavailable' };
    })();
  };

  // ---- the hourly machine cycle (Lane C, fully bound) ------------------------
  stack.runCycle = () => runEvolutionCycle(env, {
    now: helpers.now,
    newId: helpers.newId,
    store,
    measure: stack.measure,
    memory,
    quality,
    notify,
    candleCfg: inj.candleCfg || { enabled: true, cadence_days: 7 },
    candleSecret: env.JEV_CANDLE_SALT || DEFAULT_CANDLE_SALT,
    insertDirective: stack.insertDirective,
    insertCandle: stack.insertCandle,
  });

  // ---- delegate executors (2026-10-11): approved worker-executable kinds run without a Sauna claim ----
  const DELEGATE_REPO = 'yubi-OS/yubiOS';
  const DELEGATE_FROM = 'site@axel.steadyorbitsystems.ai';
  const utf8B64 = (s) => { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
  function delegatePathOk(kind, path) {
    if (typeof path !== 'string' || path.includes('..') || path.startsWith('/')) return false;
    if (kind === 'skill_push') return /^skills\/[A-Za-z0-9._\/-]+$/.test(path);
    return /^(refs|docs|scratch|skills)\/[A-Za-z0-9._\/-]+$/.test(path);
  }
  function delegateBranchOk(branch) {
    return branch === 'main' || (typeof branch === 'string' && /^scratch\/[A-Za-z0-9._\/-]+$/.test(branch));
  }
  async function runDelegate(d, payload) {
    if (d.kind === 'external_comms') {
      const to = payload.to;
      const from = payload.from ?? DELEGATE_FROM;
      const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
      const html = typeof payload.html === 'string' && payload.html.trim() ? payload.html : null;
      const text = typeof payload.text === 'string' && payload.text.trim() ? payload.text : null;
      if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('external_comms: payload.to is not an email address');
      if (from !== DELEGATE_FROM) throw new Error('external_comms: from must be ' + DELEGATE_FROM);
      if (!subject || subject.length > 200) throw new Error('external_comms: subject required (max 200 chars)');
      if (!html && !text) throw new Error('external_comms: html or text required');
      const key = env.RESEND_API_KEY ? await env.RESEND_API_KEY.get() : null;
      if (!key) throw new Error('external_comms: RESEND_API_KEY unavailable');
      const body = { from, to, subject, ...(html ? { html } : {}), ...(text ? { text } : {}), ...(typeof payload.reply_to === 'string' ? { reply_to: payload.reply_to } : {}) };
      const resp = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'jev-evolution/1' }, body: JSON.stringify(body) });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || !j.id) throw new Error('external_comms: Resend ' + resp.status + ' ' + JSON.stringify(j).slice(0, 200));
      return { outcome: 'sent', provider: 'resend', provider_id: j.id, to };
    }
    if (d.kind === 'memory_edit') {
      // MEMORY LOG (2026-10-11): memory lives in its own append-only D1 table.
      // An approved memory_edit appends one row; nothing is overwritten.
      const key = payload.key;
      const body = payload.body;
      if (typeof key !== 'string' || key.length > 120 || key.includes('..') || key.startsWith('/') || !/^[A-Za-z0-9._\/-]+$/.test(key)) throw new Error('memory_edit: payload.key not allowed: ' + key);
      if (typeof body !== 'string' || body.length === 0 || body.length > 20000) throw new Error('memory_edit: payload.body must be 1..20000 chars');
      const createdAt = new Date().toISOString();
      const ins = await env.DB.prepare('INSERT INTO jev_memory_log (key, body, directive_id, actor, created_at) VALUES (?, ?, ?, ?, ?)').bind(key, body, d.id, d.actor || null, createdAt).run();
      return { outcome: 'stored', provider: 'd1', table: 'jev_memory_log', key, bytes: body.length, log_id: ins && ins.meta ? ins.meta.last_row_id : null, created_at: createdAt };
    }
    if (d.kind === 'skill_push' || d.kind === 'repo_push') {
      const path = payload.path;
      const branch = payload.branch ?? 'main';
      const message = typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim().slice(0, 200) : ('evolution: ' + d.kind + ' ' + path);
      if (!delegatePathOk(d.kind, path)) throw new Error(d.kind + ': path not allowed: ' + path);
      if (!delegateBranchOk(branch)) throw new Error(d.kind + ': branch not allowed: ' + branch);
      if (typeof payload.content !== 'string') throw new Error(d.kind + ': payload.content (text) required');
      const token = env.GITHUB_API_KEY ? await env.GITHUB_API_KEY.get() : null;
      if (!token) throw new Error(d.kind + ': GITHUB_API_KEY unavailable');
      const api = 'https://api.github.com/repos/' + DELEGATE_REPO + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
      const hdr = { Authorization: 'Bearer ' + token, 'User-Agent': 'jev-evolution/1', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
      const cur = await fetch(api + '?ref=' + encodeURIComponent(branch), { headers: hdr });
      let sha = null;
      if (cur.status === 200) { const cj = await cur.json(); sha = cj.sha ?? null; }
      else if (cur.status !== 404) throw new Error(d.kind + ': GitHub read ' + cur.status);
      const put = await fetch(api, { method: 'PUT', headers: hdr, body: JSON.stringify({ message, content: utf8B64(payload.content), branch, ...(sha ? { sha } : {}) }) });
      const pj = await put.json().catch(() => ({}));
      if (!put.ok) throw new Error(d.kind + ': GitHub write ' + put.status + ' ' + JSON.stringify(pj).slice(0, 200));
      return { outcome: 'committed', provider: 'github', path, branch, commit_sha: (pj.commit && pj.commit.sha) || null, created: !sha };
    }
    throw new Error('no delegate executor for kind ' + d.kind);
  }

  // ---- executor: one claimed-or-auto directive -> result + atom --------------
  // Worker-native kinds only (SPEC invariant 5): record_learning auto-executes
  // (a jev learning is proposed through dbx.insertLearning, same shape as the
  // v1 store's buildLearning) and note appends an event. Every other kind is
  // recorded as DELEGATED (the worker queues/gates/scores/notifies; the Sauna
  // session executes) with a STAY atom (d_post === d_pre, delta 0, valid).
  // Every executed directive records exactly one atom; recordAtom THROWS on a
  // negative delta (identity assert) and re-asserts cumulative monotonicity.
  stack.executeDirective = async function executeDirective(d, queueRow) {
    const directiveId = d.id;
    const nowIso = helpers.now();
    const payload = safeParse(d.payload_json) || {};
    // QA lane E1, defect 1: auto-execution re-checks the policy kind list, the
    // low_confidence flag, and the recorded confidence floor at execute time. A
    // failing directive is held like any unapproved one, never executed.
    const blockReason = d.risk === 'auto'
      ? autoBlockReason({
        kind: d.kind,
        payload,
        confidence: typeof payload.quality_confidence === 'number' ? payload.quality_confidence : null,
      })
      : 'not_auto';
    const isAuto = d.risk === 'auto' && blockReason === null;
    // approved_ready is what the v1 approve route writes. A delegate kind runs here. 2026-10-12 (QA lane L1,
    // T2): an approved auto kind (record_learning, note) runs here too. Before, a held needs_approval auto
    // directive stayed approved_ready and was released forever (no branch executed it).
    const isDelegate = d.status === 'approved_ready' && (DELEGATE_KINDS.includes(d.kind) || AUTO_KINDS.includes(d.kind));
    if (!isAuto && !isDelegate && d.status !== 'claimed') {
      return { executed: false, reason: 'awaiting_approval', directive_status: d.status, hold_reason: blockReason };
    }

    let result = { outcome: 'delegated', note: 'worker does not execute this kind; handed to the Sauna session per invariant 5' };
    let learningId = null;
    if (d.kind === 'record_learning') {
      const proposal = {
        from: 'evolution',
        reason: 'evolution_v2_directive',
        directive_id: d.id,
        sweep_id: d.sweep_id,
        fire: d.fire,
        kind: d.kind,
        title: d.title,
        status: payload.status ?? null,
        impact: payload.impact ?? null,
        suggestion: payload.suggestion ?? d.description,
        evidence: payload.evidence ?? payload,
      };
      const learning = {
        id: helpers.newId('l_'),
        task_id: null,
        from: 'evolution',
        proposal: JSON.stringify(proposal),
        proposal_json: JSON.stringify(proposal),
        status: 'proposed',
        created_at: nowIso,
        promoted_at: null,
        promoted_by: null,
      };
      await dbx.insertLearning(learning);
      learningId = learning.id;
      result = { outcome: 'autoexecuted', learning_id: learningId };
      // Surface the learning in evolution memory so later cycles can recall it.
      try {
        const mem = await memory.remember({
          kind: 'learning', ref_id: learning.id,
          text: `${d.title} | ${payload.suggestion ?? d.description}`,
          rule_hash: null,
        });
        result.memory_identity_key = mem && mem.identity_key ? mem.identity_key : null;
        result.memory_vectorized = !!(mem && mem.vectorized);
      } catch (e) {
        result.memory_error = (e && e.message) || String(e); // fail-soft, never blocks the atom
      }
      // Standard-candle detection: a planted candle's learning directive has
      // executed, so the marker surfaced end to end. Idempotent via markDetected.
      if (payload.candle_id && payload.candle_hash) {
        try {
          await candleDriver.markDetected(
            payload.candle_id, nowIso,
            JSON.stringify({ via: 'directive_executed', directive_id: d.id, learning_id: learningId, sealed_hash: payload.candle_hash })
          );
        } catch (e) {
          result.candle_detection_error = (e && e.message) || String(e);
        }
      }
    } else if (d.kind === 'note') {
      result = { outcome: 'noted', note: d.description };
      await store.driver.insertEvent({
        ts: nowIso, sweep_id: d.sweep_id, directive_id: d.id, kind: 'evolution_note',
        data_json: JSON.stringify({ note: d.description, source: 'evolution_v2_queue' }),
      });
    } else if (isDelegate) {
      try {
        result = await runDelegate(d, payload);
      } catch (e) {
        return { executed: false, reason: 'delegate_failed', error: (e && e.message) || String(e) };
      }
    }

    // Verify-time quality scoring (invariant 6). Fail-soft: a scoring failure
    // is recorded in the result, never blocks the atom.
    let executionQuality = null;
    try {
      const scored = await scorer.scoreExecution(
        { id: d.id, kind: d.kind, title: d.title, description: d.description, target: d.target, payload },
        result
      );
      executionQuality = { quality: scored.quality, harm_risk: scored.harm_risk, confidence: scored.confidence };
    } catch (e) {
      executionQuality = { error: (e && e.message) || String(e) };
    }

    const resultJson = JSON.stringify({ status: 'executed', evidence: result, quality: executionQuality });
    await store.driver.updateDirective(d.id, { status: 'executed', result_at: nowIso, result_json: resultJson });
    await store.driver.insertEvent({
      ts: nowIso, sweep_id: d.sweep_id, directive_id: d.id, kind: 'directive_result',
      data_json: JSON.stringify({ status: 'executed', evidence: result, via: queueRow ? 'queue' : 'direct', learning_id: learningId }),
    });

    // THE ATOM. d_pre from the candidate's own metric when carried; the stay
    // option (d_post === d_pre, delta 0) is the worker-side default because
    // the real effect of a delegated directive is measured by LATER cycles.
    const metric = typeof payload.metric === 'string' && payload.metric ? payload.metric : `directive_${d.kind}`;
    const dPre = Number(payload.metric_d_pre);
    const atom = await recordAtom(atomDriver, { helpers }, {
      directive_id: d.id,
      metric,
      d_pre: Number.isFinite(dPre) ? dPre : 0,
      d_post: Number.isFinite(dPre) ? dPre : 0,
      unit: typeof payload.unit === 'string' ? payload.unit : null,
      cycle_id: payload.cycle_id ?? null,
    });
    return { executed: true, directive_id: d.id, result, atom, executionQuality };
  };

  // ---- queue pass: poll due rows, execute, complete/fail/release -------------
  stack.runQueuePass = async function runQueuePass(limit = 5) {
    // 2026-10-11: approved delegate directives re-arm now instead of waiting out the 60-minute release hold.
    // 2026-10-12 (QA lane L1, T1): memory_edit was missing from this list, so an approved memory_edit waited out the 60-minute hold.
    const RUNNABLE = [...DELEGATE_KINDS, ...AUTO_KINDS];
    await sqlDriver.run(`UPDATE jev_evolution_queue SET next_attempt_at = NULL, updated_at = ? WHERE status = 'pending' AND next_attempt_at IS NOT NULL AND directive_id IN (SELECT id FROM jev_evolution_directives WHERE status = 'approved_ready' AND kind IN (${RUNNABLE.map(() => '?').join(',')}))`, [helpers.now(), ...RUNNABLE]);
    // 2026-10-11: sweep-ingested directives never get a queue row (only cycle proposals are enqueued).
    // An approved delegate kind with no queue row is enqueued here so the pass can execute it.
    // 2026-10-12 (QA lane L1, T1): ROOT CAUSE FIX. The old "id NOT IN (any queue row)" excluded an approved
    // directive for good once ANY queue row existed, so a row that ended 'failed' was never retried
    // (ed_47d7a075651faffa). An approved runnable directive is now enqueued whenever it has no PENDING or
    // CLAIMED row, with at most ORPHAN_MAX_TERMINAL_FAILURES terminal rows per directive.
    const orphanApproved = await sqlDriver.all(`SELECT d.id FROM jev_evolution_directives d WHERE d.status = 'approved_ready' AND d.kind IN (${RUNNABLE.map(() => '?').join(',')}) AND NOT EXISTS (SELECT 1 FROM jev_evolution_queue q WHERE q.directive_id = d.id AND q.status IN ('pending','claimed')) AND (SELECT COUNT(*) FROM jev_evolution_queue q2 WHERE q2.directive_id = d.id AND q2.status = 'failed') < ?`, [...RUNNABLE, ORPHAN_MAX_TERMINAL_FAILURES]);
    for (const row of orphanApproved) { await queue.enqueue(row.id); }
    const claimed = await queue.pollDue(undefined, limit);
    const out = [];
    for (const row of claimed) {
      const d = await store.driver.getDirective(row.directive_id);
      if (!d) {
        await queue.fail(row.id, 'directive_not_found');
        out.push({ queue_id: row.id, directive_id: row.directive_id, action: 'failed', reason: 'directive_not_found' });
        continue;
      }
      const res = await stack.executeDirective(d, row);
      if (res.executed) {
        await queue.complete(row.id, res.result);
        out.push({ queue_id: row.id, directive_id: d.id, action: 'completed', atom_id: res.atom.id, delta: res.atom.delta });
      } else if (res.reason === 'awaiting_approval') {
        // RELEASE, not fail: the operator has not approved yet. The row goes
        // back to pending with a 60-minute delay and does NOT burn an attempt.
        const nowIso = helpers.now();
        const next = new Date(Date.parse(nowIso) + 60 * 60 * 1000).toISOString();
        await queue.driver.updateQueueItem(row.id, { status: 'pending', next_attempt_at: next, updated_at: nowIso });
        out.push({ queue_id: row.id, directive_id: d.id, action: 'released', reason: 'awaiting_approval', directive_status: res.directive_status, hold_reason: res.hold_reason ?? null });
      } else {
        // 2026-10-12 (QA lane L1, T1): record the real error text, not only the reason code.
        await queue.fail(row.id, res.error || res.reason || 'execute_failed');
        out.push({ queue_id: row.id, directive_id: d.id, action: 'failed', reason: res.reason || 'execute_failed', error: res.error ?? null });
      }
    }
    return out;
  };

  // ---- scheduled entry: one cycle, then enqueue the proposal, then drain ----
  stack.runScheduledPass = async function runScheduledPass() {
    const report = await stack.runCycle();
    let enqueued = null;
    if (report.proposed && report.proposed.directive_id) {
      enqueued = await queue.enqueue(report.proposed.directive_id);
    }
    const queuePass = await stack.runQueuePass();
    return { report, enqueued: enqueued ? { id: enqueued.id, directive_id: enqueued.directive_id } : null, queue_pass: queuePass };
  };

  return stack;
}

// ---------------------------------------------------------------------------
// Per-isolate stack cache (mirrors jev-evolution.js evolutionStoreFor).
// masterDeps may be null on the scheduled path.
// ---------------------------------------------------------------------------
let _stackCache = { db: null, stack: null };
async function evolution2StackFor(env, masterDeps) {
  if (!env.DB) return null;
  if (_stackCache.stack && _stackCache.db === env.DB) return _stackCache.stack;
  await ensureEvolution2Schema(env.DB);
  // JEV CORPUS (SPEC-CORPUS 3.6): thread inj.corpus into EVERY production
  // stack (HTTP-triggered and scheduled cycles alike). The provider builds
  // the matrixish from REAL measured data: the last cycle_completed events'
  // metric records (rows = cycles, columns = numeric metric channels, kept
  // only when finite in every row). No history, too little history, or no
  // numeric channels -> the provider returns null and the glue THROWS an
  // honest error, which the corpus hook records in metrics.corpus.error
  // (fail-soft: the cycle continues, no fabricated numbers, no crash).
  let stackRef = null;
  const providerState = { reason: null };
  const corpusInj = buildCorpusInj(buildCorpusDeps(env), {
    matrixProvider: async () => {
      const s = stackRef;
      if (!s || !s.store || !s.store.driver || typeof s.store.driver.listEvents !== 'function') {
        providerState.reason = 'evolution stack not ready';
        return null;
      }
      const evs = (await s.store.driver.listEvents({ kind: 'cycle_completed', order: 'desc', limit: CORPUS_MAX_ROWS })).slice().reverse();
      const r = corpusMatrixAndReason(evs);
      providerState.reason = r.reason;
      return r.matrix;
    },
  });
  // Why the last provider call returned null (carried into the cycle report reason).
  corpusInj.providerReason = () => providerState.reason;
  const stack = buildEvolution2(env, masterDeps || null, corpusInj);
  stackRef = stack;
  _stackCache = { db: env.DB, stack };
  return stack;
}

// corpusMatrixFromCycleEvents(evs) — build the corpus matrixish from the
// cycle_completed event history (REAL measured numbers only). Rows are
// cycles oldest-first (cap 24); columns are numeric metric channels that are
// finite in EVERY row (a channel with any null/absent value is dropped, not
// coerced). Fewer than MIN_ROWS cycles or fewer than 2 surviving channels
// returns null (the glue turns that into an honest error field).
const CORPUS_MIN_ROWS = 5;
const CORPUS_MAX_ROWS = 24;
// QA lane E1, defect 2: the matrix-absent messages from jev-corpus-deps.js
// resolveMatrix. Matched by message because the audit glue is not modified.
const CORPUS_NOT_CONFIGURED_RE = /no matrix available this cycle|no matrixish passed and no matrixProvider configured/;
const CORPUS_METRIC_CHANNELS = [
  'automation_runs_24h',
  'automation_failures_24h',
  'automation_failure_rate_24h',
  'pending_approvals',
  'cost_usd_24h',
  'mean_approval_latency_ms',
];
// Returns { matrix, reason }: matrix is null exactly when reason names the unmet requirement.
function corpusMatrixAndReason(evs) {
  if (!Array.isArray(evs)) return { matrix: null, reason: 'events_unavailable' };
  const rows = [];
  for (const e of evs) {
    if (!e || e.kind !== 'cycle_completed') continue;
    let report;
    try { report = JSON.parse(e.data_json || 'null'); } catch { report = null; }
    const m = report && report.measured && typeof report.measured === 'object' ? report.measured : null;
    if (!m) continue;
    rows.push(m);
  }
  if (rows.length < CORPUS_MIN_ROWS) {
    return { matrix: null, reason: `history has ${rows.length} cycle_completed row(s); needs ${CORPUS_MIN_ROWS}` };
  }
  const hist = rows.slice(-CORPUS_MAX_ROWS);
  const channels = [];
  for (const name of CORPUS_METRIC_CHANNELS) {
    let ok = true;
    for (const m of hist) {
      const v = m[name];
      if (typeof v !== 'number' || !Number.isFinite(v)) { ok = false; break; }
    }
    if (ok) channels.push(name);
  }
  if (channels.length < 2) {
    return { matrix: null, reason: `${channels.length} metric channel(s) finite in every cycle row; needs 2` };
  }
  return { matrix: hist.map((m) => channels.map((name) => m[name])), reason: null };
}

// ---------------------------------------------------------------------------
// runEvolutionCycleScheduled(env) — the hourly cron entry (wired from
// jev-main.js runJevScheduled). Runs one full cycle, enqueues the proposal,
// then drains the execution queue. Never throws for step failures (Lane C
// isolates steps); returns { ok, report, enqueued, queue_pass } or
// { ok: false, reason } when the D1 binding is missing.
// ---------------------------------------------------------------------------
export async function runEvolutionCycleScheduled(env) {
  if (!env || !env.DB) {
    console.log('[evolution-cron] skipped reason=db_missing');
    return { ok: false, reason: 'db_missing' };
  }
  const stack = await evolution2StackFor(env, null);
  const out = await stack.runScheduledPass();
  // CRON-LEG INSTRUMENTATION (P0-2b, SPEC-AUDIT-FIXES-2026-10-08): confirm the
  // cycle_completed event the cycle just ran actually PERSISTED. The cycle
  // isolates every step in its own try/catch AND wraps the final
  // cycle_completed insert in another one (jev-cycle.js), so a failed persist
  // surfaces ONLY as report.errors while this function still returns ok:true
  // — a cron cycle can vanish with zero log evidence. Read-only confirmation
  // (driver.listEvents, no write); never throws into the cron path.
  let persisted = false;
  try {
    const cycleId = out && out.report && out.report.cycle_id;
    if (cycleId) {
      const evs = await stack.store.driver.listEvents({ kind: "cycle_completed", order: "desc", limit: 50 });
      persisted = evs.some((e) => {
        if (!e || e.kind !== 'cycle_completed') return false;
        try { return (JSON.parse(e.data_json || 'null') || {}).cycle_id === cycleId; }
        catch { return false; }
      });
    }
  } catch (e) {
    persisted = false;
    out.persist_check_error = (e && e.message) || String(e);
  }
  const cycErrors = (out && out.report && out.report.errors) || [];
  console.log(`[evolution-cron] cycle_id=${(out && out.report && out.report.cycle_id) || 'none'} persisted=${persisted} errors=${cycErrors.length}`);
  return { ok: true, persisted, ...out };
}

// ---------------------------------------------------------------------------
// HTTP surface. Bearer auth + CORS mirror jev-evolution.js EXACTLY (copied
// helpers, byte-identical values, not imported across the bundle boundary).
// Routes:
//   GET  /api/jev/evolution/cycles        cycle_completed events, newest first
//   GET  /api/jev/evolution/atoms         atom ledger + cumulative
//   POST /api/jev/evolution/memory/search { text, k }
//   GET  /api/jev/evolution/candles       candle ledger + detection power
//   POST /api/jev/evolution/cycle/run     manual trigger (one cycle + queue)
// ---------------------------------------------------------------------------

// Copy of routes-jev.js JEV_CORS (jev-evolution.js precedent: duplicated by
// design, byte-identical values, never imported across module boundaries).
const JEV_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
const BODY_MAX = 256 * 1024;

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

function parseLimit(url) {
  const n = parseInt(url.searchParams.get("limit") || "50", 10);
  return Math.min(Math.max(isNaN(n) ? 50 : n, 1), 200);
}

// 2026-10-12 (cancel route, Jenny's delegation): approver allowlist for POST /directives/:id/cancel. Same rule as the
// approve and reject gate (jevApproverCheck in routes-jev.js), kept in step by hand: policy.doc.approvers when present
// (a present but malformed list fails closed: nobody is an approver), otherwise the built-in default ["jenny"].
const CANCEL_DEFAULT_APPROVERS = Object.freeze(["jenny"]);
async function jevCancelApproverCheck(stack, env, actor) {
  const pol = typeof stack.loadPolicy === "function" ? await stack.loadPolicy(env) : null;
  const doc = pol && pol.doc && typeof pol.doc === "object" ? pol.doc : null;
  let list = CANCEL_DEFAULT_APPROVERS;
  if (doc && doc.approvers !== undefined) {
    list = Array.isArray(doc.approvers) && doc.approvers.every((n) => typeof n === "string" && n.trim() !== "") ? doc.approvers : [];
  }
  const want = String(actor).trim().toLowerCase();
  if (list.some((n) => String(n).trim().toLowerCase() === want)) return { ok: true };
  return { ok: false, message: `actor "${String(actor).trim()}" is not on the approvers list` };
}

// storeOverride (TESTS ONLY), same contract as handleJevEvolution: production
// passes nothing; tests pass a buildEvolution2(...) stack and may leave env.DB
// null. The delegate in routes-jev.js sits AFTER its own bearer-auth gate, and
// this handler re-checks auth exactly like jev-evolution.js does.
export async function handleJevEvolution2(req, env, deps, stackOverride) {
  const url = new URL(req.url);
  const p = url.pathname;
  if (req.method === "OPTIONS")
    return new Response(null, { headers: { ...JEV_CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });

  const auth = await authorized(req, env);
  if (auth.notConfigured) return err("NOT_CONFIGURED", "JEV_API_KEY binding missing; jev config pending", 503);
  if (auth.unauthorized) return err("UNAUTHORIZED", "missing or wrong bearer token", 401);

  const stack = stackOverride || (await evolution2StackFor(env, deps));
  if (!stack) return err("DB_NOT_CONFIGURED", "env.DB binding missing; evolution v2 stack unavailable", 503);

  // 1. GET /cycles — cycle_completed events, newest first.
  if (p === "/api/jev/evolution/cycles" && req.method === "GET") {
    const events = await stack.store.driver.listEvents({ kind: "cycle_completed", order: "desc", limit: parseLimit(url) });
    const cycles = events
      .map((e) => {
        const report = safeParse(e.data_json) || {};
        return {
          cycle_id: report.cycle_id || null,
          ts: report.ts || e.ts,
          created_at: e.ts,
          preflight: report.preflight ?? null,
          preflight_failed: !!report.preflight_failed,
          measured: report.measured ?? null,
          findings_count: report.findings_count ?? null,
          recall: report.recall ? { count: report.recall.count } : null,
          proposed: report.proposed ? {
            route: report.proposed.route,
            directive_id: report.proposed.directive_id,
            kind: report.proposed.candidate ? report.proposed.candidate.kind : null,
            title: report.proposed.candidate ? report.proposed.candidate.title : null,
            scores: report.proposed.scored ? summarizeScored(report.proposed.scored) : null,
          } : null,
          notes: report.notes ?? [],
          candle: report.candle ?? null,
          steps: report.steps ?? {},
          errors: report.errors ?? [],
        };
      });
    return json({ cycles, total: cycles.length });
  }

  // 2. GET /atoms — the ledger plus the server-side asserted cumulative.
  if (p === "/api/jev/evolution/atoms" && req.method === "GET") {
    const atoms = (await stack.atomDriver.listAtoms()).slice().reverse();
    const cum = await cumulative(stack.atomDriver);
    return json({ atoms, cumulative: { total: cum.total, monotone: cum.monotone, count: cum.count } });
  }

  // 3. POST /memory/search { text, k } — normalized recall envelope.
  // MEMORY LOG READ (2026-10-11): GET /api/jev/evolution/memory/log?key=&limit=
  if (p === "/api/jev/evolution/memory/log" && req.method === "GET") {
    if (!env.DB) return json({ error: { code: "DB_NOT_CONFIGURED", message: "env.DB binding missing" } }, 503);
    const key = url.searchParams.get("key");
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
    const cols = "SELECT id, key, body, directive_id, actor, created_at FROM jev_memory_log";
    const rs = key
      ? await env.DB.prepare(cols + " WHERE key = ? ORDER BY id DESC LIMIT ?").bind(key, limit).all()
      : await env.DB.prepare(cols + " ORDER BY id DESC LIMIT ?").bind(limit).all();
    return json({ entries: rs.results || [], total: (rs.results || []).length });
  }
  if (p === "/api/jev/evolution/memory/search" && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return err("INVALID_TEXT", "text is required", 422);
    let k = Number(body.k);
    if (!Number.isFinite(k) || k < 1) k = 5;
    k = Math.min(Math.round(k), 25);
    try {
      // recallRaw preserves Lane B's degrade envelope: a bare array on
      // success, { results, reason } when the EVEC index is missing.
      const raw = await stack.memory.recallRaw(text.trim(), k);
      if (Array.isArray(raw)) return json({ results: raw, count: raw.length });
      const results = raw && Array.isArray(raw.results) ? raw.results : [];
      return json({ results, count: results.length, reason: raw && raw.reason ? raw.reason : undefined });
    } catch (e) {
      return err("RECALL_FAILED", (e && (e.code || e.message)) || "recall failed", 502);
    }
  }

  // 2026-10-12 (cancel route, Jenny's delegation): POST /api/jev/evolution/directives/:id/cancel, body {"actor": "<name>"}.
  // Moves an approved_ready or proposed directive to status 'cancelled' and writes a directive_cancelled event. Every
  // other status (executed, already cancelled, rejected, claimed) is refused with 409 DIRECTIVE_NOT_CANCELLABLE. The
  // status write is a compare-and-set, so a directive that executes between the read and the write is not cancelled.
  const mCancel = p.match(/^\/api\/jev\/evolution\/directives\/([A-Za-z0-9_-]+)\/cancel$/);
  if (mCancel && req.method === "POST") {
    const { body, error } = await readJson(req);
    if (error) return err(error, error === "BODY_TOO_LARGE" ? "body exceeds 256 KB" : "invalid JSON body", error === "BODY_TOO_LARGE" ? 413 : 400);
    if (typeof body.actor !== "string" || !body.actor.trim()) return err("INVALID_ACTOR", "actor must be a non-empty string", 422);
    const cancelApprover = await jevCancelApproverCheck(stack, env, body.actor);
    if (!cancelApprover.ok) return err("APPROVER_NOT_ALLOWED", cancelApprover.message, 403);
    if (!env.DB) return err("DB_NOT_CONFIGURED", "env.DB binding missing; cannot cancel a directive", 503);
    const id = mCancel[1];
    const actor = body.actor.trim();
    const d = await stack.store.driver.getDirective(id);
    if (!d) return err("NOT_FOUND", "directive not found", 404);
    const notCancellable = (status) =>
      err("DIRECTIVE_NOT_CANCELLABLE", `directive is '${status}'; only approved_ready or proposed directives can be cancelled`, 409);
    if (d.status !== "approved_ready" && d.status !== "proposed") return notCancellable(d.status);
    const nowIso = new Date().toISOString();
    const note = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    const cas = await env.DB.prepare(
      "UPDATE jev_evolution_directives SET status = 'cancelled', actor = ?, decided_at = ?, result_json = ? WHERE id = ? AND status IN ('approved_ready', 'proposed')",
    ).bind(actor, nowIso, JSON.stringify({ reason: "cancelled_by_actor", note }), id).run();
    if (!cas || !cas.meta || cas.meta.changes !== 1) {
      const current = await stack.store.driver.getDirective(id);
      return notCancellable(current ? current.status : "gone");
    }
    await stack.store.driver.insertEvent({
      ts: nowIso, sweep_id: d.sweep_id, directive_id: id, kind: "directive_cancelled",
      data_json: JSON.stringify({ actor, from_status: d.status, reason: note }),
    });
    return json({ ok: true, directive: await stack.store.driver.getDirective(id) });
  }

  // 4. GET /candles — the standard-candle ledger with its detection power.
  if (p === "/api/jev/evolution/candles" && req.method === "GET") {
    const candles = (await stack.candleDriver.listCandles()).slice().reverse();
    const power = detectionPower(candles.map((c) => ({ detected: c.detected_at != null })));
    return json({ candles, planted: candles.length, detected: power.detected, missed: power.missed, power });
  }

  // 5. POST /cycle/run — manual trigger: one cycle, then enqueue + queue pass
  // (the same scheduled pass the hourly cron runs), so the operator can verify
  // the full loop on demand.
  // QA 2026-10-10: operator diagnostic for the hourly cron leg. Runs the exact scheduled path and returns
  // its persistence result, so a cron cycle that vanishes without a log line is visible from the API.
  if (p === "/api/jev/evolution/cycle/scheduled" && req.method === "POST") {
    const r = await runEvolutionCycleScheduled(env);
    return json({ ok: true, scheduled: { ok: r.ok, reason: r.reason || null, persisted: r.persisted, cycle_id: (r.report && r.report.cycle_id) || null,
      errors: (r.report && r.report.errors) || [], persist_check_error: r.persist_check_error || null } });
  }
  if (p === "/api/jev/evolution/cycle/run" && req.method === "POST") {
    const out = await stack.runScheduledPass();
    return json({ ok: true, report: out.report, enqueued: out.enqueued, queue_pass: out.queue_pass });
  }

  return err("NOT_FOUND", `no evolution v2 route for ${req.method} ${p}`, 404);
}