# 04. Apalache Symbolic Model Checker (Z3 SMT), Snowcat Type Checker & Inductive Invariants

Apalache is a symbolic model checker for TLA+ and PlusCal that translates state transition formulas into Satisfiability Modulo Theories (SMT) constraints solved by backend automated theorem provers such as Microsoft Z3 and CVC5. By encoding bounded and unbounded system executions into first-order logic formulas, Apalache overcomes the combinatorial limits of explicit-state model checking, verifying protocols over huge domains, large parameters, and symbolic state spaces.

---

## 1. Symbolic Model Checking vs. Explicit-State Enumeration

Explicit-state model checkers like TLC explore systems by materializing and evaluating individual states one by one. In contrast, Apalache performs symbolic analysis directly over logic representations:

* **Bounded Model Checking (BMC):** For an execution horizon of length $k$ (`--length=k`), Apalache constructs a first-order SMT formula encoding all possible execution paths of length $k$ starting from initial states. The verification problem is framed as satisfiability:
  $$\Phi_k = Init(s_0) \land \bigwedge_{i=0}^{k-1} Next(s_i, s_{i+1}) \land \bigvee_{i=0}^k \neg Invariant(s_i)$$
  If Z3 finds that $\Phi_k$ is satisfiable, the satisfying assignment corresponds directly to a concrete counterexample execution trace violating the invariant. If $\Phi_k$ is unsatisfiable, no execution of length $k$ or less can violate the invariant.
* **Large and Unbounded Value Domains:** TLC must explicitly iterate through every element of a set or integer range. When a specification involves 64-bit timestamps, cryptographic nonces, or unbounded integers ($x \in \mathbb{Z}$), TLC exhausts memory or halts on non-enumerable sets. Apalache represents these values as uninterpreted constants or linear arithmetic terms in Z3, checking correctness over the entire domain in fractions of a second.
* **Arbitrary Initial States:** When checking whether an invariant is preserved across transitions from an arbitrary state, Apalache does not require generating states from an explicit `Init` relation. It can treat the starting state as a completely symbolic valuation satisfying an invariant predicate.
* **Quantifier Instantiation and Theories:** Apalache translates high-level set-theoretic expressions (comprehensions, function updates, relations) into quantifier-free formulas with uninterpreted functions, arrays, and integer arithmetic theories, avoiding quantifier instantiation traps that typically stall general-purpose SMT provers.
* **Symbolic Branching Coverage:** Rather than traversing interleavings sequentially, the SMT solver searches through branch combinations symbolically, pruning vast subtrees simultaneously through conflict-driven clause learning (CDCL).

---

## 2. The Snowcat Static Type System

TLA+ is dynamically typed, rooted mathematically in Zermelo-Fraenkel set theory with the axiom of choice (ZFC). However, translation to SMT requires well-typed terms to determine appropriate background solver theories. Apalache incorporates Snowcat, a bidirectional type inference and checking system driven by inline `@type` annotations inside comments.

### Type Syntax Reference
* **Primitives:** `Int`, `Str`, `Bool`
* **Sets:** `Set(T)` (e.g., `Set(Int)`, `Set(Str)`)
* **Functions:** `T1 -> T2` (e.g., `Int -> Str`, `Set(Int) -> Bool`)
* **Tuples & Sequences:** `<<T1, T2>>`, `Seq(T)`
* **Records:** `[mode: Str, rev: Int, active: Bool]`
* **Variants (Tagged Unions):** `TAG(T1) | EMPTY(Unit)`
* **Type Aliases:** Custom named types defined via `@typeAlias: name = ...;`

### Annotated Specification Example
```tla
--------------------------- MODULE KeyValueStore ---------------------------
EXTENDS Integers, Sequences, FiniteSets

\* Define reusable type aliases for complex structures
\* @typeAlias: msg = [type: Str, key: Int, val: Str];
\* @typeAlias: state = [store: Int -> Str, inFlight: Set(msg)];

\* Constant definitions with explicit type signatures
\* @type: Set(Int);
CONSTANT Keys

\* @type: Set(Str);
CONSTANT Values

VARIABLES
    \* @type: Int -> Str;
    store,
    \* @type: Set([type: Str, key: Int, val: Str]);
    inFlight

\* Operator signature annotation
\* @type: [type: Str, key: Int, val: Str] -> Bool;
IsValidMsg(m) == m.key \in Keys /\ m.val \in Values

Init ==
    /\ store = [k \in Keys |-> ""]
    /\ inFlight = {}

\* Action transition annotation
\* @type: (Int, Str) -> Bool;
Put(k, v) ==
    /\ k \in Keys
    /\ v \in Values
    /\ inFlight' = inFlight \cup {[type |-> "PUT", key |-> k, val |-> v]}
    /\ UNCHANGED store

TypeOK ==
    /\ store \in [Keys -> Values \cup {""}]
    /\ inFlight \subseteq [type: {"PUT"}, key: Keys, val: Values]
=============================================================================
```

### Running Snowcat
Developers run the static type checker independently before model checking:
```bash
apalache-mc typecheck Spec.tla
```
Snowcat reports type mismatches, missing record fields, or polymorphic unification errors without executing the SMT solver, preventing subtle type defects early in development.

