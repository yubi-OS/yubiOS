# CI_MAP drift check (2026-09-18)

_Moved from docs/ to refs/ 2026-09-19 per Jenny directive: docs/ holds ALL-CAPS normative docs only; wayfinding receipts and drift records live in refs/._
Date: 2026-09-18. Family: drift-check record. Origin: wayfinder round 11 rung
`add:s11:011110000`, exemplars `docs/SELF.md`, `docs/CI_MAP.md`, `docs/MAINTAINER.md`.

`docs/CI_MAP.md` is the workflow map. This round's census verified **39 workflow files** at
main (`refs/workflow-census-2026-09-18.md`). CI_MAP.md's own counts: [].
The round-8 drift checks already noted the "22 sibling workflows" figure in older docs is two
snapshots behind; this record confirms CI_MAP.md needs the same refresh whenever it next gets
edited (a map edit is a content decision; the round only flags).

## What this record does not claim

No CI_MAP.md edit was made; flagging stale counts is the round's job, doing the edit belongs to
the next content pass.

## Operating modes

The CI_MAP drift check is a check-only mode artifact: the record states the round only flags drift and never edits, so every run is side-effect-free by construction. "No CI_MAP.md edit was made; flagging stale counts is the round's job, doing the edit belongs to the next content pass" is the doc's explicit mode contract, and it also defines convergence behavior: a re-run against an unchanged `docs/CI_MAP.md` re-flags the same drift rather than fixing it. Idempotency here means repeatable flagging, not state convergence; the mutation mode lives elsewhere.

It is a one-shot record, not a recurring service. It is anchored to a single date (2026-09-18), a single wayfinder invocation (round 11, rung `add:s11:011110000`), and a single census artifact (`refs/workflow-census-2026-09-18.md`, 39 workflow files at main). Recurrence is inherited from the wayfinder cadence, not scheduled by this file: round-8 drift checks ran the same check earlier, and this record confirms the "22 sibling workflows" figure in older docs is two snapshots behind. There is no cron, daemon, or background mode; the lifecycle is one round per record.

Missing-input handling is evidenced in the record's own data: CI_MAP.md's own counts field is empty (`[]`), and the record stores that emptiness as-is rather than failing or inventing numbers. That is the check's de facto partial-failure semantics: degrade to an honest empty count and flag staleness instead. No exit codes, stdout contract, TTY handling, or flags exist; the check is prose-record based, not a CLI, and the doc defines none. That absence is a real gap on the mode axis, not behavior to invent. Its only documented relocation is archival: moved from docs/ to refs/ on 2026-09-19 under the Jenny directive, changing where the record lives, not how it runs.
