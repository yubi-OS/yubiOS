---
name: refs-refresh-sweep
description: "Full-corpus deep-research refresh sweep for a repo's documentation corpus (built for yubi-OS/yubiOS refs/): enumerate every doc, compute staleness signals, triage with the jev-1.13 decision model via the steady-orbit /api/decide endpoint, dig with self-hosted searXNG (via the n8n searxng-proxy webhook), weight every collected result's source quality with jev as it lands, persist a typed research DB in-repo on a PR, then fan out one parallel subagent per top-ranked doc (each opens its own PR) and merge them. Triggers on 'refresh the refs', 'deep-research refresh', 'refs sweep', 'refresh sweep', 'jev triage', 'searxng dig sweep', 'refresh every ref doc', 'stale docs sweep'. Pairs with repo-refs-skill (the archival layer it refreshes) and defapi-jev (the decision model)."
metadata:
  short-description: "jev-weighted corpus refresh sweep with subagent fan-out"
---

# Refs Refresh Sweep

A validated, end-to-end process for refreshing a large documentation corpus
(yubi-OS/yubiOS `refs/`, 234+ docs) against current upstream reality. Every
phase was run live on 2026-09-29: 234 docs jev-triaged, 14 docs dug via
searXNG, 144 results jev-weighted, 15 PRs opened and merged. This skill is
the process as it actually executed, including every operational trap.

## When to Use

- A docs corpus with date-stamped files has aged (median age > 30 days) and
  upstream topics are fast-moving (releases, versions, hardware, CI).
- The user asks to "go over every ref and find what needs a refresh" or
  similar full-corpus sweep language.
- A periodic cadence fires (quarterly is a sane default; the 2026-09-29 run
  found 14 of 234 docs materially stale after ~9 weeks).
- You need an auditable, persisted research artifact, not ad-hoc lookups.

## When NOT to Use

- Single-doc refresh: read the doc, verify against primary sources directly.
- Corpus structure audit (which topics are MISSING): use `repo-refs-skill`
  (sparse-cell detection), not this skill. This skill refreshes docs that
  exist; that one finds docs that don't.
- Git/Linear event history: `repo-history-skill`.
- Anything where the dig sources require credentials searXNG can't reach
  (paywalled vendor portals): the searXNG layer is anonymous HTTP only.

## Prerequisites (the three endpoints)

1. **Decision model.** `POST https://steady-orbit.systems-a.workers.dev/api/decide`
   with `{"state": {...}, "questions": {...}}`. Model `typesafe/jev-1.13`
   pinned server-side; no key needed from the caller (Cloudflare Secrets
   Store holds it). Hard cap **15 requests/min/IP**. Cost ~$0.00003-0.0004
   per request depending on state size.
2. **Search.** `GET https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?q=<urlencoded>&format=json`
   (n8n workflow `searxng-proxy` proxying to the internal Northflank
   searxng:8080 over cluster DNS). Returns standard searXNG JSON with
   `results[]` (title, url, engines, content). searXNG's own port is
   `public:false` and must stay that way (network rule).
3. **Repo writes.** `conn_3h7rj41VF6hs` (MASTER GIT SU). Every GitHub API
   call needs a `User-Agent` header AND the connection passed in the tool's
   `connections` parameter plus `X-Sauna-Connection-Id` header.

## The Pipeline (7 phases)

### Phase 0: Endpoint preflight (REQUIRED gate)

Both backing endpoints MUST be verified healthy before any later phase runs. If either fails, STOP and surface to the user; do not silently degrade into a weakened run (2026-09-29 lesson: the first yubios corpus mint ran while searXNG engines were suspended for 5 of 6 docs, shipped research-db entries with zero dig results, and had to be re-minted).

1. **searXNG.** `GET https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?endpoint=search&qs=q%3Dsystemd` (User-Agent required) must return HTTP 200 with >= 1 result and no `Suspended:` entries in `unresponsive_engines`. Known blind spot: engines whose errors land after the response closes are NOT reported (searxng bug `add_unresponsive_engine after close`); if results == 0 with a suspiciously short unresponsive list, grep the Northflank service logs for `ERROR:searx.engines` before concluding anything about health.
2. **jev.** `POST https://steady-orbit.systems-a.workers.dev/api/decide` with a one-question noul smoke probe (User-Agent required) must return HTTP 200 with an `answers` object.

