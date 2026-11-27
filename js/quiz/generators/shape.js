import { pick, sample, shuffle } from '../rng.js';
import { inFamBand } from './fam.js';

export function generate(rng, band, qd, { maxFam } = {}) {
  const drawable = qd.pool.filter((c) => qd.entity(c)?.hasGeometry);
  const cands = inFamBand(qd, drawable, band).filter((c) => !maxFam || qd.familiar(c, maxFam));
  if (!cands.length) return null;
  const ans = pick(rng, cands);
  const sameContinent = band === 'medium' || band === 'hard';
  const others = drawable.filter((c) => c !== ans
    && (!sameContinent || qd.continent(c) === qd.continent(ans))
    && (!maxFam || qd.familiar(c, maxFam)));
  if (others.length < 3) return null;
  const codes = shuffle(rng, [ans, ...sample(rng, others, 3)]);
  return {
    type: 'shape',
    prompt: 'Which country is this?',
    shape: ans,
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: codes.indexOf(ans),
    reveal: `${qd.name(ans)} · ${qd.continent(ans)}`,
    codes,
    band,
    measure: qd.famRank(ans),
  };
}
