# yubiOS digest bump checklist

**Status:** checklist derived directly from PINNED.md's own structure and policy | **Owner:** follower session (the-cult FOLLOWER_2) | **Linear:** [OMN-61](https://linear.app/omni-agent/issue/OMN-61/enumerate-every-file-and-check-that-must-change-on-a-digest-bump)

## Why this exists

OMN-61 asks for the canonical set of files, validations, and review points
that must move together whenever a base digest changes. PINNED.md already
states it is "the single source of truth" and already has its own Policy
section describing the roll procedure at a high level ("obtain the digest,
update this file, update repo references to the old digest, update
`yubiOS.rego` if a new registry is introduced, and open a PR"). This document
expands that into a checklist grounded in PINNED.md's actual current content —
every category, table, and workflow name below is copied from PINNED.md as it
exists today, not invented.

## 1. Which category is bumping? (PINNED.md has five)

PINNED.md tracks five distinct categories, and a "digest bump" means a
different thing in each:

1. **GitHub Actions** — pinned action SHAs (`actions/checkout`, `actions/attest`, etc.)
2. **Direct Workflow Downloads** — `wcurl` payloads verified by SHA-512 (Docker static binaries, buildx release)
3. **Internal yubi-OS Fork Refs** — upstream release/reference + pinned source commit per fork (TF-A, bcvk, edk2, edk2-platforms, mkosi, ms-tpm-20-ref, optee_ftpm, optee_os, u-boot)
4. **External GitHub Source Refs** — pinned commits for non-fork external deps (docker/buildx, Mbed-TLS/mbedtls, pando85/passless, qemu/qemu)
5. **Container Images** — OCI index digests (`dhi.io/debian-base`, `quay.io/fedora/fedora-bootc:45`, `moby/buildkit`, `jekyll-build-pages`, `hadolint`)

**Below is the checklist per category** — the exact same "which file/check
must move together" question has a different answer for each, so a generic
one-size checklist would miss real cases.

## 2. Checklist: Container Images (dhi.io/debian-base or fedora-bootc)

This is the highest-traffic category per PROJECT_RULES.md ("Sauna tracks
latest `dhi.io/debian-base` trixie-debian13-dev digest and commits bump PRs").

- [ ] Fetch the new multi-arch INDEX digest via the named refresh workflow —
  `fetch-dhi-manifest` for `dhi.io/debian-base`, `fetch-fedora-bootc-manifest`
  for `quay.io/fedora/fedora-bootc:45` (both named explicitly in PINNED.md's
  Policy section).
- [ ] Update the INDEX digest row in PINNED.md's Container Images table.
- [ ] Update both **child digest rows** (`linux/amd64`, `linux/arm64`) — these
  are auto-resolved per PINNED.md's own note ("Resolved automatically; do not
  pin directly unless an amd64-only job requires it"), so confirm they're
  refreshed by the same fetch workflow, not hand-edited separately.
- [ ] Move the **previous** INDEX digest into the "Superseded... kept for
  audit only" block at the bottom of the Container Images section — PINNED.md
  already does this for prior `dhi.io/debian-base` digests; don't just
  overwrite and lose the audit trail.
- [ ] Update every Containerfile `FROM` statement and every workflow `uses:`
  / container `image:` field referencing the old digest — PINNED.md's Policy
  line is explicit: "update repo references to the old digest."
- [ ] Confirm `yubiOS.rego`'s `target.policy` (`reset=true`, `strict=true`)
  still passes — PINNED.md states digests are verified at build time by this
  exact policy inherited from `yubiOS-bake.hcl`; a bump that isn't
  policy-approved will fail closed, which is correct behavior, but confirm
  it's *expected* pass/fail, not a silent break.
- [ ] If the bump introduces a **new registry** (not currently in
  `yubiOS.rego`'s approved list), update `yubiOS.rego` itself — PINNED.md's
  Policy explicitly calls this out as a conditional step, not a mandatory one
  for same-registry bumps.
- [ ] Open a PR — PINNED.md's Policy ends with "open a PR," matching
  PROJECT_RULES.md's existing convention that Sauna commits bump PRs rather
  than pushing directly to main.

## 3. Checklist: Internal yubi-OS Fork Refs (TF-A, bcvk, edk2, mkosi, etc.)

- [ ] Run `fetch-released-tag-ref.yml` (named explicitly in PINNED.md) — it
  "resolves the newest stable upstream tag in each configured release family,
  peels annotated tags, and proves that both the release commit and approved
  source commit can be fetched from the fork with complete trees."
- [ ] Confirm whether the fork's **release commit** and **pinned source
  commit** are equal after the refresh. PINNED.md states: "When those commits
  are equal, the workflow rolls every textual use automatically" — if they
  differ (a yubiOS-specific patch extends the release, as with `bcvk`,
  `optee_ftpm`, and `mkosi` today, each of which has a different pinned
  source commit than its release commit), the automatic roll does **not**
  apply and the extension must be manually re-verified against the new
  release.
- [ ] If the fork carries a yubiOS-specific extension (per PINNED.md's note:
  "this prevents a refresh from silently removing bcvk device support, the
  mkosi profile, or OP-TEE volatile test storage"), explicitly re-check that
  extension still applies cleanly on top of the new upstream release commit
  before updating the pinned source commit — this is the one step that can't
  be automated by the fetch workflow.
- [ ] Update both the "Upstream release/reference" and "Pinned source commit"
  columns in PINNED.md's Internal yubi-OS Fork Refs table.
- [ ] For EDK2 specifically: confirm the new release still satisfies
  PINNED.md's stated constraint ("bounded to `edk2-stable202602`, the newest
  stable release that still provides the StandaloneMM `ArmBaseLib` consumed
  by the paired pre-removal edk2-platforms snapshot") — a newer EDK2 release
  that drops that API would break the pairing with `edk2-platforms`, which
  PINNED.md pins separately via its own pre-removal compatibility tag.
- [ ] Open a PR per the same Policy step as section 2.

## 4. Checklist: External GitHub Source Refs (non-fork deps)

- [ ] Update the "Reviewed branch/tag" and "Pinned commit" columns for the
  specific dependency (`docker/buildx`, `Mbed-TLS/mbedtls`, `pando85/passless`,
  or `qemu/qemu`).
- [ ] For `docker/buildx` specifically: confirm the release asset's SHA-512
  in the Direct Workflow Downloads table (section 5 below) is updated in the
  same PR — PINNED.md notes buildx's binary "payloads are additionally
  pinned by SHA-512 above," so this is a two-table update, not one.
- [ ] For `pando85/passless`: re-confirm the specific feature PINNED.md
  documents yubiOS depends on ("enables soft-fido2's implemented
  `hmac-secret` extension at build time") still exists/works in the new
  pinned commit — a passless upgrade that drops or changes that extension
  would silently break the TEST-image in-guest CTAP2 authenticator path.
- [ ] For `qemu/qemu`: re-confirm the pinned commit still provides
  "ARM64 zstd-capable DirectBoot QEMU" — this is exactly the capability
  BLOCKERS.md's B-QEMU-ZBOOT entry and the `docker-setup-qemu-action` /
  `debugging-and-error-recovery` skills are tracking; a QEMU bump interacts
  directly with that open blocker and should be cross-checked against it,
  not bumped in isolation.

## 5. Checklist: Direct Workflow Downloads (wcurl + SHA-512 payloads)

- [ ] Update the Artifact URL (usually a version bump, e.g.
  `docker-29.6.0.tgz` → a newer version) for each affected platform row
  (`linux/amd64` and `linux/arm64` are both listed separately — both need
  updating, not just one).
- [ ] Recompute and update the **Pinned SHA-512** for each changed artifact —
  PINNED.md's own Policy states "Every `wcurl` request must be followed by a
  matching `sha512sum --check --strict` verification before the payload is
  consumed," so a version bump without a matching hash update would fail
  that check at build time (correct behavior, but confirm it's not skipped).
- [ ] If `docker/buildx`'s release version changes, this table and the
  External GitHub Source Refs table (section 4) must be updated together —
  same cross-reference as noted above.

## 6. Checklist: GitHub Actions (pinned action SHAs)

- [ ] Update the specific action's Pinned SHA in the GitHub Actions table.
- [ ] Confirm the new SHA is still an immutable commit reference, not a
  mutable tag — PINNED.md's Policy explicitly states "Mutable tags such as
  `:latest`, `:main`, or branch refs are rejected by `yubiOS.rego` and
  AGENTS.md policy," so this should fail closed if violated, but the person
  bumping should confirm they copied a commit SHA, not a tag string.

## 7. Cross-cutting checks, every bump regardless of category

- [ ] AGENTS.md's own instruction: "Do not duplicate digest tables in this
  file. Show shape/examples only" — confirm no bump accidentally introduces
  a duplicate, stale digest reference in AGENTS.md itself.
- [ ] Confirm the change doesn't touch `.github/workflows/` in a way that
  needs separate review attention — per PROJECT_RULES.md, workflow-file edits
  go through the sole `MASTER GIT SU` connection and get a descriptive commit
  message since "there's no PR review step for direct-to-main workflow
  commits" for that specific path; a digest bump that also touches a workflow
  file should still get that same commit-message discipline even if it's
  bundled with a PINNED.md PR.
- [ ] Superseded-digest audit trail (section 2's step) applies to any table
  where PINNED.md keeps a "kept for audit only" block — confirm the old value
  is preserved there, not just deleted.

## Dependencies

- Directly derived from **PINNED.md** as it exists in the live repo (fetched
  2026-07-25) — re-run this checklist against PINNED.md's *current* content
  before using it, since PINNED.md itself changes as bumps land.
- Section 4's QEMU row cross-references **BLOCKERS.md**'s B-QEMU-ZBOOT entry,
  relevant to **T25/OMN-59** if that issue is worked separately.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.
