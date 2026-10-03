# Post-quantum supply-chain verification readiness (2026-10-03)

Date: 2026-10-03. Family: readiness-record. Joins
`refs/post-quantum-tls-adoption-2026-07-23.md` per this round's rung
(`add:s3:101011111`), in the supply-chain-verification family with
`refs/adjacent-problems-verification-chain-2026-09-01.md`,
`refs/dhi-io-base-image-digest-rotation-2026-09-08.md`, and
`refs/slsa-provenance-tag-verification-2026-09-08.md`.

## Why the PQ-TLS doc needs a supply-chain counterpart

The post-quantum TLS doc tracks X25519MLKEM768 deployment across Cloudflare, OpenSSL, Go, and NIST
(the transport layer). What it does not track is the supply-chain layer: once yubiOS ships
PQ-hybrid TLS, the provenance attestations and cosign signatures that verify the artifacts
carrying that TLS stack must themselves be PQ-resistant or the trust chain has a
quantum-exploitable link.

The SLSA provenance checklist and the digest rotation checklist currently verify classical
signatures. ML-DSA (FIPS 204, finalized 2024-08-13 alongside ML-KEM) is the NIST-standardized
post-quantum signature scheme; cosign/Sigstore support for ML-DSA is not yet generally available
as of this record's date.

## What yubiOS should track

When the Go toolchain reaches 1.26 (per the PQ-TLS doc's TODO note) and yubiOS enables
SecP256r1MLKEM768 + SecP384r1MLKEM1024 alongside X25519MLKEM768, the supply-chain checklist should
add a parallel question: are the signing keys, attestation formats, and verification tooling still
classical-only? If yes, the transport is quantum-resistant but the artifact provenance is not —
the trust chain is only as strong as its weakest link.

## What this record does not claim

No PQ signature implementation or cosign migration is proposed here; the SLSA/cosign tooling
chain needs its own readiness assessment. This record is a readiness flag, not a migration plan.
