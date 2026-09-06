// Build data/datasets.json from World Bank indicators + a static continent map,
// plus datasets derived from files other build scripts own (see 'derived datasets').
// Usage: node scripts/build-datasets.mjs [outPath]
import { readFile, writeFile } from 'node:fs/promises';

const OUT = process.argv[2] || 'data/datasets.json';

const INDICATORS = [
  { id: 'gdp-nominal',     wb: 'NY.GDP.MKTP.CD', name: 'Total GDP',       blurb: 'Nominal GDP, latest year (World Bank)',         format: 'currency-short' },
  { id: 'population',      wb: 'SP.POP.TOTL',     name: 'Population',      blurb: 'Total population, latest year (World Bank)',     format: 'number-short' },
  { id: 'gdp-per-capita',  wb: 'NY.GDP.PCAP.CD',  name: 'GDP per capita', blurb: 'GDP per person, latest year (World Bank)',       format: 'currency-short' },
  { id: 'land-area',       wb: 'AG.LND.TOTL.K2',  name: 'Land area',      blurb: 'Land area in km², latest year (World Bank)',     format: 'area-km2' },
  { id: 'life-expectancy', wb: 'SP.DYN.LE00.IN',  name: 'Life expectancy',blurb: 'Life expectancy at birth, latest (World Bank)', format: 'years' },
  { id: 'exports',         wb: 'NE.EXP.GNFS.CD',  name: 'Total exports',  blurb: 'Exports of goods & services, current US$ (World Bank)', format: 'currency-short' },
  { id: 'urbanization',    wb: 'SP.URB.TOTL.IN.ZS', name: 'Urbanization', blurb: 'Urban population, % of total (World Bank)',       format: 'percent' },
  // TODOS #27. Taken straight from the World Bank rather than dividing our own
  // `exports` by `gdp-nominal`: those two resolve their latest non-null year per
  // country independently, so the ratio could silently mix 2019 exports with 2023 GDP.
  { id: 'export-share-gdp', wb: 'NE.EXP.GNFS.ZS', name: 'Exports % of GDP', blurb: 'Exports of goods & services as % of GDP (World Bank)', format: 'percent' },
];

// Static ISO2 -> continent (transcontinental countries use their common/REST-Countries primary).
const CONTINENTS = {
  Africa: 'dz ao bj bw bf bi cv cm cf td km cg cd ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu yt ma mz na ne ng re rw st sn sc sl so za ss sd tz tg tn ug zm zw eh xs',
  Asia: 'af am az bh bd bt bn kh cn ge hk in id ir iq il jp jo kz kw kg la lb mo my mv mn mm np kp om pk ps ph qa sa sg kr lk sy tw tj th tl tr tm ae uz vn ye',
  Europe: 'al ad at by be ba bg hr cy cz dk ee fo fi fr de gi gr hu is ie im it je jg gg xk lv li lt lu mt md mc me nl mk no pl pt ro ru sm rs sk si es se ch ua gb va',
  'North America': 'ai ag aw bs bb bz bm ca ky cr cu cw dm do sv gd gl gt ht hn jm mx mf ni pa pr kn lc sx vc tt tc us vg vi',
  'South America': 'ar bo br cl co ec fk gy py pe sr uy ve',
  Oceania: 'as au ck fj pf gu ki mh fm nr nc nz nu mp pw pg ws sb tk to tv vu wf',
};
const continentByIso2 = new Map();
for (const [cont, codes] of Object.entries(CONTINENTS)) {
  for (const c of codes.split(' ')) continentByIso2.set(c, cont);
}

async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise(res => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw new Error(`${lastErr.message} for ${url}`);
}

// Real countries (drop aggregates) + ISO2 -> name
const meta = (await getJson('https://api.worldbank.org/v2/country?format=json&per_page=400'))[1];
const nameByIso2 = new Map();
for (const c of meta) {
  if (!c.region || c.region.value === 'Aggregates') continue;
  if (!c.iso2Code) continue;
  nameByIso2.set(c.iso2Code.toLowerCase(), c.name);
}

