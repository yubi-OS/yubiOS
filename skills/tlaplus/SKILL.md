---
name: tlaplus
description: "Formalize state machines in TLA+ and PlusCal, run exhaustive explicit-state (TLC) and symbolic (Apalache/Z3) model checking, generate multi-step Model-Based Testing (MBT) suites from negated-goal counterexample traces, and validate live runtime execution logs (NDJSON, D1 jev_chat_logs, Universal Bridge postMessage transcripts, yubiOS enrollment logs) against formal specifications. Triggers on: TLA+, PlusCal, tlc2.TLC, Apalache, Snowcat, model checking, trace validation, TraceSpec.tla, model-based testing, counterexample trace, temporal logic of actions, WF_vars, SF_vars, refinement mapping, formal testing cycle."
metadata:
  short-description: "TLA+ & PlusCal formal specification, TLC/Apalache model checking, MBT trace synthesis & runtime trace conformance"
---

# TLA+ Formal Specification, Model Checking & Trace-Driven Testing (tlaplus)

## Overview

Ad-hoc, linear test scripts check a handful of predetermined happy-path trajectories and systematically miss state-space interleaving bugs: concurrent `postMessage` frames arriving before a WASM canvas reaches `ready`, follow-up coding prompts clobbering file language or overwriting an existing file instead of adding a second file, mid-step pause/resume races, or out-of-order hardware enrollment gates.

This skill replaces linear trial-and-error testing cycles with a **3-stage TLA+ verification loop** grounded in the 8-document Clef-weighted corpus at `yubi-OS/knowledge` (`skills/tlaplus/`):

1. **Stage 1 -- Pre-Code Formal Specification & Exhaustive Model Checking**: Model the component's state variables, atomic transitions (`Next`), structural/domain safety invariants (`TypeOK`, `SafetyInv`), and temporal liveness properties (`WF_vars`, `SF_vars`, `~>`) in **TLA+** or **PlusCal**. Verify finite state spaces exhaustively with **TLC** (`tlc2.TLC`) and bounded symbolic/inductive properties with **Apalache** (Z3 SMT + Snowcat static typechecker).
2. **Stage 2 -- Model-Based Testing (MBT) via Negated-Goal Counterexample Traces**: Automatically synthesize high-coverage multi-step test trajectories by checking negated reachability invariants (`INVARIANT NotGoal` where `NotGoal == ~Goal_Target`) with `-dumpTrace json trace.json`, then drive automated CDP/Puppeteer/Playwright or API test runners directly from the emitted JSON witness traces.
3. **Stage 3 -- Post-Run Implementation Trace Conformance (`TraceSpec.tla`)**: Feed real runtime execution logs (NDJSON event streams, D1 `jev_chat_logs`, Universal Bridge `postMessage` transcripts, or `yubiOS` boot/enrollment journals) back into a TLA+ trace specification (`TraceSpec.tla`) so TLC verifies that every observed transition in production or CI is a valid behavior of `Spec`.

## When to Use

- Replacing or upgrading a brittle manual/linear UI, API, or protocol testing cycle with exhaustive state-machine verification and trace-driven testing.
- Specifying and model-checking `/jev/` Agentic Coding & Design Workbench workflows (in-place file edits vs multi-file additions, Universal Bridge pre-boot/Rust load-hold queues, revision-acked workspace saves, pause/resume/close state resets).
- Specifying and verifying `yubiOS` security state machines (5-step attended YubiKey PIV/FIDO2 enrollment, TF-A -> OP-TEE fTPM -> U-Boot -> signed UKI boot chain, RPMB write-lock and eFuse ROTPK gates).
- Generating multi-step integration or browser (CDP) test suites automatically from a TLA+ specification via negated reachability predicates (`INVARIANT NotGoal`).
- Auditing real execution logs against a formal specification (`TraceSpec.tla`) to pinpoint the exact log index where an implementation diverged from its contract.

