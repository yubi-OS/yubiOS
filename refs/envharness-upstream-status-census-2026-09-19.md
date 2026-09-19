# envharness upstream status census, 2026-09-19

**Subject:** [google-research/envharness](https://github.com/google-research/envharness)
(default branch `main`), live-verified 2026-09-19 against
[`refs/envharness-lean-replacement-audit-2026-09-01.md`](envharness-lean-replacement-audit-2026-09-01.md).
Method: GitHub REST API (`GET /repos/google-research/envharness`,
`GET /repos/google-research/envharness/commits?per_page=15`) plus a tree read of
`yubi-OS/yubiOS` at `main`. This is a drift-check-style dated record; the audit
itself is unchanged and remains the source for the component verdicts.

## 1. Upstream drift since the audit: zero

The audit was taken from source at HEAD pushed 2026-08-21. Live check
2026-09-19: the repository's `pushed_at` is still `2026-08-21T06:27:18Z` and the
four most recent commits on `main` are exactly the audit-window commits:

| commit | date (UTC) | message |
|---|---|---|
| `fab7d57441f0` | 2026-08-21T06:27:16Z | Update README.md |
| `cb534e9b764f` | 2026-08-21T00:45:50Z | add links and add citation in README.md |
| `54541c62e328` | 2026-08-20T22:56:22Z | Update acknowledgment section in README |
| `fc8a314c5aef` | 2026-08-13T23:42:33Z | Code update |

All four post-audit-commits touch README metadata only (links, citation,
acknowledgment); the last code change remains `fc8a314c5aef` on 2026-08-13,
which predates the audit window the audit describes. No file the audit's
component table cites (`core/envharness.py`, `core/actionable_env.py`,
`harnesses/rules.py`, `harnesses/setup.py`, `orchestration/objectives.py`,
`orchestration/budget.py`, `core/code_loader.py`) has moved since the audit.

## 2. Companion §15 theorems resolve at main

The audit's companion is `CurvedCorpus.lean` §15 ("Harness algebra: the
envharness contracts, kernel-checked", line 1123 of
`papers/data/lean/CurvedCorpus.lean` at `main`, 57,650 bytes). Every theorem
name the audit's component table cites resolves as a `theorem` declaration at
`main`:

`hcomp_id_left_A`, `hcomp_id_left_O`, `hcomp_assoc_A`, `hcomp_assoc_O`,
`blocked_is_noop`, `passthrough_step`, `fixed_halts`, `capped_halts`,
`capped_accept_halts`, `obj_halts`, `dz_band_iff`, `weights_round_gap`,
`weights_exact_sum` — 13 of 13 present.

The tree also carries `papers/data/lean/WayfinderBounds.lean`,
`RayleighBounds.lean` and `RadiusBounds.lean` on `main`; the
`lean-check-2026-08-13` branch additionally carries `lean/CurvedCorpus.lean`
(the CI-wired copy). Both copies exist; the audit's citation
(`CurvedCorpus.lean` §15) is accurate without qualification.

## 3. Verdict

- Upstream envharness: **no drift** since the audited HEAD (0 commits after
  2026-08-21T06:27:18Z as of 2026-09-19).
- §15 companion: **intact**, all cited theorem names present at `main`.
- The audit's three-tier answer (contracts replaced, acceptance statistics
  superseded, execution layer out of scope by design) needs no revision on the
  strength of this census. Re-census if upstream `pushed_at` advances past
  2026-08-21 or if `weights_round_gap`-style per-mille normalization shows up
  in a new upstream release.
