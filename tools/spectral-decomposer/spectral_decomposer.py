#!/usr/bin/env python3
"""
spectral_decomposer.py -- a curve-guided-self-ideate tool built on the
program's harmonic machinery and the curveball fixed-margin null.

Goal: given a corpus matrix M (N items x d primitives), produce a ranked list of
"new idea" candidates -- concrete, falsifiable single-cell experiments. Each
candidate has the lens-format shape of skills/curve-compass-skill (cycle-34):

    hypothesis, method, parameters, delta, verdict (YES | PARTIAL | NO), score, caveat

What a candidate measures (this is the point of the tool, read it):

  A candidate is ONE single-cell flip M[i,j]: 0 -> 1.  Its effect is the exact
  marginal change of the corpus statistic V2 (top-2 share of the correlation
  spectrum):

        dV2_real = V2(M + e_ij) - V2(M)                       (deterministic)

  Its control is the SAME kind of flip on curveball-null matrices M0 (fixed row and
  column sums, 20N trades per draw): a zero cell in the same column j, in a row with
  the same coverage as row i (row sums are preserved by the null), is flipped and

        dV2_null = V2(M0 + e_i'j) - V2(M0)

  is collected over the draws.  The reported quantities are

        expected_delta = mean(dV2_null)          what a generic flip of this kind does
        delta_v2_z     = (dV2_real - expected_delta) / sd(dV2_null)
        delta_dBc      = 20 log10 |delta_v2_z|    (Lean section 12 level law)

  so delta measures the CANDIDATE FLIP against the same flip on the null -- not
  L(M) - L(M0), which is the whole-corpus level and is the sonometer's number.
  Verdict: YES if delta_dBc >= +6 dBc (|z| >= 2), PARTIAL if >= 0 dBc (|z| >= 1),
  else NO.  This is a single-flip z-level; it is NOT the +15.6 dBc corpus
  detectability floor.

Spectral side: orthonormal real spherical harmonics Y_lm (l = 0..3) are evaluated
at the points of the PCA-top-2 + stereographic-lift embedding; the Parseval share
of degree l is S_l = sum_m c_lm^2 / sum_{l'} sum_m c_{l'm}^2 with
c_lm = (1/N) sum_i Y_lm(p_i) the SH projection of the empirical point density
(S_l >= 0, sum_l S_l = 1, monopole l = 0 measured).  Sparse cells are ranked by
the L2 change of the low-degree (l <= 2) SH reconstruction that closing the cell
causes (frozen PCA frame).

Lean anchors: curveball null = CurvedCorpus.trade_preserves_rowSum / colSum (Lean
section 8); reversibility / stationarity (section 9); level law L = 20 log10(|D|/sigma)
(section 12).

numpy only. Deterministic given --seed.

Usage:
    spectral_decomposer.py --selftest [--input <zip>]
    spectral_decomposer.py --input <corpus.json|zip|csv> [--top-k 8] [--draws 40] [--json]
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys

import numpy as np

DEFAULT_ZIP_CANDIDATES = ("papers/is-this-x-2026-08-12-Final.zip",
                          os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                       "..", "..", "papers", "is-this-x-2026-08-12-Final.zip"))

YES_DBC = 6.0
PARTIAL_DBC = 0.0


# ---------- corpus loaders ----------

def _load_zip(path: str):
    import zipfile
    with zipfile.ZipFile(path) as z:
        with z.open("is-this-x-2026-08-12/data/real/per_row_coverage_v3.json") as f:
            j = json.load(f)
    M = np.array([r["covered"] for r in j["rows"]], dtype=np.int8)
    slugs = [r.get("slug", f"row_{i}") for i, r in enumerate(j["rows"])]
    return M, slugs


def _load_json(path: str):
    with open(path) as f:
        j = json.load(f)
    if isinstance(j, dict) and "rows" in j:
        M = np.array([r["covered"] for r in j["rows"]], dtype=np.int8)
        slugs = [r.get("slug", f"row_{i}") for i, r in enumerate(j["rows"])]
        return M, slugs
    M = np.asarray(j, dtype=np.int8)
    return M, [f"row_{i}" for i in range(len(M))]


def _load_csv(path: str):
    M = np.loadtxt(path, delimiter=",", dtype=np.int8)
    return M, [f"row_{i}" for i in range(len(M))]


def load_corpus(path: str):
    if path.endswith(".zip"):
        return _load_zip(path)
    if path.endswith(".json"):
        return _load_json(path)
    return _load_csv(path)


# ---------- core machinery (mirrors tools/corpus-sonometer) ----------

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


def curveball(M, n_trades, rng):
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


def level_db(delta, sigma):
    return 20.0 * math.log10(abs(delta) / sigma)


def corpus_level(M, draws, window, rng):
    N = M.shape[0]
    vals = [v2_corr(curveball(M, window * N, rng)) for _ in range(draws)]
    mu = float(np.mean(vals))
    sd = float(np.std(vals, ddof=1))
    return level_db(v2_corr(M) - mu, sd), mu, sd


# ---------- real spherical harmonics (orthonormal) ----------

def fibonacci_lattice(n: int) -> np.ndarray:
    """N near-uniform points on S^2 via the golden-angle spiral. Used as the uniform-density
    reference (all l >= 1 moments ~ 0) in the selftest."""
    i = np.arange(n, dtype=float)
    phi = (1.0 + 5.0 ** 0.5) / 2.0
    z = 1.0 - (2.0 * i + 1.0) / n
    theta = 2.0 * np.pi * i / phi
    r = np.sqrt(1.0 - z * z)
    return np.stack([r * np.cos(theta), r * np.sin(theta), z], axis=1)


def sh_index(max_ell: int):
    """[(l, m)] for l = 0..max_ell, m = -l..l."""
    return [(l, m) for l in range(max_ell + 1) for m in range(-l, l + 1)]


def real_sh_matrix(dirs: np.ndarray, max_ell: int) -> np.ndarray:
    """Orthonormal real spherical harmonics Y_lm at unit vectors `dirs` -> (len(dirs), (max_ell+1)^2).

    Y_l0 = N_l0 P_l(cos t);  Y_lm = sqrt(2) N_lm P_l^m(cos t) cos(m p)  (m > 0);
    Y_l,-m = sqrt(2) N_lm P_l^m(cos t) sin(m p),  N_lm = sqrt((2l+1)/(4 pi) (l-m)!/(l+m)!).
    Associated Legendre by the stable forward recurrence in l (Condon-Shortley sign included,
    irrelevant for squared coefficients)."""
    dirs = np.asarray(dirs, float)
    x = np.clip(dirs[:, 2], -1.0, 1.0)
    s = np.sqrt(np.maximum(1.0 - x * x, 0.0))
    phi = np.arctan2(dirs[:, 1], dirs[:, 0])
    P = {}
    for m in range(max_ell + 1):
        dfact = 1.0
        for k in range(1, 2 * m, 2):          # (2m-1)!!
            dfact *= k
        P[(m, m)] = ((-1.0) ** m) * dfact * s ** m
        if m + 1 <= max_ell:
            P[(m + 1, m)] = x * (2 * m + 1) * P[(m, m)]
        for l in range(m + 2, max_ell + 1):
            P[(l, m)] = ((2 * l - 1) * x * P[(l - 1, m)] - (l + m - 1) * P[(l - 2, m)]) / (l - m)
    cols = []
    for (l, m) in sh_index(max_ell):
        am = abs(m)
        N = math.sqrt((2 * l + 1) / (4.0 * math.pi) * math.factorial(l - am) / math.factorial(l + am))
        if m == 0:
            cols.append(N * P[(l, 0)])
        elif m > 0:
            cols.append(math.sqrt(2.0) * N * P[(l, am)] * np.cos(am * phi))
        else:
            cols.append(math.sqrt(2.0) * N * P[(l, am)] * np.sin(am * phi))
    return np.stack(cols, axis=1)


def shares_from_points(points: np.ndarray, max_ell: int = 3, weights=None):
    """Parseval shares of the SH moments of an empirical point density on S^2.
    c_lm = (1/N) sum_i w_i Y_lm(p_i) (w = 1 unless given, then normalised to mean 1);
    E_l = sum_m c_lm^2; S_l = E_l / sum_l E_l."""
    Y = real_sh_matrix(points, max_ell)
    n = len(Y)
    w = np.ones(n) if weights is None else np.asarray(weights, float) * (n / np.sum(weights))
    c = (w[:, None] * Y).mean(0)
    idx = sh_index(max_ell)
    ell_of = np.array([l for l, _ in idx], dtype=int)
    E = np.array([float(np.sum(c[ell_of == l] ** 2)) for l in range(max_ell + 1)])
    tot = float(E.sum())
    shares = {str(l): float(E[l] / tot) for l in range(max_ell + 1)} if tot > 0 else {}
    return shares, c


def embed_sphere(M: np.ndarray):
    """PCA-top-2 (rows centred), scaled so the farthest row has radius 1, inverse-stereographic
    lift to S^2. Returns (points (n,3), frame dict with the pieces needed for a frozen-frame update)."""
    M = np.asarray(M, float)
    Xc = M - M.mean(0)
    _, _, Vt = np.linalg.svd(Xc, full_matrices=False)
    Vt = np.array(Vt[:2])
    for k in range(2):                       # canonical sign: largest-|loading| component positive
        i_max = int(np.argmax(np.abs(Vt[k]) >= np.abs(Vt[k]).max() - 1e-12))
        if Vt[k, i_max] < 0:
            Vt[k] = -Vt[k]
    top = Xc @ Vt.T
    r = float(np.linalg.norm(top, axis=1).max())
    if r > 0:
        top = top / r
    return _lift(top), {"top": top, "Vt2": Vt, "r": r if r > 0 else 1.0}


def _lift(top: np.ndarray) -> np.ndarray:
    u, v = top[:, 0], top[:, 1]
    denom = 1.0 + u * u + v * v
    return np.stack([2.0 * u / denom, 2.0 * v / denom, (u * u + v * v - 1.0) / denom], axis=1)


def parseval_shares(M: np.ndarray, max_ell: int = 3) -> dict:
    """Orthonormal real-SH Parseval shares of the corpus embedding (see module docstring)."""
    n, d = M.shape
    if n < 2 or d < 2:
        return {"shares": {}, "n": int(n), "d": int(d)}
    sphere, _ = embed_sphere(M)
    shares, _ = shares_from_points(sphere, max_ell)
    return {"shares": shares, "n": int(n), "d": int(d), "max_ell": max_ell}


# ---------- curve-guided-self-ideate ----------

def low_ell_coefficients(M: np.ndarray, low_ell: int = 2) -> np.ndarray:
    """SH moment vector c_lm (0 <= l <= low_ell) of the corpus embedding: the low-degree reconstruction."""
    sphere, _ = embed_sphere(M)
    return real_sh_matrix(sphere, low_ell).mean(0)


def sparse_cell_weights(M: np.ndarray, low_ell: int = 2, per_col: int = 8):
    """Weight of each shortlisted missing cell (i, j): the L2 norm of the change of the low-degree
    (l <= low_ell) SH reconstruction, ||c(M + e_ij) - c(M)||, with c re-measured after a full re-embedding
    (PCA refit, canonical sign) of the flipped matrix.  Cells are shortlisted per column by how far the
    closed cell moves its own embedded point on the frozen frame (cheap prefilter); only the shortlist is
    refit.  Returns (cells (K, 2), weights (K,))."""
    M = np.asarray(M)
    n, d = M.shape
    sphere, fr = embed_sphere(M)
    Ycur = real_sh_matrix(sphere, low_ell)
    c0 = Ycur.mean(0)
    cells, pre = [], []
    for j in range(d):
        rows = np.where(M[:, j] == 0)[0]
        if len(rows) == 0:
            continue
        shifted = fr["top"][rows] + fr["Vt2"][:, j][None, :] / fr["r"]
        mv = np.sqrt(((real_sh_matrix(_lift(shifted), low_ell) - Ycur[rows]) ** 2).sum(1))
        keep = np.argsort(-mv, kind="stable")[:per_col]
        cells.extend((int(rows[k]), j) for k in keep)
    w = []
    for (i, j) in cells:
        X = M.copy()
        X[i, j] = 1
        w.append(float(np.linalg.norm(low_ell_coefficients(X, low_ell) - c0)))
    return np.array(cells, dtype=int).reshape(-1, 2), np.array(w, float)


def sparse_cells(M: np.ndarray, top_k: int = 5) -> list:
    """The top_k missing cells (row, primitive) ranked by the low-degree (0 <= l <= 2) SH
    reconstruction gradient that closing the cell produces (largest first; ties by row, column).
    Shortlist size is per_col cells per primitive column (8 by default)."""
    cells, w = sparse_cell_weights(M, per_col=max(8, -(-top_k // max(M.shape[1], 1))))
    order = np.lexsort((cells[:, 1], cells[:, 0], -w))
    return [(int(cells[k, 0]), int(cells[k, 1])) for k in order[:top_k]]


def flip_effect(M: np.ndarray, i: int, j: int, v2_base: float = None) -> float:
    """Exact marginal dV2 of closing cell (i, j)."""
    if v2_base is None:
        v2_base = v2_corr(M)
    X = M.copy()
    X[i, j] = 1
    return v2_corr(X) - v2_base


def null_flip_effects(M, i, j, null_mats, null_v2, rng):
    """dV2 of the same kind of flip on each curveball-null matrix: a zero cell in column j, in a row
    whose coverage equals row i's (row sums are invariants of the null); falls back to any zero cell
    in column j if no such row exists. Returns (effects, n_row_matched)."""
    k_i = int(M[i].sum())
    out, matched = [], 0
    for M0, v0 in zip(null_mats, null_v2):
        zeros = np.where(M0[:, j] == 0)[0]
        if len(zeros) == 0:
            continue
        same_k = zeros[M0[zeros].sum(1) == k_i]
        pick = same_k if len(same_k) else zeros
        matched += int(len(same_k) > 0)
        r = int(rng.choice(pick))
        X = M0.copy()
        X[r, j] = 1
        out.append(v2_corr(X) - v0)
    return np.array(out, float), matched


def build_null(M, draws, window, rng):
    n = M.shape[0]
    mats = [curveball(M, window * n, rng) for _ in range(draws)]
    return mats, [v2_corr(X) for X in mats]


def ideate_candidates(M: np.ndarray, sparse: list, seed: int, cycle: int,
                      draws: int = 40, window: int = 20) -> list:
    """One lens-format candidate per sparse cell; delta = the flip itself vs the same flip on the null."""
    rng = np.random.default_rng(seed)
    n, d = M.shape
    null_mats, null_v2 = build_null(M, draws, window, rng)
    v2_real = v2_corr(M)
    mu_corpus, sd_corpus = float(np.mean(null_v2)), float(np.std(null_v2, ddof=1))
    base_L = level_db(v2_real - mu_corpus, sd_corpus)
    out = []
    rank = 0
    for (i, j) in sparse:
        rank += 1
        d_real = flip_effect(M, i, j, v2_real)
        eff, matched = null_flip_effects(M, i, j, null_mats, null_v2, rng)
        degenerate = len(eff) < 5 or float(np.std(eff, ddof=1)) <= 1e-15
        if degenerate:
            mu0, sd0, z, delta_db = (float(np.mean(eff)) if len(eff) else 0.0), 0.0, None, -300.0
            L_real = L_ctl = -300.0
        else:
            mu0, sd0 = float(np.mean(eff)), float(np.std(eff, ddof=1))
            z = (d_real - mu0) / sd0
            delta_db = level_db(d_real - mu0, sd0) if d_real != mu0 else -300.0
            L_real = level_db(d_real, sd0) if d_real != 0 else -300.0
            L_ctl = level_db(mu0, sd0) if mu0 != 0 else -300.0
        score = max(0, min(50, int(round((delta_db / 30.0) * 50 + 25))))
        verdict = "YES" if delta_db >= 6.0 else ("PARTIAL" if delta_db >= 0.0 else "NO")
        out.append({
            "lens": f"L{cycle:02d}-S{rank:02d}",
            "primitive": int(j),
            "row": int(i),
            "hypothesis": (
                f"Closing cell M[{i},{j}] moves V2 by more than the same kind of flip does on the "
                f"curveball null: |dV2_real - E[dV2_null]| >= 2 sd(dV2_null) (>= +6 dBc single-flip level)."),
            "method": (
                f"dV2_real = V2(M + e_{i},{j}) - V2(M), exact. Control: on each of {len(eff)} curveball-null "
                f"draws ({window}N trades) flip a zero cell of column {j} in a row of coverage "
                f"{int(M[i].sum())} and take V2(M0 + e) - V2(M0); z = (dV2_real - mean) / sd."),
            "parameters": {"row": int(i), "primitive": int(j), "draws": int(draws),
                           "window": int(window), "seed": int(seed), "n_null_flips": int(len(eff)),
                           "n_row_matched": int(matched)},
            "delta": {
                "dV2_real": float(d_real),
                "expected_delta": float(mu0),
                "null_flip_sd": float(sd0),
                "delta_v2_z": (None if z is None else float(z)),
                "L_real_dBc": float(L_real),
                "L_control_dBc": float(L_ctl),
                "delta_dBc": float(delta_db),
                "baseline_L_dBc": float(base_L),
            },
            "verdict": verdict,
            "score": score,
            "caveat": (
                "Single-flip z-level against the same flip on the curveball null at this column and row "
                "coverage; it is not the corpus-level dBc (that is the sonometer's number) and the null "
                "sd comes from a finite number of draws. Caustic check (Lean section 10) not run: verify "
                "the primitive is not near-degenerate before trusting the score."),
        })
    return out


def emit_lens_markdown(candidates: list, cycle: int, meta: dict) -> str:
    md = []
    md.append(f"# cycle-{cycle:02d}-lens -- spectral-decomposer output")
    md.append("")
    md.append("Generated by `tools/spectral-decomposer/spectral_decomposer.py`.")
    md.append("Each entry is a lens-format experiment proposal (see")
    md.append("`skills/curve-compass-skill/SKILL.md` v1.1.0).")
    md.append("")
    md.append(f"corpus: n={meta.get('n')} d={meta.get('d')} max_ell={meta.get('max_ell')}")
    sha = meta.get("content_sha", "")
    if sha:
        md.append(f"corpus content_sha: `{sha}`")
    md.append("")
    md.append("## Parseval shares (orthonormal real SH, per degree)")
    for ell, share in (meta.get("shares", {}) or {}).items():
        md.append(f"- Y_ell={ell}: {share:.4f}")
    md.append("")
    md.append("## Candidates (ranked by weight)")
    md.append("")
    for c in candidates:
        md.append(f"### {c['lens']}  (score {c['score']}/50, verdict {c['verdict']})")
        md.append(f"- **hypothesis:** {c['hypothesis']}")
        md.append(f"- **method:** {c['method']}")
        md.append(f"- **parameters:** row={c['row']} primitive={c['primitive']} "
                  f"draws={c['parameters']['draws']} window={c['parameters']['window']} "
                  f"seed={c['parameters']['seed']}")
        d = c['delta']
        zs = "n/a" if d['delta_v2_z'] is None else f"{d['delta_v2_z']:+.3f}"
        md.append(f"- **delta:** dV2_real = {d['dV2_real']:+.6e}, expected (null flip) = "
                  f"{d['expected_delta']:+.6e}, z = {zs}, delta = {d['delta_dBc']:+.2f} dBc "
                  f"(corpus baseline L = {d['baseline_L_dBc']:+.2f} dBc)")
        md.append(f"- **verdict:** {c['verdict']}")
        md.append(f"- **score:** {c['score']}/50")
        md.append(f"- **caveat:** {c['caveat']}")
        md.append("")
    md.append("---")
    md.append("Anchor: Lean section 8 (curveball preserves fibre), section 9 (reversibility")
    md.append("+ uniform stationarity), section 10 (uniqueness of the canonical")
    md.append("null on an irreducible fibre), section 12 (level laws).")
    return "\n".join(md)


# ---------- CLI + selftest ----------

def _find_zip(explicit=None):
    for p in ([explicit] if explicit else []) + list(DEFAULT_ZIP_CANDIDATES):
        if p and os.path.exists(p):
            return p
    return None


def _expected_verdict(delta_dbc):
    """Independent restatement of the verdict rule used only by the selftest."""
    if delta_dbc >= YES_DBC:
        return "YES"
    return "PARTIAL" if delta_dbc >= PARTIAL_DBC else "NO"


def _selftest(zip_path=None) -> int:
    oks = []

    def chk(name, cond, detail=""):
        print("%s %s %s" % (name, "PASS" if cond else "FAIL", detail), flush=True)
        oks.append(bool(cond))

    # --- spherical harmonics: orthonormal on S^2 (Gauss-Legendre x uniform phi, independent of the lattice)
    xg, wg = np.polynomial.legendre.leggauss(24)
    nph = 48
    ph = np.linspace(0.0, 2.0 * np.pi, nph, endpoint=False)
    CT, PH = np.meshgrid(xg, ph)
    st = np.sqrt(1.0 - CT ** 2)
    pts = np.stack([(st * np.cos(PH)).ravel(), (st * np.sin(PH)).ravel(), CT.ravel()], axis=1)
    W = (np.ones_like(PH) * wg[None, :] * (2.0 * np.pi / nph)).ravel()
    Y = real_sh_matrix(pts, 3)
    gram_dev = float(np.abs((Y * W[:, None]).T @ Y - np.eye(16)).max())
    chk("SH_ORTHONORMAL_L0_3", gram_dev < 1e-10, f"max |Gram - I| = {gram_dev:.2e}")
    z_, x_, y_ = pts[:, 2], pts[:, 0], pts[:, 1]
    col = {lm: k for k, lm in enumerate(sh_index(3))}
    err_y20 = float(np.abs(Y[:, col[(2, 0)]] - math.sqrt(5.0 / (16.0 * math.pi)) * (3 * z_ ** 2 - 1)).max())
    err_y33 = float(np.abs(np.abs(Y[:, col[(3, 3)]])
                           - np.abs(0.25 * math.sqrt(35.0 / (2.0 * math.pi)) * x_ * (x_ ** 2 - 3 * y_ ** 2))).max())
    chk("SH_CLOSED_FORMS", err_y20 < 1e-12 and err_y33 < 1e-12, f"Y20 {err_y20:.1e}, |Y33| {err_y33:.1e}")

    # --- Parseval shares: uniform lattice has no l >= 1 moments; a planted l = 3 lobe is recovered
    fib = fibonacci_lattice(4000)
    sh_u, _ = shares_from_points(fib, 3)
    chk("FIBONACCI_UNIFORM_MONOPOLE", sh_u["0"] > 0.9999, f"S0 = {sh_u['0']:.6f}")
    a = 0.5
    Y30 = real_sh_matrix(fib, 3)[:, col[(3, 0)]]
    sh_p, _ = shares_from_points(fib, 3, weights=1.0 + a * Y30)
    want3 = (a * a / (4 * math.pi)) / (1 + a * a / (4 * math.pi))
    chk("PLANTED_L3_LOBE_SHARE", abs(sh_p["3"] - want3) < 0.02 * want3 and sh_p["1"] < 1e-3 * sh_p["3"],
        f"S3 = {sh_p['3']:.5f}, theory {want3:.5f}")

    # --- exchangeable planted matrix and its curveball null
    rng_plant = np.random.default_rng(20260825)
    n, d = 60, 9
    M = np.zeros((n, d), dtype=np.int8)
    for i in range(n):
        M[i, (i + np.arange(4)) % d] = 1
    Mq = curveball(M, 20 * n, rng_plant)
    Mp = Mq.copy()
    Mp[:, 1] = Mp[:, 0]
    Lq, _, _ = corpus_level(Mq, draws=24, window=10, rng=rng_plant)
    Lp, _, _ = corpus_level(Mp, draws=24, window=10, rng=rng_plant)
    chk("QUIET_MATRIX_BELOW_15DBC", Lq < 15.0, f"Lq = {Lq:.2f} dBc")
    chk("PLANTED_EFFECT_DETECTED", Lp > Lq + 1.0, f"Lp = {Lp:.2f} dBc, Lq = {Lq:.2f} dBc")
    sh = parseval_shares(Mp, max_ell=3)
    s = sh["shares"]
    chk("SHARES_PARSEVAL_SYNTH",
        sorted(s) == ["0", "1", "2", "3"] and all(0.0 <= v <= 1.0 for v in s.values())
        and abs(sum(s.values()) - 1.0) < 1e-12, f"shares = {s}")

    # --- sparse-cell weights: the reported gradient equals an independent full re-embedding (own eigh PCA)
    rngw = np.random.default_rng(5)
    Mb = (rngw.random((400, 9)) < np.linspace(0.2, 0.8, 9)).astype(np.int8)
    cells_b, w_b = sparse_cell_weights(Mb)
    topb = sparse_cells(Mb, top_k=6)
    wb = {(int(a_), int(b_)): float(x) for (a_, b_), x in zip(cells_b, w_b)}

    def _indep_c(X):
        Xf = np.asarray(X, float)
        Xc = Xf - Xf.mean(0)
        wv, V = np.linalg.eigh(Xc.T @ Xc)
        V = V[:, np.argsort(wv)[::-1][:2]]
        for k in range(2):
            if V[np.argmax(np.abs(V[:, k]) >= np.abs(V[:, k]).max() - 1e-12), k] < 0:
                V[:, k] = -V[:, k]
        t = Xc @ V
        t = t / np.linalg.norm(t, axis=1).max()
        q = 1.0 + (t ** 2).sum(1)
        P3 = np.stack([2 * t[:, 0] / q, 2 * t[:, 1] / q, ((t ** 2).sum(1) - 1) / q], axis=1)
        return real_sh_matrix(P3, 2).mean(0)

    c_ref = _indep_c(Mb)
    dev = 0.0
    for (i, j) in topb:
        X = Mb.copy(); X[i, j] = 1
        dev = max(dev, abs(float(np.linalg.norm(_indep_c(X) - c_ref)) - wb[(i, j)]))
    chk("SPARSE_WEIGHT_IS_LOW_ELL_REFIT_GRADIENT", dev < 1e-9 and min(wb[c] for c in topb) > 0,
        f"max |w - independent refit| = {dev:.1e}")
    wt = [wb[c] for c in topb]
    chk("SPARSE_RANKED_BY_WEIGHT_NOT_COLUMN_STD", all(wt[k] >= wt[k + 1] for k in range(len(wt) - 1))
        and len({c[1] for c in topb}) > 1 or wt[0] > wt[-1],
        f"top weights {[round(x, 6) for x in wt]}, columns {[c[1] for c in topb]}")

    # --- flip-specific control: every missing cell of the pure curveball matrix and of the planted matrix
    all_q = [(int(i), int(j)) for i, j in zip(*np.where(Mq == 0))]
    all_p = [(int(i), int(j)) for i, j in zip(*np.where(Mp == 0))]
    cq = ideate_candidates(Mq, all_q, seed=20260825, cycle=34, draws=30, window=10)
    cp = ideate_candidates(Mp, all_p, seed=20260825, cycle=34, draws=30, window=10)
    cands = cq[:8]
    chk("CANDIDATES_GENERATED", len(cq) == len(all_q) > 0 and len(cp) == len(all_p) > 0,
        f"{len(cq)} + {len(cp)} candidates")
    v_base = v2_corr(Mq)
    exact_ok = all(abs(c["delta"]["dV2_real"] - flip_effect(Mq, c["row"], c["primitive"], v_base)) < 1e-12
                   and abs(flip_effect(Mq, c["row"], c["primitive"], v_base)
                           - (v2_corr(np.where((np.arange(n)[:, None] == c["row"])
                                              & (np.arange(d)[None, :] == c["primitive"]), 1, Mq)) - v_base)) < 1e-12
                   for c in cq[:40])
    chk("FLIP_DELTA_IS_EXACT_MARGINAL_V2", exact_ok)
    z_ok = all(c["delta"]["delta_v2_z"] is None or abs(
        c["delta"]["delta_v2_z"] - (c["delta"]["dV2_real"] - c["delta"]["expected_delta"]) / c["delta"]["null_flip_sd"]) < 1e-9
        for c in cq + cp)
    chk("Z_USES_FLIP_NULL_STATS", z_ok)
    verdict_ok = all(c["verdict"] == _expected_verdict(c["delta"]["delta_dBc"]) for c in cq + cp)
    chk("VERDICT_MATCHES_DELTA_LEVEL", verdict_ok)
    ny_q = sum(c["verdict"] == "YES" for c in cq)
    ny_p = sum(c["verdict"] == "YES" for c in cp)
    chk("NOT_ALL_YES_BUT_SOME_YES",
        0 < ny_q < 0.30 * len(cq) and 0 < ny_p < 0.30 * len(cp),
        f"YES: {ny_q}/{len(cq)} on the pure curveball matrix, {ny_p}/{len(cp)} on the planted matrix")
    chk("NULL_FALSE_POSITIVE_RATE_BOUNDED", ny_q / len(cq) < 0.20, f"{ny_q / len(cq):.3f} (|z| >= 2 cut)")

    # --- artifact round trip: numbers in the markdown are the numbers in the candidates
    meta = parseval_shares(Mp, max_ell=3)
    meta["content_sha"] = hashlib.sha256(Mp.tobytes()).hexdigest()[:16]
    cands = cq[:8]
    md = emit_lens_markdown(cands, cycle=34, meta=meta)
    heads = re.findall(r"### (L\d+-S\d+)  \(score (\d+)/50, verdict (\w+)\)", md)
    dlts = re.findall(r"delta = ([+-]\d+\.\d\d) dBc", md)
    rt = (len(heads) == len(cands) == len(dlts)
          and all(h[0] == c["lens"] and int(h[1]) == c["score"] and h[2] == c["verdict"]
                  and abs(float(x) - c["delta"]["delta_dBc"]) < 0.0051 for h, x, c in zip(heads, dlts, cands)))
    chk("ARTIFACT_ROUNDTRIP", rt)

    # --- real corpus: proper Parseval shares (S_3 ~ 0.28 on the corpus; the old tool printed 0.889)
    zp = _find_zip(zip_path)
    if zp is None:
        chk("REAL_CORPUS_PRESENT", False, "papers/is-this-x-2026-08-12-Final.zip not found (pass --input <zip>)")
    else:
        Mr, _ = load_corpus(zp)
        real = parseval_shares(Mr, max_ell=3)
        sr = real["shares"]
        chk("REAL_CORPUS_SHAPE", Mr.shape == (2286, 9), f"shape {Mr.shape}")
        chk("REAL_SHARES_PARSEVAL", sorted(sr) == ["0", "1", "2", "3"] and all(0.0 <= v <= 1.0 for v in sr.values())
            and abs(sum(sr.values()) - 1.0) < 1e-12, f"shares = {[round(sr[k], 4) for k in sorted(sr)]}")
        chk("REAL_S3_IN_BAND", 0.15 <= sr.get("3", -1.0) <= 0.50, f"S3 = {sr.get('3')}")
    if all(oks):
        print("SPECTRAL-DECOMPOSER SELFTEST: ALL PASS")
        return 0
    print("SPECTRAL-DECOMPOSER SELFTEST: FAIL")
    return 1


def main():
    ap = argparse.ArgumentParser(
        description=(
            "spectral-decomposer -- curve-guided-self-ideate built on the curveball fixed-margin null. "
            "Emits lens-format single-flip experiment candidates whose delta is the flip's effect on V2 "
            "against the same flip on the null."))
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--input", type=str, default=None, help="corpus path (json/zip/csv)")
    ap.add_argument("--cycle", type=int, default=34)
    ap.add_argument("--seed", type=int, default=20260825)
    ap.add_argument("--top-k", type=int, default=8)
    ap.add_argument("--max-ell", type=int, default=3)
    ap.add_argument("--draws", type=int, default=40, help="curveball null draws")
    ap.add_argument("--window", type=int, default=20, help="curveball trades per draw, in units of N")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of lens-format markdown")
    args = ap.parse_args()

    if args.selftest:
        sys.exit(_selftest(args.input if args.input and args.input.endswith(".zip") else None))

    if not args.input:
        ap.print_help()
        sys.exit(2)

    M, slugs = load_corpus(args.input)
    meta = parseval_shares(M, max_ell=args.max_ell)
    meta["content_sha"] = hashlib.sha256(M.tobytes()).hexdigest()[:16]
    sparse = sparse_cells(M, top_k=args.top_k)
    candidates = ideate_candidates(M, sparse, seed=args.seed, cycle=args.cycle,
                                   draws=args.draws, window=args.window)

    if args.json:
        out = {"corpus": meta, "candidates": candidates}
        print(json.dumps(out, indent=2, default=float))
        return

    print(emit_lens_markdown(candidates, args.cycle, meta))


if __name__ == "__main__":
    main()
