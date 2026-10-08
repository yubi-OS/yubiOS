---
name: corpus-recall
description: "Quickly reference and search data in the yubi-OS/knowledge repo (authored corpora with research-db provenance): mirror the whole repo as a codeload tarball into a session dir and grep it, one-call full-text retrieval via the steady-orbit /api/jev/map/repo-items endpoint, or single-doc raw reads. Use when a session needs to recall, cite, or ground claims in the knowledge corpora without cloning. Triggers on 'corpus recall', 'knowledge repo lookup', 'yubi-OS/knowledge', 'recall from the corpus', 'cite the knowledge corpus'."
---

# Corpus Recall

Recall data from `yubi-OS/knowledge` — the org's authored knowledge-corpus repo (`knowledge/<ref>/` layout: authored docs + per-corpus `research-db/` provenance). Three validated paths, pick by need: mirror-and-grep for multi-doc work, one-call listing for full-text retrieval, raw fetch for one doc.

## Layout

```
knowledge/<ref>/            one corpus per directory
  01-topic.md ... NN.md     authored docs, cited, append-auditable
  README.md                 corpus charter
  research-db/              typed provenance (research-db-mint output)
    archive.json            every collected result + jev weight
    digs/<doc>.json         per-doc dig records
    preflight.json outline.json jev-log.json db.ts
```

Corpus list changes; never hardcode it. Enumerate: `ls repo/knowledge/` after mirroring.

## Path 1 — mirror + grep (multi-doc work, offline)

Codeload tarball, no GitHub API budget, ~1s fetch, ~1.5 MB:

```sh
curl -sL "https://codeload.github.com/yubi-OS/knowledge/tar.gz/refs/heads/main" -o k.tar.gz
tar xzf k.tar.gz && cd knowledge-main
rg -i 'pattern' knowledge/            # whole-corpus text search
rg 'pattern' knowledge/*/research-db/archive.json   # provenance records
```

`scripts/recall.sh` does this plus builds `index.tsv` (corpus, doc path, H1 title) for title-level lookup.

Measured: 37+ corpora, 300+ docs, 828 files; grep over all docs is sub-minute in the Sauna sandbox (its disk I/O is slow; faster on a real box).

## Path 2 — /api/jev/map/repo-items one-call full text

The steady-orbit worker's existing instrument, pointed at the knowledge repo:

```
POST https://steady-orbit.systems-a.workers.dev/api/jev/map/repo-items
{"repo":"yubi-OS/knowledge","subdir":"knowledge"}
```

Measured: 824 items with **full text + paths** in ~1s (7.3 MB response). One call replaces any number of file fetches; pipe the response through grep in-script, never dump it into context.

Hard gotcha: this endpoint lives on the workers.dev origin, which the Sauna **sandbox** egress blocks with Cloudflare error 1010 regardless of headers. Call it from `run_script` with `executor: "worker"` only. Auth via the Steady Orbit jev operator connection — the endpoint is bearer-gated (JEV_API_KEY, as of the 2026-10-08 auth pass) and the operator connection injects that bearer; calls without it get 401.

## Path 3 — single-doc raw read

```
https://raw.githubusercontent.com/yubi-OS/knowledge/main/knowledge/<ref>/<doc>.md
```

No auth, no budget. Use when the doc path is already known.

## Provenance discipline

Every authored doc cites its sources inline with jev weights (`(source: https://..., jev 0.66)`). When recalling a fact, cite the doc path it came from; when the fact matters enough to verify, open the corpus's `research-db/archive.json` and check the original URL's weight and collection date. Docs are snapshots, not live pages.

## Examples

- Recall what a corpus says about dm-verity: mirror (Path 1), `rg -i 'dm-verity' knowledge/`, cite doc paths.
- Ground a claim with its original source: find the doc, then cross-check `research-db/archive.json` for the cited URL's jev weight.
- Build a topic index across all corpora: Path 2, grep item labels for topic keywords, keep only paths + titles in context.

## Guidelines

- Mirror per session, not per task; the repo is small enough that a fresh pull is always cheaper than staleness reasoning.
- Never paste full doc bodies into chat; cite paths and quote the specific lines.
- Prefer Path 1 for anything grep-shaped, Path 2 when you need full text in one shot (mapping, embedding, triage), Path 3 for known-path reads.
- The `/api/jev/map/repo-items` call MUST run from the worker executor (sandbox = CF 1010 on workers.dev) AND pass the Steady Orbit jev operator connection — the endpoint is bearer-gated (401 without the key).
- knowledge-corpus-mint creates these corpora; corpus-recall only reads them.
