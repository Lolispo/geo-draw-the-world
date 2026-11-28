import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canon, firstLetter, displayName, cleanCapital, buildCountrySet, buildCapitalSet, capitalsSkipped,
  letterCounts, playableLetters, board, slotPattern, matchTyped, fromList, formatElapsed,
} from '../js/names-sets.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const entities = read('data/entities.json').entities;
const attributes = read('data/attributes.json').attributes;
const aliases = read('data/aliases.json').aliases;

test('first letter is ASCII-normalised', () => {
  assert.equal(firstLetter('Åland Islands'), 'A');
  assert.equal(firstLetter('El Aaiún'), 'E');
  assert.equal(firstLetter("'s-Hertogenbosch"), 'S');
});

test('display names drop qualifier notes', () => {
  assert.equal(displayName('Puerto Rico (US)'), 'Puerto Rico');
  assert.equal(displayName('Hong Kong SAR, China'), 'Hong Kong');
  assert.equal(displayName('Sweden'), 'Sweden');
});

test('capital cleanup', () => {
  assert.equal(cleanCapital('Gitega , Bujumbura'), 'Gitega');
  assert.equal(cleanCapital('Chisinau in Romanian'), 'Chisinau');
  assert.equal(cleanCapital('Washington, D.C.'), 'Washington, D.C.');
  assert.equal(cleanCapital('no official capital'), null);
  assert.equal(cleanCapital('administered from London'), null);
  assert.equal(cleanCapital('-'), null);
  assert.equal(cleanCapital(undefined), null);
});

test('sovereign country letter counts match the table in the design', () => {
  const set = buildCountrySet(entities, aliases, { territories: false });
  assert.equal(set.length, 197);
  const c = letterCounts(set);
  assert.equal(c.S, 27);
  assert.equal(c.M, 18);
  assert.equal(c.B, 17);
  for (const l of ['W', 'X', 'O', 'Q', 'Y']) assert.ok(c[l] < 3, l);
  const playable = playableLetters(set);
  for (const l of ['W', 'X', 'O', 'Q', 'Y', 'Z']) assert.ok(!playable.includes(l), l);
  assert.ok(playable.includes('S'));
});

test('territories join the pool and Åland lands under A', () => {
  const off = buildCountrySet(entities, aliases, { territories: false });
  const on = buildCountrySet(entities, aliases, { territories: true });
  assert.ok(on.length > off.length);
  assert.ok(board(on, 'a').some((e) => e.name === 'Åland Islands'));
  assert.ok(!board(off, 'a').some((e) => e.name === 'Åland Islands'));
  assert.ok(on.every((e) => !entities[e.codes[0]] || entities[e.codes[0]].type !== 'aggregate'));
});

test('capitals: shared names are one slot, unplayable values are skipped', () => {
  const caps = buildCapitalSet(entities, attributes, { territories: true });
  const kingston = caps.filter((e) => e.name === 'Kingston');
  assert.equal(kingston.length, 1);
  assert.deepEqual(kingston[0].codes.sort(), ['jm', 'nf']);
  assert.ok(caps.some((e) => e.name === 'Kingstown'));
  assert.ok(!caps.some((e) => /official|administered/.test(e.name)));
  assert.deepEqual(capitalsSkipped(entities, attributes, { territories: false }), []);
});

