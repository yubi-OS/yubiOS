# tautology-discerner

A propositional, difference-bound-arithmetic and (real-domain) quantifier solver for statement classification. Zero planted sentence libraries, zero noun/synonym dictionaries, zero copula-verb bag-of-words heuristics. Every verdict is computed from the parsed formula:

1. **Parse** a statement $S$ into a compositional AST over `NOT`, `AND`, `OR`, `IMPLIES`, `IFF`, relational atoms and quantifiers.
2. **Count models**: a DPLL-style recursive split over the atoms (relational atoms first, every partial assignment pruned by exact feasibility, a formula already decided by Kleene evaluation counts all remaining propositional atoms at once) gives $|\Omega_{\text{feas}}|$, $|\Omega_{\text{sat}}|$, $|\Omega_{\text{fals}}|$ exactly, for any number of atoms.
3. **Classify** from $\rho = |\Omega_{\text{sat}}| / |\Omega_{\text{feas}}|$.

| verdict | model-space condition |
|---|---|
| `Tautology` | $\rho = 1$: true in every feasible world (also: a real-domain `exists` with a witness, a `forall` that is valid, a self-reference with the unique fixed point $v = \text{True}$). |
| `Paradox` | $\rho = 0$: no satisfying feasible world (also: a real-domain `forall` with a real counter-model, an `exists` with no witness, a self-reference with 0 fixed points). |
| `Falsifiable` | $0 < \rho < 1$ and $S$ commits to a relation, universal rule or multi-clause dependency; carries an explicit counter-model witness. |
| `Undecidable` | a single unanchored qualitative atom, a truth-teller ($v \leftrightarrow v$, 2 fixed points), or a search that exhausted its node budget (no verdict is claimed). |

## What is solved, exactly

### Difference-bound feasibility with exact strict inequalities (T-2)
Relational constraints `Term_u OP Term_v + c` are encoded as `x_u - x_v (<= | <) w` in a DBM and closed with Floyd-Warshall over the **lexicographic tropical semiring of `(weight, strict)` pairs**:

* `(w1, s1) (+) (w2, s2) = (w1 + w2, s1 or s2)`,
* `(w1, s1) < (w2, s2)  iff  w1 < w2 - 1e-15  or  (|w1 - w2| <= 1e-15 and s1 > s2)`,
* a negative cycle exists iff `dist[i][i].w < -1e-12`, or `|dist[i][i].w| <= 1e-12` and the cycle crosses a strict edge.

No epsilon is added to any weight, so `x > 0 and x < 1e-9` and `x > 1.9999999 and x < 2` are feasible while `x < y and y < x` is not. A numerical witness is built variable by variable at the **midpoint of the variable's tightest bounds** (one unit beyond the single finite bound, `0` if unbounded), pinned, and the closure refreshed - `0 < x < 1e-7` yields `x = 5e-08`, not `0.0`. `!=` is violated only when the closure forces equality.

### Linear arithmetic (T-1)
Both sides of a symbolic relation are parsed as exact rational affine expressions (`+ - * /`, parentheses, `3x`):

* constant-only relations evaluate arithmetically: `2 + 2 = 4`, `1 < 2` become the atom `0 == 0` (always true); `3 > 5`, `2 + 2 = 5` become `0 < 0` (always false);
* `x + c OP x + d` cancels algebraically: `x + 1 > x` becomes `0 == 0`, `x + 1 < x` becomes `0 < 0`;
* single-variable forms solve to `x OP k` (`2 * x = 6` is `x == 3`);
* `x - y OP c` is a difference bound (`RelConstraint(x, op, y, offset=c)`);
* any other linear form (`x + y > 3`) is kept as **one opaque term** keyed by its canonical coefficients. This is sound and complete for repeated uses of the same form, but not a full LP: `x + y > 3 and x < 1 and y < 1` is reported feasible.

### Quantifiers over the reals (T-1)
Explicit leading quantifiers whose body is purely relational and mentions only the bound variables are decided over $\mathbb R$:

