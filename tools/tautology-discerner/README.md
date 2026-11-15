# tautology-discerner

A propositional, quantificational, and difference-bound constraint solver for statement classification. Zero planted sentence libraries, zero hardcoded noun/synonym dictionaries, and zero copula-verb bag-of-words heuristics.

Given a formal or natural-language statement $S$, `tautology_discerner.py`:
1. Parses $S$ into a compositional Abstract Syntax Tree (AST) over propositional connectives (`NOT`, `AND`, `OR`, `IMPLIES`, `IFF`), universal quantifiers (`forall`, `every`, `any`, `no`), self-referential truth-value equations ($v \leftrightarrow \pm v$), and linear/order relational constraints ($x == y$, $x \neq y$, $x < y$, $x \le y$, $x > y$, $x \ge y$).
2. Evaluates all $2^k$ boolean truth assignments over the extracted atoms, pruning assignments whose relational literals violate arithmetic/order feasibility via exact Floyd-Warshall / Bellman-Ford difference-bound closure on $x_i - x_j \le c$.
3. Computes the feasible satisfaction ratio $\rho = |\Omega_{\text{sat}}| / |\Omega_{\text{feas}}|$ and returns:

| verdict     | model-space condition |
|-------------|-----------------------|
| `Tautology` | $|\Omega_{\text{feas}}| > 0$ and $|\Omega_{\text{sat}}| = |\Omega_{\text{feas}}|$ ($\rho = 1.0$). True in every feasible world; negation $\neg S$ has 0 feasible models. |
| `Falsifiable` | $0 < |\Omega_{\text{sat}}| < |\Omega_{\text{feas}}|$ ($0 < \rho < 1$) and $S$ commits to a relational/quantitative bound, universal rule, or multi-clause truth-functional dependency, producing an explicit counter-model witness $\alpha_{\text{false}} \in \Omega_{\text{feas}} \setminus \Omega_{\text{sat}}$. |
| `Paradox` | $|\Omega_{\text{sat}}| = 0$ ($\rho = 0.0$). Contradiction in the constraint graph or odd-parity self-referential negation ($v \leftrightarrow \neg v$) with 0 boolean fixed points. |
| `Undecidable` | Single uninterpreted qualitative clause with no relational, quantitative, universal, or truth-functional structure, or even-parity self-reference ($v \leftrightarrow v$) with 2 degenerate fixed points. |

## Quick start

```bash
./tautology_discerner.py --selftest
./tautology_discerner.py --classify "If a <= b and b <= c then a <= c."
./tautology_discerner.py --classify "The spectral dimension d_s equals 1.3652."
./tautology_discerner.py --classify "x > 10 and x < 3"
./tautology_discerner.py --classify "This statement is false."
./tautology_discerner.py --null-check "If x > 5 then x > 2."
./tautology_discerner.py --audit-repo
```

## Structural Null & Sensitivity Check (`--null-check`)

Instead of a bag-of-words token shuffle, `token_permutation_null` tests two algebraic properties of the parsed AST:
1. **`alpha_renaming_invariant`**: Uniformly renaming bound variables and predicate identifiers across random symbol bijections preserves the exact satisfaction ratio $\rho = |\Omega_{\text{sat}}| / |\Omega_{\text{feas}}|$ (graph isomorphism of the constraint AST).
2. **`operator_mutation_sensitive`**: Perturbing the top-level logical connective ($\lor \leftrightarrow \land$, $(A \to B) \leftrightarrow (A \land \neg B)$) or relational polarity strictly changes $\rho$, confirming that the classification is driven by syntactic and order-theoretic structure.
