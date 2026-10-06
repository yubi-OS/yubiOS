# Knowledge Corpus Mint Brief (one corpus per agent) — v2

You are minting ONE knowledge corpus into the yubi-OS org repo **yubi-OS/knowledge** (public). Your corpus directory: `knowledge/<REF>/` (REF given in your task prompt). Branch: `mint/<REF>-2026-10-05`. You open ONE draft PR. You are one of 5 parallel agents: touch ONLY your own branch, never main, never another corpus dir.

## Source of truth
Your task prompt names the SOURCE DOC file path under `session/refs-mint/refs_corpus/` (extracted from yubi-OS/yubiOS `refs/`). Read that file IN FULL first. Its topic is what the corpus is about. The doc itself is NOT copied into the corpus; it is the input you decompose.

## Metric mapping (each clef decision uses the RIGHT metric)
| Decision | Metric | Shape |
|---|---|---|
| Outline: is each subtopic load-bearing? | `score` | criteria lowest-first: `["padding: drop", "marginal: keep only if the dig comes back strong", "load-bearing: core subtopic"]`. Drop score 0; score 1 subtopics stay only if their dig is strong |
| Source quality weighting | `noul` | true = primary/official source worth citing; false = aggregator, forum, marketing, dead link, off-topic. Weight = the probability |
| Source-class or either-or judgment (rare) | `choice` | criteria `{option: description}` |
Store EVERY decision's full record (see schema): type, instructions, criteria, the raw answer object (including probabilities/legend/confidence), model, usage tokens, timestamp.

## Step 1 - Outline
Decompose the topic into 6-10 subtopic docs, each with: one-line scope + 2 seed web-search queries. Decompose by the domain's own joints (subsystems, lifecycle stages, comparison axes, key decisions). If the topic cannot honestly support 4+ distinct subtopics, STOP and report `CANNOT-MINT: <reason>`. Do not force it.

## Step 2 - Outline validation (jev, ONE request, score metric)
```
POST https://steady-orbit.systems-a.workers.dev/api/decide
Headers: Content-Type: application/json, User-Agent: omni-agent/1.0
Body: {"state":"<REF>","questions":{"t01":{"type":"score","instructions":"How load-bearing is the subtopic '<X>' for a knowledge corpus on <TOPIC>?","criteria":["padding: drop","marginal: keep only if the dig comes back strong","load-bearing: core subtopic"]}, ...}}
```
One question per subtopic, all subtopics in ONE request. Parse `answers.t01.score` (0/1/2). Drop score-0 subtopics. Record the full answers in `outline.json`.

## Step 3 - Dig (searXNG)
For each KEPT subtopic, run its 2 queries:
```
GET https://p01--n8n-service--mcx7zcrbvdyt.code.run/webhook/searxng?endpoint=search&qs=q%3D<urlencoded-query>
Header: User-Agent: omni-agent/1.0
```
Response is JSON with a `results` array (title/url/content). Keep top 6 per query. Space queries >= 1s apart. This endpoint is shared with sibling agents; it tolerates bursts but do not hammer.

## Step 4 - Weight every result (jev, noul metric)
Batch 5 results per request (one noul question per result):
```
POST /api/decide  {"state":"<REF>","questions":{"r01":{"type":"noul","instructions":"Is result '<title>' (<url>) a high-quality authoritative source worth citing? true = primary/official source, false = aggregator, forum, marketing page, dead link, or off-topic."}, ...}}
```
Pace >= 1s between jev requests. **/api/decide failure is a REDO, not a degrade**: on 429/5xx or any failed request, sleep 30s and re-send (up to 3 attempts; split into smaller batches on retry). NEVER ship results unweighted: a decision-model failure is treated exactly like a thin dig, the affected results get redone, and any results that still cannot be scored after redos mean the affected docs are SKIPPED and recorded as gaps. Every HTTP call carries User-Agent. Append every request (and its usage tokens) to `jev-log.json`.

## Step 5 - Author each doc (~600-1200 words), `NN-<slug>.md` numbered in outline order
- Start with the scope line. Group findings by sub-claim.
- EVERY factual claim carries its source URL and the jev weight that backed it. A claim with no source is deleted, not softened. Weight >= 0.5 = authoritative backing; < 0.5 = weak backing, label it as such in text.
- Writing: sharp, specific, no em dashes, numbers as digits, headings for wayfinding.
- **REDO RULE (hard, per user directive): if a subtopic's dig is too thin to author honestly, REDO the dig with DIFFERENT queries (up to 2 redos), logging each redo in the dig record. NEVER fall back to fetching primary sources directly to fill a thin dig.** If still thin after redos, SKIP the doc and record it as a gap in the README. Never pad.

## Step 6 - research-db/ (schema v2 — store ALL info)
Exact file set under `knowledge/<REF>/research-db/`:

1. `preflight.json`: `{"date", "searxng": {"url", "probe_results", "unresponsive_engines"}, "decide": {"url", "model", "probe_answer"}}`.
2. `outline.json`: `{"topic", "subtopics": [{"nn", "slug", "scope", "seed_queries": [q1, q2]}], "validation": {"metric": "score", "criteria": [...], "model", "answers": {"t01": {"score", "probabilities", "confidence", "legend"}}, "usage", "dropped": [nn...], "kept": [nn...]}}`.
3. `archive.json`: a JSON ARRAY of result entries, one per collected result:
   `{"query", "title", "url", "snippet", "collected_at", "weight": <float|null>, "decision": {"type": "noul", "instructions", "model": "clef", "answer": <raw answer object>, "usage": {"input_tokens", "output_tokens"}, "requested_at"}, "redo_of": null}` — `redo_of` carries the index of the superseded unweighted entry when a result was rescored.
