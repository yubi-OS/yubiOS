# mkosi Tools Tree — Version Pinning & Tracking Plan

_Refreshed: 2026-09-08_

## Why this note exists

yubiOS builds its OS images with mkosi. mkosi's tools-tree mechanism lets the build run inside a pinned, mkosi-managed tool environment instead of the build host's ambient distro tools. Because the tools tree is effectively a second base image inside the build pipeline, it belongs in the same tracking discipline as the bootc base images recorded in [../PINNED.md](../PINNED.md).

## What to track

- The mkosi version (or package source) the tools tree is built from.
- The distro/registry source of the tools-tree image, treated like any other pinned OCI input.
- Where the pin lives (PINNED.md or the mkosi config), with exactly one source of truth.
- A refresh workflow, analogous to the existing base-manifest refresh workflow, that re-resolves the pin and records the old → new transition.

## Refresh checklist

1. Confirm the current pin in the source of truth before any change.
2. Resolve the new tools-tree source and record its digest, not just a tag.
3. Rebuild a candidate image with the new tools tree and run the existing image gates (boot the artifact, verify the UKI signs and boots).
4. Update the pin in one commit; note the old and new digests in the commit message.
5. Roll back by reverting the pin — never by hand-editing a built image.

## Assumptions

Caller obligations and environment dependencies this plan silently relies on:

- **Build-host environment:** mkosi must be runnable on the build host (or in CI) with privileges consistent with the rootless-container-builds convention; if the host mkosi changes underneath a pinned tools tree, builds can silently diverge.
- **Toolchain prerequisites:** the tools-tree pin is only meaningful if every image-producing job (local dev, CI, release) consumes the same pin; a job that ignores it produces images that are not comparable.
- **Registry availability:** resolving the tools-tree source requires network access to its registry at build time; offline builds need a cached/local mirror, and that mirror becomes part of the assumption set.
- **Preconditions:** PINNED.md remains the single owner of approved digests; this plan does not create a second pin location.
- **Concurrency/rely assumptions:** no other workflow rewrites the tools-tree pin concurrently; refreshes go through the same review path as base-image bumps.

## Notes for yubiOS work

- Treat a mkosi upgrade like a base-image bump: gated, pinned, and rolled back atomically.
- The tools tree is part of the supply chain — it feeds SLSA provenance and build-policy inputs like any FROM image.

## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
