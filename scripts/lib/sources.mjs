// Downloads for the geometry builds, cached in .cache/ (gitignored).
//
// build-geometry.mjs and build-shapes.mjs used to read these out of /tmp, which
// meant they only ran on a machine where someone had already fetched them by hand
// — and stopped running the next time /tmp was cleared. The files are large and
// change rarely, so cache them next to the repo instead and let the build fetch
// its own inputs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const CACHE = '.cache';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const SOURCES = {
  'ne50.geojson':         `${NE}/ne_50m_admin_0_countries.geojson`,
  'ne10.geojson':         `${NE}/ne_10m_admin_0_countries.geojson`,
  'ne10_units.geojson':   `${NE}/ne_10m_admin_0_map_units.geojson`,
  'ne10_disputed.geojson':`${NE}/ne_10m_admin_0_disputed_areas.geojson`,
  'mledoze.json':         'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
};

export async function source(name) {
  const url = SOURCES[name];
  if (!url) throw new Error(`unknown source ${name}`);
  const path = `${CACHE}/${name}`;
  if (!existsSync(path)) {
    mkdirSync(CACHE, { recursive: true });
    process.stderr.write(`fetching ${name}… `);
    const r = await fetch(url, { headers: { 'User-Agent': 'geo-draw' }, redirect: 'follow' });
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status} from ${url}`);
    const text = await r.text();
    JSON.parse(text); // fail here rather than halfway through a build
    writeFileSync(path, text);
    process.stderr.write(`${(text.length / 1048576).toFixed(1)} MB cached\n`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}
