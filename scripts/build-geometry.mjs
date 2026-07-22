// Regenerate reference-shape geometry from Natural Earth (TODOS #1).
// - Projects NE lon/lat to the existing Mercator 1600x900 world space
//   (coefficients reverse-engineered from the original data, RMSE ~5px).
// - 1:50m base, 1:10m for small countries. Generates shapes for every entity
//   with a code (joins on ISO_A2_EH); Somaliland matched by name.
// - Clips to the main landmass cluster (drops antimeridian-wrapped + distant
//   overseas rings). Douglas-Peucker simplify. Preserves colors by code.
//
// Usage: node scripts/build-geometry.mjs [--write]   (default: dry report)
import { readFileSync, writeFileSync } from 'node:fs';

const WRITE = process.argv.includes('--write');
const W = 1600, H = 900;
// Projection (fitted to original data)
const AX = 4.4569, BX = 800.06, AY = -145.784, BY = 450.93;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const project = (lon, lat) => [AX * lon + BX, AY * mercY(Math.max(-85, Math.min(85, lat))) + BY];

const CLIP_DIST = 220;       // px — keep rings within this of the main landmass...
const CLIP_AREA_FRAC = 0.5;  // ...or rings at least this fraction of the largest
const DP_EPS = 0.08;         // px — Douglas-Peucker tolerance (TODOS #24: high-def world geometry)
const MIN_RING_AREA = 0.1;   // px^2 — keep small islands (was 2; only drops sub-pixel specks now)

const REGION_OF = {
  Africa: 'africa', Europe: 'europe', Asia: 'asia',
  'North America': 'north-america', 'South America': 'south-america', Oceania: 'oceania',
};

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const ne50 = read('/tmp/ne50.geojson');
const ne10 = read('/tmp/ne10.geojson');
const entities = read('data/entities.json').entities;

// Index NE features by code and by normalized name
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
function indexNE(fc) {
  const byCode = new Map(), byName = new Map();
  for (const f of fc.features) {
    const code = (f.properties.ISO_A2_EH || f.properties.ISO_A2 || '').toLowerCase();
    if (code && code !== '-99' && !byCode.has(code)) byCode.set(code, f);
    for (const k of ['NAME', 'NAME_LONG', 'BRK_NAME', 'ADMIN', 'SOVEREIGNT']) {
      const n = norm(f.properties[k]); if (n && !byName.has(n)) byName.set(n, f);
    }
  }
  return { byCode, byName };
}
const idx50 = indexNE(ne50), idx10 = indexNE(ne10);
const findFeature = (idx, code, name) => idx.byCode.get(code) || idx.byName.get(norm(name)) || null;

// outer rings of a feature, projected
function projectedRings(feature) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((poly) => poly[0].map(([lon, lat]) => project(lon, lat)));
}
function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(a / 2);
}
function ringCentroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const cr = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    a += cr; cx += (r[i][0] + r[i + 1][0]) * cr; cy += (r[i][1] + r[i + 1][1]) * cr;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length]; }
  return [cx / (6 * a), cy / (6 * a)];
}

// Keep main-landmass cluster: largest ring + rings near it or comparably large
function clipToMain(rings) {
  if (rings.length <= 1) return rings;
  const areas = rings.map(ringArea);
  const maxA = Math.max(...areas);
  const mainIdx = areas.indexOf(maxA);
  const [mcx, mcy] = ringCentroid(rings[mainIdx]);
  return rings.filter((r, i) => {
    if (i === mainIdx) return true;
    if (areas[i] >= CLIP_AREA_FRAC * maxA) return true;
    const [cx, cy] = ringCentroid(r);
    return Math.hypot(cx - mcx, cy - mcy) <= CLIP_DIST;
  });
}

function perpDist(p, a, b) {
  const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / len2;
  const px = x1 + t * dx, py = y1 + t * dy;
  return Math.hypot(x - px, y - py);
}
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const l = dp(pts.slice(0, idx + 1), eps);
    const r = dp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}
function simplifyRing(r, eps, dec) {
  const f = Math.pow(10, dec);
  return dp(r, eps).map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f]);
}

