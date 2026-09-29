# jev-Weighted refs/ Refresh Sweep: 2026-09-29

Date: 2026-09-29. Source: ideate-solo one-pager (session/refs-refresh-jev-weighted-solo-2026-09-29.md), executed as a PR-scoped batch. Process spec: this file + the research DB under `papers/data/refs-refresh-2026-09-29/`.

## Process

1. **Enumerate + signal.** All 234 `refs/*.md` on main; per-file age (filename date), size, title, presence of Verification / Recommendation sections.
2. **jev triage.** Every doc scored by typesafe/jev-1.13 via the steady-orbit worker `POST /api/decide` (noul: "does this doc need a deep-research refresh because upstream reality moved"), batched 5 docs per request, paced under the 15/min/IP cap: 47 requests.
3. **Dig.** Top 12 by blended rank (0.7*jev + 0.3*age_norm) dug via searXNG (Northflank instance, reached through the n8n `searxng-proxy` webhook because the searxng port is internal-only): 2 queries per doc, top 6 results kept: 24 digs, 144 results.
4. **jev collection-quality weighting.** Every result weighted by jev (noul: "high-quality authoritative source worth citing"), batched 5 per request: 31 requests.
5. **Persist.** All responses (per-doc signals, jev verdicts with task_ids and costs, dig results with quality weights) committed as a typed research DB on this branch.

## Run stats

- Docs scored: 234/234. Results weighted: 144/144. jev calls: ~81. Total jev spend: $0.045256.
- noul distribution: min 0.11, median 0.4, max 0.79 (mean 0.417).
- **Honest finding:** no doc crossed jev 0.8; the model reads most of the corpus as durable process/policy/history content. The 0-docs-over-0.8 result means age is the binding triage signal and jev is the ranker, not the gate. Per the stress-test in the solo one-pager, jev stays in its highest-value seat: collection-quality weighting (below), where its verdicts visibly differ between upstream primary sources and aggregators.

## Refresh queue (top 12)

Rank order: 0.7*jev_needs_refresh + 0.3*age_norm. Each row shows the dig summary; full per-result weights in `papers/data/refs-refresh-2026-09-29/digs/`.

### 1. systemd-v262-audit-2026-07-14.md (jev 0.79, 77d old)

- Dig quality: avg 0.48, 4/12 results rated primary-quality (noul >= 0.8).
- Query `systemd v263 release changelog 2026`:
  - (0.00) Releases · systemd/systemd - GitHub : https://github.com/systemd/systemd/releases
  - (0.00) systemd 262 Released with Static PID 1, Intel TDX, TPM ... : https://www.linuxjournal.com/content/systemd-262-released-static-pid-1-intel-tdx-tpm-improvements-and-new-container-features
  - (0.00) v263 · Milestone #40 · systemd/systemd - GitHub : https://github.com/systemd/systemd/milestone/40
- Query `systemd release notes new features 2026`:
  - (0.00) systemd 262 Released with Static PID 1, Intel TDX, TPM ... : https://www.linuxjournal.com/content/systemd-262-released-static-pid-1-intel-tdx-tpm-improvements-and-new-container-features
  - (0.00) systemd 262 Released With AI/LLM Canary For Unreviewed Code ... : https://www.phoronix.com/news/systemd-262
  - (0.00) Releases · systemd/systemd - GitHub : https://github.com/systemd/systemd/releases

### 2. systemd-upstream-progress-2026-07-21.md (jev 0.79, 70d old)

- Dig quality: avg 0.45, 4/12 results rated primary-quality (noul >= 0.8).
- Query `systemd upstream development news September 2026`:
  - (0.00) systemd 262 Released with Static PID 1, Intel TDX, TPM ... : https://www.linuxjournal.com/content/systemd-262-released-static-pid-1-intel-tdx-tpm-improvements-and-new-container-features
  - (0.00) Tux Machines — Debian-Based and systemd-Free antiX Linux 26.1 ... : http://news.tuxmachines.org/n/2026/09/29/Debian_Based_and_systemd_Free_antiX_Linux_26_1_Released_with_Up.shtml
  - (0.00) Announcing Linux on Snapdragon X2 Series Early Developer Preview : https://www.qualcomm.com/developer/blog/2026/09/announcing-linux-on-snapdragon-x2-series-early-developer-preview
- Query `systemd github recent merged features 2026`:
  - (0.00) Releases · systemd/systemd - GitHub : https://github.com/systemd/systemd/releases
  - (0.00) systemd 261-rc3 Released With Individual Binaries Now Embedding ... : https://www.phoronix.com/news/systemd-261-rc3
  - (0.00) The systemd System and Service Manager - GitHub : https://github.com/systemd/systemd

