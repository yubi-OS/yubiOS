# Jev Automations: worker-hosted Llama automations on the /jev/ console [SOLO]

Date: 2026-09-30
Source: ideate-solo (no dialogue). Directive: Jenny, 2026-09-30 ~23:48 PT — "the n8n side will be retargeted to deploy the automations using a cf hosted llama model appropriate for the task, we may still use dayton and searxng directly but in order to keep cost low we are switching to an internal tooling centered around the /jev/ dashboard deploying and accepting prompts directly. work this out how we worked out the SPEC.md and skill parallel subagents etc"
Scope class: systemic
Variations generated: 7
Finalist: V5 "Jev Automations" (registry + Llama runtime + prompt intake + cron scheduler, lead machine as first suite)

## Problem Statement

How might we move the lead machine's n8n orchestration onto the steady-orbit worker as Llama-powered automations — deployed and prompt-driven from the /jev/ dashboard — at near-zero marginal cost, while keeping the deterministic gate, approval flow, and audit intact?

## Recommended Direction

**"Jev Automations"**: a new layer on the existing orchestrator.

1. **Automation registry** — an automation is a versioned template in D1/KV: name, stage list, per-stage prompt + model, allowed tools, trigger (manual | cron), and a gate profile. Deploy = write a new version + activate; every dispatch stamps the automation version, same doctrine as the policy version.
2. **Llama runtime** (`env.AI`, already bound) — model routed per stage: `llama-3.1-8b-instruct-fp8` for cheap classification/extraction, `llama-3.3-70b-instruct-fp8-fast` for drafting/complex generation, `llama-guard-3-8b` as an outbound-content safety pass before any send (verdict recorded; advisory to the gate, never authorizing). Neuron cost accounted onto the task.
3. **Prompt intake** — the dashboard gets a prompt console: type a prompt, it becomes a task; Understand/Decide run from the prompt (Llama proposes actions as JSON; the gate validates them exactly as caller-supplied ones today — untrusted input separation holds).
4. **Scheduler** — worker cron triggers create tasks for scheduled automations in batches sized to the 30s CPU limit.
5. **Lead machine as the first suite** — phase 1 research as deterministic worker code (the tested audit lib ports as-is) with Google Places + direct searXNG calls for supplementary search; phase 2 outreach drafts via template-or-Llama → gate → `resend.send` approval; phase 3 reply webhook on the worker. n8n keeps only the searxng-proxy.
6. **jev-1.13 stays** as the structured decision layer (calibrated, $0.00003/req) unless overruled — Llama handles generation and safety, not authorization.

## Key Assumptions to Validate

- [ ] The audit lib runs within Workers CPU limits when chunked (test: one Places batch = 20 sites, 4 fetches each).
- [ ] Llama-3.1-8b JSON-mode action proposals are reliable enough to gate (test: 20 prompts, malformed-output rate).
- [ ] llama-guard verdicts align with the machine's refuse-to-claim guards (test on the 8 audit fixtures).
- [ ] "dayton" (Daytona?) role — pending Jenny's clarification; if it's a sandbox for JS-rendered fetches it slots into lead-research as a tool.

## MVP Scope

Registry + Llama runtime + prompt console + one automation (lead-research on one niche/location batch) end-to-end through gate → approval → verify.

## Not Doing (and Why)

- Replacing the deterministic gate with LLM judgment — violates the core invariant.
- Multi-tenant automations — single-owner, same as jev v1.
- Instantly integration — dropped per Jenny (Resend is the send leg).
- Long-running research in a single request — chunked via cron batches instead.

## Open Questions

- What is "dayton"?
- Keep DefAPI jev-1.13 for decisions, or go all-Llama?
- Model routing: 3-tier (8b/70b/guard) vs single 70b?

## Generation log (for review)

| # | Variation | Lens | P | S | D | T | Σ |
|---|---|---|---|---|---|---|---|
| V1 | Prompt console only (no registry, no scheduler) | Simplification | 4 | 5 | 2 | 5 | 16 |
| V2 | Full port of all phases + registry + scheduler + console v2 | Constraint removal | 5 | 3 | 4 | 3 | 15 |
| V3 | Automations as repo code; dashboard only triggers | Inversion | 3 | 3 | 2 | 4 | 12 |
| V4 | n8n stays builder, worker executes | Audience shift | 2 | 3 | 2 | 3 | 10 |
| V5 | Registry + Llama runtime (model-per-task) + prompt intake + cron; lead machine first suite; jev-1.13 retained | Combination | 5 | 4 | 4 | 4 | 17 |
| V6 | LLM-scored policy gate | Inversion | 2 | 3 | 1 | 3 | 9 |
| V7 | External LLM APIs (OpenAI etc.) | Audience shift | 3 | 4 | 2 | 3 | 12 |

Dropped below threshold: V6 (violates deterministic-gate invariant), V4 (contradicts the directive). Finalist V5; V1 folded in as the console's prompt intake; V2 folded in as the lead suite. Stress-test critique: "an automation registry that stores prompts in a dashboard is config drift with extra steps." Counter: versioned templates + dispatch-stamped automation versions + the append-only audit make every prompt change reviewable — same discipline the policy doc already has. Un-testable bet: that Workers AI neuron pricing stays negligible at lead-machine volume (validate with the first 100-task run).
