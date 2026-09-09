# vGPU / VFIO / vfio-user vs the yubiOS trust boundary

Status: design + CI plan. Written 2026-07-25. Sources dated the same day.

## Failure modes and recovery baseline

Per the ADR-031 posture (virtio-gpu default / vfio-user preferred / IOMMU-gated passthrough; enforcement post-launch):

- **Passthrough with no working IOMMU** — a DMA-capable device reading unlocked key material. Recovery: refuse at the gate; enable passthrough only on an isolated IOMMU group with a documented deviation (§2 rule 2).
- **vfio-user socket over-exposed** — the device-model peer reaches negotiated DMA windows. Recovery: socket mode 0600, VMM-user-owned, single host namespace until the protocol has authentication (§2 rule 4).
- **GPU state coupled into the unlock path** — vGPU presence changes boot/unlock behaviour. Recovery: re-run the full LUKS2 FIDO2 + homed + pam-u2f + fTPM suite with a vGPU attached (invariant 5, §1).
- **Pinned CI inputs drift** (bcvk patch, libvfio-user commit) — a silently-ignoring build. Recovery: the workflow SKIPs loudly on patch failure; refresh pins before re-asserting results (§4).

**Claim validation / benchmark sources:** claims here rest on the upstream pins named in the Inputs list — kernel VFIO/iommufd docs, the qemu.org vfio-user protocol spec, QEMU 10.1 upstream client — refresh against upstream releases before citing forward.

**Promotion gate:** this doc stays research/design-class; promotion to enforcement requires the roadmap-promotion-gates fields (owner/deployment target, trust boundary, evidence target, recovery behavior) answered with CI evidence from the rock1 vGPU lane.

Inputs analysed:

- `k-amin07/47cb06e4598e0c81f2b42904c6909329` (gist) â a bare-metal GPU-passthrough
  recipe: enable VT-d, `intel_iommu=on`, verify IOMMU groups, bind the GPU to
  `vfio-pci` via `vfio.conf` + initramfs, blacklist the host display driver,
  attach the PCI GPU (plus its audio function) to a guest in virt-manager.
  Operational playbook, not a spec.
- `docs.kernel.org/7.0/driver-api/vfio.html` â the kernel framework the gist
  depends on: IOMMU groups as the isolation unit, container (`/dev/vfio/vfio`) +
  group (`/dev/vfio/$GROUP`) + device, `VFIO_GROUP_SET_CONTAINER`, and the
  migration to **iommufd + the device cdev** (`VFIO_DEVICE_BIND_IOMMUFD` claims
  DMA ownership) with the legacy container/group path headed for deprecation.
  Root is needed to *bind* a device; using an already-permissioned node is not
  inherently privileged (`/dev/vfio/vfio` grants no capability by itself).
- `qemu.org/docs/master/interop/vfio-user.html` â the vfio-user protocol: the
  device model lives in a **separate userspace process**, QEMU is the client over
  an `AF_UNIX` socket (FD passing via `SCM_RIGHTS`), negotiation is
  `VFIO_USER_VERSION` â `GET_INFO`/`REGION_INFO` â `DMA_MAP`/`DMA_UNMAP` â
  `READ`/`WRITE`/`SET_IRQS`. The spec states client and server **must not trust
  each other** and both must validate input. One socket per connection, PCI only,
  no client/device multiplexing, live migration deferred. No kernel VFIO modules
  on either side.

Also confirmed (matters for what CI can run today): the **vfio-user client landed
upstream in QEMU 10.1** as `vfio-user-pci`, configured with
`-device '{"driver":"vfio-user-pci","socket":{"path":"â¦","type":"unix"}}'`.
The self-hosted rock1 runner already builds QEMU 10.2.50 for the zstd zboot
workaround, so that device model is available there.

## 1. Where a GPU sits relative to the yubiOS trust boundaries

yubiOS anchors every boundary in a YubiKey (ADR-003): UKI signing via PIV 9c,
LUKS2 unlock via FIDO2 `hmac-secret`, SSH/PAM, homed. The fTPM (OP-TEE,
ms-tpm-20-ref) covers platform measurement. A GPU touches none of those
directly, and that is exactly the problem: it is the largest DMA-capable,
firmware-carrying peripheral in the machine, and it sits *inside* the memory
domain those secrets are unsealed into.

