import { pick } from '../rng.js';
import { chainInBand, comparableDatasets, datasetLabel, entries, figure, fmt, printsDistinct } from './common.js';

// Rank Line in one question: three countries already in order, where does the fourth go?
export function generate(rng, band, qd, { maxFam } = {}) {
  const ds = pick(rng, comparableDatasets(qd));
  const chain = chainInBand(rng, entries(qd, ds.id, maxFam), band, 4);
  if (!chain) return null;
  const all = chain.map(([c]) => c);
  if (!printsDistinct(qd, ds.id, all)) return null;
  const gap = Math.floor(rng() * 4);
  const subject = all[gap];
  const line = all.filter((_, i) => i !== gap);
  const vals = qd.dataset(ds.id).values;
  const near = [chain[gap - 1], chain[gap + 1]].filter(Boolean)
    .map(([, v]) => Math.max(v, vals[subject]) / Math.min(v, vals[subject]));
  return {
    type: 'insert',
    control: 'gaps',
    dataset: ds.id,
    prompt: `Where does ${qd.name(subject)} go? Highest ${datasetLabel(ds)} at the top`,
    line,
    subject,
    answer: gap,
    figures: { line: line.map((c) => fmt(qd, ds.id, vals[c])), subject: fmt(qd, ds.id, vals[subject]) },
    reveal: all.map((c) => figure(qd, ds.id, c)).join(' > '),
    codes: [...line, subject],
    band,
    measure: Math.min(...near),
  };
}
