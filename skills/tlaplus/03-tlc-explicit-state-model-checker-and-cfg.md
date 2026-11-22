# 03. TLC Explicit-State Model Checker, .cfg Files, Symmetry & State-Space Reduction

TLC is the canonical explicit-state model checker for the TLA+ specification language. Distributed as part of the `tla2tools` Java archive, TLC operates by exhaustively exploring and validating the discrete state graph defined by a system specification. By generating reachable states, computing successor transitions, and evaluating predicates over concrete data models, TLC serves as the standard verification engine for distributed protocols, concurrent algorithms, and critical state machines.

---

## 1. TLC Engine Architecture

At its foundation, TLC operates as an explicit-state graph explorer over a Kripke structure:

* **Safety Invariant Verification via Breadth-First Search (BFS):** For state invariants and transition step checks, TLC initializes the search from the predicate defined in `INIT`. It places valid initial states into an on-disk or in-memory FIFO exploration queue. The worker threads systematically extract states and generate successors layer-by-layer. BFS ensures that when an invariant violation or safety bug occurs, TLC discovers the shortest possible counterexample trace from an initial state.
* **Liveness and Temporal Verification via Product Tableau:** Liveness properties expressed in Linear Temporal Logic (e.g., weak and strong fairness conditions `WF_vars(A)` / `SF_vars(A)`, or leads-to formulas `P ~> Q`) cannot be verified using standard reachability queues. TLC translates the negated temporal formula into a generalized Büchi automaton (a tableau) and computes the synchronous product of the state transition system with this tableau. The engine then detects accepting cycles (behaviors representing infinite counterexamples) using an on-the-fly nested depth-first search (DFS) algorithm, such as Tarjan's or the double-DFS strongly connected component (SCC) algorithm.
* **State Deduplication via 64-bit Fingerprint Sets (FPSet):** To determine whether a state has been previously visited without storing entire state records in RAM, TLC hashes canonical state representations into 64-bit fingerprints using irreducible polynomials. These fingerprints are indexed in an `FPSet` implementation (off-heap memory-mapped disk storage or memory-backed hash tables). The probability of a hash collision across $n$ distinct explored states is approximately $p \approx n^2 / 2^{65}$, providing negligible collision risk for state spaces under $10^9$ states.
* **Multi-Worker Execution Scaling:** The command line flag `-workers auto` (or `-workers N`) instructs TLC to spawn worker threads matching available CPU cores. Each worker dequeues states from the shared queue, computes enabled actions of the `NEXT` relation, hashes the resulting successors, queries the shared `FPSet`, and enqueues newly discovered states.

---

## 2. Complete `.cfg` Configuration Syntax

TLC decouples execution parameters, model constants, and verification targets from the mathematical TLA+ specification using configuration files (`.cfg`).

```tla
\* ==========================================
\* Specification Entry Points
\* ==========================================
\* Defines the full temporal specification: Spec == Init /\ [][Next]_vars /\ Fairness
SPECIFICATION Spec

\* Alternatively, specify state transition relations directly (cannot verify temporal properties):
\* INIT Init
\* NEXT Next

\* ==========================================
\* Invariant and Property Checks
\* ==========================================
\* State predicates evaluated at every reachable state:
INVARIANT
  TypeOK
  SafetyInvariant
  MutualExclusion

\* Temporal formulas evaluated over infinite execution traces:
PROPERTY
  LivenessFairness
  EventualDelivery

\* ==========================================
\* Constant Bindings & Model Values
\* ==========================================
CONSTANTS
  \* Model values: treated as uninterpreted, mutually distinct atomic symbols
  Nodes = {n1, n2, n3}
  ClientIDs = {c1, c2}
  \* Standard concrete values:
  MaxRetries = 3
  TimeoutMs = 5000
  \* Operator override: replace an operator definition with another
  DefaultVal <- AlternateVal

\* ==========================================
\* Symmetry Reductions
\* ==========================================
\* References an operator defined in the TLA+ module: Perms == Permutations(Nodes)
SYMMETRY Perms

\* ==========================================
\* State Space Pruning and Bounding
\* ==========================================
\* State predicate: exploration stops expanding beyond states where StateBound is FALSE
CONSTRAINT StateBound

\* Action predicate: transition steps violating ActionLim are pruned during successor generation
ACTION_CONSTRAINT ActionLim

\* ==========================================
\* State Projection & Inspection
\* ==========================================
\* Operator projecting concrete states to abstract states for fingerprinting
VIEW ModelView

\* Operator defining auxiliary diagnostic records attached to counterexample traces
ALIAS StateDebugger

\* ==========================================
\* Engine Behavioral Controls
\* ==========================================
\* Disable failure on terminal states when termination is expected:
CHECK_DEADLOCK FALSE
```

### Constraints vs. False Deadlocks
A `CONSTRAINT` prunes successor expansion whenever it evaluates to false. However, if all successor states of an otherwise valid state evaluate to false under `CONSTRAINT`, TLC observes zero enabled outgoing transitions. By default, TLC flags this as an unexpected deadlock and halts with an error trace. To avoid false positive deadlock alerts when deliberately truncating infinite counters, developers must configure `CHECK_DEADLOCK FALSE` or design constraints that cleanly transition into designated terminal self-loops.

