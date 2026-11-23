#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# /usr/lib/yubiOS/uki/uki-sync-and-sign.sh (ADR-034, OMN-191)
#
# Unified on-device UKI assembly, U2F/HSM PIV slot 9a re-signing, local composefs
# OCI image repository commit (/var/lib/yubiOS/oci), and ESP + Type2 BLSConfig
# deployment for:
#   1. dnf / rpm kernel & initramfs updates (via 05-rpmostree.install,
#      95-yubios-uki-resign.install, and %transfiletriggerin),
#   2. rpm-ostree / bootc deployments (via yubiOS-uki-resign.path/.service), and
#   3. Initial yubiOS-enroll (enroll-sb.sh resign / all -> --from-signed-esp).

set -euo pipefail

# shellcheck source=usr/lib/yubiOS/lib.sh
source "${YUBIOS_LIB_SH:-/usr/lib/yubiOS/lib.sh}"
export PATH="$PATH:/usr/lib/systemd:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

REASON="manual"
KVER=""
KERNEL_IMAGE=""
FROM_SIGNED_ESP=0
ESP="${YUBIOS_ESP:-/efi}"
KEYDIR="${YUBIOS_SB_KEYDIR:-/var/lib/yubiOS/secureboot}"
ENROLLED_MARK="${YUBIOS_SB_ENROLLED_MARK:-/var/lib/yubiOS/.sb-enrolled}"
OCI_DIR="${YUBIOS_OCI_DIR:-/var/lib/yubiOS/oci}"
MODULES_DIR="${YUBIOS_MODULES_DIR:-/usr/lib/modules}"
OS_RELEASE="${YUBIOS_OS_RELEASE:-/usr/lib/os-release}"
SB_KEY_URI="${YUBIOS_SB_KEY_URI:-pkcs11:id=%01;type=private}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --reason) REASON="${2:-manual}"; shift 2 ;;
    --kver) KVER="${2:-}"; shift 2 ;;
    --kernel-image) KERNEL_IMAGE="${2:-}"; shift 2 ;;
    --from-signed-esp) FROM_SIGNED_ESP=1; shift ;;
    --esp) ESP="${2:-/efi}"; shift 2 ;;
    --keydir) KEYDIR="${2:-/var/lib/yubiOS/secureboot}"; shift 2 ;;
    --oci-dir) OCI_DIR="${2:-/var/lib/yubiOS/oci}"; shift 2 ;;
    -h|--help)
      echo "usage: uki-sync-and-sign.sh [--reason R] [--kver KVER] [--kernel-image PATH] [--from-signed-esp] [--esp DIR] [--keydir DIR] [--oci-dir DIR]"
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

for _esp_cand in "$ESP" /boot/efi /boot; do
  if [ -d "$_esp_cand/EFI" ]; then ESP="$_esp_cand"; break; fi
done

PKCS11_LIB="${YUBIOS_PKCS11_LIB:-}"
if [ -z "$PKCS11_LIB" ] || [ ! -e "$PKCS11_LIB" ]; then
  for c in /usr/lib64/libykcs11.so /usr/lib64/libykcs11.so.2 /usr/lib/libykcs11.so /usr/lib/aarch64-linux-gnu/libykcs11.so; do
    if [ -e "$c" ]; then PKCS11_LIB="$c"; break; fi
  done
fi
if [ -n "$PKCS11_LIB" ]; then
  export PKCS11_MODULE_PATH="$PKCS11_LIB"
  export PKCS11_PROVIDER_MODULE="$PKCS11_LIB"
fi

