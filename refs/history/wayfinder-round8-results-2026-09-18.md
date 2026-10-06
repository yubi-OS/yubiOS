# Wayfinder round 8 results: refs/ corpus at frames 9daf548b36afe198 / 10f0496abde9aab9

Date: 2026-09-18. Family: run-results record (cf. `refs/wayfinder-round7-results-2026-09-18.md`,
`refs/cycle4-results-2026-08-06.md`). Origin: wayfinder round 8, cycle 100 — the round's closing
record. Executed on a held PR, one file per cycle, every cycle pre-registered on the outcomes
ledger.

## Round parameters

| Parameter | Value |
|---|---|
| Round 8 baseline | map 173 (frame `9daf548b36afe198`, N=185, isolated 43, V2 0.3126) — post-sweep corpus, 185/185 passing the frozen check |
| Positive control | n=6, seed 20260918: isolated deltas {0, 0, 0, 0, -2, +1}; bits moved 5/6; 1 quantization-silent |
| Axis trial | 8/9 axes excluded-from-fixed-margin-null (z 4.85, exclusion-only) |
| Mid-round re-baseline | **disclosed**: a driver bug (stale disk-state reload after in-memory mutation) built maps 188-192 against incomplete corpora. Round re-baselined at cycle 20 on map 193 (frame `10f0496abde9aab9`, N=197, isolated 55, V2 0.3063), with fresh positive control (deltas {0, 0, -1, -1, +1, 0}) and axis trial (6/9 excluded, z 4.65). Pre-break rows are identified by baseline, never mixed with post-break rows. |
| Chain | 173 -> 265+ across the round, frame frozen within each baseline segment |

## Cycle outcomes

100 cycles executed. Kept edits land one commit each on the held branch; declined/skipped cycles
commit nothing. Rough shape of the round:

| Class | Cycles | Example |
|---|---|---|
| Rung-driven ADD records (joins + companion records) | early + late rungs | cycle 1 correspondence section (y33 pair); cycle 2 sweep-results record; companion records for join targets |
| Live-verified drift checks | the workhorse | friend-map readiness drift; blockers-register drift (two stale rows); digest-pin drift (fedora-bootc 404 on quay); chromium overlay HEAD moved; fork pin states |
| Census records | rounds' inventory half | papers/ (214 blobs), skills sync state, workflows (39), tests/ (40), docs/ (21 entries), point-map instrument census |
| Integrity audits | citation audits | 16/16 source SHAs + all round commits resolve at read time |

## Actionable findings this round surfaced

1. **The fedora-bootc digest pin is stale**: `Containerfile`'s `sha256:c7e6b357...` 404s on quay
   (stale since ~2026-08-05). Next main image build fails until
   `fetch-fedora-bootc-manifest.yml` re-resolves. A scheduled weekly digest check would close
   this incident class permanently.
2. **B-VGPU-VM-UNZIP's retirement condition was met 2026-09-09** (three green runs) but the
   register still lists it active; `B-ROCK1-OFFLINE` still names the retired `GPU` runner.
   BLOCKERS.md's last review is 2026-08-24.
3. **B-BOOTC-SEAL option (b)'s version floor is unblocked upstream** (bootc v1.16.13 vs the
   v1.16.4+ floor); the constraint is only the (stale) digest.
4. yubiOS open issues moved 1 -> 2 since the 2026-09-09 census; both flagged for triage.

## Geometric reading

Movement was flat-to-minor within the positive-control band on both baseline segments. Cycle 9
of this round was sign-exact and `realised` (the package-floor incident-4 edit); cycle 98's
companion ADD was sign-exact on delta with a missed-pattern landing (recorded as missed — sign
agreement and placement are separate instrumentation outcomes). Geometry never authorized
keeping or reverting; the frozen task check governed every commit.

## What this record does not claim

No sign-agreement rate, no quality score, no calibration claim: counts only, with n. The
drift-check records are dated point-in-time verifications and should be re-derived, not quoted,
after this date.
