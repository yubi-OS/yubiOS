# jev-corpus RSI round refs17 - refs/ corpus (2026-10-03)

Round refs17 of the jev-corpus RSI chain. Branch `refs17-rsi-2026-10-03`, draft PR #290, held for review. FRESH-FREEZE unit round under the atomic-set protocol (Jenny directive: "dont use carried row, fresh freeze on each run, remember this is an atomic set") — the whole frozen baseline re-derived from scratch.

## Fresh-freeze baseline (the unit interval, atomic-set protocol)

- Corpus: `refs/` at main `729170fcd6c9` (262 docs x 12 axes: the refs12-16 record is now a corpus item).
- NO carried rows: full matrix re-scored (261 scored + 1 retry), fresh audit nulls=400, fresh map, fresh instruments. Zero state from prior rounds.
- Scorer timing: 35.4s (261 docs, conc 12, p50 1360ms, p95 2364ms) — 1 transient failure retried successfully.
- Baseline audit: run `cr_7babc5c0a711549e` - dbc -20.1423, z 8.5380, **level_dbc 18.6271**, verdict excluded-at-this-null.
- Map 569; admission: rayleigh TRUE, spectra TRUE, radius TRUE; axis_trial FALSE, azimuth FALSE.
- Rungs: 4 (one join: `add:s3:010010011` -> `refs/testing-production-gaps-2026-08-01.md` via the mode-attestation/VM-test family; two create-isolates; one change rung).

## The one atomic change

ADD `refs/vm-attestation-testing-coverage-2026-10-03.md`, the s3 rung join: a testing-status record cross-referencing the testing-production-gaps coverage matrix (12 surfaces) with the mode-attestation axis (one-shot vs daemon vs CI vs dry-run) to classify which surfaces are CI-verifiable vs hardware-dependent. Add-check C5/C6 PASS (after one header rephrase to avoid the "mode" substring in a section header).

- Scorer row: `0,0,0,1,0,0,0,0,1,1,0,0` (mode + composition + knowledge_sources).
- Gate-grade audit: run `cr_b27a6c2184175056` - **level_dbc 18.3318, realized -0.2953** vs baseline 18.6271 -> **REVERT**.
- Snapback: no_snapback. dbcDelta +0.8556 (dbc and level_dbc disagreed again).
- No commit; local file untouched. Realized outcome row 1425 supersedes pre-registration 1424.

Final corpus level: **level_dbc 18.6271** (unchanged; the change was reverted).

## Findings

- **F1 - the atomic-set protocol is clean.** The fresh-freeze baseline re-derived everything from scratch (full matrix re-score 35.4s, fresh audit, fresh map 569, fresh admission/azimuth/axis-red/lens/rungs). Zero state from prior rounds. The level is directly comparable to the refs12-16 baseline (17.6345 at 259 docs) plus the merged round records (262 docs now): 18.6271 is the fresh frame's level.
- **F2 - the cross-reference doc is level-negative.** The VM attestation testing coverage doc measured -0.2953 — cross-referencing two existing records (the coverage matrix and the mode axis) produces a record that adds vocabulary but not structural distinguishability. Consistent with the axis-fill class being closed: this doc's content is a meta-analysis of existing records, not new subject matter.
- **F3 - the C5 check has a substring false-positive mode.** The doc's section header "What the coverage matrix says about attestation modes" tripped the C5 "mode" check (a simple substring match). The header was legitimately discussing the mode-attestation axis as a cross-reference, not padding vocabulary. The C5 check's substring approach catches honest cross-references; a word-boundary-aware check would be more precise.
- **F4 - dbc and level_dbc disagreed again** (dbcDelta +0.86 while level -0.30). Consistent with the refs6 correction: the dbc share-spectrum field is not the gate statistic.

## Surviving direction

The fresh-freeze protocol is validated: every unit re-derives its own frame. The atomic change was refuted. Next round: pick from the fresh rungs of the remapped corpus (or the unchanged map, since no keep means no remap).
