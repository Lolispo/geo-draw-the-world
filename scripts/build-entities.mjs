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
const METRIC_IDS = ['gdp-nominal', 'population', 'gdp-per-capita', 'land-area', 'life-expectancy'];

// Geometry names that don't normalize-match a flag/stat name → explicit ISO code.
const NAME_OVERRIDE = {
  'Democratic Republic of the Congo': 'cd',
  'Republic of the Congo': 'cg',
  'Western Sahara': 'eh',
  'Falkland Islands': 'fk',
  'Somaliland': 'xs', // user-assigned ISO range; de-facto state, no official ISO/flag
};

// type classification (informational; does NOT gate gameplay — all entities are playable)
const AGGREGATES = new Set(['jg']); // Channel Islands = Jersey+Guernsey aggregate (World Bank)
const TERRITORIES = new Set([
  'gl', 'nc', 'hk', 'mo', 'pr', 'vi', 'vg', 'fo', 'gi', 'im', 'je', 'gg', 'bm', 'ky',
  'aw', 'cw', 'sx', 'pf', 'gu', 'mp', 'as', 'tc', 'ai', 'ck', 'nu', 'tk', 'wf', 'yt',
  're', 'ps', 'eh', 'fk',
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
    const code = resolveCode(c.name);
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
  if (geomByCode.has(code)) return geomByCode.get(code).name;
  return datasets.countries[code]?.name || code;
}

// 3) Build the entities registry over the union of all codes
const allCodes = new Set([...geomByCode.keys(), ...flagCodes, ...Object.keys(datasets.countries)]);
const entities = {};
for (const code of [...allCodes].sort()) {
  const metrics = {};
  for (const m of METRIC_IDS) {
    const ds = datasets.datasets.find((d) => d.id === m);
    metrics[m] = !!(ds && ds.values[code] != null);
  }
  const geom = geomByCode.get(code);
  entities[code] = {
    name: canonicalName(code),
    type: classify(code),
    continent: datasets.countries[code]?.continent || (geom ? REGION_CONTINENT[geom.region] : null) || null,
    hasGeometry: !!geom,
    hasFlag: flagCodes.has(code),
    region: geom ? geom.region : null,
    metrics,
  };
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

// 5) Reconcile datasets.json display names to canonical (common) names
let renamed = 0;
for (const code of Object.keys(datasets.countries)) {
  const canon = canonicalName(code);
  if (canon && datasets.countries[code].name !== canon) {
    datasets.countries[code].name = canon;
    renamed++;
  }
}
writeFileSync('data/datasets.json', JSON.stringify(datasets, null, 2) + '\n');

// 6) Write the canonical registry
writeFileSync('data/entities.json', JSON.stringify({ entities }, null, 2) + '\n');

console.log(`\nWrote codes to ${REGIONS.length} geometry files, reconciled ${renamed} dataset names, wrote data/entities.json.`);
