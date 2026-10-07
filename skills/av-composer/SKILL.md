---
name: "av-composer"
description: "Compose, capture, and render a short audio/video piece (launch video, promo, animated explainer, demo clip) entirely with local tooling: an HTML+GSAP composition driven frame-by-frame by headless Chrome, assembled with ffmpeg. Zero external calls at build/render time: no CDN scripts, no Google Fonts, no npm installs, no cloud render or TTS services. Use when someone wants a video made from a project or brief and the work must run fully offline/local, when the brag-style creative contract is wanted without the Hyperframes dependency, or when a render environment has limited disk/network and a resumable frame-capture pipeline is needed. Triggers on 'av-composer', 'compose a video', 'render a promo locally', 'local video pipeline', 'make a launch video without external calls', 'frame-capture render'."
---

# av-composer

Local-first audio/video composition. One HTML file plus one GSAP timeline is the whole source of truth; a headless-Chrome frame capture and an ffmpeg assembly turn it into a finished MP4 with mixed audio. Every build and render step runs on local binaries and local files. Nothing in this pipeline makes a network request.

Validated end-to-end 2026-10-07 (Steady Orbit Systems hero, 1920x1080 20.5s, 616 frames, music + 5 SFX, ~4.5 min total build).

## When to Use

- A launch/promo/demo video is wanted and the environment must stay offline (sandboxed, disk-capped, or policy-restricted).
- The `brag` skill's creative contract is wanted without its external dependencies (Hyperframes CLI, CDN GSAP, Google Fonts, npx tooling).
- A render must be resumable across interrupted runs (container restarts, timeouts).
- Deterministic, seek-driven rendering is required (every frame produced from an explicit timeline seek, not wall-clock animation).

## When NOT to Use

- Voiceover/narration is required. Narration needs a TTS provider (external); v1 is intentionally silent on voice. Ship video-only and add narration in a later pass.
- Real-time playback or live preview interactivity matters more than a finished file (this pipeline produces files, not live views).
- The piece needs video footage editing, color grading of existing footage, or multi-track NLE work.

## The Zero-External-Calls Contract

Every dependency is local. Before rendering, verify all of these:

1. **GSAP is bundled locally.** `assets/vendor/gsap.min.js` inside the composition, referenced with a relative path. A CDN `<script src>` silently fails in headless capture (composition freezes at CSS defaults; every animated element stays at its initial state). Lint does not catch this.
2. **Fonts are local or system.** `@font-face` with local woff2 files under `assets/fonts/`, or a system font stack. Google Fonts `@import`/`<link>` is banned in a composition (adds network + nondeterminism).
3. **Audio and images are local files** under the composition's `assets/` tree, referenced by relative paths. Absolute paths silently fail in the renderer.
4. **No runtime fetches.** The composition script must not call `fetch()`/XHR at all. If data is needed, inline it.
5. **The capture browser is a local binary** (`chrome-headless-shell` at `/usr/local/bin/chrome-headless-shell`) driven by local `puppeteer-core`. No downloads, no `playwright install`, no remote browser services.

## Pipeline

### Step 1: Plan

Write `<output-dir>/av-plan.md` before composing. Minimum content: the angle/hook, scene-by-scene storyboard (name, duration, what appears, what is read), the total duration (scene durations MUST sum to 15-25s for launch-style pieces), tone, and the audio plan (music choice, volume, SFX moments, fade). Keep the creative laws that make short videos work: short, readable (a short label holds ~0.8s settled; a sentence ~0.3s per word), specific, show the real thing, hook in the first 2s. Reading floors are enforced at plan time: if a scene carries more text than its duration allows, cut copy or split the scene, never speed it up.

### Step 2: Compose

One file: `<output-dir>/composition/index.html`. Contract:

