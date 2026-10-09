#!/usr/bin/env python3
"""forecast_ets.py: jev-timeseries forecast instrument v3.0.0, Python source of record.

Instrument: jev-forecast-math v3.0.0. Additive ETS: damped-trend Holt, NO seasonality.
The ONLY semantic change vs v2 is the initial trend: trend_0 = 0.0 instead of y_1 - y_0
(PREREG-v3 section 2, primary method (a)). The band estimator is unchanged:
bandSd = 1.4826 x median |one-step residual| over the TRAIN segment only
(t = 1 .. ho_start-1 under the selected (alpha, beta) recursion). The holdout that selects
(alpha, beta) never enters the band scale.
Pre-registration: skills/jev-timeseries/SPEC-TIMESERIES-v3-2026-10-09.md
  (branch prereg/forecast-v3-2026-10-09; PREREG content commit 29b00cbb306845e0db2af7d1316b8c92c2c6bb21).
v1 (tools/forecast-standard/forecast_ets.py) and v2 (tools/forecast-standard/v2/forecast_ets.py) are not modified.
Exact v2 -> v3 diff: tools/forecast-standard/v3/V2_TO_V3.diff.

python3 stdlib only. Operation order mirrors jev-forecast-math.js (JS parity NOT RUN in this lane).

CLI:
  python3 forecast_ets.py --selftest [--fixtures fixtures.json]
  python3 forecast_ets.py --run < {"values": [...], "h": int}
"""

import argparse
import json
import math
import os
import sys

INSTRUMENT_VERSION = "jev-forecast-math v3.0.0 (ets-damped-holt phi=0.98 grid19x19; trend0=0; band v3-mad-train-zerotrend)"
BAND_VERSION = "v3-mad-train-zerotrend"
# PREREG-v3 section 8 fallback: not calibrated until the v3 pass rule passes.
CALIBRATED = False
BAND_LABEL = ("1.96 x bandSd x sqrt(j); bandSd = 1.4826 x median train |one-step residual| (v3-mad-train-zerotrend, trend_0 = 0). "
              "PREREG-v3 FAILED clause (i). EVAL G2 coverage: C0 95, C1 93, C2 100, C3 94, C4 98 (gate 88-98). NOT CALIBRATED.")

PHI = 0.98
GRID = [k * 0.05 for k in range(1, 20)]

Z95 = 1.96
MAD_SCALE = 1.4826
DEGENERATE_SSE_TOL = 1e-12  # AMENDMENTS #4
LOW_R2_THRESHOLD = 0.5
MIN_SERIES = 8  # below this: insufficient_series
FAMILY_SEED = 20261008
G2_LO = 88  # percent, pre-registered (SPEC section 3), unchanged
G2_HI = 98
G2_CORPORA = ["C0", "C1", "C2", "C3", "C4"]
CORPUS_FAMILY = {"C1": "flat-noise", "C2": "linear-noise", "C3": "ramp", "C4": "spike"}
FIXTURE_NAMES = ["linear-noise", "flat-noise", "ramp", "spike"]
M32 = 0xFFFFFFFF


def mulberry32(seed):
    state = seed & M32

    def nxt():
        nonlocal state
        state = (state + 0x6D2B79F5) & M32
        t = ((state ^ (state >> 15)) * (1 | state)) & M32
        u = ((t ^ (t >> 7)) * (61 | t)) & M32
        t = ((t + u) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296.0

    return nxt


def _gauss(rnd):
    u1 = rnd()
    u2 = rnd()
    if u1 == 0.0:
        u1 = 2.3283064365386963e-10
    return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)


def _holdout_count(n):
    return max(2, math.floor(n * 0.2))


def _damped_sum(j):
    s = 0.0
    p = 1.0
    for _k in range(j):
        p = p * PHI
        s = s + p
    return s


