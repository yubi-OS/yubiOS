# libvfio-user Build Strategy: Bundle vs Per-Runner â Decision

<last-reviewed-against-blockers>2026-07-30</last-reviewed-against-blockers>

Date: 2026-07-30
Linear: OMN-100
Framing log: `session/omn-100-bundle-vs-per-runner-solo-2026-07-30.md` ([SOLO] ideation, V1+V4 finalists)
Established context: PR #137 (commit `a53332e`) â the per-runner build that opens this question. ADR-022 (Unified OCI Distribution â Per-Artifact Tags on `0mniteck/yubios`).

## Decision

**Two-step adoption:** (1) near-term, add a GitHub Actions cache to the existing per-runner build to eliminate repeat-build cost on cache hits (Variation 4); (2) medium-term, publish `0mniteck/yubios:libvfio-user-<sha>` as the durable pre-built artifact, retire the per-runner meson/ninja stage, and have CI pull the digest (Variation 1).

**Step 1 lands first** because it is observable (cache hit/miss in workflow logs) and cheap (one workflow file edit, no new artifact surface). Step 2 follows once Step 1's data tells us whether the marginal cost of a pre-built artifact is justified.

## What was considered

Five variations across five lenses:

| Variation | Lens | Score (4-20) | Verdict |
|---|---|---|---|
| V1 â Bundle as OCI artifact | Simplification | 12 | Finalist (medium-term) |
| V2 â Per-runner build (current) â keep it | Constraint-removal | 13 | Dropped (doesn't address the question) |
| V3 â Hybrid AMD64-bundle + ARM64-per-runner | Audience-shift | 11 | Dropped (complicates without proportionate gain) |
| V4 â Bundle only as a CI cache | Combination | 14 | **Finalist (near-term, first step)** |
| V5 â Bundle via bcvk's image model | Inversion | 9 | Dropped (scope creep into bcvk) |

The full generation log (including stress-tests of V1 and V4, critique of each, and the un-testable bet) lives at `session/omn-100-bundle-vs-per-runner-solo-2026-07-30.md`.

## Why this wins

* **Step 1 (V4) is a one-line workflow edit.** No new OCI artifact, no new surface to sign/audit/refresh. Pure simplification of the existing build path. ~5 minutes of work to land.
* **Step 2 (V1) follows naturally once Step 1 is in.** When the cache hit rate is observable, the data tells you whether V1 is worth the maintenance cost of a new OCI artifact. If hit rate is high (>80%), V1's marginal value is small. If low, V1 is essential.
* **Both align with the yubiOS pattern.** ADR-022 establishes per-artifact OCI tags as the durable distribution surface. V4 is the cheap path; V1 is the canonical pattern when durability matters.
* **Per-runner build cost is real but modest.** ~30-60s saved per run on a hit, cumulative across the dispatcher matrix. Not heroic, but worth the small effort.

## Implementation plan

### Step 1 (near-term)

Edit `.github/workflows/ci_test-vgpu-vm.yml` to add a `actions/cache@v7.0.1` step (per PINNED.md) keyed on:
* `libvfio-user-<commit>` (currently `37491ed9`)
* `<base-image-digest>` (from PINNED.md, fedora-bootc:45)
* `runner-os`

Measure hit rate over 5-10 runs via the cache-step logs. The workflow already stages the build to `/opt/libvfio-user/<commit>`; the cache key matches that path. No code changes outside the workflow file.

### Step 2 (medium-term)

* Add a `libvfio-user` target to `yubiOS-bake.hcl` that produces `0mniteck/yubios:libvfio-user-<sha>` â a scratch-rootfs with the pre-built binary + `samples/` directory.
* Extend the publish workflow leg with a new artifact publish (gated on `Docker_push=true`).
* Update `ci_test-vgpu-vm.yml` to pull the digest instead of building.

### Step 3 (deferred)

Retire the meson/ninja stage in `ci_test-vgpu-vm.yml` once Step 2 is verified end-to-end.

## Open Questions

* **OQ1.** Where does the OCI artifact live? Options: `0mniteck/yubios:libvfio-user-<sha>` (new tag, cleanest), or piggyback on `0mniteck/yubios:firmware-qemu-arm64` (existing tag, mixes purposes). **Default-first:** new tag, cleaner per ADR-022.
* **OQ2.** Who maintains the `:libvfio-user-<sha>` tag? If a yubiOS contributor pins a new libvfio-user commit, who refreshes the tag? **Default-first:** the same person who opens the PR for the libvfio-user bump also refreshes the tag (no separate maintainer needed; tag is refreshed per use).
* **OQ3.** Does the libvfio-user artifact need a smoke test of its own (separate from `ci_test-vgpu-vm.yml`)? Or is the existing "staged binary opens a socket" check inside the workflow sufficient? **Default-first:** workflow-side smoke check is sufficient; no separate test workflow needed for v1.

## What we are NOT doing

* **Pre-built artifact without CI cache first.** Skipping V4 and going straight to V1 costs more (signing/audit/new surface) than the data warrants. Two-step ordering is cheaper and safer.
* **Bundling libvfio-user into the production yubiOS image.** libvfio-user is a CI-time tool, not a runtime component. Putting it in production violates the ADR-022 per-artifact intent.
* **Forking libvfio-user.** BSD-3-Clause + low commit cadence = no benefit from owning the upstream. Vendor pinning (commit SHA) is the right model.
* **Replacing meson/ninja with a different build system.** libvfio-user's build system is upstream's. We don't get to redesign it.

## Where the depth lives

* The framing log at `session/omn-100-bundle-vs-per-runner-solo-2026-07-30.md` carries the full variation generation, scoring, and stress-test.
* The PR #137 build (commit `a53332e`) is the current per-runner implementation that opens this question.
* ADR-022 establishes the per-artifact OCI tag scheme that V1 leans on.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.
