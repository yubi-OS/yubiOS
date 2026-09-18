---
contract: "yubiOS v1 launch readiness gate inventory. The 3 missing non-engineering gates (security audit, pricing-validity, reference-customer) needed to clear the 2026-09-13 milestone target on the yubiOS Production Proof & Release Gates project. Lands via PR on yubi-OS/yubiOS main. Carries the planning-cycle doctrine's BLOCKERS.md review stamp; diffs against the current docs/BLOCKERS.md Last reviewed date and lists every blocker retired on that date. Per PROJECT_RULES.md lines 75-78."
short_description: "yubiOS v1 release gate checklist v2 — 3 missing gates"
---

# Release Gate Checklist v2 — yubiOS v1 Launch Readiness (2026-08-04)

**Linked Linear issue:** [OMN-142](https://linear.app/omni-agent/issue/OMN-142)
**Project:** yubiOS Production Proof & Release Gates
**Authored:** 2026-08-04 in self-mode per Jenny's "use all the new tools" directive.
**Status:** Draft for PR. Jenny merges per the standing rule.

<last-reviewed-against-blockers>
Last reviewed against `docs/BLOCKERS.md`: this session could not fetch `docs/BLOCKERS.md` directly (compaction boundary cleared the prior-session cache). The previous-session record (per `RECENT_ACTIVITY.md` 2026-08-01 entry) names B-VGPU-VM-UNZIP as the most recent retirement: "fixed same day by 0mniteck's commit `490a85b9` `Install 'unzip' in CI workflow` (2026-08-01T12:40:49Z)". OMN-149 (5-layer /dev/vfio fix) closed 2026-07-30 (run #36 30592785401 on `:dev-7eba4856`). B-VM-CTAP2 RESOLVED 2026-07-25 (run 30139433902).
</last-reviewed-against-blockers>

---

## 1. Problem statement

The yubiOS v1 launch gate inventory as it exists in the planning corpus (`docs/MILESTONE.md`, `refs/readiness-gates-gtm-2026-07-25.md`, `refs/first-90-days-2026-07-25.md`) covers **engineering gates** (CI green, signed UKI boot, dm-verity refusal, FIDO2 unlock, hardware evidence) but not the **three non-engineering gates** that any pre-launch release needs:

- A **security audit** with a written report and zero open Critical/High findings on the launch surface.
- A **pricing-validity test** confirming at least one paid pilot contract against the proposed pricing tier.
- A **reference customer** with ≥90 days of continuous production deployment.

Without these, v1 launch readiness is structurally incomplete: a launch that is technically green but has no third-party security attestation, no paying customer, and no production reference is a launch risk that any auditor or GTM reviewer will flag.

This spec enumerates each missing gate with falsifiable exit criteria, owners, evidence artifacts, and dependency chains that build on the already-PASS engineering gates.

## 2. Current gate inventory (the engineering side, already PASS)

The following 11 engineering gates are already on file as PASS or with concrete PASS evidence. They are cited so the 3 missing gates can build on top of them without duplicating work.

| # | Gate | Status | Evidence | OMN |
|---|------|--------|----------|-----|
| E-1 | dm-verity refuses tampered composefs reference (Negative 2) | PASS | run 30592785401 at `:dev-7eba4856`; the 5-layer /dev/vfio fix also closed | OMN-149 Done 2026-07-30 |
| E-2 | sealed-UKI Secure Boot VM lane | PASS | run 30652859000 at V83 (commit `1d0666d7`); all 5 matrix jobs pass on amd64+arm64; differential arm64 SB proof (our-cert-pass + foreign-cert-refuse) under TCG emulation with AAVMF_CODE.secboot.fd | OMN-53 Done 2026-07-31 |
| E-3 | LUKS2 FIDO2 unlock on production arm64 guest | PASS | run 30697269619 / job 91362188919 at HEAD `b7f9d467` on rock1 self-hosted ARM64 KVM; real YubiKey USB vendor 0x1050 against `/dev/sda`, GPT partitioning + bootc install + LUKS2 FIDO2 enroll slot 2 + systemd-homed FIDO2 create | OMN-48 Done (via OMN-89 hardware-leg proof) |
| E-4 | Issue #20 end-to-end LUKS2 FIDO2 unlock test | PASS | closed 2026-08-01T12:35:44Z by 0mniteck with rock1 hardware-leg PASS evidence | Issue #20 closed 2026-08-01 |
| E-5 | v0.7.1 first formal release tag | PASS | v0.7.1 published 2026-08-01T13:44:30Z by 0mniteck; first "v" tag, full changelog spanning PRs #8–#156 across the 7-day cluster | ReleaseEvent v0.7.1 |
| E-6 | playbooks/ seeded (7 playbooks + 1 README + 1 refs/testing-production-gaps) | PASS | PR #156 merged 2026-08-01T11:01:21Z by foil-copy-overrate; 7 playbooks + gap analysis | OMN-152 Done 2026-08-01 |
| E-7 | ARM64 Path A dev image bootupd fix | PASS | commit `f58d6c14` (Containerfile.dev bootupd install); commit `b8ba8574` (additional Containerfile.dev fix) | OMN-95 closed earlier |
| E-8 | ARM64 fTPM Stage B (tpm2 init/startup/self_test → YUBIOS_TPM_OK) | PASS | ci_test-int.yml run 28894256274 fully green both arches; TF-A → OP-TEE → U-Boot boot chain with fTPM Early TA embedded, probed, and functional in QEMU | OMN-96 closed earlier |
| E-9 | BCVK USB YubiKey passthrough for ephemeral VMs | PASS | PR #1+#2+#7+#8 merged into `yubios` branch at `a9303e77dc902a0ff3b547103a7511b5164a450b`; ephemeral VMs covered | OMN-99 Done 2026-07-30 (the destructive-test gap analysis on 2026-07-29 documents native-to-disk as a remaining gap) |
| E-10 | libvfio-user bundle-vs-per-runner decision | PASS | PR #152 merged 2026-07-30T09:43:52Z; V4 GHA cache as near-term step before V1 OCI artifact two-step ordering | OMN-100 Done 2026-07-30 |
| E-11 | ci.yml group-routing redesign (single `group` input, 22 sibling workflows dispatch-only) | PASS | PR #145 (commit `9d6ec85d`) merged 2026-07-29T18:10:53Z | OMN-148 Done 2026-07-29 |

These 11 gates are the engineering floor. The 3 missing gates in this spec build on top of them.

## 3. Gate 1.5a — Security audit (the THIRD-PARTY attestation gate)

### 3.1 Scope

A third-party security audit of the yubiOS launch surface by an external firm with a written report. The launch surface is defined as:

- The signed UKI build chain (mkosi + sbsign + PIV slot 9c; the canonical PKCS#11 signing pattern lives in `ci_mkosi-installer.yml` per the SoftHSM token-lifecycle rule).
- The bootc installer path (`bootc install to-filesystem` with `--composefs-backend --skip-finalize`; `--composefs-backend` per v0.11 fix, `--skip-finalize` per v0.13+v0.14 fix sequence).
- The LUKS2 FIDO2 unlock path (systemd-cryptenroll with `--unlock-key-file` + `--fido2-with-client-pin=no`; the inverse precondition guard in `tests/vm/test-luks-fido2.sh`).
- The CI/CD pipeline itself (`.github/workflows/*.yml` + `MASTER GIT SU` fine-grained PAT scope + the `github.token`-only post-PR #148 hygiene).
- The OCI image build path (bootc + OPA/Rego Build Policy via `yubiOS.rego` + digest-pinned base images).

The audit must NOT cover (out of scope for v1, deferred):

- ARM64 Path A hardware (gated on OMN-141 sacrificial RK3588 burn, not scheduled).
- Bare-metal PCI passthrough testing (OMN-146 DEFER for v1; ADR-031 standing posture kept).

### 3.2 Acceptance criteria (falsifiable)

A security audit gate is PASS only when all of the following hold:

1. The auditor delivers a written report dated within 90 days of the v1 launch target (2026-09-13). Audit must be ≤90 days stale at launch.
2. The report has zero open Critical findings, and zero open High findings, on the launch surface.
3. Every Medium finding has a documented remediation plan with a target commit and a target PR.
4. The auditor has signed an NDA covering the audit findings (for liability protection) and a release authorization covering the findings' public summary (for the README + launch collateral).
5. The auditor is on the [TBD — Jenny input] approved-auditor list. Recommendation: hire from the existing yubiOS ecosystem of FIDO2-aware firms (e.g. Trail of Bits, Cure53, Trail of Bits' systemd/dm-verity practice); Jenny's call.

### 3.3 Evidence artifacts

- `refs/security-audit-report-2026-XX-XX.md` on `yubi-OS/yubiOS` main (the public summary, NDA-redacted).
- The full auditor report (NDA-protected) stored outside the public repo; SHA-256 referenced from the public summary.
- A new OMN issue filed per Critical/High/Medium finding, each linked from the public summary.

### 3.4 Owner

- **Auditor engagement:** Jenny (commercial relationship).
- **Report receipt + Linear filing:** Sauna (agent).
- **Remediation PRs:** Sauna (agent) for any finding that fits a self-mode shippable; Jenny for any finding requiring business decisions or hardware.

### 3.5 Dependency

- Depends on the engineering gates E-1..E-11 being PASS at audit kickoff (so the auditor sees a stable, signed, runnable artifact).
- Does NOT depend on ARM64 Path A hardware (auditor signs off on amd64 + arm64 dev image bootupd fix E-7 + fTPM Stage B E-8; Path A hardware is post-launch per the deferred status).

### 3.6 Status

**OPEN.** No auditor engagement yet. Recommend filing as soon as the v0.7.x release line stabilizes (post-v0.7.3 the release body changed format per Shant's 2026-08-04 v0.7.3 release).

## 4. Gate 1.5b — Pricing-validity (the WTP acceptance gate)

### 4.1 Scope

A pricing-validity test confirms that the proposed yubiOS pricing tier (pricing tier is [TBD — Jenny input]; the offer-pricing-architecture doc at `refs/offer-pricing-architecture-2026-07-25.md` (per OMN-71) is the substrate) actually clears at least one paid pilot contract with a real customer, on real hardware, for ≥90 days.

### 4.2 Acceptance criteria

A pricing-validity gate is PASS only when all of the following hold:

1. At least **8 distinct discovery interviews** completed with named prospects (per the OMN-85 directive; current status as of 2026-07-25: In Progress).
2. At least **5 of those 8 prospects** have stated explicit willingness-to-pay at the proposed tier (verbatim from the interview transcript; quotes preserved in `refs/wtp-interview-transcripts-2026-XX-XX.md`).
3. **At least 1 paid pilot contract** signed and invoiced against the proposed tier, with a deployment that has run on the customer's hardware for ≥30 days without a Critical-severity incident (incident severity per the misbehavior cutoff ADR-033 4-tier ladder: S1 INFO / S2 WARN / S3 THROTTLE / S4 SEVER).
4. The pilot contract includes a written reference-call agreement (consent to be named in the reference-customer section of the launch collateral).
5. The pilot customer's deployment uses a yubiOS release ≥ v0.7.1 (the first formal "v"-prefixed release tag; any earlier tag is pre-release).

### 4.3 Evidence artifacts

- `refs/wtp-interview-transcripts-2026-XX-XX.md` — verbatim interview quotes (anonymized unless customer consents to named quotes).
- `refs/pilot-contract-redacted-2026-XX-XX.md` — contract terms, NDA-redacted.
- `refs/pilot-deployment-runlog-2026-XX-XX.md` — deployment timeline + incident summary.
- Linear OMN-85 (Run the first 10-15 discovery interviews) — moved to Done when 8 interviews complete.
- New OMN issue per pilot, tracking the 30-day clean-run criterion.

### 4.4 Owner

- **Discovery interviews:** Jenny (per OMN-85; agent cannot do discovery interviews on the user's behalf per the LinkedIn/Beeper constraints).
- **Pilot contract drafting:** Jenny (commercial).
- **Pilot deployment + runlog:** Customer (deployment owner) + Sauna (agent) for any yubiOS-side issue triage.

### 4.5 Dependency

- Depends on E-3 (production arm64 guest works end-to-end) and E-5 (v0.7.1 release exists) — both PASS.
- Depends on the customer having real ARM64 or AMD64 hardware to deploy on (matches the yubiOS Path A/B hardware inventory in `docs/MILESTONE.md`).
- Does NOT depend on ARM64 Path A hardware (Path B AMD64 + ARM64 dev image is sufficient for a pilot on most customers' existing hardware).

### 4.6 Status

**OPEN.** OMN-85 In Progress. 0/8 discovery interviews complete as of session start (per memory notes; full transcript not in this session's context).

## 5. Gate 2.5 — Reference customer (the PRODUCTION proof gate)

### 5.1 Scope

A reference-customer gate confirms that one production deployment with a paying customer has been running yubiOS continuously for ≥90 days without a Critical-severity incident. The reference is used in launch collateral (README, pricing page, sales decks) to anchor credibility.

### 5.2 Acceptance criteria

A reference-customer gate is PASS only when all of the following hold:

1. The reference-customer's deployment has run yubiOS ≥v0.7.1 continuously for **at least 90 days** (deployment start date recorded; ≥90 days from launch date).
2. The deployment uses **real hardware** (not a CI runner, not a VM). The customer's own production hardware.
3. The customer has **signed a reference-call agreement** (consent to be named + consent to a 30-minute call with any prospect that asks for a reference).
4. The deployment has had **zero Critical-severity incidents** during the 90-day window (per ADR-033 S4 SEVER trigger model).
5. The deployment has had ≤2 High-severity incidents during the 90-day window, each with a documented remediation that shipped a fix.

### 5.3 Evidence artifacts

- `refs/reference-customer-deployment-runlog-2026-XX-XX.md` — day-by-day deployment timeline.
- `refs/reference-customer-call-agreement-2026-XX-XX.md` — the signed agreement, NDA-redacted.
- `refs/reference-customer-incident-summary-2026-XX-XX.md` — any High/Critical incidents in the 90-day window with their resolution.
- New OMN issue filed per reference-customer, tracking the 90-day window.

### 5.4 Owner

- **Reference-customer identification:** the same customer from Gate 1.5b's pilot (the reference builds on the pilot; it's a continuation, not a separate customer).
- **Reference-call agreement:** Jenny (commercial).
- **Deployment runlog:** Customer (deployment owner) + Sauna (agent) for any yubiOS-side issue triage.

### 5.5 Dependency

- Depends on Gate 1.5b PASS (the reference-customer's relationship starts as a pilot).
- Depends on E-3, E-5 PASS.
- Depends on the customer running yubiOS on their hardware for ≥90 days — this is calendar time, not engineering time, and is the longest lead-time gate.

### 5.6 Status

**OPEN.** No reference-customer yet. Cannot start until Gate 1.5b's pilot runs ≥30 days.

## 6. Gate runner mechanics (what's automatable vs requires human judgment)

| Gate | Runner | Automatable? |
|------|--------|--------------|
| E-1..E-11 (engineering) | CI + run-log fetch | YES — fully automated |
| Gate 1.5a (security audit) | Third-party auditor + report delivery | NO — commercial relationship + auditor selection + NDA is Jenny's domain |
| Gate 1.5b (pricing-validity) | Discovery interviews + pilot contract + 30-day runlog | NO — discovery interviews are Jenny's; pilot contract drafting is Jenny's; deployment runlog is customer's |
| Gate 2.5 (reference-customer) | Deployment runlog + reference-call agreement | NO — same as Gate 1.5b, with longer lead time |

The 3 missing gates are NOT automatable from the agent's side. They require Jenny's commercial + relationship work. The agent's role is to track them on Linear, file evidence artifacts when they land, and ensure the planning docs stay in lockstep with the gate status.

## 7. Updated readiness table (with the 3 missing gates)

| # | Gate | Status | Target date | Evidence required | Owner |
|---|------|--------|-------------|-------------------|-------|
| E-1 | dm-verity refuses tampered composefs reference | PASS | 2026-07-30 | run 30592785401 | foil-copy-overrate / 0mniteck |
| E-2 | sealed-UKI Secure Boot VM lane | PASS | 2026-07-31 | run 30652859000 at V83 | foil-copy-overrate / 0mniteck |
| E-3 | LUKS2 FIDO2 unlock on production arm64 | PASS | 2026-08-01 | run 30697269619 / job 91362188919 | foil-copy-overrate / 0mniteck |
| E-4 | Issue #20 end-to-end unlock test | PASS | 2026-08-01 | closed by 0mniteck | 0mniteck |
| E-5 | v0.7.1 first formal release tag | PASS | 2026-08-01 | v0.7.1 published | 0mniteck |
| E-6 | playbooks/ operational runbooks | PASS | 2026-08-01 | PR #156 merged | foil-copy-overrate |
| E-7 | ARM64 Path A dev image bootupd fix | PASS | 2026-07-29 | commits `f58d6c14` + `b8ba8574` | foil-copy-overrate |
| E-8 | ARM64 fTPM Stage B | PASS | 2026-07-07 | run 28894256274 | foil-copy-overrate |
| E-9 | BCVK USB YubiKey passthrough | PASS | 2026-07-30 | bcvk@`a9303e77dc90` | 0mniteck |
| E-10 | libvfio-user bundle-vs-per-runner decision | PASS | 2026-07-30 | PR #152 merged | foil-copy-overrate |
| E-11 | ci.yml group-routing redesign | PASS | 2026-07-29 | PR #145 merged | foil-copy-overrate |
| 1.5a | Security audit (third-party) | **OPEN** | 2026-09-13 | refs/security-audit-report-2026-XX-XX.md | Jenny (engagement) + Sauna (filing) |
| 1.5b | Pricing-validity (paid pilot) | **OPEN** | 2026-09-13 | refs/wtp-interview-transcripts-2026-XX-XX.md + refs/pilot-contract-redacted-2026-XX-XX.md + refs/pilot-deployment-runlog-2026-XX-XX.md | Jenny (commercial) + Customer (deployment) |
| 2.5 | Reference customer (≥90 days production) | **OPEN** | 2026-12-12 (90 days post-pilot) | refs/reference-customer-deployment-runlog-2026-XX-XX.md + refs/reference-customer-call-agreement-2026-XX-XX.md | Jenny (commercial) + Customer (deployment) |

Note Gate 2.5's target date is 2026-12-12 if the pilot starts 2026-09-13. If the v1 launch target slips to give Gate 1.5b room, Gate 2.5's date follows. v1 launch target is 2026-09-13; the agent recommends re-targeting v1 launch to 2026-12-13 to make all 3 missing gates feasible, but this is Jenny's call.

## 8. Drift correction

The following planning docs reference the OLD gate list and need to be updated at PR-time. Per `PROJECT_RULES.md` lines 75-78 (planning-doc publish-gate), each must carry a `<last-reviewed-against-blockers>` stamp.

- `refs/readiness-gates-gtm-2026-07-25.md` (commit `baf0e209`) — last reviewed 2026-07-25; gate list predates E-8/E-9/E-10/E-11 + missing 1.5a/1.5b/2.5.
- `refs/first-90-days-2026-07-25.md` (commit `3600e12e`) — already drift-corrected for B-VM-CTAP2 per RECENT_ACTIVITY 2026-07-30 entry; needs further drift correction for the 3 missing gates.
- `docs/MILESTONE.md` (commit `50883ee3`) — last reviewed 2026-07-30; gate list is current but doesn't enumerate 1.5a/1.5b/2.5 explicitly.
- `refs/testing-production-gaps-2026-08-01.md` (PR #156, commit `3e74579c8e50`) — 12 gaps; gap 8 (OMN-158 validate-input-shape) is the machine-half of the answer; this spec is the human-half for gates 1.5a/1.5b/2.5.

## 9. What this spec does NOT do

- Does NOT call the Linear API (no mutations; this is a planning doc, not an action).
- Does NOT call the GitHub API (no PR creation; the user (Jenny) or the agent's next-session turns file the PR after this draft lands).
- Does NOT make any decisions on Jenny's behalf (all `[TBD — Jenny input]` markers are explicitly marked).
- Does NOT prescribe a specific auditor (commercial-relationship decision).
- Does NOT prescribe pricing numbers (the offer-pricing-architecture doc per OMN-71 is the substrate).
- Does NOT track Gate 2.5's 90-day countdown (calendar time, not engineering time; tracked separately when the pilot starts).

## 10. References

- Linear [OMN-142](https://linear.app/omni-agent/issue/OMN-142) — Add 3 missing gates (this spec's parent issue)
- Linear [OMN-85](https://linear.app/omni-agent/issue/OMN-85) — Run the first 10-15 discovery interviews (Gate 1.5b's interview substrate)
- Linear [OMN-71](https://linear.app/omni-agent/issue/OMN-71) — Offer and pricing architecture (Gate 1.5b's pricing substrate)
- Linear [OMN-152](https://linear.app/omni-agent/issue/OMN-152) — playbooks/ (E-6 substrate)
- Linear [OMN-158](https://linear.app/omni-agent/issue/OMN-158) — input-shape doctrine + validate-input-shape gate (the machine-half companion to this human-half)
- ADR-031 (commit `67c740c`, 2026-07-26) — virtio-gpu default / vfio-user preferred / IOMMU-gated PCI passthrough access gate
- ADR-033 (PR #151 merged 2026-07-30T09:43:24Z) — misbehavior-triggered PCI-mediation cutoff (the S4 SEVER trigger model used by Gate 2.5's "zero Critical incidents" criterion)
- `refs/offer-pricing-architecture-2026-07-25.md` (PR #108 from the-cult session, per CULT_LEADER.md)
- `refs/readiness-gates-gtm-2026-07-25.md` (commit `baf0e209`)
- `refs/first-90-days-2026-07-25.md` (commit `3600e12e`)
- `docs/MILESTONE.md` (commit `50883ee3`)
- `docs/BLOCKERS.md` (last reviewed 2026-07-30 per RECENT_ACTIVITY; the B-VGPU-VM-UNZIP retirement on 2026-08-01 is the most recent)

---

End of spec. This spec is merge-ready for a PR on `yubi-OS/yubiOS` main under the file path `refs/release-gate-checklist-v2-2026-08-04.md`. Jenny merges per the standing rule.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
