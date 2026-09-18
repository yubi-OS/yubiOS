# yubiOS public-interest operating covenant

**Status:** draft, staged for review | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-70](https://linear.app/omni-agent/issue/OMN-70/public-interest-operating-covenant)

## Why this exists

This covenant is the public commitment layer that sits on top of [MISSION.md](../docs/MISSION.md).
MISSION.md states the design principles ("no trust anchors you don't control," "don't be
evil," "if a feature ever needs a security exception to exist, it gets cut"). This
document turns those principles into concrete, checkable commitments about what stays
public, what the commercial layer may and may not do, and how stewardship decisions
(telemetry, forks, roadmap, disclosure) get made. It is grounded only in what's already
public in MISSION.md, LICENSE (LGPL-2.1), and PROJECT_RULES.md — it does not invent a
business model that hasn't been decided yet (see "Open items" below).

## 1. What remains public

- **The trust chain, always.** Every mechanism that establishes or verifies trust —
  Secure Boot signing flow, dm-verity manifests, LUKS2/FIDO2 enrollment logic, the
  Rego build policy (`yubiOS.rego`), SLSA provenance generation, PINNED.md digest
  pins — ships as source, under LGPL-2.1, with no closed variant. A trust boundary
  the owner cannot inspect is a trust boundary they don't actually control, which
  MISSION.md rules out by design.
- **Threat models and known gaps.** MITIGATE.md's "what we cannot fully prevent"
  table, BLOCKERS.md, and ADR.md stay public and current. Security tooling that
  hides its own limitations is the dark pattern MISSION.md explicitly rejects.
- **The base OS image.** The bootable yubiOS image (kernel, initrd, UKI, core
  trust-chain services) is public and freely installable — this covenant does not
  gate the ability to build, sign, and boot yubiOS on hardware you own behind a
  purchase.
- **Architecture decisions.** ADRs are published with rationale and sources at the
  time a decision is made, not retroactively, so the community can contest a
  decision while it's still live.

## 2. Commercial boundaries — what customers may buy

Consistent with LGPL-2.1 (which permits commercial use and distribution) and
MISSION.md's "control wins over convenience" stance, anything sold sits *around* the
trust chain, never *inside* it:

- **Allowed:** managed fleet provisioning/enrollment services, hardware bundles
  (YubiKey + pre-flashed device), support contracts and SLAs, hosted build/CI
  infrastructure, integration consulting, training.
- **Allowed:** paid features that are pure convenience and ship with a documented,
  owner-auditable equivalent path that doesn't require payment (e.g., a hosted
  fleet dashboard is fine if `homectl`/`bootc`/API access to the same data isn't
  paywalled).
- **Not allowed:** selling access to a trust boundary itself — no paid tier that
  unlocks a stronger or different Secure Boot / disk-encryption / signing path than
  the free one. No "enterprise" trust anchor that bypasses the YubiKey-as-root
  model. No feature that requires surrendering key material (ROTPK, LUKS keys,
  FIDO2 credentials) to yubiOS or a yubiOS-operated service as a condition of
  paying.
- **Not allowed:** withholding a security fix, mitigation, or disclosure from
  non-paying users. Security is not a commercial tier (MISSION.md: "security
  that ships in the box").

## 3. Stewardship rules

### Telemetry
- Default: **no phone-home telemetry**, per MISSION.md ("we do not ship ...
  phone-home telemetry"). Any future opt-in diagnostics must be: off by default,
  documented in a single canonical location, and auditable (owner can see exactly
  what would be sent before opting in).
- Managed/hosted commercial offerings (fleet dashboards, support services) may
  collect operational data *from that service*, but that's data about use of a
  paid product a customer chose, not telemetry baked into the OS image itself.

### Forks
- LGPL-2.1 already guarantees the right to fork. This covenant adds no additional
  restriction beyond the license. A fork that keeps the trust-chain components
  open and auditable is exactly the outcome the license and MISSION.md both
  protect for.
- We won't use trademark, branding, or distribution-channel leverage (app store
  listings, default download links) to disadvantage a compliant fork's users'
  security — e.g., we won't hold back a published CVE fix from upstream just
  because a fork exists.

### Roadmap control
- Architecture decisions affecting the trust chain go through ADR.md before
  landing, with rationale and sources — not decided silently in a PR description
  or a private channel.
- The roadmap can be commercially informed (what customers are asking for is
  real signal) but cannot be commercially *gated* — a feature request from a
  paying customer doesn't buy priority on trust-chain design, only on
  scheduling of non-trust-chain work.

### Disclosure
- Security disclosures follow coordinated disclosure norms: report privately,
  fix, then publish with credit. No embargo exists for commercial customers only
  — a fix ships to everyone at the same time it's disclosed, consistent with
  "security is not a commercial tier" above.
- BLOCKERS.md and MITIGATE.md are the disclosure surface for *known, unresolved*
  gaps (as opposed to CVEs) — they stay current, not just accurate as of their
  last-reviewed date.

## 4. Review against the business model and support motion

**Open item, not resolved by this document.** As of this draft, no published
business-model or pricing document exists in the repo for this covenant to be
checked against (OMN-71 "Offer and pricing architecture," OMN-69 "Who pays and
why," and OMN-77/78 revenue/ROI docs are separate, independent Linear issues in
the same backlog and had not landed at the time this was drafted). The commercial
boundaries in section 2 are written to be compatible with *any* pricing model that
sells services/hardware/support around the OS rather than access to the trust
chain — that constraint should hold regardless of which specific offer OMN-71
lands on. Once OMN-71/69 land, re-review section 2 against the actual offer for
concrete conflicts (e.g., does a proposed SKU imply gating a security fix,
requiring key custody, or telemetry-by-default) rather than assuming compatibility.

## 5. Publish / staging status

This PR *is* the staging step: landing it on `main` under `refs/` makes the draft
readable and citable (per repo convention — `refs/` is where research and spec
docs land before being promoted). Promotion to a top-level, permanently-linked
`COVENANT.md` (paired with a conflict-resolution policy, tracked separately as
OMN-82/T8) is follow-up work, not done here.

## Dependencies

- Unblocks **OMN-82 (T8)** "Publish the covenant and conflict policy" — that issue
  should build on sections 1–3 here rather than re-deriving them.
- Section 4 should be revisited once OMN-71 (offer/pricing) and OMN-69 (who pays
  and why) land.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
