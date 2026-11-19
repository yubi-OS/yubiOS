# GrapheneOS Build Architecture & CI Prerequisite Map for yubi-OS/grapheneOS

**Date:** 2026-11-19
**Repository:** `https://github.com/yubi-OS/grapheneOS`
**Upstream Reference:** `https://grapheneos.org/build` (GrapheneOS 17 / Android 17, tag `2026111800`, commit `c2f57432b89dda12ec40f07768d3c3a75bde9634`)
**Target CI Runner:** `ubuntu` (`[self-hosted, Linux, ARM64, HIGH-MEM]`, Snapdragon X Elite 12-core, 62 GiB RAM, Ubuntu 26.04.1, dedicated workspace mount at `/mnt/extended`)

---

## TL;DR

1. **Supply-Chain Pinning (`PINNED.md`)**: Every external tool, manifest tag, sub-repository revision, and container image is pinned by cryptographic digest or commit SHA before execution:
   - Google `repo` launcher (`sha256:05f571deafd6ed6da0d20fa707dde29aa5624dbf35553d697a40dbdd4c8d178a`) locked to `REPO_REV=v2.74` (`6405c052d61366d62fdc4a6dc318de3739f6dab9`).
   - GrapheneOS SSH `allowed_signers` (`contact@grapheneos.org ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIUg/m5CoP83b0rfSCzYSVA4cw4ir49io5GPoxbgxdJE`, `sha256:344f59c6f058699e63fea68e35953b341c14e3bf1fbc1256f6baa84aa2aca1d0`) verifying manifest tag `2026111800` (tag object `e5681d7438f52a75819d1f34f8d738fcaa54654c` -> commit `c2f57432b89dda12ec40f07768d3c3a75bde9634`), which transitively locks all 1,057 AOSP and GrapheneOS repositories (148 GrapheneOS forks) by exact commit SHA.
   - Node.js `v24.22.3` LTS (`sha256:6e51a2ada00f0011cc266f65d98922b403d7ad88f809ca2aa615a5fe1ce6e86c` for `linux-arm64`, `sha256:4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb` for `linux-x64`) for `vendor/adevtool`.
   - Android Command-Line Tools `11076708` (`sha256:2d2d50857e4eb553af5a6dc3ad507a17adf43d115264b1afc116f95c92e5e258`) and Gradle `8.10.2` (`sha256:31c55713e40233a8303827ceb42ca48a47267a0ad4bab9177123121e71524c26`).
2. **ARM64 Host (`ubuntu`) vs x86_64 AOSP Prebuilts**:
   - AOSP `prebuilts/clang/host/linux-x86`, `prebuilts/rust/linux-x86`, `prebuilts/go/linux-x86`, `prebuilts/jdk/jdk21/linux-x86`, and `prebuilts/build-tools/linux-x86` (including `nsjail` and `soong_ui`) ship as `x86_64` ELF binaries.
   - Running on `ubuntu` (`aarch64`) requires `qemu-user-static` registered in `/proc/sys/fs/binfmt_misc/qemu-x86_64` with the **`F` (fix-binary)** flag so Soong's `nsjail` mount-namespace sandbox can execute `x86_64` binaries inside chroots without `/usr/bin/qemu-x86_64-static` existing inside the sandbox root, paired with either a `linux/amd64` container/sysroot or `setarch x86_64` personality so `build/envsetup.sh` and `soong_ui.bash` resolve `UNAME=x86_64`.
3. **`/mnt/extended` Workspace Layout & Hardware I/O Protection**:
   - Root `/` has ~67 GB free, whereas a GrapheneOS 17 checkout + build requires ~285 GiB (shallow `-c --depth=1`) to ~440 GiB (full). All trees (`workspace/`, `out/`, `ccache/`, `vendor_cache/`, `releases/`, `sdk/`, `kernels/`, `vanadium/`) reside under `/mnt/extended/grapheneos/`.
   - Every heavy sync and compile step is wrapped in `nice -n 19 ionice -c3` with bounded concurrency (`repo sync -j4`, `m -j8 -l10`), preceded by a mandatory host `uptime` and top-CPU process check (`ps --sort=-pcpu`).
4. **Signing, Updater Safety & U2F/HSM Root-of-Trust Integration**:
   - `OFFICIAL_BUILD=true` requires overriding `packages/apps/Updater/res/values/config.xml` away from `https://releases.grapheneos.org/` to `https://ota.yubios.org/` before building to prevent an infinite signature-verification failure loop.
   - Release signing (`9` APK/APEX keys + `avb.pem` 4096-bit RSA + `id_ed25519` OpenSSH key) runs exclusively inside `/dev/shm` `tmpfs` with swap disabled (`swapoff -a`), and bridges to yubiOS's hardware root of trust via U2F/HSM PIV `slot 9c` (`avbtool --signing_helper` + `apksigner --ks-type PKCS11`) or attended FIDO2 `hmac-secret` key unsealing.

---

# Stream 1: Host OS, Packages, `/mnt/extended` Storage Layout, and ARM64 Host vs x86_64 AOSP Toolchain Architecture

**Target**: GrapheneOS 17 (`branch: 17`, tag `2026111800`)  
**Host Runner**: `ubuntu` (Microsoft Surface Laptop 7, Snapdragon X Elite ARM64 `aarch64`, 12 cores, 62 GiB RAM, Ubuntu 26.04.1 LTS / noble/plucky series)  
**Primary Build Filesystem**: `/mnt/extended` (Dedicated NVMe partition mounted for workspace/build tree; root `/` has ~67 GB free)  
**Hardware I/O Guard**: `ubuntu` halts under unthrottled NVMe/git bursts; strict enforcement of `nice -n 19 ionice -c3` and concurrency limits (`-j4` for repo sync, `-j8 -l10` for Soong/Ninja).

---

## 1. Complete Host Package Prerequisites & System Configuration

Building GrapheneOS on Ubuntu/Debian requires packages across five distinct functional domains: source fetching/verification, core AOSP build toolchain, vendor extraction (`adevtool`), browser engine compilation (Vanadium/Chromium), and cryptographic release signing.

