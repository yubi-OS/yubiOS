# PRD: Unified `/forecasts/` End-to-End Forecasting, Data Refinement & Betting Recommendations Workstation

- **Author:** Shant Tchatalbachian (`yubi-OS` / Steady Orbit Systems)
- **Date:** 2026-10-28
- **Status:** Approved & In Execution
- **Canonical Surface:** `https://steadyorbitsystems.com/forecasts/` (`https://steady-orbit.systems-a.workers.dev/forecasts/`)
- **Consolidated Legacy Surfaces:** `/forecasts/forecaster/` and `/forecasts/refinery/` now route into the unified `/forecasts/` workstation (deep-linking to their respective workflow stages while keeping the entire 4-stage pipeline in one cohesive single-page experience). The standalone Sauna `forecaster` app (`forecaster-war2dyd2.sauna.new`) is retired and soft-deleted.

---

## 1. Executive Summary & Objective

Previously, the Steady Orbit forecasting stack was split across four disconnected surfaces:
1. `/jev/` Diagnostics -> **Timeseries & Forecast** (`tab-btn-ts`), which showed an architecture diagram and single-series WAE telemetry controls.
2. `/forecasts/` (WAE & Forecasts Hub), which showed top-level WAE KPIs, a static scoreboard, and a basic text JSON sandbox.
3. `/forecasts/refinery/` (5-Stage Data Refinery Studio), which ran Zer0Fit resampling, Clairic query-span extraction, DAG Search dig, System-One flood gate, 9-type covariate extraction, $3\sigma$ glitch scrubbing, and 3-fold rolling-origin $\Delta\text{MASE}$ backtests in isolation.
4. `/forecasts/forecaster/` (Forecaster Terminal), which rendered the 60fps Accuracy $\times$ Certainty $\times$ Edge distribution map, 2D density grid, market cloud, Kalman strike-ladder scanner, and What-If sliders in a separate React bundle with no direct betting recommendation sizing.

**This PRD specifies the unified `/forecasts/` End-to-End Workstation**, merging `/forecasts/`, `/forecasts/forecaster/`, and `/forecasts/refinery/` into a single, human-friendly, mathematically rigorous application that walks the operator from the `/jev/` Diagnostics -> Timeseries & Forecast flow diagram all the way through data ingestion, 5-stage covariate refinement, 60fps distribution & calibration mapping, and **full Kelly-sized betting recommendations**.

---

## 2. End-to-End User Journey (From `/jev/` Diagram to Actionable Bet Picks)

The user experience is structured as a continuous, 4-stage guided pipeline that mirrors the interactive SVG architecture diagram in `/jev/` (**Diagnostics -> Timeseries & Forecast**) and at the top of `/forecasts/`:

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  /jev/ Diagnostics -> Timeseries & Forecast Interactive Pipeline Diagram                 │
│  [Stage 1: WAE Ingest] ──► [Stage 2: 5-Stage Refinery] ──► [Stage 3: 60fps Map & Lab]    │
│           ▲                                                          │                   │
│           └────────────── [Stage 4: Betting Recommendations & Arb] ◄─┘                   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: WAE Telemetry, 15m Cron Monitor & 4-Path Scoreboard (`/forecasts/?stage=ingest`)
- **Purpose:** Verify live data freshness, inspect dual-exchange ingestion velocity (`polymarket.com` CLOB trades + `polymarket.us` CFTC BBO/settlements), and compare 4-path accuracy (`Consensus`, `Cascade`, `Holt ETS v2`, `Clairic-alone`) across domains, market structures, exchanges, and priority tiers.
- **Interactive Controls:**
  - Live 15-minute cron status strip (`lastRunPt`, `totalRuns`, `new_trades_ingested`, `wae_writes`, `wae_dropped: 0`, `remaining_provisional_open: 0`) with one-click **Run 15m Ingest & Forecast Pass Now** (`POST /api/jev/forecaster/cron/run`) and **Sync WAE SQL Summary** (`POST /api/jev/forecaster/wae/sync`).
  - Interactive 48-hour WAE ingestion velocity canvas chart (trades/hour + active markets/hour + notional USD volume).
  - Multi-view 4-Path Scoreboard (switchable between **By Domain Category**, **By Market Structure**, **By Exchange (.com vs .us)**, **By Priority Tier (T1-T3)**, and **Domain Playbooks**).
  - Live WAE `imported` trade stream table: clicking any trade row pins that market into the **Active Market Workbench Bar** and lets the user jump straight to Stage 2 (Refine) or Stage 4 (Bet Analysis).

