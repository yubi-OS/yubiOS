# jev-corpus RSI round refs11 - refs/ corpus (2026-10-03)

Round refs11 of the jev-corpus RSI chain. Branch `refs11-rsi-2026-10-03`, draft PR #288, held for review. FIRST unit round run on the optimized harness (`skills/jev-corpus-unit-round/scripts/baseline.mjs`, shipped after refs10's timing analysis) - this round doubles as the harness's measured validation.

## Frozen baseline check (the unit interval, optimized harness)

- Corpus: `refs/` at main `7af01500fb23` (257 docs x 12 axes; identical refs/ content to refs10's pin - the only commits between are skills/tools, no corpus docs).
- Harness timing: **BASELINE_TOTAL 49.2s** (Phase A score 18.2s at conc 12 || map 5.7s -> map 560; Phase B audit 2.6s || control 30.4s (no retry needed) || instruments 4.7s; Phase C rungs 0.5s). Sequential refs10 measured ~104s of API time -> **2.1x improvement**, close to the ~38s estimate (the control is the Phase B long pole).
- Scorer at conc 12: 257 docs in 18.2s (p50 691ms, p95 2043ms) vs 52.7s at conc 6 in refs10 - **2.9x on the biggest block**, matching the conc-scaling prediction.
- Baseline audit nulls=400: run `cr_e1fbf9065c97b778` - dbc -21.0813, z 5.4783, **level_dbc 14.7730**, verdict excluded-at-this-null. Map 560; admission {rayleigh:true, spectra:true, radius:true; axis_trial/azimuth false}.
- Rungs: three JOINS (s9 -> gap-map-hyperspherical-harmonic-curve via the repo-history family; s3 -> point-map-real-cloud via the adjacent-problems family; s4 -> round8-citation-audit) + one change rung.

## The one atomic change

ADD `refs/repo-history-variant-chain-state-2026-10-03.md`, the s9 rung join: an archive-state record joining the gap-map isolate into the repo-history family (the hyperspherical variant's OMN-163 Backlog state + the changelog-pattern generalization the jev-corpus chain instantiates). Add-check C5/C6 PASS.

- Scorer row: `0,0,0,0,0,0,0,0,1,1,0,0` (composition + knowledge_sources).
- Gate-grade audit: run `cr_2249e2be567180eb` - **level_dbc 15.2797, realized +0.5067** vs baseline 14.7730 -> **KEEP**, bearing ALIGNED (predicted geometric -1 join; realized level positive).
- dbcDelta -0.9347 while level +0.5067: the two statistics disagreed again; the level convention remains the gate.
- Snapback: single-cycle inversion run [[1]] (cross-quantity, no_snapback).
- Commit `3227eef014aaf55e815ac5abd2c628d35de5afa1`; remap -> map 561; realized outcome row 1413 supersedes 1412.

Final corpus level: **level_dbc 15.2797** (net +0.5067 for the unit).

## Findings

- **F1 - the optimized harness validated at 2.1x.** Baseline API time 49.2s vs ~104s sequential (refs10), with the scorer block at 2.9x (18.2s vs 52.7s, exactly the conc-scaling prediction). Zero retries needed on the control this time (30.4s clean); the Phase B long pole remains the control. Full unit wall-clock including GitHub overhead: ~2 minutes, vs ~2.5-3 sequential.
- **F2 - THE BASELINE NOISE FINDING: unit-to-unit baseline level moved -1.02 dB on identical corpus text.** refs10's baseline (15.7957) and refs11's (14.7730) audit the same 257 docs, but each unit re-scores the full matrix fresh - jev jitter on marginal bits flips rows, the input hash changes, and the null ensemble re-draws. The re-measured baseline is therefore itself a random draw with ~±1 dB spread. This is the same order as the keep effects the chain has been gating on (+0.39 to +1.01). Mitigation options: (a) carry rows forward for unchanged docs (hysteresis semantics extended to the whole matrix - the frozen-baseline concept argues for this: a row is a function of the doc's text, and unchanged text should keep its row), which also cuts the score block to one call per unit; (b) nulls >> 400 for baseline-only audits; (c) report the noise and gate within-unit only (the current realized deltas ARE within-unit, so they are not affected - but cross-unit level comparisons are). Recommend (a).
- **F3 - rung joins are now 3/3 under the corrected gate** (+0.85, +1.01, +0.51) while caller-proposed adds remain 0/5. The unit protocol's one-instrument-proposed-change shape keeps matching the generator's hit rate.
- **F4 (harness bug fixed pre-emptively)** - the cycle harness expected state.json which baseline.mjs does not write; the state build from baseline.json + matrix JSONL is now part of the flow (one line; noted for the skill's next revision).

## Instruments

Hysteresis rollup baseline 560: 1 chain (1412/1413), dev 1.5067 (|pred -1 - real +0.51|). Prony over the runs history: r2 0.802-era fit (see steps.log).

## Surviving direction

Rung-join adds under the unit protocol. Next unit: the s3 or s4 rung joins (both still open), and the carried-row baseline (F2 recommendation) as the next protocol refinement.
