# yubi-OS Fork Repositories & Branch Catalog (`docs/FORKS.md`)

_Last updated: 2026-11-15 — org-wide fork standardization (1:1 upstream default branch sync, `yubios` branch convention, non-owned branch purge, upstream tag sync, and linear rebase of all owned branches)._

## Standardization Policy

Every fork repository in the `yubi-OS` GitHub organization follows five invariants:

1. **1:1 Default Branch Sync:** Each fork's default branch (`main` or `master`) is synced 1:1 with its upstream parent repository's default branch (`0 ahead, 0 behind`, identical tree).
2. **`yubios` Canonical Integration Branch:** Any commits ahead of upstream live on a dedicated branch named `yubios` (rebased cleanly on top of the synced default branch). Forks with zero yubiOS-authored commits have only their 1:1 default branch.
3. **No Unowned Upstream Branches:** All upstream topic/release/maintenance branches without yubi-OS commits have been deleted.
4. **Synced Upstream Tags:** Upstream release and reference tags are mirrored into each fork so `PINNED.md` release commits and `fetch-released-tag-ref.yml` checks resolve directly from the fork (`optee_os` release tags always match `optee_ftpm` at `4.11.0`).
5. **Linear Rebase of Owned Feature Branches:** Remaining owned feature/release/artifact branches are linearly rebased onto the fresh upstream default branch (`behind_by = 0`).

---

## Summary Matrix (All 15 Forks)

