# strudel corpus companion (2026-10-06)

Companion document for the `knowledge/strudel/` corpus in yubi-OS/knowledge. The corpus is the workshop canon for the Strudel live-coding music environment; this doc is its refs-side mirror: what the corpus covers, what it establishes, and where the operating manual lives.

## What the corpus is

10 docs, 9,024 words, minted 2026-09-30 from the request "add strudel to the knowledge repo". Primary source of record is the strudel source repo at codeberg.org/uzu/strudel (workshop MDX under website/src/pages/workshop/); the GitHub mirror tidalcycles/strudel is archived and not canonical. Every claim in the corpus carries a source URL tagged [primary] or [dig, jev=<weight>], and two unverifiable bank names are flagged rather than asserted, which is the corpus's honesty posture in miniature.

## Doc map

- `01-overview-ecosystem.md`: what Strudel is (a browser port of the TidalCycles pattern language to JavaScript, initiated by Alex McLean and Felix Roos in 2022), the Codeberg move, licensing (AGPLv3), and the surrounding ecosystem (awesome-strudel, strudel-songs-collection, the Uzulang family).
- `02-repl-mechanics.md`: the REPL as an instrument. Ctrl+Enter plays and updates (same key, evaluation is idempotent from the player's view), Ctrl+. stops, Alt variants exist, the keymap is registered with Prec.highest in packages/codemirror/codemirror.mjs, prebake fields save with Meta/Ctrl/Alt+Enter, and comments (`//`) toggle individual layers on and off.
- `03-mini-notation.md`: the complete rhythm syntax table: space, `:x` sample numbers, `-`/`~` rests, `<>` alternation, `[]` nesting, `*` speed, `/` slow, `,` parallel, `@` elongate, `!` replicate, all sitting on the cycle model.
- `04-sounds-banks-samples.md`: `sound()`/`s()`, drum letters (bd, sd, rim, hh, oh, cr, rd, ht, mt, lt, plus cp, sh, cb, tb, perc, misc, fx), `.bank()` drum machines (bank is literally a name prefix: `RolandTR909_bd`), sample selection via `:x` and `n()`, lazy loading with first-trigger silence.
- `05-notes-scales-tempo.md`: `note()` with MIDI numbers (decimals detune quarter tones) and letters, stacking sounds per event, scales via `n(...).scale("C:minor")` with degrees, negative degrees, and the `setcpm` tempo model (default 30 cpm = 120 bpm in 4/4).
- `06-audio-effects.md`: lpf, vowel, gain, delay (3-part `a:b:c` form), room, pan, speed (negative speed plays samples in reverse), ADSR envelopes, and the central insight that every effect parameter can itself be patterned without changing the overall rhythm.
- `07-signals-modulation.md`: sine, saw, square, tri, rand, perlin as continuous patterns in the default 0..1 range, `.range()` rescaling, `.slow()` on signals, and `.segment(N)` for targets that cannot absorb a continuous stream.
- `08-pattern-effects.md`: the Tidal-specific transforms: rev, jux (split left/right, modify right), add (chainable; on scale degrees it moves in scale steps, keeping the result in scale), ply, off (copy, shift time, modify, nestable), and multiple simultaneous tempos via `.slow("0.5,1,1.5")`.
- `09-hardware-integrations.md`: MIDI and OSC as the sequencer-out path, and the motors chapter: patterning servo motors on a Pimoroni Inventor 2040W over MQTT with `move(...).motor("0").robot('x')`, values in -90 to 90, full mini-notation and signals applying to movement.
- `10-livecoding-practice.md`: the workshop as a 5-step learning ladder ending in a recap table, the 4 stated use cases, canonical starter beats verbatim (rock beat at `setcpm(100/4)`, classic house, We Will Rock You at `setcpm(81/2)`, Firecracker), the Classy stack and dub tune, and the community layer.

## Key takeaways

1. The cycle is the unit of time. Everything in a sequence squishes into one cycle (2s at the default 30 cpm), so adding elements speeds a bare sequence up while `< >` alternation holds tempo regardless of element count (`<a b c>` equals `[a b c]/3`). `setcpm` redefines the cycle rate with the bpm/4 convention.
2. Mini-notation is the one grammar that everywhere. The same operators pattern drums, notes, scale degrees, effect parameters (`lpf("400 2000")`), and motor movement (`move("-10 0 10 [20 30]*2")`). That is the corpus's structural through-line: a pattern is a pattern, whether its target is audio, a filter cutoff, or a servo.
3. Signals are the continuous complement to the discrete pattern. Any numeric parameter accepts a signal; `.range()` rescales, `.slow()` stretches the modulation period (`.slow(4)` means 8 cycles per repeat), and `.segment(N)` quantizes for hardware targets, with the workshop's warning that segment counts much above 64 can overwhelm the microcontroller with a backlog of instructions.
4. The effect stack runs in superdough, not in the pattern. Strudel patterns describe music declaratively; the Web Audio engine behind @strudel/webaudio produces the sound, so you call one function per effect and never wire the chain by hand.
5. The REPL's contract is play, change, update. Ctrl+Enter is both first evaluation and live update; errors are reset by reloading the page; layers are silenced by commenting out `$:` lines; samples load lazily on first trigger.
6. Honest gaps are named, not filled. Two bank names (RolandTR505, RolandCompurhythm1000, CasioRZ1 among them) could not be verified in the fetched sources and are flagged; the packages/midi/README fetch 404'd and the doc leaves the MIDI API surface open rather than inventing it.

## How yubiOS uses it

The corpus is the citation base for anything Strudel-shaped in yubiOS, including the boot-sound composition kept in yubi-OS/assets. The composition is not itself a corpus doc, so the corpus grounds it only where their surfaces meet: whatever the boot-sound uses of mini-notation syntax, drum letters and banks, `setcpm` tempo, or effect patterning, the authoritative definitions are docs 03, 04, 05, and 06 of this corpus. Anything in the composition that goes beyond those docs should cite the workshop pages directly, not this corpus.

## Relationship to the strudel-live-coding skill

The space skill `skills/github-yubios-KS9n5GAT/strudel-live-coding/` is the operating manual: when the agent writes, debugs, or teaches a Strudel pattern, it loads the skill and follows its tables and gotchas. This corpus is the workshop canon underneath: the sourced, weight-tagged record of where each of those facts comes from. When a skill claim and a session conflict, re-derive from the corpus; when the corpus is silent, cite the Codeberg workshop sources it points at. The skill is how to work; the corpus is why the how is right.

## Provenance

- Minted 2026-09-30, jev-validated (outline min score 0.86, 8 docs scored >= 1.38, none dropped).
- Digs: 20 searXNG queries (2 per doc via the n8n searxng-proxy webhook), 120 results collected, 89 kept at jev >= 0.5, weighted in 24 batched requests at $0.002459; total corpus cost $0.0027.
- Authoring: 10 parallel subagents, one per doc, all 10 shipped.
- Phase 0 preflight: searXNG 200 / 125 results, jev 200 with noul probe 0.41; recorded in research-db/archive.json.
- Landed via PR #5, merged at 569066a.

Note: the README describes an outline validation step; the checked-in research-db carries the result in `archive.json` plus the typed index in `db.ts` (DOC_ORDER, STATS, PREFLIGHT), not a standalone `outline.json`.
