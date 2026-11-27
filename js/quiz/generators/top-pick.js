import { pick, sample, shuffle } from '../rng.js';
import { comparableDatasets, datasetLabel, entries, fmt, printsDistinct, ratioIn } from './common.js';

// Top 10 / Bottom 10 in one question: pick the top (or bottom) three of eight.
export function generate(rng, band, qd, { maxFam } = {}) {
  const ds = pick(rng, comparableDatasets(qd));
  const least = rng() < 0.3;
  // Work on a "score" that is higher for the side asked about, so one code path does both.
  const list = entries(qd, ds.id, maxFam).map(([c, v]) => [c, least ? 1 / v : v]);
  if (list.length < 8) return null;
  const [third, s3] = pick(rng, list);
  const fourths = list.filter(([, s]) => ratioIn(s3 / s, band));
  if (!fourths.length) return null;
  const [fourth, s4] = pick(rng, fourths);
  const above = list.filter(([c, s]) => s > s3 && c !== third);
  const below = list.filter(([c, s]) => s < s4 && c !== fourth);
  if (above.length < 2 || below.length < 4) return null;
  const top = [...sample(rng, above, 2).map(([c]) => c), third];
  const codes = shuffle(rng, [...top, fourth, ...sample(rng, below, 4).map(([c]) => c)]);
  if (!printsDistinct(qd, ds.id, codes)) return null;
  const vals = qd.dataset(ds.id).values;
  const ranked = codes.slice().sort((a, b) => (least ? vals[a] - vals[b] : vals[b] - vals[a]));
  return {
    type: 'top-pick',
    control: 'multi',
    pick: 3,
    least,
    dataset: ds.id,
    prompt: `Pick the ${least ? 'bottom' : 'top'} 3 by ${datasetLabel(ds)}`,
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: top.map((c) => codes.indexOf(c)).sort((a, b) => a - b),
    figures: codes.map((c) => `#${ranked.indexOf(c) + 1} · ${fmt(qd, ds.id, vals[c])}`),
    reveal: ranked.slice(0, 3).map((c) => `${qd.name(c)} ${fmt(qd, ds.id, vals[c])}`).join(' · '),
    codes,
    band,
    measure: s3 / s4,
  };
}
