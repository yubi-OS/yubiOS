# Pfister keystone methods → wayfinder API (calibration/1, outcomes/1)

**Date:** 2026-09-17. **Scope:** research ingest + ideate-solo + shipped API change on `tools/point-map/` and the live `steady-orbit` Worker. **Instrument unchanged:** `pointmap/0.2` frames, bits, null, radius 0.095 and rung ranking are not touched.

## 1. Inputs ingested

- Uploaded catalog of Tomas Pfister's arXiv record (135 author-record hits, not 135 discoveries) and its map onto `google-research` repos: `tft`, `tabnet`, `fixmatch`, `uda`, `composed_image_retrieval`, `syn-rep-learn`, `timesfm`, `business_metric_aware_forecasting`, plus CutPaste/SPADE anomaly work and the LLM-era papers (Distilling Step-by-Step, Chain of Agents).
- `papers/README.md`, `papers/learned-latent-curves-2026-08-06.tex`, `papers/is-this-x-2026-08-12-Final.tex`, `papers/curved-corpus-unified-2026-08-22-v2.tex` at `39d4be0d`.
- `refs/point-to-point-latent-map-2026-09-06.md`, `wayfinder-audit-2026-09-09.md`, `wayfinder-loop-results-2026-09-09.md`, `wayfinder-math-implementation-2026-09-10.md`, `radius-diagnostics-implementation-2026-09-13.md`, `wayfinder-round3-results-2026-09-13.md`, `wayfinder-round3-isolate-census-2026-09-13.md`, `navier-stokes-wayfinder-math-2026-09-10.md`, `landau-radius-research-2026-09-13.md`.
- PRs #229–#234 (three wayfinder rounds, math/1, radius/1, map guide button).
- Live Worker `steady-orbit` (account `b57ee20c…`): 13 modules (`solar-entry.mjs` entry chain → `index.js` legacy/API module, 175,503 B), bindings AI/DB/SITE/VEC/WEBSITE_RATE_LIMIT, compat 2026-09-01, deployment `76d74502…` at 2026-09-17T01:03Z. A fresh `build.mjs` of `tools/point-map` at `39d4be0d` reproduces the live `index.js` byte-for-byte modulo the 22 esbuild source-path comments (44 diff lines, all `// …/tools/point-map/…`). `/api/health` reported `pointmap/0.2`. `/AGENT.md` in SITE KV matched `tools/point-map/AGENT.md`.

## 2. Cross-cutting revelations from the catalog, restated as constraints

1. Encode the structure of the problem rather than adding capacity.
2. Labels are selective: unlabeled data, pseudo-labels, synthetic examples and consistency supply most of the signal.
3. Interpretability is a modeling constraint, not a post-hoc add-on.
4. Distribution shift must be handled explicitly.
5. A prediction is valuable only through the decision it feeds; evaluate on that decision, prospectively, with uncertainty (COVID forecasts; business-metric-aware forecasting).
6. Normal-only anomaly detection needs a synthetic positive control (CutPaste) to state detection power.

## 3. Transplant screen (ideate-solo, 8 variations, 4 heuristics)

| Variation | Mechanism | Painkiller | Switching | Defensibility under AGENT.md | Testability | Verdict |
|---|---|---|---|---|---|---|
| V1 CutPaste positive control | seeded splice of donor text into host, measured as a frozen-frame CHANGE | high (no known-signal reference existed) | low | high: calibrates an existing statistic; no new coordinate | high | **ship** |
| V2 Business-metric-aware outcome ledger | pre-registered prediction + independent verdict, counts only | high (refs name it as the open gap three times) | low | high: stores, never scores | high | **ship** |
| V3 TabNet mask-and-predict axis redundancy | predict bit j from other 8 bits vs null | medium | low | medium: a new per-axis statistic needs its own admission null first | high | defer (needs membership-condition trial) |
| V4 TFT variable-selection axis importance | reweight frozen axes by importance | low | low | low: any weight that feeds ranking is a new term; "sectors are anonymous geometry" | medium | reject |
| V5 FixMatch weak/strong consistency pre-filter | two previews per candidate, sign must agree | medium | medium (2× embedding) | medium: risks reading as a geometric gate on keep/revert | high | defer; expressible today as two preview calls |
| V6 TFT quantile horizons for rung deltas | empirical null quantiles of predicted delta | low | low | medium: K=40 cannot resolve tails below 1/41 | medium | reject |
| V7 UDA consistency training | needs a prediction target to regularize | — | — | not transplantable | — | reject |
| V8 TimesFM / Pic2Word / Distilling / Chain-of-Agents | pretrained models, paired supervision, trainable student | — | — | not transplantable (no labels, no downstream model) | — | reject |

