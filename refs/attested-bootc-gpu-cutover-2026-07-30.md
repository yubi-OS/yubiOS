# Attested bootc→libvirt→GPU cutover: prior art & novelty verdict

**Date:** 2026-07-30
**Source:** parallel-deep-research (3 streams: deep-dive on synthesis, per-component prior art, comparative + novelty verdict)
**Internal prior art checked:** yubiOS ADR-031 (mechanism), ADR-033 (runtime policy), PR #137 (CI proof), OMN-108 (parent issue), `refs/vgpu-vfio-user-trust-boundary-2026-07-25.md` (three-layer foundation), `refs/adr-033-prior-art-search-2026-07-28.md` (14 sources for behavioral)
**Verdict:** **BORDERLINE** — policy layer has genuine novelty; §103 KSR (A)+(E) buildable from CoCo + ADR-031

## TL;DR

The synthesis crystallized from a 11-turn Duck.ai conversation: **digest-pinned bootc container → qemu/libvirt GPU mediation cutoff → resource gating at the hypervisor boundary, as ONE end-to-end attested cutover pipeline.** All three subagents converge on BORDERLINE.

- **Mechanism layer:** established (ADR-031 + external Kata/CoCo/NVIDIA VFIO)
- **Trigger layer:** borderline (image attestation evaluated at *libvirt launch* not at K8s admission — thin novelty)
- **Policy layer:** genuinely novel (no reviewed source binds vfio-user-mediated GPU reachability to bootc-image attestation evaluated at libvirt boundary *without* a TEE)

**Recommendation:** extend ADR-031 with a new rule that makes boot-time image attestation the pre-launch trigger at the existing boundary. Don't file a parallel ADR. If the team rejects extension, file a new OMN issue as a child of OMN-108 (the GPU trust boundary parent — sibling to OMN-144..147).

## 1. Architectural definition

### 1.1 One-sentence problem statement
How might we tie **bootc image integrity → libvirt policy evaluation → mediated GPU cutover**, so a guest can boot only with verified provenance AND get a GPU only after policy pass?

### 1.2 The three claims (C1, C2, C3)
| # | Claim | What it proves |
|---|---|---|
| **C1** | bootc-OCI image digest is the one the policy approved | Build-time provenance from trusted builder, image not tampered |
| **C2** | Launch measurement (PCR/RTMR replay) matches the reference for that image | The guest that booted IS this image |
| **C3** | GPU device binding (vfio-user socket or vfio-pci IOMMU group) is the one allowed | The device the guest sees is the one policy admits |

### 1.3 Single policy object (BAP — Boot Admission Policy)
A signed Rego/CUE document naming (a) the expected bootc image digest (C1), (b) the expected PCR/RTMR replay for that digest (C2), and (c) the set of allowed GPU binding claims (C3). Lives in a Reference Value Provider Service (Trustee RVPS / Keylime), keyed by workload identity. The libvirt `qemu` hook chain consults the BAP evaluator at three points — pre-launch, post-measurement, pre-GPU-bind — and refuses to advance on a denial at any stage.

### 1.4 Cutover sequencing
Cutover is **policy-gated, not launch-order-gated.** GPU binding is the last thing that happens. Two failure modes prevented:

