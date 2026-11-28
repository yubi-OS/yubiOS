"""Reference-frozen geometry and field-level measures for the five-paper replay."""

from pathlib import Path
import sys

import numpy as np
from scipy.spatial.distance import pdist

TOOLS = Path(__file__).resolve().parents[1]
sys.path[:0] = [
    str(TOOLS / p)
    for p in ("corpus-auditor", "spectral-decomposer", "occupancy", "phonon-dispersion")
]
from auditor import curveball, v2_corr
from occupancy import allocate, normalize
from phonon import walsh_hadamard
from spectral_decomposer import real_sh_matrix, shares_from_points


def project(x, ref):
    a = x[ref]
    mu = a.mean(axis=0)
    pole = normalize(mu[None])[0]
    h = (x @ pole)[:, None]
    if np.any(1 + h < 1e-12):
        raise ValueError("antipodal projection")
    plane = (x - h * pole) / (1 + h)
    scale = 1 / np.sqrt(np.mean(np.sum(plane[ref] ** 2, axis=1)))
    w = scale * plane
    r2 = np.sum(w * w, axis=1, keepdims=True)
    powered = (2 * w + (1 - r2) * pole) / (1 + r2)
    np.testing.assert_allclose(np.linalg.norm(powered, axis=1), 1, atol=1e-12)
    _, s, vt = np.linalg.svd(a - mu, full_matrices=False)
    axes = vt[:6].copy()
    axes *= np.sign(axes[np.arange(6), np.abs(axes).argmax(1)])[:, None]
    charts = {"native": x, "powered": powered}
    pcs = {k: (v - mu) @ axes.T for k, v in charts.items()}
    return charts, pcs, scale, (s**2 / (s @ s))[:6]


def centers(v, eps):
    kept = []
    for i, row in enumerate(v):
        if not kept or np.all(np.linalg.norm(v[kept] - row, axis=1) >= eps):
            kept.append(i)
    return kept


def code(bits):
    return bits @ (2 ** np.arange(bits.shape[1]))


def ladder(bits):
    counts = [1] + [
        len(np.unique(code(bits[:, :d]))) for d in range(1, bits.shape[1] + 1)
    ]
    gains = np.diff(np.log2(counts))
    d = next((i for i, g in enumerate(gains) if g < 0.5), len(gains))
    return counts, d


