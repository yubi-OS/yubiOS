#!/usr/bin/env python3
"""phonon-dispersion -- the acoustic/optical phonon reading of the curved-corpus
program, as a deterministic instrument. Pure stdlib (no numpy).

Companion to refs/acoustic-optical-phonons-bridge-2026-09-01.md and Lean
section 14 (papers/data/lean/CurvedCorpus.lean). Everything here is
identity-side: closed-form dispersion algebra, exact graph-Laplacian spectra,
Gaunt selection-rule combinatorics, and the Fermi-Dirac/Binomial identity for
the compass stationary law at linear Phi. Nothing here is a corpus statistic;
no curveball null is required because no corpus-specific claim is made.
Any future corpus-facing readout (e.g. the FD-residual "interaction beyond the
ideal two-state gas") must first pass its own curveball admission null.

Modes:
  --selftest            run all exact checks (CI gate; exits nonzero on any FAIL)
  --input PATH          verify the Q_9 Hamming geometry of a REAL corpus matrix (is-this-x zip,
                        per_row_coverage JSON, or 0/1 CSV): empirical pairwise Hamming-distance
                        distribution (direct popcount over all pairs vs the Walsh/Krawtchouk route),
                        column-pair identity, Walsh weight-1 coefficients vs column means, and the
                        graph-Laplacian Rayleigh quotient of the empirical density (edge sum vs
                        spectral sum). Exits nonzero on any mismatch.
  --dispersion M1 M2    print the diatomic two-branch dispersion table
  --gaunt L             print Gaunt triangle+parity triad counts for l <= L
  --fd EPS T            compare pi_T(k) at linear Phi(k)=EPS*k with Binomial(9,p)

Verified sources for every closed form are cited in the refs/ bridge doc.
"""

import json
import math
import sys
import zipfile
from fractions import Fraction
from functools import lru_cache

D_PRIMITIVES = 9  # the program's primitive count (coverage shells k = 0..9)


# ---------------------------------------------------------------- dispersion

def monatomic_omega(q, C=1.0, m=1.0, a=1.0):
    """1D monatomic chain: omega(q) = 2*sqrt(C/m)*|sin(q a / 2)|."""
    return 2.0 * math.sqrt(C / m) * abs(math.sin(q * a / 2.0))


def diatomic_omega2(q, m1, m2, C=1.0, a=1.0):
    """1D diatomic chain (cell period a, two masses): the two branches
    omega^2_{+,-}(q) = C(1/m1+1/m2) +/- C*sqrt((1/m1+1/m2)^2 - 4 sin^2(qa/2)/(m1 m2)).
    Returns (acoustic_sq, optical_sq)."""
    s = 1.0 / m1 + 1.0 / m2
    disc = s * s - 4.0 * (math.sin(q * a / 2.0) ** 2) / (m1 * m2)
    root = math.sqrt(max(disc, 0.0))
    return C * (s - root), C * (s + root)


def diatomic_gap(m1, m2, C=1.0):
    """Zone-boundary band gap: sqrt(2C/m_light) - sqrt(2C/m_heavy). 0 iff m1==m2."""
    ml, mh = min(m1, m2), max(m1, m2)
    return math.sqrt(2.0 * C / ml) - math.sqrt(2.0 * C / mh)


def klemens_allowed(m1, m2, C=1.0):
    """Klemens channel on the diatomic chain: zone-center optical ->
    two zone-boundary acoustic quanta is energetically allowed iff
    omega_opt(0) <= 2*omega_ac_max, i.e. iff m_heavy/m_light <= 3."""
    w_opt2 = 2.0 * C * (1.0 / m1 + 1.0 / m2)
    w_ac_max2 = 2.0 * C / max(m1, m2)
    return w_opt2 <= 4.0 * w_ac_max2 + 1e-12


# ---------------------------------------------------- Laplacian / Hamming

def binom(n, k):
    return math.comb(n, k)


