#!/usr/bin/env bats
# Static checks for the CHIPSEC first-boot validation unit.
# Covers the TODO/FUTURE guardrail that CHIPSEC remains a one-shot exception:
# measured boot only, first boot only, no network, narrow write paths, and the
# documented raw-hardware capability exception.
# Run: bats tests/unit/test-chipsec-firstboot-unit.bats

UNIT="usr/lib/systemd/system/yubiOS-chipsec-firstboot.service"
WRAPPER="usr/lib/yubiOS/chipsec/run-firstboot-check.sh"
GATE="usr/lib/yubiOS/chipsec/check-enrollment-gate.sh"
BUILDER="usr/lib/yubiOS/chipsec/build-portable-image.sh"
DROPIN="usr/lib/yubiOS/chipsec/yubiOS-chipsec-portable.conf"
# Repo-only (not shipped in the OS image): skipped when run inside the image.
PORTABLE_PROFILE="mkosi.conf.d/chipsec-portable/mkosi.conf"
PORTABLE_POSTINST="mkosi.conf.d/chipsec-portable/mkosi.postinst"

setup() {
  [ -f "$UNIT" ] || UNIT="/usr/lib/systemd/system/yubiOS-chipsec-firstboot.service"
  [ -f "$WRAPPER" ] || WRAPPER="/usr/lib/yubiOS/chipsec/run-firstboot-check.sh"
  [ -f "$GATE" ] || GATE="/usr/lib/yubiOS/chipsec/check-enrollment-gate.sh"
  [ -f "$BUILDER" ] || BUILDER="/usr/lib/yubiOS/chipsec/build-portable-image.sh"
  [ -f "$DROPIN" ] || DROPIN="/usr/lib/yubiOS/chipsec/yubiOS-chipsec-portable.conf"
}

# Run the wrapper with stubbed CHIPSEC/logger/modprobe. $1 = PASS|WARN|FAILED|NOREPORT.
run_wrapper_with() {
  local mode="$1"
  STUB="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB" "$BATS_TEST_TMPDIR/run" "$BATS_TEST_TMPDIR/varlib"
  printf '#!/bin/sh\nexit 0\n' > "$STUB/logger"
  printf '#!/bin/sh\nexit 1\n' > "$STUB/modprobe"
  printf '#!/bin/sh\nexit 0\n' > "$STUB/chipsec_util.py"
  cat > "$STUB/chipsec_main.py" <<EOF
#!/bin/sh
out=""
while [ \$# -gt 0 ]; do [ "\$1" = --json ] && out="\$2"; shift; done
case "$mode" in
  PASS)   echo '[{"result": "Passed"}]' > "\$out" ;;
  WARN)   echo '[{"result": "Warning"}]' > "\$out" ;;
  FAILED) echo '[{"result": "Failed"}]' > "\$out" ;;
  NOREPORT) : ;;
