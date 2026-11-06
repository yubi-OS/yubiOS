# SPEC: Layered Ontology Engine (`jev-ontology.js`) — Clairic + Clef Deep Understanding for Harnesses, Corpora & Agentic Chat

**Date:** 2026-11-05  
**Status:** Active Specification  
**Target Surface:** `steady-orbit` Worker (`/api/jev/ontology/*`, `/api/jev/console/chat`, `/jev/`)

---

## 1. Architectural Synthesis from External Source Audit

A full source-code audit of `NVIDIA/auto-ontology` identified two core subsystems that produce grounded, explainable answers over complex schemas and documents:

1. **4-Stage Semantic Compilation (`compile.py`, `pipeline.py`, `visit_enter.py`, `term_extractor.py`, `semantic_fk.py`, `sql_attribute_suggester.py`, `bridge_tables.py`):**
   - **Stage 1 — Profiling & Canonical Term Commit (`visit_enter.py`, `pipeline.py`):** Samples values, detects uniqueness (`is_unique`), infers date shapes (`_DATE_SHAPE_PATTERNS`), annotates nested JSON unit markers (`[unit: k.unit]`), extracts `Term` + `ColumnAttribute` + `Synonym` proposals, and commits them through an `_OrderedCommitQueue` keyed by canonical order so colliding Term names are qualified deterministically (`Term (Source)`).
   - **Stage 2 — Semantic FK Resolution & Disjoint Pruning (`semantic_fk.py`):** Links unattached reference attributes across terms (`SEMANTIC_FK`), rejects self-references, prunes edges with zero value/token overlap (`prune_disjoint_semantic_fks`), and picks one canonical default join path per `(source, target_attribute)` group (`select_semantic_fk_join_defaults`).
   - **Stage 3 — Reusable Measure / Formula Suggestion (`sql_attribute_suggester.py`):** Extracts recurring predicates, thresholds, ratios, and formulas and attaches them as named `MeasureAttribute` nodes on their owning `Term`.
   - **Stage 4 — Bridge / Junction Synthesis (`bridge_tables.py`):** Identifies pure-connector junction nodes (tables/endpoints/nodes whose role is connecting two or more domain entities) and synthesizes a structural `BridgeAttribute` linking the target `Term`s.

2. **5-Stage Interactive Grounding, Disambiguation & Evidence Synthesis (`coordinator.py`, `entity_resolution.py`, `kb_coverage.py`, `completeness.py`, `evidence.py`, `query-validation.md`):**
   - **Entity Normalization (`_normalize_entity`):** Strips structural/aggregation filler tokens (`average`, `count`, `total`, `ratio`, `rate`, `id`, `type`, `code`) only when non-fillers make up `>= 50%` of the phrase, preserving compound domain terms.
   - **Ambiguity Detection (`_ambiguity_check`):** Flags an entity as ambiguous when 2+ candidate nodes score within `CLARIFY_MAX_DISTANCE` (`0.65`) AND their score gap is `< _AMBIGUITY_MAX_GAP` (`0.25`).
   - **5-Step Collision Resolution (`_resolve_collisions`):**
     - *Step 0:* Formula (`KB_FORMULA`) vs. raw attribute adjudication when an entity has both a derived measure/formula and a competitive attribute match (`score < 0.62`).
     - *Step 1:* Cached `hit_verdicts` lookup by stable node ID.
     - *Step 2:* Composite multi-key detection (`_is_composite_hit`) — emits a shared-composite note (`use distinct sub-keys; do not conflate`) when two terms legitimately share a multi-key container.
     - *Step 3:* Score-margin auto-split (`_COLLISION_WINNER_MARGIN >= 0.04` and loser gap to next-distinct hit `< _COLLISION_LOSER_MAX_GAP = 0.08`).
     - *Step 4/5:* Fast model adjudication (in our stack: **Cloudflare Clef** `@cf/cloudflare/clef` via `askJev`) or fail-closed drop (never guess).
   - **3-Level Hierarchical Expansion (`expand_kb_with_children`):** Automatically expands matched parent concepts to children, grandchildren, and great-grandchildren (up to 3 levels deep, max 5 children per parent).
   - **Completeness & Evidence Compression (`detect_incomplete_formulas`, `generate_evidence`, `query-validation.md`):** Flags incomplete formulas (`INCOMPLETE: <term> | <missing>`), formats `Term = <grounded definition / formula / constraint>` with `[UNRESOLVED: <term>]` placeholders for unconfirmed operands, and separates `observed`, `computed`, `modeled`, `predicted`, `recommended`, and `committed` evidence states in the final response.

