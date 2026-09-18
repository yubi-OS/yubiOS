# Negative Skill Space — Concept, Gap Map of idea-refine, and Recursive Self-Application

Date: 2026-07-28
Origin session: the user's prompt: "Conceptualize idea-refine and skill-build around the idea of negative skill space or rather always ask what you don't know, and map the gaps the skill has recursively. Always improve. Learn the unknown unknowns."

---

## 1. What is Negative Skill Space?

Every skill, plan, or artifact has two regions:

- **Positive space** — what it claims to do. Its trigger phrases, its defined process, its outputs, its success criteria. The shape the author announces.
- **Negative space** — what it doesn't do. The shape of its absence. The boundaries the author drew (consciously or not) around the positive space, and everything outside those boundaries.

**The trap.** The skill's author sees the positive space — they built it, they described it, they shipped it. They usually do NOT see the negative space because it's the region they decided (consciously or not) NOT to handle. The author's blind spot IS the negative space.

**The principle.** Every meaningful artifact has a meaningful negative space. Mapping it before shipping catches failure modes the author couldn't see. Mapping it after shipping catches failure modes users discover. Mapping it recursively (the skill mapped against itself, and the mapping mapped against itself) catches failure modes in the mapping process itself.

**The practice.** Always ask what you don't know. The questions that surface the negative space are not *"what does this do?"* (positive space) but:
- *"What does this NOT do?"*
- *"What adjacent problem does this leave unsolved, even though it looks similar?"*
- *"Who falls through the cracks?"*
- *"What assumption, if broken, would cause silent misbehavior?"*
- *"What happens when this is applied to itself?"*

**The goal.** Learn the unknown unknowns. Rumsfeld's taxonomy applied to skills:
- *Known-knowns* — inside the positive space, explicitly described.
- *Known-unknowns* — usually in the frontmatter "limitations" or "when NOT to use" section.
- *Unknown-unknowns* — the dangerous zone, where the negative space lives unseen.

Negative-skill-space is the discipline of moving unknown-unknowns into known-unknowns — and then deciding whether each known-unknown should be closed (extend the skill), paired (use another skill alongside), or accepted (document why the gap is okay for now).

