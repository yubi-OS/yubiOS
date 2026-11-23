# Mode axis: FIDO2 unlock at boot, the one interactive step

Date: 2026-09-01. Axis: NSS 4/12 Mode. Origin: SOS Agent FIT #11 lens `L1-NSS-Mode`
(cell z-band 1 / phi-sector 2, ring 7); one of four files filling the cell for the
`baseline=11` comparison rerun.

## Lens

```
L1c -- fido2-boot-unlock-mode
  hypothesis:  the FIDO2 unlock is documented as a mechanism (hmac-secret, LUKS2 token
               slot) but its MODE (interactive touch in the initrd, timeout, fallback to
               passphrase, unattended reboot behaviour) is what an operator needs
  method:      state the mode for each boundary where the key is used: disk unlock, home
               unlock, PAM login, CI emulation
  parameters:  {axis: mode, interactive: 2, timeout: 2, fallback: 2, unattended: 2,
                exit_semantics: 2, idempotency: 1, dry_run: 1, total: 12/14}
  delta:       {mode_gaps_before: 5, mode_gaps_after: 1}
  verdict:     YES
  score:       40
  caveat:      the unattended-reboot answer (no unlock, machine waits) is policy, not yet
               an integration test
```

## Boundaries and their modes

| Boundary | Mode | Timeout | Fallback | Unattended reboot |
|---|---|---|---|---|
| LUKS2 root unlock (`systemd-cryptsetup`, initrd) | interactive: touch the U2F/HSM | `fido2-device` token retries then falls to passphrase prompt | passphrase (documented recovery) | waits forever; by design there is no network or TPM path |
| `systemd-homed` home unlock | interactive at login | homed's own prompt loop | passphrase if enrolled | home stays locked; system services unaffected |
| `pam-u2f` login gate | interactive | PAM module timeout | second enrolled key, then denial | n/a |
| CI end-to-end (`bcvk` VM) | non-interactive | software authenticator answers instantly | none; failure is a test failure | n/a; test is one-shot |
| rock1 hardware leg (run 30697269619) | non-interactive with a real key passed through USB | key touch policy set to off for CI | none | n/a |

## Exit semantics and idempotency

Unlock is idempotent in the only sense that matters: presenting the same key to the same
LUKS2 token slot yields the same volume key every time, so a failed touch followed by a
successful one leaves no partial state. `systemd-cryptsetup` exits non-zero only when every
enrolled method has failed; a single method failing is a log line, not an exit.

## Why this is the interactive exception

Every other boot-time control in yubiOS runs as a one-shot or a daemon with no human in
the loop (see the attestation and measurement mode file). The U2F/HSM touch is the single
place where boot waits for a person. That is the product decision: a machine that cannot
be unlocked remotely cannot be unlocked by an attacker remotely either. The rootless,
capability-bounded services that start afterwards never see the key; the Linux container
and seccomp isolation applied to them is what keeps the key's job to the boot boundary.

## Placement

Coverage: continuous attestation and measurement (the daemons that follow unlock), rootless
privilege and capabilities (post-unlock services), U2F/HSM FIDO2 boot (focal), container
isolation and seccomp (post-unlock boundary). Omitted clusters omitted by design.
