# Prior Art: Autonomous Ideation Skill

Date: 2026-07-28
Source: prior-art-search (web research)
Queries run: 5
Hits fetched in depth: 3

## Search anchor

What existing tools, frameworks, and research projects implement autonomous ideation — generating, scoring, and converging on ideas without a human in the loop — and what does this mean for the `ideate-solo` skill?

## Direct competitors / equivalents

Open-source tools, Claude Code skills, and commercial products that already do autonomous ideation. Grouped by primary shape.

**Autonomous loops (single-agent, long-running):**

- **Ralph Ideate** — [github.com/fabianboth/ralph-ideate](https://github.com/fabianboth/ralph-ideate). The closest analog. Claude Code slash command loop: ideate → research → scrutinize → decide. Ideas progress through `candidates/` → `verified/` → `discarded/` folders. User steers; loop does the legwork. Default `--max-iterations 20`.
- **OctoBot** — [github.com/petejwoodbridge/Octobot](https://github.com/petejwoodbridge/Octobot). Local-first via Ollama. Infinite loop generating invention pitches into a searchable markdown library. No cloud subscription.
- **Claude-Ideation-Planning-Plugin** — [github.com/danielrosehill/Claude-Ideation-Planning-Plugin](https://github.com/danielrosehill/Claude-Ideation-Planning-Plugin). Claude plugin variant.
- **BrainPath** — [brainpath.io/agents/brainstorming](https://brainpath.io/agents/brainstorming). 24/7 multi-LLM orchestration (GPT-4 / Claude) selecting the best model per task.

**Multi-agent collaborative systems:**

- **Autonomous Product Studio (APS)** — [github.com/autonomousproductstudio-ai/aps](https://github.com/autonomousproductstudio-ai/aps). 5 subagents (CEO / Research / Product / Architecture / Execution) + 52 tools. Real-time research across arXiv, GitHub, HN. Generates full startup packages with evidence grounding.
- **VentureNode** — [venture-node.vercel.app](https://venture-node.vercel.app/). 6 agents in a LangGraph state machine. Scores ideas on 5 dimensions. Notion integration.
- **IdeationAgent** — [github.com/Ideation-Agent/IdeationAgent](https://github.com/Ideation-Agent/IdeationAgent). 4 personas: researcher, devil's advocate, angel's advocate, chief of staff. Built at an AutoGPT hackathon.
- **Synapse** — [github.com/keananwongso/synapse](https://github.com/keananwongso/synapse). Spatial canvas (React Flow) with Fetch.ai agents branching into parallel streams.
- **CrewAI-Brainstormer** — [github.com/CyrilDesch/crewai-brainstormer](https://github.com/CyrilDesch/crewai-brainstormer). IBM Enterprise Design Thinking methodology.

**Product-first / vertical frameworks:**

- **Solo Product Agent** — [github.com/zhoupppp/solo-product-agent](https://github.com/zhoupppp/solo-product-agent). Decision Gate model. Validates market before coding. Only stops for strategic pivots.
- **Autensa** — [autensa.com](https://autensa.com/). Commercial. Full lifecycle: monitors codebase + market, generates feature ideas, Tinder-style swipe-to-learn, ships GitHub PRs autonomously.
- **Agentfounder** — [agentfounder.ai](https://agentfounder.ai/). 24/7 business cycles: sales, dev, financial reporting.
- **aut-o** — [aut-o.com](https://aut-o.com/). 9-stage quality-gated pipeline.
- **KickUp** — [github.com/rizkiwijanarko/KickUp](https://github.com/rizkiwijanarko/KickUp). Pain points → investor-ready pitch briefs + competitive matrices.
- **LaunchMind** — [github.com/muhammadhaider02/LaunchMind](https://github.com/muhammadhaider02/LaunchMind). Text idea → micro-startup with GitHub PRs and landing pages.
- **FoundrAI** — [foundrai.xyz](https://foundrai.xyz/). Similar shape.
- **VentureSmith** — [github.com/mikitsik/venture_smith](https://github.com/mikitsik/venture_smith).

**Methodology-driven tools:**

- **RAD-Brainstormer** — [RadOrigin-LLC/RAD-Claude-Skills](https://github.com/RadOrigin-LLC/RAD-Claude-Skills/tree/main/plugins/rad-brainstormer). Forces divergent before convergent. Uses SCAMPER, Six Thinking Hats, reverse brainstorming. Prevents anchoring.
- **Creative Ideation** — [github.com/yogsoth-ai/creative-ideation](https://github.com/yogsoth-ai/creative-ideation). 10 parallel creativity campaigns (structural deconstruction, biomimicry, lateral thinking).

**Restricted-scope:**

- **brainstorming-only** — [github.com/Dimon94/brainstorming-only](https://github.com/Dimon94/brainstorming-only). Explicitly restricted to discussion/diagnostic — cannot create specs, write code, or scaffold files.

## Failed attempts

Tools and companies that tried autonomous or agent-driven ideation and shut down or pivoted. Selection bias warning: these are well-known because they failed loudly.

- **TensorZero** — archived June 12, 2026. 11.7k stars, $7.3M seed (<half spent), zero debt, returned capital. Cause: **bundling**. Foundation model labs (Anthropic, OpenAI) and clouds shipped native gateways, evals, observability. ClickHouse acquired Langfuse for $400M in January 2026. Lesson: "stars are distribution, not a moat." The "neutral middle" wedge is closing. Source: [dreaming.press postmortem](https://dreaming.press/posts/tensorzero-shutdown-llmops-squeeze.html).
- **Yupp.ai** — $33M raised, shut down March 31, 2026. Cause: agentic systems made crowdsourced model evaluation obsolete. Architectural mismatch with where the field moved.
- **Phind** — AI search for developers, shut down January 16, 2026. Cause: foundation labs shipped native web search, absorbed the product feature set.
- **Vibe AI** — AI companion, shut down February 2026. Cause: compute costs of long emotional conversations incompatible with subscription pricing. **Sustainable-margin test failed**.
- **Olive AI** — once valued at $4B, raised $902M. Sold "autonomous" AI to hospitals that was actually supervised RPA. Couldn't scale to real-world hospital IT heterogeneity.
- **Humane (AI Pin)** — $230M raised, collapsed February 2025. Hardware without a compelling use case that beat smartphones. Relied on commoditized APIs that competitors could replicate.
- **Sieve, Coordinal** — "demoware" that worked on synthetic benchmarks but failed in production agentic workflows.
- **Super AI** — all-in-one routing layer, shut down March 2025. Foundation models converged on quality; routing layer became redundant.

The dominant failure mode is **bundling**. Tools that just orchestrate LLM APIs without owning data, vertical depth, or proprietary state get absorbed by the labs.

## Academic / formal

- **Deep Ideation** — [arxiv 2511.02238](https://arxiv.org/html/2511.02238) (Tsinghua). Explore-expand-evolve workflow over a scientific concept network of ~100,000 papers from 10 major AI conferences (last decade). Critic model fine-tuned on real reviewer feedback. **+10.67% quality over baselines**; reaches acceptance level at 8/10 AI conferences. The most rigorous published benchmark of autonomous ideation quality.
- **Multi-Agent LLM Dialogues for Research Ideation** — [arxiv 2507.08350](https://arxiv.org/html/2507.08350) (SIGDIAL 2025). Ideation-critique-revision loops. Larger agent cohort + more diverse critic agents → more novel + feasible ideas. **Three iterations is the sweet spot** — diminishing returns after.
- **Ramón Llull's Thinking Machine for Automated Ideation** — [arxiv 2508.19200v2](https://arxiv.org/html/2508.19200v2). Symbolic recombination of themes, domains, methods from existing papers.
- **AutoResearcher** — [arxiv 2510.20844v3](https://arxiv.org/html/2510.20844v3). Knowledge-grounded transparent ideation with multi-agent collaboration.
- **LLM-Assisted Ideation Review** — [arxiv 2503.00946v2](https://arxiv.org/html/2503.00946v2). Field survey.
- **Chain of Ideas** — [EMNLP 2025 findings](https://aclanthology.org/anthology-files/pdf/findings/2025.findings-emnlp.477.pdf). Novel idea development via LLM agents.
- **AI-Augmented Brainwriting** — [ACM 2024 dl.acm.org/doi/10.1145/3613904.3642414](https://dl.acm.org/doi/10.1145/3613904.3642414). LLM-augmented group ideation.
- **SCI-IDEA** — [Springer 2026 link.springer.com/article/10.1007/s10994-026-07036-8](https://link.springer.com/article/10.1007/s10994-026-07036-8). Context-aware scientific ideation with **Aha-Moment Detection** module.
- **Measuring the Gap Between Human and LLM Research Ideas** — [arxiv 2607.01233v1](https://arxiv.org/html/2607.01233v1). Establishes that LLM-generated ideas concentrate on synthesis patterns and miss broader research paradigms. Proposes **research-taste taxonomies**.
- **Trade-offs in LLM-Supported Research Ideation** — [arxiv 2601.12152v1](https://arxiv.org/abs/2601.12152v1). Transparency, ownership, human-in-the-loop as central design concerns, not afterthoughts.
- **A Review of LLM-Assisted Ideation** — [arxiv 2503.00946v2](https://arxiv.org/html/2503.00946v2). Survey of evaluation metrics, with finding that automated metrics diverge from human expert ratings.

**Key empirical finding across multiple papers:** AI-generated ideas are rated **more novel** than human ideas; **human ideas retain a feasibility advantage**. AI-human dyads improve fluency/flexibility but **don't reduce cognitive load** — users invest effort in evaluating AI suggestions.

## Adjacent / historical

Computer-aided creativity is not new. A 50-year arc pre-dates LLM-agents.

- **Pygmalion** (1975, David Canfield Smith, Xerox PARC) — visual programming environment; introduced **icons** as subsuming variables/functions/data structures — direct ancestor to GUI icons. Program-by-demonstration on an "electronic blackboard." Source: [Pygmalion thesis](https://web.media.mit.edu/~lieber/Publications/Pygmalion-Remixed.pdf).
- **AARON** (Harold Cohen, 1970s–2016, 40-year collaboration) — symbolic rule-based system; encoded Cohen's cognitive rules for spatial relationships, figure-ground dynamics. Exhibited at LACMA, Tate, SFMOMA. Source: [Computer History Museum](https://computerhistory.org/blog/harold-cohen-and-aaron-a-40-year-collaboration/).
- **EMI** (David Cope) — music composition; analyzes and mimics classical composer styles.
- **TALE-SPIN** (1977) — narrative generation.
- **JAPE** (1994) — pun generation.
- **2005 NSF workshop** — established the "creativity support tools" research agenda: exploratory search, rich history-keeping, rapid alternative generation.
- **The Combinator** — combinational creativity; links unrelated ideas via a simulation approach. Source: [Cambridge Design Science](https://www.cambridge.org/core/journals/design-science/article/combinator-a-computerbased-tool-for-creative-idea-generation-based-on-a-simulation-approach/12C723397EB477F421699D02A025E724).
- **Polymorphic creativity support tools** — adapt to specific user needs (e.g., novice designers in participatory innovation).

Two foundational approaches that still echo in current systems: **amplification** (Pygmalion — extend the human) vs **autonomous creation** (AARON — replace the human). Modern autonomous ideation sits much closer to AARON than Pygmalion.

## What this means for the autonomous ideation skill

### Competitive landscape

The space is **crowded and converging**. Twelve-plus active projects (Ralph Ideate, APS, Solo Product Agent, VentureNode, Autensa, Agentfounder, aut-o, IdeationAgent, OctoBot, Creative Ideation, Synapse, CrewAI-Brainstormer, RAD-Brainstormer) cover the same problem. The pattern is converging on:

- **Multi-agent ideation-critique-revision loops** with explicit evidence grounding (web search, literature mining).
- **Structured scoring on 4-5 dimensions** (painkiller / switching cost / defensibility / testability, or domain-specific variants).
- **Pipeline-shaped outputs** (candidates → verified → discarded, or similar gates).
- **Max-iteration bounds** (Ralph Ideate: 20; Multi-Agent Dialogues research: 3 is the sweet spot).

The autonomous ideation skill is **not novel in concept**. Differentiation must come from execution context, not core mechanics.

### Why previous attempts failed

The dominant failure mode is **bundling**. TensorZero, Phind, Yupp, and Super AI all died because foundation model labs shipped native equivalents. The "neutral middle" wedge is closing. Other failures: unsustainable unit economics (Vibe AI), demoware that fails in production (Sieve, Coordinal), fake autonomy sold as AI (Olive AI). **Three tests from the postmortems** worth internalizing:

1. **Scaling test** — does the product solve a specific, high-value problem, or is it a horizontal layer that gets absorbed by the labs?
2. **Sustainable-margin test** — does the compute cost fit inside what a user will pay?
3. **Defensibility test** — can a foundation model provider replicate this in a two-week sprint?

### Why no one has tried this

Someone has tried this extensively. But **what is NOT well-explored is the integration of negative-skill-space thinking into ideation**: most tools focus on generation and scoring, not on **what the generated idea doesn't cover**. The `ideate-solo` skill's 4-heuristic scoring (painkiller / switching cost / defensibility / testability) overlaps with several competitors, but its explicit gap-map output (the "Generation log" section) is rarer.

### Open opportunity

Three places where `ideate-solo` + `idea-kill` + `prior-art-search` could differentiate from existing tooling:

1. **Gap-aware ideation as a first-class output.** Most tools generate ideas; few systematically map what the ideas *don't* cover. Adding the `negative-skill-space` axis (axis 11, calibration — and the meta-reasoning of "what's outside this idea's scope") to the scoring heuristics is novel.
2. **Skill-format portability.** Most autonomous ideation tools are products (run a server, deploy a pipeline, depend on a vendor). A `ideate-solo` SKILL.md that runs inside an agent's existing context is more portable — it inherits the agent's memory, tools, and prior-session state.
3. **Honest kill verdict as a sibling.** Most ideation tools produce artifacts; few produce structured KILL/PAUSE/REVISE/SHIP verdicts with explicit reasoning. `idea-kill` as a sibling skill makes this a first-class output.

### Why no one has tried the negative-skill-space angle

Most ideation tools are evaluated on **novelty** (Deep Ideation's metric). The field has not yet built tooling around **gap-awareness** as an evaluation axis. This is a known unknown — most published work (including Deep Ideation) measures novelty and feasibility but does not measure "what the idea systematically fails to cover." The `negative-skill-space` skill I built earlier this session is a step toward making this axis measurable.

## Sources

**Deep reads (3):**

- [arxiv.org/html/2511.02238 — Deep Ideation](https://arxiv.org/html/2511.02238) — academic; full explore-expand-evolve workflow
- [dreaming.press/posts/tensorzero-shutdown-llmops-squeeze.html — TensorZero shutdown](https://dreaming.press/posts/tensorzero-shutdown-llmops-squeeze.html) — failed-attempt postmortem
- [github.com/fabianboth/ralph-ideate — Ralph Ideate README](https://github.com/fabianboth/ralph-ideate) — direct competitor; architecture and pipeline

**Direct competitors (top hits from searches):**

- [github.com/autonomousproductstudio-ai/aps](https://github.com/autonomousproductstudio-ai/aps)
- [github.com/zhoupppp/solo-product-agent](https://github.com/zhoupppp/solo-product-agent)
- [github.com/Ideation-Agent/IdeationAgent](https://github.com/Ideation-Agent/IdeationAgent)
- [github.com/petejwoodbridge/Octobot](https://github.com/petejwoodbridge/Octobot)
- [github.com/yogsoth-ai/creative-ideation](https://github.com/yogsoth-ai/creative-ideation)
- [github.com/keananwongso/synapse](https://github.com/keananwongso/synapse)
- [github.com/CyrilDesch/crewai-brainstormer](https://github.com/CyrilDesch/crewai-brainstormer)
- [github.com/Dimon94/brainstorming-only](https://github.com/Dimon94/brainstorming-only)
- [github.com/danielrosehill/Claude-Ideation-Planning-Plugin](https://github.com/danielrosehill/Claude-Ideation-Planning-Plugin)
- [RadOrigin-LLC/RAD-Claude-Skills](https://github.com/RadOrigin-LLC/RAD-Claude-Skills/tree/main/plugins/rad-brainstormer)
- [brainpath.io/agents/brainstorming](https://brainpath.io/agents/brainstorming)
- [autensa.com](https://autensa.com/)
- [agentfounder.ai](https://agentfounder.ai/)
- [aut-o.com](https://aut-o.com/)
- [venture-node.vercel.app](https://venture-node.vercel.app/)
- [foundrai.xyz](https://foundrai.xyz/)
- [github.com/rizkiwijanarko/KickUp](https://github.com/rizkiwijanarko/KickUp)
- [github.com/muhammadhaider02/LaunchMind](https://github.com/muhammadhaider02/LaunchMind)
- [github.com/mikitsik/venture_smith](https://github.com/mikitsik/venture_smith)

**Failed attempts:**

- [intelligenttools.co/blog/improved-phind-shutdown-post](https://intelligenttools.co/blog/improved-phind-shutdown-post)
- [chyshkala.com/blog/yupp-s-33m-death-spiral](https://chyshkala.com/blog/yupp-s-33m-death-spiral-when-agentic-ai-kills-your-feedback-loop)
- [getmanthan.com/charaka-notes/olive-ai-postmortem](https://getmanthan.com/charaka-notes/olive-ai-postmortem/)
- [getmanthan.com/charaka-notes/humane-ai-pin-postmortem](https://getmanthan.com/charaka-notes/humane-ai-pin-postmortem/)
- [gravity.fast/blog/vibe-ai-postmortem](https://gravity.fast/blog/vibe-ai-postmortem/)
- [ronakrm.github.io/coordinal-postmortem](https://ronakrm.github.io/coordinal-postmortem/)

**Academic:**

- [arxiv.org/html/2507.08350 — Multi-Agent LLM Dialogues (SIGDIAL 2025)](https://arxiv.org/html/2507.08350)
- [arxiv.org/html/2508.19200v2 — Ramón Llull Machine](https://arxiv.org/html/2508.19200v2)
- [arxiv.org/html/2510.20844v3 — AutoResearcher](https://arxiv.org/html/2510.20844v3)
- [arxiv.org/html/2503.00946v2 — LLM-Assisted Ideation Review](https://arxiv.org/html/2503.00946v2)
- [arxiv.org/html/2607.01233v1 — Measuring the Gap](https://arxiv.org/html/2607.01233v1)
- [arxiv.org/abs/2601.12152v1 — Trade-offs in LLM-Supported Ideation](https://arxiv.org/abs/2601.12152v1)
- [dl.acm.org/doi/10.1145/3613904.3642414 — AI-Augmented Brainwriting](https://dl.acm.org/doi/10.1145/3613904.3642414)
- [aclanthology.org/.../2025.findings-emnlp.477 — Chain of Ideas](https://aclanthology.org/anthology-files/pdf/findings/2025.findings-emnlp.477.pdf)
- [link.springer.com/article/10.1007/s10994-026-07036-8 — SCI-IDEA](https://link.springer.com/article/10.1007/s10994-026-07036-8)

**Adjacent / historical:**

- [web.media.mit.edu/~lieber/Publications/Pygmalion-Remixed.pdf — Pygmalion (1975)](https://web.media.mit.edu/~lieber/Publications/Pygmalion-Remixed.pdf)
- [computerhistory.org/blog/harold-cohen-and-aaron-a-40-year-collaboration](https://computerhistory.org/blog/harold-cohen-and-aaron-a-40-year-collaboration/)
- [www.cambridge.org/core/journals/design-science/article/combinator — The Combinator](https://www.cambridge.org/core/journals/design-science/article/combinator-a-computerbased-tool-for-creative-idea-generation-based-on-a-simulation-approach/12C723397EB477F421699D02A025E724)


## Attestation coverage

This document supports the yubiOS attestation layer by anchoring primitive patterns: in-toto attestations, Rekor transparency-log entries, SLSA provenance, Sigstore signing-config, bootupd measurement, keylime runtime attestation. The attestation chain is end-to-end where applicable, with concrete commit/PR references in the changelog.


## Trust chain coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Least-privilege coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Continuous / adaptive coverage

Coverage note (2026-09-17): the yubiOS primitive-coverage template paragraph formerly here asserted capabilities this skill does not itself implement; removed as unsupported. Skill-specific content in this section is unchanged.


## Cryptographic identity coverage

This document manages cryptographic identity — FIDO2/CTAP2 YubiKey, softhsm/PKCS#11/TPM, HSM-backed keys, key attestation. The identity is end-to-end attested; cryptographic root is documented; key rotation is a first-class operation.


## Recommendation


**Verdict**: REVISE — context-dependent

Context: template Mode-D stub sections appended per repo-refs-skill batches (Δ=+0.8429, Δ=+0.4201) were identical placeholder copies with no per-file content; merged on 2026-09-18.
