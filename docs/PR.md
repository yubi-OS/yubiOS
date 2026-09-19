# yubiOS Public Relations Campaign

Last researched: 2026-07-16

Campaign status: pre-launch, proof-first, build in public

Project status: groundwork / work in progress

Research snapshot: [refs/pr-campaign-research-2026-07-16.md](../refs/pr-campaign-research-2026-07-16.md)

> In this document, **PR** means **Public Relations**, not pull request.

## Executive decision

Do not market yubiOS as generally available or production-ready yet. Run a staged, technical campaign that earns trust by publishing evidence, limits, and repeatable demonstrations as the project crosses its engineering gates.

The campaign thesis is:

> **yubiOS is building a Linux trust chain the owner can hold in their hand.**

The public story is not “a more secure Linux distribution.” That category is crowded and difficult to prove. The sharper story is that yubiOS separates two questions that conventional systems often blur:

1. **Is the authorized owner present?** An owner-held YubiKey gates signing, unlock, SSH, and privileged local identity.
2. **Did the expected platform boot?** Signed boot artifacts, verified operating-system content, and platform measurement answer this separately.

This distinction is both technically honest and memorable. It also prevents the current “No TPM” shorthand from becoming a misleading claim: yubiOS avoids a **mandatory TPM as the owner-facing unlock and identity gate**, while still using TPM/fTPM measurement where it adds platform evidence.

The first campaign should optimize for qualified reviewers, contributors, hardware collaborators, and technical credibility. Downloads, broad consumer coverage, and enterprise adoption are later outcomes.

## Strategic outcome

Within 90 days of the first campaign wave, aim to achieve:

- 10 qualified contributors, reviewers, or hardware testers who engage beyond a social reaction.
- 2 real-hardware collaborators, including at least 1 candidate for the RK3588 Path A proof.
- 3 substantive independent technical discussions, articles, podcasts, or community presentations.
- 5 actionable external findings or questions triaged in public, with outcomes linked to the repository.
- 1 repeatable physical-YubiKey demonstration whose commands, logs, hardware, and limitations are published.
- 0 uncorrected production-readiness claims, false affiliations, or test-versus-production artifact ambiguities.

Treat stars, impressions, and page views as diagnostic signals rather than the primary goal.

## Research synthesis

### What the project can credibly own

The repository describes a coherent and differentiated design:

- A FIDO2-first, image-based Linux system with the YubiKey as the **owner-facing human-presence and identity root**.
- PIV/PKCS#11 for owner-controlled Secure Boot signing; FIDO2 `hmac-secret` for LUKS2 and home unlock; resident FIDO2 credentials for SSH; and pam-u2f for login and `sudo`.
- A read-only, verified `/usr`, signed unified kernel images, bootc/OCI delivery, digest-pinned inputs, build policy, provenance, SBOMs, and A/B recovery.
- ARM64 as the primary platform because it offers a plausible path to an owner-provisioned chain below the UKI; x86-64 remains supported above OEM firmware.
- A public threat model that distinguishes preventive controls, detection, proposed controls, and residual risk.
- An unusual mission: use AI heavily while designing a system that does not rely on trusting the author, human or machine.

### Why the timing works

Image-based and verifiable Linux is becoming a recognizable category rather than an obscure implementation detail:

