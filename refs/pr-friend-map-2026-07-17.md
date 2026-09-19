# Public-relations friend map: 2026-07-17

Status: active kickoff / quiet research

Research date: 2026-07-17 UTC, which is 2026-07-16 PDT for the user context.

Campaign mode: pre-launch, proof-first, build in public

Related files: [PR.md](../docs/PR.md), [refs/pr-campaign-research-2026-07-16.md](pr-campaign-research-2026-07-16.md), [TODO.md](../docs/TODO.md), [BLOCKERS.md](../docs/BLOCKERS.md), [SECURITY.md](../.github/SECURITY.md)

Canonical community home for now: https://github.com/yubi-OS/yubiOS/discussions

## Research query plan

This pass used a narrow source plan before choosing outreach moves:

1. Re-read the yubiOS campaign objectives, blocker register, README, and security policy.
2. Check current first-party upstream sources for bootc, Fedora sealed bootable containers, Yubico FIDO2 `hmac-secret`, and OpenSSF 2026 community themes.
3. Convert source-backed overlaps into community-level outreach paths.
4. Defer person-directed pitches until Gate 0 hygiene is complete and there is a current proof artifact to discuss.

No external comments, pitches, or person-directed outreach were sent in this pass. The goal was to prepare respectful friend-making infrastructure first.

## Executive decision

Begin the campaign by making yubiOS easier to trust, easier to discuss, and easier to help. Do not run broad publicity yet.

The right first move is relationship-led technical participation:

- Ask for review of narrow assumptions, not endorsement.
- Bring useful findings back to upstreams, not generic announcements.
- Link every ask to the current evidence, blockers, and limitations.
- Route general curiosity to yubiOS Discussions instead of scattering support across unrelated venues.

The campaign can safely pull owned-channel and upstream-participation knobs now. Earned media, Show HN, and broader launch language should wait for the physical-YubiKey and real-hardware evidence gates in [PR.md](../docs/PR.md).

## Current readiness snapshot

| Area | Status | PR implication |
|---|---|---|
| Campaign story | Ready for build-in-public framing | Use the identity-root/platform-root distinction from [PR.md](../docs/PR.md). |
| Production claim | Not ready | Keep "groundwork", "experimental", and "technical preview" language. |
| Physical YubiKey proof | Still a gate | Ask practitioners to review the flow before presenting it as proven production confidence. |
| ARM64 Path A | Still a gate | Ask board and firmware people for help selecting and validating the first real-board proof. |
| Public security intake | Needs hardening | Replace placeholder policy and add role-based/contact guidance before driving traffic. |
| README claims | Needs qualification | Avoid unqualified "No TPM", "No OEM", "sole root", and "at every layer" phrasing. |
| Outreach | Ready only as targeted participation | Do not cross-post promotional copy. |

## Knobs to pull now

| Knob | Pull now | Friend-making behavior | Success signal |
|---|---|---|---|
| README claim hygiene | Yes | Make the first impression honest and technically precise. | Fewer corrections needed when reviewers arrive. |
| Security policy | Yes | Give security-minded friends a non-public reporting path. | Sensitive reports avoid public issue threads. |
| GitHub Discussions | Yes | Use one canonical place for broad questions, testing offers, and feedback. | Questions and offers are collected instead of scattered. |
| Dated refs notes | Yes | Publish what changed, why, and what is still unproven. | Reviewers can cite stable evidence. |
| Upstream issues | Selectively | File only reproductions, docs improvements, or narrow technical questions. | Upstreams respond to the substance, not the brand. |
| Upstream discussions/meetings | Selectively | Introduce yubiOS as a use case and ask one review question at a time. | Specific review or a better design path. |
| Social posts | Later | Share evidence artifacts after Gate 1, not slogans. | Qualified reviewers click through and ask technical questions. |
| Press pitches | Later | Pitch a proof milestone, not ambition. | Coverage centers evidence and limitations. |

## Friend map

| Priority | Community | Why they matter | First useful contribution | First ask | Gate before outreach |
|---:|---|---|---|---|---|
| 1 | bootc-dev / Fedora bootc | bootc is the delivery model and a natural reviewer for image-based OS assumptions. | Document yubiOS findings around production/dev tag separation, composefs/UKI behavior, or bootc install UX. | "Does this bootc usage or failure mode look upstream-relevant?" | Current evidence page and README claim cleanup. |
| 1 | Fedora Atomic / sealed-image community | Fedora sealed images make verified bootable containers legible and already model test-image warnings. | Share testing notes that help bootc, composefs, or UKI users beyond yubiOS. | "What should yubiOS copy from your test-image warning and feedback routing model?" | Security policy and destructive-install warnings. |
| 1 | YubiKey / FIDO2 practitioners | They can catch mistakes in PIV, FIDO2 `hmac-secret`, resident-key, and recovery assumptions. | Publish a precise enrollment/recovery flow and invite correction. | "Which part of this token ceremony is unsafe, too vague, or hard to recover from?" | Physical-token test plan with non-production label. |
| 1 | systemd / homed / cryptenroll users | yubiOS leans heavily on systemd's modern image, homed, and credential model. | Send focused bug reports or docs PRs when yubiOS uncovers reproducible behavior. | "Is this the intended boundary between FIDO2 unlock and measured boot?" | Repro steps and current systemd version evidence. |
| 1 | ARM64 firmware and board communities | Path A needs real-board help for TF-A, OP-TEE, RPMB, fTPM, U-Boot UEFI, and signed UKI proof. | Publish a board-specific Path A checklist for ROCK 5B / RK3588 and ROCKPro64 / RK3399. | "Can you review the provisioning sequence and recovery failure modes?" | Sacrificial-board rehearsal plan. |
| 2 | OpenSSF / supply-chain security | yubiOS has a strong supply-chain story if it stays evidence-bounded. | Offer a case-study style note on pins, build policy, SBOM/provenance, and AI-era review limits. | "Which controls are useful to generalize, and which are yubiOS-specific?" | Claim ledger and current artifact verification. |
| 2 | secureblue / Universal Blue / hardened desktop operators | Adjacent users understand immutable desktop trade-offs and can challenge usability claims. | Compare threat models respectfully and surface shared docs gaps. | "Where does the owner-held key model help, and where does it add friction?" | Public install/recovery warning and tested-hardware status. |
| 2 | homelab and security owner-operators | They are likely early testers if the project is clear about risk. | Publish a technical-preview setup note with hardware, backups, and recovery. | "Would you test this in a non-daily-driver environment?" | Gate 1 evidence page. |
| 3 | Linux/security media | They can amplify a proof milestone, but only after the proof exists. | Prepare a concise evidence pack with limitations. | "Would you like a demo of the reproduced milestone?" | Gate 2 or Gate 3. |

