// Build data/electricity.json — how each country's electricity is actually generated
// (TODOS #29), from Ember's global electricity data via Our World in Data.
// Usage: node scripts/build-electricity.mjs [outPath]
//
// Source: https://ourworldindata.org/grapher/share-elec-by-source.csv (Ember, CC BY 4.0).
// One CSV, ISO3-coded, with the per-source shares already computed — no API key.
//
// Why Ember and not the CIA Factbook, which we already download: the Factbook's
// "Electricity generation sources" reports *installed capacity*, the nameplate rating
// of the plants a country built. Ember reports *generation*, the electricity actually
// produced. A 1 GW solar farm generates for ~10-20% of the year's hours where a 1 GW
// nuclear plant runs ~90%, so capacity share systematically overstates solar/wind and
// understates nuclear/coal/gas. "This country runs on nuclear" is a claim about
// generation, so generation is what we show.
import { readFile, writeFile } from 'node:fs/promises';

const OUT = process.argv[2] || 'data/electricity.json';
const CSV = 'https://ourworldindata.org/grapher/share-elec-by-source.csv?csvType=full&useColumnShortNames=true';

// Ember carries history back to 1900. Anything older than this is too stale to present
// as "how this country makes electricity" — reported and dropped rather than shown.
const MIN_YEAR = 2015;
// Shares below this are noise on a bar chart; they're folded into the total but not
// given their own row. The panel groups the remainder itself.
const MIN_PCT = 0.05;

// Column suffix -> display name. Order here is the canonical display order for ties.
const SOURCES = [
  ['coal', 'Coal'],
  ['gas', 'Gas'],
  ['oil', 'Oil'],
  ['nuclear', 'Nuclear'],
  ['hydro', 'Hydro'],
  ['wind', 'Wind'],
  ['solar', 'Solar'],
  ['bioenergy', 'Bioenergy'],
  ['other_renewables_excluding_bioenergy', 'Other renewables'],
];
const col = (key) => `${key}_share_of_electricity__pct`;

// Ember/OWID codes that aren't ISO3, or name entities the World Bank has no code for.
// OWID_* is otherwise an aggregate (continents, income groups, the world) — dropped.
const CODE_ALIAS = {
  OWID_KOS: 'xk', // Kosovo — our registry uses the user-assigned xk, as elsewhere
  TWN: 'tw',      // Taiwan — absent from the World Bank list we map ISO3 through
  // Territories Ember reports separately but the World Bank list doesn't carry, so
  // ISO3 -> ISO2 can't resolve them. All standard alpha-3 -> alpha-2 pairs. Without
  // these the Territories toggle would show 10 entities with a suspicious hole.
  COK: 'ck', // Cook Islands
  ESH: 'eh', // Western Sahara
  FLK: 'fk', // Falkland Islands
  GLP: 'gp', // Guadeloupe
  GUF: 'gf', // French Guiana
  MSR: 'ms', // Montserrat
  MTQ: 'mq', // Martinique
  REU: 're', // Réunion
  SHN: 'sh', // Saint Helena
  SPM: 'pm', // Saint Pierre and Miquelon
};

// ---- helpers -------------------------------------------------------------
async function get(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'geo-draw-the-world' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw new Error(`${lastErr.message} for ${url}`);
}

// Minimal RFC 4180 parser. Worth doing properly rather than splitting on commas:
// OWID entity names include "Congo, Dem. Rep." style values, and a naive split
// shifts every later column silently — which would land wrong numbers on countries.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// ---- ISO3 -> our ISO2 ----------------------------------------------------
const entities = JSON.parse(await readFile('data/entities.json', 'utf8')).entities;

console.log('Fetching World Bank country list for ISO3 -> ISO2…');
const wb = JSON.parse(await get('https://api.worldbank.org/v2/country?format=json&per_page=400'))[1];
const iso2ByIso3 = new Map();
for (const c of wb) {
  if (!c.region || c.region.value === 'Aggregates') continue;
  if (!c.id || !c.iso2Code) continue;
  iso2ByIso3.set(c.id.toUpperCase(), c.iso2Code.toLowerCase());
}
for (const [iso3, iso2] of Object.entries(CODE_ALIAS)) iso2ByIso3.set(iso3, iso2);

// ---- read + reduce -------------------------------------------------------
console.log('Fetching Ember electricity mix…');
const rows = parseCsv(await get(CSV));
console.log(`${rows.length} rows.`);

// Latest year per source code.
const latest = new Map();
for (const r of rows) {
  const code = (r.code || '').trim();
  if (!code) continue;                                   // aggregates ("EU (Ember)") carry no code
  if (code.startsWith('OWID_') && !CODE_ALIAS[code]) continue; // OWID_* aggregates
  const year = parseInt(r.year, 10);
  if (!Number.isFinite(year)) continue;
  const prev = latest.get(code);
  if (!prev || year > prev.year) latest.set(code, { year, row: r });
}

const electricity = {};
const provenance = {};
const unmatched = [];
const stale = [];
let matched = 0;

for (const [iso3, { year, row }] of latest) {
  const code = iso2ByIso3.get(iso3.toUpperCase());
  if (!code) { unmatched.push(`${iso3} (${row.entity})`); continue; }
  if (!entities[code]) { unmatched.push(`${iso3} -> ${code}, not in our registry (${row.entity})`); continue; }
  if (year < MIN_YEAR) { stale.push(`${code} ${row.entity}: latest ${year}`); continue; }

  const sources = [];
  for (const [key, name] of SOURCES) {
    const raw = row[col(key)];
    if (raw === '' || raw == null) continue;
    const pct = parseFloat(raw);
    if (!Number.isFinite(pct) || pct < MIN_PCT) continue;
    sources.push({ name, pct: Math.round(pct * 10) / 10 });
  }
  if (!sources.length) continue;

  sources.sort((a, b) => b.pct - a.pct);
  electricity[code] = { year, sources };
  provenance[code] = `Ember via Our World in Data (${year}), share of electricity generated`;
  matched++;
}

// ---- write + report ------------------------------------------------------
const sorted = {};
for (const code of Object.keys(electricity).sort()) sorted[code] = electricity[code];
await writeFile(OUT, JSON.stringify({ electricity: sorted, provenance }, null, 2) + '\n');

console.log(`\nWrote ${matched} entities to ${OUT}`);

// A share set that doesn't total ~100 means a column was missed or misparsed.
const offTotal = Object.entries(sorted)
  .map(([c, e]) => [c, e.sources.reduce((s, x) => s + x.pct, 0)])
  .filter(([, t]) => Math.abs(t - 100) > 2);
console.log(`Shares totalling outside 100±2%: ${offTotal.length}`);
if (offTotal.length) console.log('  ' + offTotal.map(([c, t]) => `${c} ${t.toFixed(1)}%`).join(', '));

if (stale.length) {
  console.log(`\nDropped as stale (latest year < ${MIN_YEAR}) (${stale.length}):`);
  console.log('  ' + stale.sort().join('\n  '));
}
if (unmatched.length) {
  console.log(`\nEmber codes we could NOT map to an entity (${unmatched.length}):`);
  console.log('  ' + unmatched.sort().join('\n  '));
}
const ourMissing = Object.keys(entities).filter((c) => !sorted[c] && entities[c].type === 'sovereign').sort();
console.log(`\nSovereign entities with NO electricity data (${ourMissing.length}):`);
console.log('  ' + ourMissing.join(', '));
