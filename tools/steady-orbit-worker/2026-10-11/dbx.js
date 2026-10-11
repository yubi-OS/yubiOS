// dbx.js — data-access layer over D1 for jev-orchestrator.
// All jev SQL lives here (one file, tested once). Modules depend on the
// dbx surface (insertTask, getTask, ...), never on raw SQL.
//
// Driver interface (tiny, implemented twice below):
//   run(sql, params)  -> { meta: { last_row_id?, changes } }
//   get(sql, params)  -> row object | null
//   all(sql, params)  -> array of row objects
//   batch(sqls)       -> array of results (DDL / multi-statement)

// Exact schema from SPEC §6. ensureSchema runs these idempotently.
export const SCHEMA_DDL = Object.freeze([
  `CREATE TABLE IF NOT EXISTS jev_tasks (
  id TEXT PRIMARY KEY,            -- 't_' + 16 hex random
  tenant TEXT NOT NULL DEFAULT 'default',
  source TEXT NOT NULL,           -- email|form|call|file|api|schedule|manual
  title TEXT,
  payload_json TEXT NOT NULL,     -- untrusted input, stored as received
  content_hash TEXT,              -- sha256 hex of canonical payload, for dedupe
  intent_json TEXT,               -- understand stage output
  decision_json TEXT,             -- decide stage output (proposed actions + evidence + risk + limits)
  state TEXT NOT NULL,            -- lifecycle state, §4
  gate_outcome TEXT,              -- allowed|needs_approval|blocked (latest)
  gate_reasons_json TEXT,         -- array of strings
  terminal_outcome TEXT,          -- succeeded|blocked|rejected|expired|failed|cancelled|NULL
  terminal_reason TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  idempotency_key TEXT,           -- caller-supplied dedupe key (unique per tenant)
  created_at TEXT NOT NULL,       -- ISO 8601 UTC
  updated_at TEXT NOT NULL
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS jev_tasks_dedupe ON jev_tasks(tenant, idempotency_key) WHERE idempotency_key IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS jev_tasks_state ON jev_tasks(state)`,
  `CREATE TABLE IF NOT EXISTS jev_actions (
  id TEXT PRIMARY KEY,            -- 'a_' + 16 hex
  task_id TEXT NOT NULL REFERENCES jev_tasks(id),
  seq INTEGER NOT NULL,
  tool TEXT NOT NULL,             -- policy tool name, e.g. 'http.fetch'
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  headers_json TEXT,
  body_json TEXT,
  expected_json TEXT,             -- expected result: {status_range:[200,299], contains?|equals?|json_path?...}
  stable_id TEXT NOT NULL,        -- idempotency key sent to provider: 'jev-' + task_id + '-' + seq
  state TEXT NOT NULL,            -- proposed|approved|dispatched|verified_success|verified_failure|unknown|cancelled
  provider_ref TEXT,              -- provider's own id/evidence pointer after dispatch
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  response_json TEXT,             -- stored dispatch response evidence (SPEC §9; integrator addition — SPEC §6 defines no column for it)
  verified_at TEXT,
  reconciled_at TEXT,
  updated_at TEXT
)`,
  `CREATE INDEX IF NOT EXISTS jev_actions_task ON jev_actions(task_id)`,
  `CREATE TABLE IF NOT EXISTS jev_events (        -- APPEND-ONLY. Never UPDATE or DELETE.
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT, action_id TEXT,
  kind TEXT NOT NULL,             -- task_created|understood|decided|gate_decision|approval_granted|approval_rejected|approval_expired|approval_superseded|dispatch|dispatch_blocked|verify_result|retry|reconcile|pause_changed|policy_changed|terminal|learning_proposed|learning_promoted
  data_json TEXT NOT NULL,
  policy_version TEXT,
  created_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS jev_events_task ON jev_events(task_id)`,
  `CREATE TABLE IF NOT EXISTS jev_approvals (
  id TEXT PRIMARY KEY,            -- 'ap_' + 16 hex
  task_id TEXT NOT NULL REFERENCES jev_tasks(id),
  action_id TEXT NOT NULL REFERENCES jev_actions(id),
  actor TEXT,                     -- bound at approval time (pending = NULL)
  target TEXT NOT NULL,           -- method + url of the bound action
  payload_hash TEXT NOT NULL,     -- sha256 of canonical action body at bind time
  limits_json TEXT NOT NULL,
  policy_version TEXT NOT NULL,   -- policy version the gate was running when the approval was created
  status TEXT NOT NULL,           -- pending|approved|rejected|expired|superseded
  expires_at TEXT NOT NULL,
  decided_at TEXT, decided_by TEXT, note TEXT,
  created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS jev_learnings (
  id TEXT PRIMARY KEY,            -- 'l_' + 16 hex
  task_id TEXT,
  proposal_json TEXT NOT NULL,    -- proposed policy/prompt/routing change
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed|reviewed|tested|active|discarded
  created_at TEXT NOT NULL, promoted_at TEXT, promoted_by TEXT
)`,
  // SPEC-AUTOMATIONS §3 — automation registry (versioned defs, single active per name)
  `CREATE TABLE IF NOT EXISTS jev_automations (
  id TEXT PRIMARY KEY,            -- 'am_' + 16 hex
  name TEXT NOT NULL,             -- kebab-case, unique per active version
  version INTEGER NOT NULL,       -- monotonic per name
  status TEXT NOT NULL,           -- draft|active|paused|retired
  def_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  last_fired_at TEXT
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS jev_automations_namever ON jev_automations(name, version)`,
  // SPEC-AUTOMATIONS §8 — lead machine system of record (D1)
  `CREATE TABLE IF NOT EXISTS jev_leads (
  id TEXT PRIMARY KEY,            -- 'ld_' + 16 hex
  business_name TEXT,
  domain TEXT,
  place_id TEXT,
  finding_code TEXT,
  finding_text TEXT,
  evidence_url TEXT,
  contact_email TEXT,
  contact_status TEXT,
  draft_subject TEXT,
  draft_body TEXT,
  guard_verdict TEXT,
  stage TEXT,
  task_id TEXT,
  run_id TEXT,
  data_json TEXT,                 -- lane-C extension: everything non-core (dedupe_key, website, audit/qc/mx details, stage_reason, ...)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS jev_leads_stage ON jev_leads(stage)`,
  `CREATE INDEX IF NOT EXISTS jev_leads_task ON jev_leads(task_id)`,
  // POLICY CHANGELOG (WLF policy-shift study, 2026-10): append-only,
  // wipe-proof record of policy version bumps. One row per promote
  // (source='promote') plus at most ONE baseline row (source='backfill',
  // backfilled=1) seeded on first access after the stamp-shipping deploy: the
  // 2026-10-01 data wipe lost the prior v1-v4 promote history, and the
  // baseline row records that honestly instead of inventing entries. The
  // partial unique index makes a concurrent double-seed impossible on D1 (the
  // seed helper treats the UNIQUE error as already-seeded).
  `CREATE TABLE IF NOT EXISTS jev_policy_changelog (
  id TEXT PRIMARY KEY,            -- 'pc_' + 16 hex (same convention as the other TEXT-PK tables)
  created_at TEXT NOT NULL,       -- ISO 8601 UTC
  version INTEGER NOT NULL,       -- policy version the entry describes
  actor TEXT,                     -- who promoted ('system' on the baseline row)
  source TEXT NOT NULL,           -- 'promote' | 'backfill' | 'manual'
  summary TEXT,                   -- short description from the promote payload
  backfilled INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS jev_policy_changelog_backfill ON jev_policy_changelog(source) WHERE backfilled = 1`,
]);

