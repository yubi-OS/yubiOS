# Adjacent problems: the corpus-improvement loop (2026-10-03)

Date: 2026-10-03. Family: adjacent-problems record. Joins the instrument-deployment records
`refs/point-map-real-cloud-2026-09-06.md` and `refs/refs-refresh-jev-weighted-2026-09-29.md` per
this round's rung; the exemplar family is the adjacent-problems series
(`refs/adjacent-problems-fido2-secure-boot-2026-09-01.md`,
`refs/adjacent-problems-verification-chain-2026-09-01.md`,
`refs/external-benchmarks-sources-2026-07-25.md`).

## The focal problem and its family

The corpus-improvement loop (frozen baseline check, instrument candidates, one atomic edit, gate,
taskcheck-gated commit-or-revert) sits in a family of automated document-quality problems the
corpus already solves elsewhere: corpus curation at scale (the refs-refresh sweep solves it with
jev-weighted triage and one PR per doc), deployment verification (the point-map's real-cloud record
solves it with frozen frames on a live worker), and build-attestation (the SLSA/cosign records
solve it with signed provenance). The loop's own problem - deciding which edit actually improved
the corpus - is the same shape as the deployment problem: a measurement against a frozen
reference, gated by an independent check.

## Alternative solutions and why they are retired here

Three alternatives exist in the corpus's own history. Human-only review (the pre-agent rounds) is
too slow for a 255-doc corpus. LLM-judge scoring alone (the free-prose grader era) was superseded
by the structured-evidence scorer v2 after the grader band measured 6-8x the true effect
(2026-10-03 refs3 finding). Geometric rung-following without a text-level check (the round-6 era)
was superseded by the frozen task check. Each retirement is a recorded measurement in the round
records, not a preference.

## What this record does not claim

No new measurement is recorded here; the round records carry the numbers. The taxonomy above is
descriptive and does not claim the listed systems are equivalent or complete.