### 3. bootc-dev-org-releases-2026-07-23.md (jev 0.78, 68d old)

- Dig quality: avg 0.56, 2/12 results rated primary-quality (noul >= 0.8).
- Query `bootc release changelog 2026`:
  - (0.00) Releases · bootc-dev/bootc - GitHub : https://github.com/bootc-dev/bootc/releases/
  - (0.00) bootc : https://bootc.dev/
  - (0.00) May 12, 2026—KB5087539(OS Build 26100.32860) : https://support.microsoft.com/en-us/servicing/os/windows-server/2026/05/may-12-2026-kb5087539-os-build-26100-32860
- Query `bootc containers org latest release`:
  - (0.00) GitHub - bootc-dev/bootc: Boot and upgrade via container images : https://github.com/bootc-dev/bootc
  - (0.00) Getting Started with Bootable Containers - Fedora Docs : https://docs.fedoraproject.org/en-US/bootc/getting-started/
  - (0.00) dev-bootc versions - GitHub : https://github.com/orgs/bootc-dev/packages/container/dev-bootc/684109743?tag=fedora-43-uki

### 4. arm64-rk-board-status-2026-07-17.md (jev 0.74, 74d old)

- Dig quality: avg 0.30, 1/12 results rated primary-quality (noul >= 0.8).
- Query `RK3588 mainline linux kernel support status 2026`:
  - (0.00) Mainline video capture and camera support for Rockchip RK3588 : https://www.collabora.com/news-and-blog/news-and-events/mainline-video-capture-and-camera-support-for-rockchip-rk3588.html
  - (0.00) Rockchip RK3588 and RK3576 H.264 and H.265 video decoders ... : https://www.cnx-software.com/2026/02/27/rockchip-rk3588-rk3576-h-264-and-h-265-video-decoders-mainline-linux/
  - (0.00) Kernel & Embedded News: slab_tiny Targets 7.4 - TECH VEDA : https://www.techveda.live/2026/09/29/slab-tiny-boot-option/
- Query `Rockchip RK3588 upstream bootloader status 2026`:
  - (0.00) Secure Boot on Rockchip RK3588 - Pengutronix : https://pengutronix.de/en/blog/2026-06-19-rk3588-secure-boot.html
  - (0.00) Kernel & Embedded News: slab_tiny Targets 7.4 - TECH VEDA : https://www.techveda.live/2026/09/29/slab-tiny-boot-option/
  - (0.00) Mainline video capture and camera support for Rockchip RK3588 : https://www.collabora.com/news-and-blog/news-and-events/mainline-video-capture-and-camera-support-for-rockchip-rk3588.html

### 5. fedora-bootc-base-images-status-2026-07-23.md (jev 0.73, 68d old)

- Dig quality: avg 0.32, 2/12 results rated primary-quality (noul >= 0.8).
- Query `fedora bootc base images quay.io 2026`:
  - (0.00) Base images - Fedora Docs : https://docs.fedoraproject.org/en-US/bootc/base-images/
  - (0.00) Building a hardened, image-based foundation for AI agents - Red Hat : https://www.redhat.com/en/blog/building-hardened-image-based-foundation-ai-agents
  - (0.00) Taking the Hummingbird model to the full operating system : https://fedoramagazine.org/fedora-hummingbird-linux-taking-the-hummingbird-model-to-the-full-os/
- Query `centos stream bootc image tiers 2026`:
  - (0.00) CentOS Connect 2026 : https://www.centos.org/events/connect-2026/
  - (0.00) Bootc - Boot with custom kernel - Fedora Discussion : https://discussion.fedoraproject.org/t/bootc-boot-with-custom-kernel/138470
  - (0.00) Taking the Hummingbird model to the full operating system : https://fedoramagazine.org/fedora-hummingbird-linux-taking-the-hummingbird-model-to-the-full-os/

### 6. mkosi-bcvk-fork-status-2026-07-23.md (jev 0.71, 68d old)

- Dig quality: avg 0.37, 1/12 results rated primary-quality (noul >= 0.8).
- Query `mkosi v28 release changelog 2026`:
  - (0.00) Appendix B. Release Notes - NixOS : https://nixos.org/manual/nixos/stable/release-notes
  - (0.00) Bitcoin Core 28.0 : https://bitcoincore.org/en/releases/28.0/
  - (0.00) Longitudinal Analysis of Flavored Cigar Use and Cigar Smoking ... : https://academic.oup.com/ntr/article/26/7/816/7492742
