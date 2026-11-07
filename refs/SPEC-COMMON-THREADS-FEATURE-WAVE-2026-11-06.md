# SPEC: Common-Threads Adjacent-Repo Feature Wave (Wave 7, 15 New Endpoints Across 5 Pillars)

**Date:** 2026-11-06  
**Target Surface:** Cloudflare Worker `steady-orbit` (`steadyorbitsystems.com` / `steady-orbit.systems-a.workers.dev`, 80-part bundle, Policy `v27`, baseline etag `7f6843fcb4274907699c4072020272594f1f21bcd456967828a52f86deebc44e`)  
**Status:** Active Specification & Execution Plan

---

## 1. Capability Gap & Deliverable Alignment Matrix (What Adjacent Repos Add Beyond Hardening)

While Waves 0 through 6 hardened our gates, verifiers, spans, covariates, and scorers, the adjacent repositories across `Anima Labs / socketteer / generative.ink`, `google-research`, `JoshuaSP`, and `LARK-AI-Lab` contain **15 high-leverage functional capabilities** that fill concrete gaps in our five active deliverables:

| # | Adjacent Repo & Mechanism | Gap in Current `steady-orbit` Stack | Deliverable Accelerated | New `steady-orbit` Endpoint & Funnel Target |
|---|---|---|---|---|
| 1 | **`google-research/flowracle` (`2026-11-06`)** Expanding-window quantile ensemble stacking | Our 3-path forecaster (`Cascade`, `ETS`, `Clairic`) uses fixed equal/majority weighting rather than learning non-negative expanding-window weights $(w_{\text{cas}}, w_{\text{ets}}, w_{\text{cl}})$ per domain minimizing pinball/CRPS loss. | **`/forecasts/` Workstation & `$200` Slip Tracker** (higher out-of-fold accuracy and sharper Kelly sizing) | `POST /api/jev/forecaster/ensemble-cv` (`forecaster.ensemble_cv`) |
| 2 | **`google-research/weatherbenchX` (`2026-11-05`)** CRPS, sharpness & Murphy Brier decomposition | `/forecasts/` reports raw Brier and win %, but does not decompose Brier into **Reliability (calibration error)** + **Resolution (signal separation)** + **Uncertainty**, or compute Continuous Ranked Probability Score (CRPS) across quantile fans. | **`/forecasts/` Stage 1 Scoreboard & Stage 3 Calibration Map** | `GET /api/jev/forecaster/diagnostics/murphy` (`forecaster.murphy_decomposition`) |
| 3 | **`google-research/flowracle` & `epi_forecasts` (`2026-11-05/06`)** Spatio-temporal causal lead-lag scanner | Strike-ladder arbitrage (`Stage 4`) checks contemporaneous price inversion + Kalman $\beta_t$, but misses **directional lead-lag ($\Delta t$ bars)** where a leader market moves before a follower contract. | **`/forecasts/` Stage 4 Arbitrage & Bet Desk** | `POST /api/jev/forecaster/causal-lead-lag` (`forecaster.causal_lead_lag`) |
| 4 | **`JoshuaSP/quadrat-model-eval`** Two-step blind judge with mechanical verbatim quote verification | Single-pass LLM grading sees the prompt and response together (prone to rationalization) and can cite fabricated evidence quotes. | **Console QA, Outbound Email/Report Verification & `refs-refresh-sweep`** | `POST /api/jev/verify/blind-judge` (`verify.blind_judge`) |
| 5 | **`google-research/rubric_em` (`2026-11-06`, `arXiv:2605.10899`)** Multi-criterion rubric decomposition | Open-ended deliverables (SMB Revenue Blind Spot roadmaps on `/results/`, consulting briefs, research syntheses) lack binary unit tests and need structured, weighted rubric decomposition with span-grounded pass/fail receipts. | **Steady Orbit `/audit/` & `/results/` RBS Roadmap + Research Deliverables** | `POST /api/jev/verify/rubric-grade` (`verify.rubric_grade`) |
| 6 | **`JoshuaSP/open-jev`** `FieldCanvas` multi-question schema batcher | Scoring $M$ items across $Q$ heterogeneous typed questions (`boolean`, `choice`, `ordinal_score`) sequentially incurs $M$ round-trips; packing them onto a single structured readout canvas cuts latency ~4.8x and cost ~79%. | **Lead Machine Triage, `knowledge-corpus-mint` & `cloudflare-reports/`** | `POST /api/jev/decide/canvas-batch` (`decide.canvas_batch`) |
| 7 | **`google-research/CLASHarness` (`arXiv:2610.19128`)** Verbal-vs-environment conflict arbiter | Agents and subagents exhibit the *Competence-Resolution Gap*: trusting verbal status claims ("deployed", "merged", "0 errors") when ground-truth state ($v^\star$ in D1/KV/WAE/manifest) disagrees. | **Layered Ontology Engine (`jev-ontology.js`), Cult/Follower Verification & Ops Console** | `POST /api/jev/ontology/conflict-audit` (`ontology.conflict_audit`) |
| 8 | **`google-research/r_u_sure` (`arXiv:2303.00732`)** Utility Decision Diagrams & localized uncertainty spans | When a prompt or draft has one ambiguous parameter, blocking the whole turn is coarse; localizing uncertainty to exact character spans `[start, end]` where candidate intents diverge pinpoints the minimal question to ask. | **Layered Ontology Engine (`jev-ontology.js`) & Outbound Draft Review** | `POST /api/jev/ontology/uncertainty-spans` (`ontology.uncertainty_spans`) |
| 9 | **`JoshuaSP/epistemic-goggles` (`arXiv:2607.01690`)** Provenance-framed knowledge compiler & locality bank | Ingesting external research (`yubi-OS/knowledge`, `searxng.dig`, market news) needs explicit epistemic framing (`observed_fact`, `computed_theorem`, `external_self_reported`, `contested_claim`, `speculative_projection`) plus a locality check ensuring standing invariants stay uncorrupted. | **`yubi-OS/knowledge` Corpus Mint/Recall & Ops Console Self-Knowledge Boundary** | `POST /api/jev/ontology/epistemic-frame` (`ontology.epistemic_frame`) |
| 10 | **`Anima Labs/ledger-dashboard` (`cachescope`)** Prompt-cache verdict & cent-exact spend attribution | `/api/jev/harness/runs` tracks total USD, but lacks per-turn `cachescope` prefix classification (`HIT`, `first-write`, `rewrite:component_mutated:<comp>`, `rewrite:expired`) and per-component byte/cost attribution. | **Ops Console (`/jev/`) Harness Studio & Cost/Token Efficiency** | `GET /api/jev/harness/cachescope` (`harness.cachescope`) |
| 11 | **`LARK-AI-Lab/Trainee-to-Trainer`** Failure-driven procedural scenario generator | After a harness or forecaster run fails a gate, next-round test cases are hand-written instead of procedurally synthesized from the failure breakdown within a bounded, solvability-verified schema. | **Adversarial Console QA, Falsification Corpora & Harness Evolution** | `POST /api/jev/harness/curriculum-propose` (`harness.curriculum_propose`) |
| 12 | **`LARK-AI-Lab/Mosaic` (`arXiv:2610.22174`)** Marginal Information Gain ($\Delta \text{IG}_t$) step credit assignment | Multi-node DAG runs (`jev-n8n-dag.js`) and 5-stage Refinery runs record terminal pass/fail, but don't quantify how much marginal quality lift each individual node/stage contributed. | **DAG Pipelines (`/jev/` Command Studio) & 5-Stage Data Refinery** | `POST /api/jev/n8n/credit-assignment` (`n8n.credit_assignment`) |
| 13 | **`Anima Labs/chronicle` & `socketteer/loom`** Copy-on-write session branching, time-travel & branch diff | Console chat sessions (`/api/jev/console/sessions`) are linear; operators cannot fork a session at turn $k$ into a copy-on-write branch to test an alternate prompt/harness and diff the two branches. | **Ops Console (`/jev/`) Multi-Turn Chat & Multi-Harness Comparison** | `POST /api/jev/console/sessions/fork` (`agent.session_fork`) & `POST /api/jev/console/sessions/diff` (`agent.session_diff`) |
| 14 | **`Anima Labs/mcpl`, `anima-docs` & `floor-control` (`FLOOR-RFC-001`)** Self-set wake gates & turn-taking floor leases | MCP/console agents lack declarative echo-suppressed wake gates (never waking on their own `actor` edits) and medium-agnostic `FLOOR-RFC-001` turn-taking leases with receipts and pluggable arbitration (`fifo`, `priority`, `round_robin`). | **152->167-Tool `/mcp` Gateway & Multi-Agent Cult/Follower Coordination** | `GET\|POST /api/jev/console/wake-gates` (`agent.wake_gates`) & `POST /api/jev/console/floor` (`agent.floor_control`) |
| 15 | **`generative.ink` *Quantifying Curation* & `loom` Block-Multiverse** Curation bits ($\log_2 M, \rho, \lambda$) & bits-per-kept-edit sonometer | Our Wayfinder and corpus unit rounds track realized `level_dbc`, but lacked a dedicated endpoint computing Janus's curation bits ($\log_2(p_{\text{curated}}/p_{\text{base}})$, bits/token $\rho$, tokens/bit $\lambda$, $m$-of-$n$ satisficing $\log_2(n/m)$, and bits-per-kept-edit by proposal source). | **Wayfinder Unit Rounds (`jev-corpus-unit-round`) & Quality Ledger** | `POST /api/jev/corpus/curation-bits` (`corpus.curation_bits`) |

