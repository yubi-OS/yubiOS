#!/usr/bin/env bats
# Static + verify tests for the shipped enrollment unit (no hardware required).
# Covers ADR-016 gates on usr/lib/systemd/system/yubiOS-enroll.service:
#   - ConditionSecurity=measured-os  (enrollment only on a measured-boot system)
#   - RestrictFileSystems=~@network  (deny network filesystems via BPF-LSM)
# Run: bats tests/unit/test-enroll-unit.bats

UNIT="usr/lib/systemd/system/yubiOS-enroll.service"
ENROLL="usr/lib/yubiOS/enroll.sh"
GATE="usr/lib/yubiOS/chipsec/check-enrollment-gate.sh"

setup() {
  [ -f "$UNIT" ] || UNIT="/usr/lib/systemd/system/yubiOS-enroll.service"
  [ -f "$ENROLL" ] || ENROLL="/usr/lib/yubiOS/enroll.sh"
  [ -f "$GATE" ] || GATE="/usr/lib/yubiOS/chipsec/check-enrollment-gate.sh"
}

# Run enroll.sh up to (and including) the CHIPSEC gate only.
# $1 = RESULT value or "absent"; $2 = "helper" (default) or "inline" fallback.
run_enroll_gate() {
  local result="$1" via="${2:-helper}"
  local f="$BATS_TEST_TMPDIR/chipsec-firstboot.status"
  rm -f "$f"
  if [ "$result" != absent ]; then
    printf 'RESULT=%s\nTIMESTAMP=2026-11-12T00:00:00Z\nDETAILS=test\n' "$result" > "$f"
  fi
  local gate="$BATS_TEST_TMPDIR/check-enrollment-gate.sh"
  if [ "$via" = helper ]; then
    cp "$GATE" "$gate"
    chmod +x "$gate"
  else
    gate="$BATS_TEST_TMPDIR/no-such-gate"
  fi
  YUBIOS_CHIPSEC_GATE="$gate" \
    YUBIOS_CHIPSEC_STATE_FILE="$f" \
    YUBIOS_CHIPSEC_PERSIST_FILE="$BATS_TEST_TMPDIR/no-such-persist" \
    YUBIOS_ENROLL_GATE_ONLY=1 \
    run bash "$ENROLL"
}

# -- ConditionSecurity=measured-os ------------------------------------------

@test "enroll unit gates on ConditionSecurity=measured-os" {
  run grep -E '^[[:space:]]*ConditionSecurity[[:space:]]*=[[:space:]]*measured-os[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "ConditionSecurity is declared in [Unit], not [Service]" {
  run bash -c "awk '/^\[/{s=\$0} /ConditionSecurity/{print s}' '$UNIT'"
  [ "$output" = "[Unit]" ]
}

# -- RestrictFileSystems=~@network ------------------------------------------

@test "enroll unit sets RestrictFileSystems to deny @network" {
  run grep -E '^[[:space:]]*RestrictFileSystems[[:space:]]*=[[:space:]]*~@network[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "RestrictFileSystems uses deny-list (~) form, never an allow-list" {
  # An accidental allow-list (no leading ~) would block btrfs/ext4/proc and brick boot.
  line="$(grep -E '^[[:space:]]*RestrictFileSystems' "$UNIT" | head -n1)"
  [[ "$line" == *'~@network'* ]]
}

# -- unit validity on v261 --------------------------------------------------

