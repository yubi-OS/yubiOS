"""arrangement_warp.py — the arrangement-level distortion response experiment
(source of record, 2026-10-06, preregistered in
falsification/PREREGISTRATION-arrangement-response-2026-10-06.md).

Separates the two things Lane F's pixel-warp arm distorts at once:
  (a) the droplet ARRANGEMENT (centroid positions, spacings), and
  (b) droplet morphology + re-rasterization.
The arrangement arm warps the disk CENTERS through lens_standard's continuous
forward map, keeps each radius EXACTLY, and re-renders PRISTINE disks — only
the arrangement varies. The difference between the arms isolates the
morphology/rasterization contribution.

Conventions (pinned, matching the C-gold anchors): walk = centroid-Delaunay,
Euclidean MSD, W=4096, K=4, spread starts, seed 42, the pinned ladder x4.
"""
import sys, json, math
from pathlib import Path

_HERE = Path(__file__).resolve().parent
# repo-relative: this directory (lens_standard) and the sibling spectral-standard
# tool (centroid_walk / spectral_standard).
sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_HERE.parent / "spectral-standard"))

import lens_standard as ls
import centroid_walk as cw

SIZE = 512
CX = CY = 255.5


def arrangement_warp(disks, mode, coef, ty=0.0):
    """Warp disk centers through the Lane F forward map; keep radii; drop
    off-canvas disks (counted, never silent)."""
    out, dropped = [], 0
    for (x, y, r) in disks:
        dx, dy = x - CX, (y + ty) - CY
        ndx, ndy = ls._forward_point(mode, coef, dx, dy)
        nx, ny = CX + ndx, CY + ndy
        if nx - r < 0 or nx + r > SIZE or ny - r < 0 or ny + r > SIZE:
            dropped += 1
            continue
        out.append((nx, ny, r))
    return out, dropped


def to_rows(disks):
    rows = [[0] * SIZE for _ in range(SIZE)]
    for (x, y, r) in disks:
        x0, x1 = max(0, int(x - r - 1)), min(SIZE - 1, int(x + r + 1))
        y0, y1 = max(0, int(y - r - 1)), min(SIZE - 1, int(y + r + 1))
        for yy in range(y0, y1 + 1):
            for xx in range(x0, x1 + 1):
                if (xx - x) ** 2 + (yy - y) ** 2 <= r * r:
                    rows[yy][xx] = 255
    return rows


def measure_d(rows):
    return ls.measure_D(rows)["D"]


def walk_dw(centroids):
    pts = [(round(x, 4), round(y, 4)) for (x, y) in centroids]
    e = cw.bowyer_watson_delaunay(pts)
    ee = e["edges"] if isinstance(e, dict) else e
    return cw.walk_centroid_mode(ee, coords=pts, walkers=4096, seed=42, K=4,
                                 start_rule="spread")


def run_arm(disks, mode, coef, d_ref, d_w_ref, ty=0.0, family="gasket", pixel_rows=None):
    """One arrangement arm. For modes with a Lane-F pixel counterpart
    (astig, spherical) on the gasket family also runs the pixel-warp arm on the
    same render and reports dD_pixel and the A2 ratio dD_arrangement /
    dD_pixel (both rounded first, as in the committed table); trefoil and the
    tri family report null there (the pre-registered A2 ratio gate is defined
    on the gasket's astig/spherical arms only)."""
    warped, dropped = arrangement_warp(disks, mode, coef, ty)
    cents = [(x, y) for (x, y, r) in warped]
    d_arr = measure_d(to_rows(warped))
    w = walk_dw(cents)
    d_arr_delta = round(d_arr - d_ref, 4)
    # d_w differences are only reported when both walks pass the r2 gate
    walk_ok = (w["d_w"] is not None and w["d_w_r2"] >= cw.R2_GATE
               and d_w_ref is not None)
    dd_pixel = None
    ratio = None
    if pixel_rows is not None and family == "gasket" and mode in ("astig", "spherical"):
        pix = ls.warp_mask(pixel_rows, mode, coef)
        dd_pixel = round(measure_d(pix) - measure_d(pixel_rows), 3)
        ratio = round(d_arr_delta / dd_pixel, 3) if dd_pixel else None
    return {"family": family, "mode": mode, "coef": coef, "dropped": dropped,
            "n_kept": len(warped),
            "D_arrangement": round(d_arr, 4),
            "dD_arrangement": d_arr_delta,
            "d_w": round(w["d_w"], 4), "d_w_r2": round(w["d_w_r2"], 5),
            "dD_w": round(w["d_w"] - d_w_ref, 4) if walk_ok else None,
            "dD_pixel": dd_pixel, "ratio": ratio}


ARMS = (
    ("gasket", "astig", 0.1), ("gasket", "astig", 0.2),
    ("gasket", "trefoil", 1e-4), ("gasket", "trefoil", 1.5e-4),
    ("gasket", "spherical", 0.06),
    ("tri", "astig", 0.1), ("tri", "astig", 0.2),
)


def run_all():
    """Every arm of falsification/arrangement_results.json (gasket + tri)."""
    out = {}
    fam = {"gasket": ls.gen_gasket(SIZE), "tri": ls.gen_tri(SIZE)}
    ref = {}
    for name, disks in fam.items():
        rows = to_rows(disks)
        ref[name] = (rows, measure_d(rows), walk_dw([(x, y) for (x, y, r) in disks]))
    for family, mode, coef in ARMS:
        rows, d_ref, w_ref = ref[family]
        # a clean walk is a valid d_w reference only past the r2 gate
        dw_ref = w_ref["d_w"] if w_ref["d_w_r2"] >= cw.R2_GATE else None
        out["%s_%s_%s" % (family, mode, coef)] = run_arm(
            fam[family], mode, coef, d_ref, dw_ref, family=family, pixel_rows=rows)
    return out, {k: {"D": round(v[1], 4), "d_w": round(v[2]["d_w"], 6),
                      "d_w_r2": round(v[2]["d_w_r2"], 5)} for k, v in ref.items()}


def main():
    out, clean = run_all()
    if "--check" in sys.argv:
        committed = json.loads((_HERE / "falsification" / "arrangement_results.json").read_text())
        bad = []
        for k, exp in committed.items():
            got = out.get(k)
            # `ratio` is derived from already-rounded dD values; the committed
            # spherical 0.06 ratio 1.091 is 0.0262/0.024 = 1.0917 truncated
            # (recomputes to 1.092 when rounded), so it is compared to 2e-3.
            same = got is not None and all(
                (abs(got[f] - exp[f]) <= 2e-3 if f == "ratio" and exp[f] is not None and got[f] is not None
                 else got[f] == exp[f]) for f in exp)
            if not same:
                bad.append((k, got, exp))
        print("clean refs:", json.dumps(clean))
        for k in committed:
            print("%s %s" % ("OK  " if k not in [b[0] for b in bad] else "FAIL", k))
        for k, got, exp in bad:
            print("  got", got)
            print("  exp", exp)
        print("arrangement_warp --check: %d/%d committed entries reproduced"
              % (len(committed) - len(bad), len(committed)))
        sys.exit(1 if bad else 0)
    print(json.dumps({"clean": clean, **out}, indent=1))


if __name__ == "__main__":
    main()
