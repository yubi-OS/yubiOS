# SOS Ecosystem Reference: Sorting, Deep Research & Architectural Integration of 18 TimesFM, Clairic, Clef & Jev Repositories

Date: 2026-10-25
Author: Shant Tchatalbachian
Target Repo Path: `yubi-OS/yubiOS/refs/timesfm-clairic-clef-jev-ecosystem-2026-10-25.md`
Companion Spec: `session/SPEC-refinery-forecaster-wae-triad-2026-10-25.md`
Companion Solo Ideation: `session/refinery-forecaster-steady-orbit-solo-2026-10-25.md`

---

## 1. Executive Summary & Taxonomy Sort

We inspected all 18 repositories from `SOS — TimesFM, Clairic, Clef & Jev GitHub Repository Reference List` via the GitHub API (`conn_3h7rj41VF6hs`), audited their file trees, dependency manifests, licenses, and execution surfaces under our external-content security discipline, and cross-mapped them against our live `steady-orbit` Cloudflare Worker (77-part bundle, policy v27), Workers Analytics Engine (`jev` and `imported` datasets, 1,199,729 raw rows / 1,210,326 sampled trade ticks), the `polymarket-rolling-intake` pipeline (986 rolling markets + 1,659 archived markets), and the deployed `forecaster` Sauna app (`https://forecaster-war2dyd2.sauna.new/`).

### 1.1 The 5 Functional Tiers (All 18 Repositories Sorted)

| Tier | Functional Role | Repositories (Count) | Target SOS Surface |
|---|---|---|---|
| **Tier 1** | **Canonical Foundation & SOS Core** | `#03 google-research/timesfm`, `#14 yubi-OS/yubiOS` (2) | Shared Math Kernel (`steady-orbit` `/api/jev/forecast/*` + `forecaster` + `refinery`) |
| **Tier 2** | **Search, Passage Grep & Clairic Data Refinement** | `#02 superagents-lab/jev-search`, `#08 dzhng/jevgrep`, `#01 nicobailon/surf-cli`, `#06 IAmJSD/OpenComputerUse` (4) | **`refinery.systems-a.workers.dev`** + `/api/jev/refinery/*` |
| **Tier 3** | **Forecasting Studios, Quant Arbitrage & MCP Bridges** | `#10 TheAIHorizon/timesfm3-studio`, `MrRobotop/statistical-arb-timesfm`, `#07 porespellar/Zer0Fit`, `#05 psyb0t/docker-predictalot` (4) | **`forecaster.systems-a.workers.dev`** + `/forecasts/` on `steadyorbitsystems.com` |
| **Tier 4** | **Decision-Model Infrastructure, Routers, Benchmarks & Proxies** | `#04 ollaya-dev/ollaya`, `#09 wfzyx/von`, `#11 AbelNavarro/clef-model-router`, `#12 rmax-ai/jev-vs-clef`, `#13 luandro/clef` (5) | Decision Gateway & Calibration Layer across all 3 sites |
| **Tier 5** | **UI Layouts, Brief Generators & Analytical Priors (Caveat-Gated)** | `Showmick119/SamayDashboard`, `47thtechcorner/RayCodes_Timesfm`, `47thtechcorner/RayCodes_TimesFM3.0` (3) | Leaderboard UI cards, grounded market briefs, and 0-ms analytical prior fallback |

---

## 2. Complete 18-Repository Audit Matrix (Metadata, License, Security & Borrow Verdict)

