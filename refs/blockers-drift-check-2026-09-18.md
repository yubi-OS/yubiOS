# Blockers register — 2026-09-18 drift check (against live main)

Date: 2026-09-18. Family: drift-check record (cf. `refs/blockers-drift-check-2026-09-09.md`,
which verified the same register's two newest rows). Origin: wayfinder round 8 rung
`add:s5:010001001`, exemplar `refs/blockers-drift-check-2026-09-09.md`. All observations are
live reads on 2026-09-18 at `yubi-OS/yubiOS` `a6fbbdb9` (docs/BLOCKERS.md fetched at that
commit).

## Register state

`docs/BLOCKERS.md` says `Last reviewed: 2026-08-24` — 25 days before this read. The round-2
drift check (2026-09-09) already verified two rows against live evidence; the register has not
been reviewed since 2026-08-24, so both of that check's findings remain unreflected in the text:

| Row | Register text says | Verified state | Drift |
|---|---|---|---|
| `B-VGPU-VM-UNZIP` (still in Active Blockers) | its own row text says: fix shipped in code, verification run dispatched, "Once rock1 is back: confirm steps 21/33/37 and the Negative 2 refusal, then retire this row" | rock1 has been online since 2026-09-09 and the retirement condition was met by three consecutive green sealed-UKI/vGPU runs recorded in `refs/blockers-drift-check-2026-09-09.md` (runs 34408180552 / 34410693076 / 34410693069, all success) | **retirement condition met 9 days before this read; row should move to "Not Current Blockers"** |
| `B-ROCK1-OFFLINE` (row says both runners offline as of 2026-08-24, GPU runner named) | round 2 verified 2026-09-09: rock1 online/idle; the `GPU` runner no longer exists in the registry (replaced by `ubuntu`, HIGH-MEM, ARM64) | **stale on both counts** — the row names a runner that no longer exists and a power action that already happened |
| `B-RK3588-TPL` (ROCK 5B needs real DDR/TPL) | unchanged; the RK3588 DDR/TPL pin work (OMN-37/56) is still open per the round's records | consistent, still true |
| `B-BOOTC-SEAL` Phase 2: "bootc 1.16.3 has no project-authored BLSConfig drop-in intake... or fedora-bootc carrying bootc v1.16.4+" | upstream bootc releases now through v1.16.13 (2026-09-15) — the version-floor half of option (b) is past; whether a fedora-bootc image carries it is a separate manifest check | **option C's version floor is unblocked upstream**; the row's open question narrows to the fedora-bootc manifest |
| `B-PINS` ("base-image digest changes require explicit PINNED.md updates") | live check this round found the fedora-bootc digest pin in `Containerfile` 404ing on quay (see `refs/fedora-bootc-digest-drift-check-2026-09-18.md`) | **the register's B-PINS row is now actively bitting: the pin is stale** and the next main image build will hit it |

## What this record does not claim

No Linear sweep was run for this check: OMN states cited are from the round's earlier records
(OMN-42/89 Done; OMN-36 open), not a fresh GraphQL pass. The register's "Inconsistency Log"
section was not audited row-by-row. The two stale rows above are text drift, not process
failure — the register's own retirement rule (move resolved rows out at review) requires the
next review to have happened, and it has not since 2026-08-24.
