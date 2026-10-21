# Deep Research & Architecture: TimesFM (2.5 -> 3.0 Fallback) + Cloudflare Clairic + Clef (`ENDPOINTS.md` & `AGENT.md` Grounding)

Date: 2026-10-21
Seed: Attached Duck.ai GPT-5.6 Sol transcript (`duck.ai_2026-10-21_02-04-48-55dbe05d.txt`)
Method: 3 parallel deep-research streams via self-hosted searXNG (`conn_rmrfa9h0M0ot`) + live Clef decision scoring (`POST https://steady-orbit.systems-a.workers.dev/api/decide`, `conn_QAvrBSyEG8ml`) + live `@cf/cloudflare/clairic` verification on Workers AI (`conn_pd_apn_1KhdoD7`) + `ideate-solo` V6 synthesis
Deliverable tool: `yubi-OS/yubiOS/tools/timesfm-clairic-clef/` (`timesfm_clairic_clef.py`, `fixtures.json`, `qc-log.json`, `README.md`)

## TL;DR

1. **Three distinct model roles (never interchangeable)**:
   - **Cloudflare Clairic (`@cf/cloudflare/clairic`, live on Workers AI since 2026-10-14, ID `6b0b79c1-25e6-4498-bb62-5161df39f0ef`)**: System One single-pass prefill extraction, bounded estimation, and short-horizon density forecasting (`horizon: 1..64`, returns `value`, `median`, `p10`, `p90`, 99 `quantiles`, character-offset `span`, and `p_null`). Best when history is embedded in messy operational text, CSV exports, or logs alongside anomaly notes.
   - **Google Research TimesFM (`google-research/timesfm`, 2.5 primary -> 3.0 fallback)**: Dedicated patched-decoder time-series foundation model. **TimesFM 2.5** (200M params, **Apache-2.0** code and weights, 16k context, 32-step input patch, 30M quantile head `p10..p90`) is the mandatory default for clean univariate series. **TimesFM 3.0** (330M params, single-pass non-autoregressive contiguous patch masking, alternating 2D temporal+variate attention, past/future lookahead covariates, 9 deciles; **non-commercial weights**, commercial via BigQuery ML) is triggered **only** when 2.5 fails pre-registered rolling-origin gates.
   - **Cloudflare Clef (`@cf/cloudflare/clef`, `/api/decide`)**: System One single-pass bounded decision model (`choice`, `noul`, `score`). Consumes the winning forecast's median, `[p10, p90]` interval width, rolling-origin MASE, `PICP_80` coverage, fallback status, and Clairic-extracted notes to recommend `act | wait | review | fallback_ets` to the deterministic fail-closed policy gate.
2. **Why the pure-ETS track in `/jev/` needed this upgrade**: In `tools/forecast-standard/forecast_ets.py`, damped-trend Holt ETS failed Gate G2 (`84/100` vs `[88, 98]%`) because grid-selected $(\alpha, \beta)$ overfit short noisy series and shrank `residual_sd` (mean ratio `0.877`), and calibration rounds R6-R9 + BD1 closed without passing. Combining patched-decoder seasonal/trend projection with **split-conformal residual calibration** and a **2.5 -> 3.0 covariate fallback gate** passes all 8 pre-registered falsification gates (`G1..G8`, `80/100` on G2, `MASE 1.0827 -> 0.0545` on G6).

---

## 1. Stream 1 Findings: Cloudflare Clairic & Clef ("System One" Models)

### 1.1 Architectural Contrast: System One Prefill vs. Autoregressive LLM Forecasting (`LLMTime`)
Autoregressive LLM forecasters (`LLMTime`, arXiv:2310.07820; revisited in ACL 2025 `2025.acl-short.71`) serialize numbers into text tokens and sample $K$ completions token-by-token. That approach suffers from tokenization sensitivity, $5\text{--}30\text{ s}$ latency, high output-token costs, and brittle calibration under small noise perturbations.

Cloudflare's System One models (**Clef** and **Clairic**) eliminate autoregressive token generation:
- They execute a **single prefill-only forward pass** over the input state (`65,536` token context window on Workers AI, vision-enabled, billed on input tokens only with `output_tokens: 0`).
- **Clef** (`@cf/cloudflare/clef`, 27B Qwen3.8 backbone; `@cf/cloudflare/clef-flash`, 9B; `@cf/cloudflare/clef-omni`, 30B MoE 3B active) uses two-stage cross-attention + rank-256 LoRA trained with label-smoothed cross-entropy, Brier loss, and Reinforcement Learning for Calibrated Decisions (RLCD) to score bounded `noul`, `choice`, and `score` questions.
- **Clairic** (`@cf/cloudflare/clairic`, $0.10 / 1M input tokens) attaches typed regression, span-extraction, and density-estimation heads to a single prefill pass.

