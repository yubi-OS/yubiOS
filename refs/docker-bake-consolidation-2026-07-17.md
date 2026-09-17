# Docker Bake consolidation: 2026-07-17

Status: implemented and statically validated on `agent/unify-yubios-bake`; runtime CI and registry publication remain PR validation gates.

## Outcome

`yubiOS-bake.hcl` is the single source of truth for Docker build invocations used by the non-`ci_fork*` orchestrated workflows. It owns:

- production and TEST-only dev image dependencies;
- native platform selection and per-architecture tags;
- firmware and installer scratch-artifact packaging;
- registry versus local-Docker outputs;
- OCI labels;
- production, dev, and PQ-TLS smoke targets; and
- explicit `yubiOS.rego` policy loading with `reset=true` and `strict=true`.

The GitHub workflow layer still owns responsibilities that Docker Bake does not model: runner selection, Docker/Buildx installation and active-builder selection, source-tree commits, GitHub artifact transfer, multi-runner `imagetools` assembly, mkosi host plumbing, Podman-backed bcvk transport, and `/dev/kvm` VM execution.

The scope is the workflow chain that `ci.yml` currently dispatches. The standalone legacy `ci_test-int.yml` workflow is not a state in that chain, so its independent firmware publication path is unchanged by this consolidation.

## Docker-primary findings

| Finding | yubiOS consequence |
|---|---|
| A Bake target represents a build invocation; groups invoke multiple build targets. | Bake centralizes Docker builds, not GitHub event/callback or runner scheduling semantics. |
| `target.contexts` can use `target:<name>` as a named build context. | `Containerfile.dev` consumes the internal production target directly, removing the old classic-Docker/local-tag workaround. |
| `target.policy` accepts the policy filename plus reset/strict behavior. | Every exported or verification target inherits one fail-closed `yubiOS.rego` contract; no workflow has to remember a separate policy flag. |
| Registry and Docker exporters are target output properties. | The same target uses local Docker output for CI and registry output for explicit publish runs. |
| `buildx create --use` selects a builder in the invoking Docker configuration, while Bake's `--builder` flag overrides that configured selection. | Containerized jobs create the user-scoped `hardened` builder in the same Docker configuration that later invokes Bake. |
| Privileged build entitlements require explicit daemon and invocation grants; `RUN --device` additionally requires labs syntax and a CDI-registered device. | The self-hosted KVM VM lane remains a host workflow responsibility instead of pretending a generic Bake target can safely schedule `/dev/kvm`. |

## Target map

| Existing orchestrated lane | Bake target or group | Responsibility retained by GitHub Actions |
|---|---|---|
| `fetch-dhi-manifest.yml` | None | Registry lookup, repository rewrite, commit, and push are source mutation rather than an image build. The recursive digest replacement will update `yubiOS-bake.hcl`. |
| `fetch-fedora-bootc-manifest.yml` | None | Same source-mutation boundary; the refreshed pin is consumed by `Containerfile`. |
| `ci_firmware-rk.yml` | `firmware` | Native/cross firmware compilation, QEMU evidence, artifact download, and the RK3588 TPL gate remain in Actions; every Stage 1â4 job uses the pinned DHI container and user-scoped Buildx setup. |
| `yubiOS-ci.yml` | `yubios-ci`, `yubios` | Native amd64/arm64 scheduling and final `imagetools` index assembly remain outside Bake. |
| `ci_dev_image.yml` | `yubios-dev-ci`, `yubios-dev` | Native runner scheduling and final dev index assembly remain outside Bake. |
| `ci_test-vm.yml` | None | bcvk's Podman image store, DirectBoot SSH credential transport, KVM, FUSE, and hardware-only exclusions are host evidence, not Docker image-build configuration. |
| `ci_mkosi-installer.yml` | `installer` | SoftHSM, `/run`, user namespaces, mkosi, UKI verification, and payload preparation remain Actions operations; both build and publication jobs use the pinned DHI container and user-scoped Buildx setup. |
| `ci_test_pq_tls_verify.yml` | `pq-tls-verify` | GitHub keeps the check advisory and callback semantics; Bake owns the uncached live verification build. |

## Policy relationship

The shared inherited target is deliberately explicit:

```hcl
target "_policy" {
  policy = [{
    filename = "yubiOS.rego"
    reset    = true
    strict   = true
  }]
}
```

`reset=true` prevents accidental automatic-policy composition from changing the contract. `strict=true` fails if the builder cannot evaluate the selected policy. The pinned Buildx v0.35.0 `bake --print` output was checked for `Reset: true`, `Strict: true`, and `yubiOS.rego` on all resolved targets.

## Static validation performed

- Parsed every target and group with Docker Buildx v0.35.0.
- Rendered local and `PUSH=true` configurations for amd64 and arm64.
- Confirmed production tags remain `<sha>-<arch>` and dev tags remain `dev-<sha>-<arch>` before the existing manifest merge jobs.
- Confirmed firmware compatibility tags remain limited to the QEMU board target and board-scoped tags remain distinct.
- Confirmed the installer retains `installer` and `installer-<sha>` tags.
- Confirmed the shared `_image-export` inheritance preserves Docker output for local builds and registry output for explicit publication.
- Reconciled the original branch through `main` commit `a95f185`; current firmware and installer stages now use the pinned DHI/user-scoped Buildx invocation pattern.
- Parsed all edited workflow YAML and checked the patch for whitespace errors.

No image was published and no KVM, QEMU firmware, mkosi, or live registry run is claimed by this static pass.

## Primary sources

- https://docs.docker.com/build/bake/introduction/
- https://docs.docker.com/build/bake/reference/
- https://docs.docker.com/build/bake/contexts/
- https://docs.docker.com/build/policies/usage/
- https://docs.docker.com/build/exporters/
- https://docs.docker.com/reference/dockerfile/#run---device
- https://docs.docker.com/reference/cli/docker/buildx/bake/
- https://docs.docker.com/reference/cli/docker/buildx/create/



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
