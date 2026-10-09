#!/usr/bin/env python3
"""harness_v3.py: one falsification harness for band v1, v2 and v3 (PREREG-v3 sections 4-7).

Independent of the modules for PRNG, corpora, coverage counting and negative controls.
A module is used only through ets_forecast(values, h). Output JSON uses sort_keys and fixed
indentation so that two runs are byte-comparable (DET clause).

Modes:
  validate   EVAL seeds. v1 and v2 must reproduce the recorded counts (PREREG-v3 section 4).
  calibrate  CAL seeds. v3 only. Writes the coverage curves, k and K (PREREG-v3 section 5).
  evaluate   EVAL seeds. v1, v2, v3 with frozen k and K from the calibration JSON.

  python3 harness_v3.py validate  OUT.json --v1 P1 --v2 P2
  python3 harness_v3.py calibrate OUT.json --v3 P3
  python3 harness_v3.py evaluate  OUT.json --v1 P1 --v2 P2 --v3 P3 --cal CAL.json
"""
import argparse
import hashlib
import importlib.util
import json
import math

PHI = 0.98
M32 = 0xFFFFFFFF
N_REP = 100
CORPORA = ["C0", "C1", "C2", "C3", "C4"]
FAMILY_OF = {"C1": "flat-noise", "C2": "linear-noise", "C3": "ramp", "C4": "spike"}
FIXTURE_NAMES = ["linear-noise", "flat-noise", "ramp", "spike"]
FAMILY_SEED = 20261008
EVAL_BASE = 20261008
CAL_BASE = 20271008
WIN_LO, WIN_HI = 88, 98
CAL_LOW_MAX = 85
CAL_HIGH_MIN = 99
K_GRID = [round(i * 0.05, 2) for i in range(1, 21)]
BIG_K_GRID = [round(1.0 + i * 0.05, 2) for i in range(0, 61)]
RECORDED = {
    "v1": {"C0": 84, "C1": 83, "C2": 80, "C3": 87, "C4": 80},
    "v2": {"C0": 99, "C1": 99, "C2": 98, "C3": 93, "C4": 99},
}


def mulberry32(seed):
    st = [seed & M32]

    def nxt():
        st[0] = (st[0] + 0x6D2B79F5) & M32
        s = st[0]
        t = ((s ^ (s >> 15)) * (1 | s)) & M32
        u = ((t ^ (t >> 7)) * (61 | t)) & M32
        t = t ^ ((t + u) & M32)
        return ((t ^ (t >> 14)) & M32) / 4294967296.0

    return nxt


def gauss(r):
    u1 = r()
    u2 = r()
    if u1 == 0.0:
        u1 = 2.3283064365386963e-10
    return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)


def family(name, seed, n):
    r = mulberry32(seed)
    out = []
    for i in range(n):
        if name == "linear-noise":
            out.append(2 + 0.37 * i + 0.5 * gauss(r))
        elif name == "flat-noise":
            out.append(10 + 0.5 * gauss(r))
        elif name == "ramp":
            out.append(0.05 * i * i + 0.5 * gauss(r))
        elif name == "spike":
            z = 0.5 * gauss(r)
            out.append(50 if i == 20 else 10 + z)
        else:
            raise ValueError(name)
    return out


