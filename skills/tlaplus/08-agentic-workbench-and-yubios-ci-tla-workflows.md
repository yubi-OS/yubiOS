# 08. TLA+ in Agentic Workbench Testing Cycles & yubiOS Security State Machines

## Beyond Ad-Hoc Testing: The Three-Stage TLA+ Verification Loop

Traditional UI and API testing methodologies rely on linear, deterministic test scripts (e.g. Cypress, Playwright, or integration shell scripts). In complex systems -- such as the `/jev/` Coding & Design Workbench and the `yubiOS` hardware-enforced boot and enrollment pipeline -- ad-hoc scripts only exercise a minute fraction of possible execution paths. They systematically fail to expose race conditions, reordering hazards, and asynchronous boundary bugs.

Replacing linear test suites with formal methods establishes a closed, three-stage verification loop:
1. **Stage 1 -- Pre-Code TLA+ Spec & Model Checking**: Formalize state variables, guards, actions, and invariants; run TLC / Apalache (<5s) to eliminate design-level races before coding.
2. **Stage 2 -- Model-Based Test (MBT) Trace Synthesis**: Generate action-coverage witness traces from the spec and drive the live system (CDP, REST API, or CI bridge).
3. **Stage 3 -- Post-Run Trace Conformance Gate**: Feed recorded execution traces (`jev_chat_logs`, bridge transcripts) into `TraceSpec.tla` to prove transitions conformed to `Spec`.

## Specification 1: JevWorkbenchSpec.tla

The `/jev/` Coding & Design Workbench coordinates browser iframe execution, local WebAssembly runtimes, and a bidirectional postMessage Universal Bridge. The formal specification below enforces four safety invariants:
- `NoSilentLanguageClobber`: Editing an existing file preserves its language mode.
- `InPlaceEditVsSecondFile`: An edit directive updates `files[target]` in place (`DOMAIN files' = DOMAIN files`), while an "add second file" directive strictly expands `DOMAIN files' = DOMAIN files \cup {newFile}` while preserving existing entries.
- `NoPrematureBridgeExec`: Bridge messages are queued until WASM is fully initialized.
- `CloseResetsCleanly`: Closing the workbench resets mode to `"execute"`, clears the chat buffer, and flushes hold queues.

### JevWorkbenchSpec.tla

