# Spec & Architecture Plan: The Steady Orbit Forecasting & Data Refinement Triad

Date: 2026-10-25
Author: Shant Tchatalbachian
Target Deployments:
1. **`https://refinery.systems-a.workers.dev`** — Data Refinement, Search-Dig & Covariate Studio Worker
2. **`https://forecaster.systems-a.workers.dev`** — Ultimate Multi-Path Forecasting, Calibration & Arbitrage Terminal Worker
3. **`https://steadyorbitsystems.com/forecasts/`** (`https://steady-orbit.systems-a.workers.dev/forecasts/` + `/api/jev/refinery/*`) — WAE Data & Forecast Hub on the `steady-orbit` Cloudflare Deployment

---

## Phase 0: Capability Map & System Topology

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                       UPSTREAM SOURCES & EXTERNAL INFRASTRUCTURE                                │
│  • Polymarket CLOB (.com Gamma/Data API) & CFTC Exchange (.us Gateway BBO/Settlement)           │
│  • DAG Search Proxy (Northflank searxng-proxy: /webhook/searxng)                                │
│  • Raw CSV / JSONL / Log Uploads & Browser/DOM Extracts (surf-cli / OpenComputerUse format)     │
└──────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. DATA REFINERY WORKBENCH — https://refinery.systems-a.workers.dev                             │
│    Modules: refinery-ingest | refinery-dig | refinery-grep | refinery-clairic | refinery-lift   │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐                   │
│  │ Stage A: Query Span  │→ │ Stage B: Flood Gate  │→ │ Stage C: 9-Type      │                   │
│  │ Clairic verbatim     │  │ jevgrep admission +  │  │ Clairic Covariates + │                   │
│  │ span + SearXNG dig   │  │ Clef relevance >=.55 │  │ Zer0Fit Downsampler  │                   │
│  └──────────────────────┘  └──────────────────────┘  └──────────┬───────────┘                   │
│                                                                 ▼                               │
│  ┌──────────────────────────────────────────────────────────────────────────┐                   │
│  │ Stage D: Quality & Lift Gate (timesfm3-studio)                           │                   │
│  │ • 3-Sigma Quantile Anomaly Scrubber: |y_t - Q50| > 3 * (Q90 - Q10)/2.563 │                   │
│  │ • Rolling-Origin Covariate Lift Gate: admit covariates iff ΔMASE < 0     │                   │
│  │ • Playbook Provenance Cache (surf-cli): SHA-256 state -> 0ms replay      │                   │
│  └──────────────────────────────────────────────┬───────────────────────────┘                   │
└─────────────────────────────────────────────────┼───────────────────────────────────────────────┘
                                                  │ Service Binding (env.STEADY_ORBIT) + REST
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. STEADY-ORBIT CORE & WAE HUB — https://steadyorbitsystems.com/forecasts/                      │
│    (Worker: steady-orbit.systems-a.workers.dev | KV: SITE forecasts.html | D1: sos-agent)       │
│  • WAE Datasets: `imported` (1.20M+ trade rows, 2,866+ series) & `jev` (telemetry/corpus/runs)  │
│  • `/api/jev/forecast/cascade` & `/api/jev/forecast/events` (Clairic → TimesFM 2.5/3.0 → Clef)  │
│  • `/api/jev/forecast/:series` (Damped-Trend Holt ETS v2 + Split-Conformal Calibration)         │
│  • `/api/jev/timeseries/import`, `/api/jev/timeseries/export`, `/api/jev/timeseries/series`     │
│  • `/api/jev/refinery/*` (New unified backend routes for SearXNG + Clef + Clairic refinement)   │
│  • Public/Operator Page `/forecasts/`: WAE Velocity, 4-Path Leaderboard, Live Gate Status       │
└─────────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                  │ Service Binding + /api/dashboard (<50ms)
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. ULTIMATE FORECASTER TERMINAL — https://forecaster.systems-a.workers.dev                      │
│    Upgraded from Sauna App (forecaster-war2dyd2) + 8 Forecasting Reference Repos                │
│  • 60fps Retina Distribution Map: Certainty × Accuracy × Edge (Realized & Expected)             │
│  • Switch 1 (Group By): Category (Domain, Structure, Tier, Exchange) vs Time Window (Cohort/6h) │
│  • Switch 2 (Model Path): Consensus, Cascade, ETS, Clairic-alone + 4-Path Halo Overlay          │
│  • NEW: Von Margin Confidence (n*p_max - 1)/(n - 1) & Split-Conformal 90% Fan Chart             │
│  • NEW: Kalman Filter Dynamic Beta & Strike-Ladder Arbitrage Scanner (statistical-arb-timesfm)  │
│  • NEW: What-If Covariate Shock Sliders (timesfm3-studio) & Actionable Alpha Filter             │
│  • NEW: Dual REST (`/v1/tools/:tool`) + Streamable HTTP MCP (`/mcp`) for Agent Integration      │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Capability Map Table

