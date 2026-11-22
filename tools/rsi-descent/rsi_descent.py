#!/usr/bin/env python3
"""rsi_descent.py -- the single-action atom as a shippable primitive.

Implements the curve-compass / single-action-curve RSI descent on a binary
coverage matrix: map each row to a point on S^2 via PCA-top-2 + stereographic
lift, find the geodesic-only argmin single-primitive flip toward the ideal
pole, iterate to a LOCAL fixpoint (not necessarily full coverage).

Runtime checks (each of them can fail and aborts with RuntimeError, exit 1):

  G1  lift geometry   stereographic_lift must return unit vectors satisfying the
                      exact inverse-stereographic identity x1/(1-x3)=u, x2/(1-x3)=v
                      on every PCA score of the input matrix (plus fixed probes).
  G2  pole alignment  on a FROZEN PCA frame (canonical sign) at least 80% of the
                      incomplete rows must have a 0->1 flip that strictly decreases
                      the geodesic distance to the all-ones pole.
  G3  per-step audit  every accepted flip is re-measured by an independent route
                      (covariance eigendecomposition + closed-form lift instead of
                      SVD + stereographic_lift) and must agree with the SVD distance
                      to 1e-6 and strictly improve it.

Delta = d_pre - min(d_pre, ...) >= 0 holds by construction (the Lean lemma
atom_delta_nonneg is the same statement), so Delta >= 0 alone is NOT evidence of
anything; G1-G3 are the checks that detect a broken lift or a wrong argmin.

The pre-flip point p_i and the ideal pole p* are always read in ONE PCA frame (the
frame fitted on the matrix with an all-ones row appended). Each post-flip point is
read in the frame refitted on the flipped matrix, against that frame's own pole.

numpy-only. Deterministic given --seed. Exit 0 on normal fixpoint.
"""

import argparse, json, sys, zipfile
import numpy as np

LIFT_TOL = 1e-9
POLE_ALIGN_MIN_FRACTION = 0.80
AUDIT_TOL = 1e-6

def v2_corr(M):
    X = np.asarray(M, float)
    sd = X.std(0)
    Xk = X[:, sd > 1e-12]
    if Xk.shape[1] < 2:
        return 1.0 if Xk.shape[1] == 1 else float("nan")
    C = np.corrcoef(Xk, rowvar=False)
    C = 0.5 * (C + C.T)
    ev = np.sort(np.linalg.eigvalsh(C))[::-1]
    s = ev.sum()
    return float((ev[0] + ev[1]) / s) if s > 0 else float("nan")

def load_input(path):
    if path.endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            with z.open("is-this-x-2026-08-12/data/real/per_row_coverage_v3.json") as f:
                j = json.load(f)
        M = np.array([r["covered"] for r in j["rows"]], dtype=np.int8)
        slugs = [r["slug"] for r in j["rows"]]
        return M, slugs
    if path.endswith(".json"):
        with open(path) as f:
            j = json.load(f)
        if isinstance(j, dict) and "rows" in j:
            M = np.array([r["covered"] for r in j["rows"]], dtype=np.int8)
            slugs = [r.get("slug", str(i)) for i, r in enumerate(j["rows"])]
            return M, slugs
        M = np.asarray(j, dtype=np.int8)
        return M, [f"row_{i}" for i in range(len(M))]
    M = np.loadtxt(path, delimiter=",", dtype=np.int8)
    return M, [f"row_{i}" for i in range(len(M))]

def stereographic_lift(u, v):
    denom = 1 + u*u + v*v
    return np.array([2*u/denom, 2*v/denom, (u*u+v*v-1)/denom])

def canonical_sign(V):
    """Flip each column of V so that its largest-|entry| component is positive."""
    V = np.array(V, float, copy=True)
    for j in range(V.shape[1]):
        col = V[:, j]
        i = int(np.argmax(np.abs(col) >= np.abs(col).max() - 1e-12))
        if col[i] < 0:
            V[:, j] = -col
    return V

