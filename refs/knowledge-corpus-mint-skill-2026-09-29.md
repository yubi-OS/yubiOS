# Knowledge-corpus-mint skill: conceptualization

Date: 2026-09-29
Source: variant directive on the validated refs-refresh-sweep run (same day)
Scope: new skill `knowledge-corpus-mint` at `skills/knowledge-corpus-mint/SKILL.md`

## 0. TL;DR

The mint variant of the refs refresh sweep: given an input request ("corpus on X"), decompose it into a jev-validated doc outline, dig every subtopic via searXNG (n8n proxy), jev-weight every collected result, fan out author subagents (one doc each, markdown returned to the orchestrator), and land the corpus at `yubi-OS/knowledge/<ref>/` (docs + README index + typed research DB) on a draft PR merged via `POST /merges`.

## 1. The variant delta vs refs-refresh-sweep

| Dimension | refs-refresh-sweep | knowledge-corpus-mint |
|---|---|---|
| Input | an existing date-stamped docs corpus | a free-form topic request |
| Output | refreshed existing docs, one PR each | a NEW corpus repo dir, one PR total |
| Triage seat | jev ranks which existing docs are stale | jev validates which proposed outline docs are load-bearing |
| Editing contract | append-only refresh sections | greenfield authoring, every claim cited + jev-weighted |
| Repo target | the corpus's own repo | `yubi-OS/knowledge/<ref>/` (bootstrap if absent) |
| Who commits | each subagent pushes its own branch | subagents return markdown; the orchestrator commits once |

Shared machinery (inherited verbatim): the three endpoints (steady-orbit `/api/decide`, n8n `searxng-proxy`, MASTER GIT SU), 15/min/IP batching discipline, User-Agent rule (CF 1010), /tmp single-call Git Data API chains, POST /merges for drafts (PATCH draft:false no-ops), honest no-change / cannot-author verdicts as deliverables.

## 2. Design decisions

- **One `knowledge` repo, per-request subdirs.** The user's shape `<org>/knowledge/<ref>/<files>` maps directly to repo `yubi-OS/knowledge` with a directory per request. GitHub repo names cannot contain `/`, so per-request repos would need `knowledge-<ref>` names; the single-repo layout matches the stated shape exactly and keeps the research DBs co-located.
- **Orchestrator-owned commits.** The refresh sweep had 14 agents each pushing their own disjoint branch, which works for refresh. For minting, agents return doc markdown in their final report and the orchestrator assembles one atomic tree: no branch races, one reviewable PR.
- **Outline jev validation is the cheap kill.** One choice/score request over the outline before any digging prunes padding subtopics. Cheapest place to stop a bloated corpus.
- **Cannot-author is a success signal.** Thin sources produce a documented gap stub, never padded prose.

## 3. Validation status

Phase mechanics (dig, weighting, batching, merge endpoint) are validated by the same-day refs-refresh-sweep run (PRs #260, #261-#274, all merged, <$0.02 jev). The mint-specific phases (outline decomposition, repo bootstrap with the empty-repo 409 seed, orchestrator-owned commit) are specified and await first live validation. First invocation should be a small corpus (4-7 docs) before any large mint.

## 4. Verification

- Skill: `skills/knowledge-corpus-mint/SKILL.md` (spec 2.2 format), local mirror + registry updated.
- Parent validation evidence: `papers/data/refs-refresh-2026-09-29/` + merged PRs #260, #261-#274 (main `ee82f4fc33aba4edfa59c3710131e1d21307a381` at validation close).