Three distinct architectures, three different boundaries:

| Architecture | Who owns the device | DMA reach | Boundary that enforces it |
| --- | --- | --- | --- |
| Emulated `virtio-gpu` | QEMU/host userspace | Guest RAM the hypervisor already owns | Hypervisor + guest kernel; no new peer |
| `vfio-pci` passthrough | Guest, via kernel VFIO | Whatever the IOMMU translation allows | **IOMMU group + iommufd DMA ownership** |
| `vfio-user` device server | A separate userspace process | Only the windows explicitly `DMA_MAP`'d | **The socket + the negotiated DMA windows** |

The consequences for yubiOS:

1. **Passthrough without a working IOMMU is a key-extraction primitive.** A LUKS2
   volume key, once unsealed by the YubiKey, lives in kernel memory. A
   DMA-capable device that is not translated can read it. "No TPM, no OEM, no
   trust anchors you don't control" does not survive a peripheral that can read
   RAM out from under the unlock. So: no passthrough unless the IOMMU is present,
   enabled, and the device is in a group that isolates it.
2. **The gist's recipe is exactly the shape we must not ship by default.**
   Blacklisting host drivers, `vfio-pci` bound at initramfs, devices claimable by
   anything with the right node permissions â every step widens the attack
   surface of the boot path we sign. Passthrough is an opt-in, policy-gated,
   documented deviation, never an image default.
3. **vfio-user is the architecture that fits yubiOS.** The device implementation
   is an unprivileged userspace process, needs no kernel VFIO modules, no IOMMU
   group ownership, and no root binding step. The DMA window is *explicit*
   (`DMA_MAP`), the boundary is a filesystem-permissioned socket, and mutual
   distrust is written into the protocol. It is also the only one of the three
   that is honestly testable in CI without hardware.
4. **The GPU is never in the unlock or measurement path.** No PCR, no UKI
   section, no cryptenroll token may depend on a display device. A vGPU present
   or absent must not change LUKS2/homed/pam-u2f behaviour â which is precisely
   the invariant the new workflow asserts by re-running the whole VM e2e suite
   with a GPU attached.

## 2. Rules (candidate ADR-024)

1. Default yubiOS images ship **`virtio-gpu` only**. No `vfio-pci` autoload, no
   `vfio.conf`, no initramfs binding.
2. Passthrough requires, all of: IOMMU enabled and reporting groups, the target
   device alone in its group (or the whole group assigned), explicit operator
   policy, and a documented deviation. Absent any one, refuse â do not degrade.
3. Prefer **iommufd + device cdev** over the legacy container/group ioctls for
   anything we write; the kernel docs mark the legacy path for deprecation.
4. Userspace device models use **vfio-user**, run unprivileged, with the socket
   mode `0600` and owned by the VMM user. Never expose a vfio-user socket beyond
   a single host namespace until the spec has authentication.
5. **No trust-boundary component may consume GPU state.** Adding or removing a
   vGPU must be a no-op for Secure Boot, LUKS2 FIDO2 unlock, homed, pam-u2f and
   fTPM PCR behaviour.
6. GPU resource limits (quota/lockout) stay a separate concern; see the
   `drm-gpu-quota-secure-time` notes. Nothing here promises a merged upstream
   DRM cgroup controller.

## 3. What is testable where

| Test | Where it can run | Why |
| --- | --- | --- |
| `virtio-gpu-pci` device model present in the CI QEMU | any runner | host-side `-device help` probe |
| `vfio-user-pci` client present (QEMU â¥ 10.1) | any runner with the built QEMU | upstream since 10.1 |
| vfio-user negotiation + `DMA_MAP` against a userspace server | any runner | pure userspace, no kernel VFIO, no IOMMU |
| Guest binds `virtio_gpu`, `/dev/dri/card0` + `renderD128` appear | rock1 self-hosted (KVM) | needs a booted yubiOS guest |
| Negative: no `/dev/vfio`, no `vfio-pci` bound, no IOMMU-group claim in a default guest | rock1 self-hosted | image-policy assertion |
| Full LUKS2 FIDO2 + homed + pam-u2f + fTPM suite **with a vGPU attached** | rock1 self-hosted | invariant #5 above |
| Real `vfio-pci` GPU passthrough, IOMMU isolation, DMA-ownership enforcement | **bare metal only** | needs a real IOMMU + a real GPU |
| Vendor mediated vGPU (NVIDIA vGPU; Intel GVT-g is archived upstream) | **bare metal only** | vendor driver + hardware |
| GPU-accelerated 3D (virgl/Venus with a host GPU) | **bare metal only** | QEMU docs: 3D needs host GPU access |

