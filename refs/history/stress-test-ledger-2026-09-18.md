# Stress-test status ledger (2026-09-18)

Date: 2026-09-18. Family: run-results record (cf. `refs/cycle4-results-2026-08-06.md`). Origin:
wayfinder round 8 rung `add:s1:011000011`, joining
`refs/yubios-stress-test-assertions-2026-08-07.md` (the adversarial stress-test design doc this
ledger answers to). Sources: the round's own verified records; no new CI was dispatched.

| Stress test (of the 8) | Evidence state 2026-09-18 | Source |
|---|---|---|
| FIDO2 unlock end-to-end | **PASS recorded** — physical-key hardware leg + arm64 guest proof (OMN-42/89 closed) | `docs/BLOCKERS.md` Not-Current section; round-7 records |
| Sealed-UKI VM boot lane | **PASS recorded** — 5-job matrix green (round-6-era PR #155) and the sealed-UKI/vGPU chain green x3 on 2026-09-09 | `refs/blockers-drift-check-2026-09-09.md` |
| bootc upgrade/rollback + sysext/portable | **LANES SHIPPED** — `ci_test-sysext-portable.yml` exercises sysext + portable-service VM legs (verified this round, cycle 1's record) | this round's records |
| Lean proof identities | **CI GREEN** — lean-check/lean-run success on main (verified cycle 28) | `refs/lean-ci-state-2026-09-18.md` |
| Reproducible builds (two-build compare) | harness shipped; no fresh two-build evidence run this round | corpus records |
| Digest/supply-chain pin integrity | **FAILING LIVE** — the fedora-bootc pin 404s on quay since ~2026-08-05 | `refs/fedora-bootc-digest-drift-check-2026-09-18.md` |
| ARM64 Path A real-board proof | **OPEN** — sacrificial ROTPK/fuse rehearsal not run; board evidence still required | `docs/BLOCKERS.md` B-ARM64-PATHA |
| CHIPSEC firmware gate | **POST-LAUNCH GATED** — yubiOS#24 open, deferred by design | `refs/chipsec-issue24-state-check-2026-09-18.md` |

Score against the design doc's universal rule ("every test fails closed or recovers cleanly"):
the recorded evidence covers 4 of 8 tests with real runs; 1 is failing live (the pin), 1 is
gated by design, 2 remain evidence-open. The ledger's purpose is the honest count, not a
score.

## What this record does not claim

No new test runs were dispatched for this ledger; every row cites existing verified records.
The pass/fail mapping is only as current as those records (latest read 2026-09-18).
