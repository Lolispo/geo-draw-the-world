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

// A dataset's name as it reads mid-sentence: "Population" → "population", "GDP per
// capita" stays as it is.
// "Order by electricity from coal" reads as an amount; the figures are a share of each country's own supply.
export const datasetLabel = (ds) => {
  const name = /^[A-Z]{2}/.test(ds.name) ? ds.name : ds.name[0].toLowerCase() + ds.name.slice(1);
  return /^elec-.*-pct$/.test(ds.id) ? `share of ${name}` : name;
};

// `n` countries, highest first, each one a band-sized step below the one before — so
// the closest pair sets the difficulty and no pair is closer than the band allows.
export function chainInBand(rng, list, band, n, tries = 8) {
  for (let t = 0; t < tries; t++) {
    const chain = [list[Math.floor(rng() * list.length)]];
    while (chain.length < n) {
      const prev = chain[chain.length - 1][1];
      const next = list.filter(([, v]) => ratioIn(prev / v, band));
      if (!next.length) break;
      chain.push(next[Math.floor(rng() * next.length)]);
    }
    if (chain.length === n) return chain;
  }
  return null;
}

// "Sweden's", but "United States'" — a name ending in s takes the bare apostrophe.
export const poss = (name) => (/s$/.test(name) ? `${name}'` : `${name}'s`);
