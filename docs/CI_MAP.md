# yubi-OS/yubiOS — CI Architecture Map

> Regenerated 2026-10-05 from main `a8959116e56ff50ae083d423f2d9ec38a7ab42c2`
> (tree `fa4a6d6a58a2b91b8ca81cd1b25f43a303fcea5a`). Modeled on
> [ENDPOINTS.md](ENDPOINTS.md): every YAML automation surface in the repo is
> inventoried, grouped into capability domains, and cross-checked against the live
> tracker. The `.yml` files are the source of truth; this document is the
> architectural reference. [ci-launchpad](https://ci-launchpad-55qejzzz.sauna.new/)
> (Sauna app, updated 2026-10-05) now tracks every `.yml` file in the repo live via
> a git-tree census. [PINNED.md](../PINNED.md) remains the source of truth for
> approved action SHAs and image digests; `yubiOS-bake.hcl` remains the source of
> truth for every Docker build in the non-`ci_fork*` chain.

## Census

| Measure | Count |
|---|---|
| `.yml` files in the repo | 40 |
| GitHub Actions workflows (`.github/workflows/*.yml`) | 39 |
| Non-workflow YAML (`.github/FUNDING.yml`) | 1 |
| Workflows with `workflow_dispatch` | 39 |
| Scheduled workflows (`schedule:` cron) | 7 |
| Push-triggered workflows (branch/path-scoped) | 3 |
| Pull-request-triggered workflows (path-scoped) | 7 |
| `workflow_call`-callable workflows | 1 (`ci_test_sealed-uki-vm.yml`) |
| Total declared jobs across all workflows | 87 |
| Workflows in the ci.yml group taxonomy | 26 |
| Workflows outside any ci.yml group | 12 |
| Largest workflow file | `ci_firmware-rk.yml` (69,365 B) |

Supersedes the 2026-09-18 drift-check addendum: that record flagged the map's
counts vs the 39-workflow census and deferred the content pass to "the next pass" —
this document is that pass. The prior `group-routing-redesign` (PR #145) history
(no-chain model, no callback contract) is preserved below in condensed form.

## Capability Map

Eleven capability domains cover the 39 workflows. Domain membership is by dispatch
contract and blast radius, not filename convention alone.

| Domain | Workflows | Publishes |
|---|---|---|
| Orchestrator | `ci.yml` | nothing (fans out dispatches) |
| Image builders | `yubiOS-ci.yml`, `ci_dev_image.yml`, `ci_mkosi-installer.yml` | production, dev, installer OCI |
| Firmware lane | `ci_firmware-rk.yml` | firmware OCI (board-scoped) |
| Pre-image test chain | `ci_test_rootless-docker.yml`, `ci_test_bootc-filesystem.yml`, `ci_test_pq_tls_verify.yml`, `ci_test_sealed-uki-vm.yml`, `ci_test-fedora-bootc-arm64-pull.yml`, `ci_test-bootc-lifecycle.yml`, `ci_test-sysext-portable.yml`, `ci_test-ftpm-tpm0.yml` | nothing (evidence only) |
| VM e2e | `ci_test-vm.yml`, `ci_test-vgpu-vm.yml` | nothing (evidence only) |
| Fetches (pin refresh) | `fetch-dhi-manifest.yml`, `fetch-fedora-bootc-manifest.yml`, `fetch-released-tag-ref.yml` | commits to `PINNED.md` on drift |
| Fork component CI | 8 × `ci_fork_*.yml` | nothing (build/lint/test artifacts) |
| Governance + drift guards | `ci_input-shape.yml`, `ci_token-audit.yml`, `ci_dispatch-reachability.yml`, `ci_package-floor.yml`, `ci_fork-drift-detect.yml` | issues/exit codes on drift |
| Build fixtures | `ci_build-test-fixtures.yml` | fixture image tags (by convention immutable) |
| Research + diagnostics CI | `lean-check.yml`, `lean-run.yml`, `phonon-followups.yml`, `zernike-lens.yml`, `zernike-caustics.yml`, `zernike-spectrum.yml`, `diag_sign-matrix.yml` | nothing (papers/tools evidence) |
| Non-workflow | `.github/FUNDING.yml` | GitHub Sponsors config |

### Orchestrator (`ci.yml`)

Single `group:` choice input (`none / firmware / tests / vm-tests / fetches /
ci-builders / forks / all`), plus `reason`, `target_ref`, `Docker_push`. When
dispatched it fires one independent `workflow_dispatch` per workflow in the chosen
group's list, then exits. There is no state machine, no callback handoff, no
chain: every workflow in a group runs standalone from its own dispatch call, and
`Docker_push` propagates only to the four builder workflows (firmware,
yubiOS-ci, ci_dev_image, ci_mkosi-installer); every other workflow ignores it.

Key invariants:
- No chain: a group dispatch does not sequence its members; each runs independently.
- `Docker_push` is honored only by `ci_firmware-rk.yml`, `yubiOS-ci.yml`,
  `ci_dev_image.yml`, `ci_mkosi-installer.yml`.
- Re-running means re-dispatching (same group, or the workflow directly).
- Known defect (documented in the app, not fixed here): the `all` group lists
  `ci_test_pq_tsl_verify.yml` (typo `tsl` ≠ `tls`); under `set -euo pipefail`
  the dispatch loop dies on that 4th entry and never fires the remaining 16.

Composes with:
- ci-launchpad (the Sauna app fires the same `workflow_dispatch` calls with the
  full input schema visible, and tracks every `.yml` file in the repo).
- Every group member (independent dispatch targets).

### Image builders (production / dev / installer)

Three OCI builders, all Bake-driven from `yubiOS-bake.hcl`:

- `yubiOS-ci.yml` — production image (8 jobs: shellcheck, hadolint, unit-tests,
  mkosi config validation, build, merge-manifest, verify-attest, legacy
  ci-callback). Publishes per-arch tags then a `<sha>`/`latest` multi-arch index.
- `ci_dev_image.yml` — TEST-only image with software FIDO2 (swu2f, ADR-026).
  Publishes `dev-<sha>`/`dev`.
- `ci_mkosi-installer.yml` — mkosi disk image + signed-UKI verification +
  ARM64 reproducibility proof + installer artifact. Publishes `installer[-sha]`.

Key invariants:
- Every build passes the `yubiOS.rego` OPA policy (`reset=true, strict=true`).
- Reproducibility: production, dev, and installer each build their subject twice
  in clean ARM64 jobs and compare canonical bytes; signed envelopes (installer
  signatures, QEMU's random TF-A signing envelope, external-TPL-dependent
  RK3588 final image) are recorded but excluded from byte equality.
- Publication is two-stage for prod/dev (per-arch tags, then `imagetools`
  multi-arch index) and direct registry-export for firmware/installer.

Composes with:
- Bake `_policy` / `_source-metadata` / `_image-export` / `_yubios-base` hidden targets.
- `fetch-*` workflows (consume the digests `PINNED.md` pins).

### Firmware lane (`ci_firmware-rk.yml`)

The orchestrated ARM64/RK firmware integration: StandaloneMM RPMB build
(amd64 + primary/rebuild arm64), OP-TEE/fTPM/TF-A/U-Boot board builds (QEMU,
RK3399, RK3588), a blocking unsigned-component equality proof before QEMU,
QEMU fTPM e2e asserts, then optional board-scoped publication through the Bake
`firmware` target. 69 KB, 6 jobs, the largest workflow in the repo.

Key invariants:
- Blocking comparison of intended unsigned components (per-board 30-day JSON
  evidence) runs before QEMU executes.
- The RK3588 TPL publish gate refuses publication when the external TPL
  dependency is unresolved (OMN-56).
- Board-scoped tags (`firmware-qemu-arm64`, `firmware-rock5b-rk3588`,
  `firmware-rockpro64-rk3399`); the QEMU board keeps the compatibility
  `firmware` tags.

Composes with:
- The 8 fork workflows (component artifacts feed stitching, conceptually; the
  fork workflows validate pinned forks but do not stitch).
- `ci_test-ftpm-tpm0.yml` and the VM lane (consume `firmware-qemu-arm64`).

### Pre-image test chain

Eight workflows that validate the system before or beside image publication:

- `ci_test_rootless-docker.yml` — rootless daemon + hardened Buildx builder
  across step boundaries (amd64/arm64 in the pinned DHI container).
- `ci_test_bootc-filesystem.yml` — bootc install-to-filesystem on a disposable
  GPT disk: strict fs-verity composefs proof, EROFS metadata validation,
  unsealed BLS classification, omitted `root=`.
- `ci_test_pq_tls_verify.yml` — PQ hybrid TLS drift check (ADR-025),
  non-blocking, cacheonly Bake target.
- `ci_test_sealed-uki-vm.yml` — sealed-UKI Secure Boot VM e2e (PR #155 green at
  V83); the only `workflow_call`-callable workflow (5 jobs incl. negative
  tamper tests).
- `ci_test-fedora-bootc-arm64-pull.yml` — arm64 pull integrity of the pinned
  fedora-bootc index digest (OMN-139).
- `ci_test-bootc-lifecycle.yml` — bootc upgrade/rollback + homed migration
  (OMN-156); VM legs optional on the self-hosted arm64 rock1 runner.
- `ci_test-sysext-portable.yml` — sysext attach/detach + portable-service
  activation (OMN-156); same optional VM-legs shape.
- `ci_test-ftpm-tpm0.yml` — fTPM `/dev/tpm0` guest verify against the published
  QEMU ARM64 firmware (OMN-96); Stage B (in-guest Linux payload) opt-in.

Key invariants:
- All are `workflow_dispatch`-only by default; the two lifecycle/sysext
  workflows also run Monday-cron and on path-scoped PRs touching their files.
- VM legs gate on `run_vm_legs` + the `["self-hosted","Linux","ARM64","KVM"]`
  runner selector (rock1); hosted amd64 legs loud-skip with ADR-023 rationale.
- Evidence-only: none publish artifacts to a registry.

### VM e2e lane

`ci_test-vm.yml` and `ci_test-vgpu-vm.yml` (61 KB — the second largest file) run
the final VM e2e: bcvk built at pinned source, hard `/dev/kvm` gate, yubiOS
image pulled into Podman storage, mandatory CTAP2/LUKS2/homed/ed25519-sk
assertions. The vGPU variant adds the vGPU/virtio CI legs; both carry the
DESTRUCTIVE `hw_device` input (spare block device on rock1, wipes it) and the
real-U2F guard (`ALLOW_REAL_U2F=1` required on rock1 because a physical
YubiKey is attached; PR #144 refuses to silently run passless tests there).

Key invariants:
- The `hw_device` input is destructive and opt-in only; it never runs on push.
- The VM lane intentionally stays outside Bake (bcvk reads Podman's local store).
- ARM64 DirectBoot delivers the public root key via the systemd kernel
  command-line `tmpfiles.extra` credential path.

### Fetches (pin refresh)

Three workflows that keep `PINNED.md` honest: `fetch-dhi-manifest.yml` (DHI
Debian base digests), `fetch-fedora-bootc-manifest.yml` (fedora-bootc index
digest), `fetch-released-tag-ref.yml` (nine fork/upstream release mappings,
peeled commits verified from each fork). All commit updated pins themselves when
drift exists; none are scheduled (manual dispatch, historically via the
`fetches` group).

### Fork component CI

Eight `ci_fork_*.yml` workflows build/lint/test the yubi-OS forks at immutable
release or approved release-descendant commits pinned by
`fetch-released-tag-ref.yml`: mkosi (validate-profile/shellcheck/ruff), bcvk
(unit-tests/clippy), TF-A, OP-TEE OS, ms-tpm-20-ref, optee_ftpm, U-Boot, edk2
(StandaloneMM). None stitch a full firmware image; stitching is
`ci_firmware-rk.yml`'s job. Fork runs are manual-only since PR #145 (the four
former path-scoped upstream-sync auto-runs were removed; dispatch the `forks`
group to re-pin and validate).

### Governance + drift guards

Five scheduled/path-scoped guard workflows that watch the CI surface itself:

| Workflow | Cron (UTC) | PR trigger | What it guards |
|---|---|---|---|
| `ci_input-shape.yml` | `0 9 * * 1` (Mon 09:00) | paths (workflows) | workflow_dispatch input shapes (OMN-158) |
| `ci_token-audit.yml` | `0 9 * * 1` (Mon 09:00) | paths (workflows) | workflow token scopes (OMN-161) |
| `ci_dispatch-reachability.yml` | `0 9 * * 1` (Mon 09:00) | paths (workflows) | workflow_dispatch→group reachability (OMN-159) |
| `ci_package-floor.yml` | `0 6 * * *` (daily) | paths (mkosi) | package version floors against the dev image (OMN-62) |
| `ci_fork-drift-detect.yml` | `0 6 * * *` (daily) | — | fork/upstream drift beyond a commit threshold (OMN-160) |

All accept a `fail_on` choice (default ERROR) or analogous threshold input and
are designed to file issues / exit non-zero on drift. `ci_input-shape`,
`ci_token-audit`, and `ci_dispatch-reachability` are also the PR-time
self-edit validators for workflow file changes (path-scoped `pull_request`
triggers — the one class of automatic trigger PR #145 deliberately kept).

### Build fixtures

`ci_build-test-fixtures.yml` builds and optionally pushes the test-fixture
image tags consumed by other workflows. Push is opt-in via input (`tag`,
default `v1`, immutable by convention; `push` input defaults true on dispatch,
build-only on the path-scoped push trigger).

### Research + diagnostics CI

Seven workflows serving the papers/ + tools/ research corpus:

- `lean-check.yml` — Lean CI: machine-checks CurvedCorpus.lean + §10-§13 on
  push to `main`/`lean-check-*` (path-scoped) or dispatch; also runs
  verify-measurements (published constants) and verify-tools (tool selftests,
  incl. the edge-standard suite added 2026-10-05).
- `lean-run.yml` — real-corpus CI companion: asserts the published corpus level
  and statement distribution on the real refs/ corpus.
- `phonon-followups.yml` — runs `papers/scripts/phonon_followups.py` on push to
  `phonon-followups-*` (path-scoped) or dispatch.
- `zernike-lens.yml`, `zernike-caustics.yml`, `zernike-spectrum.yml` — the
  Zernike program's three single-job runners (lens recon/classify, caustic
  fold classification, spectral channel).
- `diag_sign-matrix.yml` — UKI signing matrix across 10 variants (dispatch
  only, `workflow_dispatch: {}`).

All run on hosted `ubuntu-latest`; none publish anything.

### Non-workflow YAML

`.github/FUNDING.yml` (26 B) — GitHub Sponsors configuration, not an automation.
Listed in the census because the tracker now covers every `.yml` in the repo and
must be able to say so honestly.

## Architecture Diagrams

```mermaid
flowchart TD
    op["operator / ci-launchpad / cron"] --> ci["ci.yml workflow_dispatch\ngroup: single choice input"]
    ci --> g0["none → no dispatch"]
    ci --> g1["firmware → ci_firmware-rk"]
    ci --> g2["tests → 9 workflows\n(rootless, bootc-fs, pq-tls, sealed-uki,\nfedora-pull, bootc-lifecycle, sysext,\nftpm-tpm0, diag_sign-matrix)"]
    ci --> g3["vm-tests → ci_test-vm, ci_test-vgpu-vm"]
    ci --> g4["fetches → 3 fetch workflows"]
    ci --> g5["ci-builders → yubiOS-ci, ci_dev_image, ci_mkosi-installer"]
    ci --> g6["forks → 8 ci_fork_*"]
    ci --> g7["all → 26 independent dispatches"]
```

```mermaid
flowchart TD
    subgraph guards["Governance cadence (UTC)"]
        mon9["Mon 09:00\ninput-shape · token-audit · dispatch-reachability"]
        daily6["Daily 06:00\npackage-floor · fork-drift-detect"]
        mon6["Mon 06:00\nbootc-lifecycle · sysext-portable"]
    end
    subgraph pushlanes["Push lanes (path-scoped)"]
        leanpush["push main / lean-check-*\nlean-check + lean-run"]
        phononpush["push phonon-followups-*\nphonon-followups"]
        prpaths["PR paths on workflow files\ninput-shape · token-audit · dispatch-reachability"]
    end
```

```mermaid
flowchart TD
    policy["_policy\nyubiOS.rego (reset + strict)"]
    metadata["_source-metadata"]
    exporter["_image-export"]
    base["_yubios-base\nContainerfile"]
    prod["yubios (production)"]
    dev["yubios-dev (TEST)"]
    inst["installer"]
    fw["firmware"]
    pq["pq-tls-verify (cacheonly)"]
    policy --> base
    metadata --> base
    base --> prod
    exporter --> prod
    base --> dev
    exporter --> dev
    policy --> inst
    exporter --> inst
    policy --> fw
    exporter --> fw
    policy --> pq
```

## Canonical Docker Bake Graph

`yubiOS-bake.hcl` owns every Docker build in the non-fork chain. Four hidden
targets provide the shared contract: `_policy` (exactly one `yubiOS.rego` with
`reset=true, strict=true`), `_source-metadata` (source/revision OCI labels),
`_image-export` (Docker output with provenance and manifest-list mode disabled
when `PUSH=false`; registry output with both retained when `PUSH=true`), and
`_yubios-base` (the pinned production Containerfile build). The design
rationale lives in [the Bake consolidation note](../refs/docker-bake-consolidation-2026-07-17.md).

| Workflow | CI target/group | Explicit publication target |
|---|---|---|
| `yubiOS-ci.yml` | `yubios-ci` (`yubios` + `yubios-smoke`) | `yubios` |
| `ci_dev_image.yml` | `yubios-dev-ci` (`yubios-dev` + `yubios-dev-smoke`) | `yubios-dev` |
| `ci_firmware-rk.yml` | none unless publication requested | `firmware` |
| `ci_mkosi-installer.yml` | DHI-contained mkosi validation + ARM64 comparison | `installer` |
| `ci_test_pq_tls_verify.yml` | `pq-tls-verify` | none (cacheonly) |

Publication shape: prod/dev publish per-arch tags through Bake then assemble the
multi-arch index with `imagetools`; firmware/installer publish directly with the
registry exporter from privileged DHI container jobs on user-scoped `hardened`
builders.

## Full .yml Inventory

Every `.yml` file in the repo, generated from the main tree at regeneration
time (trigger labels condensed; "ext inputs" counts non-`ci_*` workflow_dispatch
inputs; "jobs" counts declared jobs).

| File | Workflow name | Kind | Triggers | ext inputs | jobs |
|---|---|---|---|---|---|
| `.github/workflows/ci.yml` | CI | workflow | workflow_dispatch | 4 | 1 |
| `.github/workflows/ci_build-test-fixtures.yml` | ci_build-test-fixtures | workflow | workflow_dispatch + push (branch/paths) | 2 | 1 |
| `.github/workflows/ci_dev_image.yml` | yubiOS dev/test image (swu2f, ADR-026) | workflow | workflow_dispatch | 6 | 4 |
| `.github/workflows/ci_dispatch-reachability.yml` | ci_dispatch-reachability | workflow | workflow_dispatch + schedule + pull_request (paths) | 1 | 1 |
| `.github/workflows/ci_firmware-rk.yml` | yubiOS RK firmware | workflow | workflow_dispatch | 16 | 6 |
| `.github/workflows/ci_fork-drift-detect.yml` | ci_fork-drift-detect | workflow | workflow_dispatch + schedule | 2 | 1 |
| `.github/workflows/ci_fork_arm-trusted-firmware.yml` | ci_fork_arm-trusted-firmware | workflow | workflow_dispatch | 2 | 2 |
| `.github/workflows/ci_fork_bcvk.yml` | ci_fork_bcvk | workflow | workflow_dispatch | 3 | 3 |
| `.github/workflows/ci_fork_edk2.yml` | ci_fork_edk2 | workflow | workflow_dispatch | 2 | 2 |
| `.github/workflows/ci_fork_mkosi.yml` | ci_fork_mkosi | workflow | workflow_dispatch | 1 | 4 |
| `.github/workflows/ci_fork_ms-tpm-20-ref.yml` | ci_fork_ms-tpm-20-ref | workflow | workflow_dispatch | 2 | 2 |
| `.github/workflows/ci_fork_optee-ftpm.yml` | ci_fork_optee_ftpm | workflow | workflow_dispatch | 2 | 2 |
| `.github/workflows/ci_fork_optee-os.yml` | ci_fork_optee_os | workflow | workflow_dispatch | 2 | 2 |
| `.github/workflows/ci_fork_u-boot.yml` | ci_fork_u-boot | workflow | workflow_dispatch | 2 | 2 |
| `.github/workflows/ci_input-shape.yml` | ci_input-shape | workflow | workflow_dispatch + schedule + pull_request (paths) | 1 | 1 |
| `.github/workflows/ci_mkosi-installer.yml` | yubiOS mkosi-installer | workflow | workflow_dispatch | 15 | 6 |
| `.github/workflows/ci_package-floor.yml` | ci_package-floor | workflow | workflow_dispatch + schedule + pull_request (paths) | 1 | 1 |
| `.github/workflows/ci_test-bootc-lifecycle.yml` | ci_test-bootc-lifecycle | workflow | workflow_dispatch + schedule + pull_request (paths) | 4 | 2 |
| `.github/workflows/ci_test-fedora-bootc-arm64-pull.yml` | yubiOS fedora-bootc arm64 pull integrity (OMN-139) | workflow | workflow_dispatch | 1 | 1 |
| `.github/workflows/ci_test-ftpm-tpm0.yml` | yubiOS fTPM /dev/tpm0 guest verify (OMN-96) | workflow | workflow_dispatch | 4 | 1 |
| `.github/workflows/ci_test-sysext-portable.yml` | ci_test-sysext-portable | workflow | workflow_dispatch + schedule + pull_request (paths) | 5 | 2 |
| `.github/workflows/ci_test-vgpu-vm.yml` | yubiOS vGPU VM e2e (tests/vm) | workflow | workflow_dispatch | 8 | 3 |
| `.github/workflows/ci_test-vm.yml` | yubiOS VM e2e (tests/vm) | workflow | workflow_dispatch | 8 | 3 |
| `.github/workflows/ci_test_bootc-filesystem.yml` | TEST - bootc to-filesystem install e2e | workflow | workflow_dispatch | 2 | 2 |
| `.github/workflows/ci_test_pq_tls_verify.yml` | TEST - PQ hybrid TLS verification (ADR-025) | workflow | workflow_dispatch | 2 | 2 |
| `.github/workflows/ci_test_rootless-docker.yml` | TEST - Rootless Docker bootstrap validation | workflow | workflow_dispatch | 3 | 2 |
| `.github/workflows/ci_test_sealed-uki-vm.yml` | TEST - sealed UKI Secure Boot VM e2e | workflow | workflow_dispatch + workflow_call | 9 | 3 |
| `.github/workflows/ci_token-audit.yml` | ci_token-audit | workflow | workflow_dispatch + schedule + pull_request (paths) | 1 | 1 |
| `.github/workflows/diag_sign-matrix.yml` | DIAG - UKI signing matrix (10 variants) | workflow | workflow_dispatch (no inputs) | 1 | 1 |
| `.github/workflows/fetch-dhi-manifest.yml` | fetch-dhi-manifest | workflow | workflow_dispatch | 1 | 2 |
| `.github/workflows/fetch-fedora-bootc-manifest.yml` | fetch-fedora-bootc-manifest | workflow | workflow_dispatch | 1 | 2 |
| `.github/workflows/fetch-released-tag-ref.yml` | fetch-released-tag-ref | workflow | workflow_dispatch | 1 | 2 |
| `.github/workflows/lean-check.yml` | lean-check | workflow | workflow_dispatch + push (branch/paths) | 1 | 3 |
| `.github/workflows/lean-run.yml` | lean-run | workflow | workflow_dispatch + push (branch/paths) | 1 | 2 |
| `.github/workflows/phonon-followups.yml` | phonon-followups | workflow | workflow_dispatch + push (branch/paths) | 1 | 1 |
| `.github/workflows/yubiOS-ci.yml` | yubiOS CI | workflow | workflow_dispatch | 11 | 8 |
| `.github/workflows/zernike-caustics.yml` | zernike-caustics | workflow | workflow_dispatch | 1 | 1 |
| `.github/workflows/zernike-lens.yml` | zernike-lens | workflow | workflow_dispatch (no inputs) | 0 | 1 |
| `.github/workflows/zernike-spectrum.yml` | zernike-spectrum | workflow | workflow_dispatch (no inputs) | 0 | 1 |
| `.github/FUNDING.yml` | (n/a) | non-workflow | non-workflow YAML | 0 | 0 |

Per-file job trees (jobs with declared step counts, generated):

#### `.github/workflows/ci.yml` — CI

Triggers: workflow_dispatch. Jobs (1): `dispatch` (1 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_build-test-fixtures.yml` — ci_build-test-fixtures

Triggers: workflow_dispatch · push (branch/paths). Jobs (1): `build-fixtures` (3 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_dev_image.yml` — yubiOS dev/test image (swu2f, ADR-026)

Triggers: workflow_dispatch. Jobs (4): `build` (9 steps), `merge-manifest` (9 steps), `verify-attest` (4 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_dispatch-reachability.yml` — ci_dispatch-reachability

Triggers: workflow_dispatch · schedule  · pull_request (paths). Jobs (1): `assert` (5 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_firmware-rk.yml` — yubiOS RK firmware

Triggers: workflow_dispatch. Jobs (6): `stmm` (11 steps), `optee_fip` (17 steps), `firmware-reproducibility` (10 steps), `qemu` (10 steps), `firmware-publish` (11 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_fork-drift-detect.yml` — ci_fork-drift-detect

Triggers: workflow_dispatch · schedule . Jobs (1): `detect` (6 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_fork_arm-trusted-firmware.yml` — ci_fork_arm-trusted-firmware

Triggers: workflow_dispatch. Jobs (2): `build-tfa` (8 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_fork_bcvk.yml` — ci_fork_bcvk

Triggers: workflow_dispatch. Jobs (3): `unit-tests` (5 steps), `clippy` (3 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_fork_edk2.yml` — ci_fork_edk2

Triggers: workflow_dispatch. Jobs (2): `build-standalonemm` (6 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_fork_mkosi.yml` — ci_fork_mkosi

Triggers: workflow_dispatch. Jobs (4): `validate-profile` (4 steps), `shellcheck` (3 steps), `ruff` (4 steps), `ci-callback` (1 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_fork_ms-tpm-20-ref.yml` — ci_fork_ms-tpm-20-ref

Triggers: workflow_dispatch. Jobs (2): `build-ms-tpm-20-ref` (6 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_fork_optee-ftpm.yml` — ci_fork_optee_ftpm

Triggers: workflow_dispatch. Jobs (2): `build-ftpm-ta` (6 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_fork_optee-os.yml` — ci_fork_optee_os

Triggers: workflow_dispatch. Jobs (2): `build-optee` (4 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_fork_u-boot.yml` — ci_fork_u-boot

Triggers: workflow_dispatch. Jobs (2): `build-uboot` (7 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_input-shape.yml` — ci_input-shape

Triggers: workflow_dispatch · schedule  · pull_request (paths). Jobs (1): `validate` (5 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_mkosi-installer.yml` — yubiOS mkosi-installer

Triggers: workflow_dispatch. Jobs (6): `build` (14 steps), `installer-reproducibility` (8 steps), `installer-publish` (10 steps), `merge-manifest` (8 steps), `verify-attest` (4 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_package-floor.yml` — ci_package-floor

Triggers: workflow_dispatch · schedule  · pull_request (paths). Jobs (1): `verify-floor` (4 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_test-bootc-lifecycle.yml` — ci_test-bootc-lifecycle

Triggers: workflow_dispatch · schedule  · pull_request (paths). Jobs (2): `test-upgrade` (5 steps), `test-homed-migrate` (5 steps). Runner(s): ${{ inputs.run_vm_legs == true && fromJSON('["self-hosted","Linux","ARM64","KVM"]') || 'ubuntu-24.04' }}.

#### `.github/workflows/ci_test-fedora-bootc-arm64-pull.yml` — yubiOS fedora-bootc arm64 pull integrity (OMN-139)

Triggers: workflow_dispatch. Jobs (1): `pull-arm64-integrity` (4 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_test-ftpm-tpm0.yml` — yubiOS fTPM /dev/tpm0 guest verify (OMN-96)

Triggers: workflow_dispatch. Jobs (1): `ftpm-tpm0-verify` (7 steps). Runner(s): ${{ matrix.runner }}.

#### `.github/workflows/ci_test-sysext-portable.yml` — ci_test-sysext-portable

Triggers: workflow_dispatch · schedule  · pull_request (paths). Jobs (2): `test-sysext` (5 steps), `test-portable` (5 steps). Runner(s): ${{ inputs.run_vm_legs == true && fromJSON('["self-hosted","Linux","ARM64","KVM"]') || 'ubuntu-24.04' }}.

#### `.github/workflows/ci_test-vgpu-vm.yml` — yubiOS vGPU VM e2e (tests/vm)

Triggers: workflow_dispatch. Jobs (3): `lint-vm-scripts` (2 steps), `vgpu-vm-e2e` (32 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_test-vm.yml` — yubiOS VM e2e (tests/vm)

Triggers: workflow_dispatch. Jobs (3): `lint-vm-scripts` (2 steps), `vm-e2e` (24 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_test_bootc-filesystem.yml` — TEST - bootc to-filesystem install e2e

Triggers: workflow_dispatch. Jobs (2): `install-to-filesystem` (6 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_test_pq_tls_verify.yml` — TEST - PQ hybrid TLS verification (ADR-025)

Triggers: workflow_dispatch. Jobs (2): `pq-tls-verify` (5 steps), `ci-callback` (1 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/ci_test_rootless-docker.yml` — TEST - Rootless Docker bootstrap validation

Triggers: workflow_dispatch. Jobs (2): `rootless-docker` (2 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_test_sealed-uki-vm.yml` — TEST - sealed UKI Secure Boot VM e2e

Triggers: workflow_dispatch · workflow_call. Jobs (3): `build-and-verify-uki` (9 steps), `boot-secure-vm` (4 steps), `negative-tamper-tests` (5 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/ci_token-audit.yml` — ci_token-audit

Triggers: workflow_dispatch · schedule  · pull_request (paths). Jobs (1): `audit` (5 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/diag_sign-matrix.yml` — DIAG - UKI signing matrix (10 variants)

Triggers: workflow_dispatch: {}. Jobs (1): `sign-variant` (4 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/fetch-dhi-manifest.yml` — fetch-dhi-manifest

Triggers: workflow_dispatch. Jobs (2): `fetch` (2 steps), `ci-callback` (1 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/fetch-fedora-bootc-manifest.yml` — fetch-fedora-bootc-manifest

Triggers: workflow_dispatch. Jobs (2): `fetch` (2 steps), `ci-callback` (1 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/fetch-released-tag-ref.yml` — fetch-released-tag-ref

Triggers: workflow_dispatch. Jobs (2): `fetch-release-refs` (2 steps), `ci-callback` (1 steps). Runner(s): ubuntu-24.04.

#### `.github/workflows/lean-check.yml` — lean-check

Triggers: workflow_dispatch · push (branch/paths). Jobs (3): `check` (20 steps), `verify-measurements` (4 steps), `verify-tools` (15 steps). Runner(s): ubuntu-latest.

#### `.github/workflows/lean-run.yml` — lean-run

Triggers: workflow_dispatch · push (branch/paths). Jobs (2): `run-real-corpus` (10 steps), `run-real-statements` (2 steps). Runner(s): ubuntu-latest.

#### `.github/workflows/phonon-followups.yml` — phonon-followups

Triggers: workflow_dispatch · push (branch/paths). Jobs (1): `followups` (3 steps). Runner(s): ubuntu-latest.

#### `.github/workflows/yubiOS-ci.yml` — yubiOS CI

Triggers: workflow_dispatch. Jobs (8): `shellcheck` (2 steps), `hadolint` (2 steps), `unit-tests` (4 steps), `mkosi` (3 steps), `build` (9 steps), `merge-manifest` (8 steps), `verify-attest` (4 steps), `ci-callback` (1 steps). Runner(s): ${{ matrix.runner }}; ubuntu-24.04.

#### `.github/workflows/zernike-caustics.yml` — zernike-caustics

Triggers: workflow_dispatch. Jobs (1): `caustics` (3 steps). Runner(s): ubuntu-latest.

#### `.github/workflows/zernike-lens.yml` — zernike-lens

Triggers: workflow_dispatch. Jobs (1): `zernike-lens` (3 steps). Runner(s): ubuntu-latest.

#### `.github/workflows/zernike-spectrum.yml` — zernike-spectrum

Triggers: workflow_dispatch. Jobs (1): `zernike` (4 steps). Runner(s): ubuntu-latest.

#### `.github/FUNDING.yml`

Triggers: non-workflow YAML. Jobs (0): (no jobs — declarative only). Runner(s): —.

## Documented vs Code (ci-launchpad cross-check)

ci-launchpad (the Sauna CI app) is the live tracker for this surface. Its
hand-maintained group taxonomy covered 27 files (26 group members + ci.yml);
12 workflows existed on main but sat outside any group:

`ci_build-test-fixtures.yml`, `ci_dispatch-reachability.yml`,
`ci_fork-drift-detect.yml`, `ci_input-shape.yml`, `ci_package-floor.yml`,
`ci_token-audit.yml`, `lean-check.yml`, `lean-run.yml`,
`phonon-followups.yml`, `zernike-caustics.yml`, `zernike-lens.yml`,
`zernike-spectrum.yml`

Updated 2026-10-05: the app now derives its workflow set from a full-repo
git-tree census (one `GET /repos/yubi-OS/yubiOS/git/trees/main?recursive=1`
call filtered to `*.yml`) and auto-adopts every `.github/workflows/*.yml` it
finds into run tracking, so the doc/app gap class above can no longer occur
silently — a new workflow file becomes tracked on the next status poll after
it lands on main. Non-workflow YAML (`.github/FUNDING.yml`) is inventoried in
the app's `/api/yml-inventory` endpoint (with kind, path, and blob sha) but not
run-tracked, since it has no Actions surface.

Cross-check at regeneration time:

| Measure | Count |
|---|---|
| `.yml` files in repo census | 40 |
| Workflows run-tracked by ci-launchpad | 39 |
| Non-workflow YAML inventoried (not run-tracked) | 1 |
| Files in the app's static group taxonomy | 27 |
| Files reachable via taxonomy + auto-adoption | 39 |
| Doc-only entries (documented, not on main) | 0 |
| Code-only entries (on main, undocumented here) | 0 |

Known issues carried forward (documented in the app, not fixed in this pass):

- `ci.yml` `all` group typo: `ci_test_pq_tsl_verify.yml` (`tsl` ≠ `tls`) kills
  the dispatch loop after 3 entries under `set -euo pipefail`.
- Several child workflows still declare the legacy `ci_*` internal inputs from
  the pre-#145 callback-chain design; ci-launchpad filters them out of its
  trigger UI and the workflows' defaults apply.

## Trigger policy

- 26 group members + ci.yml: dispatch-driven only (manual or via the app).
- 7 workflows also run on cron: the 3 workflow-file guards (Mondays 09:00 UTC),
  package-floor + fork-drift-detect (daily 06:00 UTC), bootc-lifecycle +
  sysext-portable (Mondays 06:00 UTC).
- 3 workflows also run on path-scoped push: lean-check/lean-run (main +
  `lean-check-*`), phonon-followups (`phonon-followups-*`).
- 7 workflows also validate on path-scoped pull requests (the 3 guards,
  package-floor, bootc-lifecycle, sysext-portable — each scoped to its own
  files/inputs).
- 1 workflow is `workflow_call`-callable: `ci_test_sealed-uki-vm.yml`.
- No workflow dispatches another workflow back; the callback contract is gone
  (PR #145). The `ci-callback` jobs still present in some child workflows are
  legacy no-ops kept for history.

## Drift discipline

This document is regenerated, not maintained by hand-edits: the census and
inventory blocks are generated from the workflow YAMLs themselves, and the
ci-launchpad `/api/yml-inventory` endpoint can produce the same 40-file census
on demand (one git-tree call), so the map's counts can be re-verified in a
single API call at any time. The 2026-09-18 addendum pattern (a drift record
flagging count mismatches, deferring the fix) is replaced by: any session
touching a workflow file re-runs the census and appends a dated drift note if
counts moved.
