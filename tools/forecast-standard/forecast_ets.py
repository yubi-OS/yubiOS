#!/usr/bin/env python3
"""forecast_ets.py — jev-timeseries Lane A, Python source of record.

Instrument: jev-forecast-math v1.0.0 — additive ETS v1: damped-trend Holt, NO seasonality.
Pre-registration: session/subagent/lane-a-forecast/PREREGISTRATION.md (2026-10-08).
Amendments: session/subagent/lane-a-forecast/AMENDMENTS.md (pre-run only).

python3 stdlib only (no numpy). Operation order mirrors jev-forecast-math.js exactly
so JS and Python agree bit-for-bit on the fit path (G5 parity).

CLI:
  python3 forecast_ets.py --selftest [--fixtures fixtures.json]
      -> JSON {"gates": [...], "fixtures": {name: etsForecast result}}
  python3 forecast_ets.py --run  < fixture.json
      stdin JSON {"values": [...], "h": int} -> JSON etsForecast result
"""

import argparse
import json
import math
import os
import sys

INSTRUMENT_VERSION = "jev-forecast-math v1.0.0 (ets-damped-holt phi=0.98 grid19x19)"

PHI = 0.98
GRID = [k * 0.05 for k in range(1, 20)]

Z95 = 1.96
DEGENERATE_SSE_TOL = 1e-12  # AMENDMENTS #4
LOW_R2_THRESHOLD = 0.5
MIN_SERIES = 8  # below this: insufficient_series


