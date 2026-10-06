# systemd v262 interface audit - 2026-07-14

Status: completed for `feat/systemd-v262-audit`.
Scope: close the TODO.md audit for `/run/boot-loader-entries/`, the experimental `systemd-sysupdated` D-Bus API, and `updatectl` assumptions before adopting systemd v262 packages or docs.

## Upstream check

- `systemd` `NEWS` currently contains `CHANGES WITH 262`, including `systemd-sysupdate` unit changes: `systemd-sysupdate.service` and `systemd-sysupdate.timer` are renamed to `systemd-sysupdate-update.service` and `systemd-sysupdate-update.timer`, with compatibility symlinks, and a new `systemd-sysupdate@.service` for Varlink activation. (Confirmed 2026-09-29: these renames shipped in the v262 stable release, tag `v262` published 2026-09-22.)
- The v261 notes announced that v262 removes support for the compatibility directory `/run/boot-loader-entries/` and related interfaces. UAPI.1 Boot Loader Specification support remains. (Updated 2026-09-29: the removal did NOT ship in v262. The v262 NEWS announcement, echoed in the `CHANGES WITH 263 in spe` section, now reads "With the future v263 release we intend to remove support for /run/boot-loader-entries/ and related interfaces". UAPI.1 support remains in place.)
- The v261 notes announced removal of the experimental `systemd-sysupdated` D-Bus API. Clients are expected to talk directly to `systemd-sysupdate` via Varlink IPC, and `updatectl` is being reworked around that direction. (Updated 2026-09-29: the D-Bus removal also slipped to the next release: v262 NEWS states the experimental `systemd-sysupdated` D-Bus API "is going to be removed in the next release (v263)". `systemd-sysupdated` still ships in v262, and v262 changed the JSON payload returned by its `DescribeFeature()` method. The Varlink / `updatectl` rework direction is unchanged.)

## Repo audit

Searches were grouped around the three risky assumptions:

- `/run/boot-loader-entries/`, `boot-loader-entries`, and `boot loader entries`: only `TODO.md` and `refs/research-refresh-2026-07-11.md` mention the removal target directly. `SPEC.md` references the Boot Loader Specification generically, not the removed runtime compatibility directory.
- `systemd-sysupdated`, `sysupdated`, and `D-Bus`: only `TODO.md` and `refs/research-refresh-2026-07-11.md` mention the removed API directly.
- `updatectl`: only `TODO.md` and `refs/research-refresh-2026-07-11.md` mention it directly.
- `systemd-sysupdate` / `sysupdate`: `README.md`, `ADR.md`, and `ARCHITECTURE.md` describe the sysupdate backend/model. No repo code, workflow, or documented command path depends on `systemd-sysupdated` D-Bus or `updatectl`.

## Result

No code or workflow change is required for these v262 removals. Current docs are safe as long as they keep describing:

- UAPI.1 / Boot Loader Specification behavior, not `/run/boot-loader-entries/` compatibility injection.
- `systemd-sysupdate` as the backend/tooling model, not `systemd-sysupdated` D-Bus.
- Future client integration through Varlink, not `updatectl`, unless `updatectl` is re-audited after its v262 rework.

## Follow-up guardrails

- If yubiOS adds host-update units or timers after v262 adoption, prefer the v262 `systemd-sysupdate-update.service` / `.timer` names or explicitly verify the compatibility symlinks on the pinned base image.
- Keep future update UX docs explicit about whether they are using bootc CLI, `systemd-sysupdate`, a Varlink client, or a re-audited `updatectl` flow.

## Sources

- https://raw.githubusercontent.com/systemd/systemd/main/NEWS
- https://github.com/systemd/systemd/releases
- https://www.freedesktop.org/software/systemd/man/systemd-sysupdate.html
- https://www.freedesktop.org/software/systemd/man/latest/systemd-sysupdated.html


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Refresh: 2026-09-29

Method: searXNG dig (2 queries, 6 results each, jev-weighted), plus direct verification against upstream `NEWS` (raw.githubusercontent.com/systemd/systemd/main/NEWS, fetched 2026-09-29) and the GitHub releases API.

### What changed upstream since 2026-07-14