def hamming_laplacian_check(d):
    """Exact integer check: on H(d,2) = Q_d, the combinatorial Laplacian
    L = D - A applied to the character chi_r(a) = (-1)^(r.a) gives
    2*wt(r) * chi_r. Verified for every r in {0,1}^d. Returns True/False."""
    n = 1 << d
    for r in range(n):
        wt = bin(r).count("1")
        for a in range(n):
            chi_a = -1 if bin(r & a).count("1") % 2 else 1
            # (L chi)(a) = d*chi(a) - sum over neighbors chi(a ^ 2^i)
            acc = d * chi_a
            for i in range(d):
                b = a ^ (1 << i)
                chi_b = -1 if bin(r & b).count("1") % 2 else 1
                acc -= chi_b
            if acc != 2 * wt * chi_a:
                return False
    return True


def hamming_zero_mode_check(d):
    """Zero mode of L = D - A on Q_d, tested three independent ways: (a) L applied to the all-ones
    function vanishes at every vertex; (b) the nullspace is exactly one-dimensional (exact integer rank of
    L over the rationals is 2^d - 1, so 0 is a SIMPLE eigenvalue: the graph is connected); (c) no other
    character is annihilated (only wt(r) = 0 gives eigenvalue 0). Returns True/False."""
    n = 1 << d
    for a in range(n):
        if d * 1 - sum(1 for i in range(d)) != 0:
            return False
    Lm = [[Fraction(0)] * n for _ in range(n)]
    for a in range(n):
        Lm[a][a] = Fraction(d)
        for i in range(d):
            Lm[a][a ^ (1 << i)] -= 1
    if any(sum(row) != 0 for row in Lm):
        return False
    rank = 0
    rows = [r[:] for r in Lm]
    for c in range(n):
        piv = next((r for r in range(rank, n) if rows[r][c] != 0), None)
        if piv is None:
            continue
        rows[rank], rows[piv] = rows[piv], rows[rank]
        for r in range(n):
            if r != rank and rows[r][c] != 0:
                f = rows[r][c] / rows[rank][c]
                rows[r] = [x - f * y for x, y in zip(rows[r], rows[rank])]
        rank += 1
    if rank != n - 1:
        return False
    return all((hamming_char_eigenvalue(d, r) == 0) == (r == 0) for r in range(n))


def hamming_char_eigenvalue(d, r):
    """Eigenvalue of L = D - A on the character chi_r read off at vertex 0: (L chi_r)(0) / chi_r(0)."""
    acc = d  # chi_r(0) = 1
    for i in range(d):
        acc -= -1 if bin(r & (1 << i)).count("1") % 2 else 1
    return acc


def sphere_eigen_measured(l, x):
    """Laplace-Beltrami eigenvalue of Y_l0 = P_l(x) from the Legendre ODE, measured not assumed:
    d/dx[(1-x^2) P_l'] = -lambda P_l with (1-x^2) P_l' = l (P_{l-1} - x P_l) exact by recurrence and the
    outer derivative a central difference. Returns lambda = -g'(x) / P_l(x)."""
    h = 1e-5

    def g(t):
        return l * (legendre(l - 1, t) - t * legendre(l, t))
    return -(g(x + h) - g(x - h)) / (2.0 * h) / legendre(l, x)


def sphere_eigen(l):
    """Laplace-Beltrami eigenvalue on S^2 and the program's energy decay rate."""
    return l * (l + 1), 2 * l * (l + 1)


# ------------------------------------------------------------------- Gaunt

def gaunt_allowed(l1, l2, l3):
    """Zonal (m=0) Gaunt selection rule: triangle + even parity."""
    tri = l3 <= l1 + l2 and l1 <= l2 + l3 and l2 <= l1 + l3
    return tri and (l1 + l2 + l3) % 2 == 0


def gaunt_counts(L):
    """(total, triangle_only, triangle_and_parity) triad counts for l_i <= L."""
    tot = tri = allowed = 0
    for l1 in range(L + 1):
        for l2 in range(L + 1):
            for l3 in range(L + 1):
                tot += 1
                t = l3 <= l1 + l2 and l1 <= l2 + l3 and l2 <= l1 + l3
                tri += t
                allowed += t and (l1 + l2 + l3) % 2 == 0
    return tot, tri, allowed


def wigner3j000(l1, l2, l3):
    """Wigner 3j symbol (l1 l2 l3; 0 0 0), exact closed form (Racah).
    Zero unless triangle holds and J = l1+l2+l3 is even."""
    J = l1 + l2 + l3
    if J % 2 == 1:
        return 0.0
    if not (l3 <= l1 + l2 and l1 <= l2 + l3 and l2 <= l1 + l3):
        return 0.0
    g = J // 2
    f = math.factorial
    delta = f(J - 2 * l1) * f(J - 2 * l2) * f(J - 2 * l3) / f(J + 1)
    val = ((-1) ** g) * math.sqrt(delta) * f(g) / (f(g - l1) * f(g - l2) * f(g - l3))
    return val