Hosted GitHub runners are Azure VMs; nested virt is explicitly unsupported by
GitHub and there is no IOMMU. That is why the vGPU workflow inherits
`ci_test-vm.yml`'s matrix and gating rather than inventing a new one: the arm64
self-hosted rock1 leg is the only place a guest actually boots.

## 4. Implementation landed with this doc

- `.github/workflows/ci_test-vgpu-vm.yml` â derived from `ci_test-vm.yml`
  (same lint gate, same host-deps/zstd-QEMU/bcvk-build/KVM/AppArmor preflight,
  same rc contract of 0 pass / 77 loud SKIP / else fail, same artifact upload and
  `ci.yml` callback). It runs **every** `ci_test-vm.yml` leg, with
  `YUBIOS_VGPU=1` in scope, plus two new legs.
- `tests/vm/test-vgpu-virtio-ci.sh` â host-side device-model probe, then a guest
  leg: boot with a virtio-gpu attached and assert the DRM nodes, the bound
  driver, and the negative VFIO surface. SKIPs 77 (naming the gap) when the
  pinned bcvk exposes no QEMU-argument passthrough.
- `tests/vm/test-vfio-user-host-ci.sh` â QEMU version + `vfio-user-pci` probe,
  then a real client/server handshake against a libvfio-user sample server
  (`VFIO_USER_SERVER`), asserting socket mode `0600` and that no kernel `vfio`
  module was loaded. QEMU runs with `-S`, so PCI realize (and the whole
  VERSION/GET_INFO/REGION_INFO negotiation) happens with no guest code running â
  no kernel, no firmware, no disk needed.
- Both dependencies are provisioned in-run by `ci_test-vgpu-vm.yml`, cached under
  `/opt` keyed by pinned commit, same pattern as the zstd QEMU build:
  - **bcvk `--extra-qemu-arg`** â a CI patch applied to the pinned bcvk source
    before `cargo build`, in the same perl-regex style as the existing privileged
    / CAP_SYS_ADMIN / ed25519 / DirectBoot-SSH patches. It adds
    `extra_qemu_args: Vec<String>` to `QemuConfig` (emitted verbatim onto the
    emulator command line), a repeatable `--extra-qemu-arg` clap option on
    `RunEphemeralOpts`, and the wiring between them. `RunEphemeralOpts` already
    derives `Serialize`/`Deserialize` and is handed to the in-container process as
    JSON, so the new field crosses that boundary for free. The cache prefix is
    `-vgpu1`-suffixed so the unpatched binary built by `ci_test-vm.yml` is never
    reused. If a hunk stops applying, the step SKIPs instead of shipping a bcvk
    that silently ignores the flag. Upstreaming it into `yubi-OS/bcvk` retires the
    patch.
  - **libvfio-user** â built from pinned `nutanix/libvfio-user`
    `37491ed9af828fc161238dacd82e83ea35a09f87` (2026-07-23, BSD-3-Clause) with
    meson/ninja, staging `samples/gpio-pci-idio-16` plus `libvfio-user.so*`, then
    smoke-checking that the staged binary actually opens a socket before the test
    leg is allowed to depend on it. That sample is the server the upstream
    `docs/qemu.md` walkthrough uses, and it takes `[-Rv] <socketpath>`.

## 5. Open questions

- Should `--extra-qemu-arg` be a real `yubi-OS/bcvk` PR rather than a CI patch? The
  patch is four small hunks and self-verifying, but it is still a fork-in-CI.
- Build libvfio-user per run (current: pinned source + meson, cached under `/opt`)
  or publish it in a firmware-style OCI bundle like
  `0mniteck/yubios:firmware-qemu-arm64`? The bundle is cheaper per cold runner.
- Do we want a bare-metal passthrough lab leg at all before launch, or is
  "passthrough is out of scope for v1, and here is why" the shipped position?



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
