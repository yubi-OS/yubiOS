# ADR-033 — Prior-art search: behavioral cut-off of AI/ML workloads via PCI device mediation

Date: 2026-07-28
Linear: OMN-145 (companion to OMN-144 ADR proposal, OMN-146 scope decision, OMN-147 trigger model)
Parent draft: `refs/adr-033-misbehavior-cutoff-policy-2026-07-28.md` ([SOLO] ideation, Variation 3 finalist)
Established context: ADR-031 (GPU trust boundary — virtio-gpu default, vfio-user preferred, IOMMU-gated PCI passthrough). The mediation **mechanism** is already decided; this prior-art search covers the **policy** that decides when to invoke it. Hardware enforcement of the IOMMU gate is post-launch per the ADR-031 honesty note.

## Scope of the search

ADR-033 proposes a 4-tier severity ladder (INFO → WARN → THROTTLE → SEVER) where misbehavior observed by the vfio-user server escalates through tiers, each tier capturing the prior tier's state for forensic preservation. The four assumptions to validate (per the [SOLO] draft):

- **A1.** Misbehavior can be detected from a vfio-user-server-side observer without seeing model internals.
- **A2.** VM state can be snapshotted at SEVER without losing the GPU's pending work.
- **A3.** Operators will respond to a SEVER alert within the model-state-preservation window.
- **A4.** The severity ladder is monotonic — a higher tier is never triggered without a lower one being captured first.

The prior-art search focused on three mechanism families: **vfio-user** (the userspace device server we already chose in ADR-031), **VFIO mdev** (kernel-mediated, vendor-driver), and **NVIDIA vGPU / SR-IOV / MIG** (commercial GPU partitioning). For each family: what behavioral triggers exist, what policy engines exist, how do they handle escalation and forensic state capture, and what gaps remain for ADR-033's specific design.

## Sources

### A. vfio-user protocol specification (QEMU, libvfio-user)

- **Spec landing page:** <https://www.qemu.org/docs/master/interop/vfio-user.html>
- **QEMU source docs/system/devices/vfio-user.rst:** <https://gitlab.com/qemu-project/qemu/-/blob/master/docs/system/devices/vfio-user.rst>
- **Reference implementation (Nutanix):** <https://github.com/nutanix/libvfio-user>
- **PATCH v4 spec submission (2020):** <https://patchew.org/QEMU/1600180157-74760-1-git-send-email-thanos.makatos@nutanix.com/>
- **PATCH 09/27 (2025 refresh):** <https://lists.nongnu.org/archive/html/qemu-devel/2025-05/msg03897.html>
- **PATCH 09/26 (2025):** <https://lists.libreplanet.org/archive/html/qemu-devel/2025-01/msg00933.html>

What they cover:
- Mutual-distrust between client and server ("must not trust each other"). The spec treats this as a *protocol-level* discipline, not a *policy engine*.
- Socket disconnection handling: client cannot distinguish intermittent from persistent failure; required to reset the VFIO device via `VFIO_USER_DEVICE_RESET`. This is the **only** built-in behavioral response.
- Explicit finite state machine (FSM) inherited from Linux kernel VFIO. State transitions that fail put the device in `ERROR`; recovery requires explicit reset.
- DMA windows are negotiated (`DMA_MAP` / `DMA_UNMAP`) and explicit; what is *not* in the protocol is any notion of "DMA pattern is anomalous" or "this region is being read at suspicious frequency."

Gaps for ADR-033:
- **No trigger model.** The spec is silent on what counts as misbehavior — only on what happens once misbehavior has *already* happened (reset).
- **No severity ladder.** One response: reset. ADR-033's tier ladder (log → snapshot → throttle → sever) is not in scope for the protocol.
- **No forensic-state capture.** Reset discards state. ADR-033's "SEVER snapshots then severs" is novel against this baseline.

### B. VFIO mediated devices (mdev) — kernel framework