Stress test of the two winners against the recorded "do not do" set: neither deletes, neither self-scores, neither computes a rate or Gaussian tail, neither reselects a radius or grid, neither adds a physics term or a ranking term, neither admits a coordinate. Both attach n to every count. Both refuse tuning knobs that could be fitted to the result.

## 4. What shipped

### `POST /api/map/control` — calibration/1 (`lib/control-route.mjs`)

- Exact-corpus gate: every baseline name present, every SHA256 equal, no additions (409 with named diffs) before any AI/KV work.
- Fixed recipe `cutpaste-splice/1`: centered host window of round(0.25·len) code units replaced by a same-length donor segment (whole donor if shorter); surrogate pairs never split; `n_controls` 2..12 (default 6), `control_seed` (default 20260917) are the only knobs and are echoed. Recipe keys (`splice_fraction`, `window`, `hosts`, …) → 422; instrument keys → 409.
- Each splice is measured through the real `mapPreviewHandler`, so the frozen frame, anchor verification, exact ledger and no-persist discipline are inherited. Per control: host, donor, offsets, before/synthetic SHA256, `isolated_delta` and `ledger_actual_delta` (must agree), `bits_changed`, geodesic/chord displacement, `quantization_silent`, `occupied_sectors_delta`, `unchanged_anchor_count`.
- Summary: sign counts and min/median/max with n; `baseline_reference.null` echoes K/E0/SD0/p_resolution of the stored checkerboard null (false-alarm side) so the reader sees both references side by side; `no_change_reference` is the identity. `task_verdict:"not-applicable"`.

### `POST`/`GET /api/outcomes` — outcomes/1 (`lib/outcomes-route.mjs`)

- Append-only D1 table `outcomes` (additive `CREATE TABLE IF NOT EXISTS`; `maps` untouched). PUT/PATCH/DELETE → 405.
- Two-phase: register `predicted_delta` with verdict `pending`; later append the verdict row with `supersedes`. One-shot rows are stored with `preregistered:false`.
- With `after_id` the observed delta is recomputed server-side by `PM.explainTransition` on the frozen frame (409 on frame mismatch or a different moved name); caller-supplied `observed_delta` is stored as `observed_source:"caller"`, never mixed.
- Verdicts `pending|kept|reverted|declined|abstained|neutral`; `verifier` required and `geometry` refused for non-pending rows; `score/quality/success_rate/rate/confidence/z` refused as inputs.
- GET returns rows plus a contingency of counts (`sign_exact_count`, `predicted_sign_by_observed_sign`, `verdict_by_sign_exact`, `by_verdict`, `observed_source_counts`, `n_*`). No rate, percentage or z.

### Plumbing

- `worker-base.js`: two route blocks mirroring the preview block's read-only baseline load and 503 discipline; `/api/health` lists `diagnostics: {math, radius, control, outcomes}`; llms fallback updated.
- `lib/preview-route.mjs`: `requireTextBaseline` exported (no behavior change).
- `test-control-outcomes.mjs`: 32 checks (real `pointmap.js` + real preview path, synthetic embedder, in-memory stores). Full suite: 53 + 36 + 71 + 43 + 8 + 76 + 13-boundary/10,201-rectangle + 32 + tar suite, all passing.
- `AGENT.md`, `README.md`, `llms.txt`, `package.json` updated.

## 5. Honesty boundary

- A splice that moves zero bits says the instrument is quantization-silent for that content size on that document; a splice that changes the isolated count says the statistic responds to known-different content. Neither is task quality. Control summaries are comparable only on the same `frame_id`/`instrument_id`.
- The ledger stores the verifier's word; it does not grade it. A sign-exact prediction is an instrumentation outcome. The historical 4/10 sign agreement remains a historical count until prospective, pre-registered rows exist; the ledger is where those rows now go.
- Recorded negatives are preserved: A₁ admission failed, sd(u) failed, GL falsified, Gaunt negative, FCS not identifiable, Pennes unidentifiable, no Raman/IR claim. Nothing here re-opens them.
- Not done (deferred with reasons above): TabNet-style axis predictability (needs its own admission null on curveball draws before it can appear in any response), FixMatch-style consistency gate (would read as a geometric keep/revert rule).

## 6. Next checks that would raise evidence

1. Run `/api/map/control` on a round-3 style refs/ baseline (n=12, two seeds) and record the response distribution next to the round-3 real-edit deltas; that comparison, not the control alone, states whether real edits are inside or outside the known-signal band.
2. Pre-register the next wayfinder round through `/api/outcomes` (pending rows before any task check), then append verdict rows. Only that produces forward sign-agreement counts.
3. If an axis-redundancy statistic is ever wanted, run it on curveball draws first and file the admission result as a negative or positive before any endpoint exposes it.

