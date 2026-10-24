// The World Bank metrics, as data rather than as a constant inside a build script
// (TODOS #79).
//
// This table used to live in build-datasets.mjs, which is a top-level-await fetcher —
// importing it to find out which indicators exist would have run the whole build. The
// sources view needs exactly that list, so the table moved here where it can be read
// without side effects. It is still the only place a metric is declared: adding one is
// a one-line edit, and both the build and the registry pick it up.
//
// `wb` is the World Bank indicator code. It is what the build fetches AND what the
// sources view shows, so the two cannot drift.
// `summable: true` marks an EXTENSIVE quantity — one where adding two countries'
// values produces a meaningful third (TODOS #37, which generates "is A + B bigger
// than C?" questions). It is declared, never inferred, and defaults to false,
// because the wrong answer is silent: summing GDP per capita, life expectancy,
// urbanization or any percentage share is arithmetic nonsense (they need
// population weighting), and summing independence years is nonsense of a more
// obvious kind. Anything that consumes this flag must opt in on it.
export const INDICATORS = [
  { id: 'gdp-nominal',     wb: 'NY.GDP.MKTP.CD', name: 'Total GDP',       blurb: 'Nominal GDP, latest year (World Bank)',         format: 'currency-short', summable: true },
  { id: 'population',      wb: 'SP.POP.TOTL',     name: 'Population',      blurb: 'Total population, latest year (World Bank)',     format: 'number-short', summable: true },
  { id: 'gdp-per-capita',  wb: 'NY.GDP.PCAP.CD',  name: 'GDP per capita', blurb: 'GDP per person, latest year (World Bank)',       format: 'currency-short' },
  { id: 'land-area',       wb: 'AG.LND.TOTL.K2',  name: 'Land area',      blurb: 'Land area in km², latest year (World Bank)',     format: 'area-km2', summable: true },
  { id: 'life-expectancy', wb: 'SP.DYN.LE00.IN',  name: 'Life expectancy',blurb: 'Life expectancy at birth, latest (World Bank)', format: 'years' },
  { id: 'exports',         wb: 'NE.EXP.GNFS.CD',  name: 'Total exports',  blurb: 'Exports of goods & services, current US$ (World Bank)', format: 'currency-short', summable: true },
  { id: 'urbanization',    wb: 'SP.URB.TOTL.IN.ZS', name: 'Urbanization', blurb: 'Urban population, % of total (World Bank)',       format: 'percent' },
  // TODOS #27. Taken straight from the World Bank rather than dividing our own
  // `exports` by `gdp-nominal`: those two resolve their latest non-null year per
  // country independently, so the ratio could silently mix 2019 exports with 2023 GDP.
  { id: 'export-share-gdp', wb: 'NE.EXP.GNFS.ZS', name: 'Exports % of GDP', blurb: 'Exports of goods & services as % of GDP (World Bank)', format: 'percent' },
];