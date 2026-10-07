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
| `/api/jev/corpus/audit` | POST | `{matrix, labels?, nulls?}` | `{v2, z, mean, sd, verdict, dbc, shares, E_l, run_id}`; verdict in {"excluded at the resolution of this null","not-excluded"}; nulls default 100, cap 1000; idempotent per input sha256 (repeat returns same run_id + `cached:true`) | **Decision-B multipass mode (2026-10-03, etag adae39aa):** `{passes: [matrix x 2..8], labels?, nulls?}` audits EACH pass through the same computeAudit path and returns `{multipass, n_passes, passes:[{v2,z,dbc,verdict,run_id}], dbc_mean, dbc_min, dbc_max, inter_pass_offset_dbc}` (aggregate response-only; passes recorded + idempotent). The pass spread is the elastic-vs-plastic band.
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
| `/api/jev/corpus/scorer/score` | POST | `{doc:{name,text}, hysteresis?:{low,high,pre_row}}` | structured-evidence scorer v2: deterministic per-axis evidence extraction (pinned regexes) + ONE batched jev-1.13 request (12 noul questions, threshold 0.5); returns `{name, row[12], probs, evidence_counts, hysteresis_applied, defapi.consumed}`; ~$0.0002/call; the low-noise scorer that resolved the refs3 finding (free-prose band 6-8x the true effect); v2.1 hysteresis removes threshold jitter; run rows kind `scorer` |
| `/api/jev/corpus/scorer/matrix` | POST | `{docs 1..20, hysteresis?:{pre_rows[]}, spacing_ms?}` | paced batch scoring (default 4.5s between docs); one run row kind `scorer-matrix` |
| `/api/jev/corpus/visco/persistence` | POST | `{matrix, flipped_cells:[{row,axis}], regraded:[{pass, rows:[{row, bits}]}], metric?}` | `{applied, persisted, persistence_fraction, dbc:{base,loaded,regraded_passes,delta_load}, scorer_variance:{inter_pass_offset_dbc}, verdict, run_id}`; audits base + loaded internally |
| `/api/jev/corpus/visco/hysteresis` | GET | `?baseline_id=<number>` | `{loops[], total_sum_abs, mean_per_cycle, n_cycles, verdict}`; closes supersedes chains in the outcomes ledger; empty -> `no_data` |
| `/api/jev/corpus/visco/prony` | GET | `?metric=dbc&arms=2` | `{ke, arms:[{k,tau}], fit_quality_r2, sse, series[], t_basis}`; fits over corpus-runs history; <5 points -> 422 |
| `/api/jev/corpus/visco/snapback` | POST | `{series:[{cycle,predicted_delta,realized_delta}]}` or `{baseline_id}` | `{snapback, inversion_runs, verdict, gate_input:{action}}`; verdicts only, never auto-actions |
| `/api/jev/corpus/visco/policy-log` | GET | - | `{log:[{id, created_at, version, actor, source, summary, backfilled}], current_version}`; wipe-proof policy changelog (auto-seeded baseline row; promote flow appends on every version bump) |

Decision model (2026-10-03, policy v6): the policy's `decision_model` field selects the backend — `jev-1.13` (DefAPI REST, default) or `clef`/`clef-flash` (Workers AI binding, no egress, no key). Policy v6 = clef at `thresholds.decision_threshold` 0.55. askJev switches transparently; the scorer, orchestrator, automations, and evolution all inherit. The clef frame is NOT comparable to the jev frame (baseline run cr_7a24bbc33f5ef6b5: level_dbc 18.7237, z 8.6335); hysteresis carriers for the clef frame live in the unit workdir's matrix_clef_dedup.jsonl. Clef-frame hysteresis band for callers: 0.50/0.60 (mirrors the jev-era ±0.05 structure around the 0.55 threshold). Remaining DefAPI call sites: the /api/decide site relay in index.js (hot path; clef-flash follow-up) and the Python scorer source of record (jev-frame only).