1. **GPU-before-verify** (today's default in libvirt domain XML)
2. **Verify-but-GPU-stale** (IOMMU mapping persists across guest teardown)

```
launch policy:    C1 only              → pre-launch   (cosign verify-attestation on OCI digest)
admission policy: C1 ∧ C2             → post-launch  (PCR replay + image digest bind in init-data)
cutover policy:   C1 ∧ C2 ∧ C3        → pre-device-bind (vfio-user connect / vfio-pci attach)
```

### 1.5 ASCII flow diagram

```
                          (host)                                    (guest)
+------------------------------------------------------------------------------------+
|                                                                                    |
|  OCI registry        libvirt hook chain                  vfio-user / vfio-pci     |
|  +-----------+       +--------------------------+        +------------------+     |
|  | bootc     |       |  pre-launch   admit/deny  |        |  virtio-gpu      |     |
|  | image     |  C1   |  1. cosign     (BAP-C1)   |        |  / vfio-user-pci |     |
|  | :sha256   +------>|     verify-attest         |        |  / vfio-pci      |     |
|  | + cosign  |       |           |               |        |                  |     |
|  |   sig     |       |           v               |        |                  |     |
|  | + SLSA    |       |  qemu starts, PCRs replay |  C2    |                  |     |
|  |   prov    |       |  2. KBS/AS check  (BAP-C2)|------->|  kernel boots,   |     |
|  +-----------+       |           |               |        |  measures rootfs |     |
|                      |           v               |        |  (IMA/UKI PCR10) |     |
|  Reference Value     |  guest runs WITHOUT GPU    |        |                  |     |
|  Provider Service    |  3. KBS resource check     |  C3    |                  |     |
|  (Trustee RVPS)      |     (BAP-C3, init-data    |------->|  GPU binds NOW    |     |
|  +-----------+       |      hash + signed        |        |  via vfio-user or |     |
|  | BAP Rego/CUE                                                vfio-pci   |     |
|  |  - approved-digests[]                                             |        |     |
|  |  - PCR-policy{}                                                  |        |     |
|  |  - gpu-binding-claim{}                                           |        |     |
|  +-----------+       +--------------------------+        +------------------+     |
|                                                                                    |
+------------------------------------------------------------------------------------+
```

## 2. Per-component prior art

### 2.1 Component A — Digest-pinned bootable containers
**Canonical:** SLSA v1.0 provenance predicate `https://slsa.dev/provenance/v1` + cosign `slsaprovenance1` attestation type + BuildKit `--rewrite-timestamp` for reproducibility.

**State of the art (Q3 2026):**
- Fedora Image Mode Phase 2 (2026) converges Fedora CoreOS, IoT, Atomic Desktops onto bootc-derived pipeline; production target F45 (~Dec 2026)
- RHEL 10 bootc documented June 2026
- yubiOS already does this: `yubiOS-ci.yml` `merge-manifest` job attaches SLSA provenance + SBOM to `0mniteck/yubios` per PROJECT_RULES.md L22

**Open problems:** reproducibility not default, SLSA L3 hardening (multi-tenant isolation), build-vs-boot evidence gap (SLSA covers build; UKI PCR events cover boot; not natively unified).

### 2.2 Component B — QEMU/libvirt GPU mediation
**Canonical:** Linux VFIO mediated device (mdev) sysfs API + QEMU vfio-user protocol.

**State of the art (Q3 2026):**
- QEMU 10.1 (Q2 2026) merged vfio-user client (`VFIO_USER_DEVICE_FEATURE` added April 2026)
- Nutanix libvfio-user is canonical server library
- Intel GVT-g **archived** Oct 3 2024 — Intel iGPU virtualization path is SR-IOV-only
- NVIDIA moved Ada/Hopper/B200 off mdev to vendor-specific VFIO framework
- yubiOS ADR-031: virtio-gpu default, vfio-user preferred (PR #137 merged)

**Open problems:** vendor fragmentation, live migration across mdev/vfio-user boundary partially solved, cross-host vfio-user (AF_INET) auth deferred, GVT-g archive leaves Broadwell–Comet Lake stranded.

### 2.3 Component C — Attestation-based resource gating
**Canonical (three coexisting stacks):**
1. Linux IMA + dm-verity + TPM PCRs (in-kernel)
2. AWS Nitro Enclaves PCR→KMS condition keys
3. Confidential Containers (CNCF) EAR/AR4SI + Trustee three-policy model

**State of the art (Q3 2026):**
- EAR/AR4SI is dominant wire format (8 trust facets, numerical trust claims 0–2)
- Init-Data (TDX `mrconfigid`/`mrowner`; SEV-SNP `HostData`) is the canonical "carry policy intent into TEE" channel
- Composite CPU+GPU attestation: Intel Trust Authority + NVIDIA NRAS is the canonical pair
- yubiOS ADR-031/033: runtime misbehavior cutoff policy only

**Open problems:** cross-vendor composite EAT verification immature, custom policy authoring experimental, IMA→TPM→remote-verifier stitching is manual, Nitro cert expiry kills enclave at start, Nitro debug-mode produces all-zero PCRs.

### 2.4 Component intersections (signals only, not synthesis)

- **A ∩ C exists:** SLSA build + dm-verity root hash measured into IMA → boot PCR. Parallel chains, not natively unified.
- **B ∩ C exists** for confidential GPU: NVIDIA H100 NRAS attestation gates readiness via `nvidia-smi conf-compute -srs 1`. This is GPU attestation ↔ policy release, not GPU mediation ↔ policy release.
- **A ∩ B exists** via bcvk (bootc-virtualization-kit). Hand-built, not natively composed.
- **A ∩ B ∩ C: no canonical reference as of Q3 2026.** Closest existing artifacts: NVIDIA H100 confidential-compute reference architecture (composes A+C implicitly via CVM boot images), Fedora Image Mode Phase 2 (composes A without B or C). **No observed deployment chains digest-pinned bootc → vfio-user mediated GPU → IMA/TDX/SEV-SNP attestation gate end-to-end.**

## 3. Synthesis combinations found

### 3.1 Closest cousin: Confidential Containers + NVIDIA nvtrust + Trustee
- Covers C2 (launch measurement) + C3 (GPU binding) fused into single Trustee policy chain
- KBS releases GPU-binding claim as a *resource* on affirming TCB
- **Gap:** does NOT cover C1 in the bootc-image-digest sense. CoCo's chain of trust is anchored to Kata agent policy hash (init-data), not OCI-image digest. CoCo issue [#54](https://github.com/confidential-containers/confidential-containers/issues/54) (open since 2024) is the unresolved workload-identity debate.

### 3.2 bootc + Keylime (bcvk + measured boot)
- Covers C1 + C2 cleanly, with libvirt/QEMU as launch surface
- **Gap:** GPU cutover is unconditional. Nothing gates vfio binding on attestation result.

### 3.3 Tendril / Bazzite-tower / similar
- C3 (vfio binding) only, no C1 or C2

### 3.4 What is NOT in any of them
- A single policy object that names (a) bootc image digest, (b) PCR/RTMR replay for that digest, AND (c) the GPU binding claim — all three signed and bound to a workload identity
- A "GPU is the last thing visible" cutover model. CoCo's GPU cutover happens at pod-admission (early), not at vfio-bind (late). CoCo's threat model trusts the TCB once TDX/SNP quote passes; it does not separately attest the GPU binding. **This is the gap the synthesis fills.**

## 4. Comparative analysis

### 4.1 Coverage matrix

| System | bootc / image-mode | Image attestation | Libvirt policy eval | vfio-user mediation | Mediated GPU as policy gate | Boot-time cutover (no TEE) |
|---|---|---|---|---|---|---|
| **yubiOS ADR-031** | ✓ | ⚠ (SLSA attached, not evaluated) | ⚠ (gate is operator-set) | ✓ | ⚠ (gate fires on host IOMMU + operator policy, NOT image attestation) | ✗ |
| **yubiOS ADR-033** (proposed) | ✓ | ✗ | ✗ | ✓ | ⚠ (RUNTIME misbehavior trigger) | ✗ (runtime, not boot) |
| **Kata Containers** | ✗ | ✓ | ✓ | ✗ (vfio-pci) | ⚠ (TEE-mediated) | ✗ (requires TEE) |
| **Confidential Containers** | ⚠ | ✓ | ✓ | ✗ (vfio-pci) | ✓ (composite attestation gates VFIO passthrough) | ✗ (requires TEE) |
| **SEV-SNP / TDX VMs** | ⚠ | ✓ | ✓ | ✗ | ✗ (gates secrets, not devices) | ✗ (TEE-only) |
| **Nitro Enclaves** | ✗ | ⚠ | ✗ | ✗ | ✗ | ✗ (TEE-only) |
| **gVisor** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Qubes OS** | ✗ | ✗ | ✓ (RPC) | ⚠ (vfio-pci permissive) | ⚠ (PCI reset is the security primitive) | ✗ |
| **SLSA / Sigstore / Kyverno** | ✓ | ✓ | ✓ (K8s admission, not libvirt) | ✗ | ✗ | ✗ (admission-time) |

**Key observation:** No existing system simultaneously covers all 7 columns. The TEE-required systems (CoCo, Kata, SEV-SNP/TDX) cover most columns; the TEE-free systems (SLSA/Kyverno, ADR-031) cover only partial subsets.

## 5. Novelty verdict (Graham v. John Deere adapted)

### 5.1 Layer decomposition

| Layer | Verdict | Justification |
|---|---|---|
| **Mechanism** | NOT NOVEL | ADR-031 + external Kata/CoCo/NVIDIA VFIO establish vfio-user mediation; PR #137 proves mechanism in CI |
| **Trigger** | BORDERLINE | SLSA + bootc digest pin covers trigger substance; the *specific* evaluation point (libvirt launch, not K8s admission) is thin novelty |
| **Policy** | NOVEL | No reviewed source binds vfio-user-mediated GPU reachability to bootc-image attestation evaluated at libvirt boundary *without* a TEE |

### 5.2 Internal prior art cited
- **ADR-031** (commit `67c740c`, 2026-07-26) — covers mechanism; does NOT cover image-attestation trigger
- **ADR-032** (2026-07-29) — kernel+rootfs split; covers image provenance at distribution surface; does NOT cover libvirt launch-time gate
- **ADR-033** (Proposed, 2026-07-30) — runtime misbehavior cutoff; covers runtime policy; does NOT cover boot-time trigger
- **PR #137** (merged 2026-07-26) — proves mechanism in CI via `ci_test-vgpu-vm.yml`
- **OMN-108** — Linear parent of OMN-144..147 (the misbehavior cutoff cluster). **The natural slot for boot-time trigger.**
- `refs/vgpu-vfio-user-trust-boundary-2026-07-25.md` — three-layer analysis (161 lines)
- `refs/adr-033-prior-art-search-2026-07-28.md` — 14 cited sources; established coverage for mechanism

### 5.3 External prior art cited (key sources only)
- [Confidential Containers policies](https://confidentialcontainers.org/docs/attestation/policies/) — KBS resource policy, EAR token evaluation
- [NVIDIA CoCo reference architecture](https://docs.nvidia.com/datacenter/cloud-native/confidential-containers/latest/overview.html) — composite CPU+GPU attestation, NVIDIA GPU Operator
- [Kata Containers GPU passthrough](https://kata-containers.github.io/kata-containers/use-cases/NVIDIA-GPU-passthrough-and-Kata-QEMU/) — uses vfio-pci (not vfio-user)
- [SLSA attestation at admission (Kyverno)](https://www.systemshardening.com/articles/cicd/slsa-attestation-admission-verification/) — admission-time gate, K8s layer
- [Qubes OS sys-gui-gpu](https://doc.qubes-os.org/en/latest/user/advanced-topics/gui-domain.html) — PCI reset is the security primitive
- [QEMU firmware digest metadata patch](https://lists.libreplanet.org/archive/html/qemu-devel/2026-01/msg04627.html) — firmware digests (not container image)

### 5.4 Graham factor analysis
- **Scope of prior art:** Vast — CoCo, SLSA, ADR-031 each cover a slice
- **Differences from prior art:** Specific combination (bootc digest + SLSA evaluated at libvirt launch, gating vfio-user, no TEE) is not in any reviewed source
- **Level of ordinary skill (PHOSITA):** Obvious-to-try for a confidential-computing engineer reading ADR-031 + CoCo + SLSA
- **Secondary considerations:** No published evidence of long-felt need *specific to this slice*

### 5.5 KSR rejection rationales
| Rationale | Buildable? |
|---|---|
| (A) Combining prior art elements | **Yes (primary risk)** |
| (B) Simple substitution | Partially |
| (C) Known technique → similar device | Yes |
| (D) Known technique → known device ready for improvement | **Yes** |
| (E) Obvious to try | **Yes** |
| (F) Known work in one field prompting variations | Yes |

**At least 4 of 6 KSR rationales (A, C, D, E) are strongly buildable.** §103 rejection profile of BORDERLINE.

### 5.6 Final verdict
**BORDERLINE.** Mechanism layer established; trigger layer borderline; policy layer novel. §103 KSR buildable from CoCo + ADR-031. **Worth expanding ONLY if secondary considerations (long-felt need, customer/regulator demand, documented AI/ML supply-chain attack) can be cited.**

## 6. What this means for yubiOS

### 6.1 Primary path: extend ADR-031, don't file parallel ADR

Add a new rule to ADR-031 (between current rules 2 and 3, or as rule 7):

> "Before a libvirt-class launcher may attach a PCI GPU to a yubiOS guest, the gate must additionally confirm the bootc OCI image digest matches a pinned reference digest and the attached SLSA provenance attestation is verified against the expected builder-id."

The rule's honesty note carries forward from ADR-031: enforcement is software-only (no TEE required). The existing `ci_test-vgpu-vm.yml` matrix can be extended with a `YUBIOS_ATTESTED=1` leg to prove the gate.

**Why extend ADR-031 instead of filing a new ADR:**
1. PROJECT_RULES L92-93: "ADR-031 settled the mechanism; the policy that decides when to invoke the boundary is not in ADR-031" — extension is the documented home
2. Synthesis mechanism is unchanged from ADR-031; only policy rule is new. ADR extensions are the right primitive for "new rule under existing decision"
3. The misbehavior-cutoff V5 explicitly dropped the parallel-ADR approach for this reason
4. OMN-147 (runtime trigger) is downstream; this boot-time trigger is upstream and orthogonal

### 6.2 Alternative path (if team rejects extension)
File new OMN issue titled "Boot-time image attestation as ADR-031 policy gate trigger" as child of **OMN-108** (GPU trust boundary parent — sibling to OMN-144..147). Pair with this doc as audit trail.

### 6.3 Kill-criteria
If secondary considerations cannot be cited (no concrete demand, no regulator requirement, no documented AI/ML supply-chain attack requiring this slice), verdict downgrades to NOT-NOVEL and the work parks under OMN-149 (post-launch GPU work per `docs/FUTURE.md`).

### 6.4 Do NOT
- Extend ADR-033. ADR-033 is runtime misbehavior; mixing boot-time image attestation in conflates two trigger surfaces.
- File as new ADR. Creates parallel-track decision; V5 misbehavior-cutoff explicitly dropped this.
- Duplicate the `drm-gpu-quota-secure-time` SMC-mailbox path. The synthesis is policy-gated cutover, not hard SMC cutoff. The SMC path is complementary, not overlapping.

## 7. v0 staged implementation

If the team proceeds:
- **(a) C1 only** (cosign on bootc image) — already shipped in `yubiOS-ci.yml` `merge-manifest` job
- **(b) C2 only** (Keylime measured-boot policy + bcvk integration)
- **(c) C3** (libvirt `qemu` hook + Trustee-shaped BAP evaluator)

Each stage independently shippable; combined gives the synthesis.

## 8. Open questions (carry-forward)

1. **Workload identity shape** — libvirt-domain UUID, bootc image digest, CoCo-style `init-data` hash, or all three? (CoCo #54 is the live debate)
2. **Reference value store** — Trustee RVPS or custom Keylime refstate? Keylime is leaner; Trustee more policy-expressive
3. **Init-data binding for vfio-user** — vfio-user has no signed-binding surface today; needs protocol extension or libvirt domain XML as binding artifact (weaker)
4. **Bypass policy for virtio-gpu** — ADR-031 makes virtio-gpu the default; if C2 fails, guest gets virtio-gpu fallback. Threat-model-dependent
5. **Replay protection** — bootc images upgrade atomically; how does BAP-C2 reference roll forward (per-build? per-tag? per-policy-window?)
6. **Auditability** — C1/C2/C3 must be loggable in tamper-evident store. Use fTPM event log (`ftpm-optee-tpm` skill) or CISA-aligned audit/evidence primitive (`internal-big-picture` primitive 7)

## 9. Sources

Full source lists are preserved in each stream's report (3 parallel subagent reports in `session/subagents/`).

### Internal (yubi-OS/yubiOS)
- [docs/ADR.md ADR-031](https://github.com/yubi-OS/yubiOS/blob/main/docs/ADR.md) (lines 775-799)
- [docs/ADR.md ADR-032](https://github.com/yubi-OS/yubiOS/blob/main/docs/ADR.md) (lines 800-840)
- [docs/ADR.md ADR-033](https://github.com/yubi-OS/yubiOS/blob/main/docs/ADR.md) (lines 841-902)
- [refs/vgpu-vfio-user-trust-boundary-2026-07-25.md](https://github.com/yubi-OS/yubiOS/blob/main/refs/vgpu-vfio-user-trust-boundary-2026-07-25.md)
- [refs/adr-033-misbehavior-cutoff-policy-2026-07-28.md](https://github.com/yubi-OS/yubiOS/blob/main/refs/adr-033-misbehavior-cutoff-policy-2026-07-28.md)
- [refs/adr-033-prior-art-search-2026-07-28.md](https://github.com/yubi-OS/yubiOS/blob/main/refs/adr-033-prior-art-search-2026-07-28.md)
- `memory/github-yubios-KS9n5GAT/PROJECT_RULES.md` — "GPU trust boundary baseline" + "Downstream cluster — misbehavior-triggered PCI-mediation cutoff"
- Skills: `drm-gpu-quota-secure-time` (closest cousin), `bcvk-virtualization`, `bootc-images`, `slsa-provenance`, `rootless-container-builds`, `docker-build-policy`

### External (key sources only; full lists in each stream)
- **Synthesis combinations:** CoCo + nvtrust + Trustee, Keylime + bcvk + cosign, Tendril, Bazzite-tower, Nova secure boot, CoCo issue #54
- **Per-component:** SLSA v1.0, Fedora Image Mode Phase 2, bootc-dev, mkosi, NVIDIA vGPU 17+, AMD MxGPU, Intel GVT-g archive, QEMU vfio-user spec, Linux VFIO mdev docs, IMA, Trustee architecture, Nitro Enclaves, Intel Trust Authority, NVIDIA NRAS, AR4SI, CoCo policies
- **Comparative:** CoCo policies, NVIDIA CoCo ref arch, Kata GPU passthrough, SLSA at admission, Qubes sys-gui-gpu, Secureblue-sealed



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