---

## 2. Combining with Cloudflare Clairic & Clef

| Subsystem Stage | Original Stack | Steady Orbit Native Stack (`jev-ontology.js`) |
| :--- | :--- | :--- |
| **Typed Entity, Span & Measure Extraction** | LangChain + Nemotron LLM (`term_extractor.py`, `fk_suggester.py`) | **Cloudflare Clairic (`@cf/cloudflare/clairic`)** 9-type extraction (`text`, `number`, `date`, `time`, `datetime`, `duration`, `list`, `estimate`, `forecast`) + deterministic AST/span kernel with character offsets `[start, end]`. |
| **Semantic FK, Collision & Completeness Adjudication** | Secondary non-reasoning LLM (`_llm_pick_hit`, `_llm_disambiguate_collision`) | **Cloudflare Clef (`@cf/cloudflare/clef` via `askJev`)** answering typed probability/choice questions (`p >= 0.55` gate) + deterministic score-margin & token-overlap kernel. |
| **Ontology Graph Storage & Retrieval** | PostgreSQL + `pgvector` + SQLAlchemy | **In-Worker 4-Layer Graph + D1 (`jev_ontologies`)** with bipartite `Node <-> Attribute <-> Term <-> Measure` indices and BFS shortest hop-chain pathfinder (`findTermLinkPath`). |

---

## 3. The 4-Layer Ontology Model for Harnesses & Corpora

Every compiled ontology graph $G = (V, E, L)$ organizes knowledge into four explicit layers:

- **Layer 0 — Structural Units (`UnitNode`):**
  - For a **Harness**: the 8 Harness² components (`system_prompt`, `guardrails`, `memory`, `tool_guidance`, `subagents`, `skills`, `scripts`, `plugins`) + active Experience Library entries.
  - For a **Corpus**: each document (`doc.name`, `doc.text`), profiled for section headers, quantitative series/formulas, unit markers (`[unit: ...]`), and date notations.
- **Layer 1 — Canonical Concepts & Typed Attributes (`TermNode` & `AttributeNode`):**
  - User-friendly Title Case **Terms** (`Policy v27 Gate`, `Harness Budget Ledger`, `Three-Path Forecast`, `Data Refinery Pipeline`, `DAG Workflow Engine`, `Experience Reflector`, etc.), explicit **Synonyms** (`H`, `PPC`, `WAE`, `MASE`, `Kalman`, etc.), and typed **Attributes** (`source_field`, `display_name`, `datatype`, `is_unique`, `sample_values`, `unit`, `span`).
  - Allocated in canonical `_OrderedCommitQueue` order so colliding Term names across units are deterministically qualified.
- **Layer 2 — Semantic Foreign Keys & Bridge Relations (`SemanticFkEdge` & `BridgeNode`):**
  - Typed directed edges: `REPRESENTS` (`Unit -> Term`), `HAS_ATTRIBUTE` (`Term -> Attribute`), `SEMANTIC_FK` (`Attribute -> Term`, pruned when overlap = 0), `GOVERNED_BY` (`Term -> Policy/Guardrail Term`), and `BRIDGES_TO` (junction terms such as Console Funnel targets and DAG node types that bridge operator intents to execution tools).