## First 14-day experiment

| Day | Action | Owner | Output | Stop condition |
|---:|---|---|---|---|
| 0 | Fix public claim hygiene and security intake | OMNI-AGENT | README and SECURITY changes | Stop if wording conflicts with [PR.md](../docs/PR.md). |
| 1 | Publish this friend map | OMNI-AGENT | Dated ref under `refs/` | Stop if it implies endorsement or contact already happened. |
| 2 | Open a GitHub issue to track PR kickoff outcomes | OMNI-AGENT | Issue with branch, PR, run status, and next steps | Stop if a matching issue already exists; update instead. |
| 3-5 | Create a yubiOS Discussion for reviewer asks | Maintainer / OMNI-AGENT if Discussions tooling is available | One canonical "help review the trust boundary" thread | Stop if SECURITY/README changes are not merged. |
| 5-8 | Prepare two upstream-useful notes | Maintainer / OMNI-AGENT | bootc/Fedora note and FIDO2 enrollment note | Stop if either note reads like promotion. |
| 8-14 | Do two respectful upstream touches | Maintainer / OMNI-AGENT if explicitly approved | One discussion/comment per community, each with a specific question | Stop after two touches and review signal quality. |

## Outreach drafts

Use these as templates only after the matching gate is satisfied.

### GitHub Discussions kickoff

Title: Help review the yubiOS trust boundary before we amplify it

Body:

> yubiOS is pre-launch and we are deliberately staying in build-in-public mode. The question we want reviewed is not "is this ready?" but "is this trust boundary described correctly?" The current model treats the owner-held YubiKey as the human-presence and identity gate for signing, unlock, SSH, and PAM, while platform measurement remains a separate integrity signal. Current blockers and evidence are linked in PR.md, TODO.md, and BLOCKERS.md. If you work on bootc, systemd, FIDO2/PIV, firmware, or supply-chain verification, we would value specific corrections, missing failure modes, and test cases.

### Upstream/community note

> We are using yubiOS as a test case for [specific upstream behavior]. I do not want to turn this into a product announcement; I am looking for review of one narrow assumption: [question]. Current evidence: [link]. Known limits: [link]. If this belongs somewhere else, please point me there and I will move it.

### Hardware collaborator note

> yubiOS needs real-board review before any ARM64 owner-root language is safe. The current candidate is ROCK 5B / RK3588, with ROCKPro64 / RK3399 as supported secondary. The review request is the provisioning and recovery sequence, especially ROTPK/fuse rehearsal, OP-TEE/RPMB-backed state, fTPM NV, U-Boot UEFI, and signed UKI boot. We are seeking corrections and failure modes, not endorsement.

## Measurement

Track quality, not volume:

| Metric | Good signal | Bad signal |
|---|---|---|
| Review quality | Specific corrections, missing failure modes, reproductions | Stars with no technical follow-up |
| Relationship health | Upstreams redirect or engage constructively | Communities call the post promotional |
| Evidence progress | New logs, commands, hardware offers, or docs fixes | Repeated questions caused by unclear claims |
| Safety | Security reports avoid public sensitive details | Vulnerability details appear in public issues |
| Conversion | Reviewers become issue authors, testers, or contributors | Drive-by traffic with no useful action |

Review after the first two upstream touches and decide whether to continue, change the ask, or pause.

## Sources checked

Internal sources:

- [PR.md](../docs/PR.md)
- [refs/pr-campaign-research-2026-07-16.md](pr-campaign-research-2026-07-16.md)
- [README.md](../README.md)
- [TODO.md](../docs/TODO.md)
- [BLOCKERS.md](../docs/BLOCKERS.md)
- [SECURITY.md](../.github/SECURITY.md)

External first-party/community sources, accessed 2026-07-17:

- bootc upstream README and community links: https://github.com/bootc-dev/bootc
- Fedora sealed Atomic Desktop test images: https://fedoramagazine.org/sealed-atomic-desktops-test-images/
- Yubico FIDO2 `hmac-secret` documentation: https://docs.yubico.com/yesdk/users-manual/application-fido2/hmac-secret.html
- OpenSSF Community Day North America 2026 recap: https://openssf.org/blog/2026/06/05/the-skyway-to-oss-security-openssf-community-day-north-america-2026-recap/
- OpenSSF 2026 themes roadmap: https://openssf.org/blog/2026/01/15/openssfs-2026-themes-a-community-roadmap-for-securing-the-future-of-open-source/

## Refresh rule

Before sending any external outreach, re-check the target community's current rules, the yubiOS blocker register, the exact evidence URL, and the wording of any public claim. A friendly first impression is accurate, bounded, and useful even to people who never adopt yubiOS.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Declarative policy coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.
