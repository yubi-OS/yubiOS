# Pre-registration — visco falsification fixtures (snapback + hysteresis)

Lane C, falsification-harness build order items 5+6 (`refs/falsification-harness-coverage-2026-10-06.md`, yubi-OS/yubiOS main).
Written: 2026-10-07 (UTC). Written BEFORE any corpus run. Instrument: steady-orbit worker `jev-visco-math.js`, live at https://steady-orbit.systems-a.workers.dev, endpoints:

- `POST /api/jev/corpus/visco/snapback` — body `{series:[{cycle,predicted_delta,realized_delta}]}` or `{baseline_id:N}`
- `GET /api/jev/corpus/visco/hysteresis?baseline_id=N`

Auth: "Steady Orbit jev operator" (conn_QAvrBSyEG8ml). All probes and runs go through the live route (worker executor; sandbox is Cloudflare-1010-blocked on workers.dev).

## 0. Schema discovery (probes, pre-preregistration)

Recorded in `probes.json`. Schema/semantics learned empirically BEFORE this prereg was written. Every request/response is in `probes.json`; nothing below is invented.

### 0.1 snapback contract (observed)

| probe | status | observation |
|---|---|---|
| empty body | 400 | `INVALID_BODY "invalid JSON body"` |
| no auth | 401 | `UNAUTHORIZED "missing or wrong bearer token"` |
| GET on route | 404 | `NOT_FOUND` |
| `{}` | 422 | `INVALID_INPUT "snapback needs {series:...} or {baseline_id}"` |
| `{series:[]}` | 200 | verdict `no_snapback`, action `continue`, n_points 0 |
| missing delta fields | 422 | `INVALID_SERIES "...must be finite numbers"` |
| bare array body | 400 | `INVALID_BODY` |
| valid 3-cycle (realized [1.8,1.7,-1.0]) | 200 | inversion_runs `[[3]]`, `no_snapback`/`continue` |
| `{runs:...}` (recorded-shape guess) | 422 | `INVALID_INPUT` — the `runs` shape is NOT accepted |

Response shape (inline): `{snapback:bool, inversion_runs:[[cycle,...],...], run_lengths:[int,...], verdict:"no_snapback"|"snapback", gate_input:{action:"continue"|"halt_round"}, gate_noise_context:null, source:"inline"|"ledger", baseline_id, n_points, run_id:"cr_..."}`.

### 0.2 pinned inversion semantics (from probes; these ARE the pinned parameters)

- **Inversion predicate (pinned):** point i is an inversion iff `predicted_delta ≠ 0 AND realized_delta ≠ 0 AND sign(realized_delta) ≠ sign(predicted_delta)`. Zero on either side = no-flip (observed: pred 2/real 0 → no inversion; pred 0/real ±2 → no inversion; pred −2/real +3 → inversion). No magnitude threshold (observed: real −0.001 vs pred 2 IS an inversion).
- **Halt predicate (pinned):** verdict `snapback` + `gate_input.action:"halt_round"` iff at least one run of CONSECUTIVE inversions has length ≥ 2. Isolated single inversions never halt — even several of them (observed: `[[1]]` continue, `[[1],[3]]` continue, `[[1,2]]` halt, `[[1..5]]` halt, tiny magnitudes `[[1,2]]` halt).
- **Zero breaks a run (pinned):** inversions separated by a zero-realized cycle are two isolated runs, not one run of 3 (observed: `[[1],[3]]` continue).
- **Validation is lenient (observed):** string/float cycle, string delta, null delta, NaN-as-null, negative cycle, duplicate cycles, out-of-order cycles, extra fields — all 200; only non-finite/absent delta fields and non-object/array bodies 422/400. `gate_noise_context` was `null` in every probe.

**Honesty note:** these semantics were learned by probing before preregistration. The corpus therefore does NOT merely re-run the probe cases: every class below is instantiated with fresh seeds, magnitudes, lengths and positions, so class-level predictions are tested out-of-sample. Probe cases themselves are kept only as recorded contract anchors.

### 0.3 hysteresis contract (observed)

- `422 INVALID_BASELINE` without `baseline_id`; `422 "baseline_id must be a number"` for non-numeric.
- `200` with `verdict:"no_data"` + `note:"ledger empty for this baseline"` for baselines with no rows (0, 1, 99999, −1 all returned this — note: no positivity check on the id).
- `200` with `verdict:"measured"` for baselines 565/566/569 (the only baselines in the current ledger; 12 rows total, round refs7 era 2026-10-03).
- Measured response shape: `{loops:[{chain_ids, predicted, realized, sum_abs, mean_abs, ledger_chain_ids}], active_rows, total_sum_abs, total_mean_per_cycle, n_cycles, sum_abs, mean_per_cycle, verdict, baseline_id, ledger_rows, skipped_rows, run_id}`.