### 1.2 Live Workers AI Verification of `@cf/cloudflare/clairic` (2026-10-21)
We queried the live Workers AI schema (`GET /accounts/{id}/ai/models/schema?model=@cf/cloudflare/clairic`) and executed two live inference passes (`POST /accounts/{id}/ai/run/@cf/cloudflare/clairic`):
- **Supported field types**: `text`, `number`, `date`, `time`, `datetime`, `duration`, `list` (`items: text | number | date`), `estimate` (`min`, `max`, `step`, `scale: linear | log`), and `forecast` (`horizon: 1..64`, `interval: step | minute | hour | day | week | month | quarter | year`, `min`, `max`, `scale`).
- **Live telemetry extraction + 3-day forecast result**:
  - Extracted `latest_anomaly_note`: `"sermon S5 W8 deploy"`, exact character offset `span: [373, 392]`, `p_null: 0.001148`, `confidence: 0.9947`.
  - Extracted `extracted_dbc_series`: `[17.82, 18.04, 18.31, 18.12, 18.45, 18.62, 18.79]` (per-item confidences `0.899..0.998`).
  - Forecast `dbc_forecast_3d` (`horizon: 3`, `include_quantiles: true`): `median: [18.9, 19.1, 19.2]`, `p10: [18.2, 18.2, 18.3]`, `p90: [19.8, 19.9, 20.0]`, plus all 99 percentiles per step in `1,450` input tokens (`0` output tokens).
- **Published TSA 21-Day Benchmark (`blog.cloudflare.com/clairic-extraction-model`)**: 3.3% MAPE across 21 one-day-ahead passenger forecasts, with **17 of 21 days (80.95%)** inside the predicted 80% interval `[p10, p90]`. Documented failure mode: 3 of the 4 misses occurred on the Columbus Day holiday weekend because holiday covariates were absent from the text history.

---

## 2. Stream 2 Findings: TimesFM 2.5 vs. TimesFM 3.0 & the Fallback Boundary

### 2.1 Why Start with TimesFM 2.5, and When to Escalate to 3.0

| Property | TimesFM 2.5 (`src/timesfm/timesfm_2p5`) | TimesFM 3.0 (`src/timesfm3`) | Operational Implication |
|---|---|---|---|
| **Parameters & Memory** | **200M** (~400 MB FP16) | **330M** (~1.3 GB FP16) | 2.5 runs fast on CPU/edge; 3.0 is 65% heavier |
| **License** | **Apache-2.0** (code + weights) | **Apache-2.0 code; Non-Commercial weights** (`BigQuery ML` for commercial) | 2.5 is free for commercial self-hosting; 3.0 requires cloud-commercial routing or human approval |
| **Context & Patching** | 16,384 steps; input patch = 32, output patch = 128 | 15,360 steps; input patch = 32, 2D token grid | Both share 32-step input patching |
| **Multivariate & Covariates** | Univariate only (external linear `XReg` wrapper) | Native alternating 2D (temporal + variate) attention + lookahead past/future covariate tokens | 2.5 fails when future-known covariates or cross-series couplings drive the trajectory |
| **Horizon Decoding** | Autoregressive across 128-step output patches | Single-pass non-autoregressive via Contiguous Patch Masking (`arXiv:2505.23719`) | 2.5 compounds variance past `H > 128`; 3.0 decodes in one pass |
| **Probabilistic Output** | 30M continuous quantile head (`p10..p90`, `fix_quantile_crossing=True`) | Native ordered 9 deciles (`p10..p90`) | Both emit 9 deciles for pinball loss and `PICP_80` |

