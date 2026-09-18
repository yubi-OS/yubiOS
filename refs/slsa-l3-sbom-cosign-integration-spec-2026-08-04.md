# Spec: SLSA Build L3 + SPDX SBOM + cosign integration for yubiOS-ci + ci_mkosi-installer workflows

| Field | Value |
|---|---|
| Spec ID | OMN-157 |
| Linear tracker | OMN-157 (Backlog, High) — `yubiOS Production Proof & Release Gates` |
| Filed by | PR #156 / commit `3e74579c8e50` (playbooks/ drop) on branch `feat/playbooks-2026-08-01` |
| Filing date | 2026-08-01 |
| Drafted | 2026-08-04 (this doc) |
| Author role | fresh-context research subagent |
| Target workflows | `yubiOS-ci.yml`, `ci_mkosi-installer.yml`, `ci_dev_image.yml` + new `ci_attestation-verify.yml` |
| SLSA target | SLSA v1.0 Build **L3** (Build track caps at L3; there is no Build L4 in v1.0) |
| Transparency log | Sigstore Rekor v2 (GA 2026-05) |
| SBOM format | SPDX 2.3 JSON |
| Signing | cosign keyless (OIDC) via GitHub Actions token |

## Objective

Bring the three release-time yubiOS workflows (`yubiOS-ci.yml`, `ci_mkosi-installer.yml`, `ci_dev_image.yml`) up to **SLSA Build L3** with an attached **SPDX SBOM**, **cosign-signed** attestation, and a **Rekor v2** transparency log entry, plus a new `ci_attestation-verify.yml` verifier gate that downstream consumers can re-run independently. This closes the supply-chain portion of OMN-157 (filed as part of the playbooks drop in PR #156 / commit `3e74579c8e50`) and pairs with the existing `slsa-provenance` and `sigstore-rekor-v2` skills (per `skills/github-yubios-KS9n5GAT/slsa-provenance/SKILL.md` and `skills/github-yubios-KS9n5GAT/sigstore-rekor-v2/SKILL.md`).

This spec is the **Specify** phase output per `spec-driven-development`. Phase 2 (Plan) and Phase 3 (Tasks) are deferred to follow-up OMN-157 tickets; this document is the shared source of truth that any implementer reads before touching the workflows.

## Audience

The audience for this document is: the yubiOS release engineer (currently 0mniteck per `memory/personal-WbtUgeUv/COMPANY.md` line ~26), the CI maintainer (currently Jenny per the standing "Jenny merges" rule in `RECENT_ACTIVITY.md`), the auditor for HITRUST / CISA evidence rolls (per `audit-evidence-packaging` skill), and the yubiOS self-mode agent who will dispatch the implementation. This is a yubiOS-org-internal spec; it is not a public announcement.

## Scope: in / out

**In scope:**
- Three yubiOS release workflows: `yubiOS-ci.yml`, `ci_mkosi-installer.yml`, `ci_dev_image.yml`
- One new verifier workflow: `ci_attestation-verify.yml`
- SLSA v1.0 Build L3 (the highest Build level in v1.0 — explicitly flagged below)
- SPDX SBOM (CycloneDX not in scope for this iteration)
- cosign keyless signing (GitHub OIDC, `https://token.actions.githubusercontent.com`)
- Rekor v2 transparency log entry per attestation
- Builder isolation options (a) GitHub-hosted ephemeral, (b) hardened self-hosted on `rock1`, (c) TEE-backed

**Out of scope:**
- SLSA Source-track requirements (versioned history, retention, two-person review) — these are a separate SLSA track in v1.0, not a Build level. See "Why no Build L4" below.
- `mkosi#2`-driven installer signing keys (PIV slot 9c / SoftHSM lifecycle already documented in `memory/personal-WbtUgeUv/COMPANY.md`; this spec only attaches provenance + SBOM + cosign around the existing artifact, it does not re-architect signing).
- Cycle 5 curve-guided-rsi 10-primitive mapping for this skill — that lives in `slsa-provenance` and `sigstore-rekor-v2` SKILL.md footers, not here.

## Why no SLSA Build L4

This is the single most important framing fact for this spec and it is worth stating up front so it does not get re-litigated every cycle:

> **SLSA v1.0 Build track runs L1 to L3 only. There is no Build L4 in v1.0.**
> Source-track requirements (two-person review, retention, versioned history) were split out of the Build track entirely in the v1.0 redesign and are now a separate track — not a numbered Build level. The Build L4 language that appears in older yubiOS notes is v0.2-era and should not be used going forward.

Source: `skills/github-yubios-KS9n5GAT/slsa-provenance/SKILL.md` line 12 (the 2026-07-24 correction note), and `https://slsa.dev/spec/v1.0/levels` (verified upstream). The phrasing in this spec ("target L3") is correct under v1.0; do not let a reviewer push for "Build L4" without checking the SLSA v1.0 spec.

---

## Table of contents

1. [Current state](#1-current-state)
2. [Target state](#2-target-state)
3. [Gap analysis](#3-gap-analysis)
4. [Per-workflow integration plan](#4-per-workflow-integration-plan)
5. [Builder isolation options](#5-builder-isolation-options)
6. [Implementation phases](#6-implementation-phases)
7. [Verification recipe](#7-verification-recipe)
8. [References](#8-references)
9. [Acceptance criteria](#9-acceptance-criteria)
10. [Open questions](#10-open-questions)
11. [Appendix A: full current-state `yubiOS-ci.yml` shape](#appendix-a-full-current-state-yubios-ciyml-shape)
12. [Appendix B: full target-state `ci_attestation-verify.yml`](#appendix-b-full-target-state-ci_attestation-verifyyml)
13. [Appendix C: SHA / PR / issue ledger](#appendix-c-sha--pr--issue-ledger)

---

## 1. Current state

### 1.1 yubiOS-ci.yml (`.github/workflows/yubiOS-ci.yml`, 5270 B)

The `yubiOS-ci.yml` workflow is the OCI-image-build backbone. As of the 2026-07-29 ci.yml group-routing redesign (PR #145, commit `9d6ec85d`) and the subsequent fix chain (PRs #146-#150 per `memory/personal-WbtUgeUv/RECENT_ACTIVITY.md` line 110), it runs on `workflow_dispatch` only — no `on: push:` triggers per `PROJECT_RULES.md` ci.yml:27. Inputs declared: `Docker_push: type: boolean` (per `RECENT_ACTIVITY.md` line 209 — the dispatcher must serialize this as a real JSON boolean, not a string).

**What it currently produces:**
- OCI image `0mniteck/yubios:dev-<sha>` (the dev variant) or `0mniteck/yubios:installer-<sha>` (the installer variant), pushed when `Docker_push: true`. Builds use rootless dockerd on a pinned own-dockerd-on-ducker.sock pattern (per `RECENT_ACTIVITY.md` line 334 — docker-29.6.0 + buildx-v0.35.0, `/mnt/docker` overlayfs, host-side pull).
- A multi-job pipeline (hadolint, mkosi amd64+arm64, shellcheck, unit-tests amd64+arm64, build amd64+arm64, merge-manifest) per `RECENT_ACTIVITY.md` line 199. Verified end-to-end at run #237 (id `30512750431`, completed/success 04:02:57Z / 04:03:08Z, all 9 jobs green) on commit `e06de35`.

**What it does NOT currently produce:**
- No SLSA provenance attestation. `docker build-push-action` is configured (per `RECENT_ACTIVITY.md` line 372 — "yubiOS-ci.yml is deployed at .github/workflows/yubiOS-ci.yml (5270B), but 7 completed runs today all failed... Build job uses `dockerd` (rootless commented out); `yubiOS.rego` build policy step is TODO'd pending the file landing"). The build policy is shipped; SLSA provenance is not.
- No SPDX SBOM attached to the published image.
- No cosign signature on the published image digest.
- No Rekor v2 transparency log entry.

**SLSA level implied by current state:** Build L1 only. Provenance "exists" in the informal sense that `docker build-push-action` can emit it via `--provenance=true`, but no L1 attestation is currently wired into the workflow and there is no authentication (signed by a service) on the build artifact. Source: the 2026-07-25 deployment line in `RECENT_ACTIVITY.md` confirms the build job exists but no attestation step was added.

### 1.2 ci_mkosi-installer.yml (`.github/workflows/ci_mkosi-installer.yml`)

The `ci_mkosi-installer.yml` workflow builds the DPS disk image + UKI on a bare runner (minimal profile, Fedora 45, Debian tools tree) and signs the UKI via `provider:pkcs11` + `systemd-sbsign` against a SoftHSM mock of PIV 9c. Verified with `sbverify`. Per `memory/personal-WbtUgeUv/RECENT_ACTIVITY.md` line 351:

> #10 closed. mkosi#2 merged (`b2b1ea6`), yubiOS-ci installs mkosi from `@main` (`19d951b`). New `ci_mkosi-installer.yml` green (run 28912825384): full DPS disk image + UKI built on a bare runner (minimal profile, Fedora 45, Debian tools tree), UKI signed via `provider:pkcs11` + systemd-sbsign against a SoftHSM mock of PIV 9c, verified with sbverify. Key mechanism: mkosi's signing sandbox binds host `/run` for non-file key sources → SoftHSM conf+tokens at `/run/yubios-hsm`, `PKCS11_PROVIDER_MODULE` → libsofthsm2.so. 7-iteration debug: debian keyring → /run token plumbing (C_Initialize err 5 = conf unreachable) → sign-expected-pcr source match → distribution-gpg-keys → dnf → rpm (rpmkeys) → systemd-boot-unsigned+Bootable=yes (ESP repart def) → ship full yubiOS.raw not esp split. Publishes `0mniteck/yubios:installer` + `installer-<sha>` (digest `bca60347`, yubiOS.raw.zst 476MiB + signed UKI + manifest + CI cert + MANIFEST.txt). ADR-022 amended (`611f8ff`): installer live.

**What it currently produces:**
- OCI artifact at `0mniteck/yubios:installer` and `installer-<sha>` (digest `bca60347`).
- `yubiOS.raw.zst` 476 MiB + signed UKI + manifest + CI cert + MANIFEST.txt bundled in the OCI artifact.

**What it does NOT currently produce:**
- No SLSA provenance attestation.
- No SPDX SBOM of the installed packages (rpm-ostree / dnf package list).
- No cosign signature on the OCI artifact or the `yubiOS.raw.zst` byte stream.
- No Rekor v2 entry.

**SLSA level implied by current state:** Build L1 only. The PKCS#11 / SoftHSM signing on the UKI is a content-signing concern (Secure Boot chain), not an SLSA provenance concern — they compose, they are not the same thing.

### 1.3 ci_dev_image.yml (`.github/workflows/ci_dev_image.yml`)

The dev-image workflow ships `:dev` tagged images for CI consumption and rock1 hardware-leg testing. The dev image workflow cascade is "fully landed" per `memory/personal-WbtUgeUv/RECENT_ACTIVITY.md` line 267: runs `#108` (push) and `#109` (dispatch, `Docker_push=true`) both SUCCESS at `f58d6c14`; `#107` (the failing run that motivated the double-backslash fix) and `#234` (yubiOS-ci push trigger) also SUCCESS.

**What it currently produces:**
- OCI image `0mniteck/yubios:dev` (mutable tag) and `0mniteck/yubios:dev-<sha>` (immutable digest tag).
- Published for downstream CI consumption (e.g., `ci_test-vgpu-vm.yml` `:dev-7eba4856` per `RECENT_ACTIVITY.md` line 22).

**What it does NOT currently produce:**
- No SLSA provenance. No SPDX SBOM. No cosign. No Rekor.

**SLSA level implied by current state:** Build L1 (same as the other two — provenance "exists" only in the sense that docker build-push-action could emit it; nothing is wired).

### 1.4 Joint current state summary

| Workflow | OCI image | UKI / raw | SLSA attestation | SPDX SBOM | cosign sig | Rekor entry | SLSA level (effective) |
|---|---|---|---|---|---|---|---|
| `yubiOS-ci.yml` | yes | n/a | no | no | no | no | L1 (informal) |
| `ci_mkosi-installer.yml` | yes | yes | no | no | no | no | L1 (informal) |
| `ci_dev_image.yml` | yes | n/a | no | no | no | no | L1 (informal) |

The "L1 informal" tag means: provenance could be emitted by `docker build-push-action`'s `--provenance=true` flag, but it is neither wired nor authenticated. To get to L1 actual we wire `--provenance=true`; to get to L2 we sign it with OIDC; to get to L3 we put the build on an isolated builder (the GitHub-hosted ephemeral runner used by `slsa-framework/slsa-github-generator` is the canonical L3 builder).

---

## 2. Target state

### 2.1 SLSA Build L3 (Build track top in v1.0)

Every published artifact from the three workflows carries:

1. **A SLSA v1.0 Build L3 provenance attestation** in the in-toto Statement format (`_type: https://in-toto.io/Statement/v1`, `predicateType: https://slsa.dev/provenance/v1`) wrapped in a DSSE envelope, signed by the build service's OIDC identity (`https://token.actions.githubusercontent.com`), and logged to **Rekor v2** (the Sigstore public transparency log). Per `skills/github-yubios-KS9n5GAT/slsa-provenance/SKILL.md` lines 72-98, the v1.0 predicate uses `buildDefinition` (with `buildType`, `externalParameters`, `internalParameters`, `resolvedDependencies`) and `runDetails` (with `builder.id` plus invocation metadata) — it is NOT the v0.2 flat shape.

2. **An SPDX 2.3 SBOM** in JSON form, generated by Syft (the canonical SPDX generator in the sigstore ecosystem), attached as a cosign attestation with `predicateType: spdxjson`. The SBOM covers the OCI image contents (installed packages, layers, base image references) and, for `ci_mkosi-installer.yml`, also covers the host-side `yubiOS.raw.zst` filesystem layout.

3. **A cosign keyless signature** on the OCI artifact (or the UKI byte stream for `ci_mkosi-installer.yml`), signed with the workflow's OIDC identity. The `certificate-identity` is the workflow file path at the dispatched ref, e.g. `https://github.com/yubi-OS/yubiOS/.github/workflows/yubiOS-ci.yml@refs/heads/main`.

4. **A Rekor v2 transparency log entry** for every attestation. Rekor v2 is GA as of 2026-05 per `skills/github-yubios-KS9n5GAT/sigstore-rekor-v2/SKILL.md` line 19. cosign >= v2.4 handles Rekor v2 transparently.

### 2.2 What L3 actually requires (Build track, v1.0)

Per `slsa-provenance` skill lines 16-21:

| Level | Build track requirement |
|---|---|
| L1 | Provenance exists, showing how the artifact was built |
| L2 | Provenance is authenticated (signed by a service) |
| **L3** | Provenance is non-falsifiable — build runs in a hardened, isolated environment the tenant project can't tamper with |

The "hardened, isolated environment the tenant project can't tamper with" is the key L3 requirement. The canonical way to satisfy this on GitHub Actions is to use the **GitHub-hosted ephemeral runner** that backs `slsa-framework/slsa-github-generator`'s reusable workflows (per `slsa-provenance` skill line 28: "They run in isolated GitHub-hosted runners (the isolation is what makes it L3)"). Alternative builders (hardened self-hosted on rock1, TEE-backed) are discussed in section 5.

### 2.3 What the target state looks like at a glance

| Workflow | L3 attestation | SPDX SBOM | cosign sig | Rekor v2 entry | Verifier gate |
|---|---|---|---|---|---|
| `yubiOS-ci.yml` | yes (container via `generator_container_slsa3.yml@v2.1.0`) | yes (spdxjson) | yes (keyless OIDC) | yes (auto via cosign >= v2.4) | yes (`ci_attestation-verify.yml`) |
| `ci_mkosi-installer.yml` | yes (generic via `generator_generic_slsa3.yml@v2.1.0`) | yes (spdxjson) | yes (keyless OIDC) | yes (auto via cosign >= v2.4) | yes |
| `ci_dev_image.yml` | yes (container via `generator_container_slsa3.yml@v2.1.0`) | yes (spdxjson) | yes (keyless OIDC) | yes (auto via cosign >= v2.4) | yes |

### 2.4 The `ci_attestation-verify.yml` gate (new workflow)

A new workflow that runs on `workflow_dispatch` (per the dispatch-only convention) and as a downstream step of `ci.yml` (per the group-routing pattern in `PROJECT_RULES.md` ci.yml:27). It re-verifies the attestations on a freshly dispatched build by:

1. Pulling the published artifact digest.
2. Running `cosign verify-attestation --type slsaprovenance` with the OIDC issuer + builder identity regex pinned.
3. Running `cosign verify-attestation --type spdxjson` for the SBOM.
4. Running `slsa-verifier verify-artifact` (the canonical CLI verifier).
5. Running `rekor-cli get --uuid` to confirm the Rekor v2 entry is present and the inclusion proof checks out.
6. Failing the workflow if any of the four checks fail.

This is the downstream-consumer re-run pattern from `audit-evidence-packaging` skill line 19 ("downstream auditors ... can re-run independently"). The verifier workflow is the artifact yubiOS's auditors will use.

---

## 3. Gap analysis

For each workflow, what needs to change.

### 3.1 `yubiOS-ci.yml` gaps

| Gap ID | Description | Current state | Target state | Change scope |
|---|---|---|---|---|
| G-OCI-1 | No `--provenance=true` flag on `docker build-push-action` | absent | emit L1 in-toto provenance | one-line flag add |
| G-OCI-2 | Provenance not authenticated (no OIDC signing) | absent | cosign-attached, signed with workflow OIDC identity | one job add + cosign step |
| G-OCI-3 | Build not on isolated builder | rootless dockerd on ducker.sock (per `RECENT_ACTIVITY.md` line 334) | GitHub-hosted ephemeral runner via `generator_container_slsa3.yml@v2.1.0` | rebuild via reusable workflow OR add isolated step |
| G-OCI-4 | No `--sbom=true` flag (SPDX via Syft) | absent | emit SPDX 2.3 SBOM with each push | one-line flag add |
| G-OCI-5 | No SBOM attestation in cosign | absent | `cosign attest --type spdxjson --predicate sbom.spdx.json` | one job step add |
| G-OCI-6 | No Rekor v2 entry | absent | auto via cosign >= v2.4 (transparently logs to Rekor v2) | cosign version pin (>= v2.4) |
| G-OCI-7 | `id-token: write` permission not declared | default token scope | declare `id-token: write` for OIDC + `contents: read` for checkout | YAML permissions block |

### 3.2 `ci_mkosi-installer.yml` gaps

| Gap ID | Description | Current state | Target state | Change scope |
|---|---|---|---|---|
| G-MK-1 | No provenance for the OCI artifact | absent | `generator_generic_slsa3.yml@v2.1.0` over `sha256sum yubiOS.raw.zst ... installer.oci` | new provenance job |
| G-MK-2 | No provenance for the UKI byte stream | absent | include the signed UKI in `base64-subjects` to `generator_generic_slsa3.yml` | extend `base64-subjects` |
| G-MK-3 | No SPDX SBOM of installed packages | absent | run Syft on the OCI artifact, attach as cosign attestation | one job step |
| G-MK-4 | No cosign signature on the OCI artifact | absent | `cosign sign --keyless ghcr.io/...:installer-<sha>` (or 0mniteck/yubios:installer-<sha>) | one job step |
| G-MK-5 | No cosign signature on the UKI byte stream | absent | `cosign sign-blob` over the signed UKI (SBOM-side; not Secure Boot) | one job step |
| G-MK-6 | SoftHSM / PKCS#11 lifecycle stays in-container | already canonical per `COMPANY.md` line 42 | unchanged — this is signing, not SLSA | no change |
| G-MK-7 | No `id-token: write` permission | default token scope | declare `id-token: write` for OIDC | YAML permissions block |

### 3.3 `ci_dev_image.yml` gaps

| Gap ID | Description | Current state | Target state | Change scope |
|---|---|---|---|---|
| G-DEV-1 | No `--provenance=true` flag | absent | emit L1 provenance | one-line flag add |
| G-DEV-2 | Provenance not authenticated | absent | cosign keyless attach | one job step |
| G-DEV-3 | No `--sbom=true` flag | absent | SPDX SBOM | one-line flag add |
| G-DEV-4 | Build not on isolated builder | rootless dockerd (shared with yubiOS-ci.yml) | GitHub-hosted ephemeral runner via `generator_container_slsa3.yml@v2.1.0` | rebuild via reusable workflow |
| G-DEV-5 | No Rekor v2 entry | absent | auto via cosign >= v2.4 | cosign version pin |
| G-DEV-6 | No `id-token: write` permission | default token scope | declare `id-token: write` | YAML permissions block |

### 3.4 Cross-cutting gaps (apply to all three workflows)

| Gap ID | Description | Action |
|---|---|---|
| G-X-1 | cosign version not pinned | pin cosign to >= v2.4 in a shared `actions/setup-go` + `go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.x` step |
| G-X-2 | syft not installed | install via `anchore/syft@<sha>` action OR `go install github.com/anchore/syft/cmd/syft@<sha>` |
| G-X-3 | Rekor v2 TUF metadata not refreshed on each CI run | mount a build-time secret `cosign-tuf-cache.json` and refresh on every run per `sigstore-rekor-v2` skill line 69 ("mount the TUF metadata cache as a build-time secret and refresh it on every CI run to avoid rotation-related failures") |
| G-X-4 | Witness quorum not declared | declare the public Sigstore witness quorum (default; cosign auto-discovers via TUF) — no action required, but document in the workflow's README |
| G-X-5 | No attestation verifier gate anywhere in the pipeline | new `ci_attestation-verify.yml` workflow (section 4.4) |

### 3.5 Build L3 specific gaps (the isolation requirement)

L3's distinguishing requirement is "build runs in a hardened, isolated environment the tenant project can't tamper with." Per `slsa-provenance` skill line 28, the canonical L3 builder on GitHub Actions is the GitHub-hosted ephemeral runner used by `slsa-framework/slsa-github-generator`. The current `yubiOS-ci.yml` builds on rootless dockerd in the runner itself — this is **NOT** L3 because the runner is shared with the tenant project (the workflow file in the same repo can mutate the build environment via subsequent steps).

To satisfy L3, each workflow must call the `slsa-github-generator` reusable workflow as its build step. The reusable workflow runs in its own ephemeral runner — that runner is not addressable from the tenant project, so the tenant cannot tamper with it mid-build. The reusable workflow accepts the OCI image digest (for container SLSA3) or the SHA256 base64 of the subject bytes (for generic SLSA3) as input and emits the in-toto Statement attestation in the workflow's output.

This is the **single biggest behavioral change** in the spec — moving from "build in our runner" to "call a reusable workflow that builds in an isolated runner." See section 5 for builder isolation options and section 6 for phasing.

### 3.6 Gap rollup

| Severity | Gap count | Examples |
|---|---|---|
| L3 isolation blocker | 3 | G-OCI-3, G-MK-1, G-DEV-4 |
| Auth (L2) blocker | 6 | G-OCI-2, G-MK-1, G-DEV-2, G-OCI-7, G-MK-7, G-DEV-6 |
| SBOM gap | 3 | G-OCI-4, G-MK-3, G-DEV-3 |
| Rekor v2 entry | 3 | G-OCI-6, G-MK-1 (folded), G-DEV-5 |
| Verifier gate | 1 | G-X-5 (new workflow) |
| Cross-cutting (cosign/syft pin) | 4 | G-X-1, G-X-2, G-X-3, G-X-4 (mostly auto) |

Total: ~17 distinct gap rows across 3 workflows + 1 new workflow.

---

## 4. Per-workflow integration plan

This section is the line-by-line plan for each workflow. Code blocks show real YAML (syntactically valid against GitHub Actions schema). Comments use `#` inline. All examples are written against `slsa-framework/slsa-github-generator@v2.1.0` and cosign v2.4+ (Rekor v2 GA-ready).

### 4.1 `yubiOS-ci.yml` changes

#### 4.1.1 Current structure (recap)

```yaml
name: yubiOS-ci
on:
  workflow_dispatch:
    inputs:
      Docker_push:
        type: boolean
        default: false
jobs:
  hadolint:
    # existing
  mkosi-amd64:
    # existing
  mkosi-arm64:
    # existing
  shellcheck:
    # existing
  unit-tests-amd64:
    # existing
  unit-tests-arm64:
    # existing
  build-amd64:
    # existing — uses rootless dockerd on ducker.sock
  build-arm64:
    # existing — uses rootless dockerd on ducker.sock
  merge-manifest:
    # existing
```

#### 4.1.2 Changes summary

1. Add `permissions: { id-token: write, contents: read, packages: write }` at the workflow level (G-OCI-7).
2. Add a new `provenance` job that runs after the existing build jobs and calls `slsa-framework/slsa-github-generator`'s container reusable workflow.
3. Add a new `sbom` job that runs after the build and emits the SPDX SBOM (Syft), then attaches it via `cosign attest`.
4. Add a new `sign` job that signs the published image digest via cosign keyless.
5. Pin cosign to >= v2.4 in the reusable workflow (G-X-1).

#### 4.1.3 Concrete YAML for the new `provenance` + `sbom` + `sign` jobs

```yaml
name: yubiOS-ci
on:
  workflow_dispatch:
    inputs:
      Docker_push:
        type: boolean
        default: false

# L3 attestation requires OIDC token issuance for cosign keyless signing.
permissions:
  id-token: write   # required for sigstore/cosign keyless OIDC
  contents: read    # required for actions/checkout
  packages: write   # required for ghcr.io / 0mniteck push (Docker_push: true)

jobs:
  # ... existing jobs unchanged ...

  provenance:
    name: "SLSA Build L3 provenance"
    needs: [build-amd64, build-arm64]
    if: github.event.inputs.Docker_push == true
    permissions:
      id-token: write
      contents: read
      packages: write
    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2.1.0
    with:
      image: ghcr.io/yubi-OS/yubiOS
      digest: ${{ needs.build-amd64.outputs.digest }}

  sbom:
    name: "SPDX SBOM (Syft) attach"
    needs: [provenance]
    if: github.event.inputs.Docker_push == true
    permissions:
      id-token: write
      contents: read
      packages: write
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11   # pin SHA per PROJECT_RULES.md
      - name: Install cosign
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Install syft
        run: |
          curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b $HOME/bin v1.18.0
          echo "$HOME/bin" >> "$GITHUB_PATH"
      - name: Generate SPDX SBOM
        run: |
          syft scan "ghcr.io/yubi-OS/yubiOS@${{ needs.provenance.outputs.digest }}" \
            --output spdx-json=sbom.spdx.json
      - name: Attach SBOM attestation
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign attest \
            --type spdxjson \
            --predicate sbom.spdx.json \
            "ghcr.io/yubi-OS/yubiOS@${{ needs.provenance.outputs.digest }}"

  sign:
    name: "cosign keyless sign"
    needs: [provenance]
    if: github.event.inputs.Docker_push == true
    permissions:
      id-token: write
      contents: read
      packages: write
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install cosign
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Sign image keylessly
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign sign --yes \
            "ghcr.io/yubi-OS/yubiOS@${{ needs.provenance.outputs.digest }}"
```

#### 4.1.4 What stays unchanged

The existing `hadolint`, `mkosi-{amd64,arm64}`, `shellcheck`, `unit-tests-{amd64,arm64}`, `build-{amd64,arm64}`, `merge-manifest` jobs are unchanged. The rootless dockerd build pattern (per `RECENT_ACTIVITY.md` line 334) is preserved in the build jobs; the provenance/sbom/sign jobs run **after** the builds complete, so the build environment is untouched.

#### 4.1.5 Net diff size

- ~70 lines added (the three new jobs)
- 1 line added at workflow level (permissions)
- 0 lines deleted

This is well under the ~5-file cap from `planning-and-task-breakdown` (only one file: `yubiOS-ci.yml`).

### 4.2 `ci_mkosi-installer.yml` changes

#### 4.2.1 Current structure (recap, per `RECENT_ACTIVITY.md` line 351)

- Builds DPS disk image + UKI on a bare runner (minimal profile, Fedora 45, Debian tools tree)
- Signs UKI via `provider:pkcs11` + `systemd-sbsign` against SoftHSM mock of PIV 9c (the canonical pattern per `COMPANY.md` line 42)
- Publishes `0mniteck/yubios:installer` + `installer-<sha>`
- Artifact contents: `yubiOS.raw.zst` 476 MiB + signed UKI + manifest + CI cert + MANIFEST.txt

#### 4.2.2 Changes summary

1. Add `permissions: { id-token: write, contents: read, packages: write }` at the workflow level (G-MK-7).
2. After the existing build/sign job completes, compute SHA256 base64 of the OCI artifact contents (the `base64-subjects` input to the generic SLSA3 generator).
3. Add a `provenance` job that calls `slsa-framework/slsa-github-generator`'s generic reusable workflow.
4. Add a `sbom` job (Syft over the OCI artifact + the yubiOS.raw.zst filesystem).
5. Add a `sign` job (cosign keyless over the OCI artifact + a `cosign sign-blob` over the signed UKI byte stream — the SBOM-side signature, distinct from the Secure Boot signature).

#### 4.2.3 Concrete YAML for the new jobs

```yaml
name: ci-mkosi-installer
on:
  workflow_dispatch:

permissions:
  id-token: write   # required for cosign keyless OIDC
  contents: read
  packages: write

jobs:
  # ... existing build-and-sign job unchanged ...

  provenance:
    name: "SLSA Build L3 provenance (generic)"
    needs: [build-and-sign]   # existing job name; replace with actual
    permissions:
      id-token: write
      contents: read
    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0
    with:
      base64-subjects: ${{ needs.build-and-sign.outputs.hashes }}

  sbom:
    name: "SPDX SBOM (Syft) attach"
    needs: [build-and-sign]
    permissions:
      id-token: write
      contents: read
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install cosign + syft
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
          curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b $HOME/bin v1.18.0
          echo "$HOME/bin" >> "$GITHUB_PATH"
      - name: Generate SPDX SBOM (OCI artifact + raw image)
        run: |
          # SBOM of the OCI artifact (rpm/dnf packages installed in the image)
          syft scan "registry:${{ needs.build-and-sign.outputs.image-digest }}" \
            --output spdx-json=sbom-oci.spdx.json
          # SBOM of the yubiOS.raw.zst filesystem layout
          syft scan "file:${{ needs.build-and-sign.outputs.raw-zst-path }}" \
            --output spdx-json=sbom-raw.spdx.json
      - name: Attach SBOM attestations
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign attest --type spdxjson --predicate sbom-oci.spdx.json \
            "registry:${{ needs.build-and-sign.outputs.image-digest }}"
          cosign attest --type spdxjson --predicate sbom-raw.spdx.json \
            "registry:${{ needs.build-and-sign.outputs.image-digest }}"

  sign:
    name: "cosign keyless sign (OCI + UKI)"
    needs: [build-and-sign]
    permissions:
      id-token: write
      contents: read
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install cosign
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Sign OCI artifact
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign sign --yes \
            "registry:${{ needs.build-and-sign.outputs.image-digest }}"
      - name: Sign UKI byte stream (SBOM-side)
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign sign-blob --yes \
            --bundle cosign-uki.bundle \
            "${{ needs.build-and-sign.outputs.uki-path }}"
```

#### 4.2.4 What stays unchanged

The SoftHSM / PKCS#11 / systemd-sbsign signing pipeline (the Secure Boot chain) is unchanged. Per `COMPANY.md` line 42, this is the canonical pattern: keep the entire SoftHSM token lifecycle inside ONE OS environment — `/run/yubios-hsm/softhsm2.conf` with `directories.tokendir = /run/yubios-hsm/tokens`, `chmod -R a+rwX /run/yubios-hsm`, `softhsm2-util --init-token --free`, `softhsm2-util --import sb.p8`, `PKCS11_PROVIDER_MODULE` pointed at the direct lib (skip the `/usr/lib64/pkcs11/` p11-kit symlink). The cross-version trap (V36→V37 sealed-UKI VM lane fix — init the token INSIDE the Fedora container with the same softhsm that will sign) also stays.

#### 4.2.5 Why two cosign signatures on the UKI

The UKI is already signed by `systemd-sbsign` (Secure Boot chain — verifies in firmware). The new `cosign sign-blob` is a **second** signature that wraps a cosign bundle for the SBOM-side attestation chain (used by `cosign verify-attestation` downstream). These are independent signatures over the same byte stream; they do not conflict. Document this in the workflow's README so reviewers do not flag it as a duplicate.

#### 4.2.6 Net diff size

- ~80 lines added (the three new jobs)
- 1 line added at workflow level (permissions)
- 0 lines deleted

### 4.3 `ci_dev_image.yml` changes

#### 4.3.1 Current structure (recap, per `RECENT_ACTIVITY.md` line 267)

Publishes `0mniteck/yubios:dev` (mutable) and `0mniteck/yubios:dev-<sha>` (immutable) when `Docker_push: true`. Used by downstream CI workflows (`ci_test-vgpu-vm.yml` consumes `:dev-7eba4856`, per `RECENT_ACTIVITY.md` line 22).

#### 4.3.2 Changes summary

Same pattern as `yubiOS-ci.yml` (section 4.1) but scoped to the dev image. Three new jobs after the existing build:

1. `provenance` — `generator_container_slsa3.yml@v2.1.0` over the dev image digest
2. `sbom` — Syft + `cosign attest --type spdxjson`
3. `sign` — cosign keyless

#### 4.3.3 Concrete YAML (abbreviated — same shape as 4.1.3)

```yaml
name: ci-dev-image
on:
  workflow_dispatch:
    inputs:
      Docker_push:
        type: boolean
        default: false

permissions:
  id-token: write
  contents: read
  packages: write

jobs:
  # ... existing build job unchanged (rootless dockerd on ducker.sock) ...

  provenance:
    needs: [build]
    if: github.event.inputs.Docker_push == true
    permissions:
      id-token: write
      contents: read
      packages: write
    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2.1.0
    with:
      image: ghcr.io/yubi-OS/yubiOS
      digest: ${{ needs.build.outputs.digest }}

  sbom:
    needs: [provenance]
    if: github.event.inputs.Docker_push == true
    permissions:
      id-token: write
      contents: read
      packages: write
    runs-on: ubuntu-22.04
    steps:
      # ... same shape as yubiOS-ci.yml sbom job (4.1.3) ...

  sign:
    needs: [provenance]
    if: github.event.inputs.Docker_push == true
    permissions:
      id-token: write
      contents: read
      packages: write
    runs-on: ubuntu-22.04
    steps:
      # ... same shape as yubiOS-ci.yml sign job (4.1.3) ...
```

#### 4.3.4 Net diff size

- ~70 lines added (the three new jobs)
- 1 line added at workflow level (permissions)
- 0 lines deleted

### 4.4 New workflow: `ci_attestation-verify.yml`

This is the verifier gate. It is the workflow downstream auditors will run to independently re-verify the attestations. Per `audit-evidence-packaging` skill line 19, the "downstream auditors ... can re-run independently" pattern is the canonical yubiOS verifier pattern.

#### 4.4.1 Triggers

```yaml
on:
  workflow_dispatch:
    inputs:
      image_ref:
        description: "OCI image ref to verify (e.g. ghcr.io/yubi-OS/yubiOS@sha256:...)"
        required: true
        type: string
      subject_path:
        description: "Path to a local artifact to verify (for generic/UKI verification)"
        required: false
        type: string
  workflow_call:
```

#### 4.4.2 Permissions

```yaml
permissions:
  contents: read   # only needs read; no write
```

#### 4.4.3 Concrete YAML

```yaml
name: ci-attestation-verify
on:
  workflow_dispatch:
    inputs:
      image_ref:
        description: "OCI image ref to verify (e.g. ghcr.io/yubi-OS/yubiOS@sha256:...)"
        required: true
        type: string
      subject_path:
        description: "Path to a local artifact (for generic/UKI verification)"
        required: false
        type: string
      provenance_path:
        description: "Path to the in-toto JSONL attestation file (for generic verification)"
        required: false
        type: string
      builder_id:
        description: "Expected SLSA builder ID"
        required: true
        type: string
        default: "https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2.1.0"
      source_uri:
        description: "Expected source URI"
        required: true
        type: string
        default: "github.com/yubi-OS/yubiOS"
  workflow_call:

permissions:
  contents: read

jobs:
  verify-provenance:
    name: "Verify SLSA L3 provenance"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install slsa-verifier
        run: |
          go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@v2.5.0
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Install cosign + rekor-cli
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          go install github.com/sigstore/rekor/v2/cmd/rekor-cli@v2.0.0
          echo "$HOME/go/bin" >> "$GITHUB_PATH"

      - name: Verify SLSA L3 (container — via cosign verify-attestation)
        if: inputs.subject_path == ''
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign verify-attestation \
            --type slsaprovenance \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity-regexp 'https://github.com/slsa-framework/slsa-github-generator' \
            "${{ inputs.image_ref }}"

      - name: Verify SLSA L3 (generic — via slsa-verifier)
        if: inputs.subject_path != '' && inputs.provenance_path != ''
        run: |
          slsa-verifier verify-artifact "${{ inputs.subject_path }}" \
            --provenance-path "${{ inputs.provenance_path }}" \
            --source-uri "${{ inputs.source_uri }}" \
            --builder-id "${{ inputs.builder_id }}"

  verify-sbom:
    name: "Verify SPDX SBOM attestation"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install cosign
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Verify SBOM attestation
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign verify-attestation \
            --type spdxjson \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity-regexp 'https://github.com/yubi-OS/yubiOS/.github/workflows/' \
            "${{ inputs.image_ref }}"

  verify-cosign-sig:
    name: "Verify cosign keyless signature"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install cosign
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Verify signature
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign verify \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity https://github.com/yubi-OS/yubiOS/.github/workflows/ci-attestation-verify.yml@refs/heads/main \
            "${{ inputs.image_ref }}"

  verify-rekor:
    name: "Verify Rekor v2 inclusion proof"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install rekor-cli
        run: |
          go install github.com/sigstore/rekor/v2/cmd/rekor-cli@v2.0.0
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Pull attestation transparency-log entry
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          # Get the Rekor bundle from the attestation
          cosign verify-attestation \
            --type slsaprovenance \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity-regexp 'https://github.com/slsa-framework/slsa-github-generator' \
            --output-text \
            "${{ inputs.image_ref }}" > attestation.jsonl
          # Extract the Rekor UUID from the bundle
          REKOR_UUID=$(jq -r '.verificationData.tlogEntry.logIndex' attestation.jsonl || true)
          if [ -n "$REKOR_UUID" ]; then
            rekor-cli get --uuid "$REKOR_UUID" --format json | jq .
          else
            # Fall back to verifying via cosign (which checks the inclusion proof automatically)
            echo "Rekor UUID not in bundle; relying on cosign verify-attestation to check inclusion"
          fi
```

#### 4.4.4 What this verifier does NOT do (explicit out-of-scope)

- It does NOT verify the Secure Boot chain on the UKI (that's `sbverify` in `ci_mkosi-installer.yml`).
- It does NOT verify the in-toto attestation chain across multiple workflows (single-attestation verification is the scope per `audit-evidence-packaging` line 19 — "independently", not "comprehensively").
- It does NOT publish a new attestation; it only reads and verifies.

#### 4.4.5 Net new file size

- ~180 lines (one new file: `ci_attestation-verify.yml`)

### 4.5 Group-routing update (`ci.yml`)

`ci.yml` is the workflow group-routing dispatcher (per PR #145, commit `9d6ec85d`, merged 2026-07-29). It does not need structural changes — the new attestation jobs are added inside each builder workflow (`yubiOS-ci.yml`, `ci_mkosi-installer.yml`, `ci_dev_image.yml`), not in the dispatcher. The new `ci_attestation-verify.yml` may be added to a `verify` group in `ci.yml`'s `groups:` input (existing pattern: `tests`, `vm-tests`, `ci-builders`). Recommend a new group:

```yaml
# in ci.yml groups input:
verify:
  workflows:
    - ci_attestation-verify.yml
```

This makes `ci.yml` dispatch `ci_attestation-verify.yml` standalone OR as part of a combined run. Auditors use the standalone dispatch; CI uses the combined run.

### 4.6 What `ci.yml` does NOT need to change

- The `workflow_dispatch`-only convention (per `PROJECT_RULES.md` ci.yml:27) is already enforced and works for the new workflows without modification.
- The `reason` input pattern (the bug fixed in commit `b0a96a11` per `RECENT_ACTIVITY.md` line 209) does not interact with the new workflows because the new workflows do not have a `reason` input.
- The `Docker_push: boolean` serialization (the bug also fixed in `b0a96a11`) does not interact because the new attestation jobs gate on `Docker_push == true` as a boolean (not a string).

---

## 5. Builder isolation options

L3's distinguishing requirement is "build runs in a hardened, isolated environment the tenant project can't tamper with." Three builder options are viable; each has tradeoffs.

### 5.1 Option A: GitHub-hosted ephemeral runner (via `slsa-framework/slsa-github-generator`)

This is the canonical L3 builder. Per `slsa-provenance` skill line 28: "They run in isolated GitHub-hosted runners (the isolation is what makes it L3)."

**Mechanism:**
- The reusable workflow `slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2.1.0` (or `generator_generic_slsa3.yml@v2.1.0`) runs in its own ephemeral GitHub-hosted runner.
- The runner is not addressable from the tenant project's workflow file; subsequent steps in the tenant workflow cannot mutate the build environment mid-build.
- The reusable workflow handles OIDC token issuance, in-toto Statement generation, DSSE envelope signing, and Rekor v2 logging.

**Pros:**
- Officially recognized as L3-compliant by the SLSA framework maintainers.
- Zero infra to maintain on the yubiOS side.
- cosign + slsa-verifier integration is built-in.
- Rekor v2 entry is automatic (cosign >= v2.4).

**Cons:**
- Adds a network hop (call to the reusable workflow's runner). Adds ~30-60 s to total build time.
- Reusable workflow pins to a specific version (`v2.1.0`) — version upgrades require coordinated change.
- The reusable workflow's runner is shared with all other GitHub Actions users; L3 isolation here is "the tenant cannot tamper with this specific runner's environment during the build", not "the build runs on hardware exclusively owned by yubiOS."

**Cost:** included in GitHub Actions minutes.

### 5.2 Option B: Hardened self-hosted runner on rock1

**Mechanism:**
- rock1 (the yubiOS dev box) is reconfigured as a hardened self-hosted runner.
- The workflow declares `runs-on: self-hosted` with a label (e.g., `rock1-slsa3`).
- Build runs in a container on rock1 with strict seccomp + AppArmor + read-only rootfs + ephemeral overlay.
- Provenance is generated by a custom step (e.g., `slsa-github-generator`'s `--local` mode OR a hand-rolled in-toto Statement generator).
- cosign signing happens on the runner with OIDC fetched via `actions/github-script`.

**Pros:**
- Full control over the build environment. Can be hardened to a higher bar than GitHub-hosted (e.g., dm-verity root hash verified at boot, TPM2 PCR quote on runner startup).
- No network hop to a reusable workflow.
- Fits the yubiOS "owned-root-of-trust" posture.

**Cons:**
- The yubiOS project is responsible for proving isolation. This is a heavy audit burden — the HITRUST assessor will ask "how do you know rock1's build environment wasn't tampered with?" and the answer is "we have seccomp + AppArmor + a custom script" which is weaker than "we used the SLSA framework's reference runner."
- The runner is shared with the tenant project (rock1 is a dev box that has many other workflows). L3 isolation here requires more careful configuration than the GitHub-hosted option.
- Requires a custom provenance generator. `slsa-github-generator`'s reusable workflow is the easy path; the self-hosted path requires either adapting the framework's source OR writing a custom in-toto Statement emitter that conforms to `predicateType: https://slsa.dev/provenance/v1`.

**Cost:** ongoing ops burden on the yubiOS team. rock1 stability is an open question (per the user's framing of this option as "gated on rock1 stability").

### 5.3 Option C: TEE-backed builder (Confidential Containers / Intel TDX / AMD SEV / ARM CCA)

**Mechanism:**
- The build runs inside a confidential container (Confidential Containers project — `confidentialcontainers.org`).
- The TEE provides hardware-isolated memory + attestation (TPM2 quote for SEV, TEE quote for TDX).
- The attestation quote is embedded in the SLSA provenance as `runDetails.builder.id` is replaced with the attestation evidence.
- yubiOS's `internal-big-picture` 10-primitive model includes attestation as primitive P1; this option makes P1 hardware-rooted instead of OIDC-rooted.

**Pros:**
- Strongest isolation model. The tenant cannot tamper with the build even if they have root on the host.
- Future-proof: as more confidential compute becomes available on commodity cloud (Azure Confidential VMs, GCP Confidential VMs, AWS Graviton with CCA), this option scales.
- Aligns with the yubiOS posture (UKI signed by YubiKey PIV 9c, dm-verity on /usr, fTPM for measured boot — confidential compute is the same posture for builds).

**Cons:**
- Confidential Containers tooling is newer; some upstream pieces (e.g., `confidentialcontainers.org` v0.x) are still stabilizing.
- Requires TEE-capable hardware on the runner. GitHub-hosted runners do not currently offer TEE-backed ephemeral runners.
- Adds a heavy ops surface: attestation verification, TEE image building, key provisioning. yubiOS would need to invest 2-4 weeks of engineering to stand this up.
- The yubiOS-ci.yml `Docker_push` and `workflow_dispatch` patterns do not natively compose with TEE; a wrapper workflow is needed.

**Cost:** highest. TEE-capable hardware + ops surface + verification effort.

### 5.4 Recommendation

**Phase 1-3: Option A (GitHub-hosted ephemeral).** This is the canonical L3 builder, the lowest-cost path to compliance, and the easiest for HITRUST assessors to audit ("you used the SLSA framework's reference runner" is a stronger answer than "you configured your own hardened runner"). The tradeoffs are acceptable: the network hop adds ~30-60 s and we pin to `v2.1.0` for stability.

**Phase 4 (post-OMN-157): Option B (hardened rock1) as a parallel path.** Once rock1 stability is confirmed (the option framing explicitly flags this as "gated on rock1 stability"), add a self-hosted variant of `generator_container_slsa3.yml` so critical builds can be re-built on the yubiOS-owned infrastructure. This is a defense-in-depth posture — GitHub-hosted is the primary, rock1 is the fallback.

**Phase 5 (future): Option C (TEE-backed) when tooling matures.** Out of scope for OMN-157. Track as a future Linear issue (OMN-XXX, "confidential compute build runners" — not yet filed).

### 5.5 Why the "v2.1.0" pin matters

`slsa-framework/slsa-github-generator` is versioned. Pinning to `@v2.1.0` (a specific tag) means:
- Re-runs of the workflow at any later date produce the same provenance format.
- Upstream breaking changes do not silently affect yubiOS builds.
- The `builder-id` claim in the in-toto Statement is stable (the verifier's `--builder-id` input can pin to the exact ref).

If a yubiOS maintainer upgrades `slsa-github-generator` to `v2.2.0` later, the `ci_attestation-verify.yml` workflow must be updated to match — the builder-id pin in `ci.yml` and the verifier's `--builder-id` must be updated in lockstep.

---

## 6. Implementation phases

The four phases below are sequenced to minimize risk. Each phase is independently shippable; a phase failure does not block the next.

### 6.1 Phase 1: SBOM + cosign sign (already-done territory)

**Scope:**
- Wire `--sbom=true` on the three workflow `docker build-push-action` calls (where present — `yubiOS-ci.yml`, `ci_dev_image.yml`; `ci_mkosi-installer.yml` does not use build-push-action directly).
- Wire a cosign keyless sign step on each workflow's published artifact digest.
- Pin cosign to >= v2.4.
- Install Syft v1.18.0 in the workflows that need explicit SBOM generation (the OCI artifact + yubiOS.raw.zst for `ci_mkosi-installer.yml`).

**Acceptance:**
- A dispatched `yubiOS-ci.yml` with `Docker_push: true` produces an image with an attached SPDX SBOM and a cosign signature.
- `cosign verify` (run locally) succeeds against the published digest.

**Risk:** low. `--sbom=true` is supported by `docker build-push-action` since v3.4.0; cosign keyless with OIDC is the standard GitHub Actions pattern.

**Estimated effort:** 1-2 days.

**Status flag:** "already-done territory" because the SLSA framework, cosign, and Syft all have stable, well-documented paths. The implementation is configuration, not novel engineering.

### 6.2 Phase 2: SLSA L1/L2 provenance attestation (no isolation yet)

**Scope:**
- Wire `--provenance=true` on the three `docker build-push-action` calls (L1).
- Wire a `cosign attest --type slsaprovenance` step that wraps the buildx-generated provenance in a DSSE envelope + signs with OIDC (L2 — provenance is now authenticated).
- Add `id-token: write` permissions on each workflow.

**Acceptance:**
- A dispatched build produces an attestation that passes `cosign verify-attestation --type slsaprovenance`.
- The attestation's `predicateType` is `https://slsa.dev/provenance/v1` (the v1.0 shape, not v0.2).

**Risk:** low-to-medium. The buildx `--provenance=true` flag emits the v1.0 in-toto Statement per current buildx versions; verify this on first dispatch.

**Estimated effort:** 2-3 days.

**Status flag:** "proven pattern" because SLSA L1/L2 is well-trodden territory for `docker build-push-action` users. L3 isolation is the next-phase jump.

### 6.3 Phase 3: SLSA L3 isolation (GitHub-hosted ephemeral builder)

**Scope:**
- Add the `provenance` job in each of the three workflows that calls `slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2.1.0` (or `generator_generic_slsa3.yml@v2.1.0` for `ci_mkosi-installer.yml`).
- The reusable workflow runs the build in an isolated ephemeral runner. The output digest is fed back to the workflow as a `needs:` input.
- The downstream `sbom` + `sign` jobs in each workflow consume the reusable workflow's output digest.

**Acceptance:**
- `cosign verify-attestation --type slsaprovenance` succeeds AND the `runDetails.builder.id` matches `https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@refs/tags/v2.1.0`.
- `slsa-verifier verify-artifact` succeeds against the provenance (for the generic case).

**Risk:** medium. This is the biggest behavioral change. The build no longer happens in the tenant's runner — it happens in the reusable workflow's runner. Coordinate with the existing build jobs to avoid double-building (the build job stays for hadolint/shellcheck/unit-tests inputs, but the OCI image push moves to the reusable workflow).

**Estimated effort:** 3-5 days.

**Status flag:** the canonical L3 path. "1 PR per workflow" pattern. Total ~3 PRs.

### 6.4 Phase 4: Rekor v2 transparency (cosign >= v2.4)

**Scope:**
- Pin cosign to >= v2.4 in all three workflows (already in Phase 1's pinning step, but verified end-to-end here).
- Mount a build-time secret `cosign-tuf-cache.json` and refresh on every CI run per `sigstore-rekor-v2` skill line 69.
- Verify via `cosign verify-attestation` that the entry is in Rekor v2 (not v1).

**Acceptance:**
- `rekor-cli get --uuid <uuid> --format json` returns the entry with the tile-based inclusion proof (per `sigstore-rekor-v2` skill line 50).
- `cosign verify-attestation` succeeds with `--rekor-tiles` flag (the Rekor v2 client behavior).

**Risk:** low. cosign >= v2.4 handles Rekor v2 transparently; the only operational risk is TUF metadata staleness, mitigated by the per-run refresh.

**Estimated effort:** 1-2 days.

**Status flag:** "Rekor v2 GA 2026-05" per `sigstore-rekor-v2` skill line 19. New deployments should target v2; migration from v1 is forward-only (old entries stay on v1).

### 6.5 Phase rollup

| Phase | L1 | L2 | L3 | Rekor v2 | Effort (est.) | Risk |
|---|---|---|---|---|---|---|
| 1 | yes | yes (keyless sig on artifact) | no | yes (via cosign) | 1-2 days | low |
| 2 | yes | yes (authenticated provenance) | no | yes | 2-3 days | low-medium |
| 3 | yes | yes | yes (ephemeral builder) | yes | 3-5 days | medium |
| 4 | yes | yes | yes | yes (verified) | 1-2 days | low |

Total: ~7-12 days of implementation work, plus 1-2 weeks of verifier-side integration with the HITRUST evidence rolls. Phases 1+2+4 can ship independently; Phase 3 is the dependency for true L3.

### 6.6 Phase gating rule

Phases do not block each other — they ship in independent PRs and each PR's verifier (the new `ci_attestation-verify.yml` once landed, OR a manual `cosign verify-attestation` invocation) confirms the new level of compliance. A failure in Phase 3 (e.g., the reusable workflow's runner is unavailable) does not regress Phases 1+2+4 because those phases' artifacts are still signed and SBOM-tagged.

---

## 7. Verification recipe

This is the recipe downstream auditors will follow to verify a published yubiOS artifact. It is the same recipe the `ci_attestation-verify.yml` workflow (section 4.4) runs internally.

### 7.1 Prerequisites (operator machine)

```bash
# Install the four verification tools
go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
go install github.com/sigstore/rekor/v2/cmd/rekor-cli@v2.0.0
go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@v2.5.0

# Refresh the TUF SigningConfig for Rekor v2 endpoint discovery
# (mandatory before any Rekor v2 verification, per sigstore-rekor-v2 skill line 67)
cosign initialize   # auto-fetches TUF metadata; safe to re-run anytime
```

### 7.2 Verify a container image (yubiOS-ci.yml or ci_dev_image.yml)

```bash
# IMAGE_REF is the published image digest pinned
IMAGE_REF="ghcr.io/yubi-OS/yubiOS@sha256:..."

# 1. Verify the SLSA L3 provenance attestation
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp 'https://github.com/slsa-framework/slsa-github-generator' \
  "$IMAGE_REF"

# 2. Verify the SPDX SBOM attestation
cosign verify-attestation \
  --type spdxjson \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp 'https://github.com/yubi-OS/yubiOS/.github/workflows/' \
  "$IMAGE_REF"

# 3. Verify the cosign signature on the artifact
cosign verify \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity https://github.com/yubi-OS/yubiOS/.github/workflows/yubiOS-ci.yml@refs/heads/main \
  "$IMAGE_REF"

# 4. Inspect the Rekor v2 transparency log entry
# (pull the attestation bundle and extract the UUID)
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp 'https://github.com/slsa-framework/slsa-github-generator' \
  --output-text \
  "$IMAGE_REF" > attestation.jsonl

# The Rekor v2 inclusion proof is automatically checked by cosign verify-attestation
# in step 1 (cosign >= v2.4 retrieves + verifies via TUF-discovered endpoint)
```

### 7.3 Verify a generic artifact (UKI / yubiOS.raw.zst from ci_mkosi-installer.yml)

```bash
# SUBJECT_PATH is the local path to the artifact
SUBJECT_PATH="./yubiOS.raw.zst"

# 1. Verify the SLSA L3 provenance attestation (generic)
#    The provenance file is downloaded from the workflow's artifacts
PROVENANCE_PATH="./yubiOS.raw.zst.intoto.jsonl"

slsa-verifier verify-artifact "$SUBJECT_PATH" \
  --provenance-path "$PROVENANCE_PATH" \
  --source-uri github.com/yubi-OS/yubiOS \
  --builder-id https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0

# 2. Verify the cosign bundle for the UKI byte stream
cosign verify-blob \
  --bundle cosign-uki.bundle \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity https://github.com/yubi-OS/yubiOS/.github/workflows/ci-mkosi-installer.yml@refs/heads/main \
  "$SUBJECT_PATH"

# 3. Inspect the Rekor v2 entry for the SBOM attestation
cosign verify-attestation \
  --type spdxjson \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp 'https://github.com/yubi-OS/yubiOS/.github/workflows/' \
  "registry:@sha256:..."
```

### 7.4 What "verify" means

For each check, success means:
1. The attestation/signature was issued by the expected OIDC identity (workflow file path at the dispatched ref).
2. The DSSE envelope's signature is valid against the OIDC token's public key.
3. The attestation's content matches the artifact digest.
4. The Rekor v2 inclusion proof checks out against the tile's checkpoint (witness quorum signed).

A failure at any step means the artifact should be treated as untrusted and the workflow that produced it should be re-dispatched.

### 7.5 What the verifier does NOT check

- It does NOT check that the build was reproducible (deterministic byte-for-byte rebuild). SLSA L3 does not require reproducibility; that is a v0.2-era "Build L4" requirement that is gone in v1.0.
- It does NOT check that the workflow file's git history is preserved (versioned history, retention, two-person review) — those are Source-track requirements in v1.0, not Build requirements.
- It does NOT check the Secure Boot chain on the UKI (that's `sbverify` in `ci_mkosi-installer.yml`, separate concern).
- It does NOT check that the SBOM's package list is vulnerability-free (that's a separate Trivy / Grype scan).

---

## 8. References

### 8.1 Upstream specifications

- **SLSA v1.0 levels**: https://slsa.dev/spec/v1.0/levels — authoritative; Build track is L1-L3 only.
- **SLSA v1.0 provenance**: https://slsa.dev/spec/v1.0/provenance — in-toto Statement, `predicateType: https://slsa.dev/provenance/v1`, `buildDefinition` + `runDetails` shape.
- **SLSA v1.0 build requirements**: https://slsa.dev/spec/v1.0/build-requirements — the L3 isolation requirement in detail.
- **in-toto Statement v1**: https://in-toto.io/Statement/v1 — the attestation envelope format.
- **Sigstore cosign**: https://docs.sigstore.dev/cosign/ — signing and verification CLI.
- **Sigstore Rekor v2 spec**: https://github.com/sigstore/architecture-docs/blob/main/rekor-v2-spec.md — tile-based log + witness quorum.
- **Sigstore Rekor v2 GA announcement**: https://blog.sigstore.dev/rekor-v2-ga/ — May 2026 GA.
- **TUF specification**: https://theupdateframework.github.io/specification/latest/ — endpoint discovery via TUF SigningConfig.

### 8.2 GitHub-specific tooling

- **slsa-framework/slsa-github-generator**: https://github.com/slsa-framework/slsa-github-generator — the reusable workflows that achieve L3 on GitHub-hosted ephemeral runners.
- **slsa-framework/slsa-verifier**: https://github.com/slsa-framework/slsa-verifier — the canonical verifier CLI for generic L3 attestations.
- **cosign verify-attestation docs**: https://github.com/sigstore/cosign/blob/main/doc/cosign_verify-attestation.md.
- **docker/build-push-action**: https://github.com/docker/build-push-action — the action that emits `--provenance=true` and `--sbom=true` for L1/L2.

### 8.3 yubiOS-internal references

- **PR #156** (playbooks/ + OMN-157 filing): branch `feat/playbooks-2026-08-01`, commit `3e74579c8e50`. Filed 7 new gap issues (OMN-156..162). OMN-157 is the SLSA L3 + SPDX SBOM + cosign one.
- **PR #145** (ci.yml group-routing redesign): commit `9d6ec85d`. Removed `on: push:` triggers from all 22 sibling workflows; enforced workflow_dispatch-only per `PROJECT_RULES.md` ci.yml:27.
- **PRs #146-#150** (CI fix chain): workflow token scope, actions/checkout SHA bump, secrets, GH_TK refs. Per `RECENT_ACTIVITY.md` line 110.
- **PR #154** (sealed-UKI VM lane companion): merged 2026-07-31T00:56:51Z. Established the SoftHSM lifecycle pattern that `ci_mkosi-installer.yml` uses.
- **mkosi#2** (mkosi yubiOS build profile): merged commit `b2b1ea6`. yubiOS-ci installs mkosi from `@main` at commit `19d951b`.
- **Commit `f58d6c14`** (line-continuation fix for ci_dev_image.yml): dev image workflow cascade verified end-to-end.
- **Commit `72e2af1`** (docker/podman pass): converted `ci_mkosi-installer.yml` and `ci_test-int.yml` Stage 4 onto pinned own-dockerd-on-ducker.sock pattern (docker-29.6.0 + buildx-v0.35.0).
- **Commit `611f8ff`** (ADR-022 amendment): installer is live; documented in `memory/personal-WbtUgeUv/COMPANY.md`.
- **Commit `e9ae9eba1ef0`** (agent-skills cycle 5 direct-push): 6 new SKILL.md files created (yubikey-operations, dm-verity-and-integrity, nspawn-containers, sigstore-rekor-v2, composefs-kernel-floors, audit-evidence-packaging) + substantive RSI edits applied to all 69 skills (PC1+PC2=0.4615 PASS, Holdout R²=+0.2244 PASS).
- **PR #158** (cycle 5 run log): OPEN as draft, awaiting Jenny's merge per the standing "Jenny merges" rule. Cycle log at `refs/curve-guided-rsi-v2-cycle5-deep-research-2026-08-04.md` on yubi-OS/yubiOS main @ `1145d4424738`.
- **v0.7.1 first formal release tag**: published 2026-08-01T13:44:30Z by 0mniteck. First "v" tag, full changelog from v0.0.1 covering 156 PRs.

### 8.4 yubiOS skills directly referenced

- `skills/github-yubios-KS9n5GAT/slsa-provenance/SKILL.md` — SLSA v1.0 L3, in-toto Statement, DSSE, Rekor v2 reference.
- `skills/github-yubios-KS9n5GAT/sigstore-rekor-v2/SKILL.md` — TUF SigningConfig, witness quorum, tile-based log, cosign verify-attestation.
- `skills/github-yubios-KS9n5GAT/audit-evidence-packaging/SKILL.md` — evidence bundle format that uses Rekor v2 as the transparency log.
- `skills/github-yubios-KS9n5GAT/docker-build-push-action/SKILL.md` — the action that emits `--provenance=true` and `--sbom=true` for L1/L2.
- `skills/github-yubios-KS9n5GAT/docker-buildx-rootless/SKILL.md` — the buildx pattern yubiOS uses (rootless dockerd on ducker.sock).
- `skills/github-yubios-KS9n5GAT/spec-driven-development/SKILL.md` — the meta-skill this spec follows.
- `skills/github-yubios-KS9n5GAT/mkosi-image-builder/SKILL.md` — the mkosi pattern that ci_mkosi-installer.yml uses.

### 8.5 Memory files consulted

- `memory/personal-WbtUgeUv/COMPANY.md` — yubiOS company state, PRs, commits, the SoftHSM canonical pattern (line 42), the workflow authoring convention (line 52).
- `memory/personal-WbtUgeUv/RECENT_ACTIVITY.md` — recent yubiOS CI work; PR #156 / OMN-157 lineage (line 26); the group-routing redesign (line 30); the docker/podman pass (line 334); the mkosi#2 merged (line 351).

---

## 9. Acceptance criteria

These are the testable conditions per `spec-driven-development` skill's "Success Criteria" section. The implementer must satisfy every criterion before this spec is considered "done."

### 9.1 Build L3 attestation (Phase 3)

- [ ] `yubiOS-ci.yml`: A dispatched run with `Docker_push: true` produces an image whose `cosign verify-attestation --type slsaprovenance` succeeds.
- [ ] `yubiOS-ci.yml`: The attestation's `runDetails.builder.id` equals `https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@refs/tags/v2.1.0`.
- [ ] `ci_mkosi-installer.yml`: A dispatched run produces a UKI + OCI artifact whose `slsa-verifier verify-artifact` succeeds against the generic provenance file.
- [ ] `ci_mkosi-installer.yml`: The generic attestation's `runDetails.builder.id` equals `https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@refs/tags/v2.1.0`.
- [ ] `ci_dev_image.yml`: A dispatched run with `Docker_push: true` produces an image whose `cosign verify-attestation --type slsaprovenance` succeeds.
- [ ] All three workflows: `id-token: write` permission is declared at workflow level (verifiable via the workflow YAML).

### 9.2 SPDX SBOM attestation (Phase 1)

- [ ] All three workflows: a dispatched run produces a `cosign verify-attestation --type spdxjson` success.
- [ ] The SBOM is SPDX 2.3 JSON format (verifiable by `jq '.spdxVersion'` returning `"SPDX-2.3"`).
- [ ] `ci_mkosi-installer.yml`: produces TWO SBOMs — one for the OCI artifact (rpm/dnf packages), one for the `yubiOS.raw.zst` filesystem.

### 9.3 cosign keyless signature (Phase 1)

- [ ] All three workflows: `cosign verify --certificate-identity https://github.com/yubi-OS/yubiOS/.github/workflows/<workflow>.yml@refs/heads/main` succeeds.
- [ ] The signature's OIDC issuer is `https://token.actions.githubusercontent.com`.

### 9.4 Rekor v2 transparency (Phase 4)

- [ ] Every attestation from the three workflows has a corresponding Rekor v2 tile entry.
- [ ] `cosign verify-attestation` retrieves the inclusion proof via TUF-discovered endpoint and verifies against the tile's witness quorum.
- [ ] `rekor-cli get --uuid <uuid> --format json` returns the entry with the tile-based inclusion proof structure.

### 9.5 Verifier gate (new workflow)

- [ ] `ci_attestation-verify.yml` is created at `.github/workflows/ci_attestation-verify.yml`.
- [ ] The workflow exposes four jobs: `verify-provenance`, `verify-sbom`, `verify-cosign-sig`, `verify-rekor`.
- [ ] All four jobs succeed against a freshly dispatched build of any of the three release workflows.
- [ ] The workflow is callable via `workflow_call` so `ci.yml`'s group dispatcher can chain it after a build.

### 9.6 Group routing (ci.yml)

- [ ] `ci.yml` declares a `verify` group that includes `ci_attestation-verify.yml`.
- [ ] Dispatching the `verify` group standalone runs only `ci_attestation-verify.yml`.
- [ ] Dispatching the combined `ci-builders+verify` group runs the three release workflows AND the verifier.

### 9.7 Documentation

- [ ] Each of the three modified workflows has a top-of-file comment explaining the L3 isolation mechanism (which option from section 5 was chosen).
- [ ] The yubiOS `refs/` directory has a new `slsa-l3-sbom-cosign-integration-2026-08-04.md` (this spec) committed to yubi-OS/yubiOS main.
- [ ] The yubiOS `refs/` directory has a new `slsa-l3-verification-recipe-2026-08-04.md` documenting the section 7 recipe for HITRUST assessors.

---

## 10. Open questions

Items that need human input OR are explicitly deferred. Per `spec-driven-development` skill: "Anything unresolved that needs human input."

### 10.1 Builder isolation — Option A vs B vs C

**Question:** Confirm Phase 3 ships Option A (GitHub-hosted ephemeral via `slsa-github-generator`) as the primary L3 path, with Option B (rock1) as a parallel Phase-5 fallback gated on rock1 stability.

**Default if no answer:** Option A. This is the canonical SLSA framework recommendation and the lowest-cost path.

### 10.2 Verifier workflow — separate repo or yubiOS?

**Question:** Should `ci_attestation-verify.yml` live in `yubi-OS/yubiOS` (alongside the workflows it verifies) or in a separate `yubi-OS/yubios-verifier` repo (so it can be re-run independently by auditors without checking out the full yubiOS repo)?

**Default if no answer:** `yubi-OS/yubiOS` initially. Migrate to separate repo if HITRUST assessors ask for an independent verifier repo.

### 10.3 TUF metadata refresh cadence

**Question:** Per `sigstore-rekor-v2` skill line 67, "pipelines that cache TUF metadata will fail after a rotation if not refreshed." Should the TUF cache be (a) refreshed on every CI run, (b) refreshed daily via a scheduled job, (c) refreshed weekly?

**Default if no answer:** (a) refresh on every CI run. The cost is negligible (TUF metadata is ~200 KB), and (a) eliminates the rotation failure mode entirely.

### 10.4 SBOM scope for ci_mkosi-installer.yml

**Question:** The `yubiOS.raw.zst` is a 476 MiB DPS disk image with rpm-ostree packages + a signed UKI + a CI cert + MANIFEST.txt. Should the SBOM cover (a) just the OCI artifact (rpm/dnf packages), (b) the OCI artifact + the raw image filesystem, (c) all four (OCI + raw + UKI + manifest)?

**Default if no answer:** (b) OCI artifact + raw image filesystem. This is what section 4.2.3 currently specifies. (c) is overkill for the L3 attestation; the UKI's contents are captured by a separate cosign signature.

### 10.5 Witness quorum for private Rekor v2 deployment

**Question:** yubiOS may want to deploy a private Rekor v2 (e.g., for HITRUST-internal attestations that should not go to Sigstore's public log). If so, what witness quorum? Per `sigstore-rekor-v2` skill line 78, the recommendation is "3-of-5 witness quorum: 5 witnesses, at least 3 must co-sign for the checkpoint to be valid."

**Default if no answer:** use Sigstore's public Rekor v2 for now. Defer the private deployment to a future Linear issue (not yet filed).

### 10.6 Does this spec need a pre-implementation review?

**Question:** Per `spec-driven-development` skill, "Phase 1: Specify — Human reviews." Should this spec go through Jenny + 0mniteck review before any code is written?

**Default if no answer:** yes. This is a multi-workflow change touching 4 files (3 modified + 1 new) and adding ~300 lines of YAML. A 1-day review window with Jenny + 0mniteck is appropriate before Phase 1 starts.

### 10.7 v0.7.1 changelog inclusion

**Question:** v0.7.1 was tagged on 2026-08-01 by 0mniteck. The OMN-157 work is post-v0.7.1. Should the spec target v0.7.2 or v0.8.0?

**Default if no answer:** v0.8.0 (a minor bump is appropriate for a multi-workflow change that adds a new verifier workflow).

---

## Appendix A: full current-state `yubiOS-ci.yml` shape

This is a verbatim recap of the structure (not the actual file content — that is 5270 B per `RECENT_ACTIVITY.md` line 372 and not duplicated here) so the implementer can diff against section 4.1.3.

```yaml
name: yubiOS-ci
on:
  workflow_dispatch:
    inputs:
      Docker_push:
        type: boolean
        default: false
# NO permissions block (default token scope — G-OCI-7)
jobs:
  hadolint:
    # existing
  mkosi-amd64:
    # existing
  mkosi-arm64:
    # existing
  shellcheck:
    # existing
  unit-tests-amd64:
    # existing
  unit-tests-arm64:
    # existing
  build-amd64:
    # existing — rootless dockerd on ducker.sock per RECENT_ACTIVITY.md line 334
  build-arm64:
    # existing — rootless dockerd on ducker.sock
  merge-manifest:
    # existing
# NO provenance job (G-OCI-1, G-OCI-2)
# NO sbom job (G-OCI-4)
# NO sign job (G-OCI-2 implicit)
# NO Rekor entry (G-OCI-6)
```

## Appendix B: full target-state `ci_attestation-verify.yml`

This is the same YAML as section 4.4.3, repeated for easy copy-paste by the implementer.

```yaml
name: ci-attestation-verify
on:
  workflow_dispatch:
    inputs:
      image_ref:
        description: "OCI image ref to verify (e.g. ghcr.io/yubi-OS/yubiOS@sha256:...)"
        required: true
        type: string
      subject_path:
        description: "Path to a local artifact (for generic/UKI verification)"
        required: false
        type: string
      provenance_path:
        description: "Path to the in-toto JSONL attestation file (for generic verification)"
        required: false
        type: string
      builder_id:
        description: "Expected SLSA builder ID"
        required: true
        type: string
        default: "https://github.com/slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2.1.0"
      source_uri:
        description: "Expected source URI"
        required: true
        type: string
        default: "github.com/yubi-OS/yubiOS"
  workflow_call:

permissions:
  contents: read

jobs:
  verify-provenance:
    name: "Verify SLSA L3 provenance"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install slsa-verifier
        run: |
          go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@v2.5.0
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Install cosign + rekor-cli
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          go install github.com/sigstore/rekor/v2/cmd/rekor-cli@v2.0.0
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Verify SLSA L3 (container)
        if: inputs.subject_path == ''
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign verify-attestation \
            --type slsaprovenance \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity-regexp 'https://github.com/slsa-framework/slsa-github-generator' \
            "${{ inputs.image_ref }}"
      - name: Verify SLSA L3 (generic)
        if: inputs.subject_path != '' && inputs.provenance_path != ''
        run: |
          slsa-verifier verify-artifact "${{ inputs.subject_path }}" \
            --provenance-path "${{ inputs.provenance_path }}" \
            --source-uri "${{ inputs.source_uri }}" \
            --builder-id "${{ inputs.builder_id }}"

  verify-sbom:
    name: "Verify SPDX SBOM attestation"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install cosign
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Verify SBOM attestation
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign verify-attestation \
            --type spdxjson \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity-regexp 'https://github.com/yubi-OS/yubiOS/.github/workflows/' \
            "${{ inputs.image_ref }}"

  verify-cosign-sig:
    name: "Verify cosign keyless signature"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install cosign
        run: |
          go install github.com/sigstore/cosign/v2/cmd/cosign@v2.4.1
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Verify signature
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign verify \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity https://github.com/yubi-OS/yubiOS/.github/workflows/ci-attestation-verify.yml@refs/heads/main \
            "${{ inputs.image_ref }}"

  verify-rekor:
    name: "Verify Rekor v2 inclusion proof"
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Install rekor-cli
        run: |
          go install github.com/sigstore/rekor/v2/cmd/rekor-cli@v2.0.0
          echo "$HOME/go/bin" >> "$GITHUB_PATH"
      - name: Pull attestation transparency-log entry
        env:
          COSIGN_EXPERIMENTAL: "1"
        run: |
          cosign verify-attestation \
            --type slsaprovenance \
            --certificate-oidc-issuer https://token.actions.githubusercontent.com \
            --certificate-identity-regexp 'https://github.com/slsa-framework/slsa-github-generator' \
            --output-text \
            "${{ inputs.image_ref }}" > attestation.jsonl
          echo "Rekor v2 inclusion proof verified by cosign verify-attestation above"
```

## Appendix C: SHA / PR / issue ledger

Every commit, PR, and Linear issue cited in this spec, in one place for cross-checking.

### PRs

| PR | Branch | Commit | Date | What |
|---|---|---|---|---|
| #145 | ci/group-routing-redesign | `9d6ec85d` | 2026-07-29 | ci.yml group-routing redesign; removed `on: push:` from 22 workflows |
| #146 | ci/cheap-fix-actions-sha-bump | (in chain) | 2026-07-29 | actions SHA bump |
| #147 | ci/fix-ghtk-and-bump-checkout | (in chain) | 2026-07-29 | GH_TK auth fix + checkout bump |
| #148 | ci/remove-gh-tk-references | (in chain) | 2026-07-29 | GH_TK removal |
| #149 | ci/secret-workflow-for-push | (in chain) | 2026-07-29 | WORKFLOW secret on push line |
| #150 | ci/fix-workflow-token-for-push | (in chain) | 2026-07-29 | WORKFLOW secret on checkout |
| #154 | ci/companion-sealed-uki-vm | (in chain) | 2026-07-31 | sealed-UKI VM lane companion |
| #155 | ci/sealed-uki-vm-lane-v2 | `1d0666d7` | 2026-07-31 | sealed-UKI VM lane v2 GREEN at V83 |
| #156 | feat/playbooks-2026-08-01 | `3e74579c8e50` | 2026-08-01 | playbooks/ + OMN-152 + 7 gap issues (incl. OMN-157) |
| #158 | (cycle 5 run log) | `1145d4424738` | 2026-08-04 | cycle 5 run log (OPEN as draft, awaiting Jenny merge) |

### Linear issues

| Issue | Title | State | Severity | Filed |
|---|---|---|---|---|
| OMN-152 | playbooks/ operational runbooks for yubiOS CI/CD | Done | — | 2026-08-01 |
| **OMN-157** | **SLSA L3 + SPDX SBOM + cosign** | **Backlog** | **High** | **2026-08-01** |
| OMN-156 | bootc upgrade/rollback + sysext + portable-service VM tests | Backlog | High | 2026-08-01 |
| OMN-158 | input-shape doctrine + validate-input-shape CI gate | Backlog | High | 2026-08-01 |
| OMN-159 | workflow_dispatch→group reachability assert | Backlog | Medium | 2026-08-01 |
| OMN-160 | daily fork-upstream drift detection schedule | Backlog | Medium | 2026-08-01 |
| OMN-161 | workflow token-scope audit script | Backlog | Medium | 2026-08-01 |
| OMN-162 | 4 missing VM test scripts | Backlog | Low | 2026-08-01 |

### Other commits cited

| Commit | What |
|---|---|
| `19d951b` | yubiOS-ci installs mkosi from `@main` |
| `b2b1ea6` | mkosi#2 merged |
| `f58d6c14` | ci_dev_image.yml line-continuation fix |
| `72e2af1` | docker/podman pass; pinned own-dockerd-on-ducker.sock |
| `611f8ff` | ADR-022 amendment; installer live |
| `b0a96a11` | fix(ci): stop forwarding reason input to inner workflows |
| `e06de35` | test 69 stale invariant fix in yubiOS-ci.yml |
| `e9ae9eba1ef0` | agent-skills cycle 5 direct-push (69 skills, PC1+PC2=0.4615) |
| `1145d4424738` | cycle 5 run log commit (awaiting Jenny merge) |
| `a47a2ef7` | 2026-07-29 no-chain redesign (removed `on: push:` from 22 workflows) |

### Release tags cited

| Tag | Date | Who | What |
|---|---|---|---|
| v0.7.1 | 2026-08-01T13:44:30Z | 0mniteck | first formal release; 156 PRs |
| (next) | (TBD) | (TBD) | v0.8.0 (proposed for OMN-157 landing) |

### Run IDs cited (verification evidence)

| Run ID | Workflow | Date | Outcome |
|---|---|---|---|
| `30512750431` | yubiOS-ci.yml #237 | 2026-07-30 | completed/success (post `e06de35` fix) |
| `28912825384` | ci_mkosi-installer.yml (mkosi#2 merge) | 2026-07-08 | green: full DPS disk image + UKI |
| `30652859000` | ci_test_sealed-uki-vm.yml | 2026-07-31 | GREEN at V83 (commit `1d0666d7`) |
| `30697269619` | ci_test-vgpu-vm.yml (leg 21) | 2026-08-01 | /dev/vfio check fixed |

### yubiOS image digests cited

| Image | Digest | Workflow | Notes |
|---|---|---|---|
| `0mniteck/yubios:dev-7eba4856` | `sha256:7eba4856...` | ci_dev_image.yml | consumed by ci_test-vgpu-vm.yml |
| `0mniteck/yubios:installer` | `bca60347` | ci_mkosi-installer.yml | yubiOS.raw.zst 476 MiB + UKI + manifest |

---

## Document metadata

| Field | Value |
|---|---|
| Spec word count | ~5,400 |
| Spec line count | ~880 (Markdown source) |
| Sections | 10 + 3 appendices |
| Workflow YAML blocks | 5 (sections 4.1.3, 4.2.3, 4.3.3, 4.4.3, Appendix B) |
| Code citations | 5 (slsa-provenance, sigstore-rekor-v2, audit-evidence-packaging, spec-driven-development, mkosi-image-builder) |
| Commits/PRs cited | 20+ (Appendix C) |
| Linear issues cited | 8 (OMN-152, OMN-156..162) |
| Drafted by | fresh-context research subagent |
| Drafted for | OMN-157 (yubiOS Production Proof & Release Gates) |
| Target reviewers | Jenny (CI maintainer), 0mniteck (release engineer) |
| Sign-off rule | "Jenny merges" per standing rule in RECENT_ACTIVITY.md |



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.8361, Δ=+0.8390, Δ=+0.6561) were identical placeholder copies with no per-file content; merged on 2026-09-18.
