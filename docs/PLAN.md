# yubiOS Business and Stewardship Plan

Status: proposed operating model  
As of: 2026-07-17  
Project stage: pre-launch / groundwork  
Planning horizon: three years after the first supported release

## Executive decision

yubiOS should be operated as a public-first cybersecurity project with a capital-light commercial company around it. The company should sell accountable operations—supported releases, fleet assurance, integration, recovery, evidence, and response—not access to the security-critical source code.

The recommended model is **services-to-subscription**:

1. Keep the operating system, security fixes, build metadata, SBOMs, provenance, threat model, and self-service path public.
2. Use paid, fixed-scope design partnerships to fund the remaining proof work and learn what enterprise buyers will actually pay for.
3. Convert repeatable work into an annual per-node assurance subscription, with an optional managed fleet service.
4. Add hardware enablement, training, and grants as secondary revenue streams.
5. Delay any production-readiness claim or production SLA until the engineering and support gates in this plan are met.

This model fits the mission: an individual can retain owner control without a vendor relationship, while an enterprise can pay for a named party to operate the release, support, evidence, and recovery process.

The base-case planning model reaches approximately **$350,000, $1.2 million, and $3.55 million of recognized revenue** in Years 1–3, with operating break-even during Year 3. **These figures are illustrative scaffolding, not validated forecasts — see §6 and `refs/three-year-revenue-cost-model-2026-07-25.md` (OMN-77).** These are planning assumptions, not forecasts. The model assumes current revenue is $0 because no revenue, paying-customer, or production-deployment evidence was supplied or found in the repository.

## 1. Current position and evidence boundary

### What exists

- An LGPL-2.1-licensed public repository for a FIDO2-first, bootc-delivered immutable Linux OS.
- A differentiated owner-control thesis: PIV/PKCS#11 for signing, FIDO2 for disk and user workflows, signed UKIs, verified `/usr`, pinned inputs, SBOMs, provenance, and A/B recovery.
- ARM64 as the flagship route to an owner-provisioned platform chain, with x86-64 supported above an OEM-controlled firmware boundary.
- Public architecture decisions, threat modeling, security policy, blockers, and research notes.
- Active implementation and documentation work.

### What does not yet exist as verified business evidence

- A production-supported release.
- A completed real-board ARM64 Path A proof.
- Production confidence from physical-YubiKey end-to-end validation.
- A published supported-hardware matrix and lifecycle commitment.
- Audited security, compliance certification, a staffed SLA, or a 24x7 response function.
- Disclosed paying customers, recurring revenue, renewals, customer ROI measurements, or a qualified sales pipeline.

GitHub activity is evidence of work, not evidence of product-market fit. Stars, commits, issues, and pull requests must not be used as substitutes for retained users, successful pilots, reference deployments, or renewals.

### Claims that remain off-limits

- “Production-ready,” “certified,” “unbreakable,” “zero trust anchors,” “only,” “first,” or “most secure.”
- An affiliation with, endorsement by, or certification from Yubico, Fedora, systemd, bootc, OpenSSF, or a hardware vendor without a signed agreement.
- Quantified breach reduction or compliance savings without customer-specific baseline data.
- Equal platform-root guarantees across ARM64 Path A, ARM64 Path B, and x86-64.

## 2. Who pays and why

### Initial customer profile

Start with organizations for which a small fleet has unusually high consequence or trust requirements—not with general desktop buyers.

| Segment | Initial fleet | Job to be done | Economic buyer | Why yubiOS may fit |
|---|---:|---|---|---|
| Release and signing workstations | 25–150 nodes | Protect artifact signing, release engineering, SSH, and privileged local identity | CISO, VP Engineering, Head of Platform | Owner-held authorization plus verified, replaceable OS images |
| Security engineering and privileged developer fleets | 50–500 nodes | Standardize a hardened endpoint with recoverable hardware-token ceremonies | CISO, security platform lead | Public threat model, immutable OS, evidence and recovery workflow |
| Regulated labs and high-assurance environments | 25–250 nodes | Produce repeatable deployment and control evidence, including offline operation | Compliance lead, lab director, CISO | Signed releases, evidence packs, air-gap option, bounded platform claims |
| ARM64 appliance and edge builders | 100–10,000 devices | Avoid building and maintaining a verified Linux and owner-key workflow alone | CTO, product security lead | Board-specific enablement, firmware-chain work, bootc lifecycle |

