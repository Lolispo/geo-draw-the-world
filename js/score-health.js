// What a perfect drawing scores, per country (TODOS #73).
//
// Each term's ceiling is decided by one fact, so this needs no geometry beyond the
// prerasterised masks the match panel has already loaded:
//
//   shape      can reach 100 only if the country has something on the comparison grid.
//              An empty mask — the Maldives failure, 518 atolls that each rasterised to
//              nothing — makes every drawing score zero against it.
//   size       can reach 100 only if the country has area on the world map. Vatican
//              City's world-scale polygon is seven points at one coordinate, area
//              exactly 0, so no drawing can ever match it.
//   placement  can always reach 100; you can place a shape exactly.
//
// An earlier version built a simulated perfect player from each country's detailed
// outline and ran the real scoreShape over it. That agreed with this for 250 of 251
// countries, cost 251 extra file fetches and 5.5 MB, and was *wrong* on the one it
// disagreed about: scaling the simulated player to match a zero-area reference collapsed
// it to a point, reporting Vatican City's shape ceiling as 0 when its outline is
// perfectly drawable and a real round scores it around 71.
//
// The end-to-end verification still exists where it costs nothing to a reader:
// `npm run check:masks` runs the real rasteriser over all 251 countries at build time.

import { maskCount, maskIoU } from './raster.js';
import { multiPolygonArea } from './utils.js';
import { loadShapeMasks } from './shape-match.js';
import { loadWorldOutlines } from './geo-data.js';

let _cache = null;

export async function scoreCeilings() {
  if (_cache) return _cache;

  const [masks, outlines] = await Promise.all([loadShapeMasks(), loadWorldOutlines()]);
  const rows = [];

  for (const c of outlines) {
    const mask = masks.get(c.code);
    if (!mask) continue;                       // no detailed outline: not scored this way

    const ink = maskCount(mask);
    const shape = Math.round(maskIoU(mask, mask) * 100);
    const size = multiPolygonArea(c.polygons) > 0 ? 100 : 0;
    const placement = 100;

    rows.push({
      code: c.code,
      name: c.name,
      ink,
      shape,
      size,
      placement,
      // The same weighting scoreShape uses.
      total: Math.round(shape * 0.4 + size * 0.3 + placement * 0.3),
    });
  }

  _cache = rows;
  return rows;
}

export function ceilingByCode(rows, code) {
  return rows?.find((r) => r.code === code) || null;
}
