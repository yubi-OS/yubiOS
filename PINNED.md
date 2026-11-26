# PINNED.md - yubiOS approved refs & digests

_Last reviewed: 2026-11-15 during the org-wide fork standardization (`docs/FORKS.md`), `yubios` branch rebase, GitHub Actions refresh, Direct Workflow Downloads refresh, External GitHub Source Refs refresh, and Container Images digest bump._

All GitHub Actions, internal yubi-OS fork refs, external GitHub source refs, container image references, and directly downloaded workflow artifacts used across the yubi-OS org must appear here before being added to any workflow or Containerfile. Non-pinned refs such as mutable tags and branch names are not permitted.

**This file is the single source of truth.** AGENTS.md, ADRs, research notes, and workflows may point here, but they should not duplicate the live digest list. Full per-fork branch and commit inventories live in [`docs/FORKS.md`](docs/FORKS.md).

---

## GitHub Actions

| Action | Pinned SHA |
|--------|------------|
| `0mniteck/.pki` | `*` (org-internal workflows only, ref matches `.github/*/*@*`) |
| `actions/attest` | `1e69f48acb82d1966a394da916b4c1698aa569d6` `# v4.2.2` |
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` `# v7.0.1` |
| `actions/configure-pages` | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` `# v6.0.0` |
| `actions/deploy-pages` | `368f82528645a54fb793d4d04e342629a3f51346` `# v5.0.1` |
| `actions/download-artifact` | `9000827ccba6bdab643e8b6fd33ac0654aef8333` `# v8.0.2` |
| `actions/setup-python` | `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` `# v7.1.0` |
| `actions/upload-artifact` | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` `# v7.0.2` |
| `actions/upload-pages-artifact` | `fc324d3547104276b827a68afc52ff2a11cc49c9` `# v5.0.0` |
| `docker/setup-buildx-action` | `f87e5991a6d7451dcb8d9637bfbc97413f497069` `# v4.4.1` |

## Direct Workflow Downloads

Every `wcurl` payload is verified with GNU `sha512sum --check --strict` before it is extracted, installed, or executed.

| Artifact URL | Platform | Pinned SHA-512 |
|--------------|----------|----------------|
| `https://download.docker.com/linux/static/stable/x86_64/docker-29.9.3.tgz` | `linux/amd64` | `ff0eeb5d9994a6891b9bebe7c37c8982642da9fdc3b7f19302b3c2276b306b859d56e76f00148eeed2e36daffa576873e15276d79a61e1798e11741511c6e65e` `# 29.9.3` |
| `https://download.docker.com/linux/static/stable/x86_64/docker-rootless-extras-29.9.3.tgz` | `linux/amd64` | `3ea734eb68ae8e74159725410072bc196251bba2f12988014193d694a8a12e4a38f448c1d980563e810cfa4c92c8e364e8aa69652eda1900f91768ea7badb693` `# 29.9.3` |
| `https://github.com/docker/buildx/releases/download/v0.39.0/buildx-v0.39.0.linux-amd64` | `linux/amd64` | `9c3a17f0b782cfcc12b883546ed4efe684900f2139bee2ca369518aea35ea36a44201f9669f0eab43fca926926d90e11bf8cabf4a87653ad7aff50c5dba80fa6` `# v0.39.0` |
| `https://download.docker.com/linux/static/stable/aarch64/docker-29.9.3.tgz` | `linux/arm64` | `373b7542d225479e066cb540889cf24035f7909a17519845bedb93bb0b208c3bdd778af47d412de52136bf98d63ac1a5aba76e09eacd15641151c6e7f73aa198` `# 29.9.3` |
| `https://download.docker.com/linux/static/stable/aarch64/docker-rootless-extras-29.9.3.tgz` | `linux/arm64` | `7bab17249d06874cd5900ffc9908db692e8f158e17b03fc8afff5b9feaab5044752f7a018225695f8ca548212fa4d5095c3f15d0b06ed263f00ab4a895d6fc8a` `# 29.9.3` |
| `https://github.com/docker/buildx/releases/download/v0.39.0/buildx-v0.39.0.linux-arm64` | `linux/arm64` | `810c87058af0abb1205366d85ac47c3b1111676f7ae411fba19d3fe49a13a0695fe0d8bb03cdbd097132507eec19c7aecf4189e3ca30cab0e4a2a3b92ce8ad2b` `# v0.39.0` |
| `https://github.com/sigstore/cosign/releases/download/v3.1.4/cosign-linux-amd64` | `linux/amd64` | `00195f672f97e206032e158cf2bb279b0c4b549dd49b5361f463465c55490a9179f7bb8ba0c5b886aa59a2d8148ddb6ba7244d9701ea8659dfce991e1b58604a` `# v3.1.4` |
| `https://github.com/sigstore/cosign/releases/download/v3.1.4/cosign-linux-arm64` | `linux/arm64` | `dcf1a8745b03c9c7cf915ebeb34f287a5ade8bd975699ff7c221440ce8fabbacec98cc1a1728444c80d63c3372029d33973863ca07b2634e4c196e178a2d7f86` `# v3.1.4` |

