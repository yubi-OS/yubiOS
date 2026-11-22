# phonon-dispersion

The acoustic/optical phonon reading of the curved-corpus program, as a
deterministic instrument. Companion to
[`refs/acoustic-optical-phonons-bridge-2026-09-01.md`](../../refs/acoustic-optical-phonons-bridge-2026-09-01.md)
and Lean section 14 ([`papers/data/lean/CurvedCorpus.lean`](../../papers/data/lean/CurvedCorpus.lean)).
Pure stdlib, no numpy.

## What it checks (`--selftest`, wired into the `verify-tools` CI job)

1. **Diatomic chain anatomy** — the two-branch dispersion
   `ω²±(q) = C(1/m₁+1/m₂) ± C·√((1/m₁+1/m₂)² − 4sin²(qa/2)/(m₁m₂))`:
   acoustic branch exactly gapless at the zone center (the sum-rule zero mode),
   optical zone-center `√(2C(1/m₁+1/m₂))`, zone-boundary values `√(2C/m₁)`,
   `√(2C/m₂)`, gap open iff masses differ, equal-mass collapse onto the
   monatomic branch `2√(C/m)|sin(qa/2)|`.
2. **Klemens energy condition** — zone-center optical → two zone-boundary
   acoustic quanta allowed iff `m_heavy/m_light ≤ 3` (threshold exact; the
   Lean twin is `klemens_condition`).
3. **Acoustic sum rule, exactly** — the Hamming-graph H(d,2) Laplacian applied
   to every character `χ_r(a) = (−1)^{r·a}` gives `2·wt(r)·χ_r` in exact
   integer arithmetic (d = 4, all 16 characters). The zero mode is tested
   separately: `L·1 = 0`, the exact rational rank of `L` is `2^d − 1` (so 0 is a
   *simple* eigenvalue, d = 1..4), and only `wt(r) = 0` is annihilated — the
   discrete twin of the program's conserved `ℓ = 0` mode.
4. **Level-penalty comparison** — the S² eigenvalues `ℓ(ℓ+1)` are *measured* from
   the Legendre ODE (`d/dx[(1−x²)P_ℓ'] = −λP_ℓ`, central difference, ℓ = 1..8) rather
   than compared with their own definition; the Hamming ladder `2j` is read off the
   Q_9 characters; the quadratic rate `2ℓ(ℓ+1)` dominates the linear `2j` beyond the
   shared zero mode.
5. **Gaunt selection rules, three routes** — the S² momentum-conservation
   analogue (triangle `|ℓ₁−ℓ₂| ≤ ℓ₃ ≤ ℓ₁+ℓ₂` + even parity) verified by
   (a) direct enumeration at L = 3 (64 triads → 34 triangle → 23 allowed,
   41 forbidden — the structure is **not** vacuous at the program's
   truncation), (b) the exact Wigner `3j(ℓ₁ℓ₂ℓ₃;000)` zero pattern for all
   ℓ ≤ 5, (c) Simpson integration of `∫P_{ℓ₁}P_{ℓ₂}P_{ℓ₃}` for all ℓ ≤ 4.
6. **Fermi–Dirac/Binomial identity** — at linear `Φ(k) = εk` the compass
   stationary law `π_T(k) ∝ C(9,k)e^{−εk/T}` **is** `Binomial(9, p)` with the
   FD per-primitive occupancy `p = 1/(1+e^{ε/T})`, to machine precision
   (0 new parameters; the Bose–Einstein reading is excluded — see the refs doc).

## Real-corpus verification (`--input`)

```
python3 tools/phonon-dispersion/phonon.py --input papers/is-this-x-2026-08-12-Final.zip
```

Loads the real 2286 x 9 coverage matrix as points of the hypercube Q_9 and checks, exactly: the
empirical pairwise Hamming-distance histogram (direct popcount over all 5,225,796 ordered pairs) equals
the Walsh/Krawtchouk route `B_j = 2^-d Σ_r F(r)² K_j(wt r)` (exact integers); the column identity
`Σ_pairs d_H = Σ_c n1_c n0_c`; zero-distance pairs = collision structure (176 distinct vectors);
Walsh weight-1 coefficients = column means; Walsh Parseval; and the graph-Laplacian Rayleigh quotient of the
empirical density by two routes (edge sum vs `Σ 2 wt(r) |F(r)|²`; real corpus R = 8.2421, mean Hamming
distance 4.1972). Exits nonzero on any mismatch. (The CI step named "phonon-dispersion real-corpus
verification" runs `--selftest` only; call `--input` to touch corpus data.)

## Other modes

```
python3 tools/phonon-dispersion/phonon.py --dispersion 1.0 3.0   # branch table
python3 tools/phonon-dispersion/phonon.py --gaunt 3              # triad counts
python3 tools/phonon-dispersion/phonon.py --fd 0.5 0.05          # pi_T vs Binomial
```

## Discipline

Everything here is identity-side: closed-form algebra and exact spectra, no
corpus statistic, hence no curveball null needed. The one proposed
corpus-facing readout (the FD-residual "interaction beyond the ideal two-state
gas" on the measured Φ ladder) is **not** implemented here — it must first
pass its own curveball admission null, per the membership condition. Verdicts
and parameter accounting live in the refs bridge doc; designed-chain wall
applies to everything touching `π_T` or `T_×`.
