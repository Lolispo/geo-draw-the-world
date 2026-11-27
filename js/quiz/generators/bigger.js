import { pick, shuffle } from '../rng.js';
import { PHRASES } from '../phrases.js';
import { comparableDatasets, entries, figure, fmt, printsDistinct, ratioIn } from './common.js';

export function generate(rng, band, qd, { maxFam } = {}) {
  const ds = pick(rng, comparableDatasets(qd));
  const list = entries(qd, ds.id, maxFam);
  if (list.length < 2) return null;
  const [a, va] = pick(rng, list);
  const partners = list.filter(([c, v]) => c !== a && ratioIn(Math.max(v, va) / Math.min(v, va), band));
  if (!partners.length) return null;
  const [b, vb] = pick(rng, partners);
  if (!printsDistinct(qd, ds.id, [a, b])) return null;
  const pair = shuffle(rng, [a, b]);
  const winner = va > vb ? a : b;
  return {
    type: 'bigger',
    dataset: ds.id,
    prompt: `Which ${PHRASES[ds.id].two}: ${qd.name(pair[0])} or ${qd.name(pair[1])}?`,
    choices: pair.map((c) => ({ label: qd.name(c), code: c })),
    answer: pair.indexOf(winner),
    figures: pair.map((c) => fmt(qd, ds.id, qd.dataset(ds.id).values[c])),
    reveal: pair.map((c) => figure(qd, ds.id, c)).join(' · '),
    codes: pair,
    band,
    measure: Math.max(va, vb) / Math.min(va, vb),
  };
}
