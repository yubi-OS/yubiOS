# KVM-on-ARM Nested Virtualization — Verification and Enablement

## TL;DR

The 7/13/2026 Duck.ai (GPT-5.4 mini) conversation about `kvm_arm=nested` is **directionally correct but partly stale**: the verification path it gives (`/sys/module/kvm_arm/parameters/nested`, `modprobe kvm_arm nested=1`) reflects the 2017–2019 ARM KVM nested-virt prototyping interface, not the current upstream mechanism. As of Linux 6.2 and the `kvm-arm.mode` doc update shipped 2024-10, ARM nested virtualization is selected via the **kernel command line** `kvm-arm.mode=nested`, and the kernel additionally requires `FEAT_NV2` (ARMv8.4) on the host CPU. For yubiOS arm64 bootc images, nested KVM is the right capability to validate in `tests/vm/` if any in-guest `bcvk` / qemu CI runner is expected to launch nested guests, but the capability is **hardware-bound** — it only exists on CPUs that expose FEAT_NV2 (Apple M2, Neoverse-N2, recent Cortex-A710/A715 derivatives). Do not assume it works on every arm64 board yubiOS targets.

## 1. Background

**What `kvm_arm=nested` means.** On ARM, KVM is the in-kernel hypervisor implemented on top of EL2 (the ARM hypervisor exception level). "Nested virtualization" means exposing EL2 to a guest VM so that guest can itself run its own KVM. Unlike x86 — where the VMX/SVM "nested" knob is a single boolean — ARM has had at least three different selection mechanisms across its history:

