# Program Without Control (PWC)

Status: conceptual doctrine  
As of: 2026-10-07  
Pairs with: [MISSION.md](MISSION.md), [ARCHITECTURE.md](ARCHITECTURE.md), [MITIGATE.md](MITIGATE.md), [SPEC.md](SPEC.md)

## The inherited model: program and control

Almost every security architecture in production is PAC: program and control. A program does the work. A separate control plane stands outside it, watches it, and intervenes when it drifts.

The pattern is everywhere once named:

- An init system supervises services and restarts the ones that die.
- An IAM layer stands between a caller and an API and decides each request.
- A host agent scans the filesystem and quarantines what it finds.
- A runtime policy engine intercepts syscalls and denies the ones the profile forbids.
- A maintainer reviews a pull request before it merges.

PAC is a reasonable default because it separates duties: the worker stays simple, the authority stays concentrated, and the two can be reasoned about independently. But it carries structural costs that its users rarely count.

1. **The controller is itself a program.** It runs on something, it must be patched, and it can be subverted, bypassed, or lied to. Every controller is a privileged target: take the controller and you take the system.
2. **The controller only sees its own vantage.** Anything outside its observation window (a race between check and use, a subresource it does not instrument, a path it does not hook) is uncontrolled in fact while controlled in the diagram.
3. **The controller converts a property into a procedure.** "The system is safe" becomes "the system is safe while the watcher is running, correctly, on a healthy host, with current rules." Stop the watcher and the property evaporates.

## The inverse claim

PWC: program without control. The name is deliberately provocative and the claim is precise: not a program without safety, a program without a *controller*. Control should not be an actor standing outside the program. Control should be a property of the program's construction.

Instead of a watcher who intervenes when the world goes wrong, build the world such that the wrong state cannot be reached, or such that reaching it is detected by the structure itself, at the moment of use, by an instrument that cannot be talked out of its verdict.

Three mechanisms carry it, in the order an adversary meets them:

### 1. Control by construction

The unsafe state does not exist to be reached. There is nothing for a controller to intervene on because there is no intervention to make: the writable surface was removed, the capability was never granted, the mutable alias was never created. Construction is the strongest form because it does not depend on any process behaving correctly at runtime.

### 2. Control by verification at use

The state is checked every time it is used, by the mechanism that does the using, not by a separate watcher. The check and the use are the same act. A poisoned byte does not get quarantined by an agent after the fact; it fails to read. Verification at use has no TOCTOU because there is no gap between the check and the thing checked.

### 3. Control by record

The state leaves evidence that cannot be silently rewritten. Nothing intervenes, and nothing needs to: the event is in an append-only ledger with enough structure that an independent auditor, human or machine, can reconstruct what happened and detect the lie. Record converts control from prevention into falsifiability. It is weaker than construction and verification, and it is the only one of the three that reaches what already happened.

## Where yubiOS already runs PWC

The doctrine is not new to this project; it is mostly a name for what the architecture already does:

- **dm-verity on `/usr`** (ADR-007, [SPEC.md](SPEC.md) principle 3): there is no file-integrity daemon watching the root filesystem. Verification lives in the read path itself. The control is the device-mapper mapping.
- **Composefs and the signed catalog**: the image is its own control. The catalog pins every file's digest and the mount refuses anything that does not match. No process compares hashes; the mount is the comparison.
- **Atomic A/B updates**: no controller watches an update for safety. The deployment either boots verified or the previous deployment is still there. Rollback is structural, not supervisory.
- **LUKS2 bound to FIDO2 hmac-secret** (ADR-011): update-survivability is achieved by construction. The disk key is bound to the token's secret, which updates cannot invalidate, so no controller is needed to re-bind anything after every update. The TPM-PCR alternative is PAC: a controller (the measurement policy) that must be re-tuned every time the measured world changes.
- **Build admission** ([yubiOS.rego](../yubiOS.rego)): the OPA/Rego gate is a filter, not a supervisor. It does not watch the build; it refuses to let the build start on unpinned or floating inputs (ADR-014/015, [PINNED.md](../PINNED.md)). Admission at the boundary replaces surveillance of the interior.

Each of these removed a watcher and kept the property. That is the doctrine in one sentence: **when you can move a control from a process into a structure, you must, because processes are attack surface and structures are not.**

## Where PAC stays mandatory

PWC dissolves the controller only where the controller would be a program. It never dissolves the owner.

- **Physical presence.** Disk unlock, login, and administrative identity require the YubiKey, its PIN, or its touch (ADR-003). The touch is a controller that no software can impersonate, and it is deliberately kept out of the program.
- **Irreversible operations.** Fuse burns, RPMB key writes, Secure Boot key enrollment: documented, rehearsed on sacrificial hardware, never automated past a human gate ([MISSION.md](MISSION.md)). These are PAC with a human as the controller, on purpose.
- **Recovery.** The recovery path is the designed exception to every controller-free mechanism, and it is held offline and separated from the credentials it recovers.
- **The firmware below the OS.** On x86-64, and today on most of ARM64, the lower firmware layers remain OEM-controlled: PAC we do not own and cannot dissolve. [MITIGATE.md](MITIGATE.md) names this honestly rather than pretending otherwise.

The test is judgment. Where staying safe requires judgment about the physical world, about irreversibility, or about intent, a controller is the honest choice, and on yubiOS that controller is the owner. Where staying safe is a matter of structure and verification, a controller is overhead and a target, and it should be dissolved.

## The cost of PWC, and what pays for it

A controller-free program has one structural weakness: when a load-bearing assumption breaks, no one is watching, because there is no one. PWC therefore has a mandatory second half.

**Evidence.** A controller-free mechanism must be observable enough that a broken assumption produces a detectable signal: a verification failure, a logged measurement, a build attestation that stopped matching, an audit trail an outsider can replay. The append-only record is not a nicety; it is the alarm that stands in for the watcher that no longer exists.

**Pinned assumptions.** Every structural control rests on assumptions (a kernel feature floor, a signer that behaves, a format that stays stable). Those assumptions are pins like any other input: named, dated, and re-checkable. A floor that silently shifts is a control that silently stopped. Assumptions drift in the direction of the repository's [PINNED.md](../PINNED.md) discipline: historical evidence is not a current pin.

**Honest scope.** A PWC claim is a claim about where the control moved, not about safety in the abstract. A doc or ADR that adopts a controller-free mechanism says which mechanism (construction, verification at use, or record) replaced the watcher, and what evidence proves the replacement still holds. PWC without a named mechanism is just ungoverned.

## When to reach for each model

| Situation | Model | Why |
| --- | --- | --- |
| The unsafe state can be made unreachable | PWC, by construction | No runtime dependency on anyone behaving |
| The state is reachable but foreign | PWC, by verification at use | No gap between check and use, so no TOCTOU |
| The state is legitimate but must not pass silently | PWC, by record | Falsifiability without a gatekeeper |
| The act is irreversible, physical, or requires intent | PAC, and the controller is the owner | Judgment is not a property of structure |

## Non-negotiables

- No controller-free mechanism ships without naming the structural mechanism that replaces the watcher.
- Evidence is not optional in PWC. It is the second half of the claim.
- The owner is never the component PWC dissolves.
- PAC is not a failure word. Where control requires judgment, PAC with a human controller is the correct and final answer, and dissolving it would be a regression.

---

*Control is a property of structure, not of supervision. Where structure can carry it, structure must. Where judgment is required, the controller is the owner, holding a key.*
