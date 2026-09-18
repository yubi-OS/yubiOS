# yubiOS testing & production gaps — 2026-08-01

Repo: `yubi-OS/yubiOS` @ `21ba013c910f6a2e1fa46646fd755adc0de88f13`
Companion: `playbooks/` (README + 7 playbooks, same cycle)

## TL;DR

yubiOS has a strong **software-validated** core and a thin **hardware-** and **supply-chain-evidence** layer. Proven: 25 dispatch-only workflows after PR #145's group-routing redesign, 10 Bats unit tests + 2 shell validators + 10 VM scripts, and the full LUKS2 / systemd-homed / pam-u2f / `ed25519-sk` chain green with no skips on run 30139433902 (`B-VM-CTAP2` RESOLVED, OMN-48 Done). The long pole is the **sealed-UKI boundary**: `B-BOOTC-SEAL` Phase 1 (artifact split) shipped in PR #143 / `a1940330`, but Phase 2 (install-time BLSConfig wiring) is open and the Secure Boot VM lane that would prove the three negative-tamper assertions only landed in PR #154 + PR #155 (`1c284b48826f` + `0cb68518bef0`); green signed-UKI build arrived at V83 (commit `1d0666d77c0b` arm64 boot_timeout slack). Gates still needing **real hardware**: ARM64 Path A (`B-ARM64-PATHA`, `B-RK3588-TPL`), physical-YubiKey ceremonies (`B-REAL-FIDO2`), negative Secure Boot tamper boot on both arches (`B-BOOTC-SEAL`), runtime hardening in a target image (`B-HARDENING-RUNTIME`). Supply chain: **0/25 SBOM**, **2/25** explicit SLSA provenance (`ci_firmware-rk.yml`, `ci_mkosi-installer.yml` — the canonical production build `yubiOS-ci.yml` is **not** among them), **0/25** buildx cache, **5/25** `concurrency:`, fork upstream-sync manual-only. The 7-day failure cluster (drop-in lex-sort, `/dev/vfio` 5-layer, ALLOW_REAL_U2F, group-routing, GH_TK, dispatcher inputs) shares one root: **no shared doctrine for input shape** across workflow YAML, drop-in filenames, OCI references, and registry channels. `playbooks/` is the human half of the answer; a CI gate (Gap 8) is the machine half.

## Coverage matrix

