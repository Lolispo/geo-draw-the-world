// Unify the data layer (TODOS item 5).
// - Adds ISO 3166-1 alpha-2 `code` to every geometry entry in countries-{region}.json
// - Builds data/entities.json: a canonical registry keyed by code
//   (name, type, continent, hasGeometry, hasFlag, region, metrics coverage)
// - Reconciles datasets.json display names to the common-name form
//
// Usage: node scripts/build-entities.mjs [--write]   (default: dry report)
import { readFileSync, writeFileSync } from 'node:fs';

const WRITE = process.argv.includes('--write');
const REGIONS = ['africa', 'europe', 'asia', 'north-america', 'south-america', 'oceania'];
const REGION_CONTINENT = {
  africa: 'Africa', europe: 'Europe', asia: 'Asia',
  'north-america': 'North America', 'south-america': 'South America', oceania: 'Oceania',
};
const METRIC_IDS = ['gdp-nominal', 'population', 'gdp-per-capita', 'land-area', 'life-expectancy', 'exports', 'urbanization'];

// Geometry names that don't normalize-match a flag/stat name → explicit ISO code.
const NAME_OVERRIDE = {
  'Democratic Republic of the Congo': 'cd',
  'Republic of the Congo': 'cg',
  'Western Sahara': 'eh',
  'Falkland Islands': 'fk',
  'Somaliland': 'xs', // user-assigned ISO range; de-facto state, no official ISO/flag
};

// Entities that exist in Natural Earth geometry + flagcdn but have no WB/flags data
// source to bootstrap them into the registry (TODOS #20). Seeded here.
// `optional: true` => gated behind the "include territories" toggle; false => main pool.
const EXTRA_ENTITIES = {
  va: { name: 'Vatican City', continent: 'Europe', region: 'europe', optional: false },
  ai: { name: 'Anguilla', continent: 'North America', region: 'north-america', optional: true },
  ax: { name: 'Åland Islands', continent: 'Europe', region: 'europe', optional: true },
  ck: { name: 'Cook Islands', continent: 'Oceania', region: 'oceania', optional: true },
  gg: { name: 'Guernsey', continent: 'Europe', region: 'europe', optional: true },
  je: { name: 'Jersey', continent: 'Europe', region: 'europe', optional: true },
  ms: { name: 'Montserrat', continent: 'North America', region: 'north-america', optional: true },
  nu: { name: 'Niue', continent: 'Oceania', region: 'oceania', optional: true },
  nf: { name: 'Norfolk Island', continent: 'Oceania', region: 'oceania', optional: true },
  pn: { name: 'Pitcairn Islands', continent: 'Oceania', region: 'oceania', optional: true },
  bl: { name: 'Saint Barthélemy', continent: 'North America', region: 'north-america', optional: true },
  sh: { name: 'Saint Helena', continent: 'Africa', region: 'africa', optional: true },
  pm: { name: 'Saint Pierre and Miquelon', continent: 'North America', region: 'north-america', optional: true },
  wf: { name: 'Wallis and Futuna', continent: 'Oceania', region: 'oceania', optional: true },
  io: { name: 'British Indian Ocean Territory', continent: 'Africa', region: 'africa', optional: true },
  tf: { name: 'French Southern Territories', continent: 'Africa', region: 'africa', optional: true },
  // Tier 2 (no Natural Earth geometry — data-only: flag + capital). TODOS #20.
  gp: { name: 'Guadeloupe', continent: 'North America', region: 'north-america', optional: true },
  mq: { name: 'Martinique', continent: 'North America', region: 'north-america', optional: true },
  gf: { name: 'French Guiana', continent: 'South America', region: 'south-america', optional: true },
  re: { name: 'Réunion', continent: 'Africa', region: 'africa', optional: true },
  yt: { name: 'Mayotte', continent: 'Africa', region: 'africa', optional: true },
  bq: { name: 'Caribbean Netherlands', continent: 'North America', region: 'north-america', optional: true },
  gs: { name: 'South Georgia', continent: 'South America', region: 'south-america', optional: true },
};

