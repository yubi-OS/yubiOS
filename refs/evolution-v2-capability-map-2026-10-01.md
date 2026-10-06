# Evolution v2 — capability map, reassessed (2026-10-01)

Sources consulted: defapi-jev SKILL.md + references/api.md; the three papers (learned-latent-curves, is-this-x, curved-corpus-unified-v2) via 3 parallel digests; knowledge-corpus-mint SKILL.md; tools/point-map README + live worker endpoint probe; CF account surface live-probe.

## What jev-1.13 can cover that evolution v1 doesn't use

v1 uses jev only implicitly (sweep prose). The decision model's full surface:

| Capability | Type | Evolution use |
|---|---|---|
| Approval forecast | noul "will the operator approve this?" | Pre-screen proposals before they hit the queue; low forecast → don't propose (reduce approval spam) |
| Priority ranking | score 0-9 | Rank proposed directives per cycle; top-N proposed, rest noted |
| Kind routing | choice | Which whitelist kind a finding is (validate sweep classifications) |
| Confidence routing | confidence field | score/choice answers with low confidence → forced needs_approval regardless of kind |
| Session grouping | session_id | One session_id per fire → full per-fire decision audit lineage |
| Cost tracking | consumed | Already in ledger; extend to every jev call in the loop |

## Paper-derived loop primitives (3 digests, synthesized)

**Gating / invariants (machine-checked, assert in code):**
1. **Single-action atom + Δ≥0** — every executed directive carries d_pre/d_post/Δ against a defined ideal state; a stay option always exists; negative Δ = bug alarm, not a regression to log. (llc Lemma 1; curved-corpus)
2. **Cumulative monotonicity** — per-cycle increments may rise/fall; only the cumulative sum must be monotone. Don't misread an uptick as failure. (Corollary 1)
3. **Identity/measurement boundary** — identities (Δ≥0, telescoping, monotonicity) are asserted in tests; only measurements face the human gate. Maps 1:1 onto the existing fail-closed design. (curved-corpus)
4. **PC1+PC2 ≥ 0.40 fit-quality gate** — any fit used for scoring must clear the concentration gate or it isn't used. (llc Sec 2.3)

**Calibration / honesty (the loop's claims discipline):**
5. **Null-standardized improvement claims** — no effect reported raw; z against a matched null (for the quality ledger: label-permutation / null-delivery ensemble for separation). (is-this-x)
6. **Exclusion-only verdicts at |z|>3** — the gate emits excluded/not-excluded/not-tested, never narratives. (is-this-x Definition)
7. **Round-trip validation + standard candle** — periodically plant a known-outcome directive; the loop must detect it. Measures detection power, catches a loop that approves nothing or everything. (is-this-x Procedure 1)
8. **Selection-null discipline** — if the loop tunes its own prompts/thresholds on real outcomes, the same tuning must run on nulls; report the ratio. (curved-corpus v2 addendum)
9. **Anti-caustic guard** — exact 1.0000 passes are red flags; report rank/condition beside any perfect score. (curved-corpus)
10. **Fixpoint termination** — stop proposing when peak Δ < epsilon; saturated items legitimately contribute 0. (llc)
11. **dBc level scale** — effects reported as 20·log10(|Δ|/σ_null) for cross-cycle comparability. (curved-corpus sonometer)
12. **Atomicity diagnostic** — cheap check that the measurement basis carries information before trusting derived scores. (curved-corpus G1)
13. **Dynamics audit** — the append-only event log already supports f_back/absorbing-state/flip-rate analysis of the loop's own history. (is-this-x Φ_dyn)

**Corpus audit lens (what to propose next):**
14. **Sparse-cell prioritization** — coverage vector per audited artifact, sphere placement, sparse cells drive the next proposals. (llc App B)

## Worker endpoints available today (live-probed)

`/api/decide` (jev), `/api/maps` (540 stored maps), `/api/vector/search`, `/api/embed` (768-D bge-base), `/api/fits`, `/api/chat`, `/api/tts`, `/api/stt`, `/api/contact`, `/map/` + `/api/map/preview` (point-map wayfinder: frozen frames, identity keys, rule_hash, named-neighbour ledger, Lean-checked bounds), `/jev/`, `/AGENT.md`, `/llms.txt`.

CF surface: Cron Triggers (**currently EMPTY — the */5 automation cron was wiped by the 11:07Z deploy; restore in deploy phase**), Queues (0, available), Durable Objects (0, available — skip, D1+CAS suffices), Workflows (0, available), Vectorize (sos-embeddings live), AI (321 models), Secrets Store (7 secrets bound incl. RESEND/GITHUB/DAYTONA), R2 (**NOT enabled** — dashboard action needed if wanted; v1 skips), Browser Rendering (unverified).

## knowledge-corpus-mint → evolution outcome kind

The loop's learn layer can detect recurring manual research on a topic (repeated digs on the same domain in sweep/automation history) and propose a `record_learning` pointing at a future corpus mint. The mint itself stays a Sauna-session deliverable (subagent authoring can't run on the worker), but the loop can propose and track it as a directive routed to a session. Its Phase 0 endpoint-preflight gate becomes a model for every evolution cycle: verify decision + search endpoints before measuring.

