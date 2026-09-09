# ARM64 Path A Status Refresh (verified 2026-09-09)

Point-in-time refresh of `refs/arm64-path-a-b-board-status-2026-07-23.md` (48 days stale):
the Linear state of every tracked Path A item, verified live via the GraphQL API on
2026-09-09. This doc records states only; the architecture decisions (ADR-018/019/020,
canceled 2026-07-30, post-launch posture) are unchanged.

## Tracked items (Linear team OMNI-AGENT)

| Item | Title | State (2026-09-09) | completedAt | dueDate |
|---|---|---|---|---|
| OMN-36 | Prove ARM64 Path A production flow on real hardware | Backlog | — | **2026-09-12** |
| OMN-45 | Rehearse sacrificial ROTPK and fuse provisioning | Todo | — | — |
| OMN-46 | Capture OP-TEE, RPMB, fTPM, U-Boot evidence on hardware | Backlog | — | — |
| OMN-47 | Prove signed UKI boot + measurement on target board | Todo | — | — |
| OMN-56 | Select and pin a redistributable RK3588 DDR/TPL source | Todo | — | — |
| OMN-57 | Fail closed when the expected RK3588 DDR/TPL blob is absent | Backlog | — | — |
| OMN-58 | Validate combined ROCK 5B/RockPro64 image on sacrificial hardware | Backlog | — | — |
| OMN-141 | Schedule sacrificial RK3588 burn + name human owner | Backlog | — | — |

## Deltas vs the 2026-07-23 board status

- No state movement in 48 days: the Todo/Backlog split (3 Todo, 5 Backlog) is identical to
  the 2026-08-02 picture recorded in the workspace memory. Nothing in Path A has started.
- **OMN-36's due date is 2026-09-12 — 3 days from this verification — while the item sits in
  Backlog with no human owner and its blocking child (OMN-141, the sacrificial burn) also has
  no scheduled date or owner.** Either the due date slips or the burn gets scheduled this
  week; both cannot hold.
- Hardware-adjacent good news from the same verification pass: rock1 (the ARM64 KVM
  self-hosted runner that Path A's CI legs queue behind) is back online and idle — see
  `refs/blockers-drift-check-2026-09-09.md`. The runner is not the blocker; the sacrificial
  board rehearsal is.

## Dependency map

- Feeds OMN-36's due-date decision and the next BLOCKERS.md review (B-ARM64-PATHA row).
- Companion: `refs/arm64-path-a-b-board-status-2026-07-23.md` (the original board roles doc,
  still the hardware reference), `refs/linear-workspace-sweep-2026-09-09.md` (project-level
  rollup).
