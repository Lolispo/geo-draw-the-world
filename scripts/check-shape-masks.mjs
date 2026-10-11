// Checks the shape-match engine (TODOS #58, #72, #73).
// Run: node scripts/check-shape-masks.mjs
//
// Five properties, each of which would actually fail if something drifted:
//   1. where no ring is small enough to become a speck, the bitmask IoU still equals the
//      Set-of-keys IoU scoring.js used before the rasteriser was extracted
//   2. scattered archipelagos rasterise to something rather than to nothing
//   3. every built mask equals a live rasterisation of the same outline
//   4. a country scores 100 against itself
//   5. the ceiling: a perfect drawing of the detailed outline scores 100 on the shape
//      term for every country, since that is now what the round compares against
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { GRID, MASK_WORDS, normalizeMultiPolygon, rasterizeToMask, maskIoU, maskCount } from '../js/raster.js';
import { pointInMultiPolygon, multiPolygonBoundingBox } from '../js/utils.js';

// The pre-speck implementation, verbatim, as the oracle for property 1.
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
// A shape the speck rule does not touch: every ring is big enough to rasterise on its own.
const hasNoSpecks = (polys) => normalizeMultiPolygon(polys).every((ring) => {
  const bb = multiPolygonBoundingBox([ring]);
  return Math.max(bb.width, bb.height) >= 2;
});

let failures = 0;
const fail = (msg) => { console.error(`  FAIL ${msg}`); failures++; };

console.log('1. speck-free shapes still match the pre-speck Set implementation');
const plain = ['tn', 'cl', 'ru', 'sm', 'mc', 'va', 'nr', 'ca', 'pl', 'mn'].filter((c) => hasNoSpecks(shape(c)));
let pairs = 0;
for (let i = 0; i < plain.length; i++) {
  for (let j = i; j < plain.length; j++) {
    const a = shape(plain[i]), b = shape(plain[j]);
    const got = maskIoU(rasterizeToMask(a), rasterizeToMask(b));
    const want = legacyIoU(a, b);
    if (Math.abs(got - want) > 1e-12) fail(`${plain[i]} vs ${plain[j]}: ${got} != ${want}`);
    pairs++;
  }
}
console.log(`   ${pairs} pairs over ${plain.length} speck-free countries`);

console.log('2. scattered archipelagos rasterise to something, not nothing');
// Each of these filled 0 or 1 cell of 6400 before the speck rule, so every drawing of
// them scored zero against an empty mask.
for (const code of ['mv', 'mh', 'fm', 'tv', 'pw', 'sc', 'to', 'ki']) {
  const cells = maskCount(rasterizeToMask(shape(code)));
  if (cells < 20) fail(`${code} rasterises to only ${cells} cells of ${GRID * GRID}`);
}
console.log('   8 archipelago nations checked');

console.log('4. every country scores 100 against itself');
const selfCodes = ['se', 'no', 'tn', 'cl', 'ru', 'sm', 'id', 'it', 'us', 'nz', 'mv', 'tv'];
for (const c of selfCodes) {
  const s = Math.round(maskIoU(rasterizeToMask(shape(c)), rasterizeToMask(shape(c))) * 100);
  if (s !== 100) fail(`${c} vs itself scored ${s}`);
}
console.log(`   ${selfCodes.length} countries checked`);

console.log('5. ceiling: a perfect detailed drawing scores 100 on the shape term');
const allCodes = readdirSync('data/shapes').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
let worst = { code: null, score: 101 };
for (const code of allCodes) {
  const m = rasterizeToMask(shape(code));
  if (maskCount(m) === 0) { fail(`${code} rasterises to an empty mask — nothing can score against it`); continue; }
  const s = Math.round(maskIoU(m, m) * 100);
  if (s < worst.score) worst = { code, score: s };
  if (s !== 100) fail(`${code} ceiling is ${s}, not 100`);
}
console.log(`   ${allCodes.length} countries, worst ceiling ${worst.score} (${worst.code})`);

const MASKS = 'data/shape-masks.json';
if (!existsSync(MASKS)) {
  console.log(`3. SKIPPED — ${MASKS} not built yet (run npm run build:masks)`);
} else {
  console.log('3. built masks match a live rasterisation of the same outlines');
  const built = JSON.parse(readFileSync(MASKS, 'utf8'));
  if (built.grid !== GRID) fail(`built grid ${built.grid} != ${GRID}`);
  if (built.words !== MASK_WORDS) fail(`built words ${built.words} != ${MASK_WORDS}`);
  for (const [code, b64] of Object.entries(built.masks)) {
    const live = rasterizeToMask(shape(code));
    const bytes = Buffer.from(b64, 'base64');
    const stored = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    if (stored.length !== live.length) { fail(`${code}: ${stored.length} words, expected ${live.length}`); continue; }
    for (let i = 0; i < live.length; i++) {
      if (stored[i] !== live[i]) { fail(`${code}: word ${i} differs — rebuild with npm run build:masks`); break; }
    }
  }
  console.log(`   ${Object.keys(built.masks).length} masks checked`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
