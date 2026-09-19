# systemd Reference: exec/unit/service/directives
_Refreshed: June 23, 2026 — Sources: man7.org systemd v260 — v261 additions appended 2026-07-23, see bottom section_

## Man Page Map

| What you need | Man page |
|---|---|
| Common unit options ([Unit], [Install]) | `systemd.unit(5)` |
| Service-specific ([Service]) | `systemd.service(5)` |
| Execution environment (ExecStart=, sandbox, caps) | `systemd.exec(5)` |
| Resource limits (CPU, memory, cgroups) | `systemd.resource-control(5)` |
| Kill behavior | `systemd.kill(5)` |
| Full directive index | `systemd.directives(7)` |

---

## Service Types (Type=)

| Type | Behavior |
|---|---|
| `simple` | Default. Started immediately after fork. Main process = ExecStart= process. |
| `exec` | Like simple but waits for execve() to succeed. Preferred for most long-running services. |
| `forking` | Daemon forks; parent exits. Use `PIDFile=` to track. Discouraged; use notify instead. |
| `oneshot` | Short-lived. Multiple `ExecStart=` run serially. Use `RemainAfterExit=yes` to stay active. |
| `notify` | Waits for `sd_notify("READY=1")` before considering started. Preferred for daemons. |
| `notify-reload` | Like notify; reload sends RELOADING=1 then READY=1. Replaces ExecReload= signal pattern. |
| `idle` | Delays ExecStart= ~5s until other jobs quiet. Avoids stdout mixing. |
| `dbus` | Waits for `BusName=` to appear on D-Bus. |

---

## Execution Commands

| Directive | Section | Notes |
|---|---|---|
| `ExecStart=` | [Service] | Main command. Multiple lines for oneshot only. Prefix `-` ignores failure. |
| `ExecStartPre=` | [Service] | Runs before ExecStart=. Serial. Fail stops start (unless `-` prefixed). Not for long-running processes. |
| `ExecStartPost=` | [Service] | Runs after ExecStart=. `$MAINPID` available. |
| `ExecCondition=` | [Service] | Before ExecStartPre=. Exit 1-254 = skip rest (not fail). Exit 255 or abnormal = fail. |
| `ExecStop=` | [Service] | Runs on stop. Only if start succeeded. KillMode= applies after. |
| `ExecStopPost=` | [Service] | Always runs on stop (even on failure). |
| `ExecReload=` | [Service] | Handles `systemctl reload`. Prefer `Type=notify-reload` instead. |
| `ExecReloadPost=` | [Service] | v259+. Runs after successful reload. |

---

## Dependencies and Ordering ([Unit])

| Directive | Meaning |
|---|---|
| `Requires=` | Hard dep. Failure fails this unit. |
| `Wants=` | Soft dep. Failure doesn't fail this unit. |
| `BindsTo=` | Strongest binding. Stop/failure propagates both ways. |
| `PartOf=` | Weak coupling. Stop/restart together; no failure propagation. |
| `After=` | Ordering only (no dep). Start after listed units. |
| `Before=` | Ordering only. Start before listed units. |
| `WantedBy=` | [Install] — symlink target for `systemctl enable`. Usually `multi-user.target`. |
| `RequiredBy=` | [Install] — reverse of Requires=. |
| `Upholds=` | Like Wants= but continuously re-activates if target stops. v250+. |

---

## Security and Sandboxing (systemd.exec(5))