---

## 3. Bounded Checking and Inductive Invariant Verification

Apalache operates in two complementary verification paradigms: bounded model checking and unbounded mathematical induction.

### Bounded Symbolic Model Checking
To search for invariant violations across traces up to a fixed depth:
```bash
apalache-mc check --inv=SafetyInv --length=12 Spec.tla
```
Apalache unrolls the transition relation 12 steps and queries Z3. If a counterexample exists within 12 steps, it produces a trace in TLA+ and ITF (Informal Trace Format) JSON formats for interactive inspection and automated reproduction.

### Unbounded Inductive Invariant Verification
A safety invariant $Inv$ holds over all infinite reachable states if there exists an inductive invariant $IndInv$ that satisfies the fundamental induction principle:
1. **Base Case:** $Init \implies IndInv$
2. **Inductive Step:** $IndInv \land Next \implies IndInv'$
3. **Safety Implication:** $IndInv \implies Inv$

Apalache verifies inductive invariants across unbounded execution steps in two distinct CLI calls:

#### Step 1: Base Case Verification ($Init \implies IndInv$)
Verify that every initial state satisfies the candidate inductive invariant:
```bash
apalache-mc check --init=Init --inv=IndInv --length=0 Spec.tla
```
Setting `--length=0` instructs Apalache to evaluate only initial states. Z3 asserts $Init(s_0) \land \neg IndInv(s_0)$. If UNSAT, the base case holds.

#### Step 2: Inductive Step Verification ($IndInv \land Next \implies IndInv'$)
Verify that executing any enabled transition from any arbitrary state satisfying $IndInv$ leads to a state satisfying $IndInv'$:
```bash
apalache-mc check --init=IndInv --inv=IndInv --length=1 Spec.tla
```
Here, `--init=IndInv` designates the invariant as the state generator, and `--length=1` checks whether a single step preserves the invariant. If Z3 returns UNSAT, $IndInv$ is proven inductive for all reachable states, providing a fully automated proof without manual interactive proof steps.

#### Strengthening Inductive Invariants
If the inductive step fails, Apalache generates a single-step counterexample transition $s \to s'$ where $s \models IndInv$ but $s' \not\models IndInv$.
* If state $s$ is unreachable in reality, add a conjunct to $IndInv$ ruling out $s$.
* Repeat the check until the invariant becomes fully inductive across all transitions.

---

## 4. Side-by-Side Decision Matrix: TLC vs. Apalache

Choosing the appropriate verification engine depends on the structural properties of the specification:

| Feature / Dimension | TLC (Explicit-State Checker) | Apalache (Symbolic SMT Checker) |
| :--- | :--- | :--- |
| **Primary Underlying Engine** | Multi-threaded BFS / DFS state graph traversal | SMT solver translation (Microsoft Z3 / CVC5) |
| **State Space Cardinality** | Small to medium finite models ($10^6 - 10^9$ states) | Vast or infinite state spaces (integers, nonces) |
| **Trace Depth & Bounds** | Exhaustive to arbitrary depth within finite models | Bounded horizon ($k \le 20-50$ steps typical) |
| **Proof of Invariants** | Proof by complete finite state graph enumeration | Formal mathematical induction ($IndInv \land Next \implies IndInv'$) |
| **Temporal Liveness ($P \leadsto Q$)** | Full LTL support via product tableau and SCCs | Restricted / experimental (relies on bounded unrolling) |
| **Data Types & Arithmetic** | Concrete sets, small numbers, model values | 64-bit integers, linear/non-linear SMT arithmetic |
| **Type Discipline** | Untyped runtime evaluation; checks dynamically | Static typing enforced via Snowcat annotations |
| **Counterexample Generation** | Guaranteed shortest trace via BFS exploration | Satisfying SMT assignment at minimal bounded step |
| **Parameter Handling** | Constants must be instantiated with small sets | Constants can remain symbolic or large sets |
| **Execution Performance** | Fast initial state checks, scales with state count | SMT solving latency per step; scales with $k$ |

### Recommended Practical Workflow
1. Begin with **TLC** to validate basic protocol mechanics, test small concrete models, and check liveness properties.
2. Once safety invariants stabilize, add **Snowcat** `@type` annotations to enforce specification hygiene.
3. Finally, employ **Apalache** to check bounded safety with large parameters and establish unbounded inductive proofs.

---

## Sources

* https://apalache-mc.org/ (jev weight: 0.9694)
* https://github.com/apalache-mc/apalache/ (jev weight: 0.9817)
* https://link.springer.com/chapter/10.1007/978-3-032-32519-8_8 (jev weight: 0.9824)
* https://apalache-mc.org/docs/apalache/typechecker-snowcat.html (jev weight: 0.9825)
* https://apalache-mc.org/docs/apalache/index.html (jev weight: 0.9659)
* https://github.com/specula-org/tlaps-bench/blob/main/skills/tla-inductive-invariant-validation/SKILL.md (jev weight: 0.7730)
* https://apalache-mc.org/docs/apalache/running.html (jev weight: 0.9787)
* https://docs.tlapl.us/using:apalache:start (jev weight: 0.8671)
