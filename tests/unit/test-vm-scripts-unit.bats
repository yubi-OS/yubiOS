#!/usr/bin/env bats
# Unit and negative-path verification for OMN-162 VM security test scripts.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

@test "OMN-162 VM test scripts exist, are executable, and pass bash -n" {
  for s in \
    tests/vm/test-secure-boot-tamper.sh \
    tests/vm/test-oci-tag-channel.sh \
    tests/vm/test-bcvk-passthrough.sh \
    tests/vm/test-policy-rejection.sh; do
    [ -x "${REPO_ROOT}/${s}" ]
    run bash -n "${REPO_ROOT}/${s}"
    [ "$status" -eq 0 ]
  done
}

@test "test-secure-boot-tamper.sh rejects tampered UKI, tampered composefs digest, and foreign ROTPK" {
  run "${REPO_ROOT}/tests/vm/test-secure-boot-tamper.sh" --self-test
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: all 3 negative Secure Boot & composefs tamper legs verified"* ]]
}

@test "test-oci-tag-channel.sh enforces :latest vs :dev channel isolation" {
  run "${REPO_ROOT}/tests/vm/test-oci-tag-channel.sh" --self-test --repo-root "$REPO_ROOT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: OCI tag-channel isolation verified"* ]]
}

@test "test-bcvk-passthrough.sh verifies QEMU VID 0x1050 args and skips with rc=77 without hardware gate" {
  run "${REPO_ROOT}/tests/vm/test-bcvk-passthrough.sh" --verify-args
  [ "$status" -eq 0 ]
  [[ "$output" == *"vendorid=0x1050"* ]]

  run env PATH="/usr/bin:/bin" YUBIOS_PASSTHROUGH_HW=0 "${REPO_ROOT}/tests/vm/test-bcvk-passthrough.sh"
  [ "$status" -eq 77 ]
}

@test "test-policy-rejection.sh rejects mutable tags, unapproved registries, and invalid PKCS#11 URIs" {
  run "${REPO_ROOT}/tests/vm/test-policy-rejection.sh" --repo-root "$REPO_ROOT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: yubiOS.rego build policy and PKCS#11 URI negative rejections verified"* ]]
}
