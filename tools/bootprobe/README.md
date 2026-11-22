# bootprobe — laptop boot-crash instrument (2026-10-05)

Two systemd oneshots that record the next 50 boots of the Snapdragon X Elite laptop
(booting from microSD; boot-crash investigation 2026-10-04/05):

- `bootprobe-early.service` (After=local-fs.target, WantedBy=sysinit.target) — per-boot
  record at `/var/lib/bootprobe/boot-NNN.log`: boot id, cmdline, root device, previous-boot
  completion check (crash detector; reports `n/a` on the first captured boot and only `NO` when a
  previous boot was recorded but never finalized), raw early diskstats (mmc+nvme) and nvme smart-log
  snapshots (`boot-NNN.diskstats.early`, `boot-NNN.smart.early`), dmesg I/O error count and listing
  (one shared pattern, including `timeout`, for both), pstore listing.
- `bootprobe-finalize.service` (After=multi-user.target) — appends systemd-analyze +
  critical-chain + final diskstats, the **computed early→final deltas** (per device: reads, sectors
  read/written, writes, ms reading/writing, io ms; per smart-log key: early / final / delta when
  nvme-cli is present), and writes `.prev_complete`.

Install: copy scripts to /usr/local/sbin/, units to /etc/systemd/system/,
`systemctl daemon-reload && systemctl enable bootprobe-early bootprobe-finalize`.
Counter caps at 50 (`CAPTURE_DONE`). Plan: session/boot-log-plan-laptop-2026-10-05.md.

## rtsx-pm-pin (2026-10-05)

`rtsx-pm-pin.service` (multi-user.target oneshot) writes `on` to `power/control`
of every rtsx_pci device (Realtek RTS5261 SD Express reader on the Surface Laptop 7,
10ec:5261 @ PCI 0003:01:00.0) at every boot — prevents runtime suspend of the card
reader mid-access during the boot-crash investigation. Also: `pcie_aspm=off` added
to the default GRUB cmdline the same day (update-grub run throttled). Both part of
the x1e80100-linux-pm research round (session/x1e80100-linux-pm-research-2026-10-05.md).

Off-device testing: `BOOTPROBE_DIR` and `BOOTPROBE_DISKSTATS` override the state directory and the diskstats
source (defaults `/var/lib/bootprobe`, `/proc/diskstats`).

Known limitation (BOOT-4, unchanged): `rtsx-pm-pin.service` uses `ConditionPathExists=/sys/bus/pci/drivers/rtsx_pci`,
evaluated when the unit starts; if udev loads `rtsx_pci` later the unit is skipped silently.
