#!/usr/bin/env python3
"""
collapse.py -- exchangeability-collapse compute module (deliverable D4).

Background
----------
The curve-compass +/- atom (papers/is-this-x-2026-08-12-Final.tex,
sec. "designed-counterpart") runs a Metropolis-Hastings chain on coverage
states c in {0,1}^d whose potential Phi(c) depends ONLY on the coverage
count k = sum(c) -- an *exchangeable* potential. Because the Metropolis
acceptance ratio for such a chain is a function of k alone, and because
there are exactly C(d, k) microstates sharing a given k, the true 2^d-state
chain collapses EXACTLY (not approximately) onto d+1 aggregated k-shells
with a closed-form equilibrium:

    pi_T(k)  ~  C(d, k) * exp(-Phi(k) / T)                for k = 0 .. d
    F_T(k)    =  Phi(k) - T * log C(d, k)                  (free energy)
    Z_T       =  sum_k C(d, k) * exp(-Phi(k) / T)          (partition fn)

This module implements that closed form plus two cross-checks:

  * brute_force_chain (d <= 9): builds the full 2^d x 2^d single-bit-flip Metropolis
    transition matrix P(x -> y) over the microstates, checks that the closed-form
    microstate law satisfies detailed balance pi(x)P(x,y) = pi(y)P(y,x) and
    stationarity pi P = pi, and solves for the stationary law of P from the kernel
    alone (no closed form used), aggregated by k. This is the check that can fail.
  * brute_force_pi (d <= 20): a multiplicity tally. It counts microstates per shell
    and applies the same Boltzmann weight, so it only verifies the binomial counts
    C(d,k); it does NOT test the collapse claim.

Numerical stability: all of pi_T / free_energy / partition are computed in
log-space with a log-sum-exp reduction, so they are stable even when Phi/T
is large and negative/positive.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from itertools import product
from math import comb, lgamma

import numpy as np


def _log_binom(d, k):
    return lgamma(d + 1) - lgamma(k + 1) - lgamma(d - k + 1)


def _log_binom_vec(d):
    return np.array([_log_binom(d, k) for k in range(d + 1)], dtype=np.float64)


def _logsumexp(x):
    m = np.max(x)
    if not np.isfinite(m):
        return -np.inf
    return float(m + np.log(np.sum(np.exp(x - m))))


def log_partition(phi, d, T):
    """log Z_T = logsumexp_k [ log C(d,k) - Phi(k)/T ]."""
    phi = np.asarray(phi, dtype=np.float64)
    if phi.shape[0] != d + 1:
        raise ValueError(f"phi must have length d+1={d + 1}, got {phi.shape[0]}")
    logw = _log_binom_vec(d) - phi / T
    return _logsumexp(logw)


def partition(phi, d, T):
    """log Z_T. Public entry point matching the module's documented API."""
    return log_partition(phi, d, T)


def pi_T(phi, d, T):
    """
    Exact closed-form equilibrium shell distribution.

    pi_T(k) = C(d,k) * exp(-Phi(k)/T) / Z_T,  k = 0..d

    Computed as exp(logw - logZ) (log-sum-exp stabilized) so it is exact
    to float64 precision regardless of how large |Phi(k)/T| gets.
    """
    phi = np.asarray(phi, dtype=np.float64)
    if phi.shape[0] != d + 1:
        raise ValueError(f"phi must have length d+1={d + 1}, got {phi.shape[0]}")
    logw = _log_binom_vec(d) - phi / T
    logZ = _logsumexp(logw)
    return np.exp(logw - logZ)


def free_energy(phi, d, T):
    """F_T(k) = Phi(k) - T * log C(d,k), for k = 0..d."""
    phi = np.asarray(phi, dtype=np.float64)
    if phi.shape[0] != d + 1:
        raise ValueError(f"phi must have length d+1={d + 1}, got {phi.shape[0]}")
    return phi - T * _log_binom_vec(d)


