"""Repeat the text-only Workers AI measurement in a new directory."""

import argparse
import datetime
import hashlib
import json
import os
import re
from pathlib import Path
import shutil
from urllib.request import Request, urlopen

from pack import pack


def acquire(source, destination):
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    if re.fullmatch(r"[a-fA-F0-9]{32}", account) is None:
        raise ValueError("invalid account identifier")
    destination.mkdir(parents=True, exist_ok=False)
    manifest = destination / "definitions.jsonl"
    shutil.copyfile(source, manifest)
    batches = destination / "batches"
    batches.mkdir()
    rows = [json.loads(line) for line in manifest.read_text().splitlines()]
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/@cf/baai/bge-m3"
    for start in range(0, len(rows), 8):
        texts = [r["text"] for r in rows[start : start + 8]]
        req = Request(
            url,
            data=json.dumps({"text": texts}).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        with urlopen(req, timeout=90) as response:
            raw = response.read()
            ray = response.headers.get("CF-Ray")
        envelope = json.loads(raw)
        if not envelope["success"]:
            raise RuntimeError(f"inference failed at batch {start}")
        result = envelope["result"]
        meta = dict(
            start=start,
            count=len(texts),
            shape=result["shape"],
            pooling=result.get("pooling"),
            inputs=[hashlib.sha256(t.encode()).hexdigest() for t in texts],
            completed_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            cf_ray=ray,
            response_sha256=hashlib.sha256(raw).hexdigest(),
        )
        (batches / f"{start}.json").write_text(json.dumps(meta))
        (batches / f"{start}.jsonl").write_text(
            "".join(json.dumps(v) + "\n" for v in result["data"])
        )
    pack(manifest, batches, destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("definitions", type=Path)
    parser.add_argument("new_directory", type=Path)
    args = parser.parse_args()
    acquire(args.definitions, args.new_directory)
