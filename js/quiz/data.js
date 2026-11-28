// The loaded data files, reshaped for the quiz generators. Pure: the playing pool is
// decided by the caller's `territories`, not read from settings, so the daily can ignore
// the player's toggle and the generators run under node.

export function makeQuizData(raw, { territories = false } = {}) {
  const { entities } = raw;
  const inPool = (code) => {
    const e = entities[code];
    return !!e && e.type !== 'aggregate' && (!e.optional || territories);
  };
  const pool = Object.keys(entities).filter(inPool);
  const byId = new Map(raw.datasets.datasets.map((d) => [d.id, d]));
  const valueCache = new Map();

  const values = (id) => {
    if (valueCache.has(id)) return valueCache.get(id);
    const vals = byId.get(id)?.values || {};
    const out = pool.filter((c) => typeof vals[c] === 'number').map((c) => [c, vals[c]]);
    valueCache.set(id, out);
    return out;
  };

  // Familiarity: how likely a player is to know a country, approximated by how big it
  // is in people and in money. A country missing either figure ranks last on it.
  const rankOf = (id) => {
    const sorted = values(id).slice().sort((a, b) => b[1] - a[1]);
    return new Map(sorted.map(([c], i) => [c, i + 1]));
  };
  const popRank = rankOf('population'), gdpRank = rankOf('gdp-nominal');
  const last = pool.length + 1;
  const famOrder = pool.slice().sort((a, b) =>
    ((popRank.get(a) ?? last) + (gdpRank.get(a) ?? last))
    - ((popRank.get(b) ?? last) + (gdpRank.get(b) ?? last)) || a.localeCompare(b));
  const fam = new Map(famOrder.map((c, i) => [c, i + 1]));

  return {
    raw,
    pool,
    inPool,
    name: (code) => entities[code]?.name || code,
    continent: (code) => entities[code]?.continent || null,
    entity: (code) => entities[code] || null,
    // 80×80 outline masks (js/raster.js), when the caller loaded them.
    mask: (code) => raw.masks?.get(code) || null,
    dataset: (id) => byId.get(id) || null,
    datasets: () => raw.datasets.datasets,
    values,
    famRank: (code) => fam.get(code) ?? last,
    familiar: (code, maxRank) => (fam.get(code) ?? last) <= maxRank,
  };
}
