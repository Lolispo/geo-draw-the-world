// What a perfect drawing scores, per country (TODOS #73).
//
// A perfect player draws the country's own detailed outline, sizes it to the real area
// and centres it on the landmass. Run that through the real scoreShape and the answer
// should be 100/100/100 for everyone. Where it is not, the scoring cannot be satisfied —
// which is invisible in a round, because a ceiling of 60 looks exactly like a bad
// drawing. Surfaced as a column and three checks on the Coverage board.
//
// Separate from js/data-health.js because this needs the geometry and the masks; that
// file answers questions about the shipped data files alone and does not import either.

import { Shape } from './shape.js';
import { scoreShape } from './scoring.js';
import { maskCount } from './raster.js';
import { multiPolygonArea, multiPolygonCentroid, mainLandmassCentroid } from './utils.js';
import { loadShapeMasks } from './shape-match.js';
import { loadWorldOutlines, getCountryByCode } from './geo-data.js';

let _cache = null;

export async function scoreCeilings() {
  if (_cache) return _cache;

  const [masks, outlines] = await Promise.all([loadShapeMasks(), loadWorldOutlines()]);

  // 251 outlines, fetched together rather than one after another — serially this took
  // 5.5s and held up the whole board. geo-data caches each, so this is paid once.
  const scored = outlines.filter((c) => masks.has(c.code));
  const detailedBy = new Map();
  const CHUNK = 24;
  for (let i = 0; i < scored.length; i += CHUNK) {
    const slice = scored.slice(i, i + CHUNK);
    const got = await Promise.all(slice.map((c) => getCountryByCode(c.code).catch(() => null)));
    slice.forEach((c, j) => detailedBy.set(c.code, got[j]));
  }

  const rows = [];
  for (const c of scored) {
    const mask = masks.get(c.code);
    const detailed = detailedBy.get(c.code);
    if (!detailed?.polygons?.length) continue;

    const ref = new Shape(c.polygons, c.name, c.color);
    ref.position = multiPolygonCentroid(c.polygons);
    const refArea = multiPolygonArea(ref.getTransformedPolygons());

    const player = new Shape(detailed.polygons, c.name, c.color);
    const playerArea = multiPolygonArea(player.getTransformedPolygons());
    // Sized to the real thing and centred on the landmass — a perfect round.
    player.scale = Math.sqrt(refArea / (playerArea || 1));
    player.position = mainLandmassCentroid(c.polygons);

    const refCenter = mainLandmassCentroid(c.polygons);
    const s = scoreShape(player, ref, { refMask: mask, refCenter });

    rows.push({
      code: c.code, name: c.name,
      ink: maskCount(mask),                    // cells of 6400 there are to score against
      shape: s.shape, size: s.size, placement: s.placement, total: s.total,
    });
  }

  _cache = rows;
  return rows;
}

export function ceilingByCode(rows, code) {
  return rows?.find((r) => r.code === code) || null;
}
