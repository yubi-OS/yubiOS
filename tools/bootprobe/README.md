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
