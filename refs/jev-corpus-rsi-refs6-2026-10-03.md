# jev-corpus RSI round refs6 - refs/ corpus (2026-10-03)

Round refs6 of the jev-corpus RSI chain. Branch `refs6-rsi-2026-10-03`, draft PR #283, held for review. Same session as refs5 (PR #282 squash-merged first, main `86293122928a05fd980eb125206acc0d3e12df6a`).

## Setup

- Corpus: `refs/` at main `86293122` (251 docs x 12 axes: refs5's two keeps + the refs5 round record are now corpus items).
- Scorer: structured-evidence v2 (v2.2 stoplist frame). Edited-row re-scores ALWAYS carry v2.1 hysteresis per refs5 finding F1.
- Baseline audit: run `cr_8c69fd4df46dbc88` - **dBc -23.750507463779456**, v2 0.3475, z 5.1825, excluded-at-this-null.
- Baseline instruments: map 551 (frame `19bc8de8395f102d`), positive control (5 controls: isolated delta {neg 1, zero 1, pos 3}, bits moved 5/5), admission: rayleigh TRUE / axis_trial FALSE / spectra TRUE / radius TRUE / azimuth FALSE; azimuth + axis-redundancy trials recorded.
- Lens (top 12): axis8 (composition) + axis11 (recursion) fills on the same six low-coverage docs as refs5's axis5/11 candidates. Re-lens top 30 after cycle 1 widened to state-check records.

## Cycle table (10 cycles)

| cycle | target | predicted (lens dBc) | realized dBc | verdict |
|---|---|---|---|---|
| 1 | roadmap-promotion-gates axis8 (composition) | +11.1122 | **-1.6375** | KEEP, commit `ecef849f` |
| 2-6 | companion-systemd-homed (both) axis8/axis11; companion-yubios-stress-test-r8 axis8; tests-census axis11; wayfinder-round3-isolate-census axis8 | lens deltas | - | DECLINED content-resistant, no edits (ledger rows 1340-1344) |
| 7 | round11-ledger-state axis11 | +12.3351 | +1.3830 | REVERT (wrong sign under hysteresis) |
| 8 | self-corpus-drift-check axis11 | +11.7189 | +0.5807 | REVERT (intended axis11 did NOT flip; axis2 collateral did) |
| 9 | lean-ci-state axis11 | +11.7840 | +1.0429 | REVERT |
| 10 | mitigation-coverage-check axis11 | +12.0006 | +0.5280 | REVERT |

Final corpus level: **dBc -25.388014258542256** (net -1.6375 from baseline; single keep). Snapback instrument posted after every measured cycle: all `no_snapback`.

## Findings

- **F1 - recursion-axis fills on state-check records are wrong-signed 4/4 under hysteresis.** Cycles 7-10 measured +0.53 to +1.38 with the intended axis11 bit flipping in three of four. This extends refs4's finding: the axis-fill class is wrong-signed on this corpus except for rare keeps (composition on roadmap-promotion-gates this round; pr-campaign axis5/axis11 in refs5). The surviving direction remains structure-level edits.
- **F2 - collateral flips continue to shadow the sign gate.** Cycle 8's section flipped axis2 (outputs) instead of the intended axis11; cycle 10 flipped axis3 + axis11. Even carefully worded, doc-own-terms sections carry cross-axis vocabulary the extractor reads. The axis-vocabulary rule reduces but does not eliminate this.
- **F3 - the hysteresis rollup instrument is live and measured this round** (first functioning rollups since the F4 route fix, same session): baseline 551 -> 1 chain dev 12.7497 (cycle 1's |pred - realized|); baseline 552 -> 4 chains total 44.3040, mean 11.0760/cycle (the four reverted recursion fills). The persistent pattern: geometric predictions (+11 to +12) are ~10x the realized effects (+0.5 to +1.6), matching refs2's round-3 finding. Prony over the runs history: r2 0.803, arms k=19.88 (tau 10000 s, grid edge) + k=0.
- **F4 (bookkeeping) - the keep path's map re-map must happen AFTER the realized outcome row** posts (the realized row shares the pre-registration's baseline_id; refs5's supersedes contract). Cycle 1 hit both this ordering bug and a silently-failed in-harness git commit; both fixed in the harness (cycleBaselineId captured before the remap; commits retried manually with surfaced errors).

## Ledger bookkeeping notes

- Pre-registration rows 1338 (C1, baseline 551) and 1345-1348 (C7-C10, baseline 552 - the map id advanced after cycle 1's keep re-map); realized rows 1339, 1349-1352 supersede them. Decline rows 1340-1344 (baseline 552).
- Outcomes ledger rows this round: 1338-1352. Prior rounds' chains (1320-1337) unchanged.

## Steps and endpoints

Full repro log: `documents/github-yubios-KS9n5GAT/steps-refs6-2026-10-03.log` (session space files). The worker's F4 route fix shipped between rounds (etag `39d619f87f0929f9c22c719a`) is what made the rollups in F3 possible.

## Surviving direction

Structure-level edits remain the only surviving direction (map 551's 4 ADD rungs all create isolates; the CHANGE rung targets a census charter doc). Before further axis-fill rounds: the extractor recall pass (v2.3) recommended in refs4 remains the open instrument improvement.