- systemd v262 went stable. Tag `v262` published 2026-09-22T13:19:16Z per the GitHub releases API. Source: https://api.github.com/repos/systemd/systemd/releases/latest (noul 0.85). Corroborated by Linux Journal, which reports the final release was tagged on September 22, 2026 after three RCs: https://www.linuxjournal.com/content/systemd-262-released-static-pid-1-intel-tdx-tpm-improvements-and-new-container-features (noul 0.83 / 0.03) and Phoronix: https://www.phoronix.com/news/systemd-262 (noul 0.24).
- The doc's assumption that v262 removes `/run/boot-loader-entries/` did NOT hold. The v262 NEWS section still carries the removal as a future announcement, reworded to: "With the future v263 release we intend to remove support for /run/boot-loader-entries/ and related interfaces." The `CHANGES WITH 263 in spe:` section repeats it and its own "Feature Removals and Incompatible Changes" list is still empty. Source: https://raw.githubusercontent.com/systemd/systemd/main/NEWS (noul 0.85). This is a deadline slip from v262 to v263, verified directly against NEWS.
- Same slip for the `systemd-sysupdated` D-Bus API: v262 NEWS states "The experimental systemd-sysupdated D-Bus API is going to be removed in the next release (v263)". `systemd-sysupdated` still ships in v262, and v262 changed the JSON payload returned by its `DescribeFeature()` method and by `systemd-sysupdate features`. The Varlink direction and the `updatectl` rework are unchanged. Source: NEWS (noul 0.85).
- The v262 sysupdate unit renames DID land as the doc described: `systemd-sysupdate.service` / `.timer` renamed to `systemd-sysupdate-update.service` / `.timer` with compatibility symlinks, plus the new `systemd-sysupdate@.service` for Varlink activation. Also new in v262: `systemd-sysupdate` gained `enable-feature` / `disable-feature` and `enable-component` / `disable-component` commands (previously updatectl-only frontend operations, now in the backend service), a component/feature "suggestion" concept, a persistent database of downloaded-but-unmatched updates, and `systemd-sysupdate-notify-bootctl.socket` / `systemd-sysupdate-notify-pcrlock.socket` completion notification units. Source: NEWS (noul 0.85).
- v263 is not released. Milestone v263 (#40) schedules RC1 2026-11-19, RC2 2026-11-26, RC3 2026-12-03, RC4 2026-12-10: https://github.com/systemd/systemd/milestone/40 (noul 0.23). Context on the adjacent releases: v261 stable shipped 2026-06 with the new `systemd-sysinstall` installer (https://www.phoronix.com/news/systemd-261, noul 0.82), v260 shipped 2026-03 with `systemd-mstack` and SysV script removal (https://www.phoronix.com/news/systemd-260-Released, noul 0.22).

### Net effect on the repo audit

The 2026-07-14 conclusion stands unchanged in substance, with a moved deadline: yubiOS must still keep docs describing UAPI.1 / Boot Loader Specification behavior, `systemd-sysupdate` as the backend model, and Varlink clients rather than the `systemd-sysupdated` D-Bus API or `updatectl`. The removal of `/run/boot-loader-entries/` and of the `systemd-sysupdated` D-Bus API is now scheduled for v263 (RC1 2026-11-19), not v262. The follow-up guardrails should be re-read with v263 as the danger horizon; re-audit when v263 RC1 nears.

Corrections made in place: the second and third "Upstream check" bullets now carry dated (2026-09-29) annotations reflecting the v262-to-v263 deadline slip. No other existing analysis was altered.

### Sources considered (jev noul weights)

Weighting model: typesafe/jev-1.13-20260917, one batched request over all 12 results, task_id tada95cc-55f5-4b4c-9e4d-5881a24246b6, cost 0.000243432. Scale: closer to 1.0 = more authoritative.

| # | Query | Source | noul |
|---|---|---|---|
| 0 | q1 | systemd/systemd Releases (github.com/systemd/systemd/releases) | 0.85 |
| 1 | q1 | Linux Journal: systemd 262 released | 0.83 |
| 2 | q1 | systemd milestone v263 (#40) | 0.23 |
| 3 | q1 | systemd milestones index | 0.72 |
| 4 | q1 | TikTok "Minecraft Bedrock Patch Vs 2644" (off-topic noise) | 0.53 |
| 5 | q1 | Unit42 npm supply chain report (off-topic) | 0.01 |
| 6 | q2 | Linux Journal: systemd 262 released (duplicate of #1) | 0.03 |
| 7 | q2 | Phoronix: systemd 262 | 0.24 |
| 8 | q2 | systemd/systemd Releases (duplicate of #0) | 0.25 |
| 9 | q2 | Phoronix: systemd 261 | 0.82 |
| 10 | q2 | Phoronix: systemd 260 | 0.22 |
| 11 | q2 | NixOS 26.05 announcement | 0.23 |

Additional primary sources used beyond the dig (fetched directly, not search-indexed): systemd `NEWS` at https://raw.githubusercontent.com/systemd/systemd/main/NEWS and the GitHub releases API https://api.github.com/repos/systemd/systemd/releases/latest. Both are primary upstream sources and treated at the top quality tier.
