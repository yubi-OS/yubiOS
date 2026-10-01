# jev-orchestrator — the Jev v2 control architecture as a deployable skill (2026-10-01)

Byline: Shant Tchatalbachian. Status: SHIPPED (live on the steady-orbit worker 2026-10-01T05:40Z).

## What this is

`Jev_Architecture_v2.svg` described an operations controller: ingest → understand → decide → **deterministic fail-closed policy gate** → execute → independent verify → continue/terminal, with a human review queue, a pause/kill switch that cannot undo completed effects, central append-only state, and an improve loop whose learnings cannot activate themselves. This doc records the formalization of that diagram into a working orchestration template on the Steady Orbit Systems infrastructure. Any automation or skill that must perform gated, verifiable, human-approvable actions adopts the same flow.

- Live surface: `https://steady-orbit.systems-a.workers.dev/api/jev/*` (21 routes) + ops console at `/jev/` (KV-served single page).
- State: D1 (`jev_tasks`, `jev_actions`, `jev_events` append-only, `jev_approvals`, `jev_learnings`; schema auto-applies on first request).
- Policy: KV `jev-policy.json`, versioned; every gate decision stamps the version it enforced.
- Decisions layer: DefAPI typesafe/jev-1.13 via the worker's existing `/api/decide` relay — Understand (intent category, actionable noul, risk score) and Decide (proposed action) are **advisory only**; a probability never authorizes dispatch.

## Design record

