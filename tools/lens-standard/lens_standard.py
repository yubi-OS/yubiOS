# lens_standard.py — lens-standard-v1: the powered lens (measure -> correct) for the
# hierarchy-oracle program (V3 of the ideation round). Lane F, Python source of record.
#
# Pure stdlib, deterministic, no env access. Measuring is NEVER reimplemented here:
# D comes from edge-standard-v1 (threshold_for_coverage + trace_contours + measure)
# imported by path (see _EDGE_PATHS below).
#
# The lens is the adaptive-optics measure->correct loop applied to feature space:
#   1. measure D on the gold render (edge-standard-v1),
#   2. inject a known aberration mode (a deterministic coordinate warp of the ink,
#      forward-mapped pixel by pixel and re-rasterized),
#   3. estimate the mode coefficient FROM THE IMAGE ALONE (closed-form moment
#      algebra against the pre-registered reference frame, refined by ONE pinned
#      predictor-corrector step against the deterministic forward model — no
#      knowledge of the true coefficient, no iterative fitting; the only
#      iterations are fixed-count Newton solves of exact algebraic equations
#      with pinned step counts),
#   4. emit the inverse warp (the powered lens) and re-measure,
#   5. require D to return monotonically toward the un-aberrated reference.
#
# THE RASTERIZATION-Injectivity LAW (measured this lane, drives every family
# choice): a forward warp is exactly correctable through the nint re-rasterization
# iff it is INJECTIVE on the pixel lattice, i.e. every singular value >= 1.
# Expansion gives the inverse pass rounding slack (|J^-1| < 1 shrinks the first
# pass's <=0.5px rounding error back under the 0.5 quantum -> every pixel rounds
# home). Compression instead collides near-coincident sources into one
# destination pixel and the lost ink is unrestorable. Measured evidence
# (roundtrip with the EXACT coefficient, gasket/tri golds):
#   spherical s=+0.12   dD=+0.0000, pixdiff=0            (expansive: exact)
#   astig (1+a,1-a) a=0.1  tri: dD=+0.2005, comps 19->76  (y-compression: broken)
#   brief trefoil t=9e-4   gasket: dD=-0.0669, comps 366->326 (broken)
# The three families below are therefore all expansive on their pinned envelopes.
#
# The three modes (ONE coefficient each; warp about the pinned center
# CX = CY = 255.5; dx = x - CX, dy = y - CY; r = hypot(dx, dy)):
#
#   astig(a)   anamorphic scaling pair (the FrFT quadratic-phase analog;
#              expansive amendment of the brief's (1+a, 1-a) form — that form
#              compresses one axis below the rasterization quantum and is
#              uncorrectable, see the law above; the anisotropy character is
#              kept, kappa = 0.5 pins how much of it survives per unit a):
#                x' = CX + (1+a) dx,   y' = CY + (1 + a/2) dy
#              inverse (analytic): dx/(1+a), dy/(1+a/2). Central second
#              moments transform EXACTLY (affine map): mu20 -> (1+a)^2 mu20,
#              mu02 -> (1+a/2)^2 mu02, so with R = (mu20/mu02)_obs /
#              (mu20/mu02)_ref the exact solve is
#                a = ((R - 2) + sqrt(R)) / (2 - R/2)     [small-|a| root;
#              discriminant collapses to R; the other root is O(1) away]
#
#   spherical(s) radial breathing (Zernike defocus-order, unchanged from the
#              brief; pinned envelope uses POSITIVE s = pure expansion):
#                r' = r * (1 + s (r/R_MAX)^2),  R_MAX = 256
#              inverse: fixed-12-step Newton on u + s u^3/R^2 = r' (monotone
#              convergence for |s| < 1/3, f' = 1 + 3 s u^2/R^2 > 0), then
#              rescale the point by u/r'. The second raw radial moment obeys
#              the EXACT per-point identity E[r'^2] = E[r^2 (1+s t)^2] with
#              t = (r/R_MAX)^2, i.e. A s^2 + B s + C = 0 with A = E[r^6]/R^4,
#              B = 2 E[r^4]/R^2, C = E[r^2] - E[r'^2] — all coefficients
#              closed-form sums of the reference frame; the smaller-|s| root
#              is exact in the continuum model.
#
#   trefoil(t) the brief's quadratic shear VERBATIM
#                x' = x + t (dy^2 - dx^2),  y' = y + 2 t dx dy
#              (z' = z - t conj(z)^2, the m=2 harmonic; "trefoil-like" per the
#              lane brief), composed with a coefficient-dependent expansive
#              zoom floor:
#                beta(t) = 400 |t| / (1 - 400 |t|);   z'' = (1 + beta) z'
#              WHY: the shear's singular values are 1 +/- 2 t r, so sigma_min
#              = 1 - 2|t| r < 1 — every shear flow compresses one local
#              diagonal, and compression collides near-coincident sources into
#              one destination pixel whose ink is then unrestorable (measured:
#              bare shear roundtrip-true comps 19->76 on the tri, 366->326 on
#              the gasket at signal-bearing t). The zoom floor restores
#              sigma_min >= 1 for ink within r <= 200 of center (both golds:
#              gasket 198, tri 140), making the forward rasterization
#              injective and the loop exactly closable; beta(0) = 0 preserves
#              idempotence, and the isotropic zoom is box-counting-invariant
#              so it carries no D-signal of its own. Third-moment identity
#              (exact, per-point, with the known zoom factor folded out):
#                chi3_obs = (1+beta)^3 * [chi3 + c1 t + c2 t^2 + c3 t^3]
#                c1 = -3 sum |z|^4 (real, O(sum r^4) — never vanishes),
#                c2 = 3 sum z conj(z)^4,  c3 = -sum conj(z)^6
#              solved by a fixed-6-step Newton on Im(f(t)) with
#              f(t) = (1+beta(t))^3 P(t) - chi3_obs,
#              f'(t) = 3(1+beta)^2 beta'(t) P(t) + (1+beta)^3 (c1 + 2 c2 t + 3 c3 t^2),
#              beta'(t) = 400 sign(t) / (1 - 400|t|)^2 (sign(0) := +1).
#
# Rounding rule (pinned, mirrors the codebase's JS-parity style): every warped
# coordinate is re-rasterized with nint(v) = floor(v + 0.5) (JS Math.round
# half-up); destinations outside the canvas are DROPPED; sources are visited in
# row-major order so collision writes are deterministic (ink is binary).
#
# Estimator semantics: reference-relative (AO-style calibration against the
# known reference frame of the SAME arrangement). The estimator sees only the
# observed mask plus the pre-registered reference mask — never the true
# coefficient. Refinement: TWO pinned predictor-corrector steps — re-estimate
# the residual against the deterministic forward model Warp(ref, t) rasterized
# by the SAME rule; t <- t + c to first order (exact for the twist-free
# families' small residuals; neglected O(t0*c) <= 2e-4 elsewhere). Two steps,
# not one: the intermediate model's own rasterization noise decorrelates the
# estimate (measured: one step made tri-astig-0.2 WORSE, 5.9e-5 -> -2.4e-3);
# the second step re-cancels it (measured: uniform residual <= 7.6e-4 and
# dD_corrected - d_ref = 0.0000 on all 12 gold cases). On an un-aberrated
# render every stage reads exactly 0.0 and the identity correction is
# byte-exact (idempotence, gated).
#
# Pre-registered tolerances (EST_TOL, derived from the rounding model, not from
# measured D outcomes): with injective forward maps there is NO collision
# thinning; the residual estimator error after the corrector is the nint
# rounding noise (per-pixel <= 0.5 px per axis; coherent worst-case relative
# moment error ~ r_max/r_rms^2 ~ 1e-2, incoherent ~1e-4) plus the corrector's
# O(t0*c1) term. Pinned: 5e-3 for all three modes (~ the coherent bound,
# 0.3-0.5 px of worst-case residual displacement; measured errors are reported
# per case and run 1e-5..2e-3). If a measured error exceeds its tolerance the
# selftest FAILs and the error is reported — tolerances are never retuned to
# reach green.

