# yubiOS covenant conflict policy

**Status:** draft, staged for review | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-82](https://linear.app/omni-agent/issue/OMN-82/publish-the-covenant-and-conflict-policy)

## Why this exists

[refs/operating-covenant-2026-07-25.md](operating-covenant-2026-07-25.md) (OMN-70)
states the commitments: what stays public, what the commercial layer may sell, and
the stewardship rules around telemetry, forks, roadmap, and disclosure. This
document is the second half of OMN-82's governance-publication workstream: a
concrete policy for *what happens when a decision conflicts with the covenant* —
who decides, how it's recorded, and what the remedy is. A covenant without a
conflict policy is a set of promises with no enforcement path; MISSION.md's "if a
feature ever needs a security exception to exist, it gets cut" is only credible if
there's a documented process for catching the case where someone proposes exactly
that exception.

## 1. What counts as a conflict

A conflict is any proposed decision, feature, commercial offer, or roadmap change
that would require violating a covenant commitment to proceed — for example:

- A commercial SKU that would gate a security fix or mitigation behind payment
  (covenant §2 "not allowed").
- A feature that requires the OS or a yubiOS-operated service to hold customer key
  material as a condition of use (covenant §2).
- A telemetry default that ships on rather than opt-in (covenant §3, Telemetry).
- A roadmap decision affecting the trust chain that skips an ADR (covenant §3,
  Roadmap control).
- A disclosure timeline that would give paying customers early access to a fix
  ahead of everyone else (covenant §3, Disclosure).

This list is illustrative, not exhaustive — the test is always "does landing this
require breaking a specific covenant commitment," not a vibe check.

## 2. Who decides

- **Trust-chain and security conflicts** (anything touching Secure Boot, disk
  encryption, PAM/FIDO2 auth, SSH, dm-verity, the Rego build policy, or SLSA
  provenance): resolved against MISSION.md and the covenant directly. Per
  MISSION.md's ownership model ("this power belongs to the owner of the hardware,
  and to no one else: not the OEM, not the SoC vendor, not us"), yubiOS does not
  get a carve-out for itself either — the same standard applies to a
  yubiOS-authored proposal as an external one.
- **Commercial/business conflicts** (pricing, SKU design, support tiers): resolved
  against covenant §2. A commercial decision that appears to conflict must be
  revised before shipping, not shipped with a "we'll fix messaging later" plan —
  per MISSION.md, "control wins" over convenience is the tiebreaker.
- **Escalation:** since yubiOS's public org chart currently lists a single
  Founder/Lead Developer role (per COMPANY.md conventions — not duplicated here),
  today's practical answer is that a flagged conflict blocks merge until Jenny
  (or whoever holds that role at the time) resolves it. This policy does not
  invent a governance board that doesn't exist yet; it records the current,
  honest state and should be revisited if/when the org grows.

## 3. How a conflict gets recorded

1. Any contributor (human or AI-assisted) who identifies a potential conflict
   opens a GitHub issue or PR comment citing the specific covenant clause
   (e.g. "conflicts with covenant §2, not-allowed: telemetry-by-default").
2. If the conflict is confirmed, it's logged the same way an active blocker is —
   as an entry in [BLOCKERS.md](../docs/BLOCKERS.md) if it's blocking a specific piece
   of work, or as an ADR if it's a standing architectural tension, so it's visible
   in the same place contributors already check per AGENTS.md's session-start
   reading order.
3. The resolution (proceed after revision, reject, or accept as a documented,
   narrow exception with its own written rationale) gets the same ADR treatment
   as any other architectural decision — rationale and sources recorded at
   decision time, per covenant §3 Roadmap control.

## 4. Reconciliation with the pricing and support model

**Open item, same as covenant §4.** OMN-71 (offer and pricing architecture) and
OMN-69 (who pays and why) have not landed in the repo as of this draft. This
conflict policy is written to be pricing-model-agnostic: it defines the *process*
for catching a conflict, not a judgment on any specific SKU, because no concrete
SKU exists yet to judge. Once OMN-71/69 land, the first real use of this policy
should be running the proposed offer through section 1's conflict checklist and
recording the result as an ADR — that's the "prepare a publishable version"
review OMN-82 asks for, and it can't happen honestly before the pricing doc exists.

## 5. Publish / staging status

Per OMN-82's ask to "prepare a publishable version and identify any remaining
review dependencies": this document and the covenant (OMN-70) are both staged at
`refs/` — readable and citable, consistent with the repo's existing pattern for
draft/spec docs before promotion. Remaining dependencies before a top-level,
permanently-linked publication (e.g. `COVENANT.md` + `CONFLICT_POLICY.md` at repo
root):

- OMN-71 (pricing/offer) and OMN-69 (who pays) landing, so section 4's
  reconciliation can happen for real instead of remaining an open item.
- A human (Jenny) sign-off on section 2's decision-authority framing, since it
  describes a governance process affecting her role directly — not something an
  agent should unilaterally finalize as "published."

## Dependencies

- Builds on **OMN-70** (covenant, PR #106) — do not re-derive covenant content
  here; reference it.
- Blocks full publication until **OMN-71 / OMN-69** land (section 4).


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.