def crossover(phi, d, T_grid):
    """
    Find T_x, the temperature of the FIRST modal-shell transition: the lowest T
    in T_grid at which argmax_k pi_T(k) changes. For a monotone decreasing ladder
    with its minimum at k = d this is the switch k = d -> k = d-1, which has the
    closed form

        T_x = (Phi(d-1) - Phi(d)) / ln d          (see first_transition_T).

    It is NOT the switch to the entropy-dominated shell (argmax C(d,k), k = d//2):
    on the published d=9 compass ladder the modal shell only reaches k = 5 at
    T ~ 0.290, after further switches 8->7 (0.072), 7->6 (0.130) and 6->5 (0.290).
    `energy_shell` and `entropy_shell` in the result name argmin Phi and argmax C(d,k)
    for reference only; `argmax_below` / `argmax_above` are the shells this T_x separates.

    Method: scan T_grid (strictly increasing) for the first point where
    argmax_k pi_T(k) changes, then refine by bisection between the
    bracketing grid points using the same argmax-switch criterion.

    Returns a dict with T_x plus the shells on either side of it.
    """
    phi = np.asarray(phi, dtype=np.float64)
    T_grid = np.asarray(T_grid, dtype=np.float64)
    if T_grid.ndim != 1 or T_grid.size < 2:
        raise ValueError("T_grid must be a 1-D array with >= 2 points")
    if not np.all(np.diff(T_grid) > 0):
        raise ValueError("T_grid must be strictly increasing")

    argmaxes = np.array([int(np.argmax(pi_T(phi, d, T))) for T in T_grid])
    energy_shell = int(np.argmin(phi))
    entropy_shell = int(np.argmax(_log_binom_vec(d)))

    switch_idx = None
    for i in range(len(T_grid) - 1):
        if argmaxes[i] != argmaxes[i + 1]:
            switch_idx = i
            break

    if switch_idx is None:
        return {
            "T_x": None,
            "reason": "no argmax switch found in T_grid",
            "energy_shell": energy_shell,
            "entropy_shell": entropy_shell,
            "argmax_low": int(argmaxes[0]),
            "argmax_high": int(argmaxes[-1]),
        }

    lo, hi = T_grid[switch_idx], T_grid[switch_idx + 1]
    low_shell = argmaxes[switch_idx]

    def argmax_is_low_shell(T):
        return int(np.argmax(pi_T(phi, d, T))) == low_shell

    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if hi - lo < 1e-15 * max(1.0, mid):
            break
        if argmax_is_low_shell(mid):
            lo = mid
        else:
            hi = mid

    T_x = 0.5 * (lo + hi)
    return {
        "T_x": float(T_x),
        "argmax_below": int(low_shell),
        "argmax_above": int(argmaxes[switch_idx + 1]),
        "energy_shell": energy_shell,
        "entropy_shell": entropy_shell,
        "bracket": [float(T_grid[switch_idx]), float(T_grid[switch_idx + 1])],
    }


def first_transition_T(phi, d):
    """Closed form of the first modal transition k = d -> k = d-1 when Phi is minimal at k = d:
    pi_T(d) = pi_T(d-1)  <=>  exp(-Phi(d)/T) = d exp(-Phi(d-1)/T)  <=>  T = (Phi(d-1) - Phi(d)) / ln d."""
    phi = np.asarray(phi, dtype=np.float64)
    return float((phi[d - 1] - phi[d]) / np.log(d))