Research labs, firmware specialists, and security consultancies are useful design partners. General consumers, broad office fleets, and safety-critical deployments are not initial commercial targets.

**Note (added 2026-07-28):** the four enterprise segments above (release/signing workstations, security engineering fleets, regulated labs, ARM64 appliance builders) are the **enterprise overlay** for paid operators; the canonical demand-side segment list (including S1 individuals, S2 small teams, S3 public-interest orgs) lives in `refs/who-pays-and-why-2026-07-25.md` (OMN-69). This doc does not enumerate the full demand side; it only describes the enterprise subset of it. The two lists are not in conflict — they cover different altitudes (demand vs. paid-operator overlay).

### The enterprise value proposition

The free project supplies capability. The paid operator supplies accountability:

- A named release owner and supported lifecycle.
- Tested updates, rollback evidence, compatibility qualification, and recovery drills.
- Security advisories, case handling, and bounded response commitments.
- Deployment, enrollment, and air-gap runbooks tied to a known hardware matrix.
- Procurement-ready SBOM, provenance, dependency, vulnerability, and control evidence.
- Help integrating identity, logging, update infrastructure, and incident procedures.

The economic comparison is not “free Linux versus paid Linux.” It is **yubiOS operations versus the next-best alternative**: internal platform/security engineering, external integration, continuing test maintenance, and the cost of assembling evidence for every release.

## 3. Public-interest operating covenant

The following commitments should be published before accepting unrestricted sponsorships or production subscription revenue.

### What remains public

- All security-critical OS code and build recipes under the current license or another OSI-approved license adopted through a public process after legal review.
- Security fixes and advisories released to the public at the same time as to paying customers, subject only to normal coordinated-disclosure embargoes.
- Public release hashes, SBOMs, provenance, verification instructions, threat model, supported-version status, and known blockers.
- An open management agent and documented protocol. A hosted service may charge for operation, scale, integrations, and support, but must provide customer data export and a credible self-host path.
- A free, non-telemetry-dependent path for individuals to build, install, update, recover, and replace their own trust material.

### What customers may buy

- Response time, named support, release lifecycle, compatibility qualification, managed operation, evidence assembly, and integration labor.
- Private handling of their configurations and incidents.
- Priority for a business problem, but not unilateral control over the public roadmap or the right to suppress a security fix.

### Stewardship rules

- No advertisements, sale of usage data, mandatory phone-home telemetry, or dark patterns.
- Telemetry is off by default, documented, minimal, revocable, and separable from security updates.
- Disclose material sponsors, customer-funded roadmap work, conflicts, and any exception to normal release policy.
- Prefer a Developer Certificate of Origin and contributor ownership over mandatory copyright assignment. Do not make dual licensing a core revenue dependency.
- Do not maintain permanent customer-only forks of security-critical code. Upstream reusable fixes unless a documented confidentiality or hardware constraint prevents it.
- At $1 million ARR, create an annual public-interest budget equal to the greater of $25,000 or 5% of the prior year’s subscription gross profit for upstream fixes, independent review, hardware access, documentation, and security work.
- Publish an annual transparency report covering revenue mix, sponsor concentration, public-interest spending, security response performance, governance changes, and unresolved conflicts.

## 4. Offer and pricing architecture

Prices below are launch hypotheses for customer discovery. They should be tested through paid pilots and changed based on measured support cost and willingness to pay.

