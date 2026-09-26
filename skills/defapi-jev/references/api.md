# DefAPI jev-1.13 API reference

Source: https://defapi.org/api/model/en/typesafe/jev-1.13 (checked 2026-09-26 against the live API).

## Endpoint

```
POST https://api.defapi.org/api/v1/decisions
Authorization: Bearer <DEFAPI_API_KEY>
Content-Type: application/json
```

## Request body

| field | required | type | notes |
|---|---|---|---|
| `model` | yes | string | `"typesafe/jev-1.13"` |
| `state` | yes | string, object, or array | content being evaluated |
| `questions` | yes | object | `{question_key: Question}` |
| `provider` | no | object | routing preferences passed through upstream; schema not documented |
| `session_id` | no | string, max 256 | groups related calls |
| `user` | no | string, max 256 | end-user identifier |

### Question

| field | type | notes |
|---|---|---|
| `type` | `"noul"` \| `"choice"` \| `"score"` | |
| `instructions` | string | the question |
| `criteria` | depends on type | see below |

- `noul`: optional object `{"true": "...", "false": "..."}`
- `choice`: required object `{option_key: description}`
- `score`: required array of 2 to 10 strings, ordered lowest to highest

## Response

```json
{
  "model": "typesafe/jev-1.13-20260917",
  "answers": {
    "is_bug":  {"type": "noul", "noul": 0.44},
    "team":    {"type": "choice", "choice": "payments", "confidence": 1,
                "probabilities": {"payments": 1, "account": 0, "frontend": 0}},
    "urgency": {"type": "score", "score": 2, "confidence": 1,
                "legend": {"0": "Can wait", "1": "Fix this week", "2": "Blocking revenue"},
                "probabilities": {"0": 0, "1": 0, "2": 1}}
  },
  "usage": {"input_tokens": 407, "output_tokens": 55, "cost": 3.4188e-05},
  "id": "gen-dec-...",
  "provider": "TypeSafe",
  "task_id": "ta90ca70-...",
  "consumed": "0.000034188"
}
```

- `model` is the concrete version that served the call; it can vary between calls.
- `score` answers are probability-weighted averages of level indexes, so they can be fractional (e.g. 1.84). `legend` maps each index to its label.
- `id` and `provider` may be absent.
- `consumed` is the billed amount as a string.

## Pricing

Listed as $0.084 input / $0.00 output per unit. Observed real cost: about $0.00003 per request with 1 to 3 questions.

## Errors

Error bodies look like `{"code": <int>, "message": "<text>"}`.

| HTTP | code | message | meaning |
|---|---|---|---|
| 401 | 1007 | Invalid Api Key | key missing, wrong, or revoked |

Rate limits, maximum question count, and maximum `state` size are not documented.

## curl

```bash
curl -X POST https://api.defapi.org/api/v1/decisions \
  -H "Authorization: Bearer $DEFAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"typesafe/jev-1.13","state":"Checkout is broken for all customers.",
       "questions":{"urgency":{"type":"score","instructions":"How urgent is this ticket?",
       "criteria":["Can wait for next release","Fix this week","Blocking revenue"]}}}'
```