esac
exit 0
EOF
  chmod +x "$STUB"/*
  PATH="$STUB:$PATH" \
    YUBIOS_RUN_DIR="$BATS_TEST_TMPDIR/run" \
    YUBIOS_CHIPSEC_STATE_FILE="$BATS_TEST_TMPDIR/run/chipsec-firstboot.status" \
    YUBIOS_CHIPSEC_PERSIST_DIR="$BATS_TEST_TMPDIR/varlib" \
    YUBIOS_CHIPSEC_PORTABLE_MARKER="$BATS_TEST_TMPDIR/no-such-marker" \
    run sh "$WRAPPER"
}

# Run the enrollment gate against a status file. $1 = RESULT value or "absent".
run_gate_with() {
  local result="$1"
  local f="$BATS_TEST_TMPDIR/chipsec-firstboot.status"
  rm -f "$f"
  if [ "$result" != absent ]; then
    printf 'RESULT=%s\nTIMESTAMP=2026-11-12T00:00:00Z\nDETAILS=test\n' "$result" > "$f"
  fi
  YUBIOS_CHIPSEC_STATE_FILE="$f" \
    YUBIOS_CHIPSEC_PERSIST_FILE="$BATS_TEST_TMPDIR/no-such-persist" \
    run sh "$GATE"
}

@test "chipsec unit gates on measured boot and first boot" {
  run grep -E '^[[:space:]]*ConditionSecurity[[:space:]]*=[[:space:]]*measured-os[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]

  run grep -E '^[[:space:]]*ConditionFirstBoot[[:space:]]*=[[:space:]]*yes[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "chipsec unit runs before enrollment as a one-shot service" {
  run grep -E '^[[:space:]]*Before[[:space:]]*=[[:space:]]*yubiOS-enroll\.service[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]

  run grep -E '^[[:space:]]*Type[[:space:]]*=[[:space:]]*oneshot[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]

  run grep -E '^[[:space:]]*RemainAfterExit[[:space:]]*=[[:space:]]*no[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "chipsec unit keeps the firmware-scan exception offline" {
  run grep -E '^[[:space:]]*PrivateNetwork[[:space:]]*=[[:space:]]*yes[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "chipsec unit keeps filesystem writes narrow" {
  run grep -E '^[[:space:]]*ProtectHome[[:space:]]*=[[:space:]]*yes[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]

  run grep -E '^[[:space:]]*ProtectSystem[[:space:]]*=[[:space:]]*strict[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]

  run grep -E '^[[:space:]]*ReadWritePaths[[:space:]]*=[[:space:]]*/run/yubiOS /tmp[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "chipsec unit capability exception stays explicit" {
  run grep -E '^[[:space:]]*CapabilityBoundingSet[[:space:]]*=[[:space:]]*CAP_SYS_RAWIO CAP_SYS_ADMIN CAP_DAC_OVERRIDE[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]

  run grep -E '^[[:space:]]*NoNewPrivileges[[:space:]]*=[[:space:]]*no[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "chipsec wrapper documents warning-mode result semantics" {
  run grep -F 'RESULT=PASS' "$WRAPPER"
  [ "$status" -eq 0 ]

  run grep -F 'RESULT=WARN' "$WRAPPER"
  [ "$status" -eq 0 ]

  run grep -F 'RESULT=FAILED' "$WRAPPER"
  [ "$status" -eq 0 ]

  run grep -F 'informational only -- it does not PASS/FAIL' "$WRAPPER"
  [ "$status" -eq 0 ]
}

@test "chipsec wrapper warning paths stay non-fatal and explicit" {
  run grep -F 'OVERALL=WARN' "$WRAPPER"
  [ "$status" -eq 0 ]

  run grep -F 'treating as inconclusive, not a hard failure' "$WRAPPER"
  [ "$status" -eq 0 ]

  run grep -F 'WPBT_PRESENT=$WPBT_SEEN' "$WRAPPER"
  [ "$status" -eq 0 ]
}

@test "systemd-analyze verify reports no errors for the chipsec unit" {
  command -v systemd-analyze >/dev/null 2>&1 || skip "systemd-analyze not installed"
  root="$(mktemp -d)"
  mkdir -p "$root/usr/lib/systemd/system"
  cp "$UNIT" "$root/usr/lib/systemd/system/"
  unit_base="$(basename "$UNIT")"
  grep -hoE '^[[:space:]]*Exec[A-Za-z]*[[:space:]]*=[[:space:]]*[-@!+]*/[^[:space:]]+' "$UNIT" \
    | sed -E 's/^[^=]*=[[:space:]]*[-@!+]*//' \
    | while read -r bin; do
        [ -n "$bin" ] || continue
        mkdir -p "$root$(dirname "$bin")"
        printf '#!/bin/sh\nexit 0\n' > "$root$bin"
        chmod +x "$root$bin"
      done
  run systemd-analyze verify --recursive-errors=no --root="$root" "usr/lib/systemd/system/$unit_base"
  rm -rf "$root"
  [ "$status" -eq 0 ]
}

# -- OMN-18: status file contract ---------------------------------------------

@test "chipsec unit keeps /run/yubiOS and the status file across the one-shot exit" {
  run grep -E '^[[:space:]]*RuntimeDirectory[[:space:]]*=[[:space:]]*yubiOS[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
  run grep -E '^[[:space:]]*RuntimeDirectoryPreserve[[:space:]]*=[[:space:]]*yes[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
  run grep -E '^[[:space:]]*StateDirectory[[:space:]]*=[[:space:]]*yubiOS[[:space:]]*$' "$UNIT"
  [ "$status" -eq 0 ]
}

@test "wrapper writes RESULT=PASS status file, persists it, and exits 0" {
  run_wrapper_with PASS
  [ "$status" -eq 0 ]
  [[ "$output" == *"YUBIOS_CHIPSEC_RESULT=PASS"* ]]
  grep -qx 'RESULT=PASS' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
  grep -qE '^TIMESTAMP=[0-9]{4}-[0-9]{2}-[0-9]{2}T' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
  grep -q '^DETAILS=.' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
  grep -qx 'CHIPSEC_SOURCE=in-image' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
  grep -qx 'RESULT=PASS' "$BATS_TEST_TMPDIR/varlib/chipsec-firstboot.status"
  grep -qx 'RESULT=PASS' "$BATS_TEST_TMPDIR/run/chipsec-result"
}

@test "wrapper writes RESULT=WARN on CHIPSEC warnings and exits 0" {
  run_wrapper_with WARN
  [ "$status" -eq 0 ]
  [[ "$output" == *"YUBIOS_CHIPSEC_RESULT=WARN"* ]]
  grep -qx 'RESULT=WARN' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
}

@test "wrapper writes RESULT=WARN when no report is produced and exits 0" {
  run_wrapper_with NOREPORT
  [ "$status" -eq 0 ]
  grep -qx 'RESULT=WARN' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
  grep -q 'treating as inconclusive' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
}

@test "wrapper writes RESULT=FAILED and exits 1" {
  run_wrapper_with FAILED
  [ "$status" -eq 1 ]
  [[ "$output" == *"YUBIOS_CHIPSEC_RESULT=FAILED"* ]]
  grep -qx 'RESULT=FAILED' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
  grep -qx 'RESULT=FAILED' "$BATS_TEST_TMPDIR/varlib/chipsec-firstboot.status"
}

@test "wrapper skips persistence when /var/lib/yubiOS is not writable" {
  run_wrapper_with PASS
  rm -rf "$BATS_TEST_TMPDIR/varlib"
  STUB="$BATS_TEST_TMPDIR/bin"
  PATH="$STUB:$PATH" \
    YUBIOS_RUN_DIR="$BATS_TEST_TMPDIR/run" \
    YUBIOS_CHIPSEC_PERSIST_DIR="$BATS_TEST_TMPDIR/does-not-exist" \
    YUBIOS_CHIPSEC_PORTABLE_MARKER="$BATS_TEST_TMPDIR/no-such-marker" \
    run sh "$WRAPPER"
  [ "$status" -eq 0 ]
  [ ! -e "$BATS_TEST_TMPDIR/does-not-exist/chipsec-firstboot.status" ]
  grep -qx 'RESULT=PASS' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
}

# -- OMN-18: enrollment gate ---------------------------------------------------

@test "enrollment gate is shipped executable-ready with the documented contract" {
  [ -f "$GATE" ]
  run grep -F 'blocking YubiKey enrollment per ADR-024.' "$GATE"
  [ "$status" -eq 0 ]
}

@test "gate: RESULT=PASS exits 0" {
  run_gate_with PASS
  [ "$status" -eq 0 ]
}

@test "gate: RESULT=WARN exits 0 with the warning message" {
  run_gate_with WARN
  [ "$status" -eq 0 ]
  [[ "$output" == *"WARN: CHIPSEC first-boot platform check reported WARN; proceeding with enrollment (review journal for firmware warnings)."* ]]
}

@test "gate: RESULT=FAILED exits 1 with the block message" {
  run_gate_with FAILED
  [ "$status" -eq 1 ]
  [[ "$output" == *"FAIL: CHIPSEC first-boot platform check reported FAILED; blocking YubiKey enrollment per ADR-024."* ]]
}

@test "gate: absent status file (VM / ARM64 skip) exits 0" {
  run_gate_with absent
  [ "$status" -eq 0 ]
}

@test "gate: falls back to the persisted /var/lib status file" {
  local p="$BATS_TEST_TMPDIR/persist.status"
  printf 'RESULT=FAILED\n' > "$p"
  YUBIOS_CHIPSEC_STATE_FILE="$BATS_TEST_TMPDIR/no-such-run-file" \
    YUBIOS_CHIPSEC_PERSIST_FILE="$p" \
    run sh "$GATE"
  [ "$status" -eq 1 ]
}

# -- OMN-18: portable service packaging ---------------------------------------

@test "portable mkosi profile builds a signed-verity portable image" {
  [ -f "$PORTABLE_PROFILE" ] || skip "repo-only file (not shipped in the OS image)"
  run grep -E '^Profile=chipsec-portable$' "$PORTABLE_PROFILE"
  [ "$status" -eq 0 ]
  run grep -E '^Format=portable$' "$PORTABLE_PROFILE"
  [ "$status" -eq 0 ]
  run grep -E '^Verity=signed$' "$PORTABLE_PROFILE"
  [ "$status" -eq 0 ]
  run grep -E '^Output=yubios-chipsec-portable$' "$PORTABLE_PROFILE"
  [ "$status" -eq 0 ]
  run grep -E '^PostInstallationScripts=mkosi.conf.d/chipsec-portable/mkosi.postinst$' "$PORTABLE_PROFILE"
  [ "$status" -eq 0 ]
  [ -f "$PORTABLE_POSTINST" ]
  run grep -F 'build-portable-image.sh" stage' "$PORTABLE_POSTINST"
  [ "$status" -eq 0 ]
}

@test "portable mkosi profile is gated behind [Match] so the base image is unchanged" {
  [ -f "$PORTABLE_PROFILE" ] || skip "repo-only file (not shipped in the OS image)"
  run bash -c "awk '/^\[/{s=\$0} /^Profile=chipsec-portable/{print s}' '$PORTABLE_PROFILE'"
  [ "$output" = "[Match]" ]
}

@test "build-portable-image.sh stage lays down the portable payload" {
  [ -f "$BUILDER" ]
  dest="$BATS_TEST_TMPDIR/root"
  mkdir -p "$dest/usr/lib"
  printf 'ID=fedora\nPORTABLE_PREFIXES=stale\n' > "$dest/usr/lib/os-release"
  YUBIOS_SRC_ROOT="$PWD" run bash "$BUILDER" stage "$dest"
  [ "$status" -eq 0 ]
  [ -f "$dest/usr/lib/systemd/system/yubiOS-chipsec-firstboot.service" ]
  [ -x "$dest/usr/lib/yubiOS/chipsec/run-firstboot-check.sh" ]
  grep -qx 'ID=fedora' "$dest/usr/lib/os-release"
  grep -qx 'PORTABLE_PREFIXES=yubios-chipsec' "$dest/usr/lib/os-release"
  [ "$(grep -c '^PORTABLE_PREFIXES=' "$dest/usr/lib/os-release")" -eq 1 ]
  grep -qx 'ID=_any' "$dest/usr/lib/extension-release.d/extension-release.yubios-chipsec"
  grep -qx 'YUBIOS_CHIPSEC_VERSION=1.13.16' "$dest/usr/lib/extension-release.d/extension-release.yubios-chipsec"
}

@test "build-portable-image.sh rejects unknown commands with exit 2" {
  [ -f "$BUILDER" ]
  run bash "$BUILDER" bogus
  [ "$status" -eq 2 ]
}

@test "wrapper reports CHIPSEC_SOURCE=portable inside the portable image" {
  marker="$BATS_TEST_TMPDIR/extension-release.yubios-chipsec"
  : > "$marker"
  run_wrapper_with PASS
  STUB="$BATS_TEST_TMPDIR/bin"
  PATH="$STUB:$PATH" \
    YUBIOS_RUN_DIR="$BATS_TEST_TMPDIR/run" \
    YUBIOS_CHIPSEC_PERSIST_DIR="$BATS_TEST_TMPDIR/varlib" \
    YUBIOS_CHIPSEC_PORTABLE_MARKER="$marker" \
    run sh "$WRAPPER"
  [ "$status" -eq 0 ]
  grep -qx 'CHIPSEC_SOURCE=portable' "$BATS_TEST_TMPDIR/run/chipsec-firstboot.status"
}

@test "portable drop-in pins a signed-verity RootImage and is opt-in" {
  [ -f "$DROPIN" ]
  run grep -E '^RootImage=/var/lib/portables/yubios-chipsec\.raw$' "$DROPIN"
  [ "$status" -eq 0 ]
  run grep -E '^RootImagePolicy=root=signed:usr=signed\+absent:=absent$' "$DROPIN"
  [ "$status" -eq 0 ]
  run grep -E '^ConditionPathExists=/var/lib/portables/yubios-chipsec\.raw$' "$DROPIN"
  [ "$status" -eq 0 ]
  # Not in a unit search path: in-image execution must be unaffected.
  [ ! -e usr/lib/systemd/system/yubiOS-chipsec-firstboot.service.d ]
  [ ! -e /usr/lib/systemd/system/yubiOS-chipsec-firstboot.service.d/50-portable.conf ]
}

@test "systemd-analyze verify accepts the chipsec unit with the portable drop-in (systemd >= 254)" {
  command -v systemd-analyze >/dev/null 2>&1 || skip "systemd-analyze not installed"
  ver="$(systemd-analyze --version | awk 'NR==1{print $2}')"
  [ "$ver" -ge 254 ] || skip "RootImagePolicy= needs systemd >= 254 (have $ver)"
  root="$(mktemp -d)"
  mkdir -p "$root/usr/lib/systemd/system/yubiOS-chipsec-firstboot.service.d" "$root/var/lib/portables" "$root/usr/lib/yubiOS/chipsec"
  cp "$UNIT" "$root/usr/lib/systemd/system/"
  cp "$DROPIN" "$root/usr/lib/systemd/system/yubiOS-chipsec-firstboot.service.d/50-portable.conf"
  printf '#!/bin/sh\nexit 0\n' > "$root/usr/lib/yubiOS/chipsec/run-firstboot-check.sh"
  chmod +x "$root/usr/lib/yubiOS/chipsec/run-firstboot-check.sh"
  : > "$root/var/lib/portables/yubios-chipsec.raw"
  run systemd-analyze verify --recursive-errors=no --root="$root" usr/lib/systemd/system/yubiOS-chipsec-firstboot.service
  rm -rf "$root"
  [ "$status" -eq 0 ]
}