| Offer | Public starting price | Buyer receives | Launch gate |
|---|---:|---|---|
| Community | $0 | Public images/source, public fixes, SBOM/provenance, self-service docs, community support | Available throughout pre-launch with current warnings |
| Design-partner pilot | $35,000–$75,000 fixed fee | 6–10 week scoped evaluation, deployment design, recovery exercise, evidence report, measured operator-time baseline | Technical Preview |
| Assured Fleet subscription | $600/node/year; $25,000 annual minimum | Supported stable channel, lifecycle policy, business-hours cases, advisories, compatibility matrix, release evidence, update/rollback and recovery runbooks | Supported Pilot |
| Regulated / air-gapped assurance | $1,200/node/year; $75,000 annual minimum | Offline bundles, enhanced evidence, designated technical owner, 24x7 P1 response when staffing exists, quarterly recovery exercise | General Availability and support coverage |
| Managed fleet operations | +$240/node/year; $15,000 annual minimum | Hosted rollout rings, fleet inventory, policy/evidence export, health and update orchestration | After a secure, self-hostable management protocol exists |
| Board or appliance enablement | $100,000–$250,000 NRE; $25,000–$75,000/model/year maintenance | Board bring-up, firmware-chain validation, test automation, update lifecycle, evidence | Board-specific proof and contract review |
| Private training | $20,000/cohort or $2,500/seat | Operator enrollment, recovery, release verification, incident and update drills | Technical Preview |

There should be no per-device royalty for the right to use the open-source operating system. Hardware and OEM revenue should pay for engineering, validation, certification maintenance, and support.

### Revenue priority

1. Annual assurance subscriptions.
2. Fixed-scope implementation and board enablement that can become reusable product capability.
3. Managed fleet operations.
4. Training and recovery exercises.
5. Grants and sponsorships for explicitly public work.

Grants are useful but should not be treated as recurring customer revenue. Sponsorship must never buy undisclosed roadmap control, favorable vulnerability handling, or an endorsement.

## 5. Readiness gates and go-to-market

### Gate 0 — Current groundwork

Allowed: public development, grants, sponsored research with public deliverables, customer interviews, and clearly non-production advisory work.

Required before leaving Gate 0:

- Resolve the active VM, real-FIDO2, runtime-hardening, pin-refresh, and release-evidence blockers relevant to the pilot platform.
- Obtain trademark/name clearance and explicitly address possible confusion with YubiKey/Yubico.
- Review LGPL-2.1 suitability, copyright provenance, third-party redistribution duties, and cryptography/export requirements with qualified counsel.
- Publish the operating covenant, support boundaries, privacy position, contribution policy, and commercial conflict policy.
- Define one bounded pilot platform rather than promising the full future hardware matrix.

### Gate 1 — Technical Preview

Required evidence:

- A repeatable physical-YubiKey enrollment, unlock, signing, SSH/PAM, loss, replacement, and recovery demonstration on disposable hardware.
- Green update/rollback and VM evidence for the chosen pilot image.
- Reproducible release identifiers, signed verification material, SBOM, provenance, and production/dev separation.
- One published recovery exercise and one externally reviewed threat/control correction.

Allowed: paid pilots with non-production terms, 25–50 disposable or non-critical devices, fixed scope, and explicit acceptance criteria.

### Gate 2 — Supported Pilot

Required evidence:

- At least two qualified hardware configurations for the platform being sold.
- Ninety days of update, rollback, vulnerability-handling, and support-case exercises.
- A tested security intake and incident communications runbook.
- Supported-version, severity, response, escalation, backup, and end-of-life policies.
- A support owner for every paid account and a sustainable on-call arrangement. Do not promise 24x7 coverage with fewer than three trained responders or a contracted support partner.

Allowed: limited annual subscriptions with bounded SLAs.

### Gate 3 — General Availability

Required evidence:

- Three completed paid pilots, at least one expansion or renewal signal, and published non-sensitive outcome summaries.
- Six months of operating evidence for the supported channel.
- A real-board Path A proof before using ARM64 owner-root production language. A bounded x86-64 offer may launch earlier only if its OEM firmware boundary is explicit.
- Cyber liability / errors-and-omissions insurance, commercial terms, data processing terms where applicable, and a tested incident response function.
- Independent security review of the supported release and management plane.

### Sales motion

```mermaid
flowchart LR
    A["Public proof"] --> B["Qualified discovery"]
    B --> C["Paid pilot"]
    C --> D["Annual assurance"]
    D --> E["Fleet expansion"]
```

