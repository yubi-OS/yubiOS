# SPEC: jev-orchestrator (Jev v2 control architecture on the steady-orbit worker)

Status: formal spec, derived from the approved capability map (CAPABILITY_MAP.md) and the ideate-solo one-pager. Source of truth for all module implementations.

## 1. Objective

Expose the Jev v2 operations-controller architecture (Jev_Architecture_v2.svg: ingest → understand → decide → gate → execute → verify → continue/terminal, with a fail-closed policy gate and a human review loop) as an orchestration template on the `steady-orbit` Cloudflare Worker. Any automation (n8n workflow, Sauna skill, script) can create a Jev task, get a deterministic gate decision, dispatch gated actions, verify outcomes, and close with a distinct terminal state. jev-1.13 (DefAPI, via the existing `/api/decide` relay) powers Understand and Decide; it is advisory only and NEVER authorizes anything.

Invariants (from the diagram's operating notes — these are hard requirements):
- The policy gate is deterministic and fails closed. Its only outputs: `allowed`, `needs_approval`, `blocked`.
- An approval binds actor, target, payload, limits, expiry, and policy version. Policy version mismatch or expiry invalidates the approval.
- LLMs (jev included) hold no credentials and have no direct execution-tool access.
- Terminal states stay distinct: `succeeded`, `blocked`, `rejected`, `expired`, `failed`, `cancelled`. A blocked task is not successful.
- Pause prevents new and queued dispatch and cancels running work only where supported; completed effects are never undone. Pause is re-checked at dispatch time.
- Unknown outcomes require reconciliation before any repeat; no blind retry.
- Retry only through Decide + Gate, and only when safe and within limits.
- Learnings are proposals; they cannot activate themselves.
- Every stage persists state and evidence to the append-only audit log.

## 2. Runtime context

- Worker: `steady-orbit` on account `b57ee20cd90ebc4e4db28728e450a4b8`. Two modules: `solar-rbs-entry.mjs` (entry; site pages; delegates everything else) and `index.js` (legacy API module; all `/api/*` routes live inside its `if (p.startsWith("/api/"))` block, ending in a `no route` 404). Jev routes are added inside that block, BEFORE the no-route fallthrough, following the existing per-route `if (p === ...)` style.
- Bindings already available: `env.DB` (D1 `sos-agent`, uuid 376a1482-f369-4f58-9967-af53e52c657a), `env.SITE` (KV), `env.DEFAPI_API_KEY` (Secrets Store; resolve with `await env.DEFAPI_API_KEY.get()`), `env.AI`, `env.WEBSITE_RATE_LIMIT`.
- New binding needed: `JEV_API_KEY` (Secrets Store secret `jev-api-key`). Until the binding exists, code MUST degrade gracefully: if `env.JEV_API_KEY` is missing, respond 503 `{"error":{"code":"NOT_CONFIGURED"}}` on all /api/jev routes except a `/api/jev/health` that reports `{ok:true, jev:"config-pending"}`.
- D1 tables are created lazily by a `ensureSchema(db)` function (CREATE TABLE IF NOT EXISTS), so no separate migration step is needed. Prefix all tables `jev_`.

## 3. Auth

- All mutating and read endpoints under `/api/jev/*` (except `/api/jev/health`) require `Authorization: Bearer <key>` where key equals `await env.JEV_API_KEY.get()`. Use a constant-time comparison. Wrong/missing → 401 `{"error":{"code":"UNAUTHORIZED"}}`.
- CORS: same policy as the existing relays — `Access-Control-Allow-Origin: *` on JSON responses, OPTIONS preflight returns `RELAY_CORS`-style headers with `Access-Control-Allow-Methods: GET, POST, OPTIONS`. (The dashboard is same-origin; CORS-open keeps n8n and curl usable.)
- Rate limit: reuse `relayRateLimited(req, N)` pattern (30/min/IP for reads is fine; executions additionally gated by policy spend/rate limits).

## 4. Task lifecycle (state machine)

Task `state` (single string, enforced by a transition table in code — invalid transitions throw):

```
ingested → understood → decided → gated → dispatching → verifying → continued → (back to decided for next action) 
gated → awaiting_approval → (approve → gated via recheck) | (reject → terminal:rejected) | (expire → terminal:expired) | (guide → decided)
any state → terminal:{succeeded|blocked|rejected|expired|failed|cancelled}
paused is NOT a state: pause is a scope flag checked by the gate and execute.
```

- `gated` outcome recorded on the task as `gate_outcome` ∈ allowed|needs_approval|blocked plus `gate_reasons` (array of strings).
- Every transition appends a row to `jev_events` (append-only; no UPDATE/DELETE on that table ever).

## 5. Endpoint contract

All bodies JSON. All error shapes `{"error":{"code":..., "message":...}}`. All list endpoints support `?limit=` (default 50, max 200) and `?state=`.

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/jev/health` | GET | — | `{ok, jev, policy_version?, paused?}` (no auth) |
| `/api/jev/tasks` | POST | `{source, payload, title?, tenant?, idempotency_key?}` | full task after ingest+understand+decide+gate pipeline (see §7) |
| `/api/jev/tasks` | GET | — | `{tasks:[{id,state,gate_outcome,cost_usd,title,created_at,updated_at}], total}` |
| `/api/jev/tasks/:id` | GET | — | `{task, actions, approvals, events(truncated to last 50), cost}` |
| `/api/jev/tasks/:id/execute` | POST | `{action_ids?}` (default: all gate-allowed proposed actions) | `{dispatched:[{action_id, stable_id, provider_ref?}], skipped:[{action_id, reason}]}` |
| `/api/jev/tasks/:id/verify` | POST | `{action_id}` | `{verdict: verified_success|confirmed_failure|unknown, evidence}` |
| `/api/jev/tasks/:id/continue` | POST | `{}` | `{next: more_work|terminal, task}` — runs loop-control; re-decides via decide-engine if more work, else closes terminal:succeeded |
| `/api/jev/tasks/:id/retry` | POST | `{action_id}` | re-runs decide+gate for a failed action; refuses if unsafe or budget exhausted |
| `/api/jev/tasks/:id/reconcile` | POST | `{action_id, evidence}` | `{resolved: bool, verdict}` — resolved → verify; unresolved → awaiting_approval (human review), never a blind repeat |
| `/api/jev/tasks/:id/close` | POST | `{outcome, reason}` | close with a distinct terminal state; outcome must be one of the six |
| `/api/jev/tasks/:id/cancel` | POST | `{reason}` | terminal:cancelled |
| `/api/jev/approvals` | GET | — | pending queue `{approvals:[...]}` with expiry timestamps |
| `/api/jev/approvals/:id/approve` | POST | `{actor, note?}` | validates binding (actor/target/payload/limits/expiry/policy_version), then re-runs the gate against CURRENT policy; returns new gate outcome |
| `/api/jev/approvals/:id/reject` | POST | `{actor, reason}` | terminal:rejected for the task |
| `/api/jev/approvals/:id/guide` | POST | `{actor, guidance}` | guidance stored + task back to `decided` with guidance injected into the decide state |
| `/api/jev/pause` | GET | — | `{paused, scope}` |
| `/api/jev/pause` | POST | `{paused: bool, scope?: "all"\|"tenant:<t>"\|"task:<id>"}` | sets pause scope; persists to state |
| `/api/jev/summary` | GET | — | `{tasks_by_state, tasks_by_outcome, pending_approvals, cost_usd_total, cost_usd_24h, policy_version}` |
| `/api/jev/learnings` | GET | — | proposals list |
| `/api/jev/learnings/:id/promote` | POST | `{actor, new_policy?}` | manual activation ONLY: bumps policy version in KV, invalidates affected approvals (approvals bound to older policy_version → expired), appends event |

## 6. D1 schema (created by `ensureSchema`)

```sql
CREATE TABLE IF NOT EXISTS jev_tasks (
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
);
CREATE UNIQUE INDEX IF NOT EXISTS jev_tasks_dedupe ON jev_tasks(tenant, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS jev_tasks_state ON jev_tasks(state);

CREATE TABLE IF NOT EXISTS jev_actions (
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
  dispatched_at TEXT
);
CREATE INDEX IF NOT EXISTS jev_actions_task ON jev_actions(task_id);

CREATE TABLE IF NOT EXISTS jev_events (        -- APPEND-ONLY. Never UPDATE or DELETE.
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT, action_id TEXT,
  kind TEXT NOT NULL,             -- task_created|understood|decided|gate_decision|approval_granted|approval_rejected|approval_expired|dispatch|dispatch_blocked|verify_result|retry|reconcile|pause_changed|policy_changed|terminal|learning_proposed|learning_promoted
  data_json TEXT NOT NULL,
  policy_version TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jev_events_task ON jev_events(task_id);

CREATE TABLE IF NOT EXISTS jev_approvals (
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
);

CREATE TABLE IF NOT EXISTS jev_learnings (
  id TEXT PRIMARY KEY,            -- 'l_' + 16 hex
  task_id TEXT,
  proposal_json TEXT NOT NULL,    -- proposed policy/prompt/routing change
  status TEXT NOT NULL DEFAULT 'proposed',  -- proposed|reviewed|tested|active|discarded
  created_at TEXT NOT NULL, promoted_at TEXT, promoted_by TEXT
);
```

## 7. Pipeline (what POST /api/jev/tasks runs, in order)

1. **Ingest**: validate `source` ∈ enum; require `payload` object ≤ 256 KB; compute `content_hash`; dedupe on (tenant, idempotency_key) → if duplicate, return the existing task with `{"duplicate": true}` instead of creating a new one. External content is untrusted: store verbatim, never execute or interpolate.
2. **Understand** (advisory): one `/api/decide` call, one request, multiple questions:
   - `category` (choice): the intent categories from the policy doc (`policy.categories`, e.g. lead_intake, research, communication, data_change, other).
   - `is_actionable` (noul): does this request call for an action beyond reading?
   - `risk` (score 0-3): how risky is the likely action (0 trivial … 3 irreversible/external).
   Thresholds from policy: `auto_act_is_actionable` (default 0.8), `review_floor` (default 0.3). Store result as `intent_json`. If the decide call fails, set intent to `{unavailable: true, reason}` and continue (understand must not be a hard dependency of gating).
3. **Decide** (advisory): derive proposed actions. v1 shape: the caller MAY supply `payload.actions` (array of `{tool, method, url, headers?, body?, expected}`); if absent and `payload.decide_prompt` is set, make ONE more `/api/decide` call asking `next_action` (choice over the policy's tool list) + `proceed` (noul). Proposed actions are inserted into `jev_actions` with `state='proposed'`. Record cost (`consumed`) from decide responses onto task cost.
4. **Gate** (deterministic, §8): run for each proposed action. Task `gate_outcome` = worst-of (blocked > needs_approval > allowed across its actions). `blocked` tasks go straight to terminal:blocked (close and log) unless `policy.blocked_action = 'park'`.
5. Persist everything, return the full task.

## 8. Policy gate (deterministic, fail-closed)

Policy doc lives in KV at key `jev-policy.json` (JSON). Shape:

```json
{
  "version": 3,
  "paused": false, "pause_scope": "all",
  "tools": {
    "http.fetch": {"hosts": ["api.github.com", "api.resend.com"], "methods": ["GET","POST"], "max_cost_usd": 0.5, "requires_approval": false},
    "http.post": {"hosts": ["..."], "methods": ["POST"], "max_cost_usd": 1.0, "requires_approval": true}
  },
  "limits": {"max_actions_per_task": 10, "max_retries_per_action": 2, "max_task_cost_usd": 5.0, "min_ms_between_dispatches": 1000},
  "thresholds": {"auto_act_is_actionable": 0.8, "review_floor": 0.3, "risk_requires_approval": 2},
  "categories": {"lead_intake": "…", "research": "…", "communication": "…", "data_change": "…", "other": "…"},
  "blocked_action": "terminal"
}
```

Gate checks, in order — ANY failure means `blocked` (fail closed, never guess); a check that is merely restrictive produces `needs_approval`:
1. Parse errors / missing policy / unknown tool name / URL host not in the tool's `hosts` allowlist / method not allowed → **blocked** (`gate_reasons` states which check failed; close and log).
2. Pause: task (or its tenant, or all) inside the pause scope → **blocked** (`pause_active` reason).
3. Action count > `max_actions_per_task`, task cost + est. action cost > `max_task_cost_usd`, retries exhausted → **blocked**.
4. Risk ≥ `risk_requires_approval` (from decide, when available) OR tool `requires_approval: true` OR no valid approval on file → **needs_approval** (creates a `jev_approvals` row, status pending, `expires_at` = now + `policy.approval_ttl_seconds` default 86400).
5. Approval present: valid only if status=approved AND `expires_at` > now AND `policy_version` == current policy version AND `payload_hash` matches the action's canonical body hash AND actor non-empty. Expired or version-stale approvals → **needs_approval** again (never auto-pass).
6. Otherwise → **allowed**.

The gate ALWAYS records: outcome, reasons array, policy version enforced, timestamp — as a `gate_decision` event.

## 9. Execute (05)

- Only actions with a current valid gate=allowed (or an approval that re-passed the gate at approve time) may dispatch.
- Dispatch re-checks pause (the diagram's second check) — if pause now applies, skip with reason `pause_active`, no request sent.
- `stable_id` = `jev-<task_id>-<seq>` sent as `Idempotency-Key` header on POST (providers that support it); recorded so a repeat dispatch with the same stable_id is detectable and refused unless a reconcile resolved it.
- Outbound fetch with a 30s timeout (AbortController). Response stored: status, headers (subset), body (≤ 64 KB), provider_ref extracted if `expected.provider_ref_path` given. On network error/timeout → action state `unknown` (NOT failed — we don't know if the effect happened), triggers the reconcile path.
- Credentials: v1 tools are host-scoped fetches only; no credential store is added. Any per-host auth must arrive via caller-supplied headers that the policy explicitly allowlists per tool (`allowed_header_names`), else the header is stripped and the gate blocks.

## 10. Verify (06) — independent check

- `expected_json` predicates on the RESPONSE of the action: `status_range`, `contains`, `equals`, `json_path` (simple dot path + optional value). All must pass → `verified_success`.
- Independent re-check: for actions declaring `expected.recheck: {method:"GET", url}`, perform the recheck fetch and evaluate the same predicates against ITS response. If recheck contradicts the dispatch response → `unknown`.
- Missing/undecidable evidence → `unknown` (never silently success).
- Results appended as `verify_result` events with full evidence.

## 11. Loop control (07)

- `continue`: if all actions verified_success → close terminal:succeeded. If some action is failed/unknown/proposed → re-run decide (with outcomes attached) then gate; return `next: more_work`.
- `retry` (confirmed failure only): increments attempts; refuses when attempts ≥ max_retries_per_action or task budget exhausted (`unsafe_retry` → route to review: task state `awaiting_approval` with a special approval kind `review`).
- `reconcile`: consumes caller-supplied provider evidence (e.g., a provider status URL/response). If evidence proves the effect happened or not → resolved, verify path. If not → awaiting_approval, `unresolved_reconcile` reason. NEVER re-dispatches on its own.

## 12. Review (human)

- Pending approvals listed with countdown to expiry. Approve: validates binding, re-runs gate under CURRENT policy; if policy changed so the action now blocks → approval is recorded `superseded` and the gate outcome stands (blocked).
- Expiry: any GET of tasks/approvals lazily expires past-due pending approvals (status → expired, task → terminal:expired if no other pending work).
- Guide: guidance text stored on the task (`decision_json.guidance`), state → decided; next decide call includes it.

## 13. Improve loop

- Learnings are appended (proposed) by any stage (e.g., gate blocks that look like policy gaps suggest a policy change; decide low-confidence clusters suggest category additions). GET lists them.
- `promote` is manual-only, requires actor + optional `new_policy` (full replacement doc, validated by the same schema check as gate parse). Promotion: writes new `jev-policy.json` with `version+1`, appends `policy_changed` event, and marks every pending approval whose `policy_version` < new version as expired (invalidating affected approvals). A learning can never promote itself — there is no automated path, and no endpoint schedules promotion.

## 14. Dashboard (worker page at /jev/)

- KV key `jev-index.html`, served by the legacy module at `GET /jev` and `/jev/` (pattern: identical to `/map/`). Static assets (if any) served from KV keys `jev/<name>`.
- Single page, no build step, vanilla JS + the site's Space Grotesk/Inter fonts + navy/violet palette (site brand: #0B1026 background, #DB46F5 accent — match the Steady Orbit look but terminal-dense: it's an ops console).
- Sections: summary tiles (tasks by state, pending approvals, 24h cost, policy version), task table (filterable by state/outcome), task detail drawer (actions, gate reasons, events timeline), pending-approvals panel with Approve/Reject/Guide buttons (prompts for actor + optional note), pause toggle with scope picker, learnings list with Promote.
- Auth: key entry box (stored in sessionStorage), all fetches send `Authorization: Bearer`. 401 → re-prompt. No key → read-only view of nothing (endpoints 401; show auth panel).
- Every action button must show the irreversible consequence in its confirm dialog (e.g., "Approve dispatches this exact action; cannot be undone").

## 15. Module file contract (build/)

ES modules, no imports of npm packages, targeting the worker runtime (standard Web APIs only). Each file exports the named functions below; the orchestrator route table (written separately) imports them:

- `jev-state.js`: `ensureSchema(db)`, `now()`, `newId(prefix)`, `sha256Hex(str)`, `appendEvent(db, {task_id, action_id, kind, data, policy_version})`, `getTask(db,id)`, `getActions(db,taskId)`, `transit(db, task, toState, data)` (validates transition table, appends event), `TERMINAL_STATES`, `VALID_TRANSITIONS`.
- `jev-gate.js`: `loadPolicy(env)` (KV read + JSON parse + shape validation; on any failure returns `{error}` and callers must treat as gate=blocked — fail closed includes fail-on-unreadable-policy), `checkPause(policy, task)`, `gateAction(policy, task, action, approvals, now)` → `{outcome, reasons, policy_version, approval_id?}`, `validatePolicyDoc(doc)` → `null | errorString`, `canonicalHash(obj)` (stable JSON stringify with sorted keys → sha256).
- `jev-decide.js`: `understand(env, policy, task)` → intent_json, `decideActions(env, policy, task, intent)` → array of proposed actions, `askJev(env, state, questions)` (thin wrapper over the internal decide relay path — reuse the same DefAPI call shape the `/api/decide` route uses; include UA header, never log the key).
- `jev-ingest.js`: `ingestTask(db, body)` → `{task, duplicate}`; validates source enum, size caps, computes content_hash, dedupe by idempotency_key, creates task row state=ingested.
- `jev-execute.js`: `dispatchAction(env, db, task, action, policy)` → `{dispatched, provider_ref?, response?, skipped?}`; enforces pause re-check + stable_id; `extractProviderRef(action, response)`.
- `jev-verify.js`: `verifyAction(env, db, task, action)` → `{verdict, evidence}`; evaluates `expected_json` predicates; performs independent recheck when declared.
- `jev-loop.js`: `continueTask(env, db, task)` → `{next, task}`, `retryAction(env, db, task, action)` → `{ok, reason?}`, `reconcileAction(env, db, task, action, evidence)` → `{resolved, verdict}`, `closeTask(db, task, outcome, reason)` (validates outcome ∈ six terminal states).
- `jev-review.js`: `listApprovals(db)`, `createApproval(db, task, action, policy)`, `approve(env, db, approvalId, actor, note)` (binding validation + gate re-run), `reject(db, approvalId, actor, reason)`, `guide(db, taskId, actor, guidance)`, `expireStale(db, now)` (lazy expiry).
- `jev-improve.js`: `listLearnings(db)`, `proposeLearning(db, taskId, proposal)`, `promoteLearning(env, db, learningId, actor, newPolicy)` (validate → KV write v+1 → invalidate stale approvals → event).
- `routes-jev.js`: the route table — a single `handleJev(req, env, db, url)` export that pattern-matches `p.startsWith('/api/jev')` routes per §5, does auth once, and calls module functions. The legacy index.js gets ONE insertion: `if (p.startsWith("/api/jev")) return handleJev(req, env, db, url);` placed immediately inside the `/api/` block before existing routes.

## 16. Testing strategy

Node built-in test runner (`node --test`), files in `build/test/*.test.mjs`. No network in unit tests: `askJev` is injectable (module functions accept an optional `deps` object with a `decide` stub). D1 is stubbed with an in-memory object implementing the tiny SQL surface used via a shared `dbx.js` helper — OR, simpler and preferred: write modules against a thin data-access layer (`dbx.js`) with functions per table (`insertTask`, `updateTask`, `insertEvent`, ...), so unit tests stub `dbx` and the D1 SQL lives only in `dbx.js` (one file, tested once against the real schema strings by checking statement syntax). Required test coverage: transition-table rejections, gate fail-closed on bad/missing policy, approval binding mismatch + expiry + policy-version invalidation, pause blocks dispatch, terminal-state distinctness, dedupe idempotency, unknown-vs-failure classification.

## 17. Boundaries

- Always: append-only events; gate before every dispatch; record policy version on every decision; JSON errors with codes; keep legacy routes byte-identical.
- Ask first: any change to an existing legacy route, new Secrets Store bindings, changing the D1 database identity.
- Never: let a jev/LLM probability alone authorize dispatch; UPDATE/DELETE on jev_events; silently succeed on unknown outcomes; auto-activate learnings; commit secrets.

## 18. Success criteria

- All `/api/jev/*` endpoints live and return documented shapes; `/api/jev/health` reports `{ok:true}` once `JEV_API_KEY` binding exists.
- A scripted end-to-end run: create task (with 2 actions, one requiring approval) → gate returns needs_approval → approve → execute (pause test first: set pause, verify dispatch skipped) → clear pause → execute → verify → continue → terminal:succeeded; all events present and append-only.
- Dashboard at /jev/ renders and performs approve/reject/pause against the live API.
- Existing site + API routes unchanged (verify /, /api/decide, /api/fits, /map/ still 200).
- SKILL.md + refs doc shipped to yubi-OS/yubiOS.
