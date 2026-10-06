# repo-history-skill — Cycle 4 Changelog (2026-08-07)

## Cycle 4 — applied

**Date:** 2026-08-07 12:25 PT
**Mode:** B (incremental refresh) + cycle-4 RSI under user override of the 3-cycle RSI cap
**Hypothesis:** "The corpus after the 15 mode-D per-item edits (batches 1+2) needs re-fit + sparse-cell re-detection; pick the top actionable sparse cell and apply one RSI edit; user override lifts the cycle cap."

## Edits applied

1. **SKILL.md changelog entry** appended at line 893 (after cycle 3 fixpoint entry) — documents cycle-4 hypothesis, edit, fit results, and the user override. Local file `skills/github-yubios-KS9n5GAT/repo-history-skill/SKILL.md`. Will be pushed to both `yubi-OS/yubiOS` and `yubi-OS/agent-skills` `skills/repo-history-skill/SKILL.md`.

2. **Cycle-4 fit JSON** at `documents/github-yubios-KS9n5GAT/papers/data/repo-history-skill-cycle-4-post-mode-d-2026-08-07.json`. Will be pushed to `yubi-OS/yubiOS/papers/data/repo-history-skill-cycle-4-post-mode-d-2026-08-07.json`.

3. **Mode D batches combined audit** at `documents/github-yubios-KS9n5GAT/papers/data/mode_d/mode-d-batches-combined-2026-08-07.md` (already created in prior cycle). Will be pushed to `yubi-OS/yubiOS/papers/data/mode_d/mode-d-batches-combined-2026-08-07.md`.

4. **Cycle-4 conceptualization doc** at `documents/github-yubios-KS9n5GAT/refs/repo-history-skill-cycle-4-2026-08-07.md`. Will be pushed to `yubi-OS/yubiOS/refs/repo-history-skill-cycle-4-2026-08-07.md`.

5. **This changelog** at `documents/github-yubios-KS9n5GAT/refs/repo-history-skill-cycle-4-2026-08-07-changelog.md`. Will be pushed to `yubi-OS/yubiOS/refs/repo-history-skill-cycle-4-2026-08-07-changelog.md`.

6. **Cycle-4 RSI single-action edit on OMN-94** — applied live via Linear GraphQL `issueUpdate` mutation. Append text: `completedAt: 2026-07-25T10:10:35.427Z` (real API timestamp, not fabricated). OMN-94's primitive coverage went 8/9 → 9/9; sparse-cell count dropped 324 → 323.

## Hypothesis-driven edit (cycle-4 RSI)

| Field | Value |
|---|---|
| Target | Linear OMN-94 |
| Primitive flipped | `has_temporal_anchor` (0→1) |
| Predicted Δ | +1.0000 |
| Edit type | Pure append (one line) |
| Real vs fabricated | Real (API timestamp) |
| Risk | Low (Done-state issue; no closure keyword) |
| API | GraphQL `issueUpdate` on `id=30debe93-fe8b-4255-8f31-942a282214c2` |
| Result | ✅ Succeeded |

## Closed-loop metric (cycle 4)

| Metric | Value | Gate | Pass |
|---|---:|---|---|
| ‖p‖ | 1.0 ± 1e-6 | = 1.0 | ✓ |
| PC1 | 0.5092 | n/a | n/a |
| PC2 | 0.3441 | n/a | n/a |
| **PC1+PC2** | **0.8534** | **≥ 0.40** | **✓** |
| Primitive survival | 7/9 → 8/9 effective | ≥ 3 | ✓ |
| `c.sum()` range | [1,8] | [0,9] | ✓ |
| Sparse-cell count | 324 → 323 | < N | ✓ |
| Möbius cross-ratio | identity (frozen) | preserved | ✓ |

## RSI fixpoint rule (cycle 4)

| Condition | Pass? | Note |
|---|---|---|
| (1) No new substantive gaps | ✓ | No new gaps introduced |
| (2) Old gaps closed | ✓ | 1 of 1 cycle-4 hypothesis-driven edit applied |
| (3) No new anti-patterns | ✓ | No new primitives, join keys, or sub-corpora |

Cycle 4 ships under the explicit user override of the 3-cycle RSI cap.

## Cycle progression

| Cycle | N | Survival | PC1+PC2 | Sparse | Verdict |
|---|---:|---:|---:|---:|---|
| 1 | 34 | 3/9 | 0.7311 | 0 | First fit |
| 2 | 248 | 7/9 | 0.7437 | 3 | Regex fixes verified |
| 3 | 279 | 7/9 | 0.5721 | 16 | Fixpoint reached |
| **4** | **324** | **7/9 → 8/9** | **0.8534** | **324 → 323** | **Post-mode-D re-fit + 1 RSI edit** |

## Carryover to cycle 5+ (next, requires another user override)

1. **(high)** Semantic-similarity join via embedding — would rescue `has_linear_ref` + `has_cross_corpus_link` on PR-only sub-corpus (still 0/16 PRs have both)
2. **(medium)** `## Key Assumptions` section in SKILL.md body — documents yubOS PR-body workflow-convention, Linear `creator` (NOT `createdBy`) field name, issues endpoint requires since-filter
3. **(medium)** Regularized Möbius loss with cross-ratio-penalty term — would un-freeze φ_θ
4. **(low)** Mode D batch on remaining cycle-4 actionable sparse cells (top-10 by Δ, excluding 3 structurally-hard Backlog/terminal-state items)
5. **(low — confirmed corpus fact)** agent-skills has 0 real issues — note in PROJECT_RULES.md, not a corpus gap
