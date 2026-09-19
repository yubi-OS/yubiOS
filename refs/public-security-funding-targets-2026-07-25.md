# yubiOS public-security funding targets

**Status:** target list + rationale, not an application — no application drafted or submitted | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-86](https://linear.app/omni-agent/issue/OMN-86/apply-selectively-for-public-security-funding)

## Why this exists

OMN-86 asks for grants/sponsorships fitting clearly public deliverables,
screened against roadmap/governance distortion, matched to scoped public
outputs, with a lightweight application backlog and decision criteria. This
is a target list and screening rationale, verified against each program's own
site via web search on 2026-07-24/25 — **no application to any program has
been drafted or submitted.** Every program below is real and currently active
as of that search; specific deadlines/amounts should be re-verified on the
program's own site immediately before applying, since these programs run on
rolling or periodic cycles.

## 1. Candidate programs

| Program | What it funds | Fit for yubiOS |
|---|---|---|
| **OpenSSF / Alpha-Omega** (Linux Foundation, backed by Microsoft, Google, GitHub, OpenAI) | Direct maintainer engagement, security audits, and quality improvements for critical open source projects; a new $12.5M investment was announced March 2026 | Strong fit — yubiOS's entire mission (MISSION.md) is security-audit-shaped work: dm-verity, SLSA provenance, OPA/Rego supply-chain gates. Alpha-Omega's own scope (expert security analysis + maintainer engagement) matches exactly what BLOCKERS.md's open items (B-VM-CTAP2, B-REAL-FIDO2) need. |
| **GitHub Secure Open Source Fund** | $10,000 per project, cohort-based (3 weeks), security education + mentorship + Copilot/Copilot Autofix access; rolling applications | Good fit for a scoped, fast cycle — the "public deliverable" is a documented security posture improvement (e.g. closing one specific BLOCKERS.md entry), not an open-ended ask. Small amount, low governance risk. |
| **Open Technology Fund (OTF) — FOSS Sustainability Fund** | Security, resilience, and interoperability of internet-freedom technologies; solicitation-cycle based (most recent 2026 cycle closed May 2026) | Conditional fit — OTF's anti-censorship/internet-freedom framing is adjacent to, not identical with, yubiOS's owner-controlled-hardware-root-of-trust framing. Worth applying only if a specific yubiOS deliverable (e.g. FIDO2-first auth for at-risk users) maps cleanly to OTF's stated mission, not a generic "we do security" pitch. Next cycle timing needs re-checking on OTF's site — the last cycle already closed. |
| **Sovereign Tech Fund / Sovereign Tech Agency** | Long-term maintenance and security of open digital base technologies critical to (primarily European) digital infrastructure; explicitly does not fund prototypes | Conditional fit, and a real screening risk — yubiOS is currently pre-launch/prototype-stage per COMPANY.md, and this fund explicitly excludes prototypes. Not a fit *now*; revisit once yubiOS has shipped a stable base technology (e.g. the trust-chain core) rather than applying prematurely. |
| **NLnet Foundation** (NGI Zero Commons Fund and other themed funds) | R&D grants for the open internet — privacy, security research, critical library maintenance; NGI Zero Commons' most recent call closed June 1, 2026, but NLnet runs multiple themed funds year-round | Good fit — NLnet's remit (privacy, security research) matches yubiOS's owner-controlled-security framing well, and their grant sizes (per third-party guides, up to ~€50K) suit a scoped deliverable like the ARM64 fTPM stack or a specific hardening audit. Confirm which themed fund is currently open before applying — the Commons Fund's own most recent call already closed. |

## 2. Screening criteria (filtering out roadmap/governance distortion)

Per OMN-86's own ask and the covenant's (OMN-70, PR #106) "roadmap control"
commitment ("the roadmap can be commercially informed... but cannot be
commercially *gated*"), a funding source is screened OUT if:

- It requires yubiOS to prioritize a feature or timeline the funder wants
  over what the trust-chain readiness gates (BLOCKERS.md, roadmap-promotion-
  gates) already say is next — funding buys scoped deliverables, not roadmap
  control.
- It requires exclusivity, non-disclosure of the funding relationship, or any
  term that would conflict with the covenant's (OMN-70) "what remains public"
  commitments (ADRs, threat models, trust-chain source).
- It would require accepting money in exchange for a governance seat or veto
  over trust-chain decisions — per the conflict policy (OMN-82, PR #107),
  trust-chain decisions aren't for sale regardless of source.
- It funds only prototype/exploratory work with no path to a public,
  citable deliverable (an ADR, a merged PR, a published audit) — matches
  OMN-86's "match each viable opportunity to a scoped public output" ask.

None of the five programs above were screened out by these criteria as of
this review — the Sovereign Tech Fund is flagged as *not yet ready* (prototype
stage), not as conflicting with the criteria.

## 3. Matching opportunities to scoped public outputs

| Program | Scoped public output if pursued |
|---|---|
| Alpha-Omega | A security audit or maintainer-engagement deliverable tied to closing B-VM-CTAP2 or B-REAL-FIDO2, published as an ADR + refs/ writeup, same pattern as existing audits (e.g. systemd-hardening-audit-2026-07-17.md) |
| GitHub Secure Open Source Fund | One 3-week cohort cycle scoped to a single, named improvement — e.g., closing out the OMN-63 real-hardware validation scenarios (PR #104) with actual evidence, published as a refs/ update |
| OTF FOSS Sustainability Fund | Only if scoped to a specific at-risk-user use case (e.g. journalists/activists per S3 in refs/who-pays-and-why-2026-07-25.md) with a named public deliverable, not a general operating grant |
| Sovereign Tech Fund | Deferred — revisit once a stable, non-prototype deliverable exists (e.g. the trust-chain core post-GA) |
| NLnet | A themed-fund deliverable tied to a discrete piece of work (ARM64 fTPM stack per `ftpm-optee-tpm`/`arm-trusted-firmware-optee` skills, or a hardening audit), published as its own refs/ or ADR entry |

## 4. Lightweight application backlog and decision criteria

**Backlog (priority order, not yet started):**

1. **GitHub Secure Open Source Fund** — lowest friction (rolling
   applications, 3-week cycle, small clear scope), good first attempt to
   validate the "scoped public output" pattern before pursuing larger grants.
2. **Alpha-Omega** — highest strategic fit given yubiOS's audit-shaped needs,
   but likely a longer/more involved application; pursue once the fund cycle
   details are confirmed on their site.
3. **NLnet** (a specific themed fund, once identified as currently open) —
   good fit for a scoped technical deliverable like the ARM64 fTPM work.
4. **OTF** — only if a genuine at-risk-user angle is identified; otherwise
   skip rather than force a fit.
5. **Sovereign Tech Fund** — explicitly deferred, not abandoned; revisit
   post-GA.

**Decision criteria before submitting any real application (not yet
applied to any of these criteria, since no application is drafted):**

- Does the scoped deliverable map to something already in BLOCKERS.md or the
  roadmap-promotion-gates framework, rather than inventing new scope just to
  fit a funder's theme?
- Does accepting the funding pass the section 2 screening criteria with no
  exceptions?
- Is there a named owner (Jenny, given the current single-founder state per
  OMN-72/PR #117) who can actually execute the application and the resulting
  deliverable, given everything else already in flight?

## Dependencies

- Section 3's OTF row depends on **OMN-69** (who pays and why, PR #116) for
  the at-risk-user segment framing.
- Section 2's screening criteria depend on **OMN-70/82** (covenant + conflict
  policy, PR #106/#107).
- Feeds **O7** in **OMN-71** (offer/pricing, PR #108), which already treats
  this funding line as upside, not near-term revenue.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.
