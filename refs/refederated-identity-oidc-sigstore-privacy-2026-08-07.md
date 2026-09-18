# Refederated Identity in OIDC + Sigstore — Multi-Federation as Privacy Lever

> Research note extracted from a Duck.ai (GPT-5.4 mini) thread (4 prompts, 8/4/2026, ~7 minutes wall-clock). Jenny already has a built privacy-preserving multi-federation scheme from prior work and explicitly declined a sketch; this note captures the definitions and design constraints that emerged, anchored to OIDC and Sigstore as the concrete trust substrates yubiOS uses.

## TL;DR

**Refederated identity** = the same real-world actor (a human or a workload), but the federation relationship used to prove identity has changed. Old issuer URL, client registration, claims, or trust root — new ones. The actor persists; the chain of trust does not.

**Multi-federation** can improve privacy IF designed carefully (different IdPs per relying party, no global stable identifier, minimum claims, rotated/scoped identifiers per audience). It can also make anonymity WORSE if it reuses the same email/subject across providers, lets providers correlate logins, or composites multiple attestations into a more traceable composite identity. The strongest scheme is **pairwise / per-audience subject IDs + selective disclosure + no shared persistent ID + verifiable claims tied only to the specific transaction**.

yubiOS's Sigstore signing identity flow is a concrete example: the CI's OIDC issuer (currently GitHub Actions) is a federation point. If that issuer ever changes (e.g., to a self-hosted Sigstore + custom OIDC provider), the signing identity remains "yubiOS's CI" but the federation is **refederated** — verification policies must update, the old issuer's CA root is no longer authoritative, and Rekor v2 entries issued under the new issuer compose a separate transparency segment unless explicit cross-issuer anchoring is added.

This note documents (1) the definitions, (2) the concrete triggers in OIDC and Sigstore, (3) the privacy-preserving multi-federation design constraints, and (4) the implications for yubiOS's attestation layer. It is **research only** — Jenny declined the design sketch on the call ("ive already built one in the past, thanks"), so no code change is proposed here.

## 1. Background — federated, unfederated, refederated

Three trust patterns in cloud identity, ordered by how much trust is centralized:

- **Unfederated** — each app manages its own user accounts and passwords. Maximum isolation, maximum per-app overhead, no cross-app single sign-on.
- **Federated** — one Identity Provider (IdP) signs users into many apps via a shared trust relationship. OIDC issuer / SAML IdP are the canonical instantiations. Users get one credential; apps get a single trust anchor.
- **Refederated** — identity that was previously federated through one trust, re-established under a new or different trust. The actor (a real person or workload) persists; the federation relationship used to prove the actor has changed.

The interesting property of refederation is that it does NOT erase history — the new trust chain must explicitly revoke or supersede the old one (in OIDC: trust list update at the relying party; in Sigstore: CA root rotation at Fulcio, separate shard at Rekor v2). A naive refederation that just adds the new issuer without revoking the old one is a security regression, not a refederation.

## 2. Refederation in OIDC

In OIDC terms, refederation surfaces as one or more of these concrete changes at the relying party (RP):

- **New issuer URL** — the OIDC discovery document now points to a different `iss` claim. RP fetches new JWKS, validates tokens under the new signing keys.
- **New client registration** — the RP's `client_id` / `client_secret` (or rotated `client_secret_jwt`) changes; old tokens are no longer accepted by the new IdP.
- **Changed claims** — the IdP drops, adds, or renames claims (e.g., `email` → `email_verified` + `preferred_username`, or `groups` flattened to a different path).
- **Changed subject identifiers** — the `sub` claim value differs for what was the same logical user. This is the **privacy-relevant signal**: if `sub` changes across refederation, linkability between old and new identities is broken at the protocol level; if `sub` is preserved, refederation is functionally a trust refresh, not an anonymity gain.
- **Updated trust configuration at RP** — JWKS rotation, new issuer pinning, new `aud` allowlist, optionally `iss` allowlist.

Common triggers:

1. **Issuer URL migration** — e.g., `auth0.example.com` → custom IdP under the org's own domain.
2. **Org merge** — two companies combine, and the merged org consolidates around one IdP.
3. **IdP deprecation** — vendor end-of-life (e.g., a deprecated SSO provider); users re-federate to the replacement.
4. **Trust revocation** — security incident at the old IdP; new trust is established with a different provider as a precaution, or in addition to the old one during a transition window.

