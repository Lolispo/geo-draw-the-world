import { poss } from './common.js';
import { pick, sample, shuffle } from '../rng.js';
import { BANDS, bandForFam } from '../bands.js';
import { sharedColours } from '../flag-match.js';
import { MIN_SHARE_SEEN } from '../../flag-colors.js';
import { deltaE } from '../../color.js';

// Flag Pie: a flag's colours as a pie by area, and four flags to pick it from. The
// decoys are drawn from the flags that share the most of its colours, closest shares
// first, so the pie has to be read rather than matched by colour alone.

// Two slices this close in colour read as the same colour in a pie.
const SAME_COLOUR = 20;
// Pies closer than this can't be told apart (Indonesia and Monaco, Chad and Romania),
// so they are never offered together.
export const NEAR_IDENTICAL = 0.1;
// A flag whose image is this far off its own colour list would draw a pie that doesn't
// look like the flag.
const MAX_UNMATCHED = 0.1;
// How far apart the closest decoy's pie is, for gentle, easy and medium; nearer is hard.
const CLOSENESS = [0.3, 0.2, 0.14];
// Three decoys are drawn from this many look-alikes, so a replay is not a rerun.
const LOOKALIKES = 6;

export const pieTrusted = (f) => Array.isArray(f?.shares) && f.shares.length === f.colors.length
  && f.shares.every((s) => s >= MIN_SHARE_SEEN) && !(f.unmatched > MAX_UNMATCHED);

// 0 for the same pie, 1 for pies with no colour in common: one minus the area the two
// share once each slice is paired with its nearest-coloured partner.
const deltas = new Map();
const colourGap = (x, y) => {
  const k = x < y ? x + y : y + x;
  if (!deltas.has(k)) deltas.set(k, deltaE(x, y));
  return deltas.get(k);
};

export function pieDistance(a, b) {
  const pairs = [];
  a.colors.forEach((ca, i) => b.colors.forEach((cb, j) => {
    const d = colourGap(ca, cb);
    if (d < SAME_COLOUR) pairs.push({ i, j, d });
  }));
  pairs.sort((x, y) => x.d - y.d);
  const usedA = new Set(), usedB = new Set();
  let overlap = 0;
  for (const { i, j } of pairs) {
    if (usedA.has(i) || usedB.has(j)) continue;
    usedA.add(i); usedB.add(j);
    overlap += Math.min(a.shares[i], b.shares[j]);
  }
  return Math.max(0, 1 - overlap);
}

const closeIndex = (d) => {
  const i = CLOSENESS.findIndex((t) => d >= t);
  return i < 0 ? 3 : i;
};

// Half how well known the flag is, half how close the nearest decoy's pie comes.
export const pieBand = (famRank, closest) =>
  BANDS[Math.round((BANDS.indexOf(bandForFam(famRank)) + closeIndex(closest)) / 2)];

export function pieDecoys(main, flags, count = LOOKALIKES) {
  const ranked = flags.filter((f) => f.code !== main.code)
    .map((f) => ({ f, shared: sharedColours(f, main.colors), d: pieDistance(main, f) }))
    .filter((s) => s.d >= NEAR_IDENTICAL)
    .sort((x, y) => y.shared - x.shared || x.d - y.d || (x.f.code < y.f.code ? -1 : 1));
  const out = [];
  // Two decoys with the same pie would be one look-alike shown twice.
  for (const s of ranked) {
    if (out.length >= count) break;
    if (out.some((o) => pieDistance(o.f, s.f) < NEAR_IDENTICAL)) continue;
    out.push(s);
  }
  return out;
}

// Every flag's look-alikes depend only on the pool, so they are worked out once per
// pool rather than on every attempt a round makes.
const cache = new WeakMap();
function table(qd, maxFam) {
  if (!cache.has(qd)) cache.set(qd, new Map());
  const byFam = cache.get(qd);
  const key = maxFam || 0;
  if (!byFam.has(key)) {
    const all = (qd.raw.flags || []).filter((f) => qd.inPool(f.code) && qd.entity(f.code)?.hasFlagImage !== false && pieTrusted(f));
    // Options come from the same familiarity limit, so an easy round shows flags people
    // have seen.
    const usable = all.filter((f) => !maxFam || qd.familiar(f.code, maxFam));
    const rows = [];
    for (const main of usable) {
      const lookalikes = pieDecoys(main, usable).sort((x, y) => x.d - y.d);
      if (lookalikes.length < 3) continue;
      const fam = qd.famRank(main.code);
      // A draw's band is set by its closest decoy, which can be any look-alike that
      // leaves two further ones to go with it.
      const bands = new Set(lookalikes.slice(0, -2).map((s) => pieBand(fam, s.d)));
      rows.push({ main, lookalikes, fam, bands });
    }
    byFam.set(key, rows);
  }
  return byFam.get(key);
}

export function generate(rng, band, qd, { maxFam } = {}) {
  const rows = table(qd, maxFam).filter((r) => r.bands.has(band));
  if (!rows.length) return null;
  const r = pick(rng, rows);
  const all = r.lookalikes;
  const firsts = all.slice(0, -2).map((s, i) => i).filter((i) => pieBand(r.fam, all[i].d) === band);
  const first = pick(rng, firsts);
  const decoys = [all[first], ...sample(rng, all.slice(first + 1), 2)];
  const opts = shuffle(rng, [{ f: r.main, d: 0 }, ...decoys]);
  const name = qd.name(r.main.code);
  return {
    type: 'flag-pie',
    flag: r.main.code,
    pie: { colors: r.main.colors.slice(), shares: r.main.shares.slice() },
    // Flags shown up front would turn reading the pie into matching colours, so they
    // appear only once answered.
    pictures: 'flag',
    prompt: 'Which flag has these colours, in these amounts?',
    choices: opts.map(({ f }) => ({ label: qd.name(f.code), code: f.code })),
    answer: opts.findIndex((o) => o.f === r.main),
    figures: opts.map(({ f, d }) => (f === r.main ? 'this pie' : `${Math.round(d * 100)}% off`)),
    reveal: `${poss(name)} flag`,
    codes: opts.map(({ f }) => f.code),
    band,
    measure: r.fam,
  };
}
