#!/usr/bin/env bash
# usr/lib/yubiOS/uki/install-uki.sh — install-time placement of the
# pre-built signed UKI onto the ESP. Phase 2 deliverable for ADR-032
# kernel+rootfs split (refs/kernel-rootfs-split-2026-07-29.md).
#
# BOOTED ROLE
#   This script lives inside the bootc OCI image at
#   /usr/lib/yubiOS/uki/install-uki.sh. It is NOT a bootc install hook;
#   bootc 1.16.3 has no project-authored BLSConfig drop-in intake
#   (PR #2269 added the parser, not the intake mechanism). The script
#   is the documented next step once one of the following lands:
#     (a) bootc exposes /usr/lib/bootc/install/loader-entries/* as an
#         intake mirror of /usr/lib/bootc/install/secureboot-keys;
#     (b) a yubiOS first-boot systemd unit invokes it once;
#     (c) bootc's BLS writer is patched to read a project .conf before
#         generating its own.
#
# WHAT IT DOES (when invoked)
#   1. Reads the pre-built UKI from /usr/lib/yubiOS/uki/yubios.efi
#      (published alongside the bootc image as 0mniteck/yubios:uki-<sha>
#      and surfaced in the bootc image via a follow-up PR that wires the
#      yubios-uki artifact into /usr/lib/yubiOS/uki/ at build time).
#   2. Computes the SHA-512 fsverity root hash of the UKI.
#   3. Writes the UKI to the ESP at /EFI/Linux/bootc/bootc_composefs-<hex>.efi
#      (the bootc 1.16.3 hard-coded install path per
#      crates/lib/src/bootc_composefs/boot.rs BOOTC_UKI_DIR =
#      "EFI/Linux/bootc" + get_uki_name pattern).
#   4. Writes the BLSConfig fragment to
#      /loader/entries/bootc_yubios-<version>-<priority>.conf containing
#      `uki /EFI/Linux/bootc/bootc_composefs-<hex>.efi` (the v1.16.3 uki
#      key, not the legacy efi key -- bootc parser accepts both).
#
# NOT YET WIRED
#   This script exists as the Phase 2 deliverable so the install-time
#   wiring is documented and reviewable before the bootc-side patch
#   lands. Do not invoke from a first-boot unit until the UKI artifact
#   is actually present in the bootc image (i.e., once a follow-up PR
#   adds the `yubios-with-uki` bake target that injects
#   /usr/lib/yubiOS/uki/yubios.efi into the bootc OCI image).

set -euo pipefail

UKI_SRC="${UKI_SRC:-/usr/lib/yubiOS/uki/yubios.efi}"
ESP_MNT="${ESP_MNT:-/boot}"
OS_ID="${OS_ID:-yubios}"
# Read VERSION_ID from /usr/lib/os-release without sourcing the file (avoids
# SC1091 -- shellcheck cannot follow the . source to the deploy-time path that
# does not exist on the build runner, and sourcing would also pull every other
# os-release variable into the script scope unnecessarily).
VERSION="${VERSION:-$(awk -F'"' '/^VERSION_ID=/{print $2;exit}' /usr/lib/os-release 2>/dev/null)}"
VERSION="${VERSION:-0}"
PRIORITY="${PRIORITY:-1}"

if [ ! -r "${UKI_SRC}" ]; then
    echo "::uki-install:: UKI not found at ${UKI_SRC}; skipping Phase 2 install." >&2
    exit 0
fi

# Composefs digest (SHA-512 fsverity root hash of the UKI binary).
DIGEST="$(fsverity digest "${UKI_SRC}" 2>/dev/null | awk '{print $1}')"
if [ -z "${DIGEST}" ]; then
    echo "::uki-install:: fsverity not available; using sha512sum as bootc_composefs-<digest> placeholder." >&2
    DIGEST="$(sha512sum "${UKI_SRC}" | awk '{print $1}')"
fi

TARGET_DIR="${ESP_MNT}/EFI/Linux/bootc"
ENTRIES_DIR="${ESP_MNT}/loader/entries"
TARGET="${TARGET_DIR}/bootc_composefs-${DIGEST}.efi"
ENTRY="${ENTRIES_DIR}/bootc_${OS_ID//-/_}-${VERSION}-${PRIORITY}.conf"

install -d -m 0700 "${TARGET_DIR}" "${ENTRIES_DIR}"
install -m 0600 "${UKI_SRC}" "${TARGET}"

# BLSConfig fragment: uki key (v1.16.3), per PR bootc-dev/bootc#2269.
# The filename MUST match bootc's type1_entry_conf_file_name pattern
# (os_id hyphens -> underscores) so bootc's status/rollback logic
# recognizes the booted deployment.
{
    printf 'title %s %s (bootc, uki)\n' "${OS_ID}" "${VERSION}"
    printf 'version %s\n' "${VERSION}"
    printf 'uki /EFI/Linux/bootc/bootc_composefs-%s.efi\n' "${DIGEST}"
    printf 'sort-key bootc-%s-%s\n' "${OS_ID}" "${PRIORITY}"
} > "${ENTRY}"

echo "::uki-install:: wrote ${TARGET} and ${ENTRY}"
