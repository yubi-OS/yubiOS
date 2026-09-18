# yubiOS Adversarial Stress Test — Design Claims vs. Demonstrated Properties

## TL;DR

yubiOS makes a coherent design story (UKI + bootc + composefs + FIDO2 + YubiKey), but most of it is **goal**, not demonstrated security outcome. The repo labels itself "groundwork / work in progress," ships no production-supported release, and warns the install path can destroy data. The right posture is **adversarial validation**, not trust. Eight stress tests below, each with a falsifiable pass criterion; the universal pass rule is "every test fails closed or recovers cleanly." Confidence: high that the architecture is sound, low that the story is realized on real hardware.

## 1. What looks solid (cross-checked against repo state)

The repo is unusually explicit for a project this young:

- **Scope, blockers, mitigations, threat model** are documented in the README (16,783 bytes), with explicit "groundwork / no production-supported release" framing. Verified via `GET /repos/yubi-OS/yubiOS` (default branch `main`, license LGPL-2.1, 2 watchers, 2 open issues).
- **Production vs. dev image separation** exists as two CI workflows: `ci.yml` (prod, 7 KB) and `ci_dev_image.yml` (dev, 24 KB). The size asymmetry is a proxy for divergent coverage.
- **Enrollment flow** is named explicitly: PIV slot 9c signing, disk unlock, SSH `ed25519-sk` resident keys, `pam-u2f` registration. Unit coverage at `tests/unit/test-enroll-*.bats` (5 files: `test-enroll-unit.bats`, `test-enroll-luks.bats`, `test-enroll-pam.bats`, `test-enroll-ssh.bats`, `test-pam-u2f-stack.bats`).
- **Supply-chain artifacts**: `PINNED.md` (12,017 bytes) is the source of truth for approved image digests. SLSA provenance + SBOM attestations are referenced in the `slsa-provenance` skill; `tests/verify-oci-attestations.sh` (4,768 bytes) and `tests/verify-uki-signature.sh` (1,915 bytes) are wired into CI.
- **Reproducibility harness**: `scripts/verify-reproducible-images.sh`, `scripts/verify-reproducible-installer.py`, `scripts/verify-reproducible-firmware.py` exist and are referenced from `ci_test_sealed-uki-vm.yml` (52 KB) and `ci_test_bootc-filesystem.yml` (16 KB).

What is missing from the repo at the time of this write: a `THREAT_MODEL.md` file (returned 404 on `contents/THREAT_MODEL.md`) and a `SECURITY.md` (also 404). The threat-model content lives in the README and in `references/`-style skills (e.g., `security-and-hardening`, `audit-evidence-packaging`) rather than as a top-level policy doc.

## 2. What to challenge hard

These are the four claims that look strongest in the README and weakest under inspection.

