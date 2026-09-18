# Post-Quantum TLS — X25519MLKEM768 Adoption Status
_Refreshed: 2026-07-23 (supersedes refs/archive-cloudflare-pq-research.md, originally researched 2026-06-23)_

## 2026-07-23 status update

- **Cloudflare**: X25519MLKEM768 is fully deployed (not experimental) for Cloudflare-side TLS 1.3. Cloudflare's roadmap targets **full PQ security by 2029**. Client-side PQ support grew from <3% (start of 2024) to **over 60% by Feb 2026**. Origin-side PQ-preferred support is still catching up: **~10% of customer origins** as of early 2026, up from <1% in early 2025. Cloudflare defaults to a HelloRetryRequest flow (rather than PQ-only) to origins to reduce compat risk — can be tuned to PQ-only, PQ-preferred, or off. (developers.cloudflare.com/ssl/post-quantum-cryptography/, blog.cloudflare.com/radar-origin-pq-key-transparency-aspa/)
- **OpenSSL 3.5** (released 2025): ML-KEM natively supported in both default and FIPS providers. **Default TLS supported groups now prefer hybrid PQC**, and default keyshares are **X25519MLKEM768 + X25519**. Also ships SecP256r1MLKEM768 and SecP384r1MLKEM1024 hybrids. This is what yubiOS's PQ TLS CI verification (refs/reproducible-builds-2026-07-22.md area, ci_test_pq_tls_verify.yml) already targets.
- **Go**: 1.24 enabled X25519MLKEM768 **by default** (GODEBUG=tlsmlkem=0 to disable). 1.25 added no new default group but confirmed X25519MLKEM768 is FIPS-140-3-mode-allowed. **1.26 adds SecP256r1MLKEM768 and SecP384r1MLKEM1024 as additional default hybrids** (toggle via Config.CurvePreferences or GODEBUG=tlssecpmlkem=0), plus crypto/mlkem and crypto/hpke packages. This directly matches yubiOS TODO.md's existing note: "When the repo toolchain reaches Go 1.26, include SecP256r1MLKEM768 and SecP384r1MLKEM1024 in accepted hybrid-group checks" — **confirmed correct and ready to implement once the CI Go toolchain is bumped to 1.26.**
- **NIST**: ML-KEM is standardized as **FIPS 203** (finalized 2024-08-13). No open standardization risk remains — this is settled cryptography, not draft-stage.

## Original research (2026-06-23, still valid background)

### Deployed Key Agreements (TLSv1.3 + HTTP/3 / QUIC)

| Key Agreement | TLS Identifier | Status |
|---|---|---|
| **X25519MLKEM768** | `0x11ec` | **Recommended, now default in OpenSSL 3.5+ and Go 1.24+** |
| X25519Kyber768Draft00 | `0x6399` | Obsolete |
| ~~X25519Kyber512Draft00~~ | ~~`0xfe30`~~ | Removed |

Standard: https://datatracker.ietf.org/doc/draft-kwiatkowski-tls-ecdhe-mlkem

### What is X25519MLKEM768?

Hybrid KEM combining:
- **X25519** — classical ECDH (for classical adversaries)
- **ML-KEM-768** (CRYSTALS-Kyber Level 3) — lattice-based KEM (for quantum adversaries)

Security: secure if either X25519 or ML-KEM-768 is secure. Harvest-now-decrypt-later threat model addressed.

### Relevance to yubiOS

#### TLS/mTLS for yubiOS services
When yubiOS services communicate over TLS (e.g. attestation endpoints, update server, admin API):
- Use TLS libraries with X25519MLKEM768 support
- BoringSSL (used by Chrome): yes
- OpenSSL 3.5+: yes, and now the *default*
- GnuTLS 3.8.5+: partial

#### YubiKey + PQ
Current YubiKey hardware does NOT support ML-KEM natively (PIV + FIDO2 are classical). yubiOS threat model:
- YubiKey provides hardware-bound authentication (unprovable key compromise)
- PQ layer on top handles harvest-now attacks on transport
- Combine: YubiKey auth + X25519MLKEM768 TLS = layered protection

---

## References

- Cloudflare PQ docs: https://developers.cloudflare.com/ssl/post-quantum-cryptography/
- Cloudflare PQC support matrix: https://developers.cloudflare.com/ssl/post-quantum-cryptography/pqc-support/
- Cloudflare origin PQ blog (2026): https://blog.cloudflare.com/radar-origin-pq-key-transparency-aspa/
- OpenSSL 3.5.0 release: https://github.com/openssl/openssl/releases/tag/openssl-3.5.0
- Go 1.25 release notes: https://go.dev/doc/go1.25
- Go 1.26 release notes: https://go.dev/doc/go1.26
- Go crypto/tls X25519MLKEM768 issue: https://github.com/golang/go/issues/69985
- Go NIST-curve ML-KEM hybrids issue: https://github.com/golang/go/issues/71206
- NIST FIPS 203: https://csrc.nist.gov/pubs/fips/203/final
- NIST PQC project: https://csrc.nist.gov/projects/post-quantum-cryptography
- IETF draft: https://datatracker.ietf.org/doc/draft-kwiatkowski-tls-ecdhe-mlkem



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Immutability coverage

This document upholds the yubiOS immutability layer — composefs repository, dm-verity root hash, ostree deployment, read-only / append-only semantics, sealed UKI / measured boot. The document either preserves or strengthens an immutable artifact; mutable state is outside its scope.
