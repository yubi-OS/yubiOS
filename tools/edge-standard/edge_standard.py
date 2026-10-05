# edge_standard.py — edge-standard-v1 pipeline (SPEC-EDGE-STANDARD Lane A)
# Python source of record. Pure stdlib, deterministic, no env access.
#
# Pipeline (pinned v1, stage order is a major-version boundary):
#   resize (box-average, only if > 512) -> threshold selection (ink normalization
#   to TARGET_COVERAGE) -> contour trace (4-connectivity + Moore outer boundary)
#   -> 1-px contour bitmap emit -> box-counting measurement (jev-taste-math.js
#   ladder semantics).

import math
from bisect import bisect_left

PIPELINE = "edge-standard-v1"
TARGET_COVERAGE = 0.06   # pinned: changing this is a major version bump
MIN_COMPONENT = 12       # pinned: minimum kept boundary pixels per component
MAX_GRID = 512

# Moore neighborhood in CLOCKWISE order starting at WEST (screen coords, y down):
# W, NW, N, NE, E, SE, S, SW
_DIRS = ((-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1))
_DIR_INDEX = {d: i for i, d in enumerate(_DIRS)}

# 4-connectivity neighbor offsets (labeling only)
_N4 = ((-1, 0), (1, 0), (0, -1), (0, 1))


def threshold_for_coverage(gray_flat, w, h, target=0.06):
    """Sweep t over 0..255; coverage(t) = fraction of pixels with gray >= t.

    Pick t minimizing |coverage(t) - target|; ties -> SMALLER t (strict `<`
    while sweeping t ascending). Returns {'chosen_threshold', 'achieved_coverage'}.

    Plateau rule (pinned): coverage(t) is a non-increasing step function of t.
    If no plateau lands near the target, the rule still picks the global argmin
    of |coverage - target| — e.g. a two-level image whose ink fraction is far
    from 6% picks the smallest t of the empty plateau (coverage 0) whenever
    that is closest, yielding an empty ink mask downstream. Callers must read
    achieved_coverage; this is deterministic and versioned, never retuned to
    hit a D outcome.
    """
    n = w * h
    if n <= 0:
        raise ValueError("threshold_for_coverage: empty image")
    if len(gray_flat) != n:
        raise ValueError("threshold_for_coverage: gray_flat length != w*h")
    vals = sorted(gray_flat)  # works for ints and box-average floats
    best_t = 0
    best_gap = None
    best_cov = 0.0
    for t in range(256):
        idx = bisect_left(vals, t)
        cov = (n - idx) / n
        gap = cov - target
        if gap < 0.0:
            gap = -gap
        if best_gap is None or gap < best_gap:  # strict <: ties keep smaller t
            best_gap = gap
            best_t = t
            best_cov = cov
    return {"chosen_threshold": best_t, "achieved_coverage": best_cov}


def _label_components(mask, w, h):
    """4-connectivity labeling, row-major scan order, BFS flood fill.

    Returns (labels, components) where labels is an h x w int grid (0 = no
    component, else 1-based id) and components[c-1] is the component's FIRST
    ink pixel in row-major order (the BFS seed, which is exactly the
    raster-first pixel of the component).
    """
    labels = [[0] * w for _ in range(h)]
    seeds = []
    next_id = 0
    for y in range(h):
        row = mask[y]
        lrow = labels[y]
        for x in range(w):
            if row[x] == 1 and lrow[x] == 0:
                next_id += 1
                seeds.append((x, y))
                lrow[x] = next_id
                queue = [(x, y)]
                head = 0
                while head < len(queue):
                    cx, cy = queue[head]
                    head += 1
                    for dx, dy in _N4:
                        nx = cx + dx
                        ny = cy + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            if mask[ny][nx] == 1 and labels[ny][nx] == 0:
                                labels[ny][nx] = next_id
                                queue.append((nx, ny))
    return labels, seeds, next_id


