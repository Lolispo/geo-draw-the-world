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
];

// Static ISO2 -> continent (transcontinental countries use their common/REST-Countries primary).
const CONTINENTS = {
  Africa: 'dz ao bj bw bf bi cv cm cf td km cg cd ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu yt ma mz na ne ng re rw st sn sc sl so za ss sd tz tg tn ug zm zw',
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

const datasets = [];
const usedCodes = new Set();
for (const ind of INDICATORS) {
  const best = await fetchIndicator(ind.wb);
  const values = {};
  for (const [iso2, v] of best) {
    values[iso2] = ind.format === 'years' ? Math.round(v.value * 10) / 10 : Math.round(v.value);
    usedCodes.add(iso2);
  }
  datasets.push({ id: ind.id, name: ind.name, blurb: ind.blurb, format: ind.format, higherFirst: true, values });
  console.log(`${ind.name}: ${Object.keys(values).length} countries`);
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
const out = { continents, countries, datasets };
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');

console.log(`\nWrote ${Object.keys(countries).length} countries, ${datasets.length} datasets to ${OUT}`);
if (missingCont) {
  const missing = [...usedCodes].filter(c => !continentByIso2.has(c)).sort();
  console.log(`${missingCont} countries without a continent (All-only): ${missing.join(' ')}`);
}