import hashlib
import importlib.util
import json
import math
import os
import sys

PIPELINE = "lens-standard-v1"
SIZE = 512
CENTER = (SIZE - 1) / 2.0          # pinned warp/moment center (255.5, 255.5)

# --- gold renders (reused from the edge-standard falsification corpus) -------
GASKET_L = 384
GASKET_R = 3
GASKET_DEPTHS = 6                  # merged vertex set, dedupe keeping coarsest
TRI_ROWS = (3, 4, 5, 4, 3)
TRI_A = SIZE * 52 // 512
TRI_DY = SIZE * 45 // 512
TRI_R = SIZE * 16 // 512

# --- mode envelopes ----------------------------------------------------------
R_MAX = SIZE // 2                  # 256: spherical field radius / twist scale
_R2 = float(R_MAX * R_MAX)
ASTIG_KAPPA = 0.5                  # y-axis slope of the anamorphic pair
MAX_ASTIG = 0.5                    # |a| envelope (x-scale in (0.5, 1.5))
MAX_SPHERICAL = 0.3                # s envelope (Newton monotone for |s| < 1/3)
MAX_TREFOIL = 2.0e-4               # |t| guard envelope (certified injection
                                   # magnitudes are the pinned ABERRATIONS,
                                   # max 1.5e-4; the guard carries headroom so a
                                   # legitimate estimate can land microscopically
                                   # outside the certified set: at 2e-4 the zoom
                                   # floor still gives composite sigma_min = 1.0014
                                   # >= 1 and the m=2 field's radial reach stays
                                   # inside the canvas)
