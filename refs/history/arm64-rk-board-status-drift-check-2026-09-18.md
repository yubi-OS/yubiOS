# ARM64 RK board status — 2026-09-18 re-verification (drift check)

Date: 2026-09-18. Family: drift-check record (cf. `refs/blockers-drift-check-2026-09-09.md`).
Origin: wayfinder round 8 exemplar fallback — the s1 rung's exemplar
`refs/arm64-rk-board-status-2026-07-17.md` carries time-sensitive run and registry claims. All
observations are live reads on 2026-09-18 at `yubi-OS/yubiOS` `a6fbbdb9`, the GitHub Actions
API, and Docker Hub.

## The 2026-07-17 claims, re-verified

| Claim (2026-07-17/21) | Live state 2026-09-18 | Verdict |
|---|---|---|
| Run 29869527608 compiled board components but ROCK 5B lacked real DDR/TPL input | Run 29869527608 = "yubiOS RK firmware", **success**, created 2026-07-21T21:20Z at head `3dabe892` | citation accurate |
| `ci_firmware-rk.yml` publishes `0mniteck/yubios:firmware*` tags (8 listed) | Docker Hub `0mniteck/yubios` tag listing (first 100, most-recent-first) shows only `dev-*`, `installer-*`, `uki-*`, and bare-SHA tags; **no `firmware*` tag appears in the first page** | **new finding: firmware tags not surfaced in the recent tag window** — either pushed once and never rebuilt (older than 100 newer tags) or moved to another repository; re-verify with a name-filtered query before relying on the tag list |
| "QEMU is the only boot-tested variant" | Unchanged by any newer board-leg run found in the org's recent CI (recent runs on main are lean-check/lean-run, not VM-firmware legs) | consistent, still true |
| ROCK 5B "lacks the required real DDR/TPL input and combined u-boot-rockchip.bin" | No newer firmware run changes this; the RK3588 DDR/TPL pin work (OMN-37/56) is still tracked open | still true |

## What changed since 2026-07-17

The doc's CI context ("all 22 sibling workflows") has grown to 39 workflow files, and the repo
gained Lean proof workflows (`lean-check`, `lean-run`, both green on main at `d313ac86` and
`42a0ce77` per the runs API on 2026-09-18). None of that invalidates the board matrix: Path A
hardware proof (sacrificial ROTPK/fuse burn, RPMB-backed fTPM NV, signed UKI on a real board)
remains open, exactly as the doc's Path A vs Path B section requires before any production
claim.

## What this record does not claim

No fresh hardware evidence exists as of this read: the ROCK 5B DDR/TPL input blocker and the
sacrificial ROTPK/fuse rehearsal (OMN-45) are recorded as open in the round's records, not
re-verified against Linear in this pass. The firmware-tag finding above should be re-checked
with a name-filtered Docker Hub query before acting on it; the first-100 listing is a snapshot
of tag recency, not a proof of absence.
