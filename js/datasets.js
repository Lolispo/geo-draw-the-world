// Shared dataset loader, canonical country-pool rule, and value formatters.
// Single source consumed by the Data Explorer, Rank line game and the flag quizzes.

import { getIncludeTerritories } from './settings.js';

let _data = null;
let _entities = null;
let _attributes = null;
let _electricity = null;
let _flagColors = null;
let _aliases = null;
let _aliasIndex = null;

export async function loadDatasets() {
  if (_data) return _data;
  const resp = await fetch('data/datasets.json');
  _data = await resp.json();
  return _data;
}

export async function loadEntities() {
  if (_entities) return _entities;
  const resp = await fetch('data/entities.json');
  _entities = (await resp.json()).entities;
  return _entities;
}

export async function loadAttributes() {
  if (_attributes) return _attributes;
  const resp = await fetch('data/attributes.json');
  _attributes = (await resp.json()).attributes;
  return _attributes;
}

// Names are compared with diacritics stripped and case folded, so "Cote d'Ivoire"
// matches "Côte d'Ivoire" and nobody loses a life to a keyboard layout.
export function normalizeName(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// TODOS #40. The shortenings people actually type — UK, UAE, DRC. Curated by hand in
// data/aliases.json and normalized here, so the file stays readable and cannot drift
// from the matcher. Each alias is indexed twice, with and without its spaces, because
// "U.K.", "UK" and "u k" all normalize differently and all mean the same country.
// A failed fetch leaves typing working on real names rather than breaking the round.
export async function loadAliases() {
  if (_aliases) return _aliases;
  try {
    const resp = await fetch('data/aliases.json');
    _aliases = (await resp.json()).aliases;
  } catch {
    _aliases = {};
  }
  _aliasIndex = new Map();
  for (const [code, list] of Object.entries(_aliases)) {
    for (const a of list) {
      const n = normalizeName(a);
      if (!n) continue;
      if (!_aliasIndex.has(n)) _aliasIndex.set(n, code);
      const tight = n.replace(/ /g, '');
      if (!_aliasIndex.has(tight)) _aliasIndex.set(tight, code);
    }
  }
  return _aliases;
}

export function getAliases(code) {
  return (_aliases && _aliases[code]) || [];
}

// The country a typed name is an alias for, or null. Exact only — a prefix of an
// abbreviation is not an abbreviation.
export function codeForAlias(raw) {
  if (!_aliasIndex) return null;
  const n = normalizeName(raw);
  if (!n) return null;
  return _aliasIndex.get(n) || _aliasIndex.get(n.replace(/ /g, '')) || null;
}

// Does this country answer to what is being typed, by name or by alias? Used to
// suggest "United Kingdom" while the player is still typing "uk".
export function aliasMatches(code, normalizedQuery) {
  if (!normalizedQuery) return false;
  return getAliases(code).some((a) => {
    const n = normalizeName(a);
    return n.includes(normalizedQuery) || n.replace(/ /g, '').includes(normalizedQuery);
  });
}

export function getEntity(code) {
  return _entities ? _entities[code] || null : null;
}

// The country pool every game mode plays with. Two rules, one place (TODOS #5, #20):
//  - statistical aggregates are never in it, at any toggle setting. `jg` Channel
//    Islands is Jersey + Guernsey summed, so it double-counts its own members.
//  - dependent territories are in it only while the territories toggle is on.
// Views that deliberately show everything (the Coverage audit board, the country
// panel) read the registry directly instead of going through this.
// Unknown codes pass: a registry that failed to load must not empty a quiz.
// `territories` lets a caller answer the toggle question for itself; the Data Explorer
// has its own setting (TODOS #65). Omitted, it means the playing pool.
export function inCountryPool(codeOrEntity, { territories } = {}) {
  const e = typeof codeOrEntity === 'string' ? getEntity(codeOrEntity) : codeOrEntity;
  if (!e) return true;
  if (e.type === 'aggregate') return false;
  const allow = territories === undefined ? getIncludeTerritories() : territories;
  return !e.optional || allow;
}

export function getAttributes(code) {
  return _attributes ? _attributes[code] || null : null;
}

// Flag colour lists. Hand-curated in data/flags.json and read by both colour quizzes;
// the Coverage board reads them too, to show what is curated rather than merely that
// something is (TODOS #55). A failed fetch leaves the board without swatches rather
// than without rows.
export async function loadFlagColors() {
  if (_flagColors) return _flagColors;
  try {
    const resp = await fetch('data/flags.json');
    _flagColors = new Map((await resp.json()).flags.map((f) => [f.code, f.colors]));
  } catch {
    _flagColors = new Map();
  }
  return _flagColors;
}

export function getFlagColors(code) {
  return (_flagColors && _flagColors.get(code)) || null;
}

// TODOS #29. Separate file from attributes.json because a different build script owns
// it — a failing Ember fetch must not be able to blank out capitals and religions.
export async function loadElectricity() {
  if (_electricity) return _electricity;
  const resp = await fetch('data/electricity.json');
  _electricity = (await resp.json()).electricity;
  return _electricity;
}

// { year, sources: [{ name, pct }] } sorted most->least, or null.
export function getElectricity(code) {
  return _electricity ? _electricity[code] || null : null;
}

// A code's rank within a metric: { rank, total } (1-based), or null if absent.
export function getRank(id, code) {
  const entries = getEntries(id);
  const idx = entries.findIndex((e) => e.code === code);
  return idx < 0 ? null : { rank: idx + 1, total: entries.length };
}

// Canonical registry as a sorted array: [{ code, name, type, continent, hasGeometry, hasFlag, metrics }]
export function getEntitiesList() {
  if (!_entities) return [];
  return Object.entries(_entities)
    .map(([code, e]) => ({ code, ...e }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getMetricMeta() {
  return (_data ? _data.datasets : []).map((d) => ({ id: d.id, name: d.name }));
}

export function getDatasetList() {
  return _data ? _data.datasets : [];
}

export function getDataset(id) {
  return _data ? _data.datasets.find(d => d.id === id) || null : null;
}

// Can two countries' values for this dataset meaningfully be added together?
// Declared in scripts/build-datasets.mjs and defaulting to false, so a dataset that
// predates the flag or forgets it is treated as un-addable rather than silently
// producing nonsense like "Sweden's independence year + Norway's" (TODOS #37).
export function isSummable(id) {
  return getDataset(id)?.summable === true;
}

export function getSummableDatasets() {
  return getDatasetList().filter((d) => d.summable === true);
}

// `summable` says a dataset can be added across countries; this says a given *pair*
// can be. They are different questions, and this is the one the flag cannot answer:
// each value is individually correct while the sum counts people twice, because one
// entity's territory is claimed by the other. Cyprus is the measurable case — the
// World Bank's Cyprus population covers the whole island while Northern Cyprus ships
// its own figure, which is also why its GDP per capita sits 40% above GDP ÷ population.
//
// Deliberately conservative: it refuses a pair where double-counting is *possible*,
// rather than asserting which World Bank figures actually overlap. Whether a claimant's
// statistics include a breakaway region varies per country and is not derivable from
// the data we hold, so the cost of being wrong is one refused pair out of thousands —
// against a visibly wrong answer the other way (TODOS #54).
export function canCombine(codeA, codeB) {
  if (codeA === codeB) return false;
  const a = getEntity(codeA), b = getEntity(codeB);
  return a?.claimedBy !== codeB && b?.claimedBy !== codeA;
}

// Why a metric has no value for this entity, or null if nobody has said. Written by
// build-datasets.mjs, which is the only place that saw what the source answered — "the
// World Bank publishes nothing for Anguilla" and "nobody has filled this in" look
// identical in the data and are completely different jobs (TODOS #70).
//
// It means unavailable from the configured source, which is not the same as
// unobtainable: Taiwan's figures are absent from the World Bank and present in the
// manual backfill. So it marks a gap as explained, never as closed.
export function getKnownGap(metricId, code) {
  return _data?.knownGaps?.[metricId]?.[code] || null;
}

export function getContinents() {
  return _data ? _data.continents : [];
}

export function getCountry(code) {
  return _data ? _data.countries[code] || null : null;
}

// Sorted entries for a dataset, optionally filtered to a continent.
// Returns [{ code, name, continent, value }] sorted by value.
export function getEntries(id, { continent = null, higherFirst = null } = {}) {
  const ds = getDataset(id);
  if (!ds) return [];
  const desc = higherFirst === null ? ds.higherFirst : higherFirst;
  const entries = [];
  for (const [code, value] of Object.entries(ds.values)) {
    const country = _data.countries[code];
    if (!country) continue;
    if (continent && country.continent !== continent) continue;
    entries.push({ code, name: country.name, continent: country.continent || null, value });
  }
  entries.sort((a, b) => desc ? b.value - a.value : a.value - b.value);
  return entries;
}

// --- Value formatters ---
const FORMATTERS = {
  'currency-short': (v) => {
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(a / 1e9 >= 100 ? 0 : 1)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a / 1e6 >= 100 ? 0 : 1)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a / 1e3 >= 100 ? 0 : 1)}k`;
    return `${s}$${Math.round(a).toLocaleString()}`;
  },
  'number-short': (v) => {
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a / 1e6 >= 100 ? 0 : 1)}M`;
    if (a >= 1e3) return `${s}${(a / 1e3).toFixed(a / 1e3 >= 100 ? 0 : 1)}k`;
    return `${s}${Math.round(a)}`;
  },
  'area-km2': (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(a / 1e6).toFixed(1)}M km²`;
    if (a < 1) return `${a.toFixed(2)} km²`;
    return `${Math.round(a).toLocaleString()} km²`;
  },
  'years': (v) => `${v.toFixed(1)} yrs`,
  // TODOS #28/#33. A year is not a quantity: no thousands separator ("1,523" is wrong).
  // Negative = BC, for the curated statehood dates that reach back before year 1.
  'year': (v) => (v < 0 ? `${Math.abs(Math.round(v))} BC` : `${Math.round(v)}`),
  'number': (v) => v.toLocaleString(),
  'percent': (v) => `${v}%`,
};

export function formatValue(format, value) {
  const fn = FORMATTERS[format] || FORMATTERS['number'];
  return fn(value);
}
