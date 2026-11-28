"""Frozen geometry, held-out recognition and amount accounting for a pair of banks."""

import itertools
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from scipy.spatial.distance import pdist, squareform
from scipy.stats import binomtest

HERE = Path(__file__).resolve().parent
for name in [
    "occupancy",
    "spectral-decomposer",
    "phonon-dispersion",
    "boltzmann-collapse",
]:
    sys.path.insert(0, str(HERE.parent / name))
from occupancy import allocate, normalize
from spectral_decomposer import curveball, real_sh_matrix, shares_from_points, v2_corr
from phonon import walsh_hadamard, krawtchouk
from collapse import pi_T

SEED = 20261126


def greedy(points, eps):
    dist = squareform(pdist(points))
    kept = []
    for i in range(len(points)):
        if np.all(dist[i, kept] >= eps):
            kept.append(i)
    return len(kept)


def lens(a, q, s):
    pole = normalize(a.mean(axis=0, keepdims=True))[0]
    h = q @ pole
    plane = s * (q - h[:, None] * pole) / (1 + h[:, None])
    u = np.sum(plane**2, axis=1, keepdims=True)
    return (2 * plane + (1 - u) * pole) / (1 + u)


def label_null(labels, groups):
    rng = np.random.default_rng(SEED)
    perms = np.tile(labels, (1000, 1))
    for group in np.unique(groups):
        ix = np.flatnonzero(groups == group)
        perms[1:, ix] = rng.permuted(perms[1:, ix], axis=1)
    return perms


def winner(scores):
    maxima = scores.max(axis=1, keepdims=True)
    return np.isclose(scores, maxima, atol=1e-12, rtol=0).argmax(axis=1)


def baseline(a, q, labels, classes):
    a, q = normalize(a), normalize(q)
    centers = normalize(np.array([a[labels == c].mean(0) for c in classes]))
    return (q @ centers.T).argmax(1), labels[(q @ a.T).argmax(1)]


def paired(before, after, groups):
    delta = after.astype(int) - before.astype(int)
    result = dict(gained=int(sum(delta == 1)), lost=int(sum(delta == -1)))
    unique = np.unique(groups)
    if 1 < len(unique) <= 16:
        by_group = [int(delta[groups == g].sum()) for g in unique]
        result["unit"] = "held-out speaker"
        result["group_deltas"] = by_group
        result["p_two_sided"] = np.mean(
            [
                abs(np.dot(s, by_group)) >= abs(sum(by_group))
                for s in itertools.product((-1, 1), repeat=len(unique))
            ]
        )
    else:
        discordant = result["gained"] + result["lost"]
        result["unit"] = "observation; writer IDs unavailable"
        result["p_two_sided"] = (
            binomtest(result["gained"], discordant).pvalue if discordant else 1.0
        )
    return result


def ambient(a, q, y, truth, groups, amounts, perms):
    data = dict(
        reference_vectors=a, reference_labels=y, query_vectors=q, query_amounts=amounts
    )
    report, allp, decisions = {}, {}, {}
    eps = np.median(pdist(a))
    for name, power, adjusted in [
        ("native", "native", False),
        ("powered_fixed", "rms", False),
        ("powered_adjusted", "rms", True),
    ]:
        output = allocate(data, power, 0.05, adjusted)
        p = np.array(output["probabilities"])
        pred = np.array(output["predictions"])
        shares = np.array(output["allocated_amounts"])
        if not (
            np.allclose(p.sum(1), 1)
            and np.isclose(shares.sum(), amounts.sum())
            and np.allclose(shares, amounts @ p)
        ):
            raise ValueError("amount conservation failed")
        points = lens(a, q, output["power"]) if power == "rms" else q
        if not np.allclose(np.linalg.norm(points, axis=1), 1):
            raise ValueError("ambient sphere lift failed")
        correct = int(sum(pred == truth))
        report[name] = dict(
            correct=correct,
            p_label=float(np.mean((perms == pred).sum(1) >= correct)),
            packing_median_chord=greedy(points, eps),
            packing_0095=greedy(points, 0.095),
            mean_resultant=float(np.linalg.norm(points.mean(0))),
            scale=output["power"],
            temperature=output["effective_temperature"],
            assigned_count=p.sum(0).tolist(),
            assigned_amount=shares.tolist(),
            amount_per_assigned=(shares / p.sum(0)).tolist(),
        )
        decisions[name], allp[name] = pred, p
    report["paired"] = paired(
        decisions["native"] == truth, decisions["powered_adjusted"] == truth, groups
    )
    report["reference_median_chord"] = eps
    return report, decisions, allp["powered_adjusted"]


