import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuizData } from '../../js/quiz/data.js';
import { fmtLat } from '../../js/quiz/geo.js';
import * as north from '../../js/quiz/generators/north.js';
import * as emblem from '../../js/quiz/generators/emblem.js';
import * as flag from '../../js/quiz/generators/flag.js';
import { loadRaw } from './fixtures.mjs';
import { sweep } from './helpers.mjs';

const raw = loadRaw();
const qd = makeQuizData(raw, { territories: false });

test('north asks about the northernmost point and shows it', () => {
  const { out } = sweep(north.generate, qd);
  for (const { q } of out) {
    assert.match(q.prompt, /northernmost point/);
    q.choices.forEach((c, i) => assert.equal(q.figures[i], fmtLat(raw.geo[c.code].north)));
  }
});

test('emblem: every option has a coat of arms to show afterwards', () => {
  const { out } = sweep(emblem.generate, qd);
  for (const { q } of out) {
    assert.equal(q.pictures, 'emblem');
    for (const c of q.choices) assert.ok(raw.emblems[c.code], c.code);
  }
});

test('flag: flags are pictures shown after answering', () => {
  const { out } = sweep(flag.generate, qd, { seeds: 5 });
  for (const { q } of out) { assert.equal(q.pictures, 'flag'); assert.equal(q.flags, undefined); }
});

test('combo reads as a sentence', async () => {
  const combo = await import('../../js/quiz/generators/combo.js');
  const { out } = sweep(combo.generate, qd, { seeds: 20 });
  for (const { q } of out) assert.match(q.prompt, /^Do .+ and .+ together (have|export) .+ than .+\?$/, q.prompt);
});