// Guarded ALTERs for columns added to EXISTING deployments after first boot.
// CREATE TABLE IF NOT EXISTS does not alter an existing table, so each new
// column on an old table gets one idempotent ADD COLUMN here: D1 errors with
// "duplicate column" when it already exists — that outcome IS success. The
// memory test driver mirrors the same behavior (see memoryDriver's ALTER
// branch) so both drivers are idempotent under ensureSchema-twice.
export const ALTER_DDL = Object.freeze([
  { table: 'jev_tasks', column: 'llm_neurons', sql: `ALTER TABLE jev_tasks ADD COLUMN llm_neurons INTEGER NOT NULL DEFAULT 0` },
  // Lane-C extension (integrator fix 2b): jev_leads.data_json carries every
  // non-core lead field. Same guarded-ALTER discipline as llm_neurons.
  { table: 'jev_leads', column: 'data_json', sql: `ALTER TABLE jev_leads ADD COLUMN data_json TEXT` },
  // approval-meta columns (nullable TEXT; see APPROVAL_META_COLS).
  { table: 'jev_approvals', column: 'approved_by', sql: `ALTER TABLE jev_approvals ADD COLUMN approved_by TEXT` },
  { table: 'jev_approvals', column: 'approved_via', sql: `ALTER TABLE jev_approvals ADD COLUMN approved_via TEXT` },
  { table: 'jev_approvals', column: 'approved_at', sql: `ALTER TABLE jev_approvals ADD COLUMN approved_at TEXT` },
  { table: 'jev_approvals', column: 'gate_outcome_at_approve', sql: `ALTER TABLE jev_approvals ADD COLUMN gate_outcome_at_approve TEXT` },
  { table: 'jev_approvals', column: 'gate_reasons_at_approve_json', sql: `ALTER TABLE jev_approvals ADD COLUMN gate_reasons_at_approve_json TEXT` },
  { table: 'jev_approvals', column: 'executed_at', sql: `ALTER TABLE jev_approvals ADD COLUMN executed_at TEXT` },
  { table: 'jev_approvals', column: 'executed_by', sql: `ALTER TABLE jev_approvals ADD COLUMN executed_by TEXT` },
  { table: 'jev_approvals', column: 'execution_result', sql: `ALTER TABLE jev_approvals ADD COLUMN execution_result TEXT` },
  { table: 'jev_approvals', column: 'rejected_by', sql: `ALTER TABLE jev_approvals ADD COLUMN rejected_by TEXT` },
  { table: 'jev_approvals', column: 'rejected_at', sql: `ALTER TABLE jev_approvals ADD COLUMN rejected_at TEXT` },
  { table: 'jev_approvals', column: 'rejection_reason', sql: `ALTER TABLE jev_approvals ADD COLUMN rejection_reason TEXT` },
]);