resolve_kver() {
  if [ -n "$KVER" ]; then
    printf '%s\n' "$KVER"
    return 0
  fi
  local latest="" d
  for d in "$MODULES_DIR"/*/; do
    [ -d "$d" ] || continue
    latest="$(basename "$d")"
  done
  if [ -n "$latest" ]; then
    printf '%s\n' "$latest"
    return 0
  fi
  uname -r
}

resolve_composefs_digest() {
  local uki_file="${1:-}"
  if [ -n "${YUBIOS_COMPOSEFS_DIGEST:-}" ]; then
    printf '%s\n' "$YUBIOS_COMPOSEFS_DIGEST"
    return 0
  fi
  if [ -n "$uki_file" ]; then
    local bname
    bname="$(basename "$uki_file")"
    case "$bname" in
      bootc_composefs-*.efi)
        printf '%s\n' "${bname#bootc_composefs-}" | sed 's/\.efi$//'
        return 0
        ;;
    esac
  fi
  if [ -r /proc/cmdline ]; then
    local cmd_cfs
    cmd_cfs="$(sed -nE 's/.*composefs\.digest=v[12]-sha(256|512)-[0-9]+:\??([0-9a-fA-F]+).*/\2/p' /proc/cmdline | head -n1 || true)"
    [ -z "$cmd_cfs" ] && cmd_cfs="$(sed -nE 's/.*composefs=\??([0-9a-fA-F]+).*/\1/p' /proc/cmdline | head -n1 || true)"
    if [ -n "$cmd_cfs" ]; then
      printf '%s\n' "$cmd_cfs"
      return 0
    fi
  fi
  if command -v bootc >/dev/null 2>&1 && [ -n "${YUBIOS_ROOTFS_FOR_DIGEST:-}" ] && [ -d "${YUBIOS_ROOTFS_FOR_DIGEST}" ]; then
    local bc_cfs
    bc_cfs="$(bootc container compute-composefs-digest "${YUBIOS_ROOTFS_FOR_DIGEST}" 2>/dev/null | sed 's/^v1-sha512-12://' | tr -d '[:space:]' || true)"
    if [ -n "$bc_cfs" ]; then
      printf '%s\n' "$bc_cfs"
      return 0
    fi
  fi
  local existing_bootc
  for existing_bootc in "$ESP"/EFI/Linux/bootc/bootc_composefs-*.efi; do
    if [ -f "$existing_bootc" ]; then
      basename "$existing_bootc" .efi | sed 's/^bootc_composefs-//'
      return 0
    fi
  done
  if [ -n "$uki_file" ] && [ -f "$uki_file" ]; then
    if command -v fsverity >/dev/null 2>&1; then
      local fsv
      fsv="$(fsverity digest "$uki_file" 2>/dev/null | awk '{print $1}' || true)"
      if [ -n "$fsv" ]; then
        printf '%s\n' "$fsv"
        return 0
      fi
    fi
    sha512sum "$uki_file" | awk '{print $1}'
    return 0
  fi
  printf '%s\n' "0000000000000000000000000000000000000000000000000000000000000000"
}

ensure_initramfs_same_fs() {
  local kver="$1"
  local mod_dir="$MODULES_DIR/$kver"
  [ -d "$mod_dir" ] || return 0
  local initrd="$mod_dir/initramfs.img"
  local vmlinuz="${KERNEL_IMAGE:-$mod_dir/vmlinuz}"
  if [ ! -s "$initrd" ] || { [ -f "$vmlinuz" ] && [ "$vmlinuz" -nt "$initrd" ]; }; then
    if command -v dracut >/dev/null 2>&1; then
      local tmp_initrd="$mod_dir/.initramfs.img.tmp.$$"
      yubiOS_log "Generating same-FS initramfs for $kver at $tmp_initrd (avoids cross-device EXDEV)"
      dracut --no-hostonly --force --kver "$kver" "$tmp_initrd"
      mv -f "$tmp_initrd" "$initrd"
    fi
  fi
}

collect_kargs() {
  local cfs_digest="$1"
  local kargs="composefs=${cfs_digest} root=dissect mount.usr=dissect rw fsck.repair=yes selinux=0 rd.driver.pre=tee,optee,tpm_ftpm_tee,rockchipdrm,dw_hdmi_qp,phy_rockchip_samsung_hdptx,analogix_dp ima_policy=tcb ima_hash=sha256 rd.luks=1 rd.luks.options=fido2-device=auto,fido2-with-client-pin=yes,fido2-with-user-presence=yes audit=0 splash quiet plymouth.ignore-serial-consoles no_console_suspend"
  printf '%s\n' "$kargs"
}

