#!/usr/bin/env python3
"""Client for DefAPI's typesafe/jev-1.13 decision model (stdlib only).

Library:
    from defapi_jev import decide
    decide(state, questions)

CLI:
    export DEFAPI_API_KEY="dk-..."
    python defapi_jev.py request.json      # {"state": ..., "questions": {...}}
    cat request.json | python defapi_jev.py -
    python defapi_jev.py --demo            # sample urgency request
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE_URL = "https://api.defapi.org"
ENDPOINT = "/api/v1/decisions"
MODEL = "typesafe/jev-1.13"
QUESTION_TYPES = {"noul", "choice", "score"}


def _validate(questions):
    if not isinstance(questions, dict) or not questions:
        raise ValueError("questions must be a non-empty object keyed by question name")
    for key, q in questions.items():
        t = q.get("type")
        if t not in QUESTION_TYPES:
            raise ValueError(f"{key}: type must be one of {sorted(QUESTION_TYPES)}")
        if not q.get("instructions"):
            raise ValueError(f"{key}: instructions is required")
        c = q.get("criteria")
        if t == "choice" and not (isinstance(c, dict) and c):
            raise ValueError(f"{key}: choice needs criteria as {{option: description}}")
        if t == "score" and not (isinstance(c, list) and 2 <= len(c) <= 10):
            raise ValueError(f"{key}: score needs criteria as a list of 2-10 levels, lowest first")
        if t == "noul" and c is not None and not isinstance(c, dict):
            raise ValueError(f"{key}: noul criteria, if given, is {{'true': ..., 'false': ...}}")


def decide(state, questions, api_key=None, session_id=None, user=None, provider=None, timeout=60):
    """POST a decision request and return the parsed JSON response.

    state:     str, dict, or list — the content being judged.
    questions: {key: {"type": "noul"|"choice"|"score", "instructions": str, "criteria": ...}}
    """
    api_key = api_key or os.environ.get("DEFAPI_API_KEY")
    if not api_key:
        raise RuntimeError("Set DEFAPI_API_KEY or pass api_key=")
    _validate(questions)

    body = {"model": MODEL, "state": state, "questions": questions}
    if session_id:
        body["session_id"] = str(session_id)[:256]
    if user:
        body["user"] = str(user)[:256]
    if provider:
        body["provider"] = provider

    req = urllib.request.Request(
        BASE_URL + ENDPOINT,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"DefAPI {e.code}: {e.read().decode(errors='replace')}") from None


DEMO = {
    "state": "Checkout is completely broken for all customers.",
    "questions": {
        "urgency": {
            "type": "score",
            "instructions": "How urgent is this ticket?",
            "criteria": ["Can wait for next release", "Fix this week", "Blocking revenue"],
        }
    },
}


def main(argv):
    if len(argv) != 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 2
    if argv[1] == "--demo":
        payload = DEMO
    elif argv[1] == "-":
        payload = json.load(sys.stdin)
    else:
        with open(argv[1]) as f:
            payload = json.load(f)
    try:
        result = decide(
            payload["state"],
            payload["questions"],
            session_id=payload.get("session_id"),
            user=payload.get("user"),
            provider=payload.get("provider"),
        )
    except (RuntimeError, ValueError, KeyError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    json.dump(result, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