- Query `mkosi systemd image builder release 2026`:
  - (0.00) systemd/mkosi: Build Bespoke OS Images - GitHub : https://github.com/systemd/mkosi
  - (0.00) mkosi - ArchWiki : https://wiki.archlinux.org/title/Mkosi
  - (0.00) Building an image-based Debian 13 disk image using mkosi : https://jasminchen.dev/notes/2026/experimenting-with-mkosi-and-debian/

### 7. arm64-path-a-b-board-status-2026-07-23.md (jev 0.70, 68d old)

- Dig quality: avg 0.47, 0/12 results rated primary-quality (noul >= 0.8).
- Query `RK3588 U-Boot OP-TEE mainline support 2026`:
  - (0.00) Secure Boot on Rockchip RK3588 - Pengutronix : https://pengutronix.de/en/blog/2026-06-19-rk3588-secure-boot.html
  - (0.00) Schedule - Embedded Recipes : https://embedded-recipes.org/2026/schedule/
  - (0.00) Rockchip RK3588 mainline Linux support - Current status and future ... : https://www.cnx-software.com/2024/12/21/rockchip-rk3588-mainline-linux-support-current-status-and-future-work-for-2025/
- Query `rockchip arm64 secure boot TF-A 2026`:
  - (0.00) schneid-l/u-boot-rockchip - GitHub : https://github.com/schneid-l/u-boot-rockchip
  - (0.00) 7.40. Rockchip SoCs — Trusted Firmware-A 2.15.0 documentation : https://trustedfirmware-a.readthedocs.io/en/stable/plat/rockchip.html
  - (0.00) DRTM on ARM - TrenchBoot : https://trenchboot.org/blueprints/DRTM_On_ARM/

### 8. post-quantum-tls-adoption-2026-07-23.md (jev 0.70, 68d old)

- Dig quality: avg 0.55, 6/12 results rated primary-quality (noul >= 0.8).
- Query `X25519MLKEM768 TLS adoption statistics 2026`:
  - (0.00) Post-Quantum TLS Finished the Easy Half : https://cacm.acm.org/news/post-quantum-tls-finished-the-easy-half/
  - (0.00) 2026 State of PQC on the Web | F5 Labs : https://www.f5.com/labs/articles/2026-state-of-pqc-on-the-web
  - (0.00) Is your domain using post-quantum encryption? Now you can see ... : https://blog.cloudflare.com/post-quantum-visibility/
- Query `post-quantum TLS deployment Cloudflare Google 2026`:
  - (0.00) PQC in Plaintext: Google Cloud's post-quantum cryptography roadmap : https://cloud.google.com/blog/products/identity-security/pqc-in-plaintext-google-clouds-post-quantum-cryptography-roadmap
  - (0.00) Is your domain using post-quantum encryption? Now you can see ... : https://blog.cloudflare.com/post-quantum-visibility/
  - (0.00) Post-Quantum TLS Finished the Easy Half : https://cacm.acm.org/news/post-quantum-tls-finished-the-easy-half/

### 9. osbuild-image-builder-2026-07-23.md (jev 0.68, 68d old)

- Dig quality: avg 0.70, 7/12 results rated primary-quality (noul >= 0.8).
- Query `osbuild image builder release 2026`:
  - (0.00) Releases - Image Builder : https://osbuild.org/docs/on-premises/overview/release-overview/
  - (0.00) RHSA-2026:71543 - Security Advisory - Red Hat Customer Portal : https://access.redhat.com/errata/RHSA-2026:71543
  - (0.00) RHEL 10 : image-builder (RHSA-2026:67139) | Tenable® : https://www.tenable.com/plugins/nessus/345586
- Query `fedora osbuild bootc image mode 2026`:
  - (0.00) Migration | Image Builder : https://osbuild.org/docs/bootc/
  - (0.00) Deprecation notice — bootc-image-builder : https://osbuild.org/docs/bootc/deprecation-notice/
  - (0.00) ublue-os/bootc-image-builder-action - GitHub : https://github.com/ublue-os/bootc-image-builder-action

### 10. endlessh-openwrt-fit-2026-07-17.md (jev 0.64, 74d old)

