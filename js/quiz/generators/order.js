import { pick, shuffle } from '../rng.js';
import { chainInBand, comparableDatasets, datasetLabel, entries, figure, fmt, printsDistinct } from './common.js';

// Rank the World in one question: put four countries in order.
export function generate(rng, band, qd, { maxFam } = {}) {
  const ds = pick(rng, comparableDatasets(qd));
  const chain = chainInBand(rng, entries(qd, ds.id, maxFam), band, 4);
  if (!chain) return null;
  const ranked = chain.map(([c]) => c);
  if (!printsDistinct(qd, ds.id, ranked)) return null;
  const codes = shuffle(rng, ranked.slice());
  const vals = qd.dataset(ds.id).values;
  return {
    type: 'order',
    control: 'order',
    dataset: ds.id,
    prompt: `Put these in order by ${datasetLabel(ds)}, highest first`,
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: ranked.map((c) => codes.indexOf(c)),
    figures: codes.map((c) => fmt(qd, ds.id, vals[c])),
    reveal: ranked.map((c) => figure(qd, ds.id, c)).join(' > '),
    codes,
    band,
    measure: Math.min(...chain.slice(1).map(([, v], i) => chain[i][1] / v)),
  };
}
