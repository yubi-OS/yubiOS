# Wayfinder round 5 results: 100 cycles on refs/ (baseline 89, frame 653e394a37a10351)

**Date:** 2026-09-17 (06:15 Pacific). **Corpus:** `refs/*.md` at `424eca6c81553365541c4f1cacb80b15aba60e01` (182 docs). **Instrument:** frozen baseline map 89 (`frame_id 653e394a37a10351`, `instrument_id 6782a97ca9c308de`, N=182, isolated 49, 12/12 sectors), `baseline_id` chained cycle to cycle to after-map **118**. Task-quality checks (frozen `taskcheck_refs.sh` C1-C7) and geometry were kept separate throughout; geometry never authorized an edit.

## Cycle totals (100/100)

| result | n |
|---|---|
| kept (one commit each) | 29 |
| declined (deterministic fixer could not reach PASS; reverted, nothing committed) | 42 |
| abstained (frozen check PASS; no defect to state) | 29 |

Outcomes ledger (baselines 89-118): **215 rows**, 29 kept / 48 declined / 34 abstained verdicts, 104 pending (each kept/declined/abstained verdict supersedes its own pending pre-registration row), 209/215 preregistered. sign_exact is null on all 215 rows: the only two ladder rungs with geometric predictions (L1 CHANGE predicted −1, L5 CHANGE predicted +2) ended declined and abstained respectively, so **zero kept rows carry a pre-registered geometric prediction** and no sign-agreement count exists for this round.

## Kept edits (29 commits)

| cyc | file | fixes | Δisolated | bits |
|---|---|---|---|---|
| 4 | arm64-ftpm-phase-f0-2026-07-23.md | C1 replaced 2 mojibake sequences; C5 replaced 4 template capability paragraph(s) | 0 | 0 |
| 10 | arm64-path-a-b-board-status-2026-07-23.md | C1 replaced 2 mojibake sequences; C5 replaced 3 template capability paragraph(s) | 2 | 1 |
| 11 | days-31-60-narrow-product-2026-07-25.md | C1 replaced 2 mojibake sequences; C3 dropped 3 placeholder TODO section(s); C5 replaced 2 template capability paragraph(s) | 0 | 1 |
| 12 | frost-panfrost-lockout-2026-07-17.md | C5 replaced 3 template capability paragraph(s) | 0 | 0 |
| 32 | arm64-rk-board-status-2026-07-17.md | C3 dropped 2 placeholder TODO section(s); C5 replaced 2 template capability paragraph(s) | 1 | 1 |
| 33 | planning-cycle-2026-07-11.md | C5 replaced 3 template capability paragraph(s) | 0 | 0 |
| 35 | research-refresh-2026-07-11.md | C3 dropped 2 placeholder TODO section(s); C5 replaced 3 template capability paragraph(s) | 0 | 0 |
| 38 | bcvk-swtpm-ci-2026-07-23.md | C1 replaced 1 mojibake sequences; C3 dropped 1 placeholder TODO section(s); C5 replaced 3 template capability paragraph(s) | -2 | 1 |
| 45 | ci-evidence-2026-07-21.md | C1 replaced 1 mojibake sequences; C3 dropped 2 placeholder TODO section(s); C5 replaced 2 template capability paragraph(s) | 1 | 1 |
| 51 | customer-roi-model-2026-07-25.md | C1 replaced 15 mojibake sequences; C3 dropped 2 placeholder TODO section(s); C5 replaced 3 template capability paragraph(s) | -1 | 2 |
| 52 | customer-roi-model-2026-07-26.md | C3 dropped 1 placeholder TODO section(s); C5 replaced 3 template capability paragraph(s) | 0 | 2 |
| 54 | offer-pricing-architecture-2026-07-25.md | C1 replaced 29 mojibake sequences; C5 replaced 2 template capability paragraph(s) | 2 | 2 |
| 55 | cycle4-results-2026-08-06.md | C1 replaced 9 mojibake sequences; C3 dropped 2 placeholder TODO section(s); C5 replaced 3 template capability paragraph(s) | 0 | 1 |
| 58 | days-0-30-safe-offer-2026-07-25.md | C3 dropped 3 placeholder TODO section(s); C5 replaced 2 template capability paragraph(s) | 0 | 0 |
| 59 | days-61-90-willingness-to-pay-2026-07-25.md | repaired commit | None | None |
| 61 | decisions-deferrals-rejected-models-2026-07-25.md | C1 replaced 59 mojibake sequences; C5 replaced 2 template capability paragraph(s) | 0 | 0 |
| 65 | docker-bake-consolidation-2026-07-17.md | C1 replaced 1 mojibake sequences; C5 replaced 3 template capability paragraph(s) | 0 | 0 |
| 69 | entity-governance-legal-2026-07-25.md | C1 replaced 27 mojibake sequences; C5 replaced 3 template capability paragraph(s) | 0 | 0 |
| 71 | external-benchmarks-sources-2026-07-25.md | C1 replaced 13 mojibake sequences; C3 dropped 3 placeholder TODO section(s); C5 replaced 2 template capability paragraph(s) | 0 | 0 |
| 72 | external-benchmarks-sources-2026-07-26.md | C5 replaced 2 template capability paragraph(s) | -1 | 1 |
| 74 | fedora-bootc-base-images-status-2026-07-23.md | C1 replaced 6 mojibake sequences; C5 replaced 3 template capability paragraph(s) | 0 | 2 |
| 76 | firmware-rk-workflow-2026-07-17.md | C5 replaced 2 template capability paragraph(s) | 1 | 1 |
| 77 | first-90-days-2026-07-25.md | C1 replaced 20 mojibake sequences; C5 replaced 3 template capability paragraph(s) | 0 | 0 |
| 83 | kvm-arm-nested-virtualization-2026-08-07.md | C3 dropped 2 placeholder TODO section(s) | -2 | 1 |
| 90 | libvfio-user-bundle-decision-2026-07-30.md | C1 replaced 10 mojibake sequences; C5 replaced 3 template capability paragraph(s) | 0 | 0 |
| 92 | luks-fido2-e2e-test-2026-07-23.md | C1 replaced 2 mojibake sequences; C5 replaced 3 template capability paragraph(s) | 0 | 1 |
| 93 | metrics-and-reporting-2026-07-25.md | C1 replaced 21 mojibake sequences; C5 replaced 3 template capability paragraph(s) | 0 | 2 |
| 94 | mkosi-bcvk-fork-status-2026-07-23.md | C1 replaced 14 mojibake sequences; C5 replaced 2 template capability paragraph(s) | 0 | 0 |
| 98 | naming-licensing-provenance-2026-07-25.md | C1 replaced 20 mojibake sequences; C5 replaced 2 template capability paragraph(s) | 0 | 0 |

