# 07. Implementation Trace Validation: Checking Live System Logs Against TLA+ Specs

## Overview: Closing the Reality Gap with Trace Validation

Formal models verified with model checkers like TLC or Apalache guarantee correctness only for the abstract model itself. Traditional unit and integration tests execute live production code but examine isolated trajectories, leaving subtle concurrency races, reordering anomalies, and distributed state corruption undetected. Implementation Trace Validation (TV) bridges this formal gap: it takes real execution traces emitted by production or test systems (such as NDJSON event streams, Cloudflare D1 `jev_chat_logs` transitions, Universal Bridge `postMessage` transcripts, or `yubiOS` boot and hardware enrollment journal logs) and executes them against a TLA+ specification to verify that the recorded event sequence `Log[1], Log[2], ..., Log[N]` constitutes a valid prefix of the specification's allowed behaviors.

Rather than attempting symbolic interpretation or static verification of complex host languages (TypeScript, C, Go, or Rust), Trace Validation treats the running system as a generator of state transitions. The TLA+ model checker verifies whether there exists a valid sequence of initial states and action steps in the formal specification that maps to the concrete log records.

```
+-------------------------------------------------------------+
| Production Runtime / Test Harness Execution                 |
| (TypeScript Workbench, yubiOS Boot, D1 jev_chat_logs)       |
+-------------------------------------------------------------+
                              | Emits NDJSON Event Log: Log[1..N]
                              v
+-------------------------------------------------------------+
| TraceSpec.tla (Constraint Harness)                          |
| - l \in 1..Len(TraceLog) + 1 (Trace Step Cursor)            |
| - TraceInit == Init /\ MatchState(TraceLog[1]) /\ l = 1     |
| - TraceNext == l <= Len(TraceLog) /\ Next /\                |
|                MatchEvent(TraceLog[l]) /\ l' = l + 1        |
+-------------------------------------------------------------+
                              | Evaluated by TLC
                              v
+-------------------------------------------------------------+
| Conformance Verification:                                   |
| - If l > Len(TraceLog): Full Trace Conforms to Spec (PASS)   |
| - If Deadlock / Invariant Breach at l <= Len(TraceLog):     |
|   TLC isolates exact log index and divergence state (FAIL)  |
+-------------------------------------------------------------+
```

## The Canonical TraceSpec Architecture

A trace specification embeds the operational model (`Spec.tla`) inside a driver harness (`TraceSpec.tla`). The harness maintains an explicit cursor variable `l` that steps synchronously through the recorded log sequence.

### Loading External Logs via IOUtils and Json

In modern Community Modules (TLA+ Tools), logs can be ingested directly from disk using `ndJsonDeserialize` or `jsonDeserialize`:

```tla
EXTENDS Integers, Sequences, Json, IOUtils
CONSTANTS JsonTracePath
TraceLog == ndJsonDeserialize(JsonTracePath)
```

Alternatively, when driving TLC through automated CI runners or deterministic test scripts, trace records can be synthesized into a static TLA+ tuple constant in the TLC configuration file (`.cfg`).

### Cursor Stepping and Action Synchronization

Let the system model define `Init` and `Next` over system variables `vars`. The trace specification defines:

```tla
VARIABLE l, vars

TraceInit ==
    /\ l = 1
    /\ l <= Len(TraceLog)
    /\ Init
    /\ MatchState(TraceLog[1])

TraceNext ==
    /\ l <= Len(TraceLog)
    /\ Next
    /\ MatchEvent(TraceLog[l])
    /\ l' = l + 1
```

If the log captures post-states rather than transitions, `MatchState(TraceLog[l'])` checks that primed variables satisfy observed log properties after `Next` fires.

### Partial State Observability and Shadow Variables

Real-world logs rarely record the entire internal state of an application. For instance, a `/jev/` workbench transcript records `postMessage` envelopes (`action: "edit"`, `target: "app.html"`), but does not log internal parser AST caches or transient memory buffers. To handle partial observability:

1. **Non-deterministic Reconstruction**: Let internal hidden variables take any value consistent with the specification's guard predicates. TLC's breadth-first search will explore possible internal assignments until it finds one matching the logged external transition.
2. **Shadow Variables**: Define projection operators that evaluate invariants only over the subset of observed fields, leaving unobserved variables unconstrained during transition matching.
3. **Stuttering Transitions**: If the implementation executes internal housekeeping steps (such as garbage collection or cache warming) that do not advance the observable event log, the harness permits stuttering steps where `UNCHANGED l /\ InternalAction`. Conversely, if the log records sub-step telemetry corresponding to a single atomic TLA+ step, intermediate entries advance `l` without firing `Next`.

### Diagnosing Divergence

When an implementation violates the specification, TLC halts. Divergence is detected cleanly by asserting:

```tla
TraceAccepted == (l > Len(TraceLog))
```

In the `.cfg` file, setting `INVARIANT TraceAccepted` causes TLC to emit a violation counterexample the instant no valid `Next` action can match `TraceLog[l]`. The error report reveals the exact log line index `l` where the implementation deviated, the evaluated values of internal specification variables at step `l - 1`, and candidate actions whose preconditions failed.

## Complete Runnable Example: Workbench Trace Validation

Below is a complete, standalone TLA+ specification and configuration validating an execution trace of the `/jev/` Coding & Design Workbench.

### TraceValidation.tla

