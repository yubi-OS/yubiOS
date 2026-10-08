# SPEC-TIMESERIES-2026-10-08 — jev-timeseries (WAE storage + forecast)

Source: ideate-solo one-pager `session/jev-timeseries-solo-2026-10-08.md` (winner, 19/20).
Scope: additive substrate on the `steady-orbit` worker. D1 stays the append-only system of record; Workers Analytics Engine (WAE) is the trajectory/telemetry tier. Forecasts are advisory (noul-style), never gate-authorizing.

## 1. Storage schema (WAE dataset `jev`)

Binding `TS` (`{"type":"analytics_engine","name":"TS","dataset":"jev"}`). Every datapoint:
- `index1` = series name (the sampling key + filter column)
- `blob1..3` = ids/dimensions (see per-series table)
- `double1` = primary value, `double2` = secondary value (0 when absent)

| series | blob1 | blob2 | blob3 | double1 | double2 | write site |
|---|---|---|---|---|---|---|
| `task_state` | task_id | from_state | to_state | 1 | cost_usd (else 0) | wrapped `deps.transit` in jev-main.js buildDeps |
| `task_terminal` | task_id | tool | terminal_state | 1 | cost_usd (else 0) | same wrapper, only when `isTerminal(toState)` |
| `corpus_run` | run_id | kind | policy_version (string) | result.level_dbc ?? result.dbc ?? 0 | 0 | inside `recordRun` (jev-corpus-routes.js:424), after the D1 insert |
| `approval` | approval_id | task_id | created \| approved \| rejected | 1 | 0 | `createApproval` (jev-review.js:47) + the approve/reject legs |
| `evolution_cycle` | cycle/fire id | verdict | note | 1 | 0 | after a cycle completes in jev-evolution2-routes.js (optional if non-trivial; skip if it would touch >10 lines) |

Rules:
- `tsWrite` NEVER throws into the request path: full try/catch, failure = `console.warn("ts_write_failed", series, e.message)`. Telemetry must not break orchestration.
- `writeDataPoint()` is fire-and-forget (no await per CF docs).

## 2. New part `jev-timeseries.js`

Exports:
- `tsWrite(env, series, { blobs, doubles })` — the safe wrapper above.
- `handleJevTimeseries(req, env, deps)` — routes:
  - `GET /api/jev/timeseries/selftest` — runs the math selftest (from jev-forecast-math.js) + a live WAE write/read probe. Write 3 known datapoints to series `selftest_probe`, then SQL-read them back; if the read lags (KV-style propagation), report `{lag: true}` honestly instead of failing. Status 200 with `{ok, checks[]}`.
  - `GET /api/jev/forecast/:series?h=5` — **bearer-gated** (`requireOperatorAuth` pattern, same as the map engine routes). Reads WAE via SQL API with `env.AE_SQL_TOKEN` (`await env.AE_SQL_TOKEN.get()` — secret_text binding): `SELECT timestamp, double1 FROM jev WHERE index1 = '<series>' ORDER BY timestamp ASC LIMIT 1000` (escape the series name as a quoted literal; validate `^[a-z_]+$` first). Runs `etsForecast`. Response: `{series, n, history_last30, forecast[], band, quality:{insufficient_series, holdout_sse, holdout_coverage, flags[]}, source:"wae"}`. Errors fail closed with named reasons: `503 MISSING_READ_TOKEN`, `422 BAD_SERIES_NAME`, `502 WAE_SQL_ERROR` (carrying the upstream error body truncated).
  - `GET /api/jev/timeseries/series` — `SELECT index1 AS series, COUNT() AS n, MIN(timestamp) AS first, MAX(timestamp) AS last FROM jev GROUP BY series ORDER BY n DESC` (bearer-gated).
- Delegation in routes-jev.js, right after the corpus line (~376): `if (p.startsWith("/api/jev/forecast") || p.startsWith("/api/jev/timeseries")) return handleJevTimeseries(req, env, deps);`

## 3. New part `jev-forecast-math.js` (Lane A)

Pure deterministic ETS. v1 contract (pre-registered): **damped-trend Holt, no seasonality** (jev series are irregular-interval event counts; seasonality is phase 2).

