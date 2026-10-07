#!/usr/bin/env node
/**
 * av-composer assemble.js — ffmpeg assembly of captured frames + declarative audio mix.
 * Local-only: ffmpeg binary. libx264 + aac.
 *
 * Usage:
 *   node assemble.js <framesDir> --out <output.mp4> --fps 30 --duration 20.5 \
 *     --audio <composition>/audio-manifest.json [--crf 19] [--faststart]
 *
 * audio-manifest.json: array of
 *   {"src": "assets/music/track.mp3", "start": 0, "volume": 0.3,
 *    "fadeOut": {"start": 19, "dur": 1.5}}        // optional, seconds
 * Paths are relative to the manifest's directory (i.e. the composition dir).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const a = { _: [], crf: 19 };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === '--out') a.out = argv[++i];
    else if (s === '--fps') a.fps = parseFloat(argv[++i]);
    else if (s === '--duration') a.duration = parseFloat(argv[++i]);
    else if (s === '--audio') a.audio = argv[++i];
    else if (s === '--crf') a.crf = argv[++i];
    else if (s === '--faststart') a.faststart = true;
    else if (s.startsWith('--')) { console.error('unknown flag', s); process.exit(2); }
    else a._.push(s);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args._[0] || !args.out || !args.fps || !args.duration) {
  console.error('usage: assemble.js <framesDir> --out out.mp4 --fps 30 --duration 20.5 [--audio manifest.json] [--crf 19]');
  process.exit(2);
}
const framesDir = path.resolve(args._[0]);
let audio = [];
if (args.audio) {
  const manifestDir = path.dirname(path.resolve(args.audio));
  const list = JSON.parse(fs.readFileSync(path.resolve(args.audio), 'utf8'));
  audio = list.map(e => ({ ...e, abs: path.resolve(manifestDir, e.src) }));
  for (const e of audio) if (!fs.existsSync(e.abs)) { console.error('missing audio file:', e.abs); process.exit(2); }
}

const ffargs = ['-y', '-hide_banner', '-loglevel', 'error',
  '-framerate', String(args.fps), '-i', path.join(framesDir, 'f%04d.jpg')];
const filters = [];
const mixIns = [];
audio.forEach((e, i) => {
  ffargs.push('-i', e.abs);
  const idx = i + 1;
  let chain = `[${idx}:a]`;
  if (e.volume != null) chain += `volume=${e.volume},`;
  if (e.fadeOut) chain += `afade=t=out:st=${e.fadeOut.start}:d=${e.fadeOut.dur},`;
  chain += `adelay=${Math.round(e.start * 1000)}:all=1[a${idx}]`;
  filters.push(chain);
  mixIns.push(`[a${idx}]`);
});
if (mixIns.length) filters.push(mixIns.join('') + `amix=inputs=${mixIns.length}:normalize=0[aout]`);

ffargs.push('-filter_complex', filters.join(';'));
ffargs.push('-map', '0:v');
if (mixIns.length) ffargs.push('-map', '[aout]');
ffargs.push('-c:v', 'libx264', '-crf', String(args.crf), '-preset', 'medium', '-pix_fmt', 'yuv420p');
if (mixIns.length) ffargs.push('-c:a', 'aac', '-b:a', '192k');
ffargs.push('-t', String(args.duration));
if (args.faststart) ffargs.push('-movflags', '+faststart');
ffargs.push(args.out);

const r = spawnSync('ffmpeg', ffargs, { stdio: 'inherit' });
if (r.status !== 0) { console.error('assemble failed (ffmpeg exit ' + r.status + ')'); process.exit(r.status || 1); }
console.log('ASSEMBLED', args.out);
