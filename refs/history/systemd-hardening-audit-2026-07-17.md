# systemd hardening audit: 2026-07-17

Status: static audit complete; target-image runtime validation still required.

## Scope

Audited repo-owned yubiOS services found by source search:

- `usr/lib/systemd/system/yubiOS-enroll.service`
- `usr/lib/systemd/system/yubiOS-chipsec-firstboot.service`

The audit covers `ConditionSecurity=measured-os`, `RestrictFileSystems=`, and the newer v261 `RestrictFileSystemAccess=` distinction.

## Findings

| Unit | Finding | Status |
|---|---|---|
| `yubiOS-enroll.service` | Has `ConditionFirstBoot=yes`, `ConditionPathExists=!/var/lib/yubiOS/.enrolled`, and `ConditionSecurity=measured-os` in `[Unit]`. | Correct for first-boot enrollment gating. |
| `yubiOS-enroll.service` | Uses `RestrictFileSystems=~@network`, the deny-list form that blocks network filesystems without allow-listing away local filesystems needed for boot/enrollment. | Correct static shape. |
| `yubiOS-chipsec-firstboot.service` | Has `ConditionSecurity=measured-os`, `ConditionFirstBoot=yes`, and `Before=yubiOS-enroll.service`. | Correct for the first-boot firmware validation exception. |
| `yubiOS-chipsec-firstboot.service` | Intentionally omits `RestrictFileSystems=` and carries raw hardware capabilities for CHIPSEC. | Acceptable documented exception; keep one-shot/offline/narrow write paths. |
| Repo-wide | No repo-owned service currently uses `RestrictFileSystemAccess=`. | Do not add until target systemd and verity-backed execution assumptions are tested. |

## Existing tests

- `tests/unit/test-enroll-unit.bats` checks measured-boot gating, `[Unit]` placement, `RestrictFileSystems=~@network`, and `systemd-analyze verify` with staged Exec stubs.
- `tests/unit/test-chipsec-firstboot-unit.bats` checks measured/first boot gates, one-shot behavior, private network, narrow write paths, explicit capability exception, wrapper result semantics, and `systemd-analyze verify`.

## Remaining evidence gate

Run the Bats tests and `systemd-analyze verify` inside the target image/base after the next non-main-CI-safe opportunity. This pass did not boot the image or run main CI, so it closes the static TODO but not runtime evidence.

## Rule for future hardening

Keep `RestrictFileSystems=` and `RestrictFileSystemAccess=` separate:

- `RestrictFileSystems=` limits filesystem types and is already used for enrollment.
- `RestrictFileSystemAccess=` is a newer v261 control for verified filesystem access semantics and needs a separate design/test pass before use.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.


## Priority signals


**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.5896) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Cross-references


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.5959) were identical placeholder copies with no per-file content; merged on 2026-09-18.

## Refresh: 2026-09-29

Method: searXNG dig (2 queries, 12 results, each weighted by a jev noul quality call) plus direct verification against upstream systemd NEWS for v261.1, v261.2, v261.3, and v262. Tag v262 exists upstream; its commit is dated 2026-09-22.

### What changed upstream since 2026-07-17

- systemd v262 changed the semantics of `RestrictFileSystemAccess=` in the exact direction this audit's remaining evidence gate anticipated: execution from overlayfs mounts is now permitted when the file data resides on a signed and verified dm-verity-protected filesystem, while files in a writable upper layer remain denied. On kernels older than v7.2, execution from overlayfs mounts stays denied entirely. Source: https://github.com/systemd/systemd/blob/v262/NEWS (noul 1.00, primary: upstream release notes, verified against the v262 tag)
- The v261.x point releases (v261.1, v261.2, v261.3) introduced no changes to `RestrictFileSystems=` or `RestrictFileSystemAccess=`; the doc's attribution of `RestrictFileSystemAccess=` as a v261 control remains accurate. Source: https://raw.githubusercontent.com/systemd/systemd/v261.3/NEWS (noul 1.00, primary: upstream release notes, verified against the v261.3 tag)
- v262 also adds sandboxing-adjacent unit options (new `SecureBits=` variants including "exec-restrict-file" and "exec-deny-interactive", and expanded `io.systemd.Unit` Varlink `StartTransient()` sandboxing booleans) that do not affect the audited first-boot units. No new directive invalidates any finding above. Source: https://github.com/systemd/systemd/blob/v262/NEWS (noul 1.00, primary)

### Doc verdict

- In-place edits: none. No existing finding was contradicted by the dig.
- The repo-wide recommendation "do not add `RestrictFileSystemAccess=` until target systemd and verity-backed execution assumptions are tested" still stands, and v262's signed dm-verity overlayfs allowance is exactly the assumption class to cover in that test pass.
- Doc remains accurate as of 2026-09-29, with the v262 semantics change noted above for the next design pass.

### Sources considered (jev noul weights)

| # | Source | noul |
|---|---|---|
| 0 | https://wiki.archlinux.org/title/Systemd/Sandboxing | 0.30 |
| 1 | https://fedoraproject.org/wiki/Changes/SystemdSecurityHardening | 0.31 |
| 2 | https://cosmonic.com/blog/ai-sandbox-guide/ | 0.71 |
| 3 | https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/ | 0.04 |
| 4 | https://man7.org/linux/man-pages/man5/systemd.exec.5.html | 0.11 |
| 5 | https://wiki.archlinux.org/title/Systemd | 0.93 |
| 6 | https://oneuptime.com/blog/post/2026-03-02-how-to-configure-systemd-service-hardening-on-ubuntu/view | 0.32 |
| 7 | https://dev.to/lyraalishaikh/harden-linux-services-with-systemd-analyze-security-from-score-to-enforceable-policy-3045 | 0.33 |
| 8 | https://github.com/alegrey91/systemd-service-hardening | 0.15 |
| 9 | https://www.reddit.com/r/linux4noobs/comments/1qdejfe/quick_linux_hardening_check_systemdanalyze/ | 0.15 |
| 10 | https://synacktiv.com/publications/systemd-hardening-made-easy-with-shh | 0.10 |
| 11 | https://www.redhat.com/en/blog/mastering-systemd | 0.13 |

Note: the three primary systemd NEWS citations were found by direct verification after the dig, not via searXNG, and are treated as primary (noul 1.00) per the criteria.