| Module ID | Owning Surface | Responsibility | Depends On | Source Repos Adopted |
|---|---|---|---|---|
| `wae-refinery-api` | `steady-orbit` (`/api/jev/refinery/*`) | Backend execution of SearXNG digs, Clef batch scoring, Clairic 9-type extraction, and D1/WAE persistence | `steady-orbit` (`AI`, `DB`, `TS_IMPORTED`, `AE_SQL_TOKEN`) | `#02 jev-search`, `#08 jevgrep`, `#13 luandro/clef`, `#14 yubiOS` |
| `steady-forecasts-page` | `steady-orbit` (`/forecasts/`) | Public & operator WAE trajectory explorer, 4-path accuracy scoreboard, and falsification gate monitor in `website-v19` frame | `wae-refinery-api`, `/api/jev/timeseries/*` | `#03 timesfm`, `SamayDashboard`, `#14 yubiOS` |
| `refinery-workbench` | `refinery.systems-a.workers.dev` | Interactive 5-stage data refinement studio: tick resampling, quantile-sigma anomaly scrubbing, SearXNG+Clef+Clairic covariate builder, $\Delta\text{MASE}$ lift gate, playbook cache | `wae-refinery-api` | `#01 surf-cli`, `#02 jev-search`, `#06 OpenComputerUse`, `#07 Zer0Fit`, `#08 jevgrep`, `#10 timesfm3-studio`, `#11 clef-model-router` |
| `forecaster-terminal` | `forecaster.systems-a.workers.dev` | Ultimate 60fps forecasting & market terminal: Dual-Switch distribution map, Von margin calibration, Kalman strike-ladder arbitrage, What-If scenario sandbox, actionable alpha filter | `wae-refinery-api`, `steady-orbit` (`/api/jev/forecast/*`) | `statistical-arb-timesfm`, `#05 docker-predictalot`, `#07 Zer0Fit`, `#09 von`, `#10 timesfm3-studio`, `RayCodes_Timesfm`, `RayCodes_TimesFM3.0`, `forecaster` Sauna app |

**Build Order:** `wae-refinery-api` $\to$ `steady-forecasts-page` & `refinery-workbench` (parallel) $\to$ `forecaster-terminal`.

---

## Phase 1: Assumptions & Hard Constraints

### Surface Assumptions
1. **Cloudflare Account & Subdomain:** Both new workers deploy to account `b57ee20cd90ebc4e4db28728e450a4b8` under the `systems-a.workers.dev` subdomain (`refinery.systems-a.workers.dev` and `forecaster.systems-a.workers.dev`), using connection `conn_pd_apn_1KhdoD7`.
2. **Branding & Terminology Hygiene (per 2026-10-24 `RULES.md`):** Zero user-facing occurrences of internal codenames (`jev`, `n8n`, `google-research`). User-facing UI labels use **Steady Orbit Systems · Data Refinery**, **Steady Orbit Systems · Forecaster Terminal**, **DAG Search Proxy**, **System-One Decision Gate**, and **3-Stage Cascade**. Internal API route prefixes (`/api/jev/*`) remain unchanged for backward compatibility.
3. **Zero Unlicensed / WTFPL Code Vendoring:** Repositories with `NONE` or `WTFPL` licenses (`statistical-arb-timesfm`, `docker-predictalot`, `RayCodes_*`, `rmax-ai/jev-vs-clef`, `luandro/clef`) are used strictly as mathematical and architectural references; every line of Worker JS/TS is authored clean-room.
4. **Latency Isolation:** Because `@cf/cloudflare/clef` has an empirical p50 latency of ~18.6s on Workers AI (`rmax-ai/jev-vs-clef`), no GET route that renders a dashboard (`GET /api/dashboard`, `GET /api/wae/live`) may block on a synchronous Clef call. Live Clef/Clairic calls happen only in explicit Refinery actions (`POST /api/refine/*`) or background cron/sync tasks, backed by SHA-256 content-addressed caching in D1/KV.

