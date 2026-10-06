# Capability Map: Jev orchestration skill (jev-orchestrator)

Status: APPROVED 2026-09-30 (Jenny). Endpoints under /api/jev/* on the steady-orbit worker, extension of /api/decide. State in D1. Human review queue = worker-hosted dashboard.

| Module id | Responsibility | Depends on |
|---|---|---|
| state-store | D1 schema: live tasks/actions/outcomes, append-only audit log, learnings; tenant isolation | — |
| policy-gate | Deterministic fail-closed decision (allowed / needs-approval / blocked); pause enforcement; validates approval bindings (actor, target, payload, limits, expiry, policy version) | state-store |
| decide-engine | Understand (02) + Decide (03): jev-1.13 via /api/decide; strategic LLMs advisory only, never authorization | state-store |
| ingest | Source validation, dedupe, untrusted-content separation (01) | state-store |
| execute | Dispatch with stable action IDs, pause re-check at dispatch, scoped tool credentials (05) | policy-gate, state-store |
| verify | Independent result check → success / confirmed failure / unknown (06) | state-store |
| loop-control | Continue/Complete, safe-retry-within-limits, reconcile-before-repeat, six distinct terminal outcomes (07) | verify, decide-engine, state-store |
| review | Approval queue + approve/reject/guide endpoints; approval expiry; returns through the gate | policy-gate, state-store |
| dashboard | Worker-hosted page: results, pending reviews, costs, status, terminal outcomes | review, state-store |
| improve-loop | Learnings review/test/version/activate; invalidates affected approvals; cannot self-activate | state-store, policy-gate |

Build order: state-store → policy-gate → ingest + decide-engine (parallel) → execute → verify → loop-control → review → dashboard → improve-loop.

Notes:
- PAUSE is folded into policy-gate (enforcement) + execute (dispatch re-check); its scope lives in state-store.
- Six terminal states (succeeded, blocked, rejected, expired, failed, cancelled) are an enum enforced in code: blocked != succeeded.
- Source of truth: Jev_Architecture_v2.svg / .mmd (session/attachments) + operating notes.
