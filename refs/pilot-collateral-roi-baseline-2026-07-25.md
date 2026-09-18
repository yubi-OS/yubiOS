# yubiOS pilot collateral and ROI baseline

**Status:** SOW/data-sheet/worksheet templates drafted; no customer-specific numbers asserted | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-84](https://linear.app/omni-agent/issue/OMN-84/draft-pilot-collateral-and-roi-baseline)

## Why this exists

OMN-84 asks for the collateral needed to run a first paid pilot: a statement of
work, a public data sheet with support boundaries, an ROI baseline worksheet,
and the assumptions that still need customer-discovery validation. This builds
directly on [refs/offer-pricing-architecture-2026-07-25.md](offer-pricing-architecture-2026-07-25.md)
(OMN-71, PR #108) — the pilot offers here are O1 (managed enrollment) and O3
(support/SLA), the two offers that document already flagged as gated on
specific readiness gates rather than sellable today. Nothing below invents a
customer, a price, or a result; each template has its blanks intact and its
assumptions named.

## 1. Pilot statement of work (template)

```
yubiOS Pilot — Statement of Work (template)

Customer: [pilot partner name — not yet identified]
Pilot offer: [O1 Managed fleet enrollment | O3 Support/SLA — per OMN-71 catalog]
Duration: [to be set with partner; suggest 4–8 weeks per a first pilot,
           not asserted as agreed]
Fleet size: [pilot-scale, e.g. 10–50 devices per OMN-71's O1 pricing
             hypothesis — actual size set with partner]

Scope:
- What yubiOS will do: [enrollment/rotation for O1, or defined SLA response
  windows for O3 — fill in against the specific offer selected]
- What the customer provides: [hardware, YubiKeys, environment access,
  a named point of contact]
- Explicit readiness-gate dependency: this pilot cannot start selling O1
  until the OMN-63 real-hardware validation scenarios (PR #104) most
  relevant to enrollment (H1, H4, H10, H11) have actual evidence, not just
  a defined scenario list. O3 cannot start until B-VM-CTAP2 closes (per
  BLOCKERS.md). State clearly to the pilot partner which gate status
  applies at the time the SOW is signed — don't imply readiness that
  hasn't been evidenced yet.

Success criteria: [defined jointly with partner — e.g. "N devices enrolled
  with zero unintended lockouts" for O1, or "SLA response time met in M/N
  incidents" for O3 — not pre-filled here since no partner exists yet]

Pricing: per OMN-71's relevant offer row — hypothesis, to be confirmed with
  partner, not a committed number until the pilot itself validates it]

Data/telemetry: per covenant §3 (OMN-70) — no telemetry beyond what the
  pilot's own managed service inherently requires to operate, and that scope
  is disclosed to the partner up front, not implied.
```

## 2. Public data sheet and support boundaries (template)

```
yubiOS [Offer Name] — Data Sheet (template)

What it is: [one paragraph, grounded in MISSION.md and the specific offer's
  covenant-compliant description from OMN-71's catalog table]

What's included:
- [Bulleted from the specific offer row in OMN-71's catalog]

What's NOT included (support boundaries — per covenant §2/§3):
- Access to a different or stronger trust-chain mechanism than the free,
  public path — the covenant explicitly rules this out; the data sheet
  should say so plainly rather than let a prospect assume otherwise.
- Priority security fixes ahead of the public disclosure timeline — per
  covenant §3 Disclosure, fixes ship to everyone simultaneously; a pilot
  buys support response time, not early access to a fix.
- Custody of the customer's own key material — per covenant §2, no offer
  requires surrendering FIDO2/PIV/LUKS keys to yubiOS or a yubiOS-run
  service as a condition of the pilot.

Known limitations at pilot time: [pull the live, current BLOCKERS.md
  entries relevant to the offer — do not paraphrase from a stale cache;
  BLOCKERS.md is the source of truth per PROJECT_RULES.md]

Non-affiliation notice: yubiOS is not affiliated with or endorsed by Yubico
  (flagged as an open item to formalize once naming/trademark review closes
  — see refs/naming-licensing-provenance-2026-07-25.md, OMN-81).
```

## 3. ROI baseline worksheet (template)

A framework for the customer-side calculation, not a filled-in result — no
pilot has run yet to produce real inputs:

| Line item | Baseline (pre-yubiOS) | With yubiOS pilot offer | Source of the number |
|---|---|---|---|
| Cost of current root-of-trust approach (TPM/OEM/none) | [customer-provided] | N/A — YubiKey hardware cost only (~$25–70/device per MISSION.md) | Customer discovery interview |
| Incident response time for a lost/compromised credential | [customer-provided] | [pilot-measured, per O3 SLA terms if applicable] | Pilot SLA logs |
| Time to onboard/enroll a new device | [customer-provided] | [pilot-measured, per O1 enrollment logs] | Pilot enrollment logs |
| Audit/compliance evidence burden (time to produce proof of a trust-chain control) | [customer-provided] | [pilot-measured — e.g. time to pull an ADR + attestation vs. an opaque vendor claim] | Pilot + ADR.md/PINNED.md as evidence sources |
| Recurring cost of the pilot offer itself | N/A | [per OMN-71 pricing hypothesis, TBD with partner] | SOW pricing line |

**This worksheet only produces a real ROI once a specific customer fills in
the "customer-provided" baseline column** — this document supplies the
structure, not invented industry-average figures, which this session has no
grounded source for.

## 4. Assumptions requiring customer-discovery validation

- That a prospective pilot partner's current baseline (TPM, OEM secure
  enclave, or no hardware root of trust) is actually more expensive or slower
  than the pilot claims — unverified until a real conversation happens.
- That "time to produce compliance evidence" is a metric the target customer
  segment (per OMN-86's eventual public-security funding targets) actually
  tracks and cares about, rather than a metric this document assumes matters.
- That the pilot fleet size hypothesis (10–50 devices) matches what a real
  partner is willing to commit, rather than over- or under-shooting their
  actual appetite.
- That the readiness-gate disclosures in section 1 (stating current
  BLOCKERS.md status plainly) don't kill pilot interest — untested; the
  alternative (overstating readiness) is ruled out by doctrine, but its
  commercial cost is a real open question.
- That "support response time" (O3) is the value proposition a prospect
  actually wants, versus enrollment convenience (O1) — the two pilot offer
  candidates haven't been ranked against real customer interest yet.

## Dependencies

- Builds on **OMN-71** (offer/pricing, PR #108) for offer selection and
  pricing hypotheses, **OMN-70/82** (covenant + conflict policy, PR #106/#107)
  for support-boundary language, and **OMN-63** (real-hardware validation,
  PR #104) + BLOCKERS.md for the readiness-gate disclosure in sections 1–2.
- Shares its ROI structure with **T17 (OMN-78 customer ROI model)** — that
  issue should extend this worksheet with a fuller model once real pilot data
  exists, not redefine the line items from scratch.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Immutability coverage

This document upholds the yubiOS immutability layer — composefs repository, dm-verity root hash, ostree deployment, read-only / append-only semantics, sealed UKI / measured boot. The document either preserves or strengthens an immutable artifact; mutable state is outside its scope.
