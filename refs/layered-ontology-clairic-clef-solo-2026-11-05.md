# Layered Ontology Engine (Clairic + Clef over Harness & Corpus) [SOLO]

Date: 2026-11-05
Source: ideate-solo (no dialogue)
Scope class: systemic
Variations generated: 6
Finalist: V4 — Clairic-Extracted, Clef-Adjudicated 4-Layer Ontology Compiler + Grounded Chat Synthesis (`jev-ontology.js`)

## Problem Statement
How might we reverse-engineer `NVIDIA/auto-ontology`'s 4-stage semantic compilation (`compile.py`, `visit_enter.py`, `semantic_fk.py`, `sql_attribute_suggester.py`, `bridge_tables.py`) and interactive grounding/collision/completeness/evidence pipeline (`coordinator.py`, `entity_resolution.py`, `kb_coverage.py`, `completeness.py`, `evidence.py`) into our zero-dependency Cloudflare Worker using **Clairic** (`@cf/cloudflare/clairic`) for single-pass typed span/entity/attribute extraction and **Clef** (`@cf/cloudflare/clef`) for probabilistic collision adjudication, cross-concept FK linking, and completeness gating, so any Harness or Corpus compiles into a deep 4-layer ontology that directly upgrades the user-facing response in the Ops Console chat?

## Recommended Direction
We build a first-class, zero-dependency **Layered Ontology Engine (`jev-ontology.js`)** directly on the `steady-orbit` worker that compiles any **Harness** (its 8-component tree `H`, tools, funnel targets, DAG nodes, and experience library) or **Corpus** (`refs/`, `knowledge/<ref>/`, or inline document sets) into a **4-Layer Ontology Graph**, and wires that ontology directly into the **Agentic Chat Console (`jev-agentic-console.js`)** at query/execution time.

Why V4 wins (19/20): `NVIDIA/auto-ontology` achieves high accuracy on complex questions not through a single prompt, but through a **structured 4-stage compilation** paired with a **5-step interactive grounding & completeness cascade**:
1. **Layer 0 (Artifact & Schema Profiling — `visit_enter.py` analog):** Profiles each Harness component (`system_prompt`, `guardrails`, `memory`, `tool_guidance`, `subagents`, `skills`, `scripts`, `plugins`) or Corpus document for structural tokens, cardinalities, numeric/date shapes, and unit markers (`[unit: ...]`).
2. **Layer 1 (Clairic Typed Term & Attribute Extraction — `term_extractor.py` + `clairic`):** Uses Cloudflare **Clairic** (`@cf/cloudflare/clairic` + deterministic span kernel) in a single prefill pass per unit to extract canonical **Terms** (domain concepts), **Attributes** (typed fields/parameters/inputs/outputs with character-offset spans), and **Synonyms** (explicit parentheticals, aliases, and acronyms), committed in canonical `_OrderedCommitQueue` order so colliding Term names qualify deterministically (`Term (Scope)`).
3. **Layer 2 (Clef Semantic-FK & Bridge Resolution — `semantic_fk.py` + `bridge_tables.py` + `clef`):** Resolves cross-component and cross-document `SEMANTIC_FK` edges (`REPRESENTS`, `HAS_ATTRIBUTE`, `SEMANTIC_FK`, `GOVERNED_BY`, `BRIDGES_TO`), prunes disjoint edges with zero token/value overlap (`prune_disjoint_semantic_fks`), selects canonical default join paths (`select_semantic_fk_join_defaults`), and synthesizes **Bridge Attributes** for junction nodes (e.g., Console Funnel targets and DAG nodes that bridge user intents to Policy v27 tools).
4. **Layer 3 (Derived Measures, Formulas & 3-Level Hierarchy — `sql_attribute_suggester.py` + `kb_coverage.py`):** Extracts reusable formulas, invariants, and thresholds (`R = 4k`, `P = 3k`, `decision_threshold = 0.55`, `D in [1.3, 1.5]`, `V2`, `dBc`, Brier/Kelly formulas) as typed **MeasureAttributes** and builds a 3-level parent→child→grandchild→great-grandchild expansion map (`expand_kb_with_children`, capped at 5 children per parent).