| ID | Repository | Stars | Lang | License | Last Push | Security / Supply-Chain Findings | Borrow / Integration Verdict |
|---|---|---:|---|---|---|---|---|
| **F1** | `47thtechcorner/RayCodes_Timesfm` | 2 | Python | **NONE** | 2026-06-26 | Unescaped ticker string interpolated into Ollama prompt; unpinned deps. | **Concept only (clean-room):** Port automated natural-language Market Brief card per forecast, grounded strictly in Clairic spans + Clef verdict. |
| **F2** | `47thtechcorner/RayCodes_TimesFM3.0` | 14 | Python | **NONE** | 2026-09-02 | **Deceptive fallback:** `try/except` around `TimesFM_2p5_200M_torch` silently falls back to a deterministic Gaussian momentum-drift formula while claiming TimesFM 3.0 output. | **Math fallback only (honestly labeled):** Use the closed-form Gaussian drift fan $y_0(1+\mu t/H) \pm z_\alpha\sigma\sqrt{t/H}$ as a sub-1ms `analytical-gaussian-prior` preview for sparse series ($n<8$), never labeled as TimesFM. |
| **F3** | `MrRobotop/statistical-arb-timesfm` | 5 | Python / React | **NONE** | 2026-04-20 | Unpinned Python dependencies; proprietary default (no LICENSE file). | **Clean-room math port:** Port recursive **Kalman Filter dynamic hedge ratio ($\beta_t$)**, **Ornstein-Uhlenbeck half-life ($t_{1/2}$)**, **Spread Z-score**, and **Hybrid Signal Gating** to detect strike-ladder and cross-exchange (`.com` vs `.us`) mispricings. |
| **F4** | `Showmick119/SamayDashboard` | 0 | TS / Next.js | **Apache-2.0** | 2025-05-19 | Hardcoded dead ngrok URL (`2e76-130-207-126-160.ngrok-free.app`) in `dashboard.tsx` — strip completely. | **UI component pattern:** Adopt multi-model metric comparison cards (MASE, Brier, calibration error, edge) and horizon toggle strip. |
| **01** | `nicobailon/surf-cli` | 672 | TypeScript | **MIT** | 2026-10-25 | Clean (`biome`, `codeql`, `gitleaks`). `AGENTS.md` is benign dev doc. Local path validation in `file-transfer.cjs`. | **Adopt architecture:** (1) Split `clef` (`find`/`filter`/`verify`/`act`) vs `clairic` (`extract`) routing; (2) `planContactSheet()` 16-tile icon sheet for multimodal Clef; (3) saved `.refinery/playbooks/` JSON recipes with provenance. |
| **02** | `superagents-lab/jev-search` | 545 | TypeScript | **MIT** | 2026-10-21 | Clean; zero query logging; HTML entity sanitizer; 1500ms Clairic abort controller. | **Adopt directly into Refinery:** Two-step **Understand** (Clef source + window routing + parallel Clairic verbatim query-span extraction) and **Rerank** (Clef on-topic probability $\ge 0.55$ + multi-engine URL deduplication). |
| **03** | `google-research/timesfm` | 34,772 | Python | **Apache-2.0** | 2026-09-29 | Clean; enforces `safetensors` weights (no pickle `torch.load` RCE). | **Canonical foundation contract:** `ForecastConfig(normalize_inputs=True, use_continuous_quantile_head=True, fix_quantile_crossing=True)`, RevIN normalization, and `xreg_lib` ridge-regression covariate projection in Stage 2 Cascade. |
| **04** | `ollaya-dev/ollaya` | 1,397 | Rust | **Apache-2.0** | 2026-10-25 | Clean; pinned `ort = "=2.0.0-rc.13"` and `tokenizers = "=0.23.2"`. | **Adopt multi-model comparison & option-budgeting:** Side-by-side decision comparison matrix (`head_max_len` option token budgeting) and local `/v1/systemone` compatibility for our Ubuntu offline Clef-flash lane. |
| **05** | `psyb0t/docker-predictalot` | 3 | Python | **WTFPL** | 2026-10-19 | `WTFPL` license — do not vendor code; clean-room reimplementation of routing concepts only. | **Clean-room capability router:** Dispatch by series capability (`univariate`, `covariates_past`, `covariates_future`, `covariates_both`, `multivariate`) + weighted CDF quantile combination. |
| **06** | `IAmJSD/OpenComputerUse` | 15 | Rust | **MIT** | 2026-10-21 | Clean; team-signed updater check; per-device isolated worker thread. | **Adopt Clairic 9-type schema & dual transport:** Use exact `FIELD_TYPES = ["text", "number", "date", "time", "datetime", "duration", "list", "estimate", "forecast"]` with span grounding (`null` if absent) and dual `POST /v1/tools/:tool` + `POST /mcp` routes. |
| **07** | `porespellar/Zer0Fit` | 32 | Python | **Apache-2.0** | 2026-09-04 | `zer0fit_inspect(file_path)` lacks path-jail if exposed outside container — enforce strict KV/D1 key allowlists in Workers. | **Adopt downsampling & MCP tool contracts:** Intelligent temporal resampling/downsampling ($\le 15,360$ points, gap interpolation) in Refinery + MCP tools (`forecast_univariate`, `forecast_multivariate`, `forecast_scenario`, `scan_anomalies`). |
| **08** | `dzhng/jevgrep` | 2,902 | TypeScript | **MIT** | 2026-10-21 | Clean; `stripVTControlCharacters`, `protectedPaths`, 8 MB `navigationByteBudget`, SHA-256 content cache. | **Adopt flood-suppressed batch admission:** Port `navigationAdmissions()` (`relevanceBoundary = 0.5`, `weakScoreCeiling = 0.6`, `minimumPositiveScores = 32`) + SHA-256 evaluation cache into Refinery's log/search chunk filter. |
| **09** | `wfzyx/von` | 919 | Python / TS | **Apache-2.0** | 2026-10-19 | **Verified `archived: true`** on GitHub API (succeeded by `LiquidAI/d1-omni-600M`); uses `safetensors`. | **Adopt calibration math:** Port Von's scale-invariant margin confidence $\text{conf} = \frac{n \cdot p_{\max} - 1}{n - 1}$ and parametric temperature scaling $T(H_{\text{norm}}, \text{tokens}, K)$ into Forecaster. |
| **10** | `TheAIHorizon/timesfm3-studio` | 0 | Python / JS | **Apache-2.0** | 2026-09-13 | Clean local FastAPI + MCP studio; zero external telemetry. | **Adopt 3 studio engines:** (1) **Covariate Lift Backtester** ($\Delta\text{MASE}$ with vs without covariates); (2) **What-If Scenario Perturbation** (`set`, `add`, `multiply` on future covariates); (3) **Quantile-Sigma Anomaly Detector** ($|y_t - Q_{50}| > 3\hat{\sigma}_t$). |
| **11** | `AbelNavarro/clef-model-router` | 2 | TypeScript | **Apache-2.0** | 2026-10-04 | Clean; includes `redact.ts` secret scrubber and 75%/25% head/tail prompt truncator (`truncatePrompt`). | **Adopt 2-question router & hysteresis:** Single-pass Clef evaluation of `(complexity_score, is_incremental_follow_up)` + secret redaction + head/tail truncation before Workers AI calls. |
| **12** | `rmax-ai/jev-vs-clef` | 0 | Python | **NONE** | 2026-10-06 | Missing license; read-only benchmark script. | **Empirical operational rules:** Clef 27B hits 96% accuracy (90% agreement with Jev) but has an ~18.6s Workers AI batch latency floor $\to$ never block UI renders on live Clef; run Clef in Refinery / background cron and serve pre-computed KV/D1 state in $<50\text{ms}$. Normalize `noul` $\leftrightarrow$ `boolean` and cap score rubrics at $\le 10$ levels. |
| **13** | `luandro/clef` | 0 | JavaScript | **NONE** | 2026-10-05 | Missing license; clean zero-dependency Worker with `Object.create(null)` and constant-time SHA-256 auth. | **Clean-room Worker gateway hardening:** Port upstream Workers AI error normalization (`3040` $\to$ 529, `3036` $\to$ 429, `5004` $\to$ 422, `3006` $\to$ 422), `Retry-After` sanitization, and 13 MiB / 4-image bounds. |
| **14** | `yubi-OS/yubiOS` | 2 | Python / JS | **LGPL-2.1** | 2026-10-21 | First-party org repo. All 14 forecasting/jev paths verified by SHA-1 on `main`. | **Canonical source of record:** `tools/timesfm-clairic-clef/timesfm_clairic_clef.py` (`1435bbe8`), `tools/forecast-standard/v2/forecast_ets.py` (`628fff21`), `docs/ENDPOINTS.md` (`4aca1e30`). |