// Existing colors by code + a generator for new entities
const existingColor = new Map();
const REGIONS = ['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania'];
for (const r of REGIONS) {
  for (const c of read(`data/countries-${r}.json`).countries) {
    if (c.code && c.color) existingColor.set(c.code, c.color);
  }
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const to = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
function colorFor(code) {
  if (existingColor.has(code)) return existingColor.get(code);
  let hash = 0; for (const ch of code) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return hslToHex(Math.abs(hash) % 360, 50, 66);
}

// Build geometry per region
const out = {}; for (const r of REGIONS) out[r] = [];
const stats = { used10: [], skipped: [], wide: [] };

for (const [code, ent] of Object.entries(entities)) {
  if (ent.type === 'aggregate') { stats.skipped.push(`${code}(aggregate)`); continue; }
  const region = REGION_OF[ent.continent];
  if (!region) { stats.skipped.push(`${code}(no-region)`); continue; }

  // TODOS #21: prefer 1:10m for every entity (finer coasts); fall back to 1:50m.
  const f10 = findFeature(idx10, code, ent.name);
  const f50 = findFeature(idx50, code, ent.name);
  const feature = f10 || f50;
  const res = f10 ? '10m' : '50m';
  if (!feature) { stats.skipped.push(`${code}(no-NE)`); continue; }
  if (res === '10m') stats.used10.push(code);

  let rings = clipToMain(projectedRings(feature));
  // simplify each ring with tolerance scaled to its size; always keep the largest
  const withArea = rings.map((r) => ({ r, a: ringArea(r) })).sort((x, y) => y.a - x.a);
  const kept = [];
  for (let i = 0; i < withArea.length; i++) {
    const { r, a } = withArea[i];
    if (i > 0 && a < MIN_RING_AREA) continue; // drop dust (but never the largest)
    const eps = Math.min(DP_EPS, Math.max(0.008, Math.sqrt(a) * 0.05));
    const dec = a < 100 ? 3 : 2; // finer precision (TODOS #24 high-def)
    let s = simplifyRing(r, eps, dec);
    if (s.length < 3 && i === 0) s = r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
    if (s.length >= 3) kept.push(s);
  }
  rings = kept;
  if (!rings.length) { stats.skipped.push(`${code}(empty)`); continue; }

  // sanity: flag still-wide shapes (possible antimeridian leftovers)
  const xs = rings.flat().map((p) => p[0]);
  if (Math.max(...xs) - Math.min(...xs) > 0.6 * W) stats.wide.push(`${code} ${ent.name}`);

  out[region].push({ name: ent.name, code, color: colorFor(code), ...(ent.optional ? { optional: true } : {}), polygons: rings });
}

// Compose files
let totalBytes = 0, totalCountries = 0;
for (const region of REGIONS) {
  const countries = out[region].sort((a, b) => a.name.localeCompare(b.name));
  const pts = countries.flatMap((c) => c.polygons.flat());
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = 20;
  const regionBounds = {
    minX: Math.max(0, Math.floor(Math.min(...xs) - pad)),
    minY: Math.max(0, Math.floor(Math.min(...ys) - pad)),
    maxX: Math.min(W, Math.ceil(Math.max(...xs) + pad)),
    maxY: Math.min(H, Math.ceil(Math.max(...ys) + pad)),
  };
  const data = { projection: 'mercator', canvasSize: [W, H], region: region.replace(/(^|-)([a-z])/g, (m, a, b) => (a ? ' ' : '') + b.toUpperCase()), regionBounds, countries };
  const json = JSON.stringify(data, null, 2) + '\n';
  totalBytes += json.length; totalCountries += countries.length;
  if (WRITE) writeFileSync(`data/countries-${region}.json`, json);
  console.log(`${region}: ${countries.length} countries, ${(json.length / 1024).toFixed(0)} KB`);
}
console.log(`\nTotal: ${totalCountries} countries, ${(totalBytes / 1024).toFixed(0)} KB`);
console.log(`Used 1:10m (${stats.used10.length}): ${stats.used10.join(' ')}`);
console.log(`Skipped (${stats.skipped.length}): ${stats.skipped.join(' ')}`);
console.log(`Still wide / check antimeridian (${stats.wide.length}): ${stats.wide.join(', ') || 'none'}`);
if (!WRITE) console.log('\nDRY RUN — re-run with --write to overwrite data/countries-*.json');
