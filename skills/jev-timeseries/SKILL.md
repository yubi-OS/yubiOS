---
name: jev-timeseries
description: "Run and extend the time-series layer on the steady-orbit worker: Workers Analytics Engine storage for jev events (task_state, task_terminal, corpus_run, approval series), deterministic ETS forecasting via /api/jev/forecast/<series>, the series inventory and selftest routes, and the falsification-gated jev-forecast-math module. Use when forecasting a jev series, adding a new series write site, debugging the WAE SQL read path, or calibrating the forecaster. Triggers on 'jev forecast', 'time series', 'WAE', 'analytics engine', 'ets forecast', 'series inventory'."
---

# jev-timeseries

Time-series substrate for the /jev/ ecosystem: Workers Analytics Engine (WAE) is the trajectory tier (D1 stays the append-only system of record), and a deterministic damped-trend ETS forecaster runs in-worker. Forecasts are advisory (noul-style), never gate-authorizing.

## Routes (all bearer-gated via the operator key)

- `GET /api/jev/timeseries/selftest` — math falsification gates (G1-G6) + WAE write/read-back probe + schema probe (`meta.columns`, `has_timestamp`). Returns `ok:false` honestly when the pre-registered G2 band fails.
- `GET /api/jev/timeseries/series` — inventory: `SELECT index1 AS series, COUNT() AS n, MIN(timestamp), MAX(timestamp) FROM jev GROUP BY index1`.
- `GET /api/jev/forecast/:series?h=5` — SQL read (last 1000 points) → `etsForecast`. Response: `{series, n, history_last30, forecast[], band[], quality:{insufficient_series, low_r2, holdout_sse, holdout_r2, residual_sd, alpha, beta, flags[]}, source:"wae"}`. Fail-closed errors: `503 MISSING_READ_TOKEN`, `422 BAD_SERIES_NAME` (`^[a-z_]+$`), `502 WAE_SQL_ERROR` (truncated upstream body).

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

## Deploy lessons (2026-10-08, etag chain 7f8fa641 → dda2f487 → f0c6d7c7 → f2313fa6)

1. **secret_text bindings surface as plain strings** — `env.AE_SQL_TOKEN` is a string, NOT a `.get()` object (that's the secrets_store_secret shape). The module handles both: `typeof t === "string" ? t : await t.get()`.
2. **WAE SQL time column is `timestamp`** (the `SELECT *` schema probe settles it) — BUT `ORDER BY` on a column NOT in the SELECT list fails 422 "unable to find type of column". Always include the column in SELECT (`SELECT timestamp, double1 ... ORDER BY timestamp`). Docs' `_timestamp` variants do not exist; `SELECT * FROM jev LIMIT 1` + the selftest's schema probe is the empirical arbiter.
3. The `-F=x` curl arg form mangles the multipart metadata field (CF 10021 "Could not read content for part 'metadata'") — use separate `-F` + value array entries.
4. WAE SQL reads lag writes a few seconds — the selftest reports `wae_read_back ok=true` with an honest "0 rows read back; propagation lag" note instead of failing.
5. Testing no-auth paths through the Sauna proxy requires `X-Sauna-Connection-Id: none` — passing the operator connection injects the bearer on EVERY fetch and contaminates the 401 check.

## Console

Forecast card lives in the /jev/ Corpus tab (KV `jev-index.html`, class prefix `jevfc-`, sibling of the spectral card): series selector, horizon input, stat tiles (n points, last value, forecast ± band, source), quality chips only when set, collapsed raw JSON. Auth = sessionStorage `jev_key` (taste-card pattern).

## Examples

**Forecast a series:** `GET /api/jev/forecast/task_terminal?h=5` with the operator bearer → inspect `quality.flags` before trusting `forecast[]` (`insufficient_series` when n<8, `low_r2` when holdout R² < 0.5).

**Add a series write site:** import `tsWrite` in the owning module, call after the D1 write with the schema table above, add the series name to the console selector and this SKILL.md table. Never block the request path on the write.

**Settle a column question:** run the selftest and read `wae_schema_probe` — the live `SELECT *` column list beats any doc.

## Guidelines

1. D1 is the system of record; WAE is the disposable trajectory tier (3-month retention, sampling on high-volume indexes — not expected at jev volume).
2. Forecasts advise, never authorize. A forecast that feeds a gate decision must first record a {predicted, realized} pair into the outcomes ledger.
3. Any gate change is a pre-registered amendment, never a post-hoc loosening (falsification-corpus skill).
4. Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.
