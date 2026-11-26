"""Replay the five-paper instrument on archived, row-bound Cloudflare embeddings."""

import argparse
import json
import os
from pathlib import Path

# Small, fixed matrices. Avoid oversubscribing runner CPUs and varying the PCA solver.
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
import numpy as np

from measure import measure
from vectors import inputs, sha, MODEL
from replay import compare_report

DEFAULT = Path(__file__).resolve().parents[2] / "papers/data/multimodal-digits"


def run(data, out, expected=None):
    if out.exists() and any(out.iterdir()):
        raise ValueError("use a new or empty output directory")
    out.mkdir(parents=True, exist_ok=True)
    manifest = data / "records.jsonl"
    rows = inputs(manifest)
    receipt = json.loads((data / "inference.json").read_text())
    if receipt["model"] != MODEL or receipt["records_sha256"] != sha(manifest):
        raise ValueError("record manifest or model differs from provider receipt")
    modalities = sorted({r["modality"] for r in rows})
    if set(modalities) != set(receipt["files"]):
        raise ValueError("vector banks and manifest modalities differ")
    banks = {}
    for mod in modalities:
        if not mod.isidentifier():
            raise ValueError("invalid modality identifier")
        subset = [r for r in rows if r["modality"] == mod]
        source = data / (mod + ".npz")
        if sha(source) != receipt["files"][mod]:
            raise ValueError("corrupt embedding bank: " + mod)
        with np.load(source, allow_pickle=False) as cache:
            x = cache["vectors"]
            if (
                cache["inputs"].tolist() != [r["input_sha256"] for r in subset]
                or x.shape != (len(subset), 1024)
                or not np.isfinite(x).all()
            ):
                raise ValueError("invalid or misaligned embeddings: " + mod)
        parts = {}
        for split in ["reference", "test"]:
            ix = [i for i, r in enumerate(subset) if r["split"] == split]
            parts[split] = (x[ix], [subset[i] for i in ix])
        ref, test = parts["reference"][1], parts["test"][1]
        if set(r["group"] for r in ref) & set(r["group"] for r in test):
            raise ValueError("group overlap in " + mod)
        if not ref or not test or len({r["unit"] for r in test}) != 1:
            raise ValueError("empty split or mixed query units")
        banks[mod] = parts
    results = {}
    for src in modalities:
        a, refs = banks[src]["reference"]
        for dst in modalities:
            q, queries = banks[dst]["test"]
            key = f"{src}_to_{dst}"
            results[key], details = measure(a, q, refs, queries)
            (out / (key + ".jsonl")).write_text(
                "".join(json.dumps(d, allow_nan=False) + "\n" for d in details)
            )
            print(key, results[key]["correct"], flush=True)
    (out / "results.json").write_text(
        json.dumps(results, indent=2, allow_nan=False, default=float) + "\n"
    )
    if expected:
        compare_report(
            json.loads((out / "results.json").read_text()),
            json.loads(expected.read_text()),
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DEFAULT)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--check-report", type=Path)
    args = parser.parse_args()
    run(args.data, args.output, args.check_report)