## point-map → memory layer discipline

The memory layer (Vectorize) adopts point-map's frozen-frame rules instead of naive embedding dedupe: identity keys (ordinal + hash), rule_hash stamped on every embedding batch, `changed_input_names` vs `quantization_silent_names` distinction (changed learning vs unchanged coordinates), named-neighbour ledger for recall at propose-time ("this was tried on <date>, outcome X"), and the matched-null placement discipline for any geometric claim.

## Reassessed module map

| Module | CF endpoint(s) | Responsibility |
|---|---|---|
| A. Trigger + machine-cycle | Cron Triggers | Hourly worker heartbeat: measure (task outcomes, ledger separation, automation failure rates, policy drift) → propose (jev priority-ranked, approval-forecast pre-screened) → gate → notify. Restores the lost */5 automation cron. |
| B. Atom ledger + calibration | D1, jev full surface | Δ ledger per directive (d_pre/d_post/Δ, stay option), cumulative monotonicity assertion, null-SD + dBc reporting on separation, standard-candle plant + detection measurement, PC1+PC2 gate, anti-caustic guard, fixpoint stop, dynamics audit over events. |
| C. Memory + recall | Vectorize + /api/embed + point-map discipline | `jev-evolution` index (768-D bge-base-en-v1.5), identity keys + rule_hash, changed-vs-silent names, named-neighbour recall injected into every propose. |
| D. Execution + notify | Queues + Resend | Durable directive execution (claim → execute → verify → retry/backoff → terminal). Hourly digest email + immediate pending-approval email. Console v3: trend, recall view, calibration curve. |
| E. Preflight + verify | existing endpoints, Daytona (optional) | Phase 0 preflight gate on every cycle; post-execute verify legs. |
| F. jev quality assessment (Jenny addition) | jev full surface | jev quality scoring is a first-class loop component, not just the ledger: predicted quality at PROPOSE time (every candidate proposal scored before enqueue), at VERIFY time (every execution result scored against its intent), and on sweep-report quality. All predictions land in the ledger for the calibration loop; low predicted-quality proposals are demoted to `note` instead of queued. |

Lane plan: 4 lanes (A+B invariants, C memory, D execution+notify, E calibration instruments) — actually B and E overlap; final lane split at SPEC. Advisor/integrator + deploy + route-by-route live verify. No new secrets. Cron restore + hourly schedule in the deploy.

## Explicit non-goals (v1)

- Worker-side self-modification (worker_change directives still execute via Sauna sessions).
- R2 (not enabled; D1+KV suffice).
- Durable Objects (CAS on D1 is sufficient serialization).
- Auto-approval of anything (whitelist unchanged).
