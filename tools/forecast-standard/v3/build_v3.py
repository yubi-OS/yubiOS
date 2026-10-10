#!/usr/bin/env python3
"""build_v3.py: derive v3 forecast_ets.py from the verbatim v2 source.

Applies exactly one semantic change (PREREG-v3 section 2, method (a): trend_0 = 0.0),
plus version labels, a v3 docstring, and removal of the v2 NEG_G2 gate (the two-sided
negative controls live in harness_v3.py). Every replacement asserts its match count.

usage: build_v3.py V2_SRC V2_COPY V3_OUT DIFF_OUT
"""
import difflib
import re
import shutil
import sys

V2_SRC, V2_COPY, V3_OUT, DIFF_OUT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

with open(V2_SRC, "rb") as fh:
    src = fh.read().decode("ascii")


def rep(s, old, new, count=1):
    n = s.count(old)
    if n != count:
        raise SystemExit("match count %d != %d for: %r" % (n, count, old[:70]))
    return s.replace(old, new)


def rx(s, pattern, new, count=1):
    s2, n = re.subn(pattern, lambda m: new, s, count=count, flags=re.S)
    if n != count:
        raise SystemExit("regex matches %d != %d for: %r" % (n, count, pattern[:70]))
    return s2


NEW_DOC = '''"""forecast_ets.py: jev-timeseries forecast instrument v3.0.0, Python source of record.

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
"""'''

s = src
s = rx(s, r'""".*?"""', NEW_DOC)
s = rep(s,
        'INSTRUMENT_VERSION = "jev-forecast-math v2.0.0 (ets-damped-holt phi=0.98 grid19x19; band v2-mad-train)"',
        'INSTRUMENT_VERSION = "jev-forecast-math v3.0.0 (ets-damped-holt phi=0.98 grid19x19; trend0=0; band v3-mad-train-zerotrend)"')
s = rep(s, 'BAND_VERSION = "v2-mad-train"', 'BAND_VERSION = "v3-mad-train-zerotrend"')
s = rep(s,
        '# PREREG-v2 section 9 fallback (v2 failed the pass rule): not calibrated, label carries measured coverage.',
        '# PREREG-v3 section 8 fallback: not calibrated until the v3 pass rule passes.')
s = rx(s, r'BAND_LABEL = \(.*?over-covers\."\)',
       'BAND_LABEL = ("1.96 x bandSd x sqrt(j); bandSd = 1.4826 x median train |one-step residual| (v3-mad-train-zerotrend, trend_0 = 0). "\n'
       '              "NOT CALIBRATED: PREREG-v3 pass rule not yet evaluated.")')
s = rep(s, 'trend = values[1] - values[0]', 'trend = 0.0', count=2)
s = rep(s, 'Falsification gates (PREREG-v2 sections 7-11)',
        'Falsification gates (PREREG-v3 sections 6-7; two-sided negative controls are in harness_v3.py)')
s = rx(s, r'    neg_hits = g2_hits\("C0", 0\.5\).*?    return gates',
       '    # Two-sided negative controls (NEG_low, NEG_high) live in harness_v3.py (PREREG-v3 section 5).\n    return gates')

if "trend = values[1]" in s:
    raise SystemExit("v2 initial trend still present")

with open(V3_OUT, "wb") as fh:
    fh.write(s.encode("ascii"))
shutil.copyfile(V2_SRC, V2_COPY)
diff = difflib.unified_diff(src.splitlines(keepends=True), s.splitlines(keepends=True),
                            "v2/forecast_ets.py", "v3/forecast_ets.py")
with open(DIFF_OUT, "w", encoding="ascii") as fh:
    fh.writelines(diff)
print("built", V3_OUT, len(s.encode("ascii")), "bytes")