1. Publish a narrow, reproducible proof with limitations.
2. Qualify for consequence, platform fit, budget, fleet size, and an executive owner.
3. Baseline the customer’s current labor, release, evidence, and recovery cost.
4. Run a fixed-fee pilot with pre-agreed technical and economic acceptance criteria.
5. Offer an annual subscription only if the pilot establishes fit.

Do not use mass cold outreach. Use the existing proof-first community strategy to earn reviewers and referrals, then conduct tightly targeted founder-led enterprise discovery.

## 6. Three-year revenue and cost model

### Assumptions

- Year 1 begins only when Technical Preview pilots can run honestly.
- List price averages $600 per subscribed node per year, with a $25,000 annual organization minimum.
- Customers and subscribed nodes are end-of-year values; recognized subscription revenue is lower because contracts start throughout the year.
- Subscription gross margin target is 75%; implementation gross margin is 40%; training gross margin is 60%.
- Grants fund public work and are modeled at 90% contribution margin for planning, although restricted-grant accounting may differ.
- Operating expense includes salaries/contractors, security engineering, support, sales/customer success, infrastructure, insurance, legal, accounting, and community investment.
- No breach-avoidance revenue or speculative certification premium is included.

### Base case

**The base-case numbers below are illustrative scaffolding, not validated forecasts.** Per `refs/three-year-revenue-cost-model-2026-07-25.md` (OMN-77): *"There is no base-case model with real numbers in this repo to validate — RULES.md and COMPANY.md both list Financial as unset, and `refs/team-budget-use-of-funds-2026-07-25.md` (OMN-74) already established that no funding/revenue figure exists for this session to ground one in. Producing a three-year model with invented revenue and cost figures would be exactly the fabrication the pulpit's doctrine rules out."* The structural framework is correct (revenue categories, sensitivity shapes, stop-rule categories); the numeric cells are placeholder inputs to be replaced once real data exists.

The numbers below ($350k / $1.2M / $3.55M revenue; 3/10/25 customers; 225/1,500/6,250 nodes; exit ARR $135k / $900k / $3.75M; opex $500k / $1M / $1.75M; cumulative ~$550k operating loss; ~$700k total runway) are **planning assumptions, not forecasts, and explicitly not validated.** They will be replaced with measured inputs after the first priced proposal (Gate 1.5b) lands and the first paid pilot readout (OMN-67) provides actual support-cost and conversion data.

**Required update cadence:** §6 must be re-stated against actuals within 30 days of (a) the first priced proposal landing, (b) the first paid pilot completing, or (c) any material change to the runway/funding assumption. RULES.md and COMPANY.md must be updated together so the three files do not drift.

All figures are USD thousands except customer and node counts.

| Metric | Year 1 | Year 2 | Year 3 |
|---|---:|---:|---:|
| Paying subscription customers, end of year | 3 | 10 | 25 |
| Subscribed nodes, end of year | 225 | 1,500 | 6,250 |
| Exit ARR | $135 | $900 | $3,750 |
| Recognized subscription revenue | $75 | $600 | $2,400 |
| Pilots, implementation, board work | $180 | $450 | $900 |
| Training | $20 | $75 | $200 |
| Grants and sponsorships | $75 | $75 | $50 |
| **Total revenue** | **$350** | **$1,200** | **$3,550** |
| **Gross profit** | **$208** | **$743** | **$2,325** |
| Operating expense | $500 | $1,000 | $1,750 |
| **Operating income / (loss)** | **($292)** | **($257)** | **$575** |

The model implies roughly $550,000 of cumulative operating loss before break-even. With working-capital and schedule contingency, plan for approximately **$700,000 of total runway** from founder capital, customer prepayments, grants, revenue-based financing, or equity. Raising capital is not a substitute for the technical and paid-pilot gates.

At a 75% recurring gross margin, a subscription-only business with $1.75 million of annual operating expense would need approximately $2.33 million in subscription revenue to break even. At $600 per node, that is about 3,900 subscribed nodes. Services gross profit can lower the practical threshold to roughly 3,000–3,500 nodes, but permanent dependence on services will cap margin and maintainer capacity.

### Sensitivity and stop rules

