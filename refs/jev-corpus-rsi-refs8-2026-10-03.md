# jev-corpus RSI round refs8 - refs/ corpus (2026-10-03)

Round refs8 of the jev-corpus RSI chain. Branch `refs8-rsi-2026-10-03`, draft PR #285, held for review. FIRST STRUCTURE-LEVEL round (the axis-fill class is closed per refs7 F3).

## Setup

- Corpus: `refs/` at main `eb2139ceafb2` (253 docs x 12 axes; the refs7 round record is now a corpus item).
- Gate: level_dbc = 20*log10(|z|) UP = improvement; gate-grade audits at nulls 400; v2.1 hysteresis; bearing read; snapback in the level convention; skip-list lens.
- Baseline audit: run `cr_45f4d729c0cf4aa1` - dbc -21.1059, z 4.8308, **level_dbc 13.6803**, verdict excluded-at-this-null.
- Baseline instruments: map 555 (frame `ea67bfcf244eec84`, isolated 32), positive control recorded; admission: rayleigh TRUE, axis_trial TRUE, spectra FALSE, radius FALSE, azimuth FALSE.
- Structure-level targets: map 555's ladder rungs (3 ADD rungs) + the isolate census. One rung JOINS an isolate (`add:s10:100001010` -> `refs/arm64-rk-board-status-drift-check-2026-09-18.md`, exemplars the mkosi/reproducibility toolchain family); the other two create isolates with mixed-family exemplars.
- Add measurement: `/api/map/preview {action:add}` + scorer row for the new doc + audit on the extended matrix. Task check for adds: the C5 (no cross-axis vocabulary) / C6 (grounding) subset - C2/C3 are change-shaped and do not apply to a fresh file.

## Cycle table (10 cycles)

| cycle | target | realized level delta | verdict |
|---|---|---|---|
| 1 | ADD `refs/build-toolchain-status-2026-10-03.md` (rung s10 join; grounded: PINNED.md, mkosi MinimumVersion=26~devel + upstream PRs, reproducible-build.sh, verify-reproducible-*, bcvk OMN-99/102/104/105/106 Done + OMN-107 In Progress) | **+0.8529** | KEEP, commit `b863d625` |
| 2 | ADD `refs/antimony-release-status-2026-10-03.md` (joins the chromium/runner dated-status family) | -0.5068 | REVERT |
| 3 | ADD `refs/arm64-path-a-status-2026-10-03.md` (joins the ARM64 hardware-program family) | -0.7728 | REVERT |
| 4 | ADD `refs/steady-orbit-worker-inventory-2026-10-03.md` (joins the deployment/ops family) | -0.3322 | REVERT |
| 5 | ADD `refs/mode-provenance-gating-2026-10-03.md` (third in the mode-series family) | -0.9181 | REVERT |
| 6 | ADD `refs/knowledge-corpus-census-2026-10-03.md` (census-family dated inventory) | -0.0002 | REVERT (near-zero) |
| 7-10 | candidate exhaustion: the two remaining rungs create isolates with mixed exemplars no grounded doc fits; the caller-proposed well is exhausted after five level-negative attempts; the round-record add is deliberately NOT gate-measured (self-referential) | - | ABSTAINED (ledger rows 1404-1407) |

Final corpus level: **level_dbc 14.5332** (net +0.8529; the single keep). Outcomes ledger rows 1392-1407. Snapback: honest single-cycle inversions recorded on every measured add (geometric prediction vs level realization are different quantities; the runbook bearing read applies).

## Findings

- **F1 - the structure-level keep was the generator's, not ours.** The one keep is the rung-endorsed add (the s10 join the generator proposed, authored to its exemplar family). All five caller-proposed adds - real, grounded, dated records in genuine corpus families (release status, hardware status, infra inventory, mode series, census) - measured level-NEGATIVE (-0.33 to -0.92) or dead-zero. The geometric generator's join hypothesis out-predicted grounded judgment about which docs "belong". Working hypothesis for the next round: propose adds ONLY from rung joins, and treat caller-proposed structure adds as priors to be measured, not candidates.
- **F2 - the two statistics disagreed on the adds again.** C2: dbc +1.54 while level -0.51; C3: dbc +0.91 while level -0.77; C5: dbc +1.16 while level -0.92. Consistent with the refs6 uncorrelated finding; the level convention remains the gate, and these rows are further calibration data for the dbc field's retirement as a gate statistic.
- **F3 - candidate exhaustion is real and recorded as such.** After one rung join and five caller proposals, every remaining grounded topic is already covered by an existing record; the two remaining rungs create isolates whose exemplar families (business/method mixes) admit no grounded new doc. Per the runbook: an exhausted ladder means candidate exhaustion under this generator, not a proof of optimality.
- **F4 - the add-check subset worked.** C5/C6 caught nothing this round (every authored doc was grounded with backticked paths and dates) but the checks are wired for future rounds; new docs may carry "does not claim" charters freely since C7 reads the BEFORE file and does not apply to fresh files.
- **F5 - instruments.** Hysteresis rollups: baseline 555 -> 1 chain dev 1.8529 (the keep's |pred(-1) - real(+0.85)|); baseline 556 -> 5 chains total 2.4699 (the five reverted adds, all under 1.0 dB level deviation - small, consistent effects). Prony over the runs history: r2 0.801, arms k=0 (tau 0.01) + k=14.93 (tau 6261 s).

## Surviving direction

The round closes the structure-level question as asked: adds CAN keep (+0.85 on the generator-endorsed join) but grounded-but-unguided adds are level-negative 5/5. Next round: rung-join-only adds (re-measure the s10 join's effect on the target isolate's isolation status after the keep), and the extractor recall pass (v2.3) remains the open instrument improvement.
