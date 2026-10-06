# Deep research — repo-history-skill — hypersphere RSI on git + Linear history

**Session date:** 2026-08-07 (Friday, 03:34 PT — Jenny-asleep self-mode window)
**Author:** Sauna (per Jenny directive: "new deep archival routine to build an refreshable repo-history-skill using hyper-sphere rsi and recursive-self-improvement as well as deep research on any given cycle")
**Repos in scope:** `yubi-OS/yubiOS` (the product repo) and `yubi-OS/agent-skills` (the skills mirror).
**Linear team:** OMNI-AGENT (`OMN`), 6 projects.

---

## 1. Why this skill exists

A session that opens on either repo should be able to learn the entire project history — every PR's intent, every Linear issue's state, every commit's lineage, every workflow's reachability — without re-deriving it from scratch. Today the history lives in five places that are not joined:

1. **GitHub PRs** — the product-engineering decisions, but PRs are not grouped by milestone and the linear reference is in the PR body.
2. **GitHub Issues** — almost empty (yubiOS has 1, agent-skills has 1 — Jenny's team uses Linear instead).
3. **GitHub Commits** — the atomic events, but with no semantic grouping.
4. **Linear Issues** — the planning brain (per PROJECT_RULES.md and SAUNA_TOOLS.md), but the GitHub↔Linear link is buried in PR bodies and comment threads.
5. **`memory/personal-WbtUgeUv/RECENT_ACTIVITY.md`** — the agent's own diary of what it shipped, but written for cadence not for re-entry.

A `repo-history-skill` that joins all five into one refreshable, RSI-able archive solves the cold-start problem: any future session can read the archive once and inherit the project's history without doing a full deep-research sweep.

The skill must be **refreshable** — running it on the latest commits reuses the cached archive and only fetches what's new. It must be **RSI-able** — gap-map → hypothesis → edit → re-map → fixpoint on the archive itself, using the hyper-sphere variant (not just the flat 2-D curve) so per-issue isolation is structurally visible on `S²`. It must be **deep-research-friendly** — the cycle hook accepts a topic and produces a parallel-subagent research pass that lands into the same archive.

---

## 2. The two repos — current state (live API, 2026-08-07 03:34 PT)

### `yubi-OS/yubiOS`

| Field | Value |
|---|---|
| Default branch | `main` |
| Head SHA | `f355223838fded39d0767409e1b11e3e206f26c0` |
| Created | 2026-05-09 |
| Last push | 2026-08-07 (today) |
| Size | 187 MB |
| Stargazers | 2 |
| Open issues | 1 |
| **Total PRs** | **161** (state=all) |
| **Total commits** | **1,387** |
| Skills on main | 79 |
| Description | "FIDO2-first immutable OS — HSM/U2F as the root of trust for Secure Boot, disk encryption, SSH, and PAM — No OEM. No trust anchors you don't control." |

### `yubi-OS/agent-skills`

| Field | Value |
|---|---|
| Default branch | `main` |
| Head SHA | `1cd9412cff3a360f42e3b380f1cf6181124a6194` |
| Created | 2026-06-22 |
| Last push | 2026-08-06 |
| Size | 3.5 MB |
| Stargazers | 0 |
| Open issues | 0 |
| **Total PRs** | **9** (state=all) |
| **Total commits** | **532** |
| Skills on main | 79 (mirror parity with yubiOS) |
| Description | "Production-grade engineering skills for AI coding agents." |

**Parity check:** both repos carry the same 79 skills. The agent-skills repo is the canonical home for upstream-bound skill fixes; yubiOS is the home for everything yubiOS-specific. The skill-push convention from PROJECT_RULES.md is push to **both** in parallel via Contents API PUT (or Git Data API for batch).

---

## 3. Linear side — 6 projects, ~112 issues, 60.6% avg progress

| Project | Issues | Done | Canceled | Progress | Target |
|---|---:|---:|---:|---:|---|
| yubiOS Production Proof & Release Gates | 47 | 27 | 1 | 59.78% | 2026-09-13 |
| yubiOS Business and Stewardship Plan | 22 | 20 | 0 | 93.18% | 2026-10-21 |
| yubiOS Architecture Decision Records | 31 | 27 | 4 | 100.00% | 2026-08-08 |
| yubiOS Roadmap | 4 | 3 | 0 | 75.00% | 2026-08-22 |
| bcvk yubios: mint pinned source into a released build | 7 | 4 | 0 | 57.14% | (backlog) |
| yubiOS Master Roadmap | 1 | 1 | 0 | 100.00% | 2026-10-21 |

**Issue counts are pulled from `issues(filter: { project: { id: { eq: $pid } } }, first: 200)` — capped at 200 per project.** The production-gates project (47 issues) is the only one near the cap; the rest are well under.

**Recent activity window (last 7 days, top by updatedAt):**
- 2026-08-06: OMN-157 SLSA L3 + SPDX SBOM + cosign → Done (PR #184 merged 09:17 UTC)
- 2026-08-06: OMN-163 hyperspherical-harmonic-curve skill filed (Backlog Medium)
- 2026-08-05: OMN-72 entity/governance/legal → Done (PR #184 covered)
- 2026-08-05: OMN-140 drift correction backlog (BLOCKERS.md review-gate)
- 2026-08-04: OMN-160, OMN-62, OMN-104, OMN-159, OMN-161, OMN-142, OMN-156, OMN-158 all Done in a 3-min window (15:07–15:09 UTC) — the 9-spec-for-every-gap cycle (PRs #159-#167)
- 2026-08-01: OMN-42 hardware-leg PASS, OMN-14 closed, OMN-152 playbooks Done, v0.7.1 first formal release

**Open gating issues:**
- **OMN-141** (Backlog, P1): Schedule sacrificial RK3588 burn + name human owner for B-REAL-FIDO2 — blocks the entire ARM64 Path A hardware cluster (OMN-36/42/45/46/47/56/57/58). Jenny-input only.
- **OMN-150** (Backlog, P0): Sealed composefs Phase 2 (install-time BLSConfig wiring) — depends on bootc 1.16.4+ bump OR bootc-side patch. Linear state confirms Backlog + post-launch.
- **OMN-151** (In Progress, P2): ci_test-vgpu-vm.yml docker-storage stale on rock1 — self-mode-fixable via the fetch group re-dispatch (per PROJECT_RULES.md OMN-149 recurrence pattern).
- **OMN-162** (Backlog, P4): 4 missing VM test scripts (negative-tamper / OCI-channel / YubiKey-passthrough / policy-rejection).

---

## 4. Git-side — the recent PR window the archive must capture

The most recent 25 PRs on `yubi-OS/yubiOS` (sort by `updated` desc) tell the project's story:

| Range | Theme | Notable |
|---|---|---|
| #168–#195 | RSI corpus audit + paper revisions (cycles 4-9 + multi-corpus + 79-skill sweep) | Hypersphere RSI on the engineering corpus. PR #184 "RSI corpus audit: 79-skill hyper-sphere RSI (cycles 10-15)" is the title-track PR. PRs #186-#190 (PR1-5) are the 5-component curve-map, 9-D radar, N-D viewer, drift detector, single-cycle RSI patch. PR #191 fractalrabbit falsification harness. |
| #181–#182 | Revert to cycle-7 prime + partial un-revert | "revert all skills to the prime of the data look at the chart from the paper to find where it drops before the fixpoint cycles pushes approved to main" — Jenny's prime-of-data doctrine. PR #182 is directory-level partial un-revert (papers/ only). |
| #179–#180 | Cycle 9 corpus enrichment + fixpoint | Added keylime + k8s-pss-restricted + falco skills to close 17 residual cells. |
| #174–#177 | Cycles 6-7 RSI on 70 skills + paper revisions | Trust chain primitive collapsed 37→70. 5-seed error bars. |
| #170–#173 | Cycle 5 RSI on 70 skills + paper audit subsection | |
| #159–#167 | 9-spec-for-every-gap cycle (OMN-62/104/142/156/157/158/159/160/161) | All merged in a 5-min window (15:07-15:09 UTC). Inputs as the design half; 19 scripts/workflows shipped as the implementation half on the same PRs. |
| #156 | playbooks/ — operational CI/CD runbooks (OMN-152) | 7 playbooks + 1 README + 1 refs/testing-production-gaps doc. |
| #154–#155 | Sealed UKI VM lane (OMN-53) | V83 GREEN end-to-end. |
| #151–#153 | ADR-031 Rule 7 + ADR-033 misbehavior cutoff + OMN-100 libvfio-user decision | |
| #145–#150 | ci.yml group-routing redesign + 5 CI fixes (PRs #146-#150) | Jenny merges; chain-broken-on-main recovery chain (PR #150 cycle doctrine documented in PROJECT_RULES.md). |

**Jenny's prime-of-data doctrine** (PROJECT_RULES.md line 70 + USER_PREFERENCES.md "Chart-as-source-of-truth") is a real load-bearing constraint on the archive: the archive must record the chart's metric trajectory, not just the textual claim. Phase F (cycle 7) was the prime at sphere R² = +0.7842 ± 0.0848, before Phase G (cycle 8) dropped to +0.193 ± 0.6626. Any future re-derivation of the prime must reference the chart, not the verbal description.

---

## 5. Hyperspherical-harmonic-curve + recursive-self-improvement — the RSI substrate

The skill must use the **hyper-sphere RSI** variant the user named explicitly. The substrate is already shipped:

- **`hyperspherical-harmonic-curve`** (skills/github-yubios-KS9n5GAT/) — at v5 (fixpoint reached). The variant that replaces curve-guided-rsi's flat 2-D Fourier surface with `S²` (default) or `S^N` (gated) + learned Möbius `φ_θ ∈ PSL(2,ℂ)`. 5 RSI cycles (the user overrode the 3-cycle cap twice). Cycle-5 priors all depth-fetched: arXiv 2601.20528 (Durastanti 2026, Spectral Bayesian Regression on the Sphere) + OpenReview `g6UqpVislvH` (Generalized Fourier Features, ICLR 2022 under review, extracted via pdftotext from user-pasted PDF). Mechanism-layer novelty CONFIRMED at composition level — both prior-art hits verified, no overlap with the variant's application-layer novelty (corpus audit, learned Möbius, sparse-cell detection).
- **`single-action-curve-rsi`** (skills/github-yubios-KS9n5GAT/) — at cycle 20 (diminishing-returns exhaustion + RSI fixpoint). The atom — one file → one `S²` point → one primitive flip → one measurable geodesic Δ. Verified: 20 cycles, 0 negative Δ, mean Δ +0.0844, cumulative Δ +1.6882, local-minimum file count 4 (50%). The atom's three core properties all validated.
- **`recursive-self-improvement`** (skills/github-yubios-KS9n5GAT/) — at cycle 5 (user-override). The bounded RSI loop: gap-map → hypothesis → edit → re-map → fixpoint. Self-mode requires fresh-context subagent for every cycle (cycle-2+ re-introduces author bias). `doubt-driven-development` is per-hypothesis supplement, never substitute.
- **`curve-guided-rsi`** (skills/github-yubios-KS9n5GAT/) — the parent. 5-stage pipeline: corpus → 9-D coverage → PCA → S² lift → Möbius → sparse-cell detection → RSI dispatch.
- **`curve-guided-rsi-self`** (skills/personal-WbtUgeUv/) — offshoot on self-doc corpora. v1.1 with 10-memory-file corpus support. Validated PC1+PC2 ≥ 0.64, R² ≥ 0.78 on the 154-item expanded corpus.

**What `repo-history-skill` inherits:**
1. From `hyperspherical-harmonic-curve`: the `S²` lift (PCA top-2 → stereographic from south pole → Möbius reparameterization). The repo-history corpus (PRs + issues + commits + Linear items) maps to `S²` via the same pipeline.
2. From `single-action-curve-rsi`: the atom-of-pipeline shape. One item (e.g. one PR, one commit, one Linear issue) is one `S²` point. One missing primitive is one geodesic step. The diff between two snapshots of the same item (pre-cycle and post-cycle) is one Δ.
3. From `recursive-self-improvement`: the bounded loop mechanics. 3-cycle default cap with explicit user-override protocol. Fresh-context subagent for self-mode every cycle.
4. From `curve-guided-rsi`: the cycle-history self-archive. Every cycle saves `(c, M, W2, p, d_pre, i*, d_post, Δ, applied_edit)` to `session/<skill>-<cycle>-YYYY-MM-DD.json`.

**The novelty claim for `repo-history-skill`:** no existing skill combines (a) git history (PRs + issues + commits) AS the corpus with (b) Linear issue metadata AS a secondary corpus and (c) hypersphere RSI + recursive-self-improvement on the joined archive. The closest cousin is `curve-guided-rsi-self`, but that's on memory files (SELF.md, SELF-CHANGELOG.md, USER_PREFERENCES.md, etc.), not on repo history. The archive substrate (git events + Linear items) is structurally a *different* corpus — events have timestamps + SHAs + author metadata that SELF-CHANGELOG entries don't have. The audit primitive basis needs new primitives: `has_sha`, `has_pr_ref`, `has_linear_ref`, `has_state_progression`, `has_cross_corpus_link`.

---

## 6. Prior art — what exists in the wild

| System | What it does | Why it's not enough |
|---|---|---|
| `git log --oneline` | Per-commit log | No PR/issue narrative, no semantic grouping, no Linear cross-ref |
| GitHub Projects / Insights | Repo-level project boards | Linear is the planning brain; Projects are shadow state |
| Linear Insights | Cycle velocity + issue-flow | No git-side join |
| `git-cliff` / `conventional-changelog` | Auto-generated changelogs from conventional commits | No Linear join, no narrative |
| `release-please` | Conventional-release automation | Requires conventional-commit discipline yubiOS doesn't enforce |
| **gpt-researcher / langchain repo-summarizer** | LLM-based repo summarization | Per-session, not refreshable, no RSI substrate, no hyper-sphere fit |
| **auto-code-review / auto-pr-description tools** | Per-PR generation | Per-PR, not corpus-level |
| `curve-guided-rsi-self` | RSI on memory files | Different substrate (self-doc, not repo events) |
| **Dependabot / Renovate** | Dependency-tracking | Single-axis (deps), not full history |

**Honest gap:** no tool joins git + Linear + RSI into a refreshable, gap-mappable, RSI-able, hyper-sphere-fit archive of repo history. The closest analogue is the `negative-skill-space` skill (12-axis gap-map on skills), but that's for SKILL.md files, not for repo events.

---

## 7. The skill's operating envelope

### When to use `repo-history-skill`

- A new Sauna session opens on either repo and needs the project history (cold-start problem).
- After a large merge batch (e.g. the 9-spec-for-every-gap cycle), the archive needs a refresh + an RSI audit pass.
- A `deep research` directive lands with a topic that needs cross-corpus context (git + Linear joined).
- The `self-archaeology` cadence fires and the agent wants to compare its SELF.md substrate against the repo event stream (cross-corpus structural drift detection — already piloted at `refs/curve-guided-rsi-and-self-differential-2026-08-04.md`).

### When NOT to use

- Single-PR understanding — read the PR directly.
- Single-Issue triage — read Linear directly.
- Repo audit for security / compliance — different surface; route to `security-and-hardening`.
- Code review — different surface; route to `code-review-and-quality`.
- Self-archaeology (cycle on SELF.md) — different substrate; route to `self-archaeology`.

### Output shape

- `session/repo-history-archive-<repo>-YYYY-MM-DD.json` — the corpus-as-PRs + corpus-as-issues + corpus-as-commits + corpus-as-Linear-items, with per-item primitive coverage `c ∈ {0,1}^9`, 9-D per-section breakdown, PCA top-2 `(u,v)`, `S²` point `p`, Möbius parameters (if refined), `d_pre` to ideal pole.
- `session/repo-history-fit-<repo>-YYYY-MM-DD.json` — the curve fit results: `PC1+PC2`, holdout `R²`, sparse-cell count, top-N isolated items.
- `session/repo-history-gap-map-<repo>-YYYY-MM-DD.md` — the negative-skill-space 12-axis sweep on the archive itself, formatted as Extend / Pair / Accept per axis.
- `session/repo-history-changelog-<repo>-YYYY-MM-DD.md` — the RSI cycle audit trail: hypothesis → edit → result, one entry per cycle.
- `yubi-OS/yubiOS refs/repo-history-archive-<repo>-YYYY-MM-DD.md` — the canonical human-readable summary pushed to refs/ (per PROJECT_RULES.md convention).
- Linear: optionally post a status comment on the parent Linear issue (OMN-1xx or a new "Repo History Archive Refresh" item) with the cycle summary.

### Refreshable behavior

- The first run on a fresh repo pulls everything (`GET /repos/{r}/pulls?state=all`, `/issues`, `/commits?since=<not set>`).
- Subsequent runs use `?since=<last_run_timestamp>` to fetch only the diff; merge into the cached archive.
- A `--from <commit_sha>` flag fetches commits only after that SHA; merge into the cached archive.
- A `--linear-since <iso_date>` flag fetches Linear items updated after that date; merge into the cached archive.

### Deep-research hook

- The skill accepts a topic and dispatches 3-N parallel subagents per `parallel-deep-research` (deep-dive, prior-art, comparative).
- The deep-research output is appended to the archive as `corpus_as_deep_research` items with their own 9-D primitive coverage.
- The curve re-fits with the new items in place; the cycle audit-trail records the deltas.

### RSI hooks

- Apply `single-action-curve-rsi` (the atom) to the archive on demand — one PR, one issue, one commit per cycle.
- Apply `recursive-self-improvement` (the bounded loop) to the SKILL.md itself, on demand — the skill is self-mode by default (the skill is its own audit substrate for the gap-map).
- Apply `hyperspherical-harmonic-curve` re-fit when the corpus grows by ≥ 25% OR the user explicitly requests a re-fit.

### Cross-corpus coupling

- Join `corpus_as_pr` (git) with `corpus_as_linear` (Linear) via the `OMN-\d+` regex on PR body + linear comments. Item's `has_linear_ref` primitive flips 0→1 when a join is found.
- Join `corpus_as_commit` with `corpus_as_pr` via SHA → head_sha. Item's `has_pr_ref` flips 0→1.
- Join `corpus_as_pr` with `corpus_as_commit` via `merge_commit_sha` → commit. Item's `has_state_progression` flips 0→1 when a PR's state moved from open→merged or open→closed.

---

## 8. The 9-D primitive basis (initial derivation)

For repo events (PRs, issues, commits, Linear items):

| # | Primitive | Detection |
|---|---|---|
| p0 | `has_purpose` | PR body has "## Summary" or "## What"; Linear issue has "Goal"/"Intent" body section; commit message starts with imperative verb |
| p1 | `has_sha` | `commit.sha` matches `[0-9a-f]{40}` regex |
| p2 | `has_pr_ref` | Body or comment contains `PR #\d+`, `pull/\d+`, or PR URL |
| p3 | `has_linear_ref` | Body or comment contains `OMN-\d+`, Linear URL (`linear.app/omni-agent/...`), or Linear issue ID UUID |
| p4 | `has_state_progression` | State field changes across snapshots (e.g. PR open→merged, issue Backlog→Done, Linear In Progress→Done) |
| p5 | `has_author` | `author.login` field present (GitHub) OR `createdBy` (Linear) |
| p6 | `has_cross_corpus_link` | At least two of {git, linear} joined via p2/p3 |
| p7 | `has_evidence` | ≥ 3-digit number (commit count, PR count, run ID) OR `verified`/`PASS`/`measured` |
| p8 | `has_temporal_anchor` | `createdAt`/`updatedAt`/`mergedAt` present and ISO-8601 parseable |

**Initial validation:** 5% sample on PRs #159-#195 (the recent RSI PR window) and the 50 most-recent Linear issues — manual spot-check on 10 items to confirm primitive coverage matches observed structure. The exact detection regexes ship in the skill's `## Detection` section, and the curve-fit feeds back corrections.

---

## 9. Risks and open questions

1. **The `OMN-\d+` regex misses non-OMN identifiers** — some Linear items use UUID-only references or per-project keys. The skill needs a graceful fallback to `linear.app/.../issue/<id>` URL parsing. Documented in `## Detection`.
2. **The merge_commit_sha join is asymmetric** — a PR can have multiple commits, a commit can be referenced by multiple PRs. The skill joins via the `merge_commit_sha` field specifically (not all commits), which is the precise semantic.
3. **The curve fit on a 100k+ commit corpus is expensive** — the 1,387-commit yubiOS corpus fits in seconds on a workstation, but a million-commit corpus needs sampling. Document in `## Scale` with a `--sample N` flag.
4. **Linear API rate limits** — 1500 req/hour authenticated. A full refresh on 47 production-gates issues is well under, but a 6-project × 200-issue sweep is ~12 calls. Document the rate-limit guard.
5. **The cache invalidation between runs** — if the cache file at `session/repo-history-archive-<repo>-YYYY-MM-DD.json` exists and `last_run_timestamp` is recent, the refresh only fetches deltas. If the cache is older than 7 days, the skill warns and re-fetches everything.
6. **The PR's `body_excerpt` truncation at 200 chars** — full body needed for the join regex. The skill must fetch `GET /pulls/{n}` (full body) not the list endpoint (truncated). Verified: the prior session's PR-pull did this correctly via `GET /pulls/{n}/files` (PROJECT_RULES.md line 148).
7. **The skill is dual-repo by design** — the same archive structure works for both repos, but the join semantics differ (yubiOS has PRs→Linear, agent-skills has fewer PRs but more skill-only commits). The skill must handle the empty-join case gracefully (sparse-cell on `has_cross_corpus_link`).

---

## 10. The RSI cycle plan for the skill itself

The skill is the artifact; the skill is also its own audit substrate.

- **Cycle 1** — gap-map via negative-skill-space 12-axis sweep on `repo-history-skill v0.1 SKILL.md`. Expect 10-15 substantive gaps (L×S ≥ 6).
- **Cycle 2** — close the top-1 gap with a hypothesis-driven edit. Re-map. Expect 3-5 new gaps.
- **Cycle 3** — close the cycle-2 top-1. Re-map. Apply fixpoint rule. Expect either fixpoint or carryover to cycle 4 (user override).
- **Cycle 4** (if needed) — user-override protocol per `recursive-self-improvement` cycle-4 precedent.
- **Empirical validation** — on each cycle, re-fit the corpus (run the skill against the live repos via the GitHub + Linear API), record `(PC1+PC2, R², sparse_count)` before/after, declare fixpoint when sparse_count has plateaued and the cycle-3 fixpoint rule passes.

The closed-loop metric is: the SKILL.md describes a curve that, when run on the live repos, produces an archive whose own fit metrics improve across cycles (Δ_PC1+PC2 > 0 AND Δ_sparse ≤ 0 OR sparse_migrates_to_lower_frequency).

---

## 11. Push plan

Per PROJECT_RULES.md "Skill exports to yubi-OS/agent-skills (2026-07-23)" + USER_PREFERENCES.md "Spec-to-PR shipping preference (added 2026-08-04)" + the standard dual-push pattern:

1. Write the skill locally at `skills/github-yubios-KS9n5GAT/repo-history-skill/SKILL.md` (the canonical home — same dirName as the other curve-rsi family skills).
2. Push to **both** `yubi-OS/agent-skills` AND `yubi-OS/yubiOS` via Contents API PUT in a single bash call (per /tmp wipe rule from PROJECT_RULES.md).
3. Push a `refs/repo-history-skill-2026-08-07.md` concept doc to `yubi-OS/yubiOS refs/` (the canonical home for `refs/` per PROJECT_RULES.md).
4. File a Linear OMN-X issue titled "repo-history-skill: hypersphere RSI on git + Linear history" in Backlog Medium on the `yubiOS Production Proof & Release Gates` project.
5. Append a SELF-CHANGELOG entry recording the cycle (Cycle 1 — repo-history-skill draft shipped).
6. Update `skill_registry.json` (auto on save per the discovery system).

---

## 12. Open carryover for v0.2

- The 9-D primitive basis is initial; the curve-fit on the first archive run will reveal which primitives are near-constant (drop) and which are load-bearing (keep). The basis may need a per-corpus derivation (analogue to `curve-guided-rsi-self`'s per-corpus bases).
- The `## Detection` regex patterns need empirical validation against the live repos — the initial regexes are derived from prior-art, not from a corpus pass.
- The `--since` / `--from` / `--linear-since` flag semantics need real-world validation against a 1-week deltas test (after the skill ships, the next cycle runs against the deltas from the previous cycle).
- The 3-cycle cap may need override per the parent precedent — for the corpus-scale re-fit (cycle 4 = re-fit on 1k+ items), 3 cycles may be insufficient to reach fixpoint. The override protocol from `recursive-self-improvement` carries forward.

---

**End of deep research.** This file is the v0.1 evidence substrate. The skill draft at `skills/github-yubios-KS9n5GAT/repo-history-skill/SKILL.md` references this document by filename and cites the live API numbers. RSI Cycle 1 evidence goes in `session/repo-history-skill-cycle-1-2026-08-07.json`; the gap-map at `session/repo-history-skill-gap-map-v1-2026-08-07.md`.
