# systemd v262-rc3 census: yubiOS tracking items after the 2026-09-13 refresh

**Refreshes:** [`refs/systemd-v262-refresh-2026-09-13.md`](systemd-v262-refresh-2026-09-13.md).
Neighbor family: release tracking (`refs/bootc-dev-org-releases-2026-07-23.md`).
Method: GitHub REST API (`GET /repos/systemd/systemd/releases`,
`GET /repos/systemd/systemd/releases/tags/v262-rc3`), live-verified 2026-09-19.
This is a dated census of what changed between the 2026-09-13 refresh (which
ended at v262-rc2) and today.

## 1. Release state (verified live, 2026-09-19)

- **v262-rc3 shipped 2026-09-15T11:29:47Z** (prerelease). New since the
  2026-09-13 refresh.
- **v262 is still not stable.** The stable line remains v261
  (`v261.3`, 2026-09-10); backports v259.9 and v258.11 landed 2026-09-11.
  No v262 stable, no 0pointer stories series yet.

## 2. The five rc2 tracking items, re-checked against rc3

1. **`/run/boot-loader-entries/` removal now has a target release: v263.** The
   rc3 announcement states: "With the future v263 release we intend to remove
   support for /run/boot-loader-entries/ and related interfaces"; UAPI.1
   support is kept. This tightens the rc2 wording ("planned removal") into a
   named release. yubiOS exposure unchanged: no repo dependency (2026-07-14
   audit), BLS "extra" Type #1 stanza remains the supported overlay path.
2. **`systemd-sysupdated` D-Bus API removal also pinned to v263**, Varlink
   replaces it, `updatectl` reworks onto the new transport. Additionally, the
   `DescribeFeature()` JSON payload renamed the "name" key to "id" — a
   machine-readable-output change in the same family as the `ukify inspect
   --json=` change tracked in rc2 item 3.
3. **`ukify inspect --json=` repeated-PE-section/profile output change**
   carries into rc3 unchanged. Still no consumer in the yubiOS repo (UKI
   verification uses sbverify/cosign paths).
4. **`tpm2-measure-bank=` crypttab option is now deprecated and has no
   effect**; volume-key measurements ride the v2 path. yubiOS does not use
   TPM2 measure banks (no TPM in the trust model); unaffected.
5. **TPM-sealed credentials are now pinned to the TPM's SRK**, preventing
   MITM interposition on decrypted credentials and enabling PIN-protected
   owner hierarchies. Continues the rc2 credential-hardening line; relevant
   to the credential-ingest patterns used for provisioning secrets (and a
   datapoint for the FIDO2-first posture: systemd keeps hardening the
   TPM-sealed path while yubiOS keeps hardware secrets off TPM entirely).

## 3. Standing verdict

No new yubiOS dependency or breakage surfaced by v262-rc3. The two v263-pinned
removals (boot-loader-entries, sysupdated D-Bus) are now dated to a release
rather than announced as intentions; both remain clear of the repo. Next
refresh trigger: v262-rc4, v262 stable, or the v263 announcement cycle,
whichever lands first.