## 7. Deployment receipts (2026-09-17, UTC)

- PR #235 squash-merged as `a426ed47ef0eea36fed383f13bd87e06b2d7f6cf` (branch `point-map-control-outcomes-2026-09-17`, head `8c2b2661`).
- Worker `steady-orbit` PUT at 2026-09-17T10:13:41Z: 13 modules re-uploaded byte-identical except `index.js` (rebuilt from this commit, 201,844 B, sha256 `cbd2f7ccdccf…`), `main_module solar-entry.mjs`, `keep_bindings` for all binding types; settings/bindings unchanged (AI, DB, SITE, VEC, WEBSITE_RATE_LIMIT). Pre-upload check: all 13 live modules matched the 01:03Z index snapshot (no concurrent change overwritten).
- SITE KV `AGENT.md` (sha256 `6ef4d0e5e9a0…`, verified equal to `tools/point-map/AGENT.md`) and `llms.txt` replaced.
- Live: `/api/health` → `diagnostics {math: wayfinder-math/1, radius: radius/1, control: calibration/1, outcomes: outcomes/1}`; `/` 200 (42,397 B), `/map/` 200; `DELETE /api/outcomes/1` → 405.
- Smoke on 12 refs/ docs pinned at `a426ed47` → baseline map **77** (frame `6b13364cd8ac5b57`, isolated 12/12, occupied 10): `POST /api/map/control` n=3 seed 20260917 in 4.2 s → isolated_delta {−2, 0, 0}, bits_changed {4, 3, 1}, geodesic displacement 0.53–1.06, 0 quantization-silent, 11/11 anchors byte-equal per control, ledger delta == comparison delta for all three; `splice_fraction` → 422. `POST /api/outcomes` pending row **1** (201, preregistered true, observed none); verifier `geometry` → 422; GET contingency n_rows 1, n_effective 0.
- Reading of the smoke: on this 12-document frame a 25% splice moved 1–4 bits in every case and changed the isolated count in one of three; this is an instrument reading on frame `6b13364cd8ac5b57` only, not a benchmark and not evidence about any real edit.

## 8. Deferred variants V3 and V5 shipped (2026-09-17, PR #236 → `f66308be`)

Both reframed to sit inside the honesty boundary rather than skipped:

- **V3 → `POST /api/map/axis-redundancy` (axis-trial/1).** The objection to V3 was "a new per-axis statistic needs its own admission null first." The route now *is* that trial: leave-one-out nearest-neighbour predictability of bit j from the other d−1 bits (`loo-nn-vote/1`), computed on the stored bits and on K draws of the existing fixed-margin chain (`PM._internal.nullDraw`, margins certified per call, seed `map.seed XOR 0x5bd1e995`). Column margins are fixed under the null, so the majority baseline cancels and the comparison isolates inter-axis dependence beyond margins. Exclusion-only verdicts, descriptive z, plus-one tail at resolution 1/(K+1), `admitted:false` hard-coded; `weights/importance/rank/admit` rejected; nothing written, no embedding.
- **V5 → `POST /api/map/consistency` (consistency/1).** The objection to V5 was "reads as a geometric keep/revert gate." The route measures one candidate under 1..3 *caller-supplied* variants through the real preview path and reports sign agreement as a stability statement about the reading; it never generates variants (`augment/generate_variants/gate/strength` rejected) and never gates (`task_verdict` stays not-tested).

Deployment: Worker `steady-orbit` PUT 2026-09-17T10:34:43Z, only `index.js` changed (222,242 B, sha256 `06cb157b673a…`), 12 other modules byte-identical to the 10:13Z deploy; SITE KV `AGENT.md` (sha256 `26847b117579…`) and `llms.txt` refreshed; `/api/health.diagnostics` now lists `axis_trial` and `consistency`. Tests: `test-axis-consistency.mjs` 15/15; full suite green.

Live smoke on map 77 (12 refs docs, frame `6b13364cd8ac5b57`): axis trial K=40 in 0.67 s → all 9 axes `not-excluded` (observed hits 5–7 vs null means 4.8–5.7, |z| ≤ 0.85, total z +0.69, p 0.54; margins preserved over 21,600 attempts / 1,267 accepted). On this 12-document frame no axis is distinguishable from the fixed-margin null — a trial record, not an admission decision. Consistency on the pfister refs doc with a primary + weak + strong appended-note variant → all three quantization-silent (0 bits, 0 displacement, isolated Δ 0), `all_same_sign:true`, sign_exact 3/3 against predicted 0 — an instrument reading that small appended notes do not move this document's bits on this frame.