// Indicator: pick most recent non-null value per country from a recent window
async function fetchIndicator(code) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&date=2015:2023&per_page=20000`;
  const rows = (await getJson(url))[1] || [];
  const best = new Map();
  for (const row of rows) {
    if (row.value == null) continue;
    const iso2 = row.country?.id?.toLowerCase();
    if (!iso2 || !nameByIso2.has(iso2)) continue; // skip aggregates
    const year = parseInt(row.date, 10);
    const prev = best.get(iso2);
    if (!prev || year > prev.year) best.set(iso2, { value: row.value, year });
  }
  return best;
}

// Manual backfill for entities missing or absent in World Bank data (TODOS #6).
// Fills gaps only — never overrides a World Bank value. Sources in PROVENANCE.
const MANUAL_VALUES = {
  tw: { 'gdp-nominal': 790000000000, 'population': 23400000, 'gdp-per-capita': 33760, 'land-area': 36197, 'life-expectancy': 80.5 },
  xk: { 'land-area': 10887 },
  er: { 'gdp-nominal': 2100000000, 'gdp-per-capita': 565 },
  kp: { 'gdp-nominal': 28000000000, 'gdp-per-capita': 1070 },
  eh: { 'land-area': 266000, 'population': 580000 },
  fk: { 'land-area': 12173, 'population': 3800 },
  xs: { 'land-area': 176120, 'population': 5700000 },
  va: { 'land-area': 0.49, 'population': 764 }, // Vatican City (TODOS #20) — sovereign, not in World Bank
  // Dependent/autonomous territories (TODOS #20) — land area (stable) + population
  // (recent estimates) so the Territories toggle is rankable. Not in World Bank.
  ai: { 'land-area': 91, 'population': 15900 },
  ax: { 'land-area': 1580, 'population': 30500 },
  ck: { 'land-area': 236, 'population': 15000 },
  gg: { 'land-area': 78, 'population': 63900 },
  je: { 'land-area': 116, 'population': 103300 },
  ms: { 'land-area': 102, 'population': 4400 },
  nu: { 'land-area': 261, 'population': 1600 },
  nf: { 'land-area': 35, 'population': 2190 },
  pn: { 'land-area': 47, 'population': 50 },
  bl: { 'land-area': 25, 'population': 10900 },
  sh: { 'land-area': 394, 'population': 5600 },
  pm: { 'land-area': 242, 'population': 5800 },
  wf: { 'land-area': 142, 'population': 11600 },
  io: { 'land-area': 60 },
  tf: { 'land-area': 7747 },
  gp: { 'land-area': 1628, 'population': 384000 },
  mq: { 'land-area': 1128, 'population': 361000 },
  gf: { 'land-area': 83534, 'population': 295000 },
  re: { 'land-area': 2511, 'population': 873000 },
  yt: { 'land-area': 374, 'population': 320000 },
  bq: { 'land-area': 328, 'population': 27000 },
  gs: { 'land-area': 3903 },
  // TODOS #20 Tier 2 completion — CIA World Factbook (public domain), 2021-2025 ests.
  // sj = Svalbard 62,045 km2 + Jan Mayen 377 km2; population is Svalbard's (Jan Mayen
  // has no permanent inhabitants).
  cx: { 'land-area': 135, 'population': 1692 },
  cc: { 'land-area': 14, 'population': 593 },
  sj: { 'land-area': 62422, 'population': 2556 },
  tk: { 'land-area': 12, 'population': 2453 },
  // TODOS #20 Tier 3 — de-facto states. Population from Natural Earth's disputed-areas
  // layer (POP_EST). Land area is the claimed territory: it matches the NE polygon
  // within 1% for Abkhazia and N. Cyprus, but the NE control-line polygon runs 14%
  // larger for South Ossetia and 27% smaller for Transnistria (Bender/Tighina).
  xc: { 'land-area': 3355, 'population': 326000 },
  xa: { 'land-area': 8660, 'population': 245246 },
  xo: { 'land-area': 3900, 'population': 53532 },
  xt: { 'land-area': 4163, 'population': 469000 },
};
const PROVENANCE = {
  tw: 'IMF WEO 2024 / Taiwan DGBAS (2023)',
  xk: 'Kosovo Agency of Statistics (2023)',
  er: 'IMF / World Bank estimates (2023)',
  kp: 'Bank of Korea GDP estimate (2022, nominal)',
  eh: 'CIA World Factbook / UN estimates',
  fk: 'Falkland Islands Government 2021 census',
  xs: 'Somaliland government estimates (de-facto state)',
  va: 'Vatican City / Holy See official estimates',
  xc: 'Natural Earth disputed areas POP_EST 2017; area = claimed territory (de-facto state)',
  xa: 'Natural Earth disputed areas POP_EST 2018; area = claimed territory (de-facto state)',
  xo: 'Natural Earth disputed areas POP_EST 2015; area = claimed territory (de-facto state)',
  xt: 'Natural Earth disputed areas POP_EST 2018; area = claimed territory (de-facto state)',
};
// Territory land-area/population figures share a generic provenance.
for (const code of Object.keys(MANUAL_VALUES)) {
  if (!PROVENANCE[code]) PROVENANCE[code] = 'Territory land area + population (CIA World Factbook / official estimates)';
}

const datasets = [];
const usedCodes = new Set();
for (const ind of INDICATORS) {
  const best = await fetchIndicator(ind.wb);
  const values = {};
  for (const [iso2, v] of best) {
    values[iso2] = (ind.format === 'years' || ind.format === 'percent') ? Math.round(v.value * 10) / 10 : Math.round(v.value);
    usedCodes.add(iso2);
  }
  datasets.push({ id: ind.id, name: ind.name, blurb: ind.blurb, format: ind.format, higherFirst: true, values });
  console.log(`${ind.name}: ${Object.keys(values).length} countries`);
}

// Merge manual backfill (gap-fill only; never overrides World Bank)
for (const [code, metrics] of Object.entries(MANUAL_VALUES)) {
  for (const [metricId, value] of Object.entries(metrics)) {
    const ds = datasets.find((d) => d.id === metricId);
    if (ds && ds.values[code] == null) { ds.values[code] = value; usedCodes.add(code); }
  }
}

// ---- derived datasets ----------------------------------------------------
// Some rankable datasets are computed from files other scripts own (attributes.json,
// electricity.json) rather than fetched from the World Bank. They're merged here so
// datasets.json keeps a single owner, and the reads are optional so any build order
// works — the same convergence pattern build-entities.mjs already uses for
// attributes.json. Re-run this script after the upstream one to pick up changes.
async function readJsonIfPresent(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return null; }
}

{
  // TODOS #28 — independence year, parsed from the Factbook by build-attributes.mjs.
  // higherFirst:false so the oldest states rank first, which is the interesting end.
  const attrs = (await readJsonIfPresent('data/attributes.json'))?.attributes;
  if (!attrs) {
    console.log('\n! data/attributes.json missing — skipping independence-year. Run build-attributes.mjs, then re-run this.');
  } else {
    const values = {};
    for (const [code, a] of Object.entries(attrs)) {
      if (a.independenceYear == null) continue;
      values[code] = a.independenceYear;
      usedCodes.add(code);
    }
    datasets.push({
      id: 'independence-year',
      name: 'Independence year',
      blurb: 'Year the country became independent (CIA World Factbook)',
      format: 'year',
      higherFirst: false,
      values,
    });
    console.log(`Independence year: ${Object.keys(values).length} countries (derived)`);
  }
}

{
  // TODOS #29 — rankable slices of the electricity mix built by build-electricity.mjs.
  // A country present in electricity.json but with no nuclear row genuinely generates
  // ~0% nuclear, so it gets 0 rather than being omitted: "Poland: 0% nuclear" is a
  // true and useful fact, and omitting it would misread as missing data.
  const elec = (await readJsonIfPresent('data/electricity.json'))?.electricity;
  if (!elec) {
    console.log('! data/electricity.json missing — skipping electricity datasets. Run build-electricity.mjs, then re-run this.');
  } else {
    const RENEWABLE = new Set(['Hydro', 'Wind', 'Solar', 'Bioenergy', 'Other renewables']);
    const SLICES = [
      { id: 'elec-nuclear-pct',   name: 'Electricity from nuclear',    match: (n) => n === 'Nuclear',
        blurb: 'Share of electricity generated from nuclear (Ember)' },
      { id: 'elec-coal-pct',      name: 'Electricity from coal',       match: (n) => n === 'Coal',
        blurb: 'Share of electricity generated from coal (Ember)' },
      { id: 'elec-renewable-pct', name: 'Electricity from renewables', match: (n) => RENEWABLE.has(n),
        blurb: 'Share from hydro, wind, solar, bioenergy & other renewables (Ember)' },
    ];
    for (const slice of SLICES) {
      const values = {};
      for (const [code, entry] of Object.entries(elec)) {
        const pct = entry.sources.filter((s) => slice.match(s.name)).reduce((sum, s) => sum + s.pct, 0);
        // Summing already-rounded component shares can overshoot (an all-renewable
        // grid totalling 100.1%). It's a share of generation, so clamp at 100.
        values[code] = Math.min(100, Math.round(pct * 10) / 10);
        usedCodes.add(code);
      }
      datasets.push({ id: slice.id, name: slice.name, blurb: slice.blurb, format: 'percent', higherFirst: true, values });
      console.log(`${slice.name}: ${Object.keys(values).length} countries (derived)`);
    }
  }
}

// Flag datasets that make a poor ranking game. Rank the World asks you to place
// countries on a line by value; if most of them share one value there's nothing to
// place — "% of electricity from nuclear" is 0 for 181 of 213 countries. Such a
// dataset stays fully browsable in the Data Explorer, it's just not offered as a
// round. Measured from the data rather than hardcoded, so it self-corrects when a
// source changes: if the modal value covers more than this share, it's degenerate.
const DEGENERATE_SHARE = 0.4;
for (const ds of datasets) {
  const vals = Object.values(ds.values);
  if (!vals.length) continue;
  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  const modal = Math.max(...counts.values());
  if (modal / vals.length > DEGENERATE_SHARE) {
    ds.rankable = false;
    const modalValue = [...counts.entries()].find(([, n]) => n === modal)[0];
    console.log(`  ${ds.name}: not rankable — ${modal}/${vals.length} countries share the value ${modalValue}`);
  }
}

// Country registry for every code used by any dataset
const countries = {};
let missingCont = 0;
for (const code of [...usedCodes].sort()) {
  const entry = { name: nameByIso2.get(code) || code };
  const cont = continentByIso2.get(code);
  if (cont) entry.continent = cont; else { missingCont++; }
  countries[code] = entry;
}

const continents = Object.keys(CONTINENTS);
const out = { continents, countries, datasets, provenance: PROVENANCE };
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');

console.log(`\nWrote ${Object.keys(countries).length} countries, ${datasets.length} datasets to ${OUT}`);
if (missingCont) {
  const missing = [...usedCodes].filter(c => !continentByIso2.has(c)).sort();
  console.log(`${missingCont} countries without a continent (All-only): ${missing.join(' ')}`);
}
