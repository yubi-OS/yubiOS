# systemd-usage corpus companion (2026-10-06)

Companion map for the `knowledge/systemd-usage/` corpus in yubi-OS/knowledge (minted 2026-09-30). This doc is the map; the corpus is the territory. It covers 8 operator docs on driving systemd day to day, deliberately distinct from the repo's 0pointer corpus, which holds the design essays behind the same mechanisms.

## What the corpus covers

- knowledge/systemd-usage/01-units-and-systemctl.md: unit types, the 9-step unit file load path, what enable/disable/mask actually write on disk, WantedBy wiring, and the three-layer lifecycle state model.
- knowledge/systemd-usage/02-journald-logging.md: journalctl filtering, volatile vs persistent storage, journald.conf tuning, rate limiting, and forwarding to syslog or a remote collector.
- knowledge/systemd-usage/03-timers-and-scheduling.md: OnCalendar and monotonic timers, Persistent catch-up, AccuracySec and RandomizedDelaySec, a 5-step debugging procedure, and when cron still wins.
- knowledge/systemd-usage/04-drop-ins-and-overrides.md: systemctl edit mechanics, drop-in merge semantics, the lexicographic-sort trap in sysctl.d and tmpfiles.d, and systemd-delta verification.
- knowledge/systemd-usage/05-service-hardening-sandboxing.md: the 8 sandboxing directives that move the score, the systemd-analyze security iteration loop, and failure tells per broken directive.
- knowledge/systemd-usage/06-network-and-resolved.md: networkd file matching, static/DHCP/VLAN/bond setups, networkctl verbs, resolved configuration, and a 5-step debugging workflow.
- knowledge/systemd-usage/07-cgroups-resource-control.md: slices, the directive table, systemd-run transient units, cgtop/cgls, and cgroup delegation.
- knowledge/systemd-usage/08-boot-analysis-targets.md: targets vs runlevels, the systemd-analyze toolkit, a stuck-boot decision tree, and timeout tuning.

Two outline candidates were dropped by jev validation: 09-cryptenroll-credentials (0.53) and 10-nspawn-homed-practical (0.45), both already covered in the yubios corpus in the same repo. The corpus does not cover them here.

## Key takeaways from the docs

**Enable/disable/mask move symlinks, not processes.** enable and start are orthogonal: a unit can be enabled but stopped. disable removes all symlinks to the unit, including manually created ones, so it can remove more than enable created. mask fails if a same-named file already exists in /etc/systemd/system, so it works reliably against vendor units in /usr/lib but often fails for locally created units (01-units-and-systemctl.md). Static units have no [Install] section and cannot be enabled, yet still work when pulled in by their trigger (01).

**Persistence of the journal is a directory check, not a config edit.** With Storage=auto, the journal is persistent only if /var/log/journal exists; enabling it takes mkdir, systemd-tmpfiles --create, and journalctl --flush. Vacuuming trims archived files only, so a huge active file needs --rotate first. Default rate limiting is 10000 messages per 30 seconds per service, with the effective burst scaled up to 6x by free journal disk space (02-journald-logging.md).

**A timer firing up to a minute late is usually working as designed.** AccuracySec defaults to 1 minute so the manager can coalesce wakeups. RemainAfterExit=yes services are unsuitable for repetitive timers because an already-active unit is not restarted on elapse. Persistent= applies to OnCalendar= timers only, and the `~` marker counts from the end of the month, replacing cron's last-Monday idiom (03-timers-and-scheduling.md).

**Drop-in merge semantics are per directive type.** Single-value directives override, list-valued directives append, and dependencies such as After= cannot be emptied by drop-ins at all; removing one requires systemctl edit --full. The fragment directories disagree on direction: in sysctl.d the lexicographically latest file wins a shared option, in tmpfiles.d the earliest wins (04-drop-ins-and-overrides.md).

**Harden in a fixed order and verify by function, not is-active.** The recipe: filesystem directives first (PrivateTmp, ProtectHome, ProtectSystem=strict with ReadWritePaths), privileges next (NoNewPrivileges, CapabilityBoundingSet, DynamicUser), kernel surface, then syscalls last as the most fragile layer, re-scoring with systemd-analyze security after each single directive change. The score covers only sandboxing systemd implements, not in-service defenses and not IPC such as D-Bus (05-service-hardening-sandboxing.md).

**First matching .network file wins.** Files are considered in alphanumeric order and later matches are ignored, so a low-numbered catch-all claims every interface. networkctl reconfigure does not reread files; run networkctl reload first. Unmanaged in networkctl status almost always means the [Match] section did not match (06-network-and-resolved.md).

**MemoryHigh is the working control; MemoryMax is the last line of defense.** Hitting MemoryMax invokes the OOM killer inside the unit. Weight-style directives (CPUWeight, IOWeight) split contended resources work-conservingly, while quotas (CPUQuota, bandwidth caps) are hard ceilings that waste idle capacity. Delegation is available on service and scope units only, never on slice units, per the single-writer rule (07-cgroups-resource-control.md). The corpus also notes systemd removed legacy and hybrid cgroup hierarchy support in v258 after deprecating it in v256.

**A boot stuck for exactly 90 seconds per service is a timeout, not a hang.** DefaultTimeoutStartSec defaults to 90 s. systemd-analyze blame answers what took long; critical-chain answers what blocked what. list-jobs pins the blocker job in a stalled boot, and systemd.mask= removes a unit from one boot's transaction without editing files. debug-shell.service must be disabled after debugging: an always-available unauthenticated root shell on tty9 is a security hole (08-boot-analysis-targets.md).

## Provenance

Minted 2026-09-30 from the request "systemd usage" via the knowledge-corpus-mint skill. Phase 0 preflight: searXNG 161 results, 0 suspended engines, jev smoke probe OK. Outline jev-validated 8 of 10 candidates (scores 0.89 to 2.00). The dig ran 16 searXNG queries collecting 96 results, all jev-weighted (mean 0.36, 21 at primary quality 0.8 or above). Docs ground in the freedesktop systemd 262 man pages, all fetched directly with no mirror fallback; version-sensitive claims are marked in the docs. The full collection record lives in the corpus's research-db/ directory.

## Corpus vs this doc

Use this doc to decide which corpus doc answers your question and to recall the load-bearing cross-cutting traps. Use the corpus for the full directive tables, command listings, source lists with jev weights, and version attributions. The corpus does not cover cryptenroll, credentials, nspawn, or homed operations; those live in the yubios corpus and the systemd-homed and nspawn-containers skills in this repo.