TREFOIL_ZOOM_K = 460.0             # beta(t) = K|t|/(1-K|t|); K = 2*r_ink_max + margin
                                   # (certified for ink within r <= 226 of center)
TREFOIL_INVERSE_STEPS = 12         # shear-inverse 2x2 Newton (fixed count)

ABERRATIONS = (
    ("astig", 0.10), ("astig", 0.20),
    ("spherical", 0.06), ("spherical", 0.12),
    ("trefoil", 0.0001), ("trefoil", 0.00015),
)

EST_TOL = {"astig": 5e-3, "spherical": 5e-3, "trefoil": 5e-3}
D_BAND = 0.05                      # pre-registered known-answer band
EST_NEWTON_STEPS = 6               # trefoil estimator (fixed count, pinned)
EST_CORRECTOR_STEPS = 2            # predictor-corrector depth (fixed, pinned)
SPHERICAL_INVERSE_STEPS = 12       # spherical inverse root solve (fixed count)

_EDGE_PATHS = (
    # deployed in-repo location: tools/edge-standard/ is the sibling TOOL dir
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 os.pardir, "edge-standard", "edge_standard.py"),
    # session ingest mirror of yubi-OS/yubiOS tools/edge-standard/
    "/var/workspace/session/ingest-2026-10-06/yubiOS/tools/edge-standard/edge_standard.py",
)


