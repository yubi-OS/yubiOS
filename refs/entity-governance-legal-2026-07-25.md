# yubiOS entity, governance, and legal review track

**Status:** decisions and review tracks framed, none resolved (require Jenny/real counsel) | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-72](https://linear.app/omni-agent/issue/OMN-72/entity-governance-and-legal-work)

## Why this exists, and what it hands off

OMN-72 asks for five things: the near-term entity approach, an advisory/
governance structure before GA, a legal review track for naming/trademark,
a review of licensing/provenance/contributor policy, and a review of
contract/insurance/privacy/export/regulatory obligations. **The naming,
licensing, and provenance items are already covered** in
[refs/naming-licensing-provenance-2026-07-25.md](naming-licensing-provenance-2026-07-25.md)
(OMN-81, PR #110) â this document references that work rather than re-deriving
it, per that document's own note that it feeds OMN-72 without duplicating its
full scope. What's new here: the entity-approach framing, the advisory/
governance structure, and the contract/insurance/privacy/export/regulatory
review â none of which OMN-81 covered.

## 1. Near-term operating entity approach

**Not decided here â this section frames the decision, it doesn't make it.**
COMPANY.md records yubiOS as pre-launch with a single Founder/Lead Developer
and no entity type on file. The actual choice (sole proprietorship, LLC,
nonprofit, etc.) depends on Jenny's personal tax/liability situation and
funding path (OMN-86), which this session has no visibility into.

What this document *can* state, grounded in what's already drafted:

- **The decision is now time-sensitive**, not abstract. [refs/offer-pricing-architecture-2026-07-25.md](offer-pricing-architecture-2026-07-25.md)
  (OMN-71) includes contract-bearing offers (O3 support/SLA, O4 managed CI,
  O5 consulting) that normally want *some* entity in place before signing a
  real contract or taking payment â [refs/naming-licensing-provenance-2026-07-25.md](naming-licensing-provenance-2026-07-25.md)
  (OMN-81) Â§4 already flagged this as blocking those offers.
- **A public-interest angle exists** given the covenant's (OMN-70) framing and
  S3 in [refs/who-pays-and-why-2026-07-25.md](who-pays-and-why-2026-07-25.md)
  (OMN-69) â if grant/nonprofit funding (OMN-86) becomes the primary path for
  public-interest pilots, that could push the entity decision toward a
  structure compatible with grant eligibility. This is a real consideration
  to raise with counsel, not a recommendation this document is positioned to
  make.

## 2. Advisory and governance structure before General Availability

Framed against what the covenant (OMN-70) and conflict policy (OMN-82,
PR #107) already committed to, since governance structure needs to be able to
actually enforce those commitments:

- **The conflict policy (OMN-82) already names the honest current gap**: "yubiOS's
  public org chart currently lists a single Founder/Lead Developer role...
  today's practical answer is that a flagged conflict blocks merge until
  Jenny... resolves it." This document doesn't invent a board or advisory
  committee that doesn't exist â it records that before GA, this single-person
  decision authority is a real limitation worth naming, not hiding.
- **What GA plausibly requires, structurally** (not asserted as decided):
  - A named point of contact for security disclosure (per covenant Â§3
    Disclosure) â could be Jenny directly at this stage, but should be
    explicit in a `SECURITY.md`-style doc rather than implicit.
  - Some external technical review for trust-chain-affecting decisions, even
    informal (e.g., a small group of trusted reviewers for ADRs before GA) â
    the covenant's "roadmap control" commitment (no silent trust-chain
    decisions) is easier to keep credible with more than one reviewer, but
    this document does not name specific people, since none are recorded
    anywhere in this repo's memory as available for that role.
  - A documented escalation path distinct from "ask Jenny in chat" once (if)
    the team grows past one person â flagged as a GA blocker to revisit, not
    solved now.

## 3. Contract, insurance, privacy, export, and regulatory obligations

Each reviewed against what's actually offered/committed so far, not a generic
compliance checklist:

- **Contracts:** the SOW template in [refs/pilot-collateral-roi-baseline-2026-07-25.md](pilot-collateral-roi-baseline-2026-07-25.md)
  (OMN-84) exists as a *template* with legal terms left blank â before it's
  used with a real pilot partner, actual contract review (liability caps,
  IP ownership of consulting deliverables, SLA enforceability) needs real
  counsel. Not reviewed here; flagged as required before OMN-84's template
  is used for real.
- **Insurance:** no current data point in this repo. Support/SLA (O3) and
  consulting (O5) offers in OMN-71 typically carry liability exposure that
  professional liability or errors-and-omissions coverage addresses in
  similar businesses â whether yubiOS needs this, and at what level, isn't
  something this session can determine without knowing the actual entity
  structure (section 1) and offer volume, both undecided.
- **Privacy:** the covenant (OMN-70) Â§3 already commits to no phone-home
  telemetry by default. For any hosted/managed offer (O1 fleet dashboard, O4
  managed CI) that *does* handle customer operational data, a privacy policy
  covering what's collected, retained, and for how long is needed before
  those offers go live â not drafted here, since no such service exists yet
  to describe accurately.
- **Export:** yubiOS is security/cryptography software. Export control
  regimes (e.g., US EAR) can apply to cryptographic software distribution,
  including open-source projects, though open-source publication typically
  qualifies for specific carve-outs (e.g., EAR's publicly-available source
  code provisions) â **this is exactly the kind of claim that needs real
  export-control counsel to confirm for yubiOS's specific situation, not an
  AI-assisted generalization treated as legal clearance.** Flagged as a real
  open item, not resolved.
- **Regulatory:** no specific regulatory regime (e.g., FedRAMP, HIPAA, PCI) is
  implicated by anything committed so far â yubiOS doesn't yet have a
  compliance-scoped offer or customer. Revisit if/when a specific pilot
  partner's regulatory context (e.g., a school district under FERPA, or a
  municipality under state-level rules) becomes concrete.

## 4. Summary â what's actually open

| Item | Status |
|---|---|
| Entity type decision | Open â needs Jenny + real counsel, time-sensitive given OMN-71's contract-bearing offers |
| Advisory/governance structure | Open â current single-founder gap named honestly in OMN-82; no structure proposed to fill it beyond documenting the gap |
| Naming/trademark legal review | Open â see OMN-81 (PR #110), not re-covered here |
| Licensing/provenance review | Open â see OMN-81 (PR #110), not re-covered here |
| Contract review (SOW template) | Open â needed before OMN-84's template is used with a real partner |
| Insurance | Open â depends on entity type and offer volume, neither settled |
| Privacy policy | Open â needed before any hosted offer (O1/O4) actually launches |
| Export control | Open â needs real export-control counsel, not assumed clear |
| Regulatory | Not yet applicable â no compliance-scoped offer/customer exists |

## Dependencies

- References **OMN-81** (naming/licensing/provenance risk register, PR #110)
  rather than duplicating it.
- Section 1 depends on **OMN-71** (pricing, PR #108) for which offers need an
  entity in place, and **OMN-86** (funding targets, not yet landed) for the
  nonprofit/grant angle.
- Section 3's contract item depends on **OMN-84** (pilot collateral, PR #113).



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
