#!/usr/bin/env node
/**
 * av-composer extract-audio.js — build an audio-manifest.json from a composition's
 * declarative <audio> elements (data-start / data-duration / data-track-index / data-volume).
 *
 * Usage: node extract-audio.js <compositionDir/index.html> [--out <composition>/audio-manifest.json]
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) { console.error('usage: extract-audio.js <composition index.html> [--out manifest.json]'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');
const audio = [];
const re = /<audio\b[^>]*>/g;
let m;
while ((m = re.exec(html))) {
  const tag = m[0];
  const attr = (n) => { const r = new RegExp(n + '="([^"]*)"'); const x = r.exec(tag); return x ? x[1] : null; };
  const src = attr('src');
  if (!src) continue;
  audio.push({
    src,
    start: parseFloat(attr('data-start') || '0'),
    duration: parseFloat(attr('data-duration') || '0'),
    track: parseInt(attr('data-track-index') || '0', 10),
    volume: parseFloat(attr('data-volume') || '1')
  });
}
audio.sort((a, b) => a.start - b.start);
const oi = process.argv.indexOf('--out');
let out = (oi !== -1 ? process.argv[oi + 1] : null) || path.join(path.dirname(path.resolve(file)), 'audio-manifest.json');
fs.writeFileSync(out, JSON.stringify(audio, null, 1));
console.log('WROTE', out, audio.length, 'clips');