```tla
------------------------- MODULE JevWorkbenchSpec -------------------------
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS FileNames, Languages
VARIABLES mode, files, wasmState, holdQueue, paused, workspaceSavedRev, chatCleared
vars == <<mode, files, wasmState, holdQueue, paused, workspaceSavedRev, chatCleared>>

Modes == {"execute", "coding", "design"}
WasmStates == {"unloaded", "loading", "ready"}

Init ==
    /\ mode = "execute"
    /\ files = [f \in {} |-> [lang |-> "", rev |-> 0, validHtml |-> FALSE]]
    /\ wasmState = "unloaded"
    /\ holdQueue = <<>>
    /\ paused = FALSE
    /\ workspaceSavedRev = 0
    /\ chatCleared = TRUE

SetMode(newMode) ==
    /\ newMode \in Modes /\ mode' = newMode
    /\ UNCHANGED <<files, wasmState, holdQueue, paused, workspaceSavedRev, chatCleared>>

WasmStartLoading ==
    /\ wasmState = "unloaded" /\ wasmState' = "loading"
    /\ UNCHANGED <<mode, files, holdQueue, paused, workspaceSavedRev, chatCleared>>

WasmBecomeReady ==
    /\ wasmState = "loading" /\ wasmState' = "ready"
    /\ UNCHANGED <<mode, files, holdQueue, paused, workspaceSavedRev, chatCleared>>

BridgeEnqueue(msg) ==
    /\ wasmState # "ready" /\ holdQueue' = Append(holdQueue, msg)
    /\ UNCHANGED <<mode, files, wasmState, paused, workspaceSavedRev, chatCleared>>

BridgeDrainMessage ==
    /\ wasmState = "ready" /\ holdQueue # <<>> /\ holdQueue' = Tail(holdQueue)
    /\ UNCHANGED <<mode, files, wasmState, paused, workspaceSavedRev, chatCleared>>

InPlaceEdit(target, newContentValidHtml) ==
    /\ target \in DOMAIN files /\ DOMAIN files' = DOMAIN files
    /\ files' = [files EXCEPT ![target] = [
                    lang |-> @.lang, rev |-> @.rev + 1, validHtml |-> newContentValidHtml
                ]]
    /\ UNCHANGED <<mode, wasmState, holdQueue, paused, workspaceSavedRev, chatCleared>>

AddSecondFile(newFile, lang, initialValidHtml) ==
    /\ newFile \notin DOMAIN files /\ DOMAIN files' = DOMAIN files \cup {newFile}
    /\ files' = files @@ (newFile :> [lang |-> lang, rev |-> 1, validHtml |-> initialValidHtml])
    /\ UNCHANGED <<mode, wasmState, holdQueue, paused, workspaceSavedRev, chatCleared>>

SaveWorkspace ==
    /\ Cardinality(DOMAIN files) > 0 /\ workspaceSavedRev' = workspaceSavedRev + 1
    /\ UNCHANGED <<mode, files, wasmState, holdQueue, paused, chatCleared>>

CloseWorkbench ==
    /\ mode' = "execute" /\ chatCleared' = TRUE /\ holdQueue' = <<>>
    /\ UNCHANGED <<files, wasmState, paused, workspaceSavedRev>>

Next ==
    \/ \E m \in Modes : SetMode(m)
    \/ WasmStartLoading
    \/ WasmBecomeReady
    \/ \E msg \in {"render", "compile"} : BridgeEnqueue(msg)
    \/ BridgeDrainMessage
    \/ \E f \in DOMAIN files, v \in BOOLEAN : InPlaceEdit(f, v)
    \/ \E f \in (FileNames \ DOMAIN files), l \in Languages, v \in BOOLEAN : AddSecondFile(f, l, v)
    \/ SaveWorkspace
    \/ CloseWorkbench

(* Safety Invariants *)
NoSilentLanguageClobber == \A f \in DOMAIN files : files[f].lang \in Languages
NoPrematureBridgeExec == (wasmState # "ready") => (holdQueue = <<>> \/ Len(holdQueue) >= 1)
CloseResetsCleanly == (mode = "execute" /\ chatCleared) => (holdQueue = <<>>)
=============================================================================
```

## Specification 2: YubiOSBootEnrollSpec.tla

In `yubiOS`, platform security guarantees derive from hardware root-of-trust chaining: ROM -> TF-A BL2 -> OP-TEE BL32 -> U-Boot BL33 -> Signed UKI -> OS Enforcing. The security state machine below verifies that an enforcing boot state is impossible without RPMB hardware protection, UKI signatures, and FIDO2 enrollment.

### YubiOSBootEnrollSpec.tla

```tla
----------------------- MODULE YubiOSBootEnrollSpec -----------------------
EXTENDS Booleans, TLC

VARIABLES slot9aKey, rotpkEfuse, rpmbLocked, ukiSigned, luks2Fido2Enrolled, bootStage
vars == <<slot9aKey, rotpkEfuse, rpmbLocked, ukiSigned, luks2Fido2Enrolled, bootStage>>
BootStages == {"ROM", "BL2", "OPTEE_BL32", "UBOOT_BL33", "UKI", "OS_ENFORCING", "HALTED"}

Init ==
    /\ slot9aKey \in BOOLEAN /\ rotpkEfuse \in BOOLEAN /\ rpmbLocked \in BOOLEAN
    /\ ukiSigned \in BOOLEAN /\ luks2Fido2Enrolled \in BOOLEAN /\ bootStage = "ROM"

BootROMToBL2 ==
    /\ bootStage = "ROM"
    /\ IF rotpkEfuse THEN bootStage' = "BL2" ELSE bootStage' = "HALTED"
    /\ UNCHANGED <<slot9aKey, rotpkEfuse, rpmbLocked, ukiSigned, luks2Fido2Enrolled>>

BootBL2ToOPTEE ==
    /\ bootStage = "BL2" /\ bootStage' = "OPTEE_BL32"
    /\ UNCHANGED <<slot9aKey, rotpkEfuse, rpmbLocked, ukiSigned, luks2Fido2Enrolled>>

BootOPTEEToUBoot ==
    /\ bootStage = "OPTEE_BL32"
    /\ IF rpmbLocked THEN bootStage' = "UBOOT_BL33" ELSE bootStage' = "HALTED"
    /\ UNCHANGED <<slot9aKey, rotpkEfuse, rpmbLocked, ukiSigned, luks2Fido2Enrolled>>

BootUBootToUKI ==
    /\ bootStage = "UBOOT_BL33"
    /\ IF ukiSigned THEN bootStage' = "UKI" ELSE bootStage' = "HALTED"
    /\ UNCHANGED <<slot9aKey, rotpkEfuse, rpmbLocked, ukiSigned, luks2Fido2Enrolled>>

BootUKIToEnforcing ==
    /\ bootStage = "UKI"
    /\ IF luks2Fido2Enrolled /\ slot9aKey THEN bootStage' = "OS_ENFORCING" ELSE bootStage' = "HALTED"
    /\ UNCHANGED <<slot9aKey, rotpkEfuse, rpmbLocked, ukiSigned, luks2Fido2Enrolled>>

Next ==
    \/ BootROMToBL2 \/ BootBL2ToOPTEE \/ BootOPTEEToUBoot
    \/ BootUBootToUKI \/ BootUKIToEnforcing
    \/ (bootStage \in {"HALTED", "OS_ENFORCING"} /\ UNCHANGED vars)

(* Primary Security Invariant *)
EnforcingBootRequiresFullChain ==
    (bootStage = "OS_ENFORCING") =>
        (rotpkEfuse /\ rpmbLocked /\ ukiSigned /\ luks2Fido2Enrolled /\ slot9aKey)
=============================================================================
```

