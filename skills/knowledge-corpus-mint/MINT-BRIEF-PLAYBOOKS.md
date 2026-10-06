# Knowledge Corpus Mint Brief — PLAYBOOKS VARIANT (one corpus per yubiOS playbooks/ file)

You are minting ONE knowledge corpus into the yubi-OS org repo **yubi-OS/knowledge** (public). Your corpus directory: `playbooks/<NAME>/` — a NEW top-level `playbooks/` in yubi-OS/knowledge, one corpus per ground-source file in yubi-OS/yubiOS `playbooks/`. Branch: `mint/playbooks-<NAME>-2026-10-06`. You open ONE draft PR. You are one of 5 parallel agents: touch ONLY your own branch, never main, never another corpus dir.

## SPEED OPTIMIZATIONS (2026-10-06, from the 147-mint run analysis — apply all)
Measured per mint: jev phase 4.7 min avg (26 requests, ~2 rate-limit sleeps), authoring+push+verify 7.3 min avg. Apply these:

1. **Weighting via DefAPI direct, not the worker relay.** POST https://api.defapi.org/api/v1/decisions with Bearer auth — pass `connections: [{"id":"conn_fc17EDPHeLCR","name":"DefAPI"}]` in the bash tool call (the proxy injects the key). Body: `{"model":"typesafe/jev-1.13","state":"<name>","questions":{...}}` (same question schema). Measured: ~100 req/min, ZERO 429s, 0.62s mean per call. Batch 10-15 questions per request. Pace >= 0.5s between requests. Keep the worker relay (https://steady-orbit.systems-a.workers.dev/api/decide) as FALLBACK if DefAPI 403s/429s — then drop to batches of 5 with >= 1s pacing and 30s backoff. Log the actual endpoint used per request in jev-log.json.
2. **Post-push verification via the Git blobs API, NEVER raw.githubusercontent.** CDN lag produced stale 404s and even mismatched content during the run. Verify each pushed .json by `GET /repos/yubi-OS/knowledge/git/blobs/<sha>` (the sha from your own tree response is authoritative) + base64-decode + parse. The PR files list check stays.
3. **No per-mint preflight.** The orchestrator ran the campaign preflight (searXNG healthy, decide healthy) — your preflight.json records: `{"date":"2026-10-06","searxng":{"url":"https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng","probe_results":"campaign preflight healthy (orchestrator)"},"decide":{"url":"https://api.defapi.org/api/v1/decides","model":"typesafe/jev-1.13","note":"campaign preflight run orchestrator-side; agent-side probe skipped for speed"}}`. Do NOT spend a request probing.
4. **Digs only where the ground source names external mechanisms.** Internal-record subtopics (decisions, blockers, ledger state, CI group assignments) skip searXNG entirely — cite the source doc and say "internal-record subtopic, no dig". Web-shaped subtopics get 2 queries each.

This variant follows session/refs-mint/MINT-BRIEF.md (or the in-repo copy at yubi-OS/yubiOS skills/knowledge-corpus-mint/MINT-BRIEF.md) for the shared flow: outline decomposition by the domain's joints, jev score-validation (drop 0), searXNG digs, jev noul weighting (decide-failure = REDO, never ship unweighted), authoring rules (600-1200 words, every claim carries source URL + jev weight, weak < 0.5 labeled, no em dashes, numbers as digits), research-db schema v2 (preflight, outline, archive, digs, jev-log, db.ts), README index, push mechanics, post-push verification, PR body format, and final report format. Read it IN FULL first. The deltas below override it:

## DELTA 1 - Landing path
Your corpus lands at `playbooks/<NAME>/` in yubi-OS/knowledge (NOT `knowledge/<REF>/` and NOT `docs/<NAME>/`). Collision check: `GET /repos/yubi-OS/knowledge/contents/playbooks/<NAME>?ref=main` must 404.

## DELTA 2 - Ground source is the yubiOS playbooks/ file
Your ground source is ONE file from yubi-OS/yubiOS `playbooks/`, fetched directly:
`https://raw.githubusercontent.com/yubi-OS/yubiOS/main/playbooks/<FILE>` (User-Agent: omni-agent/1.0 required).
That file is the PRIMARY SOURCE OF RECORD — the corpus explicates and deepens it, it does not replace it:
- The doc's own structure dictates the outline: decompose by the document's own sections/joints (6-10 subtopics).
- Every corpus doc cites the source-doc path (`yubi-OS/yubiOS docs/<FILE>`) for its grounding spine, plus searXNG digs for the external mechanisms, tools, and standards the doc references (2 queries per subtopic where web-research-shaped; skip digs for purely internal-record subtopics and say so).
- Claims from the source doc are attributed to it explicitly ("source doc"); claims from digs carry their URL + jev weight as usual. Do not contradict the source doc; where the dig world has moved past it, note the drift as a dated correction with the dig source.
- REDO RULE applies to digs as in the parent brief. NEVER fabricate what the source doc does not say.

## DELTA 3 - Naming
- Corpus dir: `docs/<NAME>/` where NAME is the lowercase-hyphenated form of the docs filename (ADR -> adr, THREAT_MODEL -> threat-model, CI_MAP -> ci-map).
- Branch: `mint/playbooks-<NAME>-2026-10-06`.
- PR title: `mint: docs/<NAME> knowledge corpus (yubiOS docs/<FILE> ground source)`.

## Guardrails (same as parent brief)
- Public repo: docs/ files are public artifacts; ground only in them and in dig results. Never invent.
- Plain UTF-8, never base64-pushed. Post-push verification REQUIRED (PR files list + re-fetch each research-db .json + weights non-null).
- jev budget ~40 requests. Never modify files outside `docs/<NAME>/`.

## Final report format (same as parent brief, plus the ground-source line)
```
PR: #<n> <url>
branch: mint/playbooks-<NAME>-2026-10-06
ground source: yubi-OS/yubiOS docs/<FILE> (<bytes> B fetched)
files: <n> (README, <k> docs, research-db x<m>)
docs kept/skipped: k / s
results weighted: <total> (high <h> / low <l>)
jev requests: <n> (+ usage tokens)
redos: <n>
gaps: <list or none>
VERIFIED: files <n>, research-db <m> parse, weights <k>/<k>
```
