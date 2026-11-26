"""Acquire fresh BGE-M3 measurements or package completed provider batches."""

import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np

MODEL = "@cf/baai/bge-m3"
BATCH = 12


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inputs(path):
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    hashes = [hashlib.sha256(r["text"].encode()).hexdigest() for r in rows]
    if not rows or hashes != [r["input_sha256"] for r in rows] or len(set(hashes)) != len(rows):
        raise ValueError("empty, repeated or altered embedding inputs")
    if len({r["source"] for r in rows}) != len(rows):
        raise ValueError("duplicate observation IDs")
    return rows


def pack(manifest, batches, out):
    rows = inputs(manifest)
    parts, receipts = [], []
    for start in range(0, len(rows), BATCH):
        receipt = json.loads((batches / f"{start}.json").read_text())
        group = rows[start:start+BATCH]
        shape = [len(group), 1024]
        if (receipt["start"] != start or receipt["count"] != len(group)
                or receipt["shape"] != shape or receipt["inputs"] != [r["input_sha256"] for r in group]):
            raise ValueError(f"unexpected receipt at {start}")
        x = np.fromfile(batches / f"{start}.f32", dtype="<f4").reshape(shape)
        if not np.isfinite(x).all() or np.any(np.linalg.norm(x, axis=1) == 0):
            raise ValueError("invalid vectors")
        parts.append(x)
        receipts.append({k: receipt[k] for k in ("start", "count", "shape", "pooling")})
    x = np.concatenate(parts)
    out.mkdir(exist_ok=True, parents=True)
    files = {}
    for mod in sorted({r["modality"] for r in rows}):
        if not mod.isidentifier():
            raise ValueError("use simple modality names")
        ix = [i for i,r in enumerate(rows) if r["modality"] == mod]
        dest = out / (mod + ".npz")
        np.savez_compressed(dest, vectors=x[ix], inputs=[rows[i]["input_sha256"] for i in ix])
        files[mod] = sha(dest)
    (out / "inference.json").write_text(json.dumps(dict(model=MODEL, dtype="float32",
        records_sha256=sha(manifest), files=files, batches=receipts), indent=2)+"\n")


def acquire(manifest, batches):
    rows = inputs(manifest)
    batches.mkdir(parents=True, exist_ok=False)
    url = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CLOUDFLARE_ACCOUNT_ID']}/ai/run/{MODEL}"
    for start in range(0, len(rows), BATCH):
        group = rows[start:start+BATCH]
        req = Request(url, data=json.dumps({"text":[r["text"] for r in group]}).encode(),
                      headers={"Authorization":"Bearer "+os.environ["CLOUDFLARE_API_TOKEN"],
                               "Content-Type":"application/json"})
        with urlopen(req, timeout=120) as response:
            result = json.load(response)["result"]
        values = np.asarray(result["data"], dtype="<f4")
        if list(values.shape) != result["shape"] or values.shape != (len(group), 1024):
            raise ValueError("unexpected provider shape")
        values.tofile(batches/f"{start}.f32")
        receipt = dict(start=start,count=len(group),shape=result["shape"],pooling=result.get("pooling"),
                       inputs=[r["input_sha256"] for r in group])
        (batches/f"{start}.json").write_text(json.dumps(receipt))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode",choices=["acquire","pack"])
    for arg in ["records","batches","output"]:
        parser.add_argument(arg,type=Path)
    args = parser.parse_args()
    if args.mode == "acquire":
        acquire(args.records, args.batches)
    pack(args.records,args.batches,args.output)
