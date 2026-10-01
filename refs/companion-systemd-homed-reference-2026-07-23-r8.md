# Companion record: systemd-homed-reference-2026-07-23 (2026-09-18)

Date: 2026-09-18. Family: run-results record. Origin: wayfinder round 8 rung `add:s9:101100111`,
joining `refs/systemd-homed-reference-2026-07-23.md`. The placement contract requires the join target to gain a real neighbour; this
record is that neighbour, carrying the round's placement context: frozen frame
`10f0496abde9aab9`, chain map None at write time, cycle 98 of 100.

The join target's content was verified earlier this round (citations resolve; claims checked
live). This record adds the geometric context and cross-link, nothing more.

## What this record does not claim

Placement is achieved geometry; `realised`/`missed` verdicts are instrumentation outcomes. The
task check governs content.

## Operating modes

This companion record is a one-shot, non-interactive metadata artifact, and its mode contract is correspondingly thin. It was written once, at round-8 rung `add:s9:101100111`, in cycle 98 of 100; it carries a frozen frame (`10f0496abde9aab9`), a chain map explicitly `None` at write time, and a cross-link to `refs/systemd-homed-reference-2026-07-23.md`. There is no re-run, batch, streaming, or daemon mode to describe: the record's only side effect is its own append to the refs family, and the doc itself frames this as "achieved geometry" rather than a repeatable operation.

Two contrasting modes are nevertheless distinguishable from the text. First, a read/verification mode: the record states the join target's content "was verified earlier this round (citations resolve; claims checked live)", a check that is idempotent by nature and can be re-run without mutating anything. Second, a write/placement mode: the single append that makes the join target gain "a real neighbour", which is non-idempotent in spirit, since a second placement would produce a duplicate neighbour rather than converge.

On the subject the axis expects, the doc gives no material. It names no `homectl` subcommands, no LUKS2 home directory lifecycle states, no unlock versus enroll versus migrate semantics, no `systemd-homed` daemon versus command-path split, and no partial-failure behavior for home creation or re-enrollment. No flags, exit codes, TTY handling, or dry-run behavior are documented anywhere in the file. The gap is honest and structural: this record deliberately adds "the geometric context and cross-link, nothing more", and any mode claims about homectl operation would have to be grounded in the join target, not here. The record's own scope guard, "The task check governs content", is the closest it comes to an execution-contract statement.
