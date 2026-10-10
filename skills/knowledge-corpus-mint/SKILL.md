---
name: knowledge-corpus-mint
description: "Mint a brand-new knowledge corpus from an input request: decompose the request into a doc outline (jev-validated), deep-research every doc via the searXNG dig (n8n searxng-proxy webhook) with clef quality weighting on every collected result, fan out one parallel subagent per doc to AUTHOR new markdown (cited, append-auditable), and land the whole corpus in the yubi-OS org under yubi-OS/knowledge/<ref>/<files> with a typed research DB alongside. Variant of refs-refresh-sweep: that skill refreshes docs that exist, this one creates docs that don't. Triggers on 'mint a knowledge repo', 'new knowledge corpus', 'create a corpus for X', 'knowledge repo from request', 'spin up a corpus'."
metadata:
  short-description: "Mint a new knowledge corpus repo from a request"
---

# Knowledge Corpus Mint

Take an input request ("I need a corpus on X"), turn it into a structured
doc outline, deep-research every doc, author the docs fresh, and land them
as a new corpus in the yubi-OS org at `yubi-OS/knowledge/<ref>/`. Every
collected data point carries a jev quality weight and every authored claim
carries a source URL. The whole run is auditable via a typed research DB
committed next to the docs.

Validated shape, not yet validated end-to-end: v1 ships from the
2026-09-29 refs-refresh-sweep run (234 docs triaged, 144 results weighted,
14 subagent PRs merged), reusing its proven phases and operational rules.

## When to Use

