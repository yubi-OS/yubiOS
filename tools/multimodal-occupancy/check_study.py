"""Check sampling, provider receipt coverage and report invariants from public records."""

from collections import Counter
import json
from pathlib import Path
import sys

import numpy as np

from vectors import inputs, sha, MODEL


def check(data):
    rows = inputs(data / "records.jsonl")
    receipt = json.loads((data / "inference.json").read_text())
    assert receipt["records_sha256"] == sha(data / "records.jsonl")
    assert receipt["model"] == MODEL and receipt["dtype"] == "float32"
    n = 0
    for batch in receipt["batches"]:
        assert batch["start"] == n and batch["pooling"] == "cls"
        assert batch["shape"] == [batch["count"], 1024] and batch["count"] > 0
        n += batch["count"]
    assert n == len(rows) == 480
    counts = Counter((r["modality"], r["split"], r["label"]) for r in rows)
    assert set(counts.values()) == {12} and len(counts) == 40
    labels = [str(i) for i in range(10)]
    modes = ["handwriting", "speech"]
    assert set(receipt["files"]) == set(modes)

    def bank(m, split):
        rs = [r for r in rows if r["modality"] == m and r["split"] == split]
        assert len(rs) == 120 and sorted(set(r["label"] for r in rs)) == labels
        raw = np.array([np.fromstring(r["text"], sep=" ") for r in rs])
        assert raw.shape == (120, 64) and np.all((raw >= 0) & (raw <= 16))
        return rs, raw / np.linalg.norm(raw, axis=1, keepdims=True)

    results = json.loads((data / "results.json").read_text())
    assert len(results) == 4
    for src in modes:
        refs, a = bank(src, "reference")
        y = np.array([r["label"] for r in refs])
        centers = np.stack([a[y == c].mean(0) for c in labels])
        centers /= np.linalg.norm(centers, axis=1, keepdims=True)
        for dst in modes:
            qs, q = bank(dst, "test")
            if src == dst:
                assert {r["group"] for r in refs}.isdisjoint(r["group"] for r in qs)
            truth = np.array([r["label"] for r in qs])
            value = results[f"{src}_to_{dst}"]
            assert value["classes"] == labels
            assert value["correct"]["raw_centroid"] == sum(
                np.array(labels)[(q @ centers.T).argmax(1)] == truth
            )
            assert value["correct"]["raw_nn"] == sum(y[(q @ a.T).argmax(1)] == truth)
            assert value["total_amount"] == sum(r["amount"] for r in qs)
            assert sum(value["walsh"]["pair_shells"]) == len(q) * (len(q) - 1) // 2
            assert value["walsh"]["max_reconstruction_error"] < 1e-12
            for name in ["native", "powered_fixed", "powered_adjusted"]:
                result = value["ambient"][name]
                assert np.isclose(sum(result["assigned_amount"]), value["total_amount"])
                assert np.isclose(sum(result["assigned_count"]), len(q))
    print(
        "Verified 480 public records, all batch receipts, eight raw baselines and four report balances."
    )


if __name__ == "__main__":
    if not __debug__:
        raise SystemExit("checks require ordinary Python execution")
    check(Path(sys.argv[1]))
