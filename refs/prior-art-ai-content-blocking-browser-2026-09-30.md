# Prior Art: AI content blocking browser

Date: 2026-09-30
Source: prior-art-search (web research)
Queries run: 5
Hits fetched in depth: 2 (a third — the Mozilla Deep Fake Detector post-mortem — was unreachable: host dead)

## Search anchor

Has anyone built a browser (or browser-layer content gate) that refuses to render pages containing AI-generated content, and what did their attempts teach us — especially relative to yubi-OS's provenance-gated Chromium (OMN-165, patches 0001–0016)?

## Direct competitors / equivalents

- **DuckDuckGo "Hide AI-generated images"** (shipped July 2025) — first browser to ship an AI-image filter, at the *search-results* layer. Works by URL-pattern matching against the open-source uBlock Origin / uBlacklist Huge AI Blocklist, not by detection. Also `noai.duckduckgo.com` as a dedicated AI-free search surface. [https://duckduckgo.com/duckduckgo-help-pages/results/how-to-filter-out-ai-images-in-duckduckgo-search-results](https://duckduckgo.com/duckduckgo-help-pages/results/how-to-filter-out-ai-images-in-duckduckgo-search-results)
  - Key observation: DuckDuckGo explicitly declines to run classifiers per-image at scale — accuracy (80–90% at best), latency, and cost across hundreds of millions of images a day killed it. Blocklist-first, classifiers "exploring later." This is the closest shipping analog, and it validates both the blocklist approach's viability and its ceiling.
- **AI Content Shield** (Chrome + Firefox) — hides Google AI Overviews, AI search summaries, and AI content on YouTube/TikTok/X/Reddit. Local processing, ad-blocker-style. [https://www.aicontentshield.app/](https://www.aicontentshield.app/)
  - Key observation: targets AI *features* (overviews, chat widgets), not AI-generated page *content*.
- **BrowserBlock AI** — on-device blur/remove of AI images, text summaries, chatbot widgets; also blocks `window.ai` calls so sites can't run in-browser LLMs without consent. [https://node.ms/browserblockai/](https://node.ms/browserblockai/)
  - Key observation: `window.ai` gating is an adjacent primitive yubiOS hasn't needed yet, but a real one (browser-side LLM blocking).
- **Valerie** — behavioral detection of AI chatbots (network activity, WebSocket patterns, text-streaming signatures) and blocking them per-site. [https://valerieaidetector.com/](https://valerieaidetector.com/)
  - Key observation: different threat model — it blocks *AI agents running in your browser*, not AI content from pages.
- **Is Generated** — community report-and-block of whole sites containing AI noise. [https://chromewebstore.google.com/detail/is-generated-block-ai-con/chccpjfkgkgogeaaekpgoocmcekajgjk](https://chromewebstore.google.com/detail/is-generated-block-ai-con/chccpjfkgkgogeaaekpgoocmcekajgjk)
- **AI Blocker (Dr-Brook/ai-blocker, GitHub)** — network-level blocking of AI endpoints + DOM-level CSS hiding. [https://github.com/Dr-Brook/ai-blocker](https://github.com/Dr-Brook/ai-blocker)

None of these gate at the rendering/network layer of the browser engine itself; all are extension-layer.

## Failed attempts

- **OpenAI AI Classifier** (shut down July 2023) — killed for "low rate of accuracy." [https://techcrunch.com/2023/07/25/openai-scuttles-ai-written-text-detector-over-low-rate-of-accuracy/](https://techcrunch.com/2023/07/25/openai-scuttles-ai-written-text-detector-over-low-rate-of-accuracy/) / [https://arstechnica.com/information-technology/2023/07/openai-discontinues-its-ai-writing-detector-due-to-low-rate-of-accuracy/](https://arstechnica.com/information-technology/2023/07/openai-discontinues-its-ai-writing-detector-due-to-low-rate-of-accuracy/)
  - Key observation: even the company that makes the models couldn't ship a reliable text detector. Detector-as-blocker is fragile for text.
- **Mozilla Deep Fake Detector** (shut down June 26, 2025) — extension retired for low adoption + maintenance burden of keeping detection current. [https://news.aibase.com/news/19120](https://news.aibase.com/news/19120)
  - Key observation: detection-extensions die of maintenance (models move under them) even faster than accuracy kills them. A *provenance*-based gate (yubiOS approach) doesn't rot the same way — manifests are signed at creation.
- **Writer.com AI content detector** (sunset Dec 22, 2025). [https://metegpt.com/writer-com-ai-detector](https://metegpt.com/writer-com-ai-detector)
- **FTC v. Workado (Content At Scale)** — the advertised 98.3% accuracy was found false; internal testing showed near-coin-flip on non-academic content. [https://evilcorporations.com/ftc-ai-detection-workado-content-at-scale-late-stage-capitalism/](https://evilcorporations.com/ftc-ai-detection-workado-content-at-scale-late-stage-capitalism/)
  - Key observation: accuracy claims in this space are regulator-bait. yubiOS's CONSTRAINTS.md rule (never claim "human-verified"; classifier-only blocks need ≥800 chars + ≥0.98 confidence and stay user-overridable) is well-matched to this regulatory environment.
- **DuckDuckGo's own ceiling** — their engineering team calls blocklist-only filtering "playing whack-a-mole" and admits it will "never be 100% accurate in either direction." [https://insideduckduckgo.substack.com/p/duck-tales-why-duckduckgo-built-a](https://insideduckduckgo.substack.com/p/duck-tales-why-duckduckgo-built-a)
  - Key observation: the pure-blocklist approach saturates; nobody has shipped the provenance/classifier hybrid at browser-layer yet.

## Academic / formal

- **Krawetz et al., "Verifying Provenance of Digital Media: Security Analysis of C2PA and its Implementation"** (IACR ePrint 2026/804, April 2026) — first formal-methods analysis of C2PA specs 2.2–2.4. Findings: generators and validators disagree on the signature's trusted timestamp; inadequate cert-revocation lets validators accept manifests signed with known-compromised certificates; conforming validators produce inconsistent results; the C2PA "exclusion range" enables undetectable alterations; the conformance program certifies without technical review. Some fixes adopted in C2PA 2.3 and the Pixel 10 Pro. [https://eprint.iacr.org/2026/804](https://eprint.iacr.org/2026/804)
  - Key observation (critical for yubiOS): yubiOS's patch 0007 C2PA parser extracts claimed-action but **deliberately does not validate signatures yet** — this paper shows signature validation is where C2PA actually breaks, and cert revocation is the weakest link. The deferred "c2pa-rs vendoring (signature validation)" follow-up is walking into the hardest part of the problem, and this paper gives the exact failure modes to test against (timestamp disagreement, compromised-cert acceptance, exclusion-range edits).
- **C2PA provenance labels and trust** (ICWSM) — presenting provenance labels measurably increases perceived credibility of news across Western countries. [https://ojs.aaai.org/index.php/ICWSM/article/view/42749](https://ojs.aaai.org/index.php/ICWSM/article/view/42749)
  - Key observation: UI signaling (yubiOS's omnibox chip, interstitial) has measured trust effects — the user-facing layer is validated as worthwhile.
- **AMP: authentication of media via provenance** (ACM CCS) — earlier academic provenance-authentication framing. [https://dl.acm.org/doi/10.1145/3458305.3459599](https://dl.acm.org/doi/10.1145/3458305.3459599)
- **Integrating Content Authenticity with DASH Video Streaming** (ACM MMSys) — client-side C2PA verification in streaming players. [https://dl.acm.org/doi/10.1145/3625468.3652198](https://dl.acm.org/doi/10.1145/3625468.3652198)

## Adjacent / historical

- **uBlock Origin anti-AI lists** — the substrate DuckDuckGo itself built on:
  - laylavish/uBlockOrigin-HUGE-AI-Blocklist — 1000+ curated sites, "nuclear" lists for mixed-authentic sites (DeviantArt, Artstation). [https://github.com/laylavish/uBlockOrigin-HUGE-AI-Blocklist](https://github.com/laylavish/uBlockOrigin-HUGE-AI-Blocklist)
  - Wakelock/uSloplist — anti-slop ruleset with explicit false-positive-avoidance policy. [https://github.com/Wakelock/uSloplist](https://github.com/Wakelock/uSloplist)
  - Iz-zzzzz/Block-AI-FilterList-for-uBlockOrigin — ~950-site network blocklist of AI content farms. [https://github.com/Iz-zzzzz/Block-AI-FilterList-for-uBlockOrigin](https://github.com/Iz-zzzzz/Block-AI-FilterList-for-uBlockOrigin)
  - diluteoxygen/noai — master switch blocking AI UI + network requests to AI endpoints. [https://github.com/diluteoxygen/noai](https://github.com/diluteoxygen/noai)
  - Key observation: these lists are the de-facto community truth layer. A yubiOS blocklist feed (for `block_on_detect` pre-filtering) could consume them, but their curation is manual and their coverage is site-level, not asset-level.
- **Not By AI badge** — voluntary human-created-content marking; explicitly "not an AI detection tool," and no filter list acts on it. [https://notbyai.fyi/](https://notbyai.fyi/)
  - Key observation: negative-space — the allow-side marker ecosystem has no enforcement path. A browser that *requires* valid provenance for some content class (yubiOS's `provenance_required` mode) is the enforcement mechanism this ecosystem lacks.
- **C2PA Content Credentials browser extension** (Digimarc) — c2pa-js-based in-browser validation, sandboxed, independent of the host site. [https://deepwiki.com/digimarc-corp/c2pa-content-credentials-extension](https://deepwiki.com/digimarc-corp/c2pa-content-credentials-extension)
  - Key observation: the closest shipping C2PA-in-browser prior art is an *extension*, not engine-layer. yubiOS's in-process approach (patch 0007 in data_decoder) is architecturally distinct and avoids the extension sandbox's manifest-access limitations.

## What this means for the provenance-gated Chromium (OMN-165)

### Competitive landscape

The shipped landscape is all filter-lists and extensions: DuckDuckGo (search layer), uBlock lists (extension layer), AI Content Shield / BrowserBlock / Valerie (extension layer). Nobody ships an engine-layer gate that consults provenance manifests and detection APIs before rendering. The yubiOS approach (throttle + evidence store + interstitial + settings, patches 0001–0016) has no direct shipping competitor.

### Why previous attempts failed

Three distinct failure axes, none of which apply cleanly to yubiOS's design:

1. **Text detectors died of accuracy** (OpenAI, Writer, FTC case). yubiOS avoids this for text: no text detector is load-bearing for the block decision; text watermark detection is one signal in mode A, overridable, with a confidence floor.
2. **Detection extensions died of maintenance** (Mozilla). Provenance manifests are signed at creation and don't go stale the way model weights do.
3. **Blocklist-only saturated** (DuckDuckGo's own assessment). yubiOS already layered detection + provenance + policy modes above a blocklist-free design.

### Why no one has tried this

Not because it's a bad idea: DuckDuckGo's filter got overwhelming user demand (>50% of their image complaints were "stop showing me AI"), and the extension ecosystem is large. It's untried at engine layer because (a) it requires a Chromium fork (only OS-level projects can do it), (b) provenance coverage of the web is still thin (C2PA shipped in cameras/creators but adoption is early), and (c) the detector APIs yubiOS depends on (Anthropic Fable watermark, SynthID, OpenAI provenance checks) only became available in 2026. yubiOS is positioned exactly where the three prerequisites just crossed.

### Open opportunity

1. **Signature validation is the known hard part.** The C2PA formal-methods paper documents exactly where validators break (timestamp disagreement, cert revocation, exclusion ranges). Test patch 0007's future validation against those three specific failure modes.
2. **Provenance-required as an allow-side enforcement** is genuinely novel — the Not By AI ecosystem has markers but no enforcement path; `provenance_required` is that missing mechanism.
3. **Hybrid tiering is validated by DuckDuckGo's roadmap**: they plan blocklist → flagging → classifier/metadata. yubiOS already has the full ladder shipped in one design (modes, confidence floors, evidence store).
4. **Cost/latency lesson**: DuckDuckGo rejected per-image classification at scale for cost/latency. yubiOS's in-process ONNX (TrustMark) and browser-side classifier floors are the right shape; avoid any architecture that round-trips every image to a cloud detector.

## Sources

- https://duckduckgo.com/duckduckgo-help-pages/results/how-to-filter-out-ai-images-in-duckduckgo-search-results — the shipped feature
- https://insideduckduckgo.substack.com/p/duck-tales-why-duckduckgo-built-a — engineering rationale, blocklist mechanics, classifier cost/latency rejection, "whack-a-mole" admission (fetched in depth)
- https://techcrunch.com/2023/07/25/openai-scuttles-ai-written-text-detector-over-low-rate-of-accuracy/ — OpenAI classifier shutdown
- https://news.aibase.com/news/19120 — Mozilla Deep Fake Detector shutdown (post-mortem host dead; claim from secondary source)
- https://evilcorporations.com/ftc-ai-detection-workado-content-at-scale-late-stage-capitalism/ — FTC finding on detector accuracy claims
- https://eprint.iacr.org/2026/804 — C2PA formal-methods security analysis (fetched in depth)
- https://ojs.aaai.org/index.php/ICWSM/article/view/42749 — provenance labels increase trust
- https://dl.acm.org/doi/10.1145/3625468.3652198 — client-side C2PA in streaming
- https://dl.acm.org/doi/10.1145/3458305.3459599 — AMP provenance authentication
- https://github.com/laylavish/uBlockOrigin-HUGE-AI-Blocklist — the blocklist DuckDuckGo uses
- https://github.com/Wakelock/uSloplist — anti-slop ruleset
- https://github.com/Iz-zzzzz/Block-AI-FilterList-for-uBlockOrigin — AI content-farm blocklist
- https://github.com/diluteoxygen/noai — AI UI + endpoint master switch
- https://notbyai.fyi/ — Not By AI badge (voluntary, not detection)
- https://deepwiki.com/digimarc-corp/c2pa-content-credentials-extension — C2PA in-browser extension (closest provenance prior art)
- https://www.aicontentshield.app/ — AI Content Shield
- https://node.ms/browserblockai/ — BrowserBlock AI
- https://valerieaidetector.com/ — Valerie
- https://chromewebstore.google.com/detail/is-generated-block-ai-con/chccpjfkgkgogeaaekpgoocmcekajgjk — Is Generated
- https://github.com/Dr-Brook/ai-blocker — AI Blocker
- https://metegpt.com/writer-com-ai-detector — Writer detector sunset
