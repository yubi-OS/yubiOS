#!/usr/bin/env python3
"""
Spectral defocus + de-atomization on S^2.

See README.md in this directory for the derivation, conventions, and paper
background (papers/curved-corpus-unified-2026-08-13.tex, experiment G1;
papers/is-this-x-2026-08-12-Final.tex for the real-corpus atomicity finding).

Numpy-only. No SciPy / no external spherical-harmonics package.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import zipfile
from dataclasses import dataclass
from typing import Callable, List, Tuple

import numpy as np

GOLDEN_RATIO = (1.0 + 5.0 ** 0.5) / 2.0

# ---------------------------------------------------------------------------
# Real spherical harmonics, L = 0..3 (16 functions)
#
# Convention: real, L2(S^2)-orthonormal spherical harmonics in the standard
# "real form" (no Condon-Shortley phase), evaluated directly from Cartesian
# coordinates (x, y, z) on the unit sphere (x^2+y^2+z^2=1) -- the same
# convention used by the real solid-harmonics tables common in graphics and
# geodesy references. Ordered by degree l ascending, then order m ascending
# from -l to +l within each degree.
# ---------------------------------------------------------------------------


def _y00(x, y, z):
    return np.full_like(x, 0.5 * math.sqrt(1.0 / math.pi))


def _y1m1(x, y, z):
    return math.sqrt(3.0 / (4.0 * math.pi)) * y


def _y10(x, y, z):
    return math.sqrt(3.0 / (4.0 * math.pi)) * z


def _y1p1(x, y, z):
    return math.sqrt(3.0 / (4.0 * math.pi)) * x


def _y2m2(x, y, z):
    return 0.5 * math.sqrt(15.0 / math.pi) * x * y


def _y2m1(x, y, z):
    return 0.5 * math.sqrt(15.0 / math.pi) * y * z


def _y20(x, y, z):
    return 0.25 * math.sqrt(5.0 / math.pi) * (3.0 * z * z - 1.0)


def _y2p1(x, y, z):
    return 0.5 * math.sqrt(15.0 / math.pi) * x * z


def _y2p2(x, y, z):
    return 0.25 * math.sqrt(15.0 / math.pi) * (x * x - y * y)


def _y3m3(x, y, z):
    return 0.25 * math.sqrt(35.0 / (2.0 * math.pi)) * y * (3.0 * x * x - y * y)


def _y3m2(x, y, z):
    return 0.5 * math.sqrt(105.0 / math.pi) * x * y * z


def _y3m1(x, y, z):
    return 0.25 * math.sqrt(21.0 / (2.0 * math.pi)) * y * (5.0 * z * z - 1.0)


def _y30(x, y, z):
    return 0.25 * math.sqrt(7.0 / math.pi) * (5.0 * z * z * z - 3.0 * z)


def _y3p1(x, y, z):
    return 0.25 * math.sqrt(21.0 / (2.0 * math.pi)) * x * (5.0 * z * z - 1.0)


def _y3p2(x, y, z):
    return 0.25 * math.sqrt(105.0 / math.pi) * (x * x - y * y) * z


def _y3p3(x, y, z):
    return 0.25 * math.sqrt(35.0 / (2.0 * math.pi)) * x * (x * x - 3.0 * y * y)


# (degree l, order m, function). 16 entries, grouped by degree.
BASIS: List[Tuple[int, int, Callable]] = [
    (0, 0, _y00),
    (1, -1, _y1m1), (1, 0, _y10), (1, 1, _y1p1),
    (2, -2, _y2m2), (2, -1, _y2m1), (2, 0, _y20), (2, 1, _y2p1), (2, 2, _y2p2),
    (3, -3, _y3m3), (3, -2, _y3m2), (3, -1, _y3m1), (3, 0, _y30), (3, 1, _y3p1), (3, 2, _y3p2), (3, 3, _y3p3),
]

N_BASIS = len(BASIS)  # 16
DEGREES = np.array([l for (l, m, f) in BASIS])
MAX_L = 3
DEGREE_SLICES = {l: np.where(DEGREES == l)[0] for l in range(MAX_L + 1)}


def design_matrix(points: np.ndarray) -> np.ndarray:
    """points: (N,3) unit vectors -> (N,16) real spherical harmonic basis matrix."""
    x, y, z = points[:, 0], points[:, 1], points[:, 2]
    cols = [f(x, y, z) for (l, m, f) in BASIS]
    return np.stack(cols, axis=1)


def energies_by_degree(coeffs: np.ndarray) -> np.ndarray:
    """coeffs: (...,16) -> (...,4) raw sum-of-squares energy per degree l=0..3."""
    coeffs = np.asarray(coeffs)
    out = np.zeros(coeffs.shape[:-1] + (MAX_L + 1,))
    for l in range(MAX_L + 1):
        idx = DEGREE_SLICES[l]
        out[..., l] = np.sum(coeffs[..., idx] ** 2, axis=-1)
    return out


# ---------------------------------------------------------------------------
# Vogel's Fibonacci lattice on S^2
# ---------------------------------------------------------------------------


def fibonacci_lattice(n: int) -> np.ndarray:
    i = np.arange(n)
    z = 1.0 - (2.0 * i + 1.0) / n
    phi = 2.0 * math.pi * i / GOLDEN_RATIO
    r_xy = np.sqrt(np.clip(1.0 - z * z, 0.0, None))
    x = r_xy * np.cos(phi)
    y = r_xy * np.sin(phi)
    return np.stack([x, y, z], axis=1)


# ---------------------------------------------------------------------------
# Ridge fit
# ---------------------------------------------------------------------------


@dataclass
class FitResult:
    coeffs: np.ndarray          # (16,)
    energy: np.ndarray          # (4,) raw per-degree sum-of-squares energy
    share: np.ndarray           # (4,) Parseval share (energy / sum(energy))


def fit_field(points: np.ndarray, targets: np.ndarray, lam: float = 1e-3) -> FitResult:
    """Ridge-regress targets (N,) against the L<=3 real SH basis at points (N,3)."""
    phi = design_matrix(points)
    gram = phi.T @ phi + lam * np.eye(N_BASIS)
    rhs = phi.T @ targets
    coeffs = np.linalg.solve(gram, rhs)
    energy = energies_by_degree(coeffs)
    total = energy.sum()
    share = energy / total if total > 0 else np.zeros_like(energy)
    return FitResult(coeffs=coeffs, energy=energy, share=share)


# ---------------------------------------------------------------------------
# Closed-form diagonal decay (the O(L) compute win)
# ---------------------------------------------------------------------------


def closed_form_decay(E0: np.ndarray, t: float) -> np.ndarray:
    """E_l(t) = E_l(0) * exp(-2 l(l+1) t), for l = 0..3."""
    l = np.arange(MAX_L + 1)
    factor = np.exp(-2.0 * l * (l + 1.0) * t)
    return np.asarray(E0) * factor


# ---------------------------------------------------------------------------
# Tangent-space Euler-Maruyama Brownian point diffusion on S^2
# ---------------------------------------------------------------------------


def _diffuse_points(points: np.ndarray, t: float, rng: np.random.Generator, dt_max: float = 1e-3) -> np.ndarray:
    """Euler-Maruyama Brownian motion on S^2 for time t, starting at points.

    Step: x <- normalize(x + sqrt(2*dt) * tangential_noise).
    """
    n_steps = max(1, int(math.ceil(t / dt_max)))
    dt = t / n_steps
    x = points.copy()
    for _ in range(n_steps):
        noise = rng.standard_normal(x.shape)
        radial = np.sum(noise * x, axis=1, keepdims=True) * x
        tangential = noise - radial
        x = x + math.sqrt(2.0 * dt) * tangential
        norms = np.linalg.norm(x, axis=1, keepdims=True)
        x = x / norms
    return x


def simulate_decay(points: np.ndarray, targets: np.ndarray, t: float, reps: int, seed: int,
                    lam: float = 1e-3, dt_max: float = 1e-3) -> np.ndarray:
    """Monte-Carlo measured E_l(t): diffuse the point positions (targets stay
    attached to the same particle/index), refit the L<=3 field, average the
    per-degree energy over reps independent diffusion runs.
    """
    rng = np.random.default_rng(seed)
    acc = np.zeros(MAX_L + 1)
    for _ in range(reps):
        diffused = _diffuse_points(points, t, rng, dt_max=dt_max)
        fit = fit_field(diffused, targets, lam=lam)
        acc += fit.energy
    return acc / reps


# ---------------------------------------------------------------------------
# Atomicity diagnostic
# ---------------------------------------------------------------------------


def atomicity(E0: np.ndarray, Emeas: np.ndarray, t: float) -> np.ndarray:
    """A_l(t) = exp(-2 l(l+1) t) - E_l(t)/E_l(0), per degree l=0..3."""
    l = np.arange(MAX_L + 1)
    closed_ratio = np.exp(-2.0 * l * (l + 1.0) * t)
    E0 = np.asarray(E0, dtype=float)
    Emeas = np.asarray(Emeas, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        measured_ratio = np.where(E0 > 0, Emeas / np.where(E0 > 0, E0, 1.0), 0.0)
    return closed_ratio - measured_ratio


# ---------------------------------------------------------------------------
# vMF (von Mises-Fisher) kernel smoothing for de-atomization
# ---------------------------------------------------------------------------


def _tangent_basis(mu: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Return two orthonormal vectors spanning the tangent plane at mu (unit vector)."""
    helper = np.array([1.0, 0.0, 0.0]) if abs(mu[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    e1 = helper - np.dot(helper, mu) * mu
    e1 = e1 / np.linalg.norm(e1)
    e2 = np.cross(mu, e1)
    return e1, e2


def vmf_smooth(points: np.ndarray, kappa: float, m: int, seed: int) -> np.ndarray:
    """Replace each point by m draws from vMF(center=point, concentration=kappa) on S^2.

    Uses the standard inverse-CDF method for the cosine-angle marginal on S^2
    (the p=3 special case): W = 1 + (1/kappa) * log(u + (1-u) * exp(-2*kappa)),
    with u ~ Uniform(0,1); azimuth is uniform in the tangent plane.
    Returns an array of shape (N*m, 3).
    """
    rng = np.random.default_rng(seed)
    n = points.shape[0]
    out = np.empty((n * m, 3))
    u = rng.random((n, m))
    if kappa <= 0:
        w = 1.0 - 2.0 * u  # uniform-on-sphere limit
    else:
        w = 1.0 + (1.0 / kappa) * np.log(u + (1.0 - u) * math.exp(-2.0 * kappa))
    azimuth = rng.random((n, m)) * 2.0 * math.pi
    for i in range(n):
        mu = points[i]
        e1, e2 = _tangent_basis(mu)
        wi = w[i]
        sin_theta = np.sqrt(np.clip(1.0 - wi * wi, 0.0, None))
        az = azimuth[i]
        pts = (wi[:, None] * mu[None, :]
               + (sin_theta * np.cos(az))[:, None] * e1[None, :]
               + (sin_theta * np.sin(az))[:, None] * e2[None, :])
        out[i * m:(i + 1) * m] = pts
    return out


def vmf_smooth_with_targets(points: np.ndarray, targets: np.ndarray, kappa: float, m: int,
                             seed: int) -> Tuple[np.ndarray, np.ndarray]:
    """vmf_smooth, carrying each parent's target value to its m children."""
    smoothed = vmf_smooth(points, kappa, m, seed)
    new_targets = np.repeat(targets, m)
    return smoothed, new_targets


# ---------------------------------------------------------------------------
# Real-corpus data pipeline (papers/is-this-x-2026-08-12-Final.zip)
# ---------------------------------------------------------------------------

REAL_CORPUS_ZIP = "papers/is-this-x-2026-08-12-Final.zip"
REAL_CORPUS_MEMBER = "is-this-x-2026-08-12/data/real/per_row_coverage_v3.json"


def load_real_corpus_matrix(zip_path: str = REAL_CORPUS_ZIP, member: str = REAL_CORPUS_MEMBER) -> np.ndarray:
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(member) as f:
            data = json.load(f)
    rows = data["rows"]
    matrix = np.array([row["covered"] for row in rows], dtype=float)
    return matrix


def matrix_to_sphere(matrix: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Paper protocol: z-score columns -> PCA top-2 -> RMS rescale -> stereographic
    lift sigma(u,v) = (2u, 2v, u^2+v^2-1) / (1+u^2+v^2).

    Convention (see README): the scalar field fitted over the resulting S^2
    embedding is the (z-scored) third principal component score of each row --
    PC1/PC2 define position on the sphere and PC3 is the field value. This is
    a documented choice for this deliverable, not dictated verbatim by the
    papers' protocol text (which specifies the PC1/PC2 -> S^2 lift but not
    what scalar field to fit against it).
    Returns (points (N,3), targets (N,)).
    """
    mu = matrix.mean(axis=0)
    sigma = matrix.std(axis=0)
    sigma_safe = np.where(sigma > 1e-12, sigma, 1.0)
    z = (matrix - mu) / sigma_safe

    u_full, s_full, vt_full = np.linalg.svd(z, full_matrices=False)
    scores = u_full * s_full  # (N, k) principal component scores
    uv = scores[:, :2]
    pc3 = scores[:, 2] if scores.shape[1] > 2 else scores[:, -1]
    targets = (pc3 - pc3.mean()) / (pc3.std() if pc3.std() > 1e-12 else 1.0)

    rms = math.sqrt(np.mean(np.sum(uv ** 2, axis=1)))
    uv_scaled = uv / rms if rms > 1e-12 else uv

    u, v = uv_scaled[:, 0], uv_scaled[:, 1]
    denom = 1.0 + u * u + v * v
    x = 2.0 * u / denom
    y = 2.0 * v / denom
    zc = (u * u + v * v - 1.0) / denom
    points = np.stack([x, y, zc], axis=1)
    return points, targets


# ---------------------------------------------------------------------------
# Self tests
# ---------------------------------------------------------------------------


def _make_planted_field_targets(points: np.ndarray, coeffs: np.ndarray) -> np.ndarray:
    phi = design_matrix(points)
    return phi @ coeffs


def selftest_smooth_field(n=1024, reps=60, seed=0, tol=0.10):
    """Leg 1: plant a known L<=3 field, diffuse, verify measured decay matches
    the closed form within tol per degree -- the regime where the closed form
    is valid (quasi-uniform lattice, smooth field).
    """
    rng = np.random.default_rng(seed)
    points = fibonacci_lattice(n)
    planted = rng.standard_normal(N_BASIS)
    targets = _make_planted_field_targets(points, planted)

    fit0 = fit_field(points, targets)
    E0 = fit0.energy

    results = {}
    ok = True
    for t in (0.01, 0.05):
        Emeas = simulate_decay(points, targets, t, reps=reps, seed=seed + 1, lam=1e-3)
        Eclosed = closed_form_decay(E0, t)
        rel_err = np.zeros(MAX_L + 1)
        for l in range(MAX_L + 1):
            denom = max(Eclosed[l], 1e-12)
            rel_err[l] = abs(Emeas[l] - Eclosed[l]) / denom
        # l=0 has no decay to verify (exp(0)=1) and the planted field carries
        # little constant energy, so its RELATIVE error is noise-dominated.
        # The physics under test is the l>=1 decay rates; l=0 gets a loose
        # sanity bound only.
        passed = bool(np.all(rel_err[1:] <= tol)) and bool(rel_err[0] <= 0.25)
        ok = ok and passed
        results[t] = {
            "E0": E0.tolist(),
            "E_closed": Eclosed.tolist(),
            "E_measured": Emeas.tolist(),
            "rel_err": rel_err.tolist(),
            "passed": passed,
        }
    return ok, results


def selftest_real_corpus(reps=8, t=0.005, kappa=200.0, m=4, seed=0,
                          zip_path: str = REAL_CORPUS_ZIP):
    """Leg 2/3: replicate the atomicity finding on the real corpus, then
    vMF-smooth and re-measure. Reports honest numbers either way -- the paper
    itself flags A_1 as a diagnostic whose null is specified but not executed,
    so a strict pass/fail here should not be over-read.
    """
    matrix = load_real_corpus_matrix(zip_path=zip_path)
    n_rows = matrix.shape[0]
    n_unique = len(set(map(tuple, matrix.tolist())))
    points, targets = matrix_to_sphere(matrix)

    fit0 = fit_field(points, targets)
    E0 = fit0.energy
    Emeas = simulate_decay(points, targets, t, reps=reps, seed=seed, lam=1e-3)
    A = atomicity(E0, Emeas, t)
    A1_before = float(A[1])
    atomic_pass = bool(A1_before > 0.3)

    smoothed_points, smoothed_targets = vmf_smooth_with_targets(points, targets, kappa, m, seed + 1)
    fit0_s = fit_field(smoothed_points, smoothed_targets)
    E0_s = fit0_s.energy
    Emeas_s = simulate_decay(smoothed_points, smoothed_targets, t, reps=reps, seed=seed + 2, lam=1e-3)
    A_s = atomicity(E0_s, Emeas_s, t)
    A1_after = float(A_s[1])
    deatomize_pass = bool(A1_after <= A1_before / 2.0)

    return {
        "n_rows": n_rows,
        "n_unique_rows": n_unique,
        "E0": E0.tolist(),
        "Emeas": Emeas.tolist(),
        "A": A.tolist(),
        "A1_before": A1_before,
        "atomic_pass": atomic_pass,
        "E0_smoothed": E0_s.tolist(),
        "Emeas_smoothed": Emeas_s.tolist(),
        "A_smoothed": A_s.tolist(),
        "A1_after": A1_after,
        "deatomize_pass": deatomize_pass,
    }


def selftest_timing(n=1024, t=0.02, reps=8, seed=0):
    import time
    points = fibonacci_lattice(n)
    rng = np.random.default_rng(seed)
    planted = rng.standard_normal(N_BASIS)
    targets = _make_planted_field_targets(points, planted)
    fit0 = fit_field(points, targets)
    E0 = fit0.energy

    closed_iters = 2000
    t0 = time.perf_counter()
    for _ in range(closed_iters):
        _ = closed_form_decay(E0, t)
    t_closed = (time.perf_counter() - t0) / closed_iters

    sim_iters = 5
    t0 = time.perf_counter()
    for i in range(sim_iters):
        _ = simulate_decay(points, targets, t, reps=reps, seed=seed + i)
    t_sim = (time.perf_counter() - t0) / sim_iters

    speedup = t_sim / t_closed if t_closed > 0 else float("inf")
    return {"t_closed_s": t_closed, "t_simulate_s": t_sim, "speedup": speedup, "n": n, "reps": reps}


def curveball(M: np.ndarray, n_trades: int, rng: np.random.Generator) -> np.ndarray:
    """Strona curveball trade null: preserves BOTH row and column sums exactly.
    Copied from papers/data/lean/verify_claims.py for fidelity."""
    M = M.copy()
    n = M.shape[0]
    for _ in range(n_trades):
        r1, r2 = rng.integers(0, n, 2)
        if r1 == r2:
            continue
        d1 = np.where((M[r1] == 1) & (M[r2] == 0))[0]
        d2 = np.where((M[r1] == 0) & (M[r2] == 1))[0]
        if len(d1) == 0 or len(d2) == 0:
            continue
        pool = np.concatenate([d1, d2])
        rng.shuffle(pool)
        M[r1, d1] = 0
        M[r2, d2] = 0
        M[r1, pool[:len(d1)]] = 1
        M[r2, pool[len(d1):]] = 1
    return M


def nw_smooth_targets(points: np.ndarray, targets: np.ndarray, kappa: float = 50.0) -> np.ndarray:
    """Value-level de-atomization: Nadaraya-Watson regression of the field over
    the sphere with a vMF kernel. Positions stay put; each target is replaced
    by the kernel-weighted average of ALL targets. This smooths the FIELD --
    which the positional jitter of vmf_smooth_with_targets provably could not
    (carried values stay atomic; see the README's honest negative). kappa sets
    the angular bandwidth ~1/sqrt(kappa); kappa=50 matches the RMS diffusion
    displacement (~0.14 rad) at t=0.005, the theory-motivated choice."""
    G = points @ points.T
    W = np.exp(kappa * (G - 1.0))
    return (W @ targets) / W.sum(axis=1)


def run_admit_null(zip_path: str = REAL_CORPUS_ZIP, t: float = 0.005, reps: int = 6,
                   n_null: int = 10, trades_per_row: int = 20, seed: int = 20260822,
                   kappas=(20.0, 50.0, 150.0)) -> int:
    """Tackle the two open items on the atomicity diagnostic A_l(t).

    (1) ADMISSION: the papers specify A_l's null (curveball draws, which share
        the margins and hence the marginal-induced atom structure) but never
        executed it. Executed here: A_1(t) on n_null fixed-margin draws ->
        mean/sd -> z of the real corpus's A_1. Pre-registered reading:
        |z| < 3  -> A_1 is marginal-dominated: valid as a DIAGNOSTIC of
                    atomicity, NOT admissible as a corpus-specific map
                    coordinate (consistent with the 98%-marginal-fixed story);
        |z| >= 3 -> A_1 carries corpus-specific signal beyond the margins and
                    is admissible under the membership condition.
        Degenerate null (sd ~ 0) -> inadmissible by definition.

    (2) DE-ATOMIZATION: value-level NW/vMF smoothing of the field (positions
        unchanged), kappa grid {20, 50, 150}. Pre-registered success bar (the
        original D5 bar the positional jitter failed): some kappa achieves
        A_1_smoothed <= 0.5 * A_1_real.

    Executed 2026-08-22 (n=50, seeds 20260822/777, kappa 2..1000): the corpus
    FAILS both bars robustly (z=+1.59/+1.27; halving unreachable at any kappa --
    the all-ones atom, 795 identical rows, is a point mass no kernel can spread).
    Recorded verdict: A_1 is marginal-dominated -- a valid atomicity DIAGNOSTIC,
    not an admissible map coordinate; the corpus cannot be de-atomized by
    value-level smoothing. See papers/data/atomicity/A1-admission-null.json.

    The gate therefore asserts the PRE-REGISTERED NEGATIVE reproduces:
    exit 0 iff the null is non-degenerate AND |z| < 3 AND the halving bar is
    NOT met. Any drift from the recorded verdict (in either direction) fails
    CI and demands a fresh look."""
    rng = np.random.default_rng(seed)
    matrix = load_real_corpus_matrix(zip_path=zip_path)
    n_rows = matrix.shape[0]

    def a1_of_matrix(mat, sd):
        pts, tg = matrix_to_sphere(mat)
        E0 = fit_field(pts, tg).energy
        Em = simulate_decay(pts, tg, t, reps=reps, seed=sd, lam=1e-3)
        return float(atomicity(E0, Em, t)[1])

    a1_real = a1_of_matrix(matrix, seed + 1)

    null_vals = []
    for i in range(n_null):
        Mn = curveball(matrix, trades_per_row * n_rows, rng)
        null_vals.append(a1_of_matrix(Mn, seed + 100 + i))
    mu = float(np.mean(null_vals))
    sd = float(np.std(null_vals, ddof=1))
    degenerate = bool(sd <= 1e-6)
    z = float((a1_real - mu) / sd) if not degenerate else float('nan')

    pts, tg = matrix_to_sphere(matrix)
    smooth = {}
    for kappa in kappas:
        tg_s = nw_smooth_targets(pts, tg, kappa=kappa)
        E0s = fit_field(pts, tg_s).energy
        Ems = simulate_decay(pts, tg_s, t, reps=reps, seed=seed + 2, lam=1e-3)
        smooth[kappa] = float(atomicity(E0s, Ems, t)[1])
    best_kappa = min(smooth, key=lambda k: smooth[k])
    halved = bool(smooth[best_kappa] <= 0.5 * a1_real)

    verdict_1 = ('DEGENERATE null: A_1 inadmissible by definition' if degenerate else
                 ('|z| >= 3: A_1 carries corpus-specific signal beyond margins; ADMISSIBLE'
                  if abs(z) >= 3 else
                  '|z| < 3: A_1 is marginal-dominated; valid diagnostic, NOT a map coordinate'))
    out = {
        'A1_real': a1_real,
        'null': {'n': n_null, 'mean': mu, 'sd': sd, 'values': null_vals},
        'z': z,
        'admission_verdict': verdict_1,
        'nw_smoothing': {str(k): v for k, v in smooth.items()},
        'best_kappa': best_kappa,
        'halving_bar': {'target': 0.5 * a1_real, 'achieved': smooth[best_kappa], 'met': halved},
    }
    print(json.dumps(out, indent=2))
    ok = (not degenerate) and (abs(z) < 3) and (not halved)
    print('ADMIT_NULL: ' + ('NEGATIVE-REPRODUCED (pre-registered verdict holds)' if ok
                            else 'UNEXPECTED-RESULT (verdict drifted from recorded negative)'))
    return 0 if ok else 1

def run_selftest(real_corpus: bool, zip_path: str = REAL_CORPUS_ZIP):
    report = {}
    ok_smooth, smooth_results = selftest_smooth_field()
    report["leg1_smooth_field"] = {"passed": ok_smooth, "by_t": {str(k): v for k, v in smooth_results.items()}}

    report["timing"] = selftest_timing()

    overall_ok = ok_smooth

    if real_corpus:
        try:
            real_results = selftest_real_corpus(zip_path=zip_path)
            report["leg2_real_corpus"] = real_results
            overall_ok = overall_ok and real_results["atomic_pass"]
        except FileNotFoundError as e:
            # --real-corpus was explicitly requested: a missing corpus is a FAILURE, never a silent pass
            report["leg2_real_corpus"] = {"error": f"FAILED, real-corpus leg could not run: {e}", "executed": False}
            overall_ok = False
        except Exception as e:  # any other failure of the requested leg is also a failure
            report["leg2_real_corpus"] = {"error": f"FAILED, real-corpus leg could not run: {type(e).__name__}: {e}",
                                          "executed": False}
            overall_ok = False

    report["overall_passed"] = overall_ok
    return overall_ok, report


def main(argv=None):
    parser = argparse.ArgumentParser(description="Spectral defocus + de-atomization on S^2")
    parser.add_argument("--selftest", action="store_true", help="Run the Leg-1 smooth-field self-test")
    parser.add_argument("--real-corpus", action="store_true",
                         help="Also run the Leg-2/3 real-corpus atomicity + de-atomization self-test")
    parser.add_argument("--zip-path", default=REAL_CORPUS_ZIP, help="Path to the real-corpus zip")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    parser.add_argument("--n-null", type=int, default=10, help="Number of curveball null draws for --admit-null")
    parser.add_argument("--kappas", default="20,50,150", help="Comma-separated vMF kappa grid for --admit-null")
    parser.add_argument("--seed", type=int, default=20260822, help="Base RNG seed for --admit-null")
    parser.add_argument("--admit-null", action="store_true",
                         help="Execute the A_l admission null + value-level de-atomization")
    args = parser.parse_args(argv)
    if args.admit_null:
        sys.exit(run_admit_null(zip_path=args.zip_path, n_null=args.n_null, seed=args.seed,
                                kappas=tuple(float(x) for x in args.kappas.split(','))))

    if not args.selftest and not args.real_corpus:
        parser.print_help()
        return 1

    ok, report = run_selftest(real_corpus=args.real_corpus, zip_path=args.zip_path)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Leg 1 (smooth field, closed form valid): {'PASS' if report['leg1_smooth_field']['passed'] else 'FAIL'}")
        for t_str, res in report["leg1_smooth_field"]["by_t"].items():
            print(f"  t={t_str}: rel_err per degree = {['%.3f' % v for v in res['rel_err']]}")
        timing = report["timing"]
        print(f"Timing: closed_form={timing['t_closed_s']:.8f}s simulate={timing['t_simulate_s']:.4f}s "
              f"speedup={timing['speedup']:.1f}x (N={timing['n']}, reps={timing['reps']})")
        if "leg2_real_corpus" in report:
            leg2 = report["leg2_real_corpus"]
            if "error" in leg2:
                print(f"Leg 2 (real corpus): {leg2['error']}")
            else:
                print(f"Leg 2 (real corpus): rows={leg2['n_rows']} unique={leg2['n_unique_rows']}")
                print(f"  A_1(t) before smoothing = {leg2['A1_before']:.4f} (pass>0.3: {leg2['atomic_pass']})")
                print(f"  A_1(t) after  smoothing = {leg2['A1_after']:.4f} "
                      f"(pass<=half: {leg2['deatomize_pass']})")
        print(f"Overall: {'PASS' if ok else 'FAIL'}")

    if args.real_corpus and "error" in report.get("leg2_real_corpus", {}):
        return 1
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