- Capability map (10 modules, dependency-ordered build) approved before any spec: `session/jev/CAPABILITY_MAP.md`.
- ideate-solo one-pager (7 variations, 5 lenses; winner = thin controller on the worker's existing append-only `/api/outcomes` ledger pattern, n8n/Sauna-compatible plain JSON, HTTP-fetch as the v1 tool surface): `session/jev/jev-orchestrator-solo-2026-09-30.md`.
- Formal spec (endpoint contract, DDL, gate rules, approval binding, terminal enum, module contract, test strategy): `session/jev/SPEC.md`.

## Build method

Four parallel implementation lanes (state/gate/dbx, ingest/decide, execute/verify/loop, review/improve/routes/dashboard) with fully deps-injected modules and self-contained test suites (163 tests), then an advisor/integrator lane that reconciled interfaces, fixed five cross-lane bugs, and added the wiring module + full-lifecycle e2e (168/168 total). Key catches:

- async dbx made lane B's sync dedupe treat every thenable as an existing row — **every idempotent create would have been a false duplicate**.
- unawaited payload hash in review would have failed **every** approval with BINDING_MISMATCH.
- routes treated the decide wrapper as an array (TypeError on every non-caller-action pipeline) and ran the KV policy load synchronously (7 sites).
- execute eligibility was task-level; now each action re-gates against CURRENT policy immediately before dispatch (the diagram's "check pause again at dispatch", generalized).

## Deviations (deliberate, documented)

1. `jev_actions` extended with `response_json`, `verified_at`, `reconciled_at`, `updated_at` (SPEC §9 requires storing the dispatch response; §6 had no column).
2. Terminal states persist as `state='terminal'` + `terminal_outcome` (six-value enum) rather than the §4 `terminal:<o>` string form; readers accept both.
3. Approval binding hash covers `{method, url, body}` (stricter than the gate's body-only hash); the two are never cross-compared today — unify before ever passing approval rows into `gateAction`.
4. Intermediate §4 states (`dispatching`, `verifying`, `continued`) exist in the transition table but the HTTP flow closes terminal directly from `gated`/`verifying` verdicts.
5. Rate limiting is in-isolate (30/min/IP) rather than the worker's `WEBSITE_RATE_LIMIT` binding — the legacy helper is not exported from the bundle.

## Deploy record

- 2026-10-01T05:40Z: worker `steady-orbit` redeployed via the modules API (multipart parts): `solar-rbs-entry.mjs`, `index.js` (+532 B: import, `/api/jev` branch before the first legacy route, `/jev` page route), and 12 new parts `jev-main.js dbx.js jev-state.js jev-gate.js jev-ingest.js jev-decide.js jev-execute.js jev-verify.js jev-loop.js jev-review.js jev-improve.js routes-jev.js`. Entry module needed one line: `/jev` added to its legacy-territory exclusion list (the entry's real-404 page was shadowing the legacy route — the "entry stays byte-identical" plan was wrong by one exclusion).
- KV: `jev-policy.json` (v1 starter: http.fetch GET/POST hosts api.github.com/api.defapi.org no-approval $0.5; http.post approval-required $1.0; limits 10 actions / 2 retries / $5 task cap) + `jev-index.html`.
- `JEV_API_KEY` binding aliases the existing `DEFAPI_API_KEY` Secrets Store secret (operator key = DefAPI key; no new credential minted).
- Verified live: `/api/jev/health` → `{ok:true, jev:"ready", policy_version:1, paused:false}`; bogus/missing bearer → 401 (binding resolved, constant-time compare path exercised); `/`, `/api/decide` (422 validation probe), `/api/fits`, `/map/` all unchanged 200s; `/jev/` serves the console.
- Existing site + APIs untouched: legacy routes are byte-identical; the jev branch only matches `/api/jev*` and sits before every legacy route, so neither can shadow the other.

## Skill

`skills/jev-orchestrator/SKILL.md` — the caller's contract: task creation shape, approval loop, failure paths (retry / reconcile / close), invariants, curl examples. Companion: `defapi-jev` (the decision-model skill this extends).

## First live use case (2026-10-01 ~06:05Z) — gated digest task, run end-to-end

Task `t_74ac315663564484` ("yubiOS digest 2026-09-30 (first Jev run)"): understand classified it (communication, below review floor), the gate split the two actions (`http.fetch` allowed / `http.post` needs_approval), approval `ap_a175134319425acd` bound actor, target, payload hash, limits, expiry and policy v1 and re-passed the gate on approve, pause correctly skipped both dispatches (`pause_active`, the diagram's second pause check), dispatch used stable ids (`jev-<task>-<n>`), verify judged each action independently, retry worked within limits, and the task closed `terminal:failed` with an honest reason (one action `verified_success`; the other hit GitHub's anonymous rate limit). 25-event append-only chain; total jev decision spend $0.00007. Evidence: `first-use-evidence.json` in the source bundle.

Two live bugs surfaced and fixed the same hour (the first use case doing its job):
1. **D1/test parity**: `transit` forwarded unknown data keys (`intent_available`) into the row UPDATE; D1 fails closed on unknown columns (`SQLITE_ERROR: no such column`) while the memory test driver tolerated them, so all 168 tests missed it. Fix: `dbx.updateTask`/`updateAction` filter patches to real columns; `transit` persists only known columns and carries the full data payload into the `state_change` audit event. 2 regression tests added (corpus now 170).
2. **UA-less outbound fetches**: GitHub 403s requests without a User-Agent ("Request forbidden by administrative rules"). Fix: dispatch and the independent recheck always send `User-Agent: jev-orchestrator/1 (+https://steady-orbit.systems-a.workers.dev)` unless the caller supplied one.

Known environmental limit: GitHub anonymous REST is rate-limited per IP and the worker shares Cloudflare's egress pool, so read-only GitHub actions fail intermittently (the same 403/60-per-hour phenomenon documented in the point-map work). Durable fix is a scoped credential path for the executor, which SPEC v1 deliberately deferred.

## Open items (revised)

1. ~~First authenticated live E2E~~ — DONE 2026-10-01 (this section); caller = `Steady Orbit jev operator` connection (DefAPI key registered against the worker origin; the proxy injects per-domain, so the DefAPI connection's api.defapi.org binding alone could not authenticate worker calls).
2. Provider adapters beyond host-scoped fetch (per-provider cancel/status APIs for reconcile) — later.
3. Scoped executor credentials for authenticated provider calls (GitHub token etc.) — new, highest-value next step given the rate-limit finding.
4. Tenant column exists but multi-tenant is unexercised by design (single-owner infra).
5. Summarizer reachability via the ai_interface_proxy binding path remains open from the on-device-AI work — unrelated here, listed for continuity only.
