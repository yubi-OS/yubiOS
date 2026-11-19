#!/usr/bin/env bats
# Static tests for the pam-u2f auth path in the shipped PAM stacks (no hardware).
# Asserts the U2F/HSM touch is REQUIRED (not sufficient) on both system-auth and sudo,
# uses the central authfile, and that the version floor matches the CVE fix.
# Run: bats tests/unit/test-pam-u2f-stack.bats

SYS="usr/lib/pam.d/yubiOS-system-auth"
SUDO="usr/lib/pam.d/yubiOS-sudo"

setup() {
  [ -f "$SYS" ]  || SYS="/usr/lib/pam.d/yubiOS-system-auth"
  [ -f "$SUDO" ] || SUDO="/usr/lib/pam.d/yubiOS-sudo"
}

pam_u2f_auth_line() { grep -E '^[[:space:]]*auth[[:space:]].*pam_u2f\.so' "$1" | head -n1; }

# -- system-auth ------------------------------------------------------------

@test "system-auth: pam_u2f is in the auth stack" {
  run pam_u2f_auth_line "$SYS"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "system-auth: pam_u2f is 'required' (touch always enforced, never sufficient)" {
  line="$(pam_u2f_auth_line "$SYS")"
  [[ "$line" == *required* ]]
  [[ "$line" != *sufficient* ]]
}

@test "system-auth: pam_u2f points at the central authfile" {
  line="$(pam_u2f_auth_line "$SYS")"
  [[ "$line" == *"authfile=/etc/yubico/u2f_keys"* ]]
}

@test "system-auth: pam_u2f sets cue and origin" {
  line="$(pam_u2f_auth_line "$SYS")"
  [[ "$line" == *" cue"* ]]
  [[ "$line" == *"origin=pam://yubiOS"* ]]
}

@test "system-auth: pam_unix cannot pass auth alone (deny terminator present)" {
  run grep -E '^[[:space:]]*auth[[:space:]]+required[[:space:]]+pam_deny\.so' "$SYS"
  [ "$status" -eq 0 ]
}

# -- sudo -------------------------------------------------------------------

@test "sudo: pam_u2f is required before the system-auth include" {
  line="$(pam_u2f_auth_line "$SUDO")"
  [[ "$line" == *required* ]]
  [[ "$line" == *"authfile=/etc/yubico/u2f_keys"* ]]
}

# -- version floor (CVE fix) ------------------------------------------------

@test "pam-u2f version floor is documented at >= 1.3.1 and enforced in lib.sh" {
  run grep -REo '1\.3\.1' "$SYS" "$SUDO" usr/lib/yubiOS/lib.sh
  [ "$status" -eq 0 ]
}

@test "installed pam-u2f (if present) meets the 1.3.1 floor" {
  command -v rpm >/dev/null 2>&1 || skip "rpm not available"
  v="$(rpm -q --qf '%{VERSION}' pam-u2f 2>/dev/null || true)"
  [ -n "$v" ] || skip "pam-u2f not installed in this environment"
  run bash -c "printf '%s\n%s\n' '1.3.1' '$v' | sort -V | head -n1"
  [ "$output" = "1.3.1" ]
}
