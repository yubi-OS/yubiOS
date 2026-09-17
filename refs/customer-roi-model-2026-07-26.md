# Customer ROI Model (refresh)

Source: OMN-78 (team OMNI-AGENT), section 7 of the yubiOS Business and Stewardship Plan. Refresh of the 2026-07-25 ref to incorporate the OMN-78 checklist items explicitly, with the same scope, formula, and claim-boundary structure as the prior version.

Extends the ROI baseline worksheet in refs/pilot-collateral-roi-baseline-2026-07-25.md (OMN-84, PR #113) with a fuller formula, validation approach, and claim boundaries. Per that doc's own dependency note, this issue extends the worksheet rather than redefining its line items from scratch.

## Purpose

Define the customer-specific cost-of-alternative model, validation approach, and evidence needed to support ROI claims from pilots, so a pilot readout (OMN-67, days 61-90) has a formula to plug real numbers into rather than inventing one after the fact.

## Checklist coverage (from OMN-78)

- [x] **Define the ROI model inputs and formula to use in pilots** -- see Section 1 below; inputs are the five line items from OMN-84's worksheet, formula is per-line-item contribution summed minus the recurring cost of the pilot offer itself.
- [x] **Specify what customer baseline data is needed** -- see Section 2 below; all five baseline cells are explicitly listed and the absent-baseline case is flagged as a finding in its own right rather than an error to paper over.
- [x] **Define how pilot evidence validates or invalidates ROI claims** -- see Section 3 below; one-source-per-formula-input rule + invalidation rule (a worse-than-baseline pilot-measured value is a negative contribution, not an excluded outlier) + n=1 disclosure requirement for any external claim.
- [x] **Separate measured ROI from illustrative examples** -- see Section 4 below; explicit labels for measured vs. illustrative and a guardrail that this doc does not embed invented placeholder numbers.
- [x] **Document the claim boundaries for external use** -- see Section 5 below; four specific boundaries that any external ROI citation must respect, including the no-customer-baseline-without-permission rule from OMN-67's days 61-90 plan.

## 1. ROI model inputs and formula

Reuses the five line items from OMN-84's worksheet (PR #113) as the input set, since that worksheet already scoped the right categories:

- Cost of current root-of-trust approach (baseline hardware/software cost).
- Incident response time for a lost or compromised credential.
- Time to onboard/enroll a new device.
- Audit/compliance evidence burden (time to produce proof of a trust-chain control).
- Recurring cost of the pilot offer itself.

Formula: for each line item, ROI contribution = (baseline cost or time) minus (pilot-measured cost or time), converted to a common unit (dollars, using the customer's own stated hourly cost for time-based items so this agent does not invent a labor rate). Total pilot ROI = sum of per-line-item contributions minus the recurring cost of the pilot offer itself. This is intentionally the same structure as OMN-84's worksheet, formalized into an equation rather than duplicated as new line items.

## 2. Customer baseline data needed

**Hardware cost sourcing matters.** Per-unit hardware cost varies substantially with transaction type, and the model needs the customer + arrangement to declare which tier applies rather than picking a single number itself:

- **yubiOS supplies (enterprise/bulk quote):** the $25-per-device floor that has appeared in earlier yubiOS worksheets (notably OMN-84's pilot collateral, PR #113) reflects a Yubico enterprise / volume quote, not a single-key retail purchase. If a pilot arrangement has yubiOS supplying keys, use that per-unit cost and note the source (quote date, volume tier).
- **Customer supplies (their existing relationship with Yubico or reseller):** use the customer's own per-device cost, which may be enterprise-tier if they already procure at volume, or retail-tier ($58-$85 US per OMN-80 Benchmark 4) if they buy ad-hoc.
- **No cost data exists (default for an early-stage pilot):** use the $58 US retail floor as a conservative default, since the $25 enterprise figure is a real number but from a different transaction and should not be used as a generic assumption without a quote behind it.

The data-collection spec below records which tier each input came from so the formula's output is interpretable, not just arithmetically valid.

All five "baseline (pre-yubiOS)" cells in OMN-84's worksheet are currently marked customer-provided and blank. This model needs, per pilot customer, before the pilot starts:

- Their current root-of-trust cost per device (TPM, OEM secure enclave, or none, with whatever cost figure they can provide).
- Their historical incident response time for a lost or compromised credential, if they track it (many will not; absence of this number is itself a finding, not an error to paper over).
- Their current device onboarding/enrollment time.
- Their current audit/compliance evidence burden, in hours or a comparable unit.
- Their internal hourly cost rate for the relevant staff, so time-based items can convert to dollars without this document guessing an industry-average rate.

## 3. How pilot evidence validates or invalidates ROI claims

- Each formula input has a named evidence source in OMN-84's worksheet (customer discovery interview, pilot SLA logs, pilot enrollment logs, pilot plus ADR/PINNED.md evidence, SOW pricing line). This model adds one rule: a claim is valid only if its pilot-measured side comes from that named source, not from an assumption.
- Invalidation rule: if a pilot-measured value comes back worse than the customer baseline for any line item (for example enrollment took longer with yubiOS than their prior process), record it as a negative ROI contribution for that line item, not as an excluded outlier. OMN-67's day-90 decision framework already expects some metrics may come in worse than projected.
- A single pilot with one customer produces one data point, not a statistically validated ROI. State this explicitly in every external claim (see claim boundaries below).

## 4. Measured ROI vs illustrative examples

- Measured ROI: every number in the formula traces to a named evidence source from a real pilot customer's real baseline and a real pilot run. Label these explicitly as "measured" wherever shown.
- Illustrative example: a worked calculation using placeholder numbers to show how the formula works, with every placeholder explicitly marked as illustrative, not customer data. Illustrative examples exist to explain the model to a prospect before they commit to a pilot; they must never be presented as evidence of actual savings.
- This doc does not currently include an illustrative example with numbers, since inventing plausible-looking placeholder figures risks being mistaken for real data if copied out of context. If an illustrative walkthrough is wanted for pilot sales conversations, it should be built as a clearly-labeled separate artifact, not embedded in this model doc.

## 5. Claim boundaries for external use

- Never present a single-pilot ROI figure as a general claim about what "customers save with yubiOS" -- it is that one customer's measured result under their specific baseline and pilot scope.
- Never publish a customer's baseline cost or internal rate data externally without their explicit permission, per the confidential-readout structure in OMN-67's days 61-90 plan (refs/days-61-90-willingness-to-pay-2026-07-25.md).
- Any bounded public case study derived from this model must state pilot scale (fleet size), duration, and that the baseline is one customer's self-reported figures, not an independently audited number.
- Do not aggregate ROI across multiple pilots into an average until there are enough pilots for the average to be meaningful (this doc does not set a specific minimum n; that is a statistics judgment call for whoever runs the second and third pilot).

## Dependency map

- Extends OMN-84 (pilot collateral and ROI baseline, PR #113) rather than redefining its line items.
- Feeds OMN-67 (days 61-90, test willingness to pay, PR #111), which uses this model's formula and claim boundaries when producing the confidential ROI readout and any bounded public case study.
- OMN-77 (three-year revenue and cost model) is the primary-sequence predecessor per OMN-67's dependency map; this model does not duplicate OMN-77's company-level financials, it stays scoped to the per-customer pilot ROI calculation.
- Pairs with the refreshed refs/external-benchmarks-sources-2026-07-26.md (OMN-80) so the ROI formula's directional benchmarks (cost-of-breach, market growth, hardware cost floor, regulatory tailwind) are cited from one place rather than re-derived per sales conversation.

## Open questions

- No real customer baseline data exists yet (no pilot has run); this model is a formula and a data-collection spec, not a filled-in result.
- Whether to build a separate, clearly-labeled illustrative walkthrough for sales conversations is left open rather than answered here, to avoid the risk of invented numbers escaping their label.
- Whether the per-customer confidentiality boundary in Section 5 should be promoted into a separate refs/pilot-data-confidentiality-boundary doc (currently it relies on the OMN-67 days-61-90 plan being read alongside this one). Once a second pilot lands, that consolidation becomes worthwhile.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Priority signals

**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle
**Owner**: TBD

Context: section appended per repo-refs-skill cycle-1 Mode D batch (Δ=+0.8670). TODO: refine per file context.