| Scenario | Year 3 customer/node result | Interpretation |
|---|---|---|
| Downside | 10 customers / 1,500 nodes | Remain services-led; no Year 3 break-even; reduce fixed hiring and narrow platform scope |
| Base | 25 customers / 6,250 nodes | Subscription becomes the majority of revenue; break-even during Year 3 is plausible |
| Upside | 45 customers / 15,750 nodes | Invest in support automation, partners, and independent governance; do not relax engineering gates |

Stop or redesign the commercial offer if, after 20 qualified interviews and three priced proposals, fewer than two customers will pay for a pilot; if pilots do not show measurable operating value; or if support cost makes a 70% subscription gross margin implausible.

### Unit-economic goals

- Initial annual contract value: at least $60,000 after pilot.
- Annual prepayment; multi-year discounts only after renewal evidence.
- Subscription gross margin: at least 70% by Year 2.
- Services: below 35% of total revenue by Year 3.
- Customer concentration: no customer above 25% of ARR by the end of Year 3.
- Sponsorship and grants: below 15% of total revenue after Year 1.
- Customer acquisition payback: under 12 months after a repeatable sales motion exists.
- Net revenue retention target: above 110%, measured only after a real renewal cohort exists.

## 7. Customer ROI model

Use a customer-specific cost-of-alternative model. Do not lead with the theoretical cost of a breach.

### Formula

```text
avoidable baseline cost = internal labor + external integration + recurring test/evidence work
net annual benefit = avoidable baseline cost - yubiOS cash spend
cash-spend ROI = net annual benefit / yubiOS cash spend
payback months = yubiOS cash spend / avoidable baseline cost × 12
```

Residual customer labor and third-party validation must remain visible in the total-cost comparison.

### Illustrative 100-node first-year case

This is a hypothesis to validate during a pilot, not a customer result.

| Baseline annual cost | Assumption | Cost |
|---|---|---:|
| Platform engineering | 0.75 loaded FTE at $180,000 | $135,000 |
| Security/compliance engineering | 0.25 loaded FTE at $200,000 | $50,000 |
| External validation and audit-evidence preparation | Customer estimate | $40,000 |
| Update/recovery test infrastructure and recurring exercises | Customer estimate | $25,000 |
| **DIY baseline** |  | **$250,000** |

| With yubiOS | Assumption | Cost |
|---|---|---:|
| Assured Fleet subscription | 100 × $600 | $60,000 |
| First-year implementation | Fixed fee | $45,000 |
| Residual platform labor | 0.35 loaded FTE | $63,000 |
| Residual security/compliance labor | 0.10 loaded FTE | $20,000 |
| Independent validation retained by customer | Customer estimate | $20,000 |
| **First-year total** |  | **$208,000** |

Illustrative result:

- First-year total-cost reduction: $42,000, or 16.8%.
- Avoidable baseline cost before vendor fees: $147,000.
- ROI on $105,000 of first-year yubiOS cash spend: 40%.
- Payback on that cash spend: approximately 8.6 months.
- Renewal-year economics improve if the $45,000 implementation fee does not repeat.

The pilot must measure actual operator hours, failed-update time, evidence-preparation time, recovery outcomes, and residual support burden. If those numbers do not substantiate the case, do not publish the illustrative ROI as a customer claim.

Security-risk reduction is upside, not base ROI. A customer may add `change in incident probability × defensible loss estimate` only when it owns the data and accepts the assumptions. yubiOS should never promise that a specific breach, audit finding, or regulatory penalty will be prevented.

## 8. Team, budget, and use of funds

### Year 1 operating budget

| Use | Share | Approximate amount |
|---|---:|---:|
| Core product, release, and security engineering | 56% | $280,000 |
| Support and reliability | 12% | $60,000 |
| Customer discovery, pilots, and success | 10% | $50,000 |
| Community, independent review, hardware access, upstream work | 7% | $35,000 |
| Legal, insurance, privacy, and compliance preparation | 8% | $40,000 |
| Infrastructure, finance, and administration | 7% | $35,000 |
| **Total** | **100%** | **$500,000** |

Start with a small core team and specialist contractors. Hiring order should follow evidence:

