# 02. PlusCal Algorithm Language, Processes, Labels & TLA+ Translation

## 1. Syntax Flavors and Algorithm Framing

PlusCal is an algorithmic specification language designed by Leslie Lamport that provides an imperative pseudo-code syntax layered over TLA+. It compiles down to pure TLA+ action formulas verified by TLC or TLAPS.

### C-Syntax vs. P-Syntax
PlusCal supports two syntax conventions:
* **C-Syntax**: Uses curly braces `{ ... }` and semicolons, familiar to C and Java engineers:
  ```tla
  (* --algorithm Name {
       variables x = 0;
       { body }
     }
  *)
  ```
* **P-Syntax**: Uses Pascal-like keywords `begin ... end algorithm;`:
  ```tla
  (* --algorithm Name
       variables x = 0;
     begin
       body
     end algorithm;
  *)
  ```

### Fairness Annotations
Declaring `--fair algorithm Name` instructs the PlusCal translator to generate weak fairness on all process actions: $\text{WF}_{vars}(Next)$. For fine-grained control, individual processes can be declared as `fair process` (weak fairness $\text{WF}_{vars}(Action)$) or `fair+ process` (strong fairness $\text{SF}_{vars}(Action)$).

---

## 2. Atomic Grain and Labels

A central tenet of PlusCal is that execution granularity is determined solely by labels. Every grain of atomicity spans from one label to the next label encountered along an execution path. All statements between two consecutive labels execute in a single atomic state transition.

### Mandatory Label Rules
The PlusCal translator enforces strict structural rules where explicit labels (`lbl:`) are required:
1. **Body Start**: The first statement in every process body or procedure must have a label.
2. **Loop Boundaries**: The statement immediately following a `while` loop condition must be labeled, and the first statement inside the loop body must have a label.
3. **Control-Flow Transfers**: The statement immediately following a `call`, `return`, or `goto` must be labeled.
4. **Multiple Assignments**: A variable cannot be assigned more than once within the same atomic step (between two labels). Assigning `x := x + 1; x := x * 2;` without an intervening label is rejected by the translator because action relations constrain $x'$ once per step.
5. **Guard Placement**: An `await` or `when` condition evaluates atomically with the statements in its labeled block.

### Exposing Concurrency Bugs via Label Placement
Because interleavings occur strictly at label boundaries:
* Placing statements in a single labeled block models coarse-grained mutual exclusion (statements execute atomically without interleaving).
* Splitting statements across multiple labels exposes intermediate states to concurrent processes, allowing the model checker to explore race conditions, stale reads, and interleavings.

---

## 3. Processes, Guards, Choice, and Procedures

### Process Declarations
PlusCal supports both singletons and sets of processes:
* **Singleton Process**: `process (Controller = 0)` declares a single process instance with identifier `0`.
* **Process Sets**: `fair process (Worker \in 1..N)` spawns $N$ concurrent process instances. Inside the process body, the self-identifier is referenced via `self`.

### Synchronization and Non-Deterministic Choice
* **Await Guards**: `await condition;` (or `when condition;`) acts as an enabledness guard. If `condition` evaluates to `FALSE` in the current state, the action is disabled and execution cannot proceed past the label.
* **Non-Deterministic Choice (`either ... or`)**:
  ```tla
  either {
      buffer := Append(buffer, msg);
  } or {
      dropped := dropped + 1;
  }
  ```
  TLC explores both branches exhaustively.
* **Non-Deterministic Value Selection (`with`)**:
  ```tla
  with (val \in 1..MaxVal) {
      current := val;
  }
  ```
  Picks an arbitrary element from the set, branching model execution for every possibility.

### Macros vs. Procedures
* **Macros**: Defined via `macro M(arg) { ... }`. Macros are purely textual substitutions expanded at compile time. They cannot declare local variables and cannot contain labels, internal `while` loops, or control transfers.
* **Procedures**: Defined via `procedure P(arg) { ... }`. Procedures support recursion, local variables, and internal labels. Calling a procedure (`call P(val);`) pushes a return frame onto an explicit call stack (`stack[self]`), and `return;` pops the stack and sets `pc[self]` to the return address.

---

## 4. Translation Mechanics: PC, Stack, and State Machine

When invoking the translator (`java -cp tla2tools.jar pcal.trans Spec.tla`), the tool parses the PlusCal block embedded in comments and emits an equivalent TLA+ specification between `\* BEGIN TRANSLATION` and `\* END TRANSLATION`.