Record both probe results (timestamp, result counts, cost) in the run's research DB under a `preflight` key.

### Phase 1: Enumerate + signals

- List the corpus dir via Contents API (note: `per_page` is IGNORED for
  directory listings; one call returns everything).
- Fetch every file body via `raw.githubusercontent.com` (no API budget),
  concurrency ~8, with retry.
- Per file compute: age in days (from filename date), size, title (first
  `# ` line), presence of Verification / Recommendation sections. Persist
  to `session/<run-slug>/refs-signals.json` INCREMENTALLY (container
  restarts kill unflushed work).

### Phase 2: jev triage

- State per doc: file, topic (filename first dash-segment), age_days,
  size, title, section flags.
- Batch **5 docs per request** with one `noul` question each
  (`needs_refresh_0..4`). This keeps a 234-doc corpus at 47 requests:
  ~4 min paced at 4.3s spacing, ~$0.005.
- Question shape: noul "does doc #k need a deep-research refresh because
  upstream reality has materially changed since it was written", with
  true = "tracks fast-moving upstream" / false = "process/policy/history
  content that stays valid".
- Persist scores to `jev-scores.json` after EVERY batch (task_id + cost
  + timestamp per doc). Log BEFORE/AFTER per batch for kill-resilience.

### Phase 3: Rank + dig

- Rank: `0.7 * jev_noul + 0.3 * min(age_days/80, 1)`. The blend matters:
  in the validation run jev scored max 0.79 with median 0.40 (it reads
  most docs as durable history), so age is the binding signal and jev
  ranks within it. Record this honestly in the run's plan doc.
- Take top-N (12-14 is a sane bound). 2 queries per doc derived from its
  topic; allow each digger one discretionary query. Keep top 6 results
  per query.

### Phase 4: jev collection-quality weighting

- Weight EVERY result as it lands: noul "high-quality authoritative
  source worth citing", true = primary source (upstream project, official
  docs, release notes, kernel/git, standards body) / false = aggregator,
  forum, marketing, dead link, off-topic.
- Batch 5 results per request. This is where jev visibly earns its seat:
  in the validation run weights separated upstream releases (0.90-0.96)
  from aggregators (0.01-0.16) cleanly.

### Phase 5: Persist the research DB

Lands in-repo (for yubiOS: `papers/data/<run-slug>/` on a PR branch) as:

- `archive.json`: every corpus row + jev verdict + task_id + cost + ts.
- `digs/<doc>.json`: per-doc queries, results, each with its quality weight.
- `db.ts`: typed index (interfaces + run constants) over the JSON.
- Plan doc at `refs/<run-slug>.md`: process, stats, ranked queue, per-doc
  dig summaries, honest findings.

### Phase 6: Fan-out refresh (parallel subagents)

- One `task` subagent per top-ranked doc, `type: general`,
  `model_preset: smart`, ALL dispatched in one turn for parallelism.
- Each subagent prompt must be fully self-contained (they cannot see this
  session): the doc path, its 2 dig queries, the endpoint URLs, the
  rate-limit sharing warning, the Git Data API chain, the branch/PR spec,
  and the report format. See the template below.
- Each subagent: fetch doc -> dig -> jev-weight (1-2 batched calls, 30s
  backoff on 429, max 3 retries) -> append-only `## Refresh: <date>`
  section (finding lines with source URL + jev weight, plus a full
  "Sources considered" table) -> in-place fact update ONLY with direct
  citable evidence -> one-file PR (draft) on branch
  `refresh/<topic-slug>-<date>` (or `refresh-<topic-slug>-<date>`;
  branch names must NOT start with `refs/`).
- An honest "no material change found" verdict is a SUCCESS, not a
  failure. Four of fourteen validation PRs were no-change verdicts and
  each is worth exactly as much as a change PR.
- When searXNG engines are suspended (shared fan-out exhausts engine
  quotas), the subagent's fallback is DIRECT primary-source verification
  (GitHub releases API, kernel.org, upstream NEWS files). Require that
  fallback in the prompt; never let a zero-result dig become an invented
  summary.

