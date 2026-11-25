import json, sys
from pathlib import Path
import numpy as np

repo = Path(sys.argv[1])
sys.path[:0] = [
    str(repo / "tools/corpus-auditor"),
    str(repo / "tools/phonon-dispersion"),
    str(repo / "tools/spectral-decomposer"),
]
from spectral_decomposer import shares_from_points
from auditor import curveball
from phonon import walsh_hadamard, krawtchouk

load = lambda f: Path(f).read_bytes()
m = json.loads(load("maps.json"))
rows = [json.loads(x) for x in load("dataset.jsonl").splitlines()]
classes = list(dict.fromkeys(row["mechanism"] for row in rows))
y = np.array([classes.index(r["mechanism"]) for r in rows])
a, b = np.array(m["ref"]["bits"]), np.array(m["test"]["bits"])
n, d = b.shape
code = lambda x: x @ (2 ** np.arange(x.shape[1]))
deg = np.array([i.bit_count() for i in range(2**d)])
wh = lambda x: np.asarray(walsh_hadamard(x))


def pairs(x):
    h = np.bincount(code(x), minlength=2**d)
    return int(h @ (h - 1) // 2)


def gap_ratio(x):
    x = x[:, np.std(x, axis=0) > 0]
    e = np.linalg.eigvalsh(np.corrcoef(x.T))
    g = np.diff(e)
    g[g < 1e-10] = 0
    mn = np.minimum(g[:-1], g[1:])
    mx = np.maximum(g[:-1], g[1:])
    return float(np.mean(mn[mx > 0] / mx[mx > 0])), int(sum(mx > 0)), e.tolist()


pobs = pairs(b)
ix = code(b)
F = wh(np.bincount(ix, minlength=2**d))
# Ordered distinct-index pairs. Remove n diagonal pairs at h=0.
dist = [
    int(
        (F**2) @ np.array([krawtchouk(d, j, i) for i in deg]) // 2**d
        - (n if j == 0 else 0)
    )
    for j in range(d + 1)
]
assert dist[0] == 2 * pobs and sum(dist) == n * (n - 1)
big = np.array(m["probeTestBits"])
gobs = gap_ratio(big)
geom = []
for seed, win in [(711, 20), (712, 40)]:
    rng = np.random.default_rng(seed)
    vals = []
    gvals = []
    for _ in range(399):
        draw = curveball(b, win * n, rng)
        assert np.array_equal(draw.sum(1), b.sum(1)) and np.array_equal(
            draw.sum(0), b.sum(0)
        )
        vals.append(pairs(draw))
        gvals.append(gap_ratio(curveball(big, win * n, rng))[0])

    def summary(obs, vals):
        vals = np.asarray(vals)
        sd = vals.std(ddof=1)
        zz = (obs - vals.mean()) / sd
        return dict(
            observed=obs,
            null_mean=vals.mean(),
            central95=np.quantile(vals, [0.025, 0.975]).tolist(),
            z=zz,
            dBc=20 * np.log10(abs(zz)),
            p_high=(1 + sum(vals >= obs)) / (len(vals) + 1),
            p_low=(1 + sum(vals <= obs)) / (len(vals) + 1),
        )

    geom.append(
        dict(
            trades_per_row=win,
            seed=seed,
            pairs=summary(pobs, vals),
            gaps=summary(gobs[0], gvals),
        )
    )
# Degree-wise signed contribution to correct-class versus mean-wrong-class unnormalised Gibbs scores.
weights = wh(np.exp(-deg / 0.75))
S = np.zeros((d, n, len(classes)))
for ci in range(len(classes)):
    h = np.bincount(code(a)[y[:n] == ci], minlength=2**d) / sum(y[:n] == ci)
    for j in range(1, d + 1):
        S[j - 1, :, ci] = wh(wh(h) * weights * (deg == j))[ix] / 2**d
direct = np.stack(
    [
        np.exp(-np.sum(b[:, None, :] != a[y[:n] == k], axis=2) / 0.75).mean(1)
        for k in range(len(classes))
    ],
    axis=1,
)
assert np.allclose(S.sum(0) + weights[0] / 2**d, direct)
truth = y[n:]
perm = np.tile(truth, (10000, 1))
rng = np.random.default_rng(713)
station = np.array([r["station"] for r in rows[n:]])
for v in dict.fromkeys(station):
    mask = station == v
    perm[1:, mask] = rng.permuted(perm[1:, mask], axis=1)
u = np.stack(
    [
        ((len(classes) * v[np.arange(n), perm] - v.sum(1)) / (len(classes) - 1)).mean(1)
        for v in S
    ],
    axis=1,
)
active = u.std(0) > 1e-12
standardized = (u[:, active] - u[:, active].mean(0)) / u[:, active].std(0, ddof=1)
# Include identity in centring and scaling. One-sided max over positive association; handle ties.
mx = standardized.max(1)
pooled = direct / direct.sum(1, keepdims=True)
pred = np.isclose(pooled, pooled.max(1, keepdims=True), rtol=0, atol=1e-12).argmax(1)
acc = (perm == pred).mean(1)
result = dict(
    pair_counts_by_distance=[i // 2 for i in dist],
    n_pairs=n * (n - 1) // 2,
    n_valid_ratios=gobs[1],
    observed_eigenvalues=gobs[2],
    geometry=geom,
    degree_active=active.tolist(),
    degree_contrasts=u[0].tolist(),
    degree_z=standardized[0].tolist(),
    degree_p_max=[float(np.mean(mx >= v - 1e-12)) for v in standardized[0]],
    correct=int(sum(pred == truth)),
    accuracy_p=float(np.mean(acc >= acc[0])),
    chance=acc[1:].mean(),
)
charts = json.loads(load("charts.json"))
result["degree_power"] = {
    name: shares_from_points(np.asarray(points))[0]
    for name, points in [
        ("served", m["test"]["points"]),
        ("powered", charts["test"]["powered"]),
    ]
}
Path("spectral-results.json").write_text(
    json.dumps(result, indent=2, allow_nan=False) + "\n"
)