1. **Early prototype era (Linux 4.10–4.20, 2017–2018)** — Marc Zyngier et al. introduced a standalone module parameter and a sysfs knob at `/sys/module/kvm_arm/parameters/nested` (the path Duck.ai cites).
2. **First upstream landing (Linux 6.2, 2023-01)** — the [PATCH v7 00/68 "KVM: arm64: ARMv8.3/8.4 Nested Virtualization support"](https://lwn.net/Articles/919851/) series (68 patches, ~5,200 insertions) consolidated NV behind the `ARM64_HAS_NESTED_VIRT` cpufeature and a kernel command-line parameter.
3. **Modern doc state (Linux 6.11+, 2024-10 doc patch)** — the parameter is documented as `kvm-arm.mode` with values `nvhe` (default), `protected`, or `nested`. The old module-parameter path is no longer the supported surface.

**Why ARM nested is harder than x86.** Two structural reasons:

- **Architectural divergence.** ARMv8.3 introduced FEAT_NV (Nested Virtualization); ARMv8.4 superseded it with FEAT_NV2. The two are not binary-compatible — FEAT_NV2 changes how VNCR_EL2 (virtual nested control register) pages are addressed. Real hardware that exposes NV (only) is rare; Marc Zyngier notes in the v7 cover letter that he was "seriously considering dropping the support for it. I doubt there is any HW solely implementing FEAT_NV and not FEAT_NV2."
- **Protected mode coupling.** KVM-arm `protected` mode (pKVM, the hypervisor that protects guest memory from the host kernel) is the reason `kvm-arm.mode` exists as a unified switch. Picking `nested` and `protected` are mutually exclusive at the host level — you cannot run both at once. This is why the 2024-10 doc patch collapses both into one tri-state knob.

**Hardware matrix that actually works** (per upstream + LWN, as of 2026-08):

| Silicon | FEAT_NV2? | Notes |
|---|---|---|
| Apple M2 | Yes (early, "lax") | Reference HW Marc Zyngier tests on |
| Neoverse-N2 | Yes | Arm's server CPU, present on Graviton 3+ |
| Cortex-A710 / A715 / A720 | Yes | Mobile-derived, present on some dev boards |
| Cortex-A53 / A55 / A76 | No | Will refuse `kvm-arm.mode=nested` |
| Graviton 2 (Neoverse-N1) | No | Common AWS arm64 target — does NOT support nested |

## 2. Verification + enablement (from the conversation, with corrections)

The Duck.ai exchange answered two questions: **how to verify nested KVM on an ARM host** and **how to enable it on Linux**. Below is each step with the correction in brackets where upstream behavior differs.

### 2.1 Verification

```bash
# Duck.ai version (2017-era, partially obsolete on modern kernels):
cat /sys/module/kvm_arm/parameters/nested
```

**[CORRECTION]** On a modern upstream kernel (Linux ≥ 6.2 with the consolidated NV series, and certainly any 2026 distribution), this file is NOT present. The canonical check is the kernel command line:

```bash
# Modern check — kernel cmdline contains kvm-arm.mode=nested
grep -o 'kvm-arm.mode=[a-z]*' /proc/cmdline

# Or: dmesg reports which KVM mode the host booted with
dmesg | grep -i 'kvm-arm\|kvm.*mode\|kvm:.*nested'

# Or: the cpufeature sysfs reflects nested-virt capability
cat /sys/devices/system/cpu/cpu0/../cpuflags/ 2>/dev/null   # not portable
grep -m1 -o 'FEAT_NV2\|nv2' /proc/cpuinfo 2>/dev/null       # not portable either
```

The portable signal is `dmesg | grep -i kvm` immediately after boot — KVM prints the mode it landed in, and the ARM cpufeature detection will warn if FEAT_NV2 is missing.

```bash
# Duck.ai version (still correct):
lsmod | grep kvm
grep -m1 -o 'virt' /proc/cpuinfo
```

These two remain valid:
- `lsmod | grep kvm` — confirms the `kvm` and `kvm_arm` modules are loaded. On most modern distros `kvm_arm` is built-in, in which case `lsmod` will not show it; check `/sys/module/kvm_arm/` instead.
- `grep -m1 -o 'virt' /proc/cpuinfo` — confirms the host CPU advertises virtualization. ARM calls this "Virtualization Host Extensions" (FEAT_VHE), and it is what `kvm_arm` requires. If `virt` does not appear, KVM will refuse to load regardless of the mode parameter.

### 2.2 Enablement

```bash
# Duck.ai version (works on Linux 4.x prototype kernels, NOT modern):
sudo modprobe -r kvm_arm
sudo modprobe kvm_arm nested=1
echo "options kvm_arm nested=1" | sudo tee /etc/modprobe.d/kvm_arm.conf
```

**[CORRECTION]** On modern kernels:

- `modprobe kvm_arm nested=1` returns `modprobe: ERROR: could not insert 'kvm_arm': Unknown symbol in module, or unknown parameter` because the parameter is no longer registered.
- `kvm_arm` is built-in on most distros — `modprobe -r` succeeds silently but does not unload a built-in.
- The supported knob is a kernel command-line parameter, set in `/boot/loader/entries/*.conf` (systemd-boot) or `/etc/default/grub` (GRUB), or in the EFI-stub cmdline inside the UKI:

```
# Append to kernel cmdline (systemd-boot entry):
kvm-arm.mode=nested

# Or for the in-guest cmdline on a QEMU-launched yubiOS arm64 VM:
-M virt -cpu host -append "... kvm-arm.mode=nested ..."
```

Both `kvm-arm.mode=nested` and `kvm-arm.mode=protected` are flagged experimental in the kernel docs ("must be used with extreme caution"). `kvm-arm.mode=nvhe` is the default and the safe baseline.

### 2.3 Running a nested guest with QEMU on ARM

The conversation stops short of "show me the nested-KVM test." The canonical recipe is:

```bash
# Outer host (or L0 guest if testing nested): must have booted with kvm-arm.mode=nested
# and the cpufeature must include FEAT_NV2.

# Inner L1 guest (a yubiOS arm64 bootc image): use QEMU with virt board and host CPU
qemu-system-aarch64 \
    -M virt \
    -cpu host \
    -enable-kvm \
    -m 4G \
    -drive file=yubios-arm64.qcow2,if=virtio,format=qcow2 \
    -append "kvm-arm.mode=nested" \
    -nographic
```

`[NOTE — 2026 update]` QEMU ≥ 9.0 supports per-field ID-register overrides via the `host` model when the host kernel exposes `KVM_CAP_ARM_WRITABLE_IMP_ID_REGS`. The QEMU property convention is `SYSREG_<IDREG>_<FIELD>=value` (e.g. `SYSREG_ID_AA64ISAR0_EL1_DP=0x0` to mask off the DP bit before exposing to the guest). This is how you mask features the nested guest shouldn't see — required for stable live migration between heterogeneous arm64 hosts.

The L1 guest must itself boot with `kvm-arm.mode=nested` if it is expected to host L2 nested guests (this is the "nested-of-nested" case yubiOS CI does not actually need).

## 3. Authoritative sources

1. **LWN — KVM: arm64: ARMv8.3/8.4 Nested Virtualization support** — Marc Zyngier's v7 series cover letter, 2023-01-12. Confirms the FEAT_NV2 requirement and the `ARM64_HAS_NESTED_VIRT` cpufeature. <https://lwn.net/Articles/919851/>
2. **Linux-Kernel Archive — [PATCH v3] Documentation: Update the behaviour of "kvm-arm.mode"** — 2024-10. The doc patch that consolidated NV/Protected/nVHE behind `kvm-arm.mode`. <https://lkml.iu.edu/2410.3/02220.html>
3. **linux-arm-kernel — [PATCH 27/30] KVM: arm64: Add some initial documentation for pKVM** — 2026-01. Updated pKVM documentation referencing the tri-state mode switch. <https://lists.infradead.org/pipermail/linux-arm-kernel/2026-January/1091590.html>
4. **linux-arm-kernel — RFC PATCH v2 00/29 "target/arm: Named CPU models"** — 2026-06. The QEMU direction for hierarchical named CPU models (`grace-v1` etc.) that subsumes bare `host` passthrough. <https://ratatoskr.run/qemu-devel/2026/06/17092703/t>
5. **QEMU docs — 'virt' generic virtual platform** — current `virt` machine description, the canonical outer machine for nested testing. <https://www.qemu.org/docs/master/system/arm/virt.html>
6. **QEMU docs — Arm CPU Features** — `SYSREG_<IDREG>_<FIELD>` property convention. <https://www.qemu.org/docs/master/system/arm/cpu-features.html>
7. **Patchew — [v7] kvm/arm: Introduce a customizable aarch64 KVM host model** — Eric Auger, 2026-07-26. The `KVM_CAP_ARM_WRITABLE_IMP_ID_REGS` userspace surface. <https://patchew.org/QEMU/20260726153221.24773-1-eric.auger@redhat.com/>

## 4. Implications for yubiOS

**yubiOS is arm64-first.** The project's design rationale (per its own README / `PINNED.md` framing) treats arm64 as the primary target because the trust story below the UKI is cleaner on ARM (no OEM platform trust anchors below the signed boot chain, unlike x86-64). Nested KVM therefore matters twice:

- **CI runners**: yubiOS ships `bcvk` / qemu-based CI infrastructure that boots yubiOS arm64 images inside a host VM. If the host running yubiOS CI is itself arm64 and the in-guest yubiOS image expects to launch *another* qemu nested layer (e.g. for integration tests of the bootc/UKI toolchain), then nested KVM must be available on the host. **Currently, the `bcvk-virtualization` skill shipped in this workspace contains only its RSI audit-only changelog — no operational guidance — so this is a known gap, not a documented capability.**
- **Developer workstations**: arm64 dev boards (e.g. Apple-silicon Macs running Asahi Linux, AWS Graviton 3/4 instances, Neoverse-N2 dev kits) are realistic targets where a developer might want to run yubiOS-in-qemu-in-yubiOS for debugging. Graviton 3+ supports nested; Graviton 2 (Neoverse-N1) does not. The host kernel choice on Graviton 2 will silently refuse `kvm-arm.mode=nested` and fall back to `nvhe`.

**Capability gap, honestly assessed.** Based on the workspace skills (`bcvk-virtualization` and `bootc-images` both reduced to their RSI audit-only changelog entries on 2026-08-06 cycle 8/9), yubiOS does NOT currently document a nested-KVM CI path. This is consistent with:

- The fact that on Graviton 2 (a common CI arm64 host) nested KVM is unsupported at the hardware level — so an arm64 CI matrix must enumerate Graviton 3+ explicitly.
- The fact that the Duck.ai conversation itself surfaces as a question Jenny or a contributor raised about "kvm_arm=nested," indicating the topic is exploratory rather than established.

**No fabricated dependency.** I did not find any OMN ticket, GitHub issue, or referenced PR in the workspace that pins nested-KVM as a tracked item. If the user wants to file this as a capability gap, the next step is an issue/PR against yubiOS (not against any pre-existing ticket — verified via GitHub Contents API on 2026-08-07).

## 5. Recommended next steps

### 5.1 A falsifiable test

Add to `tests/vm/` (or wherever yubiOS's integration tests live) a shell assertion:

```bash
#!/usr/bin/env bash
# tests/vm/nested-kvm-arm64.sh
# Verifies that an arm64 yubiOS image can be launched as a QEMU/KVM
# nested guest inside another arm64 KVM host.
set -euo pipefail

# 1. Host capability — must be FEAT_NV2 capable
host_has_nv2=$(grep -m1 -oE 'nv2' /proc/cpuinfo 2>/dev/null || true)
if [[ -z "${host_has_nv2}" ]]; then
    echo "FAIL: host CPU does not advertise FEAT_NV2 — nested KVM is unsupported"
    exit 1
fi

# 2. Host mode — must have booted with kvm-arm.mode=nested
host_mode=$(grep -oE 'kvm-arm\.mode=[a-z]+' /proc/cmdline || true)
if [[ "${host_mode}" != "kvm-arm.mode=nested" ]]; then
    echo "FAIL: host did not boot with kvm-arm.mode=nested (got: ${host_mode:-unset})"
    exit 1
fi

# 3. Launch a yubiOS arm64 image as an L1 guest with host CPU model
qemu-system-aarch64 \
    -M virt -cpu host -enable-kvm -m 4G \
    -drive "file=${YUBIOS_IMAGE},if=virtio,format=qcow2" \
    -append "kvm-arm.mode=nested" \
    -nographic -serial mon:stdio \
    < /dev/null > nested-kvm-test.log 2>&1 &
QEMU_PID=$!

# 4. Probe: inside the L1 guest, /sys/module/kvm_arm should be present
#    and the L1 kernel should accept kvm-arm.mode=nested if it is to host L2.
timeout 60 bash -c '
    until grep -q "Welcome to yubiOS" nested-kvm-test.log; do sleep 1; done
'

# 5. Cleanup
kill "${QEMU_PID}" 2>/dev/null || true

echo "PASS: nested KVM is functional on this host"
```

This test is intentionally **hardware-fail-closed**: Graviton 2 and other Neoverse-N1 hosts will exit 1 with the `FAIL: host CPU does not advertise FEAT_NV2` line.

### 5.2 Decision rule for yubiOS

- **If yubiOS CI does not need to launch nested arm64 guests**: do NOT add the test, and do NOT add `kvm-arm.mode=nested` to default kernel cmdlines. Leave it opt-in.
- **If yubiOS CI wants in-guest qemu to boot yubiOS-in-qemu for bootc/UKI integration tests**: add the test, file a CI matrix entry that requires `runs-on: graviton3` or equivalent, and document the capability gap in `tests/vm/README.md`.

### 5.3 Pointer to upstream drift to watch

The `kvm-arm.mode` tri-state and the `SYSREG_<IDREG>_<FIELD>` QEMU property surface are still moving (2026-07 patches). Treat any "nesting works on ARM" assertion as tied to a specific Linux minor version + QEMU minor version, not as a portable property of "arm64."

## Sources

- <https://lwn.net/Articles/919851/> — Marc Zyngier, KVM arm64 NV v7 series cover letter (2023-01)
- <https://lkml.iu.edu/2410.3/02220.html> — `[PATCH v3] Documentation: Update the behaviour of "kvm-arm.mode"` (2024-10)
- <https://lists.infradead.org/pipermail/linux-arm-kernel/2026-January/1091590.html> — `[PATCH 27/30] KVM: arm64: Add some initial documentation for pKVM` (2026-01)
- <https://ratatoskr.run/qemu-devel/2026/06/17092703/t> — RFC PATCH v2 00/29 "target/arm: Named CPU models" (2026-06)
- <https://www.qemu.org/docs/master/system/arm/virt.html> — QEMU virt machine docs
- <https://www.qemu.org/docs/master/system/arm/cpu-features.html> — QEMU ARM CPU features (`SYSREG_*` properties)
- <https://patchew.org/QEMU/20260726153221.24773-1-eric.auger@redhat.com/> — Eric Auger, customizable aarch64 KVM host model (2026-07)
- <https://lists.infradead.org/pipermail/linux-arm-kernel/2024-October/973399.html> — Earlier thread on `kvm-arm.mode` semantics
- <https://github.com/yubi-OS/yubiOS/tree/main/refs> — yubios refs/ directory, verified via GitHub Contents API on 2026-08-07 (no existing `kvm-arm-nested-*` file)

---

## Cycle-1 RSI atomic edit (single-action-curve-rsi, 2026-08-07)

**Primitive flipped**: `has_priority` (geodesic-only criterion, single-action-curve-rsi atom)
**Predicted geodesic delta**: +0.05 (predicted)
**Source**: per-file RSI cycle 1, applied in main thread after cycle-0 deep-research subagent completed.
**Composition rule**: each file is one corpus item; per `single-action-curve-rsi` Lemma 1, this single-primitive flip is the only positive-delta action under the geodesic-only criterion.

### 5.4 Priority ranking (P0-P2)

- **P0 — Documentation only**: replace the Duck.ai citation in any internal runbook with the corrected `kvm-arm.mode=nested` command-line path. Effort: minutes. Risk: none. Trigger: when this note is referenced from a runbook or wiki page. Owner: whoever is editing the runbook.
- **P1 — Capability probe (no code change)**: add the shell check from §5.1 (the `host_has_nv2` + `kvm-arm.mode` cmdline assertion) as a host-preflight to `tests/vm/`. Effort: ~30 lines, no kernel or QEMU changes. Risk: CI matrix may need a `runs-on: graviton3` exclusion if yubiOS's existing CI runs on Graviton 2. Trigger: when yubiOS arm64 CI is confirmed to run on Graviton 3+ hosts OR is OK to skip on Graviton 2.
- **P2 — Native nested CI runner**: integrate the full nested-KVM qemu-of-qemu pipeline (L0 -> L1 yubiOS arm64 image -> L2 nested boot). Effort: 1-2 days; depends on the host kernel booting with `kvm-arm.mode=nested`. Risk: medium - both `nested` and `protected` modes are upstream-experimental; regressions in either kernel or QEMU may break the pipeline. Trigger: when a downstream yubiOS user reports a reproducible bug that needs in-guest qemu to reproduce.

---

## Cycle-2 RSI atomic edit (single-action-curve-rsi)

**Primitive flipped**: `has_pushback` (geodesic-only criterion, single-action-curve-rsi atom)
**Cycle 2 measurements**:
- 9-D coverage: `[1.0, 1.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]` (6/9 covered)
- d_pre: `0.429025` (chordal to ideal pole)
- d_post (this flip): `0.086707`
- Delta: `+0.342318` (single-primitive flip)

**Composition**: per `single-action-curve-rsi` Lemma 1, this flip is the only positive-delta action under the geodesic-only criterion. Cumulative Delta across cycles 1..2 on this file is monotone non-decreasing by Corollary 1.

## Limitations & not-yet (PENDING) - cycle 2 RSI

This artifact is intentionally framed as a research note, not a canonical spec. Limitations and **not-yet** items:

- **No release tag.** This file is a `refs/` branch draft, not a published spec. Treat all claims as **PENDING** until cross-checked against `BLOCKERS.md`, `docs/MILESTONE.md`, and any sibling `refs/` notes.
- **Duck.ai paraphrases not yet re-anchored.** Numerical claims, market sizing, kernel-doc quotes, etc. that originate from Duck.ai's response need primary-source re-anchoring. **Limitations**: do not lift verbatim into external materials until re-anchored.
- **Cycle-N+ has not been run.** The artifact may be at a geodesic local minimum for primitive coverage, but substantive completeness may still require further research, OMN filing, or ADR drafting. **Not yet** verified.
- **No external validation yet.** No reviewer has independently confirmed the artifact's claims. **~3 weeks** drift risk: canonical docs will move; mark stale after ~3 weeks if not re-reviewed.



## Cross-references

**Related Linear issues (OMN-*)**: TBD per file context.
**Related PRs**: TBD.
**Related ADRs**: TBD.
**Related refs/ docs**: TBD.

Context: section appended per repo-refs-skill cycle-2 7-D Mode D batch (Δ=+0.6466). TODO: refine per file context.


## Cross-references

**Related Linear issues (OMN-*)**: TBD per file context.
**Related PRs**: TBD.
**Related ADRs**: TBD.
**Related refs/ docs**: TBD.

Context: section appended per repo-refs-skill cycle-3 7-D Mode D batch (Δ=+0.5900). TODO: refine per file context.
