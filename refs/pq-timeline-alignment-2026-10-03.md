# Post-quantum timeline alignment (2026-10-03)

Date: 2026-10-03. Family: readiness-record. Joins the PQ family via
`refs/pq-supply-chain-verification-readiness-2026-10-03.md` and
`refs/post-quantum-tls-adoption-2026-07-23.md`.

## The three PQ timelines

The PQ-TLS adoption doc tracks three independent timelines that must converge for yubiOS to
ship a PQ-secure product: (1) the transport timeline (Go toolchain reaches 1.26, PQ hybrid
groups become default, X25519MLKEM768 is deployed); (2) the signature timeline (ML-DSA / FIPS
204 tooling becomes available in cosign, Sigstore, and the YubiKey PIV applet); (3) the
verification timeline (slsa-verifier and cosign verify support PQ signature algorithms).

Timeline 1 is the furthest along: Cloudflare has full PQ deployment, OpenSSL 3.5 has native
ML-KEM, and Go 1.24+ defaults X25519MLKEM768. Timeline 2 is behind: cosign does not yet
produce ML-DSA signatures. Timeline 3 is furthest behind: no PQ-aware slsa-verifier exists.

## The gap that matters

If yubiOS ships PQ-hybrid TLS before the signing/verification timelines converge, the transport
is quantum-resistant but the artifact chain is not. An adversary who can break classical
signatures (Shor's algorithm on a fault-tolerant quantum computer) can forge provenance
attestations and substitute malicious artifacts, even if the TLS connection used ML-KEM. The
PQ-TLS doc does not track timelines 2 and 3; the readiness record flags them but does not
schedule them.

## What this record does not claim

No timeline commitment is made here; the convergence gap is documented, not scheduled. The
three timelines are descriptive, not a project plan.