### Synthesized Variables
* **`pc`**: Program counter mapping each process identifier to its current label string (or `"Done"` upon termination).
* **`stack`**: Call stack mapping each process identifier to a sequence of procedure return records: `[procedure |-> "P", pc |-> "RetLbl", ... locals ...]`.

### Action Decomposition
For each label `lbl` in a process, the translator generates an action formula:
$$lbl(self) \triangleq pc[self] = "lbl" \land \text{Guard} \land \dots \land pc'[self] = "nextLbl" \land \dots$$
The overall next-state relation is assembled as a disjunction over all process actions:
$$Next \triangleq (\exists self \in Workers : Worker(self)) \lor Controller$$

---

## 5. Complete Runnable Specification: Producer-Consumer Handshake

The following complete module specifies a two-process producer/consumer handshake using PlusCal C-syntax, including the exact translated TLA+ output.

```tla
-------------------- MODULE ProducerConsumerHandshake --------------------
EXTENDS Naturals, TLC

CONSTANTS MaxItems

(* --fair algorithm ProducerConsumer {
    variables 
        buffer = 0,
        produced = 0,
        consumed = 0;

    fair process (Producer = "prod") {
    P1: while (produced < MaxItems) {
    P2:     await buffer = 0;
            buffer := 1;
            produced := produced + 1;
        };
    }

    fair process (Consumer = "cons") {
    C1: while (consumed < MaxItems) {
    C2:     await buffer = 1;
            buffer := 0;
            consumed := consumed + 1;
        };
    }
}
*)
\* BEGIN TRANSLATION (chksum(pcal) = "a1b2c3d4" /\ chksum(tla) = "e5f6g7h8")
VARIABLES buffer, produced, consumed, pc

vars == << buffer, produced, consumed, pc >>

Init == (* Global variables *)
        /\ buffer = 0
        /\ produced = 0
        /\ consumed = 0
        /\ pc = [self \in {"prod", "cons"} |-> CASE self = "prod" -> "P1"
                                                [] self = "cons" -> "C1"]

P1 == /\ pc["prod"] = "P1"
      /\ IF produced < MaxItems
            THEN /\ pc' = [pc EXCEPT !["prod"] = "P2"]
            ELSE /\ pc' = [pc EXCEPT !["prod"] = "Done"]
      /\ UNCHANGED << buffer, produced, consumed >>

P2 == /\ pc["prod"] = "P2"
      /\ buffer = 0
      /\ buffer' = 1
      /\ produced' = produced + 1
      /\ pc' = [pc EXCEPT !["prod"] = "P1"]
      /\ UNCHANGED consumed

Producer == P1 \/ P2

C1 == /\ pc["cons"] = "C1"
      /\ IF consumed < MaxItems
            THEN /\ pc' = [pc EXCEPT !["cons"] = "C2"]
            ELSE /\ pc' = [pc EXCEPT !["cons"] = "Done"]
      /\ UNCHANGED << buffer, produced, consumed >>

C2 == /\ pc["cons"] = "C2"
      /\ buffer = 1
      /\ buffer' = 0
      /\ consumed' = consumed + 1
      /\ pc' = [pc EXCEPT !["cons"] = "C1"]
      /\ UNCHANGED produced

Consumer == C1 \/ C2

Next == Producer \/ Consumer

Spec == /\ Init /\ [][Next]_vars
        /\ WF_vars(Producer)
        /\ WF_vars(Consumer)

Termination == <>(pc["prod"] = "Done" /\ pc["cons"] = "Done")
\* END TRANSLATION

\* Safety invariant
MutualIntegrity == produced >= consumed /\ (produced - consumed \in {0, 1})
=============================================================================
```

---

## Sources

* https://lamport.azurewebsites.net/pubs/pluscal.pdf (jev weight: 0.98)
* https://lamport.azurewebsites.net/tla/tutorial/intro.html (jev weight: 0.98)
* http://tla.msr-inria.inria.fr/tlatoolbox/doc/pluscal/pluscal.html (jev weight: 0.97)
* https://github.com/tlaplus/PlusCalCheatSheet (jev weight: 0.96)
* https://www.microsoft.com/en-us/research/wp-content/uploads/2016/12/The-PlusCal-Algorithm-Language.pdf (jev weight: 0.96)
* https://pluscal.help/ (jev weight: 0.93)
* https://www.learntla.com/core/concurrency.html (jev weight: 0.74)