> cosign v3.1.4 SHA-512 self-computed from the downloaded upstream binaries on 2026-11-15 and cross-validated against the SHA-256 in the v3.1.4 `cosign_checksums.txt` (amd64 `424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa`, arm64 `ade83b7aac62e131cacfe96d958948b2150cc9efec46a570a2649b8e27dedad2`) and the GitHub release asset digests; repeat this cross-check when bumping versions.

## Internal yubi-OS Fork Refs

Every fork's default branch (`main` or `master`) is synced 1:1 with upstream (`0 ahead, 0 behind`), all unowned upstream branches are removed, upstream tags are mirrored (`optee_os` release tags match `optee_ftpm` at `4.11.0`), and all yubiOS commits ahead of upstream live on the `yubios` branch (plus any rebased topic branches; see [`docs/FORKS.md`](docs/FORKS.md)). CI consumes the immutable source commit in the fifth column from the yubi-OS fork, never the mutable tag or branch name. `fetch-released-tag-ref.yml` resolves the newest stable upstream tag in each configured release family, peels annotated tags, and proves that both the release commit and approved source commit can be fetched from the fork with complete trees. EDK2 is bounded to `edk2-stable202602` in `ci_firmware-rk.yml` because `PlatformStandaloneMmRpmb.dsc` in `edk2-platforms` requires `ArmPkg/Library/ArmLib/ArmBaseLib.inf`.