test('owner capital corrections: Naypyidaw for Myanmar, Yaren for Nauru', () => {
  assert.equal(attributes.mm.capital, 'Naypyidaw');
  assert.equal(attributes.nr.capital, 'Yaren');
  const src = readFileSync(new URL('../scripts/build-attributes.mjs', import.meta.url), 'utf8');
  assert.match(src, /mm: \{ capital: 'Naypyidaw'/, 'the build script carries the correction, not just the JSON');
  assert.match(src, /nr: \{ capital: 'Yaren'/);
  const caps = buildCapitalSet(entities, attributes);
  const none = new Set();
  assert.equal(matchTyped(board(caps, 'n'), none, 'nay pyi taw').match?.name, 'Naypyidaw');
  assert.equal(matchTyped(board(caps, 'y'), none, 'yaren').match?.name, 'Yaren');
  assert.ok(!board(caps, 'r').some((e) => e.name === 'Rangoon'));
});

test('board is sorted alphabetically, accent-insensitively', () => {
  const set = buildCountrySet(entities, aliases, { territories: false });
  const names = board(set, 's').map((e) => e.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  assert.deepEqual(names, sorted);
  assert.equal(names.length, 27);
});

test('slot pattern keeps word breaks and punctuation, shows the first letter', () => {
  const p = slotPattern('South Africa');
  assert.equal(p.length, 12);
  assert.deepEqual(p.slice(0, 2).map((c) => c.kind), ['first', 'blank']);
  assert.equal(p[5].kind, 'gap');
  assert.equal(p.filter((c) => c.kind === 'first').length, 1);
  const q = slotPattern('Port-au-Prince');
  assert.equal(q[4].kind, 'mark');
  assert.equal(q[4].ch, '-');
});

test('typing matches names, aliases, accents and Saint/St', () => {
  const set = buildCountrySet(entities, aliases, { territories: false });
  const s = board(set, 's');
  const none = new Set();
  assert.equal(matchTyped(s, none, 'sweden').match?.name, 'Sweden');
  assert.equal(matchTyped(s, none, 'SWEDEN ').match?.name, 'Sweden');
  assert.equal(matchTyped(s, none, 'swede').match, null);
  assert.equal(matchTyped(s, none, 'st lucia').match?.name, 'Saint Lucia');
  assert.equal(matchTyped(s, none, 'Swaziland').match, null, 'alias of an entry on another board');
  const e = board(set, 'e');
  assert.equal(matchTyped(e, none, 'swaziland').match?.name, 'Eswatini');
  const caps = board(buildCapitalSet(entities, attributes), 'n');
  assert.equal(matchTyped(caps, none, 'ndjamena').match?.name, "N'Djamena");
  const capsW = board(buildCapitalSet(entities, attributes), 'w');
  assert.equal(matchTyped(capsW, none, 'washington').match?.name, 'Washington, D.C.');
  const capsT = board(buildCapitalSet(entities, attributes, { territories: true }), 'e');
  assert.equal(matchTyped(capsT, none, 'el aaiun').match?.name, 'El Aaiún');
});

test('a found entry no longer matches, and a prefix of another answer is ambiguous', () => {
  const set = buildCountrySet(entities, aliases, { territories: false });
  const n = board(set, 'n');
  const r = matchTyped(n, new Set(), 'niger');
  assert.equal(r.match.name, 'Niger');
  assert.equal(r.ambiguous, true);
  const r2 = matchTyped(n, new Set(['Niger']), 'niger');
  assert.equal(r2.match, null);
  assert.equal(matchTyped(n, new Set(['Niger']), 'nigeria').match.name, 'Nigeria');
  assert.equal(matchTyped(n, new Set(), 'nigeria').ambiguous, false);
});

test('plain list sets work without knowing their contents', () => {
  const set = fromList([{ name: 'Texas' }, { name: 'Tennessee', aliases: ['TN'] }, { name: 'Utah' }]);
  assert.equal(board(set, 't').length, 2);
  assert.equal(matchTyped(board(set, 't'), new Set(), 'tn').match.name, 'Tennessee');
});

test('elapsed formatting', () => {
  assert.equal(formatElapsed(0), '0:00');
  assert.equal(formatElapsed(65_400), '1:05');
});

test('continent hint: one continent, short names, shared names list both', async () => {
  const { entryContinents } = await import('../js/names-sets.js');
  const ents = { se: { continent: 'Europe' }, jm: { continent: 'North America' }, nf: { continent: 'Oceania' } };
  assert.equal(entryContinents({ codes: ['se'] }, ents), 'Europe');
  assert.equal(entryContinents({ codes: ['jm'] }, ents), 'N. America');
  assert.equal(entryContinents({ codes: ['jm', 'nf'] }, ents), 'N. America / Oceania');
  assert.equal(entryContinents({ codes: ['xx'] }, ents), '');
});

test('countries with several capitals: each one is its own slot under its own letter', () => {
  const set = buildCapitalSet(entities, attributes, { territories: false });
  const byName = Object.fromEntries(set.map((e) => [e.name, e]));
  const want = {
    za: ['Pretoria', 'Cape Town', 'Bloemfontein'], bo: ['La Paz', 'Sucre'],
    lk: ['Colombo', 'Sri Jayawardenepura Kotte'], bj: ['Porto-Novo', 'Cotonou'],
    sz: ['Mbabane', 'Lobamba'], ci: ['Yamoussoukro', 'Abidjan'], bi: ['Gitega', 'Bujumbura'],
  };
  for (const [code, cities] of Object.entries(want)) {
    assert.deepEqual(attributes[code].capitals, cities, code);
    for (const c of cities) assert.ok(byName[c]?.codes.includes(code), `${c} on the board for ${code}`);
  }
  assert.equal(attributes[Object.keys(want)[0]].capital, 'Pretoria', 'the single capital the quiz uses is unchanged');
  assert.ok(byName['Sri Jayawardenepura Kotte'].forms.includes(canon('Sri Jayewardenepura Kotte')), 'Factbook spelling accepted');
  const src = readFileSync(new URL('../scripts/build-attributes.mjs', import.meta.url), 'utf8');
  assert.match(src, /lk: \['Colombo', 'Sri Jayawardenepura Kotte'\]/, 'the build script carries the list, not just the JSON');
});
