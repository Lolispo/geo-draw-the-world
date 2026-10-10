// Build data/shapes.json — per-country outlines at NATIVE resolution (TODOS #24).
// The world geometry (countries-*.json) squeezes everything into 1600x1100, so
// microstates become sub-pixel blobs (Natural Earth also only has ~17 pts for San
// Marino). This tier is sourced from geoBoundaries (OSM-derived, CC BY 4.0 — needs
// attribution), whose full release carries 929 pts for San Marino, with Natural Earth
// 1:10m as fallback.
// Each country is normalized to its OWN ~1000px box + simplified at that scale, so it
// keeps full detail. Used by the showcase panel / peek / compare (single-country views).
//
// Usage: node scripts/build-shapes.mjs [code...]   (codes = rebuild only those,
// leaving every other file in data/shapes/ untouched; no args = full rebuild)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { source } from './lib/sources.mjs';

const NORM = 1000, DP_EPS = 0.35, CLIP_DEG = 15, CLIP_AREA_FRAC = 0.35, MIN_RING_FRAC = 0.0008;
const CONCURRENCY = 12;
// github.com/.../raw resolves Git LFS (raw.githubusercontent serves only LFS pointers).
const GB = 'https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen';
// geoBoundaries publishes each boundary twice, and neither variant is right on its own.
// `_simplified` is small but pre-thinned, and for a microstate it — not our own
// Douglas-Peucker pass — decides the outcome: San Marino arrives with 52 vertices where
// the full release has 929. The full release is the opposite problem: Norway is 54 MB and
// yields 18 more points than the simplified one, because once DP is the binding
// constraint a finer source changes nothing.
// So take the cheap file first, and only re-fetch the full one when the local simplify
// barely removed anything — the signature of a source too thin to simplify. Below that
// retention, DP is already in charge and the big download would buy nothing.
// REFETCH_UNDER is the backstop for a source thin enough that DP can still shave a third
// off it and remain the lesser constraint (St Helena: 60 vertices in, 39 out). An outline
// that small is not a detailed one by definition, and it is always a cheap file to check.
const REFETCH_RETENTION = 0.8;
const REFETCH_UNDER = 500;

const entities = JSON.parse(readFileSync('data/entities.json', 'utf8')).entities;
const ml = await source('mledoze.json');
const iso3 = new Map(ml.filter((c) => c.cca2 && c.cca3).map((c) => [c.cca2.toLowerCase(), c.cca3]));
iso3.set('xk', 'XKX'); // geoBoundaries uses XKX for Kosovo (mledoze says UNK)
const ne10 = await source('ne10.geojson');
// Same two extra Natural Earth layers build-geometry.mjs uses: map units carry the
// dependencies admin_0_countries folds into a parent, disputed areas carry the
// de-facto states (TODOS #20).
const neUnits = await source('ne10_units.geojson');
const neDisputed = await source('ne10_disputed.geojson');
const unitByCode = new Map();
for (const f of neUnits.features) {
  const c = (f.properties.ISO_A2_EH || f.properties.ISO_A2 || '').toLowerCase();
  if (c && c !== '-99' && !unitByCode.has(c)) unitByCode.set(c, f);
}
// Keyed on BRK_NAME only — a disputed area's NAME is the state claiming it.
const DISPUTED_BRK = { xc: 'N. Cyprus', xa: 'Abkhazia', xo: 'South Ossetia', xt: 'Transnistria' };
const disputedByBrk = new Map(neDisputed.features.map((f) => [f.properties.BRK_NAME, f]));

// Rebuild just these codes when given, so a one-entity fix doesn't rewrite all 243.
const ONLY = new Set(process.argv.slice(2).filter((a) => /^[a-z]{2}$/.test(a)));

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
const proj = (lon, lat) => [lon, -mercY(lat) * 180 / Math.PI];
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');

// Natural Earth fallback index
const neByCode = new Map(), neByName = new Map();
for (const f of ne10.features) {
  const c = (f.properties.ISO_A2_EH || f.properties.ISO_A2 || '').toLowerCase();
  if (c && c !== '-99' && !neByCode.has(c)) neByCode.set(c, f);
  for (const k of ['NAME', 'NAME_LONG', 'ADMIN', 'SOVEREIGNT']) { const n = norm(f.properties[k]); if (n && !neByName.has(n)) neByName.set(n, f); }
}

async function getJson(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'geo-draw' }, redirect: 'follow' });
    if (!r.ok) return null;
    const t = await r.text();
    if (t.startsWith('version ')) return null; // unresolved Git LFS pointer
    return JSON.parse(t);
  } catch { return null; }
}
function ringsOf(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  return polys.map((poly) => poly[0].map(([lon, lat]) => proj(lon, lat)));
}
const area = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1]; return Math.abs(a/2); };
function centroid(r){let a=0,cx=0,cy=0;for(let i=0;i<r.length-1;i++){const cr=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];a+=cr;cx+=(r[i][0]+r[i+1][0])*cr;cy+=(r[i][1]+r[i+1][1])*cr;}a*=0.5;if(Math.abs(a)<1e-9){let x=0,y=0;for(const p of r){x+=p[0];y+=p[1];}return[x/r.length,y/r.length];}return[cx/(6*a),cy/(6*a)];}
function clipMain(rings){if(rings.length<=1)return rings;const A=rings.map(area),mA=Math.max(...A),mi=A.indexOf(mA);const[mx,my]=centroid(rings[mi]);return rings.filter((r,i)=>i===mi||A[i]>=CLIP_AREA_FRAC*mA||Math.hypot(...(()=>{const[a,b]=centroid(r);return[a-mx,b-my];})())<=CLIP_DEG);}
function perp(p,a,b){const[x,y]=p,[x1,y1]=a,[x2,y2]=b;const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;if(!l)return Math.hypot(x-x1,y-y1);const t=((x-x1)*dx+(y-y1)*dy)/l;return Math.hypot(x-(x1+t*dx),y-(y1+t*dy));}
function dp(pts,eps){if(pts.length<3)return pts;let dm=0,idx=0;for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],pts[0],pts[pts.length-1]);if(d>dm){dm=d;idx=i;}}if(dm>eps)return dp(pts.slice(0,idx+1),eps).slice(0,-1).concat(dp(pts.slice(idx),eps));return[pts[0],pts[pts.length-1]];}

