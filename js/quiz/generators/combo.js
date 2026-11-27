import { pick } from '../rng.js';
import { PHRASES } from '../phrases.js';
import { comparableDatasets, entries, fmt, figure, printsDistinct, ratioIn } from './common.js';

// Neither entity's territory is claimed by the other, or the sum counts people twice.
const canCombine = (qd, a, b) => a !== b
  && qd.entity(a)?.claimedBy !== b && qd.entity(b)?.claimedBy !== a;

export function generate(rng, band, qd, { maxFam } = {}) {
  const ds = pick(rng, comparableDatasets(qd, { summable: true }));
  const list = entries(qd, ds.id, maxFam);
  if (list.length < 3) return null;
  const [a, va] = pick(rng, list);
  const bs = list.filter(([c]) => canCombine(qd, a, c));
  if (!bs.length) return null;
  const [b, vb] = pick(rng, bs);
  const sum = va + vb;
  // Yes and No equally often. On medium and hard C is bigger than either alone, so the
  // question is whether together they catch up; gentle and easy can't reach their ratio
  // that way on a Yes, and an obvious Yes is what those bands are for.
  const wantYes = rng() < 0.5;
  const tight = band === 'medium' || band === 'hard';
  const cs = list.filter(([c, v]) => c !== a && c !== b && (wantYes ? v < sum : v > sum)
    && (!tight || v > Math.max(va, vb))
    && ratioIn(Math.max(sum, v) / Math.min(sum, v), band));
  if (!cs.length) return null;
  const [c, vc] = pick(rng, cs);
  if (!printsDistinct(qd, ds.id, [a, b, c])) return null;
  if (fmt(qd, ds.id, sum) === fmt(qd, ds.id, vc)) return null;
  return {
    type: 'combo',
    dataset: ds.id,
    prompt: `Do ${qd.name(a)} and ${qd.name(b)} together ${PHRASES[ds.id].together} than ${qd.name(c)}?`,
    choices: [{ label: 'Yes' }, { label: 'No' }],
    answer: sum > vc ? 0 : 1,
    reveal: `${figure(qd, ds.id, a)} + ${figure(qd, ds.id, b)} = ${fmt(qd, ds.id, sum)} · ${figure(qd, ds.id, c)}`,
    // Shown as A + B = sum vs C in the question itself, filled in on answering.
    combo: { codes: [a, b, c], figures: [fmt(qd, ds.id, va), fmt(qd, ds.id, vb), fmt(qd, ds.id, sum), fmt(qd, ds.id, vc)] },
    codes: [a, b, c],
    band,
    measure: Math.max(sum, vc) / Math.min(sum, vc),
  };
}