* `There exists x such that P(x)` (also `exists`, `for some`, `∃`): `Tautology` ($\rho = 1$) iff `P` has a satisfying feasible world, else `Paradox` ($\rho = 0$);
* `For all x, P(x)`: `Tautology` iff `P` is valid; otherwise the DBM provides a real counter-model, so the universal claim is false (`Paradox`, $\rho = 0$) - `For all x, x > 5.` is `Paradox`, `For all x, if x > 5 then x > 2.` is `Tautology`.

Natural-language restricted universals (`Every node has latency_ms <= 5.`, `All swans are white.`) are empirical and stay `Falsifiable`.

### Self-reference as a fixed-point equation (T-6)
`This statement is ...`, `I am lying` and the two-sentence cycle are parsed into a boolean function $f(v)$ of the statement's own truth value (a closed vocabulary of truth predicates and `not/and/or/either/both/neither`), and the fixed points of $v \leftrightarrow f(v)$ over $\{\text{F}, \text{T}\}$ are enumerated: 0 fixed points $\to$ `Paradox` (`This statement is false.`), unique $v = \text{True}$ $\to$ `Tautology` (`This statement is either true or false.`), 2 fixed points $\to$ `Undecidable` (`This sentence is true.`).

### Other parsing fixes
* `It is not the case that A and B` negates the whole conjunction (T-7).
* `is above` / `is over` are `>`, `is below` / `is under` are `<` (T-8); the always-true relational guard is replaced by a real one (a numeric side, or two short symbolic terms) (T-12).
* More than 16 atoms no longer truncates or raises `KeyError`: `p0 or ... or p16 or not p0` is decided exactly (T-3). The search is bounded (`node_budget`, default 2,000,000 nodes); if it is exhausted the verdict is `Undecidable` with the reason, never a guess.

## Structural null & sensitivity check (`--null-check`, T-4/T-5)
`token_permutation_null` runs `n_draws` independent **random bijections** (a fresh shuffled injection into new symbol ids per draw; `n_distinct_renamings` reports how many distinct renamed formulas resulted, 10 of 10 for 10 draws) and checks that the satisfaction ratio is unchanged, then looks for a single structural mutation that changes $\rho$ - connective flip, relational-operator flip (`>` <-> `<`, `==` <-> `!=`), leaf negation, branch negation, whole negation - so `p or p`, `not (p or not p)` and `3 > 5` are all mutation-sensitive.

## `--audit-repo` (T-9)
`extract_lean_theorems` scans every `theorem`/`lemma` of `papers/data/lean/*.lean` (binders are skipped by bracket depth, the statement ends at `:=`), so `<=`, `≤`, `=` no longer defeat the extractor. From the repository root: 24 doc files, 1650 sentences; 8 Lean files, **240 theorems extracted**, 238 relational statements classified (Tautology 15, Falsifiable 146, Paradox 3, Undecidable 74). Doc sentences classify Falsifiable 964 / Undecidable 686.

## Usage
```bash
python3 tools/tautology-discerner/tautology_discerner.py --selftest            # 11 procedural gates F1..F11
python3 tools/tautology-discerner/tautology_discerner.py --classify "x + 1 > x"
python3 tools/tautology-discerner/tautology_discerner.py --classify "For all x, x > 5."
python3 tools/tautology-discerner/tautology_discerner.py --null-check "If x > 5 then x > 2."
python3 tools/tautology-discerner/tautology_discerner.py --audit-repo           # run from the repo root
```

## Verification
* `--selftest`: 11/11 procedural gates (propositional, DBM, paradox, falsifiable, undecidable, null checks, affine arithmetic, quantifiers, >16 atoms, narrow strict intervals, fixed-point self-reference), all generated from a seeded RNG.
* Independent held-out set (68 sentences written by the reviewer, `check_tautology_heldout.py`): **68/68** (was 56/68); probes P1-P5 pass (17-atom tautologies, narrow open intervals feasible, 10 distinct alpha-renamings, `p or p` mutation-sensitive, `above`/`over` = `>`).

## Known limits
Natural-language coverage is the grammar above, not a general parser. Non-difference linear forms are opaque terms (see above). Quantifiers nested inside other connectives are not interpreted over $\mathbb R$. The deployed worker's JS port (`jev-corpus-lens.js`) is not covered by this directory and must be ported separately.