build_uki_for_kver() {
  local kver="$1"
  local cfs_digest="$2"
  local out_uki="$3"
  local mod_dir="$MODULES_DIR/$kver"
  local vmlinuz="${KERNEL_IMAGE:-$mod_dir/vmlinuz}"
  local initrd="$mod_dir/initramfs.img"

  ensure_initramfs_same_fs "$kver"

  local splash_bmp="${YUBIOS_SPLASH_BMP:-/usr/share/yubiOS/splash/yubios-owner-orbit.bmp}"
  if [ -n "${YUBIOS_ROOTFS_FOR_UKIFY:-}" ] && [ -d "${YUBIOS_ROOTFS_FOR_UKIFY}" ] && command -v bootc >/dev/null 2>&1; then
    local -a extra_ukify=()
    [ -f "$splash_bmp" ] && extra_ukify+=(--splash "$splash_bmp")
    if bootc container ukify --rootfs "${YUBIOS_ROOTFS_FOR_UKIFY}" -- "${extra_ukify[@]}" --output "$out_uki" 2>/dev/null; then
      return 0
    fi
  fi

  if command -v ukify >/dev/null 2>&1 && [ -f "$vmlinuz" ] && [ -f "$initrd" ]; then
    local kargs
    kargs="$(collect_kargs "$cfs_digest")"
    local -a ukify_args=(build --linux "$vmlinuz" --initrd "$initrd" --cmdline "$kargs" --uname "$kver" --output "$out_uki")
    [ -f "$OS_RELEASE" ] && ukify_args+=(--os-release "@$OS_RELEASE")
    [ -f "$splash_bmp" ] && ukify_args+=(--splash "$splash_bmp")
    ukify "${ukify_args[@]}"
    return 0
  fi

  # Fallback: copy existing ESP UKI so resign + local OCI commit can still proceed
  local cand
  for cand in "$ESP"/EFI/Linux/bootc/*.efi "$ESP"/EFI/Linux/*.efi; do
    if [ -f "$cand" ]; then
      cp -f "$cand" "$out_uki"
      return 0
    fi
  done
  yubiOS_log "Cannot build UKI for $kver: neither ukify+vmlinuz/initrd nor an existing ESP UKI was found"
  return 1
}

sign_and_verify_pe() {
  local pe_path="$1"
  local signer_tag="unsigned"
  if [ -f "$KEYDIR/db.crt" ]; then
    for tool in ykman systemd-sbsign sbverify; do
      command -v "$tool" >/dev/null 2>&1 || { yubiOS_log "missing signing tool: $tool" >&2; return 1; }
    done
    mkdir -p "$KEYDIR"
    if [ ! -f "$KEYDIR/slot9a-pub.pem" ]; then
      ykman piv keys export 9a "$KEYDIR/slot9a-pub.pem" >/dev/null 2>&1 || {
        yubiOS_log "No key in PIV slot 9a; cannot sign $pe_path" >&2
        return 1
      }
    fi
    local tmp_signed
    tmp_signed="$(mktemp "$KEYDIR/signed-uki-XXXXXX.efi")"
    yubiOS_log "Signing $(basename "$pe_path") with U2F/HSM PIV slot 9a db key ($SB_KEY_URI)" >&2
    systemd-sbsign sign \
      --private-key "$SB_KEY_URI" \
      --private-key-source "provider:pkcs11" \
      --certificate "$KEYDIR/db.crt" \
      --certificate-source file \
      --output "$tmp_signed" \
      "$pe_path"
    if ! sbverify --cert "$KEYDIR/db.crt" "$tmp_signed" >/dev/null; then
      rm -f "$tmp_signed"
      yubiOS_log "Signature verification against $KEYDIR/db.crt failed for $pe_path" >&2
      return 1
    fi
    mv -f "$tmp_signed" "$pe_path"
    signer_tag="piv-slot-9a"
  elif [ -f "$ENROLLED_MARK" ]; then
    yubiOS_log "System is marked enrolled ($ENROLLED_MARK) but $KEYDIR/db.crt is missing; refusing unsigned UKI update" >&2
    return 1
  else
    yubiOS_log "Setup mode (db.crt not enrolled yet); staging unsigned UKI in local OCI store" >&2
  fi
  printf '%s\n' "$signer_tag"
}

commit_to_local_oci_repo() {
  local signed_uki="$1"
  local kver="$2"
  local cfs_digest="$3"
  local signer_tag="$4"

  # If /var/home is a mounted persistent volume (lvm-yubios--root) and OCI_DIR is the default
  # /var/lib/yubiOS/oci path, mirror/store under /var/home/.yubios-oci when /var/lib is transient.
  mkdir -p "$OCI_DIR/blobs/sha256" "$OCI_DIR/composefs"
  printf '{"imageLayoutVersion":"1.0.0"}\n' > "$OCI_DIR/oci-layout"

  local cfs_uki="$OCI_DIR/composefs/bootc_composefs-${cfs_digest}.efi"
  cp -f "$signed_uki" "$cfs_uki"

  # Build a reproducible single-layer tar.gz matching the Containerfile uki/prefinal layout:
  #   boot/EFI/Linux/<kver>.efi
  #   boot/EFI/Linux/bootc/bootc_composefs-<cfs_digest>.efi
  #   usr/lib/yubiOS/uki/yubios.efi
  local stage_tree
  stage_tree="$(mktemp -d "$OCI_DIR/.stage-XXXXXX")"
  mkdir -p "$stage_tree/boot/EFI/Linux/bootc" "$stage_tree/usr/lib/yubiOS/uki"
  cp -f "$signed_uki" "$stage_tree/boot/EFI/Linux/${kver}.efi"
  cp -f "$signed_uki" "$stage_tree/boot/EFI/Linux/bootc/bootc_composefs-${cfs_digest}.efi"
  cp -f "$signed_uki" "$stage_tree/usr/lib/yubiOS/uki/yubios.efi"

  local epoch="${SOURCE_DATE_EPOCH:-1700000000}"
  find "$stage_tree" -exec touch -h -d "@${epoch}" {} + 2>/dev/null || true

  local layer_tar="$stage_tree/layer.tar"
  local layer_tgz="$stage_tree/layer.tar.gz"
  tar --sort=name --mtime="@${epoch}" --owner=0 --group=0 --numeric-owner -cf "$layer_tar" \
    -C "$stage_tree" boot usr 2>/dev/null || tar -cf "$layer_tar" -C "$stage_tree" boot usr
  gzip -n -c "$layer_tar" > "$layer_tgz"

  local diff_id layer_sha layer_size
  diff_id="$(sha256sum "$layer_tar" | awk '{print $1}')"
  layer_sha="$(sha256sum "$layer_tgz" | awk '{print $1}')"
  layer_size="$(wc -c < "$layer_tgz" | tr -d '[:space:]')"
  mv -f "$layer_tgz" "$OCI_DIR/blobs/sha256/$layer_sha"
  rm -rf "$stage_tree"

  local uki_sha256
  uki_sha256="$(sha256sum "$signed_uki" | awk '{print $1}')"
  local go_arch="arm64"
  case "$(uname -m)" in
    x86_64) go_arch="amd64" ;;
    aarch64|arm64) go_arch="arm64" ;;
  esac

  local cfg_file="$OCI_DIR/.config-tmp.json"
  cat > "$cfg_file" <<EOF_CFG
{"architecture":"${go_arch}","os":"linux","config":{"Cmd":["/sbin/init"],"Labels":{"containers.bootc":"1","ostree.bootable":"true","org.yubios.uki.kver":"${kver}","org.yubios.uki.composefs":"${cfs_digest}","org.yubios.uki.sha256":"${uki_sha256}","org.yubios.uki.signer":"${signer_tag}","org.yubios.uki.reason":"${REASON}"}},"rootfs":{"type":"layers","diff_ids":["sha256:${diff_id}"]},"history":[{"created":"2026-01-01T00:00:00Z","created_by":"yubiOS uki-sync-and-sign.sh (${REASON})"}]}
EOF_CFG
  local cfg_sha cfg_size
  cfg_sha="$(sha256sum "$cfg_file" | awk '{print $1}')"
  cfg_size="$(wc -c < "$cfg_file" | tr -d '[:space:]')"
  mv -f "$cfg_file" "$OCI_DIR/blobs/sha256/$cfg_sha"

  local manifest_file="$OCI_DIR/.manifest-tmp.json"
  cat > "$manifest_file" <<EOF_MAN
{"schemaVersion":2,"mediaType":"application/vnd.oci.image.manifest.v1+json","config":{"mediaType":"application/vnd.oci.image.config.v1+json","digest":"sha256:${cfg_sha}","size":${cfg_size}},"layers":[{"mediaType":"application/vnd.oci.image.layer.v1.tar+gzip","digest":"sha256:${layer_sha}","size":${layer_size}}],"annotations":{"containers.bootc":"1","ostree.bootable":"true","org.yubios.uki.kver":"${kver}","org.yubios.uki.composefs":"${cfs_digest}","org.yubios.uki.sha256":"${uki_sha256}","org.yubios.uki.signer":"${signer_tag}"}}
EOF_MAN
  local man_sha man_size
  man_sha="$(sha256sum "$manifest_file" | awk '{print $1}')"
  man_size="$(wc -c < "$manifest_file" | tr -d '[:space:]')"
  mv -f "$manifest_file" "$OCI_DIR/blobs/sha256/$man_sha"

  cat > "$OCI_DIR/index.json" <<EOF_IDX
{"schemaVersion":2,"mediaType":"application/vnd.oci.image.index.v1+json","manifests":[{"mediaType":"application/vnd.oci.image.manifest.v1+json","digest":"sha256:${man_sha}","size":${man_size},"platform":{"architecture":"${go_arch}","os":"linux"},"annotations":{"org.opencontainers.image.ref.name":"yubios-local:latest"}},{"mediaType":"application/vnd.oci.image.manifest.v1+json","digest":"sha256:${man_sha}","size":${man_size},"platform":{"architecture":"${go_arch}","os":"linux"},"annotations":{"org.opencontainers.image.ref.name":"yubios-local:${kver}"}},{"mediaType":"application/vnd.oci.image.manifest.v1+json","digest":"sha256:${man_sha}","size":${man_size},"platform":{"architecture":"${go_arch}","os":"linux"},"annotations":{"org.opencontainers.image.ref.name":"yubios-uki:${cfs_digest}"}}]}
EOF_IDX

  cat > "$OCI_DIR/last-deployed.json" <<EOF_LAST
{"transport":"oci:${OCI_DIR}:yubios-local:latest","manifest_digest":"sha256:${man_sha}","layer_digest":"sha256:${layer_sha}","composefs_digest":"${cfs_digest}","kver":"${kver}","uki_sha256":"${uki_sha256}","signer":"${signer_tag}","reason":"${REASON}"}
EOF_LAST

  yubiOS_log "Committed signed UKI to local composefs OCI repository: oci:${OCI_DIR}:yubios-local:latest (manifest sha256:${man_sha}, composefs=${cfs_digest})"
}

deploy_uki_to_esp_and_bls() {
  local signed_uki="$1"
  local kver="$2"
  local cfs_digest="$3"

  local os_id="yubios"
  local version="0"
  if [ -r "$OS_RELEASE" ]; then
    version="$(awk -F'"' '/^VERSION_ID=/{print $2;exit}' "$OS_RELEASE" 2>/dev/null || true)"
    [ -z "$version" ] && version="$(awk -F= '/^VERSION_ID=/{gsub(/"/,"",$2);print $2;exit}' "$OS_RELEASE" 2>/dev/null || true)"
  fi
  version="${version:-0}"

  mkdir -p "$ESP/EFI/Linux/bootc" "$ESP/loader/entries"
  local target_uki="$ESP/EFI/Linux/bootc/bootc_composefs-${cfs_digest}.efi"
  if [ "$signed_uki" != "$target_uki" ]; then
    cp -f "$signed_uki" "$target_uki"
  fi

  local entry_conf="$ESP/loader/entries/bootc_${os_id//-/_}-${version}-1.conf"
  cat > "$entry_conf" <<EOF_BLS
title ${os_id} ${version} (${kver}, bootc, uki)
version ${kver}
uki /EFI/Linux/bootc/bootc_composefs-${cfs_digest}.efi
sort-key bootc-${os_id}-1
EOF_BLS
  if [ -d /run/yubiOS/efi/loader/entries ] && [ "$ESP" != "/run/yubiOS/efi" ]; then
    cp -f "$entry_conf" "/run/yubiOS/efi/loader/entries/$(basename "$entry_conf")" 2>/dev/null || true
  fi
  if [ -f "$ESP/loader/entries/ostree-1.conf" ]; then
    sed -i "s|^uki .*|uki /EFI/Linux/bootc/bootc_composefs-${cfs_digest}.efi|" "$ESP/loader/entries/ostree-1.conf" 2>/dev/null || true
  fi

  if [ "${YUBIOS_BOOTC_SWITCH_LOCAL_OCI:-0}" = "1" ] && command -v bootc >/dev/null 2>&1; then
    bootc switch --transport oci "$OCI_DIR:yubios-local:latest" 2>/dev/null || true
  fi
  yubiOS_log "Deployed signed UKI to $target_uki and updated Type2 BLSConfig $entry_conf"
}

main() {
  local kver
  kver="$(resolve_kver)"

  if [ "$FROM_SIGNED_ESP" = "1" ]; then
    local found_uki="" f
    for f in "$ESP"/EFI/Linux/bootc/*.efi "$ESP"/EFI/Linux/*.efi; do
      if [ -f "$f" ]; then
        found_uki="$f"
        break
      fi
    done
    [ -n "$found_uki" ] || { yubiOS_log "No signed UKI found on $ESP to commit"; exit 1; }
    local cfs_digest
    cfs_digest="$(resolve_composefs_digest "$found_uki")"
    local signer_tag="unsigned"
    [ -f "$KEYDIR/db.crt" ] && signer_tag="piv-slot-9a"
    commit_to_local_oci_repo "$found_uki" "$kver" "$cfs_digest" "$signer_tag"
    deploy_uki_to_esp_and_bls "$found_uki" "$kver" "$cfs_digest"
    exit 0
  fi

  mkdir -p "$OCI_DIR"
  local staged_uki
  staged_uki="$(mktemp "$OCI_DIR/.uki-build-XXXXXX.efi")"
  local cfs_digest
  cfs_digest="$(resolve_composefs_digest "")"

  if ! build_uki_for_kver "$kver" "$cfs_digest" "$staged_uki"; then
    rm -f "$staged_uki"
    exit 1
  fi

  if [ "$cfs_digest" = "0000000000000000000000000000000000000000000000000000000000000000" ]; then
    cfs_digest="$(resolve_composefs_digest "$staged_uki")"
  fi

  local signer_tag
  if ! signer_tag="$(sign_and_verify_pe "$staged_uki" | tail -n1)"; then
    rm -f "$staged_uki"
    exit 1
  fi

  commit_to_local_oci_repo "$staged_uki" "$kver" "$cfs_digest" "$signer_tag"
  deploy_uki_to_esp_and_bls "$staged_uki" "$kver" "$cfs_digest"
  rm -f "$staged_uki"
}

main "$@"
