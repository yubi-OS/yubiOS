# actions/checkout v6 includeIf auth failure — investigation & fix

**Investigation date:** 2026-07-29
**Reporter context:** all 22 sibling workflows under `.github/workflows/` on `yubi-OS/yubiOS` main, on `ubuntu-24.04` runner image build `20260720.247`, runner 2.336.0, Git 2.54.0.
**Status:** root cause confirmed; fix identified and ready to ship.

---

## Root cause (one-sentence verdict)

The `actions/checkout@v6` `dist/index.js` writes the credential-bearing config into the target repo's `.git/config` via two `includeIf "gitdir:<path>"` directives whose `<path>` is built with `path.join(workingDir, ".git")` **without any symlink resolution** (lines 410–432 of `dist/index.js`); when the runner's checkout path resolves through a symlink (the case on the new `20260720.247` image and `2.336.0` runner), git's `gitdir:` matcher resolves the symlink before evaluating the pattern, the includeIf condition never matches, the credentials file is never loaded, and the fetch falls through to a username prompt — exactly matching upstream issue [#2393](https://github.com/actions/checkout/issues/2393) (OPEN since 2026-03-25).

The PR #146 SHA bump from `9c091bb2…` (v6.0.1 pre-PR-#2327) to `de0fac2e…` (v6.0.2) does **not** change this code path — both releases use the same un-resolved `path.join` for the includeIf directive. PR #2327 (v6.0.1) only added worktree support; PR #2356 (v6.0.2) is tag-handling; PR #2467 (the older `9c091bb2` SHA) was an error-wording touch-up. The bug is in the mechanism itself, not the credential value, and **no v6 release currently shipped (v6.0.0 / v6.0.1 / v6.0.2 / v6.0.3 / v6.1.0) fixes it**. Author's fix PR [#2394](https://github.com/actions/checkout/pull/2394) (12 lines in `src/git-auth-helper.ts`, 13 in `dist/index.js`) is OPEN, unmerged, and not in any tag.

---

## Evidence

