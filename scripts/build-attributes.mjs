// Build data/attributes.json (capital + religion breakdown) from the CIA World
// Factbook (public domain), name-matched to the canonical entity registry.
// Usage: node scripts/build-attributes.mjs [outPath]
//
// Source: https://github.com/factbook/factbook.json (per-country JSON, GEC-coded).
// We don't rely on the GEC code — we match Factbook's country name to our
// entities' display names (with a small alias table), and report anything
// unmatched so gaps are explicit (mirrors the datasets provenance approach).
import { readFile, writeFile } from 'node:fs/promises';

const OUT = process.argv[2] || 'data/attributes.json';
const CONCURRENCY = 16;
const RAW = 'https://raw.githubusercontent.com/factbook/factbook.json/master';
const TREE = 'https://api.github.com/repos/factbook/factbook.json/git/trees/master?recursive=1';

// ---- helpers -------------------------------------------------------------
async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'geo-draw-the-world' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw new Error(`${lastErr.message} for ${url}`);
}

async function pool(items, worker, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = await worker(items[i], i); }
      catch { results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

const strip = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[.,'’()]/g, ' ')
  .replace(/\band\b|&/g, ' ')
  .replace(/\bthe\b/g, ' ')
  .replace(/\bsaint\b/g, 'st')
  .replace(/\s+/g, ' ').trim();

// Comma-flip "Korea, South" -> "South Korea"
function flip(name) {
  const m = name.match(/^(.+?),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : name;
}

// Decode the HTML entities Factbook leaves in some names/text (e.g. "C&ocirc;te").
const decodeEnt = (s) => (s || '')
  .replace(/&([a-zA-Z])(?:acute|grave|circ|uml|tilde|ring|cedil|slash);/g, '$1')
  .replace(/&amp;/g, '&')
  .replace(/&#39;|&rsquo;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ');

// Factbook name -> our entity display name (only where normalization can't bridge).
// Targets MUST match the display names in data/entities.json.
const NAME_ALIAS = {
  'burma': 'Myanmar',
  'korea, south': 'South Korea',
  'korea, north': 'North Korea',
  'drc': 'DR Congo',
  'congo, democratic republic of the': 'DR Congo',
  'congo (brazzaville)': 'Congo',
  'congo, republic of the': 'Congo',
  "cote d'ivoire": 'Ivory Coast',
  'czechia': 'Czech Republic',
  'holy see (vatican city)': 'Vatican City',
  'gambia, the': 'Gambia',
  'bahamas, the': 'Bahamas',
  'turkey (turkiye)': 'Turkey',
  'federated states of micronesia': 'Micronesia',
  'micronesia, federated states of': 'Micronesia',
  'hong kong': 'Hong Kong SAR, China',
  'macau': 'Macao SAR, China',
  'puerto rico': 'Puerto Rico (US)',
  'saint martin': 'St. Martin (French part)',
  'sint maarten': 'Sint Maarten (Dutch part)',
  'saint vincent and the grenadines': 'Saint Vincent',
  'virgin islands': 'Virgin Islands (U.S.)',
  'falkland islands (islas malvinas)': 'Falkland Islands',
  'west bank': 'West Bank and Gaza',
  'the dominican': 'Dominican Republic',
};

// ---- religion parsing ----------------------------------------------------
// "Roman Catholic 47%, Muslim 4%, ... none 33%, unspecified 9% (2021 est.)"
function parseReligion(text) {
  if (!text) return { list: [], raw: '' };
  // cut trailing "(2021 est.)" / notes after " - " or "note:"
  let t = text.replace(/\((?:\d{4}[^)]*|[^)]*est\.[^)]*)\)/g, '');
  t = t.split(/\bnote:/i)[0];
  const list = [];
  const re = /([A-Za-z][A-Za-z .'\/&-]*?)\s*(?:<\s*)?(\d+(?:\.\d+)?)\s*%/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const name = m[1].replace(/^[\s,;/]+|[\s,;/]+$/g, '').replace(/\s+/g, ' ');
    const pct = parseFloat(m[2]);
    if (name && name.length <= 40) list.push({ name, pct });
  }
  return { list, raw: text.trim() };
}

function cleanCapital(text) {
  if (!text) return { capital: null, note: null };
  const raw = decodeEnt(text).trim();
  // primary = first segment before ';' , drop parenthetical notes
  const primary = raw.split(';')[0].replace(/\([^)]*\)/g, '').trim();
  const note = /;|\(/.test(raw) ? raw : null;
  return { capital: primary || null, note };
}

// ---- load our entities ---------------------------------------------------
const entities = JSON.parse(await readFile('data/entities.json', 'utf8')).entities;
const byNorm = new Map();       // normalized display name -> code
const codeByName = {};
for (const [code, e] of Object.entries(entities)) {
  byNorm.set(strip(e.name), code);
  codeByName[code] = e.name;
}
function matchCode(fbName) {
  const aliased = NAME_ALIAS[fbName.toLowerCase()] || fbName;
  return byNorm.get(strip(aliased)) || byNorm.get(strip(flip(aliased))) || null;
}

// ---- discover + fetch factbook files ------------------------------------
console.log('Listing Factbook files…');
const tree = await getJson(TREE);
const paths = tree.tree
  .map((n) => n.path)
  .filter((p) => /^[a-z-]+\/[a-z]{2}\.json$/.test(p) && !p.startsWith('meta') && !p.startsWith('world'));
console.log(`Fetching ${paths.length} country files…`);

const attributes = {};
const provenance = {};
const unmatchedFb = [];
let matched = 0;

const files = await pool(paths, async (p) => {
  const d = await getJson(`${RAW}/${p}`).catch(() => null);
  return d ? { p, d } : null;
});

for (const f of files) {
  if (!f) continue;
  const { d } = f;
  const gov = d.Government || {};
  const cname = gov['Country name'] || {};
  const shortForm = cname['conventional short form']?.text;
  const longForm = cname['conventional long form']?.text;
  // Some entries have short form "none" (e.g. UAE) — fall back to the long form.
  const rawName = (shortForm && shortForm.toLowerCase() !== 'none') ? shortForm
    : (longForm && longForm.toLowerCase() !== 'none') ? longForm
    : null;
  if (!rawName) continue;
  const fbName = decodeEnt(rawName);

  const code = matchCode(fbName);
  if (!code) { unmatchedFb.push(fbName); continue; }

  const { capital, note } = cleanCapital(gov.Capital?.name?.text);
  const rel = parseReligion(decodeEnt(d['People and Society']?.Religions?.text));

  const entry = {};
  if (capital) entry.capital = capital;
  if (note) entry.capitalNote = note;
  if (rel.list.length) { entry.religion = rel.list; entry.religionRaw = rel.raw; }
  if (Object.keys(entry).length) {
    attributes[code] = entry;
    provenance[code] = 'CIA World Factbook (public domain)';
    matched++;
  }
}

// Manual backfill for entities Factbook lists without a conventional name
// (disputed/de-facto). Gap-fill only. Sources noted in provenance.
const MANUAL_ATTR = {
  eh: { capital: 'El Aaiún', religion: [{ name: 'Muslim', pct: 100 }],
        src: 'CIA World Factbook (Western Sahara) — Sunni Muslim' },
  ps: { capital: 'Ramallah', capitalNote: 'Ramallah (seat of government); East Jerusalem claimed as capital',
        religion: [{ name: 'Muslim', pct: 93 }, { name: 'Jewish', pct: 5 }, { name: 'Christian', pct: 1 }],
        src: 'CIA World Factbook (West Bank / Gaza Strip)' },
  xs: { capital: 'Hargeisa', religion: [{ name: 'Muslim', pct: 100 }],
        src: 'Somaliland government (de-facto state) — Sunni Muslim' },
};
for (const [code, m] of Object.entries(MANUAL_ATTR)) {
  if (!entities[code] || attributes[code]) continue; // gap-fill only
  const entry = {};
  if (m.capital) entry.capital = m.capital;
  if (m.capitalNote) entry.capitalNote = m.capitalNote;
  if (m.religion) entry.religion = m.religion;
  attributes[code] = entry;
  provenance[code] = m.src;
  matched++;
}

// ---- write + report ------------------------------------------------------
const sorted = {};
for (const code of Object.keys(attributes).sort()) sorted[code] = attributes[code];
await writeFile(OUT, JSON.stringify({ attributes: sorted, provenance }, null, 2) + '\n');

console.log(`\nWrote ${matched} entities to ${OUT}`);
const withCap = Object.values(sorted).filter((e) => e.capital).length;
const withRel = Object.values(sorted).filter((e) => e.religion).length;
console.log(`  capital: ${withCap}  |  religion: ${withRel}`);

const ourMissing = Object.keys(entities).filter((c) => !attributes[c]).sort();
console.log(`\nOur entities with NO attributes (${ourMissing.length}):`);
console.log('  ' + ourMissing.map((c) => `${c}(${codeByName[c]})`).join(', '));
console.log(`\nFactbook names we could NOT match (${unmatchedFb.length}):`);
console.log('  ' + unmatchedFb.sort().join(', '));
