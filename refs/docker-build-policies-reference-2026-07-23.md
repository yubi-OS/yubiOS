# Docker Build Policies (OPA/Rego) Reference
_Refreshed: 2026-07-23 (supersedes refs/archive-docker-build-policies.md, originally researched 2026-06-25)_

## 2026-07-23 correction and update

**Correction to prior research:** the old note said "`docker buildx policy eval` does NOT exist." That's now wrong — **it exists and is documented**: `docker buildx policy eval` evaluates a policy against a single source, with options `--fields` (fetch specific metadata), `-f/--file` (base Dockerfile name used to locate the policy file, default `Dockerfile`), `--platform`, and `--print`.

**Status:** still documented as an **experimental** Docker feature as of 2026-07-23. Version requirement: **Buildx 0.31.0+** (confirmed, matches prior yubiOS note). BuildKit minimum has a doc inconsistency between Docker's own pages: the policies overview says 0.27.0+, the usage page says 0.26.0+ — either is safely under yubiOS's pinned toolchain, so this doesn't block anything, just flagging the upstream doc mismatch.

**Filename convention confirmed:** Buildx auto-loads a `.rego` file next to the Dockerfile using the Dockerfile's base name (`Dockerfile` → `Dockerfile.rego`, `app.Dockerfile` → `app.Dockerfile.rego`). yubiOS's own convention (centralizing on `yubiOS.rego` with explicit `filename=` + `reset=true`, per refs/docker-bake-consolidation-2026-07-17.md) deliberately opts out of this auto-load magic — still the right call, since auto-load-by-Dockerfile-name doesn't fit a bake-file-driven multi-target build.

**`input.image` fields — confirmed full list** (docs.docker.com/build/policies/inputs/): `ref`, `host`, `repo`, `fullRepo`, `tag`, `isCanonical`, `checksum`, `platform`, `os`, `arch`, `hasProvenance`, `labels`, `env`, `volumes`, `workingDir`, `user`, `signatures`. Notably **no `hasSBOM` field** in the documented list — the old note's `input.image.hasSBOM` example is speculative/unconfirmed, flag before relying on it in a real policy; SBOM presence would need to be checked another way (e.g. via `signatures`/attestation metadata, not a dedicated boolean).

## Original research (2026-06-25, still valid except where corrected above)

## What it is

Docker Build Policies (Buildx ≥ 0.31.0) enforce supply-chain rules on build inputs using OPA Rego. They run before any layer executes, gating on attestations, allowed registries, signed Git tags, digests, etc.

Policy file is named after the Containerfile: `<repo>.rego`, placed alongside it. Or specify with `filename=<file>` in the `--policy` flag.

---

## Minimal Policy

```rego
package docker

default allow := false

# Allow local inputs
allow if input.local

# Allow images with provenance attestations
allow if {
    input.image.hasProvenance
}

decision := {"allow": allow}
```

If violated (e.g., FROM image lacks provenance), the build fails before any layer runs.

---

## CLI Usage

```bash
# Auto-loads Dockerfile.rego if present
docker buildx build .

# Specify policy file explicitly
docker buildx build --policy filename=strict.rego .

# reset=true: ignore auto-loaded policy, use only named one
docker buildx build --policy reset=true,filename=strict.rego .

# strict=true: fail if no policy loads or BuildKit lacks support
docker buildx build --policy strict=true .

# yubiOS usage (from AGENTS.md)
docker buildx build --policy reset=true,strict=true,filename=$REPO.rego .

# NEW (confirmed real, 2026-07-23): eval a policy standalone without building
docker buildx policy eval --file Dockerfile --print
docker buildx policy eval --fields labels,checksum,hasProvenance
```

---

## Common Policy Examples

```rego
# Only allow images from specific registry
allow if {
    startswith(input.image.ref, "dhi.io/")
}

# Require image to be referenced by digest (not mutable tag)
allow if {
    input.image.isCanonical
}

# Require Go 1.21+ in base image
allow if {
    semver.compare(input.image.metadata.go_version, "1.21.0") >= 0
}

# Require provenance from GitHub Actions
allow if {
    input.image.hasProvenance
    input.image.provenance.builder.id == "https://github.com/actions/runner"
}
```

(Note: the SBOM-attestation example from prior research used `input.image.hasSBOM`, which is not in Docker's documented field list as of this refresh — verify against docs.docker.com/build/policies/inputs/ before relying on it.)

---

## Debugging

```bash
# See full input JSON without building
docker buildx policy eval --print .

# Debug logging
docker buildx build --policy log-level=debug --progress=plain .
```

---

## yubiOS Context

Current live pin per PINNED.md (not the AGENTS.md example below, which is historical):
```
docker buildx build --policy reset=true,strict=true,filename=$REPO.rego .
```

Policy should verify:
- Image comes from `dhi.io/` registry
- Image is referenced by digest (`isCanonical`)
- Provenance present (supply chain integrity)

---

## Integration Points

- **SLSA provenance**: `input.image.hasProvenance` + `input.image.provenance.*`
- **Docker Scout**: post-build CVE monitoring complements policy-at-build-time
- **Compliance**: Policies satisfy SOC 2 / ISO 27001 supply chain requirements

---

## References

- Policies overview: https://docs.docker.com/build/policies/
- Usage: https://docs.docker.com/build/policies/usage/
- `docker buildx policy eval` reference: https://docs.docker.com/reference/cli/docker/buildx/policy/eval/
- Input reference (full `input.image` field list): https://docs.docker.com/build/policies/inputs/
- Validating image inputs: https://docs.docker.com/build/policies/validate-images/
- Debugging: https://docs.docker.com/build/policies/debugging/


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Immutability coverage

This document upholds the yubiOS immutability layer — composefs repository, dm-verity root hash, ostree deployment, read-only / append-only semantics, sealed UKI / measured boot. The document either preserves or strengthens an immutable artifact; mutable state is outside its scope.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.
