# Skills check sweep (independent of geometry, held for review)

**Date:** 2026-09-17. **Base:** branch `wayfinder-skills-round1-2026-09-17` (wayfinder skills round 1, PR #239) so the two PRs stack; the round-1 fixes are not repeated here. **Files changed:** 82. **Files still failing after the fixer:** 0.

The wayfinder round named 10 targets and fixed 6. The same frozen check (`skillcheck.sh` C1–C6: mojibake, duplicate H2, TODO placeholders, skill-format frontmatter, template capability paragraphs, local links) fails on 82 more files under `skills/`. Those defects have nothing to do with sector geometry, so this sweep applies the same deterministic fixer to every remaining failing file and re-runs the check. No map, ledger row or rung was consulted or produced; the geometry instrument is not involved in this PR by design.

Fix classes applied (a file may carry several): {"C4": 27, "C5": 49, "C2": 23}.

- **C4 (27):** 13 SKILL.md bodies were committed base64-encoded (agents-sdk, cloudflare*, durable-objects, sandbox-*, turnstile-spin, web-perf, workers-best-practices, wrangler) and are decoded to their markdown; 13 descriptions over the 1,024-character skill-format limit are cut at a sentence boundary under 1,000 characters with the remainder moved verbatim into an "Extended description" section; 1 description had angle brackets removed.
- **C5 (49):** template paragraphs asserting least-privilege / declarative-policy / continuous-monitoring / trust-chain participation the skill does not implement are replaced by a dated coverage note; skill-specific text in those sections is kept.
- **C2 (23):** duplicate `##` sections are merged into the first occurrence, keeping every non-duplicate body paragraph (e.g. two or three `## Changelog` sections become one).

Verification recipe: `for f in skills/*/SKILL.md; do skillcheck.sh $f; done` → 112/112 PASS on this branch (24/112 on main).

| file | fix | bytes |
|---|---|---|
| `0pointer-mastery/SKILL.md` | C4 description 1714 -> 543 chars; 1170 chars moved to body | 20714 → 20853 |
| `agents-sdk/SKILL.md` | C4 decoded base64-encoded file body (16260 -> 12119 chars) | 16260 → 12195 |
| `arm-trusted-firmware-optee/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 18793 → 18751 |
| `ascii-uart-animator/SKILL.md` | C5 replaced 3 template capability paragraph(s) | 5846 → 5709 |
| `bcvk-virtualization/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 11470 → 11428 |
| `browser-testing-with-devtools/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 20067 → 20053 |
| `ci-cd-and-automation/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 16165 → 16151 |
| `cloudflare-email-service/SKILL.md` | C4 decoded base64-encoded file body (10604 -> 7925 chars) | 10604 → 7953 |
| `cloudflare-one-migrations/SKILL.md` | C4 decoded base64-encoded file body (16484 -> 12363 chars) | 16484 → 12363 |
| `cloudflare-one/SKILL.md` | C4 decoded base64-encoded file body (29724 -> 22293 chars) | 29724 → 22293 |
| `cloudflare/SKILL.md` | C4 decoded base64-encoded file body (11984 -> 8660 chars) | 11984 → 8988 |
| `composefs-kernel-floors/SKILL.md` | C5 replaced 3 template capability paragraph(s); C2 merged 1 duplicate H2 section(s) into their first occurrence | 13683 → 13568 |
| `context-isolation/SKILL.md` | C5 replaced 1 template capability paragraph(s); C2 merged 1 duplicate H2 section(s) into their first occurrence | 12953 → 12894 |
| `continuous-runtime-detection-falco/SKILL.md` | C2 merged 2 duplicate H2 section(s) into their first occurrence | 7419 → 3883 |
| `curve-compass-skill/SKILL.md` | C4 description 1604 -> 750 chars; 853 chars moved to body | 19287 → 19455 |
| `curve-guided-rsi-self/SKILL.md` | C4 description 1849 -> 961 chars; 887 chars moved to body | 38483 → 38657 |
| `curve-guided-rsi/SKILL.md` | C5 replaced 1 template capability paragraph(s); C2 merged 16 duplicate H2 section(s) into their first occurrence | 30226 → 15380 |
| `curved-corpus-create/SKILL.md` | C4 description 1618 -> 689 chars; 928 chars moved to body | 18794 → 18960 |
| `dm-verity-and-integrity/SKILL.md` | C2 merged 1 duplicate H2 section(s) into their first occurrence | 13431 → 13417 |
| `docker-bake-action/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 10754 → 10712 |
| `docker-build-policy/SKILL.md` | C4 description 1031 -> 825 chars; 205 chars moved to body; C5 replaced 1 template capability paragraph(s) | 11213 → 11315 |
| `docker-buildx-rootless/SKILL.md` | C4 description 1047 -> 811 chars; 235 chars moved to body; C5 replaced 1 template capability paragraph(s) | 16481 → 16579 |
| `docker-setup-buildx-action/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 6888 → 6846 |
| `docker-setup-qemu-action/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 6740 → 6698 |
| `documentation-and-adrs/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 13770 → 13714 |
| `doubt-driven-development/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 21877 → 21790 |
| `drm-gpu-quota-secure-time/SKILL.md` | C4 description 1106 -> 861 chars; 244 chars moved to body; C5 replaced 1 template capability paragraph(s) | 15101 → 15199 |
| `durable-objects/SKILL.md` | C4 decoded base64-encoded file body (7824 -> 5867 chars) | 7824 → 5867 |
| `fedora-bootc-base-images/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 10393 → 10351 |
| `git-workflow-and-versioning/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 15964 → 15908 |
| `github-api/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 14452 → 14410 |
| `github-stacked-pull-requests/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 15154 → 15104 |
| `human-for-feasibility/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 17577 → 17535 |
| `hyperspherical-harmonic-curve/SKILL.md` | C5 replaced 3 template capability paragraph(s); C2 merged 5 duplicate H2 section(s) into their first occurrence | 32287 → 16775 |
| `idea-kill/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 15204 → 15148 |
| `idea-refine/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 13160 → 13104 |
| `ideate-solo/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 14770 → 14714 |
| `incremental-implementation/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 14627 → 14365 |
| `internal-big-picture/SKILL.md` | C2 merged 1 duplicate H2 section(s) into their first occurrence | 59912 → 59898 |
| `internal-nonlex-tokens/SKILL.md` | C5 replaced 3 template capability paragraph(s) | 50712 → 50574 |
| `interview-me/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 19378 → 19322 |
| `learned-latent-curve/SKILL.md` | C5 replaced 1 template capability paragraph(s); C2 merged 6 duplicate H2 section(s) into their first occurrence | 69655 → 35376 |
| `least-privilege-pod-security-standards/SKILL.md` | C2 merged 2 duplicate H2 section(s) into their first occurrence | 7058 → 3667 |
| `linkedin-browser-outreach/SKILL.md` | C4 description 1285 -> 913 chars; 371 chars moved to body; C5 replaced 1 template capability paragraph(s) | 11013 → 11144 |
| `mkosi-image-builder/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 9820 → 9778 |
| `negative-skill-space/SKILL.md` | C5 replaced 2 template capability paragraph(s); C2 merged 2 duplicate H2 section(s) into their first occurrence | 6823 → 4349 |
| `novelty-indication/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 16324 → 16267 |
| `nspawn-containers/SKILL.md` | C5 replaced 1 template capability paragraph(s); C2 merged 1 duplicate H2 section(s) into their first occurrence | 12909 → 12853 |
| `nss-adjacent-problems/SKILL.md` | C4 description 1176 -> 705 chars; 470 chars moved to body | 16771 → 16940 |
| `nss-composition/SKILL.md` | C2 merged 1 duplicate H2 section(s) into their first occurrence | 42012 → 41985 |
| `nss-failure-modes/SKILL.md` | C4 description 1581 -> 465 chars; 1115 chars moved to body | 41111 → 41274 |
| `nss-inputs/SKILL.md` | C4 description 1356 -> 422 chars; 933 chars moved to body | 24529 → 24692 |
| `nss-knowledge-recursion/SKILL.md` | C2 merged 2 duplicate H2 section(s) into their first occurrence | 41361 → 41303 |
| `nss-lifecycle/SKILL.md` | C4 description 1910 -> 832 chars; 1077 chars moved to body; C2 merged 2 duplicate H2 section(s) into their first occurrence | 38191 → 38324 |
| `observability-and-instrumentation/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 17755 → 17570 |
| `parallel-deep-research/SKILL.md` | C4 removed angle brackets from description | 3359 → 3368 |
| `performance-optimization/SKILL.md` | C5 replaced 1 template capability paragraph(s) | 26401 → 26387 |
| `planning-and-task-breakdown/SKILL.md` | C5 replaced 1 template capability paragraph(s); C2 merged 1 duplicate H2 section(s) into their first occurrence | 15658 → 15392 |
| `play-audio-on-rock1/SKILL.md` | C5 replaced 3 template capability paragraph(s) | 9172 → 9035 |
| `prior-art-search/SKILL.md` | C5 replaced 2 template capability paragraph(s); C2 merged 1 duplicate H2 section(s) into their first occurrence | 20660 → 20584 |
| `recursive-self-improvement/SKILL.md` | C2 merged 2 duplicate H2 section(s) into their first occurrence | 31839 → 31813 |
| `restful-self/SKILL.md` | C5 replaced 3 template capability paragraph(s) | 13813 → 13676 |
| `rsi-phi-skill/SKILL.md` | C4 description 1106 -> 934 chars; 171 chars moved to body | 12758 → 12931 |
| `runtime-attestation-keylime/SKILL.md` | C2 merged 2 duplicate H2 section(s) into their first occurrence | 8450 → 4403 |
| `sandbox-migrate-to-next/SKILL.md` | C4 decoded base64-encoded file body (10840 -> 8092 chars) | 10840 → 8128 |
| `sandbox-next/SKILL.md` | C4 decoded base64-encoded file body (9428 -> 7032 chars) | 9428 → 7071 |
| `sandbox-stable/SKILL.md` | C4 decoded base64-encoded file body (12012 -> 8969 chars) | 12012 → 9009 |
| `self-archaeology/SKILL.md` | C5 replaced 3 template capability paragraph(s) | 14026 → 13889 |
| `shipping-and-launch/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 16707 → 16621 |
| `sigstore-rekor-v2/SKILL.md` | C5 replaced 1 template capability paragraph(s); C2 merged 1 duplicate H2 section(s) into their first occurrence | 18057 → 18001 |
| `single-action-curve-rsi/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 32984 → 32889 |
| `slsa-provenance/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 11487 → 11395 |
| `source-driven-development/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 15033 → 14866 |
| `test-driven-development/SKILL.md` | C5 replaced 2 template capability paragraph(s) | 20285 → 20229 |
| `the-cult/SKILL.md` | C5 replaced 1 template capability paragraph(s); C2 merged 1 duplicate H2 section(s) into their first occurrence | 15213 → 15184 |
| `the-follower/SKILL.md` | C2 merged 1 duplicate H2 section(s) into their first occurrence | 29778 → 29760 |
| `token-efficiency/SKILL.md` | C2 merged 1 duplicate H2 section(s) into their first occurrence | 13845 → 13830 |
| `turnstile-spin/SKILL.md` | C4 decoded base64-encoded file body (38280 -> 28690 chars) | 38280 → 28708 |
| `web-perf/SKILL.md` | C4 decoded base64-encoded file body (10932 -> 8190 chars) | 10932 → 8198 |
| `workers-best-practices/SKILL.md` | C4 decoded base64-encoded file body (9456 -> 7044 chars) | 9456 → 7092 |
| `wrangler/SKILL.md` | C4 decoded base64-encoded file body (24480 -> 18357 chars) | 24480 → 18359 |
| `yubikey-operations/SKILL.md` | C5 replaced 2 template capability paragraph(s); C2 merged 1 duplicate H2 section(s) into their first occurrence | 14909 → 14808 |

## Second pass: base64-encoded bodies outside SKILL.md (362 files)

The first sweep decoded the 13 base64-committed `SKILL.md` bodies; the frontmatter check (C4) only applies to `SKILL.md`, so reference pages, scripts and tests committed the same way were invisible to it. A dedicated scan of all 504 blobs under `skills/` (whole file matches `^[A-Za-z0-9+/=\s]+$`, decodes to UTF-8, printable) found **362** more: every `references/*.md`, `scripts/*.sh`, `tests/*.md` and `README.md` under the personal-Cloudflare skill family. All decode to plain markdown/shell (no nested encoding); 2,135,020 → 1,600,905 bytes. One decoded file (`cloudflare/references/cache-reserve/README.md`) then failed C1 with mojibake and was fixed with the same fixer. `skillcheck.sh` gains **C7 base64-encoded body** so this class is caught on any file from now on. After this commit: 0 base64-looking files remain under `skills/`, and every non-empty file under `skills/` passes C1–C7.

By skill: cloudflare 319, agents-sdk 19, turnstile-spin 12, cloudflare-email-service 5, durable-objects 3, sandbox-next 2, workers-best-practices 2.

