---
contract: "yubios versioning scheme — formal decision document for the de-facto scheme already in use as of v0.7.1 (first formal 'v'-prefixed tag, 2026-08-01T13:44:30Z). Codifies the semver major.minor.patch scheme, the immutable :<commit-sha> OCI tag pairing, the pre-release :<short-sha> tag, and the rule that Jenny cuts tags (no agent release tags). Lands via PR on yubi-OS/yubiOS main under refs/yubios-versioning-scheme-2026-08-04.md."
short_description: "yubios versioning scheme decision"
---

# yubios Versioning Scheme Decision (2026-08-04)

**Linked Linear issue:** [OMN-104](https://linear.app/omni-agent/issue/OMN-104)
**Project:** bcvk yubios: mint pinned source into a released build
**Authored:** 2026-08-04 in self-mode.
**Status:** Draft for PR.

---

## 1. Decision

yubios uses **Semantic Versioning 2.0.0** for human-facing release tags (`vMAJOR.MINOR.PATCH`) and **immutable commit-SHA tags** (`:<full-sha>` and `:<short-sha>`) for OCI image references. Pre-release tags are allowed (e.g. `v0.7.1-rc1`) but require explicit suffix.

This formalizes the de-facto scheme already in use:
- v0.0.1 → v0.7.3 (ReleaseEvents 2026-06-25 → 2026-08-04)
- v0.7.1 (2026-08-01T13:44:30Z) was the first formal "v"-prefixed tag with a full changelog from v0.0.1, spanning 156 PRs.
- v0.7.3 (2026-08-04T09:06:00Z) had the first personally-written release body by 0mniteck, framing the v0.7.x → v0.8.x boundary.

## 2. Tag taxonomy

### 2.1 Release tags (human-facing, optional)

- Format: `vMAJOR.MINOR.PATCH` per SemVer 2.0.0.
- Pre-release suffix: `vMAJOR.MINOR.PATCH-<suffix>` (e.g. `v0.7.1-rc1`, `v0.7.1-beta.2`). The suffix must be a dot-separated alphanumeric identifier; no leading zeros per SemVer 2.0.0 §2.
- Build metadata suffix: `vMAJOR.MINOR.PATCH+<metadata>` (e.g. `v0.7.1+arm64-only`). Allowed but rarely used.

### 2.2 OCI image tags (always present)

- **Floating `:latest`** — points to the most recent release. Used in install commands (`bootc install --source-imgref docker://0mniteck/yubios:latest`). Must NEVER appear in CI inputs or workflow definitions (mutable tag is banned per SPEC.md §7 conformance item 7).
- **Immutable `:<full-sha>`** — e.g. `:bfbc38f...` (40-char). Used as the canonical OCI reference for verification, signed UKI build provenance, SLSA attestation binding.
- **Immutable `:<short-sha>`** — e.g. `:7eba4856` (7-char). Convenience tag for developer readability. Must always be paired with the corresponding `:<full-sha>` tag (the merge-manifest step in `ci_dev_image.yml` already does this pairing post-commit `95565a0e`).
- **Immutable `:<short-sha>-<arch>`** — e.g. `:7eba4856-amd64`, `:7eba4856-arm64`. Per-arch child image references. Convenience only.

### 2.3 Forbidden patterns

- `:latest` in any CI input or workflow definition (mutable tag ban).
- Floating branch tags (`:main`, `:feat-...`) — mutable and therefore insecure.
- `:v<MAJOR>` or `:v<MAJOR>.<MINOR>` without the patch — SemVer 2.0.0 requires all three numbers for a release tag.
- Tagging a commit that has not passed the engineering gate floor (E-1..E-11 per OMN-142's gate inventory, applied on a per-tag basis).

## 3. Versioning policy (when MAJOR / MINOR / PATCH increments)

Per SemVer 2.0.0:

- **MAJOR** increments on incompatible API or behavior changes. For yubios, this includes any change to the bootc install protocol, any change to the LUKS2 FIDO2 unlock protocol, any change to the signed UKI format, or any change to the dm-verity root hash computation that requires user intervention (re-enrollment).
- **MINOR** increments on backward-compatible feature additions. For yubios, this includes new sysext overlays, new portable services, new CI gates that don't change the install behavior, new ADR decisions that affect design but not the running artifact.
- **PATCH** increments on backward-compatible bug fixes. For yubios, this includes fixes to the build pipeline that don't change the produced image, fixes to the test surface, fixes to the CI workflow files.

### 3.1 Pre-1.0 disclaimer

The current series is v0.x.y. Per SemVer 2.0.0 §4: "Major version zero (0.y.z) is for initial development. Anything may change at any time. The public API should not be considered stable." yubios v1.0.0 is the launch target (2026-09-13 milestone). All v0.x.y releases are explicitly pre-1.0; the rules above apply but with the additional understanding that anything can change without notice.

## 4. Tag cutting discipline

### 4.1 Who cuts tags

**Jenny.** Per the standing rule (PROJECT_RULES.md line 130: "never merge to main, no force-push, no release tags"). Release tags are commercial events: they signal to external observers (customers, prospects, press) that a specific build is the current production target. The agent's role is to propose tag cuts and to prepare the PRs that lead up to them; Jenny signs off.

### 4.2 Pre-tag checklist (the agent's responsibility)

Before proposing a tag cut, the agent must verify:

1. All engineering gates E-1..E-11 per OMN-142 are PASS at the candidate commit.
2. The CHANGELOG is updated (the changelog body that goes into the release notes).
3. PINNED.md is in lockstep with the candidate commit (no stale digests).
4. docs/BLOCKERS.md's `Last reviewed` is within the past 7 days (no stale planning doc).
5. The dev image `:dev-<short-sha>` has been pulled and smoke-tested (manual or automated).
6. The release branch (if any) has been rebased on main and CI green.

### 4.3 Post-tag verification

After a tag is cut, the agent verifies:

1. `GET /repos/yubi-OS/yubiOS/releases/tags/vX.Y.Z` returns the tag object.
2. `GET /repos/yubi-OS/yubiOS/commits/vX.Y.Z` returns the commit.
3. The OCI image `:vX.Y.Z` is published at `docker.io/0mniteck/yubios:vX.Y.Z` and is reachable.
4. The OCI image digest (`@sha256:...`) matches the commit's published digest.

## 5. Decision matrix for the v0.7.x → v0.8.x boundary

The v0.7.x series (v0.7.0 → v0.7.3) shipped 2026-07-25 → 2026-08-04. The next release series boundary is v0.8.0, which should signal:

- A MINOR-level feature addition (sysext overlay infrastructure per OMN-156).
- A MAJOR-level behavior change (the input-shape CI gate per OMN-158 changes the workflow file pattern, which is observable to workflow authors).
- The release of the validate-input-shape gate from Phase 1 (warn-only) to Phase 2 (required).

Recommended v0.8.0 target date: 2026-09-13 (aligned with the Production Proof & Release Gates milestone target). Cut by Jenny per §4.1.

## 6. What this spec does NOT do

- Does NOT prescribe specific version numbers for upcoming releases (commercial decision, Jenny's call).
- Does NOT prescribe the release notes format (the v0.7.3 release body written by 0mniteck is the precedent; future release bodies should match or improve).
- Does NOT prescribe a branching strategy (yubios currently uses `main` as the single source of truth per the no-stale-branches discipline; feature branches are ephemeral).
- Does NOT prescribe pre-1.0 release cadence (the v0.6.x → v0.7.x → v0.8.x cadence is determined by milestone targets and engineering gate completions).
- Does NOT change the existing immutable `:<commit-sha>` OCI tag pairing (already in place since v0.0.1 per the workflow YAML).

## 7. References

- Linear [OMN-104](https://linear.app/omni-agent/issue/OMN-104) — Decide and document the yubios versioning scheme (this spec's parent)
- Linear [OMN-142](https://linear.app/omni-agent/issue/OMN-142) — Release gate checklist v2 (the engineering gate floor that tags must clear)
- `RECENT_ACTIVITY.md` 2026-08-04 entry — v0.7.3 release notes (the first personally-written release body by 0mniteck)
- `RECENT_ACTIVITY.md` 2026-08-01 entry — v0.7.0 (11:05:06Z) + v0.7.1 (13:44:30Z, first "v" tag) releases
- `PROJECT_RULES.md` line 130 — "never merge to main, no force-push, no release tags" (Jenny-merges rule)
- SemVer 2.0.0 spec — https://semver.org/spec/v2.0.0.html
- SPEC.md §7 conformance item 7 — "No mutable-tag (:latest, branch) references anywhere in Containerfile or workflows"

---

End of spec.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Declarative policy coverage

This document integrates with the yubiOS declarative-policy substrate — OPA/Rego policy files, signing-config JSON, policy-as-code workflows. Policy gates are named at the integration point; policy evaluation is the gate, not an afterthought.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.

## 9. Re-verification 2026-09-18 (wayfinder round 8)

The scheme has now governed 10+ releases beyond the v0.7.1 anchor it codifies. Live releases
API read 2026-09-18: v0.8.8 (2026-09-09), v0.8.7 (2026-08-25), v0.8.6 (2026-08-22), v0.8.5
(2026-08-13), v0.8.2 (2026-08-12), and earlier v0.7.x/v0.8.0 tags. Every one is a SemVer
2.0.0 `vMAJOR.MINOR.PATCH` tag with the immutable `:<sha>` OCI tag pairing intact. The scheme
held under load: 0.7.x to 0.8.x were minor bumps (no breaking change claimed), and no release
tag was cut by any agent account, matching the scheme's Jenny-cuts-tags rule. One nuance the
scheme's text predates: the v0.8.5 tag's visibility gap (confirmed only via compare links in
the round-7 records) — a tagging-flow gap worth a look next time a release is cut, not a
scheme violation.