def brute_force_chain(phi, d, T, phi_micro=None):
    """Build the 2^d x 2^d single-bit-flip Metropolis kernel over the microstates (uniform proposal 1/d,
    accept min(1, exp(-dPhi/T))) and test the collapse claim against it. d <= 9.

    phi_micro: optional length-2^d microstate potential (default Phi(popcount(x))); a non-exchangeable one
    is used by the selftest as a negative control.

    Returns a dict with
      detailed_balance_residual   max |pi(x)P(x,y) - pi(y)P(y,x)| / max pi, pi = closed-form microstate law
      stationarity_residual       max |(pi P)(y) - pi(y)| / max pi
      power_iteration_residual    max |pi P^50 - pi| / max pi
      pi_k_from_kernel            stationary law solved from P ALONE (linear solve), aggregated by k
      max_abs_err                 max_k |pi_k_from_kernel - pi_T(k)| (closed form)
    """
    if d > 9:
        raise ValueError(f"brute_force_chain: d={d} > 9 (dense 2^d x 2^d kernel)")
    phi = np.asarray(phi, dtype=np.float64)
    if phi.shape[0] != d + 1:
        raise ValueError(f"phi must have length d+1={d + 1}, got {phi.shape[0]}")
    N = 1 << d
    idx = np.arange(N)
    k_of = np.array([bin(x).count("1") for x in range(N)])
    phi_x = phi[k_of] if phi_micro is None else np.asarray(phi_micro, dtype=np.float64)
    P = np.zeros((N, N))
    for b in range(d):
        y = idx ^ (1 << b)
        dphi = (phi_x[y] - phi_x) / T
        acc = np.exp(-np.maximum(dphi, 0.0))
        P[idx, y] += acc / d
    P[idx, idx] = 1.0 - P.sum(axis=1)
    if P.min() < -1e-15:
        raise RuntimeError("Metropolis kernel has a negative entry")

    # closed-form microstate law (Phi depends on k only)
    logw = -phi_x / T
    pi_x = np.exp(logw - _logsumexp(logw))
    flux = pi_x[:, None] * P
    scale = float(pi_x.max())
    db = float(np.max(np.abs(flux - flux.T))) / scale
    st = float(np.max(np.abs(pi_x @ P - pi_x))) / scale
    v = pi_x.copy()
    for _ in range(50):
        v = v @ P
    pw = float(np.max(np.abs(v - pi_x))) / scale

    # stationary law from the kernel alone via Grassmann-Taksar-Heyman (GTH)
    # subtraction-free Markov state elimination (machine-precision across all T):
    Q = P.copy()
    for n_idx in range(N - 1, 0, -1):
        s_n = float(np.sum(Q[n_idx, :n_idx]))
        if s_n > 0.0:
            Q[:n_idx, n_idx] /= s_n
            Q[:n_idx, :n_idx] += np.outer(Q[:n_idx, n_idx], Q[n_idx, :n_idx])
    pi_solved = np.zeros(N, dtype=np.float64)
    pi_solved[0] = 1.0
    for j_idx in range(1, N):
        pi_solved[j_idx] = float(np.dot(pi_solved[:j_idx], Q[:j_idx, j_idx]))
    pi_solved /= float(np.sum(pi_solved))
    pi_k = np.array([pi_solved[k_of == k].sum() for k in range(d + 1)])
    closed = pi_T(phi, d, T)
    return {
        "d": d, "T": float(T), "n_states": int(N),
        "detailed_balance_residual": db,
        "stationarity_residual": st,
        "power_iteration_residual": pw,
        "pi_k_from_kernel": pi_k,
        "max_abs_err": float(np.max(np.abs(pi_k - closed))),
    }


def brute_force_pi(phi, d, T):
    """
    Multiplicity tally: enumerate all 2^d coverage states c in {0,1}^d, count
    them per k-shell, weight each shell by exp(-Phi(k)/T) and normalise. This
    checks the binomial counts C(d,k) only; it applies the same Boltzmann weight as
    the closed form and builds no chain, so it is NOT evidence for the collapse.
    Use brute_force_chain (d <= 9) for that.

    Guarded to d <= 20 (2^20 = 1,048,576 states) to keep runtime bounded.
    For d <= 16 states are materialized bit by bit (true enumeration). For
    17 <= d <= 20 the per-shell multiplicity C(d,k) is used directly --
    mathematically identical to tallying materialized 2^d states by k
    (verified against materialized tallies for d <= 16 above), but avoids
    the Python-level cost of building > 10^5 tuples.
    """
    if d > 20:
        raise ValueError(f"brute_force_pi: d={d} > 20 guard (2^d states is too slow/large)")
    phi = np.asarray(phi, dtype=np.float64)
    if phi.shape[0] != d + 1:
        raise ValueError(f"phi must have length d+1={d + 1}, got {phi.shape[0]}")

    counts = np.zeros(d + 1, dtype=np.int64)
    if d <= 16:
        for bits in product((0, 1), repeat=d):
            counts[sum(bits)] += 1
    else:
        for k in range(d + 1):
            counts[k] = comb(d, k)

    logw = np.log(counts.astype(np.float64)) - phi / T
    logZ = _logsumexp(logw)
    return np.exp(logw - logZ)


def _rng_phi_ladder(d, seed):
    rng = np.random.default_rng(seed)
    steps = rng.uniform(0.02, 0.25, size=d)
    return np.concatenate([[2.0], 2.0 - np.cumsum(steps)])


