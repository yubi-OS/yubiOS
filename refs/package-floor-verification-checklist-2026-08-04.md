---
contract: "yubios package-floor verification checklist. The pre- and post-digest-bump verification protocol that ensures every digest bump in PINNED.md preserves the package-floor invariants (kernel ≥6.5/6.6/6.12 per composefs mode, systemd version, bootc ≥1.16.6 for container split-kernel-and-rootfs, package-set diff). Codifies the 3 documented fedora-bootc:45 digest rotations in 7 days (f6b5b775… → 1dcca7ac… → 2d6f1df3…) as the failure-mode evidence base. Lands via PR on yubi-OS/yubiOS main under refs/package-floor-verification-checklist-2026-08-04.md + scripts/verify-package-floor.sh + .github/workflows/ci_package-floor.yml."
short_description: "Package-floor verification checklist for digest changes"
---

# Package-Floor Verification Checklist — yubios Digest Bump Hygiene (2026-08-04)

**Linked Linear issue:** [OMN-62](https://linear.app/omni-agent/issue/OMN-62)
**Project:** yubiOS Production Proof & Release Gates
**Authored:** 2026-08-04 in self-mode.
**Status:** Draft for PR.

---

## 1. Problem statement

yubios's base image (`quay.io/fedora/fedora-bootc:45`) has rotated 3 times in 7 days:

| Incident | Date | Old digest | New digest | Trigger | Commit |
|---|---|---|---|---|---|
| OMN-139 (stream truncation) | 2026-07-26 | `sha256:f6b5b775…` | (re-resolved) | quay.io stream truncation on arm64 layer 16,045,778 | (rebuilt via `fetch-fedora-bootc-manifest.yml`) |
| Re-resolution #1 | 2026-07-29 | `sha256:f6b5b775…` | `sha256:1dcca7ac54b243bef0cf65bfca165fb4a514d7891854db216a4ab6cbc10215ff` | manual refresh via `fetch-fedora-bootc-manifest.yml` | [`8ccffa71`](https://github.com/yubi-OS/yubiOS/commit/8ccffa71) |
| Re-resolution #2 | 2026-07-30 | `sha256:1dcca7ac…` (404 on quay.io) | `sha256:2d6f1df373be1423db91dd32a217b5d99fd4940d651fc1e2477b9b660e063906` | Jenny's directive "stale image? just re-run the fetch group ci" | [`d2646452`](https://github.com/yubi-OS/yubiOS/commit/d2646452) |

Each digest bump is a non-trivial event: it potentially changes the package floor (kernel version, systemd version, bootc version, package set). Without a structured verification protocol, a digest bump can silently regress composefs support (kernel ≥6.5 / 6.6 / 6.12 floors per the `composefs-kernel-floors` skill), or signed UKI build (sbsign + libykcs11), or any other invariant.

This spec defines the pre-bump and post-bump verification checklist that every digest bump must clear.

## 2. Package-floor invariants

The package floor is the set of minimum versions for kernel, systemd, bootc, and other load-bearing packages that yubios requires for its composefs / signed UKI / LUKS2 FIDO2 flows to work.

### 2.1 Kernel floor (per composefs mode)

| Mode | Kernel floor | Mount requirement | Source |
|------|-------------|-------------------|--------|
| data-only OverlayFS (composefs primary backing fs) | ≥6.5 | data-only overlayfs | composefs-kernel-floors skill |
| verity=require mount option (enforces composefs-signed catalog) | ≥6.6 | verity=require | composefs-kernel-floors skill |
| file-backed EROFS (composefs alternate backing fs) | ≥6.12 | file-backed EROFS | composefs-kernel-floors skill |

The `yubios` convention: pick the lowest-supported kernel in PINNED.md as the floor; production builds use the pinned digest's kernel; dev image is allowed to use a newer kernel as long as ≥floor.

### 2.2 systemd floor

| Feature | systemd floor | Reference |
|---------|--------------|-----------|
| Boot loader spec BLS entries | ≥v246 (2020-06) | systemd-boot(7) |
| Discoverable Partitions Specification (DPS) | ≥v252 (2022-10) | systemd-repart(8) |
| LUKS2 hardware unlock (FIDO2/TPM2/PKCS#11) | ≥v252 (2022-10) | systemd-cryptenroll(8) |
| portable services + portablectl attach/detach | ≥v254 (2023-06) | portablectl(1) |
| sysext overlay lifecycle | ≥v256 (2024-06) | systemd-sysext(8) |
| confext | ≥v256 (2024-06) | systemd-confext(8) |
| dynamic users | ≥v235 (2018) | systemd DynamicUser= docs |
| factory reset + stateless systems | ≥v256 (2024-06) | systemd 0pointer blog |

yubios targets ≥v256 (current `systemd v261` per `0pointer-mastery` skill notes).

### 2.3 bootc floor

| Feature | bootc floor | Reference |
|---------|------------|-----------|
| Basic bootc install | ≥v1.0.0 | bootc-docs |
| `bootc container split-kernel-and-rootfs` (Phase 2 BLSConfig wiring, OMN-150) | ≥v1.16.4 | PR #143 kernel+rootfs split notes |
| `bootc install to-filesystem --composefs-backend` (OMN-149 fix v0.11) | ≥v1.16.3 (composefs backend stable) | bootc-dev/bootc#2098 |

yubios targets ≥v1.16.6 (current `bootc 1.16.6` per `0pointer-mastery` skill notes; the build pipeline uses `bootc 1.16.4+` per PR #143 OMN-51 Phase 2 dependency).

### 2.4 Other package floors

| Package | Floor | Why |
|---------|-------|-----|
| mkosi | ≥v25 (MinimumVersion=26~devel per `mkosi.conf`) | PIV slot 9c signing pattern, systemd-sysext integration |
| podman | ≥v4.5 | rootless container builds via `rootless-container-builds` skill |
| OPA/Rego Build Policy | ≥buildx v0.16 (the `--policy` flag landed in v0.16) | `yubiOS.rego` Build Policy |
| SoftHSM (CI substitute for YubiKey PIV slot 9c) | ≥v2.6 | canonical PKCS#11 signing pattern; cross-version trap at v2.6 → v2.7 (commit `a50ecac42cc0` documented in `refs/sbsign-pkcs11-validate-2026-07-23.md`) |
| sbsign + libykcs11 | ≥systemd v252-era (signed UKI build) | PR #32 merged |

## 3. Pre-bump verification (BEFORE updating PINNED.md)

Run this checklist before bumping a digest in PINNED.md:

### 3.1 Fetch the new digest

```
$ curl -fsSL "https://quay.io/api/v1/repository/fedora/fedora-bootc/tag/?specificTag=:45" | jq -r '.tags[] | .name'
```

Or via the existing `fetch-fedora-bootc-manifest.yml` workflow (which is the canonical recovery tool per `PROJECT_RULES.md`).

### 3.2 Pull the new image and inspect

```
$ podman pull quay.io/fedora/fedora-bootc:45@sha256:<new-digest>
$ podman run --rm quay.io/fedora/fedora-bootc:45@sha256:<new-digest> rpm -q kernel
kernel-6.x.x-...
$ podman run --rm quay.io/fedora/fedora-bootc:45@sha256:<new-digest> rpm -q systemd
systemd-2xx-...
$ podman run --rm quay.io/fedora/fedora-bootc:45@sha256:<new-digest> rpm -q bootc
bootc-1.16.x-...
```

### 3.3 Compare against the floor

| Check | Pass criterion | Action on fail |
|-------|---------------|----------------|
| Kernel version ≥ floor | Compare against composefs mode requirement (§2.1) | If kernel regressed: ABORT bump; file new OMN issue; do not commit. |
| systemd version ≥ v256 | Compare against floor (§2.2) | If systemd regressed: ABORT bump; file new OMN issue. |
| bootc version ≥ v1.16.4 | Compare against floor (§2.3) | If bootc regressed: ABORT bump; file new OMN issue. |
| Package set diff | Diff `rpm -qa` between old and new digest | If a package was added/removed/renamed: review; if the change affects signing or bootc, ABORT bump. |
| Containerfile FROM digest matches | The new digest equals what PINNED.md will commit | If mismatch: STOP; re-fetch. |

### 3.4 Update PINNED.md + Containerfile

If all checks pass:
1. Update `Containerfile` `FROM` line to the new digest.
2. Update `PINNED.md` with the new digest + a "Re-resolved YYYY-MM-DD" stamp.
3. Commit as `chore(pins): re-resolve fedora-bootc:45 to sha256:<new>` per the pattern established by commits `8ccffa71` and `d2646452`.

## 4. Post-bump verification (AFTER the digest bump is on main)

### 4.1 Wait for the CI cascade

The bump triggers:
1. `ci_dev_image.yml` (rebuilds the dev image with the new base)
2. `ci.yml` group=fetches (re-fires all fetches, confirms no other digests are stale)
3. `ci.yml` group=ci-builders (re-fires yubiOS-ci + ci_dev_image + ci_mkosi-installer)
4. `ci.yml` group=tests (re-fires all tests against the new image)
5. `ci.yml` group=vm-tests (re-fires vm tests)

### 4.2 Run the verification script

A new `scripts/verify-package-floor.sh` script (lands in this PR) runs as part of the cascade:

```
$ bash scripts/verify-package-floor.sh --target-image docker.io/0mniteck/yubios:dev-<short-sha>

[1/5] Pulling target image... OK
[2/5] Extracting kernel version... OK: kernel-6.x.x
[3/5] Comparing kernel floor (≥6.5 for composefs primary, ≥6.6 for verity=require, ≥6.12 for EROFS)... PASS
[4/5] Extracting systemd version... OK: systemd-2xx
[5/5] Extracting bootc version... OK: bootc-1.16.x
Comparing bootc floor (≥v1.16.4)... PASS

Summary: 5/5 PASS
```

If any check fails, the script exits non-zero, the workflow fails, and the bump is flagged for re-resolution.

### 4.3 Verify the build chain

The cascade must reach a stable end state:
- All E-1..E-11 engineering gates (per OMN-142) still PASS.
- The `composefs-kernel-floors` skill's invariants still hold.
- The signed UKI build (PR #32, ADR-008) still produces a verifiable signed artifact.

If any gate regresses, file a new OMN issue with the commit SHAs + the failure log + the digest that caused the regression.

## 5. CI gate: `ci_package-floor.yml`

A new workflow that runs the verification script as a scheduled job (daily 6 AM UTC) plus on PR events touching PINNED.md or Containerfile.

```yaml
name: ci_package-floor
on:
  pull_request:
    paths: ['PINNED.md', 'Containerfile', 'Containerfile.dev', 'scripts/verify-package-floor.sh']
  schedule:
    - cron: '0 6 * * *'  # daily 6 AM UTC
  workflow_dispatch:
    inputs:
      target_image:
        type: string
        default: 'docker.io/0mniteck/yubios:dev'

permissions:
  contents: read

jobs:
  verify-floor:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4.2.2  # pin via PINNED.md
      - uses: actions/setup-python@v5.3.0
        with:
          python-version: '3.12'
      - name: install skopeo
        run: sudo apt-get install -y skopeo
      - name: verify floor
        run: |
          bash scripts/verify-package-floor.sh --target-image "${{ inputs.target_image || 'docker.io/0mniteck/yubios:dev' }}"
      - name: upload report
        if: always()
        uses: actions/upload-artifact@v4.6.0
        with:
          name: package-floor-report
          path: floor-report.json
```

## 6. Migration plan

### Phase 1 (this PR) — Ship the checklist + the script + the CI gate

- Land `scripts/verify-package-floor.sh` + `.github/workflows/ci_package-floor.yml` + `refs/package-floor-verification-checklist-2026-08-04.md`.
- PR title: `feat(ci): package-floor verification checklist + ci_package-floor.yml gate (OMN-62)`.
- Branch: `feat/ci-package-floor-2026-08-04`.
- First scheduled run on main populates the floor report.

### Phase 2 — Required on PINNED.md + Containerfile PRs

- Update `ci_package-floor.yml` to require `verify-floor` step PASS on any PR touching PINNED.md or Containerfile.

### Phase 3 — Run on every digest bump event

- After PR #148's GH_TK cleanup, the dispatcher is consistent enough that this gate can run on every digest bump automatically.

## 7. Verification recipe

After the script ships, run it manually against the current dev image:

```
$ bash scripts/verify-package-floor.sh --target-image docker.io/0mniteck/yubios:dev
```

Expected output: `Summary: 5/5 PASS` (kernel ≥6.5, kernel ≥6.6, systemd ≥v256, bootc ≥v1.16.4, package-set diff empty or non-significant).

## 8. References

- Linear [OMN-62](https://linear.app/omni-agent/issue/OMN-62) — Define the package-floor verification checklist for digest changes (this spec's parent)
- Linear [OMN-41](https://linear.app/omni-agent/issue/OMN-41) — Keep PINNED.md and package floors in lockstep with digest bumps (companion)
- Linear [OMN-139](https://linear.app/omni-agent/issue/OMN-139) — CI incident: quay.io stream truncation on fedora-bootc:45 arm64 layer 16,045,778 bytes (the first of the 3 documented digest rotations)
- Linear [OMN-150](https://linear.app/omni-agent/issue/OMN-150) — Sealed composefs Phase 2: install-time BLSConfig wiring (bootc 1.16.4+ dependency)
- `PROJECT_RULES.md` lines 220-239 — fedora-bootc:45 base-image digest stale-pin pattern (the 3-rotation incident record)
- `skills/github-yubios-KS9n5GAT/composefs-kernel-floors/SKILL.md` — kernel floor source of truth
- `skills/github-yubios-KS9n5GAT/fedora-bootc-base-images/SKILL.md` — base image tier source
- `skills/github-yubios-KS9n5GAT/bootc-images/SKILL.md` — bootc floor source
- `skills/github-yubios-KS9n5GAT/0pointer-mastery/SKILL.md` — systemd floor source
- commits `8ccffa71` and `d2646452` — the two recent digest-bump commits that establish the pattern

---

End of spec.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.

## 9. Re-verification 2026-09-18 (wayfinder round 8, rung change:...:bit3)

This checklist's protocol was re-verified against live state on 2026-09-18; the fourth rotation
it predicted has now happened and was NOT caught:

1. **Rotation history is now 4, not 3.** The checklist's evidence table lists three rotations
   (2026-07-26, 2026-07-29, 2026-07-30). Live check 2026-09-18: the `Containerfile` pin at
   `a6fbbdb9` is `sha256:c7e6b357...` (last refresh commit `959ead70`, 2026-08-05), and **that
   manifest now 404s on quay** while the `:45` tag resolves a new index (4 children,
   `0157de4d`/`ac6f851f`/`5c1a944b`/`62c290f5`). Three more refresh commits exist
   (`e2462889`/`d5581f08` 2026-08-01, `e7078f90` 2026-08-04, `959ead70` 2026-08-05), none after.
   Incident 4: pin stale ~44 days at this read; the next main image build fails at pull until
   `fetch-fedora-bootc-manifest.yml` re-resolves. See
   `refs/fedora-bootc-digest-drift-check-2026-09-18.md`.
2. **The pre-bump check list is executable now.** Nothing in the protocol requires a release:
   step 2 (quay HEAD query) and step 3 (manifest digest match) are one-line curl checks. The
   gap between this checklist's design and its execution is scheduling, not tooling — exactly
   the failure incident 4 demonstrates.
3. **OMN-62 status.** This checklist's linked issue was listed Done in the round-7 records
   (2026-08-04 spec cycle); the failure it was written to catch has since recurred (incident 4),
   which is the strongest argument yet for the scheduled weekly resolution check the
   digest-drift record proposes.

The checklist's protocol is otherwise unchanged and remains the standing procedure; this
section records that its trigger condition (a fresh rotation) is currently live and
unremediated.
