// Adds `shares` to every entry in data/flags.json: how much of the flag each curated
// colour covers, lined up with `colors` and summing to 1. Flag Pie draws these.
//
// Measured, not curated: each flag image is decoded in a headless Chromium (the
// browser's own PNG and SVG decoders, so the shipped app gains no dependency) and the
// pixels are counted in node by measureShares() from js/flag-colors.js — the same
// tolerance the Coverage board uses to check the colour lists against the images.
//
// A curated colour that covers next to nothing is reported, not dropped: either the
// emblem really is that small, or the colour list is wrong (TODO #83).
//
// Usage: node scripts/build-flag-shares.mjs   (needs network for flagcdn)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { SOURCES } from './lib/provenance.mjs';
import { measureShares, MIN_SHARE_SEEN } from '../js/flag-colors.js';

// Dev-only. Playwright is not a dependency of this repo; any local install works.
const PLAYWRIGHT_FROM = process.env.PLAYWRIGHT_FROM || `${homedir()}/.claude/skills/gstack/node_modules/`;
const { chromium } = createRequire(PLAYWRIGHT_FROM)('playwright');

// Keep in sync with BUNDLED in js/flags.js.
const BUNDLED = new Set(['xa', 'xc', 'xo', 'xs', 'xt']);
const WIDTH = 640;

const file = 'data/flags.json';
const { flags } = JSON.parse(readFileSync(file, 'utf8'));

async function imageDataUrl(code) {
  if (BUNDLED.has(code)) {
    return `data:image/svg+xml;base64,${readFileSync(`assets/flags/${code}.svg`).toString('base64')}`;
  }
  const url = `${SOURCES.flagcdn.endpoint}w${WIDTH}/${code}.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');

const decode = (src) => page.evaluate(async ({ src, width }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = width, h = Math.max(1, Math.round((img.naturalHeight || 2) * w / (img.naturalWidth || 3)));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
  return btoa(s);
}, { src, width: WIDTH });

// Rounded to four places, with the rounding remainder put on the largest slice so the
// stored list sums to 1 exactly as written.
function round(shares) {
  const r = shares.map((s) => Math.round(s * 10000) / 10000);
  const sum = r.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    const big = r.indexOf(Math.max(...r));
    r[big] = Math.round((r[big] + 1 - sum) * 10000) / 10000;
  }
  return r;
}

// Beyond anti-aliasing and emblem shading, a flag this far off its own list is likely
// missing a colour from it. Its `unmatched` is stored so Flag Pie can leave out a pie
// that would not look like the flag.
const UNMATCHED_LOOK = 0.05;
const suspects = [];
const uncovered = [];
const failed = [];
for (const f of flags) {
  try {
    const rgba = Buffer.from(await decode(await imageDataUrl(f.code)), 'base64');
    const { shares, unmatched } = measureShares(rgba, f.colors);
    f.shares = round(shares);
    if (unmatched > UNMATCHED_LOOK) f.unmatched = Math.round(unmatched * 1000) / 1000;
    else delete f.unmatched;
    if (unmatched > UNMATCHED_LOOK) uncovered.push(`${f.code} ${f.name}: ${(unmatched * 100).toFixed(1)}% of the flag is near none of its colours`);
    f.colors.forEach((c, i) => { if (f.shares[i] < MIN_SHARE_SEEN) suspects.push(`${f.code} ${f.name}: ${c} ${(f.shares[i] * 100).toFixed(2)}%`); });
  } catch (e) {
    failed.push(`${f.code}: ${e.message}`);
  }
}
await browser.close();

if (failed.length) {
  console.error(`Not written — ${failed.length} flag(s) could not be measured:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}

// One entry per line, as the file has always been laid out, so a rebuild diffs by flag.
const line = (f) => `    { "code": ${JSON.stringify(f.code)}, "name": ${JSON.stringify(f.name)}, "colors": ${JSON.stringify(f.colors).replace(/,/g, ', ')}, "shares": ${JSON.stringify(f.shares).replace(/,/g, ', ')}${f.unmatched ? `, "unmatched": ${f.unmatched}` : ''} }`;
writeFileSync(file, `{\n  "flags": [\n${flags.map(line).join(',\n')}\n  ]\n}\n`);

console.log(`${file} — shares for ${flags.length} flags`);
if (suspects.length) {
  console.log(`\n${suspects.length} curated colour(s) cover under ${MIN_SHARE_SEEN * 100}% of their flag — a tiny emblem, or a wrong colour list:`);
  for (const s of suspects) console.log(`  ${s}`);
}
if (uncovered.length) {
  console.log(`\n${uncovered.length} flag(s) with a sizeable area matching none of their curated colours:`);
  for (const s of uncovered) console.log(`  ${s}`);
}