def _trace_boundary(labels, comp_id, start, w, h):
    """Moore-neighborhood OUTER boundary trace of one component.

    Convention (pinned, must match the JS port exactly):
      * start = the component's first ink pixel in row-major order.
      * Initial backtrack = the WEST neighbor of start. For a raster-first
        pixel the west neighbor is never part of the component (it would be
        4-adjacent and scanned earlier), so it is always background.
      * At each current pixel, scan the 8 Moore neighbors CLOCKWISE starting
        at the neighbor immediately clockwise-after the BACKTRACK (the pixel
        we arrived from) and step to the first ink neighbor (ink = belongs to
        this component). At the start pixel this initial scan effectively
        begins at WEST, per the standard convention.
      * Stop (Jacob-style criterion) when the start pixel is RE-ENTERED with
        an entry direction that was already recorded, or after 4*w*h steps.
        A convex shape therefore loops its boundary twice before stopping.
      * An isolated single-pixel component traces to itself.
    Returns the list of traced pixels in visit order (may revisit pixels).
    """
    sx, sy = start
    path = [start]
    c = start
    b = (sx - 1, sy)  # initial backtrack: WEST of start
    entered = set()   # entry-direction indices into start, as (prev -> start) dir
    cap = 4 * w * h
    steps = 0
    while steps < cap:
        bidx = _DIR_INDEX.get((b[0] - c[0], b[1] - c[1]))
        if bidx is None:
            break  # defensive: backtrack not adjacent (cannot happen)
        nxt = None
        for k in range(1, 9):
            idx = (bidx + k) % 8
            nx = c[0] + _DIRS[idx][0]
            ny = c[1] + _DIRS[idx][1]
            if 0 <= nx < w and 0 <= ny < h and labels[ny][nx] == comp_id:
                nxt = (nx, ny)
                break
        if nxt is None:
            break  # isolated single-pixel component
        prev = c
        c = nxt
        b = prev
        steps += 1
        if c == start:
            edir = _DIR_INDEX[(c[0] - prev[0], c[1] - prev[1])]
            if edir in entered:
                break  # start re-entered with a repeated direction
            entered.add(edir)
        path.append(c)
    return path


def trace_contours(mask, w, h, min_component=12):
    """4-connectivity component labeling + Moore outer-boundary trace.

   mask: h x w grid of 0/1 (1 = ink). For each component (discovered in
    row-major order), trace its outer boundary on the component's OWN pixels
    (a diagonally-adjacent foreign component is never followed), paint its
    distinct boundary pixels (1 px) on a blank grid, and drop the component
    if its distinct boundary pixel count is < min_component.

    Returns {'grid', 'n_components_traced', 'traced_pixels'} where
    n_components_traced counts KEPT components and traced_pixels counts the
    total painted boundary pixels of kept components.
    """
    if len(mask) != h:
        raise ValueError("trace_contours: mask rows != h")
    grid = [[0] * w for _ in range(h)]
    labels, seeds, n_labels = _label_components(mask, w, h)
    kept = 0
    traced_pixels = 0
    for comp_id in range(1, n_labels + 1):
        path = _trace_boundary(labels, comp_id, seeds[comp_id - 1], w, h)
        distinct = set(path)
        if len(distinct) < min_component:
            continue
        kept += 1
        traced_pixels += len(distinct)
        for (x, y) in distinct:
            grid[y][x] = 1
    return {"grid": grid, "n_components_traced": kept, "traced_pixels": traced_pixels}


def _box_average_downsample(gray_flat, w, h):
    """Area-average downsample to fit within 512 keeping aspect ratio.

    scale = 512 / max(w, h); new dims floor(w*scale), floor(h*scale). Output
    pixel (i, j) averages the source box [floor(i*W/nw), floor((i+1)*W/nw)) x
    [floor(j*H/nh), floor((j+1)*H/nh)) — pure integer box bounds, IEEE double
    mean, source summed in row-major order. Exactly portable to JS.
    """
    scale = MAX_GRID / max(w, h)
    nw = math.floor(w * scale)
    nh = math.floor(h * scale)
    if nw < 1:
        nw = 1
    if nh < 1:
        nh = 1
    out = []
    for j in range(nh):
        y0 = (j * h) // nh
        y1 = ((j + 1) * h) // nh
        for i in range(nw):
            x0 = (i * w) // nw
            x1 = ((i + 1) * w) // nw
            s = 0
            for y in range(y0, y1):
                base = y * w
                for x in range(x0, x1):
                    s += gray_flat[base + x]
            out.append(s / ((x1 - x0) * (y1 - y0)))
    return out, nw, nh


