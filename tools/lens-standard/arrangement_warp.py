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

sys.path.insert(0, "/var/workspace/session/pr-stage/tools/lens-standard")
sys.path.insert(0, "/var/workspace/session/pr-stage/tools/spectral-standard")

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


def run_arm(disks, mode, coef, d_ref, d_w_ref, ty=0.0):
    warped, dropped = arrangement_warp(disks, mode, coef, ty)
    cents = [(x, y) for (x, y, r) in warped]
    d_arr = measure_d(to_rows(warped))
    w = walk_dw(cents)
    return {"mode": mode, "coef": coef, "dropped": dropped, "n_kept": len(warped),
            "D_arrangement": round(d_arr, 4),
            "dD_arrangement": round(d_arr - d_ref, 4),
            "d_w": round(w["d_w"], 4), "d_w_r2": round(w["d_w_r2"], 5),
            "dD_w": round(w["d_w"] - d_w_ref, 4)}


def main():
    gasket = ls.gen_gasket(SIZE)
    cents = [(x, y) for (x, y, r) in gasket]
    d_ref = measure_d(to_rows(gasket))
    w_ref = walk_dw(cents)
    out = {"clean": {"D": round(d_ref, 4), "d_w": round(w_ref["d_w"], 6),
                     "d_w_r2": round(w_ref["d_w_r2"], 5)}}
    for mode, coef in (("astig", 0.1), ("astig", 0.2),
                       ("trefoil", 1e-4), ("trefoil", 1.5e-4),
                       ("spherical", 0.06)):
        out["%s_%s" % (mode, coef)] = run_arm(gasket, mode, coef, d_ref, w_ref["d_w"])
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
