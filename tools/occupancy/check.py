"""Independent replay of the generic adapter and the stored prediction files."""

import json, gzip, csv
from pathlib import Path
import numpy as np
from occupancy import allocate

root = Path.cwd()


def records(fn):
    return [json.loads(line) for line in (root / fn).read_text().splitlines()]


def vec(fn):
    return json.loads(gzip.decompress((root / fn).read_bytes()))


primary = records("dataset.jsonl")
ref = primary[:36]
x = vec("vectors.json.gz")
c = vec("confirmation-vectors.json.gz")
a = json.loads((root / "ambient-predictions.json").read_text())
order = list(dict.fromkeys(r["mechanism"] for r in ref))
report = {}
for key, q, test in [
    ("first", x[36:], primary[36:]),
    ("fresh", c, records("confirmation.jsonl")),
]:
    labels = [r["mechanism"] for r in test]
    data = dict(
        reference_vectors=x[:36],
        reference_labels=[r["mechanism"] for r in ref],
        query_vectors=q,
    )
    rng = np.random.default_rng(71203)
    null = np.tile(np.array(labels), (9999, 1))
    for station in dict.fromkeys(r["station"] for r in test):
        idx = np.array([i for i, r in enumerate(test) if r["station"] == station])
        null[:, idx] = rng.permuted(null[:, idx], axis=1)
    report[key] = {}
    for mode in ["native", "rms"]:
        s = allocate(data, mode, 0.05, True)
        assert s["predictions"] == [
            order[i] for i in a[key][mode + "_scale_adjusted"]["class_gibbs"]
        ]
        assert abs(sum(s["allocated_amounts"]) - 36) < 1e-10
        pred = np.array(s["predictions"])
        random_acc = (null == pred).mean(1)
        obs = np.mean(pred == labels)
        z = (obs - random_acc.mean()) / random_acc.std(ddof=1)
        byte_lengths = np.array([len(r["text"].encode("utf-8")) for r in test])
        byte_shares = byte_lengths @ np.array(s["probabilities"])
        assert np.isclose(byte_shares.sum(), byte_lengths.sum())
        report[key][mode] = dict(
            total_bytes=int(byte_lengths.sum()),
            byte_shares=byte_shares.tolist(),
            correct=int(sum(pred == labels)),
            z=float(z),
            dBc=float(20 * np.log10(abs(z))),
            p=float((1 + sum(random_acc >= obs)) / 10000),
            mu=float(random_acc.mean()),
            sigma=float(random_acc.std(ddof=1)),
            class_order=s["classes"],
            soft_counts=s["allocated_amounts"],
        )
for file, rfile in [
    ("predictions.csv", "results.json"),
    ("confirmation-predictions.csv", "confirmation-results.json"),
]:
    pred = list(csv.DictReader((root / file).open()))
    r = json.loads((root / rfile).read_text())
    for k, v in r["methods"].items():
        assert sum(row[k] == row["truth"] for row in pred) == v["correct"]
(root / "adapter-check.json").write_text(json.dumps(report, indent=2) + "\n")
print(report)