def _grid_search(values):
    n = len(values)
    holdout_n = _holdout_count(n)
    ho_start = n - holdout_n
    best = None
    for alpha in GRID:
        for beta in GRID:
            level = values[0]
            trend = 0.0
            sse = 0.0
            for i in range(1, n):
                base = level + PHI * trend
                e = values[i] - base
                if i >= ho_start:
                    sse += e * e
                level_new = alpha * values[i] + (1 - alpha) * base
                trend_new = beta * (level_new - level) + (1 - beta) * PHI * trend
                level = level_new
                trend = trend_new
            if best is None or sse < best["sse"]:
                best = {"sse": sse, "alpha": alpha, "beta": beta, "level": level, "trend": trend}
    best["holdoutN"] = holdout_n
    return best


def _median(xs):
    s = sorted(xs)
    m = len(s)
    if m == 0:
        return 0.0
    if m % 2 == 1:
        return s[m // 2]
    return (s[m // 2 - 1] + s[m // 2]) / 2.0


def _train_abs_residuals(values, alpha, beta, ho_start):
    """|one-step residual| for t = 1 .. ho_start-1 under the selected (alpha, beta) recursion.
    Holdout residuals (t >= ho_start) are NOT included."""
    level = values[0]
    trend = 0.0
    out = []
    for i in range(1, ho_start):
        base = level + PHI * trend
        out.append(abs(values[i] - base))
        level_new = alpha * values[i] + (1 - alpha) * base
        trend_new = beta * (level_new - level) + (1 - beta) * PHI * trend
        level = level_new
        trend = trend_new
    return out


def ets_fit(values):
    """etsFit(values): holdout fields (v1 meaning, diagnostic) plus bandSd (v2 band scale)."""
    if not isinstance(values, list) or len(values) < 3:
        return None
    n = len(values)
    best = _grid_search(values)
    ho_start = n - best["holdoutN"]
    total = 0.0
    for i in range(ho_start, n):
        total += values[i]
    mean = total / best["holdoutN"]
    sst = 0.0
    for i in range(ho_start, n):
        d = values[i] - mean
        sst += d * d
    if sst > 0:
        r2 = 1 - best["sse"] / sst
    else:
        r2 = 1.0 if best["sse"] <= DEGENERATE_SSE_TOL else 0.0
    band_sd = MAD_SCALE * _median(_train_abs_residuals(values, best["alpha"], best["beta"], ho_start))
    return {
        "alpha": best["alpha"],
        "beta": best["beta"],
        "level": best["level"],
        "trend": best["trend"],
        "holdoutSse": best["sse"],
        "holdoutN": best["holdoutN"],
        "holdoutR2": r2,
        "residualSd": math.sqrt(best["sse"] / best["holdoutN"]),
        "bandSd": band_sd,
    }


def ets_forecast(values, h):
    """etsForecast(values, h). band[j-1] = 1.96 * bandSd * sqrt(j), j = 1..h.
    n < 8 -> insufficient_series shape, no fit."""
    if not isinstance(h, int) or isinstance(h, bool) or h < 1:
        raise ValueError("h must be an integer >= 1")
    n = len(values)
    if n < MIN_SERIES:
        return {
            "n": n,
            "level": None,
            "trend": None,
            "forecast": None,
            "band": None,
            "bandSd": None,
            "bandVersion": BAND_VERSION,
            "bandLabel": BAND_LABEL,
            "quality": {"insufficient_series": True, "low_r2": False, "flags": ["insufficient_series"], "calibrated": CALIBRATED},
        }
    fit = ets_fit(values)
    forecast = []
    band = []
    s = 0.0
    p = 1.0
    for j in range(1, h + 1):
        p = p * PHI
        s = s + p
        forecast.append(fit["level"] + fit["trend"] * s)
        band.append(Z95 * fit["bandSd"] * math.sqrt(j))
    low_r2 = fit["holdoutR2"] < LOW_R2_THRESHOLD
    flags = []
    if low_r2:
        flags.append("low_r2")
    return {
        "n": n,
        "level": fit["level"],
        "trend": fit["trend"],
        "forecast": forecast,
        "band": band,
        "alpha": fit["alpha"],
        "beta": fit["beta"],
        "holdoutSse": fit["holdoutSse"],
        "holdoutN": fit["holdoutN"],
        "holdoutR2": fit["holdoutR2"],
        "residualSd": fit["residualSd"],
        "bandSd": fit["bandSd"],
        "bandVersion": BAND_VERSION,
        "bandLabel": BAND_LABEL,
        "quality": {"insufficient_series": False, "low_r2": low_r2, "flags": flags, "calibrated": CALIBRATED},
    }


def family_series(name, seed, n):
    r = mulberry32(seed)
    out = []
    for i in range(n):
        if name == "linear-noise":
            out.append(2 + 0.37 * i + 0.5 * _gauss(r))
        elif name == "flat-noise":
            out.append(10 + 0.5 * _gauss(r))
        elif name == "ramp":
            out.append(0.05 * i * i + 0.5 * _gauss(r))
        elif name == "spike":
            z = 0.5 * _gauss(r)
            out.append(50 if i == 20 else 10 + z)
        else:
            raise ValueError("unknown family " + name)
    return out


FIXTURE_GENERATORS = {name: (lambda nm=name: family_series(nm, FAMILY_SEED, 40)) for name in FIXTURE_NAMES}


def g2_item(c, k):
    seed = FAMILY_SEED + k
    if c == "C0":
        r = mulberry32(seed)
        hist = [0.5 * _gauss(r) for _ in range(30)]
        return hist, 0.5 * _gauss(r)
    s = family_series(CORPUS_FAMILY[c], seed, 41)
    return s[:40], s[40]


def g2_hits(c, band_multiplier=1.0, band_kind="v2"):
    hits = 0
    for k in range(100):
        hist, tgt = g2_item(c, k)
        fc = ets_forecast(hist, 1)
        band = fc["band"][0] if band_kind == "v2" else Z95 * fc["residualSd"]
        if abs(tgt - fc["forecast"][0]) <= band * band_multiplier:
            hits += 1
    return hits


def ets_selftest(fixtures=None, band_multiplier=1.0, band_kind="v2"):
    """Falsification gates (PREREG-v3 sections 6-7; two-sided negative controls are in harness_v3.py). Returns [{name, pass, detail}].
    pass: True / False / None (None = not evaluated here)."""
    gates = []

    y = [0.37 * (i + 1) for i in range(40)]
    r = ets_forecast(y, 5)
    target = 0.37 * _damped_sum(5)
    increment = r["forecast"][4] - r["level"]
    delta = increment - target
    passed = abs(delta) <= 0.1 * target
    gates.append({
        "name": "G1",
        "pass": passed,
        "detail": "linear a=0.37 n=40 h=5 | increment=%r target=%r delta=%r band=+/-10%% | %s"
                  % (increment, target, delta, "PASS" if passed else "FAIL"),
    })

    hits = {c: g2_hits(c, band_multiplier, band_kind) for c in G2_CORPORA}
    in_band = {c: G2_LO <= hits[c] <= G2_HI for c in G2_CORPORA}
    passed = all(in_band.values())
    parts = ["%s=%d/100%s" % (c, hits[c], "" if in_band[c] else "(OUT)") for c in G2_CORPORA]
    gates.append({
        "name": "G2",
        "pass": passed,
        "detail": "band coverage C0..C4, 100 replicates each, band 1.96*bandSd*sqrt(j) | "
                  + " ".join(parts) + " | gate [88,98] each | " + ("PASS" if passed else "FAIL"),
    })

    y = family_series("linear-noise", FAMILY_SEED, 40)
    s1 = json.dumps(ets_forecast(y, 5), sort_keys=True)
    s2 = json.dumps(ets_forecast(y, 5), sort_keys=True)
    passed = s1 == s2 and len(s1) > 0
    gates.append({
        "name": "G3",
        "pass": passed,
        "detail": "two runs, same input | bytes %d identical=%s | %s" % (len(s1), s1 == s2, "PASS" if passed else "FAIL"),
    })

    r = ets_forecast([1, 2, 3, 4, 5, 6, 7], 5)
    passed = (r["quality"]["insufficient_series"] is True
              and r["forecast"] is None and r["band"] is None
              and r["level"] is None and r["trend"] is None
              and "insufficient_series" in r["quality"]["flags"]
              and r["quality"]["low_r2"] is False)
    gates.append({
        "name": "G4",
        "pass": passed,
        "detail": "n=7 | insufficient_series=%r | %s" % (r["quality"]["insufficient_series"], "PASS" if passed else "FAIL"),
    })

    if fixtures:
        max_delta = 0.0
        worst = ""
        ok = True
        for f in fixtures:
            gen = FIXTURE_GENERATORS.get(f["name"])
            if gen is None:
                ok = False
                worst = f["name"] + " (no pinned generator)"
                break
            expected = gen()
            for i in range(len(expected)):
                d = abs(expected[i] - f["values"][i])
                if d > max_delta:
                    max_delta = d
                    worst = "%s[%d]" % (f["name"], i)
        passed = ok and max_delta <= 1e-9
        gates.append({
            "name": "G5",
            "pass": passed,
            "detail": "fixture integrity: max regeneration |delta|=%r at %s | %s (JS-vs-Python parity is a separate check)"
                      % (max_delta, worst, "PASS" if passed else "FAIL"),
        })
    else:
        gates.append({
            "name": "G5",
            "pass": None,
            "detail": "fixtures not supplied; JS-vs-Python parity is checked separately",
        })

    y = [7.5] * 20
    r = ets_forecast(y, 5)
    nums = [r["level"], r["trend"], r["residualSd"], r["holdoutR2"], r["bandSd"]] + r["forecast"] + r["band"]
    all_finite = all(isinstance(x, float) and math.isfinite(x) for x in nums)
    max_fc_dev = max(abs(v - 7.5) for v in r["forecast"])
    max_band = max(r["band"])
    passed = all_finite and max_fc_dev <= 1e-9 and max_band <= 1e-6
    gates.append({
        "name": "G6",
        "pass": passed,
        "detail": "constant 20x7.5 h=5 | maxFcDev=%r maxBand=%r allFinite=%s | %s"
                  % (max_fc_dev, max_band, all_finite, "PASS" if passed else "FAIL"),
    })

    # Two-sided negative controls (NEG_low, NEG_high) live in harness_v3.py (PREREG-v3 section 5).
    return gates


def summarize_selftest(gates):
    failing = [g["name"] for g in gates if g["pass"] is False]
    unverified = [g["name"] for g in gates if g["pass"] is None]
    return {"ok": not failing, "failing_gates": failing, "unverified_gates": unverified}


def _load_fixtures(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)["fixtures"]


def main():
    ap = argparse.ArgumentParser(description="ETS v2 forecast instrument (source of record)")
    ap.add_argument("--selftest", action="store_true", help="run gates and print {summary, gates, fixtures}")
    ap.add_argument("--run", action="store_true", help="read {values, h} JSON on stdin, print etsForecast JSON")
    ap.add_argument("--fixtures", default=None, help="path to fixtures.json")
    args = ap.parse_args()

    if args.run:
        payload = json.load(sys.stdin)
        print(json.dumps(ets_forecast(payload["values"], payload["h"])))
        return 0

    if args.selftest:
        default_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures.json")
        path = args.fixtures or default_path
        fixtures = _load_fixtures(path) if os.path.exists(path) else None
        fixtures_out = {}
        if fixtures:
            for f in fixtures:
                fixtures_out[f["name"]] = ets_forecast(f["values"], f["h"])
        gates = ets_selftest(fixtures)
        print(json.dumps({"instrument": INSTRUMENT_VERSION, "summary": summarize_selftest(gates),
                          "gates": gates, "fixtures": fixtures_out}, indent=2))
        return 0

    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
