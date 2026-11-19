# 05. Safety Invariants, Liveness / Leads-To (~>) & Refinement Mappings

Formal verification in TLA+ rests upon two foundational classes of properties: safety ("nothing bad happens") and liveness ("something good eventually happens"). In complex system architectures, verifying these properties requires a rigorous hierarchy of invariant layers, a mathematically sound treatment of fairness under stuttering steps, and refinement mappings that demonstrate how concrete, buffered implementations faithfully implement atomic specifications.

---

## 1. The Layered Invariant Architecture

System verification fails when engineers treat safety as a monolithic boolean expression. Robust TLA+ specifications decompose state space validation into four discrete layers, moving from raw structural typing to inductive invariants suitable for automated theorem proving.

### 1.1 Structural Type Invariants (`TypeOK`)

The first layer establishes the mathematical universe in which variables exist. In untyped set theory (ZFC) upon which TLA+ is built, variables can theoretically assume any value. `TypeOK` constrains every state variable to its designated set, sequence, record, or function domain across all reachable states:

```tla
TypeOK ==
  /\ activeMode \in {"IDLE", "EDITING", "BUILDING", "AWAITING_APPROVAL"}
  /\ currentRev \in Nat
  /\ fileRegistry \in [FilePaths -> FileRecords]
  /\ bridgeQueue \in Seq(BridgeMessages)
```

`TypeOK` acts as the primary defense against malformed transitions. In TLC explicit-state exploration and Apalache symbolic model checking (via Snowcat typing), verifying `TypeOK` is evaluated before any domain property. If `TypeOK` is violated, state formulas evaluating records or sequences crash with domain evaluation errors.

### 1.2 Domain Safety Invariants (`[]Safety`)

Domain safety invariants assert that reachable states never enter an illegal or catastrophic configuration. Formally, a state predicate $$Safety$$ must hold in every reachable state, denoted by the temporal formula $$\Box Safety$$:

* **Mutual Exclusion:** No two concurrent processes occupy a critical execution section simultaneously:
  $$\Box (\forall p1, p2 \in Process : (p1 \neq p2) \implies \neg (pc[p1] = "Critical" \land pc[p2] = "Critical"))$$
* **No Unverified UKI Boot:** In secure bootloaders, a kernel image is executed only if its hash has been measured and verified against cryptographic signatures:
  $$\Box (bootState = "EXECUTING" \implies ukiVerified = TRUE)$$
* **Format Preservation:** Operations never overwrite unrelated files or corrupt structural headers during partial disk writes:
  $$\Box (\forall f \in UnrelatedFiles : fileState[f] = InitialFileState[f])$$

Safety properties are prefix-closed: any violation occurs at a finite point in time, and once violated, the prefix cannot be extended to satisfy the property.

### 1.3 Action Properties (`[][ActionProperty]_vars`)