---

## 3. Verification of `yubi-OS/yubiOS` Paths (Closing the Doc's "Unverified Paths" Note)

Line 70 of the attached document stated: *"Sauna notes report TimesFM–Clairic–Clef integration and Jev orchestration work; specific paths remain unverified."* We queried `GET /repos/yubi-OS/yubiOS/git/trees/main?recursive=1` and verified the exact paths and git blob SHA-1s on `main`:

- `tools/timesfm-clairic-clef/README.md` (`a7b3fa4711bda4a2c8546a0e03522764db30c69a`, 5,150 bytes)
- `tools/timesfm-clairic-clef/timesfm_clairic_clef.py` (`1435bbe8eacd36a1dfc762405289f11ce170261b`, 56,762 bytes) — 3-stage SCAMPER cascade source of record, parity-verified ($\max|\Delta| \le 1.42 \times 10^{-14}$) against `jev-cascade-forecast.js` on the `steady-orbit` worker.
- `tools/timesfm-clairic-clef/fixtures.json` (`3005717826ad4810faed9f1869ab8cbc8c61c970`, 4,669 bytes)
- `tools/timesfm-clairic-clef/qc-log.json` (`6ee88a7a8afd21574d27f4d52c25e95d232deda1`, 6,736 bytes)
- `tools/forecast-standard/forecast_ets.py` (`2b835227985fe6edbcd6485d6e9def92890f66e8`, 13,230 bytes)
- `tools/forecast-standard/v2/forecast_ets.py` (`628fff21126153748bd9cc1813dfb92897ddd6fa`, 14,217 bytes)
- `tools/forecast-standard/v3/results/VERDICT-2026-10-09.md` (`bd742df7c4746913a7d1e0d278f0f04bea016c39`, 3,562 bytes)
- `docs/ENDPOINTS.md` (`4aca1e30250286ce036482e9c1dc146c85f27af2`, 137,114 bytes)
- `refs/jev-timeseries-2026-10-08.md` (`1762eb3cdb3c892d8542c98fc6ac015dad2d03c7`, 5,499 bytes)
- `refs/timesfm-clairic-clef-2026-10-21.md` (`377d10b7a31264967ff8fcbb1a538326e42c9203`, 15,073 bytes)
- `refs/timesfm-clairic-clef-solo-2026-10-21.md` (`6519f9b3318b7bd29833fc87dbb544a02a6459a3`, 10,738 bytes)

