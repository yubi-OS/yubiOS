# GNOME Settings `System Trust` Panel & Fedora 45 RPM Build Pipeline (2026-11-19)

## 1. Objective & Visual Specification

yubiOS ships a GNOME-on-Wayland desktop on top of `quay.io/fedora/fedora-bootc:45` (currently shipping `gnome-control-center-0:51.1-1.fc45`). To make the hardware-to-owner verification chain legible directly inside GNOME Settings (`org.gnome.Settings`), this work introduces the native **System Trust** panel (`CcSystemTrustPanel`) matching the approved first-look wireframe in `yubi-OS/assets` (`OS first-looks/yubios-system-trust-concept-4k.png` and its `-dark` / `-light` variants at `09f209a48153c6cef4faae9b247146abce4c5441`):

| UI Surface | Wireframe Element | Implementation in `yubi-OS/gnome-control-center` (`yubios`) |
|---|---|---|
| **Sidebar Header** | `yubiOS` title with trust-tree emblem between Search and Menu buttons | `shell/cc-window.blp` (`[title]` box in sidebar `Adw.HeaderBar`) + `shell/yubios-header-mark.png` resource |
| **Sidebar Entry** | Shield-check icon + `System Trust` row directly below `Displays` and above `Sound` | `shell/cc-panel-list.c` (`panel_order[]` entry `"system-trust"` after `"display"`) + `panels/system-trust/icons/scalable/org.gnome.Settings-system-trust-symbolic.svg` |
| **Card 1: Firmware** | Circular `Owner orbit` emblem (`new_logo/yubios-owner-orbit-2048-dark.png`), `Firmware` title, status badge (`Verified` / `Setup Mode` / `Failed`) | `panels/system-trust/cc-system-trust-panel.blp` (`firmware_card`) + `assets/firmware-orbit.png` |
| **Card 2: Boot image** | Circular `Linked bloom` emblem (`new_logo/yubios-linked-bloom-2048-dark.png`), `Boot image` title, status badge (`Verified` / `Unmeasured`) | `panels/system-trust/cc-system-trust-panel.blp` (`boot_card`) + `assets/boot-bloom.png` |
| **Card 3: Owner key** | Circular `Trust tree` emblem (`new_logo/yubios-trust-tree-2048-dark.png`), `Owner key` title, status badge (`Verified` / `Not Enrolled`) | `panels/system-trust/cc-system-trust-panel.blp` (`owner_card`) + `assets/owner-tree.png` |
| **Trust Chain Connectors** | Vertical glowing gradient line (`magenta -> electric blue` and `electric blue -> cyan`) with terminal dots linking the three circular emblems | `GtkDrawingArea` overlay (`connector_canvas`) in `cc-system-trust-panel.c` using `gtk_widget_compute_bounds()` for DPI-independent alignment |
| **Details Pane** | Right-hand card titled `Details  >` that expands to show per-boundary evidence | `details_card` + `GtkRevealer` (`details_revealer`) in `cc-system-trust-panel.blp` |

---

## 2. Evidence-Bounded Runtime Contract (`/usr/lib/yubiOS/system-trust-status.sh`)

Per the standing rule in `yubi-OS/assets/OS first-looks/README.md` (*"Any production UI must remain evidence-bounded and must not claim verification states the running system cannot prove"*), neither `CcSystemTrustPanel` nor the CLI helper hardcodes `Verified`. Both evaluate live kernel and filesystem state:

1. **Firmware (`FIRMWARE_STATUS`, `FIRMWARE_CLASS`, `FIRMWARE_DETAIL`)**
   - Reads UEFI `SecureBoot-8be4df61-93ca-11d2-aa0d-00e098032b8c` (`byte[4] == 1`) and `SetupMode-8be4df61-93ca-11d2-aa0d-00e098032b8c` (`byte[4] == 0`).
   - Checks first-boot CHIPSEC status (`/run/yubiOS/chipsec-firstboot.status` or `/var/lib/yubiOS/chipsec-firstboot.status`): `RESULT=FAILED` forces `Failed` (`failed` class).
   - Notes TPM / OP-TEE fTPM device node presence (`/dev/tpmrm0` or `/dev/tpm0`).
   - Reports `Verified` **only** when `SecureBoot=1`, `SetupMode=0`, and `CHIPSEC != FAILED`.
