#!/usr/bin/env python3
# corpus-sonometer -- a level meter for corpus effects, reported in dBc.
#
# Definition: the corpus level of an observed effect x against a null
# ensemble with mean mu and RMS fluctuation sigma is
#     L = 20 * log10(|x - mu| / sigma)   [dBc]
# referenced so 0 dBc == the vacuum's own RMS fluctuation -- the smallest
# detectable effect, the acoustician's 20 microPascal. The identity-side
# laws that make a level scale meaningful (levels add over cascaded
# gains, squaring doubles the level, readings are injective) are
# machine-checked in papers/data/lean/CurvedCorpus.lean section 12.
# This tool is the measurement instrument; verify_claims.py claim 8
# applies it to the real corpus matrix. Two different numbers circulate and
# they are NOT the same measurement:
#   * Claim 8 (papers/data/lean/verify_claims.py, 10 curveball draws) reads
#     +24.3 dBc with a 20N-trade null and +17.4 dBc with a 40N-trade null
#     (L(20N) = 24.29, L(40N) = 17.43).  A 10-draw null sd carries about
#     +/-3 dB Monte Carlo noise, which is why the two windows differ.
#   * 20*log10(12.13) = +21.68 dBc is just the published z = +12.13 of the
#     200-draw 20N auditor null (tools/corpus-auditor) written in dB; it is
#     not a claim-8 reading and not a reading of this tool.
# Every reading below is a Monte Carlo estimate: its standard error in dB is
# about 8.686 / sqrt(2 * (draws - 1)) (1.9 dB at 12 draws, 1.0 dB at 40).
#
# Usage: sonometer.py --selftest
#        sonometer.py --input PATH [--draws 40] [--window 20] [--seed S] [--json]
#                     (PATH = is-this-x zip, per_row_coverage JSON, or 0/1 CSV)
import argparse, json, math, sys, zipfile
import numpy as np


def level_db(delta, sigma):
    return 20.0 * math.log10(abs(delta) / sigma)


def v2_corr(M):
    X = np.asarray(M, float)
    sd = X.std(0)
    Xk = X[:, sd > 1e-12]
    C = np.corrcoef(Xk, rowvar=False)
    C = 0.5 * (C + C.T)
    ev = np.sort(np.linalg.eigvalsh(C))[::-1]
    return float((ev[0] + ev[1]) / ev.sum())


def curveball(M, n_trades, rng):
    M = M.copy()
    n = M.shape[0]
    for _ in range(n_trades):
        r1, r2 = rng.integers(0, n, 2)
        if r1 == r2:
            continue
        d1 = np.where((M[r1] == 1) & (M[r2] == 0))[0]
        d2 = np.where((M[r1] == 0) & (M[r2] == 1))[0]
        if len(d1) == 0 or len(d2) == 0:
            continue
        pool = np.concatenate([d1, d2])
        rng.shuffle(pool)
        M[r1, d1] = 0
        M[r2, d2] = 0
        M[r1, pool[:len(d1)]] = 1
        M[r2, pool[len(d1):]] = 1
    return M


def corpus_level(M, draws, window, rng):
    N = M.shape[0]
    vals = [v2_corr(curveball(M, window * N, rng)) for _ in range(draws)]
    mu = float(np.mean(vals))
    sd = float(np.std(vals, ddof=1))
    return level_db(v2_corr(M) - mu, sd), mu, sd