### 0.4 Consolidation contract pinned from live data (source of the local reference)

From the 12 real ledger rows (fetched via `GET /api/outcomes`) and their live hysteresis outputs:

- Rows are pairs: a **prediction-only row** (has `predicted_delta`, `observed_delta=null`, verdict `pending`) followed by a **realized-only row** (has `observed_delta`, `predicted_delta=null`, verdict kept/reverted). No `supersedes` links exist in the current ledger, yet chains form — so closure pairs adjacent prediction/realized rows in ledger order (`ledger_chain_ids:[pred_row_id, realized_row_id]`).
- Per-loop dissipation (verified on all 5 live loops to float precision): `sum_abs = |predicted_delta − observed_delta|`; `mean_abs = sum_abs / len(realized)`.
- Totals: `total_sum_abs = Σ loop sum_abs`; `n_cycles = Σ len(realized)` (counting realized rows); `total_mean_per_cycle = total_sum_abs / n_cycles`; `sum_abs` and `mean_per_cycle` mirror the totals (identical in all live observations); `active_rows` = number of realized rows consumed in loops; `skipped_rows` = ledger_rows − active_rows (prediction-only rows left pending); `verdict:"measured"` iff ≥1 loop else `"no_data"`.

## 1. Pinned corpus classes and predicted verdicts

Generators are deterministic (LCG seed recorded per case, `seed = 0xC0FFEE ^ case_index`), pure compute, magnitudes in [0.5, 5.0] (2 decimals) unless stated. Expected verdicts pinned below; the gate compares live verdict AND gate_input.action AND (where pinned) inversion_runs.

| class | description | n cases | predicted verdict / action | runs pinned? |
|---|---|---|---|---|
| A aligned-meaningful | pred>0, real>0, random magnitudes, n∈[2,10] | 12 | `no_snapback` / `continue` | runs=[] pinned |
| B aligned-negative | pred<0, real<0 (mirror direction) | 4 | `no_snapback` / `continue` | runs=[] pinned |
| C inverted-halt | ≥2 consecutive inversions, varying run length 2..n, position, mixed directions | 10 | `snapback` / `halt_round` | exact runs + run_lengths pinned |
| D isolated-inversion | inversions present, none consecutive (incl. at boundaries, multiple separated) | 8 | `no_snapback` / `continue` | exact runs pinned |
| E zero-no-flip | realized=0 or predicted=0 everywhere, incl. zeros breaking an otherwise-halting run | 6 | `no_snapback` / `continue` | runs=[] pinned |
| F recorded-fixture | the recorded round-3 cumulative series, now sourced from the repo's frozen source-of-record fixture `tools/visco-instruments/fixtures/visco-fixtures.json` → `snapback.round3_recorded.input.series` (see amendments 2026-10-07T04:35Z) | 1 | `snapback` / `halt_round` | runs `[[4],[6,7],[10]]`, lengths `[1,2,1]` pinned |
| F2 repo-fixture | `clean_single_inversion_no_snapback` from the same frozen fixture file | 1 | `no_snapback` / `continue` | runs `[[2]]`, lengths `[1]` pinned |
| F3 prereg-fallback | the prereg's original synthetic `[[4],[6,7],[10]]`-skeleton series (retained per amendments; not dropped post-hoc) | 1 | `snapback` / `halt_round` | exact runs pinned |
| G ledger-path anchors | `{baseline_id}` input: 565, 566, 569, 99999 | 4 | computed from the fetched ledger rows (565: `[[1415]]`/continue, 566: `[[1417],[1423]]`/continue n=4, 569: `[]`/continue, 99999: `[]`/continue + note) | yes |
| N noisy-null | n=10, per-cycle inversion prob p ∈ {0.05,0.10,0.20,0.30}, 200 seeded trials per tier | 800 | per-trial verdict computed by the pinned predicates (independent oracle) | per-trial |

F fallback (pre-registered): if the recorded round-3 series cannot be located in refs/, substitute a synthetic series with the same inversion-run skeleton `[[4],[6,7],[10]]` (9+ cycles, aligned elsewhere) and record the substitution in the amendments log. The expected verdict `halt_round` is unchanged (pinned from the recorded outcome, refs/ round-3 record + AGENT.md).

