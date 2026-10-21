# timesfm-clairic-clef: Hybrid System-One + TSFM Cascade Instrument

Source of record for the 3-stage SCAMPER forecasting and decision cascade (`ideate-solo` V6 winner, Clef score `2.8804/3.0`, choice probability `0.9598`):

```text
structured series -> TimesFM 2.5 (Apache-2.0, 200M) --[gate fail]--> TimesFM 3.0 (330M) ┐
messy documents   -> Cloudflare Clairic (@cf/cloudflare/clairic) ------------------------┼-> Clef (@cf/cloudflare/clef) -> Fail-Closed Policy Gate
known rules       -> rolling-origin baselines + /api/jev/map/outcomes pre-registration ──┘
```

## Architecture & Stage Contracts

1. **Stage 1: Clairic Intake (`clairic_extract_and_forecast`)**
   - Parses messy operational logs, CSV blocks, and inline deploy notes into typed series (`extracted_series`), covariates (`extracted_covariates`, `extracted_future_covariates`), character-offset grounded spans (`latest_anomaly_note.span`), `p_null`, and a short-horizon System-One density forecast (`clairic_short_forecast` with 99 percentiles `p1..p99` and `[p10, p90]` bounds).
   - Accepts live `@cf/cloudflare/clairic` Workers AI responses directly via `live_clairic_answers`.

2. **Stage 2: TimesFM 2.5 Primary Forecaster with Automatic Pre-Registered 3.0 Fallback (`timesfm_25_forecast` -> `evaluate_25_fallback_gate` -> `timesfm_30_forecast`)**
   - Evaluates rolling-origin holdouts against four baselines (`seasonal_naive`, `ets_damped_holt` from `tools/forecast-standard/forecast_ets.py`, `last_value`, `drift`).
   - Runs **TimesFM 2.5** (200M parameters, Apache-2.0 license, 32-step input patch, 9 deciles `p10..p90` with `fix_quantile_crossing=True` and split-conformal residual calibration).
   - Checks four Clef-weighted pre-registered fallback triggers on the rolling holdout:
     - **Gate 2A (MASE, Clef weight `0.8492`)**: `mase_25 > 1.0` or `> 1.05 * best_baseline_mase`.
     - **Gate 2B (Coverage, Clef weight `0.9047`)**: 80% interval coverage `picp_80 < 0.70` (or `> 0.95` when `holdout_n >= 20`).
     - **Gate 2C (Covariate / Variate Coupling, Clef weight `0.8886`)**: Covariate residual variance share `R^2_cov >= 0.20` or peer-series residual correlation `|r| > 0.40`.
     - **Gate 2D (Horizon Compounding, Clef weight `0.6446`)**: Horizon `H > 128`.
   - When any trigger fires, escalates automatically to **TimesFM 3.0** (330M parameters, single-pass non-autoregressive contiguous patch masking + lookahead covariate XReg + 2D variate coupling, stamped with `timesfm-non-commercial-license-v1.0 (cloud-commercial-only)`).

3. **Stage 3: Clef Bounded Decision & Deterministic Fail-Closed Gate (`clef_decide_and_gate`)**
   - Formats the active forecast's median, `[p10, p90]` widths, rolling-origin MASE, `PICP_80`, Pinball loss, fallback triggers, and Clairic anomaly note into the `/api/decide` Clef schema (`action_choice`: `act | wait | review | fallback_ets`, `band_calibrated`: `noul`, `operational_risk`: `score 0..3`).
   - Enforces the `AGENT.md` / `ENDPOINTS.md` invariant: **probabilities advise, never authorize**.
     - Uncalibrated intervals, `MASE > 1.0`, or commercial use of downloadable TimesFM 3.0 weights force `gate_disposition: "needs_approval"` even if a caller overrides Clef to `"act"`.
     - Emits the mandatory `/api/jev/map/outcomes` pre-registration record (`verdict: "pending"`) before any external action can run.

## CLI Usage

```bash
# Run all 8 pre-registered falsification gates (G1..G8, zero external deps)
python3 tools/timesfm-clairic-clef/timesfm_clairic_clef.py --selftest

# Regenerate pinned fixtures (mulberry32 seed 20261021)
python3 tools/timesfm-clairic-clef/timesfm_clairic_clef.py --write-fixtures tools/timesfm-clairic-clef/fixtures.json

# Run the 3-stage pipeline on a JSON payload from stdin
python3 tools/timesfm-clairic-clef/timesfm_clairic_clef.py --run < payload.json
```

## Pre-Registered Falsification Gates (`--selftest`, 8/8 PASS)

| Gate | Condition | Measured Result | Verdict |
|---|---|---|---|
| `G1_trend_and_seasonal_recovery` | `active == timesfm-2.5-200m`, `mase_25 < 0.65` and `< mase_last` | `mase_25 = 0.1332 < 0.4415` | PASS |
| `G2_conformal_band_coverage` | 100 seeded noisy seasonal series (`n=48, h=1`): `[p10, p90]` coverage in `[0.72, 0.94]` | `80/100 (0.80)` | PASS |
| `G3_determinism` | Two runs produce byte-identical JSON (`sort_keys=True`) | `7215 == 7215 bytes` | PASS |
| `G4_insufficient_series_fail_closed` | `n < 16` returns `forecast=None` and `gate_disposition="blocked"` | `n=7 -> blocked` | PASS |
| `G5_quantile_monotonicity` | Zero quantile crossings (`p10 <= p20 <= ... <= p90`) | `0 crossings` | PASS |
| `G6_automatic_25_to_30_fallback` | Covariate-shock series fails 2.5 (`mase_25 > 1.0`, `cov_r2 >= 0.20`) and triggers 3.0 (`mase_30 < 0.50`) | `mase_25=1.0827 -> mase_30=0.0545` | PASS |
| `G7_clairic_messy_intake_and_spans` | Extracts 28 rows + exact character-offset span `[874, 893]` + 99-quantile steps | `slice_match=True, 99 quantiles` | PASS |
| `G8_clef_fail_closed_and_outcomes_prereg` | Commercial 3.0 fallback forces `needs_approval` over `act` and emits `outcomes` pre-registration | `needs_approval + pending row` | PASS |