### Stage 2: 5-Stage Data Refinery Studio (`/forecasts/?stage=refinery` & `/forecasts/refinery/`)
- **Purpose:** Turn sparse, noisy, or glitch-contaminated series into covariate-verified trajectories before trusting a forecast or placing a bet.
- **Sub-Views & Interactive Controls:**
  1. **5-Stage Pipeline Workbench:**
     - **Stage 2.1 (Zer0Fit Resampler + 0-ms Gaussian Prior):** Resamples irregular CLOB fills into causal `5m` / `15m` / `1h` VWAP bars ($\le 15,360$ context points) and computes an analytical Gaussian drift-diffusion prior fan ($Q_{10}, Q_{50}, Q_{90}$).
     - **Stage 2.2 (Clairic Verbatim Query Span & DAG Search Dig):** Extracts zero-hallucination byte-offset spans from the market question and dispatches parallel search lanes through the internal DAG Search Proxy.
     - **Stage 2.3 (System-One Flood-Suppressed Reranker):** Applies the `0.55` relevance floor (escalating to `0.65` when weak passages $\in (0.55, 0.65)$ exceed 32 without a $\ge 0.82$ anchor) and deduplicates URLs.
     - **Stage 2.4 (9-Type Clairic Covariates & $3\sigma$ Quantile-Sigma Glitch Scrubber):** Extracts typed covariates (`number`, `datetime`, `estimate`, `forecast`, etc.) and scrubs isolated 1-tick price spikes where $|y_t - Q_{50}| / \hat{\sigma} > \tau_\sigma$ with $\hat{\sigma} = (Q_{90} - Q_{10}) / (2 \times 1.28155)$, while preserving sustained regime shifts.
     - **Stage 2.5 (3-Fold Rolling-Origin $\Delta\text{MASE} < 0$ Lift Gate & WAE Commit):** Evaluates ridge-regularized covariate lift ($\Delta\text{MASE} = \text{MASE}_{\text{cov}} - \text{MASE}_{\text{uni}} < 0$), runs the 3-Stage Cascade + Holt ETS + Clairic-alone forecast, and commits verified refinements via `POST /api/jev/refinery/commit`.
     - **Interactive Dual-Series + Fan Canvas Chart:** Plots raw trade ticks (dashed rose showing glitches), scrubbed & resampled VWAP bars (solid teal), and the 4-path forecast fan ($Q_{10}\text{--}Q_{90}$ indigo confidence band).
  2. **Sparse & High-Variance Sports Triage Queue (`/api/jev/refinery/queue`):** Lists open markets needing covariate enrichment with one-click **Load into 5-Stage Studio**.
  3. **Direct DAG Search & Flood-Gated Passage Ranker (`/api/jev/refinery/dig`).**
  4. **Domain Playbooks & 6/6 Falsification Gate Runner (`/api/jev/refinery/playbooks` & `/api/jev/refinery/selftest`).**

### Stage 3: 60fps Distribution Map, Calibration & What-If Lab (`/forecasts/?stage=distribution` & `/forecasts/forecaster/`)
- **Purpose:** Explore the entire 4,525+ market universe at 60fps across any grouping, model path, time window, and counterfactual shock.
- **Two Independent Master Switches + Dataset Filters:**
  - **Switch 1 (Grouping Axis):** Group by **Category** (`Domain`, `Market Structure`, `Priority Tier`, `Exchange .com vs .us`, `3-Path Agreement`) or **Time Window** (`Cohort Day`, `6-Hour Window`, `2-Hour Window`, `Lead-Time to Close`, `WAE Ingest Window`).
  - **Switch 2 (Model Path):** Switch instantaneously between `Consensus (3-Path)`, `Cascade (Clairic -> TimesFM -> Clef)`, `ETS (Damped-Trend Holt v2)`, and `Clairic-alone`, plus a **4-Path Overlay** toggle and **Actionable Alpha Gate** toggle.
  - **Edge & Horizon Filters:** Toggle `Realized Edge (Win% - Market%)` vs `Expected Edge (Certainty% - Market%)`, Pool (`All Pools`, `Rolling Ledger`, `Oct 21-22 Audit`, `Live WAE Series`, `Resolved Only`), and Horizon (`All`, `Fast-Close <=48h`, `Long Futures >48h`).
