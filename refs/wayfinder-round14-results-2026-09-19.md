# Wayfinder round 14 results: refs/ with the frozen-check queue after ladder exhaustion (baseline 437, frame 0511df4ac4046790)

Date: 2026-09-19. Family: run-results record (cf. `refs/wayfinder-round13-results-2026-09-19.md`).
Origin: round 14 closing record. Held PR, one file per commit, every cycle pre-registered.
Directive for this round: 100 cycles, commit every cycle, one new PR held for review.

## Round parameters

| Parameter | Value |
|---|---|
| Corpus | `refs/*.md` at main `b1dabac0` — 228 documents, 0 truncated |
| Baseline | map **437**, frame `0511df4ac4046790`, instrument `6782a97ca9c308de`, N=228, isolated 43, V2 0.3127, Ky Fan frame gap 0 |
| Positive control (cutpaste-splice/1, n=6, seed 20260919) | Δisolated {zero 4, positive 2}, min 0 / median 0 / max 2 — splices never reduced isolation on this frame, same band as round 13 |
| Admission at baseline | rayleigh **REFUSED** (λ₂ verdict flipped between independent null seeds: excluded a / not-excluded b), axis_trial **REFUSED** (axis 5 flipped), spectra admitted, radius admitted — reported per lesson 30, not averaged |
| Frozen check | `tools/skill-check/skillcheck.sh` C1–C7, frozen before the ladder was read; pre-scan **118 pass / 110 fail** of 228 (C5 template capability paragraphs 109, C3 placeholder TODO 11, C6 unresolved local link 1; classes overlap) |
| Chain | 437 → 535 (99 chained after-maps), `transition` guard declared on every after-map, frame frozen throughout |

## Cycles

100 cycles: **98 kept** (one commit each), **2 declined**, **0 reverted**.

| block | cycles | action | result |
|---|---|---|---|
| 1–3 | 3 | ADD rungs (s11 joins envharness-lean-replacement-audit, s4 joins systemd-v262-refresh, s1 joins sweep-2026-09-18-results) | 3 kept — authored live-verified documents, not stubs: `envharness-upstream-status-census` (upstream unchanged since the audited HEAD; §15 theorems 13/13 resolve), `systemd-v262-rc3-census` (v262-rc3 shipped 2026-09-15, removals pinned to v263), `frozen-check-drift-census` (see finding below) |
| 4–5 | 2 | CHANGE rungs (offer-pricing bit1, fido2-ci-emulator) | 2 kept — real frozen-check defects, deterministic fixer |
| 6–100 | 95 | frozen-check-driven repair queue | 93 kept, 2 declined (same file twice: `assets-repo-repoint-verification`, C6 judgment fix the fixer cannot reach; declined honestly both times, nothing committed) |

**Ladder exhaustion and disclosure:** at cycle 6 the ladder was exhausted of CHANGE rungs whose
targets carried frozen-check defects (the last such rung, `release-gate-checklist-v2:bit5`, was
already repaired on main in round 13). Rather than stop at 5 cycles or author filler ADDs (the
rounds-5/6 anti-pattern), cycles 6–100 worked the frozen check's own defect queue in deterministic
order: predicted_delta **null** (no geometric prediction exists for a check-driven target),
pre-registered before inspection, one file per commit, after-map recorded as measurement only.
This is the lesson-22 sweep class run inside the round PR at the round's directive; the instrument
named none of these 95 targets.

## Ledger (by frame `0511df4ac4046790`)

200 rows: 100 pre-registrations (pending, preserved) + 100 verdict rows, all 100
`preregistered:true`. by_verdict: kept 98, declined 2. observed_source: server (explainTransition)
98. Sign-comparable rows 5 (cycles 1–5, the only cycles carrying a predicted delta):
**sign_exact 0 of 5** — every ADD rung predicted −1 and observed 0; the two CHANGE rungs
predicted +1 (observed −1 and 0). Flat geometry is a result (lesson 14), reported, not averaged.

## Geometry across the chain (readings, not scores)

| quantity | baseline 437 | final 535 |
|---|---|---|
| isolated | 43 | 44 |
| edges | 251 | 248 |
| components | 97 | 99 |
| largest component | 7 | 9 |
| λ₂ (largest) | 3 (witness 5.25, bound holds) | 7 (witness holds) |
| Ky Fan gap share of trace | 0 | 0.002671 |

The Ky Fan gap grew from 0 to 2.67e-3 across the chain: small but the honest per-lesson-28 signal
that the next round should start on a fresh baseline rather than chain further. Admission at the
final map 535: rayleigh **true** (all five graph statistics not-excluded from the null on both
seeds), axis_trial still false (seed flip), spectra and radius true. On this frame the round's
graph readings are quotable; at the baseline they were not.

## Frozen check at close

**213 pass / 15 fail** of 228. The 15 are the alphabet tail of the repair queue the 100-cycle
budget did not reach (all C5/C3 classes the deterministic fixer clears); a follow-up sweep or the
next round finishes them with the same protocol.

## Finding recorded this round (cycle 3)

The 2026-09-18 sweep's "0 failing of 185" does not reproduce: the sweep merge tree (`a6fbbdb9`,
185 files) fails **112 of 185** under the byte-identical frozen check (C5 111, C3 11, C6 1), and
the failing population is essentially unchanged since (112 → 110 while the corpus grew by 43, all
43 post-sweep additions passing). Check drift is ruled out (byte-identical check at both
commits). Full record: `refs/frozen-check-drift-census-2026-09-19.md`.

## What this record does not claim

Counts only, with n; no rates, no z-to-Gaussian translation. The 98 kept verdicts are frozen-check
outcomes, not wayfinding successes: the instrument named 5 of the 100 targets, and 0 of those 5
sign predictions came true. Flat isolated count (43 → 44, via a 37-trough mid-chain) is an
instrument observation on this frame. The Ky Fan drift is a frame-adequacy note, not a quality
statement about the edits.