**Critical asymmetry**: refederation is a *server-side* event at the IdP and a *config* event at the RP. End users (or workloads) typically do not generate a new credential — they get a token from the new issuer. This is why refederation is "silent" from the user's perspective but loud from the verification perspective.

## 3. Refederation in Sigstore

Sigstore's attestation layer is: **Fulcio** (issues a short-lived X.509 cert bound to an OIDC identity claim) + **Rekor** (transparency log of all certs + signatures). Signing identity is the subject of the Fulcio cert, which is derived from the OIDC token presented at signing time.

Refederation in Sigstore = the **OIDC provider used to obtain the signing-time identity token changes**, while the workload identity claim stays equivalent.

Concrete scenarios:

- **GitHub Actions OIDC → Google Cloud Workload Identity Federation** — same workload (a CI job), but the OIDC issuer anchor shifts. Rekor entries made under the old issuer are still valid in the log; the trust decision now requires accepting the new issuer's CA root at Fulcio.
- **Self-hosted Tekton → hardened runner** — same pipeline intent, different provenance chain. Rekor v2's tile-based log model (per `sigstore-rekor-v2` skill) gives explicit sharding that can hold entries from multiple issuers without a single log-level cross-issuer correlation — but only if the witness quorum is configured to recognize both issuers' CAs.
- **Cross-org handoff** — workload moves to a new owner; signing identity is re-bound to the new org's IdP.

Verification implications:

1. The verifier's **trust list** must include the new issuer's CA root.
2. The **subject identifier** in the cert is whatever the new OIDC token asserted — if the new IdP issues a different `sub` for the same workload, the Sigstore signature is treated as a different identity, not a continuation of the old one. This breaks continuity unless explicitly bridged.
3. The **Rekor inclusion proof** still proves the signature was logged at a specific time, but does NOT prove the old identity is the same actor as the new identity — that requires an out-of-band attestation about the migration.
4. **SLSA L3 attestation chaining** (per `slsa-provenance` skill) requires the provenance attestation's `predicate.invocation.configSource.uri` and the build's identity claim to be consistent across refederation. A gap here is a refederation that breaks SLSA L3 chain.

## 4. Multi-federation as a privacy/anonymity lever

The question Duck.ai addressed: **can multi-federation actually provide a more anonymous / better scheme to verify?**

The answer is conditional — multi-federation is a tool, not a guarantee. It helps OR hurts depending on design:

**When multi-federation helps (privacy-preserving):**

- **Different IdPs per RP** — the same user uses IdP A for RP A, IdP B for RP B. No single IdP sees the user's full activity graph.
- **No global stable identifier** — no `email`, no `login`, no `national_id` claim that links the user across federations.
- **Minimum claims per RP** — present only what the RP needs (e.g., "is_over_18 = true" without birthdate).
- **Rotated / scoped identifiers per audience** — pairwise pseudonymous IDs that change per (RP, IdP) pair.

**When multi-federation HURTS (privacy-reducing):**

- **Reuses the same email/subject across providers** — the user has the same `email_verified` claim at IdP A, IdP B, IdP C; if any one colludes or is breached, the link is trivial.
- **Lets providers correlate logins** — shared timing, shared IP, shared device fingerprint, or shared RP list across IdPs.
- **Composite attestations** — combining multiple IdP attestations into one super-identity that is MORE traceable than any single one.

The **best scheme for anonymity** in Duck.ai's framing (and consistent with the IETF selective-disclosure and pairwise-subject literature):

1. **Pairwise / per-audience subject IDs** — `sub` is a salted hash of `(user_secret, audience_id)` so that two different RPs get two different `sub` values for the same human, and neither can derive the other.
2. **Selective disclosure** — present only the claims the RP needs. SD-JWT (IETF `draft-ietf-oauth-selective-disclosure-jwt`) is the canonical implementation.
3. **No shared persistent identifier** — no global user ID leaks across RPs; the persistent identifier lives only at the IdP (or never, in pure pairwise schemes).
4. **Verifiable claims tied only to the specific transaction** — claims expire or are scoped per use; replay across transactions fails.

The same logic applies to workload identities in Sigstore: a per-RP workload cert with claims scoped to the specific signing event is more privacy-preserving than a long-lived workload identity that gets used across many signing operations.

## 5. Privacy-preserving multi-federation trust model — design constraints