---

## Phase 2: Detailed Specification — Surface 1: `refinery.systems-a.workers.dev`

### 2.1 Objective
Turn raw, noisy, or sparse time-series and unstructured web/event streams into **calibrated, anomaly-scrubbed, covariate-enriched time-series** ready for `POST /api/jev/forecast/cascade` and WAE `imported`. Directly solves **Lesson 1** (sparse $<8$ trade series falling back to flat averages) and **Lesson 3** (high-noise sports/props lacking injury/lineup/news context).

### 2.2 The 5-Stage Refinery Pipeline (Combining All Tier-2 & Tier-4 Projects)

1. **Stage 1 — Ingestion & Irregular Tick Resampling (`Zer0Fit` + `RayCodes_TimesFM3.0` prior):**
   - Accepts: (a) a Polymarket `conditionId` / `market_slug` pulled from WAE `imported`, (b) raw CSV / JSONL / log text, or (c) a natural-language market question.
   - **Temporal Downsampler & Gap Resampler (`Zer0Fit` `pipelines.py` pattern):** Inspects raw trade timestamps (`double2` epoch in WAE `imported`), detects sampling cadence (`1m`, `5m`, `15m`, `1h`, `1d`), interpolates missing interior buckets via volume-weighted step-hold, and caps context length at $L \le 15,360$ points (or $1,024$ for fast 2.5 kernel).
   - **0-ms Analytical Prior (`RayCodes_TimesFM3.0` math, honestly labeled):** If $n < 8$ trades exist, computes an immediate closed-form Gaussian drift prior $y_t = y_0(1 + \mu t/H) \pm z_\alpha \sigma \sqrt{t/H}$ labeled `source: "analytical-gaussian-prior"` while flagging the series for Stage 2–4 covariate enrichment.

2. **Stage 2 — Clairic Verbatim Query Span + SearXNG Multi-Lane Dig (`jev-search` + `searxng-proxy`):**
   - **Router Check (`AbelNavarro/clef-model-router` pattern):** Applies `redactSecrets()` and `truncatePrompt()` (75% head / 25% tail) and checks the SHA-256 state cache. If `follow_up` hysteresis indicates no new trade shock or news window change, serves cached covariates in $<5\text{ms}$.
   - **Clairic Query Span (`jev-search` `src/lib/extract.ts` pattern):** Calls `@cf/cloudflare/clairic` with a 1,500ms timeout to copy exact, zero-hallucination keyword spans from the market question (stripping boilerplate like *"Will the price of..."* or *"on October 26?"*).
   - **SearXNG Dig:** Queries `https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?q=<span_query>&format=json` across web, news, and domain-specific lanes.

3. **Stage 3 — Flood-Suppressed Clef Reranking (`jevgrep` + `jev-search` + `luandro/clef`):**
   - Normalizes the question payload via `Object.create(null)` and enforces the 13 MiB / 4-image guard (`luandro/clef`).
   - Evaluates candidate search snippets / log chunks in a single batched `@cf/cloudflare/clef` call (`type: "noul"` on-topic relevance + source reliability).
   - **Jevgrep Flood Suppression (`dzhng/jevgrep` `navigationAdmissions`):**
     $$\text{admit}(x) = \begin{cases} p(x) \ge 0.65 & \text{if } |\{x : 0.50 < p(x) < 0.65\}| \ge 32 \land \neg\text{hasStrongEvidence} \\ p(x) \ge 0.55 & \text{otherwise} \end{cases}$$
   - Deduplicates URLs across search engines and computes freshness decay (`jev-search` `rank.ts`).

