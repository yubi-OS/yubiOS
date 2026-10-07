#!/usr/bin/env node
/**
 * av-composer capture.js — seek-driven frame capture of an HTML+GSAP composition.
 * Local-only: chrome-headless-shell + puppeteer-core. No network deps.
 *
 * Usage:
 *   NODE_PATH=<dir-with-puppeteer-core> node capture.js <compositionDir> <framesDir> \
 *     [--fps 30] [--duration 20.5] [--quality draft|standard] [--browser <path>]
 *
 * Resumable: existing frame files are skipped. Re-run to continue after a kill.
 * Frame 0 note: if you want a baked poster, copy the chosen frame over f0000.jpg
 * BEFORE running assemble.js (the skill doc explains the pick-then-bake order).
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/usr/local/bin/chrome-headless-shell';

function parseArgs(argv) {
  const a = { _: [], fps: 30, quality: 'standard' };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === '--fps') a.fps = parseFloat(argv[++i]);
    else if (s === '--duration') a.duration = parseFloat(argv[++i]);
    else if (s === '--quality') a.quality = argv[++i];
    else if (s === '--browser') a.browser = argv[++i];
    else if (s.startsWith('--')) { console.error('unknown flag', s); process.exit(2); }
    else a._.push(s);
  }
  return a;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const [compDir, framesDir] = args._;
  if (!compDir || !framesDir) { console.error('usage: capture.js <compositionDir> <framesDir> [--fps N] [--duration S] [--quality draft|standard]'); process.exit(2); }
  const indexHtml = path.join(path.resolve(compDir), 'index.html');
  if (!fs.existsSync(indexHtml)) { console.error('no index.html in', compDir); process.exit(2); }
  fs.mkdirSync(framesDir, { recursive: true });
  const q = args.quality === 'draft' ? 85 : 92;

  const browser = await puppeteer.launch({
    executablePath: args.browser || CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--font-render-hinting=none'],
    defaultViewport: { width: 1920, height: 1080 }
  });
  const page = await browser.newPage();
  await page.goto('file://' + indexHtml, { waitUntil: 'load', timeout: 60000 });

  // Composition geometry + timeline key come from the composition itself
  const meta = await page.evaluate(() => {
    const el = document.querySelector('[data-composition-id]');
    if (!el) return null;
    return {
      id: el.getAttribute('data-composition-id'),
      w: parseInt(el.getAttribute('data-width') || '1920', 10),
      h: parseInt(el.getAttribute('data-height') || '1080', 10)
    };
  });
  if (!meta) { console.error('FAIL: no [data-composition-id] element'); await browser.close(); process.exit(1); }
  await page.setViewport({ width: meta.w, height: meta.h });

  // Wait for the paused timeline + fonts. Fail fast: capture must never run against
  // an unregistered timeline (frozen-at-defaults frames) or unloaded fonts.
  const key = 'window.__timelines && window.__timelines[' + JSON.stringify(meta.id) + ']';
  try {
    await page.waitForFunction(key + " && document.fonts.status==='loaded'", { timeout: 30000 });
  } catch (e) {
    const state = await page.evaluate("({tl: !!(" + key + "), fonts: document.fonts.status})");
    console.error('FAIL: timeline/fonts not ready', JSON.stringify(state));
    console.error('hint: is gsap bundled locally (assets/vendor/gsap.min.js) and registered on window.__timelines?');
    await browser.close(); process.exit(1);
  }

  // Duration: --duration wins; else the longest <audio data-start+data-duration>, else error
  let duration = args.duration;
  if (!duration) {
    duration = await page.evaluate(() => {
      let d = 0;
      document.querySelectorAll('audio[data-start]').forEach(a => {
        const end = parseFloat(a.getAttribute('data-start') || 0) + parseFloat(a.getAttribute('data-duration') || 0);
        if (end > d) d = end;
      });
      return d || null;
    });
  }
  if (!duration) { console.error('FAIL: no --duration and none derivable from audio elements'); await browser.close(); process.exit(1); }
  duration += 1 / args.fps * 0.999; // include the final frame at t=duration

  const N = Math.round(duration * args.fps);
  const started = Date.now();
  for (let i = 0; i <= N; i++) {
    const f = path.join(framesDir, 'f' + String(i).padStart(4, '0') + '.jpg');
    if (fs.existsSync(f)) continue;
    const t = i / args.fps;
    await page.evaluate((id, tt) => { window.__timelines[id].seek(tt, false); }, meta.id, t);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: f, type: 'jpeg', quality: q });
    if (i % 60 === 0) console.log('frame', i, '/', N, ((Date.now() - started) / 1000).toFixed(1) + 's');
  }
  console.log('CAPTURE DONE', N + 1, 'frames in', ((Date.now() - started) / 1000).toFixed(1) + 's');
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