// Sovereign/administering country for dependent territories (shown in the panel).
// Disputed/de-facto entities (ps, eh, xs) intentionally omitted.
const SOVEREIGN_OF = {
  nc: 'France', pf: 'France', wf: 'France', yt: 'France', re: 'France', bl: 'France',
  pm: 'France', tf: 'France', gp: 'France', mq: 'France', gf: 'France', mf: 'France',
  gi: 'United Kingdom', im: 'United Kingdom', je: 'United Kingdom', gg: 'United Kingdom',
  bm: 'United Kingdom', ky: 'United Kingdom', tc: 'United Kingdom', ai: 'United Kingdom',
  vg: 'United Kingdom', fk: 'United Kingdom', ms: 'United Kingdom', pn: 'United Kingdom',
  sh: 'United Kingdom', io: 'United Kingdom', gs: 'United Kingdom',
  pr: 'United States', vi: 'United States', gu: 'United States', mp: 'United States', as: 'United States',
  aw: 'Netherlands', cw: 'Netherlands', sx: 'Netherlands', bq: 'Netherlands',
  gl: 'Denmark', fo: 'Denmark',
  hk: 'China', mo: 'China',
  ck: 'New Zealand', nu: 'New Zealand', tk: 'New Zealand',
  nf: 'Australia',
  ax: 'Finland',
};

