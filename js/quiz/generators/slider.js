import { pick } from '../rng.js';
import { fmt } from './common.js';
import { inFamBand } from './fam.js';

const PCT = { min: 0, max: 100, unit: '%', tolerance: 25, step: 1 };
const SLIDERS = {
  urbanization: { ...PCT, prompt: (n) => `What share of ${n}'s people live in cities?` },
  'export-share-gdp': { ...PCT, prompt: (n) => `How big are ${n}'s exports, as a share of its GDP?` },
  'elec-nuclear-pct': { ...PCT, prompt: (n) => `What share of ${n}'s electricity comes from nuclear?` },
  'elec-coal-pct': { ...PCT, prompt: (n) => `What share of ${n}'s electricity comes from coal?` },
  'elec-renewable-pct': { ...PCT, prompt: (n) => `What share of ${n}'s electricity comes from renewables?` },
  'life-expectancy': { min: 40, max: 90, unit: ' yrs', tolerance: 10, step: 0.5, prompt: (n) => `What is life expectancy in ${n}?` },
};

export function generate(rng, band, qd, { maxFam } = {}) {
  const id = pick(rng, Object.keys(SLIDERS));
  const s = SLIDERS[id];
  // Zero is dropped like in comparisons: "0% nuclear" for half the world is no question.
  const ok = qd.values(id).filter(([c, v]) => v > 0 && v >= s.min && v <= s.max
    && (!maxFam || qd.familiar(c, maxFam))).map(([c]) => c);
  const cands = inFamBand(qd, ok, band);
  if (!cands.length) return null;
  const c = pick(rng, cands);
  const v = qd.dataset(id).values[c];
  return {
    type: 'slider',
    dataset: id,
    prompt: s.prompt(qd.name(c)),
    answer: v,
    slider: { min: s.min, max: s.max, unit: s.unit, tolerance: s.tolerance, step: s.step },
    reveal: `${qd.name(c)} ${fmt(qd, id, v)}`,
    codes: [c],
    band,
    measure: qd.famRank(c),
  };
}