def standardize(gray_bytes, w, h):
    """Full edge-standard-v1 pipeline. gray_bytes: raw 8-bit gray, row-major.

    Returns {'grid', 'meta'}; grid is the 1-px contour bitmap
    (h' rows x w' cols of 0/1), meta records pipeline id + params:
    {pipeline, chosen_threshold, achieved_coverage, n_components_traced,
    traced_pixels, w, h, under_inked} — w/h are the working dims after any
    resize; under_inked is True when even t=1 leaves coverage < 0.01
    (spec coverage-floor guard; bitmap is still emitted).
    """
    n = w * h
    if len(gray_bytes) != n:
        raise ValueError("standardize: gray_bytes length != w*h")
    gray_flat = list(gray_bytes)
    if w > MAX_GRID or h > MAX_GRID:
        gray_flat, w, h = _box_average_downsample(gray_flat, w, h)
    thr = threshold_for_coverage(gray_flat, w, h)
    t = thr["chosen_threshold"]
    mask = [[1 if gray_flat[y * w + x] >= t else 0 for x in range(w)] for y in range(h)]
    traced = trace_contours(mask, w, h, MIN_COMPONENT)
    # under_inked: SEAM FIX (advisor) — pinned to the SPEC text ("if even t=1
    # gives coverage < 0.01"), i.e. coverage AT t=1, not coverage at the chosen
    # threshold. The two differ only when the chosen threshold sits above an
    # ink level with coverage < 1% while t=1 still sees >= 1% (e.g. a dim
    # minority level); the spec's t=1 reading is the version both lanes now
    # share (the JS port already implemented exactly this).
    above_black = sum(1 for v in gray_flat if v >= 1)
    meta = {
        "pipeline": PIPELINE,
        "chosen_threshold": t,
        "achieved_coverage": thr["achieved_coverage"],
        "n_components_traced": traced["n_components_traced"],
        "traced_pixels": traced["traced_pixels"],
        "w": w,
        "h": h,
        "under_inked": above_black / n < 0.01,
    }
    return {"grid": traced["grid"], "meta": meta}


def _log_scales(min_box, max_box, n_scales):
    """n_scales log-spaced box sizes from min_box..max_box (natural log spacing),
    JS Math.round semantics (floor(x + 0.5)), clamped, sorted, deduped ascending."""
    raw = []
    for i in range(n_scales):
        s = min_box * math.pow(max_box / min_box, i / (n_scales - 1))
        s = math.floor(s + 0.5)  # JS Math.round (half up), not Python banker's round
        if s < min_box:
            s = min_box
        if s > max_box:
            s = max_box
        raw.append(s)
    raw.sort()
    out = []
    for s in raw:
        if not out or out[-1] != s:
            out.append(s)
    return out