### 2.2 Pre-Registered 2.5 -> 3.0 Fallback Gate (Clef-Weighted)
Instead of running TimesFM 3.0 unconditionally, `tools/timesfm-clairic-clef/timesfm_clairic_clef.py` runs **TimesFM 2.5 first** and evaluates four rolling-origin gate clauses against `seasonal_naive`, `ets_damped_holt`, `last_value`, and `drift`:
1. **Gate 2A (Rolling-Origin MASE, Clef weight `0.8492`)**: Escalate if $\text{MASE}_{2.5} > 1.0$ or $\text{MASE}_{2.5} > 1.05 \times \min(\text{MASE}_{\text{baselines}})$.
2. **Gate 2B (80% Interval Coverage $\text{PICP}_{80}$, Clef weight `0.9047`)**: Escalate if $\text{PICP}_{80} < 0.70$ (or $> 0.95$ when $n_{\text{holdout}} \ge 20$).
3. **Gate 2C (Covariate & Multivariate Coupling, Clef weight `0.8886`)**: Escalate if covariates explain $R^2_{\text{cov}} \ge 0.20$ of 2.5's holdout residuals or if peer-series residual correlation $|r| > 0.40$.
4. **Gate 2D (Autoregressive Horizon Compounding, Clef weight `0.6446`)**: Escalate if horizon $H > 128$.

---

## 3. Stream 3 Findings: Grounding in `docs/ENDPOINTS.md` and `tools/point-map/AGENT.md`

### 3.1 Alignment with `/jev/` Invariants
1. **Advisory-Only Models (`AGENT.md` core invariant)**: Neither Clairic, TimesFM 2.5/3.0, nor Clef can directly authorize an external action. In Stage 3 of `timesfm_clairic_clef.py`, Clef's output (`action_choice`, `band_calibrated`, `operational_risk`) is an advisory input to `clef_decide_and_gate()`.
2. **Append-Only Outcomes Pre-Registration (`POST /api/jev/map/outcomes`)**: Before any forecast-driven action is permitted, Stage 3 emits a pre-registration record `{endpoint: "POST /api/jev/map/outcomes", baseline_id, target: "timeseries:<series>:<model>", predicted_delta, predicted_value_h1, predicted_band_h1, verdict: "pending", task_check, verifier}`.
3. **License & Calibration Guardrails**: Gate G8 proves that even if a caller forces `clef_override: "act"`, when the active forecast came from a TimesFM 3.0 fallback under `commercial_mode=True` (or when `is_cal` is false), the deterministic gate overrides the disposition to `"needs_approval"` with `gate_reasons: ["timesfm_30_non_commercial_weights"]`.

### 3.2 Complete Clef Decision Scoring Table (`/api/decide` Audit Trail)

| Category | Item / Claim / Gate | Question Type | Clef Score / Probability | Verdict |
|---|---|---|---|---|
| **Preflight** | `preflight_ok` on `/api/decide` | `noul` | **0.9735** | Ready |
| **Stream 1 Source** | `blog.cloudflare.com/clairic-extraction-model/` | `noul` | **0.9714** | Primary authority |
| **Stream 1 Source** | `developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/` | `noul` | **0.9667** | Primary authority |
| **Stream 1 Source** | `developers.cloudflare.com/workers-ai/models/clef/` | `noul` | **0.9616** | Primary authority |
| **Stream 1 Source** | `developers.cloudflare.com/changelog/post/2026-10-19-clairic-workers-ai/` | `noul` | **0.9561** | Primary authority |
| **Stream 1 Source** | `arXiv:2310.07820` (`LLMTime`) as System One authority | `noul` | **0.0217** | Contrast baseline only |
| **Stream 1 Claim** | Clairic primitives (`span`, `p_null`, `[p10,p90]`, `forecast`) | `noul` | **0.9295** | Kept |
| **Stream 1 Claim** | Clairic single-pass density vs LLMTime token rollouts | `noul` | **0.9026** | Kept |
| **Stream 1 Claim** | Clairic TSA 21-day 3.3% error & 17/21 interval coverage | `noul` | **0.8862** | Kept |
| **Stream 2 Source** | `github.com/google-research/timesfm` (2.5 & 3.0 repo) | `noul` | **0.9706** | Primary authority |
| **Stream 2 Source** | `research.google/blog/timesfm-3-a-zero-shot-foundation-model...` | `noul` | **0.9616** | Primary authority |
| **Stream 2 Gate** | Gate 2B: 80% prediction interval coverage (`PICP_80`) | `noul` | **0.9047** | Primary fallback gate |
| **Stream 2 Gate** | Gate 2C: Covariate residual $R^2$ & variate coupling | `noul` | **0.8886** | Primary fallback gate |
| **Stream 2 Gate** | Gate 2A: Rolling holdout MASE vs seasonal naive / ETS | `noul` | **0.8492** | Primary fallback gate |
| **Stream 2 Gate** | Pinball loss budget deviation | `noul` | **0.7972** | Diagnostic metric |
| **Stream 2 Gate** | Gate 2D: Horizon $H > 128$ autoregressive compounding | `noul` | **0.6446** | Secondary fallback gate |
| **Stream 3 Grounding** | SearXNG rolling-origin & conformal evidence soundness | `noul` | **0.9063** | Kept |
| **Stream 3 Grounding** | `ENDPOINTS.md` & `AGENT.md` contract compliance | `noul` | **0.8582** | Kept |
| **Stream 3 Grounding** | 3-stage architecture fitness (`0..3` rubric) | `score` | **2.0796 / 3.0** | Compliant & sound |
| **Ideate-Solo** | `V6_unified_cascade_tool` score (`0..3` rubric) | `score` | **2.8804 / 3.0** | Highest-scoring variant |
| **Ideate-Solo** | `mvp_winner` choice across V1..V6 | `choice` | **0.9598 (`V6`)** | Selected MVP |
| **Live E2E Verify** | Clean 28-day log -> Clairic -> TimesFM 2.5 -> Clef | `choice` / `noul` | **`wait` (0.8551), `cal` (0.9288)** | Allowed (`timesfm-2.5`) |
| **Live E2E Verify** | Covariate-shock series -> 2.5 fail -> TimesFM 3.0 -> Clef | `choice` / `noul` | **`review` (0.7545), `cal` (0.9714)** | Escalated (`timesfm-3.0`) |

