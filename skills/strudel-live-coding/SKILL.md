---
name: strudel-live-coding
description: "Author, teach, and verify Strudel live-coding music patterns (strudel.cc) — the browser REPL, Mini-Notation rhythm syntax, sounds/drums/banks, notes and scales, audio + pattern effects, signal modulation, pattern stacks, and full example tunes. Grounded in the official Strudel Workshop (strudel.cc/workshop) and the strudel source at codeberg.org/uzu/strudel. Use when the user wants to write a beat/melody/effect in Strudel, explain or teach live coding with Strudel, convert a musical idea into Mini-Notation, debug a Strudel pattern that doesn't sound right, or integrate Strudel as a sequencer (MIDI/OSC). Triggers on: strudel, strudel.cc, live coding, algorave, TidalCycles, mini-notation, `$: pattern`, `sound(\"bd sd\")`, `note(...)`, `.lpf`, setcpm, `n(...).scale(...)`, drum machine bank names."
---

# Strudel Live Coding

## Guidelines

### What Strudel is

- Browser-based environment for live coding algorithmic patterns. An official port of the TidalCycles pattern language to JavaScript. The place to make music: the Strudel REPL at https://strudel.cc/. Docs/workshop: https://strudel.cc/workshop/. Source lives at https://codeberg.org/uzu/strudel (the GitHub repo `tidalcycles/strudel` was archived after the move to Codeberg in mid-2025 — don't cite it as the canonical home).
- No JavaScript or TidalCycles knowledge required to write patterns. Uses: live coded music, algorithmic composition, teaching (low barrier of entry, teaches music and code at once), and as a flexible sequencer into an existing setup via MIDI or OSC.
- Workshop chapter order (the learning ladder): first-sounds → first-notes → first-effects → pattern-effects → motors → recap.

### REPL mechanics

- Code fields: click in, press `Ctrl+Enter` (macOS `Meta+Enter`; `Alt+Enter` also works) to play. Change code, press `Ctrl+Enter` again to update live. Press `Ctrl+.` to stop. This IS live coding — updating the pattern while it plays.
- Sounds may load with a small pause the first time (samples are fetched on demand).
- Line comments with `//`; comment out a `$:` line to silence one layer, remove the `//` to bring it back.
- Multiple patterns play in parallel via `$:`. Prefix with `_$:` instead of `$:` to MUTE a layer (keep it loaded, silent). Add `.hush()` at the end of one pattern in the stack to stop just that layer.

### Mini-Notation (the rhythm language, always inside quotes)

| Concept | Syntax | Example |
|---|---|---|
| Sequence | space | `sound("bd bd sd hh")` |
| Sample number | `:x` | `sound("hh:0 hh:1 hh:2 hh:3")` (no number = `:0`) |
| Rest | `-` or `~` | `sound("bd hh - rim")` |
| Alternate (one per cycle) | `< >` | `sound("<bd hh rim oh>")` |
| Sub-sequence (squishes to own slot) | `[ ]` | `sound("bd wind [metal jazz] hh")` |
| Sub-sub-sequence | `[[ ]]` | `sound("bd [metal [jazz [sd cp]]]")` (nest as deep as you want) |
| Speed up | `*` | `sound("bd sd*2 cp*3")` (decimals allowed: `hh*1.5`) |
| Slow down | `/` | `note("[c a f e]/2")` |
| Parallel (stack) | `,` | `sound("bd*2, hh*2 [hh oh]")` |
| Elongate | `@` | `note("c@3 e")` (`c@1` = bare `c`) |
| Replicate | `!` | `note("c!3 e")` |

Key mental model: a sequence's contents are squished into one **cycle** (2s by default). Adding elements to a bare sequence makes it faster; `<a b c>` is shorthand for `[a b c]/3` — tempo stays the same as you add/remove elements. Inside Mini-Notation, `*` = fast and `/` = slow; outside, use `.fast(2)` / `.slow(2)`.