Sign convention (CORRECTED 2026-10-03, refs6 finding): the round gate reads `level_dbc = 20*log10(|z|)` — the verify_claims.py claim-8 corpus level, now returned by `/audit` — and improvement is level UP (the corpus more distinguishable from the null). The audit's `dbc` field is a DIFFERENT statistic (L2 share-spectrum distance to the null-vacuum mean, negative when close) and is uncorrelated with z at cycle scale; do not gate on it. **Policy stamp (2026-10-03):** every `jev_corpus_runs` row carries `policy_version` (NULL = pre-stamp era, never backfilled); `/visco/prony` accepts `&policy_version=N` to fit a per-version series (the WLF policy-shift study's data requirement). `jev_policy_changelog` is the wipe-proof policy history table. Rate-dependent R is deliberately deferred (deterministic scoring collapses R to 1; the replay proved this); persistence-under-regrading is the discriminating measurement.

## Structured-evidence scorer v2 (added 2026-10-03)

The low-noise scorer behind the round-refs3 finding. Stage 1 is deterministic evidence extraction per axis (pinned regexes, up to 8 lines); stage 2 is ONE batched jev-1.13 request per doc-state (12 noul questions, threshold p >= 0.5). Residual jev jitter is +/-0.01 on probabilities; the v2.1 hysteresis rule (flip only if p >= 0.55 / p <= 0.45, else carry the pre-edit row) removes threshold-crossing jitter entirely. Parity-tested byte-identical against the Python source of record (session/r15/scorer_v2.py — session artifact, not repo-truth) on the arm64-path-a pre/post states. The /selftest now includes the scorer's extraction checks (92 checks total). Under this scorer the K-pass protocol becomes verification, not the gate: the plain sign gate returns (keep when the realized delta is negative). The scorer DECIDES bits; it never authorizes anything and never edits anything.

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

