# HIGH-MEM ARM64 runner: org-level attach + first CI findings (OMN-165)

**Date:** 2026-09-09 (attach session) / recorded 2026-09-13
**Scope:** the org-level self-hosted runner backing the Chromium arm64 build path;
companion to `refs/chromium-provenance-overlay-status-2026-09-09.md` (OMN-165).

## What exists

Org `yubi-OS` has two self-hosted ARM64 runners (verified live via GitHub API):

| Runner | Labels | Status |
|---|---|---|
| `ubuntu` | self-hosted, Linux, ARM64, **HIGH-MEM** | online |
| `rock1` | self-hosted, Linux, ARM64, KVM | online |

The `ubuntu` runner is Jenny’s HIGH-MEM attach (2026-09-09): 12 cores, 64 GB-class RAM
(62 GiB observed), ~188 GiB free disk at first boot. Purpose: build testable arm64 Linux
Chromium versions for the provenance-gated browser (OMN-165) — it is the first org-owned
compute for that build path, replacing the "no runner we own" blocker with a start-capable one.

## First CI findings (2026-09-09)

1. **CI stopped on missing build tools**: the runner image lacks the Chromium build
   toolchain; the first arm64 workflow runs stopped at tool bootstrap, not at compile.
2. **sudo requires interactive authentication**: the runner user cannot `sudo apt install`
   non-interactively; no passwordless sudo was granted.
3. **Mitigation in place**: the runner is restricted to Chromium’s main-branch workflow,
   and a one-time tool installer was prepared that does not change sudo permissions
   (no NOPASSWD grants, no /etc/sudoers edits).

## Honest capacity note

Chromium’s documented build floor is roughly 32+ cores / 64 GB / 1–3 h for a full build.
HIGH-MEM is 12-core: enough to bring up and validate the arm64 build path incrementally
(component builds, debug configs), not enough for routine full builds. Treat it as the
bring-up lane, not the production lane.

## Open

- Whether the tool installer can complete without interactive sudo, or the runner host
  needs a manual one-time provision step by the owner.
- GitHub large-runner alternative stays the fallback for full builds (per OMN-165 blockers).

## 2026-09-18 drift check (wayfinder round 8, cycle 39)

HIGH-MEM runner record: the runner registry facts (runner 22, chromium-high-mem group 3) were re-cited from the round-2 records; the runner itself has had no new workflow runs this round (runs API shows only lean-check/lean-run on yubiOS).

## 2026-09-18 drift check (wayfinder round 8, cycle 45)

HIGH-MEM runner record: runner-registry facts re-cited from the round-2 records (runner 22, group 3); no new arm64-linux workflow runs observed this round (runs API shows only lean-check/lean-run on yubiOS).
