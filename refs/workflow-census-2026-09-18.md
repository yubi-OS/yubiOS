# CI workflow census (verified 2026-09-18)

Date: 2026-09-18. Family: census record. Origin: wayfinder round 8 cycle 22. Observations live
at `a6fbbdb9`.

`.github/workflows/` holds **39 workflow files** at this pin — up from the 22 the 2026-07-29
records describe. The growth is the 2026-08 playbook-gap work (OMN-156's bootc-lifecycle,
sysext-portable, and companion lanes) plus the Lean proof workflows (`lean-check`, `lean-run`)
this round's earlier drift checks observed green on main. Pinning the count closes the gap the
round's drift checks kept tripping over: the "22 sibling workflows" figure in older docs is now
two snapshots behind.

## What this record does not claim

No per-workflow health audit: green/failing state lives in the Actions API and the blockers
register, not here. The count is blobs at one SHA; disabled or renamed workflows are counted
the same as active ones.

## Inputs

What the census pass consumed, from the pass's own record:

- The blob listing itself: the `.github/workflows/` tree at pin `a6fbbdb9`
  (fetched as a single tarball via codeload, then counted on-disk — 39 `*.yml`
  files, the number this record pins). No Actions API reads: the census counts
  files, not run health, which is exactly the boundary the does-not-claim
  section states.
- The stale figure being corrected: the "22 sibling workflows" description in the
  2026-07-29 org records (PR #145-era state), which the round's drift checks kept
  tripping over until this count was pinned.
- The provenance of the growth being explained: the 2026-08 playbook-gap PRs
  (OMN-156's bootc-lifecycle, sysext-portable, and companion lanes) and the Lean
  proof workflows (`lean-check`, `lean-run`) that earlier same-round drift checks
  had already verified green on main.

That is the whole input set: one tree listing at one SHA, one stale count to
replace, and the two change sources the count delta is attributed to.