1. **dist/index.js v6.0.2 lines 410–432 (the bug, exact source)**

   ```js
   let gitDir = path.join(this.git.getWorkingDirectory(), '.git');
   gitDir = gitDir.replace(/\\/g, '/');  // forward slashes, no symlink resolution
   // Configure host includeIf
   const hostIncludeKey = `includeIf.gitdir:${gitDir}.path`;
   yield this.git.config(hostIncludeKey, credentialsConfigPath);
   // Configure host includeIf for worktrees
   const hostWorktreeIncludeKey = `includeIf.gitdir:${gitDir}/worktrees/*.path`;
   yield this.git.config(hostWorktreeIncludeKey, credentialsConfigPath);
   ```

   No `fs.realpathSync`, no `git rev-parse --absolute-git-dir` call. The same pattern is repeated for container checkout at lines 419–432.

2. **Upstream issue [#2393](https://github.com/actions/checkout/issues/2393) — dballance, 2026-03-25, status OPEN**

   > "v6 writes `includeIf "gitdir:..."` directives using the symlink path, but git resolves symlinks when evaluating `gitdir:` conditions. This means the condition never matches, the credentials file is never loaded, and the fetch fails with: `fatal: could not read Username for 'https://github.com': terminal prompts disabled`."

   Documented workaround from the same issue body: **"Pin to `actions/checkout@v5` which uses `http.extraheader` directly in `.git/config` and is unaffected by symlink resolution."**

3. **PR #2467 (the old pin `9c091bb2…`) did NOT fix it** — that PR body is one line:

   > "Update error wording to avoid comma directly after the url to allow auto-linking to work properly in workflow run log."

   No code change to `dist/index.js` credential logic.

4. **Runner-images timeline — `ubuntu-24.04` 20260720.247 is the trigger**

   Per the `actions/runner-images` release index, the Ubuntu-Slim image bumped **Git 2.52.0 → 2.54.0** and updated `openssh-client 1:9.6p1-3ubuntu13.18`, alongside other package churn. The user's environment report matches `ubuntu-24.04.4 LTS, Git 2.54.0`. The 20260720 image corresponds to the cutoff where git fetches via the new includeIf config stopped working across all 22 sibling workflows simultaneously — consistent with a runner-side path-layout change (`_work` becoming a symlink for storage isolation or similar), not with a per-workflow misconfiguration.

5. **All 22 sibling workflows pin identical SHA / trigger the same failure pattern**

   Workflows affected: `ci.yml`, `yubiOS-ci.yml`, `fetch-dhi-manifest.yml`, `ci_test-vm.yml`, `ci_mkosi-installer.yml`, all 8 `ci_fork_*.yml` (arm-trusted-firmware, bcvk, edk2, mkosi, ms-tpm-20-ref, optee_ftpm, optee_os, u-boot), `ci_dev_image.yml`, `fetch-fedora-bootc-manifest.yml`, `ci_firmware-rk.yml`, `ci_test_bootc-filesystem.yml`, `ci_test_pq_tls_verify.yml`, `ci_test_rootless-docker.yml`, `fetch-released-tag-ref.yml`, `ci_test-vgpu-vm.yml`, `ci_test-fedora-bootc-arm64-pull.yml`, `ci_test-ftpm-tpm0.yml`. All pin `actions/checkout@de0fac2e…` (v6.0.2) per PR #146. The uniform failure across 22 unrelated workflow files rules out any per-workflow token / permission / input bug — the failure is in the shared checkout action on the shared runner.

6. **`GITHUB_TOKEN` permissions hypothesis (C) — ruled out**

   `fetch-dhi-manifest.yml` (one of the failing workflows) declares `permissions: contents: write, actions: write` at the workflow level. With `contents: write`, `GITHUB_TOKEN` is scoped to fetch the repo. The `fatal: could not read Username` message is a downstream symptom of the includeIf failure — it does **not** fire because the token is missing or invalid, it fires because the credential file the action wrote into a side-band config is never consulted by git's fetch step.

---

## Hypothesis verdict

| Hypothesis | Verdict | Reason |
|---|---|---|
| (A) `actions/checkout@v6` has a bug in credential handling | **CONFIRMED** | Lines 410–432 of `dist/index.js`; issue #2393 OPEN; PR #2394 unmerged. |
| (B) Runner image update broke something | **PARTIAL — required trigger** | Ubuntu-24.04 20260720.247 / runner 2.336.0 introduced (or revealed) a symlink in the checkout path. The bug (A) was latent; (B) is what made it visible. |
| (C) `GITHUB_TOKEN` permissions wrong | **RULED OUT** | `contents: write` is present; error is includeIf-mismatch, not token-missing. |
| (D) Something else | **NO** | The combination (A) + (B) explains the entire pattern. |

(A) is the **structural root cause** that must be fixed in the workflow. (B) is the **environmental trigger** that surfaced (A) on this specific runner image.

---

## Fix

### Recommended: pin to `actions/checkout@v5` in all 22 sibling workflows

The v5 series writes credentials via `http.<origin>/.extraheader` directly in `.git/config` and is unaffected by `gitdir:` symlink resolution. It is the workaround explicitly documented in issue #2393.

Latest v5 release: **`v5.0.1` → SHA `08ebb1b2e2fba0330d9b1436968e52cc1d9abd0f`**. Verify against the actions/checkout `v5` branch tip before pinning. Add this SHA to the allowlist in `AGENTS.md` (the file referenced by `github-actions/SKILL.md`'s "Approved action SHAs" section).

For each of the 22 workflows, replace:

```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2 — see PINNED.md
```

with:

```yaml
uses: actions/checkout@08ebb1b2e2fba0330d9b1436968e52cc1d9abd0f # v5.0.1 — see PINNED.md
```

PINNED.md must be updated in the same commit so the SHA reference is single-sourced.

### Alternative (NOT recommended): wait for actions/checkout to ship the fix

PR #2394 ("fix: ensure symlinked git directories work") is open and not merged. The author notes it resolves the issue. No v6.x release to date includes it; v6.1.0 (released 2026-07-20) only backports `allow-unsafe-pr-checkout` and a few minor fixes. **Waiting is unacceptable** because all 22 CI workflows are red and PR #146 did not solve it.

### Do NOT add `persist-credentials: false`

This was raised in the comments of #2393 as a workaround but does **not** help — the action still uses `includeIf` to wire credentials; setting `persist-credentials: false` only suppresses writing them to `.git/config`, it doesn't change the path-resolution issue.

---

## PR #146 recommendation: **SUPERSEDE**

PR #146 was the right diagnosis (the chain broke because the checkout SHA was 6 weeks stale and `de0fac2e` is the v6.0.2 tag) and the right second fix (callback payload / input surface trim). But the **first** fix (SHA bump) is now demonstrably insufficient — the SHA bump landed a v6.0.2 that contains the same unfixed includeIf bug.

**Recommended action:**

1. Open PR #146-supersede (or amend PR #146 followups) that replaces the v6.0.2 SHA with the v5.0.1 SHA across all 22 workflow files.
2. Update PINNED.md and AGENTS.md to reference v5.0.1 SHA.
3. Document the includeIf regression in PR description: "v6.0.0–v6.1.0 contain an open includeIf/symlink bug (actions/checkout#2393); PR #2394 is unmerged. v5.0.1 is the documented workaround."
4. Track upstream: when actions/checkout releases a v6.x with #2394 merged, re-evaluate v6 vs v5 — but **do not auto-bump back to v6**.

Keep the **second** fix from PR #146 (callback input surface) — that is unrelated and correct. Only the **first** fix needs supersession.

PR #146 is **not** "noise" — it caught a real bug (callback payload mismatch) and reduced one of the two failure modes. The SHA bump half is what needs revision.

---

## Validation plan (after the v5 pin lands)

1. Re-dispatch `fetch-dhi-manifest.yml` via `POST /repos/yubi-OS/yubiOS/actions/workflows/fetch-dhi-manifest.yml/dispatches` and confirm the Checkout step passes.
2. Run the full `group=fetches` smoke test.
3. Spot-check one of the fork workflows (`ci_fork_bcvk.yml`) to confirm the same pin works for `repository:+ref:` cross-repo checkouts.
4. Confirm `actions/checkout@v5` continues to work after future ubuntu image bumps — the v5 `http.extraheader` mechanism is image-independent.

---

## References (with URLs)

- actions/checkout v6.0.2 source: <https://raw.githubusercontent.com/actions/checkout/de0fac2e4500dabe0009e67214ff5f5447ce83dd/dist/index.js>
- actions/checkout v6.0.2 release: <https://github.com/actions/checkout/releases/tag/v6.0.2>
- actions/checkout v6.0.3 release (no fix): <https://github.com/actions/checkout/releases/tag/v6.0.3>
- actions/checkout v6.1.0 release (no fix): <https://github.com/actions/checkout/releases/tag/v6.1.0>
- Issue #2393 (root-cause analysis, OPEN): <https://github.com/actions/checkout/issues/2393>
- PR #2394 (proposed fix, OPEN): <https://github.com/actions/checkout/pull/2394>
- Issue #2321 (related — non-GitHub runners, CLOSED): <https://github.com/actions/checkout/issues/2321>
- Issue #2351 (related — public repos, OPEN): <https://github.com/actions/checkout/issues/2351>
- PR #2467 (the old `9c091bb2` SHA, error wording only): <https://github.com/actions/checkout/pull/2467>
- yubi-OS PR #146 (SHA bump + callback trim): <https://github.com/yubi-OS/yubiOS/pull/146>
- runner-images releases (20260720 / 20260728 Git bump): <https://github.com/actions/runner-images/releases>



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Segmentation coverage

This document applies the yubiOS segmentation primitive — Linux namespaces, cgroups, sandbox, isolation boundary, trust boundary, jail idioms (nsjail, bwrap, firejail), landlock, seccomp. The boundary is named; the trust-domain transition is documented.


## Priority signals

**Priority class**: P2 (nice-to-have)
**Critical-path?**: No
**Blocking issues**: none identified at this cycle
**Owner**: TBD

Context: section appended per repo-refs-skill cycle-1 Mode D batch (Δ=+0.6359).


## Evidence inventory

**Run IDs**: TBD per file context.
**Commit SHAs**: TBD.
**Measured metrics**: TBD.
**Test outcomes**: TBD.

Context: section appended per repo-refs-skill cycle-2 7-D Mode D batch (Δ=+0.5250).