---

## 3. Headless CLI Execution for CI Pipelines

In automated testing and CI/CD pipelines, TLC runs headlessly via the command line interface without requiring the graphical TLA+ Toolbox.

### Standard Invocation Pattern
```bash
java -XX:+UseParallelGC -Xmx16g -cp tla2tools.jar tlc2.TLC \
  -workers auto \
  -metadir /tmp/tlc_run_$$ \
  -deadlock \
  -dumpTrace json /tmp/tlc_trace.json \
  -config Consensus.cfg \
  Consensus.tla
```

### Critical CLI Flags
* `-metadir <dir>`: Sets the scratch directory for the state queue, checkpoint logs, and FPSet files, isolating concurrent executions on shared CI runners.
* `-deadlock`: Instructs TLC to halt with an error if it encounters a deadlock state (default behavior; disabled with `-deadlock` omitted when `CHECK_DEADLOCK FALSE` is configured, or explicitly with `-nodeadlock`).
* `-dumpTrace json <path>`: Emits full execution traces to a structured JSON file upon invariant or liveness failure, enabling automated CI log collectors to parse and visualize failure states.
* `-simulate num=10000 -depth 100`: Switches the engine from exhaustive BFS enumeration to Monte Carlo random walk simulation. TLC executes 10,000 independent traces up to depth 100, providing rapid defect detection in state spaces that are too massive for complete enumeration.
* `-checkpoint 60`: Emits periodic checkpoint snapshots every 60 minutes, enabling long-running verification jobs to resume after preemption.

### Exit Codes
TLC reports execution outcomes using standardized integer process exit codes:
* `0`: Success -- model checking completed exhaustively with no invariant or temporal violations, or simulation terminated without defect.
* `10`: Precondition failure -- semantic or syntactic error during parsing, semantic analysis (SANY), or `ASSUME` assertion failure.
* `11`: Deadlock detected -- an unexpected deadlock state was reached without outgoing transitions.
* `12`: Safety violation -- an `INVARIANT` predicate or `ACTION_CONSTRAINT` evaluated to false on a reachable state.
* `13`: Liveness violation -- an accepting cycle violating a temporal `PROPERTY` was detected in the product automaton.

---

## 4. Taming State-Space Explosion

Explicit-state model checking is fundamentally bounded by combinatorial explosion: the number of reachable states grows exponentially with the number of processes, queue sizes, and state variables. Four key strategies maintain tractability:

### 1. Bounding Model Constants
Scale collections of uncoordinated entities down to minimal non-trivial configurations. For example, consensus algorithms like Paxos or Raft expose all fundamental race conditions and edge cases with $|\text{Nodes}| = 3$, $|\text{Values}| = 2$, and maximum terms bounded to 3 or 4, whereas models with 5 or 7 nodes often expand by orders of magnitude without testing new behaviors.

### 2. Symmetry Reduction
When identical processes or node IDs operate without identity-dependent logic, declare them as symmetric model values:

```tla
CONSTANTS n1, n2, n3
Nodes == {n1, n2, n3}
Perms == Permutations(Nodes)
```

In `.cfg`, specify `SYMMETRY Perms`. TLC groups isomorphic states into equivalence classes, exploring only one representative state per permutation. For a model with $N$ symmetric processes, symmetry reduction can shrink the reachable state space by up to $N!$.

*Limitation:* In TLC, `SYMMETRY` cannot be combined with liveness checking (`PROPERTY`). Permutation folding can introduce artificial cycles in the state quotient graph, causing false positive liveness violations or masking true livelocks.

### 3. State `VIEW` Projection
When a specification includes auxiliary or diagnostic variables (e.g., an append-only message history used for logging) that do not influence future transition conditions, TLC can project state identity:

```tla
ModelView == <<nodesState, messagePool, currentTerm>>
```

Configuring `VIEW ModelView` instructs TLC to compute state fingerprints using only the selected sub-state tuple, collapsing states that differ only in untracked auxiliary variables.

### 4. Replacing Unbounded Sequences with Bounded Ring Counters
Append-only history logs (`history' = Append(history, msg)`) cause infinite state spaces. Replace unbounded sequences with bounded sliding windows, ring counters, or unordered multiset accumulations (`bag' = bag (+) SetToBag({msg})`) to keep state frontiers finite and compact.

---

## Sources

* https://github.com/tlaplus/tlaplus (jev weight: 0.9779)
* https://apalache-mc.org/docs/apalache/tlc-config.html (jev weight: 0.9528)
* https://docs.tlapl.us/using:tlc:config_file (jev weight: 0.9448)
* https://github.com/tlaplus/vscode-tlaplus/blob/master/resources/knowledgebase/tlc-config-files.md (jev weight: 0.9049)
* https://learning.tlapl.us/intro/tlc-config/ (jev weight: 0.8960)
* https://deepwiki.com/kingbootoshi/tla-precheck/10.2-performance-optimization (jev weight: 0.8466)
* https://deepwiki.com/tlaplus/tlaplus/2-tlc:-the-tla+-model-checker (jev weight: 0.7615)
* https://github.com/hwayne/tlacli (jev weight: 0.7612)
* https://sunhick.github.io/posts/tla-plus-perf-state-mgmt/ (jev weight: 0.6027)
