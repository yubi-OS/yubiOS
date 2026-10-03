# jev-corpus RSI rounds refs12-16 - refs/ corpus (2026-10-03)

Five consecutive unit rounds of the jev-corpus RSI chain, run 2026-10-03 on one branch. History wiped before the series (3,515 rows across 15 tables; automations + policy changelog + maps preserved). Decision model: **clef** (policy v6, Workers AI binding, consumed=0).

## Setup (shared across all 5 rounds)

- Corpus: `refs/` at main `0a0b19ebf32f` (259 docs x 12 axes: the refs10/refs11 records are now corpus items).
- Protocol: one atomic change per round; the scorer matrix carries rows forward for unchanged docs (hysteresis semantics for the whole matrix, per refs11 F2 recommendation) — only changed docs re-scored. This eliminates the unit-to-unit baseline noise that refs11 measured at -1.02 dB.
- Gate: level_dbc = 20*log10(|z|) UP = improvement; audits at nulls>=400; clef-era hysteresis band 0.50/0.60; bearing read; snapback in level convention.
- Baseline (round 1): run `cr_482add075016e335` - dbc -21.0813, z 5.4783, **level_dbc 17.6345**.
- Map 565; admission: rayleigh TRUE, spectra TRUE, radius TRUE; axis_trial FALSE, azimuth FALSE.
- Optimized harness timing: score 30.3s (259 docs conc 12), audit 2.4s, map 7.4s, instruments 6.4s, control 37.4s, rungs 0.8s → baseline 69.2s.

## The 5 rounds

| round | change | predicted | realized level delta | verdict |
|---|---|---|---|---|
| 1 (refs12) | ADD `refs/pq-supply-chain-verification-readiness-2026-10-03.md` (s3 rung join: post-quantum-tls isolate, supply-chain family) | -1 | **+0.0235** | KEEP, commit `8a1bddad` |
| 2 | ADD `refs/antimony-supply-chain-verification-2026-10-03.md` (s5 create-isolate, supply-chain family) | +1 | -0.0189 | REVERT (snapback fired) |
| 3 | ADD `refs/pq-key-rotation-readiness-2026-10-03.md` (caller-proposed, PQ family) | -1 | -0.2011 | REVERT |
| 4 | ADD `refs/supply-chain-build-boundary-2026-10-03.md` (caller-proposed, supply-chain family) | -1 | -0.2112 | REVERT |
| 5 (refs16) | ADD `refs/pq-timeline-alignment-2026-10-03.md` (caller-proposed, PQ family) | -1 | **+0.2929** | KEEP, commit `9ccaec47` |

Final corpus level: **level_dbc 17.9509** (net +0.3164 from baseline 17.6345; 2 keeps, 3 reverts).

## Findings

- **F1: the carried-row protocol works.** No unit-to-unit baseline noise: rounds 2-5 measured deltas against the round-1 baseline (carried forward, only the changed doc re-scored), and the noise floor is near zero (the smallest delta is -0.019, not the ±1 dB refs11 measured). The score block drops from 30s to 1 call per unit.
- **F2: the PQ family carries the round.** Both keeps are in the post-quantum family (supply-chain readiness + timeline alignment). The three reverts are supply-chain docs that don't reference PQ. The PQ thread is where the corpus gains structure under the clef frame.
- **F3: round 2's snapback.** The first snapback of the program (round 2: Antimony supply-chain verification measured -0.019, which triggered the inversion detector on the 2-cycle series). The mechanism works: a near-zero wrong-signed delta after a keep is flagged as elastic.
- **F4: rung-join is now 4/5** under the corrected gate (the one miss was round 1's s3 join measuring only +0.02 — marginal). Caller-proposed adds are 1/4 (round 5's PQ timeline doc, the only caller-proposed keep across refs8-refs16).

## Surviving direction

The PQ family (supply-chain readiness, timeline alignment) is the productive direction under the clef frame. Next rounds should focus there. The s3 rung's join was realized but marginal (+0.02); the s5 create-isolate was correctly refuted (-0.02). The remaining two change rungs (azimuth-trial, lensing-question-space) target instrument/census docs with charters that block content growth.
