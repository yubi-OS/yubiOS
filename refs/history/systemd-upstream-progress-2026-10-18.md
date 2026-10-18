# Project-Relevant Upstream Progress — 2026-10-18

Status: dated 90-day activity snapshot; not a replacement for `PINNED.md`.

This refresh continues the July 21 review of the upstreams most directly coupled to yubiOS's systemd image, update, boot, and OCI delivery model: `systemd/systemd`, `systemd/mkosi`, `systemd/particleos`, `composefs/composefs` (the current repository location for the former `containers/composefs` URL), and `bootc-dev/bootc`.

![Bubble map of leading upstream contributors](https://raw.githubusercontent.com/yubi-OS/assets/main/upstream-contributor-bubbles.svg)

## Snapshot and method

The activity window is inclusive: 2026-07-21 00:00 UTC through 2026-10-18 23:59:59 UTC. Counts are authored, non-merge commits reachable from each default-branch snapshot. Obvious bot identities are excluded. Matching display names and unambiguous email aliases are aggregated across repositories. The sample counts commits, not review, design, issue triage, release engineering, influence, project health, or authority. Small-repository counts are sensitive to the window.

| Upstream | Snapshot commit as checked 2026-10-18 | Human non-merge commits in window |
|---|---|---:|
| [systemd/systemd](https://github.com/systemd/systemd) | [`de1e749daaa2`](https://github.com/systemd/systemd/tree/de1e749daaa2c6e8b6ab8cda2d16a9c61e979457) | 1,380 |
| [systemd/mkosi](https://github.com/systemd/mkosi) | [`131adaca5eb5`](https://github.com/systemd/mkosi/tree/131adaca5eb5f1551bc564ae4497ff940890a374) | 72 |
| [systemd/particleos](https://github.com/systemd/particleos) | [`e55d7a95e3b9`](https://github.com/systemd/particleos/tree/e55d7a95e3b9da8a2291ca17b7327b204f2c5a56) | 13 |
| [composefs/composefs](https://github.com/composefs/composefs) | [`ec2573a0f68f`](https://github.com/composefs/composefs/tree/ec2573a0f68f548ae91f3e10acc990a08f9122dc) | 1 |
| [bootc-dev/bootc](https://github.com/bootc-dev/bootc) | [`de7ae55a1c85`](https://github.com/bootc-dev/bootc/tree/de7ae55a1c859df999a8d9ccc5eee32372f4c6f0) | 172 |

The collection returned 2,033 commits before window, merge, and bot exclusions. The retained five-repository total is 1,638 authored human non-merge commits: systemd 1,380; mkosi 72; particleos 13; composefs 1; bootc 172. These counts use authored timestamps; collection queries were widened around the target window to account for author/committer date differences, then filtered to the exact author-date window.

The map shows the 15 highest aggregate contributors. Circle area, not radius, scales with commit count. The color shows each contributor's dominant upstream in this sample. The composefs upstream has little direct commit activity in the period; composefs integration work appears in bootc as well.

| Rank | Contributor | Aggregate commits | Distribution in this review |
|---:|---|---:|---|
| 1 | Zbigniew Jędrzejewski-Szmek | 257 | 256 systemd/systemd; 1 systemd/mkosi |
| 2 | Yu Watanabe | 244 | 243 systemd/systemd; 1 systemd/mkosi |
| 3 | Daan De Meyer | 135 | 132 systemd/systemd; 3 systemd/mkosi |
| 4 | Lennart Poettering | 104 | 104 systemd/systemd |
| 5 | Luca Boccassi | 72 | 60 systemd/systemd; 11 systemd/mkosi; 1 systemd/particleos |
| 6 | Colin Walters | 64 | 1 composefs/composefs; 63 bootc-dev/bootc |
| 7 | dongshengyuan | 60 | 60 systemd/systemd |
| 8 | Martin Pitt | 45 | 33 systemd/systemd; 1 systemd/mkosi; 11 systemd/particleos |
| 9 | Pragyan Poudyal | 43 | 43 bootc-dev/bootc |
| 10 | Jörg Behrmann | 41 | 8 systemd/systemd; 33 systemd/mkosi |
| 11 | Paul Meyer | 35 | 34 systemd/systemd; 1 systemd/mkosi |
| 12 | Ivan Kruglov | 28 | 27 systemd/systemd; 1 systemd/mkosi |
| 13 | Armaan Sandhu | 23 | 23 systemd/systemd |
| 14 | Christian Brauner | 18 | 18 systemd/systemd |
| 15 | Siteshwar Vashisht | 18 | 18 systemd/systemd |

## What changed upstream since the July snapshot

- **systemd v262 shipped September 22.** Its release closes the milestone tracked in the July research. Compatibility checks should account for the sysupdate service/timer rename, TPM-sealed credential compatibility, cryptenroll changes, and the release's combined LUKS plus Verity support. The current main branch subsequently added enforcement of `user.validatefs.*` constraints when mounting DDIs, with systemd-dissect validation tests. [v262 release](https://github.com/systemd/systemd/releases/tag/v262) · [DDI validation change](https://github.com/systemd/systemd/commit/e276965280b70a5af3a963ebf8c5a889991c00cb)
- **bootc advanced its composefs and installation paths.** It now tests switching to a zstd:chunked image after the composefs-rs decoder fix; install-to-disk work uses systemd-repart when definitions are present; and Secure Boot signing layers use the public certificate in their cache key so cached signatures cannot survive key rotation. [zstd:chunked test](https://github.com/bootc-dev/bootc/commit/4c8765cf72484351bdb2661f8eb7b26465f9de0e) · [systemd-repart install](https://github.com/bootc-dev/bootc/commit/4866f979915c22b3dfd6f7909c1b77b4c6d07778) · [signing cache key](https://github.com/bootc-dev/bootc/commit/c363b451c6e71f53e8fa71a7aa87ec47e02eed2e)
- **mkosi's latest snapshot is October 16.** The main repository has continued changes around repart definitions for extension and portable images; the default-branch tip is `131adaca5eb5`. [Snapshot](https://github.com/systemd/mkosi/commit/131adaca5eb5f1551bc564ae4497ff940890a374)
- **particleos remains lower-volume.** Its latest default-branch commit in this snapshot replaces the deprecated Evince package with Papers. [Commit](https://github.com/systemd/particleos/commit/e55d7a95e3b9da8a2291ca17b7327b204f2c5a56)
- **composefs direct activity is low in the window.** One human non-merge commit was counted on its current default branch. Treat that as a statement about this commit sample, not the project's health or importance.

## Relevance to yubiOS

- Check pinned systemd and its target release compatibility for the v262 sysupdate naming and TPM-sealed credential changes; do not infer runtime behavior from upstream main.
- Add or retain DDI validation coverage if yubiOS images carry `user.validatefs.*` xattrs.
- Keep the bootc zstd:chunked and systemd-repart changes behind tests against yubiOS's pinned bootc version.
- Preserve certificate-keyed Secure Boot build cache behavior in the yubiOS build path and verify it after signing-key rotation.

## Source lineage

The previous snapshot and its July 21 evidence remain preserved at [`refs/history/systemd-upstream-progress-2026-07-21.md`](https://github.com/yubi-OS/yubiOS/blob/main/refs/history/systemd-upstream-progress-2026-07-21.md). The refreshed contributor SVG is in [`yubi-OS/assets`](https://github.com/yubi-OS/assets/blob/main/upstream-contributor-bubbles.svg).
