import test from 'node:test';
import assert from 'node:assert/strict';
import { makeQuizData } from '../../js/quiz/data.js';
import { loadRaw } from './fixtures.mjs';

const raw = loadRaw();

test('pool excludes aggregates and territories when off', () => {
  const qd = makeQuizData(raw, { territories: false });
  assert.ok(!qd.pool.includes('jg'));
  for (const c of qd.pool) assert.ok(!raw.entities[c].optional, c);
  assert.ok(qd.pool.includes('se'));
});

test('territories on adds optional entities', () => {
  const qd = makeQuizData(raw, { territories: true });
  assert.ok(qd.pool.some((c) => raw.entities[c].optional));
  assert.ok(!qd.pool.includes('jg'));
});

test('familiarity ranks big countries first', () => {
  const qd = makeQuizData(raw, { territories: false });
  assert.ok(qd.famRank('us') <= 5);
  assert.ok(qd.famRank('cn') <= 5);
  assert.ok(qd.famRank('tv') > 140);
  assert.ok(qd.familiar('de', 80));
});

test('values are pool-only and non-null', () => {
  const qd = makeQuizData(raw, { territories: false });
  const v = qd.values('population');
  assert.ok(v.length > 150);
  assert.ok(v.every(([c, x]) => qd.inPool(c) && typeof x === 'number'));
});
