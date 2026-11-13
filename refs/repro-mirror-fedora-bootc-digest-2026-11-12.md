# B-REPRO-MIRROR: digest-only fedora-bootc base pin — 2026-11-12

Linear: OMN-170 · Blocker: B-REPRO-MIRROR (docs/BLOCKERS.md) · ADR-015

## Decision

The Containerfile base is pinned by **OCI index digest only**:

```dockerfile
FROM quay.io/fedora/fedora-bootc@sha256:<index-digest>
```

The previous form `quay.io/fedora/fedora-bootc:45@sha256:<digest>` is retired.
With a tag *and* a digest, BuildKit resolves by digest and ignores the tag, so
the `:45` was decorative. It also left two identities on one line: tools that
strip the digest (or a person reading quickly) see a floating stream tag.
The digest-only form has a single identity.

The Fedora stream is still tracked, in one place:

| Where | Role |
|---|---|
| `.github/workflows/fetch-fedora-bootc-manifest.yml` (`FEDORA_STREAM_TAG: '45'`) | Queries `quay.io/fedora/fedora-bootc:45` upstream and resolves the multi-arch **index** digest. The tag is only queried, never written into a `Containerfile*`. |
| `PINNED.md` row `quay.io/fedora/fedora-bootc` (multi-arch INDEX, stream `:45`) | The canonical digest record. |
| `Containerfile` line `FROM quay.io/fedora/fedora-bootc@sha256:…` | The consumer. `Containerfile.dev` (`FROM ${BASE_IMAGE}`) and `Containerfile.uki` (`FROM scratch`) inherit it and have no fedora-bootc ref of their own. |

## What changed in the fetch workflow

- It matches the PINNED.md row in both forms: the digest-only image column (new) and `:45` (legacy).
- It normalizes any legacy `quay.io/fedora/fedora-bootc:<tag>@sha256:` in `Containerfile*` files to the digest-only form.
- It **fails closed** if any top-level `Containerfile*` fedora-bootc `FROM` is not exactly `quay.io/fedora/fedora-bootc@<new-index-digest>`, or if the resolved digest is malformed.
- It only bumps the PINNED.md `Re-resolved` date when the digest actually changes. Re-running against an unchanged upstream now leaves no diff, so the run takes the "already current" path instead of committing a date-only change.
- `ci_test-fedora-bootc-arm64-pull.yml` reads the PINNED.md row by its image-column anchor, which matches both forms.

## Policy (yubiOS.rego)

No rule change was needed. Rule 2 allows `approved_registry(ref)` (prefix `quay.io/fedora/`) together with `input.image.isCanonical`, and both the digest-only and legacy tag+digest refs are canonical. `tests/vm/test-policy-rejection.sh` now asserts the following, and passes under `opa eval` v1.4.2 and the Python fallback:

- `quay.io/fedora/fedora-bootc@sha256:…` is allowed (the canonical OMN-170 form).
- `quay.io/fedora/fedora-bootc:45@sha256:…` is still allowed (legacy).
- `quay.io/fedora/fedora-bootc:45` and `:latest` are denied with "uses a mutable tag".

## How much of B-REPRO-MIRROR this resolves

**Resolved: base-layer drift.** The two builds of the reproducibility gate start from byte-identical base layers, because a digest cannot be retargeted. Any diff that comes from the base image (kernel, glibc and everything else Fedora shipped *in the image*) now means the pin changed, not that the registry moved under us.

**Partially mitigated: the `dnf install` layer.** `Containerfile` and `Containerfile.dev` now pass `--setopt=metadata_expire=never`, so one `RUN` never refreshes repo metadata mid-transaction, and the existing cleanup still strips `libdnf5` state, repo caches and history. A fresh build still downloads *live* repo metadata, though. If Fedora pushes a new glibc between build A and build B, the two installs can still resolve different NEVRAs. That is the 2026-10-17 `glibc 2.44-1` vs `2.44-2` signature (run 39100931710).

**Still open: the durable fix.** Point the dnf transaction at an immutable package snapshot, either a kojipkgs/compose ID such as `Fedora-45-YYYYMMDD.n.N` or a shared mirror snapshot, through `--repofrompath`/`--setopt=*.baseurl=` with `--disablerepo='*'`. Then record the snapshot ID in PINNED.md next to the base digest, so both inputs of the image (base layers plus RPM closure) are content-addressed. Until then, the triage rule in docs/BLOCKERS.md stands: a diff confined to package NEVRAs or libdnf5 metadata is a resolution problem, not a code change.

## Operational note (2026-11-12)

While verifying this change, the digest pinned on `main`, `sha256:0c0d822e…aad29`, returned **HTTP 404** from quay.io: upstream had garbage-collected it. The `:45` stream now resolves to index `sha256:0ae801a0…7917` (arm64, amd64, ppc64le, s390x). This is the documented digest-rotation class (playbooks/digest-bump-recovery.md). The fix is to run `fetch-fedora-bootc-manifest`, which now writes the digest-only form.
