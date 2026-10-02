---
name: jev-orchestrator
description: "Run gated, verifiable, human-approvable automations through the Jev orchestration API on the steady-orbit worker — a fail-closed policy gate, approval bindings that expire and invalidate on policy change, independent verification, six distinct terminal states, and an append-only audit log, with jev-1.13 (DefAPI) as the advisory Understand/Decide layer. Use when an automation or skill must execute an action with real-world effects and needs deterministic gating, spend/rate limits, human approval for risky actions, verified outcomes, and reconcilable unknowns. Live at https://steady-orbit.systems-a.workers.dev (API under /api/jev/*, ops console at /jev/)."
metadata:
  short-description: "Gated approval-flow orchestration API (Jev v2) on the steady-orbit worker"
---

# Jev orchestrator: gated action flow on the steady-orbit worker

Jev is an **operations controller**, not a chat model. You create a task describing what you want done and which tool calls would do it; a deterministic fail-closed policy gate decides whether the actions may run, need a human approval, or are blocked; execution happens with stable idempotency IDs; results are independently verified; and every task closes in exactly one of six terminal states. jev-1.13 classifies intent and proposes actions (advisory only — a probability never authorizes anything).

## When to use

- An automation must perform an **external action** (HTTP call to a provider) and someone should be able to review or stop it.
- You need **spend/rate/limit budgets** enforced in code, not in prose.
- The action can fail ambiguously (network timeout after a possible side effect) and needs **reconcile-before-repeat** semantics.
- You want an **audit trail**: every stage appends an event; nothing is ever silently rewritten.

Not for: pure read-only research (just call the API directly), or anything where you already have explicit human sign-off per call and no budget concerns — Jev adds structure you don't need.

## Invariants (enforced in code, not by convention)

- Gate is deterministic and fails closed: unreadable policy, unknown tool, host not allowlisted, pause active, limits exceeded → `blocked`. Its only outputs: `allowed`, `needs_approval`, `blocked`.
- An approval binds actor, target, payload, limits, expiry AND policy version. A policy change expires every approval bound to an older version.
- Terminal states are distinct: `succeeded`, `blocked`, `rejected`, `expired`, `failed`, `cancelled`. Blocked is not success.
- Unknown outcomes (timeout after possible effect) are never retried blindly — reconcile first.
- Learnings are proposals; only a human promotes them (and promotion invalidates affected approvals).
- LLMs hold no credentials; tool headers are stripped to a policy allowlist.

## Setup

