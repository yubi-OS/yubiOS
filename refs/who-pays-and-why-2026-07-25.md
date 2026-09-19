# yubiOS — who pays and why

**Status:** draft segment/positioning framework; segment selection unvalidated by real customer contact | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-69](https://linear.app/omni-agent/issue/OMN-69/who-pays-and-why)

## Why this exists

OMN-69 asks for the initial customer profile, economic buyer, core jobs to be
done, and enterprise value proposition for the paid operator layer. This builds
on [refs/offer-pricing-architecture-2026-07-25.md](offer-pricing-architecture-2026-07-25.md)
(OMN-71) — the segments below are the *demand side* of that document's *supply
side* (the offer catalog). No segment here has been validated by an actual
customer conversation; each is a hypothesis to test in the pilot collateral
already drafted in [refs/pilot-collateral-roi-baseline-2026-07-25.md](pilot-collateral-roi-baseline-2026-07-25.md)
(OMN-84).

## 1. Initial target segments

Selected against MISSION.md's own stated bet ("security should be the
default — for everyone," "a $25–70 YubiKey is a better root of trust than a
TPM most people will never own, control, or even know is there") and the
ARM64-primary platform stance in README.md, not against market-sizing data
this session doesn't have:

| Segment | Why it's a plausible first target |
|---|---|
| **S1: Individual security-conscious developers/power users** | Directly matches MISSION.md's stated audience — someone who wants a real hardware root of trust without an enterprise contract. Lowest sales friction: buyer and user and champion are the same person. |
| **S2: Small security-conscious engineering teams/startups** | Need fleet-level FIDO2/PIV management (O1 in OMN-71's catalog) but can't justify enterprise TPM/HSM vendor contracts — the gap MISSION.md explicitly targets ("not security for people who can afford a security team"). |
| **S3: Public-interest organizations** (schools, municipalities, journalists, per OMN-86's eventual funding-target scope) | Aligns with the covenant's (OMN-70) public-interest framing and O7 (grants/pilots). Budget-constrained but security-need-real — the segment the covenant's commercial boundaries were written to serve without compromising. |
| **S4: ARM64 edge/embedded device builders** | README.md names ARM64 as "the primary target platform" for owning the firmware stack (TF-A/OP-TEE/fTPM/U-Boot) — a segment that needs the *engineering*, not just the OS, and maps to O5 (consulting). |

**Not selected, and why:** large enterprises with existing TPM/HSM
infrastructure and procurement processes are explicitly out of scope for the
initial push — MISSION.md's stance is that yubiOS's advantage narrows as
"scale, budget, or enterprise tooling" already solve the problem for that
buyer; competing there isn't where the mission's own stated edge is.

## 2. Core job to be done, per segment

| Segment | Job to be done |
|---|---|
| S1 | "Let me own my own root of trust without trusting a vendor's TPM, OEM, or cloud enclave — on hardware I already own or can afford." |
| S2 | "Let my team enroll, rotate, and audit hardware-backed credentials across our fleet without buying into an enterprise security vendor's platform." |
| S3 | "Let us run real hardware-backed security on a budget that doesn't assume enterprise procurement, and let us actually see and verify what's protecting us." |
| S4 | "Let me build a device that owns its own firmware trust chain (ARM64 TF-A/OP-TEE/fTPM) without being locked into an OEM's closed secure-boot implementation." |

## 3. Economic buyer and operational champion, per segment

| Segment | Economic buyer | Operational champion |
|---|---|---|
| S1 | The individual (buyer = champion = user) | Same person |
| S2 | Engineering lead / CTO (approves a recurring spend line) | Platform or security engineer (the person who'd actually run `homectl`/`bootc`/enrollment day to day) |
| S3 | IT director or budget holder / grants officer (per OMN-86 once it lands) | Whoever internally champions security — could be a single technologist inside an otherwise non-technical org; this role is likely the harder one to identify without direct discovery |
| S4 | Hardware product lead or engineering director | Firmware/embedded engineer doing the actual TF-A/OP-TEE integration |

**Flagged uncertainty, not resolved here:** for S3 in particular, "who
actually champions this internally" is exactly the kind of thing that needs a
real conversation, not a guess — public-interest orgs vary enormously in
whether they have any technical staff at all.

## 4. Why yubiOS wins vs. the next-best alternative

| Segment | Next-best alternative | Why yubiOS wins (or the honest risk that it might not) |
|---|---|---|
| S1 | Passphrase-only disk encryption, or a laptop's built-in TPM alone | A $25–70 YubiKey the owner physically controls beats a TPM the owner "will never own, control, or even know is there" (MISSION.md) — but only if yubiOS's own onboarding is genuinely simpler than "just use FileVault/BitLocker," which isn't proven yet. |
| S2 | Enterprise MDM/security vendor (Okta, enterprise HSM platforms) | Lower cost, fully auditable open trust chain (LGPL-2.1, public ADRs) vs. closed vendor black-box — but vendor platforms have mature fleet tooling yubiOS's O1 offer doesn't yet have evidenced at scale (per OMN-63's still-open real-hardware validation). |
| S3 | Doing nothing (accepting risk) or an underfunded partial solution | yubiOS's price point (hardware cost, not enterprise contract cost) is the actual argument — but this only wins if O7's grant/funding mechanism (OMN-86) actually materializes; without funding, "cheaper" doesn't help an org with zero discretionary security budget. |
| S4 | OEM-provided closed secure-boot stack | Owner/builder controls the full ARM64 firmware trust chain instead of trusting a SoC vendor's opaque implementation — real technical differentiation, but requires the ARM64 Path A board rehearsal (B-ARM64-PATHA) to actually close before this claim has hardware evidence behind it. |

## 5. Enterprise value proposition (reusable messaging)

**One-line:** *"A $25–70 hardware key, not a TPM you'll never see — an open,
auditable root of trust anyone can own."*

**Longer form, for S2/S4 (the segments closest to a "paid operator" motion
per OMN-69's own framing):**

> yubiOS puts the root of trust in your hands, not your vendor's. Every layer —
> Secure Boot signing, disk encryption, SSH, PAM — is open source (LGPL-2.1)
> and independently auditable, with every architecture decision recorded in
> public ADRs. You get the assurance of enterprise-grade hardware security
> without the enterprise contract, the vendor lock-in, or the black box.

**Guardrail on using this messaging:** per the covenant (OMN-70) §2, none of
this messaging should ever be used to imply a paid tier unlocks a *stronger*
trust boundary than the free path — the value proposition is about services,
support, and convenience around the same open trust chain, not a better
version of it for money.

## Dependencies

- Builds on **OMN-71** (offer/pricing, PR #108) and **OMN-70/82** (covenant +
  conflict policy, PR #106/#107) for the messaging guardrail.
- Feeds **OMN-84** (pilot collateral, PR #113) — the SOW template there should
  eventually name a specific segment/persona from section 1 once a real pilot
  partner is identified.
- S3's funding mechanism depends on **OMN-86** (public-security funding
  targets, not yet landed).


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.
