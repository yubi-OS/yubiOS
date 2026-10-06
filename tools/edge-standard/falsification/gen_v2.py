#!/usr/bin/env python3
"""gen_v2.py — falsification-corpus generators for edge-standard-v1 (yubiOS).

Deterministic corpus of supersolid-droplet-morphology test images, plus a
--selftest that regenerates every class at 512x512, runs the FULL
edge-standard-v1 pipeline, and asserts the measured regression anchors.

Determinism contract (do not relax without a version bump):
  * integer disk rasterization only (no anti-aliasing, no floats in pixel space)
  * shuffle uses random.Random(seed) with the pinned seeds [42, 1337, 2026, 7, 99]
    and the same rejection-sampling loop
  * gasket recursion is depth-first with dedupe-keeping-coarsest-depth
  * no environment access; output depends only on the pinned parameters

Canonical record: refs/sierpinski-supersolid-connection-2026-10-06.md
Anchors: falsification/anchors.json (machine-readable source of the checks).
"""

import json
import math
import os
import random
import sys

# Import the pipeline source of record from the parent directory
# (tools/edge-standard/edge_standard.py when deployed in-repo).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import edge_standard as es  # noqa: E402

SIZE = 512
SEEDS = [42, 1337, 2026, 7, 99]
D_TOL = 0.002          # whole-window D regression tolerance
GATE_TOL = 0.002       # Sierpinski gate local-slope tolerance
GATE_SCALES = (13, 20, 29, 43, 64)
GATE_L = 384

HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- renders --

def render_disks(size, disks, gray=255):
    """Hard-pixel integer disk rasterization (inclusive <= r^2 test)."""
    img = bytearray(size * size)
    for cx, cy, r in disks:
        r2 = r * r
        for y in range(max(0, cy - r), min(size, cy + r + 1)):
            dy = y - cy
            for x in range(max(0, cx - r), min(size, cx + r + 1)):
                dx = x - cx
                if dx * dx + dy * dy <= r2:
                    img[y * size + x] = gray
    return bytes(img)


def render_pumpkin_field(size, r_s):
    """Orthographic |Y_3^3| render: intensity = (rho/R_s)^3 * |cos 3 phi|."""
    c = size / 2.0
    img = bytearray(size * size)
    for y in range(size):
        for x in range(size):
            rho = math.hypot(x - c, y - c)
            if rho <= r_s:
                phi = math.atan2(y - c, x - c)
                img[y * size + x] = int(round(255.0 * (rho / r_s) ** 3 * abs(math.cos(3 * phi))))
    return bytes(img)


# ------------------------------------------------------------- generators --

