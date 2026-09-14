# systemd v262 refresh: release candidates + still-current removal audit (2026-09-13)

**Refreshes:** `refs/systemd-upstream-progress-2026-07-21.md` and the v262 tracking
note in `refs/0pointer-poettering-systemd-vision-2026-07-23.md`. Neighbor family:
release tracking (`refs/bootc-dev-org-releases-2026-07-23.md`).

## Release facts (verified live via GitHub API, 2026-09-13)

- **v262 is still not stable.** `v262-rc2` shipped 2026-09-08. The stable line remains
  v261 (point release `v261.3`, 2026-09-10); backport releases v260.5, v259.9, v258.11
  all landed 2026-09-10/11.
- The 0pointer doc’s tracking note ("v262 Mastodon stories will start in a few weeks")
  is still accurate as of this date: no v262 stable, no stories series observed yet.

## v262-rc2 items yubiOS tracks (verified from the release notes)

1. **`/run/boot-loader-entries/` removal is proceeding** — the incompatible-changes
   section repeats the planned removal of runtime-defined boot loader entries. The
   2026-07-14 audit (`refs/systemd-v262-audit-2026-07-14.md`) found no yubiOS repo
   dependency; still clear, and the BLS "extra" Type #1 stanza (UKI addon handling)
   remains the supported path for entry overlays.
2. **`systemd-sysupdated` D-Bus API removal confirmed** — superseded by Varlink IPC;
   `updatectl` keeps working over the new transport. No yubiOS dependency (same audit).
3. **`ukify inspect --json=` machine-readable output changed** — touches any tooling
   that parses UKI inspect output. yubiOS UKI verification uses sbverify/cosign paths,
   not `ukify inspect` JSON; no consumer in the repo (verified by grep at this cycle).
4. **`tpm2-measure-bank=` crypttab option removed** — yubiOS does not use TPM2
   measure banks (no TPM in the trust model); the FIDO2/PIV enrollment path is unaffected.
5. **Credential-handling hardening continues** — MITM protections around decrypted
   credentials and new controls for boot credentials encrypted with the "null" key.
   Relevant to the credential-ingest patterns yubiOS uses for provisioning secrets.

## Standing verdict

No new yubiOS dependency or breakage surfaced by v262-rc2. Next refresh trigger:
v262 stable release or the Poettering v262 stories series, whichever lands first.
