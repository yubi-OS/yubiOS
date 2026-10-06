# Build toolchain status: mkosi, bcvk, reproducibility (2026-10-03)

Date: 2026-10-03. Family: toolchain status record. Joins the drift check at
`refs/arm64-rk-board-status-drift-check-2026-09-18.md` by pinning the build-toolchain side of the
same hardware program, next to the fork-status and reproducibility records it extends
(`refs/mkosi-bcvk-fork-status-2026-07-23.md`, `refs/reproducible-builds-2026-07-22.md`).

## mkosi fork state

The mkosi fork stays pinned at its source commit per `PINNED.md`; `mkosi.conf` carries
`MinimumVersion=26~devel`, which inherits the upstream v26+ reproducibility fixes (upstream PRs
#1834, #1837, #1982, #2163). No re-pin this cycle.

## Reproducibility infrastructure

`scripts/lib/reproducible-build.sh` derives `SOURCE_DATE_EPOCH` from the commit and
`YUBIOS_MKOSI_SEED` via sha256, propagating both into the Containerfile ARG, the
`yubiOS-bake.hcl` HCL variables, and the OCI image labels. The two-build verifiers
(`scripts/verify-reproducible-images.sh`, `scripts/verify-reproducible-installer.py`,
`scripts/verify-reproducible-firmware.py`) carry the explicit unsigned-subject boundary: the
signed envelope is excluded from the byte-comparison.

## bcvk release track

Per the round records: OMN-99 (upstream `--extra-qemu-arg` PR `yubi-OS/bcvk#8`) Done; OMN-102
(the five CI-only patches landed as real commits) Done; OMN-104 (versioning scheme) Done; OMN-105
(first yubios release tag) Done; OMN-106 (prebuilt amd64+arm64 binaries) Done. The open item is
OMN-107 (switch test workflows to the released binary), In Progress since 2026-08-24.

## What this record does not claim

No new builds were run for this record; states and counts are pinned from the round records and
Linear, not re-derived. The hardware-side counterpart lives in the drift check this record joins.
