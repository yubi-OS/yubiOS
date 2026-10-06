# 0pointer corpus companion (2026-10-06)

Corpus: `yubi-OS/knowledge` `knowledge/0pointer/`, the Lennart Poettering blog canon (0pointer.net). Minted 2026-09-29 via the `knowledge-corpus-mint` skill (second run, first on a fully healthy searXNG), landed in PR #2. This is the refs-side mirror of that corpus: what it covers, what to take from it, and where yubiOS departs from it.

## What the corpus covers

9 docs, all grounded primarily in the blog posts themselves plus systemd.io, UAPI-group specs, and freedesktop man pages:

1. `knowledge/0pointer/01-fitting-everything-together.md` - the keystone May 2022 essay: image-based rather than package-based OS, hermetic immutable `/usr`, DPS partitions, signed UKIs, first-boot key generation, the full trust chain named in one place.
2. `knowledge/0pointer/02-uki-pcr-trusted-boot.md` - "Brave New Trusted Boot World" (October 2022): the UKI as one signed and measured UEFI PE file, systemd-stub measuring PE sections into PCR 11 (`.pcrsig` excluded, since it carries the expected measurement), the PCR ownership split (11 vendor, 12 administrator, 13 sysexts, 15 local identity), and why pre-computable PCR values make signed-PCR sealing and rollback protection practical where the GRUB-style chain could not.
3. `knowledge/0pointer/03-dps-and-repart.md` - the Discoverable Partitions Specification and systemd-repart: the GPT type UUID / label / attribute grammar that makes a disk image self-describing with no `/etc/fstab`, and repart as a purely additive first-boot repartitioner that grows, adds, formats, and encrypts partitions on the hardware they land on.
4. `knowledge/0pointer/04-luks2-hardware-unlock.md` - the January 2021 systemd-248 essay: LUKS2 unlocking with FIDO2 (`hmac-secret`), PKCS#11 (PIV), and TPM2, plus `systemd-cryptenroll` and the threat-model ledger distinguishing the three.
5. `knowledge/0pointer/05-authenticated-boot-encryption.md` - the September 2021 threat-model essay: authentication versus encryption split, the per-resource matrix (boot chain authenticated, `/usr` authenticated not encrypted, `/etc`+`/var` and per-user data encrypted with different key bindings), and the three attack scenarios.
6. `knowledge/0pointer/06-stateless-factory-reset.md` - the 2014 essay plus today's mechanics: stateful / volatile / stateless / factory reset as one vocabulary, tmpfiles.d, sysusers, ConditionNeedsUpdate, and repart erasing `FactoryReset=` marked partitions from the initrd.
7. `knowledge/0pointer/07-portable-services-sysext.md` - the modularity ladder: portable services (v239, `RootImage=`), sysext/confext read-only overlayfs merges into `/usr` and `/etc`, and nspawn off the host `/usr` as a zero-setup dev container, all sharing one DPS artifact format.
8. `knowledge/0pointer/09-modern-systemd-features.md` - the v254 to v261 wave: sysupdate, soft-reboot, ukify, run0, sysinstall, boot secrets plus the software TPM fallback, and the first PID 1 LUO/KHO integration. The Mastodon-stories index posts are now the primary narrative record.
9. `knowledge/0pointer/10-mkosi-casync-ammutable.md` - the build-to-boot pipeline: mkosi as the image factory, casync's buzhash content-addressed delivery, and Ammutable (announced 2026-01-27, Poettering plus nine collaborators, Berlin) as the commercial continuation.

Dropped at outline stage: `08-systemd-homed`, jev score 0.78 against a 0.8 keep line; homed content is covered inside docs 01, 02, and 05.

## Key takeaways

The corpus is the upstream foundation yubiOS builds on, read in order it makes the design goals legible:

- **Image-based over package-based.** Packages are a build-time input; deployment is DPS GPT images, "cattle, not pets" (doc 01). Every image is a live image; installation is `dd`. This is the direct upstream justification for the bootc image model yubiOS derives from fedora-bootc.
- **Hermetic `/usr` is the load-bearing decision.** One immutable, dm-verity-protected tree buys whole-tree integrity, A/B atomic updates, and factory reset by erasing the root and rebooting (docs 01, 06). yubiOS's dm-verity and composefs work sits exactly here.
- **The trust chain is one continuous signature path.** Firmware or shim, systemd-boot, UKI, initrd-validated sysexts, TPM2-unlocked root (doc 01), with PCR ownership split so vendor values are pre-computable at build time and sealable across updates (doc 02). The 2021 matrix (doc 05) is the threat model behind the split.
- **Where the YubiKey substitution enters.** Doc 04 is the hinge. The essay itself names YubiKey series 5 as the example FIDO2 token, notes enrollment leaves the token unmodified and needs no key ceremony, and makes FIDO2 the default recommendation. FIDO2 authenticates the holder, not the boot state; that is the property split yubiOS exploits when the YubiKey replaces the soldered TPM2 for secrets and unlock, with the fTPM/OP-TEE work covering the platform-integrity half TPM2 would otherwise own.
- **First boot, not install time.** All local state and keys are generated on the hardware they protect (docs 01, 03). This grounds yubiOS's no-pre-provisioned-secrets stance and the repart-driven first-boot path.
- **The wave closes the operational gaps.** Doc 09 shows the v254-v261 releases turning the 2022 architecture into shipped operations: sysupdate for A/B, soft-reboot and LUO/KHO for restart tiers, ukify for UKI assembly. An image-mode OS can pin a systemd version and inherit the rest.

## Provenance

Minted 2026-09-29, PR #2. Outline jev-validated: 9 of 10 candidates kept, scores 0.82 to 1.78. Dig: 18 searXNG queries, 108 results, all jev-weighted, mean quality 0.49, 37 primary-quality results at 0.8 or above. Full collection record (outline verdicts, dig weights, author provenance, costs) in `knowledge/0pointer/research-db/` (`archive.json`, `digs/*.json`); version-sensitive claims are marked in the doc texts.

## Relationship to refs/0pointer-poettering-systemd-vision-2026-07-23.md

That refs doc is the refresh-status record: as of 2026-07-23 it tracks v261 as current stable, v262 removal flags, and the feature-by-feature yubiOS relevance table (sysinstall watch-list status, `RestrictFileSystemAccess=`, RSA-OAEP cryptenroll defaults, the swtpm fallback matching yubiOS's CI mechanism). It answers "what is current upstream and what should yubiOS watch". This corpus is the other half: the full blog canon, argued end to end, with per-essay sourcing and jev provenance. Use the refs doc for status checks and adoption decisions, the corpus for the reasoning behind them. A second mint in the same repo, `knowledge/0pointer-poettering-systemd-vision/` (10 docs), covers overlapping ground from a separate mint run; this companion documents `knowledge/0pointer/` only.