---

## 4. Audit of Current Forecasts, WAE Data & Deployed Forecaster Sauna App

### 4.1 Live Data Inventory (as of 2026-10-25 19:54 PDT)
- **Cloudflare WAE (`imported` dataset on `steady-orbit`):** `1,199,729` stored rows (`1,210,326` sampled trade ticks) across `2,866+` distinct Polymarket conditionIds (`2026-10-21 16:58:52 UTC` to `2026-10-26 02:40:55 UTC`).
- **Cloudflare WAE (`jev` dataset on `steady-orbit`):** `corpus_run` (476 rows), `task_state` (412 rows), `approval` (149 rows), `selftest_probe` (123 rows).
- **Forecaster Sauna App (`https://forecaster-war2dyd2.sauna.new/`, SQLite DB `forecaster-war2dyd2`):**
  - `oct21_archive` (`polymarket.com`): **1,659 resolved markets** (`123,258` trades), **78.12% Consensus accuracy**, Brier scores: Cascade `0.1471`, Consensus `0.1483`, ETS `0.1512`, Clairic `0.1559`.
  - `rolling_ledger` (`polymarket.com`): **728 resolved markets** + **164 open markets** (`783,730` trades), **74.31% Consensus accuracy** (`541/728`), Clairic `74.18%` (`540/728`, Brier `0.1583`), ETS `74.04%` (`539/728`, Brier `0.1582`), Cascade `73.90%` (`538/728`, Brier `0.1632`).
  - `rolling_ledger` (`polymarket.us`): **94 open markets** (`238,993` trades), **0 resolved scored**.
  - `wae_live_only` (`.com` + `.us`): **264 open markets** (`60,544` trades) synced directly from WAE SQL.

### 4.2 Six Empirical Lessons Learned (Why We Need the Refinery + Forecaster Split)

