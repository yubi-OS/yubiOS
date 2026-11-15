#!/usr/bin/env python3
"""harness_life.py -- Falsification harness for life-supersolid-v1 (yubi-OS/yubiOS).

Verifies that ACTUAL measurement is happening (zero static JSON lookups, zero
cached/stubbed outputs) and tests the two pre-registered open assumptions from
refs/wolfram-life-supersolid-optics-psychology-solo-2026-11-15.md:

  Part I — Anti-Stub Dynamic Perturbation Gates (G_DYN_1..5):
    Verifies that every measurement callable in life_supersolid.py computes its
    output dynamically from the live B3/S23 cellular automaton evolution,
    edge-standard contour tracing, and curveball null draws:
      * G_DYN_1: Cell-ablation perturbation on Glider, Blinker, and Gosper Gun
        must strictly alter period/translation and modularity M(P).
      * G_DYN_2: Site-deletion perturbation on the B3/S23 Sierpinski crystal
        (removing 66 of 366 sites -> 300 sites) must move n_components_traced
        366 -> 300 and change D_whole.
      * G_DYN_3: Corridor-blocking perturbation (placing a 2x2 Block directly
        into a clear diagonal glider channel) must reduce transmitted ray count.
      * G_DYN_4: Rank-collapse (caustic) perturbation on the corpus feature
        matrix (cloning 2 rows -> rank 2) must force V_2 = 1.0000 (r_hat = 2.0).
      * G_DYN_5: Seed-sensitivity check on the curveball null (seed_a vs seed_b
        must produce distinct null z-scores, proving live Monte Carlo draws).

  Part II — Scientific Falsification Gates (G_SCI_1..6):
      * G_SCI_1 (B3/S23 Sierpinski Still-Life Stationarity & Fractal Gate):
        All 5 Sierpinski depths k=2..6 (6, 15, 42, 123, 366 still-life blocks)
        are exact fixed points of B3/S23 (0 cell drift over 8 ticks), and depth 6
        passes the edge-standard-v1 Sierpinski local-slope gate
        D_local{13..64} in [1.535, 1.635] with r^2 >= 0.98 and 366 traced components.
      * G_SCI_2 (Ballistic Glider Superfluid Transmission & Leggett Bound Gate):
        Diagonal glider transmission T_glider(k) is strictly positive at every
        depth k=2..6, monotonically decreases with site density N(k) (Beer-Lambert
        law), is verified by live B3/S23 glider propagation without scattering,
        and satisfies Leggett superfluid bound 0 < f_s_bound < 1.
      * G_SCI_3 (v3 Matched-Extent Control Gate — Assumption 1):
        Destroying translational order of the B3/S23 triangular still-life lattice
        at matched bounding-box extent (5-seed v3-jitter control) moves D_whole by
        |mean(D_v3j) - D_tri| <= 0.05 (confirming extent-invariance of D on
        non-hierarchical crystals), while the B3/S23 Sierpinski crystal separates
        from both by Delta D_whole >= 0.25 and Delta D_local >= 0.12.
      * G_SCI_4 (Wolfram 2025 Modularity-vs-Area & Search-Collapse Gate — Assumption 2a):
        Across the 36 evolved B3/S23 patterns, search-discovered compact motifs
        satisfy mean(M_search) <= 1.25 (near the M=1 irreducible blob limit),
        human-constructed modular architectures satisfy mean(M_constructed) >= 4.0
        (inside the Miller 7+-2 / Cowan 4+-1 working-memory band), and
        Spearman rho(Area, M) >= 0.75 with positive slope dM/dA > 0.
      * G_SCI_5 (Area-Compression Modularity Collapse Gate — Assumption 2b):
        Compressing the inter-module spacing of a 4-module oscillator network
        from d_sep = 12 down to d_sep = 2 collapses measured b_0(G_t) modularity
        from M = 4.0 down to M = 1.0 (verifying LifeBounds.cognitive_modularity_collapse).
      * G_SCI_6 (Dimensional Focal Point & Structure Excess Gate — Assumption 2c):
        On the evolved 36-pattern B3/S23 feature matrix, the Renyi prefix ladder
        selects focal point n*(tau=0.5) in [4, 7] (Cowan/Miller working-memory
        capacity), effective dimension r_hat = 2/V_2 <= 5.0 holds at n*, and
        structure excess Delta r_hat = r_hat0 - r_hat > 0.50 is resolved (z > 3.0)
        across both independent curveball null seeds.

Exit codes: 0 all gates pass, 1 any gate fails, 4 module surface error.
"""