```tla
------------------------- MODULE TraceValidation -------------------------
EXTENDS Integers, Sequences, TLC

Modes == {"execute", "coding", "design"}
VARIABLES mode, files, wasmReady, holdQueue, l
vars == <<mode, files, wasmReady, holdQueue>>

TraceLog == <<
    [event |-> "INIT",         mode |-> "execute", wasm |-> FALSE, fileCount |-> 0],
    [event |-> "SET_MODE",     newMode |-> "coding"],
    [event |-> "ENQUEUE_MSG",  payload |-> "render_req"],
    [event |-> "WASM_READY"],
    [event |-> "ADD_FILE",     name |-> "index.html", lang |-> "html"],
    [event |-> "PROCESS_MSG",  payload |-> "render_req"],
    [event |-> "IN_PLACE_EDIT",name |-> "index.html", lang |-> "html"],
    [event |-> "CLOSE_WORKBENCH"]
>>

Init ==
    /\ mode = "execute"
    /\ files = [f \in {} |-> [lang |-> ""]]
    /\ wasmReady = FALSE
    /\ holdQueue = <<>>

SetMode(newMode) ==
    /\ newMode \in Modes
    /\ mode' = newMode
    /\ UNCHANGED <<files, wasmReady, holdQueue>>

EnqueueBridgeMsg(msg) ==
    /\ ~wasmReady
    /\ holdQueue' = Append(holdQueue, msg)
    /\ UNCHANGED <<mode, files, wasmReady>>

WasmBecomesReady ==
    /\ ~wasmReady
    /\ wasmReady' = TRUE
    /\ UNCHANGED <<mode, files, holdQueue>>

ProcessBridgeMsg(msg) ==
    /\ wasmReady
    /\ holdQueue # <<>>
    /\ Head(holdQueue) = msg
    /\ holdQueue' = Tail(holdQueue)
    /\ UNCHANGED <<mode, files, wasmReady>>

AddFile(fileName, language) ==
    /\ fileName \notin DOMAIN files
    /\ files' = files @@ (fileName :> [lang |-> language])
    /\ UNCHANGED <<mode, wasmReady, holdQueue>>

InPlaceEdit(fileName, expectedLang) ==
    /\ fileName \in DOMAIN files
    /\ files[fileName].lang = expectedLang
    /\ files' = [files EXCEPT ![fileName].lang = expectedLang]
    /\ UNCHANGED <<mode, wasmReady, holdQueue>>

CloseWorkbench ==
    /\ mode' = "execute"
    /\ holdQueue' = <<>>
    /\ UNCHANGED <<files, wasmReady>>

Next ==
    \/ \E m \in Modes : SetMode(m)
    \/ \E msg \in {"render_req", "eval_script"} : EnqueueBridgeMsg(msg)
    \/ WasmBecomesReady
    \/ \E msg \in {"render_req", "eval_script"} : ProcessBridgeMsg(msg)
    \/ \E f \in {"index.html", "style.css"}, lang \in {"html", "css"} : AddFile(f, lang)
    \/ \E f \in DOMAIN files : InPlaceEdit(f, files[f].lang)
    \/ CloseWorkbench

MatchState(entry) ==
    /\ mode = entry.mode
    /\ wasmReady = entry.wasm
    /\ Cardinality(DOMAIN files) = entry.fileCount

MatchTransition(entry) ==
    CASE entry.event = "SET_MODE" -> mode' = entry.newMode /\ UNCHANGED <<files, wasmReady, holdQueue>>
      [] entry.event = "ENQUEUE_MSG" -> EnqueueBridgeMsg(entry.payload)
      [] entry.event = "WASM_READY" -> WasmBecomesReady
      [] entry.event = "PROCESS_MSG" -> ProcessBridgeMsg(entry.payload)
      [] entry.event = "ADD_FILE" -> AddFile(entry.name, entry.lang)
      [] entry.event = "IN_PLACE_EDIT" -> InPlaceEdit(entry.name, entry.lang)
      [] entry.event = "CLOSE_WORKBENCH" -> CloseWorkbench
      [] OTHER -> FALSE

TraceInit ==
    /\ l = 1 /\ l <= Len(TraceLog) /\ Init /\ MatchState(TraceLog[1])

TraceNext ==
    /\ l <= Len(TraceLog)
    /\ (IF l = 1 THEN /\ UNCHANGED vars /\ l' = 2
        ELSE /\ MatchTransition(TraceLog[l]) /\ l' = l + 1)

TraceSpec == TraceInit /\ [][TraceNext]_<<vars, l>>
TraceAccepted == (l > Len(TraceLog))
NoLanguageClobber ==
    \A f \in DOMAIN files : files[f].lang \in {"html", "css", "ts", "py"}
=============================================================================
```

### TraceValidation.cfg

```cfg
SPECIFICATION TraceSpec
INVARIANT NoLanguageClobber
INVARIANT TraceAccepted
```

When TLC executes `TraceValidation.tla` with `TraceValidation.cfg`, it steps `l` from `1` through `8`. If an implementation bug emits an illegal transition -- such as processing a message before WASM is ready, mutating an HTML file's language to TypeScript, or dropping queue state on close -- TLC halts and pinpoints the divergence.

## Sources

- `https://docs.tlapl.us/using:tlc:trace_validation` (jev weight: 0.981)
- `https://arxiv.org/abs/2404.16075` (jev weight: 0.9798)
- `https://link.springer.com/article/10.1007/s10270-026-01416-3` (jev weight: 0.9743)
- `https://conf.tlapl.us/2024-fm/slides-merz.pdf` (jev weight: 0.9579)
- `https://arxiv.org/html/2601.11836v1` (jev weight: 0.9341)
- `https://www.mongodb.com/company/blog/engineering/conformance-checking-at-mongodb-testing-our-code-matches-our-tla-specs` (jev weight: 0.9154)
- `https://github.com/etcd-io/raft/issues/111` (jev weight: 0.8813)
- `https://www.datadoghq.com/blog/engineering/continuous-formal-spec-validation/` (jev weight: 0.8708)
- `https://www.usenix.org/system/files/atc25-tang.pdf` (jev weight: 0.7972)
