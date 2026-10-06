# jev-corpus RSI round refs10 - refs/ corpus (2026-10-03, TIMED unit round)

Round refs10 of the jev-corpus RSI chain. Branch `refs10-rsi-2026-10-03`, draft PR #287, held for review. UNIT round instrumented with per-step wall-clock timing per Jenny directive ("run a unit to time it, then see if we can optimize the speed"). No protocol semantics changed.

## Frozen baseline check (the unit interval)

- Corpus: `refs/` at main `1813a4e879e2` (257 docs x 12 axes).
- Baseline audit nulls=400: run `cr_0e52ea550bb3616b` - dbc -24.0364, z 6.1629, **level_dbc 15.7957** (the corpus level rose again: the refs9 keep's +1.01 plus the merged round records lifted the frame).
- Map 559 (frame `483b1b3a8a5e7870`), control recorded, admission {rayleigh:true, spectra:true, radius:true; axis_trial/azimuth false}.
- Rungs: three JOINS (s9 -> gap-map-hyperspherical-harmonic-curve via the repo-history family; s3 -> point-map-real-cloud via the adjacent-problems family; s4 -> round8-citation-audit via the audit/investigation family) + one change rung.

## The one atomic change

ADD `refs/gate-correction-citation-audit-2026-10-03.md`, the s4 rung join: a citation audit of the 2026-10-03 gate-correction record chain, verifying every machine-checkable claim (3 audit runs confirmed in jev_corpus_runs via D1, ledger rows 1320-1409 confirmed across the round baselines, 5 cited commit SHAs confirmed via the commits API; the etag row recorded as a scope statement). Add-check C5/C6 PASS.

- Scorer row: `0,0,0,1,0,0,0,0,1,1,0,0`.
- Gate-grade audit: run `cr_3481d18ec3496eac` - level_dbc 15.6995, realized **-0.0962** -> REVERT (near-zero; the citation audit's content does not move the corpus level). Pre-registration 1410, realized row 1411 supersedes. No commit; the doc text is preserved in the session working copy.

## TIMING table (the round's instrument deliverable)

| step | wall-clock | notes |
|---|---|---|
| score matrix (257 docs, conc 6) | **52.7 s** | p50 716 ms/call, p95 4743 ms; the largest single block |
| audit nulls=400 | 3.0 s | |
| map baseline (frozen frame) | 7.4 s | embeddings cache-warm |
| control (5 splices) | **33.9 s** | first attempt 1102'd (worker CPU kill), retry passed - also the flakiest step |
| admission | 2.9 s | |
| azimuth | 0.9 s | |
| axis-redundancy | 1.2 s | |
| lens snapshot (skip-list) | 0.7 s | |
| rungs read | 0.6 s | |
| cycle: add-check + preview + pre-register + re-score + audit + snapback + outcomes x2 + remap | ~8 s | from the cycle harness timing |
| git/PR overhead (branch, skeleton, tarball, record commit, PR open/update) | ~40-60 s | mostly GitHub API latency |

**Measured unit wall-clock: roughly 2.5-3 minutes end-to-end, of which ~87 s is the two API monsters (score 52.7 + control 33.9) and ~50 s is GitHub round-trips.**

## Findings

- **F1 (timing)** - the runflow's cost is concentrated in two calls: the scorer matrix (52.7 s at concurrency 6) and the positive control (33.9 s, and it 1102'd on the first attempt). Everything else in the baseline check sums to ~9 s.
- **F2 (measurement)** - the citation-audit add measured near-zero (-0.0962): a record whose content AUDITS other records does not add structural distinguishability. Honest and expected; the rung's geometric hypothesis (iso -1) did not transfer to the level, consistent with the refs8 F1 reading that geometry proposes and the level disposes.
- **F3 (instrument health)** - the corpus level has now risen across three consecutive baselines (12.95 -> 13.96 -> 15.80): the rung-join keeps are accumulating real structure. The mobility instrument's next snapshot (this round's lens call is recorded) will extend the series.

## Optimization analysis (for the next directive)

1. **Scorer concurrency** (52.7 s -> ~15-20 s): per-call p50 is 716 ms of mostly upstream DefAPI latency; concurrency 6 leaves the server idle. Concurrency 12-16 should cut the block 2.5-3x. Cheap to validate: re-score a 24-doc slice at higher concurrency and compare.
2. **Parallelize the baseline check** (~9 s -> ~4 s): audit, map, and the read-only instruments (admission/azimuth/axis-redundancy/lens after the map) are mutually independent; control can overlap too. No protocol change - the results are identical, just fetched concurrently.
3. **Control** (33.9 s, the flakiest): runs 5 full-corpus splices through the preview path. Options: fewer controls (a protocol change, needs sign-off), a server-side lighter control, or leave as-is and overlap it with the scorer block (it does not depend on the matrix - both are ~50 s, so overlapping hides one entirely).
4. **GitHub overhead** (~40-60 s): batchable in principle (one commit instead of skeleton+record commits), at the cost of the incremental record convention.

Rounded estimate with 1+2+3-overlap: ~60-90 s total, vs ~150 s measured.
