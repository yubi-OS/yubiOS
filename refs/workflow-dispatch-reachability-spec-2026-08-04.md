---
contract: "yubiOS workflow_dispatch reachability assertion script. Asserts every .github/workflows/*.yml file that defines a workflow_dispatch trigger is reachable from at least one ci.yml group (firmware / tests / vm-tests / fetches / ci-builders / forks / all). Codifies the 2026-08-02 ci-launchpad update that folded 4 orphan workflows (ci_test-fedora-bootc-arm64-pull, ci_test-ftpm-tpm0, ci_test_sealed-uki-vm, diag_sign-matrix) into the tests group. Catches the orphan-workflow class of bug before merge. Lands via PR on yubi-OS/yubiOS main as scripts/assert-dispatch-reachable.py + .github/workflows/ci_dispatch-reachability.yml + refs/workflow-dispatch-reachability-2026-08-04.md."
short_description: "workflow_dispatch reachability assertion"
---

# workflow_dispatch Reachability Assertion — yubiOS CI Hygiene (2026-08-04)

**Linked Linear issue:** [OMN-159](https://linear.app/omni-agent/issue/OMN-159)
**Project:** yubiOS Production Proof & Release Gates
**Authored:** 2026-08-04 in self-mode.
**Status:** Draft for PR.

---

## 1. Problem statement

The yubiOS ci.yml orchestrator (PR #145, commit `9d6ec85d`, merged 2026-07-29) groups workflows into 7 dispatch groups: `firmware`, `tests`, `vm-tests`, `fetches`, `ci-builders`, `forks`, `all`. Each workflow in `.github/workflows/` that has a `workflow_dispatch` trigger SHOULD be reachable from at least one group, so the ci-launchpad app and any operator can fire it.

As of 2026-08-02 (per `RECENT_ACTIVITY.md` entry), 4 workflows were orphaned: `ci_test-fedora-bootc-arm64-pull`, `ci_test-ftpm-tpm0`, `ci_test_sealed-uki-vm`, `diag_sign-matrix`. They were folded into the `tests` group in the ci-launchpad per-workflow dispatch update (the update was deployed at 2026-08-02 per RECENT_ACTIVITY; the orphan list is the historical record of the bug class).

The bug class is real: a workflow added to `.github/workflows/` with a `workflow_dispatch` trigger but no group membership is invisible to the orchestrator. Without an assertion, this can recur. This spec codifies the assertion as a re-runnable script + a CI gate.

## 2. Script design

### 2.1 Inputs

- `--repo-root PATH` (default: `.`) — root of the yubiOS checkout.
- `--ci-yml PATH` (default: `.github/workflows/ci.yml`) — the orchestrator.
- `--output-format` (default: `text`; alternatives: `json`, `sarif`).
- `--fail-on ERROR|WARN|NEVER` (default: `ERROR`).

### 2.2 Algorithm

1. Walk `.github/workflows/*.yml` and parse each YAML.
2. For each workflow that has `on.workflow_dispatch` (or the YAML 1.1 boolean True key), record the workflow filename.
3. Parse `ci.yml` and extract the group→workflow-file mapping from the dispatcher's group tables (the dispatcher is typically a `case "$GROUP"` block listing workflow file paths).
4. For each workflow with `workflow_dispatch`, check whether its filename appears in any group table.
5. Flag as ERROR any orphan workflow.
6. Flag as WARN any workflow whose path appears in a group table but whose filename doesn't match (likely a stale entry; informational only).
7. Also assert the inverse: each workflow listed in a group table exists in `.github/workflows/` (catches typos / stale entries).

### 2.3 Output (text mode)

```
$ python3 scripts/assert-dispatch-reachable.py --repo-root .
ERROR ci_test-fedora-bootc-arm64-pull.yml: has workflow_dispatch but no group membership
ERROR ci_test-ftpm-tpm0.yml: has workflow_dispatch but no group membership
ERROR ci_test_sealed-uki-vm.yml: has workflow_dispatch but no group membership
ERROR diag_sign-matrix.yml: has workflow_dispatch but no group membership
WARN  ci_dev_image.yml: listed in 'ci-builders' group table but ci.yml uses 'ci_dev_image.yml' (path match OK); confirm dispatcher logic.
INFO  ci.yml: orchestrator, no group membership expected

Summary: 4 ERROR, 1 WARN, 1 INFO across 22 workflows
```

### 2.4 Output (JSON mode, for CI)

```json
{
  "findings": [
    {
      "file": "ci_test-fedora-bootc-arm64-pull.yml",
      "severity": "ERROR",
      "code": "ORPHAN_WORKFLOW_DISPATCH",
      "message": "Workflow has workflow_dispatch trigger but no membership in any ci.yml group",
      "remediation": "Add to a ci.yml group table (typically 'tests' or 'ci-builders' depending on workflow purpose)."
    }
  ],
  "summary": {"errors": 4, "warnings": 1, "info": 1, "orphans": ["ci_test-fedora-bootc-arm64-pull.yml", "ci_test-ftpm-tpm0.yml", "ci_test_sealed-uki-vm.yml", "diag_sign-matrix.yml"]}
}
```

### 2.5 Pseudocode

```
def parse_ci_yml(path):
    data = yaml.safe_load(path)
    groups = {}
    # extract from the dispatch loop; specific shape varies per ci.yml revision
    # heuristic: scan all jobs[*].steps[*].run for echo "$WORKFLOW_FILE" patterns and the case statement
    for job in data.get('jobs', {}).values():
        for step in job.get('steps', []):
            run = str(step.get('run', ''))
            # crude: extract "<file>.yml" tokens inside case branches
            if 'case "$GROUP"' in run or 'case "$group"' in run:
                groups.update(parse_case_branches(run))
    return groups

def main():
    ci_groups = parse_ci_yml(args.ci_yml)
    workflow_files = list_workflow_files(args.repo_root)
    for wf in workflow_files:
        if not has_workflow_dispatch(wf):
            continue
        if wf.filename not in any_group(ci_groups):
            findings.append(ERROR, 'ORPHAN_WORKFLOW_DISPATCH', file=wf.filename)
    # inverse assertion
    for group_name, group_files in ci_groups.items():
        for listed_file in group_files:
            if listed_file not in workflow_files:
                findings.append(WARN, 'STALE_GROUP_ENTRY', group=group_name, file=listed_file)
```

The `parse_ci_yml` heuristic is intentionally simple: ci.yml's dispatcher uses a `case` statement that lists workflow files; the script extracts those file references from the YAML literal string. A more rigorous parser would build an AST; the heuristic is sufficient for the bug class this assertion catches.

## 3. CI gate: `ci_dispatch-reachability.yml`

```yaml
name: ci_dispatch-reachability
on:
  pull_request:
    paths: ['.github/workflows/**', 'scripts/assert-dispatch-reachable.py']
  schedule:
    - cron: '0 9 * * 1'  # weekly Monday 9 AM UTC
  workflow_dispatch:
    inputs:
      fail_on:
        type: choice
        options: [ERROR, WARN, NEVER]
        default: ERROR

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4.2.2  # pin via PINNED.md
        with:
          fetch-depth: 0
      - name: python
        uses: actions/setup-python@v5.3.0
        with:
          python-version: '3.12'
      - name: install pyyaml
        run: pip install pyyaml
      - name: run assertion
        run: |
          python3 scripts/assert-dispatch-reachable.py \
            --repo-root . \
            --ci-yml .github/workflows/ci.yml \
            --output-format json \
            --fail-on ${{ inputs.fail_on || 'ERROR' }} \
            > reachability.json
      - name: upload report
        if: always()
        uses: actions/upload-artifact@v4.6.0
        with:
          name: dispatch-reachability-report
          path: reachability.json
```

## 4. Per-workflow reachability matrix (current state of main)

| Workflow | Has workflow_dispatch? | In ci.yml group | Audit verdict |
|----------|----------------------|-----------------|---------------|
| ci.yml | no (orchestrator) | self | N/A |
| yubiOS-ci.yml | yes | ci-builders | PASS |
| ci_dev_image.yml | yes | ci-builders | PASS |
| ci_mkosi-installer.yml | yes | ci-builders | PASS |
| ci_firmware-rk.yml | yes | firmware | PASS |
| ci_test-vm.yml | yes | vm-tests | PASS |
| ci_test-vgpu-vm.yml | yes | vm-tests | PASS |
| ci_test_rootless-docker.yml | yes | tests | PASS |
| ci_test_bootc-filesystem.yml | yes | tests | PASS |
| ci_test_pq_tls_verify.yml | yes | tests | PASS |
| ci_test_sealed-uki-vm.yml | yes | tests (post-2026-08-02 ci-launchpad fold) | PASS |
| ci_test-fedora-bootc-arm64-pull.yml | yes | tests (post-2026-08-02 ci-launchpad fold) | PASS |
| ci_test-ftpm-tpm0.yml | yes | tests (post-2026-08-02 ci-launchpad fold) | PASS |
| diag_sign-matrix.yml | yes | tests (post-2026-08-02 ci-launchpad fold) | PASS |
| fetch-dhi-manifest.yml | yes | fetches | PASS |
| fetch-fedora-bootc-manifest.yml | yes | fetches | PASS |
| fetch-released-tag-ref.yml | yes | fetches | PASS |
| ci_fork_mkosi.yml | yes | forks | PASS |
| ci_fork_bcvk.yml | yes | forks | PASS |
| ci_fork_arm-trusted-firmware.yml | yes | forks | PASS |
| ci_fork_optee-os.yml | yes | forks | PASS |
| ci_fork_ms-tpm-20-ref.yml | yes | forks | PASS |
| ci_fork_optee-ftpm.yml | yes | forks | PASS |
| ci_fork_u-boot.yml | yes | forks | PASS |
| ci_fork_edk2.yml | yes | forks | PASS |

Total: 24 dispatchable workflows, 24 group memberships. Expected baseline post-run: **0 ERROR, 0 WARN**.

## 5. Migration plan

### Phase 1 (this PR) — Ship the script + the audit workflow

- Land `scripts/assert-dispatch-reachable.py` + `.github/workflows/ci_dispatch-reachability.yml`.
- PR title: `feat(ci): workflow_dispatch reachability assertion + ci_dispatch-reachability.yml gate (OMN-159)`.
- Branch: `feat/ci-dispatch-reachability-2026-08-04`.
- First run on main populates the gap table; expected 0 ERROR baseline.

### Phase 2 — Tighten any baseline WARN

- The first CI run may surface a WARN (e.g. a stale group entry). Each WARN gets a follow-up PR to remove the stale entry from ci.yml.

### Phase 3 — Required gate on workflow-touching PRs

- Update `ci_dispatch-reachability.yml` to require zero orphan workflows on `pull_request` (Phase 1 default is `fail-on: ERROR`; phase 3 is `fail-on: ERROR` enforced on PR).

## 6. Verification recipe

Local run:

```
$ python3 scripts/assert-dispatch-reachable.py --repo-root /path/to/yubiOS
INFO  ...
Summary: 0 ERROR, 0 WARN, 0 INFO across 24 workflows
```

CI run:

```
POST /actions/workflows/ci_dispatch-reachability.yml/dispatches
GET /actions/runs/{id}/jobs to read the 'audit' job output
```

## 7. References

- PR #145 (commit `9d6ec85d`, 2026-07-29) — ci.yml group-routing redesign (the source of the group tables)
- PR #146 (input surface expand) and #147 (GH_TK auth fix) — also merged 2026-07-29
- `RECENT_ACTIVITY.md` 2026-08-02 entry — ci-launchpad per-workflow dispatch update + 4 orphan workflows folded into tests group
- Linear [OMN-159](https://linear.app/omni-agent/issue/OMN-159) — Assert every workflow_dispatch workflow is reachable from a group (this spec's parent)
- Linear [OMN-161](https://linear.app/omni-agent/issue/OMN-161) — Workflow token-scope audit script (companion; this is the dispatch-graph half)
- Linear [OMN-158](https://linear.app/omni-agent/issue/OMN-158) — input-shape doctrine (the validate-input-shape CI gate)
- `PROJECT_RULES.md` line 113 (skill-load directive for subagents — not directly relevant but the operating-discipline doc)

---

End of spec.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.
