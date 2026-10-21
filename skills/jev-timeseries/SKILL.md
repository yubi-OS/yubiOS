---
name: jev-timeseries
description: "Run and extend the time-series layer on the steady-orbit worker: Workers Analytics Engine storage for jev events (task_state, task_terminal, corpus_run, approval series), deterministic ETS forecasting via /api/jev/forecast/<series>, the series inventory and selftest routes, and the falsification-gated jev-forecast-math module. Use when forecasting a jev series, adding a new series write site, debugging the WAE SQL read path, or calibrating the forecaster. Triggers on 'jev forecast', 'time series', 'WAE', 'analytics engine', 'ets forecast', 'series inventory'."
---

# jev-timeseries

Time-series substrate for the /jev/ ecosystem: Workers Analytics Engine (WAE) is the trajectory tier (D1 stays the append-only system of record), and a deterministic damped-trend ETS forecaster runs in-worker. Forecasts are advisory (noul-style), never gate-authorizing.

## Routes (all bearer-gated via the operator key)

- `GET /api/jev/timeseries/selftest` — math falsification gates (G1-G6) + `cascade_selftest` (8/8 pre-registered gates G1..G8 PASS) + WAE write/read-back probe + schema probe (`meta.columns`, `has_timestamp`). Returns top-level `ok:false` honestly while the pre-registered ETS v2 G2/NEG_G2 gates fail (`cascade_selftest.ok` is `true`).
- `POST /api/jev/timeseries/import` (writes datapoints `values`/`points`/`rows`/`csv` into the dedicated WAE dataset `imported` via binding `TS_IMPORTED`, ordered by `timestamp ASC, double2 ASC`), `GET /api/jev/timeseries/series` — inventory: `SELECT index1 AS series, COUNT() AS n, MIN(timestamp), MAX(timestamp) FROM jev GROUP BY index1`.
- `GET /api/jev/forecast/:series?h=5` — SQL read (last 1000 points) → `etsForecast` (default) or `runCascadePipeline` when `&engine=cascade` (and optional `&live_clairic=1`) is passed. Default response: `{series, n, history_last30, forecast[], band[], quality:{insufficient_series, low_r2, holdout_sse, holdout_r2, residual_sd, alpha, beta, flags[]}, source:"wae"}`. Fail-closed errors: `503 MISSING_READ_TOKEN`, `422 BAD_SERIES_NAME` (`^[a-z_]+$`), `502 WAE_SQL_ERROR` (truncated upstream body).
- `POST /api/jev/forecast/:series` — 3-stage SCAMPER cascade (`jev-cascade-forecast.js`, Python source of record `tools/timesfm-clairic-clef/timesfm_clairic_clef.py`, parity max |delta| <= 1.42e-14 on 4 fixtures): accepts `{values?, state_text?, past_covariates?, future_covariates?, peer_series?, horizon?, season_len?, action_threshold?, commercial_mode?, live_clairic?, live_clef?}` (or reads WAE when `values`/`state_text` omitted). Runs Stage 1 (`@cf/cloudflare/clairic` extraction, byte-offset spans, and 99-quantile short forecast), Stage 2 (TimesFM 2.5 Apache-2.0 primary with split-conformal calibration and pre-registered rolling-origin fallback gate to TimesFM 3.0 on MASE, coverage, covariate R² >= 0.20, or variate coupling), and Stage 3 (`@cf/cloudflare/clef` bounded decision + deterministic fail-closed gate + `/api/jev/map/outcomes` pre-registration with `verdict: "pending"`).

## Series schema (WAE dataset `jev`)

One datapoint per event: `index1` = series name, `blob1..3` = ids/dimensions, `double1` = primary value, `double2` = secondary.

| series | blob1 | blob2 | blob3 | double1 | write site |
|---|---|---|---|---|---|
| `task_state` | task_id | from_state | to_state | 1 | wrapped `deps.transit` (jev-main buildDeps) |
| `task_terminal` | task_id | tool | terminal_state | 1 (cost_usd when present) | same wrapper, terminal states only |
| `corpus_run` | run_id | kind | policy_version | level_dbc ?? dbc ?? 0 | inside `recordRun` (jev-corpus-routes) |
| `approval` | approval_id | task_id | created/approved/rejected | 1 | `createApproval` + approve/reject legs (jev-review) |

`tsWrite(env, series, {blobs, doubles})` swallows every error (`console.warn("ts_write_failed", ...)`) — telemetry must never break orchestration. `writeDataPoint()` is fire-and-forget.

## Forecaster contract (jev-forecast-math.js, pre-registered)

Damped-trend Holt, NO seasonality (v1; jev series are irregular event counts). Grid: alpha, beta over {0.05..0.95 step 0.05} (19×19), phi 0.98, holdout = last 20% (min 2), tie-break alpha-outer/beta-inner ascending strictly-lower SSE. Band = 1.96 × residual_sd × sqrt(i). Flags: `insufficient_series` (n<8 → forecast null), `low_r2` (holdout R² < 0.5). Exports: `etsFit`, `etsForecast`, `etsSelfTest`. Python source of record: `yubi-OS/yubiOS` `tools/forecast-standard/forecast_ets.py` (parity max |Δ| = 0 on 4 fixtures).

## Falsification gates (live-verified 2026-10-08)

