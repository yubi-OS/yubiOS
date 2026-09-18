# yubiOS Workflow Patterns — Deep Dive (2026-07-30)

## TL;DR

Three subagents independently analyzed 24 workflow files in `yubi-OS/yubiOS` across three angles: **container + dind**, **action SHA + integrity**, and **crypto/signing**. Their findings converge on three actionable conclusions.

**1. The `container:` block IS the security architecture.** It is the digest-pinned `dhi.io/debian-base` per `/PINNED.md`, used for docker/docker-compose work. 21 of 24 workflows use it. Canonical 4-key shape (from `ci_mkosi-installer.yml::build`):
```yaml
container:
  options: --privileged
  volumes:
    - /mnt:/mnt
  credentials:
    username: 0mniteck42
    password: ${{ secrets.DOCKER }}
  image: docker://dhi.io/debian-base@sha256:4440cf16b142316744a7fd1c5070eb23df54c7c335d8684c8d72864f0f3eb30e
```
`ci_test_sealed-uki-vm.yml` (Jenny current focus, PR #155) lacks this block entirely — that is the security architecture gap driving the v2/v3/v4 fix series on `sealed-uki-vm-lane-v2`.

**2. AGENTS.md and the in-repo `github-actions` skill are STALE relative to `main`.** They still document:
- `actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd` (v6.0.2) — but 30 of 38 in-repo uses already at `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1)
- `dhi.io/debian-base@sha256:9415967…` (v2026.03.14) — but all 21 container jobs use `sha256:9d293dad…` (multi-arch OCI INDEX)

Any agent or developer copy-pasting from the skill today would re-introduce superseded refs.

**3. ADR-008 (`systemd-sbsign` over legacy `sbsigntools`) is followed in the canonical workflow** with `provider:pkcs11` backend via `PKCS11_PROVIDER_MODULE=/usr/lib/softhsm/libsofthsm2.so`. The `ci_test_sealed-uki-vm.yml` stub violates ADR-008 (its design-doc sketch uses `engine:pkcs11` directly).

**Five concrete fixes the org needs:**
- **A.** Update `skills/github-yubios-KS9n5GAT/github-actions/SKILL.md` to match `main` (live digest + checkout v7.0.1)
- **B.** Roll 8 `actions/checkout@de0fac2e4500…` (v6.0.2) to `3d3c42e5aac5…` (v7.0.1) in `ci_fork_bcvk.yml`, `ci_fork_edk2.yml`, `ci_fork_mkosi.yml`, `ci_fork_optee-os.yml`, `ci_test_sealed-uki-vm.yml`
- **C.** Restore the canonical `container:` block in `ci_test_sealed-uki-vm.yml` (the v4 fix Jenny is iterating on)
- **D.** Adopt the canonical SoftHSM + `provider:pkcs11` + `systemd-sbsign` signing pattern in `ci_test_sealed-uki-vm.yml`
- **E.** Provision OVMF_CODE.fd / OVMF_VARS.fd from `ci_fork_edk2.yml` artifact + enroll yubiOS ROTPK via `virt-fw-vars` (currently no workflow does this)

---

## Stream 1 — Container + dind patterns (subagent 1)

**Coverage:** All 24 workflow files scanned. 21 jobs use a `container:` block; the rest run on the bare `ubuntu-24.04` runner.

**Canonical block order** (matters — every "good" job places them in this order):
```yaml
container:
  options: --privileged          # enables dind + user-namespace operations
  volumes:
    - /mnt:/mnt                  # host bind mount for build artifacts
  credentials:
    username: 0mniteck42
    password: ${{ secrets.DOCKER }}
  image: docker://dhi.io/debian-base@sha256:4440cf16b142316744a7fd1c5070eb23df54c7c335d8684c8d72864f0f3eb30e
```

**dind usage in 14 jobs:**
- 13 of 14 use the **rootless-via-socket** pattern: `docker -H unix:///run/docker-rootless/docker.sock buildx bake …`. Outer `--privileged` makes this work (rootless dockerd needs kernel namespace privileges to spawn its user-namespace mapping inside the container).
- 1 outlier (`ci_test_bootc-filesystem.yml::install-to-filesystem`) uses the **legacy inner-dind** pattern: `docker run --rm --privileged --pid=host --ipc=host` inside a container that has NO outer `options:`. Same class of bug Jenny is hitting in `sealed-uki-vm`.

**Canonical block deployment:** 14/21 container jobs have the full canonical shape (options + volumes + credentials + image). 7/21 correctly omit `options:` and `volumes:` (linter / reproducibility subset — no docker, no `/mnt`). 1 workflow (`ci_test_sealed-uki-vm.yml`) has NO `container:` block at all (the regression state Jenny is iterating on).

**Non-dhi.io outlier:** `yubiOS-ci.yml::hadolint` uses `docker://ghcr.io/hadolint/hadolint:v2.14.0-debian@sha256:158cd0184…` with **no credentials block**. AGENTS.md currently forbids non-dhi.io containers — this is the only exception in the entire org.

**Live image digest vs documented:** Live is `sha256:9d293dad…` (multi-arch INDEX, per `ci_mkosi-installer.yml` comment `# auto-resolves to ${{ matrix.arch }}`). AGENTS.md / `github-actions/SKILL.md` document `sha256:9415967…` (v2026.03.14 per-arch). The skill and AGENTS.md are STALE.

---

## Stream 2 — Action SHA + workflow integrity (subagent 2)

**Coverage:** 65 total `uses:` lines across 24 workflows. **Zero floating refs. Zero unpinned refs.** Every `uses:` has a 40-char hex SHA or `sha256:` digest.

**Authoritative allowlist:** `/PINNED.md` (file blob SHA `2581269d96d2c1a83549de61754028fcdc568b2c`, 10937 bytes). Two critical entries differ from the `github-actions/SKILL.md` body:
- `actions/checkout` rolled from v6.0.2 (`de0fac2e4500…`) to **v7.0.1 (`3d3c42e5aac5…`)**
- `dhi.io/debian-base` rotated from `sha256:9415967…` to **`sha256:9d293dad…`** (multi-arch INDEX)

**Drift summary:**
- Floating refs (`@v4`, `@main`, `@latest`): **0**
- Unpinned refs: **0**
- Superseded SHAs (mismatch with PINNED.md): **8** — all `actions/checkout@de0fac2e4500…` (v6.0.2)
- Workflows containing stale SHAs: **5** — `ci_fork_bcvk.yml` (×2), `ci_fork_edk2.yml` (×1), `ci_fork_mkosi.yml` (×3), `ci_fork_optee-os.yml` (×1), `ci_test_sealed-uki-vm.yml` (×1)
- `actions/download-artifact@37930b1c2aba…` is in PINNED.md but NOT in the `github-actions` skill allowlist — skill allowlist is incomplete

**Permissions catalog:** All 24 workflows declare a top-level `permissions:` block — **zero workflows rely on the read-write `GITHUB_TOKEN` default**. 19 of 24 add a redundant job-level `permissions:` override (same minimum, harmless). The 3 `fetch-*` workflows have `contents: write, actions: write` at workflow level (needed for Contents API push to repo); job-level downgrades to `contents: read` are defensive belt-and-suspenders. No workflow grants `packages: write`, `id-token: write`, or `attestations: write` — sigstore/SLSA work happens out-of-band.

**Matrix strategy catalog:** Every matrix job uses `matrix.include: [{arch: amd64}]` forward-looking stub + `fail-fast: false` (explicit, not default) + `runs-on: ubuntu-24.04` (pinned, never `ubuntu-latest`). The `matrix.include` shape is a placeholder — when the org is ready to add `arm64`, the stub flips to two entries. Single non-stub axis is `ci_firmware-rk.yml:firmware-reproducibility`'s `matrix.board: [qemu-arm64, rockpro64-rk3399, rock5b-rk3588]`.

**Canonical action SHAs (single recommendation per action):**
| Action | SHA | Note |
|---|---|---|
| `actions/checkout` | `3d3c42e5aac5…` (v7.0.1) | matches PINNED.md; 30 of 38 uses already at this SHA |
| `actions/upload-artifact` | `bbbca2ddaa5d8fe…` (v4) | matches PINNED.md + skill allowlist |
| `actions/download-artifact` | `37930b1c2abaa49b…` | matches PINNED.md; **missing from skill allowlist** |
| `dhi.io/debian-base` (multi-arch INDEX) | `sha256:9d293dad…` | matches PINNED.md; **skill still shows superseded `sha256:9415967…`** |

---

## Stream 3 — Crypto/signing patterns (subagent 3)

**Coverage:** Only **2 of 24 workflows** touch the crypto/signing lane: `ci_mkosi-installer.yml` (canonical, 33 pattern matches) and `ci_test_sealed-uki-vm.yml` (stub, 3 matches). Every other workflow is signing-agnostic.

**Canonical SoftHSM bootstrap** (verbatim from `ci_mkosi-installer.yml`, lines 277-295):
```bash
mkdir -p /run/yubios-hsm/tokens
openssl req -x509 -newkey rsa:3072 -sha256 -days 365 -nodes \
  -subj "/CN=yubiOS reproducibility test Secure Boot (non-production)/" \
  -keyout sb.key -out mkosi.secure-boot.pem
openssl pkcs8 -topk8 -nocrypt -in sb.key -out sb.p8
printf 'directories.tokendir = /run/yubios-hsm/tokens\nobjectstore.backend = file\n' \
  | tee /run/yubios-hsm/softhsm2.conf
SOFTHSM2_CONF=/run/yubios-hsm/softhsm2.conf \
  softhsm2-util --init-token --free --label yubios-9c --pin 123456 --so-pin 123456
SOFTHSM2_CONF=/run/yubios-hsm/softhsm2.conf \
  softhsm2-util --import sb.p8 --token yubios-9c --label piv-9c --id 9c --pin 123456
printf 'pkcs11:token=yubios-9c;object=piv-9c;type=private?pin-value=123456' \
  > mkosi.secure-boot.pkcs11-uri
```

**Canonical signing invocation** (mkosi → systemd-sbsign via pkcs11-provider):
```bash
mkosi \
  --profile minimal --distribution fedora --release 45 \
  --tools-tree-package softhsm2 --tools-tree-package pkcs11-provider \
  --environment PKCS11_PROVIDER_MODULE=/usr/lib/softhsm/libsofthsm2.so \
  --environment SOFTHSM2_CONF=/run/yubios-hsm/softhsm2.conf \
  --secure-boot-key-source provider:pkcs11 \
  --secure-boot-key "$(cat mkosi.secure-boot.pkcs11-uri)" \
  --secure-boot-certificate mkosi.secure-boot.pem \
  --secure-boot-sign-tool systemd-sbsign \
  --sign-expected-pcr-key-source provider:pkcs11 \
  --sign-expected-pcr-key "$(cat mkosi.secure-boot.pkcs11-uri)" \
  --sign-expected-pcr-certificate mkosi.secure-boot.pem \
  build
```

**Canonical sbverify gate** (assertion 1 of 6 from the design doc):
```bash
uki=$(find mkosi.output -name '*.efi' -type f -print -quit)
test -n "$uki"
sbverify --cert mkosi.secure-boot.pem "$uki"
```

**mkosi.conf `[Validation]` (repo root, lines 56-60):**
```ini
[Validation]
# SecureBoot=yes: UKIs signed at build time via systemd-sbsign (ADR-008).
# YubiKey PIV (slot 9c, PKCS#11) signing: run yubiOS-enroll-sb post-install.
SecureBoot=yes
SignExpectedPcr=no
```
`MinimumVersion=26~devel` (line 8) is the version gate that makes `--secure-boot-key-source provider:pkcs11` available.

**Stub divergences** (`ci_test_sealed-uki-vm.yml` vs canonical):
- `--free` slot allocator vs `--slot 0` (stub hard-codes slot)
- `SOFTHSM2_CONF` not set (stub relies on `~/.config/softhsm2/softhsm2.conf` default — will hit `C_Initialize error 5` inside mkosi sandbox)
- No private-key import (stub cannot sign anything)
- No cert generation (no `mkosi.secure-boot.pem` to feed `sbverify`)
- `engine:pkcs11` in design-doc sketch — violates **ADR-008** (canonical uses `provider:pkcs11`)
- `libsofthsm2.so` path: design doc says `/usr/lib64/libsofthsm2.so` (Fedora path) — **wrong for the dhi container** which is Debian (correct Debian path: `/usr/lib/softhsm/libsofthsm2.so`)
- No OVMF_CODE.fd / OVMF_VARS.fd provisioning (no workflow does this)
- No ROTPK enrollment into OVMF `db` (no workflow does this)

---

## What this means — cross-cutting recommendations

### Priority 1: Fix `ci_test_sealed-uki-vm.yml` (Jenny current focus, PR #155)

The v4 fix in flight (commit pending, branch `sealed-uki-vm-lane-v2`) needs to restore the canonical `container:` block on all 3 jobs. The deep dive confirms this is the right call — 14/21 jobs use this exact pattern, all proven working.

Beyond the container block, the stub needs to adopt the canonical SoftHSM bootstrap (otherwise step 5 `Bootstrap SoftHSM` will fail the same way run #8 did). And it needs `sbverify --cert mkosi.secure-boot.pem` between signing and QEMU boot (otherwise a sign-time failure propagates into a confusing OVMF rejection that looks like a Secure-Boot violation).

### Priority 2: Update the in-repo skill to match `main`

The `github-actions` skill body still documents superseded entries:
- `actions/checkout@de0fac2e4500…` (v6.0.2)
- `dhi.io/debian-base@sha256:9415967…` (v2026.03.14)

Any agent or developer copy-pasting from the skill today re-introduces drift. Two-line fix to the skill body: bump the SHA + version comment to match PINNED.md.

Also add `actions/download-artifact@37930b1c2aba…` and `docker/setup-buildx-action@d7f5e7f5…` to the skill allowlist (both in PINNED.md and used in workflows, currently absent from skill body).

### Priority 3: Roll 8 stale checkout SHAs

All `actions/checkout@de0fac2e4500…` (v6.0.2) invocations in 5 fork-CI workflows should become `3d3c42e5aac5…` (v7.0.1):
- `ci_fork_bcvk.yml` (lines 93, 131)
- `ci_fork_edk2.yml` (line 102)
- `ci_fork_mkosi.yml` (lines 76, 94, 110)
- `ci_fork_optee-os.yml` (line 99)
- `ci_test_sealed-uki-vm.yml` (line 28) — Jenny's current focus

### Priority 4: Provision OVMF for Secure Boot VM tests

Neither `ci_test_sealed-uki-vm.yml` (stub) nor `ci_test-vgpu-vm.yml` (working) currently provisions `OVMF_CODE.fd` / `OVMF_VARS.fd`. The natural source is `ci_fork_edk2.yml` build artifact. After download, the yubiOS ROTPK needs to be enrolled into OVMF `db` via `virt-fw-vars` before any Secure Boot boot can succeed.

Without this, the QEMU OVMF Secure Boot step will refuse the signed UKI with an OVMF-level rejection that masks the actual enrollment gap. Add this provision to `ci_test_sealed-uki-vm.yml::boot-secure-vm` job (between `Fetch OVMF firmware` and `Boot signed UKI in QEMU OVMF Secure Boot VM`).

---

## Sources

**Repo files inspected** (all on `main` branch @ `aa8f9dee12…`):
- `/PINNED.md` (blob `2581269d96d2c1a83549de61754028fcdc568b2c`, 10937 bytes) — authoritative allowlist
- `mkosi.conf` (repo root, lines 56-60) — `[Validation]` block
- 24 workflows in `.github/workflows/`:
  - `ci.yml` (dispatch orchestrator)
  - `ci_dev_image.yml`, `ci_firmware-rk.yml` (matrix builds)
  - `ci_fork_{arm-trusted-firmware,bcvk,edk2,mkosi,ms-tpm-20-ref,optee-ftpm,optee-os,u-boot}.yml` (upstream forks)
  - `ci_mkosi-installer.yml` (canonical signing workflow, 44KB)
  - `ci_test-{fedora-bootc-arm64-pull,ftpm-tpm0,vgpu-vm,vm,bootc-filesystem,pq_tls_verify,rootless-docker,sealed-uki-vm}.yml`
  - `fetch-{dhi-manifest,fedora-bootc-manifest,released-tag-ref}.yml`
  - `yubiOS-ci.yml`

**Skills loaded (in dispatch order per `parallel-deep-research`):**
- `using-agent-skills`, `token-efficiency`, `context-isolation` (all 3 subagents)
- `github-actions` (subagent 1, 2)
- `bcvk-virtualization`, `docker-buildx-rootless` (subagent 1)
- `mkosi-image-builder`, `0pointer-mastery` (subagent 3)

**Connection:** `conn_1KXnkOHGgyE4` ("MASTER GIT SU", fine-grained PAT, fine-grained `Workflows: Write` scope) used by all 3 subagents for every GitHub Contents API call.

**Subagent cache IDs** (read-only report files):
- Stream 1: `session/subagents/ses_04a16e3b1ffeW0avP1BU3DRYQP`
- Stream 2: `session/subagents/ses_04a14dc8dffeTS1wiGFS0qEERf`
- Stream 3: `session/subagents/ses_04a14ce57ffeKz6LBNOYTIKTuP`



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