4. **Stage 4 — Clairic 9-Type Covariate Extraction & Quantile-Sigma Anomaly Scrubber (`OpenComputerUse` + `timesfm3-studio`):**
   - Feeds admitted snippets + raw state text into `@cf/cloudflare/clairic` using `OpenComputerUse`'s 9 typed fields (`text`, `number`, `date`, `time`, `datetime`, `duration`, `list`, `estimate`, `forecast`). Every extracted value carries byte-offset spans `(start, end)` in the source snippet (or `null` if absent — never fabricated).
   - **Quantile-Sigma Anomaly Scrubber (`timesfm3-studio`):** Computes rolling decile spread $\hat{\sigma}_t = \frac{Q_{90}(t) - Q_{10}(t)}{2 \times 1.28155}$ and flags data spikes where $|y_t - Q_{50}(t)| > 3.0\hat{\sigma}_t$. Distinguishes **data glitches** (isolated 1-tick spikes with zero news corroboration $\to$ winsorized) from **structural regime shifts** (corroborated by a Clairic `datetime` event span $\to$ preserved as a step covariate).

5. **Stage 5 — Rolling-Origin Covariate Lift Gate & Playbook Commit (`timesfm3-studio` + `surf-cli`):**
   - Runs a dual-pass rolling-origin backtest ($K=3$ folds) comparing Univariate MASE ($\text{MASE}_{\text{uni}}$) against Covariate-Augmented MASE ($\text{MASE}_{\text{cov}}$):
     $$\Delta\text{MASE} = \text{MASE}_{\text{cov}} - \text{MASE}_{\text{uni}}, \quad R^2_{\text{cov}} = 1 - \frac{\text{SSE}_{\text{cov}}}{\text{SSE}_{\text{uni}}}$$
   - **Admission Gate:** Covariates are admitted into the production forecast payload iff $\Delta\text{MASE} < 0$ or $R^2_{\text{cov}} \ge 0.20$.
   - Saves the refinement recipe as a deterministic **Refinery Playbook** (`surf-cli` pattern) in D1 (`refinery_playbooks` table) and pushes the cleaned series + covariates to `steady-orbit` (`/api/jev/timeseries/import` and `/api/jev/forecast/cascade`).

### 2.3 `refinery.systems-a.workers.dev` UI Layout (4 Workbench Tabs)
- **Tab 1 · Pipeline Studio:** Interactive 5-stage visual stepper (Ingest $\to$ Search Dig $\to$ Flood Gate $\to$ Clairic Spans $\to$ Lift Verdict) with highlighted byte-offset spans in source snippets and live before/after series chart.
- **Tab 2 · Anomaly & Resampling Inspector:** Interactive time-series canvas showing raw WAE trade ticks vs. `Zer0Fit` resampled bars, with $3\hat{\sigma}$ quantile anomalies highlighted in amber/red and one-click winsorize vs. keep-as-shock toggles.
- **Tab 3 · Search & Passage Grep (`jev-search` + `jevgrep`):** Natural-language search bar with model selector (`Auto`, `Clef 27B`, `Clef-flash 9B`) + time-window pills (`24h`, `7d`, `30d`), showing Clef relevance probabilities, engine agreement badges, and flood-suppression telemetry.
- **Tab 4 · Playbooks & MCP API (`surf-cli` + `OpenComputerUse`):** Saved domain playbooks (`crypto-strike-ladder`, `esports-map-series`, `nba-injury-scrubber`, `cftc-us-settlement`) + live test console for `POST /v1/tools/:tool` and `POST /mcp`.

---

## Phase 3: Detailed Specification — Surface 2: `forecaster.systems-a.workers.dev`

### 3.1 Objective
Build the ultimate high-speed, 60fps multi-path forecasting and prediction-market terminal at `https://forecaster.systems-a.workers.dev`, upgrading every capability of the Sauna `forecaster` app (`https://forecaster-war2dyd2.sauna.new/`) while incorporating the econometrics, calibration, ensembling, and scenario tools from all 18 researched repositories.

### 3.2 Core Upgrades Over the Current Sauna App