- Newlines inside a pattern are fine: use backticks (template literal) for multi-line parallel stacks.

### Sounds, drums, banks

- `sound("casio")` plays a named sample. Standard unpitched sounds include: `insect wind jazz metal east crow casio space numbers`.
- Drum letters: `bd` bass drum, `sd` snare drum, `rim` rimshot, `hh` hihat, `oh` open hihat, `lt`/`mt`/`ht` low/mid/high tom, `rd` ride, `cr` crash.
- `.bank("Name")` swaps the drum machine: `RolandTR909`, `RolandTR808`, `RolandTR707`, `RolandTR505`, `AkaiLinn`, `RhythmAce`, `ViscoSpaceDrum`, `RolandCompurhythm1000`, `CasioRZ1`.
- `s(...)` is an alias for `sound(...)` (both appear in workshop examples).

### Notes, scales, tempo

- `note("48 52 55 59")` (MIDI numbers; decimals allowed) or `note("c e g b")` (letters a–g, `#`/`b` for sharps/flats, octave numbers: `c2 e3 g4 b5`). Numbers are easier if the user isn't fluent in letters.
- `.sound("piano")` picks the sound for pitched notes; multiple sounds alternate per event: `.sound("piano gm_electric_guitar_muted")` (space) or stack them simultaneously: `.sound("piano, gm_electric_guitar_muted")` (comma). Useful note sounds: `piano`, `gm_acoustic_bass`, `gm_electric_guitar_muted`, `gm_voice_oohs`, `gm_blown_bottle`, `gm_xylophone`, `gm_accordion`, `gm_synth_bass_1`, `gm_synth_strings_1`, plus oscillators `sawtooth square triangle`.
- Slow melodic sequences down: `note("[36 34 41 39]/4")` plays the bracket over 4 cycles. Use `< >` for one note per cycle. Combine: `note("<[36 48]*4 [34 46]*4 [41 53]*4 [39 51]*4>")` (repetitive bassline).
- Scales: `n("0 2 4 <[6,8] [7,9]>").scale("C:minor")` — `n` is interpreted as scale degree, any number sounds good. Scale examples: `C:major`, `A2:minor`, `D:dorian`, `G:mixolydian`, `A2:minor:pentatonic`, `F:major:pentatonic`. Scales can be patterned: `.scale("<C:major D:mixolydian>/4")`.
- Tempo: `setcpm(90/4)` — cycles per minute. Default is 30 cpm = 120 bpm in 4/4 = one 2-second cycle. Convention `setcpm(90/4)` = eighth notes at 90 bpm in 4/4.

### Audio effects

- `.lpf(800)` low-pass filter (200 = muffled, 5000 = bright). Pattern it: `.lpf("200 1000 200 1000")` — patterning an effect does NOT change the overall rhythm.
- `.vowel("<a e i o>")` formant filter.
- `.gain("[.25 1]*4")` — dynamics: rhythm is all about it.
- `.delay(.5)`; extended form `delay("a:b:c")` = a: delay volume, b: delay time, c: feedback (smaller = quicker fade). E.g. `.delay(".8:.125")`, `.delay(".8:.06:.8")`.
- `.room(2)` reverb.
- `.pan("0 0.3 .6 1")` stereo position (0=left, 1=right).
- `.speed("<1 2 -1 -2>")` playback speed (negative = reversed).
- ADSR envelope: `.attack(.1).decay(.1).sustain(.25).release(.2)` or short `.adsr(".1:.1:.5:.2")`. Attack = fade-in time, decay = time to reach sustain, sustain = level after decay, release = fade-out after note end.
- Tempo outside Mini-Notation: `.slow(2)` / `.fast(2)`, patternable: `.fast("<1 [2 4]>")`.

### Signals (continuous modulation)

