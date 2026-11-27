import { pick, sample, shuffle } from '../rng.js';
import { ASKED_FAMILIES, familyShares } from '../religion-families.js';
import { inFamBand } from './fam.js';

// A clear majority against a clear minority: 47% Christian Germany is not a fair wrong
// answer to "most people Christian?", and 52% is not a fair right one.
export const MAJORITY = 60;
export const MINORITY = 40;

export function generate(rng, band, qd, { maxFam } = {}) {
  const shares = new Map(qd.pool
    .filter((c) => (qd.raw.attributes[c]?.religion || []).some((r) => typeof r.pct === 'number'))
    .map((c) => [c, familyShares(qd.raw.attributes[c])]));
  const known = [...shares.keys()];
  const family = pick(rng, ASKED_FAMILIES);
  const majority = known.filter((c) => (shares.get(c)[family] || 0) >= MAJORITY);
  const cands = inFamBand(qd, majority, band).filter((c) => !maxFam || qd.familiar(c, maxFam));
  if (!cands.length) return null;
  const ans = pick(rng, cands);
  const sameContinent = band === 'medium' || band === 'hard';
  let wrong = known.filter((c) => (shares.get(c)[family] || 0) <= MINORITY
    && (!maxFam || qd.familiar(c, maxFam)));
  if (sameContinent) {
    const near = wrong.filter((c) => qd.continent(c) === qd.continent(ans));
    if (near.length >= 3) wrong = near;
  }
  if (wrong.length < 3) return null;
  const codes = shuffle(rng, [ans, ...sample(rng, wrong, 3)]);
  const pct = (c) => Math.round(shares.get(c)[family] || 0);
  return {
    type: 'religion',
    family,
    prompt: `In which of these countries are most people ${family}?`,
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: codes.indexOf(ans),
    figures: codes.map((c) => `${pct(c)}% ${family}`),
    reveal: codes.map((c) => `${qd.name(c)} ${pct(c)}% ${family}`).join(' · '),
    codes,
    band,
    measure: qd.famRank(ans),
  };
}