```html
<div id="root" data-composition-id="root" data-start="0" data-width="1920" data-height="1080"> ... </div>
<script src="assets/vendor/gsap.min.js"></script>
<script>
  var tl = gsap.timeline({ paused: true });
  // ... scene tweens with absolute time as the 3rd arg ...
  window.__timelines = window.__timelines || {};
  window.__timelines['root'] = tl;
</script>
```

Rules:
- The timeline is `paused: true` and registered on `window.__timelines` under the composition id. Capture seeks it; nothing else drives motion.
- **No CSS keyframe animations for timed motion** (they are not seekable; use GSAP tweens). Static CSS styling is fine.
- Supported GSAP properties in this pipeline: opacity, x, y, scale, scaleX, scaleY, rotation, width, height, visibility. `tl.set()` with no position argument appends at the timeline end; give it an explicit time or use `fromTo`.
- Audio is declared declaratively on `<audio>` elements and honored by the assembly script: `data-start` (s), `data-duration` (s), `data-track-index` (music on 10, SFX on 11+), `data-volume` (music 0.25-0.4, SFX 0.55-0.85). One `<audio>` per clip; never share a track index between overlapping clips.
- Deterministic imagery: generate procedural content (starfields, grids, particles) with a seeded PRNG at load, never `Math.random()` unseeded.
- Optional beat-lock discipline: if a cue JSON is available for the chosen music, lock 1-3 major reveals to strong cues (±0.15s) and sequential non-text events to consecutive beats (±0.10s); snap sequential readable text to every other beat. Comment each lock: `// beat-locked: 8.74s`.

### Step 3: Capture frames

```bash
NODE_PATH=<node_modules-with-puppeteer-core> node <skill-dir>/scripts/capture.js \
  <composition-dir> <output-frames-dir> --fps 30 --duration 20.5 [--quality draft|standard]
```

What it does: launches `chrome-headless-shell` (1920x1080, deviceScaleFactor 1), waits for the timeline registration AND `document.fonts.status === 'loaded'`, then for each frame index seeks `window.__timelines['root'].seek(t)` and screenshots JPEG (q92 standard / q85 draft). Resumable: existing frame files are skipped, so an interrupted capture continues where it stopped. Measured throughput: ~9 fps capture (616 frames in ~71s single-core).

If `document.fonts.status` never reaches `loaded` (a font file missing), the script fails fast rather than capturing fallback-font frames. Check that every `@font-face` src exists.

### Step 4: Assemble with audio

```bash
node <skill-dir>/scripts/assemble.js <frames-dir> --out <output.mp4> \
  --fps 30 --duration 20.5 --audio <composition>/audio-manifest.json [--crf 19]
```

`audio-manifest.json` is generated from the composition's `<audio>` elements by `scripts/extract-audio.js` (or hand-written):

```json
[
  {"src":"assets/music/track.mp3","start":0,"volume":0.3,"fadeOut":{"start":19,"dur":1.5}},
  {"src":"assets/sfx/impact/bell.ogg","start":0.56,"volume":0.7}
]
```

`assemble.js` builds the ffmpeg graph (music volume + `afade`, per-SFX `adelay=<start*1000>:all=1` + `volume`, `amix=inputs=N:normalize=0`), encodes `libx264` + `aac` 192k, `yuv420p`, `-t duration`. Requires ffmpeg with `libx264` and `aac` (the sandbox ffmpeg-free build has both).

**Poster bake:** pick the best frame (eyeball several extracted stills), copy it over `frames/f0000.jpg` BEFORE assembling. Frame 0 becomes the idle thumbnail everywhere with no extra concat step. Write the picked poster as `<output-dir>/av.jpg` too.

### Step 5: Verify and deliver

Never report a render without looking at it: extract 4-6 stills from the mp4 (`ffmpeg -ss <t> -i out.mp4 -frames:v 1`) and READ them. Check: every text element readable against its background, no text-on-bright collisions, transitions landed, last frame fades correctly. Verify `ffprobe` duration + audio stream presence. Deliverables: `<output-dir>/av.mp4`, `av.jpg`, `share-copy.txt` (one sentence), the plan, and the composition source (keep it; it is the editable source of truth).

