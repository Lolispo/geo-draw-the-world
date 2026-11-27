import { pick, shuffle } from '../rng.js';
import { inFamBand } from './fam.js';

const MIN_GAP = 25;   // world units between dots, so two never overlap on the mini map

export function generate(rng, band, qd, { maxFam } = {}) {
  const geo = qd.raw.geo || {};
  const placed = qd.pool.filter((c) => geo[c]);
  const cands = inFamBand(qd, placed, band).filter((c) => !maxFam || qd.familiar(c, maxFam));
  if (!cands.length) return null;
  const ans = pick(rng, cands);
  const sameContinent = band === 'medium' || band === 'hard';
  const pool = shuffle(rng, placed.filter((c) => c !== ans
    && (!sameContinent || qd.continent(c) === qd.continent(ans))
    && (!maxFam || qd.familiar(c, maxFam))));
  const chosen = [ans];
  for (const c of pool) {
    if (chosen.length === 4) break;
    if (chosen.every((o) => Math.hypot(geo[o].x - geo[c].x, geo[o].y - geo[c].y) >= MIN_GAP)) chosen.push(c);
  }
  if (chosen.length < 4) return null;
  const codes = shuffle(rng, chosen);
  return {
    type: 'where',
    prompt: `Where is ${qd.name(ans)}?`,
    map: { dots: codes.map((c) => ({ x: geo[c].x, y: geo[c].y })) },
    choices: codes.map((_, i) => ({ label: `Dot ${i + 1}`, code: codes[i] })),
    figures: codes.map((c) => qd.name(c)),
    answer: codes.indexOf(ans),
    reveal: `${qd.name(ans)} · ${qd.continent(ans)}`,
    codes,
    band,
    measure: qd.famRank(ans),
  };
}
