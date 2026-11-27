import { pick, sample, shuffle } from '../rng.js';
import { PHRASES } from '../phrases.js';
import { comparableDatasets, entries, figure, fmt, printsDistinct, ratioIn } from './common.js';

// "Which of these four has the most/least X?" — the answer and its closest rival are
// chosen to hit the band, the other two sit further away.
export function generate(rng, band, qd, { maxFam } = {}) {
  const ds = pick(rng, comparableDatasets(qd));
  const most = rng() < 0.6;
  const list = entries(qd, ds.id, maxFam);
  if (list.length < 4) return null;
  const [ans, va] = pick(rng, list);
  // Ratio is always answer-side over rival-side, so it is > 1 for both directions.
  const ratio = (v) => (most ? va / v : v / va);
  const rivals = list.filter(([c, v]) => c !== ans && ratioIn(ratio(v), band));
  if (!rivals.length) return null;
  const [riv, vr] = pick(rng, rivals);
  const rest = list.filter(([c, v]) => c !== ans && c !== riv && (most ? v < vr : v > vr));
  if (rest.length < 2) return null;
  const others = sample(rng, rest, 2).map(([c]) => c);
  const codes = shuffle(rng, [ans, riv, ...others]);
  if (!printsDistinct(qd, ds.id, codes)) return null;
  const phrase = PHRASES[ds.id][most ? 'most' : 'least'];
  return {
    type: 'odd-one',
    dataset: ds.id,
    prompt: `Which of these ${phrase}?`,
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: codes.indexOf(ans),
    figures: codes.map((c) => fmt(qd, ds.id, qd.dataset(ds.id).values[c])),
    reveal: codes.map((c) => figure(qd, ds.id, c)).join(' · '),
    codes,
    band,
    measure: ratio(vr),
  };
}
