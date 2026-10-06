# Wayfinder round 4 prep: baseline 78, positive control, axis trials, pre-registration

**Date:** 2026-09-17 (03:40 Pacific). **Corpus:** `refs/*.md` at `675d77898dc35f62f68f678fb93829493e6cbb6c` (178 docs, 1,978,913 UTF-8 bytes, 0 truncated). **Instrument:** `pointmap/0.2`, d=9, seed 20260906, threshold median, K=40, T=0.05. Everything below is an instrument reading on one frozen frame; nothing here is a quality claim about any document.

## 1. Baseline map 78

`frame_id d3289271e04ca764`, `instrument_id 6782a97ca9c308de`, N=178, isolated 39, occupied sectors 12/12, stored V2 null z=+3.42 (descriptive). Ladder: 4 rungs, one CHANGE (sector 3, predicted isolated −1) and three ADDs (sectors 5, 2, 7, each predicted isolated +1, i.e. the generator found no improving ADD). Rounds 1–3 ran on frames `f90cf5ba805322a5` (map 51) and `a045c8d3f4ff939b` (map 66); map 78 is a new frame because the corpus grew (168 → 178) and frames are refit per baseline. Cross-frame counts are not comparable.

## 2. Positive control (`POST /api/map/control`, calibration/1)

Three requests, n=4 each, seeds 20260917/20260918/20260919, recipe `cutpaste-splice/1` fraction 0.25. All 12 splices verified 177/177 untouched anchors byte-equal; ledger delta equalled comparison delta in every case. Each request took ~26 s (a first attempt at n=12 exceeded the Worker's budget and returned 503; the route now caps n at 6 per request and memoizes the baseline load).

| seed | host ← donor | Δisolated | bits | geodesic disp |
|---|---|---|---|---|
| 20260917 | release-gate-checklist-v2 ← chromium-provenance-overlay-status | +1 | 1 | 0.114 |
| 20260917 | arm64-path-a-b-board-status ← mode-fido2-boot-unlock | +1 | 1 | 0.105 |
| 20260917 | yubios-reproducibility-equivalents ← fedora-bootc-base-images-status | 0 | 1 | 0.076 |
| 20260917 | learned-latent-curve-rsi-v11-v12 ← spherical-defocus-g1 | 0 | 0 | 0 (quantization-silent) |
| 20260918 | days-31-60-narrow-product ← arxiv-2607.09967-vs-learned-latent-curve | +2 | 4 | 0.946 |
| 20260918 | workflow-token-scope-audit-script ← lensing-question-space-brainstorm | +2 | 1 | 0.400 |
| 20260918 | point-to-point-latent-map ← arxiv-2607.09967-vs-learned-latent-curve | 0 | 2 | 0.742 |
| 20260918 | debug-with-cli ← testing-production-gaps | 0 | 1 | 0.789 |
| 20260919 | testing-production-gaps ← hyperspherical-harmonic-curve-v1-fit | 0 | 1 | 0.561 |
| 20260919 | arm64-path-a-status ← v261-base-image-bump | 0 | 2 | 0.619 |
| 20260919 | adjacent-problems-fido2-secure-boot ← linear-workspace-sweep | 0 | 0 | 0 (quantization-silent) |
| 20260919 | gap-map-hyperspherical-harmonic-curve ← repo-history-skill-cycle-4 | +2 | 1 | 0.684 |

Pooled (n=12): Δisolated signs {negative 0, zero 7, positive 5}, min 0 / median 0 / max +2; bits changed min 0 / median 1 / max 4; geodesic displacement median 0.561, max 0.946; 2 of 12 quantization-silent; occupied-sector delta 0 in all 12.

Reading: on frame `d3289271e04ca764` a known-different 25% splice never *reduced* the isolated count, moved zero bits in 2/12 cases, and raised isolation in 5/12. Round-3 real edits on the previous frame had deltas in {−1, 0, +1} with 6/10 quantization-silent; the two frames are not directly comparable, but the control's sign band (0 or positive, never negative) is the reference a future "our edit reduced isolation" claim on this frame has to be read against. The control does not say whether any real edit is good.

## 3. Axis redundancy trials (`POST /api/map/axis-redundancy`, axis-trial/1)

`loo-nn-vote/1` vs K=40 fixed-margin draws, margins certified per call (map 66: 21,600 attempts / 1,267 accepted for the 12-doc map earlier; ~5·N·d attempts per draw here).

| map | frame | N | axes excluded-from-null | not-excluded | total observed hits | null mean ± sd | total z (descriptive) |
|---|---|---|---|---|---|---|---|
| 66 (round-3 baseline) | a045c8d3f4ff939b | 168 | 9/9 | 0 | 1027 | 763.0 ± 40.4 | +6.53 |
| 76 (round-3 end) | a045c8d3f4ff939b | 176 | 8/9 (axis 6 not-excluded, z +1.72) | 1 | 1063 | 807.4 ± 45.4 | +5.63 |
| 78 (round-4 baseline) | d3289271e04ca764 | 178 | 7/9 (axes 6, 8 not-excluded, z +1.99 / +1.53) | 2 | 1041.5 | 779.9 ± 48.8 | +5.36 |

Per-axis z on map 78: ax0 +5.14, ax1 +4.78, ax2 +3.32, ax3 +3.43, ax4 +6.54, ax5 +2.90, ax6 +1.99, ax7 +3.62, ax8 +1.53. Every excluded axis is *more* predictable than the null (direction "more-predictable-than-null"), i.e. the bits carry inter-axis dependence beyond margins on all three maps, and axis 6 is the weakest on both frames. On the 12-doc smoke map 77 all 9 axes were not-excluded (|z| ≤ 0.85): at N=12 the trial has no resolution.

Boundary: p is floored at 1/41 = 0.0244 for every excluded axis; "excluded" at K=40 is a small-chain observation. `admitted:false` on every response. This is the first executed membership trial for a per-axis statistic; a second corpus (not refs/) is required before any admission argument is written. Nothing here enters ranking.

## 4. Pre-registration (`POST /api/outcomes`, outcomes/1)

Four `pending` rows on baseline 78, verifier "round-4 independent content check (not yet run)", predictions frozen from the map-78 ladder before any inspection or edit:

| row | target | predicted Δisolated | rung |
|---|---|---|---|
| 2 | CHANGE `refs/current-position-evidence-2026-07-25.md` | −1 | sector 3, flip bit 2, atom Δ 0.728 |
| 3 | ADD `refs/wayfinder-round4-add-sector5-2026-09-17.md` | +1 | sector 5 |
| 4 | ADD `refs/wayfinder-round4-add-sector2-2026-09-17.md` | +1 | sector 2 |
| 5 | ADD `refs/wayfinder-round4-add-sector7-2026-09-17.md` | +1 | sector 7 |

Ledger for baseline 78: n_rows 4, n_pending 4, n_effective 0. Round 4 proper (inspect the named source and exemplars, state a concrete defect, pre-register its task check, edit, preview, run the unchanged task check, append the verdict row with `supersedes`) has **not** been run. Those verdict rows, and only those, will produce the first forward sign-agreement counts; the historical 4/10 stays historical.

## 5. Receipts

- Control route fix (memoized baseline load, n ≤ 6 per request) deployed to Worker `steady-orbit` at 2026-09-17T10:44:09Z (index.js only); committed to main with this document.
- All API calls above went through the live Worker; map 78 and outcome rows 2–5 are in shared public storage.

## 6. Round 4, cycle 1 — CHANGE `refs/current-position-evidence-2026-07-25.md` (row 2 → 6 → 7)


Order of events (UTC, 2026-09-17): inspect source + exemplars (`sbsign-pkcs11-validate`, `bcvk-swtpm-ci`, `customer-roi-model`) → write `taskcheck.sh` and state defects → apply edit locally → check FAIL-before / PASS-after → PR #237 (`db6bb032`) → geometry measured on frozen baseline 78 → check row 6 filed (`supersedes 2`; a first filing was rejected 422 for a >200-char verifier, so the geometry measurement preceded the accepted row — noted in the row) → PR #237 squash-merged `31df51d5` → check rerun unchanged on the merged file → after-map 80 → verdict row 7 (`supersedes 6`).
**Edit:** mojibake fixed; the 3 blocks replaced by one Recommendation ("KEEP as a dated snapshot; live `docs/BLOCKERS.md` supersedes"); the 4 sections replaced by one Coverage note stating the primitives do not apply. Sections Purpose … Open questions byte-identical except the 4 fixes (diff verified). 9,150 → 8,226 bytes.
**Task check (frozen before the edit, geometry not consulted):** C1 mojibake bytes 4→0, C2 duplicate H2 1→0, C3 TODO placeholder lines 6→0, C4 unresolved refs/ paths 0→0, C5 false capability claims 4→0. FAIL → PASS; rerun on the merged file at `31df51d5` (sha256 `1ac1375d2f05…`, equal to the previewed candidate): PASS. **Verdict: kept**, on the check alone.
**Geometry (recorded, not decisive):** preview on frozen baseline 78: isolated 39 → 37 (Δ −2; the pre-registered prediction was −1: sign exact, magnitude not), 3 bits changed, geodesic displacement 0.553, one neighbour touched (`yubios-scamper-product-brief-investor-memo-2026-08-07.md`), 177/177 anchors byte-equal, occupied sectors unchanged. Consistency with a weak variant (heading and first sentence reworded): −2/−2, `all_same_sign:true`. Radius exact-delta interval (0.0900, 0.1069] around 0.095. After-map **80** (baseline names only, target at `31df51d5`): same frame `d3289271e04ca764`, isolated 37, ledger CHANGE Δ −2 = comparison Δ. Against the §2 positive-control band on this frame (splices: Δ ∈ {0, +1, +2}, never negative), this real edit is the only negative Δ observed on frame `d3289271…` so far — one observation, not a rate.
**Ledger for baseline 78 after cycle 1:** n_rows 6, pending 5 (rows 3–5 ADD predictions + the two superseded chain rows), superseded 2, effective 1, preregistered 1, sign-comparable 1, sign_exact_count 1, by_verdict kept 1, observed_source server 1. Forward sign-agreement count: 1/1, which is one row and says nothing yet.
**Stray record:** map **79** was persisted from a 179-doc run at `31df51d5` (it includes this prep doc, so it is a two-transition corpus, not a valid after-map). Left in place; deleting it needs explicit authorization per AGENT.md.
Cycles 2–4 (the three ADD rungs, predicted +1 each) have not been run.

Context: template Mode-D stub sections appended per repo-refs-skill batches () were identical placeholder copies with no per-file content; merged on 2026-09-18.

## 2026-09-18 drift check (wayfinder round 8, cycle 40)

round-4 prep doc: re-verified as a historical round record; its frozen baseline (frame d3289271) is superseded by rounds 7-8 frames; marked historical, content unchanged.

## 2026-09-18 drift check (wayfinder round 8, cycle 43)

round-4 prep record: re-verified as historical (its frozen baseline frame d3289271 is superseded by rounds 7-8 frames); content unchanged, note additive.
