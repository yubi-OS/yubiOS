"""Frozen task axes from 18 anchors, 18 disjoint retrieval notes, 36 fresh queries."""

from pathlib import Path
import json, gzip, itertools, csv
import numpy as np

root = Path.cwd()
rows = lambda p: [json.loads(l) for l in (root / p).read_text().splitlines()]
unit = lambda x: x / np.linalg.norm(x, axis=1, keepdims=True)
getvec = lambda p: unit(np.array(json.loads(gzip.decompress((root / p).read_bytes()))))
x = getvec("vectors.json.gz")[:36]
q = getvec("confirmation-vectors.json.gz")
first = rows("dataset.jsonl")[:36]
new = rows("confirmation.jsonl")
classes = list(dict.fromkeys(r["mechanism"] for r in first))
m = len(classes)
y = np.array([classes.index(r["mechanism"]) for r in first])
truth = np.array([classes.index(r["mechanism"]) for r in new])
a = x[:18]
b = x[18:]
ya = y[:18]
yb = y[18:]
mu = a.mean(0)
axes = unit(np.vstack([a[ya == k].mean(0) - mu for k in range(m)]))
_, _, pcs = np.linalg.svd(a - mu, full_matrices=False)


def coords(dirs):
    return [(v - mu) @ dirs.T for v in (a, b, q)]


def bits(abc):
    upper = np.sort(abc[0], axis=0)[len(a) // 2]
    return [(v > upper).astype(int) for v in abc]


def angle(q, b):
    return np.maximum(0, 1 - unit(q) @ unit(b).T)


def hamm(q, b):
    return (q[:, None, :] != b).sum(2)


def probs(e, y, temp):
    z = np.exp(-(e - e.min(1, keepdims=True)) / temp)
    w = np.column_stack([z[:, y == k].mean(1) for k in range(m)])
    return w / w.sum(1, keepdims=True)


def centroid(q, b, y):
    return -angle(q, np.vstack([b[y == k].mean(0) for k in range(m)]))


def pack(v):
    points = sorted(set(map(tuple, np.round(v, 10))))
    kept = []
    for point in points:
        if all(
            np.linalg.norm(np.subtract(point, other)) >= 0.095 - 1e-12 for other in kept
        ):
            kept.append(point)
    return len(kept)


def chart(abc):
    ref = abc[0]
    avg = ref.mean(0)
    sd = ref.std(0, ddof=1)
    sd[sd == 0] = 1
    standardized = [(v - avg) / sd for v in abc]
    _, _, dirs = np.linalg.svd(standardized[0], full_matrices=False)
    w = [v @ dirs[:2].T for v in standardized]
    radius = np.linalg.norm(w[0], axis=1)
    scales = {"served": 0.9 / max(radius), "rms": 1 / np.sqrt(np.mean(radius**2))}
    g = {}
    for name, scale in scales.items():
        spheres = []
        for plane in w:
            uv = plane * scale
            r2 = np.sum(uv**2, axis=1)
            spheres.append(np.column_stack([2 * uv, r2 - 1]) / (1 + r2[:, None]))
        g[name] = (spheres, scale)
    return g


semantic = coords(axes)
sem_bits = bits(semantic)
pca_bits = bits(coords(pcs[:6]))
E = angle(q, b)
scores = {
    "pca_6bit_gibbs": probs(hamm(pca_bits[2], pca_bits[1]), yb, 0.75),
    "semantic_6bit_gibbs": probs(hamm(sem_bits[2], sem_bits[1]), yb, 0.75),
    "semantic_continuous_gibbs": probs(angle(semantic[2], semantic[1]), yb, 0.05),
    "native_1nn_18": np.column_stack([-E[:, yb == k].min(1) for k in range(m)]),
    "native_centroid_18": centroid(q, b, yb),
    "native_gibbs_18": probs(E, yb, 0.05),
    "native_centroid_36": centroid(q, x, y),
}
globe = {}
for name, (spheres, scale) in chart(sem_bits).items():
    _, sb, sq = spheres
    scores["semantic_" + name + "_sphere"] = probs(angle(sq, sb), yb, 0.20)
    globe[name] = dict(
        scale=float(scale),
        test_packing=pack(sq),
        resultant_length=float(np.linalg.norm(sq.mean(0))),
    )
pred = {
    k: np.isclose(v, v.max(1, keepdims=True), rtol=0, atol=1e-12).argmax(1)
    for k, v in scores.items()
}
stations = list(dict.fromkeys(r["station"] for r in new))
blocks = [
    np.array([i for i, r in enumerate(new) if r["station"] == s]) for s in stations
]
rng = np.random.default_rng(20261123)
shuf = np.tile(truth, (9999, 1))
for bl in blocks:
    shuf[:, bl] = rng.permuted(shuf[:, bl], axis=1)
measures = {}
for k, v in pred.items():
    n = (shuf == v).mean(1)
    obs = (v == truth).mean()
    z = (obs - n.mean()) / n.std(ddof=1)
    measures[k] = dict(
        correct=int((v == truth).sum()),
        per_station=[int((v[bl] == truth[bl]).sum()) for bl in blocks],
        ties=int(
            (
                np.isclose(
                    scores[k], scores[k].max(1, keepdims=True), rtol=0, atol=1e-12
                ).sum(1)
                > 1
            ).sum()
        ),
        label_null_mean=float(n.mean()),
        label_null_sd=float(n.std(ddof=1)),
        label_null_z=float(z),
        label_null_dBc=float(20 * np.log10(abs(z))),
        p_high=float((1 + sum(n >= obs)) / 10000),
    )
primary = "semantic_6bit_gibbs"
baseline = "pca_6bit_gibbs"
a_correct = pred[primary] == truth
b_correct = pred[baseline] == truth
diff = a_correct.astype(int) - b_correct.astype(int)
station_diff = [int(diff[bl].sum()) for bl in blocks]
swaps = [
    np.dot(s, station_diff) for s in itertools.product([-1, 1], repeat=len(blocks))
]
soft = scores[primary].sum(0)
assert abs(soft.sum() - len(q)) < 1e-10
out = dict(
    stations=stations,
    methods=measures,
    chart=globe,
    station_deltas=station_diff,
    paired_two_sided=float(np.mean(np.abs(swaps) >= abs(diff.sum()))),
    gained=int((diff > 0).sum()),
    lost=int((diff < 0).sum()),
    classes=classes,
    allocated_counts=soft.tolist(),
    true_counts=np.bincount(truth).tolist(),
    test_distinct_codes={
        k: len(np.unique(v[2], axis=0))
        for k, v in [("semantic", sem_bits), ("pca", pca_bits)]
    },
)
(root / "confirmation-results.json").write_text(
    json.dumps(out, indent=2, allow_nan=False) + "\n"
)
with (root / "confirmation-predictions.csv").open("w") as f:
    w = csv.writer(f)
    w.writerow(["id", "truth", "station", *pred])
    for i, r in enumerate(new):
        w.writerow(
            [
                r["id"],
                r["mechanism"],
                r["station"],
                *[classes[v[i]] for v in pred.values()],
            ]
        )
np.savez_compressed(
    root / "confirmation-allocations.npz",
    **{k: v for k, v in scores.items() if "gibbs" in k or "sphere" in k},
    test_semantic_bits=sem_bits[2],
    test_pca_bits=pca_bits[2],
    retrieval_semantic_bits=sem_bits[1],
)
print(
    {k: v["correct"] for k, v in measures.items()},
    station_diff,
    out["paired_two_sided"],
    globe,
)