1. **Preserved & Enhanced Dual-Switch Distribution Engine:**
   - **Switch 1 (`Group By`):** Category (`Domain Category`, `Market Structure`, `Priority Tier`, `Exchange .com vs .us`, `3-Path Agreement`) vs. Time Window (`Day Cohort`, `6h Window`, `2h Window`, `Lead-Time to Close`, `WAE Ingest Day`), plus a new **Horizon Split Filter** (`Fast-Close <=48h` vs `Long-Dated Futures >48h`) that cleanly separates the 94 long-dated `polymarket.us` markets so active scoreboard accuracy is never distorted by unclosed futures (**fixes Lesson 2**).
   - **Switch 2 (`Model Path`):** `Consensus (Weighted CDF)` | `Cascade (Clairic → TimesFM 2.5/3.0 → Clef)` | `ETS (Damped-Trend Holt + Conformal)` | `Clairic-alone` + **4-Path Halo Overlay** and a new **5th Mode: `Actionable Alpha Filter`** (filters to `3/3 unanimous` + Von Margin Confidence $\ge 0.35$ + Expected Edge $\ge +8.0\text{¢}$ + Covariate-Verified — **fixes Lesson 3**).

2. **Von Scale-Invariant Margin Confidence & Parametric Temperature (`wfzyx/von`):**
   - Replaces naive binary probability certainty on multi-runner events with Von's margin confidence:
     $$\text{conf}_{\text{Von}} = \frac{n \cdot p_{\max} - 1}{n - 1} \in [0, 1]$$
   - Applies parametric temperature scaling $T(H_{\text{norm}}, \text{tokens}, K)$ before computing Expected Edge ($p_{\text{calibrated}} - c_{\text{ask}}$) and fractional Kelly sizing.

3. **Split-Conformal 90% Prediction Fan (`timesfm_clairic_clef.py` + `google-research/timesfm`):**
   - Replaces the uncalibrated Gaussian $\pm 1.96\sigma\sqrt{h}$ band (which under-covered at 84/100 on ETS G2) with **Split-Conformal Quantile Calibration** + non-crossing decile enforcement (`fix_quantile_crossing=True`), achieving guaranteed $[88\%, 98\%]$ holdout coverage (**fixes Lesson 5**).

4. **Kalman Filter Dynamic Beta & Strike-Ladder Arbitrage Terminal (`statistical-arb-timesfm`):**
   - Dedicated **Arbitrage & Ladders** tab running recursive Kalman Filter state updates ($\theta_t = [\alpha_t, \beta_t]^T$) and Ornstein-Uhlenbeck mean-reversion half-life ($t_{1/2} = \ln(2)/\lambda$) across:
     - **Strike Ladders:** e.g. BTC `$74k / $76k / $78k / $80k / $82k / $84k / $86k` on the same expiry — flags any monotonicity violation or spread $|Z| \ge 2.0$ where the TimesFM 3.0 forecast confirms mean reversion.
     - **Cross-Exchange Pairs:** Matched `polymarket.com` vs `polymarket.us` contracts (e.g. NBA/NHL/Macro events listed on both exchanges).

5. **Interactive What-If Scenario Stress-Tester (`timesfm3-studio`):**
   - In the Market Detail drawer, operators can perturb future covariates (`set`, `add`, `multiply` on volume shock, orderbook imbalance, or Refinery sentiment score) via sliders and immediately render the counterfactual 4-path forecast fan alongside the baseline fan.

6. **One-Click "Refine in Refinery" Handoff + Grounded Market Brief (`RayCodes_Timesfm` + `refinery`):**
   - Every market card includes a grounded **Executive Brief** (synthesizing spot price, bid/ask spread, 3-path probabilities, Von confidence, and Clairic spans) and a **"Refine Series ($n<8$ / High Divergence)"** button that deep-links (`https://refinery.systems-a.workers.dev/?conditionId=<cid>`) or triggers `POST /api/jev/refinery/enrich` to replace `wae-empirical-prior` with a SearXNG+Clairic covariate forecast (**fixes Lesson 1 & Lesson 5**).

---

## Phase 4: Detailed Specification — Surface 3: New WAE & Forecasts Hub on `steadyorbitsystems.com` (`steady-orbit` Deployment)

