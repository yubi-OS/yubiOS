# CONTRACTS — `tools/visco-instruments/` (Lane A, Python source of record)

This is the contract the JS port (`jev-visco-math.js`, Lane B) codes against.
Fixtures: `fixtures/visco-fixtures.json` — frozen outputs of THIS module; on
any mismatch the JS is wrong (SPEC-VISCO §2.3). Pure functions only: no fetch,
no I/O, no env, deterministic.

## Sign conventions (AGENT.md sign gate)

- **dBc improvement = MORE NEGATIVE.** -16.9 dBc is better than -11.1.
- `predicted_delta` / `realized_delta` are consumed **exactly as recorded**, no
  re-interpretation: `realized_delta = +0.16` means "dBc moved +0.16 in the
  recorded frame" (toward the null, i.e. worse). Only SIGNS are compared.
- Level deltas: `delta = later_dbc - base_dbc` (replay load leg = +2.566).
- Persistence direction is fixed: base bit **0 -> 1** (a load flip credits an
  axis that was previously 0).

## 1. `persistence_stats(applied_cells, regraded_passes, base_dbc, loaded_dbc, regraded_dbcs)`

Inputs:
- `applied_cells`: array of `[row, axis]` 2-arrays; rows are looked up by
  `String(row)` so int row ids match JSON string dict keys. `axis` is `0..11`.
- `regraded_passes`: array of `{pass_id: string, bits_by_row: {"<row>": [12 bits]}}`
  — one per INDEPENDENT grader pass over the LOADED text.
- `base_dbc`, `loaded_dbc`: numbers. `regraded_dbcs`: numbers parallel to
  `regraded_passes` (length mismatch -> throw `ValueError`/`Error`).

Rules:
- A flip **persists in a pass** iff the re-graded row credits bit 1 at that
  (row, axis). A pass missing the row does not credit it.
- **Persisted overall = persists in EVERY pass** (strictest rule; each pass is
  an independent blind re-grade). `per_pass_fractions` carries per-pass detail;
  single-pass cases make the two identical (replay 9/9 is single-pass).
- `inter_pass_offset_dbc` = max pairwise |dbc_i - dbc_j| across the REGRADED
  passes only (0.0 with <2 passes; callers append extra pass levels to
  `regraded_dbcs` to include them). `max_bit_disagreement` = max over cells
  (row, axis) present in >=2 passes of the count of pairwise pass pairs whose
  credited bits differ.

Return shape:
```json
{"applied_count": int, "persisted_count": int, "persistence_fraction": float,
 "per_pass_fractions": [float],
 "level": {"dbc_base": f, "dbc_loaded": f, "dbc_regraded_passes": [f],
           "delta_load": f, "delta_regraded_passes": [f]},
 "scorer_variance": {"inter_pass_offset_dbc": f, "max_bit_disagreement": int}}
```
Edges: `applied_count == 0` -> fraction `0.0`; no passes -> `persisted_count 0`,
`per_pass_fractions []`, offset `0.0`.

## 2. `hysteresis_rollup(rows)`

Input `rows`: ledger rows `{id | cycle, predicted_delta, realized_delta,
supersedes (id|null)}`. Ids may be int (cycle numbers) or string; `supersedes`
must match an id exactly. Duplicate ids -> throw.

Rules:
- A supersedes CHAIN is `root <- ... <- active`; each chain closes into one
  LOOP ordered oldest -> active. Area per loop = `sum |predicted_delta -
  realized_delta|` over the WHOLE chain (superseded attempts dissipate too);
  `mean_abs = sum_abs / len(chain)`.
