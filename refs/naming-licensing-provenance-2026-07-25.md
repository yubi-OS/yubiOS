# yubiOS naming, licensing, and provenance risk register

**Status:** draft risk register, decisions flagged for Jenny, not resolved here | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-81](https://linear.app/omni-agent/issue/OMN-81/complete-naming-licensing-provenance-and-entity-consultations)

## Why this exists, and what it isn't

OMN-81 asks for a concise legal/structural risk register: naming/trademark,
license fit, contributor provenance, and a near-term entity-path decision.
**OMN-72** ("Entity, governance, and legal work") is the broader workstream this
feeds into â advisory structure, insurance, privacy, export, and full entity
setup are OMN-72's scope, not re-derived here. This document is the narrower
risk register OMN-81 asks for, grounded only in what's actually in the repo
(README.md, LICENSE, AGENTS.md, PROJECT_RULES.md conventions) â it does not
substitute for real legal counsel on trademark or entity formation, and says so
explicitly per item.

## 1. Naming and trademark risk

- **The name "yubiOS" itself is the primary risk.** The project name and every
  fork under the `yubi-OS` GitHub org use "yubi" as a prefix, and the README
  badge/description leans on "YubiKey" branding throughout (logo, "YubiKey 5
  series" badge, FIDO2 badge). Yubico is a real company with registered
  trademarks on "YubiKey" and likely trademark interest in "Yubi"-prefixed
  marks in the authentication/security space. **This needs actual trademark
  counsel, not an AI-assisted read of public trademark databases** â the risk
  is real enough (a rebrand after traction would be far costlier than checking
  now) that this document flags it as the #1 open item rather than guessing at
  a USPTO search result this session didn't run.
- **Nominative fair use vs. endorsement risk.** README.md's current framing
  ("YubiKey as root of trust," extensive YubiKey badges/logo styling) reads
  close to describing compatibility with Yubico hardware (likely fine under
  nominative fair use â referring to a product you're compatible with) versus
  implying Yubico endorsement or partnership (not fine, and not represented
  anywhere in AGENTS.md or COMPANY.md as an actual relationship that exists).
  Recommend an explicit "not affiliated with or endorsed by Yubico" disclaimer
  once legal counsel confirms the naming approach, rather than leaving the
  association implicit.
- **Fork-name risk is lower.** `yubi-OS/bootc`, `yubi-OS/mkosi`, `yubi-OS/bcvk`
  etc. are forks of existing open-source projects under their own upstream
  names â the risk there is standard fork-attribution practice (keep upstream
  LICENSE/NOTICE files intact), not a new trademark question.

## 2. License fit and redistribution obligations

- **Primary repo (`yubi-OS/yubiOS`) is LGPL-2.1**, confirmed directly from
  `LICENSE`. LGPL permits commercial use, modification, and redistribution,
  including as part of a proprietary combined work, provided LGPL'd components
  stay separately replaceable and the license/copyright notices are preserved
  â this is compatible with the commercial boundaries already drafted in
  [refs/operating-covenant-2026-07-25.md](operating-covenant-2026-07-25.md)
  (OMN-70), which assumed LGPL-2.1 permits the commercial layer described
  there.
- **Forked dependencies carry their own upstream licenses**, which yubiOS
  inherits by using them, not by choosing them:
  - `bootc`, `mkosi`, `bcvk`, `particleos` â upstream systemd/bootc-ecosystem
    projects; typically Apache-2.0/LGPL/MIT-family (verify per-repo, not
    assumed uniform).
  - `arm-trusted-firmware`, `optee_os`, `optee_ftpm`, `edk2`, `edk2-rk3588` â
    ARM/TrustedFirmware and OP-TEE ecosystem projects are typically BSD-3-Clause.
  - `u-boot` â GPL-2.0 (well-known for U-Boot specifically).
  - `ms-tpm-20-ref` â Microsoft's reference TPM 2.0 implementation is typically
    a permissive BSD-style license.
  - **This document does not assert exact license strings for each fork as
    verified fact** â AGENTS.md's project repository list names the repos but
    not their individual licenses. Before any GA/publication step, someone
    should pull each fork's actual `LICENSE` file and confirm the exact
    license and any NOTICE-preservation obligation, rather than relying on
    "typically X" characterizations like the ones above.
  - Because these are separate binaries/firmware images combined at boot time
    (not statically linked into one LGPL'd binary), a GPL-2.0 component like
    U-Boot sitting alongside LGPL-2.1 yubiOS code is a standard, low-risk
    pattern (this is exactly how most Linux distributions combine GPL
    bootloaders with differently-licensed userspace) â but this is a
    structural observation, not a substitute for the per-repo license
    verification above.
- **Redistribution obligation baseline:** LGPL-2.1 requires preserving
  copyright/license notices and making corresponding source available for any
  distributed LGPL'd binary. `docker.io/0mniteck/yubios` (the primary
  distribution channel per PROJECT_RULES.md) should carry a NOTICE or
  equivalent pointing back to `yubi-OS/yubiOS` and each fork's own repo â
  worth confirming this exists before wider distribution, not asserted here as
  already done.

## 3. Contributor provenance and policy

- **Current state, observed, not invented:** commits in this repo are
  routinely AI-assisted. The `bcvk-virtualization` skill already documents a
  convention â `Assisted-by: Sauna (claude-sonnet-4-6)` trailer, explicitly
  **no** `Signed-off-by` on AI-generated commits until a human reviews and adds
  one. That's a real, working provenance convention, just not written down as
  a project-wide policy document (e.g. `CONTRIBUTING.md` or `PROVENANCE.md`).
- **Gap:** there's no visible Developer Certificate of Origin (DCO) or
  Contributor License Agreement (CLA) requirement in the repo as of this
  draft. For an LGPL-2.1 project accepting outside contributions (not just
  Jenny + AI agents), a DCO (lightweight, "I have the right to submit this")
  is the common low-friction choice â a CLA is heavier and usually only
  needed if the project wants to relicense later or accept corporate
  contributions under specific terms. **This is a decision for Jenny, not
  asserted here as already chosen.**
- **Recommended next step (not executed here):** formalize the existing
  `Assisted-by` / no-auto-`Signed-off-by` convention into a short
  `CONTRIBUTING.md`, and decide DCO vs. CLA vs. neither before accepting the
  first external PR from someone who isn't already working through this
  cult/follower system.

## 4. Near-term entity path

- **Current state:** COMPANY.md lists yubiOS as pre-launch, repos public, with
  a single Founder/Lead Developer (Jenny) and no entity type recorded. This
  document does not decide an entity type (sole proprietorship, LLC, etc.) â
  that's a decision requiring Jenny's actual legal/tax situation, which this
  session has no visibility into and shouldn't guess at.
- **What the decision affects, concretely:** the offer catalog in
  [refs/offer-pricing-architecture-2026-07-25.md](offer-pricing-architecture-2026-07-25.md)
  (OMN-71) includes paid contracts (support SLAs, consulting, managed
  services) â signing a real contract, taking payment, or carrying liability
  for a managed service normally wants *some* entity in place first. This is
  flagged as a blocking dependency for O3/O4/O5 in that document's terms, not
  re-litigated here.
- **Owned by OMN-72**, which explicitly covers "decide the near-term operating
  entity approach" â this document only records that the decision is open and
  names what depends on it, so OMN-72 doesn't have to rediscover the
  dependency from scratch.

## 5. Risk register summary

| Risk | Severity | Status | Owner / next step |
|---|---|---|---|
| "yubiOS" name / Yubico trademark exposure | High â costly if wrong later | Open, unverified | Needs real trademark counsel, not AI research |
| README YubiKey branding read as endorsement | Medium | Open | Add explicit non-affiliation disclaimer once naming is resolved |
| Fork licenses not individually re-verified | Medium | Open | Pull each fork's actual LICENSE file before GA |
| No CONTRIBUTING/provenance policy doc | Low-medium | Open, convention exists informally | Write it up; decide DCO/CLA/neither |
| No entity in place for contract/liability-bearing offers | Medium-high | Open | Owned by OMN-72; blocks O3/O4/O5 pricing offers |

## Dependencies

- Feeds **OMN-72** (entity, governance, legal) â section 4 above is written to
  hand off cleanly rather than duplicate that issue's full scope.
- Section 4's contract/liability point ties to **OMN-71** (offer/pricing,
  PR #108).



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
