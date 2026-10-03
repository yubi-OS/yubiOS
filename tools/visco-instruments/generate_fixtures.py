#!/usr/bin/env python3
"""generate_fixtures.py -- freeze the visco instrument fixtures (Lane A).

Runs the functions in verify_visco.py (the Python SOURCE OF RECORD) over the
recorded round-3 replay anchors plus synthetic edge cases, and writes the
results to fixtures/visco-fixtures.json next to this file. The fixtures are
truth BECAUSE the source of record computed them: downstream JS ports are
parity-tested against this exact file, and any mismatch means the port is
wrong (SPEC-VISCO sec.2.3).

Recorded round-3 anchors (hard-coded here; research-db/creep-recovery-replay.json):
  - predicted per candidate: [11.50,10.84,10.44,10.10,10.12,10.07,10.34,10.17,10.14,9.79]
  - realized per cycle:      [0.16,0.01,0.44,-0.10,0.40,-0.07,-0.39,0.24,0.28,-0.32]
  - hysteresis total_sum_abs = 102.86 (tol 0.05), mean_per_cycle = 10.29
  - dBc trajectory (t = cycle 0..10): [-11.11,-10.95,-10.94,-10.50,-10.60,
    -10.20,-10.27,-10.66,-10.42,-10.14,-10.46]
  - snapback inversions at realized<0 (cycles 4,6,7,10 by 1-index); runs per
    snapback_detect's grouping rule: [[4],[6,7],[10]] -> length-2 run -> fires
  - persistence: 9/9 applied flips persisted (replay F4), delta_load +2.566,
    persist leg +3.22
"""

import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import verify_visco as vv  # noqa: E402

# ---------------------------------------------------------------------------
# recorded round-3 anchors
# ---------------------------------------------------------------------------

RECORDED_PREDICTED = [11.50, 10.84, 10.44, 10.10, 10.12, 10.07, 10.34, 10.17,
                      10.14, 9.79]
RECORDED_REALIZED = [0.16, 0.01, 0.44, -0.10, 0.40, -0.07, -0.39, 0.24, 0.28,
                     -0.32]
RECORDED_DBC_TRAJECTORY = [-11.11, -10.95, -10.94, -10.50, -10.60, -10.20,
                           -10.27, -10.66, -10.42, -10.14, -10.46]
RECORDED_DBC_BASE = -16.884    # M0 re-scored baseline (run cr_8d58079cba6bbd9f)
RECORDED_DBC_LOADED = -14.318  # M10 load leg, 9/10 documented flips applied
RECORDED_DBC_REGRADED = -13.664  # M_persist blind independent head-state scores


def _row_bits(row, ones_axes):
    bits = [0] * 12
    for a in ones_axes:
        bits[a] = 1
    return {str(row): bits}


ALL_ONES = {
    0: [0, 3, 7, 1],
    1: [2, 5, 11],
    2: [1, 6, 9],
}  # 9 applied cells: (0,0),(0,1),(0,3),(0,7),(1,2),(1,5),(1,11),(2,1),(2,6),(2,9)

APPLIED_9 = [[0, 0], [0, 1], [0, 3], [0, 7],
             [1, 2], [1, 5], [1, 11],
             [2, 1], [2, 6], [2, 9]]
# wait: that is 10 cells; the recorded load applied 9 of 10 documented flips.
# Keep exactly 9 to match the replay anchor:
APPLIED_9 = [[0, 0], [0, 3], [0, 7],
             [1, 2], [1, 5], [1, 11],
             [2, 1], [2, 6], [2, 9]]

PARTIAL_CREDIT_ROWS = {
    0: [0, 3, 7],        # all 3 of row 0 persist
    1: [2, 11],          # (1,5) NOT credited
    2: [1],              # (2,6),(2,9) NOT credited
}  # 6 of 9 persist


def _ones_rows(ones_by_row, extra=None):
    rows = {}
    for r in range(3):
        ones = list(ones_by_row.get(r, []))
        if extra and r in extra:
            ones += extra[r]
        bits = [0] * 12
        for a in ones:
            bits[a] = 1
        rows[str(r)] = bits
    return rows


def persistence_cases():
    all_rows = _ones_rows(ALL_ONES, extra={0: [1], 2: [4]})  # base-1 cells elsewhere
    cases = [
        {
            "name": "nine_flips_all_persist",
            "input": {
                "applied_cells": APPLIED_9,
                "regraded_passes": [
                    {"pass_id": "blind_head_state_rescore",
                     "bits_by_row": all_rows},
                ],
                "base_dbc": RECORDED_DBC_BASE,
                "loaded_dbc": RECORDED_DBC_LOADED,
                "regraded_dbcs": [RECORDED_DBC_REGRADED],
            },
        },
        {
            "name": "partial_persistence",
            "input": {
                "applied_cells": APPLIED_9,
                "regraded_passes": [
                    {"pass_id": "blind_rescore_partial",
                     "bits_by_row": _ones_rows(PARTIAL_CREDIT_ROWS,
                                               extra={0: [1], 2: [4]})},
                ],
                "base_dbc": RECORDED_DBC_BASE,
                "loaded_dbc": RECORDED_DBC_LOADED,
                "regraded_dbcs": [-15.20],
            },
        },
        {
            "name": "scorer_variance_two_pass",
            "input": {
                "applied_cells": APPLIED_9,
                "regraded_passes": [
                    {"pass_id": "pass_a", "bits_by_row": all_rows},
                    {"pass_id": "pass_b",
                     "bits_by_row": _ones_rows(ALL_ONES, extra={0: [1, 2],
                                                                2: [4]})},
                ],
                "base_dbc": RECORDED_DBC_BASE,
                "loaded_dbc": RECORDED_DBC_LOADED,
                "regraded_dbcs": [RECORDED_DBC_REGRADED, -12.10],
            },
        },
    ]
    return cases