def curve(a, q, ref, test):
    # Paper I: fit the spherical harmonic ridge curve on reference points.
    centered = a - a.mean(0)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    v = vt[0].copy()
    v *= np.sign(v[np.argmax(abs(v))])
    t = centered @ v
    tq = ((q - a.mean(0)) @ v - t.min()) / np.ptp(t)

    def basis(u):
        theta, phi = np.pi * u, 2 * np.pi * u
        return real_sh_matrix(
            np.column_stack(
                (
                    np.sin(theta) * np.cos(phi),
                    np.sin(theta) * np.sin(phi),
                    np.cos(theta),
                )
            ),
            3,
        )

    phi = basis((t - t.min()) / np.ptp(t))
    coeff = np.linalg.solve(phi.T @ phi + 0.001 * np.eye(phi.shape[1]), phi.T @ ref)
    estimated = normalize(basis(np.clip(tq, 0, 1)) @ coeff)
    residual = np.linalg.norm(estimated - test, axis=1)
    return dict(
        mean_chord=float(residual.mean()),
        median_chord=float(np.median(residual)),
        clipped_queries=int(sum((tq < 0) | (tq > 1))),
        ridge=0.001,
    )


def gap(bits):
    active = bits[:, bits.std(0) > 0]
    if active.shape[1] < 3:
        return None
    g = np.diff(np.linalg.eigvalsh(np.corrcoef(active.T)))
    g[g < 1e-10] = 0
    mx = np.maximum(g[:-1], g[1:])
    valid = mx > 0
    return (
        float(np.mean(np.minimum(g[:-1], g[1:])[valid] / mx[valid]))
        if any(valid)
        else None
    )