## Failure lessons (each one cost a real run)

- **CDN GSAP = frozen composition.** Symptom: snapshots show only CSS-default-visible content; check fails "Could not determine composition duration". Fix: bundle gsap locally (contract rule 1).
- **Disk gate:** big render tools refuse under ~1 GB free. This pipeline's temp cost is small (616 JPEG frames ≈ 50 MB), but still keep frames + output on the largest writable mount and clean `frames/` between iterations.
- **Container/process restarts wipe in-flight state.** The capture script is resumable by design; check frames exist before re-capturing. Verify artifacts immediately after the step that produces them.
- **Text on bright surfaces.** A centered text block over a bright object (sun, hero image) becomes unreadable. Fix pattern (validated): move the object down, raise the text block, and give headlines a `filter: drop-shadow(...)` (shadows rendered pixels; `text-shadow` paints through `background-clip:text` gradients and embosses them).
- **Wrap control:** give summary/support lines explicit `<br>` breaks at plan-time boundaries; auto-wrap at 1080p display sizes lands orphan fragments.

## Bundled assets

`assets/music/` carries CC0 tracks ("Happy Beats / Business Moves" by ende.app) with precomputed cue presets in `assets/music/cues/*.music-cues.json` (tempo, beat grid, strongCues). `assets/sfx/` carries a curated CC0 subset (interface drops/clicks/bong, impact bells/soft thuds/glass, casino card/chip moves, keyboard keypresses for typing moments). Use them, or drop in any local audio files. `sfx-analysis` discipline still applies: prefer low high-frequency-risk sounds for repeated moments.

## Interaction with Other Skills

- `brag` — the creative contract ancestor (tones, creative laws, audio heuristics). When brag is installed, its full `assets/music` + `assets/sfx` libraries can be copied in; av-composer never calls brag's external tooling.
- `frontend-ui-engineering` — composition authoring is UI authoring; production-quality rules apply.
- `video-generation` — for generated/AI video content; av-composer is for composed HTML-driven motion.

## Examples

**Worked shape** (the validated run):

- Plan: 5 scenes, 20.5s total, cinematic tone, hook at 0.56s (first beat), strong-cue locks at 8.74/13.11/17.47 from the bundled vol-12 cue preset.
- Composition: 1920x1080, seeded starfield (mulberry32, ~1080 stars), GSAP timeline with 20 tweens, 6 `<audio>` elements (music + 5 SFX) on tracks 10-15.
- Capture: `node scripts/capture.js composition frames --fps 30 --duration 20.5` → 616 JPEGs in 71s.
- Poster: frame 435 (14.5s) picked, copied to `f0000.jpg`.
- Assemble: `node scripts/assemble.js frames --out av.mp4 --fps 30 --duration 20.5 --audio composition/audio-manifest.json` → 1.9 MB mp4, aac audio, 20.5s.
- Verify: 4 stills read + ffprobe duration/stream check.

**Fast iteration shape:** `--quality draft` (q85 JPEG + higher CRF) for review passes; re-capture is cheap (~70s) because layout iterations only need a full re-capture, not a re-plan.

## Guidelines

1. Never make a network request from the composition, the scripts, or the capture browser. If something seems to require one, it is a dependency to replace locally, not an exception to grant.
2. Plan before composing; reading floors and the 15-25s envelope are plan-time decisions.
3. The GSAP timeline is the only clock. No CSS animations for timed motion, no `setTimeout`-driven states.
4. One `<audio>` element per clip; track indexes never shared between overlapping clips.
5. Seek, don't play: the capture script must seek the timeline, never let wall-clock animation run.
6. Always verify visually before declaring done (stills from the actual mp4).
7. Keep the composition source next to the deliverable; it is the editable master.
8. Resumability is a feature: every script skips existing complete artifacts.