### Merge orchestration

- Merge each PR via `POST /repos/{repo}/merges` (base main, head branch),
  NOT the PR merge endpoint: PATCH `draft:false` silently no-ops on this
  PAT (returns 200, draft stays true, subsequent merge 405s). The merges
  endpoint lands the merge and GitHub flips the PR to `merged` itself.
- Merge sequentially (1s apart); disjoint one-file PRs never conflict.
- Verify all PRs report `merged=true` and main moved to the last merge SHA.

## Subagent prompt template (fill the braces)

```
You are one of N parallel agents refreshing stale docs in refs/ of yubi-OS/yubiOS.
Your doc: refs/<FILE>. Steps:
1. Fetch current doc: GET https://raw.githubusercontent.com/yubi-OS/yubiOS/main/refs/<FILE>
   (send User-Agent; python urllib without one gets Cloudflare error 1010).
2. searXNG dig: GET https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?q=<urlencoded>
   (User-Agent: omni-agent/1.0). Queries: <Q1>, <Q2>, plus one of your own if needed.
   Keep top 6 results per query.
3. jev weighting: POST https://steady-orbit.systems-a.workers.dev/api/decide,
   batch ALL results into 1 request (max 2). User-Agent required. Rate limit
   15/min/IP SHARED across all N agents: on 429/5xx sleep 30s, max 3 retries.
   Log task_id + cost.
4. Edit: append-only "## Refresh: <DATE>" section; in-place fact updates only
   with direct citable evidence; never delete existing analysis; include a
   Sources considered table with jev weights; if nothing material, write an
   honest no-change verdict. NEVER invent facts, versions, dates.
5. Push: ENTIRE Git Data API chain in ONE bash call (sandbox /tmp wipes between
   calls): ref/heads/main -> commits (tree) -> blobs -> trees (base_tree) ->
   commits -> git/refs branch <BRANCH> -> POST pulls (draft true).
   GitHub calls: connections [{id: conn_3h7rj41VF6hs, name: MASTER GIT SU}] +
   header X-Sauna-Connection-Id: conn_3h7rj41VF6hs + User-Agent: omni-agent.
   Only touch refs/<FILE>. No other files, no workflows, no Linear.
6. If searXNG returns 0 results (engines suspended), verify directly against
   primary sources (GitHub releases API, upstream docs) and say so in the PR.
FINAL REPORT: PR number+URL, branch, files changed, 2-4 sentence dig summary,
jev call count + cost, failures.
```

## Anti-patterns

- **Sending requests without a User-Agent.** Cloudflare error 1010 on both
  endpoints. Every HTTP call carries a UA string.
- **Unbatched jev calls.** One request per doc burns the 15/min/IP cap and
  10x the money. Batch N questions per request.
- **Trusting jev noul as the sole gate.** In validation, max noul was 0.79
  with zero docs over 0.8. Blend with age; record the agreement analysis.
- **Rewriting docs instead of appending.** The corpus is an audit trail:
  append a dated Refresh section, update in place only with direct
  evidence, never delete.
- **Letting a zero-result dig produce conclusions.** Engine suspension is
  common under parallel fan-out; fall back to primary sources or record
  an honest no-change verdict.
- **Non-incremental persistence.** Container restarts killed one full dig
  batch before it was saved. Write after every batch/doc.
- **One giant refresh PR.** Unreviewable. One doc per PR.
- **Forgetting the /tmp wipe rule.** The whole Git Data API chain (and any
  multi-step file flow) goes in ONE bash call.

## Red Flags

- jev 429s persisting after 3 backoffs: slow the whole fan-out (raise
  inter-request sleep), don't hammer.
- searXNG engines reporting "too many requests"/suspended on every query:
  switch the affected agents to direct primary-source verification.
- Subagent returns < 200 chars or no PR number: re-dispatch immediately
  with the failure mode explicitly forbidden (known subagent failure
  pattern).
- Two agents picking the same doc: dedupe the brief list before dispatch.
- A refresh PR claims upstream changes with no source URL: reject it.