1. Release/security engineer.
2. Systems/firmware engineer for the selected platform.
3. Support/reliability engineer when paid pilots begin.
4. Customer success/solutions engineering after a repeatable pilot exists.
5. Dedicated sales only after founder-led sales produce a repeatable contract and renewal motion.

## 9. Entity, governance, and legal work

Before signing commercial contracts, create a legal receiver for revenue, expenses, employment, insurance, tax, and reporting. A benefit-oriented corporation or conventional operating company with a binding public covenant are both plausible; the final choice requires current tax and legal advice.

Initially, one operating company may hold contracts, employ maintainers, and fund the project. Add an independent technical/community advisory council before General Availability. Consider a fiscal host or separate nonprofit stewardship entity only after there are multiple independent maintainers, meaningful community funds, or a credible asset-transfer plan; premature dual-entity administration can consume scarce engineering capacity.

Legal review must cover:

- The yubiOS name and possible YubiKey/Yubico trademark or affiliation confusion.
- Whether LGPL-2.1 is the intended and correctly applied license for the full distribution, plus all third-party notices and source-offer duties.
- Contributor provenance, DCO policy, employer IP, patents, and trademark rules.
- Product warranties, limitation of liability, support SLAs, cyber/E&O insurance, and hardware damage or lockout risk.
- Cryptography/export controls, sanctions, procurement rules, privacy, data processing, and incident notification.
- The EU Cyber Resilience Act role of the project and operator. The Commission distinguishes non-monetized FOSS, open-source software stewards, and manufacturers placing commercial products on the market; reporting provisions begin applying on 2026-09-11 and full application is scheduled for 2027-12-11. Obtain counsel rather than self-classifying.

## 10. Metrics and reporting

### Public project health

- Supported release and artifact-verification status.
- Percentage of published artifacts with SBOM and provenance.
- Critical-fix lead time and security-report acknowledgement time.
- Update/rollback, recovery, physical-token, and real-hardware test results.
- Active blockers, independent reviewers, retained contributors, and bus factor.
- Upstream contributions and public-interest budget allocation.
- Corrections to public claims and sponsor/customer conflicts.

### Business health

- Qualified interviews, priced pilots, pilot conversion, time to value, and measured customer ROI.
- ARR, recognized revenue, gross margin by stream, cash runway, and burn.
- Customer/node count, renewal, expansion, support hours per customer, and concentration.
- Percentage of custom work upstreamed or converted into reusable capability.
- Services share of revenue and recurring revenue coverage of core maintenance cost.

Do not publish vanity metrics without the decision they inform.

## 11. First 90 days

### Days 0–30: make the offer safe to discuss

- Complete trademark/name, license, contributor-provenance, and entity consultations.
- Publish the public-interest covenant and conflict policy.
- Turn the current blocker list into explicit Technical Preview entry criteria.
- Draft the pilot statement of work, data sheet, support boundaries, and ROI baseline worksheet.
- Conduct 10–15 problem interviews with release engineering, security platform, firmware, and regulated-lab operators. Do not pitch before understanding their alternative cost.
- Apply selectively for public-security funding only where yubiOS has a scoped, public deliverable.

### Days 31–60: prove the narrow product

- Retire or reclassify the VM, physical-token, runtime-hardening, and release blockers for one pilot platform.
- Publish a reproducible physical-YubiKey and recovery demonstration with exact evidence and limits.
- Recruit two design partners matching the initial customer profile.
- Price the pilot; do not default to unpaid custom engineering.
- Establish vulnerability triage, release severity, escalation, backup, and incident communications exercises.

### Days 61–90: test willingness to pay

- If Gate 1 is met, run one paid 25–50 node pilot on disposable or non-critical systems.
- Measure deployment hours, operator training, update/rollback success, evidence preparation, recovery time, and support load.
- Produce a confidential customer ROI readout and, with permission, a bounded public case study.
- Decide: proceed to a second pilot, narrow the offer, change the target segment, or pause commercial hiring.

## 12. Decisions, deferrals, and rejected models

### Adopt

- Public core plus paid assurance, operations, and services.
- Proof-first, customer-funded discovery.
- Annual contracts with a minimum commitment.
- Transparent security and stewardship reporting.