@lru_cache(maxsize=None)
def legendre(l, x):
    """P_l(x) by the Bonnet recurrence."""
    if l == 0:
        return 1.0
    if l == 1:
        return x
    return ((2 * l - 1) * x * legendre(l - 1, x) - (l - 1) * legendre(l - 2, x)) / l


def triple_legendre_integral(l1, l2, l3, n=4001):
    """Simpson integration of P_l1 P_l2 P_l3 over [-1, 1] (n odd)."""
    h = 2.0 / (n - 1)
    acc = 0.0
    for i in range(n):
        x = -1.0 + i * h
        w = 1.0 if i in (0, n - 1) else (4.0 if i % 2 == 1 else 2.0)
        acc += w * legendre(l1, x) * legendre(l2, x) * legendre(l3, x)
    return acc * h / 3.0


# --------------------------------------------- Fermi-Dirac / Binomial identity

def pi_T_linear_phi(eps, T, d=D_PRIMITIVES):
    """Compass stationary law pi_T(k) prop C(d,k) exp(-eps*k/T) at linear
    Phi(k) = eps*k, normalized."""
    w = [binom(d, k) * math.exp(-eps * k / T) for k in range(d + 1)]
    z = sum(w)
    return [x / z for x in w]


def binomial_fd(eps, T, d=D_PRIMITIVES):
    """Binomial(d, p) with the Fermi-Dirac per-primitive occupancy
    p = 1/(1 + exp(eps/T))."""
    p = 1.0 / (1.0 + math.exp(eps / T))
    return [binom(d, k) * (p ** k) * ((1.0 - p) ** (d - k)) for k in range(d + 1)]


# ---------------------------------------------------------------- selftest

