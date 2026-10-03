---
name: jev-corpus-unit-round
description: "Run one unit round of the jev-corpus RSI chain on the steady-orbit worker: pin the refs/ corpus, re-check the frozen baseline, take ONE atomic change through the full runflow (pre-register, hysteresis re-score, nulls-400 audit, level_dbc gate with bearing read, taskcheck-gated commit or revert, snapback, rollups), land the round record on a draft PR. Use when the user says 'run a unit round', 'next unit', 'run the roundflow', 'next round on refs/', or references the corpus RSI chain rounds (refsN). Encodes every harness lesson from rounds refs2-refs9 (2026-10-03). NOT for the 10-cycle rounds (superseded by the unit protocol), for worker deploys (use steady-orbit-deploy), or for the scorer/endpoint contracts themselves (use jev-corpus)."
metadata:
  short-description: "Operating procedure for one unit round of the corpus RSI chain"
---

# Jev corpus unit round: the whole runflow as one atomic unit

One unit round = one atomic change taken through the entire measurement loop. The cycle count is ONE per round; there is no baseline carryover across units — every unit re-derives its own frozen frame. Rounds are numbered `refsN`; each lands as a draft PR held for review (Jenny merges).

Source of truth: `/AGENT.md` on the worker (https://steady-orbit.systems-a.workers.dev/AGENT.md, mirrored at `yubi-OS/yubiOS/tools/point-map/AGENT.md`). Fetch it first. **If it cannot be read, the round stops — it does not guess.** Endpoint contracts: the `jev-corpus` skill.

## Prerequisites

- Connections: `Steady Orbit jev operator` (all `/api/jev/*` + `/api/map*` + `/api/outcomes` calls), `MASTER GIT SU` (GitHub). Every fetch carries a `User-Agent` header (Cloudflare 1010 / GitHub 403 otherwise).
- `GET /api/jev/corpus/selftest` must be all-pass before any result is trusted.

## The runflow (thirteen steps, one change)

1. **Pin.** `GET /repos/yubi-OS/yubiOS/branches/main` for the SHA. Pull the corpus fresh via `codeload.github.com/yubi-OS/yubiOS/tar.gz/refs/heads/main` (never reuse a stale mirror); extract `refs/` and `tools/point-map/taskcheck_refs.sh`. Count the docs — it grows every round.

2. **Score the matrix.** Per-doc `POST /api/jev/corpus/scorer/score {doc:{name,text}}` at **concurrency 12** — the measured sweet spot (refs10 experiment: conc 6 -> 3.9s per 24-doc slice, conc 12 -> 2.5s, conc 24+ WORSE as per-call p50 inflates 716ms -> 1.9s). ~257 docs in ~27s at conc 12 vs 52.7s at conc 6. The batch `/scorer/matrix` route 500s through the egress proxy; per-doc pooling is the working path. Save as JSONL keyed by doc name (resumable).

3. **Frozen baseline check** (every step is required at every unit interval; run it with `scripts/baseline.mjs --dir <refs-dir> --out <workdir> --skip skip.json` — the reference harness encodes the optimized fetch plan below, ~100s sequential -> ~38s):
   - `POST /api/jev/corpus/audit {matrix, labels, nulls: 400}` — the gate statistic is `level_dbc = 20*log10(|z|)` (the verify_claims.py claim-8 law). NEVER gate on the `dbc` field: it is an L2 share-spectrum distance to the null vacuum, negative-when-close, and uncorrelated with z at cycle scale.
   - `POST /api/map {texts, names, labels, d:9, seed:20260906, threshold:'median', K:40, T:0.05}` — the frozen frame. (`/api/jev/corpus/placements` may 404 with upstream error 1042; the direct `/api/map` texts flow is the working path.)
   - `POST /api/map/control {baseline_id, texts, names}` (positive control), `POST /api/map/admission`, `/api/map/azimuth`, `/api/map/axis-redundancy` — record verdicts whatever they are.
   - `POST /api/jev/corpus/lens {matrix, labels, top, skip}` — one snapshot per unit; it feeds `GET /api/jev/corpus/visco/mobility` (the saturation series).

   Fetch plan (identical results, just concurrent): **Phase A** score(conc 12) || map; **Phase B** audit || control (needs the map id; 3 retries on 503/1102 — it is the flakiest call, 33.9s measured and it 1102'd once at 257 docs) || admission || azimuth || axis-redundancy || lens; **Phase C** rungs read. The control CANNOT run before the map (it requires baseline_id), which is why it lands in Phase B rather than overlapping the score block directly.

4. **Candidates.** Derive the skip-list from the outcomes ledger: every (doc, axis) pair with a final verdict of declined, reverted, or neutral gets `skip: ["name" | {name, axis}]` on the lens call. Then read the map's rungs: `GET /api/maps/:id` -> `ladder_candidates.rungs`. **Prefer rung JOINS** (`joins` non-empty, `isolated_delta` negative) over create-isolate rungs. Ground truth from nine rounds: generator-endorsed rung joins are 2/2 keeps; the lens on refs/ proposes only closed-class axis-fills (retired as a candidate source); caller-proposed adds went 0/5. The lens still earns its keep as a pre-flight detectability filter and through the mobility series.

5. **One atomic change.** Either a CHANGE (one section appended to one doc) or an ADD (one new doc). Authored content rules: backticked in-repo paths or concrete dated facts (taskcheck C6), no cross-axis vocabulary in headers or near-miss phrasing (C5), the doc's own subject only, "What this record does not claim" charters respected (C7 blocks companion/census docs unless `TASKCHECK_OVERRIDE` names a reason).

6. **Pre-register BEFORE measuring.** `POST /api/outcomes {baseline_id: <current map id>, target: {action:'change'|'add', name}, predicted_delta: <lens/rung number in the level convention>, task_check: {verdict:'pending', ...}}`. The target shape is an OBJECT (`{action, name}`); a bare string 422s.

7. **Preview.** `POST /api/map/preview {baseline_id, texts (FULL corpus), names, target, predicted_delta}`. A CHANGE must alter exactly one name vs the current baseline — after a keep, the corpus moved, so the next change previews against the POST-KEEP map (step 12's remap). Adds use `target: {action:'add', name}` with the new doc appended to texts/names.

8. **Hysteresis re-score — always.** `POST /api/jev/corpus/scorer/score {doc:{name,text}, hysteresis:{low:0.45, high:0.55, pre_row: <current row>}}`. A plain re-score silently drops marginal bits (p in 0.45..0.55) and manufactures wrong signs (refs5 cycle 3: +0.60 refuted, the identical edit kept at -0.41 under hysteresis). For adds, `pre_row` is twelve zeros.

9. **Gate-grade audit.** Rebuild the matrix with the re-scored row and `POST /api/jev/corpus/audit {matrix, labels, nulls: 400}`. Realized delta = `level_dbc(after) - level_dbc(before)`. Nulls 100 is NOT gate-grade (refs7 F2: refs6's +0.29/+0.71 z-revisions collapsed to -0.61/-0.26 at 400).

10. **Bearing + snapback.** Read (predicted, realized) as a DIRECTION in the level convention: aligned + meaningful = keep; aligned + tiny = small-but-real (never auto-drop a positive realized level delta); inverted = the text moved the corpus against the geometry; zero = no-flip. Post the cumulative series `[{cycle, predicted_delta, realized_delta}]` to `POST /api/jev/corpus/visco/snapback` — both sides in the level convention, or the inversion detector flags every keep.

11. **Keep or revert.** KEEP iff realized level delta > 0 AND snapback does not halt. For a keep: run `bash tools/point-map/taskcheck_refs.sh <before-file> <after-file> <axis>` (C1-C7; for adds the C5/C6 subset applies, C2/C3 are change-shaped); on PASS commit via the Git Data API chain (blob -> tree with `base_tree` -> commit -> `PATCH /git/refs/heads/<branch>`), surfacing every response — a silent commit failure costs a manual recovery. For a REVERT: no commit, local file untouched, verdict `reverted` (or `neutral` on zero delta).

12. **Realized row, THEN remap — in that order.** `POST /api/outcomes {..., observed_delta: <level delta>, task_check: {verdict: 'kept'|'reverted'|'neutral'|'declined', ...}, supersedes: <pre-registration id>}`. The superseding row MUST share `baseline_id` AND `target` with the row it supersedes, and pre-rows carry the map id current at their creation — so post the realized row BEFORE the keep's re-map advances the map id. Then `POST /api/map {texts, names, labels, baseline_id}` to re-freeze the frame for the next unit.

13. **Rollups + record + PR.** `GET /api/jev/corpus/visco/hysteresis?baseline_id=<pre-row map id>` (supersedes-chain rollup), `/visco/prony?metric=dbc&arms=2`, `/visco/mobility` (the lens snapshot just added a point). Write `refs/jev-corpus-rsi-refsN-YYYY-MM-DD.md` (setup, the one change, findings, ledger ids, repro log pointer), commit on the branch, open the DRAFT PR. To merge on directive: REST `PATCH {draft:false}` does NOT clear a draft — use GraphQL `markPullRequestReadyForReview` with the PR's `node_id`, then `PUT /pulls/:n/merge {merge_method:'squash'}`.

Document every endpoint call with ids in a steps log (`steps-refsN-<date>.log`) — the repro log is part of the deliverable.

## Endpoint quick reference

| Call | Notes |
|---|---|
| `POST /api/jev/corpus/audit {matrix, labels, nulls:400}` | idempotent per input hash; gate statistic is `level_dbc` |
| `POST /api/jev/corpus/scorer/score {doc, hysteresis:{low,high,pre_row}}` | ~$0.0002/call; hysteresis is mandatory on re-scores |
| `POST /api/map`, `/api/map/preview`, `/api/map/control`, `/api/map/admission`, `/api/map/azimuth`, `/api/map/axis-redundancy` | frozen-frame family; d:9 seed:20260906 median K:40 |
| `POST /api/outcomes` | pre-register then realized-with-supersedes; target is an object |
| `POST /api/jev/corpus/visco/snapback {series}` | level-convention series only |
| `GET /api/jev/corpus/visco/hysteresis?baseline_id=N`, `/visco/prony`, `/visco/mobility` | rollups |
| `GET /api/maps/:id` | `ladder_candidates.rungs` = the structure-level generator |

## Failure lessons baked into the flow

- The `dbc` audit field is not the gate statistic; `level_dbc` is (refs6 correction).
- Marginal-bit threshold jitter: hysteresis on every edited-row re-score (refs5 F1).
- Nulls=100 z deltas are not gate-grade; re-measure at 400 before acting (refs7 F2).
- The lens predicts movability, never improvement; rungs propose, the gate disposes (refs8 F1).
- Axis-fill is a closed class on refs/ — level-negative under three gate statistics (refs2/refs4/refs7).
- Supersedes shares baseline_id + target; pre-rows carry the current map id (refs5 contract).
- Realized row before remap; commit errors surfaced; stale blob sha 409s on the second edit of a file.
- Worker deploys serve stale code ~20s after a 200 upload; KV serve converges ~60s — verify late, verify bytes.
- Draft PRs: GraphQL ready-for-review, not REST PATCH.

## Examples

**A change unit (refs7 cycle 1):** baseline level 14.1707 -> pre-registered revert of a merged edit -> hysteresis re-score (row back to baseline) -> audit 14.5626 -> +0.3919, bearing aligned -> taskcheck exempt (revert restores a checked state) -> commit -> realized row -> remap. One keep, one PR.

**An add unit (refs9):** baseline 12.9517 -> rung `add:s3` joins two isolates -> authored `refs/adjacent-problems-corpus-rsi-2026-10-03.md` to the rung's exemplar family -> add-check C5/C6 -> pre-register (-2 geometric) -> scorer row (zeros + adjacent/failure bits) -> audit +1.0092 -> commit -> remap 558.

**A revert unit (refs7 cycles 2-3):** re-applications of prior-round revisions -> hysteresis re-scores -> audit level-negative -> no commit -> realized rows with `reverted` verdicts -> the finding recorded (prior z readings were nulls=100 noise).

## Guidelines

1. Read `/AGENT.md` first; stop if unreachable.
2. One atomic change per round. If no instrument-proposed candidate survives the content filters, the round records an honest abstention — never author a padding change to satisfy a count.
3. The gate is `level_dbc` UP. Nothing else authorizes a keep.
4. Geometry proposes; the frozen task check disposes. A keep without a taskcheck pass is not shipped.
5. Every unit re-derives its frozen baseline; carry nothing across units except the round number and the lessons.
6. Selftest before trusting any engine result; fixtures are the truth.
