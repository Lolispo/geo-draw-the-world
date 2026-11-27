import { pick, sample, shuffle } from '../rng.js';
import { inFamBand } from './fam.js';

// Countries with a real claim on two continents; any one answer would be arguable.
const SPANS_TWO = new Set(['ru', 'tr', 'kz', 'az', 'ge', 'am', 'cy', 'eg', 'id', 'tl', 'pg']);

export function generate(rng, band, qd, { maxFam } = {}) {
  const continents = [...new Set(qd.pool.map((c) => qd.continent(c)).filter(Boolean))];
  const ok = qd.pool.filter((c) => qd.continent(c) && !SPANS_TWO.has(c));
  const cands = inFamBand(qd, ok, band).filter((c) => !maxFam || qd.familiar(c, maxFam));
  if (!cands.length) return null;
  const c = pick(rng, cands);
  const right = qd.continent(c);
  const opts = shuffle(rng, [right, ...sample(rng, continents.filter((x) => x !== right), 3)]);
  return {
    type: 'continent',
    prompt: `Which continent is ${qd.name(c)} in?`,
    choices: opts.map((label) => ({ label })),
    answer: opts.indexOf(right),
    reveal: `${qd.name(c)} · ${right}`,
    codes: [c],
    band,
    measure: qd.famRank(c),
  };
}