G1 trend recovery PASS, G3 determinism PASS, G4 insufficient PASS, G6 flat sanity PASS, G5 parity PASS (run offline; in-worker reports `pass:null` honestly). **G2 band coverage FAIL 84/100 vs pre-registered [88,98]%** — grid-selected residual_sd shrinks on short noisy series (mean ratio 0.877). v1 ships flagged band-undercover; v2 fix (train-only residual_sd or pre-registered inflation factor) is a future major bump. Never retune the gate to pass.

2026-10-11: the live selftest still returns `ok:false` on G2 and NEG_G2. That is by design until a pre-registered gate passes. See the Forecast v4 section for the pre-registered next version, which is not wired.

## Deploy lessons (2026-10-08, etag chain 7f8fa641 → dda2f487 → f0c6d7c7 → f2313fa6)

1. **secret_text bindings surface as plain strings** — `env.AE_SQL_TOKEN` is a string, NOT a `.get()` object (that's the secrets_store_secret shape). The module handles both: `typeof t === "string" ? t : await t.get()`.
2. **WAE SQL time column is `timestamp`** (the `SELECT *` schema probe settles it) — BUT `ORDER BY` on a column NOT in the SELECT list fails 422 "unable to find type of column". Always include the column in SELECT (`SELECT timestamp, double1 ... ORDER BY timestamp`). Docs' `_timestamp` variants do not exist; `SELECT * FROM jev LIMIT 1` + the selftest's schema probe is the empirical arbiter.
3. The `-F=x` curl arg form mangles the multipart metadata field (CF 10021 "Could not read content for part 'metadata'") — use separate `-F` + value array entries.
4. WAE SQL reads lag writes a few seconds — the selftest reports `wae_read_back ok=true` with an honest "0 rows read back; propagation lag" note instead of failing.
5. Testing no-auth paths through the Sauna proxy requires `X-Sauna-Connection-Id: none` — passing the operator connection injects the bearer on EVERY fetch and contaminates the 401 check.

## Forecast v4 (pre-registered, not wired, 2026-10-11)

Forecast v4 is pre-registered and is not wired into any route. The live forecast route and the timeseries selftest keep the v2 band. Rules for v4:

- `quality.calibrated` stays `false` until a pre-registered gate passes on the live series. Never set it to true by hand.
- The timeseries selftest reports `ok:false` by design while G2 and NEG_G2 fail. Do not treat `ok:false` as a deploy failure, and do not change the gates to make it pass.
- The v4 harness and its results are not part of the 2026-10-11 source record (`tools/steady-orbit-worker/2026-10-11/`). Do not describe the forecast as calibrated in a console, a report, or a demo.
- Wiring v4 into `/api/jev/forecast/:series` is a deploy decision, made after the pre-registered gate is recorded. Record the gate result first.

## Console

Forecast card lives in the /jev/ Corpus tab (KV `jev-index.html`, class prefix `jevfc-`, sibling of the spectral card): series selector, engine selector (`cascade` = 3-stage Clairic + TimesFM 2.5->3.0 + Clef vs `ets` = damped-trend Holt v2), Live Clairic checkbox (`&live_clairic=1`), horizon input, stat tiles (n points, last value, forecast ± band, source, plus active model, MASE/PICP_80, Clef choice, gate disposition, and outcomes pre-reg in cascade mode), quality chips only when set, collapsed raw JSON. Auth = sessionStorage `jev_key` (taste-card pattern).

## Examples

**Forecast a series:** `GET /api/jev/forecast/task_terminal?h=5` with the operator bearer → inspect `quality.flags` before trusting `forecast[]` (`insufficient_series` when n<8, `low_r2` when holdout R² < 0.5).

**Add a series write site:** import `tsWrite` in the owning module, call after the D1 write with the schema table above, add the series name to the console selector and this SKILL.md table. Never block the request path on the write.

**Settle a column question:** run the selftest and read `wae_schema_probe` — the live `SELECT *` column list beats any doc.

## Guidelines

1. D1 is the system of record; WAE is the disposable trajectory tier (3-month retention, sampling on high-volume indexes — not expected at jev volume).
2. Forecasts advise, never authorize. A forecast that feeds a gate decision must first record a {predicted, realized} pair into the outcomes ledger.
3. Any gate change is a pre-registered amendment, never a post-hoc loosening (falsification-corpus skill).
4. Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.

## WAE SQL Export & 3-Stage Clairic-TimesFM-Clef Cascade API (2026-10-21)

- **WAE Time-Series Export (`jev-timeseries-export.js`):**
  - `GET /api/jev/timeseries/export?from=<iso>&to=<iso>` (`/timeseries.export` in the `/jev/` prompt console): exports bounded rows from the WAE `jev` dataset using `toDateTime('YYYY-MM-DD HH:MM:SS')` ClickHouse SQL comparisons and returns `{ rows, next, from, to, max_rows }`.
- **3-Stage Clairic -> TimesFM 2.5/3.0 -> Clef Cascade (`jev-cascade-forecast.js`):**
  - `POST /api/jev/forecast/cascade` and `POST /api/jev/forecast/:series` (`/forecast.cascade` in the `/jev/` prompt console): runs Stage 1 Clairic span-grounded extraction/short-horizon forecast, Stage 2 TimesFM 2.5 primary kernel with pre-registered rolling-origin fallback gate to TimesFM 3.0 (MASE, PICP_80, covariate coupling, horizon), and Stage 3 Clef bounded decision (`act`, `wait`, `review`, `fallback_ets`) with `/api/jev/map/outcomes` pre-registration payload.