def _load_measured_phi_ladder():
    """
    Load the measured Phi(k) ladder for d=9 from the in-repo paper bundle
    papers/is-this-x-2026-08-12-Final.zip, member
    is-this-x-2026-08-12/results/curve-compass-results.json, field
    phi_ladder.Phi (cross-referenced against
    is-this-x-2026-08-12/skills/curve-compass-skill/references/phi-ladder.md,
    whose "Phi(k)" column tabulates the identical values).

    Returns (phi, T_x_published, note) or (None, None, reason) if the file
    cannot be located, so callers can skip this check honestly instead of
    faking a result.
    """
    import glob
    import os
    import zipfile

    candidates = glob.glob(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "papers",
                      "is-this-x-2026-08-12-Final.zip")
    )
    candidates += glob.glob("papers/is-this-x-2026-08-12-Final.zip")
    if not any(os.path.exists(p) for p in candidates):
        # last resort only: a recursive walk of /var/workspace is minutes slow on a large tree
        candidates += glob.glob("/var/workspace/**/papers/is-this-x-2026-08-12-Final.zip", recursive=True)

    for path in candidates:
        if not os.path.exists(path):
            continue
        try:
            with zipfile.ZipFile(path) as z:
                member = "is-this-x-2026-08-12/results/curve-compass-results.json"
                if member not in z.namelist():
                    continue
                raw = z.read(member).decode("utf-8")
                data = json.loads(raw)
                phi = np.array(data["phi_ladder"]["Phi"], dtype=np.float64)
                T_x_published = float(data["crossover"]["T_x"])
                note = (
                    f"loaded from {path}!{member}, field phi_ladder.Phi "
                    f"(source note: {data['phi_ladder'].get('source', '')!r})"
                )
                return phi, T_x_published, note
        except Exception as e:
            return None, None, f"found {path} but failed to parse: {e}"

    return None, None, "papers/is-this-x-2026-08-12-Final.zip not found on this filesystem"


