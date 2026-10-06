# Evolution v2 — Final Evolution Process [SOLO]

Date: 2026-10-01
Source: ideate-solo (no dialogue)
Scope class: systemic
Variations generated: 7
Finalist: V6+V7 fusion — "Calibrated Atom Loop"

## Problem Statement

How might the evolution loop's machine-side run become self-sustaining (worker-cron-driven, hourly), quality-assessed by jev at every stage, and honest about its own claims (nulls, candles, invariants) — using the full Cloudflare endpoint suite — without inflating blast radius or inventing new trust anchors?

## Recommended Direction

Fuse the approved module map with two papers-grade disciplines as the loop's spine:

1. **Single-action atom cadence (V7).** Each hourly machine cycle proposes AT MOST ONE gated action. Every executed directive carries a measured delta (d_pre/d_post/Δ) against a named ideal-state metric; a "stay" option always exists; Δ≥0 is asserted in code (identity, not measurement); the cumulative ledger is monotone by construction. Blast radius per hour is one atom.
2. **Standard-candle governance (V6).** The loop ships with its own calibration harness: the cron periodically plants a known-outcome candle directive; the loop must detect and score it; detection power is measured and reported beside every separation number in dBc. A loop that approves nothing or everything fails its own candle test.

These sit inside the approved capability map (cron cycle, jev full surface, Vectorize memory with wayfinder identity-key discipline, durable execution, Resend notify) and inherit the existing fail-closed whitelist unchanged. Sauna sessions remain the hands for memory_edit/repo_push/worker_change; the worker auto-executes only record_learning/note plus its own measured atoms.

## Key Assumptions to Validate

- [ ] The worker can measure deltas for its own atoms (jev task outcomes are queryable from D1) — test: one live atom with a recorded Δ.
- [ ] Approval-forecast pre-screening reduces queue noise without suppressing good proposals — test: forecast vs actual approval correlation after n≥10 real approvals.
- [ ] Vectorize recall changes propose behavior (dedupes repeats) — test: re-propose a known learning, expect recall hit.

## MVP Scope

Cron machine-cycle (hourly) + jev quality assessment (propose/verify scoring) + atom ledger + candle planter + memory recall + digest email. Queues via thin adapter (D1-backed default; CF Queues if the queue exists at deploy). Console v3 views.

## Not Doing (and Why)

- Worker-side repo pushes — autonomy boundary; Sauna stays the hands for repo_touching kinds.
- Durable Objects — CAS on D1 suffices; adds a class without a need.
- R2 — not enabled on the account; D1+KV carry the state.
- Approval via email link — new auth surface; console approval is proven.

## Open Questions

- Which ideal-state metric anchors the atom ledger first (jev task success rate is the default).
- Candle cadence (daily vs weekly) — start weekly, hourly cycles stay cheap.

## Generation log

| # | Name | Lens | P | S | D | T | Σ |
|---|---|---|---|---|---|---|---|
| V1 | Inverted control (worker executes repo pushes) | Inversion | 3 | 1 | 3 | 3 | 10 |
| V2 | Fully autonomous loop w/ email-link approval | Constraint removal | 4 | 2 | 4 | 2 | 12 |
| V3 | Reader-first digest (inbox-optimized) | Audience shift | 4 | 5 | 2 | 5 | 16 |
| V4 | Wayfinder memory (reuse point-map discipline) | Combination | 3 | 4 | 4 | 4 | 15 |
| V5 | Thin calibrated core (cron+jev+ledger+digest only) | Simplification | 3 | 5 | 2 | 5 | 15 |
| V6 | Standard-candle governance | Combination | 5 | 4 | 5 | 4 | 18 |
| V7 | Single-action atom cadence | Simplification | 5 | 4 | 4 | 5 | 18 |

Dropped below threshold: V1 (switching cost 1: moves execution across the autonomy boundary she explicitly reserved), V2 (un-testable bet: email-link security).

Finalists: V6, V7, V3. Stress-test of winner (V6+V7 fusion): strongest critique — atom cadence may starve multi-step work that legitimately needs several changes in one cycle (second-order: multi-step changes become explicit multi-atom sequences, which is an audit-trail improvement, not a loss; the candle may be gamed by the loop detecting its own plant marker — mitigation: candle payload sealed by the integrator, marker hashed not plaintext). Untestable bet: that hourly jev scoring cost stays negligible (verified: ~$0.00003/req, ≤6 req/cycle ≈ $0.0002/hr ≈ $1.75/yr).