- **Four Interactive Visual Sub-Tabs:**
  1. **Group Distribution Bubble & Vector Map (SVG):** X = Model Certainty ($50\%\text{--}100\%$), Y = Resolved Accuracy ($45\%\text{--}100\%$), Bubble Radius $\propto \sqrt{N}$, Color = Edge, Hollow Diamond + Vertical Stem = Market Implied Entry % to Realized Accuracy % vector, Calibration Diagonal ($y = x$), and Shaded Positive-Alpha Zone ($y > x$). Includes right-hand Group Inspector and ranked Accuracy vs Certainty bars.
  2. **2D Certainty $\times$ Edge Joint Density Heatmap:** 6 Certainty bands $\times$ 5 Expected Edge bands showing Resolved Win %, Realized Edge (pp), and sample counts ($n_{\text{resolved}} / n_{\text{total}}$) per cell.
  3. **Per-Market Cloud Scatter & Marginal Calibration Histograms:** 900-point interactive scatter cloud (Certainty % vs Expected Edge pp colored by Won / Lost / Open) plus Calibration Curve by Certainty Decile and Expected Edge Distribution histograms.
  4. **What-If Covariate Shock Sandbox (`/api/jev/forecaster/scenario/what-if`):** Interactive sliders for Perturbation Operator (`ADD`, `MULTIPLY`, `SET`), Shock Magnitude ($-25\text{pp}$ to $+25\text{pp}$), and Horizon ($4$ to $24$ steps), rendering a live counterfactual trajectory fan with $Q_{10}\text{--}Q_{90}$ bands.
- **Market-Level Drill-Down Explorer Table:** Searchable, group-filterable table of markets with one-click **Pin Market**, **Send to Stage 2 Refinery**, and **Open in Stage 4 Bet Desk**.

### Stage 4: Actionable Betting Recommendations & Kalman Arbitrage Desk (`/forecasts/?stage=recommendations`)
- **Purpose:** Convert calibrated 4-path probabilities, empirical regime accuracy, orderbook spreads, and multi-rung strike ladders into concrete, risk-graded betting recommendations with explicit position sizing and gate transparency.
- **Interactive Bankroll & Risk Controls:**
  - **Bankroll Input ($):** Default `$1,000` (adjustable `$100` to `$100,000`).
  - **Kelly Sizing Mode:** `Quarter-Kelly (0.25x, Conservative Default)`, `Half-Kelly (0.50x, Balanced)`, or `Full Kelly (1.00x, Aggressive)`, with a hard per-contract cap (default `5.0%` of bankroll).
  - **Minimum Edge Filter:** Adjustable slider (`+2.0pp` to `+15.0pp`, default `+3.5pp`) and Domain / Exchange / Horizon filters (`All`, `Fast-Close <=48h`, `Crypto Ladders`, `Esports`, `Soccer`, `Macro & US`).
  - **Include High-Edge Competitive Contracts:** Toggle between **Strict Tier-A Picks Only** (all 5 gates green) and **All Positive-EV Candidates** (including Tier-B Watchlist contracts that need a Stage 2 Refinery covariate check).