def selftest(verbose=True):
    report = {"correctness": [], "compass_reproduction": None, "benchmark": None, "ok": True}

    for d in (5, 9, 12):
        phi = _rng_phi_ladder(d, seed=1000 + d)
        for T in (0.05, 0.2, 1.0, 5.0):
            closed = pi_T(phi, d, T)
            brute = brute_force_pi(phi, d, T)
            max_abs_err = float(np.max(np.abs(closed - brute)))
            passed = max_abs_err < 1e-12
            report["correctness"].append({"d": d, "T": T, "max_abs_err": max_abs_err, "passed": passed})
            if verbose:
                status = "PASS" if passed else "FAIL"
                print(f"[{status}] correctness d={d} T={T}: max|closed-brute|={max_abs_err:.3e}")
            report["ok"] = report["ok"] and passed

    for d in (5, 9):
        phi = _rng_phi_ladder(d, seed=1000 + d)
        for T in (0.05, 0.2, 1.0, 5.0):
            ch = brute_force_chain(phi, d, T)
            passed = (ch["max_abs_err"] < 1e-9 and ch["detailed_balance_residual"] < 1e-12
                      and ch["stationarity_residual"] < 1e-12 and ch["power_iteration_residual"] < 1e-12)
            report["correctness"].append({"d": d, "T": T, "kind": "chain",
                                          "max_abs_err": ch["max_abs_err"],
                                          "detailed_balance_residual": ch["detailed_balance_residual"],
                                          "stationarity_residual": ch["stationarity_residual"],
                                          "passed": passed})
            if verbose:
                print(f"[{'PASS' if passed else 'FAIL'}] chain d={d} T={T}: stationary-vs-closed "
                      f"{ch['max_abs_err']:.3e}, detailed-balance {ch['detailed_balance_residual']:.1e}, "
                      f"pi P = pi {ch['stationarity_residual']:.1e}")
            report["ok"] = report["ok"] and passed

    # negative control: a NON-exchangeable potential must NOT collapse onto the closed form
    d = 5
    phi = _rng_phi_ladder(d, seed=1005)
    bump = np.array([0.5 * (x & 1) for x in range(1 << d)])
    ctrl = brute_force_chain(phi, d, 0.3, phi_micro=phi[[bin(x).count("1") for x in range(1 << d)]] + bump)
    passed = ctrl["max_abs_err"] > 1e-3
    report["correctness"].append({"d": d, "T": 0.3, "kind": "non-exchangeable-control",
                                  "max_abs_err": ctrl["max_abs_err"], "passed": passed})
    if verbose:
        print(f"[{'PASS' if passed else 'FAIL'}] non-exchangeable control must break the collapse: "
              f"{ctrl['max_abs_err']:.3e} (> 1e-3)")
    report["ok"] = report["ok"] and passed

    phi9, T_x_published, note = _load_measured_phi_ladder()
    if phi9 is None:
        report["compass_reproduction"] = {"skipped": True, "reason": note}
        if verbose:
            print(f"[SKIP] compass T_x reproduction: {note}")
    else:
        d = 9
        T_grid = np.geomspace(0.005, 2.0, 4001)
        result = crossover(phi9, d, T_grid)
        T_x_computed = result["T_x"]
        rel_err = abs(T_x_computed - T_x_published) / T_x_published
        T_x_closed = first_transition_T(phi9, d)
        rel_closed = abs(T_x_computed - T_x_closed) / T_x_closed
        passed = (rel_err < 1e-6 and rel_closed < 1e-9
                  and result["argmax_below"] == d and result["argmax_above"] == d - 1)
        report["compass_reproduction"] = {
            "T_x_closed_form": T_x_closed, "rel_err_vs_closed_form": rel_closed,
            "first_transition": [result["argmax_below"], result["argmax_above"]],
            "skipped": False,
            "phi_source": note,
            "T_x_computed": T_x_computed,
            "T_x_published": T_x_published,
            "rel_err": rel_err,
            "passed": passed,
        }
        if verbose:
            status = "PASS" if passed else "FAIL"
            print(f"[{status}] compass T_x reproduction (first modal transition "
                  f"{result['argmax_below']}->{result['argmax_above']}): computed={T_x_computed:.9f} "
                  f"closed form (Phi(8)-Phi(9))/ln 9={T_x_closed:.9f} published={T_x_published:.9f} "
                  f"rel_err={rel_err:.2e}")
        report["ok"] = report["ok"] and passed

    d = 16
    phi = _rng_phi_ladder(d, seed=42)
    T = 0.3

    t0 = time.perf_counter()
    _ = pi_T(phi, d, T)
    t_closed = time.perf_counter() - t0

    t0 = time.perf_counter()
    _ = brute_force_pi(phi, d, T)
    t_brute = time.perf_counter() - t0

    speedup = t_brute / t_closed if t_closed > 0 else float("inf")
    report["benchmark"] = {"d": d, "states": 2 ** d, "t_closed_s": t_closed, "t_brute_s": t_brute, "speedup": speedup}
    if verbose:
        print(f"[INFO] benchmark d={d} ({2 ** d} states): closed={t_closed * 1e3:.4f}ms "
              f"brute={t_brute * 1e3:.4f}ms speedup={speedup:.1f}x")

    return report


