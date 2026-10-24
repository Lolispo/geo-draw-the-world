// Every third party the app takes data from (TODOS #79).
//
// This is NOT documentation of the builds — it is their input. Each build imports the
// endpoint it fetches from out of this table, so a URL that goes stale breaks a build
// instead of quietly lying in the UI. That is the whole design: a registry nobody
// executes is a registry nobody notices has rotted.
//
// scripts/build-sources.mjs turns it into data/sources.json, adding the parts that must
// never be typed by hand — when each file was last retrieved, how many entities it
// covers — and refusing to write if anything here is incomplete.
//
// `writes`   the data files this source produces. Their git commit dates become the
//            "retrieved" dates, so they must be real paths.
// `runtime`  true for a host the browser calls directly (flag and emblem images).
//            Nothing is built from it, so it has no retrieval date; instead the
//            generator checks the JS still points at the host named here.

export const SOURCES = {
  'world-bank': {
    label: 'World Bank Open Data',
    url: 'https://data.worldbank.org',
    endpoint: 'https://api.worldbank.org/v2',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    provides: 'GDP, population, land area, life expectancy, exports and urbanization',
    writes: ['data/datasets.json'],
  },

  'ember-owid': {
    label: 'Ember, via Our World in Data',
    url: 'https://ourworldindata.org/grapher/share-elec-by-source',
    endpoint: 'https://ourworldindata.org/grapher/share-elec-by-source.csv',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    provides: 'the share of electricity actually generated from each source',
    writes: ['data/electricity.json'],
  },

  'factbook': {
    label: 'CIA World Factbook',
    url: 'https://www.cia.gov/the-world-factbook/',
    // The JSON mirror, which is what the builds actually read — the Factbook site
    // itself publishes no API.
    endpoint: 'https://raw.githubusercontent.com/factbook/factbook.json/master',
    tree: 'https://api.github.com/repos/factbook/factbook.json/git/trees/master?recursive=1',
    license: 'Public domain',
    licenseUrl: 'https://www.cia.gov/the-world-factbook/about/copyright-and-contributors/',
    provides: 'capitals, religion, independence dates and trade partners',
    writes: ['data/attributes.json', 'data/relations.json'],
  },

  'unesco-whc': {
    label: 'UNESCO World Heritage Centre',
    url: 'https://whc.unesco.org/en/list/',
    endpoint: 'https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/csv',
    license: 'CC BY-SA 3.0 IGO',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/igo/',
    provides: 'the World Heritage List — every site, its category and its coordinates',
    writes: ['data/heritage.json'],
  },

  'wikidata': {
    label: 'Wikidata',
    url: 'https://www.wikidata.org',
    endpoint: 'https://query.wikidata.org/sparql',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    provides: 'coat-of-arms filenames, and how many languages write about a heritage site',
    writes: ['data/emblems.json'],
  },

  'geoboundaries': {
    label: 'geoBoundaries',
    url: 'https://www.geoboundaries.org',
    endpoint: 'https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    provides: 'the detailed country outlines the panel and the draw modes score against',
    writes: ['data/shapes'],
  },

  'natural-earth': {
    label: 'Natural Earth',
    url: 'https://www.naturalearthdata.com',
    endpoint: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson',
    license: 'Public domain',
    licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
    provides: 'the world map geometry, and the outlines geoBoundaries does not carry',
    writes: ['data/countries-africa.json', 'data/countries-europe.json', 'data/countries-asia.json',
             'data/countries-north-america.json', 'data/countries-south-america.json',
             'data/countries-oceania.json', 'data/entities.json'],
  },

  'mledoze-countries': {
    label: 'mledoze/countries',
    url: 'https://github.com/mledoze/countries',
    endpoint: 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
    license: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    provides: 'common country names and the ISO codes everything else joins on',
    writes: ['data/entities.json'],
  },

  'flagcdn': {
    label: 'flagcdn',
    url: 'https://flagcdn.com',
    endpoint: 'https://flagcdn.com/',
    license: 'Public domain',
    licenseUrl: 'https://flagcdn.com/',
    provides: 'every flag image, hotlinked as the page renders',
    runtime: true,
    // Where the host lives in the app, so the generator can prove this entry still
    // matches what the browser actually calls.
    usedBy: 'js/flags.js',
  },

  'wikimedia-commons': {
    label: 'Wikimedia Commons',
    url: 'https://commons.wikimedia.org',
    endpoint: 'https://commons.wikimedia.org/wiki/Special:FilePath/',
    license: 'Per file — Commons hosts no non-free media',
    licenseUrl: 'https://commons.wikimedia.org/wiki/Commons:Licensing',
    provides: 'coat-of-arms and World Heritage photographs, hotlinked as the page renders',
    runtime: true,
    usedBy: 'js/emblems.js',
  },
};

// Throwing here rather than writing a half-built registry: a source with no licence is
// exactly the thing this feature exists to make impossible.
const REQUIRED = ['label', 'url', 'endpoint', 'license', 'provides'];
export function assertComplete() {
  for (const [id, s] of Object.entries(SOURCES)) {
    for (const field of REQUIRED) {
      if (!s[field]) throw new Error(`source "${id}" has no ${field}`);
    }
    if (!s.runtime && !s.writes?.length) throw new Error(`source "${id}" writes nothing and is not runtime`);
    if (s.runtime && !s.usedBy) throw new Error(`runtime source "${id}" does not say which file uses it`);
  }
}
