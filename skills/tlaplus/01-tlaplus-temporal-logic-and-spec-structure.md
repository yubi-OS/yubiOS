# 01. TLA+ Temporal Logic of Actions, State Machines & Spec Structure

## 1. Mathematical Foundation: Untyped Set Theory and Functions

TLA+ is grounded in first-order logic with untyped Zermelo-Fraenkel set theory (ZF) augmented with the Axiom of Choice. In TLA+, every value is mathematically a set: numbers, records, tuples, functions, and booleans are all first-class mathematical entities evaluated without static type checking.

### Core Set Operations
* **Subsets and Power Sets**: `SUBSET S` denotes the power set of `S` (the set of all subsets of `S`).
* **Generalized Union**: `UNION S` represents the union of all elements of `S` (where each element of `S` is itself a set).
* **Set Comprehension (Filtering)**: `{x \in S : P(x)}` defines the subset of elements in `S` satisfying predicate `P`.
* **Set Mapping**: `{e(x) : x \in S}` builds the image of set `S` under expression `e`.
* **Bounded Quantification**: `\A x \in S : P(x)` (universal) and `\E x \in S : P(x)` (existential).
* **Hilbert's Epsilon Choice**: `CHOOSE x \in S : P(x)` denotes an arbitrary, deterministically chosen element `x` in `S` satisfying predicate `P(x)`. If no such element exists, the expression is syntactically well-formed but denotes an unspecified value.

### Functions, Records, and Tuples
In TLA+, functions are first-class mathematical objects mapping a domain set to values:
* **Function Set**: `[S -> T]` is the set of all functions with domain `S` and codomain `T`.
* **Function Definition**: `f == [x \in S |-> e(x)]`.
* **Function Application**: `f[arg]`. The domain is queried via `DOMAIN f`.
* **Functional Override (`EXCEPT`)**: `[f EXCEPT ![k] = v]` denotes a new function identical to `f` except at key `k`, where its value is `v`. Nested overrides use path syntax: `[f EXCEPT ![k].sub = v]`.
* **Records as Functions**: A record `[a |-> 1, b |-> 2]` is syntactic sugar for a finite function whose domain is the set of string field names `{"a", "b"}`. Record sets are written as `[a : Int, b : BOOLEAN]`.
* **Tuples and Sequences**: A tuple `<<a, b, c>>` is syntactic sugar for a function with domain `1..3`. The standard module `Sequences` defines operators such as `Append(seq, val)`, `Head(seq)`, `Tail(seq)`, `Len(seq)`, and concatenation `seq1 \o seq2`.

---

## 2. State Predicates, Actions, and Stuttering Invariance

The execution of a system in TLA+ is modeled as an infinite sequence of states $\sigma = s_0 \xrightarrow{\alpha_1} s_1 \xrightarrow{\alpha_2} s_2 \dots$, where a state $s$ is an assignment of values to state variables.

### State Predicates vs. Action Formulas
* **State Predicate**: A formula containing only unprimed state variables (e.g., `x > 0 /\ queue # <<>>`). It evaluates to a boolean in a single state.
* **Action Formula**: A formula containing both unprimed variables (denoting their values in the current state $s$) and primed variables (denoting their values in the successor state $t$). An action $A$ represents a transition relation evaluated over pairs of states $(s, t)$.
  * Example: `x' = x + 1 /\ y' = y`.
* **Unchanged Clause**: `UNCHANGED <<x, y>>` is an abbreviation for `x' = x /\ y' = y`. In TLA+, an action must explicitly constrain every declared state variable; any unprimed variable without a corresponding primed constraint is free to take any value in the next state.
* **Action Enabledness**: `ENABLED A` is a state predicate that holds in state $s$ if and only if there exists some successor state $t$ such that the pair $(s, t)$ satisfies action $A$:
  $$\text{ENABLED } A \triangleq \exists v' : A(v, v')$$