def _load_edge_standard():
    """Import edge-standard-v1 by path (the measuring source of record)."""
    for path in _EDGE_PATHS:
        if os.path.isfile(path):
            spec = importlib.util.spec_from_file_location("edge_standard_lens", path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
    raise ImportError("edge_standard.py not found in: %s" % (", ".join(_EDGE_PATHS),))


_ES = _load_edge_standard()


# ---------------------------------------------------------------- gold renders
def render_disks(size, disks, gray=255):
    """Hard-pixel integer disk rasterization (inclusive <= r^2 test).

    Mirrors the falsification-corpus generator exactly: integer pixel space
    only, no anti-aliasing. Returns list of rows of 0/gray.
    """
    rows = [[0] * size for _ in range(size)]
    for cx, cy, r in disks:
        r2 = r * r
        for y in range(max(0, cy - r), min(size, cy + r + 1)):
            dy = y - cy
            row = rows[y]
            for x in range(max(0, cx - r), min(size, cx + r + 1)):
                dx = x - cx
                if dx * dx + dy * dy <= r2:
                    row[x] = gray
    return rows


def _mid(p, q):
    return ((p[0] + q[0]) // 2, (p[1] + q[1]) // 2)


def gen_gasket(size, L=GASKET_L, r=GASKET_R, depths=GASKET_DEPTHS):
    """Merged-gasket droplet arrangement: gen_gasket_v2 verbatim (6 depths,
    dedupe keeping the coarsest depth, integer midpoint recursion). Returns
    (x, y, r) droplets; uniform radius r=3 per the falsification corpus."""
    h = int(round(L * math.sqrt(3) / 2))
    a = (size // 2, size // 2 - 2 * h // 3)
    b = (size // 2 - L // 2, size // 2 + h // 3)
    c = (size // 2 + L // 2, size // 2 + h // 3)
    pts = {}

    def rec(p, q, rd, depth):
        for v in (p, q, rd):
            if v not in pts or depth < pts[v]:
                pts[v] = depth
        if depth >= depths:
            return
        pq, qr, rp = _mid(p, q), _mid(q, rd), _mid(rd, p)
        rec(p, pq, rp, depth + 1)
        rec(pq, q, qr, depth + 1)
        rec(rp, qr, rd, depth + 1)

    rec(a, b, c, 1)
    return [(x, y, r) for (x, y), _ in pts.items()]


def gen_tri(size):
    """Triangular-lattice patch: rows of [3, 4, 5, 4, 3] droplets (verbatim
    from the falsification corpus)."""
    disks = []
    for i, n in enumerate(TRI_ROWS):
        y = size // 2 + (i - 2) * TRI_DY
        x0 = size // 2 - (n - 1) * (TRI_A // 2)
        disks += [(x0 + j * TRI_A, y, TRI_R) for j in range(n)]
    return disks


def gold_render(name):
    if name == "gasket":
        return render_disks(SIZE, gen_gasket(SIZE))
    if name == "tri":
        return render_disks(SIZE, gen_tri(SIZE))
    raise ValueError("gold_render: unknown render %r" % (name,))


# ------------------------------------------------------------ coordinate warps
def _nint(v):
    """Pinned rounding rule: floor(v + 0.5) (JS Math.round half-up)."""
    return math.floor(v + 0.5)


def _check_coef(mode, c):
    if mode == "astig":
        if not (-MAX_ASTIG <= c <= MAX_ASTIG):
            raise ValueError("astig coefficient %r outside pinned envelope" % (c,))
    elif mode == "spherical":
        if not (-MAX_SPHERICAL <= c <= MAX_SPHERICAL):
            raise ValueError("spherical coefficient %r outside pinned envelope" % (c,))
    elif mode == "trefoil":
        if not (-MAX_TREFOIL <= c <= MAX_TREFOIL):
            raise ValueError("trefoil coefficient %r outside pinned envelope" % (c,))
    else:
        raise ValueError("warp: unknown mode %r" % (mode,))


def _forward_point(mode, c, dx, dy):
    """Continuous forward warp of a centered coordinate. Returns (dx', dy')."""
    if mode == "astig":
        return (1.0 + c) * dx, (1.0 + ASTIG_KAPPA * c) * dy
    if mode == "spherical":
        r = math.hypot(dx, dy)
        g = 1.0 + c * (r * r) / _R2
        return g * dx, g * dy
    if mode == "trefoil":
        sx = dx + c * (dy * dy - dx * dx)
        sy = dy + 2.0 * c * dx * dy
        z = 1.0 + _trefoil_beta(c)
        return z * sx, z * sy
    raise ValueError("warp: unknown mode %r" % (mode,))


def _trefoil_beta(t):
    """Pinned expansive zoom floor: beta(t) = K|t| / (1 - K|t|), beta(0) = 0.

    With K = TREFOIL_ZOOM_K = 460 and ink within r <= 226 of center, the
    composite map (1+beta)*(z - t conj(z)^2) has singular values
    (1+beta)*(1 +/- 2|t| r) with the minimum >= 1 — injective rasterization
    (see the injectivity law in the module docstring).
    """
    at = abs(t)
    if at == 0.0:
        return 0.0
    return TREFOIL_ZOOM_K * at / (1.0 - TREFOIL_ZOOM_K * at)


def _inverse_point(mode, c, dx, dy):
    """Continuous inverse warp of a centered coordinate (the powered lens).

    astig: analytic. spherical: fixed-count Newton (monotone convergence for
    |s| < 1/3). trefoil: un-zoom analytically, then a fixed-count 2x2 Newton
    on the quadratic shear system (det = 1 - 4 t^2 r^2, bounded away from 0
    on the pinned envelope).
    """
    if mode == "astig":
        return dx / (1.0 + c), dy / (1.0 + ASTIG_KAPPA * c)
    if mode == "spherical":
        r = math.hypot(dx, dy)
        if r == 0.0:
            return 0.0, 0.0
        u = r
        for _ in range(SPHERICAL_INVERSE_STEPS):
            fp = 1.0 + 3.0 * c * u * u / _R2
            if fp == 0.0:
                break  # guarded; unreachable for |s| < 1/3
            u = u - (u + c * u * u * u / _R2 - r) / fp
        k = u / r
        return dx * k, dy * k
    if mode == "trefoil":
        z = 1.0 + _trefoil_beta(c)
        qx = dx / z
        qy = dy / z
        a, b = qx, qy
        for _ in range(TREFOIL_INVERSE_STEPS):
            f1 = a - c * (a * a - b * b) - qx
            f2 = b + 2.0 * c * a * b - qy
            j11 = 1.0 - 2.0 * c * a
            j12 = 2.0 * c * b
            j21 = 2.0 * c * b
            j22 = 1.0 + 2.0 * c * a
            det = j11 * j22 - j12 * j21
            if abs(det) < 1e-9:
                raise ValueError("trefoil inverse: Jacobian collapsed "
                                 "(|t| outside the pinned envelope?)")
            a -= (f1 * j22 - f2 * j12) / det
            b -= (f2 * j11 - f1 * j21) / det
        return a, b
    raise ValueError("warp: unknown mode %r" % (mode,))


def warp_mask(rows, mode, coef, inverse=False):
    """Forward-map every ink pixel through the warp and re-rasterize.

    Rounding rule (pinned): nint = floor(v + 0.5); out-of-canvas destinations
    are dropped; sources visited row-major so collisions are deterministic.
    Returns a new mask (list of rows of 0/255).
    """
    _check_coef(mode, coef)
    h = len(rows)
    w = len(rows[0])
    cx = (w - 1) / 2.0
    cy = (h - 1) / 2.0
    pt = _inverse_point if inverse else _forward_point
    out = [[0] * w for _ in range(h)]
    for y in range(h):
        row = rows[y]
        for x in range(w):
            v = row[x]
            if v:
                dx = x - cx
                dy = y - cy
                ux, uy = pt(mode, coef, dx, dy)
                px = _nint(cx + ux)
                py = _nint(cy + uy)
                if 0 <= px < w and 0 <= py < h:
                    out[py][px] = v
    return out


# ------------------------------------------------------------------ estimators
def _moment_sums(rows):
    """One pass over the ink: the raw/central moment sums the astig and
    spherical estimators need (pinned center CX = CY = (w-1)/2)."""
    h = len(rows)
    w = len(rows[0])
    cx = (w - 1) / 2.0
    cy = (h - 1) / 2.0
    n = 0
    sx = sy = sxx = syy = 0.0
    sr2 = sr4 = sr6 = 0.0
    for y in range(h):
        row = rows[y]
        for x in range(w):
            if row[x]:
                dx = x - cx
                dy = y - cy
                n += 1
                sx += dx
                sy += dy
                sxx += dx * dx
                syy += dy * dy
                r2 = dx * dx + dy * dy
                sr2 += r2
                r4 = r2 * r2
                sr4 += r4
                sr6 += r4 * r2
    return {"n": n, "sx": sx, "sy": sy, "sxx": sxx, "syy": syy,
            "sr2": sr2, "sr4": sr4, "sr6": sr6}


def _trefoil_moment_sums(rows):
    """Third-complex-moment sums over the ink (pinned center), the exact
    coefficients of the shear's cubic identity:
      chi3 = sum z^3,  s4 = sum |z|^4,  szcz4 = sum z conj(z)^4,  scz6 = sum conj(z)^6."""
    h = len(rows)
    w = len(rows[0])
    cx = (w - 1) / 2.0
    cy = (h - 1) / 2.0
    chi3 = 0j
    s4 = 0.0
    szcz4 = 0j
    scz6 = 0j
    for y in range(h):
        row = rows[y]
        for x in range(w):
            if row[x]:
                dx = x - cx
                dy = y - cy
                r2 = dx * dx + dy * dy
                z = complex(dx, dy)
                zc = z.conjugate()
                zc2 = zc * zc
                zc4 = zc2 * zc2
                chi3 += z * z * z
                s4 += r2 * r2
                szcz4 += z * zc4
                scz6 += zc4 * zc2
    return {"chi3": chi3, "s4": s4, "szcz4": szcz4, "scz6": scz6}


def _est_astig(mr, mo):
    n0, n1 = mr["n"], mo["n"]
    mu20_0 = mr["sxx"] - mr["sx"] * mr["sx"] / n0
    mu02_0 = mr["syy"] - mr["sy"] * mr["sy"] / n0
    mu20_1 = mo["sxx"] - mo["sx"] * mo["sx"] / n1
    mu02_1 = mo["syy"] - mo["sy"] * mo["sy"] / n1
    if mu02_0 <= 0.0 or mu02_1 <= 0.0:
        raise ValueError("astig estimator: degenerate mu02 (ink on a line?)")
    big = (mu20_1 / mu02_1) / (mu20_0 / mu02_0)
    if big <= 0.0:
        raise ValueError("astig estimator: non-positive moment ratio")
    den = 2.0 - big / 2.0
    if abs(den) < 1e-9:
        raise ValueError("astig estimator: degenerate solve (R ~ 4)")
    return ((big - 2.0) + math.sqrt(big)) / den


def _est_spherical(mr, mo):
    # Exact quadratic: E[r'^2] = E[r^2] + (2s/R^2) E[r^4] + (s^2/R^4) E[r^6]
    a = mr["sr6"] / (_R2 * _R2)
    b = 2.0 * mr["sr4"] / _R2
    c = mr["sr2"] - mo["sr2"]
    disc = b * b - 4.0 * a * c
    if disc < 0.0:
        disc = 0.0  # rasterization can push it microscopically negative
    sq = math.sqrt(disc)
    r_lo = (-b - sq) / (2.0 * a)
    r_hi = (-b + sq) / (2.0 * a)
    # smaller |s| wins; exact tie keeps the '-' branch (documented rule)
    return r_lo if abs(r_lo) <= abs(r_hi) else r_hi


def _est_trefoil(mr, mo):
    """Exact identity (per point, zoom factor folded out):

        chi3_obs = (1+beta)^3 * [chi3 + c1 t + c2 t^2 + c3 t^3]
        c1 = -3 sum |z|^4,  c2 = 3 sum z conj(z)^4,  c3 = -sum conj(z)^6

    with beta(t) = K|t|/(1-K|t|). Solved by a fixed-count Newton on the real
    residual g(t) = |f(t)|^2 with f(t) = (1+beta)^3 P(t) - chi3_obs and
    g'(t) = 2 Re(f'(t) conj(f(t))). |f|^2 (not a single real/imag channel)
    because the channel content is render-dependent: a 3-fold-symmetric gold
    (gasket) carries the signal in Im(chi3), a mirror-symmetric gold (tri)
    has ALL third-moment sums real, so its signal lives entirely in Re —
    |f|^2 uses whichever channels the render actually carries and degrades
    to the least-squares estimate when rasterization noise makes the system
    inconsistent. At t = 0 with an un-aberrated mask f(0) = 0 exactly, so
    g = 0 and every step is a no-op -> est = 0.0 exactly (idempotence).
    """
    chi = mr["chi3"]
    c1 = -3.0 * mr["s4"]
    c2 = 3.0 * mr["szcz4"]
    c3 = -mr["scz6"]
    chi_obs = mo["chi3"]
    k = TREFOIL_ZOOM_K
    t = 0.0
    for _ in range(EST_NEWTON_STEPS):
        at = abs(t)
        b = 0.0 if at == 0.0 else k * at / (1.0 - k * at)
        one_b3 = (1.0 + b) ** 3
        p = chi + t * (c1 + t * (c2 + t * c3))          # complex
        dp = c1 + t * (2.0 * c2 + 3.0 * t * c3)          # complex
        # dbeta/dt = K*sign(t)/(1-K|t|)^2, sign(0) := +1 (documented rule)
        db = k / ((1.0 - k * at) ** 2) if t >= 0.0 else -k / ((1.0 - k * at) ** 2)
        f = one_b3 * p - chi_obs
        if f == 0j:
            break  # exact root (idempotence path)
        df = 3.0 * (1.0 + b) ** 2 * db * p + one_b3 * dp
        g = (f.conjugate() * f).real
        dg = 2.0 * (df * f.conjugate()).real
        if abs(dg) < 1e-30:
            break
        t = t - g / dg
    return t


def _algebraic_estimate(mode, ref_rows, obs_rows):
    """The closed-form / fixed-iteration core estimate (no model evaluation)."""
    if mode == "astig":
        return _est_astig(_moment_sums(ref_rows), _moment_sums(obs_rows))
    if mode == "spherical":
        return _est_spherical(_moment_sums(ref_rows), _moment_sums(obs_rows))
    if mode == "trefoil":
        return _est_trefoil(_trefoil_moment_sums(ref_rows), _trefoil_moment_sums(obs_rows))
    raise ValueError("estimate_coefficient: unknown mode %r" % (mode,))


def estimate_coefficient(mode, ref_rows, obs_rows):
    """Estimate ONE mode coefficient from the observed mask against the
    pre-registered reference mask. Closed-form moment algebra + a pinned
    TWO-step predictor-corrector against the deterministic forward model
    (same rasterization rule). Never sees the true coefficient. Raises
    ValueError on no ink."""
    t = _algebraic_estimate(mode, ref_rows, obs_rows)
    for _ in range(EST_CORRECTOR_STEPS):
        model = warp_mask(ref_rows, mode, t, inverse=False)
        c = _algebraic_estimate(mode, model, obs_rows)
        t = t + c  # first-order composition
    return t


# ----------------------------------------------------------------- measurement
def canonical_mask(rows):
    """Byte-exact canonical serialization (same convention as the
    edge-standard selftest fixtures): newline-joined '1'/'0' rows."""
    return "\n".join("".join("1" if v else "0" for v in row) for row in rows)


def mask_sha256(rows):
    return hashlib.sha256(canonical_mask(rows).encode("utf-8")).hexdigest()


def measure_D(rows):
    """Full edge-standard-v1 pipeline + box-counting D on the traced contours.

    Reuses edge_standard.threshold_for_coverage / trace_contours / measure via
    standardize — never reimplemented. For binary 0/255 masks the pinned
    threshold rule lands at t=1 (the ink level) whenever the ink fraction is
    within 0.94 of TARGET_COVERAGE, so standardize is a pass-through
    normalization for these golds; meta is recorded anyway.
    """
    h = len(rows)
    w = len(rows[0])
    ink = 0
    for row in rows:
        for v in row:
            if v:
                ink += 1
    if ink == 0:
        raise ValueError("measure_D: no ink")
    gray = bytes(255 if v else 0 for row in rows for v in row)
    st = _ES.standardize(gray, w, h)
    m = _ES.measure(st["grid"])
    return {
        "D": m["D"],
        "r2": m["r2"],
        "threshold": st["meta"]["chosen_threshold"],
        "coverage": st["meta"]["achieved_coverage"],
        "n_components_traced": st["meta"]["n_components_traced"],
        "traced_pixels": st["meta"]["traced_pixels"],
    }


# --------------------------------------------------------------- correct loop
def correct_loop(ref_rows, mode, coef, render="?"):
    """The powered-lens loop: measure -> inject -> estimate -> correct -> measure.

    Returns {render, mode, coefficients_true, coefficients_est,
    estimation_errors, d_ref, d_aberrated, d_corrected, recovered, monotone,
    roundtrip_recovery, masks{sha256}, detail{...}}.
    """
    d_ref = measure_D(ref_rows)
    ab = warp_mask(ref_rows, mode, coef, inverse=False)
    d_ab = measure_D(ab)
    est = estimate_coefficient(mode, ref_rows, ab)
    corr = warp_mask(ab, mode, est, inverse=True)
    d_corr = measure_D(corr)

    # Diagnostic (not gated): roundtrip pixel recovery with the TRUE inverse —
    # verifies the inverse map numerically. Expansive forward maps are
    # injective, so this should be ~1.0 (exactly 1.0 for spherical).
    rt = warp_mask(ab, mode, coef, inverse=True)
    recovered_px = 0
    ref_ink = 0
    for y in range(SIZE):
        for x in range(SIZE):
            if ref_rows[y][x]:
                ref_ink += 1
                if rt[y][x]:
                    recovered_px += 1
    roundtrip = recovered_px / ref_ink if ref_ink else 0.0

    da = abs(d_ab["D"] - d_ref["D"])
    dc = abs(d_corr["D"] - d_ref["D"])
    return {
        "render": render,
        "mode": mode,
        "coefficients_true": {mode: coef},
        "coefficients_est": {mode: est},
        "estimation_errors": {mode: est - coef},
        "d_ref": d_ref["D"],
        "d_aberrated": d_ab["D"],
        "d_corrected": d_corr["D"],
        "recovered": bool(dc <= D_BAND),
        "monotone": bool(da > dc),
        "roundtrip_recovery": roundtrip,
        "sha_ref": mask_sha256(ref_rows),
        "sha_aberrated": mask_sha256(ab),
        "sha_corrected": mask_sha256(corr),
        "detail": {"ref": d_ref, "aberrated": d_ab, "corrected": d_corr},
    }


# ------------------------------------------------------------------- selftest
def _run_selftest():
    print("lens-standard-v1 selftest — powered lens measure->correct (%dx%d)" % (SIZE, SIZE))
    print("pipeline: %s  measuring: %s (imported by path, never reimplemented)"
          % (PIPELINE, _ES.PIPELINE))
    print("pre-registered estimator tolerances: %s"
          % ", ".join("%s %g" % (m, EST_TOL[m]) for m in ("astig", "spherical", "trefoil")))
    print("pre-registered D known-answer band: |D_corrected - D_ref| <= %g" % D_BAND)
    fails = 0
    checks = 0

    def check(name, ok, detail=""):
        nonlocal fails, checks
        checks += 1
        if ok:
            print("PASS  %-36s %s" % (name, detail))
        else:
            print("FAIL  %-36s %s" % (name, detail))
            fails += 1

    def info(name, detail):
        print("INFO  %-36s %s" % (name, detail))

    renders = {"gasket": gold_render("gasket"), "tri": gold_render("tri")}
    for name, rows in renders.items():
        ink = sum(1 for row in rows for v in row if v)
        check("render:%s non-empty" % name, ink > 0, "ink=%d px" % ink)

    max_err = {m: 0.0 for m in EST_TOL}
    for rname, ref in renders.items():
        for mode, coef in ABERRATIONS:
            res = correct_loop(ref, mode, coef, render=rname)
            err = abs(res["estimation_errors"][mode])
            max_err[mode] = max(max_err[mode], err)
            tag = "%s:%s:%g" % (rname, mode, coef)
            check("est:%s" % tag, err <= EST_TOL[mode],
                  "err=%.3e tol=%g est=%.8f" % (err, EST_TOL[mode], res["coefficients_est"][mode]))
            check("recover:%s" % tag, res["recovered"],
                  "d_ref=%.4f d_ab=%.4f d_corr=%.4f" % (res["d_ref"], res["d_aberrated"], res["d_corrected"]))
            check("monotone:%s" % tag, res["monotone"],
                  "|dAb-dRef|=%.4f > |dCorr-dRef|=%.4f" % (
                      abs(res["d_aberrated"] - res["d_ref"]), abs(res["d_corrected"] - res["d_ref"])))
            info("roundtrip:%s" % tag, "pixel recovery %.4f" % res["roundtrip_recovery"])

    # (d) idempotence: correcting an un-aberrated render changes nothing.
    for rname, ref in renders.items():
        for mode in ("astig", "spherical", "trefoil"):
            est0 = estimate_coefficient(mode, ref, ref)
            corr0 = warp_mask(ref, mode, est0, inverse=True)
            check("idempotent:%s:%s" % (rname, mode),
                  est0 == 0.0 and corr0 == ref,
                  "est0=%r mask_identical=%s" % (est0, corr0 == ref))

    # (e) determinism: identical bytes on a full re-run of one loop case.
    r1 = correct_loop(renders["gasket"], "spherical", 0.06, render="gasket")
    r2 = correct_loop(renders["gasket"], "spherical", 0.06, render="gasket")
    check("determinism (loop rerun byte-identical)",
          json.dumps(r1, sort_keys=True) == json.dumps(r2, sort_keys=True),
          "sha_aberrated=%s" % r1["sha_aberrated"][:16])

    # (f) fail modes: no-ink input raises.
    empty = [[0] * SIZE for _ in range(SIZE)]
    raised = False
    try:
        correct_loop(empty, "spherical", 0.06)
    except ValueError:
        raised = True
    check("no-ink raises ValueError", raised)

    print("measured max estimation errors: %s"
          % ", ".join("%s %.3e" % (m, max_err[m]) for m in ("astig", "spherical", "trefoil")))
    print("selftest: %d/%d checks passed" % (checks - fails, checks))
    if fails:
        print("selftest: %d FAILURES" % fails)
    return not fails


def _write_fixtures(path):
    """Emit fixtures_lens.json for cross-language parity: one mode type and one
    coefficient (gasket x spherical x 0.06) with mask shas, estimated
    coefficients and D readings."""
    ref = gold_render("gasket")
    res = correct_loop(ref, "spherical", 0.06, render="gasket")
    pack = {
        "meta": {
            "pipeline": PIPELINE,
            "source_of_record": "lens_standard.py (Lane F, Python)",
            "purpose": "cross-language parity anchor for the powered lens "
                       "(measure->correct): same gold render + mode must "
                       "reproduce mask shas, estimates and D readings "
                       "exactly (floats) in any port.",
            "mask_serialization": "newline-joined '1'/'0' rows (edge-standard "
                                  "selftest convention); sha256 of utf-8 bytes",
            "pinned": {
                "size": SIZE, "center": CENTER,
                "gasket": {"L": GASKET_L, "r": GASKET_R, "depths": GASKET_DEPTHS},
                "tri": {"rows": list(TRI_ROWS), "a": TRI_A, "dy": TRI_DY, "r": TRI_R},
                "r_max": R_MAX, "astig_kappa": ASTIG_KAPPA,
                "max_astig": MAX_ASTIG, "max_spherical": MAX_SPHERICAL,
                "max_trefoil": MAX_TREFOIL,
                "est_tol": EST_TOL, "d_band": D_BAND,
                "est_newton_steps": EST_NEWTON_STEPS,
                "spherical_inverse_steps": SPHERICAL_INVERSE_STEPS,
                "rounding_rule": "nint(v) = floor(v + 0.5); out-of-canvas "
                                 "destinations dropped; row-major source order",
            },
        },
        "fixture": {
            "id": "gasket-spherical-0.06",
            "render": "gasket",
            "mode": "spherical",
            "coefficient": 0.06,
            "reference_mask_sha256": res["sha_ref"],
            "aberrated_mask_sha256": res["sha_aberrated"],
            "corrected_mask_sha256": res["sha_corrected"],
            "coefficients_est": res["coefficients_est"],
            "d_ref": res["d_ref"],
            "d_aberrated": res["d_aberrated"],
            "d_corrected": res["d_corrected"],
            "estimation_error": res["estimation_errors"]["spherical"],
            "recovered": res["recovered"],
            "monotone": res["monotone"],
            "roundtrip_recovery": res["roundtrip_recovery"],
        },
    }
    with open(path, "w") as fh:
        json.dump(pack, fh, sort_keys=True, indent=2)
        fh.write("\n")
    print("fixtures written: %s" % path)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(0 if _run_selftest() else 1)
    if "--fixtures" in sys.argv:
        out = "fixtures_lens.json"
        i = sys.argv.index("--fixtures")
        if i + 1 < len(sys.argv):
            out = sys.argv[i + 1]
        _write_fixtures(out)
        sys.exit(0)
    print("usage: lens_standard.py --selftest | --fixtures [path]")
