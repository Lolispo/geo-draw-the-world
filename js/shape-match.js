// Which countries a drawn shape actually looks like (TODOS #58, #72).
//
// Scores a drawing against every country in the pool and ranks them. The country masks
// are precomputed (scripts/build-shape-masks.mjs) because js/raster.js normalises a
// shape to a frame that depends only on the shape itself, so each country's raster is a
// constant. That turns 251 rasterisations into 251 × 200 words of bitwise AND/OR —
// roughly a millisecond for the whole world, which is why this can run on every drawing
// of a World round without the results screen stalling.
//
// The number is the SHAPE term alone. Size and placement cannot enter into it: a
// comparison that included them would answer "the country you put it on" every time,
// and in freestyle there is no map to put it on at all.

import { rasterizeToMask, maskIoU } from './raster.js';
import { loadEntities, loadAliases, getEntity, inCountryPool, normalizeName, aliasMatches, getAliases } from './datasets.js';

let _masks = null;      // code -> Uint32Array
let _loading = null;

function decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // Written little-endian by Buffer on the build machine and read little-endian here.
  // Every browser this runs in is little-endian; a big-endian one would need a swap.
  return new Uint32Array(bytes.buffer);
}

// ~40 KB over the wire, fetched the first time a match panel opens rather than at boot —
// most sessions never open one.
export async function loadShapeMasks() {
  if (_masks) return _masks;
  if (_loading) return _loading;
  _loading = (async () => {
    const [resp] = await Promise.all([fetch('./data/shape-masks.json'), loadEntities(), loadAliases()]);
    if (!resp.ok) throw new Error(`shape-masks.json: ${resp.status}`);
    const data = await resp.json();
    _masks = new Map();
    for (const [code, b64] of Object.entries(data.masks)) _masks.set(code, decode(b64));
    return _masks;
  })();
  return _loading;
}

// One country's prerasterised outline, or null if the masks are not loaded yet. Sync,
// because scoring runs in the middle of a placement and cannot wait on a fetch; callers
// preload with loadShapeMasks() and fall back gracefully when it has not arrived.
export function getShapeMask(code) {
  return (_masks && _masks.get(code)) || null;
}

// polygons: the player's drawing, in any coordinate space — normalisation removes its
// position and size. Rotation is deliberately NOT normalised away: the round scored the
// shape as the player left it, and a panel that quietly rotated it would disagree with
// the score it sits next to.
//
// Returns every eligible country ranked best-first, each with a 0-100 score and its
// 1-based rank, plus a byCode lookup so a caller can ask about one country directly.
export async function matchShape(polygons, { territories } = {}) {
  await loadShapeMasks();
  const player = rasterizeToMask(polygons);

  const ranked = [];
  for (const [code, mask] of _masks) {
    if (!inCountryPool(code, { territories })) continue;
    ranked.push({
      code,
      name: getEntity(code)?.name || code,
      iou: maskIoU(player, mask),
    });
  }
  ranked.sort((a, b) => b.iou - a.iou || a.name.localeCompare(b.name));

  const byCode = new Map();
  ranked.forEach((r, i) => {
    r.rank = i + 1;
    r.score = Math.round(r.iou * 100);
    byCode.set(r.code, r);
  });

  return { ranked, byCode, total: ranked.length };
}

// Name search over the ranked list, using the same matcher the typed quiz inputs use
// (TODOS #40) so "UK", "DRC" and "Cote d'Ivoire" work here too.
export function searchRanked(ranked, raw, limit = 8) {
  const q = normalizeName(raw);
  if (!q) return [];
  const hits = ranked.filter((r) => normalizeName(r.name).includes(q) || aliasMatches(r.code, q));
  // An exact name, then a prefix, then anything containing it — so typing "chad" does
  // not bury Chad under Republic of Chad-alikes.
  const weight = (r) => {
    const n = normalizeName(r.name);
    return n === q ? 0 : n.startsWith(q) ? 1 : 2;
  };
  return hits.sort((a, b) => weight(a) - weight(b) || a.rank - b.rank).slice(0, limit);
}

// The alias a hit matched through, when it was not the name itself — shown so a result
// for "UK" explains why United Kingdom is in the list.
export function matchedVia(entry, raw) {
  const q = normalizeName(raw);
  if (!q || normalizeName(entry.name).includes(q)) return null;
  return getAliases(entry.code).find((a) => {
    const n = normalizeName(a);
    return n.includes(q) || n.replace(/ /g, '').includes(q);
  }) || null;
}
