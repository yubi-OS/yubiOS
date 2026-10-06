# Round 8 outcomes-ledger state (2026-09-18)

Date: 2026-09-18. Family: ledger-state record. Origin: wayfinder round 8 cycle 35 — the
append-only ledger discipline deserves its own dated snapshot so the round's close can diff
against it.

| Baseline range | Rows |
|---|---|
| Maps 173-207 (round 8's chain, including the mid-round re-baseline) | 69 outcome rows |
| By verdict | {'pending': 35, 'kept': 34} |

Counts only, no rates: the ledger's discipline (pre-register before edit, verdict after the
independent check) is what this snapshot pins. The re-baseline (map 193, frame
`10f0496abde9aab9`) is disclosed in the round's records; rows on the pre-break baselines
(174-192) compare against maps built with stale sources and are marked by their baselines, not
silently mixed.

## What this record does not claim

No sign-agreement rate, no confidence: the ledger emits counts only. Pending rows are pending
until their verdict rows supersede them.