---

## 2. Disjoint Parallel Build Lanes (Lanes F1 - F5)

Every lane owns a strictly disjoint set of existing worker modules (preserving the 80-part bundle manifest with zero cross-lane file overlap):

| Lane | Owned Modules | Endpoints & Exports Added | Selftest Gate Expansion |
|---|---|---|---|
| **Lane F1 (`Forecasting & Ensemble`)** | `jev-refinery.js` | `POST /api/jev/forecaster/ensemble-cv` (`runExpandingWindowEnsembleCv`), `GET /api/jev/forecaster/diagnostics/murphy` (`computeMurphyBrierDecomposition`, `computeQuantileCrps`), `POST /api/jev/forecaster/causal-lead-lag` (`scanCausalLeadLag`) | `refinerySelfTest()` expands from 6 to **9 gates (`G1..G9`)** |
| **Lane F2 (`Verification, Rubric & Canvas`)** | `jev-verify.js`, `jev-decide.js`, `routes-jev.js` | `POST /api/jev/verify/blind-judge` (`runTwoStepBlindVerbatimJudge`), `POST /api/jev/verify/rubric-grade` (`runRubricEmDecomposition`), `POST /api/jev/decide/canvas-batch` (`runFieldCanvasBatch`), dispatched from `routes-jev.js` | `runJevSelftest()` verifies `blind-judge`, `rubric-grade`, and `canvas-batch` |
| **Lane F3 (`Ontology Conflict, Uncertainty & Epistemic Frame`)** | `jev-ontology.js` | `POST /api/jev/ontology/conflict-audit` (`auditVerbalVsStateConflicts`), `POST /api/jev/ontology/uncertainty-spans` (`computeUncertaintyDecisionDiagram`), `POST /api/jev/ontology/epistemic-frame` (`compileEpistemicProvenanceFrame`) | `ontologySelfTest()` expands from 7 to **10 gates (`G1..G10`)** |
| **Lane F4 (`Harness Cachescope, Curriculum & DAG Credit`)** | `jev-harness2.js`, `jev-n8n-dag.js` | `GET /api/jev/harness/cachescope` (`analyzeHarnessCachescope`), `POST /api/jev/harness/curriculum-propose` (`proposeFailureCurriculumScenario`), `POST /api/jev/n8n/credit-assignment` (`computeDagMarginalIgCredit`) | `harness2SelfTest()` expands to **16 gates (`G1..G16`)**; `n8nDagSelfTest()` expands to **21 gates** |
| **Lane F5 (`Branching Sessions, Wake Gates, Floor Control, Curation Bits & 285-Target Funnel`)** | `jev-console-funnel.js`, `jev-agentic-console.js`, `jev-corpus-routes.js` | `POST /api/jev/console/sessions/fork`, `POST /api/jev/console/sessions/diff`, `GET\|POST /api/jev/console/wake-gates`, `POST /api/jev/console/floor`, `POST /api/jev/corpus/curation-bits`, plus registering all 15 new targets in `FUNNEL_CATALOG` (`270 -> 285` targets; `/mcp` `152 -> 167` tools) | `consoleFunnelSelfTest()` expands to **10 gates (`F1..F10`)** |

