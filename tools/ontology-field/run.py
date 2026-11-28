"""Replay the frozen ontology field, its nulls and its optical atlas."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.spatial.distance import pdist

from measure import ladder, measure_state, normalize, project
from pack import sha
from replay import compare_report

DATA = Path(__file__).resolve().parents[2] / "papers/data/ontology-field"


def read_data(data):
    meta = json.loads((data / "inference.json").read_text())
    manifest = data / "definitions.jsonl"
    bank = data / "vectors.npy"
    if (
        meta["model"] != "@cf/baai/bge-m3"
        or sha(bank) != meta["bank_sha256"]
        or sha(manifest) != meta["definitions_sha256"]
    ):
        raise ValueError("manifest, model or bank mismatch")
    rows = [json.loads(line) for line in manifest.read_text().splitlines()]
    raw = np.load(bank, allow_pickle=False)
    ids = [hashlib.sha256(r["text"].encode()).hexdigest() for r in rows]
    if (
        ids != [r["input_sha256"] for r in rows]
        or len(set(ids)) != len(rows)
        or len({r["term"] for r in rows}) != len(rows)
        or raw.shape != (len(rows), 1024)
        or raw.dtype != np.dtype("<f4")
    ):
        raise ValueError("invalid row identity or vector shape")
    start = 0
    for b in meta["batches"]:
        count = b["count"]
        v = raw[start : start + count]
        if (
            count <= 0
            or b["start"] != start
            or b["shape"] != list(v.shape)
            or ids[start : start + count] != b["inputs"]
            or hashlib.sha256(v.tobytes()).hexdigest() != b["float32_sha256"]
        ):
            raise ValueError(f"batch association failed at row {start}")
        start += count
    if start != len(rows):
        raise ValueError("incomplete batch coverage")
    labels = np.array([r["family"] for r in rows])
    split = np.array([r["split"] for r in rows])
    families = np.unique(labels)
    for part in ("field", "reference"):
        if len(families) != 6 or any(
            np.sum((split == part) & (labels == f)) != 8 for f in families
        ):
            raise ValueError("invalid family/split balance")
    if len(rows) != 96:
        raise ValueError("wrong bank size")
    return rows, normalize(raw), labels, split == "reference"


def maps_for_view(view, ref, labels, same, limits, families):
    # Spheres are rendered in longitude and equal-area sin(latitude); primary
    # distances always use unit 3-vectors and are independent of the map seam.
    if view.shape[1] == 3:
        xy = np.column_stack((np.arctan2(view[:, 1], view[:, 0]) / np.pi, view[:, 2]))
    else:
        xy = view
    low, high = -limits, limits
    clipped = (np.abs(xy) > limits).any(axis=1)
    grid = np.clip(np.floor(4 * (xy - low) / (high - low)).astype(int), 0, 3)
    cell = grid[:, 1] * 4 + grid[:, 0]
    left, right = np.triu_indices(np.sum(~ref), 1)
    field_cells = cell[~ref]
    pairs = np.equal(field_cells[left], field_cells[right])
    table = []
    for k in range(16):
        mask = pairs & (field_cells[left] == k)
        vals = same[:, mask].sum(axis=1)
        sigma = vals[1:].std(ddof=1)
        table.append(
            dict(
                count=int(np.sum(field_cells == k)),
                families=[
                    int(np.sum((field_cells == k) & (labels[~ref] == f)))
                    for f in families
                ],
                same_family_pairs=int(vals[0]),
                null_mean=float(vals[1:].mean()),
                z=float((vals[0] - vals[1:].mean()) / sigma) if sigma > 0 else None,
            )
        )
    return dict(
        limits=limits.tolist(),
        xy=xy.tolist(),
        cells=table,
        edge_clipped=int(np.sum(clipped[~ref])),
    )


def evaluate(data):
    rows, x, labels, ref = read_data(data)
    charts, pcs, scale, retained = project(x, ref)
    threshold = np.median(pcs["native"][ref], axis=0)
    counts, d = ladder((pcs["native"][ref] > threshold).astype(int))
    if not d:
        raise ValueError("native reference frame has no stable first bit")
    sizes = np.array([len(r["text"].encode()) for r in rows])
    families = np.unique(labels)
    report = dict(
        families=families.tolist(),
        reference=ref.sum().item(),
        field=(~ref).sum().item(),
        bytes=int(sizes[~ref].sum()),
        power=float(scale),
        pc_variance=retained.tolist(),
        focal_bits=d,
        prefix_ladder=counts,
        rows=[r["term"] for r in rows],
        states={},
    )
    eps = float(np.median(pdist(x[ref])))
    fields = {}
    for state in charts:
        bits = (pcs[state] > threshold).astype(int)
        info, fields[state] = measure_state(
            state,
            charts[state],
            pcs[state],
            pcs["native"],
            x,
            ref,
            labels,
            sizes,
            bits,
            d,
            eps,
        )
        report["states"][state] = info
    rng = np.random.default_rng(340)
    y = labels[~ref]
    field_labels = np.vstack([y] + [rng.permutation(y) for _ in range(999)])
    left, right = np.triu_indices(len(y), 1)
    same = field_labels[:, left] == field_labels[:, right]
    weights = (~same) / np.sum(~same, axis=1)[:, None] - same / same.sum(axis=1)[
        :, None
    ]
    contrasts, keys = [], []
    for view in fields["native"]:
        limits = np.ones(2)
        if fields["native"][view].shape[1] == 2:
            limits = 1.05 * np.max(
                np.abs(np.vstack([v[view][ref] for v in fields.values()])), axis=0
            )
        for state, views in fields.items():
            points = views[view]
            panel = maps_for_view(points, ref, labels, same, limits, families)
            report["states"][state].setdefault("views", {})[view] = panel
            contrasts.append(weights @ pdist(points[~ref], "sqeuclidean"))
            keys.append((state, view))
    delta = np.array(contrasts)
    # Symmetric standardization over the identity and all permuted labelings.
    sd = delta.std(axis=1, ddof=1)
    if np.any(sd < 1e-12):
        raise ValueError("degenerate primary null")
    z = (delta - delta.mean(axis=1)[:, None]) / sd[:, None]
    maximum = z.max(axis=0)
    for (state, view), diff, score in zip(keys, delta, z):
        report["states"][state]["views"][view]["association"] = dict(
            gap=float(diff[0]),
            z=float(score[0]),
            p_max=float(np.mean(maximum >= score[0] - 1e-12)),
        )
    # Supplementary ambient measurement and point-map crosswalk, added after protocol.
    report["ambient_gap"] = {
        state: float(weights[0] @ pdist(bank[~ref], "sqeuclidean"))
        for state, bank in charts.items()
    }
    payload = {
        "reference": x[ref].tolist(),
        **{k: v[~ref].tolist() for k, v in charts.items()},
    }
    node = subprocess.run(
        ["node", Path(__file__).with_name("pointmap.mjs")],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
    )
    if node.returncode:
        raise RuntimeError(node.stderr)
    report["point_map"] = json.loads(node.stdout)
    return report, labels, ref


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", type=Path, default=DATA)
    p.add_argument("--output", type=Path)
    p.add_argument("--check", type=Path)
    p.add_argument("--atlas", type=Path)
    args = p.parse_args()
    result, labels, ref = evaluate(args.data)
    if args.check:
        compare_report(result, json.loads(args.check.read_text()))
        print(
            "Verified all eight views, class amounts, optical cells and both geometry-null seeds."
        )
    if args.output:
        args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    if args.atlas:
        from render import atlas, globes

        atlas(result, labels, ref, args.atlas)
        globes(result, labels, ref, args.atlas.with_name("spheres.png"))