function processRings(rings) {
  rings = clipMain(rings);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const r of rings) for (const [x,y] of r){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  const w=maxX-minX||1,h=maxY-minY||1,sc=NORM/Math.max(w,h),largest=Math.max(...rings.map(area));
  const out=[];
  for (const {r,a} of rings.map((r)=>({r,a:area(r)})).sort((p,q)=>q.a-p.a)) {
    if (out.length>0 && a<MIN_RING_FRAC*largest) continue;
    const scaled=r.map(([x,y])=>[(x-minX)*sc,(y-minY)*sc]);
    let s=dp(scaled,DP_EPS).map(([x,y])=>[Math.round(x*10)/10,Math.round(y*10)/10]);
    if (s.length<3 && out.length===0) s=scaled.map(([x,y])=>[Math.round(x*10)/10,Math.round(y*10)/10]);
    if (s.length>=3) out.push(s);
  }
  return out;
}

const codes = Object.keys(entities)
  .filter((c) => entities[c].type !== 'aggregate')
  .filter((c) => !ONLY.size || ONLY.has(c));
const shapes = {};
const src = { 'gb-full': 0, 'gb-simplified': 0, ne: 0, none: [] };
const count = (mp) => mp.reduce((t, r) => t + r.length, 0);
const gbUrl = (i3, variant) => `${GB}/${i3}/ADM0/geoBoundaries-${i3}-ADM0${variant}.geojson`;
const geomOf = async (url) => (await getJson(url))?.features?.[0]?.geometry ?? null;

// Returns the better of the two geoBoundaries variants — see REFETCH_RETENTION above.
async function fromGeoBoundaries(i3) {
  const sg = await geomOf(gbUrl(i3, '_simplified'));
  if (!sg) {
    const fg = await geomOf(gbUrl(i3, ''));
    return fg ? { out: processRings(ringsOf(fg)), from: 'gb-full' } : null;
  }
  const sRings = ringsOf(sg);
  const sOut = processRings(sRings);
  const simplified = { out: sOut, from: 'gb-simplified' };
  const retained = count(sOut) / sRings.reduce((t, r) => t + r.length, 0);
  if (retained < REFETCH_RETENTION && count(sOut) >= REFETCH_UNDER) return simplified;

  const fg = await geomOf(gbUrl(i3, ''));
  if (!fg) return simplified;
  const fOut = processRings(ringsOf(fg));
  // Never trade detail away. The full release can carry islands the simplified one
  // drops, which moves the normalising bounding box and can shrink the main landmass.
  return count(fOut) > count(sOut) ? { out: fOut, from: 'gb-full' } : simplified;
}

let next = 0;
async function worker() {
  while (next < codes.length) {
    const code = codes[next++];
    const ent = entities[code];
    const i3 = iso3.get(code);
    let got = i3 ? await fromGeoBoundaries(i3) : null;
    if (!got) {
      const f = neByCode.get(code) || neByName.get(norm(ent.name))
        || unitByCode.get(code) || disputedByBrk.get(DISPUTED_BRK[code]);
      if (f) got = { out: processRings(ringsOf(f.geometry)), from: 'ne' };
    }
    if (!got) { src.none.push(code); continue; }
    if (got.out.length) { shapes[code] = { polygons: got.out, src: got.from }; src[got.from]++; }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Colors from the world geometry, so the panel doesn't need to load it.
const colorByCode = new Map();
for (const region of ['africa','europe','asia','north-america','south-america','oceania']) {
  for (const c of JSON.parse(readFileSync(`data/countries-${region}.json`, 'utf8')).countries) {
    if (c.code && c.color) colorByCode.set(c.code, c.color);
  }
}

// Per-country files (data/shapes/{code}.json) so the panel/peek loads only the one
// country it shows (~a few KB) instead of one ~1.5 MB blob.
if (!ONLY.size) rmSync('data/shapes', { recursive: true, force: true });
mkdirSync('data/shapes', { recursive: true });
for (const [code, { polygons, src: from }] of Object.entries(shapes)) {
  // `src` records which tier won, so the shipped data can be audited without
  // re-running this build (data-map.html reads it).
  writeFileSync(`data/shapes/${code}.json`,
    JSON.stringify({ color: colorByCode.get(code) || '#7EA6E0', src: from, polygons }));
}
const pts = Object.values(shapes).reduce((s, { polygons }) => s + count(polygons), 0);
console.log(`Wrote ${Object.keys(shapes).length} per-country files to data/shapes/ ` +
  `(${src['gb-full']} geoBoundaries full, ${src['gb-simplified']} geoBoundaries simplified, ` +
  `${src.ne} Natural Earth), ${pts.toLocaleString()} points`);
console.log(`No shape: ${src.none.join(' ') || 'none'}`);
for (const c of ['sm','mc','sg','va','li','fr','jp']) if (shapes[c]) console.log(`  ${c}: ${count(shapes[c].polygons)} pts (${shapes[c].src})`);