- **5-Gate Recommendation Engine & Cards/Table:**
  - Every candidate open market is scored through 5 explicit gates:
    1. **G1 · Trajectory Depth (`n >= 8`):** Must have $\ge 8$ real trade/BBO observations and an active `timesfm-2.5-200m` or `timesfm-3.0-330m` model.
    2. **G2 · 3-Path Agreement & Von Margin:** Requires `3/3 unanimous` agreement across Cascade, ETS, and Clairic (or `2/3 majority` with scale-invariant Von Margin Confidence $C = \frac{K \cdot p_{\max} - 1}{K - 1} \ge 0.45$).
    3. **G3 · Empirical Regime Shrinkage Calibration:** Combines raw model certainty $p_{\text{raw}}$ with the domain $\times$ structure empirical win rate $A_{\text{emp}}$ via shrinkage weight $w = \min(0.85, \max(0.50, \frac{n}{n + 25}))$:
       $$p_{\text{cal}} = w \cdot p_{\text{raw}} + (1 - w) \cdot \min(p_{\text{raw}}, A_{\text{emp}})$$
       This prevents raw 99% model extrapolations in noisy sports markets from inflating Kelly stakes.
    4. **G4 · Net Expected Edge Gate:** Net calibrated edge over market entry/ask price $q$ after half-spread cost $\frac{1}{2} s$:
       $$\text{Edge}_{\text{net}} = \left(p_{\text{cal}} - q - \frac{s}{2}\right) \times 100 \ge \text{MinEdge}_{\text{playbook}}$$
    5. **G5 · Fractional Kelly Sizing & EV:**
       $$f^* = \max\left(0, \frac{p_{\text{cal}} - q}{1 - q}\right), \quad f_{\text{rec}} = \min\left(f_{\text{cap}}, \kappa \cdot f^*\right), \quad \text{Stake} = \text{Bankroll} \times f_{\text{rec}}$$
       $$\text{EV}_{\$} = \text{Stake} \times \left(\frac{p_{\text{cal}}}{q} - 1\right), \quad \text{ROI}_{\%} = \left(\frac{p_{\text{cal}}}{q} - 1\right) \times 100$$
  - Each recommendation card & row displays:
    - **Action Badge:** `TIER A · STRONG BET` (all 5 gates pass, 3/3 unanimous, $\text{Edge}_{\text{net}} \ge \text{playbook min}$) or `TIER B · REFINE FIRST` (positive edge but needs Stage 2 covariate verification).
    - **Recommended Side & Contract:** e.g. `BUY YES` or `BUY NO (Not Primary)` with exact market question, exchange badge (`polymarket.com` / `polymarket.us`), close time, and direct market link.
    - **Probability & Edge Breakdown:** Market Price ($¢$), Raw 3-Path Probabilities (`Cas` / `ETS` / `Cl` / `Cons`), Shrinkage-Calibrated Win Prob ($p_{\text{cal}}$), Net Expected Edge ($+\text{pp}$), and Von Margin Confidence ($C$).
    - **Position Sizing:** Recommended Stake ($\$$ and $\%$ of bankroll), Expected Profit ($+\$$), Expected ROI ($+\%$), and Breakeven Win Rate.
    - **Plain-Language Thesis & One-Click Actions:** Human-readable explanation of *why* the edge exists, plus **Verify in Stage 2 Refinery** (pre-fills the market into Stage 2 and runs a live DAG Search + Clairic covariate lift check) and **Inspect in Stage 3 Map**.
- **Recursive Kalman Filter ($\beta_t$), OU Half-Life & Strike-Ladder Monotonicity Arbitrage Scanner:**
  - Directly below the Kelly Bet Desk in Stage 4, scans multi-rung price ladders (e.g. BTC/ETH strike ladders) and cross-exchange pairs for monotonicity violations (where a higher strike trades at a higher `Yes` price than a lower strike) and spread Z-score divergences ($|Z| \ge 2.0$) with OU mean-reversion half-life in bars.

---

## 3. Affiliated `/api/jev/*` Endpoints & Data Contracts

All endpoints live on `steady-orbit` (`https://steadyorbitsystems.com` / `https://steady-orbit.systems-a.workers.dev`) and require the Operator Bearer key (`Authorization: Bearer <JEV_API_KEY>`, automatically injected by the shared `#sos-operator-auth-dlg` fetch wrapper on `/forecasts/*` and `/jev/`).

