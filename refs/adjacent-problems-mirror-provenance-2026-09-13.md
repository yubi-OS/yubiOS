# Adjacent problems: provenance verification for a mirrored 66 GB source tree

Date: 2026-09-13. Axis: NSS 6/12 Adjacent problems. Origin: SOS Agent wayfinder round-3
cycle 6, L2 rung (frozen frame `a045c8d3f4ff939b`, sector 2). Nearest neighbours:
`refs/adjacent-problems-verification-chain-2026-09-01.md`,
`refs/chromium-provenance-overlay-status-2026-09-09.md`,
`refs/adjacent-problems-runner-privilege-2026-09-13.md`.

## Lens

```
L2 -- mirror-provenance
  hypothesis:  the chromium mirror fork + provenance overlay introduces a verification
               question the existing verification-chain doc does not cover: how does a
               downstream consumer know a build came from the mirror at the pinned
               upstream commit, and what are the rejected alternatives
  method:      name the family, 4 alternatives, rejection criteria, flip conditions
```

## Focal problem

`yubi-OS/chromium` is a clean mirror fork of chromium/chromium (main only, 66 GB); the
provenance overlay repo pins upstream `153.0.8010.36` (`507c6ee3`) and applies its own
patch series. A consumer of a built artifact needs: which source tree, which patches, which
policy verdict, and who vouches. The yubiOS verification-chain pattern (digest-pinned
inputs, cosign, SLSA L3, Rekor) was built for OCI images from small source trees; a 66 GB
mirror stresses it.

## Problem family

Family: **source-tree provenance at mirror scale**. Boundary with the yubiOS OCI
verification chain: there the artifact is the image and the source is a small Containerfile
context. Here the artifact inherits the entire upstream Chromium build + our patch series,
so per-artifact SLSA provenance must name a source snapshot the consumer can verify against
upstream, not just a digest of our build inputs.

## Alternative solutions and why not

1. **Trust upstream tags; build from upstream directly.** Relation: *alternative*. Rejected:
   the overlay patches must apply to a pinned tree; un-pinned upstream main drifts hourly.
   Prior art: the overlay)s own PINNED.md pattern.
2. **Mirror + overlay repos, commit-pinned cross-reference (current).** Relation: *chosen*.
   The mirror never takes direct commits; the overlay pins the exact mirror commit and
   upstream version.
3. **Binary transparency log for built artifacts.** Relation: *extension*. Not yet built;
   Rekor entries exist for yubiOS images, not for Chromium build outputs.
4. **Upstream C2PA/provenance signals as the anchor.** Relation: *complementary*. The
   provenance gate consumes content provenance at render time; build-time source provenance
   is a separate chain and this doc)s subject.

## Related problems

- **Runner privilege** (`refs/adjacent-problems-runner-privilege-2026-09-13.md`). Relation:
  *prerequisite*: the build lane)s custody is part of the provenance claim.
- **Verification chain** (digest admission, cosign, SLSA L3). Relation: *extension*: same
  primitives, artifact type changes from OCI image to browser build.
- **Provenance gate policy** (`block_on_detect` default, `provenance_required` toggle).
  Relation: *the consumer side* of this chain.

## Flip conditions

The mirror+overlay pair collapses back to a single repo if the patch series ever lands
upstream in full (the mirror)s reason to exist is "never patch directly"). A binary
transparency log becomes required if Chromium builds are ever distributed beyond org CI.

## Curve placement

Coverage: verification chain (parent family), runner privilege (prerequisite), corpus/curve
(this cell via series format), provenance gate (consumer side). Omitted clusters by design.

## 2026-09-18 drift check (wayfinder round 8, cycle 57)

mirror-provenance record: the chromium-provenance CI facts it cites were re-verified this round (ci green at the new HEAD 839369e2).