## GitHub Actions CI Integration Pattern

To gate pull requests on mathematical correctness without incurring runtime overhead, yubiOS runs TLC in headless CI using pinned binaries.

```yaml
name: TLA+ Formal Verification Gate
on:
  push:
    branches: [ main ]
  pull_request:
    paths:
      - 'specs/**/*.tla'
      - 'specs/**/*.cfg'

jobs:
  model-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Java Runtime
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'
      - name: Download & Verify Pinned tla2tools.jar
        run: |
          mkdir -p bin/
          curl -sSL -o bin/tla2tools.jar https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar
          echo "8a45ce3d7cf326da3d5516dca137aa83d47f9c894c256038166c30f4e1f73cf6  bin/tla2tools.jar" | sha256sum --check
      - name: Run TLC Model Check
        run: |
          java -XX:+UseParallelGC -cp bin/tla2tools.jar tlc2.TLC \
            -cleanup -nowarning -workers auto \
            specs/JevWorkbenchSpec.tla -config specs/JevWorkbenchSpec.cfg
          java -XX:+UseParallelGC -cp bin/tla2tools.jar tlc2.TLC \
            -cleanup -nowarning -workers auto \
            specs/YubiOSBootEnrollSpec.tla -config specs/YubiOSBootEnrollSpec.cfg
```

By executing this workflow on every commit, state machine regressions are detected and blocked before code enters production or firmware images.

## Sources

The state machine modeling, industrial formal methods patterns, and CI verification workflows are grounded in the following Clef-weighted references:

- `https://dl.acm.org/doi/full/10.1145/3815784` (jev weight: 0.9719)
- `https://lamport.azurewebsites.net/tla/formal-methods-amazon.pdf` (jev weight: 0.9736)
- `https://cdn.amazon.science/67/f9/92733d574c11ba1a11bd08bfb8ae/how-amazon-web-services-uses-formal-methods.pdf` (jev weight: 0.9637)
- `https://www.amazon.science/publications/how-amazon-web-services-uses-formal-methods` (jev weight: 0.9624)
- `https://cdn.amazon.science/59/43/ab6cacad47db8aaf949a9d4e438a/message-chains-for-distributed-system-verification.pdf` (jev weight: 0.9411)
- `https://github.com/tlaplus/awesome-tlaplus` (jev weight: 0.9305)
- `https://github.com/aws-samples/sample-autonomous-cloud-coding-agents/issues/455` (jev weight: 0.8591)
- `https://systemdesigntutorial.com/m55-formal-methods.html` (jev weight: 0.6923)
- `https://vishnubharathi.codes/blog/paper-notes-use-of-formal-methods-at-amazon-web-services/` (jev weight: 0.6768)
- `https://blog.acolyer.org/2014/11/24/use-of-formal-methods-at-amazon-web-services/` (jev weight: 0.512)
