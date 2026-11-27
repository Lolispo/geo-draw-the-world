import { pick, shuffle } from '../rng.js';
import { fmtLat } from '../geo.js';

const DEG = { gentle: [20, Infinity], easy: [10, 20], medium: [5, 10], hard: [2, 5] };
export const bandForDegrees = (d) => Object.keys(DEG).find((b) => d >= DEG[b][0] && d < DEG[b][1]) || null;

// "Further north" is only asked when one country is further north at its top edge AND
// its bottom edge — Chile against anything is not a question.
export function generate(rng, band, qd, { maxFam } = {}) {
  const geo = qd.raw.geo || {};
  const list = qd.pool.filter((c) => geo[c] && (!maxFam || qd.familiar(c, maxFam)));
  if (list.length < 2) return null;
  const a = pick(rng, list), ga = geo[a];
  const partners = list.filter((c) => {
    if (c === a) return false;
    const g = geo[c];
    const clear = (ga.north > g.north && ga.south > g.south) || (g.north > ga.north && g.south > ga.south);
    return clear && bandForDegrees(Math.abs(ga.north - g.north)) === band;
  });
  if (!partners.length) return null;
  const b = pick(rng, partners);
  const pair = shuffle(rng, [a, b]);
  const winner = geo[a].north > geo[b].north ? a : b;
  return {
    type: 'north',
    prompt: `Whose northernmost point is further north: ${qd.name(pair[0])} or ${qd.name(pair[1])}?`,
    choices: pair.map((c) => ({ label: qd.name(c), code: c })),
    figures: pair.map((c) => fmtLat(geo[c].north)),
    answer: pair.indexOf(winner),
    reveal: pair.map((c) => `${qd.name(c)} ${fmtLat(geo[c].north)}`).join(' · '),
    codes: pair,
    band,
    measure: Math.round(Math.abs(geo[a].north - geo[b].north) * 10) / 10,
  };
}
