# yubi-OS Org Repository Census (verified 2026-09-09)

Full census of the `yubi-OS` org's repositories, verified live via the GitHub API on 2026-09-09
(`GET /orgs/yubi-OS/repos?per_page=100`). Complements `refs/org-state-audit-2026-07-23.md`
(which audited repo roles, not sizes/activity) and `refs/linear-workspace-sweep-2026-09-09.md`
(the tracker half of the org state).

| Repo | Last push | Size (KB) | Open issues |
|---|---|---:|---:|
| `agent-skills` | 2026-09-06 | 4,339 | 0 |
| `arm-trusted-firmware` | 2026-07-22 | 56,853 | 0 |
| `assets` | 2026-09-07 | 193,492 | 0 |
| `bcvk` | 2026-08-24 | 1,929 | 0 |
| `bootc` | 2026-07-22 | 7,474 | 4 |
| `chromium` | 2026-09-09 | 66,405,354 | 0 |
| `chromium-provenance` | 2026-09-09 | 19 | 0 |
| `edk2` | 2026-07-22 | 342,246 | 0 |
| `edk2-platforms` | 2026-07-22 | 34,609 | 0 |
| `edk2-rk3588` | 2025-12-07 | 83,771 | 0 |
| `image-builder` | 2026-07-22 | 258,388 | 0 |
| `mkosi` | 2026-07-22 | 8,675 | 0 |
| `ms-tpm-20-ref` | 2026-07-08 | 8,055 | 0 |
| `optee_ftpm` | 2026-07-08 | 128 | 1 |
| `optee_os` | 2026-07-22 | 40,687 | 1 |
| `particleos` | 2026-07-08 | 294 | 3 |
| `u-boot` | 2026-07-22 | 337,721 | 0 |
| `yubi-OS.github.io` | 2026-07-25 | 578 | 0 |
| `yubiOS` | 2026-09-09 | 209,936 | 1 |

Total: 19 repositories (excluding the dot-prefixed `.github`/`.example` special repos,
which are out of scope per the standing hands-off rule for dotted repo names).

Notes:

- `chromium` is the org's largest repo by three orders of magnitude (66,405,354 KB mirror),
  created 2026-09-09 as the clean upstream mirror for the provenance-gated Chromium work
  (see `refs/chromium-provenance-overlay-status-2026-09-09.md`).
- Dot-repos (`.github`, `.example`, `yubi-OS.github.io`) are excluded from this table and from
  all agent writes per the standing hands-off rule.
- Open-issue counts are point-in-time; per-issue state lives in the Linear sweep and PR #229's
  audit trail, not here.
