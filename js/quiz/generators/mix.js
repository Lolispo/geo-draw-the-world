import { poss } from './common.js';
import { pick } from '../rng.js';
import { colourFamilies } from '../flag-colours.js';
import { nearWhite, nearBlack } from '../flag-match.js';
import { inFamBand } from './fam.js';

// Flag Color Picker in one question: mix the colour taken out of a flag.
export function generate(rng, band, qd, { maxFam } = {}) {
  const flags = new Map((qd.raw.flags || []).map((f) => [f.code, f]));
  const usable = qd.pool.filter((c) => flags.has(c) && qd.entity(c)?.hasFlagImage !== false
    && (!maxFam || qd.familiar(c, maxFam)));
  const cands = inFamBand(qd, usable, band);
  if (!cands.length) return null;
  const code = pick(rng, cands);
  let colours = flags.get(code).colors.filter((h) => !nearWhite(h) && !nearBlack(h));
  // The gentle end asks for a colour anyone can name: a clear red, blue, green or yellow.
  if (band === 'gentle' || band === 'easy') colours = colours.filter((h) => colourFamilies([h]).has.size > 0);
  if (!colours.length) return null;
  const hex = pick(rng, colours);
  return {
    type: 'mix',
    control: 'picker',
    flag: code,
    answer: hex,
    prompt: `Mix the colour missing from ${poss(qd.name(code))} flag`,
    reveal: `${qd.name(code)}: ${hex}`,
    codes: [code],
    band,
    measure: qd.famRank(code),
  };
}
