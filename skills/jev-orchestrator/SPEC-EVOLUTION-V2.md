# SPEC-EVOLUTION-V2 — Final Evolution Process (steady-orbit worker)

Date: 2026-10-01. Approved capability map: `session/evolution-v2/capability-map-v2.md` (v1 map + jev quality assessment added per Jenny). Design one-pager: `session/evolution-v2/evolution-v2-solo-2026-10-01.md` (winner: Calibrated Atom Loop = V6+V7 fusion).

## 0. Grounding (read before any lane work)

- Current deployed source: `session/evolution-v2/bundle/parts/*.js` (22 module parts fetched live 2026-10-01). Key parts: `jev-evolution.js` (v1 store/drivers/routes), `jev-scheduler.js` (automation tick contract), `routes-jev.js` (routing + delegate pattern), `dbx.js` (column discipline), `jev-decide.js` (how the worker calls jev-1.13 via DEFAPI_API_KEY), `jev-llm.js` (AI binding response-shape handling), `jev-main.js` (assembly), `solar-rbs-entry.mjs` (entry + legacy exclusion list).
- Paper discipline digests: `session/subagent/paper-llc-digest.md`, `session/subagent/paper-is-this-x-digest.md`, `session/subagent/paper-curved-corpus-digest.md`.
- jev decision model: `session/evolution-v2/defapi-jev-SKILL.md` + `defapi-jev-api.md` (noul/choice/score, confidence, session_id, consumed).

## 1. Invariants (non-negotiable, asserted in code where noted)

1. **Fail-closed whitelist unchanged.** `record_learning`/`note` auto-execute; every other kind is forced `needs_approval`; unknown kinds rejected. The cron cycle CANNOT self-assign auto.
2. **Single-action atom cadence.** Each hourly machine cycle enqueues AT MOST ONE gated action. Every executed directive records one atom (metric, d_pre, d_post, delta). A stay option always exists (d_post === d_pre → delta 0, valid).
3. **Δ≥0 is an identity, asserted.** `recordAtom` THROWS on negative delta (bug alarm, not a logged regression). Cumulative ledger monotonicity is asserted per insert.
4. **Identity/measurement boundary.** Identities (Δ≥0, monotonicity) are code asserts; every MEASUREMENT (separation, detection power, quality scores) is stored with its null/rep count and is never treated as proof.
5. **No worker-side repo pushes / memory edits / external comms execution.** Those kinds execute via Sauna sessions exactly as today. The worker only queues/gates/scores/notifies.
6. **jev quality assessment at every stage** (Jenny addition): propose-time scoring, verify-time execution scoring, sweep-report quality scoring. Low predicted-quality proposals are demoted to `note` (auto, no queue spam) instead of queued.
7. **Byte-preservation.** No existing module part changes except: `jev-main.js` (import + delegate lines only), `routes-jev.js` (new route branches + delegate), the worker's scheduled handler wiring, and the console KV page. All other parts byte-identical.
8. **No new secrets.** All bindings exist (DEFAPI_API_KEY, RESEND_API_KEY, AI, DB, SITE, VEC). One NEW binding required: `EVEC` (vectorize index `jev-evolution`), added at deploy after the index is created via API.

## 2. Data model — new D1 tables (idempotent DDL, same style as jev-evolution.js)

```sql
CREATE TABLE IF NOT EXISTS jev_evolution_atoms (
  id TEXT PRIMARY KEY, directive_id TEXT, metric TEXT NOT NULL,
  d_pre REAL NOT NULL, d_post REAL NOT NULL, delta REAL NOT NULL,
  unit TEXT, cycle_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jev_evolution_queue (
  id TEXT PRIMARY KEY, directive_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT,
  last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jev_evolution_memory (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT, text TEXT NOT NULL,
  identity_key TEXT NOT NULL, rule_hash TEXT, dims INTEGER,
  vectorized INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jev_evolution_candles (
  id TEXT PRIMARY KEY, planted_at TEXT NOT NULL, kind TEXT NOT NULL,
  sealed_hash TEXT NOT NULL, expected TEXT NOT NULL,
  detected_at TEXT, detection_json TEXT
);
```

Column discipline (dbx lessons, MANDATORY): every INSERT lists its columns explicitly; every new NOT NULL column gets an insert-layer default in the same commit; update patches are filtered to real columns; adapters forward the FULL context object.

## 3. Module contracts (new files; ES modules, Web APIs only, no npm)

### 3.1 `jev-quality.js` — jev quality assessment (Lane A)

Exports:
- `makeQualityScorer(deps)` where `deps = { decide(state, questions, opts) }` (the existing jev-decide call shape, injected; tests inject a stub). Returns:
  - `async scoreProposal(p)` → `{ forecast_approval: noul 0..1, priority: score, kind_ok: noul, confidence, consumed, raw }`. Questions: noul "Will the operator approve this directive as described?" (criteria true/false); score "How valuable is executing this directive?" (4 levels: Not worth it / Marginal / Useful / Load-bearing); noul "Is the declared kind the right whitelist kind for this action?".
  - `async scoreExecution(directive, result)` → `{ quality: score 0..4, harm_risk: noul, confidence, consumed }` — judges whether the recorded result actually achieved the directive's stated intent.
  - `async scoreSweepReport(report)` → `{ quality: score 0..4, gaps: noul, consumed }` — sweep-report quality gate for the ingest path.