# ---------------------------------------------------------------------------
# Pinned PRNG (PREREGISTRATION section 6): mulberry32 with every op masked to
# 32 bits — bit-identical to the JS Math.imul/bitwise form.
# ---------------------------------------------------------------------------
def mulberry32(seed):
    state = seed & 0xFFFFFFFF

    def nxt():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (1 | state)) & 0xFFFFFFFF
        u = ((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF
        t = ((t + u) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0

    return nxt


# Box-Muller, pinned form (PREREGISTRATION section 6). Two uniforms per draw, u1 first.
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


# Grid search over (alpha, beta), alpha outer ascending, beta inner ascending,
# accept strictly-lower SSE only (PREREGISTRATION section 4). State updates run
# through the FULL series; SSE scored only on holdout one-step errors (AMENDMENTS #3).
def _grid_search(values):
    n = len(values)
    holdout_n = _holdout_count(n)
    ho_start = n - holdout_n
    best = None
    for alpha in GRID:
        for beta in GRID:
            level = values[0]
            trend = values[1] - values[0]
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
                best = {"sse": sse, "alpha": alpha, "beta": beta,
                        "level": level, "trend": trend}
    best["holdoutN"] = holdout_n
    return best


def ets_fit(values):
    """etsFit(values) -> {alpha, beta, level, trend, holdoutSse, holdoutR2,
    residualSd, holdoutN}; None for n < 3."""
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
    return {
        "alpha": best["alpha"],
        "beta": best["beta"],
        "level": best["level"],
        "trend": best["trend"],
        "holdoutSse": best["sse"],
        "holdoutN": best["holdoutN"],
        "holdoutR2": r2,
        "residualSd": math.sqrt(best["sse"] / best["holdoutN"]),
    }


def ets_forecast(values, h):
    """etsForecast(values, h). band[j-1] = 1.96 * residualSd * sqrt(j), j = 1..h.
    n < 8 -> insufficient_series shape, no fit (PREREGISTRATION section 5 / AMENDMENTS #7)."""
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
            "quality": {
                "insufficient_series": True,
                "low_r2": False,
                "flags": ["insufficient_series"],
            },
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
        band.append(Z95 * fit["residualSd"] * math.sqrt(j))
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
        "quality": {"insufficient_series": False, "low_r2": low_r2, "flags": flags},
    }


# ---------------------------------------------------------------------------
# Pinned fixture generators (PREREGISTRATION section 7). Each fixture gets its
# OWN fresh mulberry32(20261008) stream. spike consumes its noise draw at i=20
# (drawn and discarded) so the stream stays aligned.
# ---------------------------------------------------------------------------
def _gen_linear_noise():
    r = mulberry32(20261008)
    return [2 + 0.37 * i + 0.5 * _gauss(r) for i in range(40)]


def _gen_flat_noise():
    r = mulberry32(20261008)
    return [10 + 0.5 * _gauss(r) for _i in range(40)]


def _gen_ramp():
    r = mulberry32(20261008)
    return [0.05 * i * i + 0.5 * _gauss(r) for i in range(40)]


def _gen_spike():
    r = mulberry32(20261008)
    out = []
    for i in range(40):
        z = 0.5 * _gauss(r)
        out.append(50 if i == 20 else 10 + z)
    return out


FIXTURE_GENERATORS = {
    "linear-noise": _gen_linear_noise,
    "flat-noise": _gen_flat_noise,
    "ramp": _gen_ramp,
    "spike": _gen_spike,
}


def ets_selftest(fixtures=None):
    """Falsification gates G1-G6 (PREREGISTRATION section 8) ->
    [{name, pass, detail}]. G5 cross-language parity lives in test-parity.mjs;
    here G5 is the fixture-corpus integrity check when fixtures are provided,
    else pass: None (AMENDMENTS #6)."""
    gates = []

    # G1 — trend recovery (increment form, AMENDMENTS #1)
    y = [0.37 * (i + 1) for i in range(40)]
    r = ets_forecast(y, 5)
    target = 0.37 * _damped_sum(5)
    increment = r["forecast"][4] - r["level"]
    delta = increment - target
    passed = abs(delta) <= 0.1 * target
    gates.append({
        "name": "G1",
        "pass": passed,
        "detail": ("linear a=0.37 n=40 h=5 | alpha=%r beta=%r fittedTrend=%r increment=%r "
                   "target=%r delta=%r band=+/-10%% (%r) | %s"
                   % (r["alpha"], r["beta"], r["trend"], increment, target, delta,
                      0.1 * target, "PASS" if passed else "FAIL")),
    })

    # G2 — band coverage (per-series seeds, AMENDMENTS #2)
    inside = 0
    for k in range(100):
        rnd = mulberry32(20261008 + k)
        ys = []
        for _i in range(30):
            ys.append(0.5 * _gauss(rnd))
        y_next = 0.5 * _gauss(rnd)
        fc = ets_forecast(ys, 1)
        if abs(y_next - fc["forecast"][0]) <= fc["band"][0]:
            inside += 1
    coverage = inside / 100.0
    passed = 0.88 <= coverage <= 0.98
    gates.append({
        "name": "G2",
        "pass": passed,
        "detail": ("100 noisy flat series sd=0.5 n=30 | hits=%d/100 coverage=%r "
                   "band=[0.88,0.98] | %s" % (inside, coverage, "PASS" if passed else "FAIL")),
    })

    # G3 — determinism (byte-identical JSON)
    y = FIXTURE_GENERATORS["linear-noise"]()
    s1 = json.dumps(ets_forecast(y, 5), sort_keys=True)
    s2 = json.dumps(ets_forecast(y, 5), sort_keys=True)
    passed = s1 == s2 and len(s1) > 0
    gates.append({
        "name": "G3",
        "pass": passed,
        "detail": ("two runs, same input | bytes %d identical=%s | %s"
                   % (len(s1), s1 == s2, "PASS" if passed else "FAIL")),
    })

    # G4 — insufficient series
    r = ets_forecast([1, 2, 3, 4, 5, 6, 7], 5)
    passed = (r["quality"]["insufficient_series"] is True
              and r["forecast"] is None
              and r["band"] is None
              and r["level"] is None
              and r["trend"] is None
              and "insufficient_series" in r["quality"]["flags"]
              and r["quality"]["low_r2"] is False)
    gates.append({
        "name": "G4",
        "pass": passed,
        "detail": ("n=7 | insufficient_series=%r forecast=%r band=%r flags=%s | %s"
                   % (r["quality"]["insufficient_series"], r["forecast"], r["band"],
                      json.dumps(r["quality"]["flags"]), "PASS" if passed else "FAIL")),
    })

    # G5 — fixture-corpus integrity here; cross-language parity in test-parity.mjs
    if fixtures:
        max_delta = 0.0
        worst = ""
        ok = True
        for f in fixtures:
            gen = FIXTURE_GENERATORS.get(f["name"])
            if gen is None:
                max_delta = float("inf")
                worst = f["name"] + " (no pinned generator)"
                ok = False
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
            "detail": ("fixture-corpus integrity: max regeneration |delta|=%r at %s; "
                       "cross-language parity (JS vs Python <=1e-9 on 4 fixtures) is executed "
                       "by test-parity.mjs | %s"
                       % (max_delta, worst, "PASS" if passed else "FAIL")),
        })
    else:
        gates.append({
            "name": "G5",
            "pass": None,
            "detail": ("not runnable in this environment; cross-language parity (JS vs Python "
                       "<=1e-9 on 4 fixtures) is executed by test-parity.mjs"),
        })

    # G6 — flat-series sanity
    y = [7.5] * 20
    r = ets_forecast(y, 5)
    nums = [r["level"], r["trend"], r["residualSd"], r["holdoutR2"]] + r["forecast"] + r["band"]
    all_finite = all(isinstance(x, float) and math.isfinite(x) for x in nums)
    max_fc_dev = max(abs(v - 7.5) for v in r["forecast"])
    max_band = max(r["band"])
    passed = all_finite and max_fc_dev <= 1e-9 and max_band <= 1e-6
    gates.append({
        "name": "G6",
        "pass": passed,
        "detail": ("constant 20x7.5 h=5 | maxFcDev=%r (<=1e-9) maxBand=%r (<=1e-6) "
                   "allFinite=%s | %s"
                   % (max_fc_dev, max_band, all_finite, "PASS" if passed else "FAIL")),
    })

    return gates


def _load_fixtures(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)["fixtures"]


def main():
    ap = argparse.ArgumentParser(description="ETS v1 forecast instrument (source of record)")
    ap.add_argument("--selftest", action="store_true",
                    help="run falsification gates G1-G6 and print {gates, fixtures}")
    ap.add_argument("--run", action="store_true",
                    help="read {values, h} JSON on stdin, print etsForecast JSON")
    ap.add_argument("--fixtures", default=None,
                    help="path to fixtures.json (default: alongside this script)")
    args = ap.parse_args()

    if args.run:
        payload = json.load(sys.stdin)
        print(json.dumps(ets_forecast(payload["values"], payload["h"])))
        return 0

    if args.selftest:
        default_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures.json")
        path = args.fixtures or default_path
        fixtures = None
        if os.path.exists(path):
            fixtures = _load_fixtures(path)
        fixtures_out = {}
        if fixtures:
            for f in fixtures:
                fixtures_out[f["name"]] = ets_forecast(f["values"], f["h"])
        print(json.dumps({"gates": ets_selftest(fixtures), "fixtures": fixtures_out}, indent=2))
        return 0

    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