4. `digs/<NN>-<slug>.json`: `{"nn", "slug", "scope", "queries_attempted": [{"query", "attempt", "raw_results", "kept"}], "redo_count", "redo_log": [{"attempt", "reason", "new_queries"}], "results_kept": [url...], "outcome": "authored"|"skipped", "skip_reason"?}`.
5. `jev-log.json`: one entry per jev HTTP request: `{"requested_at", "endpoint", "state", "model", "n_questions", "question_names": [...], "metric_types": [...], "usage": {"input_tokens", "output_tokens"}}`.
6. `db.ts`: TypeScript interfaces matching ALL the shapes above (`DugResult`, `DecisionRecord`, `DigRecord`, `OutlineRecord`, `JevLogEntry`, `PreflightRecord`), with a comment mapping file -> interface.

Rules: plain UTF-8 JSON only. NEVER push base64-encoded text as file content. After the push, re-fetch each research-db .json and `json.loads` it to verify (Step 8 check).

## Step 7 - README.md (corpus index)
Title, one-line scope per doc (list of `NN-<slug>.md`), research summary: results collected, weight split (>= 0.5 / < 0.5 counts), jev request count + usage tokens, redo counts, skipped docs + why. Include: `Preflight 2026-10-05: searXNG 85 results healthy; /api/decide (clef) 200`.

## Step 8 - Push to yubi-OS/knowledge (GitHub REST) + POST-PUSH VERIFICATION
Connection: `conn_3h7rj41VF6hs`. EVERY GitHub call needs headers `X-Sauna-Connection-Id: conn_3h7rj41VF6hs`, `User-Agent: omni-agent/1.0`, `Content-Type: application/json`, AND you must pass `connections: [{"id":"conn_3h7rj41VF6hs","name":"MASTER GIT SU"}]` in the bash tool call parameters, or the proxy 401s you.

Do the ENTIRE push chain in ONE bash call (sandbox /tmp is wiped between calls):
1. `GET /repos/yubi-OS/knowledge/contents/knowledge/<REF>` with `?ref=main`. If it exists (200), STOP and report `COLLISION: knowledge/<REF> already exists`.
2. `GET /repos/yubi-OS/knowledge/git/ref/heads/main` -> head sha; `GET /git/commits/<head>` -> base tree sha.
3. For each file: `POST /git/blobs` `{"content":"<plain-utf8-text>","encoding":"utf-8"}` -> blob sha. (utf-8 encoding, NEVER base64.)
4. `POST /git/trees` `{"base_tree":"<tree>","tree":[{"path":"knowledge/<REF>/README.md","mode":"100644","type":"blob","sha":"..."}, ...]}`.
5. `POST /git/commits` `{"message":"mint: <REF> knowledge corpus from yubiOS refs/<SOURCE-FILE>","tree":"<new tree>","parents":["<head>"]}`.
6. `POST /git/refs` `{"ref":"refs/heads/mint/<REF>-2026-10-05","sha":"<commit>"}`.
7. `POST /repos/yubi-OS/knowledge/pulls` `{"title":"mint: <REF> knowledge corpus","head":"mint/<REF>-2026-10-05","base":"main","body":"<PR body format below>","draft":true}`.
Bodies > 100KB go via stdin (`curl -d @-`), never as shell arguments.

**Post-push verification (REQUIRED before reporting success):**
- `GET /repos/yubi-OS/knowledge/pulls/<n>/files?per_page=100` — confirm the research-db files are in the PR diff (a mint whose research-db is missing from the PR is a FAILED mint).
- Re-fetch each research-db .json from raw.githubusercontent and `json.loads` it — every file must parse and every archive entry must carry a non-null `weight`.
- Report the verification line: `VERIFIED: files <n>, research-db <m> parse, weights <k>/<k>`.

## PR body format (fixed order)
```
mint: <REF> (from yubi-OS/yubiOS refs/<SOURCE-FILE>)
## Source doc
<path + one-line topic>
## Outline
| NN | slug | score | verdict |
## Metrics
score (outline) / noul (weighting) via clef on /api/decide
## Jev stats
requests <n>, usage <in/out tokens>, weights high <h> / low <l> of <total>
## Per-doc sources
| doc | results kept | primary (>= 0.5) |
## Redo log
<per-doc redos or "none">
## Gaps / skips
<list or "none">
## Preflight
2026-10-05: searXNG 85 results healthy; /api/decide (clef) 200
## Verification
VERIFIED: files <n>, research-db <m> parse, weights <k>/<k>
```

## Guardrails
- Never invent facts, versions, dates, or APIs. Unverifiable = deleted.
- No em dashes anywhere in shipped docs. Numbers as digits.
- Never modify files outside `knowledge/<REF>/`.
- Do not fetch anything from api.github.com except the calls in Step 8.
- Budget: keep total jev requests under ~40 for the whole mint.

## Final report format
```
PR: #<n> <url>
branch: mint/<REF>-2026-10-05
files: <n> (README, <k> docs, research-db x<m>)
docs kept/skipped: k / s
results weighted: <total> (high <h> / low <l>)
jev requests: <n> (+ usage tokens)
redos: <n>
gaps: <list or none>
VERIFIED: files <n>, research-db <m> parse, weights <k>/<k>
```
