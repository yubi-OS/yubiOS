# Google Research Quad Integration & Universal Prompt Console Funnel [SOLO]

Date: 2026-10-21
Source: ideate-solo (no dialogue) + Clef `/api/decide` QC scoring
Scope class: systemic
Variations generated: 6
Finalist: V6 (Staged V4: Four-Pillar Deterministic Core + Skill Workflow Parity + Universal `/jev/` Prompt Console Funnel)

## Problem Statement

How might we integrate the mathematical kernels and recursive architectures of `google-research/sofima`, `google-research/dream-rsi`, `google-research/spherical-cnn`, and `google-research/harness2` into the `steady-orbit` Cloudflare Worker, achieve full functional parity between all worker APIs and the `yubi-OS/yubiOS` skill corpus, and funnel every endpoint, workflow, automation, and evolution through the `/jev/` prompt console?

## Recommended Direction

Adopt **V6 (Staged V4)**: build four pure, zero-dependency, deterministic ES module engines (`jev-sofima.js`, `jev-dream-rsi.js`, `jev-spherical-cnn.js`, `jev-harness2.js`) that slot directly into the existing `/api/jev/*` architecture with pre-registered selftest gates, pair them with a dedicated multi-step workflow engine (`jev-workflows.js`) that embeds the remaining skill-described flows (`unit-round`, `wayfinder-cycle`, `mint-preflight`, `self-archaeology`), close all open functional-review gaps from `steady-orbit-coverage-map.md`, retrofit the matching skills in `yubi-OS/yubiOS/skills/`, and expose every endpoint, workflow, automation, and evolution through a universal `/jev/` Prompt Console Funnel (`jev-console-funnel.js` + `jev-decide.js` + `jev-index.html`).

Each of the four Google Research repositories fills a specific structural gap identified in prior rounds:
1. **SOFIMA (`google-research/sofima`, Zenodo `10.5281/zenodo.10534541`)** supplies relative-offset coordinate maps $M(x,y)=(\Delta x,\Delta y)$, masked Fourier cross-correlation (`masked_xcorr`), and a fold-preventing Hookean spring mesh (`prefer_orig_order=True`, $k_2 = k/\sqrt{2}$) relaxed via FIRE. While `jev-lens-math.js` only corrects 3 global scalar modes (astigmatism, spherical, trefoil), SOFIMA relaxes arbitrary local non-rigid deformations without mesh folding (directly addressing the Zernike Slot-2 F4 caustics/folding problem and arrangement-level warps).
2. **DREAM-RSI (`google-research/dream-rsi`, `arXiv:2609.14858`)** supplies `TraceEnv` (a unified discovery-tree surface where offline replay reveals recorded branches deterministically without inventing outcomes), the Eq. 1 Pareto quality-cost-parallelism objective across budget preferences $\rho \in \{0, 0.25, 0.5, 0.75, 1.0\}$, replay-set monotonicity $V(\pi_{t+1}) \ge V(\pi_t)$, and root-direction mechanism diversity metrics. It slots into `/api/jev/evolution/dream/*` and replaces the disclosed skip on `cycle_replay` in `jev-selftest-evolution.js` with a real deterministic replay-world evaluator.
3. **Spherical-CNN (`google-research/spherical-cnn`, `arXiv:1711.06721`, `2006.10731`, `2306.05420`)** supplies Huffenberger & Wandelt (H&W) equiangular grids, exact torus-extended quadrature weights satisfying Parseval's identity on $S^2$, Wigner $\Delta^\ell_{m,n} = d^\ell_{m,n}(\pi/2)$ matrices, forward/backward Spin-Weighted Spherical Fourier Transforms (SWSFT for integer spin $s \in \mathbb{Z}$), spin-weighted spectral convolution, and spectral pooling ($\ell_{\max}' = \lfloor(\ell_{\max}+1)/2\rfloor - 1$). It extends `jev-corpus-math.js` beyond scalar ($s=0$) least-squares spherical harmonics to exact-quadrature spin-weighted directional fields on $S^2$.
4. **HarnessÂ² (`google-research/harness2`, `arXiv:2610.14224`)** supplies the 8-component executable harness representation (`system_prompt`, `guardrails`, `memory`, `tool_guidance`, `subagents`, `skills`, `scripts`, `plugins`), the task-level contrastive **ProposeâProbeâCompose** step (invariant `INV` + domain `DOM` candidates, SHA-1 seeded `A..Z` anonymized selection pool, and the strict $R=4k, P=3k$ `Ledger` budget identity), and the harnessing-level **Experience Reflector** requiring `{cue, lesson, evidence}` triples in a domain-scoped library.