def _parse_T_grid(spec):
    lo_s, hi_s, n_s = spec.split(":")
    lo, hi, n = float(lo_s), float(hi_s), int(n_s)
    return np.geomspace(lo, hi, n)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Exchangeability-collapse compute module: exact k-shell "
                     "equilibrium for exchangeable-potential Metropolis chains."
    )
    parser.add_argument("--phi", type=str, help="Comma-separated Phi(k), k=0..d (length d+1).")
    parser.add_argument("--d", type=int, help="Dimension d (number of coordinates).")
    parser.add_argument("--T", type=float, help="Temperature for pi_T / free_energy / partition.")
    parser.add_argument("--T-grid", type=str, help="lo:hi:n, log-spaced, for --crossover.")
    parser.add_argument("--crossover", action="store_true", help="Compute T_x over --T-grid.")
    parser.add_argument("--verify", action="store_true", help="Cross-check pi_T against brute force at --T.")
    parser.add_argument("--benchmark", action="store_true", help="Time closed-form vs brute force for d=9..20.")
    parser.add_argument("--selftest", action="store_true", help="Run the module self-test suite.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON instead of text.")
    args = parser.parse_args(argv)

    out = {}
    verify_failed = False

    if args.selftest:
        out["selftest"] = selftest(verbose=not args.json)
        if args.json:
            print(json.dumps(out, indent=2))
        return 0 if out["selftest"]["ok"] else 1

    if args.benchmark:
        rows = []
        for d in range(9, 21):
            phi = _rng_phi_ladder(d, seed=d)
            T = 0.3
            t0 = time.perf_counter()
            pi_T(phi, d, T)
            t_closed = time.perf_counter() - t0
            t0 = time.perf_counter()
            brute_force_pi(phi, d, T)
            t_brute = time.perf_counter() - t0
            speedup = t_brute / t_closed if t_closed > 0 else float("inf")
            rows.append({"d": d, "states": 2 ** d, "t_closed_s": t_closed, "t_brute_s": t_brute, "speedup": speedup})
            if not args.json:
                print(f"d={d:2d} ({2 ** d:>7d} states): closed={t_closed * 1e3:8.4f}ms "
                      f"brute={t_brute * 1e3:9.4f}ms speedup={speedup:8.1f}x")
        out["benchmark"] = rows
        if args.json:
            print(json.dumps(out, indent=2))
        return 0

    if args.phi is None or args.d is None:
        parser.error("--phi and --d are required unless --selftest or --benchmark is given")

    phi = np.array([float(x) for x in args.phi.split(",")], dtype=np.float64)
    d = args.d
    if phi.shape[0] != d + 1:
        parser.error(f"--phi must have length d+1={d + 1}, got {phi.shape[0]}")

    if args.crossover:
        if args.T_grid is None:
            parser.error("--crossover requires --T-grid lo:hi:n")
        T_grid = _parse_T_grid(args.T_grid)
        result = crossover(phi, d, T_grid)
        out["crossover"] = result
        if not args.json:
            print(json.dumps(result, indent=2))

    if args.T is not None:
        pi = pi_T(phi, d, args.T)
        F = free_energy(phi, d, args.T)
        logZ = log_partition(phi, d, args.T)
        out["T"] = args.T
        out["pi_T"] = pi.tolist()
        out["free_energy"] = F.tolist()
        out["log_Z"] = logZ
        if not args.json:
            print(f"T={args.T}")
            print(f"log Z = {logZ:.6f}")
            for k in range(d + 1):
                print(f"  k={k:2d}  pi_T={pi[k]:.6e}  F_T={F[k]:+.6f}")

        if args.verify:
            if d > 20:
                print(f"[SKIP] --verify: d={d} > 20 brute-force guard", file=sys.stderr)
                out["verify"] = {"skipped": True, "reason": "d > 20"}
            else:
                brute = brute_force_pi(phi, d, args.T)
                tally_err = float(np.max(np.abs(pi - brute)))
                v = {"max_abs_err": tally_err, "popcount_tally_max_abs_err": tally_err}
                passed = tally_err < 1e-9
                if d <= 9:
                    ch = brute_force_chain(phi, d, args.T)
                    v["chain"] = {k_: (float(x) if not isinstance(x, (int, np.ndarray)) else x)
                                  for k_, x in ch.items() if k_ != "pi_k_from_kernel"}
                    v["chain"]["pi_k_from_kernel"] = ch["pi_k_from_kernel"].tolist()
                    v["max_abs_err"] = max(tally_err, ch["max_abs_err"])
                    passed = (passed and ch["max_abs_err"] < 1e-9 and ch["detailed_balance_residual"] < 1e-12
                              and ch["stationarity_residual"] < 1e-12)
                else:
                    v["chain"] = {"skipped": True, "reason": "d > 9: dense 2^d x 2^d kernel not built; "
                                  "only the popcount tally ran, which does not test the collapse"}
                v["passed"] = bool(passed)
                out["verify"] = v
                verify_failed = not passed
                if not args.json:
                    print(f"[{'PASS' if passed else 'FAIL'}] verify: popcount tally max|closed-brute| = {tally_err:.3e}")
                    if d <= 9:
                        print(f"       chain: stationary-from-kernel err {v['chain']['max_abs_err']:.3e}, "
                              f"detailed balance {v['chain']['detailed_balance_residual']:.1e}, "
                              f"pi P = pi {v['chain']['stationarity_residual']:.1e}")
                    else:
                        print(f"       chain check skipped ({v['chain']['reason']})")

    if args.json:
        print(json.dumps(out, indent=2))

    return 1 if verify_failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