At **Chat Console turn time**, before composing `human_response`, the console runs the **Ontology Grounding & Completeness Pass**:
- Normalizes query entities (`_normalize_entity`, stripping aggregation/structural fillers while preserving compound domain terms), resolves each entity against the 4-layer ontology, detects near-tie ambiguities (`gap < 0.25` within `max_distance <= 0.65`), and runs the **5-step Collision Resolver** (Step 0: Formula vs. raw attribute adjudication; Step 1: cached `hit_verdicts`; Step 2: composite multi-key sharing note; Step 3: score-margin auto-split `margin >= 0.04, loser_gap < 0.08`; Step 4: Clef `askJev` adjudication; Step 5: fail-closed drop).
- Expands 3-level concept hierarchies (`Concept -> Sub-Concept -> Mechanism/Formula -> Verification Gate`), runs the **Completeness Detector** (`COMPLETE` vs `INCOMPLETE: <term> | <missing>`), compresses a `Term = <grounded definition / formula / hop-chain>` **Evidence Block**, and structures the user-facing `human_response` with explicit epistemic state separation (`observed`, `computed`, `modeled`, `predicted`, `recommended`, `committed`) and multi-hop concept lineage.

## Key Assumptions to Validate
- [x] **A1 (Clairic + Deterministic Kernel Parity):** Clairic 9-type extraction (`text`, `number`, `date`, `time`, `datetime`, `duration`, `list`, `estimate`, `forecast`) plus deterministic span extraction can populate `Term`, `ColumnAttribute`, `Synonym`, and `MeasureAttribute` nodes with 0ms fallback when offline or in unit selftests. Tested via `ontologySelfTest` Gate 1 & Gate 2.
- [x] **A2 (Clef Collision & Subsumption Adjudication):** `askJev` (`@cf/cloudflare/clef`) can adjudicate Step 0 (`KB_FORMULA` vs raw attribute) and Step 4 (multi-entity collision on shared node ID) using probability margin `>= 0.55`, with deterministic score-margin fallback (`_COLLISION_WINNER_MARGIN = 0.04`, `_COLLISION_LOSER_MAX_GAP = 0.08`). Tested via `ontologySelfTest` Gate 3 & Gate 4.
- [x] **A3 (User-Facing Chat Response Quality):** Injecting the 4-layer ontology evidence block, 3-level hierarchical expansion, hop-chain path (`findTermLinkPath`), and epistemic state tags (`observed` / `computed` / `recommended` / `gated`) into `jev-agentic-console.js` measurably deepens user-facing answers without violating the Ops Console System Manifest disclosure policy (`NO SOURCE ACCESS` for internal deployment files). Tested via live `/api/jev/console/chat` probes and the 1,000-prompt verification suite.

## MVP Scope
1. **New Worker Module (`parts/jev-ontology.js`):**
   - Full 4-layer ontology compiler (`compileOntologyGraph`) supporting both `scope: "harness"` (any named Harness² set in D1 or default 8-component tree) and `scope: "corpus"` (any doc array or built-in corpus/manifest).
   - Canonical `_OrderedCommitQueue` deterministic Term/Attribute/Measure allocation + Synonym extractor + `SEMANTIC_FK` resolver with disjoint-edge pruning + Bridge-table synthesizer + 3-level hierarchy builder.
   - Interactive Query Grounding engine (`groundQueryWithOntology`): `_normalize_entity`, `_ambiguity_check`, 5-step `_resolve_collisions` (with Clef `askJev` integration), 3-level `expandKbWithChildren`, `detectIncompleteFormulas`, `generateOntologyEvidence`, and `findTermLinkPath` (BFS shortest semantic hop chain between any two concepts).
   - 6-Gate pre-registered selftest (`ontologySelfTest`).
