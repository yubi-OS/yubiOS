"""Recompute recognition, geometry, conservation, and null tests from saved embeddings and maps."""

import csv
import gzip
import importlib.util
import itertools
import json
import sys
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

ROOT = Path.cwd()
repo = Path(sys.argv[1]).resolve()


def load_module(name, rel):
    spec = importlib.util.spec_from_file_location(name, repo / rel)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


meter = load_module("sonometer", "tools/corpus-sonometer/sonometer.py")
collapse = load_module("collapse", "tools/boltzmann-collapse/collapse.py")
rows = [json.loads(line) for line in (ROOT / "dataset.jsonl").read_text().splitlines()]
ref, test = (
    [row for row in rows if row["split"] == key] for key in ("reference", "test")
)
classes = list(dict.fromkeys(row["mechanism"] for row in ref))
labels = np.array([classes.index(row["mechanism"]) for row in ref])
target = np.array([classes.index(row["mechanism"]) for row in test])
groups = list(dict.fromkeys(row["station"] for row in test))
blocks = [
    np.array([j for j, row in enumerate(test) if row["station"] == g]) for g in groups
]
rng = np.random.default_rng(20261122)
null_labels = np.tile(target, (9999, 1))
for block in blocks:
    null_labels[:, block] = rng.permuted(null_labels[:, block], axis=1)


def unit(x):
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    assert np.all(norms > 1e-12)
    return x / norms


def cos_energy(a, b):
    return np.maximum(1 - unit(a) @ unit(b).T, 0)


def class_mean(values, y):
    return np.column_stack([values[:, y == k].mean(1) for k in range(len(classes))])


def gibbs(energy, temp, y=labels):
    w = np.exp(-(energy - energy.min(1, keepdims=True)) / temp)
    z = class_mean(w, y)
    return z / z.sum(axis=1, keepdims=True)


def nearest(e):
    return np.column_stack([-e[:, labels == k].min(1) for k in range(len(classes))])


def top(s):
    # Values equal to within arithmetic roundoff count as ties.
    return np.argmax(np.isclose(s, s.max(1, keepdims=True), rtol=0, atol=1e-12), axis=1)


def null_summary(x, null):
    mu = float(np.mean(null))
    sd = float(np.std(null, ddof=1))
    delta = float(x - mu)
    return dict(
        observed=float(x),
        mean=mu,
        sd=sd,
        delta=delta,
        z=delta / sd if sd else None,
        dBc=meter.level_db(delta, sd) if sd and delta else None,
        p_high=float((1 + np.sum(null >= x)) / (len(null) + 1)),
    )


scores = {}
probabilities = {}


def add(name, s, prob=False):
    scores[name] = s
    if prob:
        probabilities[name] = s


vec = unit(
    np.array(json.loads(gzip.decompress((ROOT / "vectors.json.gz").read_bytes())))
)
a = vec[[r["split"] == "reference" for r in rows]]
b = vec[[r["split"] == "test" for r in rows]]
e = cos_energy(b, a)
add("native_1nn", nearest(e))
centroids = np.vstack([a[labels == i].mean(0) for i in range(len(classes))])
add("native_centroid", -cos_energy(b, centroids))
add("native_gibbs", gibbs(e, 0.05), True)
mu = a.mean(axis=0)
ac = a - mu
bc = b - mu
add("centered_gibbs", gibbs(cos_energy(bc, ac), 0.05), True)
station = np.array([r["station"] for r in ref])
means = np.vstack([ac[station == s].mean(0) for s in dict.fromkeys(station)])
_, sv, vh = np.linalg.svd(means, full_matrices=False)
basis = vh[sv > sv[0] * 1e-10]
a_clean = ac - (ac @ basis.T) @ basis
b_clean = bc - (bc @ basis.T) @ basis
clean_energy = cos_energy(b_clean, a_clean)
add("station_removed_1nn", nearest(clean_energy))
primary = "station_removed_gibbs"
p = gibbs(clean_energy, 0.05)
add(primary, p, True)
# Replicate each reference in the offset class eight times, leaving all other classes untouched.
idx = np.repeat(np.arange(len(labels)), np.where(labels == 0, 8, 1))
density_error = float(
    np.max(np.abs(p - gibbs(clean_energy[:, idx], 0.05, labels[idx])))
)
weighted = p * np.array([8] + [1] * (len(classes) - 1))
raw_mult = weighted / weighted.sum(1, keepdims=True)

