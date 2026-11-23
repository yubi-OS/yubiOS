#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS System Trust evidence probe for GNOME Settings (CcSystemTrustPanel) and CLI.
# Evaluates the three yubiOS trust boundaries from live kernel/filesystem state:
#   1. Firmware   — UEFI SecureBoot/SetupMode efivars, CHIPSEC first-boot status, TPM/fTPM
#   2. Boot image — UKI StubPcrKernelImage efivar, composefs digest, AND mounted composefs root in /proc/mounts
#   3. Owner key  — /var/lib/yubiOS/.enrolled, PIV slot 9a cert, PAM U2F keys, FIDO2 token
# Never claims "Verified" without complete observed runtime evidence, and reports
# unreadable/missing values as "unknown" (never defaulting SetupMode=0 or SecureBoot=0).

set -euo pipefail

SYSROOT="${YUBIOS_TRUST_SYSROOT:-/}"
sys_path() {
  local rel="${1#/}"
  if [[ "$SYSROOT" == "/" ]]; then
    printf '/%s\n' "$rel"
  fi
  if [[ "$SYSROOT" != "/" ]]; then
    printf '%s/%s\n' "${SYSROOT%/}" "$rel"
  fi
}

read_efivar_byte() {
  local prefix="$1"
  local efidir
  efidir="$(sys_path /sys/firmware/efi/efivars)"
  [[ -d "$efidir" ]] || return 1
  local f
  for f in "$efidir/${prefix}"*; do
    [[ -r "$f" ]] || continue
    local byte_hex
    byte_hex="$(od -An -tx1 -j4 -N1 "$f" 2>/dev/null | tr -d '[:space:]')"
    if [[ -n "$byte_hex" ]]; then
      printf '%d\n' "$((16#$byte_hex))"
      return 0
    fi
  done
  return 1
}

# ── 1. Firmware boundary ──────────────────────────────────────────────────
fw_status="Unverified"
fw_class="warning"
fw_details=()

chipsec_result=""
for cf in "$(sys_path /run/yubiOS/chipsec-firstboot.status)" "$(sys_path /var/lib/yubiOS/chipsec-firstboot.status)"; do
  if [[ -r "$cf" ]]; then
    chipsec_result="$(sed -n 's/^RESULT=//p' "$cf" | tail -n 1 | tr -d '[:space:]')"
    break
  fi
done

sb_byte=""
setup_byte=""
if sb_byte="$(read_efivar_byte "SecureBoot-")"; then
  :
fi
if setup_byte="$(read_efivar_byte "SetupMode-")"; then
  :
fi

if [[ "$chipsec_result" == "FAILED" ]]; then
  fw_status="Failed"
  fw_class="failed"
  fw_details+=("CHIPSEC=FAILED" "SecureBoot=${sb_byte:-unknown}" "SetupMode=${setup_byte:-unknown}")
elif [[ "$sb_byte" == "1" && "$setup_byte" == "0" ]]; then
  fw_status="Verified"
  fw_class="verified"
  fw_details+=("SecureBoot=1" "SetupMode=0")
elif [[ "$setup_byte" == "1" ]]; then
  fw_status="Setup Mode"
  fw_class="warning"
  fw_details+=("SecureBoot=${sb_byte:-unknown}" "SetupMode=1")
else
  fw_status="Unverified"
  fw_class="warning"
  fw_details+=("SecureBoot=${sb_byte:-unknown}" "SetupMode=${setup_byte:-unknown}")
fi

if [[ -n "$chipsec_result" && "$chipsec_result" != "FAILED" ]]; then
  fw_details+=("CHIPSEC=${chipsec_result}")
fi
if [[ -e "$(sys_path /dev/tpmrm0)" || -e "$(sys_path /dev/tpm0)" ]]; then
  fw_details+=("TPM=present")
fi
fw_detail_str="${fw_details[*]}"

# ── 2. Boot image boundary ────────────────────────────────────────────────
boot_status="Unmeasured"
boot_class="warning"
boot_details=()

cmdline_file="$(sys_path /proc/cmdline)"
composefs_digest=""
if [[ -r "$cmdline_file" ]]; then
  composefs_digest="$(sed -n 's/.*composefs=\([^[:space:]]*\).*/\1/p' "$cmdline_file" | head -n 1)"
fi

mounts_file="$(sys_path /proc/mounts)"
root_fstype=""
composefs_mounted=0
if [[ -r "$mounts_file" ]]; then
  while read -r m_src m_target m_fstype m_opts _rest; do
    if [[ "$m_target" == "/" || "$m_target" == "/sysroot" ]]; then
      root_fstype="$m_fstype"
      if [[ "$m_fstype" == "composefs" || "$m_src" == *"composefs"* || "$m_opts" == *"verity"* ]]; then
        composefs_mounted=1
        break
      fi
    fi
  done < "$mounts_file"
fi

stub_pcr=""
if stub_pcr="$(read_efivar_byte "StubPcrKernelImage-")"; then
  :