## When NOT to Use

- Purely arithmetic, real-analysis, or cryptographic primitive proofs over unbounded continuous domains without state-transition behavior -- route to Lean 4 (`papers/data/lean/`).
- Static syntax/type checking of TypeScript or Rust application code in isolation -- use `tsc`, `cargo check`, or `code-review-and-quality`.
- Runtime syscall/eBPF anomaly detection on a running Linux host -- route to `continuous-runtime-detection-falco`.

## Core TLA+ & PlusCal Architecture

### 1. Canonical TLA+ Specification Skeleton

Every TLA+ state machine defines a state space over state variables `vars`, an initial state predicate `Init`, a next-state action relation `Next` (relating unprimed current variables `v` to primed next-state variables `v'`), explicit `UNCHANGED` clauses for frame conditions, and optional fairness constraints:

```tla
---- MODULE ComponentSpec ----
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS MaxQueueLen, FileIds
VARIABLES mode, files, wasmState, holdQueue, rev

vars == <<mode, files, wasmState, holdQueue, rev>>

TypeOK ==
  /\ mode \in {"execute", "coding", "design"}
  /\ wasmState \in {"unloaded", "loading", "ready"}
  /\ Len(holdQueue) <= MaxQueueLen
  /\ rev \in Nat

Init ==
  /\ mode = "execute"
  /\ files = [f \in {} |-> {}]
  /\ wasmState = "unloaded"
  /\ holdQueue = <<>>
  /\ rev = 0

\* Atomic action definitions must assign or UNCHANGED every variable in vars
OpenDesign(targetApp) ==
  /\ mode \in {"execute", "coding"}
  /\ mode' = "design"
  /\ wasmState' = "loading"
  /\ UNCHANGED <<files, holdQueue, rev>>

QueueBridgeAction(msg) ==
  /\ mode = "design"
  /\ wasmState # "ready"
  /\ Len(holdQueue) < MaxQueueLen
  /\ holdQueue' = Append(holdQueue, msg)
  /\ UNCHANGED <<mode, files, wasmState, rev>>

WasmBecomeReady ==
  /\ mode = "design"
  /\ wasmState = "loading"
  /\ wasmState' = "ready"
  /\ UNCHANGED <<mode, files, holdQueue, rev>>

FlushHeldAction ==
  /\ mode = "design"
  /\ wasmState = "ready"
  /\ Len(holdQueue) > 0
  /\ holdQueue' = Tail(holdQueue)
  /\ rev' = rev + 1
  /\ UNCHANGED <<mode, files, wasmState>>

CloseWorkbench ==
  /\ mode \in {"coding", "design"}
  /\ mode' = "execute"
  /\ wasmState' = "unloaded"
  /\ holdQueue' = <<>>
  /\ UNCHANGED <<files, rev>>

Next ==
  \/ OpenDesign("gridcraft")
  \/ QueueBridgeAction("range.setValues")
  \/ WasmBecomeReady
  \/ FlushHeldAction
  \/ CloseWorkbench

Fairness ==
  /\ WF_vars(WasmBecomeReady)
  /\ WF_vars(FlushHeldAction)

Spec == Init /\ [][Next]_vars /\ Fairness

\* Safety Invariant: held actions never flush before WASM is ready
NoPrematureFlush ==
  (rev > 0 /\ mode = "design") => (wasmState = "ready")

\* Liveness Property: every queued bridge action eventually flushes if mode stays design
HoldQueueEventuallyDrains ==
  (mode = "design" /\ Len(holdQueue) > 0) ~> (Len(holdQueue) = 0 \/ mode = "execute")
====
```

### 2. TLC vs. Apalache Decision Matrix

