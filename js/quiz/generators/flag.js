import { poss } from './common.js';
import { pick, sample, shuffle } from '../rng.js';
import { ASKED_COLOURS, colourFamilies } from '../flag-colours.js';
import { inFamBand } from './fam.js';

export function generate(rng, band, qd, { maxFam } = {}) {
  const flags = new Map((qd.raw.flags || []).map((f) => [f.code, colourFamilies(f.colors)]));
  const usable = qd.pool.filter((c) => flags.has(c) && qd.entity(c)?.hasFlagImage !== false
    && (!maxFam || qd.familiar(c, maxFam)));
  const colour = pick(rng, ASKED_COLOURS);
  const lacking = usable.filter((c) => !flags.get(c).maybe.has(colour));
  const cands = inFamBand(qd, lacking, band);
  if (!cands.length) return null;
  const ans = pick(rng, cands);
  const sameContinent = band === 'medium' || band === 'hard';
  let having = usable.filter((c) => flags.get(c).has.has(colour));
  if (sameContinent) {
    const near = having.filter((c) => qd.continent(c) === qd.continent(ans));
    if (near.length >= 3) having = near;
  }
  if (having.length < 3) return null;
  const codes = shuffle(rng, [ans, ...sample(rng, having, 3)]);
  return {
    type: 'flag',
    colour,
    // Flags appear once answered: shown up front they would give the answer away.
    pictures: 'flag',
    prompt: `Which of these flags has no ${colour}?`,
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    figures: codes.map((c) => (c === ans ? `no ${colour}` : `has ${colour}`)),
    answer: codes.indexOf(ans),
    reveal: `${poss(qd.name(ans))} flag has no ${colour}`,
    codes,
    band,
    measure: qd.famRank(ans),
  };
}