- Routing rule (pure function, exported): `routeByQuality(scored)` → `'queue' | 'demote_note' | 'flag_low_confidence'`. Rules: priority < 1.0 OR forecast_approval < 0.3 → demote_note; confidence < 0.5 on any answer → flag_low_confidence (forced needs_approval regardless of kind); else queue.
- Every call logs `session_id: evo-fire-<N>` and accumulates `consumed`.

### 3.2 `jev-atoms.js` — atom ledger + calibration math (Lane A)

Exports:
- `async recordAtom(driver, deps, { directive_id, metric, d_pre, d_post, unit, cycle_id })` → atom row. delta = d_pre − d_post. THROWS on delta < 0. Stay allowed (delta 0). Appends event `atom_recorded`.
- `async cumulative(driver)` → `{ total, monotone: true }` — sums deltas; asserts running total never decreases (identity assert; throws on violation).
- `nullStandardizedSeparation(labeledRows)` → `{ separation, sd_null, z, dbc }` — given rows `{predicted_quality, label}`, separation = good-mean − bad-mean; sd_null = SD under label-permutation null (≥64 shuffles, deterministic seed); z = separation/sd_null; dbc = 20·log10(|separation|/sd_null). Pure function, unit-testable.
- `detectionPower(candleResults)` → `{ detected, missed, power }` for the standard-candle ledger.

### 3.3 `jev-memory.js` — Vectorize memory + wayfinder discipline (Lane B)

Exports `makeEvolutionMemory(env, deps)`:
- `async embed(texts)` → vectors via `env.AI.run('@cf/baai/bge-base-en-v1.5', { text: texts })` — extract `data[0].data` shape (binding response shape differs from REST; NEVER stringify objects; attach `raw_shape` on empty extraction, per jev-llm lesson).
- `async remember({ kind, ref_id, text, rule_hash })` → identity_key = `<kind>:<ref_id>:<fnv1a-hex(text)>` (fnv1a implemented inline, stdlib); upsert metadata row into `jev_evolution_memory`; vectorize upsert into `env.EVEC` with id = identity_key, metadata `{ kind, ref_id, created_at }`.
- `async recall(queryText, k=5)` → vectorize query on EVEC → neighbor rows joined with memory table → `[{ identity_key, kind, ref_id, text, score, created_at }]`.
- `async compareBatch(hashes)` → `{ changed_input_refs, quantization_silent_refs }` — wayfinder distinction: same identity_key = unchanged coordinates; different key with same ref_id = changed content.
- Degrade gracefully: if `env.EVEC` is missing (index not yet created), remember() marks `vectorized=0` and recall() returns `[]` with `reason: 'index_missing'` — NEVER throws for missing index.

### 3.4 `jev-cycle.js` — hourly machine cycle (Lane C)

Exports `runEvolutionCycle(env, deps)` where `deps` injects: `now()`, `store` (the v1 evolution store), `atoms`, `memory`, `quality`, `dbx` (task/automation readers), `notify`, `candleCfg`.
Steps (each step isolated in try/catch; one step failing never blocks the rest; the report records per-step status):
1. **Preflight** (knowledge-mint Phase 0 pattern): decision endpoint smoke probe (via quality scorer with a 1-question noul); if unhealthy → record event `preflight_failed` and STOP proposing (measurement-only cycle still runs).
2. **Measure** (worker-native, all from D1): task outcome counts by state/outcome, automation run failure rate (last 24h), directive flow (proposed/approved/claimed/executed/failed counts, mean approval latency), policy version, atom cumulative, candle ledger state.
3. **Recall** (memory): query for the cycle's candidate findings.
4. **Propose ≤ 1 gated action** (atom rule): candidates = rule-based findings (e.g. ≥3 failed executions of the same automation in 24h → ops_fix proposal; approval latency spike → note; new recurring research domain in sweep summaries → record_learning pointing at a corpus mint). Each candidate is jev-scored (scoreProposal) and routed by `routeByQuality`. At most ONE action enqueued per cycle; the rest become `note` events (auto).
5. **Candle**: if due per `candleCfg` (default weekly, deterministic day-hour), plant a candle directive (kind `record_learning`, payload carrying a sealed_hash = fnv1a of the candle content + a secret-free salt; NOT plaintext marker), record in `jev_evolution_candles`. Detection: subsequent cycles check whether the candle's learning surfaced in recall + was scored; `detectionPower` updated.
6. **Notify**: hand the cycle report to notify (digest).
Returns `{ cycle_id, measured: {...}, proposed: {...}|null, notes: [...], candle: {...}|null, steps: {...} }`; appends `cycle_completed` event with the full report.

### 3.5 `jev-queue.js` — durable execution queue (Lane D)

