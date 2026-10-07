# harness_adapter.py — caller-side surface adapter between Lane C's
# falsification harness and Lane A's spectral_standard.py.
#
# WHY THIS EXISTS (advisor integration, 2026-10-06):
#   The as-delivered harness run exits 4 (FM-12): Lane A exposes
#   measure_walk_mask / measure_walk_graph / series_fit / einstein_verdict,
#   while the harness discovers walk_mask / walk_graph / series / einstein and
#   passes (steps, walkers, seed) kwargs that Lane A's pinned pipeline does not
#   accept. Per the FM-12 rule the mismatch is fixed on the CALLER side only:
#   this adapter delegates EVERY number to Lane A's own functions and never
#   reimplements a measurement.
#
#   - All math (graph build, walks, MSD/return fits, counting fits, Einstein
#     gate) comes from spectral_standard (Lane A).
#   - The harness's pinned parameters are FORWARDED: walkers -> run_walks
#     (n_walkers), seed -> run_walks (base_seed, Lane C's canonical_json
#     sha256[:8] derivation, amended as the canonical walker seed — see
#     amendments-spectral-2026-10-06.md AM-4). steps is accepted and checked
#     against the module's pinned ladder (a mismatch raises; the ladder is
#     pinned, never caller-tunable).
#   - Start rule follows Lane A's pinned convention: 'first' for masks (the
#     SPEC row-major rule), 'spread' for explicit graphs (see Lane A
#     run_walks docstring; advisor amendment AM-2 confirms 'spread' for the
#     walk gold).
#   - Output keys are remapped to the harness's alias surface
#     (alpha_msd_r2 -> alpha_r2/msd_r2; series alpha_lambda -> alpha).
#   - coords=None on an explicit graph RAISES (Lane A contract; the route
#     contract passes coords for graph inputs). The harness's own gold rows
#     pass embeddings for chain (y=0 line) and patch (integer grid), whose
#     Euclidean and chemical distances coincide — metric-agnostic per
#     pre-registration §1.
#
# Version: spectral-standard-v1 (integration copy). No env access, no I/O.

import hashlib

import spectral_standard as _ss

_LADDER = _ss._walk_ladder()


def _check_steps(steps):
    if steps is not None and list(steps) != list(_LADDER):
        raise ValueError(
            "harness_adapter: steps must be the pinned ladder %r (got %r)"
            % (_LADDER, steps))


def _run(graph, walkers, seed, start_rule):
    if walkers is None:
        walkers = _ss.WALKER_COUNT
    walks = _ss.run_walks(graph, seed, n_walkers=walkers, start_rule=start_rule)
    m = _ss._walk_measurements(graph, walks)
    digest = _ss._graph_digest(graph)
    run_id = hashlib.sha256(
        ("%s|walk|%s" % (_ss.PIPELINE, digest)).encode("utf-8")).hexdigest()[:16]
    return {
        "mode": "walk",
        "d_w": m["d_w"],
        "d_w_r2": m["d_w_r2"],
        "d_w_low_confidence": m["d_w"] is None or m["d_w_r2"] < _ss.R2_GATE,
        "alpha_msd": m["alpha_msd"],
        "alpha_r2": m["alpha_msd_r2"],
        "msd_r2": m["alpha_msd_r2"],
        "alpha_msd_low_confidence": m["alpha_msd_r2"] < _ss.R2_GATE,
        "d_s": m["d_s"],
        "d_s_r2": m["d_s_r2"],
        "d_s_low_confidence": True if m["d_s"] is None else m["d_s_r2"] < _ss.R2_GATE,
        "d_s_points": m["d_s_points"],
        "log_periodic": {"present": False, "method": "residual-octave-alternation",
                         "applied": False},
        "run_id": run_id,
        "meta": {
            "pipeline": _ss.PIPELINE,
            "n_nodes": graph["n"],
            "n_edges": len(graph["edges"]),
            "n_walkers": walkers,
            "ladder": m["ladder"],
            "msd": m["msd"],
            "return_counts": m["return_counts"],
            "metric": "euclidean",
            "base_seed": seed,
            "start_rule": start_rule,
        },
    }


def walk_mask(mask, width=None, height=None, steps=None, walkers=None,
              seed=None, **kw):
    """Harness surface: Lane A graph_from_mask + run_walks + _walk_measurements."""
    _check_steps(steps)
    if seed is None:
        raise ValueError("harness_adapter.walk_mask: seed is required")
    graph = _ss.graph_from_mask(mask)
    return _run(graph, walkers, seed, start_rule="first")


def walk_graph(edges, coords=None, steps=None, walkers=None, seed=None,
               n_nodes=None, **kw):
    """Harness surface: Lane A graph_from_edges + run_walks + _walk_measurements."""
    _check_steps(steps)
    if seed is None:
        raise ValueError("harness_adapter.walk_graph: seed is required")
    if coords is None:
        raise ValueError(
            "harness_adapter.walk_graph: coords required (Lane A contract; "
            "the route passes coords for graph inputs)")
    graph = _ss.graph_from_edges([tuple(e) for e in edges],
                                 coords=[tuple(c) for c in coords],
                                 n_nodes=n_nodes)
    return _run(graph, walkers, seed, start_rule="spread")


def series(values, **kw):
    """Harness surface: Lane A series_fit with remapped keys."""
    fit = _ss.series_fit(values)
    tab = fit["table"]
    return {
        "mode": "series",
        "alpha": fit["alpha_lambda"],
        "counting_alpha": fit["alpha_lambda"],
        "alpha_r2": fit["r2"],
        "r2": fit["r2"],
        "d_s": fit["d_s"],
        "spectral_dimension": fit["d_s"],
        "d_s_r2": fit["r2"],
        "counting_table": [{"r": p[0], "value": p[1], "count": p[2]}
                           for p in tab["points"]],
        "monotone": tab["monotone"],
        "run_id": hashlib.sha256(
            ("%s|series|adapter" % _ss.PIPELINE).encode("utf-8")).hexdigest()[:16],
    }


def einstein(d_s=None, D=None, d_w=None, r2s=None, **kw):
    """Harness surface: Lane A einstein_verdict verbatim (kwargs match)."""
    return _ss.einstein_verdict(d_s, D, d_w, r2s=r2s)
