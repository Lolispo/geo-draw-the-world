// Checks the shape-match engine against the arithmetic it replaced and against the
// masks the build produced (TODOS #58). Run: node scripts/check-shape-masks.mjs
//
// Three properties, each of which would actually fail if something drifted:
//   1. the bitmask IoU equals the Set-of-keys IoU scoring.js used before the refactor
//   2. a build-time mask equals the mask rasterised live from the same outline
//   3. a country scores exactly 100 against itself
import { readFileSync, existsSync } from 'node:fs';
import { GRID, MASK_WORDS, normalizeMultiPolygon, rasterizeToMask, maskIoU } from '../js/raster.js';
import { pointInMultiPolygon } from '../js/utils.js';

// The pre-refactor implementation, verbatim, as the oracle.
function legacyRasterize(polygons, bb, gridSize) {
  const filled = new Set();
  const scaleX = gridSize / (bb.width || 1);
  const scaleY = gridSize / (bb.height || 1);
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const x = bb.minX + (gx + 0.5) / scaleX;
      const y = bb.minY + (gy + 0.5) / scaleY;
      if (pointInMultiPolygon(x, y, polygons)) filled.add(`${gx},${gy}`);
    }
  }
  return filled;
}
function legacyIoU(polys1, polys2) {
  const norm1 = normalizeMultiPolygon(polys1, GRID * 0.8);
  const norm2 = normalizeMultiPolygon(polys2, GRID * 0.8);
  const bb = { minX: -GRID / 2, minY: -GRID / 2, maxX: GRID / 2, maxY: GRID / 2, width: GRID, height: GRID };
  const r1 = legacyRasterize(norm1, bb, GRID);
  const r2 = legacyRasterize(norm2, bb, GRID);
  let inter = 0;
  for (const k of r1) if (r2.has(k)) inter++;
  const union = r1.size + r2.size - inter;
  return union === 0 ? 0 : inter / union;
}

const shape = (code) => JSON.parse(readFileSync(`data/shapes/${code}.json`, 'utf8')).polygons;

let failures = 0;
const fail = (msg) => { console.error(`  FAIL ${msg}`); failures++; };

// 1. bitmask IoU == legacy IoU, over a spread of real pairs
const codes = ['se', 'no', 'tn', 'cl', 'ru', 'sm', 'id', 'it', 'us', 'nz'];
console.log('1. bitmask IoU matches the pre-refactor Set implementation');
let pairs = 0;
for (let i = 0; i < codes.length; i++) {
  for (let j = i; j < codes.length; j++) {
    const a = shape(codes[i]), b = shape(codes[j]);
    const got = maskIoU(rasterizeToMask(a), rasterizeToMask(b));
    const want = legacyIoU(a, b);
    if (Math.abs(got - want) > 1e-12) fail(`${codes[i]} vs ${codes[j]}: ${got} != ${want}`);
    pairs++;
  }
}
console.log(`   ${pairs} pairs compared`);

// 3. self-match is a perfect 100 (checked before 2 so it runs without a built file)
console.log('3. every country scores 100 against itself');
for (const c of codes) {
  const s = Math.round(maskIoU(rasterizeToMask(shape(c)), rasterizeToMask(shape(c))) * 100);
  if (s !== 100) fail(`${c} vs itself scored ${s}`);
}
console.log(`   ${codes.length} countries checked`);

// 2. the built masks are what this code produces right now
const MASKS = 'data/shape-masks.json';
if (!existsSync(MASKS)) {
  console.log(`2. SKIPPED — ${MASKS} not built yet (run npm run build:masks)`);
} else {
  console.log('2. built masks match a live rasterisation of the same outlines');
  const built = JSON.parse(readFileSync(MASKS, 'utf8'));
  if (built.grid !== GRID) fail(`built grid ${built.grid} != ${GRID}`);
  if (built.words !== MASK_WORDS) fail(`built words ${built.words} != ${MASK_WORDS}`);
  for (const [code, b64] of Object.entries(built.masks)) {
    const live = rasterizeToMask(shape(code));
    const bytes = Buffer.from(b64, 'base64');
    const stored = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    if (stored.length !== live.length) { fail(`${code}: ${stored.length} words, expected ${live.length}`); continue; }
    for (let i = 0; i < live.length; i++) {
      if (stored[i] !== live[i]) { fail(`${code}: word ${i} differs`); break; }
    }
  }
  console.log(`   ${Object.keys(built.masks).length} masks checked`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
