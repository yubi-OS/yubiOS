# bootprobe — laptop boot-crash instrument (2026-10-05)

Two systemd oneshots that record the next 50 boots of the Snapdragon X Elite laptop
(booting from microSD; boot-crash investigation 2026-10-04/05):

- `bootprobe-early.service` (After=local-fs.target, WantedBy=sysinit.target) — per-boot
  record at `/var/lib/bootprobe/boot-NNN.log`: boot id, cmdline, root device, previous-boot
  completion check (crash detector), diskstats deltas for mmc+nvme, dmesg I/O error counts,
  pstore listing, nvme smart-log deltas (when nvme-cli present).
- `bootprobe-finalize.service` (After=multi-user.target) — appends systemd-analyze +
  critical-chain + final diskstats, writes `.prev_complete`.

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
