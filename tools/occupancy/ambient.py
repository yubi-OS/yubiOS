"""Exploratory extension of the paper's planar dilation to the full embedding sphere."""

import json, gzip, itertools
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr

r = Path.cwd()


def load(name):
    x = np.array(json.loads(gzip.decompress((r / name).read_bytes())))
    return x / np.linalg.norm(x, axis=1, keepdims=True)


def rows(name):
    return [json.loads(x) for x in (r / name).read_text().splitlines()]


x = load("vectors.json.gz")
c = load("confirmation-vectors.json.gz")
notes = rows("dataset.jsonl")
conf = rows("confirmation.jsonl")
a = x[:36]
classes = list(dict.fromkeys(v["mechanism"] for v in notes))
y = np.array([classes.index(v["mechanism"]) for v in notes[:36]])
pole = a.mean(0)
pole /= np.linalg.norm(pole)


def plane(vec):
    h = (vec @ pole)[:, None]
    return (vec - h * pole) / (1 + h)


w = plane(a)
multiplier = float(1 / np.sqrt(np.mean(np.sum(w * w, axis=1))))


def lens(vec, s):
    v = plane(vec) * s
    r2 = np.sum(v * v, axis=1, keepdims=True)
    return (2 * v + (1 - r2) * pole) / (1 + r2)


def energy(a, b):
    return np.maximum(0, 1 - a @ b.T)


def pack(vec, eps):
    # Deterministic lower bound, in fixed dataset order on both charts.
    kept = []
    for row in vec:
        if all(np.linalg.norm(row - v) >= eps for v in kept):
            kept.append(row)
    return len(kept)


def score(q, ref, t):
    e = energy(q, ref)
    w = np.exp(-(e - e.min(1, keepdims=True)) / t)
    means = np.column_stack([w[:, y == k].mean(1) for k in range(6)])
    centers = np.vstack([ref[y == k].mean(0) for k in range(6)])
    ce = energy(q, centers / np.linalg.norm(centers, axis=1, keepdims=True))
    cp = np.exp(-(ce - ce.min(1, keepdims=True)) / t)
    return dict(
        nn=np.column_stack([-e[:, y == k].min(1) for k in range(6)]),
        class_gibbs=means / means.sum(1, keepdims=True),
        centroid_gibbs=cp / cp.sum(1, keepdims=True),
    )


ii = np.triu_indices(36, 1)
ref_e = float(np.median(energy(a, a)[ii]))
eps = float(np.sqrt(2 * ref_e))
out = dict(
    ambient_dimension=a.shape[1],
    sphere_dimension=a.shape[1] - 1,
    power=multiplier,
    reference_median_chord=eps,
    identity_max_error=float(np.max(abs(lens(x, 1) - x))),
    squared_norm_error=float(np.max(abs(np.sum(lens(x, multiplier) ** 2, 1) - 1))),
    inverse_max_error=float(np.max(abs(lens(lens(x, multiplier), 1 / multiplier) - x))),
)
# Construct a right spherical triangle at the reference pole. Use the observed
# leg lengths and Gram-Schmidt the second tangent direction.
ends = x[36:38]
angles = np.arccos(np.clip(ends @ pole, -1, 1))
tangents = ends - (ends @ pole)[:, None] * pole
first = tangents[0] / np.linalg.norm(tangents[0])
second = tangents[1] - (tangents[1] @ first) * first
second /= np.linalg.norm(second)
other = np.cos(angles[1]) * pole + np.sin(angles[1]) * second
opposite = np.arccos(np.clip(ends[0] @ other, -1, 1))
deficit = angles @ angles - opposite**2
assert abs(np.cos(opposite) - np.prod(np.cos(angles))) < 1e-12
assert abs(deficit - 0.1677173272) < 1e-8
out["right_triangle_control"] = dict(
    legs=angles.tolist(), opposite=float(opposite), squared_arc_deficit=float(deficit)
)
allpred = {}
for key, q, items in [("first", x[36:], notes[36:]), ("fresh", c, conf)]:
    truth = np.array([classes.index(v["mechanism"]) for v in items])
    groups = np.array([v["station"] for v in items])
    cohort = {}
    allpred[key] = {}
    for mode, s in [("native", 1), ("rms", multiplier)]:
        ar = lens(a, s)
        qr = lens(q, s)
        factor = float(np.median(energy(ar, ar)[ii]) / ref_e)
        res = dict(
            mean_resultant=float(np.linalg.norm(qr.mean(0))),
            pair_distance_spearman=float(
                spearmanr(energy(q, q)[ii], energy(qr, qr)[ii]).statistic
            ),
            packed_at_0095=pack(qr, 0.095),
            packed_at_reference_chord=pack(qr, eps),
            relative_reference_energy_scale=factor,
        )
        for thermal, t in [("fixed", 0.05), ("scale_adjusted", 0.05 * factor)]:
            scores = score(qr, ar, t)
            res[thermal] = {
                k: int(sum(v.argmax(1) == truth)) for k, v in scores.items()
            }
            res[thermal]["centroid_allocations"] = (
                scores["centroid_gibbs"].sum(0).tolist()
            )
            allpred[key][mode + "_" + thermal] = {
                k: v.argmax(1).tolist() for k, v in scores.items()
            }
        cohort[mode] = res
    diff = (
        np.array(allpred[key]["rms_scale_adjusted"]["class_gibbs"]) == truth
    ).astype(int) - (
        np.array(allpred[key]["native_scale_adjusted"]["class_gibbs"]) == truth
    ).astype(int)
    ds = [int(diff[groups == g].sum()) for g in dict.fromkeys(groups)]
    cohort["paired_rms_adjusted_vs_native_gibbs"] = dict(
        station_deltas=ds,
        p_two_sided=float(
            np.mean(
                [
                    abs(np.dot(ds, z)) >= abs(sum(ds))
                    for z in itertools.product((-1, 1), repeat=6)
                ]
            )
        ),
    )
    out[key] = cohort
(r / "ambient-results.json").write_text(
    json.dumps(out, indent=2, allow_nan=False) + "\n"
)
(r / "ambient-predictions.json").write_text(json.dumps(allpred))
print(
    {
        k: {
            m: [
                out[k][m]["mean_resultant"],
                out[k][m]["packed_at_reference_chord"],
                {h: out[k][m][h]["class_gibbs"] for h in ["fixed", "scale_adjusted"]},
                out[k][m]["fixed"]["nn"],
                out[k][m]["fixed"]["centroid_gibbs"],
            ]
            for m in ["native", "rms"]
        }
        for k in ["first", "fresh"]
    }
)
print(out["power"], out["reference_median_chord"])