| Dimension | TLC (`tlc2.TLC`) | Apalache (`apalache-mc`) |
|---|---|---|
| **Engine** | Explicit-state BFS (safety) + product-tableau DFS (liveness) | Symbolic Bounded Model Checking (BMC) compiled to Z3 SMT |
| **Type System** | Untyped dynamically evaluated TLA+ values | Static **Snowcat** type checker (`@type: ...;` annotations) |
| **Best For** | Exhaustive small finite models, concurrency interleavings, liveness (`~>`, `WF`, `SF`), fast shortest-path counterexamples | Wide integer/record parameters, symbolic initial states, 2-step **inductive invariant** proofs (`--init=IndInv --inv=IndInv --length=1`) |
| **CLI Invocation** | `java -XX:+UseParallelGC -cp tla2tools.jar tlc2.TLC -workers auto -deadlock -dumpTrace json trace.json -config Spec.cfg Spec.tla` | `apalache-mc check --inv=SafetyInv --length=12 Spec.tla` |
| **Exit Codes** | `0` = pass, `10` = assumption failed, `11` = deadlock, `12` = safety violation, `13` = liveness violation | `0` = pass, `12` = counterexample found (`counterexample.json` emitted) |

## Complete Corpus Reference Matrix

All 8 subtopic reference documents live in `yubi-OS/knowledge` under `skills/tlaplus/` (and mirrored in `yubi-OS/yubiOS` under `skills/tlaplus/`):

| # | Corpus Document | Primary Focus & Tooling |
|---|---|---|
| `01` | [`01-tlaplus-temporal-logic-and-spec-structure.md`](./01-tlaplus-temporal-logic-and-spec-structure.md) | Set theory, functions/records (`EXCEPT`), primed actions, `UNCHANGED`, stuttering `[Next]_vars`, `Spec == Init /\ [][Next]_vars /\ Liveness` |
| `02` | [`02-pluscal-algorithm-language-and-translation.md`](./02-pluscal-algorithm-language-and-translation.md) | PlusCal C/P-syntax, atomic label grain, `await`/`when`, `fair process`, procedures/macros, `pcal.trans` translation to TLA+ `pc`/`stack` |
| `03` | [`03-tlc-explicit-state-model-checker-and-cfg.md`](./03-tlc-explicit-state-model-checker-and-cfg.md) | TLC BFS/DFS internals, `.cfg` grammar (`SPECIFICATION`, `INVARIANT`, `PROPERTY`, `SYMMETRY`, `CONSTRAINT`, `VIEW`), CLI flags & exit codes |
| `04` | [`04-apalache-symbolic-model-checking-and-snowcat.md`](./04-apalache-symbolic-model-checking-and-snowcat.md) | Symbolic Z3 SMT translation, Snowcat `@type` annotations, bounded checking (`--length=k`), 2-step inductive invariant verification |
| `05` | [`05-safety-invariants-liveness-and-refinement-mappings.md`](./05-safety-invariants-liveness-and-refinement-mappings.md) | 4-layer invariant stack (`TypeOK`, `[]Safety`, `[][Action]_v`, `IndInv`), leads-to `P ~> Q`, `WF`/`SF`, `INSTANCE ... WITH` refinement mappings |
| `06` | [`06-model-based-testing-and-counterexample-trace-generation.md`](./06-model-based-testing-and-counterexample-trace-generation.md) | Negated-goal reachability (`INVARIANT NotGoal`), `-dumpTrace json`, compiling witness traces into automated CDP/Playwright/API test runners |
| `07` | [`07-implementation-trace-validation-and-conformance.md`](./07-implementation-trace-validation-and-conformance.md) | Checking live NDJSON/D1 logs against `TraceSpec.tla`, cursor stepping `l' = l + 1`, shadow variable reconstruction, pinpointing divergence |
| `08` | [`08-agentic-workbench-and-yubios-ci-tla-workflows.md`](./08-agentic-workbench-and-yubios-ci-tla-workflows.md) | Complete `JevWorkbenchSpec.tla` & `YubiOSBootEnrollSpec.tla` specs, 3-stage verification loop, and GitHub Actions CI gate wiring |

