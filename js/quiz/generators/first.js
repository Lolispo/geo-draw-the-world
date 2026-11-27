import { pick, shuffle } from '../rng.js';
import { fmt } from './common.js';
import { independentFrom } from '../independence.js';

const YEAR_RANGE = { gentle: [100, Infinity], easy: [40, 100], medium: [15, 40], hard: [5, 15] };

export function generate(rng, band, qd, { maxFam } = {}) {
  const list = qd.values('independence-year')
    .filter(([c]) => qd.entity(c)?.type === 'sovereign' && independentFrom(c, qd.raw.attributes[c])
      && (!maxFam || qd.familiar(c, maxFam)));
  if (list.length < 3) return null;
  const [lo, hi] = YEAR_RANGE[band];
  const [a, ya] = pick(rng, list);
  const rivals = list.filter(([, y]) => y - ya >= lo && y - ya < hi);
  if (!rivals.length) return null;
  const [b, yb] = pick(rng, rivals);
  const thirds = list.filter(([c, y]) => c !== a && c !== b && y > yb);
  if (!thirds.length) return null;
  const [c3] = pick(rng, thirds);
  const codes = shuffle(rng, [a, b, c3]);
  const year = (c) => qd.dataset('independence-year').values[c];
  return {
    type: 'first',
    dataset: 'independence-year',
    prompt: 'Which became independent first?',
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: codes.indexOf(a),
    figures: codes.map((c) => fmt(qd, 'independence-year', year(c))),
    reveal: codes.slice().sort((x, y) => year(x) - year(y))
      .map((c) => `${qd.name(c)} ${fmt(qd, 'independence-year', year(c))}`).join(' · '),
    codes,
    band,
    measure: yb - ya,
  };
}