2. **Routes & Funnel Integration (`routes-jev.js`, `jev-console-funnel.js`, `jev-n8n-dag.js`):**
   - `GET /api/jev/ontology/graph` — full 4-layer semantic & data exploration graph (`nodes`, `links`, `layers`, `stats`).
   - `POST /api/jev/ontology/compile` — compile a 4-layer ontology for a given `harness_id` or `corpus` (`docs[]`), persist to D1 (`jev_ontologies`), and return the compiled graph + layer breakdown.
   - `POST /api/jev/ontology/ground` — run the full entity-coverage, 5-step collision resolution, 3-level hierarchy expansion, completeness check, hop-chain pathfinder, and evidence synthesis for any question against an active harness/corpus ontology.
   - `GET /api/jev/ontology/path` (`?from=<term>&to=<term>`) — compute the exact multi-hop semantic relationship chain (`REPRESENTS`, `HAS_ATTRIBUTE`, `SEMANTIC_FK`, `BRIDGES_TO`, `MEASURED_BY`) between two concepts.
   - `GET /api/jev/ontology/selftest` — run the 6-gate deterministic verification suite.
   - Register `ontology.compile`, `ontology.graph`, `ontology.ground`, `ontology.path`, and `ontology.selftest` in the Console Funnel catalog and add `ontology.ground` as a first-class DAG node type.
3. **Agentic Chat Console Deep-Layered Response Upgrade (`parts/jev-agentic-console.js`):**
   - Wire `groundQueryWithOntology` into the chat turn pipeline so every substantive domain/harness/corpus/analytical question receives:
     - Deep 4-layer concept grounding (`Concept -> Attributes -> Cross-Links -> Formulas/Invariants`),
     - Resolved semantic hop chains between mentioned entities,
     - Explicit epistemic state badges (`Observed`, `Computed`, `Modeled`, `Recommended`, `Gated`),
     - Completeness verification (surfacing any unresolved operand or constraint explicitly rather than guessing).

## Not Doing (and Why)
- **Not deploying a separate FastAPI + Postgres pgvector container stack:** Our entire architecture runs serverless on the `steady-orbit` Cloudflare Worker with D1, KV, Vectorize, and Workers AI (`Clairic` + `Clef`). Adding external containers would violate single-worker consolidation.
- **Not exposing internal deployment filenames or binding names in user-facing ontology nodes:** Per the 2026-11-02 Harness disclosure rule, the default Harness ontology models the user-facing and model-facing **Ops Console System Manifest** (`v3.4.0`, Policy `v27`, 8-component tree, 11 Policy tools, 26 DAG node types, 151 Funnel targets, formulas, and workflows) while preserving `NO SOURCE ACCESS` for internal deployment source files.
- **Not using external codenames ("NVIDIA", "auto-ontology", "LangGraph", "NIM") in user-facing UI or responses:** Per the 2026-10-24 branding rule, all user-facing labels use our own **Layered Ontology Engine** / **Semantic Graph** terminology.

## Open Questions
- None blocking; all 6 verification gates and the 1,000-prompt suite are self-contained and testable immediately.

## Generation log (for review)
- **V1 — Top-Down Axiom-First Ontology (Inversion Lens):** Instead of `auto-ontology`'s bottom-up table/doc profiling, require operators to author a top-down formal OWL/YAML ontology first and reject any corpus doc that doesn't conform.
  - *Scores:* Painkiller=2 (creates authoring toil instead of automating discovery), Switching=2 (high manual setup), Defensibility=3, Testability=4 → **Total: 11/20**.
- **V2 — Continuous Multi-Pass Full-Corpus Clairic+Clef Cross-Product (Constraint Removal Lens):** Run `Clairic` on every paragraph and `Clef` on every $O(N^2)$ pair of extracted terms across all corpora on every turn.
  - *Scores:* Painkiller=4, Switching=4, Defensibility=4, Testability=2 (exceeds Worker CPU/subrequest budgets on large corpora without canonical pre-compilation and `_OrderedCommitQueue` caching) → **Total: 14/20**.