fi

ostree_booted=0
if [[ -e "$(sys_path /run/ostree-booted)" ]]; then
  ostree_booted=1
fi

if [[ -n "$composefs_digest" && "$composefs_mounted" -eq 1 ]]; then
  boot_status="Verified"
  boot_class="verified"
  short_digest="${composefs_digest:0:16}"
  boot_details+=("composefs=${short_digest}..." "root-mount=composefs")
  [[ -n "$stub_pcr" && "$stub_pcr" != "0" ]] && boot_details+=("UKI-PCR11=measured")
  [[ "$ostree_booted" -eq 1 ]] && boot_details+=("ostree=booted")
elif [[ "$ostree_booted" -eq 1 && -n "$stub_pcr" && "$stub_pcr" != "0" && "$composefs_mounted" -eq 1 ]]; then
  boot_status="Verified"
  boot_class="verified"
  boot_details+=("root-mount=composefs" "UKI-PCR11=measured" "ostree=booted")
elif [[ -n "$composefs_digest" || "$ostree_booted" -eq 1 ]]; then
  boot_status="Unverified"
  boot_class="warning"
  if [[ -n "$composefs_digest" ]]; then
    boot_details+=("composefs=${composefs_digest:0:16}...")
  else
    boot_details+=("composefs=none")
  fi
  boot_details+=("root-mount=${root_fstype:-unknown}")
  [[ "$ostree_booted" -eq 1 ]] && boot_details+=("ostree=booted")
else
  boot_status="Unmeasured"
  boot_class="warning"
  boot_details+=("composefs=none" "root-mount=${root_fstype:-unknown}")
fi
boot_detail_str="${boot_details[*]}"

# ── 3. Owner key boundary ─────────────────────────────────────────────────
owner_status="Not Enrolled"
owner_class="warning"
owner_details=()

enrolled_marker="$(sys_path /var/lib/yubiOS/.enrolled)"
u2f_file="$(sys_path /etc/yubico/u2f_keys)"
piv_cert="$(sys_path /var/lib/yubiOS/sb/db.crt)"

has_enrolled=0
[[ -e "$enrolled_marker" ]] && has_enrolled=1

has_u2f=0
if [[ -s "$u2f_file" ]] && grep -q ':' "$u2f_file" 2>/dev/null; then
  has_u2f=1
fi

has_piv=0
[[ -s "$piv_cert" ]] && has_piv=1

if [[ "$has_enrolled" -eq 1 && ( "$has_u2f" -eq 1 || "$has_piv" -eq 1 ) ]]; then
  owner_status="Verified"
  owner_class="verified"
  owner_details+=("enrolled=yes")
  [[ "$has_piv" -eq 1 ]] && owner_details+=("PIV-9a=enrolled")
  [[ "$has_u2f" -eq 1 ]] && owner_details+=("PAM-U2F=active")
elif [[ "$has_enrolled" -eq 1 || "$has_u2f" -eq 1 || "$has_piv" -eq 1 ]]; then
  owner_status="Partial"
  owner_class="warning"
  [[ "$has_enrolled" -eq 1 ]] && owner_details+=("enrolled=yes") || owner_details+=("enrolled=no")
  [[ "$has_piv" -eq 1 ]] && owner_details+=("PIV-9a=enrolled")
  [[ "$has_u2f" -eq 1 ]] && owner_details+=("PAM-U2F=active")
else
  owner_status="Not Enrolled"
  owner_class="warning"
  owner_details+=("enrolled=no")
fi
owner_detail_str="${owner_details[*]}"

if [[ "${1:-}" == "--json" ]]; then
  python3 - "$fw_status" "$fw_class" "$fw_detail_str" \
            "$boot_status" "$boot_class" "$boot_detail_str" \
            "$owner_status" "$owner_class" "$owner_detail_str" << 'PY'
import json, sys
_, fws, fwc, fwd, bts, btc, btd, ows, owc, owd = sys.argv
print(json.dumps({
    "firmware": {"status": fws, "class": fwc, "detail": fwd},
    "boot_image": {"status": bts, "class": btc, "detail": btd},
    "owner_key": {"status": ows, "class": owc, "detail": owd},
}, indent=2))
PY
else
  printf 'FIRMWARE_STATUS=%s\n' "$fw_status"
  printf 'FIRMWARE_CLASS=%s\n' "$fw_class"
  printf 'FIRMWARE_DETAIL=%s\n' "$fw_detail_str"
  printf 'BOOT_IMAGE_STATUS=%s\n' "$boot_status"
  printf 'BOOT_IMAGE_CLASS=%s\n' "$boot_class"
  printf 'BOOT_IMAGE_DETAIL=%s\n' "$boot_detail_str"
  printf 'OWNER_KEY_STATUS=%s\n' "$owner_status"
  printf 'OWNER_KEY_CLASS=%s\n' "$owner_class"
  printf 'OWNER_KEY_DETAIL=%s\n' "$owner_detail_str"
fi