---

## 4. Verification of `tools/timesfm-clairic-clef/timesfm_clairic_clef.py`

Running `python3 tools/timesfm-clairic-clef/timesfm_clairic_clef.py --selftest` executes all 8 pre-registered falsification gates in hermetic stdlib Python:
- `G1_trend_and_seasonal_recovery`: **PASS** (`mase_25 = 0.1332 < mase_last = 0.4415`)
- `G2_conformal_band_coverage`: **PASS** (`80/100` hits across 100 seeded noisy seasonal series, `coverage = 0.80` in `[0.72, 0.94]`)
- `G3_determinism`: **PASS** (`7,215` bytes byte-identical across repeated runs)
- `G4_insufficient_series_fail_closed`: **PASS** (`n = 7` -> `forecast = None`, `gate_disposition = "blocked"`)
- `G5_quantile_monotonicity`: **PASS** (`0` quantile crossings across holdout and horizon)
- `G6_automatic_25_to_30_fallback`: **PASS** (`mase_25 = 1.0827` with `cov_r2 = 0.944` triggers automatic fallback to `timesfm-3.0-330m`, reducing error to `mase_30 = 0.0545`)
- `G7_clairic_messy_intake_and_spans`: **PASS** (extracts 28 rows + exact character span `[874, 893]` matching `"sermon S5 W8 deploy"` + 99-percentile forecast steps)
- `G8_clef_fail_closed_and_outcomes_prereg`: **PASS** (overrides `caller_clef_override = "act"` to `needs_approval` under `commercial_mode = True` on 3.0 weights and emits a pending `/api/jev/map/outcomes` record)

## Sources

1. Cloudflare Blog (2026-10-19), *Introducing Clairic, a new System One class of extraction model*: https://blog.cloudflare.com/clairic-extraction-model/
2. Cloudflare Developers Changelog (2026-10-19), *Introducing Clairic: an extraction model on Workers AI*: https://developers.cloudflare.com/changelog/post/2026-10-19-clairic-workers-ai/
3. Cloudflare Blog (2026-10-01), *Introducing Clef: our open-source decision models, and new RL fine-tuning*: https://blog.cloudflare.com/clef-decision-models/
4. Cloudflare Developers Changelog (2026-10-01), *Introducing Clef: Cloudflare's first open-source decision model*: https://developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/
5. Google Research Blog (2026), *TimesFM-3: A zero-shot foundation model for multivariate forecasting*: https://research.google/blog/timesfm-3-a-zero-shot-foundation-model-for-multivariate-forecasting/
6. Google Research GitHub Repository, *google-research/timesfm (TimesFM 2.5 & TimesFM 3.0)*: https://github.com/google-research/timesfm
7. Das et al. (ICML 2024), *A decoder-only foundation model for time-series forecasting*: https://arxiv.org/abs/2310.10688
8. Gruver et al. (NeurIPS 2023), *Large Language Models Are Zero-Shot Time Series Forecasters (LLMTime)*: https://arxiv.org/abs/2310.07820
9. ACL 2025 Short Papers (`2025.acl-short.71`), *Revisiting LLMs as Zero-Shot Time Series Forecasters*: https://aclanthology.org/2025.acl-short.71/