---

## 3. Detailed Contracts per Lane

### 3.1 Lane F1 (`jev-refinery.js`)
1. **`POST /api/jev/forecaster/ensemble-cv` (`runExpandingWindowEnsembleCv(marketsOrSeries, opts)`):**
   - Accepts `{ records?: Array<{ cascade: number, ets: number, clairic: number, outcome: 0|1, domain?: string, ts?: string }>, minTrain?: number }` (defaults to resolved markets from `forecaster:dashboard-v1` when `records` is omitted).
   - Evaluates an expanding-window Simplex grid over $w = (w_{\text{cas}}, w_{\text{ets}}, w_{\text{cl}})$ ($w_i \ge 0, \sum w_i = 1$, step `0.05`) minimizing proper Brier / Pinball loss on past folds and scoring out-of-fold predictions on the next window.
   - Returns `{ ok: true, optimal_weights: { cascade, ets, clairic }, oof_brier_ensemble, oof_brier_equal, oof_brier_lift, by_domain: {...}, n_evaluated }`.
2. **`GET /api/jev/forecaster/diagnostics/murphy` (`computeMurphyBrierDecomposition(records, opts)` & `computeQuantileCrps(quantiles, realized)`):**
   - Decomposes Brier score $BS = \frac{1}{N}\sum (p_i - y_i)^2$ over $B = 10$ probability bins into Murphy's exact identity:
     $$BS = \text{Reliability} - \text{Resolution} + \text{Uncertainty}, \quad \text{Uncertainty} = \bar{y}(1 - \bar{y})$$
   - Also computes Continuous Ranked Probability Score ($\text{CRPS}$) over `{ q10, q50, q90 }` fans and sharpness ($\text{mean}(q_{90} - q_{10})$).
   - Returns `{ ok: true, overall: { n, brier, reliability, resolution, uncertainty, skill_score, crps, mean_sharpness, bins[] }, by_domain, by_exchange }`.