0. **Decision-B gate reading (2026-10-03).** Under the multi-pass scorer protocol, each cycle re-grades its edited row with K >= 2 independent passes and re-audits via `POST /audit {passes:[...]}`. A realized delta whose sign is consistent across ALL passes and exceeds `inter_pass_offset_dbc` is plastic (gate verdicts on it); a delta inside the band or with mixed per-pass signs is elastic-by-uncertainty — revert the edit, record `band-undetermined`, do NOT count it as a sign refutation.
1. **Sign gate per cycle.** Improvement = dBc MORE NEGATIVE. Re-audit after every cycle; if the realized delta is positive at any cycle, stop, revert that edit, record the negative result, re-lens. Never finish 10 cycles on a wrong-signed trajectory. Round 3 ran all 10 because each individual prediction (+9.8 to +11.5 dBc vs its paired control) looked good while the realized total was +0.64.
2. **Snapback instrument mechanizes this gate (added 2026-10-02).** Each cycle, POST the round's cumulative `[{cycle, predicted_delta, realized_delta}]` series to `/api/jev/corpus/visco/snapback`; `verdict: snapback` + `gate_input.action: halt_round` is a hard stop (revert that edit, record, re-lens). After the round: `GET /api/jev/corpus/visco/hysteresis?baseline_id=<numeric>` for the prediction-vs-realized dissipation rollup, and `GET /api/jev/corpus/visco/prony?metric=dbc&arms=2` for the relaxation surface over the runs history.
2. **`expected_delta` is geometry, not forecast.** It is a prediction over hypothetical bit flips, not of what the resulting prose does to the matrix. Pre-register every candidate in the outcomes ledger (`POST /api/outcomes`, verdict `pending` + `predicted_delta`) before applying; append the realized row with `supersedes` after the re-audit. Round 3 skipped the ledger, so prediction-vs-realized had no home and the regression surfaced only in PR review.
3. **Axis-fill on prose is padding.** A bare "## Inputs" section flips the sparse cell but weakens structure; Reading recommendations #2 already declines vocabulary padding. A cell fills only when the section is source-grounded in the doc's own subject (rounds 1-2 carried each target's measured numbers; round 3's fills were generic). No grounded content -> decline the candidate and record it as content-resistant.
4. **Freeze the task check before cycle 1** (AGENT.md lesson 6/23), and use the instrument surfaces a matrix round otherwise skips at baseline: `/api/map/control` positive control, `/api/map/preview` before applying, admission trials (azimuth/axis/rayleigh).
5. **Matrix re-scoring is a measurement.** If subagents re-score the matrix after edits, scorer drift can move dBc independently of the text. Pin the scoring prompt, re-score only edited rows, report scorer variance with the round.
6. **Edited-row re-scores always carry v2.1 hysteresis (refs5, 2026-10-03).** A plain re-score can silently DROP a marginal pre-edit bit (p in 0.45..0.55) while gaining the intended axis, manufacturing a wrong sign: refs5 cycle 3 measured +0.6037 on an edit that is plastic-keep at -0.4077 under hysteresis (cycle 4, same edit). Pass `hysteresis: {low:0.45, high:0.55, pre_row}` on every edited-row re-score; a wrong sign under a plain re-score is provisional until re-measured with hysteresis.
7. **Outcomes supersedes contract (refs5).** A realized row must share `baseline_id` AND `target` with the row it supersedes, and pre-registration rows carry the map id current at creation - which CHANGES after every keep (each keep re-maps; the map chain advances). Echo the pre-row's `baseline_id` on the realized row; a fixed round-level baseline_id 409s.
8. **/preview requires exactly one changed name vs its baseline.** After a keep, re-map with `POST /api/map {baseline_id}` so the next cycle's preview compares against the current corpus (a per-round map chain). Also noted refs5: `/api/jev/corpus/placements` 404'd (upstream /api/map error 1042); the direct `/api/map {texts,names}` flow is the working path for the baseline map.
9. **Gate statistic correction (2026-10-03, refs6 post-round).** The round sign gate MUST read `level_dbc = 20*log10(|z|)` (or z itself), not the audit's `dbc` field. Evidence: across refs6's consecutive audit states the two statistics moved opposite 4 of 5 times; the round's only keep moved z −0.22 while dbc went −1.64; two reverted edits had z +0.29 and +0.71. The lens's `expected_delta` is already in the level convention (positive = more distinguishable), so prediction and realization are only comparable there. Gate-grade audits use `nulls: 400` (the default 100 carries sd-estimation noise on z).
10. **The sign is a bearing, not a verdict (the user's 2026-10-03 directive).** Read the (predicted, realized) pair in the level convention as a DIRECTION: aligned + meaningful magnitude = keep; aligned + tiny = small-but-real (keep candidate, report the magnitude honestly — never auto-drop a positive realized level delta); inverted = the text moved the corpus against the geometry (revert); zero = no-flip. The snapback inversion detector only means something once both sides are in the level convention: pre-correction it compared a level-convention prediction against a share-dbc realization and flagged every true keep as an inversion.
11. **Skip-list feedback (shipped 2026-10-03, etag 496cb99d).** `POST /lens` accepts `skip: ["doc-name" | {name, axis?}]` and drops those cells before top-selection, so declined/reverted candidates stop being re-proposed. Derive the skip list from the outcomes ledger each round. Verified live: the same skip turned the refs6 candidate list over completely (the 5 charter docs and 4 reverted axis-11 docs vanished from the top-10).
12. **Frozen task check is the keep gate (re-authored 2026-10-03 at `tools/point-map/taskcheck_refs.sh`).** Every KEEP runs `bash tools/point-map/taskcheck_refs.sh <before> <after> <axis>` (C1-C7: file shape, append-only, single section, size bound, no cross-axis vocabulary, grounding, charter compliance) BEFORE commit; failure = check-blocked decline. The round-5 checker was session-scoped and lost; this is the in-repo successor. First live catch: refs6's merged keep (roadmap axis8) fails C6 - its added section cites no in-repo path and carries no dated fact.
13. **Unit-round protocol (2026-10-03, Jenny directive: "reduce the cycle count to run once and run the whole runflow as a unit for one atomic change. frozen baseline check each unit interval").** Cycle count per round = ONE. Each round runs the whole runflow as a unit for one atomic change: pin main -> frozen baseline check (fresh scorer matrix + nulls-400 audit + map + control + admission) -> instrument candidates (lens with skip-list + rungs) -> ONE edit -> pre-register -> hysteresis re-score -> gate-grade audit -> bearing + level_dbc gate -> taskcheck-gated commit or revert -> realized outcome row -> snapback -> rollups -> round record. The frozen baseline is re-checked at every unit interval: no baseline carryover across units; each unit re-derives its own frame. Round numbering continues (refsN). The frozen baseline check includes one `POST /lens` snapshot (recorded automatically as a run row). `GET /api/jev/corpus/visco/mobility` (2026-10-03, etag 67fb6f6a) mines the accumulated lens runs into the cell-mobility series: per-run top cells with real-vs-control deflection, per-point matrix context (input_hash segmentation), and the axis frontier. Zero parameters - the control-normalized deflection IS the measurement; the per-unit series is the z(t)-over-rounds saturation reading, with no decay-law claim on the run index (22-links doc 5.5 warning 5).

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


## Taste instrument (2026-10-05, taste-v1)

The nature-based taste instrument rides the same worker: `POST /api/jev/corpus/taste/score` (deterministic extraction via `jev-taste-math.js`: box-counting fractal dimension, mirror symmetry, scale coherence + caller-supplied measurements; ONE batched clef call over 8 nature-law axes with the measured number embedded in each instruction; 0.45/0.55 hysteresis; `order_seed` position-bias control; run rows kind `taste`/`taste-matrix`). `GET /taste/selftest` carries 6-fixture parity against the Python extractor source of record (`session/taste/lane-b/extractor.py` — session artifact, not repo-truth; validated 12/12; JS/Python max deviation 3.1e-15). The instrument never awards itself a quality score: it returns a vector + probabilities, never a composite beauty number. Validation record: `refs/natural-taste-engine-2026-10-05.md` on yubi-OS/yubiOS (24/24 gold-set separation vs measured D, clef jitter sd=0 across 24 re-calls). Live-verified 2026-10-05: selftest 13/13, caller-features and bitmap image paths both verdict correctly, ~$0.0002/score, consumed=0 (clef plan billing). Lesson from the deploy: clef `choice` questions take a `criteria` object (option->description), not a `choices` array; and bare integer scores ("1") confused the symmetry band question until fmt renders "1.000" — always render measured numbers with decimals in clef instructions. **2026-10-05 addendum:** open issues resolved - family choice answers now echoed (choice + probabilities + confidence); calibration sweeps show clef reads the stated thresholds exactly (0.6 step, 0.3-0.95 window, 0.5 step); the 18-image real-photo trial returned an honest NOT-ADMITTED verdict for fractal_band on real photos (classifier faithful to measured D everywhere, but photo edge maps read D 1.5-1.6 - pipeline-dependent; see the refs doc addendum). **Addendum 2 (2026-10-05):** the standardized edge pipeline shipped as `POST /api/jev/corpus/taste/edge-standard` (gray_b64 in -> ink-normalized 1-px contour bitmap + features; edge-standard-v1, IBSI-style fixtures + cross-implementation parity at max dD 4.4e-16; Python source of record + JS port). Trial-2 on the same 18 real photos moved measured D from the 1.5-1.6 regime to 1.11-1.40 at pinned ~6% ink coverage (8/18 in-band) - the measurement-comparability blocker is closed; the axis stays unadmitted pending a human-rated real-photo gold set (matched-triad protocol, corpus doc 07).

Every use stays inside the frontmatter description's scope; anything beyond it is a different skill's job.
