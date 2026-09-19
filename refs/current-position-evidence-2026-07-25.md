# Current Position and Evidence Boundary

Source: OMN-68 (team OMNI-AGENT), section 1 of the yubiOS Business and Stewardship Plan. Grounded in the live BLOCKERS.md as of 2026-07-22 and the repo itself as inspected on 2026-07-25. Referenced by OMN-65 (PR #103) and OMN-73 (PR #118) as the evidence-boundary document those docs deferred to this one.

## Purpose

State plainly what is verified today versus what is aspirational, so every other business document (offer, pilot, funding, case study) inherits the same boundary instead of each one drawing its own line.

## Scope (from OMN-68)

- Inventory the current verified technical assets and public artifacts.
- Separate evidence of engineering progress from evidence of product-market fit.
- List the missing business-readiness evidence that blocks stronger market claims.
- Enumerate claims that must remain off-limits until evidence exists.
- Produce a concise evidence-boundary summary that can be reused externally.

## 1. Verified technical assets and public artifacts

- Public GitHub org (yubi-OS) and repo (yubi-OS/yubiOS), public as of 2026-07-24.
- LGPL-2.1 licensed source, LICENSE file present at repo root.
- Living documentation: README.md, MISSION.md, BLOCKERS.md (actively maintained, last reviewed 2026-07-22), TODO.md, PINNED.md, and a growing refs/ corpus of ADRs and research docs.
- CI pipeline exists (yubiOS-ci.yml) with a VM end-to-end test lane; several blockers retired via specific numbered CI runs (for example B-VM-SSH and B-VM-BOOTLOADER-UPDATE retired by run 29872832727).
- Docker Hub publish path (docker.io/0mniteck/yubios) with SLSA provenance and SBOM attestations on green main builds, per PROJECT_RULES.md.
- ARM64 fTPM groundwork: 6 upstream forks added (arm-trusted-firmware, optee_os, optee_ftpm, u-boot, ms-tpm-20-ref, edk2-rk3588) per ADR-018/019/020.

## 2. Engineering progress vs product-market fit evidence

**Engineering progress (has evidence):**
- Boot chain and bootc-based image builds exist and run in CI.
- Static systemd hardening audit is complete (refs/systemd-hardening-audit-2026-07-17.md).
- VM lane guest SSH and bootloader-update guard are proven (run 29872832727).
- Business-planning groundwork has produced draft docs across the days-0-30/31-60/61-90 trio (PR #103/#105/#111), readiness gates (PR #118), pricing architecture (PR #108, referenced by other docs), and pilot collateral (PR #113).

**Product-market fit (no evidence yet):**
- Zero customer discovery interviews are recorded in the repo as of this doc. OMN-65’s 10-15 interview target is a plan, not a completed activity.
- Zero design partners are recruited (flagged as an open question in both the OMN-65 and OMN-66 drafts).
- Zero paid pilots have run. OMN-67’s pilot design exists only as a plan (PR #111).
- Zero priced, signed statements of work exist; OMN-71/OMN-84 supply pricing hypotheses and templates, not committed prices with a real customer.
- This is the core distinction this doc exists to make explicit: engineering artifacts (code, docs, CI) are real and inspectable; commercial validation (someone will pay, at this price, for this problem) does not yet exist in any form.

## 3. Missing business-readiness evidence blocking stronger market claims

Per the live BLOCKERS.md (2026-07-22), the following are still open and directly block any claim of production readiness or commercial availability:

- B-VM-CTAP2: no FIDO2 token enumerates in the VM CI lane, so LUKS2 FIDO2 unlock, systemd-homed, and ed25519-sk SSH are unproven even in software.
- B-REAL-FIDO2: no physical-YubiKey run has validated unlock, homed, resident SSH, PAM presence, PIV signing, recovery, or failure handling on real hardware.
- B-HARDENING-RUNTIME: the systemd hardening audit is static only; no Bats suite or systemd-analyze verify run has executed against a target image.
- B-BOOTC-SEAL: fs-verity is proven through a mutable BLS digest anchor, not a sealed/signed UKI plus Secure Boot chain.
- B-ARM64-PATHA and B-RK3588-TPL: no ARM64 board has proven the full secure-boot chain; the current ROCK 5B build is diagnostic packaging, not a flashable image.
- On the business side (no repo evidence exists for any of these): no completed customer interviews, no design partners, no paid pilot, no published covenant (OMN-70/82 pending), no Technical Preview entry criteria sign-off (OMN-83 pending).

## 4. Claims that must remain off-limits until evidence exists

- "Production-ready" or "enterprise-ready" -- off-limits company-wide until at minimum B-VM-CTAP2, B-HARDENING-RUNTIME, and B-REAL-FIDO2 close, per OMN-66’s own exit criteria.
- "ARM64 support" as a shipped capability -- off-limits until B-ARM64-PATHA and B-RK3588-TPL close with real-board evidence; today it is groundwork only (6 forks staged), not a working path.
- "Customers save X with yubiOS" or any ROI figure -- off-limits until at least one real pilot produces measured data, per the claim boundaries in refs/customer-roi-model-2026-07-25.md (OMN-78, PR #115).
- "Sealed/attested boot" or "tamper-proof" -- off-limits until B-BOOTC-SEAL resolves to an actual signed UKI plus Secure Boot chain, not the current mutable-anchor fs-verity story.
- Any claim of Yubico affiliation or endorsement -- explicitly false and off-limits regardless of blocker status; yubiOS is not affiliated with or endorsed by Yubico, per the non-affiliation notice already flagged in refs/pilot-collateral-roi-baseline-2026-07-25.md (OMN-84, PR #113) and the trademark question in refs/naming-licensing-provenance-2026-07-25.md (OMN-81, PR #114).
- General availability or public pricing -- off-limits before Gate 3 per refs/readiness-gates-gtm-2026-07-25.md (OMN-73, PR #118); the organization is currently at Gate 1 (provisional).

## 5. Evidence-boundary summary (reusable externally)

yubiOS is a public, LGPL-2.1-licensed, work-in-progress FIDO2-first immutable OS. The codebase, CI pipeline, and design documentation are real and inspectable at github.com/yubi-OS/yubiOS. As of 2026-07-25: the boot and build pipeline runs in CI; FIDO2 unlock is not yet proven even in a VM (B-VM-CTAP2 open); no physical-hardware validation, paid pilot, design partner, or customer interview has occurred; ARM64 support is early groundwork, not a working path. yubiOS is not affiliated with or endorsed by Yubico. Any statement beyond these facts should be treated as aspirational until a specific PR or CI run closes the relevant blocker in BLOCKERS.md, which remains the single source of truth for current status.

## Dependency map

- This is the evidence-boundary document that OMN-65 (PR #103) and OMN-73 (PR #118) each referenced but did not draft themselves.
- OMN-69 (who pays and why) should read this doc before finalizing target-customer claims, per OMN-65’s own dependency map (OMN-68 and OMN-69 together shape messaging before offer finalization).
- Every other landed business doc (OMN-66/67/71/73/78/81/84) should be read against this boundary rather than restating their own evidence claims independently.

## Open questions

- Whether this doc should be the canonical evidence-boundary reference cited by name in every future business doc, or whether each doc should keep restating a short version -- left as a documentation-convention question, not resolved here.

## Coverage note

This is a business evidence-boundary document. It introduces no trust anchor, key, certificate, policy file, service unit or runtime detector, so the yubiOS primitive-coverage sections (trust chain, least privilege, declarative policy, continuous/adaptive) do not apply to it. Earlier appended template sections asserting otherwise were removed on 2026-09-17 because they were false for this document; their removal changes no claim in sections 1–5.

## Recommendation

**Verdict**: KEEP as a dated snapshot. **One-line**: sections 1–5 state the evidence boundary as of 2026-07-25 against BLOCKERS.md reviewed 2026-07-22; the live `docs/BLOCKERS.md` on main remains the single source of truth for current blocker status, and any later closure (for example runs or PRs that retired B-VM-CTAP2, B-REAL-FIDO2 or B-BOOTC-SEAL) supersedes the corresponding line here without being back-edited into this snapshot.

## 2026-09-18 drift check (wayfinder round 8, cycle 41)

position-evidence record (round-4 repaired): re-verified that its dated claims are historical positions, not current ones; cross-linked to the round-7/8 results records. Content unchanged by this round; the drift note is additive.
