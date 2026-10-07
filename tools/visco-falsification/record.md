# Round record — visco falsification fixtures (snapback + hysteresis)

Lane C, build order items 5+6 of `refs/falsification-harness-coverage-2026-10-06.md` (yubi-OS/yubiOS main).
Date: 2026-10-07 (UTC). Executor: steady-orbit worker endpoints, live, via the "Steady Orbit jev operator" bearer connection (conn_QAvrBSyEG8ml); worker executor because the sandbox is Cloudflare-1010-blocked on workers.dev. **Nothing was pushed to any repo — this record is for orchestrator review.**

## Verdict: BOTH ENDPOINTS PASS THEIR PRE-REGISTERED FALSIFICATION GATES

- **Snapback (item 5): 852/852 cases pass; all six gates PASS.**
- **Hysteresis (item 6): all four gates PASS (H0 repo fixtures, H1 live parity, H2 contract, H3 analytic fixtures).**

## 1. Pre-registration (written before any corpus run)

`preregistration.md` — pinned input contracts, class table with predicted verdicts, gates G1–G6 / H0–H3, declared limitations. `amendments.md` — every change dated, pre-run, with a-priori justification. `probes.json` — the schema-discovery log everything was pinned from. Preregistration discipline held: no gate moved after results; both mid-run corrections were **harness bugs** (amendments 04:40Z, 04:44Z), logged with their discarded data explicitly NOT counted toward any gate.

## 2. Snapback corpus + results

Artifacts: `snapback-corpus.json` (843 cases, seeds + expected pinned), `snapback-results.json` (852 per-case records + gates).

Corpus: A aligned-meaningful ×12, B aligned-negative ×4, C inverted-halt ×10, D isolated-inversion ×8, E zero-no-flip ×6, F recorded round-3 series (source-of-record fixture) ×1, F2 clean-single-inversion fixture ×1, F3 prereg fallback ×1, G ledger-path ×4, N noisy tiers 4×200 = 800. Deterministic LCG generators (`0xC0FFEE ^ case_index`), magnitudes ∈ [0.5, 5.5], n ≤ 10; per-case SHA-256 of the canonical series recorded for corpus↔runner parity.

| gate | result | detail |
|---|---|---|
| G1 noiseless verdict (A–F, 100%) | **PASS 43/43** | verdict AND gate_input.action match prediction everywhere |
| G2 exact runs | **PASS** | inversion_runs + run_lengths exact in every noiseless case and all ledger-path cycle labels |
| G3 noisy per-trial (100%) | **PASS 800/800** | live verdict matches the independent pinned oracle on every seeded trial |
| G4 noisy-tier FPR (±0.04 of analytic) | **PASS 4/4 tiers** | p=0.05: 0.025 vs 0.02138; p=0.10: 0.060 vs 0.08025; p=0.20: 0.280 vs 0.27334; p=0.30: 0.475 vs 0.50359 |
| G5 determinism | **PASS 5/5** | duplicate posts identical (run_id excluded) |
| G6 shape + parity | **PASS** | all pinned fields present, `n_points` correct, `source` inline/ledger correct; 0 SHA mismatches, 0 generator-consistency mismatches |

Headline anchor: the **true recorded round-3 series** (from `tools/visco-instruments/fixtures/visco-fixtures.json`) reproduced live exactly: runs `[[4],[6,7],[10]]`, lengths `[1,2,1]`, verdict `snapback`, `halt_round` — matching the recorded e2e in `refs/visco-instruments-2026-10-02.md`.

## 3. Hysteresis reference + fixtures + live contract

Artifacts: `hysteresis-fixtures.json`, `hysteresis-results.json`.

| gate | result | detail |
|---|---|---|
| H0 frozen repo fixtures | **PASS 2/2** | `round3_recorded`: **102.86000000000001 total** (tol 0.05), mean 10.286 (tol 0.01), 10 singleton loops, active 10, n_cycles 10 — the 102.86 anchor reproduced by the local reference exactly. `synthetic_two_loops`: exact to the contract's `1e-9·(1+|expected|)` rule incl. per-loop sums and means |
| H1 live parity | **PASS 3/3** | local reference recomputed from the live ledger rows reproduces the live route for baselines 565 (1.0235), 566 (3.8995, 4 loops), 569 (0.7047) to 1e-9 — chain_ids, predicted/realized arrays, ledger_chain_ids, active/skipped/ledger_rows all exact |
| H2 contract | **PASS 9/9** | 422 no-param, 422 non-numeric, 200 `no_data`+note on empty baselines (0/1/99999/−1), `measured` shape complete on data baselines, arithmetic identities hold |
| H3 analytic fixtures (reference-only) | **PASS 9/9** | single-row-both-shapes, multi-cycle supersedes chain, mixed chains, pending-only, pending-chain-root, supersedes-cycle→singletons, unknown-supersedes→root, duplicate-ids→throw, empty→zeros |

