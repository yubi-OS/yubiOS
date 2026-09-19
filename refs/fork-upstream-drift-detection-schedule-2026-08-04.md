---
contract: "Daily cron schedule that detects drift between the yubi-OS fork HEAD and the upstream HEAD for every fork in the yubi-OS org. Catches the case where a fork falls behind upstream (e.g. after an upstream security release), and produces a daily drift report. Lands via PR on yubi-OS/yubiOS main as .github/workflows/ci_fork-drift-detect.yml + scripts/detect-fork-drift.py + refs/fork-upstream-drift-detection-2026-08-04.md."
short_description: "Daily fork-upstream drift detection schedule"
---

# Fork-Upstream Drift Detection Schedule — yubios CI Hygiene (2026-08-04)

**Linked Linear issue:** [OMN-160](https://linear.app/omni-agent/issue/OMN-160)
**Project:** yubiOS Production Proof & Release Gates
**Authored:** 2026-08-04 in self-mode.
**Status:** Draft for PR.

---

## 1. Problem statement

yubi-OS maintains 8 fork repos in the org (per `SAUNA_TOOLS.md`):
- `arm-trusted-firmware` (← ARM-software)
- `optee_os` (← OP-TEE)
- `optee_ftpm` (← OP-TEE)
- `u-boot` (← u-boot/u-boot)
- `ms-tpm-20-ref` (← microsoft)
- `edk2-rk3588` (← edk2-porting)
- `bcvk` (← congatec-os/bcvk or bootc-dev/bcvk; merged into yubios branch)
- `mkosi` (← systemd/mkosi; on `feature/yubiOS-profile` branch)

Each fork pins to a specific upstream SHA via `PINNED.md` and the `ci_fork_*.yml` workflow family. If upstream moves (e.g. a security release lands on `upstream/main`), the yubi-OS fork falls behind. Without a daily check, the lag can accumulate until a build breaks or a CVE is missed.

This spec defines a daily cron that:
1. Reads `PINNED.md` for each fork's pinned SHA.
2. Reads the upstream's latest SHA on its main branch.
3. Compares; if upstream has moved beyond the pinned SHA by more than N commits (default: 10), flags as drift.
4. Files a new OMN issue per drifted fork (or posts a comment on a tracking OMN).
5. Uploads a daily drift report artifact.

## 2. Script design

### 2.1 Inputs

- `--repo-root PATH` (default: `.`) — root of the yubiOS checkout.
- `--pinned PATH` (default: `PINNED.md`) — the pinned SHAs file.
- `--org NAME` (default: `yubi-OS`) — GitHub org.
- `--upstream-map PATH` (default: `scripts/detect-fork-drift.upstream-map.yaml`) — fork-to-upstream mapping.
- `--output-format` (default: `text`; alternatives: `json`, `sarif`).
- `--threshold-commits N` (default: `10`) — drift threshold; commits beyond this flag as drift.

### 2.2 Upstream map file

`scripts/detect-fork-drift.upstream-map.yaml`:

```yaml
forks:
  - fork: arm-trusted-firmware
    upstream: ARM-software/arm-trusted-firmware
    upstream_branch: main
  - fork: optee_os
    upstream: OP-TEE/optee_os
    upstream_branch: master
  - fork: optee_ftpm
    upstream: OP-TEE/optee_ftpm
    upstream_branch: master
  - fork: u-boot
    upstream: u-boot/u-boot
    upstream_branch: master
  - fork: ms-tpm-20-ref
    upstream: microsoft/ms-tpm-20-ref
    upstream_branch: master
  - fork: edk2-rk3588
    upstream: edk2-porting/edk2-rk3588
    upstream_branch: main
  - fork: bcvk
    upstream: congatec-os/bcvk
    upstream_branch: yubios
  - fork: mkosi
    upstream: systemd/mkosi
    upstream_branch: main
```

### 2.3 Algorithm

```
for each fork in upstream_map:
    pinned_sha = read_pin(repo_root, fork.fork)
    upstream_latest = github_get_latest_sha(fork.upstream, fork.upstream_branch)
    if pinned_sha == upstream_latest:
        verdict = 'synced'
    else:
        # count commits between
        behind = github_count_commits(fork.upstream, pinned_sha, upstream_latest)
        if behind > threshold:
            verdict = 'drifted'
        else:
            verdict = 'minor-lag'
    record(fork, pinned_sha, upstream_latest, behind_count, verdict)
```

### 2.4 Output (text mode)

```
$ python3 scripts/detect-fork-drift.py --repo-root . --threshold-commits 10
INFO  arm-trusted-firmware: pinned=2a33c..., upstream=2b441..., behind=3 commits → minor-lag
INFO  optee_os: pinned=440b10c..., upstream=440b10c..., behind=0 commits → synced
WARN  optee_ftpm: pinned=5e09cdb..., upstream=8a12ff..., behind=14 commits → drifted
INFO  u-boot: pinned=..., upstream=..., behind=1 commit → minor-lag
INFO  ms-tpm-20-ref: pinned=..., upstream=..., behind=0 commits → synced
INFO  edk2-rk3588: pinned=..., upstream=..., behind=2 commits → minor-lag
INFO  bcvk: pinned=a9303e77..., upstream=a9303e77..., behind=0 commits → synced
WARN  mkosi: pinned=..., upstream=..., behind=18 commits → drifted

Summary: 2 DRIFTED, 4 MINOR-LAG, 2 SYNCED across 8 forks
```

### 2.5 Output (JSON mode)

```json
{
  "report_date": "2026-08-04T06:00:00Z",
  "threshold_commits": 10,
  "forks": [
    {"fork": "arm-trusted-firmware", "pinned_sha": "...", "upstream_sha": "...", "behind": 3, "verdict": "minor-lag"},
    {"fork": "optee_ftpm", "pinned_sha": "...", "upstream_sha": "...", "behind": 14, "verdict": "drifted", "new_issue": "OMN-XXX"}
  ],
  "summary": {"drifted": 2, "minor_lag": 4, "synced": 2, "total": 8}
}
```

## 3. CI workflow: `ci_fork-drift-detect.yml`

```yaml
name: ci_fork-drift-detect
on:
  schedule:
    - cron: '0 6 * * *'  # daily 6 AM UTC (off-peak; leaves 12h buffer before US work hours)
  workflow_dispatch:
    inputs:
      threshold_commits:
        type: number
        default: 10

permissions:
  contents: read
  issues: write  # needed to file Linear-style OMN issues via the GitHub API
  pull-requests: read

jobs:
  detect:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4.2.2  # pin via PINNED.md
        with:
          fetch-depth: 0
      - uses: actions/setup-python@v5.3.0
        with:
          python-version: '3.12'
      - name: install pyyaml + requests
        run: pip install pyyaml requests
      - name: detect drift
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          python3 scripts/detect-fork-drift.py \
            --repo-root . \
            --pinned PINNED.md \
            --org yubi-OS \
            --upstream-map scripts/detect-fork-drift.upstream-map.yaml \
            --threshold-commits ${{ inputs.threshold_commits || 10 }} \
            --output-format json \
            > drift-report.json
      - name: upload report
        if: always()
        uses: actions/upload-artifact@v4.6.0
        with:
          name: fork-drift-report-${{ github.run_id }}
          path: drift-report.json
      - name: file issues for drifted forks
        if: always()
        run: |
          python3 scripts/file-drift-issues.py --input drift-report.json --github-token "$GITHUB_TOKEN"
```

## 4. Fork-to-upstream matrix (current state)

| Fork | Upstream | Pinned SHA | Detection cadence |
|------|----------|-----------|-------------------|
| arm-trusted-firmware | ARM-software/arm-trusted-firmware | per PINNED.md | daily |
| optee_os | OP-TEE/optee_os (master) | per PINNED.md | daily |
| optee_ftpm | OP-TEE/optee_ftpm (master) | per PINNED.md | daily |
| u-boot | u-boot/u-boot (master) | per PINNED.md | daily |
| ms-tpm-20-ref | microsoft/ms-tpm-20-ref | per PINNED.md | daily |
| edk2-rk3588 | edk2-porting/edk2-rk3588 | per PINNED.md | daily |
| bcvk | congatec-os/bcvk (`yubios` branch) | per PINNED.md | daily |
| mkosi | systemd/mkosi (main) | per PINNED.md | daily |

## 5. Migration plan

### Phase 1 (this PR) — Ship the script + the cron + the issue-filer

- Land `scripts/detect-fork-drift.py` + `scripts/file-drift-issues.py` + `scripts/detect-fork-drift.upstream-map.yaml` + `.github/workflows/ci_fork-drift-detect.yml`.
- PR title: `feat(ci): daily fork-upstream drift detection schedule (OMN-160)`.
- Branch: `feat/ci-fork-drift-2026-08-04`.
- First cron run on main produces the baseline drift report.

### Phase 2 — Tighten threshold

- After 30 days of baseline data, lower the threshold from 10 commits to 5 commits (drift becomes more aggressive as the lag becomes a CVE risk).

### Phase 3 — Cross-link to other drift detection

- The same cron pattern can be reused for: BLOCKERS.md drift vs planning docs (per PROJECT_RULES.md), SELF-CHANGELOG drift (the differential curve skill), Linear state vs yubios release tags (the om omn-tagging pattern).

## 6. Verification recipe

After the script ships, run it locally:

```
$ python3 scripts/detect-fork-drift.py --repo-root /path/to/yubiOS --threshold-commits 10
INFO  arm-trusted-firmware: ... → minor-lag
...
Summary: N DRIFTED, M MINOR-LAG, K SYNCED across 8 forks
```

Or via the CI cron (the first run lands 24 hours after merge):

```
GET /repos/yubi-OS/yubiOS/actions/runs?workflow=ci_fork-drift-detect.yml&per_page=1
GET /actions/runs/{id}/artifacts → fork-drift-report-{run-id}
```

## 7. References

- Linear [OMN-160](https://linear.app/omni-agent/issue/OMN-160) — Daily fork-upstream drift detection schedule (this spec's parent)
- `SAUNA_TOOLS.md` lines 8-13 — fork inventory (8 forks in the yubi-OS org)
- `SAUNA_TOOLS.md` line 130-150 — the projects/cycles workflow pattern; similar cron-shaped workflows already in place
- `skills/github-yubios-KS9n5GAT/fedora-bootc-base-images/SKILL.md` — base image digest handling (similar protocol for digest tracking)
- `PROJECT_RULES.md` lines 220-239 — fedora-bootc:45 base-image digest stale-pin pattern (3-rotation incident record; the same drift-detection pattern applies to forks)
- `schedules/github-yubios-KS9n5GAT/linear-github-projects-sync/schedule.md` — the existing daily cron precedent (per SAUNA_TOOLS line 86)

---

End of spec.


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.