def stats(bits, d):
    counts = np.bincount(code(bits[:, :d]), minlength=2**d)
    live = np.sum(bits.std(0) > 1e-12)
    return [
        float(v2_corr(bits)) if live >= 2 else np.nan,
        int(counts @ (counts - 1) // 2),
    ]


def null_summary(obs, draws):
    draws = np.asarray(draws, dtype=float)
    if not np.isfinite(obs) or not np.isfinite(draws).all():
        return dict(
            observed=None if not np.isfinite(obs) else obs, status="undefined statistic"
        )
    sd = float(draws.std(ddof=1))
    z = float((obs - draws.mean()) / sd) if sd > 1e-12 else None
    return dict(
        observed=obs,
        mean=float(draws.mean()),
        sd=sd,
        z=z,
        dBc=float(20 * np.log10(abs(z))) if z is not None and abs(z) > 0 else None,
        p_upper=(1 + int(np.sum(draws >= obs))) / (1 + len(draws))
        if z is not None
        else None,
    )


def geometry_null(bits, d):
    result = {}
    observed = stats(bits, d)
    for seed in (340, 341):
        rng = np.random.default_rng(seed)
        draws = []
        for _ in range(99):
            v = curveball(bits, 20 * len(bits), rng)
            for axis in (0, 1):
                np.testing.assert_array_equal(v.sum(axis), bits.sum(axis))
            draws.append(stats(v, d))
        result[str(seed)] = {
            name: null_summary(obs, values)
            for name, obs, values in zip(
                ("six_axis_v2", "prefix_collisions"), observed, np.array(draws).T
            )
        }
    return result


def composition(group, family, families):
    return {
        str(key): [int(np.sum((group == key) & (family == f))) for f in families]
        for key in np.unique(group)
    }


def signed_degrees(bits, labels, ref, d):
    modes = np.array([i.bit_count() for i in range(2**d)])
    ix = code(bits[:, :d])
    output = {}
    for family in np.unique(labels):
        coeff = []
        for part in (ref, ~ref):
            mask = part & (labels == family)
            hist = np.bincount(ix[mask], minlength=2**d) / mask.sum()
            coeff.append(np.array(walsh_hadamard(hist)))
        product = coeff[0] * coeff[1] / 2**d
        output[family] = [float(product[modes == j].sum()) for j in range(d + 1)]
        direct = sum(
            np.mean(ix[ref & (labels == family)] == k)
            * np.mean(ix[~ref & (labels == family)] == k)
            for k in np.unique(ix)
        )
        np.testing.assert_allclose(product.sum(), direct, atol=1e-12)
    return output


def curve(pc, sphere, ref):
    t = pc[:, 0]
    lo, hi = t[ref].min(), t[ref].max()
    raw = (t - lo) / (hi - lo)
    u = np.pi * np.clip(raw, 0, 1)
    directions = np.column_stack(
        (np.sin(u) * np.cos(2 * u), np.sin(u) * np.sin(2 * u), np.cos(u))
    )
    design = real_sh_matrix(directions, 3)
    a = design[ref]
    beta = np.linalg.solve(a.T @ a + 0.001 * np.eye(a.shape[1]), a.T @ sphere[ref])
    residual = np.linalg.norm(normalize(design[~ref] @ beta) - sphere[~ref], axis=1)
    return dict(
        mean_chord=float(residual.mean()),
        median_chord=float(np.median(residual)),
        clipped=int(np.sum((raw[~ref] < 0) | (raw[~ref] > 1))),
    )


def measure_state(
    name, ambient, pc, native_pc, x, ref, labels, sizes, bits, d, native_eps
):
    a, q = ambient[ref], ambient[~ref]
    own_eps = float(np.median(pdist(a)))
    families = np.unique(labels)
    args = dict(
        reference_vectors=x[ref],
        query_vectors=x[~ref],
        reference_labels=labels[ref],
        query_amounts=sizes[~ref],
    )
    alloc = allocate(args, "native" if name == "native" else "rms")
    prob = np.asarray(alloc["probabilities"])
    np.testing.assert_allclose(prob.sum(1), 1, atol=1e-12)
    np.testing.assert_allclose(
        sum(alloc["allocated_amounts"]), sizes[~ref].sum(), atol=1e-8
    )
    report = dict(
        reference_chord=own_eps,
        pack_native_chord=len(centers(q, native_eps)),
        pack_own_chord=len(centers(q, own_eps)),
        pair_fraction_below_own=float(np.mean(pdist(q) < own_eps)),
        class_counts=prob.sum(0).tolist(),
        class_bytes=alloc["allocated_amounts"],
        temperature=alloc["effective_temperature"],
        geometry_null=geometry_null(bits[~ref], d),
        prefix_classes=composition(code(bits[~ref, :d]), labels[~ref], families),
        bit_classes=composition(code(bits[~ref]), labels[~ref], families),
        walsh_alignment=signed_degrees(bits, labels, ref, d),
    )
    sphere_info = {}
    views = {"PC1-2 plane": pc[:, :2], "PC3-4 plane": pc[:, 2:4]}
    for label, cols in (("PC1-3 sphere", slice(0, 3)), ("PC4-6 sphere", slice(3, 6))):
        triple = pc[:, cols]
        v = normalize(triple)
        views[label] = v
        shares, _ = shares_from_points(v[~ref], 3)
        info = dict(
            power_share=shares,
            heat_t01={
                j: s * np.exp(-0.2 * int(j) * (int(j) + 1)) for j, s in shares.items()
            },
            field_radius_range=[
                float(t)
                for t in (
                    np.linalg.norm(triple[~ref], axis=1).min(),
                    np.linalg.norm(triple[~ref], axis=1).max(),
                )
            ],
        )
        # An empirical analogue of lensed_sphere_class: retain references in fixed order.
        # Uncovered field directions keep a separate class, even at sparse coverage.
        prototypes = centers(v[ref], 0.095)
        dist = np.linalg.norm(v[~ref, None, :] - v[ref][prototypes], axis=2)
        cluster = np.where(
            dist.min(1) < 0.095, np.asarray(prototypes)[dist.argmin(1)], -1
        )
        info["reference_center_count"] = len(prototypes)
        info["sphere_classes"] = composition(cluster, labels[~ref], families)
        sphere_info[label] = info
    report["spheres"] = sphere_info
    report["curve"] = curve(native_pc, views["PC1-3 sphere"], ref)
    return report, views