def _standardize(X):
    mu = X.mean(0)
    sd = X.std(0) + 1e-12
    return (X - mu) / sd, mu, sd

def pca_frame(X):
    """PCA-top-2 frame of X (rows = items): scores, loadings V (d x 2, canonical sign), mu, sd."""
    Z, mu, sd = _standardize(np.asarray(X, float))
    Zc = Z - Z.mean(0)
    _, _, Vt = np.linalg.svd(Zc, full_matrices=False)
    V = canonical_sign(Vt[:2].T)
    return Zc @ V, V, mu, sd

def pca_top2(X):
    return pca_frame(X)[0]

def anchored(M):
    """M with the ideal all-ones row appended (index -1)."""
    M = np.asarray(M, np.int8)
    return np.vstack([M, np.ones((1, M.shape[1]), dtype=np.int8)])

def frame_points(M, lift=None):
    """Lift every row of M and the ideal pole inside ONE frame. Returns (row points, pole point)."""
    lift = lift or stereographic_lift
    sc = pca_frame(anchored(M))[0]
    P = np.array([lift(u, v) for u, v in sc])
    return P[:-1], P[-1]

def pair_distance(M, idx, lift=None):
    """Chord distance from row idx to the ideal pole, both read in ONE frame fitted on M + ones row."""
    lift = lift or stereographic_lift
    sc = pca_frame(anchored(M))[0]
    return float(np.linalg.norm(lift(*sc[idx]) - lift(*sc[-1])))

def distance_eigh(M, idx):
    """Independent route to the same distance: covariance eigendecomposition + closed-form lift."""
    X = anchored(M).astype(float)
    Z, _, _ = _standardize(X)
    Zc = Z - Z.mean(0)
    w, W = np.linalg.eigh(np.cov(Zc, rowvar=False))
    V = canonical_sign(W[:, np.argsort(w)[::-1][:2]])
    sc = Zc @ V
    def lift(u, v):
        q = u*u + v*v
        return np.array([2*u, 2*v, q - 1.0]) / (1.0 + q)
    return float(np.linalg.norm(lift(*sc[idx]) - lift(*sc[-1])))

def verify_lift_geometry(M, lift=None, tol=LIFT_TOL):
    """G1: the lift must be the exact inverse stereographic projection on the PCA plane."""
    lift = lift or stereographic_lift
    sc = pca_frame(anchored(M))[0]
    probes = np.vstack([sc, [[0.0, 0.0], [1.0, 0.0], [0.0, -2.0], [0.3, 0.4], [-5.0, 7.0]]])
    worst_norm = worst_inv = 0.0
    for u, v in probes:
        p = np.asarray(lift(float(u), float(v)), float)
        if p.shape != (3,) or not np.all(np.isfinite(p)):
            raise RuntimeError(f"LIFT GEOMETRY VIOLATED: ill-shaped or non-finite lift at ({u},{v})")
        worst_norm = max(worst_norm, abs(float(p @ p) - 1.0))
        if abs(1.0 - p[2]) < 1e-15:
            raise RuntimeError(f"LIFT GEOMETRY VIOLATED: lift reached the projection pole at ({u},{v})")
        inv = max(abs(p[0] / (1.0 - p[2]) - u), abs(p[1] / (1.0 - p[2]) - v))
        worst_inv = max(worst_inv, inv / max(1.0, abs(u), abs(v)))
    if worst_norm > tol or worst_inv > tol:
        raise RuntimeError(f"LIFT GEOMETRY VIOLATED: max | |p|^2-1 | = {worst_norm:.3e}, "
                           f"max inverse-stereographic residual = {worst_inv:.3e} (tol {tol:g})")
    return {"n_probes": int(len(probes)), "max_norm_residual": worst_norm, "max_inverse_residual": worst_inv}