def _mid(p, q):
    return ((p[0] + q[0]) // 2, (p[1] + q[1]) // 2)


def gen_gasket_v2(size, L, r):
    """Sierpinski triangle droplet lattice: 6 depths, dedupe keeping the
    coarsest depth (the first insertion wins ties; re-visits only overwrite
    when strictly finer). Returns integer (x, y, r) disks."""
    h = int(round(L * math.sqrt(3) / 2))
    a = (size // 2, size // 2 - 2 * h // 3)
    b = (size // 2 - L // 2, size // 2 + h // 3)
    c = (size // 2 + L // 2, size // 2 + h // 3)
    pts = {}

    def rec(p, q, rd, depth):
        for v in (p, q, rd):
            if v not in pts or depth < pts[v]:
                pts[v] = depth
        if depth >= 6:
            return
        pq, qr, rp = _mid(p, q), _mid(q, rd), _mid(rd, p)
        rec(p, pq, rp, depth + 1)
        rec(pq, q, qr, depth + 1)
        rec(rp, qr, rd, depth + 1)

    rec(a, b, c, 1)
    return [(x, y, r) for (x, y), _ in pts.items()]


def gen_tri(size):
    """Triangular-lattice patch: rows of [3, 4, 5, 4, 3] droplets."""
    a = size * 52 // 512
    dy = size * 45 // 512
    r = size * 16 // 512
    disks = []
    for i, n in enumerate([3, 4, 5, 4, 3]):
        y = size // 2 + (i - 2) * dy
        x0 = size // 2 - (n - 1) * (a // 2)
        disks += [(x0 + j * a, y, r) for j in range(n)]
    return disks


def gen_shuffle(size, seed):
    """Poisson-ish rejection sampling: 19 disks, min pairwise center
    separation >= 40 px, border margin 64 px. random.Random(seed) only."""
    r = size * 16 // 512
    lo, hi = 64, size - 64
    rng = random.Random(seed)
    centers = []
    while len(centers) < 19:
        x, y = rng.randint(lo, hi), rng.randint(lo, hi)
        if all((x - px) ** 2 + (y - py) ** 2 >= 40 ** 2 for px, py in centers):
            centers.append((x, y))
    return [(x, y, r) for x, y in centers]


def gen_pumpkin_ring(size):
    """6 droplets at the |Y_3^3| azimuthal maxima (k*pi/3), radius R = 200."""
    r = size * 16 // 512
    rr = size * 200 // 512
    return [(size // 2 + int(round(rr * math.cos(k * math.pi / 3))),
             size // 2 + int(round(rr * math.sin(k * math.pi / 3))), r)
            for k in range(6)]


# --------------------------------------------------------------- selftest --

def _measure(gray):
    """Run the full edge-standard-v1 pipeline + box-counting measure."""
    st = es.standardize(gray, SIZE, SIZE)
    m = es.measure(st["grid"])
    return st, m


def _local_slope(m):
    """Local slope over the pinned gate window {13,20,29,43,64}."""
    xs = [math.log(1.0 / s) for s in m["scales"] if s in GATE_SCALES]
    ys = [math.log(c) for s, c in zip(m["scales"], m["counts"]) if s in GATE_SCALES]
    slope, r2 = es._regress(xs, ys)
    return slope, r2


def _load_anchors():
    with open(os.path.join(HERE, "anchors.json")) as fh:
        return json.load(fh)


def _run_selftest():
    print("gen_v2 selftest — edge-standard-v1 falsification corpus (512x512)")
    print("pipeline: %s  MAX_GRID=%d  TARGET_COVERAGE=%s  MIN_COMPONENT=%d"
          % (es.PIPELINE, es.MAX_GRID, es.TARGET_COVERAGE, es.MIN_COMPONENT))
    anchors = _load_anchors()
    checks = []
    fails = 0

    def check(name, ok, detail):
        nonlocal fails
        if ok:
            print("PASS  %-28s %s" % (name, detail))
        else:
            print("FAIL  %-28s %s" % (name, detail))
            fails += 1
        checks.append((name, ok))

    # --- gasket (L-convergence pair, component-count anchor) ---------------
    # Uniform droplet radius r=3: run-lesson 5 (an isolated r=2 disk traces 0
    # boundary px and is silently dropped by MIN_COMPONENT) drives the choice;
    # assert the r=2 rejection empirically so the parameter can't silently drift.
    st_r2 = es.standardize(render_disks(SIZE, [(SIZE // 2, SIZE // 2, 2)]), SIZE, SIZE)
    bp2 = st_r2["meta"]["traced_pixels"]
    check("r=2 boundary rejection (run-lesson 5)", bp2 < 14,
          "r=2 isolated disk traced %d boundary px (< 14 -> r=3 pinned)" % bp2)
    g256 = gen_gasket_v2(SIZE, 256, 3)
    g384 = gen_gasket_v2(SIZE, GATE_L, 3)
    check("gasket point counts", len(g256) == 366 and len(g384) == 366,
          "L=256 -> %d, L=384 -> %d (want 366/366)" % (len(g256), len(g384)))
    for label, disks, anchor in (("gasket-v2-L256", g256, anchors["classes"]["gasket-v2-L256"]),
                                 ("gasket-v2-L384", g384, anchors["classes"]["gasket-v2-L384"])):
        st, m = _measure(render_disks(SIZE, disks))
        ok = abs(m["D"] - anchor["D"]) <= D_TOL
        check("anchor D %s" % label, ok,
              "D=%.4f (want %.4f +/- %.4f)" % (m["D"], anchor["D"], D_TOL))
        check("comps %s" % label, st["meta"]["n_components_traced"] == anchor["comps"],
              "comps=%d (want %d)" % (st["meta"]["n_components_traced"], anchor["comps"]))
        check("mask non-empty %s" % label, m["counts"][0] > 0 and not st["meta"]["under_inked"],
              "cov=%.4f thr=%d" % (st["meta"]["achieved_coverage"], st["meta"]["chosen_threshold"]))
        if label == "gasket-v2-L384":
            slope, r2 = _local_slope(m)
            check("gate slope gasket L=384", abs(slope - anchors["gate"]["slope"]) <= GATE_TOL
                  and r2 >= anchors["gate"]["r2_min"],
                  "slope=%.4f (want %.4f +/- %.4f) r2=%.6f (>= %.2f)"
                  % (slope, anchors["gate"]["slope"], GATE_TOL, r2, anchors["gate"]["r2_min"]))

    # --- tri ----------------------------------------------------------------
    st, m = _measure(render_disks(SIZE, gen_tri(SIZE)))
    a = anchors["classes"]["tri"]
    check("anchor D tri", abs(m["D"] - a["D"]) <= D_TOL,
          "D=%.4f (want %.4f)" % (m["D"], a["D"]))
    check("comps tri", st["meta"]["n_components_traced"] == a["comps"],
          "comps=%d (want %d)" % (st["meta"]["n_components_traced"], a["comps"]))
    check("mask non-empty tri", m["counts"][0] > 0 and not st["meta"]["under_inked"],
          "cov=%.4f" % st["meta"]["achieved_coverage"])

    # --- shuffle x5 pinned seeds -------------------------------------------
    for seed in SEEDS:
        st, m = _measure(render_disks(SIZE, gen_shuffle(SIZE, seed)))
        a = anchors["classes"]["shuffle-s%d" % seed]
        ok = (abs(m["D"] - a["D"]) <= D_TOL
              and st["meta"]["n_components_traced"] == a["comps"]
              and m["counts"][0] > 0 and not st["meta"]["under_inked"])
        check("anchor shuffle-s%d" % seed, ok,
              "D=%.4f (want %.4f) comps=%d (want %d) cov=%.4f"
              % (m["D"], a["D"], st["meta"]["n_components_traced"], a["comps"],
                 st["meta"]["achieved_coverage"]))

    # --- pumpkin classes (exploratory, non-gated) ---------------------------
    st, m = _measure(render_disks(SIZE, gen_pumpkin_ring(SIZE)))
    a = anchors["classes"]["pumpkin_ring"]
    check("anchor pumpkin_ring", abs(m["D"] - a["D"]) <= D_TOL
          and st["meta"]["n_components_traced"] == a["comps"]
          and m["counts"][0] > 0 and not st["meta"]["under_inked"],
          "D=%.4f (want %.4f) comps=%d (want %d)"
          % (m["D"], a["D"], st["meta"]["n_components_traced"], a["comps"]))

    st, m = _measure(render_pumpkin_field(SIZE, 240))
    a = anchors["classes"]["pumpkin_field"]
    check("anchor pumpkin_field", abs(m["D"] - a["D"]) <= D_TOL
          and st["meta"]["n_components_traced"] == a["comps"]
          and m["counts"][0] > 0 and not st["meta"]["under_inked"],
          "D=%.4f (want %.4f) comps=%d thr=%d cov=%.4f"
          % (m["D"], a["D"], st["meta"]["n_components_traced"],
             st["meta"]["chosen_threshold"], st["meta"]["achieved_coverage"]))

    print("selftest: %d/%d checks passed" % (len(checks) - fails, len(checks)))
    if fails:
        print("SELFTEST: FAIL")
        return 1
    print("SELFTEST: PASS")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_run_selftest())
    print("usage: gen_v2.py --selftest")
    sys.exit(2)
