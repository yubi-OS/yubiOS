# Refs Refresh Sweep skill: conceptualization and validating run

Date: 2026-09-29
Source: ideate-solo one-pager (`session/refs-refresh-jev-weighted-solo-2026-09-29.md` in the originating Sauna session) + live validated execution same day
Scope: new skill `refs-refresh-sweep` at `skills/refs-refresh-sweep/SKILL.md`

## 0. TL;DR

A full-corpus refresh sweep for date-stamped docs corpora: enumerate, signal, jev-triage, dig with searXNG, jev-weight collection quality, persist a typed research DB, fan out one subagent per top-ranked doc with one PR each, merge via the merges endpoint. Validated end-to-end on 2026-09-29 against `refs/` (234 docs): 1 triage PR + 14 refresh PRs, all merged, total jev spend under $0.02.

## 1. Problem Statement

The `refs/` corpus is the project's durable knowledge, but nothing told us which docs had gone stale against upstream reality. Age alone says nothing about whether a doc's topic moves; topic-only triage says nothing about age. And the actual refresh work (dig, verify, edit, PR) was undocumented, so every pass reinvented it.

## 2. Decision: why jev at two distinct seats

DefAPI's typesafe/jev-1.13 (via the steady-orbit worker `/api/decide`) is a decision model, so it belongs at decision points:

1. **Triage seat** (noul "needs a refresh because upstream reality moved"): ranks the corpus. Honest finding from the validating run: max noul 0.79, median 0.40, zero docs over 0.8. The model reads most of the corpus as durable process/history content, which is largely correct. So age is the binding signal and jev ranks within it (blend: 0.7*jev + 0.3*age_norm).
2. **Collection-quality seat** (noul "high-quality authoritative source worth citing"): weights every search result as it lands. Here jev visibly separates upstream primaries (0.90-0.96) from aggregators (0.01-0.16). This is its highest-value seat and the one Jenny named.

## 3. The validated run (evidence)

| Phase | Result |
|---|---|
| Enumerate + signals | 234 refs in one Contents call; bodies via raw.githubusercontent (8-way); median age 54d, 136 docs at 45d+ |
| jev triage | 47 requests (5 docs/request, 4.3s spacing), ~$0.003 |
| Rank + dig | Top 14; 24 searXNG queries via the n8n `searxng-proxy` webhook; 144 results |
| jev weighting | 31 requests, ~$0.006; per-doc avg quality 0.23-0.70 |
| Research DB | PR #260: `refs/refs-refresh-jev-weighted-2026-09-29.md` + `papers/data/refs-refresh-2026-09-29/` (archive.json, 14 digs/*.json, db.ts) |
| Fan-out | 14 subagents (general/smart), draft PRs #261-#274; 10 material-change + 4 honest no-change verdicts |
| Merge | All 15 merged via `POST /repos/{repo}/merges` |

Notable refresh findings that came out of it: systemd v262 shipped 2026-09-22 (and both removals predicted in the v262-audit doc slipped to v263); bootc 1.16.13 + bcvk 0.19.0; Cloudflare PQ adoption ~70% client / ~15% origin and the PQ TLS draft became RFC 10024; osbuild image-builder-cli archived 2026-09-01.

## 4. Operational lessons baked into the skill

- Cloudflare error 1010 on header-less python clients for BOTH endpoints; always send a User-Agent.
- 15/min/IP jev cap is shared across all parallel subagents; batch 5 questions/request and back off 30s on 429.
- searXNG engines suspend under parallel fan-out; the fallback is direct primary-source verification (GitHub releases API, upstream NEWS), never invention.
- Sandbox /tmp wipes between bash calls; the entire Git Data API chain runs in ONE call.
- Subagent write boundary: artifacts land under `session/subagent/`, not the parent's session paths.
- PATCH `draft:false` silently no-ops on this PAT; merge drafts via `POST /merges`.
- Branch names must not start with `refs/`.
- Persist after every batch: a container restart killed one full dig run before it was saved.

## 5. Verification

- Skill: `skills/refs-refresh-sweep/SKILL.md` (this repo), spec 2.2 format.
- Validating artifacts: `papers/data/refs-refresh-2026-09-29/` + PR #260 + PRs #261-#274 (all merged as of main `ee82f4fc33aba4edfa59c3710131e1d21307a381`).
- Re-run cadence suggestion: quarterly, or after any upstream-storm week.