def verify_pole_alignment(M, lift=None, min_fraction=POLE_ALIGN_MIN_FRACTION):
    """G2: on a frozen PCA frame, some 0->1 flip must strictly shorten the geodesic distance to
    the all-ones pole for >= min_fraction of the incomplete rows."""
    lift = lift or stereographic_lift
    M = np.asarray(M, np.int8)
    n, d = M.shape
    sc, V, mu, sd = pca_frame(anchored(M))
    ps = np.asarray(lift(*sc[-1]), float)
    n_incomplete = strict = 0
    for i in range(n):
        zeros = np.flatnonzero(M[i] == 0)
        if zeros.size == 0:
            continue
        n_incomplete += 1
        d0 = float(np.linalg.norm(np.asarray(lift(*sc[i]), float) - ps))
        best = min(float(np.linalg.norm(np.asarray(lift(*(sc[i] + V[c] / sd[c])), float) - ps)) for c in zeros)
        if best < d0 - 1e-12:
            strict += 1
    frac = strict / n_incomplete if n_incomplete else 1.0
    rep = {"strict_improvements_count": strict, "n_incomplete_rows": n_incomplete,
           "fraction": frac, "required_fraction": min_fraction}
    if n_incomplete and strict < min_fraction * n_incomplete:
        raise RuntimeError(f"POLE ALIGNMENT VIOLATED: only {strict}/{n_incomplete} incomplete rows "
                           f"({frac:.3f}) have a strictly pole-approaching flip on the frozen frame "
                           f"(need >= {min_fraction:.2f})")
    return rep

def run_descent(M, eps=1e-3, max_cycles=50, seed=20260822, assert_invariant=True):
    rng = np.random.default_rng(seed)
    M = np.asarray(M, np.int8)
    n, d = M.shape
    gates = {}
    if assert_invariant:
        gates["lift_geometry"] = verify_lift_geometry(M)
        gates["pole_alignment"] = verify_pole_alignment(M)
    trajectory = []
    ladder = {k: [] for k in range(d+1)}
    cum = 0.0
    n_audited = 0
    for cycle in range(max_cycles):
        order = rng.permutation(n)
        cycle_delta = 0.0
        n_pos = 0
        for idx in order:
            row = M[idx]
            if row.sum() == d:
                continue
            d_pre = pair_distance(M, idx)
            best_flip, best_d_post, best_d = -1, d_pre, d_pre
            for c in range(d):
                if row[c] == 0:
                    row[c] = 1
                    d_post = pair_distance(M, idx)
                    row[c] = 0
                    if d_post < best_d:
                        best_d = d_post; best_flip = c; best_d_post = d_post
            delta = d_pre - best_d_post
            if assert_invariant and delta < -1e-12:
                raise RuntimeError(f"INVARIANT VIOLATED: delta={delta:.6f} at idx={idx} cycle={cycle}")
            if delta > eps:
                if assert_invariant:
                    Mchk = M.copy()
                    Mchk[idx, best_flip] = 1
                    d_pre_e = distance_eigh(M, idx)
                    d_post_e = distance_eigh(Mchk, idx)
                    if (abs(d_pre_e - d_pre) > AUDIT_TOL or abs(d_post_e - best_d_post) > AUDIT_TOL
                            or not d_post_e < d_pre_e):
                        raise RuntimeError(
                            f"AUDIT FAILED at idx={idx} cycle={cycle}: svd (pre,post)=({d_pre:.9f},{best_d_post:.9f}) "
                            f"vs eigh ({d_pre_e:.9f},{d_post_e:.9f})")
                    n_audited += 1
                M[idx, best_flip] = 1
                cycle_delta += delta
                n_pos += 1
                k = int(M[idx].sum())
                ladder[k].append(delta)
            else:
                k = int(M[idx].sum())
                ladder[k].append(0.0)
        cum += cycle_delta
        trajectory.append({"cycle": cycle, "cycle_delta": cycle_delta, "n_positive": n_pos,
                           "cumulative": cum, "coverage": float(M.sum() / (n*d))})
        if cycle_delta < eps:
            break
    run_descent.gates = dict(gates, n_audited_flips=n_audited)
    return M, trajectory, ladder, cum

def _unit_but_wrong_lift(u, v):
    q = u*u + v*v
    return np.array([2*u, 2*v, 1.0 - q]) / (1.0 + q)