// D1 hard-fails on unknown columns (SQLITE_ERROR: no such column) while the
// memory test driver tolerates them; every UPDATE is filtered to real table
// columns so both drivers behave identically. Unknown keys are dropped (the
// callers' audit events still carry them).
function filterCols(cols, fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) {
    if (k !== 'id' && cols.includes(k)) out[k] = fields[k];
  }
  return out;
}
const TASK_COLS = ['id', 'tenant', 'source', 'title', 'payload_json', 'content_hash', 'intent_json', 'decision_json', 'state', 'gate_outcome', 'gate_reasons_json', 'terminal_outcome', 'terminal_reason', 'cost_usd', 'idempotency_key', 'llm_neurons', 'created_at', 'updated_at'];
const AUTOMATION_COLS = ['id', 'name', 'version', 'status', 'def_json', 'created_by', 'created_at', 'activated_at', 'last_fired_at'];
const LEAD_COLS = ['id', 'business_name', 'domain', 'place_id', 'finding_code', 'finding_text', 'evidence_url', 'contact_email', 'contact_status', 'draft_subject', 'draft_body', 'guard_verdict', 'stage', 'task_id', 'run_id', 'data_json', 'created_at', 'updated_at'];
const ACTION_COLS = ['id', 'task_id', 'seq', 'tool', 'method', 'url', 'headers_json', 'body_json', 'expected_json', 'stable_id', 'state', 'provider_ref', 'attempts', 'created_at', 'dispatched_at', 'response_json', 'verified_at', 'reconciled_at', 'updated_at'];
const EVENT_COLS = ['task_id', 'action_id', 'kind', 'data_json', 'policy_version', 'created_at'];
// approval-meta (2026-10-10): who approved or rejected, through which channel, the
// gate verdict at approve time, and what execution did. Every new column is
// nullable TEXT, added by ALTER_DDL. Insert defaults are explicit in
// APPROVAL_INSERT_DEFAULTS. A NOT NULL column added later MUST get its default
// there: D1 rejects an explicit NULL bound to a NOT NULL column, even one with a DEFAULT.
const APPROVAL_META_COLS = ['approved_by', 'approved_via', 'approved_at', 'gate_outcome_at_approve', 'gate_reasons_at_approve_json', 'executed_at', 'executed_by', 'execution_result', 'rejected_by', 'rejected_at', 'rejection_reason'];
const APPROVAL_COLS = ['id', 'task_id', 'action_id', 'actor', 'target', 'payload_hash', 'limits_json', 'policy_version', 'status', 'expires_at', 'decided_at', 'decided_by', 'note', 'created_at', ...APPROVAL_META_COLS];
const APPROVAL_INSERT_DEFAULTS = Object.freeze(Object.fromEntries(APPROVAL_META_COLS.map((c) => [c, null])));
const LEARNING_COLS = ['id', 'task_id', 'proposal_json', 'status', 'created_at', 'promoted_at', 'promoted_by'];
const POLICY_CHANGELOG_COLS = ['id', 'created_at', 'version', 'actor', 'source', 'summary', 'backfilled'];

function insertSql(table, cols) {
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
}

// Pick only known columns; undefined -> null.
function pickRow(cols, src) {
  const row = {};
  for (const c of cols) row[c] = src[c] === undefined ? null : src[c];
  return row;
}