| Method & Path | Console Funnel ID | Purpose & Response Contract |
|---|---|---|
| `GET /api/jev/forecaster/dashboard` | `forecaster.dashboard` | Returns the live merged dataset (`forecaster:dashboard-v1` + `forecaster:cron-delta-v1` + `forecaster:wae-summary-v1`): `{ ok, generatedAtUtc, counts: { totalMarkets, totalForecasted, totalResolved, totalOpen, totalWaeImported, unforecastedWae }, overall, byExchange, byTier, byDomain, byStructure, waeMeta, accuracyHistory, cronState, markets[] }`. |
| `GET / POST /api/jev/forecaster/recommendations` | `forecaster.recommendations` | **NEW:** Computes ranked Tier-A and Tier-B betting recommendations + strike-ladder arbitrage signals from the live open market pool (`n >= 8`). Accepts `{ bankroll?: number, kellyMultiplier?: number, maxBankrollPct?: number, minEdgePp?: number, exchange?: string, domain?: string, horizon?: string }`. Returns `{ ok, generatedAtUtc, params, summary: { totalOpenEvaluated, tierACount, tierBCount, totalRecommendedStakeUsd, totalExpectedProfitUsd, weightedExpectedRoiPct, meanCalibratedEdgePp }, recommendations[], ladderArbitrage[] }`. |
| `GET /api/jev/forecaster/cron/status` | `forecaster.cron_status` | Returns 15-minute Cloudflare cron state (`cursorCom`, `cursorUs`, `cursorUsRes`, `totalRuns`, `totalTradesIngested`, `lastRunPt`) and last 20 run reports. |
| `POST /api/jev/forecaster/cron/run` | `forecaster.cron_run` | Triggers an immediate dual-exchange ingest + overflow-safe WAE write + `n >= 8` 3-path forecast + `.com`/`.us` resolution & Brier grading pass. |
| `GET /api/jev/forecaster/wae/live` | `forecaster.wae_live` | Returns live WAE `imported` summary and recent trades. |
| `POST /api/jev/forecaster/wae/sync` | `forecaster.wae_sync` | Forces a fresh ClickHouse WAE SQL aggregation (`?fresh=1`) and updates `forecaster:dashboard-v1.waeMeta` and `forecaster:wae-summary-v1`. |
| `POST /api/jev/forecaster/forecast-open` | `forecaster.forecast_open` | Runs a high-batch (`comBatchSize: 24`, `usBatchSize: 12`) ingest and forecast pass to upgrade open series. |
| `GET /api/jev/forecaster/arbitrage/ladders` | `forecaster.arbitrage_ladders` | Returns Kalman $\beta_t$, OU half-life, spread Z-scores, and monotonicity violations across price-strike ladders. |
| `POST /api/jev/forecaster/scenario/what-if` | `forecaster.what_if` | Runs counterfactual covariate perturbations (`add`, `multiply`, `set`) over horizon $H$ and returns baseline vs shocked trajectories + split-conformal bands. |
| `GET /api/jev/timeseries/wae-summary` | `timeseries.wae_summary` | Queries WAE `imported` and `jev` datasets via ClickHouse SQL (`AE_SQL_TOKEN`) and returns merged scoreboard, hourly velocity, recent trades, and playbooks. |
| `POST /api/jev/timeseries/import` | `timeseries.import` | Imports datapoints (`rows`, `points`, `values`, or `csv`) into WAE dataset `imported` (`TS_IMPORTED`); also serves as the chunked overflow drain for cron runs exceeding 245 rows. |
| `GET /api/jev/timeseries/series` | `timeseries.series` | Lists all series and row counts across WAE datasets `jev` and `imported`. |
| `GET /api/jev/timeseries/selftest` | `timeseries.selftest` | Runs math falsification gates (`G1..G6`), 8-gate cascade selftest (`G1..G8`), WAE write probe, and ClickHouse read-back probe. |
| `GET / POST /api/jev/forecast/:series` | `forecast.series` | Runs damped-trend Holt ETS v2 or 3-Stage Cascade on a named WAE series. |
| `POST /api/jev/forecast/cascade` | `forecast.cascade` | Runs Stage 1 Clairic + Stage 2 TimesFM 2.5->3.0 fallback + Stage 3 Clef gate on caller-supplied values/text. |
| `POST /api/jev/refinery/dig` | `refinery.dig` | Extracts verbatim Clairic query spans, dispatches parallel search lanes via DAG Search Proxy, and applies `jevgrep` flood suppression. |
| `POST /api/jev/refinery/extract` | `refinery.extract` | Runs Zer0Fit resampling, $3\sigma$ quantile-sigma anomaly scrubbing, 9-type Clairic covariate extraction, 3-fold rolling-origin $\Delta\text{MASE}$ lift gate, and 3-path forecast. |
| `POST /api/jev/refinery/resample` | `refinery.resample` | Resamples irregular WAE or inline ticks into regular `5m`/`15m`/`1h` bars with 0-ms Gaussian prior fan. |
| `GET /api/jev/refinery/queue` | `refinery.queue` | Returns priority open markets needing covariate enrichment or sports injury/lineup gating. |
| `POST /api/jev/refinery/commit` | `refinery.commit` | Commits a refined series and covariate-adjusted forecast to KV `refinery:runs-v1` (and updates open market forecast state). |
| `GET /api/jev/refinery/playbooks` | `refinery.playbooks` | Lists deterministic domain refinement playbooks (`crypto-strike-ladder`, `esports-map-series`, `sports-injury-lineup-gate`, `cftc-us-settlement-reconciler`, `macro-rates-earnings`). |
| `GET /api/jev/refinery/selftest` | `refinery.selftest` | Executes the 6 pre-registered Refinery falsification gates (`G1_SPAN_EXTRACTION`, `G2_FLOOD_GATE`, `G3_RESAMPLER_PRIOR`, `G4_SIGMA_SCRUBBER`, `G5_COVARIATE_LIFT`, `G6_VON_MARGIN`). |