| Fork Repository | Upstream Parent | Default Branch (1:1 SHA) | Latest Upstream Release / Tag | `yubios` Branch SHA (`Ahead`) | Other Owned Branches |
|---|---|---|---|---|---|
| [`yubi-OS/particleos`](https://github.com/yubi-OS/particleos) | [`systemd/particleos`](https://github.com/systemd/particleos) | `main` (`b605add797ba`) | `—` | `72debb729f5d` (`+17`) | `feature/surface-arm64-audio` (`+17`), `feature/surface-arm64-snapdragon` (`+15`), `feature/surface-uefi` (`+9`) |
| [`yubi-OS/bootc`](https://github.com/yubi-OS/bootc) | [`bootc-dev/bootc`](https://github.com/bootc-dev/bootc) | `main` (`0c5dd0649787`) | `v1.17.4` (`7cde7bbe233e`) | `4519e4024f65` (`+18`) | `feature/surface-arm64-audio` (`+18`), `feature/surface-arm64-snapdragon` (`+14`), `feature/surface-arm64-usb4` (`+18`), `feature/surface-x86-uefi` (`+8`) |
| [`yubi-OS/bcvk`](https://github.com/yubi-OS/bcvk) | [`bootc-dev/bcvk`](https://github.com/bootc-dev/bcvk) | `main` (`a3e2327d9ce3`) | `v0.22.0` (`2a0176b11751`) | `35a65a76c9e6` (`+8`) | `feat/ci` (`+3`), `feat/extra-qemu-arg` (`+7`), `feat/swtpm-ci` (`+3`), `feature/native-to-disk` (`+2`), `feature/u2f-hsm-usb-passthrough` (`+2`), `release/v0.22.0-yubios.1` (`+8`) |
| [`yubi-OS/mkosi`](https://github.com/yubi-OS/mkosi) | [`systemd/mkosi`](https://github.com/systemd/mkosi) | `main` (`2fa9a248a2fe`) | `v27.1` (`ecf7f5702bb2`) | `000b5cefe2b1` (`+3`) | `feature/yubiOS-profile` (`+3`) |
| [`yubi-OS/image-builder`](https://github.com/yubi-OS/image-builder) | [`osbuild/image-builder`](https://github.com/osbuild/image-builder) | `main` (`8f5e12276f11`) | `v90.0.0` (`b80d1f9416f2`) | — _(pure 1:1 mirror)_ | — |
| [`yubi-OS/arm-trusted-firmware`](https://github.com/yubi-OS/arm-trusted-firmware) | [`ARM-software/arm-trusted-firmware`](https://github.com/ARM-software/arm-trusted-firmware) | `master` (`a881364e03b0`) | `v2.15.0` (`da738d5eae93`) | `8d96428a33f9` (`+3`) | `feat/ci` (`+3`) |
| [`yubi-OS/optee_os`](https://github.com/yubi-OS/optee_os) | [`OP-TEE/optee_os`](https://github.com/OP-TEE/optee_os) | `master` (`5d9a256b168a`) | `4.11.0` (`f54190f22611`) | `e1181e2d0e40` (`+6`) | `feat/ci` (`+1`), `feat/stmm-volatile-storage-ci-4.11` (`+6`) |
| [`yubi-OS/optee_ftpm`](https://github.com/yubi-OS/optee_ftpm) | [`OP-TEE/optee_ftpm`](https://github.com/OP-TEE/optee_ftpm) | `master` (`f09f4cdad210`) | `4.11.0` (`f09f4cdad210`) | `b78d47800ca1` (`+3`) | `feat/ci` (`+1`), `feat/volatile-nv-ci` (`+3`), `feat/volatile-nv-ci-4.11` (`+3`) |
| [`yubi-OS/ms-tpm-20-ref`](https://github.com/yubi-OS/ms-tpm-20-ref) | [`microsoft/ms-tpm-20-ref`](https://github.com/microsoft/ms-tpm-20-ref) | `main` (`ee21db0a941d`) | `v1.83r1` (`ee21db0a941d`) | `6c893ca8ebbb` (`+1`) | `feat/ci` (`+1`) |
| [`yubi-OS/edk2-rk3588`](https://github.com/yubi-OS/edk2-rk3588) | [`edk2-porting/edk2-rk3588`](https://github.com/edk2-porting/edk2-rk3588) | `master` (`2f3f8265590f`) | `v1.1` (`6a682c0ef3ed`) | — _(pure 1:1 mirror)_ | — |
| [`yubi-OS/edk2`](https://github.com/yubi-OS/edk2) | [`tianocore/edk2`](https://github.com/tianocore/edk2) | `master` (`8628578dacd3`) | `edk2-stable202608` (`2970e5699ba6`) | `77828ba8f2d0` (`+3`) | `feat/ci` (`+3`) |
| [`yubi-OS/edk2-platforms`](https://github.com/yubi-OS/edk2-platforms) | [`tianocore/edk2-platforms`](https://github.com/tianocore/edk2-platforms) | `master` (`4db2845d1442`) | `20260316-before-platform-removals` (`cc384840c440`) | — _(pure 1:1 mirror)_ | — |
| [`yubi-OS/u-boot`](https://github.com/yubi-OS/u-boot) | [`u-boot/u-boot`](https://github.com/u-boot/u-boot) | `main` (`6487c50b8a40`) | `v2026.10` (`5508406582f6`) | `0257c1dedf23` (`+27`) | `artifact/spi-bin` (`+10`), `feat/rk3566-open-tpl` (`+27`) |
| [`yubi-OS/chromium`](https://github.com/yubi-OS/chromium) | [`chromium/chromium`](https://github.com/chromium/chromium) | `main` (`7c5cfc909b83`) | `—` | — _(pure 1:1 mirror)_ | — |
| [`yubi-OS/agent-skills`](https://github.com/yubi-OS/agent-skills) | [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills) | `main` (`39b723ceebf8`) | `0.6.16` (`39b723ceebf8`) | — _(pure 1:1 mirror)_ | — |

---

## Per-Fork Branch & Commit Catalog

### 1. `yubi-OS/particleos`

- **Upstream Parent:** [`systemd/particleos`](https://github.com/systemd/particleos)
- **Default Branch (`main`):** `b605add797ba65853eb79f8170c4a5743a6f4b1f` _(synced 1:1 with `systemd/particleos:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** None published upstream (rolling `main`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `b605add797ba65853eb79f8170c4a5743a6f4b1f` | `+0 / -0` | `0` | 1:1 mirror of upstream `systemd/particleos:main`. |
| `yubios` | `72debb729f5d8bdf6d1c77002813529ef8c6544d` | `+17 / -0` | `15` | Canonical yubiOS integration branch for ParticleOS: Microsoft Surface ARM64 (Snapdragon X Elite) and x86 profiles, Fedora/Debian ARM64 distro configs, Qualcomm QRTR/PD-mapper services, s2idle sleep config, firstboot Secure Boot enrollment, and LPASS/Q6DSP WirePlumber audio routing. |
| `feature/surface-arm64-audio` | `72debb729f5d8bdf6d1c77002813529ef8c6544d` | `+17 / -0` | `15` | Surface ARM64 (Snapdragon X Elite) mkosi profile with LPASS/Q6DSP audio packages, `snd_soc_sc8280xp` + Q6ASM modprobe options, and WirePlumber Q6DSP routing policy. |
| `feature/surface-arm64-snapdragon` | `b3853a7ffaa024fded77ac472013a57b711ee990` | `+15 / -0` | `12` | Surface ARM64 base Snapdragon X Elite mkosi profile (Fedora/Debian ARM64 distro configs, `tpm_crb`/QRTR modprobe, `qrtr-ns` and `pd-mapper` services, firstboot Secure Boot enrollment, and `linux-firmware` fix). |
| `feature/surface-uefi` | `da01b8203032e3f7ef48b2b5d5c13022b30ff743` | `+9 / -0` | `9` | Surface x86 UEFI mkosi profile (Fedora/Debian/Arch `linux-surface` distro configs, Surface modprobe options, Type Cover udev wakeup rule, `iptsd` touch daemon config, and sleep config). |

#### `yubi-OS/particleos` — `yubios` (`72debb729f5d8bdf6d1c77002813529ef8c6544d`, 17 commits ahead of `main`)

- `719d5e9c63f6` (`corning-croak-cable`): surface-arm64: add main arm64 profile (Snapdragon X Elite)
- `1a8ecd62ec89` (`corning-croak-cable`): surface-arm64: add fedora arm64 distro config (upstream kernel, Qualcomm stack)
- `e404cf52d445` (`corning-croak-cable`): surface-arm64: add debian arm64 distro config (unstable, upstream kernel)
- `07e90b368f79` (`corning-croak-cable`): surface-arm64: add modprobe config (tpm_crb, qrtr tuning)
- `d8fcc2008a43` (`corning-croak-cable`): surface-arm64: add qrtr-ns service for Qualcomm IPC routing
- `17f2f6c59120` (`corning-croak-cable`): surface-arm64: add pd-mapper service
- `fc00991da18e` (`corning-croak-cable`): surface-arm64: add firstboot Secure Boot enrollment service
- `254462f87130` (`corning-croak-cable`): surface-arm64: add Secure Boot enrollment script (NX Mode workaround)
- `5446742d135c` (`corning-croak-cable`): surface-arm64: add preset enabling Qualcomm and enrollment services
- `00567180b6bd` (`corning-croak-cable`): surface-arm64: add sleep config (s2idle/freeze only - no S3 on Snapdragon)
- `6b9a2b1ae14b` (`corning-croak-cable`): surface-arm64: add ADR for design decisions
- `0f10a2e419cd` (`corning-croak-cable`): surface-arm64: add README
- `1f3543c79c31` (`foil-copy-overrate`): ci: add surface-arm64 mkosi profile validation workflow (2026/)
- `ad420d1ce597` (`foil-copy-overrate`): feat(surface-arm64-audio): add LPASS/Q6DSP audio packages to mkosi profile
- `b2ed0d3419fe` (`foil-copy-overrate`): feat(surface-arm64-audio): add snd_soc_sc8280xp + Q6ASM modprobe options
- `f1c30bd54920` (`foil-copy-overrate`): feat(surface-arm64-audio): add WirePlumber Q6DSP routing policy
- `72debb729f5d` (`foil-copy-overrate`): Delete 2026 directory

#### `yubi-OS/particleos` — `feature/surface-arm64-audio` (`72debb729f5d8bdf6d1c77002813529ef8c6544d`, 17 commits ahead of `main`)

- `719d5e9c63f6` (`corning-croak-cable`): surface-arm64: add main arm64 profile (Snapdragon X Elite)
- `1a8ecd62ec89` (`corning-croak-cable`): surface-arm64: add fedora arm64 distro config (upstream kernel, Qualcomm stack)
- `e404cf52d445` (`corning-croak-cable`): surface-arm64: add debian arm64 distro config (unstable, upstream kernel)
- `07e90b368f79` (`corning-croak-cable`): surface-arm64: add modprobe config (tpm_crb, qrtr tuning)
- `d8fcc2008a43` (`corning-croak-cable`): surface-arm64: add qrtr-ns service for Qualcomm IPC routing
- `17f2f6c59120` (`corning-croak-cable`): surface-arm64: add pd-mapper service
- `fc00991da18e` (`corning-croak-cable`): surface-arm64: add firstboot Secure Boot enrollment service
- `254462f87130` (`corning-croak-cable`): surface-arm64: add Secure Boot enrollment script (NX Mode workaround)
- `5446742d135c` (`corning-croak-cable`): surface-arm64: add preset enabling Qualcomm and enrollment services
- `00567180b6bd` (`corning-croak-cable`): surface-arm64: add sleep config (s2idle/freeze only - no S3 on Snapdragon)
- `6b9a2b1ae14b` (`corning-croak-cable`): surface-arm64: add ADR for design decisions
- `0f10a2e419cd` (`corning-croak-cable`): surface-arm64: add README
- `1f3543c79c31` (`foil-copy-overrate`): ci: add surface-arm64 mkosi profile validation workflow (2026/)
- `ad420d1ce597` (`foil-copy-overrate`): feat(surface-arm64-audio): add LPASS/Q6DSP audio packages to mkosi profile
- `b2ed0d3419fe` (`foil-copy-overrate`): feat(surface-arm64-audio): add snd_soc_sc8280xp + Q6ASM modprobe options
- `f1c30bd54920` (`foil-copy-overrate`): feat(surface-arm64-audio): add WirePlumber Q6DSP routing policy
- `72debb729f5d` (`foil-copy-overrate`): Delete 2026 directory

#### `yubi-OS/particleos` — `feature/surface-arm64-snapdragon` (`b3853a7ffaa024fded77ac472013a57b711ee990`, 15 commits ahead of `main`)

- `719d5e9c63f6` (`corning-croak-cable`): surface-arm64: add main arm64 profile (Snapdragon X Elite)
- `1a8ecd62ec89` (`corning-croak-cable`): surface-arm64: add fedora arm64 distro config (upstream kernel, Qualcomm stack)
- `e404cf52d445` (`corning-croak-cable`): surface-arm64: add debian arm64 distro config (unstable, upstream kernel)
- `07e90b368f79` (`corning-croak-cable`): surface-arm64: add modprobe config (tpm_crb, qrtr tuning)
- `d8fcc2008a43` (`corning-croak-cable`): surface-arm64: add qrtr-ns service for Qualcomm IPC routing
- `17f2f6c59120` (`corning-croak-cable`): surface-arm64: add pd-mapper service
- `fc00991da18e` (`corning-croak-cable`): surface-arm64: add firstboot Secure Boot enrollment service
- `254462f87130` (`corning-croak-cable`): surface-arm64: add Secure Boot enrollment script (NX Mode workaround)
- `5446742d135c` (`corning-croak-cable`): surface-arm64: add preset enabling Qualcomm and enrollment services
- `00567180b6bd` (`corning-croak-cable`): surface-arm64: add sleep config (s2idle/freeze only - no S3 on Snapdragon)
- `6b9a2b1ae14b` (`corning-croak-cable`): surface-arm64: add ADR for design decisions
- `0f10a2e419cd` (`corning-croak-cable`): surface-arm64: add README
- `1f3543c79c31` (`foil-copy-overrate`): ci: add surface-arm64 mkosi profile validation workflow (2026/)
- `d55f4b9e37b2` (`foil-copy-overrate`): fix(surface-arm64): replace qcom-firmware with linux-firmware (correct Fedora package name)
- `b3853a7ffaa0` (`foil-copy-overrate`): Delete 2026 directory

#### `yubi-OS/particleos` — `feature/surface-uefi` (`da01b8203032e3f7ef48b2b5d5c13022b30ff743`, 9 commits ahead of `main`)

- `4da06aa81bb1` (`corning-croak-cable`): surface: add main profile config
- `9d0e4c8df6a6` (`corning-croak-cable`): surface: add fedora distro config (linux-surface COPR)
- `7032a9dd6320` (`corning-croak-cable`): surface: add debian distro config (linux-surface repo)
- `0ebbd7bb7973` (`corning-croak-cable`): surface: add arch distro config (linux-surface repo)
- `bdb8df222749` (`corning-croak-cable`): surface: add modprobe options for Surface hardware
- `c5dfd0d7a609` (`corning-croak-cable`): surface: add udev rule to enable Type Cover wakeup
- `8c4f52ee54e7` (`corning-croak-cable`): surface: add iptsd touch daemon config
- `aadc8bf20bf2` (`corning-croak-cable`): surface: add systemd sleep config for Surface power management
- `da01b8203032` (`corning-croak-cable`): surface: add README for Surface profile

---

### 2. `yubi-OS/bootc`

- **Upstream Parent:** [`bootc-dev/bootc`](https://github.com/bootc-dev/bootc)
- **Default Branch (`main`):** `0c5dd0649787f1af62933cf2a2f448a35acf9f8f` _(synced 1:1 with `bootc-dev/bootc:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `v1.17.4` (`7cde7bbe233ee45a40cff3d89d4f42b68a258d46`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `0c5dd0649787f1af62933cf2a2f448a35acf9f8f` | `+0 / -0` | `0` | 1:1 mirror of upstream `bootc-dev/bootc:main`. |
| `yubios` | `4519e4024f654660b432564f08a4feba2b23b638` | `+18 / -0` | `15` | Canonical yubiOS integration branch for bootc: Surface ARM64 (Snapdragon X Elite) bootc Containerfile and install configs (systemd-boot, DPS, Qualcomm kargs, `tpm_crb`, `qrtr-ns`, `pd-mapper`, firstboot Secure Boot enrollment) plus LPASS/Q6DSP audio (`snd_soc_sc8280xp`, WirePlumber policy, `x1e80100` UCM docs, PipeWire/ALSA packages). |
| `feature/surface-arm64-audio` | `4519e4024f654660b432564f08a4feba2b23b638` | `+18 / -0` | `15` | Surface ARM64 bootc profile with Qualcomm Snapdragon X Elite support and LPASS/Q6DSP audio routing (`snd_soc_sc8280xp`, WirePlumber policy, PipeWire/ALSA UCM packages). |
| `feature/surface-arm64-snapdragon` | `80d73fc15ab95663e7afcc10b86ec9a1fd7b355b` | `+14 / -0` | `12` | Surface ARM64 base Snapdragon X Elite bootc profile (systemd-boot DPS install config, Qualcomm kargs, `tpm_crb`, `qrtr-ns`, `pd-mapper`, firstboot Secure Boot enrollment, digest-pinned `fedora-bootc` Containerfile). |
| `feature/surface-arm64-usb4` | `4589ea589014d67f53efc2d90ed4cc39ad7a0d3f` | `+18 / -0` | `16` | Surface ARM64 Snapdragon X Elite bootc profile extended with USB4/Thunderbolt udev authorization rules, Surface Dock support, modprobe options, and `surface-usb4.service` preset. |
| `feature/surface-x86-uefi` | `95e2eeacd79352869fbc00702e3be658b09da6e5` | `+8 / -0` | `8` | Surface x86 UEFI bootc profile (`linux-surface` kernel Containerfile, systemd-boot DPS install config, Surface kargs, Type Cover wakeup udev rule, `iptsd` and `thermald` presets). |

#### `yubi-OS/bootc` — `yubios` (`4519e4024f654660b432564f08a4feba2b23b638`, 18 commits ahead of `main`)

- `3e5c57fe2810` (`corning-croak-cable`): surface/arm64: add bootc install config (systemd-boot, DPS, Qualcomm kargs, no tpm2-luks)
- `94fb3b84d184` (`corning-croak-cable`): surface/arm64: add kargs.d (clk_ignore_unused, pd_ignore_unused)
- `d4bccb2187ec` (`corning-croak-cable`): surface/arm64: add modprobe config (tpm_crb forced, tpm_tis blacklisted, qrtr tuning)
- `1227e4a11d87` (`corning-croak-cable`): surface/arm64: add sleep config (s2idle/freeze only - no S3 on Snapdragon)
- `5a0cae2adee6` (`corning-croak-cable`): surface/arm64: add qrtr-ns service for Qualcomm IPC routing
- `14b75d6ae0ae` (`corning-croak-cable`): surface/arm64: add pd-mapper service for Qualcomm protection domain mapping
- `953eac3c1946` (`corning-croak-cable`): surface/arm64: add firstboot Secure Boot enrollment service (NX Mode workaround)
- `44d096a17958` (`corning-croak-cable`): surface/arm64: add Secure Boot enrollment script (NX Mode workaround, sbctl)
- `00074868bda3` (`corning-croak-cable`): surface/arm64: add systemd preset enabling Qualcomm and enrollment services
- `7d03f63c1f78` (`corning-croak-cable`): surface/arm64: add Fedora bootc Containerfile (upstream kernel, Qualcomm stack, sbctl)
- `dd25ed056756` (`corning-croak-cable`): surface/arm64: add README
- `82418801644e` (`foil-copy-overrate`): fix(surface-arm64): pin fedora-bootc to digest, add containers.bootc=1 label
- `0f91e1007714` (`foil-copy-overrate`): fix(surface-arm64): oneshot sb-enroll service with ConditionPathExists guard
- `80d73fc15ab9` (`foil-copy-overrate`): ci: add surface-arm64 build validation workflow (2026/)
- `d67b69473ab1` (`foil-copy-overrate`): feat(surface-arm64-audio): add snd_soc_sc8280xp + Q6ASM modprobe options
- `7272e395b5a5` (`foil-copy-overrate`): feat(surface-arm64-audio): add WirePlumber Q6DSP routing policy
- `f75ab7b6a8cc` (`foil-copy-overrate`): docs(surface-arm64-audio): document x1e80100 UCM profile status and workaround
- `4519e4024f65` (`foil-copy-overrate`): feat(surface-arm64-audio): add audio packages (alsa-ucm-conf, pipewire, wireplumber)

#### `yubi-OS/bootc` — `feature/surface-arm64-audio` (`4519e4024f654660b432564f08a4feba2b23b638`, 18 commits ahead of `main`)

- `3e5c57fe2810` (`corning-croak-cable`): surface/arm64: add bootc install config (systemd-boot, DPS, Qualcomm kargs, no tpm2-luks)
- `94fb3b84d184` (`corning-croak-cable`): surface/arm64: add kargs.d (clk_ignore_unused, pd_ignore_unused)
- `d4bccb2187ec` (`corning-croak-cable`): surface/arm64: add modprobe config (tpm_crb forced, tpm_tis blacklisted, qrtr tuning)
- `1227e4a11d87` (`corning-croak-cable`): surface/arm64: add sleep config (s2idle/freeze only - no S3 on Snapdragon)
- `5a0cae2adee6` (`corning-croak-cable`): surface/arm64: add qrtr-ns service for Qualcomm IPC routing
- `14b75d6ae0ae` (`corning-croak-cable`): surface/arm64: add pd-mapper service for Qualcomm protection domain mapping
- `953eac3c1946` (`corning-croak-cable`): surface/arm64: add firstboot Secure Boot enrollment service (NX Mode workaround)
- `44d096a17958` (`corning-croak-cable`): surface/arm64: add Secure Boot enrollment script (NX Mode workaround, sbctl)
- `00074868bda3` (`corning-croak-cable`): surface/arm64: add systemd preset enabling Qualcomm and enrollment services
- `7d03f63c1f78` (`corning-croak-cable`): surface/arm64: add Fedora bootc Containerfile (upstream kernel, Qualcomm stack, sbctl)
- `dd25ed056756` (`corning-croak-cable`): surface/arm64: add README
- `82418801644e` (`foil-copy-overrate`): fix(surface-arm64): pin fedora-bootc to digest, add containers.bootc=1 label
- `0f91e1007714` (`foil-copy-overrate`): fix(surface-arm64): oneshot sb-enroll service with ConditionPathExists guard
- `80d73fc15ab9` (`foil-copy-overrate`): ci: add surface-arm64 build validation workflow (2026/)
- `d67b69473ab1` (`foil-copy-overrate`): feat(surface-arm64-audio): add snd_soc_sc8280xp + Q6ASM modprobe options
- `7272e395b5a5` (`foil-copy-overrate`): feat(surface-arm64-audio): add WirePlumber Q6DSP routing policy
- `f75ab7b6a8cc` (`foil-copy-overrate`): docs(surface-arm64-audio): document x1e80100 UCM profile status and workaround
- `4519e4024f65` (`foil-copy-overrate`): feat(surface-arm64-audio): add audio packages (alsa-ucm-conf, pipewire, wireplumber)

#### `yubi-OS/bootc` — `feature/surface-arm64-snapdragon` (`80d73fc15ab95663e7afcc10b86ec9a1fd7b355b`, 14 commits ahead of `main`)

- `3e5c57fe2810` (`corning-croak-cable`): surface/arm64: add bootc install config (systemd-boot, DPS, Qualcomm kargs, no tpm2-luks)
- `94fb3b84d184` (`corning-croak-cable`): surface/arm64: add kargs.d (clk_ignore_unused, pd_ignore_unused)
- `d4bccb2187ec` (`corning-croak-cable`): surface/arm64: add modprobe config (tpm_crb forced, tpm_tis blacklisted, qrtr tuning)
- `1227e4a11d87` (`corning-croak-cable`): surface/arm64: add sleep config (s2idle/freeze only - no S3 on Snapdragon)
- `5a0cae2adee6` (`corning-croak-cable`): surface/arm64: add qrtr-ns service for Qualcomm IPC routing
- `14b75d6ae0ae` (`corning-croak-cable`): surface/arm64: add pd-mapper service for Qualcomm protection domain mapping
- `953eac3c1946` (`corning-croak-cable`): surface/arm64: add firstboot Secure Boot enrollment service (NX Mode workaround)
- `44d096a17958` (`corning-croak-cable`): surface/arm64: add Secure Boot enrollment script (NX Mode workaround, sbctl)
- `00074868bda3` (`corning-croak-cable`): surface/arm64: add systemd preset enabling Qualcomm and enrollment services
- `7d03f63c1f78` (`corning-croak-cable`): surface/arm64: add Fedora bootc Containerfile (upstream kernel, Qualcomm stack, sbctl)
- `dd25ed056756` (`corning-croak-cable`): surface/arm64: add README
- `82418801644e` (`foil-copy-overrate`): fix(surface-arm64): pin fedora-bootc to digest, add containers.bootc=1 label
- `0f91e1007714` (`foil-copy-overrate`): fix(surface-arm64): oneshot sb-enroll service with ConditionPathExists guard
- `80d73fc15ab9` (`foil-copy-overrate`): ci: add surface-arm64 build validation workflow (2026/)

#### `yubi-OS/bootc` — `feature/surface-arm64-usb4` (`4589ea589014d67f53efc2d90ed4cc39ad7a0d3f`, 18 commits ahead of `main`)

- `3e5c57fe2810` (`corning-croak-cable`): surface/arm64: add bootc install config (systemd-boot, DPS, Qualcomm kargs, no tpm2-luks)
- `94fb3b84d184` (`corning-croak-cable`): surface/arm64: add kargs.d (clk_ignore_unused, pd_ignore_unused)
- `d4bccb2187ec` (`corning-croak-cable`): surface/arm64: add modprobe config (tpm_crb forced, tpm_tis blacklisted, qrtr tuning)
- `1227e4a11d87` (`corning-croak-cable`): surface/arm64: add sleep config (s2idle/freeze only - no S3 on Snapdragon)
- `5a0cae2adee6` (`corning-croak-cable`): surface/arm64: add qrtr-ns service for Qualcomm IPC routing
- `14b75d6ae0ae` (`corning-croak-cable`): surface/arm64: add pd-mapper service for Qualcomm protection domain mapping
- `953eac3c1946` (`corning-croak-cable`): surface/arm64: add firstboot Secure Boot enrollment service (NX Mode workaround)
- `44d096a17958` (`corning-croak-cable`): surface/arm64: add Secure Boot enrollment script (NX Mode workaround, sbctl)
- `00074868bda3` (`corning-croak-cable`): surface/arm64: add systemd preset enabling Qualcomm and enrollment services
- `7d03f63c1f78` (`corning-croak-cable`): surface/arm64: add Fedora bootc Containerfile (upstream kernel, Qualcomm stack, sbctl)
- `dd25ed056756` (`corning-croak-cable`): surface/arm64: add README
- `82418801644e` (`foil-copy-overrate`): fix(surface-arm64): pin fedora-bootc to digest, add containers.bootc=1 label
- `0f91e1007714` (`foil-copy-overrate`): fix(surface-arm64): oneshot sb-enroll service with ConditionPathExists guard
- `80d73fc15ab9` (`foil-copy-overrate`): ci: add surface-arm64 build validation workflow (2026/)
- `1582d3f5859d` (`foil-copy-overrate`): feat(surface-arm64-usb4): add USB4 udev authorization rules + Surface Dock support
- `4b6b22a62016` (`foil-copy-overrate`): feat(surface-arm64-usb4): add Thunderbolt/USB4 modprobe options
- `c7043cb78495` (`foil-copy-overrate`): feat(surface-arm64-usb4): add USB4 authorization oneshot service
- `4589ea589014` (`foil-copy-overrate`): feat(surface-arm64-usb4): enable surface-usb4.service via preset

#### `yubi-OS/bootc` — `feature/surface-x86-uefi` (`95e2eeacd79352869fbc00702e3be658b09da6e5`, 8 commits ahead of `main`)

- `8ccf9a75fe30` (`corning-croak-cable`): surface/x86: add bootc install config (systemd-boot, DPS, Surface kargs)
- `dc2962710344` (`corning-croak-cable`): surface/x86: add kargs.d for Surface-specific persistent kernel args
- `f8d9ef87826b` (`corning-croak-cable`): surface/x86: add modprobe options (usbhid, pcspkr blacklist)
- `5fcaec064422` (`corning-croak-cable`): surface/x86: add systemd sleep config (prefer S3/deep)
- `c7f077ea84fc` (`corning-croak-cable`): surface/x86: add udev wakeup rule for Type Cover
- `6ae61c69b23d` (`corning-croak-cable`): surface/x86: add systemd preset enabling iptsd and thermald
- `38359adadac8` (`corning-croak-cable`): surface/x86: add Fedora bootc Containerfile (linux-surface kernel, iptsd)
- `95e2eeacd793` (`corning-croak-cable`): surface/x86: add README

---

### 3. `yubi-OS/bcvk`

- **Upstream Parent:** [`bootc-dev/bcvk`](https://github.com/bootc-dev/bcvk)
- **Default Branch (`main`):** `a3e2327d9ce3448242cbb62cbdf20ef47a534752` _(synced 1:1 with `bootc-dev/bcvk:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `v0.22.0` (`2a0176b11751b385806fd3cd184e39aec5a955e9`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `a3e2327d9ce3448242cbb62cbdf20ef47a534752` | `+0 / -0` | `0` | 1:1 mirror of upstream `bootc-dev/bcvk:main`. |
| `yubios` | `35a65a76c9e6aa97b2649e2d19d8354a34099924` | `+8 / -0` | `20` | Canonical yubiOS integration branch for bcvk: integrates `native-to-disk` direct block-device installer, `--u2f-hsm` USB passthrough, `--swtpm` software TPM 2.0, `--swu2f` in-guest `/dev/uhid` FIDO2/U2F authenticator, virtiofsd disk logging + host-side rbind chroot entrypoint + ARM64 DirectBoot `tmpfiles.extra` SSH credential helper, `--extra-qemu-arg` CLI option, and `.github/workflows/yubios-release.yml` + `RELEASING.md`. |
| `feat/ci` | `53876ad8654deaaca75517b3a245cc07f3b94b0a` | `+3 / -0` | `1` | Multi-arch native Rust unit test + advisory clippy CI workflow (`.github/workflows/ci_test.yml`) on bare amd64 and arm64 runners. |
| `feat/extra-qemu-arg` | `fe4138cf76ae3667ff40b40a8519d5264b639852` | `+7 / -0` | `18` | Adds `--extra-qemu-arg` CLI option and `QemuConfig` field (plus unified yubiOS CLI wiring for `native-to-disk`, `--u2f-hsm`, `--swtpm`, `--swu2f`). |
| `feat/swtpm-ci` | `92976ac118552053150c8c10a7c3c4f752acd59b` | `+3 / -0` | `9` | Adds `--swtpm` software TPM 2.0 and `--swu2f` in-guest `/dev/uhid` FIDO2 authenticator support for ephemeral CI VMs, plus virtiofsd startup error logging and AppArmor confinement fixes. |
| `feature/native-to-disk` | `34769eab5dce74c977b9774566433bd20ccf09eb` | `+2 / -0` | `2` | Adds `bcvk native-to-disk` subcommand (`native_to_disk.rs`) for direct block-device installation via privileged Podman without QEMU. |
| `feature/u2f-hsm-usb-passthrough` | `f7a1cac93fbb7f75f7415e4811097080d439cd28` | `+2 / -0` | `5` | Adds U2F/HSM sysfs detection (`usb_passthrough.rs`), QEMU `usb-host` passthrough args, and `--u2f-hsm` CLI flag for ephemeral VMs. |
| `release/v0.22.0-yubios.1` | `35a65a76c9e6aa97b2649e2d19d8354a34099924` | `+8 / -0` | `20` | Release branch tracking `yubios` on top of upstream `v0.22.0` / `main` for building and publishing `bcvk-amd64` and `bcvk-arm64` release binaries. |

#### `yubi-OS/bcvk` — `yubios` (`35a65a76c9e6aa97b2649e2d19d8354a34099924`, 8 commits ahead of `main`)

- `76313c3337f1` (`corning-croak-cable`): feat(native-to-disk): add native block-device installer
- `34769eab5dce` (`corning-croak-cable`): feat(native-to-disk): wire native-to-disk subcommand into CLI
- `bc6612067043` (`corning-croak-cable`): feat(usb-passthrough): U2F/HSM sysfs detection + QEMU usb-host args and docs
- `aa892f626ce4` (`foil-copy-overrate`): feat(swtpm): software TPM 2.0 for ephemeral CI VMs (--swtpm)
- `c9691e2c407d` (`foil-copy-overrate`): feat(swu2f): in-guest /dev/uhid software FIDO2/U2F authenticator for CI VMs (--swu2f)
- `fd80f2c789ab` (`foil-copy-overrate`): fix(qemu,ephemeral): virtiofsd disk logging, host-side rbind chroot entrypoint, and credential helpers
- `fe4138cf76ae` (`foil-copy-overrate`): feat(qemu): --extra-qemu-arg CLI option + QemuConfig field and unified yubiOS CLI wiring (#8)
- `35a65a76c9e6` (`foil-copy-overrate`): ci(release): add yubi-OS-owned release workflow + RELEASING.md (OMN-105/106)

#### `yubi-OS/bcvk` — `feat/ci` (`53876ad8654deaaca75517b3a245cc07f3b94b0a`, 3 commits ahead of `main`)

- `6f8584308301` (`foil-copy-overrate`): ci: add multi-arch native CI (amd64 + arm64 Rust test/clippy); pinned per PINNED.md
- `871e0d52bee9` (`foil-copy-overrate`): ci: run on bare multi-arch runners (Rust needs full C toolchain the hardened dhi base omits)
- `53876ad8654d` (`foil-copy-overrate`): ci: clippy advisory (continue-on-error) pending upstream lint cleanup; unit gate stays authoritative

#### `yubi-OS/bcvk` — `feat/extra-qemu-arg` (`fe4138cf76ae3667ff40b40a8519d5264b639852`, 7 commits ahead of `main`)

- `76313c3337f1` (`corning-croak-cable`): feat(native-to-disk): add native block-device installer
- `34769eab5dce` (`corning-croak-cable`): feat(native-to-disk): wire native-to-disk subcommand into CLI
- `bc6612067043` (`corning-croak-cable`): feat(usb-passthrough): U2F/HSM sysfs detection + QEMU usb-host args and docs
- `aa892f626ce4` (`foil-copy-overrate`): feat(swtpm): software TPM 2.0 for ephemeral CI VMs (--swtpm)
- `c9691e2c407d` (`foil-copy-overrate`): feat(swu2f): in-guest /dev/uhid software FIDO2/U2F authenticator for CI VMs (--swu2f)
- `fd80f2c789ab` (`foil-copy-overrate`): fix(qemu,ephemeral): virtiofsd disk logging, host-side rbind chroot entrypoint, and credential helpers
- `fe4138cf76ae` (`foil-copy-overrate`): feat(qemu): --extra-qemu-arg CLI option + QemuConfig field and unified yubiOS CLI wiring (#8)

#### `yubi-OS/bcvk` — `feat/swtpm-ci` (`92976ac118552053150c8c10a7c3c4f752acd59b`, 3 commits ahead of `main`)

- `545b8c95c528` (`foil-copy-overrate`): feat(swtpm): software TPM 2.0 for ephemeral CI VMs (--swtpm)
- `20b4d96068a7` (`foil-copy-overrate`): feat(swu2f): in-guest /dev/uhid software FIDO2/U2F authenticator for CI VMs (--swu2f)
- `92976ac11855` (`foil-copy-overrate`): fix(qemu,ephemeral): log virtiofsd stdout+stderr on startup failure and disable AppArmor confinement

#### `yubi-OS/bcvk` — `feature/native-to-disk` (`34769eab5dce74c977b9774566433bd20ccf09eb`, 2 commits ahead of `main`)

- `76313c3337f1` (`corning-croak-cable`): feat(native-to-disk): add native block-device installer
- `34769eab5dce` (`corning-croak-cable`): feat(native-to-disk): wire native-to-disk subcommand into CLI

#### `yubi-OS/bcvk` — `feature/u2f-hsm-usb-passthrough` (`f7a1cac93fbb7f75f7415e4811097080d439cd28`, 2 commits ahead of `main`)

- `f25119ac64fc` (`corning-croak-cable`): feat(usb-passthrough): U2F/HSM sysfs detection + QEMU usb-host args and docs
- `f7a1cac93fbb` (`foil-copy-overrate`): feat(usb-passthrough): wire usb_passthrough into bcvk-qemu and --u2f-hsm CLI flag

#### `yubi-OS/bcvk` — `release/v0.22.0-yubios.1` (`35a65a76c9e6aa97b2649e2d19d8354a34099924`, 8 commits ahead of `main`)

- `76313c3337f1` (`corning-croak-cable`): feat(native-to-disk): add native block-device installer
- `34769eab5dce` (`corning-croak-cable`): feat(native-to-disk): wire native-to-disk subcommand into CLI
- `bc6612067043` (`corning-croak-cable`): feat(usb-passthrough): U2F/HSM sysfs detection + QEMU usb-host args and docs
- `aa892f626ce4` (`foil-copy-overrate`): feat(swtpm): software TPM 2.0 for ephemeral CI VMs (--swtpm)
- `c9691e2c407d` (`foil-copy-overrate`): feat(swu2f): in-guest /dev/uhid software FIDO2/U2F authenticator for CI VMs (--swu2f)
- `fd80f2c789ab` (`foil-copy-overrate`): fix(qemu,ephemeral): virtiofsd disk logging, host-side rbind chroot entrypoint, and credential helpers
- `fe4138cf76ae` (`foil-copy-overrate`): feat(qemu): --extra-qemu-arg CLI option + QemuConfig field and unified yubiOS CLI wiring (#8)
- `35a65a76c9e6` (`foil-copy-overrate`): ci(release): add yubi-OS-owned release workflow + RELEASING.md (OMN-105/106)

---

### 4. `yubi-OS/mkosi`

- **Upstream Parent:** [`systemd/mkosi`](https://github.com/systemd/mkosi)
- **Default Branch (`main`):** `2fa9a248a2fecebb0dd64a34c0fecdc5ca8335b9` _(synced 1:1 with `systemd/mkosi:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `v27.1` (`ecf7f5702bb2052b7a69cab3fe7d37bc3b9ad77b`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `2fa9a248a2fecebb0dd64a34c0fecdc5ca8335b9` | `+0 / -0` | `0` | 1:1 mirror of upstream `systemd/mkosi:main`. |
| `yubios` | `000b5cefe2b130e928fcfe6a649b417d6f78f66d` | `+3 / -0` | `4` | Canonical yubiOS integration branch for mkosi: adds the `yubiOS` mkosi build profile with U2F/HSM PIV signing + FIDO2 enrollment and repo-agnostic CI validation (`mkosi summary`, `shellcheck`, `ruff`). |
| `feature/yubiOS-profile` | `000b5cefe2b130e928fcfe6a649b417d6f78f66d` | `+3 / -0` | `4` | Adds the `yubiOS` mkosi build profile with PIV signing + FIDO2 enrollment and profile validation CI. |

#### `yubi-OS/mkosi` — `yubios` (`000b5cefe2b130e928fcfe6a649b417d6f78f66d`, 3 commits ahead of `main`)

- `9823386e4077` (`corning-croak-cable`): feat(yubiOS): add yubiOS mkosi build profile with PIV signing + FIDO2 enrollment
- `bdf5114aadd1` (`foil-copy-overrate`): ci: add yubiOS-profile checks (mkosi summary + shellcheck + ruff); pinned checkout
- `000b5cefe2b1` (`foil-copy-overrate`): ci: make shellcheck repo-agnostic (skip if no yubiOS-profile scripts on ref)

#### `yubi-OS/mkosi` — `feature/yubiOS-profile` (`000b5cefe2b130e928fcfe6a649b417d6f78f66d`, 3 commits ahead of `main`)

- `9823386e4077` (`corning-croak-cable`): feat(yubiOS): add yubiOS mkosi build profile with PIV signing + FIDO2 enrollment
- `bdf5114aadd1` (`foil-copy-overrate`): ci: add yubiOS-profile checks (mkosi summary + shellcheck + ruff); pinned checkout
- `000b5cefe2b1` (`foil-copy-overrate`): ci: make shellcheck repo-agnostic (skip if no yubiOS-profile scripts on ref)

---

### 5. `yubi-OS/image-builder`

- **Upstream Parent:** [`osbuild/image-builder`](https://github.com/osbuild/image-builder)
- **Default Branch (`main`):** `8f5e12276f11125b51bbb5c331b0ef0f0eadebde` _(synced 1:1 with `osbuild/image-builder:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `v90.0.0` (`b80d1f9416f263501b8c5719d88c6ffba67e9ae3`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `8f5e12276f11125b51bbb5c331b0ef0f0eadebde` | `+0 / -0` | `0` | 1:1 mirror of upstream `osbuild/image-builder:main` (all unowned upstream branches removed; upstream tags synced). |

_No custom branches or commits ahead of upstream; repository is a pure 1:1 upstream mirror._

---

### 6. `yubi-OS/arm-trusted-firmware`

- **Upstream Parent:** [`ARM-software/arm-trusted-firmware`](https://github.com/ARM-software/arm-trusted-firmware)
- **Default Branch (`master`):** `a881364e03b0c5b3a8c00f20ad6fbdda53a57031` _(synced 1:1 with `ARM-software/arm-trusted-firmware:master`, `0 ahead, 0 behind`)_
- **Latest Upstream Tag:** `v2.15.0` (`da738d5eae93af342fdc4995dd3c05acb4c9d757`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `master` | `a881364e03b0c5b3a8c00f20ad6fbdda53a57031` | `+0 / -0` | `0` | 1:1 mirror of upstream `ARM-software/arm-trusted-firmware:master`. |
| `yubios` | `8d96428a33f9ee9c50dd5f46d531b08767b67c9d` | `+3 / -0` | `1` | Canonical yubiOS integration branch for TF-A: adds `.github/workflows/ci_test.yml` building AArch64 `BL31` (`SPD=opteed`) and Trusted Board Boot `fip.bin` (`PLAT=qemu`) with pinned mbed TLS. |
| `feat/ci` | `8d96428a33f9ee9c50dd5f46d531b08767b67c9d` | `+3 / -0` | `1` | Component CI workflow (`.github/workflows/ci_test.yml`) building TF-A `BL31` + TBB `FIP` for `PLAT=qemu`. |

#### `yubi-OS/arm-trusted-firmware` — `yubios` (`8d96428a33f9ee9c50dd5f46d531b08767b67c9d`, 3 commits ahead of `master`)

- `a430c2948e6b` (`foil-copy-overrate`): ci(C1): add ci_test.yml — build TF-A BL31 + TBB FIP (PLAT=qemu) [#35]
- `5d8acab0c877` (`foil-copy-overrate`): ci(C1): fix bl31.elf output path (build/qemu/debug/bl31/bl31.elf)
- `8d96428a33f9` (`foil-copy-overrate`): ci(C1): pin mbed TLS 3.6.6 (matches TF-A MBEDTLS_CONFIG_VERSION 0x03060600)

#### `yubi-OS/arm-trusted-firmware` — `feat/ci` (`8d96428a33f9ee9c50dd5f46d531b08767b67c9d`, 3 commits ahead of `master`)

- `a430c2948e6b` (`foil-copy-overrate`): ci(C1): add ci_test.yml — build TF-A BL31 + TBB FIP (PLAT=qemu) [#35]
- `5d8acab0c877` (`foil-copy-overrate`): ci(C1): fix bl31.elf output path (build/qemu/debug/bl31/bl31.elf)
- `8d96428a33f9` (`foil-copy-overrate`): ci(C1): pin mbed TLS 3.6.6 (matches TF-A MBEDTLS_CONFIG_VERSION 0x03060600)

---

### 7. `yubi-OS/optee_os`

- **Upstream Parent:** [`OP-TEE/optee_os`](https://github.com/OP-TEE/optee_os)
- **Default Branch (`master`):** `5d9a256b168a63311004f0cfbcd19b11018bf6ad` _(synced 1:1 with `OP-TEE/optee_os:master`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `4.11.0` (`f54190f22611dd5ad5d22546fd4209aa100f56bd`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `master` | `5d9a256b168a63311004f0cfbcd19b11018bf6ad` | `+0 / -0` | `0` | 1:1 mirror of upstream `OP-TEE/optee_os:master` (all unowned upstream branches removed; release tags synced to match `optee_ftpm` at `4.11.0`). |
| `yubios` | `e1181e2d0e40f8550c0f8204a433eac54598d222` | `+6 / -0` | `12` | Canonical yubiOS integration branch for OP-TEE OS: adds `CFG_STMM_VOLATILE_STORAGE` RAM-backed StandaloneMM `EFI_VARS` fallback, RK3568/RK3566 platform flavor support (OP-TEE PR #7791 + `otp.h`/`sgrf.h` flavor bridge), `PTA_CMD_GET_DEVICES` StMM PTA enumeration when `CFG_STMM_VOLATILE_STORAGE=y`, non-volatile RPMB/REE storage preference in `stmm_sp.c` before RAM fallback, and component CI. |
| `feat/ci` | `abd6c3109884df88d0f3e238f08c5816c8a6b6bb` | `+1 / -0` | `1` | Component CI workflow (`.github/workflows/ci_test.yml`) building OP-TEE `BL32` + user-TA devkit (`vexpress-qemu_armv8a`, `CFG_RPMB_FS=y`). |
| `feat/stmm-volatile-storage-ci-4.11` | `e1181e2d0e40f8550c0f8204a433eac54598d222` | `+6 / -0` | `12` | Tracks `yubios`: StMM non-volatile RPMB/REE + volatile RAM fallback, `PTA_CMD_GET_DEVICES` advertisement, RK3568/RK3566 platform flavor support, and CI. |

#### `yubi-OS/optee_os` — `yubios` (`e1181e2d0e40f8550c0f8204a433eac54598d222`, 6 commits ahead of `master`)

- `abd6c3109884` (`foil-copy-overrate`): ci(T2/C2): add ci_test.yml building OP-TEE BL32 + TA devkit (vexpress-qemu_armv8a, RPMB FS) [#35]
- `deff08c8c5a2` (`foil-copy-overrate`): feat: CFG_STMM_VOLATILE_STORAGE — RAM-backed StMM EFI_VARS for storage-less CI
- `5d5b83d8f897` (`foil-copy-overrate`): plat-rockchip: add rk3568/rk3566 platform flavor support (OP-TEE PR #7791 + flavor bridge)
- `3fc98e5bcec1` (`foil-copy-overrate`): plat-rockchip: bridge PLATFORM_FLAVOR_rk3568 in otp.h and sgrf.h
- `7e82cfa95528` (`foil-copy-overrate`): fix(stmm): advertise StMM PTA on PTA_CMD_GET_DEVICES when CFG_STMM_VOLATILE_STORAGE=y
- `e1181e2d0e40` (`foil-copy-overrate`): feat(stmm): prefer non-volatile RPMB/REE storage in stmm_sp with RAM mirror fallback

#### `yubi-OS/optee_os` — `feat/ci` (`abd6c3109884df88d0f3e238f08c5816c8a6b6bb`, 1 commits ahead of `master`)

- `abd6c3109884` (`foil-copy-overrate`): ci(T2/C2): add ci_test.yml building OP-TEE BL32 + TA devkit (vexpress-qemu_armv8a, RPMB FS) [#35]

#### `yubi-OS/optee_os` — `feat/stmm-volatile-storage-ci-4.11` (`e1181e2d0e40f8550c0f8204a433eac54598d222`, 6 commits ahead of `master`)

- `abd6c3109884` (`foil-copy-overrate`): ci(T2/C2): add ci_test.yml building OP-TEE BL32 + TA devkit (vexpress-qemu_armv8a, RPMB FS) [#35]
- `deff08c8c5a2` (`foil-copy-overrate`): feat: CFG_STMM_VOLATILE_STORAGE — RAM-backed StMM EFI_VARS for storage-less CI
- `5d5b83d8f897` (`foil-copy-overrate`): plat-rockchip: add rk3568/rk3566 platform flavor support (OP-TEE PR #7791 + flavor bridge)
- `3fc98e5bcec1` (`foil-copy-overrate`): plat-rockchip: bridge PLATFORM_FLAVOR_rk3568 in otp.h and sgrf.h
- `7e82cfa95528` (`foil-copy-overrate`): fix(stmm): advertise StMM PTA on PTA_CMD_GET_DEVICES when CFG_STMM_VOLATILE_STORAGE=y
- `e1181e2d0e40` (`foil-copy-overrate`): feat(stmm): prefer non-volatile RPMB/REE storage in stmm_sp with RAM mirror fallback

---

### 8. `yubi-OS/optee_ftpm`

- **Upstream Parent:** [`OP-TEE/optee_ftpm`](https://github.com/OP-TEE/optee_ftpm)
- **Default Branch (`master`):** `f09f4cdad21028289d4e8fc573893b75f7228dc7` _(synced 1:1 with `OP-TEE/optee_ftpm:master`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `4.11.0` (`f09f4cdad21028289d4e8fc573893b75f7228dc7`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `master` | `f09f4cdad21028289d4e8fc573893b75f7228dc7` | `+0 / -0` | `0` | 1:1 mirror of upstream `OP-TEE/optee_ftpm:master` (`4.11.0`). |
| `yubios` | `b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf` | `+3 / -0` | `4` | Canonical yubiOS integration branch for OP-TEE fTPM: adds `CFG_FTPM_VOLATILE_NV` volatile-NV test mode for RPMB-less CI environments (gated on auto-injected `CFG_FTPM_VOLATILE_NV` define) and component CI workflow. |
| `feat/ci` | `6e4c90f7f085a4fa8e292c6912c158289401e472` | `+1 / -0` | `1` | Component CI workflow (`.github/workflows/ci_test.yml`) building the 64-bit fTPM TA (`bc50d971-d4c9-42c4-82cb-343fb7f37896`) against the OP-TEE TA devkit. |
| `feat/volatile-nv-ci` | `b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf` | `+3 / -0` | `4` | Tracks `yubios`: `CFG_FTPM_VOLATILE_NV` volatile-NV support and component CI. |
| `feat/volatile-nv-ci-4.11` | `b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf` | `+3 / -0` | `4` | Tracks `yubios`: `CFG_FTPM_VOLATILE_NV` volatile-NV support and component CI on OP-TEE 4.11.0. |

#### `yubi-OS/optee_ftpm` — `yubios` (`b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf`, 3 commits ahead of `master`)

- `6e4c90f7f085` (`foil-copy-overrate`): ci(T3/C3): add ci_test.yml — build fTPM TA (bc50d971…) vs OP-TEE TA-devkit on bare aarch64 runners (#35)
- `eccc5d3a723a` (`foil-copy-overrate`): feat: CFG_FTPM_VOLATILE_NV — volatile-NV test mode for storage-less environments
- `b78d47800ca1` (`foil-copy-overrate`): fix: gate volatile-NV on the auto-injected CFG_FTPM_VOLATILE_NV define

#### `yubi-OS/optee_ftpm` — `feat/ci` (`6e4c90f7f085a4fa8e292c6912c158289401e472`, 1 commits ahead of `master`)

- `6e4c90f7f085` (`foil-copy-overrate`): ci(T3/C3): add ci_test.yml — build fTPM TA (bc50d971…) vs OP-TEE TA-devkit on bare aarch64 runners (#35)

#### `yubi-OS/optee_ftpm` — `feat/volatile-nv-ci` (`b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf`, 3 commits ahead of `master`)

- `6e4c90f7f085` (`foil-copy-overrate`): ci(T3/C3): add ci_test.yml — build fTPM TA (bc50d971…) vs OP-TEE TA-devkit on bare aarch64 runners (#35)
- `eccc5d3a723a` (`foil-copy-overrate`): feat: CFG_FTPM_VOLATILE_NV — volatile-NV test mode for storage-less environments
- `b78d47800ca1` (`foil-copy-overrate`): fix: gate volatile-NV on the auto-injected CFG_FTPM_VOLATILE_NV define

#### `yubi-OS/optee_ftpm` — `feat/volatile-nv-ci-4.11` (`b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf`, 3 commits ahead of `master`)

- `6e4c90f7f085` (`foil-copy-overrate`): ci(T3/C3): add ci_test.yml — build fTPM TA (bc50d971…) vs OP-TEE TA-devkit on bare aarch64 runners (#35)
- `eccc5d3a723a` (`foil-copy-overrate`): feat: CFG_FTPM_VOLATILE_NV — volatile-NV test mode for storage-less environments
- `b78d47800ca1` (`foil-copy-overrate`): fix: gate volatile-NV on the auto-injected CFG_FTPM_VOLATILE_NV define

---

### 9. `yubi-OS/ms-tpm-20-ref`

- **Upstream Parent:** [`microsoft/ms-tpm-20-ref`](https://github.com/microsoft/ms-tpm-20-ref)
- **Default Branch (`main`):** `ee21db0a941decd3cac67925ea3310873af60ab3` _(synced 1:1 with `microsoft/ms-tpm-20-ref:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `v1.83r1` (`ee21db0a941decd3cac67925ea3310873af60ab3`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `ee21db0a941decd3cac67925ea3310873af60ab3` | `+0 / -0` | `0` | 1:1 mirror of upstream `microsoft/ms-tpm-20-ref:main` (`v1.83r1`; all unowned upstream branches removed). |
| `yubios` | `6c893ca8ebbbcb55ba788d8f289a5d4e64bc0d48` | `+1 / -0` | `1` | Canonical yubiOS integration branch for `ms-tpm-20-ref`: adds `.github/workflows/ci_test.yml` building the TPM 2.0 reference (`tpm2-simulator` + `libtpm.a`) for AArch64 (cross + native). |
| `feat/ci` | `6c893ca8ebbbcb55ba788d8f289a5d4e64bc0d48` | `+1 / -0` | `1` | Component CI workflow (`.github/workflows/ci_test.yml`) for AArch64 `ms-tpm-20-ref` builds. |

#### `yubi-OS/ms-tpm-20-ref` — `yubios` (`6c893ca8ebbbcb55ba788d8f289a5d4e64bc0d48`, 1 commits ahead of `main`)

- `6c893ca8ebbb` (`foil-copy-overrate`): ci(#35 C4): add ci_test.yml building ms-tpm-20-ref TPM 2.0 reference for aarch64 (cross + native)

#### `yubi-OS/ms-tpm-20-ref` — `feat/ci` (`6c893ca8ebbbcb55ba788d8f289a5d4e64bc0d48`, 1 commits ahead of `main`)

- `6c893ca8ebbb` (`foil-copy-overrate`): ci(#35 C4): add ci_test.yml building ms-tpm-20-ref TPM 2.0 reference for aarch64 (cross + native)

---

### 10. `yubi-OS/edk2-rk3588`

- **Upstream Parent:** [`edk2-porting/edk2-rk3588`](https://github.com/edk2-porting/edk2-rk3588)
- **Default Branch (`master`):** `2f3f8265590f77901ac6a1af5c963f957a844158` _(synced 1:1 with `edk2-porting/edk2-rk3588:master`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `v1.1` (`6a682c0ef3ed74feb8b0d98f1c2aa771ddfbae18`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `master` | `2f3f8265590f77901ac6a1af5c963f957a844158` | `+0 / -0` | `0` | 1:1 mirror of upstream `edk2-porting/edk2-rk3588:master`. |

_No custom branches or commits ahead of upstream; repository is a pure 1:1 upstream mirror._

---

### 11. `yubi-OS/edk2`

- **Upstream Parent:** [`tianocore/edk2`](https://github.com/tianocore/edk2)
- **Default Branch (`master`):** `8628578dacd38b327d4f9acf820c6914f4b3a48f` _(synced 1:1 with `tianocore/edk2:master`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `edk2-stable202608` (`2970e5699ba6267f3384ffab20f96647578aebc8`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `master` | `8628578dacd38b327d4f9acf820c6914f4b3a48f` | `+0 / -0` | `0` | 1:1 mirror of upstream `tianocore/edk2:master` (all unowned upstream branches removed). |
| `yubios` | `77828ba8f2d0693ccda37b88ea6281312d60df64` | `+3 / -0` | `1` | Canonical yubiOS integration branch for EDK2: adds `.github/workflows/ci_test.yml` building `StandaloneMmPkg/StandaloneMmPkg.dsc` for `AARCH64` with the unified `GCC` toolchain tag. |
| `feat/ci` | `77828ba8f2d0693ccda37b88ea6281312d60df64` | `+3 / -0` | `1` | Component CI workflow (`.github/workflows/ci_test.yml`) building EDK2 StandaloneMM core for `AARCH64`/`GCC`. |

#### `yubi-OS/edk2` — `yubios` (`77828ba8f2d0693ccda37b88ea6281312d60df64`, 3 commits ahead of `master`)

- `e2438aee724b` (`foil-copy-overrate`): ci(edk2): add ci_test.yml — build StandaloneMM core AARCH64/GCC5 (#35 C6)
- `f85e92498026` (`foil-copy-overrate`): ci(edk2): fix toolchain tag GCC5->GCC (current edk2 dropped GCC5 tag)
- `77828ba8f2d0` (`foil-copy-overrate`): ci(edk2): remove duplicated step header (startup_failure fix)

#### `yubi-OS/edk2` — `feat/ci` (`77828ba8f2d0693ccda37b88ea6281312d60df64`, 3 commits ahead of `master`)

- `e2438aee724b` (`foil-copy-overrate`): ci(edk2): add ci_test.yml — build StandaloneMM core AARCH64/GCC5 (#35 C6)
- `f85e92498026` (`foil-copy-overrate`): ci(edk2): fix toolchain tag GCC5->GCC (current edk2 dropped GCC5 tag)
- `77828ba8f2d0` (`foil-copy-overrate`): ci(edk2): remove duplicated step header (startup_failure fix)

---

### 12. `yubi-OS/edk2-platforms`

- **Upstream Parent:** [`tianocore/edk2-platforms`](https://github.com/tianocore/edk2-platforms)
- **Default Branch (`master`):** `4db2845d14425599238be86b8a73d288f7c0b4a6` _(synced 1:1 with `tianocore/edk2-platforms:master`, `0 ahead, 0 behind`)_
- **Latest Upstream Tag:** `20260316-before-platform-removals` (`cc384840c440415a091623a7658112fedc416094`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `master` | `4db2845d14425599238be86b8a73d288f7c0b4a6` | `+0 / -0` | `0` | 1:1 mirror of upstream `tianocore/edk2-platforms:master` (carries the `20260316-before-platform-removals` tag used for `PlatformStandaloneMmRpmb.dsc`). |

_No custom branches or commits ahead of upstream; repository is a pure 1:1 upstream mirror._

---

### 13. `yubi-OS/u-boot`

- **Upstream Parent:** [`u-boot/u-boot`](https://github.com/u-boot/u-boot)
- **Default Branch (`main`):** `6487c50b8a40f2668ab98a892b9300ad5c181f38` _(synced 1:1 with `u-boot/u-boot:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `v2026.10` (`5508406582f6f7120dce0c4b3059819a41788db2`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `6487c50b8a40f2668ab98a892b9300ad5c181f38` | `+0 / -0` | `0` | 1:1 mirror of upstream `u-boot/u-boot:main` (all unowned upstream branches removed; ahead commits moved to `yubios`). |
| `yubios` | `0257c1dedf23a082cd35afdb757b2886774b091c` | `+27 / -0` | `41` | Canonical yubiOS integration branch for U-Boot: adds PineTab2 (`pinetab2-rk3566`) CI workflow building OP-TEE `BL32` from `yubi-OS/optee_os` + TF-A `BL31` + U-Boot `BL33`, Pavel Golikov's 18-patch RK3568/RK3566 open-source TPL DRAM initialization series (capped at 1056 MHz LPDDR4), and `pinetab2-rk3566_defconfig` open-TPL enablement. |
| `artifact/spi-bin` | `b124f04e2f855a82c17625789c23a7b49f5cd6f4` | `+10 / -0` | `4` | PineTab2 RK3566 CI workflow + prebuilt `u-boot-rockchip-spi.bin`, `idbloader.img`, and `u-boot.itb` distribution artifacts. |
| `feat/rk3566-open-tpl` | `0257c1dedf23a082cd35afdb757b2886774b091c` | `+27 / -0` | `41` | Tracks `yubios`: PineTab2 RK3566 open-source TPL DRAM init series (27 commits ahead of upstream `main`) + CI workflow. |

#### `yubi-OS/u-boot` — `yubios` (`0257c1dedf23a082cd35afdb757b2886774b091c`, 27 commits ahead of `main`)

- `555740754ac2` (`foil-copy-overrate`): ci: pinetab2-rk3566 U-Boot chain workflow (bl31+TPL+BL33)
- `80272397aad3` (`foil-copy-overrate`): ci: pinetab2-rk3566 add rkbin rk3568_bl32 (OP-TEE TEE) to FIT
- `8f301c0a7135` (`foil-copy-overrate`): ci: pinetab2 build OP-TEE from optee_os fork + PR #7791 rk3568 platform (replaces vendor bl32)
- `435fc4fff9f7` (`foil-copy-overrate`): ci: pinetab2 checkout upstream PR #7791 branch directly + tee.bin into workspace for artifacts
- `9feccb092ebf` (`foil-copy-overrate`): ci: pinetab2 fix TEE path to rk356x (flavor fix completion)
- `e36701fc5d48` (`foil-copy-overrate`): ci: pinetab2 optee CFG_USER_TA_TARGETS=ta_arm64 (aarch64 toolchain only)
- `8d003f9bc74a` (`foil-copy-overrate`): ci: pinetab2 optee flavor bridge (conf.mk rk3568 + platform_config.h rk356x)
- `3b4d3a331b81` (`foil-copy-overrate`): ci: pinetab2 fix tee.bin path (optee_os out/arm-plat-rockchip/core)
- `d1203f75c736` (`Paullo612`): clk: rockchip: rk3568: Fix compilation with CONFIG_OF_PLATDATA enabled
- `b3e94c0a75d1` (`Paullo612`): clk: rockchip: rk3568: Fix probe with CONFIG_OF_PLATDATA enabled
- `b38352f897b2` (`Paullo612`): rockchip: rk3568: syscon: Add PMUGRF support for OF_PLATDATA
- `ba9ede4bc974` (`Paullo612`): rockchip: rk3568: syscon: Add MSCH, SGRF and DDRGRF support
- `03211abbb3a8` (`Paullo612`): ram: rockchip: Update ddr pctl regs for px30
- `67c8d97f6a9f` (`Paullo612`): ram: rockchip: Add rk3568 lpddr4 support
- `c9c403b32e1e` (`Paullo612`): ram: rockchip: Add rk3568 ddr4 support
- `846744872db0` (`Paullo612`): ram: rockchip: Add rk3568 ddr loader params
- `9759deb60b42` (`Paullo612`): ram: rockchip: Add 4 ranks support to controller code for PX30
- `fdf0c8308fd2` (`Paullo612`): ram: rockchip: Add missing bits to common code for sdram driver
- `0ced593933b4` (`Paullo612`): ram: rockchip: Add SDRAM initialization support for rk3568
- `86025dc16453` (`Paullo612`): clk: rockchip: rk3568: Reduce code size for TPL build
- `967a8144d3e9` (`Paullo612`): rockchip: rk356x: Add register spaces to DMC in u-boot.dtsi
- `3dc57daa8798` (`Paullo612`): rockchip: rk356x: Add DMC related syscons to u-boot.dtsi
- `f26f202b6bee` (`Paullo612`): sysreset: psci: Stop building for XPL
- `cb1b2f9b05b3` (`Paullo612`): rockchip: serial: Add driver alias for rk3568
- `e2081290af2c` (`Paullo612`): rockchip: rk356x-generic: Initialize SDRAM in TPL stage
- `0aa89db01d79` (`Paullo612`): ram: rockchip: rk3568: Limit maximum DDR frequency to 1056 MHz
- `0257c1dedf23` (`foil-copy-overrate`): rockchip: pinetab2-rk3566: enable blob-free open-source TPL DRAM init

#### `yubi-OS/u-boot` — `artifact/spi-bin` (`b124f04e2f855a82c17625789c23a7b49f5cd6f4`, 10 commits ahead of `main`)

- `555740754ac2` (`foil-copy-overrate`): ci: pinetab2-rk3566 U-Boot chain workflow (bl31+TPL+BL33)
- `80272397aad3` (`foil-copy-overrate`): ci: pinetab2-rk3566 add rkbin rk3568_bl32 (OP-TEE TEE) to FIT
- `8f301c0a7135` (`foil-copy-overrate`): ci: pinetab2 build OP-TEE from optee_os fork + PR #7791 rk3568 platform (replaces vendor bl32)
- `435fc4fff9f7` (`foil-copy-overrate`): ci: pinetab2 checkout upstream PR #7791 branch directly + tee.bin into workspace for artifacts
- `9feccb092ebf` (`foil-copy-overrate`): ci: pinetab2 fix TEE path to rk356x (flavor fix completion)
- `e36701fc5d48` (`foil-copy-overrate`): ci: pinetab2 optee CFG_USER_TA_TARGETS=ta_arm64 (aarch64 toolchain only)
- `8d003f9bc74a` (`foil-copy-overrate`): ci: pinetab2 optee flavor bridge (conf.mk rk3568 + platform_config.h rk356x)
- `3b4d3a331b81` (`foil-copy-overrate`): ci: pinetab2 fix tee.bin path (optee_os out/arm-plat-rockchip/core)
- `de3f954a00cf` (`foil-copy-overrate`): dist: u-boot-rockchip-spi.bin from run 37324169947 (2d48f45)
- `b124f04e2f85` (`foil-copy-overrate`): dist: idbloader.img + u-boot.itb from run 37324169947

#### `yubi-OS/u-boot` — `feat/rk3566-open-tpl` (`0257c1dedf23a082cd35afdb757b2886774b091c`, 27 commits ahead of `main`)

- `555740754ac2` (`foil-copy-overrate`): ci: pinetab2-rk3566 U-Boot chain workflow (bl31+TPL+BL33)
- `80272397aad3` (`foil-copy-overrate`): ci: pinetab2-rk3566 add rkbin rk3568_bl32 (OP-TEE TEE) to FIT
- `8f301c0a7135` (`foil-copy-overrate`): ci: pinetab2 build OP-TEE from optee_os fork + PR #7791 rk3568 platform (replaces vendor bl32)
- `435fc4fff9f7` (`foil-copy-overrate`): ci: pinetab2 checkout upstream PR #7791 branch directly + tee.bin into workspace for artifacts
- `9feccb092ebf` (`foil-copy-overrate`): ci: pinetab2 fix TEE path to rk356x (flavor fix completion)
- `e36701fc5d48` (`foil-copy-overrate`): ci: pinetab2 optee CFG_USER_TA_TARGETS=ta_arm64 (aarch64 toolchain only)
- `8d003f9bc74a` (`foil-copy-overrate`): ci: pinetab2 optee flavor bridge (conf.mk rk3568 + platform_config.h rk356x)
- `3b4d3a331b81` (`foil-copy-overrate`): ci: pinetab2 fix tee.bin path (optee_os out/arm-plat-rockchip/core)
- `d1203f75c736` (`Paullo612`): clk: rockchip: rk3568: Fix compilation with CONFIG_OF_PLATDATA enabled
- `b3e94c0a75d1` (`Paullo612`): clk: rockchip: rk3568: Fix probe with CONFIG_OF_PLATDATA enabled
- `b38352f897b2` (`Paullo612`): rockchip: rk3568: syscon: Add PMUGRF support for OF_PLATDATA
- `ba9ede4bc974` (`Paullo612`): rockchip: rk3568: syscon: Add MSCH, SGRF and DDRGRF support
- `03211abbb3a8` (`Paullo612`): ram: rockchip: Update ddr pctl regs for px30
- `67c8d97f6a9f` (`Paullo612`): ram: rockchip: Add rk3568 lpddr4 support
- `c9c403b32e1e` (`Paullo612`): ram: rockchip: Add rk3568 ddr4 support
- `846744872db0` (`Paullo612`): ram: rockchip: Add rk3568 ddr loader params
- `9759deb60b42` (`Paullo612`): ram: rockchip: Add 4 ranks support to controller code for PX30
- `fdf0c8308fd2` (`Paullo612`): ram: rockchip: Add missing bits to common code for sdram driver
- `0ced593933b4` (`Paullo612`): ram: rockchip: Add SDRAM initialization support for rk3568
- `86025dc16453` (`Paullo612`): clk: rockchip: rk3568: Reduce code size for TPL build
- `967a8144d3e9` (`Paullo612`): rockchip: rk356x: Add register spaces to DMC in u-boot.dtsi
- `3dc57daa8798` (`Paullo612`): rockchip: rk356x: Add DMC related syscons to u-boot.dtsi
- `f26f202b6bee` (`Paullo612`): sysreset: psci: Stop building for XPL
- `cb1b2f9b05b3` (`Paullo612`): rockchip: serial: Add driver alias for rk3568
- `e2081290af2c` (`Paullo612`): rockchip: rk356x-generic: Initialize SDRAM in TPL stage
- `0aa89db01d79` (`Paullo612`): ram: rockchip: rk3568: Limit maximum DDR frequency to 1056 MHz
- `0257c1dedf23` (`foil-copy-overrate`): rockchip: pinetab2-rk3566: enable blob-free open-source TPL DRAM init

---

### 14. `yubi-OS/chromium`

- **Upstream Parent:** [`chromium/chromium`](https://github.com/chromium/chromium)
- **Default Branch (`main`):** `7c5cfc909b8368336e57e900d2813d5e6502d18d` _(synced 1:1 with `chromium/chromium:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** None published upstream (rolling `main`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `7c5cfc909b8368336e57e900d2813d5e6502d18d` | `+0 / -0` | `0` | 1:1 mirror of upstream `chromium/chromium:main` (canonical provenance-gated Antimony overlay lives in `yubi-OS/chromium-provenance`). |

_No custom branches or commits ahead of upstream; repository is a pure 1:1 upstream mirror._

---

### 15. `yubi-OS/agent-skills`

- **Upstream Parent:** [`addyosmani/agent-skills`](https://github.com/addyosmani/agent-skills)
- **Default Branch (`main`):** `39b723ceebf81474d0557c1fecd01eddab585563` _(synced 1:1 with `addyosmani/agent-skills:main`, `0 ahead, 0 behind`)_
- **Latest Upstream Release / Tag:** `0.6.16` (`39b723ceebf81474d0557c1fecd01eddab585563`)

| Branch | Head Commit SHA | Ahead / Behind (`upstream`) | Files Changed | Description |
|---|---|---|---|---|
| `main` | `39b723ceebf81474d0557c1fecd01eddab585563` | `+0 / -0` | `0` | 1:1 mirror of upstream `addyosmani/agent-skills:main` (all unowned upstream branches removed; yubiOS skills live in `yubi-OS/yubiOS/skills/`). |

_No custom branches or commits ahead of upstream; repository is a pure 1:1 upstream mirror._

---
