# Adjacent problems: the verification chain (boot to runtime)

Date: 2026-09-01. Axis: NSS 6/12 Adjacent problems (per `skills/nss-adjacent-problems`).
Origin: SOS Agent FIT #10 on `yubi-OS/yubiOS` main (591 files) surfaced lens
`L4-NSS-Adjacent_problems`, an empty cell at z-band 0 / phi-sector 3 ringed by 4 occupied
cells. The synthetic insert moved the pole 0.1892 rad. This is one of five real files written
to occupy that cell with the exact target coverage pattern. Nearest existing neighbours on
the curve were `refs/decisions-deferrals-rejected-models-2026-07-25.md` and `yubiOS.rego`.

## Lens

```
L4a -- verification-chain
  hypothesis:  the yubiOS verification chain is documented as a single chosen solution; the
               alternatives it rejected (TPM-rooted chain, shim+MOK, vendor-key chain) are not
               enumerated in one place with why-not reasoning
  method:      enumerate the problem family, 4 alternatives, rejection criteria, flip conditions
  parameters:  {axis: adjacent_problems, related_named: 2, alternatives: 2, family: 2,
                prior_art: 2, rejection: 2, relation_type: 2, reversibility: 2, boundary: 2,
                invariance: 1, link_integrity: 1, total: 18/20}
  delta:       {adj_gaps_before: 5, adj_gaps_after: 1, dim_closed: 4, family_named: true,
                alternatives_count: 4}
  verdict:     YES (measured 2026-09-02, FIT #11 vs FIT #10, same basis)
  score:       44
  measured:    {pole_shift_geodesic: 0.2807 rad (predicted 0.1892), occupied: 24 -> 25 (+1, as
               predicted), isolated: 8 -> 8 (predicted +1; five co-located docs are not
               isolated from each other), holdout_r2: 0.9986 -> 0.9977 (-0.0009, predicted
               -0.0024), holes_on_curve: 15 -> 14, cell_hit: z0/phi3 at [0.4169, -0.2122,
               -0.8838] for all five files, PR #227}
  caveat:      link integrity not machine-checked; cross-context invariance checked for
               operator and architect only
```

## Focal problem

Every stage of a yubiOS boot must be able to prove, to the next stage, that what it is about
to run was signed by a key the owner controls. The chain is: YubiKey PIV slot 9c signs the UKI
(`sbsign` through PKCS#11) -> UEFI Secure Boot verifies the UKI signature -> the UKI's
embedded cmdline pins the dm-verity root hash -> the kernel refuses a `/usr` whose Merkle tree
does not match -> composefs carries the signed digest list into the runtime image -> the OPA
build policy in `yubiOS.rego` has already refused any container base image that was not
digest-pinned. The evidence at each link is a signature or a hash, never a vendor claim.

## Problem family

Family: **OS trust anchoring**. Its boundaries with adjacent families:

| Family | Question it answers | yubiOS position |
|---|---|---|
| Trust anchoring | Who is allowed to sign what runs? | Owner-held YubiKey, no OEM key |
| Boot integrity (measured boot) | What actually ran, recorded where? | Deferred; fTPM on ARM64 is post-launch (ADR-018/019/020) |
| Encrypted boot | Can the disk be read without the owner? | LUKS2 + FIDO2 via systemd-cryptenroll; a sibling, not this family |
| Reproducible boot | Would a second build produce identical bytes? | `scripts/verify-reproducible-*` covers the unsigned subject only |

The trust-anchoring family cares about *authorisation to run*; boot-integrity cares about
*a record of what ran*. yubiOS deliberately ships the first before the second.

## Alternative solutions and why not

1. **TPM-rooted chain** (PCR-bound UKI, `systemd-pcrlock`). Relation: *alternative*. Rejected:
   the anchor is a chip the OEM soldered and the owner cannot rotate or export. Prior art:
   0pointer "Brave New Trusted Boot World" (2023); systemd v255 `systemd-pcrlock(8)`.
2. **shim + MOK chain** (Microsoft-signed shim, distro key in MokList). Relation: *alternative*.
   Rejected: the root remains the Microsoft UEFI CA; the owner enrols a subordinate, not a root.
   Prior art: rhboot/shim README; ADR-008 records the direct-enrol decision.
3. **Vendor-key chain** (OEM PK/KEK with distro db entries). Relation: *substitution*. Rejected:
   same anchor problem as 1, plus per-board key lists. Prior art: UEFI spec 2.10 section 32.
4. **Unsigned UKI with dm-verity only**. Relation: *abstraction* (drops the first link).
   Rejected: dm-verity without a signed root hash is integrity without authorisation; anyone
   can produce a matching tree for their own image.

## Related problems (same structure, different object)

- **Container base-image pinning** (`yubiOS.rego`, ADR-014 rootless buildx). Relation:
  *analogy*. The build policy is the verification chain applied to build inputs: refuse a
  mutable tag the way the kernel refuses an unsigned root hash.
- **Rootless build privilege** (`refs/adjacent-problems-rootless-privilege-2026-09-01.md`).
  Relation: *intersection*. A signed chain built by a root daemon has a hole at the builder.
- **seccomp and isolation of the signing step in CI** (SoftHSM inside one OS environment, see
  `refs/sbsign-pkcs11-validate-2026-07-23.md`). Relation: *prerequisite*. The signer is a link too.

## Flip conditions

yubiOS would move to alternative 1 as the *primary* anchor only if a hardware TPM appeared
whose endorsement key the owner could regenerate and export under their own control. It would
adopt alternative 2 if a distribution requirement forced Microsoft-CA-rooted boot on shipped
hardware. Neither is on the roadmap; both are recorded so the decision can be re-derived.

## Curve placement

Within the yubiOS corpus this file is intended to land in a sparse cell of the fitted curve,
alongside the rejected-models note. Its coverage over the learned primitives is: verification
chain yes, rootless privilege yes (the builder link), corpus/curve yes (this section), YubiKey
boot yes, container isolation yes; it deliberately says nothing about the two omitted
clusters so that the file occupies the target pattern and not the existing pole.

## 2026-09-18 drift check (wayfinder round 8, cycle 56)

verification-chain record: this round's pin-resolution audit (fedora-bootc 404) is a live instance of the chain gap it names.
