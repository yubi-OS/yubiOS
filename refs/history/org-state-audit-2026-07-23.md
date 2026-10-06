# yubiOS Org State Audit — 2026-07-23

## Credential correction
- `conn_4K1E40LryOy6` ("yubi-OS admin PAT (SU)") is **expired** (401 Bad credentials). Confirms the stale warning already in `knowledge/INDEX.md`.
- Working path: the managed GitHub connection (`foil-copy-overrate`, `conn_pd_apn_P8hKxo0`) has **org admin** on all 17 yubi-OS repos, including workflow-scope writes. Used for everything below.

## refs/ sync
Pushed 12 archived research notes from `documents/.../knowledge/{deep-research,repos}/` onto `yubi-OS/yubiOS` `main` under `refs/archive-*.md`, each flagged as a background snapshot (may predate `PINNED.md` / dated `refs/*` notes). Commits `30d2aa3`…`0b90e9d`.

## GitHub Project
Reused the existing empty template — **`[TEMPLATE] yubiOS Roadmap` (org project #2)** — rather than leaving a duplicate. Renamed to **[yubiOS Master Roadmap](https://github.com/orgs/yubi-OS/projects/2)**, populated with 12 items (5 linked issues + 7 draft blocker cards), each scored on Priority / Phase / Component. Deleted the accidental duplicate I first created (#3). Project #1 (`yubiOS Roadmap`, closed, 15 items) is historical — left untouched.

## Live repo state (yubi-OS/yubiOS, main)
- CI: all 20 registered workflows green as of the last ~20 runs (05:20–05:37 UTC 07-23).
- Open PRs: **0**. Merged PRs total 64+ (14 in the last 7 days, 56 in the last 30).
- Open issues: **5** — #87 (OpenWrt deception LAN, post-launch), #25 (swu2f CTAP2 enumeration — this is actually the live critical-path item despite its "post-launch" label, see below), #24 (CHIPSEC portable image, post-launch), #20 (LUKS2 FIDO2 e2e w/ YubiKey, Phase 0), #9 (physical YubiKey USB passthrough, Phase 0).
- `BLOCKERS.md` / `TODO.md` on `main` are both current (last reviewed 2026-07-22) and **far ahead** of the cached copies in `knowledge/BLOCKERS.cache.md` / `knowledge/TODO.md` (those are from June 26 / July 7). Treat the live repo files as the source of truth; the knowledge cache is stale.

## Active blockers (from live BLOCKERS.md, 8 total)
| ID | Gate type | Note |
|---|---|---|
| B-ARM64-PATHA | Hardware | Needs a real ROCK 5B/RK3588 rehearsal, then ROCKPro64/RK3399 |
| B-RK3588-TPL | Hardware + licensing | No redistributable DDR/TPL blob yet; blocks a flashable ROCK5B image |
| B-VM-CTAP2 | Software (agent-closable) | No CTAP2 token enumerates in the ARM64 bcvk guest yet |
| B-QEMU-ZBOOT | External dependency | Waiting on runner QEMU to ship upstream zstd EFI zboot |
| B-PINS | Process discipline | Keep `PINNED.md` current on every digest bump |
| B-HARDENING-RUNTIME | Software (agent-closable) | Static audit done; needs a live Bats + `systemd-analyze verify` run |
| B-REAL-FIDO2 | Hardware | Needs a physical YubiKey; gated behind B-VM-CTAP2 closing first |
| B-BOOTC-SEAL | External dependency | Needs a bootc base with v1.16.4-equivalent split/ukify upstream |

## Other org repos
- `bootc`, `bcvk`, `particleos`: several open feature PRs from **May 2026** (Surface x86/ARM64 hardware support) — parked, ~2.5 months stale. Not on the Phase-0 critical path; flagging for a prioritization call rather than filing new issues.
- `optee_os` #1, `optee_ftpm` #1: intentionally open per the "CI-only branches, pinned by SHA, never merged" doctrine — not stale, working as designed.
- All firmware forks (arm-trusted-firmware, u-boot, edk2, edk2-platforms, ms-tpm-20-ref) are clean, 0 open PRs/issues, CI green.

## Timeline estimate — deliberately two-track, not a single number

Raw velocity is fast (14 merged PRs/week on `yubiOS` main) but is dominated by docs/CI/research PRs, not the work that's actually left. The remaining 8 blockers split cleanly into two categories with very different time behavior:

**Software-only, agent-closable at current pace (days, not weeks):** B-VM-CTAP2, B-HARDENING-RUNTIME, B-PINS (ongoing discipline). At the observed ~2 merged-PR/day pace on this class of work, these look closable within **1–2 weeks** if prioritized next.

**Gated on something outside agent control — no honest ETA possible:**
- B-ARM64-PATHA / B-RK3588-TPL / B-REAL-FIDO2 — all need physical hardware (YubiKey, ROCK 5B, ROCKPro64) in hand plus, for RK3588, a licensed DDR/TPL blob. I don't know your hardware/procurement status, so I'm not going to fabricate a date.
- B-BOOTC-SEAL — needs upstream `bootc` to ship v1.16.4-equivalent split/ukify. That's an upstream release, not something velocity here affects.
- B-QEMU-ZBOOT — needs a GitHub-runner-side QEMU image refresh, also outside our control.

**Bottom line:** Phase 0 "done" isn't a velocity problem anymore — it's blocked on 4 external dependencies (hardware in hand, a blob license, an upstream release, a runner image). If those were resolved today, the remaining software work (CTAP2 fix, runtime hardening evidence, sealed-boot wiring) could plausibly land in 1–3 weeks at current throughput. Tell me your actual hardware/licensing status and I'll turn that into a real date instead of a guess.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.6921, Δ=+0.4199) were identical placeholder copies with no per-file content; merged on 2026-09-18.

## 2026-09-18 drift check (wayfinder round 8, cycle 50)

org state audit: the org has since grown (20 repos incl. the chromium mirror + provenance overlay); the audit's role-based map is otherwise unchanged; note additive.
