"""Apply the full-sphere lens and conserved class allocation to an embedding collection.

JSON input has reference_vectors, reference_labels, query_vectors, optional query_amounts,
and optional priors in sorted class order. Output is JSON. All geometry fits on references.
"""

import argparse
import json
import numpy as np


def normalize(x):
    a = np.asarray(x, dtype=float)
    if a.ndim != 2 or not a.shape[0] or not a.shape[1] or not np.isfinite(a).all():
        raise ValueError("expected a nonempty finite vector matrix")
    n = np.linalg.norm(a, axis=1, keepdims=True)
    if np.any(n <= 0):
        raise ValueError("zero vector has no direction")
    return a / n


def allocate(data, power="rms", temperature=0.05, adjust_temperature=True):
    a = normalize(data["reference_vectors"])
    q = normalize(data["query_vectors"])
    labels = np.asarray(data["reference_labels"])
    if labels.shape != (len(a),) or a.shape[1] != q.shape[1] or len(a) < 2:
        raise ValueError(
            "need aligned reference labels, at least two references and matching dimensions"
        )
    classes = np.unique(labels)
    priors = np.asarray(data.get("priors", np.ones(len(classes))), float)
    amounts = np.asarray(data.get("query_amounts", np.ones(len(q))), float)
    if (
        priors.shape != (len(classes),)
        or np.any(priors < 0)
        or not np.isfinite(priors).all()
        or priors.sum() <= 0
    ):
        raise ValueError(
            "priors must be nonnegative finite class weights with positive sum"
        )
    if (
        amounts.shape != (len(q),)
        or np.any(amounts < 0)
        or not np.isfinite(amounts).all()
    ):
        raise ValueError("invalid query amounts")
    if not np.isfinite(temperature) or temperature <= 0:
        raise ValueError("invalid temperature")
    if power not in ("rms", "native"):
        raise ValueError("unknown power mode")
    s = 1.0
    factor = 1.0
    ar, qr = a, q
    if power == "rms":
        p = normalize(a.mean(0, keepdims=True))[0]

        def plane(v):
            h = (v @ p)[:, None]
            if (1 + h <= 1e-12).any():
                raise ValueError("point at or too close to the projection pole")
            return (v - h * p) / (1 + h)

        ref_w = plane(a)
        r2 = np.mean(np.sum(ref_w**2, axis=1))
        if r2 <= 1e-15:
            raise ValueError("zero reference radius")
        s = float(1 / np.sqrt(r2))

        def lift(w):
            u = s * w
            g = np.sum(u * u, axis=1, keepdims=True)
            return (2 * u + (1 - g) * p) / (1 + g)

        ar, qr = lift(ref_w), lift(plane(q))
        if adjust_temperature:
            pairs = np.triu_indices(len(a), 1)
            before = np.median(np.maximum(0, 1 - a @ a.T)[pairs])
            after = np.median(np.maximum(0, 1 - ar @ ar.T)[pairs])
            if min(before, after) <= 1e-15:
                raise ValueError("degenerate median pair energy")
            factor = float(after / before)
    e = np.maximum(0, 1 - qr @ ar.T)
    # Row offsets cancel on normalisation. Use a log sum per class for small T.
    tau = temperature * factor
    logz = np.stack(
        [
            np.logaddexp.reduce(-e[:, labels == c] / tau, axis=1)
            - np.log(np.sum(labels == c))
            for c in classes
        ],
        axis=1,
    )
    logprior = np.full(len(classes), -np.inf)
    active = priors > 0
    logprior[active] = np.log(priors[active])
    logz += logprior
    w = np.exp(logz - logz.max(1, keepdims=True))
    p = w / w.sum(1, keepdims=True)
    return dict(
        classes=classes.tolist(),
        power=s,
        effective_temperature=tau,
        probabilities=p.tolist(),
        predictions=classes[p.argmax(1)].tolist(),
        allocated_amounts=(amounts @ p).tolist(),
        input_amount=float(sum(amounts)),
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input")
    ap.add_argument("--power", choices=["native", "rms"], default="rms")
    ap.add_argument("--temperature", type=float, default=0.05)
    ap.add_argument("--fixed-temperature", action="store_true")
    args = ap.parse_args()
    with open(args.input) as f:
        answer = allocate(
            json.load(f), args.power, args.temperature, not args.fixed_temperature
        )
    print(json.dumps(answer, allow_nan=False))
