# jev-timeseries — time-series storage + forecasting for /jev/ (2026-10-08)

Directive: "self ideate a new skill, use memory, I want to explore the timeseriesFM from google-research git and related projects about time series data prediction, source the main papers for it, I want to see where in /jev/ we can incorporate the storage and prediction, maybe https://developers.cloudflare.com/analytics/analytics-engine" → ideate-solo one-pager (winner `jev-timeseries-mvp` 19/20) → "go on all" → full-stack build (4 parallel lanes + advisor, her mid-run CF push reconciled) → deployed + live-verified.

## What shipped

- **WAE storage tier**: new binding `TS` (`analytics_engine`, dataset `jev`) + `secret_text` `AE_SQL_TOKEN` (Account Analytics Read token). Datapoints: `index1` = series, `blob1..3` = ids, `double1..2` = values. Write sites: wrapped `deps.transit` (task_state / task_terminal series), `recordRun` (corpus_run), approval create/approve/reject (approval). `tsWrite` swallows all errors — telemetry never breaks orchestration. D1 stays the append-only system of record; WAE is the disposable trajectory tier (3-month retention, sampling irrelevant at jev volume).
- **Forecast routes** (bearer-gated, fail-closed named errors): `GET /api/jev/timeseries/selftest` (math gates + WAE probe + schema probe), `GET /api/jev/timeseries/series` (inventory), `GET /api/jev/forecast/:series?h=N` (SQL read → ETS forecast with honest quality flags). Module: `jev-timeseries.js` (52nd part) + `jev-forecast-math.js` (53rd).
- **Forecaster**: damped-trend Holt ETS v1 (no seasonality), pre-registered grid (alpha/beta 0.05..0.95, phi 0.98, holdout last 20%), band = 1.96·residual_sd·sqrt(i), flags `insufficient_series` (n<8) / `low_r2`. JS/Python parity max |Δ| = 0 on 4 fixtures. Python source of record: `tools/forecast-standard/forecast_ets.py` (this PR).
- **Console**: Forecast card in the /jev/ Corpus tab (`jevfc-` prefix, spectral-card sibling, sessionStorage `jev_key`), KV byte-verified.
- **Knowledge corpus**: yubi-OS/knowledge PR #334 draft `timesfm-tsfm-landscape` (7 docs + research-db v2, 168/168 results weighted, $0.004 jev) — grounds the TSFM landscape (TimesFM v1 arXiv:2310.10688, 2.0, 2.5 Apache-2.0 200M/16k/quantile-head; Chronos 2403.07815; Moirai 2.0 2511.11698; Lag-Llama 2310.08278; Gift-Eval; WAE docs). Correction recorded in-corpus: arXiv:2411.04095 is NOT the TimesFM 2.0 paper.

## Falsification record

Pre-registered BEFORE measurement (PREREGISTRATION.md + 7 pre-run amendments, zero post-run). Gates: G1 trend recovery PASS (delta −0.105%), G3 determinism PASS (byte-identical), G4 insufficient PASS, G6 flat sanity PASS (max dev 0), G5 JS/Python parity PASS (Δ=0), **G2 band coverage FAIL 84/100 vs pre-registered [88,98]%** — grid-selected residual_sd shrinks on short noisy series (mean ratio 0.877; counterfactual nominal-sd band = 92%). The gate was NOT moved; v1 ships band-undercover flagged via `low_r2`-adjacent honesty in the card + selftest reporting `ok:false`. v2 fix (train-only residual_sd) recorded as a future major bump.

## Deploy chain + live bugs caught (etag 7f8fa641 → dda2f487 → f0c6d7c7 → f2313fa6)

1. CF 10021 "Could not read content for part 'metadata'" — the `-F=x` single-token curl form mangles the multipart field; separate `-F` + value entries work.
2. `secret_text` bindings surface as **plain strings** at runtime (`env.AE_SQL_TOKEN` = string), not `.get()` objects (that's secrets_store_secret shape). First live calls 503'd MISSING_READ_TOKEN because `.get()` threw on a string.
3. **WAE SQL time column empirically = `timestamp`** (selftest `SELECT *` schema probe), but `ORDER BY` on a column absent from the SELECT list fails 422 "unable to find type of column" — include it in SELECT. The `_timestamp` hypothesis (Lane B's doc-based read) is false; the probe is the arbiter. Read-your-writes lag ~seconds; selftest reports honest propagation-lag notes instead of failing.
4. No-auth testing through the Sauna proxy requires `X-Sauna-Connection-Id: none` — passing the operator connection injects the bearer on every fetch (my first 401-check was contaminated; proper run: all three routes 401 clean).

## Concurrency handling

Her own CF push (STYLE-ROUTER round) landed mid-build: fresh bundle re-pulled, advisor re-ported Lane B's hunks onto the NEW `jev-main.js`/`routes-jev.js` (4 + 2 hunks, anchors re-asserted unique), lane C's card re-inserted onto the new KV (CSS anchor moved), and the advisor caught the fresh extraction dropping `fixtures/lens-fixtures.mjs` (recovered byte-identical — a static import would have 10021'd the deploy). Lane B's test suite re-run against the real math module: 44/44.

## Live verification (final etag f2313fa6)

Selftest 200 `ok:true` (G1/G3/G4/G6 pass, G2 honest fail, G5 `pass:null` in-worker, wae_write ok, wae_read_back ok, schema probe lists `timestamp`); series inventory 200 (12 points on selftest_probe); forecast 200 with real numbers (n=12 → forecast 36.09/41.20/46.22 ± band, holdout_r2 0.537); no-auth 401 on all three routes; schedules + 16 bindings intact.

## Phase roadmap (from the ideate-solo)

Phase 2 = self-forecast loop (evolution cycle consumes its own forecasts, {predicted, realized} rows into the outcomes ledger = the visco hysteresis shape). Phase 3 = TimesFM 2.5 (Apache 2.0) offline on the box via the shell bridge for long-horizon + quantile forecasts. Phase 4 = forecast-gated cron budget. None started.
