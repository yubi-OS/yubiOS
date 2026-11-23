--------------------------- MODULE YubiOSEnrollAttest ---------------------------
(*
 * Protection-Switch Formal Model of the yubiOS Enrollment & Mutual StrongBox
 * Attestation State Machine (modeled on Christian Brauner's brauner/linux-formal
 * switch-negation discipline and skills/tlaplus/SKILL.md).
 *
 * Every security gate in the enrollment/boot/attestation chain is parameterized
 * by a boolean protection switch:
 *   - SwitchChipsecGate:         ADR-024 first-boot CHIPSEC firmware check
 *   - SwitchSetupModeCheck:      enroll-sb.sh UEFI SetupMode/PK ownership gate
 *   - SwitchComposefsDigestCheck: ADR-032/034 UKI embedded composefs digest match
 *   - SwitchFido2PinTouch:       ADR-001/003 FIDO2 PIN + physical touch presence
 *   - SwitchFtpmQuoteBind:       PR #330 mutual fTPM + YubiKey StrongBox quote bind
 *
 * With all 5 switches TRUE, the invariant AttestedImpliesFullHardwareChain holds
 * across all reachable states. With any single switch FALSE, a negated-goal trace
 * reaches Phase = "MutualAttested" with an unverified trust boundary.
 *)
EXTENDS Naturals, Bool

CONSTANTS
    SwitchChipsecGate,
    SwitchSetupModeCheck,
    SwitchComposefsDigestCheck,
    SwitchFido2PinTouch,
    SwitchFtpmQuoteBind

VARIABLES
    phase,
    firmwareClean,
    pkEnrolled,
    composefsVerified,
    fido2TouchPresent,
    ftpmQuoteValid

vars == <<phase, firmwareClean, pkEnrolled, composefsVerified, fido2TouchPresent, ftpmQuoteValid>>

Phases == {
    "UnenrolledBoot",
    "ChipsecChecked",
    "SecureBootEnrolled",
    "ComposefsMounted",
    "LuksFido2Unlocked",
    "MutualAttested"
}

TypeOK ==
    /\ phase \in Phases
    /\ firmwareClean \in BOOLEAN
    /\ pkEnrolled \in BOOLEAN
    /\ composefsVerified \in BOOLEAN
    /\ fido2TouchPresent \in BOOLEAN
    /\ ftpmQuoteValid \in BOOLEAN

Init ==
    /\ phase = "UnenrolledBoot"
    /\ firmwareClean \in BOOLEAN
    /\ pkEnrolled \in BOOLEAN
    /\ composefsVerified \in BOOLEAN
    /\ fido2TouchPresent \in BOOLEAN
    /\ ftpmQuoteValid \in BOOLEAN

PassChipsec ==
    /\ phase = "UnenrolledBoot"
    /\ (SwitchChipsecGate => firmwareClean = TRUE)
    /\ phase' = "ChipsecChecked"
    /\ UNCHANGED <<firmwareClean, pkEnrolled, composefsVerified, fido2TouchPresent, ftpmQuoteValid>>

EnrollSecureBoot ==
    /\ phase = "ChipsecChecked"
    /\ (SwitchSetupModeCheck => pkEnrolled = TRUE)
    /\ phase' = "SecureBootEnrolled"
    /\ UNCHANGED <<firmwareClean, pkEnrolled, composefsVerified, fido2TouchPresent, ftpmQuoteValid>>

MountComposefs ==
    /\ phase = "SecureBootEnrolled"
    /\ (SwitchComposefsDigestCheck => composefsVerified = TRUE)
    /\ phase' = "ComposefsMounted"
    /\ UNCHANGED <<firmwareClean, pkEnrolled, composefsVerified, fido2TouchPresent, ftpmQuoteValid>>

UnlockLuksFido2 ==
    /\ phase = "ComposefsMounted"
    /\ (SwitchFido2PinTouch => fido2TouchPresent = TRUE)
    /\ phase' = "LuksFido2Unlocked"
    /\ UNCHANGED <<firmwareClean, pkEnrolled, composefsVerified, fido2TouchPresent, ftpmQuoteValid>>

CompleteMutualAttest ==
    /\ phase = "LuksFido2Unlocked"
    /\ (SwitchFtpmQuoteBind => ftpmQuoteValid = TRUE)
    /\ phase' = "MutualAttested"
    /\ UNCHANGED <<firmwareClean, pkEnrolled, composefsVerified, fido2TouchPresent, ftpmQuoteValid>>

StutterDone ==
    /\ phase = "MutualAttested"
    /\ UNCHANGED vars

Next ==
    \/ PassChipsec
    \/ EnrollSecureBoot
    \/ MountComposefs
    \/ UnlockLuksFido2
    \/ CompleteMutualAttest
    \/ StutterDone

Spec == Init /\ [][Next]_vars

AttestedImpliesFullHardwareChain ==
    (phase = "MutualAttested") =>
        (firmwareClean /\ pkEnrolled /\ composefsVerified /\ fido2TouchPresent /\ ftpmQuoteValid)

=============================================================================
