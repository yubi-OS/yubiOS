# 0pointer.net / Lennart Poettering & Amutable — systemd Architecture Vision
_Refreshed: 2026-07-23 (supersedes refs/archive-0pointer-knowledge.md, originally researched 2026-06-23)_

## Who / Context

Lennart Poettering: creator of systemd, PulseAudio, Avahi. Blog "Pid Eins" (0pointer.net/blog). **Amutable is a real, funded company, not a side project**: founded by **Chris Kühl (CEO)**, **Christian Brauner (CTO)**, and **Lennart Poettering (Chief Engineer)**, with **David Strauss as CPO**, based in **Berlin, Germany**. Mission: "determinism and verifiable integrity to Linux workloads everywhere." Direct alignment with yubiOS's own thesis (source: amutable.com, amutable.com/blog/introducing-amutable).

Mastodon: @pid_eins@mastodon.social

---

## systemd release status (as of 2026-07-23)

- **v261 is the current stable release**, shipped 2026-06-19. Poettering's own "Mastodon Stories for systemd v261" post is the latest systemd-cycle post on 0pointer.net.
- **v262 is not yet released.** Poettering says a v262 Mastodon-stories series will start "in a few weeks" under #systemd262 — track for the next research refresh.
- v261 release notes already flag **planned v262 removals**: legacy `/run/boot-loader-entries/` support and the `systemd-sysupdated` D-Bus API. yubiOS's own 2026-07-14 audit (refs/systemd-v262-audit-2026-07-14.md) found no repo dependency on either — confirmed still clear.

### v261 features most relevant to yubiOS (new this refresh)

| Feature | What it does | yubiOS relevance |
|---|---|---|
| `systemd-sysinstall` | New textual installer wrapping systemd-repart + bootctl to set up partition tables, stream OS partitions, install boot loader pieces | Currently watch-list only per yubiOS TODO.md — repart/bootc model remains the install baseline, but this is the closest upstream analog to a guided installer |
| `RestrictFileSystemAccess=` | BPF-LSM restriction to binaries on signed, dm-verity-protected filesystems | Distinct from the existing `RestrictFileSystems=` filesystem-type limiter already in use — do not conflate (yubiOS BLOCKERS.md B-HARDENING-RUNTIME tracks runtime validation before adopting this) |
| `systemd-sysext-sysroot.service` / `systemd-confext-sysroot.service` | Early-initrd merge of system/config extensions | Relevant if yubiOS moves sysext activation earlier in boot |
| systemd-stub UKI "addon" handling | UKI can consume sidecar initrds/cmdline overlays/devicetree blobs via a new BLS "extra" Type #1 stanza | Relevant to the ARM64 firmware work (device tree handoff) |
| `systemd-cryptenroll` now defaults to RSA-OAEP + SHA-256 | Stronger LUKS2 key sealing than old PKCS#1 v1.5 | Applies directly to yubiOS's FIDO2/PIV LUKS2 enrollment path |
| `systemd-tpm2-swtpm.service` software TPM fallback + stub-to-initrd boot secret | Lets systems without a physical TPM still get sealed key material | This is exactly the swtpm CI mechanism yubiOS already uses (yubi-OS/bcvk `feat/swtpm-ci`) — confirms the upstream pattern matches yubiOS's CI approach |
| `systemd-tpm2-setup.service` priority-based NvPCR allocation | Ordered NvPCR claims | Relevant to the ARM64 fTPM NV allocation scheme |
| `systemd-repart`: `EncryptKDF=`, `VolumeName=`, `BlockDeviceReplace=`, `--grain-size=`, per-partition `Discard=` | Stronger declarative partitioning | Strengthens the install/migration/encrypted-partition flow yubiOS's `bootc install to-filesystem` path depends on |
| `systemd-homed`: JSON user record birth-date field, `homectl --birth-date=` | Metadata addition | Cosmetic for yubiOS today |

Discoverable Partitions Specification (DPS) is unchanged in shape: it's still the UAPI-group-maintained spec (uapi-group.org/specifications/specs/discoverable_partitions_specification/) covering root, /usr, /home, per-user home, verity, and signature partition auto-discovery — this is what `bootc install to-filesystem --root-mount-spec=""` relies on for auto-discovery, per yubiOS TODO.md.

---

## "Fitting Everything Together" — Core Architecture Vision (unchanged, still the foundational reference)

Source: https://0pointer.net/blog/fitting-everything-together.html

### Design Goals (directly applicable, still current)
1. **Image-based over package-based** — reproducible, immutable, cattle not pets
2. **Trust chain from boot loader to apps** — all code cryptographically validated before execution
3. **Offline security** — data encrypted at rest, TPM2-bound (yubiOS: YubiKey-bound)
4. **Cryptographic measurement everywhere** — remote attestation
5. **Self-updating** — A/B atomic upgrades via systemd-sysupdate
6. **Robust against power loss** — A/B partition scheme
7. **Factory reset** — systemd-repart erases flagged partitions on request
8. **Vendor/system/user separation** — /usr immutable, /etc + /var writable
9. **Adaptive** — first-boot partition creation via systemd-repart
10. **No installer** — any image is a live image; dd to disk (note: systemd-sysinstall above is the closest upstream counter-trend to this, worth watching)
11. **Local key generation** — no pre-provisioned secrets

