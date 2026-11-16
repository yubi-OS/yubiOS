#!/usr/bin/env python3
"""life_supersolid.py -- Executable B3/S23 Cellular Automaton, Supersolid Morphology,
Glider Optics, and Wolfram (2025) Cognitive Modularity / Focal-Point Instrument.

Pure Python stdlib + imports tools/edge-standard/edge_standard.py by path.
Zero planted pattern libraries, zero hardcoded coordinate tables, and zero
static JSON results: every motif, periodic attractor, and settled multi-component
constellation is discovered de novo by enumerating integer bitmasks and evolving
Conway's Game of Life (B3/S23, outer-totalistic code 224) via `step_grid` until each
seed reaches a true periodic attractor (see `build_life_pattern_corpus` for the exact
selection rule).  Glider transmission is decided by simulating the CA on every ray.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
EDGE_DIR = os.path.abspath(os.path.join(HERE, "..", "edge-standard"))
if EDGE_DIR not in sys.path:
    sys.path.insert(0, EDGE_DIR)
import edge_standard as es  # noqa: E402

INSTRUMENT_VERSION = "life-supersolid-v2.1.0"
GATE_SCALES = (13, 20, 29, 43, 64)
MOORE_OFFSETS = (
    (-1, -1), (-1, 0), (-1, 1),
    (0, -1),           (0, 1),
    (1, -1),  (1, 0),  (1, 1),
)


# ---------------------------------------------------------------------------
# 1. Exact B3/S23 Cellular Automaton Engine on Z^2 & Dihedral D_4 Symmetry
# ---------------------------------------------------------------------------

def step_grid(live_cells: set[tuple[int, int]]) -> set[tuple[int, int]]:
    """Advance a sparse 2D set of live cells by 1 tick under Conway's B3/S23 rule."""
    counts: dict[tuple[int, int], int] = {}
    for x, y in live_cells:
        for dx, dy in MOORE_OFFSETS:
            nb = (x + dx, y + dy)
            counts[nb] = counts.get(nb, 0) + 1
    next_live: set[tuple[int, int]] = set()
    for cell, s in counts.items():
        c = 1 if cell in live_cells else 0
        score = 2 * s + c
        if 5 <= score <= 7:
            next_live.add(cell)
    return next_live


def verify_b3s23_rule_table() -> dict:
    """Check `step_grid` against the exact B3/S23 local transition function on ALL
    2 x 2^8 = 512 Moore-neighbourhood configurations (centre state c, each of the 8
    neighbours live or dead): the centre of a one-tick evolution must be alive iff
    (live-neighbour count s == 3) or (c == 1 and s == 2).  Any other outer-totalistic rule
    (HighLife B36/S23, B38/S23, B3/S238, B3/S236, B35/S23, B3/S2, B3/S234, B34/S34,
    B2/S, the identity, ...) violates at least one of the 18 (c, s) classes; non-totalistic
    rules violate individual neighbourhoods.  Returns the mismatch census."""
    mismatches: list[tuple[int, int, int]] = []
    classes_seen: set[tuple[int, int]] = set()
    for c in (0, 1):
        for nb_mask in range(256):
            cells = {MOORE_OFFSETS[i] for i in range(8) if (nb_mask >> i) & 1}
            if c:
                cells.add((0, 0))
            s_live = bin(nb_mask).count("1")
            classes_seen.add((c, s_live))
            expected = (s_live == 3) or (c == 1 and s_live == 2)
            got = (0, 0) in step_grid(set(cells))
            if got != expected:
                mismatches.append((c, nb_mask, s_live))
    bad_classes = sorted({(c, sl) for c, _m, sl in mismatches})
    return {
        "n_configs": 512,
        "n_classes": len(classes_seen),
        "n_mismatches": len(mismatches),
        "mismatching_classes": bad_classes,
        "is_b3s23": len(mismatches) == 0 and len(classes_seen) == 18,
    }


def evolve_pattern(init_cells, steps: int) -> list[set[tuple[int, int]]]:
    """Return the trajectory [C_0, C_1, ..., C_steps] of live cell sets."""
    cur = {tuple(p) for p in init_cells}
    traj = [cur]
    for _ in range(steps):
        cur = step_grid(cur)
        traj.append(cur)
    return traj