def organization(bits):
    d = bits.shape[1]

    def stats(x):
        h = np.bincount(x @ (2 ** np.arange(d)), minlength=2**d)
        return dict(
            collisions=int(h @ (h - 1) // 2), v2=float(v2_corr(x)), gap_ratio=gap(x)
        )

    obs = stats(bits)
    rng = np.random.default_rng(SEED)
    draws = []
    for _ in range(99):
        x = curveball(bits, 20 * len(bits), rng)
        if not (
            np.array_equal(x.sum(0), bits.sum(0))
            and np.array_equal(x.sum(1), bits.sum(1))
        ):
            raise ValueError("fixed margins changed")
        draws.append(stats(x))
    result = {}
    for name, value in obs.items():
        vals = [v[name] for v in draws if v[name] is not None and np.isfinite(v[name])]
        if value is None or not np.isfinite(value) or not vals:
            result[name] = None
            continue
        vals = np.asarray(vals)
        sd = vals.std(ddof=1) if len(vals) > 1 else 0
        z = float((value - vals.mean()) / sd) if sd > 1e-12 else None
        result[name] = dict(
            observed=value,
            mean=vals.mean(),
            sd=sd,
            z=z,
            dBc=None if z is None or z == 0 else 20 * np.log10(abs(z)),
            p_high=(1 + np.sum(vals >= value - 1e-12)) / (len(vals) + 1),
            central95=np.quantile(vals, [0.025, 0.975]).tolist(),
            draws=len(vals),
        )
    return result


def walsh(a, b, y, truth, perms, nclasses):
    d = b.shape[1]
    masks = np.arange(2**d)
    degree = np.array([int(i).bit_count() for i in masks])
    axes = 2 ** np.arange(d)
    ca, cb = a @ axes, b @ axes
    kernel = walsh_hadamard(np.exp(-degree / 0.75))
    terms = np.empty((d + 1, len(b), nclasses))
    for c in range(nclasses):
        h = np.bincount(ca[y == c], minlength=2**d) / sum(y == c)
        spectrum = np.asarray(walsh_hadamard(h)) * kernel
        for j in range(d + 1):
            terms[j, :, c] = (
                np.asarray(walsh_hadamard(spectrum * (degree == j)))[cb] / 2**d
            )
    distances = np.count_nonzero(b[:, None] != a[None, :], axis=2)
    direct = np.column_stack(
        [np.exp(-distances[:, y == c] / 0.75).mean(1) for c in range(nclasses)]
    )
    error = np.max(abs(direct - terms.sum(0)))
    if error > 1e-12:
        raise ValueError("signed reconstruction failed")
    h = np.bincount(cb, minlength=2**d)
    f = np.asarray(walsh_hadamard(h))
    pairs = [
        int(
            round(
                np.dot(f * f, [krawtchouk(d, j, k) for k in degree]) / 2**d
                - (len(b) if j == 0 else 0)
            )
        )
        // 2
        for j in range(d + 1)
    ]
    exact = np.bincount(np.rint(pdist(b, "hamming") * d).astype(int), minlength=d + 1)
    if not np.array_equal(exact, pairs):
        raise ValueError("pair enumerator mismatch")
    ix = np.arange(len(b))
    u = np.column_stack(
        [
            ((nclasses * v[ix, perms] - v.sum(1)) / (nclasses - 1)).mean(1)
            for v in terms[1:]
        ]
    )
    sd = u.std(0, ddof=1)
    active = sd > 1e-12
    z = (u[:, active] - u[:, active].mean(0)) / sd[active]
    pmax = np.ones(d)
    if active.any():
        pmax[active] = (z.max(1)[:, None] >= z[0] - 1e-12).mean(0)
    pred = winner(direct)
    degrees = [
        dict(
            degree=j,
            modes=int(sum(degree == j)),
            contrast=u[0, j - 1],
            p_max=pmax[j - 1],
            active=bool(active[j - 1]),
            only=int(sum(winner(terms[j]) == truth)),
            omit=int(sum(winner(direct - terms[j]) == truth)),
        )
        for j in range(1, d + 1)
    ]
    return dict(
        correct=int(sum(pred == truth)),
        p_label=np.mean((perms == pred).sum(1) >= sum(pred == truth)),
        degrees=degrees,
        max_reconstruction_error=error,
        pair_shells=pairs,
        effective_codes=len(b) ** 2 / (h @ h),
        ideal_shell_law=pi_T(np.arange(d + 1), d, 0.75).tolist(),
    ), pred


def reference_controls(a, q, y, truth, rows):
    """Secondary Paper V controls. Each retrieval row is disjoint from every anchor."""
    groups = np.array([r["group"] for r in rows])
    speakers = np.unique(groups)
    if len(speakers) > 1:
        anchor = np.isin(groups, speakers[::2])
        split_rule = "alternate sorted reference speakers"
    else:
        anchor = np.zeros(len(y), dtype=bool)
        for label in np.unique(y):
            anchor[np.flatnonzero(y == label)[::2]] = True
        split_rule = "alternate frozen reference rows per class; writer IDs unavailable"
    train, bank = a[anchor], a[~anchor]
    labels = np.unique(y)
    if set(y[anchor]) != set(labels) or set(y[~anchor]) != set(labels):
        return {
            "available": False,
            "reason": "incomplete class coverage in anchor/retrieval split",
        }
    mu = train.mean(0)
    sem = normalize(np.array([train[y[anchor] == c].mean(0) - mu for c in labels]))
    _, _, pcs = np.linalg.svd(train - mu, full_matrices=False)
    result = dict(
        available=True,
        split_rule=split_rule,
        anchors=len(train),
        retrieval=len(bank),
        axes=len(labels),
    )
    for name, dirs in [("semantic", sem), ("pca", pcs[: len(labels)])]:
        threshold = np.sort((train - mu) @ dirs.T, axis=0)[len(train) // 2]
        qb = (q - mu) @ dirs.T > threshold
        rb = (bank - mu) @ dirs.T > threshold
        e = np.count_nonzero(qb[:, None, :] != rb[None, :, :], axis=2)
        z = np.column_stack(
            [np.exp(-e[:, y[~anchor] == c] / 0.75).mean(1) for c in labels]
        )
        result[name + "_correct"] = int(sum(winner(z) == truth))
    match, _ = baseline(bank, q, y[~anchor], labels)
    result["matched_embedding_centroid_correct"] = int(sum(match == truth))
    if len(speakers) > 1:
        ac = a - a.mean(0)
        means = np.vstack([ac[groups == g].mean(0) for g in speakers])
        _, sv, vh = np.linalg.svd(means, full_matrices=False)
        basis = vh[sv > sv[0] * 1e-10]
        qc = q - a.mean(0)
        degrouped = allocate(
            dict(
                reference_vectors=ac - (ac @ basis.T) @ basis,
                query_vectors=qc - (qc @ basis.T) @ basis,
                reference_labels=y,
            ),
            "native",
            0.05,
        )
        result["group_removed_correct"] = int(sum(degrouped["predictions"] == truth))
        result["group_removed_rank"] = len(basis)
    return result


def measure(a, q, rows, queries):
    a, q = normalize(a), normalize(q)
    classes = sorted({r["label"] for r in rows})
    y = np.array([classes.index(r["label"]) for r in rows])
    truth = np.array([classes.index(r["label"]) for r in queries])
    groups = np.array([r["group"] for r in queries])
    amounts = np.array([r["amount"] for r in queries])
    perms = label_null(truth, groups)
    raw = lambda records: np.array([np.fromstring(r["text"], sep=" ") for r in records])
    centers, nn = baseline(a, q, y, range(len(classes)))
    raw_center, raw_nn = baseline(raw(rows), raw(queries), y, range(len(classes)))
    report, preds, prob = ambient(a, q, y, truth, groups, amounts, perms)
    payload = json.dumps(dict(reference=a.tolist(), query=q.tolist()))
    frame = json.loads(
        subprocess.run(
            ["node", HERE / "frame.mjs"],
            input=payload,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )
    ref, test = frame["reference"], frame["test"]
    ar, br = np.asarray(ref["bits"], int), np.asarray(test["bits"], int)
    spectral, wp = walsh(ar, br, y, truth, perms, len(classes))
    globe = {}
    for kind in ["points", "powered"]:
        x, z = np.asarray(ref[kind]), np.asarray(test[kind])
        shares = shares_from_points(z)[0]
        similarity = np.exp(-(1 - z @ x.T) / 0.2)
        scores = np.column_stack(
            [similarity[:, y == c].mean(1) for c in range(len(classes))]
        )
        globe[kind] = dict(
            angular_shares=shares,
            heat_power_at_t01={
                k: v * np.exp(-2 * int(k) * (int(k) + 1) * 0.1)
                for k, v in shares.items()
            },
            correct=int(sum(winner(scores) == truth)),
        )
    predictions = dict(
        raw_centroid=raw_center,
        raw_nn=raw_nn,
        embedding_centroid=centers,
        embedding_nn=nn,
        walsh=wp,
        **preds,
    )
    details = [
        dict(
            source=r["source"],
            truth=r["label"],
            group=r["group"],
            predictions={k: classes[v[i]] for k, v in predictions.items()},
            powered_class_probabilities=prob[i].tolist(),
        )
        for i, r in enumerate(queries)
    ]
    return dict(
        reference_n=len(a),
        test_n=len(q),
        classes=classes,
        unit=queries[0]["unit"],
        total_amount=int(amounts.sum()),
        correct={k: int(sum(v == truth)) for k, v in predictions.items()},
        ambient=report,
        frame_id=frame["frame_id"],
        focal_d=frame["d"],
        prefix_counts=frame["counts"],
        reference_controls=reference_controls(a, q, y, truth, rows),
        reference_certificate=frame["certified"],
        test_atom_moves=test["atom_moves"],
        test_atom_mean_chord_gain=test["mean_atom_gain"],
        reference_designed_chain=ref["compass"],
        curve=curve(a, q, np.array(ref["points"]), np.array(test["points"])),
        globe=globe,
        globe_packing=test["packing"],
        null=organization(br),
        walsh=spectral,
    ), details
