# 06. Model-Based Testing (MBT) from TLA+ Specs & Counterexample Trace Generation

Modern distributed architectures, multi-tenant cloud platforms, and complex agentic workbenches frequently fail not because individual components lack unit tests, but because rare, multi-step concurrent action interleavings create invalid edge states. Model-Based Testing (MBT) bridges formal TLA+ specifications and live software implementations by inverting model checkers into automated test-trace generators.

---

## 1. The Interleaving Blindspot in Manual and Scripted Testing

Handcrafted integration tests and linear End-to-End (E2E) scripts check a negligible fraction of a system's true execution graph. A suite of 5 linear integration scripts tests exactly 5 distinct execution sequences. In contrast, a modest TLA+ state machine with 6 discrete actions executed to depth 8 explores thousands of reachable interleavings:

```
                      [Initial State]
                     /       |       \
               ActionA    ActionB    ActionC
                /   \      /   \      /   \
              ...   ...  ...   ...  ...   ...
         Branching Factor: ~6^8 = 1,679,616 potential paths
```

Manual test suites routinely miss severe concurrency bugs, including:

* **Asynchronous Readiness Races:** A browser UI bridge receiving an asynchronous `postMessage` event before a client-side WebAssembly runtime has signaled `WASM_READY`, causing messages to be dropped or unhandled.
* **Mode Switches During In-Flight I/O:** A user toggling application mode while a network save transaction is in flight, creating an inconsistent UI state if the save completion handler assumes the previous mode.
* **State Overwrite vs. Accretion:** A secondary prompt arriving during an active code-generation loop, silently overwriting uncommitted editor buffers instead of appending a new file to the workspace registry.
* **Mid-Step Interruptions:** Pausing, cancelling, or closing a background job while a holding queue contains unacknowledged frames, causing partial state leaks upon restart.

Formal specifications enumerate these actions as non-deterministic transitions. Model checkers explore every legal ordering, guaranteeing that subtle concurrency hazards are systematically exposed.

---

## 2. The Negated-Goal Counterexample Recipe

Model checkers like TLC and Apalache are designed to falsify invariants by searching for counterexamples. The fundamental insight of TLA+-driven Model-Based Testing is that a model checker's counterexample engine can be repurposed to synthesize minimal execution traces reaching specific desired target states.

### 2.1 Formulating Target Reachability Predicates

Rather than asserting system safety, the engineer defines a reachability predicate representing a complex, multi-step scenario:

```tla
Goal_InPlaceRewrite ==
  /\ fileRegistry["main.rs"].version > 1
  /\ activeMode = "IDLE"
  /\ saveAckReceived = TRUE

Goal_SecondFileAdded ==
  /\ Cardinality(DOMAINS fileRegistry) = 2
  /\ fileRegistry["main.rs"].status = "COMMITTED"
  /\ fileRegistry["lib.rs"].status = "COMMITTED"

Goal_LoadHoldFlushedAfterReady ==
  /\ wasmReady = TRUE
  /\ loadHoldQueue = <<>>
  /\ processedMessagesCount > 0

Goal_CloseResetsChatAndMode ==
  /\ modalOpen = FALSE
  /\ chatBuffer = ""
  /\ activeMode = "DEFAULT"
```

### 2.2 Invariant Inversion and Model Execution

To generate a witness trace for `Goal_Target`, define a pseudo-invariant asserting the target is unreachable:

```tla
NotGoal_InPlaceRewrite == ~Goal_InPlaceRewrite
```

When TLC or Apalache checks `NotGoal_InPlaceRewrite`, finding an invariant violation yields a valid state sequence reaching `Goal_InPlaceRewrite`. In TLC, breadth-first search (BFS) guarantees the counterexample is the shortest possible action sequence:

```bash
# Explicit-state shortest trace generation via TLC
java -cp tla2tools.jar tlc2.TLC -config TestGen.cfg -dumpTrace json trace.json Spec.tla

# Symbolic bounded trace synthesis via Apalache
apalache-mc check --inv=NotGoal_InPlaceRewrite --length=10 Spec.tla
```

Apalache generates `counterexample.json`, containing valuations for all variables across every step from initial state to goal.

---

## 3. Converting Model Traces into Executable Test Suites

Raw model checker traces consist of mathematical assignments: `[activeMode |-> "EDITING", currentRev |-> 2]`. To test real applications, an automated harness compiles these JSON traces into executable test scripts (Playwright, Puppeteer, Chrome DevTools Protocol, or Node.js API drivers).

```
+-------------------+        +--------------------+        +---------------------+
|  TLA+ Spec + Goal | -----> | TLC / Apalache SMT | -----> | counterexample.json |
+-------------------+        +--------------------+        +---------------------+
                                                                      |
                                                                      v
+-------------------+        +--------------------+        +---------------------+
|  Pass/Fail Report | <----- | Live Web/API Test  | <----- | traceToTestRunner   |
+-------------------+        +--------------------+        +---------------------+
```

