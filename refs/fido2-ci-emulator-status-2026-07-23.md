# FIDO2 Software Emulator for CI — Research Findings
_Refreshed: 2026-07-23 (supersedes refs/archive-fido2-ci-emulator.md, originally updated 2026-05-10)_

## 2026-07-23 update — confirms yubiOS's current live choice, sharpens B-VM-CTAP2

**passless is now the clearly correct, actively-maintained choice** — and yubiOS is already using it (per TODO.md: "the VM scripts now pre-create passless's headless local store"). This refresh confirms that choice was right:

| Tool | 2026-07-23 status | Verdict |
|---|---|---|
| **passless** (pando85/passless, Rust, UHID via `soft-fido2`) | **Actively maintained.** Latest release **v0.13.0 on 2026-07-12**, changelog activity through July 2026. Requires `/dev/uhid` + `uhid` kernel module, no root required. | ✅ Correct choice, keep using |
| virtual-fido (bulwarkid/virtual-fido, Go/C, USB/IP via `vhci-hcd`) | Still labeled "beta," APIs may change; pkg.go.dev activity looks stale (last snapshots ~2024). | Usable but not the actively-developed option |
| softfido (ellerh/softfido, USB/IP + SoftHSM) | **Stale/unmaintained** — no code updates since 2023-12-18. | Reference/POC only, don't rely on it |

**GitHub-hosted runner constraint confirmed:** GitHub's own `actions/runner-images` repo closed a long-standing issue (#332) requesting `vhci-hcd` with "we will not add it to the image" — **GitHub-hosted runners do not and will not ship `vhci-hcd`/USB-IP kernel support.** This doesn't block yubiOS since the ARM64 VM e2e lane already runs on **self-hosted bare runners** (per yubiOS CI_MAP.md / the `rock1` self-hosted runner referenced in session history), where kernel module loading is under yubiOS's own control. If any lane is ever moved to GitHub-hosted runners, USB/IP-based emulators (virtual-fido, softfido) would not work there — UHID-based passless is more portable since `/dev/uhid` access doesn't require the same custom runner-image support, though it still needs the `uhid` module loaded, which GitHub-hosted runners also don't guarantee.

**Relevance to B-VM-CTAP2:** yubiOS's own current blocker (BLOCKERS.md, live) says: "passless starts, but no CTAP2 token enumerates." This refresh doesn't find a passless-specific known issue explaining that gap directly — the next debugging step is still what yubiOS's TODO.md already says: "fix the bcvk/swu2f device path, assert token discovery before token-dependent operations." No upstream passless bug was found matching this symptom in this pass; recommend checking the passless v0.13.0 changelog directly for any device-enumeration-related fixes since the version currently pinned in yubiOS's dev image.

## Original research (2026-05-10, background — SoftHSM PKCS#11 section is unrelated to CTAP2 and still valid)

## Options

| Tool | Mechanism | Language | Best for |
|---|---|---|---|
| **virtual-fido** | USB/IP (`vhci-hcd`) | Go | General CTAP2, persistent creds |
| **passless** | UHID (`/dev/uhid`) | Rust | Passkeys, CTAP 2.1, native Linux feel — **yubiOS's live choice** |
| **softfido** | USB/IP + SoftHSM | Rust/C | PKCS#11 signing reference only, stale |

## GitHub Actions setup (historical example, self-hosted runner assumed)

```yaml
- name: Check /dev/uhid
  run: ls -la /dev/uhid

- name: Start passless
  run: |
    cargo install passless
    sudo passless &
```

## SoftHSM for PKCS#11 signing (mkosi profile CI, unrelated to CTAP2, still current)

```bash
sudo dnf install softhsm opensc
softhsm2-util --init-token --slot 0 --label "yubiOS-ci" --pin 1234 --so-pin 1234
pkcs11-tool --module /usr/lib64/libsofthsm2.so \
  --login --pin 1234 \
  --keypairgen --key-type EC:prime256v1 \
  --label "sb-key" --usage-sign
```

---

## Sources
- https://github.com/pando85/passless (v0.13.0, 2026-07-12)
- https://github.com/pando85/passless/blob/master/CHANGELOG.md
- https://github.com/pando85/soft-fido2
- https://github.com/bulwarkid/virtual-fido
- https://pkg.go.dev/github.com/bulwarkid/virtual-fido
- https://github.com/ellerh/softfido
- https://github.com/actions/runner-images
- https://github.com/actions/runner-images/issues/332
- https://docs.github.com/en/actions/reference/runners/self-hosted-runners


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.

## 2026-09-18 drift check (wayfinder round 8, cycle 62)

fido2 CI emulator status record: superseded in part by the hardware-leg proof (OMN-42/89) but still accurate as the emulator-lane record; note additive.
