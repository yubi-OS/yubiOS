# Wayfinder rounds 7–12 audit: wins, debug items, and the lessons they add

**Date:** 2026-09-18. **Sources:** PRs #245–#251 (all merged by review), `refs/wayfinder-round{7,8,10,11,12}-results-*.md`, `refs/skills-sync-state-2026-09-18.md`, and the operating session's own notes (`ses_f509f22b`). Rounds 5/6 are covered separately in `refs/wayfinder-rounds-5-6-postmortem-2026-09-17.md`.

## Wins (keep doing these)

| Round | Corpus | What worked |
|---|---|---|
| 7 (#245) | refs/ 183 | A real rung-driven ADD (`adjacent-problems-nspawn-boundary`, joins container-isolation) written toward `joins`, previewed twice, **recorded honestly as missed-pattern / not sign-exact and still kept on task grounds**. A CHANGE rung declined as content-resistant instead of padded. Checker defects found by sampling failures (fenced code blocks, `../` links) and fixed as a **versioned, disclosed amendment (v1.1)** mid-round. |
| 8 (#247) | refs/ 185→197 | Drift-check records that surfaced four **actionable, live-verified findings**: stale `fedora-bootc` digest 404 (main image build blocked), `B-VGPU-VM-UNZUP` retirement condition met but register stale, `B-BOOTC-SEAL` version floor unblocked upstream, open-issue count moved. Cycle 9 was **sign-exact and `realised`** (the first `placement/1` realised rung on record). A driver bug was caught, **disclosed, and the round re-baselined** rather than mixed. |
| 9–10 (#248, #249) | docs/ 21 | Mojibake repairs; a **judgment merge** (MITIGATE.md complementary sections) and a **refusal to guess** (SPEC.md holds two complete spec versions; flagged in-file, maintainer decision). |
| 11 (#250) | docs/ 21 | Four rung-driven boundary/drift records; every doc dated-verified; corpus 0/21 failing. |
| 12 (#251) | skills/ 112 | **9/112 → 112/112 SKILL.md format-compliant** (spec 2.2: kebab-case name, description ≤1024 without `<>`, H1 immediately after frontmatter, `## Examples` + `## Guidelines`). Every Examples/Guidelines section authored **from that skill's own body** (its own workflow steps, its own MUST/NEVER rules); no template boilerplate; content-additive, nothing removed. **The round used the corpus's own format specification as the frozen check** — this is the transferable lesson. |

Across 7–12: every round pre-registered every cycle, chained `baseline_id`, ran a positive control and an axis trial, reported counts only, and held a draft PR. Geometry stayed flat-to-minor on every corpus (isolated within the control band; V2 within ±0.01), which the records state as an instrument observation.

## Debug items (what to fix)

1. **Round 8 driver bug — stale disk reload after in-memory mutation** built after-maps 188–192 against incomplete corpora; only caught because chained comparisons looked wrong. *Instrument fix shipped:* `/api/map` with `baseline_id` now accepts `transition: {max_changed_names, max_added, max_removed}` and returns **409 with the offending names and `persisted:false`** when the corpus differs from the baseline by more than the declared single transition. *Process rule:* the branch tree is the only ground truth; rebuild the corpus from the committed tree before every after-map (lesson 25).
2. **Round 11 ledger read returned zero rows mid-round.** A chained round spreads its rows across many `baseline_id`s; `GET /api/outcomes?baseline_id=` sees one link of the chain. *Instrument fix shipped:* `GET /api/outcomes?frame_id=<frame>` gathers every row on one frozen frame (rows already carry `frame_id`). Lesson 27.
3. **Results records first written to `docs/`, then moved to `refs/` by directive** (rounds 10–11). `docs/` holds ALL-CAPS normative documents only; receipts and drift records live in `refs/`. Lesson 24.
4. **Checker amendments mid-round (round 7 v1.1).** Acceptable because disclosed; avoidable by running the check over the whole corpus and inspecting a sample of failures *before* freezing. Version the check (`taskcheck v1.1`) and record the amendment in the ledger. Lesson 26.
5. **Drift-check addenda appended to normative docs** (round 11 added a dated verification note to all 22 docs). The directive for round 12 banned drift checks as an edit class. Rule going forward: a drift check produces a dated record in `refs/`, never an appended paragraph in the checked document (lesson 24 covers placement; lesson 23 covers the format contract).
6. **Round 12 driver hygiene:** a temp file inside the corpus directory tripped the kebab-case check; the results ledger left the corpus on a skills-only re-sync and crashed a batch. Keep scratch files and the results record outside the corpus root (or include the record consistently from cycle 1).
7. **Round 12 fell short of its budget** (96/112 at 100 cycles; 16 finished as post-round fixups on the same PR). Budget rounds by *failing files*, not by a fixed cycle count, when the check is corpus-wide.

## Lessons added to AGENT.md (23–27)

23 corpus-native format contract (round 12); 24 receipts live in `refs/`; 25 ground truth is the committed tree + `transition` guard; 26 version the check, disclose amendments; 27 read the ledger by `frame_id`. Full text in `tools/point-map/AGENT.md`.