## Canonical Testing-Cycle & Conformance Workflows

### Workflow 1: Model-Based Test (MBT) Generation via Negated Reachability Invariants

Instead of hand-writing 5 linear test cases, define one reachability predicate per user/system scenario in `Spec.tla` and ask TLC to violate `NotGoal == ~Goal`:

```tla
\* Target scenario: user creates File A (.html), edits File A in place, then adds File B (.html)
Goal_EditThenAddSecondFile ==
  /\ Cardinality(DOMAIN files) = 2
  /\ \E f1, f2 \in DOMAIN files :
       /\ f1 # f2
       /\ files[f1].lang = "html"
       /\ files[f1].rev >= 2
       /\ files[f2].lang = "html"
       /\ files[f2].rev = 1

NotGoal_EditThenAddSecondFile == ~Goal_EditThenAddSecondFile
```

Run TLC with `INVARIANT NotGoal_EditThenAddSecondFile` and `-dumpTrace json witness.json`. TLC exits with code `12` and writes the shortest valid state/action sequence `witness.json` that achieves `Goal_EditThenAddSecondFile` while respecting every safety invariant (`NoSilentLanguageClobber`, `NoPrematureFlush`). Your test runner iterates over `witness.state`, executes each action against the live app/API (with human-speed pacing on CDP), and asserts the post-state predicates at every step.

### Workflow 2: Post-Run Implementation Trace Conformance (`TraceSpec.tla`)

After any test run or live session, export the recorded event trace (e.g. D1 `jev_chat_logs` + Universal Bridge telemetry or CI JSONL logs) to `trace.ndjson` and validate conformance:

1. Each NDJSON line records `{"event": "<ActionName>", "mode": "...", "rev": N, "files": [...], "wasmState": "..."}`.
2. `TraceSpec.tla` extends `ComponentSpec`, binds `TraceLog == ndJsonDeserialize("trace.ndjson")`, and steps `l \in 1..Len(TraceLog)+1`:
   ```tla
   TraceNext ==
     /\ l <= Len(TraceLog)
     /\ Next
     /\ MatchLoggedState(TraceLog[l])
     /\ l' = l + 1
   ```
3. Check `POSTCONDITION l > Len(TraceLog)` in TLC. If the implementation took an illegal transition at log entry `k` (for example, executing a bridge click while `wasmState = "loading"` or mutating `lang` from `"html"` to `"ts"`), TLC stops at `l = k` and prints the exact state diff.

## Anti-patterns

- **Writing linear tests without a state-machine model**: Testing 3 happy paths in isolation while leaving pause/resume, reload, mode-switch, and follow-up edit/add transitions unspecified.
- **Omitting `UNCHANGED` frame conditions**: Leaving a variable unconstrained in a TLA+ action lets it take arbitrary values in the next state (or causes TLC to report "variable is not assigned").
- **Combining `SYMMETRY` with Liveness (`PROPERTY`) in TLC**: Symmetry reduction quotient graphs can mask fair cycles; always disable `SYMMETRY` when checking `~>` or `WF`/`SF` properties.
- **Unbounded state variables in explicit-state TLC**: Monotonically incrementing `rev` or `Len(history)` without a `CONSTRAINT StateBound` (`rev <= MaxRev`) causes infinite state-space exploration.
- **Treating `CONSTRAINT` as an `INVARIANT`**: `CONSTRAINT` silently prunes states outside the bound; `INVARIANT` halts with an error when violated.

## Interaction with Other Skills