---

## 4. UI/UX & Frontend Engineering Standards (`frontend-ui-engineering`)

1. **First-Class Light & Dark Theme Parity:**
   - Top navigation bar includes a theme switch (`☀ Light` / `☾ Dark`, `Shift+Click` resets to system default) sharing `localStorage["jev_theme"]` with `/jev/`.
   - All surfaces, cards, tables, badges, inputs, segmented buttons, SVG diagrams, and HTML5 canvases read theme-aware tokens so neither dark-rgba muddiness in light mode nor low-contrast text in dark mode ever occurs.
2. **Guided 4-Stage Pipeline Bar + Deep-Link Routing:**
   - The top pipeline bar shows numbered stages `01 WAE Ingest & Scoreboard` -> `02 5-Stage Data Refinery` -> `03 60fps Distribution & Calibration Map` -> `04 Betting Recommendations & Arbitrage Desk` with live status pills on each stage.
   - URL state (`?stage=ingest|refinery|distribution|recommendations&conditionId=...`) is synced via `history.replaceState` so deep links from `/jev/` Diagnostics (`#forecast-card` SVG nodes & triad cards) and bookmarks to `/forecasts/forecaster/` (defaults to `distribution` or `recommendations`) and `/forecasts/refinery/` (defaults to `refinery`) open the exact intended stage immediately.
3. **Persistent Active Market Context Drawer:**
   - Selecting any market in any stage pins it in a sticky context bar showing Question, Exchange, Entry Price, 4-Path Picks, Calibrated Edge, and one-click stage jumpers (`Refine Series in Stage 2`, `Locate in Stage 3 Map`, `Size Bet in Stage 4`).
4. **Zero External Framework Bloat & Deterministic Rendering:**
   - Self-contained, zero-CDN-runtime vanilla ES2022 + SVG + HTML5 Canvas bundle served directly from `website-v19/forecasts.html` (and aliased to `forecasts-forecaster.html` and `forecasts-refinery.html`), eliminating external `esm.sh` React network waterfalls and rendering instantaneously at 60fps.
5. **Accessibility & Keyboard Navigation (WCAG 2.1 AA):**
   - Full `<button>` semantics, `role="tablist"` / `role="tab"` / `aria-selected`, keyboard shortcuts (`1`–`4` or `Alt+1..4` for stages), focus-visible rings, and clear empty/loading/error states.
