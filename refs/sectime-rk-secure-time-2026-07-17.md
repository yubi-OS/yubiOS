# SecTime RK secure-time evidence: 2026-07-17

Status: research/design complete; RK3399/RK3588 hardware evidence still required.

## Goal

Define what yubiOS can safely claim about secure-world time on the Rockchip ARM64 path before any ADR, policy, or owner-facing security text depends on it.

## Source evidence

| Area | Evidence | Source |
|---|---|---|
| OP-TEE secure clock contract | OP-TEE's porting guide distinguishes REE time from system/TA persistent time and requires the protection level to reflect whether the clock is REE-controlled (`100`) or TEE-controlled (`1000`). | https://optee.readthedocs.io/en/3.19.0/architecture/porting_guidelines.html#secure-clock |
| TEE-controlled ARM counter source | `core/arch/arm/kernel/sub.mk` builds `tee_time_arm_cntpct.c` when `CFG_SECURE_TIME_SOURCE_CNTPCT=y`; that implementation reads the ARM counter/timer and reports protection level `1000`. | https://github.com/OP-TEE/optee_os/blob/afaebfcc6a21c87a6c924c40df2940f2b4c21d1d/core/arch/arm/kernel/sub.mk and https://github.com/OP-TEE/optee_os/blob/afaebfcc6a21c87a6c924c40df2940f2b4c21d1d/core/arch/arm/kernel/tee_time_arm_cntpct.c |
| REE-backed fallback | `tee_time_ree.c` uses REE time, clamps rollback within a boot, and reports protection level `100`, so it is not enough for yubiOS secure-time claims. | https://github.com/OP-TEE/optee_os/blob/afaebfcc6a21c87a6c924c40df2940f2b4c21d1d/core/kernel/tee_time_ree.c |
| TF-A handoff | TF-A documents loading OP-TEE as BL32 during boot as the recommended platform technique; post-boot SMC loading can be insecure depending on platform configuration. | https://trustedfirmware-a.readthedocs.io/en/v2.11/components/spd/optee-dispatcher.html |
| Linux interface | The Linux OP-TEE driver communicates with OP-TEE over the ARM SMCCC/SMC OP-TEE protocol and message protocol. | https://docs.kernel.org/tee/op-tee.html |

## Safe claims

Until a real RK3399/RK3588 firmware build proves `CFG_SECURE_TIME_SOURCE_CNTPCT=y` in the active OP-TEE platform config and boots OP-TEE as BL32 through TF-A `SPD=opteed`, yubiOS should not claim secure-world time. It may only say the design target is TEE-controlled time.

After that proof, the safe claim is narrow: TEE-controlled monotonic-ish elapsed time within a boot, resistant to normal-world wall-clock tampering. It is not an absolute wall clock, not a reboot or power-loss anti-rollback counter, and not sufficient freshness for remote attestation or lockout recovery by itself.

Suspend/resume must be measured per board. If CNTPCT continuity differs across suspend states, ADR language must name the supported suspend state or avoid relying on secure-time continuity across suspend.

## Smoke test design

Add a tiny OP-TEE TA plus Linux client that:

1. Reads `TEE_GetSystemTime()` and the system-time protection level from secure world.
2. Sleeps in normal world and verifies the second secure-world read is not earlier than the first.
3. Attempts to move REE wall-clock time backward and verifies secure-world time does not follow it.
4. Repeats after a suspend/resume cycle on ROCK 5B/RK3588 and ROCKPro64/RK3399.
5. Records TF-A/OP-TEE build refs, `CFG_SECURE_TIME_SOURCE_CNTPCT`, `SPD=opteed`, board, kernel version, and pass/fail logs in `refs/`.

Expected pass for Path A: protection level `1000`, monotonic reads during the tested boot, and no dependence on REE wall-clock changes. Expected non-claim areas: reboot/power-loss rollback and remote freshness.

## ADR coverage

Future ADR language should separate:

- Decisions allowed to use secure-world elapsed time: same-boot ordering, telemetry timestamps marked as TEE-elapsed, and Frost event sequencing.
- Decisions that require stronger state: lockout persistence, owner recovery cooldowns, anti-rollback, remote attestation freshness, and anything crossing reboot or power loss. Those need RPMB/fTPM NV counters, sealed state, or verifier freshness.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Declarative policy coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.