Exports `makeEvolutionQueue(driver, deps)` with adapter pattern:
- `async enqueue(directive_id)` → queue row (status pending).
- `async pollDue(now, limit=5)` → claims due rows via CAS (UPDATE ... WHERE status='pending' AND next_attempt_at <= now — conditional UPDATE, not read-then-write), returns claimed rows.
- `async complete(id, result)` / `async fail(id, error)` → fail increments attempts, sets `next_attempt_at = now + 2^attempts minutes`, attempts ≥ 5 → terminal `failed` (event + learning proposed via the existing improve-loop path).
- `d1QueueDriver(db)` + `memoryQueueDriver()` — both implement the same interface; same shapes (dbx parity lessons).
- CF Queues adapter DEFERRED (needs queue+consumer bindings; D1 queue with cron-driven poll meets the durability need with zero new infra). Documented in the module header, not silently dropped.

### 3.6 `jev-notify.js` — Resend digest + approval alerts (Lane D)

Exports `makeEvolutionNotify(deps)` with `deps = { sendEmail({to, from, subject, html}), now() }`:
- `async digest(cycleReport)` → hourly digest email (only when something happened; silent cycles produce a no-op with reason). To: `shantt@duck.com`; From: `site@axel.steadyorbitsystems.ai` (the verified Resend sender). Subject: `[jev-evolution] fire <N>: <one-line>`. HTML: compact tables (verdicts, atoms, queue, candle), no images.
- `async approvalNeeded(directive)` → immediate email with the directive's title/description/target + console link `https://steady-orbit.systems-a.workers.dev/jev/`.
- Fail-soft: send failures are recorded as events, never thrown into the cycle.

### 3.7 Wiring (Lane E / advisor)

- `jev-main.js`: +1 import line per new module; delegate in the scheduled handler: if cron is hourly (`0 * * * *`) → `runEvolutionCycle`; if `*/5` → existing automation tick (UNTOUCHED). The scheduled handler must dispatch by cron expression, not assume one trigger.
- `routes-jev.js`: new routes delegated to a thin `jev-evolution2-routes.js` (keeps routes-jev edits to ~2 lines): `GET /api/jev/evolution/cycles`, `GET /api/jev/evolution/atoms`, `POST /api/jev/evolution/memory/search`, `GET /api/jev/evolution/candles`, `POST /api/jev/evolution/cycle/run` (manual trigger, bearer-auth). All bearer-auth except none; CORS mirrors JEV_CORS.
- Console v3 (Lane F): Evolution tab additions — atom ledger table, calibration trend with dBc, candle detection status, recall inspector, cycle history. KV key `jev-index.html` (fail-soft on sessionStorage preserved).
- The hourly Sauna sweep prompt (schedule `sched_zd4m7apd54s49u81`, already hourly) unchanged in shape; its ingest now also carries sweep quality score when jev-scored.

## 4. Lane split

| Lane | Files | Tests |
|---|---|---|
| A (smart) | `jev-quality.js`, `jev-atoms.js` | node --test, ≥14 tests: scorer routing rules, Δ≥0 throw, stay option, monotonicity, null-SD determinism, dBc math |
| B (smart) | `jev-memory.js` | ≥10 tests: identity keys, fnv1a stability, recall join, changed-vs-silent, missing-index degrade, binding shape extraction |
| C (smart) | `jev-cycle.js` | ≥12 tests: preflight gate, measure from fake dbx, single-proposal cap, demote-note routing, candle plant/detect, step isolation |
| D (fast) | `jev-queue.js`, `jev-notify.js` | ≥12 tests: CAS poll, retry backoff, terminal failed, digest no-op on silent cycle, fail-soft send |
| F (fast) | console v3 HTML/JS patch | renders offline (read render) — no node tests required |
| E (advisor, smart) | `jev-evolution2-routes.js`, wiring diffs for `jev-main.js`/`routes-jev.js`/scheduled handler, full e2e test, integration report + deploy checklist | e2e: cycle → propose → approve → queue → execute → atom → digest (memory driver) |

Lane rules: deps-injected; lane tests import NOTHING from other lanes (stubs per documented interfaces); ALL tests pass before a lane returns; write to `session/subagent/lane-<X>/`; never weaken a test; no em dashes; return paths + test counts + interface summaries.

## 5. Deploy checklist (orchestrator)

1. Create Vectorize index `jev-evolution` (768-D, cosine) via API; verify with GET.
2. Restore cron triggers: PUT /workers/scripts/steady-orbit/schedules → `["*/5 * * * *", "0 * * * *"]` (the */5 restore fixes the automations scheduler wiped at 11:07Z).
3. Upload multipart: all existing parts byte-identical EXCEPT `jev-main.js`, `routes-jev.js` (+ new modules + console KV update); metadata carries all 12 existing bindings + NEW `EVEC` vectorize binding + compatibility_date unchanged.
4. Live verify route-by-route: /api/jev/health, /api/jev/evolution/state, cycles GET, atoms GET, memory/search POST, candles GET, manual cycle/run, console tab render, automation tick unaffected, digest email delivered (or honest failure recorded).
5. First live hourly cycle observed end-to-end.

## 6. Explicit non-goals (v1)

Worker self-modification; R2; Durable Objects; CF Queues adapter (deferred, documented); email-link approval; auto-approval of anything.
