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
    tests/vm/test-policy-rejection.sh \
    tests/vm/test-gp-tee-pp-conformance-ci.sh \
    tests/vm/verify-gp-tee-xtest-guest.sh \
    tests/vm/test-x86_64-setup-mode-e2e-ci.sh; do
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

@test "test-gp-tee-pp-conformance-ci.sh verifies GlobalPlatform TEE PP (EAL2+ / AVA_VAN_AP.3) SMC, RPMB, and StandaloneMM boundaries" {
  run "${REPO_ROOT}/tests/vm/test-gp-tee-pp-conformance-ci.sh" --self-test --repo-root "$REPO_ROOT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: all 4 GlobalPlatform TEE PP (EAL2+ / AVA_VAN_AP.3) conformance self-test legs verified"* ]]
}

@test "test-x86_64-setup-mode-e2e-ci.sh verifies x86_64 UEFI SetupMode=1 flash, enroll-sb, and amd64 local OCI commit" {
  run "${REPO_ROOT}/tests/vm/test-x86_64-setup-mode-e2e-ci.sh" --self-test --repo-root "$REPO_ROOT"
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: all 3 x86_64 UEFI Setup-Mode flash, enroll, sign & local-OCI legs verified"* ]]
}

@test "verify-tpm0-pcr-extend.sh --self-test verifies TPM2_ReadClock monotonicity and rejects stalled/unsafe clock" {
  run "${REPO_ROOT}/tests/vm/verify-tpm0-pcr-extend.sh" --self-test
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: verify-tpm0-pcr-extend.sh TPM2_ReadClock self-test verified"* ]]
}

@test "YubiOSEnrollAttest protection-switch model and io.yubios.Attest Varlink/WIMSE self-test pass" {
  run python3 "${REPO_ROOT}/tools/yubios-attest/varlink_wimse.py" --self-test
  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS: YubiOSEnrollAttest 5-switch model"* ]]
}
