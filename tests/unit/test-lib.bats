#!/usr/bin/env bats
# Unit tests for usr/lib/yubiOS/lib.sh
# Run: bats tests/unit/test-lib.bats
# Mocks all hardware; no U2F/HSM required.

FIXTURES="$(dirname "$BATS_TEST_FILENAME")/../fixtures"

setup() {
  # Temp home so tests don't touch real /etc
  export TMPDIR="$(mktemp -d)"
  export HOME="$TMPDIR"
  export YUBIOS_U2F_KEYS="$TMPDIR/u2f_keys"
  touch "$YUBIOS_U2F_KEYS"
  # Source lib with mocked commands
  # shellcheck source=/dev/null
  source usr/lib/yubiOS/lib.sh 2>/dev/null || source /usr/lib/yubiOS/lib.sh
}

teardown() {
  rm -rf "$TMPDIR"
}

# ── detect_fido2_device ────────────────────────────────────────────────────

@test "detect_fido2_device returns hidraw path when device present" {
  fido2-token() { echo "/dev/hidraw0: Yubico U2F/HSM FIDO+CCID"; }
  export -f fido2-token
  run detect_fido2_device
  [ "$status" -eq 0 ]
  [ "$output" = "/dev/hidraw0" ]
}

@test "detect_fido2_device dies when no device" {
  fido2-token() { echo ""; }
  export -f fido2-token
  run detect_fido2_device
  [ "$status" -ne 0 ]
  [[ "$output" == *"No FIDO2 device found"* ]]
}

# ── check_pam_u2f_version ─────────────────────────────────────────────────

@test "check_pam_u2f_version passes on 1.3.1" {
  rpm() { echo "1.3.1"; }
  export -f rpm
  run check_pam_u2f_version
  [ "$status" -eq 0 ]
}

@test "check_pam_u2f_version passes on newer version" {
  rpm() { echo "1.4.0"; }
  export -f rpm
  run check_pam_u2f_version
  [ "$status" -eq 0 ]
}

@test "check_pam_u2f_version fails on 1.3.0" {
  rpm() { echo "1.3.0"; }
  export -f rpm
  run check_pam_u2f_version
  [ "$status" -ne 0 ]
  [[ "$output" == *"1.3.1"* ]]
}

@test "check_pam_u2f_version fails on ancient 1.2.0" {
  rpm() { echo "1.2.0"; }
  export -f rpm
  run check_pam_u2f_version
  [ "$status" -ne 0 ]
}

# ── detect_luks2_partition ────────────────────────────────────────────────

@test "detect_luks2_partition finds unmounted LUKS device" {
  lsblk() {
    cat "$FIXTURES/lsblk-with-luks.json"
  }
  export -f lsblk
  run detect_luks2_partition
  [ "$status" -eq 0 ]
  [[ "$output" == /dev/* ]]
}

@test "detect_luks2_partition returns empty when no LUKS" {
  lsblk() {
    cat "$FIXTURES/lsblk-no-luks.json"
  }
  export -f lsblk
  run detect_luks2_partition
  [ -z "$output" ]
}

# ── wait_for_u2f_hsm ──────────────────────────────────────────────────────

@test "wait_for_u2f_hsm succeeds immediately when key present" {
  fido2-token() { echo "/dev/hidraw0: U2F/HSM"; }
  export -f fido2-token
  run wait_for_u2f_hsm
  [ "$status" -eq 0 ]
}

# ── check_fido2_pin_length ────────────────────────────────────────────────

@test "check_fido2_pin_length passes when PIN length meets minimum" {
  detect_fido2_device() { echo "/dev/hidraw0"; }
  export -f detect_fido2_device
  fido2-token() { echo "minPinLength 8"; }
  export -f fido2-token
  run check_fido2_pin_length 8
  [ "$status" -eq 0 ]
}

@test "check_fido2_pin_length fails when PIN too short" {
  detect_fido2_device() { echo "/dev/hidraw0"; }
  export -f detect_fido2_device
  fido2-token() { echo "minPinLength 4"; }
  export -f fido2-token
  run check_fido2_pin_length 8
  [ "$status" -ne 0 ]
  [[ "$output" == *"too short"* ]]
}

# ── logging helpers ───────────────────────────────────────────────────────

@test "yubiOS_log outputs to stdout with prefix" {
  run yubiOS_log "hello test"
  [ "$status" -eq 0 ]
  [[ "$output" == *"[yubiOS]"* ]]
  [[ "$output" == *"hello test"* ]]
}

@test "yubiOS_die exits non-zero" {
  run yubiOS_die "something broke"
  [ "$status" -ne 0 ]
  [[ "$output" == *"ERROR"* ]]
}
