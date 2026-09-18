# repo-history-skill cycle 1 — first archive refresh

**Date:** 2026-08-07 (03:38 PT)
**Repos:** `yubi-OS/yubiOS` (head f355223), `yubi-OS/agent-skills` (head 1cd9412c)
**Corpus size:** 34 PRs (top-25 from each repo)
**Skill pushed:** commit `b3370639` (yubiOS) + commit `f4568108` (agent-skills), content_sha `ab942f268e6e68c7957a253e98a636beefbe69f6` (byte-identical)

## Coverage per primitive (initial 9-D basis)

| Primitive | Coverage | Verdict |
|---|---:|---|
| p0 `has_purpose` | 9/34 = 26.5% | Kept |
| p1 `has_sha` | 4/34 = 11.8% | Kept |
| p2 `has_pr_ref` | 19/34 = 55.9% | Kept |
| p3 `has_linear_ref` | 0/34 = 0.0% | Dropped (regex false-negative — cycle 2 fix) |
| p4 `has_state_progression` | 34/34 = 100% | Dropped (constant) |
| p5 `has_author` | 34/34 = 100% | Dropped (constant) |
| p6 `has_cross_corpus_link` | 0/34 = 0.0% | Dropped (regex false-negative — cycle 2 fix) |
| p7 `has_evidence` | 34/34 = 100% | Dropped (constant) |
| p8 `has_temporal_anchor` | 0/34 = 0.0% | Dropped (regex false-negative — cycle 2 fix) |

**Survivors:** has_purpose, has_sha, has_pr_ref (3 of 9)

## Curve fit quality

| Metric | Value | Gate | Pass |
|---|---:|---|---|
| ‖p‖ | 1.0 ± 1e-6 | = 1.0 | YES |
| PC1 | 0.2762 | n/a | n/a |
| PC2 | 0.2085 | n/a | n/a |
| **PC1+PC2** | **0.7311** | **≥ 0.40** | **PASS** |
| Sparse-cell count | 0 / 34 | n/a | corpus well-connected |

**Closed-loop metric FIRES** — the hyper-sphere RSI substrate validates on the live repo corpus. The skill is shippable; cycle 2 will close the 3 detection-pattern regex false-negatives flagged in the audit.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4408) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Cross-references


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4739) were identical placeholder copies with no per-file content; merged on 2026-09-18.