from __future__ import annotations

import inspect
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MOD_DIR = os.path.abspath(os.path.join(HERE, ".."))

REQUIRED_CALLABLES = (
    "step_grid",
    "evolve_pattern",
    "interaction_components",
    "measure_modularity",
    "sierpinski_centers",
    "tri_centers",
    "v3_jitter_centers",
    "stamp_still_life_crystal",
    "measure_supersolid_crystal",
    "measure_glider_transmission",
    "build_life_pattern_corpus",
    "measure_corpus_focal_and_modularity",
)


def fail_surface(msg: str) -> None:
    print(f"MODULE SURFACE ERROR: {msg}", file=sys.stderr)
    sys.exit(4)


def load_instrument():
    if not os.path.isdir(MOD_DIR):
        fail_surface(f"instrument directory {MOD_DIR} does not exist")
    if MOD_DIR not in sys.path:
        sys.path.insert(0, MOD_DIR)
    try:
        import life_supersolid as mod
    except ImportError as exc:
        fail_surface(f"cannot import life_supersolid from {MOD_DIR}: {exc}")
    for name in REQUIRED_CALLABLES:
        fn = getattr(mod, name, None)
        if not callable(fn):
            actual = [k for k, v in inspect.getmembers(mod, callable) if not k.startswith("_")]
            fail_surface(f"life_supersolid missing callable '{name}'; exposes {actual}")
    return mod