def selftest():
    ok_all = True

    def check(name, ok, detail=""):
        nonlocal ok_all
        ok_all &= ok
        print(("PASS" if ok else "FAIL") + f" {name}" + (f" -- {detail}" if detail else ""))

    # 1. Diatomic branch anatomy (m1=1, m2=3, C=1).
    m1, m2, C = 1.0, 3.0, 1.0
    s = 1.0 / m1 + 1.0 / m2
    ac0, op0 = diatomic_omega2(0.0, m1, m2, C)
    check("acoustic_gapless_at_zone_center", abs(ac0) < 1e-12, f"omega2_-(0)={ac0:.2e}")
    check("optical_zone_center", abs(op0 - 2 * C * s) < 1e-12,
          f"omega2_+(0)={op0:.6f} vs 2C(1/m1+1/m2)={2*C*s:.6f}")
    acb, opb = diatomic_omega2(math.pi, m1, m2, C)  # zone boundary of the cell BZ
    check("zone_boundary_heavy", abs(acb - 2 * C / m2) < 1e-12, f"{acb:.6f} vs {2*C/m2:.6f}")
    check("zone_boundary_light", abs(opb - 2 * C / m1) < 1e-12, f"{opb:.6f} vs {2*C/m1:.6f}")
    check("gap_positive_unequal_masses", diatomic_gap(m1, m2) > 0,
          f"gap={diatomic_gap(m1, m2):.6f}")
    check("gap_closes_equal_masses", abs(diatomic_gap(2.0, 2.0)) < 1e-15)
    # acoustic branch monotone on [0, pi]
    qs = [math.pi * i / 200 for i in range(201)]
    mono = all(diatomic_omega2(qs[i], m1, m2)[0] <= diatomic_omega2(qs[i + 1], m1, m2)[0] + 1e-12
               for i in range(200))
    check("acoustic_branch_monotone", mono)
    # monatomic consistency: diatomic (cell period a=1, atom spacing a/2)
    # with m1=m2 collapses onto the monatomic chain at spacing 1/2
    w2eq, _ = diatomic_omega2(1.1, 1.7, 1.7)
    check("equal_mass_collapse_is_monatomic",
          abs(math.sqrt(w2eq) - monatomic_omega(1.1, 1.0, 1.7, 0.5)) < 1e-12)

    # 2. Klemens energy condition: allowed iff m_heavy/m_light <= 3.
    check("klemens_allowed_ratio2", klemens_allowed(1.0, 2.0))
    check("klemens_boundary_ratio3", klemens_allowed(1.0, 3.0))
    check("klemens_forbidden_ratio4", not klemens_allowed(1.0, 4.0))

    # 3. Acoustic sum rule / zero mode: Hamming Laplacian on characters, exact.
    check("hamming_laplacian_spectrum_d4", hamming_laplacian_check(4),
          "L chi_r = 2*wt(r) chi_r for all 16 characters of Q_4")
    check("hamming_zero_mode", all(hamming_zero_mode_check(d) for d in (1, 2, 3, 4)),
          "L*1 = 0, nullspace exactly span(1) (exact rank 2^d-1), only wt(r)=0 annihilated; d=1..4")

    # 4. S^2 spectrum vs Hamming: quadratic vs linear level penalty.
    worst_sph = 0.0
    tbl_ok = True
    for l in range(1, 9):
        for x in (0.15, 0.31, 0.47, -0.22, -0.58):
            if abs(legendre(l, x)) < 0.05:
                continue
            lam = sphere_eigen_measured(l, x)
            worst_sph = max(worst_sph, abs(lam - sphere_eigen(l)[0]) / (1.0 + l * (l + 1)))
            tbl_ok &= abs(lam - sphere_eigen(l)[0]) < 1e-4 * (1.0 + l * (l + 1))
            tbl_ok &= sphere_eigen(l)[1] == 2 * sphere_eigen(l)[0]
    tbl_ok &= sphere_eigen(0) == (0, 0)
    check("sphere_eigenvalues", tbl_ok,
          f"lambda(l)=l(l+1) measured from the Legendre ODE, l=1..8, worst rel dev {worst_sph:.1e}; rate = 2*lambda")
    ham_rates = [hamming_char_eigenvalue(9, (1 << j) - 1) for j in range(10)]   # eigenvalue 2j on wt-j characters
    dom_ok = (ham_rates == [2 * j for j in range(10)]
              and all(sphere_eigen(l)[1] > ham_rates[l] for l in range(1, 9)) and sphere_eigen(0)[1] == ham_rates[0])
    check("quadratic_dominates_hamming", dom_ok,
          f"Q_9 character eigenvalues {ham_rates[:5]}...; sphere rate 2l(l+1) > Hamming 2j for l=j>=1; equal at 0")

    # 5. Gaunt selection rules: counts + two-route verification.
    tot, tri, allowed = gaunt_counts(3)
    check("gaunt_counts_L3", (tot, tri, allowed) == (64, 34, 23),
          f"total={tot} triangle={tri} triangle+parity={allowed} forbidden={tot-allowed}")
    # two-route check: rule vs exact Wigner 3j(0,0,0) zero-pattern, l <= 5
    ok3j = all((abs(wigner3j000(a, b, c)) > 1e-15) == gaunt_allowed(a, b, c)
               for a in range(6) for b in range(6) for c in range(6))
    check("gaunt_rule_matches_wigner3j", ok3j, "zero pattern identical for all l<=5")
    # three-route check: Simpson triple-Legendre integral, l <= 4
    okint = True
    for a in range(5):
        for b in range(5):
            for c in range(5):
                z = abs(triple_legendre_integral(a, b, c)) < 1e-6
                if z == gaunt_allowed(a, b, c):
                    okint = False
    check("gaunt_rule_matches_integral", okint,
          "vanishing pattern of int P_a P_b P_c identical for all l<=4")

    # 6. Fermi-Dirac / Binomial identity at linear Phi (0 new parameters).
    okfd = True
    worst = 0.0
    for eps, T in ((0.5, 0.05), (1.0, 0.3), (-0.2, 0.1), (0.05, 0.041143)):
        a = pi_T_linear_phi(eps, T)
        b = binomial_fd(eps, T)
        worst = max(worst, max(abs(x - y) for x, y in zip(a, b)))
        okfd &= all(abs(x - y) < 1e-12 for x, y in zip(a, b))
    check("fermi_dirac_binomial_identity", okfd,
          f"pi_T(k) == Binomial(9, 1/(1+e^(eps/T))) at linear Phi; worst |diff|={worst:.2e}")

    print("SELFTEST: " + ("ALL PASS" if ok_all else "FAILURES PRESENT"))
    return 0 if ok_all else 1