- The user hands you a topic/domain request and asks for a knowledge base,
  corpus, or doc set that does not exist yet ("make a corpus on RK3588
  secure boot", "build me a knowledge repo on n8n automation").
- A domain deserves its own durable, cited doc set rather than scattered
  session notes.
- You want the same jev-weighted, searXNG-backed rigor as
  `refs-refresh-sweep` but for greenfield authoring instead of refresh.

## When NOT to Use

- The docs already exist somewhere in the org: use `refs-refresh-sweep`
  (refresh) or `repo-refs-skill` (archive audit) instead.
- The corpus is a code corpus (skills/): `curve-guided-rsi` family.
- The request is one narrow question: `parallel-deep-research` alone.
- The topic needs paywalled/vendor-credentialed sources: the dig layer is
  anonymous HTTP only (searXNG); primary-source fallback covers upstream
  public artifacts but not vendor portals.

## Prerequisites (same three endpoints as refs-refresh-sweep)

1. **Decision model.** `POST https://steady-orbit.systems-a.workers.dev/api/decide`
   (clef, model pinned server-side, **15 requests/min/IP**, ~$0.00003
   per request). ALWAYS send a User-Agent header (Cloudflare error 1010
   otherwise).
2. **Search.** `GET https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?q=<urlencoded>&format=json`
   (n8n `searxng-proxy` -> internal Northflank searxng:8080). searxng's own
   port stays `public:false` (network rule; never flip it).
3. **Repo writes.** `conn_3h7rj41VF6hs` (MASTER GIT SU) on every GitHub
   call: pass the connection in the tool's `connections` parameter AND the
   `X-Sauna-Connection-Id: conn_3h7rj41VF6hs` + `User-Agent: omni-agent`
   headers.

## The Pipeline (8 phases)

### Phase 0: Endpoint preflight (REQUIRED gate)

Both backing endpoints MUST be verified healthy before any later phase runs. If either fails, STOP and surface to the user; do not silently degrade into a weakened mint (2026-09-29 lesson: the first yubios corpus mint ran while searXNG engines were suspended for 5 of 6 docs, shipped research-db entries with zero dig results, and had to be re-minted).

1. **searXNG.** `GET https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?endpoint=search&qs=q%3Dsystemd` (User-Agent required) must return HTTP 200 with >= 1 result and no `Suspended:` entries in `unresponsive_engines`. Known blind spot: engines whose errors land after the response closes are NOT reported (searxng bug `add_unresponsive_engine after close`); if results == 0 with a suspiciously short unresponsive list, grep the Northflank service logs for `ERROR:searx.engines` before concluding anything about health.
2. **jev.** `POST https://steady-orbit.systems-a.workers.dev/api/decide` with a one-question noul smoke probe (User-Agent required) must return HTTP 200 with an `answers` object.

Record both probe results (timestamp, result counts, cost) in the corpus's research DB under a `preflight` key.

### Phase 1: Parse the request into a ref + outline

- Derive `<ref>`: a lowercase-hyphenated topic slug (the corpus's directory
  name under `knowledge/`).
- Decompose the request into a doc outline: 6-14 subtopic docs, each with
  a one-line scope statement and 2 seed dig queries. Decompose by the
  domain's own joints (subsystems, lifecycle stages, comparison axes),
  not by round count.
- jev-validate the outline: ONE `score` request over the outline, criteria
  lowest-first `["padding: drop", "marginal: keep only if the dig comes back
  strong", "load-bearing: core subtopic"]`; drop score 0. Record the full
  answers (score, probabilities, legend, usage) in `outline.json`.

## Metric mapping (each clef decision uses the RIGHT metric)

| Decision | Metric | Shape |
|---|---|---|
| Outline: is each subtopic load-bearing? | `score` | 3 levels lowest-first (padding / marginal / load-bearing); drop 0 |
| Source quality weighting | `noul` | true = primary/official source; weight = the probability |
| Source-class either-or judgment (rare) | `choice` | criteria `{option: description}` |

Store EVERY decision's full record: type, instructions, criteria, the raw
answer object (probabilities/legend/confidence), model, usage tokens, timestamp.

### Phase 2: Dig + weight (per subtopic, may fan out)

- 2 searXNG queries per doc (the seeds from Phase 1), top 6 results each,
  User-Agent always.
- jev-weight EVERY result as it lands (noul "high-quality authoritative
  source worth citing", true = primary source / false = aggregator, forum,
  marketing, dead link, off-topic), batched 5 results per request.
- **/api/decide failure is a REDO, not a degrade**: on 429/5xx or any failed
  request, sleep 30s and re-send (up to 3 attempts; split into smaller
  batches on retry). NEVER ship results unweighted — a decision-model
  failure is treated exactly like a thin dig: the affected results get
  redone, and results that still cannot be scored mean the affected docs
  are SKIPPED and recorded as gaps.
- Pacing: >= 1s between jev requests and between searXNG queries (no
  published rate limit; courtesy pacing only). Append every request and its
  usage tokens to `jev-log.json`.

### Phase 3: Repo bootstrap (idempotent)

- `GET /repos/yubi-OS/knowledge`. 404 means create:
  `POST /orgs/yubi-OS/repos` `{"name": "knowledge", "private": false,
  "description": "jev-weighted knowledge corpora minted from requests"}`.
- A fresh repo is EMPTY and the Git Data API returns 409 on it: seed one
  Contents-API commit first (top-level `README.md` explaining the repo
  convention), THEN use the Git Data API for everything else.
- Structure per run (research-db schema v2, store ALL info):
  `knowledge/<ref>/README.md` (corpus index: doc list + one-line scope each
  + research summary), `knowledge/<ref>/<NN>-<slug>.md` (the docs, numbered
  in outline order), and `knowledge/<ref>/research-db/`:
  - `preflight.json` — searXNG + decide probe results (url, counts, model).
  - `outline.json` — topic, subtopics (nn/slug/scope/seed_queries), the
    score-metric validation answers in full, dropped/kept lists.
  - `archive.json` — JSON ARRAY of result entries, one per collected
    result: `{query, title, url, snippet, collected_at, weight: <float|null>,
    decision: {type, instructions, model, answer: <raw answer object>,
    usage: {input_tokens, output_tokens}, requested_at}, redo_of}`.
  - `digs/<NN>-<slug>.json` — `{nn, slug, scope, queries_attempted:
    [{query, attempt, raw_results, kept}], redo_count, redo_log, results_kept,
    outcome: authored|skipped, skip_reason?}`.
  - `jev-log.json` — one entry per jev HTTP request: timestamp, endpoint,
    state, model, n_questions, question_names, metric_types, usage.
  - `db.ts` — TypeScript interfaces matching ALL of the above.
  Plain UTF-8 JSON only; NEVER push base64-encoded text as file content.

### Phase 4: Author fan-out (parallel subagents)

- One `task` subagent per doc, `type: general`, `model_preset: smart`,
  ALL dispatched in one turn. Fully self-contained prompts (they see
  nothing from the orchestrating session): the doc's scope statement, its
  dig queries, endpoint URLs, rate-limit warning, the authoring contract,
  and the report format.
- Authoring contract per subagent:
  - Write a NEW doc (`<NN>-<slug>.md`) grounded ONLY in the jev-weighted
    dig results.
  - **REDO RULE (hard): if a subtopic's dig is too thin to author honestly,
    REDO the dig with DIFFERENT queries (up to 2 redos), logging each redo
    in the dig record. NEVER fall back to fetching primary sources directly
    to fill a thin dig.** If still thin after redos, SKIP the doc and
    record it as a gap in the README. Never pad.
  - Every factual claim carries its source URL and the jev weight that
    backed it. A claim with no source is deleted, not softened. Weight
    >= 0.5 = authoritative backing; < 0.5 = weak backing, label it as such.
  - A "cannot author" verdict after redos is a success signal, not a
    failure.
  - Writing style: sharp, specific, no em dashes, numbers as digits,
    headings for wayfinding.
- The orchestrator (not the subagents) assembles the repo tree: subagents
  return doc markdown in their final report; the orchestrator commits
  everything in one chain. This keeps the tree atomic and avoids 14
  agents racing one branch.

### Phase 5: Land the corpus

- ONE Git Data API chain in ONE bash call (sandbox /tmp wipes between
  calls): ref/heads/main -> commits (tree) -> blobs (**utf-8 encoding,
  NEVER base64**) -> trees (base_tree) -> commits -> `POST /git/refs`
  branch `mint/<ref>-<date>` (branch names must NOT start with `refs/`)
  -> `POST /pulls` (draft).
- **Post-push verification (REQUIRED before reporting success):**
  (1) `GET /pulls/<n>/files?per_page=100` — the research-db files MUST be
  in the PR diff (a mint whose research-db is missing from the PR is a
  FAILED mint; this bit a live run 2026-10-05, PR #12);
  (2) re-fetch each research-db .json from raw.githubusercontent and
  `json.loads` it — every file must parse and every archive entry must
  carry a non-null `weight` (a live run pushed base64-encoded JSON and
  shipped unweighted archives, PRs #16/#21);
  (3) report `VERIFIED: files <n>, research-db <m> parse, weights <k>/<k>`.
- PR body format (fixed order): Source doc; Outline table (NN/slug/score/
  verdict); Metrics (score outline / noul weighting via clef); Jev stats
  (requests, usage tokens, weights high/low); Per-doc sources; Redo log;
  Gaps/skips; Preflight line; Verification line.

### Phase 6: Merge

- `POST /repos/yubi-OS/knowledge/merges` (base main, head branch), NOT
  the PR merge endpoint: PATCH `draft:false` silently no-ops on this PAT
  (200, draft stays true, merge 405s). Verify `merged=true` on the PR
  after.

### Phase 7: Report

- One report at the end: repo + ref path, doc list with sizes, research
  DB stats (results collected, quality-weight distribution, jev calls +
  total cost), PR number, merge SHA.

## Subagent author prompt template (fill the braces)

```
You are one of N parallel agents authoring ONE new doc for a knowledge
corpus at yubi-OS/knowledge/<REF>. Your doc: <NN>-<SLUG>.md
Scope: <ONE-LINE SCOPE>.

1. searXNG dig: GET https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?q=<urlencoded>
   (User-Agent: omni-agent/1.0). Queries: <Q1>, <Q2>. Keep top 6 results
   per query.
2. jev weighting: POST https://steady-orbit.systems-a.workers.dev/api/decide,
   batch ALL results into 1 request (max 2). User-Agent required. Rate
   limit 15/min/IP SHARED: on 429/5xx sleep 30s, max 3 retries. Log
   task_id + cost. Question: noul "Is result #k a high-quality
   authoritative source worth citing?", true = primary source, false =
   aggregator/forum/marketing/dead link.
3. Verify load-bearing claims DIRECTLY against primary sources (GitHub
   API, upstream docs, release notes) when the dig is thin. NEVER invent
   facts, versions, dates, or APIs. If sources are too thin to write
   honestly, say so and stop.
4. Write the full doc markdown (~<SIZE> words): start with the scope
   statement, then findings grouped by sub-claim, each with source URL +
   jev weight, end with a Sources considered table (all results + weights).
   No em dashes. Numbers as digits.
5. FINAL REPORT: the complete doc markdown between markers
   ===DOC-START=== / ===DOC-END===, then: sources used count, claims
   carried by primary sources vs weighted-0.5+, jev call count + cost,
   failures.
```

## Anti-patterns

- **Padding thin docs.** A "cannot author" verdict is worth more than a
  confident mush of aggregator paraphrases. Enforce it.
- **Subagents pushing to the repo themselves.** N agents racing one branch
  is how trees get clobbered; agents return markdown, the orchestrator
  commits.
- **Unbatched jev calls / missing User-Agent.** Same rules as the parent
  skill: 5 questions per request, UA on every HTTP call.
- **Inventing the outline.** Decompose by the domain's own joints; if you
  cannot state each doc's scope in one line, the decomposition is wrong.
- **Skipping the empty-repo seed.** Git Data API 409s on a fresh repo;
  seed the README via Contents API first.
- **Naming the branch with a `refs/` prefix** (GitHub rejects it) or
  merging a draft via the PR endpoint (draft:false PATCH no-ops here).
- **Shipping unweighted results.** A failed decide call is a REDO (sleep
  30s, re-send, split batches), never a silent degrade to unweighted.
- **Pushing base64-encoded text as blob content.** Use `encoding: "utf-8"`
  with plain text; verify by re-fetching and `json.loads`-ing after push
  (2026-10-05: PR #21's whole research-db landed as base64).
- **Reporting success without the post-push verification.** The PR files
  list is the truth; a subagent's self-report once said "23 paths pushed"
  for a PR that contained 10 (2026-10-05, PR #12).
- **Trusting subagent-reported PR numbers.** A 5-agent wave (2026-10-05,
  "wave 27") returned confident VERIFIED reports citing PRs #137-#141 —
  which were the PREVIOUS wave's actual numbers; no branches, PRs, or
  corpus dirs existed. The orchestrator must resolve every PR number by
  head-branch lookup (`GET /pulls?head=yubi-OS:<branch>&state=all`) and
  verify against the PR files list + blob re-fetch before merging.

## Red Flags

- Outline collapses below 4 load-bearing docs: the request is probably a
  single research question, not a corpus; route to parallel-deep-research.
- jev 429 storm after fan-out: serialize the weighting phase instead of
  parallelizing it (weighting is the cheap phase; authoring is where
  parallelism pays).
- Repo `knowledge` exists but with unexpected contents: STOP and surface;
  never clobber an existing corpus dir.
- A doc's research-db digs/*.json shows zero results: the doc either
  carries the direct-verification story or the doc doesn't ship.

## Verification

- [ ] Phase 0 preflight passed (both endpoints healthy, probe results recorded in the DB) before any dig ran.
- [ ] `yubi-OS/knowledge/<ref>/` contains README + N docs + research-db/.
- [ ] Every doc's factual claims carry source URLs; spot-check 3.
- [ ] Every result in research-db carries a jev weight + task_id lineage.
- [ ] PR merged via /merges endpoint; `merged=true` verified.
- [ ] Total jev spend logged in the run plan.
- [ ] No network state changed (searxng port stays internal-only).

## Interaction with Other Skills

- `refs-refresh-sweep` - parent process (signals -> jev -> dig -> weight
  -> DB -> fan-out -> merge). This variant swaps "refresh existing docs"
  for "author new docs into a fresh corpus repo".
- `clef` - the decision-model layer; read before writing questions.
- `ideate-solo` - use when the request itself is vague ("a corpus on
  modern storage"); decompose via solo lenses before Phase 1.
- `parallel-deep-research` - the subagent protocol this specializes for
  greenfield authoring.
- `repo-refs-skill` - sibling: audits an existing refs/ archive; run it
  on the minted corpus later to check its coverage shape.

## Examples

**Worked shape** (anticipated run for "corpus on RK3588 secure boot"):

- Request parsed: ref `rk3588-secure-boot`, outline of 9 docs (ROTPK and
  fuse provisioning; TF-A TBB chain; OP-TEE handoff; U-Boot as BL33;
  fTPM measured boot; DDR/TPL blob licensing; upstream mainline status;
  vendor SDK vs mainline tradeoffs; verification plan template).
- jev outline validation drops 2 padding docs (score < 0.4) -> 7 docs.
- 14 searXNG queries, ~84 results, jev-weighted in 17 requests (~$0.005).
- 7 author subagents return docs; 1 returns "cannot author" (blob
  licensing needs credentialed sources) and ships as a stub with the
  gap documented.
- Orchestrator seeds `yubi-OS/knowledge` README (Contents API), lands
  `knowledge/rk3588-secure-boot/` on draft PR via one Git Data API chain,
  merges via `POST /merges`.

**Batch shape** (jev result-weighting request, identical to the parent
skill's Phase 4): one state array of results, N `quality_k` noul
questions, 5 per request.

## Guidelines

1. Never skip Phase 1's jev outline validation; it is the cheapest place
   to kill a bloated corpus.
2. Every HTTP call carries a User-Agent header, no exceptions.
3. jev batching: 5 questions per request, 4.3s spacing, backoff on 429.
4. The orchestrator owns all repo writes; subagents own authoring only.
5. Append-only does not apply here (greenfield), but once a corpus exists,
   updates go through `refs-refresh-sweep`, never silent rewrites.
6. Honest gaps (cannot-author docs, thin sections) are deliverables.
7. One report at the end with the full doc table.
8. Verify every claim you cite; if you cannot verify it, it does not ship.
9. Keep the research DB typed and complete; it is what makes the corpus
   auditable months later.
10. Total jev spend target: under $0.05 per minted corpus.

## Changelog

- 2026-10-05 v2: metric mapping formalized (score for outline validation,
  noul for source weighting, choice for either-or) after the first live
  multi-wave run (yubi-OS/knowledge PRs #12-#21); decide-failure = REDO
  (never ship unweighted); pacing lowered to >= 1s (the "15/min/IP" rate
  limit was hallucinated and removed); research-db schema v2 (preflight,
  outline, archive with full per-decision records, digs with redo_log,
  jev-log, db.ts); PR body format fixed; post-push verification required
  (PR files list + json.loads re-fetch); anti-patterns added for
  base64-pushed JSON, missing research-db, and unverified self-reports.
- 2026-09-29 v1: shipped as a variant of refs-refresh-sweep (which was
  validated live the same day: PRs #260, #261-#274 all merged). Phase
  mechanics inherited from the validated run; the mint-specific phases
  (outline decomposition, repo bootstrap, orchestrator-owned commit) are
  specified but await first live validation.
