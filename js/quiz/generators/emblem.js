import { pick, sample, shuffle } from '../rng.js';
import { inFamBand } from './fam.js';

export function generate(rng, band, qd, { maxFam } = {}) {
  const emblems = qd.raw.emblems || {};
  const withEmblem = qd.pool.filter((c) => emblems[c]);
  const cands = inFamBand(qd, withEmblem, band).filter((c) => !maxFam || qd.familiar(c, maxFam));
  if (!cands.length) return null;
  const ans = pick(rng, cands);
  const sameContinent = band === 'medium' || band === 'hard';
  let others = withEmblem.filter((c) => c !== ans && (!maxFam || qd.familiar(c, maxFam)));
  if (sameContinent) {
    const near = others.filter((c) => qd.continent(c) === qd.continent(ans));
    if (near.length >= 3) others = near;
  }
  if (others.length < 3) return null;
  const codes = shuffle(rng, [ans, ...sample(rng, others, 3)]);
  return {
    type: 'emblem',
    prompt: 'Whose coat of arms is this?',
    emblem: ans,
    // Every option's own coat of arms is shown after answering.
    pictures: 'emblem',
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: codes.indexOf(ans),
    reveal: `${qd.name(ans)} · ${qd.continent(ans)}`,
    codes,
    band,
    measure: qd.famRank(ans),
  };
}
