"""Bind observed Cloudflare response batches to the frozen input order."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pack(source, batches, out):
    rows = [json.loads(s) for s in source.read_text().splitlines()]
    chunks, metadata = [], []
    for start in range(0, len(rows), 8):
        batch = json.loads((batches / f"{start}.json").read_text())
        ids = [r["input_sha256"] for r in rows[start:start + 8]]
        data = np.array([json.loads(s) for s in
                         (batches / f"{start}.jsonl").read_text().splitlines()], dtype="<f4")
        if (batch["inputs"] != ids or batch["start"] != start or batch["count"] != len(ids)
                or list(data.shape) != [len(ids), 1024] or batch["shape"] != list(data.shape)
                or not np.isfinite(data).all() or np.any(np.linalg.norm(data, axis=1) == 0)):
            raise ValueError(f"bad batch at {start}")
        batch["float32_sha256"] = hashlib.sha256(data.tobytes()).hexdigest()
        metadata.append(batch)
        chunks.append(data)
    bank = out / "vectors.npy"
    np.save(bank, np.concatenate(chunks), allow_pickle=False)
    document = dict(model="@cf/baai/bge-m3", provider="Cloudflare Workers AI",
                    definitions_sha256=sha(source), bank_sha256=sha(bank),
                    batches=metadata)
    (out / "inference.json").write_text(json.dumps(document, indent=2) + "\n")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ("source", "batches", "out"):
        p.add_argument(arg, type=Path)
    a = p.parse_args()
    pack(a.source, a.batches, a.out)
