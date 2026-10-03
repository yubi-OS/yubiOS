# jev-corpus RSI round refs9 - refs/ corpus (2026-10-03)

Round refs9 of the jev-corpus RSI chain. Branch `refs9-rsi-2026-10-03`, draft PR #286, held for review. FIRST round under the unit-round protocol (skill lesson 13, Jenny directive 2026-10-03): cycle count 1, the whole runflow runs as a unit for one atomic change, the frozen baseline re-checked at this unit interval.

## Frozen baseline check (the unit interval)

- Corpus: `refs/` at main `806f0e9b78e8` (255 docs x 12 axes; the refs8 record and build-toolchain-status keep are now corpus items).
- Scorer matrix re-scored fresh (255 docs); gate-grade audit at nulls 400: run `cr_eab86ea5e33a7931` - dbc -27.3418, z 4.4421, **level_dbc 12.9517**, verdict excluded-at-this-null.
- Map 557 (frame `176f73b27604a16e`, isolated 40), positive control recorded; admission: rayleigh TRUE, everything else FALSE.
- Instruments: the skip-list lens proposed only axis-1 fills on state-check docs - the CLOSED axis-fill class, so the lens is not a candidate source this round. The rungs carried the round: `add:s3:101001011` JOINS TWO isolates (`refs/point-map-real-cloud-2026-09-06.md` + `refs/refs-refresh-jev-weighted-2026-09-29.md`, predicted isolated delta -2), exemplar family the adjacent-problems series.

## The one atomic change

ADD `refs/adjacent-problems-corpus-rsi-2026-10-03.md`, authored to the rung's exemplar family (related problems + retired alternatives of the corpus-improvement loop, all cited from the corpus's own records: the free-prose grader retirement, the structured-evidence scorer v2, the frozen task check). Add-check C5/C6 PASS. Pre-registered (outcomes row 1408, predicted -2 geometric join) BEFORE insertion.

- Scorer row: `0,0,0,0,0,1,0,1,0,0,0,0` (adjacent + failure-modes bits, honest to the content).
- Gate-grade audit: run `cr_676dd3a951dc3fb0` - **level_dbc 13.9609, realized +1.0092** vs baseline 12.9517 -> **KEEP**.
- Bearing: predicted is a geometric quantity (iso delta -2), realized is level (+1.01) - different quantities, same direction of "the corpus gains structure"; recorded as aligned-under-the-runbook-note.
- Snapback: single-cycle inversion run [[1]] (cross-quantity, no_snapback).
- Commit `d0364f261f88e88cb03d59896bc660f2e49e90b6`; remap -> map 558; realized outcome row 1409 supersedes 1408.

Final corpus level: **level_dbc 13.9609** (net +1.0092 for the unit).

## Findings

- **F1 - the unit round ran clean end-to-end in one pass.** Pin -> frozen baseline check -> rung -> one authored add -> pre-register -> hysteresis re-score -> nulls-400 audit -> gate -> taskcheck-subset -> commit -> outcomes -> remap -> rollup. No harness retries, no ordering bugs; the refs5-refs7 harness lessons (realized row before remap, surfaced git errors) held.
- **F2 - the rung joins keep winning.** Both generator-endorsed joins measured keeps (refs8 C1 +0.85, refs9 +1.01); caller-proposed adds went 0/5. The unit protocol makes each round a single instrument-proposed change, which matches the generator's hit rate.
- **F3 - the lens is fully retired as a candidate source on this corpus.** With the skip-list applied, everything it proposes is in the closed axis-fill class. Rungs (structure-level) are the only live generator; the s8 rung (join repo-history-skill-cycle-4-changelog, exemplars lean-ci-state/radius-diagnostics/slsa-spec) is the next unit's top candidate.
- **F4 - dbc moved -0.06 while level moved +1.01 on the same add** - the two statistics disagreed again; the level convention remains the gate.

## Instruments

Hysteresis rollup baseline 557: 1 chain (1408/1409), dev 3.0092 (|pred -2 - real +1.01|). Prony over the runs history: r2 0.801-era fit (see steps.log for the exact reading at this unit's close).

## Surviving direction

Rung-join adds under the unit protocol. Next unit: the s8 rung join, or a fresh rung set after map 558's regeneration.
