#!/usr/bin/env python3
"""Route an intent string to a Workers AI model. Usage: route.py "<task description>" [--all]"""
import json, re, sys, pathlib

R = json.loads(pathlib.Path(__file__).parent.parent.joinpath("references/router.json").read_text())
query = " ".join(a for a in sys.argv[1:] if not a.startswith("--")).lower()

KEYWORDS = {
    "coding": ["code", "coding", "script", "debug", "function", "python", "typescript", "refactor", "migration script"],
    "reasoning-math": ["math", "reasoning", "logic", "puzzle", "constraint", "proof"],
    "structured-output": ["json", "sql", "schema", "regex", "structured"],
    "tool-calling": ["tool call", "function call", "tool use", "agent tool"],
    "decision-scoring": ["triage", "yes/no", "classify", "gate", "pick one", "decision", "score"],
    "safety-moderation": ["moderation", "safety", "guard", "policy violation"],
    "long-context": ["long", "100k", "200k", "1m context", "whole repo", "entire document"],
    "cheap-high-throughput": ["bulk", "cheap", "batch of", "high throughput", "thousands"],
    "embeddings": ["embed", "embedding", "vector", "semantic search", "rag"],
    "multimodal-embeddings": ["image embedding", "image+text", "multimodal embed"],
    "image-to-text": ["caption", "describe image", "ocr", "what is in this image", "vision"],
    "image-classification": ["classify image", "label image"],
    "text-to-image": ["generate image", "draw", "hero image", "picture of"],
    "speech-to-text": ["transcribe", "transcription", "stt", "speech to text", "wav", "audio to text"],
    "text-to-speech": ["tts", "voice", "speak", "narrat", "text to speech"],
    "voice-activity-detection": ["vad", "turn detection", "voice activity"],
    "translation": ["translate", "translation"],
    "rerank": ["rerank", "re-rank"],
    "sentiment": ["sentiment"],
    "general-chat": ["summar", "chat", "write", "draft", "explain", "plan", "question", "answer"],
}

hits = []
for route, kws in KEYWORDS.items():
    for kw in kws:
        m = re.search(re.escape(kw), query)
        if m:
            hits.append((m.start(), -len(kw), route))
            break
PRIORITY = {"general-chat": 99}
route = min(hits, key=lambda h: (PRIORITY.get(h[2], 0), h[0], h[1]))[2] if hits else "general-chat"
pool = R["routes"][route]["pool"]
if "--all" in sys.argv:
    print(route)
    print("\n".join(pool))
else:
    print(f"{route}: {pool[0]}")
    if len(pool) > 1:
        print("fallbacks:", ", ".join(pool[1:4]))
