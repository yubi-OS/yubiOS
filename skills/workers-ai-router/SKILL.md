---
name: workers-ai-router
description: "Route any prompt to the right Cloudflare Workers AI model out of the live 52-model catalog: task relevance first (20 intent routes: chat, coding, reasoning, structured output, tool calling, decision scoring, safety, long context, bulk, embeddings, multimodal embeddings, image-to-text, image classification, text-to-image, speech-to-text, text-to-speech, VAD, translation, rerank, sentiment), then quality within the route (pools ranked by the 2026-10-30 account benchmark). Triggers on: which workers ai model, route this prompt, pick a model for X, best workers ai model, cloudflare model for coding/embeddings/images/audio, cf model router, workers-ai-router."
metadata:
  short-description: "Task-then-quality router over the live 52-model Workers AI catalog, grounded in the account benchmark"
---

# Workers AI Router

Route a task to a Cloudflare Workers AI model. The rule is fixed: **task relevance first, then quality**. Pick the route by intent, then take the first model in that route's pool. If it errors (404/410 retired, 429, 5xx), walk down the pool. Never invent a model ID: the only valid IDs are in `router.json` under `models` (52 live models, fetched 2026-11-23).

Call shape: `POST https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/ai/run/<MODEL_ID>` via the Sauna `Cloudflare` connection (`conn_pd_apn_1KhdoD7`, account `b57ee20cd90ebc4e4db28728e450a4b8`). Text-gen models take `{"messages":[...],"max_tokens":N}`; task-specific payloads (embeddings `{"text":[...]}`, TTS `{"text":...}`, STT binary audio, image gen `{"prompt":...}`) follow the per-task shape in Cloudflare docs. Retrieval over pre-training for payload details.

## Routing table

Data: `references/router.json`. Sources: live catalog (2026-11-23) + benchmark rankings (2026-10-30, `documents/github-yubios-KS9n5GAT/cloudflare-reports/`).

| Route | Use for | Default (pool head) | Fallbacks |
|---|---|---|---|
| `general-chat` | chat, Q&A, summaries, writing, planning | deepseek-v4.1-flash-1017 (q=100) | quality-ranked LLM pool |
| `coding` | code gen, debug, review, explain | gpt-oss-120b | pool sorted by codeScore |
| `reasoning-math` | math, logic, constraint solving | gpt-oss-120b | pool sorted by mathScore |
| `structured-output` | JSON, SQL, strict schema | gpt-oss-120b | pool sorted by jsonScore |
| `tool-calling` | function calling, agent tools | deepseek-v4.1-flash-1017 | only models that passed the tool probe (11) |
| `decision-scoring` | yes/no gates, N-option picks, triage | clef-omni (native-schema decision models) | clairic, clef, clef-flash |
| `safety-moderation` | content safety classification | llama-guard-3-8b | none (single-model route) |
| `long-context` | prompts over 100k tokens | deepseek-v4.1-flash-1017 (1M ctx) | 6 models with ctx >= 200k |
| `cheap-high-throughput` | bulk jobs, cost dominates | granite-4.0-h-micro ($0.017/M in) | pool sorted by input price |
| `embeddings` | text embeddings, RAG vectors | qwen3-embedding-0.6b (probe winner); bge-m3 stays the workspace default (1024-D, matches existing Vectorize indexes) | 6 embedding models |
| `multimodal-embeddings` | image+text embeddings | embeddinggemma-2 | none (unbenchmarked) |
| `image-to-text` | captioning, visual Q&A | llama-3.2-11b-vision-instruct | moondream3.1-9B-A2B |
| `image-classification` | fixed-class image labels | resnet-50 | none |
| `text-to-image` | generate images | flux-2-dev (quality) | flux-1-schnell (fast), klein-9b/4b (light), leonardo pair (unproven) |
| `speech-to-text` | transcription | whisper-large-v3-turbo | deepgram nova-3, deepgram flux (streaming), whisper |
| `text-to-speech` | voice synthesis | aura-2-en | aura-2-es (Spanish), aura-1 |
| `voice-activity-detection` | turn-taking in voice pipelines | smart-turn-v2 | none |
| `translation` | machine translation | m2m100-1.2b (q=90) | indictrans2-en-indic-1B (Indic pairs) |
| `rerank` | re-rank RAG/search candidates | bge-reranker-base (q=96) | none |
| `sentiment` | sentiment classification | distilbert-sst-2-int8 | none |

## Examples

**"Summarize this call transcript"**: route `general-chat`, default `@cf/deepseek-ai/deepseek-v4.1-flash-1017`. Transcript over 100k tokens: switch to `long-context` (same head, 1M context).

**"Write a Python migration script"**: route `coding`, default `@cf/openai/gpt-oss-120b`. If it 5xxs, walk the codeScore pool: qwen2.5-coder-32b, then the q=100 trio.

**"Embed 5k docs for Vectorize"**: route `embeddings`, use `@cf/baai/bge-m3` to match the existing 1024-D indexes. New index, quality-first: `@cf/qwen/qwen3-embedding-0.6b`.

**"Transcribe this wav"**: route `speech-to-text`, default `@cf/openai/whisper-large-v3-turbo`. Streaming turns: deepgram flux instead.

**"Generate a hero image"**: route `text-to-image`, default `@cf/black-forest-labs/flux-2-dev`. Drafts/iteration: flux-1-schnell.

**"Triage these 40 emails, yes/no each"**: route `decision-scoring`, default `@cf/cloudflare/clef-omni`.

## Guidelines

- The `qualityScore` and sub-scores come from the 2026-10-30 account benchmark (83 models tested, 49 live). `router.json` carries both; `subscores` drive the coding/reasoning/structured pools.
- Specialist guards and classifiers (llama-guard, distilbert-sst-2) score low on the generic harness. That is a harness artifact, not a defect: trust the task route, never demote them by global quality.
- Unbenchmarked since the last sweep: `inkling-2-small`, `clairic-flash`, `embeddinggemma-2`. They sit at pool tails. Do not make one a default until a re-bench.
- Text-to-image, TTS, ASR and VAD pools have no quality probes. Their order is role-based (quality default, fast variant, fallback), spelled out in each route's `order_note`.
- Cost trade-downs are per-route too: every model in `router.json` carries `inputUsdPerM`/`outputUsdPerM`/`avgLatencyMs` where measured. Walk down the pool for cheaper, not across routes.
- Refresh procedure: re-run `GET /ai/models/search?per_page=100&page=N` (paged until a short page), regenerate `router.json` (see `scripts/`), re-bench new models before promoting them out of pool tails.
