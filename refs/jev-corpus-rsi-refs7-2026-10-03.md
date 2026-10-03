# jev-corpus RSI round refs7 - refs/ corpus (2026-10-03)

Round refs7 of the jev-corpus RSI chain. Branch `refs7-rsi-2026-10-03`, draft PR #284, held for review. FIRST ROUND under the corrected gate (the refs6 post-round level_dbc correction; runbook lessons 9-12).

## Setup

- Corpus: `refs/` at main `3649995f2ca2` (252 docs x 12 axes; the refs6 round record is now a corpus item).
- Gate: level_dbc = 20*log10(|z|) UP = improvement (verify_claims.py claim-8 law). Gate-grade audits at nulls 400. v2.1 hysteresis on every edited-row re-score. Bearing read on every cycle. Snapback series in the LEVEL convention.
- Baseline audit: run `cr_a4158ba403e72735` - dbc -23.8119, z 5.1114, **level_dbc 14.1707**, verdict excluded-at-this-null.
- Baseline instruments: map 553 (frame `e84fe0b401a39d56`), positive control recorded; admission trials: rayleigh FALSE, axis_trial FALSE, spectra TRUE, radius FALSE, azimuth FALSE (honest reading - this frame admits less than refs6's).
- Lens with the ledger-derived skip-list (12 entries: 8 charter/census docs + reverted axis-11 pairs + roadmap axis8/5): 15 real candidates, expected +14.99..+20.38.

## Cycle table (10 cycles)

| cycle | target | predicted (level conv.) | realized level delta | verdict |
|---|---|---|---|---|
| 1 | REVERT of the merged refs6 roadmap axis8 edit | +0.2158 | **+0.3919** | KEEP, commit `e9de59b6` |
| 2 | re-apply self-corpus-drift-check axis11 (refs6 row 1372) | +18.89 | -0.6138 | REVERT |
| 3 | re-apply mitigation-coverage-check axis11 (refs6 row 1374) | +20.38 | -0.2573 | REVERT |
| 4 | covenant-conflict-policy axis8 | +19.46 | -1.0363 | REVERT |
| 5 | covenant-conflict-policy axis11 | +19.44 | -0.7444 | REVERT |
| 6 | single-action-atom-merkle axis8 | +15.04 | -0.8035 | REVERT |
| 7 | skills-sync-state axis11 | +18.90 | 0.0000 | no-flip (zero bits) |
| 8-10 | business-surfaces-state-check axis8; claims-boundaries axis8; papers-census axis8 | lens deltas | - | DECLINED by taskcheck C7 (charter), no edits |

Final corpus level: **level_dbc 14.5626** (net +0.3919 from baseline; the keep is the revert). Snapback: honest inversion runs on cycles 2-6; `no_snapback` throughout. Outcomes ledger rows 1375-1391.

## Findings

- **F1 - the corrected gate's first keep was a correction of the previous round.** The pre-registered revert of the merged refs6 roadmap axis8 edit measured +0.3919 level (bearing ALIGNED: predicted +0.22 recovery, realized +0.39). Committing reverts of prior rounds' errors is now a first-class cycle type, and the level convention priced it correctly: the dbc convention had called that same edit a keep.
- **F2 - the refs6 z-revisions did not replicate at gate-grade.** Both edits revised to "kept" in the refs6 correction rows (self-corpus +0.29 z, mitigation-coverage +0.71 z, both measured at nulls=100) measured level-NEGATIVE at nulls=400 on the fresh frame (-0.61, -0.26). The "false refutation" reading was itself small-sample null noise. Lesson: z-level deltas at the default nulls=100 are NOT gate-grade; re-measure at nulls>=400 before acting on them. The provisional markings were the right call.
- **F3 - axis-fill remains a regression class under the corrected gate.** 5/5 measured attempts moved level_dbc DOWN (-0.26 to -1.04) across a policy doc, two state-check records, and the merkle worked-example record - i.e. the corpus became LESS distinguishable from the null after each fill. (Wording note: earlier records called this 'wrong-signed', dbc-convention language; under the level convention these are simply negative level deltas, measured at gate-grade with hysteresis - not sign artifacts.) Combined with refs2/refs4/refs5/refs6 the class has now failed under three gate statistics. Structure-level edits remain the only surviving direction.
- **F4 - the content-resistance filter is now code.** `tools/point-map/taskcheck_refs.sh` C7 mechanically blocked all three remaining charter candidates; no judgment calls this round. C6 grounding also shaped the authored sections (every kept or attempted section carries backticked in-repo paths or dated facts).
- **F5 - the visco instruments read coherently in the level convention.** Snapback inversions now mark exactly the cycles where the text moved against the geometry (2-6), instead of flagging every keep as it did pre-correction. Hysteresis rollups: baseline 553 -> 1 chain dev 0.1761 (the revert's |0.22 - 0.39|); baseline 554 -> 6 chains total 115.57. Prony over the runs history: r2 0.825, arms k=10.48 (tau 7912 s) + k=7.15 (tau 10000 s, grid edge).
- **F6 (bookkeeping)** - cycles 4-7 were mislabeled 7-10 in the harness configs (batch-loop arithmetic); the ledger chain ids are correct and the numbering above is the authoritative sequence.

## AGENT.md correction note

The worker runbook's sign-gate section still read "dBc more negative is the only success direction" at round start; it is corrected this session (KV `SITE/AGENT.md` + git mirror `tools/point-map/AGENT.md`, byte-identical) to the level_dbc convention, so sibling sessions pick up the right gate.

## Surviving direction

Structure-level edits (the map's ADD rungs all create isolates; no join candidates). The axis-fill class is closed on this corpus. Next-round candidates: structure-level docs authored to join isolate clusters, or an extractor recall pass (v2.3) if the scorer's recall limits keep surfacing (cycles 2, 5, 7 flipped the wrong axes or none).