def selftest():
    oks = []
    def chk(name, cond, detail=''):
        print('%s %s %s' % (name, 'PASS' if cond else 'FAIL', detail), flush=True)
        oks.append(cond)
    # identity-side spot checks (float shadows of Lean sec. 12)
    chk('LEVEL_10SIGMA_IS_20DB', abs(level_db(10.0, 1.0) - 20.0) < 1e-12)
    chk('LEVEL_DOUBLE_IS_6DB', abs(level_db(2.0, 1.0) - 6.020599913279624) < 1e-9)
    a, b = 3.7, 11.9
    chk('CASCADE_LEVELS_ADD', abs(level_db(a * b, 1.0) - (level_db(a, 1.0) + level_db(b, 1.0))) < 1e-9)
    chk('SQUARE_DOUBLES_LEVEL', abs(level_db(a * a, 1.0) - 2 * level_db(a, 1.0)) < 1e-9)
    # measurement-side: quiet matrix vs planted effect
    rng = np.random.default_rng(20260824)
    n, d, k = 400, 9, 4
    M = np.zeros((n, d), dtype=np.int8)
    for i in range(n):
        M[i, (i + np.arange(k)) % d] = 1
    Mq = curveball(M, 20 * n, rng)
    Mp = Mq.copy()
    Mp[:, 1] = Mp[:, 0]
    Lq, muq, sdq = corpus_level(Mq, 12, 10, rng)
    Lp, mup, sdp = corpus_level(Mp, 12, 10, rng)
    chk('QUIET_MATRIX_BELOW_14DBC', Lq < 14.0, 'L=%.2f dBc (typical fibre draw vs own null)' % Lq)
    chk('PLANTED_EFFECT_ABOVE_6DBC', Lp > 6.0, 'L=%.2f dBc (duplicated column)' % Lp)
    # Mixing calibration: the null that corpus_level() builds (window=10 -> 10N trades) must agree with an
    # independent, much longer chain (40N trades, fresh seed) on the null mean to within 1.5 sd; an
    # under-mixed null stays near the planted matrix itself and sits many sd away. The planted level must
    # also stay near its calibrated value (a 0.1N null collapses it to ~11 dBc).
    ref = [v2_corr(curveball(Mp, 40 * n, np.random.default_rng(900 + i))) for i in range(12)]
    mu_ref, sd_ref = float(np.mean(ref)), float(np.std(ref, ddof=1))
    chk('NULL_MIXED_LIKE_40N_REFERENCE', abs(mup - mu_ref) < 1.5 * sd_ref and 0.5 * sd_ref < sdp < 2.0 * sd_ref,
        'null mean %.6f vs 40N reference %.6f (sd_ref %.6f, sd %.6f)' % (mup, mu_ref, sd_ref, sdp))
    chk('PLANTED_EFFECT_ABOVE_18DBC', Lp > 18.0, 'L=%.2f dBc; a 0.1N under-mixed null reads ~11 dBc' % Lp)
    chk('PLANTED_LEVEL_MATCHES_REFERENCE_NULL',
        abs(Lp - level_db(v2_corr(Mp) - mu_ref, sd_ref)) < 6.0,
        'L=%.2f dBc vs %.2f dBc against the 40N reference null' % (Lp, level_db(v2_corr(Mp) - mu_ref, sd_ref)))
    Mc = curveball(Mq, 500, rng)
    chk('MARGINS_PRESERVED', bool((Mc.sum(0) == Mq.sum(0)).all() and (Mc.sum(1) == Mq.sum(1)).all()))
    if all(oks):
        print('SONOMETER SELFTEST: ALL PASS')
        return 0
    print('SONOMETER SELFTEST: FAIL')
    return 1


def load_matrix(path):
    if path.endswith('.zip'):
        with zipfile.ZipFile(path) as z:
            j = json.load(z.open('is-this-x-2026-08-12/data/real/per_row_coverage_v3.json'))
        return np.array([r['covered'] for r in j['rows']], dtype=np.int8)
    if path.endswith('.json'):
        j = json.load(open(path))
        if isinstance(j, dict) and 'rows' in j:
            return np.array([r['covered'] for r in j['rows']], dtype=np.int8)
        return np.asarray(j, dtype=np.int8)
    return np.loadtxt(path, delimiter=',', dtype=np.int8)


def measure(M, draws, window, seed):
    rng = np.random.default_rng(seed)
    L, mu, sd = corpus_level(M, draws, window, rng)
    v2 = v2_corr(M)
    return {'n': int(M.shape[0]), 'd': int(M.shape[1]), 'v2_real': v2, 'null_mean': mu, 'null_sd': sd,
            'delta_v2': v2 - mu, 'z': (v2 - mu) / sd, 'level_dBc': L, 'draws': draws, 'window_N': window,
            'seed': seed, 'level_mc_se_dB': 8.685889638065035 / math.sqrt(2.0 * (draws - 1))}


def main():
    ap = argparse.ArgumentParser(description='corpus level meter (dBc)')
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--input', default=None, help='corpus zip / per_row_coverage JSON / 0-1 CSV to measure')
    ap.add_argument('--draws', type=int, default=40, help='curveball null draws (default 40)')
    ap.add_argument('--window', type=int, default=20, help='trades per draw in units of N (default 20)')
    ap.add_argument('--seed', type=int, default=20260822)
    ap.add_argument('--json', action='store_true')
    args = ap.parse_args()
    if args.selftest:
        sys.exit(selftest())
    if not args.input:
        ap.print_help()
        sys.exit(2)
    r = measure(load_matrix(args.input), args.draws, args.window, args.seed)
    if args.json:
        print(json.dumps(r, indent=2))
    else:
        print('V2 = %.10f   null %.6f +/- %.6f (%d draws, %dN trades)   z = %+.2f   L = %+.2f dBc (+/- %.1f dB MC)'
              % (r['v2_real'], r['null_mean'], r['null_sd'], r['draws'], r['window_N'], r['z'], r['level_dBc'],
                 r['level_mc_se_dB']))


if __name__ == '__main__':
    main()
