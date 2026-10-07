# SPEC: Jev Automations — worker-hosted Llama automations on the /jev/ console

Status: formal spec. Decisions locked (Jenny, 2026-09-30 ~23:50 PT): daytona = code-exec sandbox (future slot for JS-rendered fetches); HYBRID model split (DefAPI jev-1.13 stays the structured decision layer; Llama = generation + safety); THREE-TIER model routing. Extends the deployed jev-orchestrator (session/jev/build/* — session artifact, not repo-truth; live on the steady-orbit worker). Same invariants as SPEC.md apply — read `yubi-OS/yubiOS/skills/jev-orchestrator/SPEC.md` first, especially §1 invariants, §6 schema, §8 gate.

## 1. Objective

Move the Steady Orbit lead machine's orchestration off n8n onto the steady-orbit worker as Llama-powered automations: deployed and prompt-driven from the /jev/ dashboard, at near-zero marginal cost, with the deterministic gate, human approval flow, and append-only audit untouched. n8n keeps only the searXNG proxy.

## 2. Runtime context

- Worker: `steady-orbit` (same multipart deployment as before; module parts grow). Bindings: `env.AI` (Workers AI — models listed in §5), `env.DB` (D1), `env.SITE` (KV), secrets via Secrets Store.
- Workers Paid plan: 30s CPU per request. Automation stages are I/O-heavy but must chunk: one request = one automation run step, NOT a whole batch. Long batches resume via scheduler-driven continuation (see §7).
- Model routes (locked three-tier): `classify` → `@cf/meta/llama-3.1-8b-instruct-fp8`; `draft` → `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; `guard` → `@cf/meta/llama-guard-3-8b`. An automation stage may pin `raw:<model name>` to override. Route names, never raw model ids, in automation defs (except raw:).
- jev-1.13 (DefAPI via /api/decide) REMAINS the understand/decide advisory layer in the task pipeline. Llama does NOT decide anything the gate consumes as authorization. Llama outputs are (a) pipeline data, (b) action PROPOSALS that still pass the deterministic gate, (c) safety verdicts that are advisory and recorded.
- New D1 tables created by `ensureSchema` (additive, same lazy pattern). New column: `jev_tasks.llm_neurons INTEGER NOT NULL DEFAULT 0` — because CREATE IF NOT EXISTS does not alter existing tables, `ensureSchema` must also run `ALTER TABLE jev_tasks ADD COLUMN llm_neurons INTEGER NOT NULL DEFAULT 0` guarded by a try/catch (D1 errors if the column exists; treat "duplicate column" as success). Same guarded-ALTER pattern for every new column on existing tables.

## 3. Automation model

```sql
CREATE TABLE IF NOT EXISTS jev_automations (
  id TEXT PRIMARY KEY,            -- 'am_' + 16 hex
  name TEXT NOT NULL,             -- kebab-case, unique per active version
  version INTEGER NOT NULL,       -- monotonic per name
  status TEXT NOT NULL,           -- draft|active|paused|retired
  def_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  last_fired_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS jev_automations_namever ON jev_automations(name, version);
```

Automation definition (`def_json`):

```json
{
  "name": "lead-research",
  "description": "…",
  "trigger": {"type": "manual"} | {"type": "interval", "every_minutes": 60, "batch": 5},
  "input": {"type": "none"} | {"type": "prompt"} | {"type": "schema", "schema": {...}},
  "stages": [
    {"id": "find",       "type": "tool",     "tool_ref": "places.search", "params_from": "$.input", "method": "POST", "url": "https://places.googleapis.com/v1/places:searchText", "headers": {...}, "max_response_bytes": 262144},
    {"id": "classify",   "type": "llm",      "route": "classify", "prompt": "Classify …: {{ $.find.body }}", "json_output": true},
    {"id": "audit",      "type": "builtin",  "builtin": "lead_audit", "input_from": "$.pages"},
    {"id": "draft",      "type": "llm",      "route": "draft", "prompt": "Draft a 90-word cold email …: {{ $.audit }}" },
    {"id": "guard",      "type": "guard",    "input_from": "$.draft.text"},
    {"id": "act",        "type": "propose_actions", "actions_from": "$.draft.actions"}
  ],
  "limits": {"max_stages_ms_total": 25000, "max_tool_calls_per_run": 12}
}
```

Stage semantics:
- `tool`: a pipeline fetch executed by the engine (NOT a gated jev action). Read-only research I/O. Constraints enforced by the engine: method MUST be GET unless `tool_ref` names a policy tool whose host allowlist covers the URL; response capped (`max_response_bytes`, default 256 KB); 30s timeout; every call appended as an event kind `automation_tool_call` with url + status + bytes (never the body if it may contain personal data — cap at 2 KB preview). Any stage whose method is not GET and whose URL host is not covered by a policy tool → the stage is REFUSED at definition-validation time (writes go through propose_actions/gate — this is the SPEC §1 invariant preserved).
- `llm`: prompt with `{{ $.path.to.value }}` interpolation from the run context; `json_output: true` → parse with repair (strip code fences, take the first balanced {...} or [...]); on unparseable after one strict-retry, the stage records `llm_error` and the run continues with the stage output marked unavailable (fail-soft, never fabricates). Neurons from the AI binding response are accumulated to the task.
- `builtin`: a registered deterministic function (v1 registry: `lead_audit` — the ported lead-machine audit lib). Builtins are pure, side-effect-free, and tested.
- `guard`: runs the `guard` route on `input_from` text; output `{safe, categories}` recorded as a `guard_verdict` event. If unsafe: the run's propose_actions stage is skipped and the task transits to `awaiting_approval` with reason `guard_flagged` (human review sees the verdict). Guard is advisory-to-humans, never a gate rule.
- `propose_actions`: converts run context into proposed jev actions; they enter the EXISTING pipeline (gate → approval → execute → verify) unchanged. The action array may be literal in the def (template with interpolation) or produced by an llm stage.

Execution: `runAutomation(env, dbx, automation, input)` → creates a task (source `automation`, payload = {automation_id, name, version, input}) and runs stages inline, persisting each stage output into `decision_json.run` (JSON, capped 256 KB). Any stage throw → the task closes `terminal:failed` with the stage id + honest reason (fail-closed, no silent partials). The 30s CPU budget: if `limits.max_stages_ms_total` is exhausted, the run records a `run_continuation` event with a resume token `{stage_index, ctx_ref}` and the task transits to a NEW state `resumable` (added to VALID_TRANSITIONS: `resumable → dispatching-resume` handled by the scheduler re-invoking `resumeAutomation`; see §7). v1 keeps resume coarse: whole-batch automations are chunked by the scheduler so single runs fit; `resumable` exists but lead-research v1 is chunked per-business instead (§8) and should never hit it.

## 4. Registry endpoints (added to handleJev)

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/jev/automations` | GET | — | `{automations:[{id,name,version,status,trigger,last_fired_at}]}` (active version per name) |
| `/api/jev/automations` | POST | full def JSON | validates (§3 rules) → inserts as version max+1 status `draft` → `{automation}` |
| `/api/jev/automations/:id/activate` | POST | `{actor}` | status → active; any other active version of the same name → `paused` (single-active-per-name) |
| `/api/jev/automations/:id/pause` | POST | `{actor}` | status → paused |
| `/api/jev/automations/:id/run` | POST | input JSON (or `{"prompt": "..."}`) | creates + runs the task inline (≤ 25s CPU); returns the task |
| `/api/jev/models` | GET | — | `{routes:{classify,draft,guard}}` for the console |
| `/api/jev/learnings` route unchanged; automations NEVER self-modify (the improve loop remains human-promoted) |

Def validation (`validateAutomationDef`) returns error strings; activation refuses invalid defs. Version stamping: task payload carries `{automation_id, name, version}` and a `automation_deployed` event records it — same audit discipline as policy_version.

## 5. LLM runtime (`jev-llm.js`)

- `runLLM(env, route, prompt, opts)` → `{text, neurons}` via `env.AI.run(MODELS[route], {messages:[{role:'user',content:prompt}], max_tokens: opts.max_tokens || 512})`. Model ids: classify `@cf/meta/llama-3.1-8b-instruct-fp8`, draft `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, guard `@cf/meta/llama-guard-3-8b`. `raw:` prefix → direct model name (validated against a regex, never interpolated into anything).
- `runLLMJson(env, route, prompt)` → parse-with-repair as in §3; `repairJson(text)` exported for tests.
- `runGuard(env, text)` → llama-guard-3-8b returns `{safe: boolean, categories: [...]}` (its native schema is `{safe, categories}`; tolerate shape drift defensively and treat unparseable as `{safe: false, categories: ['unparseable'], error: true}` — fail toward review, never toward send).
- Errors: AI binding failures record `llm_error` events and fail the stage softly (§3). Neurons: response `usage` field if present; else 0.
- COST RULE: LLM outputs never authorize. The gate never calls runLLM. Nothing in jev-gate.js changes.

## 6. Prompt intake

- `POST /api/jev/tasks` with `payload.prompt` (string ≤ 8000 chars, no `actions` key): the pipeline's decide stage detects prompt-mode and calls a NEW `decideActionsFromPrompt(env, policy, task, deps)` (jev-decide addition): one 70b call with the policy tool list embedded in the prompt, instructions to return ONLY `{"actions":[{tool,method,url,headers,body,expected}]}` or `{"actions":[]}`; output parsed via `repairJson`; each proposed action runs through the SAME validation as caller-supplied actions (existing code path — method/url/tool checks), then the normal gate. `decided_via: 'llama_prompt'`. Task records llm_neurons. If the LLM returns garbage twice → `decided_via: 'none'`, reason `llm_proposal_unparseable`, task parks in `decided` (no actions, honest state).
- The prompt itself is untrusted input: stored verbatim, never interpolated into URLs or executed; the LLM sees it only as prompt content.
- Dashboard prompt console: textarea → POST /api/jev/tasks → task detail drawer opens on the new task.

## 7. Scheduler (`jev-scheduler.js` + worker cron)

- Worker metadata gains `"triggers": {"crons": ["*/5 * * * *"`-style entry(s) — the upload metadata JSON gains the `triggers` field; the scheduled handler is added to the legacy index.js export (`async scheduled(controller, env, ctx)` calling `runSchedulerTick(env)` from jev-scheduler.js). The entry module (solar-rbs-entry.mjs) does NOT need changes; the legacy module exports default {fetch}; add `scheduled` to that same export object.
- `runSchedulerTick(env)`: for each ACTIVE automation with trigger.type `interval`: if `now - last_fired_at >= every_minutes` → update last_fired_at FIRST (idempotency against overlapping ticks), then create the run task with source `schedule`. Overlap guard: a simple D1 compare-and-set on last_fired_at; on race, skip (a lost tick is fine, a double-fire is not).
- Auth: cron invocations carry no bearer; `scheduled` runs trusted inside the worker — document this in the audit event (`trigger: 'scheduler'`).

## 8. Lead machine v1 (builtins + automations)

Ported from session/jev/lead-machine/lead-machine/ (session artifact, not repo-truth; lib is the source of truth; tests exist there). v1 scope decisions:
- **System of record is D1** (jev tasks + a `jev_leads` table) — HubSpot integration is deferred (no HubSpot token in Secrets Store; it becomes a policy learning later). `jev_leads`: id, business_name, domain, place_id, finding_code, finding_text, evidence_url, contact_email, contact_status, draft_subject, draft_body, guard_verdict, stage, task_id, created_at.
- **`lead_audit` builtin**: port `lib/audit.js` + `lib/extract.js` + `lib/normalize.js` + `lib/template.js` + `nodes/fanout-pages.js`/`apply-mx.js` logic into `jev-lead-lib.js` (plain JS, no fs/npm — the lib is already dependency-free; preserve the refuse-to-claim guards verbatim: javascript_rendered, embedded-form vendor fingerprints, booking-by-script detection, facebook-only/no-website lanes). Port the TESTS too (test/run-tests.js + test-extract.js + test-pipeline.js cases) as worker-runnable node tests in build/test/lead-lib.test.mjs — the lib must pass the same behavioral assertions.
- **`lead-research` automation (builtin type `lead_research`)**: params {niche, location, limit (≤ 20), min_reviews}. One run = ONE Places text search (≤ 20 results) + per-business pipeline CHUNKED BY THE SCHEDULER: the run processes up to `batch` businesses per invocation and records a continuation cursor (`jev_leads.pending_batch` or a `run_context` KV key) for the next tick. Per business: fetch home/contact/about/pricing pages (tool stages, GET, web.fetch_public rules below) → lead_audit → email+MX (dns.google) → template draft → guard stage → propose ONE `resend.send` action → gate. Businesses needing JS rendering → `stage='javascript_rendered'`, skipped (Daytona is the future recovery lane, noted not built).
- **Policy learning needed (goes through the AUDITED flow)**: add tool `web.fetch_public` {hosts:["*"], methods:["GET"], requires_approval:false, max_cost_usd:0} — read-only, credential-less, response-capped; and `places.search` {hosts:["places.googleapis.com"], methods:["POST"], requires_approval:false, credential:"GOOGLE_PLACES_API_KEY"}. GOVERNANCE: web.fetch_public with hosts ["*"] is a deliberate, bounded exception — GET-only, no credentials, capped responses, engine-logged; the def validation refuses any non-GET stage using it.
- **Secret needed from Jenny**: `GOOGLE_PLACES_API_KEY` in the Secrets Store (n8n credential currently holds one). Until the secret + binding exist, the Places stage fails closed (`credential_unavailable`) and the automation reports honestly.
- **`lead-outreach`**: for leads already in D1 with a draft + guard-safe verdict: create the send task (propose resend.send with the draft) — the machine's four-condition gate maps to D1 fields; all four must hold or the lead lands `needs_review` with a reason (same as the original design).
- **Reply handling**: v1 = a `/api/leadmachine/reply` webhook route on the worker (path outside /api/jev to keep the route table clean, or under /api/jev as a passthrough — choose `/api/jev/webhooks/reply`) that accepts the reply POST, records a task with `resend.send` NOT proposed (replies are records, not sends), updates jev_leads.stage='replied'. Instantly is OUT per Jenny; replies arrive via Resend webhook or manual entry in v1 — accept both shapes: Resend's webhook JSON or a manual JSON POST {email, text}.

## 9. Console v2 (dashboard additions)

Extend `jev-index.html` (KV `jev-index.html`): three additions, same terminal-ops aesthetic:
1. **Prompt console** — textarea + "Run" button (creates a task via prompt intake; shows the resulting task drawer).
2. **Automations tab** — list (name, version, status, trigger, last fired), def JSON editor (textarea + validate feedback), Deploy (POST), Activate/Pause, Run-now (with input JSON box). Deployed defs are versioned; the editor edits a DRAFT, never a live version in place.
3. **Models indicator** — GET /api/jev/models shown in the header pill (route → model id).

## 10. Module file contract (build/ additions)

- `jev-automations.js`: `validateAutomationDef(def)` → error|null; `insertAutomation(dbx, def, actor, helpers)`; `activateAutomation` / `pauseAutomation`; `listAutomations(dbx)`; `getActiveAutomation(dbx, name)`.
- `jev-llm.js`: `MODEL_ROUTES`, `runLLM`, `runLLMJson`, `repairJson`, `runGuard`.
- `jev-engine.js`: `runAutomation(env, dbx, automation, input, deps)` (stage executor incl. tool/llm/builtin/guard/propose stages, continuation, event appends, llm_neurons accounting); `BUILTINS` registry.
- `jev-lead-lib.js`: ported audit/extract/normalize/template (pure).
- `jev-lead.js`: `leadResearchRun(...)` (the chunked per-business pipeline), `leadOutreachRun(...)`, `handleReplyWebhook(...)`, D1 `jev_leads` access.
- `jev-scheduler.js`: `runSchedulerTick(env, deps)`.
- `routes-automations.js`: the new routes (§4 + §8 webhook) as `handleJevAutomations(req, env, deps)` dispatched from routes-jev.js's jev branch (one added line), plus the prompt-intake hook inside the tasks pipeline (decide stage branch).
- Console: extend `jev-index.html`.

## 11. Testing strategy

node --test, same deps-injection pattern (AI binding stubbed). Required coverage: def validation refusals (non-GET on web.fetch_public, unknown route, bad stage refs); llm JSON repair (fences, prose-wrapped JSON, malformed→fail-soft); guard unparseable → fail-toward-review; propose_actions actions pass through the existing gate unchanged (a prompt-injected malicious action with a non-allowlisted host MUST block); scheduler idempotency (overlapping ticks fire once); lead_audit behavioral parity with the machine's test fixtures (the 8 audit cases incl. both false-positive traps); chunked research continuation; automation version stamping on tasks.

## 12. Boundaries

- Always: events for every stage + tool call; neurons accounted; version stamped; guard verdicts recorded; fail-closed on credential/config absence.
- Ask first: any change to existing jev routes/modules beyond the one-line dispatch hook; new Secrets Store bindings (Jenny adds secrets); policy changes (audited learning flow).
- Never: LLM output as authorization; non-GET automation tool stages outside the gate; silently dropping lead-audit guards; auto-activating automations; learning self-promotion.

## 13. Success criteria

- An automation deployed from the console, activated, run (manual + interval), visible in run history with version stamps.
- A prompt typed into the console becomes a gated task whose actions (if any) went through the deterministic gate.
- Lead-research run on one niche/location: Places → audit (refuse-guards intact) → draft → guard → gated resend.send proposal; human approval sends it (or blocks it) with full audit.
- All existing 170 tests still pass; new suites pass; legacy routes untouched.