While state invariants inspect a single state, action properties evaluate pairs of consecutive states $$(s, s')$$. Expressed as $$[][A]_{vars}$$, an action property asserts that every step either satisfies transition formula $$A$$ or is a stuttering step leaving state vector $$vars$$ unchanged:

```tla
MonotonicRev ==
  currentRev' >= currentRev

Spec == Init /\ [][Next]_vars /\ [][MonotonicRev]_vars
```

Action properties forbid retrogressive state corruption, such as monotonic sequence rollback, non-decreasing clock skew, or illegal direct transitions between decoupled lifecycle states (e.g., jumping from "AWAITING_APPROVAL" directly to "COMMITTED" without passing through an explicit signature verification step).

### 1.4 Inductive Invariants and Strengthening Lemmas

Model checking via state enumeration is bounded by state space explosion. In contrast, deductive verification requires an **inductive invariant** ($$IndInv$$) that can be verified in two steps without exploring the full state graph:

1. **Initiation:** $$Init \implies IndInv$$
2. **Consecution:** $$IndInv \land Next \implies IndInv'$$

A naive domain safety property $$Safety$$ is rarely inductive on its own: there exist "unreachable bad states" from which $$Next$$ can transition into a state violating $$Safety$$. To construct a valid inductive invariant, $$Safety$$ must be strengthened with lemmas:

```tla
IndInv ==
  /\ TypeOK
  /\ DomainSafety
  /\ QueueIntegrityLemmas
  /\ PhaseCorrelationLemmas
```

Strengthening lemmas eliminate unreachable pseudo-predecessor states, ensuring that $$IndInv \land Next \implies IndInv'$$ holds over all arbitrary valuations of variables.

---

## 2. Temporal Logic and Liveness: Ensuring Something Good Eventually Happens

Safety alone permits a trivial system: a deadlocked system that takes zero steps satisfies all safety invariants. To model functional utility, specifications require liveness properties.

### 2.1 Core Temporal Operators

* $$\Diamond P$$ (**Eventually**): State predicate $$P$$ holds at some future state in the behavior.
* $$\Box \Diamond P$$ (**Infinitely Often**): Predicate $$P$$ repeatedly becomes true throughout an infinite execution trace.
* $$\Diamond \Box P$$ (**Eventually Always**): The system eventually enters a state where $$P$$ remains permanently true thereafter.

### 2.2 Leads-To (`P ~> Q`)

The leads-to operator formalizes progress and response guarantees:

$$
P \leadsto Q \equiv \Box (P \implies \Diamond Q)
$$

This states that whenever condition $$P$$ becomes true, guarantee $$Q$$ must inevitably be fulfilled at that state or some later state. Common systems patterns include:

* `RequestSubmitted ~> RequestProcessed`
* `SaveTriggered ~> RevisionAcknowledged`
* `LockRequested ~> LockAcquired`

### 2.3 The Stuttering Trap and Fairness

By definition, TLA+ temporal semantics are stuttering-invariant: an arbitrary number of stuttering steps ($$vars' = vars$$) can occur at any point. Consequently, any unconstrained specification:

$$
Spec \equiv Init \land \Box [Next]_{vars}
$$

trivially violates $$P \leadsto Q$$, because a valid behavior can halt and stutter forever immediately after $$P$$ becomes true. To rule out artificial execution stalls, actions must be equipped with fairness constraints.

#### Weak Fairness (`WF_vars(A)`)

Weak fairness asserts that if action $$A$$ becomes **continually enabled** without interruption, action $$A$$ must eventually occur:

$$
WF_{vars}(A) \equiv \Box \Diamond (\neg ENABLED \langle A \rangle_{vars}) \lor \Box \Diamond \langle A \rangle_{vars}
$$

Weak fairness suffices when an action, once enabled, remains enabled until it is executed (e.g., a background worker draining a thread-safe message FIFO).

#### Strong Fairness (`SF_vars(A)`)

Strong fairness asserts that if action $$A$$ is **repeatedly or intermittently enabled**, even if repeatedly disabled in intermediate states, action $$A$$ must eventually execute:

$$
SF_{vars}(A) \equiv \Diamond \Box (\neg ENABLED \langle A \rangle_{vars}) \lor \Box \Diamond \langle A \rangle_{vars}
$$

Strong fairness is necessary for systems with contention, round-robin schedulers, or shared communication channels where a resource's availability toggles repeatedly while a waiting process attempts to acquire it.

---

## 3. Refinement Mappings: Bridging Implementation to Atomic Abstraction

A critical strength of TLA+ is formal refinement: proving that a complex, lower-level implementation state machine (incorporating transport queues, retries, chunking, and holding buffers) correctly implements an abstract specification where operations appear atomic.

```
+--------------------------------------------------------+
|                High-Level Abstract Spec                |
|               (Atomic Commit, Zero Buffers)            |
+--------------------------------------------------------+
                           ^
                           | Refinement Mapping (INSTANCE WITH)
                           | Theorem: LowSpec => Abs!Spec
+--------------------------------------------------------+
|                Low-Level Concrete Spec                 |
|       (Ring Buffers, Network Retries, ACK Phases)      |
+--------------------------------------------------------+
```

### 3.1 Principles of Stuttering-Insensitive Refinement

Let high-level abstract specification $$AbsSpec$$ have state variables $$x$$, and low-level concrete specification $$LowSpec$$ have state variables $$y$$. A refinement mapping defines an expression $$\overline{x} \triangleq f(y)$$ that computes abstract state variables from concrete state variables.

Because TLA+ actions allow stuttering steps ($$\langle A \rangle_{vars} \lor vars' = vars$$), concrete steps that manage internal plumbing (such as filling an internal buffer or handshaking over a network socket) map directly to abstract stuttering steps ($$\overline{x}' = \overline{x}$$). When the concrete system completes a commit, the mapping produces a visible abstract state change ($$\overline{x}' \neq \overline{x}$$).

### 3.2 Constructing Refinement Mappings with `INSTANCE ... WITH`

In TLA+, refinement is checked modularly using instantiation:

```tla
--------------------------- MODULE ConcreteSystem ---------------------------
EXTENDS Naturals, Sequences

VARIABLES buffer, diskState, ackPending

vars == <<buffer, diskState, ackPending>>

\* Abstract state computation
AbstractCommittedData ==
  IF ackPending = FALSE THEN diskState ELSE diskState \o buffer

Abs == INSTANCE AbstractStore WITH
  storageState <- AbstractCommittedData

THEOREM RefinementProof == Spec => Abs!Spec
=============================================================================
```

TLC verifies this theorem by evaluating whether every concrete execution step translates into a legal step of `Abs!Next` or an abstract stuttering step, while preserving all abstract safety and liveness invariants.

### 3.3 Auxiliary Variables: History and Prophecy Variables

In certain concurrent systems, the concrete state does not contain sufficient immediate information to determine the corresponding abstract state. TLA+ resolves this through two canonical classes of auxiliary variables (formalized by Abadi and Lamport):

* **History Variables:** Record past execution events (such as timestamps, sequence numbers, or message logs). History variables extend the state space without restricting existing enabled actions.
* **Prophecy Variables:** Predict non-deterministic future choices made by the concrete implementation (e.g., which worker node will eventually win leader election), allowing the abstract specification to make synchronized non-deterministic choices earlier in the execution trace.

---

## 4. Practical Verification Patterns for High-Assurance Systems

When applying these principles to critical distributed infrastructure, embedded firmware, or agentic workbenches, engineers adhere to the following checklist:

1. **Gate Every Action with Type Safety:** Always verify `TypeOK` across all reachable states before running compute-heavy temporal model checks.
2. **Explicitly Pair Liveness with Fairness:** Never write `Spec == Init /\ [][Next]_vars` when asserting leads-to properties ($$P \leadsto Q$$); always attach explicit `WF_vars` or `SF_vars` on progress actions.
3. **Use Monotonic Guards on Revisions:** Enforce action invariants `[][rev' >= rev]_vars` to mathematically eliminate split-brain rollbacks.
4. **Isolate Abstract Invariants:** Prove domain invariants on abstract specifications first, then transfer proof obligations to concrete implementations via refinement mappings.

---

## Sources

The concepts, formulations, and proof methodologies in this reference are grounded in the following authoritative sources:

* [Safety, Liveness, and Fairness -- Leslie Lamport](https://lamport.azurewebsites.net/tla/safety-liveness.pdf) (jev weight: 0.9885)
* [PlusCal Tutorial - Session 9 -- Leslie Lamport](https://lamport.azurewebsites.net/tla/tutorial/session9.html) (jev weight: 0.9810)
* [GitHub - tlaplus/Examples: A collection of TLA+ specifications](https://github.com/tlaplus/Examples) (jev weight: 0.9686)
* [creating:safety -- TLA+ Wiki](https://docs.tlapl.us/creating:safety) (jev weight: 0.9505)
* [Generating and Solving Temporal Proof Obligations with LLM Agents -- arXiv](https://arxiv.org/html/2610.14923) (jev weight: 0.8876)
* [Stuttering Steps and Temporal Formulas in TLA+ -- GitHub Pages](https://rdivyanshu.github.io/posts/2023/08/stuttering-steps-in-tla.html) (jev weight: 0.8360)
* [Specifying Liveness in TLA+ -- CS5232 2026 (Ilya Sergey)](https://ilyasergey.net/CS5232/week-06-tla.html) (jev weight: 0.8077)
* [Temporal Properties -- Learn TLA+](https://www.learntla.com/core/temporal-logic.html) (jev weight: 0.7798)
* [Liveness and Fairness in TLA+ -- will62794.github.io](https://will62794.github.io/my-notes/notes/Liveness_and_Fairness_in_TLA+/Liveness_and_Fairness_in_TLA+.html) (jev weight: 0.7143)
* [Specifying Liveness in TLA+ -- PFM 2024 (Ilya Sergey)](https://ilyasergey.net/PFM24/week-06-tla.html) (jev weight: 0.5470)