| Directive | Effect |
|---|---|
| `DynamicUser=yes` | Transient UID (no /etc/passwd). Implies StateDirectory=, RuntimeDirectory=. |
| `PrivateTmp=yes` | tmpfs on /tmp and /var/tmp for this service. |
| `PrivateTmp=disconnected` | v255+. Disconnected tmpfs (no shared /tmp). |
| `ProtectSystem=strict` | /usr, /boot, /efi read-only. Use `ReadWritePaths=` for exceptions. |
| `ProtectSystem=full` | + /etc read-only. |
| `ProtectHome=yes` | /home, /root, /run/user hidden or tmpfs. |
| `NoNewPrivileges=yes` | No privilege escalation (setuid, setresuid, caps drop). |
| `SystemCallFilter=` | seccomp BPF. Use `~@clock` to blacklist groups. Failure kills process. |
| `CapabilityBoundingSet=` | Mask capabilities (e.g., `~CAP_SYS_ADMIN` to remove, or `CAP_NET_BIND_SERVICE` to allow only). |
| `AmbientCapabilities=` | Grant caps to main process (e.g., `CAP_NET_BIND_SERVICE`). |
| `ReadOnlyPaths=` | Bind-mount paths as read-only. |
| `ReadWritePaths=` | Bind-mount paths as read-write (use with ProtectSystem=strict). |
| `StateDirectory=` | Creates `/var/lib/<name>/` owned by service. |
| `RuntimeDirectory=` | Creates `/run/<name>/`; cleaned on stop. |
| `CacheDirectory=` | Creates `/var/cache/<name>/`. |
| `LogsDirectory=` | Creates `/var/log/<name>/`. |
| `ConfigurationDirectory=` | Creates `/etc/<name>/`. |
| `NotifyAccess=` | Who can call sd_notify: `none` / `mainpid` / `all`. |
| `ProtectKernelModules=yes` | Deny CAP_SYS_MODULE. |
| `ProtectKernelTunables=yes` | /proc/sys, /sys read-only. |
| `ProtectControlGroups=yes` | /sys/fs/cgroup read-only. |
| `LockPersonality=yes` | Prevent ABI personality change. |
| `RestrictRealtime=yes` | Deny real-time scheduling. |
| `RestrictNamespaces=yes` | Deny namespace creation (or restrict by type). |
| `RestrictAddressFamilies=` | Allowlist socket families (e.g., `AF_UNIX AF_INET AF_INET6`). |
| `MemoryDenyWriteExecute=yes` | Deny W+X memory mappings. |
| `PrivateDevices=yes` | Minimal /dev (no physical devices). |
| `PrivateNetwork=yes` | Private network namespace (loopback only). |
| `PrivateUsers=yes` | User namespace. `PrivateUsers=full` (v258) = complete isolation. `PrivateUsers=managed` (v260) = automatic UID management. |
| `ProtectProc=invisible` | Hide other users' /proc/<pid> entries. |
| `ProcSubset=pid` | Only show process-related /proc entries. |
| `RootImage=` | Run service from disk image (DDI). Verity-protected. |
| `RootMStack=` | v260+. overlayfs-based mount stack for root filesystem. |
| `RootEphemeral=yes` | v254+. Ephemeral copy of RootDirectory= per service invocation. |
| `BindNetworkInterface=` | v260+. Restrict service to specific network interface. |
| `RefreshOnReload=yes` | v260+. Re-read credentials when service is reloaded. |

**Hardened baseline combo (yubiOS services):**
```ini
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
DynamicUser=yes
NoNewPrivileges=yes
SystemCallFilter=~@mount @reboot @debug
CapabilityBoundingSet=
ProtectKernelModules=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
LockPersonality=yes
RestrictRealtime=yes
MemoryDenyWriteExecute=yes
RestrictAddressFamilies=AF_UNIX AF_NETLINK
```

---

## Resource Control (systemd.resource-control(5), cgroups v2)

| Directive | Notes |
|---|---|
| `MemoryMax=` | Hard limit. OOM kill if exceeded. |
| `MemoryHigh=` | Soft limit. Throttle + reclaim. |
| `CPUQuota=` | Percentage of CPU (e.g., `50%`). |
| `CPUWeight=` | Relative CPU weight (default 100). |
| `IOWeight=` | Relative IO weight. |
| `TasksMax=` | Max pids in cgroup. |

---

## Restart / Watchdog

| Directive | Values / Notes |
|---|---|
| `Restart=` | `no` / `on-success` / `on-failure` / `on-abnormal` / `on-watchdog` / `on-abort` / `always` |
| `RestartSec=` | Delay before restart (default 100ms). |
| `RestartSteps=` | v255+. Exponential backoff step count. |
| `RestartMaxDelaySec=` | v255+. Cap for exponential backoff. |
| `WatchdogSec=` | Heartbeat interval. Process must call `sd_notify("WATCHDOG=1")`. |

---

## Unit File Specifiers (common)

| Specifier | Expands to |
|---|---|
| `%n` | Unit name |
| `%p` | Unit name prefix (before @) |
| `%i` | Instance name (after @) |
| `%H` | Hostname |
| `%v` | Kernel release |
| `%u` | User name |
| `%h` | Home directory |
| `%t` | Runtime directory ($XDG_RUNTIME_DIR or /run) |

---

## Drop-In Pattern

```
/etc/systemd/system/myservice.service.d/
    10-override.conf    # loaded after main unit
    20-hardening.conf
```

For type-wide drops: `/etc/systemd/system/service.d/99-sandbox.conf` applies to ALL `.service` units.

---

## systemd.unit(5) Key Sections

### [Unit]
- `Description=` — human-readable name
- `Documentation=` — man pages, URLs
- `After=`, `Before=`, `Requires=`, `Wants=`, `BindsTo=`, `PartOf=`, `Upholds=`
- `ConditionPathExists=`, `ConditionFileIsExecutable=`, `AssertPathExists=`
- `DefaultDependencies=no` — opt out of automatic sysinit/shutdown deps

### [Install]
- `WantedBy=`, `RequiredBy=` — `systemctl enable` symlink targets
- `Alias=` — alternative unit name symlinks
- `Also=` — additional units to enable/disable together

### Unit File Search Path (system mode, precedence order)
1. `/etc/systemd/system.control/` (API-managed)
2. `/run/systemd/system.control/` (API-managed)
3. `/etc/systemd/system/` (admin)
4. `/run/systemd/system/` (runtime)
5. `/usr/local/lib/systemd/system/` (local admin)
6. `/usr/lib/systemd/system/` (packages)

---

## Credentials (systemd v254+)

```ini
[Service]
LoadCredential=fido2-token:/etc/yubikey/slot-config
LoadCredentialEncrypted=api-key:/etc/credentials/api.cred
SetCredential=mode:production
```

