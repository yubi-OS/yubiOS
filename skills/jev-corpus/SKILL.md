---
name: jev-corpus
description: "Run the yubiOS corpus-math engine on the steady-orbit worker: null-standardized corpus audit (V2 + curveball null, z, dBc), lens-format experiment candidates, RSI-descent atom plans, tautology classification, curve drift, corpus-to-point-map placements, and per-module selftests — all through /api/jev/corpus/* on https://steady-orbit.systems-a.workers.dev, parity-tested against papers/data/lean/verify_claims.py. Use when an automation, the evolution loop, or a session needs corpus structure measured or an enrichment proposal generated in lens format. Triggers on 'corpus audit', 'jev corpus', 'lens candidates', 'atom plan', 'dBc', 'curveball null', 'tautology gate', 'corpus drift', 'placements'."
metadata:
  short-description: "Corpus-math engine endpoints on the steady-orbit worker"
---

# Jev Corpus: the papers' math engine on the worker

The yubiOS corpus math (V2/curveball null, spherical-harmonic fit, dBc, RSI-descent atom, lens candidates, tautology discernment, drift) runs as deterministic JavaScript on the `steady-orbit` worker, exposed under `/api/jev/corpus/*`. The math's system of record is `yubi-OS/yubiOS/papers/data/lean/verify_claims.py` (v2_corr, curveball) and `tools/rsi-descent`, `tools/spectral-decomposer`, `tools/spectral-defocus`, `tools/boltzmann-collapse`, `tools/tautology-discerner`; the ports are fixture-parity-tested, never re-derived. SPEC: `refs/jev-corpus-2026-10-01.md`.

## When to use

- An automation stage or the evolution cycle needs corpus structure measured (V2 share, z vs the null, dBc level).
- You need lens-format experiment candidates (hypothesis + method + params + expected_delta + caveat) that can become jev directives.
- You want an atom plan (which primitive flips reduce geodesic distance to the ideal pole, Delta >= 0 asserted) WITHOUT executing it.
- You need a sentence classified tautology / falsifiable / paradox / undecidable before admitting a claim.
- You want a corpus placed onto the /map/ point-map surface.

Not for: executing the atom (that is a gated directive, never inline), policy changes, or anything the deterministic math must not authorize.

## Setup

1. Operator key: `Authorization: Bearer <JEV_API_KEY>` (the jev operator connection). `/api/jev/corpus/health` is unauthenticated; everything else 401s without it.
2. Send a User-Agent on every call (Cloudflare 1010 otherwise).
3. Input matrix: JSON `[[0,1,...],...]` or `{rows, cols, data}`. Binary 0/1 for atom/lens; real values allowed for audit.