def _garbage_lift(u, v):
    r = np.random.default_rng(abs(hash((round(float(u), 9), round(float(v), 9)))) % 2**32)
    return r.normal(size=3)

def selftest(args):
    rng = np.random.default_rng(args.seed)
    M = (rng.random((60, 9)) < 0.5).astype(np.int8)
    M0 = M.copy()
    checks = {}
    for (u, v), want in {(0.0, 0.0): (0, 0, -1), (1.0, 0.0): (1, 0, 0), (0.0, -1.0): (0, -1, 0)}.items():
        p = stereographic_lift(u, v)
        assert np.allclose(p, want, atol=1e-12), f"lift({u},{v})={p}, expected {want}"
    checks["known_points"] = True
    g1 = verify_lift_geometry(M)
    for name, bad in (("garbage_lift", _garbage_lift), ("unit_norm_wrong_lift", _unit_but_wrong_lift)):
        try:
            verify_lift_geometry(M, lift=bad)
        except RuntimeError:
            pass
        else:
            raise AssertionError(f"G1 did not reject {name}")
    checks["g1_rejects_bad_lifts"] = True
    g2 = verify_pole_alignment(M)
    assert g2["strict_improvements_count"] >= POLE_ALIGN_MIN_FRACTION * g2["n_incomplete_rows"]
    try:
        verify_pole_alignment(M, min_fraction=1.01)
    except RuntimeError:
        pass
    else:
        raise AssertionError("G2 did not abort at an unreachable threshold")
    checks["g2_armed"] = True
    _, traj, ladder, cum = run_descent(M, eps=args.epsilon, max_cycles=args.max_cycles, seed=args.seed)
    gates = dict(run_descent.gates)
    all_deltas = [v for L in ladder.values() for v in L]
    assert all(d >= -1e-12 for d in all_deltas), "negative delta detected"
    assert (M >= M0).all(), "descent cleared a primitive"
    n_flips = int((M.astype(int) - M0.astype(int)).sum())
    assert n_flips == sum(t["n_positive"] for t in traj), "flip count != accepted steps"
    assert gates["n_audited_flips"] == n_flips and n_flips > 0, "audit did not cover every accepted flip"
    assert cum > 0.0, "descent made no progress"
    n_full = int((M.sum(1) == 9).sum())
    return {"selftest": True, "checks": checks, "lift_geometry": g1, "pole_alignment": g2,
            "n_full_coverage": n_full, "cycles_to_fixpoint": len(traj), "cumulative_delta": cum,
            "n_flips_audited": gates["n_audited_flips"], "trajectory": traj,
            "delta_ladder": {k: (max(vs) if vs else 0.0) for k, vs in ladder.items()},
            "n_satisfied_invariance": len(all_deltas)}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=False, default=None)
    p.add_argument("--epsilon", type=float, default=1e-3)
    p.add_argument("--max-cycles", type=int, default=50)
    p.add_argument("--seed", type=int, default=20260822)
    p.add_argument("--selftest", action="store_true")
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    if args.selftest:
        print(json.dumps(selftest(args), indent=2, default=float))
        return
    if not args.input:
        p.error("--input is required unless --selftest is given")
    M, slugs = load_input(args.input)
    n, d = M.shape
    M_out, traj, ladder, cum = run_descent(M, eps=args.epsilon, max_cycles=args.max_cycles, seed=args.seed)
    gates = dict(run_descent.gates)
    stuck = int((M_out.sum(1) < d).sum())
    out = {"cycles_to_fixpoint": len(traj), "cumulative_delta": cum,
           "final_coverage": float(M_out.sum() / (n*d)),
           "n_rows_incomplete_at_fixpoint": stuck,
           "reached_full_coverage": stuck == 0,
           "gates": gates,
           "trajectory": traj,
           "delta_ladder": {k: (max(vs) if vs else 0.0) for k, vs in ladder.items()}}
    print(json.dumps(out, indent=2, default=float))

if __name__ == "__main__":
    main()