- **`test-driven-development`**: TLA+ supplies the formal state-space and trace-conformance layer above unit/integration TDD.
- **`browser-testing-with-devtools`**: Consumes witness traces generated by TLC (`-dumpTrace json`) to drive paced CDP verification on the `ubuntu` bridge.
- **`spec-driven-development`**: Any stateful protocol, workbench controller, or hardware enrollment flow should include a TLA+ state machine alongside its prose spec.
- **`tpm2-tools` / `yubikey-operations` / `arm-trusted-firmware-optee`**: `YubiOSBootEnrollSpec.tla` (Doc `08`) models the cross-boundary state transitions across YubiKey PIV/FIDO2, OP-TEE fTPM, RPMB write-lock, and UKI Secure Boot.

## Examples

### Example 1: Headless TLC Safety & Liveness Gate in CI

```bash
# Run TLC in headless mode against JevWorkbenchSpec.tla and verify exit code 0
java -XX:+UseParallelGC -cp tools/tla2tools.jar tlc2.TLC \
  -workers auto \
  -metadir /tmp/tlc-workbench \
  -deadlock \
  -dumpTrace json /tmp/tlc-workbench-trace.json \
  -config specs/tla/JevWorkbenchSpec.cfg \
  specs/tla/JevWorkbenchSpec.tla
```

### Example 2: Two-Step Inductive Invariant Proof with Apalache

```bash
# 1. Typecheck Snowcat annotations
apalache-mc typecheck specs/tla/YubiOSBootEnrollSpec.tla

# 2. Base case: Init => IndInv (length 0)
apalache-mc check --init=Init --inv=IndInv --length=0 specs/tla/YubiOSBootEnrollSpec.tla

# 3. Inductive step: IndInv /\ Next => IndInv' (length 1)
apalache-mc check --init=IndInv --inv=IndInv --length=1 specs/tla/YubiOSBootEnrollSpec.tla
```

### Example 3: Synthesizing a Multi-Step Workbench Test Trace

```bash
# Check negated reachability predicate NotGoal_EditThenAddSecondFile (exits 12 with witness JSON)
java -cp tools/tla2tools.jar tlc2.TLC \
  -dumpTrace json /tmp/tlc-witness-edit-add.json \
  -config specs/tla/Witness_EditThenAdd.cfg \
  specs/tla/JevWorkbenchSpec.tla || test $? -eq 12
```

## Guidelines

1. Always define `vars == <<...>>` and `TypeOK` first; include `INVARIANT TypeOK` in every `.cfg` file before checking domain invariants or liveness.
2. Bound every counter, sequence length, and model set with `CONSTANTS` and a `CONSTRAINT StateBound` in `.cfg` so explicit-state TLC terminates deterministically in seconds.
3. Keep `SYMMETRY` in a separate safety-only `.cfg` file; never enable `SYMMETRY` in a `.cfg` that checks temporal `PROPERTY` formulas.
4. For multi-step UI/workbench testing, generate the test trajectory from a TLA+ negated-goal witness trace (`Workflow 1`) and validate the recorded execution log after the run (`Workflow 2`) rather than relying on hand-scripted linear checks alone.
5. Ground TLA+/PlusCal syntax, CLI flags, and trace-validation patterns in the 8 corpus docs in `skills/tlaplus/01-*.md` through `08-*.md` (and `yubi-OS/knowledge/skills/tlaplus/`).

## Verification

- Every `.tla` specification passes `SANY` syntax/semantic parsing (`java -cp tla2tools.jar tla2sany.SANY Spec.tla`) with zero errors.
- Safety and liveness checks via `tlc2.TLC` return exit code `0` (zero invariant violations, zero deadlocks, zero temporal property violations).
- Negated-goal MBT runs return exit code `12` and emit a non-empty JSON witness trace that drives the target integration harness end-to-end.

## Changelog

- **2026-11-19**: Initial OpenAI 2.2 spec skill minted from the 8-doc Clef-weighted `tlaplus` corpus (`yubi-OS/knowledge` `skills/tlaplus/`, `87` weighted sources across `23` `/api/decide` calls) and paired synthesis reference `refs/tlaplus-formal-testing-2026-11-19.md`.
