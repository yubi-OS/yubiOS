# PREREG-v2: jev-forecast-math band v2 (wave-1 Lane B)

Date: 2026-10-09 (America/Los_Angeles). Status: PRE-REGISTRATION, committed before any v2 measurement.
Instrument under test: jev-forecast-math v2.0.0 (proposed). Source of record: tools/forecast-standard/forecast_ets.py (v1 on main, not modified by this prereg).
Decision owner: Jenny (2026-10-09): re-derive the band as a pre-registered v2.

## 1. Failing fact (recorded from SPEC-TIMESERIES-2026-10-08 section 8 and SKILL.md; not re-measured here)

- v1 band = 1.96 x residualSd x sqrt(j). G2 coverage on 100 fixed-seed flat series (n=30, noise sd 0.5, seeds 20261008+k): 84/100.
- Pre-registered G2 gate: [88, 98]%. Status: FAIL.
- SPEC section 8 records a mean residual ratio of 0.877. Its exact definition is not recorded there, so v1's ratio is re-measured in step 2 and is not gating.
- The live timeseries selftest returned ok:true while G2 failed. The failure was masked because ok did not include G2.

## 2. Diagnosed cause (written before any v2 run)

v1 sets residualSd = sqrt(minSSE / h_n). minSSE is the minimum, over the 361 (alpha, beta) grid candidates, of the holdout one-step SSE. h_n = max(2, floor(0.2 n)) = 6 at n=30.
The six holdout residuals that the grid minimized are the same residuals used to estimate the band scale. A minimum over 361 candidates is biased low (winner's curse), so the band is too narrow.
For reference, an unbiased scale from 6 degrees of freedom alone gives about 91% coverage for a 1.96 band. Selection bias accounts for the rest of the gap to 84%.
Rule that follows: the band scale must not be estimated from the residuals that selected the model.

## 3. Candidate v2 methods

(a) Train-only scale, recorded before grid selection, at fixed default (alpha0, beta0). REJECTED as primary. The scale would describe a different model from the selected point forecast, so the mismatch varies by family. No default (alpha0, beta0) is justified a priori.
(b) Empirical quantiles of train one-step residuals per horizon, replacing 1.96 x sd x sqrt(j). REJECTED as primary. About 23 train residuals cannot pin the 2.5% and 97.5% tails. Per-horizon quantiles need multi-step residuals that an n=30 series cannot supply. It adds tuning knobs.
(c) Keep the form and relabel with measured coverage. NOT a fix. Used only as the pre-declared fallback (section 9).

PRIMARY METHOD (a-prime): train-segment scale, excluded from selection, with a robust MAD estimator.
- Deviation from candidate (a) as worded, declared here before any run: the scale is computed from the SELECTED model's train-segment residuals, which the holdout selection never touches, instead of at fixed default parameters.
- Keeps the 1.96 x sqrt(j) form. Uses about 23 residuals instead of 6. Removes selection bias.
- Why MAD and not RMS (analytic, before any run): in fixture F4 (spike, n=40), index 20 (value 50, base 10) lies inside the train segment (indices 0..31). Its one-step residual is about 40. Any RMS scale over the train residuals is at least 40/sqrt(31) = 7.2, giving a band of about +/-14 that covers the target about 100% of the time. That would fail the G2 upper bound of 98. MAD is insensitive to a single outlier.

## 4. Primary method definition (v2)

Unchanged from v1:
- PHI = 0.98. Grid alpha, beta in {0.05, 0.10, ..., 0.95} (19 x 19).
- Holdout h_n = max(2, floor(0.2 n)); ho_start = n - h_n.
- Choose (alpha, beta) minimizing holdout SSE, alpha outer and beta inner ascending, strictly-lower SSE only.
- Point forecast from the full-series recursion: level, trend, forecast[j] = level + trend x (sum of PHI^k for k=1..j).
- Quality flags: insufficient_series if n < 8. low_r2 if holdout R^2 < 0.5.

Changed:
- Train residuals: e_t = y_t - (l_{t-1} + PHI x b_{t-1}) for t = 1 .. ho_start - 1, using the selected (alpha, beta) recursion exactly as the v1 loop. No burn-in.
- bandSd = 1.4826 x median(|e_t|) over those residuals. Sort ascending. For an even count, the median is the mean of the two middle values.
- band_j = 1.96 x bandSd x sqrt(j), for j = 1..h.
- Output adds bandSd and bandVersion = "v2-mad-train". residualSd keeps its v1 meaning (holdout RMS), is diagnostic only, and does not feed the band.
- Constant series: bandSd = 0 (G6).

## 5. Predictions (stated before measurement; falsifiable)

- v1 C0: 84 (recorded above; not a prediction).
- v2 C0 (flat, n=30): 90 to 94. Linearized expectation for a MAD scale from about 23 residuals is about 92.
- v2 C1 to C4: each in 88 to 97. C4 (spike) is the highest-risk corpus. Post-spike recovery residuals could inflate the MAD and push coverage above 98.
- G5: max |delta| well below 1e-9. The JS and Python use the same IEEE operations in the same order.
- G1, G3, G4, G6: pass, since their code paths are unchanged.

## 6. Fixtures and corpora

Fixture formulas match forecast_ets.py v1 exactly. The generator is pinned mulberry32 with Box-Muller (u1 first; u1 == 0 replaced by 2.3283064365386963e-10). Each fixture uses a fresh stream seeded 20261008.
- F1 linear-noise: 2 + 0.37 i + 0.5 g, i = 0..39.
- F2 flat-noise: 10 + 0.5 g, i = 0..39.
- F3 ramp: 0.05 i^2 + 0.5 g, i = 0..39.
- F4 spike: 50 if i = 20, else 10 + 0.5 g, i = 0..39. One noise draw is consumed at every i, including i = 20.

G2 corpora (100 replicates each; replicate k uses a fresh mulberry32(20261008 + k), k = 0..99):
- C0 (SPEC G2, unchanged): 30 draws of 0.5 g as history; the next draw is the target.
- C1 flat, C2 linear, C3 ramp, C4 spike: the F1 to F4 formulas for i = 0..40 (41 values). History is i = 0..39, and the target is i = 40. Replicate k=0 history equals F1 to F4.

## 7. Gates

- G1 trend recovery (unchanged): noise-free linear a = 0.37, n = 40, h = 5. |increment - target| <= 10% of target.
- G2 band coverage (band constant 1.96 and gate [88, 98] unchanged): one-step coverage = fraction of replicates with |target - forecast_1| <= band_1. Evaluated on each of C0 to C4. The scope extension from C0 to C0..C4 is amendment A1 (section 10).
- G3 determinism (unchanged): two runs on F1, h = 5, give byte-identical JSON.
- G4 insufficient (unchanged): n = 7 gives insufficient_series = true, forecast null.
- G5 parity: JS v2 (patched module, executed in the worker) vs Python v2 on F1 to F4. max |delta| <= 1e-9 on forecast, band, level, trend, holdoutR2, bandSd. Quality flags exact.
- G6 flat sanity (unchanged): constant 20 x 7.5, h = 5. Forecast deviation <= 1e-9, band <= 1e-6, all values finite.
- Counts are applied as observed. No confidence-interval tolerance is added. Monte Carlo standard error at 92% is about 2.7 points.

## 8. Pass rule

v2 PASSES if and only if all of the following hold:
(i) G2 is in [88, 98] on C0, C1, C2, C3 and C4.
(ii) G1, G3, G4 and G6 pass.
(iii) G5 parity holds.
A single failure means v2 FAILS. There is no partial pass. No second method is tried in this lane; any other method needs a new pre-registration.

## 9. Pre-declared fallback (executed only if v2 fails)

- Ship v2 as pre-registered, with no retuning. Set quality.calibrated = false and a bandLabel containing the measured coverage for each corpus.
- The selftest reports each failing gate and returns ok:false, naming the failing gates.
- Nothing is relabelled to look like a pass. No gate band is changed.

## 10. Amendments log

- A1 (2026-10-09, pre-run, before any v2 measurement): G2 scope extended from C0 alone to C0..C4, so the pass rule covers every fixture family. The band [88, 98] is unchanged. Reason: the fixtures are the instrument's own test surface, and a G2 that ignored them would let spike or ramp miscalibration pass.
- No other amendments.

## 11. Negative control (pre-declared)

A deliberately bad band (band multiplied by 0.5) must FAIL G2 on C0. The selftest must return ok:false and name G2. If the negative control does not fail, the gate is not live and the run is invalid.

## 12. Constants

ASCII only. mulberry32 masked to 32 bits. Median computed over an ascending sort. JSON field names as in section 4.
