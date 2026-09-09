# Provenance-Gated Chromium: Overlay Status (verified 2026-09-09)

The provenance-gated Chromium effort (Linear OMN-165, Backlog High, filed 2026-09-09) had no
`refs/` record. This doc captures the verified state of the two org repos so the project has a
conceptualization anchor in the refs/ corpus. All paths, commits, and CI results below were
verified live via the GitHub API on 2026-09-09.

## Repos

| Repo | Role | State (verified 2026-09-09) |
|---|---|---|
| `yubi-OS/chromium` | Clean mirror fork of chromium/chromium (main only, 66 GB) | default branch `main`, last push 2026-09-09T20:43:14Z — never patched directly |
| `yubi-OS/chromium-provenance` | Brave/ungoogled-style overlay: policy gate + verifier + patch series | default branch `main`, last push 2026-09-09T20:57:34Z, 4 commits |

## Overlay commit chain (chromium-provenance, oldest first)

1. `d26bea16` — chore: pin Chromium `153.0.8010.36` (seed commit)
2. `4a1dc500` — feat: scaffold provenance-gated Chromium overlay
3. `7da258a5` — ci: pin actions to full-length SHAs (org policy)
4. `2ffa9be3` — fix(policy): schema allows the `$schema` pointer key (current HEAD)

## CI status

| Run | Head | Result |
|---|---|---|
| 34403794657 | `4a1dc500` | failure |
| 34403944454 | `7da258a5` | failure |
| 34404141858 | `2ffa9be3` | **success** |

CI is green at HEAD `2ffa9be3`; the two failures are the scaffold and the SHA-pinning commit
it fixed, not open regressions.

## Verified overlay contents (tree at HEAD)

- `policy/default.json` — the provenance policy document (with JSON-schema `$schema` pointer support)
- `PINNED.md` — Chromium version pin
- `patches/SERIES.md` — patch series plan (7-patch plan, not yet authored — needs a real checkout)
- `components/provenance_gate/` — policy engine (`BUILD.gn`, `policy.cc`, `README.md`)
- `verifier/` — Cloudflare Worker verifier skeleton (`src/adapters.js`, `src/aggregate.js`, `package.json`)

## Open items (not re-verified here)

- The Chromium build itself is unproven: needs a 32+ core / 64 GB runner (1-3 h build); no runner
  the org owns qualifies (GitHub large runner vs self-hosted x86 is undecided).
- The Anthropic Claude watermark-detector preview application is pending (detector is a
  private-preview API gated to regulators/media/fact-checkers/independent researchers).
- Detection stack and the ADR-000 `block_on_detect` / `provenance_required` modes are recorded in
  the Linear OMN-165 description; this doc deliberately does not duplicate them.