- [bootc](https://github.com/bootc-dev/bootc) applies OCI/container-image transport and update mechanics to host operating systems.
- [Fedora Atomic Desktops](https://docs.fedoraproject.org/en-US/atomic-desktops/) present image-based, read-only desktop systems, and Fedora has published [sealed bootable container test images](https://fedoramagazine.org/sealed-atomic-desktops-test-images/) with a verified boot-chain story.
- [Amutable](https://amutable.com/blog/introducing-amutable) is publicly framing determinism and cryptographically verifiable integrity as a new Linux foundation.
- [SLSA v1.2](https://slsa.dev/spec/v1.2/) and [CISA Secure by Design](https://www.cisa.gov/securebydesign) give audiences an established vocabulary for provenance, transparency, and shifting security burden away from users.

This convergence validates the category but removes any basis for claiming that immutability, OCI delivery, or verified boot is unique. yubiOS must differentiate on **owner-held control, physical presence, the identity/platform split, and unusually explicit evidence boundaries**.

### Public whitespace

As of 2026-07-16, broad web discovery primarily surfaces the project’s own [GitHub repository](https://github.com/yubi-OS/yubiOS) and [GitHub Pages site](https://yubi-os.github.io/). That creates a clean opportunity to establish the category language before outside summaries harden around the ambiguous “No TPM” slogan.

### Reference and comparison map

These projects are references or adjacent alternatives, not targets for adversarial comparison.

| Project/category | Public center of gravity | yubiOS distinction to explain |
|---|---|---|
| [Qubes OS](https://www.qubes-os.org/) | Desktop security through compartmentalization | yubiOS centers boot integrity, owner-held credentials, and image delivery; it does not replace application compartmentalization. |
| [secureblue](https://secureblue.dev/) | Hardened Fedora Atomic desktop/server images | yubiOS centers an owner-held signing/unlock boundary and a planned owner-owned ARM64 platform chain. |
| [Fedora Atomic Desktops](https://fedoraproject.org/atomic-desktops/) | Image-based general-purpose desktops | yubiOS is a security thesis and integration project built on the same broader ecosystem, not a replacement for Fedora. |
| [Talos Linux](https://www.siderolabs.com/talos-linux) | Minimal, immutable, API-managed Kubernetes nodes | yubiOS targets owner-operated machines and physical-presence workflows rather than Kubernetes-only infrastructure. |
| [Amutable](https://amutable.com/) | Deterministic, verifiable Linux foundations | yubiOS adds an owner-held identity and secret-release constraint while building from many of the same systemd-era ideas. |

Never claim “first,” “only,” or “most secure.” The defensible language is “yubiOS explores,” “yubiOS is building,” or “the project combines.”

## Audience priorities

| Priority | Audience | What they care about | Desired action |
|---:|---|---|---|
| 1 | Linux boot, systemd, bootc, storage, and security engineers | Correct composition, reproducibility, failure behavior | Review the architecture, reproduce a proof, file precise issues |
| 1 | ARM64 firmware, TF-A, OP-TEE, U-Boot, and board engineers | Real-board feasibility, fuse/RPMB evidence, recovery | Help select and validate the first Path A board |
| 1 | YubiKey, FIDO2, PIV, and local-auth practitioners | Interface correctness, token policy, recovery, human presence | Review enrollment and hardware-in-the-loop flows |
| 2 | Open-source supply-chain practitioners | Pins, policy, provenance, SBOM verification, release separation | Audit the release path and contribute verification |
| 2 | Security-conscious owner-operators and homelab builders | Control, recoverability, transparent limits | Join a clearly labeled technical preview |
| 3 | Security and Linux press | A timely, evidenced change in how system trust is framed | Cover a milestone, not a promise |
| Later | Enterprise buyers and general consumers | Supportability, hardware matrix, lifecycle, guarantees | Wait until production gates and ownership model are defined |

## Positioning and message house

### Category

**FIDO2-first, owner-controlled, image-based Linux.**

### Core promise

**Put the owner back in the trust chain.**

### Supporting pillars

| Pillar | Message | Evidence to show |
|---|---|---|
| Owner-held control | The key that authorizes owner actions is held by the owner, not silently embedded in the board. | PIV signing demo, FIDO2 unlock demo, SSH resident key, required pam-u2f flow, recovery ceremony |
| Verifiable by structure | Trust is enforced through signed artifacts, verified OS content, pinned inputs, and auditable release metadata. | Signed UKI verification, dm-verity failure demo, pin policy, provenance/SBOM verification, production/dev separation test |
| Honest platform boundaries | Owner identity and platform integrity are different roots with different guarantees. | Path A/Path B matrix, x86-64 boundary, fTPM role, documented residual risks |
| Built in public | The project publishes decisions, threats, blockers, and failed runs instead of hiding them behind launch language. | ADRs, threat model, blocker register, dated CI evidence, corrections and retrospectives |
| AI-resilient systems using AI | The build process may include AI, but deployed authority is meant to come from cryptographic verification and owner-held keys. | Reproducible build evidence, review record, policy failures, signed artifacts; avoid implying that cryptography proves semantic safety |

### Narrative ladder

Use the level appropriate to the audience:

1. **Human:** “Your machine should ask for a key you control before it unlocks or accepts privileged identity.”
2. **Product:** “yubiOS uses an owner-held YubiKey across Secure Boot signing, disk and home unlock, SSH, and PAM.”
3. **Technical:** “PIV signs the UKI; FIDO2 `hmac-secret` gates LUKS2 without PCR-hash update lock-in; verified `/usr` and signed image delivery protect the operating-system content.”
4. **Platform:** “ARM64 Path A aims to extend owner control below the UKI through TF-A, OP-TEE, RPMB-backed state, fTPM measurement, and U-Boot; that path is not production-proven yet.”
5. **Social:** “Security defaults should not require an enterprise contract or an invisible vendor-controlled trust anchor.”

### Short descriptors

**12 words**

> FIDO2-first immutable Linux, built around keys the machine owner controls.

**30 words**

> yubiOS is an experimental, image-based Linux system that uses an owner-held YubiKey for signing, unlock, SSH, and local authentication while keeping platform measurement a separate, explicit trust boundary.

**Boilerplate**

> yubiOS is an independent open-source project building a FIDO2-first, image-based Linux operating system around owner-held trust. A YubiKey provides the owner-facing signing, unlock, SSH, and local-authentication boundary; signed boot artifacts, verified operating-system content, pinned build inputs, and auditable release metadata protect the system around it. ARM64 is the primary long-term platform for an owner-provisioned chain below the unified kernel image, while x86-64 remains supported above OEM firmware. yubiOS is pre-launch and publishes its decisions, evidence, blockers, and residual risks in the open.

**Independence line**

> yubiOS is an independent community project. It is not affiliated with, sponsored by, or endorsed by Yubico. YubiKey and Yubico are registered trademarks of Yubico AB.

Use Yubico’s [official brand assets and usage guidance](https://brandfolder.yubico.com/yubico/public) only after a name and trademark review. Do not imply a partnership, certification, compatibility endorsement, or review-unit relationship.

## Claim ledger

Every public claim must have an owner, evidence link, review date, and maturity label. Use this starter ledger.

| Topic | Approved wording now | Evidence | Do not say yet |
|---|---|---|---|
| Status | “Pre-launch,” “experimental,” “groundwork,” “technical preview” | [README.md](../README.md), [TODO.md]— (unfilled), [BLOCKERS.md](BLOCKERS.md) | “Production-ready,” “GA,” “safe for daily use” |
| YubiKey role | “Owner-facing human-presence and identity root” | [SPEC.md](SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md), [THREAT_MODEL.md](THREAT_MODEL.md) | “The only root of trust at every layer” |
| TPM stance | “No mandatory TPM for owner-facing disk unlock or identity workflows” | [ADR-003](ADR.md#adr-003-luks2--fido2-via-systemd-cryptenroll-no-tpm), [SPEC.md](SPEC.md) | Unqualified “No TPM” or “replaces every TPM function” |
| Secure Boot | “Designed to sign UKIs through YubiKey PIV slot 9c using PKCS#11” | [ADR-002](ADR.md#adr-002-secure-boot-signing-via-piv-ccid-not-fido2-hidraw), [sbsign validation note](../refs/sbsign-pkcs11-validate-2026-07-23.md) | “FIDO2 signs Secure Boot artifacts” or “production signing fully proven” |
| FIDO2 unlock | “Designed around FIDO2 `hmac-secret`, PIN, touch, and an offline recovery key” | [ADR-003](ADR.md#adr-003-luks2--fido2-via-systemd-cryptenroll-no-tpm), [LUKS/FIDO2 test note](../refs/luks-fido2-e2e-test-2026-07-23.md) | “Production hardware flow fully validated” until physical evidence exists |
| Immutable OS | “`/usr` is intended to be read-only and verified through composefs/erofs and dm-verity” | [SPEC.md](SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md) | “The whole system is immutable” or “runtime compromise is impossible” |
| ARM64 | “Primary target and planned owner-owned platform-root path” | [ADR-023](ADR.md#adr-023-arm64-as-primary-target-platform), [board status](../refs/arm64-path-a-b-board-status-2026-07-23.md) | “Production Path A is proven” |
| x86-64 | “Supported above the UKI; OEM firmware remains below the owner-controlled boundary” | [SPEC.md](SPEC.md), [THREAT_MODEL.md](THREAT_MODEL.md) | “No OEM trust on x86-64” |
| VM evidence | “The recorded ARM64 lane reached a Fedora guest; enrollment proof remained gated by a guest failure in that run” | [VM evidence](../refs/vm-e2e-run-29525332901.md) | “ARM64 end-to-end CI is green” without a newer verified run |
| Software authenticators | “TEST-only regression tools isolated to `dev` tags” | [ADR-026](ADR.md#adr-026-devdev-sha-test-image-tag-swu2f-enabled-on-0mniteckyubios), [CI_MAP.md](CI_MAP.md) | “Equivalent to a physical YubiKey” |
| Supply chain | “Builds are designed to use digest-pinned inputs, policy gates, provenance, and SBOM attestations” | [PINNED.md](../PINNED.md), [CI_MAP.md](CI_MAP.md), [MISSION.md](MISSION.md) | A SLSA level unless independently verified against the current specification |
| PQ TLS | “Current dependency floors are intended to preserve hybrid ML-KEM defaults, with CI drift checks” | [ADR-025](ADR.md#adr-025-post-quantum-hybrid-tls-x25519mlkem768-for-updateattestation-endpoints), [TODO.md]— (unfilled) | “Post-quantum secure” as a whole-product guarantee |
| Firmware inspection | “One-shot, warning-oriented first-boot inspection” | [ADR-024](ADR.md#adr-024-chipsec-first-boot-firmware-validation-as-a-portable-service), [MITIGATE.md](MITIGATE.md) | “CHIPSEC proves firmware is clean” |
| AI resilience | “Designed so deployed authority depends on verification rather than trust in an author” | [MISSION.md](MISSION.md), [THREAT_MODEL.md](THREAT_MODEL.md) | “AI cannot compromise yubiOS” or “verification proves the code is benign” |

## Readiness gates

### Gate 0: safe to amplify the repository

Complete before proactive outreach:

- [ ] Complete a name and trademark review for “yubiOS,” document independence from Yubico, and review logo use. This is a launch-risk check, not a legal conclusion.
- [ ] Reconcile the README and repository description with the claim ledger: remove or qualify “No TPM,” “sole root,” “at every layer,” and unqualified “ships” language.
- [ ] Put a destructive-install warning, supported-hardware matrix, backup requirement, and recovery link beside every public disk-write command.
- [ ] Confirm that public `latest`, immutable, `dev`, installer, and firmware tags match the documented classification.
- [ ] Publish a current release-evidence page linking the commit, build, tests, artifact digests, provenance, SBOM, and known gaps.

If any of the first five items are incomplete, remain in quiet community-research mode.

### Gate 1: build-in-public campaign

Required evidence:

- A reproducible build from a documented commit.
- A current CI summary that distinguishes green, failed, skipped, and non-blocking jobs.
- Verification that TEST-only authenticator tooling is absent from production tags.
- A public demo or log showing at least one signed-UKI or FIDO2 flow, with its trust level labeled.
- A current blocker list and a fast correction path for public factual errors.

Allowed language: “building,” “technical preview,” “seeking reviewers,” and “here is what is proven today.”

### Gate 2: physical-YubiKey technical preview

Required evidence:

- Physical YubiKey enrollment and unlock on named hardware.
- PIV-backed signing and independent signature verification.
- Lost-token and recovery-key rehearsal.
- Repeatable commands, logs, versions, and video from a clean install.
- A second person reproduces the flow without private coaching.

Allowed language: “hardware-backed technical preview on tested configurations.”

### Gate 3: flagship ARM64 launch

Required evidence:

- An exact Path A board and owner-provisioning record.
- ROTPK/fuse rehearsal and read-back evidence on sacrificial hardware.
- OP-TEE, RPMB-backed StandaloneMM variables, fTPM NV, U-Boot UEFI Secure Boot, and TCG2 evidence.
- The same signed UKI booted across the documented ARM64 and x86-64 paths.
- Recovery for failed provisioning, lost token, bad update, and failed Secure Boot enrollment.
- An external technical review and closure or explicit acceptance of high-severity findings.

Only after this gate should the campaign use “launch,” “release,” or production Path A language.

## Campaign architecture

### Wave 0: credibility foundation

Duration: 2–4 weeks, dependent on engineering.

Deliverables:

1. Fix Gate 0 repository hygiene and public claims.
2. Create a one-page evidence dashboard that maps claims to current artifacts and tests.
3. Record a five-minute architecture walkthrough using the identity-root/platform-root distinction.
4. Prepare a press kit with logo, project screenshots, diagrams, bios, FAQ, fact sheet, and independence notice.
5. Establish role-based press and security contacts plus a response rota.
6. Capture baseline search visibility, referral traffic, stars, forks, contributors, issue quality, and newsletter/community size.

No broad announcement in this wave.

### Wave 1: build in public

Duration: 4–8 weeks.

Theme: **“Here is the trust boundary; help us break the assumptions.”**

Publish a weekly evidence series, not a stream of generic project updates:

1. Why identity root and platform root are different.
2. Why PIV signs the UKI while FIDO2 unlocks the disk.
3. What FIDO2 unlock survives across updates—and what it does not attest.
4. How `dev` software-authenticator images are prevented from crossing into production.
5. What an ARM64 VM proves, and what only a real board can prove.
6. Recovery as a security property: backup key, lost token, and bad update.
7. What AI-resilient means without pretending that signatures make bad code safe.

Each post should contain one new artifact, one limitation, one specific request for help, and one canonical repository link.

### Wave 2: proof milestone

Trigger: Gate 2 passes.

Theme: **“One key, four owner workflows, one reproducible proof.”**

Package the physical-YubiKey demo as:

- A concise announcement with tested hardware and versions.
- A raw evidence bundle: logs, commands, signatures, digests, recovery outcome, and known gaps.
- A narrated demo showing PIV signing, FIDO2 unlock, SSH, and PAM without editing out failure handling.
- A technical explainer on why this does not eliminate every TPM, firmware, or runtime trust boundary.
- Targeted briefings to a small number of Linux and security outlets.

### Wave 3: ARM64 owner-root launch

Trigger: Gate 3 passes.

Theme: **“From a key in your hand to a chain below the kernel.”**

Lead with real-board evidence, not feature count. Publish the provisioning ceremony, fuse safety model, Path A/Path B comparison, independent review, recovery demonstration, and artifact verification before sending pitches.

## Channel plan

### Owned channels

| Channel | Role | Cadence |
|---|---|---|
| GitHub repository and releases | Canonical evidence and conversion point | Every material proof or release |
| Project site | Plain-language story, status, tested hardware, press kit | Update before each wave |
| Engineering notes under `refs/` | Dated evidence and corrections | Every substantial research/proof cycle |
| Short demo video | Make physical presence and recovery legible | Gate 2 and Gate 3 |
| Project mailing list or newsletter | Durable update channel independent of social algorithms | Monthly or milestone-only |
| Maintainer social accounts | Route people to canonical evidence and answer questions | Concentrated around proofs |

### Earned and community channels

Pitch only when the project has evidence appropriate to the outlet.

| Channel | Best angle | Timing and approach |
|---|---|---|
| [LWN](https://lwn.net/op/FAQ.lwn) | Deep technical architecture, systemd/bootc/FIDO2 composition, and upstream lessons | Submit a concise evidence-backed story tip after Gate 2; LWN asks that general story submissions use its central address rather than individual writers. |
| [Phoronix](https://www.phoronix.com/contact) | Named ARM64 hardware, boot results, performance or compatibility evidence | Send a news tip only when there is a reproducible hardware milestone. |
| [The Register](https://www.theregister.com/Profile/contact/) | Owner control versus vendor trust, AI-built/AI-resilient paradox, and honest limitations | Brief Linux/open-source or security staff at Gate 2 or Gate 3 with proof; their contact guidance explicitly values documents and screenshots. |
| [The New Stack](https://thenewstack.io/contributions/) | A timely argument about verifiable image-based Linux and owner-held identity | Pitch analysis with a reason it matters that week; its current guidance says it wants a point of view rather than a generic technical tutorial. |
| [Fedora Magazine](https://fedoramagazine.org/building-your-own-atomic-bootc-desktop/) | Practical bootc integration and lessons that benefit Fedora users | Coordinate with the Fedora/bootc community; make the article useful without requiring adoption of yubiOS. |
| [OpenSSF community](https://openssf.org/blog/2026/03/05/your-voice-belongs-here-how-to-get-involved-in-the-openssf-community/) | Production/test separation, pinned inputs, provenance verification, and AI-era contribution controls | Participate before pitching; offer a case study or tech talk, not a product announcement. |
| [Hacker News](https://news.ycombinator.com/newsguidelines.html) | A working demo and candid technical trade-offs | Use “Show HN” only after people can run or inspect something meaningful. Post in the maintainer’s own voice and stay available for the full discussion window. |
| bootc, systemd, Fedora, OP-TEE, TF-A, U-Boot, and FIDO communities | Upstream-relevant findings and review requests | Engage through their normal issue, discussion, mailing-list, or conference processes; never drop a cross-posted press release. |

Do not buy a mass press-release wire for the first campaign. The audience is narrow, proof-sensitive, and more likely to respond to a primary artifact or direct technical briefing.

## Pitch angles by maturity

| Angle | Hook | Minimum gate | Proof asset |
|---|---|---:|---|
| The key is the owner control plane | One physical token spans signing, unlock, SSH, and PAM without making a TPM the sole owner gate | 2 | Four-workflow demo plus recovery |
| Why immutable is not enough | Verified `/usr` still leaves firmware, writable state, update selection, and active sessions as real boundaries | 1 | Threat-model walkthrough and failure demo |
| AI-built, verification-first | AI can accelerate both building and poisoning; authority must come from controls beyond authorship | 1 | Policy/provenance evidence and an honest semantic-safety caveat |
| ARM64 lets owners reach below the UKI | Open board firmware paths offer an ownership story unavailable on ordinary x86 PCs | 3 | Named-board Path A proof and provisioning record |
| A failed CI run can be a useful artifact | Publishing what a VM proved and exactly where it stopped builds more trust than a green badge alone | 1 | Dated CI evidence, correction, and follow-up run |
| Security for a solo owner, not only a fleet | Hardware-backed control and verification should not require an enterprise relationship | 2 | Tested setup, cost disclosure, recovery, and usability notes |

## Press-kit checklist

- [ ] Project fact sheet with status, license, governance, tested platforms, and contact.
- [ ] 12-word, 30-word, and boilerplate descriptions from this document.
- [ ] High-resolution project logo plus documented license and source.
- [ ] Yubico independence and trademark notice.
- [ ] Architecture diagram showing owner identity root versus platform integrity root.
- [ ] Current claim ledger and evidence dashboard.
- [ ] Three screenshots: enrollment, verification output, and update/recovery status.
- [ ] Five-minute uncut demo and a 30-second silent clip for embedding.
- [ ] Maintainer bios that omit unnecessary personal contact details.
- [ ] FAQ, tested-hardware matrix, recovery guide, security policy, and contribution guide.
- [ ] Release manifest with commit, artifact digests, provenance, SBOM, test run, and known gaps.
- [ ] Captioned media and alt text for every visual.

## Draft outreach

### Technical media pitch

**Subject:** Evidence, not a launch claim: using one owner-held key across Linux signing and unlock

> yubiOS is an independent, pre-launch Linux project exploring a specific trust model: a YubiKey is the owner-facing gate for UKI signing, LUKS2 and home unlock, SSH, and PAM, while platform measurement remains a separate root with explicitly bounded guarantees. We have now reproduced **[milestone]** on **[named hardware]** and published the commands, logs, signatures, artifact digests, recovery result, threat model, and gaps at **[evidence URL]**. The interesting part is not another immutable distribution; it is the attempt to move owner authority out of an invisible board-bound root without pretending firmware or active-session risks disappear. If this fits your Linux/security coverage, we can provide a live demo and answer technical questions on the record.

Personalize the first two sentences for the recipient’s recent work. Never attach an unsolicited binary or write “just following up” more than once.

### Community post

**Suggested title:** Show HN: yubiOS—an experimental Linux trust chain built around an owner-held YubiKey

> We are building yubiOS to test a narrow idea: the credential that authorizes owner actions should live with the owner, while platform integrity should be measured and described separately. PIV signs the UKI; FIDO2 `hmac-secret` gates disk and home unlock; resident FIDO2 credentials cover SSH; pam-u2f covers local privilege. The OS side is image-based and intended to verify `/usr`. This is not production-ready, not affiliated with Yubico, and not a claim that firmware or runtime compromise disappears. Here is the current proof, the failed assumptions, and the blocker list: **[URL]**. We especially want review from **[two specific expertise areas]**.

## Interview and FAQ preparation

**Why not use a TPM?**

The project does use TPM/fTPM measurement where it is useful. It avoids making a board-bound TPM the sole owner-facing disk-unlock or identity gate. The YubiKey answers whether the owner is present; platform measurement answers what booted.

**Is yubiOS affiliated with Yubico?**

No. It is an independent open-source project. YubiKey and Yubico are Yubico trademarks. Do not suggest endorsement or certification.

**Is it production-ready?**

No. Use the current gate label and link the blocker register. State exactly which hardware and flows have been reproduced.

**What happens when the key is lost?**

Recovery material and backup-token enrollment are mandatory parts of the design. A campaign demo must show recovery, not merely describe it.

**Does a YubiKey prove that a safe OS requested the unlock secret?**

No. FIDO2 possession and interaction do not attest the requesting OS. That is why the enforced boot chain and honest firmware boundary matter.

**Does immutability stop all malware?**

No. It protects covered operating-system bytes and can make durable replacement harder. It does not protect mounted plaintext from sufficiently privileged malware in an active session or automatically secure writable state.

**Does provenance prove the artifact is safe?**

No. Provenance explains where, when, and how an artifact was produced. It supports verification and investigation; it does not make malicious source benign.

**Why ARM64 first?**

Selected ARM64 boards offer a plausible owner-provisioned firmware and secure-world path below the UKI. Ordinary x86-64 machines still depend on OEM firmware beneath the owner-controlled boundary.

**Why build an AI-resilient system using AI?**

Because authorship is not a sufficient trust primitive. The project is testing whether signed artifacts, verified content, explicit policy, public threat models, and owner-held keys can constrain authority even when contributors or tools are fallible. That is a design goal, not a claim of immunity.

## Launch runbook

### D-14 to D-8: evidence freeze

- Select the exact commit and artifacts under announcement.
- Run the proof from a clean environment and archive output.
- Have a second person reproduce it.
- Re-check every claim, link, tag, trademark notice, and recovery step.
- Capture current blockers and decide which are launch-stopping.

### D-7 to D-3: targeted briefings

- Offer no more than 3–5 tailored briefings.
- Give every recipient the same factual evidence and launch time.
- Maintain a question log and update the FAQ without changing the underlying claims.
- Prepare correction, security, and infrastructure incident responses.

### D-2 to D-1: go/no-go

- Confirm artifact availability, site health, contacts, moderation coverage, and demo hardware.
- Stop if a production/dev tag ambiguity, signing discrepancy, recovery failure, or trademark objection is unresolved.
- Pre-write launch, delay, and correction messages.

### D-day

- Publish the canonical evidence page first.
- Publish the project post and targeted community submissions second.
- Send pitches only after canonical links are live.
- Keep at least two technical responders available; log questions and corrections.
- Do not debate threat-model limits defensively. Link the evidence and acknowledge unknowns.

### D+1 to D+30

- Publish corrections immediately and visibly.
- Turn repeated questions into documentation.
- Triage external findings by boundary and severity.
- Report outcomes at D+7 and D+30, including failures and low-performing channels.
- Thank contributors with permission; do not turn unsolicited review into implied endorsement.

## Risk and response plan

| Risk | Prevention | Response |
|---|---|---|
| Project name or logo creates perceived Yubico affiliation | Trademark review, independence line, conservative asset use | Pause amplification, correct copy everywhere, cooperate on rename or asset changes if required |
| “No TPM” becomes the headline | Use the identity/platform split in headline and briefing | Correct promptly: no mandatory TPM for owner-facing unlock; TPM/fTPM may provide measurement |
| WIP image is treated as safe for daily use | Gate labels, hardware matrix, destructive-install warnings | Pin a warning, contact the outlet, correct the canonical page, document affected users |
| TEST-only authenticator reaches a production tag | Automated separation gates and release verification | Stop distribution, revoke/retag as appropriate, publish incident facts, rotate affected artifacts, investigate authority path |
| Security finding arrives during campaign | `SECURITY.md`, monitored role address, response owner | Acknowledge privately, triage, coordinate disclosure, pause scheduled claims that depend on the control |
| Demo fails or evidence cannot be reproduced | Clean-room rehearsal and backup hardware | Delay; publish only after root cause and new evidence are available |
| AI narrative overwhelms the technical work | Lead with owner control and proof; keep AI as a supporting angle | Redirect to artifacts and avoid culture-war framing |
| Personal data is amplified | Role-based contacts and removal of unnecessary personal details | Remove from canonical docs, request cache/search correction where practical, rotate exposed contact channels if needed |
| Community sees drive-by marketing | Participate upstream and ask narrow technical questions | Stop cross-posting, answer substantively, and return only with upstream-relevant evidence |

## Measurement

Create a weekly dashboard with these dimensions:

| Dimension | Metric | Why it matters |
|---|---|---|
| Qualified awareness | Relevant referring domains, technical article mentions, repeat visitors to evidence pages | Distinguishes useful discovery from empty reach |
| Contributor conversion | New issue authors, reviewers, reproductions, accepted changes, returning contributors | Measures whether the campaign improves the project |
| Hardware progress | Board offers, tested configurations, reproduced ceremonies, Path A evidence completed | Connects communications to the flagship blocker |
| Trust | Corrections, claim-ledger exceptions, response time, independent confirmations | Measures credibility directly |
| Release safety | Production/dev separation checks, provenance/SBOM verification, recovery success | Prevents campaign pressure from weakening release discipline |
| Community quality | Questions answered, actionable findings, upstream engagements, toxic/low-signal moderation load | Shows whether channel choice is sustainable |

Record the baseline before Wave 1. Use tagged links for channel attribution, but avoid invasive tracking. Review metrics at D+7, D+30, and D+90. Stop tactics that generate attention without qualified review or safe adoption.

## Ownership and approvals

Use roles rather than personal contact details:

| Role | Responsibility |
|---|---|
| Campaign owner | Timeline, asset completion, contact log, metrics |
| Technical spokesperson | Architecture, demos, interviews, final factual review |
| Security reviewer | Claim ledger, threat-boundary language, disclosure readiness |
| Release verifier | Artifact/tag/provenance/SBOM and test evidence |
| Community responder | Discussion coverage, contributor routing, moderation |
| Brand/legal reviewer | Name, trademark, licensing, privacy, endorsements |

The technical spokesperson and security reviewer must both approve any new security claim. The release verifier must approve any availability or artifact claim. Missing approval means delay, not softer wording invented at launch time.

## Internal source corpus reviewed

This strategy was synthesized from all 27 pre-existing Markdown files on `main` at commit `6ff2b98a17cc5ff7c2a2142aa2ca6f1bdbe33f4c`.

### Project sources of truth and operations

- [ADR.md](ADR.md)
- [AGENTS.md](../AGENTS.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [BLOCKERS.md](BLOCKERS.md)
- [CITATION.md](CITATION.md)
- [CI_MAP.md](CI_MAP.md)
- [FUTURE.md](FUTURE.md)
- [MAINTAINER.md](MAINTAINER.md)
- [MISSION.md](MISSION.md)
- [MITIGATE.md](MITIGATE.md)
- [ONBOARDING.md](ONBOARDING.md)
- [PINNED.md](../PINNED.md)
- [README.md](../README.md)
- [SPEC.md](SPEC.md)
- [THREAT_MODEL.md](THREAT_MODEL.md)
- [TODO.md]— (unfilled)

### Dated and task-specific evidence

- [refs/arm64-ftpm-phase-f0.md](../refs/arm64-ftpm-phase-f0-2026-07-23.md)
- [refs/bcvk-swtpm-ci.md](../refs/bcvk-swtpm-ci-2026-07-23.md)
- [refs/luks-fido2-e2e-test.md](../refs/luks-fido2-e2e-test-2026-07-23.md)
- [refs/path-a-b-board-status.md](../refs/arm64-path-a-b-board-status-2026-07-23.md)
- [refs/planning-cycle-2026-07-11.md](../refs/planning-cycle-2026-07-11.md)
- [refs/research-refresh-2026-07-11.md](../refs/research-refresh-2026-07-11.md)
- [refs/sbsign-pkcs11-validate.md](../refs/sbsign-pkcs11-validate-2026-07-23.md)
- [refs/systemd-v262-audit-2026-07-14.md](../refs/systemd-v262-audit-2026-07-14.md)
- [refs/v261-base-image.md](../refs/v261-base-image-bump-2026-07-23.md)
- [refs/vm-e2e-run-29525332901.md](../refs/vm-e2e-run-29525332901.md)
- [refs/zstd-efi-zboot-bcvk.md](../refs/arm64-zstd-efi-zboot-bcvk-2026-07-23.md)

## External research base

Prefer these primary or first-party sources when refreshing the campaign:

### Technical and category sources

- [YubiKey 5 FIDO documentation](https://docs.yubico.com/hardware/yubikey/yk-tech-manual/yk5-apps-fido.html)
- [Yubico official brand assets](https://brandfolder.yubico.com/yubico/public)
- [Yubico trademark notice](https://docs.yubico.com/hardware/yubikey/yk-tech-manual/copyright.html)
- [bootc upstream](https://github.com/bootc-dev/bootc)
- [Fedora/CentOS bootc documentation](https://docs.fedoraproject.org/en-US/bootc/)
- [Fedora Atomic Desktops documentation](https://docs.fedoraproject.org/en-US/atomic-desktops/)
- [Fedora sealed bootable container test images](https://fedoramagazine.org/sealed-atomic-desktops-test-images/)
- [Amutable introduction](https://amutable.com/blog/introducing-amutable)
- [SLSA v1.2 specification](https://slsa.dev/spec/v1.2/)
- [SLSA provenance](https://slsa.dev/spec/v1.2/provenance)
- [CISA Secure by Design](https://www.cisa.gov/securebydesign)
- [Qubes OS](https://www.qubes-os.org/)
- [secureblue](https://secureblue.dev/)
- [Talos Linux](https://www.siderolabs.com/talos-linux)

### Editorial and community guidance

- [LWN contact guidance](https://lwn.net/op/FAQ.lwn)
- [The Register editorial contacts](https://www.theregister.com/Profile/contact/)
- [The New Stack contribution guidance](https://thenewstack.io/contributions/)
- [Phoronix contact page](https://www.phoronix.com/contact)
- [OpenSSF community participation](https://openssf.org/blog/2026/03/05/your-voice-belongs-here-how-to-get-involved-in-the-openssf-community/)
- [Hacker News submission guidelines](https://news.ycombinator.com/newsguidelines.html)

Revalidate outlet staff, submission rules, technical versions, project readiness, and every external fact immediately before each campaign wave. Historical research is not a live claim source.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
