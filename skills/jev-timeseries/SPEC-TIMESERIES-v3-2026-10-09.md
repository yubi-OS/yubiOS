# SPEC-TIMESERIES-v3-2026-10-09: PREREG-v3 for jev-forecast-math band v3

Date: 2026-10-09 (America/Los_Angeles). Status: PRE-REGISTRATION, committed before any v3 code or measurement.
Base: yubi-OS/yubiOS main at 9c8a909ff98df4ac6a104320b718a7f7e372c57f.
Instrument under test: jev-forecast-math v3 (proposed). Source of record: Python (tools/forecast-standard/v3/forecast_ets.py, written after this commit).
Untouched: v1 (tools/forecast-standard/forecast_ets.py, blob 2b835227985fe6edbcd6485d6e9def92890f66e8) and v2 (session copy; see section 1 note).
Falsification discipline: skills/falsification-corpus/SKILL.md. Predictions, gates and the pass rule below are fixed before measurement.

## 1. v2 failure table (recorded measurements; not re-derived)

Source: wave1-forecast/measure-out/v2.json and PREREG-v2 section 9. Coverage = hits out of 100 replicates, one-step.

| Gate | v2 measured | Requirement | Status |
|---|---|---|---|
| G1 trend recovery | increment 1.740084 vs target 1.741916, delta -0.00183 (-0.1%) | within 10% of target | PASS |
| G2 C0 flat (SPEC) | 99 | [88, 98] | FAIL (over-covers) |
| G2 C1 flat n=40 | 99 | [88, 98] | FAIL (over-covers) |
| G2 C2 linear | 98 | [88, 98] | PASS (at edge) |
| G2 C3 ramp | 93 | [88, 98] | PASS |
| G2 C4 spike | 99 | [88, 98] | FAIL (over-covers) |
| G3 determinism | 818 bytes, identical | identical | PASS |
| G4 insufficient | insufficient_series = true | true | PASS |
| G5 fixture integrity (Python) | max regen delta 0.0 | <= 1e-9 | PASS. JS parity: not in the v2 record |
| G6 flat sanity | maxFcDev 0.0, maxBand 0.0 | <= 1e-9, <= 1e-6 | PASS |
| NEG (band x 0.5, C0) | 93 / 100 | outside [88, 98] | NOT DETECTED |

Mean band-scale ratio (mean band_1 / 1.96 divided by true noise sd 0.5): C0 3.54, C1 3.18, C2 3.20, C3 1.87, C4 4.07.

v1 record, same harness (re-measured in step 2 on evaluation seeds): C0 84 (recorded), mean ratio 0.877. Fails G2.

v2 verdict: FAIL. Its own PREREG-v2 section 11 says a negative control that does not fire makes the run invalid. The v2 run is invalid under that rule, and the G2 failures above stand regardless.

Note on the v2 source: the v2 Python file is NOT in git. main holds only v1 (blob 2b835227), and the prereg/forecast-v2-2026-10-09 branch (head b3039fde) holds the same v1 blob. The only v2 copy is the session file wave1-forecast/v2/forecast_ets.py. Step 2 commits it verbatim as tools/forecast-standard/v2/forecast_ets.py, with its sha256 recorded, so it can be reviewed. This is a copy, not a change.

### Diagnosed cause (from the v2 code and the recorded numbers)

The v2 recursion initializes trend_0 = y_1 - y_0. The trend update is trend_t = PHI * trend_{t-1} + alpha * beta * e_t (algebraically exact for the innovations form). The initial trend therefore decays only through PHI = 0.98, a half-life of about 34 steps, whatever alpha and beta are. It leaks into level predictions through PHI * trend. The early train residuals are inflated (recorded scale ratio about 2.8 for the early residuals). The holdout that selects (alpha, beta) is the last max(2, floor(0.2 n)) points, after the transient has decayed, so selection does not see them. The v2 band uses MAD over TRAIN residuals, so it absorbs the transient and over-covers on C0, C1 and C4.

## 2. Candidate changes and the PRIMARY METHOD (chosen before measurement)

Candidates:
- (a) Zero initial trend: trend_0 = 0.0 instead of y_1 - y_0. Nothing else changes.
- (b) Warm-up discard: drop the first W points before fitting and before band estimation.
- (c) Both.

PRIMARY METHOD: (a) alone.

Why (a), decided now:
1. (a) removes the source. With trend_0 = 0, the trend is built only from data (beta * alpha * e_t), so no trend bias exists at t = 0.
2. (b) keeps the v2 initialization. At the new origin W it starts from another single noisy difference y_{W+1} - y_W, which re-creates the same transient at a different time. It only moves the transient. Discarding W points also shrinks the holdout and train sets (n = 30 to 40), which the selection and the band both need.
3. (c) inherits (b)'s costs and adds no mechanism that (a) lacks.
4. Known residual effects of (a), stated now: the level still starts at y_0, so the offset (y_0 - mean) decays with (1 - alpha)^t. This term is much smaller than the removed trend term and is left in place; G2 measures its effect. (a) also adds a learning lag for real trends: the linear C2 series starts with trend 0 against a true slope 0.37. The MAD band and G1 test it.

