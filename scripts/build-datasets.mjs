// Build data/datasets.json from World Bank indicators + a static continent map.
// Usage: node scripts/build-datasets.mjs [outPath]
import { writeFile } from 'node:fs/promises';

const OUT = process.argv[2] || 'data/datasets.json';

const INDICATORS = [
  { id: 'gdp-nominal',     wb: 'NY.GDP.MKTP.CD', name: 'Total GDP',       blurb: 'Nominal GDP, latest year (World Bank)',         format: 'currency-short' },
  { id: 'population',      wb: 'SP.POP.TOTL',     name: 'Population',      blurb: 'Total population, latest year (World Bank)',     format: 'number-short' },
  { id: 'gdp-per-capita',  wb: 'NY.GDP.PCAP.CD',  name: 'GDP per capita', blurb: 'GDP per person, latest year (World Bank)',       format: 'currency-short' },
  { id: 'land-area',       wb: 'AG.LND.TOTL.K2',  name: 'Land area',      blurb: 'Land area in km², latest year (World Bank)',     format: 'area-km2' },
  { id: 'life-expectancy', wb: 'SP.DYN.LE00.IN',  name: 'Life expectancy',blurb: 'Life expectancy at birth, latest (World Bank)', format: 'years' },
  { id: 'exports',         wb: 'NE.EXP.GNFS.CD',  name: 'Total exports',  blurb: 'Exports of goods & services, current US$ (World Bank)', format: 'currency-short' },
  { id: 'urbanization',    wb: 'SP.URB.TOTL.IN.ZS', name: 'Urbanization', blurb: 'Urban population, % of total (World Bank)',       format: 'percent' },
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
};
const PROVENANCE = {
  tw: 'IMF WEO 2024 / Taiwan DGBAS (2023)',
  xk: 'Kosovo Agency of Statistics (2023)',
  er: 'IMF / World Bank estimates (2023)',
  kp: 'Bank of Korea GDP estimate (2022, nominal)',
  eh: 'CIA World Factbook / UN estimates',
  fk: 'Falkland Islands Government 2021 census',
  xs: 'Somaliland government estimates (de-facto state)',
};

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