3. **`POST /api/jev/forecaster/causal-lead-lag` (`scanCausalLeadLag(seriesA, seriesB, { maxLag = 6 })`):**
   - Computes first-difference lagged Pearson cross-correlations $\rho(\Delta A_t, \Delta B_{t + \tau})$ for $\tau \in [-\text{maxLag}, +\text{maxLag}]$, optimal lead lag $\tau^*$, directional impulse gain $\beta_{\text{lead}}$, and Granger-style variance reduction ratio ($F$-stat proxy).
   - Returns `{ ok: true, optimal_lag: tauStar, max_corr, leader: tauStar > 0 ? "seriesA" : tauStar < 0 ? "seriesB" : "synchronous", impulse_beta, variance_reduction_r2, lag_profile: [...] }`.

### 3.2 Lane F2 (`jev-verify.js`, `jev-decide.js`, `routes-jev.js`)
1. **`POST /api/jev/verify/blind-judge` (`runTwoStepBlindVerbatimJudge(input, env)` in `jev-verify.js`):**
   - Accepts `{ source_prompt: string, untrusted_span?: string, candidate_output: string, required_constraints?: string[] }`.
   - **Step 1 (Blind Demand Extraction):** Extracts the canonical list of required constraints and any untrusted-span injected demand from `source_prompt` / `untrusted_span` *without inspecting `candidate_output`*.
   - **Step 2 (Mechanical Verbatim-Quote Grading):** Evaluates `candidate_output` against each extracted demand, requiring a verbatim substring `quote` from `candidate_output` verified mechanically (`normalizeSpanSource(candidate_output).includes(normalizeSpanSource(quote))`), and classifies indirect-injection behavior into JoshuaSP's 4 outcomes (`"complied" | "identified" | "relayed" | "ignored"`).
   - Returns `{ ok: true, step1_demands: [...], step2_verdicts: [{ constraint, met, verbatim_quote, quote_verified_in_output }], behavioral_outcome, all_met, all_quotes_verified }`.
