#!/usr/bin/env bats
# Unit tests for tests/verify-package-floors.sh (OMN-41 / B-PINS & OMN-149 UAPI.6 lex-sort).

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/../verify-package-floors.sh"
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  if [ ! -f "$REPO_ROOT/PINNED.md" ] && [ -f "/PINNED.md" ]; then
    REPO_ROOT="/"
  fi
}

@test "verify-package-floors.sh is executable and passes static PINNED.md lockstep and UAPI.6 drop-in checks" {
  if [ ! -f "${REPO_ROOT%/}/PINNED.md" ]; then
    skip "PINNED.md not mounted in container root"
  fi
  [ -x "$SCRIPT" ]
  YUBIOS_REPO_ROOT="${REPO_ROOT%/}" run "$SCRIPT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: Containerfile matches PINNED.md"* ]]
  [[ "$output" == *"PASS: UAPI.6 drop-in lexicographic ordering invariants verified"* ]]
}

@test "verify-package-floors.sh rejects numeric 53-yubiOS-no-static-vfio.conf that sorts before static-nodes-permissions.conf" {
  local fake_root="${BATS_TEST_TMPDIR}/bad-repo"
  mkdir -p "$fake_root/usr/lib/tmpfiles.d"
  cp "${REPO_ROOT%/}/PINNED.md" "$fake_root/PINNED.md"
  cp "${REPO_ROOT%/}/Containerfile" "$fake_root/Containerfile"
  cp "${REPO_ROOT%/}/yubiOS-bake.hcl" "$fake_root/yubiOS-bake.hcl"
  touch "$fake_root/usr/lib/tmpfiles.d/53-yubiOS-no-static-vfio.conf"
  YUBIOS_REPO_ROOT="$fake_root" run "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"UAPI.6 lex-sort violation"* ]]
}
