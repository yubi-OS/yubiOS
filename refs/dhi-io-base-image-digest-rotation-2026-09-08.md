# dhi.io Base Images — Digest Rotation Checklist

_Refreshed: 2026-09-08_

Cross-reference: approved image digests live only in [../PINNED.md](../PINNED.md); the FROM images used by yubiOS builds are gated by the yubiOS.rego build policy (approved registries, digest-pinned, provenance required).

## Scope

dhi.io hardened base images are pinned by digest, and the digest is rotated on the project's normal base-image refresh cadence. This note is the standing checklist for rotating one of those pins without breaking reproducibility.

## Rotation checklist

1. Read the current pinned digest from PINNED.md — never from a Containerfile, ADR, or old PR note.
2. Resolve the new digest with the registry inspect tooling and record the multi-arch index digest, not a per-arch child.
3. Check the build policy: the new image must still come from an approved registry and satisfy the provenance requirements in yubiOS.rego, or the build gate will deny it.
4. Smoke-gate the candidate: run the new digest once and confirm the image starts and reports its expected runtime.
5. Update PINNED.md in one commit; the commit message names the old and new digests.
6. Land the Containerfile change referencing PINNED.md in the same change set so the two cannot drift.
7. If the rotation must be undone, revert the pin — old digests remain valid in the registry; nothing is overwritten.

## Assumptions

Caller obligations and environment dependencies this checklist relies on:

- **Environment dependencies:** digest resolution needs registry network access; CI runners must have the same registry reachability as the operator performing the rotation.
- **Toolchain prerequisites:** buildx (for image inspection), the buildx versions that support build policies, and cosign for any signature checks the rotation requires.
- **Caller obligations:** the caller must update PINNED.md and the consuming Containerfile together; a rotation that lands in only one is a drift bug, not a rotation.
- **Preconditions:** the yubiOS.rego approved-registry list already contains the registry; if not, adding it is a separate reviewed change.
- **Rely assumptions:** digest rotation never rewrites or deletes existing tags — rotation is additive; if a registry ever serves a moved digest, treat it as an incident, not a rotation.
- **Failure behavior:** a policy-denied build fails loudly and must never be bypassed to complete a rotation.

## Notes for yubiOS work

- Same discipline as the v261 bootc bump: PINNED.md is the source of truth, a workflow can refresh it, and nothing else copies digest values.
- Record rotation history in commit messages rather than in a side ledger, so the history is auditable from git alone.

## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