### PREREG-v3 instrument definition (v3 = v2 except where stated)

- PHI = 0.98. Grid alpha, beta in {0.05, 0.10, ..., 0.95} (19 x 19). Ties: alpha outer and beta inner ascending, strictly-lower SSE only.
- h_n = max(2, floor(0.2 n)); ho_start = n - h_n.
- CHANGED: level_0 = y_0; trend_0 = 0.0. This applies to the selection recursion, the train-residual recursion and the final point forecast.
- Selection recursion for i = 1 .. n-1: base = level + PHI * trend; e = y_i - base; if i >= ho_start add e^2 to SSE; level' = alpha * y_i + (1 - alpha) * base; trend' = beta * (level' - level) + (1 - beta) * PHI * trend.
- Train residuals under the selected (alpha, beta), same zero-init recursion: e_t = y_t - (level_{t-1} + PHI * trend_{t-1}) for t = 1 .. ho_start - 1. Holdout residuals are not included.
- UNCHANGED band estimator: bandSd = 1.4826 * median(|e_t|) over TRAIN residuals (ascending sort; even count = mean of middle two).
- Point forecast: level and trend from the full-series recursion, as v2. forecast_j = level + trend * sum_{k=1..j} PHI^k. band_j = 1.96 * bandSd * sqrt(j).
- residualSd (holdout RMS) is diagnostic and does not feed the band. Quality flags unchanged: insufficient_series if n < 8; low_r2 if holdout R^2 < 0.5.
- bandVersion = "v3-mad-train-zerotrend". Constant series: bandSd = 0 (G6).

## 3. Predictions (analytic, stated before measurement, not measured)

- G1 PASS. For noise-free linear data the damped fixed point is trend* = alpha*beta*0.37 / (1 - PHI + alpha*beta*PHI). For alpha*beta near 0.9 this is about 0.369, so zero-init converges to the same target.
- G3, G4, G6 PASS. G6: a constant series with trend_0 = 0 gives level 7.5 and forecast exactly 7.5.
- G2: the removed transient was the dominant inflation term. Expect C0, C1 and C4 to fall from 99 into roughly 92 to 97. Expect C2 near 93 to 97. Expect C3 near 90 to 94. Main risks: C0, C1 or C4 stays at 98 or 99 if the level-start offset dominates; C3 falls below 88 if ramp misspecification is overwhelmed by the lower scale.
- NEG values: low factor k in the 0.5 to 0.8 range, high factor K in the 1.1 to 1.3 range. These are rough expectations only.

## 4. Seeds (explicit; calibration and evaluation disjoint)

- EVALUATION seeds (EVAL): replicate k uses mulberry32(20261008 + k), k = 0 .. 99. Seeds 20261008 .. 20261107. Same as v1 and v2, for comparability. Fixtures F1 to F4 use seed 20261008 as in v2.
- CALIBRATION seeds (CAL): replicate k uses mulberry32(20271008 + k), k = 0 .. 99. Seeds 20271008 .. 20271107. Disjoint from EVAL. Used ONLY to set k and K. Never used for any gate.
- Corpora (same generators as v2): C0 = 30 draws of 0.5 * g as history, next draw as target. C1 flat = 10 + 0.5 g; C2 linear = 2 + 0.37 i + 0.5 g; C3 ramp = 0.05 i^2 + 0.5 g; C4 spike = 50 if i = 20 else 10 + 0.5 g. For C1..C4 the series is i = 0..40 (41 values): history = i 0..39, target = i = 40. Each replicate uses its own fresh mulberry32 stream.
- Harness validation (before calibration): the harness must reproduce the recorded EVAL counts for v1 (C0 84, C1 83, C2 80, C3 87, C4 80) and v2 (C0 99, C1 99, C2 98, C3 93, C4 99). If it does not, the harness is wrong and nothing else runs.

## 5. Negative controls: two-sided, factors fixed by a rule on CAL

- Scaled band: band_1 * f. A replicate hits iff |target - forecast_1| <= f * band_1. Coverage is non-decreasing in f for every replicate, so the rules below pick grid boundaries.
- Calibration statistic: the MEAN of the five corpus coverages (C0..C4) on CAL seeds, for v3 only.
- k = the largest grid value in {0.05, 0.10, ..., 1.00} whose calibration mean coverage is below 85. If none exists, NEG_low is not constructible and clause (iv) fails.
- K = the smallest grid value in {1.00, 1.05, ..., 4.00} whose calibration mean coverage is above 99. If none exists, NEG_high is not constructible and clause (iv) fails. (The threshold is 99, not 101. See amendment A1.)
- Record the CAL seeds, the full calibration coverage curve, and k and K in a dated results file, and commit it BEFORE the evaluation run. Then freeze k and K.
- Evaluation detection, on EVAL seeds with frozen k and K, using the same mean statistic:
  - NEG_low DETECTED iff mean coverage < 88.
  - NEG_high DETECTED iff mean coverage > 98.
  Per-corpus values are reported for information only.
- The same frozen k and K are applied to v1 and v2 bands as a cross-check. They are not recalibrated for v1 or v2. Only the v3 result enters the pass rule.

## 6. Gates (G1 to G6 unchanged from v2; G2 window [88, 98] unchanged)

- G1 trend recovery: y_i = 0.37 (i + 1), i = 0 .. 39, h = 5. increment = forecast_5 - level; target = 0.37 * sum_{k=1..5} PHI^k. PASS iff |increment - target| <= 10% of target.
- G2 band coverage: one-step coverage on each of C0, C1, C2, C3 and C4 (EVAL seeds, 100 replicates each, band constant 1.96). PASS iff each count is in [88, 98]. Scope C0..C4 carried from v2 amendment A1.
- G3 determinism: F1 (linear-noise, seed 20261008, n = 40), h = 5, two runs; JSON with sort_keys is byte-identical.
- G4 insufficient: n = 7 gives insufficient_series = true, forecast null, band null.
- G5 fixture integrity (Python source of record): the harness regenerates F1 to F4 with its own pinned generator and compares them with the module's fixture generators and with the stored golden fixtures. PASS iff max |delta| <= 1e-9. JS-vs-Python parity is NOT RUN in this lane and is reported as unverified.
- G6 flat sanity: constant 20 x 7.5, h = 5. PASS iff max |forecast - 7.5| <= 1e-9, max band <= 1e-6, all values finite.
- NEG_low and NEG_high: section 5.
- DET (determinism of the full harness): the calibration run and the evaluation run are each executed twice with the same seeds. Output is byte-identical (sha256 match).

## 7. PASS RULE for v3

v3 PASSES if and only if all of the following hold:

(i) G2: each of C0, C1, C2, C3 and C4 is in [88, 98] on EVAL seeds.
(ii) G1, G3, G4 and G6 pass.
(iii) G5: the Python fixture-integrity check passes. The JS parity is stated as NOT RUN. A PASS under this rule is a Python-source-of-record PASS, not a JS parity PASS, and it does not authorize a worker patch.
(iv) NEG_low is DETECTED (mean < 88) AND NEG_high is DETECTED (mean > 98), using frozen k and K.
(v) DET: the calibration and evaluation runs are byte-identical across two runs with the same seeds.

A single failure means v3 FAILS. There is no partial pass. No second method is tried in this lane. Any other method needs a new pre-registration.

## 8. Pre-declared fallback (executed only if v3 fails)

- Ship v3 as specified, with no retuning and no gate change. Set quality.calibrated = false. BAND_LABEL carries the measured coverage for each corpus.
- The selftest returns ok:false and names every failing gate.
- Nothing is relabelled to look like a pass. No gate band is changed.
- In this lane the worker is not patched and no JS port is written, whatever the result.

## 9. Amendments log (all written before any v3 measurement and before calibration)

- A1 (2026-10-09, pre-run): the high-side calibration threshold for K changes from "mean coverage above 101" to "mean coverage above 99". Reason: coverage is a percentage bounded above by 100. "Above 101" can never hold, so the high-side control could not be constructed at any factor, and clause (iv) would fail by construction. The low side keeps its 3-point margin (85 against 88). The nearest reachable high-side margin is 1 point above the window edge (99 against 98). A threshold of 98 would leave zero margin, so detection at the calibrated K would be decided by Monte Carlo noise. The window [88, 98] is NOT changed. The threshold 99 is chosen from these arguments, not from any v3 result.
- A2 (carried from v2 A1): G2 scope is C0..C4.
- No other amendments.

## 10. Procedure (order is part of the pre-registration)

1. This commit (PREREG-v3). Draft PR opened into main.
2. Implementation commit, no measurement: tools/forecast-standard/v3/forecast_ets.py; tools/forecast-standard/v3/harness_v3.py; tools/forecast-standard/v2/forecast_ets.py (verbatim copy of the v2 session file). v1 is not modified.
3. Harness validation against the recorded v1 and v2 EVAL counts (section 4).
4. Calibration on CAL seeds, v3 only, run twice for DET. Record k, K and the full coverage curve in tools/forecast-standard/v3/results/calibration-2026-10-09.json. Commit as an addendum BEFORE the evaluation run.
5. Evaluation on EVAL seeds for v1, v2 and v3 with frozen k and K. Run twice for DET. Record G1 to G6, NEG_low and NEG_high for all three versions in tools/forecast-standard/v3/results/evaluation-2026-10-09.json. Commit.
6. Verdict against section 7.

## 11. Constants

ASCII only. mulberry32 masked to 32 bits. Box-Muller with u1 == 0 replaced by 2.3283064365386963e-10. Medians over an ascending sort. Coverage reported as an integer count out of 100. JSON field names follow section 2.
