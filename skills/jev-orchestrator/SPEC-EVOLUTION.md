# SPEC-EVOLUTION — Self-Evolution layer on the jev orchestrator (v1)

Worker: `steady-orbit` (steady-orbit.systems-a.workers.dev). Source bundle parts: `session/evolution/parts/`.

## Purpose

Turn the weekly self-archaeology heartbeat into a full evolution loop — measure → propose → gate →
approve → execute → verify → learn — with the jev orchestrator as the substrate engine (D1 state,
fail-closed doctrine, actor-bound approvals, append-only events, /jev/ console) and Sauna sessions
as the hands.

## Non-goals (v1)

- No changes to the existing jev task / approval / automation / gate / engine modules.
- No LLM stages here: the sweep already does the judgment; the evolution layer is deterministic.
- The heartbeat trigger stays the Sauna Sunday schedule (0 9 * * 0 America/Los_Angeles).

## Data model (D1; schema auto-applies, idempotent; APPEND-ONLY events)

```sql
CREATE TABLE IF NOT EXISTS jev_evolution_sweeps (
  id TEXT PRIMARY KEY,
  fire INTEGER NOT NULL,
  sweep_date TEXT NOT NULL,
  summary TEXT NOT NULL,
  axes_json TEXT NOT NULL,
  calibration_json TEXT,
  findings_count INTEGER NOT NULL DEFAULT 0,
  policy_version TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(fire, sweep_date)
);
CREATE TABLE IF NOT EXISTS jev_evolution_directives (
  id TEXT PRIMARY KEY,
  sweep_id TEXT NOT NULL,
  fire INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  risk TEXT NOT NULL,
  actor TEXT,
  decided_at TEXT, claimed_at TEXT, result_at TEXT,
  result_json TEXT,
  policy_version TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jev_evolution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  sweep_id TEXT, directive_id TEXT,
  kind TEXT NOT NULL,
  data_json TEXT
);
```

## Kinds whitelist (deterministic, fail-closed; the CALLER CANNOT self-assign `auto`)

- risk `auto` (executed server-side at ingest): `record_learning`, `note`
- risk `needs_approval` (forced even if caller claims auto): `memory_edit`, `skill_push`,
  `schedule_change`, `repo_push`, `worker_change`, `ops_fix`, `external_comms`
- unknown kind → directive created with status `rejected`, reason `unknown_kind` (fail closed,
  visible in audit — not silently dropped).

## Module: `jev-evolution.js` (new part)

Exports:
- `makeEvolutionStore(driver)` — data access over the 3 tables (driver = d1 or memory; memory for tests).
- `ensureEvolutionSchema(db)` — idempotent DDL + per-isolate cache flag.
- `d1EvolutionDriver(db)` — D1 binding adapter (same shape as dbx.js d1Driver).
- `memoryEvolutionDriver()` — in-memory driver for tests.
- `handleJevEvolution(req, env, deps)` — route handler; uses `deps.helpers.now/newId`, `deps.dbx`
  (for `record_learning` → insertLearning), own store from `env.DB`.

Status machine: `proposed → (auto: executed at ingest) | needs_approval → approved_ready → claimed →
executed | failed`; `proposed → rejected`. Terminal: executed, failed, rejected. Claim is CAS
(`UPDATE ... WHERE status='approved_ready'` — changes=0 means already claimed).

## Routes (all `/api/jev/evolution/*`, bearer-auth shared with jev, JEV_CORS)

1. `POST /sweep` body `{fire, date, summary, axes, calibration?, proposed_changes?[]}` —
   validate (fire positive int; date ISO date; ≤20 changes; summary ≤4000 chars; axes JSON-serializable),
   `INSERT OR IGNORE` sweep (re-post → `duplicate:true`, existing returned), create directives,
   auto-execute `risk:auto` (`record_learning` inserts a jev learning; `note` appends an event),
   return `{sweep, directives, autoexecuted}`.
2. `GET /directives?status=X&limit=N` — list. With `&claim=1`: CAS-claim the OLDEST `approved_ready`
   directive → status `claimed`; second claim gets `{directive:null}`.
3. `POST /directives/:id/result` `{status:'executed'|'failed', evidence?}` — only from `claimed`
   (409 otherwise); terminal; `failed` auto-proposes a jev learning (improve loop); event appended.
4. `POST /directives/:id/approve` `{actor, note?}` / `.../reject` `{actor, reason?}` — only from
   `proposed` + `needs_approval`; actor required, non-empty; event appended.
5. `GET /state` — `{sweeps, directives, calibration_trend:[{fire, separation, n_labeled, n_forward}]}`.

Errors mirror the jev error shape `{error:{code,message}}`: 401 UNAUTHORIZED (shared auth), 404 NOT_FOUND,
409 INVALID_STATE, 422 INVALID_*.

## Wiring (integrator — the ONLY touched existing part)

- `routes-jev.js`: +1 import of `handleJevEvolution`, +1 delegate after the rate-limit check and before
  the task regexes: `if (p.startsWith("/api/jev/evolution")) return handleJevEvolution(req, env, deps);`
- `index.js`, `solar-rbs-entry.mjs`, `jev-main.js`, all engine modules: byte-identical.

## Console (Evolution tab in jev-index.html, KV key)

Tab button "Evolution" alongside existing tabs; panel shows sweeps (fire, date, summary, calibration
separation) and directives (status pill, kind, title, actor) with Approve/Reject on proposed
needs_approval rows and result badges on terminal rows; same sessionStorage key + 20s poll pattern
as the other tabs; fail-soft on sessionStorage (lesson 3 from the jev build).

## Sweep-prompt integration (Sauna schedule `self-archaeology-cadence`)

Phase 9 appended to the Sunday prompt: after the sweep artifact steps, POST the report to
`/api/jev/evolution/sweep` (auth via the "Steady Orbit jev operator" connection), then
`GET /directives?status=approved_ready&claim=1` in a loop → execute each directive in Sauna-land
(memory edits, schedule changes, ops fixes) → `POST /directives/:id/result` with evidence →
report outcomes in the reply.

## Tests (must pass before deploy; memory driver, deps-injected)

t1 ingest creates sweep + directives, auto-kind executes a learning; t2 re-POST same fire →
duplicate:true, no dup rows; t3 caller-claimed `auto` on a non-whitelisted kind forced to
needs_approval; t4 unknown kind → rejected + event; t5 approve → approved_ready (reject path too);
t6 claim CAS: second claim → null; t7 result executed → terminal + event; t8 result on non-claimed → 409;
t9 failed result → learning proposed; t10 state shape + calibration_trend; t11 no bearer → 401;
t12 >20 proposed_changes → 422. E2E: full lifecycle in order (ingest → approve → claim → result → state).

## Deploy + live verify

Multipart PUT preserving every untouched part byte-identical (main_module `solar-rbs-entry.mjs`).
Post-deploy: `/api/jev/health` 200 → ingest the fire-8 sweep report as the first live evolution record →
approve flow via API → console renders → schedule prompt updated.