def corpus_item(c, seed):
    if c == "C0":
        r = mulberry32(seed)
        hist = [0.5 * gauss(r) for _ in range(30)]
        return hist, 0.5 * gauss(r)
    s = family(FAMILY_OF[c], seed, 41)
    return s[:40], s[40]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sha256_file(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def replicate_table(mod, base):
    table = {}
    for c in CORPORA:
        rows = []
        for k in range(N_REP):
            hist, tgt = corpus_item(c, base + k)
            fc = mod.ets_forecast(hist, 1)
            rows.append((abs(tgt - fc["forecast"][0]), fc["band"][0]))
        table[c] = rows
    return table


def hits(rows, f):
    return sum(1 for e, b in rows if e <= f * b)


def mean_counts(table, f):
    per = {c: hits(table[c], f) for c in CORPORA}
    return per, sum(per.values()) / float(len(CORPORA))


def damped_sum(j):
    s = 0.0
    p = 1.0
    for _ in range(j):
        p = p * PHI
        s = s + p
    return s


def gate_g1(mod):
    y = [0.37 * (i + 1) for i in range(40)]
    r = mod.ets_forecast(y, 5)
    target = 0.37 * damped_sum(5)
    inc = r["forecast"][4] - r["level"]
    delta = inc - target
    return {"name": "G1", "pass": abs(delta) <= 0.1 * target,
            "increment": inc, "target": target, "delta": delta}


def g2_from_table(table):
    counts = {c: hits(table[c], 1.0) for c in CORPORA}
    passed = all(WIN_LO <= counts[c] <= WIN_HI for c in CORPORA)
    return {"name": "G2", "pass": passed, "counts": counts, "window": [WIN_LO, WIN_HI]}


def gate_g3(mod):
    y = family("linear-noise", FAMILY_SEED, 40)
    s1 = json.dumps(mod.ets_forecast(y, 5), sort_keys=True)
    s2 = json.dumps(mod.ets_forecast(y, 5), sort_keys=True)
    return {"name": "G3", "pass": (s1 == s2 and len(s1) > 0), "bytes": len(s1)}


def gate_g4(mod):
    r = mod.ets_forecast([1, 2, 3, 4, 5, 6, 7], 5)
    q = r.get("quality", {})
    ok = q.get("insufficient_series") is True and r.get("forecast") is None and r.get("band") is None
    return {"name": "G4", "pass": bool(ok)}


def gate_g5(mod):
    fixtures = {name: family(name, FAMILY_SEED, 40) for name in FIXTURE_NAMES}
    gens = getattr(mod, "FIXTURE_GENERATORS", None)
    outputs = {n: mod.ets_forecast(v, 5) for n, v in fixtures.items()}
    if gens is None:
        return {"name": "G5", "pass": None,
                "detail": "module exports no fixture generator; harness regeneration only",
                "js_parity": "NOT RUN", "outputs": outputs}
    max_delta = 0.0
    worst = ""
    length_ok = True
    for name in FIXTURE_NAMES:
        mine = fixtures[name]
        theirs = gens[name]()
        if len(mine) != len(theirs):
            length_ok = False
        for i, (a, b) in enumerate(zip(mine, theirs)):
            d = abs(a - b)
            if d > max_delta:
                max_delta = d
                worst = "%s[%d]" % (name, i)
    return {"name": "G5", "pass": (length_ok and max_delta <= 1e-9),
            "max_fixture_delta": max_delta, "worst": worst,
            "js_parity": "NOT RUN", "outputs": outputs}


def gate_g6(mod):
    r = mod.ets_forecast([7.5] * 20, 5)
    fc = r["forecast"]
    bd = r["band"]
    dev = max(abs(v - 7.5) for v in fc)
    mb = max(bd)
    nums = list(fc) + list(bd)
    for key in ["level", "trend", "residualSd", "holdoutR2", "bandSd"]:
        if r.get(key) is not None:
            nums.append(r[key])
    finite = all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in nums)
    return {"name": "G6", "pass": bool(finite and dev <= 1e-9 and mb <= 1e-6),
            "maxFcDev": dev, "maxBand": mb, "allFinite": finite}


def neg_low(table, k):
    if k is None:
        return {"name": "NEG_low", "pass": False, "detail": "k not constructible"}
    per, mean = mean_counts(table, k)
    return {"name": "NEG_low", "factor": k, "pass": mean < WIN_LO, "mean": mean, "counts": per}


def neg_high(table, K):
    if K is None:
        return {"name": "NEG_high", "pass": False, "detail": "K not constructible"}
    per, mean = mean_counts(table, K)
    return {"name": "NEG_high", "factor": K, "pass": mean > WIN_HI, "mean": mean, "counts": per}


def validate(p1, p2):
    out = {}
    for label, path in [("v1", p1), ("v2", p2)]:
        mod = load(path, label)
        table = replicate_table(mod, EVAL_BASE)
        counts = {c: hits(table[c], 1.0) for c in CORPORA}
        out[label] = {"sha256": sha256_file(path), "counts": counts,
                      "recorded": RECORDED[label], "reproduced": counts == RECORDED[label]}
    return out