## Key Assumptions to Validate

- [x] **A1 (Deterministic JS Port Feasibility):** All four mathematical kernels (SOFIMA FIRE spring-mesh + FFT xcorr, DREAM-RSI TraceEnv + Pareto $\rho$-sweep, Spherical-CNN H&W quadrature + Wigner $\Delta$ + SWSFT, HarnessÂ² $R=4k/P=3k$ ledger + anonymized contrastive selection + experience library) can be implemented in pure zero-dependency ES modules within the Worker CPU budget and verified via `/selftest` routes.
- [x] **A2 (Fail-Closed Gate Preservation):** Every prompt-console action routed to any endpoint, workflow, automation, or evolution still passes through the deterministic gate (`jev-gate.js`); mutating or external actions require approval or follow policy v25 rules, while read-only/diagnostic measurements execute safely in-process.
- [x] **A3 (Skill-to-API Parity):** Retrofitting the corpus, RSI, wayfinder, orchestrator, timeseries, and taste skills to call the worker APIs eliminates duplicate ad-hoc client math while keeping offline Python tools as the CI-gated sources of record.

## MVP Scope

1. Four new worker modules (`jev-sofima.js`, `jev-dream-rsi.js`, `jev-spherical-cnn.js`, `jev-harness2.js`) with `/selftest` endpoints and live D1/run-row integration.
2. Unified workflow module (`jev-workflows.js`) + prompt-console funnel module (`jev-console-funnel.js`) + full functional review fixes (`jev-switches.js` & `jev-history.js` selftests, `jev-history-restore.js` & `reindex-memory.js` route wiring, `cycle_replay` active).
3. Updated `/jev/` console (`jev-index.html`) with an interactive Prompt Console Funnel bar (category/target selector, parameter prefill, slash-command & natural-language routing) plus diagnostic cards for SOFIMA, DREAM-RSI, Spherical-CNN, HarnessÂ², and Workflows.
4. Retrofitted skills in `yubi-OS/yubiOS/skills/` + updated `docs/ENDPOINTS.md` and `tools/point-map/AGENT.md`.

## Not Doing (and Why)

- **Bundling JAX/Flax/TensorFlow into the Cloudflare Worker (V2):** Heavy Python/WASM ML runtimes exceed Worker bundle limits and violate our deterministic, zero-dependency ESM worker architecture.
- **Allowing prompt intake to bypass `jev-gate.js`:** Funneling all endpoints through the `/jev/` prompt console must never weaken the fail-closed gate; destructive or external actions remain gated.
- **Committing deployed worker JS source to `yubi-OS/yubiOS`:** Per `RULES.md` ("No source in the repo"), `yubi-OS/yubiOS` holds docs, specs, skills, and refs only.

## Open Questions

- None blocking; all four mathematical specifications and route contracts are pinned in `SPEC-GOOGLE-RESEARCH-PARITY-2026-10-21.md`.

## Generation log (for review)

### Variations generated and scored (4 heuristics: Painkiller P, Switching S, Defensibility D, Testability T, each 1-5; plus Clef `/api/decide` score 0-3)

1. **V1 â Inversion (Offline CLI Port Only)** [Lens: Inversion]
   - Description: Port the 4 Google Research repos only as standalone Python scripts under `tools/`, without touching the Cloudflare worker or `/jev/` console.
   - Heuristic score: P=2, S=3, D=2, T=4 -> **11/20** (Justification for P=2: fails the explicit directive to slot into the Cloudflare codebase, embed workflows in the frontend/API, and funnel everything through `/jev/`).
   - Clef `/api/decide` score: **0.1555 / 3.0** (`p(0) = 0.8886`) -> **DROPPED**.
2. **V2 â Constraint Removal (Full JAX/WASM Runtime in Worker)** [Lens: Constraint Removal]
   - Description: Compile JAX/SciPy into WASM inside the Cloudflare Worker to run raw unmodified Python/JAX code in-worker.
   - Heuristic score: P=2, S=1, D=2, T=1 -> **6/20** (Justification for S=1, T=1: breaks Cloudflare Worker memory/size limits and introduces non-deterministic float drift).
   - Clef `/api/decide` score: **0.1653 / 3.0** (`p(0) = 0.8686`) -> **DROPPED (<8)**.
