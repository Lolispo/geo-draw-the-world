// Factbook religion labels folded into families, so "Roman Catholic", "Church of Sweden"
// and "Evangelical Lutheran" all count as Christian. A label naming two families
// ("Buddhist or Taoist", "Muslim/Jewish") belongs to neither and is dropped.

const FAMILY_PATTERNS = [
  ['Muslim', /muslim|islam|sunni|shia|bektashi/i],
  ['Hindu', /hindu/i],
  ['Buddhist', /buddh|lamaist/i],
  ['Jewish', /jewish|judaism/i],
  ['Shinto', /shinto/i],
  ['Christian', /christ|catholic|protestant|orthodox|evangel|lutheran|anglican|church|baptist|methodist|presbyter|pentecost|adventist|jehovah|apostolic|reformed|calvinist|congregation|salvation army|latter day|kimbangu|iglesia ni cristo|old believer|assembly of god|ekalesia|salutiste/i],
  ['folk', /folk|animis|traditional|ethnic religion|indigenous|customary|shaman|vodou|winti|badimo|pagan|taoist|confucian/i],
];

// The families a question may ask about; folk and Shinto are folded but never asked.
export const ASKED_FAMILIES = ['Christian', 'Muslim', 'Hindu', 'Buddhist', 'Jewish'];

function single(part) {
  if (/non-?christian|non-?believer|syncretic|believer but/i.test(part)) return null;
  const hits = FAMILY_PATTERNS.filter(([, re]) => re.test(part)).map(([f]) => f);
  return hits.length === 1 ? hits[0] : null;
}

export function familyOf(label) {
  const parts = String(label).split(/\/| or | and /i).map((s) => s.trim()).filter(Boolean);
  const fams = parts.map(single);
  if (fams.some((f) => f === null)) return null;
  return new Set(fams).size === 1 ? fams[0] : null;
}

// Share of the population per family: the mapped entries with a percentage, summed.
export function familyShares(attrs) {
  const out = {};
  for (const r of attrs?.religion || []) {
    if (typeof r.pct !== 'number') continue;
    const f = familyOf(r.name);
    if (f) out[f] = (out[f] || 0) + r.pct;
  }
  return out;
}
