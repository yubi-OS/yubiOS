# boltzmann-collapse

**Deliverable D4** -- the exchangeability-collapse compute module for the
curve-compass +/- atom described in
\`papers/is-this-x-2026-08-12-Final.tex\` (sec. "designed-counterpart").

## The identity, and why it is exact

The compass runs a Metropolis-Hastings chain on coverage states
\`c in {0,1}^d\`. Its potential \`Phi(c)\` depends **only** on the coverage
count \`k = sum(c)\` -- it is an *exchangeable* potential: any two states
with the same number of covered coordinates get the same potential,
regardless of *which* coordinates are covered.

That single fact is enough to collapse the chain exactly:

- The Metropolis acceptance ratio between two states depends only on the
  potential difference, so for an exchangeable potential it depends only
  on \`k\` and \`k'\`, never on which coordinates flipped.
- There are exactly \`C(d, k)\` microstates sharing a given \`k\`.
- Therefore the equilibrium (detailed-balance) distribution over the full
  \`2^d\`-state space is *itself* a function of \`k\` alone, and grouping
  states by \`k\` gives the exact aggregated law:

\`\`\`
pi_T(k)  =  C(d, k) * exp(-Phi(k) / T) / Z_T,      k = 0 .. d
Z_T       =  sum_k C(d, k) * exp(-Phi(k) / T)
F_T(k)    =  Phi(k) - T * log C(d, k)               (free energy per shell)
\`\`\`

This is not an approximation, a mean-field truncation, or a large-\`d\`
asymptotic -- it is an identity that follows from "the potential only sees
\`k\`", true for every \`d\` and every \`T\`. \`collapse.py\`'s \`--verify\` and
self-test **build the full \`2^d x 2^d\` single-bit-flip Metropolis kernel** for
\`d <= 9\` (\`brute_force_chain\`), check that the closed-form microstate law satisfies detailed balance
\`pi(x)P(x,y) = pi(y)P(y,x)\` and stationarity \`pi P = pi\`, and solve for the kernel's stationary
law with no closed form involved, aggregated by \`k\`; it agrees with \`pi_T\` to ~1e-15. A
non-exchangeable control potential must *fail* to collapse. \`brute_force_pi\` (all \`d <= 20\`) only
counts microstates per shell and applies the same Boltzmann weight: it checks the binomial
counts, not the collapse. \`--verify\` exits **1** when a check fails (it used to exit 0).

## The d+1-shell reduction

Because the chain collapses onto \`k\`-shells, a state space of size
\`2^d\` (exponential in \`d\`) reduces to a state space of size \`d + 1\`
(linear in \`d\`) for every equilibrium quantity: the stationary
distribution, the free energy, the partition function, and the location
of the energy/entropy crossover temperature \`T_x\`. For \`d = 20\` that is
1,048,576 states collapsing to 21 shells; the module's \`--benchmark\`
flag reports the resulting closed-form vs brute-force speedup at each
\`d\` from 9 to 20.

\`T_x\` is the **first modal-shell transition**: the lowest \`T\` at which
\`argmax_k pi_T(k)\` changes. On the published \`d = 9\` compass ladder that is the
switch \`k = 9 -> k = 8\`, with closed form
\`T_x = (Phi(8) - Phi(9)) / ln 9 = 0.0411428...\` (the published \`0.041143\`). It is **not**
the switch to the entropy-dominated shell \`k = d // 2\`: the modal shell only reaches
\`k = 5\` at \`T ~ 0.290\`, after further switches \`8 -> 7\` (0.072), \`7 -> 6\` (0.130) and
\`6 -> 5\` (0.290). \`crossover()\` returns the shells on either side (\`argmax_below\`,
\`argmax_above\`); \`first_transition_T(phi, d)\` is the closed form for the \`d -> d-1\` case.

## The T-is-a-designer-knob caveat

\`T\` in this module is **designed dynamics, not a corpus observable**.
The papers are explicit that the compass's temperature is a parameter
chosen by whoever runs the chain (to trade off exploration vs
convergence to the potential's minimum), not something measured from a
corpus or fit to data the way \`Phi(k)\` is. Do not treat \`T\` (or
\`T_x\`) as an empirical property of a corpus -- it is a property of the
sampler you chose to run over that corpus's \`Phi\` ladder. Reusing a
measured \`T_x\` (e.g. the \`d=9\` value below) across a different \`Phi\`
ladder or a different \`d\` is not meaningful; \`T_x\` is a joint property
of \`(Phi, d)\`, recomputed here via \`crossover()\`, not a universal
constant.

## Library API

\`\`\`python
from collapse import pi_T, free_energy, partition, crossover, brute_force_pi

pi_T(phi, d, T)          # -> np.ndarray[d+1], exact closed-form equilibrium
free_energy(phi, d, T)   # -> np.ndarray[d+1], F_T(k) = Phi(k) - T*log C(d,k)
partition(phi, d, T)     # -> float, log Z_T (log-sum-exp stabilized)
crossover(phi, d, T_grid) # -> dict with T_x, refined by bisection on T_grid
brute_force_pi(phi, d, T) # -> np.ndarray[d+1], ground truth via direct 2^d enumeration (d <= 20)
\`\`\`

All of \`pi_T\`, \`free_energy\`, and \`partition\` are computed via a
log-sum-exp reduction, so they stay numerically stable even when
\`Phi(k)/T\` is large.

## CLI usage

\`\`\`sh
# Evaluate pi_T and F_T at a given T, with a brute-force cross-check
python collapse.py --phi "2.0,1.9758,1.908,1.8091,1.6933,1.5727,1.4552,1.3454,1.2451,1.1547" \\
    --d 9 --T 0.0411 --verify

# Find the energy/entropy crossover temperature over a log-spaced grid
python collapse.py --phi "..." --d 9 --crossover --T-grid 0.005:2.0:2000

# Machine-readable output
python collapse.py --phi "..." --d 9 --T 1.0 --json

# Time closed-form vs brute-force enumeration for d = 9 .. 20
python collapse.py --benchmark

# Run the full self-test suite (correctness, compass T_x reproduction, benchmark)
python collapse.py --selftest
\`\`\`

## Self-test

\`python collapse.py --selftest\` runs three checks:

1. **Correctness.** For \`d in {5, 9, 12}\` with a random seeded \`Phi\`
   ladder, the closed-form \`pi_T\` equals the popcount tally to \`1e-12\`; for
   \`d in {5, 9}\` it additionally equals the stationary law of the real \`2^d\`-state
   Metropolis kernel (detailed balance and \`pi P = pi\` below \`1e-12\`), at
   \`T in {0.05, 0.2, 1.0, 5.0}\`; and a non-exchangeable potential must break the collapse.
2. **Compass reproduction.** The measured \`Phi(k)\` ladder for \`d = 9\`
   is loaded from the in-repo bundle
   \`papers/is-this-x-2026-08-12-Final.zip\`, member
   \`is-this-x-2026-08-12/results/curve-compass-results.json\`, field
   \`phi_ladder.Phi\` (cross-checked against the \`Phi(k)\` column of
   \`.../skills/curve-compass-skill/references/phi-ladder.md\`, which
   tabulates the identical ten values). \`crossover()\` is run over a
   4001-point log-spaced grid from \`T=0.005\` to \`T=2.0\`; the result is
   asserted within 1e-6 of the published \`T_x = 0.041143\`, within 1e-9 of the closed form
   \`(Phi(8)-Phi(9))/ln 9\`, and to be the \`9 -> 8\` transition. If the zip
   cannot be located on the filesystem this check is **skipped with an
   explicit warning**, not faked.
3. **Benchmark.** Closed-form vs brute-force timings are printed for
   \`d = 16\` (65,536 states).

## Limitations

- \`brute_force_pi\` is guarded to \`d <= 20\` (\`2^20\` states); beyond
  that, only the closed form is available (which is, of course, the
  point -- the closed form has no such ceiling).
- The exactness result depends entirely on \`Phi\` being a function of
  \`k\` alone. If a future potential depends on which coordinates are
  covered (not just how many), this collapse does **not** apply and the
  full \`2^d\`-state chain must be simulated.
- \`crossover()\`'s bisection assumes a single argmax switch in the
  supplied \`T_grid\`; a \`Phi\` ladder with multiple non-monotonic
  crossovers would need a finer grid or a different search strategy to
  find every switch point, not just the first.