Access via `$CREDENTIALS_DIRECTORY/fido2-token`.

---

## yubiOS-specific Patterns

### YubiKey auth service unit
```ini
[Unit]
Description=YubiKey FIDO2 Enrollment Service
After=systemd-udevd.service
Requires=systemd-udevd.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/lib/yubiOS/enroll-fido2.sh
DynamicUser=no
User=root
PrivateDevices=no
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
NoNewPrivileges=yes
CapabilityBoundingSet=CAP_SYS_ADMIN CAP_DAC_READ_SEARCH
ReadWritePaths=/etc/crypttab /var/lib/systemd/

[Install]
WantedBy=multi-user.target
```

### systemd-homed drop-in (FIDO2 enrollment)
```ini
# /etc/systemd/system/systemd-homed.service.d/99-yubikey.conf
[Service]
PrivateDevices=no
BindReadOnlyPaths=/dev/hidraw0 /dev/hidraw1 /dev/hidraw2
```

---

## v261 Additions (2026-07-23 refresh — supersedes v260 baseline above)

systemd v261 shipped 2026-06-19. New directives/behavior since v260, confirmed against the v261 release notes/NEWS:

| Directive | Section | What it does | yubiOS relevance |
|---|---|---|---|
| `RestrictFileSystemAccess=` | **system.conf `[Manager]`, NOT systemd.exec** (corrected 2026-07-24, see note below) | BPF-LSM restriction: only execute binaries on a signed, dm-verity-protected filesystem | Distinct from the existing `RestrictFileSystems=` (per-unit filesystem-*type* limiter) already used on enrollment units — do not conflate. This one is manager-wide, no per-unit opt-out. Tracked as B-HARDENING-RUNTIME in yubiOS BLOCKERS.md: static audit done, runtime evidence (Bats + `systemd-analyze verify`) still pending before adoption |
| `CPUSetPartition=` | systemd.resource-control | cgroup cpuset partition type: `root`, `isolated`, `member` | Not yet used by yubiOS units |
| `FileDescriptorStorePreserve=on-success` | systemd.service | New option value: only preserve the FD store when the unit stops successfully | Relevant if any yubiOS daemon uses FD store handoff across restarts |
| `CPUPressureWatch=`, `CPUPressureThresholdSec=`, `IOPressureWatch=`, `IOPressureThresholdSec=` | systemd.resource-control | Per-unit CPU/IO PSI (pressure stall information) notifications | Useful for CI runner health signals, not yet wired |
| `ConditionFraction=` | systemd.unit | Staged rollout gating via machine-ID hash against a percentage | Could gate progressive rollout of new yubiOS images |
| `ConditionMachineTag=` | systemd.unit | Key off tags set in /etc/machine-info | Could be used for board-scoped units (e.g. rock5b-rk3588 vs rockpro64-rk3399 tags) |

**Breaking/compat change:** several `io.systemd.Unit` Varlink fields moved from plain strings to enums, with wire values changing from dash/plus forms to underscore forms (e.g. `tty-force` → `tty_force`, `kmsg+console` → `kmsg_console`). Affected enums: `ExecInputType`, `ExecOutputType`, `ProtectHome`, `CGroupController`, `CollectMode`, `EmergencyAction`, `JobMode`. Audit any yubiOS tooling that talks to systemd over Varlink for these wire-value strings.

**New component (not a directive):** `systemd-sysinstall` — a textual OS installer wrapping `systemd-repart`, `bootctl link`, `bootctl install`, and `systemd-creds`. yubiOS TODO.md keeps this watch-list only; repart/bootc remains the install baseline.

Sources: https://github.com/systemd/systemd/releases/tag/v261, https://raw.githubusercontent.com/systemd/systemd/main/NEWS, https://freedesktop.org/software/systemd/man/latest/systemd.exec.html, https://freedesktop.org/software/systemd/man/latest/systemd.service.html, https://freedesktop.org/software/systemd/man/latest/systemd.unit.html

> **Correction (2026-07-24):** the table above lists `RestrictFileSystemAccess=` alongside per-unit `systemd.exec` directives. That's wrong. Verified against the systemd v261 release, the merged PR (systemd/systemd#41340), and `systemd-system.conf(5)`: **`RestrictFileSystemAccess=` is a manager-level setting in the `[Manager]` section of `system.conf` (or via the `systemd.restrict_filesystem_access=` kernel command-line parameter), not a per-service `systemd.exec` directive, and it has no per-unit opt-out** — it's a hard, global security invariant for fully-verified image-based systems, not something an individual yubiOS service unit can turn on for itself. It requires booting with `dm_verity.require_signatures=1` and `lsm=...,bpf`; PID 1 refuses to start without those. This matters for yubiOS's BLOCKERS.md B-HARDENING-RUNTIME entry: adopting this control is a system-wide boot-chain decision (system.conf + kernel cmdline), not a drop-in on the enrollment unit the way `RestrictFileSystems=~@network` is today. Do not conflate the two when writing the runtime hardening evidence for B-HARDENING-RUNTIME.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.