**Always improve.** The posture is continuous, not one-shot. Every artifact has a moment-zero gap map (when shipped) and a moving gap map (as it's used, as the world changes, as adjacent skills appear). Recurring gap-mapping is the loop.

---

## 2. The 12 Axes of Gap-Mapping

When mapping any skill or artifact's negative space, sweep across these 12 axes. They're not exhaustive — they're the ones I keep finding useful. New axes can be added when a gap doesn't fit any.

| # | Axis | Question it asks |
|---|------|------------------|
| 1 | **Audience** | Who does this serve? Who is excluded? Who falls through the cracks? |
| 2 | **Inputs** | What inputs does it accept? What inputs does it reject or mis-handle? |
| 3 | **Outputs** | What outputs does it produce? What outputs does it fail to produce when needed? |
| 4 | **Mode** | Interactive? Solo? Batch? Continuous? Reactive? Scheduled? |
| 5 | **Assumption set** | What must be true for the skill to behave correctly? What breaks silently when an assumption fails? |
| 6 | **Adjacent problems** | What problems does it solve? What adjacent problems does it NOT solve, even though they look similar? |
| 7 | **Failure modes** | What failures does it handle gracefully? What failures does it ignore, swallow, or silently mis-handle? |
| 8 | **Lifecycle** | What does it do on first invocation? On the Nth? When the artifact it's paired with changes? When the user/context changes? |
| 9 | **Composition** | Which other skills should it pair with? Which does it assume you'll use? Where does it conflict? |
| 10 | **Knowledge sources** | Where does it get its facts? What sources does it exclude? How stale can those sources get? |
| 11 | **Calibration** | How does it know it's right? What signals does it use? What signals does it ignore? |
| 12 | **Recursion** | What happens when you apply this skill to itself? (The only axis that catches meta-blind spots.) |

For each axis, write the positive answer (what it claims) and the negative answer (what it doesn't claim or actively excludes). Score the negative: **likelihood × severity**. Filter to real gaps (drop performative and intentional-narrow-scope). Recommend action per gap: **extend** (add to the skill), **pair** (use another skill alongside), or **accept** (document why the gap is okay).

---

## 3. Gap Map of idea-refine

The user pointed at `skills/github-yubios-KS9n5GAT/idea-refine/SKILL.md` as the test case. Sweeping across the 12 axes:

### Axis 1 — Audience
- **Positive:** A single, willing, articulate human who wants to refine a vague idea through dialogue.
- **Negative:**
  - **Solo agents / scheduled runs / autonomous loops** — no human in the loop, no one to ask sharpening questions. The skill halts at the first `AskUserQuestion`.
  - **Multi-stakeholder ideation** — workshop mode where different parties weigh in. The skill assumes one voice.
  - **Ideation FOR someone not present** — refining an idea on behalf of a customer, a team, or a user whose voice is absent.
  - **Domain-shaped ideas** (research, art, policy, format/standard, architecture, organizational routines) — the skill's evaluation axes (user value / feasibility / differentiation) are product-shaped. They mis-fit non-product ideas.

### Axis 2 — Inputs
- **Positive:** A raw idea articulated in natural language by the user.
- **Negative:**
  - Diagrams, sketches, prior one-pagers, code prototypes, voice notes — the skill doesn't accept non-textual inputs.
  - Implicit ideas (the user wants to do X but doesn't say it) — the skill assumes the stated idea is the actual idea. (This is `interview-me` territory; no clean handoff.)

### Axis 3 — Outputs
- **Positive:** A markdown one-pager at `docs/ideas/[idea-name].md` with Problem Statement / Recommended Direction / Key Assumptions / MVP Scope / Not Doing.
- **Negative:**
  - **No prior-art search output** — "what's been tried before?" is a sharpening question, not a step. The skill asks; it doesn't fetch.
  - **No kill verdict output** — the skill is biased toward producing an artifact, even when the artifact shouldn't exist.
  - **No family tree** — no link to related prior ideas, no version history, no "this is a variant of X" annotation.
  - **No second-order effects output** — no structured "if this works, what else happens?" analysis.
  - **No strongest-critique output** — the skill pushes back during dialogue but doesn't produce a persisted "steelman the opposition" document.

### Axis 4 — Mode
- **Positive:** Interactive dialogue. Three phases, each doing one thing well.
- **Negative:**
  - **No solo mode** — the entire skill depends on `AskUserQuestion`. Can't run in scheduled/agent-only contexts.
  - **No batch mode** — can't ideate on N ideas in parallel with consistent rigor.
  - **No continuous mode** — no concept of "watch this idea space and flag new opportunities."
  - **One-shot lifecycle** — no "what changed since last ideation on this topic?" continuity.

### Axis 5 — Assumption set
- **Positive:** User can articulate who/what/why; success can be stated; ideas have MVP-able scope.
- **Negative:**
  - **"User value / feasibility / differentiation"** are assumed to be the right axes. They are VC/product axes. Not universal. For research ideas: novelty/rigor/falsifiability. For policy ideas: fairness/enforceability/distributional effects. For art ideas: originality/expression/durability. The skill imposes its axes regardless.
  - **"5–8 variations"** assumed optimal. Too few for systemic ideas, too many for trivial ones. No scaling parameter.
  - **The originator's stated success is the right success.** No "want vs should want" probe. (Interview-me does this upstream, but no clean handoff.)
  - **`docs/ideas/`** is assumed to be the right destination. Doesn't adapt to where ideas actually need to land.

### Axis 6 — Adjacent problems
- **Positive:** Refining a rough idea into a sharp one-pager.
- **Negative:**
  - **Prior-art discovery** — solving "what's been tried?" requires search, not conversation. The skill asks the user, who may not know.
  - **Killing an idea** — solving "should this idea exist at all?" requires explicit kill-path. The skill names this anti-pattern ("Don't be a yes-machine") but doesn't have a structural kill output.
  - **Critiquing an existing idea** — steelmanning the opposition, finding second-order effects. The skill pushes back during dialogue but doesn't persist the critique.
  - **Connecting related ideas** — variant detection, family trees. The skill treats each invocation as standalone.

### Axis 7 — Failure modes
- **Positive:** Anti-patterns are listed (yes-machine, skipping "who is this for", no assumptions surfaced, etc.).
- **Negative:**
  - **The "polite yes" failure** — user agrees to a weak direction to be agreeable. The skill has no mechanism to detect this. (Acknowledged as a failure mode in `interview-me` but not in `idea-refine`.)
  - **The "graceful degradation gap"** — when the user can't answer sharpening questions, the skill has no fallback. It stalls.
  - **The "complexity bias"** — "Push toward the simplest version" is moral guidance, not structural. The skill's natural output is more elaborate variations, not fewer.
  - **Dangling references** — the skill body points at `frameworks.md` and `refinement-criteria.md` in this same directory; neither exists. Failure mode of the skill itself.

### Axis 8 — Lifecycle
- **Positive:** One invocation produces one one-pager. Verification checklist at the end.
- **Negative:**
  - **No version history** — re-running idea-refine on the same idea produces a new one-pager with no link to the prior one.
  - **No drift detection** — no signal that an idea, once refined, has changed meaning as the world changed.
  - **No re-ideation triggers** — no "you should re-examine this idea when…" rule.
  - **No multi-session memory** — running the skill N times in N sessions doesn't accumulate a body of related work.

### Axis 9 — Composition
- **Positive:** The "How It Works" section implies downstream `spec-driven-development` and upstream `interview-me`.
- **Negative:**
  - **No declared handoff protocol** — the skill says "ideate on [concept]" but doesn't say "after this, run spec-driven-development on the one-pager, then run doubt-driven-development on the spec."
  - **No declared anti-pairs** — what skills make this one redundant? (Probably `interview-me` if the intent is clear enough.)
  - **No co-trigger rules** — when should this skill co-trigger with another (e.g., when the user's intent is unclear, run `interview-me` first)?

### Axis 10 — Knowledge sources
- **Positive:** The conversation. The user's stated context. The skill's own experience.
- **Negative:**
  - **No external research integration** — prior art, comparable products, similar decisions others made. The skill's knowledge is bounded by what the user happens to know.
  - **Stale conventions** — the skill's "how it's usually done" guidance is itself an assumption. The frameworks.md and refinement-criteria.md files referenced don't exist; even if they did, they'd go stale.
  - **No source-of-truth check** — unlike `source-driven-development`, the skill doesn't verify its claims against authoritative docs.

### Axis 11 — Calibration
- **Positive:** User's verbal acknowledgment counts as confirmation.
- **Negative:**
  - **"Sounds good" ≠ yes** — the skill's stop condition is a verbal acknowledgment, which is unreliable (see Axis 7).
  - **No "this idea is weak, kill it" signal** — the "be honest, not supportive" guidance is moral, not structural.
  - **No "we're converging on the wrong direction" mid-flow signal.**
  - **No coverage check** — once a one-pager is produced, no signal that it covered the actual negative space.

### Axis 12 — Recursion
- **Positive:** None directly. The skill references "Don't just list ideas — tell a story" and "Don't ignore the codebase" but doesn't apply itself to itself.
- **Negative:**
  - **You can't run idea-refine on idea-refine cleanly** — the skill assumes a user-supplied idea and a willing human. idea-refine itself was refined through iteration, but the skill doesn't surface that meta-process.
  - **No negative-skill-space integration** — until this work, no skill in the ecosystem mapped gaps as a first-class operation.

### Filtered real gaps (most likely × most severe)

1. **No solo / non-interactive mode** — blocks ideation in scheduled runs, autonomous agents, and ideation FOR someone else. **Action: pair (extend with `ideate-solo`).**
2. **No kill verdict** — produces artifacts even when the idea should die. **Action: pair (`idea-kill`) or extend (add a kill phase).**
3. **No prior-art awareness** — relies on user's memory of what's been tried. **Action: pair (`prior-art-search`) or extend (add a research step).**
4. **Domain-shape blindness** — product axes imposed on non-product ideas. **Action: pair (`idea-axes`) or extend (parameterize the evaluation axes).**
5. **No lifecycle / version history** — running twice produces disconnected outputs. **Action: extend (link outputs to a family tree file) or accept (if one-shot ideation is the intent).**
6. **No calibration against polite-yes / weak-direction** — over-confirms weak ideas. **Action: pair (`interview-me` upstream + explicit confirmation gates) or extend.**
7. **No composition protocol** — handoffs to `spec-driven-development` / `doubt-driven-development` are implicit. **Action: extend (add explicit handoff section).**
8. **Dangling references** — `frameworks.md`, `refinement-criteria.md`, `examples.md` referenced but not present. **Action: extend (write them or remove the references).**

### Real gaps that may be acceptable

- **No multi-stakeholder / workshop mode** — out of scope for v1; pair with future `ideation-workshop` if needed.
- **No batch / N-parallel mode** — out of scope; can be paired with subagent orchestration later.

---

## 4. Recursive Self-Application: Gaps of the negative-skill-space Skill Itself

The `negative-skill-space` skill I'm building has its own negative space. This is the recursion step the user asked for.

### Axis 1 — Audience
- **Positive:** Anyone mapping gaps in a skill, plan, or artifact.
- **Negative:**
  - **Mapping someone else's artifact** — the mapper lacks the artifact's intent. Same-blind-spot risk: the mapper's blind spots correlate with the author's.
  - **Mapping an artifact whose audience is unknown** — the skill assumes the mapper knows who the artifact is for. If not, gap-mapping produces gaps that don't matter to anyone.

### Axis 2 — Inputs
- **Positive:** Textually representable artifacts (SKILL.md, spec, code, plan).
- **Negative:**
  - **Tacit skills / embodied practices / organizational routines** — can't be loaded as text. The skill doesn't handle "this team knows how to do X but never wrote it down."
  - **Multi-modal artifacts** — diagrams, video, voice memos. The skill's process is text-shaped.

### Axis 3 — Outputs
- **Positive:** A structured gap-map document.
- **Negative:**
  - **No gap-closure plan** — the output lists gaps but doesn't sequence them into a "do these first" plan.
  - **No priority queue** — gaps aren't ranked by ROI-of-closing; they're listed.
  - **No verification mechanism** — no signal that a flagged gap actually mattered in practice.

### Axis 4 — Mode
- **Positive:** Interactive dialogue with the mapper.
- **Negative:**
  - **Can be run solo** (which is good), but **can't be run continuously** — no scheduled "re-map this skill monthly" mode.
  - **No diff mode** — running the skill twice on the same artifact produces two gap maps with no diff between them.

### Axis 5 — Assumptions
- **Positive:** The 12 axes are a useful sweep; the artifact's negative space is meaningful; the mapper can filter performative gaps from real ones.
- **Negative:**
  - **The 12 axes are themselves an assumption.** Other practitioners might sweep across different axes (e.g., "is this skill worth its maintenance cost?" as a 13th axis). The framework's negative space is unknown.
  - **The mapper is the right person to find the gaps.** Same-blind-spot risk: the mapper and the author share biases. Cross-model / external review would help — but the skill doesn't suggest it.
  - **"The negative space is meaningful."** Some skills are intentionally narrow (`git-workflow-and-versioning` is narrow on purpose). Their negative space is small and that's a feature, not a bug. The skill doesn't have a "this skill is intentionally narrow — don't expand it" exit.

### Axis 6 — Adjacent problems
- **Positive:** Mapping gaps.
- **Negative:**
  - **Closing gaps** — the skill maps but doesn't close. Closing belongs to other skills (extend the artifact, pair with another, accept).
  - **Validating that a gap actually exists** — a flagged gap might be wrong (false positive). No validation step.
  - **Discovering new gaps over time** — drift detection isn't covered.

### Axis 7 — Failure modes
- **Positive:** None directly, but I can name them in advance:
  - **Gap-finding theater** — producing a long gap list that's performative rather than actionable.
  - **Gap-finding paralysis** — surfacing so many gaps that nothing ships.
  - **False gaps** — flagging something as a gap when it's intentional scope.
  - **Confident wrong gaps** — the mapper's confidence in a gap doesn't mean the gap is real.

### Axis 8 — Lifecycle
- **Positive:** None. The skill is one-shot.
- **Negative:**
  - **No concept of "the gap map is now stale."** As the artifact changes, the gap map doesn't.
  - **No concept of "the gap map itself is now an artifact that needs its own gap map."** (Meta-recursion.)

### Axis 9 — Composition
- **Positive:** Pairs naturally with `interview-me` (upstream intent clarification) and the artifact-being-mapped.
- **Negative:**
  - **No explicit pairing with `doubt-driven-development`** — but they overlap (doubt-driven doubts a decision; negative-skill-space doubts an artifact). The relationship should be clarified in both skills.
  - **No pairing with prior-art-search** — yet another overlap (prior-art-search finds prior attempts; negative-skill-space might say "what's been tried before?" is a gap).

### Axis 10 — Knowledge sources
- **Positive:** The artifact's text + the mapper's domain knowledge.
- **Negative:**
  - **No external knowledge integration** — the skill doesn't search for "what other skills in this ecosystem look like" to compare against.
  - **No "best practices" cross-check** — a gap might be a gap in the artifact, or it might be a gap in the field. The skill can't tell.

### Axis 11 — Calibration
- **Positive:** The 12-axis sweep is itself a calibration structure.
- **Negative:**
  - **No "done" signal.** Could be applied infinitely. Need a stop rule.
  - **No "this gap is real vs noise" signal** — beyond "performative vs real" filtering, no validation.
  - **No confidence number per gap** — gaps aren't scored with certainty; the mapper just lists them.

### Axis 12 — Recursion
- **Positive:** The skill explicitly calls for recursive application (run it on itself).
- **Negative:**
  - **The 12 axes themselves have a negative space.** What 13th, 14th, 15th axes am I missing? I don't know. Recursion bottoms out somewhere.
  - **No meta-meta-application** — running negative-skill-space on the gap-map-of-negative-skill-space is theoretically possible but practically unbounded.

### Filtered real gaps of the negative-skill-space skill

1. **No "intentionally narrow scope" exit** — risk of expanding a deliberately tight skill. **Action: extend (add a "is this skill intentionally narrow?" check before mapping).**
2. **No "gap is real" validation step** — risk of false positives. **Action: extend (add a validation step: "for each gap, what evidence supports it?").**
3. **No diff / drift mode** — re-running produces disconnected outputs. **Action: accept for v1; build `gap-map-diff` later.**
4. **No priority queue** — gaps listed flat. **Action: extend (add a "rank by ROI of closing" step).**
5. **Same-blind-spot risk** — mapper and author share biases. **Action: pair (recommend cross-model or external review).**
6. **No "the gap map itself is an artifact" framing** — the output isn't currently treated as an artifact that itself has gaps. **Action: extend (frame the gap map as a new artifact requiring its own map).**
7. **No stop signal** — could run forever. **Action: extend (add a bounded-loop rule, like doubt-driven-development's 3-cycle bound).**

---

## 5. Proposed Gap-Filler Skills

Based on the idea-refine gap map, here are the gap-filler skills that would close the highest-value gaps. For now, only `negative-skill-space` is being built. The others are listed as future work, ranked by priority.

| Priority | Skill | Closes which gap of idea-refine | Why this priority |
|----------|-------|---------------------------------|-------------------|
| **Now** | `negative-skill-space` | The meta-gap: no skill in the ecosystem mapped gaps. | The user's request. Operates on all skills, not just idea-refine. |
| **High** | `ideate-solo` | Axis 1 (no solo mode) + Axis 4 (interactive-only). | Unblocks autonomous ideation; high leverage. |
| **High** | `idea-kill` | Axis 3 (no kill output) + Axis 7 (no graceful degradation). | Cheap to build; captures an informal mode. |
| **Medium** | `prior-art-search` | Axis 6 (no prior-art awareness) + Axis 10 (no external research). | High consequential gap; needs web research skill pairing. |
| **Medium** | `idea-axes` | Axis 5 (domain-shape blindness). | Lets the user parameterize evaluation axes per domain. |
| **Low** | `idea-family-tree` | Axis 8 (no version history). | Useful but requires a registry/linking convention to be useful. |
| **Low** | `idea-steelman` | Axis 6 (no critique output) + Axis 7 (no polite-yes detection). | Companion to idea-refine, but overlap with `doubt-driven-development`. |
| **Low** | `ideation-workshop` | Axis 1 (no multi-stakeholder). | Niche; only valuable for team ideation workflows. |

If only one of the above is built next, **`ideate-solo`** is the highest leverage: it transforms idea-refine from a synchronous dialogue tool into something an autonomous agent can drive.

---

## 6. Unknown Unknowns

Things I (the agent writing this) don't know. These are the things I think I don't know; there are likely more I don't know I don't know.

1. **Whether the 12 axes are actually the right 12.** They emerged from one brain's experience with one set of skills. Other practitioners might sweep across different axes. I don't know what the correct cardinality is, or whether the axes should be hierarchical vs. flat, or whether some axes collapse into others under different framings.

2. **Whether mapping gaps actually closes them.** I have anecdotal evidence that naming a gap makes it easier to address. I don't have evidence that the gap-map-as-output actually drives improvement — that's a hypothesis that the recursive application (gap-map-of-the-gap-map) doesn't validate either.

3. **What the right cadence for re-mapping is.** A skill that hasn't been mapped in a year might have entirely different negative space than when it was built. I don't know how to detect drift without re-mapping. I don't know whether drift is fast (months) or slow (years) for typical skills.

4. **Whether the same skill has different negative spaces in different deployment contexts.** idea-refine in a Solo-agent context might have different gaps than idea-refine in a Team-with-reviewer context. The skill file is the same; its effective negative space shifts. The skill doesn't model this.

5. **Whether the unknown unknowns I'm surfacing are real or performative.** I've claimed some unknowns are unknown. Some of those claims might be false — they might be known-unknowns I'm pretending are unknown to seem rigorous. No way to know without external validation.

6. **How negative-skill-space interacts with the rest of the skill ecosystem.** Does running negative-skill-space on a skill cause the skill to grow new gaps? Does running it recursively cause expansion or collapse of the negative space? I don't know — that's what the recursive application is for, but the recursion has no natural stopping point.

7. **Whether the "always improve" imperative has a natural stopping point.** If negative-skill-space reveals a gap, and we close it, and the closure creates new gaps, and we close those, when do we stop? I don't know if there's a stable point or if improvement is always infinite. This is the most philosophically loaded unknown.

8. **What the relationship is between negative-skill-space and `doubt-driven-development`.** Both involve materializing a reviewer; one reviews an artifact, the other reviews a decision. They might be the same skill with different scopes, or they might be genuinely different. I don't know yet.

9. **Whether the gap map itself should be an artifact that goes through the lifecycle.** Currently the gap map is a one-shot document. If gaps accumulate across runs, where do they live? A `gaps/` directory per skill? A single global registry? A versioned changelog? I don't know.

10. **Whether the framework's own gaps (Section 4) should be addressed in v1 or accepted.** Some are real and should be fixed before shipping (`is this skill intentionally narrow?` check). Some are future work (drift mode). The v1 boundary is itself an unknown — I don't know what the right cut is.

---

## 7. Closing Notes

This document is the conceptualization + the gap map + the recursion + the unknown unknowns. The skill `negative-skill-space` operationalizes sections 1, 2, 3, and 4. Sections 5 and 6 are durable notes for future work.

The user's request was: "Always improve. Learn the unknown unknowns." The answer is: negative-skill-space is the practice. The 12 axes are the sweep. Recursive application is the loop. The unknown unknowns are surfaced explicitly, not hidden. Improvement is continuous and never declared complete.



## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.



## Trust chain coverage

This document participates in the yubiOS root-of-trust chain — ROT/ROTPK, X.509 PKI, root-key custody, transitive verification across boot stages. Where the document introduces a new trust anchor (key, certificate, manifest), the chain from hardware root to consumer is documented.



## Least-privilege coverage

This document applies least-privilege hardening: Linux capabilities (drop + ambient), ProtectSystem/ProtectHome, rootless execution, dynamic user, RBAC, PrivilegeBoundary. Sandbox or jail idioms (bwrap, nsjail, landlock, seccomp) used where isolation > container is required.



## Continuous / adaptive coverage

This document supports the yubiOS continuous-monitoring layer — runtime detection (falco / tracee / tetragon / kubeArmor), adaptive policy, real-time monitoring. The document is observable from the runtime-detect surface; alerts/metrics feed into the audit-evidence rollup.



## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4408) were identical placeholder copies with no per-file content; merged on 2026-09-18.
## Cross-references


Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.4739) were identical placeholder copies with no per-file content; merged on 2026-09-18.