function updateSql(table, fields) {
  const keys = Object.keys(fields);
  return {
    sql: `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    params: keys.map((k) => fields[k]).concat([null]),
  };
}

export function makeDbx(driver) {
  const clampLimit = (n) => Math.max(1, Math.min(Number(n) || 50, 200));

  return {
    // ---- schema -----------------------------------------------------------
    async ensureSchema() {
      await driver.batch(SCHEMA_DDL);
      // Guarded ALTERs for columns added after first boot (see ALTER_DDL).
      // D1 errors "duplicate column" when the column exists — that IS success.
      // Any other error propagates (fail-closed schema discipline).
      for (const alt of ALTER_DDL) {
        try {
          await driver.run(alt.sql, []);
        } catch (e) {
          const msg = String((e && e.message) || e);
          if (!/duplicate column/i.test(msg)) throw e;
        }
      }
      // approval-meta backfill (idempotent: only rows still missing the new value).
      // History written before these columns existed takes its approver and
      // rejecter from the legacy columns; approved_via = 'legacy' marks it as not
      // channel-recorded. Execution fields stay NULL for old rows (not recorded).
      await driver.run(`UPDATE jev_approvals SET approved_by = actor, approved_at = decided_at, approved_via = 'legacy' WHERE status = 'approved' AND approved_by IS NULL`, []);
      await driver.run(`UPDATE jev_approvals SET rejected_by = decided_by, rejected_at = decided_at, rejection_reason = note WHERE status = 'rejected' AND rejected_by IS NULL`, []);
      return true;
    },

    // ---- tasks ------------------------------------------------------------
    async insertTask(t) {
      const row = pickRow(TASK_COLS, t || {});
      // llm_neurons is NOT NULL DEFAULT 0 (SPEC-AUTOMATIONS §2) — pickRow
      // would send an explicit NULL, which D1 rejects on a NOT NULL column.
      // Default it to 0 on BOTH drivers so behavior stays identical.
      if (row.llm_neurons == null) row.llm_neurons = 0;
      // Same D1 lesson as llm_neurons: cost_usd is NOT NULL; insertSql lists
      // every TASK_COL, so a missing key binds as explicit NULL and D1 rejects
      // it (live bug 2026-10-01: engine runs omitted cost_usd entirely).
      if (row.cost_usd == null) row.cost_usd = 0;
      await driver.run(insertSql('jev_tasks', TASK_COLS), TASK_COLS.map((c) => row[c]));
      return row;
    },
    async getTask(id) {
      return driver.get(`SELECT * FROM jev_tasks WHERE id = ?`, [id]);
    },
    async listTasks({ state, limit = 50, offset = 0 } = {}) {
      const lim = clampLimit(limit);
      const off = Math.max(0, Number(offset) || 0);
      if (state != null && state !== '') {
        return driver.all(
          `SELECT * FROM jev_tasks WHERE state = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [state, lim, off]
        );
      }
      return driver.all(
        `SELECT * FROM jev_tasks ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [lim, off]
      );
    },
    async updateTask(idOrTask, fields) {
      // Lane C modules call updateTask(task, patch) with the whole row; routes
      // call updateTask(id, patch) with the id. Accept both. Returns the FRESH
      // row (lane C's closeTask/flipTask hand the return value straight back
      // to callers, which must see terminal_outcome/terminal_reason).
      const id = idOrTask && typeof idOrTask === 'object' ? idOrTask.id : idOrTask;
      const f = filterCols(TASK_COLS, fields);
      const keys = Object.keys(f);
      if (!keys.length) return this.getTask(id);
      const { sql } = updateSql('jev_tasks', f);
      await driver.run(sql, keys.map((k) => f[k]).concat([id]));
      return this.getTask(id);
    },
    async getTaskByIdempotency(tenant, key) {
      if (key == null) return null;
      return driver.get(`SELECT * FROM jev_tasks WHERE tenant = ? AND idempotency_key = ?`, [tenant, key]);
    },
    // Alias required by lane B's jev-ingest.ingestTask (same query, same result).
    findTaskByIdempotency(tenant, key) {
      return this.getTaskByIdempotency(tenant, key);
    },

    // ---- actions ----------------------------------------------------------
    async insertAction(a) {
      const row = pickRow(ACTION_COLS, a || {});
      await driver.run(insertSql('jev_actions', ACTION_COLS), ACTION_COLS.map((c) => row[c]));
      return row;
    },
    async getAction(id) {
      return driver.get(`SELECT * FROM jev_actions WHERE id = ?`, [id]);
    },
    async listActions(taskId) {
      return driver.all(`SELECT * FROM jev_actions WHERE task_id = ? ORDER BY seq ASC`, [taskId]);
    },
    // Alias required by lane C's jev-loop (dbx.getActions(taskId)).
    getActions(taskId) {
      return this.listActions(taskId);
    },
    async updateAction(idOrAction, fields) {
      // Lane C modules call updateAction(action, patch) with the whole row;
      // routes call updateAction(id, patch). Accept both.
      const id = idOrAction && typeof idOrAction === 'object' ? idOrAction.id : idOrAction;
      const f = filterCols(ACTION_COLS, fields);
      const keys = Object.keys(f);
      if (!keys.length) return this.getAction(id);
      const { sql } = updateSql('jev_actions', f);
      await driver.run(sql, keys.map((k) => f[k]).concat([id]));
      return this.getAction(id);
    },

    // ---- events (append-only) ----------------------------------------------
    async insertEvent(ev) {
      const row = pickRow(EVENT_COLS, ev || {});
      if (row.created_at == null) row.created_at = new Date().toISOString();
      const res = await driver.run(insertSql('jev_events', EVENT_COLS), EVENT_COLS.map((c) => row[c]));
      const id = res && res.meta ? res.meta.last_row_id : null;
      return { ...row, id };
    },
    async listEvents(taskId, limit = 50) {
      return driver.all(`SELECT * FROM jev_events WHERE task_id = ? ORDER BY id ASC LIMIT ?`, [taskId, clampLimit(limit)]);
    },

    // Object-data event append used directly by lanes B (jev-ingest) and C
    // (execute/verify/loop): {task_id, action_id?, kind, data, policy_version?}.
    // jev-state's appendEvent(dbx, {...data_json...}) keeps using insertEvent.
    async appendEvent(ev) {
      const e = ev || {};
      return this.insertEvent({
        task_id: e.task_id ?? null,
        action_id: e.action_id ?? null,
        kind: e.kind,
        data_json: JSON.stringify(e.data ?? {}),
        policy_version: e.policy_version ?? null,
        created_at: new Date().toISOString(),
      });
    },

    // ---- approvals ---------------------------------------------------------
    async insertApproval(ap) {
      const row = pickRow(APPROVAL_COLS, { ...APPROVAL_INSERT_DEFAULTS, ...(ap || {}) });
      await driver.run(insertSql('jev_approvals', APPROVAL_COLS), APPROVAL_COLS.map((c) => row[c]));
      return row;
    },
    async getApproval(id) {
      return driver.get(`SELECT * FROM jev_approvals WHERE id = ?`, [id]);
    },
    async listApprovals({ status, taskId, expiresBefore } = {}) {
      const where = [];
      const params = [];
      if (status != null && status !== '') { where.push('status = ?'); params.push(status); }
      if (taskId != null && taskId !== '') { where.push('task_id = ?'); params.push(taskId); }
      const sql = `SELECT * FROM jev_approvals${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at ASC`;
      let rows = await driver.all(sql, params);
      // Comparison filters are applied JS-side (the tiny SQL surface only
      // supports col = ? conjunctions).
      if (expiresBefore != null && expiresBefore !== '') {
        const cutoff = Date.parse(expiresBefore);
        rows = rows.filter((r) => Date.parse(r.expires_at) <= cutoff);
      }
      return rows;
    },
    async updateApproval(id, fields) {
      // Filtered to real columns, like every other update (D1 errors on unknown columns).
      const f = filterCols(APPROVAL_COLS, fields);
      const keys = Object.keys(f);
      if (!keys.length) return { meta: { changes: 0 } };
      const { sql } = updateSql('jev_approvals', f);
      return driver.run(sql, keys.map((k) => f[k]).concat([id]));
    },
    // Compare-and-set on status: the approve/reject race guard. meta.changes === 0
    // means another request decided this approval first.
    async updateApprovalIf(id, fields, fromStatus) {
      const f = filterCols(APPROVAL_COLS, fields);
      const keys = Object.keys(f);
      if (!keys.length) return { meta: { changes: 0 } };
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      return driver.run(`UPDATE jev_approvals SET ${sets} WHERE id = ? AND status = ?`, keys.map((k) => f[k]).concat([id, fromStatus]));
    },
    // Execution/verification mirror. One approval per action; only approved rows are touched.
    async setApprovalExecutionForAction(actionId, fields) {
      const f = filterCols(APPROVAL_COLS, fields);
      const keys = Object.keys(f);
      if (!keys.length) return { meta: { changes: 0 } };
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      return driver.run(`UPDATE jev_approvals SET ${sets} WHERE action_id = ? AND status = 'approved'`, keys.map((k) => f[k]).concat([actionId]));
    },

    // ---- learnings ---------------------------------------------------------
    async insertLearning(l) {
      const row = pickRow(LEARNING_COLS, l || {});
      if (row.status == null) row.status = 'proposed';
      await driver.run(insertSql('jev_learnings', LEARNING_COLS), LEARNING_COLS.map((c) => row[c]));
      return row;
    },
    async getLearning(id) {
      return driver.get(`SELECT * FROM jev_learnings WHERE id = ?`, [id]);
    },
    async listLearnings({ status } = {}) {
      if (status != null && status !== '') {
        return driver.all(`SELECT * FROM jev_learnings WHERE status = ? ORDER BY created_at ASC`, [status]);
      }
      return driver.all(`SELECT * FROM jev_learnings ORDER BY created_at ASC`, []);
    },
    async updateLearning(id, fields) {
      const keys = Object.keys(fields || {});
      if (!keys.length) return { meta: { changes: 0 } };
      const { sql } = updateSql('jev_learnings', fields);
      return driver.run(sql, keys.map((k) => fields[k]).concat([id]));
    },

    // ---- policy changelog (WLF policy-shift study) ---------------------------
    // Append-only: rows are inserted, never UPDATEd or DELETEd. The baseline
    // backfill row is inserted at most once (partial unique index above).
    async insertPolicyChangelog(entry) {
      const row = pickRow(POLICY_CHANGELOG_COLS, entry || {});
      if (row.created_at == null) row.created_at = new Date().toISOString();
      await driver.run(insertSql('jev_policy_changelog', POLICY_CHANGELOG_COLS), POLICY_CHANGELOG_COLS.map((c) => row[c]));
      return row;
    },
    // Ascending (oldest first) so the log reads as a history. Capped by the
    // shared clampLimit (max 200); the log is tiny by construction.
    async listPolicyChangelog(limit = 200) {
      return driver.all(`SELECT * FROM jev_policy_changelog ORDER BY created_at ASC LIMIT ?`, [clampLimit(limit)]);
    },

    // ---- automations (SPEC-AUTOMATIONS §3/§4) --------------------------------
    // Registry of versioned automation defs. insertAutomation is status-agnostic
    // here; jev-automations.js owns versioning/status policy on top of it.
    async insertAutomation(a) {
      const row = pickRow(AUTOMATION_COLS, a || {});
      if (row.status == null) row.status = 'draft';
      await driver.run(insertSql('jev_automations', AUTOMATION_COLS), AUTOMATION_COLS.map((c) => row[c]));
      return row;
    },
    async getAutomation(id) {
      return driver.get(`SELECT * FROM jev_automations WHERE id = ?`, [id]);
    },
    // The single ACTIVE def for a name: status='active', highest version wins.
    // (status is a bind param, not a SQL literal — the tiny SQL surface only
    // supports col = ? conjunctions.)
    async getActiveAutomation(name) {
      return driver.get(
        `SELECT * FROM jev_automations WHERE name = ? AND status = ? ORDER BY version DESC LIMIT 1`,
        [name, 'active']
      );
    },
    // All versions, ordered newest-version-first per name (single ORDER BY is
    // SQL-driver-safe; the per-name/version sort is finished JS-side).
    async listAutomations() {
      const rows = await driver.all(`SELECT * FROM jev_automations ORDER BY created_at ASC`, []);
      rows.sort((a, b) => {
        if (a.name !== b.name) return String(a.name).localeCompare(String(b.name));
        return Number(b.version) - Number(a.version);
      });
      // name -> active version summary (single-active-per-name invariant)
      const active_by_name = {};
      for (const r of rows) {
        if (r.status === 'active' && active_by_name[r.name] == null) active_by_name[r.name] = r.version;
      }
      return { automations: rows, active_by_name };
    },
    // filterCols to AUTOMATION_COLS (D1-parity: unknown keys are dropped —
    // callers' audit events still carry them). Accepts (id, patch) or
    // (row, patch). Returns the FRESH row, or null on a CAS miss.
    //
    // COMPARE-AND-SET (lane-B scheduler contract, SPEC-AUTOMATIONS §7):
    // updateAutomation(id, patch, expectedLastFiredAt) applies the patch ONLY
    // when the row's current last_fired_at still equals expectedLastFiredAt —
    // null means "never fired" → `WHERE last_fired_at IS NULL` in D1. This
    // must be a genuine conditional UPDATE, not read-then-write in JS, or the
    // scheduler's overlap guard degrades to fire-always. Omitting the third
    // arg keeps the legacy unconditional behavior (all pre-existing callers
    // and tests unchanged). On a CAS miss (0 rows changed) returns null.
    async updateAutomation(idOrAutomation, fields, expectedLastFiredAt) {
      const id = idOrAutomation && typeof idOrAutomation === 'object' ? idOrAutomation.id : idOrAutomation;
      const f = filterCols(AUTOMATION_COLS, fields);
      const keys = Object.keys(f);
      if (!keys.length) return this.getAutomation(id);
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      let sql;
      let params;
      if (expectedLastFiredAt === undefined) {
        sql = `UPDATE jev_automations SET ${sets} WHERE id = ?`;
        params = keys.map((k) => f[k]).concat([id]);
      } else if (expectedLastFiredAt === null) {
        sql = `UPDATE jev_automations SET ${sets} WHERE id = ? AND last_fired_at IS NULL`;
        params = keys.map((k) => f[k]).concat([id]);
      } else {
        sql = `UPDATE jev_automations SET ${sets} WHERE id = ? AND last_fired_at = ?`;
        params = keys.map((k) => f[k]).concat([id, expectedLastFiredAt]);
      }
      const res = await driver.run(sql, params);
      const changes = res && res.meta ? Number(res.meta.changes) : NaN;
      if (changes === 0) return null; // CAS miss — another tick already advanced it
      return this.getAutomation(id);
    },

    // ---- leads (SPEC-AUTOMATIONS §8) ----------------------------------------
    async insertLead(l) {
      const row = pickRow(LEAD_COLS, l || {});
      const ts = new Date().toISOString();
      if (row.created_at == null) row.created_at = ts;
      if (row.updated_at == null) row.updated_at = ts;
      await driver.run(insertSql('jev_leads', LEAD_COLS), LEAD_COLS.map((c) => row[c]));
      return row;
    },
    async getLead(id) {
      return driver.get(`SELECT * FROM jev_leads WHERE id = ?`, [id]);
    },
    // Lane-C idempotency lookup: the dedupe key lives INSIDE data_json (a JSON
    // blob), so there is no `WHERE data_json->dedupe_key = ?` on the tiny SQL
    // surface both drivers share. JS-side scan instead — identical on D1 and
    // the memory driver, and lead volume per run is bounded (≤ 20/run), so the
    // O(n) scan is the honest v1 cost. Returns row | null.
    async getLeadByDedupeKey(key) {
      if (key == null) return null;
      const rows = await driver.all(`SELECT * FROM jev_leads`, []);
      for (const r of rows) {
        if (r.data_json && typeof r.data_json === 'string') {
          try {
            const d = JSON.parse(r.data_json);
            if (d && d.dedupe_key === key) return r;
          } catch { /* malformed data_json never matches */ }
        }
      }
      return null;
    },
    // Reply-webhook lookup: contact_email IS a real column, so this is a plain
    // indexed-by-column query (same shape on both drivers).
    async getLeadByContactEmail(email) {
      if (email == null) return null;
      return driver.get(`SELECT * FROM jev_leads WHERE contact_email = ?`, [email]) || null;
    },
    async listLeads({ stage, limit = 50 } = {}) {
      const lim = clampLimit(limit);
      if (stage != null && stage !== '') {
        return driver.all(`SELECT * FROM jev_leads WHERE stage = ? ORDER BY created_at DESC LIMIT ?`, [stage, lim]);
      }
      return driver.all(`SELECT * FROM jev_leads ORDER BY created_at DESC LIMIT ?`, [lim]);
    },
    // filterCols to LEAD_COLS (D1-parity filtering). Accepts (id, patch) or
    // (row, patch); bumps updated_at unless the patch sets it. Returns FRESH row.
    async updateLead(idOrLead, fields) {
      const id = idOrLead && typeof idOrLead === 'object' ? idOrLead.id : idOrLead;
      const f = filterCols(LEAD_COLS, fields);
      if (!Object.keys(f).length) return this.getLead(id);
      // Bump updated_at unless the patch sets it explicitly; THEN read the
      // final key set (the bump adds a column — the snapshot must include it).
      if (f.updated_at === undefined || f.updated_at === null) f.updated_at = new Date().toISOString();
      const keys = Object.keys(f);
      const { sql } = updateSql('jev_leads', f);
      await driver.run(sql, keys.map((k) => f[k]).concat([id]));
      return this.getLead(id);
    },
    // Aggregated JS-side over a full scan (same pattern as summary()).
    async countLeadsByStage() {
      const rows = await driver.all(`SELECT * FROM jev_leads`, []);
      const by_stage = {};
      for (const r of rows) by_stage[r.stage] = (by_stage[r.stage] || 0) + 1;
      return by_stage;
    },

    // ---- dashboard summary (routes-jev /api/jev/summary) ---------------------
    // Aggregated JS-side over full-table scans — the tiny driver SQL surface
    // only supports SELECT * with col = ? conjunctions, so no GROUP BY.
    async summary() {
      const tasks = await driver.all(`SELECT * FROM jev_tasks`, []);
      const approvals = await driver.all(`SELECT * FROM jev_approvals`, []);
      const tasks_by_state = {};
      const tasks_by_outcome = {};
      let cost_usd_total = 0;
      let cost_usd_24h = 0;
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const t of tasks) {
        tasks_by_state[t.state] = (tasks_by_state[t.state] || 0) + 1;
        if (t.gate_outcome) tasks_by_outcome[t.gate_outcome] = (tasks_by_outcome[t.gate_outcome] || 0) + 1;
        const c = Number(t.cost_usd) || 0;
        cost_usd_total += c;
        const ts = Date.parse(t.updated_at || t.created_at);
        if (Number.isFinite(ts) && ts >= cutoff) cost_usd_24h += c;
      }
      return {
        tasks_by_state,
        tasks_by_outcome,
        pending_approvals: approvals.filter((a) => a.status === 'pending').length,
        cost_usd_total,
        cost_usd_24h,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// ensurePolicyChangelogBaseline(dbx, helpers, currentVersion) - seed the ONE
// baseline changelog row while the table is still empty (WLF policy-shift
// study). The 2026-10-01 data wipe lost the prior v1-v4 promote history; the
// baseline row records that honestly (source 'backfill', backfilled 1) rather
// than inventing entries. Idempotent: no-op when any row already exists, and
// the partial unique index on (source) WHERE backfilled = 1 turns a
// concurrent double-seed into a caught no-op on D1. currentVersion is the
// version observed at first access; when no version is readable the row
// carries version 0 (unknown at seed time) rather than a fabricated number.
// Returns the inserted row, or null when the table was already populated.
// No fetch, no KV: callers hand in the version from the gate's own accessor.
// ---------------------------------------------------------------------------
export async function ensurePolicyChangelogBaseline(dbx, helpers, currentVersion) {
  const existing = await dbx.listPolicyChangelog(1);
  if (existing && existing.length) return null;
  const v = Number(currentVersion);
  try {
    return await dbx.insertPolicyChangelog({
      id: helpers.newId('pc_'),
      created_at: helpers.now(),
      version: Number.isInteger(v) && v > 0 ? v : 0,
      actor: 'system',
      source: 'backfill',
      summary: 'baseline at stamp-shipping deploy; prior v1-v4 history lost in the 2026-10-01 data wipe',
      backfilled: 1,
    });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/UNIQUE constraint failed/i.test(msg)) return null; // a concurrent seed won
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Driver (a): Cloudflare D1
// ---------------------------------------------------------------------------
export function d1Driver(db) {
  return {
    async run(sql, params = []) {
      const res = await db.prepare(sql).bind(...params).run();
      return { meta: (res && res.meta) || { changes: 0 } };
    },
    async get(sql, params = []) {
      return (await db.prepare(sql).bind(...params).first()) || null;
    },
    async all(sql, params = []) {
      const res = await db.prepare(sql).bind(...params).all();
      return (res && res.results) || [];
    },
    async batch(sqls) {
      const stmts = sqls.map((s) => db.prepare(s));
      return db.batch(stmts);
    },
  };
}

// ---------------------------------------------------------------------------
// Driver (b): in-memory (unit tests). Interprets the exact SQL shapes dbx
// emits — INSERT with explicit column list, UPDATE ... SET ... WHERE id = ?,
// SELECT * FROM t [WHERE a = ? [AND b = ?]] [ORDER BY col [ASC|DESC]]
// [LIMIT ?] [OFFSET ?]. Enforces the jev_tasks dedupe unique index and the
// jev_events append-only rule so tests exercise real logic.
// ---------------------------------------------------------------------------
export function memoryDriver() {
  const state = { tables: {}, seq: {}, cols: {} };

  function tableCols(table) {
    // Column set for duplicate-column detection: tracked set ∪ keys seen on rows.
    let cols = state.cols[table];
    if (!cols) {
      cols = new Set();
      for (const r of state.tables[table] || []) for (const k of Object.keys(r)) cols.add(k);
      state.cols[table] = cols;
    }
    return cols;
  }

  function enforceUnique(table, row) {
    if (table === 'jev_tasks') {
      if (row.idempotency_key != null) {
        const dup = (state.tables.jev_tasks || []).some(
          (r) => r.tenant === row.tenant && r.idempotency_key === row.idempotency_key
        );
        if (dup) throw new Error('UNIQUE constraint failed: jev_tasks.tenant, jev_tasks.idempotency_key');
      }
    }
    if (table === 'jev_automations' && row.name != null && row.version != null) {
      // jev_automations_namever: UNIQUE(name, version) — D1-parity error shape.
      const dup = (state.tables.jev_automations || []).some(
        (r) => r.name === row.name && Number(r.version) === Number(row.version)
      );
      if (dup) throw new Error('UNIQUE constraint failed: jev_automations.name, jev_automations.version');
    }
    if (row.id != null && (state.tables[table] || []).some((r) => r.id === row.id)) {
      throw new Error(`UNIQUE constraint failed: ${table}.id`);
    }
  }

  function parseAssignments(text) {
    // `col = ?` binds a param; `col = other_col` copies that column from the
    // pre-update row; `col = 'literal'` and `col = NULL` set a constant. The
    // approval-meta backfill in ensureSchema uses the column and literal forms.
    return text.split(',').map((clause) => {
      const c = clause.trim();
      let m = /^(\w+)\s*=\s*\?$/.exec(c);
      if (m) return { col: m[1], kind: 'bind' };
      m = /^(\w+)\s*=\s*'([^']*)'$/.exec(c);
      if (m) return { col: m[1], kind: 'lit', value: m[2] };
      m = /^(\w+)\s*=\s*(\w+)$/.exec(c);
      if (m && m[2].toUpperCase() === 'NULL') return { col: m[1], kind: 'lit', value: null };
      if (m) return { col: m[1], kind: 'col', src: m[2] };
      throw new Error(`memoryDriver: unsupported SET clause: "${c}"`);
    });
  }

  function parseConjunction(text) {
    // `col = ?` joined by AND is supported everywhere; `col IS NULL` is
    // additionally supported because dbx's CAS updateAutomation emits it
    // (`WHERE id = ? AND last_fired_at IS NULL`). IS NULL clauses bind NO
    // param — the bind-accounting below reflects that on both call sites.
    return text.split(/\s+AND\s+/i).map((clause) => {
      const c = clause.trim();
      let m = /^(\w+)\s*=\s*\?$/i.exec(c);
      if (m) return { col: m[1], bind: true };
      m = /^(\w+)\s+IS\s+NULL$/i.exec(c);
      if (m) return { col: m[1], bind: false, isNull: true };
      m = /^(\w+)\s*=\s*'([^']*)'$/i.exec(c);
      if (m) return { col: m[1], bind: false, lit: m[2] };
      throw new Error(`memoryDriver: unsupported WHERE clause: "${c}"`);
    });
  }

  function memRun(sql, params = []) {
    const s = sql.trim().replace(/;\s*$/, '');
    if (/^CREATE\s+/i.test(s)) return { meta: { changes: 0 } };
    if (/^DELETE\s+/i.test(s)) throw new Error('memoryDriver: DELETE is not permitted (append-only policy)');

    // Guarded-ALTER support (D1 parity): ADD COLUMN on an existing table adds
    // the column with its DEFAULT to every existing row; re-adding an existing
    // column throws a duplicate-column error like D1 does (ensureSchema treats
    // that as success). Unknown ALTER forms are unsupported, like everything
    // else outside dbx's SQL surface.
    let m = /^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s*(.*)$/i.exec(s);
    if (m) {
      const table = m[1].toLowerCase();
      const col = m[2].toLowerCase();
      if (tableCols(table).has(col)) {
        throw new Error(`duplicate column name: ${col}`);
      }
      const dm = /DEFAULT\s+(-?\d+(?:\.\d+)?|NULL|'(?:[^']|'')*')/i.exec(m[3] || '');
      let def = null;
      if (dm) {
        const v = dm[1];
        if (/^NULL$/i.test(v)) def = null;
        else if (/^'/.test(v)) def = v.slice(1, -1).replace(/''/g, "'");
        else def = Number(v);
      }
      tableCols(table); // initialize column tracking for tables never inserted into yet
      state.cols[table].add(col);
      const t = (state.tables[table] = state.tables[table] || []);
      for (const row of t) row[col] = def;
      return { meta: { changes: 0 } };
    }

    m = /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)$/i.exec(s);
    if (m) {
      const table = m[1].toLowerCase();
      if (table === 'jev_events') {
        // events take an autoincrement id; no explicit id is ever inserted
      }
      const cols = m[2].split(',').map((c) => c.trim());
      const vals = m[3].split(',').map((c) => c.trim());
      if (vals.some((v) => v !== '?')) throw new Error(`memoryDriver: literal VALUES unsupported: ${s.slice(0, 60)}`);
      if (cols.length !== vals.length || cols.length !== params.length) {
        throw new Error(`memoryDriver: column/placeholder/bind mismatch: ${s.slice(0, 60)}`);
      }
      tableCols(table); // initialize column tracking before ALTERs can run
      for (const c of cols) state.cols[table].add(c);
      const row = {};
      cols.forEach((c, i) => { row[c] = params[i]; });
      enforceUnique(table, row);
      const t = (state.tables[table] = state.tables[table] || []);
      let id = row.id;
      if (id == null) {
        state.seq[table] = (state.seq[table] || 0) + 1;
        id = state.seq[table];
        row.id = id;
      }
      t.push({ ...row });
      return { meta: { last_row_id: id, changes: 1 } };
    }

    m = /^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i.exec(s);
    if (m) {
      const table = m[1].toLowerCase();
      if (table === 'jev_events') throw new Error('memoryDriver: jev_events is append-only — UPDATE forbidden');
      const setCols = parseAssignments(m[2]);
      const whereCols = parseConjunction(m[3]);
      const setBinds = setCols.filter((sc) => sc.kind === 'bind').length;
      const whereBinds = whereCols.filter((w) => w.bind).length;
      if (whereBinds + setBinds !== params.length) {
        throw new Error(`memoryDriver: bind count mismatch: ${s.slice(0, 60)}`);
      }
      const t = state.tables[table] || [];
      let changes = 0;
      for (const row of t) {
        let hit = true;
        let pi2 = setBinds;
        for (let i = 0; i < whereCols.length; i++) {
          const w = whereCols[i];
          if (w.bind) {
            if (row[w.col] !== params[pi2++]) { hit = false; break; }
          } else if (w.isNull) {
            if (row[w.col] !== null && row[w.col] !== undefined) { hit = false; break; }
          } else if (row[w.col] !== w.lit) {
            hit = false; break;
          }
        }
        if (!hit) continue;
        const next = {};
        let bi = 0;
        for (const sc of setCols) {
          if (sc.kind === 'bind') next[sc.col] = params[bi++];
          else if (sc.kind === 'lit') next[sc.col] = sc.value;
          else next[sc.col] = row[sc.src] === undefined ? null : row[sc.src];
        }
        Object.assign(row, next);
        changes++;
      }
      return { meta: { changes } };
    }

    throw new Error(`memoryDriver: unsupported statement: ${s.slice(0, 80)}`);
  }

  function memAll(sql, params = []) {
    const s = sql.trim().replace(/;\s*$/, '');
    const head = /^SELECT\s+\*\s+FROM\s+(\w+)/i.exec(s);
    if (!head) throw new Error(`memoryDriver: unsupported SELECT: ${s.slice(0, 80)}`);
    const table = head[1].toLowerCase();
    const rest = s.slice(head[0].length);

    const m = /^(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+([?\d]+))?(?:\s+OFFSET\s+([?\d]+))?\s*$/i.exec(rest);
    if (!m) throw new Error(`memoryDriver: unsupported SELECT tail: ${rest.slice(0, 80)}`);

    let pi = 0;
    let rows = (state.tables[table] || []).map((r) => ({ ...r }));

    if (m[1] != null) {
      const cols = parseConjunction(m[1]);
      // bind indices are fixed per clause position — evaluated once, not per row.
      // IS NULL clauses bind no param and compare against null directly.
      const binds = cols.map((c) => (c.bind ? params[pi++] : undefined));
      rows = rows.filter((row) => cols.every((c, i) => (c.bind ? row[c.col] === binds[i] : c.lit !== undefined ? row[c.col] === c.lit : row[c.col] == null)));
    }
    if (m[2] != null) {
      const col = m[2];
      const desc = (m[3] || 'ASC').toUpperCase() === 'DESC';
      rows.sort((a, b) => {
        const av = a[col], bv = b[col];
        let c;
        if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
        else c = String(av ?? '').localeCompare(String(bv ?? ''));
        return desc ? -c : c;
      });
    }
    // binds are consumed in placeholder order (LIMIT then OFFSET), but SQL
    // semantics apply OFFSET first (skip), then LIMIT (take)
    let lim = null;
    let off = null;
    if (m[4] != null) lim = m[4] === '?' ? Number(params[pi++]) : Number(m[4]);
    if (m[5] != null) off = m[5] === '?' ? Number(params[pi++]) : Number(m[5]);
    if (off != null) rows = rows.slice(off);
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  }

  return {
    async run(sql, params = []) { return memRun(sql, params); },
    async get(sql, params = []) { const rows = memAll(sql, params); return rows[0] ?? null; },
    async all(sql, params = []) { return memAll(sql, params); },
    async batch(sqls) { return sqls.map((s) => memRun(s, [])); },
    // test introspection
    _state: state,
  };
}