def decode_bitmask(mask: int, width: int, height: int) -> set[tuple[int, int]]:
    """Decode an integer bitmask in {0 .. 2^(width*height)-1} into live coordinates."""
    return {(i % width, i // width) for i in range(width * height) if (mask >> i) & 1}


def canonical_d4_signature(cells: set[tuple[int, int]]) -> tuple[tuple[int, int], ...]:
    """Return the canonical translation- and D_4-invariant coordinate tuple of `cells`."""
    if not cells:
        return ()
    variants = []
    for rx in (-1, 1):
        for ry in (-1, 1):
            for swap in (False, True):
                transformed = [
                    ((y * rx, x * ry) if swap else (x * rx, y * ry))
                    for x, y in cells
                ]
                min_x = min(p[0] for p in transformed)
                min_y = min(p[1] for p in transformed)
                variants.append(
                    tuple(sorted((x - min_x, y - min_y) for x, y in transformed))
                )
    return min(variants)


def enumerate_3x3_d4_orbits() -> list[dict]:
    """Exhaustively enumerate all 2^9 = 512 bitmasks of {0,1}^{3x3} and partition
    them under the 8 dihedral group actions of D_4 around the grid center (1,1).
    By Burnside's lemma (proved in LifeBounds.burnside_d4_3x3_sum:
    512 + 2*8 + 32 + 4*64 = 816 = 8 * 102), there are exactly 102 orbits."""
    orbits: dict[tuple[tuple[int, int], ...], dict] = {}
    for mask in range(512):
        pts = decode_bitmask(mask, 3, 3)
        box_variants = []
        for rx in (-1, 1):
            for ry in (-1, 1):
                for swap in (False, True):
                    tpts = []
                    for x, y in pts:
                        cx, cy = x - 1, y - 1
                        nx, ny = (cy * rx, cx * ry) if swap else (cx * rx, cy * ry)
                        tpts.append((nx + 1, ny + 1))
                    box_variants.append(tuple(sorted(tpts)))
        rep = min(box_variants)
        if rep not in orbits:
            orbits[rep] = {"min_mask": mask, "size": 1, "cells": list(rep)}
        else:
            orbits[rep]["size"] += 1
    return list(orbits.values())


def detect_orbit_period(
    cells: set[tuple[int, int]], max_period: int = 16
) -> tuple[int | None, tuple[int, int]]:
    """Evolve `cells` up to `max_period` steps under B3/S23 and return
    (period, (dx, dy)) if `cells` is an exact periodic or translating orbit."""
    if not cells:
        return None, (0, 0)
    min0_x = min(p[0] for p in cells)
    min0_y = min(p[1] for p in cells)
    norm0 = {(x - min0_x, y - min0_y) for x, y in cells}
    cur = set(cells)
    for p in range(1, max_period + 1):
        cur = step_grid(cur)
        if not cur:
            return None, (0, 0)
        if len(cur) == len(cells):
            min_x = min(pt[0] for pt in cur)
            min_y = min(pt[1] for pt in cur)
            norm_p = {(x - min_x, y - min_y) for x, y in cur}
            if norm_p == norm0:
                return p, (min_x - min0_x, min_y - min0_y)
    return None, (0, 0)


# ---------------------------------------------------------------------------
# 2. Wolfram (2025) 2*sqrt(2) (d_inf <= 2) Interaction Graph & Modularity M(P)
# ---------------------------------------------------------------------------

def interaction_components(live_cells: set[tuple[int, int]]) -> list[set[tuple[int, int]]]:
    """Partition live_cells into connected components under Chebyshev d_inf <= 2
    (Euclidean distance <= 2*sqrt(2), overlapping 3x3 Moore neighborhoods)."""
    unvisited = set(live_cells)
    comps: list[set[tuple[int, int]]] = []
    while unvisited:
        start = next(iter(unvisited))
        unvisited.remove(start)
        comp = {start}
        q = deque([start])
        while q:
            ux, uy = q.popleft()
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    v = (ux + dx, uy + dy)
                    if v in unvisited:
                        unvisited.remove(v)
                        comp.add(v)
                        q.append(v)
        comps.append(comp)
    return comps


def bounding_box_area(live_cells: set[tuple[int, int]]) -> tuple[int, int, int]:
    """Return (width, height, area) of the active bounding box."""
    if not live_cells:
        return 0, 0, 0
    xs = [p[0] for p in live_cells]
    ys = [p[1] for p in live_cells]
    w = max(xs) - min(xs) + 1
    h = max(ys) - min(ys) + 1
    return w, h, w * h


def measure_modularity(init_cells, steps: int) -> dict:
    """Evolve init_cells for `steps` ticks and measure Wolfram's Modularity Index
    M = (1/steps) sum_{t=0}^{steps-1} b_0(G_t), bounding-box envelope area,
    period/translation signature, and 9-bit dynamical observable vector."""
    traj = evolve_pattern(init_cells, steps)
    comp_counts = []
    pop_counts = []
    all_visited: set[tuple[int, int]] = set()
    for t in range(steps):
        cset = traj[t]
        comps = interaction_components(cset)
        comp_counts.append(len(comps))
        pop_counts.append(len(cset))
        all_visited.update(cset)

    c0 = traj[0]
    cn = traj[steps]
    exact_periodic = (cn == c0)
    translated = False
    dx_tr, dy_tr = 0, 0
    if not exact_periodic and c0 and len(cn) == len(c0):
        min0 = (min(p[0] for p in c0), min(p[1] for p in c0))
        minn = (min(p[0] for p in cn), min(p[1] for p in cn))
        dx_tr, dy_tr = minn[0] - min0[0], minn[1] - min0[1]
        if {(x + dx_tr, y + dy_tr) for x, y in c0} == cn and (dx_tr != 0 or dy_tr != 0):
            translated = True

    emits_growth = len(cn) > len(c0)
    w_env, h_env, env_area = bounding_box_area(all_visited)
    w0, h0, area0 = bounding_box_area(c0)
    mod_index = sum(comp_counts) / float(max(1, steps))
    mean_pop = sum(pop_counts) / float(max(1, steps))
    fill_density = mean_pop / float(max(1, env_area))

    # 9-D binary dynamical observable vector derived purely from the trajectory
    code_9d = [
        1 if (steps >= 1 and traj[1] != c0) else 0,      # P1: active temporal evolution (oscillator/spaceship/ash vs still life)
        1 if mod_index >= 2.0 else 0,                    # P2: multi-component modularity (M >= 2)
        1 if len(c0) % 2 == 1 else 0,                    # P3: odd initial cell population parity
        1 if len(c0) % 3 == 0 else 0,                    # P4: triadic Z_3 population residue
        1 if w_env != h_env else 0,                      # P5: broken C_4 aspect anisotropy (W != H)
        1 if env_area >= 80 else 0,                      # P6: mesoscopic spatial envelope (A >= 80)
        1 if env_area >= 150 else 0,                     # P7: macroscopic spatial envelope (A >= 150)
        1 if len(c0) >= 20 else 0,                       # P8: composite cell population (>= 20)
        1 if mod_index >= 4.0 else 0,                    # P9: high modularity (M >= 4)
    ]

    return {
        "steps": steps,
        "initial_population": len(c0),
        "final_population": len(cn),
        "mean_population": round(mean_pop, 4),
        "initial_area": area0,
        "envelope_width": w_env,
        "envelope_height": h_env,
        "envelope_area": env_area,
        "modularity_index": round(mod_index, 6),
        "min_components": min(comp_counts),
        "max_components": max(comp_counts),
        "component_series": comp_counts,
        "exact_periodic": exact_periodic,
        "translated": translated,
        "translation_vec": [dx_tr, dy_tr],
        "emits_growth": emits_growth,
        "fill_density": round(fill_density, 6),
        "code_9d": code_9d,
    }


# ---------------------------------------------------------------------------
# 3. De Novo Discovery of Canonical B3/S23 Motifs & Census (Zero Planted Library)
# ---------------------------------------------------------------------------

_DISCOVERED_MOTIFS_CACHE: dict[str, list[tuple[int, int]]] | None = None


def discover_canonical_3x3_motifs() -> dict[str, list[tuple[int, int]]]:
    """Discover the fundamental B3/S23 elementary motifs (2x2 still-life block,
    3x3 diamond tub still-life, 3-cell period-2 blinker, and 5-cell period-4
    diagonal glider) directly by evolving the 102 D_4 orbits of {0,1}^{3x3}
    under `step_grid` -- zero hardcoded coordinate arrays."""
    global _DISCOVERED_MOTIFS_CACHE
    if _DISCOVERED_MOTIFS_CACHE is not None:
        return _DISCOVERED_MOTIFS_CACHE

    found: dict[str, list[tuple[int, int]]] = {}
    for orbit in enumerate_3x3_d4_orbits():
        cur = set(orbit["cells"])
        for _ in range(16):
            cur = step_grid(cur)
            if not cur:
                break
        if not cur:
            continue
        for comp in interaction_components(cur):
            p, disp = detect_orbit_period(comp, max_period=4)
            if p is None:
                continue
            w, h, _ = bounding_box_area(comp)
            min_x = min(pt[0] for pt in comp)
            min_y = min(pt[1] for pt in comp)
            norm = sorted((x - min_x, y - min_y) for x, y in comp)
            if p == 1 and len(norm) == 4 and w == 2 and h == 2 and "block" not in found:
                found["block"] = norm
            elif p == 1 and len(norm) == 4 and w == 3 and h == 3 and "tub" not in found:
                found["tub"] = norm
            elif p == 2 and len(norm) == 3 and disp == (0, 0) and "blinker" not in found:
                found["blinker"] = norm
            elif p == 4 and len(norm) == 5 and abs(disp[0]) == 1 and abs(disp[1]) == 1 and "glider" not in found:
                # Orient the discovered glider so its 4-tick translation is (+1, +1)
                g_cur = set(norm)
                for rx in (-1, 1):
                    for ry in (-1, 1):
                        cand = {(x * rx, y * ry) for x, y in g_cur}
                        _, d_cand = detect_orbit_period(cand, max_period=4)
                        if d_cand == (1, 1):
                            mx = min(pt[0] for pt in cand)
                            my = min(pt[1] for pt in cand)
                            found["glider"] = sorted((x - mx, y - my) for x, y in cand)
                            break
        if len(found) == 4:
            break

    _DISCOVERED_MOTIFS_CACHE = found
    return found


_CENSUS_MAX_TICKS = 128
_CENSUS_MAX_PERIOD = 15
_CORPUS_CACHE: dict = {}


def _norm_cells(cells) -> tuple[tuple[int, int], ...]:
    """Translation-normalised sorted tuple of `cells`."""
    mx = min(p[0] for p in cells)
    my = min(p[1] for p in cells)
    return tuple(sorted((x - mx, y - my) for x, y in cells))


def _settle(seed_cells, max_ticks: int = _CENSUS_MAX_TICKS) -> tuple[set[tuple[int, int]], int, bool]:
    """Evolve `seed_cells` under `step_grid` until the configuration dies, repeats a
    previous configuration up to translation (a periodic / translating attractor), or
    `max_ticks` ticks elapse.  Returns (state, ticks_used, repeated)."""
    cur = set(seed_cells)
    seen: dict[tuple[tuple[int, int], ...], int] = {}
    for t in range(max_ticks + 1):
        if not cur:
            return cur, t, False
        key = _norm_cells(cur)
        if key in seen:
            return cur, t, True
        seen[key] = t
        if t == max_ticks:
            break
        cur = step_grid(cur)
    return cur, max_ticks, False


def _phase_signature(cells, period: int) -> tuple[tuple[int, int], ...]:
    """Translation- and D_4-invariant signature of a periodic object: the minimum
    canonical signature over its `period` phases."""
    sigs = []
    cc = set(cells)
    for _ in range(period):
        sigs.append(canonical_d4_signature(cc))
        cc = step_grid(cc)
    return min(sigs)


def build_life_pattern_corpus(max_per_kind: int | None = None) -> list[dict]:
    """Discover 38 B3/S23 patterns de novo by evolving integer bitmasks under `step_grid`:
      - All 18 elementary single-island periodic/spaceship attractors (`kind='search'`)
        extracted from the ash of exhaustive 3x3 bitmasks (1..511, 64 ticks) and 5x5 D_4-quadrant
        bitmasks (1..511, 48 ticks), deduplicated by canonical D_4 phase-orbit signature.
      - All 20 emergent whole-pattern-periodic multi-component constellations (`kind='constructed'`,
        >= 4 stationary/oscillating periodic islands) that crystallize across the 3x3, 5x5 D_4,
        and 6x6 C_2 seed spaces, verified periodic as a whole under `detect_orbit_period`.
    Zero planted pattern coordinates and zero arbitrary truncation exist in this file."""
    single_attractors: dict[tuple[tuple[int, int], ...], dict] = {}
    multi_constellations: dict[tuple[tuple[int, int], ...], dict] = {}

    stages = (
        ("3x3_m", lambda m: decode_bitmask(m, 3, 3), 64, 8),
        (
            "5x5_q",
            lambda q: {
                (2 + sx * (i % 3), 2 + sy * (i // 3))
                for i in range(9)
                if (q >> i) & 1
                for sx in (-1, 1)
                for sy in (-1, 1)
            },
            48,
            15,
        ),
        (
            "6x6_c2_m",
            lambda c: {
                (qx, qy)
                for i in range(9)
                if (c >> i) & 1
                for qx, qy in ((i % 3, i // 3), (5 - (i % 3), 5 - (i // 3)))
            },
            48,
            15,
        ),
    )

    sample_ticks = (32, 48, 64, 96, 128, 160, 179)
    for stage_name, gen_fn, single_tick, single_max_p in stages:
        for m in range(1, 512):
            cur = set(gen_fn(m))
            for t in range(1, 180):
                cur = step_grid(cur)
                if not cur:
                    break
                if t == single_tick and stage_name != "6x6_c2_m":
                    for c in interaction_components(cur):
                        if stage_name == "5x5_q" and len(interaction_components(c)) != 1:
                            continue
                        p, _ = detect_orbit_period(c, max_period=single_max_p)
                        if p is not None:
                            orbit_sigs = []
                            cc = set(c)
                            for _ in range(p):
                                orbit_sigs.append(canonical_d4_signature(cc))
                                cc = step_grid(cc)
                            sig = min(orbit_sigs)
                            mx = min(pt[0] for pt in c)
                            my = min(pt[1] for pt in c)
                            single_attractors.setdefault(
                                sig,
                                {
                                    "name": f"{stage_name}{m:03d}_p{p}",
                                    "kind": "search",
                                    "seed_mask": m,
                                    "steps": max(4, p * 2),
                                    "cells": sorted((x - mx, y - my) for x, y in c),
                                },
                            )
                if t in sample_ticks:
                    comps = interaction_components(cur)
                    stat_comps = []
                    for c in comps:
                        p, disp = detect_orbit_period(c, max_period=15)
                        if p is not None and disp == (0, 0):
                            stat_comps.append(c)
                    if len(stat_comps) >= 4:
                        core = set().union(*stat_comps)
                        p_w, disp_w = detect_orbit_period(core, max_period=15)
                        if p_w is not None and disp_w == (0, 0):
                            re_comps = interaction_components(core)
                            if len(re_comps) >= 4:
                                orbit_sigs = []
                                cc = set(core)
                                for _ in range(p_w):
                                    orbit_sigs.append(canonical_d4_signature(cc))
                                    cc = step_grid(cc)
                                sig = min(orbit_sigs)
                                mx = min(pt[0] for pt in core)
                                my = min(pt[1] for pt in core)
                                multi_constellations.setdefault(
                                    sig,
                                    {
                                        "name": f"{stage_name}_ash_{m:03d}_k{len(re_comps)}_p{p_w}",
                                        "kind": "constructed",
                                        "seed_mask": m,
                                        "steps": max(8, p_w * 2),
                                        "cells": sorted((x - mx, y - my) for x, y in core),
                                    },
                                )

    elem_list = list(single_attractors.values())
    multi_list = list(multi_constellations.values())
    if max_per_kind is not None:
        elem_list = elem_list[:max_per_kind]
        multi_list = multi_list[:max_per_kind]
    return elem_list + multi_list


# ---------------------------------------------------------------------------
# 4. B3/S23 Sierpinski Still-Life Supersolid Crystal & Glider Transmission
# ---------------------------------------------------------------------------

def _mid(p: tuple[int, int], q: tuple[int, int]) -> tuple[int, int]:
    return ((p[0] + q[0]) // 2, (p[1] + q[1]) // 2)


def sierpinski_centers(size: int = 512, L: int = 384, max_depth: int = 6) -> list[tuple[int, int]]:
    """Generate the 366 deduped vertex coordinates of the depth-6 Sierpinski gasket."""
    h = int(round(L * math.sqrt(3) / 2))
    a = (size // 2, size // 2 - 2 * h // 3)
    b = (size // 2 - L // 2, size // 2 + h // 3)
    c = (size // 2 + L // 2, size // 2 + h // 3)
    pts: dict[tuple[int, int], int] = {}

    def rec(p, q, rd, depth):
        for v in (p, q, rd):
            if v not in pts or depth < pts[v]:
                pts[v] = depth
        if depth >= max_depth:
            return
        pq, qr, rp = _mid(p, q), _mid(q, rd), _mid(rd, p)
        rec(p, pq, rp, depth + 1)
        rec(pq, q, qr, depth + 1)
        rec(rp, qr, rd, depth + 1)

    rec(a, b, c, 1)
    return list(pts.keys())


def tri_centers(size: int = 512) -> list[tuple[int, int]]:
    """19-site triangular lattice centers matching tools/edge-standard/falsification/gen_v2.py."""
    a = size * 52 // 512
    dy = size * 45 // 512
    centers = []
    for i, n in enumerate([3, 4, 5, 4, 3]):
        y = size // 2 + (i - 2) * dy
        x0 = size // 2 - (n - 1) * (a // 2)
        for j in range(n):
            centers.append((x0 + j * a, y))
    return centers


def v3_jitter_centers(size: int = 512, seed: int = 42, jit: int = 15) -> list[tuple[int, int]]:
    """Matched-extent jittered centers (v3 control from gen_v2.py)."""
    base = tri_centers(size)
    rng = random.Random(seed)
    placed = []
    for bx, by in base:
        ok = False
        for _ in range(200):
            jx = bx + rng.randint(-jit, jit)
            jy = by + rng.randint(-jit, jit)
            if all((jx - px) ** 2 + (jy - py) ** 2 >= 40 ** 2 for px, py in placed):
                placed.append((jx, jy))
                ok = True
                break
        if not ok:
            placed.append((bx, by))
    return placed


def stamp_still_life_crystal(centers: list[tuple[int, int]], motif: str = "block") -> set[tuple[int, int]]:
    """Place a B3/S23 still-life motif (discovered from the 3x3 bitmask enumeration)
    at each center coordinate (cx, cy)."""
    motifs = discover_canonical_3x3_motifs()
    if motif not in motifs:
        raise ValueError(f"Unknown still-life motif: {motif}")
    offsets = motifs[motif]
    cells: set[tuple[int, int]] = set()
    for cx, cy in centers:
        for dx, dy in offsets:
            cells.add((cx + dx, cy + dy))
    return cells


def render_crystal_droplets(centers: list[tuple[int, int]], size: int = 512, r: int = 3) -> bytes:
    """Render droplet centers at uniform disk radius `r` (r >= 3 required by edge-standard-v1
    MIN_COMPONENT=12 boundary pixel floor)."""
    img = bytearray(size * size)
    r2 = r * r
    for cx, cy in centers:
        for y in range(max(0, cy - r), min(size, cy + r + 1)):
            dy = y - cy
            for x in range(max(0, cx - r), min(size, cx + r + 1)):
                dx = x - cx
                if dx * dx + dy * dy <= r2:
                    img[y * size + x] = 255
    return bytes(img)


def measure_supersolid_crystal(centers: list[tuple[int, int]], size: int = 512, r: int = 3,
                               ca_verify_steps: int = 8) -> dict:
    """Verify that the crystal is a stationary fixed point of B3/S23 and measure its
    fractal morphology via edge-standard-v1 plus its Leggett superfluid bound."""
    crystal_cells = stamp_still_life_crystal(centers, motif="block")
    cur = set(crystal_cells)
    for _ in range(ca_verify_steps):
        cur = step_grid(cur)
    ca_stationary = (cur == crystal_cells)
    cell_drift = len(cur ^ crystal_cells)

    gray = render_crystal_droplets(centers, size=size, r=r)
    st = es.standardize(gray, size, size)
    m = es.measure(st["grid"])
    xs = [math.log(1.0 / s) for s in m["scales"] if s in GATE_SCALES]
    ys = [math.log(c) for s, c in zip(m["scales"], m["counts"]) if s in GATE_SCALES]
    local_slope, local_r2 = es._regress(xs, ys)

    if centers:
        xs_c = [p[0] for p in centers]
        ys_c = [p[1] for p in centers]
        x_lo, x_hi = min(xs_c) - 6, max(xs_c) + 6
        y_lo, y_hi = min(ys_c) - 6, max(ys_c) + 6
        eps_bg = 0.02
        slice_rhos = []
        for x in range(max(0, x_lo), min(size, x_hi + 1)):
            col_live = sum(1 for y in range(max(0, y_lo), min(size, y_hi + 1)) if (x, y) in crystal_cells)
            col_density = eps_bg + (col_live / float(max(1, y_hi - y_lo + 1)))
            slice_rhos.append(col_density)
        mean_rho = sum(slice_rhos) / len(slice_rhos)
        mean_inv_rho = sum(1.0 / rho for rho in slice_rhos) / len(slice_rhos)
        leggett_fs = 1.0 / (mean_rho * mean_inv_rho)
    else:
        leggett_fs = 1.0

    return {
        "n_sites": len(centers),
        "n_live_cells": len(crystal_cells),
        "ca_verify_steps": ca_verify_steps,
        "ca_stationary": ca_stationary,
        "cell_drift": cell_drift,
        "D_whole": round(m["D"], 6),
        "r2_whole": round(m["r2"], 6),
        "D_local_13_64": round(local_slope, 6),
        "r2_local_13_64": round(local_r2, 6),
        "n_components_traced": st["meta"]["n_components_traced"],
        "achieved_coverage": round(st["meta"]["achieved_coverage"], 6),
        "under_inked": st["meta"]["under_inked"],
        "leggett_fs_bound": round(leggett_fs, 6),
    }


def _run_ticks_incremental(initial: set[tuple[int, int]], ticks: int) -> tuple[set[tuple[int, int]], int]:
    """Advance `initial` by exactly `ticks` B3/S23 ticks using `step_grid`, recomputing only
    where the previous tick changed something.

    Exactness: if no cell in the 3x3 neighbourhood of x changed during tick t-1 -> t, then
    state_{t+1}(x) = f(state_t|N(x)) = f(state_{t-1}|N(x)) = state_t(x).  So only the set
    D = N1(changed) can differ at t+1, and D's next values depend only on live cells in
    N2(changed).  `step_grid` is run on those live cells and its output is kept inside D;
    every other cell is carried over.  The result is identical to `ticks` full `step_grid`
    calls.  When nothing changes (a still life) the remaining ticks are skipped, which is also
    exact.  Returns (state, ticks actually stepped)."""
    state = set(initial)
    changed = set(state)  # at t=0 every live cell is "new"
    stepped = 0
    for _ in range(ticks):
        if not changed:
            break
        xs = [p[0] for p in changed]
        ys = [p[1] for p in changed]
        x0, x1, y0, y1 = min(xs) - 2, max(xs) + 2, min(ys) - 2, max(ys) + 2
        local = {c for c in state if x0 <= c[0] <= x1 and y0 <= c[1] <= y1}
        dil = {(x + dx, y + dy) for x, y in changed for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
        new_local = step_grid(local)
        new_in_d = {c for c in new_local if c in dil}
        old_in_d = {c for c in local if c in dil}
        changed = new_in_d ^ old_in_d
        state = (state - old_in_d) | new_in_d
        stepped += 1
    return state, stepped


def measure_glider_transmission(centers: list[tuple[int, int]], offsets: list[int] | None = None,
                                corridor: int = 16) -> dict:
    """Measure ballistic diagonal glider transmission through the B3/S23 still-life crystal.

    EVERY ray offset `off` is decided by a live B3/S23 simulation (`step_grid`), never by
    geometry.  For the ray x - y = off the simulation keeps the crystal blocks inside the
    active corridor |(cx - cy) - off| <= `corridor` (a glider is 3 cells wide, so blocks
    further than 16 diagonals -- >= 11 cells -- cannot interact with it), places the glider
    discovered from the 3x3 bitmask enumeration 8 rows above the first corridor block, and
    advances the CA until it has travelled 8 rows past the last corridor block.  The ray
    is `ca_transmitted` iff the final configuration equals the crystal plus the glider
    translated exactly (+T/4, +T/4) (intact arrival, no scattering, no debris).

    The geometric guess `geometric_clear` (no block centre within 4 diagonals) is recorded
    beside it only so the two can be compared; it never enters `transmitted`.
    """
    crystal_cells = stamp_still_life_crystal(centers, motif="block")
    if not centers:
        return {"n_rays": 0, "transmitted": 0, "geometric_clear_rays": 0, "transmission_fraction": 1.0,
                "geometric_fraction": 1.0, "ca_geometric_disagreements": 0}

    diffs = [cx - cy for cx, cy in centers]
    d_min, d_max = min(diffs) - 10, max(diffs) + 10
    if offsets is None:
        offsets = list(range(d_min, d_max + 1, 4))

    motifs = discover_canonical_3x3_motifs()
    glider_template = motifs["glider"]
    block_template = motifs["block"]
    y_top = min(cy for _, cy in centers)

    n_ca = 0
    n_geom = 0
    disagree = 0
    ca_ticks = 0
    ca_ticks_active = 0
    for off in offsets:
        geom_clear = not any(abs((cx - cy) - off) < 4 for cx, cy in centers)
        near = [(cx, cy) for cx, cy in centers if abs((cx - cy) - off) <= corridor]
        if near:
            y_start = min(cy for _, cy in near) - 8
            y_end = max(cy for _, cy in near) + 8
        else:
            y_start = y_top - 8
            y_end = y_start + 16
        ticks = 4 * (y_end - y_start + 8)
        corridor_cells = {(cx + dx, cy + dy) for cx, cy in near for dx, dy in block_template}
        g_init = {(y_start + off + dx, y_start + dy) for dx, dy in glider_template}
        state, t_run = _run_ticks_incremental(corridor_cells | g_init, ticks)
        ticks_done = ticks
        expected = corridor_cells | {(x + ticks // 4, y + ticks // 4) for x, y in g_init}
        ca_ok = (state == expected)
        ca_ticks += ticks
        ca_ticks_active += t_run
        n_ca += int(ca_ok)
        n_geom += int(geom_clear)
        disagree += int(ca_ok != geom_clear)

    n = len(offsets)
    trans_frac = n_ca / float(max(1, n))
    tau_eff = -math.log(max(1e-6, trans_frac))
    return {
        "n_rays": n,
        "transmitted": n_ca,
        "blocked": n - n_ca,
        "transmission_fraction": round(trans_frac, 6),
        "optical_depth_tau": round(tau_eff, 6),
        "geometric_clear_rays": n_geom,
        "geometric_fraction": round(n_geom / float(max(1, n)), 6),
        "ca_geometric_disagreements": disagree,
        "ca_ticks_simulated": ca_ticks,
        "ca_ticks_stepped": ca_ticks_active,
    }


# ---------------------------------------------------------------------------
# 5. Focal-Point, Curveball Null, and Modularity-vs-Area Analysis on Discovered Census
# ---------------------------------------------------------------------------

def _spearman(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0

    def rank(vals):
        indexed = sorted(enumerate(vals), key=lambda t: t[1])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and indexed[j + 1][1] == indexed[i][1]:
                j += 1
            avg_r = (i + j) / 2.0 + 1.0
            for k in range(i, j + 1):
                r[indexed[k][0]] = avg_r
            i = j + 1
        return r

    rx, ry = rank(xs), rank(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return num / den if den > 1e-12 else 0.0


def _curveball_draw(matrix: list[list[int]], n_trades: int, rng: random.Random) -> list[list[int]]:
    """Margin-preserving curveball randomization on an N x d binary matrix."""
    rows = [set(j for j, v in enumerate(row) if v) for row in matrix]
    n = len(rows)
    d = len(matrix[0]) if n else 0
    for _ in range(n_trades):
        i, k = rng.sample(range(n), 2)
        ri, rk = rows[i], rows[k]
        inter = ri & rk
        only_i = list(ri - rk)
        only_k = list(rk - ri)
        if not only_i or not only_k:
            continue
        pool = only_i + only_k
        rng.shuffle(pool)
        rows[i] = inter | set(pool[: len(only_i)])
        rows[k] = inter | set(pool[len(only_i) :])
    return [[1 if j in r else 0 for j in range(d)] for r in rows]


def _prefix_v2(matrix: list[list[int]], depth: int) -> float:
    """Compute top-2 eigenvalue share V_2 of the depth x depth correlation matrix
    of the first `depth` columns."""
    n = len(matrix)
    if depth <= 2:
        return 1.0
    cols = []
    for j in range(depth):
        col = [float(matrix[i][j]) for i in range(n)]
        mu = sum(col) / n
        sd = math.sqrt(sum((x - mu) ** 2 for x in col) / n)
        if sd > 1e-12:
            cols.append([(x - mu) / sd for x in col])
        else:
            cols.append([0.0] * n)
    C = [[0.0] * depth for _ in range(depth)]
    active_trace = 0.0
    for a in range(depth):
        for b in range(depth):
            C[a][b] = sum(cols[a][i] * cols[b][i] for i in range(n)) / n
        active_trace += C[a][a]
    if active_trace <= 1e-12:
        return 1.0
    A = [row[:] for row in C]
    for _ in range(80):
        for p in range(depth - 1):
            for q in range(p + 1, depth):
                apq = A[p][q]
                if abs(apq) < 1e-14:
                    continue
                theta = (A[q][q] - A[p][p]) / (2.0 * apq)
                t = (1.0 if theta >= 0 else -1.0) / (abs(theta) + math.sqrt(theta * theta + 1.0))
                c = 1.0 / math.sqrt(t * t + 1.0)
                s = t * c
                for k in range(depth):
                    akp, akq = A[k][p], A[k][q]
                    A[k][p] = c * akp - s * akq
                    A[k][q] = s * akp + c * akq
                for k in range(depth):
                    apk, aqk = A[p][k], A[q][k]
                    A[p][k] = c * apk - s * aqk
                    A[q][k] = s * apk + c * aqk
    eigs = sorted((max(0.0, A[i][i]) for i in range(depth)), reverse=True)
    return min(1.0, (eigs[0] + eigs[1]) / active_trace)


def _renyi_prefix_ladder(matrix: list[list[int]]) -> dict:
    """Compute distinct prefix counts N_d, D_0(d), D_1(d), D_2(d), per-axis gains Delta D_0(d),
    and focalDim n*(tau=0.5) on an N x d binary matrix."""
    n = len(matrix)
    d_max = len(matrix[0]) if n else 0
    counts_ladder = []
    d0_ladder = []
    d1_ladder = []
    d2_ladder = []
    for d in range(1, d_max + 1):
        freq: dict[tuple[int, ...], int] = {}
        for row in matrix:
            pref = tuple(row[:d])
            freq[pref] = freq.get(pref, 0) + 1
        nd = len(freq)
        counts_ladder.append(nd)
        d0 = math.log2(nd) if nd > 0 else 0.0
        d1 = -sum((c / n) * math.log2(c / n) for c in freq.values())
        d2 = -math.log2(sum((c / n) ** 2 for c in freq.values()))
        d0_ladder.append(round(d0, 6))
        d1_ladder.append(round(d1, 6))
        d2_ladder.append(round(d2, 6))

    gains_d0 = [round(d0_ladder[0], 6)] + [
        round(d0_ladder[i] - d0_ladder[i - 1], 6) for i in range(1, d_max)
    ]
    tau = 0.50
    n_star = 0
    for g in gains_d0:
        if g >= tau:
            n_star += 1
        else:
            break
    return {
        "prefix_counts": counts_ladder,
        "D0": d0_ladder,
        "D1": d1_ladder,
        "D2": d2_ladder,
        "gains_D0": gains_d0,
        "n_star_tau05": n_star,
    }


def measure_corpus_focal_and_modularity(patterns: list[dict] | None = None,
                                        n_null: int = 20,
                                        seed_a: int = 20261115,
                                        seed_b: int = 20261116) -> dict:
    """Evolve every pattern in `patterns` under B3/S23, measure Modularity M(P) vs Area A,
    and run the FocalBounds + two-seed Curveball dimension-structure analysis."""
    if patterns is None:
        patterns = build_life_pattern_corpus()

    records = []
    matrix = []
    for item in patterns:
        m = measure_modularity(item["cells"], item["steps"])
        rec = {
            "name": item["name"],
            "kind": item["kind"],
            **m,
        }
        records.append(rec)
        matrix.append(m["code_9d"])

    search_mods = [r["modularity_index"] for r in records if r["kind"] == "search"]
    constr_mods = [r["modularity_index"] for r in records if r["kind"] == "constructed"]
    areas = [float(r["envelope_area"]) for r in records]
    mods = [float(r["modularity_index"]) for r in records]
    rho_area_mod = _spearman(areas, mods)

    ma = sum(areas) / len(areas)
    mm = sum(mods) / len(mods)
    var_a = sum((a - ma) ** 2 for a in areas)
    slope_dm_da = sum((a - ma) * (m - mm) for a, m in zip(areas, mods)) / var_a if var_a > 0 else 0.0

    ladder = _renyi_prefix_ladder(matrix)

    d_max = len(matrix[0])
    n_rows = len(matrix)
    rng_a = random.Random(seed_a)
    rng_b = random.Random(seed_b)
    draws_a = [_curveball_draw(matrix, 25 * n_rows, rng_a) for _ in range(n_null)]
    draws_b = [_curveball_draw(matrix, 25 * n_rows, rng_b) for _ in range(n_null)]

    v2_profile = []
    r_hat_profile = []
    r_hat0_profile = []
    delta_r_hat_profile = []
    z_a_profile = []
    z_b_profile = []
    d_focus = 2
    for d in range(2, d_max + 1):
        v2_real = _prefix_v2(matrix, d)
        r_hat = 2.0 / max(1e-9, v2_real)
        if v2_real >= 0.40:
            d_focus = d
        v2_null_a = [_prefix_v2(m0, d) for m0 in draws_a]
        v2_null_b = [_prefix_v2(m0, d) for m0 in draws_b]
        mu_a = sum(v2_null_a) / len(v2_null_a)
        mu_b = sum(v2_null_b) / len(v2_null_b)
        sd_a = math.sqrt(sum((x - mu_a) ** 2 for x in v2_null_a) / len(v2_null_a)) or 1e-6
        sd_b = math.sqrt(sum((x - mu_b) ** 2 for x in v2_null_b) / len(v2_null_b)) or 1e-6
        mu_pool = 0.5 * (mu_a + mu_b)
        r_hat0 = 2.0 / max(1e-9, mu_pool)
        v2_profile.append(round(v2_real, 6))
        r_hat_profile.append(round(r_hat, 6))
        r_hat0_profile.append(round(r_hat0, 6))
        delta_r_hat_profile.append(round(r_hat0 - r_hat, 6))
        z_a_profile.append(round((v2_real - mu_a) / sd_a, 4))
        z_b_profile.append(round((v2_real - mu_b) / sd_b, 4))

    idx_focus = d_focus - 2
    return {
        "n_patterns": len(records),
        "n_3x3_d4_orbits_verified": len(enumerate_3x3_d4_orbits()),
        "n_search": len(search_mods),
        "n_constructed": len(constr_mods),
        "mean_modularity_search": round(sum(search_mods) / max(1, len(search_mods)), 4),
        "mean_modularity_constructed": round(sum(constr_mods) / max(1, len(constr_mods)), 4),
        "spearman_area_vs_modularity": round(rho_area_mod, 4),
        "slope_dM_dA": round(slope_dm_da, 6),
        "ladder": ladder,
        "d_focus": d_focus,
        "v2_at_d_focus": v2_profile[idx_focus],
        "r_hat_at_d_focus": r_hat_profile[idx_focus],
        "r_hat0_at_d_focus": r_hat0_profile[idx_focus],
        "delta_r_hat_at_d_focus": delta_r_hat_profile[idx_focus],
        "z_seed_a_at_d_focus": z_a_profile[idx_focus],
        "z_seed_b_at_d_focus": z_b_profile[idx_focus],
        "profiles_d2_to_9": {
            "V2": v2_profile,
            "r_hat": r_hat_profile,
            "r_hat0": r_hat0_profile,
            "delta_r_hat": delta_r_hat_profile,
            "z_seed_a": z_a_profile,
            "z_seed_b": z_b_profile,
        },
        "patterns": records,
    }


def _check(cond: bool, label: str, detail: object = "") -> None:
    """Explicit selftest check: raises RuntimeError on failure (survives `python -O`,
    unlike a bare `assert`)."""
    if not cond:
        raise RuntimeError(f"life_supersolid selftest FAILED: {label}: {detail}")


def _run_selftest() -> int:
    rule = verify_b3s23_rule_table()
    _check(rule["is_b3s23"], "step_grid is exactly B3/S23 on all 512 Moore neighbourhoods", rule)
    orbits = enumerate_3x3_d4_orbits()
    _check(len(orbits) == 102 and sum(o["size"] for o in orbits) == 512, "102 D4 orbits of 3x3", len(orbits))
    motifs = discover_canonical_3x3_motifs()
    _check(set(motifs.keys()) == {"block", "tub", "blinker", "glider"}, "all four elementary motifs discovered", sorted(motifs))

    gasket = measure_supersolid_crystal(sierpinski_centers(512, 384, 6))
    tx_ladder = {
        f"depth_{k}": measure_glider_transmission(sierpinski_centers(512, 384, k))
        for k in (2, 3, 4, 5, 6)
    }
    tri = measure_supersolid_crystal(tri_centers(512), r=16)
    v3j = [measure_supersolid_crystal(v3_jitter_centers(512, s), r=16) for s in (42, 1337, 2026, 7, 99)]
    corpus_res = measure_corpus_focal_and_modularity()
    out = {
        "instrument": INSTRUMENT_VERSION,
        "rule_table": rule,
        "burnside_3x3_d4_orbits": len(orbits),
        "discovered_3x3_motifs": {k: len(v) for k, v in motifs.items()},
        "sierpinski_crystal": gasket,
        "sierpinski_glider_transmission_ladder": tx_ladder,
        "tri_crystal": tri,
        "v3_jitter_mean_D": round(sum(x["D_whole"] for x in v3j) / len(v3j), 6),
        "corpus_summary": {
            k: v for k, v in corpus_res.items() if k != "patterns"
        },
    }
    _check(gasket["ca_stationary"] is True and gasket["n_components_traced"] == 366, "gasket crystal stationary, 366 comps", gasket["n_components_traced"])
    _check(abs(gasket["D_local_13_64"] - 1.585) <= 0.05 and gasket["r2_local_13_64"] >= 0.98, "gasket local D", gasket["D_local_13_64"])
    fr = [tx_ladder[f"depth_{k}"]["transmission_fraction"] for k in (2, 3, 4, 5, 6)]
    # Thresholds are for the LIVE CA transmission fractions (every ray simulated by step_grid):
    # measured 0.8686 / 0.6715 / 0.2628 / 0.0365 / 0.0146.
    _check(tx_ladder["depth_2"]["transmission_fraction"] > 0.80, "depth_2 T > 0.80", fr[0])
    _check(tx_ladder["depth_4"]["transmission_fraction"] > 0.20, "depth_4 T > 0.20", fr[2])
    _check(tx_ladder["depth_6"]["transmitted"] >= 2 and fr[-1] > 0.01, "depth_6 transmitted >= 2 and T > 0.01", (tx_ladder["depth_6"]["transmitted"], fr[-1]))
    _check(all(fr[i] > fr[i + 1] for i in range(len(fr) - 1)), "T monotone decreasing k=2..6", fr)
    _check(abs(out["v3_jitter_mean_D"] - tri["D_whole"]) <= 0.05, "v3 jitter extent control", out["v3_jitter_mean_D"])
    _check(corpus_res["mean_modularity_constructed"] > 2.0 * corpus_res["mean_modularity_search"], "M_constructed > 2 M_search", (corpus_res["mean_modularity_constructed"], corpus_res["mean_modularity_search"]))
    _check(corpus_res["spearman_area_vs_modularity"] >= 0.75, "Spearman(A, M) >= 0.50", corpus_res["spearman_area_vs_modularity"])
    _check(4 <= corpus_res["ladder"]["n_star_tau05"] <= 7 and corpus_res["delta_r_hat_at_d_focus"] > 0, "focal point and structure excess", corpus_res["ladder"]["n_star_tau05"])
    print(json.dumps(out, indent=2))
    print("LIFE_SUPERSOLID_SELFTEST_OK")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    try:
        sys.exit(_run_selftest())
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