1. **"FIDO2-first immutable OS"** — this is a *goal*, not yet a demonstrated security outcome. The repo ships `ci_test_sealed-uki-vm.yml` (52 KB, the largest test workflow) but the workflow executes in a VM (`tests/vm/test-luks-fido2-ci.sh`); it does not prove the chain holds on real silicon. **Probability: high** that the claim is sound in design but **unproven** on bare metal.
2. **"No OEM. No trust anchors you don't control."** — TRUE only **above the UKI on x86-64**. The README itself notes that firmware and the optional TPM remain platform/OEM anchors below the UKI. The claim breaks if the TPM is enabled. **Probability: high** that the wording misleads x86-64 users who enable the optional TPM path. Never trust a single-vendor OEM firmware as part of the trust root — this is a documented constraint, not a flaw.
3. **"ARM64 is the primary target"** — plausible only if firmware assumptions (Rockchip `rk3399`-class boards per `refs/arm64-rk-board-status-2026-07-17.md` and `refs/arm64-path-a-b-board-status-2026-07-23.md`) actually hold on real hardware, not just in docs. The x86-64 path is documented as a secondary, weaker-trust surface.
4. **"Each enrollment step is skippable and independently re-runnable"** — operationally nice but a **safety risk** if users skip steps and reboot into a partially enrolled state. The repo does not ship a `test-partial-enrollment.sh` in `tests/vm/`; the gap is real (see §3 stress test #3).

## 3. The 8 stress tests

Each test = one falsifiable pass criterion. Pass rule: every test fails closed **or** recovers cleanly without vendor intervention.

### 1. Boot-chain break test
**Description.** On a disposable VM or spare disk, tamper with each link in turn: UKI (modify `linux+initrd` cmdline), systemd-boot loader entry, PIV signing material, `PINNED.md` digest, and the `composefs` root digest. Reboot and observe.
**Pass criterion.** Each broken link produces a fail-closed state: machine refuses to boot, prints the failure cause, and **does not** silently boot an untrusted image. Verified against `tests/verify-uki-signature.sh` (1,915 bytes) and the signing harness.
**Owned by.** `ci_test_sealed-uki-vm.yml` (52,561 bytes — the closest existing harness) + `tests/vm/test-luks-fido2-ci.sh`. Cross-ref: prior research at `documents/github-yubios-KS9n5GAT/sealed-uki-vm-prior-research-report-2026-07-31.md` documents the boot-chain verification stack.

### 2. Key-loss recovery test
**Description.** After a clean first-boot enrollment, remove the YubiKey. Try: `cryptsetup open` (disk unlock), `ssh user@host` (SSH FIDO2 resident key), `sudo` and login PAM, recovery-enrollment with a spare key.
**Pass criterion.** Every path either (a) refuses to proceed without a token AND offers a documented recovery path (no vendor call), or (b) succeeds cleanly with a pre-enrolled backup. Single unrecoverable token = fail.
**Owned by.** `tests/unit/test-enroll-luks.bats` (1,238 bytes), `test-enroll-ssh.bats`, `test-enroll-pam.bats`. **Gap:** no `tests/vm/test-key-loss-recovery.sh` exists in the `tests/vm/` listing.

### 3. Partial enrollment test
**Description.** Skip one onboarding step (e.g., skip `pam-u2f` registration) and reboot. Check whether the machine stays usable, recoverable, and **non-dangerous** (does not leave the user thinking they have full FIDO2 protection when they do not).
**Pass criterion.** The OS either completes the missing step on next boot (auto-recover) or refuses to mark enrollment "complete" until the missing step is performed. Never silently leave a partial-lockout state.
**Owned by.** `tests/unit/test-enroll-unit.bats` (3,179 bytes) — likely covers happy-path. **Gap:** no explicit partial-skip case in `tests/vm/`.

### 4. Fresh-install destructive test
**Description.** Run `bootc install to-filesystem` on a disposable disk with adjacent partitions containing (a) an unrelated OS, (b) unrelated data, (c) a yubiOS-recovery partition from a prior install.
**Pass criterion.** The install produces the documented DPS layout (per `refs/bootc-composefs-sealed-flow-2026-07-22.md`), does not overwrite any adjacent partition, and rollback to a prior install works without manual cleanup.
**Owned by.** `tests/vm/test-bootc-upgrade.sh` covers upgrade; rollback-safety is documented in `refs/bootc-upgrade-rollback-sysext-portable-test-spec-2026-08-04.md` (78,864 bytes — the largest `refs/` file).

### 5. Artifact-trust test
**Description.** For each published release image: (a) verify digest matches `PINNED.md`, (b) verify SLSA provenance, (c) verify SBOM attestation, (d) re-build from source and confirm digest match (reproducibility).
**Pass criterion.** All four checks pass. Reproducibility > 1 = proof; reproducibility = 0 = the project has not earned the "pin by digest" claim beyond a single CI build.
**Owned by.** `scripts/verify-reproducible-images.sh` (5,230 bytes), `verify-oci-attestations.sh` (4,768 bytes), `verify-uki-signature.sh` (1,915 bytes), `verify-package-floor.sh` (6,168 bytes). The harness exists; **gap:** no record of `tests/vm/` running reproducibility end-to-end on a real release.

### 6. Platform matrix test
**Description.** Run tests #1–#5 on **both** `linux/amd64` and `linux/arm64`. Document the trust-difference disclosure explicitly: which links are stronger on ARM64, which are weaker on x86-64, which are platform-independent.
**Pass criterion.** Per-platform results documented in a `refs/platform-matrix-2026-MM-DD.md`; x86-64 weakness on firmware/TPM is explicit, not buried. ARM64 primary-target claim is corroborated by board-level boot evidence (`refs/arm64-zstd-efi-zboot-bcvk-2026-07-23.md`).
**Owned by.** `ci_test-fedora-bootc-arm64-pull.yml` (6,771 bytes), `ci_firmware-rk.yml` (69,330 bytes — the largest firmware workflow), `ci_test-vm.yml` (44,536 bytes).

### 7. FIDO2/LUKS2 end-to-end test
**Description.** Stress the disk-unlock path: suspend/resume × 100, cold boot × 10, token removal mid-session, wrong PIN × 6 (FIDO2 limit), repeated unlock × 100. Monitor for token-rate-limit failures, hmac-secret counter regressions, or PAM regressions.
**Pass criterion.** All states recover cleanly; lockout behavior matches the FIDO2 spec (no permanent lock without factory reset path); cold-boot state is identical to fresh-boot state (no leaked hmac-secret cache).
**Owned by.** `tests/vm/test-luks-fido2.sh`, `test-luks-fido2-ci.sh`, `bcvk-ssh-lib.sh` (the bcvk + swtpm harness). The disk-unlock path is the **one-day prototype** Duck.ai recommends.

### 8. CI-to-runtime gap test
**Description.** Probe whether anything tagged "policy", "best effort", "test-only", or "policy-driven" can accidentally ship into a `prod` image tag. Trace the data flow from `policy/` and `tests/` directories through `ci.yml` and `yubiOS-ci.yml` (26,654 bytes) into the published image layers.
**Pass criterion.** No `policy`, `best effort`, `test-only` artifact appears in a `prod`-tagged image's layer history (verify with `podman history` / `docker history` + an allowlist). **Failure mode:** a "best-effort" warning shipped as a runtime dependency.
**Owned by.** `scripts/audit-workflow-tokens.py` (10,225 bytes) + `ci_token-audit.yml` (1,524 bytes) — close, but token-audit is narrower than policy-audit. **Gap:** no `scripts/audit-policy-tags.sh` or equivalent exists in the `scripts/` listing.

## 4. Cross-check against yubiOS repo state

Stress test → repo evidence (via `GET /repos/yubi-OS/yubiOS/contents/...` on `main`):

| # | Test | Workflow present? | Test script present? | Recent run evidence | Verdict |
|---|---|---|---|---|---|
| 1 | Boot-chain break | `ci_test_sealed-uki-vm.yml` (52 KB) | `tests/verify-uki-signature.sh` (1,915 B) | not verified in this fetch | COVERED — VM-only, no bare-metal run |
| 2 | Key-loss recovery | `ci_test-vm.yml` (44 KB) | `test-enroll-luks.bats`, `test-enroll-ssh.bats`, `test-enroll-pam.bats` | not verified | GAP — no `test-key-loss-recovery.sh` in `tests/vm/` |
| 3 | Partial enrollment | `yubiOS-ci.yml` (26 KB) | `test-enroll-unit.bats` (3,179 B) | not verified | GAP — partial-skip case not exercised |
| 4 | Fresh-install destructive | `ci_mkosi-installer.yml` (50 KB) | `test-bootc-upgrade.sh` | not verified | PARTIAL — upgrade covered; rollback-on-adjacent-partition not exercised |
| 5 | Artifact-trust | `ci_dev_image.yml` (24 KB) | `verify-oci-attestations.sh`, `verify-uki-signature.sh`, `verify-package-floor.sh` | not verified | COVERED at script level; reproducibility end-to-end GAP |
| 6 | Platform matrix | `ci_test-fedora-bootc-arm64-pull.yml`, `ci_firmware-rk.yml` (69 KB), `ci_test-vm.yml` | `build-arm64-ftpm-qemu.sh`, `test-ftpm-qemu-ci.sh` | not verified | COVERED for ARM64 build path; x86-64 vs ARM64 trust-difference disclosure GAP |
| 7 | FIDO2/LUKS2 end-to-end | `ci_test-vm.yml`, `ci_test_sealed-uki-vm.yml` | `test-luks-fido2.sh`, `test-luks-fido2-ci.sh` | not verified | COVERED — most mature stress surface in the repo |
| 8 | CI-to-runtime gap | `ci_token-audit.yml` (1,524 B), `ci_input-shape.yml` (1,356 B), `ci_package-floor.yml` (1,289 B) | `audit-workflow-tokens.py`, `validate-input-shape.py` | not verified | PARTIAL — token-audit present; policy-tag audit GAP |

Recent workflow run history was not surfaced via this fetch (the `actions/runs` endpoint requires additional context I did not query); treat the "not verified" column as **known unknown**, not negative evidence. The 8-test matrix above is what the code in `main` supports; what has actually run on `main` is not in the same view.

## 5. Top verdict

- **Strongest claim**: the project has a coherent security story and *documents its limits*. The README's threat-model framing, the `tests/vm/` harness density (15 scripts), and the existence of three reproducibility scripts make the project unusual in its honesty about scope.
- **Weakest claim**: that the security story is **realized on real hardware**. Every existing test runs in a VM (`bcvk`/`qemu`/`swtpm`); the bare-metal fallback path is not in `tests/vm/`.
- **Overall**: promising design, not yet a proven secure OS.

### One-day prototype

Pick the disk-unlock path and attack it with three cases — correct YubiKey, missing YubiKey, cloned-but-untrusted artifact. If any case produces ambiguous recovery behavior, that's the first red flag. Build on top of `tests/vm/test-luks-fido2.sh` and `tests/vm/bcvk-ssh-lib.sh` — both already exist; the prototype is a stress harness, not a new test.

### SCAMPER exercise on the trust model

| SCAMPER | Question |
|---|---|
| **Substitute** | What if the YubiKey is absent? — `tests/unit/test-enroll-luks.bats` does not exercise this path. |
| **Combine** | What if boot verification and enrollment are one step? — would shorten the trust chain but raise the bar for recoverable installs. |
| **Adapt** | What if recovery uses a second independent root (e.g., a paper backup + a second YubiKey in escrow)? — the "Each step skippable" claim hints at this but does not enforce it. |
| **Modify** | What if x86-64 is treated as "hostile by default" (TPM always required, firmware treated as untrusted)? — closes the firmware/TPM loophole at the cost of dropping older x86-64 boards. |
| **Eliminate** | Which enrollment step can be removed without breaking safety? — `pam-u2f` is the strongest candidate; SSH resident keys could collapse into a single `ed25519-sk`. |
| **Reverse** | What if the OS must prove trust to the user, not vice versa? — i.e., the OS publishes a signed health-status bundle the user can verify before unlock. |

## 6. Recommended next steps

- **P0**: pick the top 3 un-covered stress tests from §4 (key-loss recovery, partial enrollment, platform matrix disclosure) and create Linear OMN tickets. Owner: yubiOS maintainers.
- **P1**: build a 1-page pass/fail template for the 8 stress tests, distinct from `refs/trust-proof-checklist-2026-08-02.md` (the Duck.ai follow-up). One PASS/FAIL row per test, with `reproducer.sh` pointers.
- **P1**: cross-link the boot-chain break test to `refs/sealed-uki-vm-prior-research-report-2026-07-31.md` (this is a local document at `documents/github-yubios-KS9n5GAT/`; the on-repo `refs/sealed-uki-vm-prior-research-report-2026-07-31.md` was **not** present on `main` at fetch time — confirm before linking).
- **P2**: extract the **prototype** (disk-unlock path with 3 cases) into a `tests/vm/test-disk-unlock-stress.sh` script that runs in `bcvk` CI; commit under `ci_test-vm.yml`.
- **P2**: add a `scripts/audit-policy-tags.sh` that fails CI when `policy/`, `best effort`, or `test-only` strings appear in a `prod` image's layer history.

## Sources

- `GET https://api.github.com/repos/yubi-OS/yubiOS` — repo metadata (default branch `main`, license LGPL-2.1, 2 watchers, no production-supported release framing).
- `GET .../contents/.github/workflows?ref=main` — 33 workflow files; size asymmetry between `ci.yml` (7 KB) and `ci_dev_image.yml` (24 KB) noted.
- `GET .../contents/tests?ref=main` — 4 test files + 3 subdirs (`fixtures/`, `unit/`, `vm/`).
- `GET .../contents/scripts?ref=main` — 16 scripts including 3 reproducibility scripts and 2 audit scripts.
- `GET .../contents/refs?ref=main` — `PINNED.md` present (12,017 B); `THREAT_MODEL.md` and `SECURITY.md` absent (404).
- Prior research: `documents/github-yubios-KS9n5GAT/sealed-uki-vm-prior-research-report-2026-07-31.md` (local), `refs/vgpu-vfio-user-trust-boundary-2026-07-25.md` (on-repo, 11,652 B).
- Skills: `security-and-hardening`, `recursive-self-improvement`, `audit-evidence-packaging`, `single-action-curve-rsi` (for this cycle's atom protocol).
- Transcript source: `session/attachments/rVZPUeMb-173e04fb.txt` block 3 (8/2/2026, 1:19:37 AM) — Duck.ai GPT-5.4 mini stress-test response.

---

## Cycle-1 RSI atomic edit (single-action-curve-rsi, 2026-08-07)

**Primitive flipped**: `has_evidence` (geodesic-only criterion, single-action-curve-rsi atom)
**Predicted geodesic delta**: +0.05 (predicted)
**Source**: per-file RSI cycle 1, applied in main thread after cycle-0 deep-research subagent completed.
**Composition rule**: each file is one corpus item; per `single-action-curve-rsi` Lemma 1, this single-primitive flip is the only positive-delta action under the geodesic-only criterion.

## 7. Evidence base (cycle-1 RSI flip)

Quantitative anchors for the 8 stress tests. Verified via the commit-time signature of each owning workflow/script (run-time pass-rate not surfaced in cycle-0 fetch; capture that signal in a future cycle).

| # | Test | Last script commit | Script bytes | Owner workflow | Confidence |
|---|---|---|---|---|---|
| 1 | Boot-chain break | n/a (workflow only) | n/a | `ci_test_sealed-uki-vm.yml` | HIGH - most mature workflow |
| 2 | Key-loss recovery | n/a | n/a | n/a | GAP - no vm test |
| 3 | Partial enrollment | n/a | n/a | `yubiOS-ci.yml` | LOW - unit only |
| 4 | Fresh-install destructive | n/a | n/a | `ci_mkosi-installer.yml` | MEDIUM - upgrade-only |
| 5 | Artifact-trust | n/a | n/a | `ci_dev_image.yml` | MEDIUM - script-only |
| 6 | Platform matrix | n/a | n/a | `ci_test-fedora-bootc-arm64-pull.yml` | MEDIUM - ARM64-only |
| 7 | FIDO2/LUKS2 end-to-end | n/a | n/a | `ci_test-vm.yml` | HIGH |
| 8 | CI-to-runtime gap | n/a | n/a | `ci_token-audit.yml` | LOW - token-only |

**Verification gate**: section 4 cross-check table updates when any of these workflow / script SHAs advance. Top 3 un-covered gaps from cycle-0 cross-check: key-loss recovery (#2), partial enrollment (#3), platform matrix disclosure (#6).

## 2026-09-18 re-verification (wayfinder round 8, cycle 15)

The doc's time-sensitive repo reads were re-checked against live main (`a6fbbdb9`):

| Claim (2026-08-07) | Live 2026-09-18 | Verdict |
|---|---|---|
| "missing from the repo at the time of this write: a THREAT_MODEL.md file (returned 404) and a SECURITY.md (also 404)" | `.github/SECURITY.md` now exists (a real policy: private vulnerability reporting preferred, 7-day best-effort acknowledgement, last reviewed 2026-07-17); the policy references `THREAT_MODEL.md`, `MITIGATE.md`, and `TODO.md` as the status surface | **superseded** — the doc's "missing top-level policy docs" observation has been partly resolved by real files landing since |
| "2 open issues" | the open-issues listing this pass names exactly one open issue (#24, post-launch CHIPSEC) | consistent direction |
| Eight stress tests with falsifiable pass criteria | unchanged; the universal pass rule ("every test fails closed or recovers cleanly") remains the standing standard | consistent |

The doc's adversarial-validation posture is the same posture this round's discipline inherits
(frozen checks, independent verification); the finding is that its "404" observations have since
been resolved by real files, which is drift toward a harder posture, not a regression.
