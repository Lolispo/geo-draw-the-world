// Name Them All: the pure half. A set is a list of { name, aliases, codes }; nothing
// here knows what a set contains, so states or provinces can arrive as a plain data
// file run through fromList().

import { normalizeName, inCountryPool } from './datasets.js';

export const MIN_PLAYABLE = 3;
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// "St Kitts" and "Saint Kitts" are the same answer, typed either way.
export function canon(s) {
  return normalizeName(s).replace(/\bst\b/g, 'saint');
}
const tight = (s) => s.replace(/ /g, '');

export function firstLetter(name) {
  const m = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().match(/[A-Z]/);
  return m ? m[0] : null;
}

// Qualifiers that read as notes, not names: "Puerto Rico (US)", "Hong Kong SAR, China".
// The original stays accepted.
export function displayName(raw) {
  return raw.replace(/\s*\([^)]*\)/g, '').replace(/ SAR, China$/, '').trim();
}

function entry(name, aliases, codes) {
  const forms = [...new Set([name, ...aliases].map(canon).filter(Boolean))];
  return { name, letter: firstLetter(name), forms, codes };
}

// Two entries that read the same (Kingston, Jamaica and Kingston, Norfolk Island) are one
// slot: a board cannot ask for the same word twice.
function merge(entries) {
  const byForm = new Map();
  const out = [];
  for (const e of entries) {
    const key = e.forms[0];
    const hit = byForm.get(key);
    if (hit) {
      hit.codes.push(...e.codes);
      for (const f of e.forms) if (!hit.forms.includes(f)) hit.forms.push(f);
      continue;
    }
    byForm.set(key, e);
    out.push(e);
  }
  return out.filter((e) => e.letter);
}

export function fromList(items) {
  return merge(items.map((it) => entry(it.name, it.aliases || [], it.codes || [])));
}

export function buildCountrySet(entities, aliases, { territories = false } = {}) {
  const items = [];
  for (const [code, e] of Object.entries(entities)) {
    if (!inCountryPool(e, { territories })) continue;
    const name = displayName(e.name);
    items.push({ name, aliases: [e.name, ...(aliases[code] || [])], codes: [code] });
  }
  return fromList(items);
}

// Values in the capital field that are not a city anyone could type.
const NOT_A_CAPITAL = /^(-|no official capital|administered from\b)/i;

// Spellings people use that the source does not.
const CAPITAL_ALIASES = {
  Kyiv: ['Kiev'],
  'Washington, D.C.': ['Washington', 'Washington DC'],
  Naypyidaw: ['Nay Pyi Taw', 'Naypyitaw'],
  Ulaanbaatar: ['Ulan Bator'],
  Beijing: ['Peking'],
  Astana: ['Nur-Sultan'],
  Bern: ['Berne'],
  Hagatna: ['Agana'],
};

// The source writes split capitals as "Gitega , Bujumbura" and adds language notes
// ("Chisinau in Romanian"); the first city is the capital.
export function cleanCapital(raw) {
  if (!raw || NOT_A_CAPITAL.test(raw.trim())) return null;
  return raw.split(' , ')[0].replace(/ in [A-Z][a-z]+$/, '').trim() || null;
}

export function buildCapitalSet(entities, attributes, { territories = false } = {}) {
  const items = [];
  for (const [code, e] of Object.entries(entities)) {
    if (!inCountryPool(e, { territories })) continue;
    const name = cleanCapital(attributes[code]?.capital);
    if (!name) continue;
    const extra = [...(CAPITAL_ALIASES[name] || [])];
    if (/ City$/.test(name)) extra.push(name.replace(/ City$/, ''));
    items.push({ name, aliases: extra, codes: [code] });
  }
  return fromList(items);
}

export function capitalsSkipped(entities, attributes, { territories = false } = {}) {
  return Object.entries(entities)
    .filter(([code, e]) => inCountryPool(e, { territories }) && !cleanCapital(attributes[code]?.capital))
    .map(([code]) => code);
}

const sortKey = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

export function letterCounts(entries) {
  const counts = Object.fromEntries(LETTERS.map((l) => [l, 0]));
  for (const e of entries) counts[e.letter]++;
  return counts;
}

export function playableLetters(entries) {
  const counts = letterCounts(entries);
  return LETTERS.filter((l) => counts[l] >= MIN_PLAYABLE);
}

export function board(entries, letter) {
  const L = letter.toUpperCase();
  return entries.filter((e) => e.letter === L).sort(sortKey);
}

// One cell per character: letters are blanks (the first one shown), spaces are word
// breaks, and punctuation is printed, because "Port-au-Prince" without its hyphens is a
// different shape of word.
export function slotPattern(name) {
  let shown = false;
  return [...name].map((ch) => {
    if (ch === ' ') return { kind: 'gap' };
    const isLetter = /\p{L}/u.test(ch);
    if (!isLetter) return { kind: 'mark', ch };
    if (!shown) { shown = true; return { kind: 'first', ch }; }
    return { kind: 'blank', ch };
  });
}

// What the typed text completes, among the entries not yet found. `ambiguous` means it
// is also the start of another unfound answer (Niger / Nigeria), so the caller should
// wait for a pause or Enter rather than filling it mid-word.
export function matchTyped(entries, found, typed) {
  const q = canon(typed);
  if (!q) return { match: null, ambiguous: false };
  const qt = tight(q);
  const open = entries.filter((e) => !found.has(e.name));
  const match = open.find((e) => e.forms.includes(q))
    || open.find((e) => e.forms.some((f) => tight(f) === qt))
    || null;
  if (!match) return { match: null, ambiguous: false };
  const ambiguous = open.some((e) => e !== match
    && e.forms.some((f) => f.startsWith(q) || tight(f).startsWith(qt)));
  return { match, ambiguous };
}

export function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
