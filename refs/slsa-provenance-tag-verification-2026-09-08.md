# SLSA Provenance — Tag Verification Checklist

_Refreshed: 2026-09-08_

## Scope

yubiOS images are built in CI with SLSA provenance attestations attached. This note is the standing checklist for verifying that a given tag (or digest) someone hands you is actually covered by a valid provenance attestation from the expected builder — before trusting it in a bump, a policy decision, or a release.

## Verification checklist

1. Identify the artifact by digest. Tags move; digests do not. Every step below runs against a digest.
2. Enumerate the attestations on the artifact (cosign fetch-attestations or the registry API) and confirm a provenance attestation exists.
3. Verify the attestation signature (cosign verify-attestation) against the expected signer/keyless identity — an unsigned or foreign-signed attestation is a fail, not a warning.
4. Check the provenance predicate: builder identity matches the expected workflow/repository, and the build inputs recorded in the predicate match what the claim said (pinned base digest, source ref).
5. Optionally run slsa-verifier against the artifact and the expected source ref for an independent check.
6. Record the verification (digest, attestation digest, verifier, date) in whatever record the decision lives in.

## Assumptions

Caller obligations and environment dependencies this checklist relies on:

- **Toolchain prerequisites:** cosign (and, when used, slsa-verifier) must be present and recent enough to verify the attestation format in use; verification failures should first be checked against tool version skew before being treated as tampering.
- **Environment dependencies:** verifying attestation bundles requires network access to the registry and, for keyless signing, to the Sigstore/Fulcio/Rekor infrastructure; an offline verifier cannot complete this checklist.
- **Preconditions:** the build that produced the artifact was configured to emit provenance; a build without provenance emission cannot be verified into compliance after the fact.
- **Caller obligations:** the caller supplies the artifact reference AND the expected source/builder identity; this checklist does not guess the expected identity.
- **Rely assumptions:** registry attestation storage is append-only and transparency-log anchored where applicable; treat a missing inclusion proof on a signed attestation as a hard fail.
- **Failure behavior:** any failed step is a stop — an artifact that fails provenance verification is quarantined from bump/policy decisions, never "verified manually."

## Notes for yubiOS work

- Verification is per-digest, so this checklist pairs naturally with the digest-rotation and base-image-bump flows: verify first, then rotate.
- Attestation failures are audit evidence — capture the exact verifier output rather than paraphrasing it.

## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
