# jev-corpus RSI round refs5 - refs/ corpus (2026-10-03)

Round refs5 of the jev-corpus RSI chain. Branch `refs5-rsi-2026-10-03`, draft PR #282, held for review.

## Setup

- Corpus: `refs/` pinned at main `b88d5231fa8c09f572a0d8c6897f459f5f905fa4` (250 docs x 12 NSS axes).
- Scorer: structured-evidence v2 on the worker (`/api/jev/corpus/scorer/*`, v2.2 stoplist frame). Full-matrix score: 250 docs, `$0.05`-class spend.
- Baseline audit: run `cr_82a1fa5ef70db604` - **dBc -19.270712729076124**, v2 0.3586, z 5.4259, verdict excluded-at-this-null.
- Baseline instruments (runbook lesson 6): map 548 (frame `c605af07d054e8a0`), positive control (5 controls: isolated delta {neg 0, zero 4, pos 1}, bits moved 4/5, quantization-silent 1), admission trials: rayleigh TRUE, axis_trial FALSE, spectra TRUE, radius TRUE, azimuth FALSE; azimuth and axis-redundancy trials recorded against map 548.
- Lens: 24 candidates (12 real + 12 controls), all on axis 5 (adjacent problems) / axis 11 (recursion) for six docs.

## Cycle table (10 cycles)

| cycle | target | predicted (lens dBc) | realized dBc | verdict |
|---|---|---|---|---|
| 1 | pr-campaign-research axis5 | +2.7082 | **-0.6306** | KEEP, commit `c5d68b8b` |
| 2 | roadmap-promotion-gates axis5 | +13.6850 | +0.8029 | REVERT (wrong sign) |
| 3 | pr-campaign-research axis11 | +14.0967 | +0.6037 | REVERT (wrong sign; see finding F1) |
| 4 | pr-campaign-research axis11 (re-run of cycle 3 under v2.1 hysteresis) | +14.0967 | **-0.4077** | KEEP, commit `8ceed5256` (message says "cycle 3": the re-run reused `c3.json`) |
| 5 | roadmap-promotion-gates axis11 | +14.0967 | 0.0000 | no-flip (zero bits moved), not committed |
| 6-10 | tests-census axis5; wayfinder-round3-isolate-census axis11; companion-systemd-homed (both) axis5/axis11; companion-yubios-stress-test-r8 axis5 | lens deltas | - | DECLINED content-resistant, no edits |

Final corpus level: **dBc -20.30905411925563** (net -1.0384 from baseline). Snapback instrument posted after every cycle: 5-point series, inversion runs [[1],[4]], verdict `no_snapback` throughout.

## Findings

- **F1 - marginal-bit threshold jitter corrupts per-cycle deltas (round's main finding).** Cycle 3 was refuted by the plain sign gate, but the re-score had *lost* a marginal bit (axis 9, p = 0.52 pre-edit) while gaining the intended axis 11 bit. Re-running the identical edit under the documented v2.1 hysteresis (`low 0.45 / high 0.55 / pre_row`) held the marginal bit and the same edit measured plastic-keep at -0.4077 (cycle 4). A wrong sign under a plain re-score is provisional until the marginal bits are held: edited-row re-scores must always carry hysteresis against the pre-edit row.
- **F2 - axis-fill effects on this doc class are real but small and sign-fragile.** Two keeps in five measured cycles, both on the same two docs; the reverted sibling fills moved +0.60 to +0.80 wrong-signed. Consistent with refs4's decisive-scorer round (1 keep / 4 regressions).
- **F3 - the axis-vocabulary rule holds but citations legitimately trip knowledge_sources.** Cycles 1 and 2 flipped axis 9 as collateral via `refs/` cross-links. The links are content-relevant, not vocabulary padding; recorded as accepted collateral.
- **F4 - the hysteresis rollup route returns `no_data` despite five closed supersedes chains in the ledger** (rows 1320/1321, 1322/1328, 1323/1329, 1327/1330, 1331/1332). The chains are verifiable in `GET /api/outcomes`; the rollup join condition needs a look (open diagnostic, same class as the 2026-10-02 empty-cycles finding). Prony over the corpus-runs history: r2 0.6957, arms k=10.73 (tau 7912 s) + k=6.06 (tau 10000 s, grid edge).

## Ledger bookkeeping notes

- Pre-registrations carry the map id current at creation; each keep re-maps (chain 548 -> 549 -> 550), so realized rows must echo the pre-row's baseline_id. The 409 "a superseding row must share baseline_id and target" cost three retries before diagnosis.
- Orphan rows: 1326 (pre-registration from a crashed first cycle-4 attempt), 1324/1325 (realized rows posted without supersedes during the 409 diagnosis). All flagged here; harmless to the chains.
- Cycle 4's commit message says "cycle 3" because the re-run reused the cycle-3 config. The ledger and this record carry the correct numbering.

## Steps and endpoints

Full repro log: `documents/github-yubios-KS9n5GAT/steps-refs5-2026-10-03.log` in the agent workspace (session space files). Every endpoint call (health/selftest, scorer x250, audit, placements 404 note, map/control/admission/azimuth/axis-redundancy, lens, preview per cycle, outcomes pre/realized per cycle, snapback per cycle, remaps, git blob/tree/commit/ref chain per keep) is logged there with ids.

## Surviving direction

Structure-level edits remain the surviving direction; the three ADD rungs on map 549 all create isolates (no join candidates this round). Next round candidates: an extractor recall pass (v2.3) before further recursion-axis rounds, or structure-level docs that genuinely join an isolate cluster.
