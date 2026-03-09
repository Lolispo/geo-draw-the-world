// Loads and provides continent + country reference data

import { Shape } from './shape.js';
import { multiPolygonCentroid } from './utils.js';

let continentData = null;
let countryDataCache = {};

export async function loadContinentData() {
  const resp = await fetch('./data/continents.json');
  continentData = await resp.json();
  return continentData;
}

export async function loadCountryData(region) {
  const key = region.toLowerCase().replace(/\s+/g, '-');
  if (countryDataCache[key]) return countryDataCache[key];
  const resp = await fetch(`./data/countries-${key}.json`);
  if (!resp.ok) throw new Error(`No country data for ${region}`);
  const data = await resp.json();
  countryDataCache[key] = data;
  return data;
}

// Load all regions and merge into one dataset
export async function loadAllCountries() {
  const regions = getCountryRegions();
  const allCountries = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const region of regions) {
    const data = await loadCountryData(region.file);
    for (const c of data.countries) {
      allCountries.push(c);
    }
    if (data.regionBounds) {
      const b = data.regionBounds;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
  }

  return {
    region: 'World',
    regionBounds: null, // full world view
    countries: allCountries
  };
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
