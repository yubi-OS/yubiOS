# Chromium provenance overlay — 2026-09-18 re-verification (drift check)

Date: 2026-09-18. Family: drift-check record. Origin: wayfinder round 8 exemplar fallback on
`refs/chromium-provenance-overlay-status-2026-09-09.md`. All observations are live reads on
2026-09-18 via the GitHub API on `yubi-OS/chromium-provenance`.

## The status doc's claims, re-verified

| Claim (2026-09-09 doc) | Live state 2026-09-18 | Verdict |
|---|---|---|
| Overlay HEAD `2ffa9be3` ("fix(policy): schema allows the `$schema` pointer key"), 4 commits | main is now at **`839369e2`** ("ci(arm64): gate missing host tools and document native toolchain bootstrap", 2026-09-09T23:42:58Z) — at least two commits past the snapshot (`650a324b`, `839369e2`), both from the same evening | **HEAD moved** — the doc's snapshot was accurate at its read time and is now behind by the arm64-gating commits |
| "CI is green at HEAD `2ffa9be3`" | `ci` workflow: **success at `839369e2`** (2026-09-09T23:43Z) | **still true at the new HEAD** — the arm64-gating commit kept the policy CI green |
| ARM64 native toolchain gap (documented in the org's runner notes) | `Chromium Linux ARM64` workflow: **failure** at `650a324b` and `839369e2` (2026-09-09) | **now visible as a named failing workflow** — the doc's snapshot predates the arm64 lane's first real runs |

## What changed for the effort

The overlay work moved the same evening the snapshot was taken: the arm64 leg went from
"unqualified" to "explicitly gated with a documented native-toolchain bootstrap path" — which is
the runbook-first posture the org's ARM64 runner notes prescribe. The known blockers stand: no
full browser build has run anywhere yet (the 32-core/64 GB qualification and the
Anthropic-preview application are unchanged), and the `chromium` mirror (66 GB) remains
unpatched by design.

## What this record does not claim

The commit count "at least two past the snapshot" comes from the runs listing (two arm64-gating
commits visible); a full commit listing was not enumerated. No CI was dispatched and no workflow
was modified: the arm64 failures are the documented qualification gap, not a regression to fix
in this round.