- **Kernel docs:** <https://docs.kernel.org/driver-api/vfio-mediated-device.html>
- **LWN coverage (IOMMU-aware mdev):** <https://lwn.net/Articles/780522/>
- **LPC deck (Alex Williamson, 2017):** <https://lpc.events/event/7/contributions/841/attachments/609/1095/VFIO_vs_UserSpaceDMA.pdf>
- **Hardware-Assisted Mediated Pass-Through (Kevin Tian, Intel, 2017):** <https://events19.linuxfoundation.org/wp-content/uploads/2017/12/Hardware-Assisted-Mediated-Pass-Through-with-VFIO-Kevin-Tian-Intel.pdf>

What they cover:
- Vendor-driver-mediated control over a parent device. The mdev exposes a mediated sub-device that gets direct MMIO/DMA access for performance paths, with the vendor driver mediating everything else.
- Isolation unit = **IOMMU group**, not the mdev itself. Hardware isolation depends on IOMMU and (optionally) Intel Scalable IOV PASID-granular DMA tagging.
- Behavioral handling is delegated to the **vendor driver's error path**. There is no shared policy engine across mdevs — each vendor driver (Intel, NVIDIA, AMD) implements its own error and isolation semantics.

Gaps for ADR-033:
- **No shared trigger vocabulary across vendors.** The kernel can give you a "device in error" signal but not "this device is exhibiting a behavioral pattern that should escalate."
- **No severity ladder.** mdevs are binary: present or reset, with the vendor driver deciding what "reset" means.
- **A2 (snapshot at SEVER) interaction:** mdevs can be paused/resumed via vendor APIs, but a kernel-mediated snapshot tied to a *behavioral* trigger is not a documented feature.

### C. NVIDIA vGPU / SR-IOV / MIG (commercial GPU partitioning)

- **NVIDIA vGPU for Compute Features:** <https://docs.nvidia.com/vgpu/latest/grid-vgpu-user-guide/index.html>
- **NVIDIA AI Enterprise vGPU features:** <https://docs.nvidia.com/ai-enterprise/release-7/latest/infra-software/vgpu/features.html>
- **Workload Isolation (NVIDIA Cloud Accelerator / DSX):** <https://docs.nvidia.com/ncx/ncp-software-reference-guide/latest/workload-isolation.html>
- **vGPU Troubleshooting / Config:** <https://docs.nvidia.com/vgpu/troubleshooting/latest/config.html>