### Stuttering Steps and Refinement
A central axiom of TLA is that physical time or lower-level system progression must not invalidate higher-level abstractions. Every specification must be invariant under stuttering (steps where variables remain unchanged):
$$[Next]_{vars} \triangleq Next \lor (vars' = vars)$$
Here, $vars$ is the tuple of all state variables in the specification. A valid system step either advances the state via the relation $Next$ or performs a stuttering step where all variables in $vars$ retain their values.

---

## 3. Canonical Specification Formula and Temporal Syntax Rules

### The Canonical Formula
Every discrete system in TLA+ is formally specified by a single temporal logic formula of canonical form:
$$Spec \triangleq Init \land \Box[Next]_{vars} \land Liveness$$
* **$Init$**: A state predicate asserting what must hold in the initial state $s_0$.
* **$\Box[Next]_{vars}$**: A safety formula asserting that every consecutive step $(s_i, s_{i+1})$ in the infinite behavior satisfies either the next-state relation $Next$ or stutters on $vars$.
* **$Liveness$**: A conjunction of fairness conditions asserting that certain actions cannot remain enabled indefinitely without eventually executing.
  * **Weak Fairness**: $\text{WF}_{vars}(A) \triangleq \Box \Diamond \neg \text{ENABLED } \langle A \rangle_{vars} \lor \Box \Diamond \langle A \rangle_{vars}$ (if $A$ becomes continuously enabled, it must eventually step).
  * **Strong Fairness**: $\text{SF}_{vars}(A) \triangleq \Diamond \Box \neg \text{ENABLED } \langle A \rangle_{vars} \lor \Box \Diamond \langle A \rangle_{vars}$ (if $A$ is repeatedly enabled, even intermittently, it must eventually step).
  * Here, $\langle A \rangle_{vars} \triangleq A \land (vars' \neq vars)$ ensures non-stuttering action execution.

### Syntactic Prohibitions of TLA
To guarantee that every temporal formula is well-formed, composable, and closed under stuttering:
1. **No Double Priming**: Priming a primed variable (e.g., `x''`) is strictly forbidden. Temporal steps evaluate relations strictly between state $s$ and state $t$.
2. **No Temporal Operators Inside Actions**: The temporal modality $\Box$ (always) or $\Diamond$ (eventually) cannot appear inside an action formula or under the scope of a prime operator.
3. **Machine Closure**: Specifications are structured such that safety ($Init \land \Box[Next]_{vars}$) does not rule out finite behaviors that cannot be extended to satisfy $Liveness$.

### Module Structure and Composition
A TLA+ specification is organized into modules:
* `---- MODULE ModuleName ----`: Begins the module boundary.
* `EXTENDS Naturals, Sequences, FiniteSets, TLC`: Imports definitions from standard library modules.
* `CONSTANTS`: Declares fixed system parameters (e.g., capacities, participants).
* `VARIABLES`: Declares state variables that change over transitions.
* `ASSUME`: States mathematical assumptions on declared constants checked prior to execution.
* `INSTANCE OtherModule WITH param <- value`: Parametrically imports another specification, enabling formal refinement mappings.
* `THEOREM Spec => []TypeOK`: Formal claim that any behavior satisfying `Spec` invariantly maintains predicate `TypeOK`.
* `====`: Terminates the module boundary.

---

## 4. Complete Runnable Specification: Bounded Message Queue

The following module models a bounded message queue with atomic producer enqueue, consumer dequeue, explicit `UNCHANGED` conditions, and an invariant type guard.

```tla
----------------------- MODULE WorkbenchBufferSpec -----------------------
EXTENDS Naturals, Sequences, TLC

CONSTANTS 
    Capacity,      \* Maximum buffer depth (Natural > 0)
    Producers,     \* Non-empty set of producer IDs
    Messages       \* Set of valid message payloads

VARIABLES 
    buffer,        \* FIFO sequence of messages
    enqueuedCount, \* Total count of enqueue operations performed
    dequeuedCount  \* Total count of dequeue operations performed

vars == <<buffer, enqueuedCount, dequeuedCount>>

ASSUME CapacityAssumption == 
    /\ Capacity \in Nat 
    /\ Capacity > 0
    /\ Producers # {}
    /\ Messages # {}

-----------------------------------------------------------------------------
\* Type invariant and state predicates
TypeOK == 
    /\ buffer \in Seq(Messages)
    /\ Len(buffer) <= Capacity
    /\ enqueuedCount \in Nat
    /\ dequeuedCount \in Nat
    /\ enqueuedCount >= dequeuedCount

Init == 
    /\ buffer = <<>>
    /\ enqueuedCount = 0
    /\ dequeuedCount = 0

-----------------------------------------------------------------------------
\* Transition Actions

Enqueue(p, msg) == 
    /\ Len(buffer) < Capacity
    /\ p \in Producers
    /\ msg \in Messages
    /\ buffer' = Append(buffer, msg)
    /\ enqueuedCount' = enqueuedCount + 1
    /\ UNCHANGED <<dequeuedCount>>

Dequeue == 
    /\ Len(buffer) > 0
    /\ buffer' = Tail(buffer)
    /\ dequeuedCount' = dequeuedCount + 1
    /\ UNCHANGED <<enqueuedCount>>

Next == 
    \/ (\E p \in Producers, m \in Messages : Enqueue(p, m))
    \/ Dequeue

-----------------------------------------------------------------------------
\* Temporal Specification and Invariants

Spec == Init /\ [][Next]_vars /\ WF_vars(Dequeue)

BufferUnderflowNeverOccurs == Len(buffer) >= 0
BufferOverflowNeverOccurs == Len(buffer) <= Capacity

ConservationOfMessages == 
    enqueuedCount = dequeuedCount + Len(buffer)

THEOREM Spec => [](TypeOK /\ BufferOverflowNeverOccurs /\ ConservationOfMessages)
=============================================================================
```

---

## Sources

* https://lamport.azurewebsites.net/pubs/lamport-actions.pdf (jev weight: 0.98)
* https://lamport.azurewebsites.net/tla/book-21-07-04.pdf (jev weight: 0.99)
* https://lamport.azurewebsites.net/tla/book.html (jev weight: 0.99)
* https://dl.acm.org/doi/10.1145/177492.177726 (jev weight: 0.99)
* https://lamport.azurewebsites.net/tla/Consensus.tla (jev weight: 0.99)
* https://lamport.azurewebsites.net/tla/safety-liveness.pdf (jev weight: 0.99)
* https://www.microsoft.com/en-us/research/publication/the-temporal-logic-of-actions/ (jev weight: 0.98)
* https://github.com/BRMatt/playground/blob/main/tla-temporal-actions-tutorial.md (jev weight: 0.60)
