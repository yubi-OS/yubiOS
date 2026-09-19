# Frozen-check drift census: refs/ at main b1dabac0 vs the 2026-09-18 sweep baseline

Date: 2026-09-19. Family: drift record (dated record in `refs/`, per the
rounds-10/11 receipt rule). Companion to
[`refs/sweep-2026-09-18-results.md`](sweep-2026-09-18-results.md). Method: the
frozen check `tools/skill-check/skillcheck.sh` C1–C7, run locally over two
trees — current `main` (`b1dabac0`, 228 files, the round-14 baseline set) and
the sweep merge commit (`a6fbbdb9`, 185 files). The check file is
byte-identical at both commits (verified by diff of the raw blobs), so any
pass-rate difference lives in the files, not the check.

## 1. Current main (b1dabac0, N=228)

118 pass, 110 fail. Classes (files can fail more than one class):
C5 template capability paragraphs 109, C3 placeholder TODO lines 11, C6
unresolved local link 1. Partition by provenance (tree diff of `refs/` between
`a6fbbdb9` and `b1dabac0`: 43 files added, 0 removed):

| population | n | failing |
|---|---|---|
| sweep-era files (present at `a6fbbdb9`) | 185 | **110** |
| post-sweep additions (round-13 ADDs, admission records, drift checks) | 43 | **0** |

## 2. The sweep-era tree under the identical check

Re-running the same frozen check over the 185 files exactly as they exist at
the sweep merge commit: **112 of 185 fail** (C5 111, C3 11, C6 1). The sweep
results record states "0 failing of 185 — verified on the sweep branch head
before the merge". This census could not reproduce that state under the
byte-identical check that lives in `tools/skill-check/` at the sweep merge
itself.

## 3. What this record establishes, and what it does not

- Established: the sweep commit exists (`a6fbbdb9`, 70 files repaired, one
  file per commit); the post-sweep additions to `refs/` all pass the frozen
  check; the failing population is the sweep-era set, essentially unchanged
  between the sweep head (112 failing) and current main (110 failing, a net
  −2 while the corpus grew by 43).
- Established: check drift is ruled out as the explanation (byte-identical
  check at both commits).
- Not established: what verification produced the "0 failing of 185" line in
  the sweep record. Possibilities include a different check invocation (for
  example a different working root for the relative-link class C6) or a check
  revision that never landed in `tools/skill-check/`. The record of that
  verification is not citable from the repo, so this census leaves the
  discrepancy standing rather than explaining it.
- Not claimed: that the sweep did no good. The two-class repair work it lists
  (C1 mojibake, C2 duplicate H2) is not re-litigated here; C5 was not among
  the sweep's repaired classes, which is consistent with C5 dominating the
  residual failures in both trees.

## 4. Practical consequence for round 14

The 110-file frozen-check backlog at the round-14 baseline is real and
concentrated in one class (C5, 109 files). Under the round-13 protocol the
wayfinder names only a few of these per round through its rungs; the rest are
a corpus-wide sweep candidate in its own PR, instrument uninvolved, per the
rounds-5/6 post-mortem rule. This census is the dated receipt that the
backlog exists at round-14 baseline `b1dabac0` / map 437.
