#!/usr/bin/env python3
"""
zernike.py -- the disk-side Zernike moment spectrum of the corpus.

Slot 3 of refs/zernike-fit-2026-08-24.md. The corpus lives on the pre-lift
PCA disk; the 16 real spherical harmonics only exist AFTER the stereographic
lift. Zernike polynomials are the canonical orthogonal system on that disk
(radial parts are Jacobi polynomials), so the Zernike moment spectrum of the
corpus point distribution is the pre-lift twin of the E_lm Parseval shares.
Comparing the two spectra isolates the lift's own footprint.

House discipline: everything computed here about the corpus is
MEASUREMENT-type -- seeded, faced with a curveball null in CI, never called
a proof. The only identity-type content is the radial-polynomial algebra
(closed form, R_n^m(1) = 1, exact small-order coefficients), which
--selftest checks exactly.

CONVENTIONS
  Pipeline (mirrors tools/spectral-defocus/defocus.py matrix_to_sphere, but
  STOPS BEFORE the lift):
      z-score columns -> SVD/PCA -> top-2 scores -> RMS rescale
      -> deterministic PCA sign fix -> divide by max radius so max rho = 1.
  The max-radius normalization is required because Zernike polynomials are
  only orthogonal on the UNIT disk; it is reported in the output.
  Noll indexing j = 1..15 (n <= 4), Noll normalization: mean over the
  uniform unit disk of Z_i Z_j = delta_ij.
  Spectrum: a_j = mean over corpus points of Z_j(rho, theta)  (the density
  moment against the orthonormal basis). Shares s_j = a_j^2 / sum a_j^2 with
  the piston j = 1 EXCLUDED (a_1 = 1 identically for any point set).

numpy only. Deterministic given --seed.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import zipfile

import numpy as np

DEFAULT_SEED = 20260822
REAL_CORPUS_ZIP = "papers/is-this-x-2026-08-12-Final.zip"
REAL_CORPUS_MEMBER = "is-this-x-2026-08-12/data/real/per_row_coverage_v3.json"

# Sphere-side t=0 per-degree Parseval shares [E0, E1, E2, E3] from the
# unified paper -- the post-lift object this channel is the twin of.
SPHERE_T0_SHARES = [0.3457, 0.3352, 0.2752, 0.0439]

ADMISSION_Z = 3.0


# ---------------------------------------------------------------------------
# Copied verbatim from papers/data/lean/verify_claims.py (do not modify).
# ---------------------------------------------------------------------------
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


def load_real_matrix(zip_path=REAL_CORPUS_ZIP, member=REAL_CORPUS_MEMBER):
    with zipfile.ZipFile(zip_path) as z:
        with z.open(member) as f:
            j = json.load(f)
    M = np.array([r["covered"] for r in j["rows"]], dtype=np.int8)
    assert M.shape == (2286, 9), M.shape
    return M


# ---------------------------------------------------------------------------
# Zernike machinery: Noll j = 1..15 (n <= 4)
# ---------------------------------------------------------------------------
# (j, n, m, kind) with kind in {"m0", "cos", "sin"}; Noll's rule: for m > 0,
# even j takes cos(m theta), odd j takes sin(m theta).
NOLL = [
    (1, 0, 0, "m0"),
    (2, 1, 1, "cos"), (3, 1, 1, "sin"),
    (4, 2, 0, "m0"), (5, 2, 2, "sin"), (6, 2, 2, "cos"),
    (7, 3, 1, "sin"), (8, 3, 1, "cos"), (9, 3, 3, "sin"), (10, 3, 3, "cos"),
    (11, 4, 0, "m0"), (12, 4, 2, "cos"), (13, 4, 2, "sin"),
    (14, 4, 4, "cos"), (15, 4, 4, "sin"),
]
N_BASIS = len(NOLL)
DEGREE_N = np.array([n for (_, n, _, _) in NOLL])

NOLL_NAMES = {
    1: "piston", 2: "tilt-x", 3: "tilt-y", 4: "defocus",
    5: "astig-oblique", 6: "astig-vertical", 7: "coma-y", 8: "coma-x",
    9: "trefoil-y", 10: "trefoil-x", 11: "spherical",
    12: "2nd-astig-vertical", 13: "2nd-astig-oblique",
    14: "quadrafoil-x", 15: "quadrafoil-y",
}


def radial_terms(n, m):
    """Exact closed form: R_n^m(rho) = sum_k (-1)^k (n-k)! /
    (k! ((n+m)/2-k)! ((n-m)/2-k)!) rho^(n-2k).
    Returns a list of (power, coefficient) with integer-valued coefficients."""
    m = abs(int(m))
    n = int(n)
    if m > n or (n - m) % 2 != 0:
        raise ValueError("invalid (n, m) = (%d, %d)" % (n, m))
    terms = []
    for k in range((n - m) // 2 + 1):
        num = math.factorial(n - k)
        den = (math.factorial(k) * math.factorial((n + m) // 2 - k)
               * math.factorial((n - m) // 2 - k))
        terms.append((n - 2 * k, ((-1) ** k) * num / den))
    return terms


def radial(n, m, rho):
    rho = np.asarray(rho, dtype=float)
    out = np.zeros_like(rho)
    for p, c in radial_terms(n, m):
        out = out + c * np.power(rho, p)
    return out


def zernike(j, rho, theta):
    """Noll-orthonormalized Z_j on the unit disk."""
    _, n, m, kind = NOLL[j - 1]
    rad = radial(n, m, rho)
    if kind == "m0":
        return math.sqrt(n + 1.0) * rad
    norm = math.sqrt(2.0 * (n + 1.0))
    ang = np.cos(m * theta) if kind == "cos" else np.sin(m * theta)
    return norm * rad * ang


def design_matrix(rho, theta):
    """(N,) polar coords -> (N, 15) Zernike design matrix."""
    return np.stack([zernike(j, rho, theta) for j in range(1, N_BASIS + 1)], axis=1)


# ---------------------------------------------------------------------------
# Pipeline: binary matrix -> pre-lift PCA disk
# ---------------------------------------------------------------------------
def matrix_to_disk(matrix):
    """z-score columns -> PCA top-2 -> RMS rescale -> deterministic sign fix
    -> normalize so max radius = 1. Returns (uv (N,2), info dict).

    PCA SIGN CONVENTION (explicit, and it matters): the sign of each singular
    vector is arbitrary in any SVD, and a sign flip of PC1 or PC2 reflects the
    disk, which flips the sign of individual Zernike coefficients a_j. Squared
    shares happen to be invariant under an axis reflection, but the raw a_j
    are not, and null draws must be treated identically to the real matrix, so
    we fix signs deterministically: in each of the top-2 loading vectors, the
    entry of largest absolute value is forced positive (first index wins ties).
    """
    X = np.asarray(matrix, dtype=float)
    mu = X.mean(axis=0)
    sd = X.std(axis=0)
    sd_safe = np.where(sd > 1e-12, sd, 1.0)
    Z = (X - mu) / sd_safe

    U, S, Vt = np.linalg.svd(Z, full_matrices=False)
    scores = U * S

    for i in (0, 1):
        k = int(np.argmax(np.abs(Vt[i])))
        if Vt[i, k] < 0:
            scores[:, i] = -scores[:, i]
            Vt[i] = -Vt[i]

    uv = scores[:, :2]
    rms = math.sqrt(float(np.mean(np.sum(uv ** 2, axis=1))))
    uv = uv / rms if rms > 1e-12 else uv
    rmax = float(np.max(np.sqrt(np.sum(uv ** 2, axis=1))))
    uv_unit = uv / rmax if rmax > 1e-12 else uv

    info = {
        "rms_scale": rms,
        "max_radius_before_unit_normalization": rmax,
        "singular_values_top4": [float(v) for v in S[:4]],
    }
    return uv_unit, info


def zernike_spectrum(uv):
    """uv: (N,2) points with max radius <= 1. Returns (a, shares, energy).

    a_j     = mean over points of Z_j (density moment against the basis)
    energy  = sum_{j>=2} a_j^2   (total non-piston moment energy)
    shares  = a_j^2 / energy, with shares[0] (piston) set to 0 by convention.
    """
    rho = np.sqrt(np.sum(uv ** 2, axis=1))
    theta = np.arctan2(uv[:, 1], uv[:, 0])
    a = design_matrix(rho, theta).mean(axis=0)
    e = a ** 2
    energy = float(e[1:].sum())
    shares = np.zeros(N_BASIS)
    if energy > 0:
        shares[1:] = e[1:] / energy
    return a, shares, energy


def shares_by_n(shares):
    """Group non-piston shares by radial order n = 1..4."""
    return [float(shares[DEGREE_N == n].sum()) for n in (1, 2, 3, 4)]


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
def _report(name, ok, detail, failures):
    print("%s %s -- %s" % (name, "PASS" if ok else "FAIL", detail), flush=True)
    if not ok:
        failures.append(name)


def selftest(seed=DEFAULT_SEED, n_quad=400000):
    failures = []

    # (a) orthonormality by seeded Monte Carlo quadrature on the unit disk.
    rng = np.random.default_rng(seed)
    r = np.sqrt(rng.random(n_quad))
    th = rng.random(n_quad) * 2.0 * math.pi
    Zm = design_matrix(r, th)
    G = (Zm.T @ Zm) / n_quad
    diag = np.diag(G)
    off = G - np.diag(diag)
    max_diag_rel = float(np.max(np.abs(diag - 1.0)))
    max_off = float(np.max(np.abs(off)))
    ok_a = max_diag_rel < 2e-2 and max_off < 3e-2
    _report("SELFTEST_A_ORTHONORMALITY", ok_a,
            "MC quadrature n=%d seed=%d: max|diag-1|=%.4f (tol 2e-2), max|offdiag|=%.4f (tol 3e-2)"
            % (n_quad, seed, max_diag_rel, max_off), failures)

    # (b) R_n^m(1) = 1 for every implemented (n, m).
    worst = 0.0
    for (_, n, m, _kind) in NOLL:
        worst = max(worst, abs(float(radial(n, m, np.array([1.0]))[0]) - 1.0))
    ok_b = worst < 1e-12
    _report("SELFTEST_B_RADIAL_AT_ONE", ok_b,
            "max |R_n^m(1) - 1| over %d implemented (n,m) pairs = %.2e" % (len(NOLL), worst),
            failures)

    # (c) planted 2-theta astigmatism lobe -> dominant j must be 6 (cos 2theta).
    # The radial law is the uniform-disk one (rho = sqrt(U)) so that the planted
    # structure is purely angular; a radially concentrated annulus would also
    # excite the higher radial orders (n=4) and is not the pattern under test.
    rng_c = np.random.default_rng(seed + 1)
    npt = 20000
    th_c = rng_c.normal(0.0, 0.25, npt) + math.pi * rng_c.integers(0, 2, npt)
    rho_c = np.sqrt(rng_c.random(npt))
    uv_c = np.stack([rho_c * np.cos(th_c), rho_c * np.sin(th_c)], axis=1)
    a_c, s_c, _e_c = zernike_spectrum(uv_c)
    jdom = int(np.argmax(s_c)) + 1
    ok_c = jdom == 6
    _report("SELFTEST_C_PLANTED_ASTIGMATISM", ok_c,
            "planted cos(2theta) lobes -> dominant j=%d (%s) share=%.4f; expected j=6 (astig-vertical)"
            % (jdom, NOLL_NAMES[jdom], s_c[jdom - 1]), failures)

    # (d) exact small-order radial coefficients.
    expected = {
        (2, 0): {2: 2.0, 0: -1.0},
        (3, 1): {3: 3.0, 1: -2.0},
        (4, 0): {4: 6.0, 2: -6.0, 0: 1.0},
    }
    ok_d = True
    bits = []
    for (n, m), exp in expected.items():
        got = dict(radial_terms(n, m))
        same = set(got.keys()) == set(exp.keys()) and all(
            abs(got[p] - exp[p]) < 1e-12 for p in exp)
        ok_d = ok_d and same
        bits.append("R_%d^%d=%s%s" % (n, m, sorted(got.items(), reverse=True),
                                      "" if same else " MISMATCH"))
    _report("SELFTEST_D_EXACT_COEFFICIENTS", ok_d,
            "expected R_2^0=2r^2-1, R_3^1=3r^3-2r, R_4^0=6r^4-6r^2+1; got " + "; ".join(bits),
            failures)

    # (e) admission on synthetic data with a known answer: a planted cos(2 theta) mode (j=6) must be
    # admitted with a large POSITIVE z; a matched null-like point set and the other modes must not be;
    # and the sign of z is exercised (negated z must not admit).
    rng_e = np.random.default_rng(seed + 2)
    n_pts, n_null_e = 4000, 30

    def _uniform_disk(k):
        rr = np.sqrt(rng_e.random(k))
        tt = rng_e.random(k) * 2.0 * math.pi
        return np.stack([rr * np.cos(tt), rr * np.sin(tt)], axis=1)

    null_sh = np.zeros((n_null_e, N_BASIS))
    for i in range(n_null_e):
        null_sh[i] = zernike_spectrum(_uniform_disk(n_pts))[1]
    th_e = rng_e.normal(0.0, 0.25, n_pts) + math.pi * rng_e.integers(0, 2, n_pts)
    rho_e = np.sqrt(rng_e.random(n_pts))
    planted = np.stack([rho_e * np.cos(th_e), rho_e * np.sin(th_e)], axis=1)
    coords_p = admission_coordinates(zernike_spectrum(planted)[1], null_sh)
    coords_q = admission_coordinates(zernike_spectrum(_uniform_disk(n_pts))[1], null_sh)
    by_j = {c["j"]: c for c in coords_p}
    adm_p = [c["j"] for c in coords_p if c["admitted"]]
    z6 = by_j[6]["z"]
    ok_e = (6 in adm_p and z6 is not None and z6 > 2 * ADMISSION_Z
            and not any(c["admitted"] for c in coords_q)
            and by_j[7]["z"] is not None and by_j[7]["z"] < ADMISSION_Z)
    _report("SELFTEST_E_ADMISSION_PLANTED_MODE", ok_e,
            "planted j=6: z=%s admitted=%s (need z>%.0f); admitted set %s; null-like set admitted %s"
            % ("n/a" if z6 is None else "%+.1f" % z6, 6 in adm_p, 2 * ADMISSION_Z, adm_p,
               [c["j"] for c in coords_q if c["admitted"]]), failures)

    if failures:
        print("SELFTEST: FAIL (%s)" % ", ".join(failures), flush=True)
        return 1
    print("SELFTEST: PASS", flush=True)
    return 0


# ---------------------------------------------------------------------------
# Corpus mode
# ---------------------------------------------------------------------------
def admission_coordinates(s_real, null_shares):
    """Per-coordinate admission test: z of the real share against the null shares, admitted iff the
    null is non-degenerate and z > ADMISSION_Z (one-sided, positive excess only)."""
    coords = []
    for j in range(2, N_BASIS + 1):
        col = null_shares[:, j - 1]
        mu = float(col.mean())
        sd = float(col.std(ddof=1))
        degenerate = not (sd > 1e-12)
        # None (JSON null), not NaN: RESULT_JSON must be strict JSON for the
        # CI log parser. A degenerate null means the coordinate is structurally
        # constant under the pipeline, so no z exists.
        z = None if degenerate else (float(s_real[j - 1]) - mu) / sd
        admitted = (not degenerate) and z > ADMISSION_Z
        coords.append({
            "j": j, "n": int(NOLL[j - 1][1]), "m": int(NOLL[j - 1][2]),
            "name": NOLL_NAMES[j], "real_share": float(s_real[j - 1]),
            "null_mean": mu, "null_sd": sd, "z": z,
            "null_degenerate": degenerate, "admitted": bool(admitted),
        })
    return coords


def run_corpus(zip_path, n_null, trades_per_row, seed):
    M = load_real_matrix(zip_path=zip_path)
    n_rows = M.shape[0]

    uv_real, info_real = matrix_to_disk(M)
    a_real, s_real, e_real = zernike_spectrum(uv_real)

    rng = np.random.default_rng(seed)
    null_shares = np.zeros((n_null, N_BASIS))
    null_energy = np.zeros(n_null)
    for i in range(n_null):
        Mn = curveball(M, trades_per_row * n_rows, rng)
        uv_n, _ = matrix_to_disk(Mn)
        _a_n, s_n, e_n = zernike_spectrum(uv_n)
        null_shares[i] = s_n
        null_energy[i] = e_n

    coords = admission_coordinates(s_real, null_shares)

    e_mu = float(null_energy.mean())
    e_sd = float(null_energy.std(ddof=1))
    e_degen = not (e_sd > 1e-12)
    e_z = None if e_degen else (e_real - e_mu) / e_sd
    energy_coord = {
        "name": "total_non_piston_moment_energy", "real": e_real,
        "null_mean": e_mu, "null_sd": e_sd, "z": e_z,
        "null_degenerate": e_degen,
        "admitted": bool((not e_degen) and e_z > ADMISSION_Z),
    }

    disk_by_n = shares_by_n(s_real)
    sph = SPHERE_T0_SHARES
    sph_renorm = [v / (1.0 - sph[0]) for v in sph[1:]]

    admitted = [c["j"] for c in coords if c["admitted"]]
    result = {
        "tool": "tools/zernike-spectrum/zernike.py",
        "slot": "refs/zernike-fit-2026-08-24.md slot 3 (disk-side twin of the Parseval shares)",
        "kind": "measurement",
        "seed": seed,
        "config": {
            "n_rows": int(n_rows), "n_cols": int(M.shape[1]),
            "n_null_draws": n_null, "trades_per_row": trades_per_row,
            "noll_j_max": N_BASIS, "radial_order_max": 4,
            "admission_threshold_z": ADMISSION_Z,
            "disk_normalization": "z-score -> PCA top-2 -> RMS rescale -> deterministic sign fix -> divide by max radius (max rho = 1)",
            "pca_sign_convention": "largest-|loading| entry of each top-2 right singular vector forced positive",
            "moment_definition": "a_j = mean over corpus points of Z_j(rho, theta); shares s_j = a_j^2 / sum_{j>=2} a_j^2 (piston j=1 excluded)",
        },
        "disk_geometry": info_real,
        "real_spectrum": {
            "a": [float(v) for v in a_real],
            "shares": [float(v) for v in s_real],
            "non_piston_energy": e_real,
            "shares_by_radial_order_n": {"n1": disk_by_n[0], "n2": disk_by_n[1],
                                          "n3": disk_by_n[2], "n4": disk_by_n[3]},
        },
        "admission": {"coordinates": coords, "energy": energy_coord,
                       "admitted_j": admitted,
                       "any_admitted": bool(admitted) or bool(energy_coord["admitted"])},
        "lift_footprint_comparison": {
            "sphere_t0_shares_E0_E3": sph,
            "sphere_t0_shares_renormalized_l1_l3": sph_renorm,
            "disk_shares_by_n_n1_n4": disk_by_n,
            "note": "disk side excludes piston (n=0) by construction; the sphere side is quoted both raw (with E0) and renormalized over l=1..3 for a like-for-like read. n and l are different quantum numbers -- this is a footprint diagnostic, not an identification.",
        },
    }

    # ---- human-readable report ----
    print("Zernike spectrum -- pre-lift PCA disk (Noll j=1..15, n<=4)")
    print("=" * 72)
    print("matrix:            %d rows x %d cols" % (n_rows, M.shape[1]))
    print("disk convention:   RMS rescale then divide by max radius (max rho = 1.0);")
    print("                   PCA signs fixed by largest-|loading| positive")
    print("RMS scale=%.6f  max radius before unit normalization=%.6f"
          % (info_real["rms_scale"], info_real["max_radius_before_unit_normalization"]))
    print("-" * 72)
    print("  j  n  m  name                 a_j          share      null mean   null sd     z        admit")
    for c in coords:
        print("  %2d %2d %2d  %-19s %+.6f   %.6f   %.6f   %.6f  %s  %s"
              % (c["j"], c["n"], c["m"], c["name"], a_real[c["j"] - 1], c["real_share"],
                 c["null_mean"], c["null_sd"],
                 ("  n/a " if c["null_degenerate"] else "%+7.2f" % c["z"]),
                 "PASS" if c["admitted"] else "FAIL"))
    print("  --  total non-piston moment energy: real=%.6f null=%.6f+/-%.6f z=%s %s"
          % (e_real, e_mu, e_sd, ("n/a" if e_degen else "%+.2f" % e_z),
             "PASS" if energy_coord["admitted"] else "FAIL"))
    print("-" * 72)
    order = np.argsort(s_real)[::-1][:5]
    print("top-5 shares: " + ", ".join(
        "j=%d %s %.4f" % (int(k) + 1, NOLL_NAMES[int(k) + 1], s_real[int(k)]) for k in order))
    print("disk shares by radial order n: n=1 %.4f  n=2 %.4f  n=3 %.4f  n=4 %.4f"
          % tuple(disk_by_n))
    print("sphere t=0 Parseval shares  : E0 %.4f  E1 %.4f  E2 %.4f  E3 %.4f (unified paper)"
          % tuple(sph))
    print("sphere renormalized l=1..3  : %.4f  %.4f  %.4f (E0 removed, to match the piston-free disk side)"
          % tuple(sph_renorm))
    print("admission bar: z > %.1f against a non-degenerate curveball null (the membership condition)."
          % ADMISSION_Z)
    if not result["admission"]["any_admitted"]:
        print("ADMISSION: no Zernike share coordinate and not the total moment energy passes the bar.")
        print("           This extends the 'no scalar coordinate survives the fixed-margin trial'")
        print("           finding (cf. A_1 z=+1.59, loxodromic flow coordinate u z=+1.64) to the")
        print("           pre-lift disk basis. Honest negative; measurement, not a proof.")
    else:
        print("ADMISSION: coordinates passing z>%.1f: %s (measurement, not a proof)."
              % (ADMISSION_Z, admitted))
    print("RESULT_JSON " + json.dumps(result), flush=True)
    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_parser():
    p = argparse.ArgumentParser(
        prog="zernike.py",
        description=("Zernike moment spectrum of the corpus on the pre-lift PCA disk -- "
                     "the disk-side twin of the spherical-harmonic Parseval shares."))
    p.add_argument("--selftest", action="store_true",
                   help="run the deterministic identity/quadrature self-tests and exit")
    p.add_argument("--corpus", action="store_true",
                   help="run the real 2286x9 corpus through the pipeline and the admission test")
    p.add_argument("--zip-path", default=REAL_CORPUS_ZIP)
    p.add_argument("--n-null", type=int, default=30,
                   help="curveball null draws for the admission test (default 30)")
    p.add_argument("--trades-per-row", type=int, default=20)
    p.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p.add_argument("--quad-points", type=int, default=400000,
                   help="Monte Carlo quadrature points for the orthonormality self-test")
    p.add_argument("--out", default=None, help="write the corpus result JSON to this path")
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    if not args.selftest and not args.corpus:
        build_parser().print_help()
        return 2
    rc = 0
    if args.selftest:
        rc = selftest(seed=args.seed, n_quad=args.quad_points)
        if rc != 0:
            return rc
    if args.corpus:
        res = run_corpus(args.zip_path, args.n_null, args.trades_per_row, args.seed)
        if args.out:
            with open(args.out, "w") as fh:
                fh.write(json.dumps(res, indent=2) + chr(10))
            print("wrote %s" % args.out)
    return rc


if __name__ == "__main__":
    sys.exit(main())
