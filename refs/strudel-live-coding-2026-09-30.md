# strudel-live-coding — Skill Conceptualization (2026-09-30)

Request: "deep research and build a skill for https://strudel.cc/workshop/getting-started/"

## Research provenance

The strudel.cc site content is built from the strudel source repo. Canonical home moved from GitHub
(`tidalcycles/strudel`, archived 2025-06) to **https://codeberg.org/uzu/strudel**. The full tarball
(`https://codeberg.org/uzu/strudel/archive/main.tar.gz`, ~19.9 MB) was fetched and the entire workshop
corpus read from source:

- `website/src/pages/workshop/getting-started.mdx` (44 lines — intro, what Strudel is, use cases)
- `website/src/pages/workshop/first-sounds.mdx` (380 lines — REPL mechanics, sounds, drums, banks, Mini-Notation part 1)
- `website/src/pages/workshop/first-notes.mdx` (398 lines — notes, scales, elongate/replicate, stacks)
- `website/src/pages/workshop/first-effects.mdx` (311 lines — lpf/vowel/gain/adsr/delay/room/pan/speed, signals)
- `website/src/pages/workshop/pattern-effects.mdx` (171 lines — rev/jux/add/ply/off, multiple tempos)
- `website/src/pages/workshop/motors.mdx` (117 lines — MQTT motor patterning, Inventor 2040W)
- `website/src/pages/workshop/recap.mdx` (68 lines — the canonical function/syntax tables)
- `website/src/repl/prebakeCodeMirror.mjs` (REPL keymap: Ctrl/Cmd/Alt-Enter = evaluate)

Supplementary search confirmed the ecosystem: `terryds/awesome-strudel` (curated resources),
`eefano/strudel-songs-collection` (song library), `gruvw/strudel.nvim` (Neovim controller).
GitHub API anonymous rate limit (403) was hit en route; Codeberg archive is the unauthenticated path.

## Skill design

Name: `strudel-live-coding`. Location: yubi-OS/yubiOS/skills/strudel-live-coding/SKILL.md
(+ local mirror in skills/github-yubios-KS9n5GAT/).

Scope decisions (one lens per choice):

1. **Whole-workshop, not just getting-started**: the getting-started page is a 44-line landing page
   pointing at the workshop chain. The real content is the 5-chapter workshop (1489 lines of MDX).
   The skill covers the full chain (sounds → notes → effects → pattern-effects → motors) plus the recap tables.
2. **Pattern authoring is the core primitive**: the skill's job is to turn a musical idea into correct
   Mini-Notation + function chains, and to debug patterns that "don't sound right". Examples carry
   every canonical workshop tune (house, rock, We Will Rock You, Firecracker, 16-step grid, classy
   stack, dub tune, shuffle groove) verbatim from the source.
3. **Verification = the ear + the REPL**: no test harness exists; the skill encodes the REPL workflow
   (Ctrl+Enter / Ctrl+.) and the diagnostic gotchas (tempo drift from bare sequences, flat dynamics,
   silent wrong-name sounds, sample numbers).
4. **Grounding note**: the skill warns against the archived GitHub repo and points at Codeberg, so
   future sessions don't research a dead source (cost me a 404 + 403 to learn).

## Deliverables

- SKILL.md (spec 2.2: frontmatter, H1, Examples + Guidelines) → this skill.
- Conceptualization doc → this file.
- Push target: yubi-OS/yubiOS `main` via Git Data API (skill-building convention), local registry regenerated.