1. Operator key: the `JEV_API_KEY` binding (Secrets Store, aliased to the DefAPI key). Sent as `Authorization: Bearer <key>`. Without it all routes 401; `/api/jev/health` is unauthenticated.
2. Policy doc: KV key `jev-policy.json` (versioned; edit via the dashboard's Promote flow or direct KV write — a version bump invalidates stale approvals).
3. Console: https://steady-orbit.systems-a.workers.dev/jev/ — enter the key once (sessionStorage), then you get tasks, pending approvals, pause control, costs, and learnings.

## The flow (what every caller does)

```bash
BASE=https://steady-orbit.systems-a.workers.dev/api/jev
K="Authorization: Bearer $JEV_KEY"

# 1. Create a task. Caller-supplied actions are the v1 shape.
curl -sS -H "$K" -H "Content-Type: application/json" "$BASE/tasks" -d '{
  "source": "manual",
  "title": "Post the weekly digest",
  "idempotency_key": "weekly-digest-2026-10-01",
  "payload": {
    "actions": [
      {"tool": "http.fetch", "method": "GET",
       "url": "https://api.github.com/repos/yubi-OS/yubiOS",
       "expected": {"status_range": [200, 299], "json_path": "full_name"}}
    ]
  }
}'
# -> {task, actions, gate_outcome, ...}  (duplicate:true if the idempotency_key was seen)

# 2. Read it back (actions, gate reasons, events).
curl -sS -H "$K" "$BASE/tasks/<task_id>"

# 3. If gate_outcome is needs_approval: approve in the /jev/ console, or via API.
curl -sS -H "$K" "$BASE/approvals"   # pending queue with expiry countdowns
curl -sS -H "$K" -H "Content-Type: application/json" "$BASE/approvals/<ap_id>/approve" \
  -d '{"actor": "jenny", "note": "ok"}'
# The approval is re-checked against the CURRENT policy version before it counts.

# 4. Dispatch (re-checks pause at dispatch; skips rather than firing if paused).
curl -sS -H "$K" -H "Content-Type: application/json" "$BASE/tasks/<id>/execute" -d '{}'

# 5. Verify, then continue or close.
curl -sS -H "$K" -H "Content-Type: application/json" "$BASE/tasks/<id>/verify" -d '{"action_id":"<a_id>"}'
# verdict: verified_success | confirmed_failure | unknown
curl -sS -H "$K" -H "Content-Type: application/json" "$BASE/tasks/<id>/continue" -d '{}'
# -> next: more_work (re-decide + re-gate) | terminal (succeeded once all verified)

# Pause / resume (blocks new + queued dispatch; never undoes completed effects).
curl -sS -H "$K" -H "Content-Type: application/json" "$BASE/pause" -d '{"paused": true, "scope": "all"}'
```

Failure paths, all explicit:
- `confirmed_failure` → `POST /tasks/:id/retry {action_id}` (only within limits; exhausted → human review).
- `unknown` → `POST /tasks/:id/reconcile {action_id, evidence:{observed: "happened"|"did_not_happen"|"unclear", ...}}` — resolved continues, unclear goes to review. Never re-dispatch on unknown.
- `close {outcome, reason}` closes with one of the six terminal states; `cancel` closes `cancelled`.

## Acting on results

- Treat `gate_outcome: blocked` as final unless you change the policy; the reasons array names the failing check.
- Poll `GET /tasks?state=awaiting_approval` or watch the console instead of spinning on execute.
- Log task ids in your own records; the audit log (`events` in the task detail) is the system of record.
- Cost: task `cost_usd` accumulates jev decision spend + per-call tool costs from the policy.

## Errors

- `401 UNAUTHORIZED` — wrong or missing bearer.
- `404 no route` — check the path (all under `/api/jev/`).
- `409` — approval binding mismatch / superseded by a policy change (body carries the new gate outcome).
- `503 NOT_CONFIGURED` — `JEV_API_KEY` binding missing (deploy-time condition, not a caller problem).
- Upstream decide failures never block the pipeline: understand returns `{unavailable: true}` and the gate still runs on caller-declared actions.

## Design sources

- Architecture: `Jev_Architecture_v2.svg` (ingest → understand → decide → gate → execute → verify → continue/terminal + central state + improve loop), formalized in `session/jev/SPEC.md` and the refs doc.
- Implemented as 12 ES modules on the `steady-orbit` worker (parts `jev-main.js` … `routes-jev.js`), D1 tables `jev_*` (schema auto-applies), dashboard from KV key `jev-index.html`.
- 168 unit/e2e tests; full lifecycle validated in CI-style e2e (create → gate → approve → pause-skip → dispatch → verify → terminal:succeeded, plus policy-change supersede).

## Examples

**Wrap an existing automation**: take the automation's next outbound call, declare it as one action with `expected` predicates, create the task with a per-run `idempotency_key` (e.g. the date), execute after gate/approval, verify, close. The n8n HTTP node can drive every step (plain JSON, no webhooks needed).

**Batch of risky actions**: create one task whose actions each carry `requires_approval` tools; approve each from the console; a policy bump mid-queue expires the unapproved ones automatically.

## Guidelines

1. Always send an `idempotency_key` for scheduled or retryable callers — dedupe is per (tenant, key) and returns the existing task instead of double-firing.
2. Declare `expected` predicates on every action; without them verification degrades to `unknown` and you lose the cheap success path.
3. Never bypass the gate by calling providers directly from the same automation — the audit log only covers what went through Jev.
4. When the gate blocks for policy reasons you keep working for free; when it blocks for spend/limits, promote a learning (human step) rather than raising limits silently.
5. The dashboard's confirm dialogs are the irreversibility contract: approve dispatches the exact bound action.

## Automations (Jev Automations layer, 2026-10-01)

On top of the task loop, the worker hosts **automations**: versioned templates in D1 that run stage pipelines (deterministic tool fetches → LLM stages → safety guard → gated action proposals) and can fire on a schedule. A freeform **prompt** is also a first-class task input — the 70b Llama model proposes actions, and every proposal passes the same deterministic gate as hand-written ones. The LLM never authorizes anything.

- **Model routes**: `classify` → llama-3.1-8b-instruct-fp8 (cheap extraction/classification) · `draft` → llama-3.3-70b-instruct-fp8-fast (generation, prompt-intake action proposals) · `guard` → llama-guard-3-8b (outbound-content safety verdict; unsafe → human review). `raw:<model>` pins anything else. Neuron usage lands on the task's `llm_neurons`.
- **Console** ([/jev/](https://steady-orbit.systems-a.workers.dev/jev/)): Prompt console (type → task), Automations tab (deploy / activate / pause / run-now with input), models pill.
- **Endpoints**: `GET/POST /api/jev/automations`, `POST /api/jev/automations/:id/activate|pause|run`, `GET /api/jev/models`, `POST /api/jev/webhooks/reply` (reply records; optional `?k=` shared secret).
- **Automation def shape**: `{name, description, trigger: {type:'manual'}|{type:'interval', every_minutes, batch}, input, tool_refs (hosts/methods the def's tool stages may use — non-GET stages MUST be covered by a policy tool, else validation refuses), stages: [{id, type: tool|llm|builtin|guard|propose_actions, ...}], limits}`. Stage prompts interpolate run context with `{{ $.stage_id.path }}`. Deploy edits create a new draft version; activation is single-active-per-name.
- **Scheduler**: worker cron (every 5 min) fires interval automations; fires are compare-and-set on `last_fired_at` (double-fire impossible) and carry per-interval idempotency keys.
- **First suite**: the Steady Orbit lead machine (research audit lib ported verbatim with all refuse-to-claim guards; drafts → guard → `resend.send` approval-gated; reply webhook records). D1 `jev_leads` is the v1 system of record; HubSpot integration is a future policy learning.
- **Caveat**: automations needing >30s CPU must be chunked (v1 lead-research batches per business); a run that exhausts its stage budget closes `terminal:failed` with `stage_budget_exhausted`, honestly.

## Gated repo commits + prompt-intake contracts (verified 2026-10-01/02, RSI rounds 1-3)

Patterns proven across the three rounds (PRs #276/#277/#278) and the email regression:

- **GitHub Contents writes are PUT, not POST.** `POST /repos/<o>/<r>/contents/<path>` 404s; declare `"method": "PUT"`. Policy v5+ allows PUT on `http.post` (learning `l_087eda59277032e1`).
- **Same-file sibling commits need a fresh blob sha.** When two cycles touch one file, fetch the branch head's blob sha again before the second commit; a stale sha 409s. Round 1 went 6/10 first pass, 4 retries all stale-sha.
- **Approve auto-dispatches.** The approve endpoint re-gates against the CURRENT policy version, then executes the bound action + verify + continue in one request (`autoexecuted` in the response). No separate execute call needed.
- **Evolution sweep `fire` is unique per (fire, date).** Sibling sweep rows on the same date collide; label the sweep with the corpus name (e.g. "refs/-corpus") and reuse one sweep's directives per round instead of stacking same-fire sweeps.
- **`resend.send` body schema (validator SHIPPED 2026-10-02, etag 4dca4182…).** Bodies must be `{"from": "...", "to": ["..."], "subject": "...", "html": "..."}` (from = `Steady Orbit <site@axel.steadyorbitsystems.ai>`). `validateResendSendBody` in `jev-decide.js` now rejects malformed bodies at propose-time on BOTH paths: caller-supplied actions get `422 INVALID_ACTION` (task closes `rejected`), LLM proposals get dropped with an `invalid_action:` reason. Reference: task `t_e173b0b1d05a1877` (2026-10-02), approval granted, Resend 422, email never sent — the regression that bought the validator.
- **Below-floor prompts still gate, correctly.** Intent `actionable: 0` / `below_floor` does not block a proposed action; the deterministic gate still decides. The email regression was a schema defect, not a gate defect.

Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.
