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
  [[ "$output" == *"FAIL: CHIPSEC first-boot platform check reported FAILED; blocking U2F/HSM enrollment per ADR-024."* ]]
}

@test "enroll.sh: absent status file (VM / ARM64) proceeds (exit 0)" {
  run_enroll_gate absent
  [ "$status" -eq 0 ]
}

@test "enroll.sh: inline fallback still blocks on FAILED when the helper is missing" {
  run_enroll_gate FAILED inline
  [ "$status" -eq 1 ]
  [[ "$output" == *"blocking U2F/HSM enrollment per ADR-024."* ]]
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

# -- Dual-console (serial + HDMI tty1) and default wallpaper checks -----------

@test "enroll unit orders Before gdm.service and display-manager.service so HDMI tty1 is visible during enrollment" {
  run grep -E '^Before=.*gdm\.service.*display-manager\.service' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "enroll.sh includes dual-console PTY multiplexer for /dev/tty1 (HDMI) and serial console" {
  run grep -q 'YUBIOS_DUAL_CONSOLE_MUX' "$ENROLL"
  [ "$status" -eq 0 ]
  run grep -q '/dev/tty1' "$ENROLL"
  [ "$status" -eq 0 ]
}

@test "OS default wallpaper gschema override and background properties point to yubios-aurora-ridge-4k.jpg" {
  local gschema="usr/share/glib-2.0/schemas/zz-yubiOS-wallpaper.gschema.override"
  local bprop="usr/share/gnome-background-properties/yubios-wallpapers.xml"
  [ -f "$gschema" ] || gschema="/$gschema"
  [ -f "$bprop" ] || bprop="/$bprop"
  [ -f "$gschema" ]
  [ -f "$bprop" ]
  run grep -q "file:///usr/share/backgrounds/yubios/yubios-aurora-ridge-4k.jpg" "$gschema"
  [ "$status" -eq 0 ]
  run grep -q "/usr/share/backgrounds/yubios/yubios-aurora-ridge-4k.jpg" "$bprop"
  [ "$status" -eq 0 ]
}

@test "homed fast path uses only documented systemd knobs (no LD_PRELOAD shim, discard off, noinit_itable, broken_system_clock)" {
  local homed="usr/lib/yubiOS/enroll-homed.sh"
  local luks="usr/lib/yubiOS/enroll-luks.sh"
  local merge="usr/lib/yubiOS/ab-etc-merge.sh"
  local cf="Containerfile"
  local dconf="usr/lib/dconf/db/local.d/00-yubios-wallpaper"
  [ -f "$homed" ] || homed="/$homed"
  [ -f "$luks" ] || luks="/$luks"
  [ -f "$merge" ] || merge="/$merge"
  [ -f "$dconf" ] || dconf="/$dconf"
  # fvf35/OMN-36: online + offline discard off. The image is allocated once at create and
  # never FITRIM-punched at login nor re-fallocated at logout (run_fallocate early-returns).
  run grep -q -- "--luks-discard=no" "$homed"
  [ "$status" -eq 0 ]
  run grep -q -- "--luks-offline-discard=no" "$homed"
  [ "$status" -eq 0 ]
  run grep -qE -- "^[[:space:]]*--luks-discard=yes" "$homed"
  [ "$status" -ne 0 ]
  # Create wait gate kept as defense-in-depth for homectl's fixed 2 min client timeout
  run grep -q 'CREATE_WAIT_SECS="${YUBIOS_HOMED_CREATE_WAIT:-900}"' "$homed"
  [ "$status" -eq 0 ]
  run grep -q -- "--luks-extra-mount-options=noinit_itable" "$homed"
  [ "$status" -eq 0 ]
  # Regression guard (fvf33): no symbol-interposition shim anywhere on the homed/GDM path
  run grep -E "LD_PRELOAD=.*libfast_homed|gcc .*libfast_homed" "$homed" "$merge"
  [ "$status" -ne 0 ]
  # Regression guard: dm-crypt/LUKS-on-sparse-file is never "pre-zeroed"
  run grep -E "assume_storage_prezeroed=1|lazy_journal_init=1" "$homed" "$luks"
  [ "$status" -ne 0 ]
  # ab-etc-merge purges stale /etc drop-ins instead of copying them in
  run grep -q "grep -qE 'LD_PRELOAD|libfast_homed|assume_storage_prezeroed'" "$merge"
  [ "$status" -eq 0 ]
  run grep -q "broken_system_clock = true" "$merge"
  [ "$status" -eq 0 ]
  run grep -q "enable-smartcard-authentication=false" "$dconf"
  [ "$status" -eq 0 ]
  if [ -f "$cf" ]; then
    run grep -E "libfast_homed\.so -ldl|LD_PRELOAD=/usr/lib/yubiOS/uki/libfast_homed\.so|assume_storage_prezeroed=1" "$cf"
    [ "$status" -ne 0 ]
    # mke2fs keeps only the last -E; the custom -E must restate nodiscard
    run grep -q 'SYSTEMD_HOME_MKFS_OPTIONS_EXT4=-J size=64 -E lazy_itable_init=1,nodiscard"' "$cf"
    [ "$status" -eq 0 ]
  fi
}

@test "fvf35 PAM: homed failure never falls through to pam_u2f/pam_unix; pamu2fcfg origin matches the stacks" {
  local sys="usr/lib/pam.d/yubiOS-system-auth"
  local sudo="usr/lib/pam.d/yubiOS-sudo"
  local pam="usr/lib/yubiOS/enroll-pam.sh"
  [ -f "$sys" ] || sys="/$sys"
  [ -f "$sudo" ] || sudo="/$sudo"
  [ -f "$pam" ] || pam="/$pam"
  # Only PAM_USER_UNKNOWN (non-homed users such as root) continues to pam_u2f/pam_unix
  run grep -qE '^-auth[[:space:]]+\[success=done user_unknown=ignore default=die\][[:space:]]+pam_systemd_home\.so' "$sys"
  [ "$status" -eq 0 ]
  run grep -qE '^-auth[[:space:]].*default=ignore.*pam_systemd_home\.so' "$sys"
  [ "$status" -ne 0 ]
  run grep -qE '^auth[[:space:]]+required[[:space:]]+pam_u2f\.so .*nouserok.*origin=pam://yubiOS' "$sys"
  [ "$status" -eq 0 ]
  run grep -qE '^auth[[:space:]]+required[[:space:]]+pam_u2f\.so .*origin=pam://yubiOS' "$sudo"
  [ "$status" -eq 0 ]
  run grep -q -- '-o pam://yubiOS -i pam://yubiOS' "$pam"
  [ "$status" -eq 0 ]
}