def calibrate(v3, path):
    table = replicate_table(v3, CAL_BASE)
    low = {}
    for f in K_GRID:
        per, mean = mean_counts(table, f)
        low["%.2f" % f] = {"mean": mean, "counts": per}
    high = {}
    for f in BIG_K_GRID:
        per, mean = mean_counts(table, f)
        high["%.2f" % f] = {"mean": mean, "counts": per}
    lows = [f for f in K_GRID if low["%.2f" % f]["mean"] < CAL_LOW_MAX]
    highs = [f for f in BIG_K_GRID if high["%.2f" % f]["mean"] > CAL_HIGH_MIN]
    return {
        "mode": "calibrate",
        "module_sha256": sha256_file(path),
        "cal_seeds": [CAL_BASE, CAL_BASE + N_REP - 1],
        "rule": {
            "k": "largest grid value in 0.05..1.00 step 0.05 with calibration mean coverage < %d" % CAL_LOW_MAX,
            "K": "smallest grid value in 1.00..4.00 step 0.05 with calibration mean coverage > %d (A1)" % CAL_HIGH_MIN,
            "statistic": "mean of the five corpus coverages C0..C4 on CAL seeds",
        },
        "curve_low": low,
        "curve_high": high,
        "k": max(lows) if lows else None,
        "K": min(highs) if highs else None,
    }


def eval_version(label, path, frozen):
    mod = load(path, label)
    table = replicate_table(mod, EVAL_BASE)
    gates = {}
    for g in [gate_g1(mod), g2_from_table(table), gate_g3(mod), gate_g4(mod), gate_g5(mod), gate_g6(mod)]:
        gates[g["name"]] = g
    gates["NEG_low"] = neg_low(table, frozen["k"])
    gates["NEG_high"] = neg_high(table, frozen["K"])
    return {"module_sha256": sha256_file(path), "gates": gates}


def verdict_v3(v):
    g = v["gates"]
    cl_i = g["G2"]["pass"]
    cl_ii = all(g[x]["pass"] is True for x in ["G1", "G3", "G4", "G6"])
    cl_iii = g["G5"]["pass"] is True
    cl_iv = bool(g["NEG_low"]["pass"] and g["NEG_high"]["pass"])
    return {
        "i_G2_window_all_five_corpora": cl_i,
        "ii_G1_G3_G4_G6": cl_ii,
        "iii_G5_python_fixture_integrity": cl_iii,
        "iii_js_parity": "NOT RUN",
        "iv_NEG_low_and_NEG_high_detected": cl_iv,
        "v_DET": "external: compare two full runs byte-for-byte",
        "pass_clauses_i_to_iv": bool(cl_i and cl_ii and cl_iii and cl_iv),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["validate", "calibrate", "evaluate"])
    ap.add_argument("out")
    ap.add_argument("--v1")
    ap.add_argument("--v2")
    ap.add_argument("--v3")
    ap.add_argument("--cal")
    a = ap.parse_args()

    if a.mode == "validate":
        result = {"mode": "validate", "eval_seeds": [EVAL_BASE, EVAL_BASE + N_REP - 1],
                  "versions": validate(a.v1, a.v2)}
    elif a.mode == "calibrate":
        result = calibrate(load(a.v3, "v3"), a.v3)
    else:
        with open(a.cal, "r", encoding="ascii") as fh:
            cal = json.load(fh)
        frozen = {"k": cal["k"], "K": cal["K"]}
        versions = {}
        for label, path in [("v1", a.v1), ("v2", a.v2), ("v3", a.v3)]:
            versions[label] = eval_version(label, path, frozen)
        versions["v3"]["verdict"] = verdict_v3(versions["v3"])
        result = {"mode": "evaluate", "eval_seeds": [EVAL_BASE, EVAL_BASE + N_REP - 1],
                  "frozen": frozen, "cal_sha256_note": "k and K read from the calibration JSON",
                  "versions": versions}

    text = json.dumps(result, sort_keys=True, indent=1)
    with open(a.out, "w", encoding="ascii") as fh:
        fh.write(text + "\n")
    print("WROTE", a.out, len(text), "bytes")
    if a.mode == "calibrate":
        print("K_LOW k =", result["k"], "| K_HIGH K =", result["K"])
    elif a.mode == "validate":
        for label, rec in result["versions"].items():
            print("VALIDATE", label, rec["counts"], "reproduced=", rec["reproduced"])
    else:
        for label in ["v1", "v2", "v3"]:
            gs = result["versions"][label]["gates"]
            line = " ".join("%s=%s" % (n, gs[n]["pass"]) for n in ["G1", "G2", "G3", "G4", "G5", "G6", "NEG_low", "NEG_high"])
            print("EVAL", label, line)
        print("V3_VERDICT", result["versions"]["v3"]["verdict"])


if __name__ == "__main__":
    main()