### 4.1 Objective
Add a first-class page at **`https://steadyorbitsystems.com/forecasts/`** (and `https://steady-orbit.systems-a.workers.dev/forecasts/`) plus the backing `/api/jev/refinery/*` and `/api/jev/timeseries/dashboard` API routes on the `steady-orbit` worker, connecting WAE data (`imported` and `jev` datasets) and our Cascade/ETS/Clairic/Clef/SearXNG endpoints into the Steady Orbit v19 site experience.

### 4.2 Routing & KV Integration (Following `steady-orbit-deploy` Skill Rules)
- **`solar-rbs-entry.mjs` update:** Add `['/forecasts', 'forecasts.html']` and `['/forecasts/', 'forecasts.html']` to the `PAGES` map (leaving `LEGACY_TERRITORY` intact so `/api/jev/*`, `/jev`, `/map`, etc. route to `index.js` unchanged).
- **KV `SITE` (`b9de35ecd3ca44999b38cfd107c0d44a`) update:** Raw binary PUT (`--data-binary`, never `json.dumps`) of `forecasts.html` reusing the `website-v19` header, footer, Space Grotesk + Geist + Inter typography, navy + violet orbital palette, and zero internal codenames.
- **New Backend Module `jev-refinery.js` on `steady-orbit` (wired in `routes-jev.js`):**
  - `POST /api/jev/refinery/dig` — Runs Clairic query-span extraction + `searxng-proxy` fetch + `jevgrep` flood-suppressed Clef relevance ranking.
  - `POST /api/jev/refinery/extract` — Runs Clairic 9-type covariate extraction + `Zer0Fit` tick resampling + `timesfm3-studio` $3\hat{\sigma}$ anomaly scrubbing + $\Delta\text{MASE}$ covariate lift backtest.
  - `POST /api/jev/refinery/enrich-market` — End-to-end enrichment of a sparse or high-variance WAE market, updating D1 and triggering a fresh 3-path `/api/jev/forecast/cascade` run.
  - `GET /api/jev/timeseries/wae-summary` — Public-safe cached summary (60s KV TTL) of WAE `imported` velocity (1.20M+ rows, 2,866+ series), 4-path accuracy scoreboard (`oct21_archive` 78.12% + `rolling_ledger` 74.31% + category/structure breakdown), and falsification gate status (`cascade_selftest` 8/8 G1–G8 PASS, ETS G1/G3/G4/G5/G6 PASS, G2 conformal upgrade status) so `steadyorbitsystems.com/forecasts/`, `forecaster.systems-a.workers.dev`, and `refinery.systems-a.workers.dev` can all load live telemetry with zero CORS or token exposure.

---

## Phase 5: API Contracts & Cross-Origin Wiring

| Endpoint | Host | Auth | Method | Request / Response Contract |
|---|---|---|---|---|
| `/api/jev/timeseries/wae-summary` | `steadyorbitsystems.com` / `steady-orbit` | Public read (60s KV cache) or Bearer | `GET` | Returns `{ wae: { totalRows, totalTrades, distinctMarkets, hourlySeries, recentTrades }, scoreboard: { overall, byDomain, byStructure, byTier, byExchange }, gates: { cascadeG1toG8, etsGates } }`. |
| `/api/jev/refinery/dig` | `steady-orbit` & `refinery` | Operator Bearer / Service Binding | `POST` | Input: `{ query, marketSlug?, window?: "day"\|"week"\|"month", model?: "clef"\|"clef-flash" }`. Output: `{ clairicSpans, admittedResults[], suppressedCount, latencyMs }`. |
| `/api/jev/refinery/extract` | `steady-orbit` & `refinery` | Operator Bearer / Service Binding | `POST` | Input: `{ conditionId?, points[], passages[], cadence?: "5m"\|"15m"\|"1h" }`. Output: `{ resampledSeries[], anomalies[], covariates: { past[], future[], spans[] }, lift: { maseUni, maseCov, deltaMase, r2Cov, admitted } }`. |
| `/api/jev/forecast/cascade` | `steady-orbit` | Operator Bearer / Service Binding | `POST` | Existing 3-stage SCAMPER cascade (`jev-cascade-forecast.js`), enhanced to accept Refinery `past_covariates`, `future_covariates`, and return `von_margin_confidence` + split-conformal deciles. |
| `/api/dashboard` | `forecaster.systems-a.workers.dev` | Public / Operator | `GET` | Full 60fps dataset: all `2,913+` markets (with `vonConfidence`, `kalmanZScore`, `ladderArbFlag`, `refineryStatus`), `accuracyHistory`, and `waeMeta`. |
| `/api/arbitrage/ladders` | `forecaster.systems-a.workers.dev` | Public / Operator | `GET` | Returns active strike ladders and cross-exchange pairs with Kalman $\beta_t$, OU half-life $t_{1/2}$, spread $Z$-score, monotonicity violations, and hybrid signal (`BUY_SPREAD` / `SELL_SPREAD` / `HOLD`). |
| `/v1/tools/:tool` & `/mcp` | `refinery` & `forecaster` | Operator Bearer | `POST` | Dual REST + Streamable HTTP MCP server exposing `forecast_univariate`, `forecast_multivariate`, `forecast_scenario`, `scan_anomalies`, `refinery_dig`, and `refinery_enrich_market`. |