**Key consolidation semantics now mechanized-fixture-backed** (documented in CONTRACTS.md §2, validated here): per-row area `|predicted_delta − realized_delta|` over the whole supersedes chain (superseded attempts dissipate too); `mean_abs = sum_abs / len(chain)` (chain length counts every row); n_cycles = loop count; unknown supersedes → root; supersedes cycles → leftover singletons; duplicate ids → throw.

## 4. Amendments (all pre-gate, dated, in `amendments.md`)

1. **04:35Z** — class F upgraded from synthetic fallback to the true recorded series located in the repo's frozen fixtures; F2 (clean-single-inversion fixture) and F3 (retained fallback) added; hysteresis reference upgraded to the documented CONTRACTS.md rules + H0 gate; G4 analytic FPRs pinned numerically.
2. **04:40Z (pre-rerun)** — tier p=0.20/0.30 runner seed-index misalignment found during assembly: the first 400 calls measured an unintended corpus and are **discarded** (harness bug, not an endpoint failure); re-run with corrected offset; gates for those tiers evaluated only on the corrected run.
3. **04:44Z (H0 catch)** — the local hysteresis reference initially implemented root-prediction pairing (28.1 vs frozen 26.1); the frozen `synthetic_two_loops` fixture **falsified it**, and the reference was corrected to the documented per-row rule. This is gate H0 doing exactly its job — the reference was wrong until proven otherwise.

## 5. Live-endpoint surprises (schema/behavior notes)

- Snapback validation is lenient where the error messages are strict elsewhere: string/float cycles, string deltas, `null` deltas, NaN-as-null, negative/duplicate/out-of-order cycles and extra fields all return 200 (only non-finite/absent deltas and non-object bodies 4xx/400). Worth a contract note upstream — `predicted_delta: null` silently counts as a point (n_points=1) with no inversion.
- `gate_noise_context` was `null` in every probe and every corpus case; its population condition is unknown (documented as out of scope; no gate depends on it).
- `{series, baseline_id}` supplied together: series wins, `baseline_id` echoes `null`.
- Hysteresis accepts negative and zero baseline ids (no positivity check) — they behave as empty ledgers.
- The live route's `loops[].chain_ids` carry only the ACTIVE (realized) row id; the full chain lives in `ledger_chain_ids` — a shape difference from the pure-function contract worth knowing for consumers.

## 6. Honest limitations

- **Hysteresis synthetic-ledger shapes are reference-only.** The live route reads only the production D1 outcomes ledger and accepts no synthetic ledger input; without writing production rows (out of scope — nothing was written anywhere), chain shapes beyond the observed two-phase pair form (multi-realization chains, caller-supplied both-shapes ledger rows) cannot be falsified live. H0 (frozen source-of-record fixtures) + H1 (live parity on real data) partially compensate; the multi-realization fill rule is flagged as interpretation in `hysteresis-results.json`.
- **The 102.86 round-3 anchor is not re-runnable against the live route** (its ledger rows predate the current 12-row ledger; max live rollup is now 3.90). It IS reproduced exactly by the local reference from the frozen fixture (H0).
- `gate_noise_context` semantics unpinned (always observed `null`).
- Noisy-tier trials pin the endpoint's correctness on noisy inputs (G3) and the gate design's false-halt profile (G4); they do not certify the noise generator beyond the G4 windows.
- Corpus reruns must regenerate from the pinned seeds (`0xC0FFEE ^ global_case_index`, generation order A→B→C→D→E→F→F2→F3→N tier-major, 43 pre-N cases + 800 N cases) — the tier-2/3 misalignment amendment documents exactly the failure mode of getting that offset wrong.

## 7. File inventory (session/subagent/lane-c-visco/)

- `preregistration.md` — pre-registered parameters, classes, gates
- `amendments.md` — 4 dated entries, all pre-gate, with justifications
- `probes.json` — full schema-discovery log (both endpoints, pre-prereg)
- `snapback-corpus.json` — 843 cases + SHA digests + pinned expected values
- `snapback-results.json` — 852 per-case records + gate verdicts (852/852 pass)
- `hysteresis-fixtures.json` — reference inputs: 2 frozen repo fixtures + 9 analytic fixtures
- `hysteresis-results.json` — H0/H1/H2/H3 verdicts + interpretation notes (overall pass)

## 8. Recommended next steps for the orchestrator

1. Ship the corpus + fixtures + record into the repo (suggest `tools/visco-instruments/fixtures/` for the harness JSONs and `refs/` for this record), closing items 5 and 6 of the falsification-harness build order.
2. Consider wiring the 843-case snapback corpus + H0/H1 into `/api/jev/corpus/selftest` as committed regression anchors (the pattern the other instruments use).
3. File the two contract observations (lenient snapback validation; `loops[].chain_ids` active-only shape) for a future CONTRACTS.md clarification.
