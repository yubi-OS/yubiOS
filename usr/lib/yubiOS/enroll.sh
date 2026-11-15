#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS enrollment wizard — runs on first boot via yubiOS-enroll.service
# Guides user through: Secure Boot → Disk Encryption → Homed User → SSH → PAM

set -euo pipefail

# ADR-024 / OMN-18: refuse to enroll when the first-boot CHIPSEC platform
# check reported FAILED. yubiOS-enroll.service already gates on this via
# ExecCondition=; repeating it here covers manual runs of the wizard.
YUBIOS_CHIPSEC_GATE="${YUBIOS_CHIPSEC_GATE:-/usr/lib/yubiOS/chipsec/check-enrollment-gate.sh}"
chipsec_gate() {
  if [[ -x "$YUBIOS_CHIPSEC_GATE" ]]; then
    "$YUBIOS_CHIPSEC_GATE"
    return
  fi
  # Fallback when the gate helper is missing: same contract, inline.
  local f="${YUBIOS_CHIPSEC_STATE_FILE:-/run/yubiOS/chipsec-firstboot.status}"
  [[ -r "$f" ]] || f="${YUBIOS_CHIPSEC_PERSIST_FILE:-/var/lib/yubiOS/chipsec-firstboot.status}"
  [[ -r "$f" ]] || return 0
  case "$(sed -n 's/^RESULT=//p' "$f" | tail -n 1 | tr -d '[:space:]')" in
    FAILED)
      echo "FAIL: CHIPSEC first-boot platform check reported FAILED; blocking YubiKey enrollment per ADR-024." >&2
      return 1 ;;
    WARN)
      echo "WARN: CHIPSEC first-boot platform check reported WARN; proceeding with enrollment (review journal for firmware warnings)." >&2 ;;
  esac
  return 0
}
if ! chipsec_gate; then
  exit 1
fi
# Test hook (tests/unit/test-enroll-unit.bats): stop after the gate.
if [[ "${YUBIOS_ENROLL_GATE_ONLY:-0}" == 1 ]]; then
  exit 0
fi

# shellcheck source=lib.sh
source /usr/lib/yubiOS/lib.sh

clear 2>/dev/null || true
cat << "BANNER"
 _  _ _   _ ___ ___ ___  ___
| \| | | | | _ \_ _/ _ \/ __|
| .` | |_| | _ /| | (_) \__ \
|_|_|\___/|_| |___|\___/|___/

YubiKey-First Immutable OS
BANNER

echo ""
echo "This wizard will enroll your YubiKey as the root of trust for:"
echo "  1. Secure Boot signing (PIV slot 9a, CCID interface)"
echo "  2. Disk encryption unlock (FIDO2 HMAC-secret, hidraw)"
echo "  3. User home directory (systemd-homed LUKS2 + FIDO2, default user: yubios)"
echo "  4. SSH keys (ed25519-sk resident key, hidraw)"
echo "  5. sudo / login auth (U2F pam_u2f, hidraw)"
echo ""
echo "YubiKey firmware >= 5.2.3 required for ed25519-sk."
echo ""

wait_for_yubikey

echo ""
echo "YubiKey detected. Confirm FIDO2 PIN is set before continuing."
echo "  If not: run \"ykman fido access change-pin\" in another terminal."
read -rp "Press Enter when ready, or Ctrl-C to abort..."

DEFAULT_USER="${YUBIOS_ENROLL_USER:-${SUDO_USER:-yubios}}"
read -rp "Initial username to enroll [${DEFAULT_USER}]: " ENROLL_USER
ENROLL_USER="${ENROLL_USER:-$DEFAULT_USER}"
yubiOS_log "Target username for enrollment: $ENROLL_USER"

# Ensure /sys/firmware/efi/efivars is mounted rw once tee_stmm_efi is loaded
if [ -d /sys/firmware/efi/efivars ]; then
  modprobe tee 2>/dev/null || true
  modprobe optee 2>/dev/null || true
  modprobe tee_stmm_efi 2>/dev/null || true
  modprobe efivarfs 2>/dev/null || true
  mount -o remount,rw /sys/firmware/efi/efivars 2>/dev/null || {
    umount /sys/firmware/efi/efivars 2>/dev/null || true
    mount -t efivarfs -o rw efivarfs /sys/firmware/efi/efivars 2>/dev/null || true
  }
fi

run_step_with_retry() {
  local label="$1"
  shift
  while true; do
    if "$@"; then
      return 0
    fi
    echo ""
    yubiOS_log "Step '${label}' failed (for example, wrong PIN or touch timeout)."
    read -rp "Retry '${label}'? [Y/n]: " retry_ans
    if [[ ! "${retry_ans:-Y}" =~ ^[Yy] ]]; then
      return 1
    fi
  done
}

echo ""
echo "─── Step 1/5: Secure Boot Signing ───"
echo "Uses YubiKey PIV slot 9a. Requires PIV PIN (default: 123456)."
read -rp "Enroll Secure Boot key? [Y/n]: " do_sb
if [[ "${do_sb:-Y}" =~ ^[Yy] ]]; then
  run_step_with_retry "Secure Boot Signing" /usr/lib/yubiOS/enroll-sb.sh
fi

echo ""
echo "─── Step 2/5: Disk Encryption (FIDO2 hidraw) ───"
echo "Enrolls YubiKey FIDO2 as LUKS2 unlock key. Touch + PIN required at boot."
read -rp "Enroll disk encryption? [Y/n]: " do_luks
if [[ "${do_luks:-Y}" =~ ^[Yy] ]]; then
  run_step_with_retry "Disk Encryption" /usr/lib/yubiOS/enroll-luks.sh
fi

echo ""
echo "─── Step 3/5: User Home Directory (systemd-homed FIDO2) ───"
echo "Creates LUKS2-encrypted home for '${ENROLL_USER}' unlocked by YubiKey FIDO2."
read -rp "Create FIDO2 homed user '${ENROLL_USER}'? [Y/n]: " do_homed
if [[ "${do_homed:-Y}" =~ ^[Yy] ]]; then
  run_step_with_retry "User Home Directory" /usr/lib/yubiOS/enroll-homed.sh "$ENROLL_USER"
fi

echo ""
echo "─── Step 4/5: SSH Key (ed25519-sk resident) ───"
echo "Private key stays on YubiKey. Touch + PIN required per connection."
read -rp "Generate SSH key? [Y/n]: " do_ssh
if [[ "${do_ssh:-Y}" =~ ^[Yy] ]]; then
  run_step_with_retry "SSH Key" /usr/lib/yubiOS/enroll-ssh.sh
fi

echo ""
echo "─── Step 5/5: sudo / Login Auth (U2F pam-u2f) ───"
echo "Adds YubiKey touch requirement to sudo for '${ENROLL_USER}' (and root)."
read -rp "Enroll PAM U2F? [Y/n]: " do_pam
if [[ "${do_pam:-Y}" =~ ^[Yy] ]]; then
  run_step_with_retry "PAM U2F" /usr/lib/yubiOS/enroll-pam.sh "$ENROLL_USER"
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Enrollment complete. Your YubiKey is now the root of trust for this system."
echo "Enrolled user: ${ENROLL_USER}"
echo ""
echo "IMPORTANT: Enroll a BACKUP YubiKey now while you still have access."
echo "  Run: yubiOS-enroll-luks   (for second YubiKey disk unlock)"
echo "  Run: yubiOS-enroll-pam    (for second YubiKey sudo auth)"
echo ""
echo "See ONBOARDING.md for recovery procedures if your YubiKey is lost."