1. **Lesson 1 — Unrefined Sparse Series (`n < 8` Trades) Degrade Cascade to a Flat Market Pass-Through:**
   In `apps/github-yubios-KS9n5GAT/forecaster/src/handler.ts` (lines 549–575), when a WAE market has $<8$ outcome-0 trades, `/api/jev/forecast/events` returns null for ETS/Cascade and the app falls back to `cascade_model = 'wae-empirical-prior'` (`baseP = wae_avg_price`). Without **Refinery** resampling irregular ticks (`Zer0Fit`) and injecting SearXNG + Clairic news/context covariates (`jev-search` + `OpenComputerUse`), sparse markets have zero alpha over the crowd.
2. **Lesson 2 — Domain & Structure Alpha Dispersion Is Massive (95.7% vs 59.6%):**
   - **High-Alpha Regimes:** Crypto Price Strike / Threshold Ladders hit **92.86%–95.71%** accuracy (Brier `0.0362–0.0435`); Esports (CS2/LoL/Dota2) hits **87.88%–89.39%** (Brier `0.0675–0.0892`); Half/Map Sub-Markets hit **92.86%**; Intraday Up/Down hits **90.48%**; Macro/Equities hits **81.77%** (Brier `0.1293`).
   - **High-Noise Regimes:** Other Sports (`60.29%`), NHL (`63.33%`), NBA (`63.79%–67.24%`), and Player Props (`60.71%`) suffer from late injury scratches, lineup rest, and 3-way soccer draw hazards (`Match Draw` `70.37%`, `BTTS` `55.00%`).
   - **Takeaway:** High-noise sports/props must pass a **Refinery Covariate Gate** (SearXNG lineup/injury dig + Clef relevance $\ge 0.60$ + Clairic covariate lift $\Delta\text{MASE} < 0$) AND a **Forecaster Conviction Gate** (`3/3 unanimous` + Von margin confidence $\ge 0.35$ + Expected Edge $\ge 8\text{¢}$) before entering the actionable picks tier.
3. **Lesson 3 — `polymarket.us` Needs Horizon Partitioning & Dedicated BBO/Settlement Parsing:**
   All 94 `polymarket.us` markets in `rolling_ledger` have `resolved_scored = 0` because many are medium/long-dated CFTC contracts or settled via `settlementPx` / `STATE_SETTLED` states that weren't backfilled when closed. Separating **Fast-Resolving ($\le 48\text{h}$)** from **Macro/Futures ($>48\text{h}$)** and running a dedicated US settlement reconciler in Refinery fixes this blind spot.
4. **Lesson 4 — Strike-Ladder & Cross-Exchange Arbitrage Is Untapped:**
   Our ledger already tracks multi-strike ladders (e.g. `bitcoin-above-74k`, `76k`, `78k`, `80k`, `82k`, `84k`, `86k` on Oct 23/24). Applying `statistical-arb-timesfm`'s **Kalman Filter dynamic hedge ratio**, **monotonicity violation check** ($P(S > K_1) \ge P(S > K_2)$ for $K_1 < K_2$), and **Ornstein-Uhlenbeck spread Z-score** unlocks risk-bounded statistical arbitrage across strike ladders and `.com` vs `.us` pairs.
5. **Lesson 5 — ETS v2 G2 Band Undercoverage (84/100 vs [88,98]%) Requires Split-Conformal Quantiles:**
   Grid-searched damped-trend Holt ETS shrinks `residual_sd` on short noisy series (ratio `0.877`). Stage 2 Cascade's split-conformal calibration (`timesfm_clairic_clef.py`) and `timesfm3-studio`'s rolling quantile-sigma anomaly detector solve this without falsifying pre-registered gates.
6. **Lesson 6 — Cloudflare Clef Latency (~18.6s) Demands Decoupled Async Refinement:**
   Per `rmax-ai/jev-vs-clef`, live `@cf/cloudflare/clef` calls take ~18.6s on Workers AI due to batch queueing. Therefore, **interactive UI exploration on `forecaster.systems-a.workers.dev` and `steadyorbitsystems.com/forecasts/` must read pre-refined D1/KV/WAE state in $<50\text{ms}$**, while **`refinery.systems-a.workers.dev`** runs asynchronous SearXNG + Clef + Clairic refinement jobs (with `jevgrep` SHA-256 caching and `clef-model-router` hysteresis so unchanged states cost 0ms).