- Replace any number with a signal: `sine`, `saw`, `square`, `tri`, `rand`, `perlin`. E.g. `sound("hh*16").gain(sine)`.
- Signals default to 0–1. Rescale with `.range(min, max)`: `.lpf(saw.range(500, 2000))` (flipping the range values inverts the motion).
- Change modulation speed: `.lpf(sine.range(100, 2000).slow(4))` — whole modulation now spans 4 cycles (8s).
- `.segment(16)` discretizes a signal into N steps per cycle (used for hardware like motors where continuous streaming would overwhelm the device).

### Pattern effects (the Tidal-specific toolbox)

- `rev()` reverse the pattern.
- `jux(rev)` split stereo: original left, modified (reversed) right. Equivalent to two `$:` lines with `.pan(0)` / `.pan(1).rev()`. Visualize with `.color("cyan")` / `.color("magenta")`.
- `.add("<0 <1 -1>>")` adds a number to events (a note becomes its numeric value); chainable: `.add("<0 <1 -1>>").add("0,7")`. On scale degrees it stays in-scale: `n("0 [2 4] <3 5>".add("<0 [0,2,4]>")).scale("C5:minor")`.
- `.ply(2)` plays each event 2 times (`s("bd sd").ply(2)` ≈ `s("bd*2 sd*2")`); pattern it: `.ply("<1 2 3>")`.
- `.off(1/16, x => x.add(4))` copies the pattern, shifts the copy by 1/16 of a cycle, modifies the copy. Nestable: `.off(2/16, x => x.speed(1.5).gain(.25).off(3/16, y => y.vowel("<a e i o>*8")))`.
- Multiple tempos in one pattern: `.slow("0.5,1,1.5")` = three parallel copies at three speeds.

### Motors / beyond audio (optional)

- Strudel can pattern hardware: `move("-60 80").motor("0").robot('x')` via MQTT to a microcontroller (workshop uses a Pimoroni Inventor 2040W). Servo range -90..90; motors count from 0 in code. Keep `.segment(N)` modest (16–64) so the microcontroller doesn't fall behind.

### Canonical full tunes (verified workshop examples)

Classic house:
```
$: sound("bd*4, [- cp]*2, [- hh]*4").bank("RolandTR909")
```

Basic rock beat:
```
setcpm(100/4)
$: sound("[bd sd]*2, hh*8").bank("RolandTR505")
```

We Will Rock You:
```
setcpm(81/2)
$: sound("bd*2 cp").bank("RolandTR707")
```

YMO Firecracker:
```
setcpm(120/2)
$: sound("bd sd, - - - hh - hh - -, - perc - perc:1*2").bank("RolandCompurhythm1000")
```

16-step sequencer imitation (grid layout):
```
setcpm(90/4)
$: sound(`[-  -  oh - ] [-  -  -  - ] [-  -  -  - ] [-  -  -  - ],
[hh hh -  - ] [hh -  hh - ] [hh -  hh - ] [hh -  hh - ],
[-  -  -  - ] [cp -  -  - ] [-  -  -  - ] [cp -  -  - ],
[bd -  -  - ] [-  -  -  bd] [-  -  bd - ] [-  -  -  bd]`)
```

Full "classy" stack (drums + bass + melody + pad):
```
$: sound("bd*4, [~ <sd cp>]*2, [~ hh]*4").bank("RolandTR909")
$: note("<[c2 c3]*4 [bb1 bb2]*4 [f2 f3]*4 [eb2 eb3]*4>")
  .sound("gm_synth_bass_1").lpf(800)
$: n(`<[~ 0] 2 [0 2] [~ 2]
  [~ 0] 1 [0 1] [~ 1]
  [~ 0] 3 [0 3] [~ 3]
  [~ 0] 2 [0 2] [~ 2] >*4`).scale("C4:minor")
  .sound("gm_synth_strings_1")
```