- Dig quality: avg 0.23, 0/12 results rated primary-quality (noul >= 0.8).
- Query `endlessh openwrt package status 2026`:
  - (0.00) Vulnerability Summary for the Week of September 21, 2026 - CISA : https://www.cisa.gov/news-events/bulletins/sb26-271
  - (0.00) We built our entire startup infra on FreeBSD in 2026. Now ... - Reddit : https://www.reddit.com/r/freebsd/comments/1r7mp9n/we_built_our_entire_startup_infra_on_freebsd_in/
  - (0.00) NethSecurity - DistroWatch.com : https://distrowatch.com/nethsecurity
- Query `ssh tarpit endlessh alternatives 2026`:
  - (0.00) an awesome list of honeypot resources - GitHub : https://github.com/paralax/awesome-honeypots
  - (0.00) SSX: Execute remote commands from an SSHFS mount - Ziggit : https://ziggit.dev/t/ssx-execute-remote-commands-from-an-sshfs-mount/15123
  - (0.00) Articles from CrowdSec : https://www.crowdsec.net/blog/author/crowdsec

### 11. frost-panfrost-lockout-2026-07-17.md (jev 0.64, 74d old)

- Dig quality: avg 0.45, 0/12 results rated primary-quality (noul >= 0.8).
- Query `panfrost DRM device memory cgroup 2026`:
  - (0.00) Security update for the Linux Kernel | SUSE Support : https://www.suse.com/support/update/announcement/2026/suse-su-20262238-1/
  - (0.00) Kernel 7.1: Graphics, Rust, and SoC Improvements - Collabora : https://www.collabora.com/news-and-blog/news-and-events/kernel-7.1-graphics,-rust,-and-soc-improvements.html
  - (0.00) On Stock firmware, after apt upgrade, webcam and HDMI ... : https://forum.sovol3d.com/t/on-stock-firmware-after-apt-upgrade-webcam-and-hdmi-touchscreen-stop-working/9655
- Query `Mali GPU memory cgroup kernel mainline 2026`:
  - (0.00) Linux_6.19 - Linux Kernel Newbies : https://kernelnewbies.org/Linux_6.19
  - (0.00) Linux Plumbers Conference 2025 (11-13 December 2025) · Indico : https://lpc.events/event/19/timetable/?view=standard
  - (0.00) Release Notes | SUSE Linux Enterprise Server 15 SP2 : https://documentation.suse.com/releasenotes/sles/html/releasenotes_sles_15-SP2/index.html

### 12. systemd-hardening-audit-2026-07-17.md (jev 0.64, 74d old)

- Dig quality: avg 0.33, 1/12 results rated primary-quality (noul >= 0.8).
- Query `systemd sandboxing directives new 2026`:
  - (0.00) systemd/Sandboxing - ArchWiki : https://wiki.archlinux.org/title/Systemd/Sandboxing
  - (0.00) Changes/SystemdSecurityHardening - Fedora Project Wiki : https://fedoraproject.org/wiki/Changes/SystemdSecurityHardening
  - (0.00) AI Sandbox: The Complete Guide to Sandboxing AI Agents in 2026 : https://cosmonic.com/blog/ai-sandbox-guide/
- Query `systemd service hardening systemd-analyze 2026`:
  - (0.00) How to Configure systemd Service Hardening on Ubuntu - OneUptime : https://oneuptime.com/blog/post/2026-03-02-how-to-configure-systemd-service-hardening-on-ubuntu/view
  - (0.00) Harden Linux Services with `systemd-analyze security`: From Score ... : https://dev.to/lyraalishaikh/harden-linux-services-with-systemd-analyze-security-from-score-to-enforceable-policy-3045
  - (0.00) alegrey91/systemd-service-hardening: Basic guide to ... - GitHub : https://github.com/alegrey91/systemd-service-hardening

## Research DB

- `papers/data/refs-refresh-2026-09-29/archive.json`: all 234 rows (signals + jev verdicts + task_ids + per-call cost).
- `papers/data/refs-refresh-2026-09-29/digs/<doc>.json`: 12 files, every result with its jev quality weight.
- `papers/data/refs-refresh-2026-09-29/db.ts`: typed index (RefDoc / SearchResult / Dig / DocDig) + run constants.

## Verification

- Every jev row carries task_id + consumed cost; re-auditable at the provider.
- searXNG route is read-only (public n8n webhook GET to the internal instance); no network state was changed (searxng port stays internal-only).
- No existing refs/ doc was edited on this PR; refresh edits are follow-up PRs so the DB stays reviewable in isolation.

## Not Doing

- Flipping searxng public: network change without approval (RULES). The n8n proxy covers the need.
- Refreshing all 234 docs in one PR: unreviewable. The queue above is the bounded dig set.
- RSI cycles on the corpus: repo-refs-skill already spent its 3-cycle cap.