3. **V3 â Audience Shift (Operator Prompt-Console Funnel First)** [Lens: Audience Shift]
   - Description: Redesign `/jev/` around the operator's prompt console so every existing endpoint, automation, and evolution is routable from `#prompt-console` via natural language or command syntax.
   - Heuristic score: P=5, S=4, D=4, T=5 -> **18/20** (Justification for P=5, T=5: directly solves the operator bottleneck of navigating 130+ endpoints across separate tabs and is 100% testable via `node --test` and live curl).
   - Clef `/api/decide` score: **2.3052 / 3.0**.
4. **V4 â Combination (Four-Pillar Deterministic Core + Prompt Console Funnel + Skill Parity)** [Lens: Combination]
   - Description: Combine deterministic pure-ESM implementations of SOFIMA, DREAM-RSI, Spherical-CNN, and HarnessÂ² with V3's universal Prompt Console Funnel and embedded skill workflows.
   - Heuristic score: P=5, S=4, D=5, T=4 -> **18/20** (Justification for D=5: unifies elastic coordinate maps, replay-world Pareto policy evolution, spin-weighted spherical harmonics, and contrastive harness recursion under one gated orchestrator).
   - Clef `/api/decide` score: **2.4620 / 3.0**.
5. **V5 â Simplification (Metadata Wrapper Stubs)** [Lens: Simplification]
   - Description: Add thin stub endpoints returning static descriptions of the 4 repos without real math or state.
   - Heuristic score: P=1, S=5, D=1, T=5 -> **12/20** (Justification for P=1, D=1: violates house epistemic-honesty rules and provides zero analytical capability).
   - Clef `/api/decide` score: **0.2623 / 3.0** (`p(0) = 0.7660`) -> **DROPPED**.
6. **V6 â Staged V4 Rollout with Pre-Registered Selftests & Full Functional Review** [Lens: Combination + Verification]
   - Description: Execute V4 in modular lanes with pre-registered falsification/selftest gates per module, close every S5 functional-review gap (`jev-switches.js`, `jev-history.js`, `jev-history-restore.js`, `reindex-memory.js`, `cycle_replay`), wire the universal Prompt Console Funnel on `/jev/`, and retrofit all matching skills.
   - Heuristic score: P=5, S=5, D=5, T=5 -> **20/20** (Justification: satisfies every clause of the directive with zero regression risk on the existing 67-part bundle and full selftest verification).
   - Clef `/api/decide` score: **2.8139 / 3.0** (`p(3) = 0.8458`), `winner_choice = V6` (`p = 0.9804`, confidence `0.9517`).

### Stress-test of Finalists (V3, V4, V6)

- **Strongest critique of V6:** Adding 4 new mathematical/orchestration engines, a workflow runner, and a universal prompt-console funnel increases the worker part count (67 -> 73 parts) and could introduce route collisions or prompt-routing ambiguity in `jev-decide.js`.
- **Mitigation baked into SPEC:**
  1. Exact prefix isolation in `routes-jev.js` and `jev-corpus-routes.js` (`/api/jev/corpus/sofima/*`, `/api/jev/corpus/spherical/*`, `/api/jev/evolution/dream/*`, `/api/jev/harness/*`, `/api/jev/workflows/*`, `/api/jev/console/*`).
  2. Deterministic command prefix (`/<domain>.<action>` or structured `payload.console_command`) alongside natural-language `NAME_ALIASES` and `route.dispatch` targets so the operator can always invoke any endpoint unambiguously without LLM guesswork.
- **Second-order effects:** Skills in `yubi-OS/yubiOS/skills/` become much thinner and more reliable because multi-step math and orchestration happen server-side via verified worker endpoints.
- **Un-testable bet:** None â every mathematical identity (Hookean fold-free relaxation, Pareto $\rho$-sweep hypervolume, H&W Parseval quadrature + Wigner $\Delta$ SWSFT roundtrip, and HarnessÂ² $R=4k/P=3k$ ledger identity) is deterministic and verified in-worker via `/selftest`.
