# Project-Relevant Upstream Progress — 2026-07-21

Status: dated research snapshot; not a replacement for `PINNED.md`

This review covers the upstreams most directly coupled to yubiOS's systemd image, update, boot, and OCI delivery model: `systemd/systemd`, `systemd/mkosi`, `systemd/particleos`, `containers/composefs`, and `bootc-dev/bootc`. It separates merged work from open proposals and records exact snapshot commits so later reviews can reproduce the comparison.

![Bubble map of leading upstream contributors](https://raw.githubusercontent.com/yubi-OS/assets/main/upstream-contributor-bubbles.svg)

## Snapshot and method

| Upstream | Snapshot commit | Human non-merge commits, 2026-04-22 through 2026-07-21 |
|---|---|---:|
| [systemd/systemd](https://github.com/systemd/systemd/tree/eb0326707078a67e0b98341176671f99fbf83ee5) | `eb0326707078a67e0b98341176671f99fbf83ee5` | 2,280 |
| [systemd/mkosi](https://github.com/systemd/mkosi/tree/e1e9eafc87dfd4dcb21d51027d1034daeffc534c) | `e1e9eafc87dfd4dcb21d51027d1034daeffc534c` | 97 |
| [systemd/particleos](https://github.com/systemd/particleos/tree/dd4fdc213cc4884657986efac878849ca6bd4548) | `dd4fdc213cc4884657986efac878849ca6bd4548` | 7 |
| [containers/composefs](https://github.com/containers/composefs/tree/898c741f3889ab30057894a1429cc4c81a2bb7ed) | `898c741f3889ab30057894a1429cc4c81a2bb7ed` | 2 |
| [bootc-dev/bootc](https://github.com/bootc-dev/bootc/tree/18b96d7b24d7f244c53dcb117247534967021cc2) | `18b96d7b24d7f244c53dcb117247534967021cc2` | 170 |

Counts use authored, non-merge commits reachable from each repository's default-branch snapshot in the inclusive UTC window. Obvious bot identities are excluded. Matching display names and unambiguous email aliases are aggregated across repositories. This measures current commit activity, not review, design, issue triage, release engineering, or organizational authority. Small repositories are especially sensitive to the chosen window.

The bubble map shows the 15 highest aggregate human counts; each circle's **area**, not radius, is proportional to authored commits. Color indicates the contributor's dominant upstream in this dataset. Cross-project counts are retained in the labels where relevant.

## What is moving now

### systemd v262: update plumbing, enrollment, and TPM work

The [v262 milestone](https://github.com/systemd/systemd/milestone/39) was 54% complete at the snapshot (46 closed, 39 open), with release candidates scheduled from 2026-08-20 and the final milestone due 2026-09-17. Dates and issue counts are planning state, not release guarantees.

Merged work most relevant to yubiOS includes:

- `systemd-repart` and image dissection gained combined LUKS + Verity handling ([repart commit](https://github.com/systemd/systemd/commit/02cd3fd879531052dbd5a2bd23293cf3c01ad8c2), [dissect commit](https://github.com/systemd/systemd/commit/1423d78dc91de6eb82d5e511e06187a43dde25e3)). This is directly aligned with yubiOS's encrypted mutable state plus verified immutable partitions, but needs target-image testing before adoption.
- Sysupdate is gaining component/feature metadata and broader test coverage ([concept](https://github.com/systemd/systemd/commit/40e727c93b5582ed5e1e550c1cd2b5c35683e10e), [tests](https://github.com/systemd/systemd/commit/b0cf7d60acf24d985092361ac5b0ab6dd95d2351)). The v262 NEWS also records the service/timer rename to `systemd-sysupdate-update.*`, with compatibility symlinks, and a path toward templated Varlink instances.
- Cryptenroll gained a first-boot wizard and a Varlink surface ([wizard](https://github.com/systemd/systemd/commit/0089a46b6bec0d4bbd2157a082f6d3d78576363e), [Varlink](https://github.com/systemd/systemd/commit/0df41e9329d6425fbf422483e29e3f7e2b6a33b8)). These are candidates for simplifying yubiOS enrollment, but neither replaces physical YubiKey recovery testing.
- FIDO2 enrollment now rejects a zero-length HMAC secret ([commit](https://github.com/systemd/systemd/commit/a3bf0f2f860ff9e73c9062d9f3c400bc672496ac)); TPM enrollment gained an Argon2id PIN path ([commit](https://github.com/systemd/systemd/commit/f3fe668cdf71b42485a6a2151d4f025788a35a95)). The former is immediately relevant to negative tests; the latter is background because yubiOS does not use TPM as the sole owner-unlock gate.
- The swtpm service and tests were tightened ([service hardening](https://github.com/systemd/systemd/commit/2f1c3b8afb555fb05925cc284b28a5fa50d02ff9), [test](https://github.com/systemd/systemd/commit/1b1900a6f3162b3f16b6779bdcca9ec0f9aa11e9)), useful for keeping the software-TPM CI layer honest.
- Other relevant merged changes include sysupdate notifications, `bootctl --link-auto`, PCR-lock recomputation, sysext refresh, headless firstboot, and a homed identity fix ([notifications](https://github.com/systemd/systemd/commit/d36bdc946738d0ac3bf059f9f3ef604820f2d461), [bootctl](https://github.com/systemd/systemd/commit/1421e6c5f49e3e54b54109fa2668f79cf451e14b), [pcrlock](https://github.com/systemd/systemd/commit/27b7fb9b2065b4da56f532aca103a04811d70450), [sysext](https://github.com/systemd/systemd/commit/942283288d8860603f7189839577e8d58a258006), [firstboot](https://github.com/systemd/systemd/commit/896fd702ba79648f7e45bd02c0b8dda688581331), [homed](https://github.com/systemd/systemd/commit/0755bb125c04adc945c35dfec3349b48a4430075)).

Two compatibility points in the [v262 NEWS snapshot](https://github.com/systemd/systemd/blob/eb0326707078a67e0b98341176671f99fbf83ee5/NEWS) deserve explicit gates: new TPM-sealed credentials are pinned to the TPM storage-root key and are not readable by older systemd, while older credentials remain accepted; and sysupdate unit names change as described above. Detached PKCS#7 signatures for sysupdate are still an [open draft PR](https://github.com/systemd/systemd/pull/43019), so yubiOS must not describe that proposal as shipped.

### mkosi: input integrity and less fragile test execution

Recent mkosi work serializes package-cache access, strengthens DNF signature requirements, keeps test output/history outside transient workspaces, and narrows sandbox network capabilities ([cache lock](https://github.com/systemd/mkosi/commit/bdd341ff9bae876fb8354f20caefa0ff0b69ea07), [signature checks](https://github.com/systemd/mkosi/commit/647e3b610b6f563445047627b1fdf42eb07ed1cd), [signature follow-up](https://github.com/systemd/mkosi/commit/41fea1dd8da8dc6ffc45ae9d4fec5158f30505a4), [output handling](https://github.com/systemd/mkosi/commit/b3ec53743ad3561e8ac05289bcee258515f1221e), [history](https://github.com/systemd/mkosi/commit/9bc430a7fa71101ce75d381f502e744949c3f60d), [sandbox capabilities](https://github.com/systemd/mkosi/commit/f7762b71437227922a367bb89597843c77494ef9)). These changes reinforce yubiOS's installer strategy, but the project should consume them only through reviewed pins and rerun PKCS#11 and native-arm64 evidence.

### bootc and composefs: UKI installation and integrity visibility

At the snapshot, bootc's current release was [v1.16.4](https://github.com/bootc-dev/bootc/releases/tag/v1.16.4). Recent main-branch work splits kernel/rootfs UKI handling, extracts UKIs, recognizes the BLS `uki` keyword, and preserves user kernel arguments with composefs ([split handling](https://github.com/bootc-dev/bootc/commit/70f980e975d7088ab44a051ba48ebba7595b6796), [extract](https://github.com/bootc-dev/bootc/commit/fb1451b0afd81751dc371ee5c8206ea93f4fe11a), [BLS keyword](https://github.com/bootc-dev/bootc/commit/628e3b32362f8deb20510717c355665cb21fbbd9), [kernel arguments](https://github.com/bootc-dev/bootc/commit/c60b9187e8fd68e9bd443d5bdc9b4a9ebf0e354c)). Status now exposes a composefs manifest digest, and composefs pull reporting gained progress visibility ([status digest](https://github.com/bootc-dev/bootc/commit/8aee0cc50627d7a4b44e7df576505076a7907cb7), [documentation](https://github.com/bootc-dev/bootc/commit/332e36fcea644002cd500f25580abb3ffacbc770), [progress](https://github.com/bootc-dev/bootc/commit/17734242daf00b7be6696a1f28c925579a4b8db5)).

Direct human commit volume in `containers/composefs` was low in this window, while integration work appeared in bootc. `systemd/particleos` was likewise low-volume. That is a statement about this 90-day commit sample, not project health or importance.

## Leading contributors in the sample

| Rank | Contributor | Aggregate commits | Distribution visible in this review |
|---:|---|---:|---|
| 1 | Yu Watanabe | 379 | systemd 379 |
| 2 | Luca Boccassi | 342 | systemd 334, mkosi 6, particleos 2 |
| 3 | Lennart Poettering | 319 | systemd 318, particleos 1 |
| 4 | Zbigniew Jędrzejewski-Szmek | 252 | systemd 252 |
| 5 | Daan De Meyer | 154 | systemd 123, mkosi 31 |
| 6 | dongshengyuan | 90 | systemd 90 |
| 7 | Colin Walters | 58 | bootc 56, composefs 2 |
| 8 | Pragyan Poudyal | 56 | bootc 56, including one unambiguous same-email alias |
| 9 | Paul Meyer | 52 | systemd 50, mkosi 2 |
| 10 | Christian Brauner | 48 | systemd 48 |
| 11 | Michael Vogt | 46 | systemd 45, mkosi 1 |
| 12 | František Šumšal | 36 | systemd 36 |
| 13 | Philip Withnall | 36 | systemd 36 |
| 14 | Martin Pitt | 33 | mkosi 29, particleos 4 |
| 15 | Kai Lüke | 28 | systemd 28 |

## yubiOS follow-through

- Keep v262 adoption behind compatibility checks for credential sealing and sysupdate unit/API naming.
- Add the FIDO2 zero-length-HMAC case to negative enrollment coverage.
- Evaluate cryptenroll's first-boot/Varlink work against the existing yubiOS wizard; do not replace the recovery path based on API availability alone.
- Track bootc UKI and composefs-status work for the installer and update UX, then validate against the pinned version rather than main.
- Preserve a dated snapshot and exact commit links whenever upstream progress changes a TODO, blocker, or accepted decision.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.8429, Δ=+0.4201) were identical placeholder copies with no per-file content; merged on 2026-09-18.
