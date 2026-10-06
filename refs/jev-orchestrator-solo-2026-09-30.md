# Jev orchestrator skill [SOLO]

Date: 2026-09-30
Source: ideate-solo (no dialogue)
Scope class: systemic
Variations generated: 7
Finalist: V1+V5 hybrid ("thin controller on the ledger pattern")

## Problem Statement

How might we turn the Jev v2 control architecture (ingest → understand → decide → gate → execute → verify → continue/terminal, with a fail-closed policy gate and a human review loop) into a concrete skill + API surface on the steady-orbit worker that any automation or skill can adopt when it needs gated, verifiable, human-approvable actions?

## Recommended Direction

A **thin controller**: the worker hosts the state machine (D1), the deterministic fail-closed gate, the approval queue/dashboard, and verify/reconcile logic. jev-1.13 (via the existing `/api/decide` relay) powers Understand (intent classification) and Decide (action proposal + risk scoring) — advisory only, its probabilities never authorize anything. Execution in v1 is a scoped outbound-HTTP allowlist (each task declares its tool calls; the gate checks them against a policy doc in KV; dispatch uses stable action IDs with idempotency keys).

Conventions are borrowed from the worker's existing append-only `/api/outcomes` ledger (the point-map pattern already on this worker): append-only audit rows, digest-stable IDs, explicit verdicts, no implicit state. The API is designed so n8n workflows and Sauna sessions are both first-class callers (plain JSON, one task per resource, poll-friendly status endpoint, webhook-free).

This is V1 (Simplification) as the core, with V5's ledger conventions (Combination with the existing outcomes/audit pattern) and V4's n8n-compatibility constraints (Audience shift) folded in.

## Key Assumptions to Validate

- [ ] A deterministic gate can express the policies Jenny actually wants without becoming a rules engine project (test: express the v1 policy as a single JSON doc + ~10 predicates).
- [ ] jev-1.13 intent/risk classification is good enough to route to review vs auto-act at stated thresholds (test: run 20 sample tasks, check escalation decisions feel right).
- [ ] Outbound-HTTP-as-tool is sufficient for v1 executions (test: express one real automation, e.g. a lead-intake → CRM step, using only fetch calls).
- [ ] D1 on the steady-orbit account handles the write pattern (test: 100-row append burst under 5s).

## MVP Scope

- `/api/jev/*` route family: tasks CRUD-lite (create/get/list), gate decision endpoint, approval endpoints, pause endpoint, status/summary endpoint.
- D1 schema: tasks, actions, events (append-only audit), approvals, learnings.
- Policy doc in KV (versioned; gate records the policy version it enforced).
- Dashboard at `/jev/` served from KV: task list, pending approvals with approve/reject, costs, terminal states.
- SKILL.md template: how any automation/skill embeds the flow (create task → poll/attach → handle review → read terminal outcome).

## Not Doing (and Why)

- **Tenant isolation/multi-tenant** — single-owner infra today; schema keeps a `tenant` column so it's additive later.
- **Improve-loop auto-activation** — learnings are stored + surfaced; activation stays a manual human step in v1 (the diagram itself says learnings cannot activate themselves).
- **Provider-side cancel/in-flight reconciliation integrations** — reconcile endpoint exists, per-provider adapters come later.
- **Email/Slack approval notifications** — dashboard is the queue in v1.

## Open Questions

- Who authenticates to `/api/jev/*` and how (proposal: `JEV_API_KEY` in the Secrets Store, Bearer; dashboard approves via same key held by Jenny's session — open: key custody).
- Should approval actions also write a Resend notification (send-only key already on the worker)? Default no for v1.

## Generation log (for review)

| # | Variation | Lens | P | S | D | T | Σ |
|---|---|---|---|---|---|---|---|
| V1 | Thin controller: state machine + gate + review; HTTP-fetch tools | Simplification | 5 | 4 | 3 | 5 | 17 |
| V2 | Full diagram port: everything incl. tenants, improve-loop, adapters | Constraint removal | 4 | 1 | 4 | 1 | 10 |
| V3 | Gate-as-library: skill embeds control flow locally, no central service | Inversion | 3 | 3 | 2 | 4 | 12 |
| V4 | n8n-first orchestration template (workflows are the caller) | Audience shift | 4 | 4 | 3 | 4 | 15 |
| V5 | Extend the outcomes ledger: jev as a verdict type on the existing append-only pattern | Combination | 4 | 5 | 4 | 4 | 17 |
| V6 | LLM-scored policy gate (jev probabilities as gate input) | Inversion | 2 | 3 | 1 | 3 | 9 |
| V7 | Sauna-session-first: controller drives Sauna skills via task queue | Audience shift | 3 | 3 | 3 | 4 | 13 |

- Dropped below threshold: V2 (untestable, 1 on switching cost), V6 (violates the diagram's own deterministic-gate invariant — LLMs hold no authorization).
- Finalists: V1 (17), V5 (17) — merged, since V5 is a conventions layer over V1's shape, not a rival. V4 folded as an API-compatibility constraint (plain JSON, no webhooks required, poll-friendly).
- Stress-test critique of winner: "a thin controller that still trusts the caller to define its own tools is just an audit log with ambitions." Counter: the gate validates the task's declared tools against the versioned policy doc before any dispatch; callers cannot invent scopes at call time.
- Un-testable bet: that Jenny will actually route real automations through it rather than keeping ad-hoc flows. Mitigation: ship one real automation on it (the Inbound Lead Workflow v1 the diagram references) as the proof.