@test "systemd-analyze verify reports no errors for the enroll unit" {
  command -v systemd-analyze >/dev/null 2>&1 || skip "systemd-analyze not installed"
  # systemd-analyze verify also checks that every Exec*= binary exists. On a bare
  # CI runner the shipped binaries (/usr/lib/yubiOS/*.sh) and /bin/{mkdir,touch}
  # are not installed, so verify would exit non-zero on "is not executable" alone
  # â an environment artifact, not a unit defect. Stage a minimal root with an
  # executable stub for each Exec*= path the unit references, then verify against
  # that root. Real directive/syntax errors still fail honestly (a bogus key still
  # yields exit 1); only the missing-real-binary artifact is removed.
  root="$(mktemp -d)"
  mkdir -p "$root/usr/lib/systemd/system"
  cp "$UNIT" "$root/usr/lib/systemd/system/"
  unit_base="$(basename "$UNIT")"
  grep -hoE '''^[[:space:]]*Exec[A-Za-z]*[[:space:]]*=[[:space:]]*[-@!+]*/[^[:space:]]+''' "$UNIT" \
    | sed -E '''s/^[^=]*=[[:space:]]*[-@!+]*//''' \
    | while read -r bin; do
        [ -n "$bin" ] || continue
        mkdir -p "$root$(dirname "$bin")"
        printf '''#!/bin/sh\nexit 0\n''' > "$root$bin"
        chmod +x "$root$bin"
      done
  run systemd-analyze verify --recursive-errors=no --root="$root" "usr/lib/systemd/system/$unit_base"
  rm -rf "$root"
  [ "$status" -eq 0 ]
}

@test "RestrictFileSystems is a known directive on this systemd (>= v250)" {
  command -v systemd-analyze >/dev/null 2>&1 || skip "systemd-analyze not installed"
  ver="$(systemd-analyze --version | awk 'NR==1{print $2}')"
  [ "$ver" -ge 250 ]
}

# -- OMN-18: CHIPSEC ordering + gate -------------------------------------------

@test "enroll unit orders after and wants the CHIPSEC first-boot check" {
  run grep -E '^[[:space:]]*After[[:space:]]*=[[:space:]]*yubiOS-chipsec-firstboot\.service[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
  run grep -E '^[[:space:]]*Wants[[:space:]]*=[[:space:]]*yubiOS-chipsec-firstboot\.service[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
  # Wants=, never Requires=/BindsTo=: a skipped CHIPSEC unit must not cancel enrollment.
  run grep -E '^[[:space:]]*(Requires|BindsTo|Requisite)[[:space:]]*=.*yubiOS-chipsec-firstboot' "$UNIT"
  [ "$status" -ne 0 ]
}

@test "enroll unit gates on the CHIPSEC result via ExecCondition" {
  run grep -E '^[[:space:]]*ExecCondition[[:space:]]*=[[:space:]]*/usr/lib/yubiOS/chipsec/check-enrollment-gate\.sh[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
  run bash -c "awk '/^\[/{s=\$0} /^ExecCondition/{print s}' '$UNIT'"
  [ "$output" = "[Service]" ]
}

@test "ExecCondition target ships with the repo/image" {
  [ -f "$GATE" ]
}

@test "enroll.sh: RESULT=PASS proceeds (exit 0)" {
  run_enroll_gate PASS
  [ "$status" -eq 0 ]
}

@test "enroll.sh: RESULT=WARN proceeds with the warning (exit 0)" {
  run_enroll_gate WARN
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARN: CHIPSEC first-boot platform check reported WARN; proceeding with enrollment (review journal for firmware warnings)."* ]]
}

@test "enroll.sh: RESULT=FAILED blocks enrollment (exit 1)" {
  run_enroll_gate FAILED
  [ "$status" -eq 1 ]
  [[ "$output" == *"FAIL: CHIPSEC first-boot platform check reported FAILED; blocking YubiKey enrollment per ADR-024."* ]]
}

@test "enroll.sh: absent status file (VM / ARM64) proceeds (exit 0)" {
  run_enroll_gate absent
  [ "$status" -eq 0 ]
}

@test "enroll.sh: inline fallback still blocks on FAILED when the helper is missing" {
  run_enroll_gate FAILED inline
  [ "$status" -eq 1 ]
  [[ "$output" == *"blocking YubiKey enrollment per ADR-024."* ]]
}

@test "enroll.sh: inline fallback warns and proceeds on WARN" {
  run_enroll_gate WARN inline
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARN: CHIPSEC first-boot platform check reported WARN"* ]]
}

@test "enroll.sh: inline fallback proceeds when no status file exists" {
  run_enroll_gate absent inline
  [ "$status" -eq 0 ]
}