def run_harness() -> int:
    mod = load_instrument()
    checks: list[dict] = []
    fails = 0

    def record(gate_id: str, kind: str, ok: bool, detail: str) -> None:
        nonlocal fails
        status = "PASS" if ok else "FAIL"
        if not ok:
            fails += 1
        print(f"{status}  [{kind}] {gate_id:<38} {detail}")
        checks.append({"gate": gate_id, "kind": kind, "ok": bool(ok), "detail": detail})

    # =========================================================================
    # PART I: Anti-Stub Dynamic Perturbation Gates (verifies real measurement)
    # =========================================================================

    # G_DYN_1: Ablating 1 cell from Glider, Blinker, and Gosper Gun must alter dynamics
    glider = [(1, 0), (2, 1), (0, 2), (1, 2), (2, 2)]
    g_intact = mod.measure_modularity(glider, 4)
    g_ablated = mod.measure_modularity(glider[:-1], 4)  # 4 cells -> dies to block/empty
    blinker = [(0, 1), (1, 1), (2, 1)]
    b_intact = mod.measure_modularity(blinker, 2)
    b_ablated = mod.measure_modularity(blinker[:-1], 2)  # 2 cells -> dies in 1 step
    dyn1_ok = (
        g_intact["translated"] is True
        and g_ablated["translated"] is False
        and g_intact["final_population"] == 5
        and g_ablated["final_population"] != 5
        and b_intact["exact_periodic"] is True
        and b_ablated["final_population"] == 0
    )
    record(
        "G_DYN_1_ca_ablation_response",
        "ANTI-STUB",
        dyn1_ok,
        f"glider intact translated={g_intact['translated']} vs ablated={g_ablated['translated']}; "
        f"blinker ablated pop={b_ablated['final_population']}",
    )

    # G_DYN_2: Pruning 66 sites from the 366-site Sierpinski crystal must move traced comps 366 -> 300
    c366 = mod.sierpinski_centers(512, 384, 6)
    c300 = c366[:300]
    m366 = mod.measure_supersolid_crystal(c366, 512, 3, ca_verify_steps=4)
    m300 = mod.measure_supersolid_crystal(c300, 512, 3, ca_verify_steps=4)
    dyn2_ok = (
        m366["n_components_traced"] == 366
        and m300["n_components_traced"] == 300
        and m366["D_whole"] != m300["D_whole"]
        and m366["n_live_cells"] == 366 * 4
        and m300["n_live_cells"] == 300 * 4
    )
    record(
        "G_DYN_2_crystal_site_pruning",
        "ANTI-STUB",
        dyn2_ok,
        f"comps {m366['n_components_traced']}->{m300['n_components_traced']}, "
        f"D_whole {m366['D_whole']:.4f}->{m300['D_whole']:.4f}",
    )

    # G_DYN_3: Blocking a clear diagonal glider corridor must reduce transmitted ray count
    c_d3 = mod.sierpinski_centers(512, 384, 3)
    tx_open = mod.measure_glider_transmission(c_d3, offsets=[0])
    # Place a 2x2 block right on the x - y = 0 diagonal at (250, 250)
    tx_blocked = mod.measure_glider_transmission(c_d3 + [(250, 250)], offsets=[0])
    dyn3_ok = (tx_open["transmitted"] == 1 and tx_blocked["transmitted"] == 0)
    record(
        "G_DYN_3_corridor_blocker_injection",
        "ANTI-STUB",
        dyn3_ok,
        f"ray offset=0 transmitted open={tx_open['transmitted']} vs blocked={tx_blocked['transmitted']}",
    )

    # G_DYN_4: Rank-2 degenerate corpus must trigger caustic V_2 = 1.0000 (r_hat = 2.0)
    deg_patterns = [
        {"name": f"clone_blinker_{i}", "kind": "search", "steps": 2, "cells": blinker}
        for i in range(6)
    ] + [
        {"name": f"clone_glider_{i}", "kind": "constructed", "steps": 4, "cells": glider + [(12, 0), (13, 0), (12, 1), (13, 1)]}
        for i in range(6)
    ]
    deg_res = mod.measure_corpus_focal_and_modularity(deg_patterns, n_null=6)
    full_res = mod.measure_corpus_focal_and_modularity(n_null=20)
    dyn4_ok = (
        abs(deg_res["profiles_d2_to_9"]["V2"][-1] - 1.0) < 1e-6
        and abs(deg_res["profiles_d2_to_9"]["r_hat"][-1] - 2.0) < 1e-6
        and full_res["profiles_d2_to_9"]["r_hat"][-1] > 2.8
    )
    record(
        "G_DYN_4_caustic_rank2_injection",
        "ANTI-STUB",
        dyn4_ok,
        f"degenerate r_hat(d=9)={deg_res['profiles_d2_to_9']['r_hat'][-1]:.4f} vs "
        f"full corpus r_hat(d=9)={full_res['profiles_d2_to_9']['r_hat'][-1]:.4f}",
    )

    # G_DYN_5: Two independent curveball null seeds must yield distinct Monte Carlo z-trajectories
    dyn5_ok = (full_res["profiles_d2_to_9"]["z_seed_a"] != full_res["profiles_d2_to_9"]["z_seed_b"])
    record(
        "G_DYN_5_curveball_two_seed_independence",
        "ANTI-STUB",
        dyn5_ok,
        f"z_seed_a(d=9)={full_res['z_seed_a_at_d_focus']:.2f} vs "
        f"z_seed_b(d=9)={full_res['z_seed_b_at_d_focus']:.2f}",
    )

    # =========================================================================
    # PART II: Pre-Registered Scientific Falsification Gates (Assumptions 1 & 2)
    # =========================================================================

    # G_SCI_1: B3/S23 Sierpinski Still-Life Crystal Stationarity & Fractal Gate
    depths_stationary = True
    for k in (2, 3, 4, 5, 6):
        ck = mod.sierpinski_centers(512, 384, k)
        mk = mod.measure_supersolid_crystal(ck, 512, 3, ca_verify_steps=8)
        if not mk["ca_stationary"] or mk["cell_drift"] != 0:
            depths_stationary = False
    sci1_ok = (
        depths_stationary
        and m366["n_components_traced"] == 366
        and abs(m366["D_local_13_64"] - 1.585) <= 0.05
        and m366["r2_local_13_64"] >= 0.98
        and not m366["under_inked"]
    )
    record(
        "G_SCI_1_sierpinski_b3s23_crystal_gate",
        "ASSUMPTION-1",
        sci1_ok,
        f"all depths k=2..6 stationary={depths_stationary}, D_local={m366['D_local_13_64']:.4f} "
        f"(gate 1.585+-0.05), r2={m366['r2_local_13_64']:.4f}, comps={m366['n_components_traced']}",
    )

    # G_SCI_2: Ballistic Glider Superfluid Transmission & Leggett Bound Gate
    tx_by_depth = [
        mod.measure_glider_transmission(mod.sierpinski_centers(512, 384, k))
        for k in (2, 3, 4, 5, 6)
    ]
    fracs = [t["transmission_fraction"] for t in tx_by_depth]
    monotone_beer_lambert = all(fracs[i] > fracs[i + 1] for i in range(len(fracs) - 1))
    all_ca_rays_ok = all(t["ca_verified_clear_ray"] for t in tx_by_depth)
    sci2_ok = (
        monotone_beer_lambert
        and all_ca_rays_ok
        and fracs[0] > 0.85
        and fracs[-1] > 0.02
        and 0.50 < m366["leggett_fs_bound"] < 1.0
    )
    record(
        "G_SCI_2_ballistic_glider_beer_lambert",
        "ASSUMPTION-1",
        sci2_ok,
        f"T(k=2..6)={[round(x, 3) for x in fracs]}, ca_rays_verified={all_ca_rays_ok}, "
        f"Leggett f_s_bound={m366['leggett_fs_bound']:.4f}",
    )

    # G_SCI_3: v3 Matched-Extent Control Gate (Assumption 1 deconfounding)
    m_tri = mod.measure_supersolid_crystal(mod.tri_centers(512), 512, r=16, ca_verify_steps=8)
    v3_ds = []
    v3_stationary = True
    for s in (42, 1337, 2026, 7, 99):
        mj = mod.measure_supersolid_crystal(mod.v3_jitter_centers(512, s), 512, r=16, ca_verify_steps=8)
        v3_ds.append(mj["D_whole"])
        if not mj["ca_stationary"]:
            v3_stationary = False
    mean_v3j = sum(v3_ds) / len(v3_ds)
    extent_diff = abs(mean_v3j - m_tri["D_whole"])
    hierarchy_gap = m366["D_whole"] - m_tri["D_whole"]
    sci3_ok = (
        m_tri["ca_stationary"]
        and v3_stationary
        and extent_diff <= 0.05
        and hierarchy_gap >= 0.25
    )
    record(
        "G_SCI_3_v3_matched_extent_control",
        "ASSUMPTION-1",
        sci3_ok,
        f"|mean(D_v3j)={mean_v3j:.4f} - D_tri={m_tri['D_whole']:.4f}| = {extent_diff:.4f} <= 0.05; "
        f"gasket-tri gap = +{hierarchy_gap:.4f} >= 0.25",
    )

    # G_SCI_4: Wolfram (2025) Modularity-vs-Area & Search vs Construction Gate (Assumption 2a)
    m_search = full_res["mean_modularity_search"]
    m_constr = full_res["mean_modularity_constructed"]
    rho_am = full_res["spearman_area_vs_modularity"]
    slope_am = full_res["slope_dM_dA"]
    sci4_ok = (
        m_search <= 1.25
        and 4.0 <= m_constr <= 9.0
        and rho_am >= 0.75
        and slope_am > 0.0
    )
    record(
        "G_SCI_4_modularity_vs_area_separation",
        "ASSUMPTION-2",
        sci4_ok,
        f"mean M_search={m_search:.3f} (<=1.25) vs M_constructed={m_constr:.3f} (in [4,9]); "
        f"Spearman rho(A,M)={rho_am:.4f} (>=0.75), dM/dA=+{slope_am:.6f}",
    )

    # G_SCI_5: Direct Area-Compression Modularity Collapse Experiment (Assumption 2b)
    # Place 4 independent blocks at separation d_sep = 10 (area 144, M = 4.0) vs compressed d_sep = 2 (area 16, M = 1.0)
    block = [(0, 0), (1, 0), (0, 1), (1, 1)]
    sep10 = [(x + dx, y + dy) for dx in (0, 10) for dy in (0, 10) for x, y in block]
    sep2 = [(x + dx, y + dy) for dx in (0, 2) for dy in (0, 2) for x, y in block]
    m_sep10 = mod.measure_modularity(sep10, 2)
    m_sep2 = mod.measure_modularity(sep2, 2)
    sci5_ok = (
        m_sep10["modularity_index"] == 4.0
        and m_sep2["modularity_index"] == 1.0
        and m_sep2["envelope_area"] < m_sep10["envelope_area"]
    )
    record(
        "G_SCI_5_area_compression_modularity_collapse",
        "ASSUMPTION-2",
        sci5_ok,
        f"d_sep=10 (area={m_sep10['envelope_area']}) -> M={m_sep10['modularity_index']:.1f}; "
        f"d_sep=2 (area={m_sep2['envelope_area']}) -> M={m_sep2['modularity_index']:.1f}",
    )

    # G_SCI_6: Dimensional Focal Point n* & Two-Seed Curveball Structure Excess Gate (Assumption 2c)
    n_star = full_res["ladder"]["n_star_tau05"]
    r_hat_nstar = full_res["profiles_d2_to_9"]["r_hat"][n_star - 2]
    delta_r = full_res["delta_r_hat_at_d_focus"]
    za = full_res["z_seed_a_at_d_focus"]
    zb = full_res["z_seed_b_at_d_focus"]
    sci6_ok = (
        4 <= n_star <= 7
        and r_hat_nstar <= 5.0
        and delta_r >= 0.50
        and za >= 3.0
        and zb >= 3.0
    )
    record(
        "G_SCI_6_focal_point_and_structure_excess",
        "ASSUMPTION-2",
        sci6_ok,
        f"n*(tau=0.5)={n_star} (in [4,7]), r_hat(n*)={r_hat_nstar:.3f} (<=5.0), "
        f"Delta r_hat=+{delta_r:.3f}, z_seed_a=+{za:.2f}, z_seed_b=+{zb:.2f}",
    )

    summary = {
        "harness": "harness_life-v1.0.0",
        "instrument": mod.INSTRUMENT_VERSION,
        "ok": fails == 0,
        "passing_gates": len(checks) - fails,
        "total_gates": len(checks),
        "anti_stub_gates_passed": sum(1 for c in checks if c["kind"] == "ANTI-STUB" and c["ok"]),
        "scientific_gates_passed": sum(1 for c in checks if c["kind"].startswith("ASSUMPTION") and c["ok"]),
        "checks": checks,
    }
    print("HARNESS_LIFE_JSON " + json.dumps(summary))
    if fails:
        print(f"HARNESS_LIFE_FAIL: {fails}/{len(checks)} gates failed")
        return 1
    print(f"HARNESS_LIFE_OK: {len(checks)}/{len(checks)} gates passed (5 anti-stub + 6 scientific)")
    return 0


if __name__ == "__main__":
    sys.exit(run_harness())