Observed Δisolated over kept edits: {−2: 2, −1: 2, 0: 19, +1: 3, +2: 2, null: 1}. Isolated count 49 → 49 across the whole round. Against the positive-control band on this frame (12 splices, Δ ∈ {−1, 0, +1, +2} with negatives at 2/12), every kept edit sits **inside the control band**: flat geometry is the round’s instrument observation, not a quality verdict (AGENT.md lesson 14).

## Declined root causes

The deterministic fixer (with the round’s C1x extension: comprehensive UTF-8-as-cp1252 mojibake table, tooling commit `40f649877c8c`) could not bring 42 files to PASS. Two classes:

1. **Residual partial mojibake (35 files):** truncated byte sequences (e.g. lone `â` + ASCII) are not recoverably decodable without a judgment call; per AGENT.md lesson 8 the fixer declines rather than guesses. The round fixed 1,200+ complete mojibake sequences in kept and attempted files; these residues need a human-tolerant mapping (or a curated dictionary) before a future pass can close them.

2. **C6 check artifact (7 files):** `acoustic-optical-phonons-bridge`, `blockers-drift-check`, `bootc-composefs-sealed-flow`, `dhi-io-base-image-digest-rotation`, `endlessh-openwrt-fit`, `kernel-rootfs-split`, `mkosi-tools-tree-tracking` fail only on repo-relative links (`../docs/BLOCKERS.md`, `../PINNED.md`, `../papers/…`, `../tools/…`) that resolve in the full repo but not under this round’s `refs/`-only local mirror. Their other defects (template paragraphs, placeholder TODOs) were fixed by the fixer and reverted. A future round should run the check against a full-repo mirror or teach C6 the repo tree.

## Instrument readings filed this round

- **Positive control** (cutpaste-splice/1, 12 splices, seeds 20260920/20260921): Δisolated {negative 2, zero 5, positive 5}, min −1 / median 0 / max +2; 3/12 quantization-silent; occupied-sector delta 0 in all 12. Unlike round 4’s frame, this frame’s control band includes −1, so a real-edit Δ of −1 is noise on this frame.

- **Axis trial** (loo-nn-vote/1, K=40): 5/9 axes excluded-from-fixed-margin-null, 4 not-excluded, total z +5.33 (descriptive, `admitted:false` always). Round 4 (map 78): 7/9, +5.36; round 3 (map 66): 9/9, +6.53.

- **Declined ADD rungs by policy** (no synthetic refs docs): sector 6 (rows 40), 9 (41), 2 (42), 1 (105), 12 (153), 2-again (154?), 10/12 (233-batch). One decline row per sector per pass, per AGENT.md lesson 9.

## Incidents (on the record)

- Cycle-1 pre-registration was duplicated (rows 30-34) by driver restarts that crashed on a check-script permission error before any inspection; the duplicates were closed with supersede rows 35-38 and the driver now reuses pending rows idempotently.

- Cycle 59 fixed `days-61-90-willingness-to-pay-2026-07-25.md` locally, then crashed on a transient GitHub API error before the tree commit; the retry wrongly filed an abstained row (161). Repaired: commit `6357608a4a08` carries the fix, row 162 supersedes 161 with the kept verdict. The ref PATCH 422 that dropped the repair commit from the branch for one batch was caught by the branch-head-vs-state check and re-pointed (non-force, fast-forward).


## Receipts

- Held draft PR: **#243** (`wayfinder-refs-round5-2026-09-17`), 31 commits: prep doc, 29 cycle commits, fixer C1x tooling commit, this results doc + refs tooling.

- All geometry ran on the live Worker (`steady-orbit`); maps 89-118 and 215 outcome rows are in shared public storage.