# ------------------------------------------------------ real-corpus Q_9 geometry

def load_rows_as_masks(path):
    """Corpus rows as d-bit integers (bit c = coverage of primitive c). Returns (masks, d)."""
    if path.endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            j = json.load(z.open("is-this-x-2026-08-12/data/real/per_row_coverage_v3.json"))
        rows = [r["covered"] for r in j["rows"]]
    elif path.endswith(".json"):
        j = json.load(open(path))
        rows = [r["covered"] for r in j["rows"]] if isinstance(j, dict) and "rows" in j else j
    else:
        rows = [[int(v) for v in line.split(",")] for line in open(path) if line.strip()]
    d = len(rows[0])
    if any(len(r) != d or any(int(v) not in (0, 1) for v in r) for r in rows):
        raise ValueError("matrix is not rectangular 0/1")
    return [sum(int(v) << c for c, v in enumerate(r)) for r in rows], d


def walsh_hadamard(f):
    """Unnormalised fast Walsh-Hadamard transform: F(r) = sum_x f(x) (-1)^{r.x}."""
    a = list(f)
    h = 1
    while h < len(a):
        for i in range(0, len(a), 2 * h):
            for j in range(i, i + h):
                a[j], a[j + h] = a[j] + a[j + h], a[j] - a[j + h]
        h *= 2
    return a


def krawtchouk(d, j, i):
    """K_j(i) = sum_s (-1)^s C(i,s) C(d-i, j-s)."""
    return sum(((-1) ** s) * binom(i, s) * binom(d - i, j - s) for s in range(0, j + 1) if s <= i and j - s <= d - i)


def verify_corpus_geometry(path, verbose=True):
    masks, d = load_rows_as_masks(path)
    n = len(masks)
    N = 1 << d
    ok_all = True

    def check(name, ok, detail=""):
        nonlocal ok_all
        ok_all &= bool(ok)
        if verbose:
            print(("PASS" if ok else "FAIL") + f" {name}" + (f" -- {detail}" if detail else ""))

    check("matrix_shape", n >= 2 and d == D_PRIMITIVES, f"{n} rows x {d} primitives")

    # (1) direct all-pairs Hamming histogram (ordered pairs incl. i = j)
    direct = [0] * (d + 1)
    for a in masks:
        for b in masks:
            direct[bin(a ^ b).count("1")] += 1
    check("pair_count", sum(direct) == n * n, f"{sum(direct)} ordered pairs")

    # (2) column identity: sum over unordered pairs of d_H = sum_c n1_c * n0_c
    n1 = [sum((m >> c) & 1 for m in masks) for c in range(d)]
    pair_sum = sum(j * direct[j] for j in range(d + 1)) // 2
    col_sum = sum(n1[c] * (n - n1[c]) for c in range(d))
    check("column_pair_identity", pair_sum == col_sum, f"sum d_H over pairs {pair_sum} == sum_c n1*n0 {col_sum}")

    # (3) zero-distance pairs = collisions: sum over distinct vectors of m_v^2 (ordered, incl. i = j)
    mult = {}
    for m in masks:
        mult[m] = mult.get(m, 0) + 1
    check("zero_distance_is_collision_structure", direct[0] == sum(v * v for v in mult.values()),
          f"{len(mult)} distinct vectors, {direct[0]} ordered zero-distance pairs")

    # (4) Walsh route: direct characters from the rows vs WHT of the histogram
    hist = [0] * N
    for m in masks:
        hist[m] += 1
    F = walsh_hadamard(hist)            # F(r) = sum_rows (-1)^{r.x}
    spot = [0, 1, 3, 5, N - 1, 137 % N]
    direct_char = {r: sum(-1 if bin(r & m).count("1") % 2 else 1 for m in masks) for r in spot}
    check("walsh_matches_direct_characters", all(F[r] == direct_char[r] for r in spot), f"r in {spot}")
    check("walsh_weight1_is_column_mean", all(F[1 << c] == n - 2 * n1[c] for c in range(d)),
          "F(e_c) = n - 2 n1_c for all columns")
    check("walsh_parseval", sum(f * f for f in F) == N * sum(h * h for h in hist), "sum F^2 = 2^d sum hist^2")

    # (5) distance distribution via Krawtchouk: B_j = (1/2^d) sum_r F(r)^2 K_j(wt r)
    wt = [bin(r).count("1") for r in range(N)]
    kraw = [sum(F[r] * F[r] * krawtchouk(d, j, wt[r]) for r in range(N)) for j in range(d + 1)]
    check("distance_distribution_krawtchouk", all(kraw[j] == N * direct[j] for j in range(d + 1)),
          "direct pairwise histogram == Walsh/Krawtchouk route, exact integers")

    # (6) Laplacian Rayleigh quotient of the empirical density f = hist / n on Q_d, two routes
    f = [h / n for h in hist]
    edge = sum((f[x] - f[x ^ (1 << c)]) ** 2 for x in range(N) for c in range(d) if x < (x ^ (1 << c)))
    ff = sum(v * v for v in f)
    rq_graph = edge / ff
    Ff = [v / n for v in F]
    rq_spec = sum(2 * wt[r] * Ff[r] ** 2 for r in range(N)) / sum(Ff[r] ** 2 for r in range(N))
    check("rayleigh_quotient_graph_vs_spectral", abs(rq_graph - rq_spec) < 1e-9 * max(1.0, rq_graph),
          f"R = {rq_graph:.9f} (edge sum) vs {rq_spec:.9f} (sum 2wt|F|^2); bounds 0 <= R <= 2d = {2 * d}")
    check("rayleigh_quotient_in_spectrum_range", 0.0 < rq_graph < 2 * d)
    mean_d = sum(j * direct[j] for j in range(d + 1)) / (n * n)
    if verbose:
        print("INFO distance histogram (ordered pairs):", direct)
        print(f"INFO mean Hamming distance {mean_d:.6f}; Rayleigh quotient {rq_graph:.6f}; "
              f"distinct vectors {len(mult)} of {N}")
        print("REAL-CORPUS Q_9 VERIFICATION: " + ("ALL PASS" if ok_all else "FAILURES PRESENT"))
    return 0 if ok_all else 1