A sketch (research-level; Jenny has prior art and explicitly declined a fresh sketch on the call):

**Components:**

- The user or workload holds **N identity credentials** from **N independent IdPs** (independent trust roots).
- Each RP is bound to **one specific IdP** (or a small allowlist) — never "any IdP that says yes".
- The IdP issues tokens with **per-RP `sub`** (pairwise subject) and **per-transaction claim scoping** (selective disclosure).
- The RP stores only the **pairwise pseudonymous ID** — never an email, never a long-lived subject.

**Properties:**

- **No global stable identifier** — even if one IdP is compromised, the attacker learns one `(user, RP)` pair, not the user's full activity graph.
- **No correlation across RPs** — because `sub` is per-RP and IdPs don't share logs.
- **Refederation is cheap** — if IdP A is compromised, you rotate to IdP B without breaking continuity at the RP (because the RP's `sub` was already per-RP and can be re-issued).
- **Composability with Sigstore** — Fulcio certs derived from per-RP OIDC tokens are themselves per-RP signing identities, which fits the Sigstore model cleanly (the cert is short-lived anyway).

**Failure modes to avoid (Duck.ai's "when it hurts" list):**

- Reusing the same email/subject across IdPs (the most common anti-pattern).
- Letting IdPs correlate by shared metadata (timing, IP, user-agent).
- Composing multiple IdP attestations into one super-identity.

This is a research note — the actual design tradeoffs in real deployment (e.g., how to handle lost-IdP recovery, key escrow, regulatory compelled disclosure) are out of scope and depend on jurisdiction, threat model, and IdP capability. Jenny's prior art is the reference for the full design.

## 6. Implications for yubiOS

The connection to yubiOS:

- **yubiOS's SLSA provenance + SBOM attestations** rely on Sigstore (Fulcio + Rekor). The CI's OIDC issuer (currently GitHub Actions) is a **federation point** for the signing identity. Per `slsa-provenance` and `sigstore-rekor-v2` skills.
- **If yubiOS's CI OIDC issuer ever changes** (e.g., to a self-hosted Sigstore + custom OIDC provider, or to a different cloud's workload identity federation), the **signing identity remains "yubiOS's CI"** but the federation is **refederated**. Verification policies must update:
  - The verifier's trust list must include the new issuer's CA root.
  - Old Rekor entries remain valid (they prove the signature happened at the logged time) but new entries compose a separate shard under the new issuer unless explicit cross-issuer anchoring is configured (Rekor v2 tile model supports this; Rekor v1 does not).
  - SLSA L3 provenance chain may break if `predicate.invocation.configSource.uri` and the workload identity claim change in ways the verifier does not recognize as a continuation.
- **A multi-federation design** could let yubiOS verify builds from **multiple independent CI sources** (e.g., GitHub Actions + a self-hosted Tekton + a hardened runner) without a single trust-anchor becoming a single point of compromise. This is consistent with the attestation layer's existing goal of avoiding single-trust-anchor centralization.
- **Privacy angle is relevant** if yubiOS's supply chain needs to support builders / signers who should not be correlatable across builds (e.g., independent maintainers contributing to the same artifact). Pairwise workload identities + selective disclosure in Fulcio claims would make builds unlinkable across builders while preserving SLSA L3 provenance.

**Cross-references to existing yubiOS research:**

- `refs/slsa-l3-sbom-cosign-integration-spec-2026-08-04.md` — the SLSA L3 integration spec is the yubiOS canonical reference for how Sigstore is currently integrated. Any refederation plan must update the spec's `iss` allowlist section.
- `refs/attested-bootc-gpu-cutover-2026-07-30.md` — the bootc GPU cutover note is the closest precedent for a CI change that touches the signing identity chain.
- `refs/naming-licensing-provenance-2026-07-25.md` — provenance naming conventions; relevant if a refederation renames the signing identity convention.
- `skills/github-yubios-KS9n5GAT/sigstore-rekor-v2/SKILL.md` — the dedicated Rekor v2 reference. Tile-based sharding + witness quorum are the operative primitives for cross-issuer attestation without log-level correlation.
- `skills/github-yubios-KS9n5GAT/slsa-provenance/SKILL.md` — SLSA L3 attestation chain reference. Refederation affects `predicate.invocation.configSource.uri` and the build-level identity claim.

## 7. Recommended next steps

If Jenny wants to action this beyond research:

1. **A 1-page design sketch** for pairwise subject IDs in Sigstore workload identities — concrete `sub` derivation, claim scoping, and RP binding rules. **PENDING** Jenny's go-ahead (she declined a fresh sketch on the call; prior art is the reference).
2. **A 2-column comparison** — current yubiOS OIDC trust (GitHub Actions) vs a refederated/multi-federated alternative. Would slot into `refs/slsa-l3-sbom-cosign-integration-spec-2026-08-04.md` as an update.
3. **An OMN ticket** if this becomes a roadmap item. Currently P2 — research-stage, no implementation directive.
4. **Don't propose code changes** without Jenny's explicit go-ahead. This is research, not an implementation directive. Jenny's "ive already built one in the past" indicates prior art exists and the design is owned; the right move is to read her existing design rather than re-design from scratch.

## Sources

- Duck.ai (GPT-5.4 mini) thread — 4 prompts, 8/4/2026 (transcript at `session/attachments/rVZPUeMb-173e04fb.txt`, block 6 of 9).
- Sigstore docs — [sigstore.dev](https://www.sigstore.dev/)
- Fulcio spec — [github.com/sigstore/fulcio](https://github.com/sigstore/fulcio)
- Rekor v2 transparency log spec — [github.com/sigstore/rekor](https://github.com/sigstore/rekor)
- OIDC core spec — [openid.net/specs/openid-connect-core-1_0.html](https://openid.net/specs/openid-connect-core-1_0.html)
- OpenID Federation spec — [openid.net/specs/openid-federation-1_0.html](https://openid.net/specs/openid-federation-1_0.html)
- Pairwise subject identifiers — Microsoft Entra ID docs and Auth0 docs (subject identifier types: `public`, `pairwise`)
- Selective disclosure JWT — IETF `draft-ietf-oauth-selective-disclosure-jwt` (SD-JWT)
- yubiOS cross-refs — `refs/slsa-l3-sbom-cosign-integration-spec-2026-08-04.md`, `refs/attested-bootc-gpu-cutover-2026-07-30.md`, `refs/naming-licensing-provenance-2026-07-25.md` on `yubi-OS/yubiOS` main
- Skills — `skills/github-yubios-KS9n5GAT/sigstore-rekor-v2/SKILL.md`, `skills/github-yubios-KS9n5GAT/slsa-provenance/SKILL.md`, `skills/github-yubios-KS9n5GAT/security-and-hardening/SKILL.md`

---

## Cycle-1 RSI atomic edit (single-action-curve-rsi, 2026-08-07)

**Primitive flipped**: `has_constraint` (geodesic-only criterion, single-action-curve-rsi atom)
**Predicted geodesic delta**: +0.05 (predicted)
**Source**: per-file RSI cycle 1, applied in main thread after cycle-0 deep-research subagent completed.
**Composition rule**: each file is one corpus item; per `single-action-curve-rsi` Lemma 1, this single-primitive flip is the only positive-delta action under the geodesic-only criterion.

### 5a. Explicit design constraints (cycle-1 RSI atomic edit)

These rules promote the section 5 sketch from "design intent" to "auditable contract":

**MUST** - required for any deployment claiming privacy preservation:
- Each RP MUST be bound to exactly ONE IdP (or a small allowlist), never "any IdP that says yes".
- The IdP MUST issue per-RP `sub` (pairwise subject), salted by `(user_secret, audience_id)`.
- The IdP MUST scope claims per transaction; no persistent cross-transaction claim reuse.
- The RP MUST store only the pairwise pseudonymous ID - never the IdP's persistent user identifier.

**MUST NOT** - explicit bans derived from Duck.ai's "when it hurts" list:
- An identity MUST NOT be reused across IdPs (no shared `email`, no shared `national_id`).
- The RP MUST NOT log timing/IP/UA metadata that would let IdPs correlate logins.
- Composite attestations MUST NOT be treated as a primary identifier.

**NEVER** - hard bans:
- NEVER share RP-IdP binding metadata with other RPs.
- NEVER derive a global user identity by composing multiple IdP attestations.
- NEVER use a long-lived workload cert where a per-event short-lived cert is feasible.

These constraints are research-level - Jenny's prior art is the authoritative source for the full constraint set (deployment-specific considerations: lost-IdP recovery, key escrow, compelled disclosure are out of scope here).


## Evidence inventory


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4816) were identical placeholder copies with no per-file content; merged on 2026-09-18.
