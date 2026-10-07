# gen_fixtures.py — regenerates fixtures_spectral.json from the source of record.
# Run: python3 gen_fixtures.py   (writes fixtures_spectral.json next to itself)
# The PRNG ground truth inside the pack was generated independently by node
# (canonical JS mulberry32) so the pack is an independent parity anchor, not
# a copy of the Python output.

import json
import os

import spectral_standard as S

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    pack = {}
    pack["meta"] = {
        "pipeline": S.PIPELINE,
        "source_of_record": "spectral_standard.py (Lane A, Python)",
        "purpose": "JS port parity (jev-spectral-math.js): same seeds must "
                   "reproduce walks node-identically; series counting tables "
                   "must match to 1e-12.",
        "pinned": {
            "step_ladder": S._walk_ladder(),
            "step_scale_k": S.STEP_SCALE_K,
            "n_walkers": S.WALKER_COUNT,
            "r2_gate": S.R2_GATE,
            "einstein_tol": S.EINSTEIN_TOL,
            "series_window": "[N/8, N/2] ranks, 8-point log lattice, "
                             "given-order running count",
            "gasket_construction": "merged (standard SG), V=(3^(n+1)+3)/2; "
                                   "SPEC 'level k' (3^k triangles) = this level k+1",
            "walk_gold_level": S.GASKET_WALK_LEVEL,
            "graph_walk_start_rule": "spread",
            "perm_seed": S.PERM_SEED,
        },
    }

    # PRNG truth: paste the node-generated vectors (independent of Python).
    pack["prng"] = {
        "mulberry32": {
            "0": [0.2664292086803687, 0.0003297456996142864, 0.2232720273919391,
                  0.14620214797556365, 0.46732782291024923],
            "1": [0.6270739406030609, 0.002735721224695444, 0.5274470399200916,
                  0.9810509675764516, 0.9683778982378095],
            "42": [0.6011037518959586, 0.4482905589975119, 0.8524657934345325,
                   0.6697340413769177, 0.17481389870159328],
            "12345": [0.9797282678286463, 0.3067522644907966, 0.4842054215613546,
                      0.817934412547945, 0.5094283693004023],
        },
        "note": "first 5 outputs per seed; JS must match to 1e-9 (bit-exact)",
    }

    # Gasket exact spectra + series fits
    g = {}
    for lv, key in ((4, "l4"), (5, "l5")):
        gr = S.sierpinski_gasket_graph(lv)
        ev = S.laplacian_eigenvalues(gr)
        f = S.series_fit(ev)
        g[key] = {
            "level": lv,
            "vertices": gr["n"],
            "edges": len(gr["edges"]),
            "eigenvalues": ev,
            "series": {"alpha_lambda": f["alpha_lambda"], "d_s": f["d_s"],
                       "r2": f["r2"], "ranks": f["table"]["ranks"],
                       "counting": [[p[0], p[1], p[2]] for p in f["table"]["points"]]},
        }
    perm = S.permutation_null(g["l5"]["eigenvalues"])
    fp = S.series_fit(perm)
    g["l5_permuted"] = {
        "seed": S.PERM_SEED,
        "shuffled_first_10": perm[:10],
        "alpha_lambda": fp["alpha_lambda"], "r2": fp["r2"],
        "collapsed": (abs(fp["alpha_lambda"] - g["l5"]["series"]["alpha_lambda"]) >= 0.5)
                      or (fp["r2"] < S.R2_GATE),
    }
    pack["gasket"] = g

    # Walk gold (merged L7, 64 walkers, spread starts, digest-derived seed)
    g7 = S.sierpinski_gasket_graph(S.GASKET_WALK_LEVEL)
    wout = S.measure_walk_graph(g7["edges"], g7["eu"])
    pack["walk_gold"] = {
        "graph": "gasket_l%d" % S.GASKET_WALK_LEVEL,
        "level": S.GASKET_WALK_LEVEL,
        "n_walkers": S.WALKER_COUNT,
        "start_rule": "spread",
        "base_seed": wout["meta"]["base_seed"],
        "ladder": wout["meta"]["ladder"],
        "msd": wout["meta"]["msd"],
        "return_counts": wout["meta"]["return_counts"],
        "alpha_msd": wout["alpha_msd"],
        "d_w": wout["d_w"],
        "d_w_r2": wout["d_w_r2"],
        "d_s": wout["d_s"],
        "d_s_r2": wout["d_s_r2"],
    }

    # Single walk replay fixture: PRNG seeded DIRECTLY with 42 (no digest
    # derivation) so the JS port can verify walk mechanics + gasket node
    # numbering without reimplementing the digest.
    rng = S.mulberry32(42)
    cur = 0
    steps = [0]
    adj = g7["adj"]
    for _ in range(256):
        d = len(adj[cur])
        if d == 0:
            steps.append(cur)
            continue
        cur = adj[cur][int(rng() * d)]
        steps.append(cur)
    flat_edges = []
    for (u, v) in g7["edges"]:
        flat_edges.append(u)
        flat_edges.append(v)
    pack["walk_seed42"] = {
        "graph": "gasket_l%d" % S.GASKET_WALK_LEVEL,
        "level": S.GASKET_WALK_LEVEL,
        "seed": 42,
        "start_node": 0,
        "n_steps": 256,
        "steps": steps,
        "edges_flat": flat_edges,
        "eu_formula": "eu = (a + b/2, b*sqrt(3)/2) on integer lattice coords",
    }

    # Lattice counting tables
    chain = S.build_1d_chain(64)
    evc = S.laplacian_eigenvalues(chain)
    fc = S.series_fit(evc)
    grid = S.build_2d_grid(8, 8)
    evg = S.laplacian_eigenvalues(grid)
    fg = S.series_fit(evg)
    pack["lattice_counting"] = {
        "chain_n": 64,
        "chain_eigenvalues": evc,
        "chain_alpha": fc["alpha_lambda"], "chain_d_s": fc["d_s"], "chain_r2": fc["r2"],
        "chain_counting": [[p[0], p[1], p[2]] for p in fc["table"]["points"]],
        "grid_w": 8, "grid_h": 8,
        "grid_eigenvalues": evg,
        "grid_alpha": fg["alpha_lambda"], "grid_d_s": fg["d_s"], "grid_r2": fg["r2"],
        "grid_counting": [[p[0], p[1], p[2]] for p in fg["table"]["points"]],
    }

    # Einstein chain path
    chain1200 = S.build_1d_chain(1200)
    wc = S.measure_walk_graph(chain1200["edges"], chain1200["eu"])
    ein = S.einstein_verdict(fc["d_s"], 1.0, wc["d_w"],
                             r2s={"d_s": fc["r2"], "d_w": wc["d_w_r2"]})
    pack["einstein_chain"] = {
        "D": 1.0,
        "d_s": ein["d_s"], "two_D_over_d_w": ein["two_D_over_d_w"],
        "delta": ein["delta"], "verdict": ein["verdict"],
        "d_w": wc["d_w"], "d_w_r2": wc["d_w_r2"],
    }

    out = os.path.join(HERE, "fixtures_spectral.json")
    with open(out, "w") as fh:
        json.dump(pack, fh, indent=1, sort_keys=True)
    print("wrote %s (%d bytes)" % (out, os.path.getsize(out)))


if __name__ == "__main__":
    main()
