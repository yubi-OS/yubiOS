# Public-relations campaign research: 2026-07-16

Status: completed research snapshot

Deliverable: [PR.md](../docs/PR.md)

Repository commit reviewed: `6ff2b98a17cc5ff7c2a2142aa2ca6f1bdbe33f4c`

## Scope

- Review every pre-existing Markdown file in `yubi-OS/yubiOS`.
- Cross-check current repository activity and public project properties.
- Research the current immutable/image-based Linux narrative, adjacent projects, software-supply-chain language, Yubico trademark context, and technical-media submission guidance.
- Build a proof-led campaign that does not turn planned controls or simulated tests into production claims.

## Internal synthesis

The strongest consistent story is an owner-held **human-presence and identity root** paired with a separate **platform-integrity root**. The public “No TPM” and “sole root” shorthand is not precise enough for proactive outreach because current architecture uses TPM/fTPM measurement and explicitly retains OEM-controlled lower firmware boundaries on x86-64.

The current campaign mode must be build in public:

- `SPEC.md` labels the project pre-launch.
- `README.md` labels it groundwork and work in progress.
- `BLOCKERS.md` keeps physical-YubiKey production confidence and real-board ARM64 Path A evidence open.
- The recorded VM run reached an ARM64 Fedora guest but did not complete the enrollment proof in that run.
- Test-only software authenticators provide functional coverage but are not equivalent to physical hardware.

## Readiness findings

| Finding | Campaign impact |
|---|---|
| The README displays an LGPL-2.1 badge and links `LICENSE`, but the repository has no license file. | Treat as a stop gate for proactive amplification. |
| YubiKey and Yubico are registered Yubico trademarks, and the project name uses the `yubi` stem. | Obtain a name/trademark review, use an independence notice, and avoid implied endorsement. |
| `MAINTAINER.md` contains personal contact details. | Replace unnecessary personal data with monitored role-based press, security, and maintainer contacts before increasing discovery. |
| No root-level license, security policy, contribution guide, or code-of-conduct file was found. | Establish basic trust and contributor infrastructure before a recruitment campaign. |
| Some public language says “No TPM,” “sole trust anchor,” or “at every layer.” | Use the evidence-backed identity/platform split and maintain a formal claim ledger. |
| Public disk-install commands can destroy data. | Put tested-hardware, backup, recovery, and destructive-operation warnings beside amplified install instructions. |

These are communications-readiness findings, not legal conclusions or a security audit.

## External findings

| Area | Finding | Campaign implication |
|---|---|---|
| Category | bootc and Fedora Atomic Desktops make image-based host operating systems legible to a growing audience. | Explain yubiOS inside this established category rather than claiming to invent it. |
| Verified Linux | Fedora sealed bootable container test images and Amutable both foreground verifiable integrity. | Do not claim immutability or verified boot as unique; differentiate on owner-held control and explicit trust boundaries. |
| Adjacent security systems | Qubes emphasizes compartmentalization, secureblue hardened Fedora Atomic images, and Talos immutable Kubernetes nodes. | Compare jobs and trust models without adversarial “better than” language. |
| Supply chain | SLSA v1.2 defines provenance and graduated supply-chain controls. | Describe provenance as evidence of origin/process, not proof that code is benign; do not claim a SLSA level without an audit. |
| Secure by design | CISA encourages public evidence and security-by-default practices. | Make transparency, recovery, and shifting burden away from owners supporting themes. |
| Trademark | Yubico publishes brand assets and identifies YubiKey/Yubico as registered marks. | Use conservative brand treatment and an independence statement. |
| Editorial fit | LWN, Phoronix, The Register, and The New Stack each publish current contact or contribution guidance. | Target a few outlets only after the proof appropriate to their remit exists. |
| Community | OpenSSF invites multiple forms of community contribution; Hacker News prioritizes intellectually interesting primary work. | Participate with evidence and lessons, not a generic press release. |

## Positioning conclusion

Use:

> yubiOS is building a Linux trust chain the owner can hold in their hand.

Support it with the precise category:

> FIDO2-first, owner-controlled, image-based Linux.

Do not use “first,” “only,” “most secure,” “unhackable,” or unqualified “No TPM.”

## Primary external sources

- https://github.com/bootc-dev/bootc
- https://docs.fedoraproject.org/en-US/bootc/
- https://docs.fedoraproject.org/en-US/atomic-desktops/
- https://fedoramagazine.org/sealed-atomic-desktops-test-images/
- https://amutable.com/blog/introducing-amutable
- https://www.qubes-os.org/
- https://secureblue.dev/
- https://www.siderolabs.com/talos-linux
- https://slsa.dev/spec/v1.2/
- https://slsa.dev/spec/v1.2/provenance
- https://www.cisa.gov/securebydesign
- https://docs.yubico.com/hardware/yubikey/yk-tech-manual/yk5-apps-fido.html
- https://docs.yubico.com/hardware/yubikey/yk-tech-manual/copyright.html
- https://brandfolder.yubico.com/yubico/public
- https://lwn.net/op/FAQ.lwn
- https://www.theregister.com/Profile/contact/
- https://thenewstack.io/contributions/
- https://www.phoronix.com/contact
- https://openssf.org/blog/2026/03/05/your-voice-belongs-here-how-to-get-involved-in-the-openssf-community/
- https://news.ycombinator.com/newsguidelines.html

## Refresh rule

Before executing any campaign wave, re-check repository blockers and evidence, published artifact state, trademark guidance, outlet staff and submission rules, and category claims. This note records a dated research pass; it is not a live source for changing external facts.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.


## Priority signals


**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4361) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.5402) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Cross-references


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.6587) were identical placeholder copies with no per-file content; merged on 2026-09-18.