def _count_boxes(grid, s):
    """Occupied boxes at size s; box index floor(x/s), floor(y/s), anchored at
    the grid origin. Mirrors jev-taste-math.js countBoxes exactly."""
    occupied = set()
    for y, row in enumerate(grid):
        by = y // s
        for x, v in enumerate(row):
            if v == 1:
                occupied.add((by, x // s))
    return len(occupied)


def _regress(xs, ys):
    """Least squares y = a + b x on raw sums (mirrors jev-taste-math.js regress);
    returns (slope, r2) with r2 = correlation^2; degenerate constant series -> (0, 0)."""
    n = len(xs)
    sx = sy = sxx = sxy = syy = 0.0
    for i in range(n):
        sx += xs[i]
        sy += ys[i]
        sxx += xs[i] * xs[i]
        sxy += xs[i] * ys[i]
        syy += ys[i] * ys[i]
    cov = sxy - (sx * sy) / n
    vx = sxx - (sx * sx) / n
    vy = syy - (sy * sy) / n
    if vx == 0 or vy == 0:
        return 0.0, 0.0
    slope = cov / vx
    r = cov / math.sqrt(vx * vy)
    return slope, r * r


def measure(grid, min_box=4, max_box=64, n_scales=8):
    """Box-counting fractal dimension, exactly the validated jev-taste-math.js
    semantics: log-spaced scales (round + dedupe + clamp), occupied boxes with
    floor(x/s)/floor(y/s) anchored at the origin, least-squares log N vs
    log(1/s) (natural log), D = slope (positive convention), r2 = R^2.
    Empty grid raises ValueError('empty edge map')."""
    ink = 0
    for row in grid:
        for v in row:
            if v == 1:
                ink += 1
    if ink == 0:
        raise ValueError("empty edge map")
    scales = _log_scales(min_box, max_box, n_scales)
    counts = [_count_boxes(grid, s) for s in scales]
    xs = [math.log(1.0 / s) for s in scales]
    ys = [math.log(c) for c in counts]
    slope, r2 = _regress(xs, ys)
    return {
        "D": slope,
        "r2": r2,
        "scales": scales,
        "counts": counts,
        "n_scales": len(scales),
    }

# ---------------------------------------------------------------------------
# --selftest entry (2026-10-05, lean CI wiring): fixture-pack parity against
# the shipped expected values plus independent property checks. Appended
# without modifying any pipeline function above.
# ---------------------------------------------------------------------------
def _run_selftest() -> bool:
    import base64
    import hashlib
    import json
    import os

    failures = []

    def check(name, ok, detail=""):
        print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | " + detail) if detail else ""))
        if not ok:
            failures.append(name)

    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "edge_fixtures.json")) as fh:
        pack = json.load(fh)

    grids = {}
    for fx in pack["fixtures"]:
        gray = base64.b64decode(fx["gray_b64"])
        st = standardize(gray, fx["w"], fx["h"])
        rows = "\n".join("".join("1" if v else "0" for v in row) for row in st["grid"])
        sha = hashlib.sha256(rows.encode("utf-8")).hexdigest()
        m = measure(st["grid"])
        exp = fx["expected"]
        ok = (
            st["meta"]["chosen_threshold"] == exp["chosen_threshold"]
            and abs(st["meta"]["achieved_coverage"] - exp["achieved_coverage"]) < 1e-9
            and st["meta"]["traced_pixels"] == exp["traced_pixels"]
            and st["meta"]["n_components_traced"] == exp["n_components_traced"]
            and sha == exp["grid_sha256"]
            and abs(m["D"] - exp["D"]) < 1e-9
            and abs(m["r2"] - exp["r2"]) < 1e-9
        )
        check("fixture:" + fx["id"], ok,
              "thr=%s cov=%.6f traced=%s D=%.6f" % (st["meta"]["chosen_threshold"], st["meta"]["achieved_coverage"], st["meta"]["traced_pixels"], m["D"]))
        grids[fx["id"]] = (st, m)

    f1, f2 = grids.get("f1_disk"), grids.get("f2_disk_dim")
    if f1 and f2:
        same = all(a == b for ra, rb in zip(f1[0]["grid"], f2[0]["grid"]) for a, b in zip(ra, rb))
        check("normalization-property (f1 vs f2 identical grid + D)",
              same and abs(f1[1]["D"] - f2[1]["D"]) < 1e-12)

    w = h = 512
    gray = bytearray(w * h)
    for x in range(w):
        gray[(h // 2) * w + x] = 255
    st = standardize(bytes(gray), w, h)
    m = measure(st["grid"])
    check("line D ~ 1 (independent)", 0.9 <= m["D"] <= 1.2, "D=%.4f" % m["D"])

    f3 = grids.get("f3_sierpinski_leaves")
    if f3:
        check("sierpinski D in theoretical band (log3/log2 ~ 1.585)",
              1.45 <= f3[1]["D"] <= 1.70, "D=%.4f" % f3[1]["D"])

    if f1:
        fx = pack["fixtures"][0]
        st2 = standardize(base64.b64decode(fx["gray_b64"]), fx["w"], fx["h"])
        check("determinism (f1 rerun byte-identical)", st2["grid"] == f1[0]["grid"])

    st0 = standardize(bytes(512 * 512), 512, 512)
    empty = all(v == 0 for row in st0["grid"] for v in row)
    raised = False
    try:
        measure(st0["grid"])
    except Exception:
        raised = True
    check("all-zero gray -> under_inked + empty grid + measure raises",
          bool(st0["meta"].get("under_inked")) and empty and raised)

    print("selftest: %d failures" % len(failures))
    return not failures


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        sys.exit(0 if _run_selftest() else 1)
    print("usage: edge_standard.py --selftest")