maps = json.loads((ROOT / "maps.json").read_text())
charts = json.loads((ROOT / "charts.json").read_text())
d = maps["trial"]["focal"]["n_star"]
codes = np.array(maps["probeBits"])[:, :d]
query_codes = np.array(maps["probeTestBits"])[:, :d]
dis = (query_codes[:, None, :] != codes[None, :, :]).sum(2)
shell = gibbs(dis, 0.75)
add("focal_hamming_gibbs", shell, True)
hist = np.array(
    [
        [
            [int(np.sum(dis[i, labels == k] == h)) for h in range(d + 1)]
            for k in range(len(classes))
        ]
        for i in range(len(test))
    ]
)
kernel = np.exp(-np.arange(d + 1) / 0.75)
z = (hist @ kernel) / np.bincount(labels)
assert np.allclose(z / z.sum(1, keepdims=True), shell, atol=1e-13)
ideal = collapse.pi_T(np.arange(d + 1), d, 0.75)
gold = collapse.brute_force_chain(np.arange(d + 1, dtype=float), d, 0.75)
globe = {}
for name in ("served", "rms"):
    pos = lambda side: np.array(
        maps[side]["points"] if name == "served" else charts[side]["powered"]
    )
    ra, rb = pos("ref"), pos("test")
    sphere_e = cos_energy(rb, ra)
    add(name + "_sphere_gibbs", gibbs(sphere_e, 0.2), True)
    add(name + "_sphere_1nn", nearest(sphere_e))
    ii = np.triu_indices(len(test), 1)
    globe[name] = dict(
        held_out_packing=charts["test"][name]["count"],
        reference_packing=charts["ref"][name]["count"],
        held_out_distinct_positions=charts["test"][name]["distinct"],
        test_resultant_length=float(np.linalg.norm(rb.mean(0))),
        test_distance_rank_correlation_with_native=float(
            spearmanr(cos_energy(rb, rb)[ii], cos_energy(b, b)[ii]).statistic
        ),
    )
methods = {}
decisions = {
    "id": [r["id"] for r in test],
    "truth": [r["mechanism"] for r in test],
    "station": [r["station"] for r in test],
}
for name, s in scores.items():
    pred = top(s)
    correct = pred == target
    null = (null_labels == pred).mean(1)
    methods[name] = dict(
        correct=int(correct.sum()),
        n=len(test),
        by_station=[int(correct[bl].sum()) for bl in blocks],
        by_class=[int(correct[target == k].sum()) for k in range(len(classes))],
        ties=int(
            (
                np.isclose(s, s.max(1, keepdims=True), rtol=0, atol=1e-12).sum(1) > 1
            ).sum()
        ),
        label_null=null_summary(correct.mean(), null),
    )
    decisions[name] = [classes[i] for i in pred]
    if name in probabilities:
        methods[name]["allocated_counts"] = s.sum(0).tolist()
        methods[name]["log_loss"] = float(
            -np.log(s[np.arange(len(test)), target]).mean()
        )
        assert np.allclose(s.sum(1), 1)
with (ROOT / "predictions.csv").open("w") as fh:
    writer = csv.writer(fh)
    writer.writerow(decisions)
    writer.writerows(zip(*decisions.values()))
base_correct = top(scores["native_1nn"]) == target
new_correct = top(scores[primary]) == target
delta = new_correct.astype(int) - base_correct.astype(int)
effects = np.array([delta[bl].sum() for bl in blocks])
swap = np.array(
    [np.dot(signs, effects) for signs in itertools.product((-1, 1), repeat=len(blocks))]
)
paired = dict(
    gained=int((delta > 0).sum()),
    lost=int((delta < 0).sum()),
    difference=int(delta.sum()),
    by_station=effects.tolist(),
    p_two_sided=float(np.mean(abs(swap) >= abs(effects.sum()))),
    randomizations=len(swap),
)
# Independent held-out V2 measurement. Fixed focal dimension selected on reference; true prefix of frozen probe.
structure = []
v2 = meter.v2_corr(query_codes)
for seed, window in [(20261122, 20), (20261123, 40)]:
    gen = np.random.default_rng(seed)
    draws = np.array(
        [
            meter.v2_corr(meter.curveball(query_codes, len(test) * window, gen))
            for _ in range(199)
        ]
    )
    s = null_summary(v2, draws)
    s.update(
        seed=seed,
        trades_per_row=window,
        draws=len(draws),
        p_two_sided=min(
            1, 2 * min(s["p_high"], float((1 + sum(draws <= v2)) / (len(draws) + 1)))
        ),
    )
    structure.append(s)
out = dict(
    model="@cf/baai/bge-m3",
    pooling="cls",
    shape=list(vec.shape),
    classes=classes,
    test_stations=groups,
    ref_station_direction_rank=len(basis),
    methods=methods,
    paired_primary=paired,
    charts=globe,
    held_out_v2=structure,
    class_replication=dict(
        class_name=classes[0],
        factor=8,
        normalized_max_probability_change=density_error,
        unnormalized_predictions_changed=int((top(raw_mult) != top(p)).sum()),
        unnormalized_accuracy=float(np.mean(top(raw_mult) == target)),
    ),
    example=dict(
        id=test[0]["id"],
        truth=test[0]["mechanism"],
        hamming_shell_counts_by_class=hist[0].tolist(),
        p_shell=shell[0].tolist(),
        p_primary=p[0].tolist(),
    ),
    full_cube_control=dict(
        d=d,
        T=0.75,
        ideal_shell_probabilities=ideal.tolist(),
        kernel_stationary_max_error=gold["max_abs_err"],
    ),
)
(ROOT / "results.json").write_text(json.dumps(out, indent=2, allow_nan=False) + "\n")
np.savez_compressed(ROOT / "allocations.npz", **probabilities, shell_histogram=hist)
print({k: (m["correct"], m["ties"]) for k, m in methods.items()})
print(paired, structure, globe, out["class_replication"])