## 2. Gates (pinned before any run)

- **G1 noiseless verdict gate (classes A–F):** live verdict AND `gate_input.action` match prediction on **100%** of cases. Any single mismatch = instrument FAIL (falsifies the pinned mapping).
- **G2 runs gate (A, B, E, C, D, F):** `inversion_runs` matches the pinned/expected runs exactly (cycle labels included).
- **G3 noisy-tier instrument gate (N):** per-trial live verdict matches the independent oracle (pinned predicates re-implemented locally, written before the run) on **100%** of the 800 trials. Noise tiers are data noise, not instrument tolerance — the endpoint must remain exactly correct on noisy inputs.
- **G4 noisy-tier gate-design FPR (N):** per tier, the empirical halt rate across 200 trials must land within **±0.04** of the analytic FPR `1 − g(10)` where `g(n) = q·g(n−1) + p·q·g(n−2)`, `g(0)=g(1)=1`, q=1−p (probability of no run of ≥2 consecutive inversions in n Bernoulli(p) trials). Analytic values (computed by script, pinned via amendments 2026-10-07T04:35Z): p=0.05 → 0.021380 (window [-0.019, 0.061]); p=0.10 → 0.080253 ([0.040, 0.120]); p=0.20 → 0.273337 ([0.233, 0.313]); p=0.30 → 0.503588 ([0.464, 0.544]). This gate validates the generator's realized noise rate and documents the operational false-halt profile; it is NOT an instrument-correctness gate (that is G3).
- **G5 determinism:** 5 fixed cases re-posted verbatim must return identical `snapback/inversion_runs/run_lengths/verdict/gate_input` (`run_id` excluded — it is a row id, not a measurement).
- **G6 response-shape gate (all cases):** response carries all pinned fields; `len(run_lengths) == len(inversion_runs)`; `n_points == series length`; `source` is `"inline"` for series input, `"ledger"` for baseline input.
- **H0 repo-fixture gate (added via amendments 2026-10-07T04:35Z):** the local hysteresis reference (documented contract, CONTRACTS.md §2) must reproduce the frozen repo fixtures: `round3_recorded` → 10 singleton loops, `total_sum_abs = 102.86` (tol 0.05), `total_mean_per_cycle = 10.29` (tol 0.01), `active_rows = 10`, `n_cycles = 10`; `synthetic_two_loops` → exact to `1e-9 * (1 + |expected|)`.
- **H1 hysteresis live-parity gate:** the local reference (contract from §0.4) recomputed from the fetched ledger rows must reproduce every live `loops[]` entry and every total for baselines 565/566/569 to |Δ| ≤ 1e-9.
- **H2 hysteresis contract gate:** 422 on missing param; 422 on non-numeric; 200 `no_data` with `note` on empty baselines; 200 `measured` with all pinned fields present on data baselines; `total_sum_abs == sum_abs` and `total_mean_per_cycle == mean_per_cycle` (observed identity); `active_rows + skipped_rows == ledger_rows`.
- **H3 analytic rollup fixtures (reference-implementation anchors):** locally computed chains — single 1-cycle pair, multi-cycle pair sequence, trailing pending (skipped), single-row-both-shapes (row carrying both predicted and observed) — produce the analytic sums under the documented formula. **Honest limitation, pre-declared:** the live route reads only the production D1 ledger and accepts no synthetic ledger input, so H3 validates the LOCAL reference only; live-route falsification of those shapes is impossible without writing production ledger rows (out of scope — no repo/production writes this lane). H1 partially compensates on real data.

## 3. Amendments log

`amendments.md` — starts empty; every pre-run change gets a dated entry with a-priori justification. After the first clean run the gates are frozen; a post-hoc change converts this harness into a rubber stamp and will be recorded as such.

## 4. What this corpus cannot do (declared in advance)

- Hysteresis chain shapes beyond the observed adjacent-pair form (supersedes-linked multi-row chains, both-shapes single rows) are reference-only (H3), because the live route cannot ingest a synthetic ledger.
- The 102.86 dBc round-3 hysteresis anchor predates the current ledger (only 12 rows, max rollup 3.90, remain); it is NOT re-runnable against the live route, but since the amendments it IS validated against the local reference via the frozen repo fixture (gate H0) with the source of record's own tolerance. Recorded in the round record as a provenance note.
- `gate_noise_context` was null in every probe; its population condition is unknown and NOT pinned (no gate depends on it).