- **Layer 3 — Reusable Measures, Formulas & 3-Level Taxonomy (`MeasureNode` & `HierarchyMap`):**
  - Named equations, invariants, and thresholds (`R = 4k`, `P = 3k`, `decision_threshold = 0.55`, `D in [1.3, 1.5]`, `sigma_hat = (Q90 - Q10) / (2 * 1.28155)`, `delta_MASE < 0`, `Von_confidence = p1 - p2`) with explicit grain, unit, denominator guard, and 3-level parent→child→grandchild→great-grandchild hierarchy links.

---

## 4. API & Agentic Chat Console Contract

### 4.1 HTTP Endpoints (`/api/jev/ontology/*`, Bearer-Gated)
1. `GET /api/jev/ontology/graph?scope=harness|corpus&id=<id>`
   - Returns the compiled 4-layer ontology graph (`nodes`, `links`, `layers`, `hierarchy`, `measures`, `bridges`, `stats`) with pre-truncation relationship degree counts (`relationship_count` invariant from `exploration.py`).
2. `POST /api/jev/ontology/compile`
   - Body: `{ scope?: "harness" | "corpus", harness_id?: string, name?: string, docs?: Array<{name: string, text: string}>, use_live_ai?: boolean }`
   - Runs the 4-stage Clairic+Clef compilation pipeline, persists the snapshot to D1 `jev_ontologies`, and returns the compiled graph and layer summary.
3. `POST /api/jev/ontology/ground`
   - Body: `{ question: string, scope?: "harness" | "corpus", ontology_id?: string, use_live_ai?: boolean }`
   - Runs entity extraction & normalization, VDB/lexical scoring, ambiguity detection (`gap < 0.25`), 5-step collision resolution (with Clef adjudication when `use_live_ai: true`), 3-level hierarchy expansion, completeness checking (`COMPLETE` vs `INCOMPLETE`), multi-hop path discovery (`findTermLinkPath`), and returns the compressed `evidence_block` + `layered_understanding` object.
4. `GET /api/jev/ontology/path?from=<termA>&to=<termB>&ontology_id=<id>`
   - Returns the ordered multi-hop semantic path (`hops: [{ source, relationship, target }]`) connecting `termA` and `termB`.
5. `GET /api/jev/ontology/selftest`
   - Runs 6 deterministic verification gates (`G1_ordered_commit_and_profiling`, `G2_clairic_span_and_synonym_extract`, `G3_semantic_fk_and_disjoint_prune`, `G4_collision_and_ambiguity_resolver`, `G5_three_level_hierarchy_and_completeness`, `G6_hop_path_and_chat_synthesis`).

### 4.2 Agentic Chat Console Response Upgrade (`jev-agentic-console.js`)
- On every chat turn in `/api/jev/console/chat`, `groundQueryWithOntology(prompt, { scope: "harness" })` runs alongside the funnel planner/executor.
- The returned `layered_understanding` enriches:
  1. **Step Trace & Diagnostics:** Attaches `ontology_grounding` (resolved terms, 3-level hierarchy chain, semantic hop paths, collision/disambiguation notes, completeness status, and epistemic state tags) to the turn record.
  2. **User-Facing `human_response`:** When the operator asks an analytical, architectural, corpus, harness, or multi-concept question (and no strict one-word/one-line output constraint is active), appends or structures a concise **Layered Understanding** synthesis showing:
     - **Grounded Concepts & Hierarchy:** Canonical terms matched + their 3-level parent/child lineage.
     - **Cross-Layer Relationships & Formulas:** Verified hop paths (`Term A -> [RELATION] -> Term B`) and exact governing formulas/thresholds.
     - **Epistemic Status & Completeness:** Explicit separation of `Observed` (live execution data), `Computed` (deterministic math/formulas), `Modeled` (Clairic/Clef/forecast outputs), and `Gated` (Policy v27 requirements), plus any flagged completeness gaps.
