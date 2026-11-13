#!/bin/bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# yubiOS enrollment wizard — runs on first boot via yubiOS-enroll.service
# Guides user through: Secure Boot → Disk Encryption → SSH → PAM

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

clear
cat << "BANNER"
 _  _ _   _ ___ ___ ___  ___
| \| | | | | _ \_ _/ _ \/ __|
| .` | |_| | _ /| | (_) \__ \
|_|_|\___/|_| |___|\___/|___/

YubiKey-First Immutable OS
BANNER

echo ""
echo "This wizard will enroll your YubiKey as the root of trust for:"
echo "  1. Secure Boot signing (PIV slot 9c, CCID interface)"
echo "  2. Disk encryption unlock (FIDO2 HMAC-secret, hidraw)"
echo "  3. SSH keys (ed25519-sk resident key, hidraw)"
echo "  4. sudo / login auth (U2F pam_u2f, hidraw)"
echo ""
echo "YubiKey firmware >= 5.2.3 required for ed25519-sk."
echo ""

wait_for_yubikey

echo ""
echo "YubiKey detected. Confirm FIDO2 PIN is set before continuing."
echo "  If not: run \"ykman fido access change-pin\" in another terminal."
read -rp "Press Enter when ready, or Ctrl-C to abort..."

echo ""
echo "─── Step 1/4: Secure Boot Signing ───"
echo "Uses YubiKey PIV slot 9c. Requires PIV PIN (default: 123456)."
read -rp "Enroll Secure Boot key? [Y/n]: " do_sb
if [[ "${do_sb:-Y}" =~ ^[Yy] ]]; then
  /usr/lib/yubiOS/enroll-sb.sh
fi

echo ""
echo "─── Step 2/4: Disk Encryption (FIDO2 hidraw) ───"
echo "Enrolls YubiKey FIDO2 as LUKS2 unlock key. Touch + PIN required at boot."
read -rp "Enroll disk encryption? [Y/n]: " do_luks
if [[ "${do_luks:-Y}" =~ ^[Yy] ]]; then
  /usr/lib/yubiOS/enroll-luks.sh
fi

echo ""
echo "─── Step 3/4: SSH Key (ed25519-sk resident) ───"
echo "Private key stays on YubiKey. Touch + PIN required per connection."
read -rp "Generate SSH key? [Y/n]: " do_ssh
if [[ "${do_ssh:-Y}" =~ ^[Yy] ]]; then
  sudo -u "${SUDO_USER:-$USER}" /usr/lib/yubiOS/enroll-ssh.sh
fi

echo ""
echo "─── Step 4/4: sudo / Login Auth (U2F pam-u2f) ───"
echo "Adds YubiKey touch requirement to sudo. Read ONBOARDING.md for recovery."
read -rp "Enroll PAM U2F? [Y/n]: " do_pam
if [[ "${do_pam:-Y}" =~ ^[Yy] ]]; then
  /usr/lib/yubiOS/enroll-pam.sh
fi

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "Enrollment complete. Your YubiKey is now the root of trust for this system."
echo ""
echo "IMPORTANT: Enroll a BACKUP YubiKey now while you still have access."
echo "  Run: yubiOS-enroll-luks   (for second YubiKey disk unlock)"
echo "  Run: yubiOS-enroll-pam    (for second YubiKey sudo auth)"
echo ""
echo "See ONBOARDING.md for recovery procedures if your YubiKey is lost."