2. **`POST /api/jev/verify/rubric-grade` (`runRubricEmDecomposition(input)` in `jev-verify.js`):**
   - Accepts `{ deliverable_type?: "rbs_roadmap" | "outreach_email" | "research_report" | "custom", text: string, criteria?: Array<{ id, weight, must_include_any?, min_numbers?, forbid_phrases? }> }`.
   - Supplies built-in domain rubrics for Steady Orbit's deliverables (`rbs_roadmap`, `outreach_email`, `research_report`) when `criteria` is omitted, evaluates each criterion with `textHas` + span extraction, and returns `{ ok: true, deliverable_type, weighted_score, criteria_results: [...], missing_remediations: [...] }`.
3. **`POST /api/jev/decide/canvas-batch` (`runFieldCanvasBatch(input, env)` in `jev-decide.js`):**
   - Accepts `{ items: Array<{ id: string, text: string }>, schema: Array<{ field: string, type: "boolean" | "choice" | "ordinal_score", options?: string[], threshold?: number }> }`.
   - Packs all `items x schema` questions into one batched `@cf/cloudflare/clef` call (with deterministic fallback when `live_clef` is false/unavailable), projects answers onto the allowed schema domain (`FinalReadoutCanvas` invariant: 100% valid typed JSON), and attaches Von Margin confidence per cell.

### 3.3 Lane F3 (`jev-ontology.js`)
1. **`POST /api/jev/ontology/conflict-audit` (`auditVerbalVsStateConflicts(input, env)`):**
   - Accepts `{ verbal_text: string, state_facts?: Record<string, any> }` (merges caller `state_facts` with canonical Steady Orbit platform manifest facts: 80 parts, Policy v27, 17 bindings, 3 crons, owners Shant Tchatalbachian & Michael Valdez).
   - Extracts quantitative and status claims from `verbal_text` and checks them against `state_facts`, flagging contradictions (`contradictions[]`, `verified_claims[]`, `ungrounded_claims[]`, `competence_resolution_verdict: "clean" | "conflict_detected"`).
2. **`POST /api/jev/ontology/uncertainty-spans` (`computeUncertaintyDecisionDiagram(input)`):**
   - Accepts `{ text: string, candidate_intents?: string[], scope?: "harness" | "corpus" }`.
   - Grounds all entity/measure spans in `text` and constructs a `r_u_sure`-style Utility Decision Diagram over spans: high-confidence spans are marked `locked: true`, while spans with multiple competing node matches (`gap < 0.25`) or unresolved parameters are emitted as `uncertainty_spans: [{ start, end, text, candidates, expected_utility_ask_vs_act, targeted_question }]`.
3. **`POST /api/jev/ontology/epistemic-frame` (`compileEpistemicProvenanceFrame(input)`):**
   - Accepts `{ claims: Array<{ id?: string, text: string, source_url?: string, jev_weight?: number, lean_verified?: boolean, wae_observed?: boolean }>, check_invariants?: boolean }`.
   - Classifies each claim into one of 5 epistemic frames (`observed_fact`, `computed_theorem`, `external_high_trust`, `external_self_reported`, `speculative_or_contested`), generates a provenance-framed prompt block (`prompts/framings/` pattern from `epistemic-goggles`), and runs a **locality bank check** asserting zero contradiction with standing platform invariants (`locality_preserved: true`).

### 3.4 Lane F4 (`jev-harness2.js` & `jev-n8n-dag.js`)
1. **`GET /api/jev/harness/cachescope` (`analyzeHarnessCachescope(opts)` in `jev-harness2.js`):**
   - Inspects recent harness/chat runs and active harness sets, computing deterministic component prefix hashes (`system_prompt` -> `guardrails` -> `memory` -> `tool_guidance` -> `skills`) and classifying each turn into `HIT`, `first-write`, `rewrite:component_mutated:<comp>`, or `rewrite:expired`, plus byte/cost share per component and KV-rotation recommendations.
