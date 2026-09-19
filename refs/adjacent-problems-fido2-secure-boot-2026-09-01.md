# Adjacent problems: YubiKey FIDO2 at the boot boundary

Date: 2026-09-01. Axis: NSS 6/12 Adjacent problems. Origin: SOS Agent FIT #10 lens
`L4-NSS-Adjacent_problems`; one of five files filling the empty cell at z-band 0 /
phi-sector 3. Nearest neighbours: `refs/decisions-deferrals-rejected-models-2026-07-25.md`,
`.github/workflows/ci_test_bootc-filesystem.yml`.

## Lens

```
L4d -- fido2-secure-boot
  hypothesis:  the YubiKey-at-every-boundary decision is stated as the byline ("No TPM. No
               OEM.") but the adjacent unlock models it beat are scattered across ADR-003,
               ADR-008, ADR-009 and the LUKS2 skill rather than compared in one place
  method:      name the family (owner-held root of trust), 4 alternatives, rejection
               criteria, flip conditions, boundary with the identity family
  parameters:  {axis: adjacent_problems, total: 18/20}
  delta:       {adj_gaps_before: 5, adj_gaps_after: 1, dim_closed: 4, family_named: true,
                alternatives_count: 4}
  verdict:     YES (measured 2026-09-02, FIT #11 vs FIT #10, same basis)
  score:       44
  measured:    {pole_shift_geodesic: 0.2807 rad (predicted 0.1892), occupied: 24 -> 25 (+1, as
               predicted), isolated: 8 -> 8 (predicted +1; five co-located docs are not
               isolated from each other), holdout_r2: 0.9986 -> 0.9977 (-0.0009, predicted
               -0.0024), holes_on_curve: 15 -> 14, cell_hit: z0/phi3 at [0.4169, -0.2122,
               -0.8838] for all five files, PR #227}
  caveat:      hardware-leg evidence is the rock1 run 30697269619 (Issue #20 closed
               2026-08-01); ARM64 Path A on a burned RK3588 is still Backlog (OMN-141)
```

## Focal problem

A YubiKey is the only anchor at four boot-time boundaries: PIV slot 9c signs the UKI that
Secure Boot verifies; `systemd-cryptenroll --fido2-device` binds the LUKS2 root to an
hmac-secret credential; `systemd-homed` binds the LUKS2 home the same way; `pam-u2f` gates
login. Remove the key and the machine boots to a locked disk, which is the intended failure.

## Problem family

Family: **owner-held root of trust**. Boundary with **cryptographic identity** (who is this
user to a remote service): identity is about proving *who* to *someone else*; the boot
boundary is about proving *authorisation* to *the machine itself*. The same YubiKey serves
both, which is why the two are easy to confuse and why this file draws the line.

## Alternative solutions and why not

1. **TPM2-sealed LUKS2** (`systemd-cryptenroll --tpm2-device`, PCR policy). Relation:
   *alternative*. Rejected: the secret is sealed to a chip the owner cannot rotate; a PCR
   change (firmware update) bricks unlock unless a recovery key exists, which reintroduces a
   password. Prior art: systemd-cryptenroll(1); 0pointer "Unlocking LUKS2 volumes with
   TPM2, FIDO2, PKCS#11" (2020).
2. **PKCS#11 (PIV) LUKS2 unlock** using the same YubiKey's 9a slot. Relation: *substitution*.
   Rejected for disk unlock, kept for signing: PIV needs a PIN at every boot and an RSA/EC
   decrypt; FIDO2 hmac-secret needs a touch and no PIN, and is what homed already expects.
   Prior art: ADR-003 vs ADR-008 split.
3. **Passphrase only.** Relation: *alternative*. Rejected: the anchor becomes something the
   owner can be compelled to say. Kept as the documented recovery path.
4. **Network-bound disk encryption** (Tang/Clevis). Relation: *alternative*. Rejected: the
   anchor becomes a server, and a server is an OEM by another name for a laptop.
   Prior art: latchset/clevis README.

## Related problems

- **Verification chain** (`refs/adjacent-problems-verification-chain-2026-09-01.md`).
  Relation: *prerequisite*: the FIDO2 unlock runs inside an initrd whose signature slot 9c
  already vouched for.
- **Container isolation of the CI test leg**: the FIDO2 end-to-end test runs in a `bcvk` VM
  with either a software authenticator or a real key passed through USB
  (`hw-device-and-allow-real-u2f` playbook). Relation: *analogy*: the VM boundary stands in
  for the machine boundary.
- **Rootless privilege at enrol time**: enrolment is the one root moment. Relation:
  *intersection*.

## Flip conditions

TPM2 would be admitted as a *second* factor (never the sole one) if a board shipped a
discrete TPM with an owner-resettable endorsement hierarchy. The passphrase recovery path
would be removed only after two independent YubiKeys are enrolled per machine, which is the
multi-key quorum item in the yubikey-operations skill.

## Curve placement

Coverage: verification chain, rootless privilege (enrol moment), corpus/curve (this cell),
YubiKey FIDO2 boot (focal), container isolation (the VM test boundary). Omitted clusters are
omitted so that the file lands in the target cell rather than on the pole.

## 2026-09-18 drift check (wayfinder round 8, cycle 55)

fido2-secure-boot record: the hardware-leg proof point (OMN-42/89) landed after this doc was written; its flip conditions are closer to satisfied than at write time.
