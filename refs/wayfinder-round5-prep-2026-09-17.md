# Wayfinder round 5 prep: baseline 89, positive control, axis trial

**Date:** 2026-09-17 (05:45 Pacific). **Corpus:** `refs/*.md` at `424eca6c81553365541c4f1cacb80b15aba60e01` (182 docs, 2,011,662 UTF-8 bytes, 0 truncated). **Instrument:** `pointmap/0.2`, d=9, seed 20260906, threshold median, K=40, T=0.05. Everything here is an instrument reading on one frozen frame; nothing is a quality claim about any document.

## 1. Baseline map 89

`frame_id 653e394a37a10351`, `instrument_id 6782a97ca9c308de`, N=182, isolated 49, occupied sectors 12/12. Map 89 is a new frame relative to round 4 (map 78, frame `d3289271e04ca764`, N=178 at `675d7789`) because the corpus grew (178 → 182) and frames are refit per baseline. Cross-frame counts are not comparable.

## 2. Positive control (`POST /api/map/control`, calibration/1)

Two requests, n=6 each, seeds 20260920 and 20260921, recipe `cutpaste-splice/1` fraction 0.25.

Pooled (n=12): Δisolated signs {negative 2, zero 5, positive 5}, min −1 / median 0 / max +2; bits changed min 0 / median 1 / max 3; 3 of 12 quantization-silent; occupied-sector delta 0 in all 12. Ledger delta equalled comparison delta in every measured case.

| seed | host ← donor | Δisolated | bits |
|---|---|---|---|
| 20260920 | bootc-composefs-sealed-flow ← entity-governance-legal | +1 | 1 |
| 20260920 | edgeless-reproducible-mkosi ← docker-bake-consolidation | −1 | 1 |
| 20260920 | repo-history-skill-cycle-4 ← current-position-evidence | 0 | 0 (quantization-silent) |
| 20260920 | yubios-stress-test-assertions ← workflow-dispatch-reachability-spec | +2 | 3 |
| 20260920 | release-census ← frost-panfrost-lockout | +2 | 2 |
| 20260920 | dhi-io-base-image-digest-rotation ← docker-build-policies-reference | +1 | 1 |
| 20260921 | adjacent-problems-runner-privilege ← curve-guided-rsi-v1-fitness-test | 0 | 0 (quantization-silent) |
| 20260921 | refederated-identity-oidc-sigstore ← adjacent-problems-mirror-provenance | +1 | 2 |
| 20260921 | learned-latent-curve-yubios-artifacts ← edgeless-reproducible-mkosi | −1 | 2 |
| 20260921 | roadmap-promotion-gates ← 0pointer-poettering-systemd-vision | 0 | 0 (quantization-silent) |
| 20260921 | mode-container-isolation ← assets-repo-repoint-verification | 0 | 1 |
| 20260921 | adjacent-problems-container-isolation ← y33-fibonacci-sphere-paper-revised | 0 | 2 |

Reading: on frame `653e394a37a10351` a known-different 25% splice reduced the isolated count in 2/12 cases (Δ −1 each). Unlike round 4's frame, the control band on this frame includes small negative deltas, so a real-edit Δ of −1 is inside the band and reads as noise. The control does not say whether any real edit is good.

## 3. Axis redundancy trial (`POST /api/map/axis-redundancy`, axis-trial/1)

Map 89, K=40: **5/9 axes excluded-from-fixed-margin-null, 4 not-excluded, 0 null-degenerate; total z +5.33 (descriptive)**. `admitted:false` on every response; this enters no ranking. Compare round 4 (map 78): 7/9 excluded, total z +5.36; round 3 (map 66): 9/9, +6.53.

## 4. Round 5 protocol

100 cycles, one file edit per kept cycle, one commit per kept cycle, all on held branch `wayfinder-refs-round5-2026-09-17` (draft PR, no merge). Per cycle:

1. Pre-register `POST /api/outcomes` (`pending`, prediction frozen from the current map's ladder) before inspection or edit.
2. Frozen independent check `taskcheck_refs.sh` C1–C7 (mojibake bytes, duplicate H2, placeholder TODO, template capability paragraphs, unresolved local/repo links, whole-file base64). FAIL → deterministic fixer (fixer.py, unchanged from `tools/skill-check/`) → PASS after; if the fixer cannot reach PASS the edit is declined and reverted.
3. After-map on the chained frozen frame (`baseline_id` cycle to cycle); verdict row appended with `supersedes`.
4. ADD rungs declined by policy (AGENT.md lesson 9: no synthetic refs docs). Ladder exhaustion falls back to rung exemplars, then a sweep-pool pass over unvisited docs with `predicted_delta: null`.

Cycles that find no defect record `abstained` in the outcomes ledger with no commit; committing a no-op edit to satisfy the cycle count would be padding.

## 5. Receipts

- All API calls went through the live Worker (`steady-orbit`); map 89, 12 control splices and the axis trial are in shared public storage.
- Local corpus mirror hash-verified against the `resolved_ref` tree before the baseline; `baseline_names.json` is the frozen name set for the round.