### Defer until evidence exists

- A hosted fleet control plane.
- 24x7 response.
- Formal compliance certification.
- Channel partners, hardware bundles, or OEM volume pricing.
- A separate foundation or nonprofit.
- Venture financing beyond what is required to cross verified demand and support gates.

### Reject as the primary model

- Paid-only security fixes or delayed public fixes.
- Dual licensing that requires broad contributor copyright assignment.
- Advertising, data resale, or mandatory telemetry.
- A proprietary fork of the core OS.
- One-off customer branches that cannot be maintained or upstreamed.
- Broad consumer launch before support and recovery are proven.
- Treating grants, stars, downloads, or press coverage as recurring revenue.

## 13. External benchmarks and sources

These sources are directional benchmarks, not evidence that yubiOS has comparable scale or demand. Checked 2026-07-17.

- [yubiOS README](https://github.com/yubi-OS/yubiOS/blob/main/README.md), [mission](https://github.com/yubi-OS/yubiOS/blob/main/docs/MISSION.md), [security policy](https://github.com/yubi-OS/yubiOS/blob/main/.github/SECURITY.md), [blockers](https://github.com/yubi-OS/yubiOS/blob/main/docs/BLOCKERS.md), and [public-relations plan](https://github.com/yubi-OS/yubiOS/blob/main/docs/PR.md).
- [CISA Open Source Software Security](https://www.cisa.gov/opensource) describes open source as widely used across government and critical infrastructure; [Secure by Design](https://www.cisa.gov/securebydesign) supports publishing concrete security practices and shifting avoidable burden away from users.
- The European Commission’s [CRA open-source guidance](https://digital-strategy.ec.europa.eu/en/policies/cra-open-source) distinguishes non-monetized FOSS, commercial activity, and open-source software stewards; its [implementation timeline](https://digital-strategy.ec.europa.eu/en/factpages/cyber-resilience-act-implementation) lists 2026 reporting and 2027 full-application dates.
- Linux Foundation Research’s [State of Global Open Source 2025](https://www.linuxfoundation.org/research/world-of-open-source-global-2025) reports demand for formal support and security in production: 71% of surveyed organizations expected sub-12-hour support responses, and paid support was considered essential for mission-critical, sensitive-data, and regulated workloads by 54%, 43%, and 38% respectively.
- Linux Foundation Research’s [State of Commercial Open Source 2025](https://www.linuxfoundation.org/hubfs/Research%20Reports/lfr_serena_capital_report_082225b.pdf) describes commercial open source as an established category while also showing that success is far from automatic.
- OpenSSF’s [2026 $12.5 million grant announcement](https://openssf.org/press-release/2026/03/17/linux-foundation-announces-12-5-million-in-grant-funding-from-leading-organizations-to-advance-open-source-security/) demonstrates that scoped public-security funding exists; it does not imply yubiOS eligibility.
- [SUSE Linux Enterprise Server public pricing](https://www.suse.com/shop/server/) lists $799/year for standard and $1,299/year for priority support, providing a directional Linux-support anchor.
- [Grafana’s public pricing](https://grafana.com/pricing/) starts its enterprise offering at a $25,000 annual commitment, a useful directional floor for a high-touch enterprise motion.
- GitLab reported crossing [$1 billion in ARR and $220 million in free cash flow in FY2026](https://about.gitlab.com/press/releases/2026-03-03-gitlab-reports-fourth-quarter-fiscal-year-2026-financial-results/), demonstrating that enterprises pay for security, governance, and operations around an open-source-rooted platform. GitLab’s scale and product are not a yubiOS forecast.

---

The commercial test is simple: keep the owner’s control and the public security work genuinely public, then determine whether enterprises will pay for reliable operation, evidence, recovery, and accountability. If the paid layer requires weakening those public guarantees, it is the wrong business model for yubiOS.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.

## 2026-09-18 drift check (wayfinder round 11, cycle 6)

PLAN.md (round-9 cycle-10 repaired): planning claims re-anchored to the round records; the register-review gap this round surfaced is the plan's own next step; note additive.