// type classification (informational; does NOT gate gameplay — all entities are playable)
const AGGREGATES = new Set(['jg']); // Channel Islands = Jersey+Guernsey aggregate (World Bank)
const TERRITORIES = new Set([
  'gl', 'nc', 'hk', 'mo', 'pr', 'vi', 'vg', 'fo', 'gi', 'im', 'je', 'gg', 'bm', 'ky',
  'aw', 'cw', 'sx', 'pf', 'gu', 'mp', 'as', 'tc', 'ai', 'ck', 'nu', 'tk', 'wf', 'yt',
  're', 'ps', 'eh', 'fk',
  'ax', 'ms', 'nf', 'pn', 'bl', 'sh', 'pm', 'io', 'tf', // TODOS #20 additions (va stays sovereign)
  'gp', 'mq', 'gf', 're', 'yt', 'bq', 'gs',             // TODOS #20 Tier 2 (data-only)
]);
function classify(code) {
  if (AGGREGATES.has(code)) return 'aggregate';
  if (TERRITORIES.has(code)) return 'territory';
  return 'sovereign';
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const flags = read('data/flags.json').flags;
const datasets = read('data/datasets.json');
let attributes = {};
try { attributes = read('data/attributes.json').attributes || {}; } catch { /* optional */ }

const flagByName = new Map(flags.map((f) => [norm(f.name), f.code]));
const flagNameByCode = new Map(flags.map((f) => [f.code, f.name]));
const flagCodes = new Set(flags.map((f) => f.code));
const statByName = new Map(Object.entries(datasets.countries).map(([c, v]) => [norm(v.name), c]));

function resolveCode(name) {
  if (NAME_OVERRIDE[name]) return NAME_OVERRIDE[name];
  const n = norm(name);
  return statByName.get(n) || flagByName.get(n) || null;
}

// 1) Resolve codes for all geometry entries
const geomFiles = {};
const geomByCode = new Map(); // code -> {name, region}
const unmatched = [];
const dupes = [];
for (const region of REGIONS) {
  const path = `data/countries-${region}.json`;
  const data = read(path);
  geomFiles[region] = { path, data };
  for (const c of data.countries) {
    const code = c.code || resolveCode(c.name); // prefer the explicit code field (robust for seeded territories)
    if (!code) { unmatched.push(`${c.name} [${region}]`); continue; }
    if (geomByCode.has(code)) dupes.push(`${code}: ${geomByCode.get(code).name} vs ${c.name}`);
    geomByCode.set(code, { name: c.name, region });
    c._code = code; // stash for write step
  }
}

console.log(`Geometry entries: ${[...Object.values(geomFiles)].reduce((s, f) => s + f.data.countries.length, 0)}`);
console.log(`Resolved codes: ${geomByCode.size}`);
if (unmatched.length) { console.log(`UNMATCHED (${unmatched.length}):\n  ${unmatched.join('\n  ')}`); }
if (dupes.length) { console.log(`DUPLICATE codes (${dupes.length}):\n  ${dupes.join('\n  ')}`); }

// 2) Canonical name (prefer common-name sources: flag > geometry > stat)
function canonicalName(code) {
  if (flagNameByCode.has(code)) return flagNameByCode.get(code);
  if (EXTRA_ENTITIES[code]) return EXTRA_ENTITIES[code].name; // authoritative for seeded entities
  if (geomByCode.has(code)) return geomByCode.get(code).name;
  return datasets.countries[code]?.name || code;
}

// 3) Build the entities registry over the union of all codes
const allCodes = new Set([...geomByCode.keys(), ...flagCodes, ...Object.keys(datasets.countries), ...Object.keys(EXTRA_ENTITIES)]);
const entities = {};
for (const code of [...allCodes].sort()) {
  const metrics = {};
  for (const m of METRIC_IDS) {
    const ds = datasets.datasets.find((d) => d.id === m);
    metrics[m] = !!(ds && ds.values[code] != null);
  }
  const geom = geomByCode.get(code);
  const extra = EXTRA_ENTITIES[code];
  const type = classify(code);
  entities[code] = {
    name: canonicalName(code),
    type,
    continent: datasets.countries[code]?.continent || (geom ? REGION_CONTINENT[geom.region] : null) || extra?.continent || null,
    hasGeometry: !!geom,
    hasFlag: flagCodes.has(code),            // flag COLORS in flags.json (used by color quizzes)
    hasFlagImage: flagCodes.has(code),       // flag IMAGE on flagcdn (probed below for the rest)
    hasCapital: !!attributes[code]?.capital,
    hasReligion: !!attributes[code]?.religion,
    // TODOS #20: the Territories toggle gates ALL dependent territories (not just the
    // newly-added ones) so it behaves consistently in browse/rank/draw.
    ...(type === 'territory' ? { optional: true } : {}),
    ...(SOVEREIGN_OF[code] ? { sovereign: SOVEREIGN_OF[code] } : {}),
    region: geom ? geom.region : (extra?.region || null),
    metrics,
  };
}

// Probe flagcdn for entities that lack color data, so the coverage board can tell
// "flag image exists" (flagcdn) apart from "flag colors in flags.json" (TODOS #19).
// This is the exact case that confused the owner: Hong Kong has an image but no colors.
{
  const probe = Object.keys(entities).filter((c) => !entities[c].hasFlagImage);
  const CONC = 12;
  let i = 0;
  async function worker() {
    while (i < probe.length) {
      const code = probe[i++];
      try {
        const r = await fetch(`https://flagcdn.com/w20/${code}.png`, { method: 'HEAD' });
        entities[code].hasFlagImage = r.ok;
      } catch { /* offline: leave false, degrades to colors-only */ }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  const gained = probe.filter((c) => entities[c].hasFlagImage);
  console.log(`Flag-image probe: ${gained.length}/${probe.length} of the color-less entities have a flagcdn image (${gained.join(' ') || 'none'})`);
}

// Coverage summary
const list = Object.entries(entities);
const summary = {
  total: list.length,
  sovereign: list.filter(([, e]) => e.type === 'sovereign').length,
  territory: list.filter(([, e]) => e.type === 'territory').length,
  aggregate: list.filter(([, e]) => e.type === 'aggregate').length,
  geometry: list.filter(([, e]) => e.hasGeometry).length,
  flag: list.filter(([, e]) => e.hasFlag).length,
};
console.log('Entities:', JSON.stringify(summary));

if (!WRITE) {
  console.log('\nDry run. Re-run with --write to update geometry files + datasets.json + write entities.json.');
  process.exit(0);
}

// 4) Write code into geometry files (key order: name, code, color, polygons, ...rest)
for (const region of REGIONS) {
  const { path, data } = geomFiles[region];
  data.countries = data.countries.map((c) => {
    const { name, _code, color, polygons, ...rest } = c;
    return { name, ...(_code ? { code: _code } : {}), color, polygons, ...rest };
  });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

// 5) Reconcile datasets.json display names to canonical (common) names, and
//    backfill continent from the entity registry (territories added via manual
//    values aren't in the build-datasets continent map — TODOS #20).
let renamed = 0;
for (const code of Object.keys(datasets.countries)) {
  const canon = canonicalName(code);
  if (canon && datasets.countries[code].name !== canon) {
    datasets.countries[code].name = canon;
    renamed++;
  }
  if (!datasets.countries[code].continent && entities[code]?.continent) {
    datasets.countries[code].continent = entities[code].continent;
  }
}
writeFileSync('data/datasets.json', JSON.stringify(datasets, null, 2) + '\n');

// 6) Write the canonical registry
writeFileSync('data/entities.json', JSON.stringify({ entities }, null, 2) + '\n');

console.log(`\nWrote codes to ${REGIONS.length} geometry files, reconciled ${renamed} dataset names, wrote data/entities.json.`);
