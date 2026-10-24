// Build data/emblems.json — each country's coat of arms / state emblem (TODOS #31),
// as a Wikimedia Commons filename keyed by ISO code.
//
// Source: Wikidata property P94 (coat of arms image), joined to our codes through P297
// (ISO 3166-1 alpha-2). One SPARQL query rather than 250 calls.
//
// Only the FILENAME is stored. The image is hotlinked from Commons at render time, the
// same arrangement flags already have with flagcdn: nothing is downloaded into the repo,
// so the licensing question that makes state emblems awkward — many are legally
// restricted even where the flag is public domain — never arises here. Commons does not
// host non-free files, so a country whose emblem is restricted simply has no P94 value
// and ends up in the gap list below rather than in this file.
//
// Usage: node scripts/build-emblems.mjs [outPath]
import { readFileSync, writeFileSync } from 'node:fs';
import { SOURCES } from './lib/provenance.mjs';

const OUT = process.argv[2] || 'data/emblems.json';
const ENDPOINT = SOURCES.wikidata.endpoint;
const UA = 'geo-draw-the-world/1.0 (hobby project; github.com/Lolispo/geo-draw-the-world)';

const QUERY = `SELECT ?iso ?coa WHERE {
  ?country wdt:P297 ?iso .
  ?country wdt:P94 ?coa .
}`;

const entities = JSON.parse(readFileSync('data/entities.json', 'utf8')).entities;

const resp = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'User-Agent': UA, Accept: 'text/csv', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ query: QUERY }),
});
if (!resp.ok) throw new Error(`Wikidata: HTTP ${resp.status}`);
const csv = await resp.text();

const rows = csv.trim().split('\n').slice(1)
  .map((line) => {
    const i = line.indexOf(',');
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  })
  .filter(([iso, url]) => iso && url);

// An empty or tiny result means the query broke, not that the world lost its emblems.
if (rows.length < 150) throw new Error(`Wikidata returned only ${rows.length} rows — refusing to ship that`);

const emblems = {};
const unknown = [];
for (const [iso, url] of rows) {
  const code = iso.toLowerCase();
  // ".../Special:FilePath/Coat%20of%20arms%20of%20Finland.svg" -> the filename
  const file = decodeURIComponent(url.split('/Special:FilePath/')[1] || '');
  if (!file) continue;
  if (!entities[code]) { unknown.push(code); continue; }
  // A country can carry more than one P94 (historic variants); first wins, and the
  // sort keeps that choice stable between runs rather than following Wikidata's order.
  if (!emblems[code] || file < emblems[code]) emblems[code] = file;
}

const ordered = Object.fromEntries(Object.keys(emblems).sort().map((k) => [k, emblems[k]]));
writeFileSync(OUT, `${JSON.stringify({ emblems: ordered }, null, 1)}\n`);

const missing = Object.keys(entities).filter((c) => !ordered[c]);
const sovereign = missing.filter((c) => entities[c].type === 'sovereign');
console.log(`${OUT} — ${Object.keys(ordered).length} emblems of ${Object.keys(entities).length} entities`);
console.log(`  no emblem: ${missing.length} (${sovereign.length} sovereign: ${sovereign.map((c) => entities[c].name).join(', ') || 'none'})`);
if (unknown.length) console.log(`  ignored ${unknown.length} ISO codes Wikidata has but the registry does not`);
