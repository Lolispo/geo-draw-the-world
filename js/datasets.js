// Shared dataset loader + value formatters.
// Single source consumed by both the Data Explorer and the Rank line game.

let _data = null;
let _entities = null;
let _attributes = null;

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

export function getEntity(code) {
  return _entities ? _entities[code] || null : null;
}

export function getAttributes(code) {
  return _attributes ? _attributes[code] || null : null;
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
  'number': (v) => v.toLocaleString(),
  'percent': (v) => `${v}%`,
};

export function formatValue(format, value) {
  const fn = FORMATTERS[format] || FORMATTERS['number'];
  return fn(value);
}
