#!/usr/bin/env bats
# Unit tests for tests/verify-package-floors.sh (OMN-41 / B-PINS).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  if [ ! -f "$REPO_ROOT/PINNED.md" ] && [ -f "/PINNED.md" ]; then
    REPO_ROOT=""
  fi
}

@test "verify-package-floors.sh is executable and passes static PINNED.md lockstep check" {
  if [ ! -f "${REPO_ROOT}/PINNED.md" ]; then
    skip "PINNED.md not mounted in container root"
  fi
  [ -x "${REPO_ROOT}/tests/verify-package-floors.sh" ]
  run "${REPO_ROOT}/tests/verify-package-floors.sh"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: Containerfile matches PINNED.md"* ]]
}
