---
name: rockchip-sd-flash
description: "Write a Rockchip U-Boot loader (u-boot-rockchip.bin) to an SD card in rock1's slot via the shell bridge — digest-pinned podman pull from the CI firmware image, sha256 verification against the CI artifact, target guards, sector-64 dd write, and readback verification. Use when flashing or updating a Rockchip loader card (ROCK 5B, RockPro64, PineTab2) in rock1's SD slot after a ci_firmware-rk run, or when the user asks to put a firmware bin on the card in rock1."
requiredApps: []
---

# Rockchip SD-card loader flash via rock1

rock1 is a Pine64 RockPro64 v2.1 (RK3399). Its SD slot (`/dev/mmcblk1`, ~59.5G) is a CARRIER for loader cards of other Rockchip boards (ROCK 5B/RK3588, PineTab2/RK3566) — the SoC of the card's image never has to match rock1.

## Loader layout (why sector 64)

- `u-boot-rockchip.bin` = idbloader (TPL+SPL) at file offset 0 + `u-boot.itb` (BL31 + TEE + U-Boot + FDT) at byte offset 8,355,840 = (16384 − 64) × 512. Writing the file at **sector 64** puts idbloader at sector 64 (Rockchip BootROM load address) and the FIT at sector 16384.
- NEVER dd `u-boot-rockchip-spi.bin` raw to an SD card — it is the SPI NOR layout (RKNS at 0x8000).
- Verify layout empirically before the first write of a new build: check the file starts with the RKNS magic (`52 4b 4e 53`), that idbloader.img is a byte-prefix of the packed bin, and that u-boot.itb appears at offset (16384−64)×512.

## Procedure (validated 2026-10-10/11, three verified writes)

1. **Source the bin by digest, on rock1 itself** — avoid bridge chunk-transfer of ~11MB files. Get the publish digest from the CI run's "Stage 4 - Publish firmware bundle" job log (`pushing manifest for docker.io/0mniteck/yubios:firmware-<board>@sha256:...`), then on rock1: `podman pull docker.io/0mniteck/yubios@sha256:<digest>`; `podman create --name fw <ref>`; `podman export fw | tar -xf - -C <dir> --wildcards '*u-boot-rockchip.bin'`; `podman rm -f fw`. Note each pull costs ~100MB of rock1's small root fs.
2. **Verify sha256 against the CI artifact** — download the artifact zip in the sandbox, hash the inner `u-boot-rockchip.bin`, and require the rock1-extracted copy to match byte-for-byte.
3. **Guard the target** (same call as the write): `lsblk -dn -o SIZE /dev/mmcblk1` must equal the expected card size; mountpoint count must be 0; byte count must be a sector multiple (`CNT*512 == BYTES`). Abort with a named `ABORT_*` marker otherwise.
4. **Echo the dd command in chat before sending** (RULES destructive-op preflight), and echo a banner to `/dev/ttyS2` first per the bridge debug rule.
5. **Write:** `sudo dd if=<bin> of=/dev/mmcblk1 bs=512 seek=64 conv=fsync,notrunc status=none; sync`.
6. **Readback verify:** `sudo dd if=/dev/mmcblk1 bs=512 skip=64 count=$CNT status=none | head -c $BYTES | sha256sum` — must equal the artifact hash. Report both hashes.
7. Erased/dirty cards are fine: the write targets sectors 64+ and the BootROM only reads from sector 64; check only that the card still reports its expected size.

## Board-side loop (user drives)

The board boots from its microSD (SPL: "Trying to boot from MMC2"). The user debugs by pasting the UART log from the U-Boot `=>` prompt. U-Boot's shell has no pipes/grep — give single commands (`dm tree`, `bdinfo`, `fdt addr <addr>` then `fdt print /firmware`).

## Guidelines

- Never write to rock1's eMMC (`mmcblk0`) — that is the OS disk.
- A guard failure (wrong size, mounted target) aborts the write before dd runs; never relax the guard to make a write go through.
- A bridge call that returns a network error may still have executed — check box-side state (processes, logs) before re-sending (RULES proxy-cut reconciliation).
- QEMU (`virt,secure=on`) reproduces nothing board-specific: QEMU generates its own device tree with an OP-TEE node; a board that fails TEE/TPM init needs DT/TF-A fixes, not a QEMU repro.

## Examples

- "flash the latest rock5b firmware to the card in rock1" → pull by digest, verify, guard, write at sector 64, readback-verify, report.
- "the card is erased" → no problem; re-check size and write as normal.
