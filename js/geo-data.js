// Loads and provides continent + country reference data

import { Shape } from './shape.js';
import { multiPolygonCentroid } from './utils.js';
import { getIncludeTerritories } from './settings.js';

let continentData = null;
let countryDataCache = {};

// Optional/dependent territories (TODOS #20) are excluded from playable pools
// unless the toggle is on. Applied to the game-facing loaders only — getCountryByCode
// reads raw data so the showcase panel can still render any entity's silhouette.
const playable = (c) => !c.optional || getIncludeTerritories();

export async function loadContinentData() {
  const resp = await fetch('./data/continents.json');
  continentData = await resp.json();
  return continentData;
}

// Raw, unfiltered region load (cached). Internal — callers get the filtered view.
async function loadCountryDataRaw(region) {
  const key = region.toLowerCase().replace(/\s+/g, '-');
  if (countryDataCache[key]) return countryDataCache[key];
  const resp = await fetch(`./data/countries-${key}.json`);
  if (!resp.ok) throw new Error(`No country data for ${region}`);
  const data = await resp.json();
  countryDataCache[key] = data;
  return data;
}

export async function loadCountryData(region) {
  const data = await loadCountryDataRaw(region);
  return { ...data, countries: data.countries.filter(playable) };
}

// Load all regions and merge into one dataset (playable pool)
export async function loadAllCountries() {
  const regions = getCountryRegions();
  const allCountries = [];
  for (const region of regions) {
    const data = await loadCountryDataRaw(region.file);
    for (const c of data.countries) if (playable(c)) allCountries.push(c);
  }
  return {
    region: 'World',
    regionBounds: null, // full world view
    countries: allCountries
  };
}

// Find a single country's geometry entry by ISO code (raw — ignores the territories
// toggle, so the showcase panel can render any entity the user clicks).
let _byCode = null;
export async function getCountryByCode(code) {
  if (!_byCode) {
    _byCode = new Map();
    for (const region of getCountryRegions()) {
      const data = await loadCountryDataRaw(region.file);
      for (const c of data.countries) if (c.code) _byCode.set(c.code, c);
    }
  }
  return _byCode.get(code) || null;
}

// Get a daily country (deterministic for today)
export async function getDailyCountry() {
  const allData = await loadAllCountries();
  // Seed from date string
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % allData.countries.length;
  return {
    country: allData.countries[idx],
    allCountries: allData.countries,
    regionBounds: null
  };
}

export function getContinents() {
  return continentData.continents;
}

export function getContinentByName(name) {
  return continentData.continents.find(c => c.name === name);
}

export function createReferenceShape(entry) {
  const shape = new Shape(entry.polygons, entry.name, entry.color);
  shape.position = multiPolygonCentroid(entry.polygons);
  return shape;
}

export function createAllReferenceShapes() {
  return continentData.continents.map(c => createReferenceShape(c));
}

export function createCountryReferenceShapes(countryData) {
  return countryData.countries.map(c => createReferenceShape(c));
}

export function getContinentOrder() {
  return ['Africa', 'South America', 'North America', 'Europe', 'Asia', 'Oceania', 'Antarctica'];
}

export function getCountryRegions() {
  return [
    { id: 'africa', label: 'Africa', file: 'africa' },
    { id: 'europe', label: 'Europe', file: 'europe' },
    { id: 'asia', label: 'Asia', file: 'asia' },
    { id: 'north-america', label: 'North America', file: 'north-america' },
    { id: 'south-america', label: 'South America', file: 'south-america' },
    { id: 'oceania', label: 'Oceania', file: 'oceania' },
  ];
}

// Estimate polygon area from the raw coordinate data (unsigned)
function estimateArea(polygons) {
  let total = 0;
  for (const poly of polygons) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      a += poly[i][0] * poly[j][1];
      a -= poly[j][0] * poly[i][1];
    }
    total += Math.abs(a / 2);
  }
  return total;
}

// Get top N largest countries from a dataset
export function getLargestCountries(countries, n) {
  return countries
    .slice()
    .sort((a, b) => estimateArea(b.polygons) - estimateArea(a.polygons))
    .slice(0, n);
}

// Fisher-Yates shuffle
export function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