---

## Phase 6: Ordered Implementation & Verification Plan

1. **Step 1 — Pull & Backup `steady-orbit` Bundle (`steady-orbit-deploy` skill):**
   - Pull live 77-part bundle (`etag: f9449a54...`) and live `settings` to `session/steady-orbit-predeploy-backup/`.
   - Add `jev-refinery.js` part, wire `/api/jev/refinery/*` and `/api/jev/timeseries/wae-summary` in `routes-jev.js`, and add `/forecasts` $\to$ `forecasts.html` in `solar-rbs-entry.mjs`.
   - Run `node --check` on all parts, multipart PUT to `steady-orbit`, verify cron schedules `["0 * * * *", "*/5 * * * *"]` and all bindings, wait 20s stale window, and verify `/api/jev/health` + `/api/jev/refinery/selftest`.
2. **Step 2 — Publish `forecasts.html` on `steadyorbitsystems.com/forecasts/`:**
   - Upload `forecasts.html` to KV `SITE` (`--data-binary`), delayed re-GET after 15s, byte-compare SHA-256, and visually verify across desktop and mobile viewports.
3. **Step 3 — Deploy `refinery.systems-a.workers.dev`:**
   - Provision Worker `refinery` on account `b57ee20cd90ebc4e4db28728e450a4b8` with bindings `AI`, `DB` (`sos-agent`), `SITE`, `TS_IMPORTED`, `STEADY_ORBIT` (service binding to `steady-orbit`), and `JEV_API_KEY` / `AE_SQL_TOKEN` secrets. Enable `workers.dev` subdomain route `refinery.systems-a.workers.dev`.
   - Live-verify all 4 workbench tabs, `POST /api/refine/dig` (SearXNG + Clef + Clairic), `POST /api/refine/extract` ($\Delta\text{MASE}$ covariate lift), and `POST /mcp`.
4. **Step 4 — Deploy `forecaster.systems-a.workers.dev` & Sync Sauna App:**
   - Provision Worker `forecaster` on account `b57ee20cd90ebc4e4db28728e450a4b8` with bindings `DB` (`sos-agent`), `TS_IMPORTED`, `STEADY_ORBIT`, and `AE_SQL_TOKEN`. Enable `workers.dev` subdomain route `forecaster.systems-a.workers.dev`.
   - Seed all 2,913 markets (`oct21_archive` + `rolling_ledger` + `wae_live_only`) and `accuracy_history` into D1, wire `forecast_and_score.py` to push to both `forecaster.systems-a.workers.dev` and `forecaster-war2dyd2.sauna.new`, and update the Sauna app with the new Von confidence, Kalman arbitrage, What-If sliders, and Refinery deep-links.
5. **Step 5 — End-to-End QA Battery:**
   - Run selftests across all 3 URLs (`refinery.systems-a.workers.dev`, `forecaster.systems-a.workers.dev`, `steadyorbitsystems.com/forecasts/`) and verify visual rendering at desktop and mobile resolutions.
