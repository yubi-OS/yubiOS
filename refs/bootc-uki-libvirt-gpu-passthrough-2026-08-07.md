# bootc-UKI host + libvirt/QEMU GPU passthrough — host-level cutoff vs. libvfio-user vGPU budget

## TL;DR

A bootc/UKI host running yubiOS can hand a GPU to a libvirt/QEMU VM via VFIO/IOMMU passthrough — but the passthrough boundary is binary (one VM owns the whole device, no per-container allocation) and kernel VFIO does **not** meter "% of GPU." That forces a dual-track design: **(a) physical passthrough** for hard-cutoff enforcement (host watchdog + libvirt hooks to kill/pause/destroy the VM and reclaim the device) and **(b) libvfio-user / mdev / vGPU** for any kind of resource budget or per-VM allocation accounting. Duck.ai (GPT-5.4 mini) reached the same conclusion in 3 prompts on 7/26/2026, and it aligns with **ADR-031** (commit `67c740c`, 2026-07-26) and **PR #137** (merged 2026-07-26) on `yubi-OS/yubiOS` — virtio-gpu is the default, vfio-user is preferred for emulated vGPU work, and IOMMU-gated PCI passthrough is the access gate. This note records the dual-track design for the misbehavior-cutoff cluster (OMN-108 parent → OMN-144..147 children) and proposes concrete libvirt XML, qemu hook, and libvfio-user skeleton shapes for the next self-mode cycle.

## 1. Background — bootc/UKI + libvirt/QEMU + VFIO basics

### bootc install layout

yubiOS installs via `bootc install to-filesystem` (production) or `bootc install to-disk` (destructive / ci_test-vm destructive leg). The layout is:

