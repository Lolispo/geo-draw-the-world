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
    const masks = read('shape-masks.json').masks;
    cached.masks = new Map(Object.entries(masks).map(([code, b64]) => {
      const buf = Buffer.from(b64, 'base64');
      return [code, new Uint32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))];
    }));
    cached.geo = geoSummary(regions.flatMap((r) => read(`countries-${r}.json`).countries));
  }
  return cached;
}