### 3.1 Trace Structure and Driver Harness (`traceToTestRunner.mjs`)

The compiler script reads the step list, maps each formal action to a live driver call, and verifies real implementation invariants after every step:

```javascript
// traceToTestRunner.mjs
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

export async function runFormalTrace(page, traceFilePath) {
  const { trace } = JSON.parse(readFileSync(traceFilePath, "utf8"));

  for (let i = 0; i < trace.length - 1; i++) {
    const currentStep = trace[i];
    const nextStep = trace[i + 1];

    // 1. Dispatch concrete action matching nextStep.action
    await dispatchAction(page, nextStep.action, nextStep.parameters);

    // 2. Query observed state from DOM, localStorage, or API response
    const observedState = await querySystemState(page);

    // 3. Assert implementation conforms to formal model expectation
    expect(observedState.mode).toBe(nextStep.state.mode);
    expect(observedState.wasmReady).toBe(nextStep.state.wasmReady);
    expect(observedState.queueLength).toBe(nextStep.state.queue.length);
  }
}

async function dispatchAction(page, actionName, params) {
  switch (actionName) {
    case "ReceiveBridgeMessage":
      return page.evaluate(msg => window.postMessage(msg, "*"), params);
    case "SignalWasmReady":
      return page.evaluate(() => window.__testBridge.signalWasmReady());
    case "FlushLoadHoldQueue":
      return page.locator("#flush-queue-button").click();
    default:
      throw new Error(`Unhandled action: ${actionName}`);
  }
}
```

If the real implementation deviates from `nextStep.state`, the test runner immediately fails, identifying the exact step and state variable where the runtime diverges from the mathematical model.

---

## 4. Transition-Coverage and Boundary-Pair Test Suite Generation

To achieve complete verification without redundant test cases, specifications employ systematic coverage generation strategies.

### 4.1 Sub-Action Transition Coverage

For a system transition defined as a disjunction of sub-actions:

$$
Next \equiv A_1 \lor A_2 \lor \dots \lor A_k
$$

Full transition coverage requires executing at least one valid trace exercising each sub-action $$A_i$$. Introducing auxiliary tracking variables into the test harness specification:

```tla
VARIABLES ..., executedActions

Init == ... /\ executedActions = [a \in Actions |-> FALSE]

Next ==
  \/ A1 /\ executedActions' = [executedActions EXCEPT !["A1"] = TRUE]
  \/ A2 /\ executedActions' = [executedActions EXCEPT !["A2"] = TRUE]
  \/ A3 /\ executedActions' = [executedActions EXCEPT !["A3"] = TRUE]

CoverAllActions == \A a \in Actions : executedActions[a] = TRUE
```

Checking `INVARIANT ~CoverAllActions` produces an execution path sequencing through every sub-action.

### 4.2 Boundary-Pair Coverage

High-risk faults frequently hide at boundaries between contrasting actions (e.g., executing an immediate `Cancel` action during `FlushingQueue`). By tracking pairs of consecutive actions $$(A_i, A_j)$$, model checkers systematically synthesize edge-case suites testing rapid toggling, abort sequences, and restart recovery.

---

## Sources

The methodologies, tooling patterns, and empirical architectures cited in this document are derived from the following authoritative research:

* [Fully-Tested code generation from TLA+ specifications -- ACM DL](https://dl.acm.org/doi/10.1145/3559744.3559747) (jev weight: 0.9833)
* [GitHub - tlaplus/tlaplus: TLC is a model checker for specifications](https://github.com/tlaplus/tlaplus) (jev weight: 0.9802)
* [The TLA+ Model Checker Apalache -- Springer](https://link.springer.com/chapter/10.1007/978-3-032-32519-8_8) (jev weight: 0.9797)
* [Apalache | The Symbolic Model Checker for TLA+](https://apalache-mc.org/) (jev weight: 0.9750)
* [Model-based testing with TLA+ and APALACHE -- Kuprianov & Konnov](http://conf.tlapl.us/2020/09-Kuprianov_and_Konnov-Model-based_testing_with_TLA_+_and_Apalache.pdf) (jev weight: 0.9747)
* [GitHub - apalache-mc/apalache: APALACHE: symbolic model checker for TLA+](https://github.com/apalache-mc/apalache/) (jev weight: 0.9741)
* [Generating traces for automated testing using Apalache -- Informal Systems](https://mbt.informal.systems/docs/tla_basics_tutorials/generating_traces.html) (jev weight: 0.9720)
* [Fully-Tested code generation from TLA+ specifications -- ACM Open](https://dlnext.acm.org/doi/pdf/10.1145/3559744.3559747) (jev weight: 0.9664)
* [AgentRFC: Security Design Principles and Conformance Testing -- arXiv](https://arxiv.org/html/2603.23801v1) (jev weight: 0.9423)
* [One evaluation of model-based testing and its automation -- arXiv](https://arxiv.org/abs/1701.06815v1) (jev weight: 0.9147)
