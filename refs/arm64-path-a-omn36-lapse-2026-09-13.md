# ARM64 Path A status refresh: OMN-36 due date lapsed in Backlog (2026-09-13)

**Refreshes:** `refs/arm64-path-a-status-2026-09-09.md` (flagged the lapse risk in advance)
and `refs/blockers-drift-check-2026-09-09.md`.

## Verified fact (Linear API, 2026-09-13)

- **OMN-36** ("Prove ARM64 Path A production flow on real hardware"), project
  `yubiOS Production Proof & Release Gates`: state **Backlog**, dueDate **2026-09-12** —
  **the due date has lapsed** with the issue still in Backlog.
- Assignee is now **OMNI-AGENT** (the 2026-09-09 refresh recorded it as unowned; the
  assignment happened since). State unchanged: no Todo promotion, no schedule committed.
- OMN-36 gates the v1 launch claim ("v1 readiness gated on ARM64 Path A hardware evidence");
  the lapse is the third consecutive slip of a launch-gating issue (June 4 launch target
  deferred, OMN-141 sacrificial burn still unscheduled).

## What changed since 2026-09-09

- The blocking compute picture moved, but not on the hardware leg: HIGH-MEM (12-core ARM64)
  serves the **Chromium** build path (OMN-165), not the RK3588 burn. No runner in the org
  can perform OMN-141’s sacrificial ROTPK/fuse work — that needs the physical board.
- OMN-45 (rehearse sacrificial ROTPK/fuse) and OMN-47 (signed UKI boot on target board)
  remain the operative children; both need the board in hand.

## Decision owed

Either re-date OMN-36 with a committed schedule for the burn, or formally split the launch
gate: keep v1 gating on the VM-level evidence chain (OMN-53 lane green, FIDO2 hardware leg
passed via Issue #20) and track the RK3588 burn as a post-launch hardening item. Leaving a
lapsed due date on a launch-gating issue is the current state; this doc records it rather
than resolving it.
