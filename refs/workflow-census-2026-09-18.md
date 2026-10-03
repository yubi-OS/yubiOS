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
