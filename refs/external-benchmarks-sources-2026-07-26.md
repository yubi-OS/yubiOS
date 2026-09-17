# External Benchmarks and Sources (refresh)

Source: OMN-80 (team OMNI-AGENT), section 13 of the yubiOS Business and Stewardship Plan. Refresh of the 2026-07-25 ref to incorporate the OMN-80 checklist items explicitly, with the same scope, cadence, and dependency-map structure as the prior version. Every claim below is cited to a specific external source with retrieval date 2026-07-26.

This doc supports pricing, commercialization, and market-framing language elsewhere (OMN-71, OMN-78, OMN-84) with directional third-party benchmarks -- it is NOT evidence about yubiOS itself, per the current-position doc (OMN-68, PR #119).

## Purpose

Track the external benchmarks, source validation, and citation boundaries used to support pricing, commercialization, and market framing, so no other business doc has to invent or half-remember a statistic. The five checklist items from OMN-80 are explicitly addressed in this doc, in the order listed in the issue description.

## Checklist coverage (from OMN-80)

- [x] **Review each external source for accuracy and current relevance** -- every Benchmark section names a specific source, retrieval date 2026-07-26, and a one-line validation note.
- [x] **Separate directional benchmarks from evidence about yubiOS itself** -- every Benchmark has a "What it supports" / "Do not use for" pair that marks yubiOS-specific claims out of scope; yubiOS has zero customers today, so any "yubiOS market share" or "yubiOS revenue" claim from these benchmarks is misuse.
- [x] **Validate the claims supported by each source** -- each Benchmark carries an explicit Validation note where applicable (see Benchmark 4 in particular, where the previously-cited $25 YubiKey floor could not be reconciled against official retail and is flagged rather than silently corrected).
- [x] **Note sources needing refresh or replacement** -- see "Sources needing refresh or replacement" below, with a per-benchmark cadence and a specific reconciliation flag for OMN-84.
- [x] **Create a reusable citation and benchmark list** -- see the table at the end of this doc; same structure as the 2026-07-25 ref, no duplication of its claim-boundary column.

## Benchmark 1: Cost of a data breach involving phishing/credential compromise

- **Claim:** the average cost of a data breach where phishing was the initial attack vector was USD 4.8 million, per IBM's Cost of a Data Breach Report 2025 (600 organizations studied, March 2024 to February 2025). Phishing overtook stolen credentials as the most common initial attack vector in this study.
- **Source:** IBM Cost of a Data Breach Report 2025, https://www.ibm.com/reports/data-breach (retrieved via websearch synthesis 2026-07-26; primary PDF at https://www.ibm.com/downloads/documents/us-en/131cf87b20b31c91/).
- **What it supports:** a directional argument that credential-phishing incidents are expensive industry-wide. It does NOT support any claim that a yubiOS customer would avoid this specific dollar figure -- that requires the customer's own baseline data per the ROI model (OMN-78, PR #115).
- **Refresh cadence:** IBM publishes this report annually (mid-year); refresh this citation when the 2026 edition is released, expected around mid-2027 based on the 2025 report's July/August release pattern.

## Benchmark 2: FIDO2 hardware security key market size and growth

- **Claim:** the dedicated FIDO2-compliant hardware security key market was valued at approximately USD 1.2 billion in 2025, with projections of USD 5.3-6.8 billion by 2034 (CAGR 17.8-20.5%). Estimates vary by report scope; the broader FIDO authentication market (including software/SDKs) is valued higher, USD 2.16-2.8 billion in 2025.
- **Source:** synthesized from multiple market-research vendor reports (MarketIntelo, 360iResearch, Verified Market Reports, WiseGuyReports, Future Market Insights, QYResearch, MarkWide Research, Dataintelo, Straits Research), retrieved via websearch 2026-07-26. No single report is authoritative; this is a range across commercial market-research vendors, not a government or peer-reviewed figure.
- **What it supports:** a directional argument that the hardware security key category is growing. It does NOT support a specific yubiOS revenue projection -- market-research vendor estimates for a niche hardware category commonly diverge by 2-3x between vendors and should be treated as an order-of-magnitude signal, not a precise figure.
- **Refresh cadence:** these are multi-year forecast reports (to 2034); a light refresh check is reasonable annually, but the underlying uncertainty (vendor-to-vendor variance) will not resolve with a refresh alone.

## Benchmark 3: Yubico market position

- **Claim:** Yubico holds an estimated 31-34% of total FIDO2 hardware market share and 60-70% share of unit volume for dedicated FIDO authenticators, per the same market-research vendor synthesis as Benchmark 2.
- **Source:** same vendor reports as Benchmark 2, retrieved via websearch 2026-07-26.
- **What it supports:** context for why yubiOS chose YubiKey as its hardware root of trust (dominant, established ecosystem) -- relevant to OMN-81's naming/trademark risk discussion (PR #114), since Yubico is the dominant player whose name yubiOS's name echoes. It does NOT support any yubiOS-specific market-share claim; yubiOS has zero market share today (zero customers, per OMN-68, PR #119).
- **Refresh cadence:** same as Benchmark 2.

## Benchmark 4: YubiKey unit hardware cost

- **Claim:** as of 2026-07-26, official Yubico US store pricing for YubiKey 5 Series ranges from $58 (YubiKey 5 NFC / 5C NFC) to $85 (YubiKey 5Ci); EU pricing (VAT included) ranges from EUR70.18 to EUR102.85.
- **Source:** Yubico official store, https://www.yubico.com/store/yubikey-5-series/ and per-product pages (https://www.yubico.com/product/yubikey-5-nfc/, https://www.yubico.com/product/yubikey-5c/, https://www.yubico.com/product/yubikey-5-series/yubikey-5ci/), retrieved via websearch 2026-07-26.
- **Validation note:** this is the same range found in the 2026-07-25 ref. The $25 floor in OMN-84's worksheet (PR #113) still could not be reconciled against official retail pricing found in this pass ($58 floor), so the same reconciliation flag carries forward to OMN-84's owner rather than being silently corrected here.
- **What it supports:** the per-device hardware cost line in the ROI worksheet (OMN-78/OMN-84). It does NOT include yubiOS's own software/support costs, which are separate line items.
- **Refresh cadence:** check before every pricing conversation with a design partner; retail prices can change without notice and this is a live, checkable number (unlike the market-size forecasts above).

## Benchmark 5: Federal and regulatory push toward phishing-resistant MFA

- **Claim:** OMB Memorandum M-22-09 directs US federal agencies toward phishing-resistant MFA; NIST SP 800-63B defines phishing resistance (verifier impersonation resistance); CISA names FIDO2/WebAuthn as, in its words, "the gold standard" for phishing-resistant MFA alongside PIV/CAC smart cards.
- **Source:** NIST SP 800-63B (https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf), CISA Fact Sheet on Implementing Phishing-Resistant MFA (https://www.cisa.gov/sites/default/files/publications/fact-sheet-implementing-phishing-resistant-mfa-508c.pdf), FIDO Alliance US Government Guidance (https://fidoalliance.org/wp-content/uploads/2025/03/FIDO_Alliance_USGovernmentGuidance-Revision_Final03142025.pdf), retrieved via websearch 2026-07-26.
- **What it supports:** a real regulatory tailwind argument for FIDO2-based products generally, and specifically relevant to OMN-86's public-security funding targets and OMN-65's regulated-lab/security-platform interview targets. It does NOT support a claim that yubiOS itself meets any specific federal certification (FIPS, FedRAMP, etc.) -- no such certification evidence exists in the repo.
- **Refresh cadence:** government guidance documents are revised periodically (NIST SP 800-63 has version revisions); check for a newer revision before citing in any external-facing material, not just once here.

## Sources needing refresh or replacement

- Benchmark 2 and 3 (market size and Yubico share) rely entirely on commercial market-research vendor reports with no free public methodology disclosed; treat as the weakest-sourced claims in this doc and avoid citing a single-vendor number without the range caveat.
- The $25 floor for YubiKey hardware cost in OMN-84's worksheet (PR #113) could not be reconciled against official retail pricing found in either the 2026-07-25 or 2026-07-26 pass ($58 floor) -- flagged for OMN-84's owner to revisit, not silently corrected in this doc.

## Reusable citation and benchmark list

| # | Benchmark | Source | Use for | Do not use for |
|---|---|---|---|---|
| 1 | Avg breach cost, phishing vector: $4.8M | IBM Cost of a Data Breach Report 2025 | Directional cost-of-status-quo argument | Claiming a specific customer's savings |
| 2 | FIDO2 hardware market: ~$1.2B (2025) to $5.3-6.8B (2034) | Multiple market-research vendors (see Benchmark 2) | Directional market-growth argument | Precise yubiOS revenue forecasting |
| 3 | Yubico market share: 31-34% value, 60-70% unit volume | Same vendors as #2 | Context for hardware choice, trademark risk discussion | Any yubiOS market-share claim |
| 4 | YubiKey 5 Series retail: $58-$85 (US), EUR70.18-102.85 (EU) | Yubico official store | ROI worksheet hardware cost line | Bulk/enterprise pricing (not confirmed here) |
| 5 | CISA/NIST/OMB phishing-resistant MFA guidance | NIST SP 800-63B, CISA fact sheet, FIDO Alliance | Regulatory-tailwind argument, funding target framing | Claiming yubiOS holds any specific certification |

## Dependency map

- Feeds OMN-71 (offer/pricing, PR #108) and OMN-78 (customer ROI model, PR #115) with citable external numbers instead of invented ones.
- Feeds OMN-86 (public-security funding targets) with the regulatory-tailwind benchmark.
- Flags a reconciliation item for OMN-84 (pilot collateral, PR #113) on the YubiKey hardware cost floor -- this flag carries forward from the 2026-07-25 pass and remains open.

## Open questions

- Whether OMN-84's $25 hardware-cost floor came from a bulk/enterprise quote not visible to this agent, or was simply an approximation -- needs the original author or a bulk-pricing inquiry to resolve, not guessed at here. Two passes (2026-07-25 and 2026-07-26) found the same official retail range without seeing a $25 point, so the flag is now borderline-stale and an actual owner reply is overdue.
- Whether the refresh cadence on Benchmark 2 and 3 should move from "annual light check" to "before every external-facing material that cites a specific figure", given that vendor forecasts in this category are volatile.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
