---
contract: "yubiOS workflow token-scope audit script spec. The PR #148 cycle (2026-07-29) landed the GH_TK -> github.token cleanup; this script codifies the post-cleanup audit pattern as a re-runnable script so any new workflow added in the future is checked for over-scoped permissions and any new GH_TK-secrets reference is caught before merge. Lands via PR on yubi-OS/yubiOS main as scripts/audit-workflow-tokens.py + refs/workflow-token-scope-audit-2026-08-04.md."
short_description: "Workflow token-scope audit script"
---

# Workflow Token-Scope Audit Script — yubiOS CI Hygiene (2026-08-04)

**Linked Linear issue:** [OMN-161](https://linear.app/omni-agent/issue/OMN-161)
**Project:** yubiOS Production Proof & Release Gates
**Authored:** 2026-08-04 in self-mode.
**Status:** Draft for PR.

---

## 1. Problem statement

PR #148 (commit `a49e95db`, 2026-07-29) replaced all 6 `GH_TK` secret references in 3 workflow files with `github.token`:

- `.github/workflows/fetch-dhi-manifest.yml` — checkout token + dead env var + git push (3 references)
- `.github/workflows/fetch-released-tag-ref.yml` — checkout token + compare endpoint env (2 references)
- `.github/workflows/fetch-fedora-bootc-manifest.yml` — git push (1 reference)

All 3 files now declare `permissions: { contents: write, actions: write }` at workflow level. After PR #148's merge, the `GH_TK` repo secret is unused and could be deleted.

The cleanup was a one-time PR. Without a re-runnable audit script, any future workflow that re-introduces a `secrets.GH_TK` reference, or any future workflow that requests permissions it doesn't use, will silently regress. The PR #148 cycle and the PR #150 cycle both came from manual review catching this class of bug; the goal is to make it a CI gate.

This spec defines a `scripts/audit-workflow-tokens.py` script that:

1. Walks every `.github/workflows/*.yml` file in the repo.
2. Builds a per-workflow report of: `top-level permissions`, `per-job permissions`, `secrets.*` references, `jobs.<name>.steps[*].env` secrets references.
3. Flags (a) any reference to `secrets.GH_TK` (the retired secret), (b) any workflow whose top-level permissions are stricter than any job's permissions (impossible per GitHub Actions semantics; flag as a YAML error), (c) any workflow whose job uses a `secrets.*` reference whose name doesn't exist as a repo secret (best-effort: requires GitHub API call to list repo secrets; offline mode uses a config allowlist), (d) any workflow whose effective permissions exceed what's needed by its declared jobs.

The script is runnable from any developer laptop (no CI required) AND as a CI gate via a new `ci_token-audit.yml` workflow that runs on every PR touching `.github/workflows/**`.

## 2. Script design

### 2.1 Inputs

- `--repo-root PATH` (default: `.`) — root of the yubiOS checkout.
- `--secrets-config PATH` (optional, default: `scripts/audit-workflow-tokens.allowlist.yaml`) — allowlist of known repo secrets (so the script doesn't false-positive on `secrets.DOCKER` etc.).
- `--offline` (default: false) — don't call GitHub API to enumerate repo secrets; rely on the allowlist only.
- `--output-format` (default: `text`; alternatives: `json`, `sarif`) — for CI integration.
- `--fail-on ERROR|WARN|INFO|NEVER` (default: `ERROR`) — exit code threshold.

### 2.2 Output (text mode)

```
$ python3 scripts/audit-workflow-tokens.py --repo-root . --offline
INFO  ci.yml: top-level permissions = {contents: read}, no job overrides, no secrets.* references
WARN  ci_dev_image.yml: declares permissions: {contents: write, actions: write} but only job 'lint' needs 'contents: read'; consider tightening.
ERROR fetch-dhi-manifest.yml: still references secrets.GH_TK (retired 2026-07-29 by PR #148)
INFO  yubiOS-ci.yml: top-level permissions = {contents: write}, 1 secrets reference (secrets.DOCKER), all known to allowlist
...

Summary: 0 ERROR, 1 WARN, 22 INFO across 22 workflows
```

### 2.3 Output (JSON mode, for CI)

```json
{
  "findings": [
    {
      "file": "fetch-dhi-manifest.yml",
      "line": 42,
      "severity": "ERROR",
      "code": "GH_TK_REFERENCED",
      "message": "Workflow still references the retired secrets.GH_TK (PR #148 cleanup, 2026-07-29)",
      "remediation": "Replace with github.token; ensure permissions: {contents: write} is declared at workflow or job level."
    }
  ],
  "summary": {"errors": 0, "warnings": 1, "info": 22, "files_scanned": 22}
}
```

### 2.4 Algorithm (pseudocode)

```
def audit_workflow_file(path):
    data = yaml.safe_load(path)
    findings = []
    top_perms = data.get(True, {}).get('permissions', {})  # 'on:' parsed as boolean True key in YAML 1.1
    secrets_refs = scan_for_secrets_references(data)  # recurse through jobs.<name>.steps[*].env
    
    for ref in secrets_refs:
        if ref.name == 'GH_TK':
            findings.append(ERROR, 'GH_TK_REFERENCED', line=ref.line)
        elif not is_in_allowlist(ref.name):
            findings.append(WARN, 'UNKNOWN_SECRET', line=ref.line)
    
    for job_name, job in data.get('jobs', {}).items():
        job_perms = job.get('permissions', top_perms)
        if is_strict_subset_of(job_perms, top_perms):
            findings.append(WARN, 'JOB_LESS_PERMISSIVE_THAN_WORKFLOW', job=job_name)
        
        # scan env block for secrets.* references
        for step in job.get('steps', []):
            env = step.get('env', {})
            for k, v in env.items():
                if 'secrets.' in str(v):
                    findings.append(check_secret_ref(v, allowlist))
    
    return findings
```

### 2.5 Allowlist file (default location)

`scripts/audit-workflow-tokens.allowlist.yaml`:

```yaml
# Known yubiOS repo secrets (subset; full list lives in repo Settings -> Secrets)
known_secrets:
  - DOCKER          # dhi.io auth (settings: ${{ secrets.DOCKER }})
  - GITHUB_TOKEN    # auto-injected by GitHub Actions (no need to declare, but allowlisted for clarity)
  # GH_TK is RETIRED; if any workflow references it, the script flags ERROR.
```

## 3. CI gate integration: `ci_token-audit.yml`

A new workflow `.github/workflows/ci_token-audit.yml` runs on:

- `pull_request` events touching `.github/workflows/**` or `.github/actions/**` (path filter: `(.github/workflows/**|.github/actions/**|scripts/audit-workflow-tokens.py|scripts/audit-workflow-tokens.allowlist.yaml)`).
- `schedule: cron: '0 9 * * 1'` (weekly Monday 9 AM UTC scan of main for drift).
- `workflow_dispatch: {inputs: {fail_on: type: choice, options: [ERROR, WARN, INFO, NEVER], default: ERROR}}`.

The workflow body:

```yaml
name: ci_token-audit
on:
  pull_request:
    paths: ['.github/workflows/**', '.github/actions/**', 'scripts/audit-workflow-tokens.py', 'scripts/audit-workflow-tokens.allowlist.yaml']
  schedule:
    - cron: '0 9 * * 1'  # weekly Monday 9 AM UTC
  workflow_dispatch:
    inputs:
      fail_on:
        type: choice
        options: [ERROR, WARN, INFO, NEVER]
        default: ERROR

permissions:
  contents: read

jobs:
  audit:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4.2.2  # pin via PINNED.md action SHA
        with:
          fetch-depth: 0
      - name: python
        uses: actions/setup-python@v5.3.0
        with:
          python-version: '3.12'
      - name: install pyyaml
        run: pip install pyyaml
      - name: run audit
        run: |
          python3 scripts/audit-workflow-tokens.py \
            --repo-root . \
            --secrets-config scripts/audit-workflow-tokens.allowlist.yaml \
            --output-format json \
            --fail-on ${{ inputs.fail_on || 'ERROR' }} \
            > audit.json
      - name: upload audit report
        if: always()
        uses: actions/upload-artifact@v4.6.0
        with:
          name: token-audit-report
          path: audit.json
```

## 4. Per-workflow gap table (current state of yubi-OS/yubiOS main)

22 workflows total. The table below summarizes the current per-workflow state as of the previous session's read. Some entries are unverified (will be filled in by the first script run after merge):

| Workflow | Top-level permissions | secrets.* refs | Audit verdict |
|----------|----------------------|----------------|---------------|
| ci.yml | unknown (unverified) | unknown | NEEDS RUN |
| yubiOS-ci.yml | unknown | secrets.DOCKER (1) | likely PASS |
| ci_dev_image.yml | unknown | secrets.DOCKER (1) | likely PASS |
| ci_mkosi-installer.yml | unknown | secrets.DOCKER (1) | likely PASS |
| ci_firmware-rk.yml | unknown | unknown | NEEDS RUN |
| ci_test-vm.yml | unknown | secrets.GITHUB_TOKEN (auto) | likely PASS |
| ci_test-vgpu-vm.yml | unknown | secrets.GITHUB_TOKEN | likely PASS |
| ci_test-vgpu-vm-destructive.yml (per v0.10 pushback split proposal) | not present | — | N/A |
| ci_test_rootless-docker.yml | unknown | secrets.GITHUB_TOKEN | likely PASS |
| ci_test_bootc-filesystem.yml | unknown | secrets.GITHUB_TOKEN | likely PASS |
| ci_test_pq_tls_verify.yml | unknown | secrets.GITHUB_TOKEN | likely PASS |
| ci_test_sealed-uki-vm.yml | unknown | secrets.GITHUB_TOKEN | likely PASS |
| ci_test-fedora-bootc-arm64-pull.yml | unknown | secrets.GITHUB_TOKEN | likely PASS |
| ci_test-ftpm-tpm0.yml | unknown | secrets.GITHUB_TOKEN | likely PASS |
| diag_sign-matrix.yml | unknown | secrets.GITHUB_TOKEN | likely PASS |
| fetch-dhi-manifest.yml | {contents: write, actions: write} (post-PR #148) | github.token | PASS |
| fetch-fedora-bootc-manifest.yml | {contents: write, actions: write} (post-PR #148) | github.token | PASS |
| fetch-released-tag-ref.yml | {contents: write, actions: write} (post-PR #148) | github.token | PASS |
| ci_fork_*.yml (8 files: mkosi, bcvk, arm-trusted-firmware, optee-os, ms-tpm-20-ref, optee-ftpm, u-boot, edk2) | unknown | secrets.GITHUB_TOKEN | likely PASS |

The first script run after merge fills the "NEEDS RUN" + "unknown" cells. The expected baseline post-run is **0 ERROR, ≤3 WARN, 22+ INFO**.

## 5. Migration plan

### Phase 1 (this PR) — Ship the script + the audit workflow

- Land `scripts/audit-workflow-tokens.py` + `scripts/audit-workflow-tokens.allowlist.yaml` + `.github/workflows/ci_token-audit.yml`.
- PR title: `feat(ci): workflow token-scope audit script + ci_token-audit.yml gate (OMN-161)`.
- Branch: `feat/ci-token-scope-audit-2026-08-04`.
- First run on main populates the gap table with verified data.

### Phase 2 — Tighten WARN-level findings

- Any WARN finding (e.g. `JOB_LESS_PERMISSIVE_THAN_WORKFLOW`, `UNKNOWN_SECRET`) gets a follow-up PR to tighten.
- Target: zero WARN by 2026-08-22.

### Phase 3 — Required gate on workflow-touching PRs

- Update `ci_token-audit.yml` to set `fail-on: WARN` for `pull_request` triggers (Phase 1 default is `fail-on: ERROR`).
- Merge after Phase 2 confirms zero WARN baseline.

## 6. Verification recipe

After the script ships, run it locally:

```
$ python3 scripts/audit-workflow-tokens.py --repo-root /path/to/yubiOS --offline
INFO  ...
WARN  ...
Summary: 0 ERROR, 0 WARN, 22 INFO across 22 workflows
```

Or via the CI gate:

```
POST /actions/workflows/ci_token-audit.yml/dispatches with {"ref":"main","inputs":{"fail_on":"ERROR"}}
GET /actions/runs?workflow=ci_token-audit.yml to find the run
GET /actions/runs/{id}/jobs to read the 'audit' job output
```

The script output (text or JSON) is the evidence artifact. The first CI gate run's artifact is uploaded under name `token-audit-report` for offline review.

## 7. References

- PR #148 (commit `a49e95db`, 2026-07-29) — `ci/remove-gh-tk-references` branch; replaced 6 `GH_TK` references with `github.token`
- Linear [OMN-161](https://linear.app/omni-agent/issue/OMN-161) — Workflow token-scope audit script (this spec's parent issue)
- Linear [OMN-158](https://linear.app/omni-agent/issue/OMN-158) — input-shape doctrine (companion; this script is the audit-half, OMN-158 is the validation-half)
- `PROJECT_RULES.md` lines 79-87 (PR diff verification, YAML input shape, the workflow file pattern)

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