def hysteresis_cases():
    recorded = {
        "name": "round3_recorded",
        "input": {"rows": [
            {"cycle": i + 1,
             "predicted_delta": RECORDED_PREDICTED[i],
             "realized_delta": RECORDED_REALIZED[i],
             "supersedes": None}
            for i in range(10)
        ]},
    }
    synthetic = {
        "name": "synthetic_two_loops",
        "input": {"rows": [
            {"id": "h1", "predicted_delta": 8.0, "realized_delta": 0.2,
             "supersedes": None},
            {"id": "h2", "predicted_delta": 7.0, "realized_delta": 0.1,
             "supersedes": "h1"},
            {"id": "h3", "predicted_delta": 5.0, "realized_delta": -0.3,
             "supersedes": None},
            {"id": "h4", "predicted_delta": 4.0, "realized_delta": 0.0,
             "supersedes": "h3"},
            {"id": "h5", "predicted_delta": 2.5, "realized_delta": 0.4,
             "supersedes": None},
        ]},
    }
    return [recorded, synthetic]


def prony_cases():
    recorded = {
        "name": "round3_recorded_trajectory",
        "input": {
            "series": [{"t": i, "value": v}
                       for i, v in enumerate(RECORDED_DBC_TRAJECTORY)],
            "arms": 2,
            "tau_grid": None,  # default grid
        },
    }
    # exact 2-arm synthetic: ke + 2.0*exp(-t/1.0) + 1.0*exp(-t/8.0)
    # NOTE: amplitudes are NONNEGATIVE by construction -- the contract clips
    # negative exponential amplitudes to 0 (relaxation strength is a
    # magnitude), so a fixture asserting exact recovery must be built inside
    # the representable set.
    ke, k1, t1, k2, t2 = -10.0, 2.0, 1.0, 1.0, 8.0
    series = []
    for t in range(11):
        v = ke + k1 * vv.math.exp(-t / t1) + k2 * vv.math.exp(-t / t2)
        series.append({"t": t, "value": v})
    synthetic = {
        "name": "synthetic_exact_2arm",
        "input": {
            "series": series,
            "arms": 2,
            "tau_grid": [0.5, 1.0, 2.0, 4.0, 8.0, 16.0],  # includes true taus
        },
    }
    return [recorded, synthetic]


def snapback_cases():
    recorded = {
        "name": "round3_recorded",
        "input": {"series": [
            {"cycle": i + 1,
             "predicted_delta": RECORDED_PREDICTED[i],
             "realized_delta": RECORDED_REALIZED[i]}
            for i in range(10)
        ]},
    }
    clean = {
        "name": "clean_single_inversion_no_snapback",
        "input": {"series": [
            {"cycle": 1, "predicted_delta": 1.2, "realized_delta": 0.4},
            {"cycle": 2, "predicted_delta": 1.0, "realized_delta": -0.05},
            {"cycle": 3, "predicted_delta": 0.9, "realized_delta": 0.3},
            {"cycle": 4, "predicted_delta": 1.1, "realized_delta": 0.0},
            {"cycle": 5, "predicted_delta": 1.0, "realized_delta": 0.5},
        ]},
    }
    return [recorded, clean]


def main():
    cases = {
        "persistence": persistence_cases(),
        "hysteresis": hysteresis_cases(),
        "prony": prony_cases(),
        "snapback": snapback_cases(),
    }
    # FREEZE: expected outputs are computed by the source of record itself.
    for kind, kind_cases in cases.items():
        for case in kind_cases:
            case["expected"] = vv._run_case(kind, case)

    fixture = {
        "version": 1,
        "generated": datetime.date.today().isoformat(),
        "source": "verify_visco.py (Python source of record, Lane A)",
        "sign_convention": "dBc improvement = MORE NEGATIVE; deltas recorded "
                           "as-is (realized +0.16 means dBc moved toward the null)",
        **cases,
    }
    out_dir = os.path.join(HERE, "fixtures")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "visco-fixtures.json")
    with open(out_path, "w") as f:
        json.dump(fixture, f, indent=2, sort_keys=False)
        f.write("\n")

    # sanity: the hysteresis anchor must reproduce before we freeze
    hys = next(c for c in cases["hysteresis"] if c["name"] == "round3_recorded")
    total = hys["expected"]["total_sum_abs"]
    mean = hys["expected"]["total_mean_per_cycle"]
    ok = abs(total - 102.86) <= 0.05 and abs(mean - 10.29) <= 0.01
    print("anchor 102.86: total_sum_abs=%.6f mean=%.6f -> %s"
          % (total, mean, "OK" if ok else "MISMATCH"))
    if not ok:
        raise SystemExit("hysteresis anchor failed; refusing to freeze fixtures")
    print("wrote %s (%d persistence, %d hysteresis, %d prony, %d snapback cases)"
          % (out_path, len(cases["persistence"]), len(cases["hysteresis"]),
             len(cases["prony"]), len(cases["snapback"])))


if __name__ == "__main__":
    main()