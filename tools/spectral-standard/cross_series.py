# cross_series.py - helper for test_parity_spectral.test.js (SP-2).
# Reads JSON on stdin: {"series": {id: [values]}, "permute": [{"id", "values", "seed"}]}
# and prints, from the Python source of record (spectral_standard.py):
#   {"fits": {id: {alpha_lambda, d_s, r2, points}}, "permuted": {id: [values]}}
# Permuted series are also fitted (under "fits" with the id given).
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import spectral_standard as S  # noqa: E402


def fit_row(values):
    f = S.series_fit(values)
    return {
        "alpha_lambda": f["alpha_lambda"],
        "d_s": f["d_s"],
        "r2": f["r2"],
        "points": [[p[0], p[1], p[2]] for p in f["table"]["points"]],
    }


def main():
    req = json.load(sys.stdin)
    out = {"fits": {}, "permuted": {}}
    for sid, vals in req.get("series", {}).items():
        out["fits"][sid] = fit_row(vals)
    for item in req.get("permute", []):
        perm = S.permutation_null(item["values"], seed=item["seed"])
        out["permuted"][item["id"]] = perm
        out["fits"][item["id"]] = fit_row(perm)
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
