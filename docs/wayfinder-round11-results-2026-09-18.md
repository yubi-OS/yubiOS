# Wayfinder round 11 results: docs/ corpus at frame 5b50eaeff5c6d1c1

Date: 2026-09-18. Family: run-results record. Origin: round 11, cycle 30 — the closing record.
30 iterations on the `docs/` corpus (21 docs at round start), one file per commit, every cycle
pre-registered on the outcomes ledger, held PR throughout.

## Round parameters

| Parameter | Value |
|---|---|
| Baseline map | 296 (frame `5b50eaeff5c6d1c1`, N=21, isolated 19, V2 0.42881) — post-round-10 main `8ba59c82`, frozen check 0/21 failing at round start |
| Positive control | n=6, seed 20260919: bits moved 4/6, 2 quantization-silent |
| Axis trial | 0/9 axes excluded-from-null (z −0.01) — at N≈21 the trial has no resolution; recorded, nothing admitted |
| Chain | maps 296 → 324-class across the round, frame frozen throughout |

## Cycle outcomes

| Class | n | Files |
|---|---|---|
| Rung-driven ADD records | 4 | claims-boundaries (the pre-publish check for PR.md edits), self-corpus drift check, CI_MAP drift check, mitigation-coverage check — one per ladder rung |
| Drift-check addenda | 22 | ADR, PLAN, FUTURE, THREAT_MODEL, PR, SECURITY, MILESTONE, MAINTAINER, OPTS, SOUL, SELF, SPEC, MITIGATE, TODO, CITATION, CI_MAP, BLOCKERS, ARCHITECTURE, LEARN, ONBOARDING, SER, MISSION — every doc in the corpus received a dated round-11 verification note |
| Integrity audits | 2 | round-11 commit audit (all round commits resolve), ledger-state snapshot |
| Results ledger | 1 | this record |

## Findings

1. The docs/ corpus is fully clean under the frozen check (0/21 failing after rounds 9-10); the
   round's work is dated verification plus four new boundary/drift records — no repair class
   remained.
2. CI_MAP.md's workflow counts are stale vs. the 39-workflow census (flagged, not edited).
3. The corpus-drift check found no SELF/SOUL contradiction; staleness-by-time is flagged for the
   next self-doc refresh.
4. The outcomes-ledger read mid-round returned zero rows on the round baselines (recorded in the
   cycle-29 snapshot); treat that count as a read-time artifact to re-verify at round close, not
   as evidence about the ledger.

## What this record does not claim

Geometry stayed flat (isolated 19→18-21 band, V2 0.41-0.45 band) on a 21-doc corpus too small
for the axis trial to resolve; counts only, no rates. Geometry never authorized keeping or
reverting; the frozen task check governed every commit.
