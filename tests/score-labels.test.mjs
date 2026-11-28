import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDatasets } from '../js/datasets.js';
import { describeScore, formatScore, GROUP_ORDER } from '../js/score-labels.js';

before(async () => {
  globalThis.fetch = async (url) => ({ json: async () => JSON.parse(readFileSync(new URL(`../${url}`, import.meta.url))) });
  await loadDatasets();
});

const rec = { score: 420, counted: 7, total: 10, date: 0 };

// Every key a mode mints today, read back the way Your Scores always read it.
const CASES = [
  ['quiz-daily', 'Quiz', 'Daily Quiz', undefined, '420/500'],
  ['quiz-easy', 'Quiz', 'Random Quiz · Easy', undefined, '420/500'],
  ['quiz-hard', 'Quiz', 'Random Quiz · Hard', undefined, '420/500'],
  ['daily', 'Draw the World', 'Daily Challenge', undefined, '420/100'],
  ['quick3', 'Draw the World', 'Quick 3', undefined, '420/100'],
  ['quick', 'Draw the World', 'Quick 10', undefined, '420/100'],
  ['streak', 'Draw the World', 'Streak', undefined, '420 in a row'],
  ['countries-europe', 'Draw the World', 'Europe', 'region', '420/100'],
  ['countries-north-america', 'Draw the World', 'North America', 'region', '420/100'],
  ['rank-line-gdp-nominal', 'Rank the World', 'Total GDP', undefined, 'run of 420'],
  ['rank-line-retired-metric', 'Rank the World', 'retired-metric', undefined, 'run of 420'],
  ['flag-pie', 'Flags', 'Flag Pie', undefined, '420 pts'],
  ['flag-quiz-10', 'Flags', 'Flag Color Quiz', '10 rounds', '420 pts'],
  ['flag-picker-10', 'Flags', 'Flag Color Picker', '10 rounds', '420 pts'],
  ['topn2-gdp-nominal-world-hi-10-cards', 'Top 10 / Bottom 10', 'Top 10 · Total GDP', 'World · cards', '420/10'],
  ['topn2-gdp-per-capita-europe-lo-5-flags-hard', 'Top 10 / Bottom 10', 'Bottom 5 · GDP per capita', 'Europe · flags only · hard', '420/10'],
  ['topn2-population-south-america-hi-10-type', 'Top 10 / Bottom 10', 'Top 10 · Population', 'South America · typing', '420/10'],
  ['names-countries-s', 'Name Them All', 'Countries · S', undefined, '420/10'],
  ['names-capitals-b', 'Name Them All', 'Capitals · B', undefined, '420/10'],
  ['shape-easy', 'Guess the Shape', 'Outline · Mixed', undefined, '420/1000'],
  ['shape-hard-any', 'Guess the Shape', '12 × 12 · Anywhere', undefined, '420/1000'],
  ['shape-medium-known', 'Guess the Shape', '24 × 24 · Well known', undefined, '420/1000'],
  ['shape-nonsense', 'Older rounds', 'shape-nonsense', 'from an earlier version', '420'],
  ['some-retired-mode', 'Older rounds', 'some-retired-mode', 'from an earlier version', '420'],
];

test('every current key reads back to its group, label, detail and format', () => {
  for (const [key, group, label, detail, best] of CASES) {
    const d = describeScore(key);
    assert.deepEqual({ group: d.group, label: d.label, detail: d.detail }, { group, label, detail }, key);
    assert.equal(formatScore(key, rec), best, key);
    assert.ok(GROUP_ORDER.includes(d.group), key);
  }
});

test('a Name Them All record with a time shows it', () => {
  assert.match(formatScore('names-countries-s', { score: 9, total: 12, ms: 65000 }), /^9\/12 in /);
});
