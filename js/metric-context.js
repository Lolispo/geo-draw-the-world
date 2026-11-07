// What a number means, next to the number (TODOS #82).
//
// A rank alone does not say which end is which: "Electricity from coal 0% — #187 of
// 213" reads as a failure and is the best available outcome. So a metric gets three
// pieces of context instead: where it sits on the world's range, a word for that
// position, and — on the few metrics where a direction is uncontroversial — a colour.
//
// The colour comes from a fixed line, never from the ranking or from the observed
// range. A ranking paints exactly 30% of countries amber on every metric for ever, so
// the colour would say where a country sorts rather than whether the figure is any
// good; a cut-off taken from the lowest and highest country moves for everyone the
// moment one outlier joins the data.

import { getDataset, getEntries } from './datasets.js';

// Lines a person can defend out loud. Coal has no green: most countries burn none, and
// a colour that most of the world earns carries nothing.
const LINES = {
  'life-expectancy': { green: (v) => v >= 78, amber: (v) => v < 65 },
  'gdp-per-capita': { green: (v) => v >= 25000, amber: (v) => v < 3000 },
  'elec-renewable-pct': { green: (v) => v >= 60, amber: (v) => v < 15 },
  'elec-coal-pct': { amber: (v) => v > 50 },
};

const cache = new Map();

// min, max and median for a metric, plus whether the range is wide enough that a
// linear track would pile every country against the left edge.
export function spread(id) {
  if (cache.has(id)) return cache.get(id);
  const vals = getEntries(id, { higherFirst: false }).map((e) => e.value);
  if (!vals.length) return null;
  const q = (p) => {
    const i = (vals.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return vals[lo] + (vals[hi] - vals[lo]) * (i - lo);
  };
  const s = { vals, n: vals.length, min: vals[0], max: vals[vals.length - 1], median: q(0.5) };
  s.log = s.min > 0 && s.max / s.min > 500;
  cache.set(id, s);
  return s;
}

// Share of countries this one is above, 0..1. Ties count half, so a value sitting in a
// pile — 132 countries generate exactly 0% from coal — lands in the middle of the pile
// rather than at the bottom of it.
export function percentile(id, value) {
  const s = spread(id);
  if (!s) return 0;
  let lo = 0, eq = 0;
  for (const v of s.vals) { if (v < value) lo++; else if (v === value) eq++; }
  return (lo + eq / 2) / s.n;
}

// Where to put the marker on the track, 0..1.
export function trackPos(id, value) {
  const s = spread(id);
  if (!s) return 0;
  if (s.log) {
    const lo = Math.log(s.min), hi = Math.log(s.max);
    return (Math.log(Math.max(value, s.min)) - lo) / (hi - lo);
  }
  return s.max === s.min ? 0.5 : (value - s.min) / (s.max - s.min);
}

// '' | 'good' | 'bad'. Only the four metrics in LINES are ever coloured.
export function tone(id, value) {
  const L = LINES[id];
  if (!L) return '';
  if (L.green && L.green(value)) return 'good';
  if (L.amber && L.amber(value)) return 'bad';
  return '';
}

// A word for the position. Unlike the colour this is a statement about where the
// country sorts, so it comes from the ranking and every metric gets one.
export function band(id, p) {
  // Independence year is the one metric the generic words read backwards on: a late
  // year is a young country, not a high one.
  if (id === 'independence-year') {
    return p < 0.1 ? 'Among the oldest' : p < 0.3 ? 'Old' : p < 0.7 ? 'Middling' : p < 0.9 ? 'Young' : 'Among the youngest';
  }
  return p < 0.1 ? 'Very low' : p < 0.3 ? 'Low' : p < 0.7 ? 'Middling' : p < 0.9 ? 'High' : 'Very high';
}

export function hasSpread(id) {
  return !!getDataset(id) && !!spread(id);
}