Dub tune (effects showcase):
```
$: note("[~ [<[d3,a3,f4]!2 [d3,bb3,g4]!2> ~]]*2")
  .sound("gm_electric_guitar_muted").delay(.5)
$: sound("bd rim").bank("RolandTR707").delay(.5)
$: n("<4 [3@3 4] [<2 0> ~@16] ~>")
  .scale("D4:minor").sound("gm_accordion:2")
  .room(2).gain(.4)
$: n("[0 [~ 0] 4 [3 2] [0 ~] [0 ~] <0 2> ~]/2")
  .scale("D2:minor")
  .sound("sawtooth,triangle").lpf(800)
```

Shuffle groove (triplet swing via elongation):
```
setcpm(60)
$: n("<[4@2 4] [5@2 5] [6@2 6] [5@2 5]>*2")
  .scale("<C2:mixolydian F2:mixolydian>/4")
  .sound("gm_acoustic_bass")
```

## Examples

### Example: build a beat from scratch (the workshop path)

```
# 1. one sound
$: sound("casio")
# 2. a drum sequence (squished into 1 cycle — 8 elements = fast)
$: sound("bd bd hh bd rim bd hh bd")
# 3. control tempo independently of element count
$: sound("<bd bd hh bd rim bd hh bd>*8")
# 4. set real tempo
$: setcpm(90/4); sound("<bd hh rim hh>*8")
# 5. rests + sub-sequences + parallel layers
$: sound("bd [hh hh] sd [hh bd] bd - [hh sd] cp")
$: sound("hh hh hh, bd casio")
```

### Example: melody with scale degrees and automation

```
setcpm(60)
$: n("<0 -3>, 2 4 <[6,8] [7,9]>")
  .scale("<C:major D:mixolydian>/4")
  .sound("piano")
```

### Example: turn a musical idea into Mini-Notation

Idea: "hihat 16ths with accents, kick on 1 and 3-and, snare on 2 and 4, at 120 bpm."
```
setcpm(60/4)
$: sound("[hh hh hh hh]*4").gain("[1 .3]*8")
$: sound("[bd ~ bd ~] [bd ~ ~ bd]").bank("RolandTR909")
$: sound("[~ sd ~ sd]")
```
(The bracket grid is one cycle per line-segment; `setcpm(60/4)` makes each cycle a bar at 120 bpm.)

### Example: verify / debug a pattern

- Play it in the REPL at https://strudel.cc/ (or a workshop code field): `Ctrl+Enter` to play, edit, `Ctrl+Enter` to update, `Ctrl+.` to stop.
- If a pattern sounds "flat", add dynamics: `.gain("[.25 1]*4")` on hats, `.adsr(...)` on pads.
- If tempo changed unexpectedly after edits, the sequence isn't inside `< >` — bare sequences re-squish on every add/remove; wrap with `< >` or add `/N`.
- If a sound is silent, try a different sample number (`name:1`) or check the name exists (`bd sd rim hh oh lt mt ht rd cr` for drums; unpitched: `insect wind jazz metal east crow casio space numbers`).
- Use the punchcard/pianoroll visualization in the REPL to see where events land.

## Guidelines (checklist)

- Default tempo math: cycle = 2s; `setcpm(bpm/4)` for quarter-note-based bpm.
- `< >` when tempo must not change as the pattern evolves; `[ ]/N` or bare sequences when it should.
- `,` inside a single `sound()` vs `$:` lines: both layer patterns; `$:` keeps layers separately editable/mutable (`_$:` mutes, `.hush()` silences one layer).
- Every effect parameter accepts Mini-Notation patterns and signals — pattern `.lpf`, `.pan`, `.gain`, `.speed`, even `.scale`.
- `!` repeats the same event, `*` speeds it up, `@` stretches it — use `@` for groove/length, `*` for rolls, `!` for literal duplication.
- Always test the final pattern in the actual REPL; syntax that looks right can still sound wrong (the ear is the verifier).
- Sources: official workshop pages (https://strudel.cc/workshop/), strudel source at codeberg.org/uzu/strudel (workshop MDX under `website/src/pages/workshop/`).