| Fork repository | Upstream source | Upstream release/reference | Release commit in fork | Pinned source commit | Workflow role |
|-----------------|-----------------|----------------------------|------------------------|----------------------|---------------|
| `yubi-OS/arm-trusted-firmware` | `ARM-software/arm-trusted-firmware` | `v2.15.0` | `da738d5eae93af342fdc4995dd3c05acb4c9d757` | `da738d5eae93af342fdc4995dd3c05acb4c9d757` | `master` synced 1:1 (`a881364e03b0c5b3a8c00f20ad6fbdda53a57031`). `yubios` & `feat/ci` branches rebased onto `master` at `8d96428a33f9ee9c50dd5f46d531b08767b67c9d` (`+3` commits). Firmware assembly (`ci_firmware-rk.yml`, `ci_fork_arm-trusted-firmware.yml`) pins `v2.15.0` (`da738d5eae93af342fdc4995dd3c05acb4c9d757`) for mbed TLS 3.6.7 Make compatibility. |
| `yubi-OS/bcvk` | `bootc-dev/bcvk` | `v0.22.0` | `2a0176b11751b385806fd3cd184e39aec5a955e9` | `35a65a76c9e6aa97b2649e2d19d8354a34099924` | `main` synced 1:1 (`a3e2327d9ce3448242cbb62cbdf20ef47a534752`). `yubios` & `release/v0.22.0-yubios.1` branches rebased onto `main` at `35a65a76c9e6aa97b2649e2d19d8354a34099924` (`+8` commits: `native-to-disk`, `--u2f-hsm` USB passthrough, `--swtpm`, `--swu2f`, virtiofsd disk logging + host-side rbind chroot entrypoint + ARM64 DirectBoot `tmpfiles.extra` SSH credential, `--extra-qemu-arg`, and `yubios-release.yml`). Rebased feature branches: `feat/extra-qemu-arg` (`d8d2d2911033a1e925a170c2f890f0a4df307645`), `feat/swtpm-ci` (`463261b9be6272607257921188a9021831bb5fc2`), `feat/ci` (`53876ad8654deaaca75517b3a245cc07f3b94b0a`), `feature/u2f-hsm-usb-passthrough` (`2c520d9c8e120bf5c02b9228c61c6de3c94b3b71`), `feature/native-to-disk` (`34769eab5dce74c977b9774566433bd20ccf09eb`). Prebuilt `v0.22.0-yubios.1` binaries (`c9c06416c943d5ff956bc811f09aec0ce25bfdc7`) pinned under "yubi-OS Release Binaries" below. |
| `yubi-OS/bootc` | `bootc-dev/bootc` | `v1.17.4` | `7cde7bbe233ee45a40cff3d89d4f42b68a258d46` | `4519e4024f654660b432564f08a4feba2b23b638` | `main` synced 1:1 (`0c5dd0649787f1af62933cf2a2f448a35acf9f8f`). `yubios` & `feature/surface-arm64-audio` branches rebased onto `main` at `4519e4024f654660b432564f08a4feba2b23b638` (`+18` commits: Surface ARM64 Snapdragon X Elite bootc profile + LPASS/Q6DSP audio). Rebased feature branches: `feature/surface-arm64-usb4` (`4589ea589014d67f53efc2d90ed4cc39ad7a0d3f`), `feature/surface-arm64-snapdragon` (`80d73fc15ab95663e7afcc10b86ec9a1fd7b355b`), `feature/surface-x86-uefi` (`95e2eeacd79352869fbc00702e3be658b09da6e5`). |
| `yubi-OS/edk2` | `tianocore/edk2` | `edk2-stable202602` | `b7a715f7c03c45c6b4575bf88596bfd79658b8ce` | `b7a715f7c03c45c6b4575bf88596bfd79658b8ce` | `master` synced 1:1 (`8628578dacd38b327d4f9acf820c6914f4b3a48f`, latest release `edk2-stable202608` `2970e5699ba6267f3384ffab20f96647578aebc8`). `yubios` & `feat/ci` branches rebased onto `master` at `77828ba8f2d0693ccda37b88ea6281312d60df64` (`+3` commits, consumed by `ci_fork_edk2.yml` for `StandaloneMmPkg.dsc` AARCH64/GCC validation). Firmware build (`ci_firmware-rk.yml`) holds `edk2-stable202602` (`b7a715f7c03c45c6b4575bf88596bfd79658b8ce`) because `edk2-stable202608` moves `ArmBaseLib` from `ArmPkg` to `MdePkg`, breaking `PlatformStandaloneMmRpmb.dsc:35`. |
| `yubi-OS/edk2-platforms` | `tianocore/edk2-platforms` | `20260316-before-platform-removals` | `cc384840c440415a091623a7658112fedc416094` | `cc384840c440415a091623a7658112fedc416094` | `master` synced 1:1 (`4db2845d14425599238be86b8a73d288f7c0b4a6`). StandaloneMM `PlatformStandaloneMmRpmb.dsc` compatibility snapshot (`20260316-before-platform-removals`). |
| `yubi-OS/edk2-rk3588` | `edk2-porting/edk2-rk3588` | `v1.1` | `6a682c0ef3ed74feb8b0d98f1c2aa771ddfbae18` | `2f3f8265590f77901ac6a1af5c963f957a844158` | `master` synced 1:1 (`2f3f8265590f77901ac6a1af5c963f957a844158`); RK3588 UEFI reference mirror. |
| `yubi-OS/gnome-control-center` | `GNOME/gnome-control-center` | `51.2.1` | `6ecaed77d1983b4f96d568cf358dcf2b43fffd5b` | `f127a35fa7a313bf5a4ab7334925adb351e6f83c` | `main` synced 1:1 (`e017b859afa4d1a10d86a01c878fbc1bf7709ea8`). `yubios`, `feat/ci`, & `release/v51.2.1-yubios.1` branches at `f127a35fa7a313bf5a4ab7334925adb351e6f83c` (`+4` commits: vendored `gvc`/`libgxdp` subprojects, native `System Trust` panel `panels/system-trust/`, sidebar ordering & `yubiOS` header branding, Fedora 45 RPM spec + `yubios-release.yml`). Consumed by `ci_fork_gnome-control-center.yml`. |
| `yubi-OS/image-builder` | `osbuild/image-builder` | `v90.0.0` | `b80d1f9416f263501b8c5719d88c6ffba67e9ae3` | `8f5e12276f11125b51bbb5c331b0ef0f0eadebde` | `main` synced 1:1 (`8f5e12276f11125b51bbb5c331b0ef0f0eadebde`); upstream image-builder mirror. |
| `yubi-OS/mkosi` | `systemd/mkosi` | `v27.1` | `ecf7f5702bb2052b7a69cab3fe7d37bc3b9ad77b` | `000b5cefe2b130e928fcfe6a649b417d6f78f66d` | `main` synced 1:1 (`2fa9a248a2fecebb0dd64a34c0fecdc5ca8335b9`). `yubios` & `feature/yubiOS-profile` branches rebased onto `main` at `000b5cefe2b130e928fcfe6a649b417d6f78f66d` (`+3` commits: `yubiOS` mkosi profile with PIV signing + FIDO2 enrollment and CI checks); component validation, summary, and installer build. |
| `yubi-OS/ms-tpm-20-ref` | `microsoft/ms-tpm-20-ref` | `v1.83r1` | `ee21db0a941decd3cac67925ea3310873af60ab3` | `6c893ca8ebbbcb55ba788d8f289a5d4e64bc0d48` | `main` synced 1:1 (`ee21db0a941decd3cac67925ea3310873af60ab3`, peeled commit of `v1.83r1`; prior reference commit `98b60a44aba79b15fcce1c0d1e46cf5918400f6a`). `yubios` & `feat/ci` branches rebased onto `main` at `6c893ca8ebbbcb55ba788d8f289a5d4e64bc0d48` (`+1` commit, `ci_test.yml`); TPM reference validation and fTPM firmware build. |
| `yubi-OS/optee_ftpm` | `OP-TEE/optee_ftpm` | `4.11.0` | `f09f4cdad21028289d4e8fc573893b75f7228dc7` | `b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf` | `master` synced 1:1 (`f09f4cdad21028289d4e8fc573893b75f7228dc7`). `yubios`, `feat/volatile-nv-ci-4.11`, & `feat/volatile-nv-ci` branches at `b78d47800ca1a162f860c031cf1bf2bb0ed6cfbf` (`+3` commits: `CFG_FTPM_VOLATILE_NV` volatile NV support + CI); `feat/ci` at `6e4c90f7f085a4fa8e292c6912c158289401e472`. Component validation and TA build. |
| `yubi-OS/optee_os` | `OP-TEE/optee_os` | `4.11.0` | `f54190f22611dd5ad5d22546fd4209aa100f56bd` | `462e8e6793b988c5b3d2b815b17d091012ceffd7` | `master` synced 1:1 (`5d9a256b168a63311004f0cfbcd19b11018bf6ad`); release tag `4.11.0` (`f54190f22611dd5ad5d22546fd4209aa100f56bd`) synced to match `optee_ftpm`. `yubios` & `feat/stmm-volatile-storage-ci-4.11` branches rebased onto `master` at `462e8e6793b988c5b3d2b815b17d091012ceffd7` (`+7` commits: StMM RPMB/REE non-volatile + volatile RAM fallback, `PTA_CMD_GET_DEVICES` StMM advertisement, RK3568/RK3566 platform flavor support, 115200 UART baudrate, and CI); `feat/ci` at `abd6c3109884df88d0f3e238f08c5816c8a6b6bb`. Component validation, TA dev kit, and BL32 build. |
| `yubi-OS/particleos` | `systemd/particleos` | `main` | `b605add797ba65853eb79f8170c4a5743a6f4b1f` | `72debb729f5d8bdf6d1c77002813529ef8c6544d` | `main` synced 1:1 (`b605add797ba65853eb79f8170c4a5743a6f4b1f`). `yubios` & `feature/surface-arm64-audio` branches rebased onto `main` at `72debb729f5d8bdf6d1c77002813529ef8c6544d` (`+17` commits: Surface ARM64 Snapdragon X Elite mkosi profile + LPASS/Q6DSP audio). Rebased feature branches: `feature/surface-arm64-snapdragon` (`b3853a7ffaa024fded77ac472013a57b711ee990`), `feature/surface-uefi` (`da01b8203032e3f7ef48b2b5d5c13022b30ff743`). |
| `yubi-OS/u-boot` | `u-boot/u-boot` | `v2026.10` | `5508406582f6f7120dce0c4b3059819a41788db2` | `8e7b49c78689957d3ee8eb217d7bdadad3026bd9` | `main` synced 1:1 (`6487c50b8a40f2668ab98a892b9300ad5c181f38`, latest release `v2026.10` `5508406582f6f7120dce0c4b3059819a41788db2`). `yubios` & `feat/rk3566-open-tpl` branches rebased onto `main` at `8e7b49c78689957d3ee8eb217d7bdadad3026bd9` (`+30` commits: PineTab2 CI workflow + Pavel Golikov's 18-patch RK3568/RK3566 open-source TPL DRAM init series at 1056 MHz + 115200 default UART2 baudrate across RK3588/RK3399/RK3566); `artifact/spi-bin` at `b124f04e2f855a82c17625789c23a7b49f5cd6f4` (`+10` commits). U-Boot component validation, open RK3566 TPL, and firmware BL33 build. |

## yubi-OS Release Binaries

Prebuilt binaries published by a yubi-OS fork's own release workflow. Workflows download the per-arch asset from the versioned release URL and verify it with both `sha256sum --check --strict` (SHA-256 below, matching the release `SHA256SUMS`) and `sha512sum --check --strict` (SHA-512 below) before installing or executing it. The tag is a provenance label; the bytes are the pin.

| Release | Source commit | Asset URL | Platform | SHA-256 | SHA-512 |
|---------|---------------|-----------|----------|---------|---------|
| `yubi-OS/bcvk` `v0.22.0-yubios.1` | `c9c06416c943d5ff956bc811f09aec0ce25bfdc7` | `https://github.com/yubi-OS/bcvk/releases/download/v0.22.0-yubios.1/bcvk-amd64` | `linux/amd64` | `0d87d074ccf43a559aa1cefc2c12eed049bbf547cd9da7212ea971395939ef36` `# v0.22.0-yubios.1` | `b24091a828373ac7fb214626596fac39b88b115f3be34b441800099e3e5965be5b60964e5393675d7a65732ddd4a7bea8ddd198396eb308d2e90108af2e088a6` `# v0.22.0-yubios.1` |
| `yubi-OS/bcvk` `v0.22.0-yubios.1` | `c9c06416c943d5ff956bc811f09aec0ce25bfdc7` | `https://github.com/yubi-OS/bcvk/releases/download/v0.22.0-yubios.1/bcvk-arm64` | `linux/arm64` | `c6c0ce386b3203ae10829060455754244336301ea256357c49cc6abe4731e1fe` `# v0.22.0-yubios.1` | `a4c1c31eb31302f0eaf0c7e403868d348488652c165531903e74960ea7fff6fd78936f776516461f17ac452a75a78daf26196a13a4f3803203cfc6c14cf23d43` `# v0.22.0-yubios.1` |
| `yubi-OS/chromium-provenance` `antimony-v156.0.8078.47-r1` | `c2789f3690f158585852f2950e682a45ca3c3c9f` | `https://github.com/yubi-OS/chromium-provenance/releases/download/antimony-v156.0.8078.47-r1/antimony-stable-156.0.8078.47-1.x86_64.rpm` | `linux/amd64` | `1e7260b6e01bfbfa77599e4a69a3a3118f826146b1e373e92adce4e756384168` `# antimony-v156.0.8078.47-r1` | `0537e7279176afafd043d18123be4a15c2d18c6f9cc06296bdc42629bbe9b371247fa348d47322384731ea5a9a16e68e6e6ffec8c866d22cf2dc5fa03cca62d3` `# antimony-v156.0.8078.47-r1` |
| `yubi-OS/chromium-provenance` `antimony-v156.0.8078.47-r1` | `c2789f3690f158585852f2950e682a45ca3c3c9f` | `https://github.com/yubi-OS/chromium-provenance/releases/download/antimony-v156.0.8078.47-r1/antimony-stable-156.0.8078.47-1.aarch64.rpm` | `linux/arm64` | `7921e25c1cf2a379f7be3ff96b10813704153128426b34e38696900b4a48ecef` `# antimony-v156.0.8078.47-r1` | `68eb5dfb99a7fbabb1fc88b2d44d7fd48cdded36d2b04391d53e7dd0eccff8800ab0a563959237328bd0a417e642b67f90a02e8bef786f1ca6c72dff4d4855cb` `# antimony-v156.0.8078.47-r1` |

> bcvk `v0.22.0-yubios.1` was built by `yubi-OS/bcvk` `yubios-release.yml` run `43339669517` (release profile, LTO, one codegen unit). The `bcvk` asset is an amd64 compatibility copy with the same SHA-256 as `bcvk-amd64`. Release `SHA256SUMS` asset SHA-256: `6e5430a90920f6c1a4e91df4dc672115461a49e1e2a71bb2807176c26f9edfd5`. Consumers: `ci_test-vm.yml` and `ci_test-vgpu-vm.yml` (default path, source build at `35a65a76c9e6aa97b2649e2d19d8354a34099924` as fallback), `ci_test-bootc-lifecycle.yml`, `ci_test-sysext-portable.yml`. Superseded release: `v0.18.0-yubios.1` (source `34fb0b6bfff0f59d4ff4a985dab895a7b87a2c5c`, `bcvk-amd64` `ce77ae08a4e9929f205976237321a543a5da4f2604f9f5d755813cd38c539070`, `bcvk-arm64` `c8080913b74f41ed7e3b36f53f280837ece1b2f7200f2dc63bdf260afaeb7226`), kept for audit only.

## External GitHub Source Refs

Workflows and isolated container builds use the immutable commit in the third column. Branches and tags are retained only as provenance labels for maintainers.

| Repository | Reviewed branch/tag | Pinned commit | Workflow role |
|------------|---------------------|---------------|---------------|
| `docker/buildx` | `v0.39.0` | `360040a78d6113dc84e5d4dcdf0f438e1be7a41f` `# v0.39.0` | Buildx release assets (`v0.39.0`); payloads are additionally pinned by SHA-512 above. |
| `Mbed-TLS/mbedtls` | `mbedtls-3.6.7` | `068ff080b369adfac81509f9b57b2afabaf82dc5` `# mbedtls-3.6.7` | TF-A trusted-board-boot dependency; the TF-A v2.15.0 build gate requires mbedTLS major 3 (`drivers/auth/mbedtls/mbedtls_common.mk`). |
| `Mbed-TLS/mbedtls` 4.x (HOLD, not adopted) | `mbedtls-4.2.0` | `ece41aa84d7879d7e55c59e955a5884b541f7f3b` `# mbedtls-4.2.0` | Held 2026-10-17. TF-A `v2.15.0` (`da738d5e`) requires mbed TLS 3.x: `default_mbedtls_config.h` sets `MBEDTLS_CONFIG_VERSION 0x03060600`, `mbedtls_common.mk` rejects any `MBEDTLS_VERSION_MAJOR` other than 3, and `mbedtls_crypto.c` gates on `MBEDTLS_VERSION_MAJOR < 3` (lines 329, 342, 358) with no 4.x branch. Its include path is `-I${MBEDTLS_DIR}/include`. Release 4.2.0 defines `MBEDTLS_CONFIG_VERSION 0x04000000`, and its tarball holds only 4 of the 14 mbed TLS headers TF-A includes (`error`, `oid`, `version`, `x509`). The rest are absent because `.gitmodules` places the crypto code in the `tf-psa-crypto` submodule, which the tarball leaves empty. |
| `pando85/passless` | `v0.27.3` | `e88eb0fa2e2b685d8b25712b0ac3000c819d0687` `# v0.27.3` | TEST-image in-guest CTAP2 authenticator (`mkosi.conf.d/test/install-swu2f-authenticator.sh`, consumed by `Containerfile.dev` and `mkosi --profile test`); yubiOS enables `soft-fido2 0.19.0`'s implemented `hmac-secret` extension at build time. |
| `qemu/qemu` | `v11.1.3` | `005c61c0ef6f6ae615283440b4bb7be51b2c6ddd` `# v11.1.3` | ARM64 zstd-capable DirectBoot QEMU (`ci_test-vm.yml`, `ci_test-vgpu-vm.yml`; zstd zboot loader support is contained in `v11.1.3`). |
| `yubi-OS/assets` | `main` | `09f209a48153c6cef4faae9b247146abce4c5441` `# wallpapers/yubios-aurora-ridge-4k.jpg` | OS default GNOME wallpaper (`wallpapers/yubios-aurora-ridge-4k.jpg`, installed at `/usr/share/backgrounds/yubios/yubios-aurora-ridge-4k.jpg`; SHA-256 `a700d15d5fe5b217a027c7a2b196c13f27f1aace9a675874310020ceb1d4918f`, SHA-512 `330eaf8730cb5f8d37855d1bcf4214893153b6cc8a979d873425b4c9d809ef697d59cf68ea8672d2e03c0098d0911527b4ca86d09e1b199217ac41f021cebfe3`). |
| `yubi-OS/assets` (boot splash logo) | `main` | `09f209a48153c6cef4faae9b247146abce4c5441` `# new_logo/yubios-owner-orbit-2048.png` | OS boot splash & system logo (`new_logo/yubios-owner-orbit-2048.png`, converted to `/usr/share/yubiOS/splash/yubios-owner-orbit.bmp` for UKI `.splash` and `/usr/share/plymouth/themes/spinner/{header-image,watermark}.png` for Plymouth; SHA-256 `351fc8cbeead6060506938dd5a3cae2c18f96878e6b04fd7d89f5f370e65ad15`, SHA-512 `5697513b6022af7cbeacd85d9eb2eaf404918922d357a68bd6189f0231cf8f035509cf2ec8907403b6e58061d26d5f760fd4787871751205c833fc528cc2141d`). |

Dynamic refs such as `github.sha`, `github.ref_name`, `target_ref`, and `ci_chain_ref` select commits within `yubi-OS/yubiOS` for the triggering run and the internal workflow chain. They are runtime identities, not external dependency refs; the default `actions/checkout` behavior checks out the triggering commit.

## Container Images

| Image | Pinned Digest | Notes |
|-------|---------------|-------|
| `docker.io/moby/buildkit:v0.35.0` (multi-arch INDEX) | `sha256:aa632b921ef07411d2cb77292cd34213d4f7b384001d6fceef1e1f25bf9752bb` `# v0.35.0` | BuildKit daemon used by every `docker-container` Buildx builder. Bumped 2026-11-15 to latest upstream release `v0.35.0` (published 2026-11-11): contains `linux/amd64` (`sha256:a521fc1fd903a46c611c733dd692548512232fba2e0386d6055846a903d05a71`) and `linux/arm64` (`sha256:7dc61a9fab7c7f5a50b1cdbbefa4180829e68c6c0172206eb54ad934de097ddf`). Replaces the `v0.34.0` index (`sha256:b059f8d7...`). |
| `dhi.io/debian-base` (multi-arch INDEX) | `sha256:c32c0cebb2be0fb4b781e323c1a1de4637f607169f580e44f53373276d7f8de1` `# trixie-debian13-dev` | **Canonical for workflows + Containerfile `FROM` where DHI is used.** OCI image index for `trixie-debian13-dev`; auto-resolves per runner arch. |
| child `linux/amd64` | `sha256:6e79fb71896ebd8e85820a56cf64e7160e81ac6640f06141c599cab0c7d70143` `# trixie-debian13-dev (linux/amd64)` | Resolved automatically; do not pin directly unless an amd64-only job requires it. |
| child `linux/arm64` | `sha256:1635837d62361ab2f78b0e2204b4286186bb190e72a3e77493fbbb9411d923e3` `# trixie-debian13-dev (linux/arm64)` | Resolved automatically. |
| `quay.io/fedora/fedora-bootc` (multi-arch INDEX, stream `:45`) | `sha256:f3afa8b1d590ba2842366e0bca4f921ba4a0c7b5ee72679b632aeaa08f170a1e` `# 45 (45.20261126.0)` | **Containerfile `FROM` base.** Canonical ref is digest-only: `FROM quay.io/fedora/fedora-bootc@sha256:f3afa8b1d590ba2842366e0bca4f921ba4a0c7b5ee72679b632aeaa08f170a1e AS rootfs` (`# quay.io/fedora/fedora-bootc:45 (org.opencontainers.image.version=45.20261126.0)`, OMN-170). OCI image index; auto-resolves per arch. `fetch-fedora-bootc-manifest` resolves the upstream `quay.io/fedora/fedora-bootc:45` stream tag (`org.opencontainers.image.version=45.20261114.0`, kernel `7.3.3-300.fc45`) to this immutable index digest. Re-resolved 2026-11-25. Refresh with `fetch-fedora-bootc-manifest`. |
| `ghcr.io/actions/jekyll-build-pages` | `sha256:6791ebfd912185ed59bfb5fb102664fa872496b79f87ff8b9cfba292a7345041` `# v1.0.13` | Pages build image, pinned to latest upstream release tag `v1.0.13` (GitHub `releases/latest`). The `latest` tag (`sha256:0a7bd759...`) is an unversioned `main` build (`version=main`), so `v1.0.13` remains the newest stable release. |
| `ghcr.io/hadolint/hadolint:v2.15.1-debian` | `sha256:9a3944b7fddcb947d1ffd90829ac1a6e5c30479223358f249d8b96c7d0019e27` `# v2.15.1-debian` | Hadolint image, pinned to latest upstream release tag `v2.15.1-debian`. Index contains `linux/amd64` (`sha256:aacf4eda...`) and `linux/arm64` (`sha256:5ffe7059...`). Replaces the `v2.14.0-debian` index. |

> Superseded single-arch or rotated digests kept for audit only:
> `62bc0610151db7155b7225f1a03c299bf109ab0b884da6777d1f808c7834d4ea`,
> `9415967aa0ed8adea8b5c048994259d1982026dca143d0303c7bbe0e11ed67d3`,
> `b7b34d8720b2e0ccaba980fd92347e7820051496ca0e639704172c6f3fb8877d`,
> `8a1c786152eaf72346a339ae2b869f5f7445cd311700f932f8bc94433a0e7d1b`,
> `2f5adac4ecd194d9f8c10b7b5d7bceb5186853db1b26e5abd3a657af0b7e26ec` (`moby/buildkit:v0.31.2` index, superseded 2026-10-17),
> `b059f8d7226d0b326bc871af489a5dddf65e36af4d20d14251b072974d9ee87c` (`moby/buildkit:v0.34.0` index, superseded 2026-11-15),
> `158cd0184dcaa18bd8ec20b61f4c1cabdf8b32a592d062f57bdcb8e4c1d312e2` (`hadolint/hadolint:v2.14.0-debian` index, superseded 2026-10-17).

---

## Policy

- All container image `FROM` statements in Containerfiles, `uses:` entries, external GitHub source refs, and direct workflow downloads must reference an identity pinned here, with an inline comment next to each pinned digest carrying its version number/tag.
- Every `wcurl` request must be followed by a matching `sha512sum --check --strict` verification before the payload is consumed.
- Versioned GitHub release URLs may retain their tag-shaped path only when the downloaded bytes are independently pinned and checked by SHA-512. `releases/latest` URLs are never permitted.
- For multi-arch jobs, reference the OCI index digest so it auto-resolves per runner architecture; do not pin a single-arch child in a matrix job.
- Mutable tags such as `:latest`, `:main`, or branch refs are rejected by `yubiOS.rego` and AGENTS.md policy.
- To add or roll a ref: obtain the digest, update this file, update repo references to the old digest, update `yubiOS.rego` if a new registry is introduced, and open a PR.
- Use `fetch-released-tag-ref` for yubi-OS fork release refs, `fetch-dhi-manifest` for `dhi.io/debian-base`, and `fetch-fedora-bootc-manifest` for `quay.io/fedora/fedora-bootc` (tracks the `:45` stream tag upstream, writes the digest-only `quay.io/fedora/fedora-bootc@sha256:<digest>` form into `Containerfile` and this file).
- Digests are verified at build time by the explicit `yubiOS.rego` `target.policy` inherited from `yubiOS-bake.hcl` (`reset=true`, `strict=true`).
- cosign v3.1.4 is the canonical signing binary; downstream verification tooling MUST pin to v3.1.4 SHA-512 above. The yubiOS verifier (`tests/verify-oci-attestations.sh`) keys its identity regex to `^https://github\.com/yubi-OS/yubiOS/\.github/workflows/(yubiOS-ci|ci_dev_image|ci_mkosi-installer)\.yml@refs/(heads|tags)/.+$`; a future publisher workflow must add its filename to that set in the verifier script.

## Rockchip DDR/TPL blob (RK3588)

Pulled at build time by `ci_firmware-rk.yml`, which fails closed on a sha256 mismatch. Not vendored in this repo.

| Source | Ref | Path | sha256 | Consumers |
|---|---|---|---|---|
| `rockchip-linux/rkbin` | `3e288fe814e059dd06833495f845cab04ac20a5c` | `bin/rk35/rk3588_ddr_lp4_2112MHz_lp5_2400MHz_v1.24.bin` | `2853a0da7ab895af43d50615af73eccf0694115dd0202483ee1c93c9071a42c3` `# v1.24` | `ROCKCHIP_TPL` for the RK3588 (`rock5b-rk3588`) legs |

Redistribution: the blob is Rockchip-proprietary. The packed `u-boot-rockchip.bin` embeds it, so publishing that image needs the licence decision first. See `refs/rk3588-ddr-tpl-source-2026-07-29.md`.