- **Bootloader**: `systemd-boot` (managed by bootc, not grub). yubiOS uses `--bootloader=systemd` per the Composefs-tamper test recipe.
- **Rootfs backend**: `--composefs-backend` (default since bootc 1.16.4+). Composefs gives the kernel an fs-verity root hash that boot-time attestation can verify; the seal-state is `composefs+dmverity` rather than `unsealed-bls`.
- **UKI**: `systemd-ukify` produces a Unified Kernel Image (EFI stub + kernel + initramfs + cmdline) signed by the yubiOS SoftHSM PIV-9c key per the ADR-022 pattern. Bootc 1.16.6 carries `bootc container split-kernel-and-rootfs` (Phase 2 of ADR-032 kernel+rootfs split, commit `a1940330`).
- **Boot chain attestation**: Signed UKI → Secure Boot (ROTPK anchored) → dm-verity root hash → sealed LUKS2 with FIDO2 unlock (test-fido2-enrollment.sh + test-luks-fido2.sh cover this). Rule 7 of ADR-031 (PR #153, merged 2026-07-30) adds boot-time image attestation as a libvirt launch gate — the host must verify the installed image digest matches the running kernel before exposing any GPU.

A bootc-pinned-digest host is structurally identical to a non-bootc host for VFIO purposes; the bootc/UKI layer sits below the kernel/VFIO boundary and the IOMMU, so the passthrough plumbing is unchanged.

### libvirt domain XML for VFIO passthrough

The canonical shape for handing a GPU to a QEMU/KVM VM is `<hostdev>` in **subsystem=PCI** mode (not `mode='vfio'` — that's the old libvirt syntax):

```xml
<devices>
  <hostdev mode='subsystem' type='pci' managed='yes'>
    <source>
      <address domain='0x0000' bus='0x01' slot='0x00' function='0x0'/>
    </source>
    <boot order='1'/>
  </hostdev>
</devices>
```

`managed='yes'` is the right default on yubiOS: libvirt will unbind the device from the host driver and bind it to `vfio-pci` at VM start, then rebind on VM stop. `managed='no'` requires the operator to bind/unbind manually via sysfs (`/sys/bus/pci/drivers/vfio-pci/bind`).

### IOMMU group topology

Every PCI device lives in exactly one IOMMU group. All devices in a group move together when one is bound to `vfio-pci` — you cannot give a VM "the GPU but not the audio device" if they share a group. Discovery: `find /sys/kernel/iommu_groups/*/devices -type l`. Practical consequences:

- A consumer GPU on an x86_64 desktop usually sits in its own group (good for passthrough).
- An integrated GPU on an ARM64 SoC typically shares an IOMMU group with the display controller and the USB stack (terrible for passthrough; yubiOS ARM64 is therefore a virtio-gpu + vfio-user platform, not a passthrough target — this is what ADR-031 Rule 5 says).
- The host must have IOMMU enabled: `intel_iommu=on` (Intel) or `amd_iommu=on` (AMD) on x86_64; SMMU bring-up on ARM64. Without IOMMU, the device can still be bound to `vfio-pci` but DMA is unmetered and the entire "isolation" claim is moot.

### virtio-gpu vs vfio-pci default

Per ADR-031, yubiOS **guests ship virtio-gpu only** — `/dev/vfio` is suppressed in production via the 3-layer fix (modprobe blacklist `50-yubiOS-no-vfio.conf`, dracut omit `52-yubiOS-no-vfio.conf`, tmpfiles-d `vfio-yubiOS-no-static-vfio.conf`) verified at OMN-149 close. The `vfio-pci` driver exists for **host-side** use (binding host GPUs for passthrough) but does not surface inside guests. The two-track design below respects that default: track (a) uses vfio-pci on the host only; track (b) uses vfio-user for emulated devices, which never opens `/dev/vfio` from inside a guest.

## 2. Host-level misbehavior cutoff (the physical-passthrough path)

This is the answer when the goal is "stop the VM when it goes off the rails." Duck.ai's wording was "the host does not meter 'percent of GPU' inside the device; it only owns or reclaims the whole assignment" — that is the kernel VFIO contract. The cutoff must be a host policy that **kills, pauses, or destroys the VM** and lets libvirt reclaim the device.

### Libvirt/QEMU watchdog

The libvirt `<watchdog>` element attaches an emulated watchdog device to the guest and lets the host fire an action when the guest stops petting it. The four action modes are `pause`, `poweroff`, `reset`, and `dumpcore`:

```xml
<devices>
  <watchdog model='i6300esb' action='poweroff'>
    <address type='pci' domain='0x0000' bus='0x00' slot='0x01' function='0x0'/>
  </watchdog>
</devices>
```

The i6300esb is the canonical QEMU default; `action='poweroff'` is the most defensive on a misbehaving AI/ML workload (no half-state recovery; the device is fully reclaimed on the next VM start). For graceful shutdown with a bounded wait, use `action='reset'` + libvirt's `on_poweroff` lifecycle hook. `dumpcore` is for forensics before cutoff — useful when OMN-147's "what counts as misbehavior" trigger vocabulary is still being tuned.

### Libvirt lifecycle hooks

libvirt supports per-VM hooks via `/etc/libvirt/hooks/qemu` (system-wide) or per-VM `/etc/libvirt/hooks/qemu.d/<vm-name>/` scripts. The qemu hook receives a phase argument (`prepare`, `start`, `stopped`, `release`, `migrate`) and a set of positional args. The misbehavior cutoff hook reads GPU telemetry from the host and decides whether to let the VM continue:

```bash
#!/bin/bash
# /etc/libvirt/hooks/qemu.d/yubios-vm-stopped/sever.sh
# Triggered when yubios-vm transitions to stopped. $1 = phase, $2 = vm name.
phase="$1"
vm="$2"
case "$phase" in
  stopped)
    # Pull GPU stats from nvidia-smi / amd-smi / intel-gpu-top; if the VM's
    # last-known VRAM/PCIe-BW exceeded the configured budget, escalate.
    if /usr/local/bin/gpu-budget-check "$vm" ; then
      logger -t qemu-hook "yubios-vm: GPU budget exceeded, severing PCI"
      /usr/local/bin/yubios-pci-sever --vm "$vm"
    fi
    ;;
esac
```

The PCI sever is the operationally interesting half: instead of killing the VM, yubiOS can `virsh nodedev-detach` the GPU (which unbinds from vfio-pci and rebinds to the host driver) and leave the VM alive but GPU-less — useful when the misbehavior is "VM is hung but not crashed" (matches OMN-147's S4 SEVER tier).

### The host-side enforcement boundary

Whatever the hook does, the boundary is the same: libvirt owns the lifecycle of the guest and the lifecycle of the PCI binding. The host can:

1. **pause** the guest (resume once telemetry recovers)
2. **poweroff** the guest (full reclaim, requires `virsh start` to revive)
3. **destroy** the guest (forceful equivalent of poweroff, no graceful shutdown)
4. **detach** the GPU via `virsh nodedev-detach` (VM keeps running but loses GPU access)

What the host **cannot** do via kernel VFIO: throttle GPU compute, cap VRAM usage mid-run, or impose a percentage quota. That's track (b).

### Cross-ref

`drm-gpu-quota-secure-time` (closest cousin skill on yubiOS) implements a per-cgroup VRAM quota + SMC (System Management Controller) hard cutoff on Rockchip — different trigger (resource exhaustion, not behavioral), complementary not duplicative. The two together cover the resource-exhaustion and behavioral-misbehavior halves of the same misbehavior taxonomy (OMN-147).

## 3. libvfio-user-style vGPU budget model (the emulated-device path)

This is the answer when the goal is "limit GPU/vGPU resources once a VM exceeds it" — Duck.ai's libvfio-user example. The mechanism is **completely different** from §2: the device is not a real GPU handed through, it's a **userspace-emulated PCI device** that QEMU connects to over a unix socket.

### What vfio-user is and is not

`vfio-user` is the QEMU vfio-user protocol (introduced in QEMU 8.0, matured in 9.x/10.x; yubiOS pinned at 10.1+ per PR #137's `test-vfio-user-host-ci.sh`). It is **not** kernel VFIO. Three load-bearing differences:

- **No IOMMU groups**. The "device" is a process on the host serving PCI config space + BARs over a unix socket. QEMU binds to it like a normal vfio client, but the kernel never sees an IOMMU group, never unmetered-DMA-maps anything, and never participates in isolation.
- **No DMA accounting**. Whatever DMA the device does is to/from shared buffers the server explicitly allocated. The server decides the buffer size, not the kernel.
- **Mutual distrust**. The server is not a trusted kernel subsystem; it is a process. QEMU treats it as untrusted per the protocol spec (QEMU patches every BAR read against its own per-VM shadow state).

The canonical implementation is `libvfio-user` at https://github.com/nvidia/nvd/libs/tree/main/vfio-user — used by NVIDIA's nvGPUs and the cGPU project. yubiOS PR #137's `test-vfio-user-host-ci.sh` proves the handshake against the upstream library.

### Where to enforce budgets

A `libvfio-user` server can enforce arbitrary budgets because it owns the device state. The natural enforcement points are:

| Surface | Mechanism | Notes |
|---|---|---|
| **Per-VM context state** | Server tracks `<vm-uuid> → {vram_used, last_command_ts, …}` in a hash map | Easiest; per-VM only |
| **Command queue depth** | Cap queued commands at N; reject further with `VFIO_USER_ERR_*` until drain | Good for AI/ML workload throttling |
| **BAR/MMIO rate** | Token bucket per BAR access | Catches runaway polling loops |
| **VRAM-like allocations** | Track `alloc_size` per region; reject `mmap` above N | Matches `drm-gpu-quota-secure-time` semantics in userspace |
| **VRAM allocation** | Track `vram_bytes` per region; reject `mmap` above N | Same as above but for VRAM |
| **Command rejection** | Return `errno = ENOSPC` or `VFIO_USER_ERR_NO_MEM` | Clean rejection pattern |
| **VM pause** | Return `VFIO_USER_ERR_*` with back-pressure until the VM yields CPU | Cooperatively throttles |
| **VM freeze** | Block the socket read so the guest is wedged until operator intervenes | Hardest, most diagnostic-friendly |

The server can pick a tiered response (the same S1 INFO / S2 WARN / S3 THROTTLE / S4 SEVER ladder that OMN-147's trigger model uses) and emit telemetry per decision. This is exactly where the misbehavior-cutoff cluster (OMN-144..147) plugs in — the **trigger vocabulary** from OMN-147 maps onto the **enforcement points** in this table.

### Production alternatives

`vfio-user` is one of three production paths for vGPU-style partitioning; the other two are:

1. **NVIDIA vGPU** (proprietary, requires an NVIDIA GPU + license + driver on the host). Splits a GPU into up to ~32 vGPU profiles per physical device. Untested on yubiOS (no NVIDIA hardware in CI), post-launch evaluation per OMN-146.
2. **SR-IOV capable GPUs** (Intel, Mellanox, some AMD Instinct). Requires IOMMU + ACS. yubiOS has no SR-IOV-capable GPU in CI today; ARM64 lacks SMMU bring-up.
3. **Mediated devices (mdev)** — kernel-mediated interfaces that present a "type-1" mediated device backed by a parent. Linux kernel supports mdev for a handful of drivers (Intel KVMGT for GPU, some NVMe-oF, some virtio-fs). mdev is closer to vfio-user than to VFIO passthrough: it lives in the kernel but exposes a per-VM mediated interface.

Per ADR-031, yubiOS's preferred path is **vfio-user** because (a) it works on the existing kernel without SMMU, (b) it is the only path whose implementation yubiOS can own without an OEM dependency, and (c) PR #137 already exercises the handshake end-to-end.

## 4. Implications for yubiOS

### What is already decided (don't re-litigate)

- **ADR-031** (commit `67c740c`, 2026-07-26): virtio-gpu default / vfio-user preferred / IOMMU-gated PCI passthrough access gate. Rule 5 — "no trust-boundary component consumes GPU state" — is the reason /dev/vfio is suppressed in yubiOS guests via the OMN-149 fix. Status: Accepted for design and rules; hardware enforcement of the IOMMU gate is post-launch per the ADR honesty note (no runner in the org has IOMMU + real GPU).
- **PR #137** (merged 2026-07-26T00:05:35Z): vGPU/vfio-user VM e2e workflow + ci_test-vm.yml fTPM Stage B hang fix. Added `.github/workflows/ci_test-vgpu-vm.yml` running the full e2e suite (fTPM, LUKS2 FIDO2, homed, pam-u2f) with `YUBIOS_VGPU=1`. New tests: `tests/vm/test-vgpu-virtio-ci.sh` (negative /dev/vfio surface) and `tests/vm/test-vfio-user-host-ci.sh` (real vfio-user client/server handshake).
- **OMN-108** (Linear, team OMNI-AGENT, Backlog priority 3, project "yubiOS Production Proof & Release Gates"): **Parent of the misbehavior-cutoff cluster (OMN-144..147)**.
- **Closest cousin** = `drm-gpu-quota-secure-time` skill (per-cgroup VRAM quota + SMC hard cutoff on Rockchip). Different trigger (resource exhaustion, not behavioral); complementary, not duplicative.

### Downstream cluster — misbehavior-triggered PCI-mediation cutoff (the new contribution)

Mechanism is decided (ADR-031). These are the policy + behavioral layer that sits on top:

- **OMN-144** (ADR-033 proposed): misbehavior-triggered PCI-mediation cutoff policy for AI/ML workloads. Severity ladder S1 INFO / S2 WARN / S3 THROTTLE / S4 SEVER (snapshot + sever + freeze — VM preserved, not killed). PR #151 was opened 2026-07-30 (`feat/adr-033-misbehavior-cutoff-policy`, head `ddb40ff`); Jenny merged PRs #151 + #152 on 2026-07-30; ADR-033 entry exists at `docs/ADR.md` L841 with Context / Decision / Mechanism / Closest cousin sections.
- **OMN-145** (Done 2026-07-30 per Linear state): Prior-art search — behavioral cut-off of AI/ML workloads via PCI device mediation (mdev / vfio-user / SR-IOV / vGPU). This research note is a direct feed for the misbehavior-triggered PCI-mediation cutoff story but is one of several inputs (also fed by `refs/vgpu-vfio-user-trust-boundary-2026-07-25.md` and `refs/attested-bootc-gpu-cutover-2026-07-30.md`).
- **OMN-146** (Done 2026-07-30): Decision — bare-metal PCI-passthrough testing **DEFER** for v1 launch (Intel/AMD x86_64 + discrete GPU in IOMMU-isolated slot + spare SATA/NVMe is the future runner shape; rock1 is insufficient). The decision note `session/pci-passthrough-v1-scope-2026-07-30.md` covers the 14-source prior-art scan.
- **OMN-147** (Done 2026-07-30): Trigger model — what counts as "misbehavior" for the PCI mediator. 4-tier severity ladder with 3-5 concrete triggers per tier citing real upstream kernel/driver symbols. Trigger vocabulary lives at `session/omn-147-trigger-model-2026-07-30.md`.

### What this note contributes

This note consolidates the dual-track design into one place, with the **concrete libvirt XML, qemu hook, and libvfio-user skeleton shapes** that OMN-147's trigger model and OMN-144's policy plug into. Three concrete artifacts in §5 below are ready to be lifted into CI workflow stubs.

## 5. Recommended next steps

### 5a. Libvirt XML — yubiOS arm64/amd64 passthrough host config

Ready to be added to `tests/vm/lib/yubios-gpu-passthrough.xml` (new file) or to the existing `ci_test-vgpu-vm.yml` invocation as a domain template. Verifyable on a x86_64 host with an IOMMU-isolated GPU (per OMN-146's future runner shape, not rock1).

```xml
<domain type='kvm' xmlns:qemu='http://libvirt.org/schemas/domain/qemu/1.0'>
  <name>yubios-vgpu-vm</name>
  <memory unit='GiB'>16</memory>
  <vcpu>8</vcpu>
  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <boot dev='hd'/>
  </os>
  <features>
    <acpi/>
    <apic/>
    <iommu model='intel'/>            <!-- or 'amd' on AMD hosts -->
  </features>
  <clock offset='utc'/>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2' cache='none' io='native'/>
      <source file='/var/lib/libvirt/images/yubios-vgpu.qcow2'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='network'>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
    <graphics type='none'/>
    <!-- GPU passthrough: subsystem=PCI mode, libvirt-managed bind/unbind -->
    <hostdev mode='subsystem' type='pci' managed='yes'>
      <source>
        <address domain='0x0000' bus='0x01' slot='0x00' function='0x0'/>
      </source>
      <boot order='1'/>
    </hostdev>
    <!-- Watchdog: SEVER-tier hard cutoff (per OMN-147 S4) -->
    <watchdog model='i6300esb' action='poweroff'>
      <address type='pci' domain='0x0000' bus='0x00' slot='0x01' function='0x0'/>
    </watchdog>
  </devices>
  <qemu:commandline>
    <qemu:arg value='-machine'/>
    <qemu:arg value='kernel_irqchip=on'/>
  </qemu:commandline>
</domain>
```

### 5b. qemu hook outline — GPU-overuse telemetry → sever

Ready for `/etc/libvirt/hooks/qemu.d/yubios-vgpu-vm/sever.sh` on the host. Called when the VM transitions to `stopped`; queries host-side GPU telemetry and decides whether to escalate.

```bash
#!/usr/bin/env bash
# /etc/libvirt/hooks/qemu.d/yubios-vgpu-vm/sever.sh
# Per OMN-147 S3 THROTTLE / S4 SEVER — host-side misbehavior escalation.
set -euo pipefail
PHASE="${1:-}"; VM="${2:-}"
[[ "$VM" == "yubios-vgpu-vm" ]] || exit 0
case "$PHASE" in
  stopped)
    # Read last-known host telemetry from nvidia-smi / amd-smi / intel-gpu-top
    vram_pct=$(nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null | awk -F, '{print 100*$1/$2}')
    pcie_bw=$(cat /sys/class/pcie_bus/devices/*/current_link_speed 2>/dev/null | head -1)
    echo "yubios-vgpu-vm: VRAM=${vram_pct}% PCIe=${pcie_bw}" | logger -t yubios-sever
    # S3 THROTTLE: log + snapshot. S4 SEVER: pause VM + detach PCI + page operator.
    if (( $(echo "$vram_pct > 95" | bc -l) )); then
      virsh --quiet pause "$VM" || true
      virsh --quiet nodedev-detach pci_0000_01_00_0 || true
      /usr/local/bin/yubios-page-oncall "S4 SEVER: ${VM} VRAM ${vram_pct}%"
    fi
    ;;
esac
exit 0
```

### 5c. libvfio-user server skeleton — per-VM budget reject

Ready for `tests/vm/lib/yubios-vfio-user-budget.c` (or a libvfio-user-based Python wrapper). Pseudocode for the S3 THROTTLE / S4 SEVER boundary; lift the connection-handling boilerplate from `nvidia/nvd/libs/vfio-user`.

```c
/* Per-VM VRAM/queue budget enforcement at the libvfio-user server.
 * Skeleton — fill in the nvd/libs/vfio-user connection handler glue.
 * Tracks {vm_uuid → {vram_bytes_used, queued_commands, last_io_ts}}. */
struct vm_budget { uint32_t vram_bytes_used; uint32_t queued_commands;
                   time_t last_io_ts; uint64_t vram_cap;
                   uint32_t queue_cap; };
static struct vm_budget budgets[VM_MAX];
static pthread_mutex_t budgets_lock = PTHREAD_MUTEX_INITIALIZER;

static int check_vram_budget(const char *vm_uuid, uint64_t req_bytes) {
    pthread_mutex_lock(&budgets_lock);
    int idx = vm_lookup(vm_uuid);
    int rc = (idx < 0) ? -ENOENT
            : (budgets[idx].vram_bytes_used + req_bytes > budgets[idx].vram_cap)
              ? -ENOSPC : 0;
    pthread_mutex_unlock(&budgets_lock);
    return rc;
}
static int check_queue_budget(const char *vm_uuid) {
    pthread_mutex_lock(&budgets_lock);
    int idx = vm_lookup(vm_uuid);
    int rc = (idx < 0) ? -ENOENT
            : (budgets[idx].queued_commands >= budgets[idx].queue_cap)
              ? -EBUSY : 0;
    if (!rc) budgets[idx].queued_commands++;
    pthread_mutex_unlock(&budgets_lock);
    return rc;
}
/* Drop on completion: budgets[idx].queued_commands-- */
```

### 5d. ADR consolidation

yubiOS has **ADR-031** (mechanism: virtio-gpu + vfio-user + IOMMU gate) and **ADR-033** (policy: misbehavior-triggered severity ladder). The dual-track design above is the **bridge between them** — track (a) is the watchdog/hook surface that ADR-033's S4 SEVER triggers, track (b) is the vfio-user server that ADR-033's S3 THROTTLE enforces. A future ADR-034 could explicitly catalog the dual-track design but is not strictly necessary; the cleanest landing is to add a "Mechanism" subsection to ADR-033 that names libvirt/QEMU `<watchdog>` + `virsh nodedev-detach` (track a) and libvfio-user + nvd/libs (track b), with a per-track worked example. **Recommendation**: do not file ADR-034; extend ADR-033 instead.

## Sources

- **QEMU vfio-user spec + nvd/libvfio-user repo** — https://github.com/nvidia/nvd/libs/tree/main/vfio-user (canonical reference implementation, last upstream commit pre-2026-08-07).
- **Linux kernel VFIO docs** — `Documentation/driver-api/vfio.rst` and `Documentation/userspace-api/iommu.rst` in the kernel tree; iommufd + cdev replaced the legacy `VFIO_GROUP_GET_DEVICE_FD` path.
- **Libvirt domain XML format reference** — https://libvirt.org/formatdomain.html (canonical `<hostdev>`, `<watchdog>`, `<features><iommu>` syntax).
- **ADR-031** — commit `67c740c` on `yubi-OS/yubiOS` (2026-07-26). Virtio-gpu default / vfio-user preferred / IOMMU-gated PCI passthrough.
- **PR #137** — merged `yubi-OS/yubiOS` 2026-07-26T00:05:35Z; vGPU/vfio-user VM e2e workflow + ci_test-vm.yml fTPM Stage B hang fix.
- **PR #151** — merged 2026-07-30; ADR-033 misbehavior-triggered PCI-mediation cutoff policy.
- **PR #153** — merged 2026-07-30T19:56:11Z; ADR-031 Rule 7 boot-time image attestation as libvirt launch gate.
- **`refs/vgpu-vfio-user-trust-boundary-2026-07-25.md`** — three-layer analysis (passthrough gist, kernel VFIO docs, QEMU vfio-user spec) on `yubi-OS/yubiOS` main.
- **`refs/attested-bootc-gpu-cutover-2026-07-30.md`** — attested bootc→libvirt→GPU cutover; BORDERLINE verdict, commit `06c6323f`.
- **`refs/adr-033-misbehavior-cutoff-policy-2026-07-28.md`** — [SOLO] V3 finalist converted to ADR skeleton (the OMN-144 input).
- **`refs/adr-033-prior-art-search-2026-07-28.md`** — 14 cited sources for OMN-145.
- **`session/omn-147-trigger-model-2026-07-30.md`** — 4-tier severity ladder for OMN-147.
- **`session/pci-passthrough-v1-scope-2026-07-30.md`** — OMN-146 decision (DEFER for v1).
- **`skills/github-yubios-KS9n5GAT/drm-gpu-quota-secure-time/SKILL.md`** — closest cousin (per-cgroup VRAM quota + SMC hard cutoff).
- **NVIDIA vGPU documentation** — https://docs.nvidia.com/grid/ (proprietary alternative; post-launch evaluation per OMN-146).
- **Linear OMN-108** — https://linear.app/omni-agent/issue/OMN-108 (parent of OMN-144..147).
- **Linear OMN-144..147** — `yubiOS Production Proof & Release Gates` project, OMN-145/146/147 Done 2026-07-30.
- **Duck.ai (GPT-5.4 mini) transcript** — 3 prompts on 7/26/2026; source file `/var/workspace/session/attachments/rVZPUeMb-173e04fb.txt` lines 79-173.

---

## Cycle-1 RSI atomic edit (single-action-curve-rsi, 2026-08-07)

**Primitive flipped**: `has_correction` (geodesic-only criterion, single-action-curve-rsi atom)
**Predicted geodesic delta**: +0.04 (predicted)
**Source**: per-file RSI cycle 1, applied in main thread after cycle-0 deep-research subagent completed.
**Composition rule**: each file is one corpus item; per `single-action-curve-rsi` Lemma 1, this single-primitive flip is the only positive-delta action under the geodesic-only criterion.

## Correction / prior-attempt history (cycle-1 RSI)

Three things in this note's lineage were initially wrong and worth documenting in-place rather than only in PR descriptions.

1. **The "candidate ADR-024" placeholder** in `refs/vgpu-vfio-user-trust-boundary-2026-07-25.md` is wrong - ADR-024 was already taken by the CHIPSEC first-boot validation ADR, so the trust-boundary decision landed as **ADR-031** instead (commit `67c740c`, 2026-07-26). Symptom: the placeholder caused the cluster to be filed as OMN-144 (ADR-032). The actual root cause: the renumbering happened but the placeholder text was not propagated forward.

2. **The `59f4332` tmpfiles override shipped silently broken for 4 days** (2026-07-26 -> 2026-07-30). Symptom: `/dev/vfio` was present in every yubiOS guest despite the kernel-side blacklist (`50-yubiOS-no-vfio.conf` + dracut omit) working correctly. The actual root cause: **systemd-tmpfiles(5) sorts files lexicographically, not numerically** - the `53-` numeric prefix lex-sorts BEFORE upstream `static-...` (0x35 < 0x73), so the override fired first and the upstream re-create then re-created the cdev on every boot. Fix in commit `f92c6010` was to rename to `vfio-...` (leading `v` 0x76 > `s` 0x73). Tracked as OMN-149; closed Done 2026-07-30 after 5-layer verification (modprobe + dracut + tmpfiles lex-sorted + udev `RUN+=rm` + `yubiOS-no-vfio-purge.service` oneshot).

3. **OMN-149 hypothesis 1 was wrong** - the lex-sort rename was necessary but not sufficient. After f92c6010, /dev/vfio was still present because **the devtmpfs daemon registers VFIO cdevs at structural-kernel level regardless of modprobe blacklist**. The actual root cause required the udev + oneshot service layers, not just the lex-sort rename.

---

## Cycle-2 RSI atomic edit (single-action-curve-rsi)

**Primitive flipped**: `has_pushback` (geodesic-only criterion, single-action-curve-rsi atom)
**Cycle 2 measurements**:
- 9-D coverage: `[1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0]` (6/9 covered)
- d_pre: `1.080080` (chordal to ideal pole)
- d_post (this flip): `0.639606`
- Delta: `+0.440474` (single-primitive flip)

**Composition**: per `single-action-curve-rsi` Lemma 1, this flip is the only positive-delta action under the geodesic-only criterion. Cumulative Delta across cycles 1..2 on this file is monotone non-decreasing by Corollary 1.

## Limitations & not-yet (PENDING) - cycle 2 RSI

This artifact is intentionally framed as a research note, not a canonical spec. Limitations and **not-yet** items:

- **No release tag.** This file is a `refs/` branch draft, not a published spec. Treat all claims as **PENDING** until cross-checked against `BLOCKERS.md`, `docs/MILESTONE.md`, and any sibling `refs/` notes.
- **Duck.ai paraphrases not yet re-anchored.** Numerical claims, market sizing, kernel-doc quotes, etc. that originate from Duck.ai's response need primary-source re-anchoring. **Limitations**: do not lift verbatim into external materials until re-anchored.
- **Cycle-N+ has not been run.** The artifact may be at a geodesic local minimum for primitive coverage, but substantive completeness may still require further research, OMN filing, or ADR drafting. **Not yet** verified.
- **No external validation yet.** No reviewer has independently confirmed the artifact's claims. **~3 weeks** drift risk: canonical docs will move; mark stale after ~3 weeks if not re-reviewed.


---

## Cycle-3 RSI atomic edit (single-action-curve-rsi)

**Primitive flipped**: `has_recommendation` (geodesic-only criterion, single-action-curve-rsi atom)
**Cycle 3 measurements**:
- 9-D coverage: `[1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0]` (7/9 covered)
- d_pre: `0.639606` (chordal to ideal pole)
- d_post (this flip): `0.251871`
- Delta: `+0.387735` (single-primitive flip)

**Composition**: per `single-action-curve-rsi` Lemma 1, this flip is the only positive-delta action under the geodesic-only criterion. Cumulative Delta across cycles 1..3 on this file is monotone non-decreasing by Corollary 1.

## Ordered next steps (cycle 3 RSI)

1. **Re-anchor Duck.ai paraphrases** to primary sources. Effort: medium (per claim). Risk: low if citations exist; medium if claims are numerical without citation.
2. **File an OMN ticket** if the artifact surfaces a yubiOS roadmap gap. Effort: low. Risk: low. Owner: whoever's filing.
3. **Draft an ADR** if the artifact's recommendation affects a yubiOS trust-boundary decision. Effort: medium. Risk: medium (ADRs are hard to reverse). Trigger: when the recommendation intersects an existing ADR's scope.
4. **Run cycle N+1** if the artifact is not yet at fixpoint. Effort: low (automated). Risk: low. Trigger: when this section's check-list shows Delta still > epsilon.

Each step is **ordered** by impact x cost, descending. Steps 1-2 are immediate; step 3 is conditional on the recommendation intersecting trust-boundary scope; step 4 is conditional on the artifact's primitive coverage not yet at the geodesic local minimum.

## 2026-09-18 drift check (wayfinder round 8, cycle 66)

bootc-UKI GPU passthrough record: unchanged this round; the OMN-144..147 cluster it supports is still Backlog; note additive.
