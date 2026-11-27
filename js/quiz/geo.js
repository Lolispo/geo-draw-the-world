import { polygonArea, polygonCentroid } from '../utils.js';

// World space is Mercator: y = AY * ln(tan(π/4 + φ/2)) + BY (scripts/build-geometry.mjs).
const AY = -(4.4569 * 180 / Math.PI);
const BY = 760;
export const latOf = (y) => (2 * Math.atan(Math.exp((y - BY) / AY)) - Math.PI / 2) * 180 / Math.PI;

// Where each country sits: its main landmass centre in world space (for dots on a map)
// and its latitudes — centre, northern and southern edge. All from the largest ring, so
// the Netherlands' Caribbean islands don't make it reach 12°N.
export function geoSummary(countries) {
  const out = {};
  for (const c of countries) {
    if (out[c.code] || !c.polygons?.length) continue;
    const main = c.polygons.reduce((best, r) => (Math.abs(polygonArea(r)) > Math.abs(polygonArea(best)) ? r : best));
    const [x, y] = polygonCentroid(main);
    let top = Infinity, bottom = -Infinity;
    for (const [, py] of main) { if (py < top) top = py; if (py > bottom) bottom = py; }
    out[c.code] = { x, y, lat: latOf(y), north: latOf(top), south: latOf(bottom) };
  }
  return out;
}

export const fmtLat = (lat) => `${Math.round(Math.abs(lat))}°${lat >= 0 ? 'N' : 'S'}`;