## Verification

- [ ] Phase 0 preflight passed (both endpoints healthy, probe results recorded in the DB) before any dig ran.
- [ ] Every corpus row has jev verdict + task_id + cost in the DB.
- [ ] Every collected result has a jev quality weight.
- [ ] Plan doc states the jev-vs-age agreement analysis honestly.
- [ ] Every refresh PR touches exactly one file and is append-mostly.
- [ ] Every finding line in refresh sections carries a source URL + weight.
- [ ] All PRs verified merged=true; main HEAD = last merge SHA.
- [ ] No network state changed (searxng port stays internal-only).
- [ ] Total jev spend logged (validation run: <$0.02 for 112 calls).

## Interaction with Other Skills

- `repo-refs-skill` - upstream. The corpus it archives is the corpus this
  refreshes; this skill's triage output is Mode C's intake selector.
- `defapi-jev` - the decision-model layer (question shapes, batching,
  thresholds). Read it before writing jev questions.
- `parallel-deep-research` - the fan-out protocol this skill specializes
  for refresh work (one PR per doc instead of one synthesized doc).
- `github-api` - the Git Data API chain and REST patterns.
- `github-actions` - irrelevant here; refresh PRs don't dispatch CI.
- `doubt-driven-development` - apply per refresh finding before an
  in-place edit lands.

## Examples

**Worked setup** (the validating run, 2026-09-29, start to finish):

- Phase 1: 234 refs listed in one call, bodies fetched concurrently,
  signals: median age 54d, 136 docs at 45d+.
- Phase 2: 47 batched jev requests, ~$0.003, scores persisted per batch.
- Phase 3: top-14 ranked; systemd v262-audit (jev 0.79/77d) first.
- Phase 4: 144 results weighted, 31 requests, ~$0.006; per-doc avg quality
  0.23-0.70 (osbuild dig best, endlessh worst: all aggregators).
- Phase 5: PR #260 = plan doc + papers/data/refs-refresh-2026-09-29/
  (archive.json + 14 digs/*.json + db.ts), merged via POST /merges after
  PATCH draft:false no-opped twice.
- Phase 6: 14 subagents, 14 draft PRs (#261-#274), 10 material-change
  verdicts + 4 honest no-change verdicts; all merged sequentially.
- Notable refresh findings: systemd v262 shipped 2026-09-22; bootc
  1.16.13 + bcvk 0.19.0; Cloudflare PQ ~70% client / ~15% origin;
  osbuild image-builder-cli archived 2026-09-01.

**Single-question batch shape** (jev triage request):

```json
{
  "state": {"run_date": "2026-09-29", "docs": [
    {"file": "a.md", "topic": "a", "age_days": 77, "size_bytes": 4393,
     "title": "...", "has_verification_section": true}
  ]},
  "questions": {"needs_refresh_0": {"type": "noul",
    "instructions": "Does refs doc #0 (a.md, dated 77 days ago) need a deep-research refresh because upstream reality has materially changed since it was written?",
    "criteria": {"true": "Topic tracks fast-moving upstream or facts likely stale",
                 "false": "Process/policy/history content that stays valid"}}}
}
```

## Guidelines

1. Never skip the incremental-persistence rule; restarts are routine.
2. Every endpoint call carries a User-Agent header, no exceptions.
3. jev batching: 5 questions per request, 4.3s spacing, backoff on 429.
4. The dig scope is bounded (top-N by blended rank), never all docs.
5. Append-only edits on the corpus; in-place only with direct evidence.
6. Honest no-change verdicts are deliverables; invention is grounds for
   PR rejection.
7. Merge via POST /merges; PATCH draft:false is a known no-op on this PAT.
8. Subagents get fully self-contained prompts; they see nothing from the
   orchestrating session.
9. Report once at the end with the full PR table, per her check-in
   preference.
10. Run validation or tests when available; verify every transfer.

## Changelog

- 2026-09-29 v1: shipped from the validating run (PR #260 + #261-#274,
  all merged). Every section reflects something that actually happened
  in that run, including the failure modes (1010 UA block, engine
  suspension, draft-PATCH no-op, container restart mid-dig).
