> NOTE (recovery): the original `session/SPEC-VISCO.md` file body was never echoed in full in the transcript — the file was written to that session's temp dir and referenced only by link (session artifact, not repo-truth). What follows is the spec reassembled verbatim from the transcript passages that carry its content, in document order. Unrecoverable sections are marked inline.

# SPEC-VISCO.md — `/api/jev/corpus/visco` instrument surface (steady-orbit worker)

## Scope of the /visco surface based on the replay findings

1. **Re-grade (persistence) leg** — not revert R. Endpoint: score/load-unload persistence measurement. Input: baseline matrix + loaded matrix + (optional) a set of re-graded rows; output: persistence fraction, level moves.

2. **Hysteresis rollup on /api/jev/map/outcomes** — close supersedes chains into loops, compute sum |predicted − realized| per round.

3. **Prony relaxation fit over audit history** — from corpus runs history: fit ke + Σkj e^(−t/τj) per metric (dBc, z, v2).

4. **Snap-back detector** — consecutive realized-vs-predicted sign flips → gate input.

5. **Scorer-variance instrumentation** — grader-pass offset reporting (5.77 dBc lesson).

## Design decisions to make in the spec

- Where does it live: new module part(s) on the steady-orbit worker (jev-visco.js?) following the jev-corpus module pattern (pure math modules + routes glue + fixtures parity tests + selftest).
- Data sources: D1 (corpus runs table, outcomes ledger rows), request-supplied matrices.
- Endpoints shape: /api/jev/corpus/visco/* — persistence, hysteresis, prony, snapback, selftest.
- Test strategy: fixture parity vs a Python source of record (per the program's discipline: "never re-derived", parity-tested). The math source of record should be a Python reference implementation (like verify_claims.py pattern) — new file papers/data/... or tools/? The jev-corpus skill says system of record = papers/data/lean/verify_claims.py + tools/*. For the visco math (Prony fit, hysteresis), a new tools/ script could be the Python source of record: `tools/visco-instruments/` maybe. That matches her corpus-math discipline.
- Rate-dependent scorer question: R becomes non-trivial with stochastic scorer — spec should include the scorer-variance protocol (re-grade leg uses independent grader rows supplied by the caller, since the worker can't grade prose).

What the worker can compute deterministically:

- persistence: given base matrix, loaded matrix, and re-graded rows (caller supplies), compute persisted fraction + dBc deltas via audit calls (audit is available internally).
- hysteresis: query /api/jev/map/outcomes rows (D1) grouped by baseline_id/supersedes chains → loop areas.
- prony fit: from stored corpus runs (jev_corpus_runs table) — but does it store dBc history? Runs table stores input_hash + result. Need timestamps? The runbook says audit history accumulates. Fit needs an ordered series of (t, metric). The runs table has rows with result JSON; presumably has created_at. Fit K=1..2 arms Prony by least squares (nonlinear in tau; do a grid over tau + linear least squares for amplitudes — deterministic and simple).
- snapback: given a series of (predicted, realized) deltas, detect sign inversion runs.

## Endpoints and design decisions

1. Endpoints under /api/jev/corpus/visco/*:
   - POST /visco/persistence — input {matrix (base), flipped_cells or loaded matrix, regraded_rows?} → audits internally (reuse corpus audit math, no re-derivation), computes persisted fraction + dBc deltas + level moves. Caller supplies re-graded rows because the worker can't grade prose.
   - GET /visco/hysteresis?baseline_id= — closes supersedes chains in the outcomes ledger, returns per-round hysteresis: sum|pred-realized|, mean, loops.
   - GET /visco/prony?metric=dbc — fits Prony series (K=1..2 arms) to the ordered audit history from the corpus runs table; returns {ke, arms, fit_quality, n_points}. Grid-over-tau + linear least squares for amplitudes (deterministic).
   - POST /visco/snapback — input {series: [{cycle, predicted_delta, realized_delta}]} (or reads ledger) → detects sign-inversion runs + returns snapback verdict. Also callable as gate input.
   - GET /visco/selftest — fixture parity tests.
2. Automation builtins: visco_hysteresis, visco_snapback (pure, read-only) so the evolution cycle can consume them (like corpus_audit/corpus_drift).
3. Math source of record: new Python reference `tools/visco-instruments/verify_visco.py` in yubi-OS/yubiOS (parity-tested, never re-derived — the program's discipline). JS ports fixture-parity-tested.
4. Scorer-variance instrument: persistence endpoint accepts multiple grader passes and reports inter-pass offset (the 5.77 dBc lesson).
5. Rate-dependent R: out of scope v1 (needs stochastic scorer); the spec documents why (deterministic collapse) and what would make R non-trivial.

## Integration points and module layout

The spec needs to be grounded in the actual worker architecture. Key integration points for the spec:

- New module: jev-visco.js (pure math) + jev-visco-routes.js glue (or fold routes into jev-corpus-routes.js? The corpus engine pattern: jev-corpus-routes.js is the routes glue for /api/jev/corpus/*). Better: jev-visco-math.js (pure) + routes added to jev-corpus-routes.js + builtins registered in jev-corpus-builtins.js + fixtures added to fixtures/corpus-math-fixtures.mjs + selftest wired into the corpus selftest module.
- The spec should require lanes to pull the live bundle fresh and follow the steady-orbit-deploy skill.
- Python source of record: tools/visco-instruments/ in yubi-OS/yubiOS with verify_visco.py + fixtures generator.
- Endpoint contract detail: POST /api/jev/corpus/visco/persistence {matrix, flipped_cells:[{row,axis}], regraded_rows:[{row, bits}], metric:"dbc"} → audits matrix and loaded matrix internally (reuse corpus audit math — NOT via HTTP to itself; call the same internal functions the audit route uses), computes: persisted_cells (count of flips credited by regraded rows), R_persistence, level deltas, scorer-variance report if multiple grader passes supplied.
- Tests: fixture parity vs Python; selftest extension; e2e vs the replay's recorded numbers (102.9 hysteresis, 9/9 persistence, 5.77 offset).
- Deploy: steady-orbit-deploy skill mechanics; entry module route additions to exclusion list if any new page routes (none — API only); preserve crons + bindings; selftest after deploy.

## `/api/jev/corpus/visco` — capability map (jev-qualified)

Every design decision cleared (persistence-first 0.83, Python source of record 0.88, deterministic Prony fit 0.82, builtins 0.89, scope "about right" at 0.97 confidence).

| # | Capability | Endpoint | What it does |
|---|---|---|---|
| C1 | Persistence (re-grade leg) | `POST /visco/persistence` | Audits base + loaded matrices internally, takes caller-supplied re-graded rows, returns persistence fraction + level deltas + **inter-pass scorer offset** (the 5.77 dBc finding as a first-class output) |
| C2 | Hysteresis rollup | `GET /visco/hysteresis?baseline_id=` | Closes supersedes chains in the outcomes ledger, returns sum \|pred−realized\| per round (round 3 = 102.9 dBc-units as the calibration anchor) |
| C3 | Prony relaxation fit | `GET /visco/prony?metric=dbc&arms=2` | Fits ke + Σkⱼe^(−t/τⱼ) to the ordered audit history from the corpus runs store; deterministic τ-grid + NNLS, K≤3 |
| C4 | Snap-back detector | `POST /visco/snapback` | Sign-inversion detection on predicted-vs-realized series; emits `gate_input` verdicts (mechanizes the round-3 lesson), never auto-actions |
| C5 | 2 pure builtins | automation registry | `visco_hysteresis`, `visco_snapback` — the hourly evolution cycle consumes them like corpus_audit |
| C6 | Selftest extension | `GET /corpus/selftest` | visco fixture-parity checks join the existing gate |

**Design spine:** Python source of record first (`tools/visco-instruments/verify_visco.py` in yubi-OS/yubiOS with the replay's recorded numbers as fixture anchors), JS ports fixture-parity-tested (never re-derived), no new D1 tables, no LLM grading on the worker, entry module untouched. Rate-dependent R explicitly out of scope v1 with the unlock condition documented.

[RECOVERY GAP: the original file's own headings, §-numbering beyond the §1-2 instrument contracts, the ideate-solo one-pager text (separate file: visco-surface-ideate-solo-2026-10-02.md), the raw jev /api/decide QC payloads, and any sections never echoed in the transcript (e.g. a dedicated Risks section) could not be recovered verbatim.]

## Build shape

4 parallel lanes (general/smart): **A** Python reference + fixtures → **B** JS math port + parity → **C** routes + builtins glue (fresh bundle pull, live schema) → **D** e2e vs the replay's recorded numbers. Advisor reconciles and deploys via the steady-orbit-deploy skill, preserving crons + bindings, selftest green before anything is trusted. Then skills + refs doc ship to yubiOS.

Per SPEC-VISCO.md:
- Lane A — Python source of record: `tools/visco-instruments/` (verify_visco.py + generate_fixtures.py) in yubi-OS/yubiOS, selftests with the replay's recorded numbers as fixture anchors.
- Lane B — JS math port + fixtures: jev-visco-math.js + parity tests.
- Lane C — routes + builtins glue: wire 4 routes + 2 builtins into the live module graph.
- Lane D — e2e: after deploy.
- Advisor: reconcile, deploy via steady-orbit-deploy skill, live-verify.

## Instrument contracts (SPEC-VISCO.md §1-2)

Lane A prompt details — instrument contracts from SPEC-VISCO.md §1-2:

1. persistenceStats(base_matrix, loaded_matrix, flipped_cells, regraded_passes) →
   - applied = flips where base bit 0
   - persisted = applied flips credited (bit 1) in regraded rows
   - persistence_fraction
   - level deltas computed by caller via audit (Python: implement a local audit? NO — the Python source of record implements the math functions; the audit itself is the corpus math (verify_claims.py's v2_corr/curveball). For fixture purposes, persistence level-deltas are computed by the worker's audit. So verify_visco.py's persistenceStats should take dbc values as inputs (base_dbc, loaded_dbc, regraded_dbcs[]) and compute deltas + inter-pass offset. Keep the Python function pure on given metrics; the JS route calls the audit internally then feeds persistenceStats.)
   Contract: persistenceStats({applied, regraded_bits, base_dbc, loaded_dbc, regraded_dbcs}) → {persisted, persistence_fraction, deltas, scorer_variance:{inter_pass_offset_dbc, max_pass_spread}}
2. hysteresisRollup(rows) → close supersedes chains: rows [{predicted_delta, realized_delta, supersedes?}] → chains → per-chain sum|pred-realized|, mean, area; total.
3. pronyFit(series, arms) → {ke, arms[{k,tau}], fit_quality R², fitted[]}. Grid tau log-spaced 1e-2..1e4, NNLS-ish (clip negatives; document), K≤3.
4. snapbackDetect(series) → inversion runs: consecutive cycles where sign(realized_delta) opposes sign(predicted_delta)... define: pre-registered direction = predicted sign; snap-back when realized moves opposite for ≥2 consecutive cycles. Return {snapback, inversion_runs, gate_input}.

## Fixture anchors (recorded)

Fixture anchors (recorded):
- predicted = [11.50,10.84,10.44,10.10,10.12,10.07,10.34,10.17,10.14,9.79]
- realized deltas = [0.16,0.01,0.44,-0.10,0.40,-0.07,-0.39,0.24,0.28,-0.32]
- hysteresis sum = 102.86, mean 10.29
- prony series = the 11 recorded dBc trajectory points (cycle-indexed t)
- snapback: realized sign flips vs predicted (all predicted positive; realized negative at cycles 4,6,7,10 → inversion runs)
- persistence: synthetic small fixture + the recorded 9/9 case summary

## policy_version stamp + /visco/policy-log additions (second leg, jev-go 2026-10-03)

So the next build:
1. Stamp `policy_version` on every `jev_corpus_runs` row (and probably new audit runs too).
2. A wipe-proof policy-changelog: a compact append-only table (version, timestamp, diff summary) that the wipe protocol never touches — and record the current known policy history (v1→v5 with whatever timestamps are recoverable... the audit events were wiped, so the changelog table starts NOW with v5 as the baseline entry, plus backfill what's known: v1 2026-10-01, v2 credential scope, v3 audited learning l_48cba140e930354f, v4 l_415c2960c6ec1556, v5 l_087eda59277032e1 — those are from memory; timestamps for v3/v4/v5 exist in memory approximately. I can seed the changelog with known entries marked as backfilled-from-memory, with a flag).

Design decisions:

- Where: jev-corpus-deps.js / dbx.js (D1 schema auto-applies). New table `jev_policy_changelog` (id, created_at, version, actor, source, summary, backfilled int). Stamp on runs: `jev_corpus_runs` gets a `policy_version` column — ALTER TABLE ADD COLUMN (D1 supports ALTER; the schema auto-apply pattern in dbx — need to check how schema migrations work in this worker; the memory says "D1 jev_* tables (schema auto-applies)". Adding a column needs an ALTER — the dbx pattern probably has an ensureSchema that runs CREATE TABLE IF NOT EXISTS + ALTERs. The lane should read the live dbx.js and follow its schema-evolution pattern).
- The stamp: where are runs written? /api/jev/corpus/audit writes run rows (cr_*). The insert must add policy_version = current policy version from KV jev-policy.json.
- Backfill: existing 35 rows get policy_version = 5 (they're all post-v5? The runs span 2026-10-01 onwards; v5 was promoted 2026-10-01 ~13:00Z; runs from before v5 would be mislabeled. Honest approach: backfill with NULL and let the API report nulls as unknown, OR backfill with a marker. Better: backfill NULL + the changelog starts at v5-now; the prony endpoint can filter/report. Actually the WLF study needs per-version series; NULL-stamped historical rows just belong to "pre-stamp era". Keep it honest: new runs get stamped; old rows NULL.
- Also expose policy_version in the audit response + a GET /api/jev/corpus/visco/prony param to filter by policy_version? Keep scope minimal: stamp + changelog table + changelog endpoint (GET /api/jev/corpus/visco/policy-log or fold into /api/jev/summary?). Minimal per spec: new table + stamp + one small route to read the changelog + runs response includes policy_version. Also the prony endpoint could accept &policy_version=N filter — cheap and directly serves the study. Add it.
- Who writes the changelog: policy promote flow (jev-improve.js promote route) should append a row on every policy version bump. Need to find where policy version bumps happen (the audited improve path: jev-improve.js). Add changelog insert there. Plus seed v5 baseline entry at deploy time (first request ensureSchema inserts v5 if table empty).
- Wipe-proof: the wipe protocol was a manual D1 DELETE by session — "a table the wipe protocol never touches" is a convention note, not code. Document in AGENT.md/skill: jev_policy_changelog is never wiped.

## Endpoint contracts (final form, as documented in AGENT.md)

| METHOD | route | contract |
|---|---|---|
| POST | `/api/jev/corpus/visco/persistence` | `{matrix, flipped_cells:[{row,axis}], regraded:[{pass, rows:[{row, bits[12]}]}], metric?}` audits base + loaded internally, measures persistence of flips under independent re-grading; returns `{applied, persisted, persistence_fraction, dbc:{base, loaded, regraded_passes, delta_load}, scorer_variance:{inter_pass_offset_dbc}, verdict, run_id}` |
| GET | `/api/jev/corpus/visco/hysteresis?baseline_id=N` | closes supersedes chains in the outcomes ledger; `{loops[], total_sum_abs, mean_per_cycle, n_cycles, verdict}`; empty ledger -> `no_data` |
| GET | `/api/jev/corpus/visco/prony?metric=dbc&arms=1-3` | Prony relaxation fit over corpus-runs history (t_basis `created_at`); `&policy_version=N` filters to one policy version; <5 points -> 422 `INSUFFICIENT_SERIES` |
| POST | `/api/jev/corpus/visco/snapback` | `{series:[{cycle, predicted_delta, realized_delta}]}` or `{baseline_id}`; `{snapback, inversion_runs, verdict, gate_input:{action:"halt_round"|"continue"}}`; verdicts only, never auto-actions |
| GET | `/api/jev/corpus/visco/policy-log` | `{log:[{id, created_at, version, actor, source, summary, backfilled}], current_version}`; wipe-proof policy changelog |
| (builtins) | `visco_hysteresis`, `visco_snapback` | pure automation builtins for the hourly cycle; purity contract same as corpus builtins |

Visco instruments (shipped 2026-10-02/03): source of record `tools/visco-instruments/` (yubiOS) + `jev-visco-math.js` (fixture-parity). Every `jev_corpus_runs` row carries `policy_version` (NULL = pre-stamp era); `jev_policy_changelog` is the wipe-proof policy history; the promote flow appends on every bump.

## Persistence protocol (rate-dependent scorer decision B, 2026-10-02)

- **Persistence protocol (rate-dependent scorer decision B, 2026-10-02).** Each round re-grades every edited row with >=2 independent grader passes and feeds all passes to `POST /api/jev/corpus/visco/persistence`; report `scorer_variance.inter_pass_offset_dbc` with the round. The pass spread is the rate dimension; a flip credited inconsistently across passes sits inside measurement noise.

## Acceptance (e2e anchors, recorded round-3 numbers)

| endpoint | result |
|---|---|
| `POST /visco/snapback` | recorded round-3 series → inversion runs `[[4],[6,7],[10]]`, verdict `snapback`, gate_input `halt_round` — exact match with the Python fixture |
| `GET /visco/prony` | 35 points from live runs history, t_basis `created_at`, 2 arms (τ 45.8, 476.4), r² 0.069 honest |
| `GET /visco/hysteresis` | numeric baseline → correct `no_data` empty shape |
| `POST /visco/persistence` | 2 flips applied, 1 persisted, fraction 0.5, `partially_persisted`, run `cr_1098cf9f0d919960` |

Deploy acceptance: 37 parts (NEW `jev-visco-math.js`), 7 changed, entry module byte-identical, crons + 13 bindings preserved. Etag `4da009ce…196b9c` (visco leg) / `6c43a6e4…8d68` (policy-stamp leg, 4 edited, none added, selftest 90/90). Selftest 200 all-pass with the visco parity checks now inside the gate.
