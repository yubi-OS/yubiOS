# Org repository census — 2026-09-18 re-verification (drift check)

Date: 2026-09-18. Family: drift-check record. Origin: wayfinder round 8 exemplar fallback on
`refs/org-repo-census-2026-09-09.md`. All observations are live reads on 2026-09-18 via
`GET /orgs/yubi-OS/repos?per_page=100` (20 repositories returned).

## Census reconciliation

| Census claim (2026-09-09) | Live 2026-09-18 | Verdict |
|---|---|---|
| "Total: 19 repositories (excluding the dot-prefixed `.github`/`.example` special repos)" | Live API returns 20 repos, exactly one of which is dot-prefixed (`.github`) — there is no `.example` repo live. Non-dot count: 20 - 1 = **19** | **consistent** — and it sharpens the census's wording: the org holds one dot-repo, not two; `.example` does not exist at this read |
| Open-issue counts: bootc 4, optee_ftpm 1, optee_os 1, particleos 3 | Live: bootc 4, optee_ftpm 1, optee_os 1, particleos 3 | **unchanged** |
| yubiOS open issues: 1 (the census table's last row) | Live: **2** | **+1 since 2026-09-09** — the round-2 records noted yubiOS#24 (post-launch CHIPSEC) open; the second open issue is the new drift signal and should be triaged in the next Linear sweep rather than assumed |
| `chromium` mirror size 66,405,354 KB, created 2026-09-09 | unchanged claim; no newer push surfaced in this pass | consistent (size not re-measured) |

## What this record does not claim

Size and last-push columns were not re-measured per repo (only the issue counts and repo
inventory were compared). The census's method note stands: open-issue counts are point-in-time
and belong to the next sweep, not to either snapshot. No action is taken on the new open
yubiOS issue here; it is flagged for triage.
