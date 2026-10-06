# Knowledge Corpus Mint Brief — DOCS VARIANT (one corpus per yubiOS docs/ file)

You are minting ONE knowledge corpus into the yubi-OS org repo **yubi-OS/knowledge** (public). Your corpus directory: `docs/<NAME>/` — a NEW top-level `docs/` in yubi-OS/knowledge, one corpus per ground-source file in yubi-OS/yubiOS `docs/`. Branch: `mint/docs-<NAME>-2026-10-06`. You open ONE draft PR. You are one of 5 parallel agents: touch ONLY your own branch, never main, never another corpus dir.

This variant follows session/refs-mint/MINT-BRIEF.md (or the in-repo copy at yubi-OS/yubiOS skills/knowledge-corpus-mint/MINT-BRIEF.md) for the shared flow: outline decomposition by the domain's joints, jev score-validation (drop 0), searXNG digs, jev noul weighting (batched 5/request, pace >= 1s, decide-failure = REDO, never ship unweighted), authoring rules (600-1200 words, every claim carries source URL + jev weight, weak < 0.5 labeled, no em dashes, numbers as digits), research-db schema v2 (preflight, outline, archive, digs, jev-log, db.ts), README index, push mechanics, post-push verification, PR body format, and final report format. Read it IN FULL first. The deltas below override it:

## DELTA 1 - Landing path
Your corpus lands at `docs/<NAME>/` in yubi-OS/knowledge (NOT `knowledge/<REF>/`). Collision check: `GET /repos/yubi-OS/knowledge/contents/docs/<NAME>?ref=main` must 404.

## DELTA 2 - Ground source is the yubiOS docs/ file
Your ground source is ONE file from yubi-OS/yubiOS `docs/`, fetched directly:
`https://raw.githubusercontent.com/yubi-OS/yubiOS/main/docs/<FILE>` (User-Agent: omni-agent/1.0 required).
That file is the PRIMARY SOURCE OF RECORD — the corpus explicates and deepens it, it does not replace it:
- The doc's own structure dictates the outline: decompose by the document's own sections/joints (6-10 subtopics).
- Every corpus doc cites the source-doc path (`yubi-OS/yubiOS docs/<FILE>`) for its grounding spine, plus searXNG digs for the external mechanisms, tools, and standards the doc references (2 queries per subtopic where web-research-shaped; skip digs for purely internal-record subtopics and say so).
- Claims from the source doc are attributed to it explicitly ("source doc"); claims from digs carry their URL + jev weight as usual. Do not contradict the source doc; where the dig world has moved past it, note the drift as a dated correction with the dig source.
- REDO RULE applies to digs as in the parent brief. NEVER fabricate what the source doc does not say.

## DELTA 3 - Naming
- Corpus dir: `docs/<NAME>/` where NAME is the lowercase-hyphenated form of the docs filename (ADR -> adr, THREAT_MODEL -> threat-model, CI_MAP -> ci-map).
- Branch: `mint/docs-<NAME>-2026-10-06`.
- PR title: `mint: docs/<NAME> knowledge corpus (yubiOS docs/<FILE> ground source)`.

## Guardrails (same as parent brief)
- Public repo: docs/ files are public artifacts; ground only in them and in dig results. Never invent.
- Plain UTF-8, never base64-pushed. Post-push verification REQUIRED (PR files list + re-fetch each research-db .json + weights non-null).
- jev budget ~40 requests. Never modify files outside `docs/<NAME>/`.

## Final report format (same as parent brief, plus the ground-source line)
```
PR: #<n> <url>
branch: mint/docs-<NAME>-2026-10-06
ground source: yubi-OS/yubiOS docs/<FILE> (<bytes> B fetched)
files: <n> (README, <k> docs, research-db x<m>)
docs kept/skipped: k / s
results weighted: <total> (high <h> / low <l>)
jev requests: <n> (+ usage tokens)
redos: <n>
gaps: <list or none>
VERIFIED: files <n>, research-db <m> parse, weights <k>/<k>
```
