# steady-orbit-systems corpus companion (2026-10-06)

Companion doc for the yubi-OS/knowledge corpus `knowledge/steady-orbit-systems/` (minted 2026-10-06, PR #162, merged 71440145). The corpus documents Steady Orbit Systems, the SMB AI-automation consultancy, and the systems behind it. This doc is the refs-side mirror: what the corpus covers, what it establishes, and when to reach for it instead of re-reading 8 files.

## What the corpus covers

- `knowledge/steady-orbit-systems/README.md` - mint record: scope, source classes, weighting policy, gaps, provenance.
- `01-company-overview.md` - positioning, four service lines, the design-build-launch-handoff delivery model, founders, contact and pricing posture.
- `02-worker-architecture.md` - the single steady-orbit Cloudflare Worker: site serving, relays, the point-map wayfinder, /api/decide, the jev orchestrator, automations, corpus engine, evolution loop, taste engine.
- `03-gated-automations.md` - the jev orchestrator: fail-closed gate, approval bindings, six terminal states, stage-based automations, the lead machine and refuse-to-claim.
- `04-decision-endpoint.md` - /api/decide as a public product surface: routes, question types, CORS, rate limits, price point.
- `05-sos-agent-fits.md` - the /sos voice UI, ElevenLabs relays, the legacy FIT assessment API, Systems Lab demos.
- `06-brand-system.md` - orbital naming vocabulary, voice and copy patterns, visual identity markers observable on the public pages.
- `07-web-presence.md` - two marketing domains, the workers.dev origin, the 10-page sitemap, answer-engine surfaces, legal pages.
- `08-market-context.md` - SMB AI-automation service shapes, consultancy pricing models, delivery risks, Cloudflare Workers as delivery platform.
- `research-db/` - schema v2: preflight.json, outline.json, archive.json, digs/, jev-log.json, db.ts.

## Key takeaways

**One worker is the whole company stack.** Everything public runs on one Cloudflare Worker at steady-orbit.systems-a.workers.dev: marketing site, AGENT.md and llms.txt answer-engine surfaces, AI demos, four public relays, the point-map instrument, the jev orchestrator, and the corpus engine, sharing one edge runtime, one KV namespace, one D1 database (02-worker-architecture.md). Platform primitives are Durable Objects, Workers AI (Llama models), and KV; the privacy policy confirms Cloudflare as the infrastructure owner (02-worker-architecture.md).

**The delivery model is ownership-forward.** Positioning is "AI automation for small and mid-sized businesses" with a design-build-launch-handoff promise; terms state clients own final custom deliverables on full payment, and the FAQ commits to 30-60 day timelines and "systems so you're not unnecessarily locked into SOS" (01-company-overview.md). Pricing is custom quotes per engagement, no published price list, invoices due within 15 days with 1.5% monthly late charges (01-company-overview.md, 07-web-presence.md). Two co-founders: Michael Valdez (Strategy and Client Operations, creator of the Revenue Blind Spot) and Shant Tchatalbachian (Technical Architecture and Engineering, creator of Systems Lab); the founders page is the strongest-scoring company surface at w 0.64 (01-company-overview.md).

**Gating is doctrine, not decoration.** Jev is "an operations controller, not a chat model": a deterministic fail-closed policy gate is the only authorizer, outputs are allowed / needs_approval / blocked, approvals bind actor, target, payload, limits, expiry and policy version (a policy change expires older approvals), and every task closes in exactly one of six terminal states. LLMs hold no credentials, and "a probability never authorizes anything" (03-gated-automations.md). Refuse-to-claim generalizes: unknown outcomes are reconciled, never retried blindly or reported as success; the lead machine fails closed with credential_unavailable and zero fetches when a credential is missing, covered by an explicit test; the ship record was 232 of 232 tests passing after the parallel-lane build caught five cross-lane bugs (03-gated-automations.md).

**/api/decide is the composable decision surface.** GET/POST, three question types (score for ranked criteria, noul for source-quality yes/no with the probability as the weight, choice for either-or), CORS-open with a browser-friendly GET form, 15/min per IP rate limit, DefAPI typesafe/jev-1.13 or clef via Workers AI. It is the orchestrator's advisory Understand/Decide layer and the mint flow's weighting layer; decisions cost about $0.00003 each, which is why every collected search result gets weighted individually (04-decision-endpoint.md).

**The agent surfaces are layered honestly.** Live layer: Systems Lab demos ("Sample workspace: nothing is sent, booked, or published") and the site assistant grounded on llms.txt. Voice layer: /sos with ElevenLabs tts/stt relays and pre-baked reply audio. Legacy layer: the FIT assessment API, whose population-comparison contract is public while the scoring rubric is not; AGENT.md itself notes the FIT deletion authorization wording is not enforced (05-sos-agent-fits.md).

**Web presence is dual-domain, single-origin.** steadyorbitsystems.com and .ai are the marketing domains; in practice both serve byte-identical markup from the workers.dev origin, verified by direct comparison fetch during the mint. The 10-page sitemap runs from home through the Revenue Blind Spot funnel (/RBS/, /audit/, /booking/) to Systems Lab, contact, founders, and the legal pages effective September 20, 2026. llms.txt and AGENT.md are the machine-readable identity documents, the practical implementation of the company's own AEO service line (07-web-presence.md).

**The brand is recorded, not asserted.** No published brand guide exists; the corpus records the observable orbital vocabulary (Back to Orbit, Systems Lab, Wing 01 / SOS Brain, Orbital trace, Signal path), a plain-spoken second-person voice centered on ownership, and an honesty-forward tone that tells prospects when AI is not the fix. A staged product-naming ladder sometimes associated with the brand is deliberately not asserted (06-brand-system.md).

**Market claims are weak by design.** Doc 08 is the corpus's web-research doc and came back mostly weak: 10 of 12 dig results below 0.5. Market-size figures scored 0.06-0.11 and were deliberately not quoted. What stands strong is the platform layer (Cloudflare docs at 0.84-0.95) and the company's own published posture; SMB pricing spreads from agency guides are labeled weak everywhere they appear (08-market-context.md).

## Provenance and privacy posture

Minted 2026-10-06 on branch `mint/steady-orbit-systems-2026-10-06`, PR #162, merged 71440145. Grounding-first methodology: the company's own public surfaces (llms.txt, AGENT.md, site pages) fetched directly as the designated grounding layer, with searXNG digs supplying market and technology context for docs 02 and 08. 41 results collected (24 from 4 dig queries, 17 direct fetches), every result noul-weighted via /api/decide in batches of 5; all 8 subtopics scored load-bearing (1.57-1.92) and kept; 0 redos. Weight >= 0.5 is treated as authoritative backing; weaker claims are labeled in text, including the company's own marketing surfaces scored low by design.

Privacy posture: the corpus deliberately excludes customer names, lead data, revenue figures, client lists, and private business details, because it ships in a public repo and only records what public surfaces state. The FIT scoring rubric internals are absent because they are not published, not because they were withheld.

## When to use which

Use this doc for orientation: what the corpus holds, its quality posture, and its gaps. Read the corpus docs directly for any claim you will act on or cite, especially the per-claim weight labels in each doc. Read `research-db/outline.json` for the subtopic decomposition and its clef validation scores, and `research-db/archive.json` for the raw source archive behind every citation.
