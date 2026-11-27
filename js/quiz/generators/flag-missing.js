import { poss } from './common.js';
import { pick, shuffle } from '../rng.js';
import { interestingColours, findWithColour, findDecoys } from '../flag-match.js';
import { inFamBand } from './fam.js';

// Flag Color Quiz in one question: a flag with a colour taken out, and three other
// flags — one has that colour, two share what is left but not it.
export function generate(rng, band, qd, { maxFam } = {}) {
  const all = (qd.raw.flags || []).filter((f) => qd.inPool(f.code) && qd.entity(f.code)?.hasFlagImage !== false);
  const usable = all.filter((f) => !maxFam || qd.familiar(f.code, maxFam));
  const cands = inFamBand(qd, usable.map((f) => f.code), band);
  if (!cands.length) return null;
  const code = pick(rng, cands);
  const main = all.find((f) => f.code === code);
  const colours = interestingColours(main.colors);
  const blank = pick(rng, colours);
  const visible = main.colors.filter((c) => c !== blank);
  // Options are drawn from the same familiarity limit, so an easy round shows flags
  // people have seen.
  // Only a close match: a quiz answer must not be arguable.
  const correct = findWithColour(rng, usable, blank, [main.code], [10]);
  if (!correct) return null;
  const decoys = findDecoys(rng, usable, blank, visible, [main.code, correct.code], 2);
  if (decoys.length < 2) return null;
  const opts = shuffle(rng, [correct, ...decoys]);
  const name = qd.name(main.code);
  return {
    type: 'flag-missing',
    flag: main.code,
    blank,
    flagsShown: true,
    prompt: `${poss(name)} flag is missing a colour. Which flag has it?`,
    choices: opts.map((f) => ({ label: qd.name(f.code), code: f.code })),
    answer: opts.indexOf(correct),
    figures: opts.map((f) => (f === correct ? 'has it' : 'no')),
    reveal: `${poss(name)} missing colour ${blank} is in ${poss(qd.name(correct.code))} flag`,
    codes: [main.code, ...opts.map((f) => f.code)],
    band,
    measure: qd.famRank(main.code),
  };
}
