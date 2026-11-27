import { pick, sample, shuffle } from '../rng.js';
import { PHRASES } from '../phrases.js';
import { GROUPS } from '../groups.js';
import { bandForRatio } from '../bands.js';
import { comparableDatasets, figure, fmt, printsDistinct } from './common.js';

// The set is a named group, so the band can't be steered — it is measured, and a set
// that lands in the wrong band is simply not this slot's question.
function groups(qd) {
  const continents = [...new Set(qd.pool.map((c) => qd.continent(c)).filter(Boolean))]
    .map((name) => ({ id: name, label: `countries of ${name}`, codes: qd.pool.filter((c) => qd.continent(c) === name) }));
  return [...GROUPS, ...continents];
}

export function generate(rng, band, qd, { maxFam } = {}) {
  const ds = pick(rng, comparableDatasets(qd));
  const g = pick(rng, groups(qd));
  const vals = ds.values;
  let members = g.codes.filter((c) => qd.inPool(c) && vals[c] > 0);
  // Continents are big; their members are narrowed to ones a player might know.
  const curated = GROUPS.includes(g);
  if (!curated && maxFam) members = members.filter((c) => qd.familiar(c, maxFam));
  if (members.length < 3) return null;
  const n = Math.min(members.length, curated ? 5 : 4);
  const codes = shuffle(rng, sample(rng, members, n));
  const sorted = codes.slice().sort((x, y) => vals[y] - vals[x]);
  const measure = vals[sorted[0]] / vals[sorted[1]];
  if (bandForRatio(measure) !== band) return null;
  if (!printsDistinct(qd, ds.id, codes)) return null;
  const subset = n < members.length ? 'these ' : 'the ';
  return {
    type: 'best-in-group',
    dataset: ds.id,
    prompt: `Of ${subset}${g.label}, which ${PHRASES[ds.id].most}?`,
    choices: codes.map((c) => ({ label: qd.name(c), code: c })),
    answer: codes.indexOf(sorted[0]),
    figures: codes.map((c) => fmt(qd, ds.id, qd.dataset(ds.id).values[c])),
    reveal: sorted.map((c) => figure(qd, ds.id, c)).join(' · '),
    codes,
    band,
    measure,
  };
}
