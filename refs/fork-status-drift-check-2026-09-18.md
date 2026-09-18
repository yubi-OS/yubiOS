# mkosi + bcvk fork status — 2026-09-18 re-verification (drift check)

Date: 2026-09-18. Family: drift-check record. Origin: wayfinder round 8 exemplar fallback on
`refs/mkosi-bcvk-fork-status-2026-07-23.md`. All observations are live reads on 2026-09-18 via
the GitHub API on `yubi-OS/*` forks and their upstreams.

## Fork pin states, re-verified

| Fork | Doc snapshot (2026-07-23) | Live 2026-09-18 | Verdict |
|---|---|---|---|
| `yubi-OS/mkosi` | main at `e1e9eafc` = the pinned upstream snapshot (systemd/mkosi) | fork main `e1e9eafc` (2026-07-20); upstream systemd/mkosi main now `847d1138` (2026-09-09) | **pin discipline holding** — the fork has not drifted from its pinned source; upstream moved ~7 weeks of work ahead, which is exactly what the pin is for |
| `yubi-OS/bootc` | (snapshot `18b96d7b`) | fork main `18b96d7b` (2026-07-20) | **consistent** — same pinned-source posture; upstream bootc is now at release v1.16.13 (per this round's upstream drift check) |
| `yubi-OS/bcvk` | main with the yubiOS USB-passthrough patch series (upstream lacks it) | fork main `fc6602f0` (2026-08-24) — the fork HAS moved since the doc's refresh | **moved; contents not diffed here** — the fork's advance should be a separate content check before any claim about which patches it carries |

## What this record does not claim

The doc's central claims (mkosi v27 PKCS#11 signing parity with yubiOS's sbsign path; bcvk
upstream still lacking YubiKey USB passthrough) were not re-derived from upstream sources this
pass — only the fork HEAD positions were read. The bcvk fork's 2026-08-24 advance is a real
unverified delta: if it absorbed upstream work, the org's patch series may need a rebase check;
if it is org-side work, the fork is carrying it locally as before. Either way the fork-status
doc's snapshot is now behind the fork by at least one move, and that belongs in the next
fork-audit pass, not in this record.