What they cover:
- **Hardware isolation:** MIG (Multi-Instance GPU) partitions physical GPU into hardware-protected instances. SR-IOV virtual functions (VFs) get full IOMMU protection.
- **Resource scheduling policies (closest analogue to ADR-033's ladder):**
  - **Best Effort** — default; no guarantees.
  - **Equal Share** — round-robin per VM.
  - **Fixed Share** — deterministic quota per VM, the only "policy" that *prevents a misbehaving tenant from impeding others*.
- **Operational responses:** monitoring for resource contention (memory leaks, anomalous GPU utilization, CPU cache leakage), and orchestration-layer actions: isolate, pause, restart, or **suspend-resume** (save VM state to disk, clear host resources, then resume later).
- **Prerequisites for stability:** BIOS SR-IOV + VT-D/IOMMU + PCIe ARI + AER enabled. Missing any one → silent VM launch failure.

Closest cousin to ADR-033, but:
- NVIDIA's policy is **resource-based** (quota/contention), not **behavioral** (DMA pattern, syscall sequence, model output). ADR-033's trigger model (OMN-147) is the differentiator.
- NVIDIA's escalation goes: **monitor → schedule → suspend-resume**. ADR-033 goes: **log → snapshot metadata → snapshot state + throttle → snapshot full + sever**.
- NVIDIA suspend-resume **discards** in-flight GPU work. ADR-033's SEVER **preserves** VM state (qcow2 + bootc delta) before severing — forensic preservation is the explicit differentiator.
- NVIDIA policy lives in the **hypervisor/orchestration layer** (ESXi, KVM + libvirt, Kubernetes device plugin). ADR-033's policy lives in the **vfio-user server process**, which closes the model-self-policing failure mode (the model cannot observe or attack its own evaluator).

### D. Adjacent: GPU resource-lockout (yubiOS-internal)

- **yubiOS skill:** `drm-gpu-quota-secure-time` — per-cgroup VRAM quota + SMC hard cutoff on Rockchip.
- Different trigger (resource exhaustion, not behavioral) and complementary, not duplicative. ADR-033's behavioral ladder operates on the vfio-user socket; this skill operates on the DRM device-memory cgroup controller. Both can fire on the same workload with different state captures; ADR-033 captures GPU state via the vfio-user path, this skill enforces VRAM caps via SMC.

## Gap analysis (assumptions A1–A4)

| Assumption | Prior-art status | ADR-033's contribution |
|---|---|---|
| **A1.** Misbehavior detectable from a vfio-user-server-side observer. | **Partially solved.** vfio-user protocol explicitly mandates mutual-distrust validation, but the validation is per-message, not per-pattern. No "anomalous DMA frequency" or "suspicious region access pattern" detection exists in any reviewed spec. | Defines a pluggable trigger evaluator interface (per the [SOLO] draft MVP scope, item 1); initial evaluator is DMA-window anomaly score with tunable threshold. |
| **A2.** VM state can be snapshotted at SEVER without losing GPU's pending work. | **NVIDIA proves the snapshot pattern works** (qcow2 + suspend-resume), but their snapshot is **discard-on-suspend**, not preserve-on-cutoff. Kernel VFIO has no documented snapshot API. | Snapshots guest via qcow2 + bootc delta (per [SOLO] draft MVP scope, item 3); preserves GPU's pending work because the vfio-user socket stays open until snapshot completes, then is revoked. |
| **A3.** Operator response time within state-preservation window. | **Not documented in any reviewed source.** NVIDIA's orchestration-layer pause/isolate is asynchronous with no SLA; mdevs have no alerting surface. | SEVER emits a webhook (per [SOLO] draft MVP scope, item 3); preservation window is bounded by disk-space exhaustion, not operator SLA. |
| **A4.** Severity ladder monotonic. | **No prior-art tier ladder exists.** NVIDIA has Best Effort / Equal Share / Fixed Share — orthogonal modes, not escalating tiers. mdev and vfio-user are binary (working or reset). | Severity ladder is the core novelty; the design's invariant is "lower tier is captured before higher tier fires." |

## Adjacent areas (not prior art, but related)

- **NVIDIA's vGPU scheduler modes** (Best Effort / Equal Share / Fixed Share) are policy modes, not tiers. ADR-033's ladder is *escalation*, which is a different thing — but Fixed Share is the closest design analogue and worth a comparison row in the final ADR-033 acceptance.
- **systemd's `OnFailure=` + `StartLimitBurst` chains** are escalation, but at the service lifecycle layer, not the device I/O layer. Worth referencing as a pattern for "automatic action + human checkpoint" composition.
- **OPA/Rego policy engines** (which yubiOS already uses via `yubiOS.rego` for the build supply chain) are the natural language for expressing the trigger evaluators. The trigger model (OMN-147) can be Rego.

## What is genuinely novel in ADR-033

1. **Behavioral trigger vocabulary on a vfio-user server.** No reviewed source defines what counts as misbehavior beyond "reset on socket close." ADR-033's pluggable evaluator interface is the new contribution; the DMA-window anomaly score is a concrete first evaluator.
2. **4-tier severity ladder with monotonic forensic capture.** Each tier captures state at the prior tier before escalating. NVIDIA has escalation but not state-capture-at-each-tier; mdev has no escalation; vfio-user has no policy at all.
3. **Policy lives in the vfio-user server process, not the orchestrator.** Closes the model-self-policing failure mode. NVIDIA's policy in the hypervisor can be observed by the model via timing side-channels.
4. **Preserve, then sever.** State-preservation-before-cutoff is the explicit design goal. NVIDIA discards; ADR-033 snapshots. This is the forensic-story delta.

## What is *not* novel

- The mediation mechanism itself (ADR-031). Don't redo.
- IOMMU isolation (kernel docs).
- vGPU scheduling modes (NVIDIA) — orthogonal policy modes, not escalation.
- The vfio-user protocol (QEMU, Nutanix). The protocol is the *substrate*; ADR-033 is *policy on top of it*.

## Verdict

ADR-033 has clear novelty at the **policy** layer (severity ladder, forensic capture, server-resident trigger evaluator) but does *not* re-decide the **mechanism** (ADR-031 is final). The four assumptions to validate (A1–A4) each have a concrete test plan in the [SOLO] draft's MVP scope. The closest commercial cousin (NVIDIA vGPU Fixed Share + suspend-resume) is policy-mode, not escalation, and discards state on cutoff — the differentiator is preserved.

## Open questions (carried forward)

- **OMN-146:** Is bare-metal PCI-passthrough testing in scope for v1 launch? The IOMMU gate is post-launch per ADR-031, so ADR-033's *enforcement* of the gate is also post-launch. The *policy* (which decides to invoke the gate) is in-scope now.
- **OMN-147:** What counts as "misbehavior"? DMA-window anomaly score is one candidate; syscall sequence, GPU memory access pattern, or model output entropy are others. Rego policy expression seems natural here.
- **OMN-108** (Linear parent): GPU trust boundary; the umbrella issue that spawned the ADR-031 → ADR-033 chain.

## References (single list)

- [vfio-user Protocol Spec — QEMU docs](https://www.qemu.org/docs/master/interop/vfio-user.html)
- [vfio-user source docs (QEMU)](https://gitlab.com/qemu-project/qemu/-/blob/master/docs/system/devices/vfio-user.rst)
- [Nutanix libvfio-user](https://github.com/nutanix/libvfio-user)
- [vfio-user PATCH v4 spec (Makatos, Nutanix, 2020)](https://patchew.org/QEMU/1600180157-74760-1-git-send-email-thanos.makatos@nutanix.com/)
- [vfio-user PATCH 09/27 (2025)](https://lists.nongnu.org/archive/html/qemu-devel/2025-05/msg03897.html)
- [VFIO mediated devices — kernel docs](https://docs.kernel.org/driver-api/vfio-mediated-device.html)
- [LWN: IOMMU-aware mdev](https://lwn.net/Articles/780522/)
- [LPC 2017: VFIO vs Userspace DMA (Alex Williamson)](https://lpc.events/event/7/contributions/841/attachments/609/1095/VFIO_vs_UserSpaceDMA.pdf)
- [Hardware-Assisted Mediated Pass-Through (Kevin Tian, Intel, 2017)](https://events19.linuxfoundation.org/wp-content/uploads/2017/12/Hardware-Assisted-Mediated-Pass-Through-with-VFIO-Kevin-Tian-Intel.pdf)
- [NVIDIA vGPU Software User Guide](https://docs.nvidia.com/vgpu/latest/grid-vgpu-user-guide/index.html)
- [NVIDIA AI Enterprise vGPU features](https://docs.nvidia.com/ai-enterprise/release-7/latest/infra-software/vgpu/features.html)
- [NVIDIA Cloud Accelerator — Workload Isolation](https://docs.nvidia.com/ncx/ncp-software-reference-guide/latest/workload-isolation.html)
- [NVIDIA vGPU Troubleshooting / Configuration](https://docs.nvidia.com/vgpu/troubleshooting/latest/config.html)
- yubiOS-internal: `drm-gpu-quota-secure-time` skill (VRAM quota + SMC hard cutoff on Rockchip — resource-exhaustion complement to ADR-033's behavioral trigger)


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.