### Boot Chain (unchanged core, v261 adds UKI addon handling — see table above)
- **Unified kernels** (UKI) = kernel + initrd + cmdline + splash → single UEFI PE binary
- **systemd-boot** picks newest by version sort
- `usrhash=` kernel parameter → dm-verity root hash in signed cmdline
- **systemd-repart** creates root fs on first boot, encrypts, enrolls TPM2 key
- yubiOS delta: replace TPM2 enrollment with YubiKey FIDO2 via systemd-cryptenroll

### Modularity Layers (unchanged)
| Layer | Tool | Trust |
|---|---|---|
| OS extensions | systemd-sysext | Verity + PKCS#7 signed, overlayfs on /usr |
| Isolated services | Portable Services (RootImage=) | Verity + signed, own namespace |
| Apps | flatpak / OCI | weaker — no attestation |

### Key Insight for yubiOS (still holds)
The entire stack is already designed for hardware root-of-trust. The only yubiOS delta is:
- Replace TPM2 with YubiKey everywhere `systemd-cryptenroll` is called
- The rest (UKI signing, dm-verity, systemd-sysext, systemd-repart) is upstream

---

## systemd Versions — Feature History (v256–v260, unchanged from prior research; v261 detailed above)

### v260 (March 2026)
- `.mstack` Overlay Mount Stacks (`RootMStack=`) — overlayfs layers + bind mounts for services
- NvPCR Measurements for Activated DDIs
- LUKS Volume Key Fixation — pin LUKS key slot after enrollment
- Unprivileged Portable Services
- Image Policy Improvements
- `PrivateUsers=managed` — automatic UID management for user namespaces
- `RefreshOnReload=` in service units
- `BindNetworkInterface=`
- `importctl pull-oci`
- TPM2 quirks database in udev

### v259 (Dec 2025)
- NvPCR support (non-volatile PCR)
- `run0 --empower`
- `systemd-repart` Varlink IPC API
- `ExecReloadPost=`
- `systemd-repart --defer-partitions-factory-reset=`

### v258 (Sep 2025)
- `homectl list-signing-keys` / `add-signing-key` — FIDO2 signing key management for homed **[critical for yubiOS]**
- Offline Signing of Artifacts
- `PAMName=` in services with ask-password protocol
- `PrivateUsers=full`
- `LoadCredentialEncrypted=` in per-user service manager
- Factory Reset rework
- fsverity in systemd-repart

### v257 (Dec 2024)
- **SecureBoot signing with systemd-sbsign** (replaces sbsigntools) **[critical for yubiOS UKI, now live per PR #29]**
- Multi-Profile UKIs
- Combined signed PCR + locally managed PCR policies for disk encryption
- IPE LSM support
- `systemd-sysusers` fully locked accounts
- SecureBoot key enrollment prep with bootctl
- ID-mapped mounts for per-service directories

### v256 (Jun 2024)
- `run0` as sudo replacement
- SSH into systemd-homed accounts
- `systemd-vmspawn`
- Mutable systemd-sysext
- `systemd-cryptenroll` without device argument

---

## mkosi (Daan De Meyer re-introduction, unchanged)

Source: https://0pointer.net/blog/a-re-introduction-to-mkosi-a-tool-for-generating-os-images.html

### What it builds
- GPT disk images (via systemd-repart)
- Tar / CPIO archives
- USIs (Unified System Images)
- Sysext, confext, portable images
- Directory trees

### Key workflow
```ini
# mkosi.conf
[Host]
Distribution=debian
Release=trixie

[Output]
Format=disk
OutputDirectory=mkosi.output/

[Content]
Bootable=yes
Packages=systemd-boot
         systemd-cryptsetup
         pcscd
         libpam-yubico
```

### For CI (yubiOS context)
```bash
mkosi build    # build image
mkosi boot     # boot in systemd-nspawn
mkosi qemu     # boot in QEMU
mkosi -f build # force rebuild
```

---

## Key Directives Quick Reference (yubiOS service hardening, unchanged)

### For YubiKey-auth services
```ini
[Service]
Type=notify
DynamicUser=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
NoNewPrivileges=yes
CapabilityBoundingSet=CAP_DAC_OVERRIDE
SystemCallFilter=~@mount @reboot @debug
RestrictAddressFamilies=AF_UNIX AF_NETLINK
ProtectKernelModules=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
LockPersonality=yes
RestrictRealtime=yes
```

### For cryptenroll / LUKS services
```ini
[Service]
CapabilityBoundingSet=CAP_SYS_ADMIN CAP_DAC_READ_SEARCH
PrivateDevices=no       # needs /dev/sda etc
ProtectSystem=strict
ReadWritePaths=/etc/crypttab
```

---

## Links
- Main blog: https://0pointer.net/blog/
- Fitting Everything Together: https://0pointer.net/blog/fitting-everything-together.html
- Mastodon Stories for systemd v261: https://0pointer.net/blog/mastodon-stories-for-systemd-v261.html
- Amutable: https://amutable.com/
- Introducing Amutable: https://amutable.com/blog/introducing-amutable
- systemd v261 release: https://github.com/systemd/systemd/releases/tag/v261
- DPS spec: https://uapi-group.org/specifications/specs/discoverable_partitions_specification/
- Mastodon stories index: https://mastodon.social/@pid_eins
- All Systems Go conference: https://all-systems-go.io/



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.
