# /api/jev/corpus/visco — build record, 2026-10-02

Shipped: the viscoelastic instrument surface on the steady-orbit worker, per `SPEC-VISCO.md` (session) and the replay findings in `knowledge/linear-viscoelasticity/08-creep-recovery-replay.md` (yubi-OS/knowledge PR #11).

## What shipped

Four bearer-auth routes under `/api/jev/corpus/visco/*` + two pure automation builtins, all math fixture-parity-tested against a new Python source of record:

| route | does |
|---|---|
| `POST /visco/persistence` | audits base + loaded matrices internally, measures persistence of flipped cells under caller-supplied independent re-graded rows, reports inter-pass scorer offset |
| `GET /visco/hysteresis?baseline_id=N` | closes supersedes chains in the outcomes ledger, returns sum/mean \|predicted - realized\| per round |
| `GET /visco/prony?metric=dbc&arms=2` | fits a Prony relaxation series (tau grid + non-negative least squares, K<=3) over the corpus-runs history (t_basis `created_at`, row-index fallback) |
| `POST /visco/snapback` | sign-inversion detection on predicted-vs-realized series; emits `gate_input` verdicts (`halt_round`/`continue`), never auto-actions |
| builtins | `visco_hysteresis`, `visco_snapback` — pure, read-only, registered for the hourly evolution cycle |

New repo surface: `tools/visco-instruments/` (verify_visco.py, generate_fixtures.py, CONTRACTS.md, fixtures/visco-fixtures.json) — the system of record; the JS port (`jev-visco-math.js`, NEW worker part) is fixture-parity-tested and never re-derived.

## Build process

Full-stack lanes per the standing process: Lane A (Python source of record, 15/15 selftest, 102.86 hysteresis anchor reproduced exactly), Lane B (JS port, 9/9 parity on first run), Lane C (routes + builtins + deps + selftest wiring, discovered the live ledger schema: `observed_delta` column, `jev_corpus_runs.created_at` usable as time), advisor (reconciled 5 contract ambiguities — persistenceStats object-shape call-site bug that would have crashed C1 at runtime, pronyFit opts-object bug that silently fit 2 arms for any arms value, plus an advisor-owned fix in jev-corpus-math.js selfTest to skip visco_* fixture kinds).

## Deploy

- Worker: 37 parts (36 live + NEW jev-visco-math.js), 7 changed, entry module `solar-rbs-entry.mjs` byte-identical, uploaded via the modules API from live settings metadata (13 bindings preserved), cron schedules preserved (`0 * * * *`, `*/5 * * * *`). Deploy etag `4da009ce42999ad623b24d1fea2dd1f73213b57b0f8cd4090271e58006196b9c` (2026-10-03 ~04:53 UTC).
- Post-deploy: `/api/jev/corpus/selftest` 200 all-pass (now includes visco parity checks), health green.

## Live verification (e2e)

- `snapback` on the recorded round-3 series: inversion runs `[[4],[6,7],[10]]`, verdict `snapback`, gate_input `halt_round` — matches the Python fixture exactly.
- `prony?metric=dbc&arms=2` on live runs history: 35 points, t_basis `created_at`, ke -13.54, 2 arms (tau 45.8, 476.4), fit_quality_r2 0.069 — honest low fit on the mixed-history series (the recorded round-3 trajectory alone fits at r2 ~ 0 with a ke-only model; documented in fixtures).
- `hysteresis?baseline_id=999999`: `{loops:[], verdict:"no_data"}` — correct empty-ledger shape.
- `persistence` e2e: 2 flips applied, 1 persisted, fraction 0.5, verdict `partially_persisted`, audits base -14.85 / loaded -14.49, run `cr_1098cf9f0d919960`.

## Design decisions carried (jev-qualified, task ta9ac373)

persistence-first 0.83; Python source of record with parity ports 0.88; deterministic Prony (tau grid + NNLS) 0.82; builtins 0.89; scope "about right" 0.97. Out of scope v1: LLM grading on the worker, new D1 tables, console tab, WLF policy-shift surface, rate-dependent R (documented deferral: deterministic scoring collapses R to 1; the unlock is a stochastic/rate-dependent scorer owned by the caller).
