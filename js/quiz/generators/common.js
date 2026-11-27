import { formatValue } from '../../datasets.js';
import { PHRASES } from '../phrases.js';
import { RATIO_RANGE } from '../bands.js';

// Datasets a comparison may use: phrased, and higher-is-more (independence year is not).
export function comparableDatasets(qd, { summable = false } = {}) {
  return qd.datasets().filter((d) => PHRASES[d.id] && d.higherFirst !== false
    && (!summable || (d.summable === true && PHRASES[d.id].together)));
}

// Pool values for a dataset with zeros dropped (a ratio against 0 means nothing), and
// optionally only familiar countries.
export function entries(qd, id, maxFam) {
  return qd.values(id).filter(([c, v]) => v > 0 && (!maxFam || qd.familiar(c, maxFam)));
}

export const fmt = (qd, id, v) => formatValue(qd.dataset(id).format, v);
export const figure = (qd, id, c) => `${qd.name(c)} ${fmt(qd, id, qd.dataset(id).values[c])}`;

// Two figures that print the same read as a tie, whatever the raw numbers say.
export function printsDistinct(qd, id, codes) {
  const shown = codes.map((c) => fmt(qd, id, qd.dataset(id).values[c]));
  return new Set(shown).size === shown.length;
}

export const ratioIn = (r, band) => r >= RATIO_RANGE[band][0] && r < RATIO_RANGE[band][1];
