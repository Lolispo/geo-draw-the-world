import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { geoSummary } from '../../js/quiz/geo.js';

const root = fileURLToPath(new URL('../../data/', import.meta.url));
const read = (f) => JSON.parse(readFileSync(root + f, 'utf8'));

let cached = null;
export function loadRaw() {
  if (!cached) {
    cached = {
      datasets: read('datasets.json'),
      entities: read('entities.json').entities,
      attributes: read('attributes.json').attributes,
      relations: read('relations.json').relations,
      flags: read('flags.json').flags,
      emblems: read('emblems.json').emblems,
    };
    const regions = ['africa', 'asia', 'europe', 'north-america', 'oceania', 'south-america'];
    cached.geo = geoSummary(regions.flatMap((r) => read(`countries-${r}.json`).countries));
  }
  return cached;
}