- **V3 — End-User Conversational Epistemic Explainer (Audience Shift Lens):** Retarget `auto-ontology`'s internal SQL-compiler evidence block (`evidence.py` + `query-validation.md`) directly at the human operator in the `/jev/` Chat Console so the user sees layered explanations (`Concept Definition -> Structural Lineage -> Formula/Grain -> Epistemic Status`) instead of flat prose.
  - *Scores:* Painkiller=5 (directly solves shallow chat answers), Switching=5 (drop-in upgrade to `human_response`), Defensibility=4, Testability=4 → **Total: 18/20**.
- **V4 — Clairic-Extracted, Clef-Adjudicated 4-Layer Ontology Compiler + Grounded Chat Synthesis (Combination Lens — WINNER):** Combine `NVIDIA/auto-ontology`'s 4-stage compilation (`visit_enter` profiling -> `term_extractor` -> `semantic_fk` + disjoint pruning -> `sql_attribute` + `bridge_tables`) and 5-step interactive grounding (`_ambiguity_check`, `_resolve_collisions`, 3-level `expand_kb_with_children`, `detect_incomplete_formulas`, `generate_evidence`) with **Clairic** (Stage 1 typed span/entity/measure extraction) and **Clef** (Stage 2/3 probabilistic FK & collision adjudication), feeding both `/api/jev/ontology/*` and the V3 layered Chat Console response synthesizer.
  - *Scores:* Painkiller=5 (delivers both deep harness/corpus understanding AND superior chat output), Switching=5 (pure ES module in-worker, zero new infra), Defensibility=5 (tight integration of Clairic spans, Clef probabilities, D1 persistence, and Policy v27 governance), Testability=4 (deterministic 6-gate selftest + live chat verification) → **Total: 19/20**.
- **V5 — Regex Glossary Lookup Table (Simplification Lens):** Strip out graph edges, FK inference, collision resolution, and completeness checking; keep only a flat key-value glossary injected into chat prompts.
  - *Scores:* Painkiller=2 (fails on multi-hop relationships, colliding terms, and composite formulas), Switching=5, Defensibility=1 (trivial dictionary), Testability=5 → **Total: 13/20**.
- **V6 — DAG-Compiled Ontology Workflows Only (Combination Lens 2):** Expose ontology extraction exclusively as a 4-node DAG template without automatic chat-turn grounding.
  - *Scores:* Painkiller=3 (misses automatic chat response improvement when the user asks normal questions), Switching=4, Defensibility=3, Testability=4 → **Total: 14/20**.

### Stress-Test of Finalists (V4, V3, V6)
1. **V4 (Winner — 19/20):**
   - *Strongest critique:* Running live LLM/Workers AI calls on every chat turn for ontology compilation would add latency. *Mitigation:* Pre-compile and cache the 4-layer ontology in memory + D1 (`jev_ontologies`), and run the fast deterministic + Clef-assisted grounding pass (`groundQueryWithOntology`, `<5ms` deterministic path, optional live `Clairic`/`Clef` enrichment on `/api/jev/ontology/compile` and `/api/jev/ontology/ground`) on each chat turn.
   - *Second-order effects:* Every new Harness set or minted Corpus automatically gains a browsable 4-layer semantic graph, hop-chain pathfinder, and grounded chat responses.
   - *Un-testable bet:* None — both corpus/harness compilation and chat response synthesis are deterministically verifiable in-worker.
2. **V3 (Runner-up — 18/20):**
   - *Strongest critique:* Improves chat formatting but lacks a standalone `/api/jev/ontology/*` compilation and graph inspection API for arbitrary corpora/harnesses. Folded into V4 as Stage 5 (Response Synthesis).
3. **V6 (3rd place — 14/20):**
   - *Strongest critique:* Requires manual DAG invocation instead of enriching every relevant chat turn automatically. Folded into V4 by providing both automatic chat grounding AND the `ontology.ground` DAG node.