- `active_rows` = rows no other row supersedes. `n_cycles` = number of loops
  (= one final outcome per cycle; a chain's replaced attempts roll into it).
  `total_mean_per_cycle = total_sum_abs / n_cycles`.
- Unknown supersedes id -> treated as root. Supersedes cycle (a<->b) ->
  leftover rows become singleton loops so every input row is counted exactly
  once. Empty ledger -> all zeros.

Return shape:
```json
{"loops": [{"chain_ids": [...], "predicted": [f], "realized": [f],
            "sum_abs": f, "mean_abs": f}],
 "active_rows": int, "total_sum_abs": f, "total_mean_per_cycle": f,
 "n_cycles": int}
```
Anchor: recorded round-3 case -> 10 singleton loops, `total_sum_abs = 102.86`
(tol 0.05), `total_mean_per_cycle = 10.29`.

## 3. `prony_fit(series, arms = 2, tau_grid = null)`

Inputs: `series` = `[{t, value}]` ascending in `t` (`t` may be a cycle index —
SPEC §2.2 fallback); needs >= `arms+1` points. `arms` int 1..3 (SPEC §2.4 caps
K at 3; out of range -> throw). `tau_grid` default = **60 points, log-spaced,
1e-2 .. 1e4 inclusive**: `10 ** (-2 + 6*i/59)`, `i = 0..59`.

Method (must be reproduced exactly by the JS):
1. Dedupe + sort the grid ascending; enumerate `arms`-combinations in
   ascending-index order; skip combos with duplicate taus.
2. Design columns `[1, exp(-t/tau_j)...]`; solve amplitudes by linear least
   squares via **normal equations** (`AᵀA c = Aᵀy`, Gaussian elimination with
   partial pivoting; singular when a pivot < `1e-12 * max(1, max|AᵀA|)` -> skip).
3. **Clip negative exponential amplitudes to 0 and re-solve** the reduced
   system; repeat until no negative arm remains. `ke` is never clipped.
4. Pick the FIRST (sse, taus, coefs) with minimal SSE under a relative guard
   (`sse < best - 1e-15 * max(1, best)` — later ties do NOT displace earlier).

Return shape:
```json
{"ke": f, "arms": [{"k": f, "tau": f}], "fit_quality_r2": f,
 "fitted": [{"t": f, "value": f, "fitted": f}], "sse": f}
```
`arms` ordered tau-ascending; clipped arms carry `k = 0`. `fit_quality_r2 =
1 - sse/sst` (sst about the mean; `sst == 0` -> `1.0` if exact else `0.0`).

Observed on the recorded round-3 trajectory: the best nonneg 2-arm fit is
effectively **ke-only** (`ke = -10.5682`, both arms clipped, `r2 ≈ 0`) — the
series oscillates, and nonneg decaying arms cannot improve on the mean. This is
the contract's honest output, not a bug; the synthetic exact-2-arm fixture
(ke=-10, k=[2.0 @ tau 1.0, 1.0 @ tau 8.0], explicit grid containing the true
taus) recovers to `sse ~ 1e-28`, `r2 = 1`. NOTE: exact-recovery fixtures must
use NONNEGATIVE amplitudes — negative arms are outside the representable set.

## 4. `snapback_detect(series)`

Input `series`: `[{cycle, predicted_delta, realized_delta}]` **in caller
order** — that order defines consecutiveness; cycles need not be contiguous.

Rules:
- Pre-registered direction = `sign(predicted_delta)`. A cycle is an INVERSION
  iff `sign(realized_delta)` OPPOSES it. `realized_delta == 0` -> **neutral,
  never opposed**; `predicted_delta == 0` -> no pre-registered direction,
  never opposed.
- Consecutive inversions group into RUNS; an agreeing or neutral cycle breaks
  a run. `snapback = true` iff any run length >= 2 (SPEC §2.5).

Return shape:
```json
{"snapback": bool, "inversion_runs": [[cycle,...]], "run_lengths": [int],
 "verdict": "snapback" | "no_snapback",
 "gate_input": {"action": "halt_round" | "continue"},
 "gate_noise_context": null}
```
Verdict strings only, never auto-action; `gate_noise_context` stays `null` in
the pure function — the C4 route attaches scorer offset there when grader-pass
variance exceeds the gated effect (SPEC §2.7; replay F1: 5.77 vs 0.64).
Anchor: recorded round-3 series -> runs `[[4],[6,7],[10]]`, lengths `[1,2,1]`,
`snapback true`, `halt_round`.

## Fixture file schema

```json
{"version": 1, "generated": "<ISO date>",
 "source": "verify_visco.py (Python source of record, Lane A)",
 "sign_convention": "...",
 "persistence": [{"name", "input": {applied_cells, regraded_passes, base_dbc,
                                     loaded_dbc, regraded_dbcs}, "expected": <return shape>}],
 "hysteresis": [{"name", "input": {rows}, "expected": <return shape>}],
 "prony":      [{"name", "input": {series, arms, tau_grid|null}, "expected": <return shape>}],
 "snapback":   [{"name", "input": {series}, "expected": <return shape>}]}
```
9 cases: persistence 3 (`nine_flips_all_persist`, `partial_persistence`,
`scorer_variance_two_pass`), hysteresis 2 (`round3_recorded`,
`synthetic_two_loops`), prony 2 (`round3_recorded_trajectory`,
`synthetic_exact_2arm`), snapback 2 (`round3_recorded`,
`clean_single_inversion_no_snapback`). `expected` values are frozen outputs of
this module — regenerate with `python3 generate_fixtures.py` ONLY when the
contract itself changes, never to make a failing port pass.

## Parity notes for the JS port

- All numbers are IEEE-754 doubles; JSON round-trips them exactly. Compare
  with tolerance `1e-9 * (1 + |expected|)` (the selftest's rule), `0.05` for
  the 102.86 anchor, `0.01` for its mean.
- Determinism checklist: same default grid, same combination order
  (ascending tau index), same clip-and-resolve sequence, first-minimum
  tie-break, `String(row)` key lookup, singleton-loop fallback for supersedes
  cycles, zero-as-neutral in snapback.
- Purity: no fetch, no Date, no Math.random; `Math.exp` only in prony.
