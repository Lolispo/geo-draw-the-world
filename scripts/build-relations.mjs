// Build data/relations.json — who each country sells to and buys from (TODOS #30) —
// from the CIA World Factbook (public domain).
// Usage: node scripts/build-relations.mjs [outPath]
//
// Source: https://github.com/factbook/factbook.json, Economy -> "Exports - partners"
// and "Imports - partners". Both are published as one sentence of top-five shares:
//   "Germany 10%, USA 10%, Denmark 8%, Norway 6%, Netherlands 5% (2023)"
//
// This is the first country->country data we carry, so partner names have to resolve
// to our ISO2 codes or the rows are dead text. They resolve through the shared matcher
// plus data/aliases.json, because the Factbook writes partners in shorthand the
// registry does not use — "USA", "S. Korea", "NZ", "UAE".
import { readFile, writeFile } from 'node:fs/promises';
import { decodeEnt, makeMatcher } from './lib/names.mjs';
import { SOURCES } from './lib/provenance.mjs';

const OUT = process.argv[2] || 'data/relations.json';
const CONCURRENCY = 16;
const RAW = SOURCES.factbook.endpoint;
const TREE = SOURCES.factbook.tree;

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

// ---- parsing -------------------------------------------------------------
// Returns { partners: [{ name, pct|null, code|null }], year|null }.
//
// A few entries are prose rather than a share list — Monaco is "<p>Italy, Switzerland,
// Germany, Belgium, Spain</p>". Those keep their names and carry no pct, the same way
// an unquantified religion does (TODOS #52), so the panel can say the shares are
// missing rather than invent a denominator.
function parsePartners(text, matchCode) {
  if (!text) return null;
  const raw = decodeEnt(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const yearMatch = raw.match(/\((\d{4})\)\s*$/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  let body = yearMatch ? raw.slice(0, yearMatch.index) : raw;
  // Drop a trailing note the way the attributes build does — "note - ..." is commentary,
  // not a partner.
  body = body.split(/\bnote\s*[-:]/i)[0];

  const partners = [];
  for (const seg of splitPartners(body)) {
    // "Germany 10%" | "almost entirely United Kingdom" | "Italy"
    const m = seg.match(/^(.*?)\s*([\d.]+)\s*%$/);
    let name = (m ? m[1] : seg).trim();
    // The Factbook sometimes qualifies a single dominant partner in prose. The country
    // is the fact; the adverb is not, and it is what stops the name resolving.
    name = name.replace(/^(?:almost\s+entirely|mainly|mostly|primarily|chiefly)\s+/i, '').trim();
    name = name.replace(/^[\s,;]+|[\s,;.]+$/g, '');
    if (!name || name.length > 60) continue;
    const pct = m ? parseFloat(m[2]) : null;
    partners.push({ name, pct, code: matchCode(name) });
  }
  return partners.length ? { partners, year } : null;
}

// Split on commas, except the ones inside an inverted country name. "Congo, Republic of
// the" and "Gambia, The" are single partners that a plain split tears into a country and
// a fragment — which is how "Republic of the" ended up looking like an unmatched partner.
const COMMA_TAIL = /^\s*(?:the|republic of the|democratic republic of the|islamic republic of|federated states of|south|north)\s*$/i;
function splitPartners(body) {
  const out = [];
  for (const seg of body.split(',')) {
    // The share sits on the end of the *whole* name, so the tail of an inverted one
    // arrives as "The 13%". Test the words without it, or "Bahamas, The 13%" splits
    // into a share-less "Bahamas" and an unmatchable "The" — two rows for one partner.
    const words = seg.replace(/\s*[\d.]+\s*%\s*$/, '');
    if (out.length && COMMA_TAIL.test(words)) out[out.length - 1] += `,${seg}`;
    else out.push(seg);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

// ---- build ---------------------------------------------------------------
const entities = JSON.parse(await readFile('data/entities.json', 'utf8')).entities;
const aliases = JSON.parse(await readFile('data/aliases.json', 'utf8')).aliases;
const matchCode = makeMatcher(entities, { aliases });

console.log('Listing Factbook files…');
const tree = await getJson(TREE);
const paths = tree.tree
  .map((n) => n.path)
  .filter((p) => /^[a-z-]+\/[a-z]{2}\.json$/.test(p) && !p.startsWith('meta') && !p.startsWith('world'));
console.log(`Fetching ${paths.length} country files…`);

const files = await pool(paths, async (p) => {
  const d = await getJson(`${RAW}/${p}`).catch(() => null);
  return d ? { p, d } : null;
});

const relations = {};
const provenance = {};
const unmatchedOwner = [];   // Factbook country names we have no entity for
const unmatchedPartner = new Map(); // partner name -> how many lists it appears in

for (const f of files) {
  if (!f) continue;
  const { d } = f;
  const cname = d.Government?.['Country name'] || {};
  const shortForm = cname['conventional short form']?.text;
  const longForm = cname['conventional long form']?.text;
  const rawName = (shortForm && shortForm.toLowerCase() !== 'none') ? shortForm
    : (longForm && longForm.toLowerCase() !== 'none') ? longForm
    : null;
  if (!rawName) continue;

  const ec = d.Economy || {};
  const ex = parsePartners(ec['Exports - partners']?.text, matchCode);
  const im = parsePartners(ec['Imports - partners']?.text, matchCode);
  if (!ex && !im) continue;

  const code = matchCode(rawName);
  if (!code) { unmatchedOwner.push(decodeEnt(rawName)); continue; }

  const entry = {};
  if (ex) {
    entry.exportPartners = ex.partners;
    if (ex.year) entry.exportYear = ex.year;
    entry.exportRaw = decodeEnt(ec['Exports - partners'].text).trim();
  }
  if (im) {
    entry.importPartners = im.partners;
    if (im.year) entry.importYear = im.year;
    entry.importRaw = decodeEnt(ec['Imports - partners'].text).trim();
  }
  relations[code] = entry;
  provenance[code] = 'CIA World Factbook (public domain)';

  for (const p of [...(ex?.partners || []), ...(im?.partners || [])]) {
    if (!p.code) unmatchedPartner.set(p.name, (unmatchedPartner.get(p.name) || 0) + 1);
  }
}

const sorted = {};
for (const code of Object.keys(relations).sort()) sorted[code] = relations[code];
await writeFile(OUT, JSON.stringify({ relations: sorted, provenance }, null, 2) + '\n');

// ---- report --------------------------------------------------------------
const entries = Object.values(sorted);
const rows = entries.reduce((n, e) => n + (e.exportPartners?.length || 0) + (e.importPartners?.length || 0), 0);
const linked = entries.reduce((n, e) => n
  + (e.exportPartners || []).filter((p) => p.code).length
  + (e.importPartners || []).filter((p) => p.code).length, 0);
console.log(`\nWrote ${Object.keys(sorted).length} entities to ${OUT}`);
console.log(`  export lists: ${entries.filter((e) => e.exportPartners).length}`
  + `  |  import lists: ${entries.filter((e) => e.importPartners).length}`);
console.log(`  partner rows: ${rows}  |  resolved to a code: ${linked} (${(linked / rows * 100).toFixed(1)}%)`);

// A partner name that does not resolve is a dead row in the panel — never clickable,
// never counted in the reciprocal index. Report every one; they are the whole
// maintenance surface of this build.
if (unmatchedPartner.size) {
  console.log(`\nPartner names we could NOT match (${unmatchedPartner.size}):`);
  for (const [name, n] of [...unmatchedPartner].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name} ×${n}`);
  }
} else {
  console.log('\nEvery partner name resolved to a code.');
}
if (unmatchedOwner.length) {
  console.log(`\nFactbook countries with trade data but no entity of ours (${unmatchedOwner.length}):`);
  console.log('  ' + unmatchedOwner.sort().join(', '));
}
const ourMissing = Object.keys(entities).filter((c) => !sorted[c]).sort();
console.log(`\nOur entities with NO trade data (${ourMissing.length}):`);
console.log('  ' + ourMissing.map((c) => `${c}(${entities[c].name})`).join(', '));