2. **Boot image (`BOOT_IMAGE_STATUS`, `BOOT_IMAGE_CLASS`, `BOOT_IMAGE_DETAIL`)**
   - Inspects `/proc/cmdline` for an active `composefs=<digest>` parameter and checks `/sys/firmware/efi/efivars/StubPcrKernelImage-4a67b082-0a4c-41cf-b6c7-440b29bb8c4f` + `/run/ostree-booted`.
   - Reports `Verified` when booted from a composefs-pinned root or measured UKI + ostree deployment; otherwise reports `Unmeasured`.
3. **Owner key (`OWNER_KEY_STATUS`, `OWNER_KEY_CLASS`, `OWNER_KEY_DETAIL`)**
   - Checks `/var/lib/yubiOS/.enrolled` alongside PIV slot 9a certificate (`/var/lib/yubiOS/sb/db.crt`) and non-empty PAM U2F mappings (`/etc/yubico/u2f_keys`).
   - Reports `Verified` when enrollment completed and at least one cryptographic key binding (PIV slot 9a or PAM U2F) is present; reports `Partial` or `Not Enrolled` otherwise.

---

## 3. Fork & RPM Build Architecture (`yubi-OS/gnome-control-center`)

### 3.1 Fork Layout & Standardization (`docs/FORKS.md`)

- **Fork repository:** `yubi-OS/gnome-control-center` (forked from `GNOME/gnome-control-center`).
- **Default branch (`main`):** `579424e8e19c73548f91d66519413f9a9ca57c6a` (synced 1:1 with upstream `main`, `0 ahead, 0 behind`; all 464 unowned upstream branches purged).
- **Upstream release anchor (`51.1`):** `348dd99d9f3a51a39fe9c60c967a6aabaeb34813` (matches Fedora 45's `gnome-control-center-0:51.1-1.fc45`).
- **Integration branch (`yubios`):** `f25a4d7da0337679a0c79eebb947d4e572818158` (`+4` commits ahead of `main`, merging `51.1` so both `main` and `51.1` are ancestors for `fetch-released-tag-ref.yml` and `ci_fork-drift-detect.yml`).
- **Hermetic subprojects:** `subprojects/gvc` (`GNOME/libgnome-volume-control@d2442f455844e5292cb4a74ffc66ecc8d7595a9f`) and `subprojects/libgxdp` (`GNOME/libgxdp@df896e3412b749947bc6f62a91a1aac8e6b6d19b`) are vendored directly in the `yubios` tree so `rpmbuild` runs inside the container without external GitLab subproject clones.

### 3.2 Multi-Arch Fedora 45 RPM Build (`ci_fork_gnome-control-center.yml`)

1. Runs natively on `ubuntu-26.04` (`x86_64`) and `ubuntu-26.04-arm` (`aarch64`) runners — no QEMU emulation.
2. Launches the digest-pinned Fedora 45 bootc container (`quay.io/fedora/fedora-bootc@sha256:990ebc2678ff3dbca3f0143c8d5f1a150a2fb0c418888a3bdf218aea109fc1d2`), installs the exact `pkgconfig(...)` build dependencies declared in `packaging/gnome-control-center-yubios.spec`, and runs `bash packaging/build-rpm.sh`.
3. Produces:
   - `gnome-control-center-51.1-2.yubios.fc45.<arch>.rpm` (`x86_64` / `aarch64`)
   - `gnome-control-center-filesystem-51.1-2.yubios.fc45.noarch.rpm`
   Because `Release: 2.yubios.fc45` is strictly newer than stock Fedora 45's `51.1-1.fc45`, `rpm -Uvh --oldpackage --replacepkgs` upgrades the package in-place with full dependency satisfaction.
4. Verifies inside the Fedora 45 container before uploading artifacts:
   - `gnome-control-center --list | grep -q "system-trust"`
   - `/usr/share/applications/gnome-system-trust-panel.desktop` exists
   - `/usr/share/icons/hicolor/scalable/apps/org.gnome.Settings-system-trust-symbolic.svg` exists

### 3.3 `Containerfile` Pinning Path (Post-Release Step)

Once `ci_fork_gnome-control-center.yml` completes and publishes the release assets to `yubi-OS/gnome-control-center` (`v51.1-yubios.1`), their `SHA-256` and `SHA-512` digests are recorded in `PINNED.md` under **yubi-OS Release Binaries** and installed in `Containerfile` using the same dual-hash pattern as `antimony-stable`.