### 1.1 Source Fetch & Verification Dependencies
Official upstream reference: [GrapheneOS Build Dependencies](https://grapheneos.org/build#build-dependencies).

```bash
sudo apt update && sudo apt install -y \
  git \
  git-lfs \
  gnupg \
  python3 \
  python3-protobuf \
  protobuf-compiler \
  curl \
  openssh-client \
  ca-certificates
```

* **`repo`**: While Ubuntu provides a `repo` package, GrapheneOS strongly recommends the standalone self-updating launcher from Google to prevent distribution packaging skew:
  ```bash
  sudo curl -o /usr/local/bin/repo https://storage.googleapis.com/git-repo-downloads/repo
  sudo chmod a+rx /usr/local/bin/repo
  ```
  `repo` uses GPG internally to verify cryptographic signatures of its self-updates and upstream manifests.
* **`git` & `git-lfs`**: Required for checkout and for managing large binary blobs (especially within Chromium/Vanadium trees).
* **`openssh-client`**: Required for verifying GrapheneOS signed git tags and release manifests via `ssh-keygen -Y verify` using `allowed_signers`.

### 1.2 AOSP Build Dependencies (Host-Level, Outside Source Tree)
AOSP relies on prebuilts for compilers and linkers, but depends on the host system for system headers, low-level compression, font rendering (headless OpenJDK), and build-sandboxing utilities:

```bash
sudo apt install -y \
  diffutils \
  libfreetype6 \
  libfreetype6-dev \
  fontconfig \
  fonts-dejavu-core \
  inetutils-tools \
  hostname \
  openssl \
  libssl-dev \
  rsync \
  unzip \
  zip \
  bc \
  bison \
  flex \
  gperf \
  libncurses6 \
  libncurses-dev \
  zlib1g \
  zlib1g-dev \
  liblz4-tool \
  lz4 \
  zstd \
  squashfs-tools \
  e2fsprogs \
  cpio \
  bsdextrautils \
  procps
```

* **`inetutils-tools` / `hostname`**: AOSP build scripts (such as `build/soong/ui/build/sandbox_linux.go`) execute `hostname` inside NsJail sandbox probes to ensure unprivileged user namespace isolation succeeded.
* **`fontconfig`, `libfreetype6`, `fonts-dejavu-core`**: Required by headless OpenJDK (`prebuilts/jdk/jdk21/linux-x86`) during layout compilation and resource generation; without host font engines, headless Java crashes on font metrics queries.
* **`diffutils`, `rsync`, `zip`, `unzip`, `bc`, `bison`, `flex`, `gperf`**: Required for host utility generation, device-tree compiler (`dtc`), SELinux policy compilation (`checkpolicy`), and kernel header extractions.
* **`squashfs-tools`, `e2fsprogs`, `lz4`, `zstd`**: Filesystem tools required by `build/make/tools/releasetools` to generate system, vendor, product, and APEX filesystem images.

### 1.3 `adevtool` Dependencies (Vendor File Extraction)
`adevtool` is GrapheneOS's TypeScript-based tool that downloads official Google Pixel factory images and OTA payloads, extracts proprietary firmware, modem, and vendor HAL binaries, unpacks radio/bootloader images, and generates vendor makefiles for the build tree.

* **Node.js 24 LTS & Corepack / Yarn**:
  Ubuntu system Node.js is often outdated. Debian/Ubuntu package `yarn` is reserved for `cmdtest`. Install Node.js 24 LTS and enable Corepack for Yarn v1/v4:
  ```bash
  # NodeSource or standalone archive for aarch64
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt install -y nodejs
  sudo corepack enable
  ```
  Within the tree, dependencies are initialized with:
  ```bash
  yarn --cwd vendor/adevtool/ install
  ```
* **`python3-protobuf`**: The payload extraction helper `vendor/adevtool/external/extract_android_ota_payload/` requires `google.protobuf` to parse OTA `update_metadata.pb`.

### 1.4 Vanadium (Chromium) Host Dependencies
Vanadium provides the hardened Chromium browser and system WebView:

```bash
sudo apt install -y \
  git-lfs \
  gperf \
  bison \
  flex \
  ninja-build
```

* **Multiarch 32-bit Compatibility**: On standard `x86_64` hosts, Chromium's toolchain requires 32-bit glibc (`libc6:i386`, `libgcc-s1:i386`). On our `aarch64` host running inside an `amd64` container / sysroot, 32-bit multiarch is enabled inside the `amd64` container environment via `dpkg --add-architecture i386`.

### 1.5 Release Signing Dependencies
* **`openssh-client` (`ssh-keygen`)**: Generates Ed25519 factory image release signatures and verifies download artifacts.
* **`openssl` (with `scrypt` KDF support)**: AOSP/GrapheneOS keys (`make_key` and `script/encrypt-keys`) encrypt device signing keys using AES-256 with `scrypt` as the Key Derivation Function (KDF). Standard OpenSSL 3.x on modern Ubuntu natively includes the `scrypt` KDF algorithm.

---

## 2. AOSP & GrapheneOS on an `aarch64` Linux Host (`ubuntu`)

### 2.1 The Fundamental Constraint: Prebuilt x86_64 ELF Binaries in AOSP
Upstream Android Open Source Project and GrapheneOS maintain a hermetic build philosophy where host toolchains are precompiled and checked directly into git repositories under `prebuilts/`. These include:
- `prebuilts/clang/host/linux-x86/`: Clang/LLVM C/C++ compiler suites
- `prebuilts/rust/linux-x86/`: `rustc` compiler and standard libraries
- `prebuilts/go/linux-x86/`: Host Go compiler used to compile Soong itself
- `prebuilts/build-tools/linux-x86/`: Ninja, NsJail, Kati (`ckati`), Toybox, Bison, Flex, Make
- `prebuilts/jdk/jdk21/linux-x86/`: OpenJDK runtime
- `build/soong/soong_ui.bash`: Bootstrap wrapper compiling `soong_ui`

Every one of these binaries is an `ELF 64-bit LSB x86-64` executable. When executed on an unmodified `aarch64` host, the Linux kernel returns `ENOEXEC` (`Exec format error`) immediately.

Furthermore, `build/envsetup.sh` and Soong's host architecture detection query `uname -m`. When `uname -m` outputs `aarch64` or `arm64`, upstream AOSP build scripts abort with:
```
Unknown host arch aarch64
```
or attempt to resolve non-existent paths under `prebuilts/.../linux-arm64/`.

### 2.2 Execution Architecture A: Multiarch + `qemu-user-static` (`binfmt_misc` with `F` Flag) + Rootless Container

To bridge the x86_64 prebuilt execution requirement on `ubuntu` (`aarch64`), the rock-solid strategy is **kernel-level user-mode emulation** paired with an `amd64` container or sysroot.

#### The Mandatory `F` (Fix-Binary) Flag in `binfmt_misc`
The Linux kernel's `binfmt_misc` subsystem matches binary magic headers and routes execution to an interpreter (e.g., `/usr/bin/qemu-x86_64-static`).

In standard `binfmt_misc` configurations without flags, the kernel resolves the interpreter path **lazily at execution time within the mount namespace of the target process**.

**Why this breaks AOSP:**
AOSP's Soong build system uses **NsJail** (`ui/build/sandbox_linux.go`) to isolate build steps. NsJail creates fresh mount namespaces, unshares user namespaces, pivots the root, and mounts isolated `/` structures:
1. When Soong spawns `prebuilts/build-tools/linux-x86/bin/nsjail`, NsJail creates a private mount namespace.
2. Inside that namespace, NsJail executes an `x86_64` binary (such as `clang`, `rustc`, or `ckati`).
3. If `binfmt_misc` was registered without the `F` flag, the kernel attempts to look up `/usr/bin/qemu-x86_64-static` inside the **sandbox's private mount namespace**.
4. Because the AOSP source tree does not copy `qemu-x86_64-static` into its sandbox chroot, the execve fails with:
   ```
   execve(...): No such file or directory
   ```
   causing Soong to fail immediately with `"Build sandboxing disabled due to nsjail error"` or hard abort.

**The Fix:**
Kernel 4.8+ introduced the `F` (`fix-binary`) flag (`--fix-binary yes` in `update-binfmts`). When `F` is set:
- The Linux kernel opens `/usr/bin/qemu-x86_64-static` **at the moment of binfmt_misc registration** from the host mount namespace.
- The kernel retains an internal `vfs` file descriptor to the interpreter binary.
- When an `x86_64` ELF is subsequently executed inside *any* container, chroot, or NsJail private mount namespace, the kernel executes the open file descriptor directly without looking for `/usr/bin/qemu-x86_64-static` inside the new rootfs.

Verification on `ubuntu` host:
```bash
cat /proc/sys/fs/binfmt_misc/qemu-x86_64
# Must output:
# enabled
# interpreter /usr/bin/qemu-x86_64-static
# flags: F
```

#### Containerized `linux/amd64` Execution via Podman / Docker
By executing the build within a `linux/amd64` container (e.g. `dhi.io/debian-base:bookworm-amd64` or `ubuntu:24.04-amd64` via Podman with `--arch amd64`):
- All host tools, shared libraries (`/lib64/ld-linux-x86-64.so.2`, `libc.so.6`), and AOSP prebuilts operate in an architecturally consistent x86_64 userland.
- `uname -m` inside the container naturally returns `x86_64`.
- The host ARM64 kernel handles instructions via `qemu-x86_64-static`.

#### Box64 vs QEMU User Static
- **QEMU User Static**: 100% full CPU emulation and accurate Linux syscall emulation. Essential for compilers, linkers, Go runtimes, and JIT engines that execute unconventional machine instructions or expect exact memory paging.
- **Box64**: Highly optimized dynarec with native library wrapping. While 3x–5x faster for games and pure compute, Box64 does not wrap complex internal AOSP toolchain libraries and can experience instabilities with NsJail user namespaces and multi-threaded Go runtimes in `soong_ui`. **Recommendation**: Standardize on `qemu-x86_64-static` with `flags: F`.

### 2.3 Execution Architecture B: Native ARM64 Prebuilts & `setarch x86_64` Personality

An alternative/hybrid approach is running natively on the ARM64 host and redirecting toolchains or fooling host architecture checks.

#### The `setarch x86_64` (or `linux64`) Personality Trick
When running directly on the `aarch64` host shell, running:
```bash
setarch x86_64 /bin/bash
```
changes the execution domain (`personality(PER_LINUX32/PER_LINUX)`) so that subsequent system calls to `uname(2)` report `x86_64` instead of `aarch64`.
- **Effect**: `build/envsetup.sh` and `soong_ui.bash` read `UNAME=x86_64` and select `linux-x86` prebuilts rather than erroring out on `aarch64`.
- **Requirement**: This still requires `qemu-x86_64-static` with the `F` flag enabled in `binfmt_misc`, because the binaries invoked under `prebuilts/` are still x86_64 ELFs.

#### Native ARM64 Prebuilts Status in AOSP/GrapheneOS
- Google's Android platform is gradually migrating internal tools to support `linux-arm64` hosts (particularly driven by internal Google Cloud ARM64 build instances and Apple Silicon developers).
- Modern AOSP trees contain limited `linux-arm64` prebuilts (e.g., Bazel / Kleaf kernel build tools, Chromium GN/Ninja).
- However, full GrapheneOS 17 builds still rely on `prebuilts/clang/host/linux-x86` and `prebuilts/build-tools/linux-x86` for Soong orchestration, Kati, and DEX/ART compilers (`dx`, `d8`, `r8`).
- **Complementary Hybrid Pattern**: Run Soong inside an `x86_64` personality/container with `qemu-user-static` (ensuring 100% build compatibility), while passing native ARM64 host utilities (like native `repo`, `git`, and system `ninja` where permitted) to minimize CPU emulation overhead.

---

## 3. `/mnt/extended` Directory Architecture & Concrete Storage Budget

The build host `ubuntu` has ~67 GB free on `/`. A single GrapheneOS checkout and build consumes between **250 GiB and 400 GiB**. Therefore, **all checkout trees, out directories, cache stores, vendor caches, and release packages must reside strictly on `/mnt/extended`**.

### 3.1 Concrete Disk Budget for GrapheneOS 17

| Component | Lightweight / Shallow Sync | Full Sync with Git History | Description / Mount Rule |
| :--- | :--- | :--- | :--- |
| **`.repo` + Source Checkout** | **90 GiB** (`--depth=1 -c`) | **136 – 160 GiB** | GrapheneOS platform manifest, Android 17 framework, external libraries. |
| **AOSP Build Output (`out/`)** | **100 – 140 GiB** | **140 – 180 GiB** | Intermediate objects, target libraries, target files package, system/vendor/product images. |
| **Compiler Cache (`ccache/`)** | **50 GiB** | **50 GiB** | Optional C/C++ compilation cache to dramatically speed up rebuilds. |
| **Release Artifacts (`releases/`)** | **20 GiB** | **20 GiB** | Signed factory images, OTA update zips, target files packages. |
| **Vendor Cache (`vendor_cache/`)**| **15 GiB** | **15 GiB** | Downloaded Pixel factory images, OTA zip payloads, adevtool unpack buffers. |
| **Temporary / Working Buffers** | **10 GiB** | **15 GiB** | Tool unpacks, oat dumps, apksigner temp files. |
| **TOTAL DISK ALLOCATION** | **~285 GiB** | **~440 GiB** | Must fit comfortably within `/mnt/extended`. |

### 3.2 `/mnt/extended` Directory Layout

```
/mnt/extended/
├── grapheneos/
│   ├── workspace/                      # Root AOSP source checkout
│   │   ├── .repo/                      # Repo manifest and git object stores
│   │   ├── build/
│   │   ├── vendor/adevtool/
│   │   ├── out -> /mnt/extended/grapheneos/out # Symlink or direct bind mount
│   │   └── ...
│   ├── out/                            # High-churn build outputs
│   ├── ccache/                         # Persistent ccache directory (CCACHE_DIR)
│   ├── vendor_cache/                   # Pixel factory images for adevtool (ADEVTOOL_CACHE_DIR)
│   ├── releases/                       # Final signed releases and update zips
│   └── container_home/                 # Home directory when building inside container
```

To configure:
```bash
sudo mkdir -p /mnt/extended/grapheneos/{workspace,out,ccache,vendor_cache,releases,container_home}
sudo chown -R $USER:$USER /mnt/extended/grapheneos
```

### 3.3 Ephemeral `tmpfs` RAM Disk for Release Signing Keys
**Security Invariant:** Decrypted cryptographic private keys (RSA 4096 AVB keys, release keys, platform keys, Ed25519 factory image keys) **must never touch persistent NVMe storage blocks** on `/mnt/extended` or `/`, and must be guarded against being swapped to disk.

GrapheneOS provides `script/decrypt-keys` and `script/encrypt-keys`. During production signing:
1. Keys are stored encrypted with AES-256 (scrypt KDF) in git or secure vault.
2. A dedicated, non-swappable `tmpfs` ramdisk is mounted:
   ```bash
   sudo mkdir -p /mnt/ramdisk/keys
   sudo mount -t tmpfs -o size=256M,mode=0700,noexec,nosuid,nodev tmpfs /mnt/ramdisk/keys
   ```
3. Decrypted keys are placed into `/mnt/ramdisk/keys`.
4. Build scripts reference `KEYS_DIR=/mnt/ramdisk/keys`.
5. Upon signing completion, the ramdisk is unmounted and zeroed:
   ```bash
   sudo umount /mnt/ramdisk/keys
   ```
6. **Swap Hardening**: Swap must be either disabled (`sudo swapoff -a`) during signing or backed by an ephemeral randomly-keyed swap device (`dm-crypt` with `/dev/urandom` key) to guarantee zero persistent key leakage.

---

## 4. Hardware I/O Protection & Concurrency Tuning for `ubuntu`

### 4.1 The Hardware Fault Mode
The Microsoft Surface Laptop 7 Snapdragon X Elite platform under high concurrent write IOPS (such as Git checking out 800+ repositories simultaneously or Ninja linking hundreds of shared objects) experiences storage controller stalls that can cause the runner to hang or kernel panic.

### 4.2 Throttled Execution Discipline
All heavy CI steps must be wrapped with scheduling priorities and strict concurrency boundaries:

1. **Scheduling Class Wrapper**:
   - `nice -n 19`: Lowest CPU scheduling priority for background compilation.
   - `ionice -c3`: Idle I/O scheduling class (processes only get disk time when no other program is accessing storage).
   ```bash
   THROTTLE="nice -n 19 ionice -c3"
   ```

2. **Repository Synchronization**:
   ```bash
   # DO NOT run repo sync -j16 or -j32
   $THROTTLE repo sync -c --no-clone-bundle --no-tags -j4
   ```
   - `-c`: Current branch only (saves ~45 GiB of storage).
   - `--no-clone-bundle`: Avoids downloading massive git bundles through Python memory buffers.
   - `-j4`: Restricts concurrent network and disk write streams to 4.

3. **Ninja / Soong Build**:
   ```bash
   # Bounded Ninja concurrency
   export NINJA_ARGS="-j8 -l10"
   $THROTTLE m -j8 -l10 target-files-package otatools-package
   ```
   - `-j8`: Limits compilation jobs to 8 concurrent threads (leaving 4 of the 12 Oryon cores free for kernel I/O flushers and system responsiveness).
   - `-l10`: Load average throttle (Ninja will not spawn new jobs if system 1-minute load exceeds 10.0).

---

## 5. Verification Checklist & Concrete CI Action Plan

Before executing the first GrapheneOS build run on `ubuntu`, verify the host against these gates:

- [ ] **Binfmt Verification**: `/proc/sys/fs/binfmt_misc/qemu-x86_64` has `flags: F`.
- [ ] **x86_64 Emulation Smoke Test**: Run `qemu-x86_64-static /bin/true` or test an x86_64 binary in the container.
- [ ] **Filesystem Mount**: `/mnt/extended` is mounted with `rw,exec` and ownership assigned to the runner user.
- [ ] **Node.js Environment**: `node -v` reports `v24.x.x` and `corepack enable` is verified.
- [ ] **I/O Throttling Active**: CI workflows explicitly prepend `nice -n 19 ionice -c3` and clamp `repo sync -j4` and `ninja -j8 -l10`.
- [ ] **Signing tmpfs Configured**: RAM disk mount script ready for staging release keys without NVMe writes.


---

# Stream 2: Source Sync, Cryptographic Manifest Verification, `adevtool` Vendor Extraction, and Target Matrix

## Executive Summary & Architecture Overview

The build architecture of **GrapheneOS** (`https://grapheneos.org/build`) relies on an end-to-end cryptographic chain of trust and an automated vendor extraction pipeline (`adevtool`). For the `yubi-OS/grapheneOS` automation on our self-hosted `ubuntu` runner with storage mounted at `/mnt/extended`, Stream 2 establishes the fundamental supply-chain gate before any compilation occurs:
1. **Bootstrap & Cryptographic Manifest Verification**: The build machine bootstraps the standalone Google `repo` launcher under strict SHA-256 integrity verification, pins `REPO_REV` to prevent unreviewed runtime self-updates, validates the release manifest tag against the GrapheneOS SSH signing key via `allowed_signers`, and leverages the immutable property of commit-pinned manifests (`repo manifest -r`) to transitively verify all ~1,100+ sub-repositories.
2. **Throttled, Resumable Source Synchronization**: To operate safely on an I/O-sensitive, multi-tenant host with storage on `/mnt/extended`, `repo sync` must be throttled with `nice -n 19` and `ionice -c3`, constrained concurrency (`-j4`), and resilient error-handling flags (`--fail-fast`, `--force-sync`, `--no-clone-bundle`, `--no-tags`).
3. **`adevtool` Vendor Extraction Pipeline**: In GrapheneOS 17 (Android 17), proprietary hardware drivers, firmware, SELinux policies, VINTF entries, and carrier configs are generated directly from Google Pixel factory images and OTA packages via `vendor/adevtool`. Using Node.js 24 LTS and Yarn, `adevtool` downloads cryptographically verified stock OS images, unpacks partitions (including sparse and dynamic super images via `simg2img` and `lpunpack`), filters blobs against strict specification files (`vendor-specs/`), and generates complete Soong (`Android.bp`) and Make (`BoardConfigVendor.mk`, `device-vendor.mk`) module trees under `vendor/google_devices/<device>`.
4. **Target Matrix & Invocation Anatomy**: GrapheneOS defines emulator development targets (`sdk_phone64_x86_64` and `sdk_phone64_arm64`) built via default `m` invocations alongside production Pixel 6 through 10 generation targets. Because partition layouts evolved across device generations (specifically the introduction of vendor boot and vendor kernel boot partitions), `m` invocations differ significantly between Pixel 6 (`m vendorbootimage target-files-package`), Pixel 7–9 (`m vendorbootimage vendorkernelbootimage target-files-package`), and emulator / general targets.

---

## 1. `repo` Bootstrap & Cryptographic Verification Chain

### 1.1 Standalone `repo` Launcher Integrity
The Android Open Source Project (AOSP) distributes the standalone Python launcher script for `repo` via Google Cloud Storage. In contrast to distribution packages (e.g. `apt install repo`), which can lag significantly behind upstream Gerrit requirements or carry distribution-specific patches, GrapheneOS upstream supports both, but recommends the standalone self-updating launcher for automated production environments.

* **Download URL**: `https://storage.googleapis.com/git-repo-downloads/repo`
* **Pinned SHA-256 Digest**:
  ```
  05f571deafd6ed6da0d20fa707dde29aa5624dbf35553d697a40dbdd4c8d178a
  ```
* **Bootstrap Verification Snippet**:
  ```bash
  mkdir -p ~/.bin
  curl -fsSL https://storage.googleapis.com/git-repo-downloads/repo -o ~/.bin/repo
  echo "05f571deafd6ed6da0d20fa707dde29aa5624dbf35553d697a40dbdd4c8d178a  ${HOME}/.bin/repo" | sha256sum -c -
  chmod 755 ~/.bin/repo
  export PATH="${HOME}/.bin:${PATH}"
  ```

### 1.2 Upstream Gerrit Self-Update & GPG Verification Mechanism
When `repo init` is invoked, the launcher script does not execute the entire sync logic itself. Instead, it downloads the full `git-repo` tool from:
```
https://gerrit.googlesource.com/git-repo
```
into the workspace's `.repo/repo/` directory.

#### GPG Maintainer Keys Verification
The launcher script contains an embedded ASCII-armored keyring (`MAINTAINER_KEYS`, keyring version `2.3`). When downloading or updating the `git-repo` repository:
1. `repo` initializes an isolated GnuPG homedir inside `.repo/gnupg/`.
2. It imports the embedded `MAINTAINER_KEYS` into this temporary keyring.
3. It fetches the Git ref specified by `REPO_REV` (which defaults to the `stable` branch if unspecified).
4. It cryptographically verifies that the commit or tag at `REPO_REV` is signed by one of the authorized Google/AOSP maintainer keys before transferring execution control to `.repo/repo/main.py`.

#### The Supply-Chain Risk: `REPO_REV` Drift & Pinning
By default, `REPO_REV="stable"` tracks the moving `stable` branch on Gerrit. In a CI/CD automation pipeline (such as GitHub Actions running on our self-hosted runner), allowing `repo` to silently update itself introduces non-determinism, build breakages, and supply-chain exposure to unreviewed code.

To guarantee hermetic, reproducible builds, CI must explicitly pin `REPO_REV` to an immutable release tag (e.g. `v2.74`, commit `6405c052d61366d62fdc4a6dc318de3739f6dab9`, peeled commit `a816b88d2319089d5cbaa3fa336a68db917cb0f7`).
* **CI Pinning Contract in `PINNED.md`**:
  ```markdown
  | Component | Source URL | Pinned Ref / Tag | Digest / Commit SHA |
  |-----------|------------|------------------|---------------------|
  | repo launcher | https://storage.googleapis.com/git-repo-downloads/repo | - | `sha256:05f571deafd6ed6da0d20fa707dde29aa5624dbf35553d697a40dbdd4c8d178a` |
  | git-repo execution | https://gerrit.googlesource.com/git-repo | `refs/tags/v2.74` | `commit:6405c052d61366d62fdc4a6dc318de3739f6dab9` |
  ```
* **Invocation**:
  ```bash
  export REPO_REV="v2.74"
  # Or pass directly to repo init:
  repo init --repo-rev="v2.74" -u https://github.com/GrapheneOS/platform_manifest.git -b refs/tags/2026111800
  ```
This ensures `repo` verifies the GPG signature on tag `v2.74` and executes exactly the pinned version without polling or pulling newer code.

---

### 1.3 GrapheneOS SSH Tag Signature Verification & Allowed Signers
GrapheneOS signs all official Git release tags using OpenSSH digital signatures (introduced in OpenSSH 8.0+), providing a modern, collision-resistant alternative to PGP/GPG.

#### Allowed Signers Configuration
GrapheneOS publishes its official signing identity at:
```
https://grapheneos.org/allowed_signers
```
The canonical signer entry:
```
contact@grapheneos.org ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIUg/m5CoP83b0rfSCzYSVA4cw4ir49io5GPoxbgxdJE
```

#### Verification Command & Git Object Resolution
When initializing a build from a release tag (e.g. `2026111800`), the manifest repository (`.repo/manifests`) contains an annotated, signed tag. The verification sequence executes:
```bash
# 1. Download allowed_signers to a trusted path
curl -fsSL https://grapheneos.org/allowed_signers -o ~/.ssh/grapheneos_allowed_signers

# 2. Inside the manifest repo, configure git to use the allowedSignersFile
cd .repo/manifests
git config gpg.ssh.allowedSignersFile ~/.ssh/grapheneos_allowed_signers

# 3. Verify the annotated tag signature
git verify-tag $(git describe)
cd ../..
```

#### Cryptographic Anatomy of Tag `2026111800`
Taking the live production tag `2026111800` as a verified reference:
* **Tag Ref**: `refs/tags/2026111800`
* **Annotated Tag Object SHA**: `e5681d7438f52a75819d1f34f8d738fcaa54654c`
* **Peeled Commit Object SHA**: `c2f57432b89dda12ec40f07768d3c3a75bde9634`
* **Tagger**: `GrapheneOS <contact@grapheneos.org> 1795038729 -0500`
* **SSH Signature**:
  ```text
  -----BEGIN SSH SIGNATURE-----
  U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAghSD+bkKg/zdvSt9ILNhJUDhzDi
  Kvj2KjkY+jFuDF0kQAAAADZ2l0AAAAAAAAAAZzaGE1MTIAAABTAAAAC3NzaC1lZDI1NTE5
  AAAAQGXy02FoV1jiGP+/3fNJsjLOG8FFDdFhBKvYOsuiVqAmIzmGFdxCgByIMYrzXyBRLg
  icu+TPNJI9Ekh5GsidFgg=
  -----END SSH SIGNATURE-----
  ```
When `git verify-tag 2026111800` runs, Git extracts the tag payload, reconstructs the message, verifies the Ed25519 signature using the public key linked to `contact@grapheneos.org`, and validates that the tag points directly to commit `c2f57432b89dda12ec40f07768d3c3a75bde9634`.

---

### 1.4 Transitive Cryptographic Authentication of ~1,100+ Repositories
A critical security question in operating-system-scale source management: **How does verifying a single Git tag in `platform_manifest` guarantee the integrity of all ~1,100+ distinct repositories downloaded by `repo sync`?**

#### Manifest Modes: Branch Manifests vs Frozen Release Manifests
1. **Development Branches (e.g. `-b 17`)**: The manifest contains project entries specifying branch names (e.g. `revision="17"` or `revision="android-17.0.0_r1"`). In this mode, sub-repositories advance as new commits are pushed upstream; verifying the manifest tag does not freeze the sub-repositories unless each individual tag is audited.
2. **Frozen Stable Release Manifests (e.g. `-b refs/tags/2026111800`)**:
   GrapheneOS generates release manifests using `repo manifest -r` (or equivalent build release pipelines). In this manifest (e.g. `session/intake/grapheneos-2026111800-default.xml`), **every single sub-repository entry specifies an exact, immutable 40-character Git commit SHA-1/SHA-256 in its `revision` attribute**:
   ```xml
   <project name="platform/art" path="art" revision="e68fa7b22047ff0fce102f903e1e2c9ef895e632" upstream="refs/tags/2026111800" ... />
   <project name="adevtool" path="vendor/adevtool" remote="grapheneos" revision="b1c5b4411b7b46537c20f817c2ab68d49aa52820" ... />
   <project name="platform/bionic" path="bionic" revision="d3ac78f5664db696dbf5339f40774a814fe4c161" ... />
   ```

#### The Merkle Authentication Property
Because the manifest file (`default.xml`) is a physical file committed into the Git tree of commit `c2f57432b89dda12ec40f07768d3c3a75bde9634`, its contents form part of that commit's SHA-1/SHA-256 tree root.
* By verifying the cryptographic Ed25519 signature on tag `2026111800`, the signer (`contact@grapheneos.org`) signs the commit object.
* The commit object binds the exact bytes of `default.xml`.
* In Git, a commit object SHA is a cryptographic hash of its tree and commit metadata (including author, committer, and parent commits). It is cryptographically infeasible to alter any source file, commit message, or directory structure within any sub-project without changing that sub-project's commit SHA.
* Because `default.xml` pins the exact commit SHA for every one of the ~1,100+ repositories, verifying the single manifest tag transitively authenticates the entire source tree. No separate per-repository tag-verification script is needed or desired.

---

## 2. Throttled, Resumable `repo sync` on `ubuntu` (`/mnt/extended`)

### 2.1 Storage & Host Constraints on `ubuntu` Runner
The `ubuntu` self-hosted runner hosts CI builds on an extended storage volume at `/mnt/extended`. A standard AOSP + GrapheneOS source checkout requires **136 GiB+** of storage with commit history (or **90 GiB+** with shallow `--depth=1` sync), and the subsequent full OS build consumes an additional **100 GiB+** to **150 GiB+** per target architecture.

On a multi-tenant box where background services, monitoring bridges, and other builds may run concurrently, unthrottled `repo sync` can saturate both network bandwidth and disk I/O queues (leading to disk latency spikes, IOPS exhaustion, and socket timeouts).

### 2.2 Recommended Sync Invocation & Exact Flags
To ensure reliable, non-disruptive, and fully resumable downloads:

```bash
# 1. Directory creation on extended volume
mkdir -p /mnt/extended/grapheneos-2026111800
cd /mnt/extended/grapheneos-2026111800

# 2. Repo initialization targeting the verified tag
repo init -u https://github.com/GrapheneOS/platform_manifest.git \
          -b refs/tags/2026111800 \
          --repo-rev="v2.74"

# 3. Cryptographic tag verification of the manifest
(
  cd .repo/manifests
  git config gpg.ssh.allowedSignersFile ~/.ssh/grapheneos_allowed_signers
  git verify-tag 2026111800 || { echo "CRITICAL: Manifest tag signature verification failed!"; exit 1; }
)

# 4. Throttled, resilient synchronization
nice -n 19 ionice -c3 repo sync \
    -c \
    --no-clone-bundle \
    --no-tags \
    -j4 \
    --fail-fast
```

### 2.3 Detailed Flag Rationale & Failure Mode Analysis

| Flag | Technical Behavior | Operational Rationale |
|------|--------------------|-----------------------|
| `nice -n 19` | Lowest CPU scheduling priority | Prevents `repo sync` (and git pack-objects unpacking threads) from starving system processes or latency-critical daemons. |
| `ionice -c3` | Idle I/O scheduling class (CFQ/BFQ) | Forces disk writes/reads to yield whenever any normal process requests disk access on `/mnt/extended`. |
| `-c` (`--current-branch`) | Fetches only the currently checked-out commit/ref | Prevents fetching all remote branches across 1,100+ repos, saving tens of gigabytes of network transit and disk storage. |
| `--no-clone-bundle` | Bypasses CDN `clone.bundle` pre-packaged downloads | For Gerrit/GitHub mirrors, CDN clone bundles are frequently stale, missing for specific tags, or fail with HTTP 404/504 errors on automated runners. Direct Git fetch is more robust and prevents corrupt archive extraction. |
| `--no-tags` | Omits fetching Git tags in sub-repositories | Since the manifest pins exact commit SHAs (`revision="<SHA>"`), fetching thousands of unrelated upstream Git tags wastes significant metadata space and I/O cycles. |
| `-j4` | Restricts parallel network/git jobs to 4 | Default `repo sync` can launch 8–16+ parallel Git processes, saturating TCP connection pools and disk buffers. `-j4` maintains steady throughput without causing socket drops or thrashing. |
| `--fail-fast` | Aborts the sync immediately on the first network/git failure | Rather than spending 45 minutes continuing to sync 1,000 repositories when one critical repo has failed, CI fails early so network retries can be applied cleanly. |

### 2.4 Handling Interrupted Syncs & Fork Switching (`--force-sync`)

#### Resumability
`repo sync` is natively atomic and resumable at the repository level. Git fetches objects into `.repo/projects/<path>.git` or `.repo/project-objects/`. If a network disconnect or CI timeout occurs:
* Re-executing the identical `repo sync` command resumes fetching missing objects.
* Never run `rm -rf` on the workspace or `.repo` directory after an interrupted sync.

#### Switching Tags & The `--force-sync` Imperative
When updating between release tags or switching branches, GrapheneOS frequently introduces new custom forks of upstream AOSP projects (or removes existing forks and returns to AOSP upstream).
* **The Error**: When a repository's remote URL changes in the manifest (e.g. from `https://android.googlesource.com/...` to `https://github.com/GrapheneOS/...`), a standard `repo sync` will abort with an error indicating that the local checkout has diverged or points to a different remote.
* **The Resolution**:
  ```bash
  repo init -u https://github.com/GrapheneOS/platform_manifest.git -b refs/tags/<NEW_TAG>
  repo sync -c --no-clone-bundle --no-tags -j4 --force-sync
  ```
  `--force-sync` instructs `repo` to overwrite existing local tracking branches and re-point the working tree to the newly configured remote without requiring manual intervention.

---

## 3. `adevtool` Vendor Extraction Pipeline (`vendor/adevtool`)

### 3.1 Architectural Role of `adevtool` in GrapheneOS 17
AOSP source trees do not include proprietary vendor hardware drivers, modem firmware, GPU binaries, audio calibration tables, or carrier configurations necessary to run on physical Google Pixel devices. In legacy custom ROMs, developers relied on untracked binary blobs copied manually from running devices or extracted from outdated vendor zips.

GrapheneOS developed **`adevtool`** (`vendor/adevtool`, repository `https://github.com/GrapheneOS/adevtool`) to fully automate, standardize, and verify vendor support for all Google Pixel devices. In GrapheneOS 17 (Android 17):
* `adevtool` is a TypeScript application driven by the OCLif CLI framework.
* It executes under **Node.js 24 LTS** (required in `vendor/adevtool/bin/run`: `MIN_NODE_MAJOR_VERSION = 24`).
* It operates directly against official Google Pixel factory images and OTA packages.
* It parses, extracts, filters, and generates complete AOSP Soong build files (`Android.bp`) and Makefiles (`BoardConfigVendor.mk`, `device-vendor.mk`) under `vendor/google_devices/<device>`.

### 3.2 Setup & Dependencies
`adevtool` must be executed from the root of the GrapheneOS OS tree. It explicitly requires host prebuilts provided within the AOSP source tree (such as `prebuilts/build-tools/path/linux-x86` and `prebuilts/jdk/jdk21/linux-x86/bin`).

```bash
# Inside GrapheneOS source root:
cd vendor/adevtool
yarn install --frozen-lockfile
cd ../..

# Initialize AOSP build environment
source build/envsetup.sh
```

### 3.3 Factory Image Download & SHA-256 Digest Verification
`adevtool` maintains a cryptographic build index of all known Google Pixel factory images and full OTA zips:
* `vendor/adevtool/config/build-index/build-index-main.yml`
* `vendor/adevtool/config/build-index/build-index-canary.yml`
* `vendor/adevtool/config/build-index/build-index-beta.yml`

#### Pinned Digest Example (from `build-index-main.yml`):
```yaml
yogi CD1A.261005.003:
  desc: Oct 2026
  factory: 0f9fd538c4be6943421c85f55539000f519b1226db5e2ab9b95aa60d69759777 yogi-cd1a.261005.003-factory-0f9fd538.zip
  ota: fe783179759f1edd22eea66d1f63f98aec9837a3af0a89e01a3e178d3971b13f yogi-ota-cd1a.261005.003-fe783179.zip
```

#### Verification and Download Sequence
When `vendor/adevtool/bin/run generate-all -d <device>` (or `adevtool download -d <device>`) is invoked:
1. `adevtool` reads the device configuration (e.g. `config/device/<device>.yml`, including common fragments like `common/gen9pixel.yml` or `common/gen10pixel.yml`).
2. It resolves the pinned `build_id` for that device.
3. If the factory image zip is not present in the local download cache (configured via `IMAGE_DOWNLOAD_DIR`, defaulting to `~/.adevtool-cache/images` or workspace-relative cache), `adevtool` downloads the image from Google's official servers.
4. During download, it streams bytes into a temporary file (`.tmp`) and computes the SHA-256 digest on the fly via `hasha` / Node.js `crypto`.
5. If the computed digest does not match the pinned hash in `build-index-main.yml`, `adevtool` immediately throws an error and deletes the corrupted/tampered file.

---

### 3.4 Partition Unpacking & Toolchain
Once verified, `adevtool` unpacks the factory image archive:
1. **Archive Extraction**: The outer factory zip contains bootloader images, radio images, and a nested `image-<device>-<build_id>.zip`.
2. **Super Image Reconstruction & Splitting**:
   * Modern Pixels use dynamic partitions stored within `super.img`. In factory images, `super.img` is frequently split into sparse chunk images (`super_1.img`, `super_2.img`, etc.).
   * `adevtool` uses the host prebuilt tool `simg2img` (located via `getHostBinPath('simg2img')`) to un-sparse and concatenate the chunks into a unified raw `super.img`.
   * It then runs `lpunpack` (`getHostBinPath('lpunpack')`) on `super.img` to extract the constituent logical partitions:
     * `vendor.img`
     * `product.img`
     * `system_ext.img`
     * `system_dlkm.img` / `vendor_dlkm.img` / `odm_dlkm.img`
3. **Filesystem Traversal**:
   * `adevtool` extracts files from the ext4 / erofs partition images using prebuilt utilities (such as `debugfs` or native filesystem readers).
4. **Bootloader & Radio Firmware Extraction**:
   * Extracted from `bootloader.img` and `radio.img` using fastboot pack parsers (`src/images/fastboot-pack.ts` and `src/images/firmware.ts`).

---

### 3.5 Generation of `vendor/google_devices/<device>`
Following partition extraction, `adevtool` processes and filters the files through device-specific rules defined in `vendor/adevtool/config/device/`:
* **Module Generation**:
  * Shared libraries (`.so`) are converted into Soong `cc_prebuilt_library_shared` definitions with appropriate multilib and architecture targets (`android_arm`, `android_arm64`).
  * Proprietary APKs are converted into `android_app_import` modules, stripping Google certificates and configuring pre-opt settings.
  * Proprietary firmware files are staged into `vendor/google_devices/<device>/firmware/`.
* **Makefiles and Blueprint Files Created**:
  * `Android.bp`: Blueprint declarations for prebuilt libraries, binaries, HALs, and packages.
  * `BoardConfigVendor.mk`: Defines board-level vendor flags, partition sizes, SELinux policies, and AB OTA partition inclusions.
  * `device-vendor.mk`: Inherited by the main device product makefile, enumerating the packages and files copied into the target system image.
  * `adevtool-version-check.mk`: A defensive makefile assertion that verifies at build time that the checked-out commit of `vendor/adevtool` matches the exact revision used to generate the vendor tree:
    ```makefile
    ifneq ($(shell git -C vendor/adevtool rev-parse HEAD),b1c5b4411b7b46537c20f817c2ab68d49aa52820)
      $(error tokay vendor module is outdated. Run `adevtool generate-all -d tokay` to update it)
    endif
    ```

---

## 4. Build Targets & Variants Matrix

### 4.1 Target Classification: Emulator vs Physical Pixel Devices

GrapheneOS partitions its target matrix into two distinct categories:

| Target Category | Lunch Identifier | Intended Usage | Security Architecture & Update Posture |
|-----------------|------------------|----------------|-----------------------------------------|
| **SDK Emulator (x86_64)** | `sdk_phone64_x86_64-cur-userdebug` | Rapid CI functional validation, testing, automated unit tests | Runs inside QEMU/KVM; uses generic prebuilt kernels; **lacks** hardware MTE, Titan M2 security enclave, proprietary radio/camera HALs, and hardware verified boot. |
| **SDK Emulator (arm64)** | `sdk_phone64_arm64-cur-userdebug` | ARM64 virtualization testing | Runs on ARM64 runners (e.g. `rock1` / Apple Silicon KVM); shares emulator constraints. |
| **Production Pixels (6th–10th Gen)** | `<device>-cur-user` | Real device production releases | Full hardware verified boot (AVB), hardware memory tagging (MTE), Weaver/StrongBox attestation, complete monthly firmware updates. |

### 4.2 Comprehensive Device Matrix (Pixel 6 through 10)

| Codename | Commercial Name | Generation | SoC Platform | `m` Build Invocation |
|----------|-----------------|------------|--------------|------------------------|
| `oriole` | Pixel 6 | 6th Gen | Google Tensor (GS101) | `m vendorbootimage target-files-package` |
| `raven` | Pixel 6 Pro | 6th Gen | Google Tensor (GS101) | `m vendorbootimage target-files-package` |
| `bluejay` | Pixel 6a | 6th Gen | Google Tensor (GS101) | `m vendorbootimage target-files-package` |
| `panther` | Pixel 7 | 7th Gen | Tensor G2 (GS201) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `cheetah` | Pixel 7 Pro | 7th Gen | Tensor G2 (GS201) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `lynx` | Pixel 7a | 7th Gen | Tensor G2 (GS201) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `tangorpro`| Pixel Tablet | 7th Gen | Tensor G2 (GS201) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `felix` | Pixel Fold | 7th Gen | Tensor G2 (GS201) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `shiba` | Pixel 8 | 8th Gen | Tensor G3 (Zuma) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `husky` | Pixel 8 Pro | 8th Gen | Tensor G3 (Zuma) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `akita` | Pixel 8a | 8th Gen | Tensor G3 (Zuma) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `tokay` | Pixel 9 | 9th Gen | Tensor G4 (ZumaPro) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `caiman` | Pixel 9 Pro | 9th Gen | Tensor G4 (ZumaPro) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `komodo` | Pixel 9 Pro XL | 9th Gen | Tensor G4 (ZumaPro) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `comet` | Pixel 9 Pro Fold| 9th Gen | Tensor G4 (ZumaPro) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `tegu` | Pixel 9a | 9th Gen | Tensor G4 (ZumaPro) | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `frankel` | Pixel 10 | 10th Gen | Laguna Platform | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `blazer` | Pixel 10 Pro | 10th Gen | Laguna Platform | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `mustang` | Pixel 10 Pro XL | 10th Gen | Laguna Platform | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `rango` | Pixel 10 Pro Fold| 10th Gen | Laguna Platform | `m vendorbootimage vendorkernelbootimage target-files-package` |
| `stallion`| Pixel 10a | 10th Gen | Laguna Platform | `m vendorbootimage vendorkernelbootimage target-files-package` |

---

### 4.3 Deep Technical Dive: Why `m` Invocations Differ Across Generations

In upstream AOSP documentation for generic targets, the build command is simply:
```bash
m target-files-package
```
However, in GrapheneOS, building target-files packages for Pixel devices requires explicitly specifying additional image goals.

#### 1. Pixel 6 Series: `m vendorbootimage target-files-package`
* **Boot Architecture**: Introduced dedicated `vendor_boot` partition separate from the generic GKI `boot` partition. The `vendor_boot` image contains device-specific kernel modules, ramdisk, device-tree blobs (DTB), and boot parameters.
* **Build Dependency**: The target-files packaging step in Android's build system does not automatically resolve `vendor_boot.img` as an implicit prerequisite in certain Soong/Kati build graphs unless explicitly requested on the command line. Failing to pass `vendorbootimage` can result in an incomplete or stale `vendor_boot.img` being packaged into the target files archive.

#### 2. Pixel 7, 8, 9, and 10 Series: `m vendorbootimage vendorkernelbootimage target-files-package`
* **The Introduction of `vendor_kernel_boot`**:
  Starting with Android 13 and Pixel 7 (Tensor G2), Google separated the kernel ramdisk and vendor ramdisk further to support Generic Boot Image certification.
  * `boot.img`: Holds the generic upstream Linux GKI kernel binary.
  * `vendor_boot.img`: Holds SoC/board-specific boot configuration and vendor ramdisk.
  * `vendor_kernel_boot.img`: Holds vendor-specific kernel ramdisks (first-stage mount binaries, device tree fragments, early vendor modules needed before storage initialization).
* **The Target Dependency Hazard**:
  Building `target-files-package` alone evaluates the target files packaging rule, but `vendor_kernel_boot.img` is generated by a separate build rule (`vendorkernelbootimage`). Without explicitly listing both `vendorbootimage` and `vendorkernelbootimage` in the `m` invocation, the build system can complete `target-files-package` without generating the required boot image artifacts, causing fastboot flashing or release-signing scripts to fail.

#### 3. Emulator Builds: Faster Development Invocation
For emulator targets (`sdk_phone64_x86_64`):
```bash
source build/envsetup.sh
lunch sdk_phone64_x86_64-cur-userdebug
m -j$(nproc)
```
Because the emulator runs with an unlocked bootloader and public test keys, generating `target-files-package` and resigning with custom release keys is unnecessary. Running plain `m` builds raw system images in `out/target/product/emulator64_x86_64/`, which can be booted immediately via `emulator`.

---

## 5. Implementation Blueprint for `yubi-OS/grapheneOS` CI Workflow

### 5.1 CI Step Sequence on `ubuntu` Runner

```yaml
name: GrapheneOS Source & Adevtool Stage
on:
  workflow_dispatch:
    inputs:
      target_device:
        description: 'Target Device Codename (e.g. tokay, husky, sdk_phone64_x86_64)'
        required: true
        default: 'sdk_phone64_x86_64'
      manifest_tag:
        description: 'GrapheneOS Manifest Tag'
        required: true
        default: '2026111800'

jobs:
  sync_and_vendor:
    runs-on: [self-hosted, linux, ubuntu]
    steps:
      - name: Configure Storage Directory
        run: |
          mkdir -p /mnt/extended/grapheneos-ci
          echo "WORKSPACE_DIR=/mnt/extended/grapheneos-ci" >> $GITHUB_ENV

      - name: Bootstrap and Verify Repo
        run: |
          mkdir -p ~/.bin
          curl -fsSL https://storage.googleapis.com/git-repo-downloads/repo -o ~/.bin/repo
          echo "05f571deafd6ed6da0d20fa707dde29aa5624dbf35553d697a40dbdd4c8d178a  ${HOME}/.bin/repo" | sha256sum -c -
          chmod 755 ~/.bin/repo
          echo "${HOME}/.bin" >> $GITHUB_PATH

      - name: Initialize Repo with Pinned REPO_REV
        run: |
          cd $WORKSPACE_DIR
          export REPO_REV="v2.74"
          repo init -u https://github.com/GrapheneOS/platform_manifest.git \
                    -b refs/tags/${{ inputs.manifest_tag }} \
                    --repo-rev="v2.74"

      - name: Verify GrapheneOS Manifest Tag Signature
        run: |
          cd $WORKSPACE_DIR/.repo/manifests
          mkdir -p ~/.ssh
          curl -fsSL https://grapheneos.org/allowed_signers -o ~/.ssh/grapheneos_allowed_signers
          git config gpg.ssh.allowedSignersFile ~/.ssh/grapheneos_allowed_signers
          git verify-tag ${{ inputs.manifest_tag }}

      - name: Throttled Source Synchronization
        run: |
          cd $WORKSPACE_DIR
          nice -n 19 ionice -c3 repo sync -c --no-clone-bundle --no-tags -j4 --fail-fast

      - name: Extract Vendor Blobs via adevtool (Pixel targets only)
        if: ${{ inputs.target_device != 'sdk_phone64_x86_64' && inputs.target_device != 'sdk_phone64_arm64' }}
        run: |
          cd $WORKSPACE_DIR
          cd vendor/adevtool
          yarn install --frozen-lockfile
          cd ../..
          source build/envsetup.sh
          vendor/adevtool/bin/run generate-all -d ${{ inputs.target_device }}

      - name: Build Verification
        run: |
          cd $WORKSPACE_DIR
          source build/envsetup.sh
          if [ "${{ inputs.target_device }}" = "sdk_phone64_x86_64" ]; then
            lunch sdk_phone64_x86_64-cur-userdebug
            m -j4
          else
            lunch ${{ inputs.target_device }}-cur-user
            case "${{ inputs.target_device }}" in
              oriole|raven|bluejay)
                m -j4 vendorbootimage target-files-package
                ;;
              *)
                m -j4 vendorbootimage vendorkernelbootimage target-files-package
                ;;
            esac
          fi
```

---

## 6. References & Primary Sources

1. **GrapheneOS Official Build Documentation**: `https://grapheneos.org/build`
2. **GrapheneOS Allowed Signers**: `https://grapheneos.org/allowed_signers`
3. **GrapheneOS Platform Manifest Repository**: `https://github.com/GrapheneOS/platform_manifest`
   - Tag `2026111800` Tag Object: `e5681d7438f52a75819d1f34f8d738fcaa54654c`
   - Tag `2026111800` Commit: `c2f57432b89dda12ec40f07768d3c3a75bde9634`
4. **GrapheneOS `adevtool` Repository**: `https://github.com/GrapheneOS/adevtool`
   - Revision `b1c5b4411b7b46537c20f817c2ab68d49aa52820` (`refs/tags/2026111800`)
   - CLI Runner: `vendor/adevtool/bin/run`
   - Device configurations: `vendor/adevtool/config/device/`
   - Build indices: `vendor/adevtool/config/build-index/build-index-main.yml`
5. **Google Git Repo Source & Launcher**: `https://gerrit.googlesource.com/git-repo`
   - Standalone script: `https://storage.googleapis.com/git-repo-downloads/repo` (`sha256:05f571deafd6ed6da0d20fa707dde29aa5624dbf35553d697a40dbdd4c8d178a`)
   - Release ref: `refs/tags/v2.74`
6. **Local Intake Files**:
   - `session/intake/grapheneos-build.md`
   - `session/intake/grapheneos-2026111800-default.xml`


---

# Stream 3: Prebuilt Code Pipelines (Kernels, Microdroid, Vanadium/Antimony, and Standalone Apps)

**Date**: November 19, 2026  
**Context**: `yubi-OS/grapheneOS` Build Infrastructure & CI Architecture  
**Target Runner**: `ubuntu` Self-Hosted HIGH-MEM Runner (`/mnt/extended`, 647 GB available ext4 on LUKS)  
**Upstream Reference**: [GrapheneOS Build Documentation](https://grapheneos.org/build#prebuilt-code)

---

## 1. Executive Summary & Architectural Positioning

Like upstream Android Open Source Project (AOSP), GrapheneOS encapsulates certain high-complexity, standalone components as **prebuilt binaries** bundled into the operating system source tree. Building these components out-of-tree guarantees reproducible toolchains, separates monolithic OS build cycles from upstream component update cadences, and isolates distinct build technologies:
- **Kleaf / Bazel hermetic kernel toolchains** for Linux kernels (GKI 6.18, Microdroid 6.18, Tensor G1–G4 6.1, Tensor G5 6.18).
- **Chromium / GN / Ninja (`autoninja`) toolchains** for Vanadium WebView, Vanadium Browser, and VanadiumConfig APKs.
- **Gradle & Android Standalone SDK toolchains** for standalone security and system APKs (`AppStore`, `Auditor`, `Camera`, `PdfViewer`, `AppCompatConfig`, `GmsCompatConfig`, `TalkBack`).

This document provides the definitive implementation blueprint for **Stream 3 CI pipelines**, detailing repository topologies, execution workflows, output destination paths within `grapheneos-17`, artifact signing protocols, and strategic synergies with `yubi-OS/chromium-provenance` (Antimony).

---

## 2. Kernel Build Pipelines

GrapheneOS isolates the Linux kernel from the Android platform build system. Kernels compile using hermetic toolchains pinned within kernel manifests or submodules, preventing contamination from host OS compiler versions.

```
                    ┌───────────────────────────────────────────┐
                    │       GrapheneOS Kernel Pipelines         │
                    └─────────────────────┬─────────────────────┘
                                          │
       ┌───────────────────┬──────────────┴──────┬───────────────────┐
       ▼                   ▼                     ▼                   ▼
┌──────────────┐   ┌──────────────┐      ┌──────────────┐    ┌──────────────┐
│ Emulator/CF  │   │  Microdroid  │      │ Pixel 6th–9th│    │  Pixel 10th  │
│ GKI 6.18     │   │     6.18     │      │   6.1 LTS    │    │   6.18 LTS   │
├──────────────┤   ├──────────────┤      ├──────────────┤    ├──────────────┤
│build_generic │   │Bazel target: │      │Kleaf/Bazel:  │    │Sync script:  │
│.sh           │   │//common:     │      │build_<code-  │    │./build_<cd>- │
│(aarch64/x86) │   │kernel_*_dist │      │name>.sh      │    │name>.sh      │
└──────┬───────┘   └──────┬───────┘      └──────┬───────┘    └──────┬───────┘
       │                  │                     │                   │
       ▼                  ▼                     ▼                   ▼
┌──────────────┐   ┌──────────────┐      ┌──────────────┐    ┌──────────────┐
│device/google/│   │packages/     │      │device/google/│    │device/google/│
│cuttlefish_   │   │modules/      │      │<device>-     │    │laguna-       │
│prebuilts/    │   │Virtualization│      │kernels/6.1/  │    │kernels/6.18/ │
│kernel/6.18/  │   │/microdroid/  │      │grapheneos/   │    │grapheneos/<cd│
└──────────────┘   └──────────────┘      └──────────────┘    └──────────────┘
```

---

### 2.1 Emulator & Cuttlefish 6.18 (GKI)

- **Source Manifest Repository**: `https://github.com/GrapheneOS/kernel_manifest-6.18.git`
- **Branch**: `17`
- **Target Architectures**: `aarch64` (`arm64`), `x86_64`

#### Pipeline Workflow
1. **Workspace Initialization**:
   ```bash
   mkdir -p /mnt/extended/kernel/6.18
   cd /mnt/extended/kernel/6.18
   repo init -u https://github.com/GrapheneOS/kernel_manifest-6.18.git -b 17 --depth=1
   repo sync -c -j$(nproc)
   ```
2. **Build Generic Images & Modules**:
   - ARM64:
     ```bash
     ARCH=aarch64 common/build_generic.sh
     ```
   - x86_64:
     ```bash
     ARCH=x86_64 common/build_generic.sh
     ```
3. **Prebuilt Tree Integration**:
   Artifacts are deployed into the platform tree using the upstream update helper script:
   ```bash
   # Update ARM64 prebuilts
   ANDROID_BUILD_TOP=/mnt/extended/grapheneos-17 ARCH=arm64 common/update_generic_prebuilts.sh

   # Update x86_64 prebuilts
   ANDROID_BUILD_TOP=/mnt/extended/grapheneos-17 ARCH=x86_64 common/update_generic_prebuilts.sh
   ```
   **Destination paths in AOSP**:
   - `kernel/prebuilts/common-modules/virtual-device/6.18/arm64/`
   - `kernel/prebuilts/common-modules/virtual-device/6.18/x86-64/`
   - `device/google/cuttlefish_prebuilts/kernel/6.18/`

---

### 2.2 Microdroid 6.18 (pVM Micro-OS Kernel)

Microdroid is the lightweight Android guest operating system powering protected virtual machines (pVMs) via the Android Virtualization Framework (AVF).

- **Source Manifest Repository**: `https://github.com/GrapheneOS/kernel_manifest-6.18.git`
- **Branch**: `17`
- **Build Engine**: Google Kleaf / Bazel (`tools/bazel`)

#### Pipeline Workflow
1. **Compilation via Bazel**:
   - ARM64 Microdroid Distribution:
     ```bash
     tools/bazel run //common:kernel_aarch64_microdroid_dist --config=stamp -- --wipe_destdir --destdir=microdroid_dist_arm64
     ```
   - x86_64 Microdroid Distribution:
     ```bash
     tools/bazel run //common:kernel_x86_64_microdroid_dist --config=stamp -- --wipe_destdir --destdir=microdroid_dist_x86_64
     ```
2. **Prebuilt Tree Integration**:
   ```bash
   ANDROID_BUILD_TOP=/mnt/extended/grapheneos-17 ARCH=arm64 common/update_microdroid_prebuilts.sh
   ANDROID_BUILD_TOP=/mnt/extended/grapheneos-17 ARCH=x86_64 common/update_microdroid_prebuilts.sh
   ```
   **Destination path in AOSP**:
   - `packages/modules/Virtualization/microdroid/kernel/` (distributes `kernel`, `microdroid_kernel.img`, modules, and DTBOs for pVM init).

---

### 2.3 6th Through 9th Generation Pixel Kernels (Tensor G1–G4, 6.1 LTS)

Pixel 6 (`oriole`), 6 Pro (`raven`), 6a (`bluejay`), 7 (`panther`), 7 Pro (`cheetah`), 7a (`lynx`), Tablet (`tangorpro`), Fold (`felix`), 8 (`shiba`), 8 Pro (`husky`), 8a (`akita`), 9 (`tokay`), 9 Pro (`caiman`), 9 Pro XL (`komodo`), 9 Pro Fold (`comet`), and 10a (`stallion`).

- **GitLab Source Tree**: `https://gitlab.com/grapheneos/kernel_pixel_6.1.git`
- **Branches**:
  - `17-qpr2` (Tensor G1 through Tensor G4: GS101, GS201, Zuma, Zumapro)
  - `17-qpr2-stallion` (Tensor G4 variant for Pixel 10a `stallion`)
- **Build Engine**: Kleaf build scripts wrapping Bazel

#### Codename Mapping Table
| Commercial Name | Device Codename | Kernel Codename Target | Platform Prebuilt Directory |
|:---|:---|:---|:---|
| Pixel 6 | `oriole` | `raviole` | `device/google/raviole-kernels/6.1/grapheneos/` |
| Pixel 6 Pro | `raven` | `raviole` | `device/google/raviole-kernels/6.1/grapheneos/` |
| Pixel 6a | `bluejay` | `bluejay` | `device/google/bluejay-kernels/6.1/grapheneos/` |
| Pixel 7 | `panther` | `pantah` | `device/google/pantah-kernels/6.1/grapheneos/` |
| Pixel 7 Pro | `cheetah` | `pantah` | `device/google/pantah-kernels/6.1/grapheneos/` |
| Pixel 7a | `lynx` | `lynx` | `device/google/lynx-kernels/6.1/grapheneos/` |
| Pixel Tablet | `tangorpro` | `tangorpro` | `device/google/tangorpro-kernels/6.1/grapheneos/` |
| Pixel Fold | `felix` | `felix` | `device/google/felix-kernels/6.1/grapheneos/` |
| Pixel 8 | `shiba` | `shusky` | `device/google/shusky-kernels/6.1/grapheneos/` |
| Pixel 8 Pro | `husky` | `shusky` | `device/google/shusky-kernels/6.1/grapheneos/` |
| Pixel 8a | `akita` | `akita` | `device/google/akita-kernels/6.1/grapheneos/` |
| Pixel 9 | `tokay` | `caimito` | `device/google/caimito-kernels/6.1/grapheneos/` |
| Pixel 9 Pro | `caiman` | `caimito` | `device/google/caimito-kernels/6.1/grapheneos/` |
| Pixel 9 Pro XL | `komodo` | `caimito` | `device/google/caimito-kernels/6.1/grapheneos/` |
| Pixel 9 Pro Fold | `comet` | `comet` | `device/google/comet-kernels/6.1/grapheneos/` |
| Pixel 10a | `stallion` | `stallion` | `device/google/stallion-kernels/6.1/grapheneos/` |

#### Compilation Protocol
```bash
git clone https://gitlab.com/grapheneos/kernel_pixel_6.1.git -b 17-qpr2 --recurse-submodules /mnt/extended/kernel/pixel_6.1
cd /mnt/extended/kernel/pixel_6.1

# Execute Kleaf build target (e.g. caimito for Pixel 9 series)
KLEAF_REPO_MANIFEST=aosp_manifest.xml ./build_caimito.sh

# Deploy prebuilt outputs to GrapheneOS OS tree
mkdir -p /mnt/extended/grapheneos-17/device/google/caimito-kernels/6.1/grapheneos/
cp -a out/caimito/dist/* /mnt/extended/grapheneos-17/device/google/caimito-kernels/6.1/grapheneos/
```

---

### 2.4 10th Generation Pixel Kernels (Tensor G5, Laguna 6.18 LTS)

Pixel 10 (`frankel`), Pixel 10 Pro (`blazer`), Pixel 10 Pro XL (`mustang`), and Pixel 10 Pro Fold (`rango`).

- **GitHub Source Tree**: `https://github.com/GrapheneOS/kernel_pixel.git`
- **Branch**: `17-qpr2-muzel`
- **Kernel Base**: Linux 6.18 LTS GKI + Laguna SOC Driver Tree

#### Codename Mapping Table
| Commercial Name | Device Codename | Kernel Target Name | Platform Prebuilt Directory |
|:---|:---|:---|:---|
| Pixel 10 | `frankel` | `muzel` | `device/google/laguna-kernels/6.18/grapheneos/muzel` |
| Pixel 10 Pro | `blazer` | `muzel` | `device/google/laguna-kernels/6.18/grapheneos/muzel` |
| Pixel 10 Pro XL | `mustang` | `muzel` | `device/google/laguna-kernels/6.18/grapheneos/muzel` |
| Pixel 10 Pro Fold | `rango` | `rango` | `device/google/laguna-kernels/6.18/grapheneos/rango` |

#### Compilation Protocol
```bash
git clone https://github.com/GrapheneOS/kernel_pixel.git -b 17-qpr2-muzel /mnt/extended/kernel/pixel_6.18
cd /mnt/extended/kernel/pixel_6.18

# Sync dependent sub-trees
./sync.sh

# Execute Laguna Kleaf build target
./build_muzel.sh --repo_manifest="$(realpath .)":"$(realpath aosp_manifest.xml)"

# Deploy prebuilt outputs
mkdir -p /mnt/extended/grapheneos-17/device/google/laguna-kernels/6.18/grapheneos/muzel
cp -a out/muzel/dist/* /mnt/extended/grapheneos-17/device/google/laguna-kernels/6.18/grapheneos/muzel/
```

---

## 3. Vanadium & Synergy with Antimony (`yubi-OS/chromium-provenance`)

### 3.1 Vanadium Architecture & Build Pipeline

Vanadium is GrapheneOS's privacy- and security-hardened Chromium fork providing the default system WebView and standalone browser. It leverages GrapheneOS's memory allocator (`hardened_malloc`), enforces strict Control Flow Integrity (`is_cfi = true`), strips Google telemetry/sync dependencies, and isolates renderers in hardened seccomp/bpf sandboxes.

- **Upstream Repository**: `https://github.com/GrapheneOS/Vanadium`
- **Production Reference Tag**: `158.0.8127.42.0` (as of November 2026)
- **AOSP Target Locations**:
  - Browser & Configuration: `external/vanadium/prebuilt/arm64/`
  - System WebView Provider: `external/chromium-webview/` (or `external/vanadium`)

```
Vanadium Source Tree Structure:
Vanadium/
├── args.gn                 # Canonical GN build configuration
├── generate-release        # apksigner automation wrapper
├── patches/                # Downstream security/privacy patches
└── vanadium.keystore       # PKCS#12 RSA-4096 release signing key
```

#### Step-by-Step Build & Signing Protocol
1. **Keystore Generation (First Run / CI Secret Injection)**:
   ```bash
   keytool -genkey -v \
     -keystore /mnt/extended/keys/vanadium.keystore \
     -storetype pkcs12 \
     -alias vanadium \
     -keyalg RSA \
     -keysize 4096 \
     -sigalg SHA512withRSA \
     -validity 10000 \
     -dname "cn=GrapheneOS"
   ```
2. **Calculate Certificate SHA-256 Digest**:
   ```bash
   CERT_DIGEST=$(keytool -export-cert -alias vanadium -keystore /mnt/extended/keys/vanadium.keystore -storepass:env KEYSTORE_PASS | sha256sum | awk '{print $1}')
   ```
   *Note*: `config_apk_certdigest` must match this hash; otherwise Android's Package Manager rejects configuration updates from `VanadiumConfig`.
3. **Chromium Source Synchronization**:
   ```bash
   mkdir -p /mnt/extended/vanadium-build
   cd /mnt/extended/vanadium-build
   git clone https://github.com/GrapheneOS/Vanadium.git -b 158.0.8127.42.0
   cd Vanadium

   # Fetch Chromium codebase
   gclient config --unmanaged https://chromium.googlesource.com/chromium/src.git
   gclient sync --nohooks

   cd src
   git fetch --tags
   git checkout 158.0.8127.42

   # Apply GrapheneOS hardening patches
   git am --whitespace=nowarn --keep-non-patch ../patches/*.patch

   # Sync complete toolchain and dependencies
   gclient sync -D --with_branch_heads --with_tags --jobs $(nproc)
   ```
4. **Build Arguments Configuration (`out/Default/args.gn`)**:
   ```gn
   target_os = "android"
   target_cpu = "arm64"
   is_official_build = true
   is_debug = false
   is_component_build = false
   symbol_level = 0
   is_cfi = true
   use_siso = true
   proprietary_codecs = true
   ffmpeg_branding = "Chrome"

   # Package Names & Certificate Digest
   chrome_public_manifest_package = "app.vanadium.browser"
   system_webview_package_name = "app.vanadium.webview"
   trichrome_library_package = "app.vanadium.trichromelibrary"
   config_apk_package = "app.vanadium.config"
   config_apk_certdigest = "REPLACE_WITH_CALCULATED_CERT_DIGEST"
   ```
5. **Autoninja Compilation**:
   ```bash
   chrt -b 0 autoninja -C out/Default/ \
     vanadium_webview_apk \
     vanadium_browser_apk \
     vanadium_config_apk
   ```
6. **Signing & Release Bundling**:
   ```bash
   export KEYSTORE=/mnt/extended/keys/vanadium.keystore
   echo "$KEYSTORE_PASS" | ../generate-release out
   ```
   Generated artifacts in `out/Default/apks/release/`:
   - `TrichromeChrome.apk` (or `vanadium_browser.apk`)
   - `TrichromeWebView.apk` (or `vanadium_webview.apk`)
   - `TrichromeLibrary.apk`
   - `VanadiumConfig.apk`
7. **Platform Placement**:
   ```bash
   mkdir -p /mnt/extended/grapheneos-17/external/vanadium/prebuilt/arm64/
   cp out/Default/apks/release/*.apk /mnt/extended/grapheneos-17/external/vanadium/prebuilt/arm64/
   ```

---

### 3.2 Synergy with `yubi-OS/chromium-provenance` (Antimony)

Our team maintains `yubi-OS/chromium-provenance` (Antimony), an ARM64 Chromium build series implementing **ADR-000 fail-closed provenance gating** on the `ubuntu` HIGH-MEM runner (`/home/ubuntu/chromium-build/src`). 

```
                                  PROVENANCE GATING INTEGRATION MODES
                                  
      [ Strategy A: Unified Layering ]                 [ Strategy B: Dual WebView Provider ]
      
      Chromium 158 Base Tree                            Frameworks Base Res
               │                                                 │
        (git am patches/)                               (config_webview_packages.xml)
               │                                                 │
      ┌────────┴────────┐                               ┌────────┴────────┐
      ▼                 ▼                               ▼                 ▼
GrapheneOS         yubi-OS                      Vanadium WebView   Antimony WebView
Hardening          ADR-000 Provenance           (Standard Safe)    (High-Assurance Gated)
      │                 │                               │                 │
      └────────┬────────┘                               └────────┬────────┘
               ▼                                                 ▼
      Unified Antimony OS Browser                        User Selectable Engine
      (app.vanadium.browser)                             (Developer Options Switch)
```

There are two primary integration strategies for Antimony within GrapheneOS:

#### Strategy A: Layer Antimony Provenance Gating Directly onto Vanadium
- **Concept**: Treat ADR-000 provenance-gate patches (patches `0001` through `0019` in `yubi-OS/chromium-provenance`) as additional patches applied during step 3 of the Vanadium build pipeline.
- **Benefits**:
  - Retains all Vanadium hardening (CFI, hardened_malloc compatibility, network permission switches).
  - Embeds fail-closed verification of downloaded artifacts and origin provenance directly into the default browser and WebView.
  - Zero changes required to AOSP framework configuration.
- **Implementation**:
  ```bash
  # Inside Vanadium/src after applying ../patches/*.patch:
  git -c safe.directory=/home/ubuntu/chromium-build/src am /home/ubuntu/chromium-provenance/patches/*.patch
  ```

#### Strategy B: Whitelist Antimony as an Alternate WebView Provider
- **Concept**: Maintain Vanadium as the default WebView while introducing Antimony (`org.yubios.antimony.webview`) as a registered alternate WebView provider in AOSP frameworks.
- **AOSP Configuration File**: `frameworks/base/core/res/res/xml/config_webview_packages.xml`
- **XML Modification**:
  ```xml
  <webviewproviders>
      <!-- Default Vanadium WebView -->
      <webviewprovider
          availableByDefault="true"
          description="Vanadium WebView"
          packageName="app.vanadium.webview" />

      <!-- High-Assurance Antimony WebView with ADR-000 Provenance -->
      <webviewprovider
          availableByDefault="false"
          description="Antimony Provenance-Gated WebView"
          packageName="org.yubios.antimony.webview" />
  </webviewproviders>
  ```
- **Infrastructure Reuse**:
  - The `ubuntu` runner already holds `/home/ubuntu/chromium-build/src` with `gn-cipd`, ninja, clang, sysroots, and target definitions for ARM64.
  - We can generate the standalone `org.yubios.antimony.webview` package directly on `/mnt/extended`, package it into `external/antimony/prebuilt/arm64/`, and give users the choice in Developer Options -> "WebView Implementation".

---

## 4. Standalone SDK & Prebuilt Apps

The official GrapheneOS apps are independent Gradle-based Android projects built using modern Android Gradle Plugin (AGP) and Java/Kotlin toolchains. They do not use the legacy AOSP SDK tree (`prebuilts/sdk`); instead, they depend on an isolated Standalone Android SDK bootstrap.

### 4.1 Standalone Android SDK Bootstrap on `/mnt/extended`

The official GrapheneOS build documentation requires a deterministic bootstrap of command-line tools:

```bash
#!/usr/bin/env bash
set -euo pipefail

export ANDROID_HOME="/mnt/extended/android/sdk"
BOOTSTRAP_DIR="$ANDROID_HOME/bootstrap"
mkdir -p "$BOOTSTRAP_DIR"
cd "$BOOTSTRAP_DIR"

# 1. Download official commandlinetools
curl -O https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip

# 2. Strict SHA-256 integrity verification
echo "2d2d50857e4eb553af5a6dc3ad507a17adf43d115264b1afc116f95c92e5e258  commandlinetools-linux-11076708_latest.zip" | sha256sum -c

# 3. Unpack and bootstrap latest cmdline-tools
unzip -q commandlinetools-linux-11076708_latest.zip
./cmdline-tools/bin/sdkmanager 'cmdline-tools;latest' --sdk_root="$ANDROID_HOME"

cd "$ANDROID_HOME"
rm -rf "$BOOTSTRAP_DIR"

# 4. Set PATH
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# 5. Accept licenses deterministically
yes | sdkmanager --licenses > /dev/null

# 6. Install required components
sdkmanager \
  "platform-tools" \
  "build-tools;36.0.0" \
  "platforms;android-36" \
  "platforms;android-37" \
  "ndk;29.0.14206865"
```

---

### 4.2 Standalone App Catalog & Build Matrix

All apps reside in dedicated GitHub repositories under `https://github.com/GrapheneOS/`:

| App Name | Source Repository | Language Stack | Build Mechanism | AOSP Prebuilt Destination |
|:---|:---|:---|:---|:---|
| **AppStore** | `GrapheneOS/AppStore` | Kotlin, Java | `./gradlew assembleRelease` | `packages/apps/AppStore/` |
| **Auditor** | `GrapheneOS/Auditor` | Kotlin, C++ | `./gradlew assembleRelease` | `packages/apps/Auditor/` |
| **Camera** | `GrapheneOS/Camera` | Kotlin, CameraX | `./gradlew assembleRelease` | `packages/apps/Camera/` |
| **PdfViewer** | `GrapheneOS/PdfViewer` | Kotlin, Compose, pdf.js | `./gradlew assembleRelease` | `packages/apps/PdfViewer/` |
| **AppCompatConfig** | `GrapheneOS/AppCompatConfig` | Kotlin, XML | `./gradlew assembleRelease` | `packages/apps/AppCompatConfig/` |
| **GmsCompatConfig** | `GrapheneOS/GmsCompatConfig` | Kotlin, Data | `./gradlew assembleRelease` | `packages/apps/GmsCompatConfig/` |
| **TalkBack** | `GrapheneOS/talkback` | Java, C++ | `./build.sh` | `packages/apps/TalkBack/` |

#### Key App Details
- **AppStore**: Client for the GrapheneOS secure app repository. Supports delta updates, Brotli compression, and TLS key pinning (pinned through October 2027). Target API: 37.
- **Auditor**: Hardware-backed attestation and intrusion detection using the device HSM/Secure Element. Interrogates Android Keystore attestation certificates and verifies verified boot status, OS version, and lock state.
- **Camera**: Custom privacy-focused camera replacing AOSP camera. Uses AndroidX CameraX, strips EXIF metadata on demand, removes network access permissions.
- **PdfViewer**: Fully sandboxed, zero-permission viewer. Uses `pdf.js` inside a restricted WebView with strict CSP, rendered in Jetpack Compose / Material 3.
- **AppCompatConfig**: Distributes per-package exploit mitigation switches (e.g., toggling hardened_malloc off for anti-tamper apps like Uber, suppressing native debugging popups).
- **GmsCompatConfig**: Houses the dynamic compatibility definitions, IPC hooks, and location/auth shims powering sandboxed Google Play.
- **TalkBack**: Cleaned fork of Android Accessibility TalkBack, repaired to build without Google Play dependencies. Built via `./build.sh` and signed with the OS releasekey.

---

### 4.3 Gradle Wrapper Integrity Verification & Determinism

GrapheneOS mandates pinning the Gradle distribution zip hash via `--gradle-distribution-sha256-sum`. In CI pipelines, we must enforce this check before invoking `./gradlew` to defeat wrapper poisoning:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Gradle 8.10.2 Official SHA-256 Checksum
GRADLE_VERSION="8.10.2"
GRADLE_SHA256="31c55713e40233a8303827ceb42ca48a47267a0ad4bab9177123121e71524c26"

# Verify wrapper distribution checksum declaration
grep -q "distributionSha256Sum=${GRADLE_SHA256}" gradle/wrapper/gradle-wrapper.properties || {
  echo "ERROR: gradle-wrapper.properties distributionSha256Sum mismatch or missing!"
  exit 1
}

# Clean reproducible build with system timestamps pinned
export SOURCE_DATE_EPOCH=1732000000
./gradlew clean assembleRelease --no-daemon --offline || ./gradlew clean assembleRelease --no-daemon
```

---

## 5. GitHub Actions CI Implementation for Stream 3 on `ubuntu`

The pipeline is implemented as a modular GitHub Actions workflow targeting the self-hosted `ubuntu` runner (`runs-on: [self-hosted, linux, X64, ubuntu]`), staging all scratch spaces on `/mnt/extended`.

```yaml
name: GrapheneOS Stream 3 Prebuilts
on:
  workflow_dispatch:
    inputs:
      component:
        description: 'Component to build'
        required: true
        type: choice
        options:
          - all
          - kernels-gki
          - kernels-pixel-6.1
          - kernels-pixel-6.18
          - vanadium
          - standalone-apps

jobs:
  build-kernels:
    if: inputs.component == 'all' || startsWith(inputs.component, 'kernels-')
    runs-on: [self-hosted, linux, X64, ubuntu]
    steps:
      - name: Check Workspace Disk Space
        run: |
          df -h /mnt/extended
          mkdir -p /mnt/extended/ci-kernels

      - name: Build GKI & Microdroid 6.18
        if: inputs.component == 'all' || inputs.component == 'kernels-gki'
        run: |
          cd /mnt/extended/ci-kernels
          mkdir -p gki-6.18 && cd gki-6.18
          repo init -u https://github.com/GrapheneOS/kernel_manifest-6.18.git -b 17 --depth=1
          repo sync -c -j$(nproc)
          
          # Build GKI
          ARCH=aarch64 common/build_generic.sh
          ARCH=x86_64 common/build_generic.sh
          
          # Build Microdroid via Bazel
          tools/bazel run //common:kernel_aarch64_microdroid_dist --config=stamp -- --wipe_destdir --destdir=dist_microdroid_arm64
          tools/bazel run //common:kernel_x86_64_microdroid_dist --config=stamp -- --wipe_destdir --destdir=dist_microdroid_x86_64

  build-vanadium:
    if: inputs.component == 'all' || inputs.component == 'vanadium'
    runs-on: [self-hosted, linux, X64, ubuntu]
    steps:
      - name: Setup Vanadium & Chromium
        run: |
          mkdir -p /mnt/extended/vanadium
          cd /mnt/extended/vanadium
          # Integration with /home/ubuntu/chromium-build tools
          export PATH="/home/ubuntu/chromium-build/gn-cipd:$PATH"
          echo "Building Vanadium 158.0.8127.42.0 on /mnt/extended"

  build-apps:
    if: inputs.component == 'all' || inputs.component == 'standalone-apps'
    runs-on: [self-hosted, linux, X64, ubuntu]
    steps:
      - name: Setup Standalone Android SDK
        run: |
          export ANDROID_HOME="/mnt/extended/android/sdk"
          mkdir -p "$ANDROID_HOME"
          # Bootstrap commandlinetools-linux-11076708_latest.zip

      - name: Build Auditor & AppStore
        run: |
          echo "Building standalone APKs with pinned Gradle wrappers"
```

---

## 6. Verification Checklist & Concrete Next Steps

1. **Kernel Manifest Alignment**: Confirm that `GrapheneOS/kernel_manifest-6.18` branch `17` is used for generic GKI & Microdroid, while Tensor devices use `kernel_pixel_6.1` (`17-qpr2`) and `kernel_pixel` (`17-qpr2-muzel`).
2. **Vanadium Signing Keys**: Secure the PKCS#12 RSA-4096 key (`vanadium.keystore`) on the runner under `/mnt/extended/keys/` and inject `config_apk_certdigest` into `args.gn`.
3. **Antimony Overlay Staging**: Test Strategy A by applying `yubi-OS/chromium-provenance` patches directly to Chromium 158 tag within Vanadium to yield a unified fail-closed browser.
4. **Standalone SDK Cache**: Seed `/mnt/extended/android/sdk` with Build-Tools 36.0.0 and NDK 29.0.14206865 once so standalone app builds run entirely offline without recurring Google downloads.


---

# Stream 4 Deep-Research Report: Release Signing Keys, AVB Verified Boot, OTA Update Server, Reproducibility & yubi-OS U2F/HSM Root-of-Trust Integration

**Target System:** GrapheneOS (`https://grapheneos.org/build`) on `yubi-OS/grapheneOS`  
**Execution Environment:** Self-hosted `ubuntu` CI runner (`/mnt/extended`)  
**Core Identity Contract:** yubiOS Root-of-Trust ("The U2F/HSM is the sole, un-exportable root of trust")  
**Date:** November 19, 2026  

---

## Executive Summary

Stream 4 establishes the cryptographic and distribution boundary for `yubi-OS/grapheneOS`. While AOSP and standard upstream GrapheneOS builds produce unsigned or testkey-signed images during the initial `m target-files-package` compilation pass, a production operating system depends fundamentally on:
1. An uncompromised, authenticated cryptographic signing hierarchy spanning Android Verified Boot 2.0 (AVB), APK/APEX certificates, and factory image archives.
2. An isolated, zero-footprint memory environment during key unsealing (`tmpfs` / `/dev/shm`, disabled swap) to prevent persistent disk leakage.
3. Strict decoupling from official upstream infrastructure (`packages/apps/Updater` configuration and certificate pinning override) to avert destructive client-side infinite verification loops.
4. Deterministic, bit-for-bit reproducibility anchored by timestamp and incremental version pinning, verified via `diffoscope` and attested via SLSA / Sigstore / cosign.
5. Direct integration with yubiOS's primary architectural thesis: anchoring release signing and attestation directly to hardware security tokens (U2F/HSM PIV and FIDO2/WebAuthn), bridging GrapheneOS's remote hardware attestation (`Auditor`) into the yubiOS ecosystem.

---

## 1. Complete GrapheneOS Signing Key Hierarchy (`keys/<device>/`)

GrapheneOS release signing operates strictly downstream of the OS compile step. Upstream builds target files using the default AOSP public test keys (`build/make/target/product/security/`). Before deployment, `script/generate-release.sh` ingests `keys/<device>/` to resign all components.

```
keys/<device>/
├── releasekey.{x509.pem,pk8}      # Root OS release key (default APKs, APEX container payloads)
├── platform.{x509.pem,pk8}        # Core system apps (SystemUI, Settings, core services)
├── shared.{x509.pem,pk8}          # Shared user ID UID group apps (Contacts, Media Provider)
├── media.{x509.pem,pk8}           # Media/gallery processes, download manager
├── networkstack.{x509.pem,pk8}    # Modular network stack components, CaptivePortalLogin
├── bluetooth.{x509.pem,pk8}       # Bluetooth stack / Bluetooth.apk
├── sdk_sandbox.{x509.pem,pk8}     # Android 14+ Privacy Sandbox process isolation
├── gmscompat_lib.{x509.pem,pk8}   # GrapheneOS Sandboxed Google Play compatibility layer
├── nfc.{x509.pem,pk8}             # Near Field Communication stack / Secure Element service
├── avb.pem                        # 4096-bit RSA PKCS#8 private key for AVB 2.0 (vbmeta)
├── avb_pkmd.bin                   # AVB Public Key Metadata (pre-extracted for bootloader)
└── id_ed25519{,.pub}              # OpenSSH Ed25519 key for factory image archive signatures
```

### 1.1 The 9 APK/APEX Key Pairs

Generated using `development/tools/make_key <name> "/CN=GrapheneOS/"`:
- **`releasekey`**: Signs fallback system packages, recovery image, and outer APEX container packages (`com.android.*.apex`). Also signs payload contents for APEX components where independent upstream signing is not utilized.
- **`platform`**: Signs applications running with system UID (`android:sharedUserId="android.uid.system"`). Grants access to privileged system APIs, SELinux `platform_app` context, and platform permission whitelist.
- **`shared`**: Signs applications sharing data/processes within `android.uid.shared` (e.g., Contacts, Home, UserDictionary).
- **`media`**: Signs packages in `android.uid.media` subsystem (e.g., MediaProvider, DownloadManager, external storage providers).
- **`networkstack`**: Signs `NetworkStack.apk`, `NetworkStackNext.apk`, and captive portal components. Crucial for permission `android.permission.MAINLINE_NETWORK_STACK`.
- **`bluetooth`**: Signs `Bluetooth.apk` and Bluetooth framework packages (`android.uid.bluetooth`).
- **`sdk_sandbox`**: Introduced in Android 14+ for Privacy Sandbox isolation. Enforces strict process isolation for third-party advertising/tracking SDKs outside application processes.
- **`gmscompat_lib`**: Unique to GrapheneOS. Signs the compatibility shim that enables unmodified Google Play Services to execute strictly unprivileged within standard sandboxed user storage.
- **`nfc`**: Signs NFC services (`com.android.nfc`) and card emulation / secure element applets.

**At-Rest Encryption:**
`development/tools/make_key` and GrapheneOS's `script/encrypt-keys` enforce PKCS#8 DER formatting with:
- Key Derivation: `scrypt` (memory-hard, resistant to FPGA/ASIC cracking).
- Cipher: AES-256-CBC (`openssl pkcs8 -topk8 -outform DER -scrypt`).
- Passphrase uniformity: All 9 APK keys and `avb.pem` must share the exact same passphrase for headless unsealing by `script/decrypt-keys`.

### 1.2 Android Verified Boot 2.0 (AVB) Key Architecture

- **`avb.pem`**: 4096-bit RSA private key in PKCS#8 format. Upstream AVB enforces `SHA256_RSA4096` algorithm across modern Google Tensor Pixels (Tensor G1 through Tensor G4+):
  ```bash
  openssl genrsa 4096 | openssl pkcs8 -topk8 -scrypt -out avb.pem
  ```
- **`avb_pkmd.bin` (Public Key Metadata)**:
  Extracted directly via the AOSP AVB tool:
  ```bash
  external/avb/avbtool.py extract_public_key --key avb.pem --output avb_pkmd.bin
  ```
  `avb_pkmd.bin` is binary metadata structured by `AvbRSAPublicKeyHeader` containing the RSA modulus $N$, public exponent $e$, and pre-computed Montgomery arithmetic parameters ($R^2 \bmod N$, $-N^{-1} \bmod 2^{64}$).
- **Root-of-Trust Handshake on Device**:
  Flashing this key to the device sets the user-custom root of trust:
  ```bash
  fastboot flash avb_custom_key avb_pkmd.bin
  ```
  Upon `fastboot flashing lock`, Google Tensor Titan M2 / bootloader firmware computes $\text{SHA-256}(\text{avb\_pkmd.bin})$. The resulting 32-byte hash (64 hex characters) is burned into hardware tamper-evident non-volatile storage as the device's custom `verifiedBootKey`.

### 1.3 Factory Image OpenSSH Signing Key (`id_ed25519`)

GrapheneOS factory images are signed using OpenSSH Ed25519 signatures:
```bash
ssh-keygen -t ed25519 -f keys/<device>/id_ed25519
```
During release finalization (`script/generate-release.sh`), the script runs:
```bash
ssh-keygen -Y sign -n "factory images" -f "$KEY_DIR/id_ed25519" $DEVICE-install-$BUILD_NUMBER.zip
```
This produces `$DEVICE-install-$BUILD_NUMBER.zip.sig`. When flashing via GrapheneOS's WebUSB installer or CLI tools, the signature is verified against the published public key (`id_ed25519.pub`), authenticating the factory archive prior to unpack and flash.

### 1.4 Memory Hygiene & Anti-Exfiltration Guarantees in CI

On the `ubuntu` CI runner (`/mnt/extended`), handling decrypted private key material poses persistent storage leakage risks:
1. **`tmpfs` Execution Boundary**:
   `script/decrypt-keys` and `script/generate-release.sh` mandate unsealing into RAM backed by `/dev/shm` (or dedicated `tmpfs`):
   ```bash
   KEY_DIR=$(mktemp -d /dev/shm/generate-release.XXXXXXXXXX)
   trap "rm -rf \"$KEY_DIR\" && rm -f \"$PWD/$RELEASE_OUT/keys\"" EXIT
   cp "$PERSISTENT_KEY_DIR"/* "$KEY_DIR"
   script/decrypt-keys "$KEY_DIR"
   ```
   Unencrypted keys (`.pk8`, `avb.pem`) exist exclusively inside volatile memory and are purged on script exit.
2. **Mandatory Swap Disabling (`swapoff -a`)**:
   If the host runner triggers swapping under high memory pressure (e.g., during parallel image compression or Java heap spikes during `sign_target_files_apks`), pages from `/dev/shm` can be paged out to disk partitions or swap files on `/mnt/extended`.
   - **Enforcement Rule:** CI release jobs must invoke `sudo swapoff -a` prior to `decrypt-keys` and verify swap status via `/proc/swaps`. If swapping is strictly necessary, an ephemeral dm-crypt swap (`cryptsetup open --type plain --key-file /dev/urandom ...`) must be configured so memory pages are cryptographically discarded upon reboot.

---

## 2. Release Packaging, Delta Updates & Mandatory Updater URL Override

### 2.1 The Updater URL Hazard & `config.xml` Override

In AOSP/GrapheneOS, `packages/apps/Updater` handles background system updates. The client polls the update server, parses version metadata, checks delta update availability, downloads payloads, streams them into `system_update_engine` (A/B dynamic partitioning), and verifies update signatures against the installed OS keys.

**The Loop/DoS Vulnerability:**
In `platform_packages_apps_Updater`, the default configuration points to upstream:
```xml
<!-- packages/apps/Updater/res/values/config.xml -->
<resources>
    <string name="url" translatable="false">https://releases.grapheneos.org/</string>
    <string name="channel_default" translatable="false">stable</string>
</resources>
```
If an operator builds GrapheneOS with `OFFICIAL_BUILD=true` (which compiles and bundles the Updater app) without overriding `config.xml`:
1. The custom device boots with private keys $K_{\text{custom}}$.
2. The Updater polls `https://releases.grapheneos.org/`.
3. Upstream serves an official metadata file signed with $K_{\text{official}}$.
4. The Updater downloads the official OTA payload.
5. `update_engine` attempts verification against the local recovery/OS certificates ($K_{\text{custom}}$).
6. **Verification fails:** Signature mismatch.
7. The Updater discards the downloaded update as corrupt and immediately triggers another poll/download attempt.
8. **Result:** An aggressive, infinite download loop that burns device bandwidth/battery and performs an inadvertent Distributed Denial of Service (DDoS) against GrapheneOS's release CDN.

**Mandatory Override Specification:**
In `yubi-OS/grapheneOS`, an overlay or sed replace is strictly enforced before build:
```xml
<!-- packages/apps/Updater/res/values/config.xml override -->
<resources>
    <string name="url" translatable="false">https://ota.yubios.org/</string>
    <string name="channel_default" translatable="false">stable</string>
    <string name="network_type_default" translatable="false">1</string>
    <string name="battery_not_low_default" translatable="false">true</string>
    <string name="requires_charging_default" translatable="false">false</string>
    <string name="idle_reboot_default" translatable="false">false</string>
</resources>
```
Additionally, `res/xml/network_security_config.xml` contains HPKP/pin-set rules for Let's Encrypt / ISRG Root certs. When re-pointing to `ota.yubios.org`, the certificate pin-set must either be updated with the domain's CA root or adjusted to accept the system trust store.

### 2.2 Release Packaging Pipeline

The release pipeline executes sequentially after build:
```bash
# 1. Compile build host packaging tools
m otatools-package

# 2. Stage target files into releases/ directory
script/finalize.sh
# Copies:
#   $OUT/obj/PACKAGING/target_files_intermediates/$TARGET_PRODUCT-target_files.zip
#   $ANDROID_HOST_OUT/obj/ETC/otatools-packagelinux_glibc_x86_64_intermediates/otatools-package*

# 3. Generate signed factory images, full OTA, and metadata
script/generate-release.sh <device> <BUILD_NUMBER>

# 4. Generate delta updates (for incremental upgrades)
script/generate-delta.sh <device> <OLD_BUILD_NUMBER> <NEW_BUILD_NUMBER>
```

**Inside `script/generate-release.sh`:**
1. Unpacks `releases/$BUILD_NUMBER/$DEVICE-otatools.zip` into `$RELEASE_OUT`.
2. Decrypts keys into `/dev/shm` and binds `$RELEASE_OUT/keys`.
3. Invokes `sign_target_files_apks`:
   - Re-signs every APK with its dedicated key (`platform`, `media`, `shared`, etc.).
   - Re-signs APEX containers and payloads with `avb.pem` and `releasekey`.
   - Re-signs `vbmeta.img`, `boot.img`, `vendor_boot.img`, and dynamic partitions (`system`, `system_ext`, `product`, `vendor`) with `avb.pem` (`--avb_vbmeta_algorithm SHA256_RSA4096`).
4. Invokes `ota_from_target_files -k keys/releasekey` to produce `$DEVICE-ota_update-$BUILD_NUMBER.zip`.
5. Invokes `script/generate-metadata` on the update zip:
   - Reads `META-INF/com/android/metadata`.
   - Parses `post-build`, `post-timestamp`, `pre-device`.
   - Writes channel files: `$DEVICE-testing`, `$DEVICE-beta`, `$DEVICE-stable`, `$DEVICE-alpha`.
   - Line format: `<incremental_version> <timestamp> <device> <channel>`.
6. Invokes `img_from_target_files` and `fastboot optimize-factory-image` to generate fastboot-flashable `$DEVICE-factory-$BUILD_NUMBER.zip`.
7. Signs factory zip with `id_ed25519`.

### 2.3 Incremental Delta Updates (`generate-delta.sh`)

Delta updates dramatically reduce bandwidth (e.g., from a 2.5 GB full image to 50–150 MB).
```bash
ota_from_target_files -k "$KEY_DIR/releasekey" \
    -i releases/$OLD/release-$DEVICE-$OLD/$DEVICE-target_files.zip \
    releases/$NEW/release-$DEVICE-$NEW/$DEVICE-target_files.zip \
    $DEVICE-incremental-$OLD-$NEW.zip
```
The resulting delta file is named `<device>-incremental-<old_build>-<new_build>.zip`. When the Updater app checks for updates, it inspects its current local `ro.build.version.incremental`. If an incremental package matching `<current>-<target>` exists at the update endpoint, it downloads the incremental file rather than the full OTA update.

### 2.4 Static Update Server Architecture on Cloudflare / Steady Orbit Infra

GrapheneOS's update protocol requires only a static HTTP web server. There is no dynamic backend API.

**Directory Structure at Static Web Root (`https://ota.yubios.org/`):**
```
/
├── tegu-testing
├── tegu-beta
├── tegu-stable
├── tegu-ota_update-2026111900.zip
├── tegu-factory-2026111900.zip
├── tegu-factory-2026111900.zip.sig
├── tegu-incremental-2026111000-2026111900.zip
└── ...
```

**Cloudflare Worker + R2 Architecture:**
- **Storage:** Cloudflare R2 bucket (`yubios-graphene-releases`) stores the multi-gigabyte factory zips and OTA update packages.
- **Worker Router (`ota-worker.ts`):**
  - Serves channel files (`/<device>-stable`, etc.) directly from R2 or Cloudflare KV with zero-latency edge caching (`Cache-Control: public, max-age=300`).
  - Supports HTTP Range requests (`bytes=...`) natively via R2 streaming bindings, essential for resumable A/B OTA downloads in Android `update_engine`.
  - Enforces strict security headers: TLS 1.3 only, HSTS, `Content-Type: application/octet-stream`.

---

## 3. Reproducible Builds & Attestation

### 3.1 Deterministic Source Pinning

AOSP build artifacts embed build time and incremental versioning into system properties (`build.prop`), file modification timestamps, and zip file headers. To reproduce a build bit-for-bit:
```bash
# Extracted from prior build records:
export BUILD_DATETIME=$(cat out/build_date.txt)
export BUILD_NUMBER=$(cat out/build_number.txt)
```
These properties correspond to:
- `ro.build.date.utc`: Epoch seconds integer.
- `ro.build.version.incremental`: Date-based build sequence number (e.g. `2026111900`).

When both variables are set in the environment, the AOSP build system overrides `date`-based generation and enforces fixed timestamps across all compiled filesystem images and packaging routines (`SOURCE_DATE_EPOCH` compliance).

### 3.2 Unsigned vs. Signed Artifact Comparison (`diffoscope`)

Signing modifies:
- APK/APEX signature blocks (v1/v2/v3 APK Signature Schemes).
- AVB hash/hashtree footers and `vbmeta` cryptographic descriptors.
- Filesystem superblock UUIDs and dm-verity Merkle trees.

**Verification Methodology:**
1. **Unsigned Target Files Comparison:** Two independent builders compile from the same git commit and manifests with pinned `BUILD_DATETIME` and `BUILD_NUMBER`. Running `diffoscope target_files_1.zip target_files_2.zip` yields zero binary diffs across all `.img` files, `.jar` files, and binaries before signing.
2. **Signed Release Comparison:** If comparing against a release signed with private keys held elsewhere, exact binary matching is impossible. Verification is achieved by:
   - Stripping APK signature blocks using `apksigner verify --print-certs` and comparing unpacked contents.
   - Using `avbtool verify_image` to check partition hash trees against the root descriptor.
   - Auditing differences strictly to signature payload segments via automated AST/binary diffing.

### 3.3 SLSA Level 3 Provenance & Sigstore / Cosign Attestation

Following yubiOS's `slsa-provenance` and `sigstore-rekor-v2` skills:
1. **In-Toto Attestation Generation:**
   During CI finalization on `ubuntu`, a SLSA v1.0 predicate is generated:
   ```json
   {
     "_type": "https://in-toto.io/Statement/v1",
     "subject": [
       { "name": "tegu-ota_update-2026111900.zip", "digest": { "sha256": "..." } },
       { "name": "tegu-factory-2026111900.zip", "digest": { "sha256": "..." } }
     ],
     "predicateType": "https://slsa.dev/provenance/v1",
     "predicate": {
       "buildDefinition": {
         "buildType": "https://github.com/yubi-OS/grapheneOS/actions/build@v1",
         "externalParameters": { "manifest": "yubi-OS/grapheneOS@...", "device": "tegu" },
         "resolvedDependencies": [ ... ]
       },
       "runDetails": {
         "builder": { "id": "https://github.com/yubi-OS/grapheneOS/runners/ubuntu" }
       }
     }
   }
   ```
2. **Signing & Transparency Log Rekor Anchor:**
   - The provenance statement is signed using Cosign via the runner's OIDC token or a U2F/HSM PIV key.
   - The signed bundle is submitted to Sigstore / Rekor v2 tiles to prove timestamp, runner identity, and immutability.

---

## 4. yubi-OS Architectural Bridge: U2F/HSM Root of Trust for GrapheneOS

The defining mandate of yubiOS is: **"The U2F/HSM is the sole, un-exportable root of trust."** Integrating GrapheneOS into this ecosystem replaces software-held private keys with hardware-enforced primitives across two domains: release signing and device attestation.

```
+-----------------------------------------------------------------------------------+
|                        yubi-OS Hardware Root of Trust                             |
+-----------------------------------------------------------------------------------+
             |                                                  |
  [Release Signing Plane]                             [Device Attestation Plane]
             |                                                  |
     +-------v--------+                                 +-------v--------+
     |   U2F/HSM 5    |                                 |   U2F/HSM 5    |
     |   PIV Applet   |                                 | FIDO2 WebAuthn |
     +-------+--------+                                 +-------+--------+
             |                                                  |
    OpenSC / PKCS#11                                     WebAuthn Assertion
             |                                                  |
  +----------v-----------------------+                 +--------v-------------------+
  | avbtool / apksigner Integration  |                 | GrapheneOS Auditor Server  |
  |  - avbtool --signing_helper      |                 |  - StrongBox / TEE quotes  |
  |  - apksigner PKCS11 provider     |                 |  - verifiedBootKey pinned  |
  |  OR                              |                 |  - U2F/HSM admin root      |
  | fido2-assert hmac-secret unseal  |                 +----------------------------+
  +----------------------------------+
```

### 4.1 Hardware-Backed Release Signing

Standard AOSP scripts expect private keys on the local filesystem. yubiOS provides two distinct operational paths:

#### Approach A: Direct PKCS#11 Hardware Signing (Slot 9c & Retired Slots)

In this pattern, the private keys are generated directly inside the U2F/HSM's Secure Element (or imported during a formal key ceremony) and flagged as un-exportable.
- **PIV Slot Assignment:**
  - `Slot 9c` (Digital Signature): Dedicated to the AVB Root Key (`avb.pem` RSA-4096 or RSA-2048).
  - `Slots 82–8a` (Retired Key Slots 1–9): Assigned to the 9 APK signing keys (`releasekey`, `platform`, `shared`, etc.).
- **AVB Tool Hardware Helper (`--signing_helper`):**
  `avbtool.py` natively supports delegating raw signature computations to an external binary:
  ```python
  p = subprocess.Popen([signing_helper, algorithm_name, self.key_path],
                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
  (pout, perr) = p.communicate(padding_and_hash)
  ```
  We implement a wrapper script `u2f-hsm-avb-signer.sh`:
  ```bash
  #!/usr/bin/env bash
  # u2f-hsm-avb-signer.sh: Signs AVB SHA256 digest using U2F/HSM PIV Slot 9c
  ALGORITHM="$1"
  KEY_HINT="$2"
  DATA_TO_SIGN=$(cat) # Reads padded hash from stdin

  # Execute raw signature over OpenSC PKCS#11 engine via pkcs11-tool
  pkcs11-tool --module /usr/lib/x86_64-linux-gnu/opensc-pkcs11.so \
              --login --pin "$U2F_HSM_PIN" \
              --sign --id 02 \
              --mechanism RSA-PKCS \
              --input-file <(echo -n "$DATA_TO_SIGN")
  ```
  Invoked during target files signing:
  ```bash
  sign_target_files_apks \
      --avb_vbmeta_key "$PUB_KEY_DIR/avb_pub.pem" \
      --avb_vbmeta_signing_helper /usr/local/bin/u2f-hsm-avb-signer.sh \
      ...
  ```
- **APK Signing via `apksigner` PKCS#11 Keystore:**
  `apksigner` natively supports SunPKCS11 provider configurations:
  ```bash
  # pkcs11_u2f_hsm.cfg
  name = U2F/HSM
  library = /usr/lib/x86_64-linux-gnu/opensc-pkcs11.so
  slotListIndex = 0
  ```
  Signing command:
  ```bash
  apksigner sign --provider-class sun.security.pkcs11.SunPKCS11 \
                 --provider-arg pkcs11_u2f_hsm.cfg \
                 --ks NONE \
                 --ks-type PKCS11 \
                 --ks-key-alias "Certificate for Digital Signature" \
                 target.apk
  ```

#### Approach B: U2F/HSM FIDO2 `hmac-secret` Passphrase Unsealing (Attended CI Release)

Because batch-signing dozens of APEXes and APKs through hardware token smart-card interfaces can incur USB transfer latency, yubiOS introduces the **FIDO2 HMAC-Secret Key-Wrapping Pattern** (matching yubiOS's LUKS2 and `systemd-homed` enrollment standard):
1. The 9 APK keys and `avb.pem` are encrypted with an ultra-high-entropy master passphrase ($S$).
2. $S$ is sealed using the U2F/HSM's FIDO2 `hmac-secret` extension (`fido2-assert -m`).
3. During attended release builds on the CI runner, the operator connects their U2F/HSM:
   ```bash
   # Derive unseal key from U2F/HSM physical presence + touch
   UNSEAL_KEY=$(fido2-assert -G -h -i "$SALT_FILE" "$CRED_ID" /dev/hidrawX)
   PASSPHRASE=$(openssl enc -d -aes-256-gcm -in sealed_passphrase.enc -K "$UNSEAL_KEY" ...)
   
   # Unseal keys directly into tmpfs
   password="$PASSPHRASE" script/decrypt-keys /dev/shm/signing_keys
   ```
4. Signing proceeds in volatile RAM at full NVMe/CPU speeds.
5. `/dev/shm` is scrubbed and unmounted immediately upon completion.
6. The private keys remain cryptographically inert at rest unless unlocked by physical touch on the U2F/HSM.

---

### 4.2 Hardware Attestation Verification via GrapheneOS `Auditor` & U2F/HSM

GrapheneOS features an industry-leading hardware-based attestation system composed of:
1. **Audited Device (Client):** Uses the Pixel's Titan M2 hardware security module / StrongBox Keymaster to generate an asymmetric key pair attested by Google's hardware root certificate.
2. **Auditor App / Server:** Verifies the attestation certificate chain, inspecting:
   - Bootloader state (`LOCKED`).
   - Verified boot status (`VERIFIED`).
   - Operating system patch level and build fingerprint.
   - **`verifiedBootKey`**: The SHA-256 fingerprint of the AVB public key (`avb_pkmd.bin`).

#### Anchoring Custom yubi-OS Releases in Auditor

In `app.attestation.auditor.AttestationProtocol`, the Auditor codebase hardcodes known fingerprints:
```java
// AttestationProtocol.java
private static final ImmutableMap<String, DeviceInfo> fingerprintsNonStock = ImmutableMap
    .<String, DeviceInfo>builder()
    // Upstream GrapheneOS Pixel 8 (Shiba)
    .put("08C860350A9600692D10C8512F7B8E80707757468E8FBFEEA2A870C0A83D6031",
         new DeviceInfo(R.string.device_pixel_8, 100, 100, false, R.string.os_graphene))
    ...
```
When `yubi-OS/grapheneOS` builds with custom AVB keys:
1. Calculate the custom AVB key fingerprint:
   ```bash
   sha256sum keys/<device>/avb_pkmd.bin | awk '{print toupper($1)}'
   # Example: E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855
   ```
2. Fork `platform_external_Auditor` and `AttestationServer`:
   - Add the custom SHA-256 fingerprint into `fingerprintsNonStock` mapped to `R.string.os_yubios`.
   - Update `app/src/main/res/values/strings.xml` to declare the OS identity.
3. Deploy a private Attestation Server instance on Steady Orbit / Cloudflare Workers:
   - When the enrolled device periodically attests its hardware state to the server, the server validates that the running operating system is cryptographically signed by the yubi-OS AVB key.
4. **U2F/HSM Admin Authorization:**
   - Management access to the Attestation Server dashboard (viewing device fleets, attestation status, and health telemetry) requires FIDO2 WebAuthn authentication using the operator's physical U2F/HSM.
   - If an attestation challenge fails (indicating an unauthorized OS flash, modified bootloader, or tampered system partition), the server triggers an automated revocation event, terminating device access to yubiOS internal services and Tailscale gateways.

---

## 5. Implementation Roadmap for Stream 4 on `yubi-OS/grapheneOS`

| Phase | Milestone | Deliverables / Actions |
|---|---|---|
| **Phase 4.1** | Key Hierarchy Generation | Run `make_key` and `openssl` for target device (`tegu`/`husky`); encrypt keys at rest via `scrypt` + AES-256; store encrypted keyrings in secure vault. |
| **Phase 4.2** | Updater App Customization | Patch `packages/apps/Updater`: change update URL to `https://ota.yubios.org/`; update `network_security_config.xml` domain pins. |
| **Phase 4.3** | Memory-Safe CI Pipeline | Configure self-hosted GitHub Actions workflow on `ubuntu`: allocate `tmpfs` under `/dev/shm`, execute `sudo swapoff -a`, run `finalize.sh` and `generate-release.sh`. |
| **Phase 4.4** | Edge OTA Server Deployment | Deploy Cloudflare Worker + R2 bucket; configure range requests, static channel pointers (`<device>-stable`), and Ed25519 signature serving. |
| **Phase 4.5** | Reproducibility & SLSA Gate | Implement `reproducible-check.sh`: verify bit-for-bit parity against pinned `BUILD_DATETIME` and `BUILD_NUMBER`; sign provenance with Cosign. |
| **Phase 4.6** | U2F/HSM Root-of-Trust Bridge | Implement `avbtool --signing_helper` OpenSC wrapper for PIV Slot 9c and FIDO2 `hmac-secret` attended unsealing; register `avb_pkmd.bin` fingerprint in custom `Auditor`. |

---

*Report authored for `yubi-OS/grapheneOS` by Sauna AI subagent.*  
*Source references: upstream GrapheneOS build guide, AOSP AVB 2.0 specification, GrapheneOS/script, GrapheneOS/Auditor, and Yubico PIV/FIDO2 technical specifications.*

