---
name: defapi-jev
description: Classify, route, gate, or score text and JSON with DefAPI's typesafe/jev-1.13 decision model, which returns calibrated yes/no probabilities, single-choice labels, and ranked scores instead of free text. Use for ticket triage, routing, go/no-go checks, moderation flags, and priority scoring where a structured, machine-readable decision is needed.
metadata:
  short-description: Structured decisions (yes/no, choice, score) via DefAPI jev-1.13
---

# DefAPI jev-1.13 decisions

jev-1.13 is a **decision model**, not a chat model. You give it a `state` (the thing being judged) and one or more typed `questions`; it returns probabilities for each question. Use it whenever the output should be a label, a probability, or a rank that code will act on, not prose.

## When to use

Good fits:

- **Triage and routing:** which team, queue, or category a ticket, email, or log entry belongs to (`choice`).
- **Gating / go-no-go:** is this deploy safe, is this refund eligible, does this contain PII, is this spam (`noul`).
- **Prioritization:** urgency, severity, lead quality, risk level on an ordered scale (`score`).
- **Batch labeling:** running the same question set over many records to get consistent, comparable outputs.
- **Several decisions at once:** one request can ask multiple questions about the same state.

Do not use it for:

- Generating, summarizing, rewriting, or explaining text (it returns no prose).
- Open-ended questions without a fixed set of answers.
- Factual lookups or anything needing current external data.
- Final authority on high-stakes outcomes (legal, medical, financial, HR): use the probability as a signal and keep a human in the loop.

## Setup

1. The API key must be in the environment: `export DEFAPI_API_KEY="dk-..."`. Never hard-code or print it.
2. Outbound HTTPS to `api.defapi.org` must be allowed.
3. The client is `scripts/defapi_jev.py` (Python 3, standard library only).

Smoke test: `python scripts/defapi_jev.py --demo` should return an `urgency` score of 2 ("Blocking revenue").

## How to call it

CLI, with a JSON file or stdin containing `state` and `questions`:

```bash
python scripts/defapi_jev.py request.json
echo '{"state": "...", "questions": {...}}' | python scripts/defapi_jev.py -
```

Python:

```python
import sys; sys.path.insert(0, "scripts")
from defapi_jev import decide

result = decide(
    state={"ticket": "Card declined at checkout but bank says charge is fine.", "tier": "enterprise"},
    questions={
        "is_bug": {
            "type": "noul",
            "instructions": "Is this likely a product bug rather than user error?",
            "criteria": {"true": "Behavior contradicts expected system function",
                         "false": "Caused by user input or an external party"},
        },
        "team": {
            "type": "choice",
            "instructions": "Which team should own this?",
            "criteria": {"account": "Login, permissions, profile",
                         "frontend": "Rendering or layout",
                         "payments": "Checkout, billing, payment processing"},
        },
        "urgency": {
            "type": "score",
            "instructions": "How urgent is this?",
            "criteria": ["Can wait", "Fix this week", "Blocking revenue"],
        },
    },
)
```

## Question types

| type | use for | `criteria` | answer fields |
|---|---|---|---|
| `noul` | yes/no | optional `{"true": "...", "false": "..."}` | `noul`: probability of true, 0 to 1 |
| `choice` | pick exactly one | required `{option_key: description}` | `choice`, `probabilities`, `confidence` |
| `score` | ordered scale | required list of 2 to 10 levels, **lowest first** | `score` (probability-weighted, 0 to levels-1), `legend`, `probabilities`, `confidence` |

## Writing good questions

- Put everything the model should judge in `state`. Structured JSON (fields like tier, history, amounts) usually works better than one long string.
- Keep `instructions` to one clear question.
- Make `choice` options mutually exclusive and describe each one; the key is what your code receives.
- Order `score` levels from least to most. The returned `score` is a probability-weighted average of the level indexes (e.g. 1.84 on a 0 to 2 scale), so it can fall between levels; round it or use `argmax(probabilities)` when you need a single level.
- Always fill in `noul` criteria when "true" could be read more than one way.

## Acting on results

- Read decisions from `answers[<question_key>]`.
- Set thresholds rather than rounding: for example, auto-act when `noul >= 0.8`, escalate to a human between 0.3 and 0.8. A `noul` near 0.5 means the model is unsure.
- For `choice` and `score`, check `confidence` and route low-confidence results to review.
- Log `task_id` and `consumed` (cost in USD, as a string) for auditing and spend tracking.
- Pass `session_id` to group related calls, and `user` for a per-end-user identifier (each up to 256 characters).

## Errors

The client raises `RuntimeError("DefAPI <status>: <body>")` on HTTP errors and `ValueError` for malformed questions before any request is sent.

- `401 {"code":1007,"message":"Invalid Api Key"}`: key missing, wrong, or revoked.
- Connection refused / proxy 403: `api.defapi.org` is blocked by the network; ask for it to be allowed rather than working around it.

See `references/api.md` for the full request and response schema.