# --------------------------------------------------------------------- CLI

def main(argv):
    if "--selftest" in argv:
        return selftest()
    if "--input" in argv:
        i = argv.index("--input")
        if i + 1 >= len(argv):
            print("--input needs a PATH", file=sys.stderr)
            return 2
        return verify_corpus_geometry(argv[i + 1])
    if "--dispersion" in argv:
        i = argv.index("--dispersion")
        m1, m2 = float(argv[i + 1]), float(argv[i + 2])
        print("q/pi   omega_acoustic   omega_optical   (C=1, cell period a=1)")
        for j in range(11):
            q = math.pi * j / 10
            a2, o2 = diatomic_omega2(q, m1, m2)
            print(f"{j/10:4.1f}   {math.sqrt(max(a2,0)):14.6f}   {math.sqrt(o2):13.6f}")
        print(f"zone-center optical: {math.sqrt(2*(1/m1+1/m2)):.6f}   "
              f"band gap: {diatomic_gap(m1, m2):.6f}   "
              f"Klemens allowed: {klemens_allowed(m1, m2)}")
        return 0
    if "--gaunt" in argv:
        L = int(argv[argv.index("--gaunt") + 1])
        tot, tri, allowed = gaunt_counts(L)
        print(f"L={L}: triads={tot} triangle={tri} triangle+parity(allowed)={allowed} "
              f"forbidden={tot-allowed} forbidden_frac={(tot-allowed)/tot:.4f}")
        return 0
    if "--fd" in argv:
        i = argv.index("--fd")
        eps, T = float(argv[i + 1]), float(argv[i + 2])
        a = pi_T_linear_phi(eps, T)
        b = binomial_fd(eps, T)
        p = 1.0 / (1.0 + math.exp(eps / T))
        print(f"linear Phi(k)={eps}*k at T={T}: FD occupancy p = {p:.6f}")
        print(" k   pi_T(k)        Binomial(9,p)  |diff|")
        for k in range(D_PRIMITIVES + 1):
            print(f"{k:2d}   {a[k]:.10f}   {b[k]:.10f}  {abs(a[k]-b[k]):.2e}")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