| # | Surface | Covered today | Gap |
|---|---|---|---|
| 1 | TF-A → OP-TEE → U-Boot | `ci_firmware-rk.yml` QEMU lane; StMM/fTPM/TPM-marker assertions; reproducibility via 2 clean ARM64 jobs | real RK3588 TPL+DDR boot; U-Boot UEFI SB var enforcement on hw (`B-RK3588-TPL`) |
| 2 | ARM64 Path A board proof | board roles documented; rehearsal designed | ROTPK/fuse provisioning, RPMB, owner root-of-trust custody on a real board (`B-ARM64-PATHA`) |
| 3 | Signed UKI + Secure Boot boot | `ci_test_sealed-uki-vm.yml` (PR #154 lane, PR #155 stub fill-in, MERGED) | no green signed-UKI build at this date; no OVMF/ROTPK provisioning; PCR0/4/7/11 golden values unasserted |
| 4 | Negative tamper (3 assertions) | designed in `refs/sealed-uki-vm-test-2026-07-30.md` | tampered UKI / tampered composefs / unsigned UKI all unproven; negatives 2 & 3 TODO-only |
| 5 | composefs / dm-verity | `ci_test_bootc-filesystem.yml` proves unsealed fs-verity composefs with `composefs=<sha512>` BLS entries (`7eba4856e7`, job 91037694742) | sealed path; `roothash=` in UKI `.cmdline`; install-time BLSConfig (Phase 2) |
| 6 | LUKS2 / homed / pam-u2f / ssh-sk / PIV | run 30139433902 end-to-end PASS; `test-pam-u2f-stack.bats` asserts `required` + 1.3.1 floor | physical-key run (`B-REAL-FIDO2`); recovery token; PIV ceremony confirmation; revocation; multi-key hidraw race; PIN retry/lockout |
| 7 | bootc upgrade / rollback | `ci_test-vm.yml` runs `bootc upgrade` legs | A/B boot-counter saturation; `bootc switch --transport=oci` rollback; `bootc container lint --fatal-warnings` |
| 8 | sysext / portable services / dynamic users | static unit tests only | activation/deactivation vs immutable `/usr`; `portablectl attach/detach`; `systemd-run --user` lifecycle |
| 9 | Runtime hardening | static audit (`refs/systemd-hardening-audit-2026-07-17.md`) | `RestrictFileSystems=~@network` firing at runtime; `systemd-analyze verify`/`security` on the booted graph (`B-HARDENING-RUNTIME`) |
| 10 | GPU trust boundary (ADR-031) | `ci_test-vgpu-vm.yml`; virtio-gpu default asserted; `test-vfio-user-host-ci.sh` | IOMMU passthrough on real RK3588; vfio-user creds-locked handoff; ADR-031 preference enforcement; device-memory cgroup |
| 11 | SBOM / SLSA / cosign | yubiOS.rego gate (`reset=true,strict=true`); `PINNED.md`; installer reproducibility job | 0/25 SBOM; 2/25 provenance; no cosign in workflow YAML; SB key provenance unattached |
| 12 | OCI channel binding | immutable `:<sha>` tags alongside `:latest` | `latest`-cannot-bind-to-`dev` unasserted; per-arch tag vs digest binding unenforced on pull |
| 13 | Dispatcher / input shape | PR #145 group enum; per-workflow inputs declared | no shared validator; `target_ref`/`group`/`Docker_push` forwarding 422s by construction; `Docker_push` silently ignored outside the 4 builders |
| 14 | Group reachability | `docs/CI_MAP.md` group lists | `ci_test-ftpm-tpm0.yml`, `ci_test-fedora-bootc-arm64-pull.yml`, `ci_test-vgpu-vm.yml` in **no** group — `group=all` misses them |
| 15 | Fork upstream sync | `fetch-released-tag-ref.yml` peels releases on demand | 4 forks lost auto-sync after PR #145; no drift nag |
| 16 | Workflow hygiene | `ci.yml` declares `permissions: actions: write` | 24 children inherit; 20/25 lack `concurrency:`; 0/25 buildx cache; no permissions audit |
| 17 | Test-script negative paths | 10 VM scripts + 10 Bats prove positive paths | no `test-secure-boot-tamper.sh`, `test-oci-tag-channel.sh`, `test-bcvk-passthrough.sh`, `test-policy-rejection.sh`; no negative PKCS#11-URI test |

## Gaps

**1 — Real-hardware Secure Boot negative-tamper evidence** · *Critical* · A signed UKI failing `sbverify` could still be published and accepted if SB variable enforcement and PCR handoff are never measured against real firmware. *Mitigation:* QEMU OVMF + swtpm proves only the path that already works. *Cost:* 3–4 weeks + one Jenny sign-off; amd64 VM lane first, arm64 behind `B-ARM64-PATHA`. *Fix:* land `ci_test_sealed-uki-vm.yml` (PR #154 + PR #155), capture 3 green negative-tamper runs against `:dev-<sha>`, add `tests/unit/test-bootc-sealed-lane.bats`.

**2 — ARM64 Path A real-board proof** · *Critical* · No production claim for ROCK 5B / ROCKPro64; Path B evidence is not equivalent; QEMU proves build shape, not fuses, RPMB, or owner root-of-trust custody. *Cost:* 6–12 weeks + sacrificial board + Jenny for ritual phases. *Fix:* OMN-45 ROTPK rehearsal, OMN-46 OP-TEE/RPMB/fTPM/U-Boot on hw, OMN-47 signed-UKI boot; retain `refs/rock5b-sacrificial-rehearsal-<date>.md`.

**3 — Physical-YubiKey production-confidence run** · *High* · `B-REAL-FIDO2` holds the trust claim; software proves function, not physical presence, firmware ownership, or RPMB freshness. *Cost:* 1–2 weeks + Jenny for the 12 scenarios. *Fix:* execute OMN-63's 12 scenarios against `0mniteck/yubios:<sha>`; retain `refs/yubikey-hardware-run-<date>.md`.

**4 — Runtime hardening evidence** · *High* · Static Bats pass; nobody has booted a target image to see `RestrictFileSystems=~@network` fire during enrollment. *Cost:* 1 week once `ci_test-vm.yml` boots a hardened image. *Fix:* post-enrollment assertions on `systemctl show yubiOS-enroll.service -p RestrictFileSystems` and `systemd-analyze security yubiOS-enroll.service`.

**5 — bootc upgrade/rollback + sysext + portable services** · *High* · A/B counter saturation, `bootc switch --transport=oci` rollback, sysext against immutable `/usr`, portable-service lifecycle — no CI assertion for any. *Cost:* 2 weeks. *Fix:* `tests/vm/test-bootc-upgrade-rollback.sh`, `test-sysext-lifecycle.sh`, `test-portable-service.sh`.

**6 — SBOM + SLSA L3 + cosign** · *High* · Consumers cannot verify what they pull; mutable `latest`/`dev` have no channel binding; SB key provenance unattached. *Cost:* 1 week. *Fix:* `provenance: true, sbom: true` on `docker/build-push-action` in `yubiOS-ci.yml` + `ci_mkosi-installer.yml`; `cosign sign --yes`; add `tests/vm/test-oci-provenance.sh`.

**7 — GPU trust boundary on real RK3588** · *High* · ADR-031's ladder is documented, unproven; CI covers virtio-gpu only. *Cost:* 4–6 weeks + sacrificial board. *Fix:* vfio-user creds-locked handoff test in QEMU; IOMMU group isolation on RK3588; CI rejection of `vm-gpu=virtio` when `host-gpu=pci` is available.

**8 — Top-level input-shape doctrine** · *Medium* · The whole 7-day cluster's shared root. BLOCKERS.md covers lex-sort and `/dev/vfio` retroactively; nothing proactive. *Cost:* 1 week author + 1 week wire. *Fix:* `.github/actions/validate-input-shape/action.yml` asserting (a) inputs are enums, (b) drop-in filenames lex-sort after upstream, (c) OCI refs digest-pinned, (d) channel selection role-bound; invoke from `ci.yml`. `playbooks/` covers the human half now.

**9 — 3 workflows unreachable from any group** · *Medium* · `group=all` silently misses `ci_test-ftpm-tpm0.yml`, `ci_test-fedora-bootc-arm64-pull.yml`, `ci_test-vgpu-vm.yml`. *Cost:* 0.5 day. *Fix:* Bats test asserting the `group:*` union covers all dispatch-enabled workflows, or add `group=tests-standalone`.

**10 — Fork upstream-sync drift** · *Medium* · 4 forks lost auto-sync after PR #145; no nag. *Cost:* 1 week. *Fix:* daily `schedules/fork-drift-watch/` firing `group=fetches`; file a Linear issue on a non-empty `PINNED.md` diff.

**11 — Workflow token-scope audit** · *Medium* · Every `permissions:` block is hand-written; 20/25 lack `concurrency:`; the GH_TK cleanup was the symptom. *Cost:* 2–3 days. *Fix:* `.github/scripts/audit-workflow-permissions.sh` asserting every workflow declares `permissions:` and only the 4 builders accept `Docker_push`.

**12 — Missing negative-path test scripts** · *Low/Medium* · Green-only coverage on the most security-critical primitives; no negative test that a wrong PKCS#11 URI fails closed. *Cost:* 1–2 weeks. *Fix:* `test-secure-boot-tamper.sh`, `test-oci-tag-channel.sh`, `test-bcvk-passthrough.sh`, `test-policy-rejection.sh`, each with a Bats existence assertion.

## Linear issue candidates

Project **yubiOS Production Proof & Release Gates** (`a9a0701b-d1be-448c-a194-e573c82bd9f8`, team OMNI-AGENT).

1. **Land `ci_test_sealed-uki-vm.yml` with 3 negative-tamper assertions** — PR #154 scope: signed UKI via SoftHSM PIV 9c + `provider:pkcs11`, OVMF boot with ROTPK in `db`, then tampered UKI / tampered composefs / unsigned UKI. Parent OMN-53. *Urgent · Todo*
2. **Sacrificial RK3588 Path A rehearsal — ROTPK + fTPM + signed UKI boot** — OMN-45/46/47 as sub-issues; closes `B-ARM64-PATHA` and `B-RK3588-TPL`. *Urgent · Todo*
3. **Execute 12-scenario physical-YubiKey production-confidence run** — OMN-63's scenarios against `0mniteck/yubios:<sha>`; closes `B-REAL-FIDO2`. *Urgent · Todo*
4. **Wire runtime hardening assertions in `ci_test-vm.yml`** — post-enrollment `RestrictFileSystems` + `systemd-analyze security` + `ConditionSecurity=measured-os`; closes `B-HARDENING-RUNTIME`. *High · Todo*
5. **Author bootc upgrade/switch + sysext + portable-service VM tests** — three new `tests/vm/` scripts. *High · Backlog*
6. **Wire SLSA L3 provenance + SPDX SBOM + cosign in yubiOS-ci + mkosi-installer** — closes the 0/25 SBOM and 2/25 provenance gaps. *High · Backlog*
7. **GPU trust boundary proof on real RK3588** — vfio-user handoff, IOMMU isolation, ADR-031 preference enforcement. *High · Backlog*
8. **Add top-level input-shape doctrine and CI gate** — `validate-input-shape` action + a BLOCKERS.md Permanent CI-Evidence Patterns entry. *High · Backlog*
9. **Assert every `workflow_dispatch` workflow is reachable from a group** — Bats union test, or a `tests-standalone` group. *Medium · Backlog*
10. **Daily fork-upstream drift detection schedule** — `group=fetches` daily; file an issue tagged `area:supply-chain` on a non-empty `PINNED.md` diff. *Medium · Backlog*
11. **Workflow token-scope audit script** — assert `permissions:` everywhere; `Docker_push` only on the 4 builders; no gratuitous `contents: write`. *Medium · Backlog*
12. **Author 4 missing VM test scripts** — negative-tamper, OCI-channel, YubiKey-passthrough, policy-rejection, each + a Bats assertion. *Low · Backlog*

## Cross-references

- **Commits:** `21ba013c910f6a2e1fa46646fd755adc0de88f13` (main HEAD); `59f4332` → `f92c6010` (lex-sort); `a1940330` (PR #143, artifact split, closed OMN-51); `8ccffa71`, `d2646452` (digest bumps); `a49e95db` (PR #148); `8b5b20b` (PR #147); `5200f0b`, `5342867`, `6dad3733` (`allow_real_u2f`); `7eba4856e7` (job 91037694742, unsealed BLS proof); `3211e25a617e` (V39 sealed-UKI); `1c284b48826f` (PR #154 lane); `0cb68518bef0` (PR #155 stub fill-in, MERGED); `1d0666d77c0b` (V83 arm64 boot_timeout slack); `95565a0e` (dev-short-sha tag fix); `a50ecac42cc0` (V37 colon-in-step-name parse failure).
- **PRs:** #102, #125 (FIDO2 chain fixes), #137 (vgpu / ADR-031 rule 5), #143, #144, #145, #147, #148, #150 (verification doctrine), #154 (sealed-UKI lane, draft), #155 (sealed-UKI stub fill-in, MERGED).
- **Runs:** 30139433902 / job 89629762908 (`B-VM-CTAP2` closure); 29872832727 (`B-VM-SSH` + `B-VM-BOOTLOADER-UPDATE` retired); 29869527608 (RK3588 compiled, no DDR/TPL); 29525332901 (superseded ARM64 guest); 30484718456 (smoke test on `8b5b20b`); 30610224165 (V39 sealed-UKI); `30652859000` (V83 sealed-UKI GREEN, the first green signed-UKI build).
- **Linear:** OMN-36/42/43/45/46/47/48/51/52/53/54/55/63/96/97/100/108/116/139/141/146/149/150.
- **Blockers:** `B-ARM64-PATHA`, `B-RK3588-TPL`, `B-QEMU-ZBOOT`, `B-PINS`, `B-HARDENING-RUNTIME`, `B-REAL-FIDO2`, `B-BOOTC-SEAL` Phase 2. Resolved: `B-VM-CTAP2` (2026-07-25).
- **ADRs:** ADR-002, 003, 007, 008, 014, 016, 022, 023, 026, 031, 032.
- **`refs/`:** `arm64-rk-board-status-2026-07-17.md`, `systemd-hardening-audit-2026-07-17.md`, `sbsign-pkcs11-validate-2026-07-23.md`, `sealed-uki-vm-test-2026-07-30.md`, `bootc-composefs-sealed-flow-2026-07-22.md`, `kernel-rootfs-split-2026-07-29.md`, `fido2-ci-emulator-status-2026-07-23.md`, `luks-fido2-e2e-test-2026-07-23.md`, `yubikey-hw-validation-scenarios-2026-07-25.md`, `digest-bump-checklist-2026-07-25.md`, `vgpu-vfio-user-trust-boundary-2026-07-25.md`, `actions-checkout-v6-includeif-investigation-2026-07-29.md`, `debug-with-cli-2026-08-01.md`.
- **Playbooks (this cycle):** `drop-in-override-naming`, `digest-bump-recovery`, `dispatch-chain-verification`, `hw-device-and-allow-real-u2f`, `github-token-vs-secrets`, `sealed-uki-vm-debug`, `fido2-vm-e2e-recipe`.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
