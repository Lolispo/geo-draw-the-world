// Resolving a source's country name to our ISO2 code.
//
// Three builds now need this — attributes, relations, and anything else that joins on a
// name rather than a code — and the matcher is the part that quietly decides how much
// data arrives. Keeping one copy means a name that starts matching for one build starts
// matching for all of them.

// Combining diacriticals, so "Côte" and "Cote" normalize alike.
export const strip = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[.,'’()]/g, ' ')
  .replace(/\band\b|&/g, ' ')
  .replace(/\bthe\b/g, ' ')
  .replace(/\bsaint\b/g, 'st')
  .replace(/\s+/g, ' ').trim();

// Comma-flip "Korea, South" -> "South Korea"
export function flip(name) {
  const m = (name || '').match(/^(.+?),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : name;
}

// Decode the HTML entities Factbook leaves in some names/text (e.g. "C&ocirc;te").
export const decodeEnt = (s) => (s || '')
  .replace(/&([a-zA-Z])(?:acute|grave|circ|uml|tilde|ring|cedil|slash);/g, '$1')
  .replace(/&amp;/g, '&')
  .replace(/&#39;|&rsquo;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ');

// Factbook name -> our entity display name (only where normalization can't bridge).
// Targets MUST match the display names in data/entities.json.
export const FACTBOOK_ALIAS = {
  'burma': 'Myanmar',
  'korea, south': 'South Korea',
  'korea, north': 'North Korea',
  'drc': 'DR Congo',
  'congo, democratic republic of the': 'DR Congo',
  'congo (brazzaville)': 'Congo',
  'congo, republic of the': 'Congo',
  "cote d'ivoire": 'Ivory Coast',
  'czechia': 'Czech Republic',
  'holy see (vatican city)': 'Vatican City',
  'gambia, the': 'Gambia',
  'bahamas, the': 'Bahamas',
  'turkey (turkiye)': 'Turkey',
  'federated states of micronesia': 'Micronesia',
  'micronesia, federated states of': 'Micronesia',
  'hong kong': 'Hong Kong SAR, China',
  'macau': 'Macao SAR, China',
  'puerto rico': 'Puerto Rico (US)',
  'saint martin': 'St. Martin (French part)',
  'sint maarten': 'Sint Maarten (Dutch part)',
  'saint vincent and the grenadines': 'Saint Vincent',
  'virgin islands': 'Virgin Islands (U.S.)',
  'falkland islands (islas malvinas)': 'Falkland Islands',
  'west bank': 'West Bank and Gaza',
  'the dominican': 'Dominican Republic',
  // TODOS #20 territory additions (Factbook names differ from our display names)
  'saint helena, ascension, and tristan da cunha': 'Saint Helena',
  'french southern and antarctic lands': 'French Southern Territories',
};

// Build a name -> code resolver over the entity registry.
//
// `aliases` is data/aliases.json's map (#40), the names a player might type. It is opt-in
// rather than always on: the attributes build predates it and matches every Factbook
// entry it needs without it, so switching it on there would churn committed data for no
// gain. Partner lists do need it — the Factbook writes "UAE" and "S. Korea" inline.
export function makeMatcher(entities, { aliases = null } = {}) {
  const byNorm = new Map();
  for (const [code, e] of Object.entries(entities)) byNorm.set(strip(e.name), code);
  // Registry names win over aliases: an alias must never shadow a real country's name.
  if (aliases) {
    for (const [code, list] of Object.entries(aliases)) {
      for (const a of list) if (!byNorm.has(strip(a))) byNorm.set(strip(a), code);
    }
  }
  return function matchCode(name) {
    if (!name) return null;
    const decoded = decodeEnt(name).trim();
    const aliased = FACTBOOK_ALIAS[decoded.toLowerCase()] || decoded;
    return byNorm.get(strip(aliased)) || byNorm.get(strip(flip(aliased))) || null;
  };
}
