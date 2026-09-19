# Admission trials for every non-admitted diagnostic (admission/1, 2026-09-19)

Date: 2026-09-19. Family: instrument trial record (cf. `refs/rayleigh-admission-trial-2026-09-19.md`). Origin: directive after round 13 merged (PR #252): find everything else the instrument marks `admitted:false`, repeat the rayleigh/1 process for each, and work the trials into the flow.

## Inventory of `admitted:false` before this change

| Where | What was hard-coded | Now |
|---|---|---|
| `POST /api/map/axis-redundancy` (axis-trial/1) | `admitted:false` | computed: second independent null seed, non-degenerate nulls, reproducible per-axis verdicts, margins certified, N ≥ 100 |
| spectra card in every map (`map.spectra.admitted:false`, "NOT admitted as homology, and not admitted as evidence about the corpus") | constant | the card's flag stays: it denies **homology and physical** readings, which remain permanently not admitted. The **statistical** admission of the S² Parseval shares E₀..E₃ and even/odd blocks is now a trial in `POST /api/map/admission` |
| radius profile (`bounds.validated:false, certified:false`) | constant | stays: those flags describe caller-supplied perturbation assumptions. The **I(r) counts on the fixed grid** now have their own trial in `/api/map/admission`; the operative radius is unchanged at 0.095 and the grid is never reselected |
| rayleigh/1 | computed since PR #252 | unchanged; delegated to inside the unified call |

## The unified call

`POST /api/map/admission {map_id, K?, null_seed?}` runs four trials on one stored map and returns `summary: {rayleigh, axis_trial, spectra, radius_profile}` plus, per block, `criteria`, `why_not`, `per_statistic` (observed value, two null tails, `null_nondegenerate`, `verdict_reproducible`), `seeds`, `margins_preserved`. Admission licenses reporting the block's statistics as instrument readings on that frame; the response also lists what is `permanently_not_admitted` (physical readings of the spectra card, the constants l(l+1), the caller-supplied radius bounds, and any use of an admitted statistic as a ranking term, radius or keep/revert rule).

## Results on six stored baselines (K=40, default seeds)

| map | corpus | N | admitted per diagnostic |
|---|---|---|---|
| 436 | refs/ round-13 close | 226 | rayleigh **True** · axis **True** (excl 7/7; ok) · spectra **True** (ok) · radius **True** (ok) |
| 431 | refs/ round-13 baseline | 223 | rayleigh **True** · axis **False** (excl 6/7; ['verdicts_reproducible_all']) · spectra **True** (ok) · radius **True** (ok) |
| 78 | refs/ round-4 baseline | 178 | rayleigh **True** · axis **False** (excl 6/7; ['verdicts_reproducible_all']) · spectra **False** (['verdicts_reproducible_all']) · radius **False** (['verdicts_reproducible_all']) |
| 81 | skills/ round-1 baseline | 495 | rayleigh **True** · axis **True** (excl 9/9; ok) · spectra **True** (ok) · radius **False** (['verdicts_reproducible_all']) |
| 326 | skills/ round-12 baseline | 112 | rayleigh **True** · axis **True** (excl 3/3; ok) · spectra **False** (['verdicts_reproducible_all']) · radius **True** (ok) |
| 296 | docs/ round-11 baseline | 21 | rayleigh **False** · axis **False** (excl 0/0; ['n_at_least_100']) · spectra **False** (['n_at_least_100']) · radius **False** (['n_at_least_100']) |

Observations worth keeping:

- **Reproducibility is the criterion that bites.** On refs/ 431 the axis trial excluded 6 axes under seed a and 7 under seed b; one axis's verdict flipped, so the block is not admitted even though every null is non-degenerate and N=223. Same on refs/ 78 (axis, spectra E₃/even/odd, radius) and skills/ 81 (radius: I(0.115) excluded under one seed only). A verdict that depends on which 40 draws you took is not a reading; the trial says so instead of averaging it away.
- **Spectra shares are strongly excluded from the fixed-margin null on refs/ 436 and skills/ 81** (every one of E₀..E₃, even, odd), reproducibly, so the shares are admitted for reporting there. This is the first time the card's numbers carry a null; it does not make them homology or physics.
- **Radius I(r) counts are not-excluded on every refs/ and docs/ frame**: the isolate profile of the refs/ point cloud is what a margin-matched random bit matrix also produces. Admitted where reproducible (436, 431, 326), refused where a single grid point flipped (78, 81).
- **N < 100 refuses everything** (docs/ 296), as designed.
- Refs/ 436 (round-13 close) is the first frame on which **all four** diagnostics are admitted at once.

Observed values on 436 for the record — spectra: {"E0": 0.43457396894193234, "E1": 0.4663251610438744, "E2": 0.038721576679943956, "E3": 0.06037929333424935, "even": 0.4732955456218763, "odd": 0.5267044543781237}; radius I(r) on the grid: {"I_0.075": 34, "I_0.085": 29, "I_0.095": 23, "I_0.105": 14, "I_0.115": 7}.

## Where it sits in the flow

```
baseline map ──► positive control ──► POST /api/map/admission (rayleigh · axis · spectra · radius; summary of four admissions)
             ──► cycles (pre-register · author toward joins · preview + placement · frozen check · commit · after-map with transition guard · verdict row)
             ──► at round close: /api/map/admission again on the last map; report the summary and any block that flipped
```

The individual endpoints (`/api/map/rayleigh`, `/api/map/axis-redundancy`) still work and now agree with the unified call because they use the same recipe. `map.spectra` and `radius_profile` inside map responses are unchanged.

## What this record does not claim

Admission is per frame and per statistic; none of it transfers, ranks, changes the radius or decides an edit. Physical readings of the spectra card stay permanently not admitted. Counts and z are descriptive; K=40 resolves nothing below 1/41.
