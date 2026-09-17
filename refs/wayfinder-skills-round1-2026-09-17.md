# Wayfinder skills round 1: 10 cycles on `skills/` (held for review)

**Date:** 2026-09-17. **Corpus:** `skills/**` at `eb373674` (504 blobs; 495 non-empty text items after `.gitkeep` and empty files are dropped; 4,449,152 UTF-8 bytes). **Instrument:** `pointmap/0.2`, d=9, seed 20260906, threshold median, K=40, T=0.05, under `limits/2` (the previous 400-item cap would have rejected this corpus). **Baseline:** map **81**, frame `c121727f65df58ae`, instrument `6782a97ca9c308de`, isolated 31/495, 12/12 sectors occupied, stored V2 null z=+41.31 (descriptive). Every cycle chains `baseline_id` to the previous map, so the frame is frozen across the round. **Branch:** `wayfinder-skills-round1-2026-09-17` from `74882bf5`, held for review; nothing merged.

## Protocol (frozen before the first cycle)

1. Take the top-ranked ladder rung of the latest map. ADD rungs are declined by policy (the round fixes real defects in existing skills; it does not author synthetic skills to move geometry) and recorded once per sector in the ledger. CHANGE rungs name a real file. When the 5-rung ladder has no untouched CHANGE target (candidate exhaustion under this generator), the literal exemplars the rungs name are taken in ladder order with `predicted_delta: null`.
2. Pre-register a `pending` outcomes row (prediction from the rung) before touching the file.
3. Run the frozen check `skillcheck.sh` (C1 mojibake/replacement bytes; C2 duplicate H2 headings; C3 placeholder "TBD per file context / TODO: refine" lines; C4 SKILL.md frontmatter per the skill-format spec: closed block, `name` `^[a-z0-9-]{1,64}$`, `description` 1..1024 chars with no `<`/`>`; C5 template capability paragraphs asserting least-privilege / OPA policy / trust-chain / runtime-detection participation; C6 unresolved local links). PASS → `abstained`, no edit, no commit.
4. FAIL → apply the deterministic fixer (base64-decode a base64-committed file; fix mojibake; move description overflow past 1,000 chars into an "Extended description" body section verbatim; strip angle brackets in descriptions; drop placeholder TODO sections; replace each template capability paragraph with a dated coverage note; merge duplicate H2 sections into the first occurrence, keeping all non-duplicate body text). Re-run the check; if still FAIL, revert and record `declined`.
5. Commit the single file to the held branch; after-map with `baseline_id` = latest on the exact baseline name set; append the `kept` verdict row with `after_id` (observed delta recomputed server-side) superseding the pending row.

Prevalence before the round (same check, all 112 SKILL.md): 24 PASS / 88 FAIL (C5 in 58 files, C2 in 26, C4 description > 1024 in 14, C4 base64-committed body in 13, C4 angle brackets in 1). The round touched only what the ladder named.

## Cycles

| # | via | target | predicted Δiso | observed Δiso | bits | geodesic | edit | commit | after-map | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | rung | `code-review-and-quality/SKILL.md` | -1 | 0 | 0 | 0 | C5 replaced 3 template capability paragraph(s) | `67fde73f` | 83 | kept |
| 2 | rung | `code-simplification/SKILL.md` | -1 | 0 | 1 | 0.708 | C5 replaced 1 template capability paragraph(s) | `5feaa409` | 84 | kept |
| 3 | rung | `context-engineering/SKILL.md` | -1 | — | — | — | passes every frozen check; no edit | — | — | abstained |
| 4 | rung | `debugging-and-error-recovery/SKILL.md` | -1 | 0 | 1 | 0.708 | C5 replaced 2 template capability paragraph(s) | `94397197` | 85 | kept |
| 5 | rung | `deprecation-and-migration/SKILL.md` | -1 | 0 | 0 | 0 | C5 replaced 2 template capability paragraph(s) | `e8d01898` | 86 | kept |
| 6 | — | — | — | — | — | — | ladder exhausted under this generator (5 rungs, all CHANGE targets touched) | — | — | no change |
| 7 | exemplar | `agents-sdk/references/observability.md` | None | — | — | — | passes every frozen check; no edit | — | — | abstained |
| 8 | exemplar | `agents-sdk/references/server-driven-messages.md` | None | — | — | — | passes every frozen check; no edit | — | — | abstained |
| 9 | exemplar | `audit-evidence-packaging/SKILL.md` | None | 0 | 0 | 0 | C2 merged 1 duplicate H2 section(s) into their first occurrence | `9f000bec` | 87 | kept |
| 10 | exemplar | `bootc-images/SKILL.md` | None | 0 | 0 | 0 | C5 replaced 2 template capability paragraph(s) | `5541d9ab` | 88 | kept |
| 11 | exemplar | `cloudflare/references/argo-smart-routing/api.md` | None | — | — | — | passes every frozen check; no edit | — | — | abstained |

Chain of maps: 81 → 83 → 84 → 85 → 86 → 87 → 88 (map 82 is a stray after-map whose name set included 5 files repo-items had excluded; not used, noted in row 10). Isolated count stayed **31** through all six kept edits. Bits moved in 2 of 6 kept edits (1 bit each, geodesic 0.708); 4 of 6 were quantization-silent.

## Reading

- Every kept edit removed something false or malformed (template paragraphs asserting capabilities the skill does not implement, a duplicated section) and changed nothing else. The independent check decided; the geometry was recorded.
- Geometrically the round is flat: 0 isolated-count change in 6/6 kept edits against 4 predictions of −1 (cycles 1, 2, 4, 5: sign not exact) and 2 with no prediction (exemplars). The rung hypothesis "flip bit 4 by turning on axis 4" did not come true for any of the C5 removals; removing a template paragraph moved at most one bit and never the one predicted. That is an instrument observation on frame `c121727f…`, not evidence about the edits' value.
- The ladder generator exhausted after 4 distinct CHANGE targets (cycle 6). Its exemplar lists then pointed at agents-sdk/cloudflare reference pages that already pass the check (abstentions) and at two SKILL.md files with real defects (kept).
- Not done in this round: the 82 remaining SKILL.md files that fail the same check but were not named by the ladder. They are a content-quality backlog independent of geometry; a plain sweep with the same fixer and check would clear them without the instrument.

## Ledger (baselines 81–88)

22 rows; effective 12: {"declined": 2, "kept": 6, "abstained": 4}; sign-comparable 4, sign-exact 0. Declined ADD rungs: sectors 4 and 7. Counts only; not a rate.

## Infrastructure notes from this round

- `limits/2` (PR #238, `eb373674`): 4000-item corpora, per-request uncached-embedding budget with a batch warm-up hint, KV overflow storage for maps > 1.9 MB, Worker CPU budget 300 s. The first deploy bound `map.classes` (an object) into D1 and returned 500 on every persist for ~9 minutes (11:16–11:26Z); fixed in `74882bf5` with a strict-D1 test on a real `runMap` output.
- Cache warm-up: 495 documents embedded in 5 batches of 100 (61 s total); the baseline map then took 11.6 s, each after-map 6.5–9.1 s.