## The endpoints

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/jev/corpus/health` | GET | - | `{ok, corpus:"ready", modules:{math,atom,lens}}` (no auth) |
| `/api/jev/corpus/audit` | POST | `{matrix, labels?, nulls?}` | `{v2, z, mean, sd, verdict, dbc, shares, E_l, run_id}`; verdict in {"excluded at the resolution of this null","not-excluded"}; nulls default 100, cap 1000; idempotent per input sha256 (repeat returns same run_id + `cached:true`) |
| `/api/jev/corpus/lens` | POST | `{matrix, labels?, top?}` | `{candidates:[...]}` lens format: `{id, cell, kind:"real"|"control", hypothesis, method, params, expected_delta, score}`; returns K reals + K paired controls |
| `/api/jev/corpus/atom` | POST | `{matrix, max_flips?}` | `{plan:[{i,primitive,delta}], finalDelta, converged}` DRY-RUN only; execution is a gated directive |
| `/api/jev/corpus/classify` | POST | `{sentence}` | `{verdict:"tautology"|"falsifiable"|"paradox"|"undecidable", refuter, run_id}` exact parity with the discerner |
| `/api/jev/corpus/placements` | POST | `{matrix, labels}` | audits, then POSTs vectors to the worker's own `/api/map`; returns `{map_id, map_url:"/map/?id=N"}`; <10 rows or D>768 relays the map endpoint's 422 as `MAP_FAILED` |
| `/api/jev/corpus/runs` | GET | - | last 50 run rows (kind, input_hash, result) |
| `/api/jev/corpus/selftest` | GET | - | runs all three module selftests (fixture parity vs the Python sources); 200 all-pass, 500 with failing checks |

## Viscoelastic instruments (added 2026-10-02)

Four bearer-auth routes under `/api/jev/corpus/visco/*` + two pure builtins (`visco_hysteresis`, `visco_snapback`), shipped from the round-3 creep-recovery replay findings. Python source of record: `tools/visco-instruments/` (verify_visco.py + fixtures); the JS port (`jev-visco-math.js`, NEW worker part) is fixture-parity-tested and never re-derived.

| Route | Method | Body | Returns |
|---|---|---|---|
| `/api/jev/corpus/visco/persistence` | POST | `{matrix, flipped_cells:[{row,axis}], regraded:[{pass, rows:[{row, bits}]}], metric?}` | `{applied, persisted, persistence_fraction, dbc:{base,loaded,regraded_passes,delta_load}, scorer_variance:{inter_pass_offset_dbc}, verdict, run_id}`; audits base + loaded internally |
| `/api/jev/corpus/visco/hysteresis` | GET | `?baseline_id=<number>` | `{loops[], total_sum_abs, mean_per_cycle, n_cycles, verdict}`; closes supersedes chains in the outcomes ledger; empty -> `no_data` |
| `/api/jev/corpus/visco/prony` | GET | `?metric=dbc&arms=2` | `{ke, arms:[{k,tau}], fit_quality_r2, sse, series[], t_basis}`; fits over corpus-runs history; <5 points -> 422 |
| `/api/jev/corpus/visco/snapback` | POST | `{series:[{cycle,predicted_delta,realized_delta}]}` or `{baseline_id}` | `{snapback, inversion_runs, verdict, gate_input:{action}}`; verdicts only, never auto-actions |

Sign convention: dBc improvement = MORE NEGATIVE. Rate-dependent R is deliberately deferred (deterministic scoring collapses R to 1; the replay proved this); persistence-under-regrading is the discriminating measurement.

## The flow (what a caller does)

```bash
BASE=https://steady-orbit.systems-a.workers.dev/api/jev/corpus
K="Authorization: Bearer $JEV_KEY"

# 1. Audit a corpus: is its structure distinguishable from the null?
curl -sS -H "$K" -H "User-Agent: omni-agent/1.0" "$BASE/audit" \
  -d '{"matrix": [[1,1,0],[1,0,1],[0,1,1]], "nulls": 200}'
# -> {v2, z, verdict, dbc, shares, run_id}

# 2. Get lens candidates; a real + control pair per sparse cell.
curl -sS -H "$K" -H "User-Agent: omni-agent/1.0" "$BASE/lens" \
  -d '{"matrix": [[1,1,0],[1,0,1],[0,1,1]], "top": 3}'

# 3. Send a candidate into the evolution loop as a directive (fail-closed kinds:
#    note/record_learning auto-execute; repo_push/skill_push/worker_change need approval).
curl -sS -H "$K" -H "User-Agent: omni-agent/1.0" "$BASE/../evolution/sweep" \
  -d '{"sweep": {...}, "findings": [...]}'

# 4. Verify the engine is honest before trusting any result.
curl -sS -H "$K" -H "User-Agent: omni-agent/1.0" "$BASE/selftest"
```

## Automation builtins (Jev Automations stages)

Four pure builtins are registered in the automation engine and usable as `{"type":"builtin"}` stages or builtin-only defs: `corpus_audit` (input `{matrix, nulls?}`), `corpus_lens` (input `{matrix, top?}`), `corpus_drift` (input `{matrixA, matrixB}` or two spectra), `tautology_gate` (input `{text}`). All read-only; `{ref}` / `{source_ref}` inputs are rejected pointing at the routes layer (purity is tested: any fetch during a builtin run fails).

## Evolution integration

The hourly cycle's measure() carries `metrics.corpus` (`{dbc, z, verdict, drift_vs_prev}`) when a matrix is available from cycle history; until 5 completed cycles of history accumulate it records an honest `corpus: {error: "no matrix available this cycle"}` instead of fabricating. Lens candidates flow into the cycle's proposals as `note`-kind directives through the existing fail-closed kinds code.

## RSI chain runbook (added 2026-10-02, after rounds 1-3)

The chain (full contract: `/AGENT.md` on the worker): audit -> lens -> fail-closed directives -> edits -> re-audit, one atomic edit per cycle, 10 cycles per round, round record in `refs/`. Three rounds ran 2026-10-01: skills/ (PR #276, dBc -11.03 -> -12.30, success), worker modules (PR #277, 10 worker_change cycles deployed, selftest green each), refs/ (PR #278, dBc -11.11 -> -10.46, REGRESSION). Lessons round 3 bought:

1. **Sign gate per cycle.** Improvement = dBc MORE NEGATIVE. Re-audit after every cycle; if the realized delta is positive at any cycle, stop, revert that edit, record the negative result, re-lens. Never finish 10 cycles on a wrong-signed trajectory. Round 3 ran all 10 because each individual prediction (+9.8 to +11.5 dBc vs its paired control) looked good while the realized total was +0.64.
2. **`expected_delta` is geometry, not forecast.** It is a prediction over hypothetical bit flips, not of what the resulting prose does to the matrix. Pre-register every candidate in the outcomes ledger (`POST /api/outcomes`, verdict `pending` + `predicted_delta`) before applying; append the realized row with `supersedes` after the re-audit. Round 3 skipped the ledger, so prediction-vs-realized had no home and the regression surfaced only in PR review.
3. **Axis-fill on prose is padding.** A bare "## Inputs" section flips the sparse cell but weakens structure; Reading recommendations #2 already declines vocabulary padding. A cell fills only when the section is source-grounded in the doc's own subject (rounds 1-2 carried each target's measured numbers; round 3's fills were generic). No grounded content -> decline the candidate and record it as content-resistant.
4. **Freeze the task check before cycle 1** (AGENT.md lesson 6/23), and use the instrument surfaces a matrix round otherwise skips at baseline: `/api/map/control` positive control, `/api/map/preview` before applying, admission trials (azimuth/axis/rayleigh).
5. **Matrix re-scoring is a measurement.** If subagents re-score the matrix after edits, scorer drift can move dBc independently of the text. Pin the scoring prompt, re-score only edited rows, report scorer variance with the round.

## Errors

- `401 UNAUTHORIZED` - wrong or missing bearer (except /health).
- `503 CORPUS_NOT_CONFIGURED` - `deps.corpus` missing (deploy-time condition).
- `503 DB_NOT_CONFIGURED` - D1 binding missing.
- `422`/`400` on malformed input shapes; placements relays `/api/map`'s own rejection as `MAP_FAILED`.
- Selftest failure = the port deviates from the fixtures: STOP, do not trust results, re-run the fixture generator (`fixtures/generate_fixtures.py` in the build bundle) against the current `papers/data/lean` sources.

## Examples

**Audit before an RSI cycle**: POST the coverage matrix to /audit, read `verdict` and `dbc`; use `lens` for the cycle's candidate list; attach the top candidate as a directive proposal. The next cycle's `metrics.corpus` then shows whether the executed edit moved the corpus level.

**Gate a claim**: run `classify` on the claim sentence. `undecidable` means no concrete observable was supplied; refuse to publish the claim until it carries one.

**Corpus on the map**: `placements` audits and drops the rows onto /map/ so the structure is visible next to the prior text maps.

## Guidelines

1. Every call carries a User-Agent header, no exceptions.
2. The math never authorizes anything: audit/lens results are data; only directives through the gate act.
3. `/selftest` after any engine-touching deploy, before trusting results.
4. Atom plans are proposals; execution is a gated directive, always.
5. Fixtures are the truth: on any mismatch, the JS is wrong until proven otherwise.

Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.