2. **`POST /api/jev/harness/curriculum-propose` (`proposeFailureCurriculumScenario(input)` in `jev-harness2.js`):**
   - Accepts `{ failure_records?: Array<{ gate_or_step: string, error_code?: string, domain?: string }>, difficulty?: 1|2|3 }`.
   - Maps observed failure modes onto a bounded procedural generator config (`scenario_type` in `planted_must_ask_ambiguity | covariate_3sigma_spike | tainted_sink_redirect | verbal_state_conflict | multi_turn_coreference_shift`), verifies solvability deterministically (`solvable: true`, `expected_gate_disposition`), and returns a ready-to-run selftest/PPC task payload.
3. **`POST /api/jev/n8n/credit-assignment` (`computeDagMarginalIgCredit(input)` in `jev-n8n-dag.js`):**
   - Accepts `{ steps: Array<{ id: string, target: string, category?: string, score_before?: number, score_after?: number, quality_signal?: number, tokens_used?: number }>, terminal_succeeded?: boolean, rho?: number }`.
   - Computes Mosaic's per-step Marginal Information Gain $\Delta \text{IG}_t = \text{score}(s_t) - \text{score}(s_{t-1})$, normalizes within step category, gates sign by terminal trajectory outcome, and applies the bounded multiplicative efficiency rank factor $1 - \rho \cdot \text{rank\_signal}$ ($\rho = 0.20$), identifying top value-adding steps vs zero-lift steps.

### 3.5 Lane F5 (`jev-console-funnel.js`, `jev-agentic-console.js`, `jev-corpus-routes.js`)
1. **`POST /api/jev/console/sessions/fork` & `POST /api/jev/console/sessions/diff` (`jev-agentic-console.js` + `jev-console-funnel.js`):**
   - `sessions/fork`: `{ session_id: string, up_to_turn?: number, branch_name?: string, harness_id?: string }` -> creates a copy-on-write branched session containing turns `0..up_to_turn` with `parent_session_id`, `fork_turn`, and `branch_hash`.
   - `sessions/diff`: `{ session_a: string, session_b: string }` -> computes common ancestor turn, diverging turns, step-target diffs, and response/metric deltas.
2. **`GET|POST /api/jev/console/wake-gates` & `POST /api/jev/console/floor` (`jev-console-funnel.js`):**
   - `wake-gates`: registers or evaluates declarative wake gates (`{ gate_id?, actor, event_type: "approval_resolved"|"slip_settled"|"doc_diff"|"edge_threshold", condition, suppress_own_echo: true }`), enforcing `anima-docs`'s rule that an event with `event.actor === gate.actor` never triggers a wake.
   - `floor`: implements `FLOOR-RFC-001` state machine (`op: "request" | "renew" | "release" | "revoke" | "status"`, `resource_id`, `holder_id`, `strategy: "fifo" | "priority" | "round_robin"`, `ttl_ms`), returning cryptographic SHA-256 lease receipts.
3. **`POST /api/jev/corpus/curation-bits` (`computeCurationBitsReport(input)` in `jev-corpus-routes.js`):**
   - Accepts `{ candidates?: Array<{ id: string, p_base?: number, p_curated?: number, tokens?: number, kept?: boolean, source?: "rung_join" | "lens_fill" | "caller" }>, m_selected?: number, n_pool?: number }`.
   - Computes probability magnification $M = p_{\text{curated}}/p_{\text{base}}$, bits of selection gain $\log_2 M$, optimization pressure $\rho = \text{bits}/\text{tokens}$, selection interval $\lambda = 1/\rho$, $m$-of-$n$ satisficing bits $\log_2(n/m)$, and bits-per-kept-edit grouped by proposal source (`rung_join` vs `lens_fill` vs `caller`).
4. **Funnel Catalog Expansion (`jev-console-funnel.js`):**
   - Registers all 15 new endpoints in `FUNNEL_CATALOG` (`270 -> 285` targets; `/mcp` `152 -> 167` tools).