- `etsFit(values)` — grid search alpha, beta over {0.05,0.10,...,0.95} (19×19=361 evals), phi fixed 0.98, minimizing one-step-ahead SSE on the **holdout tail (last 20%, min 2 points)**; deterministic tie-break (lower alpha, then lower beta).
- `etsForecast(values, h)` — returns `{level, trend, forecast[], band[]}` where band[i] = 1.96 × residual_sd × sqrt(i) (residual_sd = holdout one-step residual RMS), quality flags:
  - `insufficient_series` when n < 8 → forecast null, flag set
  - `low_r2` when holdout fit R² < 0.5 (honest quality)
- `selfTest()` — all falsification gates below return boolean checks; used by the selftest route.

Falsification harness (Lane A, per falsification-corpus skill — **preregistration file written BEFORE any measurement**):
- G1 trend recovery: synthetic linear series slope a=0.37, n=40 → forecast at h=5 within ±10% of a·5·(damping).
- G2 band coverage: 100 fixed-seed noisy series (mulberry32 seed 20261008, noise sd 0.5) → realized next-step inside band 88–98% of the time.
- G3 determinism: same input twice → byte-identical output (JSON compare).
- G4 insufficient: n=7 → `insufficient_series` true, forecast null.
- G5 parity: JS vs Python source of record (`tools/forecast-standard/forecast_ets.py`, same grid, same tie-breaks) max |Δ| ≤ 1e-9 on 4 fixtures (linear+noise, flat+noise, ramp, spike).
- G6 flat-series sanity: constant series → forecast ≈ constant, band ≈ 0 (no NaN).

## 4. Console card (Lane C)

Forecast card inside `sec-corpus` in KV `jev-index.html` (328,270 B pull at `session/timeseries/kv/jev-index.html`), placed after the spectral card's `</section>`. Pattern = taste/spectral card (token styling, `jevsp` surface, sessionStorage `jev_key` auth, fail-soft). Content: series selector (task_terminal / corpus_run / approval / evolution_cycle / task_state), n-points tile, last-value + forecast tile + band, quality-flag chips (insufficient_series, low_r2, lag), collapsed raw JSON disclosure. Add a `diagtab` button? NO — the card lives inside the corpus tab like taste/spectral/router cards; no new top-level tab. Parser-validated (0 unmatched closes) before any KV PUT. KV PUT with `--data-binary` only.

## 5. Bindings (advisor, deploy step)

Added to upload metadata (rebuilt from live settings + these two):
- `{"type":"analytics_engine","name":"TS","dataset":"jev"}`
- `{"type":"secret_text","name":"AE_SQL_TOKEN","text":"<token from session/timeseries/aetoken.txt>"}`

Secrets Store write is 401 on the managed connection (probed) — secret_text binding is the working path. Token is Account Analytics Read (created 2026-10-08, id 2f6b90cf… + a fresh one in aetoken.txt; the two earlier orphan tokens 2f6b90cf-class can be deleted by Jenny or left to expire).

## 6. Docs + skill (post-deploy)

- ENDPOINTS.md: +3 routes under a Time Series capability domain.
- AGENT.md (KV + git mirror): artifact-routing row.
- New skill `yubi-OS/yubiOS/skills/jev-timeseries/SKILL.md` + SPEC + conceptualization refs doc `refs/jev-timeseries-2026-10-08.md`.
- Local mirror sync + registry regen.

## 7. Non-goals (from the one-pager)

No TimesFM in the worker (phase 3 = box-side via shell bridge), no D1 migration, no forecast-gated automations, no new external services.

## 8. Deployment addendum (2026-10-08, live-verified)

- WAE SQL time column empirically = `timestamp` (selftest `SELECT *` schema probe is the arbiter). `ORDER BY` on a column absent from the SELECT list fails 422 "unable to find type of column" — include it in SELECT. The `_timestamp` hypothesis (§2 note) is FALSE; §2's `SELECT *` settle clause did its job.
- `secret_text` bindings surface as plain strings at runtime (`env.AE_SQL_TOKEN` is a string, not a `.get()` object). The module handles both shapes.
- The `-F=x` single-token curl form mangles the multipart metadata field (CF 10021); use separate `-F` + value entries.
- G2 (band coverage) ships FAILING honestly at 84/100 vs pre-registered [88,98]% — grid-selected residual_sd shrinks on short noisy series. Gate NOT moved; v2 fix (train-only residual_sd) is a future major bump. §3's "pre-registered" language governs: never retune to pass.
- Final etag chain: 7f8fa641 → dda2f487 → f0c6d7c7 → f2313fa6 (last = live-verified: selftest ok:true, 401s clean, forecast 200).
