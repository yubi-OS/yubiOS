# Autoinstall spec notes — 2026-10-07

Grounded against the current upstream spec: canonical/subiquity `doc/reference/autoinstall-reference.rst` @ main (2026-09-30 head, targets 26.04 development). Source of truth: https://github.com/canonical/subiquity/blob/main/doc/reference/autoinstall-reference.rst

## Status of our seed files

`Deploy/ubuntu/{user-data,meta-data,network-config,vendor-data}` (identical across Docker, oem-2026, Docker-Dev-26.04; oem-2026 adds `user-data-arm64-desktop-minimal-2026`):

- `autoinstall: version: 1` is still the only version. No v2 exists. Nothing in our files is invalid against the current schema.
- The user-data's `autoinstall:` section is a Ubuntu Desktop installer export (24.04-era export machinery): it already carries the 24.04+ fields (`interactive-sections`, `mirror-selection`, `error-commands`, `oem/codecs/drivers`, deb822 `sources`).
- In v1, unrecognized keys warn. In future versions they will be a fatal validation error — worth keeping the file clean of typos.

## New fields in the autoinstall format since our file was generated

| Field | Added | Notes / relevance here |
|---|---|---|
| `storage.layout.name: hybrid` | TPM-backed FDE flow; docs commit 2026-07-02 | TPM-backed full-disk encryption with `encrypted: yes`. Our file uses `lvm` + `encrypted: yes` (passphrase LUKS) — still valid, but `hybrid` is the modern desktop FDE path. Not usable on this Rockchip flow (no TPM-backed FDE support in this path). |
| `storage.layout.accepted-errors` | 2026-07-02 | Autoinstall equivalent of clicking "Solution: Ignore" on pre-install errors for TPM/FDE installs (e.g. `running-in-vm`). Only honored for errors snapd offers a `proceed` action on. |
| `storage.layout: direct` + `ptable: msdos` | 2025-01-31 | Request an MSDOS (MBR) partition table instead of GPT. |
| `storage.layout.reset-partition` / `reset-partition-only` | code since 2024, doc current | FAT32 partition carrying the full installer image so the box can re-enter the installer from GRUB/EFI without media. **Directly relevant to the oem-2026 provisioning branch.** `reset-partition: 12G` pins size; `reset-partition-only: true` installs just the reset partition. |
| `storage.swap` (curtin swap config under `storage:`) | current | e.g. `storage: { swap: { size: 0 } }`. |
| `storage.layout.match` as an ordered list | subiquity 24.08.1 | First matching spec wins. Our file uses the single-map form — still valid. |
| `apt.fallback` default now `offline-install`; new value `continue-anyway` | 2024-08-19 | Our file pins `fallback: abort` explicitly — still valid, just no longer the default. |
| `identity.groups` (override/append) | 2025-11-02 | N/A for us: our `identity` is interactive (`interactive-sections: [storage, identity]`), no identity section present. |
| `kernel-crash-dumps.enabled` (null/true/false) | 2024-09-04 | On 24.10+, default `null` = dynamic enablement: on arm64 boxes meeting minimum requirements, `kdump-tools` gets enabled. **On a small SBC this silently reserves crashkernel memory** — set `enabled: false` if kdump is unwanted. |
| `snaps:` top-level section | current | List of `{name, channel, classic}` snaps installed during install. Our file installs snaps via `user-data.runcmd` (`snap install ufw/chromium`) instead — works, but the dedicated section runs at install time. |
| `zdevs` | 2025-02-03 | IBM Z device enable/disable. Irrelevant on arm64. |
| keyboard multi-layout (`layout: "us,gr"` + `toggle`) | 2026-07-01 | Documented comma-separated layouts. Caveat added 2026-06-12: with TPM-FDE + passphrase, only the primary layout can unlock the disk. |
| `oem.install: auto` special value | current | Default `auto` (install OEM meta-packages on Desktop only). Our file pins `false` explicitly. |
| `apt.geoip: false` clarification | 2026-09-30 | Only disables country-mirror selection, not the geoip lookup itself. |

## Adjacent flags (content, not spec)

1. `cloudflare.sources` pins `Suites: noble` while the target system suite is `questing` (25.10). The Cloudflare WARP repo has no questing suite, so noble packages get installed on a 25.10 system — works today, will drift. Worth an explicit decision (pin + document, or switch WARP to a downloaded .deb).
2. `bootcmd` re-writes `/etc/apt/sources.list.d/cloudflare.sources` while `apt.sources.cloudflare.sources` also writes it — one of the two is redundant.
3. `packages` installs `libpam-u2f`/`fido2-tools` but no PAM wiring is done in late-commands — fine if intentional (yubiOS side owns auth), noting for completeness.
4. `error-commands` write logs into `/target` — correct per current spec (target mounted at /target in the error path).
5. Late-commands `apt-mark hold shim shim-signed` then overwrites BOOTAA64.EFI/shim with repo EFIs — still consistent with current spec (nothing in the schema changed around this).